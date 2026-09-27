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
| `docs/furniture.md` | IKEA GLB pipeline, CORS proxy, furniture zones + products (the merge), procedural furniture (products with no IKEA model) |
| `docs/product-modelling.md` | How to model a product with no 3D model from specs/drawings/photos (incl. per-retailer photo access); run by the `/model-product` skill |
| `docs/share-view.md` | View-only share links, `link`/`qr` export, read-only viewer; **parked**: Quest-to-TV live mirror + Steam Deck big-screen viewer (options worked out, not built) |
| `docs/markers-plan.md` | Marker lane design + roadmap |
| `docs/materials.md` | Surface finishes, flooring/tile/mosaic/octagon/terrazzo/**pinwheel (Monastère)**/**stone wall tile (Lucia)** products, the View 3D **detail layer**, reflections, door (**drawn open in both 3D views**), window, switch, outlet and Ethernet products, doorway kinds (incl. **PASSAGE**): owner decisions, continuity rule, takeoff method + limits, phases |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-09-27 (session 32)
**Status:** Proven (git): `origin/main` = `8948472` plus this handoff's commit, nothing unpushed; the
tree is clean apart from the owner's untracked `Document from Alexis He.json`. Proven (curl): the live
`version.json` served `ac60665` while `8948472` was still deploying. Owner-confirmed on the Quest: AR
performance (session 29), the MATERIAL flow, the 3D-only AR view and FURNISH's removal (session 32).
Everything else from sessions 30–32 is verified by build, Node or a desktop browser only (Next step A).

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
3. **AR survey tool on the Quest** (`src/ui/mr.js`, the only authoring surface on the device).
   Register the house to a real corner, then author at 1:1 with a tape measure: rooms/walls/edges,
   dimensions via a 3D numpad, markers, heights, electrical conduit + wires (electrical or Ethernet)
   with circuit diagnostics, a plumbing pipe network, **surface materials and door, window,
   furniture, switch, outlet and Ethernet products** (all in the MATERIAL group), save/load in 6
   slots, export (sheets, DXF, JSON, view link, QR), and an **AR 3D view on LEFT X** that hides every
   plan overlay while on. Mode list: `docs/ar-survey.md`.

**Sharing:** `🔗 Share view` (desktop) or the AR `link`/`qr` export opens a **read-only** session.
Detail: `docs/share-view.md`.

**The goal (unchanged):** Phase 5 — an on-site MR survey tool, multi-storey, authored entirely in AR.
Read `docs/product-intent.md` before planning AR work.

## What changed in session 32

> Next agent: when you add your own section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete this list. Detail for every item is in the named doc. Sessions
> 30–31 are folded into the sections below and the docs.

1. **Owner walk:** applied materials on the Quest; the MATERIAL flow was clear (no per-item
   pass/fail). They looked for a furniture material and found none, which led to (2).
2. **Furniture merge built** (`e9ace98`): a FURNITURE zone carries an optional product (`article`,
   `productMm`, `facing`); product picked in **MATERIAL · FURNITURE**; furniture solved one-way after
   the structure; old `floor.furniture[]` items migrate to zones on load. `docs/furniture.md` "One
   furniture zone" + "The merge" hold the design and the evidence (Node on the owner's house: 0 of 57
   furniture dims removed, sheets byte-identical; desktop Chrome: a migrated item drawn in View 3D).
3. **Material badges** (`63e640a`): an applied material shows one swatch badge at its target's centre
   on the AR plan, never a colour fill or strip (owner: overlays made the plan hard to read).
4. **FURNISH removed + AR 3D view shows only the model** (`912be58`), both owner-confirmed on the Quest.
5. **PASSAGE zone kind + Monastère readout** (`ac60665`): PASSAGE = open doorway, door-family for
   flooring/3D, no leaf. The 30×30 line was cut off by the 4-line readout pill; the pill now fits 6.
6. **Doors open in the AR 3D view too** (`8948472`): the owner expected it; asked, chose open in AR.
7. Not built: a desktop product picker for furniture, a desktop "dimension removed" message, the
   furniture front notch in the desktop 2D sketch.

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
- **Switch, outlet and Ethernet products are a material category on the marker** (owner, 2026-09-27):
  stored as `marker.product` (not a finish, carried by view links), switch products on switches,
  outlet products on `outlet` / `outlet_appliance`, Ethernet products on `ethernet` only (not
  `ethernet_dual` / `camera_ethernet`). **Model only the visible parts** (plate, rocker, socket), never the in-wall
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
- **The AR 3D view (LEFT X) shows only the 3D model** (owner, 2026-09-27): plan overlays are hidden
  for the render only (`hideForArch3d` / `view.onXRAfterRender`), so modes' visibility logic is
  untouched; reticle, HUD and panels stay.
- **An applied material is a centre badge on the AR plan, never a coloured fill/strip** (owner, 2026-09-27).
- **PASSAGE** (owner, 2026-09-27): an open doorway between two rooms; floors meet at its middle like
  a door; no leaf, nothing to rotate.
- **The controller readout holds up to 6 lines** (tighter pitch past 4); a mode that needs more must
  condense, as the pinwheel house line does (`HOUSE 8 · 4 · 2 packs`).
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
- **Chrome tools:** screenshots of a WebGL preview tab can time out even though the page rendered.
  Instead the scratch page POSTs `canvas.toDataURL()` to a tiny local receiver (`scratchpad/bedview/recv.mjs`
  on :5191), and ffmpeg builds side-by-side comparisons with the photos. The javascript tool returns a bare
  async IIFE as `{}` (prefix `await`) and blocks output containing a query string. Stop
  scratch Vite servers by port (`ss -ltnp | grep :5190`), not `pkill -f` (it kills its own shell).
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
- **Leroy Merlin sibling articles** (other sizes of a range) aren't linked from the page. Their refs sit
  near each other: `HEAD` the same URL slug with neighbouring refs from inside the Chrome tab (found the
  Monastère 30×50, 72831311, that way).
