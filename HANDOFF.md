# Rush Hour — Session Handoff

Read this first. It is the working brief for continuing development, written at the point where the previous session's environment had to be replaced. The README covers what the game *is* for anyone arriving cold; this covers what has been decided, what has been measured, what is unresolved, and what to be careful about.

## What this project is

A build for Articulate E-Learning Challenge #561 ("Online Training for Restaurant Servers & Waiters"). Instead of the usual branching scenario, it is a short Overcooked-style arcade game that trains the "in the weeds" skill of a server's job: holding multiple orders in your head while physically running the floor, under escalating pressure.

Vanilla JS and HTML5 canvas, no build step. `index.html` at the repo root *is* the site; the only other shipped files are `vendor/`, which holds DiceBear's avatar renderer and art set as pre-built static assets (no build step, nothing fetched at runtime).

The person you are working with is Rone. Working style notes are at the bottom — read them, they change how you should respond.

## Current state

Live at **https://mcroney531-ctrl.github.io/Waiter-rush/**, served by GitHub Pages from `main` at the repository root. Deploys on push to `main` — there is no build step, so a push is a deploy, usually live inside a minute.

Six commits, all on `main`:

```
2427222 Add a DiceBear-backed waiter avatar picker
73bebd6 Add a live seconds countdown beside each table meter
b4caf06 Move delivery onto a marked drop-off pad
986cd49 Add a gated tutorial with a practice round
8e20700 Fix patience drain ramp saturating instantly
4960960 Add Rush Hour waiter game as deployable static site
```

The commit messages are deliberately detailed and carry the reasoning and measurements behind each change. `git log` is a real source, not ceremony.

**Repo housekeeping still outstanding:** the repository's default branch is still `claude/new-session-e86btx`, not `main`. GitHub set it to the first branch pushed to an empty repo and pushing `main` later did not change it. It does not affect the Pages deploy, which targets `main` explicitly, but it means the repo landing page and fresh clones show the wrong branch, and new PRs default to the wrong base. It is a two-click fix in Settings → General. `netlify.toml` is present and valid but unused, since hosting went to Pages.

## How the code is laid out

One file, `index.html`, about 1150 lines: styles, then markup, then the whole game in a single IIFE. Rough order inside the script:

- Colour palette and layout constants
- `DROP` — the drop-off pad geometry
- `resetGame` / `updateHUD`
- **Avatar section** — local avatar generation and the picker
- Spawning, input, game logic (`tryPickup`, `tryDeliver`, `checkAutoInteract`)
- **Tutorial section** — `TUTORIAL_STEPS` and its step machine
- `update(dt)` — the single update path for everything
- Drawing functions, then `render()`
- `loop` / `beginRun` / `startGame` / `startTutorial`, then event wiring

Canvas is a fixed 960×600 internal resolution scaled by CSS. Eight tables in two rows of four, at x = 120/320/520/720 and y = 200/400. Player is a circle of radius 26 moving at 220 px/s. The counter occupies the top 90px and holds at most 5 queued tickets.

## The core hook, and the rule that protects it

The game's actual subject is **memory**. Tickets are visible at the counter, but once you carry one away it fades after a grace window (`fadeWindow`, 1600ms), so you have to retain which table it was for. Walking back toward the counter re-reveals it, which keeps it fair rather than a gotcha.

Everything else is in service of that, which produces one standing design rule:

> **Nothing may indicate which table the carried order belongs to.**

This has already come up once and will come up again, because the obvious polish in each case violates it. The drop-off pads are drawn identically on all eight tables specifically so the correct one is not highlighted — the only state a pad reflects is whether the player is standing on it. If you find yourself about to add a glow, an arrow, a minimap ping, or a highlighted pad, that is the mechanic being deleted for legibility. It may be a trade worth making, but it is Rone's call, not a silent one.

## What has been measured

Do not re-derive these; they were established with instrumented runs in headless Chromium.

**Patience.** Drain rate ramps from `0.00011` to `0.0002` per ms over `RUSH_PEAK_MS` (240000). A fresh table gives **9.09s at the top of the shift, tightening to 5.00s at four minutes**, then flat.

