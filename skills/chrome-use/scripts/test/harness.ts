/**
 * Eval harness — my-browser style, host/VM safe.
 *
 * The suite exercises chrome-use's REAL connection path: it does NOT launch Chrome
 * and does NOT use --remote-debugging-port. It drives the chrome-use CLI against the
 * chrome-use proxy, which autoConnects to your real running Chrome via
 * DevToolsActivePort (reusing the already-approved connection — no new dialog).
 *
 * Fixtures are loaded as `data:` URLs (encoded from test/fixtures/*.html), NOT from a
 * local HTTP server: Chrome runs on the host while this harness runs on the VM, so a
 * VM-served http://127.0.0.1 origin is unreachable by the browser. data: URLs render
 * entirely in the browser, no network — correct regardless of where Chrome runs.
 *
 * To stay safe in your real browser, every test runs in a DEDICATED fixture tab it
 * creates and closes (see openFixture/afterEach in evals.test.ts); it never touches
 * your existing tabs, and the proxy is never stopped (killing it forces re-approval).
 * Each fixture carries a `cufix` marker so leftover fixture tabs can be closed safely.
 *
 * Requires your Chrome running + remote debugging allowed
 * (chrome://inspect/#remote-debugging → Allow). Not isolated / not CI-runnable by
 * design — that is the my-browser model. Zero npm dependencies.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const CLI = path.join(SCRIPTS_DIR, 'cli.ts');

/** Unique marker every fixture's HTML contains, so we only ever close our own tabs. */
export const FIXTURE_MARKER = 'cufix';

export interface CuResult {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout parsed as JSON, or undefined if it wasn't JSON. */
  json: any;
}

export interface Harness {
  /** data: URL for a fixture file, e.g. fixtureUrl('form.html'). */
  fixtureUrl(name: string): string;
  /** Run the chrome-use CLI against the real proxy (async / non-blocking). */
  cu(...args: string[]): Promise<CuResult>;
  teardown(): Promise<void>;
}

/** Build a harness bound to the real Chrome via the chrome-use proxy. */
export async function setup(): Promise<Harness> {
  // Isolated active-tab pointer so the suite doesn't disturb your real active tab.
  // Default socket + default DevToolsActivePort → reuse the real, approved proxy.
  const activeFile = path.join(os.tmpdir(), `chrome-use-eval-active-${process.pid}-${Date.now()}`);
  const env = { ...process.env, CHROME_USE_ACTIVE: activeFile };

  const cu = (args: string[], timeoutMs = 60_000): Promise<CuResult> =>
    new Promise<CuResult>((resolve) => {
      const child = spawn(process.execPath, [CLI, ...args], { env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
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

  const fixtureUrl = (name: string): string => {
    const html = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
    if (!html.includes(FIXTURE_MARKER)) throw new Error(`fixture ${name} is missing the ${FIXTURE_MARKER} marker`);
    return 'data:text/html,' + encodeURIComponent(html);
  };

  // Warm up: auto-starts the proxy if needed and waits through a one-time approval
  // dialog (up to 5 min) so the rest of the suite runs fast.
  const warm = await cu(['status'], 320_000);
  if (warm.code !== 0) {
    throw new Error(
      'chrome-use proxy/Chrome not reachable. Start Chrome and allow remote debugging ' +
        `at chrome://inspect/#remote-debugging.\n${warm.stderr || warm.stdout}`,
    );
  }

  return {
    fixtureUrl,
    cu: (...args: string[]) => cu(args),
    teardown: async () => {
      // Close only our own fixture tabs (identified by the marker), re-listing each
      // pass so tab ids stay valid. Never close other tabs; never stop the proxy.
      for (let i = 0; i < 40; i++) {
        const list = await cu(['tab', '--json']);
        if (!Array.isArray(list.json)) break;
        const t = list.json.find((x: any) => decodeURIComponent(String(x.url)).includes(FIXTURE_MARKER));
        if (!t) break;
        await cu(['tab', 'close', t.tabId]);
      }
      try {
        fs.rmSync(activeFile, { force: true });
      } catch {
        /* ignore */
      }
    },
  };
}
