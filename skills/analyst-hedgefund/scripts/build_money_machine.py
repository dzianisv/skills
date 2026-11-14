"""The AI Money Machine — Nvidia at the center (Bloomberg-style network).
Rich network diagram: every player, every flow, colored by type.
Built after Den said the 3-box circular-earnings diagram was too primitive
and sent the Bloomberg "How Nvidia and OpenAI Fuel the AI Money Machine"
diagram as the reference (Nov 14, 2026).

Layout: wide ellipse ring (xlim 0-100, ylim 0-54) so the network fills a
wide figure; 1 x-unit ~ 1 y-unit in inches, so circles stay circular.
NOTE: matplotlib treats $...$ as math text — every $ in a text string
must be escaped as \\$ or the text renders mangled. Single-$ strings are
safe (unmatched $ renders literally), multi-$ strings are NOT.

Nodes sized by market value (live pull, Nov 13, 2026 close):
  NVDA $3,932B, MSFT $3,890B, AMZN $2,883B, TSM $2,068B, GOOG $1,632B
  (Class C only — total Alphabet is larger), META $1,421B, AMD $876B,
  ORCL $391B. OpenAI $1.25T = reported valuation (Bloomberg/Reuters,
  Nov 6, 2026 first close of an $11B round; $500B was the Oct 2025
  secondary — stale, do not use). Neoclouds / SB Energy are private —
  sized by their flow, not a market value.
Flows (filed / reported, same numbers as the v3 dependency web):
  Hardware (pink) = Q3 2026 filed capex: AMZN 77.3, GOOG 51.4, MSFT 39.7,
  META 33.9, ORCL 28.5 (total 237.4B; sellers chip revenue 123.8B).
  Investment (cyan) = NVDA $30B OpenAI check Feb 27, 2026; $100B OpenAI LOI
  (NOT signed).
  Services (blue) = OpenAI $300B Oracle cloud deal (signed).
  Guarantee (orange) = SB Energy $105B cap Aug 17, 2026; neocloud backstops
  $59.5B (10-Q Aug 26, 2026; includes CoreWeave $6.3B — do not add).
  Supply (grey) = NVDA $279B supply commitments (wafers + memory).
  AMD 6 GW GPUs to OpenAI is in the note box (its arrow is the pink one).
Caveats: capex is ALL data-center spend, not just chips (hardware ~52%);
$35.2B circular revenue is an UPPER BOUND; TSMC flow amount not filed.
Usage: python3 build_money_machine.py [out.png]
Output: PNG preview (sheet "Circular earnings" + "Quarterly real P/E" are canonical).
"""
import sys
import math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Circle

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/hatch/workspace/your_files/nvda-money-machine-v1.png"
D = "\\$"  # escaped dollar for matplotlib text

NAVY = "#14213D"; GREY = "#5A5A5A"
PINK = "#D63384"; CYAN = "#0096A6"; BLUE = "#2F6FBB"
ORANGE = "#E07B00"; SUPPLY = "#6B6B6B"
NVDA_GREEN = "#76B900"

# node: angle deg on the ellipse, market cap $B (None = private), sub-label
NODES = {
    "NVDA":      dict(angle=None, mc=3932, sub=D + "3.9T", big=True),
    "OpenAI":    dict(angle=90,   mc=1250, sub=D + "1.25T*"),
    "Microsoft": dict(angle=54,   mc=3890, sub=D + "3.9T"),
    "Oracle":    dict(angle=18,   mc=391,  sub=D + "391B"),
    "AMD":       dict(angle=-18,  mc=876,  sub=D + "876B"),
    "Neoclouds": dict(angle=-54,  mc=None, sub=D + "59.5B" + chr(8224), r=5.0, sub_below=True),
    "SB Energy": dict(angle=-90,  mc=None, sub=D + "105B" + chr(8224), r=5.0, sub_below=True),
    "TSMC":      dict(angle=-126, mc=2068, sub=D + "2.1T"),
    "Amazon":    dict(angle=-162, mc=2883, sub=D + "2.9T"),
    "Alphabet":  dict(angle=162,  mc=1632, sub=D + "1.6T" + chr(8225)),
    "Meta":      dict(angle=126,  mc=1421, sub=D + "1.4T"),
}

CX, CY, RX, RY = 50, 27.5, 38, 19.5  # RY 19.5 (was 21): OpenAI grew to $1.25T and its circle was clipped at the top

def node_xy(name):
    n = NODES[name]
    if n["angle"] is None:
        return (CX, CY)
    a = math.radians(n["angle"])
    return (CX + RX * math.cos(a), CY + RY * math.sin(a))

def node_r(name):
    n = NODES[name]
    if "r" in n:
        return n["r"]
    return 2.8 + 5.6 * math.sqrt(n["mc"] / 3932.0)

