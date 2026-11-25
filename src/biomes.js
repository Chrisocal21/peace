// Biomes: each world (save) picks one. A biome owns the sky, lighting, the shape and colours of the ground
// (the sculptable build area in main.js plus the distant land around it), water / ice / lava / cloud sea,
// scattered trees and rocks, and weather particles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLake, rippleNormals } from './lake.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function makeNoise(seed) {
  const hash = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7 + seed * 0.731) * 43758.5453; return n - Math.floor(n); };
  const sm = (t) => t * t * (3 - 2 * t);
  const n2 = (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), u = sm(x - i), v = sm(z - j);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1, n = 0; for (let k = 0; k < o; k++) { s += a * n2(x * f + k * 17.3, z * f - k * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; };
  return { n2, fbm };
}

// ----------------------------------------------------------------------------------- biome definitions
const NIGHT = { fog: 0x0b1426, hemiSky: 0x6f86c0, hemiGround: 0x1a2230, hemiI: 0.28, sunColor: 0x8aa4ff, sunI: 0.35 };
const NIGHT_SKY = { top: '#03070f', hor: '#16203a', bot: '#080c16' };
const DEFS = {
  meadow: {
    name: 'Green Meadow', blurb: 'Rolling grassland with oak groves, ponds and far-off peaks.', swatch: ['#8fc3ea', '#6f9a45'],
    sky: { top: '#4f8fd6', hor: '#d4e9f6', bot: '#86a06e', sun: '#fff3d6' },
    day: { fog: 0xcfe2ef, fogDensity: 0.0009, hemiSky: 0xe6f3ff, hemiGround: 0x6b7f4a, hemiI: 0.95, sunColor: 0xfff0d0, sunI: 2.3 },
    height: (x, z, N) => {
      const r = Math.hypot(x, z), m = ss(22, 85, r);
      return 0.05 + m * ((N.fbm(x / 95, z / 95) - 0.47) * 15 + (N.fbm(x / 22, z / 22) - 0.5) * 1.4) + ss(380, 950, r) * Math.pow(N.fbm(x / 260 + 3, z / 260), 2.2) * 330;
    },
    palette: [[-6, '#5b6a3c'], [-0.8, '#6d7f42'], [0, '#6f9a45'], [6, '#5c8a3b'], [16, '#77874f'], [60, '#8b8778'], [150, '#a3a097'], [210, '#f4f6f8']],
    rock: '#878274', rockSlope: [0.55, 1.1],
    water: { kind: 'water', level: -0.7, color: 0x3f7f8c },
    scatter: [{ kind: 'oak', n: 2600, r0: 105, r1: 520, s0: 6, s1: 11, clump: 60, maxH: 40 }, { kind: 'bush', n: 1800, r0: 100, r1: 420, s0: 1.5, s1: 3.5, maxH: 30 }, { kind: 'rock', n: 500, r0: 100, r1: 700, s0: 1, s1: 4, color: '#8d8a80' }, { kind: 'pine', n: 1800, r0: 380, r1: 900, s0: 8, s1: 14, minH: 30, maxH: 160 }],
  },
  desert: {
    open: true, name: 'Desert Mesa', blurb: 'Warm dunes, red rock mesas, cacti and a huge sky.', swatch: ['#f3dcb0', '#c98a55'],
    sky: { top: '#3d7fc8', hor: '#f4dfb6', bot: '#cfa776', sun: '#fff0cc' },
    day: { fog: 0xf0dcb8, fogDensity: 0.0007, hemiSky: 0xfff1d6, hemiGround: 0xb08a5a, hemiI: 1, sunColor: 0xffe3b0, sunI: 2.7 },
    height: (x, z, N) => {
      const r = Math.hypot(x, z), m = ss(24, 95, r);
      const dunes = (Math.abs(Math.sin((x * 0.75 + z * 0.35) / 19 + N.fbm(x / 70, z / 70) * 4.5)) - 0.5) * 5.5 + (N.fbm(x / 40, z / 40) - 0.5) * 3;
      const t = N.fbm(x / 190 + 7, z / 190), far = ss(230, 480, r);
      return -0.12 + m * dunes + far * (ss(0.53, 0.57, t) * 70 + ss(0.63, 0.66, t) * 40);
    },
    palette: [[-4, '#c8a067'], [0, '#e2c185'], [4, '#e9cd96'], [14, '#d9a46a'], [40, '#b8683f'], [80, '#a4553a'], [120, '#c07a50']],
    rock: '#a45a3a', rockSlope: [0.6, 1.2],
    water: null,
    scatter: [{ kind: 'cactus', n: 900, r0: 100, r1: 600, s0: 2, s1: 4.5, maxH: 10 }, { kind: 'deadtree', n: 300, r0: 100, r1: 600, s0: 2, s1: 4, maxH: 12, color: '#8a6a4c' }, { kind: 'rock', n: 900, r0: 100, r1: 900, s0: 1, s1: 6, color: '#b5774e' }],
  },
  tundra: {
    name: 'Snowy Tundra', blurb: 'Deep snow, frozen lakes, snowy pines and falling snow.', swatch: ['#c9d9e8', '#eef3f7'],
    sky: { top: '#7d9fc2', hor: '#e8eff5', bot: '#e3eaf0', sun: '#fff8ee' },
    day: { fog: 0xdde8f0, fogDensity: 0.0016, hemiSky: 0xeaf4ff, hemiGround: 0xb9c6d2, hemiI: 1.05, sunColor: 0xfff6e8, sunI: 1.8 },
    height: (x, z, N) => {
      const r = Math.hypot(x, z), m = ss(22, 85, r);
      return 0.05 + m * ((N.fbm(x / 80, z / 80) - 0.48) * 13) + ss(300, 850, r) * Math.pow(N.fbm(x / 220 + 5, z / 220), 1.8) * 300;
    },
    palette: [[-6, '#a9bccb'], [-0.5, '#cfdbe5'], [0, '#eef3f7'], [20, '#e6edf3'], [100, '#dbe3ea'], [200, '#ffffff']],
    rock: '#6c757e', rockSlope: [0.75, 1.4],
    water: { kind: 'ice', level: -0.45, color: 0xcfe6f2 },
    particles: 'snow',
    scatter: [{ kind: 'snowpine', n: 3400, r0: 100, r1: 750, s0: 7, s1: 14, clump: 45, maxH: 150 }, { kind: 'rock', n: 500, r0: 100, r1: 800, s0: 1, s1: 5, color: '#7d868f' }],
  },
  tropic: {
    name: 'Tropical Isle', blurb: 'A sandy island in a turquoise sea, palms and distant atolls.', swatch: ['#7fd3f0', '#2fb3b0'],
    sky: { top: '#2a86d8', hor: '#c6edf8', bot: '#5cc0c0', sun: '#fff4dc' },
    day: { fog: 0xc4ebf6, fogDensity: 0.0006, hemiSky: 0xe8fbff, hemiGround: 0x8fb08a, hemiI: 1, sunColor: 0xfff2d6, sunI: 2.6 },
    height: (x, z, N) => {
      const r = Math.hypot(x, z) + (N.fbm(x / 60, z / 60) - 0.5) * 40, isl = 1 - ss(55, 120, r);
      let h = -9 + 9.3 * isl + isl * ss(25, 60, r) * (N.fbm(x / 35, z / 35) - 0.35) * 6;
      const f = N.fbm(x / 160 + 11, z / 160);
      return h + ss(0.62, 0.74, f) * ss(220, 320, Math.hypot(x, z)) * 13;
    },
    palette: [[-9, '#cdbb8c'], [-1, '#e6d6a4'], [0.35, '#efe3b8'], [1, '#86ad4f'], [4, '#5a8f3c'], [12, '#4b7a35']],
    rock: '#7d7566', rockSlope: [0.8, 1.5],
    water: { kind: 'water', level: -0.55, color: 0x22b2b4 },
    scatter: [{ kind: 'palm', n: 1400, r0: 100, r1: 900, s0: 6, s1: 9, minH: 0.4, maxH: 14 }, { kind: 'bush', n: 900, r0: 100, r1: 900, s0: 1.2, s1: 2.6, minH: 0.8 }, { kind: 'rock', n: 300, r0: 100, r1: 900, s0: 0.8, s1: 3, minH: -1.5, color: '#8f8574' }],
  },
  volcanic: {
    name: 'Ashlands', blurb: 'Black rock, rivers of glowing lava, a smoking volcano and drifting embers.', swatch: ['#a8442a', '#2b2421'],
    sky: { top: '#2a1618', hor: '#b04a2a', bot: '#2a1a16', sun: '#ffb07a' },
    day: { fog: 0x5a2e22, fogDensity: 0.0017, hemiSky: 0xffb890, hemiGround: 0x5a3a2c, hemiI: 1.1, sunColor: 0xffb080, sunI: 2.0 },
    night: { fog: 0x1a0a08, hemiSky: 0x9a4a30, hemiGround: 0x140a08, hemiI: 0.3, sunColor: 0xff6a3a, sunI: 0.3 },
    nightSky: { top: '#070305', hor: '#4a1408', bot: '#120604' },
    height: (x, z, N) => {
      const r = Math.hypot(x, z), m = ss(22, 85, r);
      const d = Math.hypot(x - 520, z + 680), vol = Math.max(0, 300 * (1 - d / 460)) - ss(70, 0, d) * 140;
      return 0.05 + m * ((N.fbm(x / 50, z / 50) - 0.5) * 10) + vol + ss(300, 900, r) * N.fbm(x / 200, z / 200) * 60;
    },
    palette: [[-6, '#3a302c'], [-1, '#54463f'], [0, '#6b5b52'], [8, '#7a685d'], [60, '#85705f'], [250, '#4a3c34']],
    rock: '#221c1a', rockSlope: [0.7, 1.3],
    water: { kind: 'lava', level: -1.4, color: 0xff5a10 },
    particles: 'embers',
    scatter: [{ kind: 'deadtree', n: 900, r0: 100, r1: 700, s0: 4, s1: 8, minH: -1, maxH: 40, color: '#2a2320' }, { kind: 'rock', n: 1200, r0: 100, r1: 900, s0: 1, s1: 6, minH: -1.2, color: '#2a2422' }],
  },
  sky: {
    name: 'Sky Islands', blurb: 'A floating island high above a sea of clouds, other islands drifting nearby.', swatch: ['#b9cff5', '#f2e6ff'],
    sky: { top: '#5a8de0', hor: '#f2e8fb', bot: '#eef2fa', sun: '#fff6e6' },
    day: { fog: 0xe4ecfa, fogDensity: 0.0007, hemiSky: 0xffffff, hemiGround: 0xa8c0e0, hemiI: 1.05, sunColor: 0xfff4e0, sunI: 2.4 },
    height: (x, z, N) => {
      const r = Math.hypot(x, z) + (N.fbm(x / 22, z / 22) - 0.5) * 16;
      return r < 52 ? 0.05 + (N.fbm(x / 30, z / 30) - 0.5) * 2.2 * ss(18, 42, r) - ss(40, 52, r) * 3 : -60;
    },
    palette: [[-3, '#7a6a55'], [-0.4, '#7c8a4a'], [0, '#6aa04a'], [2, '#5c9440']],
    rock: '#7a6a55', rockSlope: [0.8, 1.6],
    water: { kind: 'clouds', level: -90, color: 0xf6f8fd },
    noFar: true,
    scatter: [],
  },
};

