# Stan Weinstein Stage Analysis

This repo copy IS the canonical skill (dzianisv/skills, `skills/analyst-weinstein/`). It is self-contained: the framework and all stage criteria live in `references/weinstein-framework.md`, the computation in `scripts/stage_check.py`. The slim copy in the workspace custom-skills folder points here and must never contradict this one.

## When to use it

Timing questions only:

- "Is this drop a dip or a falling knife?"
- "The fundamentals say buy — is now the time, or is the downtrend still in charge?"
- "When would this downtrend become buyable?"
- Stage calls on the market, a sector, or a single stock.

For what a company is worth — earnings, PEG, balance sheet, cycle position in the business sense — use the fundamentals skills (analyst-peter-lynch, analyst-hedgefund). Weinstein reads none of that, on purpose.

## The layer rule (read first)

This layer judges **TIMING only — it never overrides a fundamentals verdict, it sequences it.**

- Fundamentals decide **WHAT** deserves capital. Weinstein decides **WHEN** capital moves.
- A stage-2 breakout does not make a bad business buyable — Weinstein has no view on the business. Weinstein's sell is his own, stated as the book states it: the first stage-3 weekly close below the 30-week MA is the sell; stage 4 means be out, never average down. The call is a timing call, not a value call; whether the portfolio acts on it against a fundamentals verdict is the portfolio's standing arrangement, not a Weinstein rule.
- When the layers conflict (fundamentals say buy, chart says stage 4), the honest output is both verdicts side by side with the tension named — not a blend, and not one layer silently winning. The portfolio's standing compromise (small limit tranches into weakness) is a portfolio rule, not a Weinstein rule, and must be labeled as such when it is used.
- Wired into the daily report (stocks-report skill, 2026-11-23): every row carries its stage call, stated as the book states it — the first stage-3 close below the 30-week MA is Weinstein's sell, stage 4 means be out, never average down. The report's combination (a stage-4 call caps the row at no-add and flags the exit as a timing call, a stage-3 call blocks adds) is Den's standing arrangement for merging the two layers, not a Weinstein rule.

## Workflow — forest, trees, leaves

1. **Market:** stage-check the index first (`stage_check.py` prints it automatically). A stage-4 market vetoes new longs regardless of what follows.
2. **Sector:** stage-check the stock's group/sector index. Stage-2 stocks in stage-4 groups are downgraded.
3. **Stock:** run the five inputs (price vs MA, MA slope, volume signature, RS, support/resistance) and state each one's value before the stage label.
4. **Apply the checklists** in `references/weinstein-framework.md`: buy checklist for entries, stop/sell rules for holdings, precision rule for labels.

## Computation

```bash
~/workspace/.venv-stocks/bin/python scripts/stage_check.py NVDA GOOG
```

Prints, per ticker plus the index (SPY) first: last weekly close, 30-week MA, price vs MA %, MA slope over 10 weeks, up/down-week volume averages (12w), RS vs the index (26-week change + position vs its 52-week average), distance from the 52-week high, and the mechanical stage call per the framework's operational definitions. Definitions are fixed in the framework file so every run — script or hand call — is identical.

## Operating Rules

1. Every number is dated; the stage call names the week of the last close used. An undated stage call is a fabrication.
2. Weekly closes only. A stage is never called off a daily chart or an intraday move.
3. State all five inputs before the label. A label without its inputs is an opinion, not an analysis.
4. Precision rule: price below a still-rising 30-week MA is "late stage 3 transitioning to 4", never "stage 4". Stage 4 requires a declining MA. (NVDA, 2026-11-23: the action was the same, the first label was wrong.)
5. The percentage fallen is never an argument. −30% is a dip in stage 2 and a knife in stage 4; the stage, not the percentage, decides.
6. No portfolio data in this skill. Holdings, sizes and cost basis live in the fundamentals skills' private sources; this skill works on any ticker from market data alone.
7. Never invent a criterion. If a Weinstein rule cannot be sourced from the book with confidence, it is flagged as uncertain, not sharpened into a fake number.
