# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc — live state only. Stable detail lives in:
- `docs/ar-survey.md` — how the AR survey tool (`src/ui/mr.js`) is built: modes, inputs,
  dimensioning, multi-floor/LEVEL, HUD, perf, durable traps, artifacts. **Kept current — trust it
  over this file for structural detail.**
- `docs/ar-qa-checklist.md` — the on-device QA record (what's been walked on the Quest vs not).
- `CLAUDE.md` — core (desktop) architecture, build/verify, git workflow, deployment.
- `packaging/quest-apk.md` — Quest APK runbook (read before any packaging work).
- `docs/markers-plan.md` — the vertical-elements (markers) design + follow-on roadmap.
- Claude memory (auto-loads): `phase5-xr-intent`, `multi-floor-design`, `ar-2d-parity`,
  `quest-guardian-limitation` — Phase-5 rationale and XR gotchas. Don't duplicate them here.

**Date:** 2026-09-13 (session 18)
**Status:** Quest APK path WORKING. On-device QA: SETUP + PLAN + PROJECT(save/load/lang) passed
(s14); MARKER · DIMS commit + floor dim-line render verified on device (s16). **The repo was 12
commits ahead of where the s16 handoff was frozen** — sessions after s16 shipped a lot without
updating this file, so those commits are reconstructed from `git log` below, not from live session
notes. **Sessions 17–18 then added the refinements and electrical-link work below.**

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` before planning), multi-storey, authored entirely
in AR. **Proven on device:** APK installs/verifies/enters AR; SETUP + PLAN + PROJECT save/load/lang
(s14); and **MARKER · DIMS pinning an outlet to an edge → the orange dashed floor dim commits and
renders** (s16, both X and Y pins). **Build-verified only (never walked):** LEVEL (multi-floor); the
rest of the MARKER lane (EDIT drop/height/drag/delete/retype, the s15 switch glyph, LINK
switch-to-light controls/automatic ceiling routes, DIMS
white-when-pinned / hover-outline / one-way-pin); cross-cutting HUD/input; accuracy — the checklist
is the only record. Markers are a **parallel annotation lane**: wall-anchored points that never touch
the footprint/boolean/extrude pipeline; the solver stays 2-axis. Before planning marker or dimension
work, read `docs/ar-survey.md`.

## What landed since the s16 handoff (`0d13f0c` → `28a9868`)
> Reconstructed from `git log` by session 17 — the sessions that shipped these did not keep this
> file current, so there are no live session notes, only commit messages + code. Next agent: fold
> live constraints into `docs/ar-survey.md` (stable) or "Standing decisions", delete the narrative.

Grouped by theme (newest first within each; see `git log 0d13f0c..HEAD` for exact order):

1. **Plan sheets — the CLAUDE.md "Plan sheets" section is the outcome.** `f98d85c` printable
   to-scale sheets (one per floor, dual SVG+canvas backend so desktop print/download and the in-AR
   preview can't diverge; new `src/core/dimline.js` shared `edgeLineWorld`; new AR **PROJECT·SHEET**
   mode). Then `274d502` refine sheets + marker editing, `28a9868` align floor print sheets,
   `d56f688` allow dimension labels beyond endpoints.
2. **Zone vocabulary expanded** (add/subtract is no longer the whole story): `b38ab05` door zones,
   `cff5dbb` window, `44b5ada` stairs + cabinet. `991c3cf` show connected room areas.
3. **AR / multi-floor:** `d048228` teleport + dimension-label placement; `339cfb7` move Quest floor
   plans between storeys; `1334f20` read-only all-floors AR view.
4. **Closed prior "Next step" items:** `b38ab05` **AR unit selector** (parity gap D — unit switch in
   AR); `0226cbd` **confirm Quest save overwrites** (parity gap D); `15dc9c0` **copy floors between
   saved projects** (item C — desktop↔APK model transfer, advanced).
5. **`1b49b36` (s17) RJ45/ethernet marker glyph** redrawn as a real network port (framed socket +
   8 contacts + centered latch recess), consistent across `src/io/planSheet.js` (sheet symbol) and
   `src/ui/mr.js` (AR canvas glyph). Build-clean; both surfaces eyeballed via rsvg render (sheet
   symbol + AR faceplate) — reads clearly as a jack. Pushed; on-device raster still unwalked.
6. **(s17) dimension-leader fix — sheet + AR.** The s16 "labels beyond endpoints" feature
   (`d56f688`) let `labelT` fall outside 0..1 but the dim LINE was still drawn only endpoint-to-
   endpoint, so a value box dragged past an end printed/rendered floating with nothing connecting it.
   Added `drawLabelLeader` (planSheet, all 4 draw spots) + `pushLeader` (mr.js, all 6) to continue
   the line from the nearer endpoint out to the label. planSheet verified by rsvg render of a
   labelT=1.5 dim (leader draws to the outside box); mr.js build-verified only.
7. **(s18, `7e4d43c`) semantic plan-sheet symbols.** Door, window, stairs, and cabinet
   rectangles now retain their identity on SVG/print and the live left-controller sheet instead of
   reading as anonymous footprint cutouts. Each uses distinct black-and-white linework and appears
   in its own per-floor zone legend row; AR preview labels follow LANG. Production build clean;
   focused SVG check confirms all 4 symbols + labels with finite geometry. Paper/Quest visual QA
   remains.
8. **(s18, `7e4d43c`) one shared sheet transform everywhere.** `sharedScaleSheetOptions`
   computes the maximized project-wide scale/orientation/origin once per rendition, rounding the
   fitted ratio denominator upward to a whole number (`1:56.7` → `1:57`) so content still fits. Print All,
   active-floor desktop SVG, AR preview, and AR SVG download now all use it, so a single-floor sheet
   exactly matches its page in the multi-floor set and can be physically superposed without scaling.
9. **(s18, `57d4848`) sheet generation timestamp.** The title strip includes an unambiguous
   local `YYYY-MM-DD HH:mm`. Shared sheet options capture the time once so every floor page in a
   print run agrees; the AR canvas label follows LANG.
10. **(s18, `ee3b628`) stable sheet orientation + Quest texture refresh.** Shared orientation
    is selected from authored rectangles/markers, excluding movable dimension annotations; dragging
    a label can reduce scale but cannot rotate the pages. If a legitimate geometry edit does change
    orientation, the left-panel CanvasTexture is recreated after the canvas dimensions swap, avoiding
    Quest's stale/squeezed prior texture and ensuring right-controller sheet changes appear.
11. **(s18, `f29d6b3`) compact whole dimensions.** Structural and marker-pin values whose
    formatted fractional part is all zeros print as integers (`3.00` → `3`, `300.0` → `300`) to
    narrow their white value boxes; fractional values keep normal unit precision.
12. **(s18, `f29d6b3`) active-floor DXF export.** The desktop Print menu now downloads an
    ASCII AutoCAD 2000 DXF in millimeters at 1:1 model scale. `src/io/dxf.js` preserves computed
    footprint, authored room/wall/door/window/stairs/cabinet rectangles and symbols, structural and
    marker dimensions, room areas, origin, marker glyphs/heights, and semantic layers for Coohom.
13. **(s18, `492da88`) AR DXF action.** `PROJECT · DXF` reuses the optional left-controller
    floor preview. RIGHT thumbstick up/down selects any floor without changing the active floor;
    RIGHT trigger downloads that floor as the same layered 1:1 millimeter DXF used on desktop.
14. **(s18, `e2459fd`) fixed PLAN EDIT label.** The controller mode breadcrumb stays
    `PLAN · EDIT` when a zone is selected or retyped. Only the separate prominent
    `TYPE · ROOM/WALL/DOOR/WINDOW/STAIRS/CABINET` readout changes with thumbstick up/down.
15. **(s18, `e2459fd`) fixed MARKER EDIT label.** The same UI separation now applies to
    markers: the breadcrumb stays `MARKER · EDIT`, while a persistent separate
    `TYPE · OUTLET/SWITCH/LIGHT/ETHERNET` readout shows the selected marker type or next drop type.
16. **(s18, `e2459fd`) PLAN ADD + separate type.** The former contextual `PLAN · ROOM/WALL/...`
    label is now the fixed `PLAN · ADD` action. Its separate persistent
    `TYPE · ROOM/WALL/DOOR/WINDOW/STAIRS/CABINET` readout alone changes with thumbstick up/down.
17. **(s18, `e2459fd`) origin DIMS after teleport.** PLAN DIMS now hit-tests the origin at
    plan-space `(0,0)` instead of raw `planPos`. The selectable target therefore follows the visible
    origin gizmo when `navOffset` moves the whole plan through TELEPORT.
18. **(s18, `38f03d5`) electrical switch-to-light links.** New `MARKER · LINK`: trigger a
    switch source, then trigger lights to toggle pairwise control links; grip clears the source.
    AR shows derived dotted switch→ceiling→light routes only in LINK, with source/target outlines.
    Per-floor `electricalLinks` persist through old-save-compatible load, copy/paste id remapping,
    marker cleanup, and floor moves. SHEET/SVG draws the dotted plan projection; DXF emits true 3D
    route segments on `ELECTRICAL_ROUTE`. Manual wall/floor/ceiling waypoints remain future work.
19. **(s18, `26564d1`) any-storey FLOOR calibration + fixture-stack sheets.** FLOOR derives the
    shared ground datum from the selected storey's touch and modeled elevation. Co-located markers
    print in bracketed, height-aware white boxes shared by SVG and the LEFT-controller preview.
20. **(s18, pending commit) FURNITURE plan type.** Added to desktop and AR ADD/EDIT cycling,
    persistence, orange semantic color, and output support. Furniture and its constraints remain active in the
    model but are omitted by default from sheet footprint/legend/scale/drawing. Furniture subtracts
    also do not reduce the connected-room area; fixed subtract kinds still do.
21. **(s18, pending commit) marker-dimension sheet values are black.** Marker-pin lines and label
    borders remain amber for domain identity; only the value text changes to high-contrast black.
22. **(s18, pending commit) unified AR output panel.** `PROJECT · EXPORT` replaces separate SHEET
    and DXF modes. It always targets the active LEVEL floor; thumbstick up/down switches SVG/DXF.
    Ray-triggered device-local toggles control plan dims, marker dims, marker icons, furniture, and area,
    and only a separate EXPORT button downloads. The optional LEFT sheet previews these choices
    immediately. Preferences use `house-cad:output:v1` and never enter project saves. Furniture
    constraints remain excluded even when furniture geometry is enabled in SVG/DXF.
23. **(s18, pending commit) room-aware fixture callouts.** Sheet stacks retain horizontal layout
    for equal-height fixtures and vertical layout for differing heights, but their complete callout
    now evaluates left/right/above/below against the printable footprint and chooses the room side.
    Page containment remains the fallback for isolated markers.
24. **(s18, pending commit) room-aware isolated-marker heights.** A single marker with a zero-distance
    constraint to a real edge now places its height chip on the room side using the same four-way
    footprint scoring. Unconstrained singles retain the conventional chip below the glyph.

## Standing decisions (live constraints; stable architecture is in the docs above)

- **Controller roles are fixed, never last-active.** RIGHT owns the complete editing UI/input lane.
  Optional LEFT is an independent companion: an enlarged, live active-floor print sheet follows the
  controller in every mode, and its cyan reticle + trigger always teleport. LEFT grip/sticks do not
  invoke editor actions. With no LEFT source, its sheet/reticle are absent and RIGHT works alone.
  Only physical-controller input sources (`gamepad` and no `hand`) qualify; hand pinch/select is
  ignored. The sheet is positioned 0.42 m on the controller's outside (-X), clear of the aim ray,
  yawed 45° inward, and pitched 45° upward toward the headset for a natural leftward glance.
  Its opaque-white canvas is a transparent-pass material at render order 90, above every world
  overlay/panel (≤33) and below the fixed right-controller HUD (100), so plan tint/dim labels cannot
  paint across the paper.
- **Input model: thumbstick-y = "cycle the current thing"; B/Y ≠ mode nav.** Thumbstick up/down
  cycles the contextual attribute per mode (LEVEL floor, EXPORT SVG/DXF, UNIT, LANG, MARKER type/retype,
  PLAN·ADD kind, PLAN·EDIT kind). Mode nav is thumbstick-x + A/X. B/Y only flips a completed DIMS
  pair. **Label chip + help box must stay in sync** — change both via `setModeInfo`, never
  `applyModeVisual` alone, or the info panel goes stale.
- **Plan and marker are disjoint editing/dimensioning domains.** EDIT and DIMS each exist twice — a
  PLAN variant (zones/edges/origin) and a MARKER variant (markers/floor-icons/pins) — and each ignores
  the other lane's targets. Don't merge them into one mixed picker. Marker X/Y is pinned via the
  **projected floor icon**, never the wall-height glyph.
- **Markers are a parallel lane, NOT massing.** Never enter footprint/boolean/extrude; solver stays
  2-axis. X/Y pins resolve one-way in `solveMarkers` (marker follows the wall) and are EXCLUDED from
  the rect solve. z is **inherent** (typed in MARKER EDIT), never a constraint axis. "Fully pinned /
  white" = X and Y pinned. One pin per (marker, axis); re-picking a wall re-anchors. A marker pin's
  constraint endpoint is `{marker}` (no `.rect`) — see the Sketch2D trap below.
- **Git: commit + push directly on `main`, no feature branches. Every push auto-deploys to Pages
  = publishes** — only push when asked. No `gh` CLI; deploy check:
  `curl -s "https://api.github.com/repos/krosk/house-cad/actions/runs?per_page=1"`.
- **`npm run build` is the only automated check** (no tests/linter/types). Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs. **All AR work is build-verified only except
  the on-device scope in Status above.**
- **This machine is a Steam Deck (SteamOS), Node v20 via nvm.** No system `java`/`adb` — Bubblewrap
  brought its own under `~/.bubblewrap/`. The fnm/Node-22 block in `CLAUDE.md` is Windows-only;
  ignore it here.
- **Web change = Pages deploy + relaunch the APK** (SW usually swaps it; watch the HUD build stamp)
  or `adb shell pm clear com.krosk.housecad`. Rebuild the APK only for `twa-manifest.json` changes.
- **LATENT (not in this repo):** `~/house-cad-apk/app/src/main/res/values/strings.xml` is missing
  `appName`/`launcherName`; add them before the next `bubblewrap build` or the label regresses.

## Findings / traps worth knowing

- **The desktop `Sketch2D` stays LIVE during the AR session and re-renders on every
  `project.onChange`.** Any consumer of `project.constraints` (the 2D editor, `main.js`
  `renderConstraints`, serialize, future marker work) must tolerate **marker** endpoints (`{marker}`,
  no `.rect`) and the **origin** (`rect === ORIGIN_ID`). A throw in ANY `onChange` listener propagates
  out of `_emit` and aborts the AR caller mid-commit — this is exactly what silently killed marker-dim
  commits (s16). Full note in `docs/ar-survey.md` traps.
- **`material.color.setHex()` needs a NUMBER, not a CSS string.** `C_WALL1/C_WALL2` (`'#22d3ee'`…)
  are canvas strings for the RECAL badges; passing one to `setHex` → `NaN` → the mesh renders
  **black**. Highlight/strip colors must be numeric hex. (Full note in `docs/ar-survey.md` traps.)
- **`mr.js` does NOT subscribe to `project.onChange`** — it rebuilds overlays manually via
  `buildPlan()`/`applyPlanMatrix()`. Any model-changing action (LOAD, height/floor/marker edits)
  must call them itself. (Full trap list in `docs/ar-survey.md`.)
- **`rlog` debugging works only on the dev server**, not the APK/Pages (POST `/__log` →
  `quest-debug.log`, gitignored — never stage it). To debug an AR bug, open the dev server's `?ar=1`
  page in the **plain Quest Browser** (not the TWA, which has no console); `rlog` lines land in
  `quest-debug.log` on this machine. This is how the s16 bug was pinpointed.

## Commits (substantive only; doc-only omitted — `git log` has all)

HEAD moves with each push; `git log` has the full list.

- `26564d1` (s18) FLOOR calibration works from any selected real storey by deriving the
  shared ground datum as `touchY - activeElevation`; Upper/Basement no longer reject the touch.
- `26564d1` (s18) plan-sheet fixture stacks now group markers within 80 mm inclusive in plan under one
  bracket. Within it, full-3D 80 mm-inclusive neighbors share an outlined white box: horizontal + one height
  when level, vertical + per-glyph heights when not. Distant height groups keep separate boxes on
  the same leader. Shared by print/SVG and the live LEFT-controller canvas preview.
- (s17) zone area readout: `connectedRoomComponents` (geometry2d) now deducts subtract cutouts
  (net area, not gross union) — flows to the AR EDIT info-panel `area:` line AND the plan sheet.
  mr.js `selectedZoneArea` broadens the readout to ANY selected zone (room = net connected-room
  area; other = own footprint), relabeled `room:` → `area:`. NOTE: user reported not seeing the
  area on device; no code bug found for a selected room (compute + display condition both correct,
  multiPolygonArea always finite) — suspected stale device build (check the `build:` HUD stamp). If
  a fresh build still shows nothing, add rlog to the EDIT selection path (only way to debug XR here).
- (s17) zone color coding: new shared palette `src/core/zoneColors.js` (room=blue, wall=red,
  door=green, window=cyan, stairs=yellow, cabinet=purple, furniture=orange; kind encodes op,
  blue=only add). Desktop
  sketch2d `_drawRect` = faint kind fill + kind outline (red subtract-hatch removed). AR mr.js =
  per-kind edge outlines + zebra + faint per-subtract-zone fills over the room footprint fill, plus
  DROP chip / HUD readouts / selected-outline. Build-clean + palette swatch verified; **AR visuals
  build-verified only (not walked on device).**
- `fad10a2` (s17) extend dimension line to labels dragged past endpoints (sheet + AR).
- `1b49b36` (s17) redraw ethernet marker as RJ45 jack (sheet + AR in sync).
- `28a9868` align floor print sheets · `d56f688` dim labels beyond endpoints · `991c3cf` connected
  room areas · `cff5dbb` window zone · `44b5ada` stairs+cabinet zones · `1334f20` all-floors AR view ·
  `15dc9c0` copy floors between projects · `b38ab05` door zones + AR unit selector · `0226cbd`
  confirm Quest save overwrites · `339cfb7` move Quest plans between storeys · `d048228` teleport +
  dim-label placement · `274d502` refine sheets/markers · `f98d85c` printable plan sheets (s16→s17).
- `0e98d02` (s16) fix: 2D editor no longer crashes the change bus on marker pins (the marker-DIMS
  commit/render bug).
- `bb8eb1d` (s16) fix: unify mode label + help via `setModeInfo()` (the s15 info-panel fix).
- `aa364e2` (s15) AR markers (switch) + thumbstick pickers/retype + merged PLAN·DROP + input
  consolidation (B/Y no-cycle) + ORIGIN/RECAL color fixes + docs + `ar-qa-checklist.md`.
- `262beb3` (s12) AR markers (outlet) — parallel annotation lane + revert world-vertical HUD stack.
- Session 13 (plan/marker split): `c9a8fe5`, `36e068e`, `c201de9`, `20de9df`, `21fb9ef`, `7706cb5`,
  `5560020`, `c5726e5` (Codex `AGENTS.md`).
- `ef24512` (s11) in-headset multi-floor (LEVEL); `5bb8e1a` (s11) HUD edge size/battery/help + perf.

## Resuming from a clean checkout

```bash
npm install                                            # once
npm run dev -- --host --port 5174 --strictPort         # https dev server; report the https:// Network URL
npm run build                                          # the only automated check — expect "✓ built in …"
```

Node v20 + `node_modules` present; dev server often already up on `:5174`. LAN IP last seen
`192.168.1.154` (AR page: `https://192.168.1.154:5174/?ar=1` — open in the **plain Quest Browser**
for `rlog`, not the TWA). Quest APK project (`~/house-cad-apk`), assetlinks repo (`~/krosk.github.io`),
`~/.bw_pw`, and Bubblewrap's JDK/SDK already exist — see `packaging/quest-apk.md` (don't re-init).

