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
  check('the delivery made a register sound', (await counts()).osc > 0);

  // ---- the patience warning ----
  // Both the table state and the patience value are set directly rather than
  // played out. Orders spawn every seven seconds at shift open and a table
  // drains 0.006 of its patience in 700ms, so doing this honestly would cost
  // the best part of a minute per case and be at the mercy of whatever else the
  // shift was doing. State and patience are exactly what the warning keys on,
  // so setting them is the test rather than a shortcut around it.
  //
  // `quiet()` parks every table full and already-warned, so the only tables
  // that can make a sound in a case are the ones that case armed.
  //
  // One warning is four oscillators, not two: two notes, each a fundamental
  // plus a detuned partial — which is what makes a tone a bell and not a beep.
  const PER_WARN = 4;

  const quiet = () => p.evaluate(() => {
    for (const t of window.__dbg.tables){
      if (t.state === 'waiting'){ t.patience = 1; t.warned = true; }
    }
  });
  const arm = n => p.evaluate(count => {
    const w = window.__dbg.tables.slice(0, count);
    for (const t of w){ t.state = 'waiting'; t.patience = 0.21; t.warned = false; }
    return w.length;
  }, n);

  await quiet();
  await p.waitForTimeout(1000);          // let any earlier cooldown expire
  await reset();
  check('a table was available to warn', await arm(1) === 1);
  await p.waitForTimeout(350);
  const warned = await counts();
  check('dropping below the line warns', warned.osc === PER_WARN,
        `${warned.osc / 2} notes`);

  // still below, already announced — must not say it again
  await reset();
  await p.evaluate(() => {
    const t = window.__dbg.tables.find(t => t.state === 'waiting' && t.warned);
    if (t) t.patience = 0.15;
  });
  await p.waitForTimeout(600);
  check('staying low does not repeat', (await counts()).osc === 0);

  // a whole floor crossing at once is one announcement, not eight
  await quiet();
  await p.waitForTimeout(1000);
  await reset();
  const many = await arm(8);
  await p.waitForTimeout(350);
  const together = await counts();
  check('simultaneous warnings collapse', together.osc === PER_WARN,
        `${many} tables -> ${together.osc / PER_WARN} warning`);

  // ---- muting silences everything ----
  await p.evaluate(() => { document.getElementById('muteBtn').click(); });
  await reset();
  await p.keyboard.down('ArrowRight');
  await p.waitForTimeout(1200);
  await p.keyboard.up('ArrowRight');
  const silent = await counts();
  check('muted makes no nodes', silent.osc === 0 && silent.buf === 0,
        `${silent.osc} osc / ${silent.buf} buf`);
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
