// The touch d-pad: its art, and the one bit of logic behind it.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/dpad.js
//
// The pad is four carved discs, and up/down are the right-hand disc turned a
// quarter turn -- which means a `transform` on the pressed state would silently
// unrotate them, and a hover rule written the obvious way would point two of
// the four buttons the wrong way. That is the kind of thing that looks fine in
// the CSS and wrong on a phone, so it is asserted here.
//
// The other thing worth pinning is the scrim. It exists only when the pad
// actually lands on the board, which is not a breakpoint: it depends on how
// tall the board scaled to, which depends on both axes at once. Portrait leaves
// ~280px of gutter and the pad never touches the art; landscape leaves none.
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

const IDS = ['btn-up', 'btn-down', 'btn-left', 'btn-right'];

const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const errs = [];

async function shift(vp) {
  const p = await br.newPage({ viewport: vp, hasTouch: true, isMobile: true });
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  await p.click('#landingStart');
  await p.waitForSelector('#avatarCard img', { timeout: 30000 });
  await p.click('#avatarDone'); await p.waitForTimeout(400);
  const sb = await p.$('#skipBtn');
  if (sb && await sb.isVisible()) { await sb.click(); await p.waitForTimeout(400); }
  await p.waitForTimeout(400);
  return p;
}

// ---- art and geometry, once ----
{
  const p = await shift({ width: 430, height: 844 });
  const pad = await p.evaluate(async ids => {
    const out = {};
    for (const id of ids) {
      const e = document.getElementById(id);
      const cs = getComputedStyle(e);
      const url = cs.backgroundImage.slice(5, -2);
      let loaded = false;
      if (url && url !== 'none') {
        const img = new Image(); img.src = url;
        try { await img.decode(); loaded = img.naturalWidth > 0; } catch {}
      }
      const b = e.getBoundingClientRect();
      out[id] = { file: url.split('/').pop(), loaded, transform: cs.transform,
                  w: Math.round(b.width), h: Math.round(b.height),
                  cx: Math.round(b.left + b.width / 2),
                  cy: Math.round(b.top + b.height / 2),
                  text: e.textContent.trim() };
    }
    return out;
  }, IDS);

  for (const id of IDS) {
    check(`${id} has its art`, pad[id].loaded, pad[id].file);
    check(`${id} is a square target`, Math.abs(pad[id].w - pad[id].h) <= 1,
          `${pad[id].w}x${pad[id].h}`);
    // 44px is the smallest target a thumb reliably hits; these are also the
    // size below which the fossil detail inside the disc stops resolving.
    check(`${id} is big enough for a thumb`, pad[id].w >= 44, `${pad[id].w}px`);
    check(`${id} carries no leftover glyph`, pad[id].text === '', pad[id].text);
  }

  // Up and down are the same file as right, turned. If someone swaps the
  // pressed state back to a transform, these two stop pointing anywhere useful.
  check('up and down are the right-hand disc, rotated',
        pad['btn-up'].file === pad['btn-right'].file &&
        pad['btn-down'].file === pad['btn-right'].file,
        `${pad['btn-up'].file} / ${pad['btn-down'].file} / ${pad['btn-right'].file}`);
  const turned = t => t !== 'none' && !/matrix\(1,\s*0,\s*0,\s*1/.test(t);
  check('up is rotated', turned(pad['btn-up'].transform), pad['btn-up'].transform);
  check('down is rotated', turned(pad['btn-down'].transform), pad['btn-down'].transform);
  check('and they are turned opposite ways',
        pad['btn-up'].transform !== pad['btn-down'].transform);
  check('left and right are not rotated',
        !turned(pad['btn-left'].transform) && !turned(pad['btn-right'].transform));
  check('left uses the left-hand disc',
        pad['btn-left'].file !== pad['btn-right'].file,
        `${pad['btn-left'].file} vs ${pad['btn-right'].file}`);

  // The cross has to be a cross, or the wrong button is under the thumb.
  check('up sits above down', pad['btn-up'].cy < pad['btn-down'].cy);
  check('left sits left of right', pad['btn-left'].cx < pad['btn-right'].cx);
  check('the arms share a centre line',
        Math.abs(pad['btn-up'].cx - pad['btn-down'].cx) <= 1 &&
        Math.abs(pad['btn-left'].cy - pad['btn-right'].cy) <= 1);

  // The pressed state must not be a transform: transform is holding the
  // quarter turn, and setting it again would unrotate up and down.
  const pressed = await p.evaluate(() => {
    // Not styleSheets[0]: the Google Fonts links are sheets too, they are
    // cross-origin, and reading cssRules on one throws SecurityError.
    const out = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules)
        if (r.selectorText && /\.dbtn:active/.test(r.selectorText))
          out.push(r.style.transform || '');
    }
    return out.join('|');
  });
  check('the pressed state does not clobber the rotation', pressed === '',
        `transform: ${pressed}`);

  await p.close();
}

// ---- the scrim follows the board, not a breakpoint ----
for (const [tag, vp, wantOver] of [
  ['portrait 430x844', { width: 430, height: 844 }, false],
  ['portrait 393x852', { width: 393, height: 852 }, false],
  ['landscape 844x430', { width: 844, height: 430 }, true],
  ['landscape 852x393', { width: 852, height: 393 }, true],
]) {
  const p = await shift(vp);
  const m = await p.evaluate(() => {
    const c = document.getElementById('game').getBoundingClientRect();
    const d = document.querySelector('.dpad').getBoundingClientRect();
    return {
      overlaps: d.right > c.left && d.left < c.right && d.bottom > c.top && d.top < c.bottom,
      flagged: document.getElementById('controls-mobile').classList.contains('over-board'),
      scrim: getComputedStyle(document.querySelector('.dpad'), '::before').content !== 'none',
      gutter: Math.round(innerHeight - c.bottom),
      onScreen: d.bottom <= innerHeight + 1 && d.left >= 0,
    };
  });
  check(`${tag}: the pad is fully on screen`, m.onScreen);
  check(`${tag}: overlap is ${wantOver ? '' : 'not '}expected`, m.overlaps === wantOver,
        `overlaps ${m.overlaps}, ${m.gutter}px of gutter`);
  // The class is the thing under test -- it is computed from the rectangles,
  // so it has to agree with them at every shape, not just the two I tried.
  check(`${tag}: the scrim matches the overlap`, m.flagged === m.overlaps,
        `flagged ${m.flagged}, overlaps ${m.overlaps}`);
  check(`${tag}: and the scrim is ${m.overlaps ? 'drawn' : 'absent'}`,
        m.scrim === m.overlaps, `::before ${m.scrim}`);
  await p.close();
}

// ---- rotating the phone mid-shift has to re-decide ----
{
  const p = await shift({ width: 430, height: 844 });
  const flag = () => p.evaluate(() =>
    document.getElementById('controls-mobile').classList.contains('over-board'));
  check('starts off the board in portrait', await flag() === false);
  await p.setViewportSize({ width: 844, height: 430 });
  await p.waitForTimeout(400);
  check('turning the phone turns the scrim on', await flag() === true);
  await p.setViewportSize({ width: 430, height: 844 });
  await p.waitForTimeout(400);
  check('and turning it back turns it off', await flag() === false);
  await p.close();
}

console.log(errs.length ? '\nPAGE ERRORS: ' + errs.join(' | ') : '\nno page errors');
console.log(fail.length ? `${fail.length} FAILED: ${fail.join(', ')}` : 'all checks passed');
await br.close();
process.exit(fail.length ? 1 : 0);
