# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc: live state only. Stable detail lives in the
repo docs (project knowledge is repo-only; rule in `CLAUDE.md`, "Where project knowledge lives"):

| Doc | What it holds |
|---|---|
| `CLAUDE.md` | **Top rule: label every claim Proven/Hypothesis.** Core architecture, desktop 3D viewer, sheets/DXF/change map, build, git + commit-body rules |
| `docs/product-intent.md` | **Why** the AR tool exists: tape-measure survey, drift/RECAL, multi-floor decisions, Guardian |
| `docs/ar-survey.md` | **How** the AR tool works: every mode (incl. PROJECT · PERF), HUD lines, **performance rules**, durable traps |
| `docs/ar-qa-checklist.md` | What has actually been walked on the Quest (mostly stale — see Open questions) |
| `docs/electrical-workflow.md` | Conduit / wire / control-link lanes, derived circuits, owner decisions |
| `docs/plumbing-workflow.md` | The pipe lane (first slice) and what's deferred |
| `docs/furniture.md` | IKEA GLB pipeline, CORS proxy, furniture zones + products (the merge), procedural furniture (products with no IKEA model: bed, Daikin units, shower tray, piano, **towel and panel radiators**) |
| `docs/product-modelling.md` | How to model a product with no 3D model from specs/drawings/photos (incl. per-retailer photo access; **step 7: a photo finish for View 3D Realistic**); run by the `/model-product` skill |
| `docs/realism.md` | View 3D **Realistic** setting (sun, downloaded sky, AO) and **photo finishes** (Charme, Monastère); owner rule on runtime-downloaded images |
| `docs/share-view.md` | View-only share links, `link`/`qr` export, read-only viewer; **parked**: Quest-to-TV live mirror + Steam Deck big-screen viewer (options worked out, not built) |
| `docs/markers-plan.md` | Marker lane design + roadmap |
| `docs/materials.md` | Surface finishes, flooring/tile/mosaic/octagon (**diagonal**)/terrazzo/pinwheel/**stepped random (Monastère)**/**stone wall tile (Lucia)** products, **pattern start corner + 90° turn**, **grout weight**, the View 3D **detail layer**, reflections, door (**drawn open in both 3D views**; **rail-hung sliding door**), window (Héméra window + porte-fenêtre, **Néva sliding bay**), switch, outlet and Ethernet products, doorway kinds (incl. **PASSAGE**): owner decisions, continuity rule, takeoff method + limits, phases |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-10-03 (session 38)
**Status:** Proven (git): `origin/main` = `6854420` plus this handoff's commit, nothing unpushed; the
tree is clean apart from the owner's untracked `Document from Alexis He.json`. Proven (the owner's
PERF report header, 2026-10-03): the Quest ran `d00be61`, so session 37's AR changes are live there.
Session 38's work (share links, View 3D Realistic, photo finishes) is pushed but not yet seen by the
owner on any device.
Owner-confirmed on the Quest: AR performance (session 29), the MATERIAL flow, the 3D-only AR view,
FURNISH's removal (session 32), the floor pattern **start corner** (session 33), and in session 37 the
PERF clipboard report (two reports pasted) and an AR 3D view frame rate the owner accepts (50–80 fps on
Ground with 33 device products). Everything else from sessions 30–37 is verified by build, Node or a
scratch/desktop browser only (Next step A).

## What the app is today (the gist, no code needed)

**One app, three surfaces**, all from the same static Vite build at
**https://krosk.github.io/house-cad/** (also a sideloaded Quest 3 APK, `com.krosk.housecad`, that
boots straight into passthrough AR):

1. **Desktop/mobile 2D plan editor.** Draw axis-aligned rectangles tagged **add** (room space) or
   **subtract** (wall, door, **passage** (open doorway), window, garage door, half wall, heater,
   sliding door, insulation, stairs up/down, cabinet, **furniture** (can carry a real product)). Exact sizes come only from **dimension
   constraints** (a 2× 1-D least-squares solver). Multi-storey: independent plans stacked on a shared
   origin. Outputs: to-scale print/SVG/PNG sheets per floor (monochrome, optional change-map revision
   clouds vs a saved slot), DXF + a simplified Coohom DXF, STL/OBJ/GLB mesh, JSON save.
2. **Desktop/mobile 3D viewer (`◈ View 3D`).** An **architectural** reading of the plan
   (`src/core/architectural3d.js`): room floor slabs, an inferred 12 cm outer wall shell, WALL and
   INSULATION zones as solids, doors and windows cut from their sill/head (door leaves drawn open), procedural stairs, 8 cm
   marker faceplates, IKEA furniture, light markers that light the room, and **textured surface
   finishes**. One floor at a time: a top-down overview (pinch/wheel zoom; a wide house turns 90° on a
   portrait phone) ↔ tap a room for a 1.65 m POV (tap a floor to walk there, Overview button to leave,
   opt-in phone tilt look). Rules in `CLAUDE.md`. **Mesh exports still use the legacy extrusion.**
   An opt-in **◑ Realistic** setting adds the real sun for a time of day (north = plan up), a
   downloaded sky, ambient occlusion, and the retailer's own photos on the Charme oak and Monastère
   floors (`docs/realism.md`).
3. **AR survey tool on the Quest** (`src/ui/mr.js`, the only authoring surface on the device).
   Register the house to a real corner, then author at 1:1 with a tape measure: rooms/walls/edges,
   dimensions via a 3D numpad, markers, heights, electrical conduit + wires (electrical or Ethernet)
   with circuit diagnostics, a plumbing pipe network, **surface materials and door, window,
   furniture, switch, outlet and Ethernet products** (all in the MATERIAL group), a **HEATING** group (pipes, room heat loss in W, insulation R
   / window U), save/load in 6
   slots, export (sheets, DXF, JSON, view link, QR), and an **AR 3D view on LEFT X** that hides every
   plan overlay while on. Mode list: `docs/ar-survey.md`.

**Sharing:** `🔗 Share view` (desktop) or the AR `link`/`qr` export opens a **read-only** session.
Detail: `docs/share-view.md`.

**The goal (unchanged):** Phase 5 — an on-site MR survey tool, multi-storey, authored entirely in AR.
Read `docs/product-intent.md` before planning AR work.

## What changed in session 38

> Next agent: when you add your own section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete this list. Session 37 is folded into "Standing decisions" and
> "Findings" (its unwalked items stay in Next step A).

All owner requests, 2026-10-03.
1. **Share links** (`c00e97b`, `4c819aa`): a link (desktop Share view and AR EXPORT · LINK) now always
   carries furniture products, **surface finishes** (floors, walls, door and window products: floor
   slot 5 + top-level `m`/`cm`) and **markers**; QR always leaves markers out to fit. The owner's link
   showed no Héméra windows and no furniture: the AR link followed the sheet FURNITURE layer (off by
   default) and links carried no finishes. Proven in Node on the owner's file: 28 finishes round-trip,
   8 windows + 6 doors restored, link 3 993 chars (2 205 without markers). Not yet opened as a real
   link by the owner.
