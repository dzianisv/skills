# Portfolio — data sources for the daily review

The holdings live in one Google Sheet, one tab per brokerage account. The spreadsheet ID is private: it is kept only in the workspace (non-repo) copy of this skill. Read it from there at run time; never write it, position sizes, or cost basis into this repo.

## Tabs that matter for the stock review

| Tab | Contents | How to read |
|-----|----------|-------------|
| `Robinhood` | Main equity positions: Symbol, Quantity, Type, Cost Basis, Price, USD, PnL, Fair Market Value. Individual stocks + index/sector ETFs. | `hatch_gws_cli sheets spreadsheets values get --params '{"spreadsheetId":"<id>","range":"Robinhood!A1:H50"}'` |
| `Fidelity` | Brokerage plus retirement accounts (Traditional IRA, Roth IRA, HSA). Mostly ETFs and bonds — out of scope except equity tickers. | `Fidelity!A1:H60` |
| `Chase` | Brokerage positions, including COIN. Crypto-exposed: never TRIM. | `Chase!A1:H20` |
| `Brokerages` | Employer stock plan (COIN) plus a small second brokerage (fractional positions, ignore). | `Brokerages!A1:H30` |
| `Plan` | Recurring auto-invest schedule. Context for what the "auto-pilot" is buying. | — |
| `Crypto`, `DeFi` | Token positions — out of scope for the stock skill. | — |
| `Totals` | Portfolio-wide allocation snapshot. Context only. | — |

## Reading pattern

Read `Robinhood` first, then `Chase` + `Brokerages` for COIN exposure, then `Fidelity` for the equity slivers. All reads are cheap; values refresh on the user's own update cadence. Prices in the sheet may lag — always cross-check today's price via `browser.search` (finance vertical) before any verdict.
