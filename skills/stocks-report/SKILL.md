---
name: stocks-report
description: Build and update a daily watchlist of stocks bought by Trump, Pelosi, Berkshire Hathaway and Bridgewater, analysed Peter Lynch style, to discover good buy opportunities and warn when it makes sense to trim. Use when asked to "track smart money", "what are Trump / Pelosi / Buffett buying", "Lynch watchlist", "is this a good buy now", "should I trim", or "show me the pile diagram".
---

# Stocks Report

Purpose: discover good buy opportunities, and warn when it makes sense to trim. That is the whole point — tracking is not the goal, the buy / trim call is.

Build a watchlist from the union of what four smart-money sources buy. Analyse each name Lynch-style. Show one pile diagram per investor. Run daily.

## Privacy — this skill lives in a PUBLIC repo

Never put the user's net worth, portfolio total, holding $ amounts, holding %, share counts, or cost basis in this file. No user-specific numbers at all — not even as examples. The user's own numbers live only in private memory and in the private report, never in this repo. Sizing is always expressed as % of the user's portfolio, with the $ / share math done at run time from the user's private data, never written into the skill.

## Use the current price

Always use the CURRENT price — the price the user just stated in chat, or the latest live price pulled in this run. Never use a stale close (e.g. the Nov 9, 2026 close) as today's price. If the user says "current price is $167", that is the price for the calculation, the % down, and the days-wiped-out lookback — use $167, not $178.67.

## Plain English, no idioms (Nov 14, 2026 — user: "I don't understand this language")

Write every line in plain English. No idioms, no slang, no figures of speech. Never write "survived by a hair", "turn is back on", "flips", "by a hair", "knife's edge", or anything like them. Say it with numbers: the price, the 50-day average, the gap in $ and %, and what changes the decision. If a sentence needs an idiom to make sense, rewrite it without one.

**No unexplained jargon (Nov 14, 2026 — user: "multiple compression and leadership discount" is fluff):** never write "multiple compression", "leadership discount", "de-rating", "re-rating", "multiple expansion", or any other finance jargon without explaining it in plain words with numbers. Write it like this: "the price fell 33% from $243.37 to $162.85, while earnings for this quarter are expected to grow about 90% from last year — the company earns more, but the stock costs less" and "the price is lower because the CEO resigned and no successor is named". The Lynch cell is plain words with numbers, no jargon. The Verdict + Action cell states the action plainly — what to do, how many shares, at what price.

## Data sources — where every number comes from (Nov 13, 2026)

Follow the `smart-money-signals` skill — it is the canonical copy of every source, form, website, lag and price rule (insiders Form 4, congress PTR, 13F, options unusual activity, prices, FPE/PEG, momentum, company reports). Do not duplicate its rules here; if a rule changes, change it there.

## Daily run

Run every morning, ~08:48 WITA (Asia/Makassar). Each run: re-pull the latest regular-session closes for every watchlist stock, recompute the daily stats ($ down from 52-wk high, % down, $ wipe-out, days below high, days of growth wiped out), check for new filings (13F, PTR, OGE) and new earnings / guidance, check Polymarket earnings bets (see below), follow the `whale-options-flow` skill for options flow (pull options chains after the close — pre-market pulls are empty), and follow the `tradingview-news` skill for news — then re-rank the TLDR buys / trims, and update the watchlist page in place. Send the user a short TLDR in chat only if something changed since yesterday — a new buy / trim signal, a level crossed, a filing, an earnings result, a Polymarket odds move of 5+ points, or a whale flow change that moves a sell level. If nothing changed, say nothing. Never place an order.

## Daily report — ONE consolidated table (Nov 14, 2026 — user: two tables are hard to read, everything in one table)

Every daily report delivers ONE table — one row per watchlist ticker (including VOO, QQQ, and the QQQ top 10–15). No second table, no per-name prose sections. The five views below live INSIDE the table as short cells, not as separate sections. A cell that needs a sentence is too long — shorten it to a few words.

