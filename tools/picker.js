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
p.on('requestfailed', r => { const u=r.url(); if(!u.includes('fonts.googleapis')) errs.push('404 '+u.split('/').pop()); });

await p.goto((process.env.BASE || 'http://localhost:8000') + '/index.html');
// A saved pick is remembered on open, which is correct and makes position
// assertions non-deterministic across runs. Start from a clean profile.
await p.evaluate(() => localStorage.clear());
await p.reload();
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
check('ladder thumbnails resolved',
  await p.evaluate(() => [...document.querySelectorAll('#avatarLadder .sprite')]
                          .every(e => e.style.backgroundImage.includes('sprites/'))));
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

// and it sticks across a reload
await p.reload();
await p.click('#landingStart');
await p.waitForSelector('#avatarCard img');
check('reload remembers the pick', await nameOf() === who, await nameOf());

// random never leaves you on the same one
await p.click('#avatarRandom'); await p.waitForTimeout(150);
check('random changes the pick', await nameOf() !== who, await nameOf());

console.log(errs.length ? '\nPAGE ERRORS: ' + errs.join(' | ') : '\nno page errors');
console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
await br.close(); process.exit(fail.length ? 1 : 0);
