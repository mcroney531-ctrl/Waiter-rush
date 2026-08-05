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
every re-roll. The exact `cut_plaque.py` line that produced each shipped asset
is recorded with it below, because the flags are tuned per image and
reconstructing them from the result is guesswork.

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

Expect to tune `--lo` / `--hi` against the actual output, and **pass
`--shadow`**. Both of these frames came back with a drop shadow despite the
prompt asking for none, and a shadow cast on magenta is dark magenta: fully
opaque, nowhere near the key colour by distance, so the plain key kept it as a
solid pink rim tracing every bone. `--shadow` divides brightness out before
comparing, which puts a shadow of the key back on top of the key. On this art
the shadow measured 0.07 against the cream bones at 0.86 and the amber gems at
0.75, so there is a wide gap to sit in.

`cut_plaque.py` also un-multiplies the backdrop out of the anti-aliased edge in
`flat` mode now. Keying only writes alpha, so a half-covered pixel still held
half a magenta — which is fine over the background it was cut from and wrong
over anything else. That matters here specifically, because the floor these sit
on is about to be rebuilt.

Check the cut composited over the dark floor before accepting it either way.

---

## 1. `set-down.png` — **shipped** as `assets/ui/set-down.webp`

> The object: a long shallow rectangular frame lying flat on the ground, made
> of pale fossilised dinosaur bones laid end to end, with a chunky carved stone
> block anchoring each of the four corners. Three times wider than it is tall.
> Seen from a high three-quarter angle so it reads as flat on the floor. The
> whole middle of the frame is empty flat background — the frame is a border and
> nothing else. No paw print, no marking, no fill inside it.

```
python3 tools/cut_plaque.py art-source/refs/ui/set-down.png set-down \
        --mode flat --bg 188,50,101 --shadow --width 512
```

### The three things this has to get right

**The middle must be empty.** The game draws `SET DOWN` into it, and the floor
underneath it is about to be rebuilt in 3D. A painted stone interior fights both
— the reason the pad is code-drawn today is a comment in `drawDropZones` saying
it "survives a change of floor colour, which a painted one does not." The frame
is what becomes art; the hole stays a hole.

**No lettering.** Same rule as the pass sign in the room kit: the game already
draws the words, at 12px Galindo, and baked text is text you cannot change or
translate. It would also be unreadable — see below.

**3.38:1 in the box, though the art itself need not be.** Both references came
back short — 2.40:1 against the 3:1 asked for, and 1.98:1 against 2.5:1, the
same regression toward square that the counter reference showed. Composited at
the real 122x36 and inspected at 4x, the 1.41x horizontal stretch is invisible:
at this size a bone segment is 9px and the silhouette is doing all the work.
Not worth a re-roll.

The **box** is fixed, though. The pad is `DROP = A(196) x A(58)`, which is
**122 x 36 canvas pixels**, and that number is the delivery hit box as well
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

## 2. `pick-up.png` — **shipped** as `assets/ui/pick-up.webp`

> The same frame, in the same materials and the same style, but shorter — about
> two and a half times wider than it is tall. Identical bone construction and
> identical corner stones, just a narrower rectangle. The middle is empty flat
> background.

```
python3 tools/cut_plaque.py art-source/refs/ui/pick-up.png pick-up \
        --mode flat --bg 183,47,99 --shadow --width 512
```

A separate generation rather than a rescale: `PASS_W x PASS_H` is
`A(150) x A(58)`, which is **2.59:1** against the set-down pad's 3.38:1.
Squashing one into the other would visibly fatten the bones and pull the corner
stones out of square, and the two sit on screen at the same time.

Generate it in the **same session** as `set-down.png`, immediately after. Two
frames that are meant to be the same object at two lengths are exactly what
drifts when a session ends in between.

---

## 3. A dish-return frame — **deliberately not made yet. Do not add one.**

There are three floor markings and only two are bone frames, so the dish
returns look unfinished next to them and the obvious next move is a third
generation. It is being held on purpose, and this section exists so a session
picking this up cold does not helpfully make one.

**It is not the same kind of object.** The set-down and pick-up pads are floor
markings the game draws where nothing exists. The dish return is a **prop that
stands on the floor** — already painted into the board, and already approved as
`refs/room/dish-return.png`, prop 3 of the room kit. It goes through Meshy and
gets baked into `board.jpg`; it does not live in `assets/ui/` at all.

**Its box is not even pad-shaped.** `BUS_STATIONS` is `A(200) x A(240)`, which
is **125 x 150 canvas px — portrait, 0.83:1**, against 3.38:1 and 2.59:1 for
the two pads. That box is the standing prop's whole body, not a footprint on
the ground. A bone frame at that aspect is a picture frame stood on its end.

**And the question is not what it should look like.** It is whether the station
needs a floor marking at all. The spec's lighting section says the grounding
problem is solved by contact shadow, and `render_room.mjs` renders with
`shadowMap` on for exactly that reason — a rendered dish return with a real
contact shadow may read as somewhere to walk to without any marking under it,
in which case a frame is noise on a floor the spec wants quiet.

So the order is: `dish-return` through Meshy → `render_room.mjs` → look at the
station in the rendered room → *then* decide. If it does turn out to need one,
the recipe is already here: same style block, `--mode flat --shadow`, sized to
whatever `BUS` is by then. Nothing about that gets easier by doing it now, and
the geometry it would be sized against is the thing most likely to move.
