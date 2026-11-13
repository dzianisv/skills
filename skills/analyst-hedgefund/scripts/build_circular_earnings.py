"""Circular earnings diagram — Nvidia pays, the customer buys back.
One chart per the analyst-hedgefund skill: the quantified cash-vs-reported-earnings
view. Built from the v2 script (goal files), same filed numbers.

Inputs: none (filed constants, H1 FY27) — reprice/rebuild when a new 10-Q lands.
  8-K Ex 99.1 Q2 FY27: GAAP net income H1 118.0B, paper gains 23.7B,
  purchases of equity securities 42.4B, sales 7.2B, OCF 74.4B.
  10-Q Q2 FY27: supply commitments 279B, backstops 36B, SB guarantees 105B.
  Circular revenue upper bound 37B (21% of H1 revenue), circular profit
  = 37B x 75% margin x 83% (17% tax) = 23.0B. Real P/E 27.6x vs reported 18.7x.
Usage: python3 build_circular_earnings.py [out.png]
Output: PNG preview (sheet tab "Circular earnings" is canonical).
"""
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/hatch/workspace/your_files/nvda-circular-earnings-v2.png"
S = "\\$"
NAVY = "#14213D"; GREY = "#5A5A5A"
ORANGE = "#E07B00"; ORANGE_BG = "#FFF1DE"
BLUE = "#2F6FBB"; BLUE_BG = "#E8F0FA"
GREEN = "#5B8C00"; GREEN_BG = "#F0F5DF"
RED = "#C0392B"; LIGHT_GREEN = "#8FBF3F"

fig = plt.figure(figsize=(12, 9), dpi=200)
fig.patch.set_facecolor("white")
gs = fig.add_gridspec(2, 1, height_ratios=[1.0, 1.3], hspace=0.30,
                      left=0.055, right=0.955, top=0.86, bottom=0.15)

fig.text(0.5, 0.955, "Circular Earnings \u2014 Nvidia Pays, the Customer Buys Back",
         ha="center", va="center", fontsize=19, fontweight="bold", color=NAVY)
fig.text(0.5, 0.915, "H1 FY27 (filed)  \u2022  Nvidia gives cash to its customers  \u2192  they spend it on Nvidia chips  \u2192  Nvidia books the sale as profit",
         ha="center", va="center", fontsize=10.5, color=GREY)

ax = fig.add_subplot(gs[0])
ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
ax.text(0, 97, "THE LOOP", fontsize=12, fontweight="bold", color=NAVY, ha="left", va="top")

# Narrower boxes -> wider gaps so arrow labels fit between them
boxes = [
    (1, 28, 26, 60, ORANGE, ORANGE_BG, "1 \u00b7 NVIDIA PAYS OUT",
     ["Cash out: " + S + "42.4B gross", S + "35.2B net (after " + S + "7.2B sold)",
      "OpenAI " + S + "30B  \u2022  AI clouds " + S + "7B+",
      "Promises, not cash yet: " + S + "171.5B"]),
    (36.5, 28, 27, 60, BLUE, BLUE_BG, "2 \u00b7 CUSTOMERS BUY CHIPS",
     ["OpenAI  \u2022  CoreWeave  \u2022  neoclouds",
      "They spend Nvidia's money",
      "on Nvidia hardware"]),
    (73, 28, 26, 60, GREEN, GREEN_BG, "3 \u00b7 NVIDIA BOOKS IT BACK",
     ["Revenue H1 FY27: " + S + "177.8B",
      "Data Center: " + S + "164.3B",
      "GAAP profit: " + S + "118.0B",
      "incl. paper gains " + S + "23.7B"]),
]
for x, y, w, h, edge, bg, title, lines in boxes:
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.6,rounding_size=2.2",
                                facecolor=bg, edgecolor=edge, linewidth=2.4))
    ax.text(x + w/2, y + h - 7, title, ha="center", va="top", fontsize=11, fontweight="bold", color=NAVY)
    for i, ln in enumerate(lines):
        ax.text(x + w/2, y + h - 20 - i*8.5, ln, ha="center", va="top", fontsize=9.8, color="#222222")

def arrow(x0, x1, y, color, label_lines, sublabel=None):
    ax.annotate("", xy=(x1, y), xytext=(x0, y),
                arrowprops=dict(arrowstyle="-|>,head_width=0.5,head_length=1.0",
                                color=color, lw=4.5, shrinkA=0, shrinkB=0))
    cx = (x0 + x1) / 2
    for j, ln in enumerate(label_lines):
        ax.text(cx, y + 14 - j*6.5, ln, ha="center", va="top", fontsize=10, fontweight="bold", color=color)
    if sublabel:
        ax.text(cx, y - 6, sublabel, ha="center", va="top", fontsize=8.5, color=color)

