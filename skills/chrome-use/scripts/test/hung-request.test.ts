/**
 * Regression tests for the "one hung page request kills the shared proxy" bug.
 *
 * Observed in production (2026-08-14): a best-effort per-target command
 * (`Emulation.setFocusEmulationEnabled`) was never answered by one target. The
 * proxy's request timeout fired, the proxy treated that as a dead CDP connection,
 * latched `connectionBlocked`, and every browser session on the machine then
 * needed a human to kill the proxy and physically click Chrome's native
 * "Allow remote debugging?" dialog to get automation back.
 *
 * Correct behavior:
 *  1. A request that hangs while the BROWSER-level connection still answers must
 *     fail only that request. The proxy stays connected and usable.
 *  2. A request that hangs because the connection really is dead (browser-level
 *     probe also unanswered) must drop that dead handle and reconnect in the
 *     background, returning a retryable error. It must NOT latch the proxy closed:
 *     reconnecting to an already-approved running Chrome raises no dialog at all
 *     (measured 2026-09-19 — approval is per browser session, not per debugger
 *     client), so failing closed only stranded every session behind a manual kill.
 *
 * Both run against the REAL proxy.ts over its real Unix socket with a fake
 * in-process CDP server — no real Chrome, no real dialogs.
 *
 * Run: node --test scripts/test/hung-request.test.ts
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

const HANGING_METHOD = 'Emulation.setFocusEmulationEnabled';

// ── Minimal WebSocket framing (server side) ────────────────────────────────────
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

interface FakeCdp {
  port: number;
  wsPath: string;
  /** Stop answering EVERYTHING, including browser-level Browser.getVersion. */
  goDark: () => void;
  /** Start answering again — lets us prove the proxy recovers on its own. */
  lightUp: () => void;
  close: () => Promise<void>;
}

/**
 * Fake CDP server that answers everything EXCEPT `HANGING_METHOD`, which it
 * silently swallows — exactly how the real target behaved. `goDark()` makes it
 * swallow every subsequent request, simulating a genuinely dead connection whose
 * socket is still open.
 */
function startPartiallyHangingCdp(): Promise<FakeCdp> {
  const sockets = new Set<net.Socket>();
  let dark = false;
  const server = http.createServer();
  server.on('upgrade', (req, socket: net.Socket) => {
    sockets.add(socket);
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
        if (dark || msg.method === HANGING_METHOD) continue; // never answer
        const result = msg.method === 'Browser.getVersion'
          ? { protocolVersion: '1.3', product: 'FakeChrome-hang' }
          : { ok: true, method: msg.method };
        socket.write(encodeTextFrame(JSON.stringify({ id: msg.id, result })));
      }
      if (closed) socket.destroy();
    });
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        wsPath: '/devtools/browser/fake-hang',
        goDark: () => { dark = true; },
        lightUp: () => { dark = false; },
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

async function expectRejection(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err: any) {
    return String(err?.message ?? err);
  }
  throw new Error('expected the request to reject, but it resolved');
}

interface Harness {
  client: ProxyClient;
  fake: FakeCdp;
}

async function startHarness(t: any, prefix: string): Promise<Harness> {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const sockPath = path.join(udd, 'proxy.sock');
  const fake = await startPartiallyHangingCdp();
  writePortFile(udd, fake);

  let proxy: ChildProcess | undefined;
  let client: ProxyClient | undefined;
  t.after(async () => {
    try { client?.close(); } catch { /* ignore */ }
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
      // Keep the test fast: short request deadline and short liveness probe.
      CHROME_USE_REQUEST_TIMEOUT_MS: '600',
      CHROME_USE_LIVENESS_PROBE_MS: '600',
      CHROME_USE_KEEPALIVE_MS: '100000',
    },
    stdio: 'ignore',
  });
  await waitForSocket(sockPath);
  client = await ProxyClient.open(sockPath, 15_000);
  // Prove the connection is up before the hung request.
  const v = await client.send<any>('Browser.getVersion');
  assert.equal(v.product, 'FakeChrome-hang', 'harness must start from a healthy connection');
  return { client, fake };
}

