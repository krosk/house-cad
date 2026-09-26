# AR survey reference (`src/ui/mr.js`)

Stable operational detail for the Quest MR survey surface. This is the settled "how the
AR tool is put together" reference; the live "where are we / what next" doc is
`.claude/handoff.md`. Deep rationale (survey method, drift, multi-floor, AR-only surface, Guardian)
lives in `docs/product-intent.md`. Packaging is
`packaging/quest-apk.md`. Core (non-AR) architecture is `CLAUDE.md`.

AR (`src/ui/mr.js`) is the **only** authoring surface on the Quest — the immersive APK exits
AR by quitting, there is no 2D editor on-device — so it must reach parity with the desktop 2D
editor (`docs/product-intent.md`).

## Mode hierarchy (tools with stable `id`s)

```text
SETUP    · REGISTER → FLOOR → LEVEL → RECAL → TELEPORT
PLAN     · ADD → EDGE → DIMS → EDIT
MARKER   · EDIT → DIMS → LINK → CONDUIT → CONDUIT DIMS → CONDUIT EDIT → WIRE → CHECK → PIPE
FURNISH  · FURNISH
MATERIAL · FLOOR → WALL
PROJECT  · TRANSLATE → SAVE → LOAD → EXPORT → UNIT → LANG → PERF
```

The headset label and help header show the localized `GROUP · TOOL` breadcrumb. Controller
navigation remains one fast linear cycle across the rows above (thumbstick-x, both ways); group
presentation adds hierarchy without remapping any contextual buttons or thumbstick-y actions.
The single source of truth for order is `MODE_ORDER` (which sorts the `modes` array) and `MODE_GROUP`;
IDs in that traversal order are `register`, `floor`, `level`, `recal`, `teleport`, `drop`, `edge`,
`plan_dims`, `edit`, `marker`, `outlet_dims`, `marker_link`, `marker_conduit`, `conduit_dims`,
`conduit_edit`, `marker_wire`, `marker_pipe`, `furnish`, `copy_floor`, `paste_floor`, `move_up`, `move_down`,
`translate`, `save`, `load`, `export`, `unit`, `lang`. **`MODE_HIDDEN`** = `{copy_floor, paste_floor,
move_up, move_down}` — those four stay fully defined and functional (drivable programmatically) but
are removed from the thumbstick-x cycle to keep the list short, so they do **not** appear in the
diagram above. Un-hide by deleting an id from that set. **TRANSLATE now lives in the PROJECT group**
(not PLAN), and **FURNISH is its own group** (real GLB furniture placement).

Modes are DATA in the `modes` array (each has `id`, `color`, `onTouch`; the label + help text
come from i18n keyed by `id` — `t('mode.'+id)` / `t('help.'+id)`, see Localization below).
Per-frame mode visuals/highlights are the big if/else chain keyed on `modeId` near the end of
the animation loop. `setMode` resets in-progress gestures and activates/deactivates the numpad
(both DIMS modes + LEVEL) or slot menu (SAVE/LOAD). No code hardcodes a mode *index* beyond `setMode(0)`
(= ORIGIN at session start); everything else is keyed by `id` or `currentMode ± 1`.

- **FLOOR** — calibrate the shared ground datum `floorY` by touching the real floor of whichever
  storey is active. The active floor's derived elevation is subtracted from the touch, so an upper
  floor or basement calibrates the same datum without double-counting its vertical offset.
- **LEVEL** — per-storey height + floor switch (see Multi-floor below).
- **SETUP · TELEPORT** (`id: teleport`) — aim the pointer reticle at the active floor and trigger
  to bring that plan coordinate beneath the headset. WebXR cannot move the physical passthrough
  camera, so this applies a horizontal `navOffset` to the CAD frame while preserving the surveyed
  `planPos`, yaw, and XR anchor. ORIGIN/FLOOR/RECAL (`placeAt`) clear the navigation offset.
- **REGISTER** — 3-point derived origin corner. Touch P1,P2 along one wall (sets +X down it),
  then P3 on the perpendicular wall; origin = P3 projected onto the P1→P2 line, so the corner
  needn't be reachable. Tip steps WALL 1 → WALL 2 → PERP; grip undoes one point.
- **ADD** (`id: drop`) — one action: add a starter rectangle at the standing position.
  **Thumbstick up/down picks the kind** (`cycleZoneKind`, wraps over `ZONE_KINDS`): ROOM = add;
  everything else = subtract — WALL, INSULATION, DOOR, HALFWALL, HEATER, SLIDING, WINDOW, STAIRS UP/DOWN,
  CABINET, FURNITURE. DOOR/WINDOW/HALFWALL/HEATER/SLIDING are the **aperture family** (one shared
  `[sill,head]` band + glyph model — see "Apertures & vertical bands" below). The rectangle persists
  `kind` independently from its boolean `op`, preserving semantic identity for later type-specific
  behavior. The breadcrumb remains `PLAN · ADD`; the separate `TYPE · <kind>` readout is the only
  label that changes with thumbstick up/down. ROOM is blue (the only "add" color) and subtract types
  use their type color. Edges get pushed to real walls in EDGE.
- **EDGE** — two presses per wall: 1st (aiming at an edge of ANY zone) LOCKS it; 2nd (tip on
  the real wall) snaps the locked edge to it. Once locked, the label/reticle turn yellow
  "SNAP TO WALL". Grip cancels a pending lock.
- **PLAN · EDIT** (`id: edit`) — the plan editing domain. With nothing selected, grip cycles overlapping
  zones and trigger confirms the yellow candidate; trigger again deselects. B/Y deletes it, and thumbstick up/down cycles the selected zone's kind
  through `ZONE_KINDS` (room→wall→insulation→door→garage→halfwall→heater→sliding→window→stairs up→stairs down→cabinet→
  furniture). **When the selection is an aperture** (door/garage/window/halfwall/heater/sliding), **A/X
  rotates it** (`rotateAperture`: door/sliding 4-way hinge×swing, window 3-way hinge, stairs 4-way
  ascent; halfwall/heater return false = inert), and the reused DIMS **numpad opens as a band pad** to type its `[sill,head]`
  bounds — see "Apertures & vertical bands". Selecting a **furniture** placeholder zone opens the same
  band pad for its `[foot,top]`. Marker
  glyphs are inert. The mode breadcrumb remains `PLAN · EDIT`; a separate, larger controller
  readout continuously shows `TYPE · <kind>` and is the only label that changes while cycling.
  All subtract kinds deliberately share their current geometry/color. Selecting a ROOM adds its connected component's
  `room: <area> m²` to the info panel, independent of reticle position. Positive-length shared edges and
  overlaps connect rectangles; corner-only contact does not, and overlapping area is counted once. The
  plan sheet prints the same union area once inside every distinct ROOM component.
- **PROJECT · TRANSLATE** (`id: translate`; grouped under PROJECT, though it acts on the active plan)
  — rigidly relocate the complete active floor relative to
  the unchanged plan origin. Pick one vertical edge and enter its desired signed X distance, then
  pick one horizontal edge and enter its desired signed Y distance (either axis may be first).
  FLIP changes the pending coordinate to the other side of origin. Only after both entries does one
  atomic `(dx,dy)` transform move every rectangle and marker. Edge↔edge and marker↔edge constraint
  values remain invariant; every origin-referenced value is updated, and manually positioned
  dimension lines/value boxes receive the same translation. The two picked edges are retained as
  explicit origin constraints. Grip backs out the pending edge/axis. Floor elevation and the physical
  ORIGIN/RECAL registration are untouched.
- **PLAN · DIMS** (`id: plan_dims`) — plan constraints only: edge↔edge sizes and edge↔origin
  position locks. The origin target is tested in plan space, so it remains aligned with the visible
  origin ring after TELEPORT/navigation offsets. Marker floor icons and marker pins are inert.
- **MARKER · EDIT** (`id: marker`) — the marker editing domain. **Thumbstick up/down cycles the drop
  type** (standard/specialized outlets, switch, light, and ethernet) — or, if a marker is
  selected, **retypes that marker in place** (`setMarkerType`). Each type has a `markerFace()` glyph
  (including Type E, shutter, dedicated aircon supply, cooktop, oven, water-heater, dedicated-appliance-outlet, single/dual Ethernet, patch panel, intercom, and consumer-unit panel symbols) and a
  `marker.<type>` i18n key. A **light drops with z defaulted to the storey height** (ceiling —
  unreachable to tip-capture); other types capture z from the tip. The mode breadcrumb remains
  `MARKER · EDIT`; the separate prominent readout shows `TYPE · <type>` and is the only label
  that changes while cycling. A **floor reticle**
  tracks the aimed floor point and the marker under it is picked through its **flat floor icon**
  (`markerAtFloorPoint`, reticle-radius gated) — a stable plan-space target, not the floating wall
  billboard. When markers overlap, grip cycles them before selection and trigger confirms the yellow
  candidate. Both the selected floor
  icon and wall glyph are outlined, and the height pad refreshes for each cycled marker.
  Empty-space trigger places a marker of the current type **at the tip** (z capture); triggering the
  hovered marker opens its **height pad** (a single-value datum pad — see "Vertical authoring"): the
  typed value is the height above the floor, **SWAP toggles free↔floor** (`⊘ free` / `↑ floor`), and
  **DEL frees Z** (standard DEL caption) — clearing the height dim so the grab moves Z again. ENTER commits the
  height, closes the pad, and clears the selection. **Only the selected marker can be grip-dragged**
  in 3D, but **every axis carrying a defined dim stays locked**: X/Y from
  `marker._locked` (its distance pins) and **Z whenever a `zDatum` is set** (`nz = marker.zDatum ?
  marker.z : tipZ`). So a fully-pinned marker with a defined height doesn't move at all under grab; a
  free (never-height-set) marker grabs in full 3D. **B/Y deletes the selected marker** (distinct from DEL, which only frees Z). Every marker
  also has the flat projected floor icon showing its plan X/Y, and a per-type wall glyph
  (`markerFace`: outlet = Type E socket, switch = rocker). Plan zones are inert.
