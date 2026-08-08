# Dining room kit — reference image prompts

Ten prompts for step 0 of `DINING-ROOM-3D-RUNBOOK.md`. Generate **all ten in one
session, in order, without leaving**, then save them here and push before opening
Meshy.

They live in the repo rather than in a chat because a chat upload dies with its
session and these are the source for every re-roll.

## How to use them

Paste **the whole style block**, then one object line. Every image. The style
block not being pasted into image seven is how a kit stops looking like one room.

Save each as `art-source/refs/room/<name>.png` — the name in each heading below.

---

## The style block — paste this first, every time

> A single prop for a video game, rendered as one object on a plain mid-grey
> background. Three-quarter view from slightly above, the whole object visible
> and centred, nothing else in frame. No ground shadow, no pedestal, no text, no
> border.
>
> Style: a restaurant designed by dinosaur civilisation — carved basalt, fossil
> framed trim, amber and gold accents, chunky prehistoric joinery. Warm,
> hand-painted storybook look, soft cel shading, muted palette. Upscale, cosy
> and whimsical. Not a cave, not Jurassic Park, no bones strewn about, no vines.

Three details in there are doing real work, so do not trim them:

- **plain mid-grey background** — Image to 3D cuts the object out; a busy or
  white background either bleeds into the model or eats its lightest edges.
- **no ground shadow** — a painted shadow gets modelled as geometry, and you get
  a table with a dark slab fused to its feet.
- **whole object visible** — anything cropped out of frame is guessed at, and
  Meshy guesses badly.

---

## 1. `table.png` — **done**, shipped as `art-source/room/table.glb`

> The object: a chunky rectangular dining table for four. Thick timber top with a
> strong flat front edge, carved stone base, simple uncomplicated silhouette.
> Roughly hip height on a standing person. Set into the middle of the tabletop,
> a carved stone plaque with a raised rim — **the plaque is blank, with no number
> and no marking on it.**

**The plaque must come out blank**, and it is worth re-rolling until it does.
One table is modelled and placed eight times; the number is stamped onto the
plaque afterwards, at the eight positions the renderer already knows because it
put the tables there. Generating eight numbered tables instead means eight
separately-generated models that do not match each other in anything *but* the
number — different proportions, different wood, different plaque — which is a
worse problem than the one it solves.

The three things this has to get right, because the other nine inherit them: a
**hard horizontal front edge** rather than a soft round-over, a **simple base**
that will not blur the contact shadow where it meets the floor, and a top surface
at about **half a character's height**.

### What the first pass taught us

A table draws **144px wide** on the board. The reference is ~1356px wide, so the
scale is 0.106 — and the spec's 40px motif minimum therefore means **a motif has
to be 377px in the reference to be resolvable at all.**

Measured on the first table, exactly one element cleared it:

| element | in the reference | on screen | |
| --- | --- | --- | --- |
| the slate plaque | 560px | 59.5px | motif |
| the frieze panel as a whole | 560px | 59.5px | motif |
| one frieze dinosaur | 190px | 20.2px | texture |
| amber corner cap | 150px | 15.9px | texture |
| leg claw emblem | 150px | 15.9px | texture |

So the useful instruction is not "make the ornament bigger". It is: **on a table,
the plaque is the only thing that can carry identity, and everything else should
be content to be texture.** Carving that competes with it is effort spent below
the resolution the board is displayed at — and the frieze in the first pass was
worse than neutral, because it sat on the front face, which is the one surface
the spec needs reading as a clean strong horizontal so the player can tell
whether they are in front of the table or behind it.

### The near edge has to be painted, not lit

The finding that changes every prompt below. The shared key light sits at
`(-4,7,6)`, which is only **0.10 apart in dot product** between a horizontal top
surface and a vertical front face. So at the camera's 34 degrees, a top and a
front carrying the same material render at nearly the same value and merge into
one mass — the table's front edge survives only as a thin highlight along its
chamfer, and no ambient or shadow setting separates them, because the key is too
frontal to.

The spec asks for a readable near edge on anything the player can stand in front
of. That has to come from the art. **Where a prop has a top surface meeting a
front face, ask for the front face to read darker than the top** — and where it
matters most, ask for a light edge or trim along the join.

---

## 2. `counter.png` — **done**, shipped as `art-source/room/counter.glb`

