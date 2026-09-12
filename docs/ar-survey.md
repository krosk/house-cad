# AR survey reference (`src/ui/mr.js`)

Stable operational detail for the Quest MR survey surface. This is the settled "how the
AR tool is put together" reference; the live "where are we / what next" doc is
`.claude/handoff.md`. Deep rationale lives in Claude memory (`phase5-xr-intent`,
`multi-floor-design`, `ar-2d-parity`, `quest-guardian-limitation`). Packaging is
`packaging/quest-apk.md`. Core (non-AR) architecture is `CLAUDE.md`.

AR (`src/ui/mr.js`) is the **only** authoring surface on the Quest — the immersive APK exits
AR by quitting, there is no 2D editor on-device — so it must reach parity with the desktop 2D
editor (`ar-2d-parity` memory).

## Mode hierarchy (13 tools with stable `id`s)

```text
SETUP    · ORIGIN → FLOOR → RECAL → TELEPORT → LEVEL
PLAN     · DROP (room/wall/door/window/stairs/cabinet) → EDGE → EDIT → DIMS
MARKER   · EDIT → DIMS
PROJECT  · COPY FLOOR → PASTE FLOOR → MOVE UP → MOVE DOWN → SAVE → LOAD → SHEET → UNIT → LANG
```

The headset label and help header show the localized `GROUP · TOOL` breadcrumb. Controller
navigation remains one fast linear cycle across the rows above (A/B or thumbstick-x); group
presentation adds hierarchy without remapping any contextual buttons or thumbstick-y actions.
Internal IDs in traversal order are `register`, `floor`, `recal`, `teleport`, `level`, `drop`, `edge`,
`edit`, `plan_dims`, `marker`, `outlet_dims`, `move_up`, `move_down`, `save`, `load`, `sheet`, `lang`.

Modes are DATA in the `modes` array (each has `id`, `color`, `onTouch`; the label + help text
come from i18n keyed by `id` — `t('mode.'+id)` / `t('help.'+id)`, see Localization below).
Per-frame mode visuals/highlights are the big if/else chain keyed on `modeId` near the end of
the animation loop. `setMode` resets in-progress gestures and activates/deactivates the numpad
(both DIMS modes + LEVEL) or slot menu (SAVE/LOAD). No code hardcodes a mode *index* beyond `setMode(0)`
(= ORIGIN at session start); everything else is keyed by `id` or `currentMode ± 1`.

- **FLOOR** — calibrate the ground base level `floorY` by touching the real ground. Guarded to
  the ground floor (a touch on an upper floor would double-count against its elevation).
- **LEVEL** — per-storey height + floor switch (see Multi-floor below).
- **SETUP · TELEPORT** (`id: teleport`) — aim the pointer reticle at the active floor and trigger
  to bring that plan coordinate beneath the headset. WebXR cannot move the physical passthrough
  camera, so this applies a horizontal `navOffset` to the CAD frame while preserving the surveyed
  `planPos`, yaw, and XR anchor. ORIGIN/FLOOR/RECAL (`placeAt`) clear the navigation offset.
- **REGISTER** — 3-point derived origin corner. Touch P1,P2 along one wall (sets +X down it),
  then P3 on the perpendicular wall; origin = P3 projected onto the P1→P2 line, so the corner
  needn't be reachable. Tip steps WALL 1 → WALL 2 → PERP; grip undoes one point.
- **DROP** (`id: drop`) — one action: drop a starter rectangle at the standing position.
  **Thumbstick up/down picks the kind** (`cycleZoneKind`): ROOM = add; WALL, DOOR, WINDOW,
  STAIRS, and CABINET = subtract for now. The rectangle persists `kind` independently from its boolean `op`,
  preserving semantic identity for later type-specific behavior. The label shows the current kind;
  ROOM is green and all subtract kinds are red. Edges get pushed to real walls in EDGE.
- **EDGE** — two presses per wall: 1st (aiming at an edge of ANY zone) LOCKS it; 2nd (tip on
  the real wall) snaps the locked edge to it. Once locked, the label/reticle turn yellow
  "SNAP TO WALL". Grip cancels a pending lock.
