# Room build — start here

**Paste this at the top of any session that is going to work on the 3D dining
room, and read the whole file before touching anything.**

This exists because the job spans two accounts and an image generator and a
service none of the sessions can reach, so the same work gets picked up cold by
a session that has none of the context and all of the confidence. Three
documents already describe this job and they are all correct; what was missing
is the one page that says *where we are and what the rules of engagement are.*

- `DINING-ROOM-SPEC.md` — what the room has to be. The brief and the acceptance test.
- `DINING-ROOM-3D-RUNBOOK.md` — how to get from that spec to a shipped `board.jpg`.
- `refs/room/PROMPTS.md` — the ten DALL·E prompts, plus what each finished prop taught us.

Nothing in this file overrides those. It says how to *work*, and where we are.

---

## The rules of engagement

These are not general good practice. Each one is here because breaking it cost
real time on this specific job.

### 1. Establish what a file is before saying anything about it

A GLB named `Meshy_AI_Cragstone_Table_...` arrived described as the first
counter attempt. It was the table — already approved, already shipped, just the
pre-shrink download rather than the committed copy. A session spent a round
declaring the counter a failure, then a second round inventing a mechanism for
the failure ("Meshy regularises extreme aspect ratios toward typical object
proportions, a known failure mode of single-image 3D reconstruction"). No
conversion had ever been run. The theory was invented to explain evidence that
did not exist, and it would have sent the next attempt chasing a problem that
was not there.

**So: run this first, every time, on every model that arrives.**

```
python3 tools/whatis.py <the file>
```

It prints triangle count, world bounding box, longest:shortest ratio, whether
it has been textured yet, and whether its geometry matches something already in
the repo. On the file above it says `SAME OBJECT — art-source/room/table.glb` in
about a second. Filenames and byte counts do not settle this — `shrink_glb.py`
takes the same mesh from 12 MB to 1.4 MB — and neither does looking at a render.

### 2. Two artefacts per prop, and they are judged separately

Every prop passes through two gates, and conflating them produced a "the other
account said N and you said Y" that was really two different objects:

| stage | artefact | judged on |
| --- | --- | --- |
| **A** | the DALL·E **PNG** | shape, aspect, value contrast, ornament size, composition hygiene |
| **B** | the Meshy **GLB** | did the geometry survive, is it upright, what does it measure against a character |

Always name which one you are talking about. "The counter is a no" is not a
sentence anyone can act on.

### 3. Never generate a mechanism for something you have not observed

If a result is confusing, the next move is to establish what happened, not to
explain why it happened. The explanation is cheap to produce and expensive to
act on. Both of the worst errors on this project — the one above, and an earlier
pass that moved eight table anchors that had never moved — were confident
theories built on unverified inputs. In both cases one measurement settled it.

### 4. The tools are the argument

Every claim about this room has a command behind it. Use them rather than
reasoning from the render:

```
python3 tools/whatis.py <file.glb>                     # what is this
node tools/preview_prop.mjs <file.glb> --with tyrone-t1 # is it upright, is it the right size
node tools/preview_prop.mjs <file.glb> --textured       # what actually ships
python3 tools/board_audit.py                            # do the bands and the code agree
node tools/simplify_glb.mjs <file.glb> --target 60000     # before committing, always
python3 tools/shrink_glb.py <file.glb> --inplace         # and this too, in that order
```

### 5. What the sessions cannot do

Neither account can reach `meshy.ai` or DALL·E. Every generation and every
conversion is done by hand, outside the session. So the loop is fixed:

> **you** run the prompt → **you** send the output → **the session** gives a
> verdict, and on a no, an iterative follow-up prompt in the "keep everything,
> change these three things" style → **you** send v2 → repeat → on a yes,
> **you** run Meshy → **you** send the GLB → **the session** runs the checkpoint.

Nothing goes to Meshy without a yes on the PNG. Nothing is committed without
`shrink_glb.py`.

### 6. Push to `main`, one commit per change

This repo deploys from `main` to GitHub Pages. No PRs unless asked. Commit
messages carry the reasoning, not just the change — that is where every finding
in `PROMPTS.md` came from.

---

## Where we are

| # | prop | reference (A) | model (B) |
| --- | --- | --- | --- |
| 1 | `table` | ✅ approved (v2, frieze removed) | ✅ **shipped** — `art-source/room/table.glb`, 28,934 tris, 1.39 MB |
| 2 | `counter` | ✅ approved — `refs/room/counter.png` | ✅ **shipped** — `art-source/room/counter.glb`, 59,204 tris, 2.31 MB, 5.23:1 |
| 3 | `dish-return` | ✅ approved — `refs/room/dish-return.png` | ✅ **shipped** — 60,000 tris, 2.87 MB — **`--upright none`** |
| 4 | `pass-sign` | ✅ approved — `refs/room/pass-sign.png` | ✅ **shipped** — `art-source/room/pass-sign.glb`, 60,000 tris, 2.78 MB — **exported Y-up already; always render with `--upright none`, see below** |
| 5 | `pillar` | ✅ approved — `refs/room/pillar.png` | ✅ **shipped** — `art-source/room/pillar.glb`, 60,000 tris, 2.69 MB — **exported Y-up already; always render with `--upright none`** |
| 6 | `wall-panel` | ✅ approved — `refs/room/wall-panel.png` | ✅ **shipped** — `art-source/room/wall-panel.glb`, 60,000 tris, 2.73 MB — **exported Y-up already; always render with `--upright none`** |
| 7 | `pendant-lamp` | ✅ approved — `refs/room/pendant-lamp.png` | ✅ **shipped** — `art-source/room/pendant-lamp.glb`, 60,000 tris, 2.78 MB — **exported Y-up already; always render with `--upright none`** |
| 8 | `planter` | ✅ approved | ✅ **shipped** — 74,844 tris, 3.61 MB — **`--upright none`** |
| 9 | `floor-inlay` | ✅ approved | ✅ **shipped** — 91,900 tris, 4.42 MB — **no override; the default guess is right, see below** |
| 10 | `shelf-unit` | ✅ approved | ✅ **shipped** — 59,998 tris, 2.85 MB — **`--upright none`** |

**All ten props are through both gates.** The kit is 614,880 triangles and
28.4 MB; the scene with the table instanced eight times is 817,418. If a
session tells you the counter GLB doesn't exist, or that it's table-shaped,
it's reading a stale copy of this file or a mislabelled upload — see rule 1.

The last four arrived named after Meshy's own inventions and were matched to
props by rendering them, not by reading the names: `Emberstone_Basin` →
`dish-return` (basin in the top, prehistoric plumbing, ammonite relief),
`Emberstone_Pantry` → `shelf-unit`, `Lush_Kale_in_a_Jewele` → `planter`, and
`Jurassic_Crest` → `floor-inlay`, which was the only ambiguous one: stood up
it reads as a second wall panel, and only laid flat does it resolve as a floor
medallion.

**Seven of the ten need an upright override — `pass-sign`, `pillar`,
`wall-panel`, `pendant-lamp`, `dish-return`, `planter` and `shelf-unit`.** `preview_prop.mjs`'s shortest-axis-is-up
guess assumes an object is wider and deeper than it is tall — true for a
table or counter, false for anything whose *shortest* dimension isn't its
height. Four different ways that assumption has broken so far:

- **pass-sign** — a flat hanging sign, shortest axis is its own thickness.
  Guessed wrong, laid it on its side (the carved arrow visibly rotated
  through down/right/up/left across the four yaws instead of staying down).
- **pillar** — square in section (`0.685 x 1.9 x 0.685`), shortest axis
  is a tie between X and Z, not the actual height. Guessed `x`, laid it on
  its side with the capital pointing sideways in two of the four yaws.
- **wall-panel** — a flat plaque (`1.9 x 1.229 x 0.336`), shortest axis is
  its own thickness again. Guessed `z`, flattened it into a tabletop
  plaque — the skull motif showed from a steep raking angle instead of
  face-on, exactly like looking down at a table rather than at a hung
  panel.
- **pendant-lamp** — square in section like the pillar
  (`0.765 x 1.898 x 0.766`). Guessed `x`, laid the whole fixture on its
  side so the chain ran horizontal like a flail instead of hanging down.
- **dish-return** (`1.888 x 1.595 x 1.336`), **planter**
  (`1.615 x 1.900 x 1.598`) and **shelf-unit** (`1.586 x 1.899 x 0.607`) —
  all three are Y-up and all three have a shortest axis that is not their
  height. Meshy normalises every export so its longest axis is 1.9, and in
  practice that axis has been Y on all ten props, which is why `none` is the
  right answer far more often than the guess is.

**`floor-inlay` is the exception, and it was predicted.** Its bbox is
`1.899 x 1.899 x 0.938`, so the guess picks `z` and stands it up — where it
reads as a second wall panel. Laid flat, which is what the guess produces if
you *don't* override it, it resolves into what it is: a stone tile with a
fossil skeleton in a recessed oval, seen from above. This is the one prop
where the "wrong" orientation is the wanted one, so it takes no override at
all.

All four were already exported Y-up; the heuristic just has no way to
tell a genuinely short vertical object from a flat or square one lying
with its thin axis pointed the wrong way. `preview_prop.mjs` takes
`--upright x|y|z|none` to override the guess — all four of these want
`none`. Check any tall, thin, flat, or otherwise non-table-proportioned
prop the same way: render once with no override, look at whether a
directional feature (an arrow, a face, a repeated motif, a hanging chain)
stays consistent/vertical across yaws, and use the override if it
doesn't. At this point assume every remaining prop (`planter`,
`floor-inlay`, `shelf-unit`) will need the same check — only the table and
counter, both genuinely wider/deeper than tall, have guessed correctly so
far. `floor-inlay` is a special case worth pre-empting: it's meant to be
seen from directly above (flush in the floor), so for that one the
"guessed wrong" render may actually be the desired orientation — judge it
against the reference's top-down framing, not against "does it stand up."

