import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTexture, applyTriplanar } from './textures.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const up = v(0, 1, 0);
const stock = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({
  color, roughness, metalness, side: THREE.DoubleSide,
});
const glowStock = (color, emissive, emissiveIntensity) => new THREE.MeshStandardMaterial({
  color, emissive, emissiveIntensity, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide,
});
export const finishes = {
  iron: stock(0x454442, 0.55, 0.7), brass: stock(0x9b7546, 0.38, 0.72),
  timber: stock(0x62402b, 0.89), linen: stock(0xcfbd96, 0.99),
  moss: stock(0x596c36, 0.97), leaves: stock(0x324d30, 0.94),
  petals: stock(0xe7b96b, 0.89), soil: stock(0x4a3729, 1),
  flame: new THREE.MeshBasicMaterial({ color: 0xffbc62, side: THREE.DoubleSide }),
  crystal: glowStock(0xc9a7ff, 0x7a3cff, 0.9), aqua: glowStock(0x9ff3ff, 0x18c6e0, 1.1),
  ember: glowStock(0xffc07a, 0xff6a10, 1.2), emerald: glowStock(0x9dffb0, 0x16c060, 0.9),
  frost: glowStock(0xf2fbff, 0x9fd8ff, 0.5),
  void: new THREE.MeshBasicMaterial({ color: 0x140726, side: THREE.DoubleSide }),
  water: new THREE.MeshStandardMaterial({ color: 0x2f7fa8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
};
applyTriplanar(finishes.timber, getTexture('planks'), 0.65);
finishes.timber.color.setHex(0xc5a486);
applyTriplanar(finishes.linen, getTexture('linen'), 1.2);
applyTriplanar(finishes.iron, getTexture('metal'), 0.9);

function rod(a, b, width, depth = width) {
  const delta = b.clone().sub(a);
  const g = new THREE.BoxGeometry(width, delta.length(), depth);
  return g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()))
    .translate(...a.clone().lerp(b, 0.5).toArray());
}

function crown(x, y, z, size, seed) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i), b = p.getY(i), c = p.getZ(i);
    const r = size * (0.86 + 0.16 * Math.sin(a*14 + b*11 + c*18 + seed));
    p.setXYZ(i, x + a*r, y + b*r*0.85, z + c*r);
  }
  geo.computeVertexNormals();
  return geo;
}

