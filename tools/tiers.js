// Proves the tier machinery with throwaway tinted stand-ins: promotion fires at
// the right score, only one step at a time, the art actually swaps, a tier with
// no art is skipped rather than announced, and a reset drops back to tier 1.
// Run:  python3 tools/mkprobe.py && python3 -m http.server 8222 &
//       node tools/tiers.js
// Runs against the real shipped sheets. The missing-art cases below point at
// paths that deliberately do not exist, which is the whole point of them.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

// Same reason as render_sprites.mjs: a freshly installed playwright pins its
// own browser build and refuses to start without downloading one, which is slow
// and pointless when a working Chromium is already on the box.
const PREINSTALLED = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
                      '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
                     .find(x => existsSync(x));
const LAUNCH = PREINSTALLED ? { executablePath: PREINSTALLED } : {};
const B = process.env.BASE || 'http://127.0.0.1:8222';

const TIERS = [
  { src: 'assets/sprites/tyrone-t1.png', scale: 0.743, anchorX: 0.529, anchorY: 0.911 },
  { src: 'assets/sprites/tyrone-t2.png', scale: 0.739, anchorX: 0.539, anchorY: 0.922 },
  { src: 'assets/sprites/tyrone-t3.png', scale: 0.739, anchorX: 0.529, anchorY: 0.917 },
  { src: 'assets/sprites/tyrone-t4.png', scale: 0.756, anchorX: 0.549, anchorY: 0.896 }
];

const fail = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got ${JSON.stringify(got)}${ok ? '' : '  want ' + JSON.stringify(want)}`);
  if (!ok) fail.push(name);
};

(async () => {
  const br = await chromium.launch({ ...LAUNCH, args: ['--no-sandbox'] });
  const p = await br.newPage({ viewport: { width: 1000, height: 700 } });
  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  await p.click('#landingStart');
  await p.waitForSelector('.cast button', { timeout: 30000 });   // character select is ready
  await p.click('#avatarCancel'); await p.waitForTimeout(300);
  for (const sel of ['#skipBtn', '#startBtn']) {
    const el = await p.$(sel);
    if (el && await el.isVisible()) { await el.click(); await p.waitForTimeout(350); }
  }

  // ---- all four tiers present ----
  await p.evaluate(t => window.__dbg.setRoster('tyrone', t), TIERS);
  await p.waitForFunction(() => window.__dbg.tierArt.every(Boolean), { timeout: 15000 });
  check('starts at tier 1', await p.evaluate(() => window.__dbg.tier), 0);

  const setScore = async v => { await p.evaluate(s => { window.__dbg.score = s; }, v); await p.waitForTimeout(60); };

  await setScore(7499);
  check('$74.99 stays tier 1', await p.evaluate(() => window.__dbg.tier), 0);
  await setScore(7500);
  check('$75 promotes to tier 2', await p.evaluate(() => window.__dbg.tier), 1);
  check('promotion announces', await p.evaluate(() => window.__dbg.tierNotice > 0), true);

  // one step at a time: a jump past several thresholds must not skip tiers
  await setScore(99999);
  check('one step per check', await p.evaluate(() => window.__dbg.tier), 2);
  await setScore(99999);
  check('next check steps again', await p.evaluate(() => window.__dbg.tier), 3);
  await setScore(99999);
  check('stops at the top tier', await p.evaluate(() => window.__dbg.tier), 3);

  await p.screenshot({ path: '/tmp/tier4.png', clip: { x: 0, y: 0, width: 960, height: 640 } });

  // ---- reset drops back ----
  await p.evaluate(() => { document.getElementById('startBtn').click(); });
  await p.waitForTimeout(400);
  check('reset returns to tier 1', await p.evaluate(() => window.__dbg.tier), 0);
  check('reset clears the banner', await p.evaluate(() => window.__dbg.tierNotice), 0);

  // ---- a gap in the art ----
  const holey = TIERS.slice();
  holey[1] = { src: 'assets/sprites/MISSING.png', scale: 0.751, anchorX: 0.542, anchorY: 0.901 };
  await p.evaluate(t => window.__dbg.setRoster('tyrone', t), holey);
  await p.waitForTimeout(1200);
  check('missing tier reports unloaded', await p.evaluate(() => window.__dbg.tierArt), [true, false, true, true]);
  await setScore(7500);
  check('missing tier does not announce', await p.evaluate(() => window.__dbg.tierNotice), 0);
  check('still renders a sheet', await p.evaluate(() => window.__dbg.sheetOn), true);
  await setScore(20000);
  check('recovers at the next real tier', await p.evaluate(() => window.__dbg.tier), 2);

  // ---- no art at all falls back to the drawn body ----
  await p.evaluate(() => window.__dbg.setRoster('tyrone',
    [{ src: 'assets/sprites/NOPE.png', scale: 0.751, anchorX: 0.542, anchorY: 0.901 }]));
  await p.waitForTimeout(900);
  check('no art -> placeholder body', await p.evaluate(() => window.__dbg.sheetOn), false);

  console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(', ')}` : '\nall checks passed');
  await br.close();
  process.exit(fail.length ? 1 : 0);
})();
