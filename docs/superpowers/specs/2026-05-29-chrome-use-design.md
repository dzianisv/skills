# chrome-use — design spec

**Date:** 2026-05-29
**Status:** Approved for implementation

## Summary

`chrome-use` is a zero-dependency TypeScript CLI that drives the user's **real running
Chrome** using [agent-browser](https://skills.volces.com/skills/vercel-labs/agent-browser)'s
command-line ergonomics, but connecting the way the existing `my-browser` skill does — via
Chrome's `DevToolsActivePort` autoConnect, speaking the Chrome DevTools Protocol (CDP)
directly. No Puppeteer, no `--remote-debugging-port`, no npm dependencies.

```bash
chrome-use open https://example.com
chrome-use snapshot -i          # → @e1 [button] "Submit", @e2 [textbox] "Email" ...
chrome-use fill @e2 "me@x.com"
chrome-use click @e1
chrome-use screenshot /tmp/out.png
```

## Goals

- Reproduce agent-browser's **core automation command surface** (see Command Set) with the
  same subcommand/flag syntax and the signature `@e1` element-ref system.
- Connect to the user's real Chrome profile (live cookies/sessions/auth) via
  `DevToolsActivePort` autoConnect — identical connection model to `my-browser`.
- **Zero npm dependencies.** Raw CDP over Node 22's built-in global `WebSocket`.
- **No build step.** TypeScript runs natively via `node cli.ts` (type-stripping).
- Maximum autonomy: auto-start the daemon, auto-discover the port, clear recovery messages.

## Non-goals (v1)

Network interception/routing, HAR, React DevTools, profiler/tracing, visual diff,
auth/state stores, AI chat, `skills`/`doctor`/`install`. The command registry is designed
so these can be added later without rework.

## Runtime constraints (verified)

- Node `v22.22.2`: `node file.ts` runs TypeScript natively (type-stripping, no `tsc`/`tsx`).
- `WebSocket` is a global — zero-dep CDP transport.
- Chrome 144+ with autoConnect enabled (one-time `chrome://inspect/#remote-debugging` →
  Allow), exactly as `my-browser` requires.

## Architecture

**Transparent CDP proxy + client-side logic.** A persistent connection-holder is required
because autoConnect fires Chrome's permission dialog on **every new debugger client** — so all
traffic funnels through one long-lived connection (the dialog fires **once per proxy
lifetime**, as `my-browser` proved). But that process is a *dumb relay*: it forwards raw CDP
frames and holds no command logic. **All request payloads (snapshot walker, selector queries,
input event sequences, command parsing) are built client-side in the CLI.**

```
Chrome (real profile) ──WS/CDP──▶ chrome-use proxy (Unix socket; transparent CDP relay)
                                       ▲   holds the single approved connection
                              chrome-use (cli.ts; one-shot; ALL command logic + payloads)
```

Key payoff: because command behavior lives in the CLI (a fresh process per invocation), it can
change without restarting the proxy — so the approval prompt is never re-triggered during normal
iteration. State that must outlive a one-shot CLI process lives outside it: the active-tab
pointer is a file (`/tmp/chrome-use-active-<uid>`), and `@eN` refs live in the page
(`window.__chromeUseRefs`), persisting across invocations and resetting on navigation. Page
sessions are attached lazily (only the touched tab) and detached when the command finishes.

### Components (each independently testable)

| File | Responsibility | Depends on |
|------|----------------|------------|
| `lib/devtools-port.ts` | Locate & parse `DevToolsActivePort` per-OS; build `ws://` endpoint | — |
| `lib/cdp.ts` | Zero-dep CDP client over global `WebSocket` (used by the proxy): id matching, target/session attach | `WebSocket` |
| `lib/proxy-client.ts` | `CdpClient` that forwards raw CDP frames over the Unix socket to the proxy (used by the CLI) | `lib/types.ts` |
| `lib/types.ts` | Shared types: `Command`, `CommandResult`, `BrowserState`, `Ctx`, CDP shapes | — |
| `lib/session.ts` | Client-side `BrowserState`: lazy attach, file-backed active-tab pointer, tab list | `cdp client`, fs |
| `lib/selectors.ts` | Resolve `@e1` (page-side `window.__chromeUseRefs`), CSS, `text=…` → objectId | `cdp client` |
| `lib/snapshot.ts` | Injected DOM walk → indented ref tree; installs `window.__chromeUseRefs` in the page | `cdp client` |
| `lib/input.ts` | Trusted input helpers: box → `Input.dispatchMouseEvent`; `insertText` + `dispatchKeyEvent` (+ editor commands) | `cdp client` |
| `proxy.ts` | Transparent relay: holds the single approved CDP connection (one dialog), forwards raw frames, auto-daemonizes (double-fork) | `cdp.ts`, `devtools-port.ts` |
| `cli.ts` | argv → dispatch command handler **in-process**; auto-starts proxy; opens `proxy-client`; prints result | `lib/*`, `commands/*` |
| `commands/*.ts` | One handler per command group, run client-side; build raw CDP payloads | `lib/*` |
| `chrome-use` | Shell shim: `exec node "$DIR/scripts/cli.ts" "$@"` | — |

### Selector resolution

Supported selector forms (resolved by `lib/selectors.ts`):
- `@e1`, `@e2` — element refs from the most recent `snapshot` on the active tab.
- CSS — `#id`, `.class`, `div > button`, etc. (`document.querySelector`).
- `text=Submit` — first element whose trimmed text matches.

Refs are stored daemon-side per tab as `backendNodeId`s. A navigation on that tab clears the
registry; acting on a stale `@eN` returns a clear "page changed — re-run snapshot" error
(same contract as agent-browser).

### Trusted input

Interaction commands use the CDP `Input` domain rather than synthetic `dispatchEvent`, so
they produce trusted events that pass on sites that reject scripted clicks:
- click/hover: resolve element → `DOM.getBoxModel` → `Input.dispatchMouseEvent` at center.
- type/fill: focus element → `Input.insertText` (fast) or `Input.dispatchKeyEvent` per key
  for `type`; `fill` clears first via select-all + delete.
- `press <key>`: `Input.dispatchKeyEvent` with modifier parsing (`Control+a`, `Enter`…).

## Command set (v1 — Core automation loop)

| Command | Syntax | Notes |
|---------|--------|-------|
| open / goto / navigate | `open [url]` | aliases; `open` with no url → about:blank |
| back / forward / reload | `back` etc. | history nav |
| close | `close` | close active tab |
| snapshot | `snapshot [-i] [--json] [-s <css>]` | `-i` interactive-only; assigns `@eN`; `-s` scopes |
| click | `click <@ref\|sel> [--new-tab]` | trusted mouse event |
| fill | `fill <@ref\|sel> <text>` | clear + insert |
| type | `type <@ref\|sel> <text>` | per-key events |
| press | `press <key>` | e.g. `Enter`, `Control+a` |
| focus / hover | `focus\|hover <@ref\|sel>` | |
| get | `get text\|html\|value\|attr\|url\|title [<sel>] [<attr>]` | url/title take no sel |
| screenshot | `screenshot [path] [--full]` | png; saves to temp if no path |
| eval | `eval <js>` | `Runtime.evaluate`; returns JSON result |
| scroll | `scroll <up\|down\|left\|right> [px]` | |
| wait | `wait <sel\|ms> [--text <s>] [--url <pattern>]` | element/duration/text/url |
| tab | `tab` / `tab new [url]` / `tab <id>` / `tab close [id]` | list/create/switch/close |
| cookies | `cookies` / `cookies set <name> <val>` / `cookies clear` | active tab's URL scope |
| status | `status` | daemon + browser health, page count |

Output is human/AI-readable text by default; `--json` opts into structured JSON where useful.

## Error handling

- Daemon not reachable → `cli.ts` auto-starts it (double-fork) and retries, then surfaces the
  `chrome://inspect/#remote-debugging` hint if it still fails (mirrors `my-browser`).
- `DevToolsActivePort` missing → clear "Chrome not running / autoConnect not enabled" message.
- Stale `@eN` after navigation → "page changed — re-run `snapshot`".
- Unknown command/flag → usage line for that command.

## Testing

- **Unit (no browser):** `devtools-port` parsing across OS layouts; argv parser; selector
  classification (`@e`/CSS/`text=`); snapshot tree formatting (pure function over a mock AX
  payload).
- **Integration:** against headless Chrome launched with `--remote-debugging-port` in CI
  (deterministic), exercising open → snapshot → click → fill → get → screenshot.
- **Manual smoke:** the real-profile autoConnect path (one dialog, then a full loop).

## Directory layout

```
skills/chrome-use/
  SKILL.md
  chrome-use                 # shell shim
  scripts/
    cli.ts
    daemon.ts
    lib/{devtools-port,cdp,types,session,selectors,snapshot,input}.ts
    commands/{navigation,interaction,inspection,snapshot,tabs,cookies}.ts
    test/*.test.ts
```
