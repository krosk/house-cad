# House CAD — session handoff

**Read this first, then `CLAUDE.md`.** This is the "how do I resume" doc. Deep Phase-5 rationale
and every XR gotcha live in Claude memory `phase5-xr-intent.md`, which auto-loads each session —
don't duplicate it here.

**Date:** 2026-09-09 (session 5)
**Status:** Phase 5 milestones **S1 (survey), RECAL (drift correction), and S2 (in-headset SIZE
dimension tool) are all committed, pushed to `main`, and DEPLOYED to Pages — but every one is
UNVERIFIED on the Quest** (headless `npm run build` only). Working tree clean; `main == origin/main`
at `f0e3951`.

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** (from `main`). The **on-site MR survey tool** (Phase 5, Quest
3 passthrough) can now: **REGISTER** a real-world origin+yaw, **DROP** a starter zone at your feet,
**EDGE**-push its edges to real walls, **RECAL** to correct tracking drift, and **SIZE** — a
rendered numpad that authors exact dimensions as hard constraints. **The current goal is still Phase
5: an on-site MR survey tool** — read `phase5-xr-intent.md` before planning. **Nothing since M0 has
been tried on device**, so the immediate need is **on-Quest QA** (see Next step / Open questions),
not more features. **XR cannot be verified headlessly** — every MR change is tested by the user on
the Quest.

## What changed in session 5

> Next agent: when you add your section here, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete the rest.

1. **RECAL mode — drift correction** (`4dc55c6`). A 5th survey step: re-zero the whole plan against a
   KNOWN corner. Two touches (like REGISTER but referencing any surveyed corner, not just origin):
   1st = the real corner (auto-picks the nearest plan corner, previewed by a floor ring — cyan
   hover, purple once locked), 2nd = a point along one of its real edges. `recalibrate()` solves the
   rigid floor transform (`planYaw`+`planPos`) so both corner and edge-direction land on the touches;
   the whole plan follows rigidly, fixing BOTH rotational and positional drift. Same
   `Ry(yaw)·(x,0,−y)+planPos` convention as REGISTER, so it's self-consistent regardless of the
   untested world→plan handedness.
