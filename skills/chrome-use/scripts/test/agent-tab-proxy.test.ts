import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ProxyClient } from '../lib/proxy-client.ts';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = path.join(SCRIPTS_DIR, 'proxy.ts');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(text: string): Buffer {
  const payload = Buffer.from(text);
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function parseFrames(buf: Buffer): { messages: string[]; rest: Buffer } {
  const messages: string[] = [];
  let offset = 0;
  while (buf.length - offset >= 2) {
    const first = buf[offset];
    const second = buf[offset + 1];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (buf.length - offset < 4) break;
      length = buf.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (buf.length - offset < 10) break;
      length = Number(buf.readBigUInt64BE(cursor));
      cursor += 8;
    }
    const masked = (second & 0x80) !== 0;
    let mask: Buffer | undefined;
    if (masked) {
      if (buf.length - cursor < 4) break;
      mask = buf.subarray(cursor, cursor + 4);
      cursor += 4;
    }
    if (buf.length - cursor < length) break;
    const payload = Buffer.from(buf.subarray(cursor, cursor + length));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    if (opcode === 1) messages.push(payload.toString());
    offset = cursor + length;
  }
  return { messages, rest: buf.subarray(offset) };
}

async function startFakeCdp(): Promise<{ port: number; closed: string[]; close: () => Promise<void> }> {
  const closed: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = http.createServer();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const key = request.headers['sec-websocket-key'] as string;
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const parsed = parseFrames(buf);
      buf = parsed.rest;
      for (const text of parsed.messages) {
        const message = JSON.parse(text);
        let result: unknown = { ok: true };
        if (message.method === 'Browser.getVersion') result = { product: 'FakeChrome-agent-tabs' };
        if (message.method === 'Target.createTarget') result = { targetId: String(message.params?.url).includes('pinned') ? 'agent-pinned' : 'agent-created' };
        if (message.method === 'Target.attachToTarget') result = { sessionId: `session-${message.params.targetId}` };
        if (message.method === 'Target.closeTarget') closed.push(message.params.targetId);
        socket.write(frame(JSON.stringify({ id: message.id, result })));
      }
    });
    socket.on('error', () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    closed,
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

async function waitForSocket(socketPath: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ path: socketPath });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`proxy socket did not appear: ${socketPath}`);
}

async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${description}`);
}

test('proxy tracks only Target.createTarget tabs and closes unpinned idle tabs', async (t) => {
  const fake = await startFakeCdp();
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-agent-tabs-'));
  const socketPath = path.join(udd, 'proxy.sock');
  fs.writeFileSync(path.join(udd, 'DevToolsActivePort'), `${fake.port}\n/devtools/browser/agent-tabs\n`);
  const proxy: ChildProcess = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: socketPath,
      CHROME_USE_TEST_USER_DATA_DIR: udd,
      CHROME_USE_AGENT_TAB_IDLE_MS: '80',
      CHROME_USE_AGENT_TAB_CLEANUP_INTERVAL_MS: '20',
      CHROME_USE_KEEPALIVE_MS: '100000',
    },
    stdio: 'ignore',
  });
  let client: ProxyClient | undefined;
  t.after(async () => {
    try { client?.close(); } catch { /* ignore */ }
    try { proxy.kill('SIGKILL'); } catch { /* ignore */ }
    try { await fake.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  await waitForSocket(socketPath);
  client = await ProxyClient.open(socketPath, 5_000);
  await client.send('Browser.getVersion');

  await client.send('Target.createTarget', { url: 'about:blank' });
  const tracked = await client.send<any[]>('__agent_tabs');
  assert.deepEqual(tracked.map(({ targetId, pinned }) => ({ targetId, pinned })), [
    { targetId: 'agent-created', pinned: false },
  ]);
  await waitFor(() => fake.closed.includes('agent-created'), 'the unpinned agent tab to be closed');

  await client.send('Target.createTarget', { url: 'https://pinned.example/' });
  const pinReply = await client.send<any>('__pin_agent_tab', { targetId: 'agent-pinned' });
  assert.equal(pinReply.changed, true);
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal(fake.closed.includes('agent-pinned'), false, 'pinned task tabs must survive idle cleanup');

  await client.send('__unpin_agent_tab', { targetId: 'agent-pinned' });
  await waitFor(() => fake.closed.includes('agent-pinned'), 'the explicitly unpinned tab to be closed');
  assert.equal(fake.closed.filter((targetId) => targetId === 'agent-created').length, 1);
  assert.equal(fake.closed.filter((targetId) => targetId === 'agent-pinned').length, 1);
});
