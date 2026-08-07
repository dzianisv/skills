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
 *
 * Startup is gated by an exclusive lock file (`<socket>.lock`) so concurrent
 * launches can't race past the unlink+listen+connect sequence — that race was
 * the other source of duplicate dialogs (two proxies, two approved CDP
 * connections). `__status` reports a content-hash `version` of this file +
 * lib/cdp.ts + lib/devtools-port.ts so cli.ts can detect a running proxy that
 * predates a fix to those files and restart it once. Daemon stdout/stderr are
 * appended to `<socket>.log` (single-generation rotation at 5MB, ISO-timestamped
 * lines) instead of being discarded, so incidents can be reconstructed from logs.
 *
 * `ensureConnected()` is single-flight (concurrent commands share one in-flight
 * CDP connect attempt — never open a second WebSocket while the first is still
 * pending) and never opens a second debugger connection after any connection
 * failure or loss. A new connection can show Chrome's native approval dialog;
 * automatic recovery would turn a broken browser into repeated dialogs.
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Cdp } from './lib/cdp.ts';
import { buildWsEndpoint, buildWsEndpointAuto } from './lib/devtools-port.ts';

const SOCKET_PATH = process.env.CHROME_USE_SOCKET ?? `/tmp/chrome-use-${os.userInfo().uid}.sock`;
const LOCK_PATH = `${SOCKET_PATH}.lock`;
const LOG_PATH = `${SOCKET_PATH}.log`;
const MAX_LOCK_ATTEMPTS = 3;
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MiB

const CONNECT_TIMEOUT_MS = Number(process.env.CHROME_USE_CONNECT_TIMEOUT_MS) || 300_000;
const REQUEST_TIMEOUT_MS = Number(process.env.CHROME_USE_REQUEST_TIMEOUT_MS) || 120_000;
const KEEPALIVE_MS = Number(process.env.CHROME_USE_KEEPALIVE_MS) || 20_000;

function log(...a: unknown[]): void {
  process.stderr.write(`[${new Date().toISOString()}] [chrome-use proxy] ` + a.join(' ') + '\n');
}

// ── Version stamp ──────────────────────────────────────────────────────────────

/**
 * Files that define proxy *behavior* (this file + the CDP client + the
 * DevToolsActivePort resolver). Deliberately excludes cli.ts and commands/ —
 * those hold command logic, which can change without needing a proxy restart
 * (see module header) — so CLI-only edits must not force a spurious restart.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const VERSION_FILES = [
  THIS_FILE,
  path.join(path.dirname(THIS_FILE), 'lib', 'cdp.ts'),
  path.join(path.dirname(THIS_FILE), 'lib', 'devtools-port.ts'),
];

/** Stable content hash of VERSION_FILES, exposed via `__status` as `version`. */
function computeVersion(): string {
  const hash = crypto.createHash('sha256');
  for (const f of VERSION_FILES) hash.update(fs.readFileSync(f));
  return hash.digest('hex');
}

const PROXY_VERSION = computeVersion();

// ── Persistent rotating log ─────────────────────────────────────────────────────

/**
 * Open the persistent daemon log for appending, rotating the previous file to
 * a single `.1` generation (overwriting any older one) if it has grown past
 * MAX_LOG_BYTES. No external dependency — plain fs, single generation.
 */
