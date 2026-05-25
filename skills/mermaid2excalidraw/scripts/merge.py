#!/usr/bin/env python3
"""Merge Excalidraw elements from convert.mjs output into an existing .excalidraw file.

Usage:
  python3 merge.py base.excalidraw converted.json -o output.excalidraw

The converted.json must be the output of convert.mjs (contains { diagrams: [...] }).
Each diagram's elements are appended to the base file with valid fractional indices,
positioned below the existing content.
"""

import json
import sys
import math
import argparse

# Valid characters for fractional index components (printable ASCII 35–126, excl. ';')
# Excalidraw uses the fractional-indexing library which requires:
#   - keys of form: <integer_part><decimal_part>
#   - decimal part must NOT end in '0' (char code 48)
# Safe alphabet: !"#$%&'()*+,-./0-9:=?@A-Z[\]^_`a-z{|}~  minus ';'
_ALPHA = [chr(c) for c in range(35, 127) if chr(c) != ';']
_NON_ZERO_END = [c for c in _ALPHA if c != '0']  # last char cannot be '0'


def gen_indices(prefix: str, count: int) -> list[str]:
    """Generate `count` fractional indices that sort after `prefix`."""
    # Use format: <prefix_int>XX where XX = two chars, last char not '0'
    # Integer part length determined by first char of prefix (excalidraw convention)
    # Safest: use a fresh 2-char integer like "c0" (sorts after b-range keys like bDH)
    INT_PART = "c0"  # sorts after bXX (bDH etc.) and before d-range keys
    indices = []
    for i in range(count):
        # First char: position in _ALPHA (wraps every len(_NON_ZERO_END) items)
        a = _ALPHA[i // len(_NON_ZERO_END)]
        b = _NON_ZERO_END[i % len(_NON_ZERO_END)]
        indices.append(INT_PART + a + b)
    if len(indices) != len(set(indices)):
        raise ValueError("Index collision — too many elements for current scheme")
    return indices


def bounding_box(elements: list[dict]) -> dict:
    """Return the bounding box of all elements."""
    xs = [e.get('x', 0) for e in elements]
    ys = [e.get('y', 0) for e in elements]
    widths = [e.get('width', 0) for e in elements]
    heights = [e.get('height', 0) for e in elements]
    min_x = min(xs)
    min_y = min(ys)
    max_x = max(x + w for x, w in zip(xs, widths))
    max_y = max(y + h for y, h in zip(ys, heights))
    return {'minX': min_x, 'minY': min_y, 'maxX': max_x, 'maxY': max_y}


def translate_elements(elements: list[dict], dx: float, dy: float) -> list[dict]:
    """Shift all elements by (dx, dy)."""
    moved = []
    for e in elements:
        ne = dict(e)
        ne['x'] = e.get('x', 0) + dx
        ne['y'] = e.get('y', 0) + dy
        # Shift arrow points too
        if 'points' in ne and ne['points']:
            ne['points'] = [[p[0], p[1]] for p in ne['points']]
        moved.append(ne)
    return moved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base', help='Base .excalidraw file')
    parser.add_argument('converted', help='Output JSON from convert.mjs')
    parser.add_argument('-o', '--output', required=True, help='Output .excalidraw file')
    parser.add_argument('--gap', type=int, default=200, help='Gap below existing content (px)')
    args = parser.parse_args()

    with open(args.base) as f:
        base = json.load(f)
    with open(args.converted) as f:
        converted = json.load(f)

    base_elements = base['elements']
    diagrams = converted.get('diagrams', [])

    # Find bottom of existing content
    if base_elements:
        bb = bounding_box(base_elements)
        base_bottom = bb['maxY']
        base_left = bb['minX']
    else:
        base_bottom = 0
        base_left = 0

    new_elements = []
    cursor_x = base_left
    cursor_y = base_bottom + args.gap
    row_height = 0

    for diagram in diagrams:
        if not diagram.get('ok'):
            print(f"Skipping failed diagram '{diagram.get('name')}': {diagram.get('error')}", file=sys.stderr)
            continue

        elems = diagram['elements']
        if not elems:
            continue

        # Add title label above the diagram
        title = {
            "type": "text",
            "x": cursor_x,
            "y": cursor_y - 50,
            "width": 300,
            "height": 25,
            "angle": 0,
            "strokeColor": "#1e1e1e",
            "backgroundColor": "transparent",
            "fillStyle": "solid",
            "strokeWidth": 2,
            "strokeStyle": "solid",
            "roughness": 1,
            "opacity": 100,
            "groupIds": [],
            "frameId": None,
            "roundness": None,
            "seed": abs(hash(diagram['name'])) % (2**31),
            "version": 1,
            "versionNonce": abs(hash(diagram['name'] + 'nonce')) % (2**31),
            "isDeleted": False,
            "boundElements": None,
            "updated": 1,
            "link": None,
            "locked": False,
            "text": diagram['name'],
            "fontSize": 20,
            "fontFamily": 1,
            "textAlign": "left",
            "verticalAlign": "top",
            "containerId": None,
            "originalText": diagram['name'],
            "autoResize": True,
            "lineHeight": 1.25,
        }
        new_elements.append(title)

        # Position diagram elements
        diag_bb = bounding_box(elems)
        dx = cursor_x - diag_bb['minX']
        dy = cursor_y - diag_bb['minY']
        moved = translate_elements(elems, dx, dy)
        new_elements.extend(moved)

        diag_width = diag_bb['maxX'] - diag_bb['minX']
        diag_height = diag_bb['maxY'] - diag_bb['minY']

        cursor_x += diag_width + args.gap
        row_height = max(row_height, diag_height)

    if not new_elements:
        print("No elements to merge.", file=sys.stderr)
        sys.exit(1)

    # Assign valid fractional indices to all new elements
    indices = gen_indices("bDH", len(new_elements))
    for elem, idx in zip(new_elements, indices):
        elem['index'] = idx
        if 'id' not in elem or not elem['id']:
            import uuid
            elem['id'] = str(uuid.uuid4())[:8]

    # Merge files (images referenced by elements)
    merged_files = dict(base.get('files', {}))
    for diagram in diagrams:
        merged_files.update(diagram.get('files', {}))

    output = {
        **base,
        'elements': base_elements + new_elements,
        'files': merged_files,
    }

    with open(args.output, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"Merged {len(new_elements)} new elements into {len(base_elements)} base elements → {args.output}")
    print(f"Total elements: {len(output['elements'])}")


if __name__ == '__main__':
    main()
