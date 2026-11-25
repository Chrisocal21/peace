import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createEnvironment } from './biomes.js';
import * as SAVES from './saves.js';
import { createTitle } from './title.js';
import { fabricate, finishes } from './fabrication.js';
import { buildCatalog } from './catalog.js';
import { getTexture, applyTriplanar } from './textures.js';

// ---------- constants (placeholder proportions, see docs/OPEN_QUESTIONS.md #2) ----------
const T = 4;          // master tile size
const H = 3;          // wall height / level height
let NUDGE = 1;        // current nudge step in units (cycle with , and .)
const NUDGE_STEPS = [1, 0.5, 0.25, 0.1];
const FREE_STEPS = [1, 0.5, 0.25, 0.1, 0.05];
let freeStep = 0.25;   // freeform grid (cycle with [ and ])
const q3 = (v) => Math.round(v * 1000) / 1000;
const NUDGE_MAX = 4;  // max offset from the pointed tile centre
const EYE = 1.6, BODY = 1.75, RADIUS = 0.3, STEP = 0.6;

// ---------- material palette (piece-space architectural textures) ----------
const MATERIALS = [
  { name: 'thatch',     color: 0xd9b45a, rough: 1,    tex: 'thatch' },
  { name: 'wood',       color: 0xa8743f, rough: 0.85, tex: 'planks' },
  { name: 'stone',      color: 0xa9a59c, rough: 0.95, tex: 'blocks' },
  { name: 'metal',      color: 0x8a98a6, rough: 0.4,  metal: 0.6, tex: 'metal' },
  { name: 'concrete',   color: 0xc9c9c4, rough: 1,    tex: 'concrete' },
  { name: 'glass',      color: 0xaadfff, rough: 0.1,  glass: true },
  { name: 'brick',      color: 0xb5563b, rough: 0.95, tex: 'bricks' },
  { name: 'plaster',    color: 0xf1e8d6, rough: 1,    tex: 'plaster' },
  { name: 'dark wood',  color: 0x5a3a22, rough: 0.8,  tex: 'planks' },
  { name: 'marble',     color: 0xf4f4f2, rough: 0.3,  tex: 'marble' },
  { name: 'terracotta', color: 0xc4622d, rough: 0.9,  tex: 'terracotta' },
  { name: 'slate',      color: 0x56616e, rough: 0.85, tex: 'slate' },
  { name: 'copper',     color: 0x3f9d8a, rough: 0.5,  metal: 0.4, tex: 'metal' },
  { name: 'gold',       color: 0xe0b030, rough: 0.3,  metal: 0.9, tex: 'metal' },
  { name: 'sandstone',  color: 0xdcc08a, rough: 1,    tex: 'blocks' },
  { name: 'mossy',      color: 0x7d9a63, rough: 1,    tex: 'moss' },
  { name: 'tile',       color: 0x5f9fc4, rough: 0.4,  tex: 'checker' },
  { name: 'ice',        color: 0xbfe9ff, rough: 0.05, glass: true },
].map((m) => {
  const scannedTint = {wood:0xffefd9, stone:0xfff9f0, concrete:0xeae8e1, brick:0xffe6ce,
    'dark wood':0x98775e, sandstone:0xf1c58e, thatch:0xffeac2, metal:0xefefee,
    terracotta:0xfff5e6, slate:0xe8edf3, mossy:0xe3e5d6, tile:0xe4edf3};
  const surface = {color: scannedTint[m.name] || m.color, roughness:m.rough,
    metalness:m.metal || 0, side:THREE.DoubleSide};
  const mat = m.glass ? new THREE.MeshPhysicalMaterial({...surface, transmission:0.91,
    thickness:m.name==='ice'?0.65:0.12, ior:m.name==='ice'?1.31:1.5,
    attenuationDistance:2, attenuationColor:m.color, roughness:m.name==='ice'?0.17:0.045})
    : new THREE.MeshStandardMaterial(surface);
  const tex = getTexture(m.tex);
  const density = { bricks:1.1, blocks:0.55, planks:0.56, slate:0.82, terracotta:0.9,
    thatch:0.72, checker:0.52, moss:0.57, metal:0.45 };
  if (tex) applyTriplanar(mat, tex, density[m.tex] || 0.25);
  return { ...m, mat };
});

// per-piece colour tint: a cached copy of the material, multiplied by the tint
const tintCache = new Map();
function tintMat(i, t) {
  if (t == null) return MATERIALS[i].mat;
  const k = i + '|' + t;
  if (!tintCache.has(k)) {
    const base = MATERIALS[i].mat, m = base.clone();
    m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey;
    m.color.multiply(new THREE.Color(t));
    tintCache.set(k, m);
  }
  return tintCache.get(k);
}

// ---------- piece definitions (local space: tile centre at origin, y=0 at level base) ----------
const box = (x0, y0, z0, x1, y1, z1) => {
  const w = x1-x0, h = y1-y0, d = z1-z0;
  const g = new RoundedBoxGeometry(w,h,d,1,Math.min(0.027,w*0.1,h*0.1,d*0.1));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};
const prism = (pts, depth) => {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
};
const cyl = (r, y0, y1, seg) => new THREE.CylinderGeometry(r, r, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0);
const solid = (...b) => ({ geos: () => b.map((x) => box(...x)), cols: b });

// thick slab from top-surface triangles (bottom is the same shape dropped by TH)
function slab(tris, TH = 0.18) {
  const pos = [];
  const push = (v) => pos.push(v[0], v[1], v[2]);
  const edges = new Map();
  const k = (a, b) => a.join() + '>' + b.join();
  for (const t of tris) {
    t.forEach(push);
    [...t].reverse().forEach((v) => push([v[0], v[1] - TH, v[2]]));
    for (let i = 0; i < 3; i++) edges.set(k(t[i], t[(i + 1) % 3]), [t[i], t[(i + 1) % 3]]);
  }
  for (const [key, [a, b]] of edges) {
    if (edges.has(k(b, a))) continue;
    const a2 = [a[0], a[1] - TH, a[2]], b2 = [b[0], b[1] - TH, b[2]];
    [a, b, b2, a, b2, a2].forEach(push);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const SLOPE_DEGS = [10, 15, 22.5, 30, 37.5, 45, 60];
function slopePieces() {
  const out = {};
  for (const deg of SLOPE_DEGS) {
    const r = 4 * Math.tan((deg * Math.PI) / 180), y = H;
    const P = (x, z, h) => [x, y + h, z];
    out['slope' + deg] = { ...slabPiece([[P(-2, 2, 0), P(2, 2, 0), P(2, -2, r)], [P(-2, 2, 0), P(2, -2, r), P(-2, -2, r)]]), label: `Slope ${deg}°`, fam: ['slope', 'Slope', deg + '°', deg === 30] };
    if (deg > 15) {
      const r2 = 2 * Math.tan((deg * Math.PI) / 180);
      out['half' + deg] = { ...slabPiece([[P(-2, 2, 0), P(2, 2, 0), P(2, 0, r2)], [P(-2, 2, 0), P(2, 0, r2), P(-2, 0, r2)]]), label: `Half Slope ${deg}°`, fam: ['half', 'Half Slope', deg + '°', deg === 30] };
    }
    out['hip' + deg] = { ...slabPiece([[P(2, 2, 0), P(2, -2, 0), P(-2, -2, r)], [P(2, 2, 0), P(-2, -2, r), P(-2, 2, 0)]]), label: `Hip Corner ${deg}°`, fam: ['hip', 'Hip Corner', deg + '°', deg === 30] };
    out['valley' + deg] = { ...slabPiece([[P(2, 2, 0), P(2, -2, r), P(-2, -2, r)], [P(2, 2, 0), P(-2, -2, r), P(-2, 2, r)]]), label: `Valley Corner ${deg}°`, fam: ['valley', 'Valley Corner', deg + '°', deg === 30] };
    out['gable' + deg] = { geos: () => { const g = prism([[-2, 0], [2, 0], [2, r]], 0.2); g.rotateY(Math.PI / 2); g.translate(1.95, H, 0); return [g]; }, cols: [], label: `Side Gable ${deg}°`, fam: ['sidegable', 'Side Gable', deg + '°', deg === 30] };
  }
  return out;
}

// hollow stairs: thin tread + riser plates (open underneath); collision stays as solid steps so you can walk them
const hollowStairs = (n, rise, hw = 2) => {
  const w = T / n, t = 0.1;
  const cols = Array.from({ length: n }, (_, i) => [-2 + i * w, 0, -hw, -2 + (i + 1) * w, (i + 1) * rise, hw]);
  const geos = () => cols.flatMap(([x0, , , x1, y1], i) => [box(x0, y1 - t, -hw, x1, y1, hw), box(x0, y1 - rise, -hw, x0 + t, y1, hw)]);
  return { geos, cols };
};

const slabPiece = (tris, th) => ({ geos: () => [slab(tris, th)], cols: [], surf: tris });

const PIECES = {
  foundation: { geos: () => [
    new RoundedBoxGeometry(3.99, 0.27, 3.99, 1, 0.045).translate(0, -0.135, 0),
    box(-1.94, -0.92, -1.94, 1.94, -0.27, 1.94),
    ...[-1.69, 1.69].flatMap(x => [-1.69, 1.69].map(z => cyl(0.24, -2, -0.92, 12).translate(x, 0, z))),
  ], cols: [[-2, -1, -2, 2, 0, 2]], label: 'Foundation' },
  floor:      { ...solid([-2, 0, -2, 2, 0.2, 2]), label: 'Floor' },
  wall:       { ...solid([-2, 0, 1.9, 2, H, 2.1]), label: 'Wall' },
  doorway:    { ...solid([-2, 0, 1.9, -0.8, H, 2.1], [0.8, 0, 1.9, 2, H, 2.1], [-0.8, 2.4, 1.9, 0.8, H, 2.1]), label: 'Doorway' },
  walkway:    { ...solid([-0.75, 0, -2, 0.75, 0.2, 2]), label: 'Walkway' },
  ramp:       { geos: () => [slab([[[-2, 0, -2], [2, H, -2], [2, H, 2]], [[-2, 0, -2], [2, H, 2], [-2, 0, 2]]], 0.15)], cols: [], ramp: true, label: 'Ramp' },
  roof:       { ...slabPiece([[[-2.2, H, -2.2], [0, H + 1.8, -2.2], [0, H + 1.8, 2.2]], [[-2.2, H, -2.2], [0, H + 1.8, 2.2], [-2.2, H, 2.2]], [[2.2, H, -2.2], [0, H + 1.8, 2.2], [0, H + 1.8, -2.2]], [[2.2, H, -2.2], [2.2, H, 2.2], [0, H + 1.8, 2.2]]], 0.15), label: 'Roof' },
  dome:       { geos: () => [new THREE.SphereGeometry(2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)], cols: [], label: 'Dome' },
  stairs:     { ...hollowStairs(6, H / 6), label: 'Stairs' },
  window:     { ...solid([-2, 0, 1.9, 2, 0.9, 2.1], [-2, 2.1, 1.9, 2, H, 2.1], [-2, 0.9, 1.9, -0.8, 2.1, 2.1], [0.8, 0.9, 1.9, 2, 2.1, 2.1]), label: 'Window' },
  halfwall:   { ...solid([-2, 0, 1.9, 2, 1.2, 2.1]), label: 'Half Wall' },
  fence:      { ...solid([-2, 0, 1.9, -1.8, 1.1, 2.1], [1.8, 0, 1.9, 2, 1.1, 2.1], [-0.1, 0, 1.9, 0.1, 1.1, 2.1], [-2, 0.9, 1.92, 2, 1.1, 2.08], [-2, 0.4, 1.92, 2, 0.5, 2.08]), label: 'Fence' },
  flatroof:   { geos: () => [box(-2.2, H, -2.2, 2.2, H + 0.25, 2.2)], cols: [], label: 'Flat Roof' },
  pyramid:    { geos: () => { const g = new THREE.ConeGeometry(2.2 * Math.SQRT2, 1.8, 4, 1, true); g.rotateY(Math.PI / 4); g.translate(0, H + 0.9, 0); return [g]; }, cols: [], label: 'Pyramid Roof' },
  arch:       { ...solid([-2, 0, 1.9, -1, H, 2.1], [1, 0, 1.9, 2, H, 2.1], [-1, 2.4, 1.9, 1, H, 2.1], [-1, 1.9, 1.9, -0.6, 2.4, 2.1], [0.6, 1.9, 1.9, 1, 2.4, 2.1]), label: 'Arch Wall' },
  widedoor:   { ...solid([-2, 0, 1.9, -1.2, H, 2.1], [1.2, 0, 1.9, 2, H, 2.1], [-1.2, 2.4, 1.9, 1.2, H, 2.1]), label: 'Wide Doorway' },
  widewindow: { ...solid([-2, 0, 1.9, 2, 0.8, 2.1], [-2, 2.2, 1.9, 2, H, 2.1], [-2, 0.8, 1.9, -1.4, 2.2, 2.1], [1.4, 0.8, 1.9, 2, 2.2, 2.1]), label: 'Wide Window' },
  slitwindow: { ...solid([-2, 0, 1.9, -0.2, H, 2.1], [0.2, 0, 1.9, 2, H, 2.1], [-0.2, 0, 1.9, 0.2, 1, 2.1], [-0.2, 2.2, 1.9, 0.2, H, 2.1]), label: 'Slit Window' },
  battlement: { ...solid([-2, 0, 1.85, 2, H - 0.6, 2.15], [-2, H - 0.6, 1.85, -1.2, H + 0.5, 2.15], [-0.4, H - 0.6, 1.85, 0.4, H + 0.5, 2.15], [1.2, H - 0.6, 1.85, 2, H + 0.5, 2.15]), label: 'Battlement' },
  gate:       { ...solid([-2, 0, 1.9, -1.8, 1.4, 2.1], [1.8, 0, 1.9, 2, 1.4, 2.1]), geos: () => [[-2, 0, 1.9, -1.8, 1.4, 2.1], [1.8, 0, 1.9, 2, 1.4, 2.1], [-1.8, 1.2, 1.94, 1.8, 1.4, 2.06], [-1.8, 0.2, 1.94, 1.8, 0.35, 2.06], [-0.9, 0.35, 1.94, -0.8, 1.2, 2.06], [0.8, 0.35, 1.94, 0.9, 1.2, 2.06]].map((b) => box(...b)), label: 'Gate' },
  gableend:   { geos: () => { const g = prism([[-2, 0], [2, 0], [0, 1.8]], 0.2); g.translate(0, H, 2); return [g]; }, cols: [], label: 'Gable End' },
  halffloor:  { ...solid([-2, 0, -2, 2, 0.2, 0]), label: 'Half Floor' },
  holefloor:  { ...solid([-2, 0, -2, 2, 0.2, -0.8], [-2, 0, 0.8, 2, 0.2, 2], [-2, 0, -0.8, -0.8, 0.2, 0.8], [0.8, 0, -0.8, 2, 0.2, 0.8]), label: 'Hole Floor' },
  plank:      { ...solid([-0.3, 0, -2, 0.3, 0.15, 2]), label: 'Plank' },
  step:       { ...solid([-2, 0, -2, 2, 0.45, 2]), label: 'Step' },
  halfstairs: { ...hollowStairs(6, 0.25), label: 'Low Stairs' },
  column:     { geos: () => [cyl(0.35, 0, H, 20), box(-0.5, 0, -0.5, 0.5, 0.25, 0.5), box(-0.5, H - 0.25, -0.5, 0.5, H, 0.5)], cols: [[-0.5, 0, -0.5, 0.5, H, 0.5]], label: 'Column' },
  tower:      { geos: () => [new THREE.CylinderGeometry(1.9, 1.9, H, 28, 1, true).translate(0, H / 2, 0)], cols: [[-1.6, 0, -1.6, 1.6, H, 1.6]], label: 'Round Tower' },
  beam:       { ...solid([-2, H - 0.3, -0.15, 2, H, 0.15]), label: 'Beam' },
  headerbeam: { ...solid([-2, H - 0.3, 1.8, 2, H, 2.2]), label: 'Header Beam' },
  shedroof:   { ...slabPiece([[[-2.2, H, 2.2], [2.2, H + 1.4, 2.2], [2.2, H + 1.4, -2.2]], [[-2.2, H, 2.2], [2.2, H + 1.4, -2.2], [-2.2, H, -2.2]]], 0.15), label: 'Shed Roof' },
  coneroof:   { geos: () => { const g = new THREE.ConeGeometry(2.8, 2.4, 20, 1, true); g.translate(0, H + 1.2, 0); return [g]; }, cols: [], label: 'Cone Roof' },
  awning:     { geos: () => { const g = new THREE.BoxGeometry(4, 0.1, 1.6); g.rotateX(-0.35); g.translate(0, 2.5, 2.7); return [g]; }, cols: [], label: 'Awning' },
  bench:      { ...solid([-0.9, 0.4, -0.25, 0.9, 0.5, 0.25], [-0.8, 0, -0.2, -0.6, 0.4, 0.2], [0.6, 0, -0.2, 0.8, 0.4, 0.2]), label: 'Bench' },
  table:      { ...solid([-0.8, 0.9, -0.5, 0.8, 1, 0.5], [-0.7, 0, -0.4, -0.55, 0.9, -0.25], [0.55, 0, -0.4, 0.7, 0.9, -0.25], [-0.7, 0, 0.25, -0.55, 0.9, 0.4], [0.55, 0, 0.25, 0.7, 0.9, 0.4]), label: 'Table' },
  crate:      { ...solid([-0.5, 0, -0.5, 0.5, 1, 0.5]), label: 'Crate' },
  barrel:     { geos: () => [
    new THREE.LatheGeometry([[0,0],[0.35,0],[0.39,0.16],[0.42,0.48],[0.39,0.84],[0.35,1],[0.32,1],[0.32,0.97],[0,0.97]].map(([r,y]) => new THREE.Vector2(r,y)), 20),
    cyl(0.395, 0.13, 0.19, 20), cyl(0.425, 0.47, 0.53, 20), cyl(0.395, 0.81, 0.87, 20),
  ], cols: [[-0.42, 0, -0.42, 0.42, 1, 0.42]], label: 'Barrel' },
  lamppost:   { geos: () => [cyl(0.08, 0, 2.8, 8), cyl(0.3, 0, 0.2, 12), new THREE.SphereGeometry(0.28, 14, 10).translate(0, 2.95, 0)], cols: [[-0.1, 0, -0.1, 0.1, 2.8, 0.1]], label: 'Lamp Post' },
  planter:    { geos: () => [box(-1, 0, -0.4, 1, 0.5, 0.4), new THREE.SphereGeometry(0.65, 14, 10).translate(0, 0.9, 0)], cols: [[-1, 0, -0.4, 1, 0.5, 0.4]], label: 'Planter' },
  banner:     { ...solid([-0.5, 1.2, 1.88, 0.5, 2.8, 1.92], [-0.6, 2.75, 1.85, 0.6, 2.85, 1.95]), cols: [], label: 'Banner' },
  obelisk:    { geos: () => [box(-0.4, 0, -0.4, 0.4, 2.5, 0.4), new THREE.ConeGeometry(0.57, 0.7, 4).rotateY(Math.PI / 4).translate(0, 2.85, 0)], cols: [[-0.4, 0, -0.4, 0.4, 2.5, 0.4]], label: 'Obelisk' },
  gardenarch: { ...solid([-1, 0, -0.1, -0.8, 2.6, 0.1], [0.8, 0, -0.1, 1, 2.6, 0.1], [-1, 2.6, -0.1, 1, 2.8, 0.1]), label: 'Garden Arch' },
  pillar:     { ...solid([1.75, 0, 1.75, 2.25, H, 2.25]), label: 'Pillar' },
};
// ---------- extra pieces (variants of every kind) ----------
const B = (...bs) => bs.map((b) => box(...b));
const rng = (n) => Array.from({ length: n }, (_, i) => i);
const wallGeo = (shape) => { const g = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }); g.translate(0, 0, 1.9); return g; };
const rectShape = () => { const s = new THREE.Shape(); s.moveTo(-2, 0); s.lineTo(2, 0); s.lineTo(2, H); s.lineTo(-2, H); s.closePath(); return s; };
const profileTris = (profile) => {
  const tris = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [xa, ha] = profile[i], [xb, hb] = profile[i + 1];
    for (const sx of [1, -1]) {
      tris.push([[sx * xa, H + ha, -2.2], [sx * xb, H + hb, -2.2], [sx * xb, H + hb, 2.2]]);
      tris.push([[sx * xa, H + ha, -2.2], [sx * xb, H + hb, 2.2], [sx * xa, H + ha, 2.2]]);
    }
  }
  return tris;
};
const doorShape = () => {
  const s = new THREE.Shape();
  s.moveTo(-2, 0); s.lineTo(-0.8, 0); s.lineTo(-0.8, 1.8); s.absarc(0, 1.8, 0.8, Math.PI, 0, true);
  s.lineTo(0.8, 0); s.lineTo(2, 0); s.lineTo(2, H); s.lineTo(-2, H); s.closePath();
  return s;
};
const roundWinShape = () => { const s = rectShape(); const h = new THREE.Path(); h.absarc(0, 1.6, 0.6, 0, Math.PI * 2, false); s.holes.push(h); return s; };
const archWinShape = () => {
  const s = rectShape(); const h = new THREE.Path();
  h.moveTo(-0.5, 1); h.lineTo(0.5, 1); h.lineTo(0.5, 1.9); h.absarc(0, 1.9, 0.5, 0, Math.PI, false); h.closePath();
  s.holes.push(h); return s;
};
const winBoxes = [[-2, 0, 1.9, 2, 0.9, 2.1], [-2, 2.1, 1.9, 2, H, 2.1], [-2, 0.9, 1.9, -0.8, 2.1, 2.1], [0.8, 0.9, 1.9, 2, 2.1, 2.1]];
const slats = (n, f) => rng(n).map(f);
const tri = (a, b, c) => [a, b, c];

