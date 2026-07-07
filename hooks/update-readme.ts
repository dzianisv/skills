#!/usr/bin/env bun

/**
 * update-readme.ts
 * Regenerates the skills table in README.md from skills/<name>/SKILL.md frontmatter.
 * Replaces content between <!-- skills-table-start --> and <!-- skills-table-end --> markers.
 * Run as a post-commit hook or manually: bun hooks/update-readme.ts
 */

import { join } from "path";

const repoRoot = join(import.meta.dir, "..");

/** Parse `name` and `description` from YAML frontmatter block. */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return {};

  const fm = fmMatch[1];
  const lines = fm.split(/\r?\n/);

  let name: string | undefined;
  let description: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // name field (always a simple scalar)
    if (!name) {
      const m = line.match(/^name:\s*(.+)$/);
      if (m) {
        name = m[1].trim().replace(/^(['"])(.*)\1$/, "$2");
        continue;
      }
    }

    // description field
    if (!description) {
      const m = line.match(/^description:\s*(.*)/);
      if (m) {
        const rest = m[1].trim();

        if (rest === ">" || rest === "|" || rest === ">-" || rest === "|-") {
          // Block scalar — collect indented lines that follow
          const blockLines: string[] = [];
          for (let j = i + 1; j < lines.length; j++) {
            if (/^\s+/.test(lines[j])) {
              blockLines.push(lines[j].trim());
            } else {
              break;
            }
          }
          description = blockLines.join(" ");
        } else if (rest.startsWith('"')) {
          // Double-quoted — may span rest of string up to closing "
          const inner = rest.match(/^"([^"]*)"$/);
          description = inner ? inner[1] : rest.replace(/^"|"$/g, "");
        } else if (rest.startsWith("'")) {
          // Single-quoted
          const inner = rest.match(/^'([^']*)'$/);
          description = inner ? inner[1] : rest.replace(/^'|'$/g, "");
        } else if (rest.length > 0) {
          // Plain scalar (unquoted single line)
          description = rest;
        }
        continue;
      }
    }

    if (name && description) break;
  }

  return { name, description };
}

interface Skill {
  name: string;
  description: string;
}

async function collectSkills(): Promise<Skill[]> {
  const skills: Skill[] = [];
  const glob = new Bun.Glob("skills/*/SKILL.md");

  for await (const relPath of glob.scan({ cwd: repoRoot })) {
    const absPath = join(repoRoot, relPath);
    const content = await Bun.file(absPath).text();
    const { name, description } = parseFrontmatter(content);
    if (!name || !description) continue;

    // Truncate very long descriptions so the table stays readable
    const short =
      description.length > 150 ? description.slice(0, 147) + "..." : description;

    skills.push({ name, description: short });
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

function buildTable(skills: Skill[]): string {
  const rows = skills.map(
    (s) =>
      `| ${s.name} | ${s.description} | \`npx -y skills add dzianisv/skills -s ${s.name} -g\` |`
  );
  return ["| Skill | Description | Install |", "|-------|-------------|---------|", ...rows].join(
    "\n"
  );
}

async function main() {
  const skills = await collectSkills();
  if (skills.length === 0) {
    console.error("No skills found — check that skills/*/SKILL.md files exist.");
    process.exit(0);
  }

  const table = buildTable(skills);
  const marker = {
    start: "<!-- skills-table-start -->",
    end: "<!-- skills-table-end -->",
  };
  const newSection = `${marker.start}\n${table}\n${marker.end}`;

  const readmePath = join(repoRoot, "README.md");
  let readme = await Bun.file(readmePath).text();

  if (readme.includes(marker.start) && readme.includes(marker.end)) {
    readme = readme.replace(
      new RegExp(`${marker.start}[\\s\\S]*?${marker.end}`),
      newSection
    );
  } else {
    readme = readme.trimEnd() + "\n\n" + newSection + "\n";
  }

  await Bun.write(readmePath, readme);
  console.log(`README.md updated — ${skills.length} skills.`);
}

main().catch((err) => {
  console.error("update-readme:", err);
  process.exit(0); // hooks must never block
});
