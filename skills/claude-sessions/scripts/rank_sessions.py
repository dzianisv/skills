#!/usr/bin/env python3
"""Cheaply rank past Claude Code sessions before deep-reading them.

Scans ~/.claude/projects/<dashified-cwd>/<sessionId>.jsonl files and scores each
by keyword hits in cheap metadata (custom-title, last-prompt, first user message)
plus raw whole-file keyword hit counts. Prints a ranked candidate list as JSON so
the caller can dispatch one subagent per top candidate for the deep read.

Usage:
  rank_sessions.py [--project PATH] [--limit N] [--days N] KEYWORD [KEYWORD ...]

  --project PATH   Restrict to one project cwd (e.g. ~/workspace/OpenClawBot).
                   Matches that dir and sibling variants (…-OpenClawBot, …-OpenClawBot-2).
  --limit N        Max candidates to print (default 8).
  --days N         Only sessions modified within the last N days.
  KEYWORD          Topic terms; ranking favors files matching more of them.
                   With no keywords, lists most-recent sessions (browse mode).
"""
import argparse, glob, json, os, sys, time

PROJECTS = os.path.expanduser("~/.claude/projects")


def dashify(path):
    """Mirror Claude Code's cwd->dir encoding: / and . become -."""
    p = os.path.abspath(os.path.expanduser(path))
    return p.replace("/", "-").replace(".", "-")


def project_dirs(project):
    if not project:
        return sorted(glob.glob(os.path.join(PROJECTS, "*")))
    base = dashify(project)
    # exact dir + sibling variants (…-OpenClawBot-2)
    hits = []
    for d in sorted(glob.glob(os.path.join(PROJECTS, "*"))):
        name = os.path.basename(d)
        if name == base or name.startswith(base + "-"):
            hits.append(d)
    return hits


def scan_file(path, kws):
    """Single streaming pass: extract ranking meta AND count keyword hits.

    Returns (title, last_prompt, first_user, file_hits). Meta lines are sparse
    and parsed as JSON; keyword counting works on the raw lowercased line so the
    whole transcript is scanned exactly once without loading it all into memory.
    """
    title = last_prompt = first_user = None
    file_hits = 0
    noise = ("<local-command", "<command-name", "<command-message")
    try:
        with open(path, "r", errors="replace") as fh:
            for line in fh:
                if kws:
                    low = line.lower()
                    for k in kws:
                        file_hits += low.count(k)
                if title and last_prompt and first_user:
                    continue  # keep counting hits, stop parsing meta
                if '"type"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                t = d.get("type")
                if t == "custom-title" and not title:
                    title = d.get("customTitle")
                elif t == "last-prompt" and not last_prompt:
                    last_prompt = d.get("lastPrompt")
                elif t == "user" and not first_user:
                    m = d.get("message", {})
                    c = m.get("content")
                    if isinstance(c, str):
                        txt = c
                    elif isinstance(c, list):
                        txt = " ".join(
                            p.get("text", "") for p in c
                            if isinstance(p, dict) and p.get("type") == "text"
                        )
                    else:
                        txt = ""
                    txt = txt.strip()
                    if txt and not txt.startswith(noise):
                        first_user = txt[:300]
    except Exception:
        pass
    return title, last_prompt, first_user, file_hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=None)
    ap.add_argument("--limit", type=int, default=8)
    ap.add_argument("--days", type=int, default=None)
    ap.add_argument("keywords", nargs="*")
    a = ap.parse_args()

    dirs = project_dirs(a.project)
    if a.project and not dirs:
        print(json.dumps({"error": f"no project dir for {a.project}",
                          "looked_for": dashify(a.project)}, indent=2))
        return

    kws = [k.lower() for k in a.keywords]
    cutoff = time.time() - a.days * 86400 if a.days else None
    rows = []
    for d in dirs:
        for f in glob.glob(os.path.join(d, "*.jsonl")):
            mtime = os.path.getmtime(f)
            if cutoff and mtime < cutoff:
                continue
            size = os.path.getsize(f)
            title, last_prompt, first_user, file_hits = scan_file(f, kws)
            meta_blob = " ".join(filter(None, [title, last_prompt, first_user])).lower()
            meta_hits = sum(1 for k in kws if k in meta_blob)
            # score: meta matches dominate, file hits break ties, recency nudges
            score = meta_hits * 1000 + min(file_hits, 500) + mtime / 1e12
            if kws and file_hits == 0 and meta_hits == 0:
                continue
            rows.append({
                "session_id": os.path.basename(f)[:-6],
                "path": f,
                "project_dir": os.path.basename(d),
                "date": time.strftime("%Y-%m-%d %H:%M", time.localtime(mtime)),
                "size_kb": round(size / 1024, 1),
                "title": title,
                "last_prompt": (last_prompt or "")[:160] or None,
                "first_user": (first_user or "")[:160] or None,
                "keyword_meta_matches": meta_hits,
                "keyword_file_hits": file_hits,
                "_score": score,
            })

    rows.sort(key=lambda r: r["_score"], reverse=True)
    rows = rows[: a.limit]
    for r in rows:
        del r["_score"]
    print(json.dumps({"query": kws, "project": a.project,
                      "candidates": rows, "count": len(rows)}, indent=2))


if __name__ == "__main__":
    main()
