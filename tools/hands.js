// Full-hands microcopy, and carrying two stacks of dirties.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/hands.js
//
// Floaters are canvas-drawn, so there is no DOM to assert on. The probe
// exposes the live array instead, which is the same thing the renderer reads.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const B = process.env.BASE || 'http://127.0.0.1:8222';

const fail = [];
const check = (n, ok, d) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`);
  if (!ok) fail.push(n);
};

const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const p = await br.newPage({ viewport: { width: 1000, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

await p.goto(B + '/probe.html', { waitUntil: 'load' });
await p.click('#landingStart');
await p.waitForSelector('#avatarCard img', { timeout: 30000 });
await p.click('#avatarDone'); await p.waitForTimeout(300);
for (const sel of ['#skipBtn', '#startBtn']) {
  const el = await p.$(sel);
  if (el && await el.isVisible()) { await el.click(); await p.waitForTimeout(350); }
}

const hints = () => p.evaluate(() =>
  window.__dbg.floaters.filter(f => f.top && !f.bottom).map(f => f.top));
const clear = () => p.evaluate(() => { window.__dbg.floaters.length = 0; });
// Park the player somewhere harmless and give them a known payload.
const setup = (cap, items) => p.evaluate(({ cap, items }) => {
  const d = window.__dbg;
  d.setCap(cap);
  d.carried.length = 0;
  for (const it of items) {
    if (it.type === 'dishes') {
      d.carried.push({ type: 'dishes', tableId: it.id, pickedAt: performance.now() });
    } else {
      // The table has to actually be waiting for this order. tryDeliver runs
      // every frame and discards a carried order whose table has moved on --
      // correct behaviour, and it silently emptied the player's hands here
      // before this line existed.
      const t = d.tables.find(t => t.id === it.id);
      t.state = 'waiting'; t.patience = 1; t.warned = false;
      d.carried.push({ type: 'order', tableId: it.id, icon: 'pizza',
                       pickedAt: performance.now(), orderedAt: performance.now() });
    }
  }
  d.floaters.length = 0;
  d.hintCooldown = 0;
}, { cap, items });

const standAtPass = () => p.evaluate(() => {
  const d = window.__dbg, s = d.PASSES[0];
  d.player.x = s.x; d.player.y = s.y;
  // guarantee a ticket is actually waiting there, or a refusal is correct
  if (!d.tickets.some(t => t.side === s.side)) d.forceTicket(s.side);
});
const standAtDirty = () => p.evaluate(() => {
  const d = window.__dbg;
  const t = d.tables[0];
  t.state = 'dirty';
  d.player.x = t.padX; d.player.y = t.padY;
  return t.id;
});

// ---- hands full at the pass ----
await setup(1, [{ type: 'order', id: 3 }]);
await standAtPass();
await p.waitForTimeout(220);
let h = await hints();
check('one hand full, reaching for a ticket, warns', h.length === 1, JSON.stringify(h));
check('carrying an order says deliver it', /deliver/i.test(h[0] || ''), h[0]);

// it must not repeat every frame
await p.waitForTimeout(700);
check('does not repeat while standing there', (await hints()).length === 1,
      `${(await hints()).length} hints`);

// ---- the message follows what is being held ----
await setup(1, [{ type: 'dishes', id: 5 }]);
await standAtPass();
await p.waitForTimeout(220);
h = await hints();
check('carrying dishes says dish return', /dish return/i.test(h[0] || ''), h[0]);

// ---- both hands full warns too ----
await setup(2, [{ type: 'order', id: 2 }, { type: 'order', id: 4 }]);
await standAtPass();
await p.waitForTimeout(220);
check('two hands full also warns', (await hints()).length === 1);

// ---- an empty pass says nothing ----
// Spawning is stopped for this one rather than raced against. Orders appear
// every seven seconds, and a ticket landing at this pass mid-wait makes the
// refusal correct — which failed the case intermittently rather than never.
// spawnTicket bails when no table is idle, so parking them all is enough.
await p.evaluate(() => {
  const d = window.__dbg, s = d.PASSES[0];
  d.setCap(2);
  d.tables.forEach(t => { t.state = 'eating'; t.eatTimer = 99999; });
  d.tickets.length = 0;
  // Hands stay full with orders for tables that are deliberately NOT waiting;
  // tryDeliver will discard them, which is fine — the case is about a pass
  // with nothing on it, and an empty-handed player must be silent there too.
  d.carried.length = 0;
  d.carried.push({ type: 'dishes', tableId: 1, pickedAt: performance.now() },
                 { type: 'dishes', tableId: 2, pickedAt: performance.now() });
  d.player.x = s.x; d.player.y = s.y;
  // Cleared last, and in the same step as everything else. Splitting this
  // across two evaluates let the game run frames in between with full hands
  // and a leftover ticket still at the pass, so a hint fired in the gap and
  // survived into the assertion — which is why this case failed one run in
  // three rather than never.
  d.floaters.length = 0;
  d.hintCooldown = 0;
});
await p.waitForTimeout(400);
check('empty pass stays quiet', (await hints()).length === 0, JSON.stringify(await hints()));

// ---- room in hand: no warning, and the pickup happens ----
await p.evaluate(() => window.__dbg.tables.forEach(t => { t.state = 'idle'; }));
await setup(2, [{ type: 'order', id: 2 }]);
await standAtPass();
await p.waitForTimeout(300);
check('room in hand does not warn', (await hints()).length === 0);
check('and the ticket is actually taken',
      await p.evaluate(() => window.__dbg.carried.length) === 2);

// ---- two stacks of dirties, the new part ----
await setup(2, []);
const id1 = await standAtDirty();
await p.waitForTimeout(250);
await p.evaluate(() => {
  const d = window.__dbg, t = d.tables[1];
  t.state = 'dirty';
  d.player.x = t.padX; d.player.y = t.padY;
});
await p.waitForTimeout(250);
const carried = await p.evaluate(() => window.__dbg.carried.map(c => c.type));
check('two stacks of dirties can be carried',
      carried.length === 2 && carried.every(c => c === 'dishes'), JSON.stringify(carried));

// ---- and a third is refused with the right advice ----
await clear();
await p.evaluate(() => { window.__dbg.hintCooldown = 0; });
await p.evaluate(() => {
  const d = window.__dbg, t = d.tables[2];
  t.state = 'dirty';
  d.player.x = t.padX; d.player.y = t.padY;
});
await p.waitForTimeout(250);
h = await hints();
check('a third stack is refused', await p.evaluate(() => window.__dbg.carried.length) === 2);
check('and it points at the dish return', /dish return/i.test(h[0] || ''), h[0]);

// ---- both stacks drop at the return ----
await p.evaluate(() => {
  const d = window.__dbg, b = d.BUS[0];
  d.player.x = b.x; d.player.y = b.y;
});
await p.waitForTimeout(400);
check('both stacks go in', await p.evaluate(() => window.__dbg.carried.length) === 0,
      `${await p.evaluate(() => window.__dbg.carried.length)} left`);

console.log(errs.length ? '\nPAGE ERRORS: ' + errs.join(' | ') : '\nno page errors');
console.log(fail.length ? `${fail.length} FAILED: ${fail.join(', ')}` : 'all checks passed');
await br.close();
process.exit(fail.length ? 1 : 0);
