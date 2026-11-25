import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { createBasin } from './basin.js';

export function rippleNormals() {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x * 2*Math.PI/size, v = y * 2*Math.PI/size;
    const wind = Math.sin(2*u+v) + 0.6*Math.sin(3*v-u);
    const a = Math.cos(7*u + 12*v + 1.8*wind), b = Math.cos(4*u-9*v + wind);
    const i = 4*(y*size+x);
    data[i] = 128 + 23*a + 14*b;
    data[i+1] = 128 + 34*a - 18*b + 8*Math.sin(18*v+3*u);
    data[i+2] = 248;
    data[i+3] = 255;
  }
  const map = new THREE.DataTexture(data,size,size);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

export function createLake(scene, sun) {
  const loader = new THREE.TextureLoader();
  function distanceMap(size) {
    const texture = loader.load(import.meta.env.BASE_URL + 'art/alpine-distance-' + size + '.jpg');
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }
  scene.background = distanceMap(6144);
  scene.environment = distanceMap(1024);
  const rotation = -Math.PI - Math.atan2(sun.position.z, sun.position.x);
  scene.backgroundRotation.y = scene.environmentRotation.y = rotation;
  scene.environmentIntensity = 0.82;
  scene.add(createBasin());

  const water = new Water(new THREE.PlaneGeometry(12000,12000), {
    textureWidth: 640, textureHeight: 640, waterNormals: rippleNormals(),
    sunDirection: sun.position.clone().normalize(), sunColor: 0xffe2b4,
    waterColor: 0x245653, distortionScale: 0.62, clipBias: 0.002,
  });
  water.rotation.x = -Math.PI/2;
  water.position.y = -0.55;
  water.material.uniforms.size.value = 6.5;
  const uniforms = water.material.uniforms;
  uniforms.skyMap = {value:scene.environment};
  uniforms.skyRotation = {value:new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(-rotation))};
  uniforms.shoreIntensity = {value:1};
  // Retain the reflected sky's exposure across the waterline, including after sunset.
  water.material.fragmentShader = water.material.fragmentShader
    .replace('noise.xzy * vec3( 1.5, 1.0, 1.5 )', `noise.xzy * vec3(
      mix(0.34, 0.035, smoothstep(12.0, 140.0, length(eye - worldPosition.xyz)) ),
      1.0,
      mix(0.34, 0.035, smoothstep(12.0, 140.0, length(eye - worldPosition.xyz)) )
    )`)
    .replace('uniform sampler2D mirrorSampler;', `uniform sampler2D mirrorSampler;
      uniform sampler2D skyMap;
      uniform mat3 skyRotation;
      uniform float shoreIntensity;`)
    .replace('vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );', `
      vec3 reflected = reflect(-eyeDirection, surfaceNormal);
      reflected.y = max(reflected.y, 0.001);
      vec3 distant = texture2D(skyMap, equirectUv(normalize(skyRotation * reflected))).rgb * shoreIntensity;
      vec4 local = texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion);
      vec3 reflectionSample = distant * (1.0 - local.a) + local.rgb;
    `)
    .replace('float rf0 = 0.3;', 'float rf0 = 0.11;')
    .replace('vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight',
      'reflectionSample + sunColor * specularLight * 0.26');
  // The planar pass contains nearby geometry only. Sampling the distant sphere
  // by ray direction avoids stretching a screen-space snapshot at grazing angles.
  const reflectObjects = water.onBeforeRender;
  const clearColor = new THREE.Color();
  water.onBeforeRender = function(renderer, world, ...args) {
    const background = world.background;
    renderer.getClearColor(clearColor);
    const alpha = renderer.getClearAlpha();
    world.background = null;
    renderer.setClearColor(0, 0);
    try {
      reflectObjects.call(this, renderer, world, ...args);
    } finally {
      world.background = background;
      renderer.setClearColor(clearColor, alpha);
    }
  };
  water.receiveShadow = true;
  scene.add(water);
  return {
    update(dt,camera) {
      water.material.uniforms.time.value += dt*0.37;
      water.position.x = camera.position.x;
      water.position.z = camera.position.z;
    },
    setNight(night) {
      scene.backgroundIntensity = night ? 0.035 : 1;
      uniforms.shoreIntensity.value = scene.backgroundIntensity;
      scene.environmentIntensity = night ? 0.065 : 0.82;
      water.material.uniforms.sunColor.value.set(night ? 0x455570 : 0xffe2b4);
      water.material.uniforms.waterColor.value.set(night ? 0x0b1a25 : 0x23504e);
    },
  };
}
