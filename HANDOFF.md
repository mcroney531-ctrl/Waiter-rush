# Dine-O Dash — Session Handoff

Read this first. It is the working brief for continuing development, written at the point where the previous session's environment had to be replaced. The README covers what the game *is* for anyone arriving cold; this covers what has been decided, what has been measured, what is unresolved, and what to be careful about.

## What this project is

A build for Articulate E-Learning Challenge #561 ("Online Training for Restaurant Servers & Waiters"). Instead of the usual branching scenario, it is a short Overcooked-style arcade game that trains the "in the weeds" skill of a server's job: holding multiple orders in your head while physically running the floor, under escalating pressure.

Vanilla JS and HTML5 canvas, no build step. `index.html` at the repo root *is* the site; the only other shipped files are `vendor/`, which holds DiceBear's avatar renderer and art set as pre-built static assets (no build step, nothing fetched at runtime).

The person you are working with is Rone. Working style notes are at the bottom — read them, they change how you should respond.

## Current state

Live at **https://mcroney531-ctrl.github.io/Waiter-rush/**, served by GitHub Pages from `main` at the repository root. Deploys on push to `main` — there is no build step, so a push is a deploy, usually live inside a minute.

Everything is on `main`; `git log --oneline` is the current list and this document does not try to mirror it. The commit messages are deliberately detailed and carry the reasoning and measurements behind each change. **`git log` is a real source, not ceremony** — if a number in here disagrees with the code, the commit that changed it says why.

**Repo housekeeping — done.** The default branch was `claude/new-session-e86btx` for a long time, because GitHub set it to the first branch pushed to an empty repo and pushing `main` later did not change it. It never affected the Pages deploy, which targets `main` explicitly, but it did mean a fresh clone silently got a four-file snapshot of the first commit — which is exactly what happened the first time Rone cloned the repo, and cost a confusing round trip. The default is now `main` and the old branch is deleted. `netlify.toml` is present and valid but unused, since hosting went to Pages.

The lesson worth keeping: **anything that only bites a newcomer will bite the newcomer**, and a note in a handoff is not a fix.

## How the code is laid out

One file, `index.html`, about 1830 lines: styles, then markup, then the whole game in a single IIFE. Rough order inside the script:

- Colour palette and layout constants, then the ramp/tip/flow/penalty constants as one named block
- `PASSES` (counter pickup pads), `BUS_STATIONS` (dish returns), and the per-table drop pad geometry
- `resetGame` / `updateHUD`
- **Avatar section** — local avatar generation and the picker
- Spawning, input, game logic (`tryPickup`/`inPickupZone`, `tryDeliver`, `tryBusPickup`/`tryBusDrop`, `checkAutoInteract`)
- **Tutorial section** — `TUTORIAL_STEPS` and its step machine
- `update(dt)` — the single update path for everything
- Drawing functions, then `render()`
- `loop` / `beginRun` / `startGame` / `startTutorial`, then event wiring

Canvas is a fixed 960×640 internal resolution scaled by CSS, matching the 3:2 of the painted board. **All geometry is measured off `assets/kitchen.jpg` and expressed as `A(artPixel)`** — see the Board section. Player is a circle of radius 26 moving at `PLAYER_SPEED` (550 px/s).

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
|      0s |          2:00   |     7.00s |        8.6 |                  54 |
|     60s |          1:50   |     6.64s |        9.0 |                  54 |
|    120s |          1:40   |     6.28s |        9.6 |                  54 |
|    240s |          1:19   |     5.56s |       10.8 |                  54 |
|    420s |            49s  |     4.48s |       13.4 |                  54 |
|    600s |            18s  |     3.40s |       17.6 |                  54 |

Verified live rather than derived: at shift open a fresh table reads 119.7s and the spawn gap is 6.99s; with the clock pushed to 600000 they read 18.0s and 3.40s. The on-screen countdown is true elapsed time.

**Movement.** `PLAYER_SPEED` is **550 px/s** (it was 220 — Rone asked for 2-3x and this is 2.5x). One-way counter-to-table is now roughly **0.55s**, round trip **1.10s**, down from 1.37s and 2.74s.

That invalidates two things that were derived from the old speed, so treat `PLAYER_SPEED` as a number with dependents:

- The **21.9 orders/min ceiling** in the table above was `60 / 2.74s`. It is now about **54/min**, so the shift no longer comes anywhere near outrunning the player. `SPAWN_FLOOR_MS` was originally set above the 2.74s round trip for exactly that reason; that constraint is now slack, and the practical ceiling is bussing rather than legs (see below).
- The **tip thresholds**, which had to be refitted. See Scoring.

**The d-pad was cut off at the bottom on phones.** `#wrap` was `100vh`, and on mobile `100vh` means the viewport *without* the browser's URL bar — so anything pinned to that element's bottom sits below the visible area. It is now `100dvh` (with the `100vh` line kept above it as a fallback), and the bottom-pinned controls add `env(safe-area-inset-bottom)` for notched phones. Verified across five viewports from 360×500 up to landscape: all four buttons fully on screen and individually reachable, with desktop unaffected.

Note the d-pad still overlays the canvas on short screens (7px on an iPhone SE, 166px in landscape). That is pre-existing and only matters because the canvas is a fixed 960×600 letterboxed by CSS rather than a real responsive layout — see the open items.

**The d-pad could not move diagonally.** `bindHold` set both axes per button, so pressing Up ran `touchDir.x = 0` and wiped the horizontal. Touch players got four directions where the keyboard got eight, which costs about 34% extra distance on a diagonal trip — the d-pad felt sluggish for a reason unrelated to speed. Each button now owns one axis. Verified with two-finger input on the real on-screen buttons in an emulated touch device: holding Up+Right yields `{dx: 0.7071, dy: -0.7071}` and the player actually moves on both axes. The combined vector is also clamped to ±1 now, since keyboard and d-pad both feed it and could otherwise sum to 2 and defeat the diagonal correction.

