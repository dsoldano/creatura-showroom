// Procedural facades: instanced fins + corner piers + slab rings + crown around an inset glazed core; one glazing shader; faint rhythm for ghosts.
import * as THREE from 'three';
import { edgeFrames, offsetPolygon, finLayout, pierLayout } from './facade-geom.js';
export { resolveFacade } from './facade-geom.js';

const WORLD_VARYINGS_V = ['#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;'];
const WORLD_VARYINGS_W = ['#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * normal);'];

export function facadeMaterial(cfg, opts) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.band), roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uFloorH: { value: opts.floorH }, uBaseH: { value: opts.baseH }, uSlabH: { value: cfg.slabH }, uBayM: { value: cfg.bayM }, uGlass: { value: new THREE.Color(cfg.glass) }, uDusk: { value: opts.lightK }, uWin: { value: opts.windows ? 1 : 0 } });
    sh.vertexShader = sh.vertexShader.replace(...WORLD_VARYINGS_V).replace(...WORLD_VARYINGS_W);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn; uniform float uFloorH; uniform float uBaseH; uniform float uSlabH; uniform float uBayM; uniform vec3 uGlass; uniform float uDusk; uniform float uWin;\nfloat fcdGlazing = 0.0; float fcdFl = 0.0; float fcdU = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float side = 1.0 - abs(vWn.y);
        float fl = fract((vWp.y - uBaseH) / uFloorH);            // 0 at a slab top, 1 just under the next slab
        float slabK = uSlabH / uFloorH;
        float upstand = 1.0 - smoothstep(0.10, 0.13, fl);          // light balcony upstand just above each slab
        float podium = 1.0 - step(uBaseH, vWp.y);                  // stilt + ground zone: band colour, no glass
        float glazing = side * (1.0 - upstand) * (1.0 - podium) * step(fl, 1.0 - slabK);
        float ledge = smoothstep(0.78, 1.0 - slabK, fl);            // darkening under the slab overhang
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlass * (1.0 - 0.45 * ledge), glazing);
        fcdGlazing = glazing; fcdFl = fl; fcdU = dot(vWp.xz, vec2(-vWn.z, vWn.x));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.16, fcdGlazing);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.55, fcdGlazing);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fi = floor((vWp.y - uBaseH) / uFloorH); float bay = floor(fcdU / uBayM);
        float h = fract(sin(dot(vec2(fi, bay), vec2(12.9898, 78.233))) * 43758.5453);
        float win = step(0.45, h) * step(0.18, fcdFl) * (1.0 - step(0.72, fcdFl));
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * 1.1 * uDusk * fcdGlazing * win * uWin;`);
    opts.bandedShaders.push(sh);
  };
  return m;
}

export function ghostMaterial(base, cfg) {
  if (cfg.rhythm !== 'faint') return base;
  const m = base.clone();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uBayM: { value: cfg.bayM || 3.7 }, uFinW: { value: cfg.finW || 0.4 }, uFinGap: { value: cfg.finGap || 0.5 } });
    sh.vertexShader = sh.vertexShader.replace(...WORLD_VARYINGS_V).replace(...WORLD_VARYINGS_W);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn; uniform float uBayM; uniform float uFinW; uniform float uFinGap;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float side = 1.0 - abs(vWn.y);
        float u = dot(vWp.xz, vec2(-vWn.z, vWn.x)); float fb = fract(u / uBayM); float fw = uFinW / uBayM, fg = uFinGap / uBayM;
        float fin = clamp(step(fb, fw) + step(fw + fg, fb) * (1.0 - step(2.0 * fw + fg, fb)), 0.0, 1.0);
        diffuseColor.a *= mix(0.85, 1.35, fin * side);`);
  };
  return m;
}

export function buildFacade(v, cfg, ctx) {
  const poly = v.polygon.map(p => [ctx.toX(p[0]), ctx.toZ(p[1])]);
  const frames = edgeFrames(poly), inset = offsetPolygon(poly, cfg.recess), H = ctx.h;
  const shapeOf = pts => { const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1])); s.closePath(); return s; };
  const group = new THREE.Group(); group.name = 'facade:' + v.id;
  // core: the glazed volume, inset so fins and slabs stand proud of it
  const coreG = new THREE.ExtrudeGeometry(shapeOf(inset), { depth: H, bevelEnabled: false, steps: 1 }); coreG.rotateX(-Math.PI / 2);
  const core = new THREE.Mesh(coreG, ctx.mats.core); core.castShadow = true; core.receiveShadow = true; group.add(core);
  // fins + corner piers: one instanced unit box, scaled (w, height, d), yawed onto its edge
  const fins = cfg.fins ? finLayout(frames, cfg) : [], piers = cfg.fins ? pierLayout(poly, inset, frames, cfg) : [], boxes = [...fins, ...piers];
  if (boxes.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ctx.mats.fin, boxes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    boxes.forEach((b, i) => { const hh = H + (b.tall ? cfg.crownH : 0); im.setMatrixAt(i, m.compose(p.set(b.x, hh / 2, b.z), q.setFromEuler(e.set(0, b.yaw, 0)), s.set(b.w, hh, b.d))); });
    im.castShadow = ctx.tier.facadeShadows; im.receiveShadow = true; group.add(im);
  }
  // slab rings: footprint minus the inset core. One per floor level above the podium; the roof-level ring is the parapet (double height) — no overlaps.
  const ringShape = shapeOf(poly); const hole = new THREE.Path(inset.map(p => new THREE.Vector2(p[0], -p[1]))); hole.closePath(); ringShape.holes.push(hole);
  const ringG = new THREE.ExtrudeGeometry(ringShape, { depth: cfg.slabH, bevelEnabled: false, steps: 1 }); ringG.rotateX(-Math.PI / 2);   // spans y ∈ [0, slabH]
  const floors = Math.max(1, Math.round((H - ctx.baseH) / ctx.floorH));
  const rings = new THREE.InstancedMesh(ringG, ctx.mats.band, floors); const m = new THREE.Matrix4();
  for (let i = 1; i < floors; i++) rings.setMatrixAt(i - 1, m.makeTranslation(0, ctx.baseH + i * ctx.floorH - cfg.slabH, 0));
  rings.setMatrixAt(floors - 1, m.makeScale(1, 2, 1).setPosition(0, H - cfg.slabH, 0));   // parapet: y ∈ [H − slabH, H + slabH]
  rings.castShadow = ctx.tier.facadeShadows; rings.receiveShadow = true; group.add(rings);
  return { group, core, fins: fins.length, piers: piers.length, rings: floors };
}
