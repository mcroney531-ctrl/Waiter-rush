# Rebuilding the dining room in 3D

How to replace `assets/board.jpg` with a rendered room that matches
`DINING-ROOM-SPEC.md`, using Meshy for the models and the renderer already in
`tools/` for the scene.

Read `DINING-ROOM-SPEC.md` first. That document says what the room is for. This
one says how to build it, and why the current one does not comply.

---

## 1. What is actually wrong with the shipped board

Not the art. The geometry.

Run the audit to see it (writes `art-source/shots/board-audit.png`):

```
python3 tools/board_audit.py
```

It draws the spec's bands down the left of the current board and the positions
the game reads off it down the right. Three things fall out:

**The pickup floor band does not exist.** The spec's single loudest requirement
is a clear, empty, walkable strip between the counter and the back row, at
y 430–580 of 1024. On the shipped board the back row of tables sits at y 465 —
inside it. There is nowhere to stand at the counter that is not also in front of
table 1, which is why `FLOOR_TOP` is 300: the player has to overlap the
counter's lower face to reach the pass at all.

**Everything is 45–115px high.**

| band | spec | painted | out by |
| --- | --- | --- | --- |
| back row | 580–700 | 465 | 115px high |
| back pads | 700–780 | 590 | 110px high |
| front row | 780–900 | 700 | 80px high |
| front pads | 900–990 | 855 | 45px high |

**And the room it was pulled up into is empty.** Below y 900 there is roughly
120px of floor doing nothing. The compression at the top is not because the
room ran out of space; it is because the counter's front face meets the floor at
y ≈ 300 instead of 430, and every band below inherited the error.

So the fix is not "move the tables down a bit". It is: make the counter as tall
as the spec says, then let the two rows sit where they were always supposed to,
using the bottom margin that is already there.

---

## 2. The thing worth changing about the process

Right now the game's geometry is **measured off a painting**. `index.html` says
so out loud:

> the two rows are not evenly spaced and the front row is wider than the back —
> that is the art's perspective, and the game follows it rather than fighting it

That was the correct call for a painted board. It stops being the correct call
the moment the room is rendered, because a rendered room can be built *from* the
constants instead. Do it in that order and the board cannot be out of spec: the
tables are at y 620 because the code put them at y 620.

This is the main reason to do it in 3D at all. Matching art is a bonus; not
having to remap geometry ever again is the point.

---

## 3. What Meshy makes, and what it does not

Meshy generates **one object at a time**. It does not generate a room with a
fixed camera, and asking it to will produce a picture of a room, not a room.
So it makes the kit and the scene is assembled in code:

| piece | notes |
| --- | --- |
| `table` | one model, instanced eight times. Chunky rectangle, strong front edge, simple base — see the spec's Scale section. |
| `counter-segment` | tiled left to right. The serving edge must be one unbroken horizontal, so model a segment that repeats without a visible seam. |
| `counter-end` | left and right caps. |
| `dish-return` | one model, mirrored for the second. |
| `pass-marker` | the PICK UP sign, ×2. |
| `pillar`, `wall-panel`, `pendant-lamp`, `planter`, `fossil-inlay` | level-2 and level-3 dressing. Wall and margin only. |

Two Meshy specifics carried over from the food work:

- **No rig, no animation.** Same as food, which means **nothing forces the
  remesh** — do the Remesh 15k step deliberately or you will get a
  quarter-million-triangle table.
- Everything comes out of Meshy at an arbitrary scale and orientation. Normalise
  on import; do not eyeball it in the scene.

Then shrink the textures, exactly as for food and characters:

```
python3 tools/shrink_glb.py art-source/room/table.glb --inplace
```

These are background props seen at one fixed size — 1024 maps is generous.

---

## 4. Matching the characters

The room and the cast have to agree on three things or the character reads as
pasted on. All three are already fixed by `tools/render_sprites.mjs`; copy them,
do not re-derive them.

**Camera: orthographic, 34° elevation.** `render_sprites.mjs` uses
`OrthographicCamera` with `--elev 34`. Orthographic is not a stylistic choice
here — the spec asks for near-orthographic so the back row is not tiny, and a
sprite rendered orthographically composited into a perspective room is wrong at
every position except the one it was tuned at.

**Light rig: copy it verbatim.**

```js
scene.add(new THREE.AmbientLight(0xffffff, 2.1));
const key  = new THREE.DirectionalLight(0xfff2dd, 2.4); key.position.set(-4, 7, 6);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7); fill.position.set(5, 3, -4);
```

