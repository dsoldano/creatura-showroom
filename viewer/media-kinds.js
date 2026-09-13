// Media kinds shared by the viewer and the postcard tools — one table, so a manifest written by a tool and read by the viewer can never disagree.
// Ruling 4 (hero order, provenance first): developer video > developer render > official embed > AI loop > AI still > plan detail; video before still within a tier.
export const RANK = { video: 0, developer: 1, embed: 2, 'ai-video': 3, ai: 4, plan: 5 };
export const KIND_LABEL = { video: 'Developer video', developer: 'Developer render', embed: 'Developer video', 'ai-video': 'AI loop · indicative', ai: 'AI visualisation · indicative', plan: 'Plan detail' };
export const CHIP = { video: 'video', developer: 'render', embed: 'video', 'ai-video': 'ai loop', ai: 'ai', plan: 'plan' };
const PROVIDER = { youtube: 'YouTube', vimeo: 'Vimeo' };
export const isVideoKind = k => k === 'video' || k === 'embed' || k === 'ai-video';
export const labelOf = e => !e ? '' : (KIND_LABEL[e.kind] || e.kind) + (e.kind === 'embed' && e.provider ? ' · ' + (PROVIDER[e.provider] || e.provider) : '');
export const chipOf = e => e ? (CHIP[e.kind] || e.kind) : '';
export function sortByRank(list) { return list.map((e, i) => [e, i]).sort((a, b) => ((RANK[a[0].kind] ?? 99) - (RANK[b[0].kind] ?? 99)) || (a[1] - b[1])).map(x => x[0]); }
