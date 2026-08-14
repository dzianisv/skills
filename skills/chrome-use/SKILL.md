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

## Two modes: attended vs unattended

| | **Attended** (default) | **Unattended** (`agent-chrome.sh`) |
|---|---|---|
| Target | the user's real running Chrome | a dedicated Chrome instance |
| Connection | autoConnect (`DevToolsActivePort`) | `--remote-debugging-port=0` (ephemeral) |
| "Allow remote debugging?" dialog | yes, needs a physical click | **never** |
| Agent can restart it | no — a human must | yes, freely |
| Logged-in sessions | the user's, live | seeded copy of the user's profile |

**If no human is present to click a dialog, use the unattended mode.** An agent
cannot click Chrome's native Allow dialog: `osascript` and `cliclick` both need an
Accessibility grant, and `screencapture` returns redacted (black) window contents
without a Screen Recording grant — so a headless agent literally cannot see or
dismiss it.

```bash
CU=/Users/engineer/.agents/skills/chrome-use/scripts
eval "$($CU/agent-chrome.sh start)"   # launch/reuse + export the right env vars
$CU/chrome-use open https://example.com
$CU/chrome-use screenshot /tmp/proof.png
```

`agent-chrome.sh start|env|stop|reseed|status`. The dedicated profile lives at
`~/.chrome-use-agent` and is **seeded once** from the real Chrome profile, so
logged-in sessions (cookies, logins, local storage) carry over — verified against a
real authenticated site. Run `reseed` to refresh that state after logging into
something new in the real browser. `--remote-debugging-port=0` takes an OS-assigned
port, so it can never collide with the real profile's port.

Because this instance has no approval dialog, it also sets
`CHROME_USE_ALLOW_RECONNECT=1`: a dropped socket makes the proxy redial on the next
command instead of latching closed.

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

## Concurrency: pin the tab when the result is evidence

The proxy, the Chrome profile, **and the active-tab pointer** (`/tmp/chrome-use-active-<uid>`) are shared machine-wide. If another agent/session runs a command between two of yours, it moves the active tab under you — so `get url` can report your page while the next `snapshot`/`screenshot` silently targets someone else's tab. Positional `tN` ids are also recomputed on every invocation, so they are not stable either.

