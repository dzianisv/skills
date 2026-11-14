---
name: smart-money-signals
description: The canonical resource list and weighting framework for smart-money signals — insider trading (SEC Form 4), congress trading (PTR, STOCK Act), hedge-fund 13F, options unusual activity, momentum, and company reports. Owns the data sources, the price rules, the warning definitions, and how each signal weighs into the final BUY / WAIT / HOLD / TRIM decision. Used by stocks-report, stocks-dip-alert and analyst-hedgefund — they point here, they do not duplicate it.
---

# Smart Money Signals — one canonical copy

Purpose: one place that says where every smart-money number comes from, what form it is filed on, how to get its price, and how much it weighs in the final decision. The three skills that use it — stocks-report (daily report), stocks-dip-alert (dip alert), analyst-hedgefund (deep dive) — point here and do not duplicate it. Change a rule here once and all three pick it up. If a skill's own section disagrees with this file, this file wins.

## Privacy — this skill lives in a PUBLIC repo

Never put the user's net worth, portfolio total, holding $ amounts, holding %, share counts, or cost basis in this file. No user-specific numbers at all — not even as examples.

## Resource list — where every number comes from

- **Company insiders — SEC Form 4** (Statement of Changes in Beneficial Ownership). Source: SEC EDGAR — sec.gov/edgar — via yfinance `insider_transactions`. Due within 2 business days of the trade. Price: EXACT price per share — Form 4 discloses it. Open-market sales / buys only; grants, gifts and option exercises excluded.
- **Congress (Pelosi and others) — PTR** (Periodic Transaction Report, STOCK Act). Congress does NOT file Form 4 — Form 4 is for company insiders only; congressmen file PTRs with the House Clerk / Senate Secretary. Sources: Capitol Trades — capitoltrades.com (free, every trade, dedicated Pelosi page) — primary. Quiver Quantitative — quiverquant.com/congresstrading (free tier). GetMarketAlerts — getmarketalerts.com/trades/nancy-pelosi/portfolio. Official: House Clerk disclosures — disclosures-clerk.house.gov. Lag: 30–45 days by law — no tracker is real-time. Price: NO exact price — filings give amount RANGES. Price = market close on the trade date (say so). Trackers disagree by method (ranges vs counted-buys) — never quote one tracker's % as the only truth.
- **Hedge funds / institutions — 13F** (Form 13F-HR). Source: SEC EDGAR — sec.gov/edgar (search by CIK / fund name, form 13F-HR). Berkshire CIK 1067983, Bridgewater 1350694, Thiel 1562087. Lag: quarterly, due 45 days after quarter-end — the position is 45–135 days old. Price: NO price — 13F gives positions only. Price = quarter-end close. Always state the position date and the age in days.
- **Options unusual activity.** Source: yfinance options chains; SpotGamma / OptionsBell / SquawkFlow. Pull AFTER the open or after the close, when live quotes exist — pre-market pulls are empty (zero quotes / OI). If empty, say so with the pull time, never invent a level. Walls / max pain / straddle breakevens from the live chain. Unusual activity = large prints vs open interest. Volume is activity, never direction — follow the `whale-options-flow` skill.
- **Prices, 52-week highs, daily candles.** Source: Finnhub (via search), TradingView, exchange; yfinance as a fallback. Always verify the price with its date. Current price only, never a stale close.
- **Forward P/E, forward EPS, PEG.** Source: stockanalysis.com; GuruFocus — gurufocus.com/term/forward-pe-ratio/<TICKER> (quarterly forward P/E history). GAAP EPS first; if only non-GAAP, say so and name the distortion.
- **Momentum / trend.** Computed internally from daily candles (MACD histogram = momentum, price vs 50-day = trend). Words only (Rising / Falling / Flat + Strong / Weak; Uptrend / Downtrend / Sideways). Never print MACD numbers.
- **Company reports — 10-K, 10-Q, 8-K, earnings releases.** Source: SEC EDGAR — sec.gov/edgar — and the company's investor-relations page. Filed numbers only, labelled FILED.
- **News.** Follow the `tradingview-news` skill, name the source and date.
- **Sentiment.** Polymarket — sentiment only, never a buy signal, never bet.

## Price freshness — never judge today's dip on an old price (Nov 13, 2026 — user: a price older than 15 days can hide a dip)

