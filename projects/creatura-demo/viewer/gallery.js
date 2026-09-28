// Postcard gallery (C1): a scroll-snap strip of media entries per hotspot with dots, hover arrows, ←/→ and an IntersectionObserver-driven active index.
// renderMedia() is the one place a manifest entry becomes DOM; the strip and (C4) fullscreen both use it.
import { labelOf, sortByRank, isVideoKind } from './media-kinds.js';

export function renderMedia(entry, hotspot, base) {
  const alt = hotspot.name + ' — ' + labelOf(entry);
  if (isVideoKind(entry.kind)) {   // video | embed | ai-video: poster + play glyph for now; playback and the embed facade land in C3
    const wrap = document.createElement('div'); wrap.className = 'media poster ' + entry.kind;
    const im = document.createElement('img'); im.loading = 'lazy'; im.decoding = 'async'; im.src = base + 'postcards/' + entry.poster; im.alt = alt; wrap.appendChild(im);
    const play = document.createElement('span'); play.className = 'play'; play.setAttribute('aria-hidden', 'true'); wrap.appendChild(play); return wrap;
  }
  const im = document.createElement('img'); im.className = 'media'; im.loading = 'lazy'; im.decoding = 'async'; im.src = base + 'postcards/' + entry.file; im.alt = alt; return im;
}

export function createGallery({ strip, dots, prev, next, badge, credit, base }) {
  let entries = [], index = 0, hotspot = null, io = null, pending = null, pendingUntil = 0;   // pending: the slide go() asked for — authoritative until its scroll lands (or 1.2 s pass)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function setActive(i) {
    index = i; const e = entries[i];
    [...strip.children].forEach((s, k) => s.classList.toggle('active', k === i));
    [...dots.children].forEach((d, k) => d.setAttribute('aria-current', k === i ? 'true' : 'false'));
    badge.textContent = labelOf(e); badge.className = 'badge ' + (e ? e.kind : ''); credit.textContent = e ? (e.credit || '') : '';
    prev.disabled = i <= 0; next.disabled = i >= entries.length - 1;
  }
  function show(h) {
    hotspot = h; entries = sortByRank(h.images || []); if (io) io.disconnect();
    strip.replaceChildren(...entries.map((e, i) => { const s = document.createElement('div'); s.className = 'slide'; s.dataset.i = i; s.appendChild(renderMedia(e, h, base)); return s; }));
    dots.replaceChildren(...entries.map((e, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dot'; b.setAttribute('aria-label', `${labelOf(e)} (${i + 1} of ${entries.length})`); b.addEventListener('click', () => go(i)); return b; }));
    strip.classList.toggle('wide', entries.some(e => isVideoKind(e.kind)));
    strip.parentElement.classList.toggle('single', entries.length <= 1); strip.parentElement.hidden = entries.length === 0;
    strip.scrollLeft = 0; setActive(0);
    pending = null;
    io = new IntersectionObserver(items => { let best = null; for (const it of items) if (it.isIntersecting && (!best || it.intersectionRatio > best.intersectionRatio)) best = it; if (!best) return;
      const i = +best.target.dataset.i; if (pending !== null) { if (i === pending) pending = null; else if (performance.now() < pendingUntil) return; else pending = null; }   // a stale notification must not undo go()
      setActive(i); }, { root: strip, threshold: [0.6] });
    for (const s of strip.children) io.observe(s);
  }
  function go(i) { if (!entries.length) return; const k = Math.max(0, Math.min(entries.length - 1, i)); pending = k; pendingUntil = performance.now() + 1200; strip.scrollTo({ left: k * strip.clientWidth, behavior: reduced.matches ? 'auto' : 'smooth' }); setActive(k); }
  prev.addEventListener('click', () => go(index - 1)); next.addEventListener('click', () => go(index + 1));
  return { show, go, get index() { return index; }, get count() { return entries.length; }, get entries() { return entries; }, get hotspot() { return hotspot; } };
}
