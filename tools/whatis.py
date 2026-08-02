#!/usr/bin/env python3
"""Say what a GLB actually is, before anyone reasons about it.

    python3 tools/whatis.py ~/Downloads/Meshy_AI_Cragstone_Table_0802000013_texture.glb

Written after a session spent evaluating an already-shipped table as if it were
a failed counter, and then inventing a theory about Meshy mangling extreme
aspect ratios to explain the result. No such conversion had ever been run. The
whole chain came from never establishing which object was on the table.

Two facts settle it and neither needs an opinion:

  - its **proportions**, which say what kind of thing it is. A table is roughly
    1.4:1 in plan and half a character tall; a counter is five or six times
    wider than it is tall. Those are not close.
  - whether it **matches something already in the repo**, which says whether it
    is new work or a file we have seen before at a different pipeline stage.
    A pre-shrink Meshy download and its shrunk-and-committed twin have the same
    geometry and wildly different sizes, which is exactly the pair that reads as
    two different objects if you go by filename and byte count.

So this prints the measurements and then names the closest thing in
`art-source/`, with a distance. It is deliberately not clever: geometry
fingerprint only, because textures change under `shrink_glb.py` and filenames
are whatever Meshy felt like that day.
"""
import json
import os
import struct
import sys
import glob as globmod

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shrink_glb import read_glb, source_bytes  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Everything the room and cast pipelines commit. Character GLBs are in the list
# on purpose -- "is this a prop or did I re-download Tyrone" is the same question.
KNOWN = sorted(globmod.glob(os.path.join(ROOT, 'art-source', 'room', '*.glb'))
               + globmod.glob(os.path.join(ROOT, 'art-source', '*.glb')))

COMP = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def fingerprint(path):
    """Triangles and world bounding box, with node transforms applied.

    The accessor min/max are in each mesh's own space, so a prop whose parts sit
    on a translated node measures far too small if they are read raw. Meshy
    exports do this constantly.
    """
    js, _ = read_glb(path, source_bytes(path)[0])
    acc = js.get('accessors', [])
    meshes = js.get('meshes', [])

    tris = 0
    for m in meshes:
        for p in m.get('primitives', []):
            if 'indices' in p:
                tris += acc[p['indices']]['count'] // 3
            elif 'POSITION' in p.get('attributes', {}):
                tris += acc[p['attributes']['POSITION']]['count'] // 3

    def mat_of(node):
        if 'matrix' in node:                    # column-major, per glTF
            m = node['matrix']
            return [[m[0], m[4], m[8], m[12]], [m[1], m[5], m[9], m[13]],
                    [m[2], m[6], m[10], m[14]], [m[3], m[7], m[11], m[15]]]
        t = node.get('translation', [0, 0, 0])
        s = node.get('scale', [1, 1, 1])
        q = node.get('rotation', [0, 0, 0, 1])
        x, y, z, w = q
        r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
             [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
        return [[r[i][j] * s[j] for j in range(3)] + [t[i]] for i in range(3)] + \
               [[0, 0, 0, 1]]

    def mul(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)]
                for i in range(4)]

    lo = [float('inf')] * 3
    hi = [float('-inf')] * 3
    nodes = js.get('nodes', [])

    def walk(idx, parent):
        n = nodes[idx]
        world = mul(parent, mat_of(n))
        if 'mesh' in n:
            for p in meshes[n['mesh']].get('primitives', []):
                a = acc[p['attributes']['POSITION']]
                if 'min' not in a:
                    continue
                # Eight corners through the transform: a rotated box's extent is
                # not its extent times the matrix diagonal.
                for cx in (a['min'][0], a['max'][0]):
                    for cy in (a['min'][1], a['max'][1]):
                        for cz in (a['min'][2], a['max'][2]):
                            for i in range(3):
                                v = (world[i][0] * cx + world[i][1] * cy
                                     + world[i][2] * cz + world[i][3])
                                lo[i] = min(lo[i], v)
                                hi[i] = max(hi[i], v)
        for c in n.get('children', []):
            walk(c, world)

    eye = [[1 if i == j else 0 for j in range(4)] for i in range(4)]
    roots = js.get('scenes', [{}])[js.get('scene', 0)].get(
        'nodes', list(range(len(nodes))))
    for r in roots:
        walk(r, eye)

    size = [hi[i] - lo[i] for i in range(3)] if lo[0] != float('inf') else [0, 0, 0]
    return dict(tris=tris, size=size, js=js)


