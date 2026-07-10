/**
 * Startup-lock regression test for the concurrent-launch race (bugs fixed alongside
 * issue #1's reconnect fix): two proxy.ts processes racing to start against the SAME
 * socket must never both end up serving — only one may bind the socket and connect to
 * Chrome. Exercises the real acquireLock() atomic-publish (temp file + fs.linkSync)
 * and its stale-owner grace-period retry, via the REAL proxy.ts spawned twice
 * concurrently against a fake in-process CDP server. No real Chrome.
 *
 * Pre-fix, the non-atomic `open('wx')` + separate `writeSync()` pair (and the
 * TOCTOU-prone immediate staleness check) could let a racer observe an empty lockfile
 * or a legitimate in-flight starter's not-yet-listening socket, wrongly declare the
 * lock stale, and start a second proxy — a second approved CDP connection.
 *
 * Run: node --test scripts/test/lock.test.ts
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
  getVersionCount: () => number;
  close: () => Promise<void>;
}

/** Start a minimal CDP-speaking WebSocket server on an ephemeral port. */
function startFakeCdp(): Promise<FakeCdp> {
  const sockets = new Set<net.Socket>();
  let versionCount = 0;
  const server = http.createServer();
  server.on('upgrade', (req, socket: net.Socket) => {
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
        let result: unknown;
        if (msg.method === 'Browser.getVersion') {
          versionCount++;
          result = { protocolVersion: '1.3', product: 'FakeChrome' };
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
        wsPath: '/devtools/browser/fake-lock-test',
        getVersionCount: () => versionCount,
        close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
      });
    });
  });
}

function writePortFile(udd: string, fake: FakeCdp): void {
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

test('two proxies launched concurrently: only one ever serves / connects to CDP', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-lock-'));
  const sockPath = path.join(udd, 'proxy.sock');
  const fakeCdp = await startFakeCdp();
  writePortFile(udd, fakeCdp);

  const env = {
    ...process.env,
    CHROME_USE_DAEMON: '1',
    CHROME_USE_SOCKET: sockPath,
    CHROME_USE_USER_DATA_DIR: udd,
  };

  let procA: ChildProcess | undefined;
  let procB: ChildProcess | undefined;
  let client: ProxyClient | undefined;
  t.after(async () => {
    try { client?.close(); } catch { /* ignore */ }
    try { procA?.kill('SIGKILL'); } catch { /* ignore */ }
    try { procB?.kill('SIGKILL'); } catch { /* ignore */ }
    try { await fakeCdp.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // Launch both as close together as possible, foreground daemons (CHROME_USE_DAEMON=1
  // skips their own double-fork), so they race on acquireLock() at nearly the same
  // instant — exactly the scenario the lock exists to serialize.
  procA = spawn(process.execPath, [PROXY], { env, stdio: 'ignore' });
  procB = spawn(process.execPath, [PROXY], { env, stdio: 'ignore' });

  await waitForSocket(sockPath);
  // Give the loser time to back off and the winner time to eagerly connect
  // (ensureConnected() after startServer()), and the lock file time to be released.
  await new Promise((r) => setTimeout(r, 1500));

  client = await ProxyClient.open(sockPath, 5000);
  const status1 = await client.send<any>('__status', {});
  await new Promise((r) => setTimeout(r, 200));
  const status2 = await client.send<any>('__status', {});

  assert.equal(status1.pid, status2.pid, 'the same single proxy must answer both queries — no flapping between two servers');

  // Exactly one CDP connection should have been made — Browser.getVersion is called
  // once per ensureConnected(), which only the lock-winner's main() ever reaches.
  assert.equal(fakeCdp.getVersionCount(), 1, 'only the lock-winner should have connected to Chrome (one approval-worthy connection)');

  // The lock must be released after a successful startup — no leftover lock/tmp files.
  const lockPath = `${sockPath}.lock`;
  assert.equal(fs.existsSync(lockPath), false, 'startup lock must be released after listen() succeeds');
  const leftoverTmp = fs.readdirSync(udd).filter((f) => f.includes('.lock.tmp.'));
  assert.deepEqual(leftoverTmp, [], 'no leftover atomic-publish temp files');
});
