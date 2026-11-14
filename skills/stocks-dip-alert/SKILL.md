---
name: stocks-dip-alert
description: Daily dip alert for VOO, QQQ and the user's top holdings — notify only when a ticker drops 15%+ from its 52-week high, with % down, days of growth wiped out, reasoning, and an insider-selling warning (Form 4) on dropped tickers. Use when asked to "watch for a correction", "notify me when VOO / QQQ drops 20%", "show only what dropped", or to check a dip.
---

# Stocks Dip Alert

Daily check, after the US close, for a correction in the watchlist. Notify only when something dropped — never report tickers that did not drop.

## Watchlist

VOO, QQQ, GOOG, PLTR, AVGO, NVDA, META, MSFT, AMZN, COIN, ASML, BRK.B, TSLA.

## Use the current price

Always use the CURRENT price — the price the user just stated in chat, or the latest live price pulled in this run. Never use a stale close (e.g. the Nov 9, 2026 close) as today's price. If the user says "current price is $167", that is the price for the calculation, the % down, and the days-wiped-out lookback — use $167, not $178.67.

## Data sources — where every number comes from (Nov 13, 2026)

Follow the `smart-money-signals` skill — it is the canonical copy of every source, form, website, lag and price rule (insiders Form 4, congress PTR, 13F, options unusual activity, prices, FPE/PEG, momentum, company reports). Do not duplicate its rules here; if a rule changes, change it there.

## Daily run

Run every morning, ~08:48 WITA (Asia/Makassar), after the US close.

Each run:
- Pull the latest regular-session closes for each ticker, and their 52-week highs (with dates), from a live source (Finnhub via search, or the exchange / TradingView). Verify each price with the date; never reuse yesterday's price. Pull options chains after the close, when live quotes exist — pre-market pulls are empty.
- Compute % down from the 52-week high: (high - price) / high.
- Compute days of growth wiped out: calendar days back from today to the FIRST time today's price was reached, from daily candles — show the number AND the date, e.g. `471d (first reached 28 Jul 2025, verified 11 Nov 2026)`. That is the user's definition (Nov 11, 2026): the dip wipes out all growth since the price was first reached, not since the last time it was at that level. Never guess this number; find the first close at or above today's price in the candles.
- Notify only when a ticker is down 15% or more from its 52-week high — starting at 15%, then again at 20% and 25% — or when it crosses any of those levels for the first time, or crosses back above a level after having been below it. Notify also when a NEW insider warning appears for a watchlist ticker (a Form 4 sale filed in the last 24h that meets the warning rule), or when a tracked congressman exits a held position — even if the stock did not drop. That is a hold-at-all alert, not a buy alert.

**Plain English, no idioms (Nov 14, 2026 — user: "I don't understand this language"):** write every line in plain English. No idioms, no slang, no figures of speech. Never write "survived by a hair", "turn is back on", "flips", "by a hair", "knife's edge", or anything like them. Say it with numbers: the price, the 50-day average, the gap in $ and %, and what changes the decision. If a sentence needs an idiom to make sense, rewrite it without one.

## Report format — only what dropped

Show ONLY the tickers that dropped to a level — one row per dropped ticker, no rows for tickers that did not drop.

`Ticker, -% down, -days of growth wiped out, reasoning, Recommendation`

**Print the FPE / PEG table every run** — one table, one row per watchlist stock (VOO, QQQ, and all 13 watchlist tickers), with columns: Ticker | Forward P/E (date, source) | Forward EPS growth % | PEG (= FPE ÷ growth, GAAP first, say so if non-GAAP) | Momentum (Rising / Falling / Flat + Strong / Weak) | Trend (Uptrend / Downtrend / Sideways + price vs 50-day %) | Verdict. Show it even for tickers that did not drop — the FPE / PEG table is not limited to dropped rows. For VOO / QQQ, use the index FPE / PEG (see Index entry check).
**Dip chart — what the alert posts (Nov 13, 2026 — user: this is what the dip alert has to post; Nov 14, 2026 — user: make it vertical, not horizontal):** every alert posts the dip chart — vertical bars, one per watchlist ticker, % down from the 52-week high, worst at the left, colored by dip level (red ≤ −25%, orange −20% to −25%, gold −15% to −20%, green above −15%), dashed horizontal lines at −15% / −20% / −25%, value labels on every bar. It is the reading view of the alert: one look shows how far each name fell and which level it crossed. Built by `scripts/build_dip_chart.py` (matplotlib) from the run's JSON (ticker + % down + as-of time + footnote); the script lives in `skills/stocks-dip-alert/scripts/` — one chart, one script. Deliver the PNG in chat with the alert; the FPE / PEG table stays the numbers behind it.
**Verdict = valuation + trend, not valuation alone (Nov 11, 2026):** Cheap (PEG <1) + Trend Up = **BUY**; Cheap + Trend Down = **WAIT / HOLD starter only**; Fair (PEG 1–1.5) + Trend Up = **BUY in tranches / HOLD**; Fair + Trend Down = **HOLD**; Expensive (PEG >2) = **DON'T ADD**, regardless of trend. A trend that just changed to Up is the buy trigger — say "trend just changed" in the row when momentum turned up / price crossed above the 50-day in this run. Smart-money veto (Nov 13, 2026): an INSIDER WARNING or a congressman exit overrides the formula — never BUY a ticker with either, whatever the PEG and trend say.

