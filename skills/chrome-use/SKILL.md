---
name: chrome-use
description: Drive the user's real running Chrome with agent-browser-style commands: open pages, snapshot interactive elements as @e1 refs, click, fill, type, screenshot, scroll, and eval. Use for Chrome, browser automation, web automation, forms, clicks, screenshots, or @e1 refs. Always connects to the user's actual Chrome profile and live sessions via DevToolsActivePort autoConnect; it never launches or copies another browser profile.
---

# chrome-use

A zero-dependency TypeScript CLI that drives the user's **real running Chrome** with [agent-browser](https://skills.volces.com/skills/vercel-labs/agent-browser)-style commands. It speaks the Chrome DevTools Protocol (CDP) through the bundled WebSocket client and connects via Chrome 144+ autoConnect — no Puppeteer or `npm install`.

<constraints>
- Always control the user's currently running Chrome and its live profile, cookies, sessions, and tabs.
- Use only the bundled `chrome-use` CLI. It resolves the user's Chrome through `DevToolsActivePort`.
- Preserve user-owned tabs. Create dedicated task tabs when needed, pin evidence tabs by `targetId`, and close only tabs created by the task.
- If Chrome needs native approval, ask the user to click **Allow** at `chrome://inspect/#remote-debugging`; wait instead of launching another Chrome or copying a profile.
</constraints>

## Prerequisites

1. **Chrome 144+**, already running.
2. Enable remote debugging at `chrome://inspect/#remote-debugging`. Approve the first connection when Chrome asks; approval is per debugger connection, not permanent.
3. **Node 22+** (TypeScript runs natively via `node cli.ts` — no build step).
4. **No `npm install`** — zero dependencies.

## Quick start

Set `CHROME` once and use it throughout your session — **never call `node … cli.ts` directly**:

```bash
CHROME="$HOME/.agents/skills/chrome-use/scripts/chrome-use"
# or alias it:  alias cu="$CHROME"
```

The CLI auto-starts the proxy on first use, so you can jump straight to commands:

