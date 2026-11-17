#!/usr/bin/env python3
"""Collar payoff chart — analyst-hedgefund deep dive, hedge layer.
Tool: matplotlib (Python). One chart, one script — see SKILL.md "Scripts".
Writes the PNG preview (argv 1, default ~/workspace/your_files/nvda-collar-payoff.png).
Numbers below are the WORKED EXAMPLE from the skill (NVDA, Nov 2026, spot 158.50):
Jan 15, 2027 collar, long 150 put / short 185 call, net cost 8.08 per share.
Floor = 150 - 8.08 = 141.92 per share. Cap = 185 - 8.08 = 176.92 per share.
REPRICE AT RUN TIME from the live chain — never reuse these numbers for a new decision.
Shows the value of 1,000 shares at expiry, hedged vs unhedged.
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording."""
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

out_path = sys.argv[1] if len(sys.argv) > 1 else '/home/hatch/workspace/your_files/nvda-collar-payoff.png'
SPOT = 158.50
PUT, CALL, COST = 150.0, 185.0, 8.08
FLOOR, CAP = PUT - COST, CALL - COST
SHARES = 1000
plt.rcParams.update({'font.size': 11})

px = np.linspace(100, 220, 241)
unhedged = px * SHARES
hedged = np.clip(px, FLOOR, CAP) * SHARES
fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(px, unhedged / 1000, color='#888888', linewidth=2, label='Unhedged: 1,000 shares')
ax.plot(px, hedged / 1000, color='#2c7fb8', linewidth=2.5, label='Collared: long 150 put / short 185 call')
ax.axvline(SPOT, color='#111111', linestyle=':', linewidth=1.2, label=f'Spot {SPOT:.2f}')
ax.axhline(FLOOR * SHARES / 1000, color='#2ca25f', linestyle='--', linewidth=1.2)
ax.axhline(CAP * SHARES / 1000, color='#de2d26', linestyle='--', linewidth=1.2)
ax.annotate(f'Floor {FLOOR:.2f} (150 put - 8.08 cost)', xy=(100, FLOOR * SHARES / 1000),
            xytext=(102, FLOOR * SHARES / 1000 + 8), fontsize=10, color='#2ca25f')
ax.annotate(f'Cap {CAP:.2f} (185 call - 8.08 cost)', xy=(100, CAP * SHARES / 1000),
            xytext=(102, CAP * SHARES / 1000 + 8), fontsize=10, color='#de2d26')
ax.annotate(f'Max loss from {SPOT:.2f}: {(SPOT - FLOOR) * SHARES / 1000:.1f}K USD',
            xy=(SPOT, FLOOR * SHARES / 1000), xytext=(SPOT + 12, FLOOR * SHARES / 1000 - 12),
            fontsize=10, arrowprops=dict(arrowstyle='->', color='#111111', lw=0.8))
ax.set_xlabel('NVDA price at expiry (Jan 15, 2027), USD')
ax.set_ylabel('Value of 1,000 shares at expiry, K USD')
ax.set_title('NVDA collar payoff — 150 put / 185 call, net cost 8.08 per share')
ax.grid(alpha=0.3); ax.legend(fontsize=10)
fig.tight_layout()
fig.savefig(out_path, dpi=150)
print('wrote', out_path)