Columns, in this order:
`Ticker | Price (close, date) | 52w High (date) | 52w Low (date) | % from High | 20d SMA | vs 20d SMA | Fwd P/E | PEG | Momentum | Trend | Lynch | Options flow | Insiders (Form 4) | Congress (PTR) | Hedge funds (13F) | Verdict + Action`

- **Price, 52w High, 52w Low:** from daily candles, verified with the date. % from High = (high − price) / high, shown negative.
- **20d SMA:** simple moving average of the last 20 regular-session closes, computed from daily candles at run time. vs 20d SMA = (price / SMA − 1), in %. The 50-day stays the trend measure (Trend column) — the 20d SMA is the short-term level, not a replacement.
- **Fwd P/E, PEG:** GAAP first; say so if non-GAAP. PEG = Fwd P/E ÷ forward EPS growth %.
- **Momentum, Trend:** words only, never MACD numbers (see Daily stats below).
- **Lynch cell:** class + PEG verdict + earnings hold or break, one short phrase. E.g. "Fast Grower, PEG 0.27, earnings hold — compression, not a break". The 2-minute story, bear case, and what-would-change-my-mind live in the deep dive (analyst-hedgefund), not in this cell.
- **Options flow cell:** follow the `whale-options-flow` skill. Whale direction + wall / max pain / straddle, one short phrase. E.g. "wall $185, straddle top $185.10, Feb $195C bought". The full chain detail (biggest trades, premiums, breakevens) lives in the deep dive, not in this cell.
- **Insiders cell (Form 4, SEC EDGAR):** "none" or the warning WITH the facts — how many open-market sales, total $ sold, who sold most of it, sale price range, how far above the current price in % and $. Never write the warning alone.
- **Congress cell (PTR):** who holds / adds / exits + trade date, or "no PTR trades". Congress files PTR, not 13F; Trump files OGE Form 278-T, not a PTR.
- **Hedge funds cell (13F):** who holds / adds / exits + position date (quarter-end) + age in days, or "13F due [date]". 13F is institutions only, 45 days after quarter-end. A filing is a trade, not a current holding. Never state $0 from a summary alone.
- **Verdict + Action cell:** BUY / HOLD / TRIM / DON'T ADD / WAIT + action with shares + limit price + one short reason for the limit (fundamental level, whale wall, straddle level, 50-day). The old "Why that limit" column folds in here.
- **Market / expert view:** Polymarket earnings bets + analyst targets where they changed stay OUT of the table — one short paragraph after the table, with source and date. This is what the market expects the price to be — not a forecast, not a guarantee.
- If a cell's data is unavailable, write "n/d — [reason + when it becomes available]". Never leave a cell blank, never drop a column.
- **Delivery gate (Nov 13, 2026):** before delivering, check every row carries its smart-money cells (insiders, congress, hedge funds) and its options-flow cell — or the cell marked n/d with the reason and the time it becomes available. A report with a silently dropped cell is a failed report.