Object.assign(PIECES, {
  // ---- foundations
  deck:       { geos: () => [...B([-2, -0.3, -2, 2, 0, 2]), ...[[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].map(([x, z]) => cyl(0.16, -1.6, -0.3, 8).translate(x, 0, z))], cols: [[-2, -1, -2, 2, 0, 2]], found: true, label: 'Deck' },
  pool:       { ...solid([-2, -1, -2, 2, 0, -1.3], [-2, -1, 1.3, 2, 0, 2], [-2, -1, -1.3, -1.3, 0, 1.3], [1.3, -1, -1.3, 2, 0, 1.3], [-1.3, -1, -1.3, 1.3, -0.7, 1.3]), found: true, label: 'Pool' },
  pier:       { geos: () => [...B([-0.8, -0.25, -2, 0.8, 0, 2]), ...[[-0.6, -1.7], [0.6, -1.7], [-0.6, 1.7], [0.6, 1.7]].map(([x, z]) => cyl(0.14, -1.6, -0.25, 8).translate(x, 0, z))], cols: [[-0.8, -1, -2, 0.8, 0, 2]], found: true, label: 'Pier' },
  // ---- walls
  tallwall:   { ...solid([-2, 0, 1.9, 2, H * 1.5, 2.1]), label: 'Tall Wall' },
  thickwall:  { ...solid([-2, 0, 1.5, 2, H, 2.1]), label: 'Thick Wall' },
  halflenwall:{ ...solid([-2, 0, 1.9, 0, H, 2.1]), label: 'Half-Length Wall' },
  cornerwall: { ...solid([-2, 0, 1.9, 2.1, H, 2.1], [1.9, 0, -2, 2.1, H, 1.9]), label: 'Corner Wall' },
  arcdoor:    { geos: () => [wallGeo(doorShape())], cols: [[-2, 0, 1.9, -0.8, H, 2.1], [0.8, 0, 1.9, 2, H, 2.1], [-0.8, 2.6, 1.9, 0.8, H, 2.1]], label: 'Arched Doorway' },
  roundwindow:{ geos: () => [wallGeo(roundWinShape())], cols: [[-2, 0, 1.9, 2, 1, 2.1], [-2, 2.2, 1.9, 2, H, 2.1], [-2, 1, 1.9, -0.6, 2.2, 2.1], [0.6, 1, 1.9, 2, 2.2, 2.1]], label: 'Round Window' },
  archwindow: { geos: () => [wallGeo(archWinShape())], cols: [[-2, 0, 1.9, 2, 1, 2.1], [-2, 2.4, 1.9, 2, H, 2.1], [-2, 1, 1.9, -0.5, 2.4, 2.1], [0.5, 1, 1.9, 2, 2.4, 2.1]], label: 'Arched Window' },
  mullion:    { geos: () => B(...winBoxes, [-0.04, 0.9, 1.92, 0.04, 2.1, 2.08], [-0.8, 1.45, 1.92, 0.8, 1.55, 2.08]), cols: winBoxes, label: 'Framed Window' },
  portcullis: { geos: () => B([-2, 0, 1.9, -1.6, H, 2.1], [1.6, 0, 1.9, 2, H, 2.1], [-1.6, 2.5, 1.9, 1.6, H, 2.1], [-1.6, 1.2, 1.94, 1.6, 1.28, 2.06], ...slats(6, (i) => [-1.2 + i * 0.48 - 0.04, 0, 1.94, -1.2 + i * 0.48 + 0.04, 2.5, 2.06])), cols: [[-2, 0, 1.9, -1.6, H, 2.1], [1.6, 0, 1.9, 2, H, 2.1], [-1.6, 2.5, 1.9, 1.6, H, 2.1]], label: 'Portcullis' },
  lattice:    { geos: () => B(...slats(7, (i) => [-1.8 + i * 0.6 - 0.04, 0, 1.94, -1.8 + i * 0.6 + 0.04, H, 2.06]), ...slats(6, (i) => [-2, 0.3 + i * 0.5, 1.94, 2, 0.38 + i * 0.5, 2.06])), cols: [[-2, 0, 1.9, 2, H, 2.1]], label: 'Lattice Wall' },
  colonnade:  { geos: () => [...slats(4, (i) => cyl(0.2, 0, H - 0.3, 14).translate(-1.5 + i, 0, 1.9)), ...B([-2, H - 0.3, 1.6, 2, H, 2.2])], cols: slats(4, (i) => [-1.7 + i, 0, 1.7, -1.3 + i, H, 2.1]), label: 'Colonnade' },
  picket:     { geos: () => B(...slats(10, (i) => [-1.8 + i * 0.4 - 0.06, 0, 1.94, -1.8 + i * 0.4 + 0.06, 1.1, 2.06]), [-2, 0.3, 1.9, 2, 0.4, 2.1], [-2, 0.8, 1.9, 2, 0.9, 2.1]), cols: [[-2, 0, 1.9, 2, 1.1, 2.1]], label: 'Picket Fence' },
  balustrade: { geos: () => [...slats(9, (i) => cyl(0.05, 0.2, 1, 8).translate(-1.8 + i * 0.45, 0, 2)), ...B([-2, 1, 1.85, 2, 1.15, 2.15], [-2, 0.1, 1.85, 2, 0.2, 2.15])], cols: [[-2, 0, 1.85, 2, 1.15, 2.15]], label: 'Balustrade' },
  lowrail:    { ...solid([-2, 0.85, 1.94, 2, 0.95, 2.06], [-2, 0, 1.92, -1.9, 0.95, 2.08], [1.9, 0, 1.92, 2, 0.95, 2.08]), label: 'Low Rail' },
  // ---- floors
  roundfloor: { geos: () => [cyl(2.1, 0, 0.2, 32)], cols: [[-1.7, 0, -1.7, 1.7, 0.2, 1.7]], label: 'Round Floor' },
  quarterfloor:{ ...solid([-2, 0, -2, 0, 0.2, 0]), label: 'Quarter Floor' },
  gridfloor:  { ...solid(...slats(8, (i) => [-2 + i * 0.5, 0, -2, -2 + i * 0.5 + 0.32, 0.12, 2])), label: 'Grid Floor' },
  balcony:    { ...solid([-2, 0, 0, 2, 0.2, 2], [-2, 0.2, 1.9, 2, 1.1, 2.1], [-2, 0.2, 0, -1.9, 1.1, 1.9], [1.9, 0.2, 0, 2, 1.1, 1.9]), label: 'Balcony' },
  // ---- access
  narrowstairs:{ ...hollowStairs(6, H / 6, 1), label: 'Narrow Stairs' },
  steepstairs:{ ...hollowStairs(12, 0.25), label: 'Steep Stairs' },
  lowramp:    { geos: () => [slab([tri([-2, 0, -2], [2, 1.5, -2], [2, 1.5, 2]), tri([-2, 0, -2], [2, 1.5, 2], [-2, 0, 2])], 0.15)], cols: [], ramp: true, rise: 1.5, label: 'Low Ramp' },
  narrowramp: { geos: () => [slab([tri([-2, 0, -1], [2, H, -1], [2, H, 1]), tri([-2, 0, -1], [2, H, 1], [-2, 0, 1])], 0.15)], cols: [], ramp: true, hw: 1, label: 'Narrow Ramp' },
  // ---- supports
  roundpillar:{ geos: () => [cyl(0.22, 0, H, 16).translate(1.8, 0, 1.8)], cols: [[1.58, 0, 1.58, 2.02, H, 2.02]], label: 'Round Pillar' },
  tallpost:   { ...solid([1.75, 0, 1.75, 2.25, H * 2, 2.25]), label: 'Tall Post' },
  xbrace:     { geos: () => [-1, 1].map((s) => new THREE.BoxGeometry(0.12, 5, 0.12).rotateZ(s * 0.927).translate(0, H / 2, 2)), cols: [], label: 'X Brace' },
  buttress:   { geos: () => { const g = prism([[0, 0], [-1.2, 0], [0, H]], 0.5); g.rotateY(Math.PI / 2); g.translate(0, 0, 2.1); return [g]; }, cols: [[-0.25, 0, 2.1, 0.25, H, 2.5]], label: 'Buttress' },
  // ---- roofs
  steeproof:  { ...slabPiece(profileTris([[-2.2, 0], [0, 3.2]]), 0.15), label: 'Steep Roof' },
  lowroof:    { ...slabPiece(profileTris([[-2.2, 0], [0, 1]]), 0.15), label: 'Low Roof' },
  gambrel:    { ...slabPiece(profileTris([[-2.2, 0], [-1.3, 1.3], [0, 2]]), 0.15), label: 'Gambrel Roof' },
  barrelvault:{ geos: () => [new THREE.CylinderGeometry(2.2, 2.2, 4.4, 24, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, H, 0)], cols: [], label: 'Barrel Vault' },
  spire:      { geos: () => [new THREE.ConeGeometry(1.4, 4.5, 8, 1, true).translate(0, H + 2.25, 0)], cols: [], label: 'Spire' },
  parapetroof:{ geos: () => B([-2.2, H, -2.2, 2.2, H + 0.2, 2.2], [-2.2, H + 0.2, -2.2, 2.2, H + 0.7, -2], [-2.2, H + 0.2, 2, 2.2, H + 0.7, 2.2], [-2.2, H + 0.2, -2, -2, H + 0.7, 2], [2, H + 0.2, -2, 2.2, H + 0.7, 2]), cols: [[-2.2, H, -2.2, 2.2, H + 0.2, 2.2]], label: 'Parapet Roof' },
  skylight:   { geos: () => B([-2.2, H, -2.2, 2.2, H + 0.2, -1.5], [-2.2, H, 1.5, 2.2, H + 0.2, 2.2], [-2.2, H, -1.5, -1.5, H + 0.2, 1.5], [1.5, H, -1.5, 2.2, H + 0.2, 1.5], [-1.5, H + 0.05, -0.05, 1.5, H + 0.15, 0.05]), cols: [], label: 'Skylight Frame' },
  talldome:   { geos: () => [new THREE.SphereGeometry(2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.7, 1)], cols: [], label: 'Tall Dome' },
  // ---- furniture
  chair:      { ...solid([-0.3, 0.45, -0.3, 0.3, 0.52, 0.3], [-0.3, 0.52, 0.22, 0.3, 1.1, 0.3], [-0.3, 0, -0.3, -0.22, 0.45, -0.22], [0.22, 0, -0.3, 0.3, 0.45, -0.22], [-0.3, 0, 0.22, -0.22, 0.45, 0.3], [0.22, 0, 0.22, 0.3, 0.45, 0.3]), label: 'Chair' },
  stool:      { geos: () => [cyl(0.25, 0.4, 0.5, 14), cyl(0.06, 0, 0.4, 8)], cols: [[-0.25, 0, -0.25, 0.25, 0.5, 0.25]], label: 'Stool' },
  bed:        { ...solid([-0.5, 0.25, -1, 0.5, 0.45, 1], [-0.45, 0.45, -0.95, 0.45, 0.6, 0.95], [-0.4, 0.6, 0.5, 0.4, 0.72, 0.9], [-0.5, 0, -1, -0.4, 0.25, -0.9], [0.4, 0, -1, 0.5, 0.25, -0.9], [-0.5, 0, 0.9, -0.4, 0.8, 1], [0.4, 0, 0.9, 0.5, 0.8, 1]), label: 'Bed' },
  bookshelf:  { ...solid([-1, 0, 1.75, 1, 2.2, 1.85], [-1, 0, 1.85, -0.9, 2.2, 2.1], [0.9, 0, 1.85, 1, 2.2, 2.1], [-1, 2.1, 1.85, 1, 2.2, 2.1], [-1, 0.5, 1.85, 1, 0.58, 2.1], [-1, 1.1, 1.85, 1, 1.18, 2.1], [-1, 1.7, 1.85, 1, 1.78, 2.1], [-1, 0, 1.85, 1, 0.08, 2.1]), label: 'Bookshelf' },
  chest:      { ...solid([-0.5, 0, -0.35, 0.5, 0.5, 0.35], [-0.5, 0.5, -0.35, 0.5, 0.65, 0.35]), label: 'Chest' },
  counter:    { ...solid([-1.5, 0, -0.4, 1.5, 0.95, 0.4], [-1.6, 0.95, -0.5, 1.6, 1.05, 0.5]), label: 'Counter' },
  rug:        { geos: () => B([-1.2, 0, -0.8, 1.2, 0.03, 0.8]), cols: [], label: 'Rug' },
  hearth:     { ...solid([-1, 0, 1.6, 1, 0.3, 2.1], [-1, 0.3, 1.9, 1, 2, 2.1], [-1, 0.3, 1.7, -0.8, 2, 2.1], [0.8, 0.3, 1.7, 1, 2, 2.1], [-1.1, 2, 1.7, 1.1, 2.15, 2.15]), label: 'Hearth' },
  // ---- decor / props
  firepit:    { geos: () => [...B([-0.6, 0, -0.6, 0.6, 0.25, -0.45], [-0.6, 0, 0.45, 0.6, 0.25, 0.6], [-0.6, 0, -0.45, -0.45, 0.25, 0.45], [0.45, 0, -0.45, 0.6, 0.25, 0.45]), new THREE.ConeGeometry(0.3, 0.8, 8).translate(0, 0.5, 0)], cols: [[-0.6, 0, -0.6, 0.6, 0.25, 0.6]], label: 'Fire Pit' },
  well:       { geos: () => [new THREE.CylinderGeometry(0.9, 0.9, 0.9, 16, 1, true).translate(0, 0.45, 0), ...B([-1, 0.9, -0.08, -0.85, 2.2, 0.08], [0.85, 0.9, -0.08, 1, 2.2, 0.08]), new THREE.ConeGeometry(1.4, 0.7, 4, 1, true).rotateY(Math.PI / 4).translate(0, 2.55, 0)], cols: [[-0.9, 0, -0.9, 0.9, 0.9, 0.9]], label: 'Well' },
  fountain:   { geos: () => [new THREE.CylinderGeometry(1.3, 1.2, 0.5, 24, 1, true).translate(0, 0.25, 0), cyl(1.25, 0, 0.05, 24), cyl(0.15, 0, 1.4, 10), new THREE.CylinderGeometry(0.55, 0.3, 0.25, 16, 1, true).translate(0, 1.4, 0)], cols: [[-1.3, 0, -1.3, 1.3, 0.5, 1.3]], label: 'Fountain' },
  statue:     { geos: () => [...B([-0.5, 0, -0.5, 0.5, 0.8, 0.5]), cyl(0.22, 0.8, 2, 12), new THREE.SphereGeometry(0.24, 12, 10).translate(0, 2.25, 0)], cols: [[-0.5, 0, -0.5, 0.5, 2.4, 0.5]], label: 'Statue' },
  signpost:   { geos: () => B([-0.06, 0, -0.06, 0.06, 1.8, 0.06], [-0.6, 1.2, -0.04, 0.6, 1.7, 0.04]), cols: [[-0.1, 0, -0.1, 0.1, 1.8, 0.1]], label: 'Signpost' },
  flagpole:   { geos: () => [cyl(0.06, 0, 4, 8), ...B([0.06, 3.1, -0.02, 1.1, 3.9, 0.02])], cols: [[-0.1, 0, -0.1, 0.1, 4, 0.1]], label: 'Flagpole' },
  parasol:    { geos: () => [cyl(0.05, 0, 2.4, 8), new THREE.ConeGeometry(1.5, 0.5, 12, 1, true).translate(0, 2.65, 0)], cols: [[-0.08, 0, -0.08, 0.08, 2.4, 0.08]], label: 'Parasol' },
  mailbox:    { geos: () => B([-0.05, 0, -0.05, 0.05, 1, 0.05], [-0.2, 1, -0.3, 0.2, 1.3, 0.3]), cols: [[-0.2, 0, -0.3, 0.2, 1.3, 0.3]], label: 'Mailbox' },
  tent:       { geos: () => [slab([tri([-1.3, 0, -1.2], [0, 1.7, -1.2], [0, 1.7, 1.2]), tri([-1.3, 0, -1.2], [0, 1.7, 1.2], [-1.3, 0, 1.2]), tri([1.3, 0, -1.2], [0, 1.7, 1.2], [0, 1.7, -1.2]), tri([1.3, 0, -1.2], [1.3, 0, 1.2], [0, 1.7, 1.2])], 0.06)], cols: [], label: 'Tent' },
  lantern:    { geos: () => [...B([-0.015, 2.5, -0.015, 0.015, H, 0.015]), cyl(0.14, 2.2, 2.5, 10), new THREE.SphereGeometry(0.1, 8, 8).translate(0, 2.35, 0)], cols: [], label: 'Hanging Lantern' },
  torch:      { geos: () => [cyl(0.05, 0, 1.4, 8), new THREE.ConeGeometry(0.15, 0.4, 8).translate(0, 1.6, 0)], cols: [[-0.06, 0, -0.06, 0.06, 1.4, 0.06]], label: 'Torch Stand' },
  // ---- nature
  tree:       { geos: () => [cyl(0.25, 0, 1.8, 10), new THREE.SphereGeometry(1.3, 14, 10).translate(0, 2.7, 0)], cols: [[-0.3, 0, -0.3, 0.3, 2, 0.3]], label: 'Tree' },
  pine:       { geos: () => [cyl(0.2, 0, 1, 8), ...[[1.5, 0.8, 1.3], [1.15, 1.9, 1.2], [0.8, 2.9, 1.1]].map(([r, y, h]) => new THREE.ConeGeometry(r, h, 10).translate(0, y + h / 2, 0))], cols: [[-0.25, 0, -0.25, 0.25, 2.5, 0.25]], label: 'Pine' },
  bush:       { geos: () => [new THREE.SphereGeometry(0.75, 12, 9).scale(1, 0.8, 1).translate(0, 0.55, 0)], cols: [], label: 'Bush' },
  rock:       { geos: () => [new THREE.IcosahedronGeometry(0.85, 0).scale(1, 0.7, 1.1).translate(0, 0.5, 0)], cols: [[-0.7, 0, -0.7, 0.7, 1, 0.7]], label: 'Rock' },
  flowerbed:  { geos: () => [...B([-1.2, 0, -0.5, 1.2, 0.2, 0.5]), ...slats(5, (i) => new THREE.SphereGeometry(0.17, 8, 6).translate(-0.9 + i * 0.45, 0.32, i % 2 ? 0.15 : -0.15))], cols: [[-1.2, 0, -0.5, 1.2, 0.2, 0.5]], label: 'Flower Bed' },
  haybale:    { geos: () => [new THREE.CylinderGeometry(0.5, 0.5, 1, 16).rotateZ(Math.PI / 2).translate(0, 0.5, 0)], cols: [[-0.5, 0, -0.5, 0.5, 1, 0.5]], label: 'Hay Bale' },
});

Object.assign(PIECES, slopePieces());
// ---- freeform (Sons-style): click a start point, click an end point, the piece stretches between them at any angle
const FREE = {
  beam:  { label: 'Beam',  geo: (L) => new THREE.BoxGeometry(L, 0.25, 0.25), cols: 0.13, top: [0.125, 0.125] },
  log:   { label: 'Log',   geo: (L) => new THREE.CylinderGeometry(0.18, 0.18, L, 12).rotateZ(Math.PI / 2), cols: 0.18, top: [0.18, 0.15] },
  plank: { label: 'Plank', geo: (L) => new THREE.BoxGeometry(L, 0.08, 0.7), cols: 0, top: [0.04, 0.35] },
  panel: { label: 'Wall Panel', geo: (L) => new THREE.BoxGeometry(L, 2.7, 0.15).translate(0, 1.35, 0), cols: 0.12, tall: 2.7 },
  rail:  { label: 'Rail',  geo: (L) => new THREE.BoxGeometry(L, 0.08, 0.08), cols: 0.07 },
  rafter:{ label: 'Rafter', geo: (L) => new THREE.BoxGeometry(L, 0.2, 0.1), cols: 0.07 },
  stud:  { label: 'Stud',  geo: (L) => new THREE.BoxGeometry(L, 0.1, 0.1), cols: 0.06 },
  trim:  { label: 'Trim',  geo: (L) => new THREE.BoxGeometry(L, 0.14, 0.04), cols: 0 },
  pipe:  { label: 'Pipe',  geo: (L) => new THREE.CylinderGeometry(0.07, 0.07, L, 10).rotateZ(Math.PI / 2), cols: 0.07 },
  gutter:{ label: 'Gutter', geo: (L) => new THREE.CylinderGeometry(0.13, 0.13, L, 10, 1, true, Math.PI, Math.PI).rotateZ(Math.PI / 2), cols: 0 },
  rope:  { label: 'Rope',  geo: (L) => new THREE.CylinderGeometry(0.04, 0.04, L, 6).rotateZ(Math.PI / 2), cols: 0 },
};
Object.assign(PIECES, {
  tool_raise:  { geos: () => [new THREE.ConeGeometry(1, 2, 16).translate(0, 1, 0)], cols: [], tool: 'raise', label: 'Raise Terrain' },
  tool_lower:  { geos: () => [new THREE.ConeGeometry(1, 2, 16).rotateX(Math.PI).translate(0, 1, 0)], cols: [], tool: 'lower', label: 'Lower Terrain' },
  tool_flat:   { geos: () => [new THREE.CylinderGeometry(1.3, 1.3, 0.25, 24).translate(0, 0.12, 0)], cols: [], tool: 'flat', label: 'Flatten Terrain' },
  tool_smooth: { geos: () => [new THREE.SphereGeometry(1, 16, 12).translate(0, 1, 0)], cols: [], tool: 'smooth', label: 'Smooth Terrain' },
});
for (const [k, f] of Object.entries(FREE)) PIECES['free_' + k] = { geos: () => [f.geo(3)], cols: [], free: k, label: 'Free ' + f.label };
// ---- diagonal (45 degree in plan) pieces
const DL = 4 * Math.SQRT2;
const diagCols = (h) => rng(12).map((i) => { const c = -2 + (i + 0.5) * (4 / 12); return [c - 0.28, 0, c - 0.28, c + 0.28, h, c + 0.28]; });
Object.assign(PIECES, {
  diagwall:  { geos: () => [new THREE.BoxGeometry(DL, H, 0.2).rotateY(-Math.PI / 4).translate(0, H / 2, 0)], cols: diagCols(H), label: 'Diagonal Wall' },
  diagfence: { geos: () => [new THREE.BoxGeometry(DL, 0.12, 0.14).rotateY(-Math.PI / 4).translate(0, 1, 0), new THREE.BoxGeometry(DL, 0.1, 0.1).rotateY(-Math.PI / 4).translate(0, 0.45, 0), ...[-2, 0, 2].map((v) => new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(v, 0.55, v))], cols: diagCols(1.1), label: 'Diagonal Fence' },
  diagfloor: { ...slabPiece([tri([-2, 0.2, -2], [2, 0.2, -2], [-2, 0.2, 2])], 0.2), label: 'Triangle Floor' },
});
PIECES.foundation.found = true;
// ---- frame kit: posts and beams carry everything; panels only fit between them (see structural physics below)
Object.assign(PIECES, {
  fpost:  { ...solid([1.86, 0, 1.86, 2.14, H, 2.14]), label: 'Post' },
  fbeam:  { ...solid([-2, H - 0.28, 1.86, 2, H, 2.14]), label: 'Beam (top)' },
  fsill:  { ...solid([-2, 0, 1.86, 2, 0.25, 2.14]), label: 'Sill Beam (floor frame)' },
  fwall:  { ...solid([-1.86, 0.25, 1.93, 1.86, H - 0.28, 2.07]), label: 'Wall Panel' },
  fdoor:  { ...solid([-1.86, 0.25, 1.93, -0.8, H - 0.28, 2.07], [0.8, 0.25, 1.93, 1.86, H - 0.28, 2.07], [-0.8, 2.4, 1.93, 0.8, H - 0.28, 2.07]), label: 'Door Panel' },
  fwin:   { ...solid([-1.86, 0.25, 1.93, 1.86, 0.9, 2.07], [-1.86, 2.1, 1.93, 1.86, H - 0.28, 2.07], [-1.86, 0.9, 1.93, -0.8, 2.1, 2.07], [0.8, 0.9, 1.93, 1.86, 2.1, 2.07]), label: 'Window Panel' },
  fhalf:  { ...solid([-1.86, 0.25, 1.93, 1.86, 1.2, 2.07]), label: 'Half Panel' },
  ffloor: { ...solid([-1.9, 0.04, -1.9, 1.9, 0.2, 1.9]), label: 'Floor Panel' },
  froof:  { ...PIECES.roof, label: 'Roof Panel' },
  fflat:  { ...PIECES.flatroof, label: 'Flat Roof Panel' },
});
// ---- stilt / footing foundations (sit over uneven or sunken ground), roof parts, framing and trim
const strutGeo = (a, b, w, d) => {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), dl = Bv.clone().sub(A);
  const g = new THREE.BoxGeometry(w, dl.length(), d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dl.clone().normalize()));
  const m = A.clone().lerp(Bv, 0.5);
  return g.translate(m.x, m.y, m.z);
};
const rafterSet = (rh) => () => [
  ...[-1.9, -0.95, 0, 0.95, 1.9].flatMap((z) => [strutGeo([-2.2, H, z], [0, H + rh, z], 0.1, 0.14), strutGeo([2.2, H, z], [0, H + rh, z], 0.1, 0.14)]),
  ...B([-0.08, H + rh - 0.1, -2.05, 0.08, H + rh + 0.06, 2.05], [-2.25, H, -2.05, -2.05, H + 0.12, 2.05], [2.05, H, -2.05, 2.25, H + 0.12, 2.05]),
];
const ang = Math.atan2(1.8, 2.2);
Object.assign(PIECES, {
  stilts:  { geos: () => [...B([-2, -0.3, -2, 2, 0, 2]), ...[[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].map(([x, z]) => cyl(0.2, -6, -0.3, 10).translate(x, 0, z)), ...B([-1.7, -3.1, -1.78, 1.7, -3, -1.62], [-1.7, -3.1, 1.62, 1.7, -3, 1.78], [-1.78, -3.1, -1.7, -1.62, -3, 1.7], [1.62, -3.1, -1.7, 1.78, -3, 1.7])], cols: [[-2, -1, -2, 2, 0, 2]], found: true, stilt: [-5.5, 0.6], label: 'Stilt Platform' },
  footing: { geos: () => [...B([-2, -0.4, -2, 2, 0, 2]), ...[[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5], [0, 0]].map(([x, z]) => cyl(0.35, -2.5, -0.4, 10).translate(x, 0, z))], cols: [[-2, -1, -2, 2, 0, 2]], found: true, stilt: [-2.5, 0.6], label: 'Footing Slab' },
  studwall: { geos: () => B(...slats(9, (i) => [-2 + i * 0.5 - 0.04, 0, 1.92, -2 + i * 0.5 + 0.04, H, 2.08]), [-2, 0, 1.92, 2, 0.1, 2.08], [-2, H - 0.1, 1.92, 2, H, 2.08], [-2, 1.4, 1.94, 2, 1.5, 2.06]), cols: [[-2, 0, 1.9, 2, H, 2.1]], label: 'Stud Wall (Frame)' },
  rafters:      { geos: rafterSet(1.8), cols: [], label: 'Rafters' },
  lowrafters:   { geos: rafterSet(1), cols: [], label: 'Low Rafters' },
  steeprafters: { geos: rafterSet(3.2), cols: [], label: 'Steep Rafters' },
  ridgecap: { geos: () => [new THREE.BoxGeometry(0.7, 0.08, 4.4).rotateZ(ang).translate(-0.33, H + 1.8 - 0.33 * Math.tan(ang) + 0.04, 0), new THREE.BoxGeometry(0.7, 0.08, 4.4).rotateZ(-ang).translate(0.33, H + 1.8 - 0.33 * Math.tan(ang) + 0.04, 0)], cols: [], label: 'Ridge Cap' },
  gutter:   { geos: () => B([-2, H - 0.2, 2.1, 2, H - 0.14, 2.4], [-2, H - 0.14, 2.34, 2, H + 0.05, 2.4], [-2, H - 0.14, 2.1, 2, H - 0.02, 2.16], [1.85, 0, 2.3, 1.97, H - 0.2, 2.42]), cols: [], label: 'Gutter + Downspout' },
  baseboard:{ geos: () => B([-2, 0, 2.1, 2, 0.25, 2.17]), cols: [], label: 'Baseboard' },
  crowntrim:{ geos: () => B([-2, H - 0.2, 2.1, 2, H, 2.2], [-2, H - 0.28, 2.1, 2, H - 0.2, 2.15]), cols: [], label: 'Crown Trim' },
  cornertrim:{ geos: () => B([1.88, 0, 1.88, 2.12, H, 1.96], [1.88, 0, 1.96, 1.96, H, 2.12]), cols: [], label: 'Corner Trim' },
  bracket:  { geos: () => [-1.5, 0, 1.5].flatMap((x) => [strutGeo([x, H - 0.6, 2.12], [x, H - 0.1, 2.5], 0.06, 0.06), ...B([x - 0.03, H - 0.6, 2.1, x + 0.03, H - 0.1, 2.16], [x - 0.03, H - 0.1, 2.1, x + 0.03, H, 2.5])]), cols: [], label: 'Brackets' },
  windowsill:{ geos: () => B([-1, 0.86, 2.1, 1, 0.92, 2.4], [-0.9, 0.8, 2.1, 0.9, 0.86, 2.16]), cols: [], label: 'Window Sill' },
  shutters: { geos: () => B([-1.35, 0.85, 2.1, -0.85, 2.15, 2.16], [0.85, 0.85, 2.1, 1.35, 2.15, 2.16], ...slats(4, (i) => [-1.3, 1 + i * 0.3, 2.16, -0.9, 1.05 + i * 0.3, 2.2]), ...slats(4, (i) => [0.9, 1 + i * 0.3, 2.16, 1.3, 1.05 + i * 0.3, 2.2])), cols: [], label: 'Shutters' },
  lintel:   { geos: () => B([-1.1, 2.35, 2.1, 1.1, 2.55, 2.25]), cols: [], label: 'Lintel' },
  doorframe:{ geos: () => B([-0.95, 0, 2.1, -0.8, 2.5, 2.18], [0.8, 0, 2.1, 0.95, 2.5, 2.18], [-0.95, 2.5, 2.1, 0.95, 2.65, 2.2]), cols: [], label: 'Door Frame' },
});
// Casings sit outside the clear opening so the original passage widths still apply.
for (const [type, width, bottom, top] of [
  ['doorway', 0.8, 0, 2.4], ['widedoor', 1.2, 0, 2.4],
  ['window', 0.8, 0.9, 2.1], ['widewindow', 1.4, 0.8, 2.2],
]) {
  const panel = PIECES[type].geos;
  PIECES[type].geos = () => [
    ...panel(),
    box(-width-0.12, bottom, 1.86, -width, top, 2.14),
    box(width, bottom, 1.86, width+0.12, top, 2.14),
    box(-width-0.2, top, 1.83, width+0.2, top+0.16, 2.17),
    ...(bottom ? [box(-width-0.2, bottom-0.12, 1.82, width+0.2, bottom, 2.18)] : []),
  ];
}
PIECES.torch.glow = [[0, 1.65, 0, 0.13]];
PIECES.lantern.glow = [[0, 2.35, 0, 0.12]];
PIECES.lamppost.glow = [[0, 2.95, 0, 0.3]];
PIECES.firepit.glow = [[0, 0.55, 0, 0.2]];
PIECES.hearth.glow = [[0, 0.55, 1.8, 0.2]];
const CATALOG = buildCatalog({ box, cyl, prism, slab, H, T });   // ~600 generated pieces (src/catalog.js)
Object.assign(PIECES, CATALOG.pieces);
for (const [t, f] of Object.entries(CATALOG.aliases)) if (PIECES[t]) PIECES[t].fam = f;
const FOUND = Object.keys(PIECES).filter((t) => PIECES[t].found);
const ORDER = Object.keys(PIECES);
const CATS = [
  ['Frame', ['fpost', 'fbeam', 'fsill', 'fwall', 'fdoor', 'fwin', 'fhalf', 'ffloor', 'froof', 'fflat']],
  ['Foundations', ['foundation', 'deck', 'pier', 'pool', 'stilts', 'footing']],
  ['Walls', ['wall', 'tallwall', 'thickwall', 'halflenwall', 'cornerwall', 'doorway', 'widedoor', 'arcdoor', 'arch', 'portcullis', 'gate', 'window', 'widewindow', 'mullion', 'archwindow', 'roundwindow', 'slitwindow', 'lattice', 'colonnade', 'halfwall', 'diagwall', 'fence', 'diagfence', 'picket', 'balustrade', 'lowrail', 'battlement', 'gableend', 'studwall']],
  ['Floors', ['floor', 'halffloor', 'quarterfloor', 'diagfloor', 'holefloor', 'roundfloor', 'gridfloor', 'walkway', 'plank', 'step', 'balcony']],
  ['Access', ['ramp', 'lowramp', 'narrowramp', 'stairs', 'narrowstairs', 'halfstairs', 'steepstairs']],
  ['Supports', ['pillar', 'roundpillar', 'column', 'tallpost', 'tower', 'beam', 'headerbeam', 'xbrace', 'buttress']],
  ['Roofs', ['roof', 'lowroof', 'steeproof', 'gambrel', 'flatroof', 'parapetroof', 'skylight', 'shedroof', 'barrelvault', 'pyramid', 'coneroof', 'spire', 'dome', 'talldome', 'awning', 'rafters', 'lowrafters', 'steeprafters', 'ridgecap']],
  ['Slopes', ['slope', 'half', 'hip', 'valley', 'gable'].flatMap((k) => SLOPE_DEGS.map((d) => k + d)).filter((t) => PIECES[t])],
  ['Trim', ['baseboard', 'crowntrim', 'cornertrim', 'doorframe', 'lintel', 'windowsill', 'shutters', 'bracket', 'gutter']],
  ['Furniture', ['chair', 'stool', 'bed', 'bookshelf', 'chest', 'counter', 'table', 'bench', 'rug', 'hearth']],
  ['Decor', ['crate', 'barrel', 'lamppost', 'torch', 'lantern', 'planter', 'banner', 'signpost', 'flagpole', 'parasol', 'mailbox', 'firepit', 'well', 'fountain', 'statue', 'obelisk', 'gardenarch', 'tent']],
  ['Freeform', ['free_beam', 'free_log', 'free_plank', 'free_panel', 'free_rail', 'free_rope', 'free_rafter', 'free_stud', 'free_trim', 'free_pipe', 'free_gutter']],
  ['Terrain', ['tool_raise', 'tool_lower', 'tool_flat', 'tool_smooth']],
  ['Nature', ['tree', 'pine', 'bush', 'rock', 'flowerbed', 'haybale']],
];
for (const [name, types] of CATALOG.cats) {
  const c = CATS.find((k) => k[0] === name);
  if (c) c[1].push(...types); else CATS.splice(CATS.findIndex((k) => k[0] === 'Freeform'), 0, [name, types]);
}
const DECKSET = new Set([...CATS.find((c) => c[0] === 'Floors')[1], ...FOUND, 'ffloor']);
const ROOFSET = new Set([...CATS.find((c) => c[0] === 'Roofs')[1], ...CATS.find((c) => c[0] === 'Slopes')[1], ...CATS.find((c) => c[0] === 'Domes & Spires')[1], 'froof', 'fflat']);
// hotbar: 10 slots on keys 1-9, 0 (fill from the build menu)
const DEFAULT_HOT = ['foundation', 'fpost', 'fbeam', 'fsill', 'fwall', 'fdoor', 'fwin', 'ffloor', 'froof', 'stairs'];
let HOT = DEFAULT_HOT.slice();
try { const h = JSON.parse(localStorage.getItem('peace.hotbar.v1')); if (Array.isArray(h) && h.length === 10 && h.every((t) => PIECES[t])) HOT = h; } catch {}
let activeSlot = 2;
const saveHot = () => { try { localStorage.setItem('peace.hotbar.v1', JSON.stringify(HOT)); } catch {} };

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3f2);
scene.fog = new THREE.FogExp2(0xbfe3f2, 0.00076);
const camera = new THREE.PerspectiveCamera(63, innerWidth / innerHeight, 0.12, 2400);
camera.layers.enable(1);

