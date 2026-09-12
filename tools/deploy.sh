#!/usr/bin/env bash
# Assemble a deployable folder for one project: viewer + project data, served by the walk-csoul nginx container.
# usage: tools/deploy.sh <slug> [dest root=/root/walk]
set -euo pipefail
SLUG="${1:?slug}"; ROOT="${2:-/root/walk}"; REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/projects/$SLUG"; DST="$ROOT/$SLUG"
[ -f "$SRC/site.json" ] || { echo "no site.json for $SLUG"; exit 1; }
mkdir -p "$DST"
rsync -a --delete --exclude 'source/' --exclude '*.md' "$SRC/" "$DST/"
rsync -a "$REPO/viewer/" "$DST/"
# hub index + robots (demo: keep out of search engines)
python3 - "$ROOT" <<'PY'
import json, os, sys
root = sys.argv[1]; items = []
for slug in sorted(os.listdir(root)):
    p = os.path.join(root, slug, 'site.json')
    if os.path.isfile(p):
        s = json.load(open(p)); items.append(f'<li><a href="/{slug}/">{s.get("name", slug)}</a> <span>{s.get("location", "")}</span></li>')
html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Site walkthroughs · CreatiSoul</title>
<style>body{{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f7f3ec;color:#1d1a16;display:grid;place-items:center;min-height:100vh}}main{{max-width:560px;padding:32px}}h1{{font-size:22px;margin:0 0 4px}}p{{color:#6b655c;margin:0 0 20px}}ul{{list-style:none;padding:0;margin:0}}li{{padding:12px 0;border-top:1px solid rgba(29,26,22,.12)}}a{{color:#c8772a;font-weight:600;text-decoration:none}}span{{color:#6b655c;display:block;font-size:14px}}</style></head>
<body><main><h1>Site walkthroughs</h1><p>Interactive master-plan demonstrations by CreatiSoul, rebuilt from public data.</p><ul>{"".join(items)}</ul></main></body></html>'''
open(os.path.join(root, 'index.html'), 'w').write(html)
open(os.path.join(root, 'robots.txt'), 'w').write('User-agent: *\nDisallow: /\n')
print('hub:', len(items), 'project(s)')
PY
echo "deployed $SLUG -> $DST ($(du -sh "$DST" | cut -f1))"
