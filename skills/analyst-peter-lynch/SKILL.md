# Peter Lynch Portfolio Analysis

This repo copy IS the canonical skill (dzianisv/skills, `skills/analyst-peter-lynch/`). It is self-contained: the framework and per-category checklists live in `references/lynch-framework.md`, the portfolio data routes in `references/portfolio-sources.md`. The slim copy in the workspace custom-skills folder points here and must never contradict this one.

## How verdicts are reached

A verdict on a name comes from working the book's procedure for that name, as distilled in `references/lynch-framework.md`: classify it into one of Lynch's six categories, run that category's checklist and the story test (the two-minute drill), and let the checklist's own buy and sell criteria produce the call. That procedure is the whole method — a verdict that did not pass through it is not this skill's verdict.

## Operating Rules
1. Every number is dated. An undated figure is a fabrication.
2. Never invent fundamentals. If a search returns nothing usable, mark the position UNVERIFIED.
3. State the period every figure covers (TTM, FY, quarter). A quarterly figure never stands in for an annual one.
4. Macro and index figures: confirm by a cited source or mark UNVERIFIED.
5. Analyst ratings are not Lynch reasons. A Zacks cut or consensus Reduce is never by itself a TRIM or ADD reason.
6. Crypto-exposed stocks (COIN, HOOD, CRCL) are never TRIM candidates — Den is bullish crypto. ETFs are out of scope entirely.
7. NO invented rules: the 30% AI-exposure cap, the AVGO "$290–300 buy zone", and the TSM "$415 stop / GM ≥67.7% condition" were Muse's inventions, never Den's — Den ordered them removed 2026-10-31. AI exposure % is reported as information only; it never vetoes an add or forces a trim. AVGO was reanalyzed 2026-10-30 (forward P/E ~18, forward PEG ~0.35, $179B backlog): add candidate on weakness, not a reject. The only AVGO item Den approved is a $300 price-alert ping. TSM has no stop, no alerts, no buy condition.
8. Den's parked positions (his decisions, 2026-10-31): ARE and CAG are HOLDS — no exit pending, no rush; revisit ARE after its Dec 2 Investor Day. CAG is NARROW-TRACKED (Den, 2026-10-31): alert only if selling becomes absolutely necessary (dividend cut, guidance collapse, distress) or the price rises to where his position is profitable per the sheet. Never raise the old $14.50 limit order. AAL is held as a named cyclical bet. Never present any of them as pending trims.

## Reflection log

- **2026-11-26 — a sell verdict was issued without the book's pass; a patch rule was added and removed the same day.** A sell-into-strength pass ran the Weinstein stage script on nine names but gave Lynch only one-line figures (summary cells, vendor PEG). PEP was called SELL INTO STRENGTH off its stage-3 chart plus a "fair multiple" aside. The full Lynch pass overturned it: 17.9× TTM sits below PEP's own 10-year band (21.9–31.6), the yield is 4.15%, and no slow-grower sell trigger (dividend cut, unsustainable payout, balance-sheet deterioration) is present — fundamentally a hold. The first fix was a numbered patch — "Operating Rule 9: no SELL/TRIM verdict on a single signal" — added here, with matching citations in analyst-weinstein, stocks-report and instagram-ai-hedgefund. Den removed it the same day: "why do we need this? we have to operate as defined in the book." He was right: the failure was not a missing rule, it was that the book's procedure (classify → category checklist → story test) was never run on the name. Rule 9 is deleted; verdicts here stand on the book's procedure alone, stated in "How verdicts are reached" above. The correction's Weinstein half, applied the same day: "a stage alone never issues a SELL" was also wrong — Weinstein's book defines its own sell (the first stage-3 close below the 30-week MA; stage 4 means be out, never average down), so the cross-references now present each book's call as its own, and the Lynch-picks-WHAT / Weinstein-vetoes-WHEN combination is named as Den's standing arrangement, not either book's rule. A full alignment audit of this skill against *One Up on Wall Street* ran with the same edit (PEG scale restored to the book's own — half the growth rate very positive, equal fair, twice very negative; a misattributed "diworseification" portfolio-count bullet and an unprovenanced doubling-down line removed from the framework).

## Available connectors
Use muse.connector_search to find the current connector docs before following recovered instructions.
