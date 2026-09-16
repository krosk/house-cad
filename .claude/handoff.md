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
  `quest-guardian-limitation` — Phase-5 rationale and XR gotchas; `conduit-wiring-model` — the live
  electrical re-architecture + its decisions. Don't duplicate them here.

**Date:** 2026-09-16 (session 20)
**Status:** Quest APK path WORKING. Two features **COMMITTED + PUSHED** this session as `fb4bb80`
(published to Pages): (1) **Electrical re-architecture COMPLETE** — the two-layer CONDUIT-network +
wires-as-routes model (memory `conduit-wiring-model`), all 5 slices (`CONDUIT · EDIT`, `MARKER · WIRE`
redefined = auto-route + `via` override, sheet/DXF output, and full teardown of the legacy
per-wire-waypoint system + `createWire`→`addWire`) on top of `514da9f`; the old standalone-waypoint
wire system (`973f105`) is GONE. (2) **Change map** — revision clouds on the plan sheet diffing the live
project vs a saved-slot baseline (`src/core/planDiff.js` + `drawChangeMap`), wired into desktop Print
and AR PROJECT · EXPORT (COMPARE row). Both are build-green + Node-smoke-tested, **AR build-verified
only**. Next: on-device QA of both lanes — see Next steps A + G.

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` before planning), multi-storey, authored entirely
in AR. Markers are a **parallel annotation lane** (wall-anchored points — outlets/switches/lights/
network/panel — that never touch the footprint/boolean/extrude pipeline; the solver stays 2-axis).
**Electrical is now SHIPPED** (committed `fb4bb80`): a shared **conduit network** (graph of nodes +
segments drilled into walls/floors/ceilings, surface inferred per segment) with **wires routed over
it** (each wire = two device markers + optional `via` overrides; path DERIVED by shortest route, never
stored). Also shipped this session: the **change map** (plan-sheet revision clouds vs a saved-slot
baseline). **On device (proven):** APK installs/enters AR; SETUP + PLAN + PROJECT save/load/lang (s14);
MARKER · DIMS pin→floor-dim commit+render (s16). **Everything else is build-verified only** — the whole
marker lane, LEVEL, all electrical (CONDUIT / CONDUIT EDIT / WIRE), and the change map have never been
walked; `docs/ar-qa-checklist.md` is the only record. Before planning marker/dimension/electrical work,
read `docs/ar-survey.md` (kept current) and `docs/markers-plan.md`.

## What changed (s19 conduit re-architecture + s20 change map — both committed `fb4bb80`)
> Next agent: as you add your own section, fold live constraints into "Standing decisions"/"Findings"
> and delete narrative. The pre-s19 feature changelog was compressed away — those features
> (plan sheets, zone vocabulary incl. insulation/furniture, DXF+Coohom export, PNG/JSON export,
> monochrome sheets, fixture stacks, floor translate, the full marker glyph set incl. panel, and the
> now-superseded WIRE/WIRE EDIT) are all SHIPPED and documented in `CLAUDE.md`, `docs/ar-survey.md`,
> and `docs/markers-plan.md`. Use `git log` for the per-commit history.

**Conduit re-architecture — DONE + committed `fb4bb80`** (memory `conduit-wiring-model` has the full
design + decisions: auto shortest-path **+ manual via override**, **bare junction nodes allowed**,
switch→light **control links unchanged**). The old per-wire-waypoint lane (`973f105`) is entirely torn
out; its `panel` marker type + per-surface surface-inference stay. Now shipped:
`MARKER · CONDUIT` pen authoring, `CONDUIT · EDIT` (node select / dual-move by `WAYPOINT_GRAB_M` /
segment-split / delete; marker-bound nodes immovable), `MARKER · WIRE` (two markers → `addWire` auto
shortest route; conduit nodes = `addWireVia` overrides; grip pops via / deletes wire), and sheet+DXF
output (`CONDUIT` layer + per-surface routed wires). Structural detail in `docs/ar-survey.md`.

**Change map — DONE + committed `fb4bb80`** (this session). Plan-sheet revision clouds diffing the live
project vs a saved-slot baseline. `src/core/planDiff.js` id-matches SOLVED geometry (zones/markers/
structural-dimension-values, 1 mm tol; label placement + electrical deliberately NOT diffed);
`drawChangeMap` in `planSheet.js` renders clouds + numbered △ tags + a `REV — CHANGES` legend, gated by
`opts.changeMap` = `Map<floorId,diff>`. Entry points: desktop Print "Change map vs" slot picker; AR
`PROJECT · EXPORT` `COMPARE` row (thumbstick-when-pointed / tap; live in LEFT preview + baked into
SVG/PNG). Sheet-only — DXF/JSON ignore it. Full detail in `CLAUDE.md` + `docs/ar-survey.md`.


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

HEAD moves with each push; `git log` has the full list. All pushed to `origin/main`; every push
auto-deploys to Pages.

- `fb4bb80` (s20) conduit re-architecture slices 3–5 (CONDUIT·EDIT + WIRE auto-route/via + sheet/DXF
  output + legacy per-wire-waypoint teardown, `createWire`→`addWire`) AND the change-map feature
  (`src/core/planDiff.js` + `drawChangeMap` + desktop/AR entry points). One commit: the two efforts
  share `mr.js`/`planSheet.js`/`i18n.js` and couldn't be split at file granularity.
- `514da9f` (s19, WIP) conduit network foundation (`src/core/conduit.js` graph + Dijkstra routing) +
  model/serialize integration + `MARKER · CONDUIT` pen-authoring. Old wire system still coexists.
- `973f105` (s19) as-built wire tracing + `WIRE EDIT` (dual-move + height pad) + `panel` marker type +
  per-surface AR/sheet/DXF. The per-wire-waypoint mechanism is superseded by `514da9f`; panel + surface
  drawing stay.
- `26564d1` (s18) FLOOR calibration works from any selected real storey by deriving the
  shared ground datum as `touchY - activeElevation`; Upper/Basement no longer reject the touch.
- `26564d1` (s18) introduced plan-sheet fixture stacks; the current rule requires identical plan
  coordinates for vertical stacks and allows same-height horizontal fixtures within 80 mm inclusive.
  Within a callout, full-3D 80 mm-inclusive neighbors share an outlined white box: horizontal + one height
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

- **A — CONDUIT RE-ARCHITECTURE: DONE + COMMITTED (`fb4bb80`).** All 5 slices landed, docs + memory
  updated. **REMAINING: on-device QA of the whole conduit lane** (pen feel, node picking by floor
  projection, branch/loop, CONDUIT·EDIT dual-move + split + delete, WIRE auto-route + via override on a
  real house graph). Owner-flagged: the `WAYPOINT_GRAB_M`=0.14 m direct/remote grab threshold needs
  tuning on device.
- **G — CHANGE MAP: DONE + COMMITTED (`fb4bb80`).** Revision clouds vs a saved-slot baseline on the
  plan sheet — `src/core/planDiff.js` (id-matched, solved-geometry diff), `drawChangeMap` in
  `planSheet.js` (clouds + △ tags + `REV — CHANGES` legend, `opts.changeMap` = `Map<floorId,diff>`),
  desktop Print "Change map vs" picker, AR EXPORT `COMPARE` row (thumbstick-when-pointed / tap; live in
  LEFT preview + baked into SVG/PNG). Sheet-only (DXF/JSON ignore it). **REMAINING: on-device QA**
  (checklist "CHANGE MAP" section). Deferred: electrical/conduit/wire deltas aren't diffed yet;
  tag/legend collision-avoidance; a floor emptied entirely since baseline early-returns before drawing
  its all-removed deltas. Perf note: the diff deserializes+solves the baseline on each throttled preview
  redraw when a baseline is set — watch on device.
- **B — FINISH ON-DEVICE QA (tracked in `docs/ar-qa-checklist.md`).** Still never walked: **LEVEL**
  (floor seed/cycle/height/stacking); **MARKER EDIT** (drop/height/3D-drag/delete/`markerAtPoint`-
  first, switch glyph); **MARKER DIMS** remainder — commit+render is now proven (s16), but
  white-when-both-pinned, the hover bold-outline linking icon↔glyph, and one-way pin (marker moves,
  not the wall) are still unchecked; the **marker-inert cross-checks** in PLAN EDIT/DIMS; **markers
  round-trip in SAVE/LOAD**; cross-cutting HUD; accuracy. Debug via the plain Quest Browser (`?ar=1`)
  — the release TWA has no console.
- **C — Markers: next increments** (`docs/markers-plan.md`). ~~switch/type picker, light/ethernet,
  switch-to-light links + ceiling routes~~ **DONE**. ~~manual surface-anchored waypoints~~ **DONE then
  SUPERSEDED by the conduit model (Next step A)**. Openings (windows/doors, category 2) still deferred.
- **D — Model transfer desktop→APK.** `15dc9c0` added copy-floors-between-saved-projects; still
  open: desktop autosave (`house-cad:autosave:v1`) vs AR slots (`house-cad:slot:<i>`) use different
  localStorage keys — verify the TWA sees Quest-Browser storage and decide if LOAD should surface the
  desktop autosave as a slot.
- **E — Remaining parity gaps** (`ar-2d-parity` memory): ~~unit switch in AR~~ DONE (`b38ab05`);
  ~~overwrite-confirm~~ DONE (`0226cbd`); still open: slot naming/delete; LEVEL's inert SWAP/DEL keys
  could be hidden.
- **F — On-device QA of the shipped-but-unwalked features.** Plan sheets (incl. the enlarged LEFT
  live preview) + SVG/PNG/DXF export while immersive, all zone types (incl. insulation/furniture),
  teleport, move-plans-between-storeys, all-floors AR view, AR unit selector, and the full marker glyph
  set (incl. panel) — all **build-verified only**. (The electrical lane is now CONDUIT / CONDUIT EDIT /
  WIRE — see Next step A; the change map, Next step G.)
- ~~marker-DIMS commit/render bug~~ — FIXED (`0e98d02`, s16). ~~RECAL corner-select reticle~~ — DONE
  (`5560020`, s13). ~~subtract/dim ops/save-load/in-AR floors/first markers/plan-marker split/
  ROOM+WALL merge~~ — DONE. ~~Store distribution~~ — out of scope.

## Known open questions

- **The conduit lane is entirely unwalked** (build-verified only): pen-authoring feel, node picking
  by floor projection, branching, the live preview, node grab (the direct vs remote threshold
  `WAYPOINT_GRAB_M`=0.14 m may need tuning — owner flagged this), auto-route correctness on a real
  house graph, whether surface should ever be manually overridable (currently geometry-only), and
  whether wires ever need to span floors (assumed per-floor).
- **The change map is unwalked** (build-verified only): COMPARE-row cycling feel, live-preview cloud
  refresh, and the per-redraw diff cost when a baseline is set (deserialize+solve; watch on device).
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
