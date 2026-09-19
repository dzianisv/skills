/**
 * Connect-resilience regression tests for the "8 dialogs from 8 commands" bug:
 * every command that arrived while the proxy was disconnected used to start its
 * own fresh CDP WebSocket connect, so N queued commands meant N connects (and,
 * on an UNAPPROVED Chrome, N "Allow remote debugging?" dialogs).
 *
 * Note what is and is not true about that dialog. Chrome asks ONCE per browser
 * session, at the point approval is still missing; once a running Chrome has been
 * approved, further browser-level connections to its DevToolsActivePort endpoint
 * are accepted silently (measured 2026-09-19: fresh connect + Browser.getVersion
 * in ~1.4s, no dialog, Chrome 152). So the thing worth preventing is a STORM of
 * simultaneous connects while approval is still pending — not reconnection itself.
 *
 * Three behaviors are exercised against the REAL proxy.ts (spawned as a foreground
 * daemon) over its real Unix socket, using fake in-process CDP servers — no real
 * Chrome, no real dialogs:
 *
 *  1. Single-flight: several commands that arrive while a connect is already in
 *     progress must share that one attempt — never open a second upstream
 *     WebSocket connection while the first is still pending.
 *  2. A connect that FAILS FAST (Chrome closed / refusing) is not fatal: the proxy
 *     stays unlatched, retries in the background, and serves commands as soon as
 *     Chrome comes back — no human, no restart.
 *  3. A connect that STALLS to its full timeout IS the approval-dialog signature,
 *     and MAX_APPROVAL_STALLS consecutive stalls still latch the proxy closed so
 *     it stops queueing dialogs at a user who is not answering.
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
    // Track immediately: a delayed handshake may still be pending when test
    // cleanup begins, and server.close() waits for that socket otherwise.
    sockets.add(socket);
    const key = req.headers['sec-websocket-key'] as string;
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    setTimeout(() => {
      if (socket.destroyed) return;
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
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

interface StallableFakeCdp {
  port: number;
  wsPath: string;
  upgradeCount: () => number;
  /** Stop completing the WebSocket handshake: the exact shape of an unanswered
   *  "Allow remote debugging?" dialog — TCP accepted, handshake never finishes. */
  stall: () => void;
  dropAll: () => void;
  close: () => Promise<void>;
}

/**
 * A fake CDP server that starts healthy and can be switched to stalling. The
 * healthy phase matters: proxy.ts gives the FIRST connect of its life the full
 * 5-minute CONNECT_TIMEOUT_MS (a human may be walking over to click Allow), and
 * only uses the short RECONNECT_CONNECT_TIMEOUT_MS once it has connected at least
 * once. So the approval-stall path is only reachable after one healthy connect.
 */
function startStallableFakeCdp(): Promise<StallableFakeCdp> {
  const sockets = new Set<net.Socket>();
  let upgrades = 0;
  let stalling = false;
  const server = http.createServer();
  server.on('upgrade', (req, socket: net.Socket) => {
    upgrades++;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    if (stalling) return; // never write the 101 — the client waits out its timeout
    const key = req.headers['sec-websocket-key'] as string;
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
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
          ? { protocolVersion: '1.3', product: 'FakeChrome-stallable' }
          : { ok: true, method: msg.method };
        socket.write(encodeTextFrame(JSON.stringify({ id: msg.id, result })));
      }
      if (closed) socket.destroy();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        wsPath: '/devtools/browser/fake-stallable',
        upgradeCount: () => upgrades,
        stall: () => { stalling = true; },
        dropAll: () => { for (const s of sockets) s.destroy(); sockets.clear(); },
        close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
      });
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
      CHROME_USE_TEST_USER_DATA_DIR: udd,
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

/**
 * A fast-failing connect (Chrome closed, port refusing) is NOT the approval case
 * and must not latch the proxy. It used to: one refused connect set
 * `connectionBlocked` forever, so every session on the machine lost browser
 * automation until a human killed the proxy — the very restart the policy claimed
 * to prevent. The proxy now retries in the background and picks Chrome up the
 * moment it returns, with no dialog (approval is per browser session, verified
 * empirically against an already-approved Chrome 152).
 */
