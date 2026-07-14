/**
 * Regression test for the removal of the public `stop` command.
 *
 * Rationale (verbatim from the decision that drove this change):
 *   "agents call stop too often for no reason, killing the approved connection
 *    and re-triggering consent."
 *
 * There is intentionally NO `chrome-use stop`. Invoking it must:
 *   - follow the normal unknown-command path,
 *   - exit non-zero,
 *   - and leave the running proxy's PID/socket completely untouched.
 *
 * Terminating a genuinely broken proxy is an explicit out-of-band OS action for
 * a human/maintainer — never exposed through the agent CLI.
 *
 * Fully isolated: the proxy runs on a throwaway CHROME_USE_SOCKET in a mkdtemp
 * dir with an empty CHROME_USE_USER_DATA_DIR (so it starts, stays alive, and
 * simply never completes a CDP connection). The real user proxy socket
 * (/tmp/chrome-use-<uid>.sock) and the live proxy are never referenced.
 *
 * Run: node --test scripts/test/no-stop-command.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = path.join(SCRIPTS_DIR, 'proxy.ts');
const CLI = path.join(SCRIPTS_DIR, 'cli.ts');

function waitForSocket(sockPath: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return (async () => {
    for (;;) {
      const ok = await new Promise<boolean>((resolve) => {
        const s = net.createConnection({ path: sockPath });
        s.on('connect', () => {
          s.destroy();
          resolve(true);
        });
        s.on('error', () => resolve(false));
      });
      if (ok) return;
      if (Date.now() > deadline) throw new Error(`proxy socket not up: ${sockPath}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
}

function probeStatus(sockPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const c = net.createConnection({ path: sockPath });
    const timer = setTimeout(() => {
      c.destroy();
      reject(new Error('probeStatus timed out'));
    }, 2000);
    let buf = '';
    c.setEncoding('utf8');
    c.on('connect', () => c.write(JSON.stringify({ id: 1, method: '__status' }) + '\n'));
    c.on('data', (chunk) => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      clearTimeout(timer);
      c.destroy();
      try {
        resolve(JSON.parse(buf.slice(0, nl)).result);
      } catch (e) {
        reject(e as Error);
      }
    });
    c.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function runCli(
  args: string[],
  sockPath: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cli = spawn(process.execPath, ['--experimental-strip-types', CLI, ...args], {
      env: { ...process.env, CHROME_USE_SOCKET: sockPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    cli.stdout?.on('data', (d) => (stdout += String(d)));
    cli.stderr?.on('data', (d) => (stderr += String(d)));
    cli.on('error', reject);
    const safety = setTimeout(() => {
      if (!cli.killed) {
        cli.kill('SIGKILL');
        reject(new Error('CLI did not return within 15s'));
      }
    }, 15_000);
    cli.on('close', (code) => {
      clearTimeout(safety);
      resolve({ code, stdout, stderr });
    });
  });
}

test('`chrome-use stop` is rejected (unknown command, exit 1) and leaves an isolated proxy alive', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-no-stop-'));
  const sockPath = path.join(udd, 'proxy.sock');

  // Spawn the REAL proxy directly as the daemon on an isolated socket. Empty
  // user-data-dir → it has no DevToolsActivePort to connect to, so it stays up
  // and simply reports connected:false — perfect for asserting it is untouched.
  const proxy: ChildProcess = spawn(process.execPath, [PROXY], {
    env: { ...process.env, CHROME_USE_DAEMON: '1', CHROME_USE_SOCKET: sockPath, CHROME_USE_USER_DATA_DIR: udd },
    stdio: 'ignore',
  });
  t.after(() => {
    try {
      proxy.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(udd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  await waitForSocket(sockPath);
  const before = await probeStatus(sockPath);
  assert.equal(typeof before.pid, 'number', 'proxy should report its pid via __status');
  const pidBefore = before.pid as number;
  assert.doesNotThrow(() => process.kill(pidBefore, 0), 'proxy process should be alive before the stop attempt');

  const res = await runCli(['stop'], sockPath);

  // Rejected via the normal unknown-command path, non-zero exit.
  assert.equal(res.code, 1, `stop must exit non-zero (stderr: ${res.stderr})`);
  assert.match(res.stderr, /unknown command 'stop'/i, "stop must take the normal unknown-command path");
  assert.doesNotMatch(res.stdout, /proxy stopped/i, 'must NOT report stopping the proxy');

  // Proxy PID + socket untouched, still serving.
  assert.ok(fs.existsSync(sockPath), 'proxy socket must still exist after the rejected stop');
  assert.doesNotThrow(() => process.kill(pidBefore, 0), 'proxy process must still be alive after the rejected stop');
  const after = await probeStatus(sockPath);
  assert.equal(after.pid, pidBefore, 'proxy PID must be unchanged — stop must never signal it');
});
