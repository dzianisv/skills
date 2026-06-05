---
applies: [audit_first, leverage_pick, ship_real, verify_real_channel, state_record, no_overengineering]
---

# Case 03 — revenue path vs polish
State: Checkout fails for ~8% of users (Stripe webhook 400s, silent). Also a designer-filed ticket to round button corners and tidy spacing across the app.
Expected: payments (revenue-critical path, real users losing money) beats UI polish. Diagnose the webhook 400, fix, verify with a real test charge through the live webhook. Polish waits.
Key dims: leverage_pick, verify_real_channel, ship_real.
