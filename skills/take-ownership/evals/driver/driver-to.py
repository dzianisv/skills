#!/usr/bin/env python3
"""
Hyperagent eval driver for take-ownership (DGM-H, arXiv 2603.19461).

The loop is THIS Python process. Each iteration shells out to `claude -p` for
three roles — doer, judge, meta — in fresh processes. State lives on disk
(archive/ + scores.md), so a crash → restart resumes cleanly.

Usage
  python driver-to.py            # run loop til stop, resume from disk if archive exists
  python driver-to.py --init     # scaffold evals/ skeleton then exit
  python driver-to.py --mode stage   # Mode B (staged real-skill load)
"""

import argparse
import concurrent.futures as cf
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ─────────────────────────── config ───────────────────────────
SKILL_NAME  = "take-ownership"
SUT_PATH    = Path.home() / ".claude/skills/take-ownership"
EVALS       = SUT_PATH / "evals"
ARCHIVE     = EVALS / "driver/archive"
RUNS        = EVALS / "driver/runs"
SCORES_MD   = EVALS / "driver/scores.md"
ITERS_DIR   = EVALS / "driver/iterations"

MODEL_DOER  = "claude-sonnet-4-6"
MODEL_JUDGE = "claude-sonnet-4-6"
MODEL_META  = "claude-opus-4-8"
MAX_ITERS   = 4
BUDGET_USD  = 22.0
HOLDOUT_EVERY = 3
PLATEAU_DELTA = 0.1
PARALLEL    = 6
TIMEOUT_S   = 600
ALLOWED_RO  = "Read"
ALLOWED_RW  = "Read,Write,Edit"

DIMS = ["r1_defined", "no_fake_done", "phase_discipline",
        "real_testing", "state_persisted", "blocker_resolved"]

# ─────────────────────────── agent call ───────────────────────────
def run_agent(prompt, system="", model=MODEL_DOER, cwd=None, allowed=ALLOWED_RO):
    cmd = ["claude", "-p", prompt, "--output-format", "json",
           "--model", model, "--allowedTools", allowed]
    sysfile = None
    if system:
        sysfile = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False)
        sysfile.write(system); sysfile.close()
        cmd += ["--append-system-prompt-file", sysfile.name]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=TIMEOUT_S, cwd=str(cwd) if cwd else None)
    finally:
        if sysfile:
            Path(sysfile.name).unlink(missing_ok=True)
    if proc.returncode != 0:
        raise RuntimeError(f"claude failed: {proc.stderr[:500]}")
    data = json.loads(proc.stdout)
    return data.get("result", ""), float(data.get("total_cost_usd", 0.0))


def dim_mean(dims):
    vals = []
    for v in dims.values():
        try:
            f = float(v)
        except (TypeError, ValueError):
            continue
        if f >= 0:
            vals.append(f)
    return sum(vals) / len(vals) if vals else 0.0


