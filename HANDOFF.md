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

Canvas is a fixed 960×600 internal resolution scaled by CSS. Eight tables in two rows of four, at x = 120/320/520/720 and y = 200/400. Player is a circle of radius 26 moving at 220 px/s. The counter occupies the top 90px and holds at most 5 queued tickets. The dish return (`BUS`) sits against the right wall at x = 886, y = 300.

## The core hook, and the rule that protects it

The game's actual subject is **memory**. Tickets are visible at the counter, but once you carry one away it fades after a grace window (`fadeWindow`, 1600ms), so you have to retain which table it was for. Walking back toward the counter re-reveals it, which keeps it fair rather than a gotcha.

Everything else is in service of that, which produces one standing design rule:

> **Nothing may indicate which table the carried order belongs to.**

This has already come up once and will come up again, because the obvious polish in each case violates it. The drop-off pads are drawn identically on all eight tables specifically so the correct one is not highlighted — the only state a pad reflects is whether the player is standing on it. If you find yourself about to add a glow, an arrow, a minimap ping, or a highlighted pad, that is the mechanic being deleted for legibility. It may be a trade worth making, but it is Rone's call, not a silent one.

## What has been measured

Do not re-derive these. They come from instrumented runs in headless Chromium, re-measured after the difficulty was slowed down.

**The ramp lives in one place.** `RUSH_PEAK_MS` (600000, ten minutes) drives both curves, and the four numbers that shape the shift are named constants right above it: `PATIENCE_START_S` (120), `PATIENCE_END_S` (18), `SPAWN_START_MS` (7000), `SPAWN_FLOOR_MS` (3400). Patience is expressed in **seconds a fresh table gives you** and `drainRate` is derived from it, rather than the reverse — the seconds are the number on screen and the number worth arguing about.

| elapsed | patience window | spawn gap | orders/min | max deliverable/min |
| ------: | --------------: | --------: | ---------: | ------------------: |
|      0s |          2:00   |     7.00s |        8.6 |                21.9 |
|     60s |          1:50   |     6.64s |        9.0 |                21.9 |
|    120s |          1:40   |     6.28s |        9.6 |                21.9 |
|    240s |          1:19   |     5.56s |       10.8 |                21.9 |
|    420s |            49s  |     4.48s |       13.4 |                21.9 |
|    600s |            18s  |     3.40s |       17.6 |                21.9 |

Verified live rather than derived: at shift open a fresh table reads 119.7s and the spawn gap is 6.99s; with the clock pushed to 600000 they read 18.0s and 3.40s. The on-screen countdown is true elapsed time.

**Traversal.** Average one-way trip from counter to a table is **1.37s**; round trip **2.74s**, which is where the 21.9/min ceiling comes from. That ceiling assumes flawless play with zero hesitation, so treat it as a hard wall rather than a target.

**Scoring.** A delivery scores exactly **120** — `100 + speedBonus`, where `speedBonus` reads `table.patience` on the line *after* it has been reset to `1`, so it is always 20. The speed bonus rewards nothing. Still untouched because it is a design decision, not just a bug: it needs a real definition of what "fast" means. Note this got *worse* to leave alone now that windows open at two minutes — there is much more room for a meaningful speed bonus than there was at nine seconds.

## Bussing (eat / clear cycle)

Serving is no longer the end of a table. The full cycle is `idle → waiting → happy → eating → dirty → clearing → idle`, and **a table that is not `idle` cannot take a new order** — `spawnTicket` filters on `idle`, so this falls out of the state machine rather than needing a special case.

That blocking is the whole point. There is deliberately **no penalty timer** on a dirty table: the cost of ignoring it is that your usable floor shrinks, which throttles your own order flow. It mirrors why real restaurants track table turnover, and it avoids stacking a second failure state on top of walked-out guests.

Dishes share the single carry slot with orders, so every trip is a triage decision. They go to the **dish return** (`BUS`), a station against the right wall in the corridor between the table rows — deliberately not part of the counter, so clearing is a trip you choose to make rather than something you do in passing. It cannot live along the bottom, because the tutorial's instruction panel owns that strip.

