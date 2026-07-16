/**
 * Navigation & lifecycle handlers: open, back, forward, reload, close, wait, status.
 */
import type { Ctx, CommandResult, Handler } from '../lib/types.ts';
import { resolve } from '../lib/selectors.ts';

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Prepend https:// to a bare domain (no scheme, looks like host.tld). */
function normalizeUrl(raw: string): string {
  if (!raw) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw; // already has a scheme
  if (raw.startsWith('//')) return 'https:' + raw;
  if (raw === 'about:blank') return raw;
  // bare domain heuristic: contains a dot or is localhost
  if (/^localhost(:\d+)?(\/|$)/.test(raw) || /\.[a-z]{2,}/i.test(raw)) {
    return 'https://' + raw;
  }
  return raw;
}

/**
 * Wait for the page to finish loading by polling document.readyState (events are
 * not relayed over the transparent proxy). Resolves on 'complete' or on timeout.
 */
async function waitForLoad(ctx: Ctx, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // Give the navigation a moment to start before polling.
  await sleep(150);
  while (Date.now() < deadline) {
    try {
      const res = await ctx.cdp.send<any>(
        'Runtime.evaluate',
        { expression: 'document.readyState', returnByValue: true },
        ctx.tab.sessionId,
      );
      if (res?.result?.value === 'complete') return;
    } catch {
      /* page may be mid-navigation; keep polling */
    }
    await sleep(150);
  }
}

const open: Handler = async (ctx): Promise<CommandResult> => {
  const url = normalizeUrl(ctx.command.args[0] || 'about:blank');
  await ctx.cdp.send('Page.navigate', { url }, ctx.tab.sessionId);
  await waitForLoad(ctx);
  // Refresh the real url from the page.
  try {
    const res = await ctx.cdp.send<any>(
      'Runtime.evaluate',
      { expression: 'location.href', returnByValue: true },
      ctx.tab.sessionId,
    );
    if (typeof res?.result?.value === 'string') ctx.tab.url = res.result.value;
  } catch {
    ctx.tab.url = url;
  }
  return { ok: true, text: `Opened ${ctx.tab.url}` };
};

const back: Handler = async (ctx): Promise<CommandResult> => {
  const { currentIndex, entries } = await ctx.cdp.send<any>(
    'Page.getNavigationHistory',
    {},
    ctx.tab.sessionId,
  );
  if (currentIndex <= 0) return { ok: false, error: 'No previous page in history' };
  const entry = entries[currentIndex - 1];
  await ctx.cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }, ctx.tab.sessionId);
  await waitForLoad(ctx);
  ctx.tab.url = entry.url ?? ctx.tab.url;
  return { ok: true, text: `Back to ${ctx.tab.url}` };
};

const forward: Handler = async (ctx): Promise<CommandResult> => {
  const { currentIndex, entries } = await ctx.cdp.send<any>(
    'Page.getNavigationHistory',
    {},
    ctx.tab.sessionId,
  );
  if (currentIndex >= entries.length - 1) return { ok: false, error: 'No next page in history' };
  const entry = entries[currentIndex + 1];
  await ctx.cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }, ctx.tab.sessionId);
  await waitForLoad(ctx);
  ctx.tab.url = entry.url ?? ctx.tab.url;
  return { ok: true, text: `Forward to ${ctx.tab.url}` };
};

const reload: Handler = async (ctx): Promise<CommandResult> => {
  await ctx.cdp.send('Page.reload', {}, ctx.tab.sessionId);
  await waitForLoad(ctx);
  return { ok: true, text: `Reloaded ${ctx.tab.url}` };
};

const close: Handler = async (ctx): Promise<CommandResult> => {
  const tabId = ctx.tab.tabId;
  await ctx.state.closeTab(ctx.tab.targetId);
  return { ok: true, text: `Closed tab ${tabId}` };
};

