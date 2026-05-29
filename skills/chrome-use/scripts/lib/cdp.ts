/**
 * Zero-dependency Chrome DevTools Protocol client over Node 22's global WebSocket.
 *
 * Connects to the browser-level endpoint (ws://127.0.0.1:<port>/devtools/browser/<id>)
 * and uses flattened sessions: page-level commands carry a `sessionId` obtained via
 * Target.attachToTarget({ flatten: true }). No Puppeteer, no npm deps.
 */
import type { CdpClient } from './types.ts';

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
}

export class Cdp implements CdpClient {
  #ws: WebSocket;
  #nextId = 1;
  #pending = new Map<number, Pending>();
  #listeners = new Map<string, Set<(params: any, sessionId?: string) => void>>();
  #open: Promise<void>;
  #closed = false;

  private constructor(ws: WebSocket) {
    this.#ws = ws;
    this.#open = new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('WebSocket connection error')), { once: true });
    });
    ws.addEventListener('message', (ev) => this.#onMessage(String((ev as MessageEvent).data)));
    ws.addEventListener('close', () => {
      this.#closed = true;
      for (const { reject } of this.#pending.values()) reject(new Error('CDP connection closed'));
      this.#pending.clear();
    });
  }

  /** Connect to a browser-level ws endpoint and resolve once the socket is open. */
  static async connect(wsEndpoint: string, timeoutMs = 10_000): Promise<Cdp> {
    const ws = new WebSocket(wsEndpoint);
    const client = new Cdp(ws);
    await withTimeout(client.#open, timeoutMs, `CDP connect timed out after ${timeoutMs}ms`);
    return client;
  }

  get connected(): boolean {
    return !this.#closed && this.#ws.readyState === WebSocket.OPEN;
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

  send<T = any>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    if (this.#closed) return Promise.reject(new Error('CDP connection closed'));
    const id = this.#nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        this.#ws.send(JSON.stringify(payload));
      } catch (e: any) {
        this.#pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
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
