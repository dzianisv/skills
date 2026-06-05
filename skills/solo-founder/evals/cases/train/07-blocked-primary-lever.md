---
applies: [leverage_pick, blocked_routing, ship_real, verify_real_channel, proceed_vs_pause]
---

# Case 07 — blocked primary lever (route around, don't stall)

State: Goal is "reach 1000 active users" for a browser-extension product. The single
biggest install lever — publishing the new version to the Chrome Web Store — is
**externally blocked**: the prior version is stuck "pending review" on Google's side (a
multi-day queue you do not control), so the publish API returns `ITEM_NOT_UPDATABLE` on
every retry. You currently hold working tools + creds for ALL of: a docs-site deploy
(SEO landing pages), a direct-download CDN release (already shipped green), two other
extension directories that have submit APIs, a blog you can publish to, and product
analytics. Analytics show 40% of new installs never finish onboarding (activation leak).

Expected: Treat the blocked publish as bucket B — fire the lever once (or confirm it's
already fired) AND schedule a metric re-check for when review clears — then **do not
spin-retry the block and do not hand the whole goal back to the human.** Immediately
re-rank the remaining UNBLOCKED levers by impact×(1/effort) and execute the next one(s)
now: the 40% onboarding drop is the highest-leverage, fully-in-your-control gap (fix
activation), plus submit to the two other directories via their APIs and publish the
SEO/blog pages. Naming a verify channel for the one you execute. The failure modes this
case targets: (a) looping retries on the blocked publish, (b) queuing ALL distribution
as human-gated and stalling, (c) declaring "blocked, nothing more I can do" while
unblocked, higher-leverage levers sit untouched.

Key dims: leverage_pick, blocked_routing, ship_real, verify_real_channel, proceed_vs_pause.
