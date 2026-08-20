/**
 * Assemble the dining room from the Meshy prop kit and render the board.
 *
 *   node tools/render_room.mjs --calibrate      # prove the art->world mapping
 *   node tools/render_room.mjs --grid           # spec bands burned in
 *   node tools/render_room.mjs --out assets/board.jpg
 *
 * Replaces a painted `assets/board.jpg` with a rendered one. The point is not
 * that a render looks better than a painting -- it is that the geometry stops
 * being something the code has to be *measured against* and becomes something
 * the code *states*. A table is at art y 620 because LAYOUT puts it there, so
 * the board cannot drift out of spec the way the painted one did (45-115px on
 * every band, and a pickup floor that did not exist at all).
 *
 * Read DINING-ROOM-SPEC.md for what the room is for and
 * DINING-ROOM-3D-RUNBOOK.md sections 4-6 for how this fits the rest.
 *
 * ---------------------------------------------------------------------------
 * The art->world mapping, which is the whole trick
 *
 * The camera is orthographic at ELEV degrees above the floor, looking at the
 * origin from +Y +Z. Under that projection two different world displacements
 * both move things up and down the screen, and they do it by different amounts:
 *
 *   - moving `d` along **Z** (further from camera) rises `d * sin(ELEV)` on screen
 *   - moving `h` along **Y** (upward)             rises `h * cos(ELEV)` on screen
 *
 * At 34 degrees that is 0.559 against 0.829, so floor depth is compressed to
 * about two thirds of object height. Conflating the two is the classic way an
 * isometric scene ends up with everything standing in the wrong place, so the
 * two conversions are separate functions below and neither is inlined.
 *
 * Horizontal is the easy one: world X maps straight to screen X.
 *
 * --calibrate does not trust any of the above. It drops markers at known art
 * coordinates, renders, finds them in the pixels and reports the error. If the
 * mapping is wrong the numbers say so immediately, instead of the room looking
 * subtly off in a way that gets argued about.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : args[i + 1]; };
const has = k => args.includes('--' + k);

const ART_W = 1536, ART_H = 1024;          // matches ART_W/ART_H in index.html
const ELEV = +opt('elev', 34);             // matches render_sprites.mjs --elev
const OUT = opt('out', 'art-source/shots/room.png');
const CALIBRATE = has('calibrate');
const GRID = has('grid');
// Markers first, always, when anything about the camera changes. It puts a
// bright sphere on the floor at a set of known art coordinates and the render
// gets measured; whatever the projection actually does then shows up as a
// number instead of as a room that looks subtly wrong.
const MARKERS = has('markers');
// Render only one named prop (every LAYOUT entry for it, e.g. both dish
// returns), with the floor/walls/rug/trim left out and true alpha kept in the
// output. Same camera and light as the full room, so the result lines up
// pixel-for-pixel with where that prop sits on the real board -- it exists to
// produce runtime masks (a rim-glow silhouette, say) without a second,
// hand-aligned asset to keep in sync by eye.
const ISOLATE = opt('isolate', null);
// Swaps the floor's wood-plank texture for cracked basalt with glowing lava
// veins -- a preview flag, kept around after it ships as the default so the
// two can still be A/B'd against each other by eye.
const LAVA_FLOOR = has('lavafloor');

// --------------------------------------------------------------------------
// Scale
//
// Set empirically, per the runbook: a character has to measure 208px tall in
// this 1536x1024 frame (the spec's figure, itself measured off the shipped
// Tyrone sprite). PPU is pixels per world unit at the floor plane; --calibrate
// renders a character and reports his measured height so this can be tuned
// against the render rather than derived on paper.
const PPU = +opt('ppu', 470);

// Where world (0,0,0) lands in art space. X is the room's centre line. Y is
// chosen so the floor fills the bands the spec assigns to it: the counter's
// front face meets the floor at art y 430 and the front drop pads sit at 945,
// so the origin sits between them and the room extends both ways from it.
const ORIGIN_ART_X = ART_W / 2;
const ORIGIN_ART_Y = +opt('originY', 700);

const RAD = ELEV * Math.PI / 180;
const SIN_E = Math.sin(RAD), COS_E = Math.cos(RAD);

// The back wall sits behind the counter. Derived rather than dialled in: the
// counter's front face is pinned to art y 430 by the spec, its depth follows
// from its own model once scaled to 790 art px wide, and the wall clears that
// by a hand's width. Change the counter's width and the wall follows.
const COUNTER_FRONT_Z = (430 - +opt('originY', 700)) / (Math.sin(RAD) * +opt('ppu', 470));
const BACK_Z = +(COUNTER_FRONT_Z - 0.72).toFixed(3);

/** Art x -> world x. The one conversion with no projection in it. */
const artXToWorld = ax => (ax - ORIGIN_ART_X) / PPU;
/** Art y on the FLOOR -> world z. Divided by sin, because depth is compressed. */
const artYToWorldZ = ay => (ay - ORIGIN_ART_Y) / (SIN_E * PPU);
/** A HEIGHT in art px -> world units. Divided by cos, not sin. Not the same call. */
const artHeightToWorld = h => h / (COS_E * PPU);

// --------------------------------------------------------------------------
// The layout, in art space, straight out of the spec's band table.
//
// The columns are the x positions index.html already uses. The runbook is
// explicit that the two rows differing in width is the painting's perspective
// and that unifying them is a game-feel change rather than a cosmetic one --
// it moves where the player has to stand. So this moves the rows vertically
// onto the spec's bands and leaves x alone, which is the smaller change and
// the one that fixes the actual defect.
// Derived from the tables' measured screen extent, not from the spec's band
// table directly. A table placed at row y draws from y-122 to y+46: 76px of
// height plus 92px of projected depth at 34 degrees. That is 168px against the
// 120px the spec allocates a row, so laying the rows out on the literal bands
// put the back row's SET DOWN pads on top of the front row's tables. The spec
// anticipates this -- "proportions matter, exact pixels do not, the game's
// geometry is remapped to whatever gets built" -- so the bands are honoured in
// order and proportion while the numbers come from the model.
const ROW_BACK = 631, ROW_FRONT = 850;
const COLS_BACK  = [406, 652, 902.5, 1154];
const COLS_FRONT = [374, 638, 906.5, 1173.5];

