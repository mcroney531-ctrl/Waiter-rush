# Dine-O Dash

*Formerly Waiter Rush — the repository still carries the old name.*

A short Overcooked-style arcade game built for Articulate E-Learning Challenge #561 ("Online Training for Restaurant Servers & Waiters").

Instead of a branching scenario, it trains the "in the weeds" skill of a server's job: holding multiple orders in your head while physically running the floor, under pressure that escalates the longer the shift goes.

## How it plays

Order tickets stack up on the pickup counter across the top of the screen, each showing a dish and a table number. Walk into the counter to grab the top ticket. Once you carry it away, the ticket fades after a short grace window — so you actually have to remember which table it was for. Walk back toward the counter to re-reveal what you're holding if you blank on it.

Every table with an open order drains patience, shown as a meter with a live countdown of the seconds left beside it. Let one run out and the table goes angry, you lose one of three lives, and the order is gone. To deliver, step onto the dashed "set down" pad in front of the table — you never have to walk through the furniture. Every pad looks the same whether or not it is the one you want, since marking the right one would give away the table number you are supposed to be remembering. Setting an order down at the wrong table is harmless.

Controls are arrow keys or WASD on desktop, and an on-screen d-pad on touch devices. Spacebar also forces a pickup/deliver attempt as a backup.

## Your waiter

"Pick your waiter" opens a character select: the cast of dinosaurs, each shown
in the apron they start a shift in, with their tier ladder underneath so you can
see what the outfits cost before you commit. The choice is saved in
`localStorage` and remembered next time.

Each character is four tiers of the same dinosaur in progressively better kit,
and the tier changes on money earned during a shift — `$75`, `$200`, `$400`,
thresholds derived from a measured earnings curve rather than picked. All four
sheets preload at startup so a promotion never waits on a download.

The art is rendered from rigged 3D models by `tools/render_sprites.mjs`, which
measures the anchor from the rendered pixels and prints the roster line to paste
into `ROSTER` in `index.html`. Nothing is fetched at runtime and no third-party
art ships with the game.

## Training mode

The title screen opens on a five-step tutorial that introduces one mechanic at a time and waits for you to actually perform each one before moving on — walking, picking up an order, delivering it, and then meeting the patience bar. Nothing advances on a timer. It ends in a three-order practice round where missed tables cost you nothing, then hands you to the real shift.

Steps live in the `TUTORIAL_STEPS` array in `index.html`. Each entry is a `hint` label, a `text()` instruction, an optional `enter()` to stage the floor, a `done()` predicate that gates advancement, and an optional `onMiss()` for when a table times out mid-lesson. Adding or reordering a lesson means editing that array and nothing else. A "Skip to the shift" button on the title screen and a "Skip tutorial" button during it both drop straight into the real game.

## Running it

It is a single self-contained HTML file with no build step and no dependencies, so opening `index.html` in a browser is enough. To serve it locally over HTTP:

```
npx serve .
```

The only external requests are two Google Fonts (Alfa Slab One and DM Sans). Without internet access the game still runs and falls back to a system font stack.

## Deploying

The repository root *is* the site — there is nothing to build. Any static host works. `netlify.toml` is already configured to publish the root directory with an empty build command, so connecting the repo to Netlify (or dragging the folder into the Netlify UI) deploys it as-is. GitHub Pages works the same way: serve from the repository root.

## Known gaps

- **Food is being rebuilt in 3D.** Seven of the eleven menu items are done; `sub`, `pasta`, `club` and `soup` are still the original illustrated plates. Measured in silhouette the ten plates are near-identical circles, because a top-down plate *is* its own outline. Only the milkshake escapes it, by standing up out of its plate — see `art-source/FOOD-SPEC.md` and `tools/foodgrid.py`.
- **The tier ladder is carried by tier 4.** Silhouette overlap against the tier below runs 0.95 / 0.92 / 0.69 for Tyrone: the first two promotions read by colour, and only the top hat changes the shape.
- **No level-up animation yet.** The dance clips exist as a plan, not as art.
- The canvas is a fixed 960×640 internal resolution scaled by CSS. It works, but it is not a true responsive layout, which is why the d-pad overlays the board on short screens.
- The HUD label reads "Tables lost" while the three carved stones deplete as lives remaining, so label and indicator still point in opposite directions. Flipping the stones to light up as tables walk would settle it.
- Party sizes — showing a two-, four- or six-top on eight identical painted tables — is designed but unbuilt, waiting on an art decision.
