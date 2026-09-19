/**
 * A dropped CDP socket MUST be reconnected automatically.
 *
 * This file used to assert the opposite ("a dropped socket never auto-reconnects"),
 * on the theory that every new CDP connection re-triggers Chrome's native
 * "Allow remote debugging?" dialog. That theory was measured on 2026-09-19 and is
 * FALSE: against an already-approved running Chrome 152, a brand new browser-level
 * connection to the DevToolsActivePort endpoint completed its handshake plus
 * `Browser.getVersion` in ~1.4s with no dialog at all. Approval is granted per
 * BROWSER SESSION, not per debugger client.
 *
 * Failing closed was therefore strictly harmful: one transient drop bricked browser
 * automation machine-wide for every session, and the only documented recovery was
 * for a human to kill the proxy — exactly the disruptive restart the policy claimed
 * to avoid. So the invariants pinned here are now:
 *
 *   1. keepalive reuses the ONE existing socket (no connection churn while healthy);
 *   2. a dropped socket self-heals — the same proxy process reconnects and serves
 *      the next command, without `connectionBlocked` ever being set;
 *   3. recovery is single-flight and backed off — an outage must not turn into a
 *      tight loop of CDP connections (that WOULD be abusive, dialog or not);
 *   4. the heartbeat detects a HALF-OPEN connection (TCP up, Chrome silent) within
 *      about KEEPALIVE_MS + LIVENESS_PROBE_MS, instead of leaving a dead handle
 *      cached until some user command trips over it.
 *
 * Real sockets, no real Chrome: a minimal in-process CDP WebSocket server stands in
 * for Chrome. The ACTUAL proxy.ts is spawned and driven over its Unix socket via the
 * real ProxyClient. Fully isolated (CHROME_USE_TEST_USER_DATA_DIR + a non-default
 * CHROME_USE_SOCKET), so the real machine-wide proxy is never touched.
 *
 * Run: node --test scripts/test/reconnect.test.ts
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

// ── Minimal WebSocket framing (server side) ──────────────────────────────────────
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

/** Parse as many complete client frames as `buf` holds. Returns texts + leftover. */
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
    if (buf.length - p < len) break; // incomplete payload
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
  dropAll: () => void;
  close: () => Promise<void>;
  getVersionCount: () => number;
  /** Number of WebSocket upgrades accepted — i.e. CDP connections opened to us. */
  upgradeCount: () => number;
  /** Go silent without closing the socket: simulates a half-open Chrome. */
  goDark: () => void;
}

/** Start a minimal CDP-speaking WebSocket server on an ephemeral port. */
function startFakeCdp(productLabel: string): Promise<FakeCdp> {
  const sockets = new Set<net.Socket>();
  let versionCount = 0;
  let upgrades = 0;
  let dark = false;
  const server = http.createServer();
  server.on('upgrade', (req, socket: net.Socket) => {
    upgrades++;
    const key = req.headers['sec-websocket-key'] as string;
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
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
        // Half-open: keep the TCP socket wide open, just never answer again.
        if (dark) continue;
        let result: unknown;
        if (msg.method === 'Browser.getVersion') {
          versionCount++;
          result = { protocolVersion: '1.3', product: productLabel };
        } else {
          result = { ok: true, method: msg.method };
        }
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
        wsPath: `/devtools/browser/fake-${productLabel}`,
        dropAll: () => { for (const s of sockets) s.destroy(); sockets.clear(); },
        getVersionCount: () => versionCount,
        upgradeCount: () => upgrades,
        goDark: () => { dark = true; },
        close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
      });
    });
  });
}

function writePortFile(udd: string, fake: { port: number; wsPath: string }): void {
  fs.writeFileSync(path.join(udd, 'DevToolsActivePort'), `${fake.port}\n${fake.wsPath}\n`);
}

/**
 * A server that accepts the TCP connection and immediately resets it, so every
 * CDP connect attempt against it fails FAST (no stall). Counts attempts, which is
 * how we observe the proxy's reconnect pacing.
 */
