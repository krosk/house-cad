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

The whole app is a one-way pipeline driven by a change bus. `Project` (in `src/core/model.js`) holds `rectangles`, `constraints`, `markers`, per-floor `electricalLinks`, and `height`, and exposes `onChange(fn)`. **Every mutation calls `Project._emit()`, which runs the constraint solver *first*, then notifies listeners** — so every view (`Sketch2D`, `View3D`, the panels) always sees fully-resolved geometry. When mutating a rectangle's fields in place, call `project.touch()` to trigger this cycle.

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

### Persistence

`src/io/serialize.js` serializes the parametric definition (rectangles + constraints + markers + electrical links + height) to JSON; the footprint/mesh is always recomputed, never stored. Missing `electricalLinks` default to `[]`, so older saves remain compatible. On load, the id counters advance past loaded ids so new items don't collide. Floor copy/paste also lives here: a copied floor persists separately in `localStorage` (`house-cad:floor-clipboard:v1`), and paste replaces the selected floor's authored plan with collision-free rectangle/constraint/marker/link ids plus remapped references. The destination floor keeps its id, name, height, elevation, and ground designation. `main.js` also autosaves to `localStorage` (key `house-cad:autosave:v1`) on every change and restores on startup, seeding a demo house only on a truly empty first run.

### Plan sheets (printing / SVG export)

`src/io/planSheet.js` renders a **to-scale floor-plan sheet, one per floor**, from the model
(recomputed, never stored — like the mesh). One set of draw calls feeds SVG and canvas backends, so
desktop Print/Download and the in-AR preview cannot diverge. Layout is in page millimeters;
annotations remain fixed paper sizes while geometry follows the selected ratio.
`sharedScaleSheetOptions()` chooses orientation from authored geometry, fits geometry plus annotations,
and rounds the ratio denominator upward (`1:56.7` → `1:57`). It shares scale, orientation, origin, and
generation time across Print, SVG, and AR previews so pages can be superposed. Sheets include the
footprint, structural and marker-pin dimensions, dotted electrical routes, fixture stacks, semantic
door/window/stairs/cabinet symbols and legends, timestamp, and scale bar. FURNITURE defaults to
hidden; AR's device-local output profile can show it in SVG/DXF. Constraints involving furniture
remain stored and solved but are always excluded from output. Furniture also does not reduce connected-room area; other subtract kinds
still do. Markers within 80 mm inclusive in plan use a bracketed callout; markers also within 80 mm in full 3D
share a white box—horizontal with one height when level, vertical with per-glyph heights otherwise.
Whole-number dimension labels omit an all-zero fractional part, and displayed zero dimensions are
omitted. Desktop Print creates one page per floor; print at 100% for true scale. Full AR details are in
`docs/ar-survey.md`.

### DXF export

`src/io/dxf.js` exports the active floor as ASCII AutoCAD 2000 DXF (`AC1015`) for CAD/floor-plan
importers such as Coohom. It is model-space CAD, not a paper sheet: one meter becomes 1000 DXF
units and `$INSUNITS=4` declares millimeters. Separate layers retain `FOOTPRINT`, enabled semantic
zone kinds, enabled structural and marker-pin dimensions/markers, room areas, true 3D
`ELECTRICAL_ROUTE` switch legs, and `ORIGIN`.
The toolbar Print menu's **Download DXF (this floor)** mirrors the active-floor SVG action. In AR,
**PROJECT · EXPORT** always targets the active LEVEL floor. Right thumbstick up/down switches SVG/DXF;
a ray-picked panel toggles plan dims, marker dims, marker icons, and furniture, while a separate
EXPORT button downloads. The profile persists locally (`house-cad:output:v1`), outside project saves,
and the optional left-controller preview updates immediately.

## Conventions

- Coordinate mapping: plan `(x, y)` → world `(x, up, y)`. In `extrude.js` the shape is built in Three's XY plane, extruded along +Z, then rotated so height points up +Y.
- 2D canvas uses CSS-pixel coordinates (DPR handled once via `ctx.setTransform`); world↔screen go through `toWorld`/`toScreen`.
- `Rectangle` stores raw `x,y,w,h`; use its `bounds` getter for normalized min/max (handles rectangles drawn right-to-left).

## Deployment

Static Vite app → GitHub Pages. `vite.config.js` uses a relative `base` for production builds so it works under any repo subpath. `.github/workflows/deploy.yml` builds and deploys on push to `main` (enable Pages → Source: GitHub Actions). HTTPS from Pages is also what the planned Quest 3 / WebXR phase needs.

## Git workflow

Commit and push **directly on `main`** — do **not** create feature branches. (Still only commit/push when the user asks.) Because pushing `main` triggers the Pages deploy above, **every push publishes** — call that out when relevant.
