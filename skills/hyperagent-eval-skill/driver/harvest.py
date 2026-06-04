#!/usr/bin/env python3
"""
Harvest real cases from Claude Code JSONL sessions.

Self-improvement from real usage (paper §5.3 cross-run compounding): instead of
hand-authoring frozen cases, mine sessions where the skill-under-test actually
fired and turn the *triggering user turn* into a frozen case. The session's own
later turns are a free baseline of what the skill did.

Discipline preserved: harvest writes into a staging dir, never the live `cases/`.
You review, then promote into train/ (70%) and holdout/ (30%) and FREEZE before
the next loop run. Continuous between epochs, frozen within one. Run this between
driver runs, not during.

Usage
  python harvest.py <skill-name>                 # scan all sessions, stage cases
  python harvest.py <skill-name> --limit 20      # cap how many to stage
"""
import argparse, glob, hashlib, json, os, re
from pathlib import Path

SKILLS_DIR = Path.home() / ".claude/skills"
PROJECTS   = Path.home() / ".claude/projects"

# harness-injected preambles that are not real user intent
NOISE = ("this session is being continued", "caveat:", "<command-",
         "<system-reminder", "the user opened the file", "<local-command")


def is_noise(txt):
    low = txt.lower().lstrip()
    return any(low.startswith(n) or n in low[:80] for n in NOISE)


def text_of(content):
    """User message content is a string or a list of blocks — normalize to text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content
                         if isinstance(b, dict) and b.get("type") == "text")
    return ""


def harvest(skill):
    cases, seen = [], set()
    for f in glob.glob(str(PROJECTS / "**/*.jsonl"), recursive=True):
        last_user = None
        try:
            for line in open(f):
                try: d = json.loads(line)
                except Exception: continue
                t = d.get("type")
                if t == "user":
                    txt = text_of(d.get("message", {}).get("content", ""))
                    # skip tool_result / system-reminder noise
                    if txt and not txt.startswith("<") and "tool_use_id" not in line \
                            and not is_noise(txt):
                        last_user = txt.strip()
                elif t == "assistant":
                    for blk in d.get("message", {}).get("content", []):
                        if (isinstance(blk, dict) and blk.get("type") == "tool_use"
                                and blk.get("name") == "Skill"
                                and blk.get("input", {}).get("skill") == skill):
                            trigger = last_user or blk["input"].get("args", "")
                            if not trigger or len(trigger) < 15:
                                continue
                            key = hashlib.sha1(trigger[:200].encode()).hexdigest()[:10]
                            if key in seen:
                                continue
                            seen.add(key)
                            cases.append({"key": key, "trigger": trigger,
                                          "args": blk["input"].get("args", ""),
                                          "session": os.path.basename(f)})
        except Exception:
            continue
    return cases


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("skill")
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()

    stage = SKILLS_DIR / args.skill / "evals" / "cases" / "_harvested"
    stage.mkdir(parents=True, exist_ok=True)
    cases = harvest(args.skill)[: args.limit]
    for c in cases:
        p = stage / f"{c['key']}.md"
        p.write_text(f"<!-- from session {c['session']} -->\n{c['trigger']}\n")
    print(f"harvested {len(cases)} unique cases → {stage}")
    print("Review, then move into cases/train (70%) and cases/holdout (30%) and FREEZE before running the loop.")


if __name__ == "__main__":
    main()
