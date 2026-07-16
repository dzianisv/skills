/**
 * chrome-use CLI — the one-shot client where ALL command logic lives.
 *
 * It parses argv into a Command, ensures the transparent proxy is running
 * (auto-starting it via double-fork if needed), then runs the matching command
 * handler in-process. Handlers build raw CDP payloads and send them through the
 * proxy (a dumb relay). Because the logic is here and not in the proxy, command
 * behavior can change without restarting the proxy — so no repeated Chrome prompts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseArgv } from './lib/argv.ts';
import { ProxyClient } from './lib/proxy-client.ts';
import { ClientState } from './lib/session.ts';
import type { Command, CommandResult, Ctx, Handler, TabSession } from './lib/types.ts';

import { handlers as navigationHandlers } from './commands/navigation.ts';
import { handlers as interactionHandlers } from './commands/interaction.ts';
import { handlers as inspectionHandlers } from './commands/inspection.ts';
import { handlers as tabsHandlers } from './commands/tabs.ts';
import { handlers as cookiesHandlers } from './commands/cookies.ts';

const SOCKET_PATH = process.env.CHROME_USE_SOCKET ?? `/tmp/chrome-use-${os.userInfo().uid}.sock`;
const PROXY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'proxy.ts');
const LOG_PATH = `${SOCKET_PATH}.log`;
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MiB

/**
 * Files that define proxy *behavior* — mirrors proxy.ts's own VERSION_FILES
 * exactly (same 3 files, same exclusion of cli.ts/commands/) so the hash
 * computed here matches what a freshly-spawned proxy computes for itself.
 */
const VERSION_FILES = [
  PROXY_PATH,
  path.join(path.dirname(PROXY_PATH), 'lib', 'cdp.ts'),
  path.join(path.dirname(PROXY_PATH), 'lib', 'devtools-port.ts'),
];

/** Content hash of the currently-installed proxy files (see proxy.ts's computeVersion). */
function computeExpectedVersion(): string {
  const hash = crypto.createHash('sha256');
  for (const f of VERSION_FILES) hash.update(fs.readFileSync(f));
  return hash.digest('hex');
}

/**
 * Open the persistent daemon log for appending, rotating the previous file to
 * a single `.1` generation if it has grown past MAX_LOG_BYTES. Same path (and
 * rotation rule) as proxy.ts's own openLogFd — both spawn sites append to one
 * shared log so a full cold start's output ends up in one place.
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

/**
 * List page/iframe (OOPIF) targets with sanitized locations (origin + pathname
 * only — query strings can carry session tokens and are dropped). Helps pick the
 * right `--frame <substr>` for a cross-origin embedded form. Read-only.
 */
const framesCmd: Handler = async (ctx): Promise<CommandResult> => {
  const { targetInfos } = await ctx.cdp.send<any>('Target.getTargets', { filter: [{}] });
  const rows = (targetInfos as Array<{ targetId: string; type: string; url: string; title?: string }>)
    .filter((t) => t.type === 'iframe' || t.type === 'page')
    .map((t) => {
      let loc = '';
      try {
        const u = new URL(t.url);
        loc = u.origin + u.pathname;
      } catch {
        loc = '(opaque)';
      }
      return { type: t.type, url: loc, title: t.title ?? '' };
    });
  return { ok: true, data: rows };
};

/**
 * Debug: list ALL page targets with targetId + browserContextId + url, using an
 * explicit include-all filter so incognito/other-context pages are never dropped
 * by the default getTargets filter. Read-only.
 */
const targetsCmd: Handler = async (ctx): Promise<CommandResult> => {
  const { targetInfos } = await ctx.cdp.send<any>('Target.getTargets', { filter: [{}] });
  const rows = (targetInfos as Array<{ targetId: string; type: string; url: string; browserContextId?: string }>)
    .filter((t) => t.type === 'page')
    .map((t) => ({ targetId: t.targetId, browserContextId: t.browserContextId ?? '', url: t.url }));
  return { ok: true, data: rows };
};

