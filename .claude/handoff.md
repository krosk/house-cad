# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc — live state only. Stable detail lives in:
- `docs/ar-survey.md` — how the AR survey tool (`src/ui/mr.js`) is built: modes, inputs,
  dimensioning, multi-floor/LEVEL, HUD, perf, durable traps. **Trust it over this file for structural
  detail, BUT it is NOT updated for s24 (aperture AR bits, A/X-rotate, LEFT-stick plan rotate, hand-
  mode prompt) or s25 (EXPORT-panel LANGUAGE row, heater glyph)** — see Next step A.
- `docs/ar-qa-checklist.md` — the on-device QA record (what's been walked on the Quest vs not).
- `CLAUDE.md` — core (desktop) architecture, build/verify, git workflow, deployment.
- `packaging/quest-apk.md` — Quest APK runbook (read before any packaging work).
- `docs/markers-plan.md` — the vertical-elements (markers) design + follow-on roadmap.
- `docs/furniture-handoff.md` — furniture-in-AR (M1–M3) detail.
- Claude memory (auto-loads): `phase5-xr-intent`, `multi-floor-design`, `ar-2d-parity`,
  `quest-guardian-limitation` — Phase-5 rationale + XR gotchas; `conduit-wiring-model` +
  `cross-floor-conduit` — the electrical two-layer model and its cross-floor promotion;
  `ikea-3d-model-pipeline` — furniture. Don't duplicate them here.

**Date:** 2026-09-19 (session 25)
**Status:** Quest APK path WORKING. Session 25 shipped **3 commits, all pushed** (HEAD `411249d` =
`origin/main`, clean tree except pre-existing/untracked noise — see Commits). It was a **desktop
output-features** session: furniture-dims filter, a **heater** zone kind, a **per-export sheet
language** picker, a **saved-revision counter**, and two fixes (furniture no longer carves the
footprint; origin-referenced dims now print). All **desktop build- (+ headless SVG-render/round-trip)
-verified**; the AR-side bits (EXPORT panel LANGUAGE row + taller panel, heater floor glyph) are
**AR-UNWALKED**. The prior **three unwalked lanes still await a Quest: (1) the aperture AR bits + s24
AR interactions, (2) the whole conduit lane + s23 input rework, (3) now the s25 AR export/heater
bits.** No AR walking happened this session.

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` before planning), multi-storey, authored entirely
in AR. Electrical is a **whole-house two-layer model** (`src/core/conduit.js`): a **conduit network**
(nodes + segments, surface inferred per segment; a node's z is floor-relative so a cross-storey
segment is a **riser**) with **wires routed over it** (path derived by shortest route, never stored).
A bare junction can be **dimensioned to a wall** (a `{node}` constraint, one-way in `solveConduitNodes`).
Markers are a **parallel annotation lane** (never touch the footprint/boolean/extrude pipeline).
**Apertures** (door/window/half-wall/sliding) are subtract zone kinds sharing one model
(`[sill,head]` band + `hinge`/`swing`) and one glyph module (`src/core/apertureGlyph.js`) feeding
print/DXF/AR — see memory `aperture-zones` and the Standing decision below.
Furniture-in-AR (real IKEA GLBs via a Cloudflare Worker proxy) is landed. Serialize is **v3**.
**On device (proven, older sessions):** APK installs/enters AR; SETUP+PLAN+PROJECT save/load/lang;
MARKER·DIMS pin→floor-dim; s21 grip-drag perf, mode cycle, change-map, marker changes; a first
partial conduit pass (s21). **Build-verified only:** everything in sessions 22–23 (node-dims,
cross-floor conduit/risers, furniture M3, and all of s23's conduit polish + input rework), plus most
of the MARKER lane, LEVEL, deeper change-map. Before planning marker/dimension/electrical/input work,
read `docs/ar-survey.md`.

## What changed in session 25 (3 commits, all pushed)
> Next agent: as you add your own section, fold live constraints into "Standing decisions" /
> "Findings" and delete this narrative.

Desktop **output-features** session. Touched `src/core/{zoneColors,model,apertureGlyph,geometry2d,
i18n}.js`, `src/io/{serialize,planSheet,dxf,outputOptions}.js`, `src/ui/mr.js`, `src/main.js`,
`index.html`. All **desktop build- + headless-verified**; AR-side items **AR-unwalked**:

1. **Furniture-dims output filter** (`eed2423`). New `furnitureDims` output layer (default **off**),
   gated behind the `furniture` layer (a dim to an undrawn furniture edge would dangle). Now **7**
   output toggles; the AR EXPORT panel grew a row (canvas H 836→896). See Standing decision.
2. **Heater zone kind** (`3d19bde`). Behaves like a half wall (solid low band, `head:null`, no hinge)
   but its own category: amber color, radiator-fin glyph (`heaterFinSegments` in `apertureGlyph.js`),
   `HEATER` DXF layer, `sill` default 0.6. Fully data-driven off `ZONE_KINDS` → AR cycles it for free.
3. **Furniture no longer carves the footprint** (`3d19bde`). `computeFootprint` skips furniture, so
   the room outline (and 3D shell) encloses furniture instead of notching around it. Room-area was
   already furniture-free.
4. **Origin-referenced dims now print** (`3d19bde`). Bug: a structural dim measured **from the shared
   origin corner** (a natural datum for half walls) was dropped from the sheet though DXF drew it.
   New `structuralDimLine()` resolves `ORIGIN_ID`→coord 0 (matches DXF); used in `drawDimensions` +
   `contentBBox`. This was the "half-wall dims don't show" report — reproduced + fixed headless.
5. **Per-export sheet language** (`3d19bde`). `t()`/`revLabels()`/`localizedFloorName()` take an
   explicit `lang`. Desktop Print menu gained a `Language` `<select>`; AR EXPORT panel gained a
   `LANGUAGE` row (canvas H 896→948). Independent of the app UI language; defaults to it; session-only.
6. **Saved-revision counter** (`411249d`). `Project.revision` + `bumpRevision()`; see Standing
   decision. The change-map legend/tooltip wording moved **"REV — CHANGES" → "CHANGES"** to reserve
   "revision" for this counter (internal identifiers unchanged).

## Standing decisions (live constraints; stable architecture is in the docs above)

- **Apertures are ONE model, ONE glyph source** (memory `aperture-zones`). Kinds `door`/`window`/
  `halfwall`/`heater`/`sliding` are subtract zones carrying `sill`/`head` (+ `hinge`, + `swing` on
  door/sliding); `heater` (s25) behaves like `halfwall` (solid low band, no hinge) but is its own
  category (amber, radiator-fin glyph, `HEATER` DXF layer). Defaults in `APERTURE_DEFAULTS`
  (`zoneColors.js`); `Rectangle.setKind` resets them on
  retype, `rotateAperture` cycles orientation (door+sliding 4-way, window 3-way). All plan symbols
  come from `src/core/apertureGlyph.js` so print (`planSheet`), DXF (`dxf`), and the AR floor overlay
  (`mr.js` `addApertureGlyphs`) **cannot diverge** — arcs are sampled as segments (no backend arc),
  and `resolveApertureOrient()` maps hinge+swing to `hingeEnd`/`perp` from each caller's own corners
  so the flipped print page keeps left/right AND in/out put. Sliding's 10 cm overhang is passed in
  the caller's units (meters for DXF/AR; page-scaled `0.10*(L.X(1)-L.X(0))` for print). `extrude.js`
  is deliberately NOT aperture-aware yet. Serialize stays v3 (fields additive; old files re-default).
- **Furniture is NOT building massing (s25).** `computeFootprint` (`geometry2d.js`) skips `furniture`
  kind, so it never carves the footprint or the 3D extrusion — the room encloses it. Its plan symbol
  is still drawn separately (furniture output layer). Room-area already excluded it.
- **Output layers (`outputOptions.js`): 7 toggles now** — `planDims`, `markerDims`, `markerIcons`,
  `wiring`, `furniture`, **`furnitureDims`** (s25), `area`. `furnitureDims` (default off) surfaces
  dimensions anchored to a furniture edge, but ONLY when `furniture` is also on (a dim to an undrawn
  edge would dangle) — like `wiring` is gated under `markerIcons`. Applies to sheets AND DXF.
  Persisted in `localStorage` (`house-cad:output:v1`), outside project saves.
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
  model change to a door/window/sliding needs a `buildPlan()` — same rebuild-by-hand rule as above.
  When touching a glyph, edit ONLY `apertureGlyph.js`: the print page's Y is flipped vs plan, so
  hinge/swing are resolved from **mapped corners** (`resolveApertureOrient`), not `min=lo` — never
  bake left/right or in/out into the glyph functions. Arcs are sampled as line segments (backends
  have no arc primitive).

## Commits (substantive only; doc-only omitted — `git log` has all)

All pushed to `origin/main`; every push auto-deploys to Pages. **s25 (`eed2423..411249d`):**

- `411249d` Add saved-revision counter; rename change-map label to CHANGES.
- `3d19bde` Add heater zone, per-export sheet language, fix furniture footprint + origin dims.
- `eed2423` Add opt-in furniture-dims output filter (sheets + DXF).

**Earlier (shipped; behaviors are in `CLAUDE.md`/`docs`/memories):** s24 `b5a7b6b..c620880` (aperture
lane: half-wall/door/window/sliding unified `[sill,head]`+`hinge`+`swing` model + shared glyph module,
4-way rotate, LEFT-stick plan rotate, pick-up-controllers prompt) · s23 `f0d89e1..04a5ab3` (conduit
ribbons + node floor-discs/stack-cycle + node-placement fix + input rework: A=flip/B=delete/grip
non-destructive) · s22 `d402702..f0d89e1` (conduit-node dims + cross-floor conduit/risers/serialize
v3 + furniture M1–M3) · s21 `d674321..aaaba08` (grip-drag perf, mode-cycle reorder, change-map polish
+ i18n) · `fb4bb80` conduit re-architecture · earlier sheets/zones/DXF/markers/LEVEL. `git log` has all.

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
| `src/ui/mr.js` | Whole MR session: modes, HUD, numpad, grip-drag, input polling (`pollModeCycle`), conduit ribbons/nodes, `deleteInMode`/`deleteDimContext`, stack cyclers |
| `src/core/model.js` | `Floor`+`Project`; `_emit` solves + notifies; `addConduitNode`/`addConduitSegment` (now `{emit}`-aware); conduit ops |
| `src/core/conduit.js` | Conduit graph + Dijkstra route; `conduitNetworkSegments`/`segmentSurface`; wires route over conduits |
| `src/core/i18n.js` | EN/FR/ZH strings; `t()`/`revLabels()`/`localizedFloorName()` take an optional `lang` (per-export language) |
| `src/core/apertureGlyph.js` | **Sole** source of door/window/half-wall/**heater**/sliding plan glyphs + `resolveApertureOrient`; consumed by planSheet, dxf, mr |
| `src/core/zoneColors.js` | `ZONE_KINDS` (incl. `heater`), colors, `APERTURE_DEFAULTS`, `isAperture` |
| `src/core/geometry2d.js` | `computeFootprint` (skips furniture), room components/area |
| `src/io/outputOptions.js` | 7 output-layer toggles (incl. `furnitureDims`) + format; persisted in `localStorage` |
| `src/io/planSheet.js` / `src/io/dxf.js` | Print sheet / DXF; `drawZoneGlyph`/`writeZoneSymbol` call the aperture module; sheet strip stamps `Rev N`; `structuralDimLine` handles the origin datum |
| `docs/ar-survey.md` | Kept-current AR structural reference (modes/inputs/dimensioning/traps) — **NOT yet updated for s24** |
| `docs/ar-qa-checklist.md` | On-device QA record (walked vs not) |

## Next step

- **A — APERTURE + s25 AR BITS: WALK ON DEVICE + DOC IT (newest, desktop-verified).** s25 desktop
  features are DONE (build + headless verified) — do NOT rebuild them; what remains is AR walking +
  the doc. On device: **(s25)** in PLAN·ADD/EDIT confirm a **heater** cycles in and its radiator-fin
  floor glyph matches the sheet; in EXPORT confirm the new **LANGUAGE** row cycles the sheet language
  (preview + download) independently of the app UI language, the taller panel lays out cleanly (7
  toggles + COMPARE + LANGUAGE + button all fit, no clipping), and the **furnitureDims** toggle
  behaves; sanity-check a furniture zone no longer notches the room outline. **(s24)** in PLAN EDIT
  select a door and press **A/X** → 4 swing states (window 3-way, sliding 4-way); door-swing/window-
  casement/half-wall-hatch/sliding glyphs draw (`addApertureGlyphs`) and match the sheet; the
  **pick-up-controllers** prompt (set controllers down → notice, pick up → HUD returns); the
  **LEFT-stick ±20° plan rotate**; and that A/X-rotate-in-EDIT didn't disturb A/X-flip (DIMS/TRANSLATE)
  or B/Y-delete. **Then update `docs/ar-survey.md`** — it describes none of the s24 aperture AR bits
  NOR the s25 EXPORT LANGUAGE row / heater glyph. Design: memory `aperture-zones`. Deferred by owner
  (do NOT build unprompted): height-aware `extrude` that carves `[sill,head]`, and a sill/head editor.
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

- **Every AR-side change from s22–s25 is AR-unwalked.** From s25: the EXPORT panel now has a 7th
  toggle AND a LANGUAGE row (canvas grew 836→896→948) — confirm it fits/reads and the LANGUAGE row
  cycles preview+download language; the heater floor glyph is screen-verified only. From s24: **A/X
  also rotates a selected aperture in PLAN EDIT** — confirm it doesn't disturb A/X-flip in
  DIMS/TRANSLATE (an `else if` after them, gated on `edit` mode + `rotateAperture()` truthy). From
  s23: delete moved off grip onto B/Y — confirm no mode still expects grip-to-delete.
- **Heater defaults are a guess (s25):** amber color + `sill` 0.6 m (a radiator height, deliberately
  not the half-wall's 1.1 m). Owner may want different. `heaterFinSegments` fin count/proportions are
  screen-verified only.
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
