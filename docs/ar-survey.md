# AR survey reference (`src/ui/mr.js`)

Stable operational detail for the Quest MR survey surface. This is the settled "how the
AR tool is put together" reference; the live "where are we / what next" doc is
`.claude/handoff.md`. Deep rationale lives in Claude memory (`phase5-xr-intent`,
`multi-floor-design`, `ar-2d-parity`, `quest-guardian-limitation`). Packaging is
`packaging/quest-apk.md`. Core (non-AR) architecture is `CLAUDE.md`.

AR (`src/ui/mr.js`) is the **only** authoring surface on the Quest — the immersive APK exits
AR by quitting, there is no 2D editor on-device — so it must reach parity with the desktop 2D
editor (`ar-2d-parity` memory).

## Mode hierarchy (tools with stable `id`s)

```text
SETUP    · REGISTER → FLOOR → LEVEL → RECAL → TELEPORT
PLAN     · ADD → EDGE → DIMS → EDIT
MARKER   · EDIT → DIMS → LINK → CONDUIT → CONDUIT DIMS → CONDUIT EDIT → WIRE
FURNISH  · FURNISH
PROJECT  · TRANSLATE → SAVE → LOAD → EXPORT → UNIT → LANG
```

The headset label and help header show the localized `GROUP · TOOL` breadcrumb. Controller
navigation remains one fast linear cycle across the rows above (thumbstick-x, both ways); group
presentation adds hierarchy without remapping any contextual buttons or thumbstick-y actions.
The single source of truth for order is `MODE_ORDER` (which sorts the `modes` array) and `MODE_GROUP`;
IDs in that traversal order are `register`, `floor`, `level`, `recal`, `teleport`, `drop`, `edge`,
`plan_dims`, `edit`, `marker`, `outlet_dims`, `marker_link`, `marker_conduit`, `conduit_dims`,
`conduit_edit`, `marker_wire`, `furnish`, `copy_floor`, `paste_floor`, `move_up`, `move_down`,
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
  everything else = subtract — WALL, INSULATION, DOOR, HALFWALL, HEATER, SLIDING, WINDOW, STAIRS,
  CABINET, FURNITURE. DOOR/WINDOW/HALFWALL/HEATER/SLIDING are the **aperture family** (one shared
  `[sill,head]` band + glyph model — see "Apertures & vertical bands" below). The rectangle persists
  `kind` independently from its boolean `op`, preserving semantic identity for later type-specific
  behavior. The breadcrumb remains `PLAN · ADD`; the separate `TYPE · <kind>` readout is the only
  label that changes with thumbstick up/down. ROOM is blue (the only "add" color) and subtract types
  use their type color. Edges get pushed to real walls in EDGE.
- **EDGE** — two presses per wall: 1st (aiming at an edge of ANY zone) LOCKS it; 2nd (tip on
  the real wall) snaps the locked edge to it. Once locked, the label/reticle turn yellow
  "SNAP TO WALL". Grip cancels a pending lock.
- **PLAN · EDIT** (`id: edit`) — the plan editing domain. Select a zone (trigger; press again cycles down
  through overlapping zones), B/Y deletes it, and thumbstick up/down cycles the selected zone's kind
  through `ZONE_KINDS` (room→wall→insulation→door→garage→halfwall→heater→sliding→window→stairs→cabinet→
  furniture). **When the selection is an aperture** (door/garage/window/halfwall/heater/sliding), **A/X
  rotates it** (`rotateAperture`: door/sliding 4-way hinge×swing, window 3-way hinge; halfwall/heater
  return false = inert), and the reused DIMS **numpad opens as a band pad** to type its `[sill,head]`
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
  billboard. When markers share exact X/Y, repeated triggers cycle them highest-to-lowest; the
  current selection stays amber while the next candidate previews yellow. Both the selected floor
  icon and wall glyph are outlined, and the height pad refreshes for each cycled marker.
  Empty-space trigger places a marker of the current type **at the tip** (z capture); triggering the
  hovered marker opens its **height pad** (a single-value datum pad — see "Vertical authoring"): the
  typed value is an offset, **SWAP toggles the FLOOR/CEILING datum** (`↑ floor` / `↓ ceiling`), and
  **DEL frees Z** (`⊘ FREE Z`) — clearing the height dim so the grab moves Z again. ENTER commits the
  height, closes the pad, and clears the selection. **Grip-drag grabs the HOVERED marker** (no prior
  select) and moves it in 3D, but **every axis carrying a defined dim stays locked**: X/Y from
  `marker._locked` (its distance pins) and **Z whenever a `zDatum` is set** (`nz = marker.zDatum ?
  marker.z : tipZ`). So a fully-pinned marker with a defined height doesn't move at all under grab; a
  free (never-height-set) marker grabs in full 3D; a ceiling-pinned marker's z follows a LEVEL height
  change. **B/Y deletes the selected marker** (distinct from DEL, which only frees Z). Every marker
  also has the flat projected floor icon showing its plan X/Y, and a per-type wall glyph
  (`markerFace`: outlet = Type E socket, switch = rocker). Plan zones are inert.
