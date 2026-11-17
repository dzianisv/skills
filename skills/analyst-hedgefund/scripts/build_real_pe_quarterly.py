"""Real P/E by quarter — Nvidia, with the "fake" sales taken out.
Built Nov 15, 2026 after Den asked for real P/E by quarter (the long
borrowing dossier was too much reading).

Four bars per quarter, price $162.85 (Nov 13 close):
  Reported P/E  = price / (GAAP EPS x 4)
  Paper gains out = price / (non-GAAP EPS x 4) — non-GAAP strips the
    equity-securities paper gains (Q1 $15.9B, Q2 $7.8B, filed 8-K/10-Q)
  Real P/E      = non-GAAP profit minus profit from sales funded by
    Nvidia's own cash, then price / (real EPS x 4).
    Circular revenue per quarter = H1 net equity cash-out $35.163B
    (filed, Q2 10-Q cash-flow statement: purchases $42.404B - sales
    $7.241B), split by quarter on the filed non-marketable additions
    pattern (Note 6 rollforward: Q1 $17,899M / Q2 $13,106M).
    Circular profit = circular revenue x gross margin (Q1 74.9%,
    Q2 75.0%, filed) x (1 - 17% tax).
    The $4.2B public-equity part of the $35.2B cannot be split by
    quarter (Q1's 10-Q lumps marketable debt + equity purchases in
    one $8,000M line), so it is allocated with the same pattern.
  Cash P/E      = price / (operating cash flow per share x 4), filed.

H1 real P/E is 25.5x on the filed $35.2B cash-out — the earlier 25.9x
used a $37B circular-revenue estimate; the filed number corrects it.
Q3 FY27 reports Nov 17, 2026 — the next bar comes from that 10-Q.
Usage: python3 build_real_pe_quarterly.py [out.png]
"""
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/hatch/workspace/your_files/nvda-real-pe-quarterly.png"

NAVY = "#14213D"; GREY = "#5A5A5A"

# price $162.85 Nov 13 close; computed from filed 10-Q/8-K numbers (see docstring)
GROUPS = ["Q1 FY27\n(Apr 26, 2026)", "Q2 FY27\n(Jul 26, 2026)", "H1 FY27\n(six months)"]
DATA = {
    "Reported P/E":      [17.0, 16.5, 16.8],
    "Paper gains out":   [21.8, 18.3, 19.9],
    "Real P/E\n(fake sales out)": [30.1, 22.1, 25.5],
    "Cash P/E":          [19.7, 41.1, 26.6],
}
COLORS = {"Reported P/E": "#9AA0A6", "Paper gains out": "#2F6FBB",
          "Real P/E\n(fake sales out)": "#2E7D32", "Cash P/E": "#E07B00"}

fig, ax = plt.subplots(figsize=(12, 7), dpi=200)
fig.patch.set_facecolor("white"); ax.set_facecolor("white")

x = np.arange(len(GROUPS))
w = 0.20
for i, (label, vals) in enumerate(DATA.items()):
    bars = ax.bar(x + (i - 1.5) * w, vals, w, label=label, color=COLORS[label],
                  edgecolor="white", linewidth=1.2)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.9, f"{v:.1f}x",
                ha="center", va="bottom", fontsize=10.5,
                fontweight="bold" if "Real" in label else "normal", color=NAVY)

ax.set_xticks(x); ax.set_xticklabels(GROUPS, fontsize=11.5)
ax.set_ylabel("P/E (times)", fontsize=11, color=NAVY)
ax.set_ylim(0, 47)
ax.set_title("Real P/E by quarter — Nvidia, fake sales taken out",
             fontsize=17, fontweight="bold", color=NAVY, pad=14)
ax.legend(loc="upper left", fontsize=10.5, frameon=False, ncol=2)
ax.spines[["top", "right"]].set_visible(False)
ax.spines[["left", "bottom"]].set_color("#CCCCCC")
ax.tick_params(colors=GREY, labelsize=10.5)
ax.yaxis.grid(True, color="#EDEDED", linewidth=0.8)
ax.set_axisbelow(True)

fig.text(0.5, 0.02,
         "Real P/E = profit after removing paper gains AND profit from sales funded by Nvidia's own cash (H1 cash-out $35.2B, filed).\n"
         "Cash P/E = price / operating cash flow per share, annualised. Price $162.85 (Nov 13 close). Q3 reports Nov 17, 2026.",
         ha="center", va="bottom", fontsize=9.5, color=GREY)

plt.tight_layout(rect=[0, 0.06, 1, 1])
plt.savefig(OUT, facecolor="white")
print("saved", OUT)
