# Product intent: the Phase-5 on-site survey tool

Why the AR tool exists and the owner decisions that constrain it. Read this before planning
any AR, survey, multi-floor, or registration work. Mechanics live in `docs/ar-survey.md`;
live state in `.claude/handoff.md`.

## The goal

House CAD's Phase 5 is an **on-site surveying and drafting tool**. You stand in the real house
at **life size (1:1)** on a Quest 3 in passthrough mixed reality. You measure real walls with a
**physical tape measure** and type those **exact** numbers to author the plan in place. The
output is a real construction plan, so **accuracy is the point**. Rough drag-to-size or snap
sizing defeats the purpose.

Consequences:
- **Exact numeric entry is required** in XR, through a rendered 3D numpad rather than spatial
  gestures. This matches the core rule that exact size is authored only through dimension
  constraints (`CLAUDE.md`).
- The workflow is **"both in sequence"**: survey the real room to seed a rough plan, correct it
  with the tape, and keep the overlay visible to verify.
- The Quest is the target. WebXR AR works on Android/ARCore but not iOS, and this app's
  controller input wouldn't map to a phone.

## Survey method: guided manual survey, tape is the source of truth

- **Do not rely on Quest's native room scan (Space Setup).** It is per-room and clumsy for
  multi-room houses (owner experience). Plane and mesh detection are deliberately **not used**.
- Instead, the user walks the house and touches real surfaces with the controller tip (about
  cm-accurate) to seed geometry, and uses the tape for authoritative lengths.
- **Touch is a LOCAL instrument only.** Tracking drift accumulates over meters and minutes, so
  touches within one room in a quick pass are cm-accurate, but absolute cross-house positions
  are not. Touch supplies:
  1. wall **direction and topology** (which edge, how rooms connect; a tape is only a scalar);
  2. a **rough seed**, which becomes the solver's initial/stay value;
  3. **overlay registration**.
- **A tape length enters as a HARD constraint and overrides the touched magnitude**, so
  drift-skewed touches get size-corrected by the solve. Never chain touches across the house to
  derive an absolute distance.

## Drift strategy: RECAL plus tape, no anchors network

Drift is an **overlay-alignment problem, not a data problem**: the plan's numbers come from tape
dimensions, and drift only misaligns the overlay.

**Owner decision (2026-09-09): NO per-room anchors, NO reliance on room scan or plane
detection.** Drift correction is **RECAL** (manually re-zero against a known corner or control
point) plus tape-as-truth, and nothing more. A single origin anchor keeps the frame's
drift-corrected pose; that is the full extent of anchoring. Do not resurrect a "many local
anchors" design.

Platform facts behind this (researched; don't re-research):
- WebXR `unbounded` reference space is **not supported** by the Quest Browser, so there is no
  platform-provided house-wide stable frame. `local-floor` plus RECAL is the only path.
- Persistent anchors are capped at 8 per site (moot given the decision above).
- Depth API hit-testing works without a pre-scan (about 5 m range). Raw Camera Access (custom
  computer vision, e.g. ArUco) is research-grade and ruled out. Native WebXR image/marker
  tracking is only a draft spec and not confirmed on Quest.
- If RECAL proves insufficient, the low-tech fallback is **printed crosshair targets at known
  corners** that the user re-touches to re-zero, like a surveying control network. No computer
  vision needed.

## Data model: keep axis-aligned rectangles

**Owner decision (2026-09-09):** the survey snaps real walls to **axis-aligned add/subtract
rectangles**. Angled or non-orthogonal walls are forced square. The tool is 2.5D house massing,
so square approximation is the intended fidelity, and it keeps the whole pipeline untouched
(solver, booleans, extrude, export, JSON, desktop editor). **Do not** extend to rotated
rectangles or general polygons for Phase 5.

Survey semantics (owner): **`add` = room space** (interior free space); **`subtract` = wall**
(solid). Non-rectangular rooms are unions of axis-aligned free-space rectangles, authored by
pushing individual edges to real walls (edges are scalars, which fits the 2× 1-D solver).

## AR is the only authoring surface on the Quest

The immersive Quest APK launches straight into AR, and **exiting AR quits the app**. There is no
2D editor on the device. So every desktop capability is either something AR must replicate or a
conscious "not needed on site" decision. AR already exceeds the desktop in places (edge↔origin
position locks, grip-drag of edges and dimension labels, the vertical Z-dim visual).

Architectural insight: the plan already maps plan `(x, y)` → world `(x, up, y)`, so the 2D sketch
lives on the floor plane. Editing reuses the 2D model, hit-testing, and solver through a controller
ray; the editor is **not** rebuilt as a separate 3D system.

## Multi-floor design (owner decisions, 2026-09-10)

- Floors are **independent plans**: each has its own rectangles and constraints (not copied from
  below, no shared footprint).
- **Per-floor height**; each floor's elevation is **derived** by stacking heights off the ground
  datum.
- **All floors share one plan origin** (the surveyed corner), so storeys stack by construction and
  corners align.
- **MR registers once, on the ground floor** (shared origin + yaw). Each floor lifts the overlay
  to its own elevation, and **RECAL** corrects drift when walking between floors.
- Storey heights are **typed by hand**; the Quest cannot measure the vertical offset between
  storeys.
- **A floor has a storey height and a slab** (owner, 2026-10-04). `height` is floor to floor: the
  floors stack on it and stairs climb it. `slab` is the slab thickness above that floor's ceiling, so
  the room height is `ceilingHeight(floor)` = height − slab (`src/core/storey.js`). Walls, the 3D/AR
  ceiling, wall finishes and their takeoff, heat loss (wall area, volume), switch→light ceiling routes,
  ceiling conduit runs and a new light's default height use the ceiling. Set in AR LEVEL (SWAP on the
  numpad). Owner's house: Ground and Upper 2.70 rooms + 0.25 slab (2.95 storeys), Basement 2.05 room in
  a 2.27 storey (slab 0.22). Before the slab existed, the owner typed 2.95 as Ground's height to make
  the floors stack, and everything drew and counted to 2.95. Exports (STL/OBJ/GLB massing) still use
  the storey height.
