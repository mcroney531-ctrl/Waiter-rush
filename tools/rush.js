// The rush as a *mode*: the things that say "this is temporary and different"
// rather than the things that make it harder.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/rush.js
//
// Every failure here is silent in the way atmosphere always is. A gutter left
// glowing on the results screen, a closing banner that never fires, a tally
// that reads zero because the tips were banked into the wrong variable -- none
// of them throw, and a screenshot of the right frame looks fine.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const B = process.env.BASE || 'http://127.0.0.1:8222';

const fail = [];
const check = (n, ok, d) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '  ' + JSON.stringify(d) : ''}`);
  if (!ok) fail.push(n);
};

const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const p = await br.newPage({ viewport: { width: 1000, height: 760 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await p.goto(B + '/probe.html', { waitUntil: 'load' });
await p.click('#landingStart');
await p.waitForSelector('#avatarCard img', { timeout: 30000 });
await p.click('#avatarDone');
const skip = await p.$('#skipBtn');
if (skip && await skip.isVisible()) await skip.click();
await p.waitForTimeout(600);
await p.evaluate(() => { window.__dbg.tables.forEach(t => { t.state = 'eating'; t.eatTimer = 99999; });
                         window.__dbg.tickets.length = 0; });

const glow = () => p.evaluate(() => document.documentElement.classList.contains('rush'));
const st = () => p.evaluate(() => ({ active: window.__dbg.rushActive,
  over: Math.round(window.__dbg.rushOver), overTips: window.__dbg.rushOverTips,
  tips: window.__dbg.rushTips }));

check('the gutter is not glowing before a rush', await glow() === false);

// ---- arm and land ----
await p.evaluate(() => window.__dbg.forceRush());
let landed = false;
for (let i = 0; i < 40; i++) {           // the telegraph runs 5-15s
  await p.waitForTimeout(500);
  if ((await st()).active) { landed = true; break; }
}
check('a rush lands', landed);
await p.waitForTimeout(200);
check('and the gutter glows with it', await glow() === true);

// ---- the exit beat ----
// Driven rather than waited out: a rush runs 20-45s and the point of the test
// is the handover, not the duration.
await p.evaluate(() => { window.__dbg.rushTips = 1875;
                         window.__dbg.rushEndsAt = performance.now() + 200; });
await p.waitForTimeout(700);
const after = await st();
check('the rush ends', after.active === false);
check('the closing banner fires', after.over > 0, after.over);
check('and carries what the rush paid', after.overTips === 1875, after.overTips);
check('the running total resets for the next one', after.tips === 0, after.tips);
check('the gutter stops glowing', await glow() === false);

// ---- and it clears itself ----
await p.waitForTimeout(2600);
check('the closing banner clears', (await st()).over <= 0);

// ---- a shift that ends mid-rush leaves nothing behind ----
// endGame() and resetGame() both skip the rush's own end branch -- the loop has
// already stopped -- so the gutter has to be driven off the live flag rather
// than toggled on the transition. A results screen lit like a rush is the bug
// this is here for.
await p.evaluate(() => window.__dbg.forceRush());
for (let i = 0; i < 40; i++) {
  await p.waitForTimeout(500);
  if ((await st()).active) break;
}
check('a second rush lands', (await st()).active === true);
// A real loss, not a forced endGame: the whole hazard is that the loop stops,
// so the per-frame toggle stops with it. `mode` is not the thing to watch --
// endGame leaves it at 'game' and raises the overlay instead.
await p.evaluate(() => { window.__dbg.lives = 1; });
await p.evaluate(() => { const t = window.__dbg.tables[0];
                         t.state = 'waiting'; t.patience = 0.0001; });
let ended = false;
for (let i = 0; i < 30; i++) {
  await p.waitForTimeout(300);
  ended = await p.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
  if (ended) break;
}
check('losing the last table mid-rush ends the shift', ended);
await p.waitForTimeout(400);
check('and the gutter does not stay lit on the results screen', await glow() === false);
check('nor does the rush', (await st()).active === false);

check('no page errors', errs.length === 0, errs);
await br.close();
console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(', ')}` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
