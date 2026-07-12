/**
 * Connect-resilience regression tests for the "8 dialogs from 8 commands" bug:
 * every command that arrived while the proxy was disconnected used to start its
 * own fresh CDP WebSocket connect — each connect attempt makes Chrome show a new
 * "Allow remote debugging?" dialog, so N queued commands meant N dialogs.
 *
 * Two behaviors are exercised against the REAL proxy.ts (spawned as a foreground
 * daemon) over its real Unix socket, using fake in-process CDP servers — no real
 * Chrome, no real dialogs:
 *
 *  1. Single-flight: several commands that arrive while a connect is already in
 *     progress must share that one attempt — never open a second upstream
 *     WebSocket connection while the first is still pending.
 *  2. Failure backoff: once a connect attempt fails, commands arriving inside the
 *     cooldown window must fail fast with the actionable "not approved yet"
 *     message and must NOT trigger another upstream connect attempt. After the
 *     cooldown elapses, the next command must transparently reconnect and
 *     succeed (the existing healthy-case auto-reconnect behavior).
 *
 * Run: node --test scripts/test/connect-resilience.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ProxyClient } from '../lib/proxy-client.ts';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = path.join(SCRIPTS_DIR, 'proxy.ts');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ── Minimal WebSocket framing (server side) — copied from reconnect.test.ts ─────
function encodeTextFrame(str: string): Buffer {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header: Buffer;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(buf: Buffer): { texts: string[]; closed: boolean; rest: Buffer } {
  const texts: string[] = [];
  let closed = false;
  let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off];
    const b1 = buf[off + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = off + 2;
    if (len === 126) { if (buf.length - off < 4) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (buf.length - off < 10) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mask: Buffer | null = null;
    if (masked) { if (buf.length - p < 4) break; mask = buf.subarray(p, p + 4); p += 4; }
    if (buf.length - p < len) break;
    const payload = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    if (opcode === 0x8) closed = true;
    else if (opcode === 0x1) texts.push(payload.toString('utf8'));
    off = p + len;
  }
  return { texts, closed, rest: buf.subarray(off) };
}

interface DelayedFakeCdp {
  port: number;
  wsPath: string;
  upgradeCount: () => number;
  close: () => Promise<void>;
}

/**
 * A fake CDP WebSocket server whose upgrade handshake response is delayed by
 * `upgradeDelayMs` — this keeps a client's WebSocket 'open' event (and thus
 * proxy.ts's `connecting` promise) pending for a controllable window, wide
 * enough to fire several concurrent client commands into that window and
 * prove only ONE upstream connection is ever attempted.
 */
function startDelayedFakeCdp(upgradeDelayMs: number): Promise<DelayedFakeCdp> {
  const sockets = new Set<net.Socket>();
  let upgrades = 0;
  const server = http.createServer();
  server.on('upgrade', (req, socket: net.Socket) => {
    upgrades++;
    const key = req.headers['sec-websocket-key'] as string;
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    setTimeout(() => {
      if (socket.destroyed) return;
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
      sockets.add(socket);
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const { texts, closed, rest } = decodeFrames(buf);
        buf = rest;
        for (const t of texts) {
          let msg: any;
          try { msg = JSON.parse(t); } catch { continue; }
          if (typeof msg.id !== 'number') continue;
          const result = msg.method === 'Browser.getVersion'
            ? { protocolVersion: '1.3', product: 'FakeChrome-delayed' }
            : { ok: true, method: msg.method };
          socket.write(encodeTextFrame(JSON.stringify({ id: msg.id, result })));
        }
        if (closed) socket.destroy();
      });
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
    }, upgradeDelayMs);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        wsPath: '/devtools/browser/fake-delayed',
        upgradeCount: () => upgrades,
        close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
      });
    });
  });
}

/** A server that accepts the TCP connection then immediately resets it — makes any
 *  WebSocket connect attempt against it fail fast (client 'error' event, no 5min wait). */
function startRejectingServer(): Promise<{ port: number; connectionCount: () => number; close: () => Promise<void> }> {
  let connections = 0;
  const server = net.createServer((socket) => {
    connections++;
    socket.destroy();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, connectionCount: () => connections, close: () => new Promise<void>((r) => server.close(() => r())) });
    });
  });
}

function writePortFile(udd: string, fake: { port: number; wsPath: string }): void {
  fs.writeFileSync(path.join(udd, 'DevToolsActivePort'), `${fake.port}\n${fake.wsPath}\n`);
}

