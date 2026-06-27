#!/usr/bin/env bun
// PreToolUse hook: record solo-founder skill invocations for eval pipeline.
// Self-contained — no imports outside this file. Must never block the tool call — always exits 0, fast.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function git(cwd: string, args: string): string {
  try {
    return execSync(`git -C ${JSON.stringify(cwd)} ${args}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

try {
  const raw = await Bun.stdin.text();
  if (raw.trim()) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      process.exit(0);
    }

    if (payload.tool_name === "Skill") {
      const input = payload.tool_input as Record<string, unknown> | undefined;
      const skill = ((input?.skill ?? input?.name) ?? "") as string;

      const matches =
        skill === "solo-founder" ||
        skill.startsWith("solo-founder:") ||
        skill.endsWith(":solo-founder");

      if (matches) {
        const sid = (payload.session_id ?? "") as string;
        if (sid) {
          const tp = (payload.transcript_path ?? "") as string;
          const cwd = ((payload.cwd ?? "") as string) || process.cwd();
          const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");

          const repo = git(cwd, "config --get remote.origin.url");
          const branch = git(cwd, "rev-parse --abbrev-ref HEAD");

          let goal = "";
          for (const g of [join(cwd, "goal.md"), join(cwd, ".autopilot", "goal.md")]) {
            if (existsSync(g)) {
              goal = readFileSync(g, "utf8").slice(0, 600).replace(/\n/g, " ");
              break;
            }
          }

          const dir = join(homedir(), ".local", "run", "solo-founder");
          mkdirSync(dir, { recursive: true });
          const f = join(dir, `${sid}.json`);

          let first = now;
          if (existsSync(f)) {
            try {
              const existing = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
              if (typeof existing.first_seen === "string" && existing.first_seen) {
                first = existing.first_seen;
              }
            } catch {
              // keep first = now
            }
          }

          const record: Record<string, string> = {
            session_id: sid,
            transcript_path: tp,
            cwd,
            repo,
            branch,
            goal,
            skill,
            first_seen: first,
            last_seen: now,
          };

          const tmp = `${f}.${process.pid}.tmp`;
          writeFileSync(tmp, JSON.stringify(record, null, 2));
          renameSync(tmp, f);
        }
      }
    }
  }
} catch {
  // never block the tool call
}

process.exit(0);