const LAYOUT = [
  // The counter's front face meets the floor at 430 -- "the number everything
  // else depends on". Anchored by that face rather than by its centre, so the
  // band holds however deep the model turns out to be.
  // Tinted down because it was the lightest thing in the frame by a distance and
  // pulled the eye straight to it. The spec's hierarchy puts the counter at
  // level 2 -- it frames the gameplay and must not compete with it -- and the
  // side effect is welcome: darkening the whole prop widens the value gap
  // between its lit timber top and its stone front, which is the near-edge
  // reading the counter exists to give.
  { prop: 'counter', x: ART_W / 2, y: 430, anchor: 'front', upright: 'none', tint: 0.84 },

  ...COLS_BACK.map(x  => ({ prop: 'table', x, y: ROW_BACK,  upright: 'none' })),
  ...COLS_FRONT.map(x => ({ prop: 'table', x, y: ROW_FRONT, upright: 'none' })),

  // Clear of the walkable lanes. y swapped with floor-inlay below on Rone's
  // call -- was 760, level with the back pads; now 900, level with the front
  // pads, trading places with the medallion.
  //
  // x: 115 -> 60 (first "further into the corner" pass) -> 95 -> 120. 60
  // produced a dark clipped-looking patch over half the unit, which this
  // filed as the prop sitting behind a side wall at art x ~61. Wrong -- there
  // is no side wall mesh (see the "No side walls" note below this array,
  // which is the file's current and correct state; a stale sentence just
  // above it still describes one that was since removed). Re-tested this
  // prop alone at x 60 after the rug's own run-off-the-frame pass proved the
  // room's edge renders clean with nothing there, and it rendered fine, no
  // artifact. Whatever actually caused the original patch was not
  // re-diagnosed -- 95, then 120, both measurably fixed it, and neither
  // number changes -- but the wall explanation in this comment's earlier
  // version was fabricated after the fact and did not point at anything
  // that exists in the scene.
  { prop: 'dish-return', x: 80, y: 950, upright: 'none', yaw: 90 },
  { prop: 'dish-return', x: 1456, y: 950, upright: 'none', mirror: true, yaw: -90 },

  // Hung above the counter at each end, over the two pickup positions.
  { prop: 'pass-sign', x: 370,  y: 300, upright: 'none', hang: 300 },
  { prop: 'pass-sign', x: 1180, y: 300, upright: 'none', hang: 300 },

  // ---- level 2 and 3 dressing -------------------------------------------
  // Everything below is on the back wall or in the side margins, and nothing
  // is on the walkable floor. The spec is blunt about why: there is no
  // collision with scenery, so anything painted on the walkable floor gets
  // walked straight through, and the game draws its own SET DOWN and PICK UP
  // markings there which floor ornament competes with directly.

  // Standing against the back wall, flanking the counter in the width it does
  // not use. The counter runs art x 373-1163, so these two live in the gaps.
  { prop: 'shelf-unit', x: 105,  y: 252, upright: 'none' },
  { prop: 'shelf-unit', x: 1431, y: 252, upright: 'none', mirror: true },

  // Hung on the wall itself. These were at x 310 and 1226, inboard of the
  // shelves, and that put them straight under the pass-signs: a panel is 210
  // wide so 310 spans 205-415, against the sign's 285-455 at x 370 -- 130px of
  // overlap, with the arrow shield drawn across the skull relief on both
  // sides. The signs cannot move, they mark where the player collects; the
  // panels are dressing, so the panels moved.
  //
  // They moved to the middle, which also answers the "the room is emptier in
  // the middle" note: the back wall above the counter ran empty from x 460 to
  // 1075, the single largest dead area in the room, while the only two pieces
  // of wall art were stacked underneath the signage at the ends.
  // Mirrored as a pair, the way the shelf units already are -- both skulls
  // facing the same way read as one prop duplicated, which is what they are.
  { prop: 'wall-panel', x: 620,  y: 244, upright: 'none', hang: 182 },
  { prop: 'wall-panel', x: 916,  y: 244, upright: 'none', hang: 182, mirror: true },

  // Over the pickup floor. The spec is explicit that these are atmosphere and
  // NOT the shading direction -- overhead light casts no directional shadow to
  // match, so the room's shading stays front-left however many lamps hang here.
  // Over the pickup floor rather than over the counter. At y 400 they hung in
  // front of the counter's timber top and read as sitting on it; the band at
  // 430-580 is empty floor by decree, so the air above it is the one place in
  // the room a hanging lamp has nothing to collide with visually.
  //
  // Two, not three, and the middle one is the one that went. Moving them off
  // the counter entirely turns out not to be available: the counter occupies
  // art y 170-430 on screen and the tables start at 490, so there is no height
  // a hanging lamp can occupy that crosses neither. What the third lamp cost
  // was the counter's cleanest span -- the timber above the fossil relief, dead
  // centre, which is the part of the silhouette the eye actually reads.
  // One lamp now, not two, and hung higher. The plated food moved onto the
  // counter top (index.html's TICKET.base), which is the surface these two
  // were hanging in front of: at hang 335 a lamp occupies art y 170-298 and a
  // plate occupies 216-315, so the board's lamps would have been drawn behind
  // the game's plates at the second slot of each side.
  //
  // Raising them clears that, but at the height they end up (art 55-183) the
  // back wall is already full: shelf 15-195, pass-sign 285-455, panels 515-725
  // and 811-1021, pass-sign 1095-1265, shelf 1341-1521. The only gap that
  // takes an 80px lamp is 725-811, dead centre. The outer gaps look free and
  // are not -- the tips sign is drawn over art x 32-288 and the lives row over
  // 1350-1500, both of which would simply cover a lamp placed there.
  //
  // So the count went 3 -> 2 -> 1 for three different reasons, and this one is
  // the only one that was forced. Dead centre above the pass, over the food,
  // is also where a pass lamp belongs.
  { prop: 'pendant-lamp', x: 768, y: 505, upright: 'none', hang: 450 },

  // The far margins, which is the one place the spec calls safe for floor
  // decoration -- outside the lanes, and nowhere near the pads.
  //
  // Same GLB on both sides, at the same (unrotated) yaw -- there is only one
  // planter model, so left and right were rendering as an exact duplicate,
  // not even a mirror of each other, just two copies. yaw turns the right
  // one so its fronds don't silhouette identically; tint (a uniform RGB
  // scalar -- see the material-clone note below) is a touch darker/deeper
  // rather than a hue shift, reading as a different pot/plant age rather
  // than a colour mismatch.
  //
  // The right planter stands *on* the right rug, not beside it, and sits much
  // lower than the left one. Both were at y 520, placed when the rugs were
  // 35% longer and reached up near them; RUG_SHORTEN pulled the floor out
  // from under this one and left it floating 113px clear of the rug. It went
  // to 630 first (pot exactly on the rug's top edge) and then onto the rug
  // proper on Rone's call.
  //
  // Measured, not nudged: the rug renders y 633-815, and the planter's pot
  // bottom sits about 10px under its placement y, so 700 puts the pot roughly
  // a third of the way onto the fabric -- clearly standing on the rug rather
  // than balanced on its edge, without marching so far down that it reads as
  // centred on it. x stays 1466, already centred over the rug's 1354-1535 span.
  //
  // The left/right height difference this creates is deliberate, per Rone --
  // the room is mirror-symmetric in prop placement everywhere else, so do not
  // "fix" the left planter to match without asking.
  //
  // y 520 -> 550 on a later, explicit ask: move the left planter 30px closer
  // to its own rug, which sits at higher y (further toward camera) than the
  // plant did, same "toward larger y is toward the rug" relationship the
  // right planter's own placement above already establishes.
  //
  // Right planter: x 1466 -> 1472 -> 1468, y 700 -> 702, another explicit
  // ask ("small plant on the right, as far to the edge as we can, down a
  // pixel or two"). x was already "centred over the rug's 1354-1535 span" --
  // i.e. already almost at the canvas edge -- so there wasn't much room left
  // to give. Found the real limit with the isolate render's alpha channel
  // rather than guessing (same method the dish-return corner push used):
  // x 1470 clips a pixel into the canvas edge, x 1468 is clear by 2px. Landed
  // on 1468, not 1470, to keep a hair of margin rather than shipping exactly
  // at the clip line.
  { prop: 'planter', x: 70,   y: 550, upright: 'none' },
  { prop: 'planter', x: 1468, y: 702, upright: 'none', yaw: 140, tint: 0.9 },
  // floor-inlay (a round fossil medallion) lived here through several passes --
  // upside-down, flipped, moved, swapped with dish-return -- and Rone was never
  // quite sold on it even fixed. Removed rather than tuned again; a procedural
  // dino-track rug takes the same margin slot below the shell, near RUG_TEX.
];

// Every prop's size in art px. **Width, not height**, and that took a wrong
// render to work out.
//
// Scaling by height is the obvious reading of the spec -- "a table surface
// should sit at roughly half his height", so 104px on a 208px character. But
// the table model is 2.5:1 (1.899 wide against 0.760 tall), so 104px tall makes
// it 313px wide, and the columns are 246-268px apart. The first render came out
// as two long benches with the four tables of each row fused into one.
//
// Width is the constraint that actually binds, and it has a measured value:
// PROMPTS.md recorded that a table draws 144px on the 960px canvas, which is
// 230 art px. At 2.5:1 that puts the surface at 92px, or 44% of the character
// -- close enough to the spec's "roughly half" that the two readings agree once
// the model's own proportions are taken into account, and it leaves ~20px of
// floor between neighbouring tables exactly as the painted board does.
const PROP_ART_WIDTH = {
  // 190, down from 230. At 230 the tables left 16px of floor between them on
  // the back row -- the columns are 246px apart there -- which read as a bench
  // rather than four tables. 190 opens that to 56px back and 74px front, and
  // takes 29px off each row's screen extent as well, which the vertical layout
  // below spends on the pickup floor and the pad gaps.
  table: 190,
  counter: 790,        // matches the painted counter, wall to wall between the pillars
  'dish-return': 200,  // BUS_STATIONS is A(200) wide in index.html
  'pass-sign': 170,
  'shelf-unit': 180,
  'wall-panel': 210,
  'pendant-lamp': 80,
  planter: 130,
};