async function waitForSocket(sockPath: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.createConnection({ path: sockPath });
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`proxy socket not up: ${sockPath}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('single-flight: N concurrent commands while disconnected trigger exactly ONE upstream connect', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-singleflight-'));
  const sockPath = path.join(udd, 'proxy.sock');
  // Delay the handshake well past the time it takes to fire off several
  // concurrent commands, so they all land while `connecting` is still pending.
  const fake = await startDelayedFakeCdp(800);
  writePortFile(udd, fake);

  let proxy: ChildProcess | undefined;
  const clients: ProxyClient[] = [];
  t.after(async () => {
    for (const c of clients) { try { c.close(); } catch { /* ignore */ } }
    try { proxy?.kill('SIGKILL'); } catch { /* ignore */ }
    try { await fake.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: sockPath,
      CHROME_USE_USER_DATA_DIR: udd,
    },
    stdio: 'ignore',
  });
  await waitForSocket(sockPath);
  // proxy.ts's main() eagerly calls ensureConnected() right after the socket
  // comes up — that eager attempt is itself in-flight against the delayed
  // handshake, so commands fired now land squarely inside the pending window.

  const N = 5;
  const sends = await Promise.all(
    Array.from({ length: N }, async () => {
      const c = await ProxyClient.open(sockPath, 15_000);
      clients.push(c);
      return c.send<any>('Browser.getVersion');
    }),
  );

  for (const r of sends) assert.equal(r.product, 'FakeChrome-delayed', 'every concurrent command must resolve via the shared connection');
  assert.equal(fake.upgradeCount(), 1, 'exactly one upstream WebSocket connect attempt must have been made — one dialog, not N');
});

test('failure backoff: cooldown rejects fast without a new connect attempt, then reconnects once it elapses', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-backoff-'));
  const sockPath = path.join(udd, 'proxy.sock');
  const rejecting = await startRejectingServer();
  writePortFile(udd, { port: rejecting.port, wsPath: '/devtools/browser/fake-reject' });

  const cooldownMs = 2000;
  let proxy: ChildProcess | undefined;
  const clients: ProxyClient[] = [];
  const realCdp: { s?: DelayedFakeCdp } = {};
  t.after(async () => {
    for (const c of clients) { try { c.close(); } catch { /* ignore */ } }
    try { proxy?.kill('SIGKILL'); } catch { /* ignore */ }
    try { await rejecting.close(); } catch { /* ignore */ }
    try { await realCdp.s?.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: sockPath,
      CHROME_USE_USER_DATA_DIR: udd,
      CHROME_USE_RECONNECT_COOLDOWN_MS: String(cooldownMs),
    },
    stdio: 'ignore',
  });
  await waitForSocket(sockPath);
  // Let the eager startup connect attempt fail against the rejecting server —
  // this is what starts the cooldown window.
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(rejecting.connectionCount() >= 1, 'the eager startup connect must have attempted (and failed) against the fake endpoint');
  const connectionsAfterFailure = rejecting.connectionCount();

  const c1 = await ProxyClient.open(sockPath, 5000);
  clients.push(c1);
  await assert.rejects(
    c1.send<any>('Browser.getVersion'),
    (err: Error) => {
      assert.match(err.message, /Chrome debugging not approved yet/);
      assert.match(err.message, /next connect attempt allowed in \d+s/);
      return true;
    },
    'a command inside the cooldown window must fail fast with the actionable message',
  );

  const c2 = await ProxyClient.open(sockPath, 5000);
  clients.push(c2);
  await assert.rejects(c2.send<any>('Browser.getVersion'), /Chrome debugging not approved yet/, 'a second command inside the same window must also fail fast');

  assert.equal(
    rejecting.connectionCount(),
    connectionsAfterFailure,
    'no new upstream connect attempt must have been made while cooling down — that would mean a second dialog',
  );

  // Once the cooldown elapses, point DevToolsActivePort at a real (fast) fake
  // server and confirm the next command transparently reconnects and succeeds —
  // the existing healthy-case auto-reconnect behavior must survive the backoff.
  await new Promise((r) => setTimeout(r, cooldownMs));
  const healthy = await startDelayedFakeCdp(0);
  realCdp.s = healthy;
  writePortFile(udd, healthy);

  const c3 = await ProxyClient.open(sockPath, 5000);
  clients.push(c3);
  const r3 = await c3.send<any>('Browser.getVersion');
  assert.equal(r3.product, 'FakeChrome-delayed', 'after the cooldown elapses, the next command must reconnect and succeed');
});