> The object: a long low serving counter, about six times wider than it is tall.
> One single unbroken horizontal top surface running the full width, in pale
> lit timber. Carved stone front face below it, clearly darker in value than the
> top, with fossil relief and amber trim, and a bright narrow strip of trim along
> the join where the top meets the front. Straight-on three-quarter view with the
> whole length visible.

The unbroken top edge is the whole point — see the spec's "counter silhouette is
sacred". If it comes back wavy or broken, re-roll rather than continuing.

This is the prop the near-edge finding matters most for. The whole pickup
interaction reads off where the counter meets the floor and where its serving
edge is, and it is a 6:1 object, which is where Meshy is weakest.

It was also the only prop a Meshy remesh was ever specified for, and that
instruction went through two reversals before settling. "Remesh 20k" was
written when the plan was to remesh everything at 15k, so it read as *more* —
but Image to 3D handed this one back at 59,204 triangles, which makes 20k a
decimation, aimed at the object whose defining feature is a long straight edge.
Withdrawing it was right. Concluding from that that *nothing* needs decimating
was not: see the note at the foot of this file. Every prop is now decimated
here rather than at Meshy, and the counter is one of only three that arrived
light enough to need none.

### What the reference measured

The object is 1493 × 425 in the frame. Both long edges of the timber slab were
traced per column and fitted to a line; the residual is what "unbroken" means
numerically:

| | residual std | worst | |
| --- | --- | --- | --- |
| serving edge | **1.6px** | 37px | over 1300 columns |
| back edge | 4.0px | 24px | over 1300 columns |

1.6px of wander across 1493px of length is 0.1%. The silhouette is sacred and
this one is straight.

Two earlier attempts at that measurement were wrong in opposite directions and
are worth writing down, because every other long prop will need the same trace.
Taking the **largest contiguous run** of timber per column tracked one *plank*,
not the slab, because the painted seams between planks break the run — it
reported 8px of wobble that was really the run hopping between boards. Taking
the **outermost timber pixel** per column fell through into the amber trim,
whose lit chips keep enough blue to pass a warm-colour test — 72px. What works
is walking down from the back edge and stopping at the first gap wider than a
seam (7px), which steps over plank lines and stops at the trim.

The rest of the brief, checked:

- **top against front face: 4.79:1 in value** (mean rgb 218,149,81 against
  62,53,43). The table managed almost none of this, and it is the whole reason
  the near edge survives a key light that cannot separate the two surfaces.
- **bright trim along the join** — present, continuous, full length.
- **no ground shadow** — 173 pixels outside the object differ from the
  background at all, and only faintly. Nothing for Image to 3D to fuse to the base.
- **ornament clears the 40px minimum**, which on the table only the plaque did.
  A counter draws roughly 494px on screen against a table's 144, so the scale
  from reference to screen is 0.33 rather than 0.106:

  | element | in the reference | on screen | |
  | --- | --- | --- | --- |
  | plesiosaur skeleton | 430px | 142px | motif |
  | triceratops skull | 190px | 63px | motif |
  | ammonite spiral | 180px | 60px | motif |
  | amber diamond | 65px | 22px | texture |

  So the counter is the opposite case to the table: it is big enough on screen
  to carry three separate motifs, and the small amber inlays correctly fall back
  to being surface texture.

### It is nearer 5.4:1 than 6:1, and that is a layout consequence

Measured at mid-span the vertical faces are 249px (18px of slab edge, 231px of
stone) against 1493px of length — 6.0:1 as drawn. But the drawing's camera
compresses the vertical faces and foreshortens the length by different amounts,
and undoing both lands the true proportion at about **5.4:1**.

That is not a re-roll, it is a decision for `render_room.mjs`. The spec fixes the
counter's height, not its length: a top surface at half a 208px character is
about 104 art px off the floor, so a 5.4:1 counter runs **~560 art px** where the
painted board's counter runs 790. Options, best first:

1. **Place it at 560–600px and let the wall either side get dressed.** The spec
   asks for one continuous serving edge with a pickup position at each end and
   clear floor beneath — a 560px counter centred in a 1536px room satisfies all
   of that, and gives the shelf unit and the pass sign somewhere to live.
2. Stretch X by ~1.15 to reach 650px. The ammonite becomes a slightly wide
   ellipse at 60px on screen; survivable.
