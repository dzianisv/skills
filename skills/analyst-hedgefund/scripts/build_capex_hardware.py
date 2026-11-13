#!/usr/bin/env python3
"""Capex vs hardware sales — hedge-analyst deep dive, where the AI money goes.
Tool: matplotlib (Python). One chart, one script — see SKILL.md "Scripts".
Writes the PNG preview (argv 1, default ~/workspace/your_files/capex-vs-hardware.png).
Two stacked-bar panels, Q1 2025 - Q3 2026, USD B (filed company reports):
  WHO SPENDS — hyperscaler capex by company (Amazon, Alphabet, Microsoft, Meta,
    Oracle, Apple, Tesla). Totals: 82.33 / 103.18 / 111.26 / 135.42 / 152.85 / 189.79 / 237.40.
  WHO GETS IT — chipmakers' data-center revenue by company (Nvidia DC, AMD DC,
    Broadcom AI, Intel DC, Marvell DC). Totals: 48.85 / 52.13 / 56.25 / 69.36 /
    83.19 / 100.86 / 123.76 — 59% / 51% / 51% / 51% / 54% / 53% / 52% of capex.
TSMC HPC revenue is EXCLUDED from the sellers total — it is already inside Nvidia's
and AMD's numbers (Nvidia buys from TSMC), adding it would double-count.
Source: 'AI Chip Cash Flows — Buyers vs Sellers' sheet (Buyers + Sellers tabs).
Update the dicts below when a new quarter is filed; never from memory.
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording in labels
(the $ in bar labels is a single $ per label, escaped in the source so matplotlib renders it)."""
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

out_path = sys.argv[1] if len(sys.argv) > 1 else '/home/hatch/workspace/your_files/capex-vs-hardware.png'
Q = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']
BUYERS = {  # hyperscaler capex, USD B, filed
    'Amazon':   [25.02, 32.18, 35.10, 39.52, 44.20, 54.21, 77.26],
    'Alphabet': [17.20, 22.45, 23.95, 27.85, 35.67, 44.92, 51.36],
    'Microsoft':[16.75, 17.08, 19.39, 29.88, 30.88, 35.80, 39.37],
    'Meta':     [12.94, 16.54, 18.83, 21.38, 19.00, 30.12, 33.94],
    'Oracle':   [5.86, 9.08, 8.50, 12.03, 18.64, 16.49, 28.50],
    'Apple':    [3.07, 3.46, 3.24, 2.37, 1.97, 2.46, 2.24],
    'Tesla':    [1.49, 2.39, 2.25, 2.39, 2.49, 5.79, 4.73],
}
BUYER_COLORS = {'Amazon': '#ff9900', 'Alphabet': '#5b8def', 'Microsoft': '#00a4ef',
                'Meta': '#1877f2', 'Oracle': '#c74634', 'Apple': '#999999', 'Tesla': '#8b1a1a'}
SELLERS = {  # chipmakers' data-center / AI revenue, USD B, filed
    'Nvidia DC':   [35.58, 39.11, 41.10, 51.22, 62.31, 75.25, 89.02],
    'AMD DC':      [3.67, 3.24, 4.34, 5.38, 5.78, 6.72, 8.55],
    'Broadcom AI': [4.10, 4.40, 5.20, 6.50, 8.40, 10.80, 16.70],
    'Intel DC':    [4.13, 3.94, 4.12, 4.74, 5.05, 6.26, 7.32],
    'Marvell DC':  [1.37, 1.44, 1.49, 1.52, 1.65, 1.83, 2.17],
}
SELLER_COLORS = {'Nvidia DC': '#76b900', 'AMD DC': '#ed1c24', 'Broadcom AI': '#5b2d8e',
                 'Intel DC': '#0068b5', 'Marvell DC': '#009999'}
plt.rcParams.update({'font.size': 11})

fig, (a1, a2) = plt.subplots(2, 1, figsize=(15, 11))
x = np.arange(len(Q))
# --- top panel: who spends ---
bottom = np.zeros(len(Q))
for name, vals in BUYERS.items():
    a1.bar(x, vals, 0.62, bottom=bottom, label=name, color=BUYER_COLORS[name], edgecolor='white', linewidth=0.6)
    bottom += np.array(vals)
for i, tot in enumerate(bottom):
    a1.text(i, tot + 5, f'\\${tot:.0f}B', ha='center', fontsize=11, fontweight='bold')
a1.text(4, 178, 'Oracle x3 in 2026\n(Stargate build)', ha='center', fontsize=10, color='#c74634')
a1.set_xticks(x); a1.set_xticklabels(Q)
a1.set_ylabel('Capex (\\$B)'); a1.set_ylim(0, 265)
a1.set_title('WHO SPENDS — hyperscaler capex by company', loc='left', fontsize=13, fontweight='bold')
a1.legend(ncol=7, fontsize=10, frameon=False, loc='upper left', bbox_to_anchor=(0, 1.14))
a1.grid(alpha=0.3, axis='y')
# --- bottom panel: who gets it ---
bottom = np.zeros(len(Q))
for name, vals in SELLERS.items():
    a2.bar(x, vals, 0.62, bottom=bottom, label=name, color=SELLER_COLORS[name], edgecolor='white', linewidth=0.6)
    bottom += np.array(vals)
capex_tot = np.array([82.33, 103.18, 111.26, 135.42, 152.85, 189.79, 237.40])
for i, tot in enumerate(bottom):
    share = tot / capex_tot[i] * 100
    a2.text(i, tot + 4, f'\\${tot:.0f}B · {share:.0f}% of capex', ha='center', fontsize=11, fontweight='bold')
a2.set_xticks(x); a2.set_xticklabels(Q)
a2.set_ylabel('Hardware sales (\\$B)'); a2.set_ylim(0, 145)
a2.set_title('WHO GETS IT — chipmakers\' data-center revenue by company', loc='left', fontsize=13, fontweight='bold')
a2.legend(ncol=5, fontsize=10, frameon=False, loc='upper left', bbox_to_anchor=(0, 1.14))
a2.grid(alpha=0.3, axis='y')
fig.suptitle('Capex vs Hardware Sales — per quarter, per company', fontsize=16, fontweight='bold')
fig.text(0.5, 0.01,
         'Q1 2025 – Q3 2026, \\$B. Buyers: hyperscaler capex (filed). Sellers: chipmakers\' data-center revenue (filed).\n'
         'TSMC HPC revenue is excluded from hardware sales (it is already inside Nvidia\'s and AMD\'s numbers — adding it would double-count).',
         ha='center', fontsize=9, color='#666666')
fig.tight_layout(rect=[0, 0.04, 1, 0.96])
fig.savefig(out_path, dpi=150)
print('wrote', out_path)
