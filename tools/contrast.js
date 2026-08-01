// Every word on the pre-shift screens, measured against the backdrop.
//
//   python3 tools/mkprobe.py && python3 -m http.server 8222 &
//   node tools/contrast.js
//
// The landing, the title/end-of-shift panel and the character select all now
// sit on a painted fossil wall instead of flat #1c1712. Nothing errors when a
// colour stops being readable on it -- the shift total was #2F6F6B, a teal
// left over from the pre-art palette, and landed at 1.13:1 against the wall's
// brightest patch while looking merely "a bit murky" in a screenshot.
//
// So this walks the real DOM of each screen, finds every element that draws
// text directly onto the backdrop, and measures it against the worst pixel the
// backdrop can put behind it. Worst pixel, not average: these are centred
// flex columns that reflow, and text lands wherever the window is tall or
// short that day.
//
// Elements that paint their own background (the buttons, the character card)
// are skipped -- they are not on the wall.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const B = process.env.BASE || 'http://127.0.0.1:8222';

// WCAG AA. 24px+ (or 19px+ bold) counts as large text and drops to 3:1.
const AA_NORMAL = 4.5, AA_LARGE = 3.0;

const fail = [];
const check = (n, ok, d) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`);
  if (!ok) fail.push(n);
};

const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const p = await br.newPage({ viewport: { width: 1280, height: 860 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

// The backdrop is drawn into a canvas once, and each element is measured
// against the brightest pixel *under its own box* rather than the brightest
// pixel anywhere. The image is `cover`, so where a patch lands depends on the
// window; the mapping is redone per element, so the measurement follows the
// layout instead of assuming it. Measuring everything against the lamp glow at
// the top would force every faded label on the page to be as loud as the one
// element that sits under it.
const installBackdrop = () => p.evaluate(async () => {
  const img = new Image();
  img.src = 'assets/ui/backdrop.webp';
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = new Float32Array(c.width * c.height);
  let max = 0;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    L[j] = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i+1]) + 0.0722 * lin(d[i+2]);
    if (L[j] > max) max = L[j];
  }
  // Not Math.max(...L): spreading 1.9M values overflows the call stack.
  window.__bd = { L, w: c.width, h: c.height, max };

  // background-size: cover -- the image is scaled to fill and centre-cropped.
  window.__bdWorst = (rect, vw, vh) => {
    const b = window.__bd;
    const s = Math.max(vw / b.w, vh / b.h);
    const dw = b.w * s, dh = b.h * s;
    const ox = (vw - dw) / 2, oy = (vh - dh) / 2;
    const x0 = Math.max(0, Math.floor((rect.left - ox) / s));
    const x1 = Math.min(b.w - 1, Math.ceil((rect.right - ox) / s));
    const y0 = Math.max(0, Math.floor((rect.top - oy) / s));
    const y1 = Math.min(b.h - 1, Math.ceil((rect.bottom - oy) / s));
    let m = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) { const v = b.L[y * b.w + x]; if (v > m) m = v; }
    return m;
  };
});

// Every text node drawn straight onto it, per screen.
const survey = screen => p.evaluate(screen => {
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const relL = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);

  const root = document.querySelector(screen);
  const out = [];
  for (const e of root.querySelectorAll('*')) {
    // only elements with their own visible text
    const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // does anything between this element and the screen paint a background?
    let onWall = true;
    for (let n = e; n && n !== root; n = n.parentElement) {
      const c = getComputedStyle(n);
      const bg = parse(c.backgroundColor);
      if ((bg.length === 3 || bg[3] > 0.05) && c.backgroundColor !== 'rgba(0, 0, 0, 0)') onWall = false;
      if (c.backgroundImage !== 'none') onWall = false;
    }
    if (!onWall) continue;

    // effective colour: opacity blends it toward whatever is behind, and what
    // is behind is the backdrop, so a faded label is a quieter label.
    const col = parse(cs.color);
    let a = (col[3] === undefined ? 1 : col[3]);
    for (let n = e; n && n !== root; n = n.parentElement) a *= +getComputedStyle(n).opacity;
    const px = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700 || cs.fontWeight === 'bold';
    out.push({
      tag: e.id || e.className || e.tagName.toLowerCase(),
      text: e.textContent.trim().slice(0, 24),
      L: relL(col), alpha: +a.toFixed(2), px, bold,
      large: px >= 24 || (bold && px >= 19),
      shadow: cs.textShadow !== 'none',
      bg: window.__bdWorst(r, innerWidth, innerHeight),
    });
  }
  return out;
}, screen);

const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function audit(name, screen) {
  const items = await survey(screen);
  // The landing is a picture and a plaque -- its only text is the plaque's
  // label, clipped out of view. Nothing to measure is a valid answer.
  console.log(`${name}: ${items.length} text element(s) on the wall`);
  for (const it of items) {
    // Blending a translucent colour against the backdrop is the worst case for
    // it too: it moves toward the background.
    const eff = it.L * it.alpha + it.bg * (1 - it.alpha);
    const c = ratio(eff, it.bg);
    const need = it.large ? AA_LARGE : AA_NORMAL;
    // A text-shadow does not count toward a contrast ratio, but it does mean
    // the author already knows the colour needs help; report it either way.
    check(`${name}: "${it.text}" is readable on the wall`, c >= need,
          `${c.toFixed(2)}:1 needs ${need} (${it.px}px${it.large ? ' large' : ''}` +
          `${it.alpha < 1 ? `, alpha ${it.alpha}` : ''}${it.shadow ? ', shadowed' : ''})`);
  }
}

// Run the whole flow at more than one shape. The point of sampling under each
// element is that placement decides which patch of wall it gets, and a phone
// stacks these screens completely differently from a desktop.
for (const [tag, vp] of [['desk', { width: 1280, height: 860 }],
                         ['phone', { width: 430, height: 844 }]]) {
  await p.setViewportSize(vp);
  await p.goto(B + '/probe.html', { waitUntil: 'load' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(500);
  // Reinstalled per navigation -- a goto wipes the window it lives on.
  await installBackdrop();
  const bd = await p.evaluate(() => ({ w: window.__bd.w, h: window.__bd.h, max: window.__bd.max }));
  check(`${tag}: the backdrop loaded`, bd.w > 0,
        `${bd.w}x${bd.h}, brightest relative luminance ${bd.max.toFixed(3)}`);
  await audit(`${tag} landing`, '#landing');

  await p.click('#landingStart');
  await p.waitForSelector('#avatarCard img', { timeout: 30000 });
  await p.waitForTimeout(400);
  await audit(`${tag} picker`, '#avatarPicker');

  await p.click('#avatarDone'); await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('skipBtn').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__dbg.lives = 0;
                           window.__dbg.tables.forEach(t => { t.state = 'waiting'; t.patience = 0.001; }); });
  await p.waitForFunction(() => !document.getElementById('overlay').classList.contains('hidden'),
                          null, { timeout: 15000 });
  await p.waitForTimeout(300);
  await audit(`${tag} shift over`, '#overlay');
}

console.log(errs.length ? '\nPAGE ERRORS: ' + errs.join(' | ') : '\nno page errors');
console.log(fail.length ? `${fail.length} FAILED: ${fail.join(', ')}` : 'all checks passed');
await br.close();
process.exit(fail.length ? 1 : 0);
