---
name: whale-options-flow
description: Track whale / large options flow for a ticker — how much call and put premium was bought, at what strikes and expiries, and what price that implies. Use when asked "how do whales behave", "unusual options activity", "what are big traders buying", or to set a sell price from options flow. Daily, per ticker.
---

# Whale Options Flow

Track what large options traders did yesterday and today, and use it to read where they expect the price to go — not as a forecast, as a map of ceilings and floors.

## Sources — in this order

1. **SpotGamma / CNBC** — biggest single trades, with premium, strike, expiry, and breakeven. Search: `[TICKER] unusual options activity SpotGamma` / `CNBC massive trade [TICKER]`.
2. **OptionsBell** — live unusual flow, free, no login: `optionsbell.com/live-options-flow` and `/unusual-options-activity/[ticker]`. Ranked by Vol/OI, premium, strike, expiry.
3. **SquawkFlow** — gamma walls, max pain, put/call ratio by expiry: `squawkflow.com/ticker/[TICKER]`, `squawkflow.com/options-flow`.
4. **Unusual Whales** — top trades, volume/OI, historical volume per contract. Paywalled for detail, free for top prints.
5. **GTA Terminal / TradingKey** — institutional flow summaries, call/put premium split, biggest unusual trade of the day.
6. **StockVane / GreekSoup** — most active contracts, open interest by strike, priced move by expiry.

Cross-check a big trade in at least two sources before reporting it. A single Threads / Facebook post is not a source.

## What to pull, per ticker, per day

- Total options premium, call % vs put % (by premium, not by contract count).
- Biggest 3–5 trades: strike, expiry, premium $, contracts, buy/sell if known, breakeven price.
- Most active contracts today: strike, expiry, volume, open interest, Vol/OI.
- Call wall, put wall, max pain, zero-gamma level, for the nearest expiry and for the next monthly expiry.
- Put/call ratio by expiry range (1 week, 1–3 months).

## How to read it — for a sell price

- **Sell at R1 / gamma pin / first call wall** for a short-term exit. That's where a bounce stalls.
- **Sell at the whale call strike** for a longer exit — e.g. whales bought Feb $195 calls, breakeven $206: $195–206 is the whale ceiling, not today's exit.
- **Don't sell at max pain** — price gets pinned there. Sell just above it.
- **Don't sell at the put wall / floor** — sell above it, on the bounce back up.
- **Premium shows where money was paid, not who bought vs sold.** A call can be sold to collect premium, a put can be bought as a hedge. State direction as inferred, never as proven. Say so in every report.

## Daily report format — short

Ticker, price, total premium (calls $ / puts $ / %), biggest trade (strike, expiry, premium, breakeven), call wall / put wall / max pain, most active strikes today, and one line: what this implies for the user's sell limit — keep, lower, or raise, and why. No TLDR block at the start unless the user asks for one. Never place an order.

## Privacy — this skill lives in a PUBLIC repo

Never put the user's net worth, portfolio total, holding $ amounts, holding %, share counts, or cost basis in this file. No user-specific numbers at all — not even as examples.
