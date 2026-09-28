// Procedural sky (three/addons Sky — Preetham-style atmosphere) used two ways: the visible dome, and the image-based light (PMREM) every material reflects.
// mode: 'live'   → re-bake the PMREM while the day/dusk mix moves (desktop)
//       'cached' → bake day and dusk once at load, swap at k = 0.5 with an intensity dip (phones)
//       'none'   → dome only, no environment map (the check runner)
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function createSky(renderer, scene, mode) {
  const mesh = new Sky();
  mesh.scale.setScalar(4000);   // the orbit never leaves ±900 m of the origin; the shader pins the box to the far plane regardless
  mesh.renderOrder = -10; mesh.frustumCulled = false; mesh.userData.noAO = true;
  const u = mesh.material.uniforms;
  const envScene = new THREE.Scene();
  const pmrem = mode === 'none' ? null : new THREE.PMREMGenerator(renderer);
  const cache = [];               // cached: [day, dusk] render targets
  let live = null, liveK = null;  // live: current render target and the k it was baked at

  function setParams(p, sunDir) {
    u.turbidity.value = p.turbidity; u.rayleigh.value = p.rayleigh; u.mieCoefficient.value = p.mie; u.mieDirectionalG.value = p.g;
    u.sunPosition.value.copy(sunDir);
  }
  function bake() {
    // PMREMGenerator renders envScene from the origin with tone mapping off → linear HDR sky. The mesh is re-parented for the bake and put back.
    const parent = mesh.parent, vis = mesh.visible; mesh.visible = true; envScene.add(mesh);
    const rt = pmrem.fromScene(envScene);
    if (parent) parent.add(mesh); mesh.visible = vis;
    return rt;
  }
  function environment(k, lerpParams, force = false) {
    if (mode === 'none') return null;
    if (mode === 'cached') {
      if (!cache.length) { lerpParams(0); cache[0] = bake(); lerpParams(1); cache[1] = bake(); lerpParams(k); }
      return (k < 0.5 ? cache[0] : cache[1]).texture;
    }
    const endpoint = (k === 0 || k === 1) && liveK !== k;
    if (force || liveK === null || endpoint || Math.abs(k - liveK) > 0.12) { const rt = bake(); if (live) live.dispose(); live = rt; liveK = k; }
    return live.texture;
  }
  function intensityScale(k) { return mode === 'cached' ? 1 - 0.5 * Math.sin(Math.PI * k) : 1; }
  return { mesh, setParams, environment, intensityScale, mode };
}