def describe(size):
    """Longest against shortest -- the number that separates a table from a bar.

    Calibrated on the one prop we have shipped rather than on intuition: the
    approved table measures 1.899 x 0.760 x 1.352, which is 2.50:1. The counter
    reference measures out at about 5.4:1. Nothing in the kit sits between them,
    so the band in the middle is honestly reported as "could be either".
    """
    s = sorted(size)
    if s[0] <= 0:
        return 0.0, 'degenerate'
    ratio = s[2] / s[0]
    if ratio >= 4.5:
        kind = 'a long low bar -- counter-shaped'
    elif ratio >= 3.5:
        kind = 'between the two -- too long for the table, too short for the counter'
    else:
        kind = 'a compact chunky object -- table-shaped (the table is 2.50:1)'
    return ratio, kind


def main(argv):
    if not argv:
        raise SystemExit('usage: python3 tools/whatis.py <file.glb|file.zip>')
    path = argv[0]
    fp = fingerprint(path)
    js = fp['js']
    w, h, d = fp['size']
    longest, shortest = max(fp['size']), min(fp['size'])
    ratio, kind = describe(fp['size'])

    print(f'{os.path.basename(path)}')
    print(f'  {os.path.getsize(path) / 1e6:.2f} MB on disk')
    print(f'  {fp["tris"]:,} triangles, {len(js.get("meshes", []))} mesh(es), '
          f'{len(js.get("images", []))} image(s)')
    print(f'  bbox {w:.3f} x {h:.3f} x {d:.3f}')
    print(f'  longest : shortest  =  {longest / shortest:.2f} : 1   -> {kind}')
    if not js.get('images'):
        print('  UNTEXTURED -- this is the geometry-only download; Texture has not '
              'been run in Meshy yet')
    if js.get('animations'):
        print(f'  {len(js["animations"])} animation(s) -- this is a character '
              f'export, not a prop')

    print('\n  against what is already committed:')
    hits = []
    for k in KNOWN:
        if os.path.abspath(k) == os.path.abspath(path):
            continue
        try:
            o = fingerprint(k)
        except Exception:
            continue
        # Scale-invariant: Meshy exports at an arbitrary scale, so compare the
        # shape, not the size. Triangle count is the strong signal -- it survives
        # shrink_glb.py untouched, which is the whole point.
        dt = abs(o['tris'] - fp['tris']) / max(o['tris'], fp['tris'], 1)
        a = sorted(fp['size'])
        b = sorted(o['size'])
        ds = (sum(abs(a[i] / max(a[2], 1e-9) - b[i] / max(b[2], 1e-9))
                  for i in range(3)) / 3)
        hits.append((dt + ds, dt, ds, k))
    hits.sort()
    if not hits:
        print('    nothing to compare against')
    # Only two verdicts are worth stating. "Same object" needs the triangle count
    # to match essentially exactly -- shrink_glb.py does not touch geometry, so a
    # pre-shrink download and its committed twin agree to the triangle. Anything
    # looser is a guess, and a confident guess about file identity is precisely
    # the failure this script exists to prevent; the five characters are all
    # similar meshes and would happily match each other under a loose threshold.
    same = [h for h in hits if h[1] < 0.0005 and h[2] < 0.005]
    if same:
        _, dt, ds, k = same[0]
        print(f'    {os.path.relpath(k, ROOT)}')
        print('    ^^ SAME OBJECT -- identical geometry. This is a file already in')
        print('       the repo at a different pipeline stage, not new work.')
    else:
        print('    no geometry match -- this is a mesh the repo has not seen.')
        print('    nearest by shape, which is not the same as being related:')
        for score, dt, ds, k in hits[:2]:
            print(f'      {os.path.relpath(k, ROOT):32} tri {dt * 100:5.1f}% off, '
                  f'shape {ds:.3f}')
    print('\n  This says what the file is. It does not say whether it is good --')
    print('  run tools/preview_prop.mjs for that.')


if __name__ == '__main__':
    main(sys.argv[1:])
