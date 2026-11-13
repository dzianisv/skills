#!/usr/bin/env python3
"""Smart-money timeline — Form 4 insiders + PTR congress + 13F snapshot, one chart.
Tool: matplotlib (Python). One chart, one script — see SKILL.md "Scripts".
Reads (argv 1-4, defaults under /tmp + the persistent filings file):
  growth6.json — per ticker: insider_transactions_6m (Form 4, open-market only).
  closes16m.json — per ticker: [[date, close], ...] daily closes, Jul 2025 - Nov 2026
    (16 months, so the PTR trades from 2025 sit on the price line; the 6-month
    closes file is too short for them).
  growth6_summary.json — per ticker: price (latest close), n_sales, sales_total_m,
    wavg_sale_vs_close_pct.
  filings6.json — ptr (235 PTR congress trades) and holders13f (top-5 funds, Q2 2026).
Writes the PNG preview (argv 5, default ~/workspace/your_files/growth6-smart-money-timeline.png).
One panel per stock: daily close line; Form 4 sales red dots sized by value, buys green
dots; PTR congress buys purple up-triangles, sells orange down-triangles (size = bracket
midpoint); dashed line at the latest close; largest Form 4 sale and largest PTR trade
annotated (text placed away from the point so the two annotations never collide).
13F has NO trade dates and NO prices (positions only), so it cannot be dots — it is
shown as the ownership snapshot line under each title (top-5 funds combined %, Q2 2026).
PTR rows with no close in the file are filled from the closes series when the date
exists there; still missing are counted in the panel line.
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording."""
import json, re, sys
from datetime import datetime
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np

g_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/growth6.json'
c_path = sys.argv[2] if len(sys.argv) > 2 else '/tmp/closes16m.json'
s_path = sys.argv[3] if len(sys.argv) > 3 else '/tmp/growth6_summary.json'
f_path = sys.argv[4] if len(sys.argv) > 4 else '/home/hatch/workspace/goals/investor-daily-stocks-report-and-dip-alert/hidden_files/filings6.json'
out_path = sys.argv[5] if len(sys.argv) > 5 else '/home/hatch/workspace/your_files/growth6-smart-money-timeline.png'
G = json.load(open(g_path))
C = json.load(open(c_path))
S = json.load(open(s_path))
F = json.load(open(f_path))
ORDER = ['NVDA', 'AMD', 'AVGO', 'TSM', 'MRVL', 'PLTR']
plt.rcParams.update({'font.size': 10})

SHORT_FUND = {'BlackRock': 'BlackRock', 'Vanguard Capital': 'Vanguard', 'Vanguard Portfolio': 'Vanguard',
              'FMR': 'FMR', 'Fidelity': 'FMR', 'State Street': 'State Street', 'Geode': 'Geode',
              'Invesco': 'Invesco', 'JPMorgan': 'JPMorgan', 'Capital World': 'Capital World',
              'Sanders': 'Sanders'}

def short_fund(name):
    for k, v in SHORT_FUND.items():
        if k in name:
            return v
    return name.split(',')[0][:12]

def parse_bracket(s):
    """Amount range like '$1,001-$15,000' / '$100K-$250K' / '$1M-$5M' -> (lo, hi) in USD."""
    if not s:
        return None
    parts = re.split(r'[-–—]', s.replace('$', '').replace(',', '').strip())
    def num(x):
        x = x.strip()
        mult = 1
        if x.endswith('M'):
            mult, x = 1e6, x[:-1]
        elif x.endswith('K'):
            mult, x = 1e3, x[:-1]
        try:
            return float(x) * mult
        except ValueError:
            return None
    if len(parts) < 2:
        return None
    lo, hi = num(parts[0]), num(parts[1])
    if lo is None or hi is None:
        return None
    return lo, hi

fig, axes = plt.subplots(3, 2, figsize=(15, 13))
fig.suptitle('Smart-money timeline — Form 4 insiders (6 mo) + PTR congress (2025-2026) + 13F snapshot (Q2 2026)', fontsize=14)

