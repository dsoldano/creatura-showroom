// Procedural greenery: lobed low-poly canopies (variants + detail per tier), hedges on the plan's thin green strips, a lawn mask for the ground shader, a tileable scrolling water normal map.
// Everything is read from the plan's own colours (viewer/greenery-mask.js); nothing is placed that the plan does not draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { masksFrom, thinOf, strandYaw, waterNormalData } from './greenery-mask.js';

export const WATER_TILE_M = 38.4;   // 256 texels × 0.15 m: one repeat of the ripple tile

// Canopy = `lobes` radially jittered icosahedra merged into one geometry. Variants differ by lobe layout and jitter seed.
export function canopyGeometry({ variant = 0, detail = 0, lobes = 3 } = {}) {
  let s = 11 + variant * 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const parts = [];
  for (let i = 0; i < lobes; i++) {
    const g = new THREE.IcosahedronGeometry(i === 0 ? 1.9 : 1.15 + rnd() * 0.5, detail), pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const j = 0.88 + rnd() * 0.24; pos.setXYZ(k, pos.getX(k) * j, pos.getY(k) * j, pos.getZ(k) * j); }   // ±12 % radial jitter breaks the sphere
    if (i > 0) { const a = rnd() * Math.PI * 2, r = 0.9 + rnd() * 0.5; g.translate(Math.cos(a) * r, 0.3 + rnd() * 0.9, Math.sin(a) * r); }
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false); merged.computeVertexNormals(); return merged;
}

export function canopyMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLy;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLy = position.y;');   // canopy-local height, before the instance matrix
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLy;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.68, 1.06, smoothstep(-1.6, 2.4, vLy));`)          // shaded underside, lit crown
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rim = pow(1.0 - saturate(dot(normalize(vViewPosition), normalize(normal))), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * rim * 0.18;`);                  // rim lift separates crowns from each other
  };
  return m;
}

