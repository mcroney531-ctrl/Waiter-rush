# Dining room — production spec

The brief for the playable board, and the house style for every room after it.
Paste into DALL·E as-is; regenerate against it rather than editing an old board.

---

## What this is

A single background image for a browser game. It is not concept art — it is one
fixed, flat backdrop that a 3D-rendered dinosaur character walks around on top
of. The camera never moves, nothing in it animates, and the player character is
drawn over it as a sprite.

**This is a gameplay asset, not an illustration. Where an artistic choice
conflicts with gameplay readability, readability wins.** And the sentence that
summarises everything below: **design for the character, not the room — the room
exists to showcase the cast, not the other way round.**

**Canvas: 1536 × 1024, landscape.** Fixed high three-quarter camera looking down
at the floor, near-orthographic. Avoid strong perspective — it makes the back
row of tables tiny and breaks the sense that all eight tables are equally
reachable, which the game depends on.

**Avoid impossible geometry and painted perspective tricks.** Every
architectural element should be something that could be modelled in 3D at
essentially the same proportions. The room is going to be rebuilt in 3D, and
matching proportions mean the game geometry is mapped once rather than twice.

---

## Art direction

**Dinosaurs invented diners.** This is the north star. Not a human restaurant
decorated with dinosaur objects — a restaurant **designed by dinosaur
civilisation**. Furniture, stonework, carvings, hardware, architecture and
decorative language should all read as having evolved from dinosaur culture.
Stated weakly, a generator drifts straight back to a chain diner with fossils on
the wall. These are professional restaurateurs, and
the room should feel civilised, premium and whimsical.

> Nintendo polish × cosy storybook diner × prehistoric civilisation.

What that looks like in practice: carved basalt pillars, fossil-framed trim,
amber and gold accents, chunky prehistoric joinery, pendant lamps like polished
amber or fossilised eggs, table bases like carved trunks or stacked stone,
wall art that is dinosaur-themed menus and fossil displays rather than generic
restaurant décor.

**What to avoid: full Jurassic Park.** No bones strewn about, no vines
reclaiming the room, no primitive cave aesthetic. This is upscale dining that
happens to have evolved among dinosaurs.

---

## Visual hierarchy

The rule that resolves every conflict below. **A player must never notice a
fossil carving before they notice where table 6 is.**

**Level 1 — instant read.** The character, the eight tables, the two pickup
zones, the dish returns, the walkable lanes. Highest contrast and saturation
belongs to the characters; gameplay objects come second.

**Level 2 — environment identity.** Counter, walls, lighting, trim,
architecture. These frame the gameplay without competing with it.

**Level 3 — reward detail.** Fossils, amber, carved crests, the little touches of
dinosaur civilisation. These enrich the room and are noticed on the second or
third look, never the first.

And the tiebreaker: **if an element hurts gameplay readability, simplify or
remove it regardless of how good it looks.**

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
tables, so the two pickup zones and the back-row tables occupied the same pixels
and there was physically nowhere to stand at the counter. Everything awkward
about the old board followed from that one missing band.

Also needed:

- **Two pickup positions, one in each half of the room**, at the ends of the
  counter, each with clear floor beneath it. Not one central pickup.
- **A dish return station against each side wall**, left and right.
- **Eight tables, two rows of four**, each with room above it for a number plate
  to be drawn.

### The counter silhouette is sacred

Gameplay first, theme second. Wrap it in carved stone, fossil trim and amber
accents as much as you like, but underneath it must remain **one long, continuous
horizontal serving edge running left to right, visibly meeting lit floor along
its whole length.** No broken silhouettes, and no pillars or ornament intruding
into the serving edge or obscuring where the player stands.

Specifically: do not make the pass a cave mouth or a dark recessed opening. A
shadowed, receding counter front is exactly the ambiguity that broke the last
board — if the floor line disappears, there is nowhere to put the pickup zones.

---

## Lighting and shadow

The character is a 3D render with real directional light and self-shadowing. If
the room is uniformly lit with nothing casting shadows, he reads as pasted on top
of a painting rather than standing in a room. On the current board this is the
most noticeable flaw, and the cause is not his shadow — it is that **nothing else
in the room casts one**, so the floor reads as flat paint rather than ground.

- **Everything on the floor casts a soft contact shadow.** Tables, counter, dish
  returns, anything against a wall. This establishes that objects in this world
  touch the floor, which is what makes the character's own shadow believable.
- **Contact shadows matter more than cast shadows.** A soft dark pool where an
  object meets the ground does more work than a long dramatic one. Grounding is
  the problem; drama is not.
- **One directional light: soft, from the upper front-left.** The sprite renderer
  is matched to it. A room lit from a different direction than the character will
  always look wrong.
- **Fake it, deliberately.** The amber pendants provide warm atmosphere and glow,
  but they are *not* the shading direction. Overhead light casts no directional
  shadow to match, so the room's directional shading comes from the front-left
  regardless of where the lamps appear to be. This is not physically accurate and
  players accept it instinctively.
- **Warm ambient fill** so nothing is in true black.
- **Floorboards running away from the camera**, which gives depth and scale free.
- **Each table needs a readable near edge** — a value step or shadow at its front
  — so it is obvious whether the character is standing in front of it or behind
  it. On a flat unshadowed floor there is no way to tell, and "am I on the pad" is
  a decision the player makes constantly.

