# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A parametric 2.5D CAD tool for house massing (vanilla JS + Vite + Three.js, no framework). You draw axis-aligned rectangles in a 2D plan, tag each **add** or **subtract**, pin **dimension constraints** between edges, and see a live 3D extrusion. "House" means the vertical needs little detail, so the model is treated as **plan + a single extrusion height**.

## Commands

**Node is provided via `fnm`, not on PATH.** Every `npm`/`node` command must prepend the fnm install dir first, or it will fail with "command not found":

```bash
# PowerShell (the primary shell here)
$env:Path = "C:\Users\ahe\AppData\Roaming\fnm\node-versions\v22.22.2\installation;" + $env:Path
npm install      # once
npm run dev      # dev server at http://localhost:5173 (HMR)
npm run build    # production build to dist/  — THIS is the verification step
npm run preview  # serve the production build
```

- **`npm run build` is how you verify changes** — there is no test suite, linter, or type checker. A clean build (`✓ built in …`) means imports/syntax are sound. It does **not** catch runtime/visual bugs.
- When running `vite build` through PowerShell you will see a spurious `node.exe : … NativeCommandError` line — that is PowerShell wrapping Vite's stderr (the chunk-size note), **not** a build failure. Trust the `✓ built in …` line.
- Changes can only be verified by build + browser; Claude cannot click through the UI. Say so when reporting, and flag the most likely visual regression.

## Core architecture

The whole app is a one-way pipeline driven by a change bus. `Project` (in `src/core/model.js`) holds `rectangles`, `constraints`, `markers`, per-floor `electricalLinks` (switch→light control links), the `conduitNodes`/`conduitSegments`/`wires` electrical network (wires route over conduits; path derived in `src/core/conduit.js`, never stored), and `height`, and exposes `onChange(fn)`. **Every mutation calls `Project._emit()`, which runs the constraint solver *first*, then notifies listeners** — so every view (`Sketch2D`, `View3D`, the panels) always sees fully-resolved geometry. When mutating a rectangle's fields in place, call `project.touch()` to trigger this cycle.

```
rectangles (add/subtract, ordered)
  → solve(project)                 constraints resolve edge coords in place
  → computeFootprint()             polygon booleans → MultiPolygon (src/core/geometry2d.js)
  → extrudeFootprint()             MultiPolygon → 3D BufferGeometry (src/core/extrude.js)
  → View3D.setGeometry()
```

### The constraint solver (`src/core/constraints.js`) — the heart of the app

The key insight: because every rectangle edge is axis-aligned, each edge is a single scalar (a left/right edge is an X-coord, a bottom/top edge is a Y-coord), so **the constraint problem decouples into two independent 1-D systems** (all x's, all y's). Each axis is solved as a small **weighted least-squares** problem via normal equations + Gaussian elimination — no general geometric/iterative solver.

- Weights: `W_HARD=1e4` (constraints must hold), `W_STAY=1` (each edge pulls toward its current value → minimal movement), `W_ANCHOR=50` (the first-picked edge `a` of a dimension holds), `W_DRAG=300` (a rectangle flagged `_dragging` wins, so the rest yields).
- A distance constraint stores an **ordered** pair `a`,`b` and a **signed** `value = coord(b) − coord(a)`. Order matters: it sets the sign, locks which side `b` is on, and picks the anchor (`a` holds, `b` moves). `swapConstraint()` reverses it. `setConstraintMagnitude()` preserves the sign. This signedness is deliberate — it keeps the system linear and the solution unique.
- Conflicts are detected post-solve via residual > 1 mm and flagged on `c.conflict` (shown red).

### Units: meters internal, display converts

All geometry is stored in **meters** (maps 1:1 to the extruded mesh and future WebXR world scale). `src/core/units.js` converts only what the user reads/types (m/cm/mm) via `fmt()`, `toMeters()`, `unitLabel()`, and an `onUnitChange` bus. The display-unit preference persists in localStorage and can be changed from either desktop or `PROJECT · UNIT` in AR; it is not project geometry. Never store display units in the model.

