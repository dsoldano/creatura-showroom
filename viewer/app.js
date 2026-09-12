import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- project loading ----------
const q = new URLSearchParams(location.search);
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

// ---------- renderer / scene ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xece7de, 1100, 2600);

const camera = new THREE.PerspectiveCamera(42, 1, 1, 6000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 60; controls.maxDistance = 900;
controls.minPolarAngle = THREE.MathUtils.degToRad(10);   // pitch <= 80° above horizon
controls.maxPolarAngle = THREE.MathUtils.degToRad(70);   // pitch >= 20°
controls.screenSpacePanning = false;
controls.zoomSpeed = 0.8; controls.rotateSpeed = 0.7;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.enabled = false;

const DEFAULT_VIEW = { radius: 0, phi: THREE.MathUtils.degToRad(52), theta: THREE.MathUtils.degToRad(28), target: new THREE.Vector3(0, 22, -siteD * 0.04) };
function fitRadius() { const a = canvas.clientWidth / Math.max(1, canvas.clientHeight); return Math.max(siteW, siteD) * 1.75 * Math.max(1, 0.7 / a); }
// portrait screens: look up the site's long axis and a little steeper, so the plan fills the tall frame
function fitView() { const a = canvas.clientWidth / Math.max(1, canvas.clientHeight); const portrait = a < 0.8;
  return { ...DEFAULT_VIEW, radius: fitRadius(), theta: THREE.MathUtils.degToRad(portrait ? 12 : 28), phi: THREE.MathUtils.degToRad(portrait ? 47 : 52) }; }
DEFAULT_VIEW.radius = fitRadius();

// ---------- lighting ----------
const hemi = new THREE.HemisphereLight(0xdfe9ff, 0xc2b49a, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);
sun.position.set(300, 520, 260);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; const R = Math.max(siteW, siteD) * 0.75;
sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 50; sc.far = 1200;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);

// ---------- materials ----------
const matBase = new THREE.MeshStandardMaterial({ color: 0xe9e3d8, roughness: 1, metalness: 0 });
const matPlinth = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.95 });
const matTower = bandedMaterial(0xf4eee2, FLOOR_H);
const matClub = bandedMaterial(0xdcc7a1, 4);
const matServices = new THREE.MeshStandardMaterial({ color: 0xcfc9c0, roughness: 0.9 });
const matGhost = new THREE.MeshPhysicalMaterial({ color: 0x9fb2cc, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.26, depthWrite: false });
const matEdge = new THREE.LineBasicMaterial({ color: 0xa89f90, transparent: true, opacity: 0.7 });
const matGhostEdge = new THREE.LineBasicMaterial({ color: 0x6f86a6, transparent: true, opacity: 0.85 });

function bandedMaterial(color, floorH) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uFloorH = { value: floorH };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWy; varying vec3 vWn;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWy = (modelMatrix * vec4(position, 1.0)).y; vWn = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWy; varying vec3 vWn; uniform float uFloorH;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float side = 1.0 - abs(vWn.y);              // 1 on walls, 0 on roof
        float fl = fract(vWy / uFloorH);
        float slab = smoothstep(0.86, 0.90, fl);    // slab line per floor
        diffuseColor.rgb *= 1.0 - slab * 0.16 * side;
        diffuseColor.rgb *= 1.0 - side * 0.04;      // walls a touch darker than roofs`);
  };
  return m;
}

// ---------- geometry helpers ----------
// Shape coords: (x, -z) so that ExtrudeGeometry rotated -90° about X gives y-up with world z = plan south.
function shapeFromPlan(poly) {
  const s = new THREE.Shape();
  poly.forEach((p, i) => i ? s.lineTo(toX(p[0]), -toZ(p[1])) : s.moveTo(toX(p[0]), -toZ(p[1])));
  s.closePath();
  return s;
}
function extrude(poly, height, mat, edgeMat, y0 = 0) {
  const g = new THREE.ExtrudeGeometry(shapeFromPlan(poly), { depth: height, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (edgeMat) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMat));
  return mesh;
}

// ---------- world ----------
const world = new THREE.Group(); scene.add(world);

// base plate (the model table) + plinth under the site
const base = new THREE.Mesh(new THREE.CircleGeometry(2400, 96), matBase);
base.rotation.x = -Math.PI / 2; base.position.y = -1.6; base.receiveShadow = true; world.add(base);
world.add(extrude(site.boundary, 1.5, matPlinth, null, -1.5));

// ground: the plan image clipped to the site boundary
const texLoader = new THREE.TextureLoader();
const groundTex = await texLoader.loadAsync(BASE + (site.plan.ground || 'plan.jpg'));
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
groundTex.generateMipmaps = true; groundTex.minFilter = THREE.LinearMipmapLinearFilter;
{
  const g = new THREE.ShapeGeometry(shapeFromPlan(site.boundary), 1);
  const c = site.plan.crop; const pos = g.attributes.position; const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) / mpp + cen[0], py = -pos.getY(i) / mpp + cen[1];
    uv[i * 2] = (px - c.x) / c.w; uv[i * 2 + 1] = 1 - (py - c.y) / c.h;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.rotateX(-Math.PI / 2); g.translate(0, 0.03, 0);
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true; world.add(ground);
}