**Scoring.** A delivery pays `DELIVERY_BASE_C + tip`, where the tip scales with **how long the guest waited from their order appearing at the counter to it landing on their table**. Clearing a table pays a separate flat `BUS_PAY_C` and deliberately does not affect the tip. Values are in the money section below; the numbers quoted in this section predate the switch to cents and are given as fractions of the tip rather than absolutes.

The old bug is fixed: `speedBonus` used to read `table.patience` on the line *after* it was reset to 1, so it was always exactly 20 and rewarded nothing.

**Measuring absolute wait rather than patience remaining is the load-bearing decision.** Patience-remaining is the obvious version and it does not work: at the two-minute opening a leisurely 10s delivery still leaves 92% of the meter, so everything reads as fast, while the identical delivery at full rush (an 18s window) leaves 44% and reads as mediocre. Same play, opposite verdict, and no gradient at all in the part of the shift where players spend most of their time. Absolute wait is independent of the ramp and is also what a guest actually experiences.

`TIP_FULL_MS` (900) and `TIP_NONE_MS` (8000) are **fitted to measured play, and they depend on `PLAYER_SPEED`**. They have now been refitted twice, which is the thing to remember:

| speed | good play delivers in | curve that works |
| --- | --- | --- |
| 220 px/s | 1.7-5.4s | 2s / 18s |
| **550 px/s** | **0.85-3.3s** | **900ms / 8s** |

Curves that were tried and failed, all for the same reason — every delivery a competent player makes lands at the maximum, giving a flat top with nothing to chase: 6s/40s, 3s/25s, and (after the speed change) the previously-correct 2s/18s, which scored the new distribution 92-100 across the board.

The underlying cause is worth knowing: **a near-optimal bot's delivery time barely changes between the shift opening and full rush**, because bussing caps how fast orders can arrive so the queue rarely builds. Speed of legs, not queue pressure, sets the distribution — which is exactly why `PLAYER_SPEED` and these thresholds are coupled. If you change the speed again, re-run the bot and refit.

At 900ms/8s good play splits across the top two tiers — measured 15 big / 1 good over 16 deliveries at the opening, and 17 big / 9 good over 26 at full rush, the spread widening as the queue builds. A slower player still sees the whole range down to nothing. Score reconciles exactly against `sum(base + tip) + cleared * BUS_PAY_C` in both runs.

**These tier numbers come from the camping bot and are an upper bound**, for the reason set out under flow tuning below. Do not read them as what a person will see.

Tiers are `TIP_BIG` (0.85) and `TIP_GOOD` (0.5) of the tip fraction, shown as a floater rising off the table — label, total, and the wait in seconds, so the player can connect the reward to the cause without reading a manual. Tips are mentioned in the deliver lesson's success line and in the pre-shift blurb; a scoring rule nobody is told about teaches nothing.

## The pass, and money

**Pickup needs a marked pad, and there are two of them — one per section, both at the counter.** Touching the counter anywhere used to hand you an order, so brushing it while running past gave you a ticket you had never looked at, which quietly deletes the memory mechanic: you cannot hold a number in your head that you never saw. `PASSES` defines a pad under each section's NEXT UP ticket, `tryPickup` gates on `passUnderPlayer()`, and each pass only hands over its own section's queue.

The pads sit on the floor at the **base of the counter**, not on it — the counter is furniture you stand in front of. Getting them to read as "at the counter" needed `FLOOR_TOP` raised to `A(400)` so the player overlaps the counter's lower face; at the art's true floor line the pads were pushed down level with the table number plates and looked like they belonged to the tables instead.

Sections split on table x against `W/2`: tables 1, 2, 5, 6 are left, 3, 4, 7, 8 are right. An order is issued at its own table's end of the counter, so no section is further from its food than any other. Each side has exactly four tables and a table can only have one order outstanding, so the per-side cap of four is the natural maximum rather than an artificial throttle. The front of each queue is marked **NEXT UP** — that leaks nothing protected, since the ticket is legible at the counter anyway and the standing rule is about not revealing the table *once you have walked away with it*.

Two passes were built to fix a real asymmetry a single left-hand pass created, and it worked:

| | left/right gap | front/back row gap |
| --- | ---: | ---: |
| one pass, left end | 147ms | 186ms |
| **two passes** | **14ms** | 422ms |

The left/right bias is essentially gone. The remaining variation is front row versus back row, inherent to the layout and symmetric, so it reads as spatial texture rather than a lopsided design.

**One thing it cost:** average trips got shorter, which compressed the tip gradient toward the top — the tier split went from 8 big / 6 good to 13 big / 3 good. Tip values still span, so it is not the flat maximum this curve keeps collapsing into. If it wants opening up, lower `TIP_FULL_MS` and re-run the bot rather than guessing.

**Score is money, held in cents.** `DELIVERY_BASE_C` (500) is what a table leaves regardless, `TIP_MAX_C` (1000) is the speed-earned part, and `BUS_PAY_C` (200) pays for clearing so bussing is not unpaid work. A table is therefore worth $5.00-$15.00, doubling its tip while flow is lit. A 100-second bot shift earned about **$212** when that was measured; with carry-two, waves and flow all in, peak-rush bot runs now clear **$600-$830** over the same window. Per table the numbers still read plainly, but the running total has not been looked at as a score — see the open items. Integer cents rather than a running float means a shift total cannot drift; `money()` is the single place cents become a string, and everything on screen goes through it.

One testing note worth keeping: reconciling score against `sum(base + tip) + cleared * BUS_PAY_C` will be off by a cent or two if the probe records `Math.round(waited)`, because the game computes the tip from the unrounded value. Record the raw wait and it matches exactly.

## Food art