2. **S2 = SIZE, the desktop dimension tool in AR** (`27653b6`). A rendered numpad panel (canvas
   texture, ray-picked keys) + a SIZE mode that **picks two references then types the distance**,
   mirroring desktop's two-edge click. A reference is a rect **EDGE** or the plan **ORIGIN** axis:
   edge↔edge = a size (`makeDistance`, first pick anchors), edge↔origin = a position lock
   (`makeOriginDistance`). Picking an existing pair **prefills its value to edit**. Edges are
   pickable across ALL rects (span-checked `nearestEdgeAny`), so inter-room dims work. The ray does
   double duty: floor rays pick refs; once both chosen it drives the numpad. Grip steps back one pick.
   *(An earlier single-edge SIZE and a separate PIN mode were built then folded into this one flow
   the same session — the user found them identical from the hand's POV.)*
3. **Origin-distance constraint core** (in `27653b6`). New `makeOriginDistance(rect, edge)` +
   `ORIGIN_ID` in `constraints.js`; the solver treats an origin endpoint as a fixed `0` constant (it
   drops out of the LHS), so the hard row becomes `coord = distance` — an absolute position lock in
   plan space that rides the registered frame. Same per-axis least-squares machinery; no new solver
   path; serialization is already generic.
4. **Workflow rule changed → commit/push directly on `main`, no feature branches** (`f0e3951`; now a
   "Git workflow" section in `CLAUDE.md`). The old `phase5-mr-overlay` branch was fast-forwarded into
   `main` and is defunct. `origin/phase5-mr-overlay` **still exists on the remote** — safe to delete.

## Standing decisions

- **This machine is Linux (Steam Deck), Node v20.20.2 on PATH** — `npm install/dev/build` run
  directly. The fnm/Node-22 dance in `CLAUDE.md`'s Commands block is Windows-only (a prior machine);
  ignore it here.
- **Git: commit and push directly on `main`, no feature branches** (`CLAUDE.md` → Git workflow).
  **`main` auto-deploys to Pages on push**, so every push publishes — surface that; only push when
  asked.
- **`npm run build` is the only automated check** — no tests/linter/types. Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs.
- **Keep the dev server running and report the `https://` Network URL** — the user QAs on the Quest
  over the LAN; WebXR needs https (self-signed; accept the cert once). (memory:
  `serve-and-share-network-url`.) This session ran on **:5174** (`--host --port 5174 --strictPort`);
  LAN URL was `https://192.168.1.154:5174/`.
- **Phase 5 = on-site MR survey tool.** Measure real walls with a **physical tape**, enter exact
  measurements. **Tape = source of truth; Quest tracking/anchors = spatial scaffold only.** Keep the
  **axis-aligned rectangle** model (approximate real walls square — it's "house massing"). Full
  rationale: `phase5-xr-intent.md`.
- **Survey flow & modes (6, stable `id`s):** `FLOOR` (set floor height) → `REGISTER` (two-step
  origin+yaw) → `DROP` (spawn a 1.5 m zone at your standing position) → `EDGE` (two-step: ray-lock an
  edge, touch the wall to snap it) → `RECAL` (corner+edge re-zero) → `SIZE` (two-ref numpad). Modes
  are DATA in the `modes` array; grip/frame-loop key off `id`, not label (REGISTER/RECAL labels flip
  mid-gesture). Grip is context undo per mode.
- **Exact size = dimension constraints only** (desktop AND now SIZE). No on-canvas W/H, no inline
  size editor, no W/H fields. SIZE writes hard constraints that override EDGE's rough pushed size.
- **Geometry stored in meters**; `units.js` converts only display/input (SIZE reads the current unit
  via `toMeters`/`fmt`). Distance constraints are ordered + signed (`value = coord(b) − coord(a)`);
  `swapConstraint()` reverses; `setConstraintMagnitude()` keeps the sign.
- **Coordinate mapping** (needed for any MR pose math): plan `(x,y)` → planGroup-local `(x,0,−y)`;
  `planGroup` then applies `planYaw` about UP + `planPos`. `worldToPlan`/`planToWorld` in `mr.js`
  invert/apply this via Three's `worldToLocal`/`localToWorld` (so drift folded into `planPos` is
  tracked automatically).
- **Desktop layout:** toolbar is a `<footer id="toolbar">` (export menu opens upward); the 3D pane is
  removed (2D plan fills the window) but the Three renderer is kept, parked off-screen at 640×480
  because AR presents through it. START AR lives in `#ar-group`. `setupMR(view, project, getFootprint)`.
- **Prior features still live, no action needed:** mesh export STL/OBJ/GLB (`src/io/exportMesh.js`),
  touch + on-screen zoom, draggable dimension placement, save/load JSON + localStorage autosave.
- **Commit identity is `Alexis He <ahe.krosk@gmail.com>`**; repo is **public**. `.claude/` is tracked
  except `.env`/`.teams_request`. Commits carry `Co-Authored-By: Claude` / `Claude-Session` trailers
  (M0 did not — owner is aware, declined to strip them).

## Findings / traps worth knowing

- **XR reference-space mismatch (cost hours).** Three renders in `local` by default; hit/anchor poses
  use `local-floor`. Fix (in `sessionstart`): `localSpace = await requestReferenceSpace('local-floor')`
  then **`renderer.xr.setReferenceSpace(localSpace)`**. Any pose math must use the same space Three
  renders with. `setReferenceSpaceType()` alone did NOT take.
- **Drift correction is limited.** The frame-loop anchor is a SINGLE anchor at the origin and only
  its POSITION is read — so it corrects translational drift only, never rotation, and error grows
  with distance from origin. RECAL is the manual fix (one rigid transform: exact at the recal corner,
  degrades with distance). No per-room anchors yet.
- **Desktop does NOT render origin-referenced dimensions.** `sketch2d._edgeLineWorld` returns null
  for the `__origin__` endpoint and `_drawDimensions` skips it — so edge↔origin constraints solve and
  lock geometry but draw no dimension line on the desktop plan (no crash). edge↔edge dims render.
- **Numpad raycast needs a current world matrix.** `placeNumpad()` calls
  `numpad.group.updateMatrixWorld(true)` so the same-frame `Raycaster.intersectObject` sees the new
  pose. Panel key = ray UV → `keyAt`.
- **`View3D.setGeometry` creates a NEW visible mesh every model change** — a one-time
  `mesh.visible=false` is lost on rebuild. Use the `hideMesh` flag (MR sets it for the session).
- **The 3D renderer cannot be removed** while AR is wanted — the WebXR session presents through it.
  Parked off-screen instead. `_resize` guards 0×0 but the constructor doesn't — keep it sized.
- **`LineBasicMaterial` is always 1px in WebGL** — edges/highlights are drawn as flat floor strips
  (quads) for real thickness (`EDGE_HALF=0.02`). Two highlight meshes (`edgeHi`,`edgeHi2`) so SIZE
  can show both picked refs at once; the origin ref is shown by tinting the origin gizmo ring.
- **`matrixAutoUpdate=false` + setting `.matrix` does NOT update `matrixWorld`** — drive
  `position`/`quaternion` (default autoupdate), which the code does.
- **`getCamera().position` stays local (≈0)** in XR — read world pos from
  `getCamera().matrixWorld.elements` (`[12],[13],[14]`). DROP + numpad placement use this.
- **`depth-sensing` auto-occlusion is noisy at the floor plane** — omitted from `sessionInit`.
- **Remote logging is how you debug on-headset.** dev-only `POST /__log` (middleware in
  `vite.config.js`) → `quest-debug.log` (**gitignored — do NOT stage it**); `src/ui/remoteLog.js`
  mirrors console/errors/values. `tail -f` it while the user tests. Quest = OculusBrowser 150.
- **WebXR AR runs on Android Chrome (ARCore), NOT iOS Safari.** Input is controller-based (tracked
  tip touch, A/B + thumbstick mode-cycle, controller ray) — a phone has none of that. Decision: keep
  focus on Quest.
- **`GLTFExporter` fails in Node** (`FileReader is not defined`) but works in the browser — don't
  "fix" it headlessly. Harmless MR warning: `Can't change size while VR device is presenting`.

## Commits

Substantive only (doc-only commits omitted; `git log` has all). All pushed; `main == origin/main`.

- `27653b6` **Phase 5 S2: in-headset SIZE mode — the desktop dimension tool in AR** (+ origin-distance core).
- `4dc55c6` **Phase 5: RECAL mode — drift correction by re-zeroing against a known corner**.
- `1749424` **Phase 5 S1: in-headset survey — edge-push free-space zones**.
- `14a22c4` **Phase 5 M0: mixed-reality floor-plan overlay on Quest 3**.

## Resuming from a clean checkout

```bash
npm install                          # once (adds @vitejs/plugin-basic-ssl)
npm run dev -- --host --port 5174 --strictPort   # https dev server; report the https:// Network URL
npm run build                        # the verification step — expect "✓ built in …"
```

On the Quest (Meta/Horizon browser): open the https Network URL, **accept the self-signed cert
once**, tap **START AR** (in the footer). Node v20 and `node_modules` already present here.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/ui/mr.js` | MR session: passthrough; FLOOR/REGISTER/DROP/EDGE/RECAL/SIZE modes; world↔plan transform; zone strips; origin gizmo; RECAL corner re-zero; SIZE numpad (two-ref dimension tool); anchors; debug HUD |
| `src/core/constraints.js` | per-axis weighted least-squares solver; `makeDistance`, `makeOriginDistance`/`ORIGIN_ID` (origin endpoint = fixed 0) |
| `src/core/model.js` | Project/Rectangle model + change bus (`_emit` solves then notifies); `addConstraint`/`setConstraintMagnitude`/`swapConstraint` |
| `src/ui/view3d.js` | 3D viewport; XR-enabled; `onXRFrame` hook; `hideMesh` flag; grid/floor fields |
| `src/core/extrude.js` | footprint → 3D mesh; also flat floor fill + outline geometry for MR |
| `src/ui/sketch2d.js` | desktop 2D editor + dimension tool (skips origin-referenced dims) |
| `index.html` / `src/style.css` | desktop layout — toolbar is a footer, 3D pane hidden, START AR in `#ar-group` |
| `src/main.js` | wiring; `setupMR(view, project, getFootprint)`; splitter guarded |
| `vite.config.js` | https dev server + dev-only `/__log` endpoint |
| `phase5-xr-intent.md` (Claude memory) | deep Phase-5 rationale + XR gotchas; auto-loads |

## Next step

- **A — ON-DEVICE QA (do this first).** S1/RECAL/S2 have never run on the Quest. Put it on, `tail -f
  quest-debug.log`, walk REGISTER → DROP → EDGE → SIZE → RECAL. Likeliest bugs: zones landing
  mirrored/rotated (world→plan sign), `nearestEdge`/`nearestEdgeAny` mis-picking near corners, numpad
  ray-pick feel, SIZE distinguishing floor-edge picks from numpad aim. No new features until this is
  felt.
- **B — Re-activate an older zone.** `EDGE`/`DROP` only edit the **last-dropped** rect (`activeRect`).
  Add "point ray inside a rect → make it active" so earlier rooms can be re-edited. (SIZE already
  reaches any rect's edges, but EDGE/RECAL/DROP still key off `activeRect`.)
- **C — Cleanups:** verify the ALIGN axis convention + world→plan handedness on device; gate/remove
  the debug HUD; per-room anchors (better auto drift correction than the single origin anchor);
  in-headset "clear all". Optionally delete `origin/phase5-mr-overlay`.
- ~~S2 tape numeric entry~~ — **DONE this session** as the SIZE dimension tool (change 2).
- ~~Separate PIN mode for origin-distance~~ — built then **folded into SIZE** same session (edge↔origin).
- ~~Corner-touch survey (two opposite corners → bbox)~~ — built then discarded (session 4): assumed
  rectangular rooms + reaching corners. Replaced by edge-push of free space.
- ~~Enter-VR / dark-scene viewing~~ — superseded: the user chose MR passthrough, not VR.

## Known open questions

- **Everything since M0 is unverified on device** — S1, RECAL, S2 are committed and DEPLOYED but
  never tried on the Quest; only headless builds passed. No XR regression guard exists.
- **World→plan transform sign/handedness is untested.** Most likely bug: surveyed zones land
  **mirrored or rotated** (the `py = −local.z` flip or a yaw mismatch). RECAL should self-correct
  regardless, but the raw survey may look wrong first. Diagnose via `rlog` lines + the on-tip HUD.
- **RECAL corner auto-pick assumes drift < half a room** — if it grabs the wrong plan corner, switch
  step 1 to an explicit ray-lock (like EDGE). Anchor is still created at plan-origin.
- **`nearestEdge`/`nearestEdgeAny` use perpendicular distance** — may pick the wrong edge near a
  corner. Watch the HUD.
- **Anchor drift over a multi-room house is untested** — only single-room placement exercised.
  Per-room anchors / printed control points designed (`phase5-xr-intent.md`) but not built.
