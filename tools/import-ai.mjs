// Import selected AI candidates into <project>/postcards as JPEG, prepend 'ai' entries in manifest.json, append provenance to ai-log.json.
// usage: node tools/import-ai.mjs projects/<slug> selection.json   (selection: { credit, model, references:[], subjects:{id:subject}, picks:{ id: "/abs/path.png#jobid" } })
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';
import { readManifest, writeManifest, mergeOwned } from './media-lib.mjs';   // owns the ai entries; everything else is kept, lists re-sorted by provenance
const [proj, selPath] = process.argv.slice(2); const sel = JSON.parse(fs.readFileSync(selPath, 'utf8'));
const out = path.join(proj, 'postcards'); let manifest = readManifest(out);
const logP = path.join(out, 'ai-log.json'); const log = fs.existsSync(logP) ? JSON.parse(fs.readFileSync(logP, 'utf8')) : [];
const b = await chromium.launch(); const p = await b.newPage(); await p.setViewportSize({ width: 1040, height: 700 });
for (const [id, spec] of Object.entries(sel.picks)) {
  const [src, jobId] = spec.split('#'); const data = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');
  await p.setContent(`<body style="margin:0"><canvas id=c width=1024 height=683></canvas></body>`);
  await p.evaluate(async d => { const im = new Image(); im.src = d; await im.decode(); const g = document.getElementById('c').getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, 1024, 683); }, data);
  const file = `ai-${id}.jpg`; await p.locator('#c').screenshot({ path: path.join(out, file), type: 'jpeg', quality: 86 });
  manifest = mergeOwned(manifest, ['ai'], { [id]: [{ file, kind: 'ai', credit: sel.credit }] });
  log.push({ id, file, jobId, model: sel.model, references: sel.references, subject: sel.subjects[id], promptPrefix: sel.promptPrefix, date: new Date().toISOString().slice(0, 10) });
}
await b.close();
writeManifest(out, manifest); fs.writeFileSync(logP, JSON.stringify(log, null, 2) + '\n');
console.log('imported', Object.keys(sel.picks).length, 'AI postcards');
