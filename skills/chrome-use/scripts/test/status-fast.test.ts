/**
 * Regression test for the "status hangs for minutes" bug: the `status` command
 * is documented as a lightweight health probe ("proxy + browser health") and
 * must answer within a few seconds even when the proxy has no live CDP
 * connection to Chrome yet (e.g. the "Allow remote debugging?" dialog hasn't
 * been approved). Before the fix, both cli.ts's NO_TAB pre-fetch
 * (state.getActiveTab()) and the status handler itself (Browser.getVersion)
 * called real CDP methods, which forced ensureConnected() to attempt a fresh
 * upstream connect and block for up to 300s waiting for approval.
 *
 * Real sockets, no real Chrome: the fake CDP server below accepts the TCP
 * connection but never completes the WebSocket upgrade handshake — this is
 * indistinguishable, from the proxy's point of view, from Chrome showing the
 * approval dialog and nobody clicking "Allow" yet. On the pre-fix code, both
 * the real `chrome-use status` CLI and a direct `__status` health probe would
 * be dragged into that same pending connect and hang for the connect timeout.
 * On the fixed code, `status` must resolve almost immediately since it never
 * touches Chrome while disconnected.
 *
 * Run: node --test scripts/test/status-fast.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ProxyClient } from '../lib/proxy-client.ts';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = path.join(SCRIPTS_DIR, 'proxy.ts');
const CLI = path.join(SCRIPTS_DIR, 'cli.ts');

/**
 * A fake CDP endpoint that accepts the TCP connection (so the port file looks
 * legit and DNS/connect-refused failures can't short-circuit the attempt) but
 * NEVER sends the "101 Switching Protocols" upgrade response — the client's
 * WebSocket 'open' event (and thus proxy.ts's `Cdp.connect()` / `#open`
 * promise) never fires. This simulates Chrome's approval dialog sitting there
 * unanswered: the connect attempt is genuinely in-flight and pending, not
 * failed, so it would occupy the full 300_000ms `Cdp.connect` timeout in
 * `ensureConnected()` if anything actually awaited it.
 */
function startHangingCdp(): Promise<{ port: number; connectionCount: () => number; close: () => Promise<void> }> {
  let connections = 0;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    connections++;
    sockets.add(socket);
    // Deliberately never write the upgrade response and never close the
    // socket — the handshake just hangs forever (until test cleanup).
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        connectionCount: () => connections,
        close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
      });
    });
  });
}

function writePortFile(udd: string, fake: { port: number }): void {
  fs.writeFileSync(path.join(udd, 'DevToolsActivePort'), `${fake.port}\n/devtools/browser/fake-hanging\n`);
}

async function waitForSocket(sockPath: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.createConnection({ path: sockPath });
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`proxy socket not up: ${sockPath}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('status control probe (__status) resolves fast while a CDP connect is hung/pending', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-status-fast-'));
  const sockPath = path.join(udd, 'proxy.sock');
  const hanging = await startHangingCdp();
  writePortFile(udd, hanging);

  let proxy: ChildProcess | undefined;
  let client: ProxyClient | undefined;
  t.after(async () => {
    try { client?.close(); } catch { /* ignore */ }
    try { proxy?.kill('SIGKILL'); } catch { /* ignore */ }
    try { await hanging.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: sockPath,
      CHROME_USE_USER_DATA_DIR: udd,
    },
    stdio: 'ignore',
  });
  await waitForSocket(sockPath);
  // proxy.ts's main() eagerly calls ensureConnected() right after the socket
  // comes up. Against startHangingCdp() that attempt is now genuinely
  // in-flight and will stay pending for the full 300s Cdp.connect timeout —
  // exactly the "unapproved dialog" state this test simulates.
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(hanging.connectionCount() >= 1, 'the eager startup connect must have reached the fake endpoint (and be hanging there)');

  client = await ProxyClient.open(sockPath, 15_000);
  const start = Date.now();
  const res = await client.send<any>('__status', {});
  const elapsed = Date.now() - start;

  assert.equal(res.connected, false, '__status must report not-connected while the connect attempt is hung');
  assert.ok(elapsed < 5000, `__status must resolve in well under 5s even while a connect is pending (took ${elapsed}ms)`);
});

test('real `chrome-use status` CLI returns within a few seconds when Chrome is not yet connected', async (t) => {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-status-cli-'));
  const sockPath = path.join(udd, 'proxy.sock');
  const hanging = await startHangingCdp();
  writePortFile(udd, hanging);

  let proxy: ChildProcess | undefined;
  let cli: ChildProcess | undefined;
  t.after(async () => {
    try { cli?.kill('SIGKILL'); } catch { /* ignore */ }
    try { proxy?.kill('SIGKILL'); } catch { /* ignore */ }
    try { await hanging.close(); } catch { /* ignore */ }
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // Pre-spawn the proxy ourselves (foreground daemon) so the CLI's own
  // ensureProxy() sees it already alive and skips spawning a second one —
  // mirrors the harness pattern used by reconnect.test.ts / connect-resilience.test.ts.
  proxy = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      CHROME_USE_DAEMON: '1',
      CHROME_USE_SOCKET: sockPath,
      CHROME_USE_USER_DATA_DIR: udd,
    },
    stdio: 'ignore',
  });
  await waitForSocket(sockPath);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(hanging.connectionCount() >= 1, 'the eager startup connect must be hanging against the fake endpoint');

  const start = Date.now();
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    cli = spawn(process.execPath, ['--experimental-strip-types', CLI, 'status', '--json'], {
      env: { ...process.env, CHROME_USE_SOCKET: sockPath, CHROME_USE_USER_DATA_DIR: udd },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    cli.stdout?.on('data', (d) => { stdout += String(d); });
    cli.stderr?.on('data', (d) => { stderr += String(d); });
    cli.on('error', reject);
    cli.on('close', (code) => resolve({ code, stdout, stderr }));
    // Safety net: if the pre-fix bug regresses, don't actually wait 300s —
    // fail the test well before that by killing the CLI and surfacing a timeout.
    setTimeout(() => {
      if (cli && !cli.killed) {
        cli.kill('SIGKILL');
        reject(new Error('status CLI did not return within the 10s safety timeout — regression to the >3min hang'));
      }
    }, 10_000);
  });
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 5000, `chrome-use status must return in well under 5s while disconnected (took ${elapsed}ms)`);
  assert.equal(result.code, 0, `status CLI must exit 0 (stderr: ${result.stderr})`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.connected, false, 'status must report connected:false while the connect attempt is hung');
});
