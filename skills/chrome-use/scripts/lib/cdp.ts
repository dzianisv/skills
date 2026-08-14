/**
 * Zero-dependency Chrome DevTools Protocol client.
 *
 * Connects to the browser-level endpoint (ws://127.0.0.1:<port>/devtools/browser/<id>)
 * and uses flattened sessions: page-level commands carry a `sessionId` obtained via
 * Target.attachToTarget({ flatten: true }). No Puppeteer, no npm deps.
 *
 * Uses `lib/ws.ts` rather than Node's global WebSocket on purpose: the built-in
 * client caps messages at 4 MiB and destroys the socket past that, which killed
 * every screenshot of a content-heavy page. See the header of `lib/ws.ts`.
 */
import { RawWebSocket, type WsCloseInfo } from './ws.ts';
import type { CdpClient } from './types.ts';

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
}

export type CloseInfo = WsCloseInfo;

export class Cdp implements CdpClient {
  #ws: RawWebSocket;
  #nextId = 1;
  #pending = new Map<number, Pending>();
  #listeners = new Map<string, Set<(params: any, sessionId?: string) => void>>();
  #closed = false;
  #closeFired = false;
  #onCloseCbs = new Set<(info: CloseInfo) => void>();
  #closeInfo: CloseInfo = { code: null, reason: null, source: 'unknown' };

  private constructor(ws: RawWebSocket) {
    this.#ws = ws;
    ws.onMessage((data) => this.#onMessage(data));
    // A dropped socket marks the client dead so the proxy can null its cached
    // handle. #fireClose is idempotent so close/error can't double-run it.
    ws.onClose((info) => this.#fireClose(info));
  }

  /**
   * Why the socket dropped. Chrome's autoConnect endpoint closes with a specific
   * code/reason when it REVOKES a grant (vs. a transport failure), and the two need
   * very different handling: a revoked grant can be re-requested, a transport blip
   * can simply be redialled. Without this, every drop looked identical.
   */
  get closeInfo(): CloseInfo {
    return this.#closeInfo;
  }

  #fireClose(info: CloseInfo): void {
    if (this.#closeFired) return;
    this.#closeFired = true;
    this.#closed = true;
    this.#closeInfo = info;
    for (const { reject } of this.#pending.values()) reject(new Error('CDP connection closed'));
    this.#pending.clear();
    for (const cb of this.#onCloseCbs) {
      try { cb(info); } catch { /* onClose callbacks are non-fatal */ }
    }
  }

  /**
   * Register a callback fired once when the connection drops (ws close/error).
   * Lets the proxy discard its cached client and lazily reconnect. Returns an
   * unsubscribe fn. If already closed, the callback runs immediately.
   */
  onClose(cb: (info: CloseInfo) => void): () => void {
    this.#onCloseCbs.add(cb);
    if (this.#closed) { try { cb(this.#closeInfo); } catch { /* non-fatal */ } }
    return () => this.#onCloseCbs.delete(cb);
  }

  /** Connect to a browser-level ws endpoint and resolve once the socket is open. */
  static async connect(wsEndpoint: string, timeoutMs = 10_000): Promise<Cdp> {
    const ws = await RawWebSocket.connect(wsEndpoint, timeoutMs);
    return new Cdp(ws);
  }

  get connected(): boolean {
    return !this.#closed && this.#ws.connected;
  }

  #onMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.id === 'number') {
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message ?? 'CDP error'} (code ${msg.error.code ?? '?'})`));
      else p.resolve(msg.result);
      return;
    }
    if (typeof msg.method === 'string') {
      const set = this.#listeners.get(msg.method);
      if (set) for (const fn of set) try { fn(msg.params, msg.sessionId); } catch { /* listener errors are non-fatal */ }
    }
  }

  send<T = any>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs?: number,
  ): Promise<T> {
    if (this.#closed) return Promise.reject(new Error('CDP connection closed'));
    const id = this.#nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const promise = new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        this.#ws.send(JSON.stringify(payload));
      } catch (e: any) {
        this.#pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    if (!Number.isFinite(timeoutMs as number) || (timeoutMs as number) <= 0) return promise;
    return withTimeout(promise, timeoutMs as number, `CDP request timed out after ${timeoutMs}ms: ${method}`).catch(
      (err) => {
        this.#pending.delete(id);
        throw err;
      },
    );
  }

  on(method: string, handler: (params: any, sessionId?: string) => void): () => void {
    let set = this.#listeners.get(method);
    if (!set) {
      set = new Set();
      this.#listeners.set(method, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  close(): void {
    this.#closed = true;
    try {
      this.#ws.close();
    } catch { /* ignore */ }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
