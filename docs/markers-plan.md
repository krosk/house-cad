# Vertical elements (markers) — plan & handoff

**Read this, then `docs/ar-survey.md` (how the AR tool is built) and `CLAUDE.md` (core
architecture).** This is the design + resume doc for adding **vertical elements** to the survey
tool. Nothing here is built yet — this captures the decided design so a fresh session can start.

**Date:** 2026-09-11 (design session; updated through session 13)
**Status:** OUTLET SHIPPED. Category-1 markers (outlets) are built end-to-end (s12) and since split
into disjoint plan/outlet editing + dimensioning domains with projected floor icons (s13). Remaining
per this doc: switch/ethernet/light + type picker, then wires; openings (category 2) still deferred.
See `.claude/handoff.md` → Next step B/C and `docs/ar-survey.md` for the current build. The design
rationale below still governs; treat "we build first / not started" phrasing as historical.

## Goal in one paragraph

Add **vertical elements** to the house survey: power outlets, switches, lights, wires — and
eventually windows/doors. The current model is deliberately **2.5D** (plan + one extrusion height;
the constraint solver decouples into two independent 1-D systems, X and Y — see `CLAUDE.md`). Every
vertical element introduces a **height-along-the-wall** axis the model has never represented. The
agreed strategy is to add them in a **parallel lane that does NOT touch the massing / boolean /
solver pipeline** — not to make the solver 3-D.

## The one decision that governs everything: two categories, not one

The four examples split into two fundamentally different things. **Do not build them as one
feature.**

1. **Wall-anchored MARKERS — outlets, switches, lights, wires.** These are *survey annotations*,
   not massing. They do not cut geometry, do not participate in booleans, do not need the solver.
   **This is what we build first**, and it is where AR is uniquely strong: you walk to the wall,
   point the tip at the real fixture, and trigger — a better capture than any 2D tool.
2. **OPENINGS — windows, doors.** A real architectural extension, **deferred to a separate effort**
   (see Next step C). An opening has extent (width + sill + head height) and *modifies the wall
   solid* — but walls here are the sides of an extruded footprint polygon, not per-wall faces.
   Cutting one means either post-processing the extruded geometry per wall-face or abandoning
   single-height extrusion. That genuinely fights the architecture; it needs its own design pass.

## Agreed design for markers (category 1)

### Data model
- A new **parallel array on `Floor`** (like `rectangles`), e.g. `markers`. NOT part of
  `computeFootprint` / `extrudeFootprint`.
- A marker is roughly `{ id, type, x, y, z }`:
  - `type`: `outlet` | `switch` | `light` | `wire` (extend later).
  - `x, y`: **plan coordinates** (meters, same frame as rectangles — relative to the registered
    origin), so it lives in the same space as everything else and survives RECAL/anchor drift.
  - `z`: **height above the floor** (meters). This is the new third scalar. Enter it numerically
    (reuse the SIZE numpad) or capture it from the tip height at drop time.
- **Wires** are a polyline: an ordered list of points (each a marker-like `{x,y,z}`), drawn as a
  connected line between fixtures. Model as its own type carrying a `points[]`.
- `z` is an **independent scalar** — keep the constraint solver 2-axis. If constrained placement is
  ever wanted, add a trivial 1-D pin later; do NOT fold z into the X/Y solver.

### Rendering (in `src/ui/mr.js`)
- Draw markers as **glyph sprites** at world `(x, overlayY() + z, y)` — reuse `planToWorld` for
  x/z and add `z` to `overlayY()` (which already gives `planPos.y + activeElevation()`), so markers
  ride the active floor's elevation exactly like the overlay. See `docs/ar-survey.md` →
  Coordinate mapping.
- Reuse the existing sprite/badge helpers (`makeBadge`, the label/CanvasTexture pattern) for
  per-type glyphs; keep them on `renderOrder` above the floor overlays, `frustumCulled=false` if
  their vertices are rewritten per frame (see the edge-highlight trap in `docs/ar-survey.md`).
- Wires: a `THREE.Line` through the polyline points in world space.
- **`mr.js` does NOT subscribe to `project.onChange`** — it rebuilds overlays manually via
  `buildPlan()` / `applyPlanMatrix()`. Any marker add/delete/edit must call the rebuild itself
  (durable trap, see `docs/ar-survey.md`).