- **MARKER · LINK** (`id: marker_link`) — electrical control relationships. Aim at a switch's
  floor icon and trigger to select it; when switches share the exact same X/Y, repeated triggers
  cycle them from highest to lowest (amber = current source, yellow = next), then aiming at and
  triggering one or more light icons toggles each control link. Pairwise links allow one switch to
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
  model: `penNodeId` is the growing end. Trigger a device marker or an existing node to start the pen
  there; trigger empty space to drop a junction (X/Y from the floor reticle, z from the tip, floorId =
  active floor) and run a segment to it; trigger another node to join/branch/loop. Grip lifts the pen
  (no deletion). **Cross-floor risers:** the floor directly above/below is drawn dimmed (`adjacentGroup`)
  at its true relative height, its nodes + devices pickable (`adjacentTargetAtFloorPoint`, hover
  yellow); triggering one runs a segment across the slab — a **riser**. The network is drawn live in
  `conduitGroup` at active-plan-local Z (`worldZ − activeElevation`), colored per inferred surface
  (`conduitNetworkSegments` + `segmentSurface`; risers violet), showing only segments touching the
  active floor, with a node sphere per active-floor vertex (marker-bound dimmer). Readout: `START PEN`,
  then `RUN CONDUIT`. **The intended conduit→wire→circuit workflow and the conduit/wire/control-link
  relationship are in `docs/electrical-workflow.md`.**
- **CONDUIT · EDIT** (`id: conduit_edit`) — edit the network with a **flat** selection (nodes are
  always drawn, so no wire-select step). Trigger a node to **select** it; a free (bare) junction opens
  a height pad (`activateNodePad` / `commitNodeHeight`, mirroring the marker height pad: single-value
  datum pad, **SWAP toggles FLOOR/CEILING**, **DEL frees Z** (`⊘ FREE Z`, clears the height dim — it
  no longer deletes the node), ENTER commits z and keeps it selected). Trigger a **segment** between nodes
  to **split** it with a new junction at the reticle (`splitConduitSegment`). Trigger empty space to
  deselect. **Grip-drag a node moves it**, direct vs remote chosen at grip-press by the real 3D
  distance from the tip to the node sphere (`WAYPOINT_GRAB_M`): **direct** (in reach) carries it 1:1
  in full 3D; **remote** (far) has the floor reticle drive X/Y while z is held and typed on the pad.
  **A node with a defined `zDatum` holds its Z even in the direct carry** (`nz = n.zDatum ? n.z :
  tipZ`, matching the marker grab), so a height-defined junction slides only in X/Y.
  Both use `moveConduitNode` with `emit:false`, committed once on release. **Marker-bound nodes are
  immovable** (they follow their device) and have no pad — selecting one just arms it. **B/Y deletes
  the selected node + its segments, or the hovered segment alone** (`deleteInMode` → `removeConduitNode`
  / `removeConduitSegment`; `via` references are dropped). Readout: `PICK NODE`, then `EDIT NODE`.
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
  `{id, fromMarkerId, toMarkerId, via:[nodeId]}` in the **whole-house** `project.wires` array; its
  physical path is **DERIVED** as the shortest route through the conduits (Dijkstra, threading the
  ordered `via` nodes), never stored — an unroutable wire simply draws nothing. Trigger two device
  markers to define one (`project.addWire`, which resolves markers house-wide, auto shortest route drawn
  at once); the created wire becomes selected. **Cross-floor wires:** an adjacent-floor device (dimmed
  in `adjacentGroup`) can be either endpoint, so a wire may span storeys over a riser. While a
  wire is selected, trigger conduit **nodes** to force the route through them (`addWireVia`, a manual
  override); grip **pops the last via** (`popWireVia`), and **B/Y deletes the wire** (`removeWire`).
  Trigger an existing wire to re-select it; trigger empty space to deselect. The
  conduit network shows for via-picking (hovered node yellow, existing vias cyan); wires draw in
  `routedWireGroup` colored per inferred segment surface (ceiling cyan, wall amber, floor green, riser
  violet), showing the legs touching the active floor. A
  live amber preview threads the pending pair (first endpoint → hovered marker/tip). Readout:
  `PICK START`, `PICK END`, then `VIA · <n>`. The wall/ceiling/floor surface of each segment is
  **inferred** from geometry (`segmentSurface`), never stored. This REPLACES the removed
  per-wire-waypoint model (`MARKER · WIRE`-trace + `WIRE EDIT`); routing lives in `src/core/conduit.js`.
