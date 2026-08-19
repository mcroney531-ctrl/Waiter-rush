# Environment brief — floor, ambience, atmosphere

**Read this before adding any visual detail to the 3D room that isn't a new
prop.** It exists because a version of this brief came back written for a
rendering pipeline this project doesn't have (an SVG layer, composited live,
behind the GLBs), and that version is not buildable here. This one describes
the same goal against the pipeline that actually exists.

---

## Handoff — 2026-08-19, mid-session-limit

Picking this up cold: everything through "static detail + animation layer"
below is **shipped and live** (check `git log --oneline` for the exact
commits, most recent first — each one's message has the reasoning). What's
left is the "new clutter objects" tier, which needs Rone to run DALL-E and
Meshy externally the same way the food items and the floor art did — nothing
in that tier is buildable by a session alone.

**Also open, blocking, needs Rone's eyes before touching again:** Rone asked
for the dish-return's ornate face (the knobs, the ammonite medallion) to
point "outward, toward the tables/restaurant floor" instead of its current
orientation. I tested this properly before reporting back rather than
guessing once and moving on:

- Current (`yaw` unset): the ornate face points toward the camera. Confirmed
  by isolating the prop (`node tools/render_room.mjs --isolate dish-return`)
  and looking at it alone.
- `yaw: 180` (turns the face away from camera, toward the tables): the
  camera then sees the model's **back** — a plain slab, no knobs, no
  medallion. Tested and screenshotted; the knobs are not merely dim, they
  are not there.
- `yaw: ±90` (side-on): shows the basin's side profile instead, and it also
  broke the object's on-screen scale (200×140 art px became 200×198 --
  `PROP_ART_WIDTH` locks scale to bounding-box width, and rotating 90°
  swaps which axis that measures) without reading as "facing the tables"
  either.

The room's camera sits on the same side of the origin as the dish-return
itself (`cam.position.set(0, sin(el)*30, cos(el)*30)`, both positive Z; the
dish-return's art-y 950 is also positive-Z once run through
`artYToWorldZ`) -- so whichever way you rotate this specific prop, "face
the tables" and "stay visible to the camera" pull in opposite directions.
That's a real geometric fact about this model and this camera, not a
one-more-yaw-value-away problem, so I stopped testing rotations rather
than keep guessing and burning renders. **Reverted to the shipped
default (unset yaw) — nothing changed on this point.** Options, for
whoever picks this up: ask Rone which matters more (visible knobs, or
literal "facing" correctness that the camera will never show); or treat it
as a new-GLB job with a differently-modelled back face; or Rone looks at
the isolated renders (still in the scratchpad the session that wrote this
used, or easy to regenerate) and decides it's not actually worth chasing.

**On new clutter objects** (vines, bottles, a "Today's Special" chalkboard,
counter clutter): before writing a vine prompt, re-read
`art-source/refs/room/PROMPTS.md`'s own style block --
**it says "no vines" explicitly**, as a deliberate choice to keep the room
reading as "upscale civilised" rather than "prehistoric jungle." A vine
prompt would contradict the room's own house style, not just add detail to
it. Flag this to Rone before generating anything vine-shaped. The
chalkboard sign and counter clutter (books/bottles/mugs) don't have this
problem -- they're safe to prompt for using the same style block, following
the two-step brief -> per-object prompt pattern that block documents.

**Per Rone's steer partway through this session: stop verifying new room
work against the plain wood floor.** The molten paved floor
(`--lavafloor`) is what's shipped as the 3D board's actual default now: the
wood floor is legacy/unused, not a second thing every change has to pass.

**Standard verification for anything touching `render_room.mjs`,** so it
doesn't have to be rediscovered: `node tools/hands.js`,
`BOARD=3d node tools/hands.js`, `node tools/hud.js`, `node tools/dpad.js`,
`node tools/contrast.js`, `python3 tools/board_audit.py --3d` -- all five
plus the audit have to pass before a board-3d.jpg regeneration ships.
Regenerate the shipped asset with
`node tools/render_room.mjs --lavafloor --out art-source/shots/room.png`
then re-encode with PIL at quality 88 (see any recent commit touching
`assets/board-3d.jpg` for the exact one-liner) -- never commit the raw
render output directly, it's PNG bytes and needs the real JPEG pass.

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