The five views the table carries (content rules — presentation is the table above):
1. **Peter Lynch view** — per stock: 2-minute story, class, GAAP PEG, earnings vs price, bear case, what would change my mind. See Lynch test below.
2. **Whale options flow** — follow the `whale-options-flow` skill: total call/put premium yesterday and today, biggest 3–5 trades (strike, expiry, premium, breakeven), call wall / put wall / max pain, most active strikes. Then one line per stock: what price whales expect — the ceiling they are buying calls for, the floor they are buying puts for — and whether that confirms or contradicts the user's sell limit.
3. **Smart money filings — 13F is NOT Congress** — 13F is only for institutional investment managers with >$100M (Berkshire, Bridgewater, Thiel, etc., 45 days after quarter-end). Congress members do NOT file 13F — they file a **Periodic Transaction Report (PTR)** under the STOCK Act, 30–45 days after the trade, in amount ranges, not exact amounts. Trump files **OGE Form 278-T**, not a 13F and not a PTR. For each new filing: who, what form (13F / PTR / OGE 278-T), what stock, buy/sell, amount range, date filed, date traded, % of their portfolio (exact for 13F, midpoint estimate for PTR/OGE — say so). A filing is a trade, not a current holding. Never state $0 from a summary alone.
4. **Market / expert price view** — Polymarket earnings bets (see below) + analyst targets where they changed: consensus target, range, and any upgrade/downgrade yesterday, with source and date. This is what the market expects the price to be — not a forecast, not a guarantee.
5. **Company insiders — Form 4 (SEC EDGAR):** the company's own officers and directors, not politicians. Follow the `smart-money-signals` skill for the definition, the sources and the price rules. The warning line must read "INSIDER WARNING (Form 4, SEC EDGAR)". **Never state the warning without the facts (Nov 14, 2026 — user: a bare warning is fluff without facts):** never write "the warning stands" alone. Every time the warning is stated, include the facts — how many open-market sales, total $ sold, who sold most of it, the sale price range, and how far above the current price in % and $.

Sources box at the end of the report lists every source used that day, with URLs and dates — 13F / PTR / OGE filings, SpotGamma / OptionsBell / SquawkFlow for options, TradingView / Benzinga / Bloomberg for news, Polymarket with volume.

## Polymarket — earnings bets

Check Polymarket every daily run for each watchlist stock with an earnings date ahead. Record, with date and volume: "Will [ticker] beat quarterly earnings?" Yes %, gross-margin bracket if there is one, "What will [ticker] hit in [month]?" leading outcome, and any CEO / leadership market (e.g. Jensen Huang resignation/removal by Dec 31). Polymarket is a prediction market, not options and not a forecast — odds are crowd consensus, volumes are often small, odds spike and retreat. State the volume and the date with every odds number. Use it as a warning / sentiment check against the Lynch call: e.g. beat-earnings 94% but below-$184 in November 89% means traders expect a beat with no price recovery. Notify on a 5+ point move, a date change, or a new market. Never bet on Polymarket for the user, never place a trade there.

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

Rules: a filing is a trade, not a current holding. Amounts are ranges. Options are not copied by Autopilot. A 13F omits cash, bonds, shorts, foreign shares. Never state "owns $0" from a summary alone — say "no trade/holding found in the filings checked". Trackers disagree by method (ranges vs counted-buys) — never quote one tracker's % as the only truth; Capitol Trades is the primary source (free, every trade).

## Universe

