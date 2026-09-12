// Crop a region of the plan image into plan.jpg (the ground texture).
// usage: NODE_PATH=<dir with playwright> node tools/make-ground.mjs <src image> <site.json> <out.jpg> [maxDim=2048]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [src, sitePath, out, maxDimArg] = process.argv.slice(2);
const maxDim = +(maxDimArg || 2048);
const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
const c = site.plan.crop;
const ext = src.split('.').pop().toLowerCase();
const mime = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext];
const dataUrl = `data:${mime};base64,` + fs.readFileSync(src).toString('base64');
const b = await chromium.launch(); const p = await b.newPage();
const info = await p.evaluate(async (dataUrl) => { const im = new Image(); im.src = dataUrl; await im.decode(); return { w: im.naturalWidth, h: im.naturalHeight }; }, dataUrl);
// the source may be an upscaled copy of the 1200x848 plan: scale the crop rect to it
const k = info.w / site.plan.width;
const sx = c.x * k, sy = c.y * k, sw = c.w * k, sh = c.h * k;
const scale = Math.min(1, maxDim / Math.max(sw, sh));
const W = Math.round(sw * scale), H = Math.round(sh * scale);
await p.setViewportSize({ width: W + 10, height: H + 10 });
await p.setContent(`<body style="margin:0"><canvas id=c width=${W} height=${H}></canvas></body>`);
await p.evaluate(async ({ dataUrl, sx, sy, sw, sh, W, H }) => { const im = new Image(); im.src = dataUrl; await im.decode(); const g = document.getElementById('c').getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H); }, { dataUrl, sx, sy, sw, sh, W, H });
await p.locator('#c').screenshot({ path: out, type: 'jpeg', quality: 88 });
console.log(`ground ${out}: source ${info.w}x${info.h} (k=${k.toFixed(2)}) -> ${W}x${H}`);
await b.close();
