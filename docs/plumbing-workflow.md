# Plumbing workflow

Plumbing is a separate whole-house lane from electrical conduit and wires.

## First AR authoring slice

`HEATING · PIPE` (was MARKER · PIPE until 2026-10-01) authors a whole-house node graph. A node is either a free junction
`{x,y,z,floorId}` or a logical fixture port `{markerId,role}` that follows its marker.
Pipe segments join two node ids and carry their service and diameter. Thumbstick up/down
chooses one of seven services:

- cold water
- hot water
- heating supply
- heating return
- refrigerant (owner, 2026-10-07): an air-conditioning line from the outdoor unit to one
  indoor unit, drawn as one run standing for the liquid + gas pipes and the connection
  cable. Each line is its own network (its own nodes), so selecting any segment (PIPE EDIT) reads that
  line's length: the readout adds the 3D length of the selected pipe's whole network,
  risers included (`pipeComponentLength`). Buy that plus slack per line.
- VMC (owner, 2026-10-07; `vmc`, light grey): a ventilation extract duct. Its `diameter` is
  the duct's (Ø80 wet-room extract, Ø125 kitchen / outlet), so the ribbon shows its real
  width; a segment drawn in AR starts at Ø80 (no diameter editor yet: a written plan carries
  the real ones). All ducts of one unit form one network through a node at the unit's
  centre, so selecting any of them reads the unit's total plus each diameter's length
  (`pipeLengthText`): the shopping list, with ~0.2 m per duct inside the box as slack.
- waste (owner, 2026-10-08; `waste`, brown): soil and waste drainage and its roof vent, drawn at
  the pipe's diameter (Ø100 for a WC; an AR-drawn segment starts at Ø100). No slope or flow
  direction yet: the fall is carried by the nodes' heights.

Fixture ports are logical, not spatial model connectors. Their role is inferred from the
service (`cold`, `hot`, `supply`, or `return`), so one radiator or boiler marker can own
both supply and return nodes and both follow the marker when moved.

Available plumbing fixture markers are radiator, boiler, sink, and washing machine.

### Pipe anchors (owner, 2026-10-17)

A **pipe anchor** is a marker for a point where a pipe is already known to pass: a hole already drilled
through the ground slab to the basement, a wall sleeve, a duct already sealed in place. Four types, one per
service: `pipe_anchor_heating`, `pipe_anchor_water`, `pipe_anchor_waste`, `pipe_anchor_vmc` (the last four in
MARKER · EDIT's type list; place it with the tip at the hole's centre, so a slab hole has z 0, and dimension it
to the walls like any marker).

**It has no function in the app** (owner: "they only serve you as a beacon to identify a point in space"). It
is not tied to a pipe: no pipe binds to it, nothing moves to it, the electrical checks ignore it. It shows as a
ring in its service's pipe colour: lying flat when it is at the floor or the ceiling (a slab hole), otherwise in
the plane of the wall within 30 cm (a wall hole), in View 3D (one instanced mesh per floor, a single draw call however many anchors) and as a billboard in AR; on sheets and in DXF a
double circle with the letter H (heating), W (water), D (drain, waste) or V (VMC).

**The routing rule (for any agent drafting a route):** a route of a service must pass through every anchor of
that service on its way. Before proposing or writing a pipe layout, list the anchors and check the draft:

```
node tools/house-query.mjs anchors <house.json>
```

Each anchor prints its position and either `PASS` (a pipe of its service within 5 cm of its axis,
`PIPE_ANCHOR_TOLERANCE` in `src/core/pipeAnchors.js`) or `OFF` with the nearest such pipe and its distance. A
heating anchor accepts a supply or a return, a water anchor cold or hot; refrigerant lines have no anchor type.
An `OFF` anchor is a route to rework, or a question for the owner, never something to move.

**The pipe tools work like the conduit tools** (owner, 2026-10-12: "Make the same interaction as conduits"):

- **HEATING · PIPE** (draw, as MARKER · CONDUIT). Trigger a fixture, an existing junction or empty space to
  start the pen. Empty space drops a free junction; each later trigger adds a segment and advances the pen,
  for bends, branches and loops. **Triggering an existing pipe splits it** into a T at the pipe's height,
  with the same service and diameter on both halves (`splitPipe`), and the pen joins it. Grip cycles
  overlapping fixtures/junctions/pipes, or lifts the pen over empty space. **B/Y undoes the last pen step**
  (`undoPipePenStep`; a T step re-joins the split pipe). A service change made by a confirmed merge is
  not undone. PIPE no longer selects pipes: that is PIPE EDIT's job.
- **HEATING · PIPE DIMS** (as CONDUIT · DIMS): pin a bare junction to a wall edge, one way. The pin is a
  `{node}` constraint endpoint like a conduit junction's (pipe ids `pn…` never collide with conduit ids `cn…`),
  solved by `solveConduitNodes`, kept by save/load and floor copy/paste.
- **HEATING · PIPE EDIT** (as CONDUIT · EDIT): grip cycles overlapping junctions and pipes, trigger selects.
  A selected free junction opens the height pad (SWAP free/floor, DEL frees Z) and can be grip-dragged
  (near = carried in 3D, far = the floor reticle moves X/Y; a defined height holds). A selected pipe reads its
  whole network's length (`pipeLengthText`); thumbstick retypes its network. B/Y deletes the selection; a
  junction between exactly two pipes re-joins them (`removePipeNode`), a branch junction loses them all.

In ALL FLOORS, aiming down favours your own storey and aiming up the one above, and grip reaches farther
storeys (the `docs/ar-survey.md` reticle rule); PIPE and PIPE EDIT work there, PIPE DIMS does not. Join
storeys to create risers.

Colors are blue (cold), red (hot), orange (heating supply), purple (heating return), green (refrigerant), light grey (VMC), and brown (waste).

Service is edited as a connected-network property: changing any selected segment retypes
every segment reachable through pipe nodes and updates fixture-port roles. While extending,
the pen/source component is authoritative. Joining a component of another service first
shows the destination component in warning red and makes no change; trigger the same target
again to confirm conversion and connection, or grip to cancel. This prevents an accidental
touch from silently erasing the destination network's service.

## Deferred after the first slice

- diameter editing and reducers
- fixture-specific allowed-role validation
- exact spatial connector offsets on detailed 3D appliances
- valves, manifolds, and connected-network inspection
- print/DXF layers and legends
- wastewater slope and flow-direction semantics (the `waste` service draws the pipes; the fall is in the node heights)

## Air conditioning: the owner's multi-split (2026-10-07)

The owner's **Daikin 5MXM90A** outdoor unit feeds four wall units: an **FTXM60A** in the ground living
room and **CTXM15A**s in the ground 13.9 m² room and the two upper bedrooms. Everything below is in the
headset plan (Proven: written and read back identical, 2026-10-07); the owner placed the ground units.

- **Outdoor unit `r217`** (Ground, plain furniture box, no catalog model): 974 W × 734 H × 408 D mm
  (Daikin spec table), against the **west façade under camera m183**, flush with the north-west corner
  (`c1442`), **100 mm off the insulation face** (`c1441`), on a 150 mm stand (foot 0.15, top 0.884).
- **Indoor units** (Daikin's spacing kept, Proven by a clearance check on the plan): ground `r215` FTXM60A over
  window r108 and `r216` CTXM15A over window r80 (bottom 2.30, 30 mm above the 2.27 window head); upper
  `r148`, `r149` CTXM15A beside their windows (bottom 2.202, top 2.50). `r148` is exactly 50 mm from
  the partition (Daikin's minimum).
- **Refrigerant lines** (HEATING · PIPE, service `refrigerant`, one network per unit, `pn1`–`pn35`,
  `p1`–`p31`): ground units leave by their right side to a hole just past the window edge (at the
  aircon outlets m151, m147: not through the lintel); upper units go out behind their right end. Two
  far lines share a façade duct ~3.1 m above the ground floor (clear of every opening and shutter box);
  every line comes down beside r217 at its own height (0.30–0.48 m) so none cross. Drawn lengths:
  r215 4.66, r149 5.48, r216 10.84, r148 11.44 m = **32.41 m**; buy +1 m each (flare re-cuts, slack at
  the indoor unit, measuring error). Pipes: FTXM60A 1/4″ + 1/2″, CTXM15A 1/4″ + 3/8″ (owner).
- **Hypotheses in those lengths:** the ground outside is at the ground-floor level; r217's connections
  are on its south side, 10 cm in front of its back, 0.30–0.48 m up; hole positions ±10 cm from
  Daikin's mounting-plate drawing. A buried route (under door r81 and window r108) was costed and not
  chosen (a 6.4 m trench; about the same length).

**Daikin rules used** (Proven: read in the manuals, 2026-10-07):
- Indoor (CTXM-A/FTXM-A installer reference guide 4P518023-17P): bottom ≥ 1.8 m above the floor,
  ≥ 30 mm to the ceiling, ≥ 50 mm to a side wall; factory piping exits right (right / right-back /
  right-bottom, or left the same by moving it); wall hole Ø65 mm (class 15–42) or Ø80 mm (50–71),
  sloping down outside; nothing that may get wet under a unit (condensate). R32 minimum room area for a
  wall unit: the 5MXM90A's maximum charge is 3.3 kg → about 10.3 m² from the guide's table; every room
  with a unit is ≥ 13.9 m².
- Outdoor (5MXM-A9 installation manual 3P600450-9V): ≥ 3 m and ≤ 25 m of line per indoor unit, ≤ 75 m
  in total, height difference ≤ 15 m (outdoor–indoor) and ≤ 7.5 m (indoor–indoor); no extra
  refrigerant up to 30 m of liquid line, then (total − 30 m) × 0.020 kg; ports A + B 3/8″ (classes
  15–42), C 1/2″ (42–60 direct; 15–42 with reducers 2 + 4), D + E 5/8″ (reducers); at least two indoor
  units; space: back (air inlet) > 100 mm, sides > 50 mm, front (outlet) > 350 mm, 250 mm for piping and
  electrical servicing, 150 mm free below (pedestal), 100 mm above the expected snow.

**Open (ask the owner):** whether the ground windows' roller-shutter boxes are inside the room (the
units sit only 30 mm above the heads); the real ground level outside; the outdoor unit's connection
side and height. Window opening against the units: docs/materials.md "Window swing".

## VMC: two Sauter Agalina units (2026-10-07, draft)

**Unit B turned, radiator to the north wall (owner, 2026-10-14, evening; written to the headset, read back identical,
284 914 chars). Supersedes the basement routes of the blocks below.**
- **Laundry radiator r224 on the laundry's north wall** (x −4.33…−3.13, 1 cm off the wall): its flow and return tee off
  the pair where it enters the laundry (y −2.33 / −2.37; the pair that also feeds ground radiator r205), so no heating
  pipe crosses the south half of the laundry ceiling any more. 20 cm east of its old x so the flow drop clears the waste
  stack in the north-west corner (−4.5, −2.3) by 5 cm; east end 19 cm from the switch stack at x −2.93. Its branch is
  ≈ 5.3 m of pipe instead of ≈ 9.6 m.
- **Unit B turned 90° clockwise** (`facing` 270: OUT Ø160 and the laundry Ø80 west, kitchen Ø125 + bath Ø80 east, the
  side Ø80s north, the lug south), centre (−4.25, −4.475). Spigot ends Proven with the builder at facing 270.
  OUT runs **straight west through the west wall** (y −4.56). The owner chose the west wall (outside above ground at
  1.95 m: Proven 2026-10-17 from the headset plan, the Garden level at −0.90, i.e. 1.37 m on the basement's scale, so the
  Ø160's axis is 0.58 m and its underside ≈ 0.50 m above the garden; window r146's sill 1.32 is 5 cm under it, its
  light well r235 going down to 0.90) and asked for it as far south as possible: the limit is the kitchen duct, which needs
  ≈ 18 cm between its chute's bottom elbow and its turn west (Ø125 elbows, Hypothesis).
- **Kitchen and bath ducts flat at spigot height (1.955 m)**, straight west into B's east face (kitchen lane y −4.575,
  bath y −4.38): the chutes drop 31.5 cm (the nicks are unchanged: they depend on the slab and the duct size only).
  The bath dip under the heating and both ducts' last turns are gone. Upper duct: down the west wall, then two 45s
  into the north face's west Ø80. Laundry vent: the 8 cm stub, now off the west face.
