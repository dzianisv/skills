/**
 * Tab management handler: list / new / switch / close.
 *
 *   tab                  → list tabs
 *   tab new [url]        → open a new tab (and switch to it)
 *   tab <tN|index>       → switch to a tab
 *   tab close [tN]       → close a tab (active if omitted)
 */
import type { Ctx, CommandResult, Handler, TabSession } from '../lib/types.ts';

/** Get the page title for a tab (best-effort). */
async function tabTitle(ctx: Ctx, tab: TabSession): Promise<string> {
  try {
    const res = await ctx.cdp.send<any>(
      'Runtime.evaluate',
      { expression: 'document.title', returnByValue: true },
      tab.sessionId,
    );
    return String(res?.result?.value ?? '');
  } catch {
    return '';
  }
}

const tab: Handler = async (ctx): Promise<CommandResult> => {
  const sub = ctx.command.args[0];

  // No args → list.
  if (!sub) {
    await ctx.state.syncTabs();
    const lines: string[] = [];
    const data: Array<{ tabId: string; url: string; title: string; active: boolean }> = [];
    for (const t of ctx.state.tabs.values()) {
      const active = t.targetId === ctx.state.activeTargetId;
      const title = await tabTitle(ctx, t);
      lines.push(`${active ? '*' : ' '} ${t.tabId}  ${t.url}${title ? `  ${title}` : ''}`);
      data.push({ tabId: t.tabId, url: t.url, title, active });
    }
    return { ok: true, text: lines.join('\n') || 'No tabs open', data };
  }

  // tab new [url]
  if (sub === 'new') {
    const url = ctx.command.args[1];
    const created = await ctx.state.newTab(url);
    return { ok: true, text: `Opened ${created.tabId}`, data: { tabId: created.tabId } };
  }

  // tab close [tN]
  if (sub === 'close') {
    const target = ctx.command.args[1];
    let victim: TabSession | undefined;
    if (target) {
      victim = await ctx.state.getTab(target);
      if (!victim) return { ok: false, error: `No such tab: ${target}` };
    } else {
      victim = ctx.tab;
    }
    const id = victim.tabId;
    await ctx.state.closeTab(victim.targetId);
    return { ok: true, text: `Closed tab ${id}` };
  }

  // tab <tN|index> → switch
  const found = await ctx.state.getTab(sub);
  if (!found) return { ok: false, error: `No such tab: ${sub}` };
  ctx.state.setActive(found.targetId);
  return { ok: true, text: `Switched to ${found.tabId}`, data: { tabId: found.tabId } };
};

export const handlers: Record<string, Handler> = { tab };