Orders are plated dishes in `assets/food/` — ten of them: pizza, sub, tacos, pasta, salad, club, soup, ribs, tart, burger. They replaced the emoji in `FOOD_ITEMS`. Each is a speech-bubble plate with a pointer at the bottom, so a whole ticket, not an icon that sits inside a card. The old white card is gone.

Three things about how they are prepared, because the source files were not uniform:

- **Backgrounds differed.** Seven arrived with real alpha; three were flat near-white with compression noise. Those were keyed by **flood-filling from the border**, not by thresholding — the plate's cream is close enough to white that a global threshold ate into it. Verified by rendering every plate on magenta and checking mean edge alpha; all ten came out clean.
- **Scale differed a lot** — cropped bubble widths ranged 723px to 1527px. Each is cropped to its own alpha bounds and fitted into a common slot, so a wide plate and a tall one both sit correctly.
- **They are bottom-aligned** on the counter's front edge, so every pointer lines up along one line however much the dishes differ in shape.

The table number is drawn as its own badge (`drawTableTag`) rather than baked into the art, so one set of plates serves all eight tables. It appears under the plate on the counter and under the carried plate in hand — and it still obeys the fade rule, disappearing with the plate once you walk away.

`TICKET` sets the slot geometry. The sizing is deliberately tight: at four plates a side, anything larger makes the two queues meet in the middle and the section split — the entire point of two passes — stops being visible.

## Bussing (eat / clear cycle)

Serving is no longer the end of a table. The full cycle is `idle → waiting → happy → eating → dirty → clearing → idle`, and **a table that is not `idle` cannot take a new order** — `spawnTicket` filters on `idle`, so this falls out of the state machine rather than needing a special case.

That blocking is the whole point. There is deliberately **no penalty timer** on a dirty table: the cost of ignoring it is that your usable floor shrinks, which throttles your own order flow. It mirrors why real restaurants track table turnover, and it avoids stacking a second failure state on top of walked-out guests.

Dishes share the single carry slot with orders, so every trip is a triage decision. They go to the **dish return** (`BUS`), a station against the right wall in the corridor between the table rows — deliberately not part of the counter, so clearing is a trip you choose to make rather than something you do in passing. It cannot live along the bottom, because the tutorial's instruction panel owns that strip.

Two rendering notes. Plates are **drawn as vectors, not emoji** — the food icons are emoji and render fine, but `🍽️` is missing from enough font stacks that it showed up as a blank box in testing. And the dishes sit **offset to the right** on the table top: centred, they covered the table number, which is the one thing the player needs to read on exactly the tables that want attention.

Carried dishes never fade. The fade exists to force you to remember a table number; the dish return is a fixed destination, so hiding them would be noise rather than difficulty. The `CLEAR` pad label is likewise safe — a dirty table is public knowledge, so relabelling it gives nothing away about the order you are carrying.

`EAT_MS` (22000) is the lever that decides whether the floor breathes or clogs. Measured with a bot playing 100 seconds of the real shift: the floor settles at **3–4 tables in service with 3–4 eating and about 1 waiting to be cleared**, 14 delivered and 10 cleared, no lives lost. So roughly half the floor is tied up mid-meal at steady state, which is the intended squeeze. Note the consequence at full rush: eight tables with 22-second meals cannot absorb 17.6 orders/min, so `spawnTicket` simply finds no idle table and skips. The game self-throttles rather than punishing — nothing is lost, there are just fewer orders. Turn `EAT_MS` down if the floor feels too tied up.

The tutorial gained a **Clear the table** lesson (step 5 of 6). Early steps set `bussingEnabled = false` so they keep the old straight-back-to-idle path and can re-stage an order at the table their text names; the bussing lesson turns it on, serves a table immediately and shortens that one meal to 3.2s, because the lesson is about the clearing rather than the waiting. The practice round runs with bussing on, so it rehearses the real loop.

## The approved design — built, measured, live

Rone reviewed the build and approved a set of changes answering one question: **the game is currently just running back and forth.** The diagnosis is worth keeping, because it explains why these and not others:

> There is exactly one task type, you can hold exactly one of it, and its destination is decided the moment you pick it up. That is the structural definition of ping-pong — there is never a moment where two things are worth doing and you must choose. Memory is the only real skill, and routing barely matters because you can only carry one plate.

Three levers break that: more than one thing **in hand**, more than one **kind of demand**, or non-uniform **pacing**. Rone took the in-hand and pacing levers and declined the second demand stream.

**Explicitly declined: table interrupts** (a seated table flagging you down for a refill, check-back or the bill). It was recommended and turned down — do not re-propose it without new reason.

### 1. Carry two, on a tray — built

`carrying` is gone. `carried` is an array of `{type, tableId, icon, pickedAt, orderedAt}` capped at `carryCapacity`, which starts at 1 and flips to `CARRY_MAX` (2) at `CARRY_UNLOCK` (6) deliveries — the flip is now read by the pickup path, so it finally does something. `tryDeliver` walks the carried orders and hands over whichever one matches the pad you are standing on.

The plates draw side by side above the player, **each fading on its own `pickedAt` timer**, so the first one you picked up goes blank while the second is still legible. A faded plate leaves a mustard dot: still carrying something, without saying what. That is the point — the real gain is that you hold **two table numbers in your head instead of one**, so this deepens the core hook rather than sitting beside it.

`BOTH HANDS FREE` announces the unlock. Both that banner and the flow flourish draw at `FLOOR_TOP - 56` and above, **on the bench, never below `FLOOR_TOP`** — the band under it is where the table number plaques hang, and a banner there covers the numbers at the exact moment the game is telling you to memorise two of them.

### 2. Party sizes — on hold

Two-tops, four-tops and six-tops: bigger parties tip more, eat longer, leave more dishes. Cheap logically, but **it needs an art decision** and Rone chose to hold it there. The board is painted with eight identical tables, so party size cannot be shown by making a table bigger. It needs a drawn marker — guest count, a badge by the number plate, or something on the plates. Settle that with Rone before building.

