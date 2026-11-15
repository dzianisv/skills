"""Price chart with the smart-money transactions on it — one panel per stock.

Price line + 50-day average + the levels that matter, PLUS:
  Form 4 insider sales — red dots sized by value, at (sale date, sale price).
  PTR congress trades — purple up-triangles (buys) / orange down-triangles
    (sells), sized by amount-range midpoint, at (trade date, market close
    on the trade date). PTR gives ranges only, never a trade price.
  13F — no trade dates and no prices, so no dots: a diamond at the
    quarter-end date at the quarter-end close, plus the snapshot text.
    The quarter-end close is the reference price, never a buy price.

Usage:
    python3 build_price_with_filings.py --ticker NVDA --close 162.85 \
        --close-date "Nov 13" --out nvda-price-with-filings.png

Reads the filings file (PTR + Q2 13F holders) for the ticker. The 9 Form 4
sales and the Q3 13F changes below are the verified constants for NVDA
(critic-verified 2026-11-15; Q3 13F digest Nov 14) — the daily run replaces
them from its own filings pull per ticker. Dollar signs in labels must be
escaped as \\$ when a label holds two or more of them, or matplotlib reads
them as math mode.
"""
import argparse
import json
import re
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import pandas as pd
import yfinance as yf

# Verified NVDA Form 4 open-market sales, May 27 – Sep 21, 2026
# (date, insider, shares, price, value_m). Total 1,370.5M USD, wavg ~221 USD.
FORM4_SALES = [
    ("2026-05-27", "Dabiri", 625, 214.00, 0.13),
    ("2026-06-03", "Neal", 15500, 215.73, 3.34),
    ("2026-06-04", "Stevens", 1000000, 220.02, 221.10),
    ("2026-06-18", "Stevens", 885000, 210.07, 186.00),
    ("2026-08-31", "Teter", 30000, 217.69, 6.53),
    ("2026-09-02", "Stevens", 1848501, 223.16, 410.84),
    ("2026-09-04", "Stevens", 1022239, 230.85, 235.64),
    ("2026-09-18", "Stevens", 1366000, 220.07, 300.15),
    ("2026-09-21", "Teter", 30460, 222.97, 6.79),
]

# Q3 2026 13F changes for NVDA (positions Sep 30, filed Nov 13, 2026).
Q3_13F = [("Soros", -19, 858822), ("ARK", +85, 2560000)]

LEVELS = [
    (243.37, "#c0392b", "52-week high 243.37 USD (Oct 6)"),
    (185.00, "#7d3c98", "Call wall 185 USD, straddle top 185.10 USD"),
    (150.00, "#2e86c1", "Collar floor 150 USD"),
    (138.90, "#27ae60", "Straddle low 138.90 USD"),
]


