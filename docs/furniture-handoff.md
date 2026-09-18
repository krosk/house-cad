# Furniture-in-AR — session handoff

**Read this first, then the memory `ikea-3d-model-pipeline`** (stable architecture lives there;
this file is the live "how do I resume" state). Broader AR context: `.claude/handoff.md`.

**Date:** 2026-09-17
**Status:** M1 + M2 owner-confirmed on device; **M3 (AR authoring) BUILT, build+load-verified,
AR-unwalked.** All furniture work is **UNCOMMITTED** (see Commits). The Cloudflare Worker proxy
is **live** on the owner's account.

## Where things stand in one paragraph

Goal: a **realistic furniture preview in AR** for the renovation tool — place real product models
(starting with IKEA) in the passthrough scene at true scale. IKEA models come from their "rotera"
service; they are authored in **meters at true scale, floor at Y=0**, Draco+WebP, ~100 KB. Decisive
constraint: IKEA's host **origin-allowlists**, so the app cannot fetch the GLB directly — it loads
**on the fly through a Cloudflare Worker CORS proxy** (`tools/ikea-proxy/`, deployed at
`https://ikea-rotera-proxy.krosk.workers.dev`). Models are **never bundled** (owner decision).
Three milestones are done in code: **M1** loads a model on the fly in AR (owner-confirmed on device);
**M2** adds a per-floor `furniture` array + serialize round-trip + on-device Cache-API GLB cache
(owner saw it on device); **M3** adds the **FURNISH** authoring mode (drop/select/move/rotate/delete).
M3 builds and loads without console errors but has **not been walked on the Quest**. Before planning,
read the memory `ikea-3d-model-pipeline`.

## What changed this session
> Next agent: fold live constraints into Standing decisions and delete this list when you add yours.

1. Proved the IKEA "rotera" pipeline end to end (GLB → GLTFLoader+DRACOLoader render at true scale).
2. Built `tools/fetch-ikea-model.mjs` — a **catalog register** tool (confirms a model exists,
   measures its bbox, writes `public/furniture/index.json`; keeps NO GLB).
3. Deployed the Cloudflare Worker proxy (`tools/ikea-proxy/`) to dodge IKEA's CORS 403; verified
   real-browser cross-origin fetch from the Pages origin works.
4. M1: `furnitureGroup` under `planGroup`, DRACO loader (decoder vendored to `public/draco/`),
   on-fly load via `VITE_IKEA_PROXY`. M2: `furniture` model + serialize + Cache-API offline cache.
   M3: `FURNISH` mode (see memory for the full control scheme).
5. Also committed+pushed **`d402702`** (AR conduit segment-delete) — unrelated to furniture.

## Standing decisions

- **Models are NOT bundled; they load on the fly via the Worker proxy.** IKEA origin-allowlists
  (foreign `Origin` → 403), so a static app must proxy. `VITE_IKEA_PROXY` (in gitignored `.env`)
  points at the Worker; empty → the app shows dimensioned placeholder boxes. The Draco *decoder*
  (`public/draco/`, three.js's own code) IS bundled — no licensing issue there.
- **Licensing:** the Worker transiently relays IKEA's bytes for personal preview — fine for this
  tool; do NOT make it public or host a model library. Don't commit IKEA GLBs to the repo.
- **Furniture is a parallel lane like markers** — never touches the footprint/boolean/extrude/
  solver pipeline. `{id, article, x, y, rotationY, name}` on each `Floor`; GLB fetched by article.
- **Mode is `furnish` (label PLACE), deliberately NOT `furniture`** — `furniture` is already a
  massing ZONE kind (`mode.furniture`). Keep them distinct.
- **Deploy gotcha:** `.env` is gitignored, so a CI/Pages build has no `VITE_IKEA_PROXY` and would
  ship the box fallback. Before deploying furniture to Pages/APK, wire the proxy URL into
  `.github/workflows/deploy.yml`'s build env (it is not secret). The dev server reads local `.env`.
- **Git/deploy:** commit+push only on `main`, only when asked; every push publishes to Pages.

## Findings / traps worth knowing

- **CORS is the whole reason for the Worker.** `curl` (no Origin) → 200 misleads; a browser always
  sends Origin → 403. Only `*.ikea.com` origins are allowed upstream.
- **Furniture renders in AR only.** No desktop `View3D` parity yet — don't expect it on desktop.
- **Flat texturing:** the AR scene has direct lights but no environment map, so PBR reads washed
  out (owner noticed on M1). Env map is the fix.
- **HTTPS dev cert blocks headless checks:** the Quest walks `https://…:5174/?ar=1` fine, but Chrome
  automation can't get past the self-signed interstitial — use a plain-HTTP Vite (temp config in
  scratchpad) for desktop console/render checks.

