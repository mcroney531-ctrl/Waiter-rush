#!/usr/bin/env python3
"""Prepare a full-screen backdrop for the pre-shift screens.

    python3 tools/make_backdrop.py <src> <key> [--width 1600]

The art arrives lit for its own sake -- this wall peaks at luminance 250 under
a lamp glow -- and the screens that sit on it are cream body text (#F4EEDB) and
a gold heading (#E0A72E). Dropped in as-is the body text lands at 1.04:1
against the bright centre, which is not low contrast so much as invisible.

So it is dimmed here rather than veiled in CSS, and by how much is solved for
rather than chosen: the tool finds the smallest dimming that leaves the
*brightest pixel in the art* clearing WCAG AA for both colours -- 4.5:1 for the
body text, 3:1 for the heading, which is the large-text threshold and the only
one gold can reach without going black. Solving against the brightest pixel
rather than the average is deliberate: the layout reflows, and text lands
wherever the screen is tall or short that day.

A flat multiply would crush the fossil relief into mud, so the curve is
`out = 255 * s * (in/255)**GAMMA` with gamma under 1. That pulls the highlights
down much harder than the mid-tones, which is exactly the shape of the problem
-- the lamp hotspot is what breaks the text, and the carved detail is what has
to survive.
"""
import argparse
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GAMMA = 0.74          # <1: squashes highlights, keeps the mid-tone relief
TEXT = {'body': ((244, 238, 219), 4.5),    # #F4EEDB at body size
        'heading': ((224, 167, 46), 3.0)}  # #E0A72E, large text


def rel_luminance(rgb):
    c = np.asarray(rgb, float) / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def contrast(a, b):
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('key')
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--quality', type=int, default=78)
    args = ap.parse_args()

    im = Image.open(args.src).convert('RGB')
    a = np.asarray(im).astype(float)

    curve = (a / 255) ** GAMMA
    # Search the scale rather than solving it: the worst pixel after the curve
    # is not the worst pixel before it, since the curve is per-channel and the
    # brightest luminance can move.
    #
    # Walked from bright to dark and stopped at the first pass, so this lands
    # on the *lightest* backdrop that still clears both thresholds. Walking the
    # other way passes on the first try and hands back a black rectangle, which
    # is technically a readable backdrop.
    best = None
    for s in np.arange(1.0, 0.199, -0.005):
        out = np.clip(curve * s * 255, 0, 255)
        worst = rel_luminance(out).max()
        if all(contrast(rel_luminance(c), worst) >= need for c, need in TEXT.values()):
            best = s
            break
    if best is None:
        raise SystemExit('no dimming clears both thresholds — check the palette')

    dst_dir = os.path.join(ROOT, 'assets', 'ui')
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, args.key + '.webp')

    # The thresholds have to hold for the file that ships, not for the array in
    # memory. Lossy WebP moves pixels, and it moved this one's brightest patch
    # from 0.110 to 0.129 relative luminance -- enough on its own to drop the
    # gold heading from passing to 2.72:1. So write, re-read, and step down
    # until the encoded file clears it.
    while best > 0.2:
        out = np.clip(curve * best * 255, 0, 255)
        img = Image.fromarray(out.astype(np.uint8))
        img = img.resize((args.width, round(args.width * img.height / img.width)),
                         Image.LANCZOS)
        img.save(dst, 'WEBP', quality=args.quality, method=6)
        shipped = np.asarray(Image.open(dst).convert('RGB')).astype(float)
        worst = rel_luminance(shipped).max()
        if all(contrast(rel_luminance(c), worst) >= need for c, need in TEXT.values()):
            break
        best -= 0.005
    else:
        raise SystemExit('no dimming clears both thresholds once encoded')

    for name, (c, need) in TEXT.items():
        print(f'  {name:8} {contrast(rel_luminance(c), worst):.2f}:1  (needs {need})')
    print(f'  scale {best:.3f} at gamma {GAMMA}: brightest relative luminance '
          f'{rel_luminance(a).max():.3f} -> {worst:.3f} as shipped')
    print(f'{args.key}: {img.width}x{img.height}  {os.path.getsize(dst)/1024:.0f} KB'
          f'  -> assets/ui/{args.key}.webp')


if __name__ == '__main__':
    main()
