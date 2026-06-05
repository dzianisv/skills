#!/usr/bin/env bash
# PreToolUse hook: when the solo-founder skill is invoked, record the session so its
# work can be evaluated later. Keyed by the real session id (which hooks receive).
# Must never block the tool call — always exit 0, fast.
set -uo pipefail
input="$(cat 2>/dev/null)"; [ -z "$input" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"
[ "$tool" = "Skill" ] || exit 0
skill="$(printf '%s' "$input" | jq -r '.tool_input.skill // .tool_input.name // empty' 2>/dev/null)"
case "$skill" in solo-founder|solo-founder:*|*:solo-founder) : ;; *) exit 0 ;; esac

sid="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$sid" ] || exit 0
tp="$(printf '%s' "$input"  | jq -r '.transcript_path // empty' 2>/dev/null)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
[ -n "$cwd" ] || cwd="$PWD"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
repo="$(git -C "$cwd" config --get remote.origin.url 2>/dev/null || true)"
branch="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
goal=""
for g in "$cwd/goal.md" "$cwd/.autopilot/goal.md"; do
  [ -f "$g" ] && { goal="$(head -c 600 "$g" | tr '\n' ' ')"; break; }
done

dir="$HOME/.local/run/solo-founder"; mkdir -p "$dir"
f="$dir/$sid.json"
first="$now"
[ -f "$f" ] && first="$(jq -r '.first_seen // empty' "$f" 2>/dev/null)"; [ -z "$first" ] && first="$now"

tmp="$(mktemp)"
jq -n --arg sid "$sid" --arg tp "$tp" --arg cwd "$cwd" --arg repo "$repo" \
      --arg branch "$branch" --arg goal "$goal" --arg skill "$skill" \
      --arg first "$first" --arg now "$now" \
  '{session_id:$sid, transcript_path:$tp, cwd:$cwd, repo:$repo, branch:$branch,
    goal:$goal, skill:$skill, first_seen:$first, last_seen:$now}' > "$tmp" 2>/dev/null \
  && mv "$tmp" "$f" || rm -f "$tmp"
exit 0
