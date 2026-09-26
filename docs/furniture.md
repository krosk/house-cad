# Furniture: IKEA models in AR and 3D

Design reference for real-product furniture. Goal: a **realistic furniture preview** in the
passthrough scene (and the desktop/shared 3D view) at true scale. Mechanics of the AR FURNISH mode
are in `docs/ar-survey.md`; live state in `.claude/handoff.md`.

## Two different things called "furniture" (keep them distinct)

1. The **`furniture` zone kind**: a placeholder rectangle authored in PLAN with a `[foot, top]`
   body band. `computeFootprint` skips it, and it doesn't reduce room area.
2. **GLB furniture**: real product models in `floor.furniture[]`
   (`{id, article, x, y, z, rotationY, name}`), placed with the AR **FURNISH** mode (id `furnish`,
   deliberately not `furniture`, which is the zone kind).

Neither is massing. GLB furniture is a **parallel lane like markers**: it never touches the
footprint, boolean, extrude, or solver pipeline. `z` is the **foot elevation** above the floor
(0 = on the floor; raise it for a wall-hung unit). The mesh supplies the height.

## Where the models come from: IKEA "rotera"

IKEA products with a 3D view on their product page expose a real GLB through IKEA's **rotera**
service. This beats AI image-to-3D decisively: real geometry from all sides, **authored in meters
at true scale**, so it drops into this meters-based world with no rescaling. Verified: a JÄTTEBO
module's GLB bounding box matched IKEA's published dimensions to about 1%.

- **Static GLB (no auth):** `https://web-api.ikea.com/<lang>/rotera/static/models/<article>-mini.glb`.
  `-mini` is the only resolution and is the model. About 100 KB, `KHR_draco_mesh_compression` +
  `EXT_texture_webp`, Y-up, floor at Y=0, origin centered in plan. A product without a 3D model 404s.
- **Data endpoint** (measurements, product name) needs a browser bearer token and returns 401
  server-side. Not used; the GLB bounding box is accurate enough.
- **Article id:** from a product URL `…-s<digits>/` (e.g. `…-s59511278/` → `59511278`). Each
  color/variant is a different article.
- **IKEA app share links** (`https://applink.ikea.com/<token>--<article>--<cc>--<lang>`) don't
  redirect server-side, but the article sits in the link itself (Proven once, 2026-09-26:
  `…--40586508--fr--fr` → STOCKHOLM 2025 TV bench, 1788 × 562 × 432 mm). IKEA search pages
  don't give the product name to curl or WebFetch, so ask the owner for it.

## Delivery: on the fly through a CORS proxy (owner decision)

**Models are never bundled** in the repo or APK. The static GLB host **origin-allowlists**: no
Origin (server-side curl) → 200, `Origin: https://www.ikea.com` → 200, any other Origin → **403**. A
browser can't suppress Origin, and `no-cors` gives an opaque response the loader can't use. So the
app loads `${VITE_IKEA_PROXY}/<article>` from a **Cloudflare Worker** (`tools/ikea-proxy/`) that
fetches server-side and re-serves with CORS.

- The Worker is deliberately narrow: only a bare article id (6+ digits), only the fixed rotera URL,
  CORS echoed only to `ALLOWED_ORIGINS` (LAN dev IP + Pages origin).
- It runs on the owner's Cloudflare account. **Don't redeploy it** unless editing `worker.js`.
- `VITE_IKEA_PROXY` comes from the gitignored `.env` locally (template `.env.example`) and is set
  in `.github/workflows/deploy.yml` for the Pages/APK build (not a secret).
- With no proxy configured or a failed fetch, the app shows a **dimensioned placeholder box** at the
  catalog size.
- **Licensing:** the Worker transiently relays IKEA bytes for personal preview. Don't make it
  public, host a model library, or commit IKEA GLBs.
- The Draco **decoder** (`public/draco/`, three.js code) is bundled; that's fine.
- GLBs are cached on the device with the Cache API (`house-cad:furniture:v1`) for offline reuse.

## Catalog tool

