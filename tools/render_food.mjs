/**
 * Render a food model into a game-ready plate icon.
 *
 *   node tools/render_food.mjs art-source/burger.glb --name burger
 *   node tools/render_food.mjs art-source/burger.glb --contact
 *
 * Sibling to render_sprites.mjs, and deliberately not folded into it. That one
 * renders a rigged character: three facing rows, a walk cycle sampled across
 * frames, and an anchor measured so the feet meet the floor. Food has no rig,
 * no facing and no feet — it is one still, centred in its own box — so sharing
 * the code would mean threading a flag through every one of those decisions.
 *
 * What the two DO share is the light rig, and that part matters: the icons sit
 * on the same board as the characters, so a dish lit from a different direction
 * reads as pasted on. The ambient, key and fill below are copied from
 * render_sprites.mjs and should be changed in both or neither.
 *
 * The output is cropped to its own content with a small margin. The game scales
 * whatever it gets into a 68x62 slot (`TICKET` in index.html), preserving
 * aspect, so the pixel size here only needs to be comfortably above that.
 *
 * --contact renders a grid of camera elevations instead of one icon. Worth
 * doing once per new food style: the readable angle for a stacked burger is not
 * the readable angle for a bowl of soup.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
const glbArg = args.find(a => !a.startsWith('--'));
if (!glbArg) {
  console.error('usage: node tools/render_food.mjs <model.glb> [--name x] ' +
                '[--cell 256] [--elev 38] [--yaw 0] [--rim 4] [--contact]');
  process.exit(1);
}
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i === -1 ? d : args[i + 1];
};
const has = k => args.includes('--' + k);

const GLB     = resolve(ROOT, glbArg);
const NAME    = opt('name', basename(GLB, extname(GLB)).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
const CELL    = +opt('cell', 256);
const ELEV    = +opt('elev', 38);
const YAW     = +opt('yaw', 0);
const CONTACT = has('contact');
// Outline half-width in render pixels. 0 turns it off.
const RIM     = +opt('rim', 4);
// Elevations worth comparing: near the character camera, progressively higher,
// then straight down like the illustrated plates this replaces.
const ELEVS   = [26, 38, 50, 62, 90];
const YAWS    = [0, 90, 180, 270];

if (!existsSync(GLB)) { console.error('no such model:', GLB); process.exit(1); }
const three = resolve(ROOT, 'node_modules/three');
if (!existsSync(three)) {
  console.error('three.js not found. Run: npm install three playwright');
  process.exit(1);
}

const STAGE = resolve(ROOT, '.sprite-stage');
await rm(STAGE, { recursive: true, force: true });
await mkdir(join(STAGE, 'models'), { recursive: true });
await cp(join(three, 'build/three.module.min.js'), join(STAGE, 'three.module.min.js'));
await cp(join(three, 'build/three.core.min.js'),   join(STAGE, 'three.core.min.js'));
await cp(join(three, 'examples/jsm'), join(STAGE, 'jsm'), { recursive: true });
await cp(GLB, join(STAGE, 'models/model.glb'));

const PAGE = `<canvas id="c"></canvas>
<script type="importmap">
{"imports":{"three":"./three.module.min.js","three/addons/":"./jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CELL = ${CELL}, CONTACT = ${CONTACT}, RIM = ${RIM};
const ELEVS = ${JSON.stringify(ELEVS)}, YAWS = ${JSON.stringify(YAWS)};
const ONE = { elev: ${ELEV}, yaw: ${YAW} };
const cols = CONTACT ? YAWS.length : 1, rows = CONTACT ? ELEVS.length : 1;

const cellCanvas = document.createElement('canvas');
cellCanvas.width = cellCanvas.height = CELL;
const renderer = new THREE.WebGLRenderer({ canvas: cellCanvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Identical to render_sprites.mjs. See the note at the top of this file.
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 2.1));
const key = new THREE.DirectionalLight(0xfff2dd, 2.4); key.position.set(-4, 7, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7); fill.position.set(5, 3, -4); scene.add(fill);

const sheet = document.getElementById('c');
sheet.width = CELL * cols; sheet.height = CELL * rows;
const sctx = sheet.getContext('2d');

// A pale outline traced round the dish, the way the illustrated icons this
// replaces got theirs for free from a cream plate rim.
//
// It is not decoration. The icons sit on the dark board, and a Meshy dish comes
// back on a dark stone plate: measured against the floor under the ticket rail
// (luminance 68), the illustrated plate's outer edge separates by 107 and the
// bare render by 42. The outline puts that back without repainting the model,
// and it is baked into the PNG rather than drawn by the game so the icons stay
// one kind of thing — index.html does not need to know which are 3D.
function outlined(src, r) {
  const sil = document.createElement('canvas');
  sil.width = src.width; sil.height = src.height;
  const s = sil.getContext('2d');
  s.drawImage(src, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = '${opt('rim-color', '#F6EEDC')}';
  s.fillRect(0, 0, sil.width, sil.height);

  const out = document.createElement('canvas');
  out.width = src.width + r * 2; out.height = src.height + r * 2;
  const o = out.getContext('2d');
  // Stamping the silhouette around a circle dilates by exactly r in every
  // direction. A shadow-blur outline would fade out and read as a glow.
  const steps = Math.max(16, Math.ceil(r * 8));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    o.drawImage(sil, r + Math.cos(a) * r, r + Math.sin(a) * r);
  }
  o.drawImage(src, r, r);
  return out;
}

window.run = () => new Promise((res, rej) => {
  new GLTFLoader().load('./models/model.glb', g => {
    const root = g.scene;
    root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        // Same reason as the character renderer: packs ship a metal factor with
        // no environment map to reflect, and a metal with nothing to reflect
        // renders black. Roughness is left as authored — unlike a character,
        // a little specular on a plate rim is wanted.
        if (m.metalness !== undefined) m.metalness = 0;
      }
    });

    // Centre on the bounding box in all three axes. A character is planted on
    // the floor so its feet land on the anchor; an icon has no ground contact
    // and wants to sit in the middle of its own box.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    root.scale.setScalar(2 / span);
    const b2 = new THREE.Box3().setFromObject(root);
    const c = b2.getCenter(new THREE.Vector3());
    root.position.sub(c);
    const holder = new THREE.Group(); holder.add(root); scene.add(holder);

    // Half-height 1.5 against a span of 2 leaves margin for the diagonal, so
    // rotating the model can never clip it against the edge of the cell.
    const h = 1.5;
    const cam = new THREE.OrthographicCamera(-h, h, h, -h, 0.1, 100);

    const shots = CONTACT
      ? ELEVS.flatMap((e, r) => YAWS.map((y, cIdx) => ({ elev: e, yaw: y, r, c: cIdx })))
      : [{ ...ONE, r: 0, c: 0 }];

    for (const s of shots) {
      const el = THREE.MathUtils.degToRad(s.elev);
      cam.position.set(0, Math.sin(el) * 20, Math.cos(el) * 20);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
      holder.rotation.y = THREE.MathUtils.degToRad(s.yaw);
      renderer.render(scene, cam);
      sctx.clearRect(s.c * CELL, s.r * CELL, CELL, CELL);
      sctx.drawImage(cellCanvas, s.c * CELL, s.r * CELL);
    }

    // A single icon is cropped to its own content before it leaves here.
    // The shipped icons are all tight to the dish, and the game scales whatever
    // it is given into the ticket slot preserving aspect — so padding inside
    // the file does not centre the dish, it shrinks it. An uncropped icon would
    // render visibly smaller than every other plate on the rail.
    let bbox = null, png;
    if (CONTACT) {
      png = sheet.toDataURL('image/png');
    } else {
      const d = sctx.getImageData(0, 0, CELL, CELL).data;
      let L = 1e9, T = 1e9, R = -1, B = -1;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          if (d[(y * CELL + x) * 4 + 3] < 12) continue;
          if (x < L) L = x; if (x > R) R = x;
          if (y < T) T = y; if (y > B) B = y;
        }
      }
      if (R < 0) throw new Error('nothing rendered — the model is empty or off camera');
      bbox = { L, T, R, B };
      const cut = document.createElement('canvas');
      cut.width = R - L + 1; cut.height = B - T + 1;
      cut.getContext('2d').drawImage(sheet, L, T, cut.width, cut.height,
                                     0, 0, cut.width, cut.height);
      png = (RIM ? outlined(cut, RIM) : cut).toDataURL('image/png');
    }
    res({ png, bbox, cols, rows, elevs: ELEVS, yaws: YAWS });
  }, undefined, e => rej(String(e)));
});
document.title = 'ready';
</script>`;
await writeFile(join(STAGE, 'index.html'), PAGE);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const p = join(STAGE, rel === '/' ? 'index.html' : rel);
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const PREINSTALLED = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
                      '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
                     .find(p => existsSync(p));
const browser = await chromium.launch({
  ...(PREINSTALLED ? { executablePath: PREINSTALLED } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page error:', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => document.title === 'ready', { timeout: 60000 });
const out = await page.evaluate(() => window.run());
await browser.close();
server.close();

const buf = Buffer.from(out.png.split(',')[1], 'base64');
if (CONTACT) {
  const dest = resolve(ROOT, `food-contact-${NAME}.png`);
  await writeFile(dest, buf);
  console.log(`  contact  ${dest}`);
  console.log(`  rows     elevation ${out.elevs.join(', ')}`);
  console.log(`  columns  yaw ${out.yaws.join(', ')}`);
} else {
  await mkdir(resolve(ROOT, 'assets/food'), { recursive: true });
  const dest = resolve(ROOT, `assets/food/${NAME}.png`);
  await writeFile(dest, buf);
  const { L, T, R, B } = out.bbox;
  const w = R - L + 1, h = B - T + 1;
  // What the game will actually show it at, so the number that matters is
  // visible without opening index.html. TICKET is { slot: 68, maxH: 62 }.
  const sc = Math.min(68 / w, 62 / h);
  console.log(`  icon     assets/food/${NAME}.png  ${w}x${h}` +
              `  (cropped from ${CELL}x${CELL})`);
  console.log(`  camera   ${ELEV}° elevation, yaw ${YAW}°`);
  console.log(`  in game  ${Math.round(w * sc)}x${Math.round(h * sc)} on the ticket rail`);
}
await rm(STAGE, { recursive: true, force: true });