### 3. Rush waves — built

`waveFactor()` modulates the spawn gap on a `WAVE_PERIOD_MS` (42s) sine. Depth ramps with the shift, `WAVE_DEPTH_START` 0.18 → `WAVE_DEPTH_END` 0.55, so early service breathes gently and late service arrives in slams with real troughs between. Peaks and troughs read as drama where a linear slider reads as a slider.

### 4. Endless shift, richer ramp — built

No win state; the run ends when you lose three tables. Rone's reasoning, which overrode the argument for a completable service: *"the game should get progressively harder (faster eat times, higher capacity, rush intensity). it'll end unless someone's a beast."*

Four things now ramp instead of two:

- **Patience** — `PATIENCE_START_S` 120 → `PATIENCE_END_S` 18
- **Spawn gap** — `SPAWN_START_MS` 7000 → `SPAWN_FLOOR_MS` 3400, then modulated by `waveFactor()`
- **Eat time** — `EAT_START_MS` 22000 → `EAT_END_MS` 12000. Faster turnover, more churn, more bussing pressure.
- **Counter queue depth** — `QUEUE_CAP_START` 2 → `QUEUE_CAP_END` 4 per side. This is what Rone meant by "higher capacity": *"capacity = counter queue"*, i.e. the harder reading. The player's carry capacity is a one-time progression unlock, not a difficulty axis.

### 5. Wrong deliveries cost something — built, and the fix matters

Standing on a waiting table's pad while carrying someone else's food costs a broken streak, `WRONG_PENALTY_MS` (1200) at `WRONG_SPEED_MULT` (0.45), and a `WRONG TABLE / no tip` floater.

**The trap, discovered by measurement:** the first version fired the instant you touched a wrong pad. But walking to table 4 means crossing the pads of 1, 2 and 3 on the way, so ordinary movement triggered it — and it broke the flow streak on nearly every trip. Flow lit on **0% of deliveries (0/16)** and loosening the flow thresholds did not help, because the problem was not the thresholds.

The fix is `WRONG_DWELL_MS` (420): a wrong delivery has to be a **deliberate act, not transit**. It only counts if the table is actually `waiting`, you hold no order for it, and you linger. The dwell also only accumulates once `WRONG_COOLDOWN_MS` (900) has run out, so parking on a wrong pad charges you every ~1.3s rather than twice inside the first second.

Verified both directions: lingering costs you exactly once, and one continuous sweep across four pads without stopping is free.

### 6. Flow state — built last, for the reason below

A streak of `FLOW_STREAK_NEEDED` (3) consecutive fast deliveries — fast meaning a tip fraction at or above `FLOW_FAST` (0.86) — lights it, and it multiplies tips by `FLOW_MULT` (2) until a slow delivery, a walkout or a wrong table breaks it. Chosen over a speed or capacity boost because it changes *how you play* — you start deciding between banking a safe delivery and chasing one more — rather than just making you stronger.

**It was built last on purpose.** It keys off the tip curve, so carry-two, waves and the eat-time ramp all had to disturb that curve first. Building it earlier would have meant tuning it twice.

The streak updates before the tip is worked out, so the delivery that lights flow is itself the first one paid double.

## What flow tuning is actually based on

The measurement problem worth knowing about: **a bot camps at the pass.** `orderedAt` is the table's spawn time, so for a bot that is already standing at the counter when the ticket lands, `waited` collapses to pure travel time and flow stays lit almost permanently. That is an upper bound, not a model of play — a human is mid-loop when the ticket appears, and has to read it, remember it and route.

So `human.js` in the scratch pattern adds a `LAG` reaction delay before acting on a new ticket. Measured at peak rush:

| Player | Flow lit |
|---|---|
| Perfect camper (`bot.js`) | 79–85% of deliveries |
| 1.2s reaction lag | 50% |
| 2.5s reaction lag | 45% |

Roughly half the time, losing it hurts, and it is unreachable as a permanent state. That is the shape wanted, and it is why `FLOW_FAST` is 0.86 rather than something tighter — tightening it against the bot would tune for a player nobody is.

**If you retune flow, use the lagged bot, not the camper.**

## Floaters carry their own outline

Floaters land wherever the table is, which on this board means over number plaques, `SET DOWN` labels and the ticket rail. They are drawn with a `rgba(24,19,14,0.85)` stroke under the fill, which is what keeps them readable without moving them somewhere less useful. This was a real bug — the `WRONG TABLE` floater was illegible where it collided with the ticket bubble above the right-hand pass, and the two share a column.

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

**4. Still open from the original brief:** audio is two effects, not a soundtrack; no difficulty feel-tuning pass has happened by *feel* — every value is measured, none is played; the canvas is a fixed 960×640 scaled by CSS rather than a true responsive layout; and the HUD label reads "Tables lost" while the dots deplete as lives remaining, so label and indicator point in opposite directions.

## Verifying your work

Rone reviews visually and does not read code. Screenshot and instrument rather than asserting — and note that the previous session repeatedly caught real bugs this way that reading the code did not reveal.

Playwright and Chromium are preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; do not run `playwright install`). Serve the repo with `http-server` and drive the page.

The useful trick: the game lives in an IIFE with no globals, so instrument a throwaway copy rather than the real file. Copy `index.html` to `probe.html` inserting a debug handle before the `// initial static preview render` line:

```js
Object.defineProperty(window, '__dbg', { get(){ return {
  get tables(){return tables;},   get carried(){return carried;},
  get tickets(){return tickets;}, get player(){return player;},
  get score(){return score;},     get cleared(){return cleared;},
  get deliveries(){return deliveries;}, get mode(){return mode;},
  get flow(){return flowLit;},    get streak(){return streak;},
  get cap(){return carryCapacity;}, get wrong(){return wrongTurns;},
  get tut(){return tut ? {index:tut.index, practice:!!tut.practice} : null;},
  get steps(){return TUTORIAL_STEPS.length;},
  PASSES: PASSES, BUS: BUS_STATIONS, set elapsed(v){elapsed = v;} };}});
```

