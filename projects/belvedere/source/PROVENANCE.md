# Source provenance — Brigade Belvedere

Fetched 2026-09-12 from the mirror site brigadebelvedere.net (Brigade's own site
returns 403 to this host). All images are Brigade Group marketing material,
used here for a CreatiSoul demonstration rebuilt from public data.

- masterplan.webp — master plan render with 41-item legend (1200x848)
- render-exterior-aerial.webp — tower cluster aerial (style reference #1)
- render-garden-outdoor-elevated.webp — elevated garden (style reference #2)
- render-building-exterior.webp, render-community-garden-outdoor-ground-level.webp,
  render-landscaped-courtyard-exterior-street-level.webp,
  render-seating-area-outdoor-ground.webp, render-tennis-court-exterior-elevated.webp
- location-map.webp
- NOT used: the mirror's "street-street-level" image is stock art.

Facts (public): 10.75 acres; 5 towers 3B+S+G+43; 1,750 homes; Phase 1 = towers A+B,
773 units; RERA PRM/KA/RERA/1251/446/PR/240326/008549; architect Ricardo Bofill
Taller de Arquitectura; possession March 2031.

Facade rhythm (2026-09-12, arc 2 B2): paired vertical fins, ~3.7 m bays, per-floor upstand bands and a stepped crown were read by eye from brigade-belvedere-exterior-aerial.webp; no architect's drawings were used; tower counts and heights are unchanged. The viewer labels this in site.json `facades.tower.source` and the disclaimer.

AI ground spike (2026-09-13, arc 2 B5): two generations of a photoreal top-down "as built" of the plan crop
(Nano Banana Pro, 3:4, 2k, references = plan.jpg + render-exterior-aerial.webp, 4 credits), measured against the
traced polygons in tools/trace.html (profile cross-correlation, 6 px acceptance at 1200 wide):
attempt 1 — 5 of 67 edges over 6 px, worst 9 px, rink and splash pad invented as swimming pools; attempt 2 — 7 of 67 over,
worst 9 px, the plan's labels and numbers rendered into the photo, splash pad still a pool. FAILED the acceptance twice → dropped;
the plan stays the ground. Geometry was a near miss both times (≈ 90 % of edges within 2 m). Log: source/ai-ground-log.json;
evidence: docs/checkpoints/b5/. Not used anywhere in the viewer.