- A reference price older than 15 days is never used to judge the current dip, the buy moment, or the hold-at-all call. The stock can fall a lot in 15 days — an old price hides the dip.
- 13F and PTR prices are always older than 15 days (45-day and 30–45-day filing lags). For those signals use the direction only (bought / added / exited) plus the date — never the old price vs today's price.
- Only Form 4 prices (filed within 2 business days) and live prices are fresh enough for price comparisons. The INSIDER WARNING price comparison is safe — Form 4 prices are at most 2 business days old.

## Weighting — how each signal counts in the final decision

The final decision (BUY / WAIT / HOLD / TRIM / DON'T ADD) is built from gates, not a score. A gate that fails stops the decision; confirmations strengthen it.

### Gates — all must pass for BUY

1. **Lynch (decides WHAT) — veto power.** PEG cheap (<1 on GAAP) + earnings hold + story still true. If the Lynch layer says NO — thesis broken, earnings breaking, PEG > 2 with no growth story — the answer is NO BUY, whatever the chart, the options flow or any smart-money signal says. This is the heaviest weight: a veto, not a vote.
2. **Momentum turn (decides WHEN) — timing gate.** Price back above the 50-day + momentum Rising = the turn happened. The MACD line above zero is the confirmation that makes the turn strong — a turn with the line still below zero is in progress, not yet confirmed. A rising histogram with the MACD line still below zero AND price below the 50-day is a rebound inside a downtrend, not a turn (five of six names, Nov 13, 2026: histogram Rising, line below zero, price below the 50-day — momentum Rising, trend Downtrend). Correction (Nov 13, 2026): the first version of this gate required the MACD line above zero for any turn — that overstates the evidence, which only covers the price-below-50-day case; a price turn above the 50-day with the line still below zero is a turn in progress, and the line crossing above zero confirms it. Momentum still Falling + price below the 50-day = no turn yet — cheap on PEG alone is never a buy moment. The turn can delay a good buy; it can never rescue a bad business.
3. **No insider warning — veto.** An INSIDER WARNING (see Definitions) blocks BUY, whatever the PEG and trend say. It is also a TRIM trigger for a held position.
4. **No congress exit — veto.** A tracked congressman exiting a held position blocks BUY. A congressman still holding or adding is confirmation, never a buy reason on its own.

### Confirmations — strengthen a BUY, never make one alone

- **Insiders buying (cluster) — strongest confirmation.** Officers / directors buying in a cluster, at prices near or above the current price, with their own money. One insider buy is a signal; a cluster is a strong one.
- **Congress adding / holding — medium confirmation.** A tracked congressman adding or still holding says the stock still makes sense to hold. Discounted by the 45-day lag and by ranges (no exact price).
- **13F adding — medium confirmation, discounted by age, direction only.** A fund adding in the latest filing. The older the position, the weaker the signal — a 13F add from last quarter is a weak signal; state the age in days. Never compare the quarter-end price to today's price — it is stale (see Price freshness).
- **Options flow — timing confirmation only.** Whales buying calls for a recovery (not puts) confirms the entry; put walls set the floor. It never makes a BUY by itself and never vetoes one.

### TRIM / SELL triggers — any one fires it

- Thesis broke / earnings break (the "what would change my mind" trigger fired).
- INSIDER WARNING.
- Two or more smart-money sources exiting in the latest filing — or one source exiting while the stock falls.
- PEG > 2 while the price is still near its high.
- Position too big (>10% of the portfolio, or correlated names >15%).

### The final decision — the recipe

- **BUY** = Lynch YES + momentum turned + no insider warning + no congress exit + (at least one confirmation, or your own research confirms it — smart money is a signal, not a gate).
- **WAIT** = Lynch YES but momentum not turned, or a smart-money warning present.
- **HOLD** = Lynch YES, no sell trigger, momentum not turned — or a buy you already own with no reason to exit.
- **TRIM / SELL** = any TRIM / SELL trigger above, with the reason, the size and the level.
- **DON'T ADD** = expensive (PEG > 2) or earnings breaking, regardless of trend.

## Plain English, no idioms (Nov 14, 2026 — user: "I don't understand this language")

Write every line in plain English. No idioms, no slang, no figures of speech. Never write "survived by a hair", "turn is back on", "flips", "by a hair", "knife's edge", or anything like them. Say it with numbers: the price, the 50-day average, the gap in $ and %, and what changes the decision. If a sentence needs an idiom to make sense, rewrite it without one.

**No unexplained jargon (Nov 14, 2026 — user: "multiple compression and leadership discount" is fluff):** never write "multiple compression", "leadership discount", "de-rating", "re-rating", "multiple expansion", or any other finance jargon without explaining it in plain words with numbers. Write it like this: "the price fell 33% from $243.37 to $162.85, while earnings for this quarter are expected to grow about 90% from last year — the company earns more, but the stock costs less" and "the price is lower because the CEO resigned and no successor is named". Every stock's view is plain words with numbers, no jargon, and ends with a clear action line — "Action: ..." — what to do, how many shares, at what price.

## Entry price — every WAIT names its price (Nov 14, 2026 — user: "wait for what? What price do I have to wait for?")

Never write WAIT without the price you are waiting for. Every WAIT verdict carries one reasoned entry price in $ with its reason in a few words — put wall, straddle low, recent low, and the FPE / PEG at that price. The price comes from the analysis, not from a round number: the put wall with the most open interest, the straddle low breakeven for the nearest expiry, the recent low where buyers stepped in, and the valuation at that price.

## Definitions

- **INSIDER WARNING (Form 4, SEC EDGAR):** total open-market sales ≥ $50M in the last 6 months AND the average sale price ≥ 15% above the current price — they sold near the top while the stock fell. The warning line must read "INSIDER WARNING (Form 4, SEC EDGAR)". Report every open-market transaction with its price per share and the price vs the current price. A sale count without prices is not enough. **Never state the warning without the facts (Nov 14, 2026 — user: a bare warning is fluff without facts):** never write "the warning stands" alone. Every time the warning is stated, include the facts — how many open-market sales, total $ sold, who sold most of it, the sale price range, and how far above the current price in % and $. Why 15%: a sale 15% above the current price means the stock fell ~13% after they sold — a correction-sized move, aligned with the −15% dip level. It separates real top-selling (NVDA +26–39% above today's price, Nov 2026) from routine selling near today's price (AVGO +3–10%) and selling before the run (AMD −5–26% below). Why above the current price: sold above today's price means they avoided the fall; sold below it means they sold before the run — not a warning. Why $50M: a size filter — it keeps small routine sales (a director selling a few $M) out and catches only meaningful exits. The 15% is a calibration from those three cases, not a law — change it here if a different threshold fits better. Clearance — the warning turns OFF when (a) insiders buy open-market (a cluster buy is the strongest all-clear), or (b) the next earnings report confirms the business (no earnings break, no guidance cut) — the warning's job is "don't buy before the facts are known", and earnings are the facts; or (c) the sales age out of the 6-month window. A fall alone does not clear it — the fall is already in the price, and a stock can fall 30% twice. The warning is not a prediction of further decline; it is a veto on buying the dip while the people closest to the company are not buying it themselves.
- **Congress exit:** a tracked congressman sold or closed a position in the latest PTR, or their holding fell to zero in the latest filing. State the trade date, the market close that day, and the filing date.
- **Congress buy price:** PTR gives amount ranges, not exact prices — the price is the market close on the trade date. Say so. Never present a range midpoint as an exact trade price. This price is for context only (whether the position is in profit or underwater) — never for the buy-moment call: it is always older than 15 days (see Price freshness).
- **13F price and age:** 13F gives positions, not prices — the price is the quarter-end close. Always state the position date (quarter-end) and the age in days. The quarter-end close is for context only — never compare it to today's price for the buy-moment call: it is always older than 15 days (see Price freshness).

## Filings view — Form 4 timeline + 13F + PTR per stock (Nov 13, 2026 — user: show 13F, Form 4 and PTR forms and prices per stock)

Every deep dive ships one Filings tab per analysis, plus the timeline chart as its reading view. Three forms, three price rules — never mix them:

- **Form 4 (company insiders) — the timeline.** Source: SEC EDGAR via yfinance `insider_transactions`, open-market only, last 6 months. Table: date, insider, position, buy/sell, shares, price per share (exact, from the filing), value, price vs latest close %. Chart: one panel per stock — daily close line, sales as red dots sized by value, buys as green dots, dashed line at the latest close, largest sale annotated (insider, price, value). Dots above the dashed line = sold before the fall; below it = sold before the run; on it = sold near today's price. The full table lives in the sheet's Insiders tab; the chart is its reading view, built by `skills/analyst-hedgefund/scripts/build_insider_timeline.py` (matplotlib). The same chart also carries the PTR congress trades (purple up-triangles = buys, orange down-triangles = sells, price = market close on the trade date) and the 13F snapshot line (top-5 funds combined %, position date, top holder) — 13F has no trade dates or prices, so it is a snapshot line, never dots.
- **13F (funds) — top holders.** Source: SEC EDGAR Form 13F-HR (stockanalysis.com statistics pages as a shortcut). Table per stock: top 5 funds, shares held, % of shares outstanding, position date (quarter-end). Price: NONE — 13F gives positions only. The quarter-end close is context only, never compared to today's price (always older than 15 days — see Price freshness).
- **PTR (congress) — trades.** Source: Capitol Trades (primary), Quiver Quantitative, GetMarketAlerts; official: House Clerk disclosures. Table per stock: member, chamber, buy/sell, trade date, amount range as filed, market close on the trade date, filing date. Price: the market close on the trade date — PTR gives amount ranges, never an exact price; never present a range midpoint as an exact trade price. If a stock has no PTR trades, say so — never invent one. Lag 30–45 days by law — no tracker is real-time.
- **Maintenance (Nov 13, 2026):** refresh the Filings tab after each 13F season — filings are due 45 days after quarter-end (mid-Feb / mid-May / mid-Aug / mid-Nov). A Filings tab older than one season is stale; state the position date on every 13F line. **PTR parser quirks:** `buy_sell` values are mixed case ('buy'/'Buy'/'sell'/'Sell') — always compare case-insensitively; `amount_range` mixes hyphen and en-dash separators and $/K/M formats ('$1,001-$15,000', '$1K–$15K', '$1M–$5M') — split on [-–—] and handle K/M suffixes.

## What the established strategies use (Nov 13, 2026 — user: where do numbers like 15% come from?)

Provenance — read this first: only two of these numbers come from peer-reviewed research. The rest are practitioner rules of thumb (round numbers chosen by data vendors and newsletters, not derived from a study). Both are written down here, labelled.

- **Cluster buying — the strongest signal. [Academic]** 3+ distinct insiders buying open-market within 30 days (some use 14 or 90 days), no offsetting sales, 10b5-1 and option exercises excluded. Lakonishok & Lee (2001) — heavy insider buying beat heavy selling by ~7.5%/yr over 20 years; Jagolinzer, Larcker & Taylor (2012, Journal of Finance) — cluster purchases preceded ~8.9% 12-month excess returns; ~14.2% in beaten-down stocks (Opportune Analytics backtest 2010–2023, practitioner, not peer-reviewed). Cluster selling = 3+ sellers in 14 days.
- **Opportunistic vs routine. [Academic — Cohen, Malloy & Pomorski 2012, Journal of Finance]** Routine = traded in the same calendar month for 3 consecutive prior years. Opportunistic = everyone else with ≥1 trade in each of the 3 preceding years. Opportunistic trades carried the predictive power (~0.82%/month value-weighted); routine trades earned ~nothing. Caveat: a 2020–2025 replication (47,458 purchases) did not reproduce the split — the signal may have weakened in recent data.
- **% of holdings. [Practitioner rule of thumb — NOT research]** Selling >25% of an insider's holdings = warning (Lician); CEO/CFO selling >50% = severe red flag (InvestAnalyst skill); buying that grows holdings by 10%+ = attention, 25%+ = exceptional (datatobrief). Form 4 shows post-transaction holdings (Table I, final column) — the % is computable from the same filing. These are round numbers chosen by practitioners, not thresholds from a study.
- **Notable-sale filters. [Practitioner — Altamira Insider Digest, Nov 2026]** A C-suite sale ≥$1M, any sale ≥$10M, or a sale ≥25% of the seller's stake trips the filter. Transaction size >$1M is notable. A newsletter's screening rule, not research.
- **Our 15% price gap. [Ours — calibration from 3 cases, Nov 2026]** No established strategy uses "sale price vs current price" as the threshold. It is our own timing measure (did they sell before the fall?). Keep the 15% gap as a timing check; add % of holdings and cluster selling as warning triggers if the rule is extended.

## Research references — why we decide like this (Nov 13, 2026 — user: every decision must be able to answer "why, based on what?")

Rule: every metric below carries its source, labelled. [Academic] = peer-reviewed study; [Book] = Lynch's own writing; [Practitioner] = a backtest or vendor rule, not a study; [Convention] = a market-wide definition; [Ours] = our calibration. A number with no source is labelled as such — never present a calibration as research. When Den asks "why do you think so?", answer with the reference on this page.

- **PEG. [Book] Peter Lynch, One Up on Wall Street (1989):** "the P/E ratio of any company that's fairly priced will equal its growth rate" — PEG 1 = fair, <1 cheap, <0.5 very cheap, >2 avoid. The ratio is credited to Mario Farina (1969). [Academic — mixed] Peters (1991): lowest-PEG portfolio $1 → $15.36 (1982–89) vs S&P $3.56; Easton (2004): PEG rankings track expected-return rankings; Sun (2001): inverted U — low- and high-PEG both earned less than the middle. [Practitioner backtest] Motilal Oswal Wealth Creation Study 2018 (India, 4,015 cases 1998–2015): PEG <1 beat the index by 19% over 3 years, <0.5 by 26%, >1.5 lagged, >3 trailed by 10% — but it used growth actually achieved, not forecast. Limits: Damodaran — forward P/E + growth from this year's EPS double-counts year 1; buybacks inflate EPS growth; PEG says nothing about debt, earnings quality or return on capital.
- **Earnings growth. [Book] Lynch:** earnings drive prices over the long term; the story must be "earnings will grow". [Academic — the warning] Chan, Karceski & Lakonishok (2003, Journal of Finance): "no persistence in long-term earnings growth beyond chance" — analyst forecasts are overly optimistic and add little predictive power. Fama & French (2000): profitability mean-reverts ~40% per year. Mauboussin base rates: <1 in 11 companies above $6B revenue sustained 15%/yr for 5 years; no company above $100B sustained mid-teens growth for a decade. Why it matters: a PEG <1 built on extrapolated past growth is the trap — use conservative growth, demand a mechanism (contracts, backlog, a new product), never a streak.
- **Value — cheap on P/E. [Academic] Fama & French (1992, Journal of Finance; 1993, Journal of Financial Economics):** value stocks outperform growth — the three-factor model (market, size, value). Basu (1977): low-P/E stocks outperform. Profitability: Novy-Marx (2013) gross profitability premium; Fama & French (2015) five-factor model adds profitability (RMW) and investment (CMA) — the backing for the cash-vs-reported-earnings and quality checks.
- **Momentum / trend — timing gate, not valuation. [Academic] Jegadeesh & Titman (1993, Journal of Finance):** winners over the past 3–12 months keep winning over the next 3–12 months; Carhart (1997) added momentum (UMD) to the factor model; long-run UMD ~7.2%/yr (French data library). Caveat: momentum crashes — worst month April 2009 −34% (Daniel & Moskowitz 2016). The 50-day average is [Practitioner convention] (StockCharts: 50-day = medium-term trend, 200-day = long-term); no paper says "50-day" — the academic version is 12-month momentum. Momentum tells you WHEN, never WHAT — never buy on momentum alone.
- **Dip levels. [Convention] −20% = bear market, −10% = correction (Investor.gov / FINRA:** a broad index falling 20%+ over at least two months). Our −15% / −25% levels are [Ours] — −15% sits between correction and bear, −25% is deep-bear territory. Not research-derived.
- **Lynch's six categories. [Book] Lynch, One Up on Wall Street (1989):** Slow Growers, Stalwarts, Fast Growers, Cyclicals, Turnarounds, Asset Plays. The per-class PEG bands in the analyst-hedgefund skill are [Ours] — Lynch never published per-class PEG bands; he said slow growers are bought for yield, cyclicals on low P/E at the bottom of the cycle.
- **Hedging (collar). [Ours]** Not a Lynch metric and not a return signal — it caps the loss and caps the gain; the cost is the option premium. Buy it to sleep, not to earn.
- **Insider signals.** See "What the established strategies use" above — same provenance labels.

## How the three skills use this file

- stocks-report (daily report), stocks-dip-alert (dip alert) and analyst-hedgefund (deep dive) point here for every smart-money source, weight and warning. They do not duplicate these rules.
- Each skill keeps only its own wiring: where the warning appears in its output, what its own decision section checks, and its own format.
- If a rule here changes, change it here once. Do not edit the same rule in the three skills — that is how they drift.