def parse_bracket(s):
    if not s:
        return None
    parts = re.split(r"[-–—]", s.replace("$", "").replace(",", "").strip())

    def num(x):
        x = x.strip()
        mult = 1
        if x.endswith("M"):
            mult, x = 1e6, x[:-1]
        elif x.endswith("K"):
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticker", default="NVDA")
    ap.add_argument("--close", type=float, required=True)
    ap.add_argument("--close-date", required=True)
    ap.add_argument("--filings", default="/home/hatch/workspace/goals/investor-daily-stocks-report-and-dip-alert/hidden_files/filings6.json")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    t = args.ticker

    df = yf.Ticker(t).history(period="7mo", interval="1d", auto_adjust=False)
    df = df[df["Close"].notna()]
    df["SMA50"] = df["Close"].rolling(50).mean()
    close_by_date = {d.strftime("%Y-%m-%d"): c for d, c in zip(df.index, df["Close"])}

    F = json.load(open(args.filings))
    ptr = [r for r in F["ptr"] if r.get("ticker") == t and not r.get("exclude_from_plot")]
    x0, x1 = df.index[0], df.index[-1]
    ptr_win = []
    for r in ptr:
        d = r["trade_date"]
        if not (str(x0.date()) <= d <= str(x1.date())):
            continue
        close = r.get("close_on_trade_date") or close_by_date.get(d)
        if close is None:
            continue
        ptr_win.append((r, close))
    ptr_buys = [p for p in ptr_win if p[0]["buy_sell"].lower() == "buy"]
    ptr_sells = [p for p in ptr_win if p[0]["buy_sell"].lower() == "sell"]

    def avg_close(ps):
        return sum(c for _, c in ps) / len(ps) if ps else None

    # Form 4 summary (from the verified constants).
    tot_m = sum(v for _, _, _, _, v in FORM4_SALES)
    wavg = sum(s * p for _, _, s, p, _ in FORM4_SALES) / sum(s for _, _, s, _, _ in FORM4_SALES)
    f4_range = "%s – %s" % (FORM4_SALES[0][0][5:], FORM4_SALES[-1][0][5:])

    # 13F quarter-end reference: Sep 30, 2026 close.
    q3_close = close_by_date.get("2026-09-30")

    fig, ax = plt.subplots(figsize=(13, 7.2))
    ax.plot(df.index, df["Close"], color="#1f77b4", lw=2, label="Price")
    ax.plot(df.index, df["SMA50"], color="#ff7f0e", lw=1.6, label="50-day average")

    for price, color, label in LEVELS:
        ax.axhline(price, color=color, lw=1.1, ls="--", alpha=0.85)
        ax.text(df.index[-1], price, "  " + label, va="center", ha="left",
                fontsize=9, color=color, fontweight="bold",
                bbox=dict(facecolor="white", edgecolor="none", alpha=0.7, pad=1))
    ax.axhline(args.close, color="#1f77b4", lw=1.1, ls="--", alpha=0.85)
    ax.text(df.index[-1], args.close,
            "  Now \\$%.2f (%s close)" % (args.close, args.close_date),
            va="center", ha="left", fontsize=9, color="#1f77b4", fontweight="bold",
            bbox=dict(facecolor="white", edgecolor="none", alpha=0.7, pad=1))

    # Form 4 sales — red dots sized by value.
    for d, name, sh, price, val in FORM4_SALES:
        ax.scatter([datetime.fromisoformat(d)], [price],
                   s=max(25, 9 * np.sqrt(val)), color="#de2d26", alpha=0.85,
                   edgecolors="white", linewidths=0.5, zorder=5)
    big = max(FORM4_SALES, key=lambda r: r[4])
    ax.annotate("Stevens Sep 2: 1.85M sh at 223 USD, 411M USD",
                xy=(datetime.fromisoformat(big[0]), big[3]),
                xytext=(-8, 24), textcoords="offset points", ha="right", fontsize=9,
                arrowprops=dict(arrowstyle="->", color="#de2d26", lw=0.8))

    # PTR congress trades.
    for r, close in ptr_win:
        d = datetime.fromisoformat(r["trade_date"])
        br = parse_bracket(r.get("amount_range", ""))
        mid = (br[0] + br[1]) / 2 if br else 8000
        size = max(18, 15 + 2.2 * np.sqrt(mid / 1000))
        if r["buy_sell"].lower() == "buy":
            ax.scatter([d], [close], s=size, marker="^", color="#7e57c2",
                       alpha=0.8, edgecolors="white", linewidths=0.5, zorder=4)
        else:
            ax.scatter([d], [close], s=size, marker="v", color="#ff8f00",
                       alpha=0.8, edgecolors="white", linewidths=0.5, zorder=4)
    if ptr_win:
        latest = max(ptr_win, key=lambda p: p[0]["trade_date"])
        r, close = latest
        ax.annotate("Congress %s %s %s at %d USD" % (
            r["member"].split()[-1], r["buy_sell"], r["trade_date"][5:], close),
            xy=(datetime.fromisoformat(r["trade_date"]), close),
            xytext=(8, -26), textcoords="offset points", ha="left", fontsize=9,
            arrowprops=dict(arrowstyle="->", color="#7e57c2", lw=0.8))

    # 13F — diamond at the quarter-end date at the quarter-end close.
    # Short label only; the Soros / ARK detail lives in the box below the chart.
    if q3_close:
        d = datetime.fromisoformat("2026-09-30")
        ax.scatter([d], [q3_close], s=110, marker="D", color="#111111",
                   edgecolors="white", linewidths=0.5, zorder=5)
        ax.annotate("Q3 13F Sep 30",
                    xy=(d, q3_close), xytext=(0, 12), textcoords="offset points",
                    ha="center", fontsize=9,
                    arrowprops=dict(arrowstyle="->", color="#111111", lw=0.8))

    holders = F["holders13f"][t]
    top5 = sum(h["pct_out"] for h in holders)

    b_avg = avg_close(ptr_buys)
    s_avg = avg_close(ptr_sells)
    box = (
        "Form 4 insiders (%s): 9 sales, %.1fM USD, avg sale %.0f USD (+%.0f%% vs now %.2f). No insider buys.\n"
        "Congress PTR in window: %d buys (avg close %.0f USD) / %d sells (avg close %.0f USD). "
        "Trump OGE Aug: 5 buys + 1 sale 500K-1M USD (publ. Oct 8).\n"
        "13F Q3 (Sep 30, close 227.21 USD): Soros -19%% to 858,822 sh; ARK +85%% to 2.56M sh. "
        "Top-5 funds Q2 %.1f%% (BlackRock 8.0%%). Q3 is a position at Sep 30, not a trade."
        % (f4_range, tot_m, wavg, (wavg / args.close - 1) * 100, args.close,
           len(ptr_buys), b_avg or 0, len(ptr_sells), s_avg or 0, top5))
    fig.text(0.01, 0.01, box, fontsize=8.5, verticalalignment="bottom",
             bbox=dict(boxstyle="round,pad=0.4", facecolor="white", alpha=0.95, edgecolor="none"))

    ax.set_title("%s — price, levels, and who traded (Form 4 + Congress PTR + 13F)"
                 % t, fontsize=13, fontweight="bold")
    ax.set_ylabel("Price, USD")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.grid(True, alpha=0.3)
    handles = [
        plt.Line2D([], [], color="#1f77b4", label="Price"),
        plt.Line2D([], [], color="#ff7f0e", label="50-day average"),
        plt.Line2D([], [], marker="o", color="w", markerfacecolor="#de2d26",
                   markersize=9, label="Insider sale (size = value)"),
        plt.Line2D([], [], marker="^", color="w", markerfacecolor="#7e57c2",
                   markersize=9, label="Congress buy"),
        plt.Line2D([], [], marker="v", color="w", markerfacecolor="#ff8f00",
                   markersize=9, label="Congress sell"),
        plt.Line2D([], [], marker="D", color="w", markerfacecolor="#111111",
                   markersize=8, label="13F quarter-end"),
    ]
    ax.legend(handles=handles, loc="upper left", fontsize=9, ncol=2)
    ax.set_xlim(df.index[0], df.index[-1] + pd.Timedelta(days=62))
    fig.tight_layout(rect=[0, 0.10, 1, 1])
    fig.savefig(args.out, dpi=150)
    print("saved", args.out)
    print("PTR in window: %d buys avg %.2f / %d sells avg %.2f"
          % (len(ptr_buys), b_avg or 0, len(ptr_sells), s_avg or 0))
    print("Form 4: 9 sales %.1fM USD wavg %.2f" % (tot_m, wavg))


if __name__ == "__main__":
    main()