/**
 * Debug/recovery: pin the active-tab pointer to an explicit targetId so later
 * commands operate on exactly that tab, bypassing positional/context drift.
 */
const usetargetCmd: Handler = async (ctx): Promise<CommandResult> => {
  const targetId = ctx.command.args[0];
  if (!targetId) return { ok: false, error: 'usage: usetarget <targetId>' };
  ctx.state.setActive(targetId);
  return { ok: true, text: `Active target set to ${targetId}` };
};

const registry: Record<string, Handler> = {
  ...navigationHandlers,
  ...interactionHandlers,
  ...inspectionHandlers,
  ...tabsHandlers,
  ...cookiesHandlers,
  frames: framesCmd,
  targets: targetsCmd,
  usetarget: usetargetCmd,
};

/** Commands that do not need a resolved active tab up front. */
const NO_TAB = new Set(['status', 'tab', 'frames', 'targets', 'usetarget']);

/**
 * Bind to a same-site cross-origin subframe of the ACTIVE tab whose URL contains
 * `match`, returning a TabSession that shares the page's CDP session but carries an
 * isolated-world executionContextId scoped to that subframe. This drives forms like
 * a payments.google.com billing iframe (same site as console.cloud.google.com, so
 * in-process — no separate CDP target) that the top-frame selector engine can't
 * reach. Scoped to the active tab's own frame tree, so duplicate tabs elsewhere in
 * the browser can't be targeted by accident.
 */
async function resolveFrameTab(cdp: ProxyClient, pageTab: TabSession, match: string): Promise<TabSession> {
  await cdp.send('Page.enable', {}, pageTab.sessionId).catch(() => {});
  const { frameTree } = await cdp.send<any>('Page.getFrameTree', {}, pageTab.sessionId);
  const frame = findFrameByUrl(frameTree, match);
  if (!frame) throw new Error(`No subframe matching '${match}' in the active tab`);
  const { executionContextId } = await cdp.send<any>(
    'Page.createIsolatedWorld',
    { frameId: frame.id, worldName: 'chrome-use-frame' },
    pageTab.sessionId,
  );
  return { ...pageTab, url: frame.url, executionContextId, tabId: 'frame', refRegistry: new Map() };
}

/** Depth-first search a CDP FrameTree for a frame whose url contains `match`. */
function findFrameByUrl(node: any, match: string): { id: string; url: string } | null {
  const f = node?.frame;
  if (f && typeof f.url === 'string' && f.url.includes(match)) return { id: f.id, url: f.url };
  for (const child of node?.childFrames ?? []) {
    const r = findFrameByUrl(child, match);
    if (r) return r;
  }
  return null;
}

const USAGE = `chrome-use — drive your real Chrome via CDP

Navigation:
  open|goto|navigate [url]        open a url (bare domain → https://)
  back | forward | reload         history navigation
  close                           close the active tab
  wait <sel|ms> [--text s] [--url pat]   wait for element/duration/text/url

Interaction:
  click <@ref|sel> [--new-tab]    trusted click
  fill <@ref|sel> <text>          clear + type into a field
  type <@ref|sel> <text>          type per-key
  press <key>                     e.g. Enter, Control+a
  focus|hover <@ref|sel>          focus / hover an element
  scroll <up|down|left|right> [px]
  upload <@ref|sel> <path...>     set files on a persistent <input type=file>
  dragdrop <@ref|sel> <path...>   simulate a file drag-and-drop onto a dropzone
                                   (for editors with no persistent file input)

Inspection:
  snapshot [-i] [--json] [-s <css>]   ref tree (@e1 …); -i interactive-only
  get url|title                       page url / title
  get text|html|value <sel>           element content
  get attr <sel> <attr>               element attribute
  screenshot [path] [--full]          save a png
  eval <js>                           Runtime.evaluate, JSON result
  emulate <w> <h> [--mobile] [--scale N]   CDP device viewport override
  emulate clear                       remove viewport override

Tabs & cookies:
  tab | tab new [url] | tab <tN> | tab close [tN]
  cookies | cookies set <name> <val> | cookies clear

Other:
  status                          proxy + browser health
  help                            this message

Global: add --json for structured output where supported.`;