- **Stacked devices** (owner decision, 2026-09-26). A double switch is authored as **two switch markers
  at the same point**, one per rocker. Circuits alone would not need that: one marker is correct when both
  rockers share a feed. But a LINK goes from a switch marker to a light, so two rockers driving two lights
  need two markers. **Do not draw stacked markers apart in AR.** That was considered and rejected: the floor
  icon, reticle pick, marker dims and sheet all use the shared point, so a display-only offset would put
  glyphs where the data is not. Instead, when the hovered marker shares its plan point with others
  (`markerStackInfo`), the controller readout adds `<type> i/n → k× light`. `i/n` is its place in the
  grip-cycle order: top to bottom, then authoring order, counting every marker at that point, e.g.
  shutter 214 cm, 2 switches 109 cm, outlet 24 cm = 4. The lights it controls are outlined cyan in every
  mode except LINK, which already shows them. MARKER · CHECK folds `i/n` into its hover line.
- **MARKER · LINK** (`id: marker_link`) — electrical control relationships. Grip cycles eligible
  overlapping switches (then lights), and trigger confirms the yellow candidate. Triggering one or
  more selected light icons toggles each control link. Pairwise links allow one switch to
  control many lights and a light to be controlled by multiple switches. Grip clears the source
  selection without deleting data. The selected switch is amber, its linked lights are cyan, the
  hovered switch/light is yellow (other marker types are never LINK targets), and the separate
  readout advances from `PICK SWITCH` to `PICK LIGHT`.
  Linked routes are derived live as dotted 3D switch
  legs: vertical rise from the switch, a direct ceiling run at storey height, then a drop if the
  light is below the ceiling. Routes are visible only in LINK mode; the sheet draws their dotted
  plan projection and DXF writes their true 3D segments on `ELECTRICAL_ROUTE`.
- **MARKER · CONDUIT** (`id: marker_conduit`) — author the **whole-house conduit network** (on
  `Project`, not a floor): a graph of `conduitNodes` (bare junctions carrying `{x,y,z,floorId}`, or
  nodes bound to a device `markerId` that follow the live marker) joined by `conduitSegments`. Pen
  model: `penNodeId` is the growing end. The nearest eligible device/node inside the reticle is
  highlighted; **grip over a target cycles the combined overlap stack without changing geometry**, and
  trigger commits only the highlighted target. Trigger empty space to drop a junction (X/Y from the
  floor reticle, z from the tip, floorId = active floor—or the tip's storey in ALL FLOORS) and run a segment to it; trigger another target
  to join/branch/loop. **Trigger an existing run** (picked by its floor projection, like CONDUIT
  EDIT; the hovered run turns yellow and the preview snaps to the split point) to **branch from it**:
  `splitConduitSegment` inserts a T-junction whose height comes from the run (interpolated; a
  vertical run uses the tip height, clamped), never from the hand. Runs attached to the pen node and
  points within the reticle radius of a run's end are not offered (target that node instead).
  **B/Y undoes the last pen step** (`undoConduitPenStep`): it removes the segment and junction that
  step *created* (pre-existing items are never removed; `addConduitSegment`/
  `ensureConduitNodeAtMarker` may return existing ones), re-joins a split run, and moves the pen back.
  Repeated presses walk back; the history clears on mode change. Grip on empty space lifts the pen (no deletion). **Cross-floor risers:** enter
  **LEVEL · ALL FLOORS**, then return to **MARKER · CONDUIT**. Aiming down favours your own storey,
  aiming up the storey directly above (the reticle rule under **ALL FLOORS** below); grip cycles
  overlaps outward to farther storeys, and a trigger joins the chosen pair.
  Empty-space junctions are assigned to the storey whose vertical band contains the controller tip.
  In a normal single-floor view, the floor directly above/below is also drawn dimmed (`adjacentGroup`)
  at its true relative height, its nodes + devices pickable (`adjacentTargetAtFloorPoint`, hover
  yellow); triggering one runs a segment across the slab — a **riser**. The network is drawn live in
  `conduitGroup` at active-plan-local Z (`worldZ − activeElevation`) in uniform purple, showing only
  segments touching the active floor, with a node sphere per active-floor vertex. Readout: `START PEN`,
  then `RUN CONDUIT`. **The intended conduit→wire→circuit workflow and the conduit/wire/control-link
  relationship are in `docs/electrical-workflow.md`.**
- **CONDUIT · EDIT** (`id: conduit_edit`) — edit the network through an explicit combined selection.
  With nothing selected, **grip cycles every node/conduit segment under the reticle**; trigger selects
  the yellow candidate. The current candidate remains highlighted across per-frame candidate-list
  changes whenever it is still eligible, so hand jitter cannot silently reorder the hover selection;
  only grip advances it. Selecting a free (bare) junction opens
  a height pad (`activateNodePad` / `commitNodeHeight`, mirroring the marker height pad: single-value
  datum pad, **SWAP toggles FLOOR/FREE**, **DEL frees Z** (standard DEL caption, clears the height dim — it
  no longer deletes the node), ENTER commits z and keeps it selected). Trigger again deselects.
  **Only a selected node can be grip-dragged**, direct vs remote chosen at grip-press by the real 3D
  distance from the tip to the node sphere (`WAYPOINT_GRAB_M`): **direct** (in reach) carries it 1:1
  in full 3D; **remote** (far) has the floor reticle drive X/Y while z is held and typed on the pad.
  **A node with a defined `zDatum` holds its Z even in the direct carry** (`nz = n.zDatum ? n.z :
  tipZ`, matching the marker grab), so a height-defined junction slides only in X/Y.
  Both use `moveConduitNode` with `emit:false`, committed once on release. **Marker-bound nodes are
  immovable** (they follow their device) and have no pad. **B/Y deletes only the explicit selection**:
  a selected node + its incident segments, or a selected conduit segment alone (`deleteInMode` →
  `removeConduitNode` / `removeConduitSegment`; `via` references are dropped). Readout: `PICK NODE / CONDUIT`,
  then `EDIT NODE` or `CONDUIT SELECTED`.
- **CONDUIT · DIMS** (`id: conduit_dims`) — dimension a **bare junction to a wall** so it tracks that
  wall on every edit. It shares the DIMS numpad machinery with PLAN/OUTLET DIMS via a third
  ref kind, `node` (see the `modeDomain`/`dimDomain` helpers): first trigger a bare junction
  (`conduitNodeAtFloorPoint`, marker-bound nodes excluded), then a wall edge; the numpad sets the
  distance (A/X flips the pair; B/Y removes the pin). Commit builds a `{node}` distance constraint (`makeNodeDistance`) in
  the node's own floor, resolved ONE-WAY in `solveConduitNodes` (the junction follows, the wall never
  moves) — exactly the marker-pin model. At most one pin per (node, axis); re-picking a wall re-anchors.
  Pin X and Y separately for a full lock (`node._full`). Marker-bound nodes are inert here. The pin
  draws in `buildDimensions` like an outlet pin but with a cyan (conduit) label; node dims are AR-only
  authoring aids and never appear in sheet/DXF output (the sheet/DXF constraint loops skip any endpoint
  with no drawable `.rect`). The conduit network is shown for picking (hovered/selected junctions
  enlarge). Readout: `PICK NODE`, then `<->  ?`.
- **MARKER · WIRE** (`id: marker_wire`) — define **wires routed over the conduit network**. A wire is
  `{id, fromMarkerId, toMarkerId, type, via:[nodeId]}` in the **whole-house** `project.wires` array;
  `type` is `electrical` or `ethernet` (legacy/missing defaults electrical), and thumbstick up/down
  chooses the new-wire type or retypes the selected wire. Its
  physical path is **DERIVED** as the shortest route through the conduits (Dijkstra, threading the
  ordered `via` nodes), never stored — an unroutable wire simply draws nothing. Trigger two device
  markers to define one (`project.addWire`, which resolves markers house-wide, auto shortest route drawn
  at once); the created wire becomes selected. **Cross-floor wires:** an adjacent-floor device (dimmed
  in `adjacentGroup`) can be either endpoint, so a wire may span storeys over a riser. While a
  During both `PICK START` and `PICK END`, **grip cycles all active/adjacent-floor marker candidates
  under the reticle without committing**, and trigger chooses the yellow endpoint. While a
  wire is selected, trigger conduit **nodes** to force the route through them (`addWireVia`, a manual
  override); grip **pops the last via** (`popWireVia`), and **B/Y deletes the wire** (`removeWire`).
  With no endpoint pending, devices **and** existing wires under the reticle share **one** grip
  cycle (`wireTargetAtFloorPoint`): devices first, then every wire whose route overlaps there (in
  ALL FLOORS, ordered by storey rank first). Trigger selects the yellow ribbon, and trigger on empty
  space deselects it. An earlier version offered wires only when no device was in the reticle, so
  a wire running past a device could not be selected (owner report); keep the single cycle.
  As in CONDUIT · EDIT, the yellow target is **sticky** (`wireHoverKey`). It stays highlighted
  while it remains in the reticle, even when new devices or wires enter it. Only grip advances
  (a one-shot `wireEndpointPickAfterKey` request), and the first candidate takes over only when
  the highlighted one leaves the reticle. A selected wire's readout adds `CIRCUIT <len>` and, when
  non-zero, `SHARED <len>` in the other nature's color (definitions in `docs/electrical-workflow.md`).
  The readout pill takes up to 4 lines (`makeLabel(128)`); lengths are memoized per selection and
  wire-layer rebuild, never computed per frame. The
  conduit network shows for via-picking (hovered node yellow, existing vias cyan); wires draw in
  `routedWireGroup` as narrow ribbons colored by nature (electrical amber, Ethernet cyan), showing
  the legs touching the active floor. A
  live amber preview threads the pending pair (first endpoint → hovered marker/tip). Readout:
  `PICK START`, `PICK END`, then `VIA · <n>`. The wall/ceiling/floor surface of each segment is
  **inferred** from geometry (`segmentSurface`), never stored. This REPLACES the removed
  per-wire-waypoint model (`MARKER · WIRE`-trace + `WIRE EDIT`); routing lives in `src/core/conduit.js`.
