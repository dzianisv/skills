/**
 * Eval harness: spins up a fully isolated environment so the golden suite is
 * hermetic and never touches the user's real Chrome.
 *
 *   - a throwaway headless Chrome (its own temp profile, --remote-debugging-port,
 *     so there is NO approval dialog),
 *   - a zero-dependency static file server for test/fixtures,
 *   - the chrome-use proxy pointed at that Chrome (unique socket + active-tab file),
 *
 * and exposes a `cu(...)` runner that invokes the real CLI exactly as a user would.
 *
 * Zero npm dependencies — only node: builtins and the chrome-use scripts.
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const CLI = path.join(SCRIPTS_DIR, 'cli.ts');
const PROXY = path.join(SCRIPTS_DIR, 'proxy.ts');

// Snap-confined chromium can only write its profile under the snap home.
const CHROME_BIN = process.env.CHROME_USE_TEST_BIN || '/snap/bin/chromium';
const PROFILE_ROOT =
  process.env.CHROME_USE_TEST_PROFILE_ROOT ||
  (CHROME_BIN.includes('/snap/') ? path.join(os.homedir(), 'snap/chromium/common/cu-evals') : os.tmpdir());

export interface CuResult {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout parsed as JSON, or undefined if it wasn't JSON. */
  json: any;
}

export interface Harness {
  baseUrl: string;
  /** Unix socket the isolated proxy listens on (for debugging/raw CDP). */
  socketPath: string;
  /** URL for a fixture file, e.g. fixtureUrl('form.html'). */
  fixtureUrl(name: string): string;
  /**
   * Run the chrome-use CLI with the given args against the isolated env.
   * MUST be async (uses non-blocking spawn): the fixture HTTP server runs in this
   * same process, so a blocking spawnSync would freeze it and deadlock any command
   * that navigates to a fixture URL.
   */
  cu(...args: string[]): Promise<CuResult>;
  teardown(): Promise<void>;
}

function waitForFile(p: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (fs.existsSync(p)) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timeout waiting for ${p}`));
      setTimeout(tick, 100);
    };
    tick();
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function startFixtureServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const file = path.join(FIXTURES_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(FIXTURES_DIR) || !fs.existsSync(file)) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'text/plain' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function startChrome(): Promise<{ proc: ChildProcess; wsEndpoint: string; profile: string }> {
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, 'p.'));
  const proc = spawn(
    CHROME_BIN,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = path.join(profile, 'DevToolsActivePort');
  await waitForFile(portFile, 15_000);
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').split('\n').map((s) => s.trim());
  return { proc, wsEndpoint: `ws://127.0.0.1:${port}${wsPath}`, profile };
}

function statusOk(socketPath: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ path: socketPath });
    const timer = setTimeout(() => {
      s.destroy();
      resolve(false);
    }, timeoutMs);
    s.on('connect', () => s.write(JSON.stringify({ id: 1, method: '__status' }) + '\n'));
    s.on('data', (d) => {
      clearTimeout(timer);
      s.destroy();
      try {
        resolve(JSON.parse(String(d).split('\n')[0]).result?.connected === true);
      } catch {
        resolve(false);
      }
    });
    s.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/** Build a fully isolated harness. Call teardown() when done. */
export async function setup(): Promise<Harness> {
  const { proc: chrome, wsEndpoint, profile } = await startChrome();
  const { server, baseUrl } = await startFixtureServer();

  const id = `${process.pid}-${Date.now()}`;
  const socketPath = path.join(os.tmpdir(), `chrome-use-eval-${id}.sock`);
  const activeFile = path.join(os.tmpdir(), `chrome-use-eval-active-${id}`);
  const env = {
    ...process.env,
    CHROME_USE_SOCKET: socketPath,
    CHROME_USE_ACTIVE: activeFile,
    CHROME_USE_WS_ENDPOINT: wsEndpoint,
  };

  // Start the proxy (foreground daemon flag so it doesn't double-fork away).
  const proxy = spawn(process.execPath, [PROXY], {
    stdio: 'ignore',
    env: { ...env, CHROME_USE_DAEMON: '1' },
  });

  const deadline = Date.now() + 15_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (await statusOk(socketPath, 1000)) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!ready) throw new Error('proxy did not connect to test Chrome in time');

  const cu = (...args: string[]): Promise<CuResult> =>
    new Promise<CuResult>((resolve) => {
      const child = spawn(process.execPath, [CLI, ...args], { env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      const timer = setTimeout(() => child.kill('SIGKILL'), 25_000);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        let json: any;
        try {
          json = JSON.parse(stdout);
        } catch {
          json = undefined;
        }
        const killed = signal ? ` [killed: ${signal}]` : '';
        resolve({ code: code ?? (signal ? 124 : 0), stdout, stderr: stderr + killed, json });
      });
    });

  const teardown = async (): Promise<void> => {
    // Stop the proxy via control message, then kill.
    await new Promise<void>((resolve) => {
      const s = net.createConnection({ path: socketPath });
      s.on('connect', () => s.write(JSON.stringify({ id: 1, method: '__stop' }) + '\n'));
      const done = () => {
        s.destroy();
        resolve();
      };
      s.on('data', done);
      s.on('error', done);
      setTimeout(done, 1000);
    });
    try {
      proxy.kill();
    } catch {
      /* ignore */
    }
    try {
      chrome.kill();
    } catch {
      /* ignore */
    }
    try {
      server.close();
    } catch {
      /* ignore */
    }
    // Best-effort cleanup of temp artifacts.
    for (const p of [socketPath, activeFile]) {
      try {
        fs.rmSync(p, { force: true });
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  return {
    baseUrl,
    socketPath,
    fixtureUrl: (name: string) => `${baseUrl}/${name}`,
    cu,
    teardown,
  };
}