- **MARKER · DIMS** (`id: outlet_dims`) — marker pins only. The first reference must be a marker's
  projected floor icon; only then do plan edges become eligible for the second reference. Plan
  dimensions cannot be selected or changed.
- **FURNISH** (`id: furnish`, its own mode group) — place **real GLB furniture** (`floor.furniture[]`,
  IKEA models loaded on the fly through the Cloudflare Worker proxy; memory `ikea-3d-model-pipeline`),
  drawn in `furnitureGroup` at plan `(x,0,-y)` + `rotationY`. These are **NOT massing** — they never
  enter the footprint/boolean/extrude pipeline (distinct from the `furniture` *zone* kind, a
  `[foot,top]` placeholder rect authored in PLAN). Trigger empty space to **drop** the current article
  at the tip; trigger a hovered item to **select** it, which opens its **foot-elevation pad** — a
  single value = how high the model's base sits off the floor (for wall-hung units/shelves). That pad
  is a **two-state datum pad** (SWAP toggles FLOOR/CEILING only; there is **no** free-Z and **DEL
  deletes the item**, because furniture grip-drag is floor-planar so the foot is pad-only). **Thumbstick
  up/down** (`cycleFurnish`) rotates the selected item, or cycles the drop article when none selected.
  **Grip-drag** moves the hovered item over the floor reticle (`applyFurnitureGripDrag`, x/y only,
  `emit:false`, committed once via `touch()`; the foot elevation `y` is preserved). **B/Y deletes** the
  selected item. Detail: `docs/furniture-handoff.md`.
- **RECAL** — re-zero against a known corner, REGISTER-style. First SELECT a corner with the
  pointer reticle (aim so it hugs the wall you want as "1"; nearer wall = 1 cyan, other = 2 purple;
  the active wall receives the standard edge highlight; trigger to lock)
  → P1,P2 along real wall 1 → P3 on real wall 2. Corrects both rotational + positional drift.
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
  named direct download rather than discarding the generated document.
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

## Localization (`src/core/i18n.js`)

All user-facing AR text is localized (EN default, FR, ZH) — mode labels, per-mode help boxes,
transient labels (SNAP TO WALL, WALL 1/2, PERP…), numpad keys, DIMS titles + edge/origin ref
names, band-pad field labels (`aperture.sill`/`head`, `furniture.foot`/`top`), datum words
(`z.floor`/`ceiling`/`free`/`freeKey`), the pick-up-controllers prompt (`controllers.*`), SAVE/LOAD
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
  (room/wall/insulation/door/garage/halfwall/heater/sliding/window/stairs/cabinet/furniture, `cycleZoneKind`);
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
  Garage toggles its inward face (`in↔out`). Halfwall/heater have no orientation (returns false → inert). This is gated on `edit` mode so it does
  not collide with A/X = FLIP in DIMS/TRANSLATE.
