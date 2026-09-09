# House CAD — session handoff

**Read this first, then `CLAUDE.md`.** This is the "how do I resume" doc. Deep Phase-5 rationale
and every XR gotcha live in Claude memory `phase5-xr-intent.md`, which auto-loads each session —
don't duplicate it here.

**Date:** 2026-09-09 (session 4)
**Status:** Phase 5 **survey milestone S1 — in-headset authoring of free-space zones — committed,
pushed, and merged to `main` (so it DEPLOYED to Pages), but still UNVERIFIED on device.** A desktop
layout change (toolbar→footer, 3D pane hidden) is now live too. Working tree is clean.

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** (from `main`). **Session 4's S1 work is now on `main` and
deployed** — the owner approved the direct push this session. M0 (mixed-reality floor-plan overlay +
touch registration) worked on device; S1 is live but **not yet tried on the Quest**.
**Session 4 built the SURVEY milestone (S1):** stand in a real room and author the plan's
**axis-aligned free-space rectangles** in place — `DROP` a starter box at your feet, then in `EDGE`
mode point the controller ray at one of its edges to lock it and touch the matching real wall to
snap that edge out. Registration (`ORIGIN`+`ALIGN`) was merged into one two-step `REGISTER` action.
Zone edges are drawn as bold per-rectangle floor strips. **The current goal is still Phase 5: an
on-site MR survey tool** — see `phase5-xr-intent.md` before planning. **The next real feature is S2:
tape-based exact numeric entry (a rendered in-headset numpad)** — nothing about it is built yet.
**XR cannot be verified headlessly** — `npm run build` only proves it compiles; every MR change is
tested by the user on the Quest.

## What changed in session 4

> Next agent: when you add your section here, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete the rest.

1. **MR can now author the model.** `setupMR(view, project, getFootprint)` — added `project`
   (`main.js`) so survey modes call `project.addRectangle`/`removeRectangle`/`touch`.
2. **Survey model = EDGE-PUSH of free space** (chosen over an earlier corner-touch version, which
   was discarded same session): `DROP` spawns a 1.5 m `add` box at your **standing position** (no
   floor touch — reads the headset world pos); `EDGE` is a two-step per wall — **point ray at an
   edge → trigger LOCKS it (yellow) → touch the real wall → trigger snaps** that edge to the wall.
   Only the touch's **perpendicular** coord is used; the opposite edge stays fixed (`setEdge`).
3. **`ORIGIN`+`ALIGN` merged into one two-step `REGISTER`** (like EDGE): 1st touch = origin, 2nd
   touch (a point along a wall) = yaw. Label/color flip ORIGIN(blue)→ALIGN(amber) between steps.
   Modes are now **`FLOOR`, `REGISTER`, `DROP`, `EDGE`** and carry stable `id`s (REGISTER's label is
   dynamic, so grip/frame-loop logic keys off `id`, not label text).
4. **Per-rectangle UNMERGED edge outlines**, drawn as **bold flat floor strips** (not 1px GL lines):
   `EDGE_HALF=0.02` → 4 cm wide. Rest zones purple, active zone brighter, hover magenta / locked
   yellow (`edgeHi`, `renderOrder=10`, `depthTest:false`). The **fill stays the merged union** (one
   uniform 0.22-opacity blob — overlaps do NOT stack/darken); only edges are per-rectangle.
5. **Origin gizmo** (teal ring + `+X` arrow showing the ALIGN direction) rides `planPos`/`planYaw`;
   it's the empty-state **placeholder**. Removed `placeAt`'s `children.length` guard that silently
   **blocked registering an empty plan** — you can now survey from scratch.
6. **`view.hideMesh` flag** (`view3d.js`): `setGeometry` rebuilds a fresh (visible) mesh on every
   model change, which made the extruded **walls reappear in passthrough** when a survey rect was
   added. MR sets `hideMesh=true` for the whole session; restored on exit.
7. **Desktop layout:** toolbar moved header→**footer** (`<footer id="toolbar">`, export menu now
   opens upward); **3D pane removed** from the layout (2D plan fills the window). The Three renderer
   **cannot** be deleted (AR runs through it), so `#view3d` is parked **off-screen** at 640×480.
   **START AR** button moved into the footer (`#ar-group`). Splitter element gone (`main.js` guards).

## Standing decisions

- **This machine is Linux (Steam Deck), Node v20.20.2 on PATH** — `npm install/dev/build` run
  directly. The fnm/Node-22 dance in `CLAUDE.md` is Windows-only (a prior machine); ignore it here.
