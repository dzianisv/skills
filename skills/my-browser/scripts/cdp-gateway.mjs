#!/usr/bin/env node
/**
 * CDP autoConnect gateway.
 *
 * Connects to Chrome ONCE via DevToolsActivePort (triggers dialog once),
 * keeps that connection alive, and serves tool commands over a Unix socket.
 * No new browser connections per request = no repeated Chrome dialogs.
 *
 * Exits immediately if another instance is already running on the same socket.
 *
 * Usage:
 *   node cdp-gateway.mjs [channel] [userDataDir]
 *   Examples:
 *     node cdp-gateway.mjs              # stable Chrome, default profile
 *     node cdp-gateway.mjs canary       # Chrome Canary
 *     node cdp-gateway.mjs stable /path/to/profile
 *
 * Socket: /tmp/cdp-gateway-<uid>.sock  (overridable via CDP_GATEWAY_SOCKET env)
 * Requires: npm install puppeteer
 *
 * Command protocol — send one JSON line per connection, receive one JSON line:
 *   {"method":"status"}
 *   {"method":"list_pages"}
 *   {"method":"new_page","url":"https://..."}
 *   {"method":"navigate","url":"https://..."}              (uses active page)
 *   {"method":"navigate","url":"https://...","index":2}   (by page index)
 *   {"method":"eval","expression":"document.title"}
 *   {"method":"eval","expression":"...","index":0}
 *   {"method":"get_text"}
 *   {"method":"get_text","index":0}
 *   {"method":"screenshot"}                                (returns base64)
 *   {"method":"screenshot","filePath":"/tmp/s.png"}
 *   {"method":"screenshot","index":0}
 *   {"method":"close_page","index":0}
 *   {"method":"stop"}
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const SOCKET_PATH = process.env.CDP_GATEWAY_SOCKET
  ?? `/tmp/cdp-gateway-${os.userInfo().uid}.sock`;

function log(...a) { process.stderr.write('[cdp-gateway] ' + a.join(' ') + '\n'); }

// ── Singleton check ──────────────────────────────────────────────────────────

function checkAlreadyRunning() {
  return new Promise(resolve => {
    const socket = net.createConnection({ path: SOCKET_PATH });
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 1000);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.write(JSON.stringify({ method: 'status' }) + '\n');
    });
    socket.on('data', chunk => {
      clearTimeout(timer);
      socket.destroy();
      try {
        const res = JSON.parse(chunk.toString().split('\n')[0]);
        resolve(res.ok === true);
      } catch {
        resolve(false);
      }
    });
    socket.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

// ── Port discovery ───────────────────────────────────────────────────────────

function getPortPath(channel = 'stable', userDataDir) {
  if (userDataDir) return path.join(userDataDir, 'DevToolsActivePort');
  const h = os.homedir();
  if (os.platform() === 'darwin') {
    const d = { stable: 'Google/Chrome', canary: 'Google/Chrome Canary', beta: 'Google/Chrome Beta', dev: 'Google/Chrome Dev' };
    return path.join(h, 'Library/Application Support', d[channel] ?? d.stable, 'DevToolsActivePort');
  }
  if (os.platform() === 'linux') {
    const d = { stable: '.config/google-chrome', canary: '.config/google-chrome-unstable' };
    return path.join(h, d[channel] ?? d.stable, 'DevToolsActivePort');
  }
  return path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/User Data/DevToolsActivePort');
}

function buildWsEndpoint(channel, userDataDir) {
  const portPath = getPortPath(channel, userDataDir);
  let content;
  try { content = fs.readFileSync(portPath, 'utf8'); }
  catch (e) { throw new Error(`DevToolsActivePort not found at ${portPath}.\nEnable at chrome://inspect/#remote-debugging first.\n${e.message}`); }
  const [rawPort, rawPath] = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (!rawPort || !rawPath) throw new Error(`Invalid DevToolsActivePort: ${JSON.stringify(content)}`);
  const port = parseInt(rawPort, 10);
  if (!port || port < 1 || port > 65535) throw new Error(`Bad port: ${rawPort}`);
  // NOTE: /json/version does NOT exist here — direct WS only (browser-level endpoint)
  return `ws://127.0.0.1:${port}${rawPath}`;
}

// ── Single browser connection with mutex ─────────────────────────────────────

let browser = null;
let connectingPromise = null;  // mutex: only one connect at a time

async function getConnected(channel, userDataDir) {
  if (browser?.connected) return browser;
  if (connectingPromise) return connectingPromise; // wait for in-progress connect
  connectingPromise = (async () => {
    const ws = buildWsEndpoint(channel, userDataDir);
    log(`Connecting to ${ws}`);
    log(`Chrome will show a one-time permission dialog if not already approved.`);
    const b = await puppeteer.connect({
      browserWSEndpoint: ws,
      defaultViewport: null,
      handleDevToolsAsPage: true,
    });
    log(`Connected. ${await b.version()}`);
    b.on('disconnected', () => { log('Browser disconnected'); browser = null; connectingPromise = null; });
    browser = b;
    connectingPromise = null;
    return b;
  })();
  return connectingPromise;
}

// ── Page resolution ──────────────────────────────────────────────────────────

async function getPage(b, index) {
  const pages = await b.pages();
  if (!pages.length) throw new Error('No pages open');
  if (index === undefined || index === null) return pages[0];
  const i = Number(index);
  if (isNaN(i) || i < 0 || i >= pages.length) throw new Error(`Page index ${index} out of range (0–${pages.length - 1})`);
  return pages[i];
}

// ── Command dispatch ──────────────────────────────────────────────────────────

async function dispatch(msg, channel, userDataDir) {
  if (msg.method === 'stop') {
    setImmediate(() => { server?.close(); browser?.disconnect(); process.exit(0); });
    return { ok: true, message: 'stopping' };
  }

  const b = await getConnected(channel, userDataDir);

  switch (msg.method) {
    case 'status': {
      const pages = await b.pages();
      return { ok: true, version: await b.version(), pageCount: pages.length, socketPath: SOCKET_PATH };
    }
    case 'list_pages': {
      const pages = await b.pages();
      return { ok: true, pages: await Promise.all(pages.map(async (p, i) => ({
        index: i, url: p.url(), title: await p.title().catch(() => ''),
      }))) };
    }
    case 'new_page': {
      const page = await b.newPage();
      if (msg.url) await page.goto(msg.url, { waitUntil: 'domcontentloaded', timeout: msg.timeout ?? 30000 });
      return { ok: true, index: (await b.pages()).length - 1, url: page.url() };
    }
    case 'navigate': {
      if (!msg.url) throw new Error('url required');
      const page = await getPage(b, msg.index);
      await page.goto(msg.url, { waitUntil: msg.waitUntil ?? 'domcontentloaded', timeout: msg.timeout ?? 30000 });
      return { ok: true, url: page.url(), title: await page.title() };
    }
    case 'eval': {
      if (!msg.expression) throw new Error('expression required');
      const page = await getPage(b, msg.index);
      const result = await page.evaluate(msg.expression);
      return { ok: true, result };
    }
    case 'get_text': {
      const page = await getPage(b, msg.index);
      const text = await page.evaluate(() => document.body?.innerText ?? '');
      return { ok: true, text };
    }
    case 'screenshot': {
      const page = await getPage(b, msg.index);
      const data = await page.screenshot({ type: 'png', encoding: 'base64', fullPage: msg.fullPage ?? false });
      if (msg.filePath) { fs.writeFileSync(msg.filePath, Buffer.from(data, 'base64')); return { ok: true, filePath: msg.filePath }; }
      return { ok: true, data };
    }
    case 'close_page': {
      const page = await getPage(b, msg.index);
      await page.close();
      return { ok: true };
    }
    case 'insert_text': {
      if (!msg.text) throw new Error('text required');
      const page = await getPage(b, msg.index);
      const cdp = await page.createCDPSession();
      await cdp.send('Input.insertText', { text: msg.text });
      await cdp.detach();
      return { ok: true, length: msg.text.length };
    }
    case 'key_press': {
      if (!msg.key) throw new Error('key required');
      const page = await getPage(b, msg.index);
      const opts = {};
      if (msg.modifiers) {
        // modifiers: array of 'Meta','Ctrl','Shift','Alt'
        for (const m of msg.modifiers) await page.keyboard.down(m);
      }
      await page.keyboard.press(msg.key);
      if (msg.modifiers) {
        for (const m of [...msg.modifiers].reverse()) await page.keyboard.up(m);
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown method: ${JSON.stringify(msg.method)}` };
  }
}

// ── Unix socket server ────────────────────────────────────────────────────────

let server;

function startServer(channel, userDataDir) {
  try { fs.unlinkSync(SOCKET_PATH); } catch {}

  server = net.createServer(socket => {
    let buf = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      const line = buf.slice(0, nl).trim();
      buf = '';
      let msg;
      try { msg = JSON.parse(line); }
      catch { socket.write(JSON.stringify({ ok: false, error: `Invalid JSON: ${line}` }) + '\n'); socket.end(); return; }

      dispatch(msg, channel, userDataDir)
        .then(res  => { socket.write(JSON.stringify(res) + '\n'); socket.end(); })
        .catch(err => { socket.write(JSON.stringify({ ok: false, error: err.message }) + '\n'); socket.end(); });
    });
    socket.on('error', () => {});
  });

  server.listen(SOCKET_PATH, () => {
    log(`Listening on ${SOCKET_PATH}`);
    // Print socket path to stdout for clients to discover
    process.stdout.write(SOCKET_PATH + '\n');
  });
  server.on('error', err => { log('Server error:', err.message); process.exit(1); });
}

// ── Entry point ───────────────────────────────────────────────────────────────

const [,, channel = 'stable', userDataDir] = process.argv;

const alreadyRunning = await checkAlreadyRunning();
if (alreadyRunning) {
  log(`Another instance is already running on ${SOCKET_PATH}. Exiting.`);
  process.exit(1);
}

startServer(channel, userDataDir);

// Connect eagerly — dialog fires now, once, before any tool call
getConnected(channel, userDataDir).catch(err => { log('Connection failed:', err.message); process.exit(1); });

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => { server?.close(); browser?.disconnect(); process.exit(0); });
}
process.on('uncaughtException', err => log('Uncaught:', err.message));