Two rendering notes. Plates are **drawn as vectors, not emoji** — the food icons are emoji and render fine, but `🍽️` is missing from enough font stacks that it showed up as a blank box in testing. And the dishes sit **offset to the right** on the table top: centred, they covered the table number, which is the one thing the player needs to read on exactly the tables that want attention.

Carried dishes never fade. The fade exists to force you to remember a table number; the dish return is a fixed destination, so hiding them would be noise rather than difficulty. The `CLEAR` pad label is likewise safe — a dirty table is public knowledge, so relabelling it gives nothing away about the order you are carrying.

`EAT_MS` (22000) is the lever that decides whether the floor breathes or clogs. Measured with a bot playing 100 seconds of the real shift: the floor settles at **3–4 tables in service with 3–4 eating and about 1 waiting to be cleared**, 14 delivered and 10 cleared, no lives lost. So roughly half the floor is tied up mid-meal at steady state, which is the intended squeeze. Note the consequence at full rush: eight tables with 22-second meals cannot absorb 17.6 orders/min, so `spawnTicket` simply finds no idle table and skips. The game self-throttles rather than punishing — nothing is lost, there are just fewer orders. Turn `EAT_MS` down if the floor feels too tied up.

The tutorial gained a **Clear the table** lesson (step 5 of 6). Early steps set `bussingEnabled = false` so they keep the old straight-back-to-idle path and can re-stage an order at the table their text names; the bussing lesson turns it on, serves a table immediately and shortens that one meal to 3.2s, because the lesson is about the clearing rather than the waiting. The practice round runs with bussing on, so it rehearses the real loop.

## Carry-two — unimplemented, no longer load-bearing

`carryCapacity` flips to 2 after six deliveries but nothing in the pickup or carry logic supports holding a second ticket. `carrying` is a single object, not a queue. **The flip is currently dead code**: it changes a number nothing reads, so a player who reaches six deliveries gets no second slot and no error either.

This used to be the blocker that gated all tuning, because the old spawn floor of 1.04s sat far below the 2.74s round trip — orders arrived at nearly three times the rate one carry slot could clear them, and the game outran the player about thirty seconds in regardless of skill. **That is fixed**, not by building carry-two but by putting the spawn floor above the round trip: `SPAWN_FLOOR_MS` is 3400, so even at full rush the shift tops out at 17.6 orders/min against a 21.9/min ceiling. The game is now winnable end to end on one slot.

So carry-two is a design choice again rather than a structural necessity. It is still worth building — it is the difference between a fetch-quest and actually holding two orders in your head, which is the thing the game is about — but nothing is blocked on it now, and the tuning above is safe to iterate on without it.

If it does get built, the spawn floor should come down with it. Two slots amortises to roughly 1.4s per order, so a floor near 2.0–2.4s would restore comparable pressure. Implementation sketch unchanged: replace `carrying` with a small array, cap it at `carryCapacity`, auto-deliver whichever carried order matches the pad you are standing on, and show two floating tickets above the player with the fade rule applied per ticket.

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
2. **Play it and re-tune.** The shift was slowed a long way — two minutes on a fresh table at open, ramping over ten minutes — on Rone's call that it was too hard out of the gate. The numbers are measured but nobody has actually played the new curve, and the four constants at the top of the difficulty block are meant to be moved. The opening may now be too slack; that is a feel question, not an arithmetic one.
3. **Rone wants to revisit the picker flow** — the picker works and is verified, but where it sits in the title-screen journey is up for change.
4. Carry-two, whenever it is wanted; see the section above for why it is no longer urgent.
5. Smaller things, in rough order of how much they cost to leave: the scoring speed bonus is always 20 and rewards nothing (and there is much more room for a real one now that windows open at two minutes); the HUD label reads "Tables lost" while the dots deplete as lives remaining; the repository default branch is still `claude/new-session-e86btx` rather than `main` (Settings → General, two clicks).

Rone was also about to generate art in DALL·E. The advice given, still standing: with the avatar handled by DiceBear, spend that effort on the room — tables, counter, food icons, floor — where per-asset style consistency matters far less than it does for character parts.