---

## Ornament has a minimum size

The board is displayed at 62.5% of this canvas — 1536 × 1024 becomes 960 × 640 on
screen. So:

- Detail under **~16px** in this image is mush at play size. Fine as texture,
  useless as a recognisable motif.
- A motif needs **40px or more** to be identifiable as a fossil, a claw mark, a
  spiral.
- For scale: the character is 208px tall, so a 40px motif is about the size of his
  head and an 80px one is his whole torso.

Use large motifs to carry identity and let the small carvings become surface
texture. Do not spend effort on detail nobody can resolve.

---

## The walkable floor is quiet

Visual richness belongs on the walls, counter, trim, shelving, ceiling and the
side margins. The floor the player walks on should be **visually boring on
purpose**.

Two reasons, and the second is easy to miss:

1. **There is no collision with scenery.** Plants, crates, chairs or spilled
   trays painted on the walkable floor get walked straight through, and it looks
   broken.
2. **The game draws its own floor markings** — SET DOWN pads in front of every
   table, PICK UP pads at the counter. Those are functional UI the player reads
   constantly, and floor ornament competes with them directly.

So the genuinely safe area for floor decoration is the **far left and right
margins**, not the space between the table rows. Fossil inlays there are welcome.

---

## Scale

The character stands **about 208px tall in this image's coordinates**, a fifth of
the image height. Measured from the shipped Tyrone sprite, not estimated — he
renders 130px tall on a 640px canvas, and this image is displayed at 62.5%.

Size furniture around that: **a table surface should sit at roughly half his
height**, which reads as hip height and looks like a table he is serving rather
than a stool. On the current board the tables land at 49% of him, which is right
— so match the existing proportion rather than shrinking them.

Tables should be **simple chunky rectangles with a strong horizontal front edge
and uncomplicated bases.** Ornate legs, irregular silhouettes and heavy carving
all obscure the contact shadow, and the base is exactly where that shadow lives.
Carved stone is on-theme; keep it from blurring where table ends and floor
begins.

---

## Floor colour

The floor needs **value contrast** against the cast, not just hue contrast. The
current honey wood sits at almost the same brightness as the characters, so they
separate only by colour — and hue is the first thing that fails at small sizes,
on poor screens, and for colour-blind players. A floor clearly darker or cooler
than the characters is worth more than one that is merely a different colour.
Desaturate the image mentally: the cast should still pop.

---

## Must not contain

- **Anything on the walkable floor except the tables.** See above.
- **A dark or recessed counter front** that hides where the counter meets the
  floor.
- **People or other characters.** The cast is drawn separately.
- **Text or signage that needs to be legible**, other than the PICK UP and DISH
  RETURN markers, and the table numbers — see below.
- **Motion blur, vignette, lens effects, or a frame/border.**
- **Chairs at the tables**, unless they are clear of the drop pad floor in front
  of each table.

---

## Table numbers live on the table

Revised. This document originally said table numbers were drawn by the game and
must not appear in the art, and the code still carries `drawTableTag` for that
reason. The room now carries a **carved stone plaque set into each tabletop**
with the number on it, because a number that belongs to the furniture reads as
part of the restaurant where a floating badge reads as a HUD element pointing at
it.

Two things that follow, and the second is the one that costs something.

**The plaque is modelled blank and the digit is stamped on afterwards.** One
table model, placed eight times, numbered at composite time at the eight
positions the renderer already knows because it placed them. Generating eight
numbered tables gives eight models that differ in everything *but* the number.

**`drawTableNumber` has to go.** The game draws a teal card on every tabletop
every frame, offset to `t.x - A(50)`. Leave it in and every table has two
numbers. Deleting it costs the ability to renumber tables from code, which is
worth nothing here — `tableDefs` is eight fixed ids and always has been.

**The contrast drops, modestly.** Measured by splitting the plaque into ink and
face: the carved digits run **2.8–3.5:1**, where the card the game draws today
is **5.0:1** by construction (`#F4EEDB` on `#2F6F6B`). The carved digit is
physically larger, so side by side it still reads clearly; the card is louder
because it is a UI element rather than a thing in the room. Keep the digit dark
against a pale plaque, keep the plaque the lightest thing on the tabletop, and
judge it at play size rather than on the 1536px render.

**It does not change the memory mechanic.** The floor labels are permanently
visible in both versions — they are how you *find* table 6, not how you remember
it. What fades is the order ticket, and that is drawn by `drawTableTag`, which
stays: it also numbers a carried plate, which is where the player reads it under
pressure.

---

## Style

Warm, hand-painted, storybook. Soft cel shading with light painterly texture,
dark warm-brown outlines of varying weight. Muted palette — **the characters are
the saturated things in frame, not the room.**

---

## Acceptance test

Judged in the running game, not by eye on the image. The board succeeds only if,
with a character dropped in at game scale:

- He grounds naturally at both pickup stations.
- He grounds naturally at all eight tables.
- He is clearly readable in every walkable lane.
- The pickup lane, both table rows, the drop pads and the dish returns are each
  immediately distinguishable.
- The room never visually competes with him.

Note the split when it fails: grounding is **joint**. The board owes a shadow
language and clean geometry; the sprite renderer owes a contact shadow and a key
light that match it. A failure needs diagnosing before it becomes a re-roll —
the fix is often in code, not in the art.