2. **URL copy failure** (`fec23b8`, `4c819aa`): the owner hit `URL COPY FAILED (NotAllowedError)` on a
   path identical to the working PERF copy. The flash now names the cause: `not ready, retry`,
   `build: …`, `no clipboard`, or the error with `a0/a1` (activation), `f0/f1` (focus) and the size.
   **Cause still unknown**; the owner said "never mind" and was sent a link built in Node instead.
3. **View 3D Realistic** (`f8e1f35`, `src/ui/realism.js`): per-device toggle + time slider; sun from a
   solar ephemeris for Val-de-Marne (Proven against Paris tables), shadows fitted to the shown floors,
   window panes let the sun through; Poly Haven CC0 sky HDRI downloaded at runtime (its photographed sun
   clamped out, the lighting copy desaturated: the raw sky turned rooms blue); GTAO through an
   EffectComposer; pixel ratio capped at 1.5. Proven in Chrome on this Deck (demo house). **Frame rate
   never measured** (hidden tab).
4. **Photo finishes** (`ade036e`, `71208e4`, `src/ui/photoFinishes.js`), Realistic only: the Charme oak
   from Leroy Merlin photo 799228 (11 whole planks laid by a shader, no repeat) and Monastère from its
   three single-tile photos (stepped lattice in the shader, real wavy edges, grout baked in the atlas).
   Owner asked whether a photo shows a repeat: tiling it did, hence the piece-by-piece layout.
5. **Process recorded** (`6854420`): `docs/product-modelling.md` step 7 + the `model-product` skill step
   for photo finishes; `tools/photo-measure.mjs` (rows / joints / bbox from a photo via ffmpeg) and
   `tools/check-share-link.mjs <house.json>` (what a house loses in a link). Both run and reproduce this
   session's numbers.
6. Answered, no code: the Lucia ivory 30×90 wall tile is already in the catalog.

## Standing decisions (live constraints; the "why" is in the docs above)

- **Label every claim Proven or Hypothesis** (`CLAUDE.md` top rule), in reports, commit bodies, docs.
- **Session 36 features (folded):** the AR group **HEATING** = PIPE (id `marker_pipe`) + HEAT LOSS +
  R / U (`docs/heat-loss.md`: simplified EN 12831, settings are project data, openings store U);
  stairs hold only their own steps from their floor at an 18 cm riser (going 25 cm, a Hypothesis);
  CONDUIT · EDIT `LENGTH` / `RUN`; ACOVA and De'Longhi radiators and the JOYFURNOS bin as procedural
  furniture (`docs/furniture.md`). Stairs stay circulation, not rooms, in heat loss (owner: "No need
  yet" to merge them).
- **Session 37 features (folded):** PLAN · EDIT FOOT/TOP move a furniture product as a unit; PROJECT ·
  PERF sweeps the AR 3D view's layers and the stop trigger copies a full report (ask the owner to paste
  it). The plan possibly drawn under the AR 3D view is parked (Next step D′).
- **AR 3D view geometry budget** (session 37): products are merged per material
  (`mergeByMaterial.js`), so **a product material must be cached per entry** (not created per call)
  to merge across items; device products are built at `detail: 'low'` in AR (a new design must use
  `D.dirs` / `D.slope` / `D.collar` / `segs()`); AR furniture is Lambert. Desktop is untouched.
- **Git:** commit + push directly on `main`, only when asked. **Every push publishes** (Pages
  auto-deploy). Non-trivial commits need a **descriptive body**. Stage by explicit path, never
  `git add -A`.
- **Project knowledge is repo-only.** Design docs, decisions, and traps go in `docs/`; never
  agent-private memory.
- **AR overlays are batched, never one Mesh/Sprite per item.** Reuse the patterns in `docs/ar-survey.md`
  → "Performance notes". **Measure with PROJECT · PERF before optimising**; reading the code
  guessed wrong once already (floor fills looked like the suspect; markers were the cost).
- **Axis-aligned rectangles only** for Phase 5; exact size only from dimension constraints.
- **Drift = RECAL + tape; no per-room anchors, no Quest room scan.** → `docs/product-intent.md`
- **Heights are floor-referenced only**; Z is not in the solver. → `docs/ar-survey.md`
- **Every marker is an 8 cm × 8 cm fixture** (owner spec) unless it carries a switch/outlet product;
  3D placement is presentation-only.
- **Exports stay on the legacy extrusion** until the architectural 3D model is visually accepted.
- **Markers, conduit, wires, pipes, furniture are parallel lanes**, never in the solver/footprint
  pipeline; circuits are derived, never stored, not in any output. → the workflow docs
- **Sheets are monochrome**; conduit/wires/pipes never print; DXF `wiring` layer is opt-in.
- **AR input model:** thumbstick-x = mode, thumbstick-y = cycle, A/X = flip, B/Y = delete (undo in
  `MARKER · CONDUIT`), grip = non-destructive, trigger = commit. RIGHT edits; LEFT is a companion.
- **Shared views are read-only.**
- **This machine is a Steam Deck** (Node v20 via nvm); the fnm/PowerShell block in `CLAUDE.md` is
  Windows-only.
- **Circuits are derived per wire nature**; Ethernet never counts toward breakers. CHECK flags only
  `needsPower` devices (outlet*/switch/light), and never flags spare breakers (owner choices).
