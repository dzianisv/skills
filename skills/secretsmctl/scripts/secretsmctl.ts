#!/usr/bin/env node
/**
 * secretsmctl — pull one secret on demand from a Bitwarden Secrets Manager
 * project, scoped to the agent that is asking.
 *
 * `bws` does the decryption. This wrapper adds the four things an agent
 * context needs and `bws` does not give you:
 *
 *   1. lookup by KEY NAME (bws takes secret UUIDs)
 *   2. a project allowlist, so an agent cannot pivot to another product
 *   3. a short local cache, so a loop does not hammer the API
 *   4. one audit line per read, on stderr, without the value
 *
 * Install: ~/workspace/skills/skills/secretsmctl. Requires the `bws` binary.
 *
 * Token source, in order:
 *   1. BWS_ACCESS_TOKEN already exported
 *   2. --env-file <path>
 *   3. ./.env
 *   4. ~/.env.d/agent-<AGENTSEC_AGENT_ID>.env
 *
 * Usage:
 *   secretsmctl get KEY [--plain] [--ttl 0]
 *   secretsmctl check KEY          # exit 0 present, 1 absent, silent
 *   secretsmctl list [--keys]      # key names only, never values
 *   secretsmctl run -- <cmd...>    # whole project injected as env
 *   secretsmctl doctor
 *
 * Env:
 *   BWS_ACCESS_TOKEN            machine-account token (required)
 *   SECRETSMCTL_PROJECT         default project id
 *   SECRETSMCTL_ALLOW_PROJECTS  comma-separated allowlist (required to read)
 *   SECRETSMCTL_AGENT_ID        name used in audit lines
 *   SECRETSMCTL_TTL             cache seconds, default 300, 0 disables
 *
 * AGENTSEC_* names are still accepted for backward compatibility.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const CACHE_DIR = join(homedir(), ".cache", "secretsmctl");

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

function bootstrapEnv(): void {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--env-file");
  if (i >= 0 && argv[i + 1]) loadEnvFile(resolve(argv[i + 1]));
  if (!process.env.BWS_ACCESS_TOKEN) loadEnvFile(resolve(".env"));
  if (!process.env.BWS_ACCESS_TOKEN) {
    const agent = process.env.SECRETSMCTL_AGENT_ID ?? process.env.AGENTSEC_AGENT_ID;
    if (agent) loadEnvFile(join(homedir(), ".env.d", `agent-${agent}.env`));
  }
}

const env = (a: string, b: string): string | undefined =>
  process.env[`SECRETSMCTL_${a}`] ?? process.env[`AGENTSEC_${b}`];

type Secret = { id: string; key: string; value: string };

function die(msg: string): never {
  process.stderr.write(`secretsmctl: ${msg}\n`);
  process.exit(2);
}

function bws(args: string[]): string {
  try {
    return execFileSync("bws", args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string; code?: string };
    if (err.code === "ENOENT") die("bws is not installed (see bitwarden/sdk-sm releases)");
    const detail = (err.stderr ?? "").toString().trim() || err.message || "bws failed";
    die(`bws ${args[0]} failed: ${detail.split("\n").slice(0, 2).join(" ")}`);
  }
}

function project(): string {
  const p = env("PROJECT", "PROJECT")?.trim();
  if (!p) die("SECRETSMCTL_PROJECT is not set");
  return p;
}

function assertAllowed(projectId: string): void {
  const allow = (env("ALLOW_PROJECTS", "ALLOW_PROJECTS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) die("SECRETSMCTL_ALLOW_PROJECTS is empty, refusing to read");
  if (!allow.includes(projectId)) die(`project ${projectId} is not in the allowlist`);
}

function ttl(): number {
  return Number(env("TTL", "TTL") ?? 300);
}

function cachePath(projectId: string, token: string): string {
  const t = createHash("sha256").update(token).digest("hex").slice(0, 12);
  return join(CACHE_DIR, `${projectId}.${t}.json`);
}

function loadSecrets(projectId: string): Secret[] {
  const token = process.env.BWS_ACCESS_TOKEN;
  if (!token) die("BWS_ACCESS_TOKEN is not set (export it or put it in .env)");

  const file = cachePath(projectId, token);
  const t = ttl();
  if (t > 0) {
    try {
      if ((Date.now() - statSync(file).mtimeMs) / 1000 <= t) {
        return JSON.parse(readFileSync(file, "utf8")) as Secret[];
      }
    } catch {
      /* cache miss */
    }
  }

  const raw = bws(["secret", "list", projectId, "--output", "json"]);
  const parsed = JSON.parse(raw) as Secret[];

  if (t > 0) {
    mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(parsed), { mode: 0o600 });
    renameSync(tmp, file);
  }
  return parsed;
}

