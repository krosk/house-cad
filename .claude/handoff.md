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

**Date:** 2026-09-19 (session 24)
**Status:** Quest APK path WORKING. Session 24 shipped **5 commits, all pushed** (HEAD `c620880` =
`origin/main`, clean tree except pre-existing/untracked noise — see Commits). It added a whole new
**aperture** lane (door/window/half-wall/sliding openings) — **desktop build- + render-verified**, but
its AR pieces (floor glyphs, A/X rotate) plus three small AR interactions are **AR-UNWALKED**. The
s23 conduit lane + input rework and s22 (node-dims, cross-floor conduit, furniture) also remain
**AR-UNWALKED**. **Two unwalked lanes now await a Quest: (1) the aperture AR bits + s24 AR
interactions, (2) the whole conduit lane + s23 input rework.**

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

## What changed in session 24 (5 commits, all pushed)
> Next agent: as you add your own section, fold live constraints into "Standing decisions" /
> "Findings" and delete this narrative.

New **aperture** lane + three small AR interactions. Touched `src/core/{zoneColors,model,
apertureGlyph,i18n}.js`, `src/io/{serialize,planSheet,dxf}.js`, `src/ui/mr.js`, `src/main.js`,
`index.html`. Desktop is **build- + SVG/DXF-render-verified**; every AR-side item is **AR-unwalked**:

