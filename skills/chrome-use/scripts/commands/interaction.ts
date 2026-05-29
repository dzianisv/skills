/**
 * Interaction handlers: click, fill, type, press, focus, hover, scroll.
 * All input goes through the trusted CDP Input domain (see lib/input.ts).
 */
import type { Ctx, CommandResult, Handler } from '../lib/types.ts';
import { resolve } from '../lib/selectors.ts';
import {
  clickElement,
  hoverElement,
  focusElement,
  fillElement,
  typeText,
  pressKey,
  scrollBy,
} from '../lib/input.ts';

const click: Handler = async (ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'click: selector or @ref required' };
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await clickElement(ctx.cdp, ctx.tab.sessionId, el);
  const note = ctx.command.flags['new-tab'] ? ' (new-tab)' : '';
  return { ok: true, text: `Clicked ${sel}${note}` };
};

const fill: Handler = async (ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'fill: selector or @ref required' };
  const text = ctx.command.args.slice(1).join(' ');
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await fillElement(ctx.cdp, ctx.tab.sessionId, el, text);
  return { ok: true, text: `Filled ${sel}` };
};

const type: Handler = async (ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'type: selector or @ref required' };
  const text = ctx.command.args.slice(1).join(' ');
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await typeText(ctx.cdp, ctx.tab.sessionId, el, text);
  return { ok: true, text: `Typed into ${sel}` };
};

const press: Handler = async (ctx): Promise<CommandResult> => {
  const key = ctx.command.args[0];
  if (!key) return { ok: false, error: 'press: key required (e.g. Enter, Control+a)' };
  await pressKey(ctx.cdp, ctx.tab.sessionId, key);
  return { ok: true, text: `Pressed ${key}` };
};

const focus: Handler = async (ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'focus: selector or @ref required' };
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await focusElement(ctx.cdp, ctx.tab.sessionId, el);
  return { ok: true, text: `Focused ${sel}` };
};

const hover: Handler = async (ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'hover: selector or @ref required' };
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await hoverElement(ctx.cdp, ctx.tab.sessionId, el);
  return { ok: true, text: `Hovered ${sel}` };
};

const scroll: Handler = async (ctx): Promise<CommandResult> => {
  const raw = (ctx.command.args[0] ?? 'down').toLowerCase();
  const dir = (['up', 'down', 'left', 'right'] as const).includes(raw as any)
    ? (raw as 'up' | 'down' | 'left' | 'right')
    : 'down';
  const px = Number(ctx.command.args[1]) || 400;
  await scrollBy(ctx.cdp, ctx.tab.sessionId, dir, px);
  return { ok: true, text: `Scrolled ${dir} ${px}px` };
};

export const handlers: Record<string, Handler> = {
  click,
  fill,
  type,
  press,
  focus,
  hover,
  scroll,
};