### Sizing is constraint-first (deliberate design decision)

A rectangle's exact size is authored **only** through dimension constraints. There is intentionally **no** on-canvas size label, no inline size editor, and no W/H field in the properties panel — do not re-add these. Rough sizing is via drawing and the 8 resize handles; the properties panel edits X/Y position and add/subtract only.

AR `PLAN · TRANSLATE` is the exception for rigid relocation, not sizing: it takes one target edge
coordinate per axis and applies one atomic `(dx,dy)` to the complete active floor. The transform in
`src/core/translate.js` updates origin constraint values plus authored dimension-label placement
before the solver runs once, preserving all relative dimensions and marker pins.

### Persistence

`src/io/serialize.js` serializes the parametric definition (rectangles + constraints + markers + electrical links + conduit nodes/segments + wires + height) to JSON; the footprint/mesh is always recomputed, never stored. Missing `electricalLinks` default to `[]`, so older saves remain compatible. On load, the id counters advance past loaded ids so new items don't collide. Floor copy/paste also lives here: a copied floor persists separately in `localStorage` (`house-cad:floor-clipboard:v1`), and paste replaces the selected floor's authored plan with collision-free rectangle/constraint/marker/link ids plus remapped references. The destination floor keeps its id, name, height, elevation, and ground designation. `main.js` also autosaves to `localStorage` (key `house-cad:autosave:v1`) on every change and restores on startup, seeding a demo house only on a truly empty first run.

### Plan sheets (printing / SVG export)

`src/io/planSheet.js` renders a **to-scale floor-plan sheet, one per floor**, from the model
(recomputed, never stored — like the mesh). One set of draw calls feeds SVG and canvas backends, so
desktop Print/Download and the in-AR preview cannot diverge. Layout is in page millimeters;
annotations remain fixed paper sizes while geometry follows the selected ratio.
All sheet output is monochrome; dash patterns and line weights distinguish structural dimensions,
marker pins, and electrical routes without relying on color. AR interaction overlays remain colored.
`sharedScaleSheetOptions()` chooses orientation from authored geometry, fits geometry plus annotations,
and rounds the ratio denominator upward (`1:56.7` → `1:57`). It shares scale, orientation, origin, and
generation time across Print, SVG, and AR previews so pages can be superposed. Sheets include the
footprint, structural and marker-pin dimensions, dotted electrical routes, fixture stacks, semantic
door/window/stairs/cabinet symbols and legends, timestamp, and scale bar. FURNITURE defaults to
hidden; AR's device-local output profile can show it in SVG/DXF. Constraints involving furniture
remain stored and solved but are always excluded from output. Furniture also does not reduce connected-room area; other subtract kinds
still do. Vertical marker stacks require strictly identical plan `x` and `y`; horizontal fixtures
require exactly equal heights and group through connected 80 mm-inclusive plan neighbors. Markers connected by 80 mm-inclusive full-3D neighbor
links share a white box—horizontal with one height
when level, vertical with per-glyph heights otherwise. Clustering is transitive, so 117→109→101 cm
is one box even though the endpoints are 16 cm apart.
Stack callouts test all four sides against the printable footprint and prefer the placement inside
the room, falling back to page fit when no containing-room direction exists.
The height chip of an isolated marker constrained at distance zero to a real edge uses that same
room-aware four-side placement; unconstrained isolated markers keep the chip below the glyph.
Whole-number dimension labels omit an all-zero fractional part, and displayed zero dimensions are
omitted. Marker heights use the same compact formatting. Distinct fixture height-group boxes always
form a vertical column ordered high-to-low, regardless of which room side receives the callout.
Desktop Print creates one page per floor; print at 100% for true scale. Full AR details are in
`docs/ar-survey.md`.

