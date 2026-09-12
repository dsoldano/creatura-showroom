import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { TIERS, resolveQuality } from './quality.js';
import { createSky } from './sky.js';

// ============ project ============
const $ = s => document.querySelector(s);
const q = new URLSearchParams(location.search);
const COARSE = matchMedia('(pointer: coarse)').matches;
const QUALITY = resolveQuality(q.get('q'), COARSE), TIER = TIERS[QUALITY];   // high (desktop) / mid (phones) / low (check.mjs) — viewer/quality.js
// bisect flags (default = the fixed behaviour): ?fx=alpha (transparent canvas), ?fx=nolog (no log depth), ?fx=stop (stop rendering when idle), ?fx=blur (keep backdrop blur)
const FX = new Set((q.get('fx') || '').split(',').filter(Boolean));
if (FX.has('blur')) document.documentElement.classList.add('fx-blur');
const BASE = (q.get('project') || './').replace(/\/?$/, '/');
const site = await (await fetch(BASE + 'site.json')).json();
const mpp = site.scale.metresPerPx;
const FLOOR_H = site.scale.floorHeightM || 3.1;

// plan px -> world metres. Plan y (down) -> world +z. Centre = boundary centroid.
const cen = site.boundary.reduce((a, p) => [a[0] + p[0] / site.boundary.length, a[1] + p[1] / site.boundary.length], [0, 0]);
const toX = px => (px - cen[0]) * mpp;
const toZ = py => (py - cen[1]) * mpp;
const bounds = site.boundary.reduce((b, p) => ({ minX: Math.min(b.minX, toX(p[0])), maxX: Math.max(b.maxX, toX(p[0])), minZ: Math.min(b.minZ, toZ(p[1])), maxZ: Math.max(b.maxZ, toZ(p[1])) }), { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 });
const siteW = bounds.maxX - bounds.minX, siteD = bounds.maxZ - bounds.minZ;
const features = site.features || [];

// ============ renderer / scene / camera ============
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: TIER.alpha || FX.has('alpha'), powerPreference: 'high-performance', logarithmicDepthBuffer: TIER.logDepth && !FX.has('nolog') });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TIER.dpr));
renderer.info.autoReset = false;   // reset once per rendered frame in the loop so __walk.stats() reports whole frames
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
let lastSize = '';

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xece7de, 900, 2000);

const camera = new THREE.PerspectiveCamera(42, 1, 2, 3600);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = COARSE ? 0.1 : 0.06;
controls.minDistance = 60; controls.maxDistance = 900;
controls.minPolarAngle = THREE.MathUtils.degToRad(10);
controls.maxPolarAngle = THREE.MathUtils.degToRad(70);
controls.screenSpacePanning = false;
controls.zoomSpeed = COARSE ? 0.7 : 0.9; controls.rotateSpeed = COARSE ? 0.5 : 0.7; controls.zoomToCursor = !COARSE;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.enabled = false;

const DEFAULT_VIEW = { radius: 0, phi: THREE.MathUtils.degToRad(52), theta: THREE.MathUtils.degToRad(28), target: new THREE.Vector3(0, 22, -siteD * 0.04) };
const isPhone = () => matchMedia('(max-width: 760px)').matches;
const PANEL_W = 374, SHEET_H = 204;
function visibleAspect() { const w = canvas.clientWidth, h = canvas.clientHeight; return isPhone() ? w / Math.max(1, h - SHEET_H) : (w - PANEL_W) / Math.max(1, h); }
function fitRadius() { const a = visibleAspect(); return Math.max(siteW, siteD) * 1.75 * Math.max(1, 0.7 / a); }
function fitView() { const a = visibleAspect(); const portrait = a < 0.8;
  return { ...DEFAULT_VIEW, radius: fitRadius(), theta: THREE.MathUtils.degToRad(portrait ? 12 : 28), phi: THREE.MathUtils.degToRad(portrait ? 47 : 52) }; }

// ============ sky: procedural dome + image-based light ============
const skyCtl = createSky(renderer, scene, TIER.pmrem);
const sky = skyCtl.mesh; sky.visible = !FX.has('alpha'); scene.add(sky);   // ?fx=alpha: transparent canvas over the CSS #sky gradient, the pre-fix behaviour

// ============ lighting (day / dusk) ============
const hemi = new THREE.HemisphereLight(0xdfe9ff, 0xc2b49a, 1.05); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(TIER.shadowMap, TIER.shadowMap);
{ const sc = sun.shadow.camera, R = Math.max(siteW, siteD) * 0.9; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 50; sc.far = 1400; }
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);

