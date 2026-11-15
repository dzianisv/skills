"""Price chart with the smart-money transactions on it — one panel per stock.

Price line + 50-day average + the levels that matter, PLUS:
  Form 4 insider sales — red dots sized by value, at (sale date, sale price).
  PTR congress trades — purple up-triangles (buys) / orange down-triangles
    (sells), sized by amount-range midpoint, at (trade date, market close
    on the trade date). PTR gives ranges only, never a trade price.
  13F — no trade dates and no prices, so no dots: a diamond at the
    quarter-end date at the quarter-end close, plus the snapshot text.
    The quarter-end close is the reference price, never a buy price.
  Trump OGE 278-T trades are plotted as their own markers: gold diamonds
    labelled "Trump (OGE)", at (trade date, market close on the trade
    date), sized by amount-range midpoint; sells get a dark-red edge.
    The box under the chart names the OGE filing date. An OGE trade is
    plotted ONLY on a verified trade date — never guess one; trades
    whose date is not verified go in the box text as a quarter total
    (via the oge JSON's per-ticker notes), never as a marker.
    The chart window is 12 months so the Q1 2026 OGE trades and
    Pelosi's Dec 2025 / Jan 2026 PTR trades fall inside it.
    Pelosi trades are PTR and ride the congress layer — verify her
    markers actually appear on the rendered chart, do not assume it.

Usage:
    python3 build_price_with_filings.py --ticker GOOG --close 292.52 \\
        --close-date "Nov 13" --asof 2026-11-15 \\
        --levels "404.47:#c0392b:52-week high 404.47 USD (May 18)" \\
                 "318.85:#7d3c98:Straddle top 318.85 USD" \\
                 "310.00:#7d3c98:Sell limit 310 USD" \\
                 "300.00:#7d3c98:Call wall 300 USD, sell limit" \\
                 "271.15:#27ae60:Straddle low 271.15 USD" \\
        --ptr-extra ptr-extra-2026-11-15.json \\
        --form4-extra form4-extra-2026-11-15.json \\
        --q3-13f q3-13f-2026-11-15.json \\
        --oge-json oge-2026-11-15.json \\
        --out goog-price-with-filings.png

Data sources — per run, never hardcoded across runs:
  PTR + Q2 13F holders: the run's filings file (filings6.json).
  Q3 13F changes: the run's Q3-13F JSON, built from the run's filings pull.
  Form 4 sales: yfinance insider_transactions, open-market "Sale at price"
    rows in the 6-month window ending on --asof; price = Value / Shares,
    falling back to the price parsed from the Text. NVDA is the exception:
    the EDGAR-verified constants below (yfinance misses Kress's Sep 18
    sale — verified 2026-11-15 PST). --form4-extra adds sales the run
    file knows but yfinance lacks (AMD Denzel Nov 11, filed Nov 13).
  PTR trades the run found after filings6.json was built: --ptr-extra
    (Taylor GOOGL Nov 3 + AVGO Nov 5 buys, filed Nov 12, 2026).
  Trump OGE 278-T trades: --oge-json (per-run file, verified trade dates
    only, with the filing date and source per row; per-ticker notes carry
    the quarter totals whose dates are not verified).
  Levels: --levels args from the run's own options check + verdict cell.
    Two levels closer together than ~3.5% of the price range get their
    right-edge labels nudged apart (lines stay at their true prices);
    combine near-identical levels into one label where the caller can
    (e.g. "Call wall 400 USD, straddle top 398.85 USD" at the midpoint).

Rules: escape every $ as \\$ in any label holding two or more dollar
amounts, or matplotlib reads them as math mode. The box under the chart
uses USD, never $, for the same reason. For VOO/QQQ (indexes) there are
no insiders / congress / 13F — the chart is levels-only with a one-line
note, not an error. PTR triangles sit at the plotted ticker's own close
on the trade date (GOOG rows in the file carry GOOGL closes, ~1% higher).
"""
import argparse
import json
import re
import sys
import textwrap
from datetime import date

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import pandas as pd
import yfinance as yf