export const BIOMES = [
  { id: 'desert', ...pick(DEFS.desert) },
];   // meadow, tundra, tropic, volcanic, sky and the lake are parked in DEFS until they get the open-world treatment
function pick(d) { return { name: d.name, blurb: d.blurb, swatch: d.swatch }; }
export const biomeName = (id) => BIOMES.find((b) => b.id === id)?.name || 'Desert Mesa';

// ----------------------------------------------------------------------------------- scatter geometry
function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const KINDS = {
  pine: () => [...[0, 1, 2, 3, 4].map((t) => colored(new THREE.ConeGeometry(0.17 * (1 - t * 0.16), 0.5 - t * 0.055, 8).rotateY(1.1 * t).translate(0, 0.12 + t * 0.16 + (0.5 - t * 0.055) / 2, 0), '#3f5f45')), colored(new THREE.CylinderGeometry(0.009, 0.021, 0.33, 6).translate(0, 0.165, 0), '#5a4030')],
  snowpine: () => [...[0, 1, 2, 3, 4].flatMap((t) => { const r = 0.17 * (1 - t * 0.16), h = 0.5 - t * 0.055, y = 0.12 + t * 0.16; return [colored(new THREE.ConeGeometry(r, h, 8).rotateY(1.1 * t).translate(0, y + h / 2, 0), '#34503f'), colored(new THREE.ConeGeometry(r * 0.75, h * 0.45, 8).rotateY(1.1 * t).translate(0, y + h * 0.78, 0), '#f2f6fa')]; }), colored(new THREE.CylinderGeometry(0.009, 0.021, 0.33, 6).translate(0, 0.165, 0), '#5a4030')],
  oak: () => [colored(new THREE.CylinderGeometry(0.035, 0.06, 0.55, 7).translate(0, 0.27, 0), '#5c4330'), ...[[0, 0.66, 0, 0.3], [0.17, 0.58, 0.1, 0.22], [-0.15, 0.6, -0.11, 0.24], [0.02, 0.8, -0.05, 0.2]].map(([x, y, z, r], i) => colored(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), i % 2 ? '#5d8a3e' : '#4b7634'))],
  bush: () => [colored(new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.7, 1).translate(0, 0.3, 0), '#557f3a')],
  palm: () => {
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push(colored(new THREE.CylinderGeometry(0.025 - i * 0.002, 0.03 - i * 0.002, 0.16, 7).translate(0.004 * i * i, 0.08 + i * 0.155, 0), '#8a6a48'));
    for (let i = 0; i < 8; i++) parts.push(colored(new THREE.BoxGeometry(0.42, 0.01, 0.09).translate(0.21, 0, 0).rotateZ(-0.38).rotateY((i * Math.PI) / 4).translate(0.14, 0.95, 0), '#4f8f3a'));
    return parts;
  },
  cactus: () => [colored(new THREE.CylinderGeometry(0.08, 0.085, 1, 9).translate(0, 0.5, 0), '#5f8a48'), colored(new THREE.SphereGeometry(0.08, 9, 6).translate(0, 1, 0), '#5f8a48'), colored(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 8).translate(0.17, 0.62, 0), '#5f8a48'), colored(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8).rotateZ(Math.PI / 2).translate(0.1, 0.47, 0), '#5f8a48'), colored(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8).translate(-0.15, 0.72, 0), '#5f8a48'), colored(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8).rotateZ(Math.PI / 2).translate(-0.09, 0.6, 0), '#5f8a48')],
  deadtree: (c) => { const col = c || '#4a3d33', st = (a, b, r) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A); return colored(new THREE.CylinderGeometry(r * 0.6, r, d.length(), 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())).translate(...A.clone().lerp(Bv, 0.5).toArray()), col); }; return [st([0, 0, 0], [0.03, 1, 0], 0.045), st([0.02, 0.6, 0], [0.3, 0.9, 0.1], 0.02), st([0.02, 0.5, 0], [-0.25, 0.75, -0.1], 0.02), st([0.03, 0.8, 0], [0.1, 1.1, -0.2], 0.015)]; },
  rock: (c) => [colored(new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.6, 1.2).translate(0, 0.15, 0), c || '#8a8780')],
};

