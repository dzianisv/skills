/**
 * Regression test for the "shared proxy got stopped and re-triggered Chrome's
 * consent dialog" incident.
 *
 * The proxy is shared across every session and holds ONE approved Chrome
 * remote-debugging connection. A plain `chrome-use stop` used to tear it down,
 * so the next command from ANY session made Chrome re-show the native
 * "Allow remote debugging?" dialog. This test pins the fixed contract:
 *
 *   - plain `stop`                         → refuse, exit 1, NEVER touch the proxy
 *   - `stop --force` (no env)              → refuse, exit 1, NEVER touch the proxy
 *   - `CHROME_USE_ALLOW_STOP=1 stop`       → refuse, exit 1, NEVER touch the proxy
 *   - `CHROME_USE_ALLOW_STOP=1 stop --force` → allowed: sends __stop
 *
 * "NEVER touch the proxy" is asserted structurally: the fake proxy records how
 * many client connections it received and whether it ever saw a `__stop`
 * control frame. A refused stop must produce ZERO connections and ZERO stops,
 * and the proxy must still answer `__status` afterwards (i.e. it is left alive).
 *
 * Fully isolated: every CLI invocation runs with CHROME_USE_SOCKET pointed at a
 * throwaway socket in a mkdtemp dir. The real user proxy socket
 * (/tmp/chrome-use-<uid>.sock) and the live proxy are never referenced or
 * signalled by this test.
 *
 * Real sockets, no Chrome needed.
 *
 * Run: node --test scripts/test/stop-guard.test.ts
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
const CLI = path.join(SCRIPTS_DIR, 'cli.ts');

interface FakeProxy {
  connectionCount: () => number;
  stopCount: () => number;
  probeStatus: () => Promise<any>;
  close: () => Promise<void>;
}

/**
 * A minimal stand-in for the real proxy: a Unix-socket server speaking the same
 * newline-delimited JSON control protocol (see lib/proxy-client.ts). It answers
 * `__status` and records `__stop` WITHOUT exiting, so a test can prove whether a
 * given CLI invocation signalled it. Deliberately never calls process.exit — we
 * want to observe that a refused `stop` left it fully alive.
 */
function startFakeProxy(sockPath: string): Promise<FakeProxy> {
  let connections = 0;
  let stops = 0;
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    connections++;
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.method === '__status') {
          socket.write(
            JSON.stringify({
              id: msg.id,
              result: { connected: false, socketPath: sockPath, version: 'fake-test', pid: process.pid },
            }) + '\n',
          );
        } else if (msg.method === '__stop') {
          stops++;
          socket.write(JSON.stringify({ id: msg.id, result: { stopping: true } }) + '\n');
        } else {
          socket.write(JSON.stringify({ id: msg.id, error: `unexpected method ${msg.method}` }) + '\n');
        }
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });

  function probeStatus(): Promise<any> {
    return new Promise((resolve, reject) => {
      const c = net.createConnection({ path: sockPath });
      const timer = setTimeout(() => {
        c.destroy();
        reject(new Error('probeStatus timed out — proxy not answering'));
      }, 2000);
      let buf = '';
      c.setEncoding('utf8');
      c.on('connect', () => c.write(JSON.stringify({ id: 999, method: '__status' }) + '\n'));
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

  return new Promise((resolve) => {
    server.listen(sockPath, () => {
      resolve({
        connectionCount: () => connections,
        stopCount: () => stops,
        probeStatus,
        close: () =>
          new Promise<void>((r) => {
            for (const s of sockets) s.destroy();
            server.close(() => r());
          }),
      });
    });
  });
}

function runCli(
  args: string[],
  extraEnv: Record<string, string>,
  sockPath: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cli = spawn(process.execPath, ['--experimental-strip-types', CLI, ...args], {
      env: { ...process.env, CHROME_USE_SOCKET: sockPath, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    cli.stdout?.on('data', (d) => (stdout += String(d)));
    cli.stderr?.on('data', (d) => (stderr += String(d)));
    cli.on('error', reject);
    cli.on('close', (code) => resolve({ code, stdout, stderr }));
    const safety = setTimeout(() => {
      if (!cli.killed) {
        cli.kill('SIGKILL');
        reject(new Error('stop CLI did not return within 15s'));
      }
    }, 15_000);
    cli.on('close', () => clearTimeout(safety));
  });
}

async function withFakeProxy(fn: (p: FakeProxy, sockPath: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-stop-guard-'));
  const sockPath = path.join(dir, 'proxy.sock');
  const proxy = await startFakeProxy(sockPath);
  try {
    await fn(proxy, sockPath);
  } finally {
    try {
      await proxy.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

test('plain `stop` fails closed: refuses, exit 1, never signals the shared proxy, leaves it alive', async () => {
  await withFakeProxy(async (proxy, sockPath) => {
    const res = await runCli(['stop'], {}, sockPath);

    assert.equal(res.code, 1, `plain stop must exit non-zero (stderr: ${res.stderr})`);
    assert.match(res.stderr, /refusing to stop the shared proxy/i, 'must explain the refusal');
    assert.match(res.stderr, /Allow remote debugging/i, 'must explain the consent-dialog consequence');
    assert.equal(proxy.stopCount(), 0, 'must NOT send __stop to the proxy');
    assert.equal(proxy.connectionCount(), 0, 'must NOT even open the proxy socket');

    // The proxy must still be alive and serving afterwards.
    const status = await proxy.probeStatus();
    assert.equal(status.connected, false, 'proxy still answers __status → left alive');
  });
});

test('`stop --force` without CHROME_USE_ALLOW_STOP fails closed (one guard is not enough)', async () => {
  await withFakeProxy(async (proxy, sockPath) => {
    const res = await runCli(['stop', '--force'], {}, sockPath);

    assert.equal(res.code, 1, `--force alone must exit non-zero (stderr: ${res.stderr})`);
    assert.match(res.stderr, /refusing to stop the shared proxy/i);
    assert.equal(proxy.stopCount(), 0, '--force alone must NOT send __stop');
    assert.equal(proxy.connectionCount(), 0, '--force alone must NOT open the proxy socket');
  });
});

test('`CHROME_USE_ALLOW_STOP=1 stop` without --force fails closed (one guard is not enough)', async () => {
  await withFakeProxy(async (proxy, sockPath) => {
    const res = await runCli(['stop'], { CHROME_USE_ALLOW_STOP: '1' }, sockPath);

    assert.equal(res.code, 1, `env alone must exit non-zero (stderr: ${res.stderr})`);
    assert.match(res.stderr, /refusing to stop the shared proxy/i);
    assert.equal(proxy.stopCount(), 0, 'env alone must NOT send __stop');
    assert.equal(proxy.connectionCount(), 0, 'env alone must NOT open the proxy socket');
  });
});

test('BOTH guards (--force + CHROME_USE_ALLOW_STOP=1) allow the emergency stop', async () => {
  await withFakeProxy(async (proxy, sockPath) => {
    const res = await runCli(['stop', '--force'], { CHROME_USE_ALLOW_STOP: '1' }, sockPath);

    assert.equal(res.code, 0, `both guards must exit 0 (stderr: ${res.stderr})`);
    assert.match(res.stdout, /proxy stopped/i, 'must report the proxy was stopped');
    assert.equal(proxy.stopCount(), 1, 'both guards must send exactly one __stop');
    assert.ok(proxy.connectionCount() >= 1, 'both guards must open the proxy socket');
  });
});
