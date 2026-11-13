"""Trailing P/E and forward P/E per quarter — Nvidia, Intel and peers.
One chart per the hedge-analyst skill: the Lynch valuation visual (is the
multiple compressing or expanding?). Two panels: trailing P/E (quarter-end
close / TTM GAAP diluted EPS) and forward P/E (price / next fiscal year
expected EPS, GuruFocus).

Inputs: none — the table is the filed/published quarterly series, embedded
with its source. Refresh from GuruFocus (gurufocus.com/term/forward-pe-ratio)
and the sheet's "Quarterly charts" Section E when a new quarter publishes.
  Quarters: Q3 2025, Q4 2025, Q1 2026, Q2 2026, Q3 2026, Today (Nov 12, 2026).
  Trailing P/E: NVDA 47.0/37.8/33.0/24.7/28.9/21.1; INTC At Loss every
  quarter (TTM EPS negative); AMD 80.1/80.8/66.7/149.0/133.0/120.2;
  AVGO 77.6/63.5/69.6/49.7/44.9/45.1; QCOM 33.2/33.5/25.5/21.4/14.5/13.7;
  TXN 33.3/31.7/33.4/45.4/36.3/39.0; MRVL n/m/31.0/32.3/102.0/87.2/51.0.
  Forward P/E: NVDA 28.81/24.77/25.16/23.15/-/10.96; INTC
  56.08/62.09/87.66/119.93/-/33.10; AMD 26.89/33.25/30.32/70.54/-/31.10;
  AVGO 38.24/32.88/37.35/19.81/-/17.09; QCOM 12.76/13.96/14.11/11.72/-/17.47;
  TXN 27.60/28.88/29.51/36.87/-/26.06; MRVL 25.12/22.04/43.29/47.88/-/22.30.
  Q3 2026 forward P/E is not published yet (GuruFocus series ends Q2 2026).
Caveats: QCOM GAAP one-offs (Sep 2025 -$2.89, Mar 2026 +$6.88) and MRVL's
+$2.20 one-off gain (Oct 2025) distort trailing P/E — read them with the
forward P/E. MRVL Q4 2025 ~31 is approximate.
Usage: python3 build_pe_fpe.py [out.png]
Output: PNG preview (sheet tab "Quarterly charts" Section E is canonical).
"""
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/hatch/workspace/your_files/pe-fpe.png"

QUARTERS = ["Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26", "Today"]
# None = not published / not meaningful (At Loss / n/m)
PE = {  # trailing P/E
    "NVDA": [47.0, 37.8, 33.0, 24.7, 28.9, 21.1],
    "INTC": [None, None, None, None, None, None],
    "AMD": [80.1, 80.8, 66.7, 149.0, 133.0, 120.2],
    "AVGO": [77.6, 63.5, 69.6, 49.7, 44.9, 45.1],
    "QCOM": [33.2, 33.5, 25.5, 21.4, 14.5, 13.7],
    "TXN": [33.3, 31.7, 33.4, 45.4, 36.3, 39.0],
    "MRVL": [None, 31.0, 32.3, 102.0, 87.2, 51.0],
}
FPE = {  # forward P/E, GuruFocus next-fiscal-year basis
    "NVDA": [28.81, 24.77, 25.16, 23.15, None, 10.96],
    "INTC": [56.08, 62.09, 87.66, 119.93, None, 33.10],
    "AMD": [26.89, 33.25, 30.32, 70.54, None, 31.10],
    "AVGO": [38.24, 32.88, 37.35, 19.81, None, 17.09],
    "QCOM": [12.76, 13.96, 14.11, 11.72, None, 17.47],
    "TXN": [27.60, 28.88, 29.51, 36.87, None, 26.06],
    "MRVL": [25.12, 22.04, 43.29, 47.88, None, 22.30],
}
COLORS = {"NVDA": "#76B900", "INTC": "#0071C5", "AMD": "#ED1C24", "AVGO": "#CC092F",
          "QCOM": "#3253DC", "TXN": "#CC0000", "MRVL": "#F7941E"}
NAVY = "#14213D"; GREY = "#5A5A5A"

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 9), dpi=200,
                               gridspec_kw={"hspace": 0.45, "left": 0.07,
                                            "right": 0.97, "top": 0.88, "bottom": 0.12})
fig.patch.set_facecolor("white")
fig.text(0.5, 0.955, "Trailing P/E and Forward P/E — Nvidia, Intel and Peers",
         ha="center", va="center", fontsize=17, fontweight="bold", color=NAVY)
fig.text(0.5, 0.92, "Quarterly, Q3 2025 – Nov 12, 2026  •  Trailing = quarter-end close / TTM GAAP EPS  •  Forward = GuruFocus, next fiscal year",
         ha="center", va="center", fontsize=10, color=GREY)

for ax, data, title, ylim, today_table in [
        (ax1, PE, "Trailing P/E (GAAP, TTM)", 160, False),
        (ax2, FPE, "Forward P/E (GuruFocus, next fiscal year)", 130, True)]:
    ax.set_title(title, fontsize=12, fontweight="bold", color=NAVY, loc="left", pad=8)
    for t, series in data.items():
        xs = [i for i, v in enumerate(series) if v is not None]
        ys = [v for v in series if v is not None]
        if not xs:
            continue
        ax.plot(xs, ys, marker="o", ms=5, lw=2, color=COLORS[t], label=t)
        if not today_table:
            # label the latest (Today) point — the trailing lines are far
            # enough apart for this; the forward lines are not (see below)
            ax.annotate(f"{t} {ys[-1]:.1f}x", (xs[-1], ys[-1]),
                        textcoords="offset points", xytext=(6, 0), fontsize=8.5,
                        fontweight="bold", color=COLORS[t], va="center")
    if today_table:
        # the forward lines converge at Today (11–33x) — point labels would
        # collide, so list today's values in one sorted column instead
        today = sorted(((s[-1], t) for t, s in data.items()
                        if s[-1] is not None), reverse=True)
        lines = ["Today:"] + [f"{t} {v:.1f}x" for v, t in today]
        ax.text(5.75, ylim - 4, "\n".join(lines), fontsize=9, color=NAVY,
                ha="left", va="top",
                bbox=dict(boxstyle="round,pad=0.4", facecolor="white",
                          edgecolor="#CCCCCC"))
    ax.set_xticks(range(len(QUARTERS))); ax.set_xticklabels(QUARTERS, fontsize=10)
    ax.set_xlim(-0.2, 6.3); ax.set_ylim(0, ylim)
    ax.tick_params(labelsize=9.5, colors=GREY)
    ax.grid(axis="y", color="#E5E5E5", lw=0.9)
    ax.set_axisbelow(True)
    for s in ["top", "right"]:
        ax.spines[s].set_visible(False)
    ax.legend(loc="upper left", fontsize=9, ncol=7, frameon=False)

fig.text(0.5, 0.045,
         "Intel trailing P/E is At Loss in every quarter (TTM GAAP EPS negative). Q3 2026 forward P/E not published yet.",
         ha="center", va="center", fontsize=9, color=GREY)
fig.text(0.5, 0.02,
         "QCOM and MRVL trailing P/E are distorted by one-off gains/losses — read them with the forward P/E. Sources: GuruFocus, YCharts, Yahoo Finance.",
         ha="center", va="center", fontsize=9, color=GREY)
plt.savefig(OUT, facecolor="white")
print("saved", OUT)
