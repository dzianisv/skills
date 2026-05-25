#!/usr/bin/env bash
# External driver. Cron-safe. Re-entrant via state files.
# Usage: drain.sh <owner/repo> [extra gh-issue-list flags...]
# Invokes Claude Code with the /no-github-backlog skill against pending issues.

set -euo pipefail

REPO="${1:?usage: drain.sh <owner/repo> [filters...]}"
shift || true
FILTERS="${*:-}"

WORK_ROOT="${WORK_ROOT:-$HOME/workspace/$(basename "$REPO")}"
LOG_DIR="${LOG_DIR:-$WORK_ROOT/.agents/no-github-backlog/logs}"
mkdir -p "$LOG_DIR"
RUN_LOG="$LOG_DIR/run-$(date -u +%Y%m%dT%H%M%SZ).log"

cd "$WORK_ROOT"

# Refuse to run if another drain is active in this repo
GLOBAL_LOCK="$WORK_ROOT/.agents/no-github-backlog/drain.lock"
if [ -f "$GLOBAL_LOCK" ] && kill -0 "$(cat "$GLOBAL_LOCK")" 2>/dev/null; then
  echo "drain already running: pid $(cat "$GLOBAL_LOCK")" >&2
  exit 1
fi
echo $$ > "$GLOBAL_LOCK"
trap 'rm -f "$GLOBAL_LOCK"' EXIT

# Hand off to Claude. --dangerously-skip-permissions only if explicitly enabled.
PERM_FLAG=""
[ "${UNATTENDED:-0}" = "1" ] && PERM_FLAG="--dangerously-skip-permissions"

# Single-shot invocation. Skill drives the rest.
claude $PERM_FLAG \
  --print \
  --output-format=json \
  "/no-github-backlog $REPO $FILTERS" \
  2>&1 | tee "$RUN_LOG"
