/**
 * Locate and parse Chrome's DevToolsActivePort file and build the browser-level
 * WebSocket endpoint for autoConnect. No HTTP /json/version endpoint exists in
 * autoConnect mode — we read the port file and connect to the WS path directly.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export type Channel = 'stable' | 'canary' | 'beta' | 'dev';

/** Absolute path to the DevToolsActivePort file for a channel / explicit profile dir. */
export function getPortPath(channel: Channel = 'stable', userDataDir?: string): string {
  if (userDataDir) return path.join(userDataDir, 'DevToolsActivePort');
  const h = os.homedir();
  if (os.platform() === 'darwin') {
    const d: Record<string, string> = {
      stable: 'Google/Chrome',
      canary: 'Google/Chrome Canary',
      beta: 'Google/Chrome Beta',
      dev: 'Google/Chrome Dev',
    };
    return path.join(h, 'Library/Application Support', d[channel] ?? d.stable, 'DevToolsActivePort');
  }
  if (os.platform() === 'linux') {
    const d: Record<string, string> = {
      stable: '.config/google-chrome',
      canary: '.config/google-chrome-unstable',
      beta: '.config/google-chrome-beta',
      dev: '.config/google-chrome-unstable',
    };
    return path.join(h, d[channel] ?? d.stable, 'DevToolsActivePort');
  }
  return path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/User Data/DevToolsActivePort');
}

/**
 * Parse a DevToolsActivePort file body. Format is two lines:
 *   <port>
 *   <ws-path>   e.g. /devtools/browser/4fd90b22-...
 * Returns the browser-level ws:// endpoint.
 * @throws if the body is malformed.
 */
export function parsePortFile(content: string): string {
  const [rawPort, rawPath] = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!rawPort || !rawPath) throw new Error(`Invalid DevToolsActivePort: ${JSON.stringify(content)}`);
  const port = parseInt(rawPort, 10);
  if (!port || port < 1 || port > 65535) throw new Error(`Bad port in DevToolsActivePort: ${rawPort}`);
  return `ws://127.0.0.1:${port}${rawPath}`;
}

/** Read the port file and build the ws:// browser endpoint, with a helpful error. */
export function buildWsEndpoint(channel: Channel = 'stable', userDataDir?: string): string {
  const portPath = getPortPath(channel, userDataDir);
  let content: string;
  try {
    content = fs.readFileSync(portPath, 'utf8');
  } catch (e: any) {
    throw new Error(
      `DevToolsActivePort not found at ${portPath}.\n` +
        `Make sure Chrome is running and remote debugging is allowed at chrome://inspect/#remote-debugging.\n` +
        `${e.message}`,
    );
  }
  return parsePortFile(content);
}

/**
 * Best-effort identity check: is whatever is listening on `port` a
 * throwaway/automation Chrome instance launched with a hardcoded
 * `--remote-debugging-port=` flag, rather than a real user-profile Chrome
 * driven via DevToolsActivePort autoConnect (which never carries that flag)?
 *
 * Root cause this guards against: a throwaway automation Chrome hardcoded to
 * `--remote-debugging-port=9561` repeatedly collided with the real Chrome's
 * port, and plain TCP-reachability picked whichever one answered first —
 * silently connecting to the wrong browser.
 *
 * Uses `lsof` to find the pid listening on `port`, then `ps` to inspect that
 * pid's command line. Deliberately best-effort: if `lsof`/`ps` are missing,
 * error, or time out, this returns `false` (treat as "not confirmed
 * throwaway") so callers fall back to plain TCP-reachability behavior for
 * that candidate instead of crashing endpoint resolution.
 */
function isThrowawayDebugChrome(port: number): boolean {
  try {
    const pidsRaw = execFileSync('lsof', [`-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      timeout: 500,
      encoding: 'utf8',
    });
    const pids = pidsRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));

    for (const pid of pids) {
      try {
        const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
          timeout: 500,
          encoding: 'utf8',
        });
        if (/--remote-debugging-port=/.test(cmd)) return true;
      } catch {
        // process gone or ps unavailable for this pid — check remaining pids
      }
    }
    return false;
  } catch {
    // lsof missing/erroring — best-effort, never hard-fail identity verification
    return false;
  }
}

/**
 * Try all known Chrome channels and return the ws:// endpoint for the first
 * one whose port file exists AND whose port is reachable (TCP connect) AND —
 * best-effort — does not belong to a throwaway/automation Chrome instance
 * (see isThrowawayDebugChrome). Falls back to the stable channel error if
 * none respond.
 */
export async function buildWsEndpointAuto(userDataDir?: string): Promise<string> {
  const channels: Channel[] = ['stable', 'dev', 'beta', 'canary'];
  const candidates: { channel: Channel; endpoint: string }[] = [];

  for (const channel of channels) {
    try {
      const portPath = getPortPath(channel, userDataDir);
      const content = fs.readFileSync(portPath, 'utf8');
      const endpoint = parsePortFile(content);
      candidates.push({ channel, endpoint });
    } catch {
      // port file missing or malformed — skip
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `DevToolsActivePort not found for any Chrome channel (stable, dev, beta, canary).\n` +
        `Make sure Chrome is running and remote debugging is allowed at chrome://inspect/#remote-debugging.`,
    );
  }

  // Pick the first candidate whose port actually accepts connections.
  for (const { endpoint } of candidates) {
    const match = endpoint.match(/ws:\/\/127\.0\.0\.1:(\d+)/);
    if (!match) continue;
    const port = parseInt(match[1], 10);
    const reachable = await new Promise<boolean>((resolve) => {
        const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
        sock.destroy();
        resolve(true);
      });
      let timer: ReturnType<typeof setTimeout>;
      sock.on('error', () => { clearTimeout(timer); resolve(false); });
      timer = setTimeout(() => { sock.destroy(); resolve(false); }, 300);
    });
    if (!reachable) continue;
    // Reachable isn't enough on its own — confirm it's not a throwaway
    // automation Chrome that happens to be listening on this port before
    // accepting it; if we can't confirm either way, accept it (best-effort).
    if (isThrowawayDebugChrome(port)) continue;
    return endpoint;
  }

  // All port files exist but none are reachable — return the first candidate's
  // endpoint and let the caller surface the connection error with the usual message.
  return candidates[0].endpoint;
}
