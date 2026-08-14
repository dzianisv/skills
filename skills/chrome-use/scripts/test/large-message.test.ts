/**
 * REGRESSION: large CDP responses must not kill the connection.
 *
 * Root cause this pins (found 2026-08-14 while debugging AGE-44):
 *
 *   1. Node's built-in/global `WebSocket` (undici) automatically offers
 *      `Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits`.
 *   2. Chrome's DevTools endpoint ACCEPTS it (`permessage-deflate;
 *      client_max_window_bits=15`), so every CDP response arrives compressed.
 *   3. undici's inflate path blows up once a message's INFLATED size reaches
 *      4 MiB (4,194,304 bytes). It does not surface a clean protocol error —
 *      it destroys the TCP socket, producing an empty TypeError from
 *      `#onSocketClose` and a 1006 abnormal close.
 *
 * chrome-use read that as "the Chrome debugging connection died" and latched the
 * shared proxy permanently closed ("a human must kill the proxy"). The payloads
 * that cross 4 MiB are exactly the ones agents need:
 *   - `Page.captureScreenshot` on a content-heavy page (a plain viewport PNG of
 *     mercury.com is ~4.5 MB raw / ~6 MB base64)
 *   - `get html` / `Runtime.evaluate` on a large DOM
 * so a single screenshot of a real page bricked browser automation machine-wide.
 *
 * `lib/ws.ts` fixes it by never offering any extension, so frames arrive as
 * plain (uncompressed) data with no size cap.
 *
 * NOTE ON TEST DESIGN: the compression negotiation is load-bearing. An
 * uncompressed test server does NOT reproduce the bug — the built-in client
 * happily reads 20 MB plaintext frames. The `permessage-deflate` case below is
 * the one that actually fails on the old client, so keep it.
 *
 * Run: node --test scripts/test/large-message.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

import { Cdp } from '../lib/cdp.ts';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** The exact byte count at which Node's built-in WebSocket destroys the socket. */
const UNDICI_MAX_MESSAGE = 4 * 1024 * 1024; // 4_194_304

interface Server {
  endpoint: string;
  close: () => Promise<void>;
}

/**
 * Minimal CDP-ish WebSocket server. Answers `Browser.getVersion` and a synthetic
 * `Test.echoLarge` that returns a string of the requested length, optionally
 * split across continuation frames (Chrome may fragment large messages).
 */