/** Probe the proxy's control status within `timeoutMs`. */
async function proxyStatus(timeoutMs: number): Promise<{ alive: boolean; version?: string; pid?: number }> {
  let client: ProxyClient | null = null;
  try {
    client = await ProxyClient.open(SOCKET_PATH, timeoutMs);
    const res = await client.send<any>('__status', {});
    return { alive: true, version: res?.version, pid: res?.pid };
  } catch {
    return { alive: false };
  } finally {
    client?.close();
  }
}

/** Ask a running proxy to stop. Best-effort; a no-op if nothing is listening. */
async function stopProxy(timeoutMs: number): Promise<void> {
  let client: ProxyClient | null = null;
  try {
    client = await ProxyClient.open(SOCKET_PATH, timeoutMs);
    await client.send('__stop', {});
  } catch {
    /* already down */
  } finally {
    client?.close();
  }
}

/** Spawn a fresh proxy daemon (double-fork; routes through proxy.ts's own locked startup). */
function spawnProxy(): void {
  const logFd = openLogFd();
  const child = spawn(process.execPath, [PROXY_PATH], { detached: true, stdio: ['ignore', logFd, logFd] });
  fs.closeSync(logFd); // child has its own dup'd reference; safe to close ours
  child.unref();
}

/**
 * Ensure the transparent proxy is running AND running the currently-installed
 * code, starting/restarting it (double-fork) if not.
 *
 * A running proxy that reports a stale `version` (or none at all — predates
 * this field) predates a fix to proxy.ts/lib/cdp.ts/lib/devtools-port.ts; it
 * is stopped and respawned exactly once so it can't keep a dead/buggy
 * connection alive indefinitely. The respawn goes through the same spawn call
 * used for a cold start, which proxy.ts itself gates behind its own startup
 * lock — this function never touches the socket/lock files directly, so it
 * can't reintroduce the concurrent-startup race that lock fixes.
 */
async function ensureProxy(): Promise<void> {
  const expectedVersion = computeExpectedVersion();
  const initialStatus = await proxyStatus(2000);

  if (initialStatus.alive && initialStatus.version === expectedVersion) return;

  if (initialStatus.alive) {
    process.stderr.write('chrome-use: proxy is running stale code, restarting…\n');
    await stopProxy(3000);
    // Wait for the old process to actually exit before spawning a replacement:
    // __stop replies immediately but exits on setImmediate, so without this
    // wait the new spawn's own startup check could see the dying proxy's
    // socket still live and defer to it, silently no-op'ing the restart.
    const stopDeadline = Date.now() + 3000;
    let lastStatus = initialStatus;
    while (Date.now() < stopDeadline) {
      lastStatus = await proxyStatus(500);
      if (!lastStatus.alive) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (lastStatus.alive) {
      // The old proxy didn't exit within the grace window. Spawning a new one
      // now would be a guaranteed no-op — the new child's own checkAlreadyRunning()
      // sees the still-live socket and exits immediately — which used to surface
      // only as a generic "did not start in time" timeout below with no clue what
      // actually went wrong and no escape hatch. Fail loudly and specifically
      // instead of falling through to spawnProxy().
      const pid = lastStatus.pid;
      throw new Error(
        `chrome-use: old proxy${pid ? ` (pid ${pid})` : ''} is still running after a 3s stop request and ` +
          `did not exit.\n` +
          `Refusing to start a second proxy alongside it — that would silently no-op and reintroduce the ` +
          `double-CDP-connection bug this lock exists to prevent.\n` +
          (pid
            ? `Manually stop it, then retry: kill ${pid}`
            : `Manually find and stop it (its pid was not reported), e.g.: pgrep -fl proxy.ts`),
      );
    }
  }

  spawnProxy();

  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    const s = await proxyStatus(2000);
    // Require a version match (not just "alive") so a respawn that raced a
    // wedged old proxy can't be mistaken for success.
    if (s.alive && s.version === expectedVersion) return;
  }
  throw new Error(
    'chrome-use proxy did not start in time.\n' +
      'Make sure Chrome is running and remote debugging is allowed at chrome://inspect/#remote-debugging',
  );
}

