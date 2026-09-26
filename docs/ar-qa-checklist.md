# AR on-device QA checklist

On-device functional verification for the Quest MR survey surface (`src/ui/mr.js`). Sessions 8→13
shipped this surface build-verified only. **First on-device pass: session 14 — SETUP + PLAN +
PROJECT(save/load/lang) confirmed OK. Session 16 — MARKER · DIMS commit + dim-line render confirmed
(a real crash found + fixed there).** Still unverified: LEVEL (multi-floor), MARKER EDIT (incl. the
session-15 **switch** type + picker/retype), the rest of MARKER DIMS (white-when-pinned, hover
outline, one-way pin), cross-cutting HUD/input, and accuracy. Tick a box when confirmed on device.

- Build tested: `0e98d02`  ·  Dates: `2026-09-11` (s14), `2026-09-12` (s16)  ·  Device: Quest 3
- Debug: open `?ar=1` in the **plain Quest Browser** or the **Oculus Remote Web Inspector** — the
  release TWA has no console. `rlog` only works on the dev server.
- Legend: `[ ]` untested · `[x]` verified · `[!]` broken (write what happened).

## Pre-flight (mostly proven)
- [x] APK installs, verifies origin, launches straight into passthrough AR *(proven on device)*
- [x] **Guardian disabled** on-device so you can walk the whole house *(necessarily true — a full walk happened)*
- [ ] HUD build stamp visible and matches the deployed build
- [ ] RIGHT remains the editor regardless of which hand moved last; LEFT activity never steals its modes
- [ ] With LEFT absent, RIGHT works normally and no companion sheet/teleport reticle is shown
- [ ] With LEFT detected, both tracked controllers remain visible
- [ ] Tracked hands never receive controller roles or trigger edit/teleport actions