**Momentum and trend every run (Nov 12, 2026 — user: show momentum and trend, not MACD numbers):** compute MACD internally for every watchlist stock (it is the momentum measure) but NEVER print the MACD line, signal, or histogram numbers in the report. Display two words per stock, with the date. **Momentum** — from the MACD histogram: Rising (histogram rising) / Falling (histogram falling) / Flat, qualified Strong / Weak by the histogram's slope and the MACD line's distance from zero. **Trend** — Uptrend (price above 50-day and MACD line above zero) / Downtrend (price below 50-day and MACD line below zero) / Sideways (the two disagree), with price vs 50-day % beside it. No RSI — excluded by the user Nov 11, 2026. Momentum is not a buy signal on its own — combine with the Lynch call.

Reasoning is one line on why it fell — earnings, guidance, NVDA / hyperscaler news — follow the `tradingview-news` skill, name the source and date.

Recommendation is one word (BUY / HOLD / TRIM / SELL / DON'T ADD) + one line, built from the `stocks-report` skill — all three views, in that order:
1. **Lynch** — multiple compression (earnings up, price down = buy) or earnings break (earnings down = don't buy)? GAAP PEG, 2-minute story still hold?
2. **Whale flow** — follow the `whale-options-flow` skill: are whales buying calls for a recovery, or buying puts / hedging? That sets the ceiling / floor.
3. **Filings — 13F / PTR / OGE** — 13F is institutional only (Berkshire, Bridgewater); Congress files PTR, Trump files OGE 278-T. Are they adding, holding, or exiting? Filing exit + fall = trim early. Filing add + fall = buy signal.
4. **Insiders — Form 4** — the company's own officers and directors, not politicians. Follow the `smart-money-signals` skill for the definition, the sources and the price rules.

Examples: `NVDA, -26.6%, -471d, Huang probe, HOLD — Lynch: earnings still hold, wait for Nov 17; Whales: Feb $195 calls; Filings: no exit yet; Insiders: INSIDER WARNING (Form 4, SEC EDGAR) — 9 sales $1.37B at $210-234, 26-39% above today's price` — `GOOG, -29.3%, -3d, capex rout, HOLD / TRIM into strength — Lynch: PEG 0.92 but FCF negative; Whales: 96% puts; Filings: Berkshire still holds 12.6%` — `COIN, -58.1%, -3d, Q3 miss, DON'T ADD — Lynch: earnings breaking, avoid`.

**Insider warning (Nov 13, 2026):** follow the `smart-money-signals` skill — it owns the definition, the sources and the price rules. The warning goes in that ticker's Recommendation line and in a one-line "Insider warnings" note under the FPE / PEG table, so it shows even for a ticker that did not drop. **Never state the warning without the facts (Nov 14, 2026 — user: a bare warning is fluff without facts):** never write "the warning stands" or "INSIDER WARNING" alone. Every time the warning is stated, include the facts — how many open-market sales, total $ sold, who sold most of it, the sale price range, and how far above the current price in % and $. Example: "INSIDER WARNING — 9 sales, $1,370.5M, almost all director Mark Stevens (5 sales, $1,353.7M), sold at $210–234, now 29–44% above the $162.85 close." NVDA (Nov 12, 2026): 9 sales $1,370.5M at $210–234, 26–39% above today's $166.19 — INSIDER WARNING. AVGO ($283.7M at $374–401, +5% vs $364.36) and AMD ($248.8M at $427–556, −18% vs $585.30) do not flag.

**Buy moment? (Nov 13, 2026 — user: the alert has to say when a dip is a good moment to buy):** every dropped row ends with an explicit call — **BUY MOMENT: YES / NO** — built from three inputs, in order. Weights: follow the `smart-money-signals` skill — Lynch vetoes, momentum gates timing, insider warning and congress exit veto a BUY.
1. **Momentum turn:** has momentum turned from downtrend to uptrend? Price back above the 50-day + momentum Rising = the turn happened (the MACD line above zero confirms it — a rising histogram with the line still below zero and price below the 50-day is a rebound inside a downtrend, not a turn; see the `smart-money-signals` skill). Momentum still Falling + price below the 50-day = no turn yet — cheap on PEG alone is never a buy moment. A deep dip alone is never a buy moment — the dip is the entry level, not the reason; the reason is the forward P/E plus the business confirming (Nov 13, 2026).
2. **Insiders:** no INSIDER WARNING (Form 4, SEC EDGAR). A warning = not a buy moment, whatever the PEG says.
3. **Congress:** no congressman exit (PTR, Capitol Trades / Quiver). A tracked congressman still holding or adding = the stock still makes sense to hold; an exit = a warning, not a buy moment.

**Hold at all? (Nov 13, 2026):** a dip is also the moment to ask whether the stock is worth holding at all. **HOLD AT ALL: YES / NO** — NO when the thesis broke (earnings / guidance break, story no longer true) AND insiders or congress are exiting. A NO means TRIM / SELL, not HOLD — never hold a broken thesis just because it fell.

**Every WAIT names its entry price (Nov 14, 2026 — user: "wait for what? What price do I have to wait for?"):** never write WAIT without the price you are waiting for. The row carries one reasoned entry price in $ with its reason in a few words — put wall, straddle low, recent low, and the FPE / PEG at that price.

Corrections (verified Nov 11, 2026): NVDA days wiped out is 471d at the $178.67 Nov 9 close on the user's first-time-reached definition (first close at/above $178.67 was 28 Jul 2025, $181.74 — Yahoo daily closes; the 490d / ~7 Jul 2025 figure was wrong, 7–9 Jul 2025 closes were $164–165). The earlier 216d was the LAST time at that level (7 Apr 2026, $178.10) and 255d was an earlier last-time figure (27 Feb 2026) — both are superseded by the first-time definition. At the current $167.82 the first reach is 17 Jul 2025 (482d). GOOG is -29.3% from its own high $404.47, NOT -30.0% from GOOGL's $408.61.

Levels: -10% is a correction, -20% is a bear market, -25 to -35% is a deep bear market — often, but not always, with a recession (2022 was -25% with no recession declared). The reason matters more than the number.

## Index entry check — VOO / QQQ: is this a good time to buy? (Nov 11, 2026)

Every run, for VOO and QQQ, report forward P/E (FPE) and PEG = FPE ÷ forward EPS growth, with date and source:
- **S&P 500 / VOO:** FPE ≤17x = cheap / good entry; 17–19x = fair, buy in tranches; >20–22x = expensive. PEG <1 = cheap, 1–1.5 = fair, >2 = expensive. History: 10-yr avg 19.1x, 25-yr avg 16.4x; 2022 trough ~15x, 2008 low 8.6x. Nov 5–9, 2026: 17.7–18.0x.
- **Nasdaq-100 / QQQ:** FPE ≤19–20x = cheap / good entry; 20–23x = fair, buy in tranches; >25x = expensive. PEG <1 = cheap, 1–1.5 = fair, >2 = expensive. History: 10-yr avg ~23x, 5-yr avg ~24.5–24.7x; 2022 dip below 19x. Nov 9, 2026: 19.0–21.6x.
- **Drawdown entry levels (compute at run time from the 52-wk high):** -15% = good, -20% = great, -25%+ = generational. State the $ level: high × 0.85 / 0.80 / 0.75.
- Include the verdict line in the VOO / QQQ row (or, if below 15%, in the below-15% note): FPE, PEG, % down, and whether valuation and price both say buy. Valuation cheap + drawdown small = tranche in; valuation cheap + -15% drawdown = buy the index.

## Buy trigger checklist — all three layers, not one (Nov 11, 2026)

A BUY recommendation needs all three layers. Cheap on PEG alone, with momentum still down, is WAIT / HOLD, not BUY.
1. **Fundamentals:** PEG <1 on GAAP, forward P/E cheap vs history, earnings / guidance still holding, 2-minute story tellable.
2. **Momentum — buy when it turns up:** momentum turns Rising (histogram rising, MACD crossing above zero = stronger); price crosses above its 50-day SMA; ADX >25 = real trend; relative strength vs S&P turning positive over 1–3 months; up-move on rising volume; 12-1 month momentum turning positive. Do NOT recommend BUY while momentum is still Falling and price is below the 50-day, even if PEG is cheap.
3. **Confirmation:** whales buying calls for a recovery (not puts), filings with no exit (or adding), no insider warning, no new earnings break / guidance cut.
- One line: cheap on PEG + earnings hold + momentum turning up + price back above the 50-day = BUY. Cheap on PEG alone, momentum down, price below the 50-day = WAIT.

## Market drop vs single-stock drop (Nov 11, 2026)

- **Market down 15%+ (VOO / QQQ): buy the market, not a stock pick.** A broad -15% is usually multiple compression / fear, not one company's earnings breaking. Recommendation is BUY VOO / QQQ (in tranches: 1/3 now, 1/3 lower, 1/3 only if deeper), not a single stock.
- **One stock down 20–30% while the market is fine: that's a stock-pick moment.** Check why it fell first. If earnings / guidance still hold, it's Lynch-cheap — buy that individual stock. If earnings broke, don't buy it just because it's down.
- Apply this in the Recommendation column: a dropped VOO / QQQ row recommends the index; a dropped single stock row recommends that stock (or DON'T ADD / HOLD if its earnings broke).

If no ticker dropped to a level, say nothing. Never place an order.

## Privacy — this skill lives in a PUBLIC repo

Never put the user's net worth, portfolio total, holding $ amounts, holding %, share counts, or cost basis in this file. No user-specific numbers at all — not even as examples.
