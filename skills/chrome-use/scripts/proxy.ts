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
 *   request  { id, method, params, sessionId?, timeoutMs? }
 *   response { id, result } | { id, error }
 * Control methods (answered without touching Chrome): `__status`, and `__stop`,
 * which is refused — this shared proxy cannot be stopped by a client.
 *
 * Daemonizes (double-fork) unless CHROME_USE_DAEMON=1. Exits 0 if another proxy
 * already owns the socket. Socket path overridable via CHROME_USE_SOCKET, but only
 * together with CHROME_USE_TEST_USER_DATA_DIR (an isolated test fixture) — any other
 * override is rejected at startup so a stray socket name can't silently open a second
 * connection to the real Chrome (see lib/socket-config.ts).
 *
 * Startup is gated by an exclusive lock file (`<socket>.lock`) so concurrent
 * launches can't race past the unlink+listen+connect sequence — that race was
 * the other source of duplicate dialogs (two proxies, two approved CDP
 * connections). `__status` reports a content-hash `version` of this file +
 * lib/cdp.ts + lib/devtools-port.ts, informational only — nothing currently
 * restarts a live proxy on a version mismatch (see cli.ts's ensureProxy()).
 * Daemon stdout/stderr are appended to `<socket>.log` (single-generation
 * rotation at 5MB, ISO-timestamped lines) instead of being discarded, so
 * incidents can be reconstructed from logs.
 *
 * `ensureConnected()` is single-flight (concurrent commands share one in-flight
 * CDP connect attempt — never open a second WebSocket while the first is still
 * pending), so at most one native approval dialog can ever be outstanding.
 *
 * Reconnect policy (revised 2026-09-19). This proxy USED to fail closed forever
 * on any connection loss, on the theory that every new CDP connection re-opens
 * Chrome's "Allow remote debugging?" dialog. Measured behavior on Chrome 152 is
 * more specific than that:
 *
 *   - While an approved client is STILL connected, an additional browser-level
 *     connection to the DevToolsActivePort endpoint is accepted immediately with
 *     no dialog (verified: fresh connect + Browser.getVersion in ~1.4s, 21 hours
 *     after the original approval).
 *   - Once the LAST approved client disconnects, approval lapses. The next
 *     connect stalls on a fresh native dialog (verified: killing the sole proxy
 *     made the replacement's connect hang waiting for a click).
 *
 * So a reconnect is neither free nor hopeless — it is a bounded gamble. If Chrome
 * still regards this proxy's approval as live (transient socket blip, our side
 * dropped first), it succeeds silently. If approval lapsed, it stalls, and no
 * amount of retrying helps until a human clicks Allow.
 *
 * Failing closed was still strictly worse, because its documented recovery was
 * for a human to kill the proxy and re-approve — the same human click, preceded
 * by a pointless restart, and agents performed that restart routinely because the
 * error text told them to. It also bricked every other session on the machine for
 * a blip that reconnecting would have fixed silently.
 *
 * So: a lost connection is now retried automatically with exponential backoff
 * (see scheduleReconnect). A connect that FAILS FAST (Chrome closed, connection
 * refused) costs nothing and is retried indefinitely, so the proxy self-heals
 * when the user reopens Chrome. A connect that STALLS to its full timeout is the
 * signature of an unanswered dialog; after MAX_APPROVAL_STALLS of those the proxy
 * latches `connectionBlocked` and stops, so it can never queue dialogs at nobody.
 *
 * Corollary, and the real reason never to restart this proxy: it is the last
 * approved client. Killing it LAPSES Chrome's approval and forces a new dialog.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Cdp } from './lib/cdp.ts';
import { buildWsEndpoint, buildWsEndpointAuto } from './lib/devtools-port.ts';
import { resolveSocketConfig } from './lib/socket-config.ts';

// Validate before touching socket/lock files or connecting to Chrome.
let socketConfig: ReturnType<typeof resolveSocketConfig>;
try {
  socketConfig = resolveSocketConfig();
} catch (err) {
  process.stderr.write(`[chrome-use proxy] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

const SOCKET_PATH = socketConfig.socketPath;
const LOCK_PATH = `${SOCKET_PATH}.lock`;
const LOG_PATH = `${SOCKET_PATH}.log`;
const MAX_LOCK_ATTEMPTS = 3;
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MiB

const CONNECT_TIMEOUT_MS = Number(process.env.CHROME_USE_CONNECT_TIMEOUT_MS) || 300_000;
const REQUEST_TIMEOUT_MS = Number(process.env.CHROME_USE_REQUEST_TIMEOUT_MS) || 120_000;
const KEEPALIVE_MS = Number(process.env.CHROME_USE_KEEPALIVE_MS) || 20_000;
/** CHROME_USE_TRACE=1 logs every relayed CDP method — used to bisect connection drops. */
const TRACE = process.env.CHROME_USE_TRACE === '1';
// How long a browser-level liveness probe gets before we conclude the CDP
// connection itself (not just one request) is dead. See handle()'s catch block.
const LIVENESS_PROBE_MS = Number(process.env.CHROME_USE_LIVENESS_PROBE_MS) || 5_000;

// ── Reconnect policy ───────────────────────────────────────────────────────────
// The FIRST connect of this proxy's life may legitimately wait on a human to
// click Allow, so it gets CONNECT_TIMEOUT_MS (5 min). Every later attempt runs
// against an already-approved Chrome, so it gets a short timeout — if it has not
// connected by then, approval was revoked (or Chrome restarted unapproved) and
// waiting longer just hides the problem.
const RECONNECT_CONNECT_TIMEOUT_MS = Number(process.env.CHROME_USE_RECONNECT_TIMEOUT_MS) || 15_000;
const RECONNECT_MIN_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 30_000;
/**
 * Consecutive connect attempts that stall to the full timeout before we latch
 * `connectionBlocked`. A stall is the signature of an unanswered approval
 * dialog, so retrying it forever would queue dialogs at nobody. Two attempts
 * tolerates one genuinely slow/flaky handshake without nagging the user.
 */
const MAX_APPROVAL_STALLS = 2;
/**
 * How long a `connectionBlocked` latch suppresses further connect attempts.
 * After this, one explicit user command re-arms a single attempt (see
 * ensureConnected). Long enough that a retry loop cannot nag the user with
 * dialogs, short enough that a human who just clicked Allow is not stuck.
 */
const BLOCK_RETRY_COOLDOWN_MS = Number(process.env.CHROME_USE_BLOCK_RETRY_COOLDOWN_MS) || 60_000;

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
let blockedAt = 0;
let keepalive: ReturnType<typeof setInterval> | null = null;
let keepaliveInFlight = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let approvalStalls = 0;
/** True once this proxy has completed a handshake — i.e. approval is known-granted. */
let everConnected = false;
/** Set on re-arm after a block: the next attempt may wait on a human click. */
let awaitingApproval = false;

function stopKeepalive(): void {
  if (keepalive) clearInterval(keepalive);
  keepalive = null;
  keepaliveInFlight = false;
}

/**
 * Latch the proxy closed. Reserved for the one condition automatic recovery
 * cannot fix: Chrome is reachable but will not complete a handshake, which
 * means a native approval dialog is waiting on a human. Every other failure
 * (Chrome closed, socket dropped, connection refused) is retried instead.
 */
function blockConnection(reason: string): void {
  if (connectionBlocked) return;
  connectionBlocked = reason;
  blockedAt = Date.now();
  stopKeepalive();
  cancelReconnect();
  log(`${reason} Automatic recovery exhausted — a human must approve remote debugging.`);
}

function cancelReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

/**
 * Queue another connect attempt with exponential backoff. Safe to call from any
 * failure path: it is idempotent while a timer is already armed, and it never
 * runs concurrently with an in-flight attempt because ensureConnected() is
 * single-flight. Retries continue indefinitely so the proxy self-heals whenever
 * the user reopens Chrome; only blockConnection() stops the loop.
 */
function scheduleReconnect(): void {
  if (connectionBlocked || reconnectTimer || cdp?.connected) return;
  const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_MIN_DELAY_MS * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  log(`Scheduling reconnect attempt ${reconnectAttempt} in ${delay}ms.`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // ensureConnected() re-arms the timer itself on failure.
    ensureConnected().catch(() => {});
  }, delay);
  reconnectTimer.unref();
}

/**
 * Drop the current connection and start recovering. Called when the socket
 * closes and when the heartbeat finds a connection that is open at the TCP
 * level but no longer answering CDP.
 */
function handleConnectionLost(client: Cdp, detail: string): void {
  if (cdp !== client && cdp !== null) return; // superseded by a newer connection
  if (cdp === client) cdp = null;
  stopKeepalive();
  try {
    client.close();
  } catch {
    /* already closed */
  }
  log(`Chrome debugging connection lost: ${detail}`);
  scheduleReconnect();
}

/**
 * Heartbeat. Unlike the previous implementation this does not merely keep the
 * socket warm — it is the detector for half-open connections, where the TCP
 * socket stays "connected" but Chrome has stopped answering. Without it a dead
 * connection is only discovered by the next user command, which is exactly the
 * "stale connection" symptom this proxy kept exhibiting.
 */
function startKeepalive(client: Cdp): void {
  stopKeepalive();
  keepalive = setInterval(() => {
    if (keepaliveInFlight || cdp !== client || !client.connected || connectionBlocked) return;
    keepaliveInFlight = true;
    // Existing socket only. This timer never calls ensureConnected() directly;
    // it hands a confirmed-dead connection to handleConnectionLost() instead.
    sendWithTimeout(client, 'Browser.getVersion', {}, undefined, LIVENESS_PROBE_MS)
      .then(
        () => {},
        (err) => {
          if (cdp !== client) return;
          handleConnectionLost(client, `heartbeat failed (${err?.message ?? err})`);
        },
      )
      .finally(() => {
        keepaliveInFlight = false;
      });
  }, KEEPALIVE_MS);
  keepalive.unref();
}

function sendWithTimeout<T>(
  client: Cdp,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`CDP request timed out after ${timeoutMs}ms: ${method}`)),
      timeoutMs,
    );
    client.send<T>(method, params, sessionId).then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Is the CDP connection itself still alive?
 *
 * A single request can hang for reasons that have nothing to do with the browser
 * connection: a wedged renderer, a page stuck in a modal/beforeunload state, or
 * an optional per-target command that a given target never answers. Those must
 * NOT take the shared proxy down: dropping the link costs every session on this
 * machine a reconnect round-trip for no reason, and historically it latched the
 * proxy closed entirely.
 *
 * `Browser.getVersion` is browser-level (no sessionId), so it still answers when
 * one page session is wedged. If it answers quickly, the connection is healthy
 * and only that one request failed.
 */
async function connectionAlive(client: Cdp): Promise<boolean> {
  if (!client.connected) return false;
  try {
    await sendWithTimeout(client, 'Browser.getVersion', {}, undefined, LIVENESS_PROBE_MS);
    return true;
  } catch {
    return false;
  }
}

function ensureConnected(): Promise<void> {
  if (cdp?.connected) return Promise.resolve();
  if (connectionBlocked) {
    // Blocked is NOT permanent. It means "two connect attempts stalled, so a
    // human probably has to click Allow" — and once they have, the fix must be
    // to simply retry the command. Making this state terminal was the last
    // remaining reason anyone ever killed the shared proxy, and killing it is
    // strictly counterproductive: the proxy is the last approved client, so
    // stopping it lapses Chrome's approval instead of restoring it.
    //
    // So: an explicit user command re-arms one attempt, rate-limited to one per
    // BLOCK_RETRY_COOLDOWN_MS. The cooldown is what keeps the original guarantee
    // intact — a session retrying in a loop still cannot queue dialogs at nobody.
    if (Date.now() - blockedAt < BLOCK_RETRY_COOLDOWN_MS) {
      return Promise.reject(
        new Error(
          `${connectionBlocked} Approve remote debugging at chrome://inspect/#remote-debugging, ` +
            `then retry this command — the proxy will try again (no restart needed, and restarting ` +
            `would only lapse Chrome's approval).`,
        ),
      );
    }
    log('Re-arming after a block: a user command is asking for one more connect attempt.');
    connectionBlocked = null;
    approvalStalls = 0;
    reconnectAttempt = 0;
    awaitingApproval = true;
  }
  // Single-flight: a connect attempt is already in progress (own WebSocket to
  // Chrome, own pending dialog if unapproved). Share that same promise instead
  // of opening a second one — only one dialog can be pending at a time.
  if (connecting) return connecting;
  // A user command should not sit behind a backoff timer that may be 30s out.
  // Cancel the pending wake-up and attempt now; failure re-arms the backoff.
  cancelReconnect();

  // Approval is a one-time human gate. Before it is granted, wait minutes for
  // the click; after it is granted, a slow handshake means something is wrong.
  const timeout = everConnected && !awaitingApproval ? RECONNECT_CONNECT_TIMEOUT_MS : CONNECT_TIMEOUT_MS;

  connecting = (async () => {
    // Production always auto-detects the user's real Chrome across stable, dev,
    // beta, and canary channels. Tests may point an isolated proxy at a temporary
    // DevToolsActivePort fixture via CHROME_USE_TEST_USER_DATA_DIR — resolveSocketConfig()
    // at module load already rejected every other combination, so `testUserDataDir`
    // here is only ever set together with a non-default, isolated test socket.
    const ws = socketConfig.testUserDataDir
      ? buildWsEndpoint('stable', socketConfig.testUserDataDir)
      : await buildWsEndpointAuto();
    log(`Connecting to ${ws} (timeout ${timeout}ms)`);
    if (!everConnected) {
      log('Chrome shows a one-time "Allow remote debugging?" dialog — click Allow (waits up to 5 min).');
    }
    const startedAt = Date.now();
    let client: Cdp;
    try {
      client = await Cdp.connect(ws, timeout);
    } catch (err: any) {
      // Distinguish "nobody answered the dialog" from "Chrome is not there".
      // Only the former is unrecoverable without a human; treat a stall as the
      // dialog signature, since a refused/failed connect returns fast.
      if (Date.now() - startedAt >= timeout * 0.9) {
        approvalStalls += 1;
        log(`Connect stalled to its ${timeout}ms timeout (${approvalStalls}/${MAX_APPROVAL_STALLS}).`);
        if (approvalStalls >= MAX_APPROVAL_STALLS) {
          blockConnection('Chrome did not accept a debugging connection; an approval dialog is likely unanswered.');
        }
      } else {
        approvalStalls = 0;
      }
      throw err;
    }
    cdp = client;
    client.onClose((info) => {
      if (cdp !== client) return;
      const detail = `ws close code=${info?.code ?? 'n/a'} reason=${JSON.stringify(info?.reason ?? '')} source=${info?.source ?? 'unknown'}`;
      handleConnectionLost(client, detail);
    });
    // Bounded on purpose: Chrome can complete the WebSocket upgrade and then never
    // answer (half-open). An unbounded await here would leave `connecting` pending
    // forever with a dead `cdp` cached, wedging every command on the proxy. The
    // handshake is already done at this point, so a healthy Chrome replies at once.
    const v = await sendWithTimeout<any>(client, 'Browser.getVersion', {}, undefined, LIVENESS_PROBE_MS);
    log(`Connected. ${v?.product ?? 'Chrome'}`);
    everConnected = true;
    awaitingApproval = false;
    reconnectAttempt = 0;
    approvalStalls = 0;
    startKeepalive(client);
  })()
    .then(() => {
      connecting = null;
    })
    .catch((err) => {
      connecting = null;
      try {
        cdp?.close();
      } catch {
        /* ignore */
      }
      cdp = null;
      // Do NOT latch closed here. Chrome may simply be closed or restarting;
      // retrying costs nothing and self-heals. blockConnection() above is the
      // only path that gives up, and it cancels the backoff loop itself.
      log(`Connect attempt failed: ${err?.message ?? err}`);
      scheduleReconnect();
      throw err;
    });
  return connecting;
}

