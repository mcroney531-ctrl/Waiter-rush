// The tips sign: does the total actually land on the plank, at every width a
// shift can produce?
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/moneysign.js
//
// The check is geometric, not visual. The sign art is a fixed image, so the
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
}
await p.setViewportSize({ width: 1000, height: 760 });
await p.waitForTimeout(200);

mkdirSync('art-source/shots', { recursive: true });
await p.screenshot({ path: 'art-source/shots/money-sign.png',
                     clip: { x: 0, y: 0, width: 1000, height: 300 } });
console.log('wrote art-source/shots/money-sign.png');

console.log(errs.length ? '\nPAGE ERRORS: ' + errs.join(' | ') : '\nno page errors');
console.log(fail.length ? `${fail.length} FAILED: ${fail.join(', ')}` : 'all checks passed');
await br.close();
process.exit(fail.length ? 1 : 0);