`tools/fetch-ikea-model.mjs` **registers** an article in `public/furniture/index.json`
(`{name, article, sizeMm [w,h,d], source, registeredAt}`); it keeps no GLB. It fetches the bytes
transiently to confirm the model exists and measure its bounding box (read from the glTF POSITION
min/max without decoding Draco), then discards them. Flags: `--lang=fr/fr`, `--force`.

```bash
node tools/fetch-ikea-model.mjs 59511278=jattebo-green
node tools/fetch-ikea-model.mjs https://www.ikea.com/fr/fr/p/...-s59511278/
```

## Procedural furniture (products with no IKEA model)

How to make one (sources, photos, preview loop): `docs/product-modelling.md`.

Discontinued ranges have no rotera model (Proven 2026-09-26: STOCKHOLM bed frames 402.846.00,
202.846.01, 002.846.02, 302.846.05, 902.846.07 and the S-combos S590.142.03, S990.142.01,
S090.142.05, S490.142.08, S090.142.10 all 404 on fr/fr, gb/en and us/en). For these, a catalog entry
carries `procedural: <kind>` (plus optional `params`) and a non-numeric key, and
`src/ui/proceduralFurniture.js` builds it from simple solids at `sizeMm`, with canvas textures
(stained wood grain, quilted leather, mattress fabric). It follows the GLB convention (metres, Y up,
floor at 0, centred, front +Z), so FURNISH and View 3D treat it like a downloaded model; both loaders
await the catalog first so a procedural key never reaches the proxy. Entries are added to
`index.json` by hand (the fetch tool only registers rotera models).

**Storage (owner decision, 2026-09-26): code only, no GLB.** The builder plus the catalog entry is the
stored form; an exported GLB would be a second copy that drifts. (Measured for reference: the bed
exports to a 204 KB uncompressed GLB, 14 meshes, 1,624 triangles.) A model that can't be expressed
as code (hand-modelled, photo-to-3D) would go in `public/furniture/models/<key>.glb`, which is
not in the Workbox precache and would ride the furniture Cache API; not built yet.

- `stockholm-bed-160x200`: IKEA STOCKHOLM bed frame 590.142.03, 1720 × 920 × 2230 mm, 35 cm at the
  foot (size from an ikea-club listing). Shape from IKEA's assembly drawing AA-809121 and sale
  photos (leboncoin, Design Plus Gallery): tapered square legs, thick rails, head posts leaning
  back about 8° with two slats, two channel-seamed leather cushions filling the width between the posts, slatted base; mattress optional
  (`params.mattress`), 25 cm thick (`params.mattressHeightMm`, owner choice). The rail height, lean and cushion size are estimates from photos, not
  measurements. Proven in a scratch browser preview (bounding box 1.72 × 0.93 × 2.23 m); not yet
  seen in FURNISH or on device.

## Rendering

- **AR** (`mr.js`): `furnitureGroup` under `planGroup` (rides plan yaw and floor elevation). Plan
  `(x, y)` → group-local `(x, z, -y)`. Emissive hover (yellow) and select (amber) use per-instance
  material clones. Grip-drag is floor-planar; the foot elevation is set on the FURNISH pad.
- **Desktop and shared 3D** (`view3d.js`): renders `floor.furniture` through the same proxy and
  catalog. Shared view links include furniture placements by default (`docs/share-view.md`).

## Traps

- **CORS is the whole reason for the Worker.** A curl test (no Origin) returning 200 is misleading;
  browsers always send Origin.
- **Flat PBR in AR:** the AR scene has direct lights but no environment map, so textures read
  washed out. An env map / IBL is the known fix (not done).
- **The HTTPS dev certificate blocks headless browser checks.** The Quest accepts the self-signed
  cert, but Chrome automation can't pass the interstitial. Use a plain-HTTP Vite config (in the
  scratchpad) for desktop console/render checks.

## Open

- FURNISH authoring (drop/select/move/rotate/delete, foot pad) is AR-unwalked.
- Offline Cache API reuse across a real no-wifi session is unverified.
- Deferred: env-map lighting, snap-to-wall/grid on drop, multi-select.
