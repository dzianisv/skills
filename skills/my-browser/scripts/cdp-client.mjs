#!/usr/bin/env node
/**
 * CDP gateway client — sends one command to cdp-gateway and prints the result.
 *
 * Starts the gateway automatically if it is not running. No manual setup needed.
 *
 * Usage:
 *   node cdp-client.mjs '{"method":"list_pages"}'
 *   node cdp-client.mjs '{"method":"navigate","url":"https://example.com"}'
 *   node cdp-client.mjs '{"method":"eval","expression":"document.title"}'
 *   node cdp-client.mjs '{"method":"get_text"}'
 *   node cdp-client.mjs '{"method":"screenshot","filePath":"/tmp/shot.png"}'
 *   node cdp-client.mjs '{"method":"status"}'
 */
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOCKET_PATH = process.env.CDP_GATEWAY_SOCKET
  ?? `/tmp/cdp-gateway-${os.userInfo().uid}.sock`;

const GATEWAY_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'cdp-gateway.mjs'
);

function send(msg) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: SOCKET_PATH });
    let buf = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Timeout')); }, 30000);
    socket.on('connect', () => socket.write(JSON.stringify(msg) + '\n'));
    socket.on('data', chunk => {
      buf += chunk.toString();
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      clearTimeout(timer);
      try { resolve(JSON.parse(buf.slice(0, nl))); }
      catch { reject(new Error(`Bad response: ${buf}`)); }
    });
    socket.on('error', err => { clearTimeout(timer); reject(err); });
    socket.on('close', () => { clearTimeout(timer); if (buf && !buf.includes('\n')) reject(new Error('Connection closed without response')); });
  });
}

async function ensureGateway() {
  // Probe first — if healthy, nothing to do.
  try {
    await send({ method: 'status' });
    return;
  } catch {}

  // Gateway not running — start it (daemonizes itself, exits parent quickly).
  const child = spawn(process.execPath, [GATEWAY_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();

  // Wait up to 5 s for the socket to appear and respond.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
    try { await send({ method: 'status' }); return; } catch {}
  }
  throw new Error(
    'Gateway did not start in time.\n' +
    'Make sure Chrome is running and remote debugging is allowed at chrome://inspect/#remote-debugging'
  );
}

const raw = process.argv[2];
if (!raw) { console.error('Usage: node cdp-client.mjs \'{"method":"list_pages"}\''); process.exit(1); }

let msg;
try { msg = JSON.parse(raw); }
catch { console.error('Invalid JSON:', raw); process.exit(1); }

await ensureGateway();

send(msg)
  .then(res => { console.log(JSON.stringify(res, null, 2)); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });
