# The rendered room — start here

**Paste this at the top of any session working on `assets/board-3d.jpg` or
`tools/render_room.mjs`, and read the whole file before changing anything.**

The prop pipeline is finished. `ROOM-BRIEF.md` covered getting ten models out
of DALL·E and Meshy and into the repo; all ten are through both gates and that
document's job is done. This one covers what happens after: assembling them
into a board, and swapping the painted one out.

| document | covers |
| --- | --- |
| `DINING-ROOM-SPEC.md` | what the room is *for*. The brief and the acceptance test. |
| `DINING-ROOM-3D-RUNBOOK.md` | the process, end to end. Sections 4–6 are this phase. |
| `ROOM-BRIEF.md` | the prop pipeline. **Complete** — read for history, not for work. |
| `refs/room/PROMPTS.md` | the ten prompts, and what each prop taught us. |
| **this file** | the renderer, the flag, and what is left. |

---

## Where we are in one paragraph

`tools/render_room.mjs` assembles all ten props into a 1536×1024 board and
stamps the table numbers on. The result is committed as `assets/board-3d.jpg`
and is **live behind `?board=3d`** — the painted board is still the default, so
nothing has been swapped. Both boards pass `hands`, `hud`, `dpad` and
`contrast`. `board_audit.py --3d` reports every row inside its spec band with
the pickup floor clear, which the painted board has never managed.

The remaining work is judgement, not construction.

---

## The rules of engagement

Carried over from `ROOM-BRIEF.md` because they earned their place and none of
them stopped applying.

1. **Establish what a thing is before reasoning about it.** `whatis.py` on
   every model that arrives. A session once spent two rounds theorising about a
   failed conversion that had never been run.
2. **Never generate a mechanism for something you have not observed.** The
   first marker pass on this renderer reported a depth error of 1.844× — a
   confident number describing nothing, produced by pairing a sorted list of
   wanted points against a sorted list of found ones. The real slope was 1.0002.
3. **The tools are the argument.** Every claim about this room has a command
   behind it. Use it rather than reasoning from the render.
4. **Push to `main`, one commit per change**, reasoning in the message. No PRs
   unless asked. The repo deploys from `main` to GitHub Pages.
5. **Neither account can reach meshy.ai or DALL·E.** Not relevant any more —
   every prop is in — but it is why the pipeline looks the way it does.

---

## The architecture

### Art space and world space

Everything in `LAYOUT` is in **art space**: the board's own 1536×1024 pixel
grid, the same coordinate system `index.html` uses via `A(n) = n * 0.625`.
Nothing in the layout is in world units, on purpose — a table is at art y 631
because that is where it should appear, and the renderer works out where that
is in three.js.

The camera is **orthographic at 34° elevation**, looking at the origin from
+Y +Z. Under that projection two different world displacements both move things
vertically on screen, by different amounts:

| moving… | rises on screen by |
| --- | --- |
| `d` along **Z** (away from camera) | `d · sin(34°)` = `0.559 d` |
| `h` along **Y** (upward) | `h · cos(34°)` = `0.829 h` |

**Conflating those two is the single most likely way to break this file.** They
are separate functions and neither is inlined:

```js
artXToWorld(ax)       // (ax - 768) / PPU              -- no projection at all
artYToWorldZ(ay)      // (ay - 700) / (sin · PPU)      -- a FLOOR position
artHeightToWorld(h)   // h / (cos · PPU)               -- a HEIGHT. Not the same call.
```

`PPU` is 470 pixels per world unit. `ORIGIN_ART_Y` is 700 — where world
`(0,0,0)` lands vertically — and the camera's `setViewOffset` shifts the frame
to put it there.

**The offset's sign is counter-intuitive and was wrong first time.**
`setViewOffset`'s `y` moves the *window* down the frame, so content inside it
appears to move *up*. Wanting the origin lower on screen means a **negative**
offset. Getting it backwards put the whole room 377px too high — exactly twice
the 188px shift, which is the signature of a flipped sign rather than a wrong
magnitude, and is how it was diagnosed.

