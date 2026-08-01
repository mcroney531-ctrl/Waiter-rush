// The money display: the subset font actually loading, and the total not
// changing width as its digits change.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/money.js
//
// The total is painted on the board now, not laid out in the DOM, so there is
// no element to measure. moneyMetrics is the function the renderer steps the
// pen with, so measuring it is measuring what gets drawn -- and the probe
// wrapper sets the same font first, since the width of "$" and "." comes from
// ctx.measureText and would otherwise be whatever the last draw call left set.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const EXE=['/opt/pw-browsers/chromium/chrome-linux/chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const fail=[]; const check=(n,ok,d)=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)fail.push(n);};
const br=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
const p=await br.newPage({viewport:{width:1000,height:720},deviceScaleFactor:2});
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,160)));
p.on('requestfailed',r=>{const u=r.url(); if(!u.includes('fonts.googleapis'))errs.push('FAILED '+u.split('/').pop());});
await p.goto((process.env.BASE || 'http://127.0.0.1:8222') + '/probe.html');
await p.click('#landingStart'); await p.waitForSelector('#avatarCard img');
await p.click('#avatarDone'); await p.waitForTimeout(300);
for (const s of ['#skipBtn','#startBtn']) { const e=await p.$(s); if(e&&await e.isVisible()){await e.click();await p.waitForTimeout(350);} }
await p.waitForTimeout(400);

check('display font loaded', await p.evaluate(()=>document.fonts.check('20px Galindo')));

// A 744-byte woff2 once 200'd and failed to parse silently, so "did it load"
// is not the same question as "did it come out as Galindo". A face with no
// glyphs falls back, and the fallback has different metrics.
check('and it is the face being measured', await p.evaluate(()=>{
  const c = document.createElement('canvas').getContext('2d');
  c.font = '40px Galindo, sans-serif'; const a = c.measureText('0000').width;
  c.font = '40px sans-serif';          const b = c.measureText('0000').width;
  return Math.abs(a - b) > 1;
}));

const PX = 21;   // what drawTipsSign uses at the shipped sign width
const widthOf = t => p.evaluate(([t,px]) => window.__dbg.moneyMetrics(t, px), [t, PX]);

// the whole point: the total must not change width as digits change
const a = await widthOf('$1111.11'), b = await widthOf('$8888.88');
check('same digit count, same width', Math.abs(a-b) < 0.01, `${a.toFixed(2)} vs ${b.toFixed(2)}`);
const c = await widthOf('$1000.00'), d = await widthOf('$9999.99');
check('and across the range', Math.abs(c-d) < 0.01, `${c.toFixed(2)} vs ${d.toFixed(2)}`);

// ...but it must still grow when the number genuinely gets longer, or the
// stepping is just a fixed-width box that has stopped measuring anything
const short = await widthOf('$0.00');
check('a shorter total is narrower', short < a - PX, `${short.toFixed(2)} vs ${a.toFixed(2)}`);

// punctuation keeps its natural width -- if it were boxed too, "$1111.11"
// would be exactly 8 slots wide
const slot = PX * 0.72;
check('punctuation is not boxed', Math.abs(a - 8*slot) > 1,
      `${a.toFixed(2)} vs ${(8*slot).toFixed(2)} if every glyph were boxed`);

// and the digits really are on that slot: two totals one digit apart differ
// by exactly one slot
const e1 = await widthOf('$111.11'), e2 = await widthOf('$1111.11');
check('one more digit is one more slot', Math.abs((e2-e1) - slot) < 0.01,
      `${(e2-e1).toFixed(2)} vs ${slot.toFixed(2)}`);

console.log(errs.length?'\nERRORS: '+errs.join(' | '):'\nno page errors');
console.log(fail.length?`${fail.length} FAILED`:'all checks passed');
await br.close(); process.exit(fail.length?1:0);
