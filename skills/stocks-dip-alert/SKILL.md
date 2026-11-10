---
name: stocks-dip-alert
description: Daily dip alert for VOO, QQQ and the user's top holdings — notify only when a ticker drops 15%+ from its 52-week high, with % down, days of growth wiped out, and reasoning. Use when asked to "watch for a correction", "notify me when VOO / QQQ drops 20%", "show only what dropped", or to check a dip.
---

# Stocks Dip Alert

Daily check, after the US close, for a correction in the watchlist. Notify only when something dropped — never report tickers that did not drop.

## Watchlist

VOO, QQQ, GOOG, PLTR, AVGO, NVDA, META, MSFT, AMZN, COIN, ASML, BRK.B, TSLA.

## Daily run

Run every morning, ~08:48 WITA (Asia/Makassar), after the US close.

Each run:
- Pull the latest regular-session closes for each ticker, and their 52-week highs (with dates), from a live source (Finnhub via search, or the exchange / TradingView). Verify each price with the date; never reuse yesterday's price.
- Compute % down from the 52-week high: (high - price) / high.
- Compute days of growth wiped out: calendar days back from today to the last close at or below today's price, from daily candles — show the number AND the date, e.g. `255d (last at this level 27 Feb 2026)`. Never guess this number. Do NOT use a user-supplied number (e.g. 490d for NVDA) unless daily candles prove it — the verified NVDA lookback on 9 Nov 2026 was 255d, not 490d.
- Notify only when a ticker is down 15% or more from its 52-week high — starting at 15%, then again at 20% and 25% — or when it crosses any of those levels for the first time, or crosses back above a level after having been below it.

## Report format — only what dropped

Show ONLY the tickers that dropped to a level — one row per dropped ticker, no rows for tickers that did not drop.

`Ticker, -% down, -days of growth wiped out, reasoning, Recommendation`

Reasoning is one line on why it fell — earnings, guidance, NVDA / hyperscaler news — follow the `tradingview-news` skill, name the source and date.

Recommendation is one word (BUY / HOLD / TRIM / SELL / DON'T ADD) + one line, built from the `stocks-report` skill — all three views, in that order:
1. **Lynch** — multiple compression (earnings up, price down = buy) or earnings break (earnings down = don't buy)? GAAP PEG, 2-minute story still hold?
2. **Whale flow** — follow the `whale-options-flow` skill: are whales buying calls for a recovery, or buying puts / hedging? That sets the ceiling / floor.
3. **Filings — 13F / PTR / OGE** — 13F is institutional only (Berkshire, Bridgewater); Congress files PTR, Trump files OGE 278-T. Are they adding, holding, or exiting? Filing exit + fall = trim early. Filing add + fall = buy signal.

Examples: `NVDA, -26.6%, -216d, Huang probe, HOLD — Lynch: earnings still hold, wait for Nov 17; Whales: Feb $195 calls; Filings: no exit yet` — `GOOG, -29.3%, -3d, capex rout, HOLD / TRIM into strength — Lynch: PEG 0.92 but FCF negative; Whales: 96% puts; Filings: Berkshire still holds 12.6%` — `COIN, -58.1%, -3d, Q3 miss, DON'T ADD — Lynch: earnings breaking, avoid`.

Corrections (verified Nov 11, 2026): NVDA days wiped out is 216d (last close at/below $178.67 on 7 Apr 2026, $178.10), NOT 255d. GOOG is -29.3% from its own high $404.47, NOT -30.0% from GOOGL's $408.61.

Levels: -10% is a correction, -20% is a bear market, -25 to -35% is a deep bear market — often, but not always, with a recession (2022 was -25% with no recession declared). The reason matters more than the number.

If no ticker dropped to a level, say nothing. Never place an order.

## Privacy — this skill lives in a PUBLIC repo

Never put the user's net worth, portfolio total, holding $ amounts, holding %, share counts, or cost basis in this file. No user-specific numbers at all — not even as examples.
