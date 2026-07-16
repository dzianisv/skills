/**
 * Inspection handlers: snapshot, get, screenshot, eval.
 */
import fs from 'node:fs';
import type { Ctx, CommandResult, Handler, SnapshotOptions } from '../lib/types.ts';
import { resolve } from '../lib/selectors.ts';
import { takeSnapshot } from '../lib/snapshot.ts';

const snapshot: Handler = async (ctx): Promise<CommandResult> => {
  const flags = ctx.command.flags;
  const opts: SnapshotOptions = {
    interactive: flags.interactive === true,
    selector: typeof flags.selector === 'string' ? flags.selector : undefined,
  };
  const r = await takeSnapshot(ctx.cdp, ctx.tab, opts);
  ctx.tab.refRegistry = r.refs;
  if (flags.json) return { ok: true, data: r.nodes };
  const text = `${r.text}\n${r.refs.size} refs`;
  return { ok: true, text };
};

/** Run a 1-arg function on a resolved element and return its value by value. */
async function callOnElement(ctx: Ctx, sel: string, fnBody: string): Promise<any> {
  const el = await resolve(ctx.cdp, ctx.tab, sel);
  const res = await ctx.cdp.send<any>(
    'Runtime.callFunctionOn',
    {
      functionDeclaration: `function() { ${fnBody} }`,
      objectId: el.objectId,
      returnByValue: true,
    },
    ctx.tab.sessionId,
  );
  if (res?.exceptionDetails) {
    throw new Error(res.exceptionDetails.text ?? 'evaluation failed');
  }
  return res?.result?.value;
}

const get: Handler = async (ctx): Promise<CommandResult> => {
  const sub = ctx.command.args[0];
  if (!sub) return { ok: false, error: 'get: expected url|title|text|html|value|attr' };

  switch (sub) {
    case 'url': {
      let url = ctx.tab.url;
      try {
        const p: Record<string, unknown> = { expression: 'location.href', returnByValue: true };
        if (ctx.tab.executionContextId != null) p.contextId = ctx.tab.executionContextId;
        const res = await ctx.cdp.send<any>('Runtime.evaluate', p, ctx.tab.sessionId);
        if (typeof res?.result?.value === 'string') url = res.result.value;
      } catch {
        /* fall back to cached url */
      }
      return { ok: true, text: url, data: { url } };
    }
    case 'title': {
      const p: Record<string, unknown> = { expression: 'document.title', returnByValue: true };
      if (ctx.tab.executionContextId != null) p.contextId = ctx.tab.executionContextId;
      const res = await ctx.cdp.send<any>('Runtime.evaluate', p, ctx.tab.sessionId);
      const title = String(res?.result?.value ?? '');
      return { ok: true, text: title, data: { title } };
    }
    case 'text':
    case 'html':
    case 'value': {
      const sel = ctx.command.args[1];
      if (!sel) return { ok: false, error: `get ${sub}: selector required` };
      const prop = sub === 'text' ? 'innerText' : sub === 'html' ? 'innerHTML' : 'value';
      const value = await callOnElement(ctx, sel, `return this.${prop};`);
      return { ok: true, text: String(value ?? ''), data: { value } };
    }
    case 'attr': {
      const sel = ctx.command.args[1];
      const attr = ctx.command.args[2];
      if (!sel || !attr) return { ok: false, error: 'get attr: <sel> <attr> required' };
      const value = await callOnElement(ctx, sel, `return this.getAttribute(${JSON.stringify(attr)});`);
      return { ok: true, text: String(value ?? ''), data: { value } };
    }
    default:
      return { ok: false, error: `get: unknown subcommand '${sub}'` };
  }
};

const screenshot: Handler = async (ctx): Promise<CommandResult> => {
  const path = ctx.command.args[0] || `/tmp/chrome-use-${Date.now()}.png`;
  const res = await ctx.cdp.send<any>(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: !!ctx.command.flags.full, fromSurface: true },
    ctx.tab.sessionId,
  );
  const data = res?.data;
  if (!data) return { ok: false, error: 'screenshot: no image data returned' };
  fs.writeFileSync(path, Buffer.from(data, 'base64'));
  return { ok: true, text: `Saved screenshot to ${path}`, data: { path } };
};

const evalCmd: Handler = async (ctx): Promise<CommandResult> => {
  const expr = ctx.command.args.join(' ');
  if (!expr) return { ok: false, error: 'eval: expression required' };
  const params: Record<string, unknown> = { expression: expr, returnByValue: true, awaitPromise: true };
  if (ctx.tab.executionContextId != null) params.contextId = ctx.tab.executionContextId;
  const res = await ctx.cdp.send<any>('Runtime.evaluate', params, ctx.tab.sessionId);
  if (res?.exceptionDetails) {
    return { ok: false, error: res.exceptionDetails.text ?? 'eval failed' };
  }
  const value = res?.result?.value;
  return { ok: true, text: JSON.stringify(value, null, 2), data: { value } };
};

/**
 * Override (or clear) the page's device viewport via CDP Emulation, so
 * responsive layouts can be exercised without physically resizing the real
 * Chrome window (useful when the host screen is smaller than the desired
 * viewport, e.g. testing a 1440x900 desktop breakpoint on a 1440x900 display
 * that already loses vertical space to window chrome).
 *
 * Usage: `emulate <width> <height> [--mobile] [--scale N]` or `emulate clear`.
 */
const emulate: Handler = async (ctx): Promise<CommandResult> => {
  if (ctx.command.args[0] === 'clear') {
    await ctx.cdp.send('Emulation.clearDeviceMetricsOverride', {}, ctx.tab.sessionId);
    return { ok: true, text: 'Cleared device metrics override' };
  }
  const width = parseInt(ctx.command.args[0], 10);
  const height = parseInt(ctx.command.args[1], 10);
  if (!width || !height) {
    return { ok: false, error: 'emulate: <width> <height> [--mobile] [--scale N] | emulate clear' };
  }
  const mobile = ctx.command.flags.mobile === true;
  const scale = ctx.command.flags.scale ? Number(ctx.command.flags.scale) : 1;
  await ctx.cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: scale, mobile, screenWidth: width, screenHeight: height },
    ctx.tab.sessionId,
  );
  if (mobile) {
    await ctx.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, ctx.tab.sessionId);
  }
  return { ok: true, text: `Set viewport to ${width}x${height} (mobile=${mobile}, scale=${scale})` };
};

export const handlers: Record<string, Handler> = {
  snapshot,
  get,
  screenshot,
  eval: evalCmd,
  emulate,
};