fig = plt.figure(figsize=(14, 12.5), dpi=200)
fig.patch.set_facecolor("white")

fig.text(0.5, 0.965, "The AI Money Machine \u2014 Nvidia at the Center",
         ha="center", va="center", fontsize=21, fontweight="bold", color=NAVY)
fig.text(0.5, 0.935, "Who pays, who buys, who owes \u2014 filed numbers, Q3 2026 / H1 FY27  \u2022  circles sized by market value (Nov 13 close)",
         ha="center", va="center", fontsize=11, color=GREY)

lx = 0.06
for i, (label, color) in enumerate([
        ("Hardware / chips", PINK), ("Investment", CYAN), ("Services", BLUE),
        ("Guarantee / backstop", ORANGE), ("Supply", SUPPLY)]):
    x = lx + i * 0.185
    fig.patches.append(plt.Line2D([x, x + 0.025], [0.905, 0.905], color=color, lw=4,
                                  transform=fig.transFigure, solid_capstyle="round"))
    fig.text(x + 0.032, 0.905, label, ha="left", va="center", fontsize=9.5, color="#222222")

ax = fig.add_axes([0.02, 0.36, 0.96, 0.52])
ax.set_xlim(0, 100); ax.set_ylim(0, 54); ax.axis("off")

def shorten(p0, p1, r0, r1):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    d = math.hypot(dx, dy)
    ux, uy = dx / d, dy / d
    return ((p0[0] + ux * (r0 + 0.6), p0[1] + uy * (r0 + 0.6)),
            (p1[0] - ux * (r1 + 0.6), p1[1] - uy * (r1 + 0.6)))

def arrow(a, b, color, label, rad=0.0, ls="-", tpos=0.5, toff=3.0, fs=8.8):
    p0, p1 = shorten(node_xy(a), node_xy(b), node_r(a), node_r(b))
    ax.add_patch(FancyArrowPatch(p0, p1, connectionstyle=f"arc3,rad={rad}",
                                 arrowstyle="-|>,head_width=7,head_length=11",
                                 color=color, lw=3.2, linestyle=ls, shrinkA=0, shrinkB=0))
    mx = p0[0] + (p1[0] - p0[0]) * tpos
    my = p0[1] + (p1[1] - p0[1]) * tpos
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    d = math.hypot(dx, dy)
    px, py = -dy / d, dx / d
    ax.text(mx + px * toff, my + py * toff, label, ha="center", va="center",
            fontsize=fs, fontweight="bold", color=color, zorder=6,
            bbox=dict(boxstyle="round,pad=0.28", facecolor="white", edgecolor=color,
                      linewidth=0.8, alpha=0.94))

# --- flows: label positions hand-spread so nothing stacks (v1 audit) ---
arrow("Amazon", "NVDA", PINK, "capex " + D + "77.3B, Q3", rad=0.28, tpos=0.42, toff=3.2)
arrow("Alphabet", "NVDA", PINK, "capex " + D + "51.4B, Q3", rad=0.12, tpos=0.55, toff=3.0)
arrow("Meta", "NVDA", PINK, "capex " + D + "33.9B, Q3", rad=-0.20, tpos=0.30, toff=4.5)
arrow("Microsoft", "NVDA", PINK, "capex " + D + "39.7B, Q3", rad=0.30, tpos=0.25, toff=3.8)
arrow("Oracle", "NVDA", PINK, "capex " + D + "28.5B, Q3", rad=-0.10, tpos=0.65, toff=3.0)
arrow("NVDA", "OpenAI", CYAN, D + "30B check, Feb 2026", rad=0.35, tpos=0.85, toff=-4.0)
arrow("NVDA", "OpenAI", CYAN, D + "100B LOI \u2014 not signed", rad=-0.35, ls=(0, (5, 3)),
      tpos=0.15, toff=-4.0)  # low + left: the gap between the circles is only ~5 units, spread the three labels vertically
arrow("OpenAI", "NVDA", PINK, "buys chips \u2014 " + D + "35.2B", rad=0.05, tpos=0.50, toff=4.5)  # middle + right
arrow("NVDA", "Neoclouds", ORANGE, D + "59.5B backstop", rad=0.18, tpos=0.5, toff=3.0)
arrow("NVDA", "SB Energy", ORANGE, D + "105B cap, Aug 2026", rad=0.0, tpos=0.5, toff=3.4)
arrow("NVDA", "TSMC", SUPPLY, "supply " + D + "279B\nwafers + memory", rad=-0.50, tpos=0.50, toff=-4.0)
arrow("TSMC", "NVDA", PINK, "ships chips", rad=0.25, tpos=0.50, toff=-3.5)
arrow("OpenAI", "Oracle", BLUE, D + "300B cloud deal", rad=0.45, tpos=0.85, toff=-3.5)
arrow("AMD", "OpenAI", PINK, "6 GW GPUs", rad=0.30, tpos=0.25, toff=4.5)