Key from the upper front-left, which is what the spec's lighting section is
describing. `render_food.mjs` already carries a note that this rig is shared and
must be changed in both or neither; the room joins that list.

**Scale: set it empirically, not by arithmetic.** Drop a real character GLB into
the scene at a table, render, and tune world-units-per-pixel until he measures
**208px tall in the 1536×1024 frame** (the spec's figure, itself measured off
the shipped Tyrone sprite). A table surface should then land at roughly half
that. Delete him before the final render.

Unlike the painted board, the room **must** cast shadows — enable
`renderer.shadowMap` and give the key light a shadow camera. The spec is explicit
that the grounding problem is not the character's own shadow but that nothing
else in the room casts one. In 3D that is free; take it.

---

## 5. The layout, as code

The room is assembled from the same numbers `index.html` uses, in art-space
(1536×1024), converted to world units by whatever scale step 4 landed on.

Targets, from the spec's bands:

| what | art y | note |
| --- | --- | --- |
| counter front face meets floor | 430 | the number everything else depends on |
| pickup floor | 430–580 | empty. No props, no inlay, no shadow of the counter reaching the tables |
| back row table centre | ~620 | occupies 580–700 |
| back drop pads | ~740 | occupies 700–780 |
| front row table centre | ~840 | occupies 780–900 |
| front drop pads | ~945 | occupies 900–990 |

Columns: keep the existing x positions. They work, the plates read, and moving
them costs a retune for nothing. Back row 406 / 652 / 902.5 / 1154, front row
374 / 638 / 906.5 / 1173.5.

The two rows currently differ in width because that is what the painting did.
Once the room is rendered orthographically that inversion can go: pick one
spacing and let both rows use it. **This is a game-feel change, not a cosmetic
one** — the front row being wider is currently baked into where the player has
to stand — so change it deliberately and re-run `tools/hands.js`, or keep both
rows as they are and only move them vertically. Moving them vertically is the
smaller, safer change and fixes the actual defect.

Then update `index.html` to match: `FLOOR_TOP` goes to `A(430)`, `counterRect.h`
to `A(430)`, `PASSES.y` onto clear floor at about `A(500)`, and `R1`/`R2` to the
table above. Every one of those is a constant in one place.

---

## 6. Rendering it

A new `tools/render_room.mjs`, sibling to `render_sprites.mjs` and
`render_food.mjs` and built the same way — a headless page, three.js, GLTFLoader,
Playwright, screenshot out. The two existing renderers are the template; the only
new parts are loading several models instead of one and placing them from a
layout table.

```
node tools/render_room.mjs --out assets/board.jpg
node tools/render_room.mjs --grid        # spec bands burned in, for checking
```

Output is 1536×1024 to match `ART_W`/`ART_H`. JPEG is fine and is what ships now
— there is no transparency in a backdrop.

---

## 7. Acceptance

The spec's acceptance test is the real one, and it is judged in the running game.
Two of its five items are now mechanical:

```
python3 tools/board_audit.py     # bands and anchors agree
node tools/dpad.js               # controls still clear the art
node tools/hud.js                # the tips sign still clears the furniture
node tools/hands.js              # pickup and delivery still work at every station
```

`hud.js` matters more than it looks: the tips sign is drawn on the board at a
fixed rectangle and its checks assert it clears both passes, both dish returns
and all eight set-down pads. Move the furniture and that is exactly what breaks.

The three items no harness can judge — that the character grounds naturally, that
he is readable in every lane, that the room never competes with him — are eyes
only. Do them at play size, in the browser, not on the 1536px render.

---

## 8. Order of work

1. `tools/board_audit.py` on the current board, so the target is measured rather
   than argued about. *(This step is done — the numbers are in section 1.)*
2. One Meshy table. Shrink it, render it alone at 34°, drop a character beside
   it, check the height ratio. **Stop here if it does not sit right** — every
   other model inherits this decision.
3. The counter, as a repeating segment plus two ends. This is the hard one: the
   spec calls the unbroken serving edge sacred, and a tiled model with a seam
   fails on the one silhouette that has to be perfect.
4. Dish returns, pass markers.
5. Assemble and render grey, no dressing. Check the bands. **The room is either
   right or wrong at this point** and no amount of fossil trim changes it.
6. Walls, pillars, lamps, planters, inlay — level 2 and level 3, floor kept
   quiet, ornament kept above the 40px minimum from the spec.
7. Re-render, update the constants, run the harnesses, judge in the browser.