// Meshy normalises every export so its longest axis is 1.9, and on all ten
// props that axis is Y. The shortest-axis-is-up guess in preview_prop.mjs is
// therefore wrong far more often than right, so orientation is stated per prop
// here rather than inferred. See ROOM-BRIEF.md for the four ways it broke.
const PROPS = ['table', 'counter', 'dish-return', 'pass-sign',
               'shelf-unit', 'wall-panel', 'pendant-lamp', 'planter'];

// --------------------------------------------------------------------------
const three = resolve(ROOT, 'node_modules/three');
if (!existsSync(three)) { console.error('run: npm install three playwright'); process.exit(1); }

const STAGE = resolve(ROOT, '.room-stage');
await rm(STAGE, { recursive: true, force: true });
await mkdir(join(STAGE, 'models'), { recursive: true });
await cp(join(three, 'build/three.module.min.js'), join(STAGE, 'three.module.min.js'));
await cp(join(three, 'build/three.core.min.js'),   join(STAGE, 'three.core.min.js'));
await cp(join(three, 'examples/jsm'), join(STAGE, 'jsm'), { recursive: true });
await cp(resolve(ROOT, 'assets/fonts/galindo.woff2'), join(STAGE, 'galindo.woff2'));
for (const p of PROPS) {
  const src = resolve(ROOT, 'art-source/room', p + '.glb');
  if (!existsSync(src)) { console.error(`missing prop: ${src}`); process.exit(1); }
  await cp(src, join(STAGE, 'models', p + '.glb'));
}
if (CALIBRATE) {
  const c = resolve(ROOT, 'art-source/tyrone-t1.glb');
  if (!existsSync(c)) { console.error('no tyrone-t1.glb to calibrate against'); process.exit(1); }
  await cp(c, join(STAGE, 'models/character.glb'));
}
// Rug fossil overlays: DALL-E art, transparent PNGs, cropped down from a wider
// sheet (see art-source/room/rug-fossil-*.png for the crop). Staged like the
// GLBs and loaded by relative URL rather than embedded as base64 in this file
// -- keeps the diff readable and the asset a normal binary the repo already
// knows how to handle, rather than a multi-hundred-KB string in source.
await cp(resolve(ROOT, 'art-source/room/rug-fossil-claw.png'), join(STAGE, 'rug-fossil-claw.png'));
await cp(resolve(ROOT, 'art-source/room/rug-fossil-ammonite.png'), join(STAGE, 'rug-fossil-ammonite.png'));
// Lava floor art (see --lavafloor below), staged only when asked for.
if (LAVA_FLOOR) {
  await cp(resolve(ROOT, 'art-source/room/lava-floor.png'), join(STAGE, 'lava-floor.png'));
  await cp(resolve(ROOT, 'art-source/room/lava-floor-emissive.png'), join(STAGE, 'lava-floor-emissive.png'));
  // table.glb and dish-return.glb's stone regions read as dark grey stone
  // against the wood floor, and dark grey stone against dark basalt-and-lava
  // is a different problem: the table's legs and the whole dish-return basin
  // nearly vanish. These are the same base_color.jpg textures baked into
  // those GLBs, lightened only where the source is already low-saturation
  // (i.e. the stone) -- the wood grain and the dish-return's gold accents,
  // which are what still say "table" and "dish return" at a glance, are
  // left alone. Built by extracting each GLB's base_color image, boosting
  // value toward a floor in proportion to (1 - saturation), and re-saving;
  // see the room's HANDOFF notes for the exact numbers if this needs redoing
  // against a different table/dish-return model later. Lava-floor-only, like
  // the floor art above -- the painted board's table/dish-return rendering
  // doesn't go through this file at all.
  await cp(resolve(ROOT, 'art-source/room/table-lightstone.png'), join(STAGE, 'table-lightstone.png'));
  await cp(resolve(ROOT, 'art-source/room/dish-return-lightstone.png'), join(STAGE, 'dish-return-lightstone.png'));
}

