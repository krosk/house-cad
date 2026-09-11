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

**Date:** 2026-09-11 (session 15)
**Status:** Quest APK path WORKING. **First on-device functional QA passed (session 14):** SETUP
(ORIGIN, FLOOR, RECAL incl. corner-select reticle) + PLAN (drop, EDGE, EDIT, DIMS) + PROJECT
(SAVE/LOAD, LANG) all confirmed OK on the Quest. **Session 15 (code) is build-verified only.**
`main` = `origin/main` at `aa364e2`; **one uncommitted local fix** (see Commits).

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` before planning), multi-storey, authored entirely
in AR. **Proven on device:** APK installs/verifies/enters AR; and (s14) the SETUP + PLAN + PROJECT
save/load/lang core works. **Build-verified only (never walked):** LEVEL (multi-floor), the whole
MARKER lane (EDIT/DIMS + the s15 switch type/picker/retype), and all cross-cutting HUD/input +
accuracy items — the checklist is the only record. Markers are a **parallel annotation lane**:
wall-anchored points that never touch the footprint/boolean/extrude pipeline; the solver stays
2-axis. Before planning marker or dimension work, read `docs/ar-survey.md`.

## What changed in session 15
> Next agent: when you add your section, fold anything still a live constraint into
> `docs/ar-survey.md` (stable) or "Standing decisions" (live) and delete the narrative.

All in `src/ui/mr.js` + `i18n.js` (+ small `model.js`), shipped in `aa364e2` unless noted. Driven by
owner requests + on-device QA. Through-line: **one consistent "thumbstick-y cycles the current
thing" model**, and fewer modes.

1. **`switch` marker type + MARKER group.** New `switch` type (rocker glyph via `markerFace`, which
   now branches per type). Renamed the mode group **OUTLET → MARKER** (`group.marker`); mode ids
   unchanged (`marker`, `outlet_dims`).
2. **Thumbstick-y pickers.** In MARKER · EDIT, thumbstick up/down cycles the drop type — or
   **retypes the selected marker in place** (`setMarkerType`). In PLAN · DROP it picks room/wall.
   In PLAN · EDIT it swaps the selected zone room↔wall (moved off B/Y). LEVEL floor + LANG language
   were already on thumbstick-y.
3. **Merged ROOM + WALL → one PLAN · DROP** (`cycleZoneKind`; 13 modes, was 14). The label
   (ROOM/WALL) and accent (green/red) track the kind, so a glance shows what a trigger adds.
4. **B/Y no longer cycles modes.** Mode nav = thumbstick-x (both ways) + A/X (prev). B/Y's only
   action is the DIMS flip on a completed pair, else inert. `cycleFloor` removed.
5. **Color fixes.** ORIGIN uses one accent across all 3 gesture steps (dropped `C_ALIGN`). The
   RECAL active-wall strip rendered **black** — a real bug: `material.color.setHex()` was handed the
   CSS-string badge constants `C_WALL1/2`, which yield `NaN`; now uses the numeric `C_RECAL` accent.
6. **Info-panel consistency (`setModeInfo`) — UNCOMMITTED.** Switching kind updated the label chip
   but not the help/info box (stale breadcrumb + color). `setModeInfo()` now refreshes label AND
   help together for setMode, the language switch, and both kind-pickers.

## Standing decisions (live constraints; stable architecture is in the docs above)

- **Input model (s15): thumbstick-y = "cycle the current thing"; B/Y ≠ mode nav.** Thumbstick
  up/down cycles the contextual attribute per mode (LEVEL floor, LANG language, MARKER type/retype,
  PLAN·DROP room/wall, PLAN·EDIT room↔wall). Mode nav is thumbstick-x + A/X. B/Y only flips a
  completed DIMS pair. **Label chip + help box must stay in sync** — change both via `setModeInfo`,
  never `applyModeVisual` alone, or the info panel goes stale (the s15 bug).
- **Plan and marker are disjoint editing/dimensioning domains** (s13). EDIT and DIMS each exist
  twice — a PLAN variant (zones/edges/origin) and a MARKER variant (markers/floor-icons/pins) — and
  each ignores the other lane's targets. Don't merge them into one mixed picker. Marker X/Y is
  pinned via the **projected floor icon**, never the wall-height glyph.
- **Markers are a parallel lane, NOT massing** (s12). Never enter footprint/boolean/extrude; solver
  stays 2-axis. X/Y pins resolve one-way in `solveMarkers` (marker follows the wall) and are
  EXCLUDED from the rect solve. z is **inherent** (typed in MARKER EDIT), never a constraint axis.
  "Fully pinned / white" = X and Y pinned. One pin per (marker, axis); re-picking a wall re-anchors.
- **Git: commit + push directly on `main`, no feature branches. Every push auto-deploys to Pages
  = publishes** — only push when asked. No `gh` CLI; deploy check:
  `curl -s "https://api.github.com/repos/krosk/house-cad/actions/runs?per_page=1"`.
- **`npm run build` is the only automated check** (no tests/linter/types). Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs. **All session-8→15 AR work is
  build-verified only, except the s14 QA scope above.**
- **This machine is a Steam Deck (SteamOS), Node v20 via nvm.** No system `java`/`adb` — Bubblewrap
  brought its own under `~/.bubblewrap/`. The fnm/Node-22 block in `CLAUDE.md` is Windows-only;
  ignore it here.
- **Web change = Pages deploy + relaunch the APK** (SW usually swaps it; watch the HUD build stamp)
  or `adb shell pm clear com.krosk.housecad`. Rebuild the APK only for `twa-manifest.json` changes.
- **LATENT (not in this repo):** `~/house-cad-apk/app/src/main/res/values/strings.xml` is missing
  `appName`/`launcherName`; add them before the next `bubblewrap build` or the label regresses.

## Findings / traps worth knowing

- **`material.color.setHex()` needs a NUMBER, not a CSS string.** `C_WALL1/C_WALL2` (`'#22d3ee'`…)
  are canvas strings for the RECAL badges; passing one to `setHex` → `NaN` → the mesh renders
  **black**. Highlight/strip colors must be numeric hex. (Full note in `docs/ar-survey.md` traps.)
- **`mr.js` does NOT subscribe to `project.onChange`** — it rebuilds overlays manually via
  `buildPlan()`/`applyPlanMatrix()`. Any model-changing action (LOAD, height/floor/marker edits)
  must call them itself. (Full trap list in `docs/ar-survey.md`.)

## Commits (substantive only; doc-only omitted — `git log` has all)

`main` = `origin/main` at `aa364e2` — pushed.

- **UNCOMMITTED (local, mine, this session):** `src/ui/mr.js` — the `setModeInfo()` info-panel fix
  (#6 above). Build-verified only. Offer to commit + push it.
- `aa364e2` (s15) AR markers (switch) + thumbstick pickers/retype + merged PLAN·DROP + input
  consolidation (B/Y no-cycle) + ORIGIN/RECAL color fixes + docs + new `ar-qa-checklist.md`.
- `459e909` (doc) session-13 handoff/markers-plan sync.
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
`192.168.1.154` (AR page: `https://192.168.1.154:5174/?ar=1`). Quest APK project (`~/house-cad-apk`),
assetlinks repo (`~/krosk.github.io`), `~/.bw_pw`, and Bubblewrap's JDK/SDK already exist — see
`packaging/quest-apk.md` (don't re-init).

## Next step

- **A — FINISH ON-DEVICE QA (s14 did the first pass; SETUP + PLAN + PROJECT save/load/lang OK).**
  Priority: the s15-new/changed input paths — **PLAN·DROP room/wall picker** (label+accent track
  kind; info panel updates — the just-fixed bug), **MARKER type picker + in-place retype**, room↔wall
  now on **thumbstick-y in EDIT**, and **B/Y no longer cycling modes**. Then the never-walked areas:
  **LEVEL** (floor seed/cycle/height/stacking), **MARKER EDIT** (drop/height/3D-drag/delete/
  `markerAtPoint`-first), **MARKER DIMS** (floor-icon-first pin → white at 2nd pin), the
  marker-inert cross-checks in PLAN EDIT/DIMS, markers round-trip in SAVE/LOAD, cross-cutting HUD,
  and accuracy. Full tick-list in `docs/ar-qa-checklist.md`. Debug via the plain Quest Browser
  (`?ar=1`) or Oculus Remote Web Inspector — the release TWA has no console.
- **B — Markers: next increments** (`docs/markers-plan.md`). ~~switch + type picker~~ **DONE (s15).**
  Remaining: **light / ethernet** types (add to `MARKER_TYPES` + a `markerFace()` branch +
  `marker.<type>` i18n; light's z could default to ceiling = storey height). Then **wires**
  (`THREE.Line` polyline). Keep each an increment.
- **C — Model transfer desktop→APK.** Desktop autosave (`house-cad:autosave:v1`) and AR slots
  (`house-cad:slot:<i>`) use different localStorage keys; verify the TWA sees Quest-Browser storage
  and decide if LOAD should surface the desktop autosave as a slot.
- **D — Remaining parity gaps** (`ar-2d-parity` memory): unit switch in AR; slot naming/delete/
  overwrite-confirm; LEVEL's inert SWAP/DEL keys could be hidden.
- ~~RECAL corner-select reticle~~ — DONE (`5560020`, s13). ~~subtract/dim ops/save-load/in-AR
  floors/first markers/plan-marker split/ROOM+WALL merge~~ — DONE. ~~Store distribution~~ — out of
  scope.

## Known open questions

- **Everything past the s14 QA scope is build-verified only** — LEVEL, the whole MARKER lane
  (incl. the s15 switch/picker/retype), cross-cutting HUD/input, accuracy. No runtime/XR guard.
- **Most likely to need an on-device eyeball (s15):** the DROP room/wall label+accent+info-panel all
  updating on thumbstick flick; MARKER retype swapping the glyph immediately; the switch rocker glyph
  reading clearly through walls; B/Y truly inert for mode nav; thumbstick-y not fighting anything new.
- **Most likely (older, still untested):** disjoint-domain promise (PLAN ignores markers / MARKER
  ignores zones — the inert half needs a marker in the scene); `markerAtPoint`-first pick; white-when-
  pinned transition; depth-test-off glyphs through walls; MARKER DIMS floor-icon-first flow.
- **Upper/basement overlay height** depends on hand-entered storey heights (LEVEL) — only as good as
  what's typed. Anchor drift over a multi-room/multi-floor house untested.
