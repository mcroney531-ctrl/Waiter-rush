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

// ---- the tips sign ----
// Drawn on the board, so there is no element to measure. Everything below is
// derived from SIGN (the box the renderer draws into) and PLANK (the band of
// that art the text is allowed to touch), which is exactly what the renderer
// works from.
const SIGN = await p.evaluate(() => ({ ...window.__dbg.SIGN }));
console.log('sign box', JSON.stringify(SIGN));

check('the sign art loaded', await p.evaluate(async () => {
  const img = new Image(); img.src = 'assets/money-sign.png';
  try { await img.decode(); return img.naturalWidth > 0; } catch { return false; }
}));
// 520x400 art in a box of another shape would stretch it, and a stretched
// plank is not the plank PLANK was measured against.
check('the box keeps the art aspect',
      Math.abs(SIGN.w / SIGN.h - 520 / 400) < 0.02,
      `${(SIGN.w / SIGN.h).toFixed(3)} vs 1.300`);

// A five-figure shift has to fit the wood, not just the box.
const PX = Math.round(SIGN.w * 0.125);
const plankW = SIGN.w * (PLANK.right - PLANK.left);
for (const t of ['$0.00', '$75.00', '$1247.50', '$9999.99']) {
  const w = await p.evaluate(([t, px]) => window.__dbg.moneyMetrics(t, px), [t, PX]);
  check(`${t} fits between the frame rails`, w <= plankW,
        `${w.toFixed(0)}px of ${plankW.toFixed(0)}px plank`);
}
// The total is centred at 0.60 of the height with a middle baseline, so its
// ink runs half a cap height either side. Half the font size is a generous
// stand-in for that and still has to land inside the wood.
const textTop = SIGN.textY - (PX / 2) / SIGN.h, textBot = SIGN.textY + (PX / 2) / SIGN.h;
check('the total sits on the plank vertically',
      textTop >= PLANK.top && textBot <= PLANK.bottom,
      `${textTop.toFixed(2)}-${textBot.toFixed(2)} vs plank ${PLANK.top}-${PLANK.bottom}`);
// The flow line is smaller and sits under the total; same middle baseline.
const FLOW_PX = Math.round(SIGN.w * 0.065);
check('the flow line stays on the plank too',
      SIGN.flowY + (FLOW_PX / 2) / SIGN.h <= PLANK.bottom &&
      SIGN.flowY - (FLOW_PX / 2) / SIGN.h >= textBot,
      `${SIGN.flowY} vs total bottom ${textBot.toFixed(2)}, plank bottom ${PLANK.bottom}`);

// Board furniture it must not sit on. The passes and the dish returns are
// walk-into targets and the tables carry the numbers the whole game is about;
// a sign over any of them costs something real.
const clear = await p.evaluate(S => {
  const d = window.__dbg;
  const hits = (b) => !(S.x + S.w <= b.x - b.w/2 || S.x >= b.x + b.w/2 ||
                        S.y + S.h <= b.y - b.h/2 || S.y >= b.y + b.h/2);
  return { pass: d.PASSES.filter(hits).length, bus: d.BUS.filter(hits).length,
           tables: d.tables.filter(t => hits({ x: t.padX, y: t.padY, w: 90, h: 60 })).length };
}, SIGN);
check('the sign clears the pickup counters', clear.pass === 0, `${clear.pass} hit`);
check('the sign clears the dish returns', clear.bus === 0, `${clear.bus} hit`);
check('the sign clears every set-down pad', clear.tables === 0, `${clear.tables} hit`);
check('the sign is on the board', SIGN.x >= 0 && SIGN.y >= 0 &&
      SIGN.x + SIGN.w <= 960 && SIGN.y + SIGN.h <= 640,
      `${SIGN.x},${SIGN.y} ${SIGN.w}x${SIGN.h}`);

// The reason it is painted rather than hung in the DOM. The floor reaches the
// left wall and a sprite is far taller than its feet, so a player at the dish
// return stands behind anything down here -- as DOM the sign cut them in half.
// Park them in the corner and prove their pixels win.
const canvasPatch = (x, y, w, h) => p.evaluate(([x, y, w, h]) => {
  const c = document.getElementById('game');
  return [...c.getContext('2d').getImageData(x, y, w, h).data].join(',');
}, [x, y, w, h]);

await p.evaluate(() => { const d = window.__dbg; d.player.x = 9999; d.player.y = 9999; });
await p.waitForTimeout(200);
const without = await canvasPatch(SIGN.x, SIGN.y, SIGN.w, SIGN.h);
await p.evaluate(() => { const d = window.__dbg; d.player.x = -9999; d.player.y = -9999; });
await p.waitForTimeout(250);
const withHim = await canvasPatch(SIGN.x, SIGN.y, SIGN.w, SIGN.h);
const where = await p.evaluate(() => ({ x: window.__dbg.player.x, y: window.__dbg.player.y }));
check('the player can reach the sign at all',
      where.x < SIGN.x + SIGN.w && where.y < SIGN.y + SIGN.h + 120,
      `clamps to ${where.x},${where.y.toFixed(0)}`);
check('and draws in front of it, not behind', without !== withHim);
await p.evaluate(() => { const d = window.__dbg; d.player.x = 480; d.player.y = 520; });
await p.waitForTimeout(150);

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
  const lab = document.querySelector('#hud .stat span.label').getBoundingClientRect();
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

// ---- and all of it at the shapes a window actually comes in ----
// The board scales with the window and the HUD is scaled to match, so the
// stones stay proportional for free. The mute button is the exception: it is
// counter-scaled back out, because scaling it with the board took it to 15px
// square on a phone, which is not a control you can hit with a thumb.
for (const [name, vp] of [['desk', { width: 1440, height: 900 }],
                          ['short', { width: 1280, height: 620 }],
                          ['phone', { width: 430, height: 844 }]]) {
  await p.setViewportSize(vp);
  await p.waitForTimeout(220);
  const m = await p.evaluate(() => {
    const b = document.getElementById('muteBtn').getBoundingClientRect();
    const l = document.getElementById('lives').getBoundingClientRect();
    const c = document.getElementById('game').getBoundingClientRect();
    return { size: Math.min(b.width, b.height), gap: b.top - l.bottom,
             frac: (l.width * l.height) / (c.width * c.height),
             inside: c.right - l.right >= 0 && l.top - c.top >= 0 };
  });
  check(`${name}: the mute button stays hittable`, m.size >= 30, `${m.size.toFixed(0)}px`);
  check(`${name}: it still clears the stones`, m.gap > 0, `${m.gap.toFixed(0)}px gap`);
  check(`${name}: the stones stay on the board and in proportion`,
        m.inside && m.frac < 0.05, `${(m.frac * 100).toFixed(1)}% of the board`);
}
await p.setViewportSize({ width: 1000, height: 760 });
await p.waitForTimeout(200);

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
