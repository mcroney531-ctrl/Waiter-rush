#!/usr/bin/env python3
"""Cut a button plaque off its backdrop and export it web-sized.

    python3 tools/cut_plaque.py <src.png> <key> [--mode flat|vignette]
                                [--width 640] [--ground N] [--quality 82]

`key` names the output: assets/ui/<key>.webp.

Two backdrops turn up, and they need different tools:

  flat      the art sits on a near-uniform field. Keyed globally on colour
            distance, not flood-filled from the border, because a plaque
            encloses background the border can never reach -- inside an "O",
            between the skull's teeth, under the rope. Everything near the key
            colour goes, wherever it is.

  vignette  the art sits on a gradient (the START backdrop runs 66,42,5 in the
            corners to 240,205,143 at the edge midpoints). No single key
            describes that, and the plaque's own stone is brown and tan too, so
            this grows a region in from the border instead, stepping to a
            neighbour only when the colour barely changes. The art's sides step
            300-490 at the boundary and the backdrop never steps more than ~12,
            so there is a wide gap to sit in.

--ground fades the last N rows to transparent. Art that stands on painted
ground has no edge to cut along down there; a ramp turns a hard slice into the
plaque standing on something that fades out.

WebP rather than PNG: these are smooth painted gradients, and quantising the
wood to 96 colours bands it visibly (mean error 8.6/255) while still costing
89 KB. Lossy WebP at the same size is smaller and closer to the original.
"""
import argparse
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def key_flat(a, key, lo, hi):
    """Alpha from colour distance to a flat backdrop, with a soft ramp so the
    cut edge is anti-aliased rather than a staircase."""
    d = np.abs(a - np.array(key)).sum(2)
    return np.clip((d - lo) / (hi - lo), 0, 1)


def key_vignette(a, step):
    """Alpha from a region grown in from the border, one small colour step at
    a time."""
    h, w, _ = a.shape
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        c = a[y, x]
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx]:
                if int(np.abs(a[ny, nx] - c).sum()) <= step:
                    bg[ny, nx] = True
                    q.append((ny, nx))
    return np.where(bg, 0.0, 1.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('key')
    ap.add_argument('--mode', choices=('flat', 'vignette'), default='flat')
    ap.add_argument('--bg', default='254,254,254', help='flat mode backdrop colour')
    ap.add_argument('--lo', type=int, default=34, help='flat: fully transparent below this distance')
    ap.add_argument('--hi', type=int, default=88, help='flat: fully opaque above this distance')
    ap.add_argument('--step', type=int, default=22, help='vignette: max per-pixel colour step')
    ap.add_argument('--ground', type=int, default=0, help='fade the last N source rows out')
    ap.add_argument('--width', type=int, default=640)
    ap.add_argument('--quality', type=int, default=82)
    args = ap.parse_args()

    im = Image.open(args.src).convert('RGB')
    a = np.asarray(im).astype(np.int16)

    if args.mode == 'flat':
        alpha = key_flat(a, [int(v) for v in args.bg.split(',')], args.lo, args.hi)
    else:
        alpha = key_vignette(a, args.step)

    if args.ground:
        h = alpha.shape[0]
        ramp = np.ones(h)
        y0, y1 = h - args.ground, h - max(2, args.ground // 10)
        ramp[y0:y1] = np.linspace(1, 0, y1 - y0)
        ramp[y1:] = 0
        alpha *= ramp[:, None]

    out = im.convert('RGBA')
    am = Image.fromarray((alpha * 255).astype(np.uint8))
    if args.mode == 'vignette':
        am = am.filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(am)

    box = am.point(lambda v: 255 if v > 6 else 0).getbbox()
    out = out.crop(box)
    out = out.resize((args.width, max(1, round(args.width * out.height / out.width))),
                     Image.LANCZOS)

    dst_dir = os.path.join(ROOT, 'assets', 'ui')
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, args.key + '.webp')
    out.save(dst, 'WEBP', quality=args.quality, method=6)
    print(f'{args.key}: {out.width}x{out.height}  aspect {out.width/out.height:.3f}  '
          f'{os.path.getsize(dst)/1024:.0f} KB  -> assets/ui/{args.key}.webp')


if __name__ == '__main__':
    main()
