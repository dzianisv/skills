/**
 * chrome-use transparent CDP proxy.
 *
 * Holds ONE approved CDP connection to Chrome (via DevToolsActivePort autoConnect —
 * the "Allow remote debugging?" dialog fires once per proxy lifetime) and relays
 * raw CDP commands between clients and Chrome. It contains NO command logic: all
 * request payloads (snapshot walkers, selector queries, input events, …) are built
 * client-side in cli.ts. Because the logic lives in the client, command behavior can
 * change without ever restarting this proxy — so no repeated approval prompts.
 *
 * Wire protocol over the Unix socket (newline-delimited JSON):
 *   request  { id, method, params, sessionId? }
 *   response { id, result } | { id, error }
 * Control methods (answered without touching Chrome): `__status`, `__stop`.
 *
 * Daemonizes (double-fork) unless CHROME_USE_DAEMON=1. Exits 0 if another proxy
 * already owns the socket. Socket path overridable via CHROME_USE_SOCKET.
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';

import { Cdp } from './lib/cdp.ts';
import { buildWsEndpoint } from './lib/devtools-port.ts';

const SOCKET_PATH = process.env.CHROME_USE_SOCKET ?? `/tmp/chrome-use-${os.userInfo().uid}.sock`;

function log(...a: unknown[]): void {
  process.stderr.write('[chrome-use proxy] ' + a.join(' ') + '\n');
}

// ── Singleton check ────────────────────────────────────────────────────────────

function checkAlreadyRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ path: SOCKET_PATH });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);
    socket.on('connect', () => socket.write(JSON.stringify({ id: 0, method: '__status' }) + '\n'));
    socket.on('data', (chunk) => {
      clearTimeout(timer);
      socket.destroy();
      try {
        resolve(JSON.parse(String(chunk).split('\n')[0]).id === 0);
      } catch {
        resolve(false);
      }
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

// ── Single approved connection (memoized, approval-aware) ────────────────────────

let cdp: Cdp | null = null;
let connecting: Promise<void> | null = null;
let server: net.Server | null = null;

function ensureConnected(): Promise<void> {
  if (cdp?.connected) return Promise.resolve();
  if (connecting) return connecting;
  connecting = (async () => {
    const ws = buildWsEndpoint();
    log(`Connecting to ${ws}`);
    log('Chrome shows a one-time "Allow remote debugging?" dialog — click Allow (waits up to 5 min).');
    cdp = await Cdp.connect(ws, 300_000);
    const v = await cdp.send<any>('Browser.getVersion');
    log(`Connected. ${v?.product ?? 'Chrome'}`);
  })().catch((err) => {
    connecting = null;
    cdp = null;
    throw err;
  });
  return connecting;
}

// ── Per-request relay ────────────────────────────────────────────────────────────

async function handle(msg: any): Promise<{ id: any; result?: unknown; error?: string }> {
  const { id, method, params, sessionId } = msg ?? {};

  if (method === '__status') {
    return { id, result: { connected: !!cdp?.connected, socketPath: SOCKET_PATH } };
  }
  if (method === '__stop') {
    setImmediate(() => {
      try {
        server?.close();
      } catch {
        /* ignore */
      }
      try {
        cdp?.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
    return { id, result: { stopping: true } };
  }

  try {
    await ensureConnected();
    const result = await cdp!.send(method, params ?? {}, sessionId);
    return { id, result };
  } catch (err: any) {
    return { id, error: err?.message ?? String(err) };
  }
}

// ── Unix socket server ───────────────────────────────────────────────────────────

function startServer(): void {
  try {
    fs.unlinkSync(SOCKET_PATH);
  } catch {
    /* no stale socket */
  }

  server = net.createServer((socket) => {
    let buf = '';
    socket.setEncoding('utf8');
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
          socket.write(JSON.stringify({ id: null, error: `Invalid JSON: ${line}` }) + '\n');
          continue;
        }
        handle(msg)
          .then((res) => socket.write(JSON.stringify(res) + '\n'))
          .catch((err) => socket.write(JSON.stringify({ id: msg?.id ?? null, error: String(err?.message ?? err) }) + '\n'));
      }
    });
    socket.on('error', () => {});
  });

  server.listen(SOCKET_PATH, () => log(`Listening on ${SOCKET_PATH}`));
  server.on('error', (err) => {
    log('Server error:', err.message);
    process.exit(1);
  });
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (await checkAlreadyRunning()) process.exit(0);

  const isDaemon = process.env.CHROME_USE_DAEMON === '1';
  if (!isDaemon) {
    const child = spawn(process.execPath, [process.argv[1]], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, CHROME_USE_DAEMON: '1' },
    });
    child.unref();
    await new Promise((r) => setTimeout(r, 100));
    process.exit(0);
  }

  startServer();
  // Connect eagerly so the approval dialog appears at startup, not on first command.
  ensureConnected().catch((err) => log('Initial connection failed (will retry on next command):', err.message));

  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(sig, () => {
      try {
        server?.close();
      } catch {
        /* ignore */
      }
      try {
        cdp?.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
  }
  process.on('uncaughtException', (err) => log('Uncaught:', err.message));
}

if (process.argv[1] && process.argv[1].endsWith('proxy.ts')) {
  main();
}
