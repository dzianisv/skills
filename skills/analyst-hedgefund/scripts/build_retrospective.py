"""Retrospective — was it the right bet? Indexed price + quarterly revenue.
One chart per the analyst-hedgefund skill, on demand: when Den asks for a
retrospective ("was investing in X the right bet?"), compare two or more
stocks over the same period. Panel 1: daily closes indexed to 100 at the
start date — the lines show who won the period. Panel 2: quarterly revenue
bars — the lines show whether the business grew with the price.

Inputs (argv 1): JSON with
  {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD",
   "closes": {"TICKER": [["YYYY-MM-DD", close], ...], ...},
   "q_rev": {"TICKER": [["label", revenue_usd_b], ...], ...}}
Quarterly revenue is filed (yfinance quarterly income statement, Total
Revenue). Lists from yfinance are newest-first — reverse them before
plotting or time runs backwards. The q_rev lists must already be in
oldest-first order in the JSON — the script does NOT sort them (quarter
labels like "Jul 25" do not sort chronologically as strings).
Usage: python3 build_retrospective.py run.json [out.png]
Output: PNG preview (no sheet tab — a retrospective is a one-off comparison).
"""
import json
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import date, timedelta

RUN = json.load(open(sys.argv[1]))
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/hatch/workspace/your_files/retrospective.png"
COLORS = {"NVDA": "#76B900", "AVGO": "#CC092F", "AMD": "#ED1C24",
          "TSM": "#C00000", "MRVL": "#F7941E", "PLTR": "#111111"}
NAVY = "#14213D"; GREY = "#5A5A5A"

tickers = list(RUN["closes"].keys())
start, end = RUN["start"], RUN["end"]

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 9), dpi=200,
                               gridspec_kw={"hspace": 0.4, "left": 0.07,
                                            "right": 0.97, "top": 0.88, "bottom": 0.1})
fig.patch.set_facecolor("white")
fig.text(0.5, 0.95, f"Retrospective — {', '.join(tickers)}  ({start} to {end})",
         ha="center", va="center", fontsize=16, fontweight="bold", color=NAVY)
fig.text(0.5, 0.915, "Price indexed to 100 at the start date  •  Quarterly revenue, filed, USD billions",
         ha="center", va="center", fontsize=10, color=GREY)

# Panel 1: indexed closes
ax1.set_title("Price, indexed (start = 100)", fontsize=12, fontweight="bold", color=NAVY, loc="left", pad=8)
for t in tickers:
    pts = sorted(RUN["closes"][t])  # oldest first
    ds = [date.fromisoformat(d) for d, _ in pts]
    base = pts[0][1]
    idx = [c / base * 100 for _, c in pts]
    ax1.plot(ds, idx, lw=2.2, color=COLORS.get(t, "#333333"), label=t)
    ax1.annotate(f"{t} {idx[-1]:.0f} ({idx[-1]-100:+.0f}%)", (ds[-1], idx[-1]),
                 textcoords="offset points", xytext=(6, 0), fontsize=10,
                 fontweight="bold", color=COLORS.get(t, "#333333"), va="center",
                 bbox=dict(boxstyle="round,pad=0.25", facecolor="white",
                           edgecolor="none", alpha=0.85))
ax1.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
ax1.set_xlim(date.fromisoformat(start),
             date.fromisoformat(end) + timedelta(days=45))  # room for the end labels
ax1.grid(axis="y", color="#E5E5E5", lw=0.9)
ax1.set_axisbelow(True)
ax1.tick_params(labelsize=9.5, colors=GREY)
for s in ["top", "right"]:
    ax1.spines[s].set_visible(False)
ax1.legend(loc="upper left", fontsize=10, frameon=False)

# Panel 2: quarterly revenue, grouped bars (labels in the order given —
# oldest first; do NOT sort — quarter labels do not sort chronologically)
ax2.set_title("Quarterly revenue, USD B", fontsize=12, fontweight="bold", color=NAVY, loc="left", pad=8)
labels = None
for t in tickers:
    q = RUN["q_rev"][t]
    labels = [l for l, _ in q]
    break
n = len(tickers)
w = 0.8 / n
for i, t in enumerate(tickers):
    q = RUN["q_rev"][t]
    vals = [v for _, v in q]
    xs = [j + (i - (n - 1) / 2) * w for j in range(len(vals))]
    ax2.bar(xs, vals, width=w, color=COLORS.get(t, "#333333"), label=t)
ax2.set_xticks(range(len(labels))); ax2.set_xticklabels(labels, fontsize=10)
ax2.set_ylabel("USD B", fontsize=10, color=GREY)
ax2.grid(axis="y", color="#E5E5E5", lw=0.9)
ax2.set_axisbelow(True)
ax2.tick_params(labelsize=9.5, colors=GREY)
for s in ["top", "right"]:
    ax2.spines[s].set_visible(False)
ax2.legend(loc="upper left", fontsize=10, frameon=False)

plt.savefig(OUT, facecolor="white")
print("saved", OUT)