function printResult(result: CommandResult, command: Command): void {
  if (!result.ok) {
    process.stderr.write('Error: ' + (result.error ?? 'unknown error') + '\n');
    process.exitCode = 1;
    return;
  }
  const wantJson = command.flags.json === true;
  if (wantJson || (result.data !== undefined && result.text === undefined)) {
    process.stdout.write(JSON.stringify(result.data ?? result, null, 2) + '\n');
  } else {
    process.stdout.write((result.text ?? '') + '\n');
  }
}

async function main(): Promise<void> {
  const command = parseArgv(process.argv.slice(2));

  if (command.name === 'help' || command.name === '--help') {
    process.stdout.write(USAGE + '\n');
    return;
  }

  // NOTE: there is deliberately NO public `stop` command. The proxy is shared
  // across every session and holds the ONE approved Chrome remote-debugging
  // connection; a `chrome-use stop` was called by agents far too often "to reset"
  // for no real reason, killing that connection and re-triggering Chrome's
  // "Allow remote debugging?" consent dialog for everyone. `stop` therefore falls
  // through to the normal unknown-command path below (exit 1, proxy untouched).
  // Terminating a genuinely broken proxy is an explicit out-of-band OS action for
  // a human/maintainer (e.g. `kill <pid>`), never something the agent CLI exposes.
  // (`__stop` still exists as an internal control method, used only by
  // ensureProxy()'s one-shot restart when the proxy is running stale code.)

  const handler = registry[command.name];
  if (!handler) {
    process.stderr.write(`Error: unknown command '${command.name}'. Run 'chrome-use help'.\n`);
    process.exitCode = 1;
    return;
  }

  await ensureProxy();

  // One persistent proxy connection for this invocation; long timeout so the first
  // command can wait through Chrome's approval dialog.
  const cdp = await ProxyClient.open(SOCKET_PATH, 320_000);
  const state = new ClientState(cdp);

  try {
    let tab: TabSession = null as unknown as TabSession;
    if (!NO_TAB.has(command.name)) {
      tab = await state.getActiveTab();
    } else {
      // NO_TAB commands (status, tab) may not need a tab at all — don't force
      // Target.getTargets (via getActiveTab()) if the proxy has no live Chrome
      // connection yet. That call would fall through to ensureConnected() and
      // block through the same up-to-5-minute approval wait a real
      // browser-driving command legitimately waits through, just to
      // opportunistically resolve a tab nobody asked for. Cheaply check the
      // proxy's connection state first via the same fast `__status` control
      // channel the `status` handler uses, and only attempt to resolve a tab
      // when a connection already exists (so the call is fast, not a fresh
      // connect attempt).
      const proxyState = await cdp.send<any>('__status', {}).catch(() => null);
      if (proxyState?.connected) {
        tab = (await state.getActiveTab().catch(() => null)) as TabSession;
      }
    }
    const ctx: Ctx = { cdp, state, tab, command };
    if (tab && typeof command.flags.frame === 'string') {
      ctx.tab = await resolveFrameTab(cdp, tab, command.flags.frame);
    }
    const result = await handler(ctx);
    printResult(result, command);
  } finally {
    await state.dispose().catch(() => {});
    cdp.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('cli.ts')) {
  main().catch((err) => {
    process.stderr.write('Error: ' + (err?.message ?? String(err)) + '\n');
    process.exit(1);
  });
}
