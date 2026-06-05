#!/usr/bin/env bash
# Claude Max auth-flow helper.
# Called by the Claw agent (claude-max skill) to handle the three-phase
# interactive setup: start auth → submit code → enable proxy + switch model.
#
# Usage:
#   auth-flow.sh start              — generate OAuth URL (print it; keep process alive)
#   auth-flow.sh submit <CODE>      — complete auth with code from browser
#   auth-flow.sh enable [MODEL]     — start service + update model config (default: claude-opus-4)
#   auth-flow.sh status             — check auth + service state
set -uo pipefail

PIPE=/tmp/claude-max-auth-pipe
LOG=/tmp/claude-max-auth.log
HOLDER_PID_FILE=/tmp/claude-max-auth-holder.pid

die() { echo "ERROR: $*" >&2; exit 1; }

cmd="${1:-status}"
shift || true

case "$cmd" in

# ── start ─────────────────────────────────────────────────────────────────────
start)
  # Clean up any previous attempt
  pkill -f 'claude auth login' 2>/dev/null || true
  [ -f "$HOLDER_PID_FILE" ] && kill "$(cat "$HOLDER_PID_FILE")" 2>/dev/null || true
  rm -f "$PIPE" "$LOG" "$HOLDER_PID_FILE"

  mkfifo "$PIPE"

  # Hold the write end open so claude auth login can start reading
  tail -f /dev/null > "$PIPE" &
  echo $! > "$HOLDER_PID_FILE"

  # Start auth with FIFO as stdin; redirect output to log
  HOME=/home/node claude auth login < "$PIPE" > "$LOG" 2>&1 &

  # Poll for the URL (up to 15 s)
  for i in $(seq 1 30); do
    URL=$(grep -oP 'https://claude\.com/cai/oauth/authorize\S+' "$LOG" 2>/dev/null || true)
    [ -n "$URL" ] && break
    sleep 0.5
  done

  [ -n "$URL" ] || die "Timed out waiting for auth URL. Check $LOG"
  echo "$URL"
  ;;

# ── submit ─────────────────────────────────────────────────────────────────────
submit)
  CODE="${1:-}"
  [ -n "$CODE" ] || die "Usage: auth-flow.sh submit <CODE>"
  [ -p "$PIPE" ] || die "No active auth session. Run 'auth-flow.sh start' first."

  # Write code to the waiting process
  echo "$CODE" > "$PIPE"
  sleep 3

  # Verify success
  STATUS=$(HOME=/home/node claude auth status 2>/dev/null)
  LOGGED_IN=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('loggedIn','false'))" 2>/dev/null || echo "false")

  if [ "$LOGGED_IN" = "True" ] || [ "$LOGGED_IN" = "true" ]; then
    EMAIL=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('email','?'))" 2>/dev/null || echo "?")
    SUB=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('subscriptionType','?'))" 2>/dev/null || echo "?")
    echo "OK logged_in=true email=$EMAIL subscription=$SUB"
    # Clean up FIFO holder
    [ -f "$HOLDER_PID_FILE" ] && kill "$(cat "$HOLDER_PID_FILE")" 2>/dev/null || true
    rm -f "$PIPE" "$HOLDER_PID_FILE"
  else
    echo "FAIL: auth did not succeed. Check $LOG"
    exit 1
  fi
  ;;

# ── enable ─────────────────────────────────────────────────────────────────────
enable)
  MODEL="${1:-claude-opus-4}"

  # Verify auth
  LOGGED_IN=$(HOME=/home/node claude auth status 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('loggedIn','false'))" 2>/dev/null || echo "false")
  [ "$LOGGED_IN" = "True" ] || [ "$LOGGED_IN" = "true" ] || die "Not authenticated. Run start+submit first."

  # Start the proxy service
  sudo systemctl start claude-max-api
  sleep 3

  # Verify proxy health
  HEALTH=$(curl -sf http://localhost:3456/health 2>/dev/null || echo "")
  echo "$HEALTH" | grep -q '"status":"ok"' || die "Proxy started but /health check failed: $HEALTH"
  echo "[enable] Proxy healthy."

  # Update model config via openclaw CLI (validated + atomic)
  OPENCLAW="${OPENCLAW_BIN:-openclaw}"

  # Build the batch of config changes
  BATCH=$(cat << BATCH_EOF
[
  {"path":"models.providers.openai.baseUrl","value":"http://localhost:3456/v1"},
  {"path":"models.providers.openai.apiKey","value":"not-needed"},
  {"path":"models.providers.openai.models","value":[
    {"id":"claude-opus-4","name":"Claude Opus 4 (Max)","reasoning":true,"input":["text","image"],"cost":{"input":0,"output":0},"contextWindow":200000,"maxTokens":32000},
    {"id":"claude-sonnet-4","name":"Claude Sonnet 4 (Max)","reasoning":false,"input":["text","image"],"cost":{"input":0,"output":0},"contextWindow":200000,"maxTokens":16000},
    {"id":"claude-haiku-4","name":"Claude Haiku 4 (Max)","reasoning":false,"input":["text","image"],"cost":{"input":0,"output":0},"contextWindow":200000,"maxTokens":8000}
  ]},
  {"path":"agents.defaults.model.primary","value":"openai/$MODEL"},
  {"path":"agents.defaults.model.fallbacks","value":["litellm/gpt-5.1","litellm/deepseek-v4-fast"]}
]
BATCH_EOF
)

  # Dry-run first
  echo "$BATCH" | "$OPENCLAW" config set --batch-json - --dry-run --strict-json \
    || die "Config dry-run failed — refusing to apply."

  # Apply
  echo "$BATCH" | "$OPENCLAW" config set --batch-json - --strict-json

  # Validate
  "$OPENCLAW" config validate || die "Config validation failed after write."

  # Safe restart
  RESTART_HELPER="$HOME/.openclaw/skills/openclaw-config/safe-restart.sh"
  if [ -x "$RESTART_HELPER" ]; then
    bash "$RESTART_HELPER" --reason "claude-max: enable $MODEL via subscription proxy"
  else
    sudo systemctl restart openclaw-gateway
  fi

  echo "[enable] Done. Agent model is now openai/$MODEL (Claude Max subscription)."
  ;;

# ── status ─────────────────────────────────────────────────────────────────────
status)
  echo "=== Claude Code auth ==="
  HOME=/home/node claude auth status 2>/dev/null || echo "(claude CLI not found)"

  echo ""
  echo "=== claude-max-api service ==="
  systemctl status claude-max-api --no-pager -l 2>/dev/null | head -12 || echo "(service not installed)"

  echo ""
  echo "=== Proxy health ==="
  curl -sf http://localhost:3456/health 2>/dev/null || echo "(proxy not reachable)"

  echo ""
  echo "=== Active agent model ==="
  openclaw config get agents.defaults.model.primary 2>/dev/null || echo "(openclaw CLI not found)"
  ;;

*)
  echo "Usage: auth-flow.sh {start|submit <CODE>|enable [MODEL]|status}" >&2
  exit 1
  ;;
esac
