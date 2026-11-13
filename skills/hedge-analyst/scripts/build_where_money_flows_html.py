"""Where the Money Flows — Nvidia, four panels, as an HTML page.
One chart per the hedge-analyst skill: the flagship-holding explainer that
answers "where does the money go, and what does the price pay for?" in one
page. Panels: (1) hyperscaler capex -> AI chip revenue -> Nvidia's share;
(2) Nvidia's quarter in pieces (filed Q2 FY27); (3) the order book — why RPO
is only 3.2B; (4) what the price pays for — trailing and forward P/E.

Why HTML, not a PNG (Nov 13, 2026 — user rule: no images with a lot of
text): this explainer is mostly text. As a page the text stays crisp and
zoomable on a phone; as a PNG it is low quality and unreadable.

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
Usage: python3 build_where_money_flows_html.py [out.html]
Output: self-contained HTML page (no external assets).
"""
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/hatch/workspace/your_files/nvda-money-flows.html"

CSS = """
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
       color: #1a1a2e; background: #fff; margin: 0; padding: 0 16px 40px; }
.page { max-width: 880px; margin: 0 auto; }
h1 { text-align: center; font-size: 28px; margin: 28px 0 4px; color: #14213d; }
.sub { text-align: center; color: #5a5a5a; font-size: 13px; margin: 0 0 8px; }
h2 { font-size: 19px; color: #14213d; margin: 36px 0 14px; }
.bar-row { margin: 10px 0; }
.bar { display: flex; height: 44px; border-radius: 6px; overflow: hidden; }
.seg { display: flex; align-items: center; justify-content: center; color: #fff;
       font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden;
       padding: 0 8px; }
.seg.dark-text { color: #222; }
.note { color: #5a5a5a; font-size: 13px; margin: 8px 0 0; line-height: 1.5; }
.note b { color: #333; }
.side { color: #5a5a5a; font-size: 13px; margin: 10px 0 0; line-height: 1.5; }
.order-row { display: flex; align-items: center; gap: 12px; margin: 10px 0; }
.order-bar { height: 34px; border-radius: 4px; flex: none; }
.order-label { font-size: 14px; line-height: 1.4; }
.pe { display: flex; align-items: flex-end; gap: 14px; height: 220px;
      border-bottom: 2px solid #333; padding: 0 4px; position: relative; }
.pe-col { flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: flex-end; height: 100%; }
.pe-val { font-weight: 800; font-size: 17px; color: #14213d; margin-bottom: 6px; }
.pe-bar { width: 100%; max-width: 90px; border-radius: 4px 4px 0 0; }
.pe-x { font-size: 13px; text-align: center; margin-top: 8px; line-height: 1.35; color: #333; }
.avg-line { position: absolute; left: 0; right: 0; border-top: 2px dashed #c0392b; }
.avg-label { position: absolute; right: 0; color: #c0392b; font-size: 12px; }
.src { color: #5a5a5a; font-size: 12px; text-align: center; margin-top: 36px; line-height: 1.6; }
@media (max-width: 600px) {
  h1 { font-size: 22px; } h2 { font-size: 17px; }
  .seg { font-size: 12px; } .pe-val { font-size: 14px; }
}
"""

def seg(pct, color, label, dark=False):
    cls = "seg dark-text" if dark else "seg"
    return f'<div class="{cls}" style="width:{pct:.1f}%;background:{color}">{label}</div>'

def bar(segments):
    inner = "".join(seg(*s) for s in segments)
    return f'<div class="bar-row"><div class="bar">{inner}</div></div>'

HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NVIDIA — Where the Money Flows</title>
<style>{CSS}</style>
</head>
<body>
<div class="page">
<h1>NVIDIA — Where the Money Flows</h1>
<p class="sub">Q2 FY27 (quarter ended 26 Jul 2026) and Q3 2026, USD billions &nbsp;•&nbsp; Filed: 10-Q Q2 FY27, 10-K FY2026 &nbsp;•&nbsp; capex: earnings calls, via the AI Chip Cash Flows sheet</p>

<h2>1. From hyperscaler capex to Nvidia&rsquo;s Data Center revenue</h2>
{bar([(100, "#4a7fbf", "Hyperscaler capex&nbsp; 237.4B")])}
{bar([(52.1, "#76b900", "AI chip revenue&nbsp; 123.8B"), (47.9, "#d9d9d9", "Everything else&nbsp; 113.6B", True)])}
{bar([(37.5, "#5b8c00", "NVIDIA Data Center&nbsp; 89.0B"), (14.7, "#c0392b", "Others&nbsp; 34.8B")])}
<p class="note">72% of all AI chip revenue is Nvidia. Other chip cos: Broadcom, AMD, Intel, Marvell, Qualcomm. Only 52% of capex becomes chip revenue &mdash; the rest is memory, storage, power, networking and buildings.</p>
<p class="note">7 companies: Amazon 77.3B, Alphabet 51.4B, Microsoft 39.4B, Meta 33.9B, Oracle 28.5B, Tesla 4.7B, Apple 2.2B</p>
<p class="note">Everything else breaks down as: server DRAM ~45B &nbsp;•&nbsp; storage ~30B &nbsp;•&nbsp; power ~11B &nbsp;•&nbsp; networking ~10B &nbsp;•&nbsp; buildings ~9B &nbsp;•&nbsp; cooling ~6B</p>