## Next step

- **A — FINISH ON-DEVICE QA (tracked in `docs/ar-qa-checklist.md`).** Still never walked: **LEVEL**
  (floor seed/cycle/height/stacking); **MARKER EDIT** (drop/height/3D-drag/delete/`markerAtPoint`-
  first, switch glyph); **MARKER DIMS** remainder — commit+render is now proven (s16), but
  white-when-both-pinned, the hover bold-outline linking icon↔glyph, and one-way pin (marker moves,
  not the wall) are still unchecked; the **marker-inert cross-checks** in PLAN EDIT/DIMS; **markers
  round-trip in SAVE/LOAD**; cross-cutting HUD; accuracy. Debug via the plain Quest Browser (`?ar=1`)
  — the release TWA has no console.
- **B — Markers: next increments** (`docs/markers-plan.md`). ~~switch + type picker~~ **DONE (s15).**
  ~~light / ethernet types~~ **DONE**. ~~logical switch-to-light links + automatic ceiling routes~~
  **DONE (s18, `38f03d5`)**. Remaining: manual surface-anchored wall/floor/ceiling waypoints.
- **C — Model transfer desktop→APK.** `15dc9c0` added copy-floors-between-saved-projects; still
  open: desktop autosave (`house-cad:autosave:v1`) vs AR slots (`house-cad:slot:<i>`) use different
  localStorage keys — verify the TWA sees Quest-Browser storage and decide if LOAD should surface the
  desktop autosave as a slot.
