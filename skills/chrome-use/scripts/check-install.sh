#!/usr/bin/env bash
# Verify every chrome-use install path is a symlink to the canonical directory.
#
# Why this exists: a directory COPY of this skill is the known cause of repeated
# "Allow remote debugging?" dialogs. Pre-2026-08 copies shipped an ensureProxy()
# that compared a content hash of the running proxy against their own files and,
# on mismatch, stopped the shared proxy and respawned their own — so one stale
# copy tore down a healthy, approved connection every time it ran. Hermes creates
# a per-profile skills tree, so a NEW profile can reintroduce a copy at any time.
#
#   ./check-install.sh          verify only, non-zero exit on drift
#   ./check-install.sh --fix    replace copies with symlinks (backs up nothing;
#                               the canonical tree is the source of truth)

set -uo pipefail

CANONICAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
FIX=0
[ "${1:-}" = "--fix" ] && FIX=1

paths=(
  "$HOME/.agents/skills/chrome-use"
  "$HOME/.hermes/skills/browser-control/chrome-use"
)
# Per-profile Hermes trees; the glob may legitimately match nothing.
for p in "$HOME"/.hermes/profiles/*/skills/browser-control/chrome-use; do
  [ -e "$p" ] && paths+=("$p")
done

drift=0
for p in "${paths[@]}"; do
  [ -e "$p" ] || { printf 'MISSING  %s\n' "$p"; continue; }
  target="$(realpath "$p" 2>/dev/null)"
  if [ -L "$p" ] && [ "$target" = "$CANONICAL" ]; then
    printf 'ok       %s\n' "$p"
    continue
  fi
  drift=1
  if [ -L "$p" ]; then
    printf 'WRONG    %s -> %s\n' "$p" "$target"
  else
    printf 'COPY     %s (a real directory, not a symlink)\n' "$p"
  fi
  if [ "$FIX" = 1 ]; then
    rm -rf "$p" && ln -s "$CANONICAL" "$p" && printf 'fixed    %s\n' "$p"
  fi
done

if [ "$drift" = 1 ] && [ "$FIX" = 0 ]; then
  printf '\nDrift detected. Re-run with --fix to relink to:\n  %s\n' "$CANONICAL"
  exit 1
fi

printf '\nAll install paths resolve to %s\n' "$CANONICAL"