- **MARKER · CHECK** (`id: circuit_check`, owner request 2026-09-26) — **read-only** circuit
  diagnostics from `circuitDiagnostics()` (`src/core/circuits.js`; definitions in
  `docs/electrical-workflow.md`). Each flagged device gets a floor halo ring plus a vertical pin up to
  its wall glyph: **red** = cross-tie (its chain reaches 2+ breakers), **orange** = wired but no
  breaker, **white** = an outlet/switch/light with no electrical wire. The flagged chains' wires are
  recolored the same way over the dimmed wire layer. Thumbstick up/down filters
  `ALL → CROSS-TIE → NO BREAKER → UNWIRED`. Aiming at a flagged device outlines it yellow and names its
  type and issue in the readout, above per-issue counts for the whole house (chains for cross-tie and
  no-breaker, devices for unwired). Trigger/grip/B/Y do nothing. The owner chose **not** to flag breakers
  that feed nothing, because spare breakers are normal. Rings and pins are **two batched draw calls**
  (`buildCheckOverlay`), rebuilt on mode entry, filter change, or view change; never one object per
  device, since 90+ devices are flagged mid-survey. Available in ALL FLOORS. In a single-floor view only
  the active floor's devices get rings, though the counts are whole-house.
- **MARKER · PIPE** (`id: marker_pipe`) — author a separate whole-house plumbing graph. Trigger a
  fixture, existing pipe node, or empty space to start a pen; empty space creates a free junction,
  and subsequent triggers create segments and advance the pen for bends, branches, loops, and
  cross-floor risers. Grip cycles overlapping marker/node targets, or lifts the pen on empty space.
  Thumbstick up/down chooses or retypes
  the service: cold water (blue), hot water (red), heating supply (orange), or heating return
  (purple). The selected pipe and both fixtures highlight yellow; B/Y deletes the selected pipe.
  Fixture-bound nodes store `{markerId, role}` and their role is inferred from the service (`cold`,
  `hot`, `supply`, or `return`), so one boiler/radiator/appliance marker can carry multiple logical
  ports without spatial connector geometry. Free nodes store floor-relative `{x,y,z,floorId}`;
  pipe segments reference two node ids. The graph persists in saves and floor-copy intra-floor
  subsets, and renders as ribbons at the stored 16 mm diameter. Retyping one segment propagates
  through its connected component. Joining unlike services uses source-wins semantics but is guarded:
  the first trigger highlights the destination component warning-red without mutation; trigger the
  same target again to convert/connect, or grip to cancel. Editable diameters, valves/manifolds, fixture
  role validation, derived networks, and output layers are intentionally deferred; see
  `docs/plumbing-workflow.md`.
- **MARKER · DIMS** (`id: outlet_dims`) — marker pins only. The first reference must be a marker's
  projected floor icon; only then do plan edges become eligible for the second reference. Plan
  dimensions cannot be selected or changed.
- **MATERIAL · FLOOR / WALL** (`id: mat_floor` / `mat_wall`, its own group; design and owner decisions
  in `docs/materials.md`). Active floor only; locked in ALL FLOORS.
  - **FLOOR:** trigger selects the room component under the reticle.
  - **WALL:** trigger selects the room wall face nearest the reticle (within 0.6 m, on the room side).
  - **Both:** thumbstick up/down cycles the selection's material (none, then the catalog for that surface)
    and applies it at once; B/Y clears it. Each wall face is set on its own: a copy-to-every-wall action
    was built and removed at the owner's request (2026-09-26); don't re-add it.
  - **Display:** finished floors tint in the material colour and finished faces draw a strip just inside
    the wall, all in one batched mesh (`buildMaterials`). The yellow hover/selection highlight is a second
    mesh, rebuilt only when the target changes.
  - **Readout:** material, then this floor/face's `m² · pcs` (+ cabochons), then the whole-house
    `HOUSE <packs> packs`.
  - **Takeoff timing:** `materialTakeoff` reruns only on mode entry and after each edit (no `onChange`
    subscription in mr.js).
- **FURNISH** (`id: furnish`, its own mode group) — place **real GLB furniture** (`floor.furniture[]`,
  IKEA models loaded on the fly through the Cloudflare Worker proxy; see `docs/furniture.md`),
  drawn in `furnitureGroup` at plan `(x,0,-y)` + `rotationY`. These are **NOT massing** — they never
  enter the footprint/boolean/extrude pipeline (distinct from the `furniture` *zone* kind, a
  `[foot,top]` placeholder rect authored in PLAN). Trigger empty space to **drop** the current article
  at the tip; trigger a hovered item to **select** it, which opens its **foot-elevation pad** — a
  single value = how high the model's base sits off the floor (for wall-hung units/shelves). That pad
  is **floor-only** (its SWAP cell is inert; there is **no** free-Z and **DEL
  deletes the item**, because furniture grip-drag is floor-planar so the foot is pad-only). **Thumbstick
  up/down** (`cycleFurnish`) rotates the selected item, or cycles the drop article when none selected.
  **Grip-drag** moves the hovered item over the floor reticle (`applyFurnitureGripDrag`, x/y only,
  `emit:false`, committed once via `touch()`; the foot elevation `y` is preserved). **B/Y deletes** the
  selected item. Detail: `docs/furniture.md`.
- **RECAL** — re-zero against a known corner, REGISTER-style. First SELECT a corner with the
  pointer reticle (aim so it hugs the wall you want as wall 1; W1 is cyan, W2 purple;
  the active wall receives the standard edge highlight; trigger to lock)
  → P1 farther along real wall 1 → P2 inward toward the corner → P3 on real wall 2. The directed
  P1→P2 vector maps the selected wall's endpoint→corner ray, giving one unique orientation.
  Corrects both rotational + positional drift.
- **SAVE / LOAD** — ray-aimed 6-slot menu; the unit is the whole multi-floor project. Empty SAVE
  slots write immediately. Selecting an occupied slot replaces the slot grid with a confirmation
  screen containing separate **CONFIRM OVERWRITE** and **CANCEL** buttons; the original slot is no
  longer a trigger target. Only the confirmation button writes. Changing mode or pressing grip also
  cancels the pending overwrite.
- **PROJECT · COPY FLOOR / PASTE FLOOR** (`id: copy_floor` / `paste_floor`) — COPY snapshots the
  complete active floor (name, storey height, rectangles, dimensions, markers, and electrical links) to a separate
  persistent clipboard. It survives LOAD and an APK relaunch. PASTE **replaces the currently active
  floor's authored plan** (rectangles, dimensions, markers, and electrical links), using collision-free ids and remapping
  every internal reference. The destination level keeps its id, name, storey height, elevation and
  ground designation. An empty target pastes immediately; an occupied target requires a second
  trigger, and grip/mode change cancels confirmation. Desktop uses a native confirmation dialog.
- **PROJECT · MOVE UP / MOVE DOWN** (`id: move_up` / `move_down`) — trigger transfers the active
  floor's complete authored contents (rectangles, constraints, markers, and electrical links) to the immediately
  higher/lower floor and makes it active. The source becomes empty. The operation refuses an absent
  or occupied destination, so it
  never overwrites or implicitly merges data; floor names, heights, elevations, and the ground datum
  stay attached to their existing storeys.
