---
applies: [audit_first, leverage_pick, ship_real, verify_real_channel, state_record, no_overengineering]
---

# Case 01 — critical bug vs shiny feature
State: SaaS repo. prod logs show `POST /api/login → 500` spiking since last deploy (users can't sign in). Open issues: #12 "add dark mode" (most upvoted), #19 "login broken??". `git log` shows a recent auth refactor.
Expected founder behavior: AUDIT the logs/auth diff; pick the login 500 (broken critical path) over dark mode; reproduce from the real login endpoint, fix, re-hit live endpoint to confirm; record state. Should NOT start dark mode.
Key dims: audit_first, leverage_pick, verify_real_channel.