- **`npm run build` is the only automated check** — no tests/linter/types. Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs.
- **Keep the dev server running and report the `https://` Network URL** — the user QAs on the Quest
  over the LAN; WebXR needs https (self-signed; accept the cert once). (memory:
  `serve-and-share-network-url`.) This session ran on **:5174** (`--port 5174 --strictPort`).
- **Phase 5 = on-site MR survey tool.** Measure real walls with a **physical tape**, enter exact
  measurements. **Tape = source of truth; Quest tracking/anchors = spatial scaffold only.** Keep the
  **axis-aligned rectangle** model (approximate real walls square — it's "house massing"). Full
  rationale: `phase5-xr-intent.md`.
- **Survey interaction (session 4, on top of that intent):** author **free-space** zones by
  edge-push (point-ray at edge, touch wall), NOT corner-touch. Registration is the two-step
  `REGISTER`. Exact size will come from S2's numpad as **hard constraints**, overriding the pushed
  rough size — consistent with the standing "exact size = dimension constraints only" rule.
- **Sizing is constraint-first** on desktop — no on-canvas W/H, no inline size editor, no W/H
  fields. Do NOT re-add.
- **Geometry stored in meters**; `units.js` converts only display/input. Distance constraints are
  ordered + signed (`value = coord(b) − coord(a)`); `swapConstraint()` reverses.
- **Coordinate mapping** (needed for any MR pose math): plan `(x,y)` → planGroup-local `(x,0,−y)`;
  `planGroup` then applies `planYaw` about UP + `planPos`. `worldToPlan`/`planToWorld` in `mr.js`
  invert/apply this via Three's `worldToLocal`/`localToWorld` (so drift folded into `planPos` is
  tracked automatically).
- **Prior features still live, no action needed:** mesh export STL/OBJ/GLB (`src/io/exportMesh.js`),
  touch + on-screen zoom, draggable dimension placement, save/load JSON + localStorage autosave.
- **Commit identity is `Alexis He <ahe.krosk@gmail.com>`**; repo is **public**. Deploy is automatic
  on push to `main` (`.github/workflows/deploy.yml`, Pages = GitHub Actions). `.claude/` is tracked
  except `.env`/`.teams_request`.

## Findings / traps worth knowing

- **XR reference-space mismatch (cost hours).** Three renders in `local` by default; hit/anchor
  poses use `local-floor`. Fix (in `sessionstart`): `localSpace = await
  requestReferenceSpace('local-floor')` then **`renderer.xr.setReferenceSpace(localSpace)`**. Any
  pose math must use the same space Three renders with. `setReferenceSpaceType()` alone did NOT take.
- **`View3D.setGeometry` creates a NEW visible mesh every model change** — a one-time
  `mesh.visible=false` is lost on the next rebuild. Use the `hideMesh` flag (see change 6).
- **The 3D renderer cannot be removed** while AR is wanted — the WebXR session presents through it.
  It's parked off-screen instead. `View3D._resize` guards 0×0, but the constructor path doesn't, so
  a `display:none` container would give a NaN aspect — keep it sized.
- **`LineBasicMaterial` is always 1px in WebGL** (linewidth ignored) — hence edges are drawn as flat
  floor strips (quads) for real thickness. If they need to be bolder still, either bump `EDGE_HALF`
  or move to fat lines (`Line2`/`LineMaterial`, needs `resolution` set — fiddly in XR).
- **`matrixAutoUpdate=false` + setting `.matrix` does NOT update `matrixWorld`** — drive
  `position`/`quaternion` (default autoupdate), which the code does.
- **`getCamera().position` stays local (≈0)** in XR — read world pos from
  `getCamera().matrixWorld.elements` (`[12],[13],[14]` = x,y,z). DROP uses `[12]/[14]`.
- **`depth-sensing` auto-occlusion is noisy at the floor plane** — omitted from `sessionInit`.
- **Remote logging is how you debug on-headset.** dev-only `POST /__log` (middleware in
  `vite.config.js`) → `quest-debug.log` (gitignored — do NOT stage it); `src/ui/remoteLog.js`
  mirrors console/errors/values. `tail -f` it while the user tests. Quest = OculusBrowser 150.
- **WebXR AR runs on Android Chrome (ARCore), NOT iOS Safari.** But this app's input is
  controller-based (tracked tip touch, A/B + thumbstick mode-cycle, controller ray) — a phone has
  none of that, so phone support would need a separate touch + `dom-overlay` + hit-test input layer.
  Decision this session: **keep focus on Quest.**
- **`GLTFExporter` fails in Node** (`FileReader is not defined`) but works in the browser — don't
  "fix" it headlessly. Harmless MR warning: `Can't change size while VR device is presenting`.

