// The money display: the subset font actually loading, and the HUD number not
// changing width as its digits change.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/money.js
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
await p.click('#avatarCancel'); await p.waitForTimeout(300);
for (const s of ['#skipBtn','#startBtn']) { const e=await p.$(s); if(e&&await e.isVisible()){await e.click();await p.waitForTimeout(350);} }
await p.waitForTimeout(400);

check('font loaded', await p.evaluate(()=>document.fonts.check('20px Money')));
check('score uses the money face',
  await p.evaluate(()=>getComputedStyle(document.getElementById('score')).fontFamily.includes('Money')));

// the whole point: the HUD must not change width as digits change
const widthAt = v => p.evaluate(n=>{
  window.__dbg.score = n;
  const e=document.getElementById('score');
  return e.getBoundingClientRect().width;
}, v);
const w1 = await widthAt(11111);
const w0 = await widthAt(0);      // $0.00 is shorter, so compare same-length values
const a = await widthAt(111111);  // $1111.11
const b = await widthAt(888888);  // $8888.88
check('same digit count, same width', Math.abs(a-b) < 0.5, `${a.toFixed(1)} vs ${b.toFixed(1)}`);
const c = await widthAt(100000);  // $1000.00
const d = await widthAt(999999);  // $9999.99
check('and across the range', Math.abs(c-d) < 0.5, `${c.toFixed(1)} vs ${d.toFixed(1)}`);

// digits are boxed, punctuation is not
const boxes = await p.evaluate(()=>{
  window.__dbg.score = 123456;
  const e=document.getElementById('score');
  return { html:e.innerHTML, digits:e.querySelectorAll('i').length };
});
check('every digit boxed, punctuation left alone', boxes.digits === 6, boxes.html);

await p.screenshot({ path:'/tmp/money-hud.png', clip:{x:0,y:0,width:560,height:120} });
console.log(errs.length?'\nERRORS: '+errs.join(' | '):'\nno page errors');
console.log(fail.length?`${fail.length} FAILED`:'all checks passed');
await br.close(); process.exit(fail.length?1:0);