- **EXPORT** (`id: export`) — preview + download the active LEVEL floor as SVG, PNG, or DXF,
  or download the complete serialized project structure as debugging JSON.
  When the optional LEFT controller is detected, an enlarged panel (`makeSheetPanel`) follows it
  in every mode and shows the active floor rasterized by `floorToCanvas`
  (`src/io/planSheet.js`) — the SAME renderer that produces the printable/downloadable SVG,
  so preview == print. Model rebuilds dirty this live sheet; the frame loop redraws it at up to
  8 fps during continuous dimension/edge drags. The preview/export floor is always the active
  real floor; change it only through SETUP · LEVEL. In EXPORT, RIGHT **thumbstick up/down** switches
  `SVG` / `PNG` / `DXF` / `COOHOM DXF` / `JSON`. PNG is a 4096-pixel-long-edge raster of the same complete paper sheet
  as SVG. A ray-picked panel has **7 output-layer toggles** (`TOGGLES` = `planDims`, `markerDims`,
  `markerIcons`, `wiring`, `furniture`, `furnitureDims`, `area`): `wiring` (default **off**) surfaces
  the whole-house conduit/wire layer, and `furnitureDims` (default off) surfaces dimensions anchored to
  a furniture edge — each gated under its parent (`wiring` under `markerIcons`, `furnitureDims` under
  `furniture`) so a dim/route to an undrawn element can't dangle. A separate **EXPORT** button
  downloads the selected format to the headset. These choices persist locally under
  `house-cad:output:v1`, not in project saves, and immediately redraw the LEFT preview.
  The panel also has two cycling rows, each cycled by flicking the RIGHT **thumbstick** while pointing
  the ray at that row (so neither clashes with format cycling), or by tapping the row:
  a **LANGUAGE** row picks the **sheet** language independently of the app UI language (session-only
  `exportSheetLang`, fed to preview + download via `sheetLabelOpts`; DXF layer names stay English), and
  a **COMPARE** row picks the **change-map baseline**, cycling `none` → each saved slot
  (`house-cad:slot:i`). The taller 7-toggle + COMPARE + LANGUAGE + button panel is **unwalked** — fit/
  readability unverified in headset. When a slot is chosen, the
  sheet — LEFT preview and the SVG/PNG export — is drawn with revision clouds + numbered delta tags +
  a `REV — CHANGES` legend for everything that changed since that snapshot (see `planDiff.js` /
  `drawChangeMap`). Change maps are sheet-only: DXF/Coohom/JSON ignore the baseline. The selection is
  session-only (slot contents are volatile), and only slots saved in THIS browser appear, since
  `localStorage` is per-device. **Build-verified only — not yet walked on device.**
  Every export gets a millisecond timestamp in its filename. Chromium may gate a second synthetic
  download from one immersive session regardless of its name; after the first direct download,
  AR therefore uses Android Web Share (when file sharing is supported) for subsequent exports.
  The share sheet is an intentional user-confirmed delivery step around that browser restriction;
  if Quest advertises Web Share but rejects it from immersive mode, delivery retries as a uniquely
  named direct download rather than discarding the generated document. For Quest's site-level
  **Batch download** permission, open House CAD in the normal 2D Quest Browser before entering AR
  and press **Enable batch downloads**. Its one explicit browser click starts two tiny, disposable
  `.txt` test downloads; the second causes Chromium to offer the permission prompt where it is
  visible. Choose Allow, then relaunch the TWA. JavaScript cannot inspect or grant this permission.
  JSON uses `serializeProject` and contains the whole multi-floor persistent model; output-layer
  toggles do not filter or mutate this debugging snapshot.
  The panel is absent
  when no LEFT controller is connected. Read-only: no massing/pin edits, grip is inert. There is NO on-device printing — an
  immersive session has no print dialog; the SVG blob is the off-headset deliverable
  (retrieve by cable). Desktop is where you actually print (Print menu → Save-as-PDF).
- **UNIT** (`id: unit`) — display/input unit switch. Thumbstick up/down cycles `m` / `cm` / `mm`;
  trigger picks the ray-aimed row, or advances one if the ray is off the panel. Dimension labels,
  numeric entry pads, sheets, and the desktop selector update immediately. This is a persisted UI
  preference (`house-cad:unit:v1`), not project geometry; all stored coordinates remain meters.
- **LANG** — UI language switch (see Localization). Thumbstick up/down moves through the list
  (FR/EN/ZH); trigger picks the ray-aimed row, or advances one if the ray is off the panel.
- **PERF** (`id: perf`) — diagnostic. Trigger starts/stops a GPU layer sweep (`PERF_LAYERS`):
  each 1.5 s window hides one overlay layer only for that render (between `scene.onBeforeRender`
  and `onAfterRender`), and the debug HUD lists each layer's cost in ms per frame as
  (all visible) − (without it). The time source is `EXT_disjoint_timer_query_webgl2` GPU time when
  exposed (`gpu:`), else the frame interval (`frame:`, quantized by vsync). It keeps running in
  other modes and is session-only. `?perf` in the URL starts it on; the APK can't pass that,
  hence the menu toggle.

## Localization (`src/core/i18n.js`)

All user-facing AR text is localized (EN default, FR, ZH) — mode labels, per-mode help boxes,
transient labels (SNAP TO WALL, WALL 1/2, PERP…), numpad keys, DIMS titles + edge/origin ref
names, band-pad field labels (`aperture.sill`/`head`, `furniture.foot`/`top`), datum words
(`z.floor`/`free`), the pick-up-controllers prompt (`controllers.*`), SAVE/LOAD
slot menu, LEVEL pad title, and UNIT/LANG menus. The EXPORT sheet language is chosen separately from
the app UI language (`sheetLabelOpts`). HUD debug lines stay English (diagnostic).

- `i18n.js` mirrors `units.js`: a `current` language + an `onLangChange` bus, plus `t(key)`,
  `setLang`/`cycleLang`, and `getLang`/`langLabel`. The choice **persists** to localStorage
  (`house-cad:lang:v1`) so it survives an APK relaunch. Missing key/lang falls back to en → key.
- `mr.js` re-renders on `onLangChange`: current mode label/help + any open pad/menu. Canvas panels
  (numpad keys, slot cells, lang rows) resolve `t()` **at draw time**, so a redraw picks up the
  switch. Floor NAMES remain stable model data for save compatibility; their built-in
  Basement/Ground/Upper presentation is localized on sheets, while custom names pass through.
- **CJK wrapping**: the help-box `wrap()` is CJK-aware — Chinese has no inter-word spaces, so each
  CJK glyph is its own break token (Latin runs stay whole). Without this a ZH sentence overflows as
  one giant "word". Relies on the platform having a CJK font (Quest Chromium ships Noto CJK).

## Inputs

- Controller roles are fixed by WebXR handedness; recent activity never transfers control.
  **RIGHT** is the editing controller and owns all mode navigation, panels, picks, and edits.
  The optional **LEFT** is an independent companion: its trigger always teleports to its dedicated
  cyan floor reticle, and its other controls never invoke the active editing mode. Roles require a
  physical controller input source (`gamepad` present, `hand` absent): tracked-hand select/pinch
  events are ignored. The sheet is **hold-to-view on LEFT grip**: hidden at rest and visible only
  while the grip remains pressed. It sits directly above the controller in a neutral upright pose;
  when the controller has no rotation, the sheet is a vertical plane facing back toward the user.
  Its solid-white canvas renders in the transparent pass at order 90: after all world plan tints,
  markers, dimension labels, and edit panels, but before the right-controller HUD at order 100 and
  the shared panel ray-pointer at order 110. The pointer itself is explicitly transparent-pass;
  making it opaque would force it before the canvas panels regardless of `renderOrder`.
- RIGHT **trigger** = mode action (place / pick / press a numpad or slot key). LEFT trigger = teleport.
  **LEFT thumbstick-x** rotates the placed plan **about the headset position** in **±20° steps**
  by updating `planYaw` plus `navOffset` (never `planPos`, which the spatial anchor restores each frame),
  one per flick (`PLAN_YAW_STEP`), so the point under you stays put and the room swings around you —
  aligning the virtual plan to the real room without re-registering. Pivoting off-origin also
  translates `navOffset` so the headset's world XZ is invariant
  (`newPos = P + R_y(d)·(oldPos − P)`). `planYaw`/`navOffset` here are session navigation
  (a view/companion transform,
  applied via `applyPlanMatrix`), **not** model geometry — never an editor edit. LEFT grip/other
  controls never invoke editor actions.
  **LEFT thumbstick-y (ALL FLOORS only)** is a vertical teleport, one storey per flick (up = the
  storey above; `teleportStorey`). It shifts the whole stack by `navLift` so the target storey's floor
  lands where "my storey's" floor was, like `navOffset` horizontally. Every world-Y ↔ absolute-Z
  conversion goes through `groundY()` (= `planPos.y − navLift`), never `planPos.y`. The current mode,
  pen and pending picks survive, so a wire can be started on one storey and finished on another
  (owner request, 2026-09-26). `navLift` resets on any LEVEL change and on registration. The stick
  is inert on single floors, whose overlays stay physically registered.
- **No physical controller in the editor (RIGHT) role** → the headset is in hand tracking (controllers
  set down). Rather than going blank, a **"Pick up your controllers"** prompt (`handPrompt`,
  `controllers.pickUp` / `controllers.handMode`) shows and the rest of the HUD stays hidden that frame;
  hand-tracked select/pinch is never a role source.
