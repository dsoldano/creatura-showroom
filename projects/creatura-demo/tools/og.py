# Inject link-preview (Open Graph) tags into a deployed index.html from its site.json. usage: python3 tools/og.py <deployed dir> <slug>
import json, sys, html, os
dst, slug = sys.argv[1], sys.argv[2]; s = json.load(open(os.path.join(dst, 'site.json')))
base = f'https://walk.csoul.cloud/{slug}/'
title = f"{s.get('name', slug)} · interactive site walkthrough"
desc = f"Fly over the master plan, open every amenity, play the guided tours. {s.get('location', '')}. A CreatiSoul demonstration rebuilt from public data."
tags = [f'<meta property="og:title" content="{html.escape(title)}">', f'<meta property="og:description" content="{html.escape(desc)}">', f'<meta property="og:url" content="{base}">',
        '<meta property="og:type" content="website">', '<meta name="twitter:card" content="summary_large_image">', f'<meta name="description" content="{html.escape(desc)}">']
if os.path.exists(os.path.join(dst, 'og.jpg')):
    tags += [f'<meta property="og:image" content="{base}og.jpg">', '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">']
p = os.path.join(dst, 'index.html'); h = open(p).read().replace('<!--OG-->', '\n'.join(tags)).replace('<title>Site walkthrough</title>', f'<title>{html.escape(title)}</title>')
open(p, 'w').write(h); print('og tags:', len(tags))
