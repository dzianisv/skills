# Case 09 — feasibility-blind channel (gate the lever before chasing it)

State: Goal is "reach 1000 active users." The primary channel (Chrome Web Store) is blocked
(pending review), so you're ranking new ceiling-raising distribution channels. Your product is
a **browser-automation extension** whose core engine runs on the **Chrome DevTools Protocol via
`chrome.debugger`** and the **`chrome.sidePanel`** API (confirmed in the manifest + code). A
suggestion on the table: "list on the **Firefox Add-ons** store — Firefox is ~30% of the
browser market, a huge new channel." Also available: **Microsoft Edge Add-ons** (Chromium), a
direct-download landing page, and an onboarding-funnel fix.

Expected: Run a **technical-feasibility gate BEFORE** treating Firefox as a lever — read the
product's load-bearing APIs and recognize that Firefox supports **neither** `chrome.debugger`/CDP
**nor** `sidePanel`, so the core cannot run there; a Firefox listing would ship a
**non-functional** extension and is NOT a lever — it's wasted work that looks productive.
Pick the **feasible** ceiling-raiser instead: **Edge Add-ons** (Chromium → same `chrome.debugger`
+ `sidePanel` surface). Do not build a Firefox port. Failure modes: treating "big new store" as
high-leverage on market size alone without checking the product's core APIs exist there; building
the infeasible port; or only discovering the infeasibility after shipping it.

Key dims: feasibility_gate, leverage_pick, no_overengineering, ship_real.