- RIGHT **grip** = **non-destructive** context action only (deletion moved to B/Y — see below). It
  cancels/undoes an in-progress gesture (either DIMS = undo a dim pick, or, before the first pick,
  cycle a vertical node/marker stack under the reticle; EDGE = cancel a locked edge; TRANSLATE/
  REGISTER/RECAL = back out a point; MARKER LINK = clear the source switch; MARKER CONDUIT = lift the
  pen; MARKER WIRE = pop the last via override; SAVE/LOAD/LEVEL = nothing). UNLESS the
  reticle is over a drag target → **grip-drag** (either DIMS over its own dim panel = place the line
  perpendicularly and slide the value box along it; EDGE
  over an edge = move it; MARKER with the floor reticle over a marker's floor icon = grab it and move
  in 3D at its initial pointer depth; CONDUIT EDIT over a bare node = move it; FURNISH over an item =
  move it).
  Marker drag **locks any axis with a defined dim** — X/Y from `marker._locked` (its pins) AND **Z when
  a `zDatum` is set** (`nz = obj.zDatum ? obj.z : tipZ`) — so a measured position/height isn't dragged
  off; only free axes follow (a fully-pinned, height-defined marker doesn't move). See "Vertical
  authoring". Its per-frame `moveMarker(..., {emit:false})` updates are visual/model-local; grip
  release calls `project.touch()` once, avoiding a full solve/listener/autosave cascade every XR frame.
  `onReset` early-returns while `gripDrag` is set (`squeeze` fires before `squeezeend`).
- RIGHT **thumbstick-x** = cycle mode; **thumbstick-y** = the universal "cycle the current thing" control,
  no-op where nothing applies: **LEVEL** = floor / ALL FLOORS (`switchFloor`, no wrap); **UNIT** =
  display/input unit (`cycleUnit`, wraps); **LANG** =
  language; **MARKER · EDIT** = retype the selected marker, or the drop type if none selected
  (`cycleMarkerType`, wraps), including general, shutter, and air-conditioning outlets;
  **FURNISH** = rotate the selected GLB item, or cycle the drop article if none selected
  (`cycleFurnish`); **PLAN · ADD** = the kind to add over `ZONE_KINDS`
  (room/wall/insulation/door/garage/halfwall/heater/sliding/window/stairs up/stairs down/cabinet/furniture, `cycleZoneKind`);
  **PLAN · EDIT** = the selected zone's kind (`cycleSelectedZoneKind`); **EXPORT** = the SVG/PNG/DXF/
  Coohom/JSON format, UNLESS the ray points at the panel's COMPARE row (→ cycles the change-map
  baseline) or LANGUAGE row (→ cycles the sheet language), which take precedence.
  **thumbstick-hold (~1.2 s)** =
  exit AR.
- **Neither face button cycles modes** (mode nav is thumbstick-x, both ways; prev-mode on A/X was
  removed as an asymmetric one-off). **A/X = FLIP or ROTATE**: in either DIMS mode with a completed
  pair it flips the dimension side (`flipConstraintSide`, NOT `swapConstraint`); in TRANSLATE it flips
  the pending coordinate side; **in PLAN · EDIT with a selected aperture it rotates that aperture**
  (`rotateAperture`, gated on `edit` mode so it does not collide with the DIMS/TRANSLATE flip); inert
  otherwise. **B/Y = DELETE** the mode's selected/hovered item where applicable:
  in DIMS it removes the dimension constraint (`deleteDimContext` — a completed pair, else a hovered
  existing dim label); elsewhere `deleteInMode` (PLAN EDIT zone, MARKER, FURNISH item, CONDUIT EDIT
  hovered segment else selected node + its segments, WIRE selected wire). TRANSLATE has nothing to
  delete, so B/Y is inert there. All contextual cycling lives on thumbstick-y (above).
- Both tracked controllers remain visible. The RIGHT HUD and LEFT sheet/teleport target are displayed
  by role; when LEFT is absent, its sheet and reticle are absent and RIGHT continues alone.

## Dimensioning (PLAN DIMS / MARKER DIMS)

Exact size = dimension constraints only (core design rule; no on-canvas size editor). The two
dimension modes are hard-filtered domains, not one mixed picker. PLAN DIMS permits edge↔edge and
edge↔origin; MARKER DIMS permits marker↔edge only and requires the marker first. Ref-pick is
reticle-gated (`edgeAtPoint` / origin near gizmo / `dimLabelAtPoint` to select a plan constraint).
Numpad row is **SWAP | DEL | ENTER**, shown only in the edit phase. Field prefills the current
value; **0 m is valid** (edge↔origin lock, adjacent edge↔edge); negatives rejected.

- Marker X/Y pins are selected through the marker's **projected floor icon**, never its wall-height
  glyph. In MARKER DIMS, pick the floor icon first and a plan edge second. Before the icon is
  selected, edges are inert; after it is selected, other marker icons and the origin are inert.
  Hovering or locking a projected icon adds a bold outline to it and its linked wall-height
  glyph without resizing either icon, disambiguating markers that share X/Y at different heights. The
  resulting one-way constraint moves the marker, not the wall.
- Every marker pin renders an orange dashed floor dimension from the anchored wall edge to the
  marker's projected coordinate, plus a value label. That label can be selected or grip-dragged
  only in MARKER DIMS; PLAN DIMS ignores it. Parallel dragging may carry either a structural or
  marker label beyond both measured endpoints; print preserves that outside placement. The span
  where the distance applies is dashed; if the value panel sits beyond it, a dotted leader joins
  the nearer endpoint to the panel (AR and print).

- Distance = ordered + signed (`value = coord(b) − coord(a)`). **FLIP = `flipConstraintSide`**
  (negate value, keep order). `swapConstraint` is geometrically a NO-OP (swaps a,b AND negates;
  only the anchor changes) — do not "fix" the AR flip back to it.
- A conflicting size is refused: `commitEntry`/flip count solver conflicts before/after and roll
  back if the count rose; numpad shows `!CONFLICT`, pair stays.