Also open, and bigger than any single prop: **`tools/render_room.mjs` does not
exist.** It is the scene assembler, and it is the piece that makes this whole
job worth doing. Runbook §6 specifies it.

### Settled questions — do not reopen these

- **Meshy Scene is not the renderer.** It is an image generator steered by a
  rough 3D layout (its own panel names the model: Nano Banana). No pixel-exact
  placement, no arbitrary 1536×1024 orthographic frame, and every render
  reinterprets the room instead of projecting it — which throws away the entire
  point, that a table lands at y 620 *because the code put it there*.
  `render_room.mjs` gets written by hand.
- **One table model, instanced eight times**, plaque blank, digits stamped onto
  the final image at the eight plaque centres the renderer already knows.
- **The counter is one long object**, not a tiled segment with caps. The seam
  would land on the silhouette the spec calls sacred, and the usual fix — a
  pillar over the join — is the one thing forbidden on that edge.
- **No Meshy remesh — decimate here instead, to a 60k budget.** This has been
  wrong twice and the current answer is measured. Meshy's own Remesh stays out:
  it means generating again and pulling another 40-70 MB through the transfer
  path, and it is not reproducible from the repo. But "so leave the triangles
  alone" was a conclusion drawn from a sample of one, the table's 28,934, and
  the rest of the kit destroyed it — Image-to-3D handed back 791k for the dish
  return and **1,637,074 for the planter**, a 56x spread between props that
  render at about the same size. `shrink_glb.py` cannot help, because the bulk
  is mesh: 29-61 MB of geometry against ~9 MB of textures per file.

  ```
  node tools/simplify_glb.mjs art-source/room/<prop>.glb --target 60000
  python3 tools/shrink_glb.py art-source/room/<prop>.glb --inplace
  ```

  Both, in that order, on every prop. It took the four newest from 4,299,368
  triangles and 197 MB to 286,742 and 13.8 MB, with the bounding boxes intact
  to three decimal places and no visible loss at play size.

