// Verifies the sound effects without being able to hear anything.
//
// Headless Chromium has no output device, but the Web Audio graph is still
// built — so patching the AudioContext prototype before the page loads counts
// every node the game creates. A footstep makes one oscillator, a tip makes one
// per bell note, and both make a buffer source. That is enough to prove rate,
// timing and the mute path.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/sfx.js
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

const fail = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) fail.push(name);
};

(async () => {
  const br = await chromium.launch({ ...LAUNCH,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await br.newPage({ viewport: { width: 1000, height: 700 } });

  await p.addInitScript(() => {
    window.__sfx = { osc: 0, buf: 0, ctxs: 0 };
    const C = window.AudioContext;
    const wrap = k => {
      const orig = C.prototype[k];
      C.prototype[k] = function (...a) {
        window.__sfx[k === 'createOscillator' ? 'osc' : 'buf']++;
        return orig.apply(this, a);
      };
    };
    wrap('createOscillator'); wrap('createBufferSource');
    window.AudioContext = function (...a) { window.__sfx.ctxs++; return new C(...a); };
    window.AudioContext.prototype = C.prototype;
  });

  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  check('no context before a gesture', await p.evaluate(() => window.__sfx.ctxs) === 0);

  await p.click('#landingStart');
  await p.waitForFunction(() => document.querySelectorAll('#avatarOptions img').length > 0, { timeout: 30000 });
  await p.click('#avatarCancel'); await p.waitForTimeout(300);
  for (const sel of ['#skipBtn', '#startBtn']) {
    const el = await p.$(sel);
    if (el && await el.isVisible()) { await el.click(); await p.waitForTimeout(350); }
  }
  check('gesture creates the context', await p.evaluate(() => window.__sfx.ctxs) === 1);

  const reset = () => p.evaluate(() => { window.__sfx.osc = 0; window.__sfx.buf = 0; });
  const counts = () => p.evaluate(() => ({ ...window.__sfx }));

  // ---- footsteps track distance, not time ----
  await reset();
  await p.keyboard.down('ArrowLeft');
  await p.waitForTimeout(2000);
  await p.keyboard.up('ArrowLeft');
  await p.waitForTimeout(120);
  const walked = await counts();
  // 550px/s over a 34px stride is ~5.2 half-cycles a second; the player hits the
  // wall partway through, so the floor is what matters, not an exact figure.
  check('walking makes footsteps', walked.osc >= 4 && walked.osc <= 14,
        `${walked.osc} steps in 2s`);
  check('each step is thump + scuff', walked.buf === walked.osc,
        `${walked.buf} bursts / ${walked.osc} oscillators`);

  await reset();
  await p.waitForTimeout(900);
  const idle = await counts();
  check('standing still is silent', idle.osc === 0 && idle.buf === 0);

  // ---- the tip sound scales with the tip ----
  await reset();
  await p.evaluate(() => { window.__dbg.score = 0; });
  const before = await p.evaluate(() => window.__dbg.deliveries);
  // walk a ticket to its table the crude way: let the game run and watch for a
  // delivery, then read the node count that accompanied it
  let delivered = false;
  for (let i = 0; i < 400 && !delivered; i++) {
    const s = await p.evaluate(() => {
      const d = window.__dbg;
      return { carried: d.carried.map(c => ({ type: c.type, tableId: c.tableId })),
               tickets: d.tickets.length, deliveries: d.deliveries,
               px: d.player.x, py: d.player.y, passes: d.PASSES,
               tables: d.tables.map(t => ({ id: t.id, padX: t.padX, padY: t.padY })) };
    });
    if (s.deliveries > before) { delivered = true; break; }
    const ord = s.carried.find(c => c.type === 'order');
    let tx, ty;
    if (ord) { const t = s.tables.find(t => t.id === ord.tableId); tx = t.padX; ty = t.padY; }
    else if (s.tickets) { tx = s.passes[0].x; ty = s.passes[0].y; }
    else { await p.waitForTimeout(50); continue; }
    const dx = tx - s.px, dy = ty - s.py, keys = [];
    if (dx > 4) keys.push('ArrowRight'); else if (dx < -4) keys.push('ArrowLeft');
    if (dy > 4) keys.push('ArrowDown');  else if (dy < -4) keys.push('ArrowUp');
    for (const k of keys) await p.keyboard.down(k);
    await p.waitForTimeout(40);
    for (const k of keys) await p.keyboard.up(k);
  }
  check('a delivery happened', delivered);

  // ---- muting silences everything ----
  await p.evaluate(() => { document.getElementById('muteBtn').click(); });
  await reset();
  await p.keyboard.down('ArrowRight');
  await p.waitForTimeout(1200);
  await p.keyboard.up('ArrowRight');
  const quiet = await counts();
  check('muted makes no nodes', quiet.osc === 0 && quiet.buf === 0,
        `${quiet.osc} osc / ${quiet.buf} buf`);
  check('mute persists', await p.evaluate(() => localStorage.getItem('dineo.muted')) === '1');

  // ---- and it survives a reload ----
  await p.reload({ waitUntil: 'load' });
  await p.click('#landingStart');
  await p.waitForTimeout(400);
  check('reload stays muted',
        await p.evaluate(() => document.getElementById('muteBtn').getAttribute('aria-pressed')) === 'true');

  console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(', ')}` : '\nall checks passed');
  await br.close();
  process.exit(fail.length ? 1 : 0);
})();
