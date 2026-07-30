# Food items — production spec

The brief for the ten dishes. Written after taking one all the way through, so
the numbers below are measured off a shipped icon rather than estimated.

---

## Where this sits

DALL·E makes a **reference image**, not the final art. The reference goes into
Meshy, comes back a 3D model, and `tools/render_food.mjs` renders it into the
icon the game actually draws.

That matters for two reasons:

1. **The camera angle is chosen later, in code.** Do not compose the reference
   at the angle you want to see in game — compose it so the *shape* is
   reconstructable. The renderer can shoot the finished model from anywhere.
2. **Food skips rig and animate.** Unlike the characters, a dish has no
   skeleton and no walk cycle. The Meshy path is Image to 3D → Remesh → export
   GLB, and that is all. Do not run Rig on a burger.

**Food has no tiers.** One reference per dish, ten in total.

---

## The one requirement that matters most

**The plate must be pale.**

The first dish came back on dark stone, and it failed. Measured against the
floor the ticket rail sits on (luminance 68 of 255):

| | outer edge separates from the floor by |
| --- | ---: |
| the illustrated plates being replaced | **108** |
| the first 3D dish, on dark stone | **41** |
| the same dish with an outline added in code | 88 |

At 41 the plate dissolves into the floorboards and the food appears to float.
The cream plate in the old icons was never decoration — it was the bright ground
that held the dish off a dark floor, and losing it lost the readability with it.

The renderer bakes a pale outline to recover most of that, but **an outline is a
patch and a light plate is the fix.** Ask for the plate at roughly 70-80% white
— bone, cream, pale stoneware.

This is on theme, not against it. A restaurant built by dinosaur civilisation
serves on **carved bone-pale stoneware**, which reads lighter than basalt and
belongs in the same world.

---

## Composition, and why aspect ratio is a spec item

Every icon is scaled into a fixed **68 × 62** slot on the ticket rail,
preserving aspect and bottom-aligned. So the proportions of the dish decide how
big it looks — a wide flat plate is scaled down by its width and ends up
occupying half the slot.

The slot's own aspect is **1.10**. Measured across the current set:

| dish | aspect | height in the slot |
| --- | ---: | ---: |
| salad | 1.59 | 43px |
| pasta | 1.39 | 49px |
| burger | 1.28 | 53px |
| pizza | 1.13 | 60px |
| ribs | 0.91 | 62px, but only 57 wide |

**Aim for 1.0-1.3 wide-to-tall.** Inside that band every dish carries similar
visual weight on the rail. Outside it they look inconsistently sized even though
nothing is wrong with any single one.

The practical lever is **height**: give each dish something that stands up — a
stacked burger, a domed bowl, a folded taco leaning on its neighbour. A dish
plated completely flat is the one that comes out small.

**Keep the plate footprint the same across all ten.** The plate is the common
element and the thing the eye compares. Vary what is on it, not the diameter.

---

## The reference image itself

For Meshy to reconstruct a clean model:

- **Square canvas, one dish, centred**, filling most of the frame.
- **Plain flat background** — mid grey is ideal. No scene, no table, no cloth.
- **Three-quarter view from about 40° above.** High enough to read what is on
  the plate, low enough to show that the food has height.
- **Even, soft lighting from the upper front-left.** Enough shaping to show
  form, no deep shadow hiding geometry.
- **No cast shadow on the background.** A baked shadow becomes geometry in the
  reconstruction and then a dark smear on the floor of the game.
- **No depth of field.** Blur reads as missing detail and comes back as mush.

---

## Detail has a floor

The icon renders **68px wide**, and smaller again when carried — 53px with one
order in hand, 41px with two.

At that size:

- **Big shapes survive.** A bun, a bowl, a wedge, a stack of ribs, a fan of
  fries.
- **Fine garnish does not.** Herb sprinkles, sesame seeds, sauce drizzle and
  cracked pepper all become noise. They are fine as texture; they must not be
  what identifies the dish.
- **Colour blocks do the identifying.** Each dish wants two or three large
  areas of distinct colour. That is what separates pasta from soup at 41px.

Every dish should be recognisable **in silhouette**, then by colour, and only
then by detail.

---

## Theme

