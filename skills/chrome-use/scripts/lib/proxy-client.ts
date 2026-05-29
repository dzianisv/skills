/**
 * CdpClient implementation that forwards raw CDP commands over the Unix socket to
 * the transparent proxy (proxy.ts). All payloads are built here on the client side;
 * the proxy just relays them to Chrome on its single approved connection.
 *
 * Wire protocol: newline-delimited JSON. Request `{ id, method, params, sessionId }`,
 * response `{ id, result }` or `{ id, error }`. Control methods are prefixed `__`
 * (e.g. `__status`, `__stop`) and are answered by the proxy without touching Chrome.
 */
import net from 'node:net';
import type { CdpClient } from './types.ts';

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
}

export class ProxyClient implements CdpClient {
  #socket: net.Socket;
  #buf = '';
  #nextId = 1;
  #pending = new Map<number, Pending>();
  #ready: Promise<void>;
  #closed = false;
  #defaultTimeout: number;

  private constructor(socket: net.Socket, defaultTimeout: number) {
    this.#socket = socket;
    this.#defaultTimeout = defaultTimeout;
    socket.setEncoding('utf8');
    this.#ready = new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', (e) => reject(e));
    });
    socket.on('data', (chunk) => this.#onData(String(chunk)));
    socket.on('close', () => {
      this.#closed = true;
      for (const { reject } of this.#pending.values()) reject(new Error('Proxy connection closed'));
      this.#pending.clear();
    });
    socket.on('error', () => {});
  }

  /** Open a client connection to the proxy socket and wait until connected. */
  static async open(socketPath: string, defaultTimeout = 320_000): Promise<ProxyClient> {
    const socket = net.createConnection({ path: socketPath });
    const client = new ProxyClient(socket, defaultTimeout);
    await client.#ready;
    return client;
  }

  get connected(): boolean {
    return !this.#closed;
  }

  #onData(chunk: string): void {
    this.#buf += chunk;
    let nl: number;
    while ((nl = this.#buf.indexOf('\n')) !== -1) {
      const line = this.#buf.slice(0, nl);
      this.#buf = this.#buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const p = this.#pending.get(msg.id);
      if (!p) continue;
      this.#pending.delete(msg.id);
      if (msg.error) p.reject(new Error(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
  }

  /** Send a raw CDP command (or a `__control` method) through the proxy. */
  send<T = any>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    if (this.#closed) return Promise.reject(new Error('Proxy connection closed'));
    const id = this.#nextId++;
    const frame: Record<string, unknown> = { id, method, params };
    if (sessionId) frame.sessionId = sessionId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, this.#defaultTimeout);
      this.#pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.#socket.write(JSON.stringify(frame) + '\n');
    });
  }

  /** Events are not relayed over the proxy — chrome-use commands poll instead. */
  on(): () => void {
    return () => {};
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#socket.end();
    } catch {
      /* ignore */
    }
  }
}