### AR capture (new mode(s))
- Add to the `modes` DATA array (each entry now = `{ id, color, onTouch }`; **label + help come
  from i18n** keyed by id — `t('mode.'+id)` / `t('help.'+id)`, see `src/core/i18n.js`). Because
  the owner chose full localization, **every new mode/label/help string must be added to i18n.js
  in EN + FR + ZH** — English-only text will now stick out.
- Capture: aim/stand, `tipPosition()` → `worldToPlan()` for `(x,y)`, tip height above floor for a
  first-guess `z`; trigger drops the marker. A type picker (thumbstick or B/Y cycles the marker
  type, like LEVEL cycles floors) or a per-type mode.
- Deleting: mirror EDIT's grip-delete (the only grip-delete pattern) or a dedicated pick+grip.

### Persistence
- Extend `src/io/serialize.js` (`serializeProject` / `deserializeInto`) to round-trip `markers`
  per floor. The footprint/mesh is always recomputed and never stored — markers are authored data,
  so they DO get stored, alongside rectangles + constraints + height.
- Bump nothing in the model that recomputes; markers are pure data. Advance any id counter on load
  the way `syncRectIdCounter` does, if markers carry ids.

## Findings / traps worth knowing (from the AR tool, apply here)
- **Meters internal, everywhere.** `z` is meters like all geometry; only `units.js` converts for
  display/entry.
- **`overlayY()` already encodes the floor elevation** — add `z` to it, don't recompute elevation.
- **The solver can emit negative w/h** for rectangles; irrelevant to markers (points), but if a
  marker ever references an edge, read normalized `bounds`, not raw x/w.
- **No web console in the release TWA.** Debug capture via the plain Quest Browser (`?ar=1`) or
  Oculus Remote Web Inspector. `rlog` only works on the dev server.
- **`npm run build` is the only automated check** and does NOT catch runtime/XR bugs.

## The artifacts and what each is for
| Path | Role for this effort |
|---|---|
| `src/core/model.js` | Add `markers` to `Floor`; facade + any per-floor recompute. Do NOT route through footprint/extrude. |
| `src/ui/mr.js` | New capture mode(s), glyph rendering, delete, type picker. The whole AR surface. |
| `src/core/i18n.js` | Add EN/FR/ZH for every new mode label + help + any marker-type name. |
| `src/io/serialize.js` | Round-trip `markers` per floor. |
| `docs/ar-survey.md` | How modes/HUD/coordinate-mapping/rebuild work — read before editing `mr.js`. |

## Next step
- **A — On-device QA FIRST (owed since session 5; unchanged).** The entire session 8→11 AR
  workflow + the new i18n/LANG mode are **build-verified only, never walked on the Quest.** Adding
  a marker-capture surface stacks *more* unverified surface on an unverified base. Do at least a
  rough REGISTER→ROOM→EDGE→SIZE→LEVEL→LANG pass on device before/while building markers, so two
  unknowns aren't debugged at once. See `.claude/handoff.md` → Next step A.
- **B — Markers vertical slice (the actual work).** Build ONE type (outlet) end-to-end: model
  array → capture mode → glyph render at `(x, overlayY()+z, y)` → serialize round-trip. Then add
  switch/light (glyph + type picker), then wires (polyline). Ship increments.
- **C — Openings (windows/doors): DEFERRED, separate effort.** Needs its own design pass on
  whether to give up single-extrusion or do face-level cuts. Not part of the markers slice —
  keep it out so the markers lane stays clean.

## Known open questions
- **`z` capture accuracy** — is tip-height-above-floor good enough, or is numeric entry the primary
  path? Untested; decide on device (holding a controller at outlet height vs typing 0.3 m).
- **Type picker UX** — cycle types within one mode (B/Y, like LEVEL floors) vs one mode per type.
  Unresolved; lean on what feels right on device.
- **Wire authoring** — how to start/end a polyline and pick intermediate points in AR. Undesigned.
- **Desktop parity** — markers are AR-first, but the desktop 2D editor exists. Whether/how markers
  render/edit in 2D is open (memory `ar-2d-parity`). Not required for the AR slice.
- **Do markers belong to a floor or span floors?** Assumed per-floor (like rectangles). A wire
  running between storeys would break that — out of scope for the first slice.
