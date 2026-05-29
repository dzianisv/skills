/**
 * Golden end-to-end eval suite for chrome-use.
 *
 * Drives the REAL chrome-use CLI (black-box) against a hermetic, throwaway headless
 * Chrome + a local fixture server (see harness.ts). One Chrome/proxy is shared for
 * the whole file; each test opens the fixture it needs so tests stay independent.
 *
 * Run: node --test scripts/test/        (Node 22+, no dependencies)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, type Harness } from './harness.ts';

let h: Harness;
/** Replace the dynamic fixture base URL with a stable placeholder for golden compares. */
const norm = (s: string) => (h ? s.split(h.baseUrl).join('{BASE}') : s);

before(async () => {
  h = await setup();
});
after(async () => {
  await h?.teardown();
});

// ── Connection / navigation ──────────────────────────────────────────────────

test('status reports proxy + Chrome health', async () => {
  const r = await h.cu('status');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /proxy up/);
  assert.match(r.stdout, /tab\(s\)/);
});

test('open navigates; get url/title reflect the page', async () => {
  const o = await h.cu('open', h.fixtureUrl('form.html'));
  assert.equal(o.code, 0, o.stderr);
  assert.equal(norm(o.stdout).trim(), 'Opened {BASE}/form.html');
  assert.equal((await h.cu('get', 'url')).stdout.trim(), h.fixtureUrl('form.html'));
  assert.equal((await h.cu('get', 'title')).stdout.trim(), 'Form Fixture');
});

test('back / forward / reload move through history', async () => {
  await h.cu('open', h.fixtureUrl('index.html'));
  await h.cu('open', h.fixtureUrl('form.html'));
  assert.equal((await h.cu('back')).code, 0);
  assert.equal((await h.cu('get', 'url')).stdout.trim(), h.fixtureUrl('index.html'));
  assert.equal((await h.cu('forward')).code, 0);
  assert.equal((await h.cu('get', 'url')).stdout.trim(), h.fixtureUrl('form.html'));
  assert.equal((await h.cu('reload')).code, 0);
});

// ── Snapshot + @e1 refs (golden trees) ───────────────────────────────────────

test('snapshot -i golden tree (form)', async () => {
  await h.cu('open', h.fixtureUrl('form.html'));
  const r = await h.cu('snapshot', '-i');
  assert.equal(r.stdout, '  @e1 [textbox] "Name"\n  @e2 [checkbox] ""\n  @e3 [button] "Submit"\n3 refs\n');
});

test('snapshot full golden tree (content), port-normalized', async () => {
  await h.cu('open', h.fixtureUrl('content.html'));
  const r = await h.cu('snapshot');
  assert.equal(
    norm(r.stdout),
    '  @e1 [heading] "Content Heading"\n' +
      '  @e2 [generic] "The quick brown fox."\n' +
      '    @e3 [link] "Home" {BASE}/index.html\n' +
      '3 refs\n',
  );
});

test('snapshot --json returns structured nodes', async () => {
  await h.cu('open', h.fixtureUrl('form.html'));
  const r = await h.cu('snapshot', '-i', '--json');
  assert.ok(Array.isArray(r.json), r.stdout);
  assert.equal(r.json.length, 3);
  assert.deepEqual(r.json.map((n: any) => n.role), ['textbox', 'checkbox', 'button']);
  assert.equal(r.json[0].ref, 'e1');
});

test('snapshot -s scopes to a CSS root', async () => {
  await h.cu('open', h.fixtureUrl('index.html'));
  const r = await h.cu('snapshot', '-i', '-s', 'nav');
  assert.match(r.stdout, /Go to form/);
  assert.match(r.stdout, /Go to content/);
});

// ── Selectors ────────────────────────────────────────────────────────────────

test('selectors: CSS, text=, and missing-element error', async () => {
  await h.cu('open', h.fixtureUrl('content.html'));
  assert.equal((await h.cu('get', 'text', '#para')).stdout.trim(), 'The quick brown fox.');
  assert.equal((await h.cu('get', 'text', 'text=Content Heading')).stdout.trim(), 'Content Heading');
  const miss = await h.cu('get', 'text', '#does-not-exist');
  assert.notEqual(miss.code, 0);
  assert.match(miss.stderr, /no element/i);
});

test('stale @ref after navigation gives a clear re-snapshot error', async () => {
  await h.cu('open', h.fixtureUrl('form.html'));
  await h.cu('snapshot', '-i');
  await h.cu('open', h.fixtureUrl('content.html')); // navigate away → refs invalid
  const r = await h.cu('click', '@e1');
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /snapshot/i);
});

// ── get ──────────────────────────────────────────────────────────────────────

test('get text / html / attr', async () => {
  await h.cu('open', h.fixtureUrl('content.html'));
  assert.equal((await h.cu('get', 'attr', '#para', 'data-kind')).stdout.trim(), 'lead');
  assert.match((await h.cu('get', 'html', '#para')).stdout, /quick brown/);
});

