// Personal-best persistence: the three end-card branches, and survival of a reload.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/best.js
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const B = 'http://127.0.0.1:8222';

const fail = [];
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!ok) fail.push(n); };

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await br.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  await p.evaluate(() => localStorage.removeItem('dineo.best'));

  // Drive endGame directly with a chosen score, and read what the card says.
  // .so-best-num replaced .big-stat/p.best when the end card moved onto the
  // baked clipboard art (see index.html's endGame()) -- the prose paragraph
  // and the amber pill are gone, the six figures now sit in fixed slots on
  // assets/ui/endcard-board.webp instead. It used to carry a .so-best-cap
  // underneath ("New best" / "First shift" / "$X to beat"), dropped later
  // because a second, smaller line under the figure read as cramped rather
  // than informative -- the box is number-only now, so what's checked here
  // is which figure it shows, not a caption explaining it.
  const runShift = (cents) => p.evaluate(async (c) => {
    const d = window.__dbg;
    d.score = c;
    d.endGame();
    const o = document.getElementById('overlay');
    return {
      stored: localStorage.getItem('dineo.best'),
      bestNum: o.querySelector('.so-best-num')?.textContent,
    };
  }, cents);

  const first = await runShift(50000);                    // $500, no prior best
  check('first shift stores a best', first.stored === '50000', first.stored);
  check('first shift shows that shift\'s own score, having nothing else to show',
        /500\.00/.test(first.bestNum || ''), JSON.stringify(first.bestNum));

  const worse = await runShift(20000);                    // $200, under the best
  check('a worse shift does not overwrite', worse.stored === '50000', worse.stored);
  check('a worse shift still shows the standing best, not the shift just played',
        /500\.00/.test(worse.bestNum || ''), JSON.stringify(worse.bestNum));

  const better = await runShift(80000);                   // $800, a new record
  check('a better shift overwrites', better.stored === '80000', better.stored);
  check('a better shift shows the new score as the headline figure',
        /800\.00/.test(better.bestNum || ''), JSON.stringify(better.bestNum));

  // Survives a reload -- the whole point.
  await p.reload({ waitUntil: 'load' });
  const after = await p.evaluate(() => localStorage.getItem('dineo.best'));
  check('the best survives a reload', after === '80000', after);

  // A corrupt key must not take the end screen down with it.
  await p.evaluate(() => localStorage.setItem('dineo.best', 'not-a-number'));
  const corrupt = await runShift(10000);
  check('a corrupt key degrades to no-best', corrupt.stored === '10000', corrupt.stored);

  // Tips accumulate separately from score.
  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  const tipsWired = await p.evaluate(() => typeof window.__dbg.tips === 'number');
  console.log(tipsWired ? 'note: tips exposed on probe' : 'note: tips not exposed on probe (checked in source instead)');

  console.log(errs.length ? '\npage errors:\n' + errs.join('\n') : '\nno page errors');
  console.log(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed');
  await br.close();
  process.exit(fail.length ? 1 : 0);
})();
