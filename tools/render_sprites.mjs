/**
 * Render a rigged, animated GLB into a game-ready sprite sheet.
 *
 *   node tools/render_sprites.mjs art-source/tyrone.glb --name tyrone
 *
 * Writes assets/sprites/<name>.png and assets/sprites/<name>.json, where the
 * JSON is the exact `playerSheet` object index.html expects — including an
 * anchor measured from the rendered pixels rather than guessed.
 *
 * Requires `npm install three playwright` (dev only; nothing here ships).
 *
 * Everything the Quaternius trial run taught is baked in:
 *   - metalness is forced to 0. Packs commonly ship 0.4 with no environment
 *     map, and a metal with nothing to reflect renders black. That alone made
 *     the first attempt come out as silhouettes.
 *   - --lift raises the palette. Naturalistic greens and browns read as a
 *     black blob against a warm wood floor.
 *   - the anchor is measured, never assumed, or the character floats or sinks.
 *   - yaw mapping for a model facing +Z: 180 is toward camera, 90 right,
 *     0 away. Left mirrors right in the game, so only three rows are drawn.
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
  console.error('usage: node tools/render_sprites.mjs <model.glb> [--name x] ' +
                '[--frames 8] [--cell 192] [--elev 34] [--lift 0.1] [--anim Walk]');
  process.exit(1);
}
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i === -1 ? d : args[i + 1];
};

const GLB    = resolve(ROOT, glbArg);
const NAME   = opt('name', basename(GLB, extname(GLB)).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
const FRAMES = +opt('frames', 8);
const CELL   = +opt('cell', 192);
const ELEV   = +opt('elev', 34);
const LIFT   = +opt('lift', 0);
const ANIM   = opt('anim', 'Walk');
const ROWS   = ['down', 'right', 'up'];          // left mirrors right in-game
// Which way the model faces at yaw 0. Meshy's biped rigs come out facing +Z,
// i.e. toward the camera, so down is 0 and right is 90. A model authored the
// other way round needs --yaw-down 180. Always check the rendered sheet: if the
// "down" row shows a back and the "up" row shows a face, flip this.
const YAW_DOWN = +opt('yaw-down', 0);
const YAW = { down: YAW_DOWN, right: YAW_DOWN + 90, up: YAW_DOWN + 180 };

if (!existsSync(GLB)) { console.error('no such model:', GLB); process.exit(1); }

const three = resolve(ROOT, 'node_modules/three');
if (!existsSync(three)) {
  console.error('three.js not found. Run: npm install three playwright');
  process.exit(1);
}

// ---------- stage a temp directory the browser can load from ----------
const STAGE = resolve(ROOT, '.sprite-stage');
await rm(STAGE, { recursive: true, force: true });
await mkdir(join(STAGE, 'models'), { recursive: true });
await cp(join(three, 'build/three.module.min.js'), join(STAGE, 'three.module.min.js'));
await cp(join(three, 'build/three.core.min.js'),   join(STAGE, 'three.core.min.js'));
await cp(join(three, 'examples/jsm'), join(STAGE, 'jsm'), { recursive: true });
await cp(GLB, join(STAGE, 'models/model.glb'));

const PAGE = `<canvas id="c" width="${CELL * FRAMES}" height="${CELL * ROWS.length}"></canvas>
<script type="importmap">
{"imports":{"three":"./three.module.min.js","three/addons/":"./jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CELL = ${CELL}, FRAMES = ${FRAMES}, ROWS = ${JSON.stringify(ROWS)};
const YAW = ${JSON.stringify(YAW)}, LIFT = ${LIFT}, FIT = 2.6;

// One offscreen cell is rendered at a time, then blitted into the sheet. A
// single huge WebGL canvas would need one camera per cell.
const cellCanvas = document.createElement('canvas');
cellCanvas.width = cellCanvas.height = CELL;
const renderer = new THREE.WebGLRenderer({ canvas: cellCanvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 2.1));
const key = new THREE.DirectionalLight(0xfff2dd, 2.4); key.position.set(-4, 7, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7); fill.position.set(5, 3, -4); scene.add(fill);

const sheet = document.getElementById('c');
const sctx = sheet.getContext('2d');

let mixer = null, root = null, cam = null, dur = 0;

window.run = () => new Promise((res, rej) => {
  new GLTFLoader().load('./models/model.glb', g => {
    root = g.scene;
    root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m.metalness !== undefined) m.metalness = 0;
        if (m.roughness !== undefined) m.roughness = 0.85;
        if (LIFT && m.color) {
          const hsl = {}; m.color.getHSL(hsl);
          m.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), Math.min(1, hsl.l + LIFT));
        }
      }
    });

    const span = (() => {
      const s = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      return Math.max(s.x, s.y, s.z);
    })();
    root.scale.setScalar(FIT / span);
    const b = new THREE.Box3().setFromObject(root);
    root.position.y -= b.min.y;
    root.position.x -= (b.max.x + b.min.x) / 2;
    root.position.z -= (b.max.z + b.min.z) / 2;
    const holder = new THREE.Group(); holder.add(root); scene.add(holder); root = holder;

    const clips = g.animations || [];
    const clip = clips.find(a => /${ANIM}/i.test(a.name)) || clips[0] || null;
    if (clip) { mixer = new THREE.AnimationMixer(g.scene); mixer.clipAction(clip).play(); dur = clip.duration; }

    const h = FIT * 0.62;
    cam = new THREE.OrthographicCamera(-h, h, h, -h, 0.1, 200);
    const el = THREE.MathUtils.degToRad(${ELEV});
    cam.position.set(0, Math.sin(el) * 20, Math.cos(el) * 20);
    cam.lookAt(0, FIT * 0.34, 0);

    ROWS.forEach((name, r) => {
      for (let f = 0; f < FRAMES; f++) {
        root.rotation.y = THREE.MathUtils.degToRad(YAW[name]);
        if (mixer) mixer.setTime((f / FRAMES) * dur);
        renderer.render(scene, cam);
        sctx.drawImage(cellCanvas, f * CELL, r * CELL);
      }
    });

    // measure the union of non-transparent pixels across every cell, so the
    // anchor comes from what was actually drawn
    const d = sctx.getImageData(0, 0, sheet.width, sheet.height).data;
    let L = 1e9, T = 1e9, R = -1, B = -1;
    const rowB = ROWS.map(() => -1);   // per-row deepest pixel -- see below
    for (let y = 0; y < sheet.height; y++) {
      for (let x = 0; x < sheet.width; x++) {
        if (d[(y * sheet.width + x) * 4 + 3] < 12) continue;
        const cx = x % CELL, cy = y % CELL;
        if (cx < L) L = cx; if (cx > R) R = cx;
        if (cy < T) T = cy; if (cy > B) B = cy;
        const r = Math.floor(y / CELL);
        if (cy > rowB[r]) rowB[r] = cy;
      }
    }
    res({ png: sheet.toDataURL('image/png'), clip: clip ? clip.name : null,
          animated: !!clip, bbox: { L, T, R, B }, rowB, cell: CELL });
  }, undefined, e => rej(String(e)));
});
document.title = 'ready';
</script>`;
await writeFile(join(STAGE, 'index.html'), PAGE);

// ---------- serve it ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const p = join(STAGE, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html'
                                                                           : decodeURIComponent(req.url.split('?')[0]));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// ---------- render ----------
// Prefer a Chromium the environment already provides. A freshly installed
// playwright package pins its own build and will refuse to start without
// downloading one, which is both slow and pointless when a working browser is
// sitting right there. Falls back to playwright's own if none is found.
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
await rm(STAGE, { recursive: true, force: true });

// ---------- write the sheet and its config ----------
await mkdir(join(ROOT, 'assets/sprites'), { recursive: true });
const pngPath = join(ROOT, 'assets/sprites', NAME + '.png');
await writeFile(pngPath, Buffer.from(out.png.split(',')[1], 'base64'));

const { L, T, R, B } = out.bbox;
const drawnW = R - L, drawnH = B - T;
// aim for a character about 130px long on the 960px board
const scale = +(130 / Math.max(drawnW, drawnH)).toFixed(3);
// anchorY (= B/CELL) is the deepest pixel across ALL rows, which in practice
// is always "down" -- a character facing the camera plants its feet lowest
// in frame. "right" and "up" don't reach as deep in their own cell (a
// back-facing pose is a different silhouette, not a rotated copy of the
// facing-camera one), so drawing them through this same anchorY left every
// character floating whenever they turned away from the camera -- confirmed
// against all 20 shipped sheets, 12-19px of gap on "up" alone. groundGap{Right,Up}
// is that row's own shortfall against "down", added back in drawSheetBody so
// each direction's own feet land on BODY.ground the way "down"'s already did.
// Math.max(0, ...) because a row occasionally measures a hair deeper than
// "down" (rig noise, not a real difference) -- down is the one being drawn
// correctly, so nothing should lift it to chase that.
const rowB = out.rowB;
const cfg = {
  src: `assets/sprites/${NAME}.png`,
  frameW: CELL, frameH: CELL,
  scale,
  anchorX: +(((L + R) / 2) / CELL).toFixed(3),
  anchorY: +(B / CELL).toFixed(3),
  groundGapRight: +Math.max(0, (B - rowB[1]) / CELL).toFixed(3),
  groundGapUp: +Math.max(0, (B - rowB[2]) / CELL).toFixed(3),
  idleFps: 5,
  dirs: { down: { row: 0 }, right: { row: 1 }, left: { mirror: 'right' }, up: { row: 2 } },
  walk: { first: 0, count: FRAMES },
  idle: { first: 0, count: 1 }
};
await writeFile(join(ROOT, 'assets/sprites', NAME + '.json'), JSON.stringify(cfg, null, 2) + '\n');

console.log(`${NAME}: ${out.animated ? 'clip "' + out.clip + '"' : 'NO ANIMATION — every frame identical'}`);
console.log(`  sheet   ${pngPath.replace(ROOT + '/', '')}  ${CELL * FRAMES}x${CELL * ROWS.length}`);
console.log(`  drawn   ${drawnW}x${drawnH} inside a ${CELL}px cell`);
console.log(`  anchor  x ${cfg.anchorX}  y ${cfg.anchorY}   scale ${cfg.scale}`);
console.log(`  groundGap  right ${cfg.groundGapRight}  up ${cfg.groundGapUp}`);
// The roster in index.html keeps sheet configs inline so the game still runs
// from a file:// double-click. Printing the exact line means adding a tier is a
// paste rather than a transcription of four measured numbers.
console.log('  roster  ' +
  `{ src: '${cfg.src}', scale: ${cfg.scale}, ` +
  `anchorX: ${cfg.anchorX}, anchorY: ${cfg.anchorY}, ` +
  `groundGapRight: ${cfg.groundGapRight}, groundGapUp: ${cfg.groundGapUp} },`);
if (cfg.frameW !== 192 || FRAMES !== 8) {
  console.log(`  ! SHEET_BASE in index.html assumes 192px cells and 8 walk frames; ` +
              `this is ${cfg.frameW}px / ${FRAMES}. Override them in the roster entry.`);
}
if (!out.animated) console.log('  ! export the RIGGED + ANIMATED glb, not the mesh/texture one');
