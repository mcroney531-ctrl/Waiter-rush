#!/usr/bin/env python3
"""Measure the shipped board against the spec's bands.

    python3 tools/board_audit.py

DINING-ROOM-SPEC.md lays the room out as horizontal bands of a 1536x1024
canvas, and index.html reads a set of anchors off whatever was painted. Those
two are supposed to describe the same room. This draws both onto the board so
the difference is a picture rather than an argument, and prints the arithmetic.

Written when the board turned out to be missing the spec's loudest requirement
-- the empty pickup floor between the counter and the back row -- which is
invisible until you put the bands on top of it.

The anchors used to be copied here by hand and drifted from index.html more
than once -- the audit would keep reporting the previous board's geometry
after the art changed. They are now read out of index.html itself, so a
constant that moves in the game moves here on the next run rather than on the
next person who remembers to update both places.
"""
import os
import re

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD = os.path.join(ROOT, 'assets', 'board.jpg')
SRC = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, 'art-source', 'shots', 'board-audit.png')

# DINING-ROOM-SPEC.md, "Layout, top to bottom".
SPEC = [
    (0, 100, 'HUD overlay'),
    (100, 430, 'counter / pass'),
    (430, 580, 'PICKUP FLOOR - must be empty'),
    (580, 700, 'back row'),
    (700, 780, 'back pads'),
    (780, 900, 'front row'),
    (900, 990, 'front pads'),
    (990, 1024, 'margin'),
]


def die(what):
    raise SystemExit(
        f"board_audit.py: could not find {what} in index.html -- the layout "
        f"constants moved (or were renamed) and this parser needs updating too."
    )


def read_anchors(src):
    """Pull the live Layout constants out of index.html, in art pixels."""

    def one(pattern, name):
        m = re.search(pattern, src)
        if not m:
            die(name)
        return float(m.group(1))

    def block(pattern, name):
        m = re.search(pattern, src, re.S)
        if not m:
            die(name)
        return m.group(1)

    floor_top = one(r'const FLOOR_TOP\s*=\s*A\(([\d.]+)\)', 'FLOOR_TOP')

    r1_src = block(r'const R1\s*=\s*\{(.*?)\};', 'R1')
    r2_src = block(r'const R2\s*=\s*\{(.*?)\};', 'R2')

    def row(row_src, row_name):
        out = {}
        for k in ('y', 'padY', 'barY'):
            m = re.search(rf'{k}:\s*A\(([\d.]+)\)', row_src)
            if not m:
                die(f'{row_name}.{k}')
            out[k] = float(m.group(1))
        return out

    r1 = row(r1_src, 'R1')
    r2 = row(r2_src, 'R2')

    tables_src = block(r'const tableDefs\s*=\s*\[(.*?)\];', 'tableDefs')
    entries = re.findall(r'\{x:\s*A\(([\d.]+)\)[^{}]*\.\.\.(R1|R2)\}', tables_src)
    if len(entries) != 8:
        die(f'tableDefs (found {len(entries)} table entries, expected 8)')
    row1_x = [float(x) for x, row in entries if row == 'R1']
    row2_x = [float(x) for x, row in entries if row == 'R2']

    passes_src = block(r'const PASSES\s*=\s*\[(.*?)\];', 'PASSES')
    pass_x = [float(x) for x in re.findall(r'x:\s*A\(([\d.]+)\)', passes_src)]
    pass_ys = set(float(y) for y in re.findall(r'y:\s*A\(([\d.]+)\)', passes_src))
    if len(pass_x) != 2:
        die(f'PASSES (found {len(pass_x)} entries, expected 2)')
    if len(pass_ys) != 1:
        die(f'PASSES.y (the two pads disagree: {sorted(pass_ys)} -- this script assumes '
            f'one shared y)')
    pass_y = pass_ys.pop()

    bus_src = block(r'const BUS_STATIONS\s*=\s*\[(.*?)\];', 'BUS_STATIONS')
    bus_x = [float(x) for x in re.findall(r'x:\s*A\(([\d.]+)\)', bus_src)]
    bus_ys = set(float(y) for y in re.findall(r'y:\s*A\(([\d.]+)\)', bus_src))
    if len(bus_x) != 2:
        die(f'BUS_STATIONS (found {len(bus_x)} entries, expected 2)')
    if len(bus_ys) != 1:
        die(f'BUS_STATIONS.y (the two stations disagree: {sorted(bus_ys)} -- this script '
            f'assumes one shared y)')
    bus_y = bus_ys.pop()

    return dict(floor_top=floor_top, r1=r1, r2=r2, row1_x=row1_x, row2_x=row2_x,
                pass_x=pass_x, pass_y=pass_y, bus_x=bus_x, bus_y=bus_y)


