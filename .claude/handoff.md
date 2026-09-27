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
| `docs/furniture.md` | IKEA GLB pipeline, CORS proxy, FURNISH, procedural furniture (products with no IKEA model) |
| `docs/product-modelling.md` | How to model a product with no 3D model from specs/drawings/photos (incl. per-retailer photo access); run by the `/model-product` skill |
| `docs/share-view.md` | View-only share links, `link`/`qr` export, read-only viewer |
| `docs/markers-plan.md` | Marker lane design + roadmap |
| `docs/materials.md` | Surface finishes, flooring/tile/mosaic/octagon products, View 3D reflections, door, window, **switch and outlet** products: owner decisions, continuity rule, takeoff method + limits, phases |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-09-27 (session 30, continued)
**Status:** Proven (git): `origin/main` = `a2e7038` plus this handoff's commit; the live `version.json`
served `c6d2664` minutes after the outlet push (Pages lags a few minutes; re-check). The tree is clean apart
from the owner's untracked `Document from Alexis He.json`. AR performance (session 29) is
**owner-confirmed on the Quest**; everything from session 30 is verified by build, Node or a desktop
browser only, and **parked for the owner to walk** (Next step A).

## What the app is today (the gist, no code needed)

**One app, three surfaces**, all from the same static Vite build at
**https://krosk.github.io/house-cad/** (also a sideloaded Quest 3 APK, `com.krosk.housecad`, that
boots straight into passthrough AR):

1. **Desktop/mobile 2D plan editor.** Draw axis-aligned rectangles tagged **add** (room space) or
   **subtract** (wall, door, window, garage door, half wall, heater, sliding door, insulation,
   stairs up/down, cabinet, furniture placeholder). Exact sizes come only from **dimension
   constraints** (a 2× 1-D least-squares solver). Multi-storey: independent plans stacked on a shared
   origin. Outputs: to-scale print/SVG/PNG sheets per floor (monochrome, optional change-map revision
   clouds vs a saved slot), DXF + a simplified Coohom DXF, STL/OBJ/GLB mesh, JSON save.
2. **Desktop/mobile 3D viewer (`◈ View 3D`).** An **architectural** reading of the plan
   (`src/core/architectural3d.js`): room floor slabs, an inferred 12 cm outer wall shell, WALL and
   INSULATION zones as solids, doors and windows cut from their sill/head, procedural stairs, 8 cm
   marker faceplates, IKEA furniture, light markers that light the room, and **textured surface
   finishes**. One floor at a time; top-down overview ↔ tap a room for a 1.65 m POV. **Mesh exports
   still use the legacy extrusion.**
3. **AR survey tool on the Quest** (`src/ui/mr.js`, the only authoring surface on the device).
   Register the house to a real corner, then author at 1:1 with a tape measure: rooms/walls/edges,
   dimensions via a 3D numpad, markers, heights, electrical conduit + wires (electrical or Ethernet)
   with circuit diagnostics, a plumbing pipe network, furniture, **surface materials, door, window,
   switch and outlet products**, save/load in 6
   slots, export (sheets, DXF, JSON, view link, QR), and an **AR 3D view on LEFT X**. Mode list:
   `docs/ar-survey.md`.

**Sharing:** `🔗 Share view` (desktop) or the AR `link`/`qr` export opens a **read-only** session.
Detail: `docs/share-view.md`.

**The goal (unchanged):** Phase 5 — an on-site MR survey tool, multi-storey, authored entirely in AR.
Read `docs/product-intent.md` before planning AR work.

## What changed in session 30

> Next agent: when you add your own section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete this list. Detail for every item is in the named doc.

1. **Electrical:** stairs rotate (`climb`); **MARKER · CHECK** circuit diagnostics, circuits per wire nature
   (Ethernet no longer counts as power); stacked-marker readout. `docs/electrical-workflow.md`, `docs/ar-survey.md`.
2. **Materials phases 1–3:** AR MATERIAL · FLOOR / WALL, catalog + whole-house takeoff, View 3D textures,
   the **AR 3D view on LEFT X**, and the `PLAN_OVERLAY_GROUPS` fix (four AR overlay layers had never
   rendered). `docs/materials.md`.
