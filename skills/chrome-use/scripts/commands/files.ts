/**
 * File input handling: file_upload.
 *
 * Drives `DOM.setFileInputFiles`, the CDP method for setting an
 * `<input type="file">`'s selected files programmatically — there is no native OS
 * file picker a script can drive, so this is the only way to attach files (e.g.
 * screenshots to a GitHub issue comment) without a human dragging/dropping.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Ctx, CommandResult, Handler } from '../lib/types.ts';
import { resolve } from '../lib/selectors.ts';
import { nodeAddr } from '../lib/input.ts';

const file_upload: Handler = async (ctx: Ctx): Promise<CommandResult> => {
  const sel = ctx.command.args[0];
  if (!sel) return { ok: false, error: 'file_upload: selector or @ref required' };

  const files = ctx.command.args.slice(1);
  if (files.length === 0) return { ok: false, error: 'file_upload: at least one file path required' };

  const absFiles = files.map((f) => path.resolve(f));
  const missing = absFiles.filter((f) => !fs.existsSync(f));
  if (missing.length > 0) {
    return { ok: false, error: `file_upload: file(s) not found: ${missing.join(', ')}` };
  }

  const el = await resolve(ctx.cdp, ctx.tab, sel);
  await ctx.cdp.send('DOM.setFileInputFiles', { files: absFiles, ...nodeAddr(el) }, ctx.tab.sessionId);
  return { ok: true, text: `Uploaded ${absFiles.length} file(s) to ${sel}` };
};

export const handlers: Record<string, Handler> = {
  file_upload,
};
