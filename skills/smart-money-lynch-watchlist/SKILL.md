---
name: smart-money-lynch-watchlist
description: Build and update a daily watchlist of stocks bought by Trump, Pelosi, Berkshire Hathaway and Bridgewater, analysed Peter Lynch style, to discover good buy opportunities and warn when it makes sense to trim. Use when asked to "track smart money", "what are Trump / Pelosi / Buffett buying", "Lynch watchlist", "is this a good buy now", "should I trim", or "show me the pile diagram".
---

# Smart Money + Lynch Watchlist

Purpose: discover good buy opportunities, and warn when it makes sense to trim. That is the whole point — tracking is not the goal, the buy / trim call is.

Build a watchlist from the union of what four smart-money sources buy. Analyse each name Lynch-style. Show one pile diagram per investor. Run daily.

## Daily run

Run every morning, ~08:48 WITA (Asia/Makassar). Each run: re-pull the latest regular-session closes for every watchlist stock, recompute the daily stats ($ down from 52-wk high, % down, $ wipe-out, days below high, days of growth wiped out), check for new filings (13F, PTR, OGE) and new earnings / guidance, re-rank the TLDR buys / trims, and update the watchlist page in place. Send the user a short TLDR in chat only if something changed since yesterday — a new buy / trim signal, a level crossed, a filing, or an earnings result. If nothing changed, say nothing. Never place an order.

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

`Ticker | Price (close, date) | 52-wk high (date) | -$ down from high | -% down from high | $ wipe-out | Days below high | Days of growth wiped out`

- $ wipe-out = (52-wk high − price) × shares outstanding. Show it in $B, labelled estimate.
- Days below high = calendar days from the 52-wk high date to today.
- Days of growth wiped out = calendar days back from today to the last close at or below today's price. That is the lookback: the price has given back every gain since that date. Find it from daily candles, don't guess it. Show the date too, e.g. `255d (last at this level 27 Feb 2026)`.
- Example, 9 Nov 2026 close: NVDA $178.67, high $243.37 on 6 Oct 2026, -$64.70, -26.6%, 34d below high, 255d of growth wiped out (last close at/below this level 27 Feb 2026, $177.19). GOOG $286.01, high $408.61, -$122.60, -30.0%. Do NOT use "490d" for NVDA unless daily candles prove it — 490d does not match the verified lookback above, and the watchlist page's earlier "34d" was days below high, not days of growth wiped out. If the user means a different definition, ask in one line and record it here.

Verify price from one live source (Finnhub via search, or the exchange page) with the date. Never reuse yesterday's price as today's.

## Pile diagram — per investor

One stacked bar per investor, summing to 100% of that investor's disclosed portfolio. Segments sized by holding, labelled stock + $ + % + avg cost basis. Show $0 / 0% as a dashed marker, not a segment. Berkshire: exact 13F %. Pelosi / Trump: estimate from filing-range midpoints and say so — their filings publish no portfolio total. Put the three piles side by side.

Avg cost basis: show it on the pile diagram and on the roadmap, per holding, wherever it can be verified — e.g. Berkshire GOOG June 2026 private placement $351.81 (Class A) / $348.20 (Class C), Pelosi GOOGL calls $150 strike exercised Jan 16, 2026, Trump NVDA buys at Jul 20 $203.28 / Aug 17 $225.01 / Aug 26 $209.66 closes (market price that day, not the filing price — filings give ranges, not trade prices, say so). Where no cost basis can be verified, mark it n/d — never invent one. Show current price next to it, so the gain / loss vs cost is visible at a glance.

## Buy / trim — the call

Flag a BUY when at least three of these hold: forward PEG < 1 on GAAP earnings, price down >25% from 52-wk high while earnings / guidance still hold (multiple compression, not an earnings break), smart-money sources adding in the latest filing, and you can tell the two-minute story. Do NOT require 2+ smart-money sources — one source adding, or none, can still be a buy if your own research confirms it. Do your own research all the time; smart money is a signal, not a gate. Rank buys Lynch-cheap first.

Warn TRIM / SELL when any of these hold: position >10% of the portfolio (or combined correlated names >15%), forward PEG > 2, earnings / guidance cut or RPO growth falling for a second quarter, two or more smart-money sources exiting in the latest filing, or the thesis breaks (the "what would change my mind" trigger fires). Say plainly: trim how much, to what %, and why — or hold, with the reason.

## Sell signals — early, like smart money, never after the fall

The point is to catch a sell signal early, the way smart money exiting shows up in filings — before the stock has already fallen 50%. Never call SELL just because a stock has already fallen a lot. A big fall with earnings still growing is multiple compression, not a sell signal — selling then locks in the loss at the bottom. Example that was wrong: Marvell -53% from its high, revenue +37%, FY27 guided ~$12B — calling SELL there was too late. The correct call was HOLD, don't add, sell only into a bounce toward $200+ if you want out. Marvell stays HOLD in the TLDR until a forward reason changes it.
- A SELL / TRIM signal needs a forward reason: smart money exiting, earnings / guidance cut, thesis break, or PEG > 2 while price is still near its high. Do NOT limit this to 2+ smart-money sources — one source exiting, or no smart-money exit at all, can still be a sell if your own research finds the reason. Do your own research all the time; smart money is a signal, not a gate.
- If a stock falls, research WHY it fell before calling anything — earnings, guidance, a deal, a downgrade, a customer loss, a filing, sector news. Never report a fall with no reason, and never call SELL on the fall alone.
- If the fall already happened and earnings still hold, say HOLD, don't add — name the bounce level where selling would make sense instead.
- Always state when the signal fired: filing date, earnings date, or exit date — so the user can see whether it is early or already too late.

## Strong buy — always with sizing

Every TLDR call must come with position-sizing reasoning, not just STRONG BUYs. Each call: target % of the user's portfolio, $ amount, shares at current price, current holding, and WHY that size — new position vs already large, correlation with GOOG/NVDA/TSM, beta, earnings date ahead, smart-money confirmation. One or two lines. No call without sizing reasoning.
- Target % of the user's portfolio (e.g. 2%), $ amount, and share count at the current price. Show the user's current holding in $ and % for context.
- Why that size: Lynch cheapness (PEG, multiple compression), smart-money confirmation (who is adding, % of their book), and risk (beta, correlation with GOOG/NVDA/TSM, earnings date ahead).
- Tranche plan: how much now, how much after the next catalyst (e.g. NVDA earnings Nov 17, the stock's own earnings), and at what price level to accelerate or stop. Never propose buying the full size in one go before a known catalyst.

## Output — short, TLDR first

No long description and no disclaimer at the beginning. Start the page with a short TLDR: what to buy if there is a strong opportunity, or what to sell if there is a strong signal — one line per call, with two short comments per call: (1) Lynch view — class, PEG, earnings vs price, multiple compression or earnings break; (2) Smart money view — who bought / sold / held, when, how much as % of their portfolio. One line each. Do NOT include the user's own portfolio % in the TLDR — no "9.8% of your portfolio" there; the user's position belongs in the watchlist / pile sections, not the TLDR. Then the pile chart (with avg cost basis, see Pile diagram). Then a roadmap / timeline: when each investor bought, what stock, how much as % of their portfolio, and avg cost basis — one row per buy, in date order, investor + stock + amount + % of portfolio + avg cost basis (n/d where unverifiable). Then the daily stats table, ranking (Lynch-cheap first), bear case per name, earnings calendar, and a sources box with the URLs above. Short reply in chat: top 3 buys, top trim warning, one line per investor on what changed since yesterday. No buy recommendation as a guarantee. Never place an order.