3. **Products modelled from photos** (`docs/product-modelling.md`, `/model-product`, `tools/product-images.mjs`
   now also fetches documents, spec tables and contact sheets):
   - finishes: Beaulieu oak, Vernisse tile (+ View 3D ✦ Reflections), Blue stone mosaic, Etruria octagon;
   - DOOR / WINDOW zone products: Lapeyre Ange-Line and LINE doors, Héméra windows (MATERIAL · DOOR / WINDOW);
   - procedural furniture: STOCKHOLM bed, Daikin CTXM15A / FTXM60A (`mountZMm`), Sensea NEO shower tray;
   - **switch and outlet products** (`c6d2664`, `a2e7038`): Schneider Ovalis single switch, double switch
     and flush outlet, on the marker (`marker.product`), drawn in View 3D and the AR 3D view in place of the
     faceplate; AR **MATERIAL · SWITCH / OUTLET** with grip cycling overlapping devices. The owner reviewed
     the switch shape until happy (stadium rocker, two flat faces, pyramid plate). `docs/materials.md`
     "Switches and outlets".
4. **AR furniture = floor plan pieces** unless the AR 3D view is on; junction height labels only in the
   conduit modes.
5. **Furniture merge designed, not built** (`cc9165e`): **Next step B**. `docs/furniture.md` "Planned: merge…".

## Standing decisions (live constraints; the "why" is in the docs above)

- **Label every claim Proven or Hypothesis** (`CLAUDE.md` top rule), in reports, commit bodies, docs.
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
- **A double switch = two switch markers at one point**; never draw stacked markers apart in AR.
- **Materials** (`docs/materials.md`):
  - patterns are anchored at the plan origin (continuity over efficiency, owner-acknowledged);
  - same-material rooms joined by a doorway are one region; different materials meet mid-doorway;
  - packs are rounded once per product for the whole house;
  - wall faces are set one at a time: the owner removed a copy-to-every-wall action, so don't re-add it.
- **Products with no manufacturer model are code, never stored GLBs** (owner decision): a
  `procedural` furniture builder or a door `design`. A non-code model would go in
  `public/furniture/models/` (not built). Follow `docs/product-modelling.md` / `/model-product`.
- **A door product is a material of its DOOR zone** (owner decision), authored in MATERIAL · DOOR;
  made-to-measure products take the zone's size. **Window products follow the same rule** (WINDOW zone,
  MATERIAL · WINDOW).
- **Switch and outlet products are a material category on the marker** (owner, 2026-09-27): stored as
  `marker.product` (not a finish), switch products on switches, outlet products on `outlet` /
  `outlet_appliance` only. **Model only the visible parts** (plate, rocker, socket), never the in-wall
  mechanism. A double switch stays two markers; a multi-rocker product is set on the whole stack and
  drawn once. Where targets overlap, **grip cycles them before the trigger selects** (owner).
- **Catalog entries for the owner's real products replace generic placeholders** when the owner says
  so (`octagon_200` removed for Etruria). A saved finish naming a removed id shows as no material:
  every `materialById` caller handles null.
- **Product textures are procedural too** (seeded canvas, no stored images); photos are references
  only and stay in the session scratchpad.
- **View 3D reflections are on demand, per device** (owner: some devices struggle): off by default,
  `localStorage`, never in project/share data, and **cleared for AR sessions** (Quest cost). AR
  reflections were asked about, not built: `docs/materials.md` lists what they would need.
- **AR furniture models show only with the AR 3D view on**; otherwise flat plan pieces (owner, 2026-09-27).
- **Furniture merge** (owner, 2026-09-26/27, `docs/furniture.md`):
  - four facing directions only;
  - FURNISH = drop + assign in one mode;
  - sheets/DXF print the rectangle plus a front notch;
  - furniture solves one-way after the structure;
  - an over-specified furniture dimension is **deleted, never shown as a conflict**.
- **LEFT controller:** trigger = teleport, grip = hold-to-view sheet, stick-x = rotate plan, stick-y =
  storey teleport (ALL FLOORS), **X = AR 3D view**. Y and the stick click are free.

## Findings / traps worth knowing

