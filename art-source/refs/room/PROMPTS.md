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

## 1. `table.png` — do this one first

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

## 2. `counter.png`

> The object: a long low serving counter, about six times wider than it is tall.
> One single unbroken horizontal top surface running the full width. Carved stone
> front face with fossil relief and amber trim. Straight-on three-quarter view
> with the whole length visible.

The unbroken top edge is the whole point — see the spec's "counter silhouette is
sacred". If it comes back wavy or broken, re-roll rather than continuing.

## 3. `dish-return.png`

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

## 8. `planter.png`

> The object: a round carved stone planter holding broad prehistoric ferns.
> Foliage contained within the pot's width, not spilling sideways.

Contained on purpose — this goes against a wall, and a wide sprawl reaches into
the walkable floor, which the spec keeps clear.

## 9. `floor-inlay.png`

> The object: a circular fossil medallion inlaid flush into a stone floor, seen
> from directly above. Flat, no height, no raised edge.

The only top-down one in the kit. It sits flush in the far left and right floor
margins — never between the table rows, where it would compete with the SET DOWN
pads the game draws every frame.

## 10. `shelf-unit.png`

> The object: an open shelving unit in dark metal and stone, holding stacked
> plates and pots, about the height of a doorway.

Back wall dressing behind the counter.
