# House CAD — session handoff

**This is the "how do I resume" doc.** Project overview also lives in `CLAUDE.md` (committed) and
in Claude memory (`house-cad-project.md`).

**Date:** 2026-09-09 (session 1)
**Status:** Phases 1–3a done and deployed live. Next up: mesh export (Phase 3b).

## Where things stand in one paragraph

A parametric 2.5D house CAD tool (vanilla JS + Vite + Three.js), fully working and **deployed live at
https://krosk.github.io/house-cad/**. You draw axis-aligned add/subtract rectangles in a 2D plan,
pin **dimension constraints** between edges (the only way to author exact size — deliberate), and see
a live 3D extrusion. A per-axis weighted least-squares solver resolves constraints on every change.
Save/load JSON + localStorage autosave work. Everything is committed and pushed to `main`. **Current
goal: continue the roadmap — the next planned piece is mesh export (STL/OBJ/glTF).** Read `CLAUDE.md`
before planning any change; it has the architecture and the critical Node-via-fnm trap.

## Standing decisions

- **Node runs via `fnm`, not on PATH.** Prepend the install dir in every shell before npm/node, or
  it fails "command not found":
  `$env:Path = "C:\Users\ahe\AppData\Roaming\fnm\node-versions\v22.22.2\installation;" + $env:Path`
- **`npm run build` is the only verification** — no tests, linter, or type checker. Clean build =
  imports/syntax sound; it does NOT catch runtime/visual bugs.
- **Sizing is constraint-first.** Direct rectangle size display/editing was intentionally removed
  (no on-canvas W/H chips, no inline editor, no W/H fields in the properties panel). Do NOT re-add
  these. Rough sizing = drawing + 8 resize handles; exact size = dimension constraints only.
- **Geometry stored in meters** internally; `units.js` converts only display/input (m/cm/mm).
- **Distance constraints are ordered + signed** (`value = coord(b) − coord(a)`); order sets sign,
  locks the side, and picks the anchor (`a` holds, `b` moves). `swapConstraint()` reverses it.
- **Commit identity is `Alexis He <ahe.krosk@gmail.com>`** for this repo (personal, not work email).
  Repo is **public**, so that email is visible on commits.
- **Deploy is automatic** on push to `main` via `.github/workflows/deploy.yml`. Pages source must
  stay set to **GitHub Actions** (Settings → Pages).

## Findings / traps worth knowing

- **`vite build` via PowerShell prints a spurious `node.exe : … NativeCommandError` line** — that's
  PowerShell wrapping Vite's stderr chunk-size note, NOT a failure. Trust the `✓ built in …` line.
- **Pages deploy failed once** because Pages source wasn't set to "GitHub Actions" — the `build` job
  passes but `actions/deploy-pages@v4` fails. Fixed by setting the source; now works.
- **Claude cannot click through the UI** — changes are verified by build only. Visual QA has been the
  user's; the app is confirmed working by them (draw, constrain, 3D, save/load, units, deploy).
- `.claude/skills/`, `.claude/rules/`, and `.claude/handoff.md` are **tracked** in git; only
  `.claude/.env` and `.claude/.teams_request` stay ignored (see `.gitignore`).

## Commits

Substantive (feature) commits, pushed to `origin/main`; doc/config-only commits omitted
(`git log` has them):

- `3cf49de` Constraint-first sizing, dimension swap, and CLAUDE.md
- `c3f7bdc` House CAD: parametric 2.5D house modeling tool

## Resuming from a clean checkout

```bash
# Node is via fnm — prepend to PATH first (PowerShell):
$env:Path = "C:\Users\ahe\AppData\Roaming\fnm\node-versions\v22.22.2\installation;" + $env:Path
npm install        # node_modules is gitignored
npm run dev        # dev server: http://localhost:5173  (HMR)
npm run build      # verification step (no test suite)
```

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/core/model.js` | Project/Rectangle model + change bus (`_emit` runs solve, then notifies) |
| `src/core/constraints.js` | Per-axis weighted least-squares constraint solver |
| `src/core/geometry2d.js` | add/subtract rectangles → footprint (polygon booleans) |
| `src/core/extrude.js` | footprint → 3D mesh (plan-Y → world-Z, extrude up +Y) |
| `src/core/units.js` | display-unit conversion (m/cm/mm) |
| `src/io/serialize.js` | JSON save/load + validation + id-counter sync |
| `src/ui/sketch2d.js` | 2D plan editor (canvas): tools, dimensions, resize handles |
| `src/ui/view3d.js` | 3D viewport (Three.js, orbit) |
| `src/main.js` | wiring: toolbar, panels, save/load, autosave, units, splitter |
| `.github/workflows/deploy.yml` | build + deploy to Pages on push to main |

## Next step

- **A. Mesh export (STL / OBJ / glTF)** — the planned Phase 3b. Three.js ships `STLExporter`,
  `OBJExporter`, `GLTFExporter` in `examples/jsm/exporters/`. Add export buttons that run the current
  extruded `BufferGeometry` through them and download. Clear, self-contained, next.
- **B. Dimensioned floor-plan export** — the other half of Phase 3 (SVG/PDF plan with dimension
  lines). More design work than A.
- **C. Phase 4 — rich constraints** (equal, aligned, chained). Solver already supports the linear
  form; this is mostly UI + constraint types.
- **D. Phase 5 — WebXR / Quest 3** room mapping (the original stretch goal; HTTPS from Pages is ready).
- **E. Tiny: remove the draw-time `W × H` readout** — offered earlier, user hasn't decided. Only the
  transient readout while dragging a NEW rectangle remains; kept as creation feedback.

## Known open questions

- Extrusion orientation and general visual correctness are confirmed **by the user's use**, not by
  any automated check — no regression guard exists.
- Whether to keep the transient draw-time `W × H` readout (item E) is undecided.