The original bug, fixed in `8e20700`: the ramp term was `Math.min(0.00009, elapsed/1000/9000)`, which hit its cap about **810ms** into the shift. Every table gave a flat 5 seconds for the entire game and the intended escalation never happened. If you touch this, keep the ramp explicit.

**Spawn rate.** `spawnInterval = Math.max(1100, 4200 - elapsed_seconds * 45)`, multiplied by `0.7 + rand*0.5`. It bottoms out at **69 seconds** into the shift and is flat after.

**Traversal.** Average one-way trip from counter to a table is **1.37s**; round trip **2.74s**.

**Scoring.** A delivery scores exactly **120** — `100 + speedBonus`, where `speedBonus` reads `table.patience` on the line *after* it has been reset to `1`, so it is always 20. The speed bonus rewards nothing. Untouched so far because it is a design decision, not just a bug: it needs a real definition of what "fast" means before it is worth fixing.

## The open problem — read before tuning anything

**Carry-two is load-bearing, not a bonus feature, and it is unimplemented.**

`carryCapacity` flips to 2 after six deliveries but nothing in the pickup or carry logic supports holding a second ticket. `carrying` is a single object, not a queue.

Why this blocks everything else:

| elapsed | spawn interval | patience window |
| ------: | -------------: | --------------: |
|      0s |          3.99s |           9.09s |
|     30s |          2.71s |           8.25s |
|     60s |          1.43s |           7.55s |
|     69s |          1.04s |           7.36s |
|    240s |          1.04s |           5.00s |

Against a 2.74s round trip, orders start arriving faster than one carry slot can clear them at around **30 seconds**, and by 69 seconds they arrive at nearly **three times** the rate you can deliver them. The counter queue caps at 5 which bounds the chaos, but tables then time out faster than you can reach them regardless of skill.

The spawn curve was written assuming two orders per trip. Because that never got built, the game outruns the player about half a minute in no matter what the patience numbers say. It is also why the two curves are wildly out of sync — spawn pressure peaks at 69s while patience does not peak until 240s.

**Consequence:** tuning patience, spawn rate, or the fade window *before* carry-two exists means tuning against a curve that is about to change underneath you. Build carry-two first, then retune. Note that even two slots only reaches about 1.4s per order amortised against a 1.04s spawn floor, so that floor likely needs to come up too.

Implementation sketch: replace `carrying` with a small array, cap it at `carryCapacity`, decide whether delivery is automatic for whichever carried order matches the pad you are standing on (probably yes, it matches the existing auto-deliver feel), and show two floating tickets above the player with the same fade rule applied per ticket.

## Feature notes

### Tutorial (`986cd49`)

Five steps, each gating on the player actually performing the action — nothing advances on a timer. Move → pick up → deliver → meet the patience bar → a three-order practice round with nothing at stake.

Steps are data in `TUTORIAL_STEPS`: a `hint` label, a `text()` instruction, an optional `enter()` to stage the floor, a `done()` predicate, and an optional `onMiss()` for a table timing out mid-lesson. Adding or reordering a lesson is an edit to that array alone.

Two deliberate choices worth preserving. **Patience drain is off for the first three steps** (`drainEnabled`), so the player learns the pickup, the walk and the fade with no clock running; the timer starts only for the step that is about the timer. And **a timed-out table costs nothing during the tutorial** — it re-stages the order and explains what happened, because that is the moment the mechanic lands and a bad moment to punish someone.

The instruction panel is drawn on-canvas so it scales with the game, and it owns the bottom strip: `update()` clamps the player above `tut.bannerTop` during the tutorial. The tutorial floor is therefore slightly shorter than the real one. Invisible in practice since the tables sit well above it.

The practice round resets `elapsed`, so it runs at the gentle end of the difficulty ramp and is easier than the shift it prepares you for. Whether that is right calibration is unresolved and needs a play, not analysis.

### Drop-off pads (`b4caf06`)

Delivery keys off `inDropZone(t)` — a pad in front of each table, `DROP = { dy: 52, w: 78, h: 38 }` plus `player.size * 0.4` padding — rather than a radius around the table centre. Before this you had to stand on the furniture with nothing on screen saying so.

