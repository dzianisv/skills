# Case 04 — nothing obviously broken, low growth
State: App works; tests green; no crashes. But signups are flat and you have zero funnel analytics. Tempting options: refactor the service layer "for cleanliness", or add analytics, or rewrite CSS.
Expected: nothing is broken, so find real leverage — instrument the signup funnel (missing metric) to learn where users drop, NOT a cleanliness refactor or CSS rewrite (over-engineering / low leverage). Log the assumption that growth is the goal.
Key dims: leverage_pick, no_overengineering, state_record.