arrow(27.6, 36.0, 58, ORANGE, [S + "42.4B", "cash"])
arrow(64.1, 72.4, 58, BLUE, ["chip", "purchases"], S + "37B = 21%")

# Return loop: clean elbow well below the boxes
ax.plot([86, 86], [28, 16], color=GREY, lw=2.0, linestyle=(0, (5, 3)))
ax.plot([86, 14], [16, 16], color=GREY, lw=2.0, linestyle=(0, (5, 3)))
ax.annotate("", xy=(14, 27.2), xytext=(14, 16),
            arrowprops=dict(arrowstyle="-|>,head_width=0.5,head_length=1.0",
                            color=GREY, lw=2.0, linestyle=(0, (5, 3)), shrinkA=0, shrinkB=0))
ax.text(50, 6, "THE LOOP:  the " + S + "118.0B profit funds the next round of checks \u2014 and the next round of revenue",
        ha="center", va="center", fontsize=10.5, fontweight="bold", color=GREY,
        bbox=dict(boxstyle="round,pad=0.45", facecolor="#F2F2F2", edgecolor="none"))

ax2 = fig.add_subplot(gs[1])
ax2.set_title("REAL EARNINGS \u2014 take out what Nvidia paid for itself", fontsize=12,
              fontweight="bold", color=NAVY, loc="left", pad=10)
labels = ["GAAP\nnet income", "Paper gains\nremoved\n(net of tax)", "Non-GAAP\nnet income",
          "Circular profit\nremoved", "REAL\nEARNINGS"]
xs = [0, 1, 2, 3, 4]
bottoms = [0, 99.5, 0, 76.5, 0]
heights = [118.0, 18.5, 99.5, 23.0, 76.5]
colors = [GREEN, RED, LIGHT_GREEN, RED, BLUE]
values = [118.0, -18.5, 99.5, -23.0, 76.5]
for x, b, h, c in zip(xs, bottoms, heights, colors):
    ax2.bar(x, h, bottom=b, width=0.62, color=c, edgecolor="white", linewidth=1.5, zorder=3)
for x0, y in [(0, 118.0), (1, 99.5), (2, 99.5), (3, 76.5)]:
    ax2.plot([x0 + 0.31, x0 + 1 - 0.31], [y, y], color=GREY, lw=1.4, linestyle=(0, (4, 3)), zorder=2)
for x, b, h, v in zip(xs, bottoms, heights, values):
    top = b + h
    txt = ("\u2212" + S + "%.1fB" % abs(v)) if v < 0 else (S + "%.1fB" % v)
    ax2.text(x, top + 4, txt, ha="center", va="bottom", fontsize=13, fontweight="bold",
             color=RED if v < 0 else NAVY, zorder=4)
ax2.set_xlim(-0.55, 4.55); ax2.set_ylim(0, 132)
ax2.set_xticks(xs); ax2.set_xticklabels(labels, fontsize=10.5, color="#222222")
ax2.set_ylabel(S + " billion", fontsize=10, color=GREY)
ax2.set_yticks([0, 25, 50, 75, 100, 125])
ax2.tick_params(axis="y", labelsize=9.5, colors=GREY)
ax2.grid(axis="y", color="#E5E5E5", lw=0.9, zorder=0)
ax2.set_axisbelow(True)
for s in ["top", "right", "left"]:
    ax2.spines[s].set_visible(False)
ax2.spines["bottom"].set_color("#CCCCCC")

fig.text(0.5, 0.062,
         "Real P/E  27.6x  (range 26.2\u201328.9x)   vs   reported 18.7x   \u2022   Cash P/E 28.3x \u2014 two methods, same answer",
         ha="center", va="center", fontsize=12, fontweight="bold", color="white",
         bbox=dict(boxstyle="round,pad=0.55", facecolor=NAVY, edgecolor="none"))
fig.text(0.5, 0.028,
         "Sources: 8-K Ex 99.1 Q2 FY27  \u2022  10-Q Q2 FY27  \u2022  Forbes / SiliconANGLE (OpenAI " + S + "30B, clouds " + S + "7B+)",
         ha="center", va="center", fontsize=7.5, color=GREY)
fig.text(0.5, 0.010,
         "Circular profit = " + S + "37B \u00d7 75% margin \u00d7 83% (17% tax).  " + S + "37B is an upper bound \u2014 timing not filed.",
         ha="center", va="center", fontsize=7.5, color=GREY)
plt.savefig(OUT, facecolor="white")
print("saved", OUT)
