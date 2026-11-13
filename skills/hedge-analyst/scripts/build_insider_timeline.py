#!/usr/bin/env python3
"""Insider trading timeline — hedge-analyst deep dive, reading view of the Filings tab.
Tool: matplotlib (Python). One chart, one script — see SKILL.md "Scripts".
Reads (argv 1-3, defaults under /tmp):
  growth6.json — per ticker: insider_transactions_6m (Form 4, open-market only;
    buy_sell is lowercase 'sell'/'buy'; insider names are LAST NAME FIRST, e.g. 'STEVENS MARK').
  closes6.json — per ticker: [[date, close], ...] daily closes, 6 months.
  growth6_summary.json — per ticker: price (latest close), n_sales, sales_total_m,
    wavg_sale_vs_close_pct.
Writes the PNG preview (argv 4, default ~/workspace/your_files/growth6-insider-timeline.png).
One panel per stock: daily close line, Form 4 sales as red dots sized by value,
buys as green dots, dashed line at the latest close, largest sale annotated.
Dots above the dashed line = sold before the fall; below it = sold before the run.
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording."""
import json, sys
from datetime import datetime
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np

g_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/growth6.json'
c_path = sys.argv[2] if len(sys.argv) > 2 else '/tmp/closes6.json'
s_path = sys.argv[3] if len(sys.argv) > 3 else '/tmp/growth6_summary.json'
out_path = sys.argv[4] if len(sys.argv) > 4 else '/home/hatch/workspace/your_files/growth6-insider-timeline.png'
G = json.load(open(g_path))
C = json.load(open(c_path))
S = json.load(open(s_path))
ORDER = ['NVDA', 'AMD', 'AVGO', 'TSM', 'MRVL', 'PLTR']
plt.rcParams.update({'font.size': 10})

fig, axes = plt.subplots(3, 2, figsize=(15, 13))
fig.suptitle('Insider trading timeline — Form 4, May 13 to Nov 13, 2026 (open-market only)', fontsize=14)

for ax, t in zip(axes.flat, ORDER):
    dates = [datetime.fromisoformat(d) for d, _ in C[t]]
    closes = [c for _, c in C[t]]
    ax.plot(dates, closes, color='#888888', linewidth=1.2, label='Daily close')
    close_now = S[t]['price']
    ax.axhline(close_now, color='#111111', linestyle='--', linewidth=1,
               label=f'Nov 12 close {close_now:.2f}')
    txs = G[t]['insider_transactions_6m']
    sales = [x for x in txs if str(x['buy_sell']).lower() == 'sell']
    buys = [x for x in txs if str(x['buy_sell']).lower() == 'buy']
    for x in sales:
        d = datetime.fromisoformat(x['date'])
        size = max(25, 9 * np.sqrt(x['value_m']))
        ax.scatter([d], [x['price_avg']], s=size, color='#de2d26', alpha=0.85,
                   edgecolors='white', linewidths=0.5, zorder=5)
    for x in buys:
        d = datetime.fromisoformat(x['date'])
        size = max(25, 9 * np.sqrt(x['value_m']))
        ax.scatter([d], [x['price_avg']], s=size, color='#2ca25f', alpha=0.9,
                   edgecolors='white', linewidths=0.5, zorder=5)
    if sales:
        big = max(sales, key=lambda x: x['value_m'])
        d = datetime.fromisoformat(big['date'])
        name = big['insider'].split()[0].title()  # names are LAST NAME FIRST
        ax.annotate(f"{name} {big['price_avg']:.0f}, {big['value_m']:.0f}M USD",
                    xy=(d, big['price_avg']), xytext=(8, 10), textcoords='offset points',
                    fontsize=9, arrowprops=dict(arrowstyle='->', color='#de2d26', lw=0.8))
    o = S[t]
    wavg = o['wavg_sale_vs_close_pct']
    wavg_txt = f"{wavg:+.1f}%" if wavg is not None else "n/a"
    ax.set_title(f"{t} — close {close_now:.2f} — {o['n_sales']} sales, "
                 f"{o['sales_total_m']:.1f}M USD, avg {wavg_txt} vs close", fontsize=11)
    ax.grid(alpha=0.3)
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%b'))
    ax.xaxis.set_major_locator(mdates.MonthLocator())
    ax.set_ylabel('Price, USD')

handles = [
    plt.Line2D([], [], color='#888888', label='Daily close'),
    plt.Line2D([], [], marker='o', color='w', markerfacecolor='#de2d26', markersize=9, label='Sale (size = value)'),
    plt.Line2D([], [], marker='o', color='w', markerfacecolor='#2ca25f', markersize=9, label='Buy'),
    plt.Line2D([], [], color='#111111', linestyle='--', label='Nov 12 close'),
]
fig.legend(handles=handles, loc='lower center', ncol=4, fontsize=10, frameon=False)
fig.tight_layout(rect=[0, 0.03, 1, 0.96])
fig.savefig(out_path, dpi=150)
print('wrote', out_path)