Getters, not a snapshot object — `carried` and `tables` are reassigned, so a plain object captures stale references. `set elapsed` is what lets a run be dropped straight into peak rush without waiting ten minutes for the ramp.

Then drive real keyboard events and read actual state. **Delete `probe.html` before committing** — it is not in `.gitignore`.

Three things the last session learned driving this, all of which cost a false failure first:

- **Delivery is automatic on entering the right pad.** A bot walking toward a wrong table can cross the correct one and hand the plate over en route, so any wrong-table test has to re-check its preconditions on arrival and retry.
- **The tutorial's coach copy is painted on the canvas, not in the DOM.** Read step progress from `tut.index`, not from an element.
- **Tutorial step 1 needs `tut.moved > 300`.** A bot that parks on its idle target never clears it — make the idle behaviour pace between two points rather than stand still.

Two environment gotchas that cost the previous session time. A stale `http-server` from an earlier turn can hold the port and silently serve the wrong directory — if a page loads as "Index of /", that is what happened. And **headless Chromium cannot use the sandbox proxy**: it returns `ERR_CONNECTION_RESET` with every proxy configuration tried, while `curl` through the same proxy succeeds. Consequence: **screenshots always render in fallback system fonts, never the real Alfa Slab One and DM Sans.** Do not chase this, and do not tell Rone a font problem exists in the game — it is a sandbox artefact only. For anything needing a real external asset in the browser, fetch it with `curl` and inject it (that is how the avatar render path was verified).

## Working with Rone

Rone works visually and in-browser rather than as a traditional developer. Prefers short, directive feedback and surgical edits over large rewrites once something is close. Prefers prose over bullet lists in conversation — this document is structured because it is a reference, not a reply.

Two things that have worked well and are worth continuing. **Push straight to `main`** — it was explicitly chosen so changes go live in about a minute for visual review; each change is its own commit, so reverting is easy. And **flag what you did not verify.** Rone has consistently responded well to being told the limits of a check rather than being handed a confident summary; the avatar feature shipped with its unverified surface named explicitly, which is why it is item 1 above rather than a surprise later.

When something is genuinely ambiguous, ask with a recommendation attached rather than presenting a neutral menu. When it is not ambiguous, just build it.

## Open direction: the character, and "Dine-O Dash"

Rone played the walk-cycle prototype: *"I like the movement concept a lot, it's a lot more fun. but I think we'd need to do a shit ton of iterating just to get it in a place I'd feel even semi-content with."* The animation approach is not the problem — the timing, facing and draw order already work. The problem is that the body is primitives drawn in code, and **polish comes from finished frames, not from a better system.**

**The framing changed and it changes priorities.** Asked whether a non-realistic theme would hurt the e-learning angle, Rone: *"you can do whatever you really want with these challenges... for me the objective of this project is actually building a fun/clean & polished game, the waiter thing is low key barely relevant to me this week."* So judge everything on feel from here. The memory mechanic and its standing rule stay, but **on game-design grounds, not pedagogical ones** — it is what makes this more than a fetch quest.

### Dine-O Dash

Rone's proposal, and it is a good one: rethemed so the player is a dinosaur waiter who earns "cooler waiter accessories" as ranks. Not committed, but nothing has been raised against it.

Why it is worth doing, in order of weight:

1. **It lowers the polish bar permanently.** Humans are the hardest thing to animate credibly because every viewer has a lifetime of priors on how people move and what faces look like — that is *why* the placeholder reads as wrong. Nobody has that prior for a cartoon dinosaur, so the same animation quality reads as stylised instead of broken. That directly answers the "shit ton of iterating" objection.
2. **Dinosaur art is abundant and pre-animated.** Packs with 20+ animated, 8-directional dinosaurs exist. Nothing equivalent exists for waiters in a painted style. "Buy a premade pack" moves from luck to likely.
3. **Accessories are far cheaper art than characters.** A rank is a bowtie, an apron, a waistcoat — small pieces that ride the body without needing their own animation, layered on the frame index the sprite hook already exposes.

What survives untouched: the kitchen board (a room, no people in it), all ten food plates (human food served by dinosaurs is funnier), dish returns, pickup signs, every mechanic, the tutorial, every tuned number. What changes: the character, the title, and `assets/landing.jpg`, which has human servers in it.

**The one real cost: the avatar picker dies.** Open Peeps is human heads, so DiceBear cannot serve a dinosaur. The replacement is the same step flow over dino species, colour and starting accessory. Upside: `vendor/` goes away and the game ships with no third-party art at all.

### Settled: four directions

Rone chose four-directional over left/right only. That rules out side-scroller-only packs, which is most of the cheap dinosaur art, so the AI-generation routes (options 1 and 2) matter more than the buy-a-pack route now.

**It is three directions of art, not four.** Left mirrors right, which the hook does natively, so only *down*, *up* and *side* need drawing. At six to eight frames each that is 18–24 frames rather than 24–32.

Priority if the set has to be built incrementally, since the hook takes facings independently and any facing can share another's row:

1. **Side** — the most-seen direction by far, since travel is mostly horizontal along the rows, and the one that tells you whether a generator is any good.
2. **Down** (front) — seen constantly at the pass and the drop pads.
3. **Up** (back) — least seen. Until it exists, point `up` at the down row. That ships a character who faces you while walking away, which is exactly what the drawn body does today, so it is a known-acceptable degradation rather than a regression.

One caveat on mirroring: it flips asymmetric detail. A plain dinosaur is fine. Anything one-sided — a name badge, an apron tie — belongs in the accessory layer, which is drawn separately and can compensate.

