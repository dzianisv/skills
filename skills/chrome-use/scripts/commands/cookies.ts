/**
 * Cookie handler: list / set / clear, scoped to the active tab's URL.
 *
 *   cookies                    → list cookies for the active tab's URL
 *   cookies set <name> <value> → set a cookie on the active tab's URL
 *   cookies clear              → clear all browser cookies
 */
import type { Ctx, CommandResult, Handler } from '../lib/types.ts';

const cookies: Handler = async (ctx): Promise<CommandResult> => {
  const sub = ctx.command.args[0];

  if (!sub) {
    const res = await ctx.cdp.send<any>(
      'Network.getCookies',
      { urls: [ctx.tab.url] },
      ctx.tab.sessionId,
    );
    const list = res?.cookies ?? [];
    const text = list.length
      ? list.map((c: any) => `${c.name}=${c.value}`).join('\n')
      : 'No cookies';
    return { ok: true, text, data: list };
  }

  if (sub === 'set') {
    const name = ctx.command.args[1];
    const value = ctx.command.args[2] ?? '';
    if (!name) return { ok: false, error: 'cookies set: <name> <value> required' };
    const res = await ctx.cdp.send<any>(
      'Network.setCookie',
      { name, value, url: ctx.tab.url },
      ctx.tab.sessionId,
    );
    if (res?.success === false) return { ok: false, error: `Failed to set cookie ${name}` };
    return { ok: true, text: `Set cookie ${name}` };
  }

  if (sub === 'clear') {
    await ctx.cdp.send('Network.clearBrowserCookies', {}, ctx.tab.sessionId);
    return { ok: true, text: 'Cleared all cookies' };
  }

  return { ok: false, error: `cookies: unknown subcommand '${sub}'` };
};

export const handlers: Record<string, Handler> = { cookies };
