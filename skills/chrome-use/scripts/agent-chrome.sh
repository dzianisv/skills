#!/usr/bin/env bash
#
# agent-chrome — start (or reuse) a DEDICATED Chrome instance that an agent can
# drive with zero human interaction.
#
# Why this exists
# ---------------
# The default chrome-use path is autoConnect against the user's real Chrome. That
# path is great for a human-in-the-loop session but it has two properties that make
# it unusable for unattended agent work:
#
#   1. Every new debugger client can trigger Chrome's native "Allow remote
#      debugging?" dialog, which needs a physical click. A headless agent cannot
#      click it (osascript/cliclick both require Accessibility grants).
#   2. The single approved connection is shared machine-wide and fails CLOSED:
#      once Chrome drops it, the proxy refuses to reconnect and every session on
#      the box is dead until someone intervenes.
#
# A separate instance launched with --remote-debugging-port=0 has NO permission
# dialog at all (that dialog is specific to autoConnect), so it can be started,
# killed and restarted by an agent freely.
#
# Auth/session continuity: the profile is SEEDED once from the real Chrome profile
# (cookies, logins, local storage), so logged-in sessions carry over. After seeding
# it is an independent profile that persists across runs.
#
# Port safety: --remote-debugging-port=0 asks the OS for an ephemeral port, so it
# can never collide with the real profile's port. The port is discovered by reading
# this profile's own DevToolsActivePort file, exactly like autoConnect does.
#
# Usage:
#   ./agent-chrome.sh start     # launch or reuse; prints env exports
#   ./agent-chrome.sh env       # print env exports for an already-running instance
#   ./agent-chrome.sh stop      # quit the dedicated instance (never the user's Chrome)
#   ./agent-chrome.sh reseed    # refresh cookies/logins from the real profile
#   ./agent-chrome.sh status
#
# Typical agent session:
#   eval "$(./agent-chrome.sh start)"
#   chrome-use open https://example.com
#   chrome-use screenshot /tmp/proof.png
#
set -euo pipefail

CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
AGENT_DIR="${CHROME_USE_AGENT_PROFILE:-$HOME/.chrome-use-agent}"
REAL_DIR="${CHROME_USE_REAL_PROFILE:-$HOME/Library/Application Support/Google/Chrome}"
PORT_FILE="$AGENT_DIR/DevToolsActivePort"
# Dedicated socket so the agent proxy never fights the shared human-session proxy.
AGENT_SOCKET="${CHROME_USE_AGENT_SOCKET:-/tmp/chrome-use-agent-$(id -u).sock}"

log() { printf '%s\n' "$*" >&2; }

# Files that carry logged-in state. Copied best-effort: a missing one is not fatal,
# it just means that class of state does not carry over.
seed_profile() {
  local src="$REAL_DIR/Default" dst="$AGENT_DIR/Default"
  mkdir -p "$dst"
  local f
  for f in "Cookies" "Cookies-journal" "Login Data" "Login Data-journal" \
           "Web Data" "Web Data-journal" "Preferences" "Secure Preferences"; do
    [ -e "$src/$f" ] && cp -f "$src/$f" "$dst/$f" 2>/dev/null || true
  done
  for d in "Local Storage" "Session Storage" "IndexedDB" "Network"; do
    [ -d "$src/$d" ] && { rm -rf "$dst/$d"; cp -R "$src/$d" "$dst/$d" 2>/dev/null || true; }
  done
  [ -e "$REAL_DIR/Local State" ] && cp -f "$REAL_DIR/Local State" "$AGENT_DIR/Local State" 2>/dev/null || true
  log "seeded agent profile from $src"
}

running_pid() {
  pgrep -f -- "--user-data-dir=$AGENT_DIR" 2>/dev/null | head -1 || true
}