def extract_json(text):
    m = re.findall(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError(f"no JSON: {text[:300]}")
    return json.loads(m[-1])


def parse_case(path):
    text = Path(path).read_text()
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            fm, body = text[4:end], text[end + 5:]
            m = re.search(r"applies:\s*\[([^\]]*)\]", fm)
            if m:
                dims = [d.strip() for d in m.group(1).split(",") if d.strip()]
                return dims, body.lstrip("\n")
    return list(DIMS), text

# ─────────────────────────── io helpers ───────────────────────────
def read(p):  return Path(p).read_text()
def write(p, s): Path(p).parent.mkdir(parents=True, exist_ok=True); Path(p).write_text(s)

def load_cases(split):
    d = EVALS / "cases" / split
    return sorted(d.glob("*.md")) if d.exists() else []

def load_archive():
    sj = EVALS / "scores.json"
    return json.loads(sj.read_text()) if sj.exists() else []

def save_archive(archive):
    (EVALS / "scores.json").write_text(json.dumps(archive, indent=2))

# ─────────────────────────── memory ───────────────────────────
MEMORY = EVALS / "memory.json"

def memory_load():
    return json.loads(MEMORY.read_text()) if MEMORY.exists() else {"entries": []}

def improvement_trend(history, window=3):
    if len(history) < window + 1:
        return 0.0
    return round(sum(history[-window:]) / window - sum(history[-window-1:-1]) / window, 3)

def memory_record(n, mean, history, judged):
    mem = memory_load()
    drag = min(judged, key=lambda j: dim_mean(j["dims"]))
    mem["entries"].append({
        "iter": n, "mean": round(mean, 3),
        "trend": improvement_trend(history),
        "dragging_case": drag["case"], "failure": drag.get("failure", ""),
        "fix_target": drag.get("fix_target", ""),
        "regression": improvement_trend(history) < -0.05,
    })
    MEMORY.write_text(json.dumps(mem, indent=2))
    return mem

def memory_brief(mem, k=5):
    return "\n".join(
        f"- iter{e['iter']}: mean={e['mean']} trend={e['trend']}"
        f"{' REGRESSION' if e['regression'] else ''} | {e['fix_target']}: {e['failure']}"
        for e in mem["entries"][-k:])

# ─────────────────────────── parent selection ───────────────────────────
def pick_parent(archive):
    if not archive:
        return None
    perfs = [a["mean"] for a in archive]
    mid = sorted(perfs, reverse=True)[:max(1, len(perfs)//4)]
    a_mid = sum(mid) / len(mid)
    weights = [
        (1 / (1 + math.exp(-3 * (a["mean"] - a_mid)))) * (1 / (1 + a.get("children", 0)))
        for a in archive
    ]
    return archive[max(range(len(archive)), key=lambda i: weights[i])]

# ─────────────────────────── prompts ───────────────────────────
JUDGE_SYS = (
    "You are a strict evaluator. Score ONLY the response against the rubric. "
    "You cannot see the skill instructions — judge the output, not intent. "
    "The response is a single advisory turn: grade whether its GUIDANCE correctly "
    "applies each principle, NOT whether it literally ran a multi-phase loop or "
    "spawned real subagents. Score ONLY the dimensions listed as APPLICABLE for "
    "this case; OMIT every other dimension from the output entirely. "
    "Output ONLY a single JSON object starting with '{'. No preamble."
)

META_SYS = (
    "You are the meta agent in a self-improving skill loop for the 'take-ownership' skill. "
    "You receive the current skill body, per-dimension judge scores, and failure diagnoses. "
    "Fix the failing dimension BY GENERAL PRINCIPLE, not by patching individual cases.\n\n"
    "CRITICAL OUTPUT CONTRACT: emit the COMPLETE revised SKILL.md file CONTENTS verbatim, "
    "starting with the '---' YAML frontmatter and ending with the last line of the body. "
    "Do NOT describe your changes. Do NOT summarize. Output the file itself, nothing else — "
    "it will be written straight to disk."
)


def is_valid_variant(text):
    t = text.strip()
    if not t.startswith("---"):
        return False
    if "name:" not in t[:200]:
        return False
    bad = ("the revised skill", "i revised", "i added", "here is the revised",
           "this revision", "summary of changes")
    return not any(b in t[:400].lower() for b in bad)


def strip_fences(text):
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n", "", t)
        t = re.sub(r"\n```$", "", t)
    return t.strip()


def judge_prompt(case, response, rubric, applies):
    return (f"# Rubric\n{rubric}\n\n# Case\n{case}\n\n"
            f"# APPLICABLE dimensions (score only these)\n{', '.join(applies)}\n\n"
            f"# Response to score\n{response}\n\n"
            'Return ONLY JSON with ONLY the applicable dims: '
            '{"dims": {"<dim>": <0-5>, ...}, '
            '"failure": "<one line>", "fix_target": "<skill section>"}')


def meta_prompt(body, judged, insights, pmean):
    lines = [f"- {j['case']}: dims={j['dims']} failure={j['failure']} fix={j['fix_target']}"
             for j in judged]
    return (f"# Current skill body\n{body}\n\n"
            f"# Current mean: {pmean:.2f} (do NOT regress dims already scoring high)\n\n"
            "# This round's scores\n" + "\n".join(lines) +
            f"\n\n# Prior insights\n{insights}\n\n"
            "Make the smallest general-principle edit that lifts the dragging dimension "
            "without lowering others. Output the complete revised SKILL.md file only.")

# ─────────────────────────── one round ───────────────────────────
def stage_skill(body, n):
    stage = RUNS / f"iter-{n}" / ".claude/skills" / SKILL_NAME
    write(stage / "SKILL.md", body)
    return RUNS / f"iter-{n}"


def run_doer(body, case_path, n, mode):
    _, case = parse_case(case_path)
    try:
        if mode == "stage":
            cwd = stage_skill(body, n)
            return run_agent(f"Use the {SKILL_NAME} skill.\n\n{case}", cwd=cwd,
                             model=MODEL_DOER, allowed=ALLOWED_RO)
        return run_agent(case, system=body, model=MODEL_DOER, allowed=ALLOWED_RO)
    except Exception as e:
        return (f"[doer failed: {type(e).__name__}]", 0.0)


def round_once(n, body, cases, rubric, mode):
    cost = 0.0
    with cf.ThreadPoolExecutor(max_workers=PARALLEL) as ex:
        doer_out = list(ex.map(lambda c: run_doer(body, c, n, mode), cases))
    responses = [(cases[i].name, r) for i, (r, _) in enumerate(doer_out)]
    cost += sum(c for _, c in doer_out)

    def judge_one(args):
        cname, (resp, _) = args
        applies, case = parse_case(next(c for c in cases if c.name == cname))
        cost_acc = 0.0
        for _ in range(2):
            txt, jc = run_agent(judge_prompt(case, resp, rubric, applies),
                                system=JUDGE_SYS, model=MODEL_JUDGE, allowed=ALLOWED_RO)
            cost_acc += jc
            try:
                j = extract_json(txt); j["case"] = cname
                return j, cost_acc
            except (ValueError, json.JSONDecodeError):
                continue
        return ({"dims": {d: 0 for d in applies}, "failure": "judge parse failed",
                 "fix_target": "", "case": cname}, cost_acc)

    with cf.ThreadPoolExecutor(max_workers=PARALLEL) as ex:
        judged_out = list(ex.map(judge_one, zip([r[0] for r in responses], doer_out)))
    judged = [j for j, _ in judged_out]
    cost += sum(c for _, c in judged_out)
    mean = sum(dim_mean(j["dims"]) for j in judged) / len(judged)
    return judged, mean, cost

# ─────────────────────────── stop logic ───────────────────────────
def plateaued(history):
    if len(history) < 3:
        return False
    a, b, c = history[-3], history[-2], history[-1]
    return (b - a) <= PLATEAU_DELTA and (c - b) <= PLATEAU_DELTA

# ─────────────────────────── main ───────────────────────────
def init_skeleton():
    for d in ["cases/train", "cases/holdout", "driver/iterations", "driver/archive", "driver/runs"]:
        (EVALS / d).mkdir(parents=True, exist_ok=True)
    if not (EVALS / "RUBRIC.md").exists():
        write(EVALS / "RUBRIC.md", "# Rubric\n\n## <dimension>\n- 5=right 3=partial 0=violates\n")
    print(f"scaffolded {EVALS}. Add RUBRIC dims + frozen cases/train + cases/holdout, then rerun.")


def append_scores_md(n, mean, judged):
    if not SCORES_MD.exists():
        write(SCORES_MD, "# Scores\n\n| iter | mean | note |\n|---|---|---|\n")
    with open(SCORES_MD, "a") as f:
        f.write(f"| {n} | {mean:.2f} | {judged[0].get('failure','')[:50]} |\n")


def ship(archive):
    key = "holdout" if any("holdout" in a for a in archive) else "mean"
    best = max(archive, key=lambda a: a.get(key, a["mean"]))
    print(f"\nWINNER: {best['path']} ({key}={best.get(key, best['mean']):.2f})")
    print(f"To ship: cp '{EVALS}/{best['path']}' '{SUT_PATH}/SKILL.md'  (review first)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", action="store_true")
    ap.add_argument("--mode", choices=["inject", "stage"], default="inject")
    args = ap.parse_args()

    if args.init:
        init_skeleton(); return

    rubric = read(EVALS / "RUBRIC.md")
    train = load_cases("train")
    holdout = load_cases("holdout")
    if not train:
        sys.exit("no train cases — run `python driver-to.py --init`, freeze cases, retry.")

    archive = load_archive()
    history = [a["mean"] for a in archive]
    total_cost = sum(a.get("cost", 0) for a in archive)
    n = len(archive)

    if not archive:
        body = read(SUT_PATH / "SKILL.md")
        write(ARCHIVE / "v0.md", body)
        judged, mean, cost = round_once(0, body, train, rubric, args.mode)
        archive.append({"path": "archive/v0.md", "mean": mean, "children": 0, "cost": cost})
        history.append(mean); total_cost += cost; n = 1
        save_archive(archive)
        write(ITERS_DIR / "iter-0.md", json.dumps(judged, indent=2))
        memory_record(0, mean, history, judged)
        print(f"[v0 baseline] mean={mean:.2f} cost=${cost:.2f}")

    while n < MAX_ITERS and total_cost < BUDGET_USD and not plateaued(history):
        parent = pick_parent(archive)
        parent["children"] = parent.get("children", 0) + 1
        body = read(ARCHIVE.parent / parent["path"])
        insights = memory_brief(memory_load())

        pjudged, pmean, pcost = round_once(n, body, train, rubric, args.mode)
        mcost = 0.0; variant = None
        for attempt in range(3):
            raw, mc = run_agent(meta_prompt(body, pjudged, insights, pmean),
                                system=META_SYS, model=MODEL_META, allowed=ALLOWED_RO)
            mcost += mc
            cand = strip_fences(raw)
            if is_valid_variant(cand):
                variant = cand; break
            print(f"  meta attempt {attempt+1}: invalid variant, retrying")
        if variant is None:
            print(f"  meta failed after 3 tries — keeping parent, skipping iter {n}")
            total_cost += mcost + pcost; n += 1
            continue
        vpath = f"archive/v{n}.md"
        write(ARCHIVE / f"v{n}.md", variant)

        judged, mean, cost = round_once(n, variant, train, rubric, args.mode)
        cost += mcost + pcost
        archive.append({"path": vpath, "mean": mean, "children": 0, "cost": cost})
        history.append(mean); total_cost += cost
        save_archive(archive)
        write(ITERS_DIR / f"iter-{n}.md", json.dumps(judged, indent=2))
        append_scores_md(n, mean, judged)
        memory_record(n, mean, history, judged)
        trend = improvement_trend(history)
        print(f"[v{n}] mean={mean:.2f} trend={trend:+.2f} cost=${cost:.2f} total=${total_cost:.2f}")

        if holdout and n % HOLDOUT_EVERY == 0:
            best = max(archive, key=lambda a: a["mean"])
            hbody = read(ARCHIVE.parent / best["path"])
            _, hmean, hc = round_once(n, hbody, holdout, rubric, args.mode)
            total_cost += hc
            print(f"  holdout(best={best['path']}) mean={hmean:.2f}")
            best["holdout"] = hmean
            save_archive(archive)
        n += 1

    ship(archive)


if __name__ == "__main__":
    main()