/** Simple glob-ish match: `*` → `.*`, everything else literal. Substring if no `*`. */
function urlMatches(pattern: string, url: string): boolean {
  if (!pattern.includes('*')) return url.includes(pattern);
  const re = new RegExp(
    '^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
  );
  return re.test(url);
}

const wait: Handler = async (ctx): Promise<CommandResult> => {
  const arg = ctx.command.args[0];
  const flags = ctx.command.flags;

  // Duration: all digits.
  if (arg && /^\d+$/.test(arg)) {
    const ms = parseInt(arg, 10);
    await sleep(ms);
    return { ok: true, text: `Waited ${ms}ms` };
  }

  const deadline = Date.now() + 10_000;

  // --text: poll body innerText for the substring.
  if (typeof flags.text === 'string') {
    const needle = flags.text;
    while (Date.now() < deadline) {
      const res = await ctx.cdp.send<any>(
        'Runtime.evaluate',
        { expression: 'document.body ? document.body.innerText : ""', returnByValue: true },
        ctx.tab.sessionId,
      );
      if (String(res?.result?.value ?? '').includes(needle)) {
        return { ok: true, text: `Found text: ${needle}` };
      }
      await sleep(250);
    }
    return { ok: false, error: `Timed out waiting for text: ${needle}` };
  }

  // --url: poll the live location against a glob-ish pattern.
  if (typeof flags.url === 'string') {
    const pattern = flags.url;
    while (Date.now() < deadline) {
      const res = await ctx.cdp.send<any>(
        'Runtime.evaluate',
        { expression: 'location.href', returnByValue: true },
        ctx.tab.sessionId,
      );
      const url = String(res?.result?.value ?? '');
      if (urlMatches(pattern, url)) {
        ctx.tab.url = url;
        return { ok: true, text: `URL matched: ${url}` };
      }
      await sleep(250);
    }
    return { ok: false, error: `Timed out waiting for url: ${pattern}` };
  }

  // Otherwise treat arg as a selector and poll until it resolves.
  if (arg) {
    while (Date.now() < deadline) {
      try {
        await resolve(ctx.cdp, ctx.tab, arg);
        return { ok: true, text: `Found element: ${arg}` };
      } catch {
        await sleep(250);
      }
    }
    return { ok: false, error: `Timed out waiting for selector: ${arg}` };
  }

  return { ok: false, error: 'wait: provide a duration (ms), selector, --text, or --url' };
};

const status: Handler = async (ctx): Promise<CommandResult> => {
  // `status` is documented as a lightweight health probe ("proxy + browser
  // health") and must answer fast even when Chrome hasn't approved the remote
  // debugging dialog yet. Ask the proxy's `__status` control channel first —
  // it never touches Chrome or ensureConnected(), so it can't be dragged into
  // the up-to-5-minute approval wait that real CDP methods (like the
  // Browser.getVersion below) would trigger on a disconnected proxy.
  const proxyState = await ctx.cdp.send<any>('__status', {});

  if (!proxyState?.connected) {
    return {
      ok: true,
      text:
        `chrome-use proxy up (pid ${proxyState?.pid}) — Chrome not connected yet. ` +
        `Run a navigation command (e.g. "chrome-use open <url>") to trigger the ` +
        `"Allow remote debugging?" dialog, or approve it in Chrome if already showing.`,
      data: { connected: false, pid: proxyState?.pid, version: proxyState?.version },
    };
  }

  // Only reachable once the proxy already holds a live CDP connection, so
  // these calls resolve immediately instead of forcing a fresh connect.
  const version = await ctx.cdp.send<any>('Browser.getVersion');
  await ctx.state.syncTabs();
  const tabCount = ctx.state.tabs.size;
  return {
    ok: true,
    text: `chrome-use proxy up — ${version?.product ?? 'Chrome'}, ${tabCount} tab(s)`,
    data: { connected: true, version: version?.product, tabCount },
  };
};

export const handlers: Record<string, Handler> = {
  open,
  back,
  forward,
  reload,
  close,
  wait,
  status,
};
