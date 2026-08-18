# Environment brief — floor, ambience, atmosphere

**Read this before adding any visual detail to the 3D room that isn't a new
prop.** It exists because a version of this brief came back written for a
rendering pipeline this project doesn't have (an SVG layer, composited live,
behind the GLBs), and that version is not buildable here. This one describes
the same goal against the pipeline that actually exists.

---

## The one fact that decides everything below

There is no runtime 3D scene. `tools/render_room.mjs` runs **offline** — Node,
a headless Chromium, Three.js — once, and bakes the floor, the walls, and
every GLB prop together into one flat image: `assets/board-3d.jpg`. The live
game (`index.html`) never touches Three.js. It loads that one JPEG as a
background and draws 2D canvas UI on top of it. There is no floor layer
compositing under GLBs at runtime, because there is no "at runtime" for any of
this — it is all one picture by the time a player sees it.

That means:

- **A floor layer, wall details, decals, static lighting, ambient
  gradients** — all of this is workable, and cheaply. It's what
  `render_room.mjs` already does for the floor, the walls, and the rug. Add
  more of it the same way: a `paint()` callback drawing onto a canvas, baked
  into the same offline render.
- **Genuine animation** — shimmer, drifting motes, anything that has to
  change frame to frame — cannot live in the baked image at all. It needs a
  small amount of new runtime canvas code in `index.html`, layered over the
  static board the same way the rush telegraph or the floaters already are.
  This is a different, smaller kind of work than the floor/wall work, and it
  should be scoped separately.
- **New physical objects** (vines with real leaf geometry, bottles, a
  standing chalkboard) that need to look like they belong in the same 3D
  space as the existing props — those are new GLBs, same Meshy pipeline as
  the ten already in `art-source/room/`. Slow, multi-day, one prop at a time.
  Don't promise these on the same timeline as a floor pass.

There is no SVG anywhere in this codebase, and introducing it would mean a
second rendering system running alongside the canvas one, with its own
scaling and letterboxing problems the single-canvas approach was built
specifically to avoid. Don't reach for it.

---

## What's already a GLB (leave the geometry alone)

`table`, `counter`, `dish-return`, `pass-sign`, `pendant-lamp`, `wall-panel`,
`planter`, `shelf-unit` — all in `art-source/room/*.glb`, all placed via the
`LAYOUT` array in `render_room.mjs`. Recolouring one of these (the lightstone
texture swap, the tint on the counter) is fair game and already established
practice. Redrawing or replacing its geometry is not what this brief is for.

**Correction to make against any version of this brief that lists "rugs" as a
GLB: they aren't one.** The rug is `paintRug()` — a canvas texture on its own
plane, built entirely in `render_room.mjs`, no Meshy model involved. It has
already been recoloured, rotated, and moved multiple times this project. It
belongs in the "environment, freely editable" bucket, not the "hero object,
hands off" bucket.

---

## Floor

Already carrying real work: the paved-slab lava texture (`--lavafloor`,
`art-source/room/lava-floor.png` + `-emissive.png`), the lightened patches
under tables/dish-return for contrast (`out.placed`-driven radial gradients
in the same render pass). Further floor richness — more fossil impressions,
worn patches away from furniture, edge darkening where large props meet the
floor — is the same technique, more of it: paint onto the tile canvas or the
flat-overlay canvas that already exist, don't invent a new layer to hold it.

## Static ambience

Warm pools under the lamps, extra shadow density, wider ambient gradients —
all of this is a `paint()` call or an addition to the existing vignette pass
in `render_room.mjs`. The room already has real shadow-mapping
(`PCFSoftShadowMap`) and a directional key light shared with the character
sprites; lean on those before adding a second, fake light source drawn by
hand.

## Genuine animation (shimmer, dust) — scope separately

These need a small canvas 2D overlay in `index.html`, drawn every frame,
positioned to line up with where the baked crack glow or lamp light already
sit on `board-3d.jpg`. Cheap, but new runtime code, and it should be asked
for and reviewed as its own thing — not folded silently into a floor-texture
request.

## New clutter objects (vines, bottles, a chalkboard sign)

Only worth it if the payoff justifies a real Meshy pass. If a flatter,
painted-on version would read fine at the room's actual scale (compare to
the fossil wall panels, which are carved relief rather than free-standing
geometry), that's a cheaper route worth trying first — ask before assuming
either path.

---

## Never duplicate geometry

Still the right rule, aimed correctly: if a GLB already renders something
(a lamp, a planter, a rug), don't paint a second version of it into the
floor or wall texture to "enhance" it. Enhance the light around it, the
floor it sits on, or the shadow it casts — not the object itself.

## Goal

Same as the version this replaces: the room should read as meaningfully
richer without any existing GLB's geometry changing. The only thing this
brief corrects is *how* — through `render_room.mjs`'s own canvas-texture
pipeline and, where real animation is wanted, a small scoped runtime
overlay, not a second rendering system.