const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6a8a99, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
sun.position.set(-42, 55, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// ---------- worlds (save slots), settings, biome ----------
SAVES.migrateLegacy();
let activeSave = SAVES.getSave(SAVES.currentId());
if (!activeSave) {            // fall back to the most recently played world
  activeSave = SAVES.listSaves().sort((a, b) => b.updated - a.updated)[0] || null;
  SAVES.setCurrent(activeSave?.id || null);
}
const settings = SAVES.loadSettings();
const env = createEnvironment({ scene, sun, renderer, biome: activeSave?.biome || 'desert', seed: activeSave?.seed || 7 });

// ---------- world state ----------
const pieces = new Map();   // key -> piece
let pickables = [];
let colliders = [];         // flat list of world AABBs
let ramps = [];
let surfs = [];
let strandSurfs = [];
let decks = new Set();      // `${level}|${cx}|${cz}` tiles that have a floor/foundation at that level
let supports = new Set();   // `${level}|${2x}|${2z}` edge midpoints / corners that have a wall or post at that level

const cellOf = (v) => Math.round(v / T);
const keyOf = (type, level, x, z, rot) => `${type}|${level}|${x}|${z}|${Math.round(rot * 90)}`;
const rotV = (v, rot) => v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (rot * Math.PI) / 2);

const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
const glowSphere = new THREE.SphereGeometry(1, 12, 10);
const catalogMeshes = new Map();
function buildGroup(type, material, shadows = true) {
  const g = new THREE.Group();
  if (shadows) for (const [gx, gy, gz, gr] of PIECES[type].glow || []) {
    const m = new THREE.Mesh(glowSphere, glowMat);
    m.position.set(gx, gy, gz); m.scale.setScalar(gr); g.add(m);
  }
  if (!catalogMeshes.has(type)) catalogMeshes.set(type, fabricate(type, PIECES[type]));
  for (const {geo, finish} of catalogMeshes.get(type)) {
    const surface = material.isMeshBasicMaterial ? material : finishes[finish] || material;
    const m = new THREE.Mesh(geo, surface);
    m.castShadow = shadows && !surface.transmission;
    m.receiveShadow = shadows;
    g.add(m);
  }
  return g;
}

function worldCols(type, x, z, level, rot, cu) {
  const out = [], s = cu?.s || [1, 1, 1], yo = level * H + (cu?.y || 0);
  for (const [x0, y0, z0, x1, y1, z1] of PIECES[type].cols) {
    const min = new THREE.Vector3(Infinity, 0, Infinity), max = new THREE.Vector3(-Infinity, 0, -Infinity);
    for (const cx of [x0, x1]) for (const cz of [z0, z1]) {
      const p = rotV(new THREE.Vector3(cx * s[0], 0, cz * s[2]), rot);
      min.x = Math.min(min.x, p.x + x); max.x = Math.max(max.x, p.x + x);
      min.z = Math.min(min.z, p.z + z); max.z = Math.max(max.z, p.z + z);
    }
    min.y = Math.min(y0 * s[1], y1 * s[1]) + yo; max.y = Math.max(y0 * s[1], y1 * s[1]) + yo;
    out.push({ min, max });
  }
  return out;
}
// customization record: s = [sx, sy, sz] stretch (negative x = mirrored), y = lift, t = tint colour, p = placed in structural mode
function normCu(cu) {
  if (!cu) return null;
  const o = {};
  if (cu.s && cu.s.some((v) => Math.abs(v - 1) > 1e-4)) o.s = cu.s.map((v) => Math.round(v * 1000) / 1000);
  if (cu.y && Math.abs(cu.y) > 1e-4) o.y = Math.round(cu.y * 1000) / 1000;
  if (cu.t != null) o.t = cu.t;
  if (cu.p) o.p = 1;
  return Object.keys(o).length ? o : null;
}
const cuSig = (cu) => (cu && (cu.s || cu.y || cu.t != null) ? `|c${cu.s ? cu.s.join(',') : ''}/${cu.y || 0}/${cu.t ?? ''}` : '');
const scaledV = (v, cu) => (cu?.s ? new THREE.Vector3(v.x * cu.s[0], 0, v.z * cu.s[2]) : v);

function rebuildIndexes() {
  pickables = []; colliders = []; ramps = []; surfs = []; decks = new Set(); supports = new Set(); strandSurfs = []; idxCache = null;
  for (const p of pieces.values()) {
    p.group.traverse((o) => { if (o.isMesh) pickables.push(o); });
    colliders.push(...p.cols);
    if (PIECES[p.type].ramp) ramps.push(p);
    if (PIECES[p.type].surf) surfs.push(p);
    if (DECKSET.has(p.type)) decks.add(`${p.level}|${cellOf(p.x)}|${cellOf(p.z)}`);
    const si = p.pv === 2 && snapInfo(p.type);
    if (si) supports.add(supKey(p.level, p.x + si.q.x, p.z + si.q.z));
  }
  for (const st of strands.values()) {
    st.group.traverse((o) => { if (o.isMesh) pickables.push(o); });
    colliders.push(...st.cols);
    if (st.tris) strandSurfs.push(st);
  }
  if (stabOn) applyStab();
}

// Rotation pivot: pieces turn around their OWN centre (not the tile centre), so a rotated piece stays where it was aimed.
const pivots = {};
function pivotOf(type) {
  if (pivots[type]) return pivots[type];
  const bb = new THREE.Box3();
  for (const g of PIECES[type].geos()) { g.computeBoundingBox(); bb.union(g.boundingBox); g.dispose(); }
  const r = (v) => Math.round(v * 1000) / 1000;
  return (pivots[type] = new THREE.Vector3(r((bb.min.x + bb.max.x) / 2), 0, r((bb.min.z + bb.max.z) / 2)));
}
// Magnet snapping: wall-like pieces lock to tile EDGES, post-like pieces lock to tile CORNERS.
// q = the local point of the piece that sits on the edge/corner (the pivot while snapped).
const kinds = {};
function snapInfo(type) {
  if (kinds[type] !== undefined) return kinds[type];
  const c = pivotOf(type), ax = Math.abs(c.x), az = Math.abs(c.z);
  let info = null;
  if (!PIECES[type].found) {
    if (ax >= 1.5 && az >= 1.5) info = { kind: 'corner', q: c.clone() };
    else if (az >= 1.5 && ax <= 1.1) info = { kind: 'edge', q: new THREE.Vector3(0, 0, c.z) };
    else if (ax >= 1.5 && az <= 1.1) info = { kind: 'edge', q: new THREE.Vector3(c.x, 0, 0) };
  }
  return (kinds[type] = info);
}
const snapKeyOf = (type, level, x, z) => { const q = snapInfo(type)?.q; if (!q) return keyOf(type, level, x, z, 0); return `${type}|${level}|s|${Math.round((x + q.x) * 100)}|${Math.round((z + q.z) * 100)}`; };
const pieceKey = (type, level, x, z, rot, pv) => (pv === 2 ? snapKeyOf(type, level, x, z) : keyOf(type, level, x, z, rot));

// where the group origin must sit so the piece's centre stays at (x,z)+centre for any rotation
function originFor(type, x, z, rot, pv = 1, cu = null) {
  if (!pv) return [x, z];
  const c = (pv === 2 && snapInfo(type)?.q) || pivotOf(type), rc = rotV(scaledV(c, cu), rot);
  return [x + c.x - rc.x, z + c.z - rc.z];
}

function addPiece(type, x, z, level, rot, matIdx, pv = 1, cu = null) {
  cu = normCu(cu);
  const key = pieceKey(type, level, x, z, rot, pv) + cuSig(cu);
  if (pieces.has(key)) return;
  const group = buildGroup(type, tintMat(matIdx, cu?.t));
  const [ox, oz] = originFor(type, x, z, rot, pv, cu), s = cu?.s || [1, 1, 1], y0 = level * H + (cu?.y || 0);
  group.position.set(ox, y0, oz);
  group.rotation.y = (rot * Math.PI) / 2;
  group.scale.set(...s);
  const lights = (PIECES[type].glow || []).map(([gx, gy, gz]) => rotV(new THREE.Vector3(gx * s[0], 0, gz * s[2]), rot).add(new THREE.Vector3(ox, y0 + gy * s[1] + 0.2, oz)));
  const p = { key, type, x, z, ox, oz, pv, level, rot, matIdx, cu, group, lights, cols: worldCols(type, ox, oz, level, rot, cu) };
  group.traverse((o) => { if (o.isMesh) o.userData.piece = p; });
  scene.add(group);
  pieces.set(key, p);
  rebuildIndexes();
  scheduleSave();
  return p;
}

function removePiece(p) {
  if (p.strand) return removeStrand(p);
  scene.remove(p.group);
  pieces.delete(p.key);
  rebuildIndexes();
  scheduleSave();
}

const supKey = (L, x, z) => `${L}|${Math.round(x * 2)}|${Math.round(z * 2)}`;
// A tile is buildable at level L if it has a deck there, or walls/posts one level below frame it (Icarus-style stacking).
function supBelow(cx, cz, L) {
  const x = cx * T, z = cz * T, k = (a, b) => supports.has(supKey(L - 1, x + a, z + b));
  return k(2, 0) || k(-2, 0) || k(0, 2) || k(0, -2) || k(2, 2) || k(2, -2) || k(-2, 2) || k(-2, -2);
}
function tileActive(cx, cz, L) {
  if (decks.has(`${L}|${cx}|${cz}`)) return true;
  if (L <= 0) return false;
  return supBelow(cx, cz, L);
}
function canPlace(type, cx, cz, L) {
  if (L <= 0) return hasFoundation(cx, cz);
  if (DECKSET.has(type)) return tileActive(cx, cz, L) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => decks.has(`${L}|${cx + a}|${cz + b}`));
  return tileActive(cx, cz, L);
}
const tileOK = (cx, cz, L) => (L <= 0 ? hasFoundation(cx, cz) : tileActive(cx, cz, L));
const hasFoundation = (cx, cz) => FOUND.some((t) => pieces.has(keyOf(t, 0, cx * T, cz * T, 0)));

