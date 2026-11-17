---
name: whale-options-flow
description: Track whale / large options flow for a ticker — how much call and put premium was bought, at what strikes and expiries, and what price that implies. Use when asked "how do whales behave", "unusual options activity", "what are big traders buying", or to set a sell price from options flow. Daily, per ticker.
---

# Whale Options Flow

## Pull a live chain first

- Pull the live options chain for the expiry the user asked about in the same run you report it.

- Use the bid and ask mid for every premium you quote and never use a stale last price as the premium.

- Record the chain date and time, the expiry, the underlying price, and the source beside every number you report.

- Refuse to compute a distribution from a chain whose call prices break no arbitrage and say plainly that a fresh bid and ask mid chain is needed.

- One share class per ticker (Nov 18, 2026 — critic): for a ticker with two share classes, pull the liquid class's chain in both runs and name the class — Alphabet uses the GOOGL chain (Class A; the GOOG Class C chain is thin: GOOG $300 call open interest 5,153 vs GOOGL 23,027 on Nov 16). Never mix levels from two classes in one cell, one verdict, or one chance — the Nov 17 report used GOOG and the dip alert used GOOGL, so the same $300 level printed two max pains ($340 vs $300) and two chances above $300 (27.1% vs 30.3%).

- One file per run (Nov 18, 2026 — critic): the report writes its options check to options-check-<date>-report.json and the dip alert to options-check-<date>-dipalert.json. Never write the shared options-check-<date>.json name from two runs — on Nov 17 the dip alert overwrote the report's file mid-run and the report had to fall back to its -subagent file.

## Read volume as activity only

- Treat volume and open interest as a measure of activity and never as proof of direction.

- Treat a large print at one strike as many possible traders or as a spread, a hedge, or a roll and never as one buyer.

- Never call a large print a whale bet or a huge bet and never describe volume as a majority vote for a price.

- Never compute a volume weighted expected price from the chain.

## Price the implied distribution

- Compute each breakeven from the mid premium by adding the premium to a call strike and subtracting the premium from a put strike.

- Straddle breakevens are always the ATM strike plus or minus the straddle mid, never the close plus or minus the premium. The close and the ATM strike are different prices, so the two methods print different numbers for the same chain. On Nov 14, 2026 the options check switched to close based breakevens without a skill change and printed NVDA $185.95, AVGO $298.16, MRVL $187.71 and AMD $446.88, while the daily report printed the strike based $185.10, $301.15, $185.95 and $442.82 from the same Friday chains. State the ATM strike beside every straddle so the arithmetic checks: breakeven low equals ATM strike minus straddle mid, breakeven high equals ATM strike plus straddle mid.

- Build the risk neutral density from call prices across strikes using the Breeden-Litzenberger method and report the mean, the median, and the middle 50 percent range.

- Report the probability of finishing above or below the key levels the user asked about and name the expiry with every probability.

## One estimator per run, named every run (Nov 17, 2026 — critic)

- The chances above or below a level come from one estimator, named in the options check every run. The estimator does not change between runs unless this skill changes — a method change without a skill change makes the chances incomparable across runs.
- The default is the full-chain Breeden-Litzenberger density. When that density is unstable on Yahoo mids, use the local-slope estimator instead: the chance above a level is the local slope of call mids (−dC/dK, least squares over strikes within ±$10 of the level, two-sided quotes only), cross-checked by central differences. The density is unstable when its mean sits far from the underlying or its second differences pile density at absurd low strikes (Nov 16, 2026: the NVDA Dec 18 density mean was $50 against an underlying of $159; the Nov 20 mean $135–$142 against $159).
- Window widening (Nov 18, 2026 — critic): if fewer than 3 two-sided quotes fall within ±$10 of the level, widen the window to ±$20 and flag it in the method note (AMD, Nov 17, 2026: strikes $10 apart, only 2 two-sided quotes within ±$10).
- From an unstable density, do not report a mean, a median, or a middle-50 percent range — say the density is unstable and name the estimator used instead. A method change is never silent: the options check carries a method note and the report carries the comparability caveat.

- Present the spread of the distribution as uncertainty and never present the mean or the median as a forecast or a guarantee.

## Report walls and levels honestly

- Report a call wall, a put wall, and max pain only from open interest and name them as levels where positioning clusters.

- Max pain, one method (Nov 18, 2026 — critic): max pain is computed over ALL strikes from open interest — the standard definition — in both runs, and the method is named in the options check. The Nov 17 report used strikes within ±40% of the underlying while the dip alert used all strikes, so 10 of 11 chains printed different max pains (NVDA $180 vs $175, MSFT $580 vs $475, COIN $165 vs $140). If the winning strike sits more than 40% from the underlying, label it legacy-skewed and treat it as indicative only — the far-strike open interest is old positioning, not today's level.

- Open-interest data check (Nov 18, 2026 — critic): fill missing open interest with 0 before the max-pain sum. A max pain far from the underlying (below half the price) is a data error, never a level — fix the data and re-pull, never report it (Nov 17, 2026: the first pull printed NVDA Dec 18 max pain $0.50 from missing open interest).

- Read put volume below spot as hedging unless the chain gives other evidence and read call volume inside the expected range as ordinary activity.

- Give one line per stock that names the ceiling and the floor the chain implies and whether that confirms or contradicts the sell level.

- State what the chain cannot show whenever you report flow and name the missing evidence instead of filling the gap with a story.

## Available connectors

- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.

- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Alternatives for better results

- Check a prediction market and analyst targets as a separate view of consensus and keep that view apart from the options distribution.

- Ask for a fresh chain after an earnings date or another catalyst before you repeat a level from an old chain.

- Say when the chain is too thin or too stale to support a level and offer the next expiry with a fuller chain instead.
