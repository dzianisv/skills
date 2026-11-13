#!/usr/bin/env python3
"""Quarterly revenue chart — hedge-analyst deep dive.
Tool: matplotlib (Python). One chart, one script — see SKILL.md "Scripts".
Reads the run's summary JSON (argv 1, default /tmp/growth6_summary.json):
  per ticker: q_rev_b (newest-first, 5 quarters), price.
Writes the PNG preview (argv 2, default ~/workspace/your_files/growth6-earnings.png).
Left panel: quarterly revenue, USD B. Right panel: revenue indexed (earliest quarter = 100).
The lists in the JSON are newest-first — they are reversed here so time runs oldest -> latest.
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording."""
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

summary_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/growth6_summary.json'
out_path = sys.argv[2] if len(sys.argv) > 2 else '/home/hatch/workspace/your_files/growth6-earnings.png'
S = json.load(open(summary_path))
# ORDER: the tickers in this run, in canonical order (the run's JSON decides
# which tickers — the script is not hard-coded to one run's set).
PREFERRED = ['NVDA', 'AVGO', 'AMD', 'PLTR', 'GOOG', 'TSM', 'MRVL']
ORDER = [t for t in PREFERRED if t in S]
COLORS = {'NVDA': '#76b900', 'AMD': '#ed1c24', 'AVGO': '#cc092f',
          'TSM': '#0057b8', 'MRVL': '#f26522', 'PLTR': '#111111',
          'GOOG': '#4285f4'}
Q = ['Q-4', 'Q-3', 'Q-2', 'Q-1', 'Latest q']
plt.rcParams.update({'font.size': 11})

fig, (a1, a2) = plt.subplots(1, 2, figsize=(15, 5.2))
x = np.arange(5)
for t in ORDER:
    rev = list(reversed(S[t].get('q_rev_b') or S[t]['rev_q']))  # oldest first
    a1.plot(x, rev, marker='o', label=t, color=COLORS[t], linewidth=2)
a1.set_xticks(x); a1.set_xticklabels(Q)
a1.set_title('Quarterly revenue, USD B')
a1.set_ylabel('USD B'); a1.grid(alpha=0.3); a1.legend(ncol=3, fontsize=9)
for t in ORDER:
    rev = list(reversed(S[t].get('q_rev_b') or S[t]['rev_q']))
    base = rev[0]
    a2.plot(x, [v / base * 100 for v in rev], marker='o', label=t, color=COLORS[t], linewidth=2)
a2.set_xticks(x); a2.set_xticklabels(Q)
a2.set_title('Revenue indexed: earliest quarter = 100')
a2.set_ylabel('Index'); a2.grid(alpha=0.3); a2.legend(ncol=3, fontsize=9)
fig.suptitle('Growth deep dive — quarterly revenue', fontsize=13)
fig.tight_layout(rect=[0, 0, 1, 0.94])
fig.savefig(out_path, dpi=150)
print('wrote', out_path)
