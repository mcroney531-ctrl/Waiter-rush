#!/usr/bin/env python3
"""Food readability grid — the whole menu at the size it is played at.

    python3 tools/foodgrid.py

The spec asks every dish to be identifiable in silhouette, to separate from a
dark floor, and to carry similar visual weight to the other nine. None of that
is a matter of taste, so this measures it instead of eyeballing it.

Three strips are written, and they should be read in this order:

  foodgrid-colour.png  every dish in its ticket slot, on the floor it sits on
  foodgrid-value.png   the same in greyscale, which is where a plate that
                       separates only by hue falls apart
  foodgrid-shape.png   hard silhouettes, nothing but outline — the one that
                       decides whether a dish is distinguishable at all

Alongside them it prints the two numbers worth arguing about: how far each
dish's outer edge separates from the floor, and how much of its slot it fills.
Both have thresholds taken from shipped art rather than invented.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

# The ticket slot, straight out of index.html's TICKET.
SLOT_W, SLOT_H = 68, 62
# What the board actually is under the rail, sampled from assets/board.jpg.
FLOOR = (87, 63, 43)
CARRY_TWO = 0.6          # icons shrink to this when carrying two orders

ITEMS = ['pizza', 'sub', 'tacos', 'pasta', 'salad', 'club', 'soup', 'ribs',
         'tart', 'burger']

# Measured off the illustrated set, which is the art this replaces: their outer
# edge sits about 108 luminance steps off the floor. A bare 3D render on a dark
# plate managed 41 and visibly floated, so the bar sits between the two, high
# enough that an unaided dark plate cannot pass.
MIN_SEPARATION = 70
# The band the spec asks for. The slot's own aspect is 1.10, and a dish far
# from it is scaled down by whichever side runs out first, so it looks
# undersized beside the rest even though nothing is wrong with it alone.
ASPECT_MIN, ASPECT_MAX = 1.0, 1.3
MIN_FILL = 0.80          # fraction of the slot's area the dish should cover


def lum(rgb):
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


FLOOR_L = lum(FLOOR)


def at_slot_size(path):
    im = Image.open(path).convert('RGBA')
    s = min(SLOT_W / im.width, SLOT_H / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))),
                     Image.LANCZOS)


def edge_luminance(icon):
    """Mean luminance of the outer quarter of the shape — the part that has to
    win against the floor. Averaging the whole dish would let a bright bun hide
    a plate that vanishes."""
    a = np.asarray(icon, dtype=float)
    solid = a[..., 3] > 128
    if not solid.any():
        return 0.0
    ys, xs = np.nonzero(solid)
    r = np.hypot(ys - ys.mean(), xs - xs.mean())
    ring = np.zeros(solid.shape, bool)
    ring[ys, xs] = r > np.percentile(r, 75)
    L = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    return float(L[ring].mean())


def strip(icons, mode, title):
    pad, lab, hdr = 12, 16, 30
    cw = SLOT_W + pad
    W = pad + len(icons) * cw
    H = hdr + SLOT_H + lab + pad
    sheet = Image.new('RGB', (W, H), (26, 22, 18))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 9), title, fill=(224, 167, 46))

    for i, (name, icon) in enumerate(icons):
        x = pad + i * cw
        cell = Image.new('RGBA', (SLOT_W, SLOT_H), FLOOR + (255,))
        alpha = icon.getchannel('A')
        if mode == 'colour':
            art = icon
        elif mode == 'value':
            cell = Image.new('RGBA', (SLOT_W, SLOT_H), (round(FLOOR_L),) * 3 + (255,))
            from PIL import ImageOps
            art = ImageOps.grayscale(icon).convert('RGBA')
            art.putalpha(alpha)
        else:
            art = Image.new('RGBA', icon.size, (248, 244, 232, 255))
            art.putalpha(alpha.point(lambda v: 255 if v > 110 else 0))
        # bottom-aligned in the slot, exactly as the game draws it
        cell.alpha_composite(art, ((SLOT_W - icon.width) // 2, SLOT_H - icon.height))
        sheet.paste(cell.convert('RGB'), (x, hdr))
        d.text((x, hdr + SLOT_H + 3), name[:9], fill=(196, 190, 180))
    return sheet


def main(folder='assets/food'):
    icons, missing = [], []
    for n in ITEMS:
        p = os.path.join(folder, n + '.png')
        if not os.path.exists(p):
            missing.append(n)
            continue
        icons.append((n, at_slot_size(p)))

    if not icons:
        sys.exit(f'no icons found in {folder}')

    for mode, title in [('colour', 'COLOUR — every dish in its ticket slot, on the floor it sits on'),
                        ('value',  'VALUE — the same in greyscale; hue-only separation dies here'),
                        ('shape',  'SHAPE — silhouette only; can you still name each one?')]:
        out = f'foodgrid-{mode}.png'
        strip(icons, mode, title).save(out)
        print('wrote', out)

    print(f'\n{"dish":8} {"edge L":>7} {"vs floor":>9} {"aspect":>7} {"fill":>6}   notes')
    for name, icon in icons:
        edge = edge_luminance(icon)
        sep = abs(edge - FLOOR_L)
        aspect = icon.width / icon.height
        fill = (icon.width * icon.height) / (SLOT_W * SLOT_H)
        notes = []
        if sep < MIN_SEPARATION:
            notes.append(f'LOW CONTRAST (<{MIN_SEPARATION})')
        if fill < MIN_FILL:
            notes.append(f'SMALL ({icon.width}x{icon.height} of {SLOT_W}x{SLOT_H})')
        if not ASPECT_MIN <= aspect <= ASPECT_MAX:
            notes.append(f'ASPECT {aspect:.2f} outside {ASPECT_MIN}-{ASPECT_MAX}')
        print(f'{name:8} {edge:7.0f} {sep:9.0f} {aspect:7.2f} {fill:6.0%}   '
              + (', '.join(notes) if notes else 'ok'))

    print(f'\nfloor luminance {FLOOR_L:.0f}; carrying two shrinks every dish to '
          f'{CARRY_TWO:.0%}, so read the shape strip at arm\'s length too.')
    if missing:
        print('missing:', ', '.join(missing))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'assets/food')
