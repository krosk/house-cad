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
MATERIAL · FLOOR → WALL → DOOR → WINDOW → FURNITURE → SWITCH → OUTLET → ETHERNET
PROJECT  · TRANSLATE → SAVE → LOAD → EXPORT → UNIT → LANG → PERF
```

The headset label and help header show the localized `GROUP · TOOL` breadcrumb. Controller
navigation remains one fast linear cycle across the rows above (thumbstick-x, both ways); group
presentation adds hierarchy without remapping any contextual buttons or thumbstick-y actions.
The single source of truth for order is `MODE_ORDER` (which sorts the `modes` array) and `MODE_GROUP`;
IDs in that traversal order are `register`, `floor`, `level`, `recal`, `teleport`, `drop`, `edge`,
`plan_dims`, `edit`, `marker`, `outlet_dims`, `marker_link`, `marker_conduit`, `conduit_dims`,
`conduit_edit`, `marker_wire`, `marker_pipe`, the MATERIAL modes, `copy_floor`, `paste_floor`, `move_up`, `move_down`,
`translate`, `save`, `load`, `export`, `unit`, `lang`. **`MODE_HIDDEN`** = `{copy_floor, paste_floor,
move_up, move_down}` — those four stay fully defined and functional (drivable programmatically) but
are removed from the thumbstick-x cycle to keep the list short, so they do **not** appear in the
diagram above. Un-hide by deleting an id from that set. **TRANSLATE now lives in the PROJECT group**
(not PLAN). **FURNISH was removed** (owner, 2026-09-27: it overlapped MATERIAL · FURNITURE); a
furniture product is now a FURNITURE zone drawn in PLAN · ADD, given its product in MATERIAL ·
FURNITURE.

Modes are DATA in the `modes` array (each has `id`, `color`, `onTouch`; the label + help text
come from i18n keyed by `id` — `t('mode.'+id)` / `t('help.'+id)`, see Localization below).
Per-frame mode visuals/highlights are the big if/else chain keyed on `modeId` near the end of
the animation loop. `setMode` resets in-progress gestures and activates/deactivates the numpad
(both DIMS modes + LEVEL) or slot menu (SAVE/LOAD). No code hardcodes a mode *index* beyond `setMode(0)`
(= ORIGIN at session start); everything else is keyed by `id` or `currentMode ± 1`.

- **FLOOR** — calibrate the shared ground datum `floorY` by touching the real floor of whichever
  storey is active. The active floor's derived elevation is subtracted from the touch, so an upper
  floor or basement calibrates the same datum without double-counting its vertical offset.
  FLOOR changes **only the height** (`regroundAt`, owner 2026-09-30: calibrating after a teleport
  sent the user back to the origin). It re-anchors through `placeAt`, then restores the teleport
  (`navOffset`, kept as the plan's world X/Z), the ALL FLOORS `navLift`, and the plan's world yaw
  (the old anchor's `anchorYaw` folds into `planYaw`, since the new anchor has identity yaw; without
  that, a FLOOR touch after a Quest relocalization would also turn the plan).
- **LEVEL** — per-storey height + floor switch (see Multi-floor below).
- **SETUP · TELEPORT** (`id: teleport`) — aim the pointer reticle at the active floor and trigger
  to bring that plan coordinate beneath the headset. WebXR cannot move the physical passthrough
  camera, so this applies a horizontal `navOffset` to the CAD frame while preserving the surveyed
  `planPos`, yaw, and XR anchor. ORIGIN/RECAL (`placeAt`) clear the navigation offset; FLOOR keeps it.
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
  billboard. With nothing selected, **grip cycles every marker in the reticle** (a stack at one
  point and near neighbours alike; before 2026-09-29 only an exact-point stack) and trigger confirms
  the yellow candidate: the shared grip cycle, see **Grip cycle** under MARKER · WIRE. A selected
  marker stays the target while it is in the reticle. Both the selected floor
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
- **Double switch marker** (owner decision, 2026-09-28, supersedes the two-marker convention below for
  new surveys). `switch_dual` is ONE marker (MARKER · EDIT type list, after `switch`) with its own glyph
  in AR, View 3D, the sheet and DXF (`MARKER_SWITCH_DUAL`). Each control link from it stores the rocker
  that drives the light (`link.rocker`, 1 or 2; absent = 1; `isSwitch`/`linkRocker` in
  `src/core/electrical.js`). Rocker 1 is the **left** one facing the switch and 2 the **right**; every
  UI string and the sheet say left/right (owner, 2026-09-29), storage keeps 1/2. In **LINK**, a selected
  double switch starts on the left rocker and **thumbstick up/down swaps the rocker** (readout
  `PICK LIGHT · ROCKER LEFT|RIGHT`); its routes on the rocker
  being linked are amber, the other rocker's pink, and its lights are outlined cyan / pink the same way.
  Triggering a light already on the other rocker moves it to this one. The sheet puts a small `L`/`R`
  chip on each double-switch leg near the switch. **Wires land on a rocker too** (owner, 2026-09-29: two
  independent circuits wired through one double switch were joined into one, a false cross-tie): see
  `docs/electrical-workflow.md` "Double switch: one terminal per rocker". Retyping a double switch to a
  single one keeps its links and wires (rockers dropped, so its wires join one terminal again). Only a two-rocker product fits it (MATERIAL · SWITCH filters the list).
  **Converting an old pair:** select the double switch in MARKER · EDIT (retype one of the pair) and,
  when a plain switch sits at exactly its point and height, the readout offers `A/X: MERGE…`: A/X makes
  that switch its right rocker (its lights and wires move over onto the right rocker, its conduit/pipe
  bindings move over; its dimensions go), see
  `Project.mergeSwitchPair`. It is explicit because retyping steps through the type list, so an
  automatic merge would fire just by scrolling past DOUBLE SWITCH.
- **Stacked devices** (owner decision, 2026-09-26; still loads and works). A double switch was authored as
  **two switch markers at the same point**, one per rocker. Circuits alone would not need that: one marker is correct when both
  rockers share a feed. But a LINK goes from a switch marker to a light, so two rockers driving two lights
  need two markers. **Do not draw stacked markers apart in AR.** That was considered and rejected: the floor
  icon, reticle pick, marker dims and sheet all use the shared point, so a display-only offset would put
  glyphs where the data is not. Instead, when the hovered marker shares its plan point with others
  (`markerStackInfo`), the controller readout adds `<type> i/n → k× light`: its place in the stack,
  top to bottom, then authoring order, counting every marker at that point, e.g. shutter 214 cm,
  2 switches 109 cm, outlet 24 cm = 4. In a mode with a grip cycle that line is replaced by the
  cycle's own `i/n` (**Grip cycle**, which counts near neighbours too) and keeps the `→ k× light`;
  the stack line remains where no cycle line shows (a selected marker, CHECK). The lights it controls
  are outlined cyan in every mode except LINK, which already shows them. MARKER · CHECK folds `i/n`
  into its hover line.
  **Overlap count badge** (owner, 2026-09-28): so an overlap is visible without hovering, a small
  amber disc with the count sits at the top-right corner of the icons drawn on top of each other:
  on the floor icon when markers share the plan point (any heights), and on the wall glyph when they
  also share the height (e.g. a double switch). Drawn in the same two marker batches (no extra draw
  call); not pickable; during a live grip-drag it stays at the old point until the release rebuild.
  **Same point = same double** (trap, 2026-09-28). One solved stack differed by float noise: in
  the owner's house an Ethernet at 132 cm had `y = -0.3700000000000021` and its switches
  `-0.37000000000000216`. Strict equality split it into a 2-stack plus a lone marker, so the EDIT
  grip cycle jumped with whichever was nearest the hand, and the badge read "2". Fixed at the root:
  every stored length is on a 0.1 mm grid (CLAUDE.md "Units"), so the stack is bit-identical and
  `===` holds everywhere, sheets included. AR stack groupings also accept 0.1 mm (`samePlanPoint` in
  `mr.js`) as a second guard.
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
  highlighted; **grip over a target cycles the combined overlap stack (devices, nodes and runs to split)
  without changing geometry**, and trigger commits only the highlighted target. The grip choice is
  sticky (2026-09-28): it stays highlighted while it remains under the reticle, and grips walk the stack
  in a fixed order (devices, nodes, runs; high to low), because re-sorting by distance each frame made
  the cycle jump with hand jitter. Leaving it, or committing, returns to nearest-first. Grip over a
  lone target does nothing (it no longer lifts the pen). Trigger empty space to drop a junction (X/Y from the
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
  yellow); triggering one runs a segment across the slab — a **riser**. Those dots are two
  InstancedMeshes (devices, junctions), never one mesh each: per-dot meshes were 146 draw calls on
  the owner's Ground floor and PERF put the layer at ~12 ms with CONDUIT at 30 fps (2026-09-28). The network is drawn live in
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
  immovable** (they follow their device) and have no pad. **A selected conduit segment shows its length**
  on the readout (`LENGTH`, 3D, so a vertical drop or a riser counts), plus `RUN <len> (<n>)` when it is
  part of a longer run: the chain continues through bare junctions with exactly two segments and stops
  at a device, a branch or an open end; a closed loop counts each segment once (`conduitRunLength`,
  `core/conduit.js`; owner, 2026-10-01). **B/Y deletes only the explicit selection**:
  a selected node + its incident segments, or a selected conduit segment alone (`deleteInMode` →
  `removeConduitNode` / `removeConduitSegment`; `via` references are dropped). A node with exactly two
  segments is a pass-through, so its neighbours are **rejoined by one segment** and the run survives
  (owner, 2026-09-29); a branch node (3+ segments) loses them all. Readout: `PICK NODE / CONDUIT`,
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
  **Grip cycle** (shared, owner 2026-09-29: `gripCycle` in `mr.js`, used by MARKER · EDIT, LINK,
  WIRE, CONDUIT · EDIT and MATERIAL · SWITCH/OUTLET/ETHERNET; MARKER · CONDUIT keeps its own
  equivalent `conduitPickRing`). The yellow target is **sticky**: it stays highlighted while it
  remains in the reticle, even when the reticle jitters or new items enter it; with none, the
  nearest wins. Only grip advances (a one-shot request consumed that frame), stepping a **fixed ring**
  (storey rank, kind, plan x, y, top to bottom, authoring order), so repeated grips walk every
  candidate once. When the cycle holds 2+ targets, the readout's last line (yellow, `gripPick`)
  names the target and its place in that ring: `<device type> i/n`, `wire <nature> i/n`,
  `node i/n`, `conduit i/n`; a stacked switch keeps its `→ k× light`. Because the ring is fixed,
  `i` doesn't jitter with distance. A selected wire's readout adds `CIRCUIT <len>` and, when
  non-zero, `SHARED <len>` in the other nature's color (definitions in `docs/electrical-workflow.md`).
  The readout pill takes up to 4 lines at full size, 6 tighter (`makeLabel(128)`). Every controller
  pill (mode label and readout) **widens to fit its longest line** at the normal font (owner,
  2026-09-30: long material names were cut off), from 256 up to `LABEL_MAX_W` = 576 canvas px at the
  same pixel density (readout 0.2 → at most 0.45 m wide), and only past that shrinks the font (16 px
  minimum). 576 was chosen from glyph advances read from the font files, not a per-character
  average: the longest catalog name is 468 px (Noto Sans Bold) or 532 px (DejaVu Sans Bold, wider)
  at 16 px, within the 536 px text area; 37 of 46 Latin names fit at the full 24 px. A width change swaps in a new CanvasTexture (three may allocate fixed storage per size);
  it happens only when the text changes. Lengths are memoized per selection and
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
- **HEATING · PIPE** (`id: marker_pipe`; the HEATING group since 2026-10-01, was MARKER · PIPE) — author a separate whole-house plumbing graph. Trigger a
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
- **HEATING · HEAT LOSS** (`id: heat`; method and defaults in `docs/heat-loss.md`) — every heated room
  of the active floor shows its loss in W at its largest rect's centre. A panel holds THIS FLOOR
  (heated, unheated temperature, added floor and attic R) and WHOLE HOUSE settings (design outdoor /
  indoor °C, air changes, bare wall R, window and door U, bare slab R, λ for an insulation zone with no
  R). Ray on a row + thumbstick-y steps it (up = more); trigger toggles HEATED or resets a value to its
  default (defaults grey, authored values orange). Aiming the floor shows the room under the reticle
  broken down by surface. Settings are project data (saved, autosaved). Not offered in ALL FLOORS.
- **HEATING · R / U** (`id: heat_r`) — every INSULATION zone of the active floor shows its R
  (m²K/W; grey `≈` = drawn depth / λ) and every WINDOW / SLIDING / DOOR / GARAGE zone its U (W/m²K, the
  label's Uw / Ud; grey `≈` = the project's Window or Door U); orange = typed. The readout names the
  aimed zone's value and its source. Trigger on a zone opens the numpad: ENTER sets it (an empty ENTER
  or CLEAR returns to the default). An insulation R can also be typed on the PLAN · EDIT band pad.
  Not offered in ALL FLOORS.
- **MARKER · DIMS** (`id: outlet_dims`) — marker pins only. The first reference must be a marker's
  projected floor icon; only then do plan edges become eligible for the second reference. Plan
  dimensions cannot be selected or changed.
- **Material card** (owner, 2026-09-30; `src/ui/materialCard.js`). In every MATERIAL mode, holding
  **LEFT grip** shows the target's material card instead of the print sheet, at the sheet's place and
  draw order. It follows the hovered or selected target, and updates as thumbstick-y cycles.
  - Floor/wall finish: a square patch of the real texture (the same painted texture as the AR 3D view,
    one cache `finishMapFor`), about three pieces across, 1–3 m (`swatchSpan`; a stepped layout counts
    its 50 cm tile, not its 1.0 × 1.1 m module), with a scale bar. Paint shows its flat colour.
  - Door, window, switch/outlet, furniture: the 3D product on a slow turntable, starting face-on
    three-quarter, fitted to the card, with its overall W × H × D. A door/window is built from its zone's
    own placement (width, heights), closed.
  - Nothing targeted: the mode's hint; no material: `none`.
  - A new target waits 0.3 s before building (`CARD_SETTLE_MS`), so flicking through the catalog paints
    only where the stick stops (five cards painted in ~1 s on desktop; Quest slower). `material card`
    in the debug log gives the build time.
  - Draw order: the card is in the transparent pass at 90 like the sheet; the model uses its own
    transparent clones of its materials at 92 (three draws opaque before transparent, and the
    originals are shared with the AR 3D view).
- **MATERIAL · FLOOR / WALL** (`id: mat_floor` / `mat_wall`, its own group; design and owner decisions
  in `docs/materials.md`). Active floor only; locked in ALL FLOORS.
  - **FLOOR:** trigger selects the room component under the reticle.
  - **WALL:** trigger selects the room wall face nearest the reticle (within 0.6 m, on the room side).
  - **Both:** thumbstick up/down cycles the selection's material (none, then the catalog for that surface)
    and applies it at once; B/Y clears it. Each wall face is set on its own: a copy-to-every-wall action
    was built and removed at the owner's request (2026-09-26); don't re-add it.
  - **FLOOR layout (A/X, `floorLayoutPress`):** with a room selected, A/X near a corner (within 60 cm,
    or 35 % of the region's short side in a small room) starts its laying region's pattern at that
    corner (`project.setFloorAnchor`); A/X on that same corner returns it to the plan origin. An amber
    L (25 cm along each wall) marks the corner, and the quantity line ends with `⌞ CORNER`. A/X away
    from the corners turns the region's pattern 90° (`project.setFloorTurn`, toggles; `↻90°` on the
    quantity line). A/X, not the thumbstick, because the thumbstick already cycles the material and
    A/X is the flip/turn button in every other mode.
  - **Display:** every target that has a material shows **one small swatch badge** (a 6 cm disc in the
    material colour inside a white ring, `matBadge`) at the centre of its plan box, **never a coloured
    fill or strip** (owner, 2026-09-27: full overlays made the plan hard to read). Room: the centre of
    its largest rect; wall face: the middle of its longest visible run, 12 cm into the room; DOOR /
    WINDOW / FURNITURE zone: its centre; device: under the marker (SWITCH/OUTLET/ETHERNET only). All
    badges are one batched mesh (`buildMaterials`). The yellow hover/selection highlight is a second
    mesh, rebuilt only when the target changes.
  - **Readout:** material, then this floor/face's `m² · pcs` (+ cabochons), then the whole-house
    `HOUSE <packs> packs`.
  - **DOOR** (`id: mat_door`): trigger selects the DOOR zone under the reticle (or within 0.3 m);
    thumbstick-y cycles door products (none first), B/Y clears. The zone tints in the product colour;
    the product itself shows in the AR 3D view (LEFT X). Readout: product, opening `width × head`,
    `MADE TO MEASURE`. Design in `docs/materials.md` "Doors".
  - **WINDOW** (`id: mat_window`): the same for WINDOW zones and `surface: 'window'` products (shares
    the DOOR code path through `APT_KIND`). Readout: product, `width × (head − sill)`, `1 LEAF` /
    `2 LEAVES` (the zone's hinge: both = two), `MADE TO MEASURE`. Design in `docs/materials.md`
    "Windows".
  - **FURNITURE** (`id: mat_furniture`): the product of a FURNITURE zone (owner, 2026-09-27;
    `docs/furniture.md` "merge"). Trigger selects the zone; **thumbstick up/down** cycles the
    furniture catalog (none first; stored as the zone's `article` + a `productMm` size snapshot);
    **A/X turns it 90°** (`facing`; the footprint swaps about the zone's centre); B/Y clears it (the
    zone keeps its size). Shares the DOOR code path (`APT_KIND`), with its own branches in
    `cycleMaterial`/`materialReadout`/`deleteInMode` because the choices come from the furniture
    catalog, not `materialsFor`. Readout: product name, `w × d × h`, `A/X: TURN 90°`. A product
    zone shows a violet badge in every MATERIAL mode.
  - **SWITCH** (`id: mat_switch`): trigger selects the switch marker within the reticle; where
    switches overlap (a stack at one plan point, or neighbours in the reticle), **grip cycles** them
    first (owner request, 2026-09-27), and the readout shows `n/N · GRIP: NEXT`. Thumbstick-y cycles
    switch products (none first), B/Y clears, grip deselects. Hover outlines the marker yellow, the
    selection amber; switches carrying a product get a teal floor square. The product shows in the AR
    3D view (LEFT X). Readout: product, height. A double-switch product applies to every switch at
    that plan point (the double is two markers) and draws once. Design in `docs/materials.md` "Switches".
  - **OUTLET** (`id: mat_outlet`): the same for socket outlets (`outlet`, `outlet_appliance` markers) and
    `surface: 'outlet'` products.
  - **ETHERNET** (`id: mat_ethernet`): the same for single Ethernet sockets (`ethernet` markers) and
    `surface: 'ethernet'` products.
  - **Takeoff timing:** `materialTakeoff` reruns only on mode entry and after each edit (no `onChange`
    subscription in mr.js).
- **Furniture** (no mode of its own; FURNISH was removed 2026-09-27 as overlapping): draw a FURNITURE
  zone in PLAN · ADD, give it a product in MATERIAL · FURNITURE (docs/furniture.md "merge"), then
  dimension, move, turn (A/X) or delete it in PLAN like any zone; foot/top on the band pad. The models
  (IKEA through the Cloudflare Worker proxy, or procedural) draw in `furnitureGroup` at each product
  zone's centre, lifted by its foot, turned by its facing, **only while the AR 3D view is on
  (LEFT X)**; otherwise as flat plan pieces with the front notch (`furniturePlanGroup`).
  `buildFurniture` runs from every `buildArch3d` (so every `buildPlan`) and returns early when the
  placements haven't changed. The old free-placed items (`floor.furniture[]`) migrate to zones on load.
  **Furniture dimensions are solved one-way after the structure**; one that no longer fits is removed
  and the mode label flashes `DIM REMOVED · <miss>` (`checkRemovedDims`, polled per frame).
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
  **With the AR 3D view on (LEFT X)** the sweep switches to the 3D view's parts (`PERF_LAYERS_3D`,
  owner request 2026-10-03, after 226 calls facing a radiator and a bin): `struct` (walls, plain
  doors/windows, stairs, ceiling), `finish`, `doorwin` (door and window products), `device`
  (switch/outlet/Ethernet products), `furn` (furniture models) and `plan` (the rest of the plan
  group). One per HUD line, each with its ms and its **draw calls** (both eyes; `renderer.info`
  read in `scene.onAfterRender`). Toggling the 3D view restarts the sweep on the other list.
  **Clipboard report** (owner, 2026-10-03: "you can pass a lot more detailed information"): after
  each full cycle the sweep has a plain-text report ready (`perfReport`): build, view, mode, time
  source, floor, fps and the `time:` CPU split; per layer its cost in ms, calls and triangles, the
  raw time without it, and its content (meshes, triangles, material kinds); in the 3D view the 40
  biggest meshes with their layer and material; the floor's counts (zones, markers, device
  products, dims, finishes, furniture); the renderer (geometries, textures, shader programs), the XR
  framebuffer size, foveation, frame rate, GPU name and user agent. **It is copied only by the
  trigger that stops PERF** (owner, 2026-10-03): clipboard writes need a user gesture, and that
  trigger's XR `select` event is one (the same activation the EXPORT LINK copy uses). The HUD header
  ends with `trigger to copy` once a full cycle is ready; the mode label flashes `PERF COPIED` or
  `PERF COPY FAILED (<error name>)`. **Built at the cycle's end, copied with nothing else first**,
  like the EXPORT LINK's warmed URL: the first version built the report inside the trigger and the
  Quest refused it (owner, 2026-10-03: PERF COPY FAILED while LINK copied). No download fallback
  (owner: "make it work like link"). **Hypothesis:** the work done inside the trigger before
  `writeText` was the difference; unverified.

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
  while the grip remains pressed (in MATERIAL modes the grip shows the **Material card** instead). It sits directly above the controller in a neutral upright pose;
  when the controller has no rotation, the sheet is a vertical plane facing back toward the user.
  Its solid-white canvas renders in the transparent pass at order 90: after all world plan tints,
  markers, dimension labels, and edit panels, but before the right-controller HUD at order 100 and
  the shared panel ray-pointer at order 110. The pointer itself is explicitly transparent-pass;
  making it opaque would force it before the canvas panels regardless of `renderOrder`.
- RIGHT **trigger** = mode action (place / pick / press a numpad or slot key). LEFT trigger = teleport.
  **LEFT X** toggles the **AR 3D view** (owner choice, 2026-09-26; `toggleArch3d`/`buildArch3d`). This is
  the desktop `architectural3d.js` interpretation for the floors on show (active floor, or all in
  ALL FLOORS): walls, door/window inserts, stairs, crease outlines, and the textured finish overlays
  from `docs/materials.md`. The real floor stays visible (no wood slab). Since 2026-09-27 (owner: the
  real room showed through) the **ceiling** draws as opaque white paint (the storey-height slab, matte
  Lambert) and **window glass**, plain panes and window products alike, is opaque and shows one generic
  daylight exterior per pane (`src/ui/exteriorView.js`: sky, clouds, tree line, lawn; unlit, so it stays
  bright). Desktop View 3D keeps its transparent glass and POV-only plaster ceiling. It uses Lambert
  materials under the shared scene lights, with no shadows. It rebuilds with every `buildPlan` and
  after a MATERIAL edit, only while on. Off by default; it is not a mode, so it works in any mode.
  Its frame cost is unmeasured: check PROJECT · PERF with it on.
  **While it is on, only the 3D model shows** (owner, 2026-09-27): every other `planGroup` child
  (zone fills, plan/constraint dims and labels, marker glyphs, Z-dims, electrical/pipe/material/check
  layers, furniture plan pieces) and the origin gizmo are hidden **for the render only**
  (`hideForArch3d` after `onXRFrame`, `restoreAfterArch3d` from `view.onXRAfterRender`), so every
  mode's own visibility logic is untouched. The reticle, pointing highlights, HUD, numpad and menus
  stay, so aiming and editing still work, but target feedback that lives in the plan layer (e.g. the
  MATERIAL yellow highlight, material badges) is hidden too; the readout still names the target.
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
  in 3D at its initial pointer depth; CONDUIT EDIT over a bare node = move it).
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
  **MATERIAL · FURNITURE** = the selected zone's product; **PLAN · ADD** = the kind to add over `ZONE_KINDS`
  (room/wall/insulation/door/passage/garage/halfwall/heater/sliding/window/stairs up/stairs down/cabinet/furniture, `cycleZoneKind`);
  **PASSAGE** is an open doorway with no leaf (jambs + dashed lintel on plans; floors meet at its middle like a door)
  **PLAN · EDIT** = the selected zone's kind (`cycleSelectedZoneKind`); **EXPORT** = the SVG/PNG/DXF/
  Coohom/JSON format, UNLESS the ray points at the panel's COMPARE row (→ cycles the change-map
  baseline) or LANGUAGE row (→ cycles the sheet language), which take precedence.
  **thumbstick-hold (~1.2 s)** =
  exit AR.
- **Neither face button cycles modes** (mode nav is thumbstick-x, both ways; prev-mode on A/X was
  removed as an asymmetric one-off). **A/X = FLIP or ROTATE**: in either DIMS mode with a completed
  pair it flips the dimension side (`flipConstraintSide`, NOT `swapConstraint`); in TRANSLATE it flips
  the pending coordinate side; **in PLAN · EDIT with a selected aperture it rotates that aperture**
  (`rotateAperture`, gated on `edit` mode so it does not collide with the DIMS/TRANSLATE flip), and a
  FURNITURE zone turns its product 90°; in MATERIAL · FURNITURE it turns the selected product; inert
  otherwise. **B/Y = DELETE** the mode's selected/hovered item where applicable:
  in DIMS it removes the dimension constraint (`deleteDimContext` — a completed pair, else a hovered
  existing dim label); elsewhere `deleteInMode` (PLAN EDIT zone, MARKER, a MATERIAL product, CONDUIT EDIT
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
- **Stair treads in 3D (owner, 2026-10-01):** a stair zone holds only the steps drawn in it, and they
  **start at its own floor**: STAIRS UP rises from the floor, STAIRS DOWN descends from it, at a fixed
  **18 cm riser** (`STAIR_RISER`). Step count = the zone's run / `STAIR_GOING` 25 cm (Hypothesis: a
  common going, not measured), capped at the storey height. A flight split across two storeys is one
  STAIRS UP below + one STAIRS DOWN above; their steps add up (owner's house: 8 + 8 risers = 2.88 m for a
  2.95 m storey). Before this every zone climbed the full storey height, far too steep in a short zone.
  View 3D shares the geometry (`architectural3d.js`).
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
  (like `CONDUIT · DIMS` pins; was purple in s28) shown only while the conduit network is (CONDUIT, CONDUIT
  EDIT, WIRE, CONDUIT · DIMS; `buildZDims` reads `conduitGroup.visible`, and leaving those modes rebuilds
  the dims without them), apertures blue: floor→sill and floor→head as two
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

- **Every planGroup overlay group must be in `PLAN_OVERLAY_GROUPS`** (Proven bug, fixed 2026-09-26).
  `clearPlanGeometry` removes every planGroup child it doesn't keep. Its old hand-written skip list
  missed `zDimGroup`, `adjacentGroup`, `checkGroup` and `materialGroup`, so the first plan build
  detached them. Z-dims, adjacent-floor target dots, CHECK rings and MATERIAL tints then never rendered,
  while picking kept working because it reads the groups' children directly. A verbatim Node run of
  `clearPlanGeometry` proved both the bug and the fix.

- **Draw calls are drawn twice.** three.js 0.170's `WebXRManager` has no multiview, so every visible
  object renders once per eye; `renderer.info` (the HUD `draw:` line) counts both. On the Quest,
  many small per-item objects, each with its own material/texture, were the real frame cost. PROJECT ·
  PERF measured the per-marker Sprite + floor Mesh (168 CanvasTextures for 84 markers) at ~47 ms of GPU
  per frame on the owner's ground floor; after batching, the owner reports ~90 fps with the whole floor
  in view, and >80 fps in `MARKER · WIRE`. The floor fills/strips were never the problem.
- **AR 3D view products are merged per material** (`src/ui/mergeByMaterial.js`). The owner saw the
  `draw:` line jump from ~150 to ~1000 calls facing the furnished living room (2026-10-03). Products
  are many small meshes: a Héméra window 25–43, an Ovalis outlet 10, a towel radiator 39–49, the
  piano 27. `buildArch3d` merges every door, window, finish and device product of the floor into one
  mesh per shared (cached) material, and `instantiateFurniture` merges each furniture model the same
  way. **Proven** (Node, 2026-10-03): 3 window products 115 → 9 meshes, 10 outlets 100 → 6, the
  towel radiator 49 → 3, the piano 27 → 6, same triangles and exact bounds. **Hypothesis:** the
  living room drops back near its old count; unmeasured on the Quest. A new product builder needs
  nothing extra, but a product material created per call (not cached) would not merge across items.
- **Device products are built at `low` detail in AR** (`docs/materials.md` "Two detail levels"). The
  owner's fps fell to 10 in the kitchen with 34 Ground device products: they were 97 % of the AR 3D
  view's triangles (180k of ~190k, Node count of the owner's 2026-10-03 export), mostly sub-pixel,
  and since the merge they are drawn wherever you look. **Hypothesis:** those triangles were the
  frame cost; unmeasured (PROJECT · PERF `device` in the 3D list will show it).
- **Open: the plan may still be drawn under the AR 3D view.** Two PROJECT · PERF reports on the
  owner's Ground floor (2026-10-03, build d00be61) gave identical, deterministic per-layer calls that
  match each layer's meshes × materials × 2 eyes, and `plan` cost 90 calls and 58.9k triangles,
  exactly twice the plan group's content, although `hideForArch3d` should leave nothing to hide.
  **Hypothesis:** some plan objects stay visible in the 3D view; the code path (hide in
  `view.onXRFrame`, restore in `onXRAfterRender`) reads correct, so the cause is unknown. The same
  content ran at 23 fps then at 82 fps minutes apart (CPU 0.6–0.7 ms js, 2.7–3.0 ms render), so the
  frame rate depended on something outside the scene (Hypothesis: headset GPU clock / thermal state).
  The owner chose not to pursue it (fps 50–80 is fine). To resume: record, in `perfBeforeRender`,
  which `planGroup` children are visible while `arch3dOn`, and put them in the report.
- **AR furniture is drawn with Lambert copies of its materials** (`arLambert` in `mr.js`), like the
  rest of the AR 3D view: colour, map, emissive, opacity kept; roughness, metalness, bump and normal
  maps dropped, a metal's colour darkened by `0.6 × metalness` to stay close to its unlit PBR look.
  Owner, 2026-10-03: fps dropped when a radiator and the bin came into view. **Hypothesis:** PBR
  per-pixel shading on large close surfaces was the cost (the products are only 2–11k triangles);
  measure with PROJECT · PERF (`furn` in the 3D list). Desktop View 3D keeps the PBR materials.
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
| `src/ui/mr.js` | The whole MR session: modes, HUD, numpad (DIMS + band pad + free/floor height pads), Z-dim visual (`zDimGroup`/`buildZDims`), slot menu, grip-drag (X/Y/Z dim-lock), multi-floor/LEVEL, RECAL, FURNISH, conduit ribbons/nodes, `planYaw`, `?ar=1` auto-AR, thumbstick-hold exit |
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