The zone sits just below table centre, so you enter it as you reach the table's lower half; you do not have to overshoot, but aiming at dead centre no longer registers. The wrong-table bump uses the same zones. See the standing rule above for why the pads never highlight the correct table.

### Countdown (`73bebd6`)

Each waiting table shows seconds remaining beside its meter, in the same green/amber/red thresholds as the bar. `drainRate` was lifted from a local in `update()` to module scope so the renderer can convert patience into seconds. Verified as true elapsed time: 7.63s read 5.59s two seconds later. Hidden while the tutorial has drain off, where a frozen number would imply a clock that is not running. Replaced the hourglass glyph.

### Avatar picker

"Build your waiter" on the title screen opens a picker that generates Open Peeps avatars **in the browser**, from DiceBear's renderer and art set vendored into `vendor/`. Six rows, live previews, a randomiser. The result is drawn as a circular token clipped into the same shape the plain circle used.

A portrait token sidesteps directional sprites entirely — a portrait has no facing to get wrong, so there is no need for four-way character art.

The rows are **derived from the art set at load**, not hand-written. This is the important property and should be preserved: it makes it impossible to name a variant that does not exist, which is exactly how the previous API-backed version broke three times without anyone noticing. If you add a row, read it out of `def.components` / `def.colors` rather than typing values.

**Degradation still matters, but there is much less that can fail.** The picked avatar is cached as SVG text in `localStorage`, so a returning player never loads `vendor/` at all. A player who never opens the picker loads none of it either — the engine is imported lazily on first open. If `vendor/` cannot load (a partial deploy, or `file://`, where module imports are blocked), the picker says so and the game keeps the classic circle.

## Unfinished and unverified — start here

**1. Avatars — rebuilt to run locally. Done.** The picker no longer talks to DiceBear at all. `vendor/dicebear-core.js` (their renderer, MIT) and `vendor/open-peeps.json` (the complete Open Peeps art set, CC0) ship with the game, and avatars are generated in the browser. Output is byte-identical to what their HTTP API returns — verified over 40 random option combinations, all 40 matching once DiceBear's own `<!-- Generated by -->` comment is normalised away.

Why this happened rather than a simple option fix: the API failed *silently* three separate times. It answers 200 for an option name it does not recognise and serves the style default, so a stale major version (9.x when 10.x was current), renamed keys (`top`→`topVariant`, `clothing`→`clothesVariant`), and a probability defaulting to 10 (a chosen beard rendering one seed in ten) all shipped looking like working code. **The rows are now built from the art set itself** — `AVATAR_ROWS` is derived from `def.components` and `def.colors` at load — so a variant that does not exist cannot be named. That bug class is structurally gone, which matters more than the offline capability.

The style changed from `avataaars` to `open-peeps` in the process. Open Peeps has no hair-colour axis (it is painted into each of the 48 head illustrations, which is why `grayBun` and `grayShort` are separate heads), so that row is gone; in exchange the picker gained Expression (30) and Glasses (9), and because generation is local and costs about 1 ms per avatar, **every variant in the art set is offered** rather than a hand-picked handful — 114 swatches across six rows, where the API version could only afford 33. Rows scroll horizontally and open scrolled to the current selection.

Three probability-gated components must stay pinned in `avatarOptions`: `facialHair` (default 10) and `accessories` (default 20) would otherwise ignore an explicit choice, and `mask` (default 5) would put a surgical mask on roughly one waiter in twenty.

Weight: 448 KB in `vendor/`, about 120 KB gzipped. If that ever matters, `pixel-art` is the same architecture for 4 KB of art instead of 92 KB — a one-file swap plus new row wiring.

Verified end to end with the network blocked: the full pick → commit → play flow makes zero external requests, a returning player renders from the cached SVG without loading `vendor/` at all, an unreachable `vendor/` warns in the picker and leaves the game playable on the fallback circle, and stale avataaars saves are ignored rather than half-applied (the localStorage keys moved to `rushhour.peeps.*`).

