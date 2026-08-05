# Canvas overlay art — reference image prompts

For the 2D art the **game draws over the board every frame**, as opposed to the
room kit in `../room/PROMPTS.md`, which goes through Meshy and ends up baked
into `board.jpg`. Different pipeline, different constraints, so a separate file:

| | room kit | this file |
| --- | --- | --- |
| pipeline | DALL·E → Meshy → GLB → `render_room.mjs` | DALL·E → `cut_plaque.py` → `drawImage` |
| lives as | geometry | a keyed `.webp` in `assets/ui/` |
| seen at | whatever the render gives it | a fixed pixel size, every frame |

Save each as `art-source/refs/ui/<name>.png` and push before doing anything
else with it — a chat upload dies with its session and these are the source for
every re-roll.

Already shipped this way, before this file existed: `rush-coming.webp`,
`rush-active.webp`, and the five `hands-free-<character>.webp` banners. Their
prompts were not kept, which is the gap this file closes.

---

## The style block — paste this first, every time

> A single game UI element on a plain flat magenta background, drawn in a warm
> hand-painted storybook style with soft cel shading and a muted palette.
>
> Style: a restaurant designed by dinosaur civilisation — carved basalt, fossil
> framed trim, amber and gold accents, chunky prehistoric joinery. Upscale,
> cosy and whimsical. Not a cave, not Jurassic Park, no vines.
>
> No text, no lettering, no drop shadow, no border, nothing else in frame.

**Magenta, not grey, and it is not a style choice.** These get cut out by
`tools/cut_plaque.py`, which has two modes and only one of them works here:

- `--mode vignette` grows a region inward from the image border. It is what the
  banners used, and it **cannot reach the inside of a closed shape** — the whole
  point of a frame is that it encloses something.
- `--mode flat` keys globally on colour distance, so it takes the enclosed
  middle too. That is the one to use, and it needs a background colour that
  appears **nowhere** in the art. Grey is the worst possible choice here,
  because the corner stones are grey.

Expect to tune `--lo` / `--hi` against the actual output, and expect some
magenta spill on the anti-aliased edge — check the cut composited over the dark
floor before accepting it.

---

## 1. `set-down.png`

> The object: a long shallow rectangular frame lying flat on the ground, made
> of pale fossilised dinosaur bones laid end to end, with a chunky carved stone
> block anchoring each of the four corners. Three times wider than it is tall.
> Seen from a high three-quarter angle so it reads as flat on the floor. The
> whole middle of the frame is empty flat background — the frame is a border and
> nothing else. No paw print, no marking, no fill inside it.

### The three things this has to get right

**The middle must be empty.** The game draws `SET DOWN` into it, and the floor
underneath it is about to be rebuilt in 3D. A painted stone interior fights both
— the reason the pad is code-drawn today is a comment in `drawDropZones` saying
it "survives a change of floor colour, which a painted one does not." The frame
is what becomes art; the hole stays a hole.

**No lettering.** Same rule as the pass sign in the room kit: the game already
draws the words, at 12px Galindo, and baked text is text you cannot change or
translate. It would also be unreadable — see below.

**3.38:1, and it is not negotiable.** The pad is `DROP = A(196) x A(58)`, which
is **122 x 36 canvas pixels**, and that number is the delivery hit box as well
as the drawing. The band it sits in is 80 art px tall (700–780 for the back row,
900–990 for the front) and the spec keeps that corridor clear. Art at any other
aspect gets stretched into this one.

### What the mockup taught us before any art was made

The pad draws **122px wide**. If the reference comes back around 1500px wide the
scale is 0.082, so the spec's 40px motif minimum means **a motif has to be 490px
in the reference** to be resolvable at all. Measured against the mockup's
proportions:

| element | in the reference | on screen | |
| --- | --- | --- | --- |
| the frame's outline as a whole | ~1500px | 122px | motif |
| one bone segment | ~90px | 9px | texture |
| the centre paw print | ~200px | 20px | texture |

So: **the silhouette of the frame is the only thing carrying identity.** Ask for
bones because a bone-textured edge reads warmer and more deliberate than a
dashed line, not because anyone will count them. And the centre paw print comes
out for two reasons — 20px is under the motif floor, and it sits exactly where
`SET DOWN` is drawn.

### States are code, not art

One image. The three states in the mockup are canvas operations over it, which
costs nothing per state and avoids four more startup requests — there are
already 41 requests and 16.6 MB racing before the shift starts, and one of them
losing that race is what left a headless waiter walking the floor.

| state | when | how |
| --- | --- | --- |
| idle | always | the frame at ~0.6 alpha |
| carrying | holding any dish | full alpha, warm tint — **on every pad at once** |
| active | standing on this pad | plus an amber `shadowBlur` glow on a slow pulse |
| dirty | table needs bussing | desaturated frame, `CLEAR` drawn over it |

**"Carrying" lights every pad, without exception.** The mockup's third state is
captioned "signal the best place to set down", and if that ever means the
*correct* table it deletes the game — the ticket fades on purpose and
remembering the number is the entire mechanic. Proximity is fine and is what the
code already does. Correctness is not.

`dirty` has no mockup state and needs one; it is currently a dark mask with
`CLEAR` over it, because the old pad had `SET DOWN` painted in and the two
together were unreadable.

## 2. `pick-up.png`

> The same frame, in the same materials and the same style, but shorter — about
> two and a half times wider than it is tall. Identical bone construction and
> identical corner stones, just a narrower rectangle. The middle is empty flat
> background.

A separate generation rather than a rescale: `PASS_W x PASS_H` is
`A(150) x A(58)`, which is **2.59:1** against the set-down pad's 3.38:1.
Squashing one into the other would visibly fatten the bones and pull the corner
stones out of square, and the two sit on screen at the same time.

Generate it in the **same session** as `set-down.png`, immediately after. Two
frames that are meant to be the same object at two lengths are exactly what
drifts when a session ends in between.
