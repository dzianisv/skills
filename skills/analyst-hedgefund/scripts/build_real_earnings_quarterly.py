"""Earnings minus self-funded earnings — Nvidia, by quarter (USD B).
Built Nov 15, 2026 after Den asked for EARNINGS (not the P/E) minus
self-funded earnings, and questioned the per-quarter split.

Stacked bars: GAAP net income = paper gains (net of tax) + self-funded
profit + real profit. All numbers filed (10-Q Q1 filed May 20, 2026;
10-Q Q2 filed Aug 26, 2026; 8-K releases for non-GAAP EPS):

  Q1 FY27: GAAP 58.32 = paper 12.71 + self-funded 12.62 + real 32.99
  Q2 FY27: GAAP 59.69 = paper  5.78 + self-funded  9.25 + real 44.66
  H1 FY27: GAAP 118.01 = paper 18.49 + self-funded 21.87 + real 77.65

Paper gains net of tax = GAAP NI - non-GAAP NI (non-GAAP EPS x diluted
shares: Q1 $1.87 x 24,391M; Q2 $2.22 x 24,285M). Gross paper gains:
Q1 $15.936B, Q2 $7.771B, H1 $23.707B (filed OCF reconciliation).

Self-funded profit = circular revenue x gross margin (Q1 74.9%, Q2 75.0%,
filed) x (1 - 17% tax). Circular revenue = H1 net equity cash-out
$35.163B (filed: purchases $42.404B - sales $7.241B), split by quarter
on the filed non-marketable additions pattern (Note 6 rollforward:
Q1 $17,899M / Q2 $13,106M).

SPLIT CONFIDENCE: the only unfiled piece is the $4.158B public-equity
part of the $35.163B — Q1's 10-Q lumps marketable debt + equity purchases
in one $8,000M line, so its quarterly split is not filed. Worst case
(all $4.158B in one quarter): Q1 real $31.90-34.48B, Q2 real
$43.17-45.75B. H1 real $77.65B is exact — no split needed.
BIGGER CAVEAT: the deduction assumes every dollar of equity cash-out
became a sale (upper bound). True real earnings sit between our number
and non-GAAP profit; ours is the conservative floor.
Usage: python3 build_real_earnings_quarterly.py [out.png]
"""
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/hatch/workspace/your_files/nvda-real-earnings-quarterly.png"

NAVY = "#14213D"; GREY = "#5A5A5A"

GROUPS = ["Q1 FY27\n(Apr 26, 2026)", "Q2 FY27\n(Jul 26, 2026)", "H1 FY27\n(six months)"]
# bottom -> top: real, self-funded, paper gains
REAL = [32.99, 44.66, 77.65]
SELF = [12.62, 9.25, 21.87]
PAPER = [12.71, 5.78, 18.49]
RANGE = ["$31.9–34.5B", "$43.2–45.8B", "exact"]

fig, ax = plt.subplots(figsize=(12, 7), dpi=200)
fig.patch.set_facecolor("white"); ax.set_facecolor("white")

x = np.arange(len(GROUPS))
w = 0.55
b1 = ax.bar(x, REAL, w, label="Real profit", color="#2E7D32", edgecolor="white", linewidth=1.2)
b2 = ax.bar(x, SELF, w, bottom=REAL, label="Self-funded profit (deducted)", color="#E07B00", edgecolor="white", linewidth=1.2)
b3 = ax.bar(x, PAPER, w, bottom=np.array(REAL) + np.array(SELF), label="Paper gains (deducted)", color="#9AA0A6", edgecolor="white", linewidth=1.2)

for bars, vals, color in [(b1, REAL, "white"), (b2, SELF, "white"), (b3, PAPER, NAVY)]:
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, b.get_y() + b.get_height() / 2,
                f"${v:.2f}B", ha="center", va="center", fontsize=11,
                fontweight="bold", color=color)
# range of the real segment (split uncertainty) as a second line inside the green bar
for i, (r, v) in enumerate(zip(RANGE, REAL)):
    ax.text(x[i], v / 2 - 4.5, f"range {r}", ha="center", va="center",
            fontsize=9.5, color="white")
for i, total in enumerate([58.32, 59.69, 118.01]):
    ax.text(x[i], total + 2.5, f"GAAP ${total:.2f}B", ha="center", va="bottom",
            fontsize=11.5, fontweight="bold", color=NAVY)
# P/E on top of each bar (price $162.85, Nov 13 close): real P/E vs reported P/E
PE_REAL = ["30.1x", "22.1x", "25.5x"]
PE_REP = ["17.0x", "16.5x", "16.8x"]
for i in range(len(GROUPS)):
    ax.text(x[i], [58.32, 59.69, 118.01][i] + 7.5,
            f"Real P/E {PE_REAL[i]}  ·  reported {PE_REP[i]}",
            ha="center", va="bottom", fontsize=11, color=NAVY)

ax.set_xticks(x); ax.set_xticklabels(GROUPS, fontsize=11.5)
ax.set_ylabel("Net income (USD billions)", fontsize=11, color=NAVY)
ax.set_ylim(0, 136)
ax.set_title("Nvidia earnings — real, self-funded, paper",
             fontsize=17, fontweight="bold", color=NAVY, pad=14)
ax.legend(loc="upper left", fontsize=10.5, frameon=False)
ax.spines[["top", "right"]].set_visible(False)
ax.spines[["left", "bottom"]].set_color("#CCCCCC")
ax.tick_params(colors=GREY, labelsize=10.5)
ax.yaxis.grid(True, color="#EDEDED", linewidth=0.8)
ax.set_axisbelow(True)

fig.text(0.5, 0.02,
         "Real profit = reported profit minus paper gains minus profit from sales Nvidia funded with its own cash (H1 cash-out \\$35.2B, filed).\n"
         "The per-quarter split of the \\$35.2B uses the filed Note 6 pattern; only the \\$4.2B public-equity part has no filed split — that is the range under each bar.",
         ha="center", va="bottom", fontsize=9.5, color=GREY)

plt.tight_layout(rect=[0, 0.06, 1, 1])
plt.savefig(OUT, facecolor="white")
print("saved", OUT)
