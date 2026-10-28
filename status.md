ROADMAP  ████████████████████  5/5 done
 [x] 1. Trace all Chrome CDP reconnect triggers
 [x] 2. Identify dropped-socket retry path
 [x] 3. Block automatic reconnect after failures
 [x] 4. Add keepalive and lifecycle regression tests
 [x] 5. Stage Chrome-use fix and push commit

WHY SLOW
 - Fail-closed proxy needed a clear human-only reset path; suite passes and commit pushed.

NEXT
 - Monitor real Chrome behavior on next use.
