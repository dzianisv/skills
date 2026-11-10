---
name: stocks-dip-alert
description: Daily dip alert for VOO, QQQ and the user's top holdings — notify only when a ticker drops 15%+ from its 52-week high, with % down, days of growth wiped out, and reasoning. Use when asked to "watch for a correction", "notify me when VOO / QQQ drops 20%", "show only what dropped", or to check a dip.
---

# Stocks Dip Alert

Daily check, after the US close, for a correction in the watchlist. Notify only when something dropped — never report tickers that did not drop.

## Watchlist

VOO, QQQ, GOOG, PLTR, AVGO, NVDA, META, MSFT, AMZN, COIN, ASML, BRK.B, TSLA.

## Use the current price

Always use the CURRENT price — the price the user just stated in chat, or the latest live price pulled in this run. Never use a stale close (e.g. the Nov 9, 2026 close) as today's price. If the user says "current price is $167", that is the price for the calculation, the % down, and the days-wiped-out lookback — use $167, not $178.67.

## Daily run

Run every morning, ~08:48 WITA (Asia/Makassar), after the US close.

Each run:
- Pull the latest regular-session closes for each ticker, and their 52-week highs (with dates), from a live source (Finnhub via search, or the exchange / TradingView). Verify each price with the date; never reuse yesterday's price.
- Compute % down from the 52-week high: (high - price) / high.
- Compute days of growth wiped out: calendar days back from today to the FIRST time today's price was reached, from daily candles — show the number AND the date, e.g. `471d (first reached 28 Jul 2025, verified 11 Nov 2026)`. That is the user's definition (Nov 11, 2026): the dip wipes out all growth since the price was first reached, not since the last time it was at that level. Never guess this number; find the first close at or above today's price in the candles.
- Notify only when a ticker is down 15% or more from its 52-week high — starting at 15%, then again at 20% and 25% — or when it crosses any of those levels for the first time, or crosses back above a level after having been below it.

## Report format — only what dropped

Show ONLY the tickers that dropped to a level — one row per dropped ticker, no rows for tickers that did not drop.

`Ticker, -% down, -days of growth wiped out, reasoning, Recommendation`

**Print the FPE / PEG table every run** — one table, one row per watchlist stock (VOO, QQQ, and all 13 watchlist tickers), with columns: Ticker | Forward P/E (date, source) | Forward EPS growth % | PEG (= FPE ÷ growth, GAAP first, say so if non-GAAP) | Verdict (Cheap <1 / Fair 1–1.5 / Expensive >2). Show it even for tickers that did not drop — the FPE / PEG table is not limited to dropped rows. For VOO / QQQ, use the index FPE / PEG (see Index entry check).

**MACD trend + RSI every run (Nov 11, 2026):** print MACD and RSI (14) per watchlist stock, with date and source. MACD: above its signal line / histogram rising = uptrend, below / falling = downtrend — state the MACD value and whether it is above or below zero. RSI: <30 = oversold, 30–70 = neutral, >70 = overbought. Columns: MACD | MACD trend (Up / Down) | RSI (14) | RSI state (Oversold / Neutral / Overbought). RSI oversold alone is not a buy — combine with the Lynch call: earnings hold = bounce candidate, earnings break = can stay oversold.

Reasoning is one line on why it fell — earnings, guidance, NVDA / hyperscaler news — follow the `tradingview-news` skill, name the source and date.