- ~~**Open (owner checking): the laundry window r146** (single leaf 1.26 m …): the ducts block it at 21°.~~ **The
  owner (same evening): r146 has two leaves**, and the pipes must not block it: **written to the headset 2026-10-14 night
  with the hood and alcove draft below (287 333 chars, read back identical)**: r146 `hinge` 'both' (two 0.611 m leaves, hinges at x −3.091 and −1.869, y −4.882, Proven with
  `windowSwings`), unit B **kept at facing 270, centre moved to (−4.25, −4.06)** (rect y −4.24…−3.88): the kitchen lane
  at y −4.16 (1 cm past the leaves' sweep with a 3.5 cm sash half-thickness), bath −3.965, OUT at y −4.145, the laundry
  vent stub and the upper duct's two 45s follow (down the wall to y −3.4125, the 45s to (−4.347, −3.6805), into the spigot at y −3.8305). Proven in
  Node on the draft: both leaves open fully (176° / 180°), no new clash, footprint as intended; losses ≈ kitchen 9.30 m
  23.6 Pa, bath 13.92 m 10.7 Pa, upper 10.15 m 23.1 Pa (Hypothesis). Geometry used by both edits: B's spigot ends at
  facing 270 from its centre (cx, cy): OUT (cx − 0.2295, cy − 0.085, 1.95), laundry Ø80 (cx − 0.2295, cy + 0.095),
  kitchen (cx + 0.2295, cy − 0.100), bath (cx + 0.2295, cy + 0.095), north Ø80s (cx + 0.094 / cx − 0.097,
  cy + 0.2295), all at 1.955 m (Proven with `buildProceduralFurniture`); the lug to cy − 0.228 (Aldes: 10 cm free).
- Loss at boost as written (Hypothesis, the model below): kitchen 8.88 m ≈ 23.1 Pa (was 25.9), bath 13.50 m ≈ 10.4 Pa
  (was 12.7), upper 10.56 m ≈ 23.8 Pa (was 24.6); OUT unchanged (straight, 35 cm). Clash check: no new clash.

**One unit, optimised (owner, 2026-10-14, later the same day; written to the headset, read back identical, 284 543
chars). Supersedes the routes in the block below where they differ.**
- **Unit B 0.82 m further south**: its south face 12 mm north of the laundry radiator supply (y −4.72, 2.05 m, above
  B's top 2.045), the closest it can hang. Outlet Ø160 ≈ 15 cm to the wall; the laundry vent is an 8 cm stub on B's
  south port turning down (face to the floor), since 20 cm would hit the wall.
- **Ground bathroom vent on the bathroom's south wall** (owner: "the bathroom outlet can be on the south wall"): the
  partition with the kitchen, facing north, Bahia Curve S (zone r251), centre 2.55 m, 21.5 cm from the east wall
  (Aldes's 20 cm guide). The Ø80 sleeve crosses the partition; the Ø100 runs south at x 3.06 in the kitchen (21 cm off
  its east wall: two conduits climb that wall to the ceiling at (3.10, −2.08)), leaning 2.55 → 2.62 m over 2.7 m
  (≈ 1.5°, no fitting), then west along the south wall at y −4.9375, dropping at x −0.65 in alcove r133.
  Hypothesis: the vent is above the shower; check Aldes's instructions allow it there.
- **Kitchen duct** vent and run at y −4.66 (5 mm north of the conduit riser at (0, −4.74)), dropping at x −0.85,
  west of the bath's. So in the basement the kitchen (west) turns into its lane first: **no crossing** (owner's idea).
- **Basement lanes by the unit** (owner: "optimize a bit the placement and the length"): kitchen y −4.06, bath y −3.92,
  both straight west from the wall holes; the dips under the heating pair stay.
- **Tight spot (Proven from the plan):** along the bedroom's south face the bath duct is 2.5 mm off the wall and
  passes the conduit riser on the thick wall's bedroom face (it runs up to 2.60 m at y −4.873) above its bend; at
  2.55 m it would be 3 mm from it, hence the lean.
- Lengths and loss at boost (Hypothesis, same model as below): bath 14.7 m ≈ 12.9 Pa at 45 m³/h; kitchen 9.7 m
  ≈ 24.2 Pa at 135 m³/h; upper 11.0 m (≈ +1 Pa for the unit move). Clash check: only same-pipe fittings flagged.

**One unit for the whole house (owner, 2026-10-14; written to the headset the same day, read back identical, 284 347
chars). Supersedes the two-unit layout below: unit A (r218), its roof outlet and its ground-floor ducts are gone.**
Unit B (r219, the hung Aldes) serves the kitchen, the ground bathroom, the upper bathroom and the laundry.
- **Unit B moved 0.93 m south**, centre (−3.99, −3.70) (owner: "move the VMC unit closer to the south wall"). Why:
  basement door r120 opens into the laundry (0.83 m leaf, top 1.94 m; Proven from its swing in the plan) and no Ø125
  fits over it under the 2.07 ceiling, so the ducts reach B along lanes south of the leaf's sweep (y −3.10 / −3.24).
  Its OUT Ø160 to the south wall is now ≈ 1.0 m.
- **Ground bathroom duct: Ø100, Ø80 only at the vent and the port** (owner chose it: at Ø80 the boost loss put the
  vent under its 80 Pa floor). Vent (2.70, −1.125) → west over passage r117 at the kitchen ceiling (2.62) → south down
  the kitchen's west wall (x 0.48, above the wall cupboards) → through the 41.5 cm wall into bedroom r51 at y −4.47 →
  south into alcove r133 → straight down through the slab into the top of the basement wall (under the alcove: the
  laundry's south face is y −4.90) → north through a hole drilled in that wall (1.99 m) and straight across the laundry
  (owner: "go straight north") → west at y −3.10 → under the heating pair → into B's back Ø80. 16.1 m.
- **Kitchen duct Ø125**, vent at V2 (1.10, −4.60): west at y −4.60 through the same wall → alcove → down beside the
  bath duct → wall hole at 1.86 m → north → west at y −3.24 → B's kitchen port. It stays at 1.86 in the basement, so it
  passes under the bath duct (the one place they must cross: the kitchen vent is east of the bath's run on the ground
  floor but its port is east of the bath's at B) and under the heating pair. 10.6 m.
- The thick wall is crossed **north of the two conduit risers on its bedroom face** (y −4.74 and −4.88, Proven from
  the plan's conduits); the basement lanes stay clear of the ethernet panel's conduit rising at x −0.20.
- **Upper bathroom duct**: straight down the laundry's west wall (x −4.615, 1.97) into B's west Ø80 (the diagonal is
  gone), 10.2 m. **Laundry vent**: a 20 cm stub on B's south Ø80.
- **Upper WC waste beside the upper duct** (owner: "one single hole"): from the stack's foot south at x −4.50,
  1.93 → 1.91 m, through the same holes in the r76/r67 and r67/r66 walls; inside the laundry it drops to ≈ 1.0 m and
  runs low along the west wall (13 cm off it, behind the machines), stopping short of the radiator riser. Its exit
  through the south wall to the collector is still open.
- **Laundry radiator supply raised to 2.05 m** along the south wall (owner's option 2): it crossed B's outlet (a clash
  already on the headset before this change, from the radiator move of 2026-10-13); now 6 mm over the outlet's top.
- Pressure at boost (Hypothesis: smooth pipe, Blasius, each 90° as two 45° = 0.3 × dynamic pressure; turns counted on
  the drawing): bath 45 m³/h ≈ 14 Pa (the vent sees ≈ 88–98 Pa with B's assumed ≥ 122 Pa and 10–20 Pa of room
  depression); kitchen ≈ 15 Pa at 105 m³/h, ≈ 25 Pa at 135 (its vent's required pressure is not known); upper ≈ +1.5 Pa
  for the extra 0.93 m. All four boosting at once would exceed B's one published point (144 m³/h at 122 Pa).
- Open: the kitchen vent's real flows; the wall holes' heights against the slab (contractor); the waste's height
  against the washing-machine sockets (1.09 m) and the collector (its height is unknown); insulation R ≥ 0.6 on the
  basement ducts; B's lid hatch.

**Model changed (owner, 2026-10-08): Aldes EasyHOME Hygro Compact Classic** (Leroy Merlin kit 82201371,
Aldes 11033404, with 3 Bdh vents; furniture `aldes-easyhome-hygro-compact`, `docs/furniture.md`). Unit **A
(r218) is the Aldes on the headset** (written 2026-10-09, read back identical: flat, facing 0, OUT south,
kitchen Ø125 + an Ø80 north, two Ø80 east, lug west; x 0.62–0.98, y −1.78…−1.42, 2.463–2.65 m; ducts
redrawn to its ports, kitchen vent moved to (1.25, −1.30) so the kitchen and shower ducts don't cross).
Unit **B (r219) is still the Agalina** in the plan: its move to the laundry is decided but not drawn
(below, "Unit B in the laundry"). The Agalina text further down is the earlier draft. What changes (Proven: spec table and notice media 3963727):
- **humidity-controlled (hygro B)**, not self-regulating: the flexible-duct rule further down drops to
  **≤ 3 m and ≤ 2 bends per vent** unless a sizing study says otherwise, so every drafted run over 3 m
  (B upper 6.93 m) needs rigid or semi-rigid duct even more;
- OUT is **Ø160** (Agalina Ø125): this matches the Ø160 minimum roof outlet below, and the outlet ducts
  (A roof, B wall) become Ø160;
- box 360 × 361 × 187 mm, 459 × 460 with spigots (Agalina 379 × 372 × 150): a deeper boxing above the
  fridge; 221 m³/h, 7.17 kg;
- ports: kitchen Ø125 and an Ø80 on one face, OUT Ø160 and an Ø80 on the opposite face, two Ø80 on
  a side, a mounting lug on the last side, all spigot centres 90 mm above the base;
- notice p. 5 asks for **400 mm free around the sides** and **440 × 340 mm above the lid** to open it
  (maintenance): a closed boxing needs an access hatch over the lid (Hypothesis: the usual answer).
The duct routes below were drawn to the Agalina's ports; they need re-drawing to the Aldes's.

The owner plans **two Sauter Agalina extra-plat** units (Leroy Merlin 80127930; furniture
`sauter-agalina-extra-plat`, `docs/furniture.md`). Proven (its notice, media 4666866): a **single-flow
self-regulating** unit (not hygro B) with a humidity boost on the blue bathroom port; one kitchen Ø125,
four sanitary Ø80 (15 or 30 m³/h calibrated), OUT Ø125; box in a false ceiling or boxing, fixed on
silentblocs or hung; ducts straight and taut, **insulated 25 mm** recommended; −5 to 40 °C. Fresh-air
inlets are in the window frames (owner): nothing to draw.

Owner's layout: unit **A** in a boxing above the kitchen fridge serves the kitchen and the ground
shower room + WC and blows out **through the roof** (the kitchen is under the single-storey roof:
Proven, the upper floor stops at x 0.54); unit **B** serves the basement laundry (r66, the breaker
room) and the upper shower room + WC through the **column r122** beside the entrance (a riser through
the ground floor), and blows out through the garage-door wall. Ducts run against the walls (owner).
A boxing at the column on the upper floor would stop window r114's right leaf at 119° instead of 174°
(owner: "it will prevent opening a window"; Proven by `windowSwings` on the plan), so the upper duct
rises inside half wall r210 (the WC frame box) and a boxing on top of it, and reaches the column
inside the slab (owner: the run can be within the slab) (a first try, a full-height corner boxing in front of the half
wall, was dropped: the half wall has room beside the frame; a low boxing along the wall, dropped for
the slab); with every VMC item in the plan no window's swing changes (Proven: the same check, every floor).
Unit B is **mounted flat on a wall, placed for the shortest run to the upper floor** (owner): furniture
`sauter-agalina-extra-plat-wall` (the notice allows any position), on the south wall of basement
room r76 in its west corner, sockets up and right under the column, OUT down. A first draft hung it
under the ceiling south of the garage door: upper duct 8.19 m, laundry 4.57 m, outlet 0.85 m.

In the headset plan (Proven: written 2026-10-08 and read back identical; lengths 3D, into the box centre, so ~0.2 m per duct is inside it):

| Duct | Ø | m | Route |
|---|---|---|---|
| A · ground shower + WC | 80 | 2.30 | Aldes east Ø80 (north one), east at y −1.51 to x 1.40, north to y −1.125, along wall r112 at the ceiling, over passage r117, through the partition (2026-10-09) |
| A · kitchen vent | 125 | 0.89 | Aldes kitchen port north, north to y −1.30, east to the vent at (1.25, −1.30) (2026-10-09) |
| A · roof outlet | 160 | 1.04 | Aldes OUT south, straight up, cap 0.65 m above the ceiling, 0.17 m from the upper storey's wall (2026-10-09) |
| B · upper shower + WC | 80 | 6.93 | vent at the ceiling above half wall r210's west end, down a boxing r220 on top of the half wall (15 × 22 cm, 1.15 m to the ceiling), inside the half wall beside the Geberit Duofix frame (about 29 cm free between the west wall and the frame), inside the upper floor's slab (10 cm under the floor) along the west wall to the column, down column r122 (a 19 cm offset inside it, toward the port: the basement wall face is 15 cm further in), straight into the blue port |
| B · laundry vent | 80 | 2.45 | straight north at the basement ceiling, through two basement walls, down into the grey port |
| B · wall outlet | 125 | 2.36 | OUT down, then along the west wall to beside the garage door (owner: it must go out there, not through r76's wall) |

**Duct type and the rules** (owner asked "PVC or soft duct?", then "check that", 2026-10-08).
Proven (notice 4666866): the kit's sketch shows flexible ducts (p. 4); ducts straight and taut, never
crushed, 25 mm insulated recommended, "conduit rigide ou semi-rigide" for long runs (p. 6); the Twist &
Go spigots screw into a flexible duct's spiral (p. 6); one 90° bend ≈ 3 m of duct (p. 7).
Proven (BET André, "Liste des exigences obligatoires en maison individuelle simple flux", the RE2020
ventilation-protocol checklist citing NF DTU 68.3 P1-1-2 / P1-1-4, fiche 2.24 R6, 2.19, 2.26 R7;
https://www.etude-thermique-rt-2012.com/wp-content/uploads/2023/05/Controle-VMC-en-maison-individuelle-ANDRE.pdf):
- a **flexible** duct from a vent to the unit, **self-regulating** system (the Agalina): **≤ 6 m and
  ≤ 3 × 90° bends** (humidity-controlled: 3 m and 2 bends unless a sizing study says otherwise).
  Summaries quoting only "3 m per vent" (Aldes, france-vmc) give the hygro case;
- outlet: outside (never into a loft, garage or crawl space), **≥ 0.40 m from any opening** and
  ≥ 0.60 m from any air inlet, measured to the outlet's axis;
- a duct outside the heated volume: insulated, **R ≥ 0.6 m²·K/W**.
Aldes's DTU 68.3 page (https://www.aldes.fr/reglementations/ventilation-et-qualite-d-air-interieur/nf-dtu-68.3)
adds: a roof outlet ("sortie de toit") **Ø160 minimum** in a house, and not smaller than the unit's outlet
spigot. Sauter's own sketch shows a Ø125 roof cap: the two disagree (open).
Materials: no source found names PVC for VMC ducts. Rigid VMC ducts are galvanised steel (A1),
aluminium or stainless; semi-rigid ones are aluminium/galvanised or PEHD systems sold for VMC. PVC
drain pipe (NF EN 1329-1) is specified for soil and waste discharge and the **venting of that drain
network**, not for VMC air ducts (Proven: the standard's scope; that it would be refused is Hypothesis).

**Owner decision (2026-10-08): no inspection is planned and none is required for this house; the goal
is an efficient system.** The rules above are used as engineering guidance (they exist to keep the
design airflows and avoid condensation), not as compliance targets.

Applied to the drafted routes (lengths Proven from the plan; bends at the vents and ports added by hand):
- **B upper shower + WC, 6.93 m with ~4 bends: over the flexible limit on both counts**; for the flow,
  rigid or semi-rigid (galvanised or a VMC semi-rigid system), a short flexible end at each spigot at
  most (smooth walls and real elbows lose far less than a corrugated flexible duct's bends: Hypothesis,
  general duct practice);
  Owner asked "19 m in rigid PVC, is it viable?" (2026-10-08): the 19 m was the flexible-equivalent
  length; in rigid it is 6.93 m plus elbows. Estimate (Hypothesis: Darcy with Blasius f, smooth wall;
  elbow K ≈ 0.3–0.5): 30 m³/h in Ø80 = 1.7 m/s, Re ≈ 9 000, ≈ 0.7 Pa/m → ≈ 4.6 Pa straight + ≈ 2 Pa of
  elbows ≈ **7 Pa** (flexible ≈ 25–30 Pa), small against the few tens of Pa a self-regulating vent
  works over: viable. **Superseded 2026-10-09** (80 mm bore, gentle bends, 30 m³/h): see "Pressure
  budget" below, at the real bore and the boost flow. Watch: the PVC-to-spigot joint (both may be 80 mm outside), a short insulated
  flexible piece at the unit against fan noise, R ≥ 0.6 in the basement, the slab opening sealed, no low
  point. Precedents (owner asked, 2026-10-08): ALDES sells rigid PVC VMC ducts, the flat Minigaine
  (40 × 100 mm ≈ Ø80, 60 × 200 ≈ Ø125, self-extinguishing PVC, simple and double flow; e-novelec listing
  3542280911029): Proven a maker's product, and a flat Ø80 equivalent may suit the slab run better
  (Hypothesis). Plumbing PVC as VMC duct is reported done on forumconstruire.com topic 140468 (2011:
  two pipe makers and a fluids engineering firm "no contradiction", plumbing PVC ~10× cheaper; 2022:
  avoid it for heated supply air > 50 °C) and futura-sciences thread 910965 (2021–23: rigid PVC Ø80
  sturdier than flexible, whistling and flame-spread warnings): what people wrote, not tested results.
- **The two ends** (owner asked, 2026-10-08). Proven (notice 4666866): at the unit, a Twist & Go
  spigot is screwed into the duct, clamped (collier), its adapter fitted, then clipped into the unit and
  locked by a 1/4 turn (p. 6); unused openings get a plug (p. 6); once a year the **blue spigot and its
  adapter come out** to clean the humidity sensor behind it, and the OUT spigot to clean the fan
  (p. 10). At the vent: a hole the size of the sleeve ("manchon"), the duct pulled out of the hole,
  clamped on the sleeve, the sleeve pushed in (its wings fold back), the vent clipped in (p. 7); a
  bathroom vent goes **as close to the shower as possible** (p. 7). Parts: spigot Ø80 30 m³/h 913672
  (e-novelec lists it "Ø80"), sleeve "manchon placo 80" 915199, vent "bouche design Ø80" 913676
  (exploded view 4532339). Hypothesis (no drawing found): the spigot and the sleeve are about 80 mm
  outside, sized for a flexible duct's 80 mm bore, and a PVC drain pipe Ø80 is 80 mm outside too, so
  the pipe cannot slide over them; a PVC coupling's socket (about 80 mm inside) can. Hence the
  usual build: **rigid PVC in the middle, a short insulated flexible piece (≤ 0.5 m) at each end**,
  joined to the PVC by a coupling or sleeve with a clamp and aluminium tape, never glued to a part that
  must come out. At the unit that piece also lets the blue spigot pull out for cleaning and stops fan
  noise travelling up the pipe. The upper vent (above half wall r210) is about 1.6 m from shower tray
  r136 (the WC end of the room): within the notice's advice for one vent per room, but not "as close
  as possible"; the ground one (unit A) is about 0.4 m from tray r131.
- **Bend sizes** (owner asked, 2026-10-08; owner: keep the fittings generic, the brand may not be available:
  any 45° / 87°30' PVC drain elbow Ø80 to NF EN 1329; Nicoll is only the source of typical dimensions,
  other makers differ by a few millimetres). Proven (Nicoll datasheet "Coudes femelle/femelle",
  FT_coudes_evac_FF.pdf, PVC drain fittings NF EN 1329-1, fire class **B-s2,d0**): Ø80 87°30' CR88
  Z 61 / L 47 mm; 67°30' CR66 Z 43; 45° CR44 Z 26.5; 30° CR33 Z 20; 20° CR22 Z 15 (L 47 each). Z is
  read as axis-to-socket-bottom and L as the socket depth (Hypothesis: the datasheet's drawing letters),
  so a 90° turn takes about **108 mm from the corner to each socket mouth** and about **150 × 150 mm**
  overall with the 80 mm pipe. Nicoll's own guide ("Guide spécialité sanitaire", §5 "Évitez les angles à
  87°30") says two 45° flow better than one 87°30' (for water; the same holds for air: Hypothesis).
  Two female/female 45° need a pipe stub between them (corners ≥ 2 × (Z + L) = 147 mm apart), so a
  90° made of two 45° takes about **228 × 228 mm** (10 mm of stub showing) against ~151 × 151 mm for
  one 87°30' (scratch drawing `bends.mjs`; a first drawing overlapped the two elbows, caught by the
  owner).
  Gains on the drafted VMC route (owner asked, 2026-10-08): its two rigid 90° turns (the half wall's foot,
  the top of the drop) both have room for two 45°: the pair cuts the corner inside, so it needs no more
  depth, only straight pipe up to ~185 mm from the corner on each side (instead of ~108 mm), which the
  hollow half wall, the slab and the column top give. Estimate (Hypothesis: typical loss factors, short
  87°30' K ≈ 0.6–0.8, two 45° ≈ 0.3–0.45; 30 m³/h in a Ø80 PVC of ~76 mm bore ≈ 1.8 m/s, ~2 Pa dynamic):
  ~0.6 Pa saved per turn, ~1.2 Pa for both, about 15 % of the rigid duct's ~7 Pa and small against the
  fan's tens of Pa; also less noise and dust in the corner; cost one elbow, a ~104 mm stub and a joint each.
  For the WC waste two 45° and 45° branches are Nicoll's rule (§5 of its guide), not an option.
- **Trench depth** (owner, 2026-10-08: "I can dig a trench… I just don't want to dig too much"): the slab
  runs sit as high as the floor finish allows, not mid-slab: ~3 cm cover over the pipe (Hypothesis: tile,
  adhesive and a mortar skim). Trench from the upper floor surface: **VMC Ø80 11 cm** (axis 7 cm, 11.3 at
  the elbows), **WC branch Ø100 13 → 13.5 cm** (1 % fall to the stack), **roof vent Ø100 13–13.5 cm**
  (rising away from the stack). The VMC and the vent run side by side (12.5 cm between axes): one
  ~25 cm-wide trench; the WC branch its own short diagonal. The draft had them 10–13 cm down (trench
  14–18 cm). What the 25 cm "slab" is made of is not in the plan: in concrete a trench this deep cuts
  the structure (Hypothesis).
  Fit in the route (Hypothesis, plan coordinates): the column jog (x −4.625 → −4.43 with two 45°) needs
  ~0.28 m of diagonal between elbow axes (feasible in height), but at its bottom the pipe's edge reaches
  x −4.39, **the column's outer face**: column r122 (31.5 cm wide as drawn) needs ~3 cm more width, or
  unit B's blue port must move west (it is 2 cm from the basement wall already); the half wall (22 cm
  deep) and a 25 cm slab take an 87°30' turn (~15 cm) if the slab build-up allows an 8 cm pipe.
- A bathroom 2.33 m (~3 bends), A kitchen 0.63 m, B laundry 2.45 m (2 bends): within the limit;
- B outlet: its axis was 0.32 m from garage door r121; moved to 0.47 m (owner's yes, 2026-10-08; nodes
  `pn56`/`pn57` y 1.30 → 1.15, written and read back identical): 2.36 m;
- the basement is outside the heated volume in the heat-loss model: the laundry duct, the outlet and the
  riser's basement part need R ≥ 0.6; A's roof outlet too where it crosses the roof build-up;
- A's roof outlet: Ø160 roof terminal (Aldes) or Sauter's Ø125 cap: ask the installer.

**Pressure budget for the hygro vents (2026-10-09, owner questions; the vents are BDH since 2026-10-16, see "The vents: Aldes BDH").** Proven (Aldes BW21 Bahia Curve S
sheet, 11015144): the hygro vents hold their flow between **80 and 160 Pa** across the vent; the vent
must be ≥ 1.80 m up, high on a wall or on the ceiling, its centre **≥ 20 cm from adjacent walls**,
removable (in a sleeve) and cleaned yearly; the hygro strip needs no power, the 9 V battery (or the
230 V interface 11015280) only drives the presence boost. Proven (notice 3963727 p. 13): the HP version
holds ≈ 120 Pa (speed 3) / ≈ 130 Pa (speed 4) flat to ≈ 250 m³/h; the Classic is single-speed AC and its
curve is not published (Aldes page, notice pp. 11–13). Owner's duct: Girpi PVC downpipe Ø80 (Leroy
Merlin 61477423), push-fit male/female, ≈ 77–78 mm bore (owner; ≈ 1.4 mm wall from the packed weight:
Hypothesis), 45° pairs at every turn, rigid to the ends (no flexible pieces). Loss of B's upper duct with
B in the laundry, ≈ 9 m and 5 pairs (Hypothesis: Colebrook, smooth PVC, a pair ≈ 0.3 × dynamic pressure; set
2026-10-09, before the vent moved onto boxing r220's face, which added a pair behind it: **superseded by B hung**,
below):

| Vent flow | Duct loss | Vent sees, HP speed 3 / 4 (minus ≈ 10–20 Pa of room depression behind the window inlets at boost, ≈ 1–8 Pa otherwise) |
|---|---|---|
| 45 m³/h (boost) | ≈ 20 Pa | ≈ 80–90 / 90–100 Pa: speed 4 is within margin, speed 3 at the edge |
| 15 m³/h | ≈ 3 Pa | ≈ 110–117 / 120–127 Pa |
| 5 m³/h | ≈ 0.3 Pa | ≈ 119 / 129 Pa: under the 160 Pa ceiling |

B in r76 instead costs the upper vent ≈ 4 Pa less (6.93 m, 4 pairs: 15.3 Pa at boost); the laundry vent
gains about as much. A flexible end piece adds ≈ 2–2.5 Pa straight and taut, 4–6 Pa bent, more if
squashed. Levers, Ø80 only (owner): the HP at speed 4; fewer pairs (≈ 1.2 Pa each at boost); generous
window inlets (the least certain term); two Ø80 in parallel on two of B's free ports (≈ 6 + 2–3 Pa).
**Seal every downpipe joint** (PVC glue or aluminium tape): an unsealed push-fit joint draws air from the
cavity under ~100 Pa and no fan setting recovers it. A 1.4 mm wall buried in the slab may deform: sleeve
it or use 3 mm drain PVC there (Hypothesis). The 80 mm vent barrel will not go into a 77 mm bore: a Ø80
sleeve at the vent, an undoable coupling at the unit. Commissioning: read the pressure at the upper
vent during a boost. If it is short: HP (same box and ports), speed 4, a fixed-flow vent in that room,
or the whole of B self-regulating; only re-piping needs the walls open. Searched (2026-10-09): no small
2-port house unit exists (central units are 1 kitchen + 3–4 sanitary ports), so two units means two
full boxes; one unit at A for all four rooms is possible (4 sanitaries max) at ≈ 25 m of duct and a
ground-floor crossing (north route through the hall and corridors ≈ 5.9 m, or south along room r51
≈ 6.6 m; scratchpad plot only). Owner chose to keep two units and to drop VMR (per-room fans).

**Unit B hung under the laundry ceiling (owner, 2026-10-10; written to the headset 2026-10-10, read back identical):** furniture
`aldes-easyhome-hygro-compact-hung` on r219, centre (−3.99, −2.77), base screwed to the 2.05 m ceiling (5 mm
silentbloc gap, top 2.045), lid down (underside 1.86 m, 34 cm free under the lid to open it), facing 0: OUT
south, the back Ø80 north, the two side Ø80 west, the lug east. The Aldes notice (3963727 pp. 4–5) shows the box
hung under a ceiling and asks **400 mm free in front of each spigot end** (100 mm at the lug): the north end and
the west ends are exactly 40 cm from the walls. Why: the spigots are horizontal and 9 cm under the ceiling (axis
1.955 m), level with the duct along the ceiling (1.97), so the upper Ø80 pushes straight onto the north spigot
(**no turn down into the unit**) and the Ø160 OUT runs straight south 2.1 m through the outside wall at 1.95 m,
80.5 cm west of window r146 (no bend either). Upper route: the column-bottom pair aimed south-east (pn58 →
pn74, 0.75 m diagonal), **one 45°** at (−4.085, −0.83), then 1.71 m south through the r67/r66 wall: 8.97 m and
4½ pairs from the vent. Laundry: a 20 cm stub west from the north-west Ø80, its vent end 20 cm from the west
wall but only ≈ 9 cm under the ceiling (Aldes asks ≥ 20 cm from adjacent walls; open point, the vent type too).
Loss to the upper vent (Hypothesis, as above, Ø77 bore): **≈ 20–23 Pa at boost** with the 2×45° behind the vent
(the vent sees ≈ 87–100 Pa at speed 4, ≈ 77–90 at speed 3), ≈ 23–28 Pa with one 90° there (≈ 82–97 / 72–87),
≈ 3 Pa at 15 m³/h. Open: the machines' place (from outlets m103/m101: the box overhangs their fronts by
≈ 21 cm at 1.86 m: headroom), Aldes on whether any Ø80 port takes the bathroom vent, insulation of the basement
ducts (R ≥ 0.6, above). Removed: the Agalina on the r76 wall, its Ø125 OUT to the garage-door wall, the old
laundry duct along r67. Superseded: ~~**Unit B in the laundry, on the wall (owner, 2026-10-09; not drawn):** on the north wall of r66, west corner (x ≈ −4.6…−4.2),
lid toward the room; the outlet through the **south wall, west of window r146**, axis at x ≈ −3.9 (≥ 0.6 m
from the window edge −3.10, in case its frame has an inlet), as high as possible (≈ 1.9 m); the Ø160
runs ≈ 2.9 m across the ceiling east of the machines; the upper duct continues from the column along
today's laundry-duct path (+2.1 m, +1 pair); the laundry vent becomes a ≈ 0.5 m stub ≥ 20 cm from the
walls. Needs a wall version with OUT up (`aldes-easyhome-hygro-compact-wall-out-up`, not built)~~ (6 pairs, a turn
down into the unit and bends on the OUT; hanging it removes both). The
upper shower vent (−4.625, 0.42) is 7.5 cm / 11 cm from two walls: move it onto the south face of a
widened boxing r220 (one bend less than a ceiling vent fed from below), ≥ 20 cm from the west wall and
the ceiling. The laundry vent as drawn is 16 cm from the north wall.

**Unit B stays a Classic (owner, 2026-10-10: "I am not to switch to the HP mode"):** the HP lever above is
dropped. Proven (notice 3963727, Classic product sheet and p. 11 wiring): the Classic is single speed (L/N only);
its one published point is **122 Pa at 144 m³/h** (0.040 m³/s), 28 W at 221 m³/h max. The notice gives no duct
length or bend limit (searched). B's flow with both vents at boost is ≤ ≈ 90 m³/h, below that point; a single-speed
fan usually gives more pressure at less flow, so ≥ 122 Pa is assumed at B (Hypothesis: Aldes publishes no curve; ~~wrong~~, 2026-10-16: the approval 14.5/25-2320_V2 publishes it, see "Vent pressures against the BDH range").
Budget to the upper vent at boost (Hypothesis, Colebrook, Ø77 bore, recomputed 2026-10-10: 2.68 m/s, 1.6 Pa/m,
8.97 m ≈ 14.4 Pa + 4½ pairs ≈ 5.8 Pa, ≈ 20–23 Pa with the pair behind the vent; Ø160 OUT 2.1 m + wall terminal
≈ 1–3 Pa; room depression 10–20 Pa): the vent sees **≈ 76–91 Pa** (≈ 105 Pa at 30 m³/h, ≈ 115 at 15). The low
end is just under the 80 Pa floor, only during a boost with the window inlets at their least favourable; below
80 Pa a vent acts as an orifice (flow ∝ √Δp, Hypothesis), so 76 Pa gives ≈ 44 instead of 45 m³/h. Verdict: the
length is reasonable for B in the laundry; the levers left are the seals, generous window inlets, and fewer
pairs. Commissioning still reads the upper vent's Δp during a boost.

**Air paths computed (2026-10-10/11, scratch scripts, not in the repo):** owner: "I generally agree for V2", i.e.
move the kitchen vent from (1.25, −1.30), 22 cm inside passage r117 (the kitchen's only opening), to the ceiling
at **(1.10, −4.60)**, ≈ 0.9 m west of the hob (not drawn yet; ≈ +2.5 m of Ø125 and one pair from unit A,
≈ 3–5 Pa at boost, Hypothesis). Proven (script runs on the headset copy of 2026-10-10): a potential-flow + age-of-air
model of the kitchen (2D, then 3D with the furniture at ≈ 15 cm cells with open fractions; the ranking is the same
from 2.5 to 30 cm cells) gives the air above the hob an age of 4.2× the kitchen's nominal 46 min with today's vent
(1.75× with more mixing) against 1.16× (1.02×) at V2; a spot east of the hob above the tall oven is a tie but
leaves only 22 cm under the vent. Adding the hall, the ground shower room and the living room changes neither the
ranking nor the other rooms (each hygro vent pulls a set flow). No heat in the model (no hob plume): Hypothesis
that the plume favours a vent beside the hob further. **Inlets (owner, 2026-10-11): Aldes EHB² hygro, 6–44 m³/h**
(Proven, Aldes sheet 11014233: same Avis Technique 14.5/17-2266 as the EasyHOME units; dry rooms only, high on
the window, jet toward the ceiling). In the plan a window zone stores its inlet as `airInlet`
(`src/core/airInlets.js`), set in AR HEATING · AIR INLET (`docs/ar-survey.md`), which also runs the whole-house network live
(`src/core/airflow.js`, the scratch network made part of the app, with the stairs between storeys) and, on demand,
the whole house's 3D age-of-air map (`src/core/airflow3d.js`: each floor's field from the network's flows, one
age system across the stairs, so ages count from outside); not yet written to the headset. One EHB² on every dry-room window (owner, 2026-10-11): Proven from the plan that this is
5 inlets, r108 and r109 (living), r80 (ground bedroom r51), r113 (upper bedroom r85), r115 (upper bedroom r88);
the wet rooms' windows r110, r111, r114, r146 have none, and the basement has no dry-room window. A whole-house
network (rooms as nodes, those 5 inlets; an EHB² taken as an orifice of its humidity-set flow at
20 Pa, opening 6 → 44 m³/h between 35 and 65 % RH; 1 cm door undercuts; stack effect; all Hypothesis) gives:
the upper floor is not ventilated by its own bathroom vent alone (15 m³/h for two bedrooms) but through the
stairs: at night with the bedrooms humid each upper bedroom draws ≈ 19–20 m³/h and ≈ 23–26 m³/h goes down the
stairs to the ground-floor vents; with the living room occupied instead, ≈ 10 each. House depression ≈ 5–9 Pa in
normal running, ≈ 14–17 Pa with the upper bath boost (matches the 10–20 Pa assumed above), but ≈ 45–65 Pa with a
kitchen boost if the inlets were the only openings, so in a very airtight house the inlets would cap the kitchen
boost. With the envelope leaking 100 m³/h at 4 Pa the boost depression falls to ≈ 4–8 Pa, but on a winter night
the upper inlets then carry ≈ 0 (stack effect: the leaks low in the house take the air). Open: the house's real
airtightness, the inlet count per window, the EHB²'s Δp reference and humidity curve, the kitchen vent's flows.

**Occupancy, leakage and bedroom CO₂ (2026-10-12; owner: "What I fear is the renewal is too low", then "Assume two
people per room", "House is being renovated", no setting on the kitchen vent's minimum):** the app's network
(`src/core/airflow.js`) now takes (1) a room's `sleepers` (0–4, AR AIR INLET, trigger on a room); in the night
scenarios each EHB² opens with its space's sleepers (empty 6, one 25, two 44 m³/h at 20 Pa: Hypothesis, no
published humidity curve), the other scenarios keep one opening for every inlet; (2) a per-scenario outdoor
temperature (5 °C typical, `nightCold` at the heating design −7 °C; Hypothesis); (3) envelope leakage, heat
setting `airtight` = Q4Pa-surf (default **1.7 m³/h·m²**, Hypothesis for a renovated house without a test; the
new-build limit is 0.6), over each heated space's outside walls with their openings above the earth (half at a
quarter, half at three quarters of the storey) and its ceiling under the attic (at the ceiling), exponent 0.67;
the plan's envelope is ≈ 254 m², ≈ 98 of it the two upper bedrooms; (4) each space's steady CO₂ (well mixed,
420 ppm outside, 15 L/h per sleeper: Hypothesis). The 3D map spreads each leak over its space's rooms in its
height band (Hypothesis) and now recomputes on its own.
Why the first night results looked so bad (Proven, model runs on the 10-10 copy): the old night scenario opened
every inlet to 44, so the empty living room took the weak night suction, and with no leaks and the −7 °C stack
effect the upper bedroom inlets carried 1.5 m³/h (air age ≈ 1 500–2 000 min). Opening only the occupied bedrooms'
inlets alone gives them ≈ 15–23 m³/h. Results with two sleepers in r51, r85 and r88, doors shut, 5 °C (Proven
as model output; every input above Hypothesis):

| Leakage Q4 (m³/h·m²) | r51 (ground) | r85 (upper S) | r88 (upper N) |
|---|---|---|---|
| 0 (airtight) | 1 850 ppm | 2 260 | 2 260 |
| 0.6 | 2 080 | 4 850 | 4 480 |
| 1.7 (default) | 2 210 | 2 020 | 1 870 |
| 3 | 2 300 | 1 500 | 1 400 |

At 1.7 the 3D map gives the upper bedrooms ≈ 160–190 min (fully mixed house 214 min, 33 s on the Deck). Leaks
change the pattern: more air comes in through the walls than through the inlets, the stack effect pushes air out
high (the upper bedroom inlets reverse, ≈ −8 m³/h), and the upper bedrooms are fed from the landing under their
doors. What-ifs at 1.7 (model): bedroom doors open 1 360 / 1 670 / 1 520 ppm; sanitary vents at 30 overnight or
two EHB² per bedroom change little (± 10 %); in a tight house (0.6) sanitary vents at 45 overnight bring the upper
bedrooms to ≈ 2 000. No tweak gets every two-sleeper bedroom under ≈ 1 400 ppm (Hypothesis: the usual guidance
band is 1 000–1 400) across the leakage range. Open: the house's real Q4 (a blower-door test after the works),
the real distribution of its leaks, wind (not modelled), and a measured overnight CO₂ in a bedroom, which would
settle the question for this house.

**Boxings are half walls (owner, 2026-10-10: "Boxing is a half wall from my definition"):** a pipe or duct boxing is
drawn as a `halfwall` zone from the floor to its top, never as a plain furniture box (View 3D draws a furniture zone
only when it carries a catalog product, so a plain box is invisible there). Boxing r220 was converted and written
the same day (read back identical). A taller half wall standing on a lower one is drawn whole in View 3D and AR 3D: the lower one's
band above its top skips the taller one's footprint (`src/core/architectural3d.js`, 2026-10-10; before that fix
r210's band cut r220 away above 1.15 m, so the boxing looked missing).

**Ceiling boxings (owner, 2026-10-14: "work on boxing those conduits", the ground floor's kitchen and bedroom
ducts; "new ceiling box kind").** (The kitchen boxes below are superseded, 2026-10-15: "Ground-floor ducts in the attic".) A duct along a ceiling is boxed by a **`soffit` zone** (CEILING BOXING): solid from
its `foot` (the box's underside, m above the floor; AR's band pad edits it) up to the ceiling, plaster in View 3D,
a dashed outline with dashed diagonals on sheets (overhead), and it takes no floor area (footprint, room area, heat
loss and floor finishes run under it, as for furniture). A riser from floor to ceiling stays a half wall (above). Each
box clears its ducts by 1 cm plus a 12.5 mm board (Hypothesis: a typical plasterboard on rails; the real build-up
is the contractor's). Drafted on the owner's plan (session scripts `editBoxing.mjs`):
- kitchen east wall x 2.99–3.275, foot 2.47 (the bath duct leans down to 2.55 at the partition; the box also covers the
  two conduits climbing that wall; window r111's head 2.27 is 20 cm under it);
- kitchen south wall: x 1.185–2.99 (bath duct only), 29 cm deep, and x 0.415–1.185 (both ducts) 57.5 cm deep, foot 2.50,
  2 cm over wall cabinet r162 (top 2.48); the kitchen vent sits on the box's underside (2.50);
- bedroom r51 south wall x −0.935–0, 41.5 cm deep, foot 2.50, continuing the kitchen's line through the thick wall;
- alcove r133: a half wall to the ceiling (x −0.935…−0.53) round the two drops.
**45° chutes through the ground slab (owner, 2026-10-14: "a 45 degree chute", "nicking the top of the wall is ok", "Nicks
deeper"; written with the kitchen vent, read back identical, 285 708 chars):** each alcove drop is vertical down to the alcove
floor (kitchen y −5.0725, bath y −5.06: 2 cm and 3.5 cm behind the alcove box's face, for its board), bends 45° there and
crosses the 20 cm slab heading north, levelling out in the laundry at y −4.66 (kitchen, 1.86 m) and −4.78 (bath, 1.99 m).
It replaces the pocket in the wall top and the bore through the basement wall. **Nicks in the wall's top inside edge
(Proven geometry, 5 mm clearance included):** kitchen Ø125 at x −0.85: **6.6 cm** into the laundry face × 6.6 cm down from
the slab, 13.5 cm wide; bath Ø100 at x −0.65: **3.6 × 3.6 cm**, 11 cm wide; ≈ 9 cm of wall between them. Each needs an oval
hole through the slab next to its bearing on the wall (Hypothesis, structural: the builder's call).
**Kitchen vent (owner, 2026-10-14; a BDH C51 since 2026-10-16, see "The vents: Aldes BDH"):** the kit's C21 (`aldes-bahia-curve-l-ceiling`, `docs/furniture.md`), face down on
the south box's underside at (0.98, −4.80), its 230 mm along y; centre 56.5 / 35 / 22.5 / 20.5 cm from the west wall, the
south wall, the box's edge and its step (Aldes: ≥ 20). The Ø125 climbs to 2.60 and jogs 14 cm north to its run (y −4.66).
Kitchen duct (drafted with the 45° chutes): 9.5 m, ≈ 25.9 Pa at 135 m³/h (Hypothesis, same model), so ≈ 76–86 Pa at the
vent with B's assumed ≥ 122 Pa: over the C21's 70 Pa boost floor. The 135 m³/h boost assumed before is the C21's.
Room areas: only the alcove box takes floor (bedroom 13.90 → 13.83 m²). Open: access hatches at the duct joints
(Hypothesis: usual practice).
**Hood and alcove (owner, 2026-10-14; written with the window draft, 287 333 chars, read back identical).**

The hood: a Falmec Lumina NRS 90 (`falmec-lumina-nrs-90-black`, `docs/furniture.md`), as furniture zone r258.
- It sits on the south wall, centred over cooktop unit r154 (x 1.548…2.448; dimension c1560: the hood's left edge
  15 cm left of r154's). Owner, 2026-10-14: "Center it over the cooktop"; a first draft centred it 90 cm from the
  tall oven unit, 30 cm off the hob. The canopy is at 1.576 m, 65 cm over the hob (owner: "Go with 65"; Falmec's minimum is 52), and the chimney
  rises to the box underside at 2.50.
- A generic induction hob, r260 (`generic-induction-hob-60`; owner: "Go generic"), lies on worktop B centred on
  r154 (x 1.703…2.293), 5 cm back from the worktop's front (c1566, c1567). Its glass top at 0.926 m is 65 cm under
  the canopy.
- Proven clashes, from a Node check on the draft:
  - conduit cs418, drawn at 2.40 m 2–15 cm off the wall, passed 13 mm into the chimney (x 1.82–2.18, 30 cm deep).
    The owner's conduits are drawn on the wall but buried, so its junctions cn320/cn321 were snapped onto the face
    (y −5.15; written, 287 329 chars, read back identical). It now only touches the chimney's back;
  - the chimney stands 1.5 cm proud of box r253's face.
- Outlet m80 at (2.025, 1.80 m) now sits behind the chimney, where a hood socket usually goes (Hypothesis: it is
  meant for the hood).

The bedroom alcove r133: a recess up to 2.50 m only (owner), floored like the bedroom (owner: "In the recessed,
apply a flooring").
- r133 stays a room, so the bedroom's oak, its slab and its area (13.83 m²) run into it.
- The wall above 2.50 over its open part (x −1.55…−0.935, west of the duct box r256) is CEILING BOXING r259
  (foot 2.50): a solid from 2.50 to the ceiling that takes no floor.
- A first draft deepened wall r185 and cut a RECESS zone instead. The wall then covered the recess floor: no
  flooring, and the area fell to 13.72.
- Proven in Node: oak and slab in the recess, area 13.83, no conflicts.
- r256 stays a full-height box round the drops. The real recess also stops at 2.50 over r256's part, so the kitchen
  Ø125 and bath Ø100, crossing from box r255 into r256 at 2.60 and 2.62 m, pass through the wall's top there (8 and
  7 cm in from the bedroom face). Owner, 2026-10-14: "the pipes can cross the wall top, no problem", so the wall
  top is notched or bored there; the route stays as drawn. The model draws that part as r256's box, not as wall.
The kitchen's south boxes r253 and r254 take the south wall's tile_vernisse_white on every exposed side and underneath
(owner, 2026-10-14; 10 finish entries, only the exposed faces draw: `docs/materials.md` "a ceiling boxing takes wall
finishes too").

**Kitchen vent out of the cabinet door, ducts against the wall (owner, 2026-10-15; option 1c, written to the headset
2026-10-15, 286 571 chars, read back identical).** Proven (Node on the 287 329-char plan): the face-down C21 r257 (underside 2.451) sat inside wall cabinet
r162's door swing (hinge (0.818, −5.067), 60 cm door, top 2.48); the door's top edge met it at about 12°. Options weighed
and set aside:
- Raising the box to clear the door left a ≈ 15 cm box. A Ø125 vertical-to-horizontal turn needs ≈ 22 cm (vent spigot
  43.8 mm, Aldes technical document; Nicoll PVC 87°30 F/F Ø125: socket 61, Z 96), and even the 20 cm box was ≈ 2 cm
  short (the model draws the turn as a sharp corner).
- A sideways vent on a box face: the C21 sheet asks ≥ 20 cm from the vent's centre to adjacent surfaces, and the
  technical document shows only ±20° of turn in its sleeve. A 20 cm face is too small for it.
- Stacking the two ducts through the kitchen–bedroom wall: 4–6 cm short over the wall cabinets (tops 2.48).
- Centred on the hood in front of its chimney (1b): a 70 cm box, if the chimney counts as an adjacent surface.

The owner allowed drilling into the bedroom's south-wall top (the 16 cm by which it stands proud of the kitchen's
line, x −0.53…0). Draft 1c, scratch `editVent1c.mjs`:
- bath Ø100 against the wall at y −5.06 straight into its drop (its 12 cm jog removed: p272 and pn303 go), inside a
  channel ≈ 13 × 12.5 cm in that wall top;
- kitchen Ø125 at y −4.935 (1.25 cm off the bath drop at x −0.65), ending right over the vent (p296 and pn328 go);
- one kitchen box r254 from the west wall to r252, 30 cm deep (front = the chimney's front, −4.85; r253 and its five
  finishes removed); bedroom box r255 14 cm deep;
- the vent turned 90° clockwise (facing 270, its 230 mm along the wall) at (1.60, −4.935), west of the chimney (22 cm),
  out of r162's swing (6.9 cm), wholly under the 30 cm box (front edge 3.5 mm behind the box front). No bump: owner,
  2026-10-15, "absence of surface should not count, it is not a wall". Aldes's 20 cm from the vent's centre applies to
  surfaces hanging down beside it: the south wall (21.5 cm) and the chimney (22 cm), not to the box's front edge,
  which goes up to the ceiling. The same reading would have made option 1b's box shallower than 70 cm;
- buried conduit junction cn236 (cs299/cs305, climbing the partition) 7 cm north to y −4.80, beside the duct's hole.

Proven in Node: no conflicts, no dimension deleted, the ducts 1.2–1.4 cm apart, Ø125 +0.205 m. Hypothesis: one bend
fewer on each duct; the vent plugs into the run with a saddle or tee (part not chosen); whether the bearing wall's top
may be cut (the builder's call). Untouched: r252 keeps its 2.47 underside (the bath duct is at 2.55 at its north end),
so the corner keeps a 3 cm step, and r252 still sits 1 cm into the tall oven unit r156 and filler r157 (tops 2.48),
an overlap that predates this draft.

**The kitchen Ø125 with rigid parts (owner, 2026-10-15: "can it be realized with real parts?", then "Ok, draft it";
draft 1d on the 286 571-char plan; written to the headset 2026-10-15, 287 752 chars, read back identical).** Proven (Aldes technical document: the vent's
spigot 43.8 mm, outer Ø119, for a Ø125 duct; Nicoll sheet: PVC 87°30 F/F Ø125 sockets 61 mm, Z 96 mm; 45° Z 41 mm), two
spots of 1c could not be built with them:
- the vent's turn up into the run: spigot in a socket (61) + Z 96 puts the run's axis 15.7 cm above the box underside and
  the socket's top 6.55 cm above that, ≈ 22 cm, in a 20 cm box (18.75 cm inside the board). An equal-size Ø125 saddle
  or tee was assumed earlier; it is not a standard part (Hypothesis);
- the double turn over the alcove (west → south 13.75 cm → down): two such elbows need 19.2 cm centre to centre. (Wrong, 2026-10-15: that leaves out the sockets; 31.4 cm. See "Fittings to datasheet sizes" below.)

Draft 1d, scratch `editVent1d.mjs` (new ids r261, r262 taken first, nothing removed):
- the kitchen run 7 cm north, y −4.865 (the double turn 20.75 cm), and at 2.62 all the way;
- the kitchen box split: r254 x 0.415–1.43 and r262 x 1.82–2.9875 at 2.50, r261 x 1.43–1.82 dropped 4 cm to 2.46 (the
  elbow's socket top 2.6855, 1.45 cm under the ceiling); all 37 cm deep (front −4.78), tiled; the bedroom box r255 21 cm;
- r261's west edge at 1.43 clears wall cabinet r162's door at 90° (it reaches x 1.418 at its 2.48 top);
- the vent r257 still turned at x 1.60, under the run (centre y −4.865), its top at 2.46;
- buried conduit junction cn236 to y −4.73;
- (owner: "2 is good") the flat turn in the laundry (north → west, pn316) as two 45° (Nicoll 45° F/F Ø125, Z 41): the
  elbow centres 8.5 cm back on each leg, a 12 cm diagonal (new pn338, p306).

Proven in Node: no conflicts, no dimension deleted, both ducts ≥ 3 cm from every other pipe and conduit (8 cm apart),
the kitchen Ø125 9.60 m from the vent to unit B with three 87°30 (above the vent, ① and ② over the alcove) and four 45°
(the slab chute, the laundry pair).

Kitchen Ø125 loss, draft 1d (owner asked for an estimate; Hypothesis: smooth pipe, Blasius, ρ 1.2; 87°30 short elbow
K 0.6–0.8, ① + ② close-coupled out of plane +20 %, each 45° pair 0.3–0.45):

| C21 flow | PVC Ø125 (≈ 119 mm bore) | galvanised Ø125 (125 mm bore) |
|---|---|---|
| 135 m³/h (boost) | ≈ 32–38 Pa (friction 13.6, fittings 18–25) | ≈ 26–31 Pa (friction 10.8, fittings 15–20) |
| 55 m³/h | ≈ 6–7 Pa | ≈ 5–6 Pa |
| 15 m³/h | ≈ 0.5 Pa | ≈ 0.5 Pa |

At boost the vent then sees ≈ 122 − (10–20) − loss: ≈ 64–80 Pa in PVC, ≈ 71–86 Pa in galvanised, against the C21's
70 Pa boost floor (122 Pa: B's one published point; its Classic curve is not published). Below boost there is ample
margin. A short flexible end at the unit adds ≈ 2–2.5 Pa at boost. The tight turns (above the vent, ① and ②) have
no room for gentler bends; the bore is the remaining lever. **Owner, 2026-10-15: "I for sure will keep pvc".** Below
70 Pa the boost is not lost: at boost the vent acts as a fixed opening, so its flow goes roughly with √Δp (≈ 130 instead
of 135 m³/h at 64 Pa; Hypothesis). Small PVC-side gains: a thin-wall Ø125 (≈ 1.8 mm, ≈ 121 mm bore, ≈ 2–3 Pa), no or a
short straight flexible end at the unit (≈ 2–2.5 Pa), generous kitchen window inlets (the room-depression term).
Commissioning: read the kitchen vent's pressure during a boost. Hypothesis: r261's 4 cm lips are no "paroi" (its west lip is 17 cm from the vent's centre, the
chimney 22 cm, the south wall 28.5 cm); the tile takeoff counts r261's sides whole, ≈ 0.15 m² of them inside the
neighbouring boxes; r162's real door reach (leaf width and hinge offset; 1.2 cm margin).

**Ground-floor ducts in the attic (owner, 2026-10-15: the ceiling boxes are "regarded as ugly"; "Kitchen goes also in
the attic"; written to the headset 2026-10-15, 287 526 chars, read back identical). Supersedes the kitchen boxes of
"Ceiling boxings", 1c and 1d above; the bedroom side (box r255, the drilled wall top, the alcove drops) is unchanged.**
The single-storey part (x > 0) has a ventilated attic under a roof that slopes down to the east (owner: low side on
the east wall), with 36 cm of blown Rockwool planned on the ceiling (`docs/heat-loss.md`). Scratch `editAttic.mjs`
(new ids pn340–pn343, p308–p311 taken first):
- **Bath:** wall vent r251 becomes the ceiling Bahia Curve S (`aldes-bahia-curve-s-ceiling`) over the shower at
  (2.45, −1.85), 22.5 cm from the bathroom's west wall and 82 cm from the east wall (kept off the roof's low side).
  Ø80 stub up to an 87°30 at 2.84 (Ø100 Z 77 + socket 57 ≈ 13.4 cm over the ceiling; Ø80→Ø100 there), Ø100 south
  over the kitchen to y −5.06, west along the south wall (4 cm off it).
- **Kitchen:** the C21 r257 stays at (1.60, −4.865), face down flush on the ceiling (2.70); an 87°30 to 2.86 (socket 61
  + Z 96), west along y −4.865.
- **The corner:** each duct comes down through two 45° elbows onto the old wall crossing at 2.62 (kitchen y −4.865, bath
  −5.06): lower elbows at x 0.525, upper at 0.765 (kitchen) / 0.745 (bath). Ø125 45° F/F Z 41 + socket 61 puts the
  lower elbow's mouth 0.8 cm off the wall face; Ø100 45° Z ≈ 35 is assumed (Hypothesis, not checked), socket 57.
  The two ducts never cross: the bath stays south of the kitchen run all the way (why the east-side route was kept;
  a west-wall route would have crossed the kitchen duct at the corner).
- **Boxes:** r252, r261, r262 and their 10 tile finishes removed; r254 is now only the corner box, x 0.415–0.818 (flush
  with the wall cabinets' fronts), y −5.15…−4.78, underside 2.50, still tiled. The hood's chimney stays at 2.50 (owner:
  "Keep chimney as it is for now"); a Ø150 hood exhaust through the south wall is planned (owner), not yet drawn: a
  `hood` pipe service is to be added so it stays out of the VMC airflow model (`src/core/airflow.js` reads `vmc` only).
  Behind the chimney the clear band between buried conduits is ≈ 1.85–2.39 m (cs416 at ≈ 1.83, cs418 at 2.40).
- The conduits the boxes covered (cs95, cs96, cs455, cs456 at 2.55) are buried in the walls (owner).

Proven in Node: no conflicts, no dimension deleted, no pipe or conduit within 2 cm of the moved ducts. Ground-floor
lengths: bath 6.70 → 6.84 m, kitchen 2.61 → 2.71 m; bath vent to unit B 13.76 m. Hypothesis (the model of "Unit B
stays a Classic", Colebrook, B ≥ 122 Pa, room depression 10–20 Pa, OUT 1–3 Pa, 80 Pa vent floor): **Ø80 all the
way was checked and rejected** (owner asked): ≈ 22.0 Pa friction (1.60 Pa/m) + 6 turns × 1.3 ≈ 30 Pa, the vent ≈ 69–81
Pa at boost (≈ 42 instead of 45 m³/h); it would need ≈ 7 m. Ø100 (recounted 2026-10-16, the route as written: 1.7 m/s, 0.53 Pa/m × 13.76 m ≈ 7.3 Pa, four 87°30′ at K 0.6–0.8 ≈ 4–5.5 Pa, two 45° pairs ≈ 1–1.6, reducers ≈ 0.5): ≈ 13–15 Pa, the vent ≈ 84–98 Pa at boost (lower if the kitchen boosts at the same time: B's pressure falls with its flow). The kitchen gains
one 45° pair (≈ 2–3 Pa at 135 m³/h), so ≈ 61–78 Pa at its vent at boost in PVC. Open (Hypothesis): the roof underside
along x 2.45 should be ≥ ≈ 3.10 m (duct top 2.89, wool to 3.06, an air gap); the joists' direction (a duct crossing
them sits on top and loses that much wool); insulate the attic ducts (≈ 25 mm) and seal the air barrier at the four
ceiling holes; a steady fall, no sag.

**Fittings to datasheet sizes, and the two runs too short for them (owner, 2026-10-15: "modelize the bends in 3d
view", then "make sure the product dimensions are not guessed").** View 3D draws the VMC and waste fittings from the
drawn angles (`src/core/pipeFittings.js`; CLAUDE.md). Proven (Nicoll datasheets, downloaded 2026-10-15:
FT_coudes_evac_FF.pdf, FT_coudes_evac_MF.pdf, FT_culottes_simples_FF_evac.pdf, FT_reductions_evac.pdf; all values in
that module): **Z runs from the corner to the socket bottom** (the M/F drawing: Z ends where L begins; h = Z + L is the
spigot end), so two F/F fittings need their centres ≥ (Z + L) + (Z + L) apart, and an M/F one ≥ h + the other's Z.
Corrections this brought: draft 1d's "two 87°30′ Ø125 need 96 + 96 = 19.2 cm" left out the sockets (31.4 cm), and its
laundry 45° pair "≥ 41 + 41 mm" too (20.4 cm). Ø100 45° CT44 Z 33 (was assumed 35); Ø160 sockets 61.
Run on the 287 526-char plan, the derivation flags: the kitchen turn over the alcove (① west → south, ② south → down,
20.75 cm), the laundry pair (12 cm), the WC stack foot in the basement (pn62–pn63, 9.6 cm, drawn before parts were
chosen) and an 8.5° bend on the outside collector (pn81). Layout S's M/F joints read as `mf` (buildable), as designed.
- **Fix A (owner: "Show me fix A", then "Cpw"; written to the headset 2026-10-15 with the laundry fix, 287 516 chars,
  read back identical; scratch `fixShort.mjs`, nothing added or removed):** ① becomes a Nicoll **CX8** 87°30′ M/F Ø125 (Z 96, L 61, h 157;
  Leroy Merlin, Bricoman, Point P list it), its spigot straight in ② CX88's socket: h 157 + Z 96 = 25.3 cm needed. The
  kitchen run (vent r257, pn311–pn313, pn342–pn343) moves 4.75 cm north to y −4.8175 (25.5 cm); the bedroom box r255
  21 → 25.75 cm deep and the kitchen corner box r254 37 → 41.75 cm (front −4.7325). The buried conduits climbing the
  wall (cs77, cs299, cs305 at y −4.74/−4.73) stay 0.5–1.7 cm off the duct.
- **Laundry:** the two 45° CX44 move 15.2 cm back on each leg (pn316 y −4.312, pn338 x −1.002): a 21.5 cm diagonal.
- Set aside (Proven, Node): fix B (two F/F, the run 10.85 cm north) cuts those three conduits; **no arrangement of
  three 45°** fits (an exhaustive search: the descent can only start inside the 18 cm alcove column, and two 45° need
  20.4 cm between centres); swapping the two ducts in the alcove fits with the bedroom box +0.55 cm, but the drops swap
  sides, so the bath duct must cross under the kitchen one in the laundry (≈ 1.77 m underside, four more 45°), both
  ducts jog in the attic, and the Ø125 needs the bigger wall-top channel. Loss of ① + ② at the kitchen boost
  (Hypothesis, the model of draft 1d): ≈ 10–13 Pa at 135 m³/h, ≈ 2 at 55, ≈ 0.1 at 15; the swap would save the
  kitchen ≈ 3–5 Pa.

**The bath duct's two flat corners as 45° pairs (owner, 2026-10-16: "introduce the 45 bends where it is missing"; written
2026-10-16, 287 829 chars, read back identical).** The two flat 87°30′ (attic pn302, south → west; laundry pn306, north → west) each become a Nicoll
F/F 45° Ø100 pair (Z 33 + L 57 = 9.0 cm reach each, so ≥ 18.0 cm between the elbows): each corner node moves 13 cm back
along its incoming leg and a new node sits 13 cm along the outgoing one, an 18.4 cm diagonal (attic: pn302 (2.45,
−4.93), new (2.32, −5.06); laundry: pn306 (−0.65, −4.095), new (−0.78, −3.965)). The other two 87°30′ stay: the
vent's (ceiling → attic, 14 cm rise, no room) and pn304 (west → down into the alcove column). Proven (scratch
`bath45.mjs`, the fitting check and a clash check on the draft): no new fitting flag, nothing within 2 cm of
another pipe, conduit or zone; the bath duct 13.60 m. Hypothesis (the same loss model): ≈ 12–13.5 Pa at the boost
instead of ≈ 13–15, the vent ≈ 86–99 Pa.

**The kitchen corner box narrowed (owner, 2026-10-16: "There is opportunity to make ceiling box smaller no?", then
"Fine", W; written 287 813 chars, read back identical).** Measured under the ceiling (scratch `boxFill2.mjs`: the
surface of every duct and fitting socket at z ≤ 2.70): the two 45° descents from the attic reach x 0.691, so r254's
east face moved 0.818 → 0.715 (40.3 → 30 cm west–east; 41.75 south–north, underside 2.50 unchanged; it carries no
dimension). The bedroom box r255 cannot narrow (its north face is 1.5 cm from a Ø125 socket). Both could rise ≈ 3 cm
(the lowest socket is at 2.55) but stay at 2.50, in line with the alcove head r259 (owner). Accepted trade-off: the
wall cabinet r162 below (0.423–0.818, top 2.48) now runs 10 cm past the box's east face. Proven (house-query diff:
no conflicts, only r254 changed; the clash list identical to the written plan).

**The bedroom box replaced by a corner column (owner, 2026-10-16: allowed "to use the corner to make the ducts drop to
the basement ... to avoid odd shapes in the ceiling corner"; "I did not mind the ceiling box on the kitchen, I only
minded the ceiling box in the bedroom"; written 288 795 chars, read back identical; scratch `colStack2.mjs` +
`colStack3.mjs` on the 287 813 plan).** Supersedes the bedroom side of "Ground-floor ducts in the attic" (box r255,
the alcove drops, column r256) and the r254 size above.
- **Route:** both ducts still come down into the kitchen box r254 and cross the 41.5 wall at 2.62, then turn down at
  once 8 cm from the bedroom's wall face in a **column r261** in the bedroom's south-east corner (17.25 west–east ×
  41.35 south–north, floor to ceiling, a full-height half wall like r256 was; dimensioned to r51's east and south
  edges). At the floor a 45° takes each one west and down through the slab, as in the alcove ("it is ok to nick the
  top of the wall, as little as possible"); started at the floor the slant clears the laundry's east wall top (face
  −0.15) by 4.2 cm (kitchen) / 5.9 cm (bath), so nothing is nicked (Hypothesis: that wall sits under the 41.5 wall).
- **Laundry (owner: "the 90 bend can become 45 ... turn in parallel together"):** both leave the slant with a 45°
  heading west, then turn north and west together as concentric 45° pairs 18 cm apart across the diagonals (north
  legs x −0.72 bath / −0.92 kitchen) into unit B's lanes (−3.965 / −4.16).
- **Why the bath moved north:** the laundry needs the bath on the north/east side of the kitchen duct (unit B's
  bath port is the northern one), so the bath turns west in the attic at y −4.655 (was −5.06), passing north of the
  kitchen vent's riser; r254 grows north to hold its descent (30 × 57.35 cm, front −4.5765, underside 2.50, still
  tiled). Its wall crossing passes the hub's cables buried at y −4.74 (cs77, cs299, cs305) 1.7 cm clear; the kitchen
  drop passes the hub cables 0.7 cm in front of the wall face (buried, so no clash).
- **Electrical moved:** the hub cn70's cable to the basement (cs433) now runs in the wall to a new junction cn352
  (0, −4.55, 0.35) and its basement junction cn325 moved to (−0.17, −4.50, 1.70), clear of the bath duct.
- Removed: r255, r256; alcove head r259 spans the whole 1.02 m opening (right edge dimensioned to r133's).
- **Ø80 for the bath rejected again** (owner asked): 12.62 m ≈ 20 Pa + bends ≈ 8.5 ≈ 29 Pa, the vent ≈ 70–82 Pa at
  boost, still under the 80 Pa floor at the low end (Hypothesis, the model of "Unit B stays a Classic"); it needs
  ≈ 7 m. Ø100 ≈ 13–15 Pa on the 1e route (friction 6.9, the vent's Ø80 elbow 2.6–3.5, the column-top 87°30′ 1.0–1.4, four 45° pairs 2.1–3.1, reducers ≈ 0.5; corrected 2026-10-16 from a quick "9–11").
- Proven (Node): no conflicts, no dimension deleted, the fittings check flags only the old items (pn60–pn63, pn71,
  pn81, pn339); no clash with any pipe or cable at true heights (a cross-floor check: `clashAbs.mjs`; the per-floor
  script skips risers). Bath 13.60 → 12.62 m (1 × 87°30′ + 10 × 45° after the vent's Ø80 elbow), kitchen 9.71 →
  9.06 m (2 × 87°30′ + 8 × 45°); 19.49 m to insulate. Set aside: crossing at the bedroom's floor depth between the
  wall and the first north–south wooden lintel (no box at all) needs a ≥ 15 × 15 cm gap, unmeasured.
- **B's outlet (owner, 2026-10-16: "I settle for flexible for the 160 wall terminal"):** the 35 cm OUT to the west
  wall is an insulated Ø160 flexible, straight and taut, onto a Ø160 wall terminal; never Ø125 (Aldes: not smaller
  than the unit's outlet; Hypothesis: Ø125 would cost ≈ 4–15 Pa more, the exit's dynamic pressure, at every vent).

**Kitchen age of air on 4i (2026-10-17, owner: "Check instead the kitchen"; Hypothesis, scratch `kitchenAge.mjs`,
`ageMap.mjs`).** The app's whole-house network and 3D age-of-air model (`airflow.js`, `airflow3d.js`), scenario
"normal" (kitchen 30 m³/h), doors shut, the assumed EHB² inlets on the dry rooms' windows (r80, r108, r109, r113, r115;
not in the plan) and two sleepers per bedroom. The kitchen has no inlet: its air comes from the living room and hall
through passage r117, already ≈ 1.5 h old. Inside the kitchen at 1.2–1.7 m: **4i 91–95 min** (the hob's corner ≈ 3 min
older than the freshest), today's headset plan (ceiling vent by the hob) 90–103 min (the passage's end older). No
stagnant pocket in either; the kitchen (≈ 19 m³) turns over in ≈ 38 min. No heat plume, hood or eddies in the model.
**Trap:** `airflow.js` treats a duct end within 15 cm (PORT_REACH) of a VMC unit as one of its ports, not a vent; 4i's
laundry stub ends 12.9 cm from unit B, so the model drops the laundry vent (the runs lengthened it to 25 cm).

**4i in everyday use, simulated (2026-10-17, owner asked; Hypothesis, scratch `simFlow.mjs`).** An operating-point
solve: the fan curve, the 4i duct losses (kitchen and shower flexible, mid of the range, ∝ Q^1.9), 5 % leakage, the Ø160
flexible outlet with a terminal of K 2, a room depression of 10 Pa at 160 m³/h ∝ Q², wind 0 or 20 Pa; each BDH vent holds
its humidity flow (C51 15→55 at 23→63 % RH, BW51 and B51 5→35 at 35→65 / 45→75 %) while it sees ≥ 80 Pa (C51 boost 70)
and acts as an orifice below. Results: at 40–50 % RH every unit delivers every flow in calm and wind (vents ≥ 92 Pa).
Evening peak (both showers, laundry drying, cooking without boost, 168 m³/h): Classic in calm 78–80 Pa at the showers
(≈ 34.5 of 35), in wind 65–66 Pa (≈ 31.5–32); MW 94–97 calm, 76–78 windy (≈ 34–34.5); HP+ ≥ 99 always. Kitchen boost:
Classic 128 m³/h calm / 118 windy of 135, MW 135 / 126, HP+ 135 / 135. The Classic's curve beyond 197 m³/h is extended to
95 Pa at its 221 m³/h maximum (notice), not published.

**4i with the kitchen and shower ducts in flexible (2026-10-17, owner asked; Hypothesis).** Flexible loses ≈ 2× smooth
PVC per metre (Baillindustrie chart for Ø125/Ø160, extrapolated to Ø80; CPT §3.3.6.4 asks NF DTU 68.3 annex A values,
not read) and its bends were taken at K 0.6–1.2 (90°) / 0.3–0.6 (45°): kitchen 3.89 m ≈ 21–33 Pa at 135 m³/h (rigid
16.8–21.0), shower 6.49 m ≈ 16.5–23 Pa at 35 (rigid 12.3–14.6); the upper (Ø80 sealed + Ø100) 16.1–18.8. CPT, 12 %
leakage, façade + 20: **HP+** fails only the shower room at its own minimum-demand point (78–89 Pa, rigid 89–94);
**MP** fails the minimum-demand points (63–74) and the shower at the max point; **MW** fails the max point (13–66) and
the bathrooms at the intermediate (58–75); **Classic** is off its curve at the max point and 42–79 elsewhere.

**Where to buy a Compact Premium (2026-10-17, read on leroymerlin.fr):** Proven: Leroy Merlin's "Kit VMC simple flux
hygroréglable ALDES Easyhome Hygro Compact Premium" (LM 82201372) is Aldes **11033451**, which Aldes' distributors (Cedeo,
Sonepar, ManoMano) name "Kit EasyHOME HYGRO COMPACT Premium **MW** BDH" (group + C51 PUSH + B51 + W16 PRES), 309 € from a
marketplace seller; its spec table: 263 m³/h, 9.8 W-Th-C. The Compact Premium **HP+** group alone is Aldes **11033025**,
listed on leroymerlin.fr at 370 € (marketplace "Pro market", 7 other offers); 11033020/11033021/11033421 are the
non-compact EasyHOME Hygro Premium HP+ (5 Ø80 + 1 Ø125, a larger box), not the Compact. Hypothesis: LM 88761043 "KIT VMC
EASYHOME HYGRO COMPACT PREMIUM" (295 €, sold by the marketplace "Pro market"; 365 m³/h, 9.9 W-Th-C) names no motor.
**Sold by Leroy Merlin itself** (the site's "Vendu par Leroy Merlin" filter, 11 hygro kits, 2026-10-17): of Aldes, the
Compact Classic kit 11033404 (259.90 €, the owner's), the Compact Premium MW BDH kit 11033451 (Leroy Merlin is one of
its "autres offres", ≥ 329.90 €; the main offer is a marketplace seller) and an "Easyhome®" kit 87769196 (259 €) that is
an EasyHOME HYGRO COMBLE + 3 BDH (20.5 W-Th-C, 213 m³/h; an attic unit, not a Compact). No HP+ is sold by Leroy Merlin
itself; only marketplace sellers list the Compact Premium HP+ 11033025.

**Option 4i: 4h with the upper duct Ø100 in the basement (owner, 2026-10-17: "Let's assume it is sealed up to basement
... Switch to 100 and keep unit close to east side?"; written to the headset 2026-10-17 with the bed, 287 012 chars,
read back identical).** The upper bathroom duct stays Ø80
down to the basement ceiling (pn58); from there its two basement runs (p287 south along the west wall 2.80 m, p288 east
3.74 m) are Ø100, with an 87°30′ Ø100 + reducer where the Ø80 comes down and a reducer Ø100→Ø80 on a 15 cm Ø80 stub
(new pn363, p333) before unit B's west port. Scratch `up100.mjs`, `lossMixed.mjs`, `views4i.mjs`. Proven (Node): the
fitting check flags only the old items (the elbow with reducer is an estimate in `pipeFittings.js`, no datasheet); no
clash for the new pipes; no conflicts, nothing removed. Hypothesis (bores 77 / 96 mm): upper 16.1–18.8 Pa at 35 m³/h
(all-Ø80 4h 21.0–23.5). CPT with the HP+ (12 % leakage, façade + 20, terminal K 1–3): every point passes, lowest 84–89
(the upper at its minimum-demand point), then the shower room 89–94; with 5 % leakage the same. The Classic still fails.
Final form (2026-10-17, scratch `final4i.mjs` → `draft-4i-final.json`, drawings `views4i.mjs`, `side4i.mjs`, a share link
sent to the owner as a file): the vents get their BDH models, the shower r251 `aldes-bdh-sanitaire-ceiling` at (2.45,
−1.96), the kitchen r257 `aldes-bdh-cuisine` on the 41.5 wall's kitchen face (centre y −2.13, z 2.45, facing 90 like
the Metod wall cabinets there), the upper r223 `aldes-bdh-sanitaire`; no dimension on them; Proven (Node): solver clean,
nothing removed; the share link round-trips all 238 pipes, 267 pipe nodes and 186 markers. The drawings show the
Nicoll rigid fittings even where the owner plans flexible ducts (kitchen, shower room).

**The upper bathroom duct stays Ø80 (owner, 2026-10-17: "the upper floor duct is already sealed").** Hypothesis: the
sealed part is the upper floor's run and the riser to the basement ceiling (pn45 → pn58, ≈ 6.7 m); the basement ceiling
runs (p287, p288, 6.7 m in 4h) are not built yet. CPT check with the HP+, Ø80 everywhere: 4h fails only the upper
bathroom's minimum-demand point (78–83 Pa); 4h with the basement part in Ø100 (≈ 4.5 Pa less, two reducers) passes,
lowest 84–89; the unit where it is (4f, OUT 0.35 m west) passes in Ø80, lowest 83–89 (upper) and 86–91 (shower room).
The Classic fails in every layout.

**Option 4h: 4g with unit B 26.5 cm further east (owner, 2026-10-17: "Sure"; drafted in Node, not written).** Unit B at
(−0.675…−0.315, −3.18…−2.82), 16.5 cm from the laundry's east wall (Aldes: 10 cm at the lug). Its kitchen port sits
right under the slab exit (x −0.395), so the kitchen Ø125 turns from its 45° slab slant straight south with one elbow (a
90° turn, read as 87°30′ within the 3° tolerance) instead of a 45° and an 87°30′. Scratch `move4h.mjs` (KS=1, CX −0.495).
Proven (Node): fitting check only the old items; the only clash cable cs135; no conflicts, nothing removed. Lengths:
shower 6.49 m, kitchen 3.89 m (2 × 87°30′ + 3 × 45°), upper bathroom 13.20 m. Hypothesis (the duct model): kitchen
16.8–21.0 Pa at 135 (4g 18.2–22.9), shower 12.3–14.6 at 35, upper 21.0–23.5 at 35 (Ø100 ≈ 8.3–9.9). CPT with the HP+:
every point passes except the upper bathroom's minimum-demand point in Ø80 (78–83); with the upper in Ø100 all pass,
lowest 89–94 (shower room).

**Option 4g: 4f with unit B moved (owner, 2026-10-17: "Is it possible to move the Vmc unit now? And count the pressure
loss"; drafted in Node, not written).** Unit B r219 to (−0.94…−0.58, −3.18…−2.82), hung as before (1.858–2.045), turned a
quarter (facing 270 → 0): OUT Ø160 and the laundry Ø80 face south, the kitchen Ø125 and the shower Ø80 north, the upper
Ø80 west, the lug east (Hypothesis: the port ends are the facing-270 ones, Proven with the builder, turned 90° in plan;
not re-measured on the builder). The ground ducts leave the slab heading west at 1.955 and turn south (87°30′) straight
into the north ports: no diagonals across the laundry. The upper duct comes down the west wall to y −3.097 and runs
straight east 3.6 m into the west port, 7.7 cm south of door r120's sweep. OUT: 1.87 m Ø160 flexible straight south
through the south wall at x −0.675, 1.2 m east of window r146 (the wall's outside face assumed at −5.10). Laundry vent:
a stub off the south port. Scratch `move4g.mjs` (no new ids; pn307, pn329, pn357, pn364 and their pipes removed),
`views4g.mjs`. Proven (Node): fitting check only the old items; the only clash cable cs135 as before; no conflicts,
nothing removed. Lengths: shower 6.76 m (2 × 87°30′ + 6 × 45°), kitchen 4.16 m (2 × 87°30′ + 4 × 45°), upper bathroom
12.93 m (4 × 87°30′ + 2 × 45°; was 10.15). Hypothesis (the duct model above): at 35 m³/h shower 12.6–14.8 Pa, upper
20.7–23.2 Pa (Ø100: ≈ 8–10); kitchen at 135 18.2–22.9 Pa. CPT check (12 % leakage, façade + 20, a terminal of K 1–3):
with the Compact Premium HP+ every vent passes except the upper bathroom's minimum-demand point (78–84 Pa in Ø80); with
the upper duct in Ø100 every point passes, lowest 89–94 Pa (shower room). MP still fails the minimum-demand points
(weak at low flow); the Classic and MW fail as before.

**Option 4f (owner, 2026-10-17: "drill slanted west downward 45 from the attic directly to the bedroom wall"; drafted
in Node, not written).** Option 4e (vent at (2.45, −1.96)), but the Ø80 leaves its attic run (2.84) with one 45° at
x 0.46 and slants 45° down-west in a straight line through the 41.5 wall: a ≈ 59 cm hole entering the kitchen face at
2.74–2.85 (axis 2.795, above the kitchen ceiling) and leaving the bedroom face at 2.32–2.44 (axis 2.38); one 45° at
(−0.08, −1.96, 2.30) in the column turns it straight down. **No kitchen box**, and the column-top 87°30′ is gone.
Proven (Node, scratch `opt4f.mjs`, `views4f.mjs`, `side4f.mjs`): fitting check flags only the old items; the only clash
is the Ø125 drop 0.8 cm from buried cable cs135; no conflicts, nothing removed. Shower room 10.10 m, 1 × 87°30′ (at the
vent) + 8 × 45°. Hypothesis: ≈ 15.4–17.5 Pa at 35 m³/h, ≈ 2 Pa less than 4e. **Open (Hypothesis):** the hole's kitchen
end crosses the wall top at slab height (2.70–2.95, where the upper floor bears and a ring beam may run); the wall's
material; the attic run at 2.84 among the kitchen ceiling's joists.

**Option 4e (owner, 2026-10-17: "the bathroom duct straight east west with no elbow", then "I prefer to violate the
20 cm rule, make it straight"; drafted in Node, not written).** Option 4d below, but the shower room's vent and its
riser move 11 cm south, to (2.45, −1.96), onto the duct's line: the Ø80 runs straight west at y −1.96 from the vent's
87°30′ at 2.84 through the attic, the 45° drop to 2.62 and the wall into the column; the 45° pair that stepped it south
is gone. **Deliberate deviation:** Aldes (BW51 product sheet) asks "au moins 20 cm entre le centre de la bouche et les
parois adjacentes"; the vent's centre is 11 cm from the shower room's south wall (−2.07), a BDH's edge 2.5 cm from it.
(A rolled drop keeping the vent at 22 cm was drafted first and set aside by the owner.) Proven (Node, scratch
`opt4e.mjs`, `views4e.mjs`): the fitting check flags only the old items; the only clash is the Ø125 drop 0.8 cm from
buried cable cs135, as in 4d; no conflicts, nothing removed. Shower room 10.28 m, 2 × 87°30′ + 8 × 45° (was 10.33 m,
10 × 45°). Hypothesis: ≈ 17–20 Pa at 35 m³/h, ≈ 1 Pa less than 4d; the attic has room for the Ø80 at y −1.96 between
the lintels (unchecked). Then (owner: "The ceiling box can be shorter and the piece in the attic longer"): the drop
moves 28 cm west (upper 45° at x 0.72, lower at 0.50, whose west socket ends 1.15 cm from the wall's kitchen face at
0.415; Nicoll 45° Ø80 Z 26.5 + socket 47), so the box shrinks to x 0.415–0.66 and, its north part unused, y −2.0275 to
−1.8925: **24.5 × 13.5 cm** (was 52.5 × 24.5), underside 2.50. The duct passes the ceiling (2.70) at x ≈ 0.52–0.64,
inside the box. Checks as above, unchanged; 6.82 m of the shower duct to insulate (the attic piece is longer).

**Option 4d: through the wall near the bedroom's north-east corner (owner, 2026-10-16; drafted, not written).** The
owner's reason: "there are east west lintels, so I have a hard time doing a north south pipe from the bathroom". The
written route (1c) runs the shower-room duct north–south in the attic over the shower room and r106, across those
lintels; 4d keeps every attic run east–west. Arrived at through sketches 4 → 4b → 4c → 4d (owner choices, in order:
"Shower room vent in the ceiling, duct in the attic", "Duct to be 80 for now"; the kitchen vent "can sit on the 41 cm
wall high up there in the kitchen, and avoid going in the attic"; "In the bedroom column, instead of going straight
down, maybe do a s"; the narrow column: "I am trying to make the column less thick in the west east axis").
- **Shower room (Ø80 from the vent to unit B):** the vent stays on the ceiling at (2.45, −1.85); up 14 cm into the
  attic, west at y −1.85 to x 1.00, 45° down to 2.62 at x 0.78, a 45° pair 11 cm south (x 0.63 → 0.52, y −1.96), through
  the 41.5 wall at 2.62, down at x −0.08 (8 cm from the bedroom's wall face).
- **Kitchen (Ø125):** the vent on the 41.5 wall's kitchen face, north of wall cabinet r166 (its side at y −2.255), centre
  (0.415, −2.13, 2.45); straight west through the wall, an 87°30′ down at x −0.08. No attic and no box for the kitchen.
- **Column (new, a full-height half wall) on the bedroom's east wall from its north-east corner:** 17.25 west–east ×
  58.25 north–south (y −1.88 to −2.4625), like r261's width. Each duct makes an S south in it (two 45°; the kitchen's
  S higher: Ø125 1.70 → 1.46, Ø80 1.40 → 1.14), so both pass south of the 41 cm wall band between r66 and the basement
  stairs (y −2.15 to −1.744) before the floor: the Ø80 drops at y −2.22, the Ø125 at −2.37. The S cannot swap the two
  (one 17 cm plane), so they enter in unit B's port order: Ø80 north, Ø125 south. Socket m59 (x −0.30) stays.
- **Slab and basement:** at the floor a 45° west through the slab, as today, landing in r66 at x −0.395 (a vertical drop
  at x −0.08 would land in r66's east wall, x > −0.15). Then west to x −0.66 (Ø80) / −0.605 (Ø125) and one 45°
  diagonal each, 14.3 cm or more apart, into unit B's lanes (y −3.965 / −4.16), clear of door r120 (head 1.94).
- **Kitchen box (new, soffit, underside 2.50):** at the kitchen's north-west corner, x 0.415–0.94, y −2.0275 to
  −1.7825 (52.5 × 24.5 cm); it holds only the Ø80's descent and jog. Gone: box r254, column r261 (and the four
  dimensions on them), the attic run over the shower room, the south wall crossing.
- Proven (Node on the 288 795 read, scratch `opt4d.mjs` + `opt4d-rebuild.sh`): the fitting check is clean for every
  new fitting (the first try had the box's two Ø80 legs at 13 cm, need 14.7, and the Ø125's first basement run at
  15.5, need 20.4; lengthened); the only flags left are the old pn60, pn62, pn63, pn71, pn81, pn339. True-height
  clash check: only the Ø125 drop 0.8 cm in front of a cable buried in the east wall at 35 cm (cs135, as r261 today).
  Solver: no conflicts, no dimension deleted. Lengths: shower room 10.33 m Ø80 (12.62 m Ø100 today), 12 fittings
  (2 × 87°30′, 10 × 45°; no reducer at unit B); kitchen 7.86 m Ø125 (9.06), 7 fittings (1 × 87°30′, 6 × 45°).
  To insulate 11.33 m (6.54 + 4.79; 19.49 today).
- Hypothesis / open: the attic lets the Ø80 run east–west at y −1.85 between the lintels; the slab slant clears r66's
  east wall top as today; the shower-room Ø80's loss (≈ 21 Pa at 35 m³/h on the longer 1e route, so less here); the
  vents' furniture (the kitchen vent becomes a wall model on the 41.5 wall); a share link; the owner wants to adjust
  the layout further before any write.

**The vents: Aldes BDH (owner, 2026-10-16: "Forget everything about Bahia, we are using now the bdh").** The Bahia
Curve vents drafted until then (~~C21 in the kitchen, BW21 in the bathrooms~~) are superseded, because the owner's kit
is BDH and each Avis Technique approves only configurations of its own range. The sections above that name a C21 or a
BW21 record what was drafted or written at the time; the C51 has the C21's figures (15–55 / 135, peak from 70 Pa),
so their kitchen pressure budgets hold; the bathrooms' 45 m³/h becomes 35. Proven:
- **The kit is BDH.** Leroy Merlin 82201371 = Aldes 11033404 lists "Groupe EasyHOME Hygro COMPACT+ 3x Bouches Bdh";
  the owner's boxes hold a **W16 BDH 5/30** presence Ø80 (11015126) and a **B51 BDH 5-35** Ø80 (11015170); there is
  no kitchen vent yet (owner: to buy).
- **The approval is 14.5/25-2320_V2 "BDH solution individuelle"** (valid 2025-07-01 to 2032-06-30; Aldes'
  `avis-technique-bdh-solution-individuelle-atec14.5-25-2320_v2.pdf`, read 2026-10-16). It covers the EasyHOME HYGRO
  COMPACT Classic. Every vent works at 80–160 Pa; a kitchen vent's peak holds from 70 Pa.
- **Vent pressures against the BDH range (2026-10-16/17, owner asked).** Proven (AT 14.5/25-2320_V2 §2.2.2.2.1,
  §2.2.2.2.5 Tableau 12, §2.3.3, Annexe D Fig. 58 p. 56; **CPT "VMC Hygro / habitat individuel", cahier CSTB
  3828_V1** of July 2024, §2.2.3, §2.4.2, §3.3, free from ccfat.fr, family 697):
  - B, B51 and BW51 work at **80–160 Pa**, the BW's boost from 80 Pa, the C's boost from 70 Pa. The design must
    keep every vent in that range at three kinds of check point, each with a fixed allowance for **the window inlets
    and the door undercuts: 20 Pa at the maximum flow, 10 Pa at the intermediate flow, 5 Pa at each minimum-demand
    point**, plus **20 Pa for a façade discharge** (ours: the Ø160 terminal in the west wall; a roof discharge escapes
    it only if it meets NF DTU 68.3 §6.5.2) and the real loss of the discharge (never a flat value).
  - Design flows (Tableau 12): C51 27 / 135 m³/h (60 % RH: 52), BW51 5 / 30, B51 5 / 20. Network leakage is added at
    each vent: 12 % of max(Qmax, 35), or 5 % with class C sealed ducts and fittings fitted per NF DTU 68.3 annex C.
  - The house (kitchen, 2 SdB/WC, laundry as a salle d'eau) has a maximum flow (CPT Tableau 5) of
    135 + 30 + 30 + 5 = 200 m³/h, **228.8 with 12 % leakage, 212 with 5 %**. The Compact Classic's published curve
    stops at **197 m³/h** (112 Pa), where it meets the CPT's minimum curve (Pmin + 20 + 24 (Q/300)^1.9, §2.4.2).
    So **on paper the Compact Classic cannot serve this house's maximum check point, whatever the ducts**.
  - The curve (read by eye, ±2 Pa): 128 Pa at 5 m³/h, 120 at 30, 119 at 40, 121 at 55, 124 at 75, 126 at 100,
    125 at 125, 123 at 140, 121 at 155, 117 at 175, 112 at 197.
  - Other points, option 4d ducts (Hypothesis: duct losses from the model of draft 1d, scratch `loss4d.mjs`, scaled
    to each branch flow; discharge 1–2 Pa, an underestimate, see below; scratch `cpt4d.mjs`), façade / without the façade 20 Pa:

    | Point (12 % leakage) | B | Kitchen | Shower room | Upper bathroom | Laundry |
    |---|---|---|---|---|---|
    | Intermediate, 186 m³/h | 115 | 75–77 / 95–97 | **56–61** / 76–81 | **59–63** / 79–83 | 82–83 / 102–103 |
    | Minimum demand, shower room at max, 101 m³/h | 126 | 96–97 | **73–78** / 93–98 | 97–99 | 98–99 |
    | Minimum demand, upper bathroom at max | 126 | 96–97 | 97–98 | **75–79** / 95–99 | 98–99 |

    With 5 % leakage the intermediate point gives the bathrooms 63–69 (83–89 without the façade 20 Pa). Every vent
    passes without the façade 20 Pa except the intermediate point's low end at 12 %; with it, the bathrooms fail.
  - **The discharge (2026-10-17, owner asked):** the CPT (§3.3.6.2) wants its real loss: the duct's friction plus the
    terminal's loss from its maker, at the whole flow through B. Hypothesis: the 35 cm taut Ø160 flexible ≈ 0.3–0.5 Pa
    at 186 m³/h (2.6 m/s); the terminal K × 4.0 Pa at 186 (1.2 Pa at 101), ≈ 4–12 Pa for K 1–3 above the free exit
    the fan test already includes (K unknown until a terminal is chosen). The 1–2 Pa used above is too low at the
    intermediate point by ≈ 3–10 Pa; choose a terminal with a published flow/pressure curve.
  - **Ø160 insulated flexible, from a maker's chart (2026-10-17, owner asked):** Proven (Baillindustrie GAI/LV insulated
    flexible, catalogue p. 152 "Pertes de charge des gaines isolées", read on the log chart ±10 %): the Ø160 line gives
    1 Pa/m at ≈ 167 m³/h, rising as Q^2.0: 0.36 Pa/m at 101, 0.8 at 150, 1.24 at 186, 1.9 at 229 m³/h, about twice a
    smooth rigid Ø160. Hypothesis: a straight taut run of ≈ 2.2 m (unit near the laundry's north-east corner, out
    through the south wall) costs ≈ 0.8 Pa at the minimum-demand points, ≈ 2.7 at the intermediate, ≈ 4.2 at the
    maximum; ≈ 1.4 Pa more than rigid PVC at the intermediate point. A sag or a bend in it adds more (the chart is
    for a straight duct). The Aldes Algaine isolée (PVC inner wall) is assumed to be close; Aldes publishes no chart.
  - **The Compact Premium units (2026-10-17, owner considering one):** Proven (Annexe D Fig. 59, 60, 62, read by eye
    ±2 Pa): Premium MW 125 Pa at 12 m³/h, ≈ 134 at 70–100, 138 at 145, 126 at 200, 115 at its 231 maximum; Premium
    MP 110 at 5, 107 at 25, 121 at 100, 138 at 150, 160 at 210, 163 at 230, 124 at its 301 maximum; Premium HP+ 122
    at 5–40, 133 at 90, 149 at 140, 165 at 190, 175 at 240, 160 at its 340 maximum (the Classic: 112 at 197). Every
    Compact has 4 Ø80 sanitary ports (MP 5 and HP+ 6 with the supplied doubles) and the 160 outlet. Check (Hypothesis:
    the 4d ducts, façade + 20, the Ø160 flexible 2.2 m + a terminal of K 1–3; scratch `cptUnits.mjs`), worst vent at
    each point with 12 % leakage: **Classic** fails the max point (off its curve) and the bathrooms at the others;
    **MW** fails the max point (22–45 Pa) and the intermediate (60–73); **MP** passes the max and intermediate but
    fails the minimum-demand points (66–73: weak at low flow, 121 Pa at 101 m³/h); **HP+ passes every point**,
    lowest 80–88 Pa (shower room at its minimum-demand point, 0–8 Pa of margin), highest 127 (≤ 160). The power
    curves (by eye) also favour the Premiums at everyday flows: ≈ 11–12 W at 100 m³/h against ≈ 21 W for the Classic.
  - Below 80 Pa a vent acts as an orifice (flow ∝ √Δp, Hypothesis): 65 Pa gives ≈ 31.5 instead of 35 m³/h.
  - Levers: a stronger unit (the owner kept the Classic, 2026-10-10), a roof discharge meeting the DTU, class C
    sealed ducts, Ø100 for the two bathroom ducts (≈ 1/3 of the Ø80 loss), fewer bends.
- **The house is an F4** (owner, 2026-10-16: 3 bedrooms and 1 living room). Hygro B, F4 with 1 SdB/WC (Tableau 17),
  with the second bathroom as an added SdB/WC and the laundry as an added salle d'eau:

  | Room | Vent | Flow (m³/h, at RH) | Timed flow | Control (Tableau 7) |
  |---|---|---|---|---|
  | Kitchen | **C51 BDH** Ø125 | 15–55 at 23/63 % | 135 for 30 min | CORD, or PUSH (2 × AA, 12 V or 230 V) |
  | Ground shower room r107 + r62 (with the WC) | **BW51 BDH** Ø80 | 5–35 at 35/65 % | 30 for 30 min | CORD or PRES |
  | Upper bathroom r86 (with the WC) | **BW51 BDH** Ø80 | 5–35 at 35/65 % | 30 for 30 min | CORD or PRES |
  | Laundry (unit B's room) | **B51 BDH** Ø80 (the owner's) | 5–35 at 45/75 % | none | none |

  C51 references (Aldes BDH Cuisine page): Ø125 cordelette 11015167, push piles 11015168, push 230 V 11015169, sans
  fût cordelette 11015166; 34 dB(A). The other BDH kitchen vents do not fit this house: the individual-house approval
  names only the C51, C62 and C66 (10–50 / 90; Hygro B gives the C62 to an F1, the C66 to an F2, the C51 to F3–F7);
  the C61 (15–50/75), C63 (10–50/105), C64 (10–50/120) and C65 (15–55/135) are the "Logement Collectif" range, where
  the BDH technical document (p. 10) gives an F4 the C64. The B51 and BW51 are 31 dB(A). The owner wants no presence sensing: the BW51
  comes as CORD (Tableau 7); its reference was not read (a sans-fût pull-cord BDH, 11015341, €79.68, was found on
  2026-10-16, needing a sleeve). The W16 (a WC-only vent) has no room: there is no separate WC.
- **One vent per bathroom (owner, 2026-10-16: "I am only going to put one single vent in the ground floor shower room
  or the upper shower room. There is no wc room, it is a combined single volume").** The ground shower room is r107 +
  r62, one L-shaped room with the WC; the upper bathroom r86 holds a WC too.
- **How the kitchen peak runs** (the BDH Avis Technique and technical document): by hand, never automatic for a
  kitchen; CORD is a pull cord with a timer, PUSH a motor on a wired push button (Aldes 11026011); the vent returns to
  its humidity flow after 30 min. A cooker hood must never be connected to the VMC (art. 14 of the arrêté of 24 March
  1982, on every BDH sheet).
- **Size (the 3D model, `docs/furniture.md`):** every BDH vent is 170 × 170 mm, its face 43.1 mm proud of the wall,
  on a 45 mm spigot (D0 sans fût: 47.1 + 41); BDH technical document p. 22.

Consequences (Hypothesis, the loss model above):
- **The kitchen duct stays Ø125.** The C51's 135 m³/h peak needs ≥ 70 Pa at the vent: Ø125 (option 1e) keeps it, Ø100
  (≈ 63–76 Pa lost) gives ≈ 113–124.
- **Ø80 now carries either bathroom.** At ≤ 35 m³/h: the ground shower ≈ 19–22 Pa on the 1e route; the upper bath's
  12.47 m Ø80 route ≈ 13 Pa of friction plus ≈ 8 Pa of fittings, ≈ 21 Pa, the vent at ≈ 93–100 Pa. The Ø80 bath was
  rejected earlier at the BW21's 45 m³/h; to recheck with the owner.
- **B's total:** ≈ 30 at rest (15 + 5 + 5 + 5), ≈ 60–110 in daily use, ≈ 150 with a kitchen peak alone, ≈ 180 with a
  peak and one shower, ≈ 210 with both showers, ≈ 240 only if the laundry is humid too: above the Classic's published
  221 maximum in that last case alone. Settle it with Aldes' pressure–flow curve for the Classic, or by reading the
  vents' pressure at commissioning.
- **Shops (Leroy Merlin, 2026-10-16):** its Aldes listings carry no C51 or BW51 by name; not checked further.

**Which ducts to insulate (owner, 2026-10-16: "mark the ducts that need to be insulated").** DTU 68.3's rule above (a
duct outside the heated volume: R ≥ 0.6, ≈ 25 mm wool) is derived from the plan in `src/core/ductInsulation.js` and
drawn in View 3D's ▤ Plan as a translucent yellow jacket over each cold stretch, with the total in the pipe legend.
A point is cold on an unheated storey (`floor.heat.heated` false: the basement), outside the storey's spaces (rooms,
stairs, walls, linings; gaps up to 60 cm between zones count as walls), or above its ceiling with no heated space of
the storey above (an attic). Proven (Node, the draft plan): ≈ 19.5 m of the 34.1 m of VMC duct, the bath duct
9.65 m (the attic, the wall-top crossing, everything in the basement), the kitchen 5.30 m; the ground floor's alcove
column and boxes are warm. Hypothesis: the basement is unheated in winter as the plan says; a duct run inside an
exterior wall counts as warm.

**Upper bathroom vent (owner, 2026-10-09/10: "Probable B, i want lean flow", then "Go 17cm"; written to the
headset 2026-10-10, read back identical):** an Aldes Bahia Curve S (furniture `aldes-bahia-curve-s`, `docs/furniture.md`) on the **south face
of boxing r220**, facing south, centre at 2.35 m and **17 cm from the bare west wall** (owner: "The guide says
20cm, but I will allow getting closer to the west wall"; the wall is bare today, its finish still to come,
2.5 cm assumed, which leaves the vent's edge 6.75 cm off it). Boxing r220 and half wall r210 both go from 22
to **25 cm deep**, one flat face (owner: "I would rather it be flat, 25cm all along"; dimension c1414). The
Geberit frame stays where it is, its front now 5 cm behind the face (Geberit allows 1–6 cm), so no drain
moves; the WC bowl comes 3 cm forward (front edge 77.9 cm from the north wall).
The Ø80 duct runs in the trench at **8.5 cm** from the wall (the sockets ≈ 1 cm from lintel 1), turns up
5 cm from the north wall, **leans 8.5 cm east** over its 2.2 m rise (≈ 2.2°) and turns south with **two 45°**
into the vent's sleeve. The lean costs no fittings and strains no joint (Hypothesis, geometry): the floor
pair is turned about the trench pipe's axis so its outlet already leans, and the top pair works in a plane
tilted by the same angle. Why 17 cm (Hypothesis, sockets Ø80 ≈ 88 mm, Ø100 ≈ 112 mm, the valve ≈ 147 ×
132 mm, ≥ 1 cm gap): with the roof vent the WC riser (28 cm) runs beside the top pair, which limits the vent
to ≈ 17 cm (pipe to pipe 2 cm, socket to socket 1 cm); with the valve the limit is the valve at 1.49 m, ≈ 19–20
cm. At 17 cm both WC options stay open; at the valve the duct passes 2.5 cm away. The valve hatch (14–36 cm
on the face) shows the duct at its back left.
Why two 45° need the 25 cm (Nicoll F/F Ø80: 45° Z 26.5, 87°30′ Z 61, socket 47): two 45° need ≈ 18 cm from the
duct axis to the outlet socket's mouth, which a 22 cm boxing cannot give; one 87°30′ (≈ 11 cm) fits 22 cm
but costs ≈ 1.4 Pa more at boost mid-run (≈ 0.6 Pa at 30 m³/h), and ≈ 2–4 Pa right behind the vent, where the
vent's jet hits the bend (Hypothesis: loss counted 1.5–2 ×, no Aldes data). Rejected: a jog (two more 45°, ≈ 1.2 Pa) to shift the duct sideways, since the
lean does it free; the vent facing up (Aldes: a vertical wall high up, or a ceiling, ≥ 1.80 m); a ceiling vent
fed from below (two 90° turns and a void above the ceiling). The drawn ceiling vent V0 (inside the boxing's
top) is replaced.

**WC stack vent (owner, 2026-10-09):** the contractor says the roof vent is not needed. Hypothesis
(secondary summaries of DTU 60.11, not the text): one open vent to outside per network is required; an air
admission valve is tolerated only with one; a vent far down the line does not protect a stack whose top is
closed (the falling water needs air from above), so with a distant open vent put a valve at the top of
the upper stack (in boxing r220). The ground WC after the swap (≈ 0.5 m drop into the basement drain)
needs nothing of its own if it joins the same vented collector. Open: ask the contractor where the
network's open vent is.
Why a valve alone is not enough (Hypothesis): it only opens under suction; pressure pushed back up from
the sewer or the long basement collector has no way out except through the lowest traps. The upper sink
and shower join the same stack, so with a closed stack top the WC flush pulls their traps (the shower's,
under a 9.3 cm tray, first). Valve size: it must be a Ø100 rated for a WC stack (≈ 43–44 l/s, e.g.
Nicoll CEP100 147 × 132 × 190 mm, with the French DTA approval); Ø32–40 mini valves serve one fixture
branch only. In boxing r220 at ≈ 1.30–1.49 m (above the 0.90 vanity rim), behind a hatch with a grille
(it draws room air; the moisture it moves is negligible next to the VMC and goes down the drain).
**Owner, 2026-10-10: keep the Ø100 riser and a Ø100 valve** ("I would still for now keep the solution with a 100
pipe and 100 valve"). The contractor proposed instead that the WC needs no riser and a vent could go at the vanity
(r132, 0.8–1.6 m east of the tee). Hypothesis (same secondary sources): the vent requirement is on the stack's
top, and here that top is the WC branch itself. A Ø32/40 mini valve under the basin, on its Ø40 drain, would vent
the stack only through the Ø40 and a one-fixture valve, so a flush would pull the shower's low trap (≈ 30 mm
seal under a 9.3 cm tray, typical) and the basin's: smell after idle days, gurgling. A Ø100 valve on a Ø100 pipe
that the vanity drain joins would work but only moves the riser, through 5.6–11 cm behind the frame. Not drawn: the
plan still shows the roof vent above the riser.
**Open vent and collector (owner, 2026-10-10):** the house's collector (the horizontal main drain the stacks
join) is **outside the house, under a paved area within the property, along the south face**, from the east
end (≈ 1 m above the basement floor, "I believe") to the west, **falling west**. The kitchen, the ground-floor
WC and the bathroom all leave south to join it. The basement's inside south face (laundry r66) is y −4.89,
x −0.14 → −4.62 (4.48 m; Proven: 2026-10-10 headset plan). Not in the plan yet; its exit and depth below
the paving are unknown. The drafted upper stack run (p58) stops in r66 at (−3.95, −2.40), 1.90 m up: it must
still cross the south wall, likely below outside ground (a sealed sleeve; Hypothesis), to join it. **No existing stack reaches the roof or the attic (owner, 2026-10-10): the network has no open vent today.**
So the upper riser's roof vent (drawn, p60/p61) is the network's only candidate open vent (Hypothesis: with it, the
Ø100 air valve on that riser is not needed, valves stay possible on the other stacks). The riser at (−4.42, 0.456)
is 0.38 m (plan) from upper window r115 and 0.93 m from r114 (west wall, heads 2.43 m; Proven, headset plan): a
roof outlet straight above it, on the slope near the west eave, may be inside the window-distance rule; offsetting
it in the attic toward the ridge clears it (Hypothesis; roof shape and height not in the plan). **Façade vent option (owner question, 2026-10-10):** a Ø100 pipe teed onto the top of the outside collector at the
paving, rising up the south façade as the network's open vent, with the Ø100 valve kept on the upper riser
(the valve covers suction at the stack top, the façade vent the pressure and the gases). Hypothesis: accepted if it
ends above the roof edge away from openings (the sources disagree whether the eaves suffice or the ridge is required:
ask the contractor); UV-proof or painted pipe, guarded low down, bracketed. Proven (headset plan): the ground and
upper floors have no south window; the basement's south window r146 is x −3.10…−1.84 (sill 1.32, head 1.98 m above
the basement floor); the nearest others are the west-wall windows r80/r113 (from y −4.25, 1.15 m from the south
face) and the east-wall r111 (x 3.27, from y −4.22). Owner, same day: the east part (kitchen, living room) is single-storey, its roof ≈ 3 m up; can the façade vent end
there? Proven (headset plan): the upper floor spans x −4.70 → 0.40 (its east wall r189, no opening in it); the ground
floor runs on to x 5.42, with no south window. Hypothesis: an outlet above that low roof, ≥ 3 m east of the two-storey
wall and clear of the east wing's openings and roof windows, meets the opening rules; the doubt is whether a vent may end
below a taller part of the same building (eddies off that wall push the plume down; some rules ask for the highest part).
Ask the contractor. The owner confirms no opening on the south side on the ground and upper floors. Hypothesis: that frees the pipe's
route, not its end: it still ends above the roof edge of the part it climbs (≈ 30–40 cm, or the ridge if the contractor
requires it), since a low outlet blows sewer air onto the paving and is outside the roof-exit rule. **Chosen and drawn (owner, 2026-10-10): no roof vent; a façade vent "where I happen to already have rain collector
pipes", separate from them (waste, not rain), at the corner where the wing's roof ridge meets the upper floor's
east wall (the south bedroom's south-east corner).** Drawn: Ø100 from the collector (not drawn; tee at (0.62, −5.75),
1.0 m above the basement floor) to the façade at y −5.62 and up to 3.40 m above the ground floor (ridge assumed
3.0 + 0.4: the ridge height is not measured). The WC riser now stops at the Ø100 air valve, 1.49 m in boxing r220
(roof stub p61 removed). The attic is closed: the
open vent may not end in it ("hors combles", RSDT art. 42 per secondary sources, Hypothesis), so an open vent
leaves through the roof covering (a vent tile / sleeved outlet), or an attic air valve backed by an open vent
elsewhere. Window distance: the sources disagree (1 m, 3 m, "+40 cm"); none allows "slightly above" instead
(Hypothesis; the UK rule is ≥ 0.9 m above any opening within 3 m). The collector's height is set by its exit
(the invert at the wall or the connection box) plus its fall (≥ 1 %) back to the upstream end; a basement
fixture or floor drain below it needs a pump (Hypothesis).

**Upper WC position and its drain (owner, 2026-10-09; drain option A chosen and written to the headset the same day, read back identical):**
- **Slab constraint (owner, corrected 2026-10-09):** along the whole west wall of the upper floor, a 14 cm
  trench next to the wall, then **lintel 1** (x −4.56…−4.50, 6 cm), a 29 cm clear bay (**bay 1**, 20–49 cm
  from the wall), **lintel 2** (x −4.21…−4.15, 49–55 cm), and probably a third at 84–90 cm (owner: "I suppose
  it will"; Hypothesis, likely a beam-and-block slab). Lintels are never cut and no pipe passes under one.
  The VMC Ø80 stays in the trench (x −4.625). Lintel height, slab type and screed thickness are unknown.
- **WC axis 60 cm from the west wall (owner, locked):** bowl r212 dimension c1418 0.356 → 0.416, frame
  r222 x −4.35…−3.85, half wall r210 0.88 → 0.90 (the frame's east top bracket reaches x −3.805), boxing
  r220 27 → 33 cm (air valve). Rejected 55 cm: the riser can pass 1.4 cm behind the frame's 5 cm-deep west
  post if it sits 8 cm from the north wall, but the frame's west top wall bracket (1.085–1.115 m, 4.5 cm
  west of the post, back to the wall) crosses it; fixes were dropping that bracket or two extra 45° elbows.
  At 60 cm the bracket clears the riser by about 0.5 cm.
- **The frame (Proven: Geberit CAD views 111.333.00.6_A/L/G.dxf from cdn.data.geberit.com, floor line
  from the manual 972.363.00.0 p.2: drain axis 23, WC rods 33, top 112 cm):** 50 cm wide, posts and feet
  5 cm deep; the PVC Ø100 outlet leg (rotating 45°, down or straight back; no sideways position) drops 9.2 cm
  behind the frame face. Free depth behind the frame to the north wall, frame face 2 cm behind the
  half-wall face: 5.6 cm behind the outlet bend (floor to 0.27 m, over its 10 cm width), 11.1 cm at
  0.27–0.57 m (the sink Ø40 passes here at ≈ 0.45 m), 8.1 cm behind the cistern (0.57–1.02 m). Each extra
  cm of cladding (Geberit allows 1–6) takes 1 cm off these.
- **Drain option A (owner: "I settle for this"; fitting sizes typical NF PVC Ø100, socket Ø112, Hypothesis):**
  the WC outlet at 60 cm stands against lintel 2's face (outlet 55–65 cm, its socket 6 mm into the lintel),
  so the WC water crosses lintel 2 **above the slab, inside the half wall**: Geberit leg cut ≈ 11.5 cm above
  the slab top → 87°30′ bend turning west, aimed 6° toward the north wall → ≈ 29 cm of pipe at ≈ 1.5 %,
  lying on the slab (bottom on the slab, top ≈ 11 cm), passing behind the frame's west foot → **87°30′ tee
  at (−4.42, 0.456)**, 28 cm from the west wall: up = the vent riser in boxing r220, down = the drop into
  bay 1 → 87°30′ bend ≈ 9 cm under the slab top turning south → ≈ 75 cm of pipe at 1 % in bay 1 → 87°30′
  bend at (−4.42, −0.30) down the stack. Pipe bottom in bay 1 ≈ 15 cm under the slab top (the deciding
  unknown: lintel height and slab type). Clearances (cm, outside of pipe or socket): west foot 1.9 (Proven
  geometry from the Geberit CAD: no crossbar between the feet below 12 cm, feet 4 cm wide × 4.5 cm deep, the
  outlet 9.2 cm behind the frame face), north wall 1.8, boxing r220's inside 2.1 (valve 1.1), lintel 1 2.4,
  lintel 2 15.4, column r122's east face ≈ 3.4 before its lining. Flow: about 1.1 m of horizontal pipe, the
  riser directly over the tee where the WC enters (textbook primary vent), slopes within 1–3 %; the weak
  point is four direction changes in ≈ 1.2 m (prefer a sweep tee, never less than 1 %, support the pipe on
  the slab). Rodding: through the valve's hatch straight down the riser; with a roof vent, add a capped
  access tee on the riser behind the hatch. Any back rail of the half wall along the north wall is left out
  where the pipe passes. A thicker half wall does not help: the frame, its outlet and its feet move together.
- ~~Layout C (45° elbow half above the floor, 45° M/F, flat 45° wye at (−4.45, 0.072), vent from the run's
  north end, run at x −4.45, written to the headset 2026-10-09)~~: its 45° WC branch runs under the floor
  from 60 cm to 25 cm and so crosses lintel 2, and its sockets touched lintel 1 once that lintel proved to be
  6 cm wide. Option B (stack in bay 2) was rejected: the WC would have to move to ≈ 62 cm, there is no room
  behind the frame for a Ø100 vent, and the column would move ≈ 70 cm from the wall. Option C (over lintel 2
  in the screed) needs ≈ 12 cm of screed.
- **Column r122 (owner):** north face 90 cm from ground window r108 (new dimension c1443; the old 43 cm
  depth c774 removed), south face on room r57's edge (c772): **14 cm deep**; its east face is 37 cm from the
  west wall for option A (passage r56's dimension c227 30 → 36 cm, the passage 1.335 → 1.275 m), 37.5 × 14 cm.
  The stack (x −4.42) and the VMC duct (x −4.625) both drop through it at y −0.30; the stack is one plain
  pipe with no joint inside the column. Boxing r220 upstairs is 37 cm wide (owner: "fine to raise the
  boxing to 36 37"). Below, the basement wall between r67 and
  r76 lies under the column; the owner will adjust it.
- **Proven:** the option A edit (r220 37 cm, c227 −0.36, waste nodes moved to x −4.42, the old run north
  p59 and node pn66 removed) solves on the 2026-10-09 headset plan with no conflicts and no dimension
  dropped; only r56, r122 and r220 move. In the model the screed is assumed 5 cm (pipe z floor-relative).
  Open: the lintel height and slab type (does bay 1 take ≈ 15 cm?), the screed thickness, the third
  lintel, and the shower Ø40's route (it must enter the run in bay 1 flowing south).
- **Option A with real fittings (2026-10-15; owner asked for a face view with Nicoll sizes):** Proven (Nicoll
  sheets FT_coudes_evac_FF.pdf and FT_coudes_evac_MF.pdf, FT_culottes_simples_FF_evac.pdf): Ø100 87°30′ bend F/F
  CT88 Z 77 / L 57 (M/F CT8: Z 77, L 57, spigot 134 from the corner); tee 87°30′ F/F BT188 Z1 77, Z2 77 (branch),
  Z3 52, L 57 (Z1 / Z3 the run's two ends, read from the sheet's drawing). Proven (Geberit side CAD
  111.333.00.6_L.dxf): the delivered bend (catalogue: "Coude de raccordement 90° en PVC, ø 90 / 100 mm") is curved
  down to 15.7 cm above the finished floor, with a straight Ø100 leg below it to 6.4 cm under it. A socket must slide
  over the straight leg, so a bend under it has its corner ≤ 15.7 − 13.4 = **2.3 cm above the finished floor**
  (the written branch, z 0.01, fits). The clash: the tee's lower socket and the bay-1 bend's upper socket both need
  13.4 cm from their corners, 21.1 cm with an M/F bend straight in the tee, but the written plan has 15 cm (tee 0.01,
  bay-1 axis −0.14): **11.8 cm of overlap**. The tee cannot rise (the WC branch is held at ≤ 2.3 cm), so the
  bay-1 run would have to sit at ≈ −0.20 (pipe bottom ≈ −0.25, the assumed slab bottom): option A does not fit
  as drawn (Hypothesis on the screed 5 cm and slab bottom 0.25: unmeasured). The owner's alternative (Geberit bend
  not used, the connector straight back at 23 cm, a tee at 20 cm at x −4.30 with the run left to a bend up the
  riser at −4.42 and right to the WC, the trunk down into bay 1 slanted east) also clashes: 6.8 cm between the WC
  bend and the tee, 12.3 cm between the tee and the riser bend (fittings need ≥ 24.3 cm between corners on a run);
  its trunk through bay 1 fits (3.4 cm from lintel 2). Socket outer Ø drawn 112 mm (Hypothesis: not on the sheets).
  Scratch drawing `facefit.py`. Not decided: how to rebuild option A.
- **Geberit bend straight back (owner asked, 2026-10-15):** Proven (manual 972.363.00.0 p.11): the bend is two
  pieces on a 45° joint; turning the lower one half a turn moves the outlet from down to straight back; no sideways
  position is shown. Its depth figures (10–13 cm, or 11.5–14.5 cm with the clip in its second notch) run from the
  bend's leg axis to the finished wall face: the 3 cm is the inlet's reach to the wall, and the bend itself has two
  positions **1.5 cm apart** (the second toward the wall). Geberit's CAD shows the first (leg axis to inlet 11.9 cm). Turned a quarter, the outlet would
  point about 45° to the side and still 30° down and 30° back (geometry; Hypothesis whether Geberit allows it).
  Straight back, reflected from the CAD's down position: the outlet axis is level at **20.5 cm** above the finished
  floor, its straight leg from 11.1 cm behind the frame face. A Nicoll CT88 turning west needs its socket on that leg:
  corner ≥ 13.4 cm further back, body 5.6 cm beyond, so **10.1 cm into the 9 cm north wall** (the bend cannot move
  toward the room; its second clip position is 1.5 cm toward the wall). Height would then be ample (a tee at ≈ 0.20 leaves 34 cm to the bay-1 bend, 21 needed);
  only the depth fails: the frame face would have to come ≈ 10.6 cm forward (solver `wcfit/t4.py`: then no clash,
  bay 1 ≈ 12 cm deep; its 7.6 cm case assumed a forward bend adjustment that does not exist). Scratch drawing `backfit.py`.
- **Fitting study, upper WC drain (owner, 2026-10-15: "Dont assume the pipe layout on the headset is correct";
  true are the lintels and the frame's distances to the north and west walls; fixed: Geberit bend, frame, vent in
  boxing r220, stack down column r122).** Parts as above (Nicoll Ø100, Geberit CAD); Hypotheses: screed 5 cm, slab
  bottom −0.25, socket outer Ø 112, slope 1 %. Proven arithmetic on those inputs:
  - The WC bend under Geberit's leg has its corner between **0.006** (its sockets clear the raw slab where the branch
    crosses lintel 2) and **0.023** (its top socket on Geberit's straight leg).
  - **T1, the only arrangement that connects the vent:** WC CT88 west → pipe → BT188 tee at about (−4.42, 0.445) with
    the vent straight up its short end → CT8 M/F spigot in the tee, turning south in bay 1 → pipe at 1 % → CT88 down
    into the column at (−4.42, −0.30). With the tee as high as it can go (0.020) the bay bend's axis is −0.191, the
    stack bend's −0.199, and the lowest fitting surface **−0.255: bay 1 must be ≈ 20.5 cm deep under the raw slab
    top**, i.e. through the whole assumed slab. Also: the WC bend's top socket overlaps the frame's lower bar by
    **4 mm**; the bend's second clip position (1.5 cm toward the wall) clears it (solver: no clash, 3.7 cm to the wall).
  - Rejected, with the blocking number: T1 with two 45° in bay 1 (24.7 cm deep); a 45° descent west then a bend south
    (11 cm deep, but no place for the vent junction: a 45° wye needs 27 cm of fall and leaves bay 1, a tee on the bay
    run lands in the room); a flat bend south then a 45° descent (2.9 cm out of the half wall into the room, no vent
    junction); Geberit straight back (10.1 cm into the north wall); a tee at 0.20 (the WC branch is held at ≤ 0.023).
  - To measure before any work: the screed thickness, the slab depth in bay 1 and the lintels' depth.
  - **Kept (owner, 2026-10-15: "save this model"): T1 with Geberit's bend in its rear clip position (+15 mm), no clash
    (Proven: `node tools/wc-drain-fit.mjs`, which places the parts to scale, checks the frame, the lintels, the north
    wall and the room, and reports the bay-1 depth; `svg=out.svg` draws the face and side views; `screed=`,
    `slabBottom=`, `slope=`, `clipBack=` re-run it with measured values).** Nodes: WC bend corner (−4.10, 0.437, 0.0230),
    tee (−4.42, 0.445, 0.0198), bay-1 bend −0.1912, stack bend (−4.42, −0.30, −0.1987), vent to 1.49. Plan draft
    from the 287 752-char plan (the same five nodes moved, nothing added or removed; no conflict, no deleted
    dimension). **Written to the headset 2026-10-15** (owner: "Write in the plan"): fresh read == 287 752, rebuilt edit
    == the reviewed draft, written and read back identical, **287 757 chars**. Still open: bay 1's real depth (20.5 cm
    needed with a 5 cm screed). A realistic face/side drawing (and a Chinese copy) went to the owner as files.
  - **Layout S, the owner's slanted alternative, solved with real parts (2026-10-15; `node tools/wc-drain-fit.mjs
    layout=S teeY=0.45`):** the bay-1 run slanted in plan from the column to a CT8 M/F turning up under the tee; the
    BT188's branch down onto that spigot; its run level, east to the WC's CT8 M/F (spigot home in the tee), west to a
    second CT8 M/F turning up the vent. Proven arithmetic on the same Hypotheses as T1:
    - Spacing is set by the parts: WC corner → tee centre 18.6 cm (134 + Z 52), tee → vent corner 21.1 cm (77 + 134),
      so the tee sits at x −4.286 and **the vent moves to x −4.497** (from −4.42). Same depth as T1: tee 0.021, trunk
      bend −0.190, **bay 1 20.3 cm deep**: the tee's branch and the bend under it stack 21.1 cm, like T1's.
    - With the tee's run on Geberit's leg line (y 0.437) the tee's branch and the bend's spigot hit **the frame's west
      foot by 0.9 / 0.3 cm**. Turning the WC bend a few degrees in plan so the tee sits at y 0.448–0.452 clears both
      (0.4 cm) and keeps the vent bend off the north wall (0.9 cm); at 0.455 the vent bend touches the wall. A
      **≈ 4 mm window**.
    - The vent at −4.497 crosses the **VMC Ø80 p39 as drawn** (2.6 cm): that duct would have to move west in r220.
    - Hypothesis (not checked against DTU 60.11): the WC's flow enters the tee's run end and leaves by its branch, with
      the vent leg straight ahead at the same level; a plumber may refuse a tee used that way (the flush would shoot
      into the vent leg). T1's vent rises straight above its tee.
    - Verdict: it fits on paper but gains no depth over T1 and is less forgiving; T1 stays.
    - **Smaller column r122 (owner asked, 2026-10-15):** the stack can drop anywhere in bay 1 only (the lintels run
      through the slab over the column too); its west limit is x −4.444 (the stack bend's socket touches lintel 1;
      solver `stackX=-4.45` clashes by 0.6 cm). Drawn at **x −4.434** (1 cm clear): the slab pipe slants 11° to the
      lintels (10° before), and the column's east face can come in from −4.20 to about −4.35 (2.8 cm past the socket,
      Hypothesis on the cover needed): **50.5 → 35.5 cm wide**. The gain comes mostly from the column face; the
      stack itself moves only 1.4 cm. Not written to the headset; the column's east edge is pinned to passage r56
      (c773), so the passage would widen unless that dimension changes. The VMC Ø80 (x −4.615) and the conduit at
      x −4.59 stay inside the narrower column.
    - **Written to the headset 2026-10-15** (owner: "c p w", chose "Layout S + narrower column"; this replaces T1 on
      the plan): tee pn60 (−4.2855, 0.45, 0.0211), bay bend pn71 below it (−0.1899), new vent bend pn339
      (−4.496, 0.4647, 0.0232) with new pipe p307 from the tee, vent top pn67 over it (1.49), stack pn61
      (−4.434, −0.30, −0.1975) and pn62 (basement ceiling) at x −4.434; column r122 east face −4.35 (35.5 cm), passage
      r56 widened to −4.35 (c773 = 0 kept; c227 −0.49 → −0.34 so r57 stays). Solved: no conflict, no deleted
      dimension, only r56 and r122 changed. Fresh read == 287 757, written and read back identical, **287 926 chars**.
      Still open for S: the VMC Ø80 p39 overlaps the vent by 2.6 cm (move it west in r220), and the tee's flow use
      (Hypothesis above).
  - **To check for both layouts (found 2026-10-15 while dimensioning S):** Geberit's figures (11.5–14.5 cm from the
    bend's leg to the finished wall face with the rear clip, 10–13 with the front one) put the finished face 0.8–3.8 cm
    in front of the frame. The box face (half wall r210/r220 at y 0.28) is drawn 5 cm in front of the frame face:
    leg → face 15.7 (rear clip) or 14.2 (front clip), both over the range. Hypothesis: the box face on the plan is not
    measured; if it is right, the WC's connector may not reach. Proof: measure the box face, or the connector's length.

**WC stack (written to the headset 2026-10-08, read back identical; owner: "the WC pipe needs to go alongside the VMC pipe")**, service
`waste`, Ø100 (Hypothesis: usual French size for a WC): the upper WC's branch from the Duofix outlet
through the slab at ~2 % to a stack in column r122 (x −4.49, y 0.00), down to the basement ceiling in
r76 just north of unit B (x −4.49, y 0.00), two 45° at the foot, then along the basement ceiling at ~1 % back to the
laundry room r66 (owner; the exit to the sewer is decided later); the **roof vent** (owner) leaves the
stack top through the slab to half wall r210 and rises inside it (6 cm from the frame, 3.5 cm from the
VMC duct) and boxing r220 (widened 15 → 27 cm) through the ceiling (roof height unknown: a 0.5 m stub
stands for it). Lengths: branch 0.63, stack + basement run 6.06, vent to the ceiling + stub 3.72 m.
Column r122 grows to y −0.37…+0.06 (+23 cm north via c774, for the stack; a +3 cm widening east the
owner had approved is no longer needed). Proven on the drafted plan: no conflicts, only r122 and r220
change, and ground window r108's left leaf now stops at 153° on the column instead of opening flat (180°).
Owner then (2026-10-08), in turn: keep the VMC duct straight through the ground floor; fewest bends on
the upper and ground floors (one straight diagonal across the slab: 3 bends); the duct closest to the west
wall on both floors (which put an 11.5 cm jog at the column's foot, since the plan's basement face is at
x −4.55); and finally (**the drafted route**) "just go straight for now and get out of ground floor into
the wall of the basement, I can correct the dimensions later": the basement wall position is a survey
question. Route: down inside half wall r210 against the wall (x −4.625), along the wall in the slab to
y −0.18, **straight down column r122 against the wall and through the slab** to the basement ceiling at
the same x (inside the basement wall as surveyed today), then the short flexible end piece to unit B's
blue port. Bends on the upper and ground floors: the vent, the half wall's foot, the top of the drop.
B's upper duct: 6.97 m. With the duct against the wall the WC stack returns to x −4.49 (4.5 cm from the
duct, 5 cm from the column's original face), so **the column is not widened**: only +23 cm north
(c774), passage r56 unchanged. Draft: `pn47`, `pn49`, `p41`, `p43` removed; `pn48` = slab end; new `pn58`
(basement ceiling) and one segment to the port.

The WC frames (Geberit Duofix 111.333.00.6, 50 × 112 × 12 cm) are plain furniture boxes inside the
half walls (`r221` Ground in r139, `r222` Upper in r210), centred on their WC 2 cm behind the face;
the upper duct passes 21 cm west of `r222`.

**Hypotheses in it:** the slab can take an Ø80 duct over that 0.6 m (its build-up is not in the plan); the fridge spot (end of the worktop, by wall r112: no fridge in the plan); box A
at 2.50–2.65 m, box B at 1.48–1.85 m, 20 cm under the basement ceiling for the duct bends (ceiling
2.05 m: owner confirmed; the basement doors' 2.10 head is a default, wrong); port positions (photo estimates); the basement outer wall face at
x −5.10; the roof cap height. To check: a wall outlet next to the garage door (DTU 68.3 / the notice);
unit B has no kitchen duct (its kitchen port needs a Ø125 plug, the kit has Ø80 ones), and unit A uses
only two of its five inlets: whether the self-regulated flows still hold with that split (Sauter).

## Heating pipes: radiator layout (2026-10-08, sketch, not in the plan)

**Drawn (owner, 2026-10-10: "The whole network"; written to the headset, read back identical, 261 295 chars).**
Manifold on the basement north wall west of the boiler ("next to the water heater"; x 0.88…1.56, y 4.45, 1.20 m;
Hypothesis for "left of the column": no column is drawn there). Nine 16×2 pairs, mitred so supply (red, right of
travel) and return (blue, left, 5 cm higher off the basement ceiling) never cross; lanes 8 cm apart at 1.97 m
(the ceiling 2.05). West pairs go along the north wall, then south across r70 at x −2.40…−2.08 (east of the garage
door's area), then west in r76/r77; r204 rises south of the door's area at (−4.50, 1.40) and runs the living-room
skirting. Bedroom + laundry: tee under bedroom radiator r205's east end (unit B hangs under its west part), laundry
radiator r224 (EASY 1200 × 600, 1930 W), first under window r146, **moved 2026-10-13 to the laundry's south-west
corner** (x −4.53…−3.33; supply to its west leg, return to its east leg, never crossing). Kitchen + r74: tee in
r74's ceiling, radiator r225 (EASY 900 × 600, 1448 W), branches dipping to 1.91 m under the
shower pair. **Owner, 2026-10-13: r225 moved to r74's east wall** (x 3.966–4.098, y 0.26–1.16, 10 cm off the north
wall so outlet m124 at y 0.06 stays clear, facing west); its branches run east at 1.91 m then north along the wall,
the return (inner, x 3.89) to the south leg, the supply (x 3.93) to the north leg, never crossing; branch 5.8 → 10.8 m.
Proven (Node on the written plan, read back identical, 282 449 chars): the same clash list as before the move, heat loss
unchanged (6719 W). Kitchen and shower pairs up into the slab at r74's south edge and along the trench (≈ 10 cm down).
Proven (scratch `clash.mjs` on the written plan): no pipe within its neighbours' radii + 6 mm insulation + 3 mm;
≈ 103 m supply + 106 m return.
**As installed (owner, 2026-10-14): the west pairs run as one flat band**, ≈ 1 cm between pipes (26 mm centres),
from the manifold (on the wall) west along the north wall, south along the west wall over the garage door, to the
column r122; each pair leaves where it rises (r204's first, then the (−2.48, −0.13) and bedroom + laundry pairs east,
the Upper pairs up the column). Redrawn so (written, read back identical, 282 507 chars): lanes x −4.40 + 0.026 i,
20 cm off the west wall so the Upper risers clear the WC waste Ø100 (x −4.42) in the column; north lanes y 4.22 −
0.026 i; the band keeps 1.97 m (its real height unconfirmed). No ids made, 53 nodes moved. Proven (`clash.mjs`):
nothing new against other services; neighbouring band pipes and one pass in the Upper slab (2.4 cm centres) fall
inside the check's 6 mm-insulation allowance, as installed. ≈ 113 m supply + 112 m return. **Upper pairs (owner, same day: "Do 1, I will adjust according to real setup";
written, read back identical, 266 704 chars):** the upper slab at the old column had no room (the VMC duct fills the
west-wall trench, lintel 1 is never crossed, the WC drain fills bay 1 inside it), so **column r122 grows 13 cm east
and 7 cm north** (c227 36 → 49 cm, passage r56 1.275 → 1.145 m; c1443 90 → 83 cm): x −4.705…−4.20, y −0.37…−0.16.
The four pipes rise in one row at y −0.19, x −4.35…−4.23: east of the WC stack and the bay-1 drain (≈ 0.6 cm), west
of lintel 2 (≈ 0.6 cm), north of the basement waste run at y −0.30. Upstairs, on the floor (supply 5 cm, return
10 cm): the south pair west then down the west wall (bathroom r208 teed, bedroom r207), the north pair north
between the VMC duct's lean and the WC riser (≈ 1 / 2 cm) to bedroom r209. Not checked: pipes against walls,
lintels and the slab build-up (only pipe-to-pipe).

Owner: "my default was a star topology, but I wonder if there is an opportunity to share some pipes";
the pipes are **composite (multilayer)**. Owner decisions:

- **Boiler (gas condensing, then a heat pump at the same spot) at the water heater:** basement
  north-east room, north wall, at the water-heater outlet marker (x 1.80, y 4.53). The outside wall is
  the east wall: the flue length to it (≈ 3.5 m) is unchecked against a boiler manual.
- **Hybrid layout, manifold at the boiler:**
  - every ground-floor radiator on its **own pair** from the manifold, run along the basement ceiling
    (every joint within reach), then straight up through the floor;
  - (owner, 2026-10-10: the kitchen's pair also feeds the east basement room r74, teed in r74's ceiling; the ground
    bedroom's pair also feeds the laundry r66, teed in the laundry ceiling; both basement rooms at 15 °C,
    `docs/heat-loss.md` "Laundry heater"; not drawn yet)
  - ~~the **kitchen and ground shower-room radiators on their own lines too**~~ **superseded 2026-10-14: the kitchen,
    the ground shower room and r74 (the workshop) share one pair**, lockshields on all three (`docs/heat-loss.md`); There is no basement under them: both pairs go up
    into the slab together at the south edge of the east basement room; one short trench (≈ 1.3 m,
    4 pipes on its first 0.6 m);
  - the **upper floor on TWO pairs**, both up the column `r122` beside the VMC duct and the WC stack,
    then along the upper west wall: one north to the north bedroom alone, one south to the bathroom
    (tee) and the south bedroom (owner, 2026-10-08: **16×2 only**, no 20 mm pipe; superseded one
    shared 20×2 pair with three tees).
- **Keep the garage door's overhead area clear** (owner): no pipe in the basement ceiling within the
  garage door's footprint (2.10 m in from the west wall, 0.15 m past each jamb). The west living-room
  radiator sits right above that door, so its pair comes up south of the area and runs ≈ 1.7 m along
  the living-room skirting.
- **Contractor's route (owner, 2026-10-08):** along the basement north wall, then down the west wall,
  "supposedly no conflict with the garage door". Same length (≈ 190 m vs ≈ 187 m, sketch) and the west
  living-room radiator's pair then comes straight up at the wall (no skirting run). It runs in the
  ceiling-wall corner right over the door opening. **Hypothesis:** fine for a swing, side-sliding
  or tilting door, or when the corner sits above the door's travel; a sectional door's curved
  tracks and top panel, or a roller door's drum, use that corner. To check on site: the door
  type, the height from the opening's top to the ceiling (the plan's 2.10 m head above a 2.05 m
  ceiling is the known wrong default), and where the tracks curve. Also on that route: VMC unit B
  (south wall of `r76`, near the column).

Sizes, for the future heat pump (5 K drop; the boiler runs ≈ 9 K and needs about half the flow):
**16×2 everywhere** (owner): ≤ 138 L/h per radiator (≈ 0.34 m/s); upper south pair 863 W
(148 L/h, 0.36 m/s, ≈ 7 kPa over ≈ 36 m), north pair 743 W (128 L/h, 0.31 m/s, ≈ 4.5 kPa). Why not
one upper pair in 16×2: the upper rooms need 1.58 kW at −7 °C (HEAT LOSS), 271 L/h at 5 K → 0.67 m/s
and ≈ 22 kPa over 39 m (fine with the boiler's 9 K or a heat pump at 7 K). The manifold sits on the
boiler; that link (6.3 kW, 1 080 L/h at 5 K) is the boiler/manifold kit's connection, not 16×2.
**Proven** (arithmetic from the catalog's `powerW` × 0.385 for ΔT 24, and the plan's heat loss);
speed limit (≈ 0.5–0.7 m/s) and pressure losses (smooth pipe, water at 45 °C) are **Hypothesis**.
Lengths (**Hypothesis**, square-to-the-wall sketch, flow and return counted): ≈ 187 m in total,
≈ 219 m with a pair to every radiator. Not done: a single-pipe loop (hot return, last
radiator cooler: bad for condensing and the heat pump) and reverse return (more pipe, not needed with
lockshield valves). Balancing: the ground shower towel radiator sets the water temperature; keep its
lockshield fully open. Open: the column's room for four insulated 16 mm pipes; how the upper floor's
structure lets the pair run along the west wall; the garage door opener rail's real depth.
