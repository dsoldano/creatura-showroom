// Pure mask work for procedural greenery (no three import; node-tested). Masks are Uint8Array(W*H), row-major, image space: x right, y down.
export const TREE_RULE = (r, g, b) => g > r + 18 && g > b + 28 && g < 168 && r < 150;   // dark saturated green: canopies + hedges (the rule the viewer has used since day 3)
export const LAWN_RULE = (r, g, b) => g > r + 8 && g > b + 25 && g > 140;               // light green: lawn, planted grid, gardens

export function masksFrom(data, W, H) {
  const tree = new Uint8Array(W * H), lawn = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; if (TREE_RULE(r, g, b)) tree[i] = 1; if (LAWN_RULE(r, g, b)) lawn[i] = 1; }
  return { tree, lawn };
}
// Erode (erode=true) or dilate with a disc of radius rad cells. Outside the image counts as empty.
export function morph(src, W, H, rad, erode) {
  const out = new Uint8Array(W * H), offs = [];
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) offs.push([dx, dy]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let hit = false;
    for (const [dx, dy] of offs) { const xx = x + dx, yy = y + dy; const s = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : src[yy * W + xx]; if (erode ? !s : s) { hit = true; break; } }
    out[y * W + x] = erode ? (hit ? 0 : 1) : (hit ? 1 : 0);
  }
  return out;
}
// Thin strips of the tree mask = hedges. Drawn canopies carry highlight holes, so close first (fills holes ≤ closeR), then whatever an opening of openR removes is "thin".
// Measured on Belvedere at 640 px (0.33 m cells): closeR 1 / openR 2 → 11.7 % of the green is thin (court hedges, path edgings); the spec's 1.2 m erosion alone made 62–73 % thin.
export function thinOf(tree, W, H, closeR = 1, openR = 2) {
  const closed = morph(morph(tree, W, H, closeR, false), W, H, closeR, true);
  const opened = morph(morph(closed, W, H, openR, true), W, H, openR, false);
  const thin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) thin[i] = closed[i] && !opened[i] ? 1 : 0;
  return thin;
}
// Axis of the strip through (x, y): structure tensor of the set cells in a (2R+1)² window. Angle in image space (0 = along +x, π/2 = along +y).
export function strandYaw(thin, W, H, x, y, R = 3) {
  let sxx = 0, syy = 0, sxy = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !thin[yy * W + xx]) continue; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}
// Tileable water normal map: size² RGBA bytes. Height = integer-frequency sine waves + wrapped value noise (both periodic → seamless tile); normals by central differences with wrap.
export function waterNormalData(size = 256, seed = 3) {
  const h = new Float32Array(size * size), lat = 8, grid = new Float32Array(lat * lat);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < lat * lat; i++) grid[i] = rnd();
  const smooth = t => t * t * (3 - 2 * t);
  const g = (x, y) => grid[(((y % lat) + lat) % lat) * lat + (((x % lat) + lat) % lat)];
  const noise = (u, v) => { const gx = u * lat, gy = v * lat, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = smooth(gx - x0), fy = smooth(gy - y0);
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy; };
  const waves = [[3, 1, 0.6], [1, 4, 0.45], [5, -3, 0.3], [-2, 6, 0.25]];   // [kx, ky, amplitude]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const u = x / size, v = y / size; let z = 0;
    for (const [kx, ky, a] of waves) z += a * Math.sin(2 * Math.PI * (kx * u + ky * v));
    h[y * size + x] = z + 1.4 * (noise(u, v) - 0.5); }
  const out = new Uint8ClampedArray(size * size * 4), k = size * 0.012;   // slope gain: ripples read at normalScale ≈ 0.35 without looking like a storm
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const L = h[y * size + (x + size - 1) % size], R = h[y * size + (x + 1) % size], U = h[((y + size - 1) % size) * size + x], D = h[((y + 1) % size) * size + x];
    let nx = -(R - L) * k, ny = -(D - U) * k, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4; out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}
