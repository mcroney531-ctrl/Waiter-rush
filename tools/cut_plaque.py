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

--declutter (vignette only) handles a third backdrop the two modes above
don't: a DALL-E "transparency" checker pattern baked as real RGB pixels
(alternating near-white tiles, not true alpha), the same issue
`parchment-bubble-sheet.png` hit and the Manager character sheets hit worse.
The checker is often close enough in colour to a white shirt/collar in the
art that a global `flat` key mottles the fabric, but plain `vignette` alone
can leave isolated checker tiles behind: they sit *inside* the border-flood
region colour-wise but get welded onto the real silhouette through a thin
soft-edge bridge, so the border flood never reaches them and a same-colour
flat key can't tell them apart from real fabric either. Fix: erode the
vignette foreground a couple pixels (breaks thin bridges without shrinking
real limbs/objects), label what's left, drop any piece whose average colour
is still near the backdrop key, then grow the surviving pieces back out to
their full original extent (morphological reconstruction) so real edges
stay crisp. Needs scipy (`ndimage`) on top of PIL/numpy -- not vendored,
install it if it's missing. `--declutter-thresh 0` disables the check on a
per-run basis without needing a separate code path.

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


def key_flat(a, key, lo, hi, shadow=False):
    """Alpha from colour distance to a flat backdrop, with a soft ramp so the
    cut edge is anti-aliased rather than a staircase.

    `shadow` additionally keys out the backdrop's own shadow. Art generated with
    a drop shadow -- which happens whether or not the prompt asked for one --
    casts it onto the backdrop, and a shadow is the backdrop scaled toward
    black, so it is fully opaque and nowhere near the key colour by distance.
    On the drop-zone frame that left a solid pink rim tracing every bone.

    Scaling toward black is exactly what dividing out brightness undoes: compare
    each pixel's colour normalised to its own brightest channel against the key
    normalised the same way, and a shadow of the key lands on top of the key
    while genuinely different art stays far away. Measured on this frame: the
    shadow sits at 0.07, the cream bones at 0.86, the amber gems at 0.75.
    """
    d = np.abs(a - np.array(key)).sum(2)
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    if shadow:
        k = np.array(key, dtype=np.float64)
        kn = k / k.max()
        px = a.astype(np.float64)
        dn = np.abs(px / np.clip(px.max(2, keepdims=True), 1, None) - kn).sum(2)
        # Ramped rather than cut, so the shadow's own soft edge stays soft.
        alpha = np.minimum(alpha, np.clip((dn - 0.10) / 0.12, 0, 1))
    return alpha


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


def declutter_vignette(a, bg, key, erode_iters, color_thresh):
    """Clean up checker-pattern remnants `key_vignette` alone leaves behind.

    `bg` is key_vignette's boolean background mask (True = already cut).
    Erode the foreground to break thin bridges to leftover checker tiles,
    drop any eroded piece whose average colour is still near the backdrop
    key, then reconstruct (dilate the survivors back out, clipped to the
    original foreground) so real silhouette edges are not shrunk.
    """
    from scipy import ndimage

    fg = ~bg
    struct = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    eroded = ndimage.binary_erosion(fg, structure=struct, iterations=erode_iters)
    labels, n = ndimage.label(eroded, structure=struct)
    kc = np.array(key, dtype=np.float64)

    valid_seed = np.zeros_like(eroded)
    for i in range(1, n + 1):
        mask = labels == i
        mean_color = a[mask].mean(axis=0)
        if np.abs(mean_color - kc).sum() < color_thresh:
            continue
        valid_seed |= mask

    fg_clean = ndimage.binary_propagation(valid_seed, mask=fg)
    return ~fg_clean


