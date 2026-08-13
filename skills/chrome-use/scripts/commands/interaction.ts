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
  typeTextByKeys,
  pressKey,
  scrollBy,
  centerOf,
} from '../lib/input.ts';

// Resolve secret text without exposing it on argv: `@ENV:VARNAME` reads process.env[VARNAME].
function resolveText(raw: string): string {
  const m = /^@ENV:(.+)$/.exec(raw);
  if (m) return process.env[m[1]] ?? '';
  return raw;
}

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
  const text = resolveText(ctx.command.args.slice(1).join(' '));
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await fillElement(ctx.cdp, ctx.tab.sessionId, el, text);
  return { ok: true, text: `Filled ${sel}` };
};

const type: Handler = async (ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'type: selector or @ref required' };
  const text = resolveText(ctx.command.args.slice(1).join(' '));
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await typeText(ctx.cdp, ctx.tab.sessionId, el, text);
  return { ok: true, text: `Typed into ${sel}` };
};

const press: Handler = async (ctx): Promise<CommandResult> => {
  const key = ctx.command.args[0];
  if (!key) return { ok: false, error: 'press: key required (e.g. Enter, Control+a)' };
  // `--on <selector>` focuses the element first, in the SAME session, so the
  // trusted key routes to it. Needed for buttons in same-process subframes
  // where coordinate clicks miss but node-based focus + key works (like fill).
  const on = ctx.command.flags.on;
  if (typeof on === 'string' && on) {
    const el = await resolve(ctx.cdp, ctx.tab, on);
    await focusElement(ctx.cdp, ctx.tab.sessionId, el);
  }
  await pressKey(ctx.cdp, ctx.tab.sessionId, key);
  return { ok: true, text: `Pressed ${key}${typeof on === 'string' && on ? ` on ${on}` : ''}` };
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

const clickat: Handler = async (ctx): Promise<CommandResult> => {
  const x = Number(ctx.command.args[0]);
  const y = Number(ctx.command.args[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) return { ok: false, error: 'clickat: numeric x y required' };
  const s = ctx.tab.sessionId;
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, s);
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }, s);
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 1 }, s);
  return { ok: true, text: `Clicked at ${x},${y}` };
};

// Human-like press-move-release drag from absolute x1,y1 to x2,y2. Needed for
// slider verifications and canvas drags that require a real pointer trajectory
// with intermediate mouseMoved events rather than a single jump.
const dragto: Handler = async (ctx): Promise<CommandResult> => {
  const [x1, y1, x2, y2] = ctx.command.args.slice(0, 4).map(Number);
  if ([x1, y1, x2, y2].some((n) => Number.isNaN(n))) {
    return { ok: false, error: 'dragto: numeric x1 y1 x2 y2 required' };
  }
  const steps = Number(ctx.command.flags.steps) || 30;
  const s = ctx.tab.sessionId;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 }, s);
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1, buttons: 1 }, s);
  await sleep(120);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = x1 + (x2 - x1) * ease;
    const y = y1 + (y2 - y1) * ease + Math.sin(t * Math.PI) * 2;
    await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }, s);
    await sleep(10 + Math.random() * 25);
  }
  await sleep(150);
  await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1, buttons: 1 }, s);
  return { ok: true, text: `Dragged ${x1},${y1} -> ${x2},${y2} in ${steps} steps` };
};

// Insert text at the current caret via CDP Input.insertText, WITHOUT calling
// DOM.focus first. Needed for block-level contenteditables (e.g. Notion page
// blocks) that reject DOM.focus but accept trusted insertText once a real click
// has placed the caret. Place the caret first with `click`/`clickat`, then run
// `inserttext "<text>"`.
const inserttext: Handler = async (ctx): Promise<CommandResult> => {
  const clickSel = typeof ctx.command.flags.click === 'string' ? ctx.command.flags.click : '';
  const text = resolveText(ctx.command.args.join(' '));
  if (!text) return { ok: false, error: 'inserttext: text required' };
  if (clickSel) {
    const el = await resolve(ctx.cdp, ctx.tab, clickSel);
    await clickElement(ctx.cdp, ctx.tab.sessionId, el);
    await new Promise((r) => setTimeout(r, 150));
  }
  await ctx.cdp.send('Input.insertText', { text }, ctx.tab.sessionId);
  return { ok: true, text: `Inserted ${text.length} chars` };
};

// Enable focus emulation so the renderer treats the page as focused even when
// the Chrome window is in the OS background. Without this, synthetic clicks on
// contenteditable regions register but do NOT place a caret / focus the editable
// (buttons still work), so typing into Notion blocks silently no-ops. Also brings
// the tab to the front. Idempotent; persists on the connection until navigation.
const focuspage: Handler = async (ctx): Promise<CommandResult> => {
  const s = ctx.tab.sessionId;
  try { await ctx.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, s); } catch { /* not fatal */ }
  try { await ctx.cdp.send('Page.bringToFront', {}, s); } catch { /* not fatal */ }
  return { ok: true, text: 'Focus emulation enabled + tab brought to front' };
};

// Type a whole string via per-character key events into the currently-focused
// editable. Optional first arg `--click <selector>` places the caret with a real
// trusted click in this same invocation (so focus + typing share one session),
// which is what block-level contenteditables (Notion) require. Usage:
//   typekeys "some text"
//   typekeys --click '[data-block-id="…"] .content-editable-leaf-rtl' "some text"
const typekeys: Handler = async (ctx): Promise<CommandResult> => {
  const clickSel = typeof ctx.command.flags.click === 'string' ? ctx.command.flags.click : '';
  const text = resolveText(ctx.command.args.join(' '));
  if (!text) return { ok: false, error: 'typekeys: text required' };
  if (clickSel) {
    const el = await resolve(ctx.cdp, ctx.tab, clickSel);
    await clickElement(ctx.cdp, ctx.tab.sessionId, el);
    await new Promise((r) => setTimeout(r, 150));
  }
  await typeTextByKeys(ctx.cdp, ctx.tab.sessionId, text);
  return { ok: true, text: `Typed ${text.length} chars via keys` };
};

export const handlers: Record<string, Handler> = {
  click,
  clickat,
  dragto,
  inserttext,
  typekeys,
  focuspage,
  fill,
  type,
  press,
  focus,
  hover,
  scroll,
  upload,
  dragdrop,
};