Recommendation is one word (BUY / HOLD / TRIM / SELL / DON'T ADD) + one line, built from the `stocks-report` skill — all three views, in that order:
1. **Lynch** — multiple compression (earnings up, price down = buy) or earnings break (earnings down = don't buy)? GAAP PEG, 2-minute story still hold?
2. **Whale flow** — follow the `whale-options-flow` skill: are whales buying calls for a recovery, or buying puts / hedging? That sets the ceiling / floor.
3. **Filings — 13F / PTR / OGE** — 13F is institutional only (Berkshire, Bridgewater); Congress files PTR, Trump files OGE 278-T. Are they adding, holding, or exiting? Filing exit + fall = trim early. Filing add + fall = buy signal.

Examples: `NVDA, -26.6%, -471d, Huang probe, HOLD — Lynch: earnings still hold, wait for Nov 17; Whales: Feb $195 calls; Filings: no exit yet` — `GOOG, -29.3%, -3d, capex rout, HOLD / TRIM into strength — Lynch: PEG 0.92 but FCF negative; Whales: 96% puts; Filings: Berkshire still holds 12.6%` — `COIN, -58.1%, -3d, Q3 miss, DON'T ADD — Lynch: earnings breaking, avoid`.

Corrections (verified Nov 11, 2026): NVDA days wiped out is 471d at the $178.67 Nov 9 close on the user's first-time-reached definition (first close at/above $178.67 was 28 Jul 2025, $181.74 — Yahoo daily closes; the 490d / ~7 Jul 2025 figure was wrong, 7–9 Jul 2025 closes were $164–165). The earlier 216d was the LAST time at that level (7 Apr 2026, $178.10) and 255d was an earlier last-time figure (27 Feb 2026) — both are superseded by the first-time definition. At the current $167.82 the first reach is 17 Jul 2025 (482d). GOOG is -29.3% from its own high $404.47, NOT -30.0% from GOOGL's $408.61.

Levels: -10% is a correction, -20% is a bear market, -25 to -35% is a deep bear market — often, but not always, with a recession (2022 was -25% with no recession declared). The reason matters more than the number.

## Index entry check — VOO / QQQ: is this a good time to buy? (Nov 11, 2026)

Every run, for VOO and QQQ, report forward P/E (FPE) and PEG = FPE ÷ forward EPS growth, with date and source:
- **S&P 500 / VOO:** FPE ≤17x = cheap / good entry; 17–19x = fair, buy in tranches; >20–22x = expensive. PEG <1 = cheap, 1–1.5 = fair, >2 = expensive. History: 10-yr avg 19.1x, 25-yr avg 16.4x; 2022 trough ~15x, 2008 low 8.6x. Nov 5–9, 2026: 17.7–18.0x.
- **Nasdaq-100 / QQQ:** FPE ≤19–20x = cheap / good entry; 20–23x = fair, buy in tranches; >25x = expensive. PEG <1 = cheap, 1–1.5 = fair, >2 = expensive. History: 10-yr avg ~23x, 5-yr avg ~24.5–24.7x; 2022 dip below 19x. Nov 9, 2026: 19.0–21.6x.
- **Drawdown entry levels (compute at run time from the 52-wk high):** -15% = good, -20% = great, -25%+ = generational. State the $ level: high × 0.85 / 0.80 / 0.75.
- Include the verdict line in the VOO / QQQ row (or, if below 15%, in the below-15% note): FPE, PEG, % down, and whether valuation and price both say buy. Valuation cheap + drawdown small = tranche in; valuation cheap + -15% drawdown = buy the index.

## Market drop vs single-stock drop (Nov 11, 2026)

- **Market down 15%+ (VOO / QQQ): buy the market, not a stock pick.** A broad -15% is usually multiple compression / fear, not one company's earnings breaking. Recommendation is BUY VOO / QQQ (in tranches: 1/3 now, 1/3 lower, 1/3 only if deeper), not a single stock.
- **One stock down 20–30% while the market is fine: that's a stock-pick moment.** Check why it fell first. If earnings / guidance still hold, it's Lynch-cheap — buy that individual stock. If earnings broke, don't buy it just because it's down.
- Apply this in the Recommendation column: a dropped VOO / QQQ row recommends the index; a dropped single stock row recommends that stock (or DON'T ADD / HOLD if its earnings broke).

If no ticker dropped to a level, say nothing. Never place an order.

## Privacy — this skill lives in a PUBLIC repo

Never put the user's net worth, portfolio total, holding $ amounts, holding %, share counts, or cost basis in this file. No user-specific numbers at all — not even as examples.