---

## The next actions, in order

**1. Counter — done.** Shipped as `art-source/room/counter.glb`. Checked
against all four things the checkpoint asks for on a long prop: top edge one
straight line at 34°, front face reading darker than the top, base as one
continuous plinth, and it measures 5.23:1 against a character — close to the
reference's own 5.4:1, so the conversion didn't distort it.

That fourth check also caught a real bug in this document, worth recording so
it doesn't come back: an earlier version of this checkpoint asked for "the top
surface landing near half the character's height," copied from the *table's*
line in `DINING-ROOM-3D-RUNBOOK.md` §Step 1. That line is table-only —
`DINING-ROOM-SPEC.md`'s "half his height" sentence names tables specifically
and says nothing about the counter, and the counter's own prompt in
`PROMPTS.md` §2 asks for a **low** counter by name ("a long low serving
counter, about six times wider than it is tall"). The shipped counter measures
21% of a character's height. That is squat by design, not a defect — it is
what "low" and "six times wider than tall" both mean. Don't re-flag it.

**Known and already decided, separately:** the reference is about **5.4:1**,
not the 6:1 the prompt asked for. Also not a defect. It means the counter runs
~560 art px at the correct height instead of the painted board's 790, and the
answer is to place it at 560–600 and dress the extra wall. The ranked options
are in `PROMPTS.md` §2.

**2. `pass-sign` — done.** Shipped as `art-source/room/pass-sign.glb`. Exported
Y-up (unlike the table and counter) — see the upright-override note above
before re-previewing it.

**3. `pillar` — done.** Shipped as `art-source/room/pillar.glb`. Same
upright-override case as the pass-sign: default guess picked axis `x` and
laid it on its side, `--upright none` confirmed correct (capital, fluted
shaft and plinth hold steady across all four yaws). Measures 112% of a
character's height (1.9 vs 1.7) — expected and not a defect, since the
pillar is a floor-to-ceiling architectural element, not a work surface;
the table's "half a character's height" rule in `DINING-ROOM-SPEC.md`
never applied to it. Don't re-flag it.

**4. `wall-panel` — done.** Shipped as `art-source/room/wall-panel.glb`.
Same override case, different failure shape: it's a flat plaque, not a
tall column, so the default guess (`z`, its own thickness) flattened it
into a tabletop instead of standing it up. `--upright none` confirmed
correct — front face shows the skull relief face-on, back is plain flat
stone (matches the prompt's "flat-backed"), both edge views read as a
thin panel rather than a slab lying down. Measures 72% of a character's
height; no spec ratio applies to a wall panel (level-2/3 dressing, not a
work surface), so this isn't compared against the table's 50% line.

**5. `pendant-lamp` — done.** Shipped as `art-source/room/pendant-lamp.glb`.
Same override case as the pillar (square in section, `0.765 x 1.898 x
0.766`): default guess picked `x` and laid the whole fixture on its side,
chain running horizontal like a flail. `--upright none` confirmed
correct — chain hangs straight down from a ceiling plate to the amber
shade, holds steady across all four yaws. Measures 112% of a character's
height, which is expected (full ceiling-to-shade chain length, not a
tabletop object) and not compared against the table's 50% line.

**6. `dish-return` — next action.** Reference approved at
`refs/room/dish-return.png`. Same loop as the others, Remesh skipped:

```
python3 tools/whatis.py <download>
python3 tools/shrink_glb.py <download> --inplace
node tools/preview_prop.mjs art-source/room/dish-return.glb --textured --with tyrone-t1
# render once first without --upright to see whether the guess got it right --
# a wash station is squarer than a table or counter, closer to the case that
# breaks the heuristic. Add --upright none (or x/z) if a directional feature
# doesn't hold steady across the four yaws.
```

**7. Assemble grey.** Write `tools/render_room.mjs` and render four props at
their spec positions with no walls, no lamps, no dressing.

```
node tools/render_room.mjs --grid
python3 tools/board_audit.py
```

**The room is either right or wrong at this point**, and no amount of fossil
trim changes it. Fixing geometry after the dressing is in means re-rendering
everything.

---

## The three numbers everything inherits

Copied from `render_sprites.mjs`, not re-derived. A room lit from a different
sun than the cast will always look wrong.

```js
// orthographic camera, 34° elevation
scene.add(new THREE.AmbientLight(0xffffff, 2.1));
const key  = new THREE.DirectionalLight(0xfff2dd, 2.4); key.position.set(-4, 7, 6);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7); fill.position.set(5, 3, -4);
```

Scale is set empirically, not by arithmetic: drop a real character GLB in, render,
and tune world-units-per-pixel until he measures **208px tall in the 1536×1024
frame**. Delete him before the final render.

And the one thing the room must do that the painted board never could: **enable
`renderer.shadowMap` and give the key a shadow camera.** The spec is explicit
that the grounding problem is not the character's own shadow, it is that nothing
else in the room casts one. It is also the reason the counter's near edge
survives at all — that key is only 0.10 apart in dot product between a
horizontal top and a vertical front face, so contact shadow does work no amount
of shading will.