### Options, ranked

Ranked against a live deadline, a painted style nothing off-the-shelf matches, and a one-file no-dependency architecture.

1. **AI sprite-sheet generator trained on your own reference art** (SpriteFlow, Ludo.ai, Layer, SEELE). The only route that can match this specific look, because you feed it the existing kitchen and landing art. Also solves frame-to-frame consistency, which is what sinks generating frames one at a time — these produce the sheet as a unit. Ceiling unproven; nobody here has seen their output.
2. **Rone's own DALL·E pipeline, body layer only.** Four successful art batches already shipped this way, so the style is guaranteed. The paper doll means only the body needs frames, and a torso has far less to drift than a face.
3. **Buy a premade animated pack.** $10–40, available today, professionally animated, zero iteration. Ranks third only because style match is luck — if one matches, it goes first.
4. **Keep iterating the drawn body.** Free, zero delivery risk, fully reversible. Rone's judgement is it will not reach his bar, and that is probably right, but it is a fine fallback.
5. **LPC Spritesheet Generator.** Free, finished, layered, four directions, closest thing to our picker that already exists. Ranked here *purely* on style — pixel art on a painted board looks like two games stapled together. If the game ever went pixel art, this jumps to first. Art is GPL3 / CC-BY-SA 3.0: attribution for every contributor, and share-alike.
6. **Spine or LoongBones skeletal rig.** Highest fidelity and smoothest motion, and preserves the painted look exactly. Wrong side of the deadline: paid tooling, a learning curve, and it puts a runtime dependency into a project whose whole architecture is one self-contained file.
7. **Mixamo pre-rendered to sprites.** Best motion on the list and free, but a 3D-realistic look needing toon shading, and a Blender pipeline rather than an afternoon.
8. **Commission an artist.** Highest ceiling, wrong timeline for a weekly build.

