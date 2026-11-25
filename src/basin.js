import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Distances use the same world units as the four-unit foundation tiles.
const shoreRadius = a => 280 + 44*Math.sin(3*a) + 28*Math.cos(5*a) + 11*Math.sin(11*a);
const smooth = t => t*t*(3-2*t);
function noise(x,z) {
  const hash = (i,j) => {
    const n = Math.sin(i*127.1+j*311.7)*43758.5453;
    return n-Math.floor(n);
  };
  const i=Math.floor(x), j=Math.floor(z), u=smooth(x-i), v=smooth(z-j);
  const mix=THREE.MathUtils.lerp;
  return mix(mix(hash(i,j),hash(i+1,j),u),mix(hash(i,j+1),hash(i+1,j+1),u),v);
}

function elevation(x,z,a,inland) {
  const foothills = Math.min(1,Math.max(0,inland/100));
  return -2 + Math.min(4,inland*0.19) + foothills*(4+21*noise(x/67,z/67))
    + Math.min(1, Math.max(0,inland/28))*2.8*noise(x/11,z/11);
}

export function createBasin() {
  const group = new THREE.Group(), positions=[], colors=[], index=[];
  const slices=384, bands=84;
  const bank=new THREE.Color(0x897d66), grass=new THREE.Color(0x4c5238);
  const tint=new THREE.Color(), uvs=[];
  for(let j=0;j<=bands;j++) for(let i=0;i<slices;i++) {
    const a=i*2*Math.PI/slices;
    const inland=1330*Math.pow(j/bands,1.55), r=shoreRadius(a)+inland;
    const x=r*Math.cos(a), z=r*Math.sin(a), y=elevation(x,z,a,inland);
    positions.push(x,y,z);
    uvs.push(x/12,z/12);
    const weather=noise(x/39,z/39);
    tint.copy(bank).lerp(grass,THREE.MathUtils.smoothstep(y,1,10))
      .multiplyScalar(0.79+0.26*weather);
    colors.push(tint.r,tint.g,tint.b);
    if(j<bands) {
      const k=j*slices+i, next=j*slices+(i+1)%slices;
      index.push(k,next,k+slices,next,next+slices,k+slices);
    }
  }
  const terrain=new THREE.BufferGeometry();
  terrain.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  terrain.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  terrain.setIndex(index);
  terrain.computeVertexNormals();
  const gravel=new THREE.TextureLoader().load(import.meta.env.BASE_URL+'art/concrete.jpg');
  gravel.wrapS=gravel.wrapT=THREE.RepeatWrapping;
  gravel.colorSpace=THREE.SRGBColorSpace;
  group.add(new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({map:gravel,vertexColors:true,roughness:1})));

  const branches = [];
  for(let tier=0;tier<5;tier++) {
    const radius=0.17*(1-tier*0.16), height=0.50-tier*0.055;
    branches.push(new THREE.ConeGeometry(radius,height,8).rotateY(1.1*tier)
      .translate(0,0.12+tier*0.16+height/2,0));
  }
  branches.push(new THREE.CylinderGeometry(0.009,0.021,0.33,6).translate(0,0.165,0));
  const trees=new THREE.InstancedMesh(mergeGeometries(branches),new THREE.MeshLambertMaterial(),6200);
  let seed=1301,count=0;
  const random=()=> (seed=seed*16807%2147483647)/2147483647;
  const pose=new THREE.Object3D();
  for(let i=0;i<trees.instanceMatrix.count;i++) {
    const a=random()*2*Math.PI,inland=11+250*random()**1.65;
    const radius=shoreRadius(a)+inland,x=radius*Math.cos(a),z=radius*Math.sin(a);
    if(noise(x/35,z/35)<0.23) continue;
    const h=6+random()*8;
    pose.position.set(x,elevation(x,z,a,inland)-0.45,z);
    pose.rotation.y=random()*Math.PI*2;
    pose.scale.setScalar(h);
    pose.updateMatrix();
    trees.setMatrixAt(count,pose.matrix);
    tint.setHex(0x405b46).multiplyScalar(0.67+random()*0.5);
    trees.setColorAt(count++,tint);
  }
  trees.count=count;
  group.add(trees);
  return group;
}