const PAGE = `<canvas id="c" width="${ART_W}" height="${ART_H}"></canvas>
<style>@font-face{font-family:'Galindo';src:url('galindo.woff2') format('woff2');}</style>
<script>
  addEventListener('error', e => { window.__err = String(e.message || e); document.title = 'failed'; });
  addEventListener('unhandledrejection', e => { window.__err = String(e.reason); document.title = 'failed'; });
</script>
<script type="importmap">
{"imports":{"three":"./three.module.min.js","three/addons/":"./jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ART_W = ${ART_W}, ART_H = ${ART_H}, PPU = ${PPU};
const BACK_Z = ${BACK_Z};
const ORIGIN_ART_X = ${ORIGIN_ART_X}, ORIGIN_ART_Y = ${ORIGIN_ART_Y};
const SIN_E = ${SIN_E}, COS_E = ${COS_E}, ELEV = ${ELEV};
const LAYOUT = ${JSON.stringify(LAYOUT)};
const PROP_ART_WIDTH = ${JSON.stringify(PROP_ART_WIDTH)};
const CALIBRATE = ${CALIBRATE};
const MARKERS = ${MARKERS};
const ISOLATE = ${JSON.stringify(ISOLATE)};
const LAVA_FLOOR = ${LAVA_FLOOR};
const MARKER_PTS = ${JSON.stringify([[256,300],[768,300],[1280,300],
                                     [256,512],[768,512],[1280,512],
                                     [256,700],[768,700],[1280,700],
                                     [256,900],[768,900],[1280,900]])};

const artXToWorld = ax => (ax - ORIGIN_ART_X) / PPU;
const artYToWorldZ = ay => (ay - ORIGIN_ART_Y) / (SIN_E * PPU);
const artHeightToWorld = h => h / (COS_E * PPU);

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Non-optional, and the reason is in the spec: the grounding problem is not the
// character's own shadow, it is that nothing else in the room casts one, so the
// floor reads as flat paint. In 3D that is free.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// Copied verbatim from render_sprites.mjs. A room lit from a different sun than
// the cast will always look wrong, so this must change in both or neither.
scene.add(new THREE.AmbientLight(0xffffff, 2.1));
const key  = new THREE.DirectionalLight(0xfff2dd, 2.4); key.position.set(-4, 11, 6);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7); fill.position.set(5, 3, -4);
scene.add(key); scene.add(fill);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
// SHADOW_STRENGTH: how dark a cast shadow goes, 1 being full strength.
//
// At full strength the counter -- by far the room's largest prop, lit by a key
// light low enough to throw a long shadow -- smeared a broad dark wedge from
// its own foot down across the pickup floor and most of the way to the front
// table row. Rone's read was too intense and too wide-ranging, and the width
// is not separately tunable: it is the real shadow of a real object under this
// light, so the only honest lever is how dark it lands.
//
// This is the one shadow control that is safe to touch here. The three lights
// above are copied verbatim from render_sprites.mjs and must stay identical or
// the cast is lit by a different sun than the room -- but that file sets up no
// shadows at all (no castShadow, no receiveShadow, no shadowMap), so shadow
// settings are room-only by construction. shadow.intensity also only scales
// the shadowed regions; lit surfaces render exactly as before, so nothing
// about how the room is lit changes, only how hard it is shadowed.
//
// The separately painted contact shadows further down (the tight dark ellipses
// at each prop's foot) are untouched and do the grounding work -- which is why
// this can come down this far without the props starting to float.
const SHADOW_STRENGTH = 0.45;
key.shadow.intensity = SHADOW_STRENGTH;
// The shadow camera has to cover the whole floor or props at the edges drop
// their shadows off the end of the map and float.
const sc = key.shadow.camera;
sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 0.1; sc.far = 30;
sc.updateProjectionMatrix();

// --------------------------------------------------------------------------
// The shell: floor and three walls.
//
// Procedural rather than modelled. Meshy is for objects with silhouettes worth
// generating; a floor and three flat walls are a canvas texture and six lines
// of geometry, and going through the pipeline for them would cost two more
// transfers and give nothing the spec asks for.

/** A canvas texture, tiled. The draw callback gets a 2D context, SIDE x SIDE. */
function paint(side, repeatX, repeatY, draw){
  const c = document.createElement('canvas');
  c.width = c.height = side;
  draw(c.getContext('2d'), side);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Hoisted above its first use (the lava floor, below) rather than staying
// down by paintRug where it originated -- both need it, and floor setup
// runs first.
const loadImg = src => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = rej;
  img.src = src;
});

/** Same contract as paint(), but the pixels come from an already-loaded
 * image instead of a draw callback -- for real art (DALL-E, a render) going
 * onto a tiled plane the way paint()'s procedural patterns do. */
function paintFromImage(img, repeatX, repeatY){
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// "Floorboards running away from the camera, which gives depth and scale free"
// -- the spec's words, and the reason the seams run along Z rather than across
// it. On screen that puts them near-vertical, which is what reads as recession;
// boards running left to right would read as a striped floor instead.
// 52 repeats over a 40-unit plane puts six boards per tile at about 60 art px
// each -- the width a floorboard reads as. The first pass used 12 and produced
// 261px bands, which read as a striped floor rather than as boards.
const floorTex = paint(512, 52, 52, (g, S) => {
  g.fillStyle = '#6a5138'; g.fillRect(0, 0, S, S);
  const BOARDS = 6, w = S / BOARDS;
  for (let i = 0; i < BOARDS; i++) {
    // Each board a slightly different value, so the floor has grain at a glance
    // without any single plank drawing attention.
    const v = 0.86 + 0.28 * ((i * 0.37) % 1);
    g.fillStyle = 'rgb(' + Math.round(106*v) + ',' + Math.round(81*v) + ',' + Math.round(56*v) + ')';
    g.fillRect(i * w, 0, w - 1, S);
    g.strokeStyle = 'rgba(30,20,12,0.55)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, S); g.stroke();
    for (let k = 0; k < 26; k++) {          // grain
      g.strokeStyle = 'rgba(40,26,16,' + (0.05 + Math.random()*0.07).toFixed(3) + ')';
      g.lineWidth = 1;
      const x = i * w + Math.random() * w;
      g.beginPath(); g.moveTo(x, Math.random() * S); g.lineTo(x, Math.random() * S); g.stroke();
    }
  }
});

// Molten-rock alternative to the wood floor above: Rone's own DALL-E art
// (art-source/room/lava-floor.png, generated from the brief in this file's
// first --lavafloor commit), not the procedural crack-walk that shipped
// there first. That first pass proved the idea -- real self-illumination
// via emissiveMap, no bloom pass needed -- but "boost its appearance" meant
// more than a canvas script was going to buy cheaply: real rock grain in
// the plates, a crack network with actual depth to its glow, not a stroked
// line. The photo already tiles clean (checked in a 2x2 grid, no seam), so
// it goes on the plane the same way the procedural version did.
//
// lava-floor-emissive.png is derived from the same source (not hand-painted):
// thresholded on warmth (R-B) and brightness, so it lights up exactly where
// the photo is already glowing and stays black everywhere else, the same
// diffuse/emissive agreement the procedural version got from one path list
// feeding two canvases.
const lavaFloorImg = LAVA_FLOOR ? await loadImg('lava-floor.png') : null;
const lavaFloorEmissiveImg = LAVA_FLOOR ? await loadImg('lava-floor-emissive.png') : null;
const lavaFloorTex = LAVA_FLOOR ? paintFromImage(lavaFloorImg, 8, 8) : null;
const lavaFloorEmissive = LAVA_FLOOR ? paintFromImage(lavaFloorEmissiveImg, 8, 8) : null;

// LAVA_V_OFFSET: slides the floor texture in v so no tile wrap line crosses
// the visible floor.
//
// The photo tiles cleanly in the sense that matters for flat rock -- no
// brightness step across the join, which is what was checked when it landed
// -- but its *crack network* does not connect across the join: a glowing
// crack running off the bottom edge does not meet the one entering at the
// top. Wherever the wrap falls, every crack crossing it is cut and offset.
//
// That line was landing at art y=700, straight across the board through the
// open aisle between the table rows, which is why the junction by table 4/8
// read as broken. Three separate hand-patches went into repairing that one
// junction's pixels before this got diagnosed properly; all of them were
// retouching one instance of a systematic seam, which is why each fix
// exposed a new symptom (a gap, then a pasted-looking fill, then a lean,
// then a step). See git history for the full sequence.
//
// The visible floor spans only 0.452 of a tile in v (art y 430 at the
// counter's foot down to 1024), so an offset anywhere in 0.21..0.75 keeps
// the whole floor inside one tile with no wrap at all. 0.48 is the middle
// of that window, so there is ~0.27 of margin either side -- the camera
// elevation or the floor's top edge can move a fair way before a seam
// re-enters frame.
//
// Must be identical on both maps: the emissive is derived from the same
// photo and only lines up with the diffuse cracks if it slides with it.
const LAVA_V_OFFSET = 0.48;
if (LAVA_FLOOR) {
  lavaFloorTex.offset.y = LAVA_V_OFFSET;
  lavaFloorEmissive.offset.y = LAVA_V_OFFSET;
}

// Lightened base_color replacements for table.glb/dish-return.glb, only under
// --lavafloor (see the staging note above). A 1:1 UV-space swap, not a tiled
// pattern -- flipY has to match what GLTFLoader already set on the original
// texture (false; glTF's UV origin is top-left, the opposite of a canvas's),
// or the replacement lands mirrored against the model's own UVs.
function replacementMap(img){
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lightstoneMap = LAVA_FLOOR ? {
  table: replacementMap(await loadImg('table-lightstone.png')),
  'dish-return': replacementMap(await loadImg('dish-return-lightstone.png')),
} : {};

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  LAVA_FLOOR
    ? new THREE.MeshStandardMaterial({
        map: lavaFloorTex, roughness: 0.9, metalness: 0,
        emissiveMap: lavaFloorEmissive, emissive: 0xffffff, emissiveIntensity: 1.4 })
    : new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, metalness: 0 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
if (!ISOLATE) scene.add(floor);

// RUG_TEX: a long "runway" rug in each side margin, replacing floor-inlay (see
// the note where that used to sit, above). A rug is a flat pattern rather than
// a silhouette, so unlike the rest of LAYOUT it is drawn here as a canvas
// texture on its own plane instead of going through the Meshy prop pipeline --
// the same reasoning that already puts the floor and walls here rather than
// in LAYOUT.
//
// Drawn once at the rug's own aspect ratio rather than through paint()'s tiled
// square canvas: paint() is built for a repeating pattern with no fixed edges
// (floorboards, wall blocks), and a rug has both -- a border and two ends --
// that a tiled square would either cut off arbitrarily or repeat into a
// second rug.
//
// Fossil overlay: DALL-E art (art-source/room/rug-fossil-*.png, a claw print
// and an ammonite, cropped from a wider generated sheet), composited onto the
// field with drawImage() before the texture is built. Went through two
// preview rounds first -- one motif each at 34% of the rug's own height read
// fine alone, but Rone asked for smaller and scattered, and that first
// scattered pass clipped two marks into the border because the hand-picked
// positions weren't checked against the inner strokeRect's own bounds. This
// version keeps every mark's centre, at its own drawn half-size plus a
// margin, inside that inner line -- checked by arithmetic, not by eye.
// (loadImg is defined up by paint()/paintFromImage, which need it first.)

async function paintRug(w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  // Base weave: maroon, on Rone's call (was neutral charcoal, #3a3a3e, chosen
  // specifically to avoid the wall's basalt and the floor's wood -- both warm
  // browns at the time). The lava floor changed what it has to separate from:
  // charcoal-on-charcoal-basalt is the same problem the tables and dish return
  // just got fixed for, and a rug is a bigger, flatter field where it shows
  // more, not less. Maroon keeps the weight dark without matching the floor's
  // own hue, and reads as "restaurant rug" against either floor. Thin vertical
  // threads step the value slightly, the same trick the floorboards use for
  // grain, so the field is not one flat rectangle of colour.
  g.fillStyle = '#5c2028'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 3){
    const v = 0.92 + 0.16 * Math.sin(x * 1.7);
    g.fillStyle = 'rgba(0,0,0,' + ((1 - v) * 0.4) + ')';
    g.fillRect(x, 0, 1, h);
  }

  // Border: the gold the rest of the room already uses for accents (COLORS.
  // mustard in index.html, and the fossil-fitting's corner trim) rather than a
  // new colour, so the rug reads as this room's rather than a generic import.
  const M = w * 0.1;
  g.strokeStyle = '#E0A72E'; g.lineWidth = Math.max(2, w * 0.025);
  g.strokeRect(M, M, w - 2 * M, h - 2 * M);
  const innerX = M * 1.7, innerY = M * 1.7, innerW = w - 3.4 * M, innerH = h - 3.4 * M;
  g.strokeStyle = 'rgba(224,167,46,0.45)'; g.lineWidth = Math.max(1, w * 0.012);
  g.strokeRect(innerX, innerY, innerW, innerH);

  const claw = await loadImg('rug-fossil-claw.png');
  const ammo = await loadImg('rug-fossil-ammonite.png');
  // xf/yf are fractions of the INNER box (innerX..innerX+innerW), not of the
  // whole canvas -- so a mark placed at xf 0/1 sits exactly on the inner
  // line before its own half-size is subtracted, which is what guarantees it
  // clears the border rather than merely tending to.
  const place = (img, xf, yf, boxH, rot) => {
    const s = boxH / img.height, dw = img.width * s, dh = img.height * s;
    const cx = innerX + innerW * xf, cy = innerY + innerH * yf;
    const margin = Math.max(dw, dh) * 0.5;   // covers rotation's corner swing
    const clampedCx = Math.min(innerX + innerW - margin, Math.max(innerX + margin, cx));
    const clampedCy = Math.min(innerY + innerH - margin, Math.max(innerY + margin, cy));
    g.save();
    g.translate(clampedCx, clampedCy);
    g.rotate(rot);
    g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    g.restore();
  };
  const scatter = [
    [claw, 0.10, 0.30, 0.15, -0.15],
    [ammo, 0.30, 0.68, 0.14,  0.20],
    [claw, 0.50, 0.25, 0.15,  0.10],
    [ammo, 0.70, 0.70, 0.16, -0.18],
    [claw, 0.90, 0.32, 0.14,  0.05],
  ];
  for (const [img, xf, yf, boxHf, rot] of scatter) place(img, xf, yf, h * boxHf, rot);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Rotated 90 -- Rone's call -- from running along the depth (parallel to the
// wall) to running along X, starting near the wall and pointing inward at
// the room. depth (art px, was the long dimension, now the short one) stays
// 120; xNear is the old margin x (70/1466, matching the planters); xFar is
// short of the front row's own left edge (art 279 = COLS_FRONT[0] - half the
// table's own 190px width) so the rug's inward end doesn't reach the table.
// yCenter: 735 was the old run's own midpoint, unchanged through the 90
// rotation above -- moved up 40 (toward the counter) on Rone's call.
// xFar values below are the full-length numbers from the paragraph above --
// kept as-is rather than rewritten, so the reasoning behind each ("short of
// the front row's own left edge" etc.) still points at a real number. Rone's
// eye read the pair as uneven even after they measured out symmetric (every
// row of the baked render checked, inner edge within 1px of a true mirror);
// the read was the rugs reaching too far into the room regardless, so
// RUG_SHORTEN pulls the inward end back toward the wall-anchored end by 35%
// rather than the numbers above being wrong. xNear (the off-frame, wall
// side) is untouched -- that end deliberately runs off the canvas edge with
// no gap at the corner, and shortening from there would reopen that gap.
const RUG_SHORTEN = 0.65;
const RUG_ART_FULL = { xNear: [-60, 1596], xFar: [250, 1286], yCenter: 695, depth: 120 };
const RUG_ART = {
  ...RUG_ART_FULL,
  xFar: RUG_ART_FULL.xNear.map((n, i) => n + (RUG_ART_FULL.xFar[i] - n) * RUG_SHORTEN),
};
const rugWorldLen   = Math.abs(RUG_ART.xFar[0] - RUG_ART.xNear[0]) / PPU;
const rugWorldDepth = RUG_ART.depth / (SIN_E * PPU);
// Canvas swaps to landscape with the geometry -- paintRug draws its border and
// every motif position as a fraction of whichever w/h it is given (checked
// before relying on this: no absolute-pixel placements in there), so scaling
// its width by the same RUG_SHORTEN factor as the plane keeps the border
// thickness and motif spacing proportioned to the now-shorter rug instead of
// stretching a texture drawn for the old length over a shorter plane.
const rugTex = await paintRug(300 * RUG_SHORTEN, 190);
for (let i = 0; i < RUG_ART.xNear.length; i++){
  const xCenter = (RUG_ART.xNear[i] + RUG_ART.xFar[i]) / 2;
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(rugWorldLen, rugWorldDepth),
    new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.92, metalness: 0 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(artXToWorld(xCenter), 0.004, artYToWorldZ(RUG_ART.yCenter));
  rug.receiveShadow = true;
  if (!ISOLATE) scene.add(rug);
}

// Carved basalt, per the house style: dark, coarse, and deliberately quieter in
// value than the floor so the props read against it rather than into it.
const wallTex = paint(512, 6, 3, (g, S) => {
  g.fillStyle = '#3b3229'; g.fillRect(0, 0, S, S);
  const ROWS = 8, h = S / ROWS;
  for (let r = 0; r < ROWS; r++) {
    const off = (r % 2) * (S / 12);
    for (let c = -1; c < 7; c++) {
      const x = off + c * (S / 6), v = 0.85 + 0.3 * Math.random();
      g.fillStyle = 'rgb(' + Math.round(64*v) + ',' + Math.round(54*v) + ',' + Math.round(44*v) + ')';
      g.fillRect(x + 2, r * h + 2, S / 6 - 4, h - 4);
    }
  }
});
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1, metalness: 0 });

// The shell is sized from the frame, not guessed: the walls sit just outside
// what the camera can see sideways, and the back wall just behind the counter,
// so nothing is visible past the edge of the room and nothing intrudes on it.
const HALF_W = ART_W / (2 * PPU);
const WALL_H = 1.35;

const back = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2.4, WALL_H), wallMat);
back.position.set(0, WALL_H / 2, BACK_Z);
back.receiveShadow = true;
if (!ISOLATE) scene.add(back);

// Baseboard trim where the back wall meets the floor: the same gold every
// other accent in the room uses, closing the seam between two textures that
// otherwise just touch. A separate thin plane rather than baked into wallTex
// -- wallTex repeats 3x up WALL_H (see its own comment), so a line drawn into
// the canvas would print three times up the wall, not once at the bottom.
// Offset 0.01 toward the camera (larger Z, since BACK_Z is negative) so it
// does not z-fight with the wall it is flush against; two coplanar surfaces
// at 34 degrees would flicker between them at render time otherwise.
const TRIM_H = WALL_H * 0.035;
const trim = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF_W * 2.4, TRIM_H),
  new THREE.MeshStandardMaterial({ color: 0xE0A72E, roughness: 0.6, metalness: 0.15 }));
trim.position.set(0, TRIM_H / 2, BACK_Z + 0.01);
trim.receiveShadow = true;
if (!ISOLATE) scene.add(trim);

// No side walls, and this is geometry rather than taste. A vertical plane at a
// fixed x runs parallel to the view direction, and an orthographic camera with
// no yaw projects it to a line -- it is invisible however it is positioned,
// which is what two passes at moving them in and out demonstrated. Angling them
// toward the camera does make them visible, but a 4.2-long wall turned 20
// degrees swings its near end 0.72 world units inward, which eats most of the
// margin the dish returns stand in.
//
// So the sides get closed the way the spec already asks for: it puts the
// walkable floor's "genuinely safe area for floor decoration" in the far left
// and right margins, and sends the planters and the floor inlay there. That is
// step 5 dressing, not shell geometry.

// Orthographic, and not a stylistic choice: the spec asks for near-orthographic
// so the back row is not tiny, and a sprite rendered orthographically composited
// into a perspective room is wrong at every position except the one it was
// tuned at. The frustum is sized straight from PPU so one world unit is exactly
// PPU pixels, which is what makes the mapping above true rather than approximate.
const halfW = ART_W / (2 * PPU), halfH = ART_H / (2 * PPU);
const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 100);
const el = ELEV * Math.PI / 180;
cam.position.set(0, Math.sin(el) * 30, Math.cos(el) * 30);
cam.up.set(0, 1, 0);
cam.lookAt(0, 0, 0);
// The frame is centred on the world origin, but the origin has to land at art y
// ORIGIN_ART_Y rather than at the middle of the canvas, so the view window
// shifts to put it there.
//
// The sign is the opposite of the intuitive one and it is worth stating why:
// setViewOffset's y moves the *window* down the full frame, so the content
// inside it appears to move *up*. Wanting the origin lower on screen therefore
// means a negative offset. Getting this backwards put the whole room 377px too
// high -- exactly twice the shift, which is the signature of a flipped sign
// rather than a wrong magnitude, and is how it was diagnosed.
const shiftPx = ORIGIN_ART_Y - ART_H / 2;
cam.setViewOffset(ART_W, ART_H, 0, -shiftPx, ART_W, ART_H);

function load(url){
  return new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, e => rej(String(e))));
}
const clone = o => o.clone(true);

function spin(root, deg){
  if (deg) root.rotation.y += deg * Math.PI / 180;
}

function upright(root, mode){
  if (mode === 'none' || !mode) return;              // already Y-up
  // Sign matters for anything with a front. -PI/2 maps the model's +Z face to
  // -Y, i.e. face down -- which buried the floor inlay's fossil and left its
  // blank back showing through the floor. 'z+' is the same lay-down with the
  // decorated face turned up.
  if (mode === 'z')       root.rotation.x = -Math.PI / 2;
  else if (mode === 'z+') root.rotation.x =  Math.PI / 2;
  else if (mode === 'x')  root.rotation.z =  Math.PI / 2;
}

const out = { placed: [] };
const tableTops = [];
const cache = {};
for (const name of ${JSON.stringify(PROPS)}) cache[name] = (await load('models/' + name + '.glb')).scene;

for (const item of (MARKERS ? [] : LAYOUT.filter(it => !ISOLATE || it.prop === ISOLATE))) {
  const root = clone(cache[item.prop]);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    // Materials are shared across clones, so a tint has to clone the material
    // first or every table darkens when the counter does.
    if (item.tint) {
      o.material = o.material.clone();
      o.material.color.multiplyScalar(item.tint);
    }
    if (lightstoneMap[item.prop]) {
      o.material = o.material.clone();
      o.material.map = lightstoneMap[item.prop];
    }
  });
  upright(root, item.upright);

  const holder = new THREE.Group();
  holder.add(root);
  scene.add(holder);

  // Scale by the prop's intended WIDTH, measured before any yaw spin. Width is
  // the only one of the three axes that maps to screen with no projection
  // factor at all, so it is both the constraint that binds and the one with no
  // trigonometry to get wrong -- but only if "width" means the same physical
  // axis every time. Measuring after spin() let a 90 rotation swap in the
  // model's depth as if it were its width, inflating the whole prop (a
  // dish-return tested at yaw:90 came out 200x198 instead of 200x140). yaw is
  // orientation, not a resize, so it happens after scale is locked in.
  let box = new THREE.Box3().setFromObject(holder);
  let size = box.getSize(new THREE.Vector3());
  const s = (PROP_ART_WIDTH[item.prop] / PPU) / size.x;
  root.scale.setScalar(s);
  if (item.mirror) root.scale.x *= -1;
  spin(root, item.yaw);

  box = new THREE.Box3().setFromObject(holder);
  size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());

  // Sit it on the floor, centred on its own footprint, then move it to place.
  holder.position.x += artXToWorld(item.x) - centre.x;
  // flush buries all but the top of a prop. Meshy cannot make a zero-thickness
  // object -- the floor inlay came back 0.938 deep -- so left standing on the
  // floor it reads as a plinth rather than as something inlaid.
  //
  // The top lands 0.05 above the floor rather than level with it, and that is
  // not a fudge. The medallion is *recessed* into its tile, so setting the
  // tile's top face to y=0 puts the fossil itself below the floor plane and the
  // floor renders over it -- which came out as a mottled ghost of a skeleton
  // fighting the floorboards. 0.05 clears the recess and still only stands
  // about 19 art px proud, which reads as a slab set into the floor.
  holder.position.y += item.flush
    ? -box.max.y + 0.05
    : (item.hang ? artHeightToWorld(item.hang) - size.y : 0) - box.min.y;
  const zRef = item.anchor === 'front' ? artYToWorldZ(item.y) - size.z / 2 : artYToWorldZ(item.y);
  holder.position.z += zRef - centre.z;

  // The plaque sits in the middle of the tabletop, so its centre is the box's
  // centre in x and z at the height of the top surface. Kept in world space and
  // projected through the camera afterwards rather than derived with the same
  // trigonometry twice -- three.js already knows where its own camera is
  // looking, including the view offset, and re-deriving it is how the two
  // disagree by a few pixels that nobody can explain later.
  if (item.prop === 'table') {
    const b2 = new THREE.Box3().setFromObject(holder);
    tableTops.push(new THREE.Vector3((b2.min.x + b2.max.x) / 2, b2.max.y,
                                     (b2.min.z + b2.max.z) / 2));
  }

  out.placed.push({ prop: item.prop, artX: item.x, artY: item.y,
                    artW: +(size.x * PPU).toFixed(0),
                    artH: +(size.y * COS_E * PPU).toFixed(0) });
}

if (MARKERS) {
  // Flat discs lying on the floor, not spheres: a sphere's centre is above the
  // floor, so what gets measured is the projection of its middle rather than of
  // the point it is marking, and the two differ by exactly the cos/sin mix-up
  // this is meant to detect.
  // One colour per row, so a marker found in the render can be matched back to
  // the art y it was asked for without assuming anything about the order they
  // come out of a blob finder. The first attempt at this zipped a sorted list
  // against a sorted list and paired the wrong points together, which produced
  // a confident and completely wrong slope.
  const ROW_COLOURS = [0xff0000, 0x00ff00, 0x0000ff, 0xff00ff];
  MARKER_PTS.forEach(([ax, ay], i) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24),
      new THREE.MeshBasicMaterial({ color: ROW_COLOURS[Math.floor(i / 3) % 4] }));
    d.rotation.x = -Math.PI / 2;
    d.position.set(artXToWorld(ax), 0.002, artYToWorldZ(ay));
    scene.add(d);
  });
  out.markers = MARKER_PTS;
}

if (CALIBRATE) {
  const c = (await load('models/character.glb')).scene;
  const cb = new THREE.Box3().setFromObject(c);
  const cs = cb.getSize(new THREE.Vector3());
  // 208px as the game draws him, which is not the same as 208px of bounding box.
  // Scaling his bbox height to project to 208 rendered him at 248: a character
  // has a belly and a tail, and at 34 degrees that depth adds projected extent
  // on top of his height. render_sprites.mjs sizes him off measured pixels for
  // the same reason, so the ruler has to agree with it or every prop is judged
  // against a character 19% taller than the one on the board.
  const SILHOUETTE = 208 / 248;
  c.scale.setScalar(artHeightToWorld(208) * SILHOUETTE / cs.y);
  const cb2 = new THREE.Box3().setFromObject(c);
  c.position.y -= cb2.min.y;
  c.position.x = artXToWorld(ART_W / 2);
  c.position.z = artYToWorldZ(945);
  c.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(c);
  out.calibration = { charWorldHeight: +(artHeightToWorld(208)).toFixed(4),
                      atArtY: 945, atArtX: ART_W / 2 };
}

renderer.render(scene, cam);

// --------------------------------------------------------------------------
// The table numbers, stamped rather than modelled.
//
// One table is generated and placed eight times with a blank plaque, and the
// digit goes on here. Eight separately generated tables would differ in
// proportion, wood and plaque as well as in number, which is a worse problem
// than the one it solves -- and stamping keeps the numbers editable, so a
// change to the floor plan is a re-stamp rather than eight more Meshy runs.
//
// index.html's drawTableNumber was deleted for this: leave it in and every
// table carries two numbers.
const flat = document.createElement('canvas');
flat.width = ART_W; flat.height = ART_H;
const g = flat.getContext('2d');
g.drawImage(canvas, 0, 0);

await document.fonts.load("64px Galindo");

g.textAlign = 'center';
// 'alphabetic' plus a measured offset, not 'middle'. Canvas's middle baseline
// centres the em box, and Galindo's digits sit high in theirs, so the numbers
// came out about 11px above the middle of their plaques. actualBoundingBox
// gives the ink, which is what wants centring.
g.textBaseline = 'alphabetic';
out.plaques = [];
tableTops.forEach((v, i) => {
  const p = v.clone().project(cam);
  const px = (p.x * 0.5 + 0.5) * ART_W;
  const py = (-p.y * 0.5 + 0.5) * ART_H;
  out.plaques.push({ table: i + 1, x: +px.toFixed(1), y: +py.toFixed(1) });

  const n = String(i + 1);
  g.font = '600 52px Galindo, sans-serif';
  const m = g.measureText(n);
  const yAdj = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  // Carved rather than printed: a dark copy offset down and right reads as the
  // shadow inside an engraving, and the pale face sits proud of it. The plaque
  // is dark slate, so the face is the light half of the pair.
  g.fillStyle = 'rgba(18,16,14,0.75)';
  g.fillText(n, px + 2, py + yAdj + 3);
  g.fillStyle = '#d9cdb4';
  g.fillText(n, px, py + yAdj);
});

// Lava floor only: a soft lightened patch under each table and dish-return,
// where the paved-slab floor's own dark value otherwise reads almost the
// same as the stone furniture sitting on it (see the lightstone texture
// swap above, which fixes the objects; this fixes the floor around them).
// Tried as a "worn stone" story first and it didn't read that way even
// pushed further -- Rone's read was that it still measurably helps
// separation regardless, so it stays for that reason alone, not the
// original one. Drawn from out.placed's own artX/artY/artW rather than a
// second hand-kept position list, so it can't drift from where the props
// actually landed.
if (LAVA_FLOOR && !ISOLATE) {
  for (const p of out.placed) {
    if (p.prop !== 'table' && p.prop !== 'dish-return') continue;
    const cx = p.artX, cy = p.artY + p.artH * 0.38;
    const rx = p.artW * 0.62, ry = p.artW * 0.62 * 0.42;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
    rg.addColorStop(0,   'rgba(150,140,128,0.34)');
    rg.addColorStop(0.6, 'rgba(150,140,128,0.16)');
    rg.addColorStop(1,   'rgba(150,140,128,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
}

// Darker contact shadow right at the base edge, on top of the light patch
// above rather than instead of it: the light patch answers "does this object
// separate from the floor", a tight dark ring answers "does it actually sit
// on the floor or hover slightly above it". Drawn smaller and closer to the
// footprint than the light patch, and last, so it stays a crisp line against
// the object rather than getting washed out by the wider soft glow under it.
// Runs for the counter too -- the room's largest prop, and the one thing
// the original light-patch pass never touched.
if (LAVA_FLOOR && !ISOLATE) {
  for (const p of out.placed) {
    if (p.prop !== 'table' && p.prop !== 'dish-return' && p.prop !== 'counter') continue;
    const cx = p.artX, cy = p.artY + p.artH * 0.44;
    const rx = p.artW * 0.4, ry = p.artW * 0.4 * 0.4;
    const rg = g.createRadialGradient(cx, cy, rx * 0.35, cx, cy, rx);
    rg.addColorStop(0,   'rgba(8,6,5,0.42)');
    rg.addColorStop(0.7, 'rgba(8,6,5,0.18)');
    rg.addColorStop(1,   'rgba(8,6,5,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
}


// Floor fossil impressions: the same DALL-E claw art already used on the rug,
// stamped faint and desaturated-by-alpha onto open floor plates -- away from
// the pickup floor (art y 430-580, which board_audit.py requires clear) and
// away from every table/counter/dish-return footprint. Reuses the existing
// art rather than asking DALL-E for new floor-specific fossils, since the
// same "carved into the stone" motif already reads as this room's.
//
// The ammonite stamp that used to sit at (768, 735) -- "centre aisle,
// between the two table columns, open at every queue depth" -- was true when
// it was written, but the SET DOWN corner accents added afterward (see
// drawSetDownCorners in index.html) reach further out from each table than
// anything on the floor did at the time, and that spot turned out to be
// close enough to table 2's zone to collide. Removed rather than nudged
// around a second time -- Rone's call once the corner-vs-fossil fight showed
// up on screen -- so table 2 no longer needs a CORNER_NUDGE entry either.
if (!ISOLATE) {
  const floorClaw = await loadImg('rug-fossil-claw.png');
  const stampFossil = (img, cx, cy, h, rot, alpha) => {
    const s = h / img.height, dw = img.width * s, dh = h;
    g.save();
    g.globalAlpha = alpha;
    g.translate(cx, cy);
    g.rotate(rot);
    g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    g.restore();
  };
  // Open floor between table 5 and the left dish return.
  stampFossil(floorClaw, 500, 955, 60, -0.5, 0.38);
}

// Wall cracks: hand-placed on the flat overlay, not baked into wallTex.
// wallTex tiles 6x3 across the back wall (paint(512, 6, 3, ...)), so anything
// drawn into that one 512px tile repeats identically 18 times -- fine for the
// brick coursing, which is supposed to look regular, but an organic crack
// repeating in an exact grid reads as an obvious tiling artefact instead of
// wear. Placed in the two gaps that are actually open wall: between each
// pass-sign and the wall-panel next to it -- everywhere else on the wall is
// a prop.
if (!ISOLATE) {
  // Random walk, many short segments and small heading changes -- a hand-
  // picked handful of points (tried first) comes out as a sharp zigzag that
  // reads as a lightning bolt or a scratch, not a fracture in stone.
  const wander = (x, y, steps, seg, wobble, seed) => {
    let a = Math.PI / 2, s = seed;
    const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * wobble;
      x += Math.cos(a) * seg; y += Math.sin(a) * seg;
      pts.push([x, y]);
    }
    return pts;
  };
  const drawCrack = (pts, w) => {
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.strokeStyle = 'rgba(12,10,8,0.5)'; g.lineWidth = w;
    g.stroke();
  };
  // Gap between the left pass-sign and the left wall-panel, art x ~450-510.
  drawCrack(wander(460, 78, 14, 8, 1.1, 17), 2);
  // Gap between the right wall-panel and the right pass-sign, art x ~1010-1080.
  drawCrack(wander(1038, 65, 16, 8, 1.0, 53), 2);
}

// A single specials chalkboard, hand-placed the same way as the cracks above:
// found by scanning the baked render for wall columns that deviate from the
// plain-stone baseline, not guessed from LAYOUT numbers alone -- the crack
// gaps (~60-70px) turned out too narrow for anything legible, but the wider
// gap between each shelf-unit and its neighbouring pass-sign (art x
// ~190-325 left, mirrored ~1210-1345 right) had real room: about 135px wide
// and clear from the wall's top edge down to the gold trim line at y~230.
//
// One board, not a mirrored pair. Every other prop in this room comes in
// left/right pairs because the room itself is symmetric, but a restaurant
// has one specials board -- two identical ones flanking the room would read
// as a UI element repeating itself rather than as a real fixture.
//
// No literal text. This prop draws at roughly 90x70 art px on a 1536-wide
// canvas the game then shows at up to 960 CSS px -- any word on it would be
// a handful of real pixels, the same problem CHARACTER-RUNBOOK.md solves
// for the roster by keeping species silhouette over costume detail. A
// doodled plate plus a few chalk-stroke lines reads as "specials board"
// from shape, colour and position alone; committing to actual words here
// would only prove they cannot be read at this scale.
if (!ISOLATE) {
  const bx = 257, by = 165, bw = 92, bh = 72;
  g.save();
  g.translate(bx, by);

  // drop shadow, the same warm-black the contact shadows use elsewhere
  g.fillStyle = 'rgba(10,8,6,0.35)';
  g.beginPath(); g.roundRect(-bw / 2 + 3, -bh / 2 + 4, bw, bh, 6); g.fill();

  // frame: dark wood, matching the counter/table legs rather than the wall's
  // cooler basalt, so it reads as furniture hung on the wall rather than
  // more masonry
  g.fillStyle = '#241d16';
  g.beginPath(); g.roundRect(-bw / 2, -bh / 2, bw, bh, 6); g.fill();

  // gold trim, in from the frame edge -- the same accent colour (E0A72E) as
  // the baseboard trim and every prop's corner gems, so this reads as
  // belonging to the room rather than as a pasted-in sticker
  g.strokeStyle = '#E0A72E';
  g.lineWidth = 1.5;
  g.beginPath(); g.roundRect(-bw / 2 + 3, -bh / 2 + 3, bw - 6, bh - 6, 4); g.stroke();

  // slate interior
  g.fillStyle = '#232622';
  g.beginPath(); g.roundRect(-bw / 2 + 6, -bh / 2 + 6, bw - 12, bh - 12, 3); g.fill();

  // corner gems, matching the diamond accents on the pass-signs and wall-panels
  g.fillStyle = '#E0A72E';
  for (const [cx, cy] of [[-bw/2+3,-bh/2+3],[bw/2-3,-bh/2+3],[-bw/2+3,bh/2-3],[bw/2-3,bh/2-3]]) {
    g.beginPath(); g.arc(cx, cy, 1.6, 0, Math.PI * 2); g.fill();
  }

  // the doodle: a plated dish with steam, drawn as chalk-stroke ellipses
  // rather than anything literal -- legible as "food" in silhouette, the
  // same shape-before-detail rule the character tiers use
  g.strokeStyle = 'rgba(230,224,210,0.75)';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  g.beginPath(); g.ellipse(0, -6, 16, 6, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.ellipse(0, -6, 9, 3.4, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  g.moveTo(-3, -14); g.quadraticCurveTo(-6, -20, -3, -25);
  g.moveTo(3, -14);  g.quadraticCurveTo(6, -20, 3, -25);
  g.stroke();

  // a few short scribble lines under the plate, standing in for handwritten
  // specials without attempting words nobody could read at this scale
  g.strokeStyle = 'rgba(230,224,210,0.55)';
  g.lineWidth = 1.3;
  for (const [x0, y0, len] of [[-20, 12, 20], [-16, 20, 24], [-20, 28, 14]]) {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + len, y0); g.stroke();
  }

  g.restore();
}

// A soft warm bloom on the counter top under the pendant lamp -- the room's
// one real light fixture, otherwise lighting only what the shared directional
// key light already reaches. Counter top, not the floor: the lamp hangs over
// the counter (LAYOUT x 768, y 505) and that is what it would actually pool
// light on.
if (!ISOLATE) {
  const lg = g.createRadialGradient(768, 230, 0, 768, 230, 190);
  lg.addColorStop(0,   'rgba(255,205,130,0.42)');
  lg.addColorStop(0.55,'rgba(255,175,95,0.20)');
  lg.addColorStop(1,   'rgba(255,170,90,0)');
  g.fillStyle = lg;
  g.fillRect(598, 60, 340, 340);
}

// The top strip is flat wall with nothing on it, and flat dead value reads as
// unfinished. The spec asks for warm ambient fill with nothing in true black,
// so this is a gentle darkening rather than a black vignette -- it lets the
// wall recede instead of filling it with ornament nobody would look at, and it
// happens to sit under the HUD band (art y 0-100), which the spec already
// reserves for score and lives.
if (!ISOLATE) {
  const vig = g.createLinearGradient(0, 0, 0, 320);
  vig.addColorStop(0,    'rgba(22,16,11,0.55)');
  vig.addColorStop(0.55, 'rgba(22,16,11,0.22)');
  vig.addColorStop(1,    'rgba(22,16,11,0)');
  g.fillStyle = vig;
  g.fillRect(0, 0, ART_W, 320);
}

out.png = flat.toDataURL('image/png');
window.__out = out;
document.title = 'ready';
</script>`;
await writeFile(join(STAGE, 'index.html'), PAGE);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = join(STAGE, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.slice(1)));
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const EXE = ['/opt/pw-browsers/chromium/chrome-linux/chrome',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const br = await chromium.launch({ executablePath: EXE,
                                   args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await br.newPage();
page.on('pageerror', e => console.error('page error:', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => ['ready', 'failed'].includes(document.title), null, { timeout: 300000 });
const err = await page.evaluate(() => window.__err);
if (err) { console.error('render failed:', err); await br.close(); server.close(); process.exit(1); }
const out = await page.evaluate(() => window.__out);
await br.close(); server.close();

const dst = resolve(ROOT, OUT);
await mkdir(dirname(dst), { recursive: true });
await writeFile(dst, Buffer.from(out.png.split(',')[1], 'base64'));
await rm(STAGE, { recursive: true, force: true });

console.log(`  ${out.placed.length} props placed at PPU ${PPU}, origin art y ${ORIGIN_ART_Y}, elev ${ELEV}`);
for (const p of out.placed) {
  console.log(`    ${p.prop.padEnd(12)} at art (${String(p.artX).padStart(6)}, ${String(p.artY).padStart(4)})`
            + `   draws ${String(p.artW).padStart(4)} x ${String(p.artH).padStart(3)} art px`
            + `   (${(p.artH / 208 * 100).toFixed(0)}% of a character tall)`);
}
if (out.plaques) {
  console.log('\n  table numbers stamped at the projected plaque centres:');
  for (const q of out.plaques) console.log(`    ${q.table}  art (${q.x}, ${q.y})`);
}
if (out.calibration) {
  console.log(`\n  calibration: a 208px character is ${out.calibration.charWorldHeight} world units`);
  console.log(`  measure him in the render -- if he is not 208px tall, PPU is wrong`);
}
console.log(`\n  wrote ${OUT}`);
