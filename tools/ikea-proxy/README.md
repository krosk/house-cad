# IKEA rotera CORS proxy (Cloudflare Worker)

A ~40-line Cloudflare Worker that lets the app load IKEA 3D models **on the fly** without
bundling them into the APK. IKEA's model host origin-allowlists (a browser fetch from our
app gets `403`; only `*.ikea.com` or server-side no-Origin requests get `200`). This Worker
fetches server-side and re-serves the GLB with permissive CORS. See `worker.js` for the
full rationale and `docs/furniture.md`.

It is intentionally narrow: only a bare article id (`/595112780` → 6+ digits) is accepted,
it only ever hits the fixed rotera model URL, and CORS is echoed only to an allowlisted
origin (edit `ALLOWED_ORIGINS` in `worker.js`).

## Deploy (one-time, ~10 min)

```bash
npm i -g wrangler          # or: npx wrangler ...
wrangler login             # opens a browser to your Cloudflare account
cd tools/ikea-proxy
wrangler deploy            # prints the workers.dev URL
```

`wrangler deploy` prints something like
`https://ikea-rotera-proxy.<your-subdomain>.workers.dev`. Two things after that:

1. Put the URL in the app: create `/.env` (repo root) with
   `VITE_IKEA_PROXY=https://ikea-rotera-proxy.<your-subdomain>.workers.dev`
   (see `/.env.example`). Restart the dev server / rebuild the APK to pick it up.
2. If your dev-server LAN origin differs from the ones already in `ALLOWED_ORIGINS`,
   add it and `wrangler deploy` again.

## Test

```bash
# server-side (no Origin) — always works, just confirms upstream + the Worker:
curl -sI "https://ikea-rotera-proxy.<sub>.workers.dev/59511278" | grep -i "http/\|content-type\|access-control"
# with your app's Origin — should return 200 + access-control-allow-origin echoing it:
curl -sI "https://ikea-rotera-proxy.<sub>.workers.dev/59511278" -H "Origin: https://krosk.github.io" | grep -i "http/\|access-control"
```

## Cost

Cloudflare Workers free tier: 100,000 requests/day. This will use a handful. Edge caching
(`cacheTtl: 86400`) means repeat pulls of the same model don't re-hit IKEA.
