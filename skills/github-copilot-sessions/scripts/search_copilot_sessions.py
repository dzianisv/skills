#!/usr/bin/env python3
"""Search past GitHub Copilot CLI sessions by topic via BM25.

Two ranked-retrieval paths:
  1. FTS5 (default): opens ~/.copilot/session-store.db read-only, runs an FTS5
     MATCH query whose built-in `rank` column is BM25 (lower = better match).
     Fast — covers ~15 k indexed rows in milliseconds.
  2. jsonl BM25 (--no-db): implements Okapi BM25 (k1=1.5, b=0.75) in pure
     stdlib Python over ~/.copilot/session-state/*/events.jsonl.  Covers any
     sessions absent from the DB and is the path the user explicitly asked for.

Usage:
  search_copilot_sessions.py [--project PATH] [--days N] [--limit N] [--no-db] QUERY...
  search_copilot_sessions.py "provisioning"                 # FTS5 path
  search_copilot_sessions.py --no-db "provisioning"         # jsonl BM25 path
  search_copilot_sessions.py --project ~/workspace/foo "docker compose"
  search_copilot_sessions.py --days 14 "deployment"
  search_copilot_sessions.py                                # browse mode: recent sessions
"""
import argparse, glob, json, math, os, re, sqlite3, sys, time

SESSION_DB   = os.path.expanduser("~/.copilot/session-store.db")
SESSION_STATE = os.path.expanduser("~/.copilot/session-state")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    """Lowercase, split on non-alphanumeric, drop empties."""
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if t]


def _cwd_match(cwd: str | None, project: str | None) -> bool:
    """True when cwd is under the requested project path (or no filter set)."""
    if not project or not cwd:
        return not project  # if project set but cwd missing, exclude
    proj = os.path.abspath(os.path.expanduser(project))
    return cwd == proj or cwd.startswith(proj + "/") or cwd.startswith(proj + os.sep)


def _age_ok(date_str: str | None, cutoff: float | None) -> bool:
    """True when the ISO date string is newer than cutoff (epoch seconds)."""
    if cutoff is None or not date_str:
        return True
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
        try:
            t = time.mktime(time.strptime(date_str[:26], fmt))
            return t >= cutoff
        except ValueError:
            pass
    return True


# ---------------------------------------------------------------------------
# Path 1: FTS5 BM25 via session-store.db
# ---------------------------------------------------------------------------

