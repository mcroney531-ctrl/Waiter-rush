// The HUD: the tips sign and the lives row, checked against the board.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/hud.js
//
// The checks are geometric, not visual. The sign art is a fixed image, so the
// plank occupies a known band of it; the total has to sit inside that band and
// inside the frame horizontally. A screenshot is written too, because a number
// can be inside the box and still look wrong sitting on a claw.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const B = process.env.BASE || 'http://127.0.0.1:8222';

// Measured off assets/money-sign.png with a gridline overlay: the bare plank
// runs 0.38-0.85 of the image height and 0.13-0.87 of its width. Anything the
// text does outside that is on top of ornament.
const PLANK = { top: 0.38, bottom: 0.85, left: 0.13, right: 0.87 };

const fail = [];
const check = (n, ok, d) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`);
  if (!ok) fail.push(n);
};

const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const p = await br.newPage({ viewport: { width: 1000, height: 760 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

await p.goto(B + '/probe.html', { waitUntil: 'load' });
await p.click('#landingStart');
await p.waitForSelector('#avatarCard img', { timeout: 30000 });
await p.click('#avatarCancel'); await p.waitForTimeout(300);
for (const sel of ['#skipBtn', '#startBtn']) {
  const el = await p.$(sel);
  if (el && await el.isVisible()) { await el.click(); await p.waitForTimeout(350); }
}

check('the sign image loaded', await p.evaluate(async () => {
  const url = getComputedStyle(document.querySelector('#hud .stat.tips'))
                .backgroundImage.slice(5, -2);
  const img = new Image(); img.src = url;
  try { await img.decode(); return img.naturalWidth > 0; } catch { return false; }
}));

// The plank band in page pixels. `contain` letterboxes the art inside the box,
// so the band has to be derived from the drawn image, not from the box.
const band = await p.evaluate(P => {
  const el = document.querySelector('#hud .stat.tips');
  const b = el.getBoundingClientRect();
  const url = getComputedStyle(el).backgroundImage.slice(5, -2);
  const img = document.createElement('img'); img.src = url;
  const ar = img.naturalWidth / img.naturalHeight || 1.3;
  // background-size: contain
  const w = Math.min(b.width, b.height * ar), h = w / ar;
  const x0 = b.left + (b.width - w) / 2, y0 = b.top + (b.height - h) / 2;
  return { top: y0 + h * P.top, bottom: y0 + h * P.bottom,
           left: x0 + w * P.left, right: x0 + w * P.right };
}, PLANK);

const totalBox = () => p.evaluate(() => {
  const r = document.getElementById('score').getBoundingClientRect();
  // The span is full-width and centred; the ink is what matters.
  const t = document.getElementById('score').textContent;
  return { top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, text: t,
           w: r.width };
});

// A shift can realistically reach four figures; check the widest thing the
// number can become, not the $0.00 it starts at.
for (const cents of [0, 7500, 124750, 999999]) {
  await p.evaluate(c => { window.__dbg.score = c; }, cents);
  await p.waitForTimeout(80);
  const t = await totalBox();
  const inside = t.top >= band.top - 1 && t.bottom <= band.bottom + 1;
  check(`${t.text} sits on the plank vertically`, inside,
        `text ${t.top.toFixed(0)}-${t.bottom.toFixed(0)} vs plank ${band.top.toFixed(0)}-${band.bottom.toFixed(0)}`);
  // width: the ink is centred in a full-width span, so half-width either side
  const inkL = t.cx - (await p.evaluate(() => {
    const s = document.getElementById('score');
    const r = document.createRange(); r.selectNodeContents(s);
    return r.getBoundingClientRect().width / 2;
  }));
  const inkR = t.cx + (t.cx - inkL);
  check(`${t.text} fits between the frame rails`,
        inkL >= band.left - 1 && inkR <= band.right + 1,
        `ink ${inkL.toFixed(0)}-${inkR.toFixed(0)} vs plank ${band.left.toFixed(0)}-${band.right.toFixed(0)}`);
}

// The per-minute readout lives under the total and must not run off the plank.
await p.evaluate(() => {
  window.__dbg.score = 124750;
  document.getElementById('flow').textContent = '$182/min';
});
await p.waitForTimeout(60);
const flow = await p.evaluate(() => {
  const r = document.getElementById('flow').getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
});
check('the rate line stays on the plank', flow.bottom <= band.bottom + 1,
      `flow bottom ${flow.bottom.toFixed(0)} vs plank ${band.bottom.toFixed(0)}`);

// The sign must not push the lives readout off the board or overlap it.
const clash = await p.evaluate(() => {
  const a = document.querySelector('#hud .stat.tips').getBoundingClientRect();
  const b = document.querySelectorAll('#hud .stat')[1].getBoundingClientRect();
  return { gap: b.left - a.right };
});
check('the sign does not collide with Tables lost', clash.gap > 0, `${clash.gap.toFixed(0)}px gap`);

// The whole reason #board exists: a sign this tall hanging off the viewport
// starts in the letterbox gutter and crosses the board's top edge halfway
// down. It has to hang inside the board at every window shape.
for (const [name, vp] of [['desk', { width: 1440, height: 900 }],
                          ['short', { width: 1280, height: 620 }],
                          ['phone', { width: 430, height: 844 }]]) {
  await p.setViewportSize(vp);
  await p.waitForTimeout(220);
  const fit = await p.evaluate(() => {
    const s = document.querySelector('#hud .stat.tips').getBoundingClientRect();
    const c = document.getElementById('game').getBoundingClientRect();
    return { top: s.top - c.top, bottom: c.bottom - s.bottom,
             left: s.left - c.left, right: c.right - s.right,
             frac: (s.width * s.height) / (c.width * c.height) };
  });
  check(`${name}: the sign hangs inside the board`,
        fit.top >= 0 && fit.left >= 0 && fit.right >= 0 && fit.bottom >= 0,
        `t${fit.top.toFixed(0)} l${fit.left.toFixed(0)} r${fit.right.toFixed(0)} b${fit.bottom.toFixed(0)}`);
  // The HUD is in CSS pixels while the board scales, so a small window makes
  // the sign proportionally larger. A quarter of the board is the line.
  check(`${name}: the sign does not eat the board`, fit.frac < 0.25,
        `${(fit.frac * 100).toFixed(0)}% of the board`);
  // The HUD scale must not reach the mute button. Scaling it with the board
  // took it to 15px square on a phone.
  const btn = await p.evaluate(() => {
    const m = document.getElementById('muteBtn').getBoundingClientRect();
    return Math.min(m.width, m.height);
  });
  check(`${name}: the mute button stays hittable`, btn >= 30, `${btn.toFixed(0)}px`);
}
await p.setViewportSize({ width: 1000, height: 760 });
await p.waitForTimeout(200);

// ---- the lives row ----
// Three carved stones that drain as tables walk. Two states off one asset, so
// the risk is not a missing image but a `lost` class that changes nothing --
// which looks like a life you did not lose.
check('the stone icon loaded', await p.evaluate(async () => {
  const url = getComputedStyle(document.querySelector('.life'))
                .backgroundImage.slice(5, -2);
  const img = new Image(); img.src = url;
  try { await img.decode(); return img.naturalWidth > 0; } catch { return false; }
}));

const row = () => p.evaluate(() => [...document.querySelectorAll('#lives .life')]
  .map(e => ({ lost: e.classList.contains('lost'),
               filter: getComputedStyle(e).filter,
               opacity: getComputedStyle(e).opacity,
               r: e.getBoundingClientRect() })));

let r = await row();
check('three stones', r.length === 3, `${r.length}`);
check('all three start intact', r.every(s => !s.lost));
check('they sit in a row', r[0].r.top === r[2].r.top && r[0].r.left < r[2].r.left);

await p.evaluate(() => { window.__dbg.lives = 1; });
await p.waitForTimeout(80);
r = await row();
check('losing tables spends stones from the right',
      !r[0].lost && r[1].lost && r[2].lost,
      r.map(s => s.lost ? 'x' : 'o').join(''));
check('a spent stone actually looks spent',
      r[1].filter !== r[0].filter && +r[1].opacity < +r[0].opacity,
      `${r[1].opacity} vs ${r[0].opacity}`);
check('but it stays in the row', r[1].r.width === r[0].r.width && r[1].r.width > 0,
      `${r[1].r.width}px`);

// The row hangs under a right-aligned label, so its right edge is the one that
// has to line up -- and the whole stat has to stay on the board.
const lives = await p.evaluate(() => {
  const l = document.getElementById('lives').getBoundingClientRect();
  const lab = document.querySelector('#hud .stat:not(.tips) span.label').getBoundingClientRect();
  const c = document.getElementById('game').getBoundingClientRect();
  return { dRight: Math.abs(l.right - lab.right), inside: c.right - l.right, top: l.top - c.top };
});
check('the stones line up with their label', lives.dRight < 2, `${lives.dRight.toFixed(1)}px out`);
// The mute button parks under this stat. Stones are twice the height the dots
// were, and the button's old offset put it on top of the third one.
const mute = await p.evaluate(() => {
  const m = document.getElementById('muteBtn').getBoundingClientRect();
  const l = document.getElementById('lives').getBoundingClientRect();
  return { gap: m.top - l.bottom, size: Math.min(m.width, m.height) };
});
check('the mute button clears the stones', mute.gap > 0, `${mute.gap.toFixed(0)}px gap`);
check('the lives stat stays on the board', lives.inside >= 0 && lives.top >= 0,
      `r${lives.inside.toFixed(0)} t${lives.top.toFixed(0)}`);

// Two intact and one spent, so the screenshot shows both states side by side.
await p.evaluate(() => { window.__dbg.lives = 2; });
await p.waitForTimeout(80);

mkdirSync('art-source/shots', { recursive: true });
await p.screenshot({ path: 'art-source/shots/hud.png',
                     clip: { x: 0, y: 0, width: 1000, height: 300 } });
console.log('wrote art-source/shots/hud.png');

console.log(errs.length ? '\nPAGE ERRORS: ' + errs.join(' | ') : '\nno page errors');
console.log(fail.length ? `${fail.length} FAILED: ${fail.join(', ')}` : 'all checks passed');
await br.close();
process.exit(fail.length ? 1 : 0);
