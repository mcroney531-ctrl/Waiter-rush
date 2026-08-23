# Food items — production spec

The brief for the menu — ten dishes and one drink. Written after taking one all
the way through, so
the numbers below are measured off a shipped icon rather than estimated.

---

## Where this sits

DALL·E makes a **reference image**, not the final art. The reference goes into
Meshy, comes back a 3D model, and `tools/render_food.mjs` renders it into the
icon the game actually draws.

That matters for two reasons:

1. **The reference is not the final view.** The angle the player sees is chosen
   later in code and can be changed for the whole set at once. Compose the
   reference so the *shape* is reconstructable — and shoot all ten identically,
   for the reason in Camera below.
2. **Food skips rig and animate.** Unlike the characters, a dish has no
   skeleton and no walk cycle. The Meshy path is Image to 3D → export GLB,
   and that is all. Do not run Rig on a burger.

   **Skip Meshy's own Remesh step too.** This line originally said to run it;
   don't. Nothing forces a poly budget on food (no rig), and Meshy's raw
   output varies wildly for objects of the same on-screen size — the steak
   came back at 3.1M triangles. Decimate locally instead with
   `node tools/simplify_glb.mjs <file>.glb --target 10000` (10,000 is food's
   own established budget — much lower than the room kit's 60,000, since a
   dish renders at 68px against props seen at a couple hundred), then
   `python3 tools/shrink_glb.py <file>.glb --inplace` for textures. The
   simplifier will sometimes stop well short of the target when the error
   bound would be exceeded first — the steak settled at 34,882 rather than
   10,000 — which means the geometry it's protecting is load-bearing; check
   the render before forcing it further with `--error`, the same rule the
   room kit's decimation already follows.

**Food has no tiers.** One reference per dish, ten in total.

---

## The one requirement that matters most

**The plate must be pale. This is a must, not a preference — a dark plate is a
re-roll.**

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

## One dominant shape per dish

The first thing a player perceives is the outline, before colour and long
before detail. So every dish has to be **reducible to one dominant shape**, and
that shape has to be different from the other nine.

The test: black the dish out entirely. If it is still identifiable, it works.

| key | dominant shape |
| --- | --- |
| `burger` | tall stack, with a fan beside it |
| `pizza` | fan of triangles |
| `sub` | two leaning logs |
| `tacos` | row of arches |
| `pasta` | dome |
| `salad` | deep bowl, piled above the rim |
| `club` | stacked triangles standing on their points |
| `soup` | wide bowl with a strong rim line |
| `steak` | forked bone jutting from a tilted wedge |
| `tart` | raised cylinder on a stand |

Note the burger is a stack **plus a fan** rather than a clean cylinder, because
that is what shipped and it is better for it — the fries give it an asymmetric
outline nothing else in the set has. Where a dish can carry a distinctive
secondary element without clutter, it should.

### The set being replaced fails this completely

This is measurable rather than a matter of opinion, so it was measured.
`tools/foodgrid.py` renders the whole menu at play size in colour, in value and
as hard silhouettes. The silhouette strip is the one that decides it, and the
current set produces **eleven near-identical circles** — ten of them plates and
only the milkshake breaking the pattern.

The reason is structural, not a drawing problem: they are plates seen from
above, so the plate *is* the outline and nothing on it ever breaks the rim.
Every one of those plates is being told apart purely by the colour and
detail inside a circle — the two channels that die first at 41px, which is the
size they draw at when carrying two orders.

That is the real argument for rebuilding them in 3D, and it is worth stating
because it is not "3D looks nicer". **A dish shot from 42° has its food rising
above the plate rim, so the food gets into the silhouette.** A top-down plate
can never do that no matter how well it is illustrated.

So this section is not polish on top of the spec. It is the thing the rebuild is
for, and a dish that comes back as another circle has failed its main job.

### How this is scored, and how close the burger really is

Distinctness is **relative** — "can you name all ten" is not a question any
per-dish shape statistic answers, because a dish is not too circular in the
abstract, it is too much like the other nine. So the tool normalises every
outline to the same box, overlaps each pair, and reports how much each dish
shares with its closest twin.

The set being replaced:

| | overlap with nearest twin |
| --- | ---: |
| ribs / tart | 0.99 |
| sub / pasta | 0.99 |
| salad, club, soup, tacos | 0.98 |
| pizza | 0.95 |
| **burger (the 3D one)** | **0.89** |

