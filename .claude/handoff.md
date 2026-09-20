# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc — live state only. Stable detail lives in:
- `docs/ar-survey.md` — how the AR survey tool (`src/ui/mr.js`) is built: modes, inputs,
  dimensioning, multi-floor/LEVEL, HUD, perf, durable traps. **Trust it over this file for structural
  detail. NOW UPDATED through s26** (session 27): the mode-hierarchy diagram was corrected to the
  actual `MODE_ORDER`/`MODE_GROUP` (FURNISH is its own group; TRANSLATE moved to PROJECT; 4 hidden
  modes), plus new sections "Apertures & vertical bands" and "Vertical authoring (heights & datums)",
  the FURNISH mode, the datum-relative height pads, A/X aperture-rotate, LEFT-stick plan-yaw, the
  pick-up-controllers prompt, the 7-toggle EXPORT panel + LANGUAGE row, and matching traps. The
  remaining s24–s26 gap is **on-device walking**, not documentation — see Next step A.
- `docs/ar-qa-checklist.md` — the on-device QA record (what's been walked on the Quest vs not).
- `CLAUDE.md` — core (desktop) architecture, build/verify, git workflow, deployment.
- `packaging/quest-apk.md` — Quest APK runbook (read before any packaging work).
- `docs/markers-plan.md` — the vertical-elements (markers) design + follow-on roadmap.
- `docs/furniture-handoff.md` — furniture-in-AR (M1–M3) detail.
- `docs/electrical-workflow.md` — the three electrical lanes (conduit / wire / control), the
  intended conduit→wire→circuit authoring order, and how circuits derive (`src/core/circuits.js`).
- Claude memory (auto-loads): `phase5-xr-intent`, `multi-floor-design`, `ar-2d-parity`,
  `quest-guardian-limitation` — Phase-5 rationale + XR gotchas; `conduit-wiring-model` +
  `cross-floor-conduit` — the electrical two-layer model and its cross-floor promotion;
  `ikea-3d-model-pipeline` — furniture; `aperture-zones` — the aperture/heater band model + AR
  sill/head editor; `vertical-datum` — **FLOOR-ONLY** heights (ceiling datum removed s28) + the
  grab-lock rule + the AR Z-dim visual; `share-view-url` — view-only 3D share links (#fragment) +
  the AR QR export + the compression analysis. Don't duplicate them here.

**Date:** 2026-09-20 (session 28)
**Status:** Quest APK path WORKING. Session 28 shipped **1 commit, pushed, Pages deploy GREEN** (HEAD
`4d1fa31` = `origin/main`; clean tree except pre-existing/untracked noise — see Commits). Three
independent, **desktop-side + Node-verified, AR-UNWALKED** efforts: (1) **vertical heights are now
FLOOR-ONLY** — the ceiling-relative datum was removed (owner: "Ref to Floor is the only requirement");
(2) **AR vertical (Z) dimensions** — a static, non-interactive height readout per object, colored to
match the piece (markers amber, conduit nodes purple, apertures blue); (3) **view-only 3D SHARE** —
a lossy geometry snapshot compressed into the URL `#fragment` (desktop 🔗 button) + an **AR `qr`
export format** that ships that link as a QR-code PNG. Added dep: `qrcode-generator`. The still-
unwalked AR lanes are unchanged and now grow by the s28 Z-dims + QR: **(1)** s24 aperture interactions
+ s25 export/heater bits, **(2)** the whole conduit/wire lane + s23 input rework, **(3)** s26's
vertical-authoring surface, **(4)** the s27 headset-pivot rotate, **(5)** s28 Z-dims + `qr` export. No
AR walking happened this session.

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` before planning), multi-storey, authored entirely
in AR. Electrical is a **whole-house two-layer model** (`src/core/conduit.js`): a **conduit network**
(nodes + segments, surface inferred per segment; a node's z is floor-relative so a cross-storey
segment is a **riser**) with **wires routed over it** (path derived by shortest route, never stored).
A bare junction can be **dimensioned to a wall** (a `{node}` constraint, one-way in `solveConduitNodes`).
**Circuits** (s27) are a **derived projection of the wire lane** (`src/core/circuits.js`): a `breaker`
marker is each circuit's terminal, and a circuit is the connected component of the device↔wire graph
containing it — derived, never stored; NOT yet in any output. The three electrical lanes (conduit /
wire+circuit / control-link) + the intended authoring order are in `docs/electrical-workflow.md`.
Markers are a **parallel annotation lane** (never touch the footprint/boolean/extrude pipeline).
**Apertures** (door/window/half-wall/**heater**/sliding) are subtract zone kinds sharing one model
(`[sill,head]` band + `hinge`/`swing`) and one glyph module (`src/core/apertureGlyph.js`) feeding
print/DXF/AR; s26 added an **AR sill/head band editor** (PLAN EDIT) — see memory `aperture-zones`.
Furniture-in-AR (real IKEA GLBs via a Cloudflare Worker proxy) is landed; s26 gave the GLB a **foot
elevation** and the placeholder zone a **`[foot,top]` band**. **Heights are FLOOR-referenced only**
(s28 removed the ceiling datum; `zDatum` is just free-vs-defined, and a defined height holds in the
3D grab — memory `vertical-datum`); **s28 also added an AR Z-dim visual** (a static vertical bar +
value per defined-height object). A house can be **shared as a view-only 3D link** — solved geometry
(no constraints, mm-rounded, deflate) in the URL `#fragment`, or an **AR QR PNG** of that link
(memory `share-view-url`, `src/io/shareView.js` + `src/io/qr.js`). Serialize is **v3** (all fields
additive).
**On device (proven, older sessions):** APK installs/enters AR; SETUP+PLAN+PROJECT save/load/lang;
MARKER·DIMS pin→floor-dim; s21 grip-drag perf, mode cycle, change-map, marker changes; a first
partial conduit pass (s21). **Build-verified only:** everything in sessions 22–23 (node-dims,
cross-floor conduit/risers, furniture M3, and all of s23's conduit polish + input rework), plus most
of the MARKER lane, LEVEL, deeper change-map. Before planning marker/dimension/electrical/input work,
read `docs/ar-survey.md`.

## What changed in session 28 (1 commit `4d1fa31`, pushed, deploy green)
> Next agent: as you add your own section, fold live constraints into "Standing decisions" /
> "Findings" and delete this narrative.

Three independent, desktop-side, **build + Node-round-trip verified, AR-UNWALKED** efforts:

1. **Vertical heights are FLOOR-ONLY** (`constraints.js`, `model.js`, `serialize.js`, `mr.js`,
   `i18n.js`). Owner: "I don't need a ceiling delta setting. Ref to Floor is the only requirement."
   Removed `solveVerticalDatums`/`applyCeilingDatum` + `zOff` + the ceiling branch of `setVertical`;
   `zDatum` is now just **free (undefined) vs `'floor'` (defined → holds in a 3D grab)**. `serialize`
   coerces legacy `zDatum:'ceiling'`+`zOff` → `'floor'` losslessly (the stored `z` was already the
   resolved absolute height); one shared `verticalFields()` normalizer. AR height pads: SWAP toggles
   free↔floor, DEL frees Z with the **standard** DEL label (owner dropped the `⊘ FREE Z` caption;
   `z.freeKey` i18n removed). Furniture foot pad is floor-only (SWAP inert). Detail: memory
   `vertical-datum`.
2. **AR vertical (Z) dimension visual** (`mr.js` `zDimGroup`/`buildZDims`). A static, non-pickable
   height readout — a slim vertical bar + value label(s) — for any object with a defined vertical
   extent, **colored to match the piece's X/Y dims**: markers **amber**, bare conduit nodes
   **purple** (`0xa78bfa`), apertures **blue** spanning the `[sill,head]` band (open-top rises to
   ceiling; zero sill omitted). Built from `buildMarkers`+`buildConduits`; cleared in `buildAllFloors`.
3. **View-only 3D SHARE + AR QR export** (`src/io/shareView.js`, `src/io/qr.js` NEW; `main.js`,
   `index.html`, `outputOptions.js`, `mr.js`). `serializeView` drops constraints (~78% of a file) and
   ships solved geometry (mm-rounded) via `#fragment`; `loadView` reuses `deserializeInto` with
   `constraints:[]` (solver is a no-op). Desktop **🔗 Share view** button; startup decodes `#view=`
   (wins over autosave, sets `viewMode` which **suppresses autosave** so a link never clobbers the
   viewer's project). AR adds a `qr` **output format**: `performExport` ships the link as a QR PNG
   (ECC L, whole-house, honors the `markerIcons` toggle) through the existing Web-Share/download path.
   New dep `qrcode-generator`. Detail: memory `share-view-url`.

## Standing decisions (live constraints; stable architecture is in the docs above)

- **Apertures are ONE model, ONE glyph source** (memory `aperture-zones`). Kinds `door`/`window`/
  `halfwall`/`heater`/`sliding` are subtract zones carrying `sill`/`head` (+ `hinge`, + `swing` on
  door/sliding). **`heater` is a BOUNDED solid `[sill,head]` band** (default `0`/`0.6`, amber,
  radiator-fin glyph, `HEATER` DXF layer) — NOT the old `head:null` half-wall clone (s26 fix; a heater
  has a top, doesn't reach the ceiling). Defaults in `APERTURE_DEFAULTS` (`zoneColors.js`);
  `Rectangle.setKind` resets them on retype, `rotateAperture` cycles orientation (door+sliding 4-way,
  window 3-way). All plan symbols come from `src/core/apertureGlyph.js` so print (`planSheet`), DXF
  (`dxf`), and the AR floor overlay (`mr.js` `addApertureGlyphs`) **cannot diverge** — arcs sampled as
  segments (no backend arc), and `resolveApertureOrient()` maps hinge+swing to `hingeEnd`/`perp` from
  each caller's own corners so the flipped print page keeps left/right AND in/out put. Sliding's 10 cm
  overhang is passed in caller units. `extrude.js` is deliberately NOT aperture-aware yet — **so
  sill/head/foot/top reach NO output (glyph/sheet/DXF/extrude); only serialized.** Serialize stays v3.
- **AR sill/head + furniture band share ONE "band pad" (s26).** Selecting a band-carrying rect in PLAN
  EDIT opens the reused DIMS numpad as a band editor (`band*` fns in `mr.js`); `verticalBandFields(rect)`
  (`zoneColors.js`) is the authoritative per-kind field list: apertures→`apertureBounds` (sill/head),
  furniture→`[foot,top]`, else `[]`. The **SWAP cell cycles the field** (labels namespace `aperture.*`
  vs `furniture.*`); ENTER writes `rect[field]` with a band-ordering guard; A/X still rotates, B/Y
  deletes the zone. (The band pad is floor-referenced; there is no datum toggle to add — ceiling was
  removed s28.)
- **Furniture: two things, both NOT massing.** (1) the **`furniture` ZONE kind** (a placeholder rect,
  `[foot,top]` band) and (2) **GLB furniture** (`floor.furniture[]` real models, `z` foot elevation).
  `computeFootprint` (`geometry2d.js`) skips `furniture` zones; GLB furniture never enters the pipeline.
  GLB `z` lifts the model in AR (`buildFurniture` `(x,z,-y)`); furniture grip-drag is **floor-planar**
  (x/y only), so a GLB foot is pad-only (no Z-grab) and its pad DEL stays "delete item".
- **Heights are FLOOR-referenced ONLY; grab is 3D but holds a defined Z (s28; memory
  `vertical-datum`).** INVARIANT: **stored `z` is always the height above the (active) floor.** The
  ceiling-relative datum was REMOVED (owner: "Ref to Floor is the only requirement"): no `zOff`, no
  `solveVerticalDatums`/`applyCeilingDatum`. `zDatum` is now just **free (undefined) vs `'floor'`
  (defined)**. **No `zDatum` = height never defined = FREE in the grab.** The **3D grip-drag holds
  any axis with a defined dim**: X/Y from `marker._locked`, **Z when `zDatum` is set**
  (`nz = obj.zDatum ? obj.z : tipZ` in `applyMarkerGripDrag`/`applyConduitNodeGripDrag`). Marker/node
  height pads: **SWAP toggles free↔floor, DEL frees Z** (standard DEL caption); furniture-foot pad is
  floor-only (SWAP inert, DEL deletes the item). Setters `setMarkerVertical`/`setFurnitureVertical`/
  `setConduitNodeVertical(id,datum,value)` via shared `setVertical` (datum `'free'` drops the flag).
  `serialize` coerces legacy `'ceiling'`+`zOff` → `'floor'` (lossless). Z is NOT in the solver (2× 1-D
  X/Y). — **AR Z-DIM VISUAL (s28):** a static, non-pickable vertical bar + value per defined-height
  object (`zDimGroup`/`buildZDims` in `mr.js`, always visible, active floor), colored to the piece:
  markers amber, bare nodes purple, apertures blue over the `[sill,head]` band. Built from
  `buildMarkers`+`buildConduits`; cleared in `buildAllFloors`. This is the FIRST surfacing of aperture
  sill/head anywhere (was serialize-only).
- **View-only 3D SHARE (s28; memory `share-view-url`).** `serializeView`/`loadView`
  (`src/io/shareView.js`) ship a **lossy, non-parametric** geometry snapshot (constraints dropped =
  ~78% smaller; mm-rounded; deflate) in the URL `#fragment` — no server, QR-able. `loadView` reuses
  `deserializeInto` with `constraints:[]` (solver is a no-op with no constraints). Desktop 🔗 button;
  `main.js` startup decodes `#view=` (wins over autosave; sets `viewMode` that **suppresses autosave**
  so a shared link never clobbers the viewer's own project). AR ships it as a **QR PNG** (`qr` output
  format; `src/io/qr.js` ECC L; `qrcode-generator` dep) via the existing Web-Share/download path.
  Compression fact for any future size work: post-gzip only float precision matters (mm rounding cut a
  full file 16.3→10.1 KB gzip), key-shortening ~3% (not worth it).
- **Output layers (`outputOptions.js`): 7 layer toggles** — `planDims`, `markerDims`, `markerIcons`,
  `wiring`, `furniture`, **`furnitureDims`** (s25), `area`. `furnitureDims` (default off) surfaces
  dimensions anchored to a furniture edge, but ONLY when `furniture` is also on (a dim to an undrawn
  edge would dangle) — like `wiring` is gated under `markerIcons`. Applies to sheets AND DXF.
  Persisted in `localStorage` (`house-cad:output:v1`), outside project saves. **`OUTPUT_FORMATS` now
  includes `qr`** (s28) — the odd one out: whole-house view-only SHARE, not a per-floor sheet; it
  ignores the layer toggles (bar `markerIcons`, which it reuses to include markers in the view).
- **Structural dims resolve the ORIGIN to coord 0 on the sheet (s25).** `structuralDimLine()` in
  `planSheet.js` (used by `drawDimensions` + `contentBBox`) — a dim measured from the shared origin
  corner now prints, matching DXF. Marker/`{node}` endpoints still return null (drawn elsewhere).
- **Export/print SHEET language is chosen independently of the app UI language (s25).** `t()`,
  `revLabels()`, `localizedFloorName()` take an optional `lang` (defaults to current UI lang). Desktop
  Print menu has a `Language` `<select>`; AR EXPORT panel has a `LANGUAGE` row (cycled like COMPARE,
  session-only state `exportSheetLang`, fed to preview + download via `sheetLabelOpts(lang)`). DXF
  layer names stay fixed English (no localized text in DXF).
- **Saved-revision counter (s25) — "revision" is reserved for THIS.** `Project.revision` (0 = never
  saved) + `bumpRevision()`; advanced ONLY by explicit saves (desktop `house.json` Save button + AR
  slot save), NEVER by autosave. Serialized/restored (v3, additive → old files load as 0). Stamped on
  export filenames (`plan-<floor>-rN-…`, omitted at 0) and the printed-sheet strip (`<floor> · Rev N`,
  i18n `sheet.revision`). Distinct from the **change map** (whose legend/tooltip now say "CHANGES",
  not "REV") — do not reintroduce "revision"/"REV" wording for change-map output.
- **s23 conduit lane (build-verified, AR-unwalked):** conduit segments are thick vertical ribbons
  (`makeConduitRibbon`, `CONDUIT_RIBBON_W`=0.03 m; WebGL ignores `THREE.Line` linewidth); nodes draw
  a floor-projection disc + leader with CONDUIT-EDIT stack-cycling (repeat-trigger, next in yellow);
  DIMS grip stack-cycles co-located nodes/markers before the ref-A pick; node placement batches into
  one `touch()` (no per-op `_emit` cascade). Detail in `docs/ar-survey.md`.

- **Input model (REWORKED s23 — this supersedes all earlier A/B/grip notes).**
  - **thumbstick-x** = cycle mode (both ways). It is the ONLY mode nav (A/X prev-mode was removed as
    an asymmetric one-off).
  - **thumbstick-y** = "cycle the current thing" per mode (LEVEL floor, UNIT, LANG, MARKER type,
    PLAN·ADD/EDIT kind, FURNISH article, EXPORT format/baseline). No-op where nothing applies.
  - **A/X** = **FLIP**: a completed DIMS dimension (`swapDim`→`flipConstraintSide`, NOT
    `swapConstraint`) or the pending TRANSLATE coordinate; inert otherwise.
  - **B/Y** = **DELETE** where applicable: DIMS removes the dimension constraint (`deleteDimContext`
    — a completed pair, else a hovered dim label); else `deleteInMode` (PLAN EDIT zone, MARKER,
    FURNISH item, CONDUIT EDIT hovered segment else selected node+segments, WIRE selected wire).
    TRANSLATE has nothing to delete → inert.
  - **grip** = **non-destructive only**: grab-drag a target (armed in `onSqueezeStart`: DIMS panel,
    EDGE, MARKER wall glyph, CONDUIT EDIT bare node, FURNISH item), or cancel/undo/back-out in
    `onReset` (DIMS undo + pre-pick stack cycle; EDGE cancel; TRANSLATE/REGISTER/RECAL back-out;
    LINK clear source; CONDUIT pen-lift; WIRE pop-via). Grip NO LONGER deletes.
  - **thumbstick-hold (~1.2 s)** = exit AR. **Label chip + help box must stay in sync** via
    `setModeInfo`, never `applyModeVisual` alone.
- **Controller roles are fixed, never last-active.** RIGHT owns the complete editing UI/input lane.
  Optional LEFT is an independent companion (enlarged live print sheet + cyan teleport reticle);
  LEFT grip/sticks never invoke editor actions. Only physical-controller sources (`gamepad`, no
  `hand`) qualify. (Full sheet-placement detail in `docs/ar-survey.md`.)
- **Plan and marker are disjoint editing/dimensioning domains.** EDIT and DIMS each exist twice (a
  PLAN variant and a MARKER variant) and each ignores the other lane's targets. Marker X/Y is pinned
  via the projected floor icon, never the wall-height glyph.
- **Markers are a parallel lane, NOT massing.** Never enter footprint/boolean/extrude; solver stays
  2-axis. X/Y pins resolve one-way in `solveMarkers`. z is inherent (typed in MARKER EDIT). A marker
  pin's constraint endpoint is `{marker}` (no `.rect`) — see the Sketch2D trap.
- **Conduit bare junctions can be DIMENSIONED to a wall — a THIRD pin kind.** `{node}` endpoint
  mirrors `{marker}`: one-way in `solveConduitNodes`, excluded from the rect solve, z inherent. The
  DIMS numpad switches on a 3-way domain (`plan`/`marker`/`node` via `dimDomain`/`modeDomain`), NOT a
  boolean — keep it 3-way. Every constraint consumer (2D editor, panel, serialize, sheet/DXF) must
  skip `{node}` (no `.rect`, no `.marker`); node dims never reach sheet/DXF output. Marker-bound nodes
  are never pinned. Design: memory `cross-floor-conduit`.
- **Circuits are DERIVED from the wire lane, never stored (s27).** A `breaker` marker is each circuit's
  terminal; a circuit is the connected component of the {device markers, `project.wires` edges} graph
  containing it (`src/core/circuits.js` `deriveCircuits`, union-find). Identity/metadata
  (`number`/`rating`/`poles`) live ON the breaker marker (persisted, additive); membership is derived.
  Because grouping is on the wire layer, wires from different circuits SHARE conduit with no ambiguity —
  never put a circuit id on conduit. **Control links are NOT circuit edges** (they're the control lane).
  It is a pure model helper: NOT called in `_emit`, NOT in output. Rationale + workflow:
  `docs/electrical-workflow.md`. The three electrical lanes are conduit / wire (+circuit) / control-link.
- **LEFT-stick plan rotate pivots about the HEADSET, not the origin (s27).** Keeps the world point under
  the user fixed. `planYaw`/`planPos` are session anchoring (view/companion), never model geometry.
- **Continuous AR drags must NOT run the full `_emit` cascade per frame.** `project.touch()`→`_emit`
  solves all floors AND notifies every desktop listener (3D re-extrude, 2D redraw, DOM panels) —
  frame-rate-killing. Patterns: marker drag `moveMarker(...,{emit:false})`; edge drag
  `project.solveSilently()`; dim/panel drag `rebuildDimsOnly()`; conduit node add/segment now take
  `{emit:false}` and commit once via `touch()`. Each commits once on release.
- **Change map is layer-gated, clustered, localized** (`drawChangeMap`). Baseline = one of 6 AR save
  slots; `localStorage` is per-device. (Detail in `CLAUDE.md` / `docs/ar-survey.md`.)
- **Git: commit + push directly on `main`, no feature branches. Every push auto-deploys to Pages
  = publishes** — only push when asked. No `gh` CLI; deploy check:
  `curl -s "https://api.github.com/repos/krosk/house-cad/actions/runs?per_page=1"`.
- **`npm run build` is the only automated check** (no tests/linter/types). Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs.
- **This machine is a Steam Deck (SteamOS), Node v20 via nvm.** No system `java`/`adb` — Bubblewrap
  brought its own under `~/.bubblewrap/`. The fnm/Node-22 block in `CLAUDE.md` is Windows-only;
  ignore it here. (Build here: `export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node
  | tail -1)/bin:$PATH"; npm run build`.)
- **Web change = Pages deploy + relaunch the APK** (SW usually swaps it; watch the HUD build stamp)
  or `adb shell pm clear com.krosk.housecad`. Rebuild the APK only for `twa-manifest.json` changes.
- **LATENT (not in this repo):** `~/house-cad-apk/app/src/main/res/values/strings.xml` is missing
  `appName`/`launcherName`; add them before the next `bubblewrap build` or the label regresses.

## Findings / traps worth knowing

- **`mr.js` does NOT subscribe to `project.onChange`** — it rebuilds overlays by hand
  (`buildPlan()`/`applyPlanMatrix()`/`buildConduits()`). Any model-changing action must call the
  right rebuild itself. **`buildPlan()` does NOT rebuild the mode-gated `conduitGroup`** — a model
  change that moves conduit geometry must call `buildConduits()`. (Bit twice in s22.)
- **Any dim-label drag/placement helper needs a branch per PIN kind.** `setDimOffset` /
  `setDimLabelPosition` (and `edgeLine`/`endpointCoord`) assume a drawable rect edge; a `{marker}` or
  `{node}` endpoint has none, so without an explicit branch the label FREEZES mid-drag. Marker AND
  node both need the branch.
- **The desktop `Sketch2D` stays LIVE during the AR session** and re-renders on every
  `project.onChange`. Any consumer of `project.constraints` must tolerate `{marker}`/`{node}`
  endpoints (no `.rect`) and the origin (`rect === ORIGIN_ID`). A throw in ANY `onChange` listener
  propagates out of `_emit` and aborts the AR caller mid-commit (silently killed marker-dim commits
  in s16).
- **`material.color.setHex()` needs a NUMBER, not a CSS string.** `C_WALL1/C_WALL2` (`'#22d3ee'`…)
  are canvas strings; passing one to `setHex` → `NaN` → the mesh renders **black**. Highlight/strip
  colors must be numeric hex.
- **`rlog` debugging works only on the dev server**, not the APK/Pages (POST `/__log` →
  `quest-debug.log`, gitignored — never stage it). Debug the dev server's `?ar=1` page in the **plain
  Quest Browser** (not the TWA, which has no console).
- **Aperture glyphs live in `planGroup`** (`addApertureGlyphs`, called from the buildPlan paths), so a
  model change to a door/window/heater/sliding needs a `buildPlan()` — same rebuild-by-hand rule as
  above. When touching a glyph, edit ONLY `apertureGlyph.js`: the print page's Y is flipped vs plan, so
  hinge/swing are resolved from **mapped corners** (`resolveApertureOrient`), not `min=lo` — never
  bake left/right or in/out into the glyph functions. Arcs are sampled as line segments (backends
  have no arc primitive). (Note: sill/head/foot/top edits change no glyph — they reach no output yet.)
- **The numpad SWAP cell is context-overloaded** (via `swapLabel`): FLIP (DIMS), field-cycle (band
  pad), **free↔floor toggle (marker/node height pads)**. Don't assume SWAP == FLIP. On a pad, **DEL**
  means "clear the DIM you're editing" (constraint in DIMS, **free Z** in marker/node height pads —
  now with the standard DEL caption), NOT the object — object-delete is B/Y. (Furniture-foot pad: SWAP
  inert, DEL deletes the item.) A z-edit that moves geometry needs `buildPlan()`/`buildConduits()` by
  hand (`mr.js` doesn't subscribe to `onChange`); a marker/node/aperture change also needs `buildZDims`
  to refresh the Z-dim bars (it runs inside `buildMarkers`+`buildConduits`).

## Commits (substantive only; doc-only omitted — `git log` has all)

All pushed to `origin/main`; every push auto-deploys to Pages. **s28 (`4d1fa31`, deploy green):**

- `4d1fa31` Share view as URL/QR; AR Z-dims; floor-only vertical datum.

**Earlier (shipped; behaviors are in `CLAUDE.md`/`docs`/memories):** s27 `f4362c5..273e5fc`
(headset-pivot plan rotate; derived circuits + `breaker` marker — `src/core/circuits.js`, model-only,
NOT in output) · s26 `356366a..e1a5548` (AR
vertical-authoring: aperture sill/head band editor, furniture foot/z + `[foot,top]` band,
datum-relative heights + Z grab-lock, DEL frees Z, heater bounded band) · s25 `eed2423..411249d` (desktop
output: furniture-dims filter, heater zone, per-export sheet language, saved-revision counter, +
furniture-footprint & origin-dim fixes) · s24 `b5a7b6b..c620880` (aperture lane unified model + shared
glyph, 4-way rotate, LEFT-stick plan rotate, pick-up-controllers prompt) · s23 `f0d89e1..04a5ab3`
(conduit ribbons + node floor-discs/stack-cycle + node-placement fix + input rework:
A=flip/B=delete/grip non-destructive) · s22 `d402702..f0d89e1` (conduit-node dims + cross-floor
conduit/risers/serialize v3 + furniture M1–M3) · s21 `d674321..aaaba08` (grip-drag perf, mode-cycle
reorder, change-map polish + i18n) · `fb4bb80` conduit re-architecture · earlier
sheets/zones/DXF/markers/LEVEL. `git log` has all.

**Uncommitted, NOT mine:** `git status` shows stray untracked files (`Document from Alexis He.json`,
`plan-*.png/.dxf`) that are NOT part of any effort — never stage them (use explicit paths, never
`git add -A`/`-A`). Offer to gitignore/delete if it helps. (`.claude/handoff.md` itself is committed
by this session's handoff.)

## Resuming from a clean checkout

```bash
npm install                                            # once (node_modules usually already present)
npm run dev -- --host --port 5174 --strictPort         # https dev server; report the https:// Network URL
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | tail -1)/bin:$PATH"
npm run build                                          # the only automated check — expect "✓ built in …"
```

Node v20 + `node_modules` present; dev server often already up on `:5174` (https, `--host`). LAN IP
last seen `192.168.1.154` (AR page: `https://192.168.1.154:5174/?ar=1` — open in the **plain Quest
Browser** for `rlog`, not the TWA). Quest APK project (`~/house-cad-apk`), assetlinks repo
(`~/krosk.github.io`), `~/.bw_pw`, and Bubblewrap's JDK/SDK already exist — see
`packaging/quest-apk.md` (don't re-init).

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/ui/mr.js` | Whole MR session: modes, HUD, numpad (band pad + free/floor height pads), grip-drag (X/Y/Z dim-lock), Z-dim visual (`zDimGroup`/`buildZDims`), `qr` export branch in `performExport`, conduit ribbons/nodes, `deleteInMode`, stack cyclers |
| `src/io/shareView.js` | **s28:** view-only share — `serializeView`/`loadView` (constraints dropped, mm-rounded), `encodeViewToHash`/`decodeViewFromHash` (base64url+deflate), `buildShareUrl` |
| `src/io/qr.js` | **s28:** QR (via `qrcode-generator`, ECC L) → PNG/SVG; `makeQr`/`qrToPngBlob`/`qrToSvg`; returns null past QR capacity |
| `src/core/model.js` | `Floor`+`Project`; `_emit` solves + notifies; `setVertical` (free/floor only)/`setMarkerVertical`/`setFurnitureVertical`/`setConduitNodeVertical`; conduit + furniture ops |
| `src/core/constraints.js` | 2× 1-D X/Y solver; `solveMarkers`/`solveConduitNodes` (one-way pins). (No vertical solver — Z is floor-referenced scalar.) |
| `src/core/conduit.js` | Conduit graph + Dijkstra route; `conduitNetworkSegments`/`segmentSurface`; wires route over conduits |
| `src/core/circuits.js` | **s27 (derived, not wired to output):** `deriveCircuits` — connected components of the device↔wire graph per breaker; conflict/unassigned classification + maps |
| `src/core/i18n.js` | EN/FR/ZH strings; `t(key,lang?)`; `aperture.*`/`furniture.*`/`z.*` (datum) + `marker.breaker` keys |
| `src/core/apertureGlyph.js` | **Sole** source of door/window/half-wall/**heater**/sliding plan glyphs + `resolveApertureOrient`; consumed by planSheet, dxf, mr |
| `src/core/zoneColors.js` | `ZONE_KINDS`, colors, `APERTURE_DEFAULTS`, `FURNITURE_BAND`, `isAperture`, `apertureBounds`, `verticalBandFields` |
| `src/core/geometry2d.js` | `computeFootprint` (skips furniture), room components/area |
| `src/io/serialize.js` | v3 JSON; rect `sill/head/hinge/swing/foot/top`; marker/node/furniture `z`+`zDatum` (floor-only via `verticalFields()`; legacy `'ceiling'`/`zOff` coerced); breaker `number`/`rating`/`poles` (all additive) |
| `src/io/outputOptions.js` | 7 output-layer toggles (incl. `furnitureDims`) + `OUTPUT_FORMATS` (now incl. `qr`); persisted in `localStorage` |
| `src/io/planSheet.js` / `src/io/dxf.js` | Print sheet / DXF; `drawZoneGlyph`/`writeZoneSymbol` call the aperture module; sheet strip stamps `Rev N`; `structuralDimLine` handles the origin datum |
| `docs/ar-survey.md` | Kept-current AR structural reference (modes/inputs/dimensioning/traps) — **updated through s26 (session 27)** |
| `docs/electrical-workflow.md` | **s27:** the three electrical lanes + conduit→wire→circuit authoring order + derivation rationale |
| `docs/ar-qa-checklist.md` | On-device QA record (walked vs not) |

## Next step

- **A — s24–s28 AR BITS: WALK ON DEVICE (newest, all build/Node-verified, NONE walked).** Do NOT
  rebuild — this is AR walking only; **`docs/ar-survey.md` is current through s26** (s27–s28 bits are
  below). Design: memories `aperture-zones` + `vertical-datum` + `share-view-url` +
  `ikea-3d-model-pipeline`. Walk, per feature:
  - **(s28 view SHARE / QR)** PROJECT · EXPORT → thumbstick to format **`QR · 3D VIEW`** → press
    EXPORT: should generate a QR PNG of the `#view=` link and offer Web Share (or download) on the
    Quest. Scan it from a phone → the Pages app opens the house in 3D (read-only). Confirm the Web
    Share sheet appears from immersive; toggle `markerIcons` and confirm markers ride along (denser QR).
  - **(s28 Z-dim visual)** A defined-height marker shows an **amber** vertical bar + value; a bare
    conduit node **purple**; a door/window/half-wall **blue** over its `[sill,head]` band. Confirm
    legibility/scale (guessed: 0.008 m bar, +5.5 cm label offset) and that they don't clutter.
  - **(s27 headset-pivot rotate)** LEFT-stick ±20° should now swing the room **around where you're
    standing** (the point under the headset stays fixed), not around the origin corner. Confirm it
    feels right off-center; flag if 20°/flick is too coarse/fine.
  - **(s26 band pad)** PLAN EDIT → select an aperture → the numpad opens as a band editor; SWAP
    cycles SILL/HEAD (door/sliding = HEAD only, half-wall = SILL only, window/heater = both); ENTER
    writes; confirm a **heater** shows both SILL+HEAD (it's a bounded band now). NOTE band edits are
    geometrically INVISIBLE (reach no output) — verify by re-selecting (pad prefills stored value).
  - **(s26/s28 datum + grab — NOW FLOOR-ONLY)** In marker/node height pads: **SWAP toggles free↔floor**
    (ceiling removed s28), typed value = height above floor, **DEL frees Z** (standard DEL caption).
    Payoff: grab a marker with a **defined height** and slide it — Z must HOLD (not drift); a **free**
    (never-height-set) marker grabs in full 3D. GLB **foot elevation** lifts the model (floor-only pad,
    SWAP inert); furniture grab stays floor-planar.
  - **(s24)** door A/X → 4 swing states (window 3-way, sliding 4-way); glyphs draw + match sheet;
    **pick-up-controllers** prompt; A/X-rotate-in-EDIT vs A/X-flip (DIMS/TRANSLATE) don't collide.
  - **(s25)** heater radiator-fin glyph matches sheet; EXPORT **LANGUAGE** row cycles sheet language
    (preview+download); taller EXPORT panel (7 toggles + COMPARE + LANGUAGE + button) no clipping;
    `furnitureDims` toggle; furniture zone doesn't notch the room outline.
  Deferred by owner (do NOT build unprompted): height-aware `extrude` that carves `[sill,head]`.
- **A2 — DESKTOP FOLLOW-UPS (only if owner asks).** (1) **desktop QR parity**: the desktop 🔗 Share
  view button copies a text link; a QR download would reuse `src/io/qr.js` in ~5 lines. (2) the AR
  Z-dim (s28) surfaces aperture sill/head IN AR; the print sheet/DXF still don't annotate sill/head/
  foot/top — a glyph annotation would make the desktop band editors observable too. (3) view SHARE
  could opt-in furniture/wiring layers (currently massing + optional markers). ~~band-pad datum
  toggle~~ — moot: heights are floor-only now, nothing to toggle.
- **C — CIRCUITS: SURFACE + AUTHOR (s27 groundwork landed; owner said "for documentation" for now, so
  only on request).** `src/core/circuits.js` derives circuits but nothing uses it yet. To make it real:
  (1) a proper **breaker glyph** (AR `markerFace`, `planSheet` `drawMarkerGlyph`, `dxf` `writeMarker` —
  today it falls back to the outlet glyph); (2) **surface circuits in output** — per-circuit NUMBER
  labels + a circuit schedule on the sheet (sheets are MONOCHROME by design — use numbers, not hue),
  per-circuit color in AR/DXF layers, conflict/unassigned warnings — all behind the opt-in `wiring`
  filter; (3) **AR breaker editing** of `number`/`rating`/`poles` (a small pad or desktop field —
  currently a placed breaker gets fallback number = stable index, `rating` null). Deferred by choice:
  tying a breaker to a `panel` enclosure via `panelId` (needs cross-marker remap on copy/paste).
  Full design + rationale: `docs/electrical-workflow.md`.
- **B — CONDUIT LANE + INPUT REWORK: FINISH ON-DEVICE QA.** Newest first, all unwalked:
  **(s23 input rework)** confirm the new muscle memory across every mode — **B/Y deletes** (PLAN EDIT
  zone, MARKER, FURNISH, CONDUIT EDIT segment vs node, WIRE, and a DIMS constraint), **A/X flips** in
  DIMS + TRANSLATE, **grip no longer deletes** (only drags/cancels), **A/X no longer prev-mode**
  (thumbstick-x is the only mode nav). **(s23 conduit polish)** thick ribbons visible + hover-yellow
  obvious; node floor-projection discs + leaders readable; CONDUIT EDIT node stack-cycle (repeat
  trigger, next previews yellow); DIMS grip stack-cycle before ref-pick; node-placement no longer
  freezes. **(s22, still unwalked)** CONDUIT·DIMS pick-node→edge→numpad incl. a 0 that snaps the
  junction onto the wall, then move a wall in PLAN EDIT and confirm pinned junctions + risers follow;
  cross-floor risers via adjacent-floor targets; cross-floor wires; opt-in CONDUIT/WIRE output toggle.
  `WAYPOINT_GRAB_M`=0.14 m grab threshold likely needs tuning (owner-flagged). Structural detail:
  `docs/ar-survey.md`; design: memories `conduit-wiring-model` + `cross-floor-conduit`.
- **H — FURNITURE: CI PROXY WIRING + WALK M3.** Landed but AR-unwalked, and the deployed build ships
  placeholder BOXES: `.env` (`VITE_IKEA_PROXY`) is gitignored, so the Pages/APK CI build has no proxy
  URL. Wire it into `.github/workflows/deploy.yml`'s build env (not secret) before relying on real
  models off the dev server, then walk M3 (drop/select/move/rotate/delete). Detail:
  `docs/furniture-handoff.md`, memory `ikea-3d-model-pipeline`.
- **G — CHANGE MAP: confirm the AR preview** (desktop side owner-confirmed s21): COMPARE-row cycling,
  live cloud refresh, per-redraw diff cost. Still deferred: electrical/conduit deltas aren't diffed.
- **E — FINISH GENERAL ON-DEVICE QA** (`docs/ar-qa-checklist.md`): LEVEL seed/cycle/height/stacking;
  MARKER EDIT (drop/height/3D-drag/`markerAtPoint`-first, switch glyph); MARKER DIMS remainder
  (white-when-both-pinned, hover bold-outline, one-way pin); marker-inert cross-checks in PLAN
  EDIT/DIMS; SAVE/LOAD round-trip; accuracy.
- ~~Session 22's node-dims/cross-floor/furniture as separate next steps~~ — folded into **B** and **H**
  above; they and s23's work are all one unwalked conduit/AR lane now.

## Known open questions

- **Every AR-side change from s22–s28 is AR-unwalked.** From s28: the `qr` export (Web Share from
  immersive? QR density/scan on device?) and the Z-dim visual (bar/label scale + colors + clutter) are
  build/Node-only. From s27: LEFT-stick rotate now pivots about the headset (feel off-center + 20°/flick
  granularity unverified). From s26: the band pad, the free↔floor SWAP + free-Z DEL in the height pads,
  the Z grab-lock, and the GLB foot lift are build+headless only. From s25: EXPORT panel toggles +
  LANGUAGE row fit/readability; heater glyph screen-only. From s24: A/X rotates a selected aperture in
  PLAN EDIT — confirm no collision. From s23: delete moved off grip onto B/Y.
- **View SHARE / QR round-trip is Node-verified, not browser/headset-verified.** `encodeViewToHash`/
  `decodeViewFromHash` + `loadView` round-trip the real 3-storey file in Node (floors/rects/markers/
  elevations preserved; footprint within 0.498 mm; mm-rounding drops sub-mm slivers, e.g. a floor went
  108→100 coords — benign). NOT yet confirmed: opening a scanned `#view=` link in a real mobile browser
  (needs `DecompressionStream`), and Web Share behaviour from the immersive Quest export.
- **Circuits (s27) are model-only and unexercised in the app.** `deriveCircuits` is verified by a
  scratchpad script but is not called anywhere in the app — no UI, no output, not in `_emit`. `breaker`
  markers render via the default (outlet) glyph. `deviceCount`/conflict/numbering semantics are design
  guesses until surfaced (Next step C).
- **Heater defaults are a guess (s25/s26):** amber; now a bounded band `sill:0, head:0.6`. Owner may
  want different. `heaterFinSegments` fin count/proportions screen-verified only.
- **s26/s28 defaults/feel are guesses:** furniture zone band `foot:0, top:0.9`; the `⊘`/`↑` datum
  glyphs on the height pad; whether "define a height ⇒ Z locks in grab" feels right. Unwalked.
- **Aperture glyph sizing/legibility on a printed sheet + AR floor** is only screen-verified (SVG/PNG
  render). Sliding 10 cm overhang, panel thickness, arrow reach, `APERTURE_GLYPH_HALF`=0.006 m strip
  are guessed. `extrude.js` is deliberately NOT aperture-aware (no 3D opening yet — owner-deferred).
- **Conduit ribbon + node-dot sizing** (`CONDUIT_RIBBON_W`=0.03 m, floor-dot radius 0.03 m, leader
  threshold) is guessed — may need tuning on device.
- **CONDUIT DIMS stack-cycle is grip-only** (no thumbstick/other); CONDUIT EDIT is repeat-trigger.
  That divergence is deliberate (DIMS trigger commits ref A immediately) but unwalked for feel.
- **Cross-floor conduit + risers (s22)** and **furniture M3 (s22)** remain build-verified only.
- **Change-map AR preview, most of the MARKER lane, LEVEL, cross-cutting HUD, accuracy** are all
  build-verified only. No runtime/XR guard exists — `docs/ar-qa-checklist.md` is the only record.