def search_fts5(query: str, project: str | None, days: int | None, limit: int) -> dict:
    """Run FTS5 MATCH; rank column IS BM25 (lower = better). Aggregate per session."""
    if not os.path.exists(SESSION_DB):
        return None  # signal caller to fall back

    cutoff = time.time() - days * 86400 if days else None
    try:
        con = sqlite3.connect(f"file:{SESSION_DB}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return None

    sql = """
        SELECT s.id, s.summary AS title, s.cwd, s.repository, s.branch,
               s.created_at,
               si.source_type,
               snippet(search_index, 0, '[', ']', '…', 24) AS snippet,
               si.rank
        FROM   search_index si
        JOIN   sessions s ON s.id = si.session_id
        WHERE  search_index MATCH ?
        ORDER  BY si.rank
        LIMIT  ?
    """
    try:
        rows = con.execute(sql, (query, limit * 10)).fetchall()
    except sqlite3.OperationalError:
        con.close()
        return None
    con.close()

    # aggregate best (lowest) rank per session
    seen: dict[str, dict] = {}
    for sid, title, cwd, repo, branch, created_at, src_type, snippet, rank in rows:
        if not _cwd_match(cwd, project):
            continue
        if not _age_ok(created_at, cutoff):
            continue
        if sid not in seen or rank < seen[sid]["_rank"]:
            seen[sid] = {
                "session_id":  sid,
                "cwd":         cwd,
                "repository":  repo,
                "branch":      branch,
                "title":       title or "",
                "date":        (created_at or "")[:19].replace("T", " "),
                "score":       round(-rank, 6),   # negate so higher = better for display
                "snippet":     snippet or "",
                "source_type": src_type,
                "_rank":       rank,
            }

    candidates = sorted(seen.values(), key=lambda r: r["_rank"])
    for c in candidates:
        del c["_rank"]
    candidates = candidates[:limit]
    return {
        "query":      query,
        "project":    project,
        "source":     "fts5",
        "candidates": candidates,
        "count":      len(candidates),
    }


# ---------------------------------------------------------------------------
# Path 2: Okapi BM25 over events.jsonl  (stdlib, no yaml)
# ---------------------------------------------------------------------------

def _parse_workspace_yaml(path: str) -> dict:
    """Minimal key: value parser — no PyYAML needed."""
    out: dict = {}
    try:
        with open(path, errors="replace") as fh:
            for line in fh:
                if ":" in line:
                    k, _, v = line.partition(":")
                    out[k.strip()] = v.strip()
    except OSError:
        pass
    return out


def _extract_session_text(jsonl_path: str) -> tuple[str, str, str, str, str]:
    """Single streaming pass over events.jsonl.

    Returns (cwd, repository, created_at, title, searchable_text).
    Searchable text is built from: user.message, assistant.message (when non-empty),
    tool.execution_complete result, session.compaction_complete summaryContent,
    session.task_complete summary, and session.start context fields.
    """
    cwd = repo = created_at = title = ""
    parts: list[str] = []
    try:
        with open(jsonl_path, errors="replace") as fh:
            for raw in fh:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    ev = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                t  = ev.get("type", "")
                d  = ev.get("data", {}) or {}
                ts = ev.get("timestamp", "")

                if t == "session.start":
                    ctx = d.get("context", {}) or {}
                    cwd       = ctx.get("cwd", "")
                    repo      = ctx.get("repository", "")
                    created_at = d.get("startTime", ts)
                    # index start context text too
                    parts.append(f"{cwd} {repo} {ctx.get('branch', '')}")

                elif t == "user.message":
                    txt = d.get("content", "") or ""
                    if txt:
                        parts.append(txt[:4000])

                elif t == "assistant.message":
                    txt = d.get("content", "") or ""
                    if txt:
                        parts.append(txt[:2000])

                elif t == "tool.execution_complete":
                    res = d.get("result", {}) or {}
                    txt = res.get("content", "") if isinstance(res, dict) else ""
                    if txt:
                        parts.append(txt[:2000])

                elif t == "session.compaction_complete":
                    txt = d.get("summaryContent", "") or ""
                    if txt:
                        parts.append(txt[:6000])

                elif t == "session.task_complete":
                    txt = d.get("summary", "") or ""
                    if txt:
                        title = txt[:120]
                        parts.append(txt[:6000])

    except OSError:
        pass
    return cwd, repo, created_at, title, " ".join(parts)


def _bm25_score(tf: int, df: int, N: int, dl: int, avgdl: float,
                k1: float = 1.5, b: float = 0.75) -> float:
    idf = math.log((N - df + 0.5) / (df + 0.5) + 1.0)
    return idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl))