1. **Half-wall kind + unified aperture model** (`b5a7b6b`). door/window/half-wall are one aperture:
   an opening band `[sill,head]` + `hinge`; half-wall = inverted door (open above sill, `head:null` =
   to ceiling). All stay **subtract** (owner's call — the `op` invariant is untouched). `extrude.js`
   unchanged: the band is stored, **not** carved (owner: "no room view in AR yet"). New shared glyph
   module `apertureGlyph.js` (door swing arc, window casement V, half-wall poché) feeds print/DXF/AR.
2. **Pick-up-controllers prompt** (`8869f9e`). Setting controllers down flips the headset to hand
   tracking → `editorSource(frame)` null → the whole HUD was hidden and the app looked dead. A
   head-locked notice now shows whenever no controller holds the editor role. Does NOT suppress hand
   tracking (OS-level, like Guardian); the input gate (`isControllerSource`) was already correct.
3. **Left companion stick rotates the placed plan ±20°/flick** (`5e8d445`). About the plan origin
   corner (the `planYaw` REGISTER/RECAL set); gated on `placed`, reads LEFT source only. planYaw is
   session anchoring, not model geometry → stays a companion view action.
4. **Rotate doors/windows** (`0ec0e8d`). Added `swing` (in/out) to the aperture model; a door has 4
   states (hinge×swing), a window 3 (hinge left→right→both). `Rectangle.rotateAperture()` cycles
   them — **AR A/X** in PLAN EDIT + a desktop panel "↻ Rotate" button. Also fixed a latent door-arc
   bug (swept 270° for hinge-hi + negative-perp; now computes pivot/leaf/jamb + short quarter).
5. **Sliding-door kind** (`c620880`). Surface/barn-door: authored box = the OPENING, panel inferred
   as opening + a fixed **10 cm** overhang. Reuses aperture model — `hinge`=slide dir, `swing`=rail
   face → rotates 4-way like a door. Glyph = rest panel + travel arrow to the open extent.

## Standing decisions (live constraints; stable architecture is in the docs above)

- **Apertures are ONE model, ONE glyph source** (memory `aperture-zones`). Kinds `door`/`window`/
  `halfwall`/`sliding` are subtract zones carrying `sill`/`head` (+ `hinge`, + `swing` on door/
  sliding); defaults in `APERTURE_DEFAULTS` (`zoneColors.js`); `Rectangle.setKind` resets them on
  retype, `rotateAperture` cycles orientation (door+sliding 4-way, window 3-way). All plan symbols
  come from `src/core/apertureGlyph.js` so print (`planSheet`), DXF (`dxf`), and the AR floor overlay
  (`mr.js` `addApertureGlyphs`) **cannot diverge** — arcs are sampled as segments (no backend arc),
  and `resolveApertureOrient()` maps hinge+swing to `hingeEnd`/`perp` from each caller's own corners
  so the flipped print page keeps left/right AND in/out put. Sliding's 10 cm overhang is passed in
  the caller's units (meters for DXF/AR; page-scaled `0.10*(L.X(1)-L.X(0))` for print). `extrude.js`
  is deliberately NOT aperture-aware yet. Serialize stays v3 (fields additive; old files re-default).
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

All pushed to `origin/main`; every push auto-deploys to Pages. **s24 (`b5a7b6b..c620880`):**

- `c620880` Add sliding-door aperture kind (surface/barn-door; panel = opening + 10 cm).
- `0ec0e8d` Rotate doors/windows: add `swing` + 4-way rotate (AR A/X + desktop panel); fix door-arc bug.
- `5e8d445` Left companion stick rotates the placed plan in 20° steps.
- `8869f9e` Prompt to pick up controllers when the headset falls back to hand tracking.
- `b5a7b6b` Add half-wall kind + unified aperture model (`sill`/`head`/`hinge`) with direction glyphs.

**Earlier (shipped; behaviors are in `CLAUDE.md`/`docs`/memories):** s23 `f0d89e1..04a5ab3` (conduit
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
| `src/core/i18n.js` | EN/FR/ZH strings; mode labels + per-mode help (updated for A/B input model) |
| `src/core/apertureGlyph.js` | **Sole** source of door/window/half-wall/sliding plan glyphs + `resolveApertureOrient`; consumed by planSheet, dxf, mr |
| `src/core/zoneColors.js` | `ZONE_KINDS`, colors, `APERTURE_DEFAULTS`, `isAperture` |
| `src/io/planSheet.js` / `src/io/dxf.js` | Print sheet / DXF; each has a `drawZoneGlyph`/`writeZoneSymbol` that calls the aperture module |
| `docs/ar-survey.md` | Kept-current AR structural reference (modes/inputs/dimensioning/traps) — **NOT yet updated for s24** |
| `docs/ar-qa-checklist.md` | On-device QA record (walked vs not) |

## Next step

- **A — APERTURE LANE: WALK THE AR BITS + DOC IT (newest, desktop-verified).** On device, in PLAN
  EDIT select a door and press **A/X** → confirm it rotates through 4 swing states (and a window
  through hinge left/right/both, a sliding door through its 4 states); confirm the door-swing /
  window-casement / half-wall-hatch / sliding floor glyphs draw in the AR overlay
  (`addApertureGlyphs`) and match the printed sheet. Also walk the other three s24 AR interactions:
  the **pick-up-controllers** prompt (set controllers down → notice appears, pick up → HUD returns),
  the **LEFT-stick ±20° plan rotate** (about the origin corner; confirm direction/step feel), and
  that these didn't disturb the existing A/X-flip (DIMS/TRANSLATE) or B/Y-delete bindings. **Then
  update `docs/ar-survey.md`** — it does NOT yet describe A/X-rotate-in-PLAN-EDIT, the LEFT-stick plan
  rotate, the hand-mode prompt, or the aperture floor glyphs. Design: memory `aperture-zones`.
  Deferred by owner (do NOT build unprompted): height-aware `extrude` that carves `[sill,head]`, and a
  sill/head number editor.
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

- **Every AR-side change from s22–s24 is AR-unwalked.** Highest-risk from s24: **A/X now also rotates
  a selected aperture in PLAN EDIT** — confirm it doesn't disturb A/X-flip in DIMS/TRANSLATE (it's an
  `else if` chained after them, gated on `edit` mode + `rotateAperture()` returning true). From s23:
  the input rework moved delete off grip onto B/Y — confirm no mode still expects grip-to-delete.
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
