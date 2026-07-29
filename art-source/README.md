# art-source

Source art that produces what ships, but does not ship itself.

Drop rigged, animated `.glb` character exports here and push. Nothing in this
folder is loaded by the game — `index.html` only ever reads the flat PNGs in
`assets/sprites/`, which are generated from these.

## Why this folder exists

Files uploaded into a chat live only as long as that session's container. Once
it is reclaimed the source is gone, and re-rendering a character at a different
scale, camera angle or frame count means asking for the file again. Anything in
here is versioned and survives.

## The loop

1. Export a **rigged and animated** GLB from Meshy — the rig and animate steps,
   not the mesh/texture download. A file with no animation renders 24 identical
   frames, and `render_sprites.mjs` will say so rather than fail quietly.
2. Drop it here as `<character>.glb`, lower case, no spaces.
3. Commit and push.
4. `node tools/render_sprites.mjs art-source/<character>.glb` writes
   `assets/sprites/<character>.png` and a matching `.json` holding the exact
   `playerSheet` config, with the anchor measured from the rendered pixels.
5. Point `playerSheet` in `index.html` at that config.

## Weight

A Meshy export runs about 20 MB, which is fine for one and unremarkable for a
few. If the roster grows to twenty characters across four tiers, move this
folder to Git LFS or a separate repository — the rendered sheets are under
100 KB each and are the only part the game needs.