- **A room can have its own lower ceiling and its own floor level** (owner, 2026-10-13). The ceiling:
  the veranda is on the ground floor's level, "it exits from the kitchen", under a 2.2 m roof in a
  2.70 m storey (a split level was the alternative, rejected because its floor is the ground floor's).
  The floor level: the Upper small room r95 is up a few steps (≈ 0.50 m, owner's estimate), and the
  Basement's rooms are "flat at different heights". Two optional ROOM fields, both in m from the
  **storey's floor**, like every other height (markers, sills, heads), so nothing stored moves:
  - `ceiling` only lowers (`roomCeiling` in `src/core/storey.js`; none, or one at or above the
    storey's, is the storey's);
  - `floorZ` is above (+) or below (−) the storey's floor (`roomFloorZ`); none = 0.
  A room's height is its ceiling − its floor level. The floors still stack on `height`. Used by:
  - View 3D / AR 3D: one floor slab per level, each reaching down under the lowest one so a step shows
    a solid face; one ceiling piece per ceiling; the walls (a wall piece whose every room or stair within
    the wall thickness + 1 cm is lower stops at the highest of their ceilings, a wall shared with a
    full-height room keeps the storey's; a wall from the floor goes down to the lowest neighbour's level);
    floor and wall finishes at their room's level; POV walks on the raised slab.
  - A flight between two room levels of its floor (`innerStairSpan` in `src/core/architectural3d.js`:
    the room just past its top end stands higher than the one past its other end): it climbs only
    their difference, in equal risers near 0.18 m, the last one up onto the higher floor, and it is
    floor, not a hole in the slab. Any other flight still climbs to the next floor.
  - Heat loss: a space's walls and volume take its highest room ceiling − its lowest floor level; a
    partition between two spaces the lower height. The 3D airflow box likewise.
  - A new AR light defaults to the ceiling over its point (`ceilingAt`).

  Editing: desktop room panel **Ceiling** and **Floor level** (empty = the storey's). AR PLAN · EDIT:
  a selected room opens the numpad with FLOOR UP, FLOOR DOWN (the pad has no minus key) and CEILING
  (SWAP cycles; an empty ENTER clears). Not yet: the AR flat plan and the plan sheets don't show levels,
  marker heights still read from the storey's floor, the airflow network's leak heights, the switch→light
  ceiling routes; a door's or window's sill and head are not moved to a room's level or clipped to its
  ceiling: type them (owner: "just like the head for the door, I would have to set the sill"; a DOOR,
  PASSAGE or SLIDING door now has a SILL on the band pad and the desktop takes it from the file: its
  opening, leaf and product start there, and the wall under it is the step's face). Hypothesis until seen in View 3D: two rooms of different ceilings touching
  with no wall between them leave a gap.
- **A split level** (owner, 2026-10-12): the garden is a floor at its own elevation, the earth level
  (−0.90 m, the HEAT LOSS earth setting), between the basement and the ground floor, and it does not
  stack. The garden has three levels: the main garden on that floor, the garage-door side at the
  basement's floor (a RAMP drawn on the garden slopes down to it) and the front entrance at the
  ground floor (a PLATFORM drawn on Ground, reached by stairs from the garden). Its gates are GATE
  zones, outdoor fixtures rather than doors in a wall, its low walls are GARDEN WALL zones, not
  indoor half walls, and a fence is its own FENCE zone (its own thickness and fence material),
  standing on a garden wall. Mechanics:
  `docs/ar-survey.md` "Multi-floor".
- `Project.rectangles/constraints/height` are **getters onto the active floor** (a facade), so
  consumers didn't need rewriting. Don't reintroduce raw fields.

Mechanics (LEVEL mode, ALL FLOORS view, the stacking gotcha) are in `docs/ar-survey.md`.

## Device setup requirement: disable Guardian

Walking a whole house needs Quest **Guardian / boundary disabled on the device**. Guardian prompts
at the start of every immersive session and roomscale caps the area. This is an **OS-level
limitation the app cannot bypass**: `unbounded` (the only spec-level escape) is unsupported, so
`local-floor` is correct and not the cause.

- Persistent fix (owner-confirmed working): disable Guardian in Quest **Developer settings**
  (requires Developer Mode). Survives reboots.
- Per-session alternative: `adb shell setprop debug.oculus.guardian_pause 1` (resets on reboot or
  re-center).
- Acceptable trade-off because passthrough keeps the real room visible. The app can't ship as
  "just works"; this belongs on the on-site setup checklist.

## How AR work gets built and verified

Agents cannot test XR at all. `npm run build` only proves the code compiles, so every AR
iteration is the owner walking it on the Quest. Build AR features in small, independently
walkable increments, and record what has actually been walked in `docs/ar-qa-checklist.md`.
