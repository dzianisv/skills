/**
 * Pure-function unit tests — no browser, fast. Run: node --test scripts/test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv, ALIASES } from '../lib/argv.ts';
import { parsePortFile } from '../lib/devtools-port.ts';
import { isRef } from '../lib/selectors.ts';
import { handlers as filesHandlers } from '../commands/files.ts';
import type { Ctx } from '../lib/types.ts';

test('parseArgv: subcommand + positional args', () => {
  const c = parseArgv(['fill', '@e1', 'hello world']);
  assert.equal(c.name, 'fill');
  assert.deepEqual(c.args, ['@e1', 'hello world']);
});

test('parseArgv: boolean flags do not consume the next token', () => {
  const c = parseArgv(['snapshot', '-i', '--json']);
  assert.equal(c.name, 'snapshot');
  assert.equal(c.flags.interactive, true);
  assert.equal(c.flags.json, true);
  assert.deepEqual(c.args, []);
});

test('parseArgv: value flags consume the next token', () => {
  const c = parseArgv(['snapshot', '-s', '#main']);
  assert.equal(c.flags.selector, '#main');
});

test('parseArgv: aliases normalize to canonical names', () => {
  assert.equal(parseArgv(['goto', 'x']).name, ALIASES['goto'] ?? 'open');
  assert.equal(parseArgv(['goto', 'x']).name, 'open');
});

test('parseArgv: no args → help', () => {
  assert.equal(parseArgv([]).name, 'help');
});

test('parsePortFile: valid two-line body → ws endpoint', () => {
  const ws = parsePortFile('9222\n/devtools/browser/abc-123\n');
  assert.equal(ws, 'ws://127.0.0.1:9222/devtools/browser/abc-123');
});

test('parsePortFile: malformed body throws', () => {
  assert.throws(() => parsePortFile('not-a-port'));
  assert.throws(() => parsePortFile('99999999\n/x'));
});

test('isRef: only @eN matches', () => {
  assert.equal(isRef('@e1'), true);
  assert.equal(isRef('@e42'), true);
  assert.equal(isRef('#e1'), false);
  assert.equal(isRef('text=e1'), false);
  assert.equal(isRef('button'), false);
});

/**
 * file_upload's validation (missing selector/paths, nonexistent files) returns
 * before ever touching ctx.cdp/ctx.tab, so a bare mock ctx exercises it without a
 * live browser connection.
 */
function mockCtx(args: string[]): Ctx {
  return {
    cdp: {} as Ctx['cdp'],
    state: {} as Ctx['state'],
    tab: {} as Ctx['tab'],
    command: { name: 'file_upload', args, flags: {} },
  };
}

test('file_upload: missing selector errors', async () => {
  const res = await filesHandlers.file_upload(mockCtx([]));
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /selector/);
});

test('file_upload: missing file path errors', async () => {
  const res = await filesHandlers.file_upload(mockCtx(['#file-input']));
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /file path required/);
});

test('file_upload: nonexistent file path errors', async () => {
  const res = await filesHandlers.file_upload(
    mockCtx(['#file-input', '/definitely/does/not/exist-chrome-use-test.png']),
  );
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /not found/);
});