function openLogFd(): number {
  try {
    if (fs.statSync(LOG_PATH).size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.1`);
    }
  } catch {
    /* no existing log yet */
  }
  return fs.openSync(LOG_PATH, 'a');
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

// ── Atomic startup lock ──────────────────────────────────────────────────────────

/**
 * Acquire an exclusive startup lock so concurrent proxy launches can't race
 * past the unlink-socket + listen + connect-to-Chrome sequence — two proxies
 * doing that concurrently means two approved CDP connections, i.e. two
 * "Allow remote debugging?" dialogs.
 *
 * Lock content (our pid) is published atomically: we write it to a
 * uniquely-named temp file first, then `fs.linkSync` it onto LOCK_PATH — a
 * single hard-link syscall that's atomic at the OS level (EEXIST if
 * LOCK_PATH already exists) and, unlike open('wx') + a separate write(),
 * never lets a racing reader observe LOCK_PATH created-but-empty. (An empty
 * read used to parse as `ownerPid = null`, which forced `killThrowsESRCH`'s
 * default of `true` regardless of whether the real owner was alive — the
 * same false-staleness failure this whole lock exists to prevent.)
 *
 * Resolves `true` if this process now holds the lock and should proceed to
 * start the server. Resolves `false` if another proxy is already fully up and
 * serving (this process should back off, matching the existing "exit 0 if
 * another proxy already owns the socket" behavior). Throws if the lock is
 * held by a stale/dead holder that can't be cleared within
 * MAX_LOCK_ATTEMPTS — never spins forever.
 */
async function acquireLock(): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_LOCK_ATTEMPTS; attempt++) {
    const tmpPath = `${LOCK_PATH}.tmp.${process.pid}`;
    let linked = false;
    try {
      fs.writeFileSync(tmpPath, String(process.pid));
      try {
        fs.linkSync(tmpPath, LOCK_PATH);
        linked = true;
      } catch (err: any) {
        if (err?.code !== 'EEXIST') throw err;
      }
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* already gone */
      }
    }
    if (linked) {
      // We won the lock fresh (uncontended) — but that alone doesn't prove
      // nobody is already serving. releaseLock() intentionally frees the lock
      // right after a predecessor's listen() succeeds (the bound socket
      // becomes the singleton token from then on, per that function's
      // comment) — NOT for that predecessor's whole lifetime. So a newcomer
      // can win a perfectly "uncontended" link in the gap right after a
      // healthy predecessor released it, having never observed EEXIST at all
      // and therefore never running the owner-liveness check below. Without
      // this, that newcomer barrels straight into its own unlink+listen,
      // stealing the socket out from under a healthy predecessor — two
      // proxies, two approved CDP connections. Confirmed via a real
      // concurrent-launch test (test/lock.test.ts) before this check existed.
      if (await checkAlreadyRunning()) {
        releaseLock();
        return false;
      }
      return true;
    }

    // LOCK_PATH already exists — someone else holds (or left behind) it.
    let ownerPid: number | null = null;
    try {
      const raw = fs.readFileSync(LOCK_PATH, 'utf8').trim();
      ownerPid = raw ? parseInt(raw, 10) : null;
    } catch {
      ownerPid = null; // lockfile vanished between our linkSync and this read
    }

    let killThrowsESRCH = true;
    if (ownerPid && Number.isFinite(ownerPid)) {
      try {
        process.kill(ownerPid, 0);
        killThrowsESRCH = false; // no throw → owner process is alive
      } catch (killErr: any) {
        killThrowsESRCH = killErr?.code === 'ESRCH';
      }
    }

    // Stale iff the owner process is gone, OR nothing is actually serving on
    // the socket (covers a wedged owner / a pid reused by an unrelated
    // process). When the owner IS alive, don't declare staleness off a single
    // check: it may simply be mid-startup, about to call server.listen(), and
    // checkAlreadyRunning() legitimately returns false during that narrow
    // window. Give it one short grace-period retry first — without it, a
    // racing process would wrongly steal the lock out from under a legitimate
    // in-flight starter and both would proceed to start a proxy, reintroducing
    // the double-CDP-connection bug this lock exists to prevent.
    let stale: boolean;
    if (killThrowsESRCH) {
      stale = true;
    } else {
      stale = !(await checkAlreadyRunning());
      if (stale) {
        await new Promise((r) => setTimeout(r, 400));
        stale = !(await checkAlreadyRunning());
      }
    }
    if (!stale) return false; // a live proxy already owns the socket end-to-end

    log(`Stale lock (pid ${ownerPid ?? '?'}) at ${LOCK_PATH}, attempt ${attempt}/${MAX_LOCK_ATTEMPTS} — clearing.`);
    try {
      fs.unlinkSync(LOCK_PATH);
    } catch {
      /* raced with another cleaner; fine, retry the exclusive-link */
    }
  }
  throw new Error(`Could not acquire startup lock at ${LOCK_PATH} after ${MAX_LOCK_ATTEMPTS} attempts`);
}

/** Release the startup lock. Safe to call even if never acquired. */
function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* already gone */
  }
}

// ── Single approved connection (memoized, approval-aware) ────────────────────────

let cdp: Cdp | null = null;
let connecting: Promise<void> | null = null;
let server: net.Server | null = null;
let connectionBlocked: string | null = null;
let keepalive: ReturnType<typeof setInterval> | null = null;
let keepaliveInFlight = false;

function stopKeepalive(): void {
  if (keepalive) clearInterval(keepalive);
  keepalive = null;
  keepaliveInFlight = false;
}

function blockReconnect(reason: string): void {
  if (connectionBlocked) return;
  connectionBlocked = reason;
  stopKeepalive();
  log(`${reason} Blocking automatic reconnects to avoid another native dialog.`);
}

function startKeepalive(client: Cdp): void {
  stopKeepalive();
  keepalive = setInterval(() => {
    if (keepaliveInFlight || cdp !== client || !client.connected || connectionBlocked) return;
    keepaliveInFlight = true;
    // Existing socket only. This timer never calls ensureConnected().
    client.send('Browser.getVersion').catch(() => {}).finally(() => { keepaliveInFlight = false; });
  }, KEEPALIVE_MS);
  keepalive.unref();
}

function sendWithTimeout<T>(client: Cdp, method: string, params: Record<string, unknown>, sessionId?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`CDP request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method}`)),
      REQUEST_TIMEOUT_MS,
    );
    client.send<T>(method, params, sessionId).then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function ensureConnected(): Promise<void> {
  if (cdp?.connected) return Promise.resolve();
  if (connectionBlocked) {
    return Promise.reject(
      new Error(
        `${connectionBlocked} This proxy will not open another remote-debugging dialog. ` +
          'Start a new browser-control session only when a human is ready to approve it.',
      ),
    );
  }
  // Single-flight: a connect attempt is already in progress (own WebSocket to
  // Chrome, own pending dialog if unapproved). Share that same promise instead
  // of opening a second one — only one dialog can be pending at a time.
  if (connecting) return connecting;
  connecting = (async () => {
    // Always connect via DevToolsActivePort autoConnect (my-browser style).
    // CHROME_USE_USER_DATA_DIR optionally points at a non-default Chrome profile;
    // it still reads that profile's DevToolsActivePort — never a debugging port.
    // Re-read on every (re)connect so a Chrome restart's new port/ws is picked up.
    // If a specific profile dir is given, use it directly; otherwise auto-detect
    // across all Chrome channels (stable, dev, beta, canary) and pick the first
    // whose port is reachable — prevents stale/wrong-channel port file mismatches.
    const userDataDir = process.env.CHROME_USE_USER_DATA_DIR || undefined;
    const ws = userDataDir
      ? buildWsEndpoint('stable', userDataDir)
      : await buildWsEndpointAuto();
    log(`Connecting to ${ws}`);
    log('Chrome shows a one-time "Allow remote debugging?" dialog — click Allow (waits up to 5 min).');
    const client = await Cdp.connect(ws, CONNECT_TIMEOUT_MS);
    cdp = client;
    client.onClose(() => {
      if (cdp === client) {
        cdp = null;
        connecting = null;
        blockReconnect('Chrome debugging connection closed.');
      }
    });
    const v = await client.send<any>('Browser.getVersion');
    log(`Connected. ${v?.product ?? 'Chrome'}`);
    startKeepalive(client);
  })()
    .then(() => { connecting = null; })
    .catch((err) => {
      connecting = null;
      cdp?.close();
      cdp = null;
      blockReconnect(`Chrome debugging connection failed: ${err?.message ?? err}.`);
      throw err;
    });
  return connecting;
}

// ── Per-request relay ────────────────────────────────────────────────────────────

async function handle(msg: any): Promise<{ id: any; result?: unknown; error?: string }> {
  const { id, method, params, sessionId } = msg ?? {};

  if (method === '__status') {
    return {
      id,
      result: {
        connected: !!cdp?.connected,
        connectionBlocked,
        socketPath: SOCKET_PATH,
        version: PROXY_VERSION,
        pid: process.pid,
      },
    };
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
      stopKeepalive();
      process.exit(0);
    });
    return { id, result: { stopping: true } };
  }

  try {
    await ensureConnected();
    const client = cdp!;
    const result = await sendWithTimeout(client, method, params ?? {}, sessionId);
    return { id, result };
  } catch (err: any) {
    if (cdp?.connected && String(err?.message ?? err).startsWith('CDP request timed out after ')) {
      blockReconnect(`Chrome debugging request hung: ${err.message}.`);
      cdp.close();
      cdp = null;
    }
    return { id, error: err?.message ?? String(err) };
  }
}

// ── Unix socket server ───────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  const acquired = await acquireLock();
  if (!acquired) {
    // Another proxy already owns the socket end-to-end — defer to it rather
    // than risk a second CDP connection (see docstring on acquireLock).
    log('Another proxy already owns the socket — exiting.');
    process.exit(0);
  }

  try {
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

    await new Promise<void>((resolve, reject) => {
      const onListenError = (err: NodeJS.ErrnoException) => reject(err);
      server!.once('error', onListenError);
      server!.listen(SOCKET_PATH, () => {
        server!.removeListener('error', onListenError);
        log(`Listening on ${SOCKET_PATH}`);
        resolve();
      });
    });
  } finally {
    // The bound socket is the singleton token from here on — release the lock
    // whether startup succeeded or failed. Do NOT unlink-then-listen outside
    // the lock; that unguarded ordering is what caused the original race.
    releaseLock();
  }

  // Handle errors for the remainder of the process lifetime (post-startup).
  server!.on('error', (err) => {
    log('Server error:', err.message);
    process.exit(1);
  });
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (await checkAlreadyRunning()) process.exit(0);

  const isDaemon = process.env.CHROME_USE_DAEMON === '1';
  if (!isDaemon) {
    const logFd = openLogFd();
    const child = spawn(process.execPath, [process.argv[1]], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, CHROME_USE_DAEMON: '1' },
    });
    fs.closeSync(logFd); // child has its own dup'd reference; safe to close ours
    child.unref();
    await new Promise((r) => setTimeout(r, 100));
    process.exit(0);
  }

  try {
    await startServer();
  } catch (err: any) {
    log('Failed to start server:', err?.message ?? String(err));
    process.exit(1);
  }
  // Connect eagerly so the approval dialog appears at startup, not on first command.
  ensureConnected().catch((err) => log('Initial connection failed (automatic reconnect disabled):', err.message));

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
      stopKeepalive();
      process.exit(0);
    });
  }
  process.on('uncaughtException', (err) => log('Uncaught:', err.message));
}

if (process.argv[1] && process.argv[1].endsWith('proxy.ts')) {
  main();
}