def search_jsonl_bm25(query: str, project: str | None, days: int | None, limit: int) -> dict:
    """Pure-Python Okapi BM25 (k1=1.5, b=0.75) over events.jsonl files."""
    cutoff = time.time() - days * 86400 if days else None
    qtokens = _tokenize(query) if query else []

    # Discover all session dirs
    session_dirs = sorted(glob.glob(os.path.join(SESSION_STATE, "*")))

    # First pass: collect per-session doc info
    docs: list[dict] = []
    for sdir in session_dirs:
        sid = os.path.basename(sdir)
        jsonl = os.path.join(sdir, "events.jsonl")
        yaml_path = os.path.join(sdir, "workspace.yaml")

        if not os.path.isfile(jsonl):
            continue

        # Apply --days filter by file mtime (cheap)
        if cutoff and os.path.getmtime(jsonl) < cutoff:
            continue

        cwd, repo, created_at, ev_title, text = _extract_session_text(jsonl)

        if not _cwd_match(cwd, project):
            continue
        if not _age_ok(created_at, cutoff):
            continue

        # workspace.yaml may have a better title / created_at
        ws = _parse_workspace_yaml(yaml_path)
        title = ws.get("summary") or ev_title or ""
        if not created_at:
            created_at = ws.get("created_at", "")
        if not cwd:
            cwd = ws.get("cwd", "")
        if not repo:
            repo = ws.get("repository", "")

        tokens = _tokenize(text)
        docs.append({
            "session_id":  sid,
            "cwd":         cwd,
            "repository":  repo,
            "title":       title,
            "date":        (created_at or "")[:19].replace("T", " "),
            "text":        text,
            "tokens":      tokens,
        })

    if not docs:
        return {
            "query":      query,
            "project":    project,
            "source":     "jsonl-bm25",
            "candidates": [],
            "count":      0,
            "looked_for": SESSION_STATE,
        }

    # Browse mode — no keywords → return most recent N
    if not qtokens:
        # sort by date desc
        docs.sort(key=lambda d: d["date"], reverse=True)
        candidates = []
        for doc in docs[:limit]:
            candidates.append({
                "session_id":  doc["session_id"],
                "cwd":         doc["cwd"],
                "repository":  doc["repository"],
                "title":       doc["title"],
                "date":        doc["date"],
                "score":       0.0,
                "snippet":     doc["text"][:200],
                "source_type": "jsonl",
            })
        return {"query": query, "project": project, "source": "jsonl-bm25",
                "candidates": candidates, "count": len(candidates)}

    N = len(docs)
    # IDF: document frequency per query token
    df: dict[str, int] = {t: 0 for t in qtokens}
    total_dl = 0
    for doc in docs:
        tset = set(doc["tokens"])
        for t in qtokens:
            if t in tset:
                df[t] += 1
        total_dl += len(doc["tokens"])
    avgdl = total_dl / N if N else 1.0

    # Score each doc
    scored: list[tuple[float, dict]] = []
    for doc in docs:
        toks = doc["tokens"]
        dl   = len(toks)
        tf_map: dict[str, int] = {}
        for tok in toks:
            tf_map[tok] = tf_map.get(tok, 0) + 1

        score = 0.0
        for t in qtokens:
            if df[t] == 0:
                continue
            score += _bm25_score(tf_map.get(t, 0), df[t], N, dl, avgdl)

        if score > 0:
            scored.append((score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Build snippet: first 200 chars of text around a matching token
    def _snippet(text: str, tokens: list[str]) -> str:
        low = text.lower()
        for t in tokens:
            idx = low.find(t)
            if idx >= 0:
                start = max(0, idx - 60)
                return ("…" if start else "") + text[start:start + 220] + "…"
        return text[:200]

    candidates = []
    for score, doc in scored[:limit]:
        candidates.append({
            "session_id":  doc["session_id"],
            "cwd":         doc["cwd"],
            "repository":  doc["repository"],
            "title":       doc["title"],
            "date":        doc["date"],
            "score":       round(score, 4),
            "snippet":     _snippet(doc["text"], qtokens),
            "source_type": "jsonl",
        })

    result: dict = {
        "query":      query,
        "project":    project,
        "source":     "jsonl-bm25",
        "candidates": candidates,
        "count":      len(candidates),
    }
    if not candidates:
        result["looked_for"] = SESSION_STATE
    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(
        description="Search GitHub Copilot CLI sessions via BM25.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("query", nargs="*", help="Search keywords (omit for browse mode)")
    ap.add_argument("--project", default=None,
                    help="Filter by project cwd (e.g. ~/workspace/foo)")
    ap.add_argument("--days",  type=int, default=None,
                    help="Only sessions from the last N days")
    ap.add_argument("--limit", type=int, default=8,
                    help="Max results (default 8)")
    ap.add_argument("--no-db", action="store_true",
                    help="Skip SQLite FTS5; run pure-Python BM25 over events.jsonl")
    args = ap.parse_args()

    query_str = " ".join(args.query)

    if not args.no_db and query_str:
        result = search_fts5(query_str, args.project, args.days, args.limit)
        if result is not None:
            print(json.dumps(result, indent=2))
            return
        # DB missing or query failed — fall through to jsonl path

    result = search_jsonl_bm25(query_str, args.project, args.days, args.limit)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