// volumes
const volumeMeshes = {};
for (const v of site.volumes) {
  const h = v.heightM || (v.floors || 1) * FLOOR_H;
  let mesh;
  if (v.kind === 'tower') mesh = extrude(v.polygon, h, matTower, matEdge);
  else if (v.kind === 'future') { mesh = extrude(v.polygon, h, matGhost, matGhostEdge); mesh.castShadow = false; }
  else if (v.kind === 'clubhouse') mesh = extrude(v.polygon, h, matClub, matEdge);
  else mesh = extrude(v.polygon, h, matServices, matEdge);
  mesh.userData.volume = v; volumeMeshes[v.id] = mesh; world.add(mesh);
}

// ---------- camera helpers ----------
const sph = new THREE.Spherical();
function applyView(v) {
  controls.target.copy(v.target);
  camera.position.setFromSpherical(sph.set(v.radius, v.phi, v.theta)).add(v.target);
  camera.lookAt(v.target);
}
function currentView() {
  const off = camera.position.clone().sub(controls.target); sph.setFromVector3(off);
  return { radius: sph.radius, phi: sph.phi, theta: sph.theta, target: controls.target.clone() };
}
let tween = null;
function flyTo(view, ms = 1400, onDone) {
  const from = currentView(); const to = { ...view, target: view.target.clone() };
  // shortest theta path
  let dth = to.theta - from.theta; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI; to.theta = from.theta + dth;
  controls.enabled = false;
  tween = { from, to, t0: performance.now(), ms, onDone };
}
function stepTween(now) {
  if (!tween) return;
  const k = Math.min(1, (now - tween.t0) / tween.ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const f = tween.from, t = tween.to;
  applyView({ radius: f.radius + (t.radius - f.radius) * e, phi: f.phi + (t.phi - f.phi) * e, theta: f.theta + (t.theta - f.theta) * e, target: f.target.clone().lerp(t.target, e) });
  if (k >= 1) { const cb = tween.onDone; tween = null; controls.enabled = true; controls.update(); cb && cb(); }
}
// keep the orbit target on the site
const PAD = 60;
controls.addEventListener('change', () => {
  const t = controls.target; let moved = false;
  const nx = THREE.MathUtils.clamp(t.x, bounds.minX - PAD, bounds.maxX + PAD), nz = THREE.MathUtils.clamp(t.z, bounds.minZ - PAD, bounds.maxZ + PAD);
  const ny = THREE.MathUtils.clamp(t.y, 0, 60);
  if (nx !== t.x || nz !== t.z || ny !== t.y) { const d = new THREE.Vector3(nx - t.x, ny - t.y, nz - t.z); t.add(d); camera.position.add(d); moved = true; }
  return moved;
});

// ---------- UI ----------
const $ = s => document.querySelector(s);
document.title = site.name + ' · site walkthrough';
$('#titleText').textContent = site.name;
$('#introName').textContent = site.name;
$('#introLoc').textContent = [site.developer, site.location].filter(Boolean).join(' · ');
$('#introDisc').textContent = site.disclaimer || '';
const northRad = THREE.MathUtils.degToRad(site.plan.northDeg ?? 0);
const northVec = new THREE.Vector3(Math.sin(northRad), 0, -Math.cos(northRad));
const needle = $('#compass .needle');
function updateCompass() {
  const a = Math.atan2(northVec.x, -northVec.z) + controls.getAzimuthalAngle();
  needle.style.transform = `rotate(${THREE.MathUtils.radToDeg(a).toFixed(1)}deg)`;
}
$('#btnReset').addEventListener('click', () => flyTo(fitView(), 1400));
window.addEventListener('keydown', e => { if (e.key === 'Escape') flyTo(fitView(), 1400); });

// reveal: start high above, swoop to the default view
resize(); DEFAULT_VIEW.radius = fitRadius();
applyView({ radius: 1500, phi: THREE.MathUtils.degToRad(8), theta: DEFAULT_VIEW.theta - 0.35, target: DEFAULT_VIEW.target });
const explore = $('#btnExplore');
explore.disabled = false; explore.textContent = 'Explore the site';
explore.addEventListener('click', () => {
  $('#intro').classList.add('hide');
  flyTo(fitView(), 5000);
});
if (q.get('autostart')) { $('#intro').classList.add('hide'); flyTo(fitView(), +q.get('autostart') || 5000); }

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}
renderer.setAnimationLoop(now => {
  resize();
  stepTween(now);
  if (controls.enabled) controls.update();
  updateCompass();
  renderer.render(scene, camera);
});

window.__walk = { scene, camera, controls, site, flyTo, fitView, DEFAULT_VIEW, currentView, volumeMeshes, renderer, THREE };
