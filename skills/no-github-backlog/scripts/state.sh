#!/usr/bin/env bash
# State helpers for no-github-backlog. Sourced by orchestrator.
# State dir: .agents/no-github-backlog/state/<issue>.json
# Each file = full per-issue record. Append-only nightly.csv is the log; state files are resumable cursors.

set -euo pipefail

STATE_ROOT="${STATE_ROOT:-.agents/no-github-backlog}"
STATE_DIR="$STATE_ROOT/state"
CSV="$STATE_ROOT/nightly.csv"
LOCK_DIR="$STATE_ROOT/locks"

mkdir -p "$STATE_DIR" "$LOCK_DIR"
[ -f "$CSV" ] || printf 'date,issue,stage,decision,reasoning\n' > "$CSV"

# csv_append <issue> <stage> <decision> <reasoning>
csv_append() {
  local iso; iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local issue="$1" stage="$2" decision="$3" reason="${4:-}"
  reason="${reason//\"/\"\"}"
  printf '%s,%s,%s,%s,"%s"\n' "$iso" "$issue" "$stage" "$decision" "$reason" >> "$CSV"
}

# state_get <issue>  → echo current stage, or 'new'
state_get() {
  local f="$STATE_DIR/$1.json"
  [ -f "$f" ] || { echo new; return; }
  jq -r '.current_stage // "new"' "$f"
}

# state_set <issue> <stage> <json_payload>
state_set() {
  local issue="$1" stage="$2" payload="${3:-{}}"
  local f="$STATE_DIR/$issue.json"
  local now; now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local prev='{}'
  [ -f "$f" ] && prev="$(cat "$f")"
  jq -n --argjson prev "$prev" --arg stage "$stage" --arg now "$now" --argjson payload "$payload" \
    '$prev + {current_stage:$stage, updated_at:$now} + $payload' > "$f.tmp"
  mv "$f.tmp" "$f"
}

# lock_acquire <issue>  → exit 0 if got it, 1 if locked
lock_acquire() {
  local f="$LOCK_DIR/$1.lock"
  ( set -C; echo $$ > "$f" ) 2>/dev/null
}

# lock_release <issue>
lock_release() { rm -f "$LOCK_DIR/$1.lock"; }

# pending_issues  → list issues not in terminal state (merged/closed/quarantined)
pending_issues() {
  find "$STATE_DIR" -name '*.json' -print0 2>/dev/null \
    | xargs -0 -I{} jq -r 'select(.current_stage != "merged" and .current_stage != "closed" and .current_stage != "quarantined") | .issue' {} 2>/dev/null
}

# stage_attempt_count <issue> <stage>  → integer
stage_attempt_count() {
  local f="$STATE_DIR/$1.json"
  [ -f "$f" ] || { echo 0; return; }
  jq -r --arg s "$2" '.attempts[$s] // 0' "$f"
}

# stage_attempt_inc <issue> <stage>
stage_attempt_inc() {
  local f="$STATE_DIR/$1.json"
  [ -f "$f" ] || echo '{}' > "$f"
  jq --arg s "$2" '.attempts[$s] = ((.attempts[$s] // 0) + 1)' "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

case "${1:-}" in
  init)        ;;
  csv)         shift; csv_append "$@" ;;
  get)         shift; state_get "$@" ;;
  set)         shift; state_set "$@" ;;
  lock)        shift; lock_acquire "$@" ;;
  unlock)      shift; lock_release "$@" ;;
  pending)     pending_issues ;;
  attempts)    shift; stage_attempt_count "$@" ;;
  inc)         shift; stage_attempt_inc "$@" ;;
  *)           echo "usage: state.sh {init|csv|get|set|lock|unlock|pending|attempts|inc} ..." >&2; exit 2 ;;
esac
