#!/usr/bin/env python3
"""Weinstein stage check — computes the stage inputs exactly as defined in
references/weinstein-framework.md (Operational definitions) and prints the
stage call per ticker.

Usage:
    stage_check.py NVDA GOOG [TICKER ...] [--index SPY]

Data: yfinance daily, split/dividend adjusted. Weekly bars are Friday
closes (W-FRI resample). Run with the stocks venv:
    ~/workspace/.venv-stocks/bin/python stage_check.py NVDA GOOG

Market layer: the index (default SPY) is always checked first — Weinstein
reads the forest before the trees.
"""

import argparse
import sys

import pandas as pd
import yfinance as yf

START = "2022-06-01"  # enough history for 30-wk MA + 52-wk RS average
FLAT_BAND = 0.005  # MA slope within +/-0.5% over 10 weeks counts as flat


def fetch(ticker, end):
    df = yf.download(ticker, start=START, end=end, auto_adjust=True,
                     progress=False)
    if df.empty:
        raise RuntimeError(f"no data for {ticker}")
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    return df


def weekly(df):
    w = df.resample("W-FRI").agg({"Close": "last", "Volume": "sum"}).dropna()
    return w


def stage_call(price, ma, slope):
    """Stage call from price vs MA and MA slope (10-week change).

    Precision rule (NVDA case, 2026-11-23): price below a still-rising MA
    is 'late stage 3 transitioning to 4', never stage 4 — stage 4 requires
    a declining MA. Stage 1 vs stage 3 cannot be separated by these inputs
    alone (both sit at a flat MA); the prior trend decides, so flat-MA
    cases near the line are reported as the 1/3 zone.
    """
    above = price > ma
    rising = slope > FLAT_BAND
    falling = slope < -FLAT_BAND
    if above and rising:
        return "Stage 2 (advancing)"
    if above and falling:
        return "Stage 3 (topping — price above a falling MA, late top)"
    if above:
        return "Stage 2/3 borderline (price above a flattening MA — stage 3 watch)"
    if falling:
        return "Stage 4 (declining)"
    if rising:
        return "Late stage 3 transitioning to 4 (price below a still-rising MA)"
    return "Stage 1/3 zone (price below a flat MA — basing after a decline = 1, topping after an advance = 3; prior trend decides)"


def analyze(ticker, df, index_close):
    w = weekly(df)
    w["MA30"] = w["Close"].rolling(30).mean()
    w = w.dropna()
    last = w.iloc[-1]
    price = float(last["Close"])
    ma = float(last["MA30"])
    ma_10w = float(w.iloc[-11]["MA30"])
    slope = ma / ma_10w - 1
    vs_ma = price / ma - 1

    # Volume signature: last 12 weeks, up weeks vs down weeks
    recent = w.tail(13)
    chg = recent["Close"].pct_change().dropna()
    vols = recent["Volume"].iloc[1:]
    up_vol = vols[chg > 0].mean()
    dn_vol = vols[chg < 0].mean()

    # Mansfield-style relative strength: stock/index ratio, weekly
    ratio = (df["Close"] / index_close).dropna()
    rs_w = ratio.resample("W-FRI").last().dropna()
    rs_now = float(rs_w.iloc[-1])
    rs_26w = rs_now / float(rs_w.iloc[-27]) - 1
    rs_vs_avg = rs_now / float(rs_w.tail(52).mean()) - 1

    high_52 = float(w["Close"].tail(52).max())
    from_high = price / high_52 - 1

    return {
        "ticker": ticker,
        "week": w.index[-1].date(),
        "price": price,
        "ma": ma,
        "vs_ma": vs_ma,
        "slope": slope,
        "up_vol": up_vol / 1e9,
        "dn_vol": dn_vol / 1e9,
        "rs_26w": rs_26w,
        "rs_vs_avg": rs_vs_avg,
        "from_high": from_high,
        "call": stage_call(price, ma, slope),
    }


def fmt(r, label=None, is_index=False):
    name = label or r["ticker"]
    lines = [
        f"{name} — week of {r['week']}",
        f"  Close:            {r['price']:.2f}",
        f"  30-week MA:       {r['ma']:.2f}  (price {r['vs_ma']:+.1%} vs MA)",
        f"  MA slope (10w):   {r['slope']:+.1%}",
        f"  Volume 12w avg:   up weeks {r['up_vol']:.2f}B | down weeks {r['dn_vol']:.2f}B",
    ]
    if not is_index:
        lines.append(
            f"  RS vs index:      {r['rs_26w']:+.1%} over 26w | {r['rs_vs_avg']:+.1%} vs its 52w average")
    lines += [
        f"  From 52w high:    {r['from_high']:.1%}",
        f"  STAGE CALL:       {r['call']}",
    ]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Weinstein stage check")
    ap.add_argument("tickers", nargs="+")
    ap.add_argument("--index", default="SPY")
    args = ap.parse_args()

    end = (pd.Timestamp.today() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        index_df = fetch(args.index, end)
    except Exception as e:
        print(f"ERROR fetching index {args.index}: {e}", file=sys.stderr)
        return 1
    index_close = index_df["Close"]

    # Market layer first — the forest before the trees.
    try:
        mkt = analyze(args.index, index_df, index_close)
        print(fmt(mkt, label=f"MARKET ({args.index})", is_index=True))
        print()
    except Exception as e:
        print(f"ERROR analyzing index {args.index}: {e}", file=sys.stderr)

    rc = 0
    for t in args.tickers:
        try:
            df = fetch(t, end)
            print(fmt(analyze(t, df, index_close)))
            print()
        except Exception as e:
            print(f"ERROR {t}: {e}", file=sys.stderr)
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
