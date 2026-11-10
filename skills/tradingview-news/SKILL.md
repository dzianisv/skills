---
name: tradingview-news
description: Pull correct, verified news for a stock ticker. Use when asked to "check the news", "what happened to NVDA / GOOG", "why did it fall", or in any hourly/daily watch that reports news. Primary source is TradingView's ticker news feed, cross-checked against a second source before reporting.
---

# TradingView News

Pull news for a ticker correctly — fast, filtered by ticker, and verified before reporting it.

## Primary source

TradingView ticker news feed, one feed per ticker:
- `tradingview.com/symbols/NASDAQ-GOOG/news/`
- `tradingview.com/symbols/NASDAQ-NVDA/news/`
- Replace the ticker / exchange in the URL for any other stock.

It aggregates Benzinga, Reuters, Bloomberg, WSJ, company press releases, and SEC filings in one feed, filtered by ticker — no noise from other stocks.

## Cross-check before reporting

Never report a market-moving item from a single source. Cross-check it against a second source first:
- **Earnings / guidance speed:** Benzinga
- **Macro / hyperscaler capex:** Bloomberg
- **Earnings, guidance, investigations:** the company's own press release, or its SEC filing

Do NOT report a headline from a single social post, a rumour blog, or an unverified aggregator snippet.

## What to report

- Only news that affects the thesis or the order: earnings, guidance, investigations, capex cuts, customer / chip moves, CPI / market moves.
- Name the source and the time with every item.
- Ignore price-only noise with no news behind it.
- If nothing material happened, say nothing — do not fill the silence with stale headlines.

## What not to do

- Never invent a source, a time, or a quote.
- Never place, change, or cancel an order based on news alone — report it, and let the user decide.