- **A double switch is one `switch_dual` marker** with per-rocker links (owner, 2026-09-28) and
  **per-rocker wire ends** (2026-09-29: each rocker may be its own circuit); rockers read **left/right**
  in the UI (1 = left facing the switch), storage keeps 1/2. Older two-marker pairs still load and work,
  and A/X in MARKER · EDIT merges one (never on retype). Wires drawn before session 35 sit on the left
  rocker; the owner moves them with A/X on the wire in MARKER · WIRE. Never draw stacked markers apart in AR; an
  amber count badge shows the overlap (owner's choice).
- **One grip cycle for every picking mode** (`gripCycle`, owner 2026-09-29): sticky target, grip steps
  a fixed ring, `i/n` shown when 2+ targets. A new picking mode should use it, not its own distance sort
  (a distance-sorted "next after" jumps with the hand).
- **Every stored length is on a 0.1 mm grid** (`CLAUDE.md` "Units"): a new stored length field must
  be added to `Project._snapToGrid`; `===` on stored coordinates is then safe.
- **Materials** (`docs/materials.md`):
  - Monastère is laid **stepped random** (owner, 2026-09-29), not pinwheel; the pinwheel code stays,
    unused by the catalog;
  - patterns are anchored at the plan origin (a stepped pattern: centred in its region), unless a laying region sets its own **start corner**
    (A/X near a corner; one per region so joints stay continuous through doorways) or a **90° turn**
    (A/X away from corners); floors only, walls keep the plan origin;
  - grout weight is shown per room only (owner); no waste margin; ρ 1.6 is generic, not a product;
  - same-material rooms joined by a doorway are one region; different materials meet mid-doorway;
  - packs are rounded once per product for the whole house;
  - wall faces are set one at a time: the owner removed a copy-to-every-wall action, so don't re-add it.
- **Products with no manufacturer model are code, never stored GLBs** (owner decision): a
  `procedural` furniture builder or a door `design`. A non-code model would go in
  `public/furniture/models/` (not built). Follow `docs/product-modelling.md` / `/model-product`.
- **A door product is a material of its DOOR zone** (owner decision), authored in MATERIAL · DOOR;
  made-to-measure products take the zone's size. A **rail-hung** product (`mount: 'rail'`) goes on a
  **SLIDING** zone instead, at its own fixed leaf size (zone = opening, swing = rail face, hinge =
  slide side). **Window products follow the same rule** (WINDOW zone, MATERIAL · WINDOW); a product
  with its own `leaves` ignores the zone hinge. Portes-fenêtres and bays go on WINDOW zones with sill 0
  (owner).
- **Every product generator embeds its source material** (owner, 2026-09-28): a `// Sources:` block
  with page URLs, spec values, photo/PDF ids and what each gave, and the estimates. Ids, never copies.
- **Switch, outlet and Ethernet products are a material category on the marker** (owner, 2026-09-27):
  stored as `marker.product` (not a finish, carried by view links), switch products on switches,
  outlet products on `outlet` / `outlet_appliance`, Ethernet products on `ethernet` only (not
  `ethernet_dual` / `camera_ethernet`). **Model only the visible parts** (plate, rocker, socket), never the in-wall
  mechanism. A `switch_dual` takes only a two-rocker product; on an old two-marker pair a multi-rocker
  product is set on the whole stack and drawn once. Where targets overlap, **grip cycles them before
  the trigger selects** (owner).
- **Catalog entries for the owner's real products replace generic placeholders** when the owner says
  so (`octagon_200` removed for Etruria). A saved finish naming a removed id shows as no material:
  every `materialById` caller handles null.
- **Images: downloaded at runtime and cached, never committed** (owner, 2026-10-03, amending "code
  only"). Procedural code stays the stored form and what AR, normal View 3D and offline use; the
  retailer's photo (or a CC0 Poly Haven asset) may replace it in View 3D **Realistic** only
  (`src/ui/photoFinishes.js`, `docs/product-modelling.md` step 7). Photos used while modelling stay in
  the scratchpad.
- **North is plan up (+y)**; the site is Val-de-Marne 48.79° N 2.45° E (`SITE` in `realism.js`). The
  owner views the desktop on a Steam Deck and an iPhone 14.
- **Share links carry everything View 3D draws** (owner, 2026-10-03): furniture, finishes and markers,
  regardless of the AR sheet layers; QR without markers. What a link still drops (constraints, control
  links, conduits/wires, pipes, heat settings, R/U): `node tools/check-share-link.mjs <house.json>`.
- **View 3D reflections are on demand, per device** (owner: some devices struggle): off by default,
  `localStorage`, never in project/share data, and **cleared for AR sessions** (Quest cost). AR
  reflections were asked about, not built: `docs/materials.md` lists what they would need.
- **AR furniture models show only with the AR 3D view on**; otherwise flat plan pieces (owner, 2026-09-27).
- **The AR 3D view (LEFT X) shows only the 3D model** (owner, 2026-09-27): plan overlays are hidden
  for the render only (`hideForArch3d` / `view.onXRAfterRender`), so modes' visibility logic is
  untouched; reticle, HUD and panels stay. It draws a **white ceiling** and **opaque exterior-picture
  glass** (owner, 2026-09-27); the real floor still shows. Desktop View 3D keeps transparent glass.
- **MATERIAL · FLOOR A/X** = start corner (near a corner) or 90° turn (elsewhere); the thumbstick stays
  the material cycle. A/X is the flip/turn button in every mode.
- **An applied material is a centre badge on the AR plan, never a coloured fill/strip** (owner, 2026-09-27).
- **PASSAGE** (owner, 2026-09-27): an open doorway between two rooms; floors meet at its middle like
  a door; no leaf, nothing to rotate.
- **The controller readout holds up to 6 lines** (tighter pitch past 4); a mode that needs more must
  condense, as the mixed-format house line does (`HOUSE 8 · 4 · 2 packs`). Pills **widen** to fit up to
  `LABEL_MAX_W` (576 px) before the font shrinks (owner, 2026-09-30); no marquee (per-frame uploads).
- **Doors are drawn open in both View 3D and the AR 3D view** (owner, 2026-09-27; AR was closed
  until then). `main.js` and `mr.js` both pass `openDoors` / `open`.
- **A mixed-format product counts and boxes each size separately** (each is its own article): `pack:
  { formats: { '50×50': 5, … } }`; the house box total appears only when every size's box is known.
  No wastage margin and no offcut reuse (the owner was asked; unanswered). The desktop has no
  quantity view yet.
- **Furniture merge** (owner, 2026-09-26/27, `docs/furniture.md`):
  - four facing directions only;
  - the product is picked in MATERIAL · FURNITURE (owner, 2026-09-27); a furniture zone is drawn in
    PLAN · ADD. ~~FURNISH (drop a pre-sized zone)~~ was removed: the owner said it overlaps;
  - sheets/DXF print the rectangle plus a front notch;
  - furniture solves one-way after the structure;
  - an over-specified furniture dimension is **deleted, never shown as a conflict**.
- **LEFT controller:** trigger = teleport, grip = hold-to-view sheet (**material card in MATERIAL
  modes**), stick-x = rotate plan, stick-y = storey teleport (ALL FLOORS), **X = AR 3D view**. Y and the
  stick click are free.
- **Heat loss stays simple** (owner, session 36): simplified EN 12831 chosen over W/m³; **exterior
  insulation is drawn as INSULATION zones outside the room** (within 0.6 m of the edge), linings inside;
  every setting configurable in AR. Owner's house: basement unheated and staying uninsulated (stair
  door closed), Ground part on an earth slab, flat ceilings under a ~1 m attic (blown rock wool
  planned), VMC, Val-de-Marne at 43 m. Limits kept on purpose (one indoor temperature, stairs not
  counted, attic = outside): `docs/heat-loss.md`. Stairs stay circulation, not rooms (owner declined
  merging them into rooms for now; their own walls are not counted).
- **Radiators are furniture products** (session 36): a FURNITURE zone against the wall, picked in
  MATERIAL · FURNITURE; the catalog `mountZMm` sets the height. They are not tied to the `radiator`
  marker or the HEATER zone kind (no link was asked for).
- **FLOOR changes only the ground height** (owner, 2026-09-30): it keeps the teleport and the plan's
  world yaw; only ORIGIN/RECAL re-register.

## Findings / traps worth knowing

- **A photo finish must never be tiled**: a tiled photo repeats every few metres and its wrap seams
  stair-step; cut it into pieces laid by the shader. **Joints/grooves must come from the texture**, not a
  shader branch, or they alias into dashes (both seen in screenshots, session 38).
- **When Chrome reports the automation tab `hidden`**, rAF stops: fps counts read ~0 and screenshots
  can time out. Drive the page with `javascript_tool`; get fps from the owner.
- **Clipboard writes in AR need a user gesture and almost no work before them.** EXPORT LINK and the
  PERF report both build their text beforehand and call `writeText` first thing in the trigger's XR
  `select` handler. The first PERF version built its report inside the trigger and the Quest refused
  it (`PERF COPY FAILED`); prebuilding fixed it (Proven: the owner pasted the reports). The owner
  rejected a download fallback.
- **The Quest browser has no GPU timer:** PERF's source reads `frame` (Proven, owner's reports), so
  per-layer ms are frame-interval differences and noisy. Per-layer **calls and triangles are exact**:
  calls = meshes × materials × 2 eyes (no multiview). Ask the owner to paste the report (stop trigger)
  rather than read the HUD.