test('a connect that fails fast is retried in the background, and recovers when Chrome returns', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-backoff-'));
  const sockPath = path.join(udd, 'proxy.sock');
  const rejecting = await startRejectingServer();
  writePortFile(udd, { port: rejecting.port, wsPath: '/devtools/browser/fake-reject' });
  // Stood up now, pointed at later: this is "Chrome comes back" for the proxy.
  const healthy = await startDelayedFakeCdp(0);

  let proxy: ChildProcess | undefined;
  const clients: ProxyClient[] = [];
  t.after(async () => {
    for (const c of clients) { try { c.close(); } catch { /* ignore */ } }
    try { proxy?.kill('SIGKILL'); } catch { /* ignore */ }
    try { await rejecting.close(); } catch { /* ignore */ }
    try { await healthy.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: sockPath,
      CHROME_USE_TEST_USER_DATA_DIR: udd,
    },
    stdio: 'ignore',
  });
  await waitForSocket(sockPath);
  // Let the eager startup connection fail against the rejecting server.
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(rejecting.connectionCount() >= 1, 'the eager startup connect must have attempted (and failed) against the fake endpoint');

  const c1 = await ProxyClient.open(sockPath, 5000);
  clients.push(c1);
  await assert.rejects(
    c1.send<any>('Browser.getVersion'),
    (err: Error) => {
      // The command fails — Chrome really is unreachable — but NOT with the
      // terminal "a human must approve" verdict, which would strand every session.
      assert.doesNotMatch(err.message, /will not open another remote-debugging dialog/);
      return true;
    },
    'a command while Chrome is unreachable must fail for this request only',
  );

  const blockedCheck = await c1.send<any>('__status');
  assert.equal(blockedCheck.connectionBlocked, null, 'an unreachable Chrome must never latch the proxy closed');
  assert.equal(blockedCheck.reconnecting, true, '__status must advertise that recovery is in progress');
  assert.ok(blockedCheck.reconnectAttempt >= 1, 'the backoff loop must be armed');

  // Chrome comes back — on a new port, as a restarted Chrome would.
  writePortFile(udd, healthy);

  let product: string | undefined;
  const deadline = Date.now() + 15_000;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      product = (await c1.send<any>('Browser.getVersion')).product;
      break;
    } catch (err: any) {
      lastErr = String(err?.message ?? err);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  assert.equal(product, 'FakeChrome-delayed', `the proxy must self-heal once Chrome is reachable (last error: ${lastErr})`);
});

/**
 * The one case automatic recovery cannot fix, and therefore the ONLY case that
 * still latches the proxy: Chrome accepts TCP but never completes the handshake.
 * That is the signature of an "Allow remote debugging?" dialog sitting unanswered,
 * so retrying just queues more dialogs at a user who is not there. After
 * MAX_APPROVAL_STALLS (2) consecutive stalls the proxy gives up and fails every
 * later command fast, until a human resolves it.
 *
 * The proxy must connect successfully FIRST: the very first connect of a proxy's
 * life gets the full 5-minute CONNECT_TIMEOUT_MS (a human may be on their way to
 * click Allow), and only later attempts use the short, test-shortened
 * CHROME_USE_RECONNECT_TIMEOUT_MS that makes stalling observable here.
 */
test('repeated approval stalls (handshake never completes) still latch the proxy closed', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-approval-timeout-'));
  const sockPath = path.join(udd, 'proxy.sock');
  const fake = await startStallableFakeCdp();
  writePortFile(udd, fake);
  let proxy: ChildProcess | undefined;
  const clients: ProxyClient[] = [];
  t.after(async () => {
    for (const client of clients) { try { client.close(); } catch { /* ignore */ } }
    try { proxy?.kill('SIGKILL'); } catch { /* ignore */ }
    try { await fake.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: sockPath,
      CHROME_USE_TEST_USER_DATA_DIR: udd,
      // Short reconnect deadline so a stall is reached in ms, not 15s.
      CHROME_USE_RECONNECT_TIMEOUT_MS: '400',
      // The heartbeat must not contribute attempts of its own.
      CHROME_USE_KEEPALIVE_MS: '100000',
    },
    stdio: 'ignore',
  });
  await waitForSocket(sockPath);

  const client = await ProxyClient.open(sockPath, 15_000);
  clients.push(client);
  assert.equal(
    (await client.send<any>('Browser.getVersion')).product,
    'FakeChrome-stallable',
    'approval must be granted once before the reconnect path is reachable',
  );

  // Approval is now "revoked": the handshake never completes again.
  fake.stall();
  fake.dropAll();

  // Two stalled attempts (~400ms each, 500ms then 1000ms apart) must latch it.
  let status: any;
  const deadline = Date.now() + 20_000;
  for (;;) {
    status = await client.send<any>('__status');
    if (status.connectionBlocked) break;
    if (Date.now() > deadline) throw new Error(`proxy never latched closed; last status: ${JSON.stringify(status)}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.match(
    String(status.connectionBlocked),
    /approval dialog is likely unanswered/i,
    'the latch reason must name the one condition a human has to resolve',
  );
  assert.equal(status.reconnecting, false, 'a latched proxy must stop advertising recovery');

  const upgradesWhenBlocked = fake.upgradeCount();
  assert.ok(upgradesWhenBlocked >= 2, `MAX_APPROVAL_STALLS attempts must have been made (saw ${upgradesWhenBlocked})`);

  for (let i = 0; i < 3; i++) {
    const c = await ProxyClient.open(sockPath, 5_000);
    clients.push(c);
    await assert.rejects(c.send<any>('Browser.getVersion'), /will not open another remote-debugging dialog/);
  }
  assert.equal(
    fake.upgradeCount(),
    upgradesWhenBlocked,
    'once latched, commands must fail fast without queueing another approval dialog',
  );
});
