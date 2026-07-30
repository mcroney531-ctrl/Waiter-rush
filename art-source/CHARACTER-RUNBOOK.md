# Character pipeline — runbook

*Food follows a shorter version of this — see `FOOD-SPEC.md`. The one thing to
carry across: a dish has no skeleton, so it goes Image to 3D → Remesh → export.
Skip Rig and Animate entirely, and render it with `tools/render_food.mjs`
rather than `render_sprites.mjs`.*

From a prepped reference image to a character walking on the live board.
Everything here has been done once end to end on Tyrone tier 1, so the failure
modes below are observed, not anticipated.

---

## Phase 0 — send the references first (10 minutes, worth it)

Before nineteen Meshy runs, put all twenty reference images in
`art-source/refs/` and push. Two reasons:

1. **The tier ladder is still unverified.** The spec claims one major silhouette
   change per tier will read at 96px. Nobody has tested that against real art.
   If tier 2 and tier 3 are indistinguishable on the floor, the progression does
   not exist for the player — and finding that out after three designs is much
   better than after twenty.
2. **References belong in the repo anyway.** They are the source for any re-roll,
   and a chat upload dies with its session.

The check produces a grid — characters down, tiers across, each cell the 96px
silhouette on the floor colour. Anything that fails is a DALL·E re-roll, which
costs minutes, against a wasted rig cycle, which costs an hour.

---

## Phase 1 — repo, once

1. Install **GitHub Desktop**. It is the only install needed and it avoids the
   terminal entirely.
2. **File → Clone Repository →** `mcroney531-ctrl/Waiter-rush`.
3. Check the branch selector says **main**. It will, now that the default is
   fixed — but if a folder ever shows only four files, that is the symptom of
   being on the wrong branch.

---

## Phase 2 — teach Chrome the Meshy path, once

The Meshy sequence is a fixed click path, which is what workflow recording is
for. Do not write a prompt per character.

1. Install the Claude Chrome extension, open the side panel on **meshy.ai**.
2. Say:

   > I'm going to do a task once and I want you to learn it so you can repeat it
   > later. Start recording.

3. Do it by hand on `tyrone-t2`: upload the image → **Image to 3D** → generate →
   **Remesh at 15,000 triangles**, quads if offered → **Rig** → **Animate**,
   pick **Walking** → **Export GLB** → download.
4. Stop recording. Name it *meshy character pipeline*.
5. Verify the replay on `tyrone-t3` before trusting it with the rest:

   > Run the meshy character pipeline on this image: [attach]. 15k triangles on
   > the remesh, and the walking animation, not running.

### If the recording misbehaves, prompt in stages

Never one long prompt — generation takes minutes and a single block loses track.

> On meshy.ai, start a new Image to 3D generation using the attached image. Tell
> me when it finishes and do nothing else.

> The polycount is too high to rig. Find Remesh, set the target to 15,000
> triangles, choose quad topology if offered, and run it. Tell me when it's done.

> Now run Rig on the remeshed model. It's a humanoid biped. Tell me the result
> and flag anything that looks wrong at the shoulders, hips or tail.

> Now Animate it and select a **walking** cycle — not running, not run-fast. Then
> export as GLB and download it.

---

## Phase 3 — the loop, per character

1. Run the recorded workflow on the reference image.
2. **Meshy will reject the rig above 300k triangles.** That is expected and it is
   doing you a favour — riggers behave better on cleaner meshes, and 15k is still
   about one triangle per rendered pixel. Remesh and continue.
3. The export is a **zip containing four animation GLBs**. Take the one with
   **Walking** in the name; ignore RunFast, Running and Run_03.
4. Rename it `<character>-t<tier>.glb` — `tyrone-t2.glb`, `velo-t1.glb`. Lower
   case, hyphen, no spaces.
5. Drop it into `art-source/`.

### Getting the file here

**Git is the transfer channel, not a chat attachment.** Nothing needs to be
uploaded into a conversation and no file-hosting API is involved — the files are
read off disk from the repo. If an export is too big to attach somewhere, that
is a reason to push it, not a reason to find a bigger pipe.

Two ways to do step 3, and the difference is worth knowing:

| | in the tree | in history, forever |
| --- | --- | --- |
| Walking GLB only, shrunk | ~1 MB | ~1 MB |
| the whole Meshy zip | 0, once deleted | **23 MB each** |