3. Scale to the painted 790px and accept a top at 146 art px — 70% of the
   character. That is a bar, not a serving counter, and it would occlude the
   ticket plates. Don't.

## 3. `dish-return.png` — **done**, shipped as `art-source/room/dish-return.glb`

> The object: a stone wash station with a deep square basin set into the top,
> chunky prehistoric plumbing and a carved stone body. About waist height.

## 4. `pass-sign.png`

> The object: a small hanging sign board with a large downward-pointing arrow
> carved into it, framed in dark timber and stone. No lettering.

No lettering on purpose — the game draws "PICK UP" itself, and baked text in a
3D model is text you cannot change or translate.

## 5. `pillar.png`

> The object: a carved basalt pillar, square in section, with a fossil-inlaid
> capital at the top and a chunky stepped base.

## 6. `wall-panel.png`

> The object: a rectangular stone wall panel with one large dinosaur skull fossil
> in relief, framed in carved trim. Flat-backed, meant to hang on a wall.

One large motif, not a scatter of small ones: the board displays at 62.5%, so
anything under about 40px in the final render is texture rather than a motif.

## 7. `pendant-lamp.png`

> The object: a hanging pendant lamp with a polished amber shade shaped like a
> smooth egg, dark metal fittings and a short chain.

## 8. `planter.png` — **done**, shipped as `art-source/room/planter.glb`

> The object: a round carved stone planter holding broad prehistoric ferns.
> Foliage contained within the pot's width, not spilling sideways.

Contained on purpose — this goes against a wall, and a wide sprawl reaches into
the walkable floor, which the spec keeps clear.

## 9. `floor-inlay.png` — **done**, shipped as `art-source/room/floor-inlay.glb`

> The object: a circular fossil medallion inlaid flush into a stone floor, seen
> from directly above. Flat, no height, no raised edge.

The only top-down one in the kit. It sits flush in the far left and right floor
margins — never between the table rows, where it would compete with the SET DOWN
pads the game draws every frame.

## 10. `shelf-unit.png` — **done**, shipped as `art-source/room/shelf-unit.glb`

> The object: an open shelving unit in dark metal and stone, holding stacked
> plates and pots, about the height of a doorway.

Back wall dressing behind the counter.

---

## What the whole kit taught us about triangle counts

Meshy's Image to 3D does not ask what the model is for, and across ten props it
handed back anything from **28,934** triangles for the table to **1,637,074**
for the planter. Those two render at about the same size on a 1536x1024
backdrop. The spread is not information, it is noise from the reconstruction.

The three that arrived light — table, counter, dish return — are the ones that
happened to land under budget. Nothing about the prompts caused it.

`shrink_glb.py` cannot fix this, and it is worth being precise about why: on the
four heaviest props the split was **29-61 MB of geometry against ~9 MB of
textures**. Shrinking images is the wrong lever when the mesh is 80% of the file.

So every prop now goes through both, in this order:

```
node tools/simplify_glb.mjs art-source/room/<prop>.glb --target 60000
python3 tools/shrink_glb.py art-source/room/<prop>.glb --inplace
```

On the four newest that was 4,299,368 triangles and 197 MB down to 286,742 and
13.8 MB, bounding boxes unchanged to three decimals and nothing visibly lost at
play size. The floor inlay stopped at 91,900 rather than 60,000 because
meshoptimizer's error bound bit before the ratio did — its fossil relief *is*
the object — and that is the algorithm protecting the silhouette, not a failure.

The four that shipped before this was understood have since been run through
the same two commands — `pass-sign` 302,572 → 60,000, `pillar` 298,326 →
60,000, `wall-panel` 429,724 → 60,000, `pendant-lamp` 264,450 → 60,000. All
four hit the budget exactly, which the four newest did not, because their
originals were an order of magnitude lighter to begin with.

The one worth having checked was the pendant lamp: thin linked geometry is
where decimation bites hardest, and its chain is individual links. At 23% of
the original triangles every link is still distinct. The pass sign's carved
arrow, the pillar's ammonite capital and the wall panel's skull relief all
came through the same way.

**The kit is now 614,880 triangles and 28.4 MB across ten props — 817,418 in a
scene with the table instanced eight times**, down from 1,872,490.