// ----------------------------------------------------------------------------------- sky dome
function makeSkyMaterial(sky) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(sky.top) }, hor: { value: new THREE.Color(sky.hor) }, bot: { value: new THREE.Color(sky.bot) }, sunCol: { value: new THREE.Color(sky.sun) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, stars: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, hor, bot, sunCol, sunDir; uniform float stars; varying vec3 vD;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vD); float y = d.y;
        vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y, 0.0, 1.0), 0.5)) : mix(hor, bot, pow(clamp(-y * 3.0, 0.0, 1.0), 0.6));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 900.0) * 5.0 + pow(s, 14.0) * 0.22) * (1.0 - stars);
        if (stars > 0.0 && y > 0.0) c += vec3(step(0.9972, h3(floor(d * 420.0)))) * stars * smoothstep(0.0, 0.3, y);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ----------------------------------------------------------------------------------- environment
const tex = (name, rep) => { const t = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'art/' + name + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; if (rep) t.repeat.set(rep, rep); return t; };
function noiseTexture(seed, size = 128) {
  const N = makeNoise(seed), d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = N.fbm(x / 9, y / 9, 3), b = Math.pow(Math.max(0, v - 0.35) / 0.65, 1.6), i = (y * size + x) * 4;
    d[i] = 255 * Math.min(1, b * 1.4); d[i + 1] = 255 * b * 0.55; d[i + 2] = 30 * b; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, size, size); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createEnvironment({ scene, sun, renderer, biome, seed = 1 }) {
  if (!BIOMES.some((b) => b.id === biome)) biome = 'desert';   // worlds from retired biomes become desert
  const B = DEFS[biome], N = makeNoise(seed), H = (x, z) => B.height(x, z, N);
  const group = new THREE.Group(); scene.add(group);
  const stops = B.palette.map(([h, c]) => [h, new THREE.Color(c)]), rock = new THREE.Color(B.rock);
  function tint(h, slope, out) {
    let i = 0; while (i < stops.length - 1 && h > stops[i + 1][0]) i++;
    if (i >= stops.length - 1 || h <= stops[0][0]) out.copy(stops[i][1]);
    else { const [h0, c0] = stops[i], [h1, c1] = stops[i + 1]; out.copy(c0).lerp(c1, (h - h0) / (h1 - h0)); }
    if (slope > B.rockSlope[0]) out.lerp(rock, ss(B.rockSlope[0], B.rockSlope[1], slope));
    return out;
  }

  // sky + image-based lighting from the same sky
  scene.background = null;
  const skyMat = makeSkyMaterial(B.sky);
  skyMat.uniforms.sunDir.value.copy(sun.position).normalize();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), skyMat);
  dome.renderOrder = -1000; dome.frustumCulled = false; group.add(dome);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0, 0.1, 100).texture; pm.dispose();
  scene.environmentIntensity = 0.8;

  // distant land: a 3.2 km grid that follows you; a uniform box cuts it away where real terrain chunks are loaded
  const detail = tex('concrete');
  const hole = { value: new THREE.Vector4(1, 1, -1, -1) };
  let buildFar = null, farCx = 1e9, farCz = 1e9;
  if (!B.noFar) {
    const E = 1600, C = 16, n = (2 * E) / C, NV = (n + 1) * (n + 1), hs = new Float32Array(NV);
    const g = new THREE.BufferGeometry(), idx = [], c = new THREE.Color();
    const fp = new THREE.BufferAttribute(new Float32Array(NV * 3), 3), fc = new THREE.BufferAttribute(new Float32Array(NV * 3), 3), fu = new THREE.BufferAttribute(new Float32Array(NV * 2), 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * (n + 1) + i; idx.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2); }
    g.setAttribute('position', fp); g.setAttribute('color', fc); g.setAttribute('uv', fu); g.setIndex(idx);
    buildFar = (ox, oz) => {
      farCx = ox; farCz = oz;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) hs[j * (n + 1) + i] = Math.max(-60, Math.min(300, H(ox - E + i * C, oz - E + j * C)));
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i, x = ox - E + i * C, z = oz - E + j * C, h = hs[k];
        const sx = Math.abs(hs[j * (n + 1) + Math.min(n, i + 1)] - hs[j * (n + 1) + Math.max(0, i - 1)]), sz = Math.abs(hs[Math.min(n, j + 1) * (n + 1) + i] - hs[Math.max(0, j - 1) * (n + 1) + i]);
        fp.setXYZ(k, x, h, z); fu.setXY(k, x / 12, z / 12);
        tint(h, (sx + sz) / (2 * C), c).multiplyScalar(0.88 + 0.22 * N.n2(x / 37, z / 37)); fc.setXYZ(k, c.r, c.g, c.b);
      }
      fp.needsUpdate = fc.needsUpdate = fu.needsUpdate = true;
      g.computeVertexNormals();
    };
    buildFar(0, 0);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: detail });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.hole = hole;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform vec4 hole;').replace('void main() {', 'void main() {\n  if (vWp.x > hole.x && vWp.x < hole.z && vWp.z > hole.y && vWp.z < hole.w) discard;');
    };
    const farMesh = new THREE.Mesh(g, mat);
    farMesh.receiveShadow = true; farMesh.frustumCulled = false; group.add(farMesh);
  }

  // water / ice / lava / cloud sea
  let waterMat = null, waterNormals = null, waterPlane = null;
  if (B.water) {
    const w = B.water;
    if (w.kind === 'water') { waterNormals = rippleNormals(); waterNormals.repeat.set(420, 420); waterMat = new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.84, normalMap: waterNormals, normalScale: new THREE.Vector2(0.35, 0.35) }); }
    else if (w.kind === 'ice') waterMat = new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.16, metalness: 0.05, transparent: true, opacity: 0.94 });
    else if (w.kind === 'lava') { waterNormals = noiseTexture(seed); waterNormals.repeat.set(140, 140); waterMat = new THREE.MeshStandardMaterial({ color: 0x1a0500, emissive: w.color, emissiveMap: waterNormals, emissiveIntensity: 2.2, roughness: 0.85 }); }
    else waterMat = new THREE.MeshLambertMaterial({ color: w.color });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), waterMat);
    plane.position.y = w.level; plane.receiveShadow = w.kind !== 'lava'; group.add(plane); waterPlane = plane;
  }

  // scattered trees, cacti, rocks: deterministic 64 m tiles, so the same spot always grows the same things
  const OPEN = !!B.open, EX = OPEN ? 100 : 130, TILE = 64;
  const pose = new THREE.Object3D(), vc = new THREE.Color();
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const scMeshes = B.scatter.map((sc) => {
    const mesh = new THREE.InstancedMesh(mergeGeometries(KINDS[sc.kind](sc.color)), new THREE.MeshLambertMaterial({ vertexColors: true }), Math.ceil(sc.n * 1.4));
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.count = 0; group.add(mesh); return mesh;
  });
  let scCx = 0, scCz = 0, builtFn = null;
  const cellKey = (x, z) => (Math.floor(x / 8) + 50000) * 100000 + Math.floor(z / 8) + 50000;
  function genScatter(cx, cz) {
    scCx = cx; scCz = cz;
    const built = builtFn ? builtFn(cellKey) : null;
    B.scatter.forEach((sc, k) => {
      const mesh = scMeshes[k], cap = mesh.instanceMatrix.count, r1 = sc.r1, r0 = OPEN ? EX : sc.r0;
      const dens = (sc.n / (Math.PI * (r1 * r1 - r0 * r0))) * TILE * TILE * 1.8;
      let count = 0;
      for (let tz = Math.floor((cz - r1) / TILE); tz <= Math.floor((cz + r1) / TILE) && count < cap; tz++) for (let tx = Math.floor((cx - r1) / TILE); tx <= Math.floor((cx + r1) / TILE) && count < cap; tx++) {
        const rnd = mulberry(tx * 73856093 ^ tz * 19349663 ^ seed * 83492791 ^ (k + 1) * 2654435761);
        const tries = Math.floor(dens) + (rnd() < dens % 1 ? 1 : 0);
        for (let t = 0; t < tries && count < cap; t++) {
          const x = (tx + rnd()) * TILE, z = (tz + rnd()) * TILE, r = Math.hypot(x, z);
          const rr = rnd(), ry = rnd(), rs = rnd(), rc = rnd();
          if (OPEN ? Math.hypot(x - cx, z - cz) > r1 : r < sc.r0 || r > r1) continue;
          if (Math.abs(x) < EX && Math.abs(z) < EX) continue;
          if (built && built.has(cellKey(x, z))) continue;
          const h = H(x, z);
          if (h < (sc.minH ?? (B.water ? B.water.level + 0.3 : -1e9)) || h > (sc.maxH ?? 1e9)) continue;
          if ((Math.abs(H(x + 2, z) - H(x - 2, z)) + Math.abs(H(x, z + 2) - H(x, z - 2))) / 4 > 0.6) continue;
          if (sc.clump && N.n2(x / sc.clump, z / sc.clump) < 0.42) continue;
          pose.position.set(x, h - 0.08, z); pose.rotation.set(0, rr * Math.PI * 2, 0);
          pose.scale.setScalar(sc.s0 + (sc.s1 - sc.s0) * rs); pose.updateMatrix();
          mesh.setMatrixAt(count, pose.matrix); mesh.setColorAt(count++, vc.setScalar(0.8 + rc * 0.35)); void ry;
        }
      }
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
  genScatter(0, 0);
  const rnd = (() => { const r = mulberry(seed * 9301 + 49297); return r; })();

  // sky islands: the main island's rocky underside, more islands drifting around, and puffy clouds
  if (biome === 'sky') {
    const under = new THREE.ConeGeometry(54, 46, 40, 8).rotateX(Math.PI).translate(0, -24.5, 0), p = under.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < -2) { const k = 1 + (N.fbm(x / 9 + y / 7, z / 9) - 0.5) * 0.5; p.setXYZ(i, x * k, y, z * k); } }
    under.computeVertexNormals();
    group.add(new THREE.Mesh(under, new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 1, map: detail })));
    const isle = mergeGeometries([colored(new THREE.ConeGeometry(1, 1.6, 9, 3).rotateX(Math.PI).translate(0, -0.8, 0), '#6b5a48'), colored(new THREE.CylinderGeometry(1.04, 1, 0.12, 9).translate(0, 0.02, 0), '#6aa04a'), ...KINDS.oak().map((g) => g.scale(0.5, 0.5, 0.5).translate(0.25, 0.08, 0.1))]);
    const isles = new THREE.InstancedMesh(isle, new THREE.MeshLambertMaterial({ vertexColors: true }), 46);
    for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, r = 130 + rnd() * 800; pose.position.set(r * Math.cos(a), -50 + rnd() * 170, r * Math.sin(a)); pose.rotation.set(0, rnd() * 6.28, 0); pose.scale.setScalar(6 + rnd() * 26); pose.updateMatrix(); isles.setMatrixAt(i, pose.matrix); }
    group.add(isles);
    const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0xffffff }), 420);
    for (let i = 0; i < 420; i++) { const a = rnd() * Math.PI * 2, r = 90 + rnd() * 1300; pose.position.set(r * Math.cos(a), -88 + rnd() * (i % 7 ? 14 : 160), r * Math.sin(a)); pose.rotation.set(0, rnd() * 6.28, 0); const s = 10 + rnd() * 40; pose.scale.set(s * 1.6, s * 0.55, s); pose.updateMatrix(); puffs.setMatrixAt(i, pose.matrix); }
    group.add(puffs);
  }
  if (biome === 'volcanic') {   // glowing crater lake on the volcano
    const crater = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false }));
    crater.position.set(520, H(520, -680) + 4, -680); group.add(crater);
  }

  // weather particles that follow the camera
  let parts = null;
  if (B.particles) {
    const n = B.particles === 'snow' ? 2200 : 900, g = new THREE.BufferGeometry(), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = (rnd() - 0.5) * 100; a[i * 3 + 1] = rnd() * 40; a[i * 3 + 2] = (rnd() - 0.5) * 100; }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const snow = B.particles === 'snow';
    parts = new THREE.Points(g, new THREE.PointsMaterial({ color: snow ? 0xffffff : 0xff8a3a, size: snow ? 0.13 : 0.11, transparent: true, opacity: 0.9, depthWrite: false, blending: snow ? THREE.NormalBlending : THREE.AdditiveBlending }));
    parts.frustumCulled = false; parts.userData.snow = snow; group.add(parts);
  }

  let night = false, time = 0;
  const light = { day: B.day, night: { ...NIGHT, fogDensity: B.day.fogDensity, ...(B.night || {}) } };
  light.day = { ...B.day };
  return {
    id: biome, clip: biome === 'sky', open: OPEN, groundMin: -Infinity, light, detail,
    setHole: (x0, z0, x1, z1) => hole.value.set(x0, z0, x1, z1),
    setBuiltProvider(fn) { builtFn = fn; },
    rescatter() { if (OPEN) genScatter(scCx, scCz); },
    heightAt: H, fieldHeight: H, tint,
    update(dt, camera) {
      time += dt;
      dome.position.copy(camera.position);
      if (OPEN) {
        const cx = camera.position.x, cz = camera.position.z;
        if (buildFar && (Math.abs(cx - farCx) > 480 || Math.abs(cz - farCz) > 480)) buildFar(Math.round(cx / 64) * 64, Math.round(cz / 64) * 64);
        if (Math.hypot(cx - scCx, cz - scCz) > 96) genScatter(cx, cz);
      }
      if (waterPlane) { const u = 6000 / (waterNormals ? waterNormals.repeat.x : 94); waterPlane.position.x = Math.round(camera.position.x / u) * u; waterPlane.position.z = Math.round(camera.position.z / u) * u; }
      if (waterNormals) { waterNormals.offset.x += dt * (B.water.kind === 'lava' ? 0.0009 : 0.006); waterNormals.offset.y += dt * (B.water.kind === 'lava' ? 0.0004 : 0.003); }
      if (parts) {
        const p = parts.geometry.attributes.position, a = p.array, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, snow = parts.userData.snow;
        for (let i = 0; i < a.length; i += 3) {
          a[i + 1] += (snow ? -1.3 : 1.6) * dt * (0.6 + ((i * 7919) % 10) / 20);
          a[i] += Math.sin(time * 0.7 + i) * 0.35 * dt;
          a[i] = cx + ((((a[i] - cx + 50) % 100) + 100) % 100) - 50;
          a[i + 2] = cz + ((((a[i + 2] - cz + 50) % 100) + 100) % 100) - 50;
          if (a[i + 1] < cy - 12) a[i + 1] += 40; else if (a[i + 1] > cy + 28) a[i + 1] -= 40;
        }
        p.needsUpdate = true;
      }
    },
    setNight(n) {
      night = n;
      const s = n ? { ...NIGHT_SKY, ...(B.nightSky || {}) } : B.sky;
      skyMat.uniforms.top.value.set(s.top); skyMat.uniforms.hor.value.set(s.hor); skyMat.uniforms.bot.value.set(s.bot);
      skyMat.uniforms.stars.value = n ? 1 : 0;
      scene.environmentIntensity = n ? 0.07 : 0.8;
      if (waterMat && B.water.kind === 'water') waterMat.color.set(n ? 0x0b1a25 : B.water.color);
      if (waterMat && B.water.kind === 'clouds') waterMat.color.set(n ? 0x2a3550 : B.water.color);
    },
  };
}

