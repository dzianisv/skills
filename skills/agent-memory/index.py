#!/usr/bin/env python3
"""Rebuild the BM25 index over ~/.agents/memory/*.md using SQLite FTS5."""
import sqlite3, glob, os

memory_dir = os.path.expanduser("~/.agents/memory/")
db_path = os.path.join(memory_dir, "index.db")

db = sqlite3.connect(db_path)
db.execute(
    "CREATE VIRTUAL TABLE IF NOT EXISTS mem "
    "USING fts5(path, body, tokenize='porter unicode61')"
)
db.execute("DELETE FROM mem")

files = [f for f in glob.glob(os.path.join(memory_dir, "*.md"))
         if os.path.basename(f) != "index.db"]

for f in files:
    db.execute("INSERT INTO mem VALUES (?, ?)", (f, open(f).read()))

db.commit()
print(f"Indexed {len(files)} file(s).")