- **Band pad** — selecting a band-carrying rect in PLAN EDIT opens the reused DIMS numpad as a band
  editor (`activateBandPad`/`syncBandPad`/`commitBandField`). `verticalBandFields(rect)` is the
  authoritative per-kind field list: apertures → `apertureBounds` (door/garage/sliding = HEAD only since sill
  is structurally 0; halfwall = SILL only since head is null; window/heater = both); furniture zone →
  `[foot,top]`; else `[]`. The **SWAP cell cycles the field** (only when ≥2 fields; label names the
  field it switches to, namespaced `aperture.*` vs `furniture.*`); ENTER writes `rect[field]` with a
  band-ordering guard (lower < upper); **DEL deletes the whole zone** (unlike the height pads' DEL).
  The pad stays open after a commit so the other bound can be typed next.
- **Sill/head/foot/top reach NO output yet** — `extrude.js` is deliberately not aperture-aware, and
  the glyph/sheet/DXF ignore the band bounds; only `serialize.js` (v3, additive) persists them. So
  **band edits are geometrically invisible** — verify a change by re-selecting (the pad prefills the
  stored value). Height-aware extrude that carves `[sill,head]` is owner-deferred; do not build it
  unprompted.

## Vertical authoring (heights & datums)

Marker z, bare conduit-node z, and GLB foot elevation are all authored as a **single-value height on a
datum pad** (`nextDatum`/`datumWord`/`datumSwapLabel`/`convertDatumValue`, shared by all three).

- **INVARIANT: stored `z` is always the height above the (active) floor.** A datum is **input-only**:
  ceiling-relative entry resolves to a floor-referenced z and is never stored ceiling-relative.
- A z may carry a **`zDatum`**: `'floor'` (absolute above the floor), `'ceiling'` (below the ceiling,
  stored as `zOff` and resolved by `solveVerticalDatums` in `constraints.js` — run in `_emit` after
  the marker/node pins — as `z = max(0, floorHeight − zOff)`, so it **tracks LEVEL height edits
  one-way**), or **no `zDatum` = FREE** (height never defined; the 3D grab moves Z). A node's ceiling
  is its **own** floor's height (nodes are whole-house).
- **Marker + conduit-node pads are tri-state**: **SWAP** cycles `free → floor → ceiling → floor`
  (`free` is only re-entered via DEL), keeping the physical height across a floor↔ceiling toggle
  (`convertDatumValue`); typing any digit while free defines it as `floor`. **DEL frees Z** (`⊘ FREE
  Z`, `t('z.freeKey')`) — clears the height dim, it does NOT delete the object (object-delete is B/Y).
  Setters: `setMarkerVertical` / `setConduitNodeVertical(id, datum, value)` via shared `setVertical`
  (datum `'free'` drops the dim). A z-datum edit that moves geometry needs a hand `buildPlan()` /
  `buildConduits()` (`mr.js` doesn't subscribe to `onChange`).
- **GLB foot pad is two-state** (SWAP toggles floor/ceiling only; no free; DEL deletes the item) — see
  FURNISH. `setFurnitureVertical(id, datum, value)`.
- **The 3D grip-drag holds any axis with a defined dim.** X/Y come from `marker._locked` (distance
  pins); **Z is held whenever `zDatum` is set** (`nz = obj.zDatum ? obj.z : tipZ`, in
  `applyMarkerGripDrag` / `applyConduitNodeGripDrag`). A ceiling-pinned object also follows a LEVEL
  height change. Applies to markers, bare nodes, and (in reach) direct-carried conduit nodes; the GLB
  foot and the furniture-zone `[foot,top]` are pad-only (no Z-grab). Z is **not** in the solver (that
  stays 2× 1-D X/Y); the blocker to full Z-dimensioning is display (no section view yet).
- **The pads reuse the DIMS numpad's SWAP/DEL cells via overrides.** `numpad.draw(...)` takes optional
  `swapLabel` and `delLabel`. So **SWAP now has three context meanings** — FLIP (DIMS), field-cycle
  (band pad), datum-toggle (height pads) — and **DEL means "delete the DIM you're editing"** on the
  height pads (Z-dim) and in DIMS (constraint), but **"delete the whole zone/item"** on the band pad
  and GLB foot pad. Don't assume SWAP == FLIP or DEL == delete-object.

## Multi-floor (LEVEL)

Floors are independent plans sharing the same plan origin (0,0); elevation is DERIVED by
stacking per-floor heights (`Project._recomputeElevations`: ground = 0, up accumulates,
basement negative). See `multi-floor-design` memory for the settled design.

- Entering AR seeds **Basement · Ground · Upper** around Ground (`ensureFloors`; no-op if
  already multi-floor; default 2.8 m, persists via autosave).
- **LEVEL mode**: **thumbstick up/down switches** the active floor (`switchFloor`, no wrap), with
  a read-only **ALL FLOORS** pseudo-level immediately above the top storey. Real floors reuse the
  DIMS numpad for storey height; **ENTER** calls `project.setHeight` and re-stacks elevations.
  Heights are entered **by hand** — Quest can't measure the vertical offset. The pad's SWAP/DEL
  keys are inert. Labels read `LEVEL · <FloorName>` or `LEVEL · ALL FLOORS`.
- **ALL FLOORS** renders every floor's footprint, edge state, dimensions, and markers at its
  derived elevation around the shared ground origin. It leaves `activeFloorId` unchanged, hides
  the height pad, and skips the complete PLAN and MARKER groups during horizontal mode traversal.
  Flick down in LEVEL to return to the top real floor and restore those editing groups.
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

- **Debug HUD** lines: `build:` stamp, `ptr:` (tip in plan coords + height above floor), `ret:`
  (reticle floor point), `edge:` (length of the highlighted edge, EDGE mode only), `batt:`
  (`navigator.getBattery()`, hidden if unsupported), plus a transient `EXIT:` hold bar. The HUD
  redraw is **throttled to ~2 Hz** (its canvases re-upload on redraw); the EXIT bar bypasses the
  throttle.

## Performance notes (per-frame cost)

- **Dim-label textures are cached** by text+color (`dimTexCache`, evicted in `buildDimensions`,
  bounded at 64). `buildPlan` no longer disposes the shared sprite `.map`. This makes the DIMS
  dim-offset grip-drag a per-frame cache hit.
- **EDGE grip-drag** calls `buildPlan(false)` (skips `buildDimensions`, the dominant cost); the
  full rebuild is restored on drag release (`onSqueezeEnd`).
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
  floor Group), not `view.mesh`. `mr.js` does NOT subscribe to `project.onChange`; it rebuilds
  overlays manually via `buildPlan()`/`applyPlanMatrix()`, so any model-changing action (incl.
  LOAD, height edits, floor switch) must call them itself.
- **The solver can produce negative w/h** unless normalized. `edgeCoord` reads raw x/w while
  every picker/highlight reads normalized min/max; the solver write-back normalizes
  (`src/core/constraints.js`). Don't reintroduce a raw negative-size path.
- **The numpad's SWAP/DEL cells are context-overloaded** (via optional `swapLabel`/`delLabel` args to
  `numpad.draw`). **SWAP** = FLIP (DIMS), field-cycle (band pad), or datum-toggle (marker/node/GLB
  height pads). **DEL** = "delete the DIM you're editing" (constraint in DIMS; free-Z in the marker/
  node height pads) OR "delete the whole zone/item" (band pad, GLB foot pad). It is **never** the
  object-delete for a marker/node — that's B/Y. Don't assume SWAP == FLIP or DEL == delete-object.