// Sample the plan: dark greens → trees (off the thin strips), thin dark strips → hedges, light greens → lawn mask.
export function plantGreenery(site, img, ctx) {
  const { toX, toZ, mpp, pointInPoly, isBlocked, tier } = ctx;
  const W = 640, H = Math.round(W * img.height / img.width);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  const { tree, lawn } = masksFrom(g.getImageData(0, 0, W, H).data, W, H);
  const thin = thinOf(tree, W, H, 1, 2);
  const c = site.plan.crop;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // minimum-spacing gate on a metre grid: true (and remembered) when no earlier point lies within cellM
  const spaced = (taken, x, z, cellM) => { const gx = Math.floor(x / cellM), gz = Math.floor(z / cellM);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const k = taken.get((gx + dx) + ',' + (gz + dz)); if (k && Math.hypot(k[0] - x, k[1] - z) < cellM) return false; }
    taken.set(gx + ',' + gz, [x, z]); return true; };
  const point = (x, z, ix, iy) => ({ x, z, ix, iy, r: rnd(), r2: rnd(), r3: rnd(), r4: rnd() });
  // trees: jittered 2.4 m grid, 3 m minimum spacing, only on dark green that is not a thin strip
  const trees = [];
  { const stepPx = 2.4 / mpp, taken = new Map();
    for (let py = c.y; py < c.y + c.h; py += stepPx) for (let px = c.x; px < c.x + c.w; px += stepPx) {
      const jx = px + (rnd() - 0.5) * stepPx, jy = py + (rnd() - 0.5) * stepPx;
      const ix = Math.floor((jx - c.x) / c.w * W), iy = Math.floor((jy - c.y) / c.h * H); if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      if (!(tree[iy * W + ix] && !thin[iy * W + ix])) continue;
      if (!pointInPoly([jx, jy], site.boundary) || isBlocked(jx, jy)) continue;
      const x = toX(jx), z = toZ(jy); if (spaced(taken, x, z, 3.0)) trees.push(point(x, z, ix, iy));
    } }
  // hedges: walk every thin cell in row order and keep those ≥ spacing from an earlier one → continuous runs along each strip at exactly the tier's spacing
  const hedges = [];
  { const taken = new Map();
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      if (!thin[iy * W + ix]) continue;
      const jx = c.x + (ix + 0.5) * c.w / W, jy = c.y + (iy + 0.5) * c.h / H;
      if (!pointInPoly([jx, jy], site.boundary) || isBlocked(jx, jy)) continue;
      const x = toX(jx), z = toZ(jy); if (spaced(taken, x, z, tier.hedgeSpacingM)) hedges.push(point(x, z, ix, iy));
    } }
  // trees: one InstancedMesh per canopy variant (chosen by hash), one trunk mesh
  const V = tier.canopy.variants, byV = Array.from({ length: V }, () => []);
  trees.forEach(p => byV[Math.floor(p.r * V) % V].push(p));
  const m = new THREE.Matrix4(), col = new THREE.Color(), pal = [0x5f8f4a, 0x6f9b52, 0x4e7f3e, 0x7ea65c, 0x5a8a45];
  const treeMeshes = byV.map((pts, v) => {
    const im = new THREE.InstancedMesh(canopyGeometry({ variant: v, detail: tier.canopy.detail }), ctx.mats.canopy, Math.max(1, pts.length)); im.count = pts.length;
    pts.forEach((p, i) => { const s = 0.75 + p.r2 * 0.7, h = 1.1 + p.r3 * 1.1;
      m.compose(new THREE.Vector3(p.x, h + 1.5 * s, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.r4 * Math.PI * 2, 0)), new THREE.Vector3(s, s * 0.9, s)); im.setMatrixAt(i, m);
      im.setColorAt(i, col.setHex(pal[Math.floor(p.r * pal.length)]).offsetHSL(0, 0, (p.r - 0.5) * 0.08)); });
    im.castShadow = true; im.receiveShadow = true; im.name = 'canopies:' + v; return im;
  });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.17, 1, 6), ctx.mats.trunk, Math.max(1, trees.length)); trunks.count = trees.length;
  trees.forEach((p, i) => { const h = 1.1 + p.r3 * 1.1; m.compose(new THREE.Vector3(p.x, h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)); trunks.setMatrixAt(i, m); });
  trunks.castShadow = false; trunks.name = 'trunks';
  // hedges: one box per site, long axis along the strip (image angle a → world yaw −a: plan y is world +z), clipped proportions with a little variation, no shadow
  const hedgeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.mats.hedge, Math.max(1, hedges.length)); hedgeMesh.count = hedges.length;
  const hpal = [0x3f6b32, 0x476f38, 0x3a6430];
  const hedgeL = Math.max(1.4, tier.hedgeSpacingM * 1.2);   // longer than the spacing so consecutive boxes overlap into one run
  hedges.forEach((p, i) => { const a = strandYaw(thin, W, H, p.ix, p.iy), h = 0.9 * (0.85 + p.r2 * 0.3), L = hedgeL * (0.95 + p.r3 * 0.15);
    m.compose(new THREE.Vector3(p.x, h / 2, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), new THREE.Vector3(L, h, 1.1)); hedgeMesh.setMatrixAt(i, m);
    hedgeMesh.setColorAt(i, col.setHex(hpal[Math.floor(p.r * hpal.length)]).offsetHSL(0, 0, (p.r4 - 0.5) * 0.06)); });
  hedgeMesh.castShadow = false; hedgeMesh.receiveShadow = true; hedgeMesh.name = 'hedges';
  // lawn mask → texture in plan.crop uv space (the same mapping the ground map uses)
  let lawnTexture = null;
  if (tier.lawn) {
    const lc = document.createElement('canvas'); lc.width = W; lc.height = H; const lg = lc.getContext('2d'), id = lg.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { const v = lawn[i] && !tree[i] ? 255 : 0; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    lg.putImageData(id, 0, 0); lawnTexture = new THREE.CanvasTexture(lc); lawnTexture.minFilter = THREE.LinearFilter; lawnTexture.generateMipmaps = false;
  }
  return { trees: trees.length, hedges: hedges.length, variants: V, treeMeshes, trunks, hedgeMesh, lawnTexture };
}

// Ground shader: 0.5 m hash noise ±5 %, a slight green lift, matte lawn vs slightly sheened paving. No normal map — the plan stays a picture.
export function lawnify(material, lawnTexture) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uLawn = { value: lawnTexture };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform sampler2D uLawn; float gLawn = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        gLawn = texture2D(uLawn, vMapUv).r;
        float n = fract(sin(dot(floor(vWp.xz * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb *= 1.0 + gLawn * (n - 0.5) * 0.10;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.95, 1.04, 0.90), gLawn * 0.7);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.82, 1.0, gLawn);');
  };
  return material;
}

export function waterMaterial(tier) {
  if (!tier.waterFps) return { material: new THREE.MeshPhysicalMaterial({ color: 0x3f9ec4, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.94 }), texture: null };   // flat water (low)
  const texture = new THREE.DataTexture(waterNormalData(256), 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  const material = new THREE.MeshPhysicalMaterial({ color: 0x2f86a8, roughness: 0.04, metalness: 0, ior: 1.33, clearcoat: 0.5, clearcoatRoughness: 0.08, transparent: true, opacity: 0.92, normalMap: texture, normalScale: new THREE.Vector2(0.6, 0.6) });   // tuned round 1: 0x3f9ec4 / 0.35 read as a flat cyan disc from drone height
  return { material, texture };
}
// A water disc whose uvs are world metres / WATER_TILE_M: the ripple tile is continuous across every pool and scrolls with texture.offset.
export function waterDisc(r, x, y, z, material) {
  const g = new THREE.CircleGeometry(r, 64), pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + x) / WATER_TILE_M, (-pos.getY(i) + z) / WATER_TILE_M);   // rotated −90° about x below: local y → world −z
  const mesh = new THREE.Mesh(g, material); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.userData.water = true; return mesh;
}