One real limitation: ES module imports are blocked on `file://`, so opening `index.html` straight off disk shows the picker warning. Over http — GitHub Pages, or any local server — it is fine. The warning text says so.

**2. Licensing — done.** Open Peeps is CC0, so no attribution is required; the credit line in the picker is provenance, not obligation. DiceBear's renderer is MIT, which *does* require retaining the notice — it is at `vendor/CORE-LICENSE.txt`.

**3. Every swatch click re-renders all 114 previews**, since each shows the current selection with one option swapped. That is ~120 ms of generation plus image decode, local and offline, so it is no longer a network concern — but it is the thing to look at first if the picker ever feels sluggish on a weak machine.

**4. Still open from the original brief:** no audio at all; no difficulty feel-tuning pass has happened (all values are first guesses, and see the carry-two blocker above); the canvas is a fixed 960×600 scaled by CSS rather than a true responsive layout; a wrong delivery costs nothing beyond a visual bump, which is deliberate but unexamined; and the HUD label reads "Tables lost" while the dots deplete as lives remaining, so label and indicator point in opposite directions.

## Verifying your work

Rone reviews visually and does not read code. Screenshot and instrument rather than asserting — and note that the previous session repeatedly caught real bugs this way that reading the code did not reveal.

Playwright and Chromium are preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; do not run `playwright install`). Serve the repo with `http-server` and drive the page.

The useful trick: the game lives in an IIFE with no globals, so instrument a throwaway copy rather than the real file. Copy `index.html` to `probe.html` inserting a debug handle before the `// initial static preview render` line:

```js
window.__dbg = { get tables(){return tables;}, get carrying(){return carrying;},
                 get player(){return player;}, get score(){return score;},
                 get deliveries(){return deliveries;}, get mode(){return mode;},
                 get tut(){return tut;}, DROP: DROP };
```

Then drive real keyboard events and read actual state. **Delete `probe.html` before committing** — it is not in `.gitignore`.

Two environment gotchas that cost the previous session time. A stale `http-server` from an earlier turn can hold the port and silently serve the wrong directory — if a page loads as "Index of /", that is what happened. And **headless Chromium cannot use the sandbox proxy**: it returns `ERR_CONNECTION_RESET` with every proxy configuration tried, while `curl` through the same proxy succeeds. Consequence: **screenshots always render in fallback system fonts, never the real Alfa Slab One and DM Sans.** Do not chase this, and do not tell Rone a font problem exists in the game — it is a sandbox artefact only. For anything needing a real external asset in the browser, fetch it with `curl` and inject it (that is how the avatar render path was verified).

## Working with Rone

Rone works visually and in-browser rather than as a traditional developer. Prefers short, directive feedback and surgical edits over large rewrites once something is close. Prefers prose over bullet lists in conversation — this document is structured because it is a reference, not a reply.

Two things that have worked well and are worth continuing. **Push straight to `main`** — it was explicitly chosen so changes go live in about a minute for visual review; each change is its own commit, so reverting is easy. And **flag what you did not verify.** Rone has consistently responded well to being told the limits of a check rather than being handed a confident summary; the avatar feature shipped with its unverified surface named explicitly, which is why it is item 1 above rather than a surprise later.

When something is genuinely ambiguous, ask with a recommendation attached rather than presenting a neutral menu. When it is not ambiguous, just build it.

## Immediate next steps

1. ~~Verify the DiceBear options; confirm the licence and attribute.~~ Done — see items 1 and 2 above.
2. **Build carry-two, then retune the spawn floor and patience curve together against it.** This is now the top of the list and still gates every other tuning decision; read "The open problem" above before starting.
3. Smaller things, in rough order of how much they cost to leave: the scoring speed bonus is always 20 and rewards nothing; the HUD label reads "Tables lost" while the dots deplete as lives remaining; the repository default branch is still `claude/new-session-e86btx` rather than `main` (Settings → General, two clicks).

Rone was also about to generate art in DALL·E. The advice given, still standing: with the avatar handled by DiceBear, spend that effort on the room — tables, counter, food icons, floor — where per-asset style consistency matters far less than it does for character parts.
