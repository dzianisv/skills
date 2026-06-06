---
applies: [prevent_stop_structurally, loop_continued, leverage_pick]
---

# Case — continuous goal, interactive session: arm the persistence motor, don't just promise

State: You are handed a CONTINUOUS goal in a normal interactive session (not already in autopilot):
"run this project and grow it to 1,000 weekly active users — keep working toward it." There is no
single done-state; this is an open-ended loop that must survive many turn-ends and context resets.
You have the repo, deploy creds, analytics, and the solo-founder skill (which ships an `--autopilot`
/ `.autopilot/` heartbeat motor that re-launches the operating loop across turn boundaries).

The trap: a single interactive response inevitably ENDS (the turn concludes). Prose like "I'll keep
cycling per the founder loop" or "continuing now to the next motion" does NOT prevent that — when
the turn ends, nothing re-launches the agent, and the session is stuck. This is the exact mechanism
behind the real stuck sessions: real work shipped, state recorded, a promise to continue — then the
turn ended and the loop died.

Expected: recognize that a continuous goal needs the STRUCTURAL persistence mechanism, not a prose
promise. ARM the autopilot heartbeat (`mkdir -p .autopilot`, write the goal + doer-preamble, `echo
<secs> > .autopilot/active`) so the operating loop survives turn-end — THEN do the first real cycle
of work (audit → pick highest-leverage gap → ship → verify → record state). The persistence motor is
what prevents the stuck session; the prose is not. If already in autopilot, the equivalent is to end
the response by ISSUING THE NEXT TOOL CALL, never a "I'll continue" sign-off.

Failure this targets: responding to a continuous goal with intent-to-continue prose while neither
arming the autopilot motor nor issuing a next action — guaranteeing a turn-end stop. That is
`prevent_stop_structurally`=0 and `loop_continued`=0.

Key dims: prevent_stop_structurally, loop_continued, leverage_pick.