<h2>2. Nvidia&rsquo;s quarter, in pieces &mdash; Q2 FY27, filed</h2>
{bar([(92.5, "#76b900", "Data Center&nbsp; 89.0B"), (7.5, "#a8d46b", "7.2B", True)])}
{bar([(54.7, "#5b8c00", "Hyperscale&nbsp; 48.7B"), (45.3, "#76b900", "ACIE&nbsp; 40.3B")])}
{bar([(75.1, "#76b900", "Gross profit&nbsp; 72.2B"), (24.9, "#d9d9d9", "Cost of goods&nbsp; 24.0B", True)])}
<p class="note">Total revenue 96.2B &nbsp;•&nbsp; Gross margin 75.0% &nbsp;•&nbsp; Hyperscale = the big cloud companies &nbsp;•&nbsp; ACIE = AI cloud, enterprise, sovereigns, neoclouds &nbsp;•&nbsp; Edge = gaming, pro viz, automotive</p>

<h2>3. The order book &mdash; why RPO is only 3.2B</h2>
<div class="bar-row"><div class="bar"><div class="seg" style="width:100%;background:#1f3864">Supply &amp; capacity commitments&nbsp; 279.0B &mdash; signed to secure memory</div></div></div>
<div class="order-row"><div class="order-bar" style="width:34.5%;background:#76b900"></div><div class="order-label"><b>Quarterly revenue, Q2 FY27&nbsp; 96.2B</b> &mdash; one quarter of sales</div></div>
<div class="order-row"><div class="order-bar" style="width:12.9%;background:#7b3fa0"></div><div class="order-label"><b>AI cloud buy-back commitments&nbsp; 36.0B</b> &mdash; 6 years, neoclouds</div></div>
<div class="order-row"><div class="order-bar" style="width:1.1%;min-width:8px;background:#e07b00"></div><div class="order-label"><b>RPO &mdash; contracts over 1 year&nbsp; 3.2B</b> &mdash; the only booked backlog</div></div>
<div class="order-row"><div class="order-bar" style="width:1.0%;min-width:8px;background:#e07b00"></div><div class="order-label"><b>Customer advances&nbsp; 2.8B</b> &mdash; was 0.16B in January</div></div>
<p class="note">Linear scale: the 3.2B and 2.8B bars are slivers on purpose &mdash; that is the point. RPO is small because Nvidia sells on purchase orders that convert to revenue in weeks; it is NOT the order book. The demand evidence is the 279B of supply commitments and 15.6B of advances in six months.</p>

<h2>4. What the price pays for &mdash; forward P/E at 173.73 (Nov 11 close)</h2>
<div class="pe">
  <div class="avg-line" style="bottom:165px"></div>
  <div class="avg-label" style="bottom:168px">10-yr average forward P/E ~30x</div>
  <div class="pe-col"><div class="pe-val">35.2x</div><div class="pe-bar" style="height:154px;background:#9aa0a6"></div><div class="pe-x">Trailing<br>EPS 4.93</div></div>
  <div class="pe-col"><div class="pe-val">18.7x</div><div class="pe-bar" style="height:82px;background:#5b8c00"></div><div class="pe-x">FY27<br>EPS 9.31</div></div>
  <div class="pe-col"><div class="pe-val">10.9x</div><div class="pe-bar" style="height:48px;background:#76b900"></div><div class="pe-x">FY28<br>EPS 15.91</div></div>
  <div class="pe-col"><div class="pe-val">8.1x</div><div class="pe-bar" style="height:36px;background:#8fbf3f"></div><div class="pe-x">FY29<br>EPS 21.34</div></div>
  <div class="pe-col"><div class="pe-val">6.7x</div><div class="pe-bar" style="height:29px;background:#a8d46b"></div><div class="pe-x">FY30<br>EPS 25.98</div></div>
</div>
<p class="note">Consensus EPS: S&amp;P Global via Motley Fool, Oct 19, 2026. P/E is arithmetic &mdash; price divided by consensus EPS; whether Nvidia earns it is not public. At 173.73 the stock is 18.7x next year&rsquo;s earnings and 10.9x the year after &mdash; cheap against its own 10-year average, but only if the earnings arrive.</p>

<p class="src">Sources: 10-Q Q2 FY27 and 10-K FY2026 (SEC EDGAR / Nvidia IR) &nbsp;•&nbsp; Q2 FY27 earnings call<br>
Full numbers, proof links and quarterly tables: &ldquo;NVDA &mdash; Real Contracts &amp; Forward P/E&rdquo; sheet.</p>
</div>
</body>
</html>
"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(HTML)
print("saved", OUT)
