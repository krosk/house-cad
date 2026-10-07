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
- [ ] MARKER · CHECK: rings are red (cross-tie), orange (no breaker) and white (unwired outlet/switch/light), with pins up to each glyph; thumbstick up/down filters one issue; aiming at a ring names the device and issue; readout counts match the house (rev 9: 0 / 5 / 93); Ethernet-only runs are not flagged; frame rate holds with ~100 rings
- [ ] Stacked devices (double switch = two switch markers at one point): hovering one in EDIT/WIRE/CHECK shows `switch i/n → k× light` and outlines its lights cyan; grip advances i/n
- [ ] Shared grip cycle (2026-09-29) in MARKER · EDIT, LINK, MATERIAL · SWITCH/OUTLET/ETHERNET: with 2+ eligible markers in the reticle (a stack or near neighbours), the last yellow line reads `<type> i/n`; the yellow target holds while the hand wobbles; each grip steps `i` by one and wraps; in EDIT a near-but-separate marker (not at the same point) is now reached by grip; at the 132 cm Ethernet stack the target doesn't jump
- [ ] CONDUIT on Ground: fps back near 72, PERF `condt` a few ms and the `draw` count well under 350; adjacent-floor dots still dim slate, hover turns yellow and enlarges, trigger still makes a riser
- [ ] MARKER · LINK: routes still dashed cyan (dashes flow round the ceiling corners); selecting a switch turns only its routes amber; `draw` count ~17 lower than before on Ground
- [ ] DOUBLE SWITCH marker: in MARKER · EDIT the type list has DOUBLE SWITCH after SWITCH, with a two-rocker glyph; in LINK a selected double switch shows `ROCKER LEFT`/`RIGHT`, thumbstick up/down swaps it, and lights linked on each rocker show amber/pink routes; the sheet shows the split-square symbol and an L/R chip per leg
- [ ] Merge an old pair: retype the top switch of a double-switch pair to DOUBLE SWITCH, readout offers `A/X: MERGE…`, A/X removes the other marker and its light moves to the right rocker (check in LINK)
- [ ] Double switch on two circuits (2026-09-29): wire breaker A → the double switch and breaker B → the same double switch; select the second wire, the readout shows `ROCKER LEFT`, A/X turns it to `ROCKER RIGHT`; CHECK then shows no cross-tie on either chain, and selecting each wire highlights only its own circuit. A new wire from the switch to a light linked on the right rocker starts on `RIGHT`
- [ ] MARKER · CONDUIT with no pen: over a spot with a device, a node and a run, each grip steps to the next one and it stays highlighted while the hand wobbles; after all of them it wraps round; trigger starts the pen on the highlighted one
- [ ] Overlap count badge: a floor icon shared by markers at one plan point shows an amber "2"/"3" at its top-right corner; a double switch (same point and height) shows it on the wall glyph too; single markers show none
- [ ] MARKER · EDIT on the ground-floor stack Ethernet 132 / double switch 109 / switch 101 cm (same point, float noise apart): grip walks all three high→low and wraps, without jumping when the hand wobbles; the floor badge reads "3"
- Owner walk 2026-09-27 (build `4cad922`): applied materials on the Quest; the MATERIAL flow for floors,
  windows etc. was understood. No per-item pass/fail was given, so the boxes below stay open. The owner
  looked for the same material option for **furniture** and found none: furniture products live in
  FURNISH as separate items, not on the furniture zones. Fixed the same day by the furniture merge
  (MATERIAL · FURNITURE; items under FURNITURE below). FURNISH was then removed as overlapping.
