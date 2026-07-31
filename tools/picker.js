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
await p.click('#landingStart');
await p.waitForSelector('.cast button', { timeout: 10000 });

const cast = await p.$$('.cast button');
const rosterSize = await p.evaluate(() => document.querySelectorAll('.cast button').length);
check('every roster character listed', cast.length === rosterSize && cast.length >= 2,
      `${cast.length} shown`);
check('one is preselected',
  await p.evaluate(() => document.querySelectorAll('.cast button[aria-pressed="true"]').length) === 1);
check('ladder shows four tiers',
  await p.evaluate(() => document.querySelectorAll('#avatarLadder .step').length) === 4);
check('tier one is unlocked, rest greyed',
  await p.evaluate(() => document.querySelectorAll('#avatarLadder .step.locked').length) === 3);
check('ladder labels the thresholds',
  (await p.evaluate(() => [...document.querySelectorAll('#avatarLadder .tier')].map(e=>e.textContent).join(' ')))
    === 'START $75.00 $200.00 $400.00');
check('thumbnails resolved',
  await p.evaluate(() => [...document.querySelectorAll('.sprite')].every(e => e.style.backgroundImage.includes('sprites/'))));
await p.screenshot({ path:'picker.png' });

// pick the second character and start
const second = await cast[1].evaluate(e => e.querySelector('.who').textContent);
await cast[1].click(); await p.waitForTimeout(200);
const who = await p.evaluate(() => document.querySelector('.cast button[aria-pressed="true"] .who').textContent);
check('selection moves', who === second, who);
await p.screenshot({ path:'picker-velo.png' });

await p.click('#avatarDone'); await p.waitForTimeout(600);
check('picker closes into the tutorial',
  await p.evaluate(() => document.getElementById('avatarPicker').classList.contains('hidden')
                      && document.getElementById('landing').classList.contains('hidden')));
check('saved to localStorage',
  await p.evaluate(() => localStorage.getItem('dineo.char')) === who.toLowerCase());

// and it sticks across a reload
await p.reload();
await p.click('#landingStart');
await p.waitForSelector('.cast button');
check('reload remembers the pick',
  await p.evaluate(() => document.querySelector('.cast button[aria-pressed="true"] .who').textContent) === who);

// random never leaves you on the same one
await p.click('#avatarRandom'); await p.waitForTimeout(150);
check('random changes the pick',
  await p.evaluate(() => document.querySelector('.cast button[aria-pressed="true"] .who').textContent) !== who);

console.log(errs.length ? '\nPAGE ERRORS: ' + errs.join(' | ') : '\nno page errors');
console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
await br.close(); process.exit(fail.length ? 1 : 0);