### Proving the mapping

```
node tools/render_room.mjs --markers
```

Renders coloured discs at known art coordinates with **no props**, so nothing
occludes them. Measure them in the output; they currently land within **1.3px**
across x 256–1280 and y 300–900.

**Run this whenever anything about the camera changes.** One colour per row —
matching found blobs to wanted points by sort order is what produced the
fictitious 1.844× above.

### Scale

Props are scaled by **width**, not height, via `PROP_ART_WIDTH`. Width is the
only axis that maps to screen with no projection factor, so it is both the
constraint that binds and the one with no trigonometry to get wrong.

Scaling by height was tried first and produced **two long benches**: the table
model is 2.5:1, so 104px tall makes it 313px wide against columns 246–268px
apart.

| prop | art px wide | note |
| --- | --- | --- |
| `table` | 190 | 230 left only 16px of floor between back-row tables |
| `counter` | 790 | matches the painted counter |
| `dish-return` | 200 | `BUS_STATIONS` is `A(200)` in index.html |
| `pass-sign` | 170 | |
| `shelf-unit` | 180 | |
| `wall-panel` | 210 | |
| `pendant-lamp` | 80 | |
| `planter` | 130 | |
| `floor-inlay` | 150 | |

### The vertical layout, and why it is not the spec's band table

A table's **screen extent is its height plus its projected depth**. At 190 wide
that is 63 + 76 = **139px**, against the 120px the spec allocates a row. Laid
out on the literal band numbers, the back row's SET DOWN pads landed on top of
the front row's tables.

The spec anticipates this: *"Proportions matter, exact pixels do not — the
game's geometry is remapped to whatever gets built."* So the bands are honoured
in **order and proportion** while the numbers come from the model:

```
pickup floor   430 – 530     pass pads at 480
back row       530 – 669     ROW_BACK  631    barY 522
back pads      669 – 749     padY 709
front row      749 – 888     ROW_FRONT 850    barY 741
front pads     888 – 968     padY 927
margin         968 – 1024
```

Every clearance is ~11px. **If you move any row, recompute all of them** —
`node -e` with the extent formula, or just re-derive from
`extent = width/2.5 · (cos + 1.352/1.899 · sin) · …`; easier to re-run the
arithmetic in the commit history for `4ac63a5`.

Columns are unchanged from `index.html` and should stay that way. The runbook
is explicit that the two rows differing in width is the painting's perspective,
and unifying them is a **game-feel change** — it moves where the player stands.

### Orientation

`upright` is stated per prop, never inferred. Meshy normalises every export so
its longest axis is 1.9, and on all ten props that axis is Y — so
`preview_prop.mjs`'s shortest-axis-is-up guess is wrong more often than right.

- **`'none'`** — nine of ten props. Already Y-up.
- **`'z+'`** — `floor-inlay` only. Lays it down face-**up**. Note `'z'` (−π/2)
  lays it face-**down**; that buried the fossil and left the blank back showing.
- **`yaw: 180` — withdrawn, and it was wrong.** `floor-inlay` carried one on the
  reasoning that laying a standing prop flat turns its own "up" toward the
  camera. But `'z+'` *is* the face-up flip — that is the entire distinction
  between it and `'z'` above — so the extra half turn cancelled the flip that
  was working and restored the one it was meant to fix. It shipped upside-down
  for four commits before Rone caught it. **A flat prop needs `'z+'` and
  nothing else.** Settled by rendering all four yaws: 90 and 270 show the
  medallion edge-on with no fossil at all, and of 0 and 180 only 0 catches the
  key light on the gold corner accents.
- **`flush: true`** — sinks a prop until its top is **0.05 above** the floor, not
  level with it. The medallion is *recessed* into its tile, so a top face at y=0
  puts the carving below the floor plane and it renders as a mottled ghost
  fighting the floorboards.

