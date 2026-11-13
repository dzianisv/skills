#!/usr/bin/env python3
"""Dependency web — who borrows, who buys. One chart per company, one script.
Tool: matplotlib (Python). One chart, one script — see SKILL.md "Scripts".
The analyst draws this for EVERY company it covers (not just Nvidia): the company
in the center, money OUT (orange: investments, equity checks, guarantees, backstops,
leases) and money IN (green: customers buying its products), with filed amounts and
dates. If a company has no material flows, say so explicitly — never skip it silently.
Reads the flows JSON (argv 1; if omitted, the embedded NVDA default is used):
  {"company": "NVDA", "nodes": [{"id", "label", "logo" (file in logos/ or null),
   "x", "y", "badge": bool}], "flows": [{"from", "to", "amount_b", "kind":
   "out"|"in"|"both", "label"}], "notes": [...]}
Writes the PNG preview (argv 2, default ~/workspace/your_files/nvda-dependency-web.png).
Arrow widths are LINEAR in the amount (Nov 12, 2026 — user: sqrt widths made
Google 27B vs Meta 18B look identical): width = 12 * amount_b / 105, floor 1.5pt,
cap 12pt. Logos: ~/workspace/your_files/logos/ (Wikimedia Commons); SB Energy and
Neoclouds have no logos — text badges.
NVDA default data (filed): 10-Q Q2 FY27, 8-K Aug 17 2026, company announcements.
OpenAI ~400B in is an ESTIMATE (capped at 12pt). Neoclouds 59.5B includes CoreWeave
6.3B — do NOT add. Chip share 52% = Q3 2026 sellers/buyers ratio.
No dollar signs in matplotlib text (mathtext mangles $) — use USD wording."""
import json, os, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.offsetbox import OffsetImage, AnnotationBbox
from matplotlib.patches import FancyBboxPatch
import matplotlib.image as mpimg

LOGO_DIR = '/home/hatch/workspace/your_files/logos'

NVDA_DEFAULT = {
    "company": "NVDA",
    "title": "Who Borrows, Who Buys — Nvidia's Dependency Web (linear widths)",
    "nodes": [
        {"id": "NVDA", "label": "Nvidia", "logo": "nvidia.png", "x": 0.50, "y": 0.52},
        {"id": "OpenAI", "label": "OpenAI", "logo": "openai.png", "x": 0.10, "y": 0.88},
        {"id": "CoreWeave", "label": "CoreWeave", "logo": "coreweave.png", "x": 0.10, "y": 0.64},
        {"id": "Neoclouds", "label": "Neoclouds", "logo": None, "x": 0.10, "y": 0.40},
        {"id": "SB Energy", "label": "SB Energy", "logo": None, "x": 0.10, "y": 0.14},
        {"id": "Oracle", "label": "Oracle", "logo": "oracle.png", "x": 0.90, "y": 0.88},
        {"id": "Amazon", "label": "Amazon", "logo": "amazon.png", "x": 0.90, "y": 0.68},
        {"id": "Google", "label": "Google", "logo": "google.png", "x": 0.90, "y": 0.50},
        {"id": "Microsoft", "label": "Microsoft", "logo": "microsoft.png", "x": 0.90, "y": 0.32},
        {"id": "Meta", "label": "Meta", "logo": "meta.png", "x": 0.90, "y": 0.14},
        {"id": "TSMC", "label": "TSMC", "logo": "tsmc.png", "x": 0.50, "y": 0.06},
    ],
    "flows": [
        {"from": "NVDA", "to": "OpenAI", "amount_b": 30, "kind": "out", "label": "30B out · Feb 27, 2026", "rad": 0.15, "label_t": 0.30, "label_dy": -0.08},
        {"from": "OpenAI", "to": "NVDA", "amount_b": 400, "kind": "in", "label": "~400B in · EST, capped", "rad": -0.15, "label_t": 0.5, "label_dy": 0.12},
        {"from": "NVDA", "to": "CoreWeave", "amount_b": 6.3, "kind": "out", "label": "6.3B · Sep 9, 2025"},
        {"from": "NVDA", "to": "Neoclouds", "amount_b": 59.5, "kind": "out", "label": "59.5B · 10-Q Aug 26, 2026"},
        {"from": "NVDA", "to": "SB Energy", "amount_b": 105, "kind": "out", "label": "105B · Aug 17, 2026 (guarantees)"},
        {"from": "Oracle", "to": "NVDA", "amount_b": 40, "kind": "in", "label": "~40B in"},
        {"from": "Amazon", "to": "NVDA", "amount_b": 40, "kind": "in", "label": "~40B in"},
        {"from": "Google", "to": "NVDA", "amount_b": 27, "kind": "in", "label": "~27B in"},
        {"from": "Microsoft", "to": "NVDA", "amount_b": 20, "kind": "in", "label": "~20B in"},
        {"from": "Meta", "to": "NVDA", "amount_b": 18, "kind": "in", "label": "~18B in"},
        {"from": "NVDA", "to": "TSMC", "amount_b": 31.8, "kind": "both", "label": "31.8B both ways"},
    ],
    "notes": ["Orange = Nvidia gives money / guarantees. Green = buys Nvidia chips. Grey = both ways.",
              "Chip share 52% = Q3 2026 sellers / buyers ratio. OpenAI ~400B in is an estimate.",
              "Neoclouds 59.5B includes CoreWeave 6.3B — do not add.",
              "Sources: 10-Q Q2 FY27, 8-K Aug 17 2026, company announcements."],
}

