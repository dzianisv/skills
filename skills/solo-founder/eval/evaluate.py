#!/usr/bin/env python3
"""
Evaluate solo-founder work across sessions.

Reads the run registry written by the PreToolUse hook
(~/.local/run/solo-founder/<session_id>.json), digests each session's
transcript, and scores the solo-founder work with an LLM judge (claude -p).

Usage:
  python3 evaluate.py                 # evaluate every registered session
  python3 evaluate.py <session_id>    # one session
  python3 evaluate.py --since 2026-06-01
  python3 evaluate.py --json          # machine-readable output

The judge grades whether solo-founder acted like a sound operator: shipped REAL
verified work toward the goal, routed around blocks instead of stalling, queued
human-gated levers honestly, and did NOT fake-done or self-grade the metric.
"""
import json, os, sys, glob, subprocess, re
from pathlib import Path

REG = Path.home() / ".local/run/solo-founder"
MODEL = os.environ.get("SF_EVAL_MODEL", "sonnet")
DIGEST_BUDGET = 16000  # chars of transcript signal fed to the judge

RUBRIC = """Score 0-5 each (5=exactly right, 3=partial, 0=violates). N/A if inapplicable.
- ship_real: did real, concrete work (commits/PRs/releases/edits), not just plans/intentions.
- verify_real_channel: proved work through a real channel (CI green, deploy verified, endpoint/observable), not "looks done".
- blocked_routing: when a lever was blocked/gated, routed to another lever and kept moving; did NOT stall or repeat "I can't".
- honest_metric: did NOT self-grade or claim a business metric moved without live measurement; queued human-gated items with exact steps.
- no_fakedone: did not claim done on a sub-agent's word or unverified output; verified against reality."""

JUDGE_SYS = ("You are a strict evaluator of an autonomous 'solo-founder' operator's work in one "
             "Claude Code session. Judge ONLY the evidence in the digest. Reward concrete shipped+"
             "verified work and honest handling of human-gated levers; penalize stalling, fake-done, "
             "and self-graded metrics. Output ONLY one JSON object, no prose.")


def run_claude(prompt, system):
    p = subprocess.run(
        ["claude", "-p", prompt, "--output-format", "json", "--model", MODEL,
         "--allowedTools", "Read", "--append-system-prompt", system],
        capture_output=True, text=True, timeout=300,
        env={**os.environ, "AUTOPILOT_DISABLE": "1", "AUTOPILOT_CHILD": "1"})
    if p.returncode != 0:
        raise RuntimeError(p.stderr[:300])
    return json.loads(p.stdout).get("result", "")


def digest(transcript_path):
    """Compact the .jsonl transcript to the signal a judge needs: user asks,
    assistant summaries, and shipping actions (git/gh/deploy)."""
    fp = Path(os.path.expanduser(transcript_path))
    if not fp.exists():
        return None
    users, assists, actions = [], [], []
    ship_re = re.compile(r"\b(git (commit|push|merge)|gh (pr|release) (create|merge)|gh pr merge|"
                         r"npm (run )?(build|test)|deploy|cdn|kubectl|terraform apply)\b", re.I)
    for line in fp.read_text(errors="ignore").splitlines():
        try:
            e = json.loads(line)
        except Exception:
            continue
        msg = e.get("message") or {}
        role = e.get("type") or msg.get("role")
        content = msg.get("content")
        if isinstance(content, str):
            (users if role == "user" else assists).append(content[:800])
        elif isinstance(content, list):
            for b in content:
                t = b.get("type")
                if t == "text":
                    (users if role == "user" else assists).append(b.get("text", "")[:800])
                elif t == "tool_use":
                    name = b.get("name", "")
                    inp = b.get("input", {})
                    if name == "Bash":
                        cmd = (inp.get("command") or "").strip().splitlines()[:1]
                        cmd = cmd[0] if cmd else ""
                        if ship_re.search(cmd):
                            actions.append("$ " + cmd[:200])
                    elif name in ("Skill",):
                        actions.append(f"[skill:{inp.get('skill','')}]")
    parts = []
    if users:
        parts.append("## USER / GOALS\n" + "\n".join(f"- {u.strip()}" for u in users[:25] if u.strip()))
    if actions:
        seen = list(dict.fromkeys(actions))
        parts.append("## SHIPPING ACTIONS (from Bash)\n" + "\n".join(seen[:60]))
    if assists:
        # keep the last assistant summaries (the accounts of what was done)
        parts.append("## ASSISTANT ACCOUNTS (recent)\n" + "\n".join(a.strip() for a in assists[-20:] if a.strip()))
    d = "\n\n".join(parts)
    return d[-DIGEST_BUDGET:]


def evaluate(rec):
    d = digest(rec.get("transcript_path", ""))
    if not d:
        return {"session_id": rec.get("session_id"), "error": "transcript not found"}
    prompt = (f"# GOAL\n{rec.get('goal') or '(none recorded)'}\n\n"
              f"# REPO\n{rec.get('repo')} ({rec.get('branch')})\n\n"
              f"# RUBRIC\n{RUBRIC}\n\n"
              f"# SESSION DIGEST\n{d}\n\n"
              'Return ONLY JSON: {"scores":{"<dim>":<0-5 or \\"N/A\\">,...},'
              '"mean":<num>,"verdict":"<1-2 sentences: did solo-founder operate soundly?>",'
              '"evidence":["<key shipped/verified item or failure>",...]}')
    try:
        raw = run_claude(prompt, JUDGE_SYS)
        m = re.findall(r"\{.*\}", raw, re.DOTALL)
        out = json.loads(m[-1]) if m else {"error": "no json", "raw": raw[:200]}
    except Exception as ex:
        out = {"error": str(ex)[:200]}
    out["session_id"] = rec.get("session_id")
    out["cwd"] = rec.get("cwd")
    return out


def main():
    args = [a for a in sys.argv[1:]]
    as_json = "--json" in args; args = [a for a in args if a != "--json"]
    since = None
    if "--since" in args:
        since = args[args.index("--since") + 1]
        args = [a for a in args if a not in ("--since", since)]
    recs = []
    files = [REG / f"{args[0]}.json"] if args else sorted(glob.glob(str(REG / "*.json")))
    for f in files:
        try:
            r = json.loads(Path(f).read_text())
        except Exception:
            continue
        if since and (r.get("first_seen", "") < since):
            continue
        recs.append(r)
    if not recs:
        print(f"No sessions in registry ({REG}). The hook records them as solo-founder runs.")
        return
    results = [evaluate(r) for r in recs]
    if as_json:
        print(json.dumps(results, indent=2)); return
    print(f"# solo-founder cross-session eval — {len(results)} session(s)\n")
    for r in results:
        if r.get("error"):
            print(f"- {r['session_id'][:12]}  ⚠ {r['error']}"); continue
        print(f"## {r['session_id'][:12]}  mean={r.get('mean','?')}  ({r.get('cwd','')})")
        print(f"   scores: {r.get('scores')}")
        print(f"   verdict: {r.get('verdict','')}")
        for e in (r.get("evidence") or [])[:5]:
            print(f"     • {e}")
        print()


if __name__ == "__main__":
    main()