for ax, t in zip(axes.flat, ORDER):
    dates = [datetime.fromisoformat(d) for d, _ in C[t]]
    closes = [c for _, c in C[t]]
    close_by_date = {d: c for d, c in C[t]}
    ax.plot(dates, closes, color='#888888', linewidth=1.2, label='Daily close')
    close_now = S[t]['price']
    ax.axhline(close_now, color='#111111', linestyle='--', linewidth=1,
               label=f'Nov 12 close {close_now:.2f}')
    x0, x1 = dates[0], dates[-1]
    mid_date = x0 + (x1 - x0) / 2
    # Form 4
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
    # Form 4 annotation: above the point; PTR annotation: below it, and on the
    # opposite side when the two points are close in time (else the texts collide)
    f4_xytext, f4_ha = ((8, 12), 'left') if d <= mid_date else ((-8, 12), 'right')
    f4_date = None
    if sales:
        big = max(sales, key=lambda x: x['value_m'])
        d = datetime.fromisoformat(big['date'])
        f4_date = d
        name = big['insider'].split()[0].title()
        ax.annotate(f"{name} {big['price_avg']:.0f}, {big['value_m']:.0f}M USD",
                    xy=(d, big['price_avg']), xytext=f4_xytext, textcoords='offset points',
                    ha=f4_ha, fontsize=9, arrowprops=dict(arrowstyle='->', color='#de2d26', lw=0.8))
    # PTR congress trades (fill a missing close from the closes series when available)
    ptr = [r for r in F['ptr'] if r['ticker'] == t]
    ptr_plot, ptr_skip = [], 0
    for r in ptr:
        close = r.get('close_on_trade_date')
        if close is None:
            close = close_by_date.get(r['trade_date'])
        if close is None:
            ptr_skip += 1
            continue
        br = parse_bracket(r.get('amount_range', ''))
        mid = (br[0] + br[1]) / 2 if br else 8000
        ptr_plot.append((r, mid, close))
    for r, mid, close in ptr_plot:
        d = datetime.fromisoformat(r['trade_date'])
        size = max(18, 15 + 2.2 * np.sqrt(mid / 1000))
        if str(r['buy_sell']).lower() == 'buy':
            ax.scatter([d], [close], s=size, marker='^',
                       color='#7e57c2', alpha=0.75, edgecolors='white', linewidths=0.5, zorder=4)
        else:
            ax.scatter([d], [close], s=size, marker='v',
                       color='#ff8f00', alpha=0.75, edgecolors='white', linewidths=0.5, zorder=4)
    if ptr_plot:
        big_r, big_mid, big_close = max(ptr_plot, key=lambda rm: rm[1])
        d = datetime.fromisoformat(big_r['trade_date'])
        last = big_r['member'].split()[-1]
        label = f"Congress {last} {big_r['buy_sell']}"
        # opposite side from the Form 4 annotation when the two points are close
        if f4_date is not None and abs((d - f4_date).days) < 45:
            ptr_xytext, ptr_ha = ((-8, -24), 'right') if f4_ha == 'left' else ((8, -24), 'left')
        elif d > mid_date:
            ptr_xytext, ptr_ha = (-8, -22), 'right'
        else:
            ptr_xytext, ptr_ha = (8, -22), 'left'
        ax.annotate(label, xy=(d, big_close), xytext=ptr_xytext, textcoords='offset points',
                    ha=ptr_ha, fontsize=9, arrowprops=dict(arrowstyle='->', color='#7e57c2', lw=0.8))
    # 13F snapshot line
    holders = F['holders13f'][t]
    top5 = sum(h['pct_out'] for h in holders)
    top1 = holders[0]
    n_buy = sum(1 for r in ptr if str(r['buy_sell']).lower() == 'buy')
    n_sell = len(ptr) - n_buy
    o = S[t]
    wavg = o['wavg_sale_vs_close_pct']
    wavg_txt = f"{wavg:+.1f}%" if wavg is not None else "n/a"
    ax.set_title(f"{t} — close {close_now:.2f} — {o['n_sales']} insider sales, "
                 f"{o['sales_total_m']:.1f}M USD, avg {wavg_txt} vs close", fontsize=11)
    ax.text(0.01, 0.02,
            f"Congress: {n_buy} buys / {n_sell} sells ({len(ptr_plot)} plotted, {ptr_skip} w/o close)\n"
            f"Top 5 funds {top5:.1f}% (Q2 2026), top {short_fund(top1['fund'])} {top1['pct_out']:.1f}%",
            transform=ax.transAxes, fontsize=8.5, verticalalignment='bottom',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.8, edgecolor='none'))
    ax.grid(alpha=0.3)
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %y'))
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
    ax.set_ylabel('Price, USD')

handles = [
    plt.Line2D([], [], color='#888888', label='Daily close'),
    plt.Line2D([], [], marker='o', color='w', markerfacecolor='#de2d26', markersize=9, label='Insider sale (size = value)'),
    plt.Line2D([], [], marker='o', color='w', markerfacecolor='#2ca25f', markersize=9, label='Insider buy'),
    plt.Line2D([], [], marker='^', color='w', markerfacecolor='#7e57c2', markersize=9, label='Congress buy'),
    plt.Line2D([], [], marker='v', color='w', markerfacecolor='#ff8f00', markersize=9, label='Congress sell'),
    plt.Line2D([], [], color='#111111', linestyle='--', label='Nov 12 close'),
]
fig.legend(handles=handles, loc='lower center', ncol=3, fontsize=10, frameon=False)
fig.tight_layout(rect=[0, 0.03, 1, 0.96])
fig.savefig(out_path, dpi=150)
print('wrote', out_path)