## Commits

- **`d402702`** — AR conduit segment-delete (grip a segment to delete; visible hover). Pushed to
  `origin/main`. *Not* part of the furniture effort.
- **Furniture M1–M3: UNCOMMITTED.** Tracked: `.gitignore`, `src/core/i18n.js`, `src/core/model.js`,
  `src/io/serialize.js`, `src/ui/mr.js`. Untracked: `tools/` (fetch script + `ikea-proxy/`),
  `public/draco/`, `public/furniture/index.json`, `.env.example`. (`.env` is gitignored.)

## Resuming from a clean checkout

```bash
npm install                                          # once
npm run dev -- --host --port 5174 --strictPort       # https; Quest walks https://<LAN>:5174/?ar=1
npm run build                                         # the only automated check — expect "✓ built in …"
node tools/fetch-ikea-model.mjs <ikea-url>=name       # add furniture to the catalog
```
Node v20 + node_modules present. `.env` already holds `VITE_IKEA_PROXY`. Worker already deployed
(don't redeploy unless editing `tools/ikea-proxy/worker.js`; `ALLOWED_ORIGINS` there lists the LAN
dev IP + Pages origin). Serialize round-trip has a node check in scratchpad if needed.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/ui/mr.js` | AR: `furnitureGroup`, loader+Cache-API, `buildFurniture`, `FURNISH` mode (drop/select/move/rotate/delete) |
| `src/core/model.js` | `furniture` array on Floor + `add/move/rotate/removeFurniture` + id counter |
| `src/io/serialize.js` | furniture round-trip (skips `_demo`), id-counter sync, floor-paste carry |
| `src/core/i18n.js` | `group.furnish`, `mode.furnish`, `help.furnish`, `furnish.*` (en/fr/zh) |
| `tools/fetch-ikea-model.mjs` | catalog register tool (writes `public/furniture/index.json`, keeps no GLB) |
| `tools/ikea-proxy/` | Cloudflare Worker (`worker.js`, `wrangler.toml`, `README.md`) |
| `public/furniture/index.json` | the catalog (article → name, sizeMm) the FURNISH picker reads |
| `public/draco/` | vendored three.js Draco decoder (bundled; runtime GLB decode) |
| `.env` / `.env.example` | `VITE_IKEA_PROXY` (gitignored / template) |

## Next step

- **A — Walk M3 on the Quest.** The authoring is unproven on device: drop/select/move/rotate
  (15°/tick)/delete feel, reticle pick tolerance (`furnitureAtFloorPoint` uses `RETICLE_OUTER`),
  grip-drag depth, and whether the emissive hover/select highlight reads through passthrough.
- **B — Env-map lighting.** Quick; fixes the flat PBR texturing the owner flagged. Add an
  environment map (or IBL) to the shared View3D scene used in AR.
- **C — Desktop `View3D` parity.** Render `floor.furniture` in the desktop 3D view too.
- **D — Deploy wiring + commit.** Wire `VITE_IKEA_PROXY` into `deploy.yml`, then commit the furniture
  work by explicit path and push (publishes). Not yet done — owner hasn't asked to publish.
- Deferred niceties: snap-to-wall/grid on drop, multi-select, more of the catalog.

## Known open questions

- **M3 is AR-unwalked** — every interaction is build+load-verified only; no runtime XR proof.
- **On-device offline cache** (Cache-API) unverified across a real reload / no-wifi session.
- **Deploy path** for furniture (Pages/APK) untested — the `VITE_IKEA_PROXY`-in-CI gotcha above is a
  hypothesis until a build is actually deployed and checked.