- **PLAN · EDIT** (`id: edit`) — the plan editing domain. Select a zone (trigger; press again cycles down
  through overlapping zones), grip deletes it, and thumbstick up/down cycles
  room→wall→door→window→stairs→cabinet. Marker
  glyphs are inert. Once selected, the breadcrumb includes the kind (`PLAN · EDIT · DOOR`, etc.)
  and a larger controller readout continuously shows `TYPE · <kind>` because all subtract kinds
  deliberately share their current geometry/color. Selecting a ROOM adds its connected component's
  `room: <area> m²` to the info panel, independent of reticle position. Positive-length shared edges and
  overlaps connect rectangles; corner-only contact does not, and overlapping area is counted once. The
  plan sheet prints the same union area once inside every distinct ROOM component.
- **PLAN · DIMS** (`id: plan_dims`) — plan constraints only: edge↔edge sizes and edge↔origin
  position locks. Marker floor icons and marker pins are inert.
- **MARKER · EDIT** (`id: marker`) — the marker editing domain. **Thumbstick up/down cycles the drop
  type** (`MARKER_TYPES` = outlet, switch, light, ethernet; extend for wire) — or, if a marker is
  selected, **retypes that marker in place** (`setMarkerType`). Each type has a `markerFace()` glyph
  (outlet = Type E socket, switch = rocker, light = bulb + rays, ethernet = RJ45 jack) and a
  `marker.<type>` i18n key. A **light drops with z defaulted to the storey height** (ceiling —
  unreachable to tip-capture); other types capture z from the tip. The label reads
  `MARKER · EDIT · <type>` so a glance tells you what a trigger will place. A **floor reticle**
  tracks the aimed floor point and the marker under it is picked through its **flat floor icon**
  (`markerAtFloorPoint`, reticle-radius gated) — a stable plan-space target, not the floating wall
  billboard — with both its floor icon and wall glyph outlined (hover = yellow, selected = amber).
  Empty-space trigger places a marker of the current type **at the tip** (z capture); triggering the
  hovered marker opens its height pad; ENTER commits the height, closes the pad, and clears the
  selection. **Grip-drag grabs the HOVERED marker** (no prior select) and moves it in 3D, but a
  **pinned axis stays locked** (`marker._locked` from its X/Y pins), so a fully-pinned marker becomes
  a pure vertical (z) slider; **grip aimed at empty space deletes the selected marker**. Every marker
  also has the flat projected floor icon showing its plan X/Y, and a per-type wall glyph
  (`markerFace`: outlet = Type E socket, switch = rocker). Plan zones are inert.
- **MARKER · DIMS** (`id: outlet_dims`) — marker pins only. The first reference must be a marker's
  projected floor icon; only then do plan edges become eligible for the second reference. Plan
  dimensions cannot be selected or changed.
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
  complete active floor (name, storey height, rectangles, dimensions and markers) to a separate
  persistent clipboard. It survives LOAD and an APK relaunch. PASTE **replaces the currently active
  floor's authored plan** (rectangles, dimensions and markers), using collision-free ids and remapping
  every internal reference. The destination level keeps its id, name, storey height, elevation and
  ground designation. An empty target pastes immediately; an occupied target requires a second
  trigger, and grip/mode change cancels confirmation. Desktop uses a native confirmation dialog.
- **PROJECT · MOVE UP / MOVE DOWN** (`id: move_up` / `move_down`) — trigger transfers the active
  floor's complete authored contents (rectangles, constraints, and markers) to the immediately
  higher/lower floor and makes it active. The source becomes empty. The operation refuses an absent
  or occupied destination, so it
  never overwrites or implicitly merges data; floor names, heights, elevations, and the ground datum
  stay attached to their existing storeys.
