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

**Date:** 2026-09-13 (session 17)
**Status:** Quest APK path WORKING. On-device QA: SETUP + PLAN + PROJECT(save/load/lang) passed
(s14); MARKER · DIMS commit + floor dim-line render verified on device (s16). **The repo was 12
commits ahead of where the s16 handoff was frozen** — sessions after s16 shipped a lot without
updating this file, so those commits are reconstructed from `git log` below, not from live session
notes. **s17 then added the RJ45 glyph redraw + the dimension-leader fix (see below).**

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` before planning), multi-storey, authored entirely
in AR. **Proven on device:** APK installs/verifies/enters AR; SETUP + PLAN + PROJECT save/load/lang
(s14); and **MARKER · DIMS pinning an outlet to an edge → the orange dashed floor dim commits and
renders** (s16, both X and Y pins). **Build-verified only (never walked):** LEVEL (multi-floor); the
rest of the MARKER lane (EDIT drop/height/drag/delete/retype, the s15 switch glyph, DIMS
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

## Standing decisions (live constraints; stable architecture is in the docs above)

- **Input model: thumbstick-y = "cycle the current thing"; B/Y ≠ mode nav.** Thumbstick up/down
  cycles the contextual attribute per mode (LEVEL floor, LANG language, MARKER type/retype, PLAN·DROP
  room/wall, PLAN·EDIT room↔wall). Mode nav is thumbstick-x + A/X. B/Y only flips a completed DIMS
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

- (s17) zone color coding: new shared palette `src/core/zoneColors.js` (room=blue, wall=red,
  door=green, window=cyan, stairs=yellow, cabinet=purple; kind encodes op, blue=only add). Desktop
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
  ~~light / ethernet types~~ **DONE** (`markerFace` bulb / RJ45 glyphs, `marker.<type>` i18n, sheet
  legend; lights drop with z = storey height). Remaining: **wires** (`THREE.Line` polyline). Keep
  each an increment.
- **C — Model transfer desktop→APK.** `15dc9c0` added copy-floors-between-saved-projects; still
  open: desktop autosave (`house-cad:autosave:v1`) vs AR slots (`house-cad:slot:<i>`) use different
  localStorage keys — verify the TWA sees Quest-Browser storage and decide if LOAD should surface the
  desktop autosave as a slot.
- **D — Remaining parity gaps** (`ar-2d-parity` memory): ~~unit switch in AR~~ DONE (`b38ab05`);
  ~~overwrite-confirm~~ DONE (`0226cbd`); still open: slot naming/delete; LEVEL's inert SWAP/DEL keys
  could be hidden.
- **E — On-device QA of the s16→s17 features.** Plan sheets (AR PROJECT·SHEET raster + SVG download
  while immersive), the new zone types (door/window/stairs/cabinet), teleport, move-plans-between-
  storeys, all-floors AR view, AR unit selector — all **build-verified only**. Plus the uncommitted
  ethernet glyph needs a visual check on both surfaces before committing.
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