def unmultiply(rgb, key, alpha):
    """Take the backdrop back out of the edge pixels.

    Keying only writes alpha. A pixel half-covered by a bone still holds the
    colour the renderer actually produced -- half bone, half backdrop -- so over
    a dark floor the leftover backdrop shows as a rim in the backdrop's own
    colour. On a magenta key that rim is bright pink and it traced every bone in
    the drop-zone frame.

    Compositing says `seen = fg*alpha + key*(1-alpha)`, so the foreground the
    artist drew is `(seen - key*(1-alpha)) / alpha`. Solving it back out is what
    makes a keyed edge sit on any background rather than only on the one it was
    cut from -- which matters here, because the floor under these is about to be
    rebuilt in 3D.

    Only for `flat`. It needs one known backdrop colour, and vignette exists
    precisely because that backdrop is a gradient.
    """
    k = np.array(key, dtype=np.float64)
    # Below this the pixel is nearly all backdrop and the division amplifies
    # noise into confetti; it is transparent enough that its colour is unseen.
    solid = alpha > 0.04
    out = rgb.copy()
    az = np.where(solid, alpha, 1.0)[..., None]
    fixed = (rgb - k * (1.0 - az)) / az
    out[solid] = fixed[solid]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('key')
    ap.add_argument('--mode', choices=('flat', 'vignette'), default='flat')
    ap.add_argument('--bg', default='254,254,254', help='flat mode backdrop colour')
    ap.add_argument('--lo', type=int, default=34, help='flat: fully transparent below this distance')
    ap.add_argument('--hi', type=int, default=88, help='flat: fully opaque above this distance')
    ap.add_argument('--shadow', action='store_true',
                    help='flat: also key out the backdrop\'s own drop shadow')
    ap.add_argument('--step', type=int, default=22, help='vignette: max per-pixel colour step')
    ap.add_argument('--declutter', default=None,
                    help='vignette: R,G,B of the checker/backdrop colour to also '
                         'sweep for welded-on leftover tiles (see module docstring)')
    ap.add_argument('--declutter-erode', type=int, default=2,
                    help='declutter: erosion iterations used to break thin bridges')
    ap.add_argument('--declutter-thresh', type=int, default=45,
                    help='declutter: colour distance under which an isolated piece is dropped')
    ap.add_argument('--ground', type=int, default=0, help='fade the last N source rows out')
    ap.add_argument('--width', type=int, default=640)
    ap.add_argument('--quality', type=int, default=82)
    args = ap.parse_args()

    im = Image.open(args.src).convert('RGB')
    a = np.asarray(im).astype(np.int16)

    if args.mode == 'flat':
        alpha = key_flat(a, [int(v) for v in args.bg.split(',')], args.lo, args.hi,
                         args.shadow)
    else:
        alpha = key_vignette(a, args.step)
        if args.declutter and args.declutter_thresh > 0:
            bg = declutter_vignette(a, alpha < 0.5,
                                     [int(v) for v in args.declutter.split(',')],
                                     args.declutter_erode, args.declutter_thresh)
            alpha = np.where(bg, 0.0, 1.0)

    if args.ground:
        h = alpha.shape[0]
        ramp = np.ones(h)
        y0, y1 = h - args.ground, h - max(2, args.ground // 10)
        ramp[y0:y1] = np.linspace(1, 0, y1 - y0)
        ramp[y1:] = 0
        alpha *= ramp[:, None]

    rgb = a.astype(np.float64)
    if args.mode == 'flat':
        rgb = unmultiply(rgb, [int(v) for v in args.bg.split(',')], alpha)
    elif args.mode == 'vignette':
        # key_vignette's alpha is a hard 0/1 mask, and the softening below
        # blurs it into a fractional edge -- but the RGB under that edge is
        # still whatever backdrop tone was actually there (a checker tile,
        # the vignette's own colour), never blended toward black the way a
        # true soft edge would be. Composited at low alpha over a dark game
        # background that shows through as a pale halo tracing every letter
        # -- invisible against a near-black test swatch, obvious against the
        # real (lighter, textured) backdrop. Blackening the background side
        # before the blur means the blur only ever softens toward black, so
        # a residual sliver of alpha contributes darkness instead of a tint.
        rgb = np.where(alpha[..., None] < 0.5, 0, rgb)

    out = Image.fromarray(rgb.round().clip(0, 255).astype(np.uint8), 'RGB').convert('RGBA')
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
