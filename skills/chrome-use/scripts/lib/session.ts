/**
 * Client-side browser/tab state. Runs inside the one-shot CLI process (not the
 * proxy), so it carries no long-lived state of its own: the active-tab pointer is
 * persisted to a small file so it survives between CLI invocations, and page-level
 * sessions are attached lazily (only the tab a command touches) via the proxy.
 *
 * Snapshot refs do NOT live here — they live in the page as `window.__chromeUseRefs`
 * (see snapshot.ts / selectors.ts), so they persist across invocations and reset
 * naturally on navigation.
 */
import fs from 'node:fs';
import os from 'node:os';
import type { BrowserState, TabSession, CdpClient } from './types.ts';

const ACTIVE_FILE = process.env.CHROME_USE_ACTIVE ?? `/tmp/chrome-use-active-${os.userInfo().uid}`;

function readActive(): string | null {
  try {
    return fs.readFileSync(ACTIVE_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}
function writeActive(targetId: string | null): void {
  try {
    if (targetId) fs.writeFileSync(ACTIVE_FILE, targetId);
    else fs.unlinkSync(ACTIVE_FILE);
  } catch {
    /* best-effort */
  }
}

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
}

/** A page target we are willing to drive (skip devtools/extension surfaces). */
function drivable(t: TargetInfo): boolean {
  return (
    t.type === 'page' &&
    !t.url.startsWith('devtools://') &&
    !t.url.startsWith('chrome-extension://')
  );
}

export class ClientState implements BrowserState {
  readonly cdp: CdpClient;
  readonly tabs = new Map<string, TabSession>();
  activeTargetId: string | null;
  /** Sessions we attached this invocation, detached on dispose() to keep the proxy clean. */
  #attached = new Set<string>();

  constructor(cdp: CdpClient) {
    this.cdp = cdp;
    this.activeTargetId = readActive();
  }

  async #pages(): Promise<TargetInfo[]> {
    const { targetInfos } = await this.cdp.send<any>('Target.getTargets');
    return (targetInfos as TargetInfo[]).filter(drivable);
  }

  async #attach(targetId: string): Promise<string> {
    const { sessionId } = await this.cdp.send<any>('Target.attachToTarget', { targetId, flatten: true });
    this.#attached.add(sessionId);
    return sessionId;
  }

  /** Detach every session this invocation created (best-effort). */
  async dispose(): Promise<void> {
    for (const sessionId of this.#attached) {
      try {
        await this.cdp.send('Target.detachFromTarget', { sessionId });
      } catch {
        /* ignore */
      }
    }
    this.#attached.clear();
  }

  async syncTabs(): Promise<void> {
    const pages = await this.#pages();
    this.tabs.clear();
    let i = 0;
    for (const p of pages) {
      i++;
      const sessionId = await this.#attach(p.targetId);
      this.tabs.set(p.targetId, {
        targetId: p.targetId,
        sessionId,
        url: p.url,
        tabId: 't' + i,
        refRegistry: new Map(),
      });
    }
    if (this.activeTargetId && !this.tabs.has(this.activeTargetId)) this.activeTargetId = null;
  }

  async getActiveTab(): Promise<TabSession> {
    const pages = await this.#pages();
    if (!pages.length) throw new Error('No page open in Chrome');
    let active = readActive();
    if (!active || !pages.some((p) => p.targetId === active)) active = pages[0].targetId;
    writeActive(active);
    this.activeTargetId = active;
    const idx = pages.findIndex((p) => p.targetId === active);
    const sessionId = await this.#attach(active);
    return {
      targetId: active,
      sessionId,
      url: pages[idx].url,
      tabId: 't' + (idx + 1),
      refRegistry: new Map(),
    };
  }

  async getTab(idOrIndex: string): Promise<TabSession | undefined> {
    if (!this.tabs.size) await this.syncTabs();
    for (const t of this.tabs.values()) if (t.tabId === idOrIndex) return t;
    const n = Number(idOrIndex);
    if (!Number.isNaN(n)) return [...this.tabs.values()][n];
    return undefined;
  }

  setActive(targetId: string): void {
    writeActive(targetId);
    this.activeTargetId = targetId;
  }

  async newTab(url?: string): Promise<TabSession> {
    const { targetId } = await this.cdp.send<any>('Target.createTarget', { url: url || 'about:blank' });
    const sessionId = await this.#attach(targetId);
    this.setActive(targetId);
    const pages = await this.#pages();
    const idx = pages.findIndex((p) => p.targetId === targetId);
    const tab: TabSession = {
      targetId,
      sessionId,
      url: url || 'about:blank',
      tabId: 't' + (idx >= 0 ? idx + 1 : this.tabs.size + 1),
      refRegistry: new Map(),
    };
    this.tabs.set(targetId, tab);
    return tab;
  }

  async closeTab(targetId: string): Promise<void> {
    await this.cdp.send('Target.closeTarget', { targetId });
    this.tabs.delete(targetId);
    if (this.activeTargetId === targetId) {
      writeActive(null);
      this.activeTargetId = null;
    }
  }
}