- **AR frame rate swings with the headset's state:** identical content ran at 23 fps then 82 fps
  minutes apart with js 0.6 ms and render 2.7 ms (Proven, two reports). Compare runs only back to back.

- **`mr.js` does NOT subscribe to `project.onChange`.** AR model changes must call the rebuild by hand
  (`buildPlan()`, `buildConduits()`, `buildRoutedWires()`, …). Wire picking deliberately uses the legs
  cached by the last `buildRoutedWires` (it picks what is drawn).
- **Every planGroup overlay group must be in `PLAN_OVERLAY_GROUPS`** (`mr.js`), or the first
  `buildPlan` silently detaches it. That already hid four layers for several sessions.
- **Wall faces follow the finished surface, not the room rect edge** (`edgeFace` in `flooring.js`):
  - wall/insulation linings over the room edge inset the face (the owner's house has 18–21 cm linings);
  - edges onto stairwells are open;
  - a half wall in the wall line cuts the face above its sill; one standing inside a room cuts nothing
    (session 31 fix; `docs/materials.md`).
- **AR code runs only inside the XR closure.** Verify it in Node by slicing the verbatim functions out
  of `mr.js` into a harness with stubs (the scratchpad pattern used all session), or replaying model
  bookkeeping against `Project`. Say which you did.
- **The APK always opens `/house-cad/?ar=1`**, so URL switches (`?perf`, `#view=`) can't reach it.
  AR diagnostics need an in-menu toggle. It has no 2D view (exit = quit), but it shares
  `localStorage` with the Quest Browser, so the 2D page is the on-device import/export path.
- **Reading the headset's live state without touching it:** `adb forward tcp:9333
  localabstract:chrome_devtools_remote`, list pages at `http://127.0.0.1:9333/json/list`, then run a
  CDP `Runtime.evaluate` over the page's WebSocket (Node 20 needs `--experimental-websocket`). Use it
  **read-only** unless the owner explicitly asks for a write; their slots/autosave are the real survey.
- **Never run `adb shell pm clear com.krosk.housecad`** casually: it wipes the owner's autosave and
  save slots too. To pick up a new build, relaunch the APK and check the HUD `update:` line.
  adb is at `~/Android/Sdk/platform-tools/adb`; the headset has been connected over wireless adb.
- **Retailer pages fight scripts:** Leroy Merlin = DataDome (Chrome only), Lapeyre = Akamai (exact
  curl headers), leboncoin rejects Node's fetch (curl passes). `tools/product-images.mjs` encodes all
  of it; a new site starts in its generic mode. Look at every gallery image, not just the first.
- **Chrome tools:** screenshots of a WebGL preview tab time out (every time in sessions 33–34, even on
  plain pages). Instead the scratch page POSTs `canvas.toDataURL()` to a tiny local receiver on :5191
  (a ~20-line Python `http.server` that base64-decodes the body to a file; rewrite it in the new
  scratchpad), and ffmpeg builds side-by-side comparisons with the photos. For a texture, sampling
  pixels with `getImageData` in the tab is enough to prove layout. The javascript tool returns a bare
  async IIFE as `{}` (prefix `await`) and blocks output containing a query string. Stop
  scratch Vite servers by port (`ss -ltnp | grep :5190`), not `pkill -f` (it kills its own shell).
- **Scratch previews of AR UI code** (session 35 pattern): a Vite config in the scratchpad (`root` = the
  scratch dir, `resolve.alias.three` → the project's `node_modules/three`, `server.fs.allow` both dirs,
  plain HTTP on :5190) lets a page import `/@fs/…/src/ui/*.js` directly, e.g. `materialCard.js` with real
  finish textures and product builders, then POST the canvas to the :5191 receiver.
- **HUD panels live in three's transparent pass** (order 90 sheet/card, 100 HUD, 110 pointer): world
  overlays ignore depth and draw in that pass too. An opaque panel would be drawn first and painted
  over; an opaque model on a transparent panel is painted over by the panel. The material card clones
  its model's materials as transparent (never mutate shared product/AR 3D materials).
- **`placeAt` is a fresh registration**: it resets `navOffset`, `navLift` and `anchorYaw`. Anything that
  only re-anchors (FLOOR) goes through `regroundAt`.
- **Measuring text width without a browser:** Node has no canvas; read glyph advances from
  `/usr/share/fonts/noto/NotoSans-Bold.ttf` or DejaVu Sans Bold (a ~40-line Python `cmap`/`hmtx` parser,
  no fontTools here). A per-character average is not good enough (not monospace).
- **Browser checks of the app:** Chrome shows an error page for the dev server's self-signed HTTPS, so
  serve `dist/` over plain HTTP (e.g. `python3 -m http.server 5192 -d dist`). The window can't be
  resized here: load the app in a 390 × 844 iframe for phone width. The app's service worker then
  serves the old build ("UPDATE AVAILABLE"): unregister it and clear `caches` in that origin. Synthetic
  `PointerEvent`s work for taps and pinches; the view's first `frameModel` runs a frame later and can
  reset a gesture sent too early.
- **The owner's house JSON never goes into a served folder or browser** (the auto-mode classifier
  blocked copying it into `dist/`). Use it in Node only; inject a synthetic house into
  `localStorage['house-cad:autosave:v1']` for browser checks.
- **Check a texture up close against the full-resolution photo**, not only after shrinking the photo to
  the texture's scale: that hid the 2048 px limit until the owner zoomed in. The detail layer is the fix;
  a bigger canvas is too heavy for the Quest (`docs/materials.md` "Detail layer").
