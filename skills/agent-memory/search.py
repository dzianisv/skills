#!/usr/bin/env python3
"""BM25 search over ~/.agents/memory/ using SQLite FTS5."""
import sqlite3, os, sys

if len(sys.argv) < 2:
    print("Usage: search.py <query terms>", file=sys.stderr)
    sys.exit(1)

q = " ".join(sys.argv[1:])
db_path = os.path.expanduser("~/.agents/memory/index.db")

if not os.path.exists(db_path):
    print("No index found — run index.py first.", file=sys.stderr)
    sys.exit(1)

db = sqlite3.connect(db_path)
rows = db.execute(
    "SELECT path, snippet(mem,1,'>>','<<','…',20), rank "
    "FROM mem WHERE mem MATCH ? ORDER BY rank LIMIT 5",
    (q,),
).fetchall()

if not rows:
    print("No results.")
else:
    for path, snip, _ in rows:
        print(f"[{os.path.basename(path)}] {snip}")
