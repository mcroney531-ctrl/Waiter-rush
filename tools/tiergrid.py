#!/usr/bin/env python3
"""Roster readability grid — characters down, tiers across.

The acceptance test in the spec says a player must identify species, tier and
character at 96px, from silhouette, in under a second. This renders the whole
roster that way so the claim can be checked rather than hoped for.

Three grids are written:

  tiergrid-colour.png  — each design at 96px on the floor colour it stands on
  tiergrid-value.png   — the same in greyscale on the floor's grey value
  tiergrid-shape.png   — hard silhouettes, nothing but outline

Read them in that order. Colour flatters everything; the value grid catches a
character that separates only by hue; the silhouette grid is the one that says
whether a tier is genuinely distinguishable from the tier below it.

    python3 tools/tiergrid.py art-source/refs
"""
import sys, os, glob
from collections import defaultdict, deque
from PIL import Image, ImageDraw, ImageOps

GAME_H = 96                       # how tall the player renders on a 960px board
FLOOR = (74, 62, 52)              # the dark stone of the Dine-O Dash board
FLOOR_GREY = int(0.299*FLOOR[0] + 0.587*FLOOR[1] + 0.114*FLOOR[2])
TIERS = [1, 2, 3, 4]


def keyed(im):
    """Best-effort cutout. Production art with alpha is used as-is; flat-backed
    JPEGs are flood-filled from the border, which is safe on the plain grey
    backgrounds the spec asks for and would eat a character on a busy one."""
    im = im.convert('RGBA')
    if im.getchannel('A').getextrema()[0] < 250:
        return im
    px, (w, h) = im.load(), im.size
    ref = px[0, 0][:3]
    tol, seen, q = 46, [[False]*w for _ in range(h)], deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h-1))
    for y in range(h):
        q.append((0, y)); q.append((w-1, y))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[y][x]:
            continue
        c = px[x, y]
        if max(abs(c[0]-ref[0]), abs(c[1]-ref[1]), abs(c[2]-ref[2])) > tol:
            continue
        seen[y][x] = True
        px[x, y] = (c[0], c[1], c[2], 0)
        q.extend(((x+1, y), (x-1, y), (x, y+1), (x, y-1)))
    return im


def cell(path):
    im = keyed(Image.open(path))
    im = im.crop(im.getbbox() or (0, 0, im.width, im.height))
    w = max(1, int(im.width * GAME_H / im.height))
    small = im.resize((w, GAME_H), Image.LANCZOS)

    colour = Image.new('RGBA', small.size, FLOOR + (255,))
    colour.alpha_composite(small)

    grey = Image.new('RGBA', small.size, (FLOOR_GREY,)*3 + (255,))
    g = ImageOps.grayscale(small).convert('RGBA')
    g.putalpha(small.getchannel('A'))
    grey.alpha_composite(g)

    shape = Image.new('RGBA', small.size, FLOOR + (255,))
    shape.paste((248, 244, 232, 255), (0, 0),
                small.getchannel('A').point(lambda v: 255 if v > 110 else 0))
    return colour, grey, shape


def main(folder):
    by_char = defaultdict(dict)
    for path in glob.glob(os.path.join(folder, '*')):
        name = os.path.splitext(os.path.basename(path))[0]
        if '-t' not in name:
            continue
        char, tier = name.rsplit('-t', 1)
        if tier.isdigit():
            by_char[char][int(tier)] = path

    chars = sorted(by_char)
    cells = {c: {t: cell(p) for t, p in by_char[c].items()} for c in chars}
    cw = max(im[0].width for c in cells.values() for im in c.values())

    pad, lab, hdr = 16, 62, 34
    W = lab + len(TIERS) * (cw + pad) + pad
    H = hdr + len(chars) * (GAME_H + pad) + pad

    for idx, title in enumerate(['colour', 'value', 'shape']):
        sheet = Image.new('RGB', (W, H), (26, 22, 18))
        d = ImageDraw.Draw(sheet)
        d.text((pad, 10), f'{title.upper()} — every design at {GAME_H}px, the size it is played at',
               fill=(224, 167, 46))
        for ti, t in enumerate(TIERS):
            d.text((lab + ti*(cw+pad) + cw//2 - 12, hdr - 14), f'TIER {t}', fill=(170, 160, 150))
        for ci, c in enumerate(chars):
            y = hdr + ci*(GAME_H + pad)
            d.text((pad, y + GAME_H//2 - 4), c.upper(), fill=(230, 226, 216))
            for ti, t in enumerate(TIERS):
                if t not in cells[c]:
                    continue
                im = cells[c][t][idx]
                x = lab + ti*(cw+pad) + (cw - im.width)//2
                sheet.paste(im.convert('RGB'), (x, y))
        out = f'tiergrid-{title}.png'
        sheet.save(out)
        print('wrote', out, sheet.size)

    missing = [(c, t) for c in chars for t in TIERS if t not in cells[c]]
    if missing:
        print('missing:', ', '.join(f'{c}-t{t}' for c, t in missing))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'art-source/refs')
