---
name: mermaid2excalidraw
description: Convert Mermaid diagrams (sequenceDiagram, flowchart, graph) into native Excalidraw elements (rectangles, arrows, text) and merge them into an existing `.excalidraw` file. Use when asked to "convert mermaid to excalidraw", "add diagram to excalidraw", "migrate mermaid diagram", "add this mermaid to the mindmap", or "convert .mmd to excalidraw".
---

# Skill: Mermaid → Excalidraw Conversion

## Description
Convert Mermaid diagrams (sequenceDiagram, flowchart, graph) into native Excalidraw elements
(rectangles, arrows, text) and merge them into an existing `.excalidraw` file.

## Trigger Phrases
- "convert mermaid to excalidraw"
- "add diagram to excalidraw"
- "migrate mermaid diagram"
- "add this mermaid to the mindmap"
- "convert .mmd to excalidraw"

---

## How It Works

The official `@excalidraw/mermaid-to-excalidraw` package requires a real browser DOM
(`getBBox` from mermaid.js). The pipeline is:

1. **Headless Chrome** (via puppeteer-core) loads a minimal HTML page
2. The bundled JS (`bundle.js`) calls `parseMermaidToExcalidraw()` → skeleton elements
3. `convertToExcalidrawElements()` converts skeleton → full valid Excalidraw elements
4. `merge.py` appends those elements to an existing `.excalidraw` file with valid fractional indices

---

## Prerequisites (one-time setup)

```bash
cd ~/.agents/skills/marmaid2excalidraw/scripts
bash setup.sh
```

This installs npm deps and builds `bundle.js` (~15MB). Requires Google Chrome installed.

---

## Step-by-Step Instructions

### 1. Write diagram(s) to `.mmd` files

```bash
cat > /tmp/mydiagram.mmd << 'EOF'
flowchart TD
  A[Start] --> B{Decision}
  B -->|yes| C[Do thing]
  B -->|no| D[Skip]
EOF
```

### 2. Convert to Excalidraw elements JSON

```bash
cd ~/.agents/skills/marmaid2excalidraw/scripts
node convert.mjs /tmp/mydiagram.mmd -o /tmp/converted.json
```

Multiple diagrams at once:
```bash
node convert.mjs /tmp/seq.mmd /tmp/arch.mmd -o /tmp/converted.json
```

### 3. Merge into an existing `.excalidraw` file

```bash
python3 ~/.agents/skills/marmaid2excalidraw/scripts/merge.py \
  ~/myDocuments/myfile.excalidraw \
  /tmp/converted.json \
  -o ~/myDocuments/myfile-with-diagrams.excalidraw
```

Diagrams are placed side-by-side below the existing canvas content.
Use `--gap N` to control spacing (default: 200px).

### 4. Verify in browser

Open `https://excalidraw.com` → File → Open → select the output file.

---

## Key Technical Constraints

### Fractional Index validity (CRITICAL)
Excalidraw uses the `fractional-indexing` library which **rejects keys whose decimal part ends in `'0'`**.

- ❌ Invalid: `z00010`, `z00020`, `z00100` (last char is `'0'`)
- ✅ Valid format used: `c0XX` where last char is never `'0'`
- The `merge.py` script handles this automatically via `gen_indices()`

### Element schema
All elements must have these fields:
```
id, type, x, y, width, height, angle, strokeColor, backgroundColor,
fillStyle, strokeWidth, strokeStyle, roughness, opacity, groupIds,
frameId, index, roundness, seed, version, versionNonce, isDeleted,
boundElements, updated, link, locked
```
Plus type-specific fields: arrows need `points, startBinding, endBinding, startArrowhead, endArrowhead`;
text needs `text, fontSize, fontFamily, textAlign, verticalAlign, containerId, originalText, autoResize, lineHeight`.

### Two-step conversion (skeleton → full)
`parseMermaidToExcalidraw()` returns **skeleton elements** (intermediate format) — NOT valid
Excalidraw elements. You MUST pass them through `convertToExcalidrawElements()`:

```js
const skeleton = await parseMermaidToExcalidraw(mermaidSource);
const elements = convertToExcalidrawElements(skeleton.elements); // ← required step
```

### Bundle requirement
Both packages are ESM-only with internal cross-dependencies. They must be bundled with esbuild
before use in a puppeteer page context. The `setup.sh` script handles this.

### Chrome path
The script tries common paths. Override with `CHROME_PATH` env var:
```bash
CHROME_PATH=/path/to/chrome node convert.mjs mydiagram.mmd -o out.json
```

---

## Files

| File | Purpose |
|---|---|
| `scripts/setup.sh` | One-time setup: npm install + esbuild bundle |
| `scripts/convert.mjs` | Convert `.mmd` files → Excalidraw elements JSON |
| `scripts/merge.py` | Merge converted elements into existing `.excalidraw` file |
| `scripts/bundle.js` | Built by setup.sh — browser bundle of both excalidraw packages |
| `scripts/node_modules/` | Created by setup.sh |

---

## Real-World Example

This skill was used to convert two Mermaid diagrams from
`https://gist.github.com/dzianisv/407de0b1a88156a47e8c8d944f403dbb`
into native elements in `~/myDocuments/mindmap-2026-04-02-0909-with-diagrams.excalidraw`:

- **Archive Subscription.md** → `sequenceDiagram` → 157 elements
- **SystemDesign.md** → `graph TB` → 90 elements
- Total: 877 elements (628 original + 249 new), all native (zero image elements)