**Rejected after review: [pixelhunt 200+ Dinosaurs Avatars](https://pixelhunt.itch.io/200-dinosaurs-avatars), $3.99.** Not the price — the wrong shape three times over. The listing promises *"different stylizations, different lighting, different locations"*, i.e. 206 images that deliberately do not match each other, which is right for visual-novel portraits and fatal for one game world. They are illustrated portraits with scenes baked behind them, so keying them out is not the flat-colour job the food plates were. And it is 285 MB against a 1.8 MB game. No animation either. **Reading an asset listing as a spec is the skill here: "avatars" and "icons" mean static portrait, every time.** Search `dinosaurs` + `sprites` instead.

### What is already built for this

`playerSheet` in `index.html` — null by default, drawn body runs. Set it and frames take over. It carries cell size, scale, anchor, a row per facing (any facing can mirror another) and frame ranges for walk and idle. The walk frame comes from the same distance-driven phase the drawn body uses, so swapping art changes only the art. A missing sheet falls back rather than leaving the player invisible. A rank/accessory layer is a second sheet on the same frame index.

## The board is `assets/board.jpg`, and it carries no UI

The Dine-O Dash dining room replaced the painted `kitchen.jpg`. Two things moved from the art into the code as a result, and both were invisible failures rather than errors.

**Table numbers.** They were painted into the old board. The game never drew them — there is even a comment about offsetting the timer so it would not cover a number that the game itself was not rendering. On a board without painted numbers, all eight tables became anonymous, which deletes the entire mechanic: the game is remembering which table a plate belongs to.

`drawTableNumber` now draws them, on the left of each tabletop, **last in `drawTable` so nothing can ever cover one**. Food and dirty dishes moved to the right half of the table so both read at once. Drawing them also removes a whole bug class — a painted 3 above a table the game calls 4 would be miserable, and now they are the same thing by construction.

**The SET DOWN pads.** Same story: painted into the old art, with the game only drawing the active and dirty states over the top. `drawDropZones` used to `continue` when a pad was neither. On the new board that left nothing to walk to. There is now a resting state — dashed mustard outline plus the label — which also survives a change of floor colour in a way a painted pad does not.

**The lesson generalises:** anything the old art happened to provide is a hidden dependency, and it fails silently rather than loudly. Before swapping a board, ask what the previous one was carrying.

### Geometry for this board

`FLOOR_TOP` 300, `R1` y 465 / pad 590 / bar 398, `R2` y 700 / pad 855 / bar 612, passes at (370, 357) and (1180, 357), dish returns at (115, 760) and (1425, 760) — all in art-space px on the 1536x1024 board.

Verified by walking the character to all twelve stops — both pickups, all eight tables, both dish returns. `groundtest.js` in the scratch pattern does this and is worth rebuilding whenever the board changes.

**This board is interim.** It will be replaced by a 3D room composed in Meshy Scene. The spec asks for matching proportions specifically so the geometry above is mapped once rather than twice.

## Character production spec (Dine-O Dash)

Settled across a long design pass with Rone and ChatGPT/DALL-E. Written down because it is what twenty designs get checked against, and it was spread across a chat log.

### The pipeline

Concept art -> DALL-E **production render** (a technical asset, not an illustration) -> Meshy image-to-3D -> auto-rig -> walk animation -> GLB -> `tools/` render pass in headless Chromium -> sprite sheet -> `playerSheet` in the game.

**Proven:** everything from GLB onward. Three.js installs from npm, WebGL 2.0 works in headless Chromium, and a rigged GLB renders to transparent four-direction sprite frames that run on the board. 48-89 KB per fully animated character. No Blender required.

**Unproven:** everything before GLB. Whether Meshy produces a riggable mesh from a DALL-E image, and whether the auto-rig survives a tail, are the open questions.

### The rule that orders everything else

> The template is not the PNG. The template is the first character that completes the whole pipeline.

Every criterion below can be judged in DALL-E. The expensive failures cannot: Meshy fusing an arm to the belly, the rigger refusing the tail, the walk shearing the apron through a leg, the whole thing reading as mush at 96px. **Do not generate character two until Tyrone tier 1 is walking on the board.** One mistake instead of twenty.

Corollary, and it is the reason the production renders look boring: *judge them as technical assets first and artwork second.* A less stylish pose that yields a cleaner rig wins. Marketing art can be made later from the finished 3D model; a beautiful concept image that fails the pipeline has no production value.

### The production render (Meshy input)

- Symmetrical, front-on, neutral standing. No action, no attitude, no 3/4 camera.
- **A-pose with arms 45 degrees out minimum.** ChatGPT proposed 20-30; that is too tight for a round-bellied character and the arms will rest on the belly. The whole point is clear air between arm and torso so the mesh does not fuse and the rigger can find a shoulder. Mixamo's own docs say it processes models **in a T-pose**, so if the auto-rig disappoints, go wider rather than narrower.
- Feet flat and parallel, shoulder-width, with a visible gap between the legs.
- Hands open and empty, fingers separated. **No props** — the game draws trays and food itself.
- **Short stubby tail**, held low and clear of the legs. Mixamo lists large tails with wings and extra limbs as auto-rigger breakers, and it also fixes the wide-silhouette problem.
- Mouth closed. Open jaws become messy interior geometry.
- **No overlap.** No apron tails wrapping legs, no scarves over arms, no jacket flaps crossing thighs. Overlap is ambiguous geometry.
- **Rigid accessories, not dangling.** Bow tie not necktie, tucked neckerchief not scarf, cropped jacket not tails. Free-hanging cloth melts.
- Big simple forms. Meshy preserves large shapes and loses small detail.
- Flat plain light-grey background, soft even frontal light, **no ground shadow** — baked lighting travels with the character forever. The flat background also lets downstream tooling isolate the character; a blurred scene defeats `tools/readcheck.py`.
- Full body, nothing cropped, small margin.
- Proportions ~3.5 heads tall. ChatGPT's first spec said "6.5 heads tall" *and* "head ~30% of height", which are contradictory — 30% is 3.3 heads. 6.5 is realistic adult human and would produce a lanky figure nothing like the concept.

### Readability, and why it dominates

**The player renders about 96px tall on a 960px board.** At that size a bow tie is roughly four pixels; buttons, stitching and teeth are invisible. Everything below follows from that one number.

Acceptance test — at 96px, from front **and** back, in under a second:

- Species is identifiable
- Tier is identifiable
- Character identity is identifiable
- The character separates from the floor **in greyscale**, not only by hue
- Limbs are still riggable
- Species silhouette stays dominant over costume

`tools/readcheck.py <image>` renders the first four of those: art at 96px on the floor colour, a greyscale value test against the floor's grey, and a hard silhouette.

**Value, not hue.** The floor is warm wood and the current Tyrone sits at nearly the same brightness — he separates by colour alone. Hue is the first thing to fail at small sizes, on poor screens, and for colour-blind players. Each character wants to be clearly lighter or clearly darker than the floor.

### Tier progression

One **major silhouette change** per tier, not an accumulation of accessories:

1. Base.
2. Torso changes — waistcoat, apron shape, contrasting back panel.
3. Head silhouette changes — cap, visor, chef hat.
4. Iconic outerwear or shoulder profile.

Two constraints on that ladder:

- **Every tier signal must read from behind.** The player walks away from camera about a quarter of the time. Bow ties, waistcoat fronts, apron bibs and order pads are all invisible from the back, which would make tier unreadable for a whole facing direction.
- **Species silhouette is sacred; career layers on top.** Frill, horns, crest, snout stay the first thing you notice. This collides with the tier-3 head rule, since the head is exactly where species identity lives — so tier-3 headgear must *extend* the head outline, never obscure it. A visor under the frill, a cap behind the horns. A chef hat that swallows Trixie's frill satisfies one rule by breaking the other.

Small details are not banned, they are demoted: they live at character-select size as a reward for looking closely, and never carry progression.

### Getting art in, and out

Source art comes in **through the repo, not through chat**. Chat uploads live only as long as a session's container; anything in `art-source/` is versioned and survives, which matters because sprites get re-rendered whenever the camera, scale or frame count changes. The sandbox also cannot reach meshy.ai, itch.io, quaternius.com or poly.pizza — the network policy blocks them — so the repo is the only channel between a local machine and this environment.

The loop, once a rigged GLB exists:

```
drop it in art-source/<name>.glb, push
node tools/render_sprites.mjs art-source/<name>.glb --name <name>
```

That writes `assets/sprites/<name>.png` and a `.json` holding the exact `playerSheet` object, with the anchor **measured from the rendered pixels**. It also reports when a GLB has no animation rather than silently producing 24 identical frames — which is what Meshy's mesh/texture export does, as opposed to its rig-and-animate export.

Useful flags: `--frames` (default 8), `--cell` (192), `--elev` (34 degrees, matches the board), `--lift` (raise a naturalistic palette toward cartoon), `--anim` (clip name to match, default Walk).

Dev dependencies live in `package.json` and never ship; `index.html` still has none. The renderer prefers a Chromium the environment already provides over letting playwright download its own.

### Render-pass gotchas, learned the hard way

From the Quaternius trial run, and they apply to any GLB:

- **Force `metalness = 0`.** The pack shipped 0.4 with no environment map, and a metal with nothing to reflect renders black. The first pass came out as silhouettes for this reason alone.
- **Lift the palette.** Naturalistic greens and browns read as a black blob on a wood floor.
- **Measure the anchor from rendered pixels**, never guess it, or the character floats or sinks. Take the union bounding box across all frames; `anchorY` is its bottom edge over the frame height.
- **Yaw mapping** for a model facing +Z: 180 = toward camera (down), 90 = right, 0 = away (up), 270 = left. Left mirrors right in the hook, so only three directions need rendering.

## The roster and the tier ladder

Built and tested. `ROSTER` in index.html is characters × tiers; a character is four tiers of the same dinosaur with progressively better kit. Sheet configs are **inline, not fetched** — the game still runs from a `file://` double-click, which a fetch of the sibling `.json` would quietly break. Everything shared lives in `SHEET_BASE`, so a tier is one line and `render_sprites.mjs` prints that line ready to paste.

Promotion is on money earned this shift: `TIER_UP_C = [0, 7500, 20000, 40000]`, so `$75 / $200 / $400`. Those come off a measured curve, not a guess — the lagged bot that stands in for a human earns `$816` over a 240s run of 39 deliveries, crossing `$50` at 25s, `$200` at 81s and `$400` at 146s, which puts a promotion every 40-60s. Re-measure with `curve.js` if the economy or the spawn ramp moves, since they sit upstream of this.

Three behaviours worth knowing, all covered by `tiers.js`:

- **All tiers preload at startup.** A promotion that waited on a download would drop to the placeholder body at the exact moment the game is drawing attention to the character.
- **A tier with missing art is skipped silently** — no banner, the player keeps what they had, and the next real tier still fires. So tiers can land one at a time.
- **Promotion is one step per score change**, so a single fat delivery cannot skip a tier nobody got to see.

The level-up moment is a bench banner plus an expanding ring at the character's feet. The ring exists because the banner alone announces the reward somewhere the character is not; the banner sits on the bench because **nothing covers the table numbers** — that rule has now bitten three separate features.

## Sound

Two effects, both **synthesised rather than sampled** — there are no audio files, so this costs nothing on first paint and works offline. It also buys something a fixed sample cannot: the tip sound is *computed* from how good the tip was, so speed is audible before the number is read.

- **Footsteps** fire off `player.walk`, the same phase that drives the legs — a footfall every half cycle, two per stride, matching what the animation shows. Driving it off distance rather than a timer is what keeps the sound on the foot at any speed, including the wrong-table slowdown. At 550px/s over a 34px stride that is about five a second.
- **The register** plays more of itself the better the delivery: drawer only and a flat thunk for no tip, drawer plus one bell for a tip, a rising pair at `TIP_GOOD`, and a third note on top at `TIP_BIG` or in flow.
- **A click on pickup** at the pass. It fires on every single order, so it is the sound that most needs to stay out of the way — short, dry, nothing that rings.
- **Ceramic on bussing**, split across the two halves of the job: one held clink lifting a stack of dirties, a spread of three to five impacts plus the bin underneath when they go in the return. Spreading them over a few tens of milliseconds is the whole difference between plates and a click.
- **A falling pair when a table is nearly out of patience**, at `WARN_AT` (0.22). Falling rather than rising on purpose — up reads as reward, and this is the opposite.

The warning is the only one of these that touches the standing design rule, so it is worth being explicit: it fires for *any* waiting table, it does not say which, and every table's patience is already drawn on the board as a countdown. It is a second channel on information the player can already see, not new information, so it does not tell you which table your carried order belongs to.

It also collapses. Eight tables can cross the line in the same frame, and without `WARN_COOLDOWN` (900ms) that is eight overlapping copies of the same sound. A `warned` flag per table keeps it to once per order rather than once per frame.

Nothing is created until the first gesture — browsers block audio before one, and a context built at load just starts suspended and stays there. Mute is a HUD button and the `M` key, persisted in `localStorage`.

Every level worth changing is a named constant at the top of the section (`SFX_MASTER`, `STEP_SCUFF`, `STEP_THUMP`, `TIP_DRAWER`, `TIP_BELL`), because this has to be judged by ear and it was written by someone who could not hear it. Note that footstep *cadence* is not tunable that way — it follows the legs by design, so if it reads as busy the fix is the volume.

`tools/sfx.js` verifies all of it without audio output, by patching the AudioContext prototype and counting the nodes the game builds — 14 checks covering footstep rate, silence while standing, the register firing on a real delivery, the warning firing once and collapsing across a full floor, and mute surviving a reload.

## Immediate next steps

1. **Get character frames.** Four directions is settled, the sprite pipeline is proven end to end, and the roster is waiting on art. Only side, down and up need drawing — left mirrors right. Tyrone tier 1 is live; tiers 2-4 and the other four species are in production through Meshy.
2. **Play it.** Rone has started. The whole difficulty model is measured, not felt — two minutes on a fresh table at open may be too slack, 550 px/s may be too twitchy, `$5` base against `$10` speed may be the wrong split, and flow at roughly half of deliveries may land differently in the hand than on paper. All are single named constants.
3. **Party sizes are the one approved item still unbuilt**, waiting on an art decision from Rone: how to show a two-, four- or six-top on a painted board of eight identical tables. Everything else in the approved set is live.
4. **The score scale is unexamined.** Ninety seconds of peak rush now pays out around `$600`. Per-table the numbers are readable (`$5` base plus up to `$10` of tip, doubled in flow), but the running total gets large fast for an endless high-score game. It may want a different base, or it may be fine — it is Rone's call and a one-constant change either way.
5. **The picker is now a six-step flow** — head & hair, skin, facial hair, glasses, uniform colour, expression — opening straight into the tutorial with no title screen. If Dine-O Dash happens this is rebuilt over dino options; the flow itself is worth keeping either way. — it works and is verified, but where it sits in the opening journey is up for change.
6. Smaller things, in rough order of how much they cost to leave: the HUD label reads "Tables lost" while the dots deplete as lives remaining; audio covers footsteps and tips but nothing else; the canvas is a fixed 960×640 letterboxed by CSS rather than a real responsive layout, which is why the d-pad overlays the board in landscape.

The art is in: the landing key art, the painted kitchen board and ten plated dishes all landed. The remaining art gap is party-size indication.