When the output is *evidence* (a bank statement screenshot, a confirmation page, anything a task's acceptance depends on), pin to the tab's stable `targetId`:

```bash
TID=$($CHROME tab new https://example.com --json | jq -r .targetId)   # or read it from `$CHROME tab --json`
export CHROME_USE_PIN_TARGET=$TID
$CHROME snapshot -i        # every command in this shell now targets that exact tab
$CHROME screenshot /tmp/proof.png
```

If the pinned tab is gone, commands fail loudly instead of silently falling back to another tab. `screenshot` brings its target tab to the front before capturing, so the image always matches the tab you addressed.

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
| `tab` | `$CHROME tab new https://github.com` | `tab` (list) / `tab new [url]` / `tab <tN>` (switch) / `tab close [tN]`; `--json` also returns each tab's stable `targetId` |
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

The CDP socket is `lib/ws.ts`, a hand-rolled RFC 6455 client — **not** Node's global
`WebSocket`. That is deliberate; see "Large payloads" below. Do not swap it back.

### Large payloads (why `lib/ws.ts` exists)

Node's built-in `WebSocket` (undici) automatically offers `permessage-deflate`, and
Chrome accepts it. undici's inflate path then destroys the TCP socket as soon as a
single message **inflates past 4 MiB** — with no clean protocol error, just an empty
`TypeError` from `#onSocketClose` and a 1006 abnormal close.

That one limit was responsible for the "browser automation is dead" class of failure:
a plain viewport screenshot of a content-heavy page is ~4.5 MB (~6 MB base64), so
`screenshot` reliably killed the connection, and the proxy read the dead socket as
"Chrome connection failed" and latched itself closed **machine-wide**. `get html` and
`eval` on large DOMs hit it too.

`lib/ws.ts` offers no extensions and imposes no payload cap, so Chrome sends plain
frames of any size. Regression coverage lives in `test/large-message.test.ts` — the
`permessage-deflate` case is the load-bearing one (an uncompressed test server does
**not** reproduce the bug).

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
| `screenshot` / `get html` kills the connection, then `proxy blocked` | **Fixed 2026-08-14.** Message >4 MiB over undici's `permessage-deflate` path destroyed the socket | Make sure `lib/cdp.ts` uses `lib/ws.ts`, not the global `WebSocket`. Run `npm run test:offline` |
| No human available to click **Allow** | autoConnect always needs one physical click per new debugger client | Use the unattended path: `eval "$(./agent-chrome.sh start)"`. No dialog exists on that instance |
| `DevToolsActivePort not found` | Chrome not running, or autoConnect not enabled | Start Chrome 144+, go to `chrome://inspect/#remote-debugging`, click **Allow** |
| Permission dialog appears on every run | New connections instead of the shared proxy | Let the CLI auto-start and reuse the proxy; do not kill it between commands |
| Connection hangs on first command | Chrome is showing the "Allow remote debugging?" dialog | Switch to Chrome, click **Allow** before its five-minute timeout |
| `will not open another remote-debugging dialog` | CDP approval, connection, or request failed | Do not retry browser commands. A human must stop proxy PID from `chrome-use status`, then run one browser command while ready to approve one dialog |
| `page changed — re-run snapshot` | Acting on a stale `@eN` after navigation | Re-run `snapshot`, then use the fresh refs |
| `Daemon did not start in time` | Daemon failed to launch or Chrome not responding | Go to `chrome://inspect/#remote-debugging`, click **Allow**; check `./chrome-use status` |
| `/json/version` connection refused | Expected in autoConnect mode | Use `DevToolsActivePort` + direct WebSocket; do not curl the HTTP API |
| Another debugger attached error | DevTools panel open on the same tab | Close DevTools panels / disconnect other debuggers |
| `Chrome debugging connection closed` | Chrome restarted or CDP socket dropped | Proxy fails closed. It will not auto-reconnect or create another dialog. A human must stop proxy PID from `chrome-use status`, then run one browser command while ready to approve it. |
| A single command times out but `status` still says `proxy up` | One wedged page/target (or an optional per-target command) hung; the browser-level connection is fine | Expected since the 2026-08-14 fix: only that request fails. Retry the command, or re-run it on a fresh tab. Do **not** treat this as a dead proxy. |
| You think the proxy is broken and want to "reset" it | The proxy is **shared** and holds the one approved Chrome connection; there is intentionally **no `chrome-use stop`** | Run `chrome-use status` and **report** it. Do not try to stop/restart it from the CLI. If a proxy is genuinely wedged, a **human/maintainer** terminates that process out-of-band (OS process management, e.g. `kill <pid>`) — never the agent. **Exception:** the `agent-chrome.sh` instance is agent-owned, so `./agent-chrome.sh stop` is always allowed. |

## Testing

A zero-dependency golden eval suite lives in `scripts/test/`. It exercises the **real
connection path** (DevToolsActivePort autoConnect) by driving the CLI against your
running Chrome through the proxy — *my-browser style*, not `--remote-debugging-port`:

```bash
cd scripts && npm test          # unit + reconnect + large-message + golden eval cases (needs Chrome)
cd scripts && npm run test:offline   # everything except the golden cases — no Chrome, CI-safe
cd scripts && npm run live-smoke     # guided live reconnect smoke (needs Chrome + 1 Allow click)
```

26 offline tests (argv/port/selector parsing, proxy lock/concurrency, hung-request
regressions, real-socket reconnect, and the **large-message/`permessage-deflate`
regressions** that pin the 4 MiB connection-death bug) + 19 end-to-end golden cases
(open/back/forward/reload, snapshot `@e1` trees, click/fill/type/press, selectors,
get, screenshot, eval, wait, tabs).

The golden cases each run in a dedicated tab they create and close (never touch your
tabs); fixtures are `data:` URLs (host/VM safe). Run them against the unattended
instance so they need no Allow click:

```bash
cd scripts && eval "$(./agent-chrome.sh start)" && node --test test/evals.test.ts
```

`test:offline` skips them. See `scripts/test/README.md`.

> Unix sockets are capped at ~104 chars on macOS. If `TMPDIR` is long, tests fail with
> `proxy socket not up` — run them with `TMPDIR=/tmp/cu-t`.


## Do NOT

- **Do not try to stop or restart the proxy.** There is intentionally **no `chrome-use stop`** command — the proxy is **shared across all sessions** and holds the single approved Chrome connection, so stopping it forces a fresh "Allow remote debugging?" dialog for **everyone**. If a session looks unhealthy, run `chrome-use status` and **report** it. Terminating a genuinely broken proxy is an explicit **out-of-band OS action for a human/maintainer** (e.g. `kill <pid>`), never something an agent does.
- Kill or restart a **healthy proxy** — it forces a new Chrome permission dialog. The CLI probes and reuses it automatically. (Changing *command* logic does not require a proxy restart — only changes to `proxy.ts` do.)
- **Do not swap `lib/ws.ts` back to Node's global `WebSocket`.** It caps messages at 4 MiB over `permessage-deflate` and destroys the socket past that — which is exactly the bug that made `screenshot` kill browser automation machine-wide.
- Use `--remote-debugging-port` flags **against the real profile** — this skill uses autoConnect there. (`agent-chrome.sh` deliberately uses `--remote-debugging-port=0` for its own separate instance, which is fine and cannot collide.)
- Hand-build a raw `ws://127.0.0.1:<port>/devtools/browser/<uuid>` URL or write a one-off script to connect straight to the CDP debug port — even though the proxy reads `DevToolsActivePort` internally, every raw/direct debugger connection is a brand-new client to Chrome and re-triggers the native "Allow remote debugging?" dialog. Always go through the `chrome-use` CLI so the one approved connection is reused.
- Launch a throwaway/automation Chrome instance with a hardcoded `--remote-debugging-port` — if it collides with the real profile's port you get confusing cross-talk while diagnosing connections. Use `--remote-debugging-port=0` (OS-assigned ephemeral port) for any separate instance so it can never collide.
- `curl http://localhost:<port>/json/version` or `/json/list` — those HTTP endpoints do not exist in autoConnect mode.
- Reuse `@eN` refs across a navigation or between tabs — refs are per-tab and reset on navigation. Re-snapshot first.
