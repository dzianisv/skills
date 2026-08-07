/**
 * A dropped CDP socket must not cause a fresh Chrome debugger connection. Each
 * fresh connection can create a native approval dialog, so the proxy becomes
 * fail-closed until a human starts a new browser-control session.
 *
 * Real sockets, no real Chrome: a minimal in-process CDP WebSocket server stands in
 * for Chrome. The ACTUAL proxy.ts is spawned and driven over its Unix socket via the
 * real ProxyClient. We prove its keepalive uses the original connection, then drop
 * that socket and assert a command does not connect to a fresh endpoint.
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
}

/** Start a minimal CDP-speaking WebSocket server on an ephemeral port. */
function startFakeCdp(productLabel: string): Promise<FakeCdp> {
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

test('keepalive uses one socket and a dropped CDP socket never auto-reconnects', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-reconnect-'));
  const sockPath = path.join(udd, 'proxy.sock');
  const server1 = await startFakeCdp('FakeChrome-1');
  writePortFile(udd, server1);

  let proxy: ChildProcess | undefined;
  let client: ProxyClient | undefined;
  const server2Ref: { s?: FakeCdp } = {};
  t.after(async () => {
    try { client?.close(); } catch { /* ignore */ }
    try { proxy?.kill('SIGKILL'); } catch { /* ignore */ }
    try { await server1.close(); } catch { /* ignore */ }
    try { await server2Ref.s?.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // Spawn the REAL proxy as a foreground daemon pointed at our fake CDP + socket.
  proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: sockPath,
      CHROME_USE_USER_DATA_DIR: udd,
      CHROME_USE_KEEPALIVE_MS: '50',
    },
    stdio: 'ignore',
  });
  await waitForSocket(sockPath);

  // 1) First command connects through the proxy to server1.
  client = await ProxyClient.open(sockPath, 15_000);
  const r1 = await client.send<any>('Browser.getVersion');
  assert.equal(r1.product, 'FakeChrome-1', 'first command should reach server1');

  const beforeKeepalive = server1.getVersionCount();
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(server1.getVersionCount() > beforeKeepalive, 'keepalive must reuse the original CDP socket');

  // 2) Drop the CDP socket (as a Chrome restart / idle close would).
  server1.dropAll();
  // Bring up a NEW server on a new port and repoint DevToolsActivePort at it,
  // exactly as a restarted Chrome rewrites the file.
  const server2 = await startFakeCdp('FakeChrome-2');
  server2Ref.s = server2;
  writePortFile(udd, server2);
  await new Promise((r) => setTimeout(r, 200)); // let the close propagate to the proxy

  // 3) The next command fails closed. It must not open a new debugger connection
  // to server2 because that could create another native Chrome approval dialog.
  await assert.rejects(client.send<any>('Browser.getVersion'), /will not open another remote-debugging dialog/);
  assert.equal(server2.getVersionCount(), 0, 'a dropped socket must not auto-reconnect to a fresh endpoint');
});