# --- nodes ---
for name, n in NODES.items():
    x, y = node_xy(name)
    r = node_r(name)
    big = n.get("big", False)
    edge = NVDA_GREEN if big else NAVY
    lw = 3.0 if big else 2.0
    face = "#EAF5D6" if big else "white"
    ax.add_patch(Circle((x, y), r, facecolor=face, edgecolor=edge, linewidth=lw, zorder=5))
    ax.text(x, y + 1.5, name, ha="center", va="center", fontsize=11 if big else 10,
            fontweight="bold", color=NAVY, zorder=7)
    if n.get("sub_below"):
        ax.text(x, y - r - 1.8, n["sub"], ha="center", va="center", fontsize=9.5,
                color=GREY, zorder=7)
    else:
        ax.text(x, y - 2.6, n["sub"], ha="center", va="center", fontsize=9.5,
                fontweight="bold" if big else "normal",
                color=GREY if not big else NAVY, zorder=7)
    if big:
        ax.text(x, y - 5.6, "Real P/E 25.5x", ha="center", va="center", fontsize=8.5,
                fontweight="bold", color=NVDA_GREEN, zorder=7)

# --- deal notes: figure-level boxes below the network (never inside the axes) ---
def notebox(x0, title, body):
    y0, w, h = 0.25, 0.31, 0.08
    fig.patches.append(FancyBboxPatch((x0, y0), w, h,
                                      boxstyle="round,pad=0.008,rounding_size=0.012",
                                      facecolor="#F4F6F8", edgecolor="#CCCCCC", linewidth=1.2,
                                      transform=fig.transFigure, zorder=3))
    fig.text(x0 + w / 2, y0 + h - 0.014, title, ha="center", va="top", fontsize=10,
             fontweight="bold", color=NAVY)
    fig.text(x0 + w / 2, y0 + h - 0.034, body, ha="center", va="top", fontsize=9,
             color="#222222", linespacing=1.5)

notebox(0.03, "OPENAI \u00d7 AMD",
        "OpenAI to deploy 6 GW of AMD GPUs.\nAMD gives OpenAI an option for\nup to 160M shares.")
notebox(0.345, "NVIDIA \u00d7 OPENAI",
        "Nvidia agrees to invest up to " + D + "100B\nin OpenAI \u2014 an LOI, NOT signed.\nOnly " + D + "30B has actually been paid.")
notebox(0.66, "OPENAI \u00d7 ORACLE",
        "OpenAI inks a " + D + "300B cloud deal\nwith Oracle (signed). Oracle spends\ntens of billions on Nvidia chips.")

fig.text(0.5, 0.215,
         "THE LOOP:  Nvidia pays " + D + "35.2B net \u2192 up to " + D + "35.2B (20%) of H1 revenue self-funded \u2192 real profit " + D + "77.7B, not " + D + "118.0B \u2192 real P/E 25.5x vs 16.8x",
         ha="center", va="center", fontsize=10, fontweight="bold", color="white",
         bbox=dict(boxstyle="round,pad=0.6", facecolor=NAVY, edgecolor="none"))
fig.text(0.5, 0.175,
         "Cash check: H1 operating cash flow gives cash P/E 26.6x \u2014 two methods, same answer.  Q3 capex is ALL data-center spend, not just chips (hardware ~52%).",
         ha="center", va="center", fontsize=9.5, color=GREY)
fig.text(0.5, 0.14,
         "Sources: 8-K Ex 99.1 Q2 FY27  \u2022  10-Q Q2 FY27  \u2022  Bloomberg News reporting (OpenAI " + D + "1.25T, Nov 6 2026, Microsoft " + D + "3.9T)  \u2022  market values Nov 13, 2026 close.",
         ha="center", va="center", fontsize=8, color=GREY)
fig.text(0.5, 0.11,
         "* OpenAI " + D + "1.25T is a reported valuation, not a market value.  \u2020  Neoclouds / SB Energy are private \u2014 sized by their flow.  \u2021  Alphabet " + D + "1.6T is Class C only.",
         ha="center", va="center", fontsize=8, color=GREY)
fig.text(0.5, 0.08,
         D + "35.2B circular revenue is an UPPER BOUND \u2014 the filing does not say how much was spent on chips in H1.  TSMC flow amount is not filed.",
         ha="center", va="center", fontsize=8, color=GREY)

plt.savefig(OUT, facecolor="white")
print("saved", OUT)
