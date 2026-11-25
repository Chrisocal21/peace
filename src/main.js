import * as THREE from 'three';

// ---------- constants (placeholder proportions, see docs/OPEN_QUESTIONS.md #2) ----------
const T = 4;          // master tile size
const H = 3;          // wall height / level height
const NUDGE = 1;      // quarter tile
const NUDGE_MAX = 4;  // max offset from the pointed tile centre
const EYE = 1.6, BODY = 1.75, RADIUS = 0.3, STEP = 0.6;

// ---------- materials ----------
const MATERIALS = [
  { name: 'thatch',   color: 0xd9b45a, rough: 1 },
  { name: 'wood',     color: 0xa8743f, rough: 0.85 },
  { name: 'stone',    color: 0xa9a59c, rough: 0.95 },
  { name: 'metal',    color: 0x8a98a6, rough: 0.4, metal: 0.6 },
  { name: 'concrete', color: 0xc9c9c4, rough: 1 },
  { name: 'glass',    color: 0xaadfff, rough: 0.1, glass: true },
].map((m) => ({
  ...m,
  mat: new THREE.MeshStandardMaterial({
    color: m.color, roughness: m.rough, metalness: m.metal || 0, side: THREE.DoubleSide,
    transparent: !!m.glass, opacity: m.glass ? 0.4 : 1,
  }),
}));

// ---------- piece definitions (local space: tile centre at origin, y=0 at level base) ----------
const box = (x0, y0, z0, x1, y1, z1) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};
const prism = (pts, depth) => {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
};
const solid = (...b) => ({ geos: () => b.map((x) => box(...x)), cols: b });

const PIECES = {
  foundation: { ...solid([-2, -1, -2, 2, 0, 2]), key: '1', label: 'Foundation' },
  floor:      { ...solid([-2, 0, -2, 2, 0.2, 2]), key: '2', label: 'Floor' },
  wall:       { ...solid([-2, 0, 1.9, 2, H, 2.1]), key: '3', label: 'Wall' },
  doorway:    { ...solid([-2, 0, 1.9, -0.8, H, 2.1], [0.8, 0, 1.9, 2, H, 2.1], [-0.8, 2.4, 1.9, 0.8, H, 2.1]), key: '4', label: 'Doorway' },
  walkway:    { ...solid([-0.75, 0, -2, 0.75, 0.2, 2]), key: '5', label: 'Walkway' },
  ramp:       { geos: () => [prism([[-2, 0], [2, 0], [2, H]], 4)], cols: [], ramp: true, key: '6', label: 'Ramp' },
  roof:       { geos: () => { const g = prism([[-2.2, 0], [2.2, 0], [0, 1.8]], 4.4); g.translate(0, H, 0); return [g]; }, cols: [], key: '7', label: 'Roof' },
  dome:       { geos: () => [new THREE.SphereGeometry(2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)], cols: [], key: '8', label: 'Dome' },
};
const ORDER = Object.keys(PIECES);

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3f2);
scene.fog = new THREE.Fog(0xbfe3f2, 60, 260);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6a8a99, 0.9));
const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
sun.position.set(40, 60, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
scene.add(sun);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x4aa8c8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.9 }),
);
water.position.y = -0.55;
water.receiveShadow = true;
scene.add(water);

// ---------- world state ----------
const pieces = new Map();   // key -> piece
let pickables = [];
let colliders = [];         // flat list of world AABBs
let ramps = [];

const cellOf = (v) => Math.round(v / T);
const keyOf = (type, level, x, z, rot) => `${type}|${level}|${x}|${z}|${rot}`;
const rotV = (v, rot) => v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (rot * Math.PI) / 2);

function buildGroup(type, material, shadows = true) {
  const g = new THREE.Group();
  for (const geo of PIECES[type].geos()) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadows && !MATERIALS.find((x) => x.mat === material)?.glass;
    m.receiveShadow = shadows;
    g.add(m);
  }
  return g;
}

