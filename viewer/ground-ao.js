// Baked ground ambient occlusion (B4): a canvas over plan.crop — building footprints darkened and blurred (~6 m), crisp contact discs under trees and hedges — used as the ground material's aoMap.
import * as THREE from 'three';
import { boxBlur } from './post-math.js';

export function buildGroundAO({ crop, toPx, mpp, volumes, trees, hedges, width = 1024 }) {
  const W = width, H = Math.round(W * crop.h / crop.w), k = W / crop.w, pxPerM = k / mpp;   // canvas px per plan px, per metre
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (const v of volumes) { g.beginPath(); v.polygon.forEach((p, i) => i ? g.lineTo((p[0] - crop.x) * k, (p[1] - crop.y) * k) : g.moveTo((p[0] - crop.x) * k, (p[1] - crop.y) * k)); g.closePath(); g.fill(); }
  const id = g.getImageData(0, 0, W, H), n = W * H; let grey = new Float32Array(n);
  for (let i = 0; i < n; i++) grey[i] = id.data[i * 4];
  const r = Math.max(1, Math.round(6 * pxPerM)); grey = boxBlur(boxBlur(grey, W, H, r), W, H, r);   // two passes ≈ soft 6 m falloff from every wall
  for (let i = 0; i < n; i++) { const v = grey[i]; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0);
  const disc = (px, py, rad, a) => { const gr = g.createRadialGradient(px, py, 0, px, py, rad); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(px - rad, py - rad, 2 * rad, 2 * rad); };
  for (const t of trees) { const [px, py] = toPx(t.x, t.z); disc((px - crop.x) * k, (py - crop.y) * k, 2.2 * t.s * pxPerM, 0.35); }
  for (const h of hedges) { const [px, py] = toPx(h.x, h.z); disc((px - crop.x) * k, (py - crop.y) * k, 1.0 * pxPerM, 0.25); }
  const d2 = g.getImageData(0, 0, W, H).data; let dark = 0; for (let i = 0; i < n; i++) if (d2[i * 4] < 250) dark++;
  const texture = new THREE.CanvasTexture(cv); texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;   // same uv space + flipY as the ground map and the lawn mask
  return { texture, size: [W, H], darkened: dark / n };
}
