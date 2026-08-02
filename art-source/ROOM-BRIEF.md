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
python3 tools/shrink_glb.py <file.glb> --inplace         # before committing, always
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
| 2 | `counter` | ✅ **approved** — `refs/room/counter.png` | ⬜ **next action: run Meshy** |
| 3 | `dish-return` | ⬜ | ⬜ |
| 4 | `pass-sign` | ⬜ | ⬜ |
| 5–10 | `pillar`, `wall-panel`, `pendant-lamp`, `planter`, `floor-inlay`, `shelf-unit` | ⬜ | ⬜ |

**No counter GLB exists.** Nothing has been through Meshy since the table. If a
session tells you otherwise, it has misread a file — see rule 1.

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
- **No rig, no animation on props**, so nothing forces a remesh. The table came
  out of Image-to-3D at 28,934 triangles, which is already fine. Only the
  counter gets Remesh 20k, because it is the one carrying the sacred edge.

---

## The next three actions, in order

**1. Counter through Meshy.** The reference is approved and committed at
`art-source/refs/room/counter.png`.

> Image to 3D → **Remesh 20k** → *stop and look at the top edge in Meshy's
> viewer* → Texture → Export GLB.

The viewer check is not optional and is the only place it can be caught. The
reference's serving edge wanders 1.6px across 1493px of length — 0.1% — so it is
straight going in. If it comes back wavy or broken, that is Meshy's doing and it
is a re-roll of the conversion, not of the prompt. Then:

```
python3 tools/whatis.py <download>          # expect: no geometry match, ~5:1
python3 tools/shrink_glb.py <download> --inplace
node tools/preview_prop.mjs art-source/room/counter.glb --textured --with tyrone-t1
```

What the checkpoint is looking for: the top edge still one straight line at 34°;
the front face still reading darker than the top; the base still one continuous
plinth; and the top surface landing near half the character's height.

**Known and already decided:** the reference is about **5.4:1**, not the 6:1 the
prompt asked for. That is not a defect and not a re-roll. It means the counter
runs ~560 art px at the correct height instead of the painted board's 790, and
the answer is to place it at 560–600 and dress the extra wall. The ranked
options are in `PROMPTS.md` §2.

**2. `dish-return` and `pass-sign`.** `PROMPTS.md` §3 and §4, same loop, Remesh
skipped, one of each — both are mirrored in code for the second copy.

**3. Assemble grey.** Write `tools/render_room.mjs` and render four props at
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
