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
  centerOf,
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

/**
 * upload <@ref|sel> <path...>  — set files on a <input type=file> via CDP
 * DOM.setFileInputFiles. This is the same privileged mechanism DevTools itself
 * uses to drive file inputs headlessly; it never opens the native OS file
 * picker, so it works over the existing approved CDP connection.
 */
const upload: Handler = async (ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'upload: selector or @ref required' };
  const paths = ctx.command.args.slice(1);
  if (paths.length === 0) return { ok: false, error: 'upload: at least one file path required' };
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await ctx.cdp.send('DOM.setFileInputFiles', { files: paths, ...el }, ctx.tab.sessionId);
  return { ok: true, text: `Uploaded ${paths.length} file(s) to ${sel}` };
};

/**
 * dragdrop <@ref|sel> <path...>  — simulate an OS-level file drag-and-drop onto a
 * dropzone via CDP Input.dispatchDragEvent. Some modern editors (e.g. GitHub's
 * newer Primer-based comment box) mount no persistent <input type=file> at all —
 * they only render a dropzone and open a file chooser in response to a genuinely
 * trusted click, which we can't answer without event relay support in the proxy
 * (Page.fileChooserOpened isn't forwarded — see lib/proxy-client.ts). Dragging a
 * real file path onto the dropzone sidesteps the file-chooser flow entirely: it's
 * a single request/response CDP command (dragEnter/dragOver/drop), same shape as
 * every other command already relayed through the proxy, so no proxy changes or
 * dialog re-approval are needed.
 */
const dragdrop: Handler = async (ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'dragdrop: selector or @ref required' };
  const paths = ctx.command.args.slice(1);
  if (paths.length === 0) return { ok: false, error: 'dragdrop: at least one file path required' };
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  const { x, y } = await centerOf(ctx.cdp, ctx.tab.sessionId, el);
  const data = { items: [], files: paths, dragOperationsMask: 1 };
  await ctx.cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data }, ctx.tab.sessionId);
  await ctx.cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data }, ctx.tab.sessionId);
  await ctx.cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data }, ctx.tab.sessionId);
  return { ok: true, text: `Dropped ${paths.length} file(s) onto ${sel}` };
};

export const handlers: Record<string, Handler> = {
  click,
  fill,
  type,
  press,
  focus,
  hover,
  scroll,
  upload,
  dragdrop,
};
