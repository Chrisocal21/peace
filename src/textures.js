import * as THREE from 'three';

const surfaces = new Map();
export function getTexture(name) {
  if (!name) return null;
  if (!surfaces.has(name)) {
    const texture = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'art/' + name + '.jpg');
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    surfaces.set(name, texture);
  }
  return surfaces.get(name);
}

// All component geometries are authored in tile coordinates.
export function applyTriplanar(material, texture, scale = 0.25) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tpTex = { value: texture };
    shader.uniforms.tpScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpP;\nvarying vec3 vTpN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTpP = transformed;\nvTpN = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpP;\nvarying vec3 vTpN;\nuniform sampler2D tpTex;\nuniform float tpScale;')
      .replace('#include <map_fragment>', `
        vec3 tn = pow(abs(normalize(vTpN)), vec3(5.)); tn = tn / (tn.x + tn.y + tn.z);
        vec3 tp = vTpP * tpScale;
        vec4 tcol = texture2D(tpTex, tp.zy) * tn.x + texture2D(tpTex, tp.xz) * tn.y + texture2D(tpTex, tp.xy) * tn.z;
        diffuseColor.rgb *= tcol.rgb;`)
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (0.33 - dot(tcol.rgb, vec3(.2126,.7152,.0722))) * .18, .045, 1.);
      `)
      .replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        // Surface gradient from the same samples gives joints and grain shallow relief.
        float height = tcol.r * 0.026;
        vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
        vec3 tx = cross(dy, normal), ty = cross(normal, dx);
        float det = dot(dx, tx);
        normal = normalize(normal - sign(det) * (dFdx(height)*tx + dFdy(height)*ty) / max(abs(det), 0.000001));
      `);
  };
  material.customProgramCacheKey = () => 'triplanar-' + scale;
  return material;
}