- **DEL** removes the pair's constraint and closes the pad; for a NEW pair with no constraint
  yet, DEL cancels the in-progress definition and closes the pad (both resolve to "clear + back
  to ref-pick").
- `c.offset` = signed perpendicular line placement (serialized): origin and outlet dims store it
  absolute, edge↔edge relative to the outer edge; `setDimOffset` is the shared setter (grip-drag +
  default-on-create). A new dim's line defaults to the tip position when the pair completes.
- AR renders edge↔origin dimensions (the DESKTOP draws none for origin refs — that parity note
  is AR-only).

## Apertures & vertical bands (PLAN EDIT band pad)

**Apertures** (`door`/`garage`/`window`/`halfwall`/`heater`/`sliding`) are subtract zone kinds sharing **one
vertical model** and **one glyph source**. Each carries a `[sill, head]` opening band plus, on
door/sliding, `hinge` (opening side along the wall axis) × `swing` (which wall face the leaf sweeps).
Garage doors have no jamb hinge: `swing` selects which face is inward, and their sectional overhead
footprint projects 2.10 m from that zone edge plus 0.15 m beyond each jamb.
Kinds differ only in which part is solid: a door is open `[0..head]` (solid lintel), a window open
`[sill..head]`, a **half wall** solid `[0..sill]` with `head:null` = open to the ceiling, a **heater**
a **bounded solid `[sill,head]` band** (default `0`/`0.6`, amber, radiator-fin glyph, `HEATER` DXF
layer — s26 fix: NOT a `head:null` half-wall clone; a heater has a top and doesn't reach the ceiling),
a **sliding** door a rail whose panel is inferred as the opening + a fixed 10 cm overhang. Defaults
live in `APERTURE_DEFAULTS` (`zoneColors.js`); `setKind` resets them on retype.

- **All plan symbols come from `src/core/apertureGlyph.js`** (`doorSwingSegments`, `garageDoorSegments`,
  `windowCasementSegments`, `halfWallHatchSegments`, `heaterFinSegments`, `slidingDoorSegments` +
  `resolveApertureOrient`), consumed by `planSheet.js`, `dxf.js`, AND `mr.js` (`addApertureGlyphs`, in
  `planGroup`) so print / DXF / AR **cannot diverge**. Arcs are sampled as line segments (no backend
  arc primitive); hinge/swing resolve from each caller's own mapped corners so the Y-flipped print
  page keeps left/right and in/out correct — never bake orientation into the glyph functions.
- **A/X rotates the selected aperture** in PLAN EDIT (`rotateAperture`): door/sliding cycle 4 states
  `[left,in]→[right,in]→[right,out]→[left,out]`, window cycles 3 hinge states `left→right→both`.
  Garage toggles its inward face (`in↔out`). **Stairs** (owner request, 2026-09-26) turn their ascent
  90° clockwise per press: `climb` cycles `+x→-y→-x→+y`. `climb` is the *physical* climb direction, so
  the same value holds on both storeys: STAIRS UP draws its arrow along it, STAIRS DOWN against it. A
  stair with no `climb` (saved before this) keeps the legacy reading, long axis toward max, until it is
  first rotated. The sheet, DXF, AR floor glyph (`stairSegments`/`resolveStairOrient`) and View 3D treads
  all read it. Climbing along the short axis is allowed, because wide flights exist. Halfwall/heater have no orientation (returns false → inert). This is gated on `edit` mode so it does
  not collide with A/X = FLIP in DIMS/TRANSLATE.
- **Band pad** — selecting a band-carrying rect in PLAN EDIT opens the reused DIMS numpad as a band
  editor (`activateBandPad`/`syncBandPad`/`commitBandField`). `verticalBandFields(rect)` is the
  authoritative per-kind field list: apertures → `apertureBounds` (door/garage/sliding = HEAD only since sill
  is structurally 0; halfwall = SILL only since head is null; window/heater = both); furniture zone →
  `[foot,top]`; else `[]`. The **SWAP cell cycles the field** (only when ≥2 fields; label names the
  field it switches to, namespaced `aperture.*` vs `furniture.*`); ENTER writes `rect[field]` with a
  band-ordering guard (lower < upper); **DEL deletes the whole zone** (unlike the height pads' DEL).
  The pad stays open after a commit so the other bound can be typed next.
- **Owner decisions:** every aperture stays a **subtract** (the `op` invariant is untouched); `hinge`
  is measured **along the wall's own axis** (`left` = min-coord jamb, `right` = max, `both` = double
  casement); a half wall is the literal inverse of a door; a sliding door's authored box is the
  **opening**, and its panel is inferred (opening + 10 cm overhang, passed in the caller's units).
- **Where the band shows up:** door/window `sill`/`head` drive the **desktop/shared 3D viewer**
  (`src/core/architectural3d.js` cuts them into wall segments) and the AR Z-dims. They still reach
  **no plan output**: the glyphs, sheet, DXF, and STL/OBJ/GLB export (legacy `extrude.js`) ignore them.
  In AR itself a band edit only shows in the blue Z-dims or by re-selecting (the pad prefills).
  Carving openings into the **exported** mesh is owner-deferred; do not build it unprompted.

## Vertical authoring (heights)

Marker z, bare conduit-node z, and GLB foot elevation are each authored as a **single-value height
on a pad** (`nextDatum`/`datumWord`/`datumSwapLabel`, shared by the marker and node pads).

- **Z is deliberately NOT in the solver** (it stays 2× 1-D X/Y: "plan + single extrusion height").
  Every vertical value (marker/node z, GLB foot, aperture sill/head, furniture-zone foot/top) is a
  typed scalar, not a relational constraint.
- **Heights are floor-referenced only (owner, s28: "Ref to Floor is the only requirement").**
  INVARIANT: stored `z` is always the height above the (active) floor. The earlier ceiling-relative
  datum was **removed** (no `zOff`, no `solveVerticalDatums`); `verticalFields()` in `serialize.js`
  coerces legacy `zDatum:'ceiling'` + `zOff` to `'floor'` losslessly (the stored `z` was already the
  resolved height).
- **`zDatum` is just free vs defined.** No `zDatum` = **free** (height never defined; the 3D grab
  moves Z). `zDatum:'floor'` = **defined** (a real vertical dim; the value holds in a grab). Setters
  `setMarkerVertical` / `setConduitNodeVertical` / `setFurnitureVertical(id, datum, value)` via the
  shared `setVertical`: datum `'free'` drops the flag and keeps z; anything else stamps `'floor'`.
- **Marker + conduit-node pads:** **SWAP toggles free↔floor** (title `⊘ free` / `↑ floor`); typing a
  value defines it; **DEL frees Z** (standard DEL caption) — it clears the height dim and does NOT
  delete the object (object-delete is B/Y). A z edit that moves geometry needs a hand `buildPlan()` /
  `buildConduits()` (`mr.js` doesn't subscribe to `onChange`).
- **GLB foot pad is floor-only**: SWAP inert, DEL deletes the item (see FURNISH).
- **The 3D grip-drag holds any axis with a defined dim.** X/Y come from `marker._locked` (distance
  pins); **Z is held whenever `zDatum` is set** (`nz = obj.zDatum ? obj.z : tipZ`, in
  `applyMarkerGripDrag` / `applyConduitNodeGripDrag`). Applies to markers, bare nodes, and
  direct-carried conduit nodes; the GLB foot and the furniture-zone `[foot,top]` are pad-only.
- **Z-dim visual.** Any object with a defined height shows a static, non-pickable **vertical height
  dim drawn exactly like its X/Y dims**: dashed `DIM_T` strips in the shared dim materials
  (`makeZDimBatch`), dashed ±4.5 cm end ticks, and the standard value label centred on the line. A
  vertical line has no floor plane, so each dash is a crossed pair of vertical strips (ticks: crossed
  flat strips) — thin from any side. Styling follows the piece's X/Y pins: markers amber strips +
  amber label (floor→z, shown iff `zDatum`), bare conduit junctions amber strips + **cyan** label
  (like `CONDUIT · DIMS` pins; was purple in s28), apertures blue: floor→sill and floor→head as two
  side-by-side dims 4 cm either side of the centre along the wall (zero sill and open top omitted).
  Heights are typed, never dragged, so the dims are display-only. `zDimGroup`/`buildZDims()` are rebuilt inside both `buildMarkers()` and
  `buildConduits()`, active floor only (`clearZDims()` runs in `buildAllFloors`). GLB foot is not
  shown yet.
- **The pads reuse the DIMS numpad's SWAP/DEL cells via overrides.** `numpad.draw(...)` takes optional
  `swapLabel` and `delLabel`. So **SWAP has three context meanings** — FLIP (DIMS), field-cycle
  (band pad), free↔floor toggle (height pads) — and **DEL means "delete the DIM you're editing"** on
  the height pads (Z-dim) and in DIMS (constraint), but **"delete the whole zone/item"** on the band
  pad and GLB foot pad. Don't assume SWAP == FLIP or DEL == delete-object.
- Not done: an align/offset link between two vertical entities, or a true third solver axis with a
  section view.

## Multi-floor (LEVEL)

Floors are independent plans sharing the same plan origin (0,0); elevation is DERIVED by
stacking per-floor heights (`Project._recomputeElevations`: ground = 0, up accumulates,
basement negative). The settled design decisions are in `docs/product-intent.md`.

- Entering AR seeds **Basement · Ground · Upper** around Ground (`ensureFloors`; no-op if
  already multi-floor; default 2.8 m, persists via autosave).
- **LEVEL mode**: **thumbstick up/down switches** the active floor (`switchFloor`, no wrap), with
  a read-only **ALL FLOORS** pseudo-level immediately above the top storey. Real floors reuse the
  DIMS numpad for storey height; **ENTER** calls `project.setHeight` and re-stacks elevations.
  Heights are entered **by hand** — Quest can't measure the vertical offset. The pad's SWAP/DEL
  keys are inert. Labels read `LEVEL · <FloorName>` or `LEVEL · ALL FLOORS`.
- **ALL FLOORS** renders every floor's footprint, edge state, dimensions, and markers at its
  derived elevation around the shared ground origin. It leaves `activeFloorId` unchanged and hides
  the height pad. Architecture, marker placement, dimensions, and furniture remain read-only, but
  the whole-house topology tools **MARKER · CONDUIT**, **CONDUIT · EDIT**, **MARKER · WIRE**, and the
  read-only **MARKER · CHECK** remain available. They render nodes/devices/routes across every storey, so a segment between
  floors becomes a riser without changing active floor.
  **Reticle rule (owner decision, 2026-09-26):** the reticle never lands further than one slab away.
  "My storey" is the one whose elevation band holds the headset (`allFloorsReticleFloor`). Aiming
  down puts the reticle on my storey's floor; aiming up puts it on the floor of the storey directly
  above. From the top storey, aiming up shows no reticle. Picking **prioritises** the reticle's
  storey rather than filtering to it (`pickRanker`). Every storey's devices, nodes, pipes and route
  legs under the reticle are candidates, ranked first by storey distance from the reticle's storey,
  then by the usual plan distance. A riser ranks by the nearer of its two storeys. Grip therefore
  cycles outward. The LEFT stick-y storey teleport (below, controls) moves "my storey" too.
  A first version filtered strictly to the reticle's storey, which made a basement
  breaker → upstairs outlet wire impossible (owner-reported), so do not reintroduce the filter. The
  earlier ground-datum plane put the reticle a whole storey (or more) away, or behind the ray from
  the basement, so conduit and wire picking became unusable. Flick down in LEVEL to return to
  the top real floor and restore every editing group.
- `afterFloorChange()` runs after `switchFloor` (vertical thumbstick): it rebuilds the selected
  single-floor or stacked overlay. It re-shows the LEVEL pad only for real floors (the
  `refreshFloorEditState` reset hides it first).
- **Stacking gotcha**: a storey's elevation is driven by the floor *below*. To lift the Upper
  overlay, edit the **Ground** height; to drop the Basement, edit the **Basement's** height.
  Editing the topmost floor's own height moves nothing.
- **Cross-floor size constraints are impossible by construction** — `edgeAtPoint` only scans the
  active floor's rectangles and constraints are stored per floor.
- The shared pointer reticle is two-sided, so the selected storey's target remains subtly visible
  through its translucent overlay when the user views it from another storey (for example, Upper
  from Ground).

## Plan sheets (printing / SVG) — `src/io/planSheet.js`

A to-scale floor-plan sheet, one per floor, drawn from the parametric model (never stored;
recomputed like the mesh). **One set of draw calls feeds two backends** so the preview can
never diverge from the print: `svgBackend()` emits a self-contained SVG string (desktop
print + download, AR blob download); `canvasBackend()` draws to a 2D canvas (the in-AR live
preview, `floorToCanvas`). Everything is computed in **page millimeters** (SVG viewBox is mm;
the canvas backend multiplies by a px-per-mm factor) — so annotation sizes (text, dim offsets,
arrows) are fixed PAPER sizes and stay legible at any scale, while geometry obeys the ratio.

- Orientation is chosen from the union of authored rectangles/markers only; movable dimension-line
  and label positions cannot flip the complete set between portrait and landscape. Scale then fits
  the full geometry-plus-annotation bounds and rounds the ratio denominator upward to a whole number
  (`1:56.7` → `1:57`) so it remains inside the default A4 page. `sharedScaleSheetOptions` supplies
  that same project-wide transform to
  multi-floor printing, single-floor SVG download, and the AR preview/download. Every rendition
  therefore has identical scale, orientation, and origin for physical superposition. Content =
  footprint bbox ∪ rect bounds ∪ markers; a fixed margin reserves room for dims/legend/scale bar.
- Draws: the **computed footprint** (`computeFootprint`, holes cut by nonzero winding); distinct
  black-and-white **semantic zone symbols** over their authored cutouts — door/window/**half-wall**/
  **heater** (radiator-fin)/**sliding** all from the shared `apertureGlyph.js` module, plus stairs and
  cabinet — with a separate per-floor zone legend row; the
  **edge↔edge structural dimensions** (via the shared `edgeLineWorld`, `src/core/dimline.js` —
  edge↔origin refs have no drawable edge and are skipped, matching the 2D editor); the
  **marker floor-pin dimensions** (`drawMarkerPins`, black dashed linework) — the surveyed
  distance from a wall/origin to each marker, i.e. *where to place the fixture*, terminating at
  the glyph. Their line, value-box border, and value are black; **markers + a legend**
  (`drawMarkerGlyph` per type, shared by plan and legend). Markers
  form a bracketed **fixture stack** instead of obscuring each other. Vertical stacks require strict
  equality of both plan coordinates (`x` and `y`); horizontal stacks require strictly equal heights
  and use connected 80 mm-inclusive plan-neighbor links.
  Inside that callout, markers connected by 80 mm-inclusive full-3D neighbor links share an outlined white box: same-height
  neighbors form a horizontal box with one height label; different-height neighbors form a vertical
  box with one label per glyph. Height groups farther apart remain separate boxes on the same bracket
  (for example, 1.17 m → 1.09 m → 1.01 m forms one transitive vertical box, while a 0.24 m outlet
  remains separate). Distinct height-group boxes always form one vertical column, highest above
  lowest, even when room-aware placement sends the callout above or below its anchor. Every type keeps
  its own glyph, and boxes/rows are ordered by physical height. The complete callout evaluates
  left/right/above/below placements against the printable footprint and chooses the side inside the
  room; page fit is the fallback for markers without a containing room;
  an isolated marker with a zero-distance constraint to a real edge applies the same four-side room
  test to its height chip. Unconstrained isolated markers retain the conventional chip below.
  and a **scale bar + `1:N · unit` caption + floor name + local `YYYY-MM-DD HH:mm` generation
  timestamp + software build id**. The build id is the Git revision and UTC build stamp injected
  by Vite. A shared print set captures the generation time once, so every page agrees.
  Marker/legend names come from
  `opts.markerLabel` (desktop = English; AR passes `t('marker.<type>')`).
- **Sheets are fully monochrome**: footprint, dimensions, marker pins, conflict dimensions,
  electrical routes, glyphs, and legends use only black/gray/white. Dash patterns and line weights,
  rather than hue, distinguish annotation domains. AR overlays retain their interaction colors.
- **Zero-value dimensions are omitted** (`displaysZero`): any structural or pin distance that
  rounds to `0.00` at the current display unit (coincident edges, a marker sitting on its wall)
  is clutter and isn't drawn.
- **Whole-number dimension and marker-height labels are compacted on the sheet** (`fmtSheetDim`): an all-zero
  fractional part is omitted (`3.00` → `3`, `300.0` → `300`), while non-integers retain the
  configured display precision. For example, centimeter heights `107.0` and `24.0` print as
  `107` and `24`.
- **Output layers are configurable in AR** (7 toggles): PLAN DIMS, MARKER DIMS, MARKER ICONS, WIRING,
  FURNITURE, FURNITURE DIMS, AREA — default on/on/on/**off**/off/off/on. PLAN/MARKER DIMS + MARKER
  ICONS independently control drawing, legend, and scale-fitting participation; FURNITURE controls its
  footprint/symbol/legend in SVG, PNG, and DXF, and FURNITURE DIMS (only when FURNITURE is on) adds
  dimensions anchored to a furniture edge. WIRING (only when MARKER ICONS is on) is the opt-in
  whole-house conduit/wire layer — authoring scaffold, off by default so a contractor sheet isn't
  cluttered. Furniture constraints remain authoring-only and are excluded from all formats even when
  furniture is shown. AREA controls room-area chips in sheets and `ROOM_INFO` entities in DXF.
  Electrical switch-light control routes are tied to MARKER ICONS (not WIRING): hiding endpoint glyphs
  also hides their otherwise contextless links and removes them from sheet scale-fitting and DXF output.
  The model geometry and constraints remain stored and solved.
- **Dimension placement is AR-authoritative**: grip-dragging a value box stores both the line's
  perpendicular `offset` and the box's affine position along the measured span (`labelT`; 0/1 are
  endpoints and values outside that interval are valid). The affine position survives endpoint
  swaps and later geometry edits. Printing uses those same
  values and does not independently push labels or lines around rooms. Constraints without saved
  placement use the normal auto gap and midpoint. Standalone marker heights sit in white knockout
  chips; grouped marker glyphs and their height labels sit inside the fixture stack's white boxes.
- Desktop: `main.js` Print menu → `printSheets()` (hidden iframe, one `@page` per floor) →
  browser Save-as-PDF. Multi-floor print unions every floor's content bounds, chooses one shared
  portrait/landscape orientation, and uses the largest exact scale that fits that complete stack
  (`floorsToSharedScaleSvgs`). Every page therefore has the same paper size, scale, and transform:
  model origin `(0,0)` lands at the same paper point, so printed floors can be superposed to inspect
  overlap. Download SVG uses that same project-wide transform. **Print at 100% for true scale.**
- Verified: the SVG path is rendered + eyeballed (rsvg) on desktop. **The canvas backend
  (AR preview) is build-verified only** — no browser/Quest raster test in CI.

Desktop offers **Download DXF (this floor)** and **Download Coohom DXF (this floor)** via
`src/io/dxf.js`; AR exposes both in **PROJECT · EXPORT**, always targeting the active LEVEL floor.
Detailed DXF is a 1:1, millimetre model-space archive with semantic layers for footprint, zones,
dimensions, markers, areas, and origin. COOHOM DXF is a separate recognition preset containing only
simple 2D LINE entities on WALL and WINDOW layers; doors are left as empty wall openings, while all
annotations, markers, furniture, electrical routes, and unrelated zone types are omitted.

## Coordinate mapping

Plan `(x,y)` → planGroup-local `(x,0,−y)`; planGroup applies `planYaw` + `planPos`. Overlay lift
per floor is a pure Y translation (`overlayY() = planPos.y + activeElevation()`), so
`worldToPlan` (reads x/z only) stays correct on every storey. `worldToPlan`/`planToWorld` invert
through planGroup. HUD `ptr`/`ret` read in registered-origin (plan) coords.

## HUD (controller-mounted panels)

All controller UI uses `depthTest:false` + `renderOrder = HUD_ORDER (100)` so it paints over
world overlays. On the RIGHT editor, stacked above the tip: mode **label**, hover **readout** pill
(dimension value on ray-hover), **debug** HUD, **help** box (per-mode `help` string, set in
`setMode`). The optional LEFT instead carries the enlarged live plan sheet and its own cyan
teleport reticle; no last-active routing remains.

- **Debug HUD** lines: `build:` stamp, `update:`, `fps:` (average + worst frame gap), `draw:`
  (last frame's `renderer.info` calls/triangles, both eyes: no multiview), `time:` (CPU ms in
  `onXRFrame` vs `renderer.render`; both small while fps is low means GPU bound), `ptr:` (tip in plan coords + height above floor), `ret:`
  (reticle floor point), `edge:` (length of the highlighted edge, EDGE mode only), `batt:`
  (`navigator.getBattery()`, hidden if unsupported), plus a transient `EXIT:` hold bar. The HUD
  redraw is **throttled to ~2 Hz** (its canvases re-upload on redraw); the EXIT bar bypasses the
  throttle.

## Performance notes (per-frame cost)

- **Draw calls are drawn twice.** three.js 0.170's `WebXRManager` has no multiview, so every visible
  object renders once per eye; `renderer.info` (the HUD `draw:` line) counts both. On the Quest,
  many small per-item objects, each with its own material/texture, were the real frame cost. PROJECT ·
  PERF measured the per-marker Sprite + floor Mesh (168 CanvasTextures for 84 markers) at ~47 ms of GPU
  per frame on the owner's ground floor; after batching, the owner reports ~90 fps with the whole floor
  in view, and >80 fps in `MARKER · WIRE`. The floor fills/strips were never the problem.
- **Never add an AR overlay layer as one Mesh/Sprite per item.** Use the existing batch patterns:
  - dim + Z-dim labels: `addDimLabelBatch`, an atlas of 256x64 slots plus `makeBillboardMaterial`;
  - markers: `makeMarkerBatch`, a type+ring glyph atlas, one billboard mesh + one flat mesh;
  - conduit: one vertex-coloured run mesh plus InstancedMesh spheres/dots, styled via
    `styleConduitNode`/`styleConduitSegment`;
  - routed wires: a static base mesh plus an emphasis overlay (`styleRoutedWires`).

  Labels and markers keep **invisible proxy `Object3D`s** carrying position + userData for picking,
  grab and drag. They are not Sprites, so code must not assume `.material`. After moving proxies,
  refresh the batch (`refreshMarkerBatches`).
- **Canvas-texture uploads are expensive on Quest.** Every canvas `setText`/redraw must skip unchanged
  content. `makeLabel` guards it; the pads and menus redraw only on hover change; the debug HUD
  refreshes at ~2 Hz.
- **Still per-object:**
  - adjacent-floor targets in conduit/wire/pipe modes: a 12x12 sphere each, 119 on the owner's house;
  - pipes, furniture, and switch→light links.

  Hypothesis: these are the next costs if a mode drops frames. Measure first with PERF.
- **PLAN EDGE picking is deliberate**: every edge inside the reticle is ordered by fixed plan
  geometry (vertical/increasing X, then horizontal/increasing Y). Grip cycles, the first trigger
  locks the highlighted edge, grip can then drag only that locked edge, and the second trigger
  snaps it to the touched wall coordinate. A merely hovered edge is never draggable.
- Dynamically-rewritten highlight meshes (`edgeHi`/`edgeHi2`/`rectHi`) set `frustumCulled=false`
  (their vertices are rewritten in world space each frame; an origin-centered bounding sphere
  would get them culled on head-turn).

## Durable traps

- **`material.color.setHex()` needs a NUMBER, not a CSS string.** `C_WALL1`/`C_WALL2` (`'#22d3ee'`,
  `'#a78bfa'`) are canvas-`ctx` strings for the RECAL badges; passing one to `setHex` gives `NaN` →
  the mesh renders **black**. Highlight/strip colors must be numeric hex (`0x…`). (This bug made the
  RECAL wall strip black; fixed to the numeric `C_RECAL` accent.)
- **The desktop `Sketch2D` stays LIVE during the AR session and re-renders on every
  `project.onChange`.** So any code that consumes `project.constraints` — including the 2D editor —
  must tolerate **marker** endpoints (`{marker}`, no `.rect`) and the **origin** (`rect === ORIGIN_ID`,
  no real edge). A throw in ANY `onChange` listener propagates out of `_emit` and aborts the AR
  caller mid-commit (this silently killed marker-dim commits: `Sketch2D._edgeLineWorld` did
  `ref.rect.id` on a marker endpoint → `undefined.id` → `commitEntry` never reached `buildPlan`, so
  the numpad stayed open and no floor dim drew). Guard edge lookups; skip marker pins where the 2D
  view doesn't draw them.
- **`View3D.setGeometry` rebuilds meshes every change** — MR uses `hideMesh` + `view.house` (the
  floor Group), not `view.mesh`. `mr.js` does NOT use `project.onChange` to rebuild visuals; it
  rebuilds overlays manually via `buildPlan()`/`applyPlanMatrix()`, so any model-changing action
  (incl. LOAD, height edits, floor switch) must call them itself. The sole lightweight subscription
  only invalidates/precomputes the clipboard share-link cache so trigger activation is preserved.
- **The solver can produce negative w/h** unless normalized. `edgeCoord` reads raw x/w while
  every picker/highlight reads normalized min/max; the solver write-back normalizes
  (`src/core/constraints.js`). Don't reintroduce a raw negative-size path.
- **The numpad's SWAP/DEL cells are context-overloaded** (via optional `swapLabel`/`delLabel` args to
  `numpad.draw`). **SWAP** = FLIP (DIMS), field-cycle (band pad), or free↔floor toggle (marker/node
  height pads; inert on the GLB foot pad). **DEL** = "delete the DIM you're editing" (constraint in DIMS; free-Z in the marker/
  node height pads) OR "delete the whole zone/item" (band pad, GLB foot pad). It is **never** the
  object-delete for a marker/node — that's B/Y. Don't assume SWAP == FLIP or DEL == delete-object.
- **Heights are floor-referenced only.** Stored `z` is always the height above the active floor;
  `zDatum` only distinguishes free (unset) from defined (`'floor'`). The ceiling datum was removed
  (s28); `serialize.js` coerces legacy `'ceiling'` + `zOff` to `'floor'`. Don't reintroduce it.
- **Aperture band bounds (`sill`/`head`/`foot`/`top`) reach no PLAN output** — the glyphs, sheet,
  DXF, and legacy mesh export ignore them (only the desktop 3D viewer and AR Z-dims use them).
  Aperture glyphs live in
  `planGroup` (`addApertureGlyphs`), so a door/window/heater/sliding change needs a hand `buildPlan()`
  (mr.js doesn't subscribe to `onChange`); edit glyph shapes ONLY in `apertureGlyph.js` (the print
  page's Y is flipped, so orientation resolves from mapped corners — never baked into the glyph fns).
- **XR reference-space**: in `sessionstart` request `local-floor` AND
  `renderer.xr.setReferenceSpace(localSpace)` (the type setter alone did NOT take through
  ARButton). Read world cam pos from `matrixWorld.elements` ([12],[13],[14]);
  `getCamera().position` stays ~0. The spatial anchor's **full pose** must be applied every frame:
  `planPos` follows its position and `anchorYaw` follows its quaternion. Quest may translate and
  rotate `local-floor` when it relocalizes after the headset sleeps; reading only anchor position
  makes the plan jump or acquire a different orientation. `planYaw` and `navOffset` are stored in
  the anchor frame, so teleport and left-stick viewer-pivot rotation survive that relocalization.
- **Startup placement is provisional**: after three valid viewer-pose frames, the active floor's
  plan origin is placed vertically below the headset, its floor is estimated 1.50 m below the
  camera, and plan +Y follows the viewer's horizontal heading. This makes the plan immediately
  visible on entry; FLOOR/ORIGIN/RECAL remain authoritative and replace/refine that estimate.
- **Don't drive `Object3D.matrix` directly.** With `matrixAutoUpdate=false`, setting `.matrix` does not
  update `matrixWorld` unless `matrixWorldNeedsUpdate=true` is also set, so the object renders stuck
  at the origin while the math is correct. Set `position`/`quaternion` and leave `matrixAutoUpdate` on.
- **`depth-sensing` is deliberately omitted** from the session's optional features. Its automatic
  occlusion is noisy at the floor plane and made the flat plan flicker; placement is touch-based, so
  depth isn't needed. Re-add selectively only if 3D walls ever need occlusion.
- **Remote logging** (`rlog` → dev-only `POST /__log` → `quest-debug.log`, gitignored — never
  stage it) works only on the dev server, NOT on Pages/the APK. The release TWA has **no web
  console** — debug the `?ar=1` page in the plain Quest Browser or Oculus Remote Web Inspector.

## Key artifacts

| Path | Role |
|---|---|
| `src/ui/mr.js` | The whole MR session: modes, HUD, numpad (DIMS + band pad + free/floor height pads + floor-only GLB foot pad), Z-dim visual (`zDimGroup`/`buildZDims`), slot menu, grip-drag (X/Y/Z dim-lock), multi-floor/LEVEL, RECAL, FURNISH, conduit ribbons/nodes, `planYaw`, `?ar=1` auto-AR, thumbstick-hold exit |
| `src/core/model.js` | `Floor` + `Project` (floors[], active/ground); facade to active floor; `_emit` recomputes elevations + solves each floor; constraint ops |
| `src/core/constraints.js` | per-axis weighted least-squares `solve(floor)` (normalizes w/h in write-back); `makeDistance`/`makeOriginDistance`/`ORIGIN_ID`/`edgeCoord`; `c.conflict`; `solveMarkers`/`solveConduitNodes` (one-way pins) (Z is not solved) |
| `src/core/apertureGlyph.js` | **Sole** source of door/window/half-wall/heater/sliding plan glyphs (`doorSwingSegments` etc.) + `resolveApertureOrient`; consumed by planSheet, dxf, AND mr (`addApertureGlyphs`) so they can't diverge |
| `src/core/zoneColors.js` | `ZONE_KINDS`, per-kind colors, `APERTURE_DEFAULTS`, `FURNITURE_BAND`, `isAperture`, `apertureBounds`, `verticalBandFields` (the authoritative band-pad field list) |
| `src/core/translate.js` | atomic rigid floor translation; preserves relative constraints and moves origin locks + authored dimension-label placements coherently |
| `src/io/serialize.js` | `serializeProject`/`deserializeInto` v3 (rectangles [+ `sill`/`head`/`hinge`/`swing`/`foot`/`top`] + constraints + markers [+ `z`/`zDatum`] + electrical links + furniture + height per floor; whole-house conduit/wires + `revision` at top level) — desktop JSON, localStorage autosave, AND the AR slots |
| `src/core/electrical.js` | Shared validation + derived switch→ceiling→light control-route points + `segmentSurface` classifier, consumed by AR, sheets, DXF, and conduit routing |
| `src/core/conduit.js` | Conduit-network graph + Dijkstra `shortestConduitPath` (threads `via`); `wireRouteSegments`/`wireRoutePoints`/`conduitNetworkSegments` — wires route over conduits, path derived not stored |
| `src/io/planSheet.js` | To-scale plan-sheet renderer: canvas + SVG backends, footprint/dims/markers/electrical links/legend/scale bar. `floorToSvg` (print + download), `floorToCanvas` (AR live preview) |
| `src/io/dxf.js` | Layered AutoCAD 2000 DXF exporter in 1:1 millimeter model space, including true-3D electrical routes; shared by desktop and AR |
| `src/core/planDiff.js` | Change-map diff: id-matched, solved-geometry diff of zones/markers/dimensions between a saved-slot baseline and the live project (`diffAgainstSnapshot`); rendered as revision clouds by `planSheet.js`, sheet-only |
| `src/io/outputOptions.js` | Device-local SVG/PNG/DXF/COOHOM DXF/JSON format + 7-toggle output profile (`planDims`/`markerDims`/`markerIcons`/`wiring`/`furniture`/`furnitureDims`/`area`) |
| `src/core/dimline.js` | Shared `edgeLineWorld(ref, rects)` — guarded edge lookup (marker/origin → null) used by both `Sketch2D` and the sheet renderer |
| `packaging/quest-apk.md` | reproduce-from-scratch Quest APK runbook |
