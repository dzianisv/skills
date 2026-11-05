#!/usr/bin/env node
/**
 * secretsmctl-import — copy the secrets listed in a per-repo manifest from the
 * Bitwarden password-manager vault into Bitwarden Secrets Manager projects,
 * without ever printing a value.
 *
 * Why a separate script: Secrets Manager is a different product from the PM
 * vault. A machine account cannot see PM items or folders, so every secret an
 * agent needs has to exist in an SM project. This is the one-way copy.
 *
 * Safety:
 *   - dry run by default; nothing is written without --apply
 *   - a value is only sent if it looks like a credential (length, single line
 *     for known-single-line keys); anything else is reported NEEDS_HUMAN
 *   - existing keys in the target project are skipped unless --overwrite
 *   - never prints a value, only key names and classifications
 *
 * Requires an unlocked `bw` session (BW_SESSION) to read source items, and
 * BWS_ACCESS_TOKEN with write access to the target project to apply. Both may
 * come from the environment or from ./.env.
 *
 * Usage:
 *   npx tsx secretsmctl-import.ts                          # plan
 *   npx tsx secretsmctl-import.ts --apply                  # push
 *
 * Flags:
 *   --manifest <path>  manifest file (default scripts/secretsmctl-projects.json)
 *   --project <name>   limit to one project
 *   --check-values     resolve every value and report shape, changes nothing
 *   --apply            create missing secrets in Secrets Manager
 *   --overwrite        with --apply, replace values that differ
 *   --env-file <path>  load env vars from this file first
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const ARGV0 = process.argv.slice(2);
const envFileIdx = ARGV0.indexOf("--env-file");
if (envFileIdx >= 0 && ARGV0[envFileIdx + 1]) loadEnvFile(resolve(ARGV0[envFileIdx + 1]));
loadEnvFile(resolve(".env"));

const manifestIdx = ARGV0.indexOf("--manifest");
const MANIFEST_PATH = resolve(manifestIdx >= 0 ? ARGV0[manifestIdx + 1] : "scripts/secretsmctl-projects.json");
if (!existsSync(MANIFEST_PATH)) {
  process.stderr.write(`secretsmctl-import: manifest not found at ${MANIFEST_PATH}\n`);
  process.exit(2);
}
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

type Entry = { key: string; item: string; field?: string; itemId?: string };
type Project = { envVar: string; secrets: Entry[] };

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const CHECK = argv.includes("--check-values");
const OVERWRITE = argv.includes("--overwrite");
const only = (() => {
  const i = argv.indexOf("--project");
  return i >= 0 ? argv[i + 1] : undefined;
})();

function die(msg: string): never {
  process.stderr.write(`secretsmctl-import: ${msg}\n`);
  process.exit(2);
}

type BwItem = Record<string, unknown> & { id: string; name: string };

/** Resolve an exact item name to one item. Names are not unique, so >1 is an error. */
function bwItem(name: string, itemId?: string): BwItem {
  const session = process.env.BW_SESSION ?? "";
  try {
    if (itemId) {
      return JSON.parse(
        execFileSync("bw", ["get", "item", itemId, "--session", session], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
      ) as BwItem;
    }
    const found = JSON.parse(
      execFileSync("bw", ["list", "items", "--search", name, "--session", session], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    ) as BwItem[];
    const exact = found.filter((i) => i.name === name);
    if (exact.length === 1) return exact[0];
    if (exact.length === 0) die(`item "${name}" not found`);
    die(`item "${name}" is ambiguous (${exact.length} matches: ${exact.map((i) => i.id).join(", ")}) — add "itemId" to the manifest`);
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") die("bw is not installed");
    die(`cannot read item "${name}" (vault locked, or name changed)`);
  }
}

/** Pull one value out of a bw item. Returns null when the shape is ambiguous. */
function extract(item: Record<string, unknown>, field?: string): string | null {
  const login = (item.login ?? {}) as Record<string, string>;
  const fields = (item.fields ?? []) as Array<{ name?: string; value?: string }>;
  const notes = typeof item.notes === "string" ? item.notes : "";

  if (field === "password" || field === "username") return login[field] || null;

  if (field) {
    const byField = fields.find((f) => (f.name ?? "").toLowerCase() === field.toLowerCase());
    if (byField?.value) return byField.value;
    const re = new RegExp(`^${field}\\s*=\\s*(.+)$`, "m");
    const hit = notes.match(re);
    if (hit) return hit[1].trim();
    return null;
  }

  if (login.password) return login.password;

  const named = fields.find((f) => /^(value|secret|api_?key|token)$/i.test(f.name ?? "") && f.value);
  if (named?.value) return named.value;

  const valueBlock = notes.match(/^VALUE:\s*(.+)$/m);
  if (valueBlock) return valueBlock[1].trim();

  const kv = notes.match(/^[A-Z][A-Z0-9_]{2,}\s*=\s*(\S.*)$/m);
  if (kv) return kv[1].trim();

  const lines = notes.split("\n").map((l) => l.trim());

  // "Value:" / "Key:" on its own line, value on the next non-empty line.
  for (let i = 0; i < lines.length; i += 1) {
    if (/^(value|key|secret|token|api[_-]?key)\s*:?\s*$/i.test(lines[i])) {
      const next = lines.slice(i + 1).find((l) => l.length > 0);
      if (next && !/\s/.test(next)) return next;
    }
  }

  // Raw single-line note: a credential never contains spaces, prose does.
  const first = lines.find((l) => l.length > 0) ?? "";
  if (first.length >= 8 && first.length <= 200 && !/\s/.test(first)) return first;

  return null;
}

/** Reject anything that is obviously prose rather than a credential. */
function classify(v: string | null): { ok: boolean; why: string } {
  if (!v) return { ok: false, why: "no extractable value" };
  if (v.length < 8) return { ok: false, why: `too short (${v.length})` };
  if (v.length > 8192) return { ok: false, why: `too long (${v.length})` };
  if (/\s{2,}/.test(v) && v.includes("\n") && v.length > 200) {
    return { ok: false, why: "looks like prose/notes, not one credential" };
  }
  return { ok: true, why: `len=${v.length}` };
}

function bwsJson(args: string[]): unknown {
  try {
    const raw = execFileSync("bws", args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (e) {
    const stderr = ((e as { stderr?: Buffer }).stderr ?? Buffer.from("")).toString().trim();
    die(`bws ${args[0]} ${args[1] ?? ""} failed: ${stderr.split("\n").slice(0, 2).join(" ") || "no output"}`);
  }
}

function bwsWrite(args: string[]): void {
  try {
    execFileSync("bws", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  } catch (e) {
    const stderr = ((e as { stderr?: Buffer }).stderr ?? Buffer.from("")).toString().trim();
    die(`bws ${args[0]} ${args[1] ?? ""} failed: ${stderr.split("\n").slice(0, 2).join(" ") || "no output"}`);
  }
}

function existingKeys(projectId: string): Map<string, string> {
  const list = bwsJson(["secret", "list", projectId, "--output", "json"]) as Array<{
    id: string;
    key: string;
    value: string;
  }>;
  return new Map(list.map((s) => [s.key, s.value]));
}

const projects = Object.entries(MANIFEST.projects as Record<string, Project>).filter(
  ([name]) => !only || name === only,
);
if (projects.length === 0) die(`no project matched --project ${only}`);

let total = 0;
let ready = 0;
let needsHuman: string[] = [];
let writes = 0;

for (const [name, project] of projects) {
  const projectId = process.env[project.envVar] ?? "";
  process.stdout.write(`\n## ${name}  (${project.envVar}${projectId ? `=${projectId}` : " unset"})\n`);

  let existing = new Map<string, string>();
  if (APPLY) {
    if (!projectId) die(`${project.envVar} is not set, cannot write ${name}`);
    if (!process.env.BWS_ACCESS_TOKEN) die("BWS_ACCESS_TOKEN is not set, cannot write");
    existing = existingKeys(projectId);
  }

  for (const entry of project.secrets) {
    total += 1;
    const item = bwItem(entry.item, entry.itemId);
    const value = extract(item, entry.field);
    const verdict = classify(value);

    if (!verdict.ok) {
      needsHuman.push(`${name}/${entry.key} <- "${entry.item}": ${verdict.why}`);
      process.stdout.write(`  ${entry.key.padEnd(28)} NEEDS_HUMAN  ${verdict.why}\n`);
      continue;
    }
    ready += 1;

    if (!APPLY) {
      process.stdout.write(`  ${entry.key.padEnd(28)} ok           ${verdict.why}\n`);
      continue;
    }

    if (existing.has(entry.key) && !OVERWRITE) {
      const same = existing.get(entry.key) === value;
      process.stdout.write(`  ${entry.key.padEnd(28)} exists       ${same ? "same" : "DIFFERS (use --overwrite)"}\n`);
      continue;
    }

    // bws takes the value as an argv element; run it immediately and locally.
    const verb = existing.has(entry.key) ? "update" : "create";
    if (verb === "create") {
      bwsWrite(["secret", "create", entry.key, value as string, projectId]);
    } else {
      const id = (bwsJson(["secret", "list", projectId, "--output", "json"]) as Array<{
        id: string;
        key: string;
      }>).find((s) => s.key === entry.key)?.id;
      if (!id) die(`cannot find id for ${entry.key}`);
      bwsWrite(["secret", "update", id, "--value", value as string]);
    }
    writes += 1;
    process.stdout.write(`  ${entry.key.padEnd(28)} ${verb}d\n`);
  }
}

process.stdout.write(
  `\n${APPLY ? "APPLIED" : CHECK ? "CHECKED" : "DRY-RUN"}  planned=${total} ok=${ready} needs_human=${needsHuman.length} writes=${writes}\n`,
);
if (needsHuman.length) {
  process.stdout.write(`\nneeds a human (fix the mapping or the source item):\n`);
  for (const n of needsHuman) process.stdout.write(`  - ${n}\n`);
}
if (!APPLY) process.stdout.write(`\nnothing was written. add --apply to push.\n`);
process.exit(needsHuman.length ? 1 : 0);