const PRESETS = {   // starting values; tuned against source/render-exterior-aerial.webp. sunDir is a unit vector (dusk ≈ 13° elevation so the sky turns orange)
  day:  { hemiSky: new THREE.Color(0xdfe9ff), hemiGround: new THREE.Color(0xc2b49a), hemiI: 1.05, sunColor: new THREE.Color(0xfff1dc), sunI: 2.4, sunDir: new THREE.Vector3(300, 520, 260).normalize(), shadowI: 0.85,
          sky: { turbidity: 6, rayleigh: 1.6, mie: 0.008, g: 0.85 }, fog: new THREE.Color(0xece7de), base: new THREE.Color(0xe9e3d8), exposure: 0.7, env: 0.8 },
  dusk: { hemiSky: new THREE.Color(0x6e7fb0), hemiGround: new THREE.Color(0x5b4b3e), hemiI: 0.8, sunColor: new THREE.Color(0xffa565), sunI: 1.9, sunDir: new THREE.Vector3(-0.8315, 0.2250, 0.5082).normalize(), shadowI: 0.6,
          sky: { turbidity: 9, rayleigh: 2.4, mie: 0.012, g: 0.9 }, fog: new THREE.Color(0x8b8796), base: new THREE.Color(0x9599a6), exposure: 0.6, env: 0.7 },
};
let lightK = q.get('light') === 'dusk' ? 1 : 0, lightTarget = lightK;
const bandedShaders = [];
const sunDirAt = (k, out = new THREE.Vector3()) => out.lerpVectors(PRESETS.day.sunDir, PRESETS.dusk.sunDir, k).normalize();
function skyParamsAt(k) { const a = PRESETS.day.sky, b = PRESETS.dusk.sky, L = THREE.MathUtils.lerp; return { turbidity: L(a.turbidity, b.turbidity, k), rayleigh: L(a.rayleigh, b.rayleigh, k), mie: L(a.mie, b.mie, k), g: L(a.g, b.g, k) }; }
const lerpSky = k => skyCtl.setParams(skyParamsAt(k), sunDirAt(k));
function applyLighting(k, force = false) {   // the single day/dusk choke point: lights, sun, shadow, fog, exposure, sky uniforms, environment map, tower glow
  const a = PRESETS.day, b = PRESETS.dusk, L = THREE.MathUtils.lerp;
  hemi.color.lerpColors(a.hemiSky, b.hemiSky, k); hemi.groundColor.lerpColors(a.hemiGround, b.hemiGround, k); hemi.intensity = L(a.hemiI, b.hemiI, k) * TIER.hemiScale;
  sun.color.lerpColors(a.sunColor, b.sunColor, k); sun.intensity = L(a.sunI, b.sunI, k); sun.position.copy(sunDirAt(k)).multiplyScalar(700); sun.shadow.intensity = L(a.shadowI, b.shadowI, k);
  scene.fog.color.lerpColors(a.fog, b.fog, k); matBase.color.lerpColors(a.base, b.base, k);
  renderer.toneMappingExposure = L(a.exposure, b.exposure, k);
  lerpSky(k);
  scene.environment = skyCtl.environment(k, lerpSky, force); scene.environmentIntensity = L(a.env, b.env, k) * skyCtl.intensityScale(k);
  for (const sh of bandedShaders) sh.uniforms.uDusk.value = k;
  document.getElementById('sky').style.opacity = FX.has('alpha') ? k.toFixed(3) : '0';
}

// ============ materials ============
const matBase = new THREE.MeshStandardMaterial({ color: 0xe9e3d8, roughness: 1, metalness: 0 });
const matPlinth = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.95 });
const matTower = bandedMaterial(0xf4eee2, FLOOR_H, true);
const matClub = bandedMaterial(0xdcc7a1, 4, false);
const matServices = new THREE.MeshStandardMaterial({ color: 0xcfc9c0, roughness: 0.9 });
const matGhost = new THREE.MeshPhysicalMaterial({ color: 0x9fb2cc, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.26, depthWrite: false });
const matEdge = new THREE.LineBasicMaterial({ color: 0xa89f90, transparent: true, opacity: 0.7 });
const matGhostEdge = new THREE.LineBasicMaterial({ color: 0x6f86a6, transparent: true, opacity: 0.85 });
const matStone = new THREE.MeshStandardMaterial({ color: 0xe4dac8, roughness: 0.9 });
const matSand = new THREE.MeshStandardMaterial({ color: 0xd8c39d, roughness: 0.95 });
const matWater = new THREE.MeshPhysicalMaterial({ color: 0x3f9ec4, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.94 });
const matRink = new THREE.MeshPhysicalMaterial({ color: 0xb9d3e6, roughness: 0.12, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1 });
const matWhite = new THREE.MeshStandardMaterial({ color: 0xf7f3ec, roughness: 0.6 });
const matTrunk = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 1 });
const matCanopy = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });

function bandedMaterial(color, floorH, windows) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uFloorH = { value: floorH }; sh.uniforms.uDusk = { value: lightK }; sh.uniforms.uWin = { value: windows ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn; uniform float uFloorH; uniform float uDusk; uniform float uWin;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float side = 1.0 - abs(vWn.y);
        float fl = fract(vWp.y / uFloorH);
        float slab = smoothstep(0.86, 0.90, fl);
        diffuseColor.rgb *= 1.0 - slab * 0.16 * side;
        diffuseColor.rgb *= 1.0 - side * 0.04;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fi = floor(vWp.y / uFloorH); float bay = floor((vWp.x + vWp.z * 1.7) / 4.0);
        float h = fract(sin(dot(vec2(fi, bay), vec2(12.9898, 78.233))) * 43758.5453);
        float win = step(0.30, fl) * (1.0 - step(0.74, fl)) * step(0.42, h) * step(0.35, fract((vWp.x + vWp.z * 1.7) / 4.0)) * (1.0 - step(0.85, fract((vWp.x + vWp.z * 1.7) / 4.0)));
        totalEmissiveRadiance += vec3(1.0, 0.70, 0.38) * 0.9 * uDusk * side * win * uWin;`);
    bandedShaders.push(sh);
  };
  return m;
}

// ============ geometry helpers ============
// Shape space is (x, -z): ExtrudeGeometry/ShapeGeometry rotated -90° about X gives y-up with world z = plan south.
function shapeFromPlan(poly, holes = []) {
  const s = new THREE.Shape();
  poly.forEach((p, i) => i ? s.lineTo(toX(p[0]), -toZ(p[1])) : s.moveTo(toX(p[0]), -toZ(p[1])));
  s.closePath();
  for (const h of holes) s.holes.push(h);
  return s;
}
function circlePath(cx, cy, r) { const p = new THREE.Path(); p.absarc(toX(cx), -toZ(cy), r * mpp, 0, Math.PI * 2, false); return p; }
function extrudeShape(shape, height, mat, edgeMat, y0 = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (edgeMat) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat));
  return mesh;
}
const extrude = (poly, h, mat, edgeMat, y0) => extrudeShape(shapeFromPlan(poly), h, mat, edgeMat, y0);
function pointInPoly(p, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function rectM(f) { const [x0, y0, x1, y1] = f.rect; return { cx: toX((x0 + x1) / 2), cz: toZ((y0 + y1) / 2), w: (x1 - x0) * mpp, d: (y1 - y0) * mpp }; }
function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(rTop, rBot, h, mat, x, y, z, seg = 48, open = false) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }

// ============ world ============
const world = new THREE.Group(); scene.add(world);
const wellHoles = features.filter(f => f.kind === 'steppedWell').map(f => circlePath(f.circle.cx, f.circle.cy, f.circle.r));

// model table + plinth (with the stepped-well pits cut out)
const base = new THREE.Mesh(new THREE.CircleGeometry(1700, 96), matBase);
base.rotation.x = -Math.PI / 2; base.position.y = -1.8; base.receiveShadow = true; world.add(base);
const PLINTH_TOP = -0.3, PLINTH_H = 1.3;   // cap below the ground plane at 0: never coplanar (mobile-flicker fix); asserted by check.mjs via __walk.plinthTopY
world.add(extrudeShape(shapeFromPlan(site.boundary, wellHoles), PLINTH_H, matPlinth, null, PLINTH_TOP - PLINTH_H));

// ground: the plan image clipped to the boundary
const texLoader = new THREE.TextureLoader();
const groundTex = await texLoader.loadAsync(BASE + (site.plan.ground || 'plan.jpg'));
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
{
  const g = new THREE.ShapeGeometry(shapeFromPlan(site.boundary, wellHoles), 24);
  const c = site.plan.crop, pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { const px = pos.getX(i) / mpp + cen[0], py = -pos.getY(i) / mpp + cen[1]; uv[i * 2] = (px - c.x) / c.w; uv[i * 2 + 1] = 1 - (py - c.y) / c.h; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0);
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true; world.add(ground);
}

// volumes
const volumeMeshes = {};
for (const v of site.volumes) {
  const h = v.heightM || (v.floors || 1) * FLOOR_H; let mesh;
  if (v.kind === 'tower') mesh = extrude(v.polygon, h, matTower, matEdge);
  else if (v.kind === 'future') { mesh = extrude(v.polygon, h, matGhost, matGhostEdge); mesh.castShadow = false; }
  else if (v.kind === 'clubhouse') mesh = extrude(v.polygon, h, matClub, matEdge);
  else mesh = extrude(v.polygon, h, matServices, matEdge);
  mesh.userData.volume = v; volumeMeshes[v.id] = mesh; world.add(mesh);
}

// ---- features: the "earned" 3D detail ----
function courtLines(sport, wM, dM) {
  const S = 20, W = Math.round(wM * S), H = Math.round(dM * S);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 2.5; g.lineCap = 'square';
  const R = (x, y, w, h) => g.strokeRect(x * S, y * S, w * S, h * S);
  const L = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0 * S, y0 * S); g.lineTo(x1 * S, y1 * S); g.stroke(); };
  const A = (x, y, r, a0, a1) => { g.beginPath(); g.arc(x * S, y * S, r * S, a0, a1); g.stroke(); };
  const cx = wM / 2, cy = dM / 2;
  if (sport === 'tennis') { const l = 23.77, w = 10.97, x0 = cx - l / 2, y0 = cy - w / 2;
    R(x0, y0, l, w); L(x0, y0 + 1.37, x0 + l, y0 + 1.37); L(x0, y0 + w - 1.37, x0 + l, y0 + w - 1.37);
    L(cx - 6.4, y0 + 1.37, cx - 6.4, y0 + w - 1.37); L(cx + 6.4, y0 + 1.37, cx + 6.4, y0 + w - 1.37); L(cx - 6.4, cy, cx + 6.4, cy);
    g.lineWidth = 4; g.strokeStyle = 'rgba(40,40,40,.8)'; L(cx, y0 - 0.9, cx, y0 + w + 0.9); }
  else if (sport === 'basketball') { const l = 28, w = 15, x0 = cx - l / 2, y0 = cy - w / 2;
    R(x0, y0, l, w); L(cx, y0, cx, y0 + w); A(cx, cy, 1.8, 0, Math.PI * 2);
    for (const s of [1, -1]) { const bx = s > 0 ? x0 : x0 + l; R(Math.min(bx, bx + s * 5.8), cy - 2.45, 5.8, 4.9); A(bx + s * 5.8, cy, 1.8, 0, Math.PI * 2); A(bx + s * 1.575, cy, 6.75, s > 0 ? -1.2 : Math.PI - 1.2, s > 0 ? 1.2 : Math.PI + 1.2); } }
  else if (sport === 'pickleball') { const l = 13.41, w = 6.1, n = Math.max(1, Math.floor((wM - 1) / (w + 1.2))), gap = (wM - n * w) / (n + 1);
    for (let i = 0; i < n; i++) { const x0 = gap + i * (w + gap), y0 = cy - l / 2;
      R(x0, y0, w, l); L(x0, cy - 2.13, x0 + w, cy - 2.13); L(x0, cy + 2.13, x0 + w, cy + 2.13); L(x0 + w / 2, y0, x0 + w / 2, cy - 2.13); L(x0 + w / 2, cy + 2.13, x0 + w / 2, y0 + l);
      g.lineWidth = 4; g.strokeStyle = 'rgba(40,40,40,.8)'; L(x0 - 0.4, cy, x0 + w + 0.4, cy); g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.92)'; } }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const COURT_COLOR = { tennis: 0x4a86c9, basketball: 0x3e78c4, pickleball: 0x5a8fcf };
for (const f of features) {
  if (f.kind === 'court') {
    const r = rectM(f); const slab = box(r.w, 0.25, r.d, new THREE.MeshStandardMaterial({ color: COURT_COLOR[f.sport] || 0x4a86c9, roughness: 0.85 }), r.cx, 0.125, r.cz); world.add(slab);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: courtLines(f.sport, r.w, r.d), transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1 }));
    top.rotation.x = -Math.PI / 2; top.position.set(r.cx, 0.256, r.cz); top.receiveShadow = true; world.add(top);
  }
  else if (f.kind === 'rink') { const e = f.ellipse; const m = cyl(1, 1, 0.1, matRink, toX(e.cx), 0.05, toZ(e.cy), 64); m.scale.set(e.rx * mpp, 1, e.ry * mpp); world.add(m);
    const rim = cyl(1, 1, 0.16, matStone, toX(e.cx), 0.08, toZ(e.cy), 64, true); rim.scale.set(e.rx * mpp + 0.4, 1, e.ry * mpp + 0.4); world.add(rim); }
  else if (f.kind === 'steppedWell') {
    const c = f.circle, x = toX(c.cx), z = toZ(c.cy), R0 = c.r * mpp, Rw = (f.waterR || c.r * 0.3) * mpp, N = 4, step = 0.35;
    for (let i = 0; i < N; i++) {
      const ro = R0 - (R0 - Rw) * i / N, ri = R0 - (R0 - Rw) * (i + 1) / N, yTop = -step * i, yBot = -step * (i + 1);
      const riser = cyl(ro, ro, step, matSand, x, (yTop + yBot) / 2, z, 64, true); riser.material = matSand; riser.material.side = THREE.DoubleSide; world.add(riser);
      const tread = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 64), matSand); tread.rotation.x = -Math.PI / 2; tread.position.set(x, yBot + 0.005, z); tread.receiveShadow = true; world.add(tread);
    }
    const water = new THREE.Mesh(new THREE.CircleGeometry(Rw, 64), matWater); water.rotation.x = -Math.PI / 2; water.position.set(x, -step * N + 0.06, z); world.add(water);
    const lip = cyl(R0 + 0.5, R0 + 0.5, 0.12, matStone, x, 0.06, z, 64, true); world.add(lip);
  }
  else if (f.kind === 'splash') { const c = f.circle; world.add(cyl(c.r * mpp, c.r * mpp, 0.08, matWater, toX(c.cx), 0.04, toZ(c.cy), 48));
    const rim = cyl(c.r * mpp + 0.35, c.r * mpp + 0.35, 0.14, matStone, toX(c.cx), 0.07, toZ(c.cy), 48, true); world.add(rim); }
  else if (f.kind === 'plazaDisc') { const c = f.circle, r = c.r * mpp; world.add(cyl(r, r, 0.22, matStone, toX(c.cx), 0.11, toZ(c.cy), 48)); world.add(cyl(r * 0.55, r * 0.55, 0.42, matStone, toX(c.cx), 0.21, toZ(c.cy), 48)); }
  else if (f.kind === 'portal') { const r = rectM(f), H = 6.5, pw = 3;
    world.add(box(pw, H, r.d, matClub, r.cx - r.w / 2 + pw / 2, H / 2, r.cz)); world.add(box(pw, H, r.d, matClub, r.cx + r.w / 2 - pw / 2, H / 2, r.cz));
    world.add(box(r.w, 0.6, r.d, matClub, r.cx, H + 0.3, r.cz)); }
  else if (f.kind === 'dome') { const c = f.circle, r = c.r * mpp; world.add(cyl(r, r, 0.4, matStone, toX(c.cx), 0.2, toZ(c.cy), 40));
    const d = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), matWhite); d.position.set(toX(c.cx), 0.4, toZ(c.cy)); d.castShadow = true; world.add(d); }
}

// ---- trees: sampled from the plan's dark greens, thinned, kept off footprints ----
function plantTrees() {
  const img = groundTex.image, W = 640, H = Math.round(W * img.height / img.width);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  const data = g.getImageData(0, 0, W, H).data, c = site.plan.crop;
  const stepPx = 2.4 / mpp, cell = 3.0, taken = new Map(), pts = [];
  const blocked = [...site.volumes.map(v => ({ polygon: v.polygon })), ...features];
  const isBlocked = (px, py) => blocked.some(f => f.polygon ? pointInPoly([px, py], f.polygon) : f.rect ? (px >= f.rect[0] - 2 && px <= f.rect[2] + 2 && py >= f.rect[1] - 2 && py <= f.rect[3] + 2)
    : f.circle ? Math.hypot(px - f.circle.cx, py - f.circle.cy) <= f.circle.r + 2 : f.ellipse ? ((px - f.ellipse.cx) ** 2) / (f.ellipse.rx + 2) ** 2 + ((py - f.ellipse.cy) ** 2) / (f.ellipse.ry + 2) ** 2 <= 1 : false);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let py = c.y; py < c.y + c.h; py += stepPx) for (let px = c.x; px < c.x + c.w; px += stepPx) {
    const jx = px + (rnd() - 0.5) * stepPx, jy = py + (rnd() - 0.5) * stepPx;
    const ix = Math.floor((jx - c.x) / c.w * W), iy = Math.floor((jy - c.y) / c.h * H); if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
    const i = (iy * W + ix) * 4, r = data[i], gg = data[i + 1], b = data[i + 2];
    if (!(gg > r + 18 && gg > b + 28 && gg < 168 && r < 150)) continue;      // dark saturated green = canopy/hedge, not lawn
    if (!pointInPoly([jx, jy], site.boundary) || isBlocked(jx, jy)) continue;
    const x = toX(jx), z = toZ(jy), gx = Math.floor(x / cell), gz = Math.floor(z / cell); let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++) for (let dz = -1; dz <= 1; dz++) { const k = taken.get((gx + dx) + ',' + (gz + dz)); if (k && Math.hypot(k[0] - x, k[1] - z) < cell) { near = true; break; } }
    if (near) continue;
    taken.set(gx + ',' + gz, [x, z]); pts.push({ x, z, s: 0.75 + rnd() * 0.7, h: 1.1 + rnd() * 1.1, c: rnd(), rot: rnd() * Math.PI * 2 });
  }
  const canopyG = new THREE.IcosahedronGeometry(1.9, 1), trunkG = new THREE.CylinderGeometry(0.11, 0.17, 1, 6);
  const canopies = new THREE.InstancedMesh(canopyG, matCanopy, pts.length), trunks = new THREE.InstancedMesh(trunkG, matTrunk, pts.length);
  const m = new THREE.Matrix4(), col = new THREE.Color(), pal = [0x5f8f4a, 0x6f9b52, 0x4e7f3e, 0x7ea65c, 0x5a8a45];
  pts.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, p.h + 1.5 * p.s, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), new THREE.Vector3(p.s, p.s * 0.9, p.s)); canopies.setMatrixAt(i, m);
    canopies.setColorAt(i, col.setHex(pal[Math.floor(p.c * pal.length)]).offsetHSL(0, 0, (p.c - 0.5) * 0.08));
    m.compose(new THREE.Vector3(p.x, p.h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.h, 1)); trunks.setMatrixAt(i, m);
  });
  canopies.castShadow = true; canopies.receiveShadow = true; trunks.castShadow = false;
  world.add(canopies); world.add(trunks);
  return pts.length;
}
const treeCount = plantTrees();

// ============ camera helpers ============
const sph = new THREE.Spherical();
function applyView(v) { controls.target.copy(v.target); camera.position.setFromSpherical(sph.set(v.radius, v.phi, v.theta)).add(v.target); camera.lookAt(v.target); }
function currentView() { const off = camera.position.clone().sub(controls.target); sph.setFromVector3(off); return { radius: sph.radius, phi: sph.phi, theta: sph.theta, target: controls.target.clone() }; }
let tween = null;
function flyTo(view, ms = 1400, onDone) {
  const from = currentView(), to = { ...view, target: view.target.clone() };
  let dth = to.theta - from.theta; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI; to.theta = from.theta + dth;
  controls.enabled = false; tween = { from, to, t0: performance.now(), ms, onDone };
}
function stepTween(now) {
  if (!tween) return;
  const k = Math.min(1, (now - tween.t0) / tween.ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, f = tween.from, t = tween.to;
  applyView({ radius: f.radius + (t.radius - f.radius) * e, phi: f.phi + (t.phi - f.phi) * e, theta: f.theta + (t.theta - f.theta) * e, target: f.target.clone().lerp(t.target, e) });
  if (k >= 1) { const cb = tween.onDone; tween = null; controls.enabled = true; controls.update(); cb && cb(); }
}
const PAD = 60;
controls.addEventListener('change', () => {
  const t = controls.target, nx = THREE.MathUtils.clamp(t.x, bounds.minX - PAD, bounds.maxX + PAD), nz = THREE.MathUtils.clamp(t.z, bounds.minZ - PAD, bounds.maxZ + PAD), ny = THREE.MathUtils.clamp(t.y, 0, 60);
  if (nx !== t.x || nz !== t.z || ny !== t.y) { const d = new THREE.Vector3(nx - t.x, ny - t.y, nz - t.z); t.add(d); camera.position.add(d); }
});

// ============ UI ============
document.title = site.name + ' · site walkthrough';
$('#titleText').textContent = site.name; $('#introName').textContent = site.name;
$('#introLoc').textContent = [site.developer, site.location].filter(Boolean).join(' · ');
$('#introDisc').textContent = site.disclaimer || '';
const northRad = THREE.MathUtils.degToRad(site.plan.northDeg ?? 0), northVec = new THREE.Vector3(Math.sin(northRad), 0, -Math.cos(northRad)), needle = $('#compass .needle');
function updateCompass() { const a = Math.atan2(northVec.x, -northVec.z) + controls.getAzimuthalAngle(); needle.style.transform = `rotate(${THREE.MathUtils.radToDeg(a).toFixed(1)}deg)`; }
$('#btnReset').addEventListener('click', () => flyTo(fitView(), 1400));
window.addEventListener('keydown', e => { if (e.key === 'Escape') { if (tour) endTour(true); else { deselect(); flyTo(fitView(), 1400); } } });
const btnLight = $('#btnLight');
function setLight(mode) { lightTarget = mode === 'dusk' ? 1 : 0; btnLight.textContent = lightTarget ? 'Day' : 'Dusk'; btnLight.setAttribute('aria-pressed', String(!!lightTarget)); }
btnLight.addEventListener('click', () => setLight(lightTarget ? 'day' : 'dusk'));
setLight(lightK ? 'dusk' : 'day'); applyLighting(lightK);

resize(); DEFAULT_VIEW.radius = fitRadius();
applyView({ radius: 1500, phi: THREE.MathUtils.degToRad(8), theta: DEFAULT_VIEW.theta - 0.35, target: DEFAULT_VIEW.target });
const explore = $('#btnExplore'); explore.disabled = false; explore.textContent = 'Explore the site';
const afterReveal = () => { if (hashTour) startTour(decodeURIComponent(hashTour)); else if (hashId) select(decodeURIComponent(hashId), true); };
explore.addEventListener('click', () => { $('#intro').classList.add('hide'); flyTo(fitView(), 5000, afterReveal); });
if (q.get('autostart')) { $('#intro').classList.add('hide'); flyTo(fitView(), +q.get('autostart') || 5000, afterReveal); }

// ============ hotspots: pins, panel, themes, fly-to ============
const manifest = await fetch(BASE + (site.postcards?.manifest || 'postcards/manifest.json')).then(r => r.ok ? r.json() : { images: {} }).catch(() => ({ images: {} }));
const hotspots = site.hotspots.map(h => {
  const vol = h.volume && volumeMeshes[h.volume]; const v = vol && vol.userData.volume;
  const y = v ? (v.heightM || v.floors * FLOOR_H) + 8 : 1.4;
  return { ...h, world: new THREE.Vector3(toX(h.pos[0]), y, toZ(h.pos[1])), isTower: !!h.volume, images: manifest.images[h.id] || [] };
});
const themeName = Object.fromEntries((site.themes || []).map(t => [t.id, t.name]));
const KIND_LABEL = { developer: 'Developer render', ai: 'AI visualisation · indicative', plan: 'Plan detail' };
const occluders = Object.values(volumeMeshes).filter(m => m.userData.volume.kind !== 'future');
const pinEls = new Map(); let selected = null, activeTheme = null;

// pins (DOM, positioned by CSS2DRenderer)
for (const h of hotspots) {
  const wrap = document.createElement('div'); wrap.className = 'pinwrap';
  const b = document.createElement('button'); b.className = 'pin' + (h.isTower ? ' tower' : ''); b.textContent = String(h.n); b.dataset.name = h.name; b.dataset.id = h.id; b.type = 'button'; b.setAttribute('aria-label', h.n + ' ' + h.name);
  b.addEventListener('click', e => { e.stopPropagation(); select(h.id, true); });
  wrap.appendChild(b); const obj = new CSS2DObject(wrap); obj.position.copy(h.world); scene.add(obj); pinEls.set(h.id, b);
}
// selection ring on the ground
const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 6.8, 48), new THREE.MeshBasicMaterial({ color: 0xc8772a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45; ring.visible = false; scene.add(ring);

const ray = new THREE.Raycaster(); let pinTick = 0; const tmpV = new THREE.Vector3();
function updatePins(now) {
  const camPos = camera.position;
  if (ring.visible) { const k = 1 + 0.06 * Math.sin(now / 350); ring.scale.set(k, k, 1); }
  const doRay = now - pinTick > 140; if (doRay) pinTick = now;
  for (const h of hotspots) {
    const el = pinEls.get(h.id), d = camPos.distanceTo(h.world);
    el.style.setProperty('--s', THREE.MathUtils.clamp(1.3 - d / 900, COARSE ? 0.85 : 0.6, 1.15).toFixed(3));
    el.classList.toggle('hidden', d > 1000);
    if (doRay) { ray.set(camPos, tmpV.copy(h.world).sub(camPos).normalize()); const hit = ray.intersectObjects(occluders, false)[0]; const occ = !!hit && hit.distance < d - 3 && selected !== h.id;
      h._occ = occ === h._occWant ? Math.min(3, (h._occ || 0) + 1) : 0; h._occWant = occ;      // three agreeing samples before switching
      if (h._occ >= 2) el.classList.toggle('occluded', occ); }
  }
}

// panel: facts, themes, list
$('#facts').innerHTML = (site.facts || []).map(f => `<div class="${f.value.length > 22 ? 'wide' : ''}">${f.label}<b>${f.value}</b></div>`).join('');
$('#themes').innerHTML = `<button aria-pressed="true" data-theme="">All</button>` + (site.themes || []).map(t => `<button aria-pressed="false" data-theme="${t.id}">${t.name}</button>`).join('');
$('#themes').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setTheme(b.dataset.theme || null); });
{ const groups = new Map(); for (const h of hotspots) { const g = groups.get(h.theme) || []; g.push(h); groups.set(h.theme, g); }
  $('#hotlist').innerHTML = [...groups].map(([t, list]) => `<li class="group" data-theme="${t}">${themeName[t] || t}</li>` + list.map(h => `<li class="item${h.isTower ? ' tower' : ''}" data-id="${h.id}" data-theme="${h.theme}"><span class="n">${h.n}</span><span class="nm">${h.name}</span><span class="kind">${h.images[0] ? (h.images[0].kind === 'developer' ? 'render' : h.images[0].kind) : ''}</span></li>`).join('')).join('');
  $('#hotlist').addEventListener('click', e => { const li = e.target.closest('li.item'); if (li) select(li.dataset.id, true); }); }
function setTheme(t) {
  activeTheme = t;
  document.querySelectorAll('#themes button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.theme || null) === t)));
  document.querySelectorAll('#hotlist li').forEach(li => li.classList.toggle('filtered', !!t && li.dataset.theme !== t));  // items and group headings alike
  for (const h of hotspots) pinEls.get(h.id).classList.toggle('dim', !!t && h.theme !== t);
}
const panel = $('#panel');
$('#sheetHandle').addEventListener('click', () => panel.classList.toggle('collapsed'));
function showHome() { $('#panelDetail').hidden = true; $('#panelHome').hidden = false; }
function select(id, fly, quiet) {
  const h = hotspots.find(x => x.id === id); if (!h) return;
  selected = id;
  for (const x of hotspots) pinEls.get(x.id).classList.toggle('active', x.id === id);
  document.querySelectorAll('#hotlist li.item').forEach(li => li.classList.toggle('active', li.dataset.id === id));
  ring.visible = !h.isTower; ring.position.set(h.world.x, 0.45, h.world.z);
  const img = h.images[0];
  $('#dNum').textContent = h.n; $('#dName').textContent = h.name; $('#dCaption').textContent = h.caption || '';
  const im = $('#dImg'); if (img) { im.src = BASE + 'postcards/' + img.file; im.alt = h.name + ' — ' + KIND_LABEL[img.kind]; im.hidden = false; } else { im.removeAttribute('src'); im.hidden = true; }
  $('#dBadge').textContent = img ? KIND_LABEL[img.kind] : ''; $('#dBadge').className = 'badge ' + (img ? img.kind : ''); $('#dCredit').textContent = img ? (img.credit || '') : '';
  $('#panelHome').hidden = true; $('#panelDetail').hidden = false; $('#panelDetail').scrollTop = 0; if (!quiet) panel.classList.remove('collapsed');
  history.replaceState(null, '', '#h=' + encodeURIComponent(id));
  if (fly) flyToHotspot(h);
}
function flyToHotspot(h) {
  const v = h.view || {}; const target = h.world.clone(); target.y = v.targetY ?? 0;
  flyTo({ radius: v.radius ?? 110, phi: THREE.MathUtils.degToRad(v.phiDeg ?? 52), theta: THREE.MathUtils.degToRad(v.thetaDeg ?? 30), target }, 1500);
}
function deselect() {
  selected = null; ring.visible = false; for (const x of hotspots) pinEls.get(x.id).classList.remove('active');
  document.querySelectorAll('#hotlist li.item').forEach(li => li.classList.remove('active')); showHome(); history.replaceState(null, '', location.pathname + location.search);
}
$('#btnBack').addEventListener('click', deselect);
$('#btnFly').addEventListener('click', () => { const h = hotspots.find(x => x.id === selected); if (h) flyToHotspot(h); });
const step = dir => { const list = hotspots.filter(h => !activeTheme || h.theme === activeTheme); const i = list.findIndex(h => h.id === selected); select(list[(i + dir + list.length) % list.length].id, true); };
$('#btnNext').addEventListener('click', () => step(1)); $('#btnPrev').addEventListener('click', () => step(-1));
canvas.addEventListener('pointerdown', () => { if (isPhone()) panel.classList.add('collapsed'); });
// double-click / double-tap on the model: fly to that spot
{ let lastTap = 0, lastX = 0, lastY = 0; const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3(), ndc = new THREE.Vector2();
  canvas.addEventListener('pointerup', e => { const now = performance.now(), dbl = now - lastTap < 350 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 24; lastTap = now; lastX = e.clientX; lastY = e.clientY; if (!dbl || tour) return;
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(groundPlane, hitP)) { hitP.x = THREE.MathUtils.clamp(hitP.x, bounds.minX - 20, bounds.maxX + 20); hitP.z = THREE.MathUtils.clamp(hitP.z, bounds.minZ - 20, bounds.maxZ + 20); const v = currentView(); flyTo({ radius: Math.min(v.radius, 140), phi: Math.max(v.phi, THREE.MathUtils.degToRad(48)), theta: v.theta, target: new THREE.Vector3(hitP.x, 0, hitP.z) }, 1100); } });
}
const hashId = (location.hash.match(/h=([^&]+)/) || [])[1];

// ============ guided tours ============
const tours = site.tours || [];
let tour = null; // { def, t0, elapsed, paused, blendFrom, blendT, lastKf }
const tb = { bar: $('#tourbar'), name: $('#tbName'), place: $('#tbPlace'), fill: $('#tbFill'), pause: $('#tbPause'), exit: $('#tbExit') };
const TOUR_SPEED = +(q.get('tourSpeed') || 1);
$('#tours').innerHTML = tours.map(t => `<button data-tour="${t.id}"><b>${t.name}</b><small>${t.blurb || ''} · ${t.duration}s</small></button>`).join('');
$('#tours').addEventListener('click', e => { const b = e.target.closest('button'); if (b) startTour(b.dataset.tour); });
function kfView(k) { return { radius: k.radius, phi: THREE.MathUtils.degToRad(k.phiDeg), theta: THREE.MathUtils.degToRad(k.thetaDeg), target: new THREE.Vector3(toX(k.pos[0]), k.targetY ?? 0, toZ(k.pos[1])) }; }
function catmull(p0, p1, p2, p3, u) { const u2 = u * u, u3 = u2 * u; return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); }
function tourView(def, f) {
  const kfs = def._views; const n = kfs.length; if (f <= 0) return kfs[0]; if (f >= 1) return kfs[n - 1];
  let i = 0; while (i < n - 2 && def.keyframes[i + 1].t <= f) i++;
  const ta = def.keyframes[i].t, tb2 = def.keyframes[i + 1].t, u = (f - ta) / Math.max(1e-6, tb2 - ta);
  const P = j => kfs[THREE.MathUtils.clamp(j, 0, n - 1)];
  const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
  return { radius: catmull(a.radius, b.radius, c.radius, d.radius, u), phi: catmull(a.phi, b.phi, c.phi, d.phi, u), theta: catmull(a.theta, b.theta, c.theta, d.theta, u),
    target: new THREE.Vector3(catmull(a.target.x, b.target.x, c.target.x, d.target.x, u), catmull(a.target.y, b.target.y, c.target.y, d.target.y, u), catmull(a.target.z, b.target.z, c.target.z, d.target.z, u)) };
}
function startTour(id) {
  const def = tours.find(t => t.id === id); if (!def) return;
  if (!def._views) { def._views = def.keyframes.map(kfView); for (let i = 1; i < def._views.length; i++) { let d = def._views[i].theta - def._views[i - 1].theta; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; def._views[i].theta = def._views[i - 1].theta + d; }
    const last = def.keyframes[def.keyframes.length - 1]; if (last.overview) def._views[def._views.length - 1] = { ...fitView(), target: fitView().target.clone() }; }
  tween = null; tour = { def, elapsed: 0, paused: false, blendFrom: currentView(), blendT: 0, lastKf: -1 };
  controls.enabled = false; deselect(); panel.classList.add('collapsed');
  document.querySelectorAll('#tours button').forEach(b => b.classList.toggle('playing', b.dataset.tour === id));
  tb.name.textContent = def.name; tb.place.textContent = ''; tb.fill.style.width = '0%'; tb.pause.textContent = '❚❚'; tb.bar.hidden = false;
  history.replaceState(null, '', '#tour=' + id);
}
function endTour(flyHome = true) {
  if (!tour) return; const wasPlaying = !tour.paused; tour = null; tb.bar.hidden = true;
  document.querySelectorAll('#tours button').forEach(b => b.classList.remove('playing'));
  controls.enabled = true; history.replaceState(null, '', location.pathname + location.search);
  if (flyHome && wasPlaying) flyTo(fitView(), 1400);
}
function stepTour(dt) {
  if (!tour) return; const def = tour.def;
  if (tour.paused) return;
  tour.elapsed += dt * TOUR_SPEED; tour.blendT = Math.min(1, tour.blendT + dt / 1.2);
  const f = Math.min(1, tour.elapsed / def.duration);
  const v = tourView(def, f);
  if (tour.blendT < 1) { const e = 1 - Math.pow(1 - tour.blendT, 3), b = tour.blendFrom; let dth = v.theta - b.theta; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    applyView({ radius: THREE.MathUtils.lerp(b.radius, v.radius, e), phi: THREE.MathUtils.lerp(b.phi, v.phi, e), theta: b.theta + dth * e, target: b.target.clone().lerp(v.target, e) }); }
  else applyView(v);
  // highlight the hotspot being passed
  let kf = -1; for (let i = 0; i < def.keyframes.length; i++) if (def.keyframes[i].t <= f + 0.02) kf = i;
  if (kf !== tour.lastKf) { tour.lastKf = kf; const h = def.keyframes[kf] && def.keyframes[kf].hotspot; if (h) { select(h, false, true); tb.place.textContent = hotspots.find(x => x.id === h)?.name || ''; } }
  tb.fill.style.width = (f * 100).toFixed(1) + '%';
  if (f >= 1) { const t = tour; tour = null; tb.bar.hidden = true; document.querySelectorAll('#tours button').forEach(b => b.classList.remove('playing')); controls.enabled = true; history.replaceState(null, '', location.pathname + location.search); tourState.ended.push(t.def.id); }
}
const tourState = { ended: [] };
tb.pause.addEventListener('click', () => { if (!tour) return; tour.paused = !tour.paused; tb.pause.textContent = tour.paused ? '▶' : '❚❚'; controls.enabled = tour.paused; if (!tour.paused) { tour.blendFrom = currentView(); tour.blendT = 0; } });
tb.exit.addEventListener('click', () => endTour(true));
canvas.addEventListener('pointerdown', () => { if (tour && !tour.paused) { tour.paused = true; tb.pause.textContent = '▶'; controls.enabled = true; } });
const hashTour = (location.hash.match(/tour=([^&]+)/) || [])[1];

// ============ loop ============
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio(), phone = isPhone(), key = w + 'x' + h + (phone ? 'p' : 'd');
  if (key === lastSize) return; lastSize = key;
  renderer.setSize(w, h, false); labelRenderer.setSize(w, h);
  // keep the orbit target centred in the part of the canvas the panel/sheet does not cover
  if (phone) { camera.aspect = w / (h + SHEET_H); camera.setViewOffset(w, h + SHEET_H, 0, SHEET_H, w, h); }
  else { camera.aspect = (w + PANEL_W) / h; camera.setViewOffset(w + PANEL_W, h, PANEL_W, 0, w, h); }
  camera.updateProjectionMatrix();
}
let lastT = performance.now(), dirty = true, dirtyUntil = performance.now() + 3000, lastRender = 0;
controls.addEventListener('change', () => { dirty = true; });
window.addEventListener('resize', () => { lastSize = ''; dirty = true; });
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  resize(); stepTween(now); stepTour(dt);
  if (Math.abs(lightTarget - lightK) > 0.001) { lightK += Math.sign(lightTarget - lightK) * Math.min(Math.abs(lightTarget - lightK), dt / 1.2); applyLighting(lightK); dirty = true; }
  if (controls.enabled && controls.update()) dirty = true;
  const animating = !!tween || (tour && !tour.paused) || ring.visible || now < dirtyUntil;
  if (!dirty && !animating) { if (FX.has('stop') || now - lastRender < 90) return; }   // idle: ~11 fps keeps the compositor fed without draining the battery
  dirty = false; lastRender = now;
  renderer.info.reset();
  updateCompass(); updatePins(now); renderer.render(scene, camera); labelRenderer.render(scene, camera);
});

window.__walk = { scene, camera, controls, site, flyTo, fitView, DEFAULT_VIEW, currentView, volumeMeshes, renderer, THREE, treeCount, setLight, select, deselect, setTheme, hotspots, startTour, endTour, tourState, get tour() { return tour; }, get selected() { return selected; },
  quality: QUALITY, tier: TIER, PRESETS, applyLighting, get lightK() { return lightK; }, sky, plinthTopY: PLINTH_TOP,
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, textures: renderer.info.memory.textures }) };