// ── Interaction (trusted input) ──────────────────────────────────────────────

test('fill sets an exact value (no stray characters)', async () => {
  await h.cu('open', h.fixtureUrl('form.html'));
  await h.cu('snapshot', '-i');
  assert.equal((await h.cu('fill', '@e1', 'hello world')).code, 0);
  assert.equal((await h.cu('get', 'value', '#name')).stdout.trim(), 'hello world');
});

test('press Control+a then Backspace clears the field (editor chord)', async () => {
  await h.cu('open', h.fixtureUrl('form.html'));
  await h.cu('snapshot', '-i');
  await h.cu('fill', '@e1', 'hello world');
  await h.cu('focus', '#name');
  await h.cu('press', 'Control+a');
  await h.cu('press', 'Backspace');
  assert.equal((await h.cu('get', 'value', '#name')).stdout.trim(), '');
});

test('type + trusted click fires the button onclick handler', async () => {
  await h.cu('open', h.fixtureUrl('form.html'));
  await h.cu('snapshot', '-i');
  await h.cu('type', '@e1', 'submitted-value');
  assert.equal((await h.cu('click', '@e3')).code, 0); // @e3 = Submit button
  assert.equal((await h.cu('get', 'title')).stdout.trim(), 'submitted-value');
});

test('click toggles a checkbox', async () => {
  await h.cu('open', h.fixtureUrl('form.html'));
  await h.cu('snapshot', '-i');
  assert.equal((await h.cu('eval', "document.getElementById('agree').checked")).stdout.trim(), 'false');
  await h.cu('click', '@e2'); // @e2 = checkbox
  assert.equal((await h.cu('eval', "document.getElementById('agree').checked")).stdout.trim(), 'true');
});

test('scroll down moves the viewport on a tall page', async () => {
  await h.cu('open', h.fixtureUrl('content.html'));
  await h.cu('eval', "document.body.style.height='5000px'");
  assert.equal((await h.cu('scroll', 'down', '600')).code, 0);
  const y = Number((await h.cu('eval', 'window.scrollY')).stdout.trim());
  assert.ok(y > 0, 'expected scrollY > 0, got ' + y);
});

// ── wait ─────────────────────────────────────────────────────────────────────

test('wait: duration, selector, and text', async () => {
  assert.equal((await h.cu('wait', '100')).code, 0);
  await h.cu('open', h.fixtureUrl('dynamic.html'));
  assert.equal((await h.cu('wait', '#ready')).code, 0); // appears ~600ms after load
  await h.cu('open', h.fixtureUrl('dynamic.html'));
  assert.equal((await h.cu('wait', '--text', 'Loaded marker')).code, 0);
});

// ── eval / screenshot ────────────────────────────────────────────────────────

test('eval returns JSON values and surfaces exceptions', async () => {
  await h.cu('open', h.fixtureUrl('content.html'));
  assert.equal((await h.cu('eval', '1+2')).stdout.trim(), '3');
  assert.equal((await h.cu('eval', 'document.title')).stdout.trim(), '"Content Fixture"');
  const ex = await h.cu('eval', 'throw new Error("boom")');
  assert.notEqual(ex.code, 0);
});

test('screenshot writes a real PNG file', async () => {
  await h.cu('open', h.fixtureUrl('form.html'));
  const out = path.join(os.tmpdir(), `cu-eval-shot-${Date.now()}.png`);
  const r = await h.cu('screenshot', out);
  assert.equal(r.code, 0, r.stderr);
  const buf = fs.readFileSync(out);
  assert.ok(buf.length > 100);
  assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]); // PNG magic
  fs.rmSync(out, { force: true });
});

// ── cookies ──────────────────────────────────────────────────────────────────

test('cookies set / list / clear', async () => {
  await h.cu('open', h.fixtureUrl('content.html'));
  await h.cu('cookies', 'set', 'cu_test', '42');
  assert.match((await h.cu('cookies')).stdout, /cu_test=42/);
  await h.cu('cookies', 'clear');
  assert.doesNotMatch((await h.cu('cookies')).stdout, /cu_test=42/);
});

// ── tabs (last: creates/closes tabs) ─────────────────────────────────────────

test('tab new / list / close; active tab persists across calls', async () => {
  const created = await h.cu('tab', 'new', h.fixtureUrl('form.html'));
  assert.equal(created.code, 0, created.stderr);
  // New tab is now active → a fresh CLI invocation sees it.
  assert.equal((await h.cu('get', 'title')).stdout.trim(), 'Form Fixture');
  const list = await h.cu('tab', '--json');
  assert.ok(Array.isArray(list.json));
  const formTab = list.json.find((t: any) => String(t.url).endsWith('/form.html'));
  assert.ok(formTab, 'form tab should be listed');
  assert.equal((await h.cu('tab', 'close', formTab.tabId)).code, 0);
});
