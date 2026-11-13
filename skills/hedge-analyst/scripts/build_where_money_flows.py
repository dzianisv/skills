"""Where the Money Flows — Nvidia, four panels in one picture.
One chart per the hedge-analyst skill: the flagship-holding explainer that
answers "where does the money go, and what does the price pay for?" in one
picture. Panels: (1) hyperscaler capex -> AI chip revenue -> Nvidia's share;
(2) Nvidia's quarter in pieces (filed Q2 FY27); (3) the order book — why RPO
is only 3.2B; (4) what the price pays for — trailing and forward P/E.

Inputs: none — filed constants, embedded with sources. Rebuild when a new
quarter is filed (Q2 FY27 ended Jul 26, 2026; capex Q3 2026).
  Panel 1: hyperscaler capex Q3 2026 237.4B (Amazon 77.3, Alphabet 51.4,
  Microsoft 39.4, Meta 33.9, Oracle 28.5, Tesla 4.7, Apple 2.2); AI chip
  revenue 123.8B (Nvidia DC 89.0, others 34.8: Broadcom, AMD, Intel,
  Marvell, Qualcomm); everything else 113.6B (server DRAM ~45, storage ~30,
  power ~11, networking ~10, buildings ~9, cooling ~6). Chip share 52%.
  Panel 2 (10-Q Q2 FY27, filed): total revenue 96.2B (DC 89.0 + Edge 7.2);
  DC = Hyperscale 48.7 + ACIE 40.3; gross profit 72.2, COGS 24.0, GM 75.0%.
  Panel 3 (10-Q Q2 FY27): supply & capacity commitments 279.0B; quarterly
  revenue 96.2B; AI cloud buy-back commitments 36.0B; RPO 3.2B; customer
  advances 2.8B (was 0.16B in January). RPO is small because Nvidia sells
  on purchase orders that convert in weeks — it is NOT the order book.
  Panel 4 (at 173.73, Nov 11 close): trailing 35.2x (EPS 4.93); FY27 18.7x
  (EPS 9.31), FY28 10.9x (15.91), FY29 8.1x (21.34), FY30 6.7x (25.98);
  10-year average forward P/E ~30x. Consensus EPS: S&P Global via Motley
  Fool, Oct 19, 2026.
Usage: python3 build_where_money_flows.py [out.png]
Output: PNG preview (sheet tab "Flows diagram" is canonical).
Note: amounts are USD billions; "$" is avoided in matplotlib text ("USD B"
wording) so no sed-escaping is needed.
"""
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/hatch/workspace/your_files/nvda-money-flows.png"
NAVY = "#14213D"; GREY = "#5A5A5A"
GREEN = "#76B900"; GREEN_D = "#5B8C00"; LIGHT_GREEN = "#A8D46B"
BLUE = "#4A7FBF"; DARK_BLUE = "#1F3864"; PURPLE = "#7B3FA0"
RED = "#C0392B"; ORANGE = "#E07B00"; LIGHT_GREY = "#D9D9D9"

fig = plt.figure(figsize=(12, 15), dpi=200)
fig.patch.set_facecolor("white")
gs = fig.add_gridspec(4, 1, height_ratios=[1.15, 0.75, 0.85, 0.95],
                      hspace=0.55, left=0.06, right=0.94, top=0.93, bottom=0.11)
fig.text(0.5, 0.965, "NVIDIA — Where the Money Flows",
         ha="center", va="center", fontsize=19, fontweight="bold", color=NAVY)
fig.text(0.5, 0.945, "Q2 FY27 (quarter ended 26 Jul 2026) and Q3 2026, USD billions  •  Filed: 10-Q Q2 FY27, 10-K FY2026  •  capex: earnings calls, via the AI Chip Cash Flows sheet",
         ha="center", va="center", fontsize=9, color=GREY)

def hbar(ax, y, x0, w, color, label, text_color="white", fs=10, ha="center"):
    ax.add_patch(FancyBboxPatch((x0, y - 0.32), w, 0.64,
                                boxstyle="round,pad=0.02,rounding_size=0.06",
                                facecolor=color, edgecolor="none"))
    ax.text(x0 + w / 2, y, label, ha=ha, va="center", fontsize=fs,
            fontweight="bold", color=text_color)

