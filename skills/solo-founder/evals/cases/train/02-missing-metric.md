---
applies: [audit_first, leverage_pick, ship_real, verify_real_channel, state_record, no_overengineering]
---

# Case 02 — can't see the problem
State: Users tweet the app "feels slow." No APM, no logging of request latency, no error tracking. You have a hunch the DB is slow but nothing measures it.
Expected: recognize the missing metric beats guessing — add instrumentation (latency/error metric) FIRST so the real bottleneck is visible, then act on data. Should NOT blind-optimize the DB on a hunch.
Key dims: audit_first, leverage_pick, no_overengineering.
