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

## Planned: merge the two into one furniture zone (design, not built)

Status: design agreed 2026-09-26 (all three owner decisions below); nothing implemented. Until it lands, the two lanes
above stay distinct.

**Why.** Each lane has what the other lacks. The zone can be dimensioned to walls and prints on
sheets/DXF, but has no 3D. The FURNISH item has the real product in 3D, but no constraints and no
sheet/DXF output. Since FURNISH items draw as flat plan pieces in AR ("Rendering"), the two also
look alike. Proven 2026-09-26 from the owner's house file: 14 furniture zones (9 ground, 5 upper)
and 0 FURNISH items. So the zone is the lane in real use.

**Shape of the merge.** Follow the door/window product pattern: the zone owns placement, and an
optional product draws the 3D.
- A `furniture` zone gains an optional `article` (a catalog key, IKEA or procedural). The zone keeps
  position, constraints, sheets and DXF; the product supplies the 3D model; the zone's `foot` is the
  mounting height (the catalog `mountZMm` seeds it).
- Assigning a product sizes the zone to its footprint (w × d, swapped when turned 90°). Sizing stays
  constraint-first; the owner dimensions its position.
- A `facing` field picks the front side, like a door's hinge field.
- `floor.furniture[]` is retired. On load, existing items migrate to zones, rotation snapped to the
  nearest 90°. Sources that can hold items: saved files, `_demo` seed items, and share links, whose
  compact form carries furniture (`shareView.js`). The owner's house has none (Proven, above).

**Constraints: furniture is solved one-way, after the structure.** Proven 2026-09-26 with a Node run
of the real solver: a 3 m room, and a `furniture` zone 2.0 m wide dimensioned 0.5 m and 0.3 m from
the two walls (2.8 m total). The zone pulled the room's right wall from 3.0 to 2.8 m with no conflict
flag. With the room width also dimensioned, all four dimensions were flagged and the room's left wall
moved 5 cm. So today a furniture dimension can silently move a wall. The merge fixes that:
1. Walls and rooms solve first, from their own dimensions only. Furniture never moves them.
2. Each furniture zone is then placed one-way, like a marker pin. Its position comes from its
   dimensions to walls. Its size comes from the product; with no product, or a `madeToMeasure`
   product, it comes from the owner's dimensions.
3. **An over-specified furniture dimension is deleted, not flagged** (owner, 2026-09-26). Example: a
   product pinned on both sides that doesn't fit the gap. The first dimension (the anchor) stays; the
   one that no longer fits is removed, so no conflicted dimension is ever shown. The deletion should
   say so in the readout, with the miss, so it isn't silent (e.g. "dimension removed: 20 cm short").
   The same rule applies when a product change or a 90° turn makes an existing pair over-specify.

**Owner decisions**
- **Four facing directions only** (owner, 2026-09-26). Zones are axis-aligned, so free rotation is
  dropped; diagonal placement is accepted as lost.
- **FURNISH = drop + assign in one mode** (owner, 2026-09-26). Trigger on a furniture zone assigns
  or cycles its product. Trigger on empty floor drops a new zone already sized to the chosen product.
- **Sheets and DXF print the zone's rectangle plus a front notch** (owner, 2026-09-26): the plain
  footprint as today, and a small V on the front edge so facing reads on paper. No product silhouette.

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
- `daikin-ctxm15a`: Daikin Perfera CTXM15A wall-mounted AC indoor unit (multi-split, 1.5 kW),
  804 × 298 × 252 mm, 11.5 kg (Daikin's CTXM-A spec table). Builder `daikin-wall-unit`: a flat glossy
  front panel, a slanted lower face with the outlet flap and two sensor windows at the right end, and
  an underside curving up to the wall (side profile from Daikin's CTXM-A installer reference guide
  4P518023-17P, pages 23–24; front layout from the clim-split and climamania retailer photos, scaled
  by the 804 mm width). Panel lower edge 73 mm up, flap 65–674 mm from the left, logo 206 mm below the top
  (`params`): photo estimates, not measurements. The catalog's **`mountZMm: 2000`** makes a FURNISH drop
  start with the unit's bottom 2.0 m off the floor (any entry may carry it; default 0). Installation
  rules from the same guide: bottom **≥ 1.8 m** above the floor, **≥ 30 mm** to the ceiling, **≥ 50 mm**
  to a side wall on each side. The builder doesn't check them. Proven in a scratch browser preview (bounding box 0.804 × 0.298 ×
  0.253 m, the extra 1 mm is the logo) and in the real View 3D overview on a wall of the demo house;
  not yet seen in FURNISH or on device.
- `daikin-ftxm60a`: Daikin Perfera FTXM60A wall-mounted AC indoor unit (6 kW), 997 × 298 × 292 mm,
  14.5 kg (Daikin's FTXM-A spec table; the FTXM71A shares the body). Same `daikin-wall-unit` builder
  and installation rules as the CTXM15A. Front layout measured on condizionati.fr's straight front photo
  (gallery image 153627, scaled by the 997 mm width): panel lower edge 49 mm up, flap 88–820 mm from the
  left, sensors centred at 894 and 946 mm (`params.sensorsMm`), logo 216 mm below the top; photo
  estimates, not measurements. Retailer galleries mix generations: enrplus and climaled show a single
  round sensor (Hypothesis: the older FTXM-R body), so they were not used. Proven in a scratch browser preview
  (bounding box 0.997 × 0.298 × 0.293 m); not yet seen in FURNISH or on device.
- `sensea-neo-120x80`: Sensea NEO extra-flat resin shower tray, 120 × 80 cm, white matt (Leroy Merlin
  95043721, series "Neo 2"). 800 × 27 × 1200 mm (`sizeMm` = width × height × length), from the Leroy Merlin
  spec table: 2.7 cm thick, 4 cm rim, grille 21 × 13 cm, 90 mm waste, 36 kg; its manual is Leroy Merlin
  media 5349234. Builder `shower-tray`: one slab whose top relief (millimetres deep) is drawn on the top
  face as colour + bump: a stone speckle, the drain cover (rounded top corners) and the step across the
  width in front of it, thick at the cover and fading out near each side. Layout measured on Leroy
  Merlin's straight top-down photo (media 5368981, 1.17 mm/px): cover 210 × 136 mm, 37 mm from the short
  edge; step 171 mm from that edge, fading 41 mm from each side (`params`); the relief is read from the
  close-ups 5357076 and 5356494. The drain end is the back (−Z); the notch of the plan piece marks the
  open end. Colour: neutral white (`0xf0f0f0`); the render reads 227 grey against 216 in the photo under
  different lighting. Proven in a scratch browser preview (bounding box 0.800 × 0.027 × 1.200 m, top-down
  and perspective views beside the photos); the photo-measured positions are estimates; not yet seen in
  FURNISH, View 3D or on device.

## Rendering

- **AR** (`mr.js`): `furnitureGroup` under `planGroup` (rides plan yaw and floor elevation). Plan
  `(x, y)` → group-local `(x, z, -y)`. Emissive hover (yellow) and select (amber) use per-instance
  material clones. Grip-drag is floor-planar; the foot elevation is set on the FURNISH pad.
  **The models show only with the AR 3D view on (LEFT X)** (owner decision, 2026-09-26: at full
  size they occluded the plan while furnishing). Otherwise each item draws as a flat **plan piece**
  on the floor (`furniturePlanGroup`): its catalog footprint (width × depth) as a violet fill and
  outline, a V notch on the front edge, and a dashed outline when the item is raised (wall-hung,
  like an overhead line on a plan); hover turns it yellow, selection amber. `buildArch3d` swaps the
  two groups' visibility.
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
