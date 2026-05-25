#!/usr/bin/env node
// Convert one or more Mermaid diagram files to Excalidraw elements JSON.
// Usage: node convert.mjs <file1.mmd> [file2.mmd ...] [-o output.json]
//
// Each .mmd file should contain a single Mermaid diagram.
// Output: JSON with { diagrams: [{ name, elements, files }] }
//
// Prerequisites: run setup.sh first to build bundle.js and install puppeteer-core.

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, basename, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// Parse CLI args
const args = process.argv.slice(2);
const outIdx = args.indexOf("-o");
const outFile = outIdx !== -1 ? args.splice(outIdx, 2)[1] : null;
const inputFiles = args;

if (inputFiles.length === 0) {
  console.error("Usage: node convert.mjs <file1.mmd> [file2.mmd ...] [-o output.json]");
  process.exit(1);
}

const bundlePath = resolve(__dir, "bundle.js");
if (!existsSync(bundlePath)) {
  console.error("bundle.js not found. Run setup.sh first.");
  process.exit(1);
}

// Detect Chrome path
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
];
const chromePath = CHROME_PATHS.find(existsSync);
if (!chromePath) {
  console.error("Chrome not found. Install Google Chrome or set CHROME_PATH env var.");
  process.exit(1);
}

const bundle = readFileSync(bundlePath, "utf-8");

const diagrams = inputFiles.map(f => ({
  name: basename(f, ".mmd"),
  source: readFileSync(resolve(f), "utf-8").trim(),
}));

console.log(`Converting ${diagrams.length} diagram(s) using headless Chrome...`);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || chromePath,
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();
page.on("console", m => {
  if (m.type() === "error") console.error("PAGE:", m.text().slice(0, 300));
});
await page.setContent("<!DOCTYPE html><html><head></head><body></body></html>");
await page.addScriptTag({ content: bundle });

const results = await page.evaluate(async (diagrams) => {
  const out = [];
  for (const { name, source } of diagrams) {
    try {
      const skeleton = await window.parseMermaidToExcalidraw(source);
      const elements = window.convertToExcalidrawElements(skeleton.elements);
      out.push({ name, ok: true, elements, files: skeleton.files || {} });
    } catch (e) {
      out.push({ name, ok: false, error: e.message });
    }
  }
  return out;
}, diagrams);

await browser.close();

let allOk = true;
for (const r of results) {
  if (r.ok) {
    console.log(`  ✓ ${r.name}: ${r.elements.length} elements`);
  } else {
    console.error(`  ✗ ${r.name}: ${r.error}`);
    allOk = false;
  }
}

const output = JSON.stringify({ diagrams: results }, null, 2);
if (outFile) {
  writeFileSync(outFile, output);
  console.log(`Written to ${outFile}`);
} else {
  process.stdout.write(output);
}

process.exit(allOk ? 0 : 1);
