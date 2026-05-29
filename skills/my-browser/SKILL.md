---
name: my-browser
description: Use when the user wants to interact with their real running Chrome browser — browse pages, fill forms, click buttons, read content, take screenshots, or run JavaScript. Connects to the user's actual Chrome profile with live sessions, cookies, and auth. Do NOT use when the user wants a headless/throwaway browser or to launch a new Chrome instance.
---

# my-browser

Control the user's real running Chrome (with their live sessions, cookies, and auth) via a persistent Puppeteer gateway. No `--remote-debugging-port` flag needed — uses Chrome 144+ autoConnect mode.

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│  Chrome (user's real profile, already running)              │
│  autoConnect enabled at chrome://inspect/#remote-debugging  │
└──────────────┬──────────────────────────────────────────────┘
               │ WebSocket (browser-level, from DevToolsActivePort)
               │ Permission dialog fires ONCE on first connect
┌──────────────▼──────────────────────────────────────────────┐
│  cdp-gateway.mjs  (persistent Node.js process)             │
│  • Connects once, keeps connection alive                    │
│  • Serves commands over Unix socket                         │
│  • No repeated Chrome dialogs                              │
└──────────────┬──────────────────────────────────────────────┘
               │ Unix socket: /tmp/cdp-gateway-<uid>.sock
┌──────────────▼──────────────────────────────────────────────┐
│  cdp-client.mjs  (one-shot per command)                    │
│  • Sends JSON command, prints JSON result                   │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Chrome 144+**, already running.
2. Navigate to `chrome://inspect/#remote-debugging` in Chrome and click **Allow** once.
3. `npm install puppeteer` in the scripts directory.

## Sandbox requirement

**All gateway and client commands must run with `dangerouslyDisableSandbox: true`.**

The sandbox blocks reads from `~/Library/` on macOS, where `DevToolsActivePort` lives. Without disabling it, the gateway fails with `EPERM`. This applies to both `cdp-gateway.mjs` (reads `DevToolsActivePort`) and `cdp-client.mjs` (connects to the Unix socket).

## Quick start

### 1. Check if gateway is already running

```bash
node scripts/cdp-client.mjs '{"method":"status"}'
# ok:true → reuse it, skip step 2
# error  → start it below
```

### 2. Start gateway (only if status failed)

```bash
cd scripts && npm install puppeteer
node scripts/cdp-gateway.mjs
# Chrome shows permission dialog ONCE — click Allow
# Gateway stays running, prints socket path
```

> **DO NOT kill or restart an existing gateway.** Killing it forces a new Chrome permission dialog. Always probe first with `status`. Only start a new gateway when the status probe fails.

### 3. Send commands

```bash
node scripts/cdp-client.mjs '{"method":"list_pages"}'
node scripts/cdp-client.mjs '{"method":"navigate","url":"https://example.com"}'
node scripts/cdp-client.mjs '{"method":"new_page","url":"https://github.com"}'
node scripts/cdp-client.mjs '{"method":"eval","expression":"document.title"}'
node scripts/cdp-client.mjs '{"method":"get_text"}'
node scripts/cdp-client.mjs '{"method":"get_text","index":2}'
node scripts/cdp-client.mjs '{"method":"screenshot","filePath":"/tmp/shot.png"}'
node scripts/cdp-client.mjs '{"method":"close_page","index":3}'
node scripts/cdp-client.mjs '{"method":"insert_text","text":"hello world"}'
node scripts/cdp-client.mjs '{"method":"key_press","key":"Enter"}'
node scripts/cdp-client.mjs '{"method":"key_press","key":"a","modifiers":["Meta"]}'
```

## Command reference

| Method | Params | Returns |
|--------|--------|---------|
| `status` | — | `{ok, version, pageCount, socketPath}` |
| `list_pages` | — | `{ok, pages: [{index, url, title}]}` |
| `new_page` | `url?`, `timeout?` | `{ok, index, url}` |
| `navigate` | `url`, `index?`, `waitUntil?`, `timeout?` | `{ok, url, title}` |
| `eval` | `expression`, `index?` | `{ok, result}` |
| `get_text` | `index?` | `{ok, text}` |
| `screenshot` | `filePath?`, `index?`, `fullPage?` | `{ok, filePath}` or `{ok, data}` (base64) |
| `close_page` | `index` | `{ok}` |
| `insert_text` | `text`, `index?` | `{ok, length}` |
| `key_press` | `key`, `modifiers?`, `index?` | `{ok}` |

- `index` selects which page/tab (0-based). Omit for the first page.
- `waitUntil`: `"domcontentloaded"` (default), `"load"`, or `"networkidle0"`.

## autoConnect vs --remote-debugging-port

| | `--remote-debugging-port` | autoConnect |
|---|---|---|
| HTTP API (`/json/version`, `/json/list`) | Yes | **No** — does not exist |
| Port discovery | Fixed, you set it | Read `DevToolsActivePort` file |
| Chrome profile | Separate `--user-data-dir` | Your real running profile |
| Permission dialog | No | Once per new debugger client |
| Chrome version | Any | 144+ |

**Critical**: Do not `curl http://localhost:<port>/json/version` — that endpoint does not exist in autoConnect mode.

## DevToolsActivePort file locations

```bash
# macOS
~/Library/Application Support/Google/Chrome/DevToolsActivePort

# Linux
~/.config/google-chrome/DevToolsActivePort

# Windows
%LOCALAPPDATA%\Google\Chrome\User Data\DevToolsActivePort
```

File format: two lines — port number, then WebSocket path:
```
9222
/devtools/browser/4fd90b22-ee98-4c06-b81e-82128d5d7a1d
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `DevToolsActivePort not found` | Chrome not running or autoConnect not enabled | Go to `chrome://inspect/#remote-debugging`, click Allow |
| Connection hangs | Chrome showing "Allow remote debugging?" dialog | Switch to Chrome, click Allow |
| Dialog appears on every run | Creating new connections instead of using gateway | Use `cdp-gateway.mjs` persistently |
| Gateway exits with "Another instance already running" | Expected — gateway is already up | Just use `cdp-client.mjs` |
| `ProtocolError: Network.enable timed out` | Another debugger attached to same tab | Close DevTools panels, disconnect other debuggers |
| `/json/version` connection refused | Expected in autoConnect mode | Use DevToolsActivePort + direct WebSocket |

## Do NOT

- Kill or restart a healthy gateway — forces a new Chrome permission dialog
- Use `--remote-debugging-port` flags — this skill uses autoConnect
- Call `/json/version` or `/json/list` — those HTTP endpoints don't exist
- Send `{"method":"stop"}` to the gateway unless explicitly asked to shut down
