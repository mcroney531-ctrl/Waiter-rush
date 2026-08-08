/**
 * Decimate a Meshy GLB to a triangle budget.
 *
 *   node tools/simplify_glb.mjs art-source/room/whatever.glb --target 60000
 *   node tools/simplify_glb.mjs in.glb --target 60000 --out art-source/room/planter.glb
 *
 * Meshy's Image to 3D does not ask what the model is for, so it hands back
 * whatever resolution the reconstruction settled on. Measured across the kit
 * that ranges from 28,934 triangles for the table to 1,637,074 for the planter
 * -- a 56x spread between two props that render at roughly the same size on a
 * 1536x1024 backdrop. The high end is pure waste: nothing in this room is seen
 * closer than a couple of hundred pixels wide.
 *
 * Why this rather than Meshy's own Remesh:
 *
 *   - it needs no re-download. A Meshy remesh means generating again and
 *     pulling another 40-70 MB through a transfer path that has been the
 *     bottleneck on this job more than once.
 *   - it is reproducible. The command is in the repo and re-runnable against
 *     the committed source; a Meshy setting is a memory of which box was
 *     ticked.
 *   - it is measurable here. gltf-transform reports what it did and whatis.py
 *     confirms it, so the triangle count and the bounding box can both be
 *     checked before anything is committed.
 *
 * `--target` rather than a ratio because a ratio is the wrong unit: the same
 * 0.08 that lands the dish return on 63k lands the planter on 131k. The budget
 * is what matters and the ratio is arithmetic, so this does the arithmetic.
 *
 * meshoptimizer will stop short of the target when the error bound would be
 * exceeded -- the floor inlay lands at 92k against a 60k request, because its
 * fossil relief is most of what it is. That is the algorithm protecting the
 * silhouette and is not something to force; raise --error only if a prop is
 * genuinely still too heavy afterwards.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const src = args.find(a => !a.startsWith('--'));
if (!src) {
  console.error('usage: node tools/simplify_glb.mjs <model.glb> [--target 60000] '
              + '[--out <path>] [--error 0.001]');
  process.exit(1);
}
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : args[i + 1]; };
const IN = resolve(ROOT, src);
const OUT = resolve(ROOT, opt('out', src));
const TARGET = +opt('target', 60000);
const ERROR = +opt('error', 0.001);

// Triangle count straight out of the glTF JSON chunk, so the budget is measured
// rather than taken on trust from the tool that is about to change it.
function triangles(path) {
  const d = readFileSync(path);
  if (d.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  let off = 12, js = null;
  while (off < d.length) {
    const len = d.readUInt32LE(off), type = d.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) { js = JSON.parse(d.subarray(off + 8, off + 8 + len).toString()); break; }
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  let t = 0;
  for (const m of js.meshes || []) {
    for (const p of m.primitives || []) {
      if (p.indices != null) t += Math.floor(js.accessors[p.indices].count / 3);
      else if (p.attributes?.POSITION != null) t += Math.floor(js.accessors[p.attributes.POSITION].count / 3);
    }
  }
  return t;
}

if (!existsSync(IN)) { console.error(`no such file: ${IN}`); process.exit(1); }
const before = triangles(IN);
const beforeMB = statSync(IN).size / 1e6;

if (before <= TARGET) {
  console.log(`  ${src}`);
  console.log(`  ${before.toLocaleString()} triangles is already under the ${TARGET.toLocaleString()} budget -- left alone`);
  process.exit(0);
}

const ratio = TARGET / before;
// Written through a temp path even when OUT === IN: gltf-transform reads
// lazily, and pointing it at its own input truncates the file it is reading.
// The temp name has to end in .glb -- gltf-transform picks its writer off the
// extension, and any other suffix makes it emit glTF-separate: a JSON file, a
// loose .bin and every texture unpacked beside it. Renaming that to .glb gives
// a file whose first four bytes are `{"as`, which is how this was found.
const TMP = OUT + '.simplify.tmp.glb';
const r = spawnSync('npx', ['--no-install', 'gltf-transform', 'simplify', IN, TMP,
                            '--ratio', String(ratio), '--error', String(ERROR)],
                    { cwd: ROOT, encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout || 'gltf-transform failed');
  console.error('\n(is it installed?  npm i -D @gltf-transform/cli)');
  process.exit(1);
}
const { renameSync } = await import('node:fs');
renameSync(TMP, OUT);

const after = triangles(OUT);
const afterMB = statSync(OUT).size / 1e6;
console.log(`  ${src}`);
console.log(`  ${before.toLocaleString().padStart(10)} tris  ${beforeMB.toFixed(1).padStart(6)} MB   before`);
console.log(`  ${after.toLocaleString().padStart(10)} tris  ${afterMB.toFixed(1).padStart(6)} MB   after   `
          + `(asked for ${TARGET.toLocaleString()}, ratio ${ratio.toFixed(4)})`);
if (after > TARGET * 1.25) {
  console.log(`  note: stopped ${(after / TARGET).toFixed(1)}x above the budget -- the error bound bit before`);
  console.log(`        the ratio did, which means the detail is load-bearing. Check the render before forcing it.`);
}
console.log(`\n  textures are a separate job:  python3 tools/shrink_glb.py ${opt('out', src)} --inplace`);
