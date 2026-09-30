// The character-load gate: a run may not start until the committed character's
// own tier-1 sheet is loaded and decoded.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/charload.js            # all six cases, ~90s
//   node tools/charload.js cold-nondefault rapid   # a subset, by name
//
// The invariant is checked on every animation frame, not once at the end:
//
//   from the first frame the run is live, the sheet on screen is the
//   committed character's tier-1 sheet.
//
// That is deliberately stronger than "the placeholder body never showed".
// The placeholder has since been deleted, so a regression now draws *nothing*
// rather than a doll, and a check on sheetOn alone would pass it. Checking the
// sheet's identity also catches the two subtler failures a carousel preloader
// makes possible: a previously browsed character's late image landing on the
// floor, and a higher tier's sheet standing in for a missing tier 1.
//
// Every case gets a fresh browser context, so "cold" really is cold.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const B = process.env.BASE || 'http://127.0.0.1:8222';
const ONLY = process.argv.slice(2);
const PAGE = process.env.PAGE || 'probe.html';   // lets the same cases run against an older build

const fail = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) fail.push(name);
};

const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// A phone on a middling connection. Slow enough that four ~500KB sheets and
// the menu music genuinely compete, which is the condition the bug needs.
const PHONE = { offline: false, latency: 150,
                downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };

async function freshPage({ throttle, context } = {}){
  const ctx = context || await br.newContext({ viewport: { width: 1000, height: 760 } });
  const p = await ctx.newPage();
  if (throttle){
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.emulateNetworkConditions', throttle);
  }
  return { ctx, p };
}

