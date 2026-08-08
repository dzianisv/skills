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

/**
 * A page target we are willing to drive (skip devtools/extension surfaces).
 *
 * `chrome-extension://` pages are excluded by default because they are rarely
 * the user's intent and are easy to hit by accident. Some legitimate tasks DO
 * need them (e.g. reading/toggling an extension's own options page), so set
 * `CHROME_USE_ALLOW_EXTENSION=1` to opt in for that invocation only. Default
 * behaviour is unchanged.
 */
const ALLOW_EXTENSION_PAGES = process.env.CHROME_USE_ALLOW_EXTENSION === '1';

function drivable(t: TargetInfo): boolean {
  return (
    t.type === 'page' &&
    !t.url.startsWith('devtools://') &&
    (ALLOW_EXTENSION_PAGES || !t.url.startsWith('chrome-extension://'))
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
    // Explicit include-all filter ([{}]) so page targets in OTHER browser
    // contexts (e.g. incognito contexts created via Target.createBrowserContext)
    // are consistently returned. Without a filter, getTargets can intermittently
    // omit cross-context pages, which makes the active-tab pointer silently fall
    // back to a page in the default context.
    const { targetInfos } = await this.cdp.send<any>('Target.getTargets', { filter: [{}] });
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
    // Opt-in hard pin: when CHROME_USE_PIN_TARGET is set, always drive exactly
    // that targetId and NEVER silently fall back to another tab/context. This is
    // essential when driving a tab in a non-default browser context (e.g. an
    // incognito login) alongside other tabs: a transient getTargets miss must
    // not cause commands to land on an unrelated tab in the default context.
    const pinned = process.env.CHROME_USE_PIN_TARGET;
    if (pinned) {
      if (!pages.some((p) => p.targetId === pinned)) {
        throw new Error(
          `CHROME_USE_PIN_TARGET=${pinned} is not among the current page targets; refusing to fall back to another tab.`,
        );
      }
      writeActive(pinned);
      this.activeTargetId = pinned;
      const idx = pages.findIndex((p) => p.targetId === pinned);
      const sessionId = await this.#attach(pinned);
      try {
        await this.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
      } catch {
        /* not fatal */
      }
      return { targetId: pinned, sessionId, url: pages[idx].url, tabId: 't' + (idx + 1), refRegistry: new Map() };
    }
    let active = readActive();
    if (!active || !pages.some((p) => p.targetId === active)) active = pages[0].targetId;
    writeActive(active);
    this.activeTargetId = active;
    const idx = pages.findIndex((p) => p.targetId === active);
    const sessionId = await this.#attach(active);
    // Treat the page as focused even when the Chrome window is in the OS
    // background. Without this, synthetic clicks on contenteditable regions
    // register but do NOT place a caret / focus the editable (buttons still
    // work), so keystrokes silently no-op. The override is per-session and is
    // reset when the session detaches at end of the invocation, so re-apply it
    // on every attach. Best-effort: not all targets support it.
    try {
      await this.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
    } catch {
      /* not fatal */
    }
    return {
      targetId: active,
      sessionId,
      url: pages[idx].url,
      tabId: 't' + (idx + 1),
      refRegistry: new Map(),
    };
  }

  /**
   * Resolve a tab by its positional `tabId` (`t1`, `t2`, ...), a bare numeric
   * index, or — as a fallback — a URL substring match (e.g. `pull/2945`).
   *
   * Positional tabIds are recomputed from scratch on every CLI invocation
   * (see syncTabs) from whatever tabs currently exist. In a browser shared
   * with other concurrent automation/processes that open or close tabs
   * between invocations, the same position can silently point at a
   * different physical tab from one command to the next. Matching by URL
   * substring gives callers a way to keep re-targeting the *same* tab
   * across multiple separate commands even while positions drift.
   */
  async getTab(idOrIndex: string): Promise<TabSession | undefined> {
    if (!this.tabs.size) await this.syncTabs();
    for (const t of this.tabs.values()) if (t.tabId === idOrIndex) return t;
    const n = Number(idOrIndex);
    if (!Number.isNaN(n)) return [...this.tabs.values()][n];
    const byUrl = [...this.tabs.values()].filter((t) => t.url.includes(idOrIndex));
    if (byUrl.length === 1) return byUrl[0];
    return undefined;
  }

  setActive(targetId: string): void {
    writeActive(targetId);
    this.activeTargetId = targetId;
  }

  async newTab(url?: string, opts?: { incognito?: boolean }): Promise<TabSession> {
    const createParams: Record<string, unknown> = { url: url || 'about:blank' };
    if (opts?.incognito) {
      const { browserContextId } = await this.cdp.send<any>('Target.createBrowserContext', {
        disposeOnDetach: false,
      });
      createParams.browserContextId = browserContextId;
    }
    const { targetId } = await this.cdp.send<any>('Target.createTarget', createParams);
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
