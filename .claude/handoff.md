# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc — live state only. Stable detail lives in:
- `docs/ar-survey.md` — how the AR survey tool (`src/ui/mr.js`) is built: modes, inputs,
  dimensioning, multi-floor/LEVEL, HUD, perf, durable traps. **Kept current — trust it over this
  file for structural detail.** (Updated this session for the new A/B input model.)
- `docs/ar-qa-checklist.md` — the on-device QA record (what's been walked on the Quest vs not).
- `CLAUDE.md` — core (desktop) architecture, build/verify, git workflow, deployment.
- `packaging/quest-apk.md` — Quest APK runbook (read before any packaging work).
- `docs/markers-plan.md` — the vertical-elements (markers) design + follow-on roadmap.
- `docs/furniture-handoff.md` — furniture-in-AR (M1–M3) detail.
- Claude memory (auto-loads): `phase5-xr-intent`, `multi-floor-design`, `ar-2d-parity`,
  `quest-guardian-limitation` — Phase-5 rationale + XR gotchas; `conduit-wiring-model` +
  `cross-floor-conduit` — the electrical two-layer model and its cross-floor promotion;
  `ikea-3d-model-pipeline` — furniture. Don't duplicate them here.

**Date:** 2026-09-18 (session 23)
**Status:** Quest APK path WORKING. Session 23 shipped **3 commits, all pushed** (HEAD `04a5ab3` =
`origin/main`, clean tree except pre-existing/untracked noise — see Commits). All of session 23 is
**build-verified only, AR-UNWALKED** — it polishes and re-inputs the conduit lane but nothing was
run on the Quest. Session 22's conduit-node-dims + cross-floor conduit + furniture remain unwalked
too. **Next: an on-device walk of the whole conduit lane, now including a changed input model that
alters muscle memory (delete moved off grip).**

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
Furniture-in-AR (real IKEA GLBs via a Cloudflare Worker proxy) is landed. Serialize is **v3**.
**On device (proven, older sessions):** APK installs/enters AR; SETUP+PLAN+PROJECT save/load/lang;
MARKER·DIMS pin→floor-dim; s21 grip-drag perf, mode cycle, change-map, marker changes; a first
partial conduit pass (s21). **Build-verified only:** everything in sessions 22–23 (node-dims,
cross-floor conduit/risers, furniture M3, and all of s23's conduit polish + input rework), plus most
of the MARKER lane, LEVEL, deeper change-map. Before planning marker/dimension/electrical/input work,
read `docs/ar-survey.md`.

## What changed in session 23 (3 commits, all pushed)
> Next agent: as you add your own section, fold live constraints into "Standing decisions" /
> "Findings" and delete this narrative.

All in `src/ui/mr.js` (+ `src/core/model.js`, `src/core/i18n.js`, `docs/ar-survey.md`), all
**AR-unwalked**:

1. **Conduit segments are now thick vertical ribbons, not 1px lines** (`83dcbe2`, `a3118ef`).
   WebGL ignores `linewidth` on `THREE.Line`, so hover was invisible. `makeConduitRibbon` builds a
   flat quad; the band always stands **vertical** ("flat on a wall") for every run — floor, ceiling,
   or wall — so it reads from a standing viewpoint. Width = `CONDUIT_RIBBON_W` (0.03 m). Risers fall
   back to a fixed horizontal width axis. Only the active-floor `conduitGroup` changed; the ALL-FLOORS
   overlay + wires stay thin lines.
2. **Conduit nodes got a floor projection + vertical-stack cycling** (`83dcbe2`). Each active-floor
   node draws a flat disc (`conduitNodeFloorGeom`) on the floor at its plan x/y (the real aim target —
   the sphere sits at storey height) + a faint leader to the sphere; both recolor on hover/select.
   CONDUIT EDIT selection cycles co-located nodes (`cycleConduitNodeInStack`, high→low z) on repeat
   trigger, previewing the next in yellow. Grip-drag handle lookup now targets the sphere
   (`conduitNodeRole === 'node'`), not the dot.
3. **Fixed a freeze on placing a conduit node** (`a3118ef`). The pen ran three `_emit()` cascades
   (`addConduitNode` + `addConduitSegment` + `touch`) plus a redundant `buildPlan()`.
   `addConduitNode`/`addConduitSegment` gained an `{emit}` option; the pen batches into one `touch()`
   and skips `buildPlan` (a conduit node touches no plan geometry).
4. **DIMS grip stack-cycle** (`04a5ab3`). In CONDUIT/MARKER DIMS, grip cycles vertically stacked
   nodes/markers **before** the first-ref pick (`dimStackAt` / `cycleDimStackPick`) — DIMS can't
   repeat-trigger to cycle because the trigger commits ref A immediately, so grip is the verb.
5. **Input rework — delete moved off grip; A=flip, B=delete** (`04a5ab3`). See the Standing decision
   below; this replaces the old "grip deletes / A=prev-mode / B=flip" model.

## Standing decisions (live constraints; stable architecture is in the docs above)

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

## Commits (substantive only; doc-only omitted — `git log` has all)

All pushed to `origin/main`; every push auto-deploys to Pages. **s23 (`f0d89e1..04a5ab3`):**

- `04a5ab3` AR input rework: grip stack-cycle in DIMS; A=flip, B=delete (removes A/X prev-mode,
  moves delete off grip; help EN/FR/ZH + `docs/ar-survey.md` updated).
- `a3118ef` Vertical conduit ribbons; segment-delete readout hint; fix node-placement freeze.
- `83dcbe2` Thicken AR conduits (ribbon) + node floor-projection discs with stack-cycling.

**Earlier (shipped; behaviors are in `CLAUDE.md`/`docs`/memories):** s22 `d402702..f0d89e1`
(conduit-node dims + cross-floor conduit/risers/serialize v3 + furniture M1–M3) · s21
`d674321..aaaba08` (grip-drag perf, mode-cycle reorder, change-map polish + i18n) · `fb4bb80`
conduit re-architecture · earlier sheets/zones/DXF/markers/LEVEL. `git log` has the full history.

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
| `src/core/i18n.js` | EN/FR/ZH strings; mode labels + per-mode help (updated for A/B input model) |
| `docs/ar-survey.md` | Kept-current AR structural reference (modes/inputs/dimensioning/traps) |
| `docs/ar-qa-checklist.md` | On-device QA record (walked vs not) |

## Next step

- **A — CONDUIT LANE + INPUT REWORK: FINISH ON-DEVICE QA (the goal).** Newest first, all unwalked:
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
- **B — FINISH GENERAL ON-DEVICE QA** (`docs/ar-qa-checklist.md`): LEVEL seed/cycle/height/stacking;
  MARKER EDIT (drop/height/3D-drag/`markerAtPoint`-first, switch glyph); MARKER DIMS remainder
  (white-when-both-pinned, hover bold-outline, one-way pin); marker-inert cross-checks in PLAN
  EDIT/DIMS; SAVE/LOAD round-trip; accuracy.
- ~~Session 22's node-dims/cross-floor/furniture as separate next steps~~ — folded into **A** and **H**
  above; they and s23's work are all one unwalked conduit/AR lane now.

## Known open questions

- **All of session 23 is AR-unwalked.** The input rework is the highest-risk item — it changes a
  learned gesture (delete was on grip, now on B/Y). Confirm no mode still expects grip-to-delete and
  that A/X-flip / B/Y-delete fire correctly in each mode.
- **Conduit ribbon + node-dot sizing** (`CONDUIT_RIBBON_W`=0.03 m, floor-dot radius 0.03 m, leader
  threshold) is guessed — may need tuning on device.
- **CONDUIT DIMS stack-cycle is grip-only** (no thumbstick/other); CONDUIT EDIT is repeat-trigger.
  That divergence is deliberate (DIMS trigger commits ref A immediately) but unwalked for feel.
- **Cross-floor conduit + risers (s22)** and **furniture M3 (s22)** remain build-verified only.
- **Change-map AR preview, most of the MARKER lane, LEVEL, cross-cutting HUD, accuracy** are all
  build-verified only. No runtime/XR guard exists — `docs/ar-qa-checklist.md` is the only record.