// Records one sample per animation frame from here on. Cheap enough that it
// does not perturb the timing it is measuring.
async function startSampling(p){
  await p.evaluate(() => {
    window.__frames = [];
    const tick = () => {
      const d = window.__dbg;
      window.__frames.push({ t: performance.now(), running: d.running, char: d.charId,
                             src: d.sheetSrc, tier: d.tier, on: d.sheetOn });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// Every live frame must show `want`'s own tier-1 sheet at tier index 0.
async function invariant(p, want, label){
  const { frames, t1 } = await p.evaluate(id => ({ frames: window.__frames, t1: window.__dbg.t1src(id) }), want);
  const live = frames.filter(f => f.running);
  const bad = live.filter(f => !(f.char === want && f.tier === 0 && f.on
                                 && f.src && new URL(f.src).pathname.endsWith('/' + t1)));
  check(`${label}: the run started`, live.length > 0, { liveFrames: live.length });
  check(`${label}: every live frame shows ${want}'s own tier-1 sheet`, bad.length === 0,
        bad.length ? { badFrames: bad.length, first: bad[0] } : undefined);
  return live;
}

async function toPicker(p){
  await p.goto(B + '/' + PAGE, { waitUntil: 'domcontentloaded' });
  await startSampling(p);
  await p.click('#landingStart');
  await p.waitForSelector('#avatarCard img', { timeout: 60000 });
}

const waitRunning = (p, ms) =>
  p.waitForFunction(() => window.__dbg.running, null, { timeout: ms }).then(() => true, () => false);

const cases = {
  // 1. The reported bug, on the character a first-time visitor starts on.
  async 'cold-default'(){
    const { ctx, p } = await freshPage({ throttle: PHONE });
    await toPicker(p);
    await p.click('#avatarDone');
    await waitRunning(p, 60000);
    await p.waitForTimeout(500);
    await invariant(p, 'tyrone', 'cold default @4Mbps');
    await ctx.close();
  },

  // 2. The worst case measured: the preload at boot was for someone else.
  async 'cold-nondefault'(){
    const { ctx, p } = await freshPage({ throttle: PHONE });
    await toPicker(p);
    await p.click('#avatarNext');                 // tyrone -> velo
    await p.click('#avatarDone');
    await waitRunning(p, 60000);
    await p.waitForTimeout(500);
    await invariant(p, 'velo', 'cold non-default @4Mbps');
    await ctx.close();
  },

  // 3. Browsing fires overlapping loads. Hold every sheet, walk the carousel
  //    tyrone -> velo -> pip -> tyrone -> velo, commit velo, then release the
  //    sheets in an order chosen to be hostile: everyone else's first, velo's
  //    last, and a stale tyrone arriving after velo's run has already begun.
  async 'rapid'(){
    const { ctx, p } = await freshPage();
    const held = new Map();                       // filename -> [route]
    await p.route(/\/assets\/sprites\/.*\.png/, r => {
      const f = new URL(r.request().url()).pathname.split('/').pop();
      (held.get(f) || held.set(f, []).get(f)).push(r);
    });
    const release = async f => { for (const r of held.get(f) || []) await r.continue(); held.delete(f);
                                 await p.waitForTimeout(250); };
    await toPicker(p);
    for (const sel of ['#avatarNext', '#avatarNext', '#avatarPrev', '#avatarPrev', '#avatarNext']){
      await p.click(sel); await p.waitForTimeout(80);
    }
    await p.click('#avatarDone');
    await release('pip-t1.png');
    await release('tyrone-t1.png');
    check('rapid: no run while the committed sheet is still in flight',
          !(await p.evaluate(() => window.__dbg.running)));
    await release('velo-t1.png');
    check('rapid: the run starts once velo-t1 lands', await waitRunning(p, 5000));
    // Stragglers after the run has begun: a stale tier-1 for someone else, and
    // whatever else was requested along the way.
    for (const f of [...held.keys()]) await release(f);
    await p.waitForTimeout(400);
    await invariant(p, 'velo', 'rapid carousel, reordered completions');
    const after = await p.evaluate(() => ({ char: window.__dbg.charId, art: window.__dbg.tierSrcs }));
    check('rapid: the active tier ladder is entirely velo\'s',
          after.char === 'velo' && after.art.every(s => s.includes('/velo-')), after);
    await ctx.close();
  },

  // 4. Re-committing the same character between runs must not discard the
  //    sheets already in memory and re-open the gap.
  async 'recommit'(){
    const { ctx, p } = await freshPage();
    await toPicker(p);
    await p.click('#avatarDone');
    await waitRunning(p, 20000);
    const requests = [];
    p.on('request', r => { if (r.url().includes('/sprites/')) requests.push(r.url()); });
    await p.evaluate(() => window.__dbg.endGame());
    await p.waitForTimeout(300);
    await p.evaluate(() => { window.__frames.length = 0; });
    await p.click('#avatarBtn2');                                          // Shift Over -> Change your waiter
    await p.click('#avatarDone');                                          // "Use this waiter", same one
    await p.click('#startBtn');                                            // Run It Back
    await waitRunning(p, 5000);
    await p.waitForTimeout(400);
    await invariant(p, 'tyrone', 'same-character recommit');
    check('recommit: no sprite sheet was requested again', requests.length === 0, requests);
    await ctx.close();
  },

  // 5. Tier 1 genuinely unreachable. The run must not start at all -- not on
  //    the placeholder, not on tier 2 -- and pressing Start again must retry.
  async 'hard-fail'(){
    const { ctx, p } = await freshPage();
    let block = true;
    // Regex: retries append ?retry=N, which a .png glob would stop matching.
    await p.route(/\/assets\/sprites\/tyrone-t1\.png/, r => block ? r.abort('failed') : r.continue());
    await toPicker(p);
    await p.click('#avatarDone');
    await p.waitForTimeout(16000);                 // past the 400/1200/3500/9000 retry ladder
    const st = await p.evaluate(() => ({
      running: window.__dbg.running,
      picker: !document.getElementById('avatarPicker').classList.contains('hidden'),
      warn: !document.getElementById('avatarWarn').classList.contains('hidden') }));
    check('hard fail: the run never starts', st.running === false, st);
    check('hard fail: the picker stays open and says why', st.picker && st.warn, st);
    block = false;
    await p.click('#avatarDone');
    check('hard fail: pressing Start again retries and gets in', await waitRunning(p, 10000));
    await p.waitForTimeout(400);
    await invariant(p, 'tyrone', 'hard fail then retry');
    await ctx.close();
  },

  // 6. The gate must cost nothing when the art is already there.
  async 'warm'(){
    const ctx = await br.newContext({ viewport: { width: 1000, height: 760 } });
    const first = await freshPage({ context: ctx });
    await toPicker(first.p);
    await first.p.waitForTimeout(1500);            // let every sheet land and cache
    await first.p.close();
    const { p } = await freshPage({ context: ctx });
    await toPicker(p);
    await p.waitForTimeout(600);
    const t0 = await p.evaluate(() => performance.now());
    await p.click('#avatarDone');
    await waitRunning(p, 5000);
    const t1 = await p.evaluate(() => performance.now());
    await p.waitForTimeout(400);
    await invariant(p, 'tyrone', 'warm cache');
    // Generous, because the click itself round-trips through Playwright. The
    // failure this guards against is a gate that waits on something it did
    // not need to, which would show up as whole seconds.
    check('warm: the run starts without a visible wait', t1 - t0 < 400, { ms: Math.round(t1 - t0) });
    await ctx.close();
  },
};

for (const [name, fn] of Object.entries(cases)){
  if (ONLY.length && !ONLY.includes(name)) continue;
  console.log(`\n--- ${name}`);
  try { await fn(); }
  catch (e){ check(`${name}: threw`, false, String(e).split('\n')[0]); }
}

console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(', ')}` : '\nall checks passed');
await br.close();
process.exit(fail.length ? 1 : 0);