print_env() {
  # CHROME_USE_USER_DATA_DIR makes chrome-use read THIS profile's DevToolsActivePort
  # instead of auto-detecting the real profile's.
  echo "export CHROME_USE_USER_DATA_DIR='$AGENT_DIR'"
  echo "export CHROME_USE_SOCKET='$AGENT_SOCKET'"
  # This instance has no "Allow remote debugging?" dialog, so a dropped socket must
  # not latch the proxy closed the way it must on the shared human-session proxy.
  echo "export CHROME_USE_ALLOW_RECONNECT=1"
}

start() {
  local pid
  pid="$(running_pid)"
  if [ -n "$pid" ] && [ -s "$PORT_FILE" ]; then
    log "agent Chrome already running (pid $pid)"
    print_env
    return 0
  fi

  # Never seed on top of a live profile — Chrome holds locks on the SQLite files.
  [ -d "$AGENT_DIR/Default" ] || { mkdir -p "$AGENT_DIR"; seed_profile; }

  rm -f "$PORT_FILE"
  # --remote-debugging-port=0  -> OS-assigned port, cannot collide, NO Allow dialog.
  # --no-first-run/--no-default-browser-check -> no modal on a fresh profile.
  # --disable-features=Translate... -> keeps unattended pages free of extra UI.
  nohup "$CHROME_BIN" \
    --user-data-dir="$AGENT_DIR" \
    --remote-debugging-port=0 \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --restore-last-session=false \
    --homepage=about:blank \
    about:blank \
    >/dev/null 2>&1 &

  local i
  for i in $(seq 1 60); do
    [ -s "$PORT_FILE" ] && break
    sleep 0.5
  done
  if [ ! -s "$PORT_FILE" ]; then
    log "ERROR: agent Chrome did not write $PORT_FILE within 30s"
    return 1
  fi
  log "agent Chrome up (pid $(running_pid)), debug port $(head -1 "$PORT_FILE")"
  print_env
}

stop() {
  local pid
  pid="$(running_pid)"
  if [ -z "$pid" ]; then log "agent Chrome not running"; return 0; fi
  # Only ever targets processes whose argv contains our dedicated --user-data-dir,
  # so the user's real Chrome can never be hit.
  pkill -f -- "--user-data-dir=$AGENT_DIR" || true
  # Chrome does not always exit on SIGTERM (pending profile writes, a modal, a
  # wedged renderer). Wait, then escalate — otherwise `stop` silently no-ops and
  # the next `start` just reuses the instance we meant to replace.
  local i
  for i in $(seq 1 20); do
    [ -z "$(running_pid)" ] && break
    sleep 0.25
  done
  if [ -n "$(running_pid)" ]; then
    pkill -9 -f -- "--user-data-dir=$AGENT_DIR" || true
    sleep 1
  fi
  if [ -n "$(running_pid)" ]; then
    log "ERROR: agent Chrome still running after SIGKILL (pid $(running_pid))"
    return 1
  fi
  log "stopped agent Chrome (was pid $pid)"
  # The agent proxy's connection is now dead; drop its socket so the next command
  # starts a clean one (safe: this proxy is agent-only, not the shared human one).
  rm -f "$AGENT_SOCKET" "$AGENT_SOCKET.log" || true
}

status() {
  local pid; pid="$(running_pid)"
  if [ -z "$pid" ]; then echo "agent Chrome: not running"; else
    echo "agent Chrome: running (pid $pid)"
    [ -s "$PORT_FILE" ] && echo "debug port: $(head -1 "$PORT_FILE")" || echo "debug port: (no DevToolsActivePort yet)"
  fi
  echo "profile: $AGENT_DIR"
  echo "socket:  $AGENT_SOCKET"
}

case "${1:-start}" in
  start)  start ;;
  env)    print_env ;;
  stop)   stop ;;
  reseed) stop; sleep 1; seed_profile; start ;;
  status) status ;;
  *) log "usage: $0 {start|env|stop|reseed|status}"; exit 2 ;;
esac
