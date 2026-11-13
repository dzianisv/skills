#!/usr/bin/env python3
"""Cash flows and borrowing chart — hedge-analyst deep dive.
Tool: matplotlib (Python). One chart, one script — see SKILL.md "Scripts".
Reads the run's summary JSON (argv 1, default /tmp/growth6_summary.json):
  per ticker: ocf_ttm_b, fcf_ttm_b, net_cash_incl_b (incl. securities / ST investments).
Writes the PNG preview (argv 2, default ~/workspace/your_files/growth6-cashflows.png).
Left panel: operating vs free cash flow, TTM, USD B. Right panel: net cash (+) / net debt (-).
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording."""
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

summary_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/growth6_summary.json'
out_path = sys.argv[2] if len(sys.argv) > 2 else '/home/hatch/workspace/your_files/growth6-cashflows.png'
S = json.load(open(summary_path))
ORDER = ['NVDA', 'AMD', 'AVGO', 'TSM', 'MRVL', 'PLTR']
plt.rcParams.update({'font.size': 11})

fig, (b1, b2) = plt.subplots(1, 2, figsize=(15, 5.2))
x = np.arange(6); w = 0.38
ocf = [S[t]['ocf_ttm_b'] for t in ORDER]; fcf = [S[t]['fcf_ttm_b'] for t in ORDER]
b1.bar(x - w / 2, ocf, w, label='OCF TTM', color='#2c7fb8')
b1.bar(x + w / 2, fcf, w, label='FCF TTM', color='#7fcdbb')
b1.set_xticks(x); b1.set_xticklabels(ORDER)
b1.set_title('Operating vs free cash flow, TTM, USD B'); b1.set_ylabel('USD B')
b1.grid(alpha=0.3, axis='y'); b1.legend(fontsize=9)
for i, v in enumerate(ocf):
    b1.text(i - w / 2, v + 3, f'{v:.0f}', ha='center', fontsize=9)
for i, v in enumerate(fcf):
    b1.text(i + w / 2, v + 3, f'{v:.0f}', ha='center', fontsize=9)
net = [S[t]['net_cash_incl_b'] for t in ORDER]
cols = ['#2ca25f' if v >= 0 else '#de2d26' for v in net]
b2.bar(x, net, 0.6, color=cols)
b2.set_xticks(x); b2.set_xticklabels(ORDER)
b2.set_title('Net cash (+) / net debt (-), incl. securities, USD B'); b2.set_ylabel('USD B')
b2.grid(alpha=0.3, axis='y'); b2.axhline(0, color='black', linewidth=0.8); b2.set_ylim(-48, 112)
for i, v in enumerate(net):
    b2.text(i, v + (4 if v >= 0 else -10), f'{v:+.0f}', ha='center', fontsize=9)
fig.suptitle('Growth deep dive — cash flows and borrowing (TTM)', fontsize=13)
fig.tight_layout(rect=[0, 0, 1, 0.94])
fig.savefig(out_path, dpi=150)
print('wrote', out_path)
