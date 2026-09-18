# House CAD — session handoff

> **Active sub-effort (2026-09-17): furniture-in-AR.** If that's the task, read
> `docs/furniture-handoff.md` first — it has the live state (M1–M3, all uncommitted). This file
> remains the broader Phase-5 AR resume doc.

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

**Date:** 2026-09-17 (session 21)
**Status:** Quest APK path WORKING. Session 21 shipped **7 commits, all pushed** (HEAD `aaaba08` =
`origin/main`), and the **owner confirmed this session's work running on device**: (1) **AR grip-drag
performance** — edge & dim/panel drags no longer rebuild the whole plan or fire the desktop
listener-cascade per frame (`Project.solveSilently()` + `rebuildDimsOnly()`), and dims now stay live
while dragging an edge; (2) **AR mode-cycle reorder** + four PROJECT floor-ops hidden from the cycle
(`MODE_HIDDEN`, kept functional); (3) **change-map polish** — layer-aware filtering, merged
overlapping clouds, one tag + grouped legend per location, right-edge legend, and full
**localization** (en/fr/zh); (4) **markers** — new `camera_ethernet` ("Camera Ethernet") type, aircon
glyph boxed in a square, aircon zh label corrected. The owner also did a **first on-device pass of the
conduit lane** (previously entirely unwalked) — a first try, not full QA. Next: finish conduit QA
(Next step A) and confirm the change-map polish on device (Next step G).

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` before planning), multi-storey, authored entirely
in AR. Markers are a **parallel annotation lane** (wall-anchored points — outlets/switches/lights/
network/panel — that never touch the footprint/boolean/extrude pipeline; the solver stays 2-axis).
**Electrical is SHIPPED** (`fb4bb80`): a shared **conduit network** (graph of nodes + segments drilled
into walls/floors/ceilings, surface inferred per segment) with **wires routed over it** (each wire = two
device markers + optional `via` overrides; path DERIVED by shortest route, never stored). The **change
map** (plan-sheet revision clouds vs a saved-slot baseline) is shipped and was substantially polished in
s21 (see below). **On device (proven):** APK installs/enters AR; SETUP + PLAN + PROJECT save/load/lang
(s14); MARKER · DIMS pin→floor-dim commit+render (s16); **s21 owner-confirmed** the grip-drag perf,
reordered mode cycle, change-map, and marker changes; **conduit lane had a first (partial) on-device
pass**. Still build-verified only: most of the MARKER lane, LEVEL, and the deeper conduit/change-map
interactions; `docs/ar-qa-checklist.md` is the record. Before planning marker/dimension/electrical work,
read `docs/ar-survey.md` (kept current) and `docs/markers-plan.md`.

## What changed in session 21 (7 commits, all pushed)
> Next agent: as you add your own section, fold live constraints into "Standing decisions"/"Findings"
> and delete this narrative. Prior feature changelogs were compressed away — the conduit
> re-architecture (`fb4bb80`, memory `conduit-wiring-model`) and all pre-s21 features (plan sheets,
> zone vocabulary, DXF+Coohom, PNG/JSON, fixture stacks, floor translate, full marker glyph set) are
> SHIPPED and documented in `CLAUDE.md`, `docs/ar-survey.md`, `docs/markers-plan.md`. `git log` has all.

1. **AR grip-drag performance** (`5b6a3cf`, `b45629d`). Owner-reported: edge & dim/panel drags tanked.
   Root cause — edge drag called `project.touch()` per frame (solve ALL floors + full desktop
   listener cascade: 3D re-extrude, 2D canvas redraw, DOM rebuilds, all invisible in AR) then rebuilt
   the footprint again; dim/panel drag ran a full `buildPlan()` though only presentation changed. Fixes:
   `Project.solveSilently()` (solve in place, no listener cascade — edge drag uses it, commits once via
   `touch()` on release); `rebuildDimsOnly()` in `mr.js` (dim drag rebuilds only the tracked dim objects).
   Then dims kept LIVE during edge drag by re-running `buildDimensions` each frame — cheap because a
   drag never changes a constraint's value, so label textures are cache hits. Markers/electrical stay
   frozen in their uncleared groups during the drag, snap back on release.
2. **AR mode-cycle reorder + hidden floor-ops** (`5b6a3cf`). New order: SETUP = ORIGIN/FLOOR/LEVEL/
   RECAL/TELEPORT; PLAN = ADD/EDGE/DIMS/EDIT (TRANSLATE moved to PROJECT, kept out of ALL-FLOORS view);
   MARKER = EDIT/DIMS/LINK/CONDUIT/CONDUIT EDIT/WIRE; PROJECT leads with EXPORT before SAVE. `MODE_HIDDEN`
   removes COPY/PASTE FLOOR + MOVE UP/DOWN from the thumbstick cycle (still defined + functional).
3. **Change-map polish** (`940e2e9`, `9e11744`, `aaaba08`). (a) Layer-aware: `drawChangeMap` takes the
   sheet's resolved `layers` and only flags categories actually drawn (dim deltas iff `planDims`; marker
   deltas iff `markerIcons`; furniture-zone deltas iff `furniture`). (b) Overlapping clouds merged:
   `clusterBoxes` union-finds change boxes within `CLOUD_MERGE_GAP`; each cluster = one cloud + one △ tag
   + one grouped legend entry (fixes co-located marker-stack tag pile-up). (c) `REV — CHANGES` legend
   moved flush to the sheet's right edge. (d) Localized: `rev.*` i18n templates + `revLabels()`; planSheet
   interpolates `{kind}/{name}/{from}/{to}/{value}/{unit}`; desktop `localizedSheetOptions` now also
   passes `markerLabel`/`zoneLabel` (its marker/zone legend was English before too).
4. **Markers** (`5e9aff8`, `4f19b06`). New `camera_ethernet` type ("Camera Ethernet" — stresses a wired
   pull) across AR glyph / sheet glyph+label / DXF glyph+layer / i18n. Aircon glyph now boxed in a SQUARE
   (AR + sheet + DXF) to read as a service point, not a power outlet; aircon zh label `空调专用电源` →
   `空调供应` (generic supply, not electric).

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
- **Continuous AR drags must NOT run the full `_emit` cascade per frame.** `project.touch()` →
  `_emit()` solves all floors AND notifies every desktop listener (3D re-extrude, 2D canvas redraw, DOM
  panels) — invisible in AR and frame-rate-killing. Patterns: marker drag uses `moveMarker(...,{emit:
  false})`; edge drag uses `project.solveSilently()` (solve in place, no listeners); dim/panel drag is
  pure presentation → `rebuildDimsOnly()`. Each commits once via `touch()` on release. During a drag,
  markers/electrical stay frozen (their groups are skipped by `clearPlanGeometry`); dims can be rebuilt
  cheaply because a drag never changes a constraint value (label textures are cache hits).
- **Change map is layer-gated, clustered, and localized.** `drawChangeMap(be,L,floor,diff,layers,opts)`
  only flags categories the sheet draws (dims⇔`planDims`, markers⇔`markerIcons`, furniture-zones⇔
  `furniture`); `clusterBoxes` merges co-located changes into one cloud + one △ tag + one grouped legend
  entry; labels come from `opts.revLabels` (`revLabels()` in i18n) + `opts.markerLabel`/`zoneLabel`, with
  English fallbacks. All sheet backends + AR preview funnel through it, so changes land everywhere.
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
auto-deploys to Pages. **s21 (`d674321..aaaba08`):**

- `aaaba08` localize change-map text (`rev.*` i18n + `revLabels()`; desktop also gains marker/zone
  legend localization).
- `9e11744` change map: one △ tag + grouped legend per location (fixes co-located tag pile-up).
- `4f19b06` rename the new marker to "Camera Ethernet".
- `5e9aff8` new `camera_ethernet` marker + aircon square icon + aircon zh label fix.
- `940e2e9` change map: layer-aware filtering + merged clouds + right-edge legend.
- `b45629d` keep dimensions live during AR edge grip-drag.
- `5b6a3cf` speed up AR edge/dim grip-drags (`solveSilently`/`rebuildDimsOnly`) + reorder AR mode cycle.

**Earlier (shipped; behaviors are in `CLAUDE.md`/`docs`, so only the pointer is kept):** `fb4bb80`
conduit re-architecture + change-map v1 · `514da9f`/`973f105` conduit foundation + old wire teardown ·
`26564d1` FLOOR-from-any-storey + fixture stacks · s17 zone areas/colors, sheet dim-label extension,
RJ45 ethernet glyph · s15–s17 sheets/zones/DXF/markers · `0e98d02` marker-pin change-bus fix · earlier
LEVEL/HUD/markers. Use `git log` for the full per-commit history.

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

- **A — CONDUIT LANE: FINISH ON-DEVICE QA (first pass done s21).** The owner did a first on-device try
  this session (previously entirely unwalked). Still to confirm: pen feel, node picking by floor
  projection, branch/loop, CONDUIT·EDIT dual-move + split + delete, WIRE auto-route + via override on a
  real house graph. Owner-flagged: the `WAYPOINT_GRAB_M`=0.14 m direct/remote grab threshold likely
  needs tuning on device. Structural detail: `docs/ar-survey.md`; design: memory `conduit-wiring-model`.
- **G — CHANGE MAP: POLISHED s21; CONFIRM ON DEVICE.** s21 added layer-aware filtering, cloud merging,
  one-tag-per-location + grouped legend, right-edge legend, and localization (all owner-confirmed on the
  desktop side). **REMAINING: confirm the AR preview** shows the same (COMPARE-row cycling, live cloud
  refresh, per-redraw diff cost — the baseline is deserialized+solved on each throttled preview redraw).
  Still deferred: electrical/conduit/wire deltas aren't diffed; a floor emptied entirely since baseline
  early-returns before drawing its all-removed deltas; localized (longer, e.g. French) legend labels
  auto-size the right-edge box width — eyeball they still fit.
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

- **The conduit lane had only a first on-device pass** (s21): pen-authoring feel, node picking by floor
  projection, branching, the live preview, node grab (the direct vs remote threshold `WAYPOINT_GRAB_M`=
  0.14 m may need tuning — owner flagged this), auto-route correctness on a real house graph, whether
  surface should ever be manually overridable (currently geometry-only), and whether wires ever need to
  span floors (assumed per-floor) all still need confirming.
- **The change map's AR preview is unconfirmed** (desktop side owner-confirmed s21): COMPARE-row cycling
  feel, live-preview cloud refresh, and the per-redraw diff cost when a baseline is set (deserialize+
  solve each throttled redraw; watch on device).
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
