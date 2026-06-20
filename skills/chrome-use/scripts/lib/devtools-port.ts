/**
 * Locate and parse Chrome's DevToolsActivePort file and build the browser-level
 * WebSocket endpoint for autoConnect. No HTTP /json/version endpoint exists in
 * autoConnect mode — we read the port file and connect to the WS path directly.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';

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
 * Try all known Chrome channels and return the ws:// endpoint for the first
 * one whose port file exists AND whose port is reachable (TCP connect).
 * Falls back to the stable channel error if none respond.
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
    if (reachable) return endpoint;
  }

  // All port files exist but none are reachable — return the first candidate's
  // endpoint and let the caller surface the connection error with the usual message.
  return candidates[0].endpoint;
}
