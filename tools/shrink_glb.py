#!/usr/bin/env python3
"""Shrink a Meshy GLB by resizing its textures to what the sprite render needs.

    python3 tools/shrink_glb.py art-source/tyrone.glb
    python3 tools/shrink_glb.py art-source/*.glb --size 512 --inplace

Meshy exports a 2048x2048 RGBA PNG per character. Tyrone tier 1 is 6.12 MB and
5.28 MB of that -- 86% -- is that one image. The mesh, the skin and the walk
cycle together are under a megabyte.

That texture is being thrown away almost entirely. The sprite sheet renders at
192px per cell, so a whole frame of animation is 37k pixels and the texture is
4.2M. Even at 512 the texture still out-resolves the render by 7x. Nothing
visible is lost; the only thing that shrinks is the file.

The rewrite is lossless for geometry. Every buffer view is copied verbatim
except the image ones, so accessors, the skin and the animation samplers are
untouched -- the offsets move, the data does not.

Opaque textures re-encode as JPEG, which is where most of the remaining win
comes from. A texture that actually uses its alpha channel stays PNG, because
dropping alpha would punch holes in the model.
"""
import sys, os, io, json, struct, glob

from PIL import Image

MAGIC, JSON_CHUNK, BIN_CHUNK = 0x46546C67, 0x4E4F534A, 0x004E4942


def read_glb(path):
    d = open(path, 'rb').read()
    magic, ver, total = struct.unpack_from('<III', d, 0)
    if magic != MAGIC:
        raise ValueError(f'{path} is not a GLB')
    off, js, bin_ = 12, None, b''
    while off < len(d):
        ln, ty = struct.unpack_from('<II', d, off)
        body = d[off + 8: off + 8 + ln]
        if ty == JSON_CHUNK:
            js = json.loads(body)
        elif ty == BIN_CHUNK:
            bin_ = body
        off += 8 + ln
    return js, bin_


def pad4(b, fill=b'\x00'):
    return b + fill * (-len(b) % 4)


def write_glb(path, js, bin_):
    j = pad4(json.dumps(js, separators=(',', ':')).encode('utf-8'), b' ')
    b = pad4(bin_)
    out = struct.pack('<III', MAGIC, 2, 12 + 8 + len(j) + (8 + len(b) if b else 0))
    out += struct.pack('<II', len(j), JSON_CHUNK) + j
    if b:
        out += struct.pack('<II', len(b), BIN_CHUNK) + b
    open(path, 'wb').write(out)


def image_is_opaque(js, image_index):
    """True when no material actually uses this image's alpha channel.

    Sniffing pixels is the wrong test and gets this backwards. Tyrone's texture
    has 34 non-opaque pixels out of 4.2 million -- edge noise in unused UV space
    -- which is enough to fail a pixel test while meaning nothing. What decides
    it is the material: glTF `alphaMode` defaults to OPAQUE, and an OPAQUE
    material ignores the alpha channel entirely. Only MASK or BLEND reads it.

    Images can be reached by more than one texture and more than one material,
    so every route in is checked and any one of them wanting alpha is decisive.
    """
    textures = {i for i, t in enumerate(js.get('textures', []))
                if t.get('source') == image_index}
    if not textures:
        return True

    def slots(mat):
        pbr = mat.get('pbrMetallicRoughness', {})
        for s in (pbr.get('baseColorTexture'), pbr.get('metallicRoughnessTexture'),
                  mat.get('normalTexture'), mat.get('occlusionTexture'),
                  mat.get('emissiveTexture')):
            if s and 'index' in s:
                yield s['index']

    for mat in js.get('materials', []):
        if mat.get('alphaMode', 'OPAQUE') == 'OPAQUE':
            continue
        # Only the base colour slot carries alpha; a normal or ORM map in a
        # blended material still has no alpha of its own to preserve.
        base = mat.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if base and base.get('index') in textures:
            return False
    return True


def resize_image(raw, size, quality, opaque):
    """Return (bytes, mime, note) for one texture, or None to leave it alone."""
    im = Image.open(io.BytesIO(raw))
    w, h = im.size

    if max(w, h) > size:
        scale = size / max(w, h)
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    elif opaque and im.format == 'JPEG':
        return None                       # already small and already JPEG

    buf = io.BytesIO()
    if opaque:
        im.convert('RGB').save(buf, 'JPEG', quality=quality, optimize=True,
                               subsampling=1)
        mime = 'image/jpeg'
    else:
        im.save(buf, 'PNG', optimize=True)
        mime = 'image/png'
    return buf.getvalue(), mime, f'{w}x{h}->{im.size[0]}x{im.size[1]} {mime[6:]}'


def shrink(path, out_path, size, quality):
    js, bin_ = read_glb(path)
    views = js.get('bufferViews', [])
    if not views:
        return None

    # Replace image payloads first, then rebuild the binary chunk around them.
    replaced, notes = {}, []
    for idx, img in enumerate(js.get('images', [])):
        if 'bufferView' not in img:
            continue                      # external URI; nothing embedded to shrink
        v = views[img['bufferView']]
        raw = bin_[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
        r = resize_image(raw, size, quality, image_is_opaque(js, idx))
        if r is None:
            continue
        data, mime, note = r
        if len(data) >= len(raw):
            continue                      # re-encoding made it worse; keep the original
        replaced[img['bufferView']] = data
        img['mimeType'] = mime
        notes.append(f'  image {idx}: {note}, '
                     f'{len(raw)/1e6:.2f} -> {len(data)/1e6:.2f} MB')

    if not replaced:
        return None

    # Every view is copied into a fresh buffer in order. Views are copied whole
    # and independently, so accessor byteOffsets -- which are relative to the
    # view -- stay valid without being touched.
    out = bytearray()
    for i, v in enumerate(views):
        if i in replaced:
            data = replaced[i]
            v.pop('byteStride', None)     # images are never strided
        else:
            o = v.get('byteOffset', 0)
            data = bin_[o: o + v['byteLength']]
        while len(out) % 4:
            out.append(0)                 # accessors require 4-byte alignment
        v['byteOffset'] = len(out)
        v['byteLength'] = len(data)
        out += data

    js.setdefault('buffers', [{}])[0]['byteLength'] = len(out)
    js['buffers'][0].pop('uri', None)
    write_glb(out_path, js, bytes(out))
    return notes


def main(argv):
    size = 1024
    quality = 90
    inplace = False
    paths = []
    it = iter(argv)
    for a in it:
        if a == '--size':
            size = int(next(it))
        elif a == '--quality':
            quality = int(next(it))
        elif a == '--inplace':
            inplace = True
        elif a.startswith('--'):
            sys.exit(f'unknown flag {a}')
        else:
            paths.extend(glob.glob(a) or [a])

    if not paths:
        sys.exit(__doc__)

    before = after = 0
    for p in paths:
        out = p if inplace else p.replace('.glb', '.small.glb')
        was = os.path.getsize(p)
        try:
            notes = shrink(p, out, size, quality)
        except Exception as e:                        # a bad export should not
            print(f'{p}: FAILED — {e}')               # stop the rest of a batch
            continue
        if notes is None:
            print(f'{os.path.basename(p)}: nothing to shrink ({was/1e6:.2f} MB)')
            before += was; after += was
            continue
        now = os.path.getsize(out)
        print(f'{os.path.basename(p)}: {was/1e6:.2f} -> {now/1e6:.2f} MB '
              f'({100 - 100*now/was:.0f}% smaller)')
        print('\n'.join(notes))
        before += was; after += now

    if len(paths) > 1:
        print(f'\ntotal: {before/1e6:.1f} -> {after/1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1:])