function startServer(opts: { fragment?: boolean; deflate?: boolean } = {}): Promise<Server> {
  const server = http.createServer();

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'] as string;
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    // Only accept permessage-deflate if the client actually offered it. This mirrors
    // Chrome: it compresses because undici asks it to, and stays plain for a client
    // (like lib/ws.ts) that never offers an extension.
    const offered = String(req.headers['sec-websocket-extensions'] ?? '');
    const useDeflate = !!opts.deflate && /permessage-deflate/.test(offered);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        (useDeflate ? 'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits=15\r\n' : '') +
        '\r\n',
    );

    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const opcode = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        let mask: Buffer | null = null;
        if (masked) { if (buf.length < off + 4) return; mask = buf.subarray(off, off + 4); off += 4; }
        if (buf.length < off + len) return;
        const raw = Buffer.from(buf.subarray(off, off + len));
        if (mask) for (let i = 0; i < raw.length; i++) raw[i] ^= mask[i % 4];
        buf = buf.subarray(off + len);
        if (opcode === 0x8) { socket.end(); return; }
        if (opcode !== 0x1) continue;

        let msg: any;
        try { msg = JSON.parse(raw.toString('utf8')); } catch { continue; }
        if (msg.method === 'Browser.getVersion') {
          writeText(socket, JSON.stringify({ id: msg.id, result: { product: 'Chrome/test' } }), useDeflate);
        } else if (msg.method === 'Test.echoLarge') {
          const size = Number(msg.params?.size ?? 0);
          const body = JSON.stringify({ id: msg.id, result: { data: 'x'.repeat(size) } });
          if (opts.fragment) writeFragmentedText(socket, body, 3);
          else writeText(socket, body, useDeflate);
        }
      }
    });
    socket.on('error', () => {});
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as any;
      resolve({
        endpoint: `ws://127.0.0.1:${port}/devtools/browser/test`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function frameHeader(opcode: number, len: number, fin: boolean, rsv1 = false): Buffer {
  let header: Buffer;
  if (len < 126) header = Buffer.alloc(2);
  else if (len < 65536) { header = Buffer.alloc(4); header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = (fin ? 0x80 : 0x00) | (rsv1 ? 0x40 : 0x00) | opcode;
  header[1] = len < 126 ? len : len < 65536 ? 126 : 127;
  return header;
}

function writeText(socket: any, str: string, deflate = false): void {
  if (deflate) {
    // permessage-deflate: raw-deflate the payload, strip the trailing empty block
    // (00 00 FF FF), and set RSV1 on the frame.
    const raw = zlib.deflateRawSync(Buffer.from(str, 'utf8'));
    const payload = raw.subarray(0, raw.length - 4);
    socket.write(Buffer.concat([frameHeader(0x1, payload.length, true, true), payload]));
    return;
  }
  const payload = Buffer.from(str, 'utf8');
  socket.write(Buffer.concat([frameHeader(0x1, payload.length, true), payload]));
}

/** Split one logical message across `parts` frames (text + continuations). */
function writeFragmentedText(socket: any, str: string, parts: number): void {
  const payload = Buffer.from(str, 'utf8');
  const chunk = Math.ceil(payload.length / parts);
  for (let i = 0; i < parts; i++) {
    const slice = payload.subarray(i * chunk, Math.min((i + 1) * chunk, payload.length));
    const isFirst = i === 0;
    const isLast = i === parts - 1;
    socket.write(Buffer.concat([frameHeader(isFirst ? 0x1 : 0x0, slice.length, isLast), slice]));
  }
}

test('THE BUG: a >4 MiB response from a permessage-deflate server survives', async () => {
  // This is the case that actually reproduces AGE-44. Against this server the OLD
  // client (Node's global WebSocket) negotiates permessage-deflate and then
  // destroys the socket when the message inflates past 4 MiB.
  const server = await startServer({ deflate: true });
  try {
    const cdp = await Cdp.connect(server.endpoint, 5_000);
    const res = await cdp.send<any>('Test.echoLarge', { size: 6_000_000 });
    assert.equal(res.data.length, 6_000_000);
    assert.equal(cdp.connected, true, 'connection must survive a >4 MiB deflate-negotiated response');

    // Still usable afterwards — the old failure destroyed the socket outright.
    const v = await cdp.send<any>('Browser.getVersion');
    assert.equal(v.product, 'Chrome/test');
    cdp.close();
  } finally {
    await server.close();
  }
});

test('lib/ws.ts never negotiates a compression extension', async () => {
  // The fix depends on this: offering no extension is what keeps Chrome sending
  // plain frames. If a future change starts offering permessage-deflate, the
  // 4 MiB failure comes straight back.
  const server = http.createServer();
  const offered = await new Promise<string>((resolve) => {
    server.on('upgrade', (req, socket) => {
      resolve(String(req.headers['sec-websocket-extensions'] ?? ''));
      socket.destroy();
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as any;
      Cdp.connect(`ws://127.0.0.1:${port}/devtools/browser/test`, 2_000).catch(() => {});
    });
  });
  server.close();
  assert.equal(offered, '', `expected no extensions offered, got ${JSON.stringify(offered)}`);
});

test('a CDP response at exactly the 4 MiB built-in cap survives', async () => {
  const server = await startServer();
  try {
    const cdp = await Cdp.connect(server.endpoint, 5_000);
    const res = await cdp.send<any>('Test.echoLarge', { size: UNDICI_MAX_MESSAGE });
    assert.equal(res.data.length, UNDICI_MAX_MESSAGE);
    assert.equal(cdp.connected, true, 'connection must stay open at the old cap');
    cdp.close();
  } finally {
    await server.close();
  }
});

test('a CDP response far over 4 MiB (screenshot-sized) survives and keeps the socket open', async () => {
  const server = await startServer();
  try {
    const cdp = await Cdp.connect(server.endpoint, 5_000);

    // ~12 MB — comparable to a base64 full-page screenshot of a real site.
    const big = await cdp.send<any>('Test.echoLarge', { size: 12_000_000 });
    assert.equal(big.data.length, 12_000_000);

    // The critical regression: the connection must still be usable afterwards.
    // Previously the socket was already destroyed and the proxy latched closed.
    assert.equal(cdp.connected, true, 'connection must survive a >4 MiB response');
    const v = await cdp.send<any>('Browser.getVersion');
    assert.equal(v.product, 'Chrome/test');

    cdp.close();
  } finally {
    await server.close();
  }
});

test('a large response split across continuation frames is reassembled intact', async () => {
  const server = await startServer({ fragment: true });
  try {
    const cdp = await Cdp.connect(server.endpoint, 5_000);
    const res = await cdp.send<any>('Test.echoLarge', { size: 5_000_000 });
    assert.equal(res.data.length, 5_000_000);
    assert.equal(res.data, 'x'.repeat(5_000_000), 'fragments must reassemble in order');
    assert.equal(cdp.connected, true);
    cdp.close();
  } finally {
    await server.close();
  }
});

test('several oversized responses in a row do not degrade the connection', async () => {
  const server = await startServer();
  try {
    const cdp = await Cdp.connect(server.endpoint, 5_000);
    for (const size of [4_500_000, 8_000_000, 6_000_000]) {
      const res = await cdp.send<any>('Test.echoLarge', { size });
      assert.equal(res.data.length, size);
      assert.equal(cdp.connected, true, `connection died after a ${size}-byte response`);
    }
    cdp.close();
  } finally {
    await server.close();
  }
});