# --- Panel 1: capex -> chip revenue -> Nvidia's share ---
ax1 = fig.add_subplot(gs[0])
ax1.set_xlim(0, 237.4); ax1.set_ylim(-0.6, 2.6); ax1.axis("off")
ax1.text(0, 2.45, "1.  From hyperscaler capex to Nvidia's Data Center revenue",
         fontsize=12, fontweight="bold", color=NAVY, ha="left", va="top")
# left: total capex
hbar(ax1, 1.7, 0, 237.4, BLUE, "Hyperscaler capex  237.4B", fs=11)
# middle: chip revenue + everything else
hbar(ax1, 0.85, 0, 123.8, GREEN, "AI chip revenue  123.8B", fs=11)
hbar(ax1, 0.85, 123.8, 113.6, LIGHT_GREY, "Everything else  113.6B", text_color="#333333", fs=11)
# right: Nvidia + others (the red bar is too narrow for an inside label —
# put its label to the right of the bar, in the empty space)
hbar(ax1, 0.0, 0, 89.0, GREEN_D, "NVIDIA Data Center  89.0B", fs=11)
hbar(ax1, 0.0, 89.0, 34.8, RED, "", fs=10)
ax1.text(126, 0.0, "Other chip cos  34.8B  —  72% of all AI chip revenue is Nvidia",
         fontsize=10, color="#333333", ha="left", va="center")
ax1.text(0, -0.55, "7 companies: Amazon 77.3B, Alphabet 51.4B, Microsoft 39.4B, Meta 33.9B, Oracle 28.5B, Tesla 4.7B, Apple 2.2B",
         fontsize=8.5, color=GREY, ha="left", va="top")
ax1.text(0, -0.85, "Only 52% of capex becomes chip revenue — the rest is memory, storage, power, networking and buildings.",
         fontsize=8.5, color=GREY, ha="left", va="top")
ax1.text(0, -1.12, "Everything else breaks down as: server DRAM ~45B  •  storage ~30B  •  power ~11B  •  networking ~10B  •  buildings ~9B  •  cooling ~6B",
         fontsize=8.5, color=GREY, ha="left", va="top")

# --- Panel 2: Nvidia's quarter in pieces ---
ax2 = fig.add_subplot(gs[1])
ax2.set_xlim(0, 108); ax2.set_ylim(-0.6, 2.6); ax2.axis("off")
ax2.text(0, 2.45, "2.  Nvidia's quarter, in pieces — Q2 FY27, filed",
         fontsize=12, fontweight="bold", color=NAVY, ha="left", va="top")
hbar(ax2, 1.7, 0, 89.0, GREEN, "Data Center  89.0B", fs=11)
hbar(ax2, 1.7, 89.0, 7.2, LIGHT_GREEN, "Edge  7.2B", text_color="#333333", fs=10)
hbar(ax2, 0.85, 0, 48.7, GREEN_D, "Hyperscale  48.7B", fs=11)
hbar(ax2, 0.85, 48.7, 40.3, GREEN, "ACIE  40.3B", fs=11)
hbar(ax2, 0.0, 0, 72.2, GREEN, "Gross profit  72.2B", fs=11)
hbar(ax2, 0.0, 72.2, 24.0, LIGHT_GREY, "Cost of goods  24.0B", text_color="#333333", fs=10)
ax2.text(0, -0.55, "Total revenue 96.2B  •  Gross margin 75.0%  •  Hyperscale = the big cloud companies  •  ACIE = AI cloud, enterprise, sovereigns, neoclouds  •  Edge = gaming, pro viz, automotive",
         fontsize=8.5, color=GREY, ha="left", va="top")

# --- Panel 3: the order book ---
ax3 = fig.add_subplot(gs[2])
ax3.set_xlim(0, 279.0); ax3.set_ylim(-0.6, 4.6); ax3.axis("off")
ax3.text(0, 4.45, "3.  The order book — why RPO is only 3.2B",
         fontsize=12, fontweight="bold", color=NAVY, ha="left", va="top")
