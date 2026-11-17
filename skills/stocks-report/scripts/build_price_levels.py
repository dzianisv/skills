"""Build a price chart: price line + 50-day average + the levels that matter.

Usage:
    python3 build_price_levels.py --ticker NVDA --close 162.85 --close-date "Nov 13" \
        --levels "243.37:#c0392b:52-week high (Oct 6)" \
                 "185.00:#7d3c98:Call wall, straddle top 185.10" \
                 "150.00:#2e86c1:Collar floor" \
                 "138.90:#27ae60:Straddle low"

Levels come from the run's own numbers (options check + verdict cell).
Dollar signs in labels must be escaped as \\$ when a label holds two or
more of them, or matplotlib reads them as math mode.
"""
import argparse
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import pandas as pd
import yfinance as yf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticker", required=True)
    ap.add_argument("--close", type=float, required=True)
    ap.add_argument("--close-date", required=True)
    ap.add_argument("--levels", nargs="*", default=[])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    df = yf.Ticker(args.ticker).history(period="7mo", interval="1d", auto_adjust=False)
    df = df[df["Close"].notna()]
    df["SMA50"] = df["Close"].rolling(50).mean()

    fig, ax = plt.subplots(figsize=(12, 6.5))
    ax.plot(df.index, df["Close"], color="#1f77b4", lw=2, label="Price")
    ax.plot(df.index, df["SMA50"], color="#ff7f0e", lw=1.6, label="50-day average")

    for spec in args.levels:
        price, color, label = spec.split(":", 2)
        price = float(price)
        ax.axhline(price, color=color, lw=1.1, ls="--", alpha=0.85)
        ax.text(df.index[-1], price, "  " + label, va="center", ha="left",
                fontsize=9, color=color, fontweight="bold",
                bbox=dict(facecolor="white", edgecolor="none", alpha=0.7, pad=1))

    ax.axhline(args.close, color="#1f77b4", lw=1.1, ls="--", alpha=0.85)
    ax.text(df.index[-1], args.close,
            "  Now \\$%.2f (%s close)" % (args.close, args.close_date),
            va="center", ha="left", fontsize=9, color="#1f77b4", fontweight="bold",
            bbox=dict(facecolor="white", edgecolor="none", alpha=0.7, pad=1))

    ax.set_title("%s — price, 50-day average, and the levels that matter"
                 % args.ticker, fontsize=13, fontweight="bold")
    ax.set_ylabel("Price, $")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.grid(True, alpha=0.3)
    ax.legend(loc="upper left", fontsize=9)
    ax.set_xlim(df.index[0], df.index[-1] + pd.Timedelta(days=55))
    fig.tight_layout()
    fig.savefig(args.out, dpi=150)
    print("saved", args.out, "last close:", round(float(df["Close"].iloc[-1]), 2))


if __name__ == "__main__":
    main()
