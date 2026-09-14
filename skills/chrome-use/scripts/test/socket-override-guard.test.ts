/**
 * Regression test for the "exactly one production proxy" socket-override guard
 * (lib/socket-config.ts), added after runtime diagnostics found FOUR independent
 * proxy.ts daemons alive simultaneously — each on a different caller-chosen
 * CHROME_USE_SOCKET, each with no CHROME_USE_TEST_USER_DATA_DIR set, and each
 * therefore resolving (via buildWsEndpointAuto()) to the SAME real, default Chrome
 * profile. Every one of those daemons independently attempts its own Cdp.connect()
 * to that one real browser — each a fresh trigger for Chrome's native "Allow remote
 * debugging?" dialog, with no cross-socket coordination to prevent it.
 *
 * The fix rejects any CHROME_USE_SOCKET override that is not paired with
 * CHROME_USE_TEST_USER_DATA_DIR (an isolated test fixture), in both cli.ts and
 * proxy.ts, at startup — before any socket/lock file is touched and before any
 * Chrome-connection attempt (buildWsEndpointAuto()) can run. This proves:
 *
 *   1. resolveSocketConfig() rejects the unsafe combination and accepts the two
 *      supported ones (unit-level, no process spawns).
 *   2. Two DIFFERENT non-default, test-fixture-less CHROME_USE_SOCKET overrides
 *      each independently fail closed at proxy.ts startup — proving they cannot
 *      each open their own connection to the real browser.
 *   3. cli.ts fails closed the same way, before ever spawning a proxy — no
 *      socket/lock/log file is created for a rejected override.
 *
 * Entirely offline: no real Chrome, no real DevToolsActivePort, no real proxy is
 * ever contacted or stopped. Every socket path used here is a fresh mkdtemp path.
 *
 * Run: node --test scripts/test/socket-override-guard.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveSocketConfig, DEFAULT_SOCKET_PATH } from '../lib/socket-config.ts';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = path.join(SCRIPTS_DIR, 'proxy.ts');
const CLI = path.join(SCRIPTS_DIR, 'cli.ts');

function runNode(
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', file, ...args], {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += String(d)));
    child.on('error', reject);
    const safety = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
        reject(new Error(`${file} did not exit within 5s`));
      }
    }, 5000);
    child.on('close', (code) => {
      clearTimeout(safety);
      resolve({ code, stderr });
    });
  });
}

// ── Unit-level: resolveSocketConfig() itself ────────────────────────────────────

test('resolveSocketConfig: default socket with no test dir is accepted (production shape)', () => {
  const cfg = resolveSocketConfig({});
  assert.equal(cfg.socketPath, DEFAULT_SOCKET_PATH);
  assert.equal(cfg.isDefaultSocket, true);
  assert.equal(cfg.testUserDataDir, undefined);
});

test('resolveSocketConfig: non-default socket + test dir is accepted (isolated test shape)', () => {
  const cfg = resolveSocketConfig({
    CHROME_USE_SOCKET: '/tmp/some-isolated-test.sock',
    CHROME_USE_TEST_USER_DATA_DIR: '/tmp/some-fixture-dir',
  });
  assert.equal(cfg.socketPath, '/tmp/some-isolated-test.sock');
  assert.equal(cfg.isDefaultSocket, false);
  assert.equal(cfg.testUserDataDir, '/tmp/some-fixture-dir');
});

test('resolveSocketConfig: non-default socket WITHOUT test dir is rejected — the exact multi-daemon shape', () => {
  assert.throws(
    () => resolveSocketConfig({ CHROME_USE_SOCKET: '/tmp/task-a.sock' }),
    /CHROME_USE_TEST_USER_DATA_DIR/,
  );
});

test('resolveSocketConfig: a SECOND, different non-default socket without test dir is independently rejected too', () => {
  // Proves the guard is not accidentally keyed to one hardcoded path — every
  // caller-chosen production-socket override is rejected, not just the first one.
  assert.throws(
    () => resolveSocketConfig({ CHROME_USE_SOCKET: '/tmp/task-b.sock' }),
    /CHROME_USE_TEST_USER_DATA_DIR/,
  );
});

test('resolveSocketConfig: default socket WITH test dir is rejected (test fixture cannot ride the shared production socket)', () => {
  assert.throws(
    () => resolveSocketConfig({ CHROME_USE_TEST_USER_DATA_DIR: '/tmp/some-fixture-dir' }),
    /non-default CHROME_USE_SOCKET/,
  );
});

// ── Process-level: proxy.ts enforces the guard at its real entry point ─────────

test('proxy.ts: two DIFFERENT production-shaped socket overrides each fail closed, neither ever binds a socket', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-guard-'));
  t.after(() => fs.rmSync(udd, { recursive: true, force: true }));
  const sockA = path.join(udd, 'task-a.sock');
  const sockB = path.join(udd, 'task-b.sock');

  // Even a regressed guard must not discover the user's real Chrome profile.
  const baseEnv: NodeJS.ProcessEnv = { ...process.env, HOME: udd, USERPROFILE: udd, LOCALAPPDATA: udd };
  delete baseEnv.CHROME_USE_TEST_USER_DATA_DIR;
  delete baseEnv.CHROME_USE_SOCKET;

  const [resA, resB] = await Promise.all([
    runNode(PROXY, [], { ...baseEnv, CHROME_USE_DAEMON: '1', CHROME_USE_SOCKET: sockA }),
    runNode(PROXY, [], { ...baseEnv, CHROME_USE_DAEMON: '1', CHROME_USE_SOCKET: sockB }),
  ]);

  assert.notEqual(resA.code, 0, 'proxy on socket A must exit non-zero, not silently connect to real Chrome');
  assert.match(resA.stderr, /CHROME_USE_TEST_USER_DATA_DIR/, 'socket A must report the guard error');
  assert.notEqual(resB.code, 0, 'proxy on socket B must exit non-zero, not silently connect to real Chrome');
  assert.match(resB.stderr, /CHROME_USE_TEST_USER_DATA_DIR/, 'socket B must report the guard error');

  // Neither ever got far enough to bind its Unix socket or acquire its lock —
  // proof the guard fires before startServer()/buildWsEndpointAuto(), i.e.
  // before any attempt to reach the real browser.
  assert.equal(fs.existsSync(sockA), false, 'socket A file must never be created');
  assert.equal(fs.existsSync(sockB), false, 'socket B file must never be created');
  assert.equal(fs.existsSync(`${sockA}.lock`), false, 'lock A file must never be created');
  assert.equal(fs.existsSync(`${sockB}.lock`), false, 'lock B file must never be created');

});

// ── Process-level: cli.ts enforces the guard before ever spawning a proxy ──────

test('cli.ts: a production-shaped socket override fails closed before spawning any proxy', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-guard-cli-'));
  t.after(() => fs.rmSync(udd, { recursive: true, force: true }));
  const sockPath = path.join(udd, 'task.sock');

  const env: NodeJS.ProcessEnv = { ...process.env, HOME: udd, USERPROFILE: udd, LOCALAPPDATA: udd };
  delete env.CHROME_USE_TEST_USER_DATA_DIR;
  env.CHROME_USE_SOCKET = sockPath;

  const res = await runNode(CLI, ['status'], env);

  assert.notEqual(res.code, 0, 'cli.ts must exit non-zero rather than spawn a proxy against an unsupported override');
  assert.match(res.stderr, /CHROME_USE_TEST_USER_DATA_DIR/, 'cli.ts must report the same guard error');
  assert.equal(fs.existsSync(sockPath), false, 'no proxy socket must ever be created for a rejected override');
  assert.equal(fs.existsSync(`${sockPath}.log`), false, 'no proxy log must ever be created for a rejected override');

});