# Verified NVDA Form 4 open-market sales, May 27 – Sep 21, 2026
# (date, insider, shares, price, value_m). Total 1,378.2M USD, wavg ~221.10 USD.
# Corrected 2026-11-15 PST: added Kress Sep 18 sale (34,918 sh, $7.65M), omitted before.
# yfinance insider_transactions returns only 9 of these (it misses Kress),
# so NVDA always uses these EDGAR-verified constants, never the live pull.
FORM4_NVDA = [
    ("2026-05-27", "Dabiri", 625, 214.00, 0.13),
    ("2026-06-03", "Neal", 15500, 215.73, 3.34),
    ("2026-06-04", "Stevens", 1000000, 220.02, 221.10),
    ("2026-06-18", "Stevens", 885000, 210.07, 186.00),
    ("2026-08-31", "Teter", 30000, 217.69, 6.53),
    ("2026-09-02", "Stevens", 1848501, 223.16, 410.84),
    ("2026-09-04", "Stevens", 1022239, 230.85, 235.64),
    ("2026-09-18", "Stevens", 1366000, 220.07, 300.15),
    ("2026-09-18", "Kress", 34918, 219.05, 7.65),
    ("2026-09-21", "Teter", 30460, 222.97, 6.79),
]

INDEX_TICKERS = {"VOO", "QQQ"}


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


def last_name(member):
    """'Gilbert Ray Cisneros, Jr.' -> 'Cisneros'; 'Maria Elvira Salazar' -> 'Salazar'."""
    m = re.sub(r",\s*(Jr\.|Sr\.|II|III|IV)\s*$", "", member or "").strip()
    toks = [t for t in re.split(r"[\s-]+", m) if t]
    return toks[-1].title() if toks else m


def insider_short(name):
    """'WALKER JOHN KENT' -> 'Walker'; 'WILSON - THOMPSON KATHLEEN' -> 'Wilson'."""
    toks = [t for t in re.split(r"[\s-]+", (name or "").strip()) if t]
    return toks[0].title() if toks else name


def fmt_shares(sh):
    if sh >= 100000:
        return "%.2fM sh" % (sh / 1e6)
    return "%s sh" % format(int(sh), ",")


def quarter_end_before(d):
    """Latest quarter-end (Mar 31 / Jun 30 / Sep 30 / Dec 31) on or before d."""
    for m, day in ((12, 31), (9, 30), (6, 30), (3, 31)):
        q = date(d.year, m, day)
        if q <= d:
            return q
    return date(d.year - 1, 12, 31)


def parse_sale_price(text):
    m = re.search(r"Sale at price ([\d,]+\.\d+) - ([\d,]+\.\d+)", text or "")
    if m:
        return (float(m.group(1).replace(",", "")) + float(m.group(2).replace(",", ""))) / 2
    m = re.search(r"Sale at price ([\d,]+\.\d+)", text or "")
    return float(m.group(1).replace(",", "")) if m else None


def fetch_form4_yf(ticker, start, end):
    """Open-market Form 4 sales from yfinance, in [start, end]."""
    it = yf.Ticker(ticker).insider_transactions
    if it is None or len(it) == 0:
        raise RuntimeError("yfinance insider_transactions empty for %s" % ticker)
    rows = []
    for _, r in it.iterrows():
        txt = r["Text"] or ""
        if "Sale at price" not in txt:
            continue
        d = pd.to_datetime(r["Start Date"]).date()
        if not (start <= d <= end):
            continue
        sh = int(r["Shares"])
        val = r["Value"]
        if val == val and sh:  # Value present and not NaN
            price = float(val) / sh
            value_m = float(val) / 1e6
        else:
            price = parse_sale_price(txt)
            value_m = (sh * price / 1e6) if price else None
        if price is None or value_m is None:
            continue
        rows.append({"date": d.isoformat(), "insider": insider_short(r["Insider"]),
                     "shares": sh, "price": round(price, 2), "value_m": round(value_m, 2)})
    rows.sort(key=lambda x: (x["date"], x["insider"]))
    return rows


