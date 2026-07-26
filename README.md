# Rush Hour — The Waiter Game

A short Overcooked-style arcade game built for Articulate E-Learning Challenge #561 ("Online Training for Restaurant Servers & Waiters").

Instead of a branching scenario, it trains the "in the weeds" skill of a server's job: holding multiple orders in your head while physically running the floor, under pressure that escalates the longer the shift goes.

## How it plays

Order tickets stack up on the pickup counter across the top of the screen, each showing a dish and a table number. Walk into the counter to grab the top ticket. Once you carry it away, the ticket fades after a short grace window — so you actually have to remember which table it was for. Walk back toward the counter to re-reveal what you're holding if you blank on it.

Every table with an open order drains patience, shown as a meter with a live countdown of the seconds left beside it. Let one run out and the table goes angry, you lose one of three lives, and the order is gone. To deliver, step onto the dashed "set down" pad in front of the table — you never have to walk through the furniture. Every pad looks the same whether or not it is the one you want, since marking the right one would give away the table number you are supposed to be remembering. Setting an order down at the wrong table is harmless.

Controls are arrow keys or WASD on desktop, and an on-screen d-pad on touch devices. Spacebar also forces a pickup/deliver attempt as a backup.

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

These are carried over from the design handoff and are not yet solved:

- The capacity upgrade is not functional. `carryCapacity` flips to 2 after six deliveries, but the pickup and carry logic still only supports a single order — holding two tickets at once needs a real implementation plus UI for two floating tickets above the player.
- The speed bonus in scoring is a placeholder and reads the table's patience *after* it has already been reset to 1, so it currently adds a flat 20 points to every delivery rather than rewarding speed.
- There is no audio at all — no delivery ding, no ambient room noise, no angry-table alert.
- No difficulty tuning pass has happened. The spawn rate curve, the patience drain rate, and the 1.5s ticket fade are first-guess values that have not been playtested.
- The canvas is a fixed 960×600 internal resolution scaled by CSS. It works, but it is not a true responsive layout and could use a resize handler for varied viewports.
- A wrong delivery costs nothing beyond a visual bump. That is deliberate for now, but worth a gut-check once the game has actually been played.
- Each run is fresh in memory with no persistence between sessions, which is probably right for an arcade game but is flagged in case it was not a deliberate call.