function worldCols(type, x, z, level, rot) {
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1] of PIECES[type].cols) {
    const min = new THREE.Vector3(Infinity, 0, Infinity), max = new THREE.Vector3(-Infinity, 0, -Infinity);
    for (const cx of [x0, x1]) for (const cz of [z0, z1]) {
      const p = rotV(new THREE.Vector3(cx, 0, cz), rot);
      min.x = Math.min(min.x, p.x + x); max.x = Math.max(max.x, p.x + x);
      min.z = Math.min(min.z, p.z + z); max.z = Math.max(max.z, p.z + z);
    }
    min.y = y0 + level * H; max.y = y1 + level * H;
    out.push({ min, max });
  }
  return out;
}

function rebuildIndexes() {
  pickables = []; colliders = []; ramps = [];
  for (const p of pieces.values()) {
    p.group.traverse((o) => { if (o.isMesh) pickables.push(o); });
    colliders.push(...p.cols);
    if (PIECES[p.type].ramp) ramps.push(p);
  }
}

function addPiece(type, x, z, level, rot, matIdx) {
  const key = keyOf(type, level, x, z, rot);
  if (pieces.has(key)) return;
  const group = buildGroup(type, MATERIALS[matIdx].mat);
  group.position.set(x, level * H, z);
  group.rotation.y = (rot * Math.PI) / 2;
  const p = { key, type, x, z, level, rot, group, cols: worldCols(type, x, z, level, rot) };
  group.traverse((o) => { if (o.isMesh) o.userData.piece = p; });
  scene.add(group);
  pieces.set(key, p);
  rebuildIndexes();
}

function removePiece(p) {
  scene.remove(p.group);
  p.group.traverse((o) => o.geometry && o.geometry.dispose());
  pieces.delete(p.key);
  rebuildIndexes();
}

const hasFoundation = (cx, cz) => pieces.has(keyOf('foundation', 0, cx * T, cz * T, 0));

// starting platform: 3x3 foundation tiles
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) addPiece('foundation', i * T, j * T, 0, 0, 4);

// ---------- blueprint (ghost) ----------
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
const bp = { type: 'wall', rot: 0, mat: 2, nx: 0, nz: 0, levelOffset: 0, ghost: null, valid: false, x: 0, z: 0, level: 0, visible: false };

function setGhostType(type) {
  bp.type = type;
  if (bp.ghost) scene.remove(bp.ghost);
  bp.ghost = buildGroup(type, ghostMat, false);
  bp.ghost.visible = false;
  scene.add(bp.ghost);
}
setGhostType('wall');

const raycaster = new THREE.Raycaster();
raycaster.far = 70;
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _pt = new THREE.Vector3();

function updateBlueprint() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  let cx, cz, level = 0;
  const foundation = bp.type === 'foundation';
  const hit = foundation ? null : raycaster.intersectObjects(pickables, false)[0];
  if (hit) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const p = hit.point.clone().addScaledVector(n, 0.1);
    cx = cellOf(p.x); cz = cellOf(p.z);
    level = Math.max(0, Math.floor(p.y / H));
  } else if (raycaster.ray.intersectPlane(_plane, _pt)) {
    cx = cellOf(_pt.x); cz = cellOf(_pt.z);
  } else { bp.visible = false; bp.ghost.visible = false; return; }

  if (foundation) {
    bp.x = cx * T; bp.z = cz * T; bp.level = 0;
    const adj = hasFoundation(cx + 1, cz) || hasFoundation(cx - 1, cz) || hasFoundation(cx, cz + 1) || hasFoundation(cx, cz - 1);
    bp.valid = adj && !hasFoundation(cx, cz);
    bp.ghost.position.set(bp.x, 0, bp.z);
    bp.ghost.rotation.y = 0;
  } else {
    bp.level = Math.max(0, level + bp.levelOffset);
    bp.x = cx * T + bp.nx * NUDGE; bp.z = cz * T + bp.nz * NUDGE;
    bp.valid = hasFoundation(cx, cz) && !pieces.has(keyOf(bp.type, bp.level, bp.x, bp.z, bp.rot));
    bp.ghost.position.set(bp.x, bp.level * H, bp.z);
    bp.ghost.rotation.y = (bp.rot * Math.PI) / 2;
  }
  ghostMat.color.set(bp.valid ? 0x55ff88 : 0xff5566);
  bp.visible = true;
  bp.ghost.visible = true;
}

