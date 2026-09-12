// Build <project>/postcards/: copies developer renders, cuts a 3:2 plan-detail crop for EVERY hotspot, writes manifest.json.
// usage: node tools/make-postcards.mjs projects/<slug>
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';
const proj = process.argv[2]; const site = JSON.parse(fs.readFileSync(path.join(proj, 'site.json'), 'utf8'));
const out = path.join(proj, 'postcards'); fs.mkdirSync(out, { recursive: true });
const existing = fs.existsSync(path.join(out, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) : { images: {} };
const manifest = { images: {} };
const push = (id, entry) => { (manifest.images[id] ||= []); if (!manifest.images[id].some(e => e.file === entry.file)) manifest.images[id].push(entry); };
// 1. keep any AI entries already selected (day 5 adds them; re-running this tool must not drop them)
for (const [id, list] of Object.entries(existing.images || {})) for (const e of list) if (e.kind === 'ai') push(id, e);
// 2. developer renders
for (const r of site.developerRenders || []) {
  const dst = 'dev-' + path.basename(r.file); fs.copyFileSync(path.join(proj, r.file), path.join(out, dst));
  for (const id of r.hotspots) push(id, { file: dst, kind: 'developer', credit: r.credit || 'Developer render' });
}
// 3. plan-detail crops for every hotspot (fallback that guarantees nothing ships blank)
const src = path.join(proj, site.postcards?.planSource || site.plan.image);
const ext = src.split('.').pop().toLowerCase(); const mime = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext];
const dataUrl = `data:${mime};base64,` + fs.readFileSync(src).toString('base64');
const b = await chromium.launch(); const p = await b.newPage();
const nat = await p.evaluate(async d => { const im = new Image(); im.src = d; await im.decode(); return im.naturalWidth; }, dataUrl);
const k = nat / site.plan.width, W = 720, H = 480, spanPx = 150; // 150 plan px wide window (~50 m)
await p.setViewportSize({ width: W + 10, height: H + 10 });
await p.setContent(`<body style="margin:0"><canvas id=c width=${W} height=${H}></canvas></body>`);
for (const h of site.hotspots) {
  const [cx, cy] = h.pos; const sw = spanPx * k, sh = sw * H / W;
  await p.evaluate(async ({ d, sx, sy, sw, sh, W, H }) => { const im = new Image(); im.src = d; await im.decode(); const g = document.getElementById('c').getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.imageSmoothingQuality = 'high'; g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H); }, { d: dataUrl, sx: cx * k - sw / 2, sy: cy * k - sh / 2, sw, sh, W, H });
  const file = `plan-${h.id}.jpg`; await p.locator('#c').screenshot({ path: path.join(out, file), type: 'jpeg', quality: 82 });
  push(h.id, { file, kind: 'plan', credit: 'Master plan detail' });
}
await b.close();
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const counts = Object.values(manifest.images).flat().reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {});
console.log('postcards:', Object.keys(manifest.images).length, 'hotspots;', JSON.stringify(counts));
