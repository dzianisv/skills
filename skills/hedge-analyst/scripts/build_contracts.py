#!/usr/bin/env python3
"""Contracts and customers chart — hedge-analyst deep dive.
Tool: matplotlib (Python). One chart, one script — see SKILL.md "Scripts".
Writes the PNG preview (argv 1, default ~/workspace/your_files/growth6-contracts.png).
Data are FILED constants (they change only when a new 10-Q / 10-K / earnings release lands) —
update the dicts below at run time from the filings, never from memory:
  RPO: NVDA 3.2 (10-Q Q2 FY27 — NOT the order book, POs convert in weeks),
       AVGO 179.2 (10-Q Aug 2, 2026), PLTR 4.9 (Q3 2026 release),
       AMD / TSM / MRVL file none (AMD's 14 GW are frameworks, not backlog).
  Largest customer % of revenue: NVDA 16 (Customer A, H1 FY27, unnamed),
       AMD <10 (no customer >= 10%, FY2025), AVGO 50 (one distributor, Q3 FY26),
       TSM 19 (Nvidia, FY2025 20-F attribution), MRVL 45 (Distributor A),
       PLTR 16 (top 3, FY2025 10-K).
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording."""
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

out_path = sys.argv[1] if len(sys.argv) > 1 else '/home/hatch/workspace/your_files/growth6-contracts.png'
ORDER = ['NVDA', 'AMD', 'AVGO', 'TSM', 'MRVL', 'PLTR']
RPO = {'NVDA': 3.2, 'AMD': 0, 'AVGO': 179.2, 'TSM': 0, 'MRVL': 0, 'PLTR': 4.9}
CUST = {'NVDA': 16, 'AMD': 10, 'AVGO': 50, 'TSM': 19, 'MRVL': 45, 'PLTR': 16}
plt.rcParams.update({'font.size': 11})

fig, (c1, c2) = plt.subplots(1, 2, figsize=(15, 5.2))
x = np.arange(6)
c1.bar(x, [RPO[t] for t in ORDER], 0.6, color='#2c7fb8')
c1.set_xticks(x); c1.set_xticklabels(ORDER)
c1.set_title('Remaining performance obligations, USD B (filed)')
c1.set_ylabel('USD B'); c1.grid(alpha=0.3, axis='y')
for i, t in enumerate(ORDER):
    lab = f'{RPO[t]:.1f}' if RPO[t] else 'files none'
    c1.text(i, RPO[t] + 5, lab, ha='center', fontsize=9)
c2.bar(x, [CUST[t] for t in ORDER], 0.6, color='#e34a33')
c2.set_xticks(x); c2.set_xticklabels(ORDER)
c2.set_title('Largest customer, % of revenue')
c2.set_ylabel('%'); c2.grid(alpha=0.3, axis='y')
for i, t in enumerate(ORDER):
    lab = '<10' if t == 'AMD' else f'{CUST[t]}%'
    c2.text(i, CUST[t] + 1.5, lab, ha='center', fontsize=9)
fig.suptitle('Growth deep dive — contracts and customers (filed figures only)', fontsize=13)
fig.tight_layout(rect=[0, 0, 1, 0.94])
fig.savefig(out_path, dpi=150)
print('wrote', out_path)