- **`mr.js` does NOT subscribe to `project.onChange`.** AR model changes must call the rebuild by hand
  (`buildPlan()`, `buildConduits()`, `buildRoutedWires()`, …). Wire picking deliberately uses the legs
  cached by the last `buildRoutedWires` (it picks what is drawn).
- **Every planGroup overlay group must be in `PLAN_OVERLAY_GROUPS`** (`mr.js`), or the first
  `buildPlan` silently detaches it. That already hid four layers for several sessions.
- **Wall faces follow the finished surface, not the room rect edge** (`edgeFace` in `flooring.js`):
  - wall/insulation linings over the room edge inset the face (the owner's house has 18–21 cm linings);
  - edges onto stairwells are open;
  - half walls cut the face above their sill.
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
- **Chrome tools:** screenshots of a WebGL preview tab can time out even though the page rendered.
  Instead the scratch page POSTs `canvas.toDataURL()` to a tiny local receiver (`scratchpad/bedview/recv.mjs`
  on :5191), and ffmpeg builds side-by-side comparisons with the photos. The javascript tool returns a bare
  async IIFE as `{}` (prefix `await`) and blocks output containing a query string. Stop
  scratch Vite servers by port (`ss -ltnp | grep :5190`), not `pkill -f` (it kills its own shell).
- **Deploy check:** `curl -s https://krosk.github.io/house-cad/version.json` (the commit it serves).
  The unauthenticated Actions API rate-limits quickly, and there is no `gh` CLI here.
- **Today a furniture zone's dimensions can move a wall** (Proven with the real solver: a room's wall
  moved 3.0 → 2.8 m, no conflict flag). The merge's one-way rule fixes it; until then it's live.
- **Splitting mixed hunks into separate commits:** `git apply --cached --unidiff-zero` misplaces pure
  insertions (one landed at the end of a file). `git stash --keep-index` + `pop` then merged the bad
  staged copy back into the working file as a duplicate. Build the staged file as a blob instead
  (`git hash-object -w` + `git update-index --cacheinfo`), and diff the result before committing.
- **Solved coordinates carry float noise**; grids built from edges must snap (`snap()` in
  `architectural3d.js`).
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

All pushed (`origin/main` = `a2e7038` before the handoff commit), all with descriptive bodies.
Doc-only commits are omitted, except the design commit.
- **Session 30:**
  - `47c08de` stair `climb`;
  - `0ad552d` MARKER · CHECK + per-nature circuits;
  - `9bce6e7` stacked-marker readout;
  - materials: `72ca05a` catalog/takeoff/AR modes · `92975bf` View 3D textures + wall-face fixes ·
    `f0f6bf1` AR 3D view + the `PLAN_OVERLAY_GROUPS` fix;
  - products: `63cfd17` TV bench (+ previous handoff) · `4abecef` procedural furniture / STOCKHOLM bed ·
    `cc55640` door products / Ange-Line · `2972e7a` modelling workflow + skill ·
    `ac10962` Beaulieu oak floor · `efca116` photo extractor · `c0e135d` Vernisse tile + Reflections ·
    `38dc935` Blue stone mosaic · `f9a75c6` Etruria octagon (placeholder removed) · `a9a30fd` Héméra
    windows + MATERIAL · WINDOW · `416d2fa` band-label redraw fix · `23dd7c7` CTXM15A + `mountZMm` ·
    `1b32d12` junction labels · `e9d5ace` AR furniture plan pieces · `3519eb2` FTXM60A ·
    `cc9165e` furniture merge design (docs) · `3899fe3` LINE door · `6018048` NEO shower tray ·
    `06e7cfc` product extractor · `c6d2664` switch products + MATERIAL · SWITCH ·
    `a2e7038` outlet product + MATERIAL · OUTLET.
- **Session 29:**
  - 3D walls/faceplates: `f457bd5`, `309d807`;
  - conduit pen undo/T `dce02f1`, Z-dims `fb56fbc`;
  - performance: batching `54d1b15` `4369ac2` `4af1d20` `4d3610b`, PERF sweep `36fa3d1`/`425c2e5`;
  - breaker glyph `dee978f`;
  - ALL FLOORS: `2f7d7df` `47c5b66` `245cb3f`;
  - WIRE: `5698fb7` `8603501`.

