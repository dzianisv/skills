---
name: chrome-use
description: Use when the user wants to drive their real running Chrome with agent-browser-style commands — open pages, snapshot interactive elements as @e1 refs, click, fill, type, screenshot, scroll, eval. Triggers on chrome, browser automation, web automation, fill a form, click a button, snapshot the page, @e1 refs, agent-browser, take a screenshot. Connects to the user's actual Chrome profile (live sessions, cookies, auth) via DevToolsActivePort autoConnect, zero dependencies. Do NOT use for headless/throwaway browsers or launching a new Chrome instance.
---

# chrome-use

A zero-dependency TypeScript CLI that drives the user's **real running Chrome** with [agent-browser](https://skills.volces.com/skills/vercel-labs/agent-browser)-style commands. It speaks the Chrome DevTools Protocol (CDP) directly over Node 22's built-in `WebSocket` and connects via Chrome 144+ autoConnect — **no Puppeteer, no `npm install`, no `--remote-debugging-port`**.

## Prerequisites

1. **Chrome 144+**, already running.
2. Navigate to `chrome://inspect/#remote-debugging` in Chrome and click **Allow** once (one-time only).
3. **Node 22+** (TypeScript runs natively via `node cli.ts` — no build step).
4. **No `npm install`** — zero dependencies.

## Quick start

Set `CHROME` once and use it throughout your session — **never call `node … cli.ts` directly**:

```bash
CHROME=/Users/engineer/.agents/skills/chrome-use/scripts/chrome-use
# or alias it:  alias cu="$CHROME"
```

The CLI auto-starts the proxy on first use, so you can jump straight to commands:

```bash
# 1. Open a page
$CHROME open https://example.com

# 2. Snapshot the interactive elements — assigns @eN refs
$CHROME snapshot -i
#   @e1 [textbox]  "Email"
#   @e2 [textbox]  "Password"
#   @e3 [button]   "Sign in"
#   @e4 [link]     "Forgot password?"

# 3. Act on the refs from that snapshot
$CHROME fill @e1 "me@example.com"
$CHROME fill @e2 "hunter2"
$CHROME click @e3

# 4. Capture the result
$CHROME screenshot /tmp/out.png
```

### The @e1 ref system

`snapshot` walks the page and assigns a stable `@eN` ref to each element it lists. You then pass those refs to `click`, `fill`, `type`, `hover`, `focus`, etc. Refs are:

- **Per-tab** — each tab has its own set of refs from its latest snapshot.
- **Invalidated on navigation** — once the page navigates (or you click something that loads a new page), the old refs are stale. **Re-run `snapshot` after any navigation**, then use the fresh refs.

Acting on a stale ref returns a clear "page changed — re-run `snapshot`" error rather than clicking the wrong thing.

## Command reference

| Command | Example | Notes |
|---------|---------|-------|
| `open` / `goto` / `navigate` | `$CHROME open https://example.com` | Aliases; no url → `about:blank` |
| `back` / `forward` / `reload` | `$CHROME back` | History navigation |
| `close` | `$CHROME close` | Close the active tab |
| `snapshot` | `$CHROME snapshot -i --json -s "#login"` | `-i` interactive-only; assigns `@eN`; `-s` scopes to a CSS root; `--json` structured output |
| `click` | `$CHROME click @e3 --new-tab` | Trusted mouse event; `--new-tab` opens link in a new tab |
| `fill` | `$CHROME fill @e1 "me@example.com"` | Clears the field, then inserts text |
| `type` | `$CHROME type @e1 "hello"` | Per-key key events (for inputs that watch keystrokes) |
| `press` | `$CHROME press Enter` | e.g. `Enter`, `Tab`, `Control+a` |
| `focus` / `hover` | `$CHROME hover @e4` | Move focus / hover at element center |
| `get` | `$CHROME get text "#main"` | `text\|html\|value\|attr\|url\|title [sel] [attr]`; `url`/`title` take no selector |
| `screenshot` | `$CHROME screenshot /tmp/out.png --full` | PNG; `--full` full-page; saves to a temp file if no path |
| `eval` | `$CHROME eval "document.title"` | `Runtime.evaluate`; returns JSON result |
| `scroll` | `$CHROME scroll down 800` | `up\|down\|left\|right [px]` |
| `wait` | `$CHROME wait "#ready" --text Done --url /dashboard` | Selector, ms duration, text, or url pattern |
| `tab` | `$CHROME tab new https://github.com` | `tab` (list) / `tab new [url]` / `tab <tN>` (switch) / `tab close [tN]` |
| `cookies` | `$CHROME cookies set session abc123` | `cookies` (list) / `cookies set <name> <val>` / `cookies clear`; scoped to active tab's URL |
| `status` | `$CHROME status` | Daemon + browser health, page count |

Output is human/AI-readable text by default; `--json` opts into structured JSON where useful.

## Selector forms

Interaction and `get` commands accept three selector forms:

- **`@e1`, `@e2`** — element refs from the most recent `snapshot` on the active tab (preferred).
- **CSS** — `#id`, `.class`, `div > button`, etc. (`document.querySelector`).
- **`text=Submit`** — the first element whose trimmed text matches.

## How it works

```
Chrome (real profile) ──CDP/WS──▶ chrome-use proxy  (Unix socket; transparent CDP relay)
                                       ▲   holds the single approved connection
                              chrome-use (cli.ts; one-shot; ALL command logic + payloads)
```

Two pieces with a deliberate split:

- **The proxy is a transparent CDP relay.** It holds *one* approved CDP connection to Chrome and forwards raw `{method, params, sessionId}` frames to it. It contains **no command logic** — no snapshot walker, no selector resolver, no input sequences. Because Chrome's permission dialog fires on every *new* debugger client, funnelling everything through this one long-lived connection means the dialog fires **once per proxy lifetime**.
- **The CLI holds all the logic.** Each `chrome-use …` invocation is a fresh one-shot process: it parses argv, builds the raw CDP payloads itself, sends them through the proxy, prints the result, and exits. It auto-starts the proxy (double-fork) if the socket is absent.

A key consequence: since command behavior lives entirely in the CLI, **you can change/upgrade command logic without restarting the proxy** — so the approval prompt is not re-triggered. The proxy only restarts if the proxy code itself changes (rare).

State that must outlive a one-shot CLI process lives outside it: the **active-tab pointer** is a small file (`/tmp/chrome-use-active-<uid>`), and **`@eN` refs live in the page** (`window.__chromeUseRefs`), so they persist across invocations and reset naturally on navigation. Page sessions are attached lazily (only the tab a command touches) and detached when the command finishes.

## autoConnect vs --remote-debugging-port

`chrome-use` connects the same way as `my-browser`: autoConnect, not a debugging port.

| | `--remote-debugging-port` | autoConnect |
|---|---|---|
| HTTP API (`/json/version`, `/json/list`) | Yes | **No** — does not exist |
| Port discovery | Fixed, you set it | Read the `DevToolsActivePort` file |
| Chrome profile | Separate `--user-data-dir` | Your real running profile |
| Permission dialog | No | Once per new debugger client |
| Chrome version | Any | 144+ |

**Critical**: Do not `curl http://localhost:<port>/json/version` — that endpoint does not exist in autoConnect mode. Use the `DevToolsActivePort` file plus a direct WebSocket.

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
| `DevToolsActivePort not found` | Chrome not running, or autoConnect not enabled | Start Chrome 144+, go to `chrome://inspect/#remote-debugging`, click **Allow** |
| Permission dialog appears on every run | New connections instead of the shared proxy | Let the CLI auto-start and reuse the proxy; do not kill it between commands |
| Connection hangs on first command | Chrome is showing the "Allow remote debugging?" dialog | Switch to Chrome, click **Allow** |
| `page changed — re-run snapshot` | Acting on a stale `@eN` after navigation | Re-run `snapshot`, then use the fresh refs |
| `Daemon did not start in time` | Daemon failed to launch or Chrome not responding | Go to `chrome://inspect/#remote-debugging`, click **Allow**; check `./chrome-use status` |
| `/json/version` connection refused | Expected in autoConnect mode | Use `DevToolsActivePort` + direct WebSocket; do not curl the HTTP API |
| Another debugger attached error | DevTools panel open on the same tab | Close DevTools panels / disconnect other debuggers |
| `CDP connection closed` after a Chrome restart / dropped socket | The CDP WebSocket dropped | Nothing — the proxy now auto-reconnects on the **next** command (re-reading `DevToolsActivePort` for Chrome's new port). No `stop`/restart needed. If it persists, Chrome isn't running. |

## Testing

A zero-dependency golden eval suite lives in `scripts/test/`. It exercises the **real
connection path** (DevToolsActivePort autoConnect) by driving the CLI against your
running Chrome through the proxy — *my-browser style*, not `--remote-debugging-port`:

```bash
cd scripts && npm test          # unit + reconnect + golden eval cases (needs Chrome)
cd scripts && npm run test:offline   # unit + reconnect only — no Chrome, CI-safe
cd scripts && npm run live-smoke     # guided live reconnect smoke (needs Chrome + 1 Allow click)
```

8 unit tests (argv/port/selector parsing) + a real-socket **reconnect** regression test
(spawns the proxy and drives it through a connect → drop → reconnect cycle against an
in-process CDP server — no Chrome needed) + 19 end-to-end golden cases (open/back/
forward/reload, snapshot `@e1` trees, click/fill/type/press, selectors, get, screenshot,
eval, wait, tabs). The golden cases each run in a dedicated tab they create and close
(never touch your tabs); fixtures are `data:` URLs (host/VM safe) and need your approved
Chrome. `test:offline` skips them. See `scripts/test/README.md`.

## Do NOT

- Kill or restart a **healthy proxy** — it forces a new Chrome permission dialog. The CLI probes and reuses it automatically. (Changing *command* logic does not require a proxy restart — only changes to `proxy.ts` do.)
- Use `--remote-debugging-port` flags — this skill uses autoConnect.
- Hand-build a raw `ws://127.0.0.1:<port>/devtools/browser/<uuid>` URL or write a one-off script to connect straight to the CDP debug port — even though the proxy reads `DevToolsActivePort` internally, every raw/direct debugger connection is a brand-new client to Chrome and re-triggers the native "Allow remote debugging?" dialog. Always go through the `chrome-use` CLI so the one approved connection is reused.
- Launch a throwaway/automation Chrome instance with a hardcoded `--remote-debugging-port` — if it collides with the real profile's port you get confusing cross-talk while diagnosing connections. Use `--remote-debugging-port=0` (OS-assigned ephemeral port) for any separate instance so it can never collide.
- `curl http://localhost:<port>/json/version` or `/json/list` — those HTTP endpoints do not exist in autoConnect mode.
- Reuse `@eN` refs across a navigation or between tabs — refs are per-tab and reset on navigation. Re-snapshot first.
