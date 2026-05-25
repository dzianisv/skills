#!/usr/bin/env bash
# Setup: install deps and build the browser bundle needed by convert.mjs
# Run once from the skill's scripts/ directory: bash setup.sh

set -euo pipefail
SKILL_SCRIPTS="$(cd "$(dirname "$0")" && pwd)"

cd "$SKILL_SCRIPTS"

if [ ! -d node_modules/puppeteer-core ]; then
  npm init -y --quiet
  npm install --quiet puppeteer-core @excalidraw/mermaid-to-excalidraw @excalidraw/excalidraw esbuild
fi

if [ ! -f bundle.js ]; then
  echo "Building browser bundle (takes ~30s)..."
  cat > _build_entry.mjs << 'ENTRY'
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
window.parseMermaidToExcalidraw = parseMermaidToExcalidraw;
window.convertToExcalidrawElements = convertToExcalidrawElements;
ENTRY
  npx esbuild _build_entry.mjs \
    --bundle \
    --platform=browser \
    --format=iife \
    --target=chrome110 \
    --outfile=bundle.js
  rm -f _build_entry.mjs
  echo "bundle.js built ($(du -sh bundle.js | cut -f1))"
fi

echo "Setup complete. Run: node convert.mjs <diagram.mmd> [diagram2.mmd ...] -o output.json"
