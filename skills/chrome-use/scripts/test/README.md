# chrome-use eval suite

A golden test set that proves chrome-use actually drives a browser — **my-browser
style**: it exercises the real connection path (DevToolsActivePort autoConnect), not a
`--remote-debugging-port` instance. Zero dependencies (Node's built-in `node:test`).

```bash
cd skills/chrome-use/scripts
npm test                  # or: node --test test/unit.test.ts test/evals.test.ts
```

## Requirements

The eval suite drives your **real running Chrome** through the chrome-use proxy:

- Chrome running with remote debugging allowed (`chrome://inspect/#remote-debugging` →
  Allow). The first run auto-starts the proxy and may show the approval dialog once.
- It is **not isolated and not CI-runnable** — that's the my-browser model (a real,
  approved browser). It is safe, though: every test runs in a **dedicated tab it
  creates and closes**, identified by a `cufix` marker, so your own tabs are never
  touched and the proxy is never stopped.

## What runs

- **`unit.test.ts`** (8) — pure functions, no browser: argv parsing,
  `DevToolsActivePort` parsing, selector classification. Fast.
- **`evals.test.ts`** (19) — black-box end-to-end against the real CLI: open /
  back / forward / reload, `snapshot -i` and full (exact golden trees),
  `snapshot --json` / `-s`, `@e1` / CSS / `text=` selectors, stale-ref error, `get`,
  `fill` (exact value), `Control+a` editor chord, trusted `type`+`click`, checkbox
  toggle, `scroll`, `wait` (ms / selector / text), `eval` (value + exception),
  `screenshot` (PNG), and `tab` new/list/close.

## Fixtures are `data:` URLs (host/VM safe)

Chrome may run on the host while the harness runs on a VM, so a VM-served
`http://127.0.0.1` origin is unreachable by the browser. Fixtures in `fixtures/*.html`
are therefore loaded as **`data:` URLs** (rendered entirely in the browser, no network).
Each fixture carries a `cufix` marker so the harness only ever closes its own tabs, and
uses absolute hrefs so snapshot URLs stay deterministic.

## Not covered automatically

- **`cookies`** — needs a real http(s) origin, which `data:` URLs can't provide and a
  VM-served origin can't reach the host browser. Verify cookie set/list/clear manually.