// ---------- structural physics (frame kit) ----------
var structural = (activeSave?.mode || 'creative') === 'structural', idxCache = null;
const ROLE = { fpost: 'post', fbeam: 'topbeam', fsill: 'sill', fwall: 'wall', fdoor: 'wall', fwin: 'wall', fhalf: 'wall', ffloor: 'floor', froof: 'roof', fflat: 'roof' };
const ROLE_CAT = { Walls: 'wall', 'Tall Walls': 'wall', 'Arches & Beams': 'wall', Floors: 'floor', Platforms: 'floor', Roofs: 'roof', Slopes: 'roof', 'Domes & Spires': 'roof', Supports: 'post' };
const FRAMESET = new Set(Object.keys(ROLE));
const roleCache = {};
function roleOf(t) {
  if (t in roleCache) return roleCache[t];
  let r = ROLE[t] || null;
  if (!r) {
    const cat = CATS.find((c) => c[1].includes(t)), want = cat && ROLE_CAT[cat[0]], si = want && snapInfo(t);
    if (want === 'wall' && si?.kind === 'edge') r = 'wall';
    else if (want === 'post' && si?.kind === 'corner') r = 'post';
    else if ((want === 'floor' || want === 'roof') && !si) r = want;
  }
  return (roleCache[t] = r);
}
// pieces placed in Structural mode carry cu.p and obey physics; pieces placed in Creative mode stay anchored
const physCu = (type, cu) => (structural && roleOf(type) ? { ...(cu || {}), p: 1 } : cu);
const ROLE_W = { post: 1, topbeam: 1.2, sill: 1.2, wall: 1.6, floor: 2.4, roof: 2.4 };
const ROLE_RANK = { roof: 9, wall: 8, topbeam: 7, floor: 6, post: 5, sill: 4 };
// weight per unit and strength per material: heavy stone needs strong frames, thatch and wood are light but weak
const MAT_DENS = { thatch: 0.3, wood: 0.6, stone: 2, metal: 1.6, concrete: 2.2, glass: 0.8, brick: 1.8, plaster: 0.8, 'dark wood': 0.65, marble: 2.4, terracotta: 1, slate: 1.5, copper: 1.4, gold: 3, sandstone: 1.9, mossy: 0.7, tile: 1, ice: 0.9 };
const MAT_STR = { thatch: 3, wood: 12, stone: 40, metal: 60, concrete: 50, glass: 2, brick: 30, plaster: 8, 'dark wood': 14, marble: 35, terracotta: 10, slate: 25, copper: 40, gold: 20, sandstone: 28, mossy: 10, tile: 12, ice: 6 };
const strOf = (i) => MAT_STR[MATERIALS[i].name] ?? 10;
const ck = (x, z) => `${Math.round(x)}|${Math.round(z)}`;
const parseCk = (k) => k.split('|').map(Number);
const alongX = (Pz) => ((Math.round(Pz) % T) + T) % T === 2;
const tileEdges = (cx, cz) => [ck(cx * T, cz * T + 2), ck(cx * T, cz * T - 2), ck(cx * T + 2, cz * T), ck(cx * T - 2, cz * T)];
const cornerEdges = (c) => { const [x, z] = parseCk(c); return [ck(x - 2, z), ck(x + 2, z), ck(x, z - 2), ck(x, z + 2)]; };
const groundCorner = (c) => { const [x, z] = parseCk(c); return [[-2, -2], [-2, 2], [2, -2], [2, 2]].some(([a, b]) => hasFoundation(cellOf(x + a), cellOf(z + b))); };
const groundEdge = (e) => {
  const [x, z] = parseCk(e);
  return (alongX(z) ? [[cellOf(x), cellOf(z - 2)], [cellOf(x), cellOf(z + 2)]] : [[cellOf(x - 2), cellOf(z)], [cellOf(x + 2), cellOf(z)]]).some(([a, b]) => hasFoundation(a, b));
};
function geomFor(type, x, z, level, pv) {
  const role = roleOf(type); if (!role) return null;
  if (role === 'floor' || role === 'roof') return { role, L: level, cell: [cellOf(x), cellOf(z)] };
  if (pv !== 2) return null;
  const q = snapInfo(type)?.q; if (!q) return null;
  const Px = x + q.x, Pz = z + q.z;
  if (role === 'post') return { role, L: level, c: ck(Px, Pz) };
  const ax = alongX(Pz);
  return { role, L: level, e: ck(Px, Pz), ends: ax ? [ck(Px - 2, Pz), ck(Px + 2, Pz)] : [ck(Px, Pz - 2), ck(Px, Pz + 2)] };
}
function getIdx() {
  if (idxCache) return idxCache;
  const I = { posts: new Map(), tops: new Map(), sills: new Map(), floors: new Map(), roofs: new Map(), list: [] };
  for (const p of pieces.values()) {
    if (!FRAMESET.has(p.type) && !p.cu?.p) continue;
    const g = geomFor(p.type, p.x, p.z, p.level, p.pv); if (!g) continue;
    p.st = g; I.list.push(p);
    if (g.role === 'post') I.posts.set(g.L + '|' + g.c, p);
    else if (g.role === 'topbeam') I.tops.set(g.L + '|' + g.e, p);
    else if (g.role === 'sill') I.sills.set(g.L + '|' + g.e, p);
    else if (g.role === 'floor') I.floors.set(g.L + '|' + g.cell.join('|'), p);
    else if (g.role === 'roof') I.roofs.set(g.L + '|' + g.cell.join('|'), p);
  }
  return (idxCache = I);
}
// null when the piece is properly supported by what ok() accepts, otherwise the reason it is not
function check(I, g, str, ok) {
  const { role, L } = g, has = (m, k) => { const q = m.get(k); return !!q && ok(q); };
  const plat = (l, e) => has(I.sills, l + '|' + e) || has(I.tops, (l - 1) + '|' + e);
  switch (role) {
    case 'post':
      if (L === 0 && groundCorner(g.c)) return null;
      if (has(I.posts, (L - 1) + '|' + g.c) || cornerEdges(g.c).some((e) => plat(L, e))) return null;
      return 'Posts stand on a foundation, on a post below, or on a floor beam';
    case 'sill':
      if (L === 0) return groundEdge(g.e) ? null : 'Ground sill beams need a foundation under the edge';
      return has(I.tops, (L - 1) + '|' + g.e) || g.ends.every((c) => has(I.posts, (L - 1) + '|' + c)) ? null : 'Sill beams rest on a beam or two posts below';
    case 'topbeam': {
      const n = g.ends.filter((c) => has(I.posts, L + '|' + c)).length;
      if (n === 2 || (n === 1 && str >= 50)) return null;
      return n === 1 ? 'Beams need a post at BOTH ends (metal or concrete can cantilever)' : 'Beams rest on posts at their ends';
    }
    case 'wall': return g.ends.every((c) => has(I.posts, L + '|' + c)) ? null : 'Panels fit between two posts';
    case 'floor':
      if (L === 0 && hasFoundation(...g.cell)) return null;
      return tileEdges(...g.cell).filter((e) => plat(L, e)).length >= 2 ? null : 'Floor panels need frame beams on at least two sides';
    case 'roof': return tileEdges(...g.cell).filter((e) => has(I.tops, L + '|' + e)).length >= 2 ? null : 'Roof panels need top beams on at least two sides';
  }
  return null;
}
function placeRule(type, x, z, rot, pv, level, cu) {
  if (!structural) return null;
  const role = roleOf(type); if (!role) return null;
  if (cu && ((cu.s && cu.s.some((v) => v !== 1)) || cu.y)) return 'Load-bearing pieces keep their standard size and height in Structural mode (J = Creative)';
  if (role !== 'floor' && role !== 'roof' && pv !== 2) return 'Turn snapping on (G): frame pieces lock to tile corners and edges';
  const g = geomFor(type, x, z, level, pv); if (!g) return null;
  return check(getIdx(), g, strOf(matFor(type)), () => true);
}
function analyze() {
  const I = getIdx(), sup = new Set(), ok = (q) => sup.has(q);
  for (let it = 0, ch = true; ch && it < 60; it++) {
    ch = false;
    for (const p of I.list) if (!sup.has(p) && check(I, p.st, strOf(p.matIdx), ok) === null) { sup.add(p); ch = true; }
  }
  const load = new Map(), ratio = new Map();
  const order = I.list.filter((p) => sup.has(p)).sort((a, b) => (b.st.L * 10 + ROLE_RANK[b.st.role]) - (a.st.L * 10 + ROLE_RANK[a.st.role]));
  const give = (list, v) => { for (const q of list) load.set(q, (load.get(q) || 0) + v / list.length); };
  const got = (m, k) => { const q = m.get(k); return q && sup.has(q) ? q : null; };
  for (const p of order) {
    const g = p.st, nm = MATERIALS[p.matIdx].name, tot = ROLE_W[g.role] * (MAT_DENS[nm] ?? 1) + (load.get(p) || 0);
    let sp = [];
    if (g.role === 'floor') sp = tileEdges(...g.cell).map((e) => got(I.sills, g.L + '|' + e) || got(I.tops, (g.L - 1) + '|' + e)).filter(Boolean);
    else if (g.role === 'roof') sp = tileEdges(...g.cell).map((e) => got(I.tops, g.L + '|' + e)).filter(Boolean);
    else if (g.role === 'wall' || g.role === 'topbeam') sp = g.ends.map((c) => got(I.posts, g.L + '|' + c)).filter(Boolean);
    else if (g.role === 'post') { const b = got(I.posts, (g.L - 1) + '|' + g.c); sp = b ? [b] : cornerEdges(g.c).map((e) => got(I.sills, g.L + '|' + e) || got(I.tops, (g.L - 1) + '|' + e)).filter(Boolean); }
    else if (g.role === 'sill' && g.L > 0) { const t = got(I.tops, (g.L - 1) + '|' + g.e); sp = t ? [t] : g.ends.map((c) => got(I.posts, (g.L - 1) + '|' + c)).filter(Boolean); }
    give(sp, tot);
    if (g.role === 'post' || g.role === 'topbeam' || (g.role === 'sill' && g.L > 0)) ratio.set(p, tot / ((MAT_STR[nm] ?? 10) * (g.role === 'post' ? 1 : 1.5)));
  }
  return { sup, ratio, fail: I.list.filter((p) => !sup.has(p) || (ratio.get(p) ?? 0) > 1) };
}
// falling pieces (visual debris; the structure itself is removed from the build)
const debris = [];
function spawnDebris(p) {
  const g = buildGroup(p.type, tintMat(p.matIdx, p.cu?.t), false);
  g.position.copy(p.group.position); g.rotation.copy(p.group.rotation); g.scale.copy(p.group.scale);
  scene.add(g);
  debris.push({ g, vy: 0, vx: (Math.random() - 0.5) * 1.6, vz: (Math.random() - 0.5) * 1.6, sp: [(Math.random() - 0.5) * 2, (Math.random() - 0.5), (Math.random() - 0.5) * 2], t: 0, landed: false });
  while (debris.length > 150) scene.remove(debris.shift().g);
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i], g = d.g; d.t += dt;
    if (!d.landed) {
      d.vy -= 22 * dt;
      g.position.x += d.vx * dt; g.position.z += d.vz * dt; g.position.y += d.vy * dt;
      g.rotation.x += d.sp[0] * dt; g.rotation.y += d.sp[1] * dt; g.rotation.z += d.sp[2] * dt;
      const gr = groundAt(g.position.x, g.position.z, g.position.y + 0.2);
      if (gr > -Infinity && g.position.y <= gr) { g.position.y = gr; d.landed = true; d.t = 0; }
      else if (g.position.y < -14) d.t = 99;
    }
    if (d.t > (d.landed ? 6 : 20)) { scene.remove(g); debris.splice(i, 1); }
  }
}
let settleT = 0;
function settleSoon(ms = 350) { if (!structural || loading) return; clearTimeout(settleT); settleT = setTimeout(settle, ms); }
function settle() {
  if (!structural) return;
  const { fail } = analyze();
  if (!fail.length) return;
  const unsup = fail.length;
  for (const p of fail) { spawnDebris(p); removePiece(p); }
  commit([], fail);
  toast(`Structure failed: ${unsup} piece${unsup > 1 ? 's' : ''} fell (unsupported or overloaded). Ctrl+Z puts them back; press K to see stress.`);
  settleSoon(500);      // pieces that depended on them may fall next
}

