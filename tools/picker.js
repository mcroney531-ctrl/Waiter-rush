// Character select, end to end.
//
//   python3 -m http.server 8000 &
//   node tools/picker.js
//
// Deliberately free of character names: the roster grows, and a test that
// hardcodes "Velo" fails the day a third dinosaur is added ahead of it
// alphabetically rather than the day something breaks.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const fail = [];
const check = (n, ok, d) => { console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok) fail.push(n); };

const br = await chromium.launch({ executablePath: EXE, args:['--no-sandbox'] });
const p = await br.newPage({ viewport:{width:1000,height:760}, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror', e=>errs.push(String(e).slice(0,160)));

// Plaque buttons are sized by height with aspect-ratio, so a wrong aspect in
// the CSS crops or letterboxes the art without erroring. Each has to be
// measured while it is on screen, which for the landing and the tutorial skip
// is not the same moment as for the picker's own pair.
const measure = id => p.evaluate(async id => {
  const e = document.getElementById(id);
  if (!e) return null;
  const url = getComputedStyle(e).backgroundImage.slice(5, -2);
  let loaded = false, ar = 0;
  if (url && url !== 'none') {
    const img = new Image(); img.src = url;
    try { await img.decode(); loaded = img.naturalWidth > 0;
          ar = img.naturalWidth / img.naturalHeight; } catch {}
  }
  const b = e.getBoundingClientRect();
  return { url: url.split('/').pop(), loaded, ar, w: +b.width.toFixed(0),
           h: +b.height.toFixed(0), name: e.textContent.trim() };
}, id);
const plaqueChecks = (id, v) => {
  check(`${id} has its art`, v && v.loaded, v ? v.url : 'missing');
  check(`${id} keeps an accessible name`, v && v.name.length > 0, v && v.name);
  check(`${id} is on screen to be pressed`, v && v.w > 0 && v.h > 0, v && `${v.w}x${v.h}`);
  check(`${id} draws at the art's aspect`,
        v && v.h > 0 && Math.abs(v.w / v.h - v.ar) < 0.02,
        v && v.h > 0 ? `${(v.w / v.h).toFixed(3)} vs art ${v.ar.toFixed(3)}` : 'not visible');
};

// A request can fail for two very different reasons and only one is a bug.
// Pausing the menu track and rewinding it aborts its in-flight range request,
// which surfaces here as a failure with errorText net::ERR_ABORTED. Reporting
// that as "404 menu-theme.mp3" sent me looking for a missing file that was
// serving 200 the whole time, so the reason is now printed and aborts are
// ignored.
p.on('requestfailed', r => {
  const u = r.url(), why = r.failure()?.errorText || 'failed';
  if (u.includes('fonts.googleapis')) return;
  if (/ABORTED/i.test(why)) return;
  errs.push(`${why} ${u.split('/').pop()}`);
});

await p.goto((process.env.BASE || 'http://localhost:8000') + '/index.html');
// A saved pick is remembered on open, which is correct and makes position
// assertions non-deterministic across runs. Start from a clean profile.
await p.evaluate(() => localStorage.clear());
await p.reload();
const landingPlaque = await measure('landingStart');
await p.click('#landingStart');
await p.waitForSelector('#avatarCard img', { timeout: 10000 });

const nameOf = () => p.evaluate(() => document.querySelector('#avatarCard .who').textContent);
const counter = () => p.evaluate(() => document.getElementById('avatarCounter').textContent);

const size = Number((await counter()).split('/')[1]);
check('counter knows the roster size', size >= 2, `${await counter()}`);
check('opens on the first card', (await counter()).startsWith('1 /'), await counter());
check('portrait resolves',
  await p.evaluate(() => { const i = document.querySelector('#avatarCard img');
                           return i.complete && i.naturalWidth > 0; }));
check('ladder shows four tiers',
  await p.evaluate(() => document.querySelectorAll('#avatarLadder .step').length) === 4);
check('tier one is unlocked, rest greyed',
  await p.evaluate(() => document.querySelectorAll('#avatarLadder .step.locked').length) === 3);
check('ladder labels the thresholds',
  (await p.evaluate(() => [...document.querySelectorAll('#avatarLadder .tier')].map(e=>e.textContent).join(' ')))
    === 'START $75.00 $200.00 $400.00');
// A thumbnail is either a dedicated tier portrait (an <img>, once that art
// exists for the character) or the sprite-sheet crop it falls back to (a div
// painted via backgroundImage) -- see spriteCell()/renderLadder(). Resolved
// means whichever one is showing actually loaded, not which path was taken.
// Waited for rather than sampled. waitForSelector above only waits on the hero
// portrait; the four ladder thumbnails are still in flight behind it, so
// asserting immediately raced them and failed roughly one cold run in four.
const laddersResolved = () => p.waitForFunction(() =>
  [...document.querySelectorAll('#avatarLadder .sprite')].length > 0 &&
  [...document.querySelectorAll('#avatarLadder .sprite')]
    .every(e => e.tagName === 'IMG'
      ? (e.complete && e.naturalWidth > 0)
      : e.style.backgroundImage.includes('sprites/')),
  null, { timeout: 8000 }).then(() => true).catch(() => false);
check('ladder thumbnails resolved', await laddersResolved());
await p.screenshot({ path:'picker.png' });

// --- the arrows walk the roster and wrap ---
const first = await nameOf();
await p.click('#avatarNext'); await p.waitForTimeout(320);
const second = await nameOf();
check('next advances', second !== first, `${first} -> ${second}`);
check('counter follows', (await counter()).startsWith('2 /'), await counter());

await p.click('#avatarPrev'); await p.waitForTimeout(320);
check('prev goes back', await nameOf() === first, await nameOf());

await p.click('#avatarPrev'); await p.waitForTimeout(320);
check('prev wraps to the end', (await counter()).startsWith(String(size) + ' /'), await counter());
await p.click('#avatarNext'); await p.waitForTimeout(320);
check('next wraps to the start', (await counter()).startsWith('1 /'), await counter());

// --- keyboard drives it too ---
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(320);
check('arrow key advances', await nameOf() === second, await nameOf());
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(320);
check('arrow key goes back', await nameOf() === first, await nameOf());

await p.click('#avatarNext'); await p.waitForTimeout(320);
const who = await nameOf();
await p.screenshot({ path:'picker-second.png' });

await p.click('#avatarDone'); await p.waitForTimeout(600);
check('picker closes into the tutorial',
  await p.evaluate(() => document.getElementById('avatarPicker').classList.contains('hidden')
                      && document.getElementById('landing').classList.contains('hidden')));
check('saved to localStorage',
  await p.evaluate(() => localStorage.getItem('dineo.char')) === who.toLowerCase());
const skipPlaque = await measure('skipBtn');

// and it sticks across a reload
await p.reload();
await p.click('#landingStart');
await p.waitForSelector('#avatarCard img');
check('reload remembers the pick', await nameOf() === who, await nameOf());

// random never leaves you on the same one
await p.click('#avatarRandom'); await p.waitForTimeout(150);
check('random changes the pick', await nameOf() !== who, await nameOf());

// --- the carved buttons ---
// A background-image button with its label clipped out of view is one CSS typo
// away from being an invisible box with no accessible name, and one 404 away
// from being an invisible box full stop. Neither shows up as a page error.
plaqueChecks('landingStart', landingPlaque);
plaqueChecks('skipBtn', skipPlaque);
plaqueChecks('avatarDone', await measure('avatarDone'));
plaqueChecks('avatarRandom', await measure('avatarRandom'));

// The stage arrows are the same idea with no text at all: the glyph is in the
// art, so aria-label is the only thing naming them. A missing label leaves a
// screen reader announcing "button", twice, with no way to tell which is which.
for (const id of ['avatarPrev', 'avatarNext']) {
  const v = await measure(id);
  check(`${id} has its art`, v && v.loaded, v ? v.url : 'missing');
  check(`${id} is on screen to be pressed`, v && v.w > 0 && v.h > 0, v && `${v.w}x${v.h}`);
  check(`${id} draws round, not squashed`, v && Math.abs(v.w / v.h - 1) < 0.02,
        v && `${(v.w / v.h).toFixed(3)}`);
  const label = await p.evaluate(id => document.getElementById(id).getAttribute('aria-label'), id);
  check(`${id} is named for a screen reader`, !!label && label.length > 3, label);
}
const arrowNames = await p.evaluate(() =>
  ['avatarPrev', 'avatarNext'].map(id => document.getElementById(id).getAttribute('aria-label')));
check('the two arrows are named differently', arrowNames[0] !== arrowNames[1],
      arrowNames.join(' / '));

// The pair in the action row has to share a height or it does not read as a
// pair -- the two plaques have different aspects, so height is the only
// dimension that can match.
const [pDone, pRand] = [await measure('avatarDone'), await measure('avatarRandom')];
check('START and RANDOM line up', pDone.h === pRand.h, `${pDone.h} vs ${pRand.h}`);

// --- the primary button says two different things ---
// From the landing it starts the game, so it can wear a plaque that says
// START. Reached as a detour from the title it means "use this waiter", which
// no plaque reading START can say, so it falls back to a text button -- and
// the detour keeps a Cancel, which the opening flow does not need.
const mode = () => p.evaluate(() => {
  const q = id => { const e = document.getElementById(id);
                    return { txt: e.textContent.trim(), cls: e.className,
                             shown: !e.classList.contains('hidden') }; };
  return { done: q('avatarDone'), cancel: q('avatarCancel') };
});
let m = await mode();
check('from the landing the primary is a plaque', m.done.cls.includes('plaque'), m.done.cls);
check('and there is no Cancel to press', !m.cancel.shown);

await p.evaluate(() => document.getElementById('avatarBtn').click());
await p.waitForTimeout(400);
m = await mode();
check('as a detour it is a text button', !m.done.cls.includes('plaque'), m.done.cls);
check('and it says what it does', /use this waiter/i.test(m.done.txt), m.done.txt);
check('and Cancel comes back', m.cancel.shown && /cancel/i.test(m.cancel.txt), m.cancel.txt);

console.log(errs.length ? '\nPAGE ERRORS: ' + errs.join(' | ') : '\nno page errors');
console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
await br.close(); process.exit(fail.length ? 1 : 0);