```bash
# 1. Create and pin a task-owned tab on the shared proxy
TID=$($CHROME tab new https://example.com --json | jq -er .targetId)
export CHROME_USE_PIN_TARGET="$TID"

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

## Installation and shared connection

Use one maintained skill directory — **every install path must be a symlink to it, never a copy.**
On this machine the canonical directory is `~/workspace/skills/skills/chrome-use`, and both
`~/.agents/skills/chrome-use` and every Hermes path
(`~/.hermes/skills/browser-control/chrome-use` and
`~/.hermes/profiles/*/skills/browser-control/chrome-use`) must resolve to it.

Verify with the bundled checker (exits non-zero on drift, `--fix` relinks):

```bash
~/.agents/skills/chrome-use/scripts/check-install.sh
~/.agents/skills/chrome-use/scripts/check-install.sh --fix
```

**A stale copy is the known cause of repeated "Allow remote debugging?" dialogs.**
Pre-2026-08 copies shipped an `ensureProxy()` that compared a content hash of the
running proxy against its own files and, on any mismatch, **stopped the shared proxy and
respawned its own** — so a single out-of-date copy tore down a healthy, approved
connection every time it ran. Per-profile installs made this worse: seven frozen copies
fought the maintained one, and each teardown cost a dialog. The current CLI never
restarts a live proxy, and the proxy now refuses `__stop`, but Hermes creates a
per-profile skills tree, so **a newly created profile can reintroduce a copy at any
time** — re-run the checker after adding one.

Production uses `/tmp/chrome-use-<uid>.sock`. Leave `CHROME_USE_SOCKET` unset:
task-specific socket overrides are rejected because each independent proxy opens its own
Chrome connection. Isolated sockets are for the offline fake-CDP tests only; never use
test configuration to bypass production sharing.

## Concurrency: isolate tasks with pinned tabs

The proxy, the Chrome profile, **and the active-tab pointer** (`/tmp/chrome-use-active-<uid>`) are shared machine-wide. If another agent/session runs a command between two of yours, it moves the active tab under you — so `get url` can report your page while the next `snapshot`/`screenshot` silently targets someone else's tab. Positional `tN` ids are also recomputed on every invocation, so they are not stable either.

For each task, pin to the tab's stable `targetId` before inspecting or changing it.
Reuse that ID for all task commands, including screenshots and other evidence:

```bash
TID=$($CHROME tab new https://example.com --json | jq -er .targetId)   # or read it from `$CHROME tab --json`
export CHROME_USE_PIN_TARGET="$TID"
$CHROME snapshot -i        # every command in this shell now targets that exact tab
$CHROME screenshot /tmp/proof.png
```

If the pinned tab is gone, commands fail loudly instead of silently falling back to another tab. `screenshot` brings its target tab to the front before capturing, so the image always matches the tab you addressed.

If your tool starts a fresh shell for each invocation, set `CHROME` and
`CHROME_USE_PIN_TARGET` in each call; exports from an earlier shell do not persist.

## Command reference

| Command | Example | Notes |
|---------|---------|-------|
| `open` / `goto` / `navigate` | `$CHROME open https://example.com` | Aliases; no url → `about:blank` |
| `back` / `forward` / `reload` | `$CHROME back` | History navigation |
| `close` | `$CHROME close` | Closes the **pinned** tab. Requires `CHROME_USE_PIN_TARGET`; without a pin it refuses, because the active-tab pointer is shared and you would be closing someone else's tab. A positional argument does not select a tab: `close t3` does not mean close t3 — use `tab close <targetId>`. |
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
| `tab` | `$CHROME tab new https://github.com` | `tab` (list) / `tab new [url]` / `tab <tN>` (switch) / `tab close <tN\|targetId>`; `--json` also returns each tab's stable `targetId`. `tab close` with no argument requires a pin |
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

- **The proxy is a transparent CDP relay.** It holds *one* connection to Chrome and forwards raw `{method, params, sessionId}` frames to it. It contains **no command logic** — no snapshot walker, no selector resolver, no input sequences. Funnelling every session through this single long-lived connection is what keeps approval alive: Chrome's approval lapses when the last approved client disconnects, so one never-closing client means one dialog, ever. It is also the single place to run the heartbeat and reconnect loop.
- **The CLI holds all the logic.** Each `chrome-use …` invocation is a fresh one-shot process: it parses argv, builds the raw CDP payloads itself, sends them through the proxy, prints the result, and exits. It auto-starts the proxy (double-fork) if the socket is absent.

A key consequence: since command behavior lives entirely in the CLI, **you can change/upgrade command logic without restarting the proxy** — so the approval prompt is not re-triggered. Proxy code changes require a deliberate maintainer transition to take effect; the CLI never automatically restarts a live proxy just because its code changed.

State that must outlive a one-shot CLI process lives outside it: the **active-tab pointer** is a small file (`/tmp/chrome-use-active-<uid>`), and **`@eN` refs live in the page** (`window.__chromeUseRefs`), so they persist across invocations and reset naturally on navigation. Page sessions are attached lazily (only the tab a command touches) and detached when the command finishes.

## Connection loss and recovery

The proxy **reconnects on its own**. You never need to restart it, and you must never
ask the user to kill it.

```
        ┌──────────────┐  ws close / heartbeat fails  ┌───────────────┐
        │  connected   │ ───────────────────────────▶ │ reconnecting  │
        │  (heartbeat  │ ◀─────────────────────────── │ backoff 0.5s  │
        │   every 20s) │        handshake ok          │ …→ 30s cap    │
        └──────────────┘                              └───────┬───────┘
                                                              │ 2 connect attempts
                                                              │ stall to timeout
                                                              ▼
                                                      ┌───────────────┐
                                                      │    blocked    │  ← human clicks
                                                      │ (dialog       │    Allow, then
                                                      │  unanswered)  │    retry
                                                      └───────────────┘
```

- **Heartbeat.** Every 20s the proxy sends a browser-level `Browser.getVersion`. This is
  a *detector*, not just a keepalive: it catches half-open connections where TCP is still
  up but Chrome stopped answering — the usual cause of a "stale connection".
- **Backoff.** A lost connection is retried at 0.5s, 1s, 2s … capped at 30s, **forever**.
  Close Chrome and the proxy just keeps retrying; reopen it and the proxy heals with no
  dialog and no restart. A user command cancels the pending backoff and attempts at once,
  so you never wait out the timer.
- **Blocked** means one specific thing: two consecutive connect attempts stalled, which is
  the signature of an **unanswered approval dialog**. Click **Allow** at
  `chrome://inspect/#remote-debugging`, then just **retry your command** — a user command
  re-arms one attempt (rate-limited to once a minute, so a retry loop still cannot nag
  you with dialogs). Blocked is *not* terminal and never requires a restart.

Why reconnecting is worth attempting: Chrome's approval behaves as follows (measured
on Chrome 152) — while an approved client is **still connected**, an additional
browser-level CDP connection is accepted immediately with no dialog (~1.4s, 21 hours
after the original approval). But once the **last** approved client disconnects,
approval lapses and the next connect stalls on a fresh dialog.

So a reconnect is a bounded gamble, not a free action: a transient blip reconnects
silently, a lapsed approval stalls and needs one human click. An earlier version of
this skill assumed the worst case always applied and failed closed forever on any
drop. That was strictly worse — its documented cure was for a human to kill the proxy
and re-approve, i.e. the same click preceded by a pointless restart, while every other
session on the machine stayed broken in the meantime.

**The corollary is the real reason never to restart the proxy: it is the last approved
client.** Killing it lapses Chrome's approval and *guarantees* a new dialog. That is
the opposite of a fix.

Requests are **not** replayed across a reconnect. A click or form submit may already have
reached Chrome before the socket died, so the proxy returns a retryable error instead of
risking a duplicate action. Retrying is your job, and it is cheap.

## Connection contract

`chrome-use` exclusively uses Chrome 144+ autoConnect and reads the user's `DevToolsActivePort` file. The HTTP `/json/version` and `/json/list` endpoints do not exist on this connection; use the bundled CLI rather than constructing a connection manually.

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
| No human available to click **Allow** | autoConnect needs one physical click per new debugger client | Pause and ask the user to approve at `chrome://inspect/#remote-debugging`; continue with the same Chrome after approval |
| `DevToolsActivePort not found` | Chrome not running, or autoConnect not enabled | Start Chrome 144+, go to `chrome://inspect/#remote-debugging`, click **Allow** |
| Permission dialog appears on every run | New connections, task-specific sockets, or an outdated skill copy | Use the canonical installation and default socket above. Read `status`; preserve a healthy shared proxy rather than restarting it |
| Production socket override rejected | `CHROME_USE_SOCKET` points to a task-specific socket | Unset the override and isolate the task with `CHROME_USE_PIN_TARGET`; do not switch to another socket after a failure |
| Connection hangs on first command | Chrome is showing the "Allow remote debugging?" dialog | Switch to Chrome, click **Allow** before its five-minute timeout |
| `will not open another remote-debugging dialog` / `not accepting a debugging connection` | Chrome refused a connection twice — an approval dialog is waiting unanswered | Click **Allow** at `chrome://inspect/#remote-debugging`, then **retry the command**. The proxy re-arms itself after a 60s cooldown. Never kill it: it is the last approved client, so restarting *lapses* approval instead of restoring it |
| `page changed — re-run snapshot` | Acting on a stale `@eN` after navigation | Re-run `snapshot`, then use the fresh refs |
| `Daemon did not start in time` | Daemon failed to launch or Chrome not responding | Go to `chrome://inspect/#remote-debugging`, click **Allow**; check `./chrome-use status` |
| `/json/version` connection refused | Expected in autoConnect mode | Use the bundled CLI; the proxy handles `DevToolsActivePort` discovery and reuses its connection |
| Another debugger attached error | DevTools panel open on the same tab | Close DevTools panels / disconnect other debuggers |
| `connection dropped; the proxy is reconnecting automatically` | Chrome restarted, slept, or the CDP socket dropped | **Just retry the command.** The proxy reconnects on its own with backoff. Do not restart anything |
| `status` says `reconnecting` | Chrome is closed, restarting, or briefly unreachable | Make sure Chrome is running, then retry. The proxy retries forever and self-heals — no restart needed |
| A single command times out but `status` still says `proxy up` | One wedged page/target (or an optional per-target command) hung; the browser-level connection is fine | Expected since the 2026-08-14 fix: only that request fails. Retry the command, or re-run it on a fresh tab. Do **not** treat this as a dead proxy. |
| You think the proxy is broken and want to "reset" it | The proxy is **shared** and holds the Chrome connection; there is intentionally **no `chrome-use stop`**, and `__stop` is refused | Run `chrome-use status` and report it. Restarting fixes nothing the proxy does not already fix itself |

## Testing

A zero-dependency golden eval suite lives in `scripts/test/`. It exercises the real
DevToolsActivePort autoConnect path by driving the CLI against the user's running
Chrome through the proxy:

```bash
cd scripts && npm test          # unit + reconnect + large-message + golden eval cases (needs Chrome)
cd scripts && npm run test:offline   # everything except the golden cases — no Chrome, CI-safe
cd scripts && npm run live-smoke     # guided live reconnect smoke (needs Chrome + 1 Allow click)
```

Offline tests cover argv/port/selector parsing, production socket isolation,
proxy lock/concurrency, hung-request regressions, real-socket reconnect, and the
**large-message/`permessage-deflate` regressions** that pin the 4 MiB connection-death
bug. The 19 end-to-end golden cases cover open/back/forward/reload, snapshot `@e1`
trees, click/fill/type/press, selectors, get, screenshot, eval, wait, and tabs.

The golden cases each run in a dedicated tab they create and close; fixtures are
`data:` URLs (host/VM safe). Run them only when the user is available for Chrome's
one-time approval. `test:offline` skips them. See `scripts/test/README.md`.

> Unix sockets are capped at ~104 chars on macOS. If `TMPDIR` is long, tests fail with
> `proxy socket not up` — run them with `TMPDIR=/tmp/cu-t`.


## Do NOT

- **Do not stop or restart the proxy, and do not tell the user to.** There is intentionally **no `chrome-use stop`**, and the proxy refuses the internal `__stop` method. The proxy is **shared across all sessions** and is the *last approved client* — Chrome's remote-debugging approval lapses the moment it disconnects, so killing it **guarantees** the dialog you were trying to avoid. It also recovers from connection loss by itself (see "Connection loss and recovery"). If a session looks unhealthy, run `chrome-use status` and **report** it.
- **Do not treat a dropped connection as fatal.** `connection dropped; the proxy is reconnecting automatically` means: retry the command. It is transient.
- Kill or restart a **healthy proxy** — it forces a new Chrome permission dialog. The CLI probes and reuses it automatically. (Changing *command* logic does not require a proxy restart — only changes to `proxy.ts` do.)
- **Do not swap `lib/ws.ts` back to Node's global `WebSocket`.** It caps messages at 4 MiB over `permessage-deflate` and destroys the socket past that — which is exactly the bug that made `screenshot` kill browser automation machine-wide.
- Launch, clone, seed, or switch to another Chrome profile. Wait for access to the user's running Chrome instead.
- Hand-build a raw WebSocket debugger URL or connect directly to the port file. Always go through the `chrome-use` CLI so the one approved connection is reused.
- Query `/json/version` or `/json/list`; those HTTP endpoints do not exist on the autoConnect connection.
- Reuse `@eN` refs across a navigation or between tabs — refs are per-tab and reset on navigation. Re-snapshot first.