- **Joybuy** (`joybuy.fr`): the short `m.joybuy.fr/dp/<id>` link and any curl land on a login page
  (never log in); the full product link opens in Chrome. No spec table: sizes are in a gallery
  dimension drawing. Gallery = the `s128x128_` thumbnail strip (protocol-relative URLs).
- **Leroy Merlin search:** type into the site's search box (it lands on `/search?q=…`); a guessed
  `/recherche=…` URL is a 404. A "Verifying the device" page can appear first and passes by itself
  after a few seconds (never solve a CAPTCHA). Variants of a range can differ in more than size: the
  60 × 200 EASY exists slotted (82273211) and flat-fronted (82273207), so check the photo, and use a
  power/weight ratio to spot the true sibling.
- **Retailer marketing photos can be edited:** the EASY 60 × 200 room photo shows 18 slots at the 50 cm
  photo's exact pixel pitch (a widened copy); its studio render shows 17. Count on a studio render or a
  straight photo whose scale matches the body's known size.
- **Leroy Merlin sibling articles** (other sizes of a range) aren't linked from the page. Their refs sit
  near each other: `HEAD` the same URL slug with neighbouring refs from inside the Chrome tab (found the
  Monastère 30×50, 72831311, that way).
- **The owner's house view link with markers and finishes (~4.0k chars) doesn't fit a QR** (about
  2 950); share the text `link` instead, which is why QR now drops markers.
- **Héméra two-leaf windows** come from the zone's hinge (`both`), not a separate product. The window
  page URL is only in an old transcript (`https://www.lapeyre.fr/produits/fenetre-pvc-blanc-hemera-sur-mesure-FPC5837268`,
  unverified).
- **Deploy check:** `curl -s https://krosk.github.io/house-cad/version.json` (the commit it serves).
  The unauthenticated Actions API rate-limits quickly, and there is no `gh` CLI here.
- **Splitting mixed hunks into separate commits:** `git apply --cached --unidiff-zero` misplaces pure
  insertions (one landed at the end of a file). `git stash --keep-index` + `pop` then merged the bad
  staged copy back into the working file as a duplicate. Build the staged file as a blob instead
  (`git hash-object -w` + `git update-index --cacheinfo`), and diff the result before committing.
- **Injecting a test house into `localStorage` right after the page's first load gets overwritten** by
  the pending autosave of the seeded demo house. Wait a few seconds after the first load, then write
  the key, then reload.
- **A furniture zone's `article` is the catalog KEY**, not the entry's `article` field (the NEO tray's
  key is `sensea-neo-120x80`, its `article` a Leroy Merlin number).
- **The furniture catalog is fetched** (`src/ui/furnitureCatalog.js`), so core code can't size a zone
  from it synchronously: `productMm` snapshots the size, and `applyFurnitureCatalog` sizes migrated
  zones later (main.js listener; mr.js on every `buildPlan`).
- **A pattern that looks the same after a 90° turn** (pinwheel, octagon) is unchanged by the floor
  turn; a UV x↔y swap is a **mirror**, not a turn, which is why only planks may swap.
- **No PIL here**: dump pixels with `ffmpeg -f rawvideo -pix_fmt gray|rgb24` and read them in Python.
- **Circuits over a `switch_dual`:** vertices are terminals (`id`, `id#2`); a double switch can sit in
  two components and `deviceIds` lists it in both. CHECK's `unwired` looks at the marker, so one wired
  rocker hides the other (deliberate limit).
- **Float noise:** stored lengths are on the 0.1 mm grid since `7babb98`, but values computed from
  them (x + w, pin + value) are not, unless they go through `snapM`. Grids built from edges also
  snap (`snap()` in `architectural3d.js`).
- **A texture that repeats obliquely** uses its own `texture.matrix` (`matrixAutoUpdate = false`):
  don't set `repeat`/`offset` on the stepped texture, they would be ignored.
- **`addConduitSegment` / `ensureConduitNodeAtMarker` return EXISTING items**; `addWire` returns
  `{ ok, wire }`; `wireSegmentPath` returns segment IDS (compare routes physically).
- **The owner's house file is a real wired network** (rev 9, 47 wires). It suits wire/length tests
  directly; a synthetic network is still handy to control an exact expectation.
- **Thick walls between rooms are hollow in 3D** (12 cm skin per room face; wider gaps leave a void).
- **The desktop `Sketch2D` stays live during AR**; a throw in any `onChange` listener aborts the AR caller.
- **`rlog` works only on the dev server**; never stage `quest-debug.log`.
- **Latent:** `~/house-cad-apk/app/src/main/res/values/strings.xml` lacks `appName`/`launcherName` —
  add them before the next `bubblewrap build`.

## Commits

All pushed, all with descriptive bodies. Doc-only commits are omitted.
- **Session 38:** `c00e97b` links always carry furniture · `f8e1f35` View 3D Realistic · `fec23b8`
  URL copy failure names its cause · `4c819aa` links carry finishes + markers, QR without · `ade036e`
  Charme photo planks · `71208e4` Monastère photo tiles · `6854420` photo-finish process + tools.
- **Session 37:** `1cd1c14` furniture FOOT/TOP move the unit · `3bb9564` merge AR products per
  material · `1c48801` PERF 3D-view sweep + Lambert furniture · `d37f09d` low-detail AR devices ·
  `62d6627` PERF clipboard report · `d00be61` report prebuilt, copied like LINK.
- **Session 36:** `542e46f` ACOVA towel radiators · `e08eb59` conduit length readout · `084709f`
  De'Longhi EASY radiators (4) · `8824dc3` EASY 120 × 60 · `99d0cd9` heat loss · `51b0968` pedal bin ·
  `a2084e2` HEATING group + per-window U · `c2f6e0b` stairs from the floor.
- **Session 35:** `948c5ed` wire rockers (left/right) + pass-through node rejoin · `10c320a` shared
  grip cycle + `i/n` · `a031a0c` FLOOR keeps the teleport · `d481128` pills widen · `ba33078` material
  card.
- **Session 34:** `4e080fc` PERF `mat` layer · `0110e85` adjacent dots batched + overlap badge ·
  `42aa336` double switch marker + LINK batch · `283ba28` conduit sticky grip · `7babb98` 0.1 mm grid
  · `26aa3f2` Monastère stepped layout.
- **Session 33:** `4ba575d` floor start corner · `a7ac8bb` grout weight · `ecca41f` diagonal
  octagon, 90° turn, UV fix, Héméra porte-fenêtre, Néva bay · `8eb1b99` AR ceiling + exterior glass ·
  `f5f30f9` rail-hung sliding door, sources-in-generators rule.
- **Session 32:** `e9ace98` furniture merge + MATERIAL · FURNITURE · `63e640a` material badges ·
  `912be58` 3D-only AR view, FURNISH removed · `ac60665` PASSAGE, Monastère readout fits ·
  `8948472` doors open in the AR 3D view.