Union, deduplicated, of the four sources' top holdings + recent buys, PLUS QQQ (added Nov 11, 2026): watch the QQQ ETF itself, and its top 10–15 holdings by weight (re-pull weights each run — they change). QQQ names are mostly the same companies from the other side: buyers (MSFT, AAPL, AMZN, GOOG, META, TSLA), sellers (NVDA, AVGO, PLTR), and both (GOOG, META, MSFT — they buy AI chips and sell AI / cloud). Note the buyer / seller / both split per name. Keep the user's own holdings in the list for comparison (tickers come from the user's private data at run time, never listed here). Drop a name only when all four sources have exited it and it has left the QQQ top 15.

## Lynch test — for each stock, one short block

Why these metrics: see the "Research references" section in the `smart-money-signals` skill — every metric (PEG, earnings growth, value, momentum, dip levels, categories) carries its source, labelled [Academic] / [Book] / [Practitioner] / [Convention] / [Ours]. When Den asks "why do you think so?", answer with that reference.

- Two-minute story: what it sells, who pays, why it wins.
- Class: Stalwart / Fast Grower / Cyclical / Turnaround / Slow Grower.
- Earnings vs price: are earnings up while price fell (multiple compression) or is earnings breaking?
- PEG: forward P/E ÷ forward EPS growth. Use GAAP EPS first; if only non-GAAP is published, say so and name the distortion (SBC, warrant charges, amortisation).
- Bear case in one line. What would change your mind: next earnings date + trigger.

## Daily stats — inside the one table (Nov 14, 2026)

The daily stats ARE the consolidated table — one row per watchlist stock (including VOO, QQQ, and the QQQ top 10–15). There is no separate stats table and no separate FPE / PEG table. Never omit a stock because its PEG is ugly — show it. For VOO / QQQ, use the index FPE / PEG (see Index entry check). For single stocks, use the stock's own FPE / PEG.
- **Verdict = valuation + trend, not valuation alone (Nov 11, 2026):** Cheap (PEG <1) + Trend Up (momentum rising, price above 50-day) = **BUY**; Cheap + Trend Down = **WAIT / HOLD starter only** (do not add fresh); Fair (PEG 1–1.5) + Trend Up = **BUY in tranches / HOLD**; Fair + Trend Down = **HOLD**; Expensive (PEG >2) = **DON'T ADD**, regardless of trend. A trend that just changed to Up is the buy trigger — say "trend just changed" in the row when momentum turned up / price crossed above the 50-day in this run. Smart-money veto (Nov 13, 2026): an INSIDER WARNING or a congressman exit overrides the formula — never BUY a ticker with either, whatever the PEG and trend say.
- **Every WAIT names its entry price (Nov 14, 2026 — user: "wait for what? What price do I have to wait for?"):** never write WAIT without the price you are waiting for. The Verdict + Action cell carries one reasoned entry price in $ with its reason in a few words — put wall, straddle low, recent low, and the FPE / PEG at that price. Example: "WAIT — entry $300 (Jan 15 put wall, Dec 18 straddle low $301, recent low $290; FPE 15.8x, PEG 0.25 at $300)". A WAIT with no price is not delivered.
- **Momentum and trend every run (Nov 12, 2026 — user: show momentum and trend, not MACD numbers):** compute MACD internally for every watchlist stock (it is the momentum measure) but NEVER print the MACD line, signal, or histogram numbers in the report. Display two words per stock, with the date. **Momentum** — from the MACD histogram: Rising (histogram rising) / Falling (histogram falling) / Flat, qualified Strong / Weak by the histogram's slope and the MACD line's distance from zero. **Trend** — Uptrend (price above 50-day and MACD line above zero) / Downtrend (price below 50-day and MACD line below zero) / Sideways (the two disagree), with price vs 50-day % beside it. No RSI — excluded by the user Nov 11, 2026. Momentum is not a buy signal on its own — combine with the Lynch call.
- $ wipe-out = (52-wk high − price) × shares outstanding. Show it in $B, labelled estimate.
- Days below high = calendar days from the 52-wk high date to today.
- Days of growth wiped out = calendar days back from today to the FIRST time today's price was reached. That is the lookback: the price has given back every gain since that date. Find it from daily candles, don't guess it. Show the date too, e.g. `490d (first reached 7 Jul 2025)`. User definition (Nov 11, 2026): first time reached, NOT last time at that level — the last-time figures (216d on 7 Apr 2026, 255d on 27 Feb 2026 for NVDA) are superseded.
- Example, 9 Nov 2026 close: NVDA $178.67, high $243.37 on 6 Oct 2026, -$64.70, -26.6%, 34d below high, 490d of growth wiped out (first reached ~7 Jul 2025, per TradingView). GOOG $286.01, high $404.47, -$118.46, -29.3%. The watchlist page's earlier "34d" was days below high, not days of growth wiped out.

Verify price from one live source (Finnhub via search, or the exchange page) with the date. Never reuse yesterday's price as today's.

## Pile diagram — per investor

One stacked bar per investor, summing to 100% of that investor's disclosed portfolio. Segments sized by holding, labelled stock + $ + % + avg cost basis. Show $0 / 0% as a dashed marker, not a segment. Berkshire: exact 13F %. Pelosi / Trump: estimate from filing-range midpoints and say so — their filings publish no portfolio total. Put the three piles side by side.

Avg cost basis: show it on the pile diagram and on the roadmap, per holding, wherever it can be verified — e.g. Berkshire GOOG June 2026 private placement $351.81 (Class A) / $348.20 (Class C), Pelosi GOOGL calls $150 strike exercised Jan 16, 2026, Trump NVDA buys at Jul 20 $203.28 / Aug 17 $225.01 / Aug 26 $209.66 closes (market price that day, not the filing price — filings give ranges, not trade prices, say so). Where no cost basis can be verified, mark it n/d — never invent one. Show current price next to it, so the gain / loss vs cost is visible at a glance.

## Buy / trim — the call

Flag a BUY when at least three of these hold: forward PEG < 1 on GAAP earnings, price down >25% from 52-wk high while earnings / guidance still hold (multiple compression, not an earnings break), smart-money sources adding in the latest filing, and you can tell the two-minute story. Do NOT require 2+ smart-money sources — one source adding, or none, can still be a buy if your own research confirms it. Do your own research all the time; smart money is a signal, not a gate. Rank buys Lynch-cheap first.

Warn TRIM / SELL when any of these hold: position >10% of the portfolio (or combined correlated names >15%), forward PEG > 2, earnings / guidance cut or RPO growth falling for a second quarter, two or more smart-money sources exiting in the latest filing, an INSIDER WARNING (follow the `smart-money-signals` skill for the definition), or the thesis breaks (the "what would change my mind" trigger fires). Say plainly: trim how much, to what %, and why — or hold, with the reason.

**Buy moment? / Hold at all? (Nov 13, 2026 — same fix as the dip alert):** every stock's call ends with two explicit lines — **BUY MOMENT: YES / NO** (momentum turned up + no INSIDER WARNING + no congressman exit) and **HOLD AT ALL: YES / NO** (NO when the thesis broke AND insiders or congress are exiting — a NO means TRIM / SELL, not HOLD). Weights: follow the `smart-money-signals` skill.

## Index entry check — VOO / QQQ: is this a good time to buy? (Nov 11, 2026)

Every daily run, report this for VOO (S&P 500) and QQQ (Nasdaq-100), with the date and source:
- **Forward P/E (FPE)** vs history, and **PEG** = forward P/E ÷ forward EPS growth (12-mo consensus).
- **S&P 500 / VOO:** FPE ≤17x = cheap / good entry; 17–19x = fair, buy in tranches; >20–22x = expensive, wait / small tranche only. PEG <1 = cheap, 1–1.5 = fair, >2 = expensive. History: 10-yr avg FPE 19.1x, 25-yr avg 16.4x, 5-yr avg 19.8x; 2022 trough ~15x, 2008 low 8.6x. Nov 5–9, 2026: FPE 17.7–18.0x — lowest since Nov 2023, already fair-good on valuation.
- **Nasdaq-100 / QQQ:** FPE ≤19–20x = cheap / good entry; 20–23x = fair, buy in tranches; >25x = expensive. PEG <1 = cheap, 1–1.5 = fair, >2 = expensive. History: 10-yr avg ~23x, 5-yr avg ~24.5–24.7x; 2022 dip below 19x, record low 11.2x Aug 2011. Nov 9, 2026: FPE 19.0–21.6x (source-dependent) — fair-good on valuation.
- **Drawdown entry levels (compute at run time from the 52-wk high, never hard-code prices):** -15% = good entry, -20% = great, -25%+ = generational. State the $ level for each: high × 0.85 / 0.80 / 0.75. E.g. from VOO $718 high: $610 / $575 / $539; from QQQ $763 high: $648 / $610 / $572 (Nov 2026 highs, recompute each run).
- **Verdict line per index:** one line — "VOO: FPE 17.7x, PEG ~X, -4.5% from high — fair-good valuation, price not at a historic entry yet" — so the user can see valuation vs price separately. A cheap FPE with a small drawdown = buy in tranches; a cheap FPE + -15% drawdown = buy the index, not a stock pick.

## Buy trigger checklist — all three layers, not one (Nov 11, 2026)

A BUY needs all three layers. Cheap on PEG alone, with momentum still down, is WAIT, not BUY.
1. **Fundamentals — Lynch / FPE / PEG:** PEG <1 on GAAP, forward P/E cheap vs its own history, earnings / guidance still holding (multiple compression, not an earnings break), 2-minute story tellable.
2. **Momentum — buy when it turns up:** momentum turns Rising (histogram rising, MACD crossing above zero = stronger); price crosses above its 50-day SMA (cleanest uptrend flip); ADX >25 confirms a real trend (below 20 = no trend, momentum whipsaws); relative strength vs S&P 500 turning positive over 1–3 months; the up-move on rising volume, not a low-volume bounce; 12-1 month momentum turning positive. Do NOT buy while momentum is still Falling and price is below the 50-day, even if PEG is cheap — that is NVDA and GOOG on Nov 9, 2026: HOLD, not BUY.
3. **Confirmation — smart money / flow:** whales buying calls for a recovery (not puts), filings with no exit (or someone adding), no insider warning, no new earnings break / guidance cut.
- One line: cheap on PEG + earnings hold + momentum turning up + price back above the 50-day = BUY. Cheap on PEG alone, momentum down, price below the 50-day = WAIT.

## Market drop vs single-stock drop (Nov 11, 2026)

- **Market down 15%+ (VOO / QQQ): buy the market, not a stock pick.** A broad -15% is usually multiple compression / fear, not one company's earnings breaking. Buying VOO / QQQ spreads risk across 500 / 100 names — no need to be right on any one story. Recommendation on a market drop is BUY VOO / QQQ (in tranches, see below), not a single stock.
- **One stock down 20–30% while the market is fine: that's a stock-pick moment.** Check why it fell first. If earnings / guidance still hold, it's Lynch-cheap — buy that individual stock. If earnings broke, don't buy it just because it's down.
- **Caveat — tranche a market buy if earnings are breaking across the board / a recession is the reason:** 1/3 now, 1/3 lower, 1/3 only if it goes deeper (-20%, then -25%). Never buy the full market size in one go into a broad earnings break.

## Sell signals — early, like smart money, never after the fall

The point is to catch a sell signal early, the way smart money exiting shows up in filings — before the stock has already fallen 50%. Never call SELL just because a stock has already fallen a lot. A big fall with earnings still growing is multiple compression, not a sell signal — selling then locks in the loss at the bottom. Example that was wrong: Marvell -53% from its high, revenue +37%, FY27 guided ~$12B — calling SELL there was too late. The correct call was HOLD, don't add, sell only into a bounce toward $200+ if you want out. Marvell stays HOLD in the TLDR until a forward reason changes it.
- A SELL / TRIM signal needs a forward reason: smart money exiting, earnings / guidance cut, thesis break, or PEG > 2 while price is still near its high. Do NOT limit this to 2+ smart-money sources — one source exiting, or no smart-money exit at all, can still be a sell if your own research finds the reason. Do your own research all the time; smart money is a signal, not a gate.
- Never sell on news alone (Nov 12, 2026 — user rule): a sell level must be justified by fundamentals — an earnings / guidance break, a thesis break, or valuation — or by a confirmed fact (a filed exit, a confirmed board decision). An unconfirmed report, a headline, or a price break on unconfirmed news is never a sell reason, and never sell at a loss into a news-driven panic. If the fundamentals still hold, the call is HOLD — a panic dip on intact fundamentals is a hold, never a panic sale.
- Cost basis is not analysis (Nov 12, 2026 — user rule): never build a sell or trim level from the user's cost basis. Cost is a tax fact, not a reason — a stock below cost with intact fundamentals is a hold, and a stock above cost with a broken thesis is a sell.
- If a stock falls, research WHY it fell before calling anything — earnings, guidance, a deal, a downgrade, a customer loss, a filing, sector news. Never report a fall with no reason, and never call SELL on the fall alone.
- If the fall already happened and earnings still hold, say HOLD, don't add — name the bounce level where selling would make sense instead.
- Always state when the signal fired: filing date, earnings date, or exit date — so the user can see whether it is early or already too late.

## Strong buy — always with sizing

Every TLDR call must come with position-sizing reasoning, not just STRONG BUYs. Each call: target % of the user's portfolio, $ amount, shares at current price, current holding, and WHY that size — new position vs already large, correlation with the user's other holdings, beta, earnings date ahead, smart-money confirmation. One or two lines. No call without sizing reasoning. Every BUY in the report (private, not in this public skill) must also state how many shares to buy and at what limit price — e.g. "buy X shares, limit $Y" — with the limit justified by the technical level / valuation (support, 52-wk low, PEG-implied price). The limit price itself is a market level, not the user's private data, but the user's $ / share counts stay out of this skill file. Every tranche must state shares + $ + limit price — no tranche may state only a $ amount or only a limit price without the share count. If the price for a later tranche is not yet known, state the $ amount and the formula: shares = $ amount ÷ that price, with worked examples at two prices.
- Target % of the user's portfolio (e.g. 2%), $ amount, and share count at the current price. Show the user's current holding in $ and % for context.
- Why that size: Lynch cheapness (PEG, multiple compression), smart-money confirmation (who is adding, % of their book), and risk (beta, correlation with the user's other holdings, earnings date ahead).
- Tranche plan: how much now, how much after the next catalyst (e.g. NVDA earnings Nov 17, the stock's own earnings), and at what price level to accelerate or stop. Never propose buying the full size in one go before a known catalyst.

## Final step — criticise as Peter Lynch, then address it

Before delivering the report, criticise it as Peter Lynch would, in writing, and then address every point raised. Do not skip this step.
- Criticise: can the story be told in 2 minutes? Is the PEG on GAAP earnings, not non-GAAP? Whose earnings — how concentrated are the customers? Is "buy on the fall" averaging down, or buying cheap on a thesis that still holds? Is the position size diversification, or a concentrated bet on correlated names? Is the sell / trim call early, or selling after the fall?
- Address it: for each criticism, either fix the call (change BUY to HOLD, shrink the size, remove a pre-committed add level, add an earnings re-check before adding), or state in one line why the criticism does not apply, with the evidence. Record the criticism and the fix in the report, short — one line per point. Never deliver a report whose Lynch critique was not written and addressed first.

**Delivery gate (Nov 13, 2026 — same fix as the dip alert and the deep dive):** before delivering, check every stock carries its smart-money line (filings + insiders, Form 4, SEC EDGAR) and its options-flow line — or the line marked unavailable with the reason and the time it becomes available. A report with a silently dropped section is a failed report.

No long description and no disclaimer at the beginning. Start the page with a short TLDR: what to buy if there is a strong opportunity, or what to sell if there is a strong signal — one line per call, with two short comments per call: (1) Lynch view — class, PEG, earnings vs price, multiple compression or earnings break; (2) Smart money view — who bought / sold / held, when, how much as % of their portfolio. One line each. Do NOT include the user's own portfolio % in the TLDR; the user's position belongs in the watchlist / pile sections, not the TLDR. Then the pile chart (with avg cost basis, see Pile diagram). Then a roadmap / timeline: when each investor bought, what stock, how much as % of their portfolio, and avg cost basis — one row per buy, in date order, investor + stock + amount + % of portfolio + avg cost basis (n/d where unverifiable). Then the one consolidated table, rows ranked Lynch-cheap first, then the earnings calendar, and a sources box with the URLs above. (The per-name bear case and the 2-minute story live in the deep dive, not in the daily table.) Short reply in chat: top 3 buys, top trim warning, one line per investor on what changed since yesterday. No buy recommendation as a guarantee. Never place an order.
