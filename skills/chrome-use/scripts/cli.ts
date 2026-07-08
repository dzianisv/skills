/**
 * chrome-use CLI — the one-shot client where ALL command logic lives.
 *
 * It parses argv into a Command, ensures the transparent proxy is running
 * (auto-starting it via double-fork if needed), then runs the matching command
 * handler in-process. Handlers build raw CDP payloads and send them through the
 * proxy (a dumb relay). Because the logic is here and not in the proxy, command
 * behavior can change without restarting the proxy — so no repeated Chrome prompts.
 */
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseArgv } from './lib/argv.ts';
import { ProxyClient } from './lib/proxy-client.ts';
import { ClientState } from './lib/session.ts';
import type { Command, CommandResult, Ctx, Handler, TabSession } from './lib/types.ts';

import { handlers as navigationHandlers } from './commands/navigation.ts';
import { handlers as interactionHandlers } from './commands/interaction.ts';
import { handlers as filesHandlers } from './commands/files.ts';
import { handlers as inspectionHandlers } from './commands/inspection.ts';
import { handlers as tabsHandlers } from './commands/tabs.ts';
import { handlers as cookiesHandlers } from './commands/cookies.ts';

const SOCKET_PATH = process.env.CHROME_USE_SOCKET ?? `/tmp/chrome-use-${os.userInfo().uid}.sock`;
const PROXY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'proxy.ts');

const registry: Record<string, Handler> = {
  ...navigationHandlers,
  ...interactionHandlers,
  ...filesHandlers,
  ...inspectionHandlers,
  ...tabsHandlers,
  ...cookiesHandlers,
};

/** Commands that do not need a resolved active tab up front. */
const NO_TAB = new Set(['status', 'tab']);

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
  file_upload <@ref|sel> <path...>   set files on an <input type=file>

Inspection:
  snapshot [-i] [--json] [-s <css>]   ref tree (@e1 …); -i interactive-only
  get url|title                       page url / title
  get text|html|value <sel>           element content
  get attr <sel> <attr>               element attribute
  screenshot [path] [--full]          save a png
  eval <js>                           Runtime.evaluate, JSON result

Tabs & cookies:
  tab | tab new [url] | tab <tN> | tab close [tN]
  cookies | cookies set <name> <val> | cookies clear

Other:
  status                          proxy + browser health
  stop                            stop the proxy (next command reconnects)
  help                            this message

Global: add --json for structured output where supported.`;

/** Probe whether the proxy answers a control status within `timeoutMs`. */
async function proxyAlive(timeoutMs: number): Promise<boolean> {
  let client: ProxyClient | null = null;
  try {
    client = await ProxyClient.open(SOCKET_PATH, timeoutMs);
    await client.send('__status', {});
    return true;
  } catch {
    return false;
  } finally {
    client?.close();
  }
}

/** Ensure the transparent proxy is running, starting it (double-fork) if not. */
async function ensureProxy(): Promise<void> {
  if (await proxyAlive(2000)) return;

  const child = spawn(process.execPath, [PROXY_PATH], { detached: true, stdio: 'ignore' });
  child.unref();

  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    if (await proxyAlive(2000)) return;
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

  // `stop` shuts the proxy down (forces a fresh connect + approval next time).
  if (command.name === 'stop') {
    try {
      const c = await ProxyClient.open(SOCKET_PATH, 3000);
      await c.send('__stop', {});
      c.close();
      process.stdout.write('proxy stopped\n');
    } catch {
      process.stdout.write('no proxy running\n');
    }
    return;
  }

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
      tab = (await state.getActiveTab().catch(() => null)) as TabSession;
    }
    const ctx: Ctx = { cdp, state, tab, command };
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