The burger is the most distinct thing in the set, and it should not be read as
a success. 0.89 is *less bad*, not good — its plate still dominates its own
outline, and only the fries break the rim enough to register. **The bar for the
new set is well under 0.89, not merely under 0.95.**

Anything above **0.90** is flagged. That threshold is provisional on purpose: it
currently fails everything shipping, which is correct.

### The finished menu becomes the bar

Once the ten are good, **that menu is the definition of acceptably distinct for
this game** — its own closest pair is, by construction, a pair someone looked at
and accepted. So the number stops being a guess:

```
python3 tools/foodgrid.py --calibrate
```

writes `art-source/food-baseline.json` with a threshold derived from the set's
own worst pair, and every later run judges against that instead. A holiday
special or a new dish months from now is then measured against the menu that
shipped, rather than against a bar that quietly drifted in the meantime.

Two guards, because the failure mode here is obvious and expensive:

- **It refuses to calibrate a set that does not already pass.** A baseline taken
  from ten circles would certify them and hand every future dish a bar it can
  clear while being indistinguishable from everything. Verified by trying it —
  the current menu is rejected with the offending pair named.
- **Re-calibrate when the menu changes, never to make a new dish pass.** If a
  new dish trips the bar, the dish is wrong, not the bar.

The corpus itself needs no separate storage: the shipped art in `assets/food/`
*is* the corpus, and it is version controlled already. The baseline file holds
only the number and the evidence behind it:

```json
{
  "schema": 1,
  "metric": "iou/normalised-128/alpha-110",
  "digest": "sha256/name+bytes/16",
  "threshold": 0.91,
  "corpus": "dc27651ba9b1a056",
  "menu_size": 10,
  "generated_at": "2026-07-31T03:33:37+00:00",
  "git_commit": "6fd46d7...",
  "git_dirty": false,
  "worst_pair": ["pasta", "burger", 0.89]
}
```

That provenance is not decoration — two of those fields are checked on every
run, and both catch a way the number can quietly stop meaning anything:

- **`corpus`** is a hash of the art the bar was derived from. If the menu has
  changed since, the run says so. A commit hash alone would not do this job:
  calibrating with uncommitted changes records a sha that does not describe the
  files that were measured, which is why `git_dirty` is recorded too and why
  the digest is the load-bearing field rather than the commit.
- **`metric`** names the similarity measure. A threshold derived under one
  measure means nothing under another, so changing how the overlap is computed
  invalidates the bar and the run says to re-calibrate rather than silently
  comparing new numbers to an old scale.

- **`digest`** names how `corpus` was computed, and exists because of a bug
  this caught. Without it, changing the hashing would report *"the menu has
  changed"* — false, and it sends someone to inspect art that is fine. Now it
  says the fingerprint method changed and the comparison is unavailable.

Three versions rather than one, each named for what it describes. A single
catch-all tool version was considered and rejected: it would fire on every
unrelated edit, and a warning that cries wolf gets ignored along with the real
ones. It would also duplicate `git_commit`, which already pins the exact code
more precisely than a hand-maintained number will.

The rest — `generated_at`, `git_commit`, `menu_size`, `worst_pair` — exists to
answer "why is the bar 0.91 and not 0.87" without archaeology.

One thing that was tried and does not work, so it does not get tried again:
measuring how much of a *single* dish's silhouette sits above the plate rim,
along with solidity, circularity, and the height of the shape above its widest
row. At play size, on a dish whose plate dominates the outline, all four score
the 3D burger the same as the nine flat plates it visibly differs from. Only
the pairwise comparison separates them.

And the number is an early warning, not a verdict. The silhouette strip is the
verdict, and reading it is a human job.

---

## The reference image itself

For Meshy to reconstruct a clean model:

- **Square canvas, one dish, centred**, filling most of the frame.
- **Plain flat background** — mid grey is ideal. No scene, no table, no cloth.
- **Even, soft lighting from the upper front-left.** Enough shaping to show
  form, no deep shadow hiding geometry.
- **No cast shadow on the background.** A baked shadow becomes geometry in the
  reconstruction and then a dark smear on the floor of the game.
- **No depth of field.** Blur reads as missing detail and comes back as mush.

### Camera: identical on all ten

- **Pitch about 40° above.** High enough to read what is on the plate, low
  enough to show the food has height.