### The shell

Floor and back wall are **procedural** — canvas textures, six lines of geometry.
Meshy is for objects with silhouettes worth generating.

Floorboards run along **Z**, per the spec's *"floorboards running away from the
camera, which gives depth and scale free"*. On screen that puts the seams
near-vertical. 52 texture repeats; 12 produced 261px bands that read as a
striped floor.

The back wall is **derived**: the counter's front face is pinned to art y 430,
its depth follows from its own model at 790 wide, and the wall clears it by
0.72 world units. Change the counter's width and the wall follows.

**There are no side walls, and that is geometry rather than taste.** A vertical
plane at fixed x runs parallel to the view direction, so an orthographic camera
with no yaw projects it to a line — invisible however it is positioned. Angling
them toward the camera works but a 4.2-long wall turned 20° swings its near end
0.72 units inward and eats the margin the dish returns stand in. The spec closes
the sides with dressing instead: the far left and right margins are where the
planters and floor inlays go.

### Lighting

Copied verbatim from `render_sprites.mjs`. **Change it in both or neither** — a
room lit from a different sun than the cast will always look wrong.

```js
new THREE.AmbientLight(0xffffff, 2.1)
DirectionalLight(0xfff2dd, 2.4) at (-4, 7, 6)   // key, casts shadow
DirectionalLight(0xbcd4ff, 0.7) at (5, 3, -4)   // fill
```

`shadowMap` is on and **not optional**: the spec is explicit that the grounding
problem is not the character's own shadow but that nothing else in the room
casts one. There is a floor plane purely so shadows have somewhere to land.

### Table numbers

One table model placed eight times with a **blank plaque**; digits stamped onto
the finished image at the eight plaque centres. That is why `PROMPTS.md` insisted
the plaque come out blank and why `drawTableNumber` was deleted from
`index.html` — leave it in and every table carries two numbers.

Centres are **projected through three.js's own camera**, not recomputed with the
art→world trigonometry. Deriving the same projection twice is how the two end up
disagreeing by a few pixels nobody can explain later.

Font is `assets/fonts/galindo.woff2`, loaded locally — the render has no network
and Google Fonts would silently stamp eight digits in DejaVu. Baseline is
`alphabetic` plus a measured `actualBoundingBox` offset, because canvas's
`middle` centres the em box and Galindo's digits sit high in theirs (they came
out 11px above their plaques).

---

## The flag

`?board=3d` switches **the board image and the layout geometry together**. That
is the whole point: the painted board's back row is at art y 465 and the
rendered one's at 631, so a rendered board with painted constants puts every
SET DOWN pad 166px off its table.

In `index.html`:

```js
const USE_3D = new URLSearchParams(location.search).get('board') === '3d';
const BOARD_SRC = USE_3D ? 'assets/board-3d.jpg' : 'assets/board.jpg';
const GEO = USE_3D ? { floorTop: 430, … padAtX: true }
                   : { floorTop: 300, … padAtX: false };
```

`FLOOR_TOP`, `R1`, `R2`, `tableDefs`' padX, `PASSES.y` and `BUS_STATIONS.y` all
read from `GEO`. **Temporary** — when the rendered board is accepted this
collapses to the 3D branch and the flag goes.

`USE_3D` also gates two labels. **PICK UP and DISH RETURN are lettered into the
painted board and deliberately carved into neither 3D prop** — `PROMPTS.md` §4:
*"the game draws PICK UP itself, and baked text in a 3D model is text you cannot
change or translate."* The game was never holding up its end because the
painting always had. It does now, on the 3D board only, or the painted one gets
two of each.

---

## Commands

```
node tools/render_room.mjs                          # -> art-source/shots/room.png
node tools/render_room.mjs --markers                # prove the mapping. Do this first.
node tools/render_room.mjs --calibrate              # drops Tyrone in at art y 945
node tools/render_room.mjs --markers --calibrate    # Tyrone alone, for a clean measure
python3 tools/board_audit.py                        # the painted board
python3 tools/board_audit.py --3d                   # the rendered one
BOARD=3d node tools/hands.js                        # and hud, dpad, contrast
```

