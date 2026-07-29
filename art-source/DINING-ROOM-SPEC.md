# Dining room — production spec

The brief for the playable board. Paste into DALL·E as-is; regenerate against it
rather than editing the old board.

---

## What this is

A single background image for a browser game. It is not concept art — it is one
fixed, flat backdrop that a 3D-rendered dinosaur character walks around on top
of. The camera never moves, nothing in it animates, and the player character is
drawn over it as a sprite.

**Canvas: 1536 × 1024, landscape.** Fixed high three-quarter camera looking down
at the floor, near-orthographic. Avoid strong perspective — it makes the back
row of tables tiny and breaks the sense that all eight tables are equally
reachable, which the game depends on.

---

## Layout, top to bottom

Proportions matter, exact pixels do not — the game's geometry is remapped to
whatever gets built.

| Band | y (of 1024) | Contents |
| --- | --- | --- |
| HUD overlay | 0–100 | Score and lives are drawn over this. Nothing important. |
| Counter / pass | 100–430 | Back wall and the kitchen counter. **Its front face must visibly meet the floor at the bottom of this band.** |
| **Pickup floor** | **430–580** | **Clear, empty, walkable floor. Nothing in it.** |
| Back row | 580–700 | Four tables |
| Back drop pads | 700–780 | Empty floor in front of each back-row table |
| Front row | 780–900 | Four tables |
| Front drop pads | 900–990 | Empty floor in front of each front-row table |
| Margin | 990–1024 | Bottom edge |

**The pickup floor band is the most important requirement in this document.** The
previous board did not have it — the counter sat directly against the back row of
tables, so the two pickup zones and the back-row tables occupied the same
pixels, and there was physically nowhere to stand at the counter. Everything
awkward about the old board followed from that.

Also needed:

- **Two pickup positions, one in each half of the room**, at the ends of the
  counter, each with clear floor beneath it. Not one central pickup.
- **A dish return station against each side wall**, left and right.
- **Eight tables, two rows of four**, each with room above it for a number plate
  to be drawn.

---

## Lighting and shadow — the part that makes the character belong

The character is a 3D render with real directional light and self-shadowing. If
the room is uniformly lit with nothing casting shadows, he reads as pasted on
top of a painting rather than standing in a room. This is currently the single
most noticeable flaw.

- **Everything on the floor casts a soft contact shadow.** Tables, counter, dish
  returns, anything against a wall. Not dramatic — a soft dark pool where the
  object meets the ground. This establishes that objects in this world touch the
  floor, which is what makes the character's own shadow believable.
- **One consistent light direction: soft and slightly from the upper front-left.**
  State it and hold to it. The character's render lights are matched to it, and a
  room lit from a different direction than the character will always look wrong.
  Overhead-only lighting is the specific thing to avoid, because it produces no
  directional shadow to match.
- **Warm ambient fill** so nothing is in true black.
- **Floorboards running away from the camera**, which gives depth and scale for
  free.
- **Each table needs a readable near edge** — a value step or shadow at its front
  — so it is obvious whether the character is standing in front of it or behind
  it. On a flat floor with no shadows there is no way to tell.

---

## Scale

The character stands **about 154px tall in this image's coordinates**, roughly a
seventh of the image height. Size furniture around that: a table surface should
sit at roughly two thirds of his height, so it reads as a table he is serving
rather than a stool.

---

## Floor colour

The floor needs **value contrast** against the cast, not just hue contrast. The
current honey wood sits at almost the same brightness as the characters, so they
separate only by colour — and hue is the first thing that fails at small sizes,
on poor screens, and for colour-blind players. A floor that is clearly darker or
cooler than the characters is worth more than one that is merely a different
colour. Desaturate the image mentally: the cast should still pop.

---

## Must not contain

- **Anything on the walkable floor except the tables.** There is no collision
  with scenery. Plants, crates, chairs, spilled trays painted on the floor will
  be walked straight through, and it looks broken. Put set dressing against the
  walls or behind the counter.
- **People or other characters.** The cast is drawn separately.
- **Text or signage that needs to be legible**, other than the PICK UP and DISH
  RETURN markers. Table numbers are drawn by the game.
- **Motion blur, vignette, lens effects, or a frame/border.**
- **Chairs at the tables**, unless they are clear of the drop pad floor in front
  of each table.

---

## Style

Match the established Dine-O Dash look: warm, hand-painted, storybook, soft cel
shading with light painterly texture, dark warm-brown outlines of varying
weight. Cosy diner. Muted palette — the characters are the saturated things in
frame, not the room.