**Never stage** `Document from Alexis He.json` (untracked): it is the owner's real 3-storey house (rev 9,
47 wires) and the read-only Node fixture for almost every check.

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
| `src/ui/view3d.js` | Three.js renderer shared by AR and the desktop 3D viewer; `_animate` feeds the HUD's `time:` split |
| `src/core/architectural3d.js` | Plan → slabs/walls/openings/stairs + `wallMarkerPlacements()` (pure, Node-testable) |
| `src/io/planSheet.js` | Sheets (incl. the shared monochrome `drawMarkerGlyph`) |
| `src/core/model.js` / `constraints.js` / `conduit.js` | Model + `_emit`; the solver; conduit graph + routing |
| `src/core/i18n.js` | EN/FR/ZH strings: every new mode needs `mode.*` + `help.*` |
| `src/core/circuits.js` | Derived circuits (per wire nature) + `circuitDiagnostics` for MARKER · CHECK |
| `src/core/materials.js` / `src/core/flooring.js` | Finish catalog; takeoff, regions, wall faces (pure, Node-testable) |
| `src/ui/finishTextures.js` | Canvas pattern textures shared by View 3D and the AR 3D view; product `design`s per pattern (`DESIGNS` stagger, `BRICK_DESIGNS`, `GRID_DESIGNS` mosaic sheets, `OCT_DESIGNS`) and their bump maps |
| `tools/product-images.mjs` | Per-retailer product photo extraction (`--snippet` for Chrome-only sites) |
| `src/ui/proceduralFurniture.js` | Code-built furniture (`procedural: <kind>` catalog entries: STOCKHOLM bed, Daikin wall units); used by FURNISH and View 3D |
| `src/ui/doorProducts.js` | Door product builder (frame, leaf `DESIGNS`: Ange-Line, LINE; hardware) from `doorProductPlacements` |
| `src/ui/deviceProducts.js` | Switch/outlet product builder: shared `plate()` (pyramid + stadium collar), `rocker` (single/double) and `socket` designs, lofted from radial outlines; cached per entry, clones share geometry |
| `src/ui/windowProducts.js` | Window product builder (`PROFILES` per design: frame, sashes, glass, hardware) from `windowProductPlacements` |
| `public/furniture/index.json` | Furniture catalog: IKEA articles + procedural entries (`params` hold the tweakable dimensions) |
| `src/main.js` / `src/ui/sketch2d.js` | Desktop wiring / 2D editor (incl. read-only view mode) |

## Next step

- **A — Owner walks the parked work on the Quest**, then update `docs/ar-qa-checklist.md` (items exist
  for each). The owner said they would verify later. First, check that the four overlays that never
  rendered before `f0f6bf1` now show: Z-dims, adjacent-floor dots, CHECK rings, MATERIAL tints. Then:
  - MATERIAL · FLOOR/WALL/DOOR/WINDOW (the Ange-Line on the real entrance door zone; Héméra on the
    windows, checking which side the handle faces; Beaulieu oak, Etruria octagons in the upstairs
    bathroom, Blue stone mosaic and Vernisse tile; watch PERF: each design texture is 2048 px);
  - View 3D ✦ Reflections on a phone (does it hold frame rate?);
  - FURNISH: the STOCKHOLM bed, the TV bench (does a real IKEA model replace the box on the APK?) and
    both Daikin units (drop at 2.0 m); the violet floor plan pieces, and the models with LEFT X;
  - the LINE door on an interior door zone; junction height labels only in the conduit modes;
  - MATERIAL · SWITCH / OUTLET on real devices: grip cycling on a double switch, the double drawn once,
    the Ovalis models flush on the wall at the right height with LEFT X (and in desktop View 3D POV);
  - the LEFT X AR 3D view, with **PROJECT · PERF** on;
  - View 3D textures (desktop);
  - MARKER · CHECK;
  - the stacked readout;
  - stair rotation;
  - then session 29's list: ALL FLOORS reticle/teleport, WIRE cycle + lengths, breaker glyph, pen undo/T.