`art-source/shots/` is **gitignored**. To ship a render:

```
node tools/render_room.mjs --out art-source/shots/room.png
python3 -c "from PIL import Image; Image.open('art-source/shots/room.png').convert('RGB').save('assets/board-3d.jpg', quality=88, optimize=True)"
```

---

## Outstanding — flagged, not fixed

Nothing here blocks anything. All three are Rone's call.

1. **The pendant lamps cross the counter's timber slab.** Occlusion is correct
   (they are in front in z) and it reads like a real diner pass, but the spec
   calls that silhouette sacred. Moving them off it is *not available*: the
   counter occupies art y 170–430 on screen and the tables start at 490, so no
   height a hanging lamp can occupy crosses neither. What is available is fewer
   of them, or moving them to x outside the counter's 373–1163 span. Dropping
   the middle one already freed the counter's cleanest span.
2. **The room is emptier in the middle** than the painted board.
3. **The shadows run longer** than the painted board's, straight off the shared
   key at `(-4, 7, 6)`. Changing it means changing `render_sprites.mjs` and
   re-rendering all twenty character sheets.

### Known imprecision

The calibration character measures **192px with a strict mask and ~210px by
eye** against a 208 target. The residual is measurement noise on his
low-saturation apron, not geometry — but it has never been nailed to one
number, and prop sizes lean on it indirectly. If a prop feels wrong against the
character, suspect this before suspecting the layout.

---

## What is next, in order

1. **Play it.** `?board=3d`, reload to A/B. The spec's acceptance test has five
   items and **three are eyes-only at play size in the browser**: that the
   character grounds naturally, that he is readable in every lane, and that the
   room never competes with him. None can be judged from a flat image, which is
   why the flag exists.
2. **Iterate on whatever that turns up**, re-rendering and re-running both
   boards' harnesses each time.
3. **The swap**, when Rone accepts it:
   - `node tools/render_room.mjs --out` and re-encode over `assets/board.jpg`
   - collapse `GEO` to the 3D branch and delete `USE_3D` / `BOARD_SRC`
   - make the PICK UP and DISH RETURN labels unconditional
   - delete `assets/board-3d.jpg`
   - `board_audit.py` with no flag should then pass
   - re-run the full suite: `hands hud dpad contrast tiers money sfx rush music picker`
   - update `HANDOFF.md`, which still describes the painted board's geometry
4. **After the swap**, `ROOM-BRIEF.md` and this file both become history.

---

## Traps, so they do not bite twice

- **The page is a template literal.** A backtick anywhere inside `PAGE` —
  including in a JSDoc comment or an `rgb()` string — terminates it. Use
  concatenation.
- **Materials are shared across clones.** `tint` must clone the material first
  or every table darkens when the counter does.
- **`gltf-transform` picks its writer off the file extension.** A temp path not
  ending in `.glb` emits glTF-separate: a JSON file, a loose `.bin`, and every
  texture unpacked into the output directory.
- **`set -e` does not survive a pipeline.** The exit status comes from the last
  command, so a cleanup step after a failed conversion runs anyway.
- **`.git` is 877 MB**, mostly raw Meshy uploads that are in history forever.
  Do not push a prop twice.
- **The renderer is not byte-reproducible.** Two runs of the *identical* config
  differ by up to 14 per channel across ~500k pixels (mean 0.7) — swiftshader
  sampling noise, invisible to the eye. So a pixel diff cannot tell you whether
  a layout change took effect: the noise floor is larger than many real edits.
  Measured after a commit message claimed a render was "pixel-identical" to a
  test render, was contradicted by `np.array_equal`, and turned out to be
  identical in geometry all along. Compare crops by eye, or diff the layout,
  not the pixels.
