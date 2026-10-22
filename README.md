# House CAD

A parametric 2.5D CAD tool for surveying and planning a house, on a desktop, a phone or a Meta Quest
in mixed reality. You draw axis-aligned zones in a 2D plan per floor, pin **dimensions** between their
edges, and the 3D house updates live: walls, openings, stairs, finishes, furniture, electrics, pipes
and heat loss.

Vanilla JS + Vite + Three.js, no framework. Static site on GitHub Pages; WebXR for the Quest.

## Concept

Because the vertical needs little detail, each floor is a **plan + heights**. Every zone edge is
axis-aligned, so each edge is one number and the dimension problem **decouples into two independent
1-D systems** (all x's, all y's), each a small weighted least-squares solve. A dimension is the only
way to set an exact size; dragging is for rough placement.

## Features

- **Plan** (desktop): add and subtract zones of 22 kinds (rooms, walls, insulation, doors, windows,
  sliding doors, recesses, half walls, stairs, ramps, beams, ceiling boxing, heaters, furniture, fences…),
  dimensions with conflict detection that names the suspects, several floors and split levels,
  floor copy/paste, m / cm / mm, English, French and Chinese.
- **View 3D**: the 3D plan, the architectural model, an overview and a walk-through POV; a ruler that
  snaps to walls; doors you tap open or shut; show/hide for conduits, pipes, beams, half walls, floors
  and ceilings; lighting, reflections and a Realistic mode with sun and sky.
- **AR survey on the Quest**: register the plan on the real room, draw and dimension zones with the
  controller, place devices, conduits, wires and pipes, pick products and finishes, compute heat loss,
  save to slots and export.
- **Products and finishes**: door, window, switch and outlet products, IKEA and procedural furniture,
  kitchen units, procedural floor and wall finishes with quantity takeoff.
- **Building services**: the electrical network (conduits, wires, circuits and checks), pipes by
  service (water, heating, refrigerant, VMC, waste) with fittings, anchors and beam clashes, VMC air
  flow, and per-room heat loss (simplified EN 12831) with a heat map.
- **Output**: JSON save/load with autosave, view-only share links and QR codes, to-scale plan sheets
  (Print/PDF, SVG, PNG pipe sheet), DXF and Coohom DXF, revision clouds against a saved slot,
  STL / OBJ / GLB meshes.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Node's built-in runner, test/*.test.js)
npm run build    # production build to dist/
```

## Deploy

Pushing to `main` runs the tests, builds, and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (Settings → Pages → Source: GitHub
Actions). The Quest app is the site packaged as a sideloaded, offline AR APK: [`packaging/quest-apk.md`](packaging/quest-apk.md).

## Project layout

| Path | Purpose |
| --- | --- |
| `src/core/` | The model (`model.js`), constraint solver (`constraints.js`), architectural 3D interpretation, electrical, pipes, beams, heat loss, materials: pure, Node-testable |
| `src/io/` | Save/load, share links, plan sheets, DXF, mesh export |
| `src/ui/` | 2D sketch, View 3D, the AR mode (`mr.js`), products, textures (painted in a worker) |
| `src/main.js` | App wiring |
| `test/` | Unit tests on small synthetic houses |
| `tools/` | Node tools for a saved house and the headset (`docs/headset-data.md`) |
| `docs/` | Design documents and owner decisions |

Working rules and architecture for contributors and agents: [`CLAUDE.md`](CLAUDE.md).
