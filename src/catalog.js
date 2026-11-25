// Generated piece families. Every piece is authored in tile space (tile centre at the origin, y = 0 at the
// level base, wall-like pieces on the +z edge at z = 1.9..2.1, corner pieces at (2, 2)), so the existing
// snapping, zooping, physics roles and customization all work on them unchanged.
import * as THREE from 'three';

const V2 = (x, y) => new THREE.Vector2(x, y);
const rng = (n) => Array.from({ length: n }, (_, i) => i);
const fin = (g, f) => { g.userData.finish = f; return g; };      // accent finish (see fabrication.js)
const PI = Math.PI;

export function buildCatalog({ box, cyl, prism, slab, H, T }) {
  const pieces = {}, cats = [];
  const aliases = {};      // base pieces from main.js that join a generated family
  const put = (cat, type, def, fam) => {
    if (pieces[type]) throw new Error('duplicate piece ' + type);
    if (fam) def.fam = fam;
    pieces[type] = def;
    let c = cats.find((k) => k[0] === cat);
    if (!c) cats.push((c = [cat, []]));
    c[1].push(type);
  };
  const B = (...bs) => bs.map((b) => box(...b));
  const F = (f, ...bs) => bs.map((b) => fin(box(...b), f));
  const strut = (a, b, w, d = w) => {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), dl = Bv.clone().sub(A);
    const g = new THREE.BoxGeometry(w, dl.length(), d);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dl.clone().normalize()));
    const m = A.clone().lerp(Bv, 0.5);
    return g.translate(m.x, m.y, m.z);
  };
  const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg);
  const sph = (r, x, y, z, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs).translate(x, y, z);
  const cone = (r, h, x, y, z, seg = 16) => new THREE.ConeGeometry(r, h, seg).translate(x, y + h / 2, z);
  const cylAt = (r, y0, y1, x, z, seg = 12) => cyl(r, y0, y1, seg).translate(x, 0, z);
  const tubeX = (r, x0, x1, y, z, seg = 10) => new THREE.CylinderGeometry(r, r, x1 - x0, seg).rotateZ(PI / 2).translate((x0 + x1) / 2, y, z);
  const tubeZ = (r, z0, z1, y, x, seg = 10) => new THREE.CylinderGeometry(r, r, z1 - z0, seg).rotateX(PI / 2).translate(x, y, (z0 + z1) / 2);
  const arcPts = (cx, cz, R, a0, a1, n = 24) => rng(n + 1).map((i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + R * Math.cos(a), cz + R * Math.sin(a)]; });
  const polyPath = (pts, P = THREE.Path) => { const p = new P(); p.moveTo(...pts[0]); for (const q of pts.slice(1)) p.lineTo(...q); p.closePath(); return p; };
  // extrude a plan contour [[x, z]] straight up from y0 to y1
  const extrudeUp = (contour, y0, y1, holes = []) => {
    const s = polyPath(contour.map(([x, z]) => [x, -z]), THREE.Shape);
    for (const h of holes) s.holes.push(polyPath(h.map(([x, z]) => [x, -z])));
    return new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false }).rotateX(-PI / 2).translate(0, y0, 0);
  };
  const planTris = (contour, holes, y) => {
    const pts = contour.map(([x, z]) => V2(x, z)), hs = holes.map((h) => h.map(([x, z]) => V2(x, z)));
    const all = [...pts, ...hs.flat()];
    return THREE.ShapeUtils.triangulateShape(pts, hs).map((f) => f.map((i) => [all[i].x, y, all[i].y]));
  };
  const slabPiece = (tris, th) => ({ geos: () => [slab(tris, th)], cols: [], surf: tris });

  // ======================================================================= WALLS
  const rectH = (x0, y0, x1, y1) => () => polyPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const circH = (cx, cy, r) => () => { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, PI * 2, false); return p; };
  const archH = (x0, y0, x1, y1) => () => {
    const r = (x1 - x0) / 2, sp = y1 - r, p = new THREE.Path();
    p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, sp); p.absarc((x0 + x1) / 2, sp, r, 0, PI, false); p.closePath(); return p;
  };
  const gothH = (x0, y0, x1, y1) => () => {
    const w = x1 - x0, sp = y1 - (w * Math.sqrt(3)) / 2, p = new THREE.Path();
    p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, sp); p.absarc(x0, sp, w, 0, PI / 3, false); p.absarc(x1, sp, w, (2 * PI) / 3, PI, false); p.closePath(); return p;
  };
  const polyH = (pts) => () => polyPath(pts);
  const starPts = (cx, cy, R, r, n) => rng(2 * n).map((i) => { const a = PI / 2 + (i * PI) / n, d = i % 2 ? r : R; return [cx + d * Math.cos(a), cy + d * Math.sin(a)]; });
  const ngon = (cx, cy, r, n, rot = 0) => rng(n).map((i) => [cx + r * Math.cos(rot + (i * 2 * PI) / n), cy + r * Math.sin(rot + (i * 2 * PI) / n)]);

  // trace a door opening that starts at (x0, 0) and ends at (x1, 0)
  function doorPath(s, d) {
    const w = d.x1 - d.x0, cx = (d.x0 + d.x1) / 2, r = w / 2;
    if (d.kind === 'arch') { const sp = d.top - r; s.lineTo(d.x0, sp); s.absarc(cx, sp, r, PI, 0, true); }
    else if (d.kind === 'gothic') { const sp = d.top - (w * Math.sqrt(3)) / 2; s.lineTo(d.x0, sp); s.absarc(d.x1, sp, w, PI, (2 * PI) / 3, true); s.absarc(d.x0, sp, w, PI / 3, 0, true); }
    else if (d.kind === 'seg') {
      const rise = w * 0.2, sp = d.top - rise, R = (r * r + rise * rise) / (2 * rise), a = Math.asin(r / R);
      s.lineTo(d.x0, sp); s.absarc(cx, d.top - R, R, PI / 2 + a, PI / 2 - a, true);
    } else { s.lineTo(d.x0, d.top); s.lineTo(d.x1, d.top); }
    s.lineTo(d.x1, 0);
  }
  function wallDef({ xa = -2, xb = 2, h = H, doors = [], holes = [], z0 = 1.9, t = 0.2, extra = null }) {
    const ds = [...doors].sort((a, b) => a.x0 - b.x0);
    const geos = () => {
      const s = new THREE.Shape(); s.moveTo(xa, 0);
      for (const d of ds) { s.lineTo(d.x0, 0); doorPath(s, d); }
      s.lineTo(xb, 0); s.lineTo(xb, h); s.lineTo(xa, h); s.closePath();
      for (const mk of holes) s.holes.push(mk());
      const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 18 }).translate(0, 0, z0);
      return [g, ...(extra ? extra() : [])];
    };
    const cols = []; let x = xa;
    for (const d of ds) { if (d.x0 > x + 0.01) cols.push([x, 0, z0, d.x0, h, z0 + t]); if (d.top < h - 0.01) cols.push([d.x0, d.top, z0, d.x1, h, z0 + t]); x = d.x1; }
    if (xb > x + 0.01) cols.push([x, 0, z0, xb, h, z0 + t]);
    return { geos, cols };
  }
  // half-timbered overlay on the outer face (opens = opening rectangles)
  const timber = (h, opens) => () => {
    const z = 2.1, d = 0.05, w = 0.12, gs = [], bar = (x0, y0, x1, y1) => gs.push(fin(box(x0, y0, z, x1, y1, z + d), 'timber'));
    bar(-2, 0, 2, w); bar(-2, h - w, 2, h); bar(-2, w, -2 + w, h - w); bar(2 - w, w, 2, h - w);
    for (const [x0, y0, x1, y1] of opens) {
      if (y0 > 0.01) bar(x0 - w, y0 - w, x1 + w, y0);
      bar(x0 - w, y1, x1 + w, y1 + w); bar(x0 - w, Math.max(y0, w), x0, y1); bar(x1, Math.max(y0, w), x1 + w, y1);
    }
    const brace = (a, b) => gs.push(fin(strut([a, w + 0.05, z + d / 2], [b, h - w - 0.05, z + d / 2], w, d), 'timber'));
    if (!opens.length) { brace(-1.85, 1.85); brace(1.85, -1.85); }
    else {
      const L = Math.min(...opens.map((o) => o[0])) - w, R = Math.max(...opens.map((o) => o[2])) + w;
      if (L + 2 > 0.7) brace(-2 + w + 0.05, L - 0.05);
      if (2 - R > 0.7) brace(2 - w - 0.05, R + 0.05);
    }
    return gs;
  };
  const crossPts = [[-0.12, 0.9], [0.12, 0.9], [0.12, 1.6], [0.45, 1.6], [0.45, 1.84], [0.12, 1.84], [0.12, 2.3], [-0.12, 2.3], [-0.12, 1.84], [-0.45, 1.84], [-0.45, 1.6], [-0.12, 1.6]];
  const OPEN = {
    solid:       { l: 'Wall' },
    door:        { l: 'Door Wall', doors: [{ kind: 'rect', x0: -0.8, x1: 0.8, top: 2.4 }], o: [[-0.8, 0, 0.8, 2.4]] },
    archdoor:    { l: 'Arched Door Wall', doors: [{ kind: 'arch', x0: -0.8, x1: 0.8, top: 2.6 }] },
    gothicdoor:  { l: 'Gothic Door Wall', doors: [{ kind: 'gothic', x0: -0.8, x1: 0.8, top: 2.8 }] },
    segdoor:     { l: 'Segmental Door Wall', doors: [{ kind: 'seg', x0: -0.8, x1: 0.8, top: 2.5 }] },
    widedoor:    { l: 'Wide Door Wall', doors: [{ kind: 'rect', x0: -1.2, x1: 1.2, top: 2.5 }] },
    doublearch:  { l: 'Double Arch Door Wall', doors: [{ kind: 'arch', x0: -1.2, x1: 1.2, top: 2.75 }] },
    garage:      { l: 'Garage Wall', doors: [{ kind: 'rect', x0: -1.6, x1: 1.6, top: 2.6 }] },
    sidedoor:    { l: 'Side Door + Window Wall', doors: [{ kind: 'rect', x0: -1.6, x1: -0.5, top: 2.4 }], holes: [rectH(0.2, 1, 1.5, 2.1)] },
    window:      { l: 'Window Wall', holes: [rectH(-0.8, 0.9, 0.8, 2.1)], o: [[-0.8, 0.9, 0.8, 2.1]] },
    widewindow:  { l: 'Wide Window Wall', holes: [rectH(-1.4, 0.8, 1.4, 2.2)] },
    shopwindow:  { l: 'Shop Window Wall', holes: [rectH(-1.7, 0.6, 1.7, 2.45)] },
    tallwindow:  { l: 'Tall Window Wall', holes: [rectH(-0.5, 0.4, 0.5, 2.5)] },
    twowindows:  { l: 'Two Window Wall', holes: [rectH(-1.5, 0.9, -0.4, 2.1), rectH(0.4, 0.9, 1.5, 2.1)], o: [[-1.5, 0.9, -0.4, 2.1], [0.4, 0.9, 1.5, 2.1]] },
    threewindows:{ l: 'Three Window Wall', holes: [rectH(-1.6, 1, -0.9, 2.3), rectH(-0.35, 1, 0.35, 2.3), rectH(0.9, 1, 1.6, 2.3)] },
    clerestory:  { l: 'Clerestory Wall', holes: [rectH(-1.75, 2.05, 1.75, 2.7)] },
    roundwindow: { l: 'Round Window Wall', holes: [circH(0, 1.6, 0.6)] },
    oculus:      { l: 'Oculus Wall', holes: [circH(0, 1.5, 0.95)] },
    portholes:   { l: 'Porthole Wall', holes: [circH(-1, 1.6, 0.35), circH(1, 1.6, 0.35)] },
    archwindow:  { l: 'Arched Window Wall', holes: [archH(-0.55, 1, 0.55, 2.4)] },
    gothicwindow:{ l: 'Gothic Window Wall', holes: [gothH(-0.5, 0.9, 0.5, 2.55)] },
    twinarch:    { l: 'Twin Arch Window Wall', holes: [archH(-1.3, 1, -0.3, 2.3), archH(0.3, 1, 1.3, 2.3)] },
    diamond:     { l: 'Diamond Window Wall', holes: [polyH([[0, 0.9], [0.7, 1.6], [0, 2.3], [-0.7, 1.6]])] },
    hexwindow:   { l: 'Hex Window Wall', holes: [polyH(ngon(0, 1.6, 0.7, 6))] },
    starwindow:  { l: 'Star Window Wall', holes: [polyH(starPts(0, 1.6, 0.85, 0.36, 5))] },
    crossslit:   { l: 'Cross Slit Wall', holes: [polyH(crossPts)] },
    slit:        { l: 'Arrow Slit Wall', holes: [rectH(-0.12, 0.8, 0.12, 2.4)] },
    vents:       { l: 'Vent Wall', holes: [-1.6, -0.8, 0, 0.8, 1.6].map((x) => rectH(x - 0.15, 2.3, x + 0.15, 2.6)) },
    lattice:     { l: 'Grid Window Wall', holes: [0, 1, 2].flatMap((i) => [0, 1].map((j) => rectH(-1.05 + i * 0.75, 1 + j * 0.65, -0.45 + i * 0.75, 1.55 + j * 0.65))) },
  };
  const HEIGHTS = [[H, '', ''], [H * 1.5, 't', ' (Tall)'], [H * 2, 'x', ' (Double Height)']];
  const HV = { '': '3m', t: '4.5m', x: '6m' };
  for (const [k, o] of Object.entries(OPEN)) for (const [h, hk, hl] of HEIGHTS) {
    put('Walls', `w_${k}${hk}`, { ...wallDef({ h, doors: o.doors, holes: o.holes }), label: o.l + hl }, ['w_' + k, o.l, HV[hk]]);
  }
  Object.assign(aliases, {     // the original walls join their matching family as a 'classic' variant
    wall: ['w_solid', 'Wall', 'classic'], tallwall: ['w_solid', 'Wall', 'classic 4.5m'], doorway: ['w_door', 'Door Wall', 'classic'],
    widedoor: ['w_widedoor', 'Wide Door Wall', 'classic'], arcdoor: ['w_archdoor', 'Arched Door Wall', 'classic'], window: ['w_window', 'Window Wall', 'classic'],
    widewindow: ['w_widewindow', 'Wide Window Wall', 'classic'], roundwindow: ['w_roundwindow', 'Round Window Wall', 'classic'],
    archwindow: ['w_archwindow', 'Arched Window Wall', 'classic'], slitwindow: ['w_slit', 'Arrow Slit Wall', 'classic'],
    halfwall: ['w_low', 'Low Wall', 'classic 1.2m'], halflenwall: ['wh_solid', 'Half-Length Wall', 'classic'],
  });
  for (const [h, hk, hl] of [[1, '1', 'Low Wall (1m)'], [1.5, '15', 'Half Wall (1.5m)'], [2.1, '2', 'Chest Wall (2m)']]) put('Walls', `w_low${hk}`, { ...wallDef({ h }), label: hl }, ['w_low', 'Low Wall', h + 'm']);
  for (const k of ['solid', 'window', 'door', 'twowindows']) {
    const o = OPEN[k];
    put('Walls', `w_${k}_timber`, { ...wallDef({ doors: o.doors, holes: o.holes, extra: timber(H, o.o || []) }), label: 'Timbered ' + o.l });
  }
  const HALF = {
    solid: { l: 'Half-Length Wall' },
    window: { l: 'Half-Length Window', holes: [rectH(-1.55, 0.9, -0.45, 2.1)] },
    door: { l: 'Half-Length Door', doors: [{ kind: 'rect', x0: -1.5, x1: -0.5, top: 2.4 }] },
    arch: { l: 'Half-Length Arched Window', holes: [archH(-1.45, 1, -0.55, 2.4)] },
    round: { l: 'Half-Length Round Window', holes: [circH(-1, 1.6, 0.5)] },
  };
  for (const [k, o] of Object.entries(HALF)) for (const [h, hk, hl] of HEIGHTS.slice(0, 2)) put('Walls', `wh_${k}${hk}`, { ...wallDef({ xa: -2, xb: 0, h, doors: o.doors, holes: o.holes }), label: o.l + hl }, ['wh_' + k, o.l, HV[hk]]);
  put('Walls', 'wq_solid', { ...wallDef({ xa: -1, xb: 0 }), label: 'Quarter-Length Wall' }, ['wq', 'Quarter-Length Wall', '3m']);
  put('Walls', 'wq_low', { ...wallDef({ xa: -1, xb: 0, h: 1.5 }), label: 'Quarter-Length Half Wall' }, ['wq', 'Quarter-Length Wall', '1.5m']);

  // ======================================================================= GABLES + CURVED WALLS (sit on top of walls: base y = H)
  for (const deg of [15, 22.5, 30, 45, 60]) {
    const tn = Math.tan((deg * PI) / 180), tri = (pts) => () => [prism(pts, 0.2).translate(0, H, 2)];
    put('Gables & Curves', `gt_${deg}`, { geos: tri([[-2, 0], [2, 0], [0, 2 * tn]]), cols: [], label: `Gable Triangle ${deg}°` }, ['gt', 'Gable Triangle', deg + '°', deg === 30]);
    put('Gables & Curves', `gr_${deg}`, { geos: tri([[-2, 0], [2, 0], [2, 4 * tn]]), cols: [], label: `Rake Wall ${deg}° (right)` }, ['gr', 'Rake Wall (right)', deg + '°', deg === 30]);
    put('Gables & Curves', `gl_${deg}`, { geos: tri([[-2, 0], [2, 0], [-2, 4 * tn]]), cols: [], label: `Rake Wall ${deg}° (left)` }, ['gl', 'Rake Wall (left)', deg + '°', deg === 30]);
  }
  const arcWall = (cx, cz, R, a0, a1, h, t = 0.2) => {
    const contour = [...arcPts(cx, cz, R, a0, a1, 28), ...arcPts(cx, cz, R - t, a1, a0, 28)];
    const n = Math.max(2, Math.ceil(((a1 - a0) * R) / 0.45));
    const cols = rng(n).map((i) => { const a = a0 + ((a1 - a0) * (i + 0.5)) / n, x = cx + (R - t / 2) * Math.cos(a), z = cz + (R - t / 2) * Math.sin(a); return [x - 0.17, 0, z - 0.17, x + 0.17, h, z + 0.17]; });
    return { geos: () => [extrudeUp(contour, 0, h)], cols };
  };
  const CURVES = {
    q4: ['Curved Wall (wide quarter)', (h) => arcWall(-2, -2, 4, 0, PI / 2, h)],
    q2: ['Curved Wall (tower quarter)', (h) => arcWall(0, 0, 2, 0, PI / 2, h)],
    half: ['Curved Wall (half round)', (h) => arcWall(0, 0, 2, 0, PI, h)],
    ring: ['Round Tower Ring', (h) => { const outer = arcPts(0, 0, 2, 0, 2 * PI, 40).slice(0, -1), inner = arcPts(0, 0, 1.8, 0, 2 * PI, 40).slice(0, -1); return { geos: () => [extrudeUp(outer, 0, h, [inner])], cols: arcWall(0, 0, 2, 0, 2 * PI, h).cols }; }],
  };
  for (const [k, [l, mk]] of Object.entries(CURVES)) for (const [h, hk, hl] of [[H, '', ''], [1.2, 'l', ' (low)'], [H * 2, 'x', ' (double)']]) put('Gables & Curves', `cw_${k}${hk}`, { ...mk(h), label: l + hl }, ['cw_' + k, l, { '': '3m', l: '1.2m', x: '6m' }[hk]]);

  // ======================================================================= FLOORS + PLATFORMS (walkable, exact shapes)
  const circle = (r, n = 32, cx = 0, cz = 0) => arcPts(cx, cz, r, 0, 2 * PI, n).slice(0, -1);
  const FLOOR = {
    sq:      ['Square', () => [[[-2, -2], [2, -2], [2, 2], [-2, 2]], []]],
    half:    ['Half', () => [[[-2, -2], [2, -2], [2, 0], [-2, 0]], []]],
    quarter: ['Quarter', () => [[[-2, -2], [0, -2], [0, 0], [-2, 0]], []]],
    tri:     ['Triangle', () => [[[-2, -2], [2, -2], [-2, 2]], []]],
    round:   ['Round', () => [circle(2), []]],
    qc4:     ['Wide Quarter Circle', () => [[[-2, -2], ...arcPts(-2, -2, 4, 0, PI / 2, 24)], []]],
    qc2:     ['Small Quarter Circle', () => [[[0, 0], ...arcPts(0, 0, 2, 0, PI / 2, 16)], []]],
    semi:    ['Semicircle', () => [[...arcPts(0, 0, 2, 0, PI, 24)], []]],
    inv:     ['Inside Curve', () => [[[2, -2], [2, 2], [-2, 2], ...arcPts(-2, -2, 4, PI / 2, 0, 24).slice(1, -1)], []]],
    hex:     ['Hexagon', () => [ngon(0, 0, 2, 6), []]],
    oct:     ['Octagon', () => [[[2, -0.83], [2, 0.83], [0.83, 2], [-0.83, 2], [-2, 0.83], [-2, -0.83], [-0.83, -2], [0.83, -2]], []]],
    ring:    ['Ring', () => [circle(2), [circle(1.05, 24).reverse()]]],
    sqhole:  ['Square with Round Hole', () => [[[-2, -2], [2, -2], [2, 2], [-2, 2]], [circle(1.1, 24).reverse()]]],
    ell:     ['L-Shape', () => [[[-2, -2], [2, -2], [2, 0], [0, 0], [0, 2], [-2, 2]], []]],
    plus:    ['Cross', () => [[[-0.8, -2], [0.8, -2], [0.8, -0.8], [2, -0.8], [2, 0.8], [0.8, 0.8], [0.8, 2], [-0.8, 2], [-0.8, 0.8], [-2, 0.8], [-2, -0.8], [-0.8, -0.8]], []]],
    diamond: ['Diamond', () => [[[0, -2], [2, 0], [0, 2], [-2, 0]], []]],
    rsq:     ['Rounded Square', () => { const r = 0.8, c = 2 - r; return [[...arcPts(c, -c, r, -PI / 2, 0, 6), ...arcPts(c, c, r, 0, PI / 2, 6), ...arcPts(-c, c, r, PI / 2, PI, 6), ...arcPts(-c, -c, r, PI, 1.5 * PI, 6)], []]; }],
  };
  const SKIP_THIN = new Set(['sq', 'half', 'quarter', 'tri', 'round']);   // already in the base set
  Object.assign(aliases, { floor: ['fl_sq', 'Square Floor', '0.2m floor', true], halffloor: ['fl_half', 'Half Floor', '0.2m floor', true], quarterfloor: ['fl_quarter', 'Quarter Floor', '0.2m floor', true], diagfloor: ['fl_tri', 'Triangle Floor', '0.2m floor', true], roundfloor: ['fl_round', 'Round Floor', '0.2m floor', true] });
  for (const [k, [l, shape]] of Object.entries(FLOOR)) {
    const [c, hs] = shape();
    const fam = (v, d) => ['fl_' + k, `${l} Floor`, v, d];
    if (!SKIP_THIN.has(k)) put('Floors', `fl_${k}`, { ...slabPiece(planTris(c, hs, 0.2), 0.2), label: `${l} Floor` }, fam('0.2m floor', true));
    put('Floors', `fl5_${k}`, { ...slabPiece(planTris(c, hs, 0.5), 0.5), label: `${l} Slab (0.5m)` }, fam('0.5m slab'));
    put('Floors', `fl10_${k}`, { ...slabPiece(planTris(c, hs, 1), 1), label: `${l} Platform (1m)` }, fam('1m platform'));
  }

  // ======================================================================= FOUNDATIONS
  const FCOL = [[-2, -1, -2, 2, 0, 2]];
  const fnd = (k, label, geos, extra = {}) => put('Foundations', `fnd_${k}`, { geos, cols: FCOL, found: true, label, ...extra });
  fnd('slab', 'Thin Slab', () => B([-2, -0.3, -2, 2, 0, 2]));
  fnd('block', 'Raised Plinth (1.5m)', () => B([-2, -1.5, -2, 2, 0, 2], [-2.04, -0.16, -2.04, 2.04, 0, 2.04]), { stilt: [-1.5, 0.6] });
  fnd('tall', 'Tall Plinth (3m)', () => B([-2, -3, -2, 2, 0, 2], [-2.04, -0.16, -2.04, 2.04, 0, 2.04], [-2.04, -1.6, -2.04, 2.04, -1.45, 2.04]), { stilt: [-3, 0.6] });
  fnd('brick', 'Banded Plinth', () => B([-2, -1, -2, 2, 0, 2], [-2.03, -0.55, -2.03, 2.03, -0.45, 2.03], [-2.04, -0.14, -2.04, 2.04, 0, 2.04]));
  fnd('grate', 'Metal Grate Deck', () => [...F('iron', [-2, -0.25, -2, 2, -0.1, -1.88], [-2, -0.25, 1.88, 2, -0.1, 2], [-2, -0.25, -1.88, -1.88, -0.1, 1.88], [1.88, -0.25, -1.88, 2, -0.1, 1.88]), ...rng(13).map((i) => fin(box(-1.88, -0.1, -1.88 + i * 0.29, 1.88, 0, -1.8 + i * 0.29), 'iron')), ...[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].map(([x, z]) => fin(cylAt(0.1, -2.5, -0.25, x, z, 8), 'iron'))], { stilt: [-2.5, 0.6] });
  fnd('log', 'Log Crib Base', () => [...B([-2, -0.15, -2, 2, 0, 2]), ...[0, 1, 2].flatMap((i) => (i % 2 ? [tubeX(0.18, -2, 2, -0.35 - i * 0.34, -1.7), tubeX(0.18, -2, 2, -0.35 - i * 0.34, 1.7)] : [tubeZ(0.18, -2, 2, -0.35 - i * 0.34, -1.7), tubeZ(0.18, -2, 2, -0.35 - i * 0.34, 1.7)]))]);
  fnd('round', 'Round Pedestal Base', () => [cyl(2, -1, 0, 32), cyl(2.06, -0.12, 0, 32)]);
  fnd('piles', 'Pile Foundation', () => [...B([-2, -0.3, -2, 2, 0, 2]), ...[-1.6, 0, 1.6].flatMap((x) => [-1.6, 0, 1.6].map((z) => cylAt(0.14, -4, -0.3, x, z, 8)))], { stilt: [-4, 0.6] });
  fnd('rock', 'Natural Rock Base', () => [...B([-2, -0.3, -2, 2, 0, 2]), new THREE.IcosahedronGeometry(2.3, 1).scale(1, 0.75, 1).translate(0, -1.9, 0)], { stilt: [-3, 0.6] });

  // ======================================================================= STAIRS, SPIRALS, RAMPS
  const stairDef = (style, total, hw) => {
    const n = Math.round(total / 0.25), w = T / n, rise = total / n, t = 0.1;
    const cols = rng(n).map((i) => [-2 + i * w, 0, -hw, -2 + (i + 1) * w, (i + 1) * rise, hw]);
    const geos = () => {
      if (style === 'solid') return cols.map((c) => box(...c));
      const out = cols.flatMap(([x0, , , x1, y1]) => (style === 'open' ? [box(x0 + 0.02, y1 - t, -hw + 0.12, x1, y1, hw - 0.12)] : [box(x0, y1 - t, -hw, x1, y1, hw), box(x0, y1 - rise, -hw, x0 + t, y1, hw)]));
      if (style === 'open') for (const z of [-hw + 0.06, hw - 0.06]) out.push(fin(strut([-2, 0, z], [2, total, z], 0.22, 0.1), 'timber'));
      return out;
    };
    return { geos, cols };
  };
  const SN = { hollow: 'Stairs', solid: 'Block Stairs', open: 'Open Tread Stairs' };
  for (const style of ['hollow', 'solid', 'open']) for (const [total, tk, tl] of [[H, 'f', ''], [H / 2, 'h', ' (half level)']]) for (const [hw, wk, wl] of [[2, '', ''], [1, 'n', ' narrow'], [0.6, 's', ' slim']]) {
    put('Access', `st_${style}_${tk}${wk}`, { ...stairDef(style, total, hw), label: `${SN[style]}${tl}${wl}` }, ['st_' + style, SN[style], `${tk === 'f' ? 'full' : 'half'} · ${wl.trim() || 'wide'}`]);
  }
  const spiral = (R, turns) => {
    const n = 12 * turns, rise = (H * turns) / n, cols = [];
    for (let i = 0; i < n; i++) { const a = (i + 0.5) * ((2 * PI) / 12), r = (R + 0.2) / 2; cols.push([r * Math.cos(a) - 0.38, 0, -r * Math.sin(a) - 0.38, r * Math.cos(a) + 0.38, (i + 1) * rise, -r * Math.sin(a) + 0.38]); }
    const geos = () => [cyl(0.2, 0, H * turns + 0.9, 14), ...rng(n).map((i) => new THREE.BoxGeometry(R - 0.2, 0.1, R * 0.5).translate((R + 0.2) / 2, (i + 1) * rise - 0.05, 0).rotateY((i + 0.5) * ((2 * PI) / 12)))];
    return { geos, cols };
  };
  put('Access', 'spiral_w1', { ...spiral(2, 1), label: 'Spiral Stair (wide)' }, ['spiral', 'Spiral Stair', 'wide']);
  put('Access', 'spiral_w2', { ...spiral(2, 2), label: 'Spiral Stair (wide, 2 levels)' }, ['spiral', 'Spiral Stair', 'wide ×2']);
  put('Access', 'spiral_s1', { ...spiral(1.3, 1), label: 'Spiral Stair (tight)' }, ['spiral', 'Spiral Stair', 'tight']);
  put('Access', 'spiral_s2', { ...spiral(1.3, 2), label: 'Spiral Stair (tight, 2 levels)' }, ['spiral', 'Spiral Stair', 'tight ×2']);
  const rampDef = (r, hw) => ({ geos: () => [slab([[[-2, 0, -hw], [2, r, -hw], [2, r, hw]], [[-2, 0, -hw], [2, r, hw], [-2, 0, hw]]], 0.15)], cols: [], ramp: true, rise: r, hw });
  for (const [r, rk, rl] of [[0.75, 'q', 'Gentle Ramp (0.75m)'], [2.25, 'm', 'Ramp (2.25m)'], [H * 1.5, 't', 'Steep Ramp (4.5m)']]) {
    put('Access', `ramp_${rk}`, { ...rampDef(r, 2), label: rl }, ['ramp', 'Ramp', rl.match(/\((.*)\)/)[1]]);
    put('Access', `narrowramp_${rk}`, { ...rampDef(r, 1), label: rl + ' narrow' }, ['ramp', 'Ramp', rl.match(/\((.*)\)/)[1] + ' narrow']);
  }
  Object.assign(aliases, { ramp: ['ramp', 'Ramp', '3m', true], lowramp: ['ramp', 'Ramp', '1.5m'], narrowramp: ['ramp', 'Ramp', '3m narrow'] });
  put('Access', 'ladder', { geos: () => [...[-0.3, 0.3].map((x) => box(x - 0.04, 0, 1.82, x + 0.04, H, 1.9)), ...rng(9).map((i) => tubeX(0.025, -0.3, 0.3, 0.3 + i * 0.32, 1.86))], cols: [], label: 'Ladder (decor)' });

  // ======================================================================= ROOFS (base y = H; walkable panels)
  const profRoof = (pts) => {
    const tris = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [xa, ha] = pts[i], [xb, hb] = pts[i + 1];
      tris.push([[xa, H + ha, -2.2], [xb, H + hb, -2.2], [xb, H + hb, 2.2]], [[xa, H + ha, -2.2], [xb, H + hb, 2.2], [xa, H + ha, 2.2]]);
    }
    return slabPiece(tris, 0.15);
  };
  const curve = (f, n = 12) => rng(n + 1).map((i) => { const u = -1 + (2 * i) / n; return [2.2 * u, f(u)]; });
  for (const r of [0.6, 1.4, 2.4, 4.4]) put('Roofs', `rf_gable${r}`, { ...profRoof([[-2.2, 0], [0, r], [2.2, 0]]), label: `Gable Roof (${r}m rise)` }, ['rf_gable', 'Gable Roof', r + 'm']);
  Object.assign(aliases, { roof: ['rf_gable', 'Gable Roof', '1.8m', true], lowroof: ['rf_gable', 'Gable Roof', '1m'], steeproof: ['rf_gable', 'Gable Roof', '3.2m'], shedroof: ['rf_shed', 'Shed Roof', '1.4m', true] });
  put('Roofs', 'rf_saltbox', { ...profRoof([[-2.2, 0], [0.8, 2], [2.2, 1.1]]), label: 'Saltbox Roof' }, ['rf_saltbox', 'Saltbox Roof', 'low']);
  put('Roofs', 'rf_saltbox2', { ...profRoof([[-2.2, 0], [1.3, 2.6], [2.2, 1.8]]), label: 'Tall Saltbox Roof' }, ['rf_saltbox', 'Saltbox Roof', 'tall']);
  put('Roofs', 'rf_mansard', { ...profRoof([[-2.2, 0], [-1.7, 2], [1.7, 2], [2.2, 0]]), label: 'Mansard Roof' }, ['rf_mansard', 'Mansard Roof', 'flat top']);
  put('Roofs', 'rf_mansard2', { ...profRoof([[-2.2, 0], [-1.6, 1.8], [0, 2.4], [1.6, 1.8], [2.2, 0]]), label: 'Mansard Roof (peaked)' }, ['rf_mansard', 'Mansard Roof', 'peaked']);
  put('Roofs', 'rf_barn', { ...profRoof([[-2.2, 0], [-1.6, 1.6], [0, 2.3], [1.6, 1.6], [2.2, 0]]), label: 'Tall Barn Roof' });
  put('Roofs', 'rf_arched', { ...profRoof(curve((u) => 1.3 * Math.sqrt(Math.max(0, 1 - u * u)))), label: 'Arched Roof (low)' }, ['rf_arched', 'Arched Roof', 'low']);
  put('Roofs', 'rf_arched2', { ...profRoof(curve((u) => 2.2 * Math.sqrt(Math.max(0, 1 - u * u)))), label: 'Arched Roof (high)' }, ['rf_arched', 'Arched Roof', 'high']);
  put('Roofs', 'rf_bell', { ...profRoof(curve((u) => 2.4 * Math.pow(1 - Math.abs(u), 1.8))), label: 'Bell Roof' }, ['rf_bell', 'Bell Roof', 'standard']);
  put('Roofs', 'rf_bell2', { ...profRoof(curve((u) => 3.4 * Math.pow(1 - Math.abs(u), 1.8))), label: 'Tall Bell Roof' }, ['rf_bell', 'Bell Roof', 'tall']);
  put('Roofs', 'rf_ogee', { ...profRoof(curve((u) => { const s = 1 - Math.abs(u); return 2.4 * s * s * (3 - 2 * s); })), label: 'Ogee Roof' });
  put('Roofs', 'rf_pagoda', { ...profRoof(curve((u) => 2.6 * Math.pow(1 - Math.abs(u), 2.4) + 0.35 * Math.pow(Math.abs(u), 6))), label: 'Pagoda Roof (flared eaves)' });
  put('Roofs', 'rf_curvedshed', { ...profRoof(curve((u) => 2 * Math.sin(((u + 1) / 2) * (PI / 2)))), label: 'Curved Shed Roof' });
  for (const r of [0.7, 2.2, 3.2]) put('Roofs', `rf_shed${r}`, { ...profRoof([[-2.2, 0], [2.2, r]]), label: `Shed Roof (${r}m rise)` }, ['rf_shed', 'Shed Roof', r + 'm']);
  for (const r of [1, 1.8, 3.2]) {
    const A = [0, H + r, 0], E = [0, H + r, 2.2], p = (x, z) => [x, H, z];
    put('Roofs', `rf_hipend${r}`, { ...slabPiece([[p(-2.2, -2.2), p(-2.2, 2.2), E], [p(-2.2, -2.2), E, A], [p(2.2, 2.2), p(2.2, -2.2), A], [p(2.2, 2.2), A, E], [p(-2.2, -2.2), A, p(2.2, -2.2)]], 0.15), label: `Hip End Roof (${r}m)` }, ['rf_hipend', 'Hip End Roof', r + 'm']);
  }
  for (const r of [1, 3, 4.5]) {
    const A = [0, H + r, 0], p = (x, z) => [x, H, z];
    put('Roofs', `rf_hip4_${r}`, { ...slabPiece([[p(-2.2, -2.2), p(2.2, -2.2), A], [p(2.2, -2.2), p(2.2, 2.2), A], [p(2.2, 2.2), p(-2.2, 2.2), A], [p(-2.2, 2.2), p(-2.2, -2.2), A]], 0.15), label: `Hip Roof (${r}m, walkable)` }, ['rf_hip4', 'Hip Roof', r + 'm']);
  }
  put('Roofs', 'rf_eaveflat', { geos: () => [box(-2.4, H, -2.4, 2.4, H + 0.22, 2.4), ...F('timber', [-2.45, H - 0.08, -2.45, 2.45, H + 0.04, -2.35], [-2.45, H - 0.08, 2.35, 2.45, H + 0.04, 2.45])], cols: [[-2.4, H, -2.4, 2.4, H + 0.22, 2.4]], label: 'Flat Roof with Eaves' });
  put('Roofs', 'rf_terrace', { geos: () => [box(-2.2, H, -2.2, 2.2, H + 0.2, 2.2), ...B([-2.2, H + 0.2, 1.95, 2.2, H + 0.6, 2.2], [-2.2, H + 0.2, -2.2, 2.2, H + 0.6, -1.95])], cols: [[-2.2, H, -2.2, 2.2, H + 0.2, 2.2]], label: 'Roof Terrace' });
  put('Roofs', 'rf_green', { geos: () => [box(-2.2, H, -2.2, 2.2, H + 0.2, 2.2), fin(box(-2.1, H + 0.2, -2.1, 2.1, H + 0.32, 2.1), 'moss')], cols: [[-2.2, H, -2.2, 2.2, H + 0.32, 2.2]], label: 'Green Roof' });

  // ======================================================================= DOMES + SPIRES (shells)
  const DS = 'Domes & Spires', up = (g) => g.translate(0, H, 0);
  put(DS, 'ds_cone_low', { geos: () => [up(cone(2.8, 1.2, 0, 0, 0, 24))], cols: [], label: 'Low Cone Roof' }, ['ds_cone', 'Cone Roof', 'low']);
  put(DS, 'ds_cone_tall', { geos: () => [up(cone(2.8, 3.6, 0, 0, 0, 24))], cols: [], label: 'Tall Cone Roof' }, ['ds_cone', 'Cone Roof', 'tall']);
  put(DS, 'ds_witch', { geos: () => [up(lathe([[2.4, 0], [1.6, 0.6], [1, 1.6], [0.5, 3.2], [0.15, 5], [0, 6]], 24))], cols: [], label: 'Witch Hat Roof' });
  put(DS, 'ds_oct', { geos: () => [up(new THREE.ConeGeometry(2.8, 2.4, 8, 1, true).translate(0, 1.2, 0))], cols: [], label: 'Octagonal Cone Roof' });
  put(DS, 'ds_onion', { geos: () => [up(lathe([[1.6, 0], [2.1, 0.8], [2, 1.6], [1.3, 2.4], [0.5, 3.1], [0.12, 3.7], [0, 4]], 28))], cols: [], label: 'Onion Dome' });
  put(DS, 'ds_bell', { geos: () => [up(lathe([[2.2, 0], [2, 0.3], [1.7, 1], [1.5, 1.8], [1, 2.4], [0, 2.6]], 28))], cols: [], label: 'Bell Dome' });
  put(DS, 'ds_pagoda', { geos: () => [0, 1, 2].map((i) => up(lathe([[2.8 - i * 0.7, i * 1.1], [2.2 - i * 0.65, i * 1.1 + 0.3], [1.2 - i * 0.35, i * 1.1 + 1.1]], 4).rotateY(PI / 4))), cols: [], label: 'Pagoda Tiers' });
  put(DS, 'ds_bigdome', { geos: () => [up(new THREE.SphereGeometry(2.8, 32, 14, 0, 2 * PI, 0, PI / 2))], cols: [], label: 'Large Dome' }, ['ds_dome', 'Dome', 'large']);
  put(DS, 'ds_lowdome', { geos: () => [up(new THREE.SphereGeometry(2.4, 32, 12, 0, 2 * PI, 0, PI / 2).scale(1, 0.45, 1))], cols: [], label: 'Low Dome' }, ['ds_dome', 'Dome', 'low']);
  put(DS, 'ds_halfdome', { geos: () => [new THREE.SphereGeometry(2, 24, 12, 0, PI, 0, PI / 2).translate(0, H, 0)], cols: [], label: 'Half Dome (apse)' });
  put(DS, 'ds_geodesic', { geos: () => [up(new THREE.SphereGeometry(2, 8, 4, 0, 2 * PI, 0, PI / 2))], cols: [], label: 'Faceted Dome' });
  put(DS, 'ds_cupola', { geos: () => [up(new THREE.SphereGeometry(2, 24, 10, 0, 2 * PI, 0, PI / 2)), ...rng(6).map((i) => up(cylAt(0.06, 2, 2.9, 0.5 * Math.cos((i * PI) / 3), 0.5 * Math.sin((i * PI) / 3), 6))), up(cone(0.7, 0.8, 0, 2.9, 0, 12)), fin(up(sph(0.12, 0, 3.8, 0)), 'brass')], cols: [], label: 'Dome with Cupola' });
  for (const [h, r, k, l] of [[6, 1.4, 'spire6', 'Spire (6m)'], [9, 1.2, 'spire9', 'Tall Spire (9m)'], [8, 0.5, 'needle', 'Needle Spire']]) put(DS, `ds_${k}`, { geos: () => [up(cone(r, h, 0, 0, 0, 8))], cols: [], label: l }, ['ds_spire', 'Spire', { spire6: '6m', spire9: '9m', needle: 'needle 8m' }[k]]);
  put(DS, 'ds_orbspire', { geos: () => [up(cone(1.2, 5, 0, 0, 0, 8)), fin(up(sph(0.3, 0, 5.2, 0)), 'brass')], cols: [], label: 'Spire with Orb' }, ['ds_spire', 'Spire', 'with orb']);
  put(DS, 'ds_twist', { geos: () => rng(16).map((i) => up(box(-1 + i * 0.06, i * 0.4, -1 + i * 0.06, 1 - i * 0.06, i * 0.4 + 0.4, 1 - i * 0.06).rotateY(i * 0.18))), cols: [], label: 'Twisted Spire' });

  // ======================================================================= COLUMNS
  const capBase = (h, r) => [box(-r, 0, -r, r, 0.15, r), box(-r, h - 0.15, -r, r, h, r)];
  const COL = {
    tuscan:  ['Tuscan', 0.45, (h) => [lathe([[0, 0], [0.45, 0], [0.45, 0.1], [0.38, 0.18], [0.3, 0.24], [0.27, 0.3], [0.24, h - 0.3], [0.27, h - 0.25], [0.34, h - 0.18], [0.34, h - 0.12], [0, h - 0.12]]), box(-0.42, h - 0.12, -0.42, 0.42, h, 0.42)]],
    doric:   ['Doric', 0.4, (h) => [lathe([[0, 0], [0.31, 0], [0.26, h - 0.26], [0.37, h - 0.15], [0, h - 0.15]]), box(-0.4, h - 0.15, -0.4, 0.4, h, 0.4)]],
    fluted:  ['Fluted', 0.38, (h) => [cyl(0.24, 0.15, h - 0.15, 16), ...rng(16).map((i) => box(-0.035, 0.15, 0.22, 0.035, h - 0.15, 0.29).rotateY((i * 2 * PI) / 16)), cyl(0.38, 0, 0.15, 24), cyl(0.38, h - 0.15, h, 24)]],
    twisted: ['Twisted', 0.3, (h) => [...rng(24).map((i) => box(-0.2, 0.15 + (i * (h - 0.3)) / 24, -0.2, 0.2, 0.15 + ((i + 1) * (h - 0.3)) / 24, 0.2).rotateY(i * 0.09)), ...capBase(h, 0.3)]],
    oct:     ['Octagonal', 0.3, (h) => [new THREE.CylinderGeometry(0.3, 0.3, h, 8).translate(0, h / 2, 0)]],
    square:  ['Square', 0.32, (h) => [box(-0.25, 0, -0.25, 0.25, h, 0.25), ...capBase(h, 0.32)]],
    brick:   ['Brick Pier', 0.33, (h) => [box(-0.3, 0, -0.3, 0.3, h, 0.3), ...rng(Math.floor(h / 0.6)).map((i) => box(-0.33, 0.5 + i * 0.6, -0.33, 0.33, 0.58 + i * 0.6, 0.33))]],
    log:     ['Log', 0.26, (h) => [cyl(0.25, 0, h, 12), fin(cyl(0.2, h - 0.02, h, 12), 'timber')]],
    bundled: ['Bundled', 0.27, (h) => [...[[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]].map(([x, z]) => cylAt(0.1, 0, h, x, z, 10)), fin(cyl(0.26, h * 0.3, h * 0.3 + 0.08, 16), 'iron'), fin(cyl(0.26, h * 0.7, h * 0.7 + 0.08, 16), 'iron')]],
    stacked: ['Stacked Stone', 0.36, (h) => rng(Math.round(h / 0.3)).map((i) => { const j = (k) => 0.05 * Math.sin(i * 7.1 + k); return box(-0.3 + j(1), i * 0.3, -0.3 + j(2), 0.3 + j(3), (i + 1) * 0.3, 0.3 + j(4)).rotateY(0.15 * Math.sin(i * 3)); })],
    cage:    ['Arcane Cage', 0.3, (h) => [...[[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].map(([x, z]) => fin(cylAt(0.04, 0, h, x, z, 6), 'iron')), ...[0.2, h / 2 - 0.35, h / 2 + 0.35, h - 0.2].map((y) => fin(new THREE.TorusGeometry(0.31, 0.03, 6, 20).rotateX(PI / 2).translate(0, y, 0), 'iron')), fin(sph(0.17, 0, h / 2, 0), 'aqua')], (h) => [[0, h / 2, 0, 0.05]]],
    tapered: ['Tapered', 0.35, (h) => [new THREE.CylinderGeometry(0.2, 0.35, h, 16).translate(0, h / 2, 0)]],
  };
  for (const [k, [l, r, mk, glow]] of Object.entries(COL)) for (const [h, hk, hl] of [[H, '', ''], [H * 2, 'x', ' (double)'], [H / 2, 'p', ' Pedestal']]) {
    put('Columns', `col_${k}${hk}`, { geos: () => mk(h), cols: [[-r, 0, -r, r, h, r]], label: `${l} Column${hl}`, ...(glow ? { glow: glow(h) } : {}) }, ['col_' + k, `${l} Column`, { '': '3m', x: '6m', p: '1.5m pedestal' }[hk]]);
  }
  for (const k of ['tuscan', 'fluted', 'square', 'log', 'brick', 'stacked']) {
    const [l, r, mk] = COL[k];
    put('Supports', `colc_${k}`, { geos: () => mk(H).map((g) => g.translate(2, 0, 2)), cols: [[2 - r, 0, 2 - r, 2 + r, H, 2 + r]], label: `${l} Corner Column` });
  }

  // ======================================================================= ARCHES + BEAMS (edge)
  const AB = 'Arches & Beams';
  const arches = {
    post: ['Post & Lintel', (h) => [{ kind: 'rect', x0: -1.7, x1: 1.7, top: h - 0.4 }]],
    round: ['Round Arch', (h) => [{ kind: 'arch', x0: -1.7, x1: 1.7, top: h - 0.25 }]],
    seg: ['Segmental Arch', (h) => [{ kind: 'seg', x0: -1.7, x1: 1.7, top: h - 0.3 }]],
    arcade2: ['Twin Arcade', (h) => [{ kind: 'arch', x0: -1.85, x1: -0.15, top: h - 0.3 }, { kind: 'arch', x0: 0.15, x1: 1.85, top: h - 0.3 }]],
    arcade3: ['Triple Arcade', (h) => [-1.25, 0, 1.25].map((c) => ({ kind: 'arch', x0: c - 0.5, x1: c + 0.5, top: h - 0.35 }))],
  };
  for (const [k, [l, mk]] of Object.entries(arches)) for (const [h, hk, hl] of HEIGHTS.slice(0, 2)) put(AB, `ar_${k}${hk}`, { ...wallDef({ h, doors: mk(h) }), label: l + hl }, ['ar_' + k, l, HV[hk]]);
  put(AB, 'ar_gothict', { ...wallDef({ h: H * 1.5, doors: [{ kind: 'gothic', x0: -1.6, x1: 1.6, top: H * 1.5 - 0.3 }] }), label: 'Gothic Arch (Tall)' });
  put(AB, 'ar_bridge', { ...wallDef({ h: H, z0: 1.75, t: 0.5, doors: [{ kind: 'arch', x0: -1.7, x1: 1.7, top: H - 0.35 }] }), label: 'Thick Bridge Arch' });
  put(AB, 'ar_bridgeseg', { ...wallDef({ h: H, z0: 1.75, t: 0.5, doors: [{ kind: 'seg', x0: -1.8, x1: 1.8, top: H - 0.4 }] }), label: 'Thick Segmental Arch' });
  put(AB, 'bm_log', { geos: () => [tubeX(0.2, -2, 2, H - 0.2, 2, 12)], cols: [[-2, H - 0.4, 1.8, 2, H, 2.2]], label: 'Log Beam' });
  put(AB, 'bm_ibeam', { geos: () => F('iron', [-2, H - 0.06, 1.86, 2, H, 2.14], [-2, H - 0.36, 1.86, 2, H - 0.3, 2.14], [-2, H - 0.3, 1.97, 2, H - 0.06, 2.03]), cols: [[-2, H - 0.36, 1.86, 2, H, 2.14]], label: 'Steel I-Beam' });
  put(AB, 'bm_truss', { geos: () => [...B([-2, H - 0.1, 1.94, 2, H, 2.06], [-2, H - 0.9, 1.94, 2, H - 0.8, 2.06]), ...rng(8).map((i) => strut([-2 + i * 0.5, i % 2 ? H - 0.1 : H - 0.8, 2], [-1.5 + i * 0.5, i % 2 ? H - 0.8 : H - 0.1, 2], 0.08, 0.1))], cols: [[-2, H - 0.9, 1.94, 2, H, 2.06]], label: 'Flat Truss' });
  put(AB, 'bm_corbel', { geos: () => [box(-2, H - 0.3, 1.85, 2, H, 2.15), ...B([-2, H - 0.75, 1.88, -1.65, H - 0.3, 2.12], [1.65, H - 0.75, 1.88, 2, H - 0.3, 2.12]), strut([-1.65, H - 0.7, 2], [-1.1, H - 0.3, 2], 0.12, 0.2), strut([1.65, H - 0.7, 2], [1.1, H - 0.3, 2], 0.12, 0.2)], cols: [[-2, H - 0.3, 1.85, 2, H, 2.15]], label: 'Corbelled Beam' });
  put(AB, 'truss_king', { geos: () => [box(-2.2, H, -0.08, 2.2, H + 0.15, 0.08), strut([-2.2, H + 0.1, 0], [0, H + 1.8, 0], 0.15, 0.15), strut([2.2, H + 0.1, 0], [0, H + 1.8, 0], 0.15, 0.15), box(-0.08, H + 0.15, -0.08, 0.08, H + 1.75, 0.08), strut([0, H + 0.15, 0], [-1.1, H + 0.9, 0], 0.1, 0.1), strut([0, H + 0.15, 0], [1.1, H + 0.9, 0], 0.1, 0.1)], cols: [], label: 'King Post Truss' });
  put(AB, 'truss_scissor', { geos: () => [strut([-2.2, H, 0], [0, H + 1.8, 0], 0.15, 0.15), strut([2.2, H, 0], [0, H + 1.8, 0], 0.15, 0.15), strut([-2.2, H, 0], [1.1, H + 0.9, 0], 0.12, 0.12), strut([2.2, H, 0], [-1.1, H + 0.9, 0], 0.12, 0.12)], cols: [], label: 'Scissor Truss' });

  // ======================================================================= RAILINGS + FENCES (edge, full or half length)
  const sag = (x0, x1, y, s, z, n = 10) => new THREE.CatmullRomCurve3(rng(n + 1).map((i) => { const t = i / n; return new THREE.Vector3(x0 + (x1 - x0) * t, y - s * 4 * t * (1 - t), z); }));
  const postXs = (xa, xb) => (xb - xa > 3 ? [xa + 0.06, (xa + xb) / 2, xb - 0.06] : [xa + 0.06, xb - 0.06]);
  const RAIL = {
    posts2:  ['Post & Rail', (a, b) => [...postXs(a, b).map((x) => box(x - 0.06, 0, 1.94, x + 0.06, 1.05, 2.06)), box(a, 0.45, 1.96, b, 0.53, 2.04), box(a, 0.92, 1.95, b, 1.02, 2.05)]],
    turned:  ['Turned Balusters', (a, b) => [...rng(Math.round((b - a) / 0.4)).map((i) => lathe([[0, 0], [0.07, 0], [0.07, 0.1], [0.045, 0.2], [0.085, 0.45], [0.04, 0.72], [0.055, 0.86], [0, 0.86]], 10).translate(a + 0.2 + i * 0.4, 0.08, 2)), box(a, 0.92, 1.91, b, 1.04, 2.09), box(a, 0, 1.93, b, 0.08, 2.07)]],
    iron:    ['Wrought Iron', (a, b) => F('iron', ...rng(Math.round((b - a) / 0.14)).map((i) => [a + 0.07 + i * 0.14 - 0.012, 0.05, 1.988, a + 0.07 + i * 0.14 + 0.012, 1, 2.012]), [a, 0.05, 1.98, b, 0.1, 2.02], [a, 0.95, 1.98, b, 1.02, 2.02])],
    spear:   ['Spear Fence', (a, b) => rng(Math.round((b - a) / 0.18)).flatMap((i) => { const x = a + 0.09 + i * 0.18; return [fin(cylAt(0.022, 0, 1.5, x, 2, 6), 'iron'), fin(cone(0.05, 0.16, x, 1.5, 2, 6), 'iron')]; }).concat(F('iron', [a, 0.15, 1.97, b, 0.21, 2.03], [a, 1.28, 1.97, b, 1.34, 2.03]))],
    picket:  ['Pointed Pickets', (a, b) => [...rng(Math.round((b - a) / 0.3)).flatMap((i) => { const x = a + 0.15 + i * 0.3; return [box(x - 0.06, 0, 1.97, x + 0.06, 1, 2.03), new THREE.ConeGeometry(0.085, 0.16, 4).rotateY(PI / 4).translate(x, 1.08, 2)]; }), ...F('timber', [a, 0.3, 2.03, b, 0.4, 2.08], [a, 0.72, 2.03, b, 0.82, 2.08])]],
    rope:    ['Rope Barrier', (a, b) => [...postXs(a, b).map((x) => cylAt(0.07, 0, 1, x, 2, 10)), ...postXs(a, b).slice(0, -1).flatMap((x, i, xs) => { const x1 = postXs(a, b)[i + 1]; return [0.95, 0.55].map((y) => fin(new THREE.TubeGeometry(sag(x, x1, y, 0.14, 2), 12, 0.025, 5), 'linen')); })]],
    glass:   ['Glass Balustrade', (a, b) => [box(a + 0.05, 0.08, 1.985, b - 0.05, 1, 2.015), ...F('timber', [a, 1, 1.95, b, 1.08, 2.05]), ...F('iron', [a, 0, 1.96, b, 0.08, 2.04])]],
    parapet: ['Stone Parapet', (a, b) => B([a, 0, 1.88, b, 0.85, 2.12], [a, 0.85, 1.84, b, 1, 2.16])],
    crenel:  ['Crenellated Parapet', (a, b) => [box(a, 0, 1.88, b, 0.8, 2.12), ...rng(Math.round((b - a) / 0.8)).map((i) => box(a + i * 0.8 + 0.2, 0.8, 1.88, a + i * 0.8 + 0.6, 1.35, 2.12))]],
    log:     ['Log Fence', (a, b) => [...postXs(a, b).map((x) => cylAt(0.1, 0, 1.1, x, 2, 10)), tubeX(0.07, a, b, 0.45, 2), tubeX(0.07, a, b, 0.92, 2)]],
    wattle:  ['Woven Wattle', (a, b) => [...rng(Math.round((b - a) / 0.3) + 1).map((i) => cylAt(0.03, 0, 1.05, Math.min(b - 0.03, a + 0.03 + i * 0.3), 2, 6)), ...rng(8).map((r) => fin(box(a, 0.1 + r * 0.11, r % 2 ? 1.95 : 2.01, b, 0.18 + r * 0.11, r % 2 ? 1.99 : 2.05), 'timber'))]],
    chain:   ['Chain Barrier', (a, b) => { const xs = postXs(a, b), out = xs.map((x) => box(x - 0.07, 0, 1.93, x + 0.07, 0.9, 2.07)); for (let i = 0; i < xs.length - 1; i++) { const c = sag(xs[i], xs[i + 1], 0.8, 0.2, 2), n = Math.round((xs[i + 1] - xs[i]) / 0.1); for (let j = 0; j <= n; j++) { const p = c.getPoint(j / n), g = new THREE.TorusGeometry(0.045, 0.012, 4, 8); if (j % 2) g.rotateY(PI / 2); out.push(fin(g.translate(p.x, p.y, p.z), 'iron')); } } return out; }],
    hedge:   ['Hedge Row', (a, b) => [fin(box(a, 0, 1.75, b, 1.15, 2.25), 'leaves'), ...rng(Math.round((b - a) / 0.5)).map((i) => fin(sph(0.3, a + 0.25 + i * 0.5, 1.12, 2, 8, 6), 'leaves'))]],
    cable:   ['Cable Rail', (a, b) => [...postXs(a, b).map((x) => box(x - 0.05, 0, 1.95, x + 0.05, 1.05, 2.05)), ...[0.2, 0.45, 0.7, 0.95].map((y) => fin(tubeX(0.012, a, b, y, 2, 5), 'iron'))]],
    lattice: ['Diagonal Lattice', (a, b) => [...B([a, 0, 1.95, b, 0.08, 2.05], [a, 0.98, 1.95, b, 1.06, 2.05]), ...rng(Math.round((b - a) / 0.45)).flatMap((i) => { const x = a + i * 0.45; return [strut([x, 0.08, 1.99], [Math.min(b, x + 0.9), 0.98, 1.99], 0.04, 0.03), strut([Math.min(b, x + 0.9), 0.08, 2.02], [x, 0.98, 2.02], 0.04, 0.03)]; })]],
  };
  for (const [k, [l, mk]] of Object.entries(RAIL)) {
    put('Railings', `rl_${k}`, { geos: () => mk(-2, 2), cols: [[-2, 0, 1.9, 2, 1, 2.1]], label: l }, ['rl_' + k, l, 'full length']);
    put('Railings', `rlh_${k}`, { geos: () => mk(-2, 0), cols: [[-2, 0, 1.9, 0, 1, 2.1]], label: l + ' (half)' }, ['rl_' + k, l, 'half length']);
  }

  // ======================================================================= DOORS + WINDOW INSERTS (fit the standard openings; walk-through)
  const DW = 'Doors & Windows';
  const leaf = (x0, x1, top) => box(x0 + 0.02, 0, 1.97, x1 - 0.02, top - 0.02, 2.03);
  put(DW, 'dr_plank', { geos: () => [leaf(-0.8, 0.8, 2.4), ...F('timber', [-0.75, 0.4, 2.03, 0.75, 0.55, 2.07], [-0.75, 1.9, 2.03, 0.75, 2.05, 2.07]), ...F('iron', [-0.78, 0.45, 2.07, -0.2, 0.5, 2.08], [-0.78, 1.95, 2.07, -0.2, 2, 2.08]), fin(sph(0.05, 0.6, 1.1, 2.08), 'brass')], cols: [], label: 'Plank Door' });
  put(DW, 'dr_panel', { geos: () => [leaf(-0.8, 0.8, 2.4), ...[[-0.65, 0.2, -0.08, 1.05], [0.08, 0.2, 0.65, 1.05], [-0.65, 1.25, -0.08, 2.25], [0.08, 1.25, 0.65, 2.25]].map(([a, b, c, d]) => fin(box(a, b, 2.03, c, d, 2.05), 'timber')), fin(sph(0.05, 0.6, 1.1, 2.07), 'brass')], cols: [], label: 'Panelled Door' });
  put(DW, 'dr_double', { geos: () => [leaf(-1.2, 0, 2.5), leaf(0, 1.2, 2.5), fin(sph(0.05, -0.12, 1.1, 2.07), 'brass'), fin(sph(0.05, 0.12, 1.1, 2.07), 'brass')], cols: [], label: 'Double Doors (wide)' });
  put(DW, 'dr_arched', { geos: () => { const s = new THREE.Shape(); s.moveTo(-0.78, 0); s.lineTo(0.78, 0); s.lineTo(0.78, 1.8); s.absarc(0, 1.8, 0.78, 0, PI, false); s.closePath(); return [new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }).translate(0, 0, 1.97), ...rng(12).map((i) => fin(sph(0.03, -0.55 + (i % 4) * 0.37, 0.4 + Math.floor(i / 4) * 0.6, 2.04, 6, 4), 'iron')), ...F('iron', [-0.75, 0.6, 2.03, 0.75, 0.66, 2.05], [-0.75, 1.7, 2.03, 0.75, 1.76, 2.05])]; }, cols: [], label: 'Studded Arched Door' });
  put(DW, 'dr_glass', { geos: () => [...F('timber', [-0.78, 0, 1.97, -0.62, 2.38, 2.03], [0.62, 0, 1.97, 0.78, 2.38, 2.03], [-0.62, 2.22, 1.97, 0.62, 2.38, 2.03], [-0.62, 0, 1.97, 0.62, 0.9, 2.03], [-0.03, 0.9, 1.97, 0.03, 2.22, 2.03]), box(-0.62, 0.9, 1.99, 0.62, 2.22, 2.01)], cols: [], label: 'Glazed Door' });
  put(DW, 'dr_barn', { geos: () => [leaf(-0.8, 0.8, 2.4), ...F('timber', [-0.75, 0.1, 2.03, 0.75, 0.25, 2.07], [-0.75, 2.1, 2.03, 0.75, 2.25, 2.07], [-0.75, 1.1, 2.03, 0.75, 1.25, 2.07]), fin(strut([-0.7, 0.25, 2.05], [0.7, 1.1, 2.05], 0.12, 0.04), 'timber'), fin(strut([-0.7, 1.25, 2.05], [0.7, 2.1, 2.05], 0.12, 0.04), 'timber')], cols: [], label: 'Barn Door' });
  put(DW, 'dr_round', { geos: () => [new THREE.CylinderGeometry(0.9, 0.9, 0.08, 32).rotateX(PI / 2).translate(0, 1.0, 2), fin(new THREE.TorusGeometry(0.92, 0.06, 8, 40).translate(0, 1, 2.04), 'timber'), fin(sph(0.07, 0, 1, 2.08), 'brass')], cols: [], label: 'Round Door' });
  put(DW, 'dr_open', { geos: () => [box(-0.8, 0, 2.05, -0.74, 2.38, 3.6), fin(sph(0.05, -0.72, 1.1, 3.4), 'brass')], cols: [], label: 'Door (open)' });
  put(DW, 'wn_glass', { geos: () => [box(-0.8, 0.9, 1.99, 0.8, 2.1, 2.01), ...F('timber', [-0.03, 0.9, 1.97, 0.03, 2.1, 2.03], [-0.8, 1.47, 1.97, 0.8, 1.53, 2.03])], cols: [], label: 'Window Pane (cross)' });
  put(DW, 'wn_grid', { geos: () => [box(-0.8, 0.9, 1.99, 0.8, 2.1, 2.01), ...[-0.27, 0.27].map((x) => fin(box(x - 0.025, 0.9, 1.97, x + 0.025, 2.1, 2.03), 'timber')), ...[1.3, 1.7].map((y) => fin(box(-0.8, y - 0.025, 1.97, 0.8, y + 0.025, 2.03), 'timber'))], cols: [], label: 'Window Pane (grid)' });
  put(DW, 'wn_wide', { geos: () => [box(-1.4, 0.8, 1.99, 1.4, 2.2, 2.01), ...[-0.47, 0.47].map((x) => fin(box(x - 0.03, 0.8, 1.97, x + 0.03, 2.2, 2.03), 'timber'))], cols: [], label: 'Wide Window Pane' });
  put(DW, 'wn_round', { geos: () => [new THREE.CircleGeometry(0.6, 32).translate(0, 1.6, 2), fin(new THREE.TorusGeometry(0.6, 0.04, 6, 32).translate(0, 1.6, 2), 'timber'), ...F('timber', [-0.6, 1.58, 1.98, 0.6, 1.62, 2.02], [-0.02, 1, 1.98, 0.02, 2.2, 2.02])], cols: [], label: 'Round Window Pane' });
  put(DW, 'wn_arch', { geos: () => { const s = new THREE.Shape(); s.moveTo(-0.55, 1); s.lineTo(0.55, 1); s.lineTo(0.55, 1.85); s.absarc(0, 1.85, 0.55, 0, PI, false); s.closePath(); return [new THREE.ShapeGeometry(s, 16).translate(0, 0, 2), fin(box(-0.02, 1, 1.98, 0.02, 2.4, 2.02), 'timber')]; }, cols: [], label: 'Arched Window Pane' });
  put(DW, 'wn_stained', { geos: () => ['crystal', 'aqua', 'ember', 'emerald'].flatMap((f, i) => [fin(box(-0.8 + (i % 2) * 0.8, 0.9 + Math.floor(i / 2) * 0.6, 1.99, (i % 2) * 0.8, 1.5 + Math.floor(i / 2) * 0.6, 2.01), f)]).concat(F('iron', [-0.03, 0.9, 1.97, 0.03, 2.1, 2.03], [-0.8, 1.47, 1.97, 0.8, 1.53, 2.03])), cols: [], label: 'Stained Glass Pane' });
  put(DW, 'wn_curtains', { geos: () => [-1, 1].map((s) => { const g = new THREE.PlaneGeometry(0.55, 1.5, 8, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.05 * Math.sin(p.getX(i) * 22)); g.computeVertexNormals(); return fin(g.translate(s * 0.62, 1.45, 1.82), 'linen'); }).concat(F('brass', [-1.05, 2.22, 1.8, 1.05, 2.26, 1.84])), cols: [], label: 'Curtains' });

  // ======================================================================= FURNITURE
  const FU = 'Furniture';
  const legs = (x, z, h, r = 0.04) => [[-x, -z], [x, -z], [-x, z], [x, z]].map(([a, b]) => fin(cylAt(r, 0, h, a, b, 6), 'timber'));
  put(FU, 'sofa', { geos: () => [box(-1, 0.15, -0.42, 1, 0.42, 0.42), box(-1, 0.42, 0.22, 1, 0.92, 0.42), box(-1.05, 0.15, -0.42, -0.85, 0.68, 0.42), box(0.85, 0.15, -0.42, 1.05, 0.68, 0.42), ...F('linen', [-0.84, 0.42, -0.38, -0.01, 0.55, 0.22], [0.01, 0.42, -0.38, 0.84, 0.55, 0.22]), ...legs(0.95, 0.36, 0.15)], cols: [[-1.05, 0, -0.42, 1.05, 0.5, 0.42]], label: 'Sofa' });
  put(FU, 'armchair', { geos: () => [box(-0.45, 0.15, -0.42, 0.45, 0.42, 0.42), box(-0.45, 0.42, 0.22, 0.45, 0.95, 0.42), box(-0.5, 0.15, -0.42, -0.35, 0.68, 0.42), box(0.35, 0.15, -0.42, 0.5, 0.68, 0.42), fin(box(-0.34, 0.42, -0.38, 0.34, 0.55, 0.22), 'linen'), ...legs(0.42, 0.36, 0.15)], cols: [[-0.5, 0, -0.42, 0.5, 0.5, 0.42]], label: 'Armchair' });
  put(FU, 'wardrobe', { geos: () => [box(-0.6, 0, -0.3, 0.6, 2.1, 0.3), ...F('timber', [-0.01, 0.1, 0.3, 0.01, 2, 0.32], [-0.62, 2.05, -0.32, 0.62, 2.15, 0.32]), fin(sph(0.03, -0.08, 1.1, 0.32), 'brass'), fin(sph(0.03, 0.08, 1.1, 0.32), 'brass')], cols: [[-0.6, 0, -0.3, 0.6, 2.1, 0.3]], label: 'Wardrobe' });
  put(FU, 'dresser', { geos: () => [box(-0.6, 0, -0.25, 0.6, 0.9, 0.25), ...rng(3).flatMap((i) => [fin(box(-0.55, 0.08 + i * 0.27, 0.25, 0.55, 0.3 + i * 0.27, 0.27), 'timber'), fin(sph(0.03, 0, 0.19 + i * 0.27, 0.29), 'brass')])], cols: [[-0.6, 0, -0.25, 0.6, 0.9, 0.25]], label: 'Dresser' });
  put(FU, 'desk', { geos: () => [box(-0.8, 0.72, -0.4, 0.8, 0.78, 0.4), box(0.3, 0, -0.38, 0.78, 0.72, 0.38), ...legs(0.75, 0.35, 0.72).slice(0, 2), ...rng(3).map((i) => fin(box(0.33, 0.06 + i * 0.22, 0.38, 0.75, 0.24 + i * 0.22, 0.4), 'timber'))], cols: [[-0.8, 0, -0.4, 0.8, 0.78, 0.4]], label: 'Desk' });
  put(FU, 'roundtable', { geos: () => [cyl(0.65, 0.72, 0.78, 28), fin(cyl(0.07, 0.05, 0.72, 10), 'timber'), cyl(0.3, 0, 0.05, 16)], cols: [[-0.65, 0, -0.65, 0.65, 0.78, 0.65]], label: 'Round Table' });
  put(FU, 'longtable', { geos: () => [box(-1.3, 0.74, -0.48, 1.3, 0.82, 0.48), ...legs(1.2, 0.38, 0.74, 0.06)], cols: [[-1.3, 0, -0.48, 1.3, 0.82, 0.48]], label: 'Long Table' });
  put(FU, 'coffeetable', { geos: () => [box(-0.6, 0.38, -0.35, 0.6, 0.45, 0.35), ...legs(0.55, 0.3, 0.38)], cols: [[-0.6, 0, -0.35, 0.6, 0.45, 0.35]], label: 'Coffee Table' });
  put(FU, 'nightstand', { geos: () => [box(-0.25, 0, -0.25, 0.25, 0.6, 0.25), fin(box(-0.22, 0.35, 0.25, 0.22, 0.55, 0.27), 'timber'), fin(sph(0.025, 0, 0.45, 0.28), 'brass')], cols: [[-0.25, 0, -0.25, 0.25, 0.6, 0.25]], label: 'Nightstand' });
  put(FU, 'doublebed', { geos: () => [box(-0.8, 0.25, -1, 0.8, 0.45, 1), fin(box(-0.76, 0.45, -0.96, 0.76, 0.62, 0.96), 'linen'), ...F('linen', [-0.7, 0.62, 0.5, -0.05, 0.75, 0.9], [0.05, 0.62, 0.5, 0.7, 0.75, 0.9]), box(-0.85, 0, 0.95, 0.85, 1.2, 1.05), ...legs(0.75, 0.9, 0.25)], cols: [[-0.85, 0, -1, 0.85, 0.62, 1.05]], label: 'Double Bed' });
  put(FU, 'bunkbed', { geos: () => [...[0.25, 1.45].flatMap((y) => [box(-0.5, y, -1, 0.5, y + 0.15, 1), fin(box(-0.46, y + 0.15, -0.96, 0.46, y + 0.28, 0.96), 'linen')]), ...[[-0.48, -0.98], [0.48, -0.98], [-0.48, 0.98], [0.48, 0.98]].map(([x, z]) => fin(cylAt(0.05, 0, 2.1, x, z, 8), 'timber')), ...rng(5).map((i) => fin(tubeZ(0.025, -0.8, -0.4, 0.4 + i * 0.3, 0.52), 'timber'))], cols: [[-0.5, 0, -1, 0.5, 0.45, 1]], label: 'Bunk Bed' });
  put(FU, 'throne', { geos: () => [box(-0.55, 0, -0.45, 0.55, 0.5, 0.45), box(-0.55, 0.5, 0.3, 0.55, 2.2, 0.45), ...B([-0.62, 0.5, -0.45, -0.48, 1, 0.45], [0.48, 0.5, -0.45, 0.62, 1, 0.45]), fin(box(-0.45, 0.5, -0.4, 0.45, 0.6, 0.3), 'linen'), fin(box(-0.4, 0.7, 0.28, 0.4, 2, 0.3), 'linen'), ...[-0.55, 0, 0.55].map((x) => fin(cone(0.08, 0.35, x, 2.2, 0.38, 8), 'brass'))], cols: [[-0.62, 0, -0.45, 0.62, 0.6, 0.45]], label: 'Throne' });
  put(FU, 'bathtub', { geos: () => [...B([-0.8, 0.12, -0.4, 0.8, 0.2, 0.4], [-0.8, 0.2, -0.4, 0.8, 0.62, -0.34], [-0.8, 0.2, 0.34, 0.8, 0.62, 0.4], [-0.8, 0.2, -0.34, -0.74, 0.62, 0.34], [0.74, 0.2, -0.34, 0.8, 0.62, 0.34]), ...[[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]].map(([x, z]) => fin(sph(0.07, x, 0.07, z, 8, 6), 'brass'))], cols: [[-0.8, 0, -0.4, 0.8, 0.62, 0.4]], label: 'Clawfoot Bathtub' });
  put(FU, 'washbasin', { geos: () => [lathe([[0.12, 0], [0.1, 0.6], [0.15, 0.7], [0.3, 0.78], [0.32, 0.86], [0.26, 0.82], [0, 0.78]], 20), fin(strut([0, 0.86, -0.25], [0, 1, -0.1], 0.03), 'iron')], cols: [[-0.32, 0, -0.32, 0.32, 0.86, 0.32]], label: 'Wash Basin' });
  put(FU, 'stove', { geos: () => [...F('iron', [-0.45, 0, -0.35, 0.45, 0.85, 0.35]), fin(cylAt(0.08, 0.85, H, 0, -0.2, 10), 'iron'), fin(box(-0.3, 0.2, 0.35, 0.3, 0.55, 0.37), 'flame')], cols: [[-0.45, 0, -0.35, 0.45, 0.85, 0.35]], glow: [[0, 0.4, 0.4, 0.05]], label: 'Iron Stove' });
  put(FU, 'sinkcounter', { geos: () => [box(-0.9, 0, -0.35, 0.9, 0.85, 0.35), box(-0.95, 0.85, -0.4, 0.95, 0.92, 0.4), ...F('iron', [-0.35, 0.86, -0.25, 0.35, 0.93, 0.25]), fin(strut([0, 0.92, -0.32], [0, 1.15, -0.2], 0.03), 'iron')], cols: [[-0.95, 0, -0.4, 0.95, 0.92, 0.4]], label: 'Sink Counter' });
  put(FU, 'cauldron', { geos: () => [fin(lathe([[0, 0.2], [0.35, 0.22], [0.48, 0.45], [0.45, 0.75], [0.4, 0.82], [0.42, 0.85]], 20), 'iron'), ...[0, 2, 4].map((i) => fin(cylAt(0.04, 0, 0.3, 0.35 * Math.cos((i * PI) / 3), 0.35 * Math.sin((i * PI) / 3), 6), 'iron')), fin(cyl(0.38, 0.72, 0.76, 20), 'emerald')], cols: [[-0.48, 0, -0.48, 0.48, 0.85, 0.48]], glow: [[0, 0.8, 0, 0.04]], label: 'Bubbling Cauldron' });
  put(FU, 'anvil', { geos: () => F('iron', [-0.2, 0, -0.15, 0.2, 0.15, 0.15], [-0.1, 0.15, -0.08, 0.1, 0.5, 0.08], [-0.4, 0.5, -0.13, 0.3, 0.68, 0.13]).concat([fin(new THREE.ConeGeometry(0.13, 0.3, 8).rotateZ(PI / 2).translate(0.45, 0.6, 0), 'iron')]), cols: [[-0.4, 0, -0.15, 0.6, 0.68, 0.15]], label: 'Anvil' });
  put(FU, 'workbench', { geos: () => [box(-1, 0.85, -0.4, 1, 0.95, 0.4), ...legs(0.92, 0.33, 0.85, 0.06), fin(box(-1, 0.25, -0.35, 1, 0.3, 0.35), 'timber'), ...F('iron', [0.7, 0.95, -0.42, 0.9, 1.1, -0.3])], cols: [[-1, 0, -0.4, 1, 0.95, 0.4]], label: 'Workbench' });
  put(FU, 'grandclock', { geos: () => [box(-0.3, 0, -0.2, 0.3, 2.1, 0.2), fin(cyl(0.22, 0, 0.04, 24).rotateX(PI / 2).translate(0, 1.75, 0.2), 'linen'), fin(box(-0.02, 0.6, 0.2, 0.02, 1.4, 0.22), 'brass'), fin(cyl(0.08, 0, 0.02, 16).rotateX(PI / 2).translate(0, 0.65, 0.22), 'brass'), cone(0.32, 0.25, 0, 2.1, 0, 4)], cols: [[-0.3, 0, -0.2, 0.3, 2.1, 0.2]], label: 'Grandfather Clock' });
  put(FU, 'mirror', { geos: () => [fin(new THREE.TorusGeometry(0.4, 0.05, 8, 32).scale(1, 1.6, 1).translate(0, 1.15, 0), 'brass'), fin(new THREE.CircleGeometry(0.4, 32).scale(1, 1.6, 1).translate(0, 1.15, 0), 'frost'), ...[-0.3, 0.3].map((x) => fin(strut([x, 0, 0.2], [x * 0.9, 0.6, 0], 0.04), 'brass'))], cols: [], label: 'Standing Mirror' });
  put(FU, 'painting', { geos: () => [fin(box(-0.7, 1.2, 1.86, 0.7, 2.2, 1.88), 'linen'), ...F('brass', [-0.78, 1.12, 1.84, 0.78, 1.2, 1.9], [-0.78, 2.2, 1.84, 0.78, 2.28, 1.9], [-0.78, 1.2, 1.84, -0.7, 2.2, 1.9], [0.7, 1.2, 1.84, 0.78, 2.2, 1.9])], cols: [], label: 'Painting (wall)' });
  put(FU, 'wallshelf', { geos: () => [box(-0.8, 1.5, 1.6, 0.8, 1.55, 1.9), ...rng(9).map((i) => fin(box(-0.7 + i * 0.16, 1.55, 1.68, -0.58 + i * 0.16, 1.8 + 0.06 * Math.sin(i * 3), 1.85), ['timber', 'linen', 'moss'][i % 3])), ...[-0.6, 0.6].map((x) => fin(strut([x, 1.3, 1.88], [x, 1.5, 1.65], 0.04), 'iron'))], cols: [], label: 'Wall Shelf' });
  put(FU, 'vase', { geos: () => [lathe([[0, 0], [0.15, 0], [0.22, 0.2], [0.18, 0.45], [0.09, 0.55], [0.12, 0.65], [0.1, 0.66]], 20)], cols: [[-0.22, 0, -0.22, 0.22, 0.66, 0.22]], label: 'Vase' });
  put(FU, 'piano', { geos: () => [box(-0.75, 0, -0.3, 0.75, 1.3, 0.3), box(-0.75, 0.7, 0.3, 0.75, 0.78, 0.6), fin(box(-0.7, 0.78, 0.32, 0.7, 0.81, 0.55), 'linen'), ...rng(14).map((i) => box(-0.66 + i * 0.1, 0.81, 0.4, -0.63 + i * 0.1, 0.83, 0.55)), box(-0.5, 0, 0.75, 0.5, 0.5, 1.05)], cols: [[-0.75, 0, -0.3, 0.75, 1.3, 0.6]], label: 'Upright Piano' });
  put(FU, 'globe', { geos: () => [fin(cyl(0.25, 0, 0.05, 16), 'timber'), fin(cyl(0.03, 0.05, 0.75, 8), 'timber'), fin(sph(0.32, 0, 1.05, 0, 24, 16), 'aqua'), fin(new THREE.TorusGeometry(0.36, 0.02, 6, 32).rotateZ(0.4).translate(0, 1.05, 0), 'brass')], cols: [[-0.3, 0, -0.3, 0.3, 1.4, 0.3]], label: 'Globe' });
  put(FU, 'roundrug', { geos: () => [fin(cyl(1, 0, 0.02, 32), 'linen'), cyl(0.8, 0.02, 0.025, 32)], cols: [], label: 'Round Rug' });
  put(FU, 'runner', { geos: () => [fin(box(-0.5, 0, -1.8, 0.5, 0.02, 1.8), 'linen'), ...B([-0.45, 0.02, -1.75, -0.35, 0.025, 1.75], [0.35, 0.02, -1.75, 0.45, 0.025, 1.75])], cols: [], label: 'Long Runner Rug' });
  put(FU, 'weaponrack', { geos: () => [box(-0.8, 0, -0.15, 0.8, 0.1, 0.15), box(-0.8, 1.2, -0.08, 0.8, 1.28, 0.08), ...[-0.8, 0.8].map((x) => fin(cylAt(0.04, 0, 1.4, x, 0, 6), 'timber')), ...rng(5).map((i) => fin(cylAt(0.02, 0.1, 1.7, -0.6 + i * 0.3, 0, 6), 'iron'))], cols: [[-0.8, 0, -0.15, 0.8, 1.4, 0.15]], label: 'Weapon Rack' });
  put(FU, 'bookstack', { geos: () => rng(6).map((i) => fin(box(-0.18 + 0.02 * Math.sin(i), i * 0.07, -0.13, 0.18 + 0.02 * Math.cos(i), i * 0.07 + 0.065, 0.13).rotateY(0.2 * Math.sin(i * 2)), ['timber', 'linen', 'moss', 'main'][i % 4])), cols: [], label: 'Stack of Books' });

  // ======================================================================= LIGHTING (lit at night)
  const LI = 'Lighting';
  put(LI, 'sconce', { geos: () => [fin(box(-0.06, 1.7, 1.94, 0.06, 2.05, 2), 'iron'), fin(strut([0, 1.85, 1.95], [0, 1.95, 1.7], 0.04), 'iron'), fin(cyl(0.08, 1.9, 1.98, 10).translate(0, 0, 1.7), 'brass'), fin(cone(0.05, 0.14, 0, 1.98, 1.7, 8), 'flame')], cols: [], glow: [[0, 2.05, 1.7, 0.06]], label: 'Wall Sconce' });
  put(LI, 'walltorch', { geos: () => [fin(strut([0, 1.6, 1.98], [0, 2.1, 1.75], 0.06), 'timber'), fin(cone(0.08, 0.25, 0, 2.08, 1.74, 8), 'flame')], cols: [], glow: [[0, 2.2, 1.74, 0.08]], label: 'Wall Torch' });
  put(LI, 'walllantern', { geos: () => [fin(strut([0, 2, 1.98], [0, 2.1, 1.65], 0.04), 'iron'), fin(cyl(0.12, 1.65, 1.95, 6).translate(0, 0, 1.65), 'iron'), fin(sph(0.08, 0, 1.8, 1.65), 'flame')], cols: [], glow: [[0, 1.8, 1.65, 0.07]], label: 'Wall Lantern' });
  put(LI, 'candle', { geos: () => [fin(cyl(0.05, 0, 0.25, 10), 'linen'), fin(cone(0.02, 0.06, 0, 0.26, 0, 6), 'flame')], cols: [], glow: [[0, 0.3, 0, 0.02]], label: 'Candle' });
  put(LI, 'candles', { geos: () => rng(5).flatMap((i) => { const x = 0.15 * Math.cos(i * 1.3), z = 0.15 * Math.sin(i * 1.3), h = 0.15 + 0.05 * i; return [fin(cylAt(0.04, 0, h, x, z, 8), 'linen'), fin(cone(0.018, 0.05, x, h + 0.01, z, 6), 'flame')]; }), cols: [], glow: [[0, 0.4, 0, 0.03]], label: 'Candle Cluster' });
  put(LI, 'candelabra', { geos: () => [fin(lathe([[0.15, 0], [0.04, 0.05], [0.03, 1.2], [0, 1.2]], 12), 'brass'), fin(tubeX(0.02, -0.35, 0.35, 1.2, 0), 'brass'), ...[-0.35, 0, 0.35].flatMap((x) => [fin(cylAt(0.03, 1.2, 1.4, x, 0, 8), 'linen'), fin(cone(0.015, 0.05, x, 1.41, 0, 6), 'flame')])], cols: [[-0.15, 0, -0.15, 0.15, 1.2, 0.15]], glow: [[0, 1.5, 0, 0.03]], label: 'Candelabra' });
  put(LI, 'chandelier', { geos: () => [fin(cylAt(0.02, H - 1, H, 0, 0, 6), 'iron'), fin(new THREE.TorusGeometry(0.6, 0.03, 6, 32).rotateX(PI / 2).translate(0, H - 1, 0), 'brass'), ...rng(8).flatMap((i) => { const x = 0.6 * Math.cos((i * PI) / 4), z = 0.6 * Math.sin((i * PI) / 4); return [fin(cylAt(0.025, H - 1, H - 0.85, x, z, 6), 'linen'), fin(cone(0.015, 0.05, x, H - 0.84, z, 6), 'flame')]; })], cols: [], glow: [[0, H - 0.85, 0, 0.05]], label: 'Chandelier' });
  put(LI, 'floorlamp', { geos: () => [fin(cyl(0.2, 0, 0.04, 16), 'iron'), fin(cyl(0.025, 0.04, 1.5, 8), 'iron'), fin(new THREE.CylinderGeometry(0.15, 0.28, 0.35, 16, 1, true).translate(0, 1.6, 0), 'linen')], cols: [[-0.2, 0, -0.2, 0.2, 1.5, 0.2]], glow: [[0, 1.5, 0, 0.08]], label: 'Floor Lamp' });
  put(LI, 'paperlantern', { geos: () => [fin(cylAt(0.01, H - 0.6, H, 0, 0, 4), 'iron'), fin(lathe([[0.05, H - 1.3], [0.22, H - 1.2], [0.28, H - 0.95], [0.22, H - 0.7], [0.05, H - 0.6]], 16), 'ember')], cols: [], glow: [[0, H - 0.95, 0, 0.1]], label: 'Paper Lantern' });
  put(LI, 'streetlamp', { geos: () => [fin(cyl(0.08, 0, 3.4, 10), 'iron'), fin(tubeX(0.04, -0.7, 0.7, 3.3, 0), 'iron'), ...[-0.7, 0.7].flatMap((x) => [fin(cylAt(0.12, 2.9, 3.2, x, 0, 6), 'iron'), fin(sph(0.1, x, 3.05, 0), 'flame')]), fin(cyl(0.2, 0, 0.3, 12), 'iron')], cols: [[-0.1, 0, -0.1, 0.1, 3.4, 0.1]], glow: [[-0.7, 3.05, 0, 0.08], [0.7, 3.05, 0, 0.08]], label: 'Double Street Lamp' });
  put(LI, 'lanternpost', { geos: () => [fin(box(-0.06, 0, -0.06, 0.06, 2.4, 0.06), 'timber'), fin(strut([0, 2.35, 0], [0.5, 2.35, 0], 0.06), 'timber'), fin(cylAt(0.01, 1.95, 2.35, 0.5, 0, 4), 'iron'), fin(cylAt(0.12, 1.6, 1.95, 0.5, 0, 6), 'iron'), fin(sph(0.08, 0.5, 1.78, 0), 'flame')], cols: [[-0.08, 0, -0.08, 0.08, 2.4, 0.08]], glow: [[0.5, 1.78, 0, 0.07]], label: 'Lantern Post' });
  put(LI, 'brazier', { geos: () => [fin(lathe([[0.1, 0.6], [0.4, 0.75], [0.45, 0.95], [0.4, 0.95], [0.35, 0.8], [0, 0.78]], 16), 'iron'), ...[0, 2, 4].map((i) => fin(strut([0.3 * Math.cos((i * PI) / 3), 0, 0.3 * Math.sin((i * PI) / 3)], [0.12 * Math.cos((i * PI) / 3), 0.65, 0.12 * Math.sin((i * PI) / 3)], 0.04), 'iron')), fin(cone(0.3, 0.45, 0, 0.8, 0, 10), 'flame')], cols: [[-0.45, 0, -0.45, 0.45, 0.95, 0.45]], glow: [[0, 1.1, 0, 0.15]], label: 'Brazier' });
  put(LI, 'firebowl', { geos: () => [lathe([[0.3, 0], [0.15, 0.1], [0.12, 0.9], [0.5, 1.1], [0.55, 1.25], [0, 1.15]], 20), fin(cone(0.35, 0.5, 0, 1.15, 0, 10), 'flame')], cols: [[-0.55, 0, -0.55, 0.55, 1.25, 0.55]], glow: [[0, 1.4, 0, 0.15]], label: 'Fire Bowl Pedestal' });
  put(LI, 'crystallamp', { geos: () => [cyl(0.25, 0, 0.15, 6), ...rng(4).map((i) => fin(new THREE.OctahedronGeometry(0.15 + 0.05 * i).scale(0.5, 1.6, 0.5).translate(0.1 * Math.cos(i * 1.6), 0.4 + 0.06 * i, 0.1 * Math.sin(i * 1.6)), 'crystal'))], cols: [[-0.25, 0, -0.25, 0.25, 0.8, 0.25]], glow: [[0, 0.5, 0, 0.04]], label: 'Crystal Lamp' });
  put(LI, 'orblamp', { geos: () => [lathe([[0.3, 0], [0.12, 0.15], [0.1, 1.1], [0.25, 1.2], [0, 1.2]], 16), fin(sph(0.25, 0, 1.55, 0, 24, 16), 'aqua'), fin(new THREE.TorusGeometry(0.32, 0.015, 6, 32).rotateX(1.1).translate(0, 1.55, 0), 'brass')], cols: [[-0.3, 0, -0.3, 0.3, 1.3, 0.3]], glow: [[0, 1.55, 0, 0.12]], label: 'Floating Orb Lamp' });
  put(LI, 'fairylights', { geos: () => [fin(new THREE.TubeGeometry(sag(-2, 2, 2.6, 0.5, 2), 24, 0.008, 4), 'iron'), ...rng(11).map((i) => { const p = sag(-2, 2, 2.6, 0.5, 2).getPoint((i + 0.5) / 11); return fin(sph(0.04, p.x, p.y - 0.04, p.z, 6, 4), i % 2 ? 'ember' : 'aqua'); })], cols: [], glow: [[0, 2.2, 2, 0.02]], label: 'Fairy Lights (edge)' });

  // ======================================================================= STORAGE + MARKET
  const ST = 'Storage';
  const barrelLying = (x, y, z) => fin(lathe([[0.3, -0.45], [0.36, -0.2], [0.38, 0], [0.36, 0.2], [0.3, 0.45]], 14).rotateZ(PI / 2).translate(x, y, z), 'timber');
  put(ST, 'cratestack', { geos: () => B([-0.9, 0, -0.45, 0, 0.9, 0.45], [0.05, 0, -0.4, 0.85, 0.8, 0.4], [-0.6, 0.9, -0.4, 0.2, 1.7, 0.4]), cols: [[-0.9, 0, -0.45, 0.85, 1.7, 0.45]], label: 'Crate Stack' });
  put(ST, 'barrelstack', { geos: () => [barrelLying(0, 0.38, -0.4), barrelLying(0, 0.38, 0.4), barrelLying(0, 1.05, 0)], cols: [[-0.45, 0, -0.78, 0.45, 1.4, 0.78]], label: 'Barrel Stack' });
  put(ST, 'sacks', { geos: () => rng(5).map((i) => fin(sph(0.3, -0.5 + (i % 3) * 0.5, 0.25 + Math.floor(i / 3) * 0.4, 0.1 * Math.sin(i * 3), 12, 8).scale(1, 0.7, 0.8), 'linen')), cols: [[-0.8, 0, -0.3, 0.8, 0.8, 0.3]], label: 'Grain Sacks' });
  put(ST, 'shelfgoods', { geos: () => [box(-0.9, 0, -0.3, -0.85, 1.9, 0.3), box(0.85, 0, -0.3, 0.9, 1.9, 0.3), ...[0.1, 0.7, 1.3, 1.85].map((y) => box(-0.9, y, -0.3, 0.9, y + 0.05, 0.3)), ...rng(12).map((i) => fin(box(-0.75 + (i % 6) * 0.26, 0.15 + Math.floor(i / 6) * 0.6, -0.2, -0.57 + (i % 6) * 0.26, 0.4 + Math.floor(i / 6) * 0.6, 0.2), ['linen', 'timber', 'moss', 'iron'][i % 4]))], cols: [[-0.9, 0, -0.3, 0.9, 1.9, 0.3]], label: 'Shelf of Goods' });
  put(ST, 'stall', { geos: () => [box(-1.4, 0.8, -0.5, 1.4, 0.9, 0.5), box(-1.4, 0, -0.5, 1.4, 0.8, -0.45), ...[[-1.35, -0.5], [1.35, -0.5], [-1.35, 0.9], [1.35, 0.9]].map(([x, z]) => fin(cylAt(0.05, 0, 2.4, x, z, 8), 'timber')), fin(new THREE.BoxGeometry(3, 0.04, 1.8).rotateX(0.2).translate(0, 2.4, 0.2), 'linen'), ...rng(6).map((i) => fin(sph(0.1, -1.1 + i * 0.44, 0.98, 0, 8, 6), i % 2 ? 'ember' : 'emerald'))], cols: [[-1.4, 0, -0.5, 1.4, 0.9, 0.5]], label: 'Market Stall' });
  put(ST, 'cart', { geos: () => [box(-0.9, 0.5, -0.55, 0.9, 0.6, 0.55), ...B([-0.9, 0.6, -0.55, 0.9, 0.9, -0.5], [-0.9, 0.6, 0.5, 0.9, 0.9, 0.55], [0.85, 0.6, -0.5, 0.9, 0.9, 0.5]), ...[-0.62, 0.62].map((z) => fin(new THREE.TorusGeometry(0.4, 0.05, 6, 20).translate(0, 0.4, z), 'timber')), fin(tubeZ(0.04, -0.7, 0.7, 0.4, 0), 'iron'), ...[-0.3, 0.3].map((z) => fin(strut([-0.9, 0.55, z], [-1.9, 0.35, z * 0.6], 0.06), 'timber'))], cols: [[-0.9, 0, -0.62, 0.9, 0.9, 0.62]], label: 'Hand Cart' });
  put(ST, 'wheelbarrow', { geos: () => [fin(lathe([[0, 0.35], [0.35, 0.38], [0.45, 0.65], [0, 0.6]], 4).rotateY(PI / 4).scale(1.2, 1, 0.8), 'iron'), fin(new THREE.TorusGeometry(0.2, 0.05, 6, 16).rotateY(PI / 2).translate(0.6, 0.2, 0), 'timber'), ...[-0.2, 0.2].map((z) => fin(strut([0.6, 0.2, z], [-0.9, 0.6, z * 1.5], 0.04), 'timber'))], cols: [[-0.6, 0, -0.4, 0.6, 0.65, 0.4]], label: 'Wheelbarrow' });
  put(ST, 'hangsign', { geos: () => [fin(strut([0, 2.6, 1.98], [0, 2.6, 1.2], 0.05), 'iron'), ...[1.3, 1.85].map((z) => fin(cylAt(0.008, 2.25, 2.6, 0, z, 4), 'iron')), box(-0.05, 1.7, 1.2, 0.05, 2.25, 1.95)], cols: [], label: 'Hanging Shop Sign (edge)' });
  put(ST, 'pallet', { geos: () => [...rng(5).map((i) => box(-0.6, 0.12, -0.6 + i * 0.27, 0.6, 0.15, -0.45 + i * 0.27)), ...[-0.55, 0, 0.55].map((x) => box(x - 0.05, 0, -0.6, x + 0.05, 0.12, 0.6))], cols: [[-0.6, 0, -0.6, 0.6, 0.15, 0.6]], label: 'Pallet' });
  put(ST, 'logpile', { geos: () => [[-0.45, 0.2], [0, 0.2], [0.45, 0.2], [-0.22, 0.58], [0.22, 0.58], [0, 0.95]].map(([x, y]) => fin(tubeZ(0.2, -0.9, 0.9, y, x, 10), 'timber')), cols: [[-0.65, 0, -0.9, 0.65, 1.15, 0.9]], label: 'Log Pile' });
  put(ST, 'firewood', { geos: () => [box(-0.6, 0, -0.25, -0.55, 1, 0.25), box(0.55, 0, -0.25, 0.6, 1, 0.25), ...rng(15).map((i) => fin(tubeZ(0.08, -0.22, 0.22, 0.09 + Math.floor(i / 5) * 0.17, -0.42 + (i % 5) * 0.21, 6), 'timber'))], cols: [[-0.6, 0, -0.25, 0.6, 1, 0.25]], label: 'Firewood Rack' });
  put(ST, 'treasure', { geos: () => [fin(lathe([[0, 0], [0.7, 0], [0.4, 0.4], [0, 0.55]], 16), 'brass'), ...rng(10).map((i) => fin(cyl(0.06, 0, 0.015, 10).translate(0.7 * Math.cos(i * 2.4) * (0.6 + 0.4 * Math.sin(i)), 0.02, 0.7 * Math.sin(i * 2.4) * (0.6 + 0.4 * Math.sin(i))), 'brass')), fin(new THREE.OctahedronGeometry(0.1).translate(0.1, 0.55, 0.05), 'crystal')], cols: [[-0.7, 0, -0.7, 0.7, 0.4, 0.7]], label: 'Treasure Hoard' });

  // ======================================================================= GARDEN
  const GA = 'Garden';
  put(GA, 'hedge1', { geos: () => [fin(box(-0.5, 0, -0.5, 0.5, 1, 0.5), 'leaves')], cols: [[-0.5, 0, -0.5, 0.5, 1, 0.5]], label: 'Hedge Block' });
  put(GA, 'hedgetall', { geos: () => [fin(box(-0.6, 0, -0.6, 0.6, 2.2, 0.6), 'leaves')], cols: [[-0.6, 0, -0.6, 0.6, 2.2, 0.6]], label: 'Tall Hedge' });
  put(GA, 'topball', { geos: () => [cyl(0.3, 0, 0.4, 12), fin(cylAt(0.05, 0.4, 0.8, 0, 0, 6), 'timber'), fin(sph(0.5, 0, 1.2, 0, 16, 12), 'leaves')], cols: [[-0.3, 0, -0.3, 0.3, 1.7, 0.3]], label: 'Topiary Ball' });
  put(GA, 'topcone', { geos: () => [cyl(0.3, 0, 0.4, 12), fin(cone(0.5, 1.8, 0, 0.4, 0, 16), 'leaves')], cols: [[-0.3, 0, -0.3, 0.3, 2.2, 0.3]], label: 'Topiary Cone' });
  put(GA, 'topspiral', { geos: () => [cyl(0.3, 0, 0.4, 12), ...rng(14).map((i) => fin(sph(0.35 - i * 0.018, 0.18 * Math.cos(i * 0.9), 0.6 + i * 0.13, 0.18 * Math.sin(i * 0.9), 10, 8), 'leaves'))], cols: [[-0.3, 0, -0.3, 0.3, 2.3, 0.3]], label: 'Topiary Spiral' });
  put(GA, 'pergola', { geos: () => [...[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].map(([x, z]) => box(x - 0.1, 0, z - 0.1, x + 0.1, 2.6, z + 0.1)), ...[-1.8, 1.8].map((x) => box(x - 0.06, 2.6, -2.1, x + 0.06, 2.8, 2.1)), ...rng(9).map((i) => fin(box(-2.1, 2.8, -1.8 + i * 0.45 - 0.04, 2.1, 2.9, -1.8 + i * 0.45 + 0.04), 'timber'))], cols: [[-1.9, 0, -1.9, -1.7, 2.6, -1.7], [1.7, 0, -1.9, 1.9, 2.6, -1.7], [-1.9, 0, 1.7, -1.7, 2.6, 1.9], [1.7, 0, 1.7, 1.9, 2.6, 1.9]], label: 'Pergola' });
  put(GA, 'trellis', { geos: () => [...rng(9).map((i) => fin(box(-1.8 + i * 0.45 - 0.02, 0, 1.96, -1.8 + i * 0.45 + 0.02, 2.4, 2), 'timber')), ...rng(6).map((i) => fin(box(-1.85, 0.3 + i * 0.4, 1.94, 1.85, 0.33 + i * 0.4, 1.97), 'timber')), ...rng(22).map((i) => fin(sph(0.14, -1.7 + ((i * 1.37) % 3.4), 0.2 + ((i * 0.83) % 2.2), 1.92, 8, 6), i % 5 ? 'leaves' : 'petals'))], cols: [], label: 'Vine Trellis (edge)' });
  put(GA, 'vines', { geos: () => rng(40).map((i) => fin(sph(0.12 + 0.05 * Math.sin(i), -1.9 + ((i * 1.71) % 3.8), 0.2 + ((i * 0.77) % 2.7), 1.86, 8, 6), i % 6 ? 'leaves' : 'petals')), cols: [], label: 'Climbing Vines (edge)' });
  put(GA, 'birdbath', { geos: () => [lathe([[0.25, 0], [0.12, 0.1], [0.08, 0.8], [0.4, 0.9], [0.45, 1], [0.38, 0.97], [0, 0.95]], 20), fin(cyl(0.37, 0.95, 0.97, 20), 'water')], cols: [[-0.45, 0, -0.45, 0.45, 1, 0.45]], label: 'Bird Bath' });
  put(GA, 'pond', { geos: () => [fin(cyl(1.6, 0, 0.05, 32), 'water'), ...rng(14).map((i) => new THREE.IcosahedronGeometry(0.25, 0).scale(1, 0.6, 1).translate(1.7 * Math.cos((i * 2 * PI) / 14), 0.1, 1.7 * Math.sin((i * 2 * PI) / 14))), ...rng(3).map((i) => fin(cyl(0.18, 0.05, 0.07, 10).translate(-0.6 + i * 0.5, 0, 0.3 * Math.sin(i * 2)), 'leaves'))], cols: [], label: 'Garden Pond' });
  put(GA, 'stepstones', { geos: () => rng(5).map((i) => cyl(0.32, 0, 0.08, 9).scale(1, 1, 0.8).rotateY(i).translate(-1.6 + i * 0.8, 0, 0.3 * Math.sin(i * 1.7))), cols: [], label: 'Stepping Stones' });
  put(GA, 'potsmall', { geos: () => [lathe([[0.18, 0], [0.24, 0.35], [0.26, 0.38], [0, 0.36]], 16), fin(sph(0.25, 0, 0.5, 0, 10, 8), 'leaves')], cols: [[-0.26, 0, -0.26, 0.26, 0.7, 0.26]], label: 'Small Pot Plant' });
  put(GA, 'potlarge', { geos: () => [lathe([[0.3, 0], [0.45, 0.7], [0.5, 0.75], [0, 0.72]], 20), ...rng(7).map((i) => fin(sph(0.3, 0.25 * Math.cos(i), 1 + 0.25 * Math.sin(i * 2), 0.25 * Math.sin(i), 10, 8), i % 3 ? 'leaves' : 'petals'))], cols: [[-0.5, 0, -0.5, 0.5, 0.75, 0.5]], label: 'Large Pot Plant' });
  put(GA, 'tallgrass', { geos: () => rng(26).map((i) => fin(new THREE.ConeGeometry(0.03, 0.6 + 0.4 * Math.abs(Math.sin(i)), 4).rotateZ(0.2 * Math.sin(i * 5)).translate(0.5 * Math.sin(i * 2.3), 0.4, 0.5 * Math.cos(i * 1.7)), 'leaves')), cols: [], label: 'Tall Grass' });
  put(GA, 'bamboo', { geos: () => rng(7).flatMap((i) => { const x = 0.35 * Math.cos(i * 2.1), z = 0.35 * Math.sin(i * 2.1), h = 2.5 + Math.sin(i) * 0.8; return [fin(cylAt(0.05, 0, h, x, z, 6), 'moss'), fin(sph(0.25, x, h, z, 8, 6).scale(1, 0.5, 1), 'leaves')]; }), cols: [[-0.4, 0, -0.4, 0.4, 3, 0.4]], label: 'Bamboo Clump' });
  put(GA, 'cactus', { geos: () => [fin(cyl(0.22, 0, 1.8, 10), 'moss'), fin(sph(0.22, 0, 1.8, 0, 10, 6), 'moss'), fin(cylAt(0.14, 0.9, 1.4, 0.4, 0, 8), 'moss'), fin(tubeX(0.14, 0.2, 0.4, 0.8, 0, 8), 'moss'), fin(cylAt(0.12, 1.1, 1.5, -0.35, 0, 8), 'moss'), fin(tubeX(0.12, -0.35, -0.2, 1.05, 0, 8), 'moss')], cols: [[-0.25, 0, -0.25, 0.25, 2, 0.25]], label: 'Cactus' });
  put(GA, 'palm', { geos: () => [...rng(8).map((i) => fin(cyl(0.18 - i * 0.01, 0, 0.5, 8).translate(0.05 * i * i * 0.08, i * 0.5, 0), 'timber')), ...rng(8).map((i) => fin(new THREE.BoxGeometry(1.8, 0.03, 0.35).translate(0.9, 0, 0).rotateZ(-0.4).rotateY((i * PI) / 4).translate(0.25, 4, 0), 'leaves'))], cols: [[-0.25, 0, -0.25, 0.25, 4, 0.25]], label: 'Palm Tree' });
  put(GA, 'giantshroom', { geos: () => [fin(cyl(0.25, 0, 2, 12), 'linen'), lathe([[0, 2.6], [0.8, 2.5], [1.3, 2.2], [1.4, 2], [0, 2.05]], 24), ...rng(7).map((i) => fin(sph(0.1, 0.9 * Math.cos(i), 2.35, 0.9 * Math.sin(i), 8, 6), 'linen'))], cols: [[-0.25, 0, -0.25, 0.25, 2, 0.25], [-1.3, 2.05, -1.3, 1.3, 2.6, 1.3]], label: 'Giant Mushroom' });
  put(GA, 'stump', { geos: () => [fin(lathe([[0.5, 0], [0.38, 0.15], [0.35, 0.6], [0, 0.6]], 12), 'timber'), cyl(0.33, 0.6, 0.62, 12)], cols: [[-0.4, 0, -0.4, 0.4, 0.62, 0.4]], label: 'Tree Stump' });
  put(GA, 'fallenlog', { geos: () => [fin(tubeX(0.3, -1.6, 1.6, 0.3, 0, 12), 'timber'), fin(sph(0.2, 0.5, 0.55, 0.1, 8, 6), 'moss')], cols: [[-1.6, 0, -0.3, 1.6, 0.6, 0.3]], label: 'Fallen Log' });
  put(GA, 'standingstone', { geos: () => [new THREE.BoxGeometry(0.7, 2.6, 0.4, 2, 4, 2).translate(0, 1.3, 0).rotateZ(0.05)], cols: [[-0.35, 0, -0.2, 0.35, 2.6, 0.2]], label: 'Standing Stone' });
  put(GA, 'boulders', { geos: () => [[0, 0.7, 0], [0.9, 0.45, 0.4], [-0.7, 0.4, 0.5]].map(([x, s, z], i) => new THREE.IcosahedronGeometry(s, 0).scale(1, 0.7, 1.1).rotateY(i).translate(x, s * 0.55, z)), cols: [[-0.7, 0, -0.7, 0.7, 0.9, 0.7]], label: 'Boulder Cluster' });
  put(GA, 'picnic', { geos: () => [box(-1, 0.72, -0.4, 1, 0.78, 0.4), ...[-0.75, 0.75].map((z) => box(-1, 0.42, z - 0.15, 1, 0.47, z + 0.15)), ...[-0.85, 0.85].flatMap((x) => [strut([x, 0, -0.9], [x, 0.75, 0], 0.08), strut([x, 0, 0.9], [x, 0.75, 0], 0.08)])], cols: [[-1, 0, -0.9, 1, 0.78, 0.9]], label: 'Picnic Table' });
  put(GA, 'swing', { geos: () => [...[-1.2, 1.2].flatMap((x) => [fin(strut([x, 0, -0.6], [x, 2.4, 0], 0.1), 'timber'), fin(strut([x, 0, 0.6], [x, 2.4, 0], 0.1), 'timber')]), fin(tubeX(0.07, -1.3, 1.3, 2.4, 0), 'timber'), ...[-0.35, 0.35].map((x) => fin(cylAt(0.01, 0.5, 2.4, x, 0, 4), 'linen')), box(-0.4, 0.45, -0.15, 0.4, 0.5, 0.15)], cols: [], label: 'Garden Swing' });

  // ======================================================================= MAGIC (glowing finishes, floating things)
  const MG = 'Magic';
  put(MG, 'crystals', { geos: () => rng(7).map((i) => fin(new THREE.OctahedronGeometry(0.25 + 0.1 * (i % 3)).scale(0.45, 1.9, 0.45).rotateZ(0.35 * Math.sin(i * 2)).rotateX(0.3 * Math.cos(i * 3)).translate(0.35 * Math.cos(i * 1.9) * (i ? 1 : 0), 0.4 + 0.1 * (i % 3), 0.35 * Math.sin(i * 1.9) * (i ? 1 : 0)), i % 3 ? 'crystal' : 'aqua')), cols: [[-0.5, 0, -0.5, 0.5, 1, 0.5]], glow: [[0, 0.6, 0, 0.03]], label: 'Crystal Cluster' });
  put(MG, 'crystalpillar', { geos: () => [fin(new THREE.CylinderGeometry(0.35, 0.45, 2.6, 6).translate(0, 1.3, 0), 'crystal'), fin(new THREE.ConeGeometry(0.35, 0.7, 6).translate(0, 2.95, 0), 'crystal')], cols: [[-0.45, 0, -0.45, 0.45, 3.3, 0.45]], glow: [[0, 2, 0, 0.04]], label: 'Crystal Pillar' });
  put(MG, 'orbpedestal', { geos: () => [lathe([[0.5, 0], [0.5, 0.15], [0.25, 0.25], [0.2, 0.9], [0.4, 1], [0.4, 1.1], [0, 1.1]], 20), fin(sph(0.3, 0, 1.75, 0, 24, 16), 'aqua'), ...[0, 1, 2].map((i) => fin(new THREE.TorusGeometry(0.45 + i * 0.08, 0.012, 6, 40).rotateX(0.6 + i).rotateY(i * 1.2).translate(0, 1.75, 0), 'brass'))], cols: [[-0.5, 0, -0.5, 0.5, 1.1, 0.5]], glow: [[0, 1.75, 0, 0.1]], label: 'Floating Orb Pedestal' });
  put(MG, 'runestone', { geos: () => [box(-0.5, 0, -0.18, 0.5, 2, 0.18).rotateZ(0.03), ...[[0, 1.6, 0.4, 0.06], [-0.15, 1.3, 0.06, 0.4], [0.15, 1.1, 0.06, 0.35], [0, 0.8, 0.3, 0.06], [0, 0.55, 0.06, 0.3]].map(([x, y, w, h]) => fin(box(x - w / 2, y - h / 2, 0.17, x + w / 2, y + h / 2, 0.2), 'aqua'))], cols: [[-0.5, 0, -0.18, 0.5, 2, 0.18]], glow: [[0, 1.2, 0.3, 0.03]], label: 'Rune Stone' });
  put(MG, 'portal', { geos: () => [new THREE.TorusGeometry(1.25, 0.16, 12, 48).translate(0, 1.45, 0), fin(new THREE.CircleGeometry(1.1, 48).translate(0, 1.45, 0), 'void'), fin(new THREE.TorusGeometry(1.1, 0.03, 6, 48).translate(0, 1.45, 0.02), 'aqua'), ...B([-0.9, 0, -0.35, -0.45, 0.25, 0.35], [0.45, 0, -0.35, 0.9, 0.25, 0.35])], cols: [[-1.45, 0, -0.2, -1.05, 2.9, 0.2], [1.05, 0, -0.2, 1.45, 2.9, 0.2]], glow: [[0, 1.45, 0.3, 0.1]], label: 'Portal Ring' });
  put(MG, 'arcanecircle', { geos: () => [fin(new THREE.RingGeometry(1.5, 1.6, 64).rotateX(-PI / 2).translate(0, 0.02, 0), 'aqua'), fin(new THREE.RingGeometry(1, 1.05, 64).rotateX(-PI / 2).translate(0, 0.02, 0), 'aqua'), fin(new THREE.RingGeometry(0.6, 0.85, 3, 1).rotateX(-PI / 2).translate(0, 0.021, 0), 'crystal'), ...rng(12).map((i) => fin(box(-0.04, 0.015, -0.12, 0.04, 0.025, 0.12).rotateY((i * PI) / 6).translate(1.28 * Math.cos((i * PI) / 6), 0, 1.28 * Math.sin((i * PI) / 6)), 'aqua'))], cols: [], glow: [[0, 0.3, 0, 0.02]], label: 'Arcane Circle' });
  put(MG, 'gloobelisk', { geos: () => [box(-0.35, 0, -0.35, 0.35, 3.2, 0.35), new THREE.ConeGeometry(0.5, 0.6, 4).rotateY(PI / 4).translate(0, 3.5, 0), ...[0.6, 1.4, 2.2].flatMap((y) => [-0.36, 0.36].map((z) => fin(box(-0.2, y, z - 0.01, 0.2, y + 0.5, z + 0.01), 'ember')))], cols: [[-0.35, 0, -0.35, 0.35, 3.2, 0.35]], glow: [[0, 2, 0.5, 0.03]], label: 'Glowing Obelisk' });
  put(MG, 'floatisland', { geos: () => [new THREE.ConeGeometry(1.4, 2.2, 9).rotateX(PI).translate(0, 2, 0), fin(cyl(1.45, 3.1, 3.3, 9), 'moss'), fin(cylAt(0.08, 3.3, 4.1, 0.4, 0.2, 6), 'timber'), fin(sph(0.45, 0.4, 4.4, 0.2, 10, 8), 'leaves'), ...rng(4).map((i) => fin(new THREE.OctahedronGeometry(0.12).scale(0.5, 1.8, 0.5).translate(0.6 * Math.cos(i * 1.6), 1.1 + i * 0.15, 0.6 * Math.sin(i * 1.6)), 'crystal'))], cols: [[-1.3, 2.7, -1.3, 1.3, 3.3, 1.3]], glow: [[0, 1.2, 0, 0.02]], label: 'Floating Island' });
  put(MG, 'magictree', { geos: () => [fin(lathe([[0.5, 0], [0.3, 0.3], [0.2, 2.2], [0, 2.3]], 10), 'timber'), ...rng(9).map((i) => fin(sph(0.6 - (i % 3) * 0.1, 0.7 * Math.cos(i * 2.4) * (i ? 1 : 0), 2.6 + (i % 3) * 0.35, 0.7 * Math.sin(i * 2.4) * (i ? 1 : 0), 12, 8), i % 4 ? 'aqua' : 'crystal'))], cols: [[-0.3, 0, -0.3, 0.3, 2.2, 0.3]], glow: [[0, 2.8, 0, 0.05]], label: 'Spirit Tree' });
  put(MG, 'glowshrooms', { geos: () => rng(6).flatMap((i) => { const x = 0.4 * Math.cos(i * 2.2) * (i ? 1 : 0), z = 0.4 * Math.sin(i * 2.2) * (i ? 1 : 0), h = 0.25 + 0.2 * (i % 3); return [fin(cylAt(0.04, 0, h, x, z, 6), 'linen'), fin(sph(0.14 + 0.04 * (i % 3), x, h, z, 10, 6).scale(1, 0.55, 1), i % 2 ? 'aqua' : 'ember')]; }), cols: [], glow: [[0, 0.4, 0, 0.02]], label: 'Glow Mushrooms' });
  put(MG, 'fairyring', { geos: () => rng(10).flatMap((i) => { const a = (i * 2 * PI) / 10, x = 1.5 * Math.cos(a), z = 1.5 * Math.sin(a); return [fin(cylAt(0.04, 0, 0.22, x, z, 6), 'linen'), fin(sph(0.12, x, 0.22, z, 8, 6).scale(1, 0.5, 1), 'ember')]; }), cols: [], glow: [[0, 0.3, 0, 0.02]], label: 'Fairy Ring' });
  put(MG, 'starlantern', { geos: () => [fin(cylAt(0.02, 1.6, H, 0, 0, 4), 'iron'), fin(prism(starPts(0, 0, 0.35, 0.15, 5), 0.12).translate(0, 1.4, 0), 'ember')], cols: [], glow: [[0, 1.4, 0, 0.06]], label: 'Star Lantern' });
  put(MG, 'armillary', { geos: () => [lathe([[0.35, 0], [0.12, 0.1], [0.08, 0.9], [0, 0.9]], 16), ...[[0, 0], [PI / 2, 0], [PI / 2, PI / 2], [0.4, 0.9]].map(([rx, ry], i) => fin(new THREE.TorusGeometry(0.5 - i * 0.04, 0.018, 6, 48).rotateX(rx).rotateY(ry).translate(0, 1.45, 0), 'brass')), fin(sph(0.1, 0, 1.45, 0), 'ember')], cols: [[-0.35, 0, -0.35, 0.35, 0.9, 0.35]], glow: [[0, 1.45, 0, 0.04]], label: 'Armillary Sphere' });
  put(MG, 'pylon', { geos: () => [cyl(0.5, 0, 0.3, 8), fin(cyl(0.12, 0.3, 4.6, 12), 'aqua'), ...[1.2, 2.4, 3.6].map((y) => fin(new THREE.TorusGeometry(0.32, 0.05, 8, 24).rotateX(PI / 2).translate(0, y, 0), 'iron')), fin(new THREE.OctahedronGeometry(0.35).translate(0, 5.1, 0), 'crystal')], cols: [[-0.5, 0, -0.5, 0.5, 4.6, 0.5]], glow: [[0, 3, 0, 0.06]], label: 'Energy Pylon' });
  put(MG, 'crystalarch', { geos: () => rng(13).map((i) => { const a = (i * PI) / 12, x = 1.6 * Math.cos(a), y = 1.9 * Math.sin(a); return fin(new THREE.OctahedronGeometry(0.22).scale(0.6, 1.4, 0.6).rotateZ(a - PI / 2).translate(x, y + 0.2, 0), i % 2 ? 'crystal' : 'aqua'); }), cols: [[-1.8, 0, -0.2, -1.4, 0.8, 0.2], [1.4, 0, -0.2, 1.8, 0.8, 0.2]], glow: [[0, 2, 0, 0.03]], label: 'Crystal Arch' });
  put(MG, 'runicgate', { geos: () => [...B([-1.6, 0, -0.3, -1, 2.8, 0.3], [1, 0, -0.3, 1.6, 2.8, 0.3], [-1.8, 2.8, -0.35, 1.8, 3.3, 0.35]), ...[-1.3, 1.3].flatMap((x) => [0.8, 1.6].map((y) => fin(box(x - 0.15, y, 0.3, x + 0.15, y + 0.4, 0.32), 'aqua'))), fin(box(-1, 2.95, 0.35, 1, 3.05, 0.37), 'aqua')], cols: [[-1.6, 0, -0.3, -1, 2.8, 0.3], [1, 0, -0.3, 1.6, 2.8, 0.3], [-1.8, 2.8, -0.35, 1.8, 3.3, 0.35]], glow: [[0, 2.2, 0.5, 0.04]], label: 'Runic Gate' });
  put(MG, 'moonorb', { geos: () => [fin(sph(0.9, 0, 3.2, 0, 32, 20), 'frost'), ...rng(3).map((i) => fin(new THREE.TorusGeometry(1.2 + i * 0.2, 0.02, 6, 64).rotateX(1.2 + i * 0.3).translate(0, 3.2, 0), 'brass'))], cols: [], glow: [[0, 3.2, 0, 0.2]], label: 'Moon Orb (floating)' });
  put(MG, 'rift', { geos: () => [fin(new THREE.CircleGeometry(0.9, 40).scale(0.55, 1.4, 1).translate(0, 1.5, 0), 'void'), fin(new THREE.TorusGeometry(0.92, 0.05, 6, 40).scale(0.55, 1.4, 1).translate(0, 1.5, 0), 'ember')], cols: [], glow: [[0, 1.5, 0.2, 0.05]], label: 'Void Rift' });
  put(MG, 'dragonegg', { geos: () => [cyl(0.5, 0, 0.12, 10), fin(sph(0.4, 0, 0.6, 0, 20, 16).scale(1, 1.35, 1), 'void'), ...rng(8).map((i) => fin(sph(0.06, 0.38 * Math.cos(i * 0.8), 0.45 + i * 0.06, 0.38 * Math.sin(i * 0.8), 6, 4), 'ember'))], cols: [[-0.5, 0, -0.5, 0.5, 1.2, 0.5]], glow: [[0, 0.7, 0, 0.03]], label: 'Dragon Egg' });
  put(MG, 'wizardtop', { geos: () => [up(lathe([[2.3, 0], [1.7, 0.5], [1.1, 1.6], [0.6, 3], [0.25, 4.3], [0.1, 5.2], [0, 5.4]], 20)).rotateZ(0.04), fin(up(prism(starPts(0, 0, 0.4, 0.17, 5), 0.1).translate(0, 5.9, 0)), 'ember')], cols: [], glow: [[0, H + 5.9, 0, 0.05]], label: 'Wizard Tower Roof' });

  // ======================================================================= SHAPES (meshing primitives in 4 sizes)
  const semi = () => { const s = new THREE.Shape(); s.absarc(0, 0, 0.5, 0, PI, false); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -0.5); };
  const quarterD = () => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.absarc(-0.5, 0, 1, 0, PI / 2, false); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -0.5); };
  const cornerWedge = () => {
    const v = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, -0.5]], faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat().flatMap((i) => v[i]), 3)); g.computeVertexNormals(); return g;
  };
  const heartPts = rng(40).map((i) => { const t = (i / 40) * 2 * PI; return [0.03 * 16 * Math.sin(t) ** 3, 0.03 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + 0.5]; });
  const SH = {
    cube:      ['Cube', () => box(-0.5, 0, -0.5, 0.5, 1, 0.5)],
    halfcube:  ['Half Cube', () => box(-0.5, 0, -0.5, 0.5, 0.5, 0.5)],
    plate:     ['Plate', () => box(-0.5, 0, -0.5, 0.5, 0.1, 0.5)],
    bar:       ['Bar', () => box(-0.5, 0, -0.1, 0.5, 0.2, 0.1)],
    post:      ['Post', () => box(-0.1, 0, -0.1, 0.1, 1, 0.1)],
    cylinder:  ['Cylinder', () => cyl(0.5, 0, 1, 28)],
    disc:      ['Disc', () => cyl(0.5, 0, 0.1, 28)],
    halfcyl:   ['Half Cylinder', semi],
    quartercyl:['Quarter Round', quarterD],
    tube:      ['Tube', () => extrudeUp(circle(0.5, 28), 0, 1, [circle(0.38, 28).reverse()])],
    cone:      ['Cone', () => cone(0.5, 1, 0, 0, 0, 28)],
    sphere:    ['Sphere', () => sph(0.5, 0, 0.5, 0, 28, 18)],
    hemi:      ['Hemisphere', () => new THREE.SphereGeometry(0.5, 28, 12, 0, 2 * PI, 0, PI / 2)],
    torus:     ['Torus', () => new THREE.TorusGeometry(0.38, 0.12, 12, 36).rotateX(PI / 2).translate(0, 0.12, 0)],
    ring:      ['Ring (standing)', () => new THREE.TorusGeometry(0.44, 0.06, 10, 40).translate(0, 0.5, 0)],
    wedge:     ['Wedge', () => prism([[-0.5, 0], [0.5, 0], [0.5, 1]], 1)],
    cornerwedge:['Corner Wedge', cornerWedge],
    pyramid:   ['Pyramid', () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(PI / 4).translate(0, 0.5, 0)],
    tetra:     ['Tetrahedron', () => new THREE.TetrahedronGeometry(0.6).translate(0, 0.35, 0)],
    octa:      ['Octahedron', () => new THREE.OctahedronGeometry(0.5).translate(0, 0.5, 0)],
    gem:       ['Gem', () => new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0)],
    dodeca:    ['Dodecahedron', () => new THREE.DodecahedronGeometry(0.5).translate(0, 0.5, 0)],
    hexprism:  ['Hex Prism', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0)],
    octprism:  ['Octagon Prism', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0)],
    star:      ['Star', () => prism(starPts(0, 0.5, 0.5, 0.21, 5), 0.25)],
    heart:     ['Heart', () => prism(heartPts, 0.25)],
    archblock: ['Arch Block', () => { const s = new THREE.Shape(); s.absarc(0, 0, 0.5, 0, PI, false); s.absarc(0, 0, 0.3, PI, 0, true); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -0.2); }],
    steps:     ['Step Block', () => [0, 1, 2, 3].map((i) => box(-0.5 + i * 0.25, 0, -0.5, 0.5, (i + 1) * 0.25, 0.5))],
    capsule:   ['Capsule', () => new THREE.CapsuleGeometry(0.3, 0.4, 8, 20).translate(0, 0.5, 0)],
    elbow:     ['Pipe Elbow', () => new THREE.TorusGeometry(0.4, 0.1, 10, 16, PI / 2).translate(-0.4, 0.1, 0)],
    spiral:    ['Spiral', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rng(40).map((i) => new THREE.Vector3(0.35 * Math.cos(i * 0.32), 0.06 + i * 0.022, 0.35 * Math.sin(i * 0.32)))), 80, 0.06, 8)],
    knot:      ['Knot', () => new THREE.TorusKnotGeometry(0.28, 0.08, 100, 12).translate(0, 0.5, 0)],
    crescent:  ['Crescent', () => { const s = new THREE.Shape(); s.absarc(0, 0.5, 0.5, PI / 2, 1.5 * PI, false); s.absarc(0.25, 0.5, 0.42, -1.05, 1.05, false); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -0.1); }],
    crossblock:['Plus Block', () => [box(-0.5, 0, -0.17, 0.5, 1, 0.17), box(-0.17, 0, -0.5, 0.17, 1, 0.5)]],
  };
  const SIZES = [[0.5, 'h', '½'], [1, '1', '1'], [2, '2', '2'], [4, '4', '4']];
  for (const [k, [l, mk]] of Object.entries(SH)) {
    const bb = new THREE.Box3();
    for (const g of [mk()].flat()) { g.computeBoundingBox(); bb.union(g.boundingBox); g.dispose(); }
    for (const [s, sk, sl] of SIZES) {
      put('Shapes', `sh_${k}_${sk}`, {
        geos: () => [mk()].flat().map((g) => g.scale(s, s, s)),
        cols: [[bb.min.x * s, bb.min.y * s, bb.min.z * s, bb.max.x * s, bb.max.y * s, bb.max.z * s]],
        label: `${l} ${sl}m`,
      }, ['sh_' + k, l, sl + 'm', s === 1]);
    }
  }

  return { pieces, cats, aliases };
}
