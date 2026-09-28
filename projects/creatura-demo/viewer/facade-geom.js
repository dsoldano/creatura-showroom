// Pure geometry + config for procedural facades (no three import; node-tested). World coordinates are [x, z] metres, y up.
export const FACADE_DEFAULTS = {          // no `facades` block in site.json → exactly today's look
  tower: { style: 'banded' }, clubhouse: { style: 'banded' }, future: { style: 'ghost', rhythm: 'none' }, services: { style: 'plain' },
};
export const STYLE_PRESETS = {            // rhythm read from Brigade's published aerial render: paired fins, ~3.7 m bays, upstand bands, stepped crown
  fins:       { fins: true,  bayM: 3.7, finW: 0.4, finGap: 0.5, recess: 0.5, slabH: 0.45, crownH: 4.5, fin: '#f2ece0', band: '#e6ddcd', glass: '#46596a' },
  stoneGlass: { fins: true,  bayM: 6,   finW: 0.8, finGap: 0.2, recess: 0.35, slabH: 0.5, crownH: 0.6, fin: '#d9c9a8', band: '#d9c9a8', glass: '#5a6b78' },   // low block: broad stone pier pair per bay, tall glass between
};
export function resolveFacade(volume, siteFacades = {}) {
  const raw = typeof volume.facade === 'string' ? { style: volume.facade }
    : (volume.facade || siteFacades[volume.kind] || FACADE_DEFAULTS[volume.kind] || { style: 'plain' });
  const style = raw.style || 'banded';
  return { ...(STYLE_PRESETS[style] || {}), ...raw, style };
}
// Per-edge frames. n is the OUTWARD unit normal whatever the winding (sign from the shoelace area).
export function edgeFrames(poly) {
  const n = poly.length, area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % n]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2, s = area > 0 ? 1 : -1;
  return poly.map((p, i) => { const q = poly[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1, t = [dx / L, dz / L];
    return { start: p, end: q, t, n: [s * t[1], -s * t[0]], L }; });
}
// Inset by d metres (positive = inward): miter intersection of the two offset edges at each vertex; parallel edges fall back to a plain offset.
export function offsetPolygon(poly, d) {
  const fr = edgeFrames(poly), n = poly.length;
  return poly.map((p, i) => {
    const a = fr[(i - 1 + n) % n], b = fr[i];
    const pa = [a.start[0] - a.n[0] * d, a.start[1] - a.n[1] * d], pb = [b.start[0] - b.n[0] * d, b.start[1] - b.n[1] * d];
    const cross = a.t[0] * b.t[1] - a.t[1] * b.t[0];
    if (Math.abs(cross) < 1e-6) return [p[0] - b.n[0] * d, p[1] - b.n[1] * d];
    const wx = pb[0] - pa[0], wz = pb[1] - pa[1], s = (wx * b.t[1] - wz * b.t[0]) / cross;
    return [pa[0] + a.t[0] * s, pa[1] + a.t[1] * s];
  });
}
const yawOf = t => Math.atan2(-t[1], t[0]);   // rotation about +y that maps local +x onto the edge tangent
// Two fins per bay, centred in the recess between the inset core face and the footprint line; the first and last fin of each edge rise into the crown.
export function finLayout(frames, cfg) {
  const out = [];
  for (const e of frames) {
    const bays = Math.max(1, Math.round(e.L / cfg.bayM)), pitch = e.L / bays, yaw = yawOf(e.t);
    for (let b = 0; b < bays; b++) for (const side of [-1, 1]) {
      const u = (b + 0.5) * pitch + side * (cfg.finGap + cfg.finW) / 2, tall = (b === 0 && side === -1) || (b === bays - 1 && side === 1);
      out.push({ x: e.start[0] + e.t[0] * u - e.n[0] * cfg.recess / 2, z: e.start[1] + e.t[1] * u - e.n[1] * cfg.recess / 2, yaw, w: cfg.finW, d: cfg.recess, tall });
    }
  }
  return out;
}
// One square pier per vertex, filling the corner between the footprint vertex and its inset.
export function pierLayout(poly, inset, frames, cfg) {
  return poly.map((p, i) => ({ x: (p[0] + inset[i][0]) / 2, z: (p[1] + inset[i][1]) / 2, yaw: yawOf(frames[i].t), w: cfg.recess, d: cfg.recess, tall: true }));
}