- [ ] MATERIAL badges (2026-09-27): a room, wall face, door, window or furniture zone with a material shows only a small swatch disc (white ring) at its centre, no colour fill; the plan stays readable; the yellow hover/selection highlight still shows the whole target
- [ ] LEFT X: a white ceiling closes the room overhead at storey height (the real ceiling no longer shows); every window pane is opaque and shows sky, trees and lawn instead of the real room; PERF still usable
- [ ] LEFT X in the furnished living room: the HUD `draw:` line stays near the empty-room count (was ~1000 vs ~150 before merging, 2026-10-03); windows, outlets, radiators and the piano look unchanged (glass still see-through-sky, outlet faces intact)
- [ ] PROJECT · PERF with LEFT X on: the HUD shows `gpu 3D:` (or `frame 3D:`) with all ms/calls, then struct, finish, doorwin, device, furn, plan each with ms and calls; the calls add up to about the `draw:` total; LEFT X off returns to the plan-layer list
- [ ] LEFT X facing a radiator and the bin: fps stays steady; they look close to desktop View 3D (matte, no gloss: Lambert); PROJECT · PERF `furn` shows a few calls (bin 4 meshes, radiator 3–5, ×2 eyes), not ~120
- [ ] LEFT X in the kitchen (34 Ground device products): fps back near 72+; HUD `draw:` tris about 270k lower than before (both eyes: devices 360k → 90k); outlets and switches still look smooth at arm's length (48-direction plate, slight facets on the corners at most)
- [ ] PROJECT · PERF: after one full sweep the HUD header shows `trigger to copy`; trigger PERF to stop (the label flashes PERF COPIED), then paste somewhere (browser address bar, a note): the report lists build, view, source, floor, fps and every layer's ms and calls
- [ ] LEFT X: door leaves (plain DOOR zones and door products) are drawn swung 90° open toward their swing side, as in desktop View 3D; sliding/garage stay closed
- [ ] PLAN · ADD: PASSAGE is in the type cycle after DOOR (pale lime); it draws two jambs and a dashed lintel; two rooms with different floor materials split at its middle, the same material runs through it; LEFT X shows an open doorway with no leaf
- [ ] MATERIAL · FLOOR: trigger a room, thumbstick-y cycles its material (a swatch badge appears at the room's centre, no colour fill), B/Y clears; same material on rooms joined by a door reads as one region in the readout; HOUSE packs line updates
- [ ] MATERIAL · WALL: aiming near a wall highlights that face; thumbstick-y cycles; a badge sits just inside the middle of the face; door/window area deducted in the m² line
- [ ] MATERIAL · DOOR: trigger a DOOR zone, thumbstick-y sets Lapeyre Ange-Line (an anthracite badge at the zone centre); LEFT X shows the leaf in the opening, handle on the lock side, glass arc toward the hinge, knuckles on the swing face; B/Y clears back to the plain slab
- [ ] MATERIAL · DOOR: set Lapeyre LINE acoustic (white) on a door: a white leaf with three thin tan grooves by the lock edge on both faces, a white frame, no threshold
- [ ] MATERIAL · SWITCH: aim at a double switch (two markers at one point): grip steps the outline between them and the readout shows 1/2, 2/2; trigger selects (amber); thumbstick-y sets Schneider Ovalis; a teal badge appears under it; LEFT X shows a white pyramid-shaped plate with a stadium rocker (upper face flat, lower face slanted) flush on the wall at the right height, facing the room; B/Y clears
- [ ] (2026-09-30) Material card: in MATERIAL · FLOOR hold LEFT grip over a room with Monastère: a card above the left hand shows the stone patch (~1.5 m) with a 50 cm bar and the name; flick thumbstick-y: the card (name and texture) updates once the stick rests ~0.3 s, no stall while flicking; plank oak shows planks with a 1 m bar; no room targeted: the hint
- [ ] Material card, products: MATERIAL · DOOR / WINDOW / SWITCH / FURNITURE with LEFT grip: the product turns slowly on the card (face first), lit, with its W × H × D; world labels/tints never draw over the card; release the grip: the card goes; other modes still show the print sheet
- [ ] MATERIAL · SWITCH: on a double switch (two markers at one point), set Ovalis double on either: both markers take it (teal badges), LEFT X shows ONE plate with a split rocker at their mean height; cycling back to the single keeps it on the selected marker only
- [ ] MATERIAL · OUTLET: trigger an outlet, thumbstick-y sets Schneider Ovalis outlet; LEFT X shows the white plate with a flat round socket (two light pin holes, earth pin above) flush on the wall at the outlet's height; a shutter outlet is not offered as a target
- [ ] MATERIAL · ETHERNET: trigger a single Ethernet socket, thumbstick-y sets Schneider Ovalis RJ45; LEFT X shows the white plate with a flat insert (screw, icon disc, dust cover with its tab at lower right) flush on the wall at the socket's height; a dual Ethernet socket is not offered as a target
- [ ] MATERIAL · WINDOW: trigger a WINDOW zone, thumbstick-y sets Lapeyre Héméra; readout shows size and 1/2 LEAVES; LEFT X shows the white frame in the opening with the handle and hinges on the room side (hinge both = two leaves); B/Y clears back to the plain pane
- [ ] MATERIAL · FLOOR: cycle to Beaulieu oak charme 118×16.4 on a room; LEFT X shows light oak planks along the room's long axis with soft grain and a few knots, no visible repeat; PERF stays usable; takeoff lists packs of 8
- [ ] MATERIAL · WALL on a half wall inside a room (Ground bathroom `r139`): aim at its room side →
  that side highlights and takes the tile; aim inside its footprint → its top (`cap`); the wall
  behind still picks within 5 cm of it. LEFT X: tiles on the side and on the top; readout m²
  (front 1.16, top 0.21 m² for r139); the wall behind no longer counts the hidden 1.1 m band
- [ ] MATERIAL · WALL: set Vernisse white tile 30×7.5 on a wall; LEFT X shows white upright tiles in a straight grid (stacked, no offset) with faint joints (no gloss/relief in AR by design); PERF usable; takeoff in packs of 40
- [ ] MATERIAL · FLOOR (and WALL): set Blue stone mosaic 30×30.4 on a floor; LEFT X shows mid-grey stone sticks (3 × 18 per sheet) with light joints; PERF usable; takeoff counts sheets (1 per pack)
- [ ] MATERIAL · FLOOR: set Etruria HEX octagon Mattone + white tozzetto 15 on the upstairs bathroom; LEFT X shows terracotta octagons with white corner diamonds and thin light joints; the readout shows octagons + tozzetti
- [ ] MATERIAL · FLOOR: set Terrazzo marble cream 60×60 on a room; LEFT X shows an off-white floor speckled with pale marble chips and faint 60 cm joints; PERF usable; takeoff counts tiles
- [ ] MATERIAL · FLOOR stepped (2026-09-29): set Monastère beige stone, stepped 30/50 on a room with no start corner; LEFT X and View 3D show the stepped layout (30×30, two 50×30, a 50×50 and a 30×50 per module, staircase diagonals, no joint crossing the room) with a module centred in the room and similar cuts on opposite walls; no seam lines in the stone; the per-size lines read 50×50 · 30×50 · 30×30; set a start corner: a whole 30×30 sits in it; turn: the steps run the other way
- [ ] (superseded 2026-09-29 by the stepped layout) MATERIAL · FLOOR: set Monastère beige stone, pinwheel 30/50 on a room; LEFT X shows greige stone tiles in the 130 cm pinwheel (a 30×30 centre, 50×50 arms, 30×50 corners) with cream joints and rounded edges; the readout has one line per size including 30×30 (e.g. `50×50 39 pcs (9 cut)`), then one HOUSE line with boxes per size in the same order (`HOUSE 8 · 4 · 2 packs`); all 6 lines fit the pill (owner saw no 30×30 before the fix)
- [x] MATERIAL · FLOOR start corner (owner, 2026-09-27: "works great for the place i want"): select a room with Monastère, point near a corner, A/X; an amber L appears in that corner (inside any lining), the quantity line ends `⌞ CORNER`, the per-size counts change, and LEFT X shows a whole tile at that corner with the pinwheel running from it; A/X on the same corner removes the L and restores the origin counts; changing the material keeps the corner; save/reload keeps it
- [ ] MATERIAL · FLOOR / WALL grout: a tiled room's quantity line ends with `… kg grout` (Monastère ≈ 0.33 kg per m², so a 10 m² room ≈ 3.3 kg); the HOUSE line has no grout; a plank floor shows no grout; all lines still fit and read in the pill
- [ ] MATERIAL · FLOOR octagon: Etruria on a room; LEFT X shows the white tozzetti as squares square to the walls, terracotta octagons between them in diagonal rows, no seam lines; the readout counts octagons + tozzetti
- [ ] MATERIAL · FLOOR turn: Blue stone mosaic on a room, A/X in the middle of the room: the sticks turn 90° in LEFT X, `↻90°` on the quantity line, counts change; again: back. Charme: planks swap direction. A/X near a corner still sets the start corner. A room deeper than wide with Monastère: the pinwheel spins the same way as in a wide room
- [ ] MATERIAL · DOOR on a SLIDING zone (opening ≤ 83 cm): only the postformé rail door cycles; LEFT X shows the white 3-panel leaf parked beside the opening toward the zone's hinge end, on the black rail with two wheels, on the zone's swing face; PLAN · EDIT A/X moves it to the other side / face; the readout shows `LEAF 0.83 × 2.04` (red if the opening is wider)
- [ ] MATERIAL · WINDOW porte-fenêtre: set Lapeyre Héméra PVC French door on a WINDOW zone with sill 0; LEFT X shows 2 full-height leaves with 5 hinges per side and the handle on the meeting stiles, whatever the zone's hinge; the readout says 2 leaves
- [ ] MATERIAL · WINDOW Néva: set the Néva sliding bay on a WINDOW zone with sill 0 (e.g. 180 × 215); LEFT X shows two overlapping sashes on two tracks in a deep frame, the lever on the room side; the readout says 2 leaves
- [ ] MATERIAL · WALL: set Lucia ivory stone 30×90 on a wall; LEFT X shows pale ivory landscape tiles stacked with thin joints; takeoff counts tiles and packs of 5
- [ ] MATERIAL · FURNITURE: set the W. Hoffmann V120 piano on a furniture zone against a wall; black case 1.51 × 1.20 m with the keys facing the room, brass pedals and castors; true size against the real piano
- [ ] MATERIAL · FURNITURE: set the ACOVA Angora towel radiator (133.2 and 172.8 cm) on a furniture zone against a wall; its foot jumps to 22 cm; LEFT X shows a white ladder 50 cm wide with the bars in three groups (dense, wide, dense), 8.9 cm deep with the brackets on the wall side; true height against the real one
- [ ] MATERIAL · FURNITURE: set each De'Longhi EASY radiator (vertical 50 × 180, 50 × 200 and 60 × 200, horizontal 90 × 60 and 120 × 60) on a furniture zone against a wall; its foot jumps to 15 cm; LEFT X shows a white panel with 14 / 14 / 17 / 26 / 35 vertical slots inside a flat border, the gap on the wall side; the horizontal one has a dark grille on top and round ports on its ends
- [ ] MATERIAL · FURNITURE: set the JOYFURNOS double pedal bin on a furniture zone; it stays on the floor; LEFT X shows a cream 59 × 62.4 × 36.5 cm bin with a steel top frame, two closed lids, two pedals at the front and a black handle on each side; colour against the real one
- [ ] MATERIAL · FURNITURE: set the V&B Architectura WC (4694R001) on a furniture zone against a wall; it hangs with the rim 41.5 cm up and its back on the wall; LEFT X shows a white 37 × 53 cm pan with a slim seat and closed lid; outline and height against the real one
- [ ] PLAN · EDIT on a furniture zone with the Daikin CTXM15A: type FOOT 230 cm → the unit rises (accepted although above its old 2.30 m top); ⇄ TOP, type 250 cm → foot 2.202 m (top − 29.8 cm); the model follows in LEFT X
- [ ] LEFT X toggles the AR 3D view: walls/doors/windows/stairs and textured finishes appear over the real room at the right height, real floor still visible; toggles off again; works in ALL FLOORS; PERF with it on
- [ ] Overlays that never rendered before the PLAN_OVERLAY_GROUPS fix now show: Z-dims, adjacent-floor target dots (CONDUIT/WIRE/PIPE), CHECK rings, MATERIAL badges
- [ ] ALL FLOORS LEFT stick up/down teleports one storey (target floor under your feet), keeps the mode and a pending wire endpoint; leaving ALL FLOORS restores the physical registration; inert on single floors
- [ ] Returning to a real floor restores PLAN/MARKER traversal and editing
- [ ] Thumbstick-y changes floor **only in LEVEL** (no-op in modes without a cycle action)
- [ ] Numpad types a storey height; **ENTER** sets the active floor's height and re-stacks elevations
- [ ] Label reads `LEVEL · <FloorName>`; pad title shows the floor's base elevation
- [ ] Stacking: editing **Ground** height lifts **Upper**; editing **Basement** height drops Basement
- [ ] Editing the topmost floor's own height moves nothing (expected)
- [ ] DEL is inert here
- [ ] **SWAP** (`⇄ SLAB` / `⇄ STOREY`) switches the field: the slab title reads `<Floor>  ceiling 2.7 m  ·  slab`, prefilled with the slab; ENTER on 0.25 lowers the walls and the painted ceiling (LEFT X) to 2.70 while Upper stays where it was; 0 is accepted, a slab ≥ the storey height is refused
- [ ] A new light marker lands at the ceiling (2.70 on Ground with a 0.25 slab), not at 2.95

## SETUP · TELEPORT (`teleport`)  ⬜ NEW — build-verified only
- [ ] Pointer reticle tracks the active floor
- [ ] Trigger brings the reticle's plan coordinate beneath the headset without changing height
- [ ] Repeated teleports accumulate correctly
- [ ] Survey geometry, dimensions, yaw, and anchored `planPos` are unchanged
- [ ] Switching modes keeps the teleported position; ORIGIN/RECAL clears it
- [ ] (2026-09-30) Teleport, then FLOOR-touch the real floor: the plan's height updates but you stay where you teleported, and the plan does not turn (also after the headset slept and woke)
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
- [ ] A bare junction's cyan floor→height dim shows in CONDUIT / CONDUIT EDIT / WIRE / CONDUIT · DIMS and disappears in every other mode (markers' amber and apertures' blue height dims stay)
- [ ] MARKER · CONDUIT: trigger a marker/node to start the pen (readout START PEN→RUN CONDUIT); trigger empty space drops a junction + runs a segment; trigger another node joins/branches/loops; grip lifts the pen (no deletion)
- [ ] The live network draws in `conduitGroup` colored per inferred surface, with a node sphere per vertex (marker-bound dimmer); the pen node is amber, hover yellow, and a preview runs pen→tip
- [ ] CONDUIT · EDIT: trigger a free junction selects it and opens a height pad; trigger a segment between nodes splits it with a new junction at the reticle and selects it; trigger empty space deselects
- [ ] Grip-drag a node NEAR the tip carries it 1:1 in full 3D (direct); FAR moves only X/Y via the floor reticle while z holds (remote); release persists; height pad typing + ENTER sets a free junction's z
- [ ] A marker-bound node cannot be moved (follows its device) and opens no pad; grip away from a selected node deletes the node + its segments and drops `via` references to it
- [ ] CONDUIT · EDIT select a conduit: the readout adds `LENGTH 1.23 m` (tape-measure it between the two nodes); on a run through bare junctions it also adds `RUN 3.40 m (3)` that stops at a device or a T; a vertical drop counts its height; units follow PROJECT · UNIT
- [ ] CONDUIT · EDIT B/Y on a node in the middle of a run (2 segments): the node goes and one straight conduit joins its two neighbours; a wire routed through it keeps its route. On a T-junction (3 segments): all three segments go
- [ ] (2026-09-30) Long names never cut off: in MATERIAL · WINDOW pick Baie coulissante Néva (FR): the readout pill widens (grows both sides) and the whole name reads; short readouts keep the old pill width; the mode label pill widens the same way for long breadcrumbs
- [ ] MARKER · WIRE: with a device AND a wire in the reticle, grip cycles device → wire (and on through the stack); trigger on the yellow wire selects it
- [ ] MARKER · WIRE: with 2+ devices/wires in the reticle, the readout's last yellow line reads e.g. `switch 1/3`, then `wire electrical 2/3`… as grip advances, wrapping to 1; with a single target there is no such line; a stacked switch still shows `→ 1× light`
- [ ] MARKER · CONDUIT and CONDUIT · EDIT: with 2+ nodes/conduits/devices in the reticle, the last yellow readout line reads `node 1/3`, `conduit 2/3`… and each grip steps `i` by one, wrapping to 1; none once a node or conduit is selected in EDIT
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

## Stairs in the AR 3D view (LEFT X)  ⬜ NEW (2026-10-01) — Node-verified only
- [ ] Ground STAIRS UP: 8 treads from 18 cm up to 1.44 m, not the full storey; Upper STAIRS DOWN: 8 treads from −18 cm down; together they meet the real stair
- [ ] Basement STAIRS UP (7 treads to 1.26 m) + Ground STAIRS DOWN (5 treads to −0.90 m) match the real basement stair
- [ ] Tread depth (25 cm assumed) against the real treads; the same treads in desktop View 3D

## HEAT LOSS · WHAT IF  ⬜ NEW (2026-10-05) — Node-verified only
- [ ] The panel shows HOUSE W · kWh/yr under the title, and "All insulation and windows counted"
- [ ] Wall insulation / Attic insulation / Windows → no: the room labels and heat map change, a red "vs all counted" line appears; back to yes removes it
- [ ] A window drawn through the outdoor insulation: the room's openings rise (≈ 10 W per metre of edge at ψ 0.4); Reveals insulated → yes gives a green saving line
- [ ] Reload: the switches are back to yes; the panel still fits in view (it grew by four rows)

## HEAT LOSS · thermal bridges  ⬜ NEW (2026-10-06) — Node-verified only
- [ ] HEAT LOSS draws coloured bars inside the exterior walls: at the floor (amber over earth or the basement, pink over a heated floor), at the ceiling (pink under a heated floor, cyan under the attic), green posts where a partition meets the façade, red frames around windows
- [ ] Each bar sits where the real junction is (floor line, ceiling line, the partition's end, the window's edge); none on interior walls; missing or invented ones noted with their room
- [ ] The reticle 5–15 cm inside a wall reads e.g. "Intermediate floor · at ceiling · 31 W / wall uninsulated / ψ 0.86 × 3.40 m × ½"; one line each where floor, ceiling and window overlap
- [ ] The room breakdown and the readout show `bridges <W>`; Upper · Heavy floor → no removes the pink bars between Ground and Upper (both floors), Heavy attic floor → no the cyan bars on that floor, posts green at thick (≥ 10 cm, meulière) partitions and grey at thin plaster ones (readout "7 cm light partition: not counted"); every thick partition meeting the façade has a post; the totals drop
- [ ] The panel (two more rows) still fits in view; frame rate unchanged

## HEAT LOSS · heaters  ⬜ NEW (2026-10-05) — Node-verified only
- [ ] A room with a radiator product reads `<loss> W · rad. <W> W`; its breakdown shows HEATERS (green when ≥ the loss)
- [ ] The floor's heaters line under the title; Radiator water ΔT 30 → the heaters roughly halve
- [ ] A window in a wall with outdoor insulation: Reveals insulated → yes gives a green saving line (it showed none on `0078f1b`)

## HEAT LOSS · whole-house balance  ⬜ NEW (2026-10-07) — Node-verified only
- [ ] WHOLE HOUSE · Whole-house balance → yes: labels add `· <°C>`; the header shows `Water needed ΔT 28.6 K (50.6 °C)` (headset plan, −7 °C, 22 °C); the plaster λ row lights up
- [ ] Aim the ground shower room: `Reaches 20.4 °C · from neighbours +23 W` in red; the hall and the upper landing both read `… · with the stairwell` with the same temperature
- [ ] Outdoor 0 °C: every room with a radiator reads 22.0 °C (green); the panel stays responsive after an edit (it recomputes once)

## OUTDOOR room (veranda)  ⬜ NEW (2026-10-05) — Node-verified only
- [ ] PLAN · EDIT: select the veranda room, A/X → TYPE reads `OUTDOOR ROOM`; A/X again → `ROOM`
- [ ] HEAT LOSS: the veranda shows no watts; the kitchen's wall to it now loses heat; the EDIT area of the veranda and the kitchen are separate
- [ ] SAVE / LOAD keeps the flag; desktop panel shows ☀ Outdoor room

## PLAN · RULER (`ruler`)  ⬜ NEW (2026-10-05) — build-verified only
- [ ] Trigger at a point: X, Y, Z and DIST follow the tip, the coloured legs and the A → B line follow it; the readout sits clear of the mode label
- [ ] Trigger again: the values and lines freeze; a third trigger starts a new A
- [ ] Measure a wall the plan already dimensions: X (or Y) matches the dimension; Z of a level move stays near 0
- [ ] Teleport or turn with the left stick: the frozen ruler moves with the plan; the lines read as thick coloured tubes
- [ ] Leaving RULER clears the measurement; the readout changes with PROJECT · UNIT

## Conflicting dimensions: suspects  ⬜ NEW (2026-10-04) — Node-verified only
- [ ] PLAN · DIMS: type a value that conflicts → `!CONFLICT`; the pill shows `<value> · off by <x>`, `n to remeasure`, `#1…#4 stored → implied` (the typed one yellow), and pink `#k` tags sit on the suspects' labels
- [ ] Aim at a red value (if one is stored): the same pill and tags; aiming away removes the tags
- [ ] Remeasure the suspects: the wrong one reads its implied value; correcting it clears the red
- [ ] Two wrong dimensions in one loop: `2+ dims wrong`, no tags

## HEATING · PIPE / HEAT LOSS / R / U  ⬜ NEW (2026-10-01) — build + Node-verified only
- [ ] The HEATING group follows MARKER in the mode cycle: PIPE (moved from MARKER), HEAT LOSS, R / U; PIPE works as before
- [ ] Entering it shows each heated room's watts (orange) on the active plan; leaving removes them
- [ ] The panel title shows the floor's TOTAL; aiming at a room fills the breakdown box (walls · openings · air · floor · ceiling, ext. wall / insulated / opening m²)
- [ ] Ray on a row + thumbstick up/down steps it; labels and TOTAL update at once; trigger resets a value to its default (grey) and toggles HEATED
- [ ] Basement HEATED → no: its rooms lose their labels, and Ground's floor watts drop (slab over an unheated floor)
- [ ] Attic insulation R 7 on Ground/Upper cuts the ceiling part strongly (Node: Ground 12.1 → 8.8 kW)
- [ ] (2026-10-04) WALL zones show `R ≈x` in R / U too (r135 ≈0.31, r112 ≈0.09) and take a typed R; HEAT LOSS settings show the undrawn wall depth (0.20 m) and wall λ (0.80) instead of bare wall R; Ground ≈ 9240 W, Upper ≈ 8329 W (Node, with Basement heated as stored)
- [ ] (2026-10-04) HEAT LOSS · Earth level (default 0.00 m): the Basement's rooms show `walls in earth` m² (Node: Basement 2856 W at 0, 6982 W with the earth below the house); stepping it up past 0 lowers Ground's watts (Node +0.5 m: 9240 → 8685 W)
- [ ] R / U: each insulation zone shows `R ≈x` (grey) or `R x` (orange), each window/door `U ≈1.4` / `U ≈2.0` or its typed U; trigger opens the numpad, ENTER sets it, CLEAR / empty ENTER clears it; HEAT LOSS watts follow (Node: 5 Ground windows at U 2.8 → their part 336 → 672 W)
- [ ] (2026-10-04) R / U: SWAP shows `⇄ λ`; type 0.032 → label `λ 0.032` (orange), readout `… mm / λ 0.032 (from the typed λ)`; SWAP back to R shows empty, typing R clears the λ; same on an insulation zone's PLAN · EDIT pad. Overlapping layer zones count once, at the larger R (Node: r135 drawn twice → Ground unchanged)
- [ ] (2026-10-04) HEAT LOSS heat map: coloured strips outside exterior walls (Ground: mostly yellow ≈62 W/m², the insulated living-room wall blue, r112 red), thin outer strips at windows; ceiling tint (living room half grey under Upper, half red); thumbstick off the panel → FLOOR (pale blue on earth, grey over the heated basement); the readout follows the reticle (column bands, piece U/W/m²/area/W, room parts, legend); frame rate unchanged
- [ ] (2026-10-05) RECESS: PLAN · ADD cycles to RECESS (pale cyan); the band pad shows SILL / HEAD (0.90 / 2.10); drawn over a lining beside a window, View 3D / LEFT X shows the lining open only between sill and head and the outer wall intact; HEAT LOSS readout on that wall shows a `recess` band (U, W/m², sill–head, R); print/DXF show its outline only
- [ ] (2026-10-05) PLAN · DIMS: the debug HUD `edge:` line shows the lit edge's zone id, side + length (`r55.bottom · 4.40 m`), nothing when no edge is lit; a conflict readout shows ids in its lines (`#1 c215 …`)
- [ ] (2026-10-05) A conflicting dimension shows a yellow ⚠ at eye level (1.55 m) on a red stem to its label, visible through walls; it goes when the conflict is fixed; a refused value shows numbered signs (pink stems) over its suspects, matching `#1…` in the readout; frame rate unchanged
- [ ] (2026-10-05) Conflict routes: the suspects line ends `↕ n routes`; thumbstick down shows `ROUTE 1/n · value · off by` with its dims and light-blue numbered signs over them, again for the next route, then back to the suspects (r59.bottom → r60.bottom 4070: 2 routes, both 3990)
- [ ] (2026-10-05) PERF on Ground plan view after the furniture batch: `furn` ≈ 6 calls (was 132); `fps … (all drawn)` near 90 (was ≈53 from `all` 19 ms); furniture pieces look as before (fill, outline, notch, dashed when wall-hung)
- [ ] PLAN · EDIT on an INSULATION zone opens the pad as R (m²K/W) too; a room's `area:` HUD line adds its watts
- [ ] Settings survive SAVE/LOAD and an APK relaunch (project data, autosaved)
- [ ] Not offered in ALL FLOORS
- [ ] Owner sanity check: a room's watts against an existing radiator that keeps it warm

## PROJECT · LANG (`lang`)  ✅ session 14
- [x] Thumbstick up/down moves through FR / EN / ZH
- [x] Trigger picks the ray-aimed row (or advances one if the ray is off the panel)
- [x] All UI text switches (labels, help, numpad, slot menu, LEVEL pad, DIMS titles)
- [x] Choice persists across an APK relaunch
- [x] ZH help text wraps (CJK-aware) without overflowing the box

## Furniture: MATERIAL · FURNITURE  ⬜ furniture merge (2026-09-27) build/Node-verified only

- [x] FURNISH is gone from the mode cycle (MATERIAL follows MARKER · PIPE) — owner, 2026-09-27
- [x] LEFT X on: only the 3D model shows (no zone fills, dims, labels, marker glyphs, badges, origin gizmo); reticle, HUD and panels still work; LEFT X off: every overlay the mode shows comes back — owner "that works", 2026-09-27
- [ ] A FURNITURE zone with a product behaves like any PLAN zone: EDGE/DIMS dimension it to a wall, PLAN · EDIT moves or deletes it, A/X in PLAN · EDIT turns it 90° (the zone swaps width/depth about its centre)
- [ ] MATERIAL · FURNITURE: trigger a FURNITURE zone drawn in PLAN; thumbstick up/down cycles the catalog (none first); the zone resizes to the product; readout shows name and w × d × h; a violet badge sits at the zone centre
- [ ] MATERIAL · FURNITURE: A/X turns the selected product 90°; B/Y clears it (the zone keeps its size, the violet badge goes)
- [ ] A furniture zone dimensioned to both walls, then given a product too wide for the gap: the second dimension disappears and the label flashes `DIM REMOVED · <miss>`; the walls don't move
- [ ] A slot saved before this build with FURNISH items (the old mode) loads with each item as a furniture zone carrying its product, at the same place and height, turned to the nearest 90°
- [ ] With the 3D view off, product zones show flat violet footprints on the floor (V notch on the front edge, dashed for a wall-hung unit)
- [ ] LEFT X on: the 3D models appear and the footprints disappear; LEFT X off: back to footprints
- [ ] Set `daikin-ctxm15a` on a furniture zone drawn on a wall: it starts with its bottom at 2.0 m (the band pad's foot shows 2.00), back flat to the wall once turned, flap and sensors facing the room at the bottom right; its size looks right against the real wall
- [ ] Same for `daikin-ftxm60a`: visibly wider (997 mm) and deeper than the CTXM15A
- [ ] HEATING · PIPE: the four green REFRIGERANT lines run from each AC unit out through the west wall, along the façade and down to the 5MXM90A (r217); selecting one shows `REFRIGERANT · … · <length>` matching docs/plumbing-workflow.md; thumbstick cycles the service through REFRIGERANT
- [ ] MATERIAL · WINDOW swing overlay: on the ground floor, window r80 shows its left leaf green to 180° and its right leaf stopping near 77° with the CTXM15A r216 outlined red; the readout lists `LEFT LEAF 180° · OPENS FLAT` and `RIGHT LEAF 77° · <unit>`; the pale leaf panel stands where the real sash would touch the unit
- [ ] View 3D: ◫ Windows open (max) swings every Héméra leaf into the room, each stopping at its obstacle (no leaf through a radiator or AC unit), the lever on the right-hand leaf; toggling back closes them; the choice survives a reload
- [ ] MATERIAL · OUTLET on a SHUTTER outlet: the reticle picks it, the Ovalis product applies (teal square) and LEFT X shows the plate in its place; on m164/m144 (upper floor), see whether it touches the CTXM15A above it
- [ ] Cycle to `habitat-moder-ii-110`, then `habitat-moder-ii-155`: a 110 cm round footprint, then 155 × 110; with LEFT X on, an oak table 75 cm high, one seam across the round top, two seams and the leaf's fold on the long one, four splayed legs
- [ ] Cycle to `sensea-neo-120x80`: an 80 × 120 cm footprint on the floor; with LEFT X on, a thin white slab (27 mm) with the drain cover at the back end; does the drawn step and cover read at a glance

## IKEA kitchen units (`metod-*`)  ⬜ NEW (2026-10-04) — scratch-render verified only

- [ ] With LEFT X on, every unit loads (no grey placeholder box left after a few seconds online; offline after one visit)
- [ ] The units read as the planner's front views: tall unit with oven/microwave gap, drawer stacks 40/20/20, corner door on the open part, sink + tap, dishwasher door, end panels, white framed wall doors with knobs at the 10|11 and 12|13 junctions
- [ ] Worktop top at 92 cm, wall cabinets 148–248 cm; nothing floats or sinks; no gap between worktop A and B
- [ ] View 3D shows the same; frame rate acceptable on the Quest with all 16 zones

## Desktop: textures prepared in a worker  ⬜ NEW (2026-10-03) — Chrome-measured, not seen on a device
- [ ] Open a share link with finishes (Realistic on): the plan pans smoothly, no counter, no UPDATING MODEL while in plan view.
- [ ] ◈ View 3D: a wheel with `Preparing 3D · textures n/N`, then the 3D view opens; `✕ Cancel 3D` while waiting returns to a working plan. Note any `· on page`.
- [ ] Open 3D: every finish is textured (no flat colour left), with the Monastère/Lucia grain up close; Realistic still swaps in the Charme/Monastère photos.
- [ ] iPhone 14: the same (the worker path), or the page fallback with no error.
- [ ] Phone: the owner's link → ◈ View 3D opens without the canvas crashing (half-size textures); switch floors, toggle Realistic; leave the app and come back (a lost WebGL context would show flat textures).
- [ ] Furniture (radiators, shower tray, piano, bed, its legs too) and door leaves show their pictures, not a flat colour; the AR 3D view's finishes and window exterior too.

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
- [ ] EXPORT · LINK with the FURNITURE layer off: open the copied link on desktop; View 3D shows the furniture products (2026-10-03 fix)
- [ ] EXPORT · LINK, opened on desktop: windows (Héméra, Néva), door products and floor/wall finishes show in View 3D (2026-10-03)
