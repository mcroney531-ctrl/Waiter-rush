// Score-over-time for a human-paced player, so tier thresholds are set on a
// real earnings curve rather than a guess. Same lagged bot as human.js: it does
// not notice a ticket the instant it lands.
// Run:  python3 tools/mkprobe.py && python3 -m http.server 8222 &
//       node tools/curve.js
// Prints the earnings curve TIER_UP_C is set against. Re-run it whenever the
// economy or the spawn ramp moves.
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8222';
const step = async (p, keys, ms) => {
  for (const k of keys) await p.keyboard.down(k);
  await p.waitForTimeout(ms);
  for (const k of keys) await p.keyboard.up(k);
};

(async () => {
  const LAG = +(process.env.LAG || 1200);
  const MAXMS = +(process.env.MAXMS || 240000);
  const br = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await br.newPage({ viewport: { width: 1000, height: 700 } });
  await p.route('**', r => {
    const u = r.request().url();
    if (!u.startsWith(B) && !u.startsWith('data:')) return r.abort();
    r.continue();
  });
  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  await p.click('#landingStart');
  await p.waitForFunction(() => document.querySelectorAll('#avatarOptions img').length > 0, { timeout: 30000 });
  // Skipping the picker from the landing drops into the TUTORIAL, not the
  // title screen — so the tutorial has to be skipped before "Skip to the
  // shift" exists. This is the harness breakage that has bitten twice.
  await p.click('#avatarCancel'); await p.waitForTimeout(300);
  for (const sel of ['#skipBtn', '#startBtn']) {
    const el = await p.$(sel);
    if (el && await el.isVisible()) { await el.click(); await p.waitForTimeout(350); }
  }
  await p.waitForFunction(() => document.getElementById('overlay').classList.contains('hidden'), { timeout: 15000 });

  const seen = new Map();
  const curve = [];
  const t0 = Date.now();
  let over = false;

  while (Date.now() - t0 < MAXMS && !over) {
    const s = await p.evaluate(() => {
      const d = window.__dbg;
      return { carried: d.carried.map(x => ({ type: x.type, tableId: x.tableId })),
               tickets: d.tickets.map(t => ({ side: t.side, id: t.tableId })),
               score: d.score, deliveries: d.deliveries, cleared: d.cleared,
               bus: d.BUS, passes: d.PASSES, px: d.player.x, py: d.player.y,
               tables: d.tables.map(t => ({ id: t.id, padX: t.padX, padY: t.padY, state: t.state })) };
    });

    let tx, ty;
    const dish = s.carried.find(x => x.type === 'dishes');
    const ord  = s.carried.find(x => x.type === 'order');
    if (dish) { const b = s.bus[s.px < 480 ? 0 : 1]; tx = b.x; ty = b.y; }
    else if (ord) { const t = s.tables.find(t => t.id === ord.tableId); tx = t.padX; ty = t.padY; }
    else {
      const dirty = s.tables.filter(t => t.state === 'dirty');
      if (s.tickets.length > 0) {
        if (!seen.has(s.tickets[0].id)) seen.set(s.tickets[0].id, Date.now());
        if (Date.now() - seen.get(s.tickets[0].id) < LAG) { await p.waitForTimeout(40); continue; }
        const want = s.tickets[0].side;
        const pass = s.passes.find(x => x.side === want) || s.passes[0];
        tx = pass.x; ty = pass.y;
      } else if (dirty.length) {
        dirty.sort((a, b) => Math.hypot(a.padX - s.px, a.padY - s.py) - Math.hypot(b.padX - s.px, b.padY - s.py));
        tx = dirty[0].padX; ty = dirty[0].padY;
      } else { tx = 480; ty = 470; }
    }

    const dx = tx - s.px, dy = ty - s.py, keys = [];
    if (dx > 4) keys.push('ArrowRight'); else if (dx < -4) keys.push('ArrowLeft');
    if (dy > 4) keys.push('ArrowDown');  else if (dy < -4) keys.push('ArrowUp');
    if (keys.length) await step(p, keys, 40); else await p.waitForTimeout(40);

    const t = Date.now() - t0;
    if (!curve.length || t - curve[curve.length - 1].t >= 5000)
      curve.push({ t, score: s.score, del: s.deliveries, cl: s.cleared });

    over = await p.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
  }

  const last = curve[curve.length - 1] || { t: 0, score: 0, del: 0, cl: 0 };
  console.log(`LAG=${LAG}  ended ${over ? 'game over' : 'time limit'} at ${(last.t/1000).toFixed(0)}s  ` +
              `$${(last.score/100).toFixed(2)}  ${last.del} deliveries  ${last.cl} cleared`);
  console.log('t(s)\tscore($)\tdeliveries');
  for (const c of curve) console.log(`${(c.t/1000).toFixed(0)}\t${(c.score/100).toFixed(2)}\t${c.del}`);
  // when each dollar milestone is first crossed
  const marks = [50, 100, 150, 200, 300, 400, 600];
  const hit = marks.map(m => {
    const c = curve.find(x => x.score >= m * 100);
    return `$${m}: ${c ? (c.t/1000).toFixed(0) + 's' : 'never'}`;
  });
  console.log('milestones  ' + hit.join('   '));
  await br.close();
})();
