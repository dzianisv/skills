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

Persistent daemon model (chosen over stateless approaches because autoConnect fires Chrome's
permission dialog on **every new debugger client** — a daemon makes it fire **once per
daemon lifetime**, which `my-browser` already proved is the only livable option).

```
Chrome (real profile) ──WS/CDP──▶ chrome-use-daemon (Unix socket; holds CDP conn + session state)
                                       ▲
                              chrome-use (cli.ts; one-shot; auto-starts daemon; parses argv)
```

### Components (each independently testable)

| File | Responsibility | Depends on |
|------|----------------|------------|
| `lib/devtools-port.ts` | Locate & parse `DevToolsActivePort` per-OS; build `ws://` endpoint | — |
| `lib/cdp.ts` | Zero-dep CDP client over global `WebSocket`: request/response id matching, event subscription, target/session attach | `WebSocket` |
| `lib/types.ts` | Shared types: `Command`, `CommandResult`, `Session`, CDP shapes | — |
| `lib/session.ts` | Per-tab session: active target, CDP session id, snapshot ref registry (`@eN` → backendNodeId) | `cdp.ts` |
| `lib/selectors.ts` | Resolve `@e1` (registry), CSS (`#id`/`.cls`/…), `text=…` → backendNodeId/objectId | `session.ts`, `cdp.ts` |
| `lib/snapshot.ts` | Injected DOM/AX walk → indented ref tree; registers `@eN` → element | `cdp.ts`, `session.ts` |
| `lib/input.ts` | Trusted input helpers: box → `Input.dispatchMouseEvent`; `Input.insertText` + `Input.dispatchKeyEvent` | `cdp.ts` |
| `daemon.ts` | Owns single CDP connection (one dialog), tracks active tab + registries, dispatches commands, auto-daemonizes (double-fork) | all `lib/*` |
| `cli.ts` | argv → `Command` → Unix socket → print result; auto-starts daemon (`ensureDaemon`) | `lib/types.ts` |
| `commands/*.ts` | One handler per command group, registered into a dispatch map | `lib/*` |
| `chrome-use` | Shell shim: `exec node "$DIR/cli.ts" "$@"` | — |

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
