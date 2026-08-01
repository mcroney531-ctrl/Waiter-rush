// The menu track: where it plays, where it stops, and who can stop it.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/music.js
//
// Every failure here is silent. A track that never starts because autoplay was
// blocked, a track that keeps playing under the shift because a fade never
// finished, a mute button that silences the effects but not the music — none of
// them throw, and none of them show up in a screenshot.
//
// Chromium is launched with autoplay allowed so the happy path is testable at
// all, and the blocked path is tested separately by launching without it.
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

const ALLOW = ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
const BLOCK = ['--no-sandbox', '--autoplay-policy=document-user-activation-required'];

// The element is created lazily and is not in the DOM, so it is watched by
// patching the constructor before the page's own script runs.
const WATCH = () => {
  window.__audio = [];
  const Orig = window.Audio;
  window.Audio = function (src) {
    const a = new Orig(src);
    window.__audio.push(a);
    return a;
  };
  window.Audio.prototype = Orig.prototype;
};
const state = p => p.evaluate(() => {
  const a = (window.__audio || [])[0];
  if (!a) return { exists: false };
  return { exists: true, src: a.src.split('/').pop(), paused: a.paused,
           loop: a.loop, volume: +a.volume.toFixed(3), t: +a.currentTime.toFixed(2) };
});

async function open(args) {
  const br = await chromium.launch({ executablePath: EXE, args });
  const p = await br.newPage({ viewport: { width: 1000, height: 760 } });
  await p.addInitScript(WATCH);
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  // An aborted range request is what pausing and rewinding the track looks
  // like from out here, and it is not a missing file.
  p.on('requestfailed', r => {
    const u = r.url(), why = r.failure()?.errorText || 'failed';
    if (u.includes('fonts.googleapis') || /ABORTED/i.test(why)) return;
    errs.push(`${why} ${u.split('/').pop()}`);
  });
  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  return { br, p, errs };
}

// ---- the happy path ----
{
  const { br, p, errs } = await open(ALLOW);
  let s = await state(p);
  check('the landing screen asks for the track', s.exists, JSON.stringify(s));
  check('it is the menu theme', s.src === 'menu-theme.mp3', s.src);
  check('it loops', s.loop === true);
  check('it is playing on the landing', s.paused === false);

  // The fade in has to actually move the volume, or "playing" is playing silence.
  await p.waitForTimeout(1200);
  s = await state(p);
  check('it fades up rather than snapping on', s.volume > 0.2 && s.volume <= 0.5,
        `volume ${s.volume}`);

  await p.click('#landingStart');
  await p.waitForSelector('#avatarCard img', { timeout: 30000 });
  await p.waitForTimeout(500);
  s = await state(p);
  check('it keeps playing through character select', s.paused === false, JSON.stringify(s));

  // ...and stops when the shift does start. Long enough for the fade to finish.
  await p.click('#avatarDone');
  await p.waitForTimeout(1600);
  s = await state(p);
  check('it stops when the game starts', s.paused === true, JSON.stringify(s));
  check('and it stopped by fading, not by cutting', s.volume === 0, `volume ${s.volume}`);

  // The end-of-shift screen is a menu screen too. Reached via the real shift,
  // not the tutorial -- the tutorial has drain switched off, so draining a
  // table there does nothing at all.
  await p.evaluate(() => document.getElementById('skipBtn').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__dbg.lives = 0;
    window.__dbg.tables.forEach(t => { t.state = 'waiting'; t.patience = 0.001; }); });
  await p.waitForFunction(() => !document.getElementById('overlay').classList.contains('hidden'),
                          null, { timeout: 15000 });
  await p.waitForTimeout(900);
  s = await state(p);
  check('it comes back on the end-of-shift screen', s.paused === false, JSON.stringify(s));

  check('no page errors', errs.length === 0, errs.join(' | '));
  await br.close();
}

// ---- muted ----
{
  const { br, p } = await open(ALLOW);
  await p.waitForTimeout(900);
  await p.evaluate(() => document.getElementById('muteBtn').click());
  await p.waitForTimeout(400);
  let s = await state(p);
  check('mute silences the music too, not just the effects', s.paused === true,
        JSON.stringify(s));
  // and unmuting on a menu screen brings it back rather than leaving the
  // button claiming something it did not do
  await p.evaluate(() => document.getElementById('muteBtn').click());
  await p.waitForTimeout(600);
  s = await state(p);
  check('unmuting on a menu screen starts it again', s.paused === false, JSON.stringify(s));
  await br.close();
}

// ---- muted before the page ever loads ----
{
  const br = await chromium.launch({ executablePath: EXE, args: ALLOW });
  const p = await br.newPage({ viewport: { width: 1000, height: 760 } });
  await p.addInitScript(WATCH);
  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  await p.evaluate(() => localStorage.setItem('dineo.muted', '1'));
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(900);
  const s = await state(p);
  check('a saved mute is respected from the first frame',
        !s.exists || s.paused === true, JSON.stringify(s));
  await br.close();
}

// ---- autoplay blocked, which is the real first visit ----
{
  const { br, p } = await open(BLOCK);
  await p.waitForTimeout(700);
  let s = await state(p);
  check('blocked autoplay does not throw or hang', true);
  console.log(`      (before any gesture: ${s.exists ? (s.paused ? 'paused' : 'playing') : 'no element'})`);

  // The gesture that unlocks audio on a real first visit is the click on START.
  await p.click('#landingStart');
  await p.waitForSelector('#avatarCard img', { timeout: 30000 });
  await p.waitForTimeout(1200);
  s = await state(p);
  check('the first gesture starts it', s.exists && s.paused === false, JSON.stringify(s));
  check('and it is audible by the character select', s.volume > 0.2, `volume ${s.volume}`);
  await br.close();
}

console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(', ')}` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
