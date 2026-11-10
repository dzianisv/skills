---
name: smart-money-lynch-watchlist
description: Build and update a daily watchlist of stocks bought by Trump, Pelosi, Berkshire Hathaway and Bridgewater, analysed Peter Lynch style, with drawdown stats and a pile diagram per investor. Use when asked to "track smart money", "what are Trump / Pelosi / Buffett buying", "Lynch watchlist", or "show me the pile diagram".
---

# Smart Money + Lynch Watchlist

Build a watchlist from the union of what four smart-money sources buy. Analyse each name Lynch-style. Show one pile diagram per investor. Update daily.

## Sources — start here, don't guess URLs

| Who | What to read | Where |
|---|---|---|
| Berkshire Hathaway | 13F, quarterly, 45 days after quarter-end. Q2 2026: $299.3B, 29 positions, filed 14 Aug 2026. | https://www.sec.gov/edgar/browse/?CIK=1067983 — also https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001067983&type=13F-HR |
| Bridgewater Associates | 13F, same lag. CIK 1350694. | https://www.sec.gov/edgar/browse/?CIK=1350694 |
| Trump | OGE Form 278-T, periodic, ~6 weeks lag, ranges not exact amounts. Q1 2026: 3,642 trades, $220–750M. | https://www.oge.gov/web/oge.nsf/Presidential+Financial+Disclosure+Reports — also https://www.quiverquant.com/trump/ |
| Pelosi (household, spouse) | House Periodic Transaction Reports (PTR), STOCK Act 30–45 days lag, ranges, options listed without premium. | https://disclosures-clerk.house.gov/FinancialDisclosure — also https://www.capitoltrades.com/politicians/P000197/ and https://www.quiverquant.com/congresstrading/ |
| Thiel Macro, Ackman, Druckenmiller, Tepper, Burry | 13F, same SEC route. Thiel CIK 1562087. | https://www.sec.gov/edgar/search/ — search by CIK / fund name, form 13F-HR |
| Autopilot app (Android/iOS) | Copy-trading trackers: Pelosi Tracker+, Buffett Tracker, Thiel Tracker, Wolff's Flagship Fund. Holdings behind paywall. | https://start.joinautopilot.com/strategies |
| Other Congress traders | Capitol Trades, Quiver, Unusual Whales. | https://www.capitoltrades.com/ — https://www.quiverquant.com/ — https://unusualwhales.com/ |

Rules: a filing is a trade, not a current holding. Amounts are ranges. Options are not copied by Autopilot. A 13F omits cash, bonds, shorts, foreign shares. Never state "owns $0" from a summary alone — say "no trade/holding found in the filings checked".

## Universe

Union, deduplicated, of the four sources' top holdings + recent buys. Keep the user's own holdings (GOOG, NVDA, ADBE, TSM) in the list for comparison. Drop a name only when all four sources have exited it.

## Lynch test — for each stock, one short block

- Two-minute story: what it sells, who pays, why it wins.
- Class: Stalwart / Fast Grower / Cyclical / Turnaround / Slow Grower.
- Earnings vs price: are earnings up while price fell (multiple compression) or is earnings breaking?
- PEG: forward P/E ÷ forward EPS growth. Use GAAP EPS first; if only non-GAAP is published, say so and name the distortion (SBC, warrant charges, amortisation).
- Bear case in one line. What would change your mind: next earnings date + trigger.

## Daily stats — one row per stock

`Ticker | Price (close, date) | 52-wk high | -$ down from high | -% down from high | $ wipe-out`

Wipe-out = (52-wk high − price) × shares outstanding. Show it in $B, labelled estimate. Example, 9 Nov 2026 close: NVDA $178.67, high $243.37, -$64.70, -26.6%. GOOG $286.01, high $408.61, -$122.60, -30.0%.

Verify price from one live source (Finnhub via search, or the exchange page) with the date. Never reuse yesterday's price as today's.

## Pile diagram — per investor

One stacked bar per investor, summing to 100% of that investor's disclosed portfolio. Segments sized by holding, labelled stock + $ + %. Show $0 / 0% as a dashed marker, not a segment. Berkshire: exact 13F %. Pelosi / Trump: estimate from filing-range midpoints and say so — their filings publish no portfolio total. Put the three piles side by side.

## Output

A watchlist page (web artifact) with: ranking (Lynch-cheap first), daily stats table, pile diagram per investor, bear case per name, earnings calendar, and a sources box with the URLs above. Short reply in chat: top 3 buys, top bear case, one line per investor on what changed since yesterday. No buy recommendation as a guarantee. Never place an order.
