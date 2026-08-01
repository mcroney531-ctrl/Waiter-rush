#!/usr/bin/env python3
"""Food readability grid — the whole menu at the size it is played at.

    python3 tools/foodgrid.py
    python3 tools/foodgrid.py --calibrate     # once the menu is good

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
import datetime
import hashlib
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

# The ticket slot, straight out of index.html's TICKET.
SLOT_W, SLOT_H = 68, 62
# What the board actually is under the rail, sampled from assets/board.jpg.
FLOOR = (87, 63, 43)
CARRY_TWO = 0.6          # icons shrink to this when carrying two orders

ITEMS = ['pizza', 'sub', 'tacos', 'pasta', 'salad', 'club', 'soup', 'ribs',
         'tart', 'burger', 'shake']

# Measured off the illustrated set, which is the art this replaces: their outer
# edge sits about 108 luminance steps off the floor. A bare 3D render on a dark
# plate managed 41 and visibly floated, so the bar sits between the two, high
# enough that an unaided dark plate cannot pass.
MIN_SEPARATION = 70
# The band the spec asks for. The slot's own aspect is 1.10, and a dish far
# from it is scaled down by whichever side runs out first, so it looks
# undersized beside the rest even though nothing is wrong with it alone.
ASPECT_MIN, ASPECT_MAX = 1.0, 1.3
# Drinks are exempt, and it is the point of them. The band exists because a
# plate flatter than its slot gets scaled down and looks undersized beside the
# rest; a glass is tall on purpose, and being the one item on the rail that is
# taller than it is wide is the only thing on this menu that breaks the
# every-dish-is-a-circle problem the shape strip keeps flagging.
TALL = {'shake'}
MIN_FILL = 0.80          # fraction of the slot's area the dish should cover
# Provisional, and deliberately so. Across the set being replaced every dish
# sits 0.95-0.99 against its closest twin — ten circles. The one 3D dish is the
# most distinct at 0.89, which is better and still not good. So 0.90 flags
# everything currently shipping and leaves room to tighten once there is a set
# worth calibrating against.
MAX_SIMILARITY = 0.90


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


def normalised_silhouette(path, n=128):
    """The dish's shape with size and aspect divided out, so what is left is
    only the outline. Taken from the source art rather than the 68px icon: at
    play size these shapes differ by a few pixels and the comparison drowns in
    its own anti-aliasing."""
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)[..., 3] > 110
    ys, xs = np.nonzero(a)
    if not len(ys):
        return np.zeros((n, n), bool)
    box = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return np.asarray(box.resize((n, n), Image.LANCZOS))[..., 3] > 110


def distinctness(paths):
    """How much each dish's outline overlaps the most similar other dish.

    Distinctness is relative, not absolute — the acceptance test is "can you
    name all ten", which no per-dish shape statistic answers. So this compares
    every pair and reports each dish's nearest neighbour.

    The obvious per-dish alternative was tried first and does not work: how much
    of the silhouette sits above the plate rim, plus solidity, circularity and
    the height of the shape above its widest row. At 68px, on a dish where the
    plate dominates the outline, all five score the 3D burger the same as the
    nine flat plates it visibly differs from. Pairwise overlap separates them.
    """
    sil = {n: normalised_silhouette(p) for n, p in paths}
    names = [n for n, _ in paths]
    near = {}
    for a in names:
        best = (0.0, None)
        for b in names:
            if a == b:
                continue
            i = np.logical_and(sil[a], sil[b]).sum()
            u = np.logical_or(sil[a], sil[b]).sum()
            iou = i / u if u else 0.0
            if iou > best[0]:
                best = (iou, b)
        near[a] = best
    return near


BASELINE = 'art-source/food-baseline.json'

# Three things in the baseline can independently stop meaning what they say, so
# each is versioned separately and named after what it actually describes.
#
# A single catch-all "tool version" was considered and rejected. It would fire
# on every unrelated edit — a typo, an extra print — and a warning that cries
# wolf gets ignored, taking the real ones down with it. It would also duplicate
# git_commit, which already pins the exact code that produced the file, more
# precisely than a hand-maintained number ever will.
SCHEMA = 1                                        # which fields exist
METRIC_VERSION = 'iou/normalised-128/alpha-110'   # what `threshold` means
DIGEST_VERSION = 'sha256/name+bytes/16'           # what `corpus` means


def corpus_digest(paths):
    """A hash of the art the number was derived from.

    A commit hash alone is not provenance here: calibrating with uncommitted
    changes records a sha that does not describe the files that were measured.
    This does, regardless of git state, and it is what answers "was the bar
    derived from this exact menu" six months later.
    """
    h = hashlib.sha256()
    for name, path in sorted(paths):
        h.update(name.encode())
        with open(path, 'rb') as f:
            h.update(f.read())
    return h.hexdigest()[:16]


def git_context():
    def run(*a):
        try:
            return subprocess.run(a, capture_output=True, text=True,
                                  timeout=5).stdout.strip() or None
        except (OSError, subprocess.SubprocessError):
            return None
    return {
        'git_commit': run('git', 'rev-parse', 'HEAD'),
        # Recorded rather than blocked: the digest is the real identity, but a
        # dirty tree means the commit above does not describe what was measured.
        'git_dirty': bool(run('git', 'status', '--porcelain', 'assets/food',
                              'tools/foodgrid.py')),
    }


def load_threshold(paths):
    """The calibrated bar if one has been set, otherwise the provisional guess.

    Once a menu is good, that menu *is* the definition of acceptably distinct
    for this game — its own worst pair is, by definition, a pair someone looked
    at and accepted. Deriving the number from it beats re-guessing, and pinning
    it means a later dish is judged against the set that shipped rather than
    against a bar that drifted.
    """
    try:
        with open(BASELINE) as f:
            b = json.load(f)
        thr = float(b['threshold'])
    except (OSError, KeyError, ValueError, TypeError):
        return MAX_SIMILARITY, None, []

    warnings = []
    if b.get('schema') != SCHEMA:
        warnings.append(f'baseline schema {b.get("schema")} != {SCHEMA}')
    if b.get('metric') != METRIC_VERSION:
        warnings.append(
            f'baseline was derived by metric {b.get("metric")!r}, this is '
            f'{METRIC_VERSION!r} — the bar is not comparable, re-calibrate')
    # The corpus check is only meaningful if the stored hash was computed the
    # same way. Without this guard, changing how the digest is built reports
    # "the menu has changed" — which is false, and sends someone to inspect art
    # that is fine. Say what actually happened instead.
    if b.get('digest') != DIGEST_VERSION:
        warnings.append(
            f'corpus was fingerprinted by {b.get("digest")!r}, this is '
            f'{DIGEST_VERSION!r} — cannot tell whether the menu changed')
    elif b.get('corpus') and b['corpus'] != corpus_digest(paths):
        warnings.append('the menu has changed since the bar was set')
    return thr, b, warnings


def calibrate(near, folder, paths):
    """Freeze the current set as the reference corpus.

    Refuses if the set does not already pass the provisional bar. Calibrating
    against a failing menu would do the one thing this tool exists to prevent:
    quietly certify ten circles and hand every later dish a bar it can clear
    without being distinguishable from anything.
    """
    worst_name, (worst, twin) = max(near.items(), key=lambda kv: kv[1][0])
    if worst > MAX_SIMILARITY:
        print(f'\nREFUSING to calibrate: {worst_name} and {twin} overlap {worst:.2f}, '
              f'above the provisional {MAX_SIMILARITY:.2f}.')
        print('Fix the set first — a baseline taken from a failing menu certifies it.')
        return False
    # A hair above the worst accepted pair, so the corpus itself passes its own
    # bar and a new dish has to be at least as distinct as the closest existing
    # pair rather than merely better than the worst imaginable one.
    thr = round(min(0.95, worst + 0.02), 2)
    payload = {
        'schema': SCHEMA,
        'metric': METRIC_VERSION,
        'digest': DIGEST_VERSION,
        'threshold': thr,
        # Provenance, so that "why is the bar 0.91" is answerable later without
        # archaeology. The corpus digest is the load-bearing one; the commit is
        # context and can be misleading on its own if the tree was dirty.
        'corpus': corpus_digest(paths),
        'menu_size': len(near),
        'calibrated_from': folder,
        'generated_at': datetime.datetime.now(datetime.timezone.utc)
                                .replace(microsecond=0).isoformat(),
        **git_context(),
        'worst_pair': [worst_name, twin, round(worst, 3)],
        'dishes': {n: [t, round(v, 3)] for n, (v, t) in sorted(near.items())},
        'note': ('Derived from the shipped menu, not chosen. A new dish is judged '
                 'against this corpus; re-calibrate only when the menu itself '
                 'changes, not to make a new dish pass.')
    }
    os.makedirs(os.path.dirname(BASELINE), exist_ok=True)
    with open(BASELINE, 'w') as f:
        json.dump(payload, f, indent=2)
        f.write('\n')
    print(f'\nwrote {BASELINE}: threshold {thr:.2f}, '
          f'set by {worst_name}/{twin} at {worst:.2f}')
    return True


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


def main(folder='assets/food', do_calibrate=False):
    icons, paths, missing = [], [], []
    for n in ITEMS:
        p = os.path.join(folder, n + '.png')
        if not os.path.exists(p):
            missing.append(n)
            continue
        icons.append((n, at_slot_size(p)))
        paths.append((n, p))

    if not icons:
        sys.exit(f'no icons found in {folder}')

    for mode, title in [('colour', 'COLOUR — every dish in its ticket slot, on the floor it sits on'),
                        ('value',  'VALUE — the same in greyscale; hue-only separation dies here'),
                        ('shape',  'SHAPE — silhouette only; can you still name each one?')]:
        out = f'foodgrid-{mode}.png'
        strip(icons, mode, title).save(out)
        print('wrote', out)

    near = distinctness(paths) if len(paths) > 1 else {}
    threshold, baseline, warnings = load_threshold(paths)

    print(f'\n{"dish":8} {"edge L":>7} {"vs floor":>9} {"aspect":>7} {"fill":>6} '
          f'{"nearest":>16}   notes')
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
        if name in TALL:
            if aspect >= 1.0:
                notes.append(f'ASPECT {aspect:.2f} — a drink that is not tall')
        elif not ASPECT_MIN <= aspect <= ASPECT_MAX:
            notes.append(f'ASPECT {aspect:.2f} outside {ASPECT_MIN}-{ASPECT_MAX}')
        iou, twin = near.get(name, (0.0, None))
        if twin and iou > threshold:
            notes.append(f'SAME SHAPE AS {twin.upper()}')
        col = f'{twin[:9]} {iou:.2f}' if twin else ''
        print(f'{name:8} {edge:7.0f} {sep:9.0f} {aspect:7.2f} {fill:6.0%} '
              f'{col:>16}   ' + (', '.join(notes) if notes else 'ok'))

    if near:
        mean = np.mean([v for v, _ in near.values()])
        print(f'\nmean overlap with nearest twin: {mean:.2f}  '
              f'(1.00 would be {len(icons)} copies of one shape)')
    print(f'floor luminance {FLOOR_L:.0f}; carrying two shrinks every dish to '
          f'{CARRY_TWO:.0%}, so read the shape strip at arm\'s length too.')
    if baseline:
        print(f'overlap bar {threshold:.2f}, calibrated {baseline.get("generated_at", "?")} '
              f'from {baseline["worst_pair"][0]}/{baseline["worst_pair"][1]}.')
        for w in warnings:
            print(f'  ! {w}')
    else:
        print(f'overlap bar {threshold:.2f}, provisional — run --calibrate once the '
              f'menu is good.')
    print('the overlap number is an early warning, not a verdict — the strip is.')
    if do_calibrate:
        calibrate(near, folder, paths)
    if missing:
        print('missing:', ', '.join(missing))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(args[0] if args else 'assets/food', '--calibrate' in sys.argv)
