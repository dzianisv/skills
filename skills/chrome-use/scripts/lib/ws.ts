/**
 * Minimal zero-dependency WebSocket client (RFC 6455) over `net.Socket`.
 *
 * WHY THIS EXISTS — do not "simplify" this back to Node's global `WebSocket`.
 * ---------------------------------------------------------------------------
 * Node's built-in WebSocket (undici) enforces a hard ~4 MiB max message size.
 * A CDP response larger than 4,194,304 bytes does not surface as a protocol
 * error: undici destroys the TCP socket, which shows up as an `error` event
 * with an empty TypeError from `#onSocketClose` and a 1006 abnormal close.
 *
 * That is fatal for chrome-use, because the payloads that cross 4 MiB are
 * exactly the ones agents care about:
 *   - `Page.captureScreenshot` on a real, content-heavy page (base64 PNG)
 *   - `get html` / `Runtime.evaluate` returning a large DOM
 *
 * The proxy read the dropped socket as "Chrome connection failed" and latched
 * itself closed permanently ("a human must kill the proxy"), so a single
 * screenshot of a heavy page bricked browser automation machine-wide.
 *
 * Verified against Chrome 151's DevTools endpoint: this implementation reads
 * 4 MiB / 8 MB / 20 MB messages on the same socket where the built-in client
 * dies at 4 MiB. Chrome negotiates no extensions (no permessage-deflate), so
 * only plain frames need to be handled.
 *
 * Scope: exactly what a CDP client needs — text frames, continuation frames,
 * ping/pong, close. No extensions, no server mode.
 */
import net from 'node:net';
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OP_CONTINUATION = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

export interface WsCloseInfo {
  code: number | null;
  reason: string | null;
  source: 'close' | 'error' | 'unknown';
}

type MessageHandler = (data: string) => void;
type CloseHandler = (info: WsCloseInfo) => void;

export class RawWebSocket {
  #socket: net.Socket;
  #buf: Buffer = Buffer.alloc(0);
  #handshakeDone = false;
  #closed = false;
  #closeFired = false;
  #fragments: Buffer[] = [];
  #fragmentOpcode: number | null = null;
  #onMessage: MessageHandler | null = null;
  #onCloseCbs = new Set<CloseHandler>();
  #closeInfo: WsCloseInfo = { code: null, reason: null, source: 'unknown' };

  private constructor(socket: net.Socket) {
    this.#socket = socket;
  }

  get connected(): boolean {
    return !this.#closed && this.#handshakeDone && !this.#socket.destroyed;
  }

  get closeInfo(): WsCloseInfo {
    return this.#closeInfo;
  }

  onMessage(cb: MessageHandler): void {
    this.#onMessage = cb;
  }