function startRefusingServer(): Promise<{ port: number; connectionCount: () => number; close: () => Promise<void> }> {
  let connections = 0;
  const server = net.createServer((socket) => {
    connections++;
    socket.destroy();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        connectionCount: () => connections,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
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


/** Poll `__status` until `pred` holds, or throw. Returns elapsed ms. */
async function waitForStatus(
  client: ProxyClient,
  pred: (s: any) => boolean,
  timeoutMs: number,
  what: string,
): Promise<{ status: any; elapsed: number }> {
  const started = Date.now();
  let last: any;
  while (Date.now() - started < timeoutMs) {
    last = await client.send<any>('__status');
    if (pred(last)) return { status: last, elapsed: Date.now() - started };
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timed out waiting for ${what}; last status: ${JSON.stringify(last)}`);
}

interface Spawned {
  proxy: ChildProcess;
  client: ProxyClient;
  sockPath: string;
  udd: string;
}

/** Spawn the REAL proxy on an isolated socket pointed at a fake CDP endpoint. */
async function spawnProxy(t: any, prefix: string, env: Record<string, string>, fake: { port: number; wsPath: string }): Promise<Spawned> {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const sockPath = path.join(udd, 'proxy.sock');
  writePortFile(udd, fake);

  const proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: sockPath,
      CHROME_USE_TEST_USER_DATA_DIR: udd,
      ...env,
    },
    stdio: 'ignore',
  });
  let client: ProxyClient | undefined;
  t.after(() => {
    try { client?.close(); } catch { /* ignore */ }
    try { proxy.kill('SIGKILL'); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  await waitForSocket(sockPath);
  client = await ProxyClient.open(sockPath, 15_000);
  return { proxy, client, sockPath, udd };
}

/**
 * Invariants 1 + 2: while healthy the keepalive reuses the single existing CDP
 * socket, and when that socket drops the SAME proxy process transparently
 * reconnects — including to a Chrome that came back on a new port, exactly as a
 * restarted Chrome rewrites DevToolsActivePort.
 *
 * Reconnecting is safe (and was previously refused for a falsified reason):
 * Chrome's remote-debugging approval is granted per browser session, not per
 * debugger client, so opening a second connection to an already-approved Chrome
 * raises no dialog — measured at ~1.4s, dialog-free, against Chrome 152.
 */
test('keepalive reuses one socket, and a dropped CDP socket auto-reconnects in the same proxy', async (t) => {
  const server1 = await startFakeCdp('FakeChrome-1');
  const server2Ref: { s?: FakeCdp } = {};
  t.after(async () => {
    try { await server1.close(); } catch { /* ignore */ }
    try { await server2Ref.s?.close(); } catch { /* ignore */ }
  });

  const { client, udd } = await spawnProxy(t, 'cu-reconnect-', { CHROME_USE_KEEPALIVE_MS: '50' }, server1);

  // 1) First command connects through the proxy to server1.
  const r1 = await client.send<any>('Browser.getVersion');
  assert.equal(r1.product, 'FakeChrome-1', 'first command should reach server1');
  const pidBefore = (await client.send<any>('__status')).pid as number;
  assert.equal(typeof pidBefore, 'number');

  // Poll instead of sleeping a fixed 150ms: under parallel test load the 50ms
  // keepalive tick can slip past a fixed window and flake the whole suite.
  const beforeKeepalive = server1.getVersionCount();
  const keepaliveDeadline = Date.now() + 5_000;
  while (server1.getVersionCount() <= beforeKeepalive && Date.now() < keepaliveDeadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.ok(server1.getVersionCount() > beforeKeepalive, 'keepalive must reuse the original CDP socket');
  assert.equal(server1.upgradeCount(), 1, 'a healthy connection must never be re-dialled by the keepalive');

  // 2) Drop the CDP socket (as a Chrome restart / idle close would) and bring the
  //    browser back on a NEW port, rewriting DevToolsActivePort just like Chrome does.
  server1.dropAll();
  const server2 = await startFakeCdp('FakeChrome-2');
  server2Ref.s = server2;
  writePortFile(udd, server2);

  // 3) The proxy must self-heal. A command may legitimately fail once (the drop
  //    races the in-flight request and we deliberately never replay a request that
  //    may already have executed), so retry until the reconnect lands.
  let product: string | undefined;
  const recoverDeadline = Date.now() + 15_000;
  let lastErr = '';
  while (Date.now() < recoverDeadline) {
    try {
      product = (await client.send<any>('Browser.getVersion')).product;
      break;
    } catch (err: any) {
      lastErr = String(err?.message ?? err);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.equal(product, 'FakeChrome-2', `proxy must reconnect to the restarted browser (last error: ${lastErr})`);
  assert.ok(server2.getVersionCount() > 0, 'the fresh endpoint must have been dialled automatically');

  const after = await client.send<any>('__status');
  assert.equal(after.connected, true, 'proxy must report a live connection after self-healing');
  assert.equal(after.connectionBlocked, null, 'a plain socket drop must never latch the proxy closed');
  assert.equal(after.pid, pidBefore, 'recovery must happen IN the running proxy — no restart, no new approval');
});

/**
 * Invariant 3: recovery must be paced. Auto-reconnect is only defensible if it
 * cannot degenerate into a connect storm against Chrome, so we assert on the
 * connection count the fake endpoint actually observes:
 *   - N concurrent commands during an outage share ONE connect attempt
 *     (ensureConnected is single-flight), not N;
 *   - an idle outage retries on exponential backoff (500ms doubling to 30s), so a
 *     multi-second window sees a handful of attempts, never a tight loop.
 */
test('reconnect is single-flight and exponentially backed off — an outage never becomes a connect storm', async (t) => {
  const healthy = await startFakeCdp('FakeChrome-pace');
  const refusing = await startRefusingServer();
  t.after(async () => {
    try { await healthy.close(); } catch { /* ignore */ }
    try { await refusing.close(); } catch { /* ignore */ }
  });

  // Connect for real first, so `everConnected` is true and we exercise the
  // RECONNECT path (short timeout) rather than the 5-minute first-connect path.
  const { client, udd } = await spawnProxy(t, 'cu-backoff-', {
    CHROME_USE_KEEPALIVE_MS: '100000', // heartbeat must not add attempts of its own
    CHROME_USE_RECONNECT_TIMEOUT_MS: '1000',
  }, healthy);
  assert.equal((await client.send<any>('Browser.getVersion')).product, 'FakeChrome-pace');

  // Chrome "goes away": every further connect is refused immediately (fast fail,
  // NOT a stall — a stall is the approval-dialog signature and is handled apart).
  writePortFile(udd, { port: refusing.port, wsPath: '/devtools/browser/fake-refuse' });
  healthy.dropAll();
  await waitForStatus(client, (s) => s.connected === false, 5_000, 'the proxy to notice the drop');

  // 3a) Single-flight: five commands fired together must share one attempt.
  const baseline = refusing.connectionCount();
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => client.send<any>('Browser.getVersion')),
  );
  const burst = refusing.connectionCount() - baseline;
  assert.ok(results.every((r) => r.status === 'rejected'), 'commands during a real outage must fail, not hang');
  assert.ok(
    burst <= 2,
    `5 concurrent commands must share one in-flight connect (observed ${burst} upstream connects)`,
  );

  // 3b) Backoff: left idle, retries must be spaced. 500ms doubling means ~3 attempts
  //     in 3s; a tight retry loop would be hundreds.
  const beforeIdle = refusing.connectionCount();
  await new Promise((r) => setTimeout(r, 3_000));
  const idleAttempts = refusing.connectionCount() - beforeIdle;
  assert.ok(idleAttempts >= 1, 'the proxy must keep trying to self-heal while Chrome is away');
  assert.ok(idleAttempts <= 10, `retries must be backed off, not a tight loop (observed ${idleAttempts} in 3s)`);

  // A recoverable outage must never latch the proxy closed.
  const status = await client.send<any>('__status');
  assert.equal(status.connectionBlocked, null, 'an unreachable Chrome is retried, not latched closed');
  assert.equal(status.reconnecting, true, '__status must advertise that recovery is in progress');
});

/**
 * Invariant 4: half-open detection. If Chrome stops answering but leaves the TCP
 * socket open, nothing closes the socket and nothing errors — the old keepalive
 * swallowed the failed probe and kept a dead handle cached until the next user
 * command tripped over it. The heartbeat now treats a failed probe as a lost
 * connection, so the proxy notices on its own within about
 * KEEPALIVE_MS + LIVENESS_PROBE_MS and starts reconnecting.
 */
test('the heartbeat detects a half-open connection (TCP up, Chrome silent) and starts reconnecting', async (t) => {
  const KEEPALIVE_MS = 100;
  const LIVENESS_PROBE_MS = 150;
  const fake = await startFakeCdp('FakeChrome-halfopen');
  t.after(async () => { try { await fake.close(); } catch { /* ignore */ } });

  const { client } = await spawnProxy(t, 'cu-halfopen-', {
    CHROME_USE_KEEPALIVE_MS: String(KEEPALIVE_MS),
    CHROME_USE_LIVENESS_PROBE_MS: String(LIVENESS_PROBE_MS),
  }, fake);
  assert.equal((await client.send<any>('Browser.getVersion')).product, 'FakeChrome-halfopen');
  assert.equal((await client.send<any>('__status')).connected, true);

  // Socket stays open; Chrome simply stops replying. Only an active probe can see this.
  fake.goDark();

  const { status, elapsed } = await waitForStatus(
    client,
    (s) => s.connected === false,
    5_000,
    'the heartbeat to detect the half-open connection',
  );
  assert.ok(
    elapsed < (KEEPALIVE_MS + LIVENESS_PROBE_MS) * 6 + 500,
    `detection must take roughly KEEPALIVE_MS + LIVENESS_PROBE_MS (took ${elapsed}ms)`,
  );
  assert.equal(status.connectionBlocked, null, 'a silent Chrome is a reconnect case, not a human-approval case');
  assert.equal(status.reconnecting, true, 'the proxy must move itself into reconnecting, unprompted');
});
