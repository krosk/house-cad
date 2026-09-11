# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc — live state only. Stable detail lives in:
- `docs/ar-survey.md` — how the AR survey tool (`src/ui/mr.js`) is built: modes, inputs,
  dimensioning, multi-floor/LEVEL, HUD, perf, durable traps, artifacts. **Kept current — trust it
  over this file for structural detail.**
- `CLAUDE.md` — core (desktop) architecture, build/verify, git workflow, deployment.
- `packaging/quest-apk.md` — Quest APK runbook (read before any packaging work).
- `docs/markers-plan.md` — the vertical-elements (markers) design + follow-on roadmap.
- Claude memory (auto-loads): `phase5-xr-intent`, `multi-floor-design`, `ar-2d-parity`,
  `quest-guardian-limitation` — Phase-5 rationale and XR gotchas. Don't duplicate them here.

**Date:** 2026-09-11 (session 15)
**Status:** Quest APK path WORKING. **FIRST ON-DEVICE FUNCTIONAL QA DONE (session 14):** SETUP
(ORIGIN, FLOOR, RECAL incl. the corner-select reticle) + PLAN (ROOM/WALL, EDGE, EDIT, DIMS) +
PROJECT (SAVE/LOAD, LANG) all confirmed OK on the Quest. **Session 15 (code, build-verified only):**
added a **`switch` marker type** (distinct rocker glyph via `markerFace`) with a **MARKER · EDIT
type picker on thumbstick up/down** — cycles the drop type, or **retypes the selected marker in
place** (`setMarkerType`); label reads `MARKER · EDIT · <type>`. **Renamed the OUTLET mode group →
MARKER** (`group.marker`; modes keep ids `marker`/`outlet_dims`). **Consolidated the input model:**
thumbstick up/down is now the single "cycle the current thing" control (LEVEL floor, LANG language,
MARKER type, PLAN·EDIT room↔wall); **mode nav is thumbstick-x (both ways) + A/X (prev); B/Y no
longer cycles modes** — its only action is the DIMS flip (completed pair), else inert. `cycleFloor`
removed; PLAN·EDIT swap moved off B/Y onto thumbstick-y. **Merged the ROOM + WALL modes into one
PLAN · DROP action** (13 modes now, was 14): thumbstick up/down picks the kind to add (room↔wall),
label + accent (green/red) track it (`cycleZoneKind`); the RECAL wall strip + ORIGIN gesture colors
were also fixed (strip was black from a `setHex`-on-string bug → now the RECAL accent).
**Still unverified on device: LEVEL (multi-floor), MARKER EDIT/DIMS incl. the new switch + picker,
the cross-cutting HUD/input items, and accuracy (drift, storey heights).** See
`docs/ar-qa-checklist.md` for the tick-by-tick record.

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` memory before planning), multi-storey, authored
entirely in AR. **Proven:** the APK installs/verifies/enters AR; the PWA serves; everything builds
clean and deploys. Markers (outlets) exist as a **parallel annotation lane** — wall-anchored points
that never touch the footprint/boolean/extrude pipeline; the constraint solver stays 2-axis (see
`docs/markers-plan.md`). Session 13 made plan and outlet editing/dimensioning **disjoint domains**
so the two never fight over a pointer target, and projected each outlet to a flat floor icon so its
X/Y can be pinned and dimensioned separately from its wall-height glyph. **NOT proven:** essentially
the entire survey/edit/dimension/save/floor/marker workflow is build-verified only — it has never
been walked end-to-end on the Quest. The only on-device signals to date are a handful of fixed
visual-bug reports.

## What changed in session 13
> Next agent: when you add your section, fold anything still a live constraint into `docs/ar-survey.md`
> (stable) or "Standing decisions" (live) and delete the narrative.

All in `src/ui/mr.js` + `i18n.js` (+ small `model.js`) unless noted. The through-line: **separate
plan and outlet into disjoint domains** so a pointer never has to guess which lane you mean.

1. **Separated editing** (`7706cb5`). The old single EDIT became **PLAN · EDIT** (`id: edit`, zones
   only; outlet glyphs inert) and **OUTLET · EDIT** (`id: marker`, outlets only; zones inert).
2. **Separated dimensions** (`36e068e`). The old combined DIMS/SIZE became **PLAN · DIMS**
   (`id: plan_dims`: edge↔edge + edge↔origin) and **OUTLET · DIMS** (`id: outlet_dims`: outlet↔edge
   only, outlet picked first). Hard-filtered domains, not one mixed picker.
3. **Projected outlet floor icons** (`21fb9ef`). Every outlet also renders a flat icon at its plan
   X/Y. That icon (NOT the wall-height glyph) is the pick target for X/Y pins in OUTLET DIMS; each
   pin draws an orange dashed floor dim-line + value label. Disambiguates outlets sharing X/Y at
   different heights (bold outline on hover/lock links icon↔glyph).
4. **Mode regroup** (`20de9df`). 13 → **14 modes**, presented as `SETUP · PLAN · OUTLET · PROJECT`
   with a localized `GROUP · TOOL` breadcrumb. Traversal is still one linear A/B/thumbstick-x cycle;
   no contextual button remapped.
5. **Floor switch scoped to LEVEL** (`c201de9`). Vertical thumbstick changes the active floor **only
   in LEVEL** now (was firing more broadly).
6. **Pointer/feedback hardening** (`5560020`, `c9a8fe5`). `markerAtPoint`-first target selection so
   an outlet wins over the wall it sits on; steadier hover/select feedback in outlet editing.
7. **Codex bridge** (`c5726e5`). New `AGENTS.md` (compat pointer; declares `CLAUDE.md`
   authoritative) + `.gitignore` additions. No behavior change.

## Standing decisions (live constraints; stable architecture is in the docs above)

- **Plan and outlet are disjoint domains** (s13). EDIT and DIMS each exist twice — a PLAN variant
  (zones/edges/origin) and an OUTLET variant (outlets/floor-icons/pins) — and each ignores the
  other lane's targets entirely. Don't merge them back into one mixed picker; the split is what
  keeps pointer targeting unambiguous. Outlet X/Y is pinned via the **projected floor icon**, never
  the wall-height glyph.

- **Markers are a parallel lane, NOT massing** (s12). They never enter footprint/boolean/extrude;
  the solver stays 2-axis. X/Y pins resolve one-way in `solveMarkers` (marker follows the wall, not
  vice-versa) and marker pins are EXCLUDED from the rect solve. z is **inherent** (typed in OUTLET
  EDIT), never a constraint axis. "Fully pinned / white" = **X and Y pinned** (height doesn't gate
  it — confirm with owner if that should change). One pin per (marker, axis); re-picking a different
  wall re-anchors. Follow-ons deferred: switch/ethernet/light (+ a MARKER type picker), wires
  (polyline), desktop-2D parity.

- **Git: commit + push directly on `main`, no feature branches. Every push auto-deploys to Pages
  = publishes** — only push when asked. No `gh` CLI; deploy check:
  `curl -s "https://api.github.com/repos/krosk/house-cad/actions/runs?per_page=1"`.
- **`npm run build` is the only automated check** (no tests/linter/types). Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs. **All session-8→13 AR work is
  build-verified only.**
- **This machine is a Steam Deck (SteamOS), Node v20 via nvm.** No system `java`/`adb` — Bubblewrap
  brought its own under `~/.bubblewrap/`. The fnm/Node-22 block in `CLAUDE.md` is Windows-only (a
  prior machine); ignore it here.
- **Web change = Pages deploy + relaunch the APK** (SW usually swaps it; watch the HUD build stamp)
  or `adb shell pm clear com.krosk.housecad`. Rebuild the APK only for `twa-manifest.json` changes.
- **LATENT (not in this repo):** `~/house-cad-apk/app/src/main/res/values/strings.xml` is missing
  `appName`/`launcherName`; add them before the next `bubblewrap build` or the label regresses.

## Commits (substantive only; doc-only omitted — `git log` has all)

`main` = `origin/main` — **everything pushed.**

- Session 13 (the plan/outlet split): `c9a8fe5` stabilize outlet editing feedback · `36e068e`
  separate plan and outlet dimensions · `c201de9` scope floor switching to LEVEL · `20de9df`
  reorder AR modes into groups · `21fb9ef` project outlets into dimension plan · `7706cb5` separate
  plan and outlet editing · `5560020` improve pointer target selection · `c5726e5` Codex bridge
  (`AGENTS.md`).
- `262beb3` (s12) AR markers (outlet) — wall-anchored annotations + revert world-vertical HUD stack.
- `ef24512` (s11) in-headset multi-floor (LEVEL mode) + SIZE DEL cancels a new pair.
- `5bb8e1a` (s11) HUD edge size + battery + per-mode help box; drag/HUD perf.

Earlier substantive AR commits: `2643c20` i18n (FR/EN/ZH); `6db5c37` HUD world-vertical stack (its
panel part reverted in s12); `f5027da` new-dim line at tip; `7d6cb87` RECAL 3-point reframe;
`40e959c` plan-space ptr HUD + EDGE snap + `frustumCulled`; `f60f0fd` SAVE/LOAD slots; `0372d90`
edge-pick/negative-w/h fix. Full history in `git log`.

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

- **A — FINISH ON-DEVICE QA (session 14 did the first pass; SETUP + PLAN + PROJECT save/load/lang
  all OK).** Remaining to walk, tracked in `docs/ar-qa-checklist.md`: **LEVEL** (seed Basement/
  Ground/Upper; B/Y cycles floors; type storey height + ENTER; stacking — editing Ground lifts
  Upper); **OUTLET EDIT** (drop → aim outlet → type height → ENTER; grip-drag in 3D; grip-away
  delete; `markerAtPoint`-first); **OUTLET DIMS** (pick the projected FLOOR ICON first, then a plan
  edge; orange dashed dim-line; glyph goes white at the 2nd pin); the **outlet-inert cross-checks**
  in PLAN EDIT/DIMS and the **markers round-trip** in SAVE/LOAD (all need an outlet in the scene);
  plus the cross-cutting HUD/input items and the accuracy checks (drift, storey heights). Debug via
  the plain Quest Browser (`?ar=1`) or Oculus Remote Web Inspector — the release TWA has no console.
- **B — Markers: the next increments** (`docs/markers-plan.md` → follow-ons). ~~switch type +
  MARKER-mode type picker~~ **DONE (s15).** Remaining: **light / ethernet** types (add to
  `MARKER_TYPES` + a `markerFace()` branch + `marker.<type>` i18n; light's z could default to the
  ceiling = storey height). Then **wires** (a `THREE.Line` polyline). Keep each an increment.
- ~~**C — RECAL corner-select reticle**~~ — **DONE (already shipped in `5560020`, s13).** The
  unlocked SELECT phase now drives off `rayFloorHit` (a pointer/ray floor point, not the tip), shows
  the reticle ring there, and previews the nearest corner + wall-1/2 ordering under it. Verify it on
  device as part of A rather than rebuilding. (Possible future polish, NOT requested: snap the ring
  onto the previewed corner apex; add a distance cap so far aims show a "nothing in range" state
  instead of always snapping to the globally nearest corner — `nearestPlanCorner` has no cap.)
- **D — Model transfer desktop→APK.** Desktop autosave (`house-cad:autosave:v1`) and AR slots
  (`house-cad:slot:<i>`) use different localStorage keys; verify the TWA sees Quest-Browser storage
  and decide if LOAD should surface the desktop autosave as a slot.
- **E — Remaining parity gaps** (`ar-2d-parity` memory): unit switch in AR; slot naming/delete/
  overwrite-confirm; LEVEL's inert SWAP/DEL keys could be hidden.
- ~~Docs stale (ar-survey "12 modes", no markers section)~~ — **DONE:** `docs/ar-survey.md` is
  current at 14 modes with the plan/outlet split, projected-icon, and dimensioning detail.
  `docs/markers-plan.md` status line corrected this session (was "NOT STARTED").
- ~~Subtract in AR~~, ~~dim flip/delete/edit/drag~~, ~~save/load~~, ~~in-AR floors + height~~,
  ~~first markers (outlet)~~, ~~plan/outlet editing+dimension split~~ — **DONE.**
  ~~Store distribution / PWA install~~ — out of scope.

## Known open questions

- **SETUP + PLAN + PROJECT(save/load/lang) are on-device verified (session 14).** Still
  build-verified-only: **LEVEL, OUTLET EDIT/DIMS**, cross-cutting HUD/input, and accuracy. No
  runtime/XR regression guard exists — the checklist is the only record.
- **Most likely to need an on-device eyeball (still untested, s13 split):** whether OUTLET EDIT/DIMS
  truly ignore zone/edge targets and PLAN EDIT/DIMS truly ignore outlet targets (the disjoint-domain
  promise — the outlet-inert half is unconfirmed until an outlet exists in the scene); the
  `markerAtPoint`-first rule picking an outlet over the wall it sits on; the projected floor icon
  being pickable and distinct from the wall-height glyph; the bold outline linking icon↔glyph;
  whether depth-test-off glyphs/icons read clearly through walls.
- **Most likely to need an eyeball (markers, from s12):** the OUTLET drop landing at the captured
  tip height; the white-when-pinned transition on the 2nd pin.
- **Upper/basement overlay height** depends on hand-entered storey heights (LEVEL) — accuracy is
  only as good as what's typed. Anchor drift over a multi-room/multi-floor house untested.
</content>
</invoke>
