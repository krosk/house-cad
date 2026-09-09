# House CAD — session handoff

**This is the "how do I resume" doc.** Project overview also lives in `CLAUDE.md` (committed) and
in Claude memory (`house-cad-project.md`, `serve-and-share-network-url.md`).

**Date:** 2026-09-09 (session 2)
**Status:** Phases 1–3a live and deployed; Phase 3b (mesh export) done this session, plus touch/Quest
input, dimension-display work, and a mobile toolbar fix. **4 commits sit on `main` UNPUSHED** — pushing
auto-deploys them. Next planned piece: dimensioned floor-plan export (Phase 3b other half) or Phase 4.

## Where things stand in one paragraph

A parametric 2.5D house CAD tool (vanilla JS + Vite + Three.js), deployed live at
**https://krosk.github.io/house-cad/**. You draw axis-aligned add/subtract rectangles in a 2D plan,
pin **dimension constraints** between edges (the only way to author exact size — deliberate), and see
a live 3D extrusion resolved by a per-axis weighted least-squares solver. Save/load JSON + localStorage
autosave work. This session added: **mesh export** (STL/OBJ/glTF), **touch + Quest 3 controller input**,
**draggable dimension placement**, an **extension-line fix**, and a **wrapping toolbar** for phones.
Read `CLAUDE.md` before planning any change.

## This session's work (all committed to `main`, NOT pushed)

- `995e6b6` **Mesh export + touch/controller-friendly input**
  - `src/io/exportMesh.js`: wraps the live extruded geometry in a Mesh → Three's STL/OBJ/glTF
    exporters → download. Toolbar "⬇ Export ▾" dropdown (STL/OBJ/GLB).
  - Touch/Quest: `touch-action:none` on the canvas (the key fix — the browser was eating one-finger
    drags as scroll); two-finger pan + pinch-zoom; a **✋ Pan tool** and on-screen **± zoom buttons**
    for single-pointer devices (Quest controller ray); fatter hit targets for coarse pointers.
- `8153a42` **Fix dimension extension lines to reach each shape's edge** — each dashed extension line
  now anchors to its own edge instead of the shared max, so shorter/narrower shapes no longer get a
  floating gap.
- `21b543a` **Draggable dimension placement** — drag a dimension label (Select tool) to reposition it;
  signed perpendicular **offset stored in meters** (model-space, zooms with the drawing); drag past the
  shape flips the side; double-click resets to auto; plain click still focuses the value field. Offset
  persists in JSON, defaults to auto for old files. Only auto dims consume stacking tiers.
- `20df57a` **Wrap the toolbar on narrow screens** — `flex-wrap` + a `<=640px` media query so phone
  toolbars don't overflow and get clipped by `#app { overflow:hidden }`.

## Standing decisions

- **This machine (session 2) is Linux (Steam Deck), Node v20.20.2 on PATH** — `npm install/dev/build`
  run directly, no fnm dance. The fnm/Node-22 PATH trap below is **Windows-only** (session 1's machine).
- **`npm run build` is the only verification** — no tests/linter/types. Clean build = imports/syntax
  sound; it does NOT catch runtime/visual bugs. Canvas rendering and touch/controller feel need the
  user's eyes/hands — say so when reporting.
- **Keep the dev server running and report the Network URL** (`➜ Network:` line, e.g.
  `http://192.168.1.154:5173/`) — the user QAs from another device on the LAN. (memory:
  `serve-and-share-network-url`.)
- **Sizing is constraint-first.** No on-canvas W/H chips, no inline size editor, no W/H fields in the
  properties panel. Do NOT re-add these. Rough size = drawing + 8 handles; exact size = dimensions only.
- **Geometry stored in meters**; `units.js` converts only display/input. Dimension `offset` is also
  meters (model-space), consistent with this rule.
- **Distance constraints are ordered + signed** (`value = coord(b) − coord(a)`); order sets sign, locks
  the side, picks the anchor (`a` holds, `b` moves). `swapConstraint()` reverses it.
- **Commit identity is `Alexis He <ahe.krosk@gmail.com>`** (personal, not work email). Repo is
  **public**, so that email is visible on commits.
- **Deploy is automatic** on push to `main` via `.github/workflows/deploy.yml`. Pages source must stay
  **GitHub Actions**.

### The Windows fnm trap (session 1's machine only)

`$env:Path = "C:\Users\ahe\AppData\Roaming\fnm\node-versions\v22.22.2\installation;" + $env:Path`
before any npm/node in PowerShell, or "command not found". Not relevant on the Linux machine.

## Findings / traps worth knowing

- **`GLTFExporter` fails in Node** (`FileReader is not defined`) but works in the browser — `FileReader`
  is a browser API it uses for binary output. STL/OBJ export fine headlessly; GLB verified only by the
  browser being the target. Don't "fix" this in Node.
- **`.claude/` is gitignored** → this doc and any handoff/quest-connect skills are local-only, not pushed.
- Pushing `main` auto-deploys; the user has been doing on-device QA (touch/Quest/phone) **before**
  pushing, so don't push without asking.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/core/model.js` | Project/Rectangle model + change bus; `setConstraintOffset()` (new) |
| `src/core/constraints.js` | Per-axis weighted least-squares solver; `makeDistance` now seeds `offset:null` |
| `src/core/geometry2d.js` | add/subtract rectangles → footprint (polygon booleans) |
| `src/core/extrude.js` | footprint → 3D mesh (plan-Y → world-Z, extrude up +Y) |
| `src/core/units.js` | display-unit conversion (m/cm/mm) |
| `src/io/serialize.js` | JSON save/load; now persists dimension `offset` |
| `src/io/exportMesh.js` | **(new)** STL/OBJ/glTF export of the live geometry |
| `src/ui/sketch2d.js` | 2D plan editor: tools, dimensions (draggable), multi-touch, pan tool, resize |
| `src/ui/view3d.js` | 3D viewport (Three.js, orbit — already touch-capable) |
| `src/main.js` | wiring: toolbar, panels, save/load, export menu, zoom buttons, autosave, units |
| `.github/workflows/deploy.yml` | build + deploy to Pages on push to main |

## Next step

- **Push** the 4 pending commits once device QA is done (auto-deploys).
- **Dimensioned floor-plan export** (SVG/PDF plan with dimension lines) — the other half of Phase 3.
- **Phase 4 — rich constraints** (equal, aligned, chained). Solver already supports the linear form;
  mostly UI + constraint types.
- **Phase 5 — WebXR / Quest 3** room mapping (HTTPS from Pages is ready). The touch/controller input
  this session is a stepping stone.
- **Follow-ups if the user hits them:** overflow "⋯" menu for the toolbar on very small screens; a
  bigger grab affordance / snap-to-nearest-edge for imprecise Quest-controller edge picking.

## Known open questions

- Extrusion orientation and general visual correctness are confirmed **by the user's use**, not by any
  automated check — no regression guard exists.
- Touch/Quest feel (pinch-zoom, controller trigger-drag, dimension-drag) is confirmed by the user on
  device, not by any headless test.