- **SHEET** (`id: sheet`) — preview + download the to-scale plan sheet, ONE floor at a time.
  A floating panel (`makeSheetPanel`) shows a floor rasterized by `floorToCanvas`
  (`src/io/planSheet.js`) — the SAME renderer that produces the printable/downloadable SVG,
  so preview == print. **Thumbstick up/down** cycles the previewed floor (`cycleSheetFloor`,
  wraps; the label TOOL part shows the floor name). **Trigger** downloads that floor's SVG
  (`floorToSvg` → blob → the headset's Download folder; the label flashes the filename).
  Read-only: no massing/pin edits, grip is inert. There is NO on-device printing — an
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
names, SAVE/LOAD slot menu, LEVEL pad title, UNIT/LANG menus. HUD debug lines stay English (diagnostic).

- `i18n.js` mirrors `units.js`: a `current` language + an `onLangChange` bus, plus `t(key)`,
  `setLang`/`cycleLang`, and `getLang`/`langLabel`. The choice **persists** to localStorage
  (`house-cad:lang:v1`) so it survives an APK relaunch. Missing key/lang falls back to en → key.
- `mr.js` re-renders on `onLangChange`: current mode label/help + any open pad/menu. Canvas panels
  (numpad keys, slot cells, lang rows) resolve `t()` **at draw time**, so a redraw picks up the
  switch. Floor NAMES (Basement/Ground/Upper) are model data, deliberately NOT localized.
- **CJK wrapping**: the help-box `wrap()` is CJK-aware — Chinese has no inter-word spaces, so each
  CJK glyph is its own break token (Latin runs stay whole). Without this a ZH sentence overflows as
  one giant "word". Relies on the platform having a CJK font (Quest Chromium ships Noto CJK).

## Inputs

- **trigger** = mode action (place / pick / press a numpad or slot key).
- **grip** = context action. Deletes only within an editing domain (PLAN = selected zone;
  MARKER = selected marker); elsewhere it performs a non-destructive cancel/undo (either DIMS = undo a
  dim pick; EDGE = cancel a locked edge; REGISTER/RECAL = back out a point; SAVE/LOAD/LEVEL =
  nothing). UNLESS the
  reticle is over a drag target → **grip-drag** (either DIMS over its own dim panel = place the line
  perpendicularly and slide the value box along it; EDGE
  over an edge = move it; MARKER with the floor reticle over a marker's floor icon = grab it and move
  in 3D at its initial pointer depth).
  Marker drag **locks any pinned axis** (`marker._locked`, from its X/Y pins) so a measured position
  isn't dragged off — a fully-pinned marker moves in z only; free axes + z follow. Its
  per-frame `moveMarker(..., {emit:false})` updates are visual/model-local; grip release calls
  `project.touch()` once, avoiding a full solve/listener/autosave cascade every XR frame.
  `onReset` early-returns while `gripDrag` is set (`squeeze` fires before `squeezeend`).
- **thumbstick-x** = cycle mode; **thumbstick-y** = the universal "cycle the current thing" control,
  no-op where nothing applies: **LEVEL** = floor / ALL FLOORS (`switchFloor`, no wrap); **UNIT** =
  display/input unit (`cycleUnit`, wraps); **LANG** =
  language; **MARKER** = retype the selected marker, or the drop type if none selected
  (`cycleMarkerType`, wraps); **PLAN · DROP** = the room/wall/door/window/stairs/cabinet kind to add
  (`cycleZoneKind`); **PLAN · EDIT** = the selected zone's kind (`cycleSelectedZoneKind`).
  **thumbstick-hold (~1.2 s)** =
  exit AR.
- **A/X** = prev mode. **B/Y does NOT cycle modes** — mode nav is thumbstick-x (both ways) + A/X
  (prev). B/Y's only action is flipping the dimension side in either DIMS mode with a completed pair
  (`flipConstraintSide`, NOT `swapConstraint`); it is otherwise inert. All contextual cycling lives
  on thumbstick-y (above).
- Only the last-active controller is read (`activeSource`/`pickSource`); the idle hand hides.

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
  only in MARKER DIMS; PLAN DIMS ignores it.

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

## Plan sheets (printing / SVG) — `src/io/planSheet.js`

A to-scale floor-plan sheet, one per floor, drawn from the parametric model (never stored;
recomputed like the mesh). **One set of draw calls feeds two backends** so the preview can
never diverge from the print: `svgBackend()` emits a self-contained SVG string (desktop
print + download, AR blob download); `canvasBackend()` draws to a 2D canvas (the in-AR SHEET
preview, `floorToCanvas`). Everything is computed in **page millimeters** (SVG viewBox is mm;
the canvas backend multiplies by a px-per-mm factor) — so annotation sizes (text, dim offsets,
arrows) are fixed PAPER sizes and stay legible at any scale, while geometry obeys the ratio.

- Scale is auto-picked: the finest round ratio (1:20…1:1000) whose content fits the page
  (default A4, orientation auto), else an exact fit reported as `≈ 1:N`. Content = footprint
  bbox ∪ rect bounds ∪ markers; a fixed margin reserves room for dims/legend/scale bar.
- Draws: the **computed footprint** (`computeFootprint`, holes cut by nonzero winding); the
  **edge↔edge structural dimensions** (via the shared `edgeLineWorld`, `src/core/dimline.js` —
  edge↔origin refs have no drawable edge and are skipped, matching the 2D editor); the
  **marker floor-pin dimensions** (`drawMarkerPins`, a distinct amber) — the surveyed
  distance from a wall/origin to each marker, i.e. *where to place the fixture*, terminating at
  the glyph; **markers + a legend** (`drawMarkerGlyph` per type, shared by plan and legend);
  and a **scale bar + `1:N · unit` caption + floor name**. Marker/legend names come from
  `opts.markerLabel` (desktop = English; AR passes `t('marker.<type>')`).
- **Zero-value dimensions are omitted** (`displaysZero`): any structural or pin distance that
  rounds to `0.00` at the current display unit (coincident edges, a marker sitting on its wall)
  is clutter and isn't drawn.
- **Dimension placement is AR-authoritative**: grip-dragging a value box stores both the line's
  perpendicular `offset` and the box's normalized position along the measured span (`labelT`). The
  normalized position survives endpoint swaps and later geometry edits. Printing uses those same
  values and does not independently push labels or lines around rooms. Constraints without saved
  placement use the normal auto gap and midpoint. Marker heights sit in white knockout chips.
- Desktop: `main.js` Print menu → `printSheets()` (hidden iframe, one `@page` per floor) →
  browser Save-as-PDF; or Download SVG (active floor). **Print at 100% for true scale.**
- Verified: the SVG path is rendered + eyeballed (rsvg) on desktop. **The canvas backend
  (AR preview) is build-verified only** — no browser/Quest raster test in CI.

## Coordinate mapping

Plan `(x,y)` → planGroup-local `(x,0,−y)`; planGroup applies `planYaw` + `planPos`. Overlay lift
per floor is a pure Y translation (`overlayY() = planPos.y + activeElevation()`), so
`worldToPlan` (reads x/z only) stays correct on every storey. `worldToPlan`/`planToWorld` invert
through planGroup. HUD `ptr`/`ret` read in registered-origin (plan) coords.

## HUD (controller-mounted panels)

All controller UI uses `depthTest:false` + `renderOrder = HUD_ORDER (100)` so it paints over
world overlays. Per controller, stacked above the tip: mode **label**, hover **readout** pill
(dimension value on ray-hover), **debug** HUD, **help** box (per-mode `help` string, set in
`setMode`). The idle hand's whole controller is hidden.

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
| `src/ui/mr.js` | The whole MR session: modes, HUD, numpad, slot menu, grip-drag, multi-floor/LEVEL, RECAL, `?ar=1` auto-AR, thumbstick-hold exit |
| `src/core/model.js` | `Floor` + `Project` (floors[], active/ground); facade to active floor; `_emit` recomputes elevations + solves each floor; constraint ops |
| `src/core/constraints.js` | per-axis weighted least-squares `solve(floor)` (normalizes w/h in write-back); `makeDistance`/`makeOriginDistance`/`ORIGIN_ID`/`edgeCoord`; `c.conflict` |
| `src/io/serialize.js` | `serializeProject`/`deserializeInto` (rectangles + constraints incl. `offset` + height, multi-floor) — desktop JSON, localStorage autosave, AND the AR slots |
| `src/io/planSheet.js` | To-scale plan-sheet renderer: canvas + SVG backends, footprint/dims/markers/legend/scale bar. `floorToSvg` (print + download), `floorToCanvas` (AR SHEET preview) |
| `src/core/dimline.js` | Shared `edgeLineWorld(ref, rects)` — guarded edge lookup (marker/origin → null) used by both `Sketch2D` and the sheet renderer |
| `packaging/quest-apk.md` | reproduce-from-scratch Quest APK runbook |
