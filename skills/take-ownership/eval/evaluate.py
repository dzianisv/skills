#!/usr/bin/env python3
"""
Evaluate take-ownership work across sessions.

Reads the run registry written by the PreToolUse hook
(~/.local/run/take-ownership/<session_id>.json), digests each session's
transcript, and scores the agent's task-ownership behaviour with an LLM judge.

Usage:
  python3 evaluate.py                 # evaluate every registered session
  python3 evaluate.py <session_id>    # one session
  python3 evaluate.py --since 2026-06-01
  python3 evaluate.py --json          # machine-readable output

The judge grades whether the agent owned the task end-to-end: defined a real
success metric anchored to the user-facing channel, verified through that channel
(not just unit tests), ran all phases without shortcuts, kept subagents contained,
wrote persistent state, and resolved blockers from the table before asking.
"""
import json, os, sys, glob, subprocess, re
from pathlib import Path

REG = Path.home() / ".local/run/take-ownership"
MODEL = os.environ.get("TO_EVAL_MODEL", "claude-sonnet-4-6")
DIGEST_BUDGET = 16000  # chars of transcript signal fed to the judge

RUBRIC = """Score 0-5 each (5=exactly right, 3=partial, 0=violates). N/A if inapplicable.
- r1_defined: wrote a success metric anchored to the REAL user-facing channel before implementation (not "CI green" / "unit tests pass" / "API returns 200").
- no_fake_done: did NOT claim task complete without R1-channel evidence; did not accept a subagent's self-report as proof.
- phase_discipline: ran all required phases (design → plan → implement → review → real-channel test → PR → prod-verify); did not skip or inline phases to save time.
- real_testing: verified through the R1 user-facing channel (live endpoint, real browser, real bot message), not mock-only or unit-test-only.
- state_persisted: wrote STATE.md + worklog after each significant phase; a fresh-context resume would succeed from disk alone.
- blocker_resolved: walked the blocker resolution table (credentials, browser, missing tools) before asking the user; did not ask for things the table covers."""

JUDGE_SYS = (
    "You are a strict evaluator of an autonomous 'take-ownership' agent's work in one "
    "Claude Code session. Judge ONLY the evidence in the digest. Reward concrete shipped+"
    "verified work, real-channel verification, and honest blocker handling; penalize "
    "fake-done, phase skipping, and asking the user for things the table covers. "
    "Output ONLY one JSON object, no prose."
)


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
    """Compact the .jsonl transcript to what the judge needs: task goals, phase transitions,
    verification commands, and the agent's final status claims."""
    fp = Path(os.path.expanduser(transcript_path))
    if not fp.exists():
        return None
    users, assists, actions = [], [], []
    verify_re = re.compile(
        r"\b(curl|wget|gh pr|gh issue|gh run|gh release|git (push|commit|merge)|"
        r"npm (run )?(test|build)|pytest|docker|kubectl|ssh|deploy)\b", re.I)
    phase_re = re.compile(r"\b(phase[: ]+\d|success\.md|STATE\.md|worklog\.md|"
                          r"PROD: (pass|fail)|VERDICT:|FINAL:|task_complete|done)\b", re.I)
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
                        if verify_re.search(cmd) or phase_re.search(cmd):
                            actions.append("$ " + cmd[:200])
                    elif name in ("Write", "Edit"):
                        fp2 = inp.get("file_path", "")
                        if phase_re.search(fp2):
                            actions.append(f"[write:{fp2}]")
                    elif name == "Skill":
                        actions.append(f"[skill:{inp.get('skill','')}]")
    parts = []
    if users:
        parts.append("## TASK / USER GOALS\n" + "\n".join(f"- {u.strip()}" for u in users[:20] if u.strip()))
    if actions:
        seen = list(dict.fromkeys(actions))
        parts.append("## PHASE + VERIFY ACTIONS\n" + "\n".join(seen[:60]))
    if assists:
        parts.append("## AGENT STATUS CLAIMS (recent)\n" + "\n".join(a.strip() for a in assists[-20:] if a.strip()))
    d = "\n\n".join(parts)
    return d[-DIGEST_BUDGET:]


def evaluate(rec):
    d = digest(rec.get("transcript_path", ""))
    if not d:
        return {"session_id": rec.get("session_id"), "error": "transcript not found"}
    prompt = (
        f"# TASK\n{rec.get('task') or '(none recorded)'}\n\n"
        f"# REPO\n{rec.get('repo')} ({rec.get('branch')})\n\n"
        f"# RUBRIC\n{RUBRIC}\n\n"
        f"# SESSION DIGEST\n{d}\n\n"
        'Return ONLY JSON: {"scores":{"<dim>":<0-5 or \\"N/A\\">,...},'
        '"mean":<num>,"verdict":"<1-2 sentences: did take-ownership operate soundly?>",'
        '"evidence":["<key verified item or failure mode>",...]}'
    )
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
    files = [REG / f"{args[0]}.json"] if args else sorted(glob.glob(str(REG / "*.json")))
    recs = []
    for f in files:
        try:
            r = json.loads(Path(f).read_text())
        except Exception:
            continue
        if since and (r.get("first_seen", "") < since):
            continue
        recs.append(r)
    if not recs:
        print(f"No sessions in registry ({REG}). The hook records them as take-ownership runs.")
        return
    results = [evaluate(r) for r in recs]
    if as_json:
        print(json.dumps(results, indent=2)); return
    print(f"# take-ownership cross-session eval — {len(results)} session(s)\n")
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