def load_json(path):
    if not path:
        return None
    with open(path) as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticker", required=True)
    ap.add_argument("--close", type=float, required=True)
    ap.add_argument("--close-date", required=True)
    ap.add_argument("--asof", default=None,
                    help="run date YYYY-MM-DD; the 6-month Form 4 window ends here")
    ap.add_argument("--levels", nargs="*", default=[])
    ap.add_argument("--filings",
                    default="/home/hatch/workspace/goals/investor-daily-stocks-report-and-dip-alert/hidden_files/filings6.json")
    ap.add_argument("--ptr-extra", default=None)
    ap.add_argument("--form4-extra", default=None)
    ap.add_argument("--q3-13f", default=None)
    ap.add_argument("--oge-note", default=None)
    ap.add_argument("--oge-json", default=None,
                    help="per-run OGE file: rows with verified trade dates "
                         "plus per-ticker notes for unverified totals")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    t = args.ticker
    asof = date.fromisoformat(args.asof) if args.asof else date.today()
    f4_start = (pd.Timestamp(asof) - pd.DateOffset(months=6)).date()

    df = yf.Ticker(t).history(period="12mo", interval="1d", auto_adjust=False)
    df = df[df["Close"].notna()]
    df["SMA50"] = df["Close"].rolling(50).mean()
    close_by_date = {d.strftime("%Y-%m-%d"): float(c) for d, c in zip(df.index, df["Close"])}

    F = json.load(open(args.filings))

    # ---- PTR congress trades in the plotted window ----
    ptr_rows = [r for r in F.get("ptr", [])
                if r.get("ticker") == t and not r.get("exclude_from_plot")]
    extra = load_json(args.ptr_extra)
    if extra:
        ptr_rows += [r for r in extra.get("rows", []) if r.get("ticker") == t]
    x0, x1 = df.index[0].tz_localize(None), df.index[-1].tz_localize(None)
    ptr_win = []
    for r in ptr_rows:
        d = r["trade_date"]
        if not (str(x0.date()) <= d <= str(x1.date())):
            continue
        close = close_by_date.get(d) or r.get("close_on_trade_date")
        if close is None:
            continue
        ptr_win.append((r, float(close)))
    ptr_buys = [p for p in ptr_win if p[0]["buy_sell"].lower() == "buy"]
    ptr_sells = [p for p in ptr_win if p[0]["buy_sell"].lower() == "sell"]

    # ---- Trump OGE 278-T trades: gold diamonds, verified dates only ----
    oge_rows = []
    oge_notes = ""
    oge_data = load_json(args.oge_json)
    if oge_data:
        oge_notes = (oge_data.get("notes", {}) or {}).get(t, "")
        for r in oge_data.get("rows", []):
            if r.get("ticker") != t:
                continue
            d = r["trade_date"]
            if not (str(x0.date()) <= d <= str(x1.date())):
                continue
            close = close_by_date.get(d)
            if close is None:
                continue
            oge_rows.append((r, float(close)))
    oge_buys = [p for p in oge_rows if p[0]["buy_sell"].lower() == "buy"]
    oge_sells = [p for p in oge_rows if p[0]["buy_sell"].lower() == "sell"]

    def avg_close(ps):
        return sum(c for _, c in ps) / len(ps) if ps else None

    # ---- Form 4 insider sales in the 6-month window ----
    f4 = []
    if t not in INDEX_TICKERS:
        if t == "NVDA":
            f4 = [{"date": d, "insider": n, "shares": s, "price": p, "value_m": v}
                  for d, n, s, p, v in FORM4_NVDA]
        else:
            f4 = fetch_form4_yf(t, f4_start, asof)
        extra4 = load_json(args.form4_extra)
        if extra4:
            seen = {(r["date"], r["insider"], r["shares"]) for r in f4}
            for r in extra4.get("rows", []):
                if r.get("ticker") != t:
                    continue
                key = (r["date"], r["insider"], r["shares"])
                if key not in seen:
                    f4.append({"date": r["date"], "insider": r["insider"],
                               "shares": r["shares"], "price": r["price"],
                               "value_m": r["value_m"]})
                    seen.add(key)
        f4 = [r for r in f4 if f4_start.isoformat() <= r["date"] <= asof.isoformat()]
        f4.sort(key=lambda x: (x["date"], x["insider"]))
    tot_m = sum(r["value_m"] for r in f4)
    tot_sh = sum(r["shares"] for r in f4)
    wavg = (sum(r["shares"] * r["price"] for r in f4) / tot_sh) if tot_sh else None
    f4_range = "%s – %s" % (f4[0]["date"][5:], f4[-1]["date"][5:]) if f4 else None

    # ---- 13F: Q2 top-5 from the filings file, Q3 text from the run JSON ----
    holders = F.get("holders13f", {}).get(t)
    top5 = sum(h["pct_out"] for h in holders) if holders else None
    top_fund = holders[0] if holders else None
    q3 = load_json(args.q3_13f)
    q3_text = (q3 or {}).get("tickers", {}).get(t)
    q_end = quarter_end_before(date.fromisoformat(
        df.index[-1].strftime("%Y-%m-%d")))
    q3_close = None
    for dstr in sorted(close_by_date, reverse=True):
        if dstr <= q_end.isoformat():
            q3_close = close_by_date[dstr]
            break

    # ---- Plot ----
    fig, ax = plt.subplots(figsize=(13, 7.2))
    ax.plot(df.index, df["Close"], color="#1f77b4", lw=2, label="Price")
    ax.plot(df.index, df["SMA50"], color="#ff7f0e", lw=1.6, label="50-day average")

    # Right-edge labels: levels + the Now line, nudged apart if too close.
    labels = []
    for spec in args.levels:
        price, color, label = spec.split(":", 2)
        price = float(price)
        ax.axhline(price, color=color, lw=1.1, ls="--", alpha=0.85)
        labels.append([price, color, label])
    ax.axhline(args.close, color="#1f77b4", lw=1.1, ls="--", alpha=0.85)
    labels.append([args.close, "#1f77b4",
                   "Now \\$%.2f (%s close)" % (args.close, args.close_date)])
    ymin, ymax = ax.get_ylim()
    min_gap = 0.035 * (ymax - ymin)
    labels.sort(key=lambda x: x[0])
    for i in range(1, len(labels)):
        if labels[i][0] - labels[i - 1][0] < min_gap:
            labels[i][0] = labels[i - 1][0] + min_gap
    for price, color, label in labels:
        ax.text(df.index[-1], price, "  " + label, va="center", ha="left",
                fontsize=9, color=color, fontweight="bold",
                bbox=dict(facecolor="white", edgecolor="none", alpha=0.7, pad=1))

    def flip(y):
        """True when a point sits near the top of the plot (annotate below it)."""
        return (y - ymin) / (ymax - ymin) > 0.88 if ymax > ymin else False

    def flop(y):
        """True when a point sits near the bottom (annotate above it)."""
        return (y - ymin) / (ymax - ymin) < 0.12 if ymax > ymin else False

    # Form 4 sales — red dots sized by value.
    if f4:
        for r in f4:
            ax.scatter([pd.Timestamp(r["date"])], [r["price"]],
                       s=max(25, 9 * np.sqrt(r["value_m"])), color="#de2d26",
                       alpha=0.85, edgecolors="white", linewidths=0.5, zorder=5)
        big = max(f4, key=lambda r: r["value_m"])
        d = pd.Timestamp(big["date"])
        mon = d.strftime("%b")
        # Text must not run off the left edge: a dot early in the window
        # gets its annotation to the right (ha=left), a later dot to the
        # left (ha=right). White box so the price line never shows through.
        early = (d - x0).days < 0.40 * (x1 - x0).days
        if flip(big["price"]):
            off = (8, -30) if early else (0, -30)
            ha, va = ("left" if early else "center"), "top"
        else:
            off = (8, 24) if early else (-8, 24)
            ha, va = ("left" if early else "right"), "bottom"
        ax.annotate("%s %s %d: %s at %.0f USD, %.0fM USD" % (
            big["insider"], mon, d.day, fmt_shares(big["shares"]),
            big["price"], big["value_m"]),
            xy=(d, big["price"]), xytext=off, textcoords="offset points",
            ha=ha, va=va, fontsize=9,
            bbox=dict(facecolor="white", edgecolor="none", alpha=0.7, pad=1),
            arrowprops=dict(arrowstyle="->", color="#de2d26", lw=0.8))

    # PTR congress trades.
    for r, close in ptr_win:
        d = pd.Timestamp(r["trade_date"])
        br = parse_bracket(r.get("amount_range", ""))
        mid = (br[0] + br[1]) / 2 if br else 8000
        size = max(18, 15 + 2.2 * np.sqrt(mid / 1000))
        if r["buy_sell"].lower() == "buy":
            ax.scatter([d], [close], s=size, marker="^", color="#7e57c2",
                       alpha=0.8, edgecolors="white", linewidths=0.5, zorder=4)
        else:
            ax.scatter([d], [close], s=size, marker="v", color="#ff8f00",
                       alpha=0.8, edgecolors="white", linewidths=0.5, zorder=4)
    def ann_text_y(close, off_y):
        """Height the annotation text sits at, in price units: a 26pt
        offset is ~6.3% of the price range, a 12pt offset ~2.9%."""
        if off_y > 0:
            return close + 0.029 * (ymax - ymin)
        return close - 0.063 * (ymax - ymin)

    def place_annotation(xy, text, color, off):
        """Place an annotation; flip it to extend left when its text
        would sit on a right-edge level label. Returns the text height."""
        y = ann_text_y(xy[1], off[1])
        ha = "left"
        if any(abs(y - lp) < min_gap for lp, _, _ in labels):
            ha, off = "right", (-off[0], off[1])
        ax.annotate(text, xy=xy, xytext=off, textcoords="offset points",
                    ha=ha, fontsize=9,
                    bbox=dict(facecolor="white", edgecolor="none", alpha=0.7, pad=1),
                    arrowprops=dict(arrowstyle="->", color=color, lw=0.8))
        return y

    ptr_latest_d, ptr_ann_y = None, None
    if ptr_win:
        latest = max(ptr_win, key=lambda p: p[0]["trade_date"])
        r, close = latest
        d = pd.Timestamp(r["trade_date"])
        off = (8, 12) if flop(close) else (8, -26)
        ptr_ann_y = place_annotation(
            (d, close),
            "Congress %s %s %s at %.0f USD" % (
                last_name(r["member"]), r["buy_sell"].lower(), r["trade_date"][5:], close),
            "#7e57c2", off)
        ptr_latest_d = d

    # Trump OGE 278-T trades — gold diamonds (sells get a dark-red edge).
    for r, close in oge_rows:
        d = pd.Timestamp(r["trade_date"])
        br = parse_bracket(r.get("amount_range", ""))
        mid = (br[0] + br[1]) / 2 if br else 8000
        size = min(200, max(18, 15 + 2.2 * np.sqrt(mid / 1000)))
        if r["buy_sell"].lower() == "buy":
            ax.scatter([d], [close], s=size, marker="D", color="#d4a017",
                       alpha=0.9, edgecolors="white", linewidths=0.6, zorder=6)
        else:
            ax.scatter([d], [close], s=size, marker="D", color="#d4a017",
                       alpha=0.9, edgecolors="#8b0000", linewidths=1.4, zorder=6)
    if oge_rows:
        latest = max(oge_rows, key=lambda p: p[0]["trade_date"])
        r, close = latest
        d = pd.Timestamp(r["trade_date"])
        off = (8, 12) if flop(close) else (8, -26)
        # Stagger: when the PTR annotation sits within a few weeks and
        # on the same height, put the OGE text on the other side of its
        # point so the two texts never pile up.
        if (ptr_ann_y is not None and ptr_latest_d is not None
                and abs((d - ptr_latest_d).days) <= 35
                and abs(ann_text_y(close, off[1]) - ptr_ann_y) < 2 * min_gap):
            off = (8, -off[1])
        place_annotation(
            (d, close),
            "Trump (OGE) %s %s at %.0f USD" % (
                r["buy_sell"].lower(), r["trade_date"][5:], close),
            "#d4a017", off)

    # 13F — diamond at the quarter-end date at the quarter-end close.
    # Indexes have no 13F: never plot the diamond for VOO/QQQ.
    plot_13f = bool(q3_close) and t not in INDEX_TICKERS
    if plot_13f:
        d = pd.Timestamp(q_end)
        ax.scatter([d], [q3_close], s=110, marker="D", color="#111111",
                   edgecolors="white", linewidths=0.5, zorder=5)
        if flip(q3_close):
            off, va = (0, -28), "top"
        else:
            off, va = (0, 12), "bottom"
        ax.annotate("Q3 13F %s" % q_end.strftime("%b %d"),
                    xy=(d, q3_close), xytext=off, textcoords="offset points",
                    ha="center", va=va, fontsize=9,
                    arrowprops=dict(arrowstyle="->", color="#111111", lw=0.8))

    # ---- Box under the chart: per-layer date range and average price ----
    def side_str(n, avg, one, many):
        # "1 buy (avg close 473 USD)" / "19 buys (avg close 196 USD)" /
        # "0 buys" — no average when there is nothing to average.
        if n == 0:
            return "0 %s" % many
        return "%d %s (avg close %.0f USD)" % (n, one if n == 1 else many, avg)

    b_avg, s_avg = avg_close(ptr_buys), avg_close(ptr_sells)
    o_avg, o_savg = avg_close(oge_buys), avg_close(oge_sells)
    if t in INDEX_TICKERS:
        box = ("%s is an index — no insiders, no congress trades, no 13F. "
               "Levels only." % t)
    else:
        if f4:
            l1 = ("Form 4 insiders (%s): %d sales, %.1fM USD, avg sale %.0f USD "
                  "(%+.0f%% vs now %.2f). No insider buys."
                  % (f4_range, len(f4), tot_m, wavg,
                     (wavg / args.close - 1) * 100, args.close))
        else:
            l1 = ("Form 4 insiders (%s – %s): no open-market sales in the "
                  "6-month window." % (f4_start.strftime("%m-%d"), asof.strftime("%m-%d")))
        if ptr_win:
            p_dates = sorted(p[0]["trade_date"] for p in ptr_win)
            p_range = "%s – %s" % (p_dates[0][5:], p_dates[-1][5:])
            l2 = ("Congress PTR (%s): %s / %s."
                  % (p_range,
                     side_str(len(ptr_buys), b_avg or 0, "buy", "buys"),
                     side_str(len(ptr_sells), s_avg or 0, "sell", "sells")))
        else:
            l2 = "Congress PTR in window: no trades."
        if oge_rows or oge_notes:
            if oge_rows:
                o_dates = sorted(p[0]["trade_date"] for p in oge_rows)
                o_filings = sorted({p[0]["filing"] + ", filed " + p[0]["filing_date"]
                                    for p in oge_rows})
                l_oge = ("Trump OGE (%s – %s; %s): %s / %s."
                         % (o_dates[0][5:], o_dates[-1][5:], "; ".join(o_filings),
                            side_str(len(oge_buys), o_avg or 0, "buy", "buys"),
                            side_str(len(oge_sells), o_savg or 0, "sell", "sells")))
            else:
                l_oge = ""
            if oge_notes:
                l_oge = (l_oge + " " + oge_notes).strip()
            if args.oge_note:
                l_oge = (l_oge + " " + args.oge_note).strip()
        else:
            l_oge = ""
        l3_parts = []
        if q3_close:
            l3_parts.append("13F Q3 (%s, close %.2f USD): %s."
                            % (q_end.strftime("%b %d"), q3_close,
                               q3_text or "no Q3 changes in this run's filings file"))
        if top5 is not None:
            l3_parts.append("Top-5 funds Q2 %.1f%% (%s %.1f%%)."
                            % (top5, top_fund["fund"].split(",")[0], top_fund["pct_out"]))
        else:
            l3_parts.append("Q2 top-5 not in this run's filings file.")
        l3_parts.append("Q3 is a position at %s, not a trade."
                        % q_end.strftime("%b %d"))
        lines = [l1, l2]
        if l_oge:
            lines.append(l_oge)
        lines.append(" ".join(l3_parts))
        box = "\n".join(lines)
    box = box.replace("$", "\\$")
    # Wrap each logical line so no box line runs off the right edge.
    wrapped = "\n".join(
        textwrap.fill(line, width=200, break_on_hyphens=False)
        for line in box.split("\n"))
    fig.text(0.01, 0.01, wrapped, fontsize=8, verticalalignment="bottom",
             bbox=dict(boxstyle="round,pad=0.4", facecolor="white", alpha=0.95,
                       edgecolor="none"))

    has_filings = bool(f4 or ptr_win or plot_13f or oge_rows)
    if has_filings:
        who = "Form 4 + Congress PTR + 13F"
        if oge_rows:
            who += " + Trump OGE"
        ax.set_title("%s — price, levels, and who traded (%s)" % (t, who),
                     fontsize=13, fontweight="bold")
    else:
        ax.set_title("%s — price, 50-day average, and the levels that matter"
                     % t, fontsize=13, fontweight="bold")
    ax.set_ylabel("Price, USD")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.grid(True, alpha=0.3)
    handles = [
        plt.Line2D([], [], color="#1f77b4", label="Price"),
        plt.Line2D([], [], color="#ff7f0e", label="50-day average"),
    ]
    if f4:
        handles.append(plt.Line2D([], [], marker="o", color="w",
                                   markerfacecolor="#de2d26", markersize=9,
                                   label="Insider sale (size = value)"))
    if ptr_win:
        handles.append(plt.Line2D([], [], marker="^", color="w",
                                   markerfacecolor="#7e57c2", markersize=9,
                                   label="Congress buy"))
        handles.append(plt.Line2D([], [], marker="v", color="w",
                                   markerfacecolor="#ff8f00", markersize=9,
                                   label="Congress sell"))
    if plot_13f:
        handles.append(plt.Line2D([], [], marker="D", color="w",
                                   markerfacecolor="#111111", markersize=8,
                                   label="13F quarter-end"))
    if oge_rows:
        handles.append(plt.Line2D([], [], marker="D", color="w",
                                   markerfacecolor="#d4a017", markersize=8,
                                   label="Trump (OGE)"))
    ax.legend(handles=handles, loc="upper left", fontsize=9, ncol=2)
    ax.set_xlim(df.index[0], df.index[-1] + pd.Timedelta(days=62))
    fig.tight_layout(rect=[0, 0.13, 1, 1])
    fig.savefig(args.out, dpi=150)
    print("saved", args.out)
    print("Form 4: %d sales %.1fM USD wavg %s"
          % (len(f4), tot_m, ("%.2f" % wavg) if wavg else "n/a"))
    print("PTR in window: %d buys avg %s / %d sells avg %s"
          % (len(ptr_buys), ("%.2f" % b_avg) if b_avg else "n/a",
             len(ptr_sells), ("%.2f" % s_avg) if s_avg else "n/a"))
    print("OGE: %d buys avg %s / %d sells avg %s"
          % (len(oge_buys), ("%.2f" % o_avg) if o_avg else "n/a",
             len(oge_sells), ("%.2f" % o_savg) if o_savg else "n/a"))
    print("13F Q3 close: %s (quarter-end %s); Q2 top5: %s"
          % (("%.2f" % q3_close) if q3_close else "n/a", q_end,
             ("%.2f%%" % top5) if top5 is not None else "n/a"))


if __name__ == "__main__":
    main()
