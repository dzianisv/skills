---
name: chrome-devtools-remote
description: Drive a remote chrome-devtools-mcp server (typically on a tailnet) over HTTPS using the chrome-devtools CLI. Use this when the user wants to navigate, screenshot, inspect, or evaluate JavaScript on a browser running on another host (e.g. a Tailscale-connected Mac mini or a CI runner) — and you don't have a local Chrome to control. Examples of triggers ("open <url> on the lab mac", "take a screenshot of the browser on host X", "evaluate this on the remote browser").
---

# chrome-devtools-remote

Drive `chrome-devtools` CLI in **remote** mode against a `chrome-devtools-mcp` server on another host. Remote owns the browser; you drive it.

## Architecture (read first)

**CLIENT ONLY.** The daemon + Chrome run on a REMOTE host (typically user's Mac on tailnet). Boundaries:

- Don't restart the daemon
- Don't launch, kill, or attach to the Chrome process
- Don't change daemon flags or `--browserUrl`

**Exception — SSH access:** remote host = `ssh engineer@macbook13-pro.tail3ce7a.ts.net`. Daemon/Chrome wedged → SSH in to restart. Confirm SSH-based restart with user before invasive actions (killing processes, rebooting). Pure daemon restart → proceed + report.

Daemon owns Chrome's lifecycle end-to-end. **No external CDP endpoint** to point at. Do NOT invent `--remote-debugging-port=9222`, `--browserUrl http://localhost:9222`, or any generic CDP launch flag — none apply. Only knob: `--remote=<url>` URL of the daemon.

Daemon or Chrome wedged (60s timeout on every tool call, `Network.enable timed out`, `tools/list` works but tool calls don't): **STOP.** Report to user. Ask them to restart on the remote host. No CDP improvisation.

## When to use

Trigger on:

- Remote-machine reference ("on the lab mac", "on host X", "on my tailnet box") + a browser action
- `chrome-devtools-mcp` HTTPS URL (ending `/mcp`) + interactive browser action
- Env vars `CHROME_DEVTOOLS_MCP_REMOTE_URL` or `CHROME_DEVTOOLS_MCP_REMOTE_INSECURE` mentioned

User wants **local** browser → use plain `chrome-devtools` CLI (no `--remote`) or `mcp__chrome-devtools__*` tools instead.

## Install (local, once)

`chrome-devtools` client ships with the server npm package. `--remote` flag only in the GitHub fork (npm v0.26.7 dropped it). Build from fork:

```bash
git clone https://github.com/dzianisv/chrome-devtools-mcp.git /tmp/cdm
cd /tmp/cdm && npm install --ignore-scripts
node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/prepare.ts
npm run build
mkdir -p ~/.local/bin
ln -sf /tmp/cdm/build/src/bin/chrome-devtools.js ~/.local/bin/chrome-devtools
chmod +x /tmp/cdm/build/src/bin/chrome-devtools.js
chrome-devtools --version   # should print 0.26.6
```

`prepare.ts` strips a TS2717 collision between `chrome-devtools-frontend` and `@paulirish/trace_engine` that breaks `npm run build`.

Nothing installed on remote — that host serves `https://.../mcp` out-of-band.

Troubleshoot:

- `command not found: chrome-devtools` — npm global bin not on `PATH`. Add `$(npm config get prefix)/bin`, or on macOS Homebrew `eval "$(brew shellenv)"`.
- `Cannot find package 'pkce-challenge'` first run — known bundling gap (dzianisv/chrome-devtools-mcp#17). Fix: `cd "$(npm root -g)/@vibebrowser/chrome-devtools-mcp" && npm install pkce-challenge --no-save`.

## Connect

Configure endpoint **once per shell**, verify connectivity first.

```bash
export CHROME_DEVTOOLS_MCP_REMOTE_URL="https://macbook13-pro.tail3ce7a.ts.net/mcp"
chrome-devtools status --remote="$CHROME_DEVTOOLS_MCP_REMOTE_URL"
```

Default endpoint: `--remote=https://macbook13-pro.tail3ce7a.ts.net/mcp` (Mac mini on tailnet).

Healthy → `status=ok http=200` + JSON body. Anything else = hard stop. Surface to user, don't retry.

URL unset → ask user once. Shape: `https://<host>/mcp` (bare host returns 404).

Connection flags:

| Situation                                                               | What to pass                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Self-signed cert (common on tailnets without Tailscale-issued certs)    | `--insecure` on every call, or `export CHROME_DEVTOOLS_MCP_REMOTE_INSECURE=1`                       |
| Bearer-token gateway                                                    | `--header "Authorization: Bearer $TOKEN"` — repeatable, **not** cached, must be on every invocation |
| Custom static header (e.g. `X-Tenant: foo`)                             | `--header "X-Tenant: foo"`                                                                          |
| Endpoint behind Tailscale and `status` returns `Failed to reach remote` | `tailscale status` locally; the box is offline or the URL has the wrong hostname                    |

`status` green → every `chrome-devtools <tool> ... --remote "$URL"` reuses the same server-side tab via sticky session id at `~/.cache/chrome-devtools-mcp/remote/<hash>.session`.

## Session model — read before chaining

Sticky session id at `~/.cache/chrome-devtools-mcp/remote/<hash>.session`:

- `navigate_page` → `take_snapshot` → `click` → `take_screenshot` hit the **same** server-side tab. Chain as separate calls, assume continuity.
- Server restart between calls → next call re-inits a fresh session. **Tab state lost** — re-navigate.
- End session explicitly + free browser context: `chrome-devtools stop --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"`.

## Common ops

All commands accept `--output-format json` (pipe to `jq`).

```bash
# Open a page
chrome-devtools navigate_page "https://example.com" --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"

# Get a structured a11y snapshot (use for finding clickable uids)
chrome-devtools take_snapshot --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL" --output-format json

# Click an element by uid from the snapshot
chrome-devtools click "$UID" --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"

# Fill an input
chrome-devtools fill "$UID" "value" --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"

# Take a screenshot (saved to /tmp/<uuid>.png locally)
chrome-devtools take_screenshot --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"

# Evaluate JS in the page — return value must be JSON-serializable
chrome-devtools evaluate_script '() => document.title' --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"

# Read console messages from the page
chrome-devtools list_console_messages --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"

# List network requests since page load
chrome-devtools list_network_requests --remote "$CHROME_DEVTOOLS_MCP_REMOTE_URL"
```

## Recipes

### Smoke-check a deployed web app

```bash
URL="$CHROME_DEVTOOLS_MCP_REMOTE_URL"
chrome-devtools navigate_page "https://app.example.com" --remote "$URL"
chrome-devtools evaluate_script '() => ({title: document.title, ready: document.readyState})' --remote "$URL"
chrome-devtools list_console_messages --remote "$URL" --output-format json
chrome-devtools take_screenshot --remote "$URL"
```

`console_messages` with `level: "error"` → surface them (usual root cause of "page looks broken").

### Drive a login form

```bash
chrome-devtools navigate_page "https://app.example.com/login" --remote "$URL"
chrome-devtools take_snapshot --remote "$URL" --output-format json > /tmp/snap.json
# Find the uid of the email input + password input + submit button from /tmp/snap.json
chrome-devtools fill "<email-uid>" "$LOGIN_EMAIL" --remote "$URL"
chrome-devtools fill "<password-uid>" "$LOGIN_PASSWORD" --remote "$URL"
chrome-devtools click "<submit-uid>" --remote "$URL"
```

### Capture a CrUX-style trace

```bash
chrome-devtools performance_start_trace --remote "$URL"
chrome-devtools navigate_page "https://app.example.com" --remote "$URL"
chrome-devtools performance_stop_trace --remote "$URL" --output-format json
```

## Output discipline

- Always print navigated URL so user knows which tab.
- Screenshots: print saved file path (`Saved to /tmp/<uuid>.png.`) — CLI prints it on stdout.
- `evaluate_script`: prefer `--output-format json`, forward only relevant field, not full structuredContent envelope.
- "What's on the page" → `take_snapshot` over `take_screenshot` (text, cheaper).

## Failure modes

| Symptom                                                                           | Cause                                                                                                          | Fix                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Failed to reach remote`                                                          | DNS, Tailscale offline, or wrong URL                                                                           | `tailscale status` on the local box; verify `--remote` URL                              |
| `Streamable HTTP error: ... 404 Session not found`                                | Server restarted; sticky id was stale. Retried once internally — if you see this it means the retry also 404'd | `chrome-devtools stop --remote $URL` to wipe the sticky pointer, then retry the command |
| TLS verify error (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `SELF_SIGNED_CERT_IN_CHAIN`) | Server uses a self-signed cert (no Tailscale-issued cert)                                                      | Add `--insecure` or `export CHROME_DEVTOOLS_MCP_REMOTE_INSECURE=1`                      |
| `Bad Request: Mcp-Session-Id header is required`                                  | Local cache directory was wiped mid-session                                                                    | First call after the wipe will mint a fresh session; just retry                         |
| Hangs on first call after a long idle                                             | Server idle reaper closed the session                                                                          | Same fix as the 404 row — `stop` then retry                                             |
| All tool calls hang at 60s with `Network.enable timed out` / `MCP error -32001`, but `status` and `tools/list` return instantly | Daemon HTTP layer healthy, but Chrome it manages is wedged on the remote host | **You cannot fix this from the client side.** Ask the user to restart the daemon on the remote host. Do NOT invent `--browserUrl` or `--remote-debugging-port` flags — they don't apply to this architecture. |

## Don't

- Loop `navigate_page` to "wait for page load" — use `wait_for` with a text selector.
- `take_screenshot` per step — user wants one final, not five intermediate.
- `--insecure` on a hosted endpoint with a real cert. Silently disables TLS for the whole CLI process.
- `start` a server with `--remote` — that subcommand only manages local daemons.
