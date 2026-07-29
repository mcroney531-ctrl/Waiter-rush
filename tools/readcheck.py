#!/usr/bin/env python3
"""Readability check for character art, at the size the game actually draws it.

"Recognisable at 96px" is a nice line in a spec and nobody ever checks it by
eye. This turns it into something you run. Point it at one or more character
images and it produces a strip showing, for each:

  1. the render at 96px on the wood floor it will stand on
  2. the same thing in greyscale on the floor's grey value — the value test,
     which is what catches a brown apron vanishing into brown floorboards
  3. a hard silhouette — everything the player's peripheral vision gets

If a character is unidentifiable in column 3, or melts into the background in
column 2, the design is not finished regardless of how it looks at 1024px.

    python3 readcheck.py tyrone.png velo.png ...
"""
import sys, os
from PIL import Image, ImageDraw, ImageOps

GAME_H = 96                     # how tall the player renders on a 960px board
FLOOR  = (196, 150, 96)         # the wood the character stands on
FLOOR_GREY = int(0.299*FLOOR[0] + 0.587*FLOOR[1] + 0.114*FLOOR[2])


def keyed(im):
    """Best-effort cutout. Real production art should already have alpha; this
    is only so the check still works on concept screenshots that don't."""
    im = im.convert('RGBA')
    if im.getchannel('A').getextrema()[0] < 255:
        return im                                   # already has transparency
    # flood from the border inwards on colour similarity — the same approach
    # the food plates needed, and far safer than a brightness threshold, which
    # eats pale parts of the character
    from collections import deque
    px = im.load()
    w, h = im.size
    seen = [[False]*w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h-1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w-1):
            q.append((x, y))
    ref = px[0, 0][:3]
    tol = 46
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        c = px[x, y]
        if max(abs(c[0]-ref[0]), abs(c[1]-ref[1]), abs(c[2]-ref[2])) > tol:
            continue
        seen[y][x] = True
        px[x, y] = (c[0], c[1], c[2], 0)
        q.extend(((x+1, y), (x-1, y), (x, y+1), (x, y-1)))
    return im


def row(im):
    im = keyed(im)
    bbox = im.getbbox() or (0, 0, im.width, im.height)
    im = im.crop(bbox)
    w = max(1, int(im.width * GAME_H / im.height))
    small = im.resize((w, GAME_H), Image.LANCZOS)

    colour = Image.new('RGBA', small.size, FLOOR + (255,))
    colour.alpha_composite(small)

    grey_bg = Image.new('RGBA', small.size, (FLOOR_GREY,)*3 + (255,))
    g = ImageOps.grayscale(small).convert('RGBA')
    g.putalpha(small.getchannel('A'))
    grey_bg.alpha_composite(g)

    sil = Image.new('RGBA', small.size, FLOOR + (255,))
    mask = small.getchannel('A').point(lambda v: 255 if v > 110 else 0)
    sil.paste((26, 20, 16, 255), (0, 0), mask)

    return [colour, grey_bg, sil]


def main(paths):
    labels = ['96px on the floor', 'value test (greyscale)', 'silhouette only']
    cols = [row(Image.open(p)) for p in paths]
    cw = max(c[0].width for c in cols)
    pad, lab, name = 14, 18, 16
    W = pad + len(cols) * (cw + pad)
    H = pad + name + len(labels) * (GAME_H + lab + pad)
    sheet = Image.new('RGB', (W, H), (32, 27, 22))
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        d.text((pad + i*(cw+pad), pad-2), os.path.basename(p)[:22], fill=(224, 167, 46))
    for r, label in enumerate(labels):
        y = pad + name + r*(GAME_H + lab + pad)
        d.text((pad, y), label, fill=(170, 160, 150))
        for i, c in enumerate(cols):
            sheet.paste(c[r], (pad + i*(cw+pad), y + lab))
    out = 'readcheck.png'
    sheet.save(out)
    print('wrote', out, sheet.size)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