### Change map (revision clouds vs a saved slot)

`src/core/planDiff.js` diffs a **baseline snapshot** (a saved slot's serialized project) against the
live project so a revised sheet shows a contractor what changed. Everything is matched by **stable id**
(rectangles, markers, constraints all keep ids across revisions of one lineage), never geometrically,
and compares **solved** geometry — `diffAgainstSnapshot()` deserializes the baseline into a throwaway
`Project` (which solves on load via `_emit`) and returns `Map<floorId, floorDiff>` classifying zones
(added/removed/moved/resized/retyped), markers (added/removed/moved/retyped), and structural dimensions
(added/removed/value-changed) with a 1 mm tolerance. It is pure model data — labels/units/numbering are
composed by the sheet.
`planSheet.js` draws it (`drawChangeMap`, gated by `opts.changeMap` = that `Map`): monochrome revision
clouds (scalloped, sampled as line segments since the backends have no arc) + numbered revision-triangle
tags + a keyed `REV — CHANGES` legend, drawn over the sheet but under the strip. Because all sheet
outputs funnel through `renderFloor`, the same overlay appears in desktop Print/SVG/PNG **and** the AR
preview/export. Change maps are **sheet-only** — DXF/Coohom/JSON never carry them. Baseline = one of the
6 AR save slots (`house-cad:slot:i`); desktop reads them via the Print popup's "Change map vs" picker,
AR via the EXPORT `COMPARE` row (see `docs/ar-survey.md`). `localStorage` is per-device, so the baseline
only lists slots saved in that same browser.

### DXF export

`src/io/dxf.js` exports the active floor as ASCII AutoCAD 2000 DXF (`AC1015`) for CAD/floor-plan
importers such as Coohom. It is model-space CAD, not a paper sheet: one meter becomes 1000 DXF
units and `$INSUNITS=4` declares millimeters. Separate layers retain `FOOTPRINT`, enabled semantic
zone kinds, enabled structural and marker-pin dimensions/markers, room areas, true 3D
`ELECTRICAL_ROUTE` switch legs, the `CONDUIT` network, per-surface routed wires
(`ELECTRICAL_ROUTE_WALL`/`_CEILING`/`_FLOOR`), and `ORIGIN`.
The toolbar Print menu's **Download DXF (this floor)** mirrors the active-floor SVG action. In AR,
**PROJECT · EXPORT** always targets the active LEVEL floor. Right thumbstick up/down switches SVG/DXF;
a ray-picked panel toggles plan dims, marker dims, marker icons, furniture, and room area, plus a
`COMPARE` row that cycles the change-map baseline (none → each saved slot) — flick the thumbstick while
pointing at that row, or tap it — while a separate EXPORT button downloads. The layer profile persists
locally (`house-cad:output:v1`), outside project saves; the baseline selection is session-only. The
optional left-controller preview updates immediately, including the change-map clouds.

## Conventions

- Coordinate mapping: plan `(x, y)` → world `(x, up, y)`. In `extrude.js` the shape is built in Three's XY plane, extruded along +Z, then rotated so height points up +Y.
- 2D canvas uses CSS-pixel coordinates (DPR handled once via `ctx.setTransform`); world↔screen go through `toWorld`/`toScreen`.
- `Rectangle` stores raw `x,y,w,h`; use its `bounds` getter for normalized min/max (handles rectangles drawn right-to-left).

## Deployment

Static Vite app → GitHub Pages. `vite.config.js` uses a relative `base` for production builds so it works under any repo subpath. `.github/workflows/deploy.yml` builds and deploys on push to `main` (enable Pages → Source: GitHub Actions). HTTPS from Pages is also what the planned Quest 3 / WebXR phase needs.

## Git workflow

Commit and push **directly on `main`** — do **not** create feature branches. (Still only commit/push when the user asks.) Because pushing `main` triggers the Pages deploy above, **every push publishes** — call that out when relevant.
