// Crop a region of any image (coords in a reference width space) and scale it. usage: node tools/crop.mjs <img> <refWidth> <x0> <y0> <x1> <y1> <outWidth> <out.png>
import { chromium } from 'playwright'; import fs from 'node:fs';
const [src, refW, x0, y0, x1, y1, outW, out] = process.argv.slice(2);
const ext = src.split('.').pop().toLowerCase(); const mime = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext];
const dataUrl = `data:${mime};base64,` + fs.readFileSync(src).toString('base64');
const b = await chromium.launch(); const p = await b.newPage();
const nat = await p.evaluate(async d => { const im = new Image(); im.src = d; await im.decode(); return im.naturalWidth; }, dataUrl);
const k = nat / +refW; const sw = (x1 - x0) * k, sh = (y1 - y0) * k; const W = +outW, H = Math.round(sh * W / sw);
await p.setViewportSize({ width: W + 10, height: H + 10 });
await p.setContent(`<body style="margin:0"><canvas id=c width=${W} height=${H}></canvas></body>`);
await p.evaluate(async ({ d, sx, sy, sw, sh, W, H }) => { const im = new Image(); im.src = d; await im.decode(); const g = document.getElementById('c').getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H); }, { d: dataUrl, sx: x0 * k, sy: y0 * k, sw, sh, W, H });
await p.locator('#c').screenshot({ path: out }); console.log(out, W, H, 'k=' + k.toFixed(2)); await b.close();