test('a hung request does NOT block the proxy while the CDP connection still answers', async (t) => {
  const { client } = await startHarness(t, 'cu-hung-alive-');

  const message = await expectRejection(client.send(HANGING_METHOD, { enabled: true }, 'fake-session'));
  assert.match(message, /timed out/, 'the hung request itself must fail');
  assert.match(
    message,
    /connection still healthy/,
    'the proxy must report the connection as healthy instead of latching closed',
  );

  // The whole point: the NEXT command still works. No dialog, no human, no kill.
  const after = await client.send<any>('Browser.getVersion');
  assert.equal(after.product, 'FakeChrome-hang', 'proxy must remain usable after one hung request');

  const status = await client.send<any>('__status');
  assert.equal(status.connected, true, 'proxy must still be connected');
  assert.equal(status.connectionBlocked, null, 'proxy must NOT be latched closed by one hung request');
});

/**
 * The mirror case: the request hangs AND the browser-level probe also goes
 * unanswered, so the connection really is dead. The proxy must drop that dead
 * handle — but it must NOT latch closed. This test previously asserted the
 * opposite ("must latch closed rather than silently reconnecting into a new
 * native dialog"); that rationale was measured on 2026-09-19 and is false.
 * Reconnecting to an already-approved, running Chrome raises no dialog at all
 * (fresh connect + Browser.getVersion in ~1.4s against Chrome 152) because
 * approval is granted per browser session, not per debugger client. Latching here
 * simply stranded every session on the machine behind a manual proxy kill.
 */
test('a hung request on a dead connection drops it and self-heals — it does NOT latch the proxy closed', async (t) => {
  const { client, fake } = await startHarness(t, 'cu-hung-dead-');

  fake.goDark(); // browser-level probe will now hang too
  const message = await expectRejection(client.send(HANGING_METHOD, { enabled: true }, 'fake-session'));
  assert.match(message, /timed out/, 'the hung request itself must still fail');
  assert.match(
    message,
    /reconnecting automatically/,
    'the caller must be told this is retryable, not told to go kill the proxy',
  );

  const status = await client.send<any>('__status');
  assert.equal(status.connected, false, 'a dead connection must be dropped');
  assert.equal(status.connectionBlocked, null, 'a dead socket is a reconnect case, not a human-approval case');
  assert.equal(status.reconnecting, true, '__status must advertise that recovery is in progress');

  // Chrome starts answering again; the proxy must recover with no restart and no
  // human. Retry because the reconnect may land a moment after the probe failed.
  fake.lightUp();
  let product: string | undefined;
  const deadline = Date.now() + 15_000;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      product = (await client.send<any>('Browser.getVersion')).product;
      break;
    } catch (err: any) {
      lastErr = String(err?.message ?? err);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.equal(product, 'FakeChrome-hang', `the proxy must serve commands again once Chrome answers (last error: ${lastErr})`);
  assert.equal(
    (await client.send<any>('__status')).connectionBlocked,
    null,
    'nothing in this sequence may ever latch the shared proxy closed',
  );
});

test('a client-supplied shorter timeout is honored and never exceeds the global cap', async (t) => {
  const { client } = await startHarness(t, 'cu-hung-short-');

  const started = Date.now();
  // 150ms deadline on a method the server never answers.
  const message = await expectRejection(client.send(HANGING_METHOD, { enabled: true }, 'fake-session', 150));
  const elapsed = Date.now() - started;
  assert.match(message, /timed out/);
  assert.ok(elapsed < 550, `short deadline must apply (took ${elapsed}ms, proxy default is 600ms)`);

  const after = await client.send<any>('Browser.getVersion');
  assert.equal(after.product, 'FakeChrome-hang', 'proxy stays usable');
});