- **B — Build the furniture merge** (design agreed, `docs/furniture.md` "Planned: merge…"). Rough order:
  1. the model: an optional `article` + `facing` on furniture zones;
  2. the one-way furniture solve (walls never move for furniture), with over-specified dims deleted
     plus a readout;
  3. load-time migration of `floor.furniture[]`: saved files, `_demo` seed, and share links (`shareView.js`);
  4. FURNISH as drop + assign;
  5. View 3D and the AR 3D view draw the product in the zone;
  6. the sheet/DXF front notch.
  Verify the solver change in Node against the owner's house (14 furniture zones, read-only).
- **B′ — More products** as the owner names them: run `/model-product <link>`; a real manufacturer
  model is always checked first.
- **B″ — Materials phase 4:** the owner's own products entered in AR (numpad: size, joint, pack) into
  `project.materials`. Possible improvements the owner has not asked for (see `docs/materials.md`):
  - per-region pattern offset to cut waste;
  - a plank texture drawn from the real cut plan;
  - the hidden face below a half wall that stands inside a room.
- **C — Conduit-drawing speed-ups:** height snap + "ceiling run" toggle, straight runs, one-press drop
  from a device, snap-to-wall + auto-pin. The owner decides priority.
- **D — Remaining AR per-object layers**, only if a mode drops frames (adjacent-floor spheres, pipes,
  furniture, control links). Measure with PERF first.
- ~~Draw stacked markers apart in AR~~ — rejected: the floor icon, pick, dims and sheet all use the
  shared point, so an offset would draw glyphs where the data isn't.
- ~~Copy a wall material to every wall of the room (A/X)~~ — built, then removed at the owner's request.
- ~~Floor-fill overdraw as the AR GPU cost~~ — refuted by PERF; the per-marker objects were the cost.
- ~~Ray-picking wires in 3D~~ — the owner said floor-projection picking works.

## Known open questions

- **Unwalked, Hypothesis only.** Session 30:
  - everything in Next step A;
  - frame cost of the AR 3D view (Lambert walls + textures; opaque walls may hide the real room);
  - whether MARKER · CHECK's 1-px pins read, and whether ~100 rings hold frame rate;
  - the readout pill, which grew to 4 lines and sits 1.25 cm higher in every mode;
  - how the textures look in a browser;
  - the bed and the door in AR (both rendered only in a desktop browser);
  - the oak floor, Vernisse tile, Blue stone mosaic and Etruria octagons on real rooms (seen only in
    scratch previews), and Reflections on any device other than a desktop Chrome;
  - the Daikin units, the LINE door and the FURNISH plan pieces in AR (the plan-piece outline is a
    1 px line; a ribbon is the fix if it reads faint). The FTXM60A and the LINE door were only seen in a
    scratch preview, not in View 3D;
  - the Ovalis switch, double switch and outlet in the real View 3D and in AR (seen only in scratch
    renders; an 8.7 cm device is invisible from the View 3D overview, and the POV couldn't be aimed);
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
  the Ovalis depths (read on side-photo silhouettes).

  Session 29: breaker glyph, conduit pen undo/T, Z-dim look, 3D-viewer fixes. The owner has used AR
  with markers, labels, conduits and wires since the batching, and reported them working.
- **Why 168 per-marker canvas textures cost ~47 ms** is unexplained. The batching fixed it; the
  mechanism is a Hypothesis (per-texture handling in the Quest browser).
- **`EXT_disjoint_timer_query_webgl2` on the Quest:** the owner's PERF line prefix (`gpu:` vs
  `frame:`) was not reported, so it is unknown whether the numbers were GPU time or frame intervals.
- `docs/ar-qa-checklist.md` is stale for most work since s16.
- **Data oddities in the owner's house:** cameras m174/m183 have `z = 0`; doors r77/r120 are drawn
  wider than their opening.
- **IKEA furniture on the published app:** the Pages build embeds the proxy and the Worker returns a
  valid GLB with CORS for `https://krosk.github.io` (Proven by curl). Nobody has yet seen a real model
  replace the placeholder box on Pages/APK (Hypothesis).
- **Unverified:** shared-link decode on real phones, Web Share of the QR from immersive mode, and
  mobile 3D performance with lights.