function confirmPlace() {
  if (!bp.visible || !bp.valid) return;
  addPiece(bp.type, bp.x, bp.z, bp.level, bp.type === 'foundation' ? 0 : bp.rot, bp.mat);
}
function removeTarget() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit) removePiece(hit.object.userData.piece);
}

// ---------- player ----------
const player = { feet: new THREE.Vector3(0, 0, 0), vy: 0, grounded: false, fly: true, yaw: Math.PI / 4, pitch: -0.45 };
camera.position.set(16, 12, 16);

function groundAt(x, z, feet) {
  let g = -Infinity;
  const lim = feet + STEP;
  for (const c of colliders) {
    if (x > c.min.x - 0.15 && x < c.max.x + 0.15 && z > c.min.z - 0.15 && z < c.max.z + 0.15 && c.max.y <= lim && c.max.y > g) g = c.max.y;
  }
  for (const r of ramps) {
    const l = rotV(new THREE.Vector3(x - r.x, 0, z - r.z), -r.rot);
    if (Math.abs(l.x) <= 2 && Math.abs(l.z) <= 2) {
      const s = r.level * H + (H * (l.x + 2)) / T;
      if (s <= lim && s > g) g = s;
    }
  }
  return g;
}
function blocked(x, z, feet) {
  const lo = feet + STEP, hi = feet + BODY;
  for (const c of colliders) {
    if (c.max.y <= lo || c.min.y >= hi) continue;
    if (x > c.min.x - RADIUS && x < c.max.x + RADIUS && z > c.min.z - RADIUS && z < c.max.z + RADIUS) return true;
  }
  return false;
}

function toggleFly() {
  player.fly = !player.fly;
  if (!player.fly) { player.feet.set(camera.position.x, camera.position.y - EYE, camera.position.z); player.vy = 0; }
}

// ---------- input ----------
const keys = new Set();
const startEl = document.getElementById('start');
const hudEl = document.getElementById('hud');
let locked = false;

startEl.addEventListener('click', () => renderer.domElement.requestPointerLock());
renderer.domElement.addEventListener('click', () => { if (!locked) renderer.domElement.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  startEl.style.display = locked ? 'none' : 'flex';
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0022));
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) confirmPlace();
  if (e.button === 2) removeTarget();
});
addEventListener('wheel', (e) => {
  if (!locked) return;
  const i = ORDER.indexOf(bp.type), d = e.deltaY > 0 ? 1 : -1;
  setGhostType(ORDER[(i + d + ORDER.length) % ORDER.length]);
});

const snapDir = (fx, fz) => (Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)]);
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.repeat && !e.code.startsWith('Arrow')) return;
  const c = e.code;
  for (const t of ORDER) if (c === 'Digit' + PIECES[t].key) setGhostType(t);
  if (c === 'KeyR') bp.rot = (bp.rot + 1) % 4;
  if (c === 'KeyM') bp.mat = (bp.mat + 1) % MATERIALS.length;
  if (c === 'KeyF') toggleFly();
  if (c === 'KeyQ') bp.levelOffset--;
  if (c === 'KeyE') bp.levelOffset++;
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
    bp.nx = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, bp.nx + dx));
    bp.nz = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, bp.nz + dz));
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

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
  if (f.y < -12) { f.set(0, 0.1, 0); player.vy = 0; }
  camera.position.set(f.x, f.y + EYE, f.z);
}

function hud() {
  const lv = bp.levelOffset ? ` (level ${bp.levelOffset > 0 ? '+' : ''}${bp.levelOffset})` : '';
  hudEl.innerHTML =
    `<b>${PIECES[bp.type].label}</b> · ${MATERIALS[bp.mat].name} · rot ${bp.rot * 90}° · nudge ${bp.nx * 0.25},${bp.nz * 0.25} tile${lv}<br>` +
    `Mode: <b>${player.fly ? 'FLIGHT' : 'WALK'}</b><br>` +
    `<span class="row">1-8 / wheel piece · M material · R rotate<br>` +
    `Arrows nudge ¼ tile · Q/E level · C reset<br>` +
    `Click place · Right-click remove<br>` +
    `WASD move · Shift fast · Space up/jump · Ctrl/X down · F fly↔walk</span>`;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  updateBlueprint();
  hud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
