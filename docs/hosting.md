# Hosting (CreatiSoul's deployment)

How the demo at https://walk.csoul.cloud/ is served. This is specific to CreatiSoul's host; the viewer is static files, so any static web server (nginx, GitHub Pages, S3, Netlify…) works — `tools/deploy.sh <slug> <dest root>` assembles the folder to publish (viewer + project data, plus link-preview tags from `site.json`), and `docs/adding-a-project.md` covers the data side.

`walk-csoul` is a plain `nginx:alpine` container on the `coolify` network serving `/root/walk` read-only, routed by the Coolify Traefik with the labels below (Let's Encrypt via the `letsencrypt` resolver). It is independent of every other app on the host and safe to remove and recreate:

```bash
docker rm -f walk-csoul
docker run -d --name walk-csoul --restart unless-stopped --network coolify -v /root/walk:/usr/share/nginx/html:ro \
  -l traefik.enable=true \
  -l 'traefik.http.routers.walk-http.rule=Host(`walk.csoul.cloud`)'  -l traefik.http.routers.walk-http.entryPoints=http  -l traefik.http.routers.walk-http.middlewares=walk-redirect -l traefik.http.routers.walk-http.service=walk \
  -l 'traefik.http.routers.walk-https.rule=Host(`walk.csoul.cloud`)' -l traefik.http.routers.walk-https.entryPoints=https -l traefik.http.routers.walk-https.tls=true -l traefik.http.routers.walk-https.tls.certresolver=letsencrypt -l traefik.http.routers.walk-https.middlewares=walk-gzip -l traefik.http.routers.walk-https.service=walk \
  -l traefik.http.middlewares.walk-redirect.redirectscheme.scheme=https -l traefik.http.middlewares.walk-gzip.compress=true -l traefik.http.services.walk.loadbalancer.server.port=80 nginx:alpine
```

DNS: `walk.csoul.cloud` A → `62.72.56.130` (Hostinger, unproxied). `robots.txt` disallows everything; pages carry `noindex`.