def width_for(amount_b):
    return max(1.5, min(12.0, 12.0 * amount_b / 105.0))

def main():
    data = NVDA_DEFAULT
    if len(sys.argv) > 1 and sys.argv[1].endswith('.json'):
        data = json.load(open(sys.argv[1]))
    out_path = sys.argv[2] if len(sys.argv) > 2 else '/home/hatch/workspace/your_files/nvda-dependency-web.png'
    pos = {n['id']: (n['x'], n['y']) for n in data['nodes']}
    fig, ax = plt.subplots(figsize=(16, 10))
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    ax.set_title(data['title'], fontsize=16, fontweight='bold', pad=12)
    COLORS = {'out': '#e67e22', 'in': '#2ca25f', 'both': '#888888'}
    for f in data['flows']:
        x0, y0 = pos[f['from']]; x1, y1 = pos[f['to']]
        color = COLORS[f['kind']]
        style = '<->' if f['kind'] == 'both' else '-|>'
        rad = f.get('rad', 0)
        ax.annotate('', xy=(x1, y1), xytext=(x0, y0),
                    arrowprops=dict(arrowstyle=style, color=color, lw=width_for(f['amount_b']),
                                    shrinkA=60, shrinkB=60,
                                    connectionstyle=f'arc3,rad={rad}'))
        # label position: along the chord (t=0.5, or 0.30/0.70 for the curved OpenAI pair
        # so the two labels never sit on each other), offset off the line
        t = f.get('label_t', 0.5)
        mx, my = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        dy = f.get('label_dy', 0.04 if f['kind'] == 'out' else -0.05)
        if rad:
            dy += 0.035 if rad > 0 else -0.035
        ax.text(mx, my + dy, f['label'], ha='center', va='center', fontsize=9,
                bbox=dict(boxstyle='round,pad=0.25', facecolor='white', alpha=0.85, edgecolor='none'))
    for n in data['nodes']:
        x, y = n['x'], n['y']
        if n.get('logo'):
            path = os.path.join(LOGO_DIR, n['logo'])
            if os.path.exists(path):
                img = mpimg.imread(path)
                # render every logo at the same physical width (~170px, center ~260px),
                # whatever the file's pixel size is
                target = 260 if n['id'] == data['nodes'][0]['id'] else 170
                zoom = target / img.shape[1]
                ab = AnnotationBbox(OffsetImage(img, zoom=zoom), (x, y), frameon=False)
                ax.add_artist(ab)
            else:
                ax.add_patch(FancyBboxPatch((x - 0.055, y - 0.03), 0.11, 0.06,
                             boxstyle='round,pad=0.01', facecolor='#eeeeee', edgecolor='#999999'))
        else:
            # no logo exists — text badge with the name inside it
            ax.add_patch(FancyBboxPatch((x - 0.055, y - 0.03), 0.11, 0.06,
                         boxstyle='round,pad=0.01', facecolor='#eeeeee', edgecolor='#999999'))
            ax.text(x, y, n['label'], ha='center', va='center', fontsize=10, fontweight='bold')
            continue
        ax.text(x, y - 0.055, n['label'], ha='center', va='top', fontsize=11, fontweight='bold')
    fig.text(0.5, 0.01, '\n'.join(data['notes']), ha='center', fontsize=9, color='#666666')
    fig.tight_layout(rect=[0, 0.05, 1, 0.96])
    fig.savefig(out_path, dpi=150)
    print('wrote', out_path)

if __name__ == '__main__':
    main()
