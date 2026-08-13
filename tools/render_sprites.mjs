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
    // per (row, frame): deepest pixel, and mirror symmetry of the silhouette.
    // Depth says how far the frame has to drop to reach the floor; symmetry
    // says whether it looks like standing. They are different questions --
    // the deepest frame of a walk is the one where the legs pass each other,
    // which grounds perfectly and reads as a stride frozen mid-step.
    const cellB = ROWS.map(() => new Array(FRAMES).fill(-1));
    const cellSym = ROWS.map(() => new Array(FRAMES).fill(0));
    for (let y = 0; y < sheet.height; y++) {
      for (let x = 0; x < sheet.width; x++) {
        if (d[(y * sheet.width + x) * 4 + 3] < 12) continue;
        const cx = x % CELL, cy = y % CELL;
        if (cx < L) L = cx; if (cx > R) R = cx;
        if (cy < T) T = cy; if (cy > B) B = cy;
        const r = Math.floor(y / CELL);
        if (cy > rowB[r]) rowB[r] = cy;
        const f = Math.floor(x / CELL);
        if (cy > cellB[r][f]) cellB[r][f] = cy;
      }
    }
    const at = (r, f, cx, cy) =>
      d[(((r * CELL + cy) * sheet.width) + (f * CELL + cx)) * 4 + 3] >= 12;
    for (let r = 0; r < ROWS.length; r++) {
      for (let f = 0; f < FRAMES; f++) {
        let lo = 1e9, hi = -1;
        for (let cy = 0; cy < CELL; cy++)
          for (let cx = 0; cx < CELL; cx++)
            if (at(r, f, cx, cy)) { if (cx < lo) lo = cx; if (cx > hi) hi = cx; }
        if (hi < 0) continue;
        const mid = Math.round((lo + hi) / 2), half = Math.min(mid - lo, hi - mid);
        let both = 0, either = 0;
        for (let cy = 0; cy < CELL; cy++)
          for (let k = 1; k <= half; k++) {
            const a = at(r, f, mid - k, cy), b = at(r, f, mid + k, cy);
            if (a && b) both++; if (a || b) either++;
          }
        cellSym[r][f] = either ? both / either : 0;
      }
    }
    // Head-on rows (down, up): the most symmetric frame is the squared-up
    // standing one. The side row has no standing pose in a walk cycle at all,
    // so frame 0 -- both feet down, the calmest of them.
    const idleFrames = ROWS.map((rn, r) =>
      rn === 'right' ? 0 : cellSym[r].indexOf(Math.max(...cellSym[r])));
    // How tall the character stands in its held down-facing frame. This, not
    // the union bounding box, is what scale is set from -- see cfg below.
    let sTop = 1e9, sBot = -1;
    for (let cy = 0; cy < CELL; cy++)
      for (let cx = 0; cx < CELL; cx++)
        if (at(0, idleFrames[0], cx, cy)) { if (cy < sTop) sTop = cy; if (cy > sBot) sBot = cy; }
    res({ png: sheet.toDataURL('image/png'), clip: clip ? clip.name : null,
          animated: !!clip, bbox: { L, T, R, B }, rowB, cellB, idleFrames,
          standSpan: sBot - sTop, cell: CELL });
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

const { L, T, R, B, } = out.bbox;
const drawnW = R - L, drawnH = B - T;
const { cellB, idleFrames, standSpan } = out;
// How tall a character stands on the 960px board, in rendered px. Every tier of
// a character must share one value or promoting resizes the player mid-shift;
// the five characters are allowed to differ from each other. Existing sheets
// were normalised to their own former averages (103.9 - 116.7), so a new
// character should be given the value of the one it is replacing, or ~111 for
// a genuinely new face.
const TARGET_STAND = +opt('stand', 111);
// anchorY (= B/CELL) is the deepest pixel across ALL rows and frames, which in
// practice is one frame of the "down" row -- a character facing the camera
// plants its feet lowest. Every other row and frame falls short of it by its
// own amount, so each needs its own correction or it renders above the floor.
//
// Two sets, because standing and walking want different targets. groundIdle
// lands the single held idle frame exactly on its own soles. groundWalk gets
// one constant per row -- a per-frame one would flatten the gait and hop where
// the cycle's feet fail to return to a common plane -- and that constant is the
// row's MEDIAN frame rather than its deepest, so the error is centred instead
// of always lifting the character off the floor.
const rowMedian = r => {
  const s = [...cellB[r]].sort((a, b) => a - b);
  return (s[(FRAMES >> 1) - 1] + s[FRAMES >> 1]) / 2;
};
const frac = v => +(v / CELL).toFixed(4);
const cfg = {
  src: `assets/sprites/${NAME}.png`,
  frameW: CELL, frameH: CELL,
  // NOT the old "fit the union bbox into 130px" rule. That is height-limited on
  // every sheet in practice, so one extreme frame anywhere -- a tail at full
  // swing, a lean at the end of a stride -- sized the whole character, and a
  // promotion to the next tier resized the player by up to 6% mid-shift. Size
  // off the STANDING pose instead, which is what the player actually reads as
  // how big this character is. TARGET_STAND is in rendered px on the 960 board;
  // keep a character's four tiers on one value or promotions will pop.
  scale: +(TARGET_STAND / standSpan).toFixed(3),
  anchorX: +(((L + R) / 2) / CELL).toFixed(3),
  anchorY: +(B / CELL).toFixed(3),
  groundWalk: [0, 1, 2].map(r => frac(B - rowMedian(r))),
  groundIdle: [0, 1, 2].map(r => frac(B - cellB[r][idleFrames[r]])),
  // Which frame each row holds while standing still. There is no idle clip --
  // standing is the walk cycle paused -- and frame 0 is simply where the clip
  // starts, not where a foot is down. See index.html's drawSheetBody.
  idleFrames,
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
console.log(`  stands  ${(standSpan * cfg.scale).toFixed(1)}px tall (target ${TARGET_STAND})`);
console.log(`  ground  walk ${JSON.stringify(cfg.groundWalk)}  idle ${JSON.stringify(cfg.groundIdle)}`);
console.log(`  idleFrames ${JSON.stringify(cfg.idleFrames)}  (down, right, up)`);
// The roster in index.html keeps sheet configs inline so the game still runs
// from a file:// double-click. Printing the exact line means adding a tier is a
// paste rather than a transcription of four measured numbers.
console.log('  roster  ' +
  `{ src: '${cfg.src}', scale: ${cfg.scale}, ` +
  `anchorX: ${cfg.anchorX}, anchorY: ${cfg.anchorY}, ` +
  `groundWalk: ${JSON.stringify(cfg.groundWalk)}, ` +
  `groundIdle: ${JSON.stringify(cfg.groundIdle)}, ` +
  `idleFrames: ${JSON.stringify(cfg.idleFrames)} },`);
if (cfg.frameW !== 192 || FRAMES !== 8) {
  console.log(`  ! SHEET_BASE in index.html assumes 192px cells and 8 walk frames; ` +
              `this is ${cfg.frameW}px / ${FRAMES}. Override them in the roster entry.`);
}
if (!out.animated) console.log('  ! export the RIGGED + ANIMATED glb, not the mesh/texture one');
