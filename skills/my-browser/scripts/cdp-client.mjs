#!/usr/bin/env node
/**
 * CDP gateway client — sends one command to cdp-gateway and prints the result.
 *
 * The gateway must be running (node cdp-gateway.mjs). It holds the single
 * browser connection so Chrome's permission dialog only fires once.
 *
 * Usage:
 *   node cdp-client.mjs '{"method":"list_pages"}'
 *   node cdp-client.mjs '{"method":"navigate","url":"https://example.com"}'
 *   node cdp-client.mjs '{"method":"eval","expression":"document.title"}'
 *   node cdp-client.mjs '{"method":"get_text"}'
 *   node cdp-client.mjs '{"method":"screenshot","filePath":"/tmp/shot.png"}'
 *   node cdp-client.mjs '{"method":"status"}'
 *   node cdp-client.mjs '{"method":"stop"}'
 */
import net from 'node:net';
import os from 'node:os';

const SOCKET_PATH = process.env.CDP_GATEWAY_SOCKET
  ?? `/tmp/cdp-gateway-${os.userInfo().uid}.sock`;

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
      catch (e) { reject(new Error(`Bad response: ${buf}`)); }
    });
    socket.on('error', err => { clearTimeout(timer); reject(err); });
    socket.on('close', () => { clearTimeout(timer); if (buf && !buf.includes('\n')) reject(new Error('Connection closed without response')); });
  });
}

const raw = process.argv[2];
if (!raw) { console.error('Usage: node cdp-client.mjs \'{"method":"list_pages"}\''); process.exit(1); }

let msg;
try { msg = JSON.parse(raw); }
catch { console.error('Invalid JSON:', raw); process.exit(1); }

send(msg)
  .then(res => { console.log(JSON.stringify(res, null, 2)); })
  .catch(err => { console.error('Error:', err.message, `\n(Is cdp-gateway running? node cdp-gateway.mjs)`); process.exit(1); });