function audit(action: string, projectId: string, key: string): void {
  const agent = env("AGENT_ID", "AGENT_ID") ?? "unknown";
  const line = `${new Date().toISOString()} secretsmctl agent=${agent} action=${action} project=${projectId} key=${key}\n`;
  process.stderr.write(line);
  try {
    mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    const log = join(CACHE_DIR, "audit.log");
    let prev = "";
    try {
      prev = readFileSync(log, "utf8");
    } catch {
      /* first write */
    }
    writeFileSync(log, prev.split("\n").slice(-500).join("\n") + line, { mode: 0o600 });
  } catch {
    /* audit is best-effort, never block a read */
  }
}

function cmdGet(key: string, plain: boolean): void {
  const p = project();
  assertAllowed(p);
  const hit = loadSecrets(p).find((s) => s.key === key);
  if (!hit) die(`secret ${key} not found in project ${p}`);
  audit("get", p, key);
  process.stdout.write(plain ? hit.value : `${hit.value}\n`);
}

function cmdList(): void {
  const p = project();
  assertAllowed(p);
  const secrets = loadSecrets(p);
  audit("list", p, "*");
  process.stdout.write(secrets.map((s) => s.key).join("\n") + "\n");
}

function cmdCheck(key: string): void {
  const p = project();
  assertAllowed(p);
  const hit = loadSecrets(p).find((s) => s.key === key);
  audit("check", p, key);
  process.exit(hit ? 0 : 1);
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function cmdRun(argv: string[]): void {
  const sep = argv.indexOf("--");
  const cmd = sep >= 0 ? argv.slice(sep + 1) : argv;
  if (cmd.length === 0) die("run needs a command: secretsmctl run -- <cmd...>");
  const p = project();
  assertAllowed(p);
  audit("run", p, cmd[0]);
  // `bws run` takes ONE command string and executes it through a shell, not argv.
  const cmdline = cmd.map(shellQuote).join(" ");
  execFileSync("bws", ["run", "--project-id", p, "--", cmdline], { stdio: "inherit", env: process.env });
}

function cmdDoctor(): void {
  let version = "MISSING";
  try {
    version = execFileSync("bws", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    /* keep MISSING */
  }
  const out = [
    `bws binary:      ${version}`,
    `token set:       ${process.env.BWS_ACCESS_TOKEN ? "yes" : "NO"}`,
    `default project: ${env("PROJECT", "PROJECT") ?? "(unset)"}`,
    `allowlist:       ${env("ALLOW_PROJECTS", "ALLOW_PROJECTS") ?? "(unset)"}`,
    `agent id:        ${env("AGENT_ID", "AGENT_ID") ?? "(unset)"}`,
    `cache ttl:       ${ttl()}s`,
  ];
  if (process.env.BWS_ACCESS_TOKEN && env("PROJECT", "PROJECT")) {
    try {
      out.push(`project reads:   ok (${loadSecrets(env("PROJECT", "PROJECT")!).length} secrets visible)`);
    } catch {
      out.push("project reads:   FAILED");
    }
  }
  process.stdout.write(out.join("\n") + "\n");
}

bootstrapEnv();

const [cmd, ...rest] = process.argv.slice(2);
const positional = rest.filter((a) => !a.startsWith("-") && !/^\d+$/.test(a));
switch (cmd) {
  case "get": {
    const key = positional[0];
    if (!key) die("usage: secretsmctl get KEY [--plain] [--env-file PATH]");
    const i = rest.indexOf("--ttl");
    if (i >= 0 && rest[i + 1]) process.env.SECRETSMCTL_TTL = rest[i + 1];
    cmdGet(key, rest.includes("--plain"));
    break;
  }
  case "list":
    cmdList();
    break;
  case "check": {
    const key = positional[0];
    if (!key) die("usage: secretsmctl check KEY");
    cmdCheck(key);
    break;
  }
  case "run":
    cmdRun(rest);
    break;
  case "doctor":
    cmdDoctor();
    break;
  default:
    process.stderr.write("usage: secretsmctl <get KEY | list | check KEY | run -- cmd | doctor>\n");
    process.exit(2);
}
