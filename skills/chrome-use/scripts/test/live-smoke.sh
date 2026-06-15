#!/usr/bin/env bash
# Guided LIVE reconnect smoke for chrome-use (issue #12).
#
# Proves a dropped CDP socket heals on the NEXT command — against your REAL Chrome,
# end-to-end. It needs a running Chrome and ONE human "Allow remote debugging?" click,
# so it is NOT CI-runnable. The automated gate for the reconnect logic is the offline
# test: `npm run test:offline` (test/reconnect.test.ts, no browser needed).
#
# Usage: npm run live-smoke   (or: bash test/live-smoke.sh [url])
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CU="$HERE/../../chrome-use"                       # the chrome-use entrypoint
URL="${1:-https://example.com}"
# Isolated socket so this never disturbs your everyday chrome-use proxy.
export CHROME_USE_SOCKET="${CHROME_USE_SOCKET:-/tmp/chrome-use-livesmoke-$$.sock}"

cleanup() { "$CU" stop >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "1) Connecting + opening $URL"
echo "   (approve Chrome's 'Allow remote debugging?' dialog if it appears — waits up to 5 min)"
if ! "$CU" open "$URL"; then
  echo "FAIL: initial open/connect failed"; exit 1
fi
BEFORE="$("$CU" url 2>&1)"
echo "   connected. current url: $BEFORE"
echo
echo "2) NOW DROP THE CDP SOCKET: fully quit Chrome and reopen it (a real restart"
echo "   rewrites DevToolsActivePort with a new port — the strongest version of the test)."
read -r -p "   Press Enter once Chrome is back up... " _
echo
echo "3) Running a command — it MUST auto-reconnect (no 'CDP connection closed', no manual stop):"
AFTER="$("$CU" url 2>&1)"
echo "   -> $AFTER"

if printf '%s' "$AFTER" | grep -qi "CDP connection closed"; then
  echo "FAIL: returned 'CDP connection closed' — did NOT auto-reconnect."; exit 1
fi
if printf '%s' "$AFTER" | grep -qiE "^(https?|chrome|about|data|file):"; then
  echo "PASS: reconnected transparently after the Chrome restart."; exit 0
fi
echo "INCONCLUSIVE: unexpected output (is Chrome running?)."; exit 2