## SETUP · ORIGIN (`register`)  ✅ session 14
- [x] 3-point origin: P1,P2 along one wall (sets +X down it), P3 on the perpendicular wall
- [x] Origin lands = P3 projected onto the P1→P2 line (corner needn't be reachable)
- [x] Tip label steps WALL 1 → WALL 2 → PERP
- [x] Grip undoes one point
- [x] Origin gizmo appears at the derived corner

## SETUP · FLOOR (`floor`)  ◐ ground verified; any-storey calibration needs Quest verification
- [x] On Ground, touching the real floor sets the shared ground datum (`floorY`)
- [ ] On Upper, touching its real floor sets `floorY = touchY - activeElevation`; the overlay lands
      on the touched surface rather than being lifted twice
- [ ] On Basement, the same calculation recovers the shared ground datum from its negative elevation
- [ ] Recalibrating from different floors preserves their modeled vertical separation

## SETUP · RECAL (`recal`)  ✅ session 14 — the reticle you asked about
- [x] SELECT phase: reticle rides the **pointer/ray floor point** (not the tip)
- [x] Nearest corner previews under the pointer; aim biases which wall is "1"
- [ ] Nearer wall = **W1 (cyan)**, other = **W2 (purple)**; active wall gets the edge highlight
- [x] Trigger locks the corner + wall order
- [ ] Then P1 farther along real wall 1, P2 inward toward the corner, P3 on real wall 2
- [ ] Reticle samples are labelled 1, 2, 3; reversing P1/P2 deliberately reverses orientation
- [x] Geometry lands on the touches — both rotational AND positional drift corrected
- [x] Grip backs out a point / deselects the corner
- [x] Reticle step badge shows "1" on wall 1, "2" on wall 2 after lock

## SETUP · LEVEL (`level`) — multi-floor  ⬜ NOT covered in session 14
- [ ] AR entry seeds **Basement · Ground · Upper**
- [ ] **Thumbstick up/down switches** the active floor (no wrap)
- [ ] Flicking up from the top floor enters **ALL FLOORS**; flicking down returns to that top floor
- [ ] ALL FLOORS shows every footprint, edge state, dimension, wall marker, and floor icon at the correct stacked elevation
- [ ] ALL FLOORS hides the height numpad and trigger cannot change a storey height
- [ ] While ALL FLOORS is selected, horizontal navigation skips every PLAN and MARKER mode in both directions
- [ ] ALL FLOORS reticle: aiming down lands on your own storey's floor, aiming up on the floor above (none from the top storey). Conduit/wire/pipe picks favour that storey, and grip cycles to farther storeys (basement breaker → upstairs outlet wire)
- [ ] PLAN · EDIT: select a STAIRS zone, A/X turns its floor arrow 90° clockwise per press; the printed sheet, DXF and View 3D treads follow; STAIRS DOWN on the storey above points the opposite way for the same `climb`
- [ ] ALL FLOORS LEFT stick up/down teleports one storey (target floor under your feet), keeps the mode and a pending wire endpoint; leaving ALL FLOORS restores the physical registration; inert on single floors
- [ ] Returning to a real floor restores PLAN/MARKER traversal and editing
- [ ] Thumbstick-y changes floor **only in LEVEL** (no-op in modes without a cycle action)
- [ ] Numpad types a storey height; **ENTER** sets the active floor's height and re-stacks elevations
- [ ] Label reads `LEVEL · <FloorName>`; pad title shows the floor's base elevation
- [ ] Stacking: editing **Ground** height lifts **Upper**; editing **Basement** height drops Basement
- [ ] Editing the topmost floor's own height moves nothing (expected)
- [ ] SWAP/DEL keys are inert here

## SETUP · TELEPORT (`teleport`)  ⬜ NEW — build-verified only
- [ ] Pointer reticle tracks the active floor
- [ ] Trigger brings the reticle's plan coordinate beneath the headset without changing height
- [ ] Repeated teleports accumulate correctly
- [ ] Survey geometry, dimensions, yaw, and anchored `planPos` are unchanged
- [ ] Switching modes keeps the teleported position; ORIGIN/FLOOR/RECAL clears it
- [ ] Grip and thumbstick up/down are inert
- [ ] LEFT has its own cyan teleport reticle in every mode; LEFT trigger teleports without invoking RIGHT's active tool

## PLAN · ADD (`drop`)  ⬜ type picker needs Quest verification
- [ ] **Thumbstick up/down picks ROOM → WALL → DOOR → WINDOW → STAIRS → CABINET → FURNITURE** and wraps
- [ ] The mode breadcrumb remains exactly `PLAN · ADD` while cycling
- [ ] Only the separate prominent `TYPE · ROOM/WALL/DOOR/WINDOW/STAIRS/CABINET/FURNITURE` readout changes label/color
- [ ] Trigger with **ROOM** selected drops an **add** rectangle (roomspace) at your standing position
- [ ] Trigger with **WALL** selected drops a **subtract** rectangle (solid wall)
- [ ] Trigger with **DOOR** selected also drops a subtract rectangle, but saves `kind: "door"`
- [ ] **STAIRS** and **CABINET** also subtract for now while saving their distinct kinds
- [ ] **INSULATION** subtracts like WALL, saves `kind: "insulation"`, and uses its own type tint
- [ ] **FURNITURE** subtracts for now, saves `kind: "furniture"`, and uses its orange type tint
- [ ] 3D extrusion updates live *(drop-of-a-box itself was verified s14; the kind picker is new)*

## PLAN · EDGE (`edge`)  ✅ session 14
- [x] 1st press aiming at an edge of ANY zone LOCKS it; label/reticle turn yellow "SNAP TO WALL"
- [x] 2nd press (tip on the real wall) snaps the locked edge to it
- [x] Grip cancels a pending lock
- [x] HUD `edge:` line shows the highlighted edge length

## PLAN · EDIT (`edit`)  ✅ session 14
- [x] Trigger selects a zone; pressing again cycles DOWN through overlapping zones
- [x] Grip deletes the selected zone
- [ ] Thumbstick up/down cycles all six zone kinds and preserves the selected kind
- [ ] The mode breadcrumb remains exactly `PLAN · EDIT` while cycling
- [ ] Only the separate, prominent `TYPE · ROOM/WALL/DOOR/WINDOW/STAIRS/CABINET/FURNITURE` controller readout changes label/color
- [ ] Selecting a ROOM continuously shows its connected component's union area in m² in the info panel, independent of reticle position
- [ ] Overlap and positive-length shared edges connect ROOM rectangles; corner-only contact does not
- [ ] The area disappears when the selection is cleared or changed to a non-ROOM zone
- [ ] SHEET preview, SVG, and print show one matching area chip inside each distinct ROOM component
- [ ] Outlet glyphs are **inert** here *(needs an outlet placed to confirm — see OUTLET EDIT)*

## PLAN · TRANSLATE (`translate`)  ⬜ NEW — build-verified only
- [ ] The mode starts with `PICK X OR Y EDGE`; either axis may be defined first
- [ ] Selecting an edge opens the numpad prefilled with its current absolute origin distance
- [ ] FLIP changes the pending target to the opposite side of the origin
- [ ] After the first ENTER, no geometry moves and the readout asks for the missing axis
- [ ] After the second ENTER, every rectangle and marker moves by one common `(dx,dy)`
- [ ] Room widths/heights and all edge↔edge / marker↔edge values remain unchanged
- [ ] Existing origin constraints update to the translated coordinates without conflicts
- [ ] The two chosen edges remain constrained to origin at exactly the entered coordinates
- [ ] Manually placed plan and marker dimension lines/value boxes move with the floor
- [ ] Electrical links/routes remain attached; floor height/elevation and AR registration do not change
- [ ] Grip cancels the pending edge, then the most recently entered axis, without moving geometry

## PLAN · DIMS (`plan_dims`)  ✅ session 14
- [x] edge↔edge size: pick two edges → numpad → size applied
- [x] edge↔origin position lock (**0 m valid**)
- [ ] After TELEPORT, the visible origin ring remains selectable as a PLAN DIMS reference
- [x] Numpad **SWAP | DEL | ENTER** shown in the edit phase; field prefills current value
- [x] B/Y = **FLIP** side (flips the dimension, keeps order); negatives rejected
- [x] Conflicting size refused → `!CONFLICT`, pair stays
- [x] DEL removes the constraint (or cancels an in-progress new pair) and closes the pad
- [x] Grip-drag over the dim panel slides its perpendicular offset
- [ ] Parallel grip movement slides the value box along or beyond both endpoints; SAVE/LOAD and SHEET preserve that position
- [ ] Outlet floor icons + outlet pins are **inert** here *(needs an outlet placed to confirm)*

## MARKER · EDIT (`marker`)  ⬜ NOT covered on device (type picker + switch are new in session 15)
- [ ] **Thumbstick up/down cycles the drop type** (outlet → switch → light → ethernet, wraps)
- [ ] The mode breadcrumb remains exactly `MARKER · EDIT` while cycling
- [ ] Only the separate prominent `TYPE · OUTLET/SWITCH/LIGHT/ETHERNET` readout changes, and it remains visible as the current placement type when no marker is selected
- [ ] With a marker **selected**, thumbstick up/down **retypes that marker** in place (glyph swaps, pad title updates)
- [ ] Empty-space trigger drops a marker **of the current type** at the tip; z = tip height above floor
- [ ] Each type's glyph is distinct: outlet = Type E socket, switch = rocker, **light** = bulb + rays, **ethernet** = RJ45 jack
- [ ] Dropping a **light** defaults its height to the storey height (ceiling); other types capture tip height
- [ ] A **floor reticle** tracks the aimed floor point; the marker under it highlights (floor icon + wall glyph outlined, yellow hover / amber selected)
- [ ] Hovering a marker's **floor icon** picks it (stable plan-space target, not the floating billboard)
- [ ] At exact same-X/Y stacks, repeated triggers cycle every marker highest-to-lowest; selected is amber, next is yellow
- [ ] Cycling a stack refreshes the TYPE readout and height-pad title/value for the newly selected marker
- [ ] Aiming at a marker + trigger opens its **height pad** (pad title shows the type); ENTER commits, closes, clears
- [ ] **Grip-drag grabs the HOVERED marker** (no prior select) and moves it in 3D; it does NOT snap back on release
- [ ] Dragging a marker with a **pinned X or Y leaves that axis fixed** (only free axes + z move); a fully-pinned marker acts as a **vertical z slider**
- [ ] Grip aimed at empty space deletes the selected marker
- [ ] Each marker shows a wall-height glyph AND a flat projected floor icon
- [ ] Plan zones are **inert** here
- [ ] Depth-test-off glyphs/icons + the reticle read clearly through walls

## MARKER · LINK (`marker_link`)  ⬜ NEW — build-verified only
- [ ] The mode starts with a fixed `MARKER · LINK` breadcrumb and separate `PICK SWITCH` readout
- [ ] Outlets, ethernet ports, and other non-switch/non-light markers never highlight in LINK
- [ ] Triggering a switch selects it in amber and changes the readout to `PICK LIGHT`
- [ ] A switch sharing its X/Y with an outlet remains selectable
- [ ] For switches at the exact same X/Y, repeated triggers cycle highest-to-lowest: the current
      source stays amber and the next switch previews yellow before aiming at a light
- [ ] Triggering a light creates a dotted route: switch rise → ceiling run → optional light drop
- [ ] Triggering the same light again removes only that switch-to-light link
- [ ] One switch can link to multiple lights, and one light can link to multiple switches
- [ ] Linked lights outline cyan; hover remains yellow; the selected switch remains amber
- [ ] Grip clears the selected switch but does not remove existing links
- [ ] Leaving LINK hides AR wires; returning shows all persisted links
- [ ] Moving either marker or changing storey height keeps the derived route attached
- [ ] Retyping/deleting an endpoint removes incompatible links without dangling routes
- [ ] SAVE/LOAD, floor COPY/PASTE, and MOVE UP/DOWN preserve links with valid remapped ids
- [ ] Older saves without `electricalLinks` load normally with an empty link list
- [ ] SHEET/SVG shows the dotted plan projection below marker glyphs
- [ ] DXF contains true 3D rise/run/drop entities on `ELECTRICAL_ROUTE`

## MARKER · DIMS (`outlet_dims`)  🟡 commit + render VERIFIED (session 16); rest untested
> s16: a real bug was found + fixed here — the desktop `Sketch2D` (live on `onChange` during AR)
> threw on the marker `{marker}` endpoint, aborting `commitEntry` before `buildPlan`, so pins never
> committed and no dim drew. Now confirmed on device for a TOP and a LEFT pin. See `0e98d02`.
- [x] First reference must be a marker's **projected floor icon**, second a plan edge (floor-icon-first flow works)
- [ ] Plan edges are inert until the floor icon is picked; other marker icons + origin inert after the first pick *(flow worked; the inert-half not explicitly forced)*
- [x] Orange dashed floor dim-line + value label from the anchored edge to the marker
- [x] ENTER commits and closes the pad (was the bug: it did nothing until s16)
- [ ] Glyph turns **WHITE** once BOTH X and Y are pinned
- [ ] Hover/lock adds a bold outline to the icon AND its linked wall-height glyph (shared-X/Y disambig)
- [ ] Pin is one-way: it moves the outlet, not the wall
- [ ] The floor dim label is selectable / grip-draggable here (PLAN DIMS ignores it)
- [ ] A marker dim label can move beyond both endpoints and print at that outside position
- [ ] Measured spans are dashed; an outside value panel is joined from the nearer endpoint by a visually distinct dotted leader

## PROJECT · SAVE / LOAD (`save` / `load`)  ✅ session 14
- [x] Ray-aimed 6-slot menu appears
- [x] SAVE persists the whole multi-floor project
- [ ] Saving to an occupied slot prompts for overwrite and does NOT write on the first trigger
- [ ] The slot grid is replaced by separate CONFIRM OVERWRITE and CANCEL buttons
- [ ] Triggering blank space cannot confirm; only the new CONFIRM OVERWRITE button writes
- [ ] CANCEL, changing mode, or grip returns safely without overwriting
- [x] LOAD round-trips rectangles + constraints (+ offsets), floors + heights
- [ ] LOAD also round-trips **markers + outlet pins** *(needs an outlet in the scene to confirm)*
- [x] Overlays rebuild correctly after LOAD

## PROJECT · COPY FLOOR / PASTE FLOOR (`copy_floor` / `paste_floor`)  ⬜ NEW — build-verified only
- [ ] COPY snapshots the active floor and flashes its name without changing the project
- [ ] After loading a different save, PASTE replaces the currently active floor's plan
- [ ] The destination floor keeps its id, name, height, elevation, and ground designation
- [ ] The pasted plan preserves room/wall/insulation/door/window/stairs/cabinet/furniture kinds, dimensions, marker types and positions
- [ ] Pasted rectangle, constraint and marker ids are fresh; every constraint points to pasted objects
- [ ] The clipboard survives an APK relaunch and can be pasted repeatedly
- [ ] An occupied target requires a second trigger; grip or changing mode cancels confirmation
- [ ] An empty target pastes immediately
- [ ] PASTE with no valid clipboard reports NOTHING COPIED / PASTE FAILED without changing the project

## PROJECT · MOVE UP / MOVE DOWN (`move_up` / `move_down`)  ⬜ NEW — build-verified only
- [ ] From Ground, trigger moves all rectangles, constraints, and markers to Upper
- [ ] From Ground, MOVE DOWN transfers the same complete plan to Basement
- [ ] Upper becomes active and its overlay appears at the Upper elevation; Ground becomes empty
- [ ] Floor names, storey heights, elevations, and the ground-floor datum do not move
- [ ] Trigger refuses an occupied Upper floor without changing either floor
- [ ] MOVE UP on the top floor, MOVE DOWN on the bottom floor, or either action on an empty source is a visible no-op
- [ ] SAVE/LOAD round-trips the moved plan on its new floor
- [ ] Grip and thumbstick up/down are inert

## PROJECT · EXPORT (`export`)  ⬜ NEW — build-verified only (canvas preview never rendered on device)
> Configure + download the active floor as SVG/PNG/detailed DXF/COOHOM DXF or the full project as JSON. The SVG path is desktop-verified (rendered + eyeballed);
> the in-AR canvas raster is untested on the Quest. Debug via the plain Quest Browser (`?ar=1`).
- [ ] Detecting LEFT shows an enlarged sheet mounted to and following that controller in every mode
- [ ] The sheet sits outside the left hand and leaves its cyan aiming ray/reticle unobstructed
- [ ] The sheet faces 45° inward and tilts 45° upward toward the user; it reads comfortably with a leftward head turn
- [ ] Room tint, dimensions, markers, and edit/numpad panels never paint over the solid-white sheet
- [ ] The companion sheet reads clearly through passthrough and always shows the active LEVEL floor
- [ ] Editing or grip-moving a dimension refreshes the companion sheet without stalling tracking
- [ ] Footprint, dimensions, markers + legend, scale bar, `1:N · unit` caption, floor name all present
- [ ] Generation timestamp is present as local `YYYY-MM-DD HH:mm` and matches across every page in one print run
- [ ] The generating software build id (Git revision + UTC build stamp) appears beside the timestamp
- [ ] Insulation batts, door diagonal, window glazing, stair treads/arrow, and cabinet cross render over their authored cutouts
- [ ] Each insulation/door/window/stairs/cabinet type present on the floor has one matching zone-legend entry
- [ ] The panel initially shows SVG with PLAN DIMS, MARKER DIMS, MARKER ICONS, and AREA checked; FURNITURE unchecked
- [ ] Triggering each row toggles it and immediately refreshes the companion sheet
- [ ] MARKER ICONS off hides switch-light routes as well as endpoint glyphs, in sheet/SVG/PNG/DXF
- [ ] Hidden links and endpoints no longer affect sheet scale-fitting
- [ ] FURNITURE off excludes it from footprint, symbols, legend, and scale; on restores those in SVG and DXF
- [ ] AREA off hides room-area chips in the sheet and `ROOM_INFO` entities in DXF; on restores both
- [ ] A structural dimension with either endpoint on FURNITURE remains absent from SVG/PNG/DXF and does not reduce sheet scale
- [ ] A marker-pin dimension anchored to a FURNITURE edge is likewise always absent from SVG/PNG/DXF
- [ ] Both hidden furniture constraints remain stored and continue driving geometry in AR
- [ ] FURNITURE does not reduce a connected ROOM component's reported/printed area; every other
      subtract kind still does
- [ ] Marker floor-pin dimensions (black dashed, wall→fixture) show where to place each marker
- [ ] The complete sheet/SVG uses only black, gray, and white; marker pins and electrical routes contain no hue
- [ ] Vertical stacks require exactly equal plan `x` and `y`; markers on opposite faces of a 70 mm wall remain separate
- [ ] Horizontal grouping requires exactly equal heights and follows connected 80 mm-inclusive neighbors
- [ ] Horizontal example: positions 0, 80, and 160 mm at one exact height form one box via two links
- [ ] Markers connected by 80 mm-inclusive full-3D neighbor links share one outlined white box; farther-apart heights remain
      separate white boxes on the same plan-position bracket
- [ ] Same-height neighbors use a horizontal box with one shared height; different-height neighbors
      use a vertical box with one height per glyph
- [ ] Example: switches at 1.00 m and 0.96 m share one vertical white box, while a co-located outlet
      at 0.30 m occupies its own box below them
- [ ] Separate height boxes at one plan point form a vertical column in height order; 1.07 m is above 0.24 m
- [ ] Transitive example: 1.17 m, 1.09 m, and 1.01 m share one box through adjacent 80 mm links;
      a co-located marker at 0.24 m remains separate
- [ ] Equal-height markers with no connected 80 mm plan-neighbor path remain independent glyphs
- [ ] A stack on each of a room's four walls places its callout inward (right/left/below/above respectively), not always to the page right
- [ ] Equal-height fixtures display horizontally; fixtures at differing heights display vertically
- [ ] An isolated marker constrained at distance 0 on each of a room's four walls places its height chip inward
- [ ] An unconstrained isolated marker retains its conventional height chip below the glyph
- [ ] A marker sitting on its wall (0.00 pin) draws NO pin dimension; other 0.00 dims are omitted too
- [ ] Whole dimensions omit `.0`/`.00` on the sheet; fractional dimensions retain normal precision
- [ ] Round marker heights also omit `.0`/`.00` (`107.0 cm` → `107`, `24.0 cm` → `24`)
- [ ] Desktop Print emits one floor per page at one identical scale across all non-empty floors
- [ ] Active-floor SVG and left-controller sheet use the identical scale/origin as that floor's Print All page
- [ ] All printed pages share one orientation and page size; the complete stacked extent fills the available drawing area
- [ ] Dragging a dimension line/label far outside the plan may reduce scale but never changes page orientation
- [ ] A legitimate portrait/landscape change refreshes the left sheet immediately without stale or squeezed texture content
- [ ] Model origin `(0,0)` maps to the identical paper point on every page, so physically superposed sheets align
- [ ] An empty floor produces its own labeled empty page at the shared scale; adjacent floor content never flows onto it
- [ ] **Thumbstick up/down** switches only `SVG` / `PNG` / `DXF` / `COOHOM DXF` / `JSON`; it never changes the active floor
- [ ] Changing floor in LEVEL changes the panel's `Active · <FloorName>` and companion preview
- [ ] Triggering blank panel space does nothing; only the separate EXPORT button downloads
- [ ] Sheet/CAD export downloads `plan-<active-floor>-<timestamp>` with the selected `.svg`, `.png`, or `.dxf` extension
- [ ] JSON downloads `house-debug-<timestamp>.json` containing the complete serialized multi-floor project
- [ ] Output checkboxes do not remove any data from the JSON debugging export
- [ ] Every export receives a distinct timestamped filename
- [ ] After one direct AR download, a later export opens Android's share sheet and can save/share
      another floor or format instead of being blocked by Chromium's multi-download gate
- [ ] If Web Share is advertised but rejected from immersive mode, the same export falls back to a uniquely named direct download instead of being lost
- [ ] PNG is a sharp 4096-pixel-long-edge raster matching the SVG sheet content and output filters
- [ ] The downloaded file lands in the headset's Download folder (retrieve by cable) — TWA + Quest Browser
- [ ] Options survive mode changes/APK relaunches but do not alter JSON saves or copied floors
- [ ] Grip is inert here (no delete/undo); leaving EXPORT keeps the active-floor companion visible
- [ ] Marker legend names switch with LANG (outlet/switch localized)
- [ ] Shutter outlets and air-conditioning supplies retain normal marker constraint/stack behavior but use distinct glyphs in AR, sheets, legends, and detailed DXF; aircon is shown as a dedicated cable feed rather than a socket
- [ ] Cooktop, oven, water-heater, and appliance outlets have distinct glyphs in AR, sheets, and detailed DXF; oven and appliance use a circular outlet boundary with representative inner symbols; the sheet legend shows 32 A for cooktop and 20 A for the other three
- [ ] Intercom has a distinct screen/speaker glyph in AR, sheets, legends, and detailed DXF, without an amperage recommendation
- [ ] Dual Ethernet is selectable independently from Ethernet and renders as two adjacent RJ45 ports in AR, sheets, legends, and detailed DXF
- [ ] Patch panel is selectable as a marker and renders as a rack-style bank of ports in AR, sheets, legends, and detailed DXF
- [ ] Panel/consumer-unit is selectable as a marker and renders as a breaker-bank enclosure in AR, sheets, legends, and detailed DXF (`MARKER_PANEL`)
### CONDUIT + WIRE (two-layer model, replaces the removed per-wire-waypoint lane)  ⬜ NEW — build-verified only
- [ ] MARKER · CONDUIT: trigger a marker/node to start the pen (readout START PEN→RUN CONDUIT); trigger empty space drops a junction + runs a segment; trigger another node joins/branches/loops; grip lifts the pen (no deletion)
- [ ] The live network draws in `conduitGroup` colored per inferred surface, with a node sphere per vertex (marker-bound dimmer); the pen node is amber, hover yellow, and a preview runs pen→tip
- [ ] CONDUIT · EDIT: trigger a free junction selects it and opens a height pad; trigger a segment between nodes splits it with a new junction at the reticle and selects it; trigger empty space deselects
- [ ] Grip-drag a node NEAR the tip carries it 1:1 in full 3D (direct); FAR moves only X/Y via the floor reticle while z holds (remote); release persists; height pad typing + ENTER sets a free junction's z
- [ ] A marker-bound node cannot be moved (follows its device) and opens no pad; grip away from a selected node deletes the node + its segments and drops `via` references to it
- [ ] MARKER · WIRE: with a device AND a wire in the reticle, grip cycles device → wire (and on through the stack); trigger on the yellow wire selects it
- [ ] MARKER · WIRE: selecting a wire shows `CIRCUIT <len>` (sum of the component's cables) and, when an Ethernet and an electrical wire share conduit, `SHARED <len>` in the other type's color; the 3-line pill is legible
- [ ] MARKER · WIRE: the yellow target stays put when another device/wire drifts into the reticle; only grip moves it
- [ ] MARKER · WIRE: trigger two device markers to define a wire (readout PICK START→PICK END→VIA·n); its route draws instantly as the auto shortest path through the conduits, per-surface colored
- [ ] With a wire selected, triggering conduit nodes forces the route through them (via override, existing vias read cyan); grip pops the last via, and with none left deletes the wire
- [ ] An unroutable wire (no conduit path) draws nothing but is retained; trigger an existing wire to re-select it; trigger empty space to deselect
- [ ] Wires + conduits round-trip through SAVE/LOAD and floor copy/paste (node/segment/wire ids remapped, marker-bound nodes + `via` rebound); deleting an endpoint marker drops its bound node + incident segments + terminating wires
- [ ] Sheet draws the conduit network (one dash + node rings) beneath per-surface-dashed routed wires, with "Conduit" + "Wire · in wall/ceiling/floor" legend keys; DXF writes `CONDUIT` (dashed) + routed wires on `ELECTRICAL_ROUTE_WALL`/`_CEILING`/`_FLOOR`
- [ ] Conduit network + routed wires show only in the CONDUIT/CONDUIT EDIT/WIRE modes; control links still show only in LINK
- [ ] A floor containing many marker/zone types wraps its legend within the printable page instead of extending beyond either margin
- [ ] Zone legend names switch with LANG (insulation/door/window/stairs/cabinet localized)
- [ ] Desktop DXF opens as AC1015 at 1:1 millimeter scale and exposes the expected semantic layers
- [ ] COOHOM DXF contains only 2D LINE entities on WALL/WINDOW layers in millimetre model space; doors are empty wall gaps
- [ ] Coohom recognizes the COOHOM DXF wall/door/window geometry after an AutoCAD save-as round trip if required
### CHANGE MAP (revision clouds vs a saved slot)  ⬜ NEW — build-verified only
- [ ] The EXPORT panel shows a **COMPARE** row (below FORMAT, above the layer toggles) reading `none` by default; the taller panel no longer clips the EXPORT button
- [ ] Pointing the ray at COMPARE and flicking the **thumbstick** cycles `none` → each saved slot → `none`; a **tap** on the row also advances it
- [ ] Thumbstick still cycles FORMAT when NOT pointing at COMPARE (no clash)
- [ ] Only slots saved in this browser appear; a chosen slot that no longer exists drops back to `none`
- [ ] With a slot chosen, the LEFT preview draws revision clouds + numbered △ tags + a `REV — CHANGES` legend for zones/markers/dimensions changed since the snapshot
- [ ] Added/moved/resized/retyped zones cloud around the current geometry; a removed zone shows a faint ghost outline + cloud
- [ ] Added/removed/moved/retyped markers get a small cloud + tag; a dimension whose value changed tags at its edge midpoint with `from→to` in the legend
- [ ] Editing the plan refreshes the clouds in the preview (diff recomputes on the throttled redraw)
- [ ] EXPORT SVG/PNG bakes the change map in; DXF/COOHOM/JSON never carry it
- [ ] The change map does not affect sheet scale-fitting (clouds are paper-fixed annotations)
- [ ] Leaving and re-entering EXPORT keeps the selected baseline for the session; it is not written to any save

## PROJECT · UNIT (`unit`)  ⬜ NEW — build-verified only
- [ ] Thumbstick up/down cycles m / cm / mm and the active row remains highlighted
- [ ] Trigger picks the ray-aimed row (or advances one if the ray is off the panel)
- [ ] AR dimension labels, numeric pads, sheet preview, and desktop unit selector update immediately
- [ ] Changing units does not change the plan geometry or stored meter values
- [ ] Choice persists across an APK relaunch

## PROJECT · LANG (`lang`)  ✅ session 14
- [x] Thumbstick up/down moves through FR / EN / ZH
- [x] Trigger picks the ray-aimed row (or advances one if the ray is off the panel)
- [x] All UI text switches (labels, help, numpad, slot menu, LEVEL pad, DIMS titles)
- [x] Choice persists across an APK relaunch
- [x] ZH help text wraps (CJK-aware) without overflowing the box

## Cross-cutting / HUD / inputs  ⬜ mostly not explicitly checked
- [ ] **Reverted HUD panels ride the controller** — they sit right when the hand tilts down (s12 revert)
- [ ] Mode label + help show the localized `GROUP · TOOL` breadcrumb
- [ ] Thumbstick-x cycles modes (both ways); A/X = prev mode; **B/Y does NOT cycle modes** (flips DIMS or a pending TRANSLATE coordinate, else inert)
- [ ] Thumbstick up/down = "cycle the current thing" (LEVEL floor / UNIT unit / LANG language / MARKER type / EDIT zone kind), no-op elsewhere
- [ ] Thumbstick-hold (~1.2 s) exits AR; the EXIT bar shows during the hold
- [ ] HUD debug lines present: `build` `ptr` `ret` `edge` (EDGE only) `batt`
- [ ] Overlays ride the correct elevation on each floor
- [ ] With Upper selected while physically on Ground, the pointer reticle remains visible from below
      in every floor-targeting mode

## Harder / accuracy (do last)
- [ ] Anchor drift over a multi-room, multi-floor house stays acceptable
- [ ] Upper/basement overlay heights match reality (only as good as the typed storey heights)
</content>