- **The owner's house view link with markers on (~3.1k chars) doesn't fit a QR**; share the text `link`
  instead (`docs/share-view.md`).
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

All pushed, all with descriptive bodies. Doc-only commits are omitted.
- **Session 32:** `e9ace98` furniture merge + MATERIAL · FURNITURE · `63e640a` material badges ·
  `912be58` 3D-only AR view, FURNISH removed · `ac60665` PASSAGE, Monastère readout fits ·
  `8948472` doors open in the AR 3D view.
- **Session 31:** `3362251` Ethernet product · `c44fd5c` products in view links · `38d42c5` View 3D on
  phones · `899d72d` in-room half wall · `00b4612` terrazzo · `977a29d` V120 piano · `46cd6a8`
  `4cad922` Monastère, Lucia, detail layer · `9a82898` open doors in View 3D.
- Earlier sessions: see `git log`.

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
| `src/ui/view3d.js` | Three.js renderer shared by AR and the desktop 3D viewer (overview/POV camera, pinch, walk, tilt); `_animate` feeds the HUD's `time:` split |
| `src/io/shareView.js` | View-link payload (compact positional schema; marker slot 4 height flag, slot 5 product) |
| `src/core/architectural3d.js` | Plan → slabs/walls/openings/stairs + `wallMarkerPlacements()` (pure, Node-testable) |
| `src/io/planSheet.js` | Sheets (incl. the shared monochrome `drawMarkerGlyph`) |
| `src/core/model.js` / `constraints.js` / `conduit.js` | Model + `_emit`; the solver; conduit graph + routing |
| `src/core/i18n.js` | EN/FR/ZH strings: every new mode needs `mode.*` + `help.*` |
| `src/core/circuits.js` | Derived circuits (per wire nature) + `circuitDiagnostics` for MARKER · CHECK |
| `src/core/materials.js` / `src/core/flooring.js` | Finish catalog; takeoff, regions, wall faces (pure, Node-testable) |
| `src/ui/finishTextures.js` | Canvas pattern textures shared by View 3D and the AR 3D view; product `design`s per pattern (`DESIGNS` stagger, `BRICK_DESIGNS`, `GRID_DESIGNS` mosaic/terrazzo/limestone, `OCT_DESIGNS`, `PINWHEEL_DESIGNS`), their bump maps, the shared stone cloud helpers (`stoneField`, `drawStoneCloud`) and the View 3D detail layer (`DETAIL_DESIGNS`, `applyFinishDetail`) |
| `tools/product-images.mjs` | Per-retailer product photo extraction (`--snippet` for Chrome-only sites) |
| `src/ui/furnitureCatalog.js` | The furniture catalog fetch, once, shared by View 3D, AR and migrated-zone sizing |
| `src/core/apertureGlyph.js` | Shared plan-symbol segments for sheets, DXF and the AR plan (door, passage, window, …, furniture notch) |
| `src/ui/proceduralFurniture.js` | Code-built furniture (`procedural: <kind>` catalog entries: STOCKHOLM bed, Daikin wall units, NEO shower tray, V120 upright piano); used by the AR 3D view and View 3D |
| `src/ui/doorProducts.js` | Door product builder (frame, leaf `DESIGNS`: Ange-Line, LINE; hardware) from `doorProductPlacements` |
| `src/ui/deviceProducts.js` | Switch/outlet/Ethernet product builder: shared `plate()` (pyramid + stadium collar) and `flatInsert()`, `rocker` (single/double), `socket` and `rj45` designs, lofted from radial outlines; cached per entry, clones share geometry |
| `src/ui/windowProducts.js` | Window product builder (`PROFILES` per design: frame, sashes, glass, hardware) from `windowProductPlacements` |
| `public/furniture/index.json` | Furniture catalog: IKEA articles + procedural entries (`params` hold the tweakable dimensions) |
| `src/main.js` / `src/ui/sketch2d.js` | Desktop wiring / 2D editor (incl. read-only view mode) |

## Next step

- **A — Owner walks the parked work on the Quest**, then update `docs/ar-qa-checklist.md` (items exist
  for each). Newest first:
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
- **B′ — More products** as the owner names them: run `/model-product <link>`; a real manufacturer
  model is always checked first. Offered, not asked for: detail designs for terrazzo, the mosaic and
  the oak; a desktop quantity table (per room and size: tiles, cut, m², boxes); a wastage margin; the
  Lucia leaf decor tile.
- **B‴ — Quest-to-TV mirror / Steam Deck viewer:** parked by the owner. If resumed, start from
  `docs/share-view.md` "Parked" (first step: a ping-only page pair on the Deck).
- **B″ — Materials phase 4:** the owner's own products entered in AR (numpad: size, joint, pack) into
  `project.materials`. Possible improvements the owner has not asked for (see `docs/materials.md`):
  - per-region pattern offset to cut waste;
  - a plank texture drawn from the real cut plan;
  - the hidden face below a half wall that stands inside a room (still counted in the wall area).
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

- **Unwalked, Hypothesis only.** Session 32: everything in Next step A's first bullet. Session 30:
  - everything in Next step A;
  - frame cost of the AR 3D view (Lambert walls + textures; opaque walls may hide the real room);
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