// ── Per-request relay ────────────────────────────────────────────────────────────

async function handle(msg: any): Promise<{ id: any; result?: unknown; error?: string }> {
  const { id, method, params, sessionId, timeoutMs } = msg ?? {};

  if (method === '__status') {
    return {
      id,
      result: {
        connected: !!cdp?.connected,
        connectionBlocked,
        blockRetryInMs: connectionBlocked
          ? Math.max(0, BLOCK_RETRY_COOLDOWN_MS - (Date.now() - blockedAt))
          : 0,
        reconnecting: !cdp?.connected && !connectionBlocked,
        reconnectAttempt,
        socketPath: SOCKET_PATH,
        version: PROXY_VERSION,
        pid: process.pid,
      },
    };
  }
  // `__stop` is deliberately NOT implemented. The proxy is shared machine-wide and
  // holds the single approved Chrome connection, so any client able to stop it can
  // force a new "Allow remote debugging?" dialog for every other session. Outdated
  // skill copies still call it on a version mismatch; answering with an error keeps
  // them from tearing down a healthy proxy. Stopping it is a human OS action (`kill <pid>`).
  if (method === '__stop') {
    return {
      id,
      error:
        'chrome-use: this proxy is shared and cannot be stopped remotely. ' +
        'It is safe to keep using — command logic lives in the CLI, so a version mismatch needs no restart. ' +
        `If it is genuinely wedged, a human must stop pid ${process.pid} out-of-band.`,
    };
  }

  try {
    await ensureConnected();
    const client = cdp!;
    if (TRACE) log(`-> ${method}${sessionId ? ` [sess ${String(sessionId).slice(0, 8)}]` : ''}`);
    // Clients may request a SHORTER deadline for best-effort/optional commands
    // (e.g. Emulation.setFocusEmulationEnabled). Never longer than the global cap.
    const requested = Number(timeoutMs);
    const deadline =
      Number.isFinite(requested) && requested > 0
        ? Math.min(requested, REQUEST_TIMEOUT_MS)
        : REQUEST_TIMEOUT_MS;
    const result = await sendWithTimeout(client, method, params ?? {}, sessionId, deadline);
    return { id, result };
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (cdp?.connected && message.startsWith('CDP request timed out after ')) {
      const client = cdp;
      // Only a dead CONNECTION justifies tearing the link down. One hung request
      // does not — a wedged renderer or an unanswered optional per-target command
      // must never cost every other session its browser connection.
      if (await connectionAlive(client)) {
        log(`Request timed out but the CDP connection is alive — keeping proxy up: ${message}`);
        return { id, error: `${message} (connection still healthy; retry this command)` };
      }
      // Confirmed dead. Recover in the background and tell the caller to retry.
      // We deliberately do NOT replay the request: it may have already been
      // executed by Chrome before the link dropped, and silently repeating an
      // input event (a click, a form submit) is worse than one visible error.
      handleConnectionLost(client, `request hung and liveness probe failed: ${message}`);
      return {
        id,
        error: `${message} (connection dropped; the proxy is reconnecting automatically — retry this command)`,
      };
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
  ensureConnected().catch((err) =>
    log('Initial connection failed; retrying with backoff:', err.message),
  );

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
