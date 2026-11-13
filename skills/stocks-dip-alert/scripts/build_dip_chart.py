#!/usr/bin/env python3
"""Dip chart — % down from the 52-week high. The chart the dip alert posts.
Tool: matplotlib (Python). One chart, one script — see stocks-dip-alert SKILL.md.
Reads the run's JSON (argv 1):
  {"as_of": "Thu Nov 12, ~14:00 EST", "rows": [{"ticker": "COIN", "pct": -57.5}, ...],
   "footnote": "Prices ~14:00 EST Nov 12 (market open, closes 16:00 EST). NVDA -5.2% today, off the $148.80 low. AVGO +5.3% today."}
  pct = price vs 52-week high, in percent (negative = below the high).
Writes the PNG preview (argv 2, default ~/workspace/your_files/dip-chart.png).
Horizontal bars, worst (most negative) at the top. Colors by dip level:
  red <= -25% | orange -25% to -20% | gold -20% to -15% | green above -15%.
Dashed vertical lines at -15% / -20% / -25% — the alert thresholds.
Value labels inside the bar (white bold) when the bar is wide, else outside (dark).
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording."""
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

in_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dip_alert.json'
out_path = sys.argv[2] if len(sys.argv) > 2 else '/home/hatch/workspace/your_files/dip-chart.png'
D = json.load(open(in_path))
rows = sorted(D['rows'], key=lambda r: r['pct'])
names = [r['ticker'] for r in rows]
pcts = [r['pct'] for r in rows]

def color(p):
    if p <= -25:
        return '#c0392b'
    if p <= -20:
        return '#e67e22'
    if p <= -15:
        return '#f1c40f'
    return '#27ae60'

plt.rcParams.update({'font.size': 11})
fig, ax = plt.subplots(figsize=(13, 8))
y = np.arange(len(names))
ax.barh(y, pcts, 0.62, color=[color(p) for p in pcts])
for i, p in enumerate(pcts):
    lab = f'{p:.1f}%'
    if abs(p) >= 8:
        ax.text(p + 1, i, lab, va='center', ha='left', fontsize=11, fontweight='bold', color='white')
    else:
        ax.text(p - 1, i, lab, va='center', ha='right', fontsize=11, fontweight='bold', color='#333333')
for v in (-15, -20, -25):
    ax.axvline(v, color='#888888', linestyle='--', linewidth=0.9)
ax.set_yticks(y); ax.set_yticklabels(names)
ax.invert_yaxis()
ax.set_xlabel('% down from 52-week high  (dashed lines: -15% / -20% / -25%)')
ax.set_xlim(min(pcts) - 8, 2)
ax.set_title(f"Mid-session, {D['as_of']} — how far each name is below its 52-week high",
             fontsize=14, fontweight='bold', pad=12)
ax.spines[['top', 'right']].set_visible(False)
fig.text(0.5, 0.01, D.get('footnote', ''), ha='center', fontsize=10, color='#666666')
fig.tight_layout(rect=[0, 0.04, 1, 0.96])
fig.savefig(out_path, dpi=150)
print('wrote', out_path)