- **Yaw about 25° off dead-on, from the front-left.** A flat-on view hides
  depth; much past 30° starts hiding the front of the dish.
- **The same on every dish, no exceptions.**

The reason is not the obvious one, and the obvious one is wrong. **This is not
what makes the icons look like a set** — that comes from the renderer, which
shoots every model on the same camera with the same light rig and bakes the same
outline, whatever the reference looked like.

What a fixed reference orientation actually buys is this: Meshy builds the model
with the reference view facing front, so the reference decides where the model's
"front" ends up. Shoot all ten the same way and `--yaw 0` means the same thing on
every one of them, and the whole set renders with a single command. Shoot them
inconsistently and each dish needs its own angle hunted down by hand.

**The reference angle is not the game angle.** The game currently renders food at
42° elevation, chosen by looking at a contact sheet, and it can be changed for
the whole set at any time without touching any art.

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

## The menu

Names are the game's internal keys — keep the filenames exactly these:
`pizza, sub, tacos, pasta, salad, club, soup, steak, tart, burger, shake`.

`ribs` is dropped from the menu: three re-roll rounds never cleanly cleared
both the physical-plausibility and aspect bars at once, and it's replaced by
`steak` (a porterhouse), which nailed a natural pose on the first pass. Its
identifying feature is the T-shaped bone itself — visible as a genuine notch
in the outline at a low, near-front camera angle (`--elev 42 --yaw 10` reads
best; higher elevations and wider yaws show the bone as a flat marking on the
top face instead of an outline break, and lose it entirely).

Done: `burger`, `pizza`, `tacos`, `steak`, `tart`, `salad`, `shake`. The
remaining four:

Each row says where the **height** comes from; the dominant shape each one has
to hit is in the silhouette table above.

| key | dish | what gives it height |
| --- | --- | --- |
| `sub` | a long filled roll, cut | halves stacked or leaning |
| `pasta` | a twirled nest | a domed mound, not a puddle |
| `club` | a stacked sandwich, quartered | two quarters standing on their points |
| `soup` | a filled bowl | a tall bowl with a visible rim, spoon optional |

`pasta` needs the most attention: it is naturally flat, it came out shortest in
the old set, and it will look undersized on the rail unless it is plated with
real height. `salad` had the same risk and cleared it by being served in a deep
bowl — 1.15 aspect and 95% fill, the best-behaved plate on the menu.

### The drink

`shake` is the one item exempt from the 1.0–1.3 aspect band, and being exempt
is the point of it. Every plate is a circle seen from above, so the plate *is*
the outline and the silhouette strip flags all ten against each other no matter
how different the food is. A glass rises out of its plate and breaks the rim:
at 0.90 aspect and 0.85 against its nearest twin, `shake` is the only item on
the rail you can name from its outline alone. If the strip is ever to be
readable, more of the menu has to leave the plate the way this one does.

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

Run `python3 tools/foodgrid.py` and it will say so: it flags anything whose edge
separates from the floor by less than 70, whose aspect falls outside 1.0-1.3,
which fills less than 80% of its slot, or which shares more than 0.90 of its
outline with another dish. It names the dish it is being confused with, which is
usually the more useful half of the finding.

The silhouette strip it writes is still not scored, and should not be. Look at
it and try to name all ten.

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
> - **Identical camera on every dish: pitch about 40° above, yaw about 25° off
>   dead-on from the front-left.** Consistency here matters more than the exact
>   figures — the 3D tool builds each model facing whatever the reference
>   showed, so ten different angles means ten models that have to be handled
>   individually afterwards.
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
> - **Each dish has one dominant silhouette, different from the other nine.**
>   Black the dish out completely and it should still be identifiable. That is
>   the first thing a player perceives, before colour and long before detail.
>
> Does that make sense, and how would you approach it?

### Step 2 — per dish

> Now the first one: **[dish]**. Its dominant silhouette should read as
> **[shape]**, and the height comes from **[what]**. Same pale stoneware plate,
> same size and style, same camera as the rest of the set.

Then, for each subsequent dish, keep the thread going so the plate stays
consistent:

> Same set, same plate, same lighting, same camera. Next: **[dish]** — dominant
> silhouette **[shape]**, height from **[what]**.

Filling in `[shape]` from the silhouette table each time is the part that keeps
the ten distinguishable from one another rather than merely well drawn.