def main():
    anchors = read_anchors(open(SRC).read())
    r1, r2 = anchors['r1'], anchors['r2']

    ANCHORS = [
        (anchors['floor_top'], 'FLOOR_TOP'), (anchors['pass_y'], 'PASSES y'),
        (r1['barY'], 'R1 barY'), (r1['y'], 'R1 plate y'), (r1['padY'], 'R1 padY'),
        (r2['barY'], 'R2 barY'), (r2['y'], 'R2 plate y'), (anchors['bus_y'], 'BUS y'),
        (r2['padY'], 'R2 padY'),
    ]
    COMPARE = [
        ('back row centre', 580, 700, r1['y']),
        ('back drop pads', 700, 780, r1['padY']),
        ('front row centre', 780, 900, r2['y']),
        ('front drop pads', 900, 990, r2['padY']),
    ]

    im = Image.open(BOARD).convert('RGB')
    W, H = im.size
    if (W, H) != (1536, 1024):
        print(f'note: board is {W}x{H}, spec bands assume 1536x1024')
    d = ImageDraw.Draw(im, 'RGBA')

    # Spec bands down the left third, so the painting stays readable on the right.
    for i, (y0, y1, name) in enumerate(SPEC):
        hot = name.startswith('PICKUP')
        fill = (60, 200, 255, 58) if hot else ((255, 255, 255, 26) if i % 2 else (0, 0, 0, 26))
        d.rectangle([0, y0, 520, y1], fill=fill)
        d.line([0, y0, 520, y0], fill=(120, 220, 255, 200), width=2)
        d.text((8, y0 + 4), f'{y0}-{y1}  {name}', fill=(180, 240, 255))

    for y, name in ANCHORS:
        d.line([560, y, W, y], fill=(255, 120, 90, 220), width=2)
        d.text((566, y - 16), f'{name}  y={y:g}', fill=(255, 170, 140))
    for x in anchors['pass_x']:
        d.ellipse([x - 9, anchors['pass_y'] - 9, x + 9, anchors['pass_y'] + 9],
                   outline=(255, 120, 90, 255), width=3)
    for x in anchors['bus_x']:
        d.ellipse([x - 9, anchors['bus_y'] - 9, x + 9, anchors['bus_y'] + 9],
                   outline=(255, 120, 90, 255), width=3)
    for xs, y in ((anchors['row1_x'], r1['y']), (anchors['row2_x'], r2['y'])):
        for x in xs:
            d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=(120, 255, 150, 255), width=3)

    d.text((8, 8), 'LEFT: spec bands   RIGHT: what the game reads off this painting',
           fill=(255, 255, 255))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    im.save(OUT)

    print(f'{"band":18} {"spec":11} {"painted":<9} out by')
    worst = 0
    for label, lo, hi, painted in COMPARE:
        off = lo - painted
        worst = max(worst, abs(off))
        where = 'high' if off > 0 else ('low' if off < 0 else '')
        print(f'{label:18} {f"{lo}-{hi}":11} {painted:<9g} {abs(off):g}px {where}'.rstrip())

    # The one that is not a matter of degree: is the pickup floor clear?
    p0, p1 = next((a, b) for a, b, n in SPEC if n.startswith('PICKUP'))
    # Furniture only. barY is a meter position and FLOOR_TOP is a walk limit;
    # neither is a thing painted into the band.
    intruders = [n for y, n in ANCHORS
                 if p0 <= y <= p1 and ('plate' in n or 'padY' in n)]
    print()
    if intruders:
        verb = 'sits' if len(intruders) == 1 else 'sit'
        print(f'PICKUP FLOOR ({p0}-{p1}) is not clear: {", ".join(intruders)} {verb} inside it.')
        print('That band is the spec\'s loudest requirement -- everything awkward about')
        print('standing at the counter follows from it being occupied.')
    else:
        print(f'pickup floor ({p0}-{p1}) is clear')
    print(f'\nworst band offset: {worst:g}px\nwrote {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
