# Interim dining room — prompt

Paste as-is. This is the stopgap board while the proper 3D room is built; it
must be *functionally* correct even though it will be replaced.

---

This is an **interim production background** for Dine-O Dash, a browser game. I
will rebuild this room in 3D later, so it does not need to be beautiful — it
needs to be **functionally correct**, because the game's collision and zone
geometry is mapped onto it and I want to do that mapping only once.

**This image is a gameplay asset, not an illustration. If any artistic choice
conflicts with gameplay readability, gameplay readability wins.**

**Design for the character, not the room. The room exists to showcase the
characters, not the other way round.**

## Theme

This is not a human restaurant decorated with dinosaur objects. It is a
restaurant **designed by dinosaur civilisation**. Furniture, stonework,
carvings, hardware, architecture and decorative language should all read as
having evolved naturally from dinosaur culture. Upscale and civilised, not a
cave and not Jurassic Park.

## Canvas and camera

1536 × 1024, landscape. Fixed high three-quarter camera looking down at the
floor, near-orthographic — very little perspective, so the back row of tables is
nearly the same size as the front row.

**Avoid impossible geometry and painted perspective tricks.** Every
architectural element should be something that could later be modelled in 3D at
essentially the same proportions.

## Layout, top to bottom — non-negotiable

- **y 0–100** — nothing important; the game's score display covers it.
- **y 100–430** — back wall and kitchen counter.
- **y 430–580** — **completely empty, clear, walkable floor. Nothing in this band
  at all.** This is where the player stands to collect orders, and it is the
  single most important requirement in this brief.
- **y 580–700** — four tables.
- **y 700–780** — empty floor in front of them.
- **y 780–900** — four more tables.
- **y 900–990** — empty floor in front of them.

Plus a **PICK UP** marker at each end of the counter, one in each half of the
room, each with clear floor beneath it. A **dish return station against the left
wall and against the right wall**. Eight tables total, two rows of four, with
clear space above each for a number to be drawn.

## The counter

**The counter must read as one long, continuous horizontal serving edge running
left to right, visibly meeting lit floor along its whole length.** Avoid broken
silhouettes, recessed cave openings, dark voids, and pillars or decorative
elements intruding into the serving edge or obscuring where the player stands.

## Grounding

- **Every object touching the floor casts a soft contact shadow** — tables,
  counter, dish returns, everything. Without this the room reads as flat paint
  and characters look like they are floating on top of it.
- **Contact shadows matter more than cast shadows.** A soft dark pool where an
  object meets the ground does more than a long dramatic shadow.
- **One soft directional light from the upper front-left**, warm ambient fill,
  nothing pure black. Pendant lamps are atmosphere only — the shading direction
  stays front-left regardless of where lamps appear.

## Tables

Simple, chunky rectangles with a **strong horizontal front edge** and
uncomplicated bases. Avoid ornate legs, irregular silhouettes, or heavy carvings
that obscure the contact shadow. The front edge is what tells a player whether a
character is standing in front of a table or behind it.

## Scale

The player character is about **208px tall** in this image — a fifth of the image
height. Size tables so the surface sits at roughly **half his height**.

## The walkable floor is quiet

Plain plank or stone flooring, simple grain, low visual noise. **Nothing painted
or placed on it** — no plants, crates, chairs, rugs, fossils or clutter anywhere
a character walks. Set dressing goes on the walls, the counter, or the far left
and right margins only.

The floor should be **darker in value than the characters** so they pop against
it. Desaturate it mentally: the cast should still separate.

## Ornament scale

Decorative motifs must be **40px or larger** at 1536 × 1024 to be recognisable
during gameplay. Anything smaller functions only as texture. Keep decoration
simple and large — fine detail is wasted at play size and richness comes in the
final version.

## Visual hierarchy

1. Pickup lane, tables, dish returns
2. Counter
3. Architecture
4. Decoration

The eye should always find gameplay first.

## Must not contain

No characters, no people, no chairs, no floor clutter, no text except the PICK UP
and DISH RETURN markers, no border, no frame, no vignette, no motion blur, no
depth of field, no lens effects, no infographic panels or annotations.

## Acceptance test

The image succeeds only if, with the character dropped in at game scale:

- He grounds naturally at both pickup stations.
- He grounds naturally at all eight tables.
- He is clearly readable in every walkable lane.
- The pickup lane, both table rows, the drop pads and the dish returns are each
  immediately distinguishable.
- The room never visually competes with him.
