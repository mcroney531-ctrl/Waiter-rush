/**
 * Look at a room prop before it has a texture.
 *
 *   node tools/preview_prop.mjs art-source/room/table.glb
 *   node tools/preview_prop.mjs art-source/room/table.glb --with tyrone-t1
 *
 * Meshy's Image to 3D produces geometry first and texture second, so the first
 * download is an untextured mesh. Rendered through render_food.mjs that comes
 * out as a white silhouette -- the default material is white and the shared
 * light rig is bright enough for textured art -- which tells you nothing about
 * the shape.
 *
 * So this clays it: a neutral matte grey over the same camera and the same light
 * rig the sprites use, which is the "assemble grey before any dressing" step of
 * DINING-ROOM-3D-RUNBOOK.md done on one prop.
 *
 * It also answers the two questions that decide whether a prop is usable at all,
 * neither of which is visible in Meshy's viewer:
 *
 *   - which way is up? Meshy exports Z-up as often as Y-up, and a table lying on
 *     its side looks fine in a viewer that lets you orbit.
 *   - how big is it against a character? --with loads a real sprite GLB beside
 *     it at the same scale, which is the only way to judge "a table surface
 *     should sit at roughly half his height" without guessing.
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
  console.error('usage: node tools/preview_prop.mjs <model.glb> [--with <character>] '
              + '[--textured] [--elev 34]');
  process.exit(1);
}
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : args[i + 1]; };

const GLB   = resolve(ROOT, glbArg);
const NAME  = basename(GLB, extname(GLB));
const ELEV  = +opt('elev', 34);          // matches render_sprites.mjs
const WITH  = opt('with', null);
const CELL  = +opt('cell', 460);
// Clay is the default because the first download out of Meshy has no material
// at all. Once Texture has been run, --textured shows what actually ships.
const TEXTURED = args.includes('--textured');
const YAWS  = [0, 90, 180, 270];

const STAGE = join(ROOT, '.prop-stage');
await rm(STAGE, { recursive: true, force: true });
await mkdir(STAGE, { recursive: true });
await cp(GLB, join(STAGE, 'model.glb'));
if (WITH) {
  const c = resolve(ROOT, 'art-source', WITH + '.glb');
  if (!existsSync(c)) { console.error(`no such character: ${c}`); process.exit(1); }
  await cp(c, join(STAGE, 'char.glb'));
}
// Staged exactly the way render_food.mjs does it. three splits its core out of
// the module build, and GLTFLoader imports through the `three/addons/` specifier
// -- copying just the two files and importing GLTFLoader by relative path loads
// a second, separate copy of three and the loader silently never resolves.
const three = join(ROOT, 'node_modules', 'three');
await cp(join(three, 'build/three.module.min.js'), join(STAGE, 'three.module.min.js'));
await cp(join(three, 'build/three.core.min.js'),   join(STAGE, 'three.core.min.js'));
await cp(join(three, 'examples/jsm'), join(STAGE, 'jsm'), { recursive: true });

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#2b2b2b">
<script>
  // Without this a loader that never resolves just hangs the wait, and the run
  // costs two minutes to tell you nothing.
  addEventListener('error', e => { window.__err = String(e.message || e); document.title = 'failed'; });
  addEventListener('unhandledrejection', e => { window.__err = String(e.reason); document.title = 'failed'; });
</script>
<script type="importmap">
{"imports":{"three":"./three.module.min.js","three/addons/":"./jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CELL = ${CELL}, YAWS = ${JSON.stringify(YAWS)}, WITH = ${WITH ? 'true' : 'false'};
const TEXTURED = ${TEXTURED};
const sheet = document.createElement('canvas');
sheet.width = CELL * YAWS.length; sheet.height = CELL;
const sctx = sheet.getContext('2d');

const cell = document.createElement('canvas'); cell.width = cell.height = CELL;
const renderer = new THREE.WebGLRenderer({ canvas: cell, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();

// Same rig as render_sprites.mjs and render_food.mjs. Changing it here without
// changing it there is how a prop ends up lit from a different sun than the cast.
scene.add(new THREE.AmbientLight(0xffffff, 2.1));
const key  = new THREE.DirectionalLight(0xfff2dd, 2.4); key.position.set(-4, 7, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7); fill.position.set(5, 3, -4); scene.add(fill);

const CLAY = new THREE.MeshStandardMaterial({ color: 0x9a9188, roughness: 0.85, metalness: 0 });

function load(url){
  return new Promise((res, rej) => new GLTFLoader().load(url, g => res(g), undefined, e => rej(String(e))));
}

// Meshy exports Z-up about as often as Y-up, and the giveaway is which axis is
// the shortest -- a table is wider and deeper than it is tall.
function uprightGuess(size){
  const a = [['x', size.x], ['y', size.y], ['z', size.z]].sort((p, q) => p[1] - q[1]);
  return a[0][0];
}

const out = {};
const g = await load('model.glb');
let root = g.scene;
// computeVertexNormals is only safe on the clay path: it discards the shading
// normals the exporter wrote, which is what makes an untextured mesh readable,
// and would flatten a textured one's baked detail.
root.traverse(o => {
  if (!o.isMesh) return;
  if (TEXTURED) { out.materialCount = (out.materialCount || 0) + 1; return; }
  o.material = CLAY;
  o.geometry.computeVertexNormals();
});

let box = new THREE.Box3().setFromObject(root);
let size = box.getSize(new THREE.Vector3());
out.rawSize = { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) };
out.shortestAxis = uprightGuess(size);
// Stand it up: the shortest axis becomes Y.
if (out.shortestAxis === 'z') root.rotation.x = -Math.PI / 2;
else if (out.shortestAxis === 'x') root.rotation.z = Math.PI / 2;

const holder = new THREE.Group(); holder.add(root); scene.add(holder);
box = new THREE.Box3().setFromObject(holder);
size = box.getSize(new THREE.Vector3());
out.uprightSize = { w: +size.x.toFixed(3), h: +size.y.toFixed(3), d: +size.z.toFixed(3) };
holder.position.y -= box.min.y;
holder.position.x -= (box.max.x + box.min.x) / 2;
holder.position.z -= (box.max.z + box.min.z) / 2;

let charH = null;
if (WITH) {
  const cg = await load('char.glb');
  const c = cg.scene;
  const cb = new THREE.Box3().setFromObject(c);
  const cs = cb.getSize(new THREE.Vector3());
  charH = Math.max(cs.x, cs.y, cs.z);
  c.position.y -= cb.min.y;
  c.position.x = size.x * 0.75;
  scene.add(c);
  out.characterHeight = +charH.toFixed(3);
  out.tableTopVsCharacter = +(size.y / charH).toFixed(3);
}

// Framed off what is actually in shot rather than off the prop alone: with a
// character standing beside it the group is much wider than the prop, and
// sizing the camera to the prop left both of them as specks in a white field.
const shot = new THREE.Box3().setFromObject(scene);
const shotSize = shot.getSize(new THREE.Vector3());
const shotMid = shot.getCenter(new THREE.Vector3());
const span = Math.max(shotSize.x, shotSize.y) * 0.62;
const el = THREE.MathUtils.degToRad(${ELEV});
const cam = new THREE.OrthographicCamera(-span, span, span, -span, 0.1, 200);

for (let i = 0; i < YAWS.length; i++) {
  holder.rotation.y = THREE.MathUtils.degToRad(YAWS[i]);
  cam.position.set(shotMid.x, Math.sin(el) * 20, Math.cos(el) * 20);
  cam.lookAt(shotMid.x, shotSize.y * 0.45, 0);
  renderer.render(scene, cam);
  sctx.drawImage(cell, i * CELL, 0);
}
out.png = sheet.toDataURL('image/png');
window.__out = out;
document.title = 'ready';
</script>`;
await writeFile(join(STAGE, 'index.html'), PAGE);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.glb': 'model/gltf-binary', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const p = join(STAGE, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html'
                                                                           : req.url.slice(1));
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await br.newPage();
page.on('pageerror', e => console.error('page error:', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => document.title === 'ready' || document.title === 'failed',
                           null, { timeout: 120000 });
const err = await page.evaluate(() => window.__err);
if (err) { console.error('preview failed:', err); await br.close(); server.close(); process.exit(1); }
const out = await page.evaluate(() => window.__out);
await br.close(); server.close();

const dir = join(ROOT, 'art-source', 'shots');
await mkdir(dir, { recursive: true });
const dst = join(dir, `prop-${NAME}.png`);
await writeFile(dst, Buffer.from(out.png.split(',')[1], 'base64'));
await rm(STAGE, { recursive: true, force: true });

console.log(`  raw bbox        ${out.rawSize.x} x ${out.rawSize.y} x ${out.rawSize.z}`);
console.log(`  shortest axis   ${out.shortestAxis}  ->  ${out.shortestAxis === 'y'
  ? 'already Y-up' : `exported ${out.shortestAxis.toUpperCase()}-up, stood upright for this preview`}`);
console.log(`  upright         ${out.uprightSize.w} wide x ${out.uprightSize.h} tall x ${out.uprightSize.d} deep`);
if (out.characterHeight != null) {
  console.log(`  character       ${out.characterHeight} tall`);
  console.log(`  table / char    ${(out.tableTopVsCharacter * 100).toFixed(0)}%  (the spec wants ~50%)`);
}
console.log(`  shown as        ${TEXTURED ? 'its own textures' : 'neutral clay'}`);
console.log(`  wrote           art-source/shots/prop-${NAME}.png`);