Same world as the board and the cast: **dinosaurs invented diners.** Upscale and
civilised, not a cave and not Jurassic Park. Portions are generous and the food
is hearty, but this is a real restaurant, not a carcass on a rock.

Serviceware is carved bone-pale stoneware with simple fossil or claw motifs —
large and simple enough to survive at play size, or omitted entirely. The food
itself is ordinary diner food; the *world* is prehistoric, the menu is not.

---

## The ten dishes

Names are the game's internal keys — keep the filenames exactly these:
`pizza, sub, tacos, pasta, salad, club, soup, ribs, tart, burger`.

`burger` is done. The remaining nine:

| key | dish | what gives it height and silhouette |
| --- | --- | --- |
| `pizza` | two or three wedges | wedges propped, not laid flat |
| `sub` | a long filled roll, cut | halves stacked or leaning |
| `tacos` | two or three shells | standing upright in a rack |
| `pasta` | a twirled nest | a domed mound, not a puddle |
| `salad` | a piled bowl | a deep bowl — this is the one most at risk of plating flat |
| `club` | a stacked sandwich, quartered | two quarters standing on their points |
| `soup` | a filled bowl | a tall bowl with a visible rim, spoon optional |
| `ribs` | a rack | stacked into a mound |
| `tart` | a slice or small whole tart | raised on its own stand |

`salad` and `pasta` need the most attention: both are naturally flat, both came
out shortest in the old set, and both will look undersized on the rail unless
they are plated with real height.

---

## Must not contain

- **A dark plate.** See above; this is the failure worth avoiding.
- **A background, table, cloth, or props.** The dish is cut out and composited.
- **A cast shadow on the background.**
- **Text, labels, menus or price tags.**
- **Cutlery lying beside the plate.** A spoon *in* a bowl is fine; anything
  outside the plate footprint breaks the shared silhouette.
- **More than one dish.** One plate, one reference.
- **Steam, sparkles, motion lines, or lens effects.** They become geometry.

---

## Acceptance test

Judged in the running game, not on the reference image. A dish succeeds if, at
68px on the ticket rail:

- It is identifiable **in silhouette alone**.
- It still reads at 41px, the size it draws at when carrying two.
- Its plate separates clearly from the dark floor without relying on the baked
  outline.
- Sat next to the other nine on the rail, it looks like part of the same set —
  same plate, same weight, same world.
- Nothing on it is detail the player cannot resolve.

---

## Prompts

Two-step, the way the character work went: set the context first, let it play
back its understanding, then generate one dish at a time.

### Step 1 — the brief

> We're about to build a set of ten food items for a browser game called
> Dine-O Dash — a restaurant run by dinosaurs, hand-painted storybook style,
> warm and civilised rather than prehistoric-primitive.
>
> These images are **references for 3D conversion**, not final art. Each one
> goes into an image-to-3D tool and comes back as a model, which the game
> renders as a small icon — about 68 pixels wide, sometimes as small as 41. So
> readability at very small size beats detail every time.
>
> The rules that matter:
>
> - Square canvas, one dish, centred, filling most of the frame.
> - Plain flat mid-grey background. No table, no cloth, no props, no scene.
> - Three-quarter view from about 40° above.
> - Soft even light from the upper front-left. No cast shadow on the
>   background, no depth of field, no steam or sparkles — anything atmospheric
>   becomes solid geometry when this is converted to 3D.
> - **The plate must be pale — bone or cream stoneware, roughly 70-80% white.**
>   The game floor is dark and a dark plate disappears into it. This is the
>   single most important requirement.
> - The plate is the same size and style on every dish. Only the food changes.
> - The dish needs **height** — something that stands up. Anything plated flat
>   ends up rendering small next to the others.
> - Two or three large blocks of distinct colour identify the dish. Fine
>   garnish is fine as texture but must never be what makes it recognisable.
>
> Does that make sense, and how would you approach it?

### Step 2 — per dish

> Now the first one: **[dish]**. [One line on what gives it height — e.g.
> "a deep bowl piled high, not a flat plate."] Same pale stoneware plate, same
> size and style as the others in the set.

Then, for each subsequent dish, keep the thread going so the plate stays
consistent:

> Same set, same plate, same lighting and angle. Next: **[dish]**. [height note]