  onClose(cb: CloseHandler): () => void {
    this.#onCloseCbs.add(cb);
    if (this.#closed) {
      try { cb(this.#closeInfo); } catch { /* non-fatal */ }
    }
    return () => this.#onCloseCbs.delete(cb);
  }

  /**
   * Open a connection to a `ws://host:port/path` endpoint and resolve once the
   * HTTP 101 upgrade handshake has completed.
   */
  static connect(endpoint: string, timeoutMs = 10_000): Promise<RawWebSocket> {
    const url = new URL(endpoint);
    if (url.protocol !== 'ws:') {
      return Promise.reject(new Error(`Only ws:// endpoints are supported, got ${url.protocol}`));
    }
    const port = Number(url.port || 80);
    const host = url.hostname;
    const path = `${url.pathname}${url.search}`;
    const key = crypto.randomBytes(16).toString('base64');
    const expectedAccept = crypto.createHash('sha1').update(key + GUID).digest('base64');

    return new Promise<RawWebSocket>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      // CDP responses arrive in bursts; Nagle only adds latency to small commands.
      socket.setNoDelay(true);
      const client = new RawWebSocket(socket);

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error(`CDP connect timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        reject(err);
      };

      socket.on('error', (err) => {
        if (settled) client.#fireClose({ code: null, reason: err.message, source: 'error' });
        else fail(err);
      });

      socket.on('close', () => {
        client.#fireClose(
          client.#closeInfo.code != null
            ? client.#closeInfo
            : { code: 1006, reason: null, source: 'close' },
        );
      });

      socket.on('data', (chunk: Buffer) => {
        client.#buf = client.#buf.length ? Buffer.concat([client.#buf, chunk]) : chunk;

        if (!client.#handshakeDone) {
          const end = client.#buf.indexOf('\r\n\r\n');
          if (end < 0) return; // headers still arriving
          const head = client.#buf.subarray(0, end).toString('latin1');
          client.#buf = client.#buf.subarray(end + 4);

          const statusLine = head.split('\r\n')[0] ?? '';
          if (!/\s101\s/.test(statusLine)) return fail(new Error(`WebSocket upgrade failed: ${statusLine}`));
          const accept = /sec-websocket-accept:\s*(\S+)/i.exec(head)?.[1];
          if (accept !== expectedAccept) return fail(new Error('WebSocket upgrade failed: bad Sec-WebSocket-Accept'));

          client.#handshakeDone = true;
          settled = true;
          clearTimeout(timer);
          resolve(client);
        }

        try {
          client.#drainFrames();
        } catch (err: any) {
          client.#fireClose({ code: null, reason: String(err?.message ?? err), source: 'error' });
          socket.destroy();
        }
      });

      socket.on('connect', () => {
        socket.write(
          `GET ${path} HTTP/1.1\r\n` +
            `Host: ${host}:${port}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Key: ${key}\r\n` +
            'Sec-WebSocket-Version: 13\r\n' +
            '\r\n',
        );
      });
    });
  }

  /**
   * Parse as many complete frames as the buffer holds.
   *
   * Deliberately has NO maximum payload length: that cap is the entire bug this
   * module exists to fix. Chrome is a trusted localhost peer here.
   */
  #drainFrames(): void {
    for (;;) {
      const buf = this.#buf;
      if (buf.length < 2) return;

      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (buf.length < offset + 2) return;
        len = buf.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (buf.length < offset + 8) return;
        const big = buf.readBigUInt64BE(offset);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('WebSocket frame too large to address');
        len = Number(big);
        offset += 8;
      }

      // Servers must not mask, but handle it rather than silently corrupting data.
      let maskKey: Buffer | null = null;
      if (masked) {
        if (buf.length < offset + 4) return;
        maskKey = buf.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buf.length < offset + len) return; // frame still arriving

      let payload = buf.subarray(offset, offset + len);
      if (maskKey) {
        const copy = Buffer.from(payload);
        for (let i = 0; i < copy.length; i++) copy[i] ^= maskKey[i % 4];
        payload = copy;
      } else {
        // subarray aliases #buf; copy before we reslice so later concat can't corrupt it.
        payload = Buffer.from(payload);
      }
      this.#buf = buf.subarray(offset + len);

      switch (opcode) {
        case OP_PING:
          this.#writeFrame(OP_PONG, payload);
          break;
        case OP_PONG:
          break;
        case OP_CLOSE: {
          const code = payload.length >= 2 ? payload.readUInt16BE(0) : null;
          const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : null;
          this.#closeInfo = { code, reason, source: 'close' };
          try { this.#writeFrame(OP_CLOSE, payload.subarray(0, 2)); } catch { /* peer may be gone */ }
          this.#socket.end();
          break;
        }
        case OP_TEXT:
        case OP_BINARY:
          this.#fragmentOpcode = opcode;
          this.#fragments = [payload];
          if (fin) this.#deliver();
          break;
        case OP_CONTINUATION:
          this.#fragments.push(payload);
          if (fin) this.#deliver();
          break;
        default:
          throw new Error(`Unsupported WebSocket opcode 0x${opcode.toString(16)}`);
      }
    }
  }

  #deliver(): void {
    const full = this.#fragments.length === 1 ? this.#fragments[0] : Buffer.concat(this.#fragments);
    this.#fragments = [];
    this.#fragmentOpcode = null;
    const text = full.toString('utf8');
    if (this.#onMessage) {
      try { this.#onMessage(text); } catch { /* handler errors are non-fatal */ }
    }
  }

  /** Send a text message. Client frames MUST be masked per RFC 6455. */
  send(data: string): void {
    if (!this.connected) throw new Error('WebSocket is not open');
    this.#writeFrame(OP_TEXT, Buffer.from(data, 'utf8'));
  }

  #writeFrame(opcode: number, payload: Buffer): void {
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let header: Buffer;
    if (len < 126) {
      header = Buffer.alloc(6);
      header[1] = 0x80 | len;
      mask.copy(header, 2);
    } else if (len < 65536) {
      header = Buffer.alloc(8);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
      mask.copy(header, 4);
    } else {
      header = Buffer.alloc(14);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
      mask.copy(header, 10);
    }
    header[0] = 0x80 | opcode; // FIN + opcode
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    this.#socket.write(Buffer.concat([header, masked]));
  }

  #fireClose(info: WsCloseInfo): void {
    if (this.#closeFired) return;
    this.#closeFired = true;
    this.#closed = true;
    this.#closeInfo = info;
    for (const cb of this.#onCloseCbs) {
      try { cb(info); } catch { /* non-fatal */ }
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    try { this.#writeFrame(OP_CLOSE, Buffer.alloc(0)); } catch { /* ignore */ }
    try { this.#socket.end(); } catch { /* ignore */ }
    try { this.#socket.destroy(); } catch { /* ignore */ }
  }
}
