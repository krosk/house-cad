# House CAD

A parametric 2.5D CAD tool for house massing. Draw axis-aligned rectangles in a
2D plan, tag each as **add** or **subtract** matter, pin **dimensions** between
edges, and see the extruded 3D model update live.

## Concept

Because the vertical needs little detail, the model is treated as **plan +
height**: rectangles are combined with polygon booleans into a footprint, which
is extruded to a wall height. Since every rectangle edge is axis-aligned, the
parametric constraint problem **decouples into independent X and Y 1-D systems**,
each solved as a small weighted least-squares problem — no general geometric
solver required.

## Features

- 2D sketch: draw add/subtract rectangles, pan/zoom, grid snapping
- Live 3D extrusion (Three.js, orbit controls)
- Parametric **dimensions**: pin the distance between any two same-axis edges and
  edit the value; conflicts are detected and highlighted
- Four ways to size a rectangle (inline chips, resize handles, properties panel,
  dimensions) — all reconciled by the solver
- Selectable display units (m / cm / mm); geometry stored internally in meters
- Save / load projects as JSON, plus localStorage autosave

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
```

## Deploy

Pushing to `main` auto-deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Enable it under
**Settings → Pages → Source: GitHub Actions**.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/core/model.js` | Project / Rectangle data model + change bus |
| `src/core/constraints.js` | Per-axis weighted least-squares constraint solver |
| `src/core/geometry2d.js` | Add/subtract rectangles → footprint (polygon booleans) |
| `src/core/extrude.js` | Footprint → 3D mesh |
| `src/core/units.js` | Display-unit conversion (m/cm/mm) |
| `src/io/serialize.js` | Save/load JSON |
| `src/ui/sketch2d.js` | 2D plan editor (canvas) |
| `src/ui/view3d.js` | 3D viewport (Three.js) |
| `src/main.js` | App wiring |
