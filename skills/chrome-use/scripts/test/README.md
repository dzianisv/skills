# chrome-use eval suite

A golden test set that proves chrome-use actually drives a browser. Zero dependencies
— Node's built-in `node:test`, run via native TypeScript.

```bash
cd skills/chrome-use/scripts
npm test                  # or: node --test test/unit.test.ts test/evals.test.ts
```

## What runs

- **`unit.test.ts`** — pure functions, no browser: argv parsing, `DevToolsActivePort`
  parsing, selector classification. Fast.
- **`evals.test.ts`** — black-box end-to-end against the **real CLI**. 20 golden cases
  covering: open / back / forward / reload, `snapshot -i` and full (exact golden trees),
  `snapshot --json` / `-s`, `@e1` / CSS / `text=` selectors, stale-ref error, `get`,
  `fill` (exact value), `Control+a` editor chord, trusted `type`+`click`, checkbox toggle,
  `scroll`, `wait` (ms/selector/text), `eval` (value + exception), `screenshot` (PNG),
  `cookies`, and `tab` new/list/close.

## Hermetic harness (`harness.ts`)

Each run is fully isolated and never touches your real Chrome:

1. launches a **throwaway headless Chrome** (own temp profile, `--remote-debugging-port`,
   so there is **no approval dialog**),
2. serves `fixtures/*.html` from a **local zero-dep HTTP server**,
3. starts the chrome-use **proxy** pointed at that Chrome via `CHROME_USE_WS_ENDPOINT`,
   on a unique socket + active-tab file,
4. exposes an **async** `cu(...)` runner (must be async — the fixture server shares this
   process, so a blocking child would deadlock any navigation), and tears everything down.

### Environment overrides

- `CHROME_USE_TEST_BIN` — path to the Chrome/Chromium binary (default `/snap/bin/chromium`).
- `CHROME_USE_TEST_PROFILE_ROOT` — where throwaway profiles are created (snap builds must
  use a path under the snap home; defaults handle `/snap/` automatically).

## Fixtures

Static, deterministic pages so golden snapshot trees are exact: `index.html` (links),
`form.html` (input + checkbox + submit button that echoes the value into the title),
`content.html` (heading/paragraph/link), `dynamic.html` (element + text appear ~600ms
after load, for `wait`).
