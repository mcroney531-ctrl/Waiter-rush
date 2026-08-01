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
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD = os.path.join(ROOT, 'assets', 'board.jpg')
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

# index.html's Layout block, in art pixels (i.e. before ART_SCALE).
ANCHORS = [
    (300, 'FLOOR_TOP'), (357, 'PASSES y'), (398, 'R1 barY'), (465, 'R1 plate y'),
    (590, 'R1 padY'), (612, 'R2 barY'), (700, 'R2 plate y'), (760, 'BUS y'),
    (855, 'R2 padY'),
]
PASS_X, BUS_X = (370, 1180), (115, 1425)
ROW1_X = (406, 652, 902.5, 1154)
ROW2_X = (374, 638, 906.5, 1173.5)

# What the spec's band means for each anchor the game reads.
COMPARE = [
    ('back row centre', 580, 700, 465),
    ('back drop pads', 700, 780, 590),
    ('front row centre', 780, 900, 700),
    ('front drop pads', 900, 990, 855),
]


def main():
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
        d.text((566, y - 16), f'{name}  y={y}', fill=(255, 170, 140))
    for x in PASS_X:
        d.ellipse([x - 9, 357 - 9, x + 9, 357 + 9], outline=(255, 120, 90, 255), width=3)
    for x in BUS_X:
        d.ellipse([x - 9, 760 - 9, x + 9, 760 + 9], outline=(255, 120, 90, 255), width=3)
    for xs, y in ((ROW1_X, 465), (ROW2_X, 700)):
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
        print(f'{label:18} {f"{lo}-{hi}":11} {painted:<9} {abs(off)}px {where}'.rstrip())

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
    print(f'\nworst band offset: {worst}px\nwrote {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