- **Session 31:** `3362251` Ethernet product · `c44fd5c` products in view links · `38d42c5` View 3D on
  phones · `899d72d` in-room half wall · `00b4612` terrazzo · `977a29d` V120 piano · `46cd6a8`
  `4cad922` Monastère, Lucia, detail layer · `9a82898` open doors in View 3D.
- Earlier sessions: see `git log`.

**Never stage** `Document from Alexis He.json` (untracked): it is the owner's real 3-storey house (rev 9,
47 wires) and the read-only Node fixture for almost every check. Newer exports are not in the repo: session 37's upload (rev 14, 2026-10-03: 33
device products and the Daikin units on Ground/Upper, 85 wires) came only as a chat upload; ask the
owner for a fresh export when a check needs current data.

## Resuming from a clean checkout

```bash
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | tail -1)/bin:$PATH"
npm install                                       # once; node_modules is already present
npm run dev -- --host --port 5174 --strictPort    # https; usually already running on :5174
npm run build                                     # the only automated check; expect "✓ built in …"
```

LAN IP last seen `192.168.1.154` → `https://192.168.1.154:5174/` (AR: `…/?ar=1`). Report the Network
URL. The owner mostly tests through the APK, which loads the **published** site, so on-device checks
need a push. The APK project (`~/house-cad-apk`), assetlinks repo (`~/krosk.github.io`), `~/.bw_pw`,
and Bubblewrap's JDK/SDK exist; see `packaging/quest-apk.md` and don't re-init.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/ui/mr.js` | The whole AR session: modes, HUD + PERF sweep, batched overlays (labels, markers, conduit, wires), numpads, grip-drag, conduit pen, export |
| `src/ui/view3d.js` | Three.js renderer shared by AR and the desktop 3D viewer (overview/POV camera, pinch, walk, tilt); `_animate` feeds the HUD's `time:` split |
| `src/io/shareView.js` | View-link payload (compact positional schema; marker slot 4 height flag, slot 5 product; floor slot 5 finishes) |
| `src/core/architectural3d.js` | Plan → slabs/walls/openings/stairs + `wallMarkerPlacements()` (pure, Node-testable) |
| `src/io/planSheet.js` | Sheets (incl. the shared monochrome `drawMarkerGlyph`) |
| `src/core/model.js` / `constraints.js` / `conduit.js` | Model + `_emit`; the solver; conduit graph, routing and `conduitRunLength` |
| `src/core/heatLoss.js` | Room heat loss (`floorHeatLoss`, `roomHeatLoss`), defaults `HEAT_DEFAULTS` / `FLOOR_HEAT_DEFAULTS`, `OPENING_KINDS`, settings sanitizers used by model + serialize |
| `src/core/architectural3d.js` stair part | `stairsGeometry`: `STAIR_RISER` 0.18 (owner), `STAIR_GOING` 0.25 (estimate) |
| `src/core/i18n.js` | EN/FR/ZH strings: every new mode needs `mode.*` + `help.*` |
| `src/core/circuits.js` | Derived circuits (per wire nature) + `circuitDiagnostics` for MARKER · CHECK |
| `src/core/materials.js` / `src/core/flooring.js` | Finish catalog; takeoff, regions, wall faces (pure, Node-testable) |
| `src/ui/finishTextures.js` | Canvas pattern textures shared by View 3D and the AR 3D view; product `design`s per pattern (`DESIGNS` stagger, `BRICK_DESIGNS`, `GRID_DESIGNS` mosaic/terrazzo/limestone, `OCT_DESIGNS`, `PINWHEEL_DESIGNS`), their bump maps, the shared stone cloud helpers (`stoneField`, `drawStoneCloud`) and the View 3D detail layer (`DETAIL_DESIGNS`, `applyFinishDetail`) |
| `tools/product-images.mjs` | Per-retailer product photo extraction (`--snippet` for Chrome-only sites) |
| `tools/photo-measure.mjs` | Measure a retailer photo for a photo finish: `rows` (grooves), `joints --grooves …`, `bbox` (tile on white) |
| `tools/check-share-link.mjs` | What a saved house loses in a share link, and the link length (Node only) |
| `src/ui/realism.js` | Realistic: `sunPosition`/`sunDirection`, `SITE`, `loadSky` (Poly Haven HDRI, sun clamped), `fetchCached` (Cache Storage `house-cad:images:v1`) |
| `src/ui/photoFinishes.js` | Photo finishes: `PHOTOS` (with `// Sources:`), plank and stepped-tile atlases, `patchPhotoMaterial` (shader layouts) |
| `src/ui/furnitureCatalog.js` | The furniture catalog fetch, once, shared by View 3D, AR and migrated-zone sizing |
| `src/core/apertureGlyph.js` | Shared plan-symbol segments for sheets, DXF and the AR plan (door, passage, window, …, furniture notch) |
| `src/ui/proceduralFurniture.js` | Code-built furniture (`procedural: <kind>` catalog entries: STOCKHOLM bed, Daikin wall units, NEO shower tray, V120 upright piano, ACOVA `towel-radiator`, De'Longhi `panel-radiator`, JOYFURNOS `pedal-bin`); used by the AR 3D view and View 3D |
| `src/ui/doorProducts.js` | Door product builder (frame, leaf `DESIGNS`: Ange-Line, LINE, postformé; hardware) from `doorProductPlacements`; `buildRailDoor` for rail-hung doors on SLIDING zones |
| `src/ui/deviceProducts.js` | Switch/outlet/Ethernet product builder: shared `plate()` (pyramid + stadium collar) and `flatInsert()`, `rocker` (single/double), `socket` and `rj45` designs, lofted from radial outlines; cached per entry and `detail` (`full` desktop, `low` AR), clones share geometry |
| `src/ui/mergeByMaterial.js` | AR draw-call reduction: `mergePartsByMaterial` (the 3D view's parts) and `mergeObjectByMaterial` (a furniture model) |
| `src/ui/windowProducts.js` | Window product builder (`PROFILES` per design: frame, sashes, glass, hardware; `buildSliding` for the Néva) from `windowProductPlacements` |
| `src/ui/exteriorView.js` | The AR 3D view's opaque glass material (procedural daylight exterior) |
| `public/furniture/index.json` | Furniture catalog: IKEA articles + procedural entries (`params` hold the tweakable dimensions) |
| `src/main.js` / `src/ui/sketch2d.js` | Desktop wiring / 2D editor (incl. read-only view mode) |

## Next step

- **A — Owner walks the parked work on the Quest**, then update `docs/ar-qa-checklist.md` (items exist
  for each). Newest first:
  - session 38: copy a fresh EXPORT · LINK and open it on desktop (Héméra windows, doors, finishes,
    lights and device products show?); if the copy fails, the bracketed reason; View 3D **Realistic**
    on the Steam Deck and the iPhone 14 (fps, sky download, sun slider, the Charme and Monastère
    photo floors: tone vs the showroom, a repeated Monastère face?);
  - session 37: raise the Daikin CTXM15A in PLAN · EDIT (FOOT 230 cm, then ⇄ TOP 250 cm → foot
    2.202 m); outlets/switches up close with LEFT X (low detail: faceted corners?); furniture looks
    matte (Lambert) but right; windows/glass unchanged after the merge;
  - session 36: HEATING (PIPE still works after the move; HEAT LOSS: set the Basement unheated first,
    it defaults to heated, then the attic R; R / U: the 3 linings' R and the windows' Uw; panel
    height, labels vs dims overlap); the stairs in LEFT X (treads from the floor, 25 cm going vs the
    real one); the pedal bin on a furniture zone; CONDUIT · EDIT
    `LENGTH` / `RUN` against a tape measure; the ACOVA and De'Longhi radiators on furniture zones
    (LEFT X: size, wall side, mount height vs the real ones);
  - session 35: the material card (LEFT grip in each MATERIAL mode; paint stall when flicking? debug
    log `material card` ms; a furniture card); the widened pills (a long French name reads whole; is a
    0.45 m pill too big?); teleport then FLOOR (stays put, plan doesn't turn); the `i/n` line in EDIT,
    LINK, WIRE, CONDUIT, CONDUIT · EDIT and MATERIAL devices (EDIT at the 132 cm Ethernet stack: no
    jump); A/X rocker swap on a wire to the double switch, then CHECK shows no cross-tie; deleting a
    node mid-run in CONDUIT · EDIT;
  - session 34: Monastère stepped with LEFT X (centred module, a 30×30 in a start corner, no seams,
    first-draw delay); MARKER · EDIT grip on the Ethernet/switch stack (badge "3"); CONDUIT grip
    cycling; the double switch (LINK rocker swap, A/X merge); **PERF in CONDUIT again** (did the
    batching fix the 30 fps? does `zones` still read 12 ms?);
  - session 33: the rail sliding door on a SLIDING zone; the white ceiling + exterior glass with LEFT X
    (PERF on); the Héméra porte-fenêtre and Néva bay (sill-0 WINDOW zones); the diagonal Etruria; the
    90° turn (Blue stone, Charme; A/X near a corner still sets the corner); grout on the quantity
    line;
  - session 32: MATERIAL · FURNITURE on a real zone (cycle, A/X turn, B/Y clear, `DIM REMOVED`
    flash), a slot saved with old FURNISH items migrating, the material badges, a PASSAGE between two
    rooms of different floors, the Monastère 6-line readout, doors open with LEFT X;
  - Z-dims, adjacent-floor dots, CHECK rings (never rendered before `f0f6bf1`);
  - MATERIAL · FLOOR/WALL/DOOR/WINDOW products (the Ange-Line on the entrance door; Héméra's handle
    side; Beaulieu oak, Etruria in the upstairs bathroom, Blue stone mosaic, Vernisse, terrazzo, Lucia;
    watch PERF: each design texture is 2048 px);
  - furniture products: the STOCKHOLM bed, the TV bench (does a real IKEA model replace the box on
    the APK?), both Daikin units (foot at 2.0 m), the V120 piano;
  - MATERIAL · SWITCH / OUTLET / ETHERNET: grip cycling on a double switch, Ovalis models flush;
  - the LEFT X AR 3D view with **PROJECT · PERF** on;
  - View 3D on a phone and an iPhone (Tilt look, pinch, walking, Reflections frame rate), a
    WhatsApp-sent `link` with products, the Ground gap wall behind half wall r139, the detail layer
    shader on the phone and the Quest browser;
  - MARKER · CHECK, the stacked readout, stair rotation, then session 29's list (ALL FLOORS
    reticle/teleport, WIRE cycle + lengths, breaker glyph, pen undo/T).
- ~~**B — Build the furniture merge**~~ — done in session 32 (`e9ace98`), plus FURNISH removed at the
  owner's request. Remaining small gaps (not asked for): desktop product picker, desktop
  "dimension removed" message, the notch in the desktop 2D sketch.
- **B′ — More products** as the owner names them: run `/model-product <link>` (step 7 adds a photo
  finish when a straight top-down photo exists); a real manufacturer
  model is always checked first. Offered, not asked for: detail designs for terrazzo, the mosaic and
  the oak; a desktop quantity table (per room and size: tiles, cut, m², boxes); a wastage margin; the
  Lucia leaf decor tile.
- **B⁗″ — Realistic, next options** (offered, not asked for; `docs/realism.md`): a path-traced
  **Render** button (`three-gpu-pathtracer`, three 0.170 compatibility unknown); Poly Haven PBR
  textures for plaster/wood/concrete; photo finishes for more products (Lucia, Vernisse, Etruria…);
  bloom on light pucks.
- **B‴ — Quest-to-TV mirror / Steam Deck viewer:** parked by the owner. If resumed, start from
  `docs/share-view.md` "Parked" (first step: a ping-only page pair on the Deck).
- **B″ — Materials phase 4:** the owner's own products entered in AR (numpad: size, joint, pack) into
  `project.materials`. Possible improvements the owner has not asked for (see `docs/materials.md`):
  - ~~per-region pattern offset~~ — done as the start corner (owner chose a corner, not a wall line or a
    numeric offset); an automatic "fewest tiles" corner was offered, not asked for;
  - start corner / turn for wall faces (floors only today);
  - a plank texture drawn from the real cut plan;
  - the hidden face below a half wall that stands inside a room (still counted in the wall area).
- ~~**B⁗ — Sticky pick for CONDUIT · EDIT and WIRE**~~ — done in session 35 as the shared `gripCycle`
  (`10c320a`), which also covers EDIT, LINK and MATERIAL devices.
- ~~Help box overflow (grow + smaller font, or one line per control)~~ — offered in session 35; the
  owner said no need. ~15 help texts exceed its 8 lines (estimate), mostly FR.
- **B⁗′ — Material card extras**, not asked for: a thumbnail beside the readout (option 2), piece size
  and pack on the card, the AR 3D view on the target (option 3 already exists as LEFT X).
- **C — Conduit-drawing speed-ups:** height snap + "ceiling run" toggle, straight runs, one-press drop
  from a device, snap-to-wall + auto-pin. The owner decides priority.
- **D′ — AR 3D view: the plan drawn under it** (session 37 reports), parked by the owner (fps 50–80
  is fine). Resume per `docs/ar-survey.md` "Open: the plan may still be drawn under the AR 3D view".
- **D — Remaining AR per-object layers**, only if a mode drops frames (adjacent-floor spheres, pipes,
  furniture, control links). Measure with PERF first.
- ~~Draw stacked markers apart in AR~~ — rejected: the floor icon, pick, dims and sheet all use the
  shared point, so an offset would draw glyphs where the data isn't.
- ~~Copy a wall material to every wall of the room (A/X)~~ — built, then removed at the owner's request.
- ~~Floor-fill overdraw as the AR GPU cost~~ — refuted by PERF; the per-marker objects were the cost.
- ~~Ray-picking wires in 3D~~ — the owner said floor-projection picking works.

## Known open questions

- **Session 38 open:** why the AR URL copy got `NotAllowedError` (same path as the working PERF
  copy); Realistic frame rate on the Deck and iPhone 14 (never measured); iOS half-float sky filtering
  (Hypothesis it works); the Monastère tone and its one-face-per-size variety (the range has 24); a
  thin light leak seen at one wall joint of the demo house in Realistic; the photo atlas build time on
  the iPhone.
- **Unwalked, Hypothesis only.** Sessions 32–38: everything in Next step A's first seven bullets.
  Session 37: whether the plan really draws under the 3D view and why (the hide path reads correct);
  what made the 23 vs 82 fps swing; the low-detail device look up close.
  Session 36 heat loss: every default without an owner answer (bare wall R 0.25, slab R 0.15, window
  U 1.4, door U 2.0, λ 0.04 for the 3 linings until their R is set, basement 6 °C); Node totals with
  defaults (Ground 11.7 kW, Upper 8.4 kW; 8.8 / 4.6 with attic R 7) are not checked against any real
  heating. Next, if asked: exterior/interior edges coloured in HEAT LOSS (offered), stairs merged into
  their room (offered, declined for now), radiator W against the need (catalog entries carry no W
  yet; ratings are at ΔT 50 K), window products' Uw, a 22 °C bathroom, a desktop panel.
  Session 36 stairs: the 25 cm going; the 7–11 cm per storey no zone covers. Pedal bin estimates:
  pedal height 52 mm (photos 43 vs 61), spacing ±145 mm, handle width, corner radius.
  Session 36 estimates: ACOVA bar end positions (±3 mm, photos), the 1728 mm size's bracket rules
  (manual draws only 1008/1332); EASY slot width 15 mm and depth 8 mm, the 46 mm horizontal margin on
  the 120 cm (its room photo suggests ~37), the 38 mm vertical margin on the 180 cm (copied from the
  200 cm); every radiator's mount height. No radiator has been seen in View 3D or AR.
  Session 35: the card's paint time on the Quest (five cards ~1 s on desktop) and a furniture card
  (not previewed); the Quest's `sans-serif` font (likely Roboto, narrower than the fonts measured);
  **PERF in MARKER · CONDUIT is still not re-measured** since session 34's batching.
  Session 34: the stepped Monastère's joint comes out of nominal cells (tiles drawn 5 mm under
  size); the texture's paint time on the Quest (0.65 s per map on desktop); the plan sheet grouping
  the Ethernet into its stack now that coordinates are equal (SVG not looked at).
  Session 33 estimates: the Néva faces (photo scale assumes the 180 cm width), the rail door's bar
  section, wheel Ø and wall gap; the exterior picture's horizon sits at the same pane fraction for every
  window. Session 30:
  - everything in Next step A;
  - ~~frame cost of the AR 3D view~~ measured in session 37 (owner: 50–80 fps on Ground, accepted);
  - whether MARKER · CHECK's 1-px pins read, and whether ~100 rings hold frame rate;
  - the readout pill (4 lines, 6 at a tighter pitch since session 32) and its legibility;
  - how the textures look in a browser;
  - the bed and the door in AR (both rendered only in a desktop browser);
  - the oak floor, Vernisse tile, Blue stone mosaic and Etruria octagons on real rooms (seen only in
    scratch previews), and Reflections on any device other than a desktop Chrome;
  - the Daikin units, the LINE door and the furniture plan pieces in AR (the plan-piece outline is a
    1 px line; a ribbon is the fix if it reads faint). The FTXM60A and the LINE door were only seen in a
    scratch preview, not in View 3D;
  - the Ovalis switch, double switch and outlet in the real View 3D and in AR (seen only in scratch
    renders; an 8.7 cm device is invisible from the View 3D overview, and the POV couldn't be aimed);
  - session 31, all unwalked: phone View 3D (Tilt look is untestable on desktop), products in a real
    shared link, the half-wall fix rendered, terrazzo and piano outside scratch previews;
  - Héméra windows in AR, and on the owner's real window zones (seen only on an injected demo house in
    desktop View 3D). The frame is centred in the zone's depth; real fitting position is not modelled.

  Estimates to confirm with a tape measure or the owner: the bed's rail height, headboard lean and
  cushion size (from photos); the door colour (anthracite ~RAL 7016 guessed; Lapeyre colours are
  customisable) and which door zone in the owner's house is the entrance; the oak's 2 mm bevel and the
  tile's 3 mm joint (photo estimates); the mosaic's 2 mm joint (renders suggest ~3.5 mm); the Etruria
  joint, grout colour and **pack size** (entered as 1 piece per pack); Héméra profile faces are
  scaled by an assumed ~160 mm handle; the Daikin front layouts (panel edge, flap, sensors: photo
  estimates); the LINE grooves (photo estimates, assumed on both faces) and its lever handle (the
  product ships without one: ask which handle the owner buys); the NEO tray's layout (top-down photo) and
  the Ovalis depths (read on side-photo silhouettes); the terrazzo joint (2 mm), grout, thickness and
  finish; the V120's key-top height, lid depth and key overhang (standard proportions, no straight
  photo exists); the Monastère joint (page 5 mm vs showroom board 3 mm; 5 used), its grout colour and
  tone; the Lucia grout colour.

  Session 29: breaker glyph, conduit pen undo/T, Z-dim look, 3D-viewer fixes. The owner has used AR
  with markers, labels, conduits and wires since the batching, and reported them working.
- **Why 168 per-marker canvas textures cost ~47 ms** is unexplained. The batching fixed it; the
  mechanism is a Hypothesis (per-texture handling in the Quest browser).
- ~~Is `EXT_disjoint_timer_query_webgl2` on the Quest?~~ No: the session 37 reports read `source
  frame` (OculusBrowser 152, Adreno 740), so every PERF ms is a frame interval.
- `docs/ar-qa-checklist.md` is stale for most work since s16.
- **Data oddities in the owner's house:** cameras m174/m183 have `z = 0`; doors r77/r120 are drawn
  wider than their opening.
- **IKEA furniture on the published app:** the Pages build embeds the proxy and the Worker returns a
  valid GLB with CORS for `https://krosk.github.io` (Proven by curl). Nobody has yet seen a real model
  replace the placeholder box on Pages/APK (Hypothesis).
- **Unverified:** shared-link decode on real phones, Web Share of the QR from immersive mode, and
  mobile 3D performance with lights.