- **D — Remaining parity gaps** (`ar-2d-parity` memory): ~~unit switch in AR~~ DONE (`b38ab05`);
  ~~overwrite-confirm~~ DONE (`0226cbd`); still open: slot naming/delete; LEVEL's inert SWAP/DEL keys
  could be hidden.
- **E — On-device QA of the s16→s17 features.** Plan sheets (including the persistent enlarged
  LEFT-controller live preview) + SVG download while immersive, the new zone types
  (door/window/stairs/cabinet/furniture), teleport, move-plans-between-
  storeys, all-floors AR view, AR unit selector — all **build-verified only**. The committed Ethernet
  glyph still needs a visual check on both surfaces.
- ~~marker-DIMS commit/render bug~~ — FIXED (`0e98d02`, s16). ~~RECAL corner-select reticle~~ — DONE
  (`5560020`, s13). ~~subtract/dim ops/save-load/in-AR floors/first markers/plan-marker split/
  ROOM+WALL merge~~ — DONE. ~~Store distribution~~ — out of scope.

## Known open questions

- **Most of the MARKER lane + LEVEL + cross-cutting HUD/input + accuracy are still build-verified
  only.** No runtime/XR guard exists — the checklist is the only record. The s16 bug is a reminder
  that a build pass hides real XR-only crashes.
- **MARKER DIMS unverified remainder (s16):** glyph turns WHITE when both X and Y pinned; hover/lock
  bold-outline links floor icon ↔ wall glyph; the pin is one-way (moves the marker, not the wall);
  the floor dim label is selectable/grip-draggable in MARKER DIMS only.
- **MARKER EDIT / switch (s15) still unwalked:** retype swapping the glyph immediately; switch rocker
  glyph reading clearly through walls; `markerAtPoint`-first pick; grip-drag depth; empty-space drop
  height capture.
- **Upper/basement overlay height** depends on hand-entered storey heights (LEVEL) — only as good as
  what's typed. Anchor drift over a multi-room/multi-floor house untested.