## Commits

Substantive only (`git log` has all):

- `27653b6` **Phase 5 S2: in-headset SIZE mode — the desktop dimension tool in AR** (+ origin-distance core).
- `4dc55c6` **Phase 5: RECAL mode — drift correction by re-zeroing against a known corner**.
- `1749424` **Phase 5 S1: in-headset survey — edge-push free-space zones**.
- `14a22c4` **Phase 5 M0: mixed-reality floor-plan overlay on Quest 3** — the M0 milestone.

**WORKFLOW RULE CHANGED (session 5):** commit and push **directly on `main`** — do NOT create
feature branches (memory: `commit-directly-on-main`; overrides the old branch-and-merge rule and the
base "branch first" default). **`main` still auto-deploys to Pages on push**, so every push
publishes — surface that, and only push when the user asks. The old `phase5-mr-overlay` branch was
fast-forwarded into `main` and is now defunct.
The commits carry `Co-Authored-By: Claude` / `Claude-Session` trailers (M0 did not — owner is aware,
declined to strip them).

## Resuming from a clean checkout

```bash
npm install                          # once (adds @vitejs/plugin-basic-ssl)
npm run dev -- --host --port 5174 --strictPort   # https dev server; report the https:// Network URL
npm run build                        # the verification step — expect "✓ built in …"
```

On the Quest (Meta/Horizon browser): open the https Network URL, **accept the self-signed cert
once**, tap **START AR** (now in the footer). Node v20 and `node_modules` already present here.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/ui/mr.js` | MR session: passthrough, REGISTER/FLOOR/DROP/EDGE modes, world↔plan transform, bold zone strips, origin gizmo, anchors, debug HUD |
| `src/ui/view3d.js` | 3D viewport; XR-enabled; `onXRFrame` hook; `hideMesh` flag; grid/floor fields |
| `src/core/extrude.js` | footprint → 3D mesh; also flat floor fill + outline geometry for MR |
| `src/core/model.js` | Project/Rectangle model + change bus (`_emit` solves then notifies) |
| `src/core/constraints.js` | per-axis weighted least-squares solver (S2 will write self-W/H constraints here) |
| `index.html` / `src/style.css` | desktop layout — toolbar is a footer, 3D pane hidden, START AR in `#ar-group` |
| `src/main.js` | wiring; `setupMR(view, project, getFootprint)`; splitter guarded |
| `vite.config.js` | https dev server + dev-only `/__log` endpoint |
| `phase5-xr-intent.md` (Claude memory) | deep Phase-5 rationale + XR gotchas; auto-loads |

## Next step

- **A — S2: tape numeric entry (the point of Phase 5).** A **rendered 3D numpad** (no in-headset
  keyboard). Agreed flow: **inline per-rectangle** — after pushing a room's edges, enter exact
  **width then height**, written as **hard dimension constraints** (self-width = constraint between
  the rect's own left/right edges via `project.addConstraint`; self-height between bottom/top) that
  override the pushed rough size. This is the next real feature.
- **B — Re-activate an older zone.** `EDGE` currently only edits the **last-dropped** rect
  (`activeRect`). Add "point ray inside a rect → make it active" so earlier rooms can be re-edited.
- **C — Cleanups before this branch is "done":** verify the ALIGN axis convention + the
  world→plan sign/handedness on device (see open questions); gate/remove the debug HUD; consider an
  in-headset "clear all"; bump/replace edge strips if not bold enough.
- ~~Corner-touch survey (touch two opposite corners → bbox)~~ — built then **discarded this
  session**: assumed rectangular rooms and required reaching corners. Replaced by edge-push of free
  space (change 2), which fits the edge-as-scalar solver and non-rectangular rooms better.
- ~~Enter-VR / dark-scene viewing~~ — superseded earlier: the user chose MR passthrough, not VR.

## Known open questions

- **Everything session-4 is unverified on device** — it's committed and DEPLOYED but never tried on
  the Quest; only the headless build passed. No XR regression guard exists.
- **World→plan transform sign/handedness is untested.** Most likely bug: surveyed zones land
  **mirrored or rotated** (the `py = −local.z` flip or a yaw mismatch). The per-action `rlog` lines
  (`register origin/align`, `drop rect`, `edge locked/set`) + the on-tip HUD are how to diagnose.
- **`nearestEdge` uses simple perpendicular distance** — may pick the wrong edge when you aim near a
  corner. Watch the `edge: hov=` HUD line.
- **Anchor drift over a multi-room house is untested** — only single-room placement exercised.
  Printed control-point re-registration is designed (`phase5-xr-intent.md`) but not built.