// Geometry is compiled once per catalog entry. Submeshes sharing a finish use one draw call.
export function fabricate(type, piece) {
  const batches = new Map();
  const add = (finish, geometry) => {
    if (!batches.has(finish)) batches.set(finish, []);
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    }
    batches.get(finish).push(geo);
  };
  const rail = (finish, a, b, w, d) => add(finish, rod(v(...a), v(...b), w, d));
  const plate = (finish, x,y,z,w,h,d) => add(finish, new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  const pin = (x,y,z,r) => add('iron', new THREE.CylinderGeometry(r,r,0.013,8).translate(x,y,z));
  const original = piece.geos();
  const accents = {
    barrel: {1:'iron',2:'iron',3:'iron'}, bed: {1:'linen',2:'linen'},
    flowerbed: {0:'main'}, torch: {1:'flame'}, firepit: {4:'flame'},
    lantern: {1:'brass',2:'flame'}, lamppost: {2:'flame'}, well: {1:'timber',2:'timber'},
    flagpole: {1:'linen'}, portcullis: {3:'iron'}, planter: {1:'leaves'},
    pool: {4:'soil'}, fountain: {2:'brass'}, parasol: {0:'timber'},
  };
  original.forEach((geo, i) => {
    if (type === 'rock') return;
    if ((type === 'banner' && i === 0) || (type === 'flagpole' && i === 1)) return;
    if (['tree','pine','bush','flowerbed'].includes(type) && (i || type === 'bush')) return;
    add(geo.userData?.finish || accents[type]?.[i] || 'main', geo);
  });

  if (['foundation','deck','pier','walkway','floor','halffloor','quarterfloor','plank','step','gridfloor','balcony'].includes(type)) {
    original[0].computeBoundingBox();
    const {min,max} = original[0].boundingBox;
    for (const x of [min.x + 0.09, max.x - 0.09]) {
      for (const z of [min.z + 0.14, max.z - 0.14]) pin(x,max.y,z,0.033);
      if (type !== 'foundation') rail('timber',[x,min.y-0.075,min.z],[x,min.y-0.075,max.z],0.09,0.15);
    }
    if (type === 'foundation') {
      for (const z of [-1.95,1.95]) plate('iron',0,-0.33,z,3.9,0.08,0.035);
    }
  }

  // Outline only exposed edges of pitched panels, including hips and valleys.
  if (piece.surf) {
    const edges = new Map();
    for (const tri of piece.surf) for (let i=0; i<3; i++) {
      const a = tri[i], b = tri[(i+1)%3];
      const key = [a.join(','),b.join(',')].sort().join('|');
      edges.set(key, edges.has(key) ? null : [a,b]);
    }
    for (const edge of edges.values()) if (edge) rail('timber',
      [edge[0][0],edge[0][1]-0.12,edge[0][2]],
      [edge[1][0],edge[1][1]-0.12,edge[1][2]],0.095,0.12);
  }
  if (type.includes('stairs') || piece.ramp) {
    const height = piece.rise || (type === 'halfstairs' ? 1.5 : 3);
    const half = type.startsWith('narrow') ? 1 : 2;
    for (const z of [0.18-half,half-0.18]) {
      rail('timber',[-1.94,-0.10,z],[1.94,height-0.14,z],0.16,0.2);
    }
  }
  if (['wall','tallwall','thickwall','halflenwall','halfwall','doorway','window','widewindow','widedoor','slitwindow','roundwindow','arcdoor','archwindow','arch','mullion','portcullis'].includes(type)) {
    const width = type === 'halflenwall' ? 2 : 4;
    const height = Math.max(...piece.cols.map(b=>b[4]));
    plate('main',-2+width/2,height-0.065,2,width,0.13,0.29);
    for (const x of [-1.92,width-2.08]) {
      plate('main',x,height/2,2,0.16,height,0.26);
    }
  }
  if (['crate','chest','counter'].includes(type)) {
    const w = type==='counter' ? 1.48 : 0.49;
    const z = type==='counter' ? 0.403 : type==='crate' ? 0.505 : 0.355;
    const h = type==='counter' ? 0.94 : type==='crate' ? 0.97 : 0.64;
    for (const face of [-z,z]) {
      for (const x of [-w+0.065,w-0.065]) plate(type==='chest'?'iron':'timber',x,h/2,face,0.085,h,0.035);
      for (const y of [0.06,h-0.06]) plate('timber',0,y,face,2*w,0.085,0.04);
      if (type==='crate') rail('timber',[-w+0.1,0.1,face],[w-0.1,h-0.1,face],0.10,0.04);
    }
    if(type==='chest') plate('brass',0,0.48,z+0.024,0.12,0.18,0.035);
  }
  if (['bench','chair','table','stool'].includes(type)) {
    const width = {bench:0.71, chair:0.25, table:0.62, stool:0.18}[type];
    for (const z of [-0.17,0.17]) rail('timber',[-width,0.23,z],[width,0.23,z],0.055);
    if (type==='stool') for (const x of [-width,width]) for(const z of [-0.14,0.14])
      rail('main',[x,0,z],[x*0.75,0.43,z*0.75],0.045);
  }
  if (type==='bookshelf') for (let i=0;i<25;i++) {
    const row = Math.floor(i/9);
    plate(['timber','linen','moss'][i%3],-0.79+(i%9)*0.17,0.24+row*0.55,1.99,
      0.11,0.3+0.065*Math.sin(i*2),0.23);
  }
  if (type==='tree' || type==='bush' || type==='planter') {
    const small=type!=='tree', size=small?0.55:1;
    for (let i=0;i<18;i++) {
      const angle=i*2.39996, r=size*Math.sqrt(i/18);
      const x=r*Math.cos(angle), z=r*Math.sin(angle);
      const y=(small ? (type==='planter'?1.1:0.67) : 3.25) - 0.65*r + 0.13*Math.sin(i*8);
      add(type==='bush' && i%3===0 ? 'main' : i%4?'leaves':'moss',crown(x,y,z,size*(0.48+0.16*Math.cos(i)),i));
      if (!small && i%3===0) rail('main',[0,1.2,0],[x,y,z],0.095);
    }
  }
  if(type==='pine') {
    for(let i=0;i<64;i++) {
      const t=i/64, a=i*2.39996, r=(1-t)*0.95;
      add(i%5?'leaves':'moss',new THREE.ConeGeometry(0.06+r*0.49,0.32+r*0.62,7)
        .rotateZ(0.58).rotateY(a).translate(r*Math.cos(a),0.9+t*3,r*-Math.sin(a)));
    }
  }
  if(type==='flowerbed') {
    plate('soil',0,0.208,0,2.2,0.02,0.78);
    for(let i=0;i<42;i++) {
      const x=Math.sin(i*71)*1.04,z=Math.cos(i*89)*0.33,h=0.36+0.10*Math.sin(i);
      rail('leaves',[x,0.21,z],[x,h,z],0.014);
      add('petals',new THREE.IcosahedronGeometry(0.045,0).scale(1,0.4,1).translate(x,h,z));
    }
  }
  if (['dome','talldome','spire','coneroof','pyramid'].includes(type)) {
    const dome = type.endsWith('dome'), pyramid = type==='pyramid';
    const radius = dome ? 2 : pyramid ? 2.2*Math.SQRT2 : type==='spire' ? 1.4 : 2.8;
    const height = {dome:2,talldome:3.4,spire:4.5,coneroof:2.4,pyramid:1.8}[type];
    const bottom = dome ? 0 : 3, segments = pyramid ? 4 : 8;
    for (let i=0;i<segments;i++) {
      const a = i*2*Math.PI/segments + (pyramid ? Math.PI/4 : 0);
      const points = [];
      for (let j=0;j<=12;j++) {
        const t=j/12, r=radius*(dome ? Math.cos(t*Math.PI/2) : 1-t);
        points.push(v(r*Math.sin(a), bottom+height*(dome ? Math.sin(t*Math.PI/2) : t), r*Math.cos(a)));
      }
      add('brass',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,0.023,5,false));
    }
  }
  if (['pillar','roundpillar','tallpost','column','tower','obelisk'].includes(type)) {
    original[0].computeBoundingBox();
    const {min,max}=original[0].boundingBox, cx=(min.x+max.x)/2, cz=(min.z+max.z)/2;
    for (const y of [min.y+0.12,max.y-0.15]) {
      const radius=(max.x-min.x)/2;
      if (['column','tower','roundpillar'].includes(type))
        add('main',new THREE.CylinderGeometry(radius+0.048,radius+0.062,0.12,32).translate(cx,y,cz));
      else plate('iron',cx,y,cz,2*radius+0.037,0.085,max.z-min.z+0.037);
    }
  }
  if(type==='flagpole' || type==='banner') {
    const flag=type==='flagpole', width=flag?1.04:1,height=flag?0.8:1.6;
    const cloth=new THREE.PlaneGeometry(width,height,20,16);
    const p=cloth.attributes.position;
    for (let i=0;i<p.count;i++) {
      const x=p.getX(i), y=p.getY(i), free=flag?x/width+0.5:0.5-y/height;
      p.setXYZ(i,x+(flag?0.58:0),y+(flag?3.5:2)-0.09*free,
        (flag?0:1.89)+free*0.09*Math.sin(x*13+y*2.5));
    }
    cloth.computeVertexNormals();
    add(flag?'linen':'main',cloth);
  }
  if(type==='well') {
    rail('timber',[-0.9,1.68,0],[0.9,1.68,0],0.10);
    add('iron',new THREE.CylinderGeometry(0.16,0.16,0.3,20).rotateZ(Math.PI/2).translate(0,1.68,0));
    rail('linen',[0,1.67,0],[0,0.58,0],0.027);
  }
  if(type==='haybale') for(const x of [-0.3,0.3])
    add('linen',new THREE.TorusGeometry(0.504,0.014,6,32).rotateY(Math.PI/2).translate(x,0.5,0));
  if(type==='mailbox') {
    plate('iron',0,1.08,0.31,0.37,0.026,0.025);
    plate('brass',0,1.22,0.32,0.13,0.032,0.035);
  }
  if(type==='rock') {
    const stone=new THREE.IcosahedronGeometry(1,2), p=stone.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
      const fracture=0.82+0.10*Math.sin(7*x+3*z)+0.07*Math.cos(9*z-5*y);
      p.setXYZ(i,x*fracture,0.43+y*fracture*0.64,z*fracture*1.13);
    }
    stone.computeVertexNormals();
    add('main',stone);
  }
  if(type==='lamppost' || type==='lantern') {
    const post=type==='lamppost', cy=post?2.95:2.35, r=post?0.3:0.14;
    for(const sign of [-1,1])
      add('iron',new THREE.CylinderGeometry(r*1.04,r*0.93,r*0.23,16).translate(0,cy+sign*r*0.86,0));
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3, x=r*Math.cos(a), z=r*Math.sin(a);
      rail('iron',[x,cy-r*0.87,z],[x,cy+r*0.87,z],r*0.09);
    }
  }
  if(type==='tent') for(const x of [-1.3,1.3]) for(const z of [-1.2,1.2])
    rail('linen',[x*0.57,0.75,z],[x*1.19,0.02,z*1.12],0.02);
  return [...batches].map(([finish, geos]) => ({ finish, geo:mergeGeometries(geos) }));
}