// the original alpine lake (photo sky, reflective lake, forested basin), wrapped in the same interface
function lakeEnvironment(scene, sun) {
  const lake = createLake(scene, sun);
  const C = { wet: new THREE.Color(0x8a7a55), sand: new THREE.Color(0xc4b283), grass: new THREE.Color(0x5f7f3c), hill: new THREE.Color(0x486b32), rock: new THREE.Color(0x85817a) };
  return {
    id: 'lake', clip: true, groundMin: -1.5, detail: null,
    light: {
      day: { fog: 0xbfe3f2, fogDensity: 0.00076, hemiSky: 0xdff2ff, hemiGround: 0x6a8a99, hemiI: 0.9, sunColor: 0xffe2b0, sunI: 2.2 },
      night: { fog: 0x0b1426, fogDensity: 0.00076, hemiSky: 0x6f86c0, hemiGround: 0x6a8a99, hemiI: 0.25, sunColor: 0x8aa4ff, sunI: 0.35 },
    },
    heightAt: () => -6, fieldHeight: null,
    tint(h, slope, out) {
      if (h < -0.2) return out.copy(C.wet);
      if (h < 0.5) return out.copy(C.wet).lerp(C.sand, (h + 0.2) / 0.7);
      if (h < 1.5) return out.copy(C.sand).lerp(C.grass, (h - 0.5) / 1);
      if (h < 4) return out.copy(C.grass).lerp(C.hill, (h - 1.5) / 2.5);
      return out.copy(C.hill).lerp(C.rock, Math.min(1, (h - 4) / 3));
    },
    update: (dt, camera) => lake.update(dt, camera),
    setNight: (n) => lake.setNight(n),
  };
}