- **`zDatum: 'ceiling'` is INPUT-ONLY.** Stored `z` is always height above the active floor; the
  ceiling datum stores `zOff` and `solveVerticalDatums` (`constraints.js`, run in `_emit` after the
  pins) resolves it to a floor-referenced z each solve. Never store anything ceiling-referenced in `z`.
- **Aperture band bounds (`sill`/`head`/`foot`/`top`) reach NO output** — `extrude.js`, the glyphs,
  the sheet, and DXF all ignore them; only `serialize.js` persists them. So a band-pad edit is
  **geometrically invisible** — verify by re-selecting (the pad prefills). Aperture glyphs live in
  `planGroup` (`addApertureGlyphs`), so a door/window/heater/sliding change needs a hand `buildPlan()`
  (mr.js doesn't subscribe to `onChange`); edit glyph shapes ONLY in `apertureGlyph.js` (the print
  page's Y is flipped, so orientation resolves from mapped corners — never baked into the glyph fns).
- **XR reference-space**: in `sessionstart` request `local-floor` AND
  `renderer.xr.setReferenceSpace(localSpace)` (the type setter alone did NOT take through
  ARButton). Read world cam pos from `matrixWorld.elements` ([12],[13],[14]);
  `getCamera().position` stays ~0.
- **Remote logging** (`rlog` → dev-only `POST /__log` → `quest-debug.log`, gitignored — never
  stage it) works only on the dev server, NOT on Pages/the APK. The release TWA has **no web
  console** — debug the `?ar=1` page in the plain Quest Browser or Oculus Remote Web Inspector.

## Key artifacts

| Path | Role |
|---|---|
| `src/ui/mr.js` | The whole MR session: modes, HUD, numpad (DIMS + band pad + tri-state datum height pads + 2-state GLB foot pad), slot menu, grip-drag (X/Y/Z dim-lock), multi-floor/LEVEL, RECAL, FURNISH, conduit ribbons/nodes, `planYaw`, `?ar=1` auto-AR, thumbstick-hold exit |
| `src/core/model.js` | `Floor` + `Project` (floors[], active/ground); facade to active floor; `_emit` recomputes elevations + solves each floor; constraint ops |
| `src/core/constraints.js` | per-axis weighted least-squares `solve(floor)` (normalizes w/h in write-back); `makeDistance`/`makeOriginDistance`/`ORIGIN_ID`/`edgeCoord`; `c.conflict`; `solveMarkers`/`solveConduitNodes` (one-way pins) + **`solveVerticalDatums`** (ceiling-pin resolve) |
| `src/core/apertureGlyph.js` | **Sole** source of door/window/half-wall/heater/sliding plan glyphs (`doorSwingSegments` etc.) + `resolveApertureOrient`; consumed by planSheet, dxf, AND mr (`addApertureGlyphs`) so they can't diverge |
| `src/core/zoneColors.js` | `ZONE_KINDS`, per-kind colors, `APERTURE_DEFAULTS`, `FURNITURE_BAND`, `isAperture`, `apertureBounds`, `verticalBandFields` (the authoritative band-pad field list) |
| `src/core/translate.js` | atomic rigid floor translation; preserves relative constraints and moves origin locks + authored dimension-label placements coherently |
| `src/io/serialize.js` | `serializeProject`/`deserializeInto` v3 (rectangles [+ `sill`/`head`/`hinge`/`swing`/`foot`/`top`] + constraints + markers [+ `z`/`zDatum`/`zOff`] + electrical links + furniture + height per floor; whole-house conduit/wires + `revision` at top level) — desktop JSON, localStorage autosave, AND the AR slots |
| `src/core/electrical.js` | Shared validation + derived switch→ceiling→light control-route points + `segmentSurface` classifier, consumed by AR, sheets, DXF, and conduit routing |
| `src/core/conduit.js` | Conduit-network graph + Dijkstra `shortestConduitPath` (threads `via`); `wireRouteSegments`/`wireRoutePoints`/`conduitNetworkSegments` — wires route over conduits, path derived not stored |
| `src/io/planSheet.js` | To-scale plan-sheet renderer: canvas + SVG backends, footprint/dims/markers/electrical links/legend/scale bar. `floorToSvg` (print + download), `floorToCanvas` (AR live preview) |
| `src/io/dxf.js` | Layered AutoCAD 2000 DXF exporter in 1:1 millimeter model space, including true-3D electrical routes; shared by desktop and AR |
| `src/core/planDiff.js` | Change-map diff: id-matched, solved-geometry diff of zones/markers/dimensions between a saved-slot baseline and the live project (`diffAgainstSnapshot`); rendered as revision clouds by `planSheet.js`, sheet-only |
| `src/io/outputOptions.js` | Device-local SVG/PNG/DXF/COOHOM DXF/JSON format + 7-toggle output profile (`planDims`/`markerDims`/`markerIcons`/`wiring`/`furniture`/`furnitureDims`/`area`) |
| `src/core/dimline.js` | Shared `edgeLineWorld(ref, rects)` — guarded edge lookup (marker/origin → null) used by both `Sketch2D` and the sheet renderer |
| `packaging/quest-apk.md` | reproduce-from-scratch Quest APK runbook |