// ---------- stability overlay (stress colours) ----------
var stabOn = false;
const STAB_COL = [0x5fd16a, 0xf0d34a, 0xf08a3a, 0xe5483f];
const stabMats = STAB_COL.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }));
function stabDist() {
  const dist = new Map(), levels = new Set([...decks].map((k) => +k.split('|')[0]));
  for (const L of [...levels].sort((a, b) => a - b)) {
    const q = [];
    for (const k of decks) {
      const [l, cx, cz] = k.split('|').map(Number);
      if (l === L && (L === 0 || supBelow(cx, cz, L))) { dist.set(k, 0); q.push([cx, cz]); }
    }
    for (let i = 0; i < q.length; i++) {
      const [cx, cz] = q[i], d = dist.get(`${L}|${cx}|${cz}`);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${L}|${cx + a}|${cz + b}`;
        if (decks.has(k) && !dist.has(k)) { dist.set(k, d + 1); q.push([cx + a, cz + b]); }
      }
    }
  }
  return dist;
}
function stabIndex(p, dist, an) {
  if (an && (FRAMESET.has(p.type) || p.cu?.p) && roleOf(p.type)) {
    if (!an.sup.has(p)) return 3;
    const r = an.ratio.get(p);
    return r === undefined || r < 0.5 ? 0 : r < 0.8 ? 1 : r < 1 ? 2 : 3;
  }
  if (p.level === 0) return 0;
  let tiles;
  const si = p.pv === 2 && snapInfo(p.type);
  if (si) {
    const px = p.x + si.q.x, pz = p.z + si.q.z, c0x = Math.floor(px / T + 0.5), c0z = Math.floor(pz / T + 0.5);
    tiles = [[c0x, c0z], [c0x - 1, c0z], [c0x, c0z - 1], [c0x - 1, c0z - 1]];
  } else tiles = [[cellOf(p.x), cellOf(p.z)]];
  let best = Infinity;
  for (const [cx, cz] of tiles) {
    const d = dist.get(`${p.level}|${cx}|${cz}`);
    if (d !== undefined) best = Math.min(best, d);
    else if (supBelow(cx, cz, p.level)) best = 0;
  }
  return best === Infinity ? 3 : Math.min(3, best);
}
function applyStab() {
  const dist = stabOn ? stabDist() : null, an = stabOn && structural ? analyze() : null;
  for (const p of pieces.values()) {
    const ci = stabOn ? stabIndex(p, dist, an) : -1;
    p.group.traverse((o) => {
      if (!o.isMesh) return;
      if (ci >= 0) { if (o.userData.om === undefined) o.userData.om = o.material; o.material = stabMats[ci]; }
      else if (o.userData.om !== undefined) { o.material = o.userData.om; delete o.userData.om; }
    });
  }
}
function toggleStab() {
  stabOn = !stabOn; applyStab();
  toast(stabOn ? 'Stress view ON: green = light load, yellow/orange = heavily loaded, red = will fail or is unsupported.' : 'Stress view off');
}

// ---------- freeform strands ----------
const strands = new Map();
var free = null;                      // set below; `var` so early calls to cancelFree are safe
const V3 = THREE.Vector3;
function strandBasis(a, b) {
  const d = b.clone().sub(a), L = d.length(); d.normalize();
  const up = new V3(0, 1, 0); if (Math.abs(d.y) > 0.98) up.set(1, 0, 0);
  const Y = up.sub(d.clone().multiplyScalar(up.dot(d))).normalize();
  return { d, Y, Z: new V3().crossVectors(d, Y), L };
}
const r2 = (v) => Math.round(v * 100) / 100;
function addStrand(kind, a, b, matIdx) {
  a = new V3(...a); b = new V3(...b);
  const f = FREE[kind]; if (!f) return;
  const key = `S|${kind}|${[a.x, a.y, a.z, b.x, b.y, b.z].map(r2).join(',')}`;
  if (strands.has(key)) return;
  const { d, Y, Z, L } = strandBasis(a, b);
  if (L < 0.2) return;
  const mesh = new THREE.Mesh(f.geo(L), MATERIALS[matIdx].mat);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(d, Y, Z).setPosition(a.clone().add(b).multiplyScalar(0.5));
  mesh.castShadow = !MATERIALS[matIdx].glass; mesh.receiveShadow = true;
  const group = new THREE.Group(); group.add(mesh);
  const cols = [];
  if (f.cols) {
    const n = Math.max(1, Math.ceil(L / 0.6)), h = f.cols;
    for (let i = 0; i <= n; i++) {
      const P = a.clone().lerp(b, i / n);
      cols.push({ min: new V3(P.x - h, P.y - (f.tall ? 0 : h), P.z - h), max: new V3(P.x + h, P.y + (f.tall || h), P.z + h) });
    }
  }
  let tris = null;
  if (f.top) {
    const [ty, w] = f.top, o = Y.clone().multiplyScalar(ty), zz = Z.clone().multiplyScalar(w);
    const P = (p, s) => p.clone().add(o).addScaledVector(zz, s).toArray();
    tris = [[P(a, 1), P(b, 1), P(b, -1)], [P(a, 1), P(b, -1), P(a, -1)]];
  }
  const st = { strand: true, kind, a, b, matIdx, key, group, cols, tris };
  mesh.userData.piece = st;
  scene.add(group);
  strands.set(key, st);
  rebuildIndexes();
  scheduleSave();
  return st;
}
function removeStrand(st) {
  scene.remove(st.group);
  st.group.traverse((o) => o.geometry && o.geometry.dispose());
  strands.delete(st.key);
  rebuildIndexes();
  scheduleSave();
}

// ---------- toast ----------
const toastEl = document.createElement('div'); toastEl.id = 'toast'; document.body.appendChild(toastEl);
let toastTimer = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.style.opacity = 0; }, 2600); }

// ---------- bytes <-> base64 ----------
function b64FromBytes(u8) { let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(bin); }
function bytesFromB64(b) { const bin = atob(b), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

// ---------- sculptable terrain: streamed 64 m chunks, build and sculpt anywhere ----------
// Heights live on a 1 m vertex grid. A chunk owns 65x65 vertices (edges shared with neighbours).
// Only chunks you have sculpted are stored in the save; everything else is regenerated from the biome.
const CS = 64, CN = CS + 1, OPEN = !!env.open, LOAD_R = 4, TBASE = -6;
const store = new Map();        // chunk key -> { cx, cz, h: Float32Array(CN*CN), mod }
const tmeshes = new Map();      // chunk key -> Mesh
const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
function islandH(x, z) {        // the lake's little islands
  let best = -6;
  for (const [bx, bz, R, pk] of [[44, -6, 16, 2.6], [-40, 28, 12, 1.6], [8, -50, 10, 2.0]]) {
    const d = Math.hypot(x - bx, z - bz);
    if (d >= R) continue;
    const t = d / R, f = -4 + (pk + 4) * (1 - t * t * (3 - 2 * t));
    if (f > best) best = f;
  }
  return best;
}
const baseH = env.fieldHeight ? (x, z) => Math.max(-60, Math.min(300, env.fieldHeight(x, z))) : islandH;
function getH(gx, gz) {
  const c = store.get(ckey(Math.floor(gx / CS), Math.floor(gz / CS)));
  return c ? c.h[(gz - c.cz * CS) * CN + (gx - c.cx * CS)] : baseH(gx, gz);
}
function chunkData(cx, cz) {
  const k = ckey(cx, cz);
  let c = store.get(k);
  if (!c) {
    c = { cx, cz, mod: false, h: new Float32Array(CN * CN) };
    for (let iz = 0; iz < CN; iz++) for (let ix = 0; ix < CN; ix++) c.h[iz * CN + ix] = getH(cx * CS + ix, cz * CS + iz);
    store.set(k, c);
  }
  return c;
}
function setH(gx, gz, v) {      // writes every chunk that contains this vertex
  const cx = Math.floor(gx / CS), cz = Math.floor(gz / CS), lx = gx - cx * CS, lz = gz - cz * CS;
  for (const [dx, dz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    if ((dx && lx) || (dz && lz)) continue;
    const c = chunkData(cx + dx, cz + dz);
    c.h[(gz - c.cz * CS) * CN + (gx - c.cx * CS)] = v; c.mod = true;
  }
}
function terrainH(x, z) {
  const gx = Math.floor(x), gz = Math.floor(z), u = x - gx, v = z - gz;
  return (getH(gx, gz) * (1 - u) + getH(gx + 1, gz) * u) * (1 - v) + (getH(gx, gz + 1) * (1 - u) + getH(gx + 1, gz + 1) * u) * v;
}
const landOK = (cx, cz, type) => { const h = terrainH(cx * T, cz * T), r = PIECES[type]?.stilt; return r ? h >= r[0] && h <= r[1] : h >= -0.5 && h <= 0.6; };

renderer.localClippingEnabled = true;
const tGroup = new THREE.Group(); scene.add(tGroup);
const tMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), 1)] });
if (!env.clip) tMat.clippingPlanes = [];
if (env.detail) tMat.map = env.detail;
const tIndex = (() => { const a = []; for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) { const i = z * CN + x; a.push(i, i + CN, i + 1, i + 1, i + CN, i + CN + 1); } return new THREE.BufferAttribute(new Uint32Array(a), 1); })();
const _c = new THREE.Color();
function buildChunkMesh(cx, cz) {
  const k = ckey(cx, cz);
  let m = tmeshes.get(k), g;
  if (!m) {
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CN * CN * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(CN * CN * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CN * CN * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(CN * CN * 2), 2));
    g.setIndex(tIndex);
    m = new THREE.Mesh(g, tMat); m.receiveShadow = true; m.userData.cx = cx; m.userData.cz = cz;
    tGroup.add(m); tmeshes.set(k, m);
  } else g = m.geometry;
  const c = chunkData(cx, cz), pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, uv = g.attributes.uv;
  for (let iz = 0; iz < CN; iz++) for (let ix = 0; ix < CN; ix++) {
    const i = iz * CN + ix, gx = cx * CS + ix, gz = cz * CS + iz, h = c.h[i];
    const dx = (getH(gx + 1, gz) - getH(gx - 1, gz)) / 2, dz = (getH(gx, gz + 1) - getH(gx, gz - 1)) / 2;
    pos.setXYZ(i, gx, h, gz);
    const il = 1 / Math.hypot(dx, 1, dz); nor.setXYZ(i, -dx * il, il, -dz * il);
    uv.setXY(i, gx / 12, gz / 12);
    env.tint(h, Math.abs(dx) + Math.abs(dz), _c); col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  pos.needsUpdate = nor.needsUpdate = col.needsUpdate = uv.needsUpdate = true;
  g.computeBoundingSphere(); g.computeBoundingBox();
}
function unloadChunk(k) {
  const m = tmeshes.get(k); if (!m) return;
  tGroup.remove(m); m.geometry.dispose(); tmeshes.delete(k);
  const c = store.get(k); if (c && !c.mod) store.delete(k);
}
const refreshChunksAround = (gx0, gz0, gx1, gz1) => {   // rebuild every loaded chunk whose vertices (or neighbours) changed
  for (let cz = Math.floor((gz0 - 1) / CS); cz <= Math.floor((gz1 + 1) / CS); cz++) for (let cx = Math.floor((gx0 - 1) / CS); cx <= Math.floor((gx1 + 1) / CS); cx++) if (tmeshes.has(ckey(cx, cz))) buildChunkMesh(cx, cz);
};
// which chunks should exist around the camera; non-open biomes keep a fixed 4x4 patch (-128..128)
let holeKey = '';
function wantRange() {
  if (!OPEN) return [-2, -2, 1, 1];
  const cx = Math.floor(camera.position.x / CS), cz = Math.floor(camera.position.z / CS);
  return [cx - LOAD_R, cz - LOAD_R, cx + LOAD_R, cz + LOAD_R];
}
function streamTerrain(budget = 3) {
  const [x0, z0, x1, z1] = wantRange();
  const want = [];
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) if (!tmeshes.has(ckey(cx, cz))) want.push([cx, cz, Math.hypot(cx - (x0 + x1) / 2, cz - (z0 + z1) / 2)]);
  want.sort((a, b) => a[2] - b[2]);
  for (let i = 0; i < Math.min(budget, want.length); i++) buildChunkMesh(want[i][0], want[i][1]);
  for (const [k, m] of [...tmeshes]) {      // drop chunks well outside the window
    const { cx, cz } = m.userData;
    if (cx < x0 - 1 || cx > x1 + 1 || cz < z0 - 1 || cz > z1 + 1) unloadChunk(k);
  }
  // the distant land is cut away exactly where chunks are loaded
  let full = true;
  for (let cz = z0; cz <= z1 && full; cz++) for (let cx = x0; cx <= x1; cx++) if (!tmeshes.has(ckey(cx, cz))) { full = false; break; }
  if (full) {
    const hk = [x0, z0, x1, z1].join();
    if (hk !== holeKey) { holeKey = hk; env.setHole?.(x0 * CS, z0 * CS, (x1 + 1) * CS, (z1 + 1) * CS); }
  }
}

// saving: only chunks that were sculpted
const q16 = (h) => Math.round(h * 50);
function terrainB64() {
  const out = {};
  for (const c of store.values()) if (c.mod) out[c.cx + ',' + c.cz] = b64FromBytes(new Uint8Array(Int16Array.from(c.h, q16).buffer));
  return JSON.stringify({ v: 2, c: out });
}
function setTerrainFromB64(b) {
  store.clear(); for (const k of [...tmeshes.keys()]) unloadChunk(k);
  let o = null; try { o = b && b[0] === '{' ? JSON.parse(b) : null; } catch {}
  if (o?.c) {
    for (const [k, s] of Object.entries(o.c)) {
      const [cx, cz] = k.split(',').map(Number), i16 = new Int16Array(bytesFromB64(s).buffer);
      if (i16.length !== CN * CN) continue;
      store.set(ckey(cx, cz), { cx, cz, mod: true, h: Float32Array.from(i16, (v) => v / 50) });
    }
    return;
  }
  const i16 = b && new Int16Array(bytesFromB64(b).buffer);      // v1: one 193x193 field centred on the origin
  if (!i16 || i16.length !== 193 * 193) return;
  const leg = (gx, gz) => { const ix = gx + 96, iz = gz + 96; return ix < 0 || iz < 0 || ix > 192 || iz > 192 ? null : i16[iz * 193 + ix] / 50; };
  for (let cz = -2; cz <= 1; cz++) for (let cx = -2; cx <= 1; cx++) {
    const c = { cx, cz, mod: false, h: new Float32Array(CN * CN) };
    let diff = 0;
    for (let iz = 0; iz < CN; iz++) for (let ix = 0; ix < CN; ix++) {
      const gx = cx * CS + ix, gz = cz * CS + iz, l = leg(gx, gz), bh = baseH(gx, gz), v = l ?? bh;
      c.h[iz * CN + ix] = v; diff = Math.max(diff, Math.abs(v - bh));
    }
    if (diff > 0.03) { c.mod = true; store.set(ckey(cx, cz), c); }
  }
}
function saveTerrain() { if (activeSave) SAVES.writeTerrain(activeSave.id, terrainB64()); }
{ const saved = activeSave && SAVES.readTerrain(activeSave.id); if (saved) setTerrainFromB64(saved); }
for (let i = 0; i < 40; i++) streamTerrain(99);

// brush tools
const brush = { r: 6, on: false };
const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
ring.renderOrder = 9; ring.visible = false; scene.add(ring);
const isTool = () => !!PIECES[bp.type].tool;
let toolPt = null;
function toolAim() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hit = raycaster.intersectObjects(tGroup.children, false)[0];
  if (hit && hit.point.y > -0.9) return hit.point;
  _plane.constant = 0.55;
  return raycaster.ray.intersectPlane(_plane, new THREE.Vector3());
}
function updateTool() {
  bp.ghost.visible = false; bp.visible = false;
  toolPt = toolAim();
  ring.visible = !!toolPt;
  if (toolPt) { ring.position.set(toolPt.x, Math.max(terrainH(toolPt.x, toolPt.z), -0.5) + 0.08, toolPt.z); ring.scale.setScalar(brush.r); }
}
function sculptStep(dt) {
  if (!brush.on || !isTool() || !toolPt) return;
  const mode = PIECES[bp.type].tool, r = brush.r;
  const x0 = Math.floor(toolPt.x - r), x1 = Math.ceil(toolPt.x + r), z0 = Math.floor(toolPt.z - r), z1 = Math.ceil(toolPt.z + r);
  const edits = [], floorH = env.fieldHeight ? -20 : TBASE;
  for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
    const d = Math.hypot(gx - toolPt.x, gz - toolPt.z);
    if (d >= r) continue;
    let w = 1 - d / r; w = w * w * (3 - 2 * w);
    const h = getH(gx, gz);
    if (mode === 'raise') edits.push([gx, gz, Math.min(Math.max(h, 8), h + 6 * dt * w)]);
    else if (mode === 'lower') edits.push([gx, gz, Math.max(Math.min(h, floorH), h - 6 * dt * w)]);
    else if (mode === 'flat') edits.push([gx, gz, h + ((brush.flatTo || 0) - h) * Math.min(1, 8 * dt * w)]);
    else edits.push([gx, gz, h + ((getH(gx - 1, gz) + getH(gx + 1, gz) + getH(gx, gz - 1) + getH(gx, gz + 1)) / 4 - h) * Math.min(1, 8 * dt * w)]);
  }
  for (const [gx, gz, v] of edits) setH(gx, gz, v);
  refreshChunksAround(x0, z0, x1, z1);
}

// ---------- terraforming: foundations level the ground they stand on ----------
// Foundations sit at build level (y = 0). Placing one grades the land: the footprint is cut/filled flat and a smooth skirt
// blends it back into the surrounding ground. Stilt platforms and footings are the "no digging" alternative.
const MAX_GRADE = 6, GRADE_TARGET = -0.12;
let autoGrade = true;
const grades = (t) => !!PIECES[t]?.found && !PIECES[t].stilt && !/pool|pier/.test(t);
function gradeRange(cx, cz) {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const h = terrainH(cx * T - 2 + i, cz * T - 2 + j); if (h < lo) lo = h; if (h > hi) hi = h; }
  return [lo, hi];
}
function groundWhy(cx, cz, type) {      // '' when the ground is fine, otherwise the reason it is not
  if (!grades(type) || !autoGrade) return landOK(cx, cz, type) ? '' : 'Uneven ground. Try a Stilt Platform or Footing, or turn auto-level on (N)';
  const [lo, hi] = gradeRange(cx, cz);
  if (hi > MAX_GRADE) return `Ground is ${hi.toFixed(0)} m above build level, too much to level (max ${MAX_GRADE} m)`;
  if (lo < -MAX_GRADE) return `Ground is ${(-lo).toFixed(0)} m below build level, too much to fill (max ${MAX_GRADE} m)`;
  return '';
}
function gradeTile(cx, cz) {
  const x0 = cx * T - 2, x1 = cx * T + 2, z0 = cz * T - 2, z1 = cz * T + 2, T0 = GRADE_TARGET;
  const [lo, hi] = gradeRange(cx, cz), D = Math.min(16, Math.max(3, Math.max(Math.abs(hi - T0), Math.abs(lo - T0)) * 2.5));
  const gx0 = Math.floor(x0 - D), gx1 = Math.ceil(x1 + D), gz0 = Math.floor(z0 - D), gz1 = Math.ceil(z1 + D), edits = [];
  for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
    const d = Math.hypot(Math.max(x0 - gx, 0, gx - x1), Math.max(z0 - gz, 0, gz - z1));
    if (d >= D) continue;
    if (d > 0 && hasFoundation(cellOf(gx), cellOf(gz))) continue;     // never disturb ground that is already levelled under another foundation
    const h = getH(gx, gz); let s = d / D; s = s * s * (3 - 2 * s);
    edits.push([gx, gz, T0 + (h - T0) * s]);
  }
  for (const [gx, gz, v] of edits) setH(gx, gz, v);
  refreshChunksAround(gx0, gz0, gx1, gz1);
}
function gradePieces(list) {
  if (!autoGrade) return;
  let any = false;
  for (const p of list) if (p && !p.strand && grades(p.type)) { gradeTile(cellOf(p.x), cellOf(p.z)); any = true; }
  if (any) saveTerrain();
}

// ---------- undo / redo ----------
const hist = [], redoS = [];
const entryOf = (p) => (p.strand ? ['S', p.kind, ...p.a.toArray(), ...p.b.toArray(), p.matIdx] : [p.type, p.x, p.z, p.level, p.rot, p.matIdx, p.pv, ...(p.cu ? [p.cu] : [])]);
const restoreEntry = (e) => (e[0] === 'S' ? addStrand(e[1], [e[2], e[3], e[4]], [e[5], e[6], e[7]], e[8]) : PIECES[e[0]] ? addPiece(e[0], e[1], e[2], e[3], e[4], e[5], e[6] === 1 || e[6] === 2 ? e[6] : 0, e[7]) : null);
const byKey = (k) => pieces.get(k) || strands.get(k);
function commit(added, removed) {
  added = added.filter(Boolean);
  if (!added.length && !removed.length) return;
  hist.push({ add: added.map((p) => p.key), addE: added.map(entryOf), delK: removed.map((p) => p.key), delE: removed.map(entryOf) });
  if (hist.length > 300) hist.shift();
  redoS.length = 0;
}
function undo() {
  const a = hist.pop(); if (!a) return toast('Nothing to undo');
  for (const k of a.add) { const o = byKey(k); if (o) removePiece(o); }
  for (const e of a.delE) restoreEntry(e);
  redoS.push(a); toast('Undo');
}
function redo() {
  const a = redoS.pop(); if (!a) return toast('Nothing to redo');
  for (const k of a.delK) { const o = byKey(k); if (o) removePiece(o); }
  for (const e of a.addE) restoreEntry(e);
  hist.push(a); toast('Redo');
}

// ---------- select, copy, paste ----------
const sel = { a: null, box: null };
const clipState = { clip: null };
const paste = { on: false, k: 0, root: null, ax: 0, az: 0, level: 0 };
function aimInfo() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit) return { x: hit.point.x, z: hit.point.z, y: hit.point.y };
  _plane.constant = 0;
  const pt = raycaster.ray.intersectPlane(_plane, new THREE.Vector3());
  return pt ? { x: pt.x, z: pt.z, y: 0 } : null;
}
sel.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd479, depthTest: false }));
sel.box.renderOrder = 9; sel.box.visible = false; scene.add(sel.box);
function updateSel() {
  const a = aimInfo();
  if (!sel.a || !a) { sel.box.visible = false; return; }
  const cx = cellOf(a.x), cz = cellOf(a.z);
  const x0 = Math.min(sel.a[0], cx) * T - 2, x1 = Math.max(sel.a[0], cx) * T + 2, z0 = Math.min(sel.a[1], cz) * T - 2, z1 = Math.max(sel.a[1], cz) * T + 2;
  sel.box.visible = true;
  sel.box.scale.set(x1 - x0, 14, z1 - z0);
  sel.box.position.set((x0 + x1) / 2, 6, (z0 + z1) / 2);
}
function selectKey() {
  const a = aimInfo(); if (!a) return;
  const c = [cellOf(a.x), cellOf(a.z)];
  if (!sel.a) { sel.a = c; toast('Corner set. Aim at the opposite corner and press Y again.'); return; }
  copyRegion(sel.a, c); sel.a = null; sel.box.visible = false;
}
function copyRegion(a, b) {
  const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]), minZ = Math.min(a[1], b[1]), maxZ = Math.max(a[1], b[1]);
  const X0 = minX * T - 2.01, X1 = maxX * T + 2.01, Z0 = minZ * T - 2.01, Z1 = maxZ * T + 2.01;
  const inb = (x, z) => x >= X0 && x <= X1 && z >= Z0 && z <= Z1;
  const items = [...pieces.values()].filter((p) => { const q = p.pv === 2 ? snapInfo(p.type)?.q : null; return inb(q ? p.x + q.x : p.x, q ? p.z + q.z : p.z); });
  const strs = [...strands.values()].filter((st) => inb(st.a.x, st.a.z) && inb(st.b.x, st.b.z));
  if (!items.length && !strs.length) return toast('Nothing in that box');
  const ax = Math.round((minX + maxX) / 2), az = Math.round((minZ + maxZ) / 2);
  const baseL = items.length ? Math.min(...items.map((p) => p.level)) : 0;
  clipState.clip = {
    items: items.map((p) => ({ t: p.type, x: p.x - ax * T, z: p.z - az * T, rot: p.rot, l: p.level - baseL, m: p.matIdx, pv: p.pv, c: p.cu })),
    strands: strs.map((st) => ({ kind: st.kind, a: [st.a.x - ax * T, st.a.y - baseL * H, st.a.z - az * T], b: [st.b.x - ax * T, st.b.y - baseL * H, st.b.z - az * T], m: st.matIdx })),
  };
  toast(`Copied ${items.length + strs.length} pieces. Press P to paste.`);
}
function baseFromOrigin(type, Ox, Oz, rot, pv, cu = null) {
  if (!pv) return [Ox, Oz];
  const c = (pv === 2 && snapInfo(type)?.q) || pivotOf(type), rc = rotV(scaledV(c, cu), rot);
  return [Ox - c.x + rc.x, Oz - c.z + rc.z];
}
function buildPasteGhost() {
  if (paste.root) scene.remove(paste.root);
  const root = new THREE.Group(), clip = clipState.clip;
  for (const it of clip.items) {
    const g = buildGroup(it.t, ghostOk, false), [ox, oz] = originFor(it.t, it.x, it.z, it.rot, it.pv, it.c);
    g.position.set(ox, it.l * H + (it.c?.y || 0), oz); g.rotation.y = (it.rot * Math.PI) / 2; g.scale.set(...(it.c?.s || [1, 1, 1]));
    g.traverse((o) => o.layers.set(1)); root.add(g);
  }
  for (const sd of clip.strands) {
    const a = new THREE.Vector3(...sd.a), b = new THREE.Vector3(...sd.b), { d, Y, Z, L } = strandBasis(a, b);
    const m = new THREE.Mesh(FREE[sd.kind].geo(L), ghostOk);
    m.matrixAutoUpdate = false; m.matrix.makeBasis(d, Y, Z).setPosition(a.clone().add(b).multiplyScalar(0.5)); m.layers.set(1);
    root.add(m);
  }
  scene.add(root); paste.root = root;
}
function pasteToggle() {
  if (paste.on) return pasteStop();
  if (!clipState.clip) return toast('Copy first: press Y, aim at the opposite corner, press Y');
  cancelFree(); sel.a = null; paste.on = true; paste.k = 0; buildPasteGhost();
  toast('Paste mode: click to stamp, R / wheel rotate, right-click to stop');
}
function pasteStop() { paste.on = false; if (paste.root) { scene.remove(paste.root); paste.root = null; } }
function updatePaste() {
  bp.ghost.visible = false; bp.visible = false; ring.visible = false;
  const a = aimInfo();
  if (!a || !paste.root) { if (paste.root) paste.root.visible = false; return; }
  paste.ax = cellOf(a.x); paste.az = cellOf(a.z);
  paste.level = Math.max(0, Math.floor((a.y + 0.1) / H) + bp.levelOffset);
  paste.root.visible = true;
  paste.root.position.set(paste.ax * T, paste.level * H, paste.az * T);
  paste.root.rotation.y = (paste.k * Math.PI) / 2;
}
function pasteConfirm() {
  const clip = clipState.clip; if (!clip || !paste.root) return;
  const k = paste.k, c = Math.cos((k * Math.PI) / 2), s = Math.sin((k * Math.PI) / 2);
  const rot2 = (x, z) => [x * c + z * s, -x * s + z * c];
  const added = [];
  for (const it of clip.items) {
    const [ox, oz] = originFor(it.t, it.x, it.z, it.rot, it.pv, it.c), [rx, rz] = rot2(ox, oz);
    const nr = (((it.rot + k) % 4) + 4) % 4;
    const [bx, bz] = baseFromOrigin(it.t, paste.ax * T + rx, paste.az * T + rz, nr, it.pv, it.c);
    added.push(addPiece(it.t, bx, bz, it.l + paste.level, nr, it.m, it.pv, it.c));
  }
  for (const sd of clip.strands) {
    const pt = (q) => { const [rx, rz] = rot2(q[0], q[2]); return [paste.ax * T + rx, paste.level * H + q[1], paste.az * T + rz]; };
    added.push(addStrand(sd.kind, pt(sd.a), pt(sd.b), sd.m));
  }
  commit(added, []); settleSoon();
  toast(`Pasted ${added.filter(Boolean).length} pieces`);
}

// ---------- save / load (autosave to localStorage) ----------
const SAVE_KEY = 'peace.world.v1';
let saveTimer = 0, loading = true;
function scheduleSave() {
  if (loading || !activeSave) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
env.setBuiltProvider?.((cellKey) => {   // keeps scatter (cacti, rocks) from growing through your builds
  const set = new Set();
  for (const p of pieces.values()) for (let dx = -8; dx <= 8; dx += 8) for (let dz = -8; dz <= 8; dz += 8) set.add(cellKey(p.ox + dx, p.oz + dz));
  return set;
});
let scatterTimer = 0;
function saveNow() {
  if (loading || !activeSave) return;
  clearTimeout(scatterTimer); scatterTimer = setTimeout(() => env.rescatter?.(), 1500);
  clearTimeout(saveTimer);
  const data = [...pieces.values(), ...strands.values()].map(entryOf);
  if (!SAVES.writeWorld(activeSave.id, data)) toast('Could not save: browser storage is full');
  SAVES.updateSave(activeSave.id, { updated: Date.now(), count: data.length, mode: structural ? 'structural' : 'creative' });
}
function startingPlatform() {
  const made = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) made.push(addPiece('foundation', i * T, j * T, 0, 0, 4));
  gradePieces(made);
}
function loadWorld() {
  const data = activeSave ? SAVES.readWorld(activeSave.id) : null;
  if (Array.isArray(data)) {
    for (const e of data) {
      if (e[0] === 'S') { addStrand(e[1], [e[2], e[3], e[4]], [e[5], e[6], e[7]], e[8]); continue; }
      const [t, x, z, l, r, m, pv] = e;
      if (PIECES[t]) addPiece(t, x, z, l, r, m, pv === 1 || pv === 2 ? pv : 0, e[7]);
    }
  }
}
function newWorld() {
  hist.length = 0; redoS.length = 0;
  for (const p of [...pieces.values()]) removePiece(p);
  for (const st of [...strands.values()]) removeStrand(st);
  scheduleSave();
}
loadWorld();
loading = false;

// ---------- blueprint (ghost) ----------
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
const matFor = (t) => (ROOFSET.has(t) ? bp.matRoof : bp.mat);
const bp = { type: 'wall', rot: 0, flip: 0, useRot: 0, pv: 1, snapDir: null, mat: 2, matRoof: 0, nx: 0, nz: 0, levelOffset: 0, cu: { s: [1, 1, 1], y: 0, t: null }, cuEff: null, freePlace: false, ghost: null, valid: false, x: 0, z: 0, level: 0, visible: false };

var hotbarReady = false;
function setGhostType(type) {
  bp.type = type; bp.pv = 1; bp.snapDir = null; bp.valid = false; bp.visible = false;   // nothing can be placed until the next frame aims the new piece
  if (hotbarReady) renderHotbar();
  if (bp.ghost) scene.remove(bp.ghost);
  bp.ghost = buildGroup(type, ghostMat, false);
  bp.ghost.traverse(object => object.layers.set(1));
  bp.ghost.visible = false;
  scene.add(bp.ghost);
}
setGhostType(HOT[activeSlot]);

const raycaster = new THREE.Raycaster();
raycaster.far = 70;
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _pt = new THREE.Vector3();

let snapOn = true;
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const NEIGH = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// nearest foundation edge / corner to the aimed point -> { cx, cz, dir }
function snapTarget(info, hx, hz, L) {
  const cx0 = cellOf(hx), cz0 = cellOf(hz);
  let best = null, bd = Infinity;
  for (const [ox, oz] of NEIGH) {
    const cx = cx0 + ox, cz = cz0 + oz;
    if (!tileOK(cx, cz, L)) continue;
    const wx = cx * T, wz = cz * T;
    const far = (wx - camera.position.x) ** 2 + (wz - camera.position.z) ** 2;   // tie-break: owner tile farther from you, so the piece faces you
    const cands = [];
    if (info.kind === 'edge') {
      for (const [ex, ez] of DIRS) {
        const dn = Math.abs((hx - (wx + 2 * ex)) * ex + (hz - (wz + 2 * ez)) * ez);
        const along = ex ? Math.abs(hz - wz) : Math.abs(hx - wx);
        cands.push([Math.hypot(Math.max(0, along - 2), dn), [ex, ez]]);
      }
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cands.push([Math.hypot(hx - (wx + 2 * sx), hz - (wz + 2 * sz)), [sx, sz]]);
    }
    for (const [d, dir] of cands) {
      if (d < bd - 1e-4 || (Math.abs(d - bd) <= 1e-4 && best && far > best.far)) { bd = Math.min(d, bd); best = { cx, cz, dir, far }; }
    }
  }
  return best && bd <= 3.5 ? best : null;
}
// placement of a snapped piece on tile (cx,cz) facing `dir`; pv 2 = pivot is the edge/corner point
function snapPlacement(type, info, cx, cz, dir, flip) {
  const q = info.q, u = q.clone().normalize();
  let r = 0;
  for (let k = 0; k < 4; k++) {
    const v = info.kind === 'edge' ? rotV(u, k) : rotV(q, k);
    if (info.kind === 'edge' ? v.x * dir[0] + v.z * dir[1] > 0.9 : v.x * dir[0] > 0 && v.z * dir[1] > 0) { r = k; break; }
  }
  const rq = rotV(q, r);
  return { x: cx * T + rq.x - q.x, z: cz * T + rq.z - q.z, rot: r + (flip ? 2 : 0), pv: 2 };
}
const exists = (type, level, x, z, rot, pv, cu = null) => pieces.has(pieceKey(type, level, x, z, rot, pv) + cuSig(normCu(cu)));

function updateBlueprint() {
  if (paste.on) return updatePaste();
  if (isTool()) { if (free) { free.dot.visible = false; if (free.ghost) free.ghost.visible = false; } return updateTool(); }
  ring.visible = false;
  if (isFree()) return updateFree();
  if (free) { free.dot.visible = false; if (free.ghost) free.ghost.visible = false; free.start = null; }
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  let cx, cz, hx, hz, level = 0, fp = null;
  const foundation = !!PIECES[bp.type].found && !bp.freePlace;
  _plane.constant = foundation ? 0 : -Math.max(0, bp.levelOffset) * H;
  const hit = foundation ? null : raycaster.intersectObjects(pickables, false)[0];
  if (hit) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const p = hit.point.clone().addScaledVector(n, 0.1);
    hx = p.x; hz = p.z; fp = hit.point.clone();
    level = Math.max(0, Math.floor(p.y / H));
  } else if (foundation && raycaster.intersectObjects(tGroup.children, false)[0]) {
    const th = raycaster.intersectObjects(tGroup.children, false)[0].point;
    hx = th.x; hz = th.z; fp = th.clone();
  } else if (raycaster.ray.intersectPlane(_plane, _pt)) {
    hx = _pt.x; hz = _pt.z; fp = _pt.clone();
  } else { bp.visible = false; bp.ghost.visible = false; return; }
  cx = cellOf(hx); cz = cellOf(hz);
  bp.snapDir = null; bp.pv = 1; bp.useRot = bp.rot; bp.why = ''; bp.cuEff = bp.cu;

  if (foundation) {
    bp.x = cx * T; bp.z = cz * T; bp.level = 0; bp.useRot = 0;
    const adj = hasFoundation(cx + 1, cz) || hasFoundation(cx - 1, cz) || hasFoundation(cx, cz + 1) || hasFoundation(cx, cz - 1);
    const gw = adj ? '' : groundWhy(cx, cz, bp.type);
    bp.valid = !gw && !hasFoundation(cx, cz);
    if (gw) bp.why = gw;
    bp.ghost.position.set(bp.x, 0, bp.z);
    bp.ghost.rotation.y = 0;
  } else {
    bp.level = Math.max(0, level + bp.levelOffset);
    const info = snapOn && !bp.freePlace ? snapInfo(bp.type) : null;
    const sp = info && snapTarget(info, hx, hz, bp.level);
    if (bp.freePlace) {
      // Conan / Satisfactory style meshing: the piece goes exactly where you aim (on the freeform grid) and may clip into anything
      const c = pivotOf(bp.type), sn = (v) => q3(Math.round(v / freeStep) * freeStep), py = sn(fp.y);
      bp.level = Math.max(0, Math.floor((py + 1e-3) / H));
      bp.cuEff = { ...bp.cu, y: q3((bp.cu.y || 0) + py - bp.level * H) };
      bp.x = q3(sn(fp.x) - c.x); bp.z = q3(sn(fp.z) - c.z);
      bp.valid = !exists(bp.type, bp.level, bp.x, bp.z, bp.rot, 1, bp.cuEff);
    } else if (sp) {
      const pl = snapPlacement(bp.type, info, sp.cx, sp.cz, sp.dir, bp.flip);
      bp.x = pl.x; bp.z = pl.z; bp.useRot = pl.rot; bp.pv = 2; bp.snapDir = sp.dir;
      cx = sp.cx; cz = sp.cz;
      bp.valid = canPlace(bp.type, cx, cz, bp.level) && !exists(bp.type, bp.level, bp.x, bp.z, bp.useRot, 2, bp.cuEff);
    } else {
      bp.x = q3(cx * T + bp.nx * NUDGE); bp.z = q3(cz * T + bp.nz * NUDGE);
      bp.valid = canPlace(bp.type, cx, cz, bp.level) && !exists(bp.type, bp.level, bp.x, bp.z, bp.rot, 1, bp.cuEff);
    }
    const why = placeRule(bp.type, bp.x, bp.z, bp.useRot, bp.pv, bp.level, bp.cuEff);
    if (why) { bp.valid = false; bp.why = why; }
    const [gx, gz] = originFor(bp.type, bp.x, bp.z, bp.useRot, bp.pv, bp.cuEff);
    bp.ghost.position.set(gx, bp.level * H + (bp.cuEff?.y || 0), gz);
    bp.ghost.rotation.y = (bp.useRot * Math.PI) / 2;
  }
  bp.ghost.scale.set(...bp.cu.s);
  ghostMat.color.set(bp.valid ? 0x55ff88 : 0xff5566);
  bp.cx = cx; bp.cz = cz;
  bp.visible = true;
  bp.ghost.visible = !zoop.on;
}

// ---------- freeform tool ----------
free = { start: null, y: 0, pt: null, ghost: null, dot: null };
free.dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd479, depthTest: false }));
free.dot.renderOrder = 10; free.dot.visible = false; scene.add(free.dot);
const isFree = () => !!PIECES[bp.type].free;
function cancelFree() { if (!free) return; free.start = null; if (free.ghost) free.ghost.visible = false; }
let freeAng = true;     // T toggles: lock freeform directions to 15 degree steps
function angSnap(a, p) {
  const dx = p.x - a.x, dy = p.y - a.y, dz = p.z - a.z, hl = Math.hypot(dx, dz), L = Math.hypot(hl, dy);
  if (L < 0.01) return p;
  const st = Math.PI / 12, yaw = Math.round(Math.atan2(dz, dx) / st) * st, pit = Math.round(Math.atan2(dy, hl) / st) * st, L2 = Math.round(L / freeStep) * freeStep || freeStep;
  return new THREE.Vector3(a.x + Math.cos(pit) * Math.cos(yaw) * L2, a.y + Math.sin(pit) * L2, a.z + Math.cos(pit) * Math.sin(yaw) * L2);
}
function freePoint() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  let pt;
  if (hit) pt = hit.point.clone();
  else { _plane.constant = -free.y; pt = raycaster.ray.intersectPlane(_plane, new THREE.Vector3()); }
  if (!pt) return null;
  pt.set(q3(Math.round(pt.x / freeStep) * freeStep), q3(Math.round(pt.y / freeStep) * freeStep), q3(Math.round(pt.z / freeStep) * freeStep));   // freeform grid
  let bd = 0.6;                                                                            // magnet to existing ends
  for (const st of strands.values()) for (const e of [st.a, st.b]) { const d = e.distanceTo(pt); if (d < bd) { bd = d; pt.copy(e); pt.magnet = true; } }
  return pt;
}
function updateFree() {
  bp.ghost.visible = false; bp.visible = false;
  let pt = freePoint();
  if (pt && free.start && freeAng && !pt.magnet) pt = angSnap(free.start, pt);
  free.pt = pt;
  free.dot.visible = !!pt;
  if (pt) free.dot.position.copy(pt);
  if (!free.ghost) { free.ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat); free.ghost.matrixAutoUpdate = false; free.ghost.frustumCulled = false; free.ghost.layers.set(1); scene.add(free.ghost); }
  if (!free.start || !pt) { free.ghost.visible = false; return; }
  const { d, Y, Z, L } = strandBasis(free.start, pt);
  const ok = L >= 0.2 && L <= 40;
  ghostMat.color.set(ok ? 0x55ff88 : 0xff5566);
  free.ghost.geometry.dispose();
  free.ghost.geometry = FREE[PIECES[bp.type].free].geo(Math.max(L, 0.01));
  free.ghost.matrix.makeBasis(d, Y, Z).setPosition(free.start.clone().add(pt).multiplyScalar(0.5));
  free.ghost.visible = L > 0.01;
}
function freeClick() {
  if (!free.pt) return;
  if (!free.start) { free.start = free.pt.clone(); free.y = free.start.y; return; }
  const L = free.start.distanceTo(free.pt);
  if (L < 0.2 || L > 40) return;
  commit([addStrand(PIECES[bp.type].free, free.start.toArray(), free.pt.toArray(), bp.mat)], []);
  free.start = free.pt.clone(); free.y = free.start.y;     // chain: the next piece starts where this one ended
}

// ---------- retrofit: repaint, swap variant, open into parts ----------
function aimedPiece() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const h = raycaster.intersectObjects(pickables, false)[0];
  return h ? h.object.userData.piece : null;
}
function repaintAimed() {
  const p = aimedPiece(); if (!p) return toast('Aim at a piece to repaint it');
  const m = p.strand || !ROOFSET.has(p.type) ? bp.mat : bp.matRoof;
  if (m === p.matIdx && (p.cu?.t ?? null) === (bp.cu.t ?? null)) return toast('Already painted like that');
  const a = p.a && p.a.toArray(), b = p.b && p.b.toArray();
  removePiece(p);
  const np = p.strand ? addStrand(p.kind, a, b, m) : addPiece(p.type, p.x, p.z, p.level, p.rot, m, p.pv, { ...(p.cu || {}), t: bp.cu.t ?? undefined });
  commit([np], [p]); settleSoon(); toast('Repainted: ' + MATERIALS[m].name);
}
function swapAimed() {
  const p = aimedPiece(); if (!p) return toast('Aim at a piece, hold the variant you want, press Z');
  if (p.strand) {
    if (!isFree()) return toast('Equip a freeform kind (Freeform tab) to swap this strand');
    const a = p.a.toArray(), b = p.b.toArray(), kind = PIECES[bp.type].free;
    removePiece(p); commit([addStrand(kind, a, b, p.matIdx)], [p]); return toast('Swapped to ' + FREE[kind].label);
  }
  const nt = bp.type, np0 = PIECES[nt];
  if (np0.tool || np0.free) return toast('Equip a normal piece to swap into');
  if (nt === p.type) return toast('Already a ' + np0.label);
  if (!!np0.found !== !!PIECES[p.type].found) return toast('Foundations only swap with foundations');
  let x = p.x, z = p.z, rot = p.rot, pv = p.pv;
  if (p.pv === 2) {
    const oi = snapInfo(p.type), ni = snapInfo(nt);
    if (!ni || ni.kind !== oi.kind) return toast('That piece does not fit the same socket');
    const Px = p.x + oi.q.x, Pz = p.z + oi.q.z, dirOf = (info, k) => (info.kind === 'edge' ? rotV(info.q.clone().normalize(), k) : rotV(info.q, k));
    const want = dirOf(oi, p.rot);
    let k2 = -1;
    for (let k = 0; k < 4; k++) { const v = dirOf(ni, k); if (oi.kind === 'edge' ? v.dot(want) > 0.9 : Math.sign(v.x) === Math.sign(want.x) && Math.sign(v.z) === Math.sign(want.z)) { k2 = k; break; } }
    if (k2 < 0) return toast('That piece does not fit the same socket');
    rot = k2; x = q3(Px - ni.q.x); z = q3(Pz - ni.q.z);
  }
  if (exists(nt, p.level, x, z, rot, pv, p.cu)) return toast('That spot already has one');
  removePiece(p);
  commit([addPiece(nt, x, z, p.level, rot, matFor(nt), pv, p.cu)], [p]); settleSoon();
  toast('Swapped to ' + np0.label);
}
function openUp() {
  const p = aimedPiece(); if (!p || p.strand) return toast('Aim at a placed piece to open it into parts');
  const boxes = PIECES[p.type].cols;
  if (!boxes.length) return toast('That piece has no frame to open');
  const sc = p.cu?.s || [1, 1, 1], W = (x, y, z) => { const v = rotV(new V3(x * sc[0], 0, z * sc[2]), p.rot); return [v.x + p.ox, y * sc[1] + p.level * H + (p.cu?.y || 0), v.z + p.oz]; };
  const out = [], add = (kind, a, b) => out.push(addStrand(kind, a, b, p.matIdx));
  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (dy >= 1 && Math.min(dx, dz) < 0.8 && Math.max(dx, dz) >= 1) {            // wall-like: plates + studs every half unit
      const ax = dx >= dz, a0 = ax ? x0 : z0, a1 = ax ? x1 : z1, c = ax ? cz : cx;
      const P = (s, y) => (ax ? W(s, y, c) : W(c, y, s));
      add('stud', P(a0, y0 + 0.05), P(a1, y0 + 0.05));
      add('stud', P(a0, y1 - 0.05), P(a1, y1 - 0.05));
      const n = Math.max(1, Math.round((a1 - a0) / 0.5));
      for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n; add('stud', P(t, y0 + 0.05), P(t, y1 - 0.05)); }
    } else if (dy >= 1) add('beam', W(cx, y0 + 0.01, cz), W(cx, y1, cz));            // post
    else if (dy < 0.5 && Math.min(dx, dz) >= 1) {                                   // floor: joists + rim
      const n = Math.max(1, Math.round(dz / 1));
      for (let i = 0; i <= n; i++) { const z = z0 + (dz * i) / n; add('beam', W(x0, y1 - 0.13, z), W(x1, y1 - 0.13, z)); }
      add('beam', W(x0, y1 - 0.13, z0), W(x0, y1 - 0.13, z1)); add('beam', W(x1, y1 - 0.13, z0), W(x1, y1 - 0.13, z1));
    } else {                                                                         // anything else: outline frame
      const C = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      C.forEach(([x, z], i) => { const [nx, nz] = C[(i + 1) % 4]; add('beam', W(x, y0 + 0.01, z), W(x, y1, z)); add('beam', W(x, y1, z), W(nx, y1, nz)); add('beam', W(x, y0 + 0.01, z), W(nx, y0 + 0.01, nz)); });
    }
    if (out.length > 150) break;
  }
  removePiece(p);
  commit(out, [p]); settleSoon();
  toast(`Opened into ${out.filter(Boolean).length} parts. Right-click to remove any part, Ctrl+Z to undo.`);
}

// ---------- zooping: hold left mouse and drag to repeat a piece along a line (or fill an area) ----------
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
const ghostBad = ghostOk.clone(); ghostBad.color.set(0xff5566);
const AREA = new Set(CATS.filter((c) => ['Foundations', 'Floors', 'Roofs', 'Slopes'].includes(c[0])).flatMap((c) => c[1]).concat(['ffloor', 'froof', 'fflat']));
const ZOOP_MAX = 100;
const zoop = { on: false, cx: 0, cz: 0, level: 0, type: null, snap: null, previews: [], list: [] };
const sgn = (v) => (v < 0 ? -1 : 1);

function zoopPlan() {
  const dx = Math.max(-9, Math.min(9, bp.cx - zoop.cx)), dz = Math.max(-9, Math.min(9, bp.cz - zoop.cz));
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const area = AREA.has(bp.type) !== shift;
  const cells = [];
  if (area) { for (let i = 0; i <= Math.abs(dx); i++) for (let j = 0; j <= Math.abs(dz); j++) cells.push([zoop.cx + i * sgn(dx), zoop.cz + j * sgn(dz)]); }
  else if (Math.abs(dx) >= Math.abs(dz)) { for (let i = 0; i <= Math.abs(dx); i++) cells.push([zoop.cx + i * sgn(dx), zoop.cz]); }
  else { for (let j = 0; j <= Math.abs(dz); j++) cells.push([zoop.cx, zoop.cz + j * sgn(dz)]); }
  const found = !!PIECES[bp.type].found, planned = new Set();
  const info = zoop.snap && snapInfo(bp.type);
  return cells.slice(0, ZOOP_MAX).map(([cx, cz]) => {
    if (info) {
      const pl = snapPlacement(bp.type, info, cx, cz, zoop.snap.dir, zoop.snap.flip);
      return { ...pl, level: zoop.level, cu: bp.cuEff, valid: canPlace(bp.type, cx, cz, zoop.level) && !exists(bp.type, zoop.level, pl.x, pl.z, pl.rot, 2, bp.cuEff) && !placeRule(bp.type, pl.x, pl.z, pl.rot, 2, zoop.level, bp.cuEff) };
    }
    const x = q3(cx * T + (found ? 0 : bp.nx * NUDGE)), z = q3(cz * T + (found ? 0 : bp.nz * NUDGE));
    const rot = found ? 0 : bp.rot, level = found ? 0 : zoop.level;
    let valid;
    if (found) {
      const adj = (a, b) => hasFoundation(a, b) || planned.has(a + ',' + b);
      valid = (adj(cx + 1, cz) || adj(cx - 1, cz) || adj(cx, cz + 1) || adj(cx, cz - 1) || !groundWhy(cx, cz, bp.type)) && !adj(cx, cz);
      if (valid) planned.add(cx + ',' + cz);
    } else valid = canPlace(bp.type, cx, cz, level) && !exists(bp.type, level, x, z, rot, 1, bp.cuEff) && !placeRule(bp.type, x, z, rot, 1, level, bp.cuEff);
    return { x, z, rot, level, valid, pv: 1, cu: bp.cuEff };
  });
}
function clearZoopPreviews() { for (const g of zoop.previews) scene.remove(g); zoop.previews = []; }
function updateZoop() {
  if (!zoop.on || !bp.visible) return;
  if (zoop.type !== bp.type) { zoop.on = false; clearZoopPreviews(); bp.ghost.visible = true; return; }
  zoop.list = zoopPlan();
  while (zoop.previews.length > zoop.list.length) scene.remove(zoop.previews.pop());
  while (zoop.previews.length < zoop.list.length) { const g = bp.ghost.clone(true); scene.add(g); zoop.previews.push(g); }
  zoop.list.forEach((it, i) => {
    const g = zoop.previews[i];
    g.visible = true;
    const [gx, gz] = originFor(zoop.type, it.x, it.z, it.rot, it.pv, it.cu);
    g.position.set(gx, it.level * H + (it.cu?.y || 0), gz); g.scale.copy(bp.ghost.scale);
    g.rotation.y = (it.rot * Math.PI) / 2;
    const m = it.valid ? ghostOk : ghostBad;
    g.traverse((o) => { if (o.isMesh && o.material !== m) o.material = m; });
  });
}
function startZoop() {
  if (!bp.visible) return;
  Object.assign(zoop, { on: true, cx: bp.cx, cz: bp.cz, level: bp.level, type: bp.type, snap: bp.snapDir ? { dir: bp.snapDir, flip: bp.flip } : null });
  bp.ghost.visible = false;
  updateZoop();
}
function cancelZoop() { if (!zoop.on) return; zoop.on = false; clearZoopPreviews(); bp.ghost.visible = true; }
function finishZoop() {
  if (!zoop.on) return;
  const plan = zoop.list.length ? zoop.list : zoopPlan();
  const type = zoop.type;
  cancelZoop();
  const made = [];
  for (const it of plan) if (it.valid) made.push(addPiece(type, it.x, it.z, it.level, it.rot, matFor(type), it.pv, physCu(type, it.cu)));
  commit(made, []);
  gradePieces(made);
  settleSoon();
}

function rotateInput(dir, step = 1) {
  if (snapOn && !bp.freePlace && snapInfo(bp.type)) bp.flip = bp.flip ? 0 : 1;       // snapped pieces: turn to face the other way
  else bp.rot = (((Math.round((bp.rot + dir * step) * 90) / 90) % 4) + 4) % 4;       // quarter turns, kept to whole degrees
  renderHotbar();
}
// middle-click / I: copy the aimed piece's type, material, size and tint into the active slot (Satisfactory-style sampling)
function sampleAimed() {
  const p = aimedPiece(); if (!p) return toast('Aim at a piece to copy its type, material, size and colour');
  if (p.strand) { HOT[activeSlot] = 'free_' + p.kind; saveHot(); setGhostType(HOT[activeSlot]); bp.mat = p.matIdx; renderHotbar(); return toast('Sampled ' + FREE[p.kind].label); }
  HOT[activeSlot] = p.type; saveHot(); setGhostType(p.type);
  if (ROOFSET.has(p.type)) bp.matRoof = p.matIdx; else bp.mat = p.matIdx;
  bp.cu = { s: p.cu?.s ? [...p.cu.s] : [1, 1, 1], y: 0, t: p.cu?.t ?? null };
  if (p.pv !== 2) bp.rot = p.rot;
  renderHotbar(); toast('Sampled ' + PIECES[p.type].label);
}
function confirmPlace() {
  if (!bp.visible || !bp.valid) return;
  const made = addPiece(bp.type, bp.x, bp.z, bp.level, bp.useRot, matFor(bp.type), bp.pv, physCu(bp.type, bp.cuEff));
  commit([made], []);
  gradePieces([made]);
  settleSoon();
}
function removeTarget() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit) { const p = hit.object.userData.piece; removePiece(p); commit([], [p]); settleSoon(); }
}

// ---------- player ----------
const player = { feet: new THREE.Vector3(0, 0, 0), vy: 0, grounded: false, fly: false, yaw: Math.PI / 4, pitch: -0.24 };
camera.position.set(11, 5.3, 11);
player.feet.set(11, Math.max(terrainH(11, 11), 0) + 0.5, 11);   // start on foot

function groundAt(x, z, feet) {
  let g = -Infinity;
  const lim = feet + STEP;
  const th = terrainH(x, z);
  if (th > env.groundMin && th <= lim) g = th;
  for (const c of colliders) {
    if (x > c.min.x - 0.15 && x < c.max.x + 0.15 && z > c.min.z - 0.15 && z < c.max.z + 0.15 && c.max.y <= lim && c.max.y > g) g = c.max.y;
  }
  for (const r of ramps) {
    const l = rotV(new THREE.Vector3(x - r.ox, 0, z - r.oz), -r.rot), sc = r.cu?.s;
    if (sc) { l.x /= sc[0]; l.z /= sc[2]; }
    const ri = PIECES[r.type];
    if (Math.abs(l.x) <= 2 && Math.abs(l.z) <= (ri.hw ?? 2)) {
      const s = r.level * H + (r.cu?.y || 0) + ((sc ? sc[1] : 1) * ((ri.rise ?? H) * (l.x + 2))) / T;
      if (s <= lim && s > g) g = s;
    }
  }
  for (const r of surfs) {
    const l = rotV(new THREE.Vector3(x - r.ox, 0, z - r.oz), -r.rot);
    if (r.cu?.s) { l.x /= r.cu.s[0]; l.z /= r.cu.s[2]; }
    if (Math.abs(l.x) > 2.3 || Math.abs(l.z) > 2.3) continue;
    for (const [a, b, c] of PIECES[r.type].surf) {
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((b[2] - c[2]) * (l.x - c[0]) + (c[0] - b[0]) * (l.z - c[2])) / d;
      const v = ((c[2] - a[2]) * (l.x - c[0]) + (a[0] - c[0]) * (l.z - c[2])) / d;
      const w = 1 - u - v;
      if (u < -0.02 || v < -0.02 || w < -0.02) continue;
      const y = r.level * H + (r.cu?.y || 0) + (r.cu?.s ? r.cu.s[1] : 1) * (u * a[1] + v * b[1] + w * c[1]);
      if (y <= lim && y > g) g = y;
    }
  }
  for (const st of strandSurfs) {
    for (const t of st.tris) {
      const y = triY(t, x, z);
      if (y !== null && y <= lim && y > g) g = y;
    }
  }
  return g;
}
function triY([a, b, c], x, z) {
  const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
  const w = 1 - u - v;
  if (u < -0.02 || v < -0.02 || w < -0.02) return null;
  return u * a[1] + v * b[1] + w * c[1];
}
function blocked(x, z, feet) {
  const lo = feet + STEP, hi = feet + BODY;
  const th = terrainH(x, z);
  if (th > env.groundMin && th > lo) return true;
  for (const c of colliders) {
    if (c.max.y <= lo || c.min.y >= hi) continue;
    if (x > c.min.x - RADIUS && x < c.max.x + RADIUS && z > c.min.z - RADIUS && z < c.max.z + RADIUS) return true;
  }
  return false;
}

function setFly(on) {
  player.fly = on;
  if (!on) { player.feet.set(camera.position.x, camera.position.y - EYE, camera.position.z); player.vy = 0; player.grounded = false; }
}
function toggleFly() {
  if (!settings.flyMode) { toast('Fly mode is off. Turn it on in Settings.'); return; }
  setFly(!player.fly);
}

// ---------- input ----------
const keys = new Set();
const hudEl = document.getElementById('hud');
let locked = false;
let menuOpen = false;

async function enterBuildView() {
  if (document.pointerLockElement === renderer.domElement) return;
  try {
    await renderer.domElement.requestPointerLock();
  } catch {
    if (!document.pointerLockElement && !menuOpen && !titleUI.open) titleUI.show('pause');
  }
}
renderer.domElement.addEventListener('click', () => { if (!locked && !menuOpen && !titleUI.open) enterBuildView(); });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked) { cancelZoop(); cancelFree(); if (brush.on) { brush.on = false; saveTerrain(); } }
  if (locked && titleUI.open) titleUI.hide();
  if (!locked && !menuOpen && !titleUI.open && activeSave) { storeThumb(); saveNow(); titleUI.show('pause'); }
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0022 * settings.sens;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0022 * settings.sens * (settings.invertY ? -1 : 1)));
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) { if (paste.on) pasteConfirm(); else if (isTool()) { brush.on = true; brush.flatTo = e.shiftKey && toolPt ? toolPt.y : 0; } else if (isFree()) freeClick(); else if (bp.freePlace) confirmPlace(); else startZoop(); }
  if (e.button === 1) { e.preventDefault(); sampleAimed(); }
  if (e.button === 2) { if (paste.on) pasteStop(); else if (zoop.on) cancelZoop(); else if (isFree() && free.start) cancelFree(); else removeTarget(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) { finishZoop(); if (brush.on) { brush.on = false; saveTerrain(); } } });
let wheelT = 0;
addEventListener('wheel', (e) => {
  if (!locked) return;
  const now = performance.now();
  if (now - wheelT < 70) return;
  wheelT = now;
  const dir = (e.deltaY || e.deltaX) > 0 ? 1 : -1, step = e.shiftKey ? 1 / 6 : 1;   // wheel = 90 deg, Shift+wheel = 15 deg
  if (paste.on) { paste.k = (paste.k + (dir > 0 ? 1 : 3)) % 4; return; }
  if (isTool()) { brush.r = Math.max(2, Math.min(24, brush.r - dir)); return; }
  rotateInput(dir, e.shiftKey ? 1 / 6 : 1);
});

// ---------- build menu + hotbar ----------
const menuEl = document.getElementById('menu');
const hotbarEl = document.getElementById('hotbar');
const iconCache = {};
const iconR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
iconR.setSize(160, 160);
const iconScene = new THREE.Scene();
iconScene.environment = scene.environment;
iconScene.environmentRotation.copy(scene.environmentRotation);
iconR.toneMapping = renderer.toneMapping;
iconScene.add(new THREE.HemisphereLight(0xffffff, 0x778899, 1.3));
const iconSun = new THREE.DirectionalLight(0xfff0d0, 2.2); iconSun.position.set(3, 6, 4); iconScene.add(iconSun);
const iconCam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
const iconDir = new THREE.Vector3(0.55, 0.5, 0.67).normalize();
function iconFor(type, mat, rot = 0) {
  const k = type + mat + '|' + rot;
  if (iconCache[k]) return iconCache[k];
  const g = buildGroup(type, MATERIALS[mat].mat, false);
  g.rotation.y = (rot * Math.PI) / 2;
  iconScene.add(g);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new THREE.Vector3());
  const rad = bb.getSize(new THREE.Vector3()).length() / 2;
  iconCam.position.copy(c).addScaledVector(iconDir, (rad / Math.sin((iconCam.fov * Math.PI) / 360)) * 1.12);
  iconCam.lookAt(c);
  iconR.render(iconScene, iconCam);
  iconScene.remove(g);
  return (iconCache[k] = iconR.domElement.toDataURL());
}
let menuCat = 0;
let menuQuery = '';
const allTypes = () => [...new Set(CATS.flatMap((c) => c[1]))];
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const iconImg = (t) => { const c = iconCache[t + matFor(t) + '|' + bp.rot]; return `<img alt="" src="${c || BLANK}" data-icon="${t}"${c ? ' data-done="1"' : ''}>`; };
function famCard(id) {
  const members = FAM.get(id), cur = famCurrent(id), n = members.length;
  return `<button class="card${trayFam === id ? ' open' : ''}" data-type="${cur}" data-fam="${id}" aria-pressed="${members.includes(bp.type)}" title="${n > 1 ? n + ' variants, click to choose' : PIECES[cur].label}">${iconImg(cur)}<span>${famName(cur)}</span>${n > 1 ? `<em>${n}</em>` : ''}</button>`;
}
function trayHTML() {
  const members = trayFam && FAM.get(trayFam);
  if (!members || members.length < 2) return '';
  return `<div class="tray"><header><strong>${famName(members[0])}</strong><span>choose a variant</span><button data-traydismiss aria-label="Close variants">×</button></header>
    <div class="tray-list">${members.map((t) => `<button class="variant" data-type="${t}" aria-pressed="${t === bp.type}" title="${PIECES[t].label}">${iconImg(t)}<small>${PIECES[t].fam?.[2] || PIECES[t].label}</small></button>`).join('')}</div></div>`;
}
let iconJob = 0;
function pumpIcons() {          // render menu icons a few at a time so hundreds of pieces never freeze the menu
  const job = ++iconJob;
  const step = () => {
    if (job !== iconJob || !menuOpen) return;
    const t0 = performance.now();
    const imgs = [...menuEl.querySelectorAll('.tray img[data-icon]:not([data-done])'), ...menuEl.querySelectorAll('.piece-grid img[data-icon]:not([data-done])')];
    for (const img of imgs) { const t = img.dataset.icon; img.src = iconFor(t, matFor(t), bp.rot); img.dataset.done = '1'; if (performance.now() - t0 > 14) break; }
    if (imgs.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const TINTS = [null, 0xffffff, 0xffd9d0, 0xff8a80, 0xffb74d, 0xfff176, 0xaed581, 0x66bb6a, 0x80deea, 0x64b5f6, 0x9575cd, 0xf48fb1, 0xbcaaa4, 0x8d6e63, 0x90a4ae, 0x555555, 0x222222];
function customHTML() {
  const c = bp.cu, deg = Math.round(bp.rot * 90) % 360;
  const sl = (k, label, min, max, st, v) => `<label class="cz"><span>${label}</span><input type="range" data-cz="${k}" min="${min}" max="${max}" step="${st}" value="${v}"><output>${v}</output></label>`;
  return `<section class="palette custom" aria-label="Customize piece"><header><h3>Customize: ${PIECES[bp.type].label}</h3><button data-dismiss aria-label="Close">×</button></header>
    <div class="cz-grid">${sl('sx', 'Width', 0.1, 6, 0.05, Math.abs(c.s[0]))}${sl('sy', 'Height', 0.1, 6, 0.05, c.s[1])}${sl('sz', 'Depth', 0.1, 6, 0.05, c.s[2])}${sl('su', 'All sizes', 0.1, 6, 0.05, c.s[1])}${sl('y', 'Lift', -6, 6, 0.05, c.y || 0)}${sl('rot', 'Rotation°', 0, 359, 1, deg)}</div>
    <div class="cz-row"><label><input type="checkbox" data-cz="mirror"${c.s[0] < 0 ? ' checked' : ''}> Mirror</label><label><input type="checkbox" data-cz="free"${bp.freePlace ? ' checked' : ''}> Free placement (H)</label><label><input type="checkbox" data-cz="snap"${snapOn ? ' checked' : ''}> Snapping (G)</label><button data-czreset>Reset all</button></div>
    <div class="cz-tints">${TINTS.map((t) => `<button data-tint="${t ?? ''}" title="${t == null ? 'No tint' : hex(t)}" aria-pressed="${(c.t ?? null) === t}" style="background:${t == null ? 'repeating-linear-gradient(45deg,#555 0 4px,#888 4px 8px)' : hex(t)}"></button>`).join('')}<input type="color" data-cz="tint" value="${c.t != null ? hex(c.t) : '#ffffff'}" title="Any colour"></div>
    <p class="cz-help">Tint multiplies the material colour. While building: +/− size, PgUp/PgDn lift, H free placement, I or middle-click to sample a placed piece, Backspace resets.</p></section>`;
}
function customControl() {
  const c = bp.cu, bits = [];
  if (c.s.some((v) => v !== 1)) bits.push(c.s.map((v) => +Math.abs(v).toFixed(2)).join('×'));
  if (c.y) bits.push('lift ' + c.y);
  if (bp.freePlace) bits.push('free');
  return `<button class="finish-control" data-picker="custom" aria-expanded="${finishPicker === 'custom'}"><span class="finish-chip" style="background:${c.t != null ? hex(c.t) : 'repeating-linear-gradient(45deg,#555 0 4px,#888 4px 8px)'}"></span><span><small>Customize (U)</small><strong>${bits.join(' · ') || 'Standard'}</strong></span><span class="chevron" aria-hidden="true">⌃</span></button>`;
}
let finishPicker = null;
const famOf = (t) => PIECES[t].fam?.[0] || t;
const famName = (t) => PIECES[t].fam?.[1] || PIECES[t].label;
const OPENING = /door|window|arch|gate|portcullis|slit|vent|oculus|porthole|garage|clerestory|lattice|colonnade|mullion/i;
const MENU = [
  ['Build', [['Frame', ['Frame']], ['Foundations', ['Foundations']], ['Floors', ['Floors']], ['Walls', ['Walls'], (t) => !OPENING.test(famName(t))], ['Wall Openings', ['Walls'], (t) => OPENING.test(famName(t))], ['Gables & Curves', ['Gables & Curves']], ['Arches & Beams', ['Arches & Beams']], ['Columns & Posts', ['Columns', 'Supports']], ['Railings', ['Railings']], ['Stairs & Ramps', ['Access']]]],
  ['Roof', [['Roofs', ['Roofs']], ['Slopes', ['Slopes']], ['Domes & Spires', ['Domes & Spires']]]],
  ['Furnish', [['Doors & Windows', ['Doors & Windows']], ['Trim', ['Trim']], ['Furniture', ['Furniture']], ['Lighting', ['Lighting']], ['Decor & Storage', ['Decor', 'Storage']], ['Garden & Nature', ['Garden', 'Nature']], ['Magic', ['Magic']]]],
  ['Create', [['Shapes', ['Shapes']], ['Freeform', ['Freeform']], ['Terrain', ['Terrain']]]],
];
{ // any category not listed above still gets a tab
  const listed = new Set(MENU.flatMap(([, tabs]) => tabs.flatMap(([, cs]) => cs)));
  for (const [c] of CATS) if (!listed.has(c)) MENU[2][1].push([c, [c]]);
}
const TABS = MENU.flatMap(([group, tabs]) => tabs.map(([name, cs, keep]) => ({ group, name, types: [...new Set(cs.flatMap((c) => CATS.find((k) => k[0] === c)?.[1] || []))].filter((t) => !keep || keep(t)) })));
// piece families: variants (heights, sizes, angles, thicknesses) share one card
const FAM = new Map();
for (const t of new Set(CATS.flatMap((c) => c[1]))) { const id = famOf(t); if (!FAM.has(id)) FAM.set(id, []); FAM.get(id).push(t); }
const famPick = {};
const famCurrent = (id) => famPick[id] || FAM.get(id).find((t) => PIECES[t].fam?.[3]) || FAM.get(id)[0];
const famIds = (types) => [...new Set(types.map(famOf))];
let menuTab = 0, trayFam = null;
const hex = c => '#' + c.toString(16).padStart(6, '0');

function materialChip(m) {
  const image = m.tex ? 'url("' + import.meta.env.BASE_URL + 'art/' + m.tex + '.jpg")'
    : 'linear-gradient(135deg, transparent, #ffffffcd 45%, transparent 55%)';
  return `<span class="finish-chip" style='background-color:${hex(m.color)};background-image:${image};background-blend-mode:${m.tex ? 'multiply' : 'normal'}'></span>`;
}

function finishControl(key, label, index) {
  const m = MATERIALS[index];
  return `<button class="finish-control" data-picker="${key}" aria-expanded="${finishPicker === key}">
    ${materialChip(m)}<span><small>${label}</small><strong>${m.name}</strong></span><span class="chevron" aria-hidden="true">⌃</span></button>`;
}

function renderMenu() {
  const q = menuQuery.trim().toLowerCase(), tab = TABS[menuTab];
  const types = q ? [...new Set(CATS.flatMap((c) => c[1]))].filter((t) => q.split(/\s+/).every((w) => (PIECES[t].label + ' ' + famName(t) + ' ' + t).toLowerCase().includes(w))) : tab.types;
  const fams = famIds(types), name = q ? 'Search results' : tab.name;
  const grid = menuEl.querySelector('.piece-grid');
  const scroll = grid?.dataset.category === name ? grid.scrollTop : 0;
  const nav = MENU.map(([g]) => {
    const open = !q && tab.group === g;
    const tabs = open ? TABS.map((tb, i) => [tb, i]).filter(([tb]) => tb.group === g).map(([tb, i]) => `<button data-tab="${i}" aria-pressed="${i === menuTab}">${tb.name}<span>${famIds(tb.types).length}</span></button>`).join('') : '';
    return `<section class="${open ? 'open' : ''}"><button class="grp" data-grp="${g}" aria-expanded="${open}">${g}<span>${open ? '−' : '+'}</span></button>${tabs}</section>`;
  }).join('');
  const palette = finishPicker === 'custom' ? customHTML() : finishPicker ? `<section class="palette" aria-label="Choose a material"><header><h3>${finishPicker === 'roof' ? 'Roof material' : 'Build material'}</h3><button data-dismiss aria-label="Close material picker">×</button></header>
    <div class="finish-list">${MATERIALS.map((m,i) => `<button data-${finishPicker}="${i}" aria-pressed="${i === (finishPicker === 'roof' ? bp.matRoof : bp.mat)}">${materialChip(m)}${m.name}</button>`).join('')}</div></section>` : '';
  menuEl.innerHTML = `<section class="panel" role="dialog" aria-label="Build library">
    <header class="library-head"><h2>Build</h2><input class="search" type="search" placeholder="Search pieces" value="${menuQuery.replace(/"/g, '&quot;')}"><div class="head-actions"></div><button class="close-menu" data-close>Close <kbd>Esc</kbd></button></header>
    <div class="library-body"><nav aria-label="Piece categories">${nav}</nav>
    <section class="catalog"><header><h3>${name}</h3><span>${fams.length} piece${fams.length === 1 ? '' : 's'}${types.length > fams.length ? ` · ${types.length} with variants` : ''}</span><small class="tip">Click to equip · hover + <kbd>1–0</kbd> puts it on the hotbar</small></header>
      <div class="piece-grid" data-category="${name}">${fams.map(famCard).join('') || '<p class="empty">Nothing matches that search.</p>'}</div>
      ${trayHTML()}
      <div class="finishes">${palette}${finishControl('mat','Build material',bp.mat)}${finishControl('roof','Roof material',bp.matRoof)}${customControl()}</div>
    </section></div></section>`;
  menuEl.querySelector('.head-actions').append(fileBar);
  menuEl.querySelector('.piece-grid').scrollTop = scroll;
  pumpIcons();
}

function renderHotbar() {
  hotbarEl.innerHTML = HOT.map((t, i) => `<div class="slot ${i === activeSlot ? 'on' : ''}" title="${PIECES[t].label}"><span class="k">${(i + 1) % 10}</span><img src="${iconFor(t, matFor(t), bp.rot)}"></div>`).join('');
}
let hoverType = null;
function assignSlot(i, type) {
  HOT[i] = type; saveHot();
  if (i === activeSlot) setGhostType(type); else renderHotbar();
  renderMenu();
}
menuEl.addEventListener('mouseover', (e) => { hoverType = e.target.closest('[data-type]')?.dataset.type || null; });
menuEl.addEventListener('mouseleave', () => { hoverType = null; });
hotbarEl.addEventListener('click', (e) => {
  if (!menuOpen) return;
  const i = [...hotbarEl.children].indexOf(e.target.closest('.slot'));
  if (i >= 0) { selectSlot(i); renderMenu(); }
});
function selectSlot(i) { activeSlot = i; setGhostType(HOT[i]); }
function toggleMenu(force) {
  finishPicker = null;
  hoverType = null;
  menuOpen = force ?? !menuOpen;
  menuEl.classList.toggle('open', menuOpen);
  document.body.classList.toggle('menu', menuOpen);
  if (menuOpen) {
    menuTab = Math.max(0, TABS.findIndex((tb) => tb.types.includes(bp.type))); trayFam = null;
    renderMenu();
    document.exitPointerLock();
  } else enterBuildView();
}
menuEl.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) { if (e.target === menuEl) toggleMenu(false); return; }
  if (t.hasAttribute('data-close')) { toggleMenu(false); }
  else if (t.dataset.picker) { finishPicker = finishPicker === t.dataset.picker ? null : t.dataset.picker; renderMenu(); }
  else if (t.hasAttribute('data-dismiss')) { finishPicker = null; renderMenu(); }
  else if (t.dataset.grp) { finishPicker = null; trayFam = null; menuQuery = ''; menuTab = TABS.findIndex((tb) => tb.group === t.dataset.grp); renderMenu(); }
  else if (t.dataset.tab !== undefined) { finishPicker = null; trayFam = null; menuQuery = ''; menuTab = +t.dataset.tab; renderMenu(); }
  else if (t.hasAttribute('data-traydismiss')) { trayFam = null; renderMenu(); }
  else if (t.dataset.tint !== undefined) { bp.cu.t = t.dataset.tint === '' ? null : +t.dataset.tint; renderMenu(); renderHotbar(); }
  else if (t.hasAttribute('data-czreset')) { bp.cu = { s: [1, 1, 1], y: 0, t: null }; bp.rot = 0; bp.freePlace = false; renderMenu(); renderHotbar(); }
  else if (t.dataset.roof !== undefined) { bp.matRoof = +t.dataset.roof; finishPicker = null; renderMenu(); renderHotbar(); }
  else if (t.dataset.mat !== undefined) { bp.mat = +t.dataset.mat; finishPicker = null; renderMenu(); renderHotbar(); }
  else if (t.dataset.type) {
    const fam = t.dataset.fam;
    if (fam && FAM.get(fam).length > 1) { trayFam = trayFam === fam ? null : fam; finishPicker = null; renderMenu(); return; }   // open the variant tray
    equipFromMenu(t.dataset.type);
  }
});
function equipFromMenu(type) { famPick[famOf(type)] = type; HOT[activeSlot] = type; saveHot(); setGhostType(type); toggleMenu(false); }
menuEl.addEventListener('dblclick', (e) => { const c = e.target.closest('.card'); if (c) equipFromMenu(c.dataset.type); });
menuEl.addEventListener('input', (e) => {
  const el = e.target;
  if (el.classList.contains('search')) {
    menuQuery = el.value; renderMenu();
    const i = menuEl.querySelector('.search'); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
    return;
  }
  const k = el.dataset.cz; if (!k || el.type === 'checkbox') return;
  const v = +el.value, c = bp.cu, m = c.s[0] < 0 ? -1 : 1;
  if (k === 'sx') c.s[0] = m * v; else if (k === 'sy') c.s[1] = v; else if (k === 'sz') c.s[2] = v;
  else if (k === 'su') { c.s = [m * v, v, v]; for (const n of ['sx', 'sy', 'sz']) { const sl = menuEl.querySelector(`[data-cz="${n}"]`); sl.value = v; sl.parentElement.querySelector('output').textContent = v; } }
  else if (k === 'y') c.y = v; else if (k === 'rot') bp.rot = v / 90;
  else if (k === 'tint') c.t = parseInt(el.value.slice(1), 16);
  const out = el.parentElement.querySelector('output'); if (out) out.textContent = el.value;
});
menuEl.addEventListener('change', (e) => {
  const k = e.target.dataset.cz;
  if (k === 'mirror') bp.cu.s[0] = -bp.cu.s[0];
  else if (k === 'free') bp.freePlace = e.target.checked;
  else if (k === 'snap') snapOn = e.target.checked;
  else if (k === 'tint') { renderMenu(); renderHotbar(); }
});
hotbarReady = true;
THREE.DefaultLoadingManager.onLoad = () => {
  for (const key of Object.keys(iconCache)) delete iconCache[key];
  renderHotbar();
  if (menuOpen) renderMenu();
};
renderHotbar();

const snapDir = (fx, fz) => (Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)]);
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) { if (e.code === 'Escape') e.target.blur(); return; }   // typing in the menu search
  if (titleUI.open) return;
  keys.add(e.code);
  if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); if (!e.repeat) (e.shiftKey ? redo : undo)(); return; }
  if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); if (!e.repeat) redo(); return; }
  if (e.code === 'Tab' || e.code === 'KeyB') { e.preventDefault(); if (!e.repeat) toggleMenu(); return; }
  if (menuOpen) {
    if (e.code === 'Escape' && (finishPicker || trayFam)) { finishPicker = null; trayFam = null; renderMenu(); }
    else if (e.code === 'Escape') toggleMenu(false);
    else if (/^Digit\d$/.test(e.code) && hoverType) assignSlot((+e.code.slice(5) + 9) % 10, hoverType);
    return;
  }
  if (e.repeat && !e.code.startsWith('Arrow')) return;
  if (e.code === 'KeyY') { selectKey(); return; }
  if (e.code === 'KeyP') { pasteToggle(); return; }
  if (e.code === 'KeyJ') { structural = !structural; if (activeSave) SAVES.updateSave(activeSave.id, { mode: structural ? 'structural' : 'creative' }); toast(structural ? 'Structural mode: walls, floors and roofs you place now need posts and beams, and weak or unsupported parts collapse' : 'Creative mode: place anything anywhere, nothing collapses'); if (structural) settleSoon(150); return; }
  if (e.code === 'KeyK') { toggleStab(); return; }
  if (e.code === 'KeyV') { repaintAimed(); return; }
  if (e.code === 'KeyZ' && !e.ctrlKey) { swapAimed(); return; }
  if (e.code === 'KeyO') { openUp(); return; }
  if (e.code === 'KeyH') { bp.freePlace = !bp.freePlace; toast(bp.freePlace ? 'Free placement ON: pieces go exactly where you aim and can clip into anything ([ ] sets the grid)' : 'Free placement off: grid and snapping'); return; }
  if (e.code === 'KeyI') { sampleAimed(); return; }
  if (e.code === 'Slash') { helpOn = !helpOn; settings.help = helpOn; SAVES.saveSettings(settings); return; }
  if (e.code === 'KeyU') { toggleMenu(true); finishPicker = 'custom'; renderMenu(); return; }
  if (e.code === 'Backspace') { bp.cu = { s: [1, 1, 1], y: 0, t: null }; toast('Size, lift and tint reset'); return; }
  if (e.code === 'PageUp' || e.code === 'PageDown') { e.preventDefault(); bp.cu.y = q3((bp.cu.y || 0) + (e.code === 'PageUp' ? 1 : -1) * (e.shiftKey ? 0.05 : 0.25)); return; }
  if (e.code === 'Equal' || e.code === 'Minus') { const d = (e.code === 'Equal' ? 1 : -1) * (e.shiftKey ? 0.05 : 0.25); bp.cu.s = bp.cu.s.map((v) => (v < 0 ? -1 : 1) * q3(Math.max(0.1, Math.min(8, Math.abs(v) + d)))); return; }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') { const i = FREE_STEPS.indexOf(freeStep), n = Math.max(0, Math.min(FREE_STEPS.length - 1, i + (e.code === 'BracketRight' ? -1 : 1))); freeStep = FREE_STEPS[n]; toast('Freeform grid: ' + freeStep + ' units'); return; }
  if (e.code === 'Comma' || e.code === 'Period') {
    const i = NUDGE_STEPS.indexOf(NUDGE), n = Math.max(0, Math.min(NUDGE_STEPS.length - 1, i + (e.code === 'Period' ? 1 : -1))), old = NUDGE;
    NUDGE = NUDGE_STEPS[n]; const lim = Math.round(NUDGE_MAX / NUDGE);
    bp.nx = Math.max(-lim, Math.min(lim, Math.round((bp.nx * old) / NUDGE))); bp.nz = Math.max(-lim, Math.min(lim, Math.round((bp.nz * old) / NUDGE)));
    toast('Nudge step: ' + NUDGE + ' units (arrows). , finer  . coarser'); return;
  }
  if (e.code === 'KeyT') { freeAng = !freeAng; toast('Freeform angle snap ' + (freeAng ? 'ON (15 degree steps)' : 'off')); return; }
  if (paste.on && e.code === 'KeyR') { paste.k = (paste.k + (e.shiftKey ? 3 : 1)) % 4; return; }
  const c = e.code;
  if (/^Digit\d$/.test(c)) selectSlot((+c.slice(5) + 9) % 10);
  if (c === 'KeyR') rotateInput(e.shiftKey ? -1 : 1, 1);
  if (c === 'KeyG') snapOn = !snapOn;
  if (c === 'KeyM') { if (e.shiftKey) bp.matRoof = (bp.matRoof + 1) % MATERIALS.length; else bp.mat = (bp.mat + 1) % MATERIALS.length; renderHotbar(); }
  if (c === 'KeyF') toggleFly();
  if (c === 'KeyL') setNight(!night);
  if (c === 'KeyN' && e.shiftKey && confirm('Start a new world? This clears your build.')) newWorld();
  else if (c === 'KeyN' && !e.shiftKey && !e.ctrlKey) { autoGrade = !autoGrade; toast(autoGrade ? 'Auto-level on: foundations flatten the ground under them' : 'Auto-level off: foundations only fit where the ground is already level'); }
  if (c === 'KeyQ') { if (isFree()) free.y -= e.shiftKey ? 3 : 0.5; else bp.levelOffset--; }
  if (c === 'KeyE') { if (isFree()) free.y += e.shiftKey ? 3 : 0.5; else bp.levelOffset++; }
  if (c === 'KeyC') { bp.nx = 0; bp.nz = 0; bp.levelOffset = 0; }
  if (c.startsWith('Arrow')) {
    e.preventDefault();
    const [fx, fz] = snapDir(-Math.sin(player.yaw), -Math.cos(player.yaw));
    const [rx, rz] = [-fz, fx];
    let dx = 0, dz = 0;
    if (c === 'ArrowUp') { dx = fx; dz = fz; }
    if (c === 'ArrowDown') { dx = -fx; dz = -fz; }
    if (c === 'ArrowRight') { dx = rx; dz = rz; }
    if (c === 'ArrowLeft') { dx = -rx; dz = -rz; }
    const lim = Math.round(NUDGE_MAX / NUDGE);
    bp.nx = Math.max(-lim, Math.min(lim, bp.nx + dx));
    bp.nz = Math.max(-lim, Math.min(lim, bp.nz + dz));
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- day / night + lamp lights ----------
let night = false;
function setNight(n) {
  night = n;
  const L = env.light[n ? 'night' : 'day'];
  scene.fog.color.set(L.fog); scene.fog.density = L.fogDensity;
  hemi.color.set(L.hemiSky); hemi.groundColor.set(L.hemiGround); hemi.intensity = L.hemiI;
  sun.intensity = L.sunI; sun.color.set(L.sunColor);
  env.setNight(n);
  if (activeSave) SAVES.updateSave(activeSave.id, { night: n });
}
const lampPool = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffb860, 0, 18, 2); scene.add(l); return l; });
let lampTimer = 0;
function updateLamps(dt) {
  lampTimer -= dt; if (lampTimer > 0) return; lampTimer = 0.35;
  const pts = [];
  for (const p of pieces.values()) for (const v of p.lights) pts.push([v.distanceToSquared(camera.position), v]);
  pts.sort((a, b) => a[0] - b[0]);
  lampPool.forEach((l, i) => { if (pts[i]) { l.position.copy(pts[i][1]); l.intensity = night ? 45 : 8; } else l.intensity = 0; });
}

// ---------- loop ----------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3();

function update(dt) {
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let mx = 0, mz = 0;
  if (keys.has('KeyW')) mz += 1;
  if (keys.has('KeyS')) mz -= 1;
  if (keys.has('KeyD')) mx += 1;
  if (keys.has('KeyA')) mx -= 1;

  if (player.fly) {
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    const sp = (sprint ? 28 : 12) * dt;
    camera.position.addScaledVector(fwd, mz * sp).addScaledVector(right, mx * sp);
    if (keys.has('Space')) camera.position.y += sp;
    if (keys.has('ControlLeft') || keys.has('KeyX')) camera.position.y -= sp;
    return;
  }

  const sp = (sprint ? 9 : 5) * dt;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let dx = (fx * mz + -fz * mx), dz = (fz * mz + fx * mx);
  const len = Math.hypot(dx, dz) || 1;
  dx = (dx / len) * sp * (mx || mz ? 1 : 0); dz = (dz / len) * sp * (mx || mz ? 1 : 0);
  const f = player.feet;
  if (!blocked(f.x + dx, f.z, f.y)) f.x += dx;
  if (!blocked(f.x, f.z + dz, f.y)) f.z += dz;

  const ground = groundAt(f.x, f.z, f.y);
  if (player.grounded && keys.has('Space')) { player.vy = 7; player.grounded = false; }
  player.vy -= 22 * dt;
  f.y += player.vy * dt;
  if (f.y <= ground && player.vy <= 0) { f.y = ground; player.vy = 0; player.grounded = true; }
  else if (ground > -Infinity && f.y - ground < 0.05 && player.vy <= 0) { player.grounded = true; }
  else player.grounded = false;
  const floor = terrainH(f.x, f.z);      // never fall through the world: if you end up below the ground, stand back on it
  if (f.y < floor - 1 && floor > env.groundMin) { f.y = floor; player.vy = 0; player.grounded = true; }
  else if (f.y < -40) { f.set(8, terrainH(8, 8) + 1, 8); player.vy = 0; }
  camera.position.set(f.x, f.y + EYE, f.z);
}

function cuText() {
  const c = bp.cu, bits = [];
  if (c.s.some((v) => v !== 1)) bits.push('size ' + c.s.map((v) => +v.toFixed(2)).join(' × '));
  if (c.y) bits.push('lift ' + c.y);
  if (c.t != null) bits.push(`tint <span style="color:${hex(c.t)}">■</span>`);
  if (bp.freePlace) bits.push('<b>FREE PLACEMENT</b>');
  return bits.length ? 'Custom: ' + bits.join(' · ') + '<br>' : '';
}
let helpOn = false;
function hud() {
  const lv = bp.levelOffset ? ` (level ${bp.levelOffset > 0 ? '+' : ''}${bp.levelOffset})` : '';
  hudEl.innerHTML =
    `<b>${PIECES[bp.type].label}</b> · ${MATERIALS[matFor(bp.type)].name} · ${bp.snapDir ? 'snapped to ' + snapInfo(bp.type)?.kind : 'rot ' + (Math.round(bp.useRot * 90) % 360) + '°'} · snap ${snapOn ? 'ON' : 'off'} (G) · nudge ${+(bp.nx * NUDGE).toFixed(2)},${+(bp.nz * NUDGE).toFixed(2)} (step ${NUDGE}) · free grid ${freeStep}${lv}<br>` +
    `${cuText()}Mode: <b>${player.fly ? 'FLIGHT' : 'WALK'}</b> · Physics: <b>${structural ? 'STRUCTURAL' : 'creative'}</b> (J) · Auto-level: <b>${autoGrade ? 'ON' : 'off'}</b> (N)<br>${bp.why && !isFree() && !isTool() ? '<b style="color:#ff9a9a">' + bp.why + '</b><br>' : ''}` +
    (helpOn ? `<span class="row"><b>Tab / B build menu</b> · 1-0 hotbar slot · wheel rotate (Shift = 15°) · M material (Shift+M roof) · L day/night · R rotate<br>` +
    `Arrows nudge ¼ tile · Q/E level · C reset<br>` +
    `${isFree() ? '<b>Freeform:</b> click start, click end (chains on) · right-click to finish · Q/E height (Shift = 3)<br>' : ''}Click place · <b>hold + drag to zoop</b> (Shift swaps line/area) · Right-click remove<br>Ctrl+Z / Ctrl+Y undo / redo · Y,Y select + copy · P paste · T freeform angle snap<br><b>Retrofit (aim at a piece):</b> V repaint · Z swap to held piece · O open into parts · K stability view · , . nudge step · [ ] freeform grid<br><b>Customize:</b> U panel · +/− size · PgUp/PgDn lift · H free placement (clip anything) · I or middle-click sample · Backspace reset<br>${isTool() ? '<b>Terrain:</b> hold click to sculpt · wheel = brush size · Flatten sets land to build level (hold Shift to level to where you started)<br>' : ''}` +
    `WASD move · Shift fast · Space up/jump · Ctrl/X down · F fly↔walk</span>` : '<span class="row"><b>/</b> all controls · <b>Tab</b> build menu · <b>U</b> customize · <b>H</b> free placement · <b>J</b> physics</span>');
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateLamps(dt);
  updateDebris(dt);
  if (!titleUI.open) update(dt); else if (titleUI.base === 'home') orbitCamera(dt);
  streamTerrain(3);
  { const sx = Math.round(camera.position.x / 4) * 4, sz = Math.round(camera.position.z / 4) * 4, sy = Math.round(camera.position.y / 4) * 4; sun.target.position.set(sx, sy, sz); sun.position.set(sx - 42, sy + 55, sz + 22); }
  env.update(dt, camera);
  if (!titleUI.open) {
    updateBlueprint();
    updateZoop();
    sculptStep(dt);
    updateSel();
    hud();
  } else { bp.ghost.visible = false; ring.visible = false; if (free) { free.dot.visible = false; if (free.ghost) free.ghost.visible = false; } }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// ---------- file bar: export / import / share ----------
function worldJSON() { return { app: 'peace', v: 2, name: activeSave?.name || 'peace world', biome: env.id, seed: activeSave?.seed, mode: structural ? 'structural' : 'creative', night, world: [...pieces.values(), ...strands.values()].map(entryOf), hot: HOT, terrain: terrainB64() }; }
function loadFromObj(o) {
  if (!o || !Array.isArray(o.world)) return toast('That is not a peace build');
  loading = true;
  for (const p of [...pieces.values()]) removePiece(p);
  for (const st of [...strands.values()]) removeStrand(st);
  if (o.terrain) setTerrainFromB64(o.terrain);
  for (const e of o.world) restoreEntry(e);
  if (Array.isArray(o.hot) && o.hot.length === 10 && o.hot.every((t) => PIECES[t])) { HOT = o.hot; saveHot(); selectSlot(activeSlot); }
  loading = false; hist.length = 0; redoS.length = 0;
  scheduleSave(); saveTerrain(); toast('Build loaded');
}
async function gzipB64(str) {
  const buf = new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  return b64FromBytes(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function gunzipB64(b) {
  b = b.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
  return new Response(new Blob([bytesFromB64(b)]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
function downloadJSON(o) {
  if (!o) return;
  const name = (String(o.name || 'peace-world').replace(/[^\w\- ]+/g, '').trim() || 'peace-world') + '.json';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: 'application/json' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Exported ' + name);
}
const exportFile = () => { saveNow(); downloadJSON(worldJSON()); };
// an imported or shared world becomes a new save slot
function importWorld(o, fallbackName) {
  if (!o || !Array.isArray(o.world)) return toast('That is not a peace world file');
  const m = SAVES.createSave({ name: o.name || fallbackName || 'Imported world', biome: 'desert', seed: o.seed, mode: o.mode || 'creative', night: !!o.night, world: o.world, terrain: o.terrain || null });
  if (!m) return toast('Could not import: browser storage is full');
  if (Array.isArray(o.hot) && o.hot.length === 10 && o.hot.every((t) => PIECES[t])) { HOT = o.hot; saveHot(); }
  switchTo(m.id);
}
const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json';
fileIn.addEventListener('change', async () => {
  const f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
  let o = null;
  try { o = JSON.parse(await f.text()); } catch { return toast('Could not read that file'); }
  importWorld(o, f.name.replace(/\.json$/i, ''));
});
async function shareLink() {
  const url = location.origin + location.pathname + '#b=' + (await gzipB64(JSON.stringify(worldJSON())));
  try { await navigator.clipboard.writeText(url); toast(`Share link copied (${Math.round(url.length / 1000)}k characters)`); } catch { prompt('Copy this share link:', url); }
}
const fileBar = document.createElement('details'); fileBar.className = 'world';
fileBar.innerHTML = '<summary>World</summary><div class="world-list"></div>';
const worldList = fileBar.querySelector('.world-list');
for (const [label, fn] of [['Undo', undo], ['Redo', redo], ['Export file', exportFile], ['Import file', () => fileIn.click()], ['Copy share link', shareLink], ['Clear this world', () => { if (confirm('Clear everything built in this world? (Ctrl+Z will not bring it back)')) newWorld(); }], ['Main menu', openMainMenu]]) {
  const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { fileBar.open = false; fn(); }); worldList.appendChild(b);
}
// named blueprint library: saves the copied region (Y, Y) under a name; click one to stamp it
const BP_KEY = 'peace.blueprints.v1';
const bpLoad = () => { try { const a = JSON.parse(localStorage.getItem(BP_KEY)); return Array.isArray(a) ? a : []; } catch { return []; } };
const bpSave = (a) => { try { localStorage.setItem(BP_KEY, JSON.stringify(a)); } catch { toast('Could not save (storage full)'); } };
const bpPanel = document.createElement('div'); bpPanel.id = 'bplib'; document.body.appendChild(bpPanel);
function renderBpLib() {
  const list = bpLoad();
  bpPanel.innerHTML = `<h3>Blueprints</h3><button data-save>Save copied region as…</button>` + (list.length ? list.map((b, i) => `<div class="bp"><button data-use="${i}">${b.name} <small>${b.clip.items.length + b.clip.strands.length} pieces</small></button><button data-del="${i}" aria-label="Delete">×</button></div>`).join('') : '<p>Nothing saved yet. Press Y twice in the world to copy a region, then save it here.</p>');
}
bpPanel.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const list = bpLoad();
  if (t.hasAttribute('data-save')) {
    if (!clipState.clip) return toast('Copy a region first: Y, aim at the opposite corner, Y');
    const name = prompt('Name this blueprint:'); if (!name) return;
    list.push({ name: name.slice(0, 40), clip: clipState.clip }); bpSave(list); renderBpLib(); toast('Saved blueprint: ' + name);
  } else if (t.dataset.del !== undefined) { list.splice(+t.dataset.del, 1); bpSave(list); renderBpLib(); }
  else if (t.dataset.use !== undefined) {
    clipState.clip = list[+t.dataset.use].clip; bpBtn.click(); toggleMenu(false);
    setTimeout(() => { if (!paste.on) pasteToggle(); else { buildPasteGhost(); } }, 50);
  }
});
const bpBtn = document.createElement('button'); bpBtn.textContent = 'Blueprints';
bpBtn.addEventListener('click', () => { const on = bpPanel.classList.toggle('open'); if (on) renderBpLib(); });
worldList.prepend(bpBtn);
bpBtn.addEventListener('click', () => { fileBar.open = false; });
(async () => {
  if (!location.hash.startsWith('#b=')) return;
  try {
    const o = JSON.parse(await gunzipB64(location.hash.slice(3)));
    history.replaceState(null, '', location.pathname);
    if (confirm('Open the shared world? It will be added to your worlds.')) importWorld(o, 'Shared world');
  } catch { toast('Could not read that share link'); }
})();

// ---------- main menu, pause menu, settings ----------
function captureThumb() {
  try {
    renderer.render(scene, camera);
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const src = renderer.domElement; let sw = src.width, sh = src.height;
    if (sw / sh > 16 / 9) sw = sh * 16 / 9; else sh = sw * 9 / 16;
    c.getContext('2d').drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 320, 180);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return null; }
}
function storeThumb() { if (!activeSave) return; const t = captureThumb(); if (t) SAVES.updateSave(activeSave.id, { thumb: t }); }
function switchTo(id) { saveNow(); SAVES.setCurrent(id); sessionStorage.setItem('peace.enter', '1'); location.reload(); }
let orbitA = 0.7, camSaved = null;
function orbitCamera(dt) {
  if (!camSaved) camSaved = { pos: camera.position.clone(), yaw: player.yaw, pitch: player.pitch };
  orbitA += dt * 0.035;
  camera.position.set(Math.cos(orbitA) * 30, 13, Math.sin(orbitA) * 30);
  camera.lookAt(0, 1.5, 0);
}
function restoreCam() {
  if (!camSaved) return;
  camera.position.copy(camSaved.pos); player.yaw = camSaved.yaw; player.pitch = camSaved.pitch; camSaved = null;
  if (!player.fly) { player.feet.set(camera.position.x, camera.position.y - EYE, camera.position.z); player.vy = 0; }
}
function openMainMenu() {
  menuOpen = false; menuEl.classList.remove('open'); document.body.classList.remove('menu');
  storeThumb(); saveNow(); titleUI.show('home');
}
function applySettings() {
  camera.fov = settings.fov; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, { low: 0.75, medium: 1.25, high: 2 }[settings.quality] || 2));
  renderer.setSize(innerWidth, innerHeight);
  sun.castShadow = !!settings.shadows;
  helpOn = !!settings.help;
  if (!settings.flyMode && player.fly) setFly(false);
}
const resume = () => { if (!activeSave) return; titleUI.hide(); restoreCam(); enterBuildView(); };
const titleUI = createTitle({
  current: () => activeSave && SAVES.getSave(activeSave.id),
  saves: () => SAVES.listSaves().sort((a, b) => b.updated - a.updated),
  onResume: resume,
  onPlay: (id) => (activeSave && id === activeSave.id ? resume() : switchTo(id)),
  onCreate: (o) => { const m = SAVES.createSave(o); if (!m) return toast('Could not create the world: browser storage is full'); switchTo(m.id); },
  onRename: (id, name) => { SAVES.updateSave(id, { name: name.slice(0, 40) }); if (activeSave?.id === id) activeSave.name = name.slice(0, 40); },
  onDuplicate: (id) => { if (activeSave?.id === id) saveNow(); SAVES.duplicateSave(id); },
  onDelete: (id) => { SAVES.deleteSave(id); if (activeSave?.id === id) { activeSave = null; location.reload(); } },
  onExport: (id) => { if (activeSave?.id === id) saveNow(); downloadJSON(SAVES.exportSave(id)); },
  onImport: () => fileIn.click(),
  onSaveQuit: () => { storeThumb(); saveNow(); },
  getSettings: () => settings,
  setSettings: (v) => { Object.assign(settings, v); SAVES.saveSettings(settings); applySettings(); },
});
addEventListener('beforeunload', () => saveNow());
applySettings();
setNight(!!activeSave?.night);
if (sessionStorage.getItem('peace.enter') && activeSave) { sessionStorage.removeItem('peace.enter'); titleUI.show('pause', { fresh: true }); }
else titleUI.show('home');

frame();

// test hook: only with ?debug in the URL
if (new URLSearchParams(location.search).has('debug')) {
  window.peace = { gradeTile, gradePieces, groundWhy, update, terrainH, getH, setH, store, tmeshes, streamTerrain, terrainB64, refreshChunksAround, PIECES, CATS, pieces, strands, addPiece, removePiece, bp, setGhostType, toggleMenu, renderMenu, analyze, settle, groundAt, worldJSON, loadFromObj, newWorld, camera, player, renderer, scene, roleOf, sampleAimed, snapPlacement, snapInfo, placeRule,
    setStructural: (v) => { structural = v; }, setLocked: (v) => { locked = v; } };
}
