// Shared manifest helpers for the postcard tools (node). Kinds and ranking come from viewer/media-kinds.js so the tools and the viewer cannot disagree.
import fs from 'node:fs'; import path from 'node:path';
import { sortByRank } from '../viewer/media-kinds.js';
export { RANK, KIND_LABEL, sortByRank } from '../viewer/media-kinds.js';
export const manifestPath = dir => path.join(dir, 'manifest.json');
export function readManifest(dir) { const p = manifestPath(dir); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { images: {} }; }
export function writeManifest(dir, m) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(manifestPath(dir), JSON.stringify(m, null, 2) + '\n'); }
export const entryKey = e => e.kind === 'embed' ? `embed:${e.provider}:${e.id}` : `file:${e.file}`;
// A tool owns some kinds: for every hotspot it touches, its owned entries are replaced by what it produced now; every other kind is kept. Hotspots it does not mention keep everything.
export function mergeOwned(existing, ownedKinds, entriesById) {
  const owned = new Set(ownedKinds), out = { ...existing, images: { ...(existing.images || {}) } };
  for (const [id, entries] of Object.entries(entriesById)) {
    const kept = (out.images[id] || []).filter(e => !owned.has(e.kind)), seen = new Set(kept.map(entryKey)), add = [];
    for (const e of entries) { const k = entryKey(e); if (!seen.has(k)) { seen.add(k); add.push(e); } }
    out.images[id] = sortByRank([...kept, ...add]);
  }
  return out;
}
export const countByKind = m => Object.values(m.images).flat().reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {});