rows = [
    (3.7, 279.0, DARK_BLUE, "Supply & capacity commitments  279.0B — signed to secure memory", True),
    (2.85, 96.2, GREEN, "Quarterly revenue, Q2 FY27  96.2B — one quarter of sales", False),
    (2.0, 36.0, PURPLE, "AI cloud buy-back commitments  36.0B — 6 years, neoclouds", False),
    (1.15, 3.2, ORANGE, "RPO — contracts over 1 year  3.2B — the only booked backlog", False),
    (0.3, 2.8, ORANGE, "Customer advances  2.8B — was 0.16B in January", False),
]
for y, w, c, label, inside in rows:
    hbar(ax3, y, 0, w, c, "", fs=10)
    if inside:
        # the bar spans the whole axis — the label goes inside it, white
        ax3.text(8, y, label, ha="left", va="center", fontsize=10,
                 fontweight="bold", color="white")
    else:
        ax3.text(w + 6, y, label, ha="left", va="center", fontsize=10, color="#222222")
ax3.text(0, -0.55, "Linear scale: the 3.2B and 2.8B bars are slivers on purpose — that is the point. RPO is small because Nvidia sells on purchase\norders that convert to revenue in weeks; it is NOT the order book. The demand evidence is the 279B of supply commitments and 15.6B of advances in six months.",
         fontsize=9, color=GREY, ha="left", va="top")

# --- Panel 4: what the price pays for ---
ax4 = fig.add_subplot(gs[3])
ax4.set_title("4.  What the price pays for — forward P/E at 173.73 (Nov 11 close)",
              fontsize=12, fontweight="bold", color=NAVY, loc="left", pad=10)
labels = ["Trailing\nEPS 4.93", "FY27\nEPS 9.31", "FY28\nEPS 15.91", "FY29\nEPS 21.34", "FY30\nEPS 25.98"]
vals = [35.2, 18.7, 10.9, 8.1, 6.7]
cols = ["#9AA0A6", GREEN_D, GREEN, "#8FBF3F", LIGHT_GREEN]
bars = ax4.bar(range(5), vals, width=0.58, color=cols, edgecolor="white", linewidth=1.5, zorder=3)
for i, v in enumerate(vals):
    ax4.text(i, v + 1.2, f"{v}x", ha="center", va="bottom", fontsize=13, fontweight="bold", color=NAVY)
ax4.axhline(30, color=RED, lw=1.4, linestyle=(0, (5, 3)), zorder=2)
ax4.text(4.55, 30.8, "10-yr average forward P/E ~30x", ha="right", va="bottom", fontsize=9, color=RED)
ax4.set_xticks(range(5)); ax4.set_xticklabels(labels, fontsize=10, color="#222222")
ax4.set_xlim(-0.55, 4.55); ax4.set_ylim(0, 40)
ax4.set_ylabel("P/E multiple", fontsize=10, color=GREY)
ax4.tick_params(labelsize=9.5, colors=GREY)
ax4.grid(axis="y", color="#E5E5E5", lw=0.9, zorder=0)
ax4.set_axisbelow(True)
for s in ["top", "right"]:
    ax4.spines[s].set_visible(False)
fig.text(0.5, 0.05,
         "Consensus EPS: S&P Global via Motley Fool, Oct 19, 2026. P/E is arithmetic — price divided by consensus EPS; whether Nvidia earns it is not public.\nAt 173.73 the stock is 18.7x next year's earnings and 10.9x the year after — cheap against its own 10-year average, but only if the earnings arrive.",
         ha="center", va="center", fontsize=9, color=GREY)
fig.text(0.5, 0.015,
         "Sources: 10-Q Q2 FY27 and 10-K FY2026 (SEC EDGAR / Nvidia IR)  •  Q2 FY27 earnings call  •  Full numbers, proof links and quarterly tables: \"NVDA — Real Contracts & Forward P/E\" sheet.",
         ha="center", va="center", fontsize=8, color=GREY)
plt.savefig(OUT, facecolor="white")
print("saved", OUT)
