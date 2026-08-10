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
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD = os.path.join(ROOT, 'assets', 'board.jpg')
BOARD_3D = os.path.join(ROOT, 'assets', 'board-3d.jpg')
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


def read_anchors(src, board):
    """Pull the live Layout constants out of index.html, in art pixels.

    index.html now carries two geometries behind a `?board=3d` flag -- the
    painted board's, measured off the painting, and the rendered room's, built
    from the spec. They live in one GEO ternary, so this picks the branch rather
    than the old single set of constants. `board` is 'painted' or '3d'.
    """
    m = re.search(r'const GEO = USE_3D(.*?);\n', src, re.S)
    if not m:
        die('the GEO block')
    body = re.sub(r'//[^\n]*', '', m.group(1))
    # Match the two object literals rather than splitting on the ternary's
    # punctuation. Splitting on the last ':' finds the one inside `padAtX:
    # false`, and splitting on the first '}' finds the one closing `r1: {...}`
    # -- both give a branch that parses and is wrong. padAtX is the branch's own
    # label for itself, so it is what selects.
    #
    # `[^{}]*` after it, not `\s*`, because padAtX is not necessarily the last
    # key. It was when this was written; adding ticketBase after it broke this
    # parser, which is the third time the GEO literal has grown a key and the
    # second time it took a tool with it. Anything that is not a nested object
    # may now follow, and the run still dies loudly if the shape changes in a
    # way this cannot read.
    blocks = re.findall(r'\{\s*floorTop:.*?padAtX:\s*(?:true|false)[^{}]*\}', body, re.S)
    if len(blocks) != 2:
        die(f'the two GEO branches (found {len(blocks)})')
    want = 'padAtX: true' if board == '3d' else 'padAtX: false'
    branch = next((b for b in blocks if want in b), None)
    if branch is None:
        die(f'the {board} GEO branch')

    def num(key, where=branch):
        mm = re.search(rf'{key}:\s*([\d.]+)', where)
        if not mm:
            die(f'GEO.{key} for the {board} board')
        return float(mm.group(1))

    def row(name):
        mm = re.search(rf'{name}:\s*\{{([^}}]*)\}}', branch)
        if not mm:
            die(f'GEO.{name} for the {board} board')
        return {k: num(k, mm.group(1)) for k in ('y', 'padY', 'barY')}

    tables_src = re.search(r'const tableDefs\s*=\s*\[(.*?)\];', src, re.S)
    if not tables_src:
        die('tableDefs')
    entries = re.findall(r'T\(([\d.]+),\s*([\d.]+)\)[^{}]*\.\.\.(R1|R2)', tables_src.group(1))
    if len(entries) != 8:
        die(f'tableDefs (found {len(entries)} entries, expected 8)')
    pad_at_x = 'padAtX: true' in branch
    row1_x = [float(x) if pad_at_x else float(px) for x, px, r in entries if r == 'R1']
    row2_x = [float(x) if pad_at_x else float(px) for x, px, r in entries if r == 'R2']

    pass_x = [float(x) for x in
              re.findall(r'x:\s*A\(([\d.]+)\)',
                         re.search(r'const PASSES\s*=\s*\[(.*?)\];', src, re.S).group(1))]
    bus_x = [float(x) for x in
             re.findall(r'x:\s*A\(([\d.]+)\)',
                        re.search(r'const BUS_STATIONS\s*=\s*\[(.*?)\];', src, re.S).group(1))]

    return dict(floor_top=num('floorTop'), r1=row('r1'), r2=row('r2'),
                row1_x=row1_x, row2_x=row2_x,
                pass_x=pass_x, pass_y=num('passY'),
                bus_x=bus_x, bus_y=num('busY'))


def main():
    board = '3d' if '--3d' in sys.argv else 'painted'
    anchors = read_anchors(open(SRC).read(), board)
    print(f'auditing the {board} board\n')
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

    im = Image.open(BOARD_3D if board == '3d' else BOARD).convert('RGB')
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

    # Inside or outside the band, not distance from its top edge. The old metric
    # reported the 3D board's back row as "52px low" when 632 sits squarely
    # inside 580-700 -- it was measuring against `lo` and calling every value
    # that was not flush with the band's start an error.
    print(f'{"band":18} {"spec":11} {"actual":<9} verdict')
    worst = 0
    for label, lo, hi, actual in COMPARE:
        if lo <= actual <= hi:
            verdict = f'inside ({actual - lo:.0f}px in)'
        else:
            off = lo - actual if actual < lo else actual - hi
            worst = max(worst, off)
            verdict = f'OUTSIDE by {off:.0f}px {"high" if actual < lo else "low"}'
        print(f'{label:18} {f"{lo}-{hi}":11} {actual:<9g} {verdict}')

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
    print(f'\n{"every row is inside its band" if worst == 0 else f"worst band miss: {worst:g}px"}')
    print(f'wrote {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