`shrink_glb.py` takes a zip directly — `python3 tools/shrink_glb.py
art-source/tyrone-t2.zip` pulls the Walking GLB out, shrinks it and writes
`tyrone-t2.glb`, 23.24 MB → 1.08 MB. So committing zips genuinely works and
costs no extra effort on the day.

What it costs is permanent. Git keeps every blob it has ever seen, so deleting
the zip afterwards reclaims nothing: nineteen zips is around 440 MB that every
clone downloads forever, against about 21 MB for the GLBs alone. And because
this repo publishes from the branch root, a zip left in the tree is also served
publicly and counts against the 1 GB Pages limit — so a committed zip has to be
deleted in the same session it is extracted.

Dragging one file out of a zip that is already open is ten seconds, so prefer
that. Push zips when it is genuinely easier and accept the history; it is
annoying rather than fatal, and a one-off rewrite could clean it later.

### Check before moving on

Look at the model in Meshy's viewer after the remesh and after the rig:

- Did the **cap, apron and shoes** survive the remesh, or did the texture smear?
  If it smeared, re-run the texture step *after* the remesh rather than before.
- Do the **shoulders separate**? A fused arm is the failure the A-pose exists to
  prevent, and it is visible immediately.
- Did the **tail** survive? It is the other known rig-breaker.

---

## Phase 4 — push

GitHub Desktop shows the new files. Write a message, **Commit to main**, **Push
origin**. Then say so.

**Push in batches, not one at a time.** Four at a time is comfortable. Doing
Tyrone's four tiers as the first batch is deliberate — see below.

---

## Phase 5 — my side

0. `python3 tools/shrink_glb.py art-source/<name>.glb --inplace` before anything
   else. Meshy ships a 2048² texture per character; the sprite renders at 192px,
   so that texture is roughly a hundred times more than the render can use.
   Resized to 1024 and re-encoded, Tyrone went 6.12 MB → 1.08 MB, and the
   rendered sheet differs from the original by a mean of 0.42/255 with 0.01% of
   pixels off by more than 8 — measured, not assumed, and invisible.
1. `node tools/render_sprites.mjs art-source/<name>.glb --name <name>` produces
   the sheet and its config, with the anchor measured from rendered pixels. It
   also prints the roster line ready to paste:

   ```
   roster  { src: 'assets/sprites/tyrone-t1.png', scale: 0.751, anchorX: 0.542, anchorY: 0.901 },
   ```

2. That line goes into `ROSTER` in index.html, in tier order. Everything else
   about a sheet is shared in `SHEET_BASE`, so a tier really is one line.
3. I walk the character to all twelve stops and screenshot.

**The roster and tier progression are built.** A character is four tiers of one
dinosaur; the tier swaps on money earned this shift, at $75 / $200 / $400 —
set against a measured earnings curve, roughly one promotion every 40-60s. All
four sheets preload at startup so a promotion never waits on a download, a tier
whose art is missing is skipped rather than announced, and no art at all falls
back to the drawn placeholder body. So tiers can land one at a time and the
game stays playable throughout.

---

## Order of work

**Do Tyrone's four tiers first**, before touching the other species.

The pipeline is proven, but the tier progression is not. Four tiers of one
character is a complete, shippable progression system — and if the ladder does
not read in motion, that is three wasted runs rather than nineteen. Once it does
read, the remaining sixteen are volume with no open questions.

---

## Known limits

- **File size is a texture problem, not a model problem.** A Meshy GLB is ~6 MB
  and about 86% of that is one 2048² PNG. The mesh, skin and walk cycle together
  are under a megabyte. So the fix is always to shrink the texture rather than to
  reach for LFS, a splitter, or a file-hosting API — after `shrink_glb.py` the
  roster is around 20 MB total, and nothing is near GitHub's 100 MB per-file
  limit. Only the rendered sheets, under 500 KB each, are needed by the game
  itself; the GLBs are kept so a sheet can be re-rendered.
- **Chrome cannot do the Meshy Scene composition** for the 3D room. That is
  spatial judgement inside a WebGL canvas with no DOM to read. Automate
  deterministic click paths, not spatial work.
- **Nothing automates the file getting from Downloads into the repo** unless
  Cowork is set up, since that is local file system access. It is a drag and a
  commit.
