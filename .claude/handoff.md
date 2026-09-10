# House CAD — session handoff

**Read this first, then `CLAUDE.md`.** This is the "how do I resume" doc. Deep Phase-5 rationale
and every XR gotcha live in Claude memory `phase5-xr-intent.md`, which auto-loads each session —
don't duplicate it here.

**Date:** 2026-09-10 (session 6)
**Status:** **Multi-floor / storeys committed (`a38f31a`, local — NOT pushed), build-clean, but
UNVERIFIED** — desktop not yet eyeballed in a browser, MR not tried on the Quest. `main` is 2 commits
ahead of `origin/main` (`a38f31a` feature + `a1a8ef2` session-5 docs); nothing pushed this session.

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/**. This session added **multi-floor storeys**: `Project` now
holds an ordered `floors[]`, each an independent plan (rectangles + constraints + its own height),
sharing the same plan origin (the surveyed corner) so storeys stack by construction. A **facade**
(`project.rectangles/constraints/height` → the active floor) kept every existing consumer working
unchanged. Desktop gains a **floor switcher + ghost underlay + stacked 3D**; MR gains a **thumbstick-↕
floor switch** with the overlay lifted to each floor's elevation. **The current goal is still Phase 5
— an on-site MR survey tool** (read `phase5-xr-intent.md` before planning), now multi-storey.
**Nothing multi-floor has been run yet** (only `npm run build` passed), AND the pre-existing on-device
QA debt (S1/RECAL/S2 never tried on Quest) is still open — so the immediate need is **verification**,
not more features. XR cannot be verified headlessly.

## What changed in session 6

> Next agent: when you add your section here, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete the rest.

1. **Multi-floor data model** (`model.js`, `constraints.js`). New `Floor {id,name,rectangles,
   constraints,height,elevation}`; `Project` holds `floors[]` + `activeFloorId` + `groundFloorId`.
   Facade getters/setters make `project.rectangles/constraints/height` point at the **active** floor,
   so sketch2d/mr/serialize/solver needed no rewrite. `_emit()` recomputes elevations (stack heights
   off the ground datum: ground=0, up accumulates, basement negative), then solves **each** floor.
   `solve()` now takes a floor (any `{rectangles,constraints}`). New floor API: `addFloor/removeFloor/
   setActiveFloor/setGroundFloor/renameFloor`.
2. **Persistence v2 + migration** (`serialize.js`). Writes `floors[]` (+ active/ground ids); loads
   both v2 and **legacy v1** (top-level `rectangles` → one "Ground" floor). Old localStorage autosaves
   migrate transparently. Export merges the whole stack.
3. **Desktop UI** (`index.html`, `style.css`, `main.js`, `sketch2d.js`, `view3d.js`). Floor switcher
   `#floor-ctl` (top-left): highest storey first, click to switch, **＋▲/＋▼** add above/below, **⌂**
   set ground datum, **✕** remove, dbl-click name to rename. **Ghost underlay**: the adjacent floor
   (below, else above) drawn as faint dashed outlines (labeled `underlay: <name>`). **3D stacking**:
   `view3d` swapped its single `mesh` for a `house` **Group** of one mesh per floor at `position.y =
   elevation`; `setGeometry` now takes `[{geometry, elevation}]`.
4. **MR per-floor** (`mr.js`). Overlay lifts by the active floor's elevation (`overlayY() = planPos.y
   + activeElevation()`, a pure Y-lift so worldToPlan is unaffected). **Thumbstick ↕** switches floor
   (up=above, down=below), **↔** still cycles modes, dominant-axis guard prevents diagonal cross-talk.
   EDGE/SIZE ray hits use `overlayY()` so you edit at the floor you stand on. `FLOOR` re-leveling is
   guarded to the ground floor (an upper-floor touch would double-count its elevation). `surveyed`/
   `activeRect` re-scoped to the active floor on switch (`refreshFloorEditState`). HUD shows `floor:`.

## Standing decisions

- **This machine is Linux (Steam Deck), Node v20.20.2 on PATH** — `npm install/dev/build` run
  directly. The fnm/Node-22 block in `CLAUDE.md` Commands is Windows-only (a prior machine); ignore.
- **Git: commit and push directly on `main`, no feature branches** (`CLAUDE.md` → Git workflow).
  **`main` auto-deploys to Pages on push**, so every push publishes — only push when asked.
- **`npm run build` is the only automated check** — no tests/linter/types. Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs.
- **Keep the dev server running; report the `https://` Network URL** — the user QAs on the Quest over
  LAN; WebXR needs https (self-signed; accept once). This session: `https://192.168.1.154:5174/`
  (`npm run dev -- --host --port 5174 --strictPort`). (memory: `serve-and-share-network-url`.)
- **Phase 5 = on-site MR survey tool.** Physical **tape = source of truth**; Quest tracking/anchors =
  spatial scaffold only. Keep the **axis-aligned rectangle** model. Full rationale + XR gotchas:
  `phase5-xr-intent.md`.
- **Multi-floor design (session 6, settled with the owner):** floors are **independent plans** (not
  copy-from-below, not one shared footprint); **per-floor height**; all floors share the **same plan
  origin corner** (differ only in elevation). **MR = register once on the ground**, each floor carries
  its **own elevation** (derived from stacked heights), **RECAL** fixes drift. **NO per-room anchors,
  NO Quest room scan / plane detection** (owner ruled out — `phase5-xr-intent.md`). API facts (don't
  re-research): WebXR `unbounded` reference space is **unsupported on Quest** (so `local-floor` + RECAL
  is the only whole-house path); persistent anchors cap at **8/site** (moot given no anchoring plan).
- **Survey modes (6, stable `id`s):** FLOOR → REGISTER (2-step origin+yaw) → DROP → EDGE (2-step
  lock+snap) → RECAL (corner+edge re-zero) → SIZE (two-ref numpad). Modes are DATA in `modes`;
  grip/frame-loop key off `id`. Grip = context undo. Thumbstick ↔ cycles modes, ↕ changes floor.
- **Exact size = dimension constraints only** (desktop AND SIZE). No on-canvas W/H, no inline size
  editor, no W/H field. SIZE writes hard constraints overriding EDGE's rough pushed size.
- **Geometry in meters**; `units.js` converts only display/input. Distance constraints ordered+signed
  (`value = coord(b)−coord(a)`); `swapConstraint()` reverses; `setConstraintMagnitude()` keeps sign.
- **Coordinate mapping:** plan `(x,y)` → planGroup-local `(x,0,−y)`; planGroup applies `planYaw` about
  UP + `planPos`. `worldToPlan`/`planToWorld` invert/apply via Three's `worldToLocal`/`localToWorld`.
  Extrusion base sits at world y=0, so a floor mesh/overlay at elevation `e` is just `position.y = e`.
- **Desktop layout:** toolbar is `<footer id="toolbar">` (export menu opens upward); 3D pane removed
  (2D fills window) but the Three renderer is kept, parked off-screen at 640×480 because AR presents
  through it. START AR in `#ar-group`. `setupMR(view, project, getFootprint)`.
- **Prior features still live:** mesh export STL/OBJ/GLB, touch + on-screen zoom, draggable dimension
  placement, save/load JSON + localStorage autosave.
- **Commit identity `Alexis He <ahe.krosk@gmail.com>`**; repo public. Commits carry `Co-Authored-By:
  Claude` / `Claude-Session` trailers. `origin/phase5-mr-overlay` still exists on the remote — defunct,
  safe to delete.

## Findings / traps worth knowing

- **The facade is why multi-floor was cheap.** `project.rectangles/constraints/height` are getters
  onto the active floor — DON'T reintroduce raw fields. Editing always targets the active floor; the
  solver runs per floor in `_emit()`.
- **MR overlay-lift is a pure Y translation.** `worldToPlan` reads only x/z, so plan coords stay
  correct on every storey; `planToWorld` returns points at the overlay plane. Ray planes/reticles for
  EDGE/SIZE use `overlayY()`; tip-mode reticles (FLOOR/REGISTER/RECAL) still use bare `floorY` (ground
  registration flow). **Upper-floor overlay height is only as right as the desktop-entered storey
  heights** — there is NO in-MR floor-height capture yet.
- **Floors are created on desktop only.** MR's thumbstick-↕ switches among EXISTING floors; it can't
  add one. Set up storeys + heights on desktop before an MR multi-floor test.
- **XR reference-space mismatch (cost hours).** In `sessionstart`: `localSpace = await
  requestReferenceSpace('local-floor')` then **`renderer.xr.setReferenceSpace(localSpace)`**. Any pose
  math must use the same space Three renders with. `setReferenceSpaceType()` alone did NOT take.
- **Drift correction is limited.** Single origin anchor, POSITION only → corrects translation, not
  rotation; error grows with distance. **RECAL** is the manual fix (exact at the recal corner). No
  per-room anchors (deliberately — see Standing decisions).
- **Desktop does NOT render origin-referenced dimensions.** `sketch2d._edgeLineWorld` returns null for
  `__origin__` and `_drawDimensions` skips it — edge↔origin constraints solve/lock but draw no line.
- **`View3D.setGeometry` rebuilds meshes every model change** — a one-time `visible=false` is lost.
  Use the `hideMesh` flag (MR sets it). MR references `view.house` (the floor group), not `view.mesh`.
- **`LineBasicMaterial` is always 1px in WebGL** — edges/highlights are flat floor strips (quads,
  `EDGE_HALF=0.02`). Two highlight meshes so SIZE shows both refs.
- **`matrixAutoUpdate=false` + setting `.matrix` does NOT update `matrixWorld`** — drive
  `position`/`quaternion` (default autoupdate), which the code does.
- **`getCamera().position` stays local (≈0)** in XR — read world pos from `matrixWorld.elements`
  (`[12],[13],[14]`).
- **Remote logging debugs on-headset.** dev-only `POST /__log` (vite middleware) → `quest-debug.log`
  (**gitignored — do NOT stage it**); `src/ui/remoteLog.js` mirrors console. `tail -f` while testing.
- **`GLTFExporter` fails in Node** (works in browser) — don't "fix" headlessly. Harmless MR warning:
  `Can't change size while VR device is presenting`. depth-sensing omitted (noisy floor occlusion).
- **WebXR AR is Quest/Android (ARCore), not iOS.** Controller input wouldn't map to a phone — focus
  stays on Quest.

## Commits

Substantive only (doc-only omitted; `git log` has all). `main` upstream `origin/main`;
`main` is ahead of `origin/main` by the two commits below — **nothing pushed this session**.

- `a38f31a` **Phase 5: multi-floor storeys** (model, 2D, 3D, serialize, MR) — session 6, unpushed.
- `a1a8ef2` Docs refresh (session 5) — unpushed.
- `27653b6` Phase 5 S2: in-headset SIZE mode (+ origin-distance core).
- `4dc55c6` Phase 5: RECAL mode — drift correction by re-zeroing against a known corner.
- `1749424` Phase 5 S1: in-headset survey — edge-push free-space zones.
- `14a22c4` Phase 5 M0: mixed-reality floor-plan overlay on Quest 3.

## Resuming from a clean checkout

```bash
npm install                          # once
npm run dev -- --host --port 5174 --strictPort   # https dev server; report the https:// Network URL
npm run build                        # the only automated check — expect "✓ built in …"
```

On the Quest (Meta/Horizon browser): open the https Network URL, accept the self-signed cert once,
tap **START AR**. Node v20 and `node_modules` already present here. The dev server is typically left
running between sessions (check `:5174` before starting a new one).

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/core/model.js` | `Floor` + `Project` (floors[], activeFloorId, groundFloorId); facade to active floor; `_recomputeElevations`; `_emit` solves each floor; floor CRUD |
| `src/core/constraints.js` | per-axis weighted least-squares `solve(floor)`; `makeDistance`, `makeOriginDistance`/`ORIGIN_ID` |
| `src/io/serialize.js` | v2 floors[] + v1→one-Ground migration |
| `src/core/extrude.js` | footprint → 3D mesh; `mergeFloorGeometries` (stack for export); flat floor fill/outline for MR |
| `src/ui/view3d.js` | 3D viewport; `house` Group (one mesh/floor at elevation); `setGeometry([{geometry,elevation}])`; `hideMesh` |
| `src/ui/sketch2d.js` | 2D editor; `_drawGhost` underlay of the adjacent floor |
| `src/ui/mr.js` | MR session; modes; `overlayY()` floor-elevation lift; thumbstick-↕ `switchFloor`; `refreshFloorEditState`; numpad; anchors; HUD |
| `src/main.js` | wiring; per-floor rebuild + stacked export; `#floor-ctl` switcher; `setupMR` |
| `index.html` / `src/style.css` | desktop layout + `#floor-ctl` |
| `vite.config.js` | https dev server + dev-only `/__log` endpoint |
| `phase5-xr-intent.md` (Claude memory) | deep Phase-5 rationale + XR gotchas + multi-floor/anchor decisions; auto-loads |

## Next step

- **A — VERIFY, don't build (do this first).** Two verifications are stacked and both are cheap-ish:
  (1) **Desktop eyeball** in a browser (HMR is live): add a floor above, draw offset, confirm the
  ghost underlay lines up and the 3D shows stacked storeys; add a basement; toggle ⌂ and watch
  elevations; save/reload. (2) **On-device QA on the Quest** — still owed from before AND now includes
  multi-floor: walk REGISTER→DROP→EDGE→SIZE→RECAL on the ground, then **thumbstick-↕ to another floor**
  and confirm the overlay lifts to the right height and edits target that floor. No new features until
  felt.
- **B — Push** (`a38f31a` + `a1a8ef2`) once the feature is at least desktop-verified. Owner asks
  first; **pushing publishes to Pages**. Never stage `quest-debug.log`.
- **C — Follow-ups surfaced this session:** in-MR floor creation + in-MR storey-height capture (today
  floors/heights are desktop-only); point-ray to re-activate an older zone (EDGE/DROP/RECAL still key
  off `activeRect`); verify world→plan handedness + ALIGN convention on device; gate/remove debug HUD.
- ~~Per-room anchors~~ — **dropped (session 6):** owner ruled out anchors-per-room and Quest room scan;
  drift is RECAL + tape only. (`phase5-xr-intent.md`.)

## Known open questions

- **Everything multi-floor is unverified** — desktop not eyeballed, MR not on device; only `npm run
  build` passed. No runtime/XR regression guard exists.
- **On-device QA of S1/RECAL/S2 was never done** (carried from session 5) — world→plan sign/handedness,
  `nearestEdge` near corners, numpad ray-pick feel all still unconfirmed on the Quest.
- **Upper-floor overlay height depends on desktop-entered storey heights** — no in-MR capture, so a
  wrong height floats the overlay off the real floor (RECAL fixes horizontal drift, not this).
- **Anchor drift over a multi-room / multi-floor house is untested** — only single-room exercised.
