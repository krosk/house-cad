# Plumbing workflow

Plumbing is a separate whole-house lane from electrical conduit and wires.

## First AR authoring slice

`HEATING · PIPE` (was MARKER · PIPE until 2026-10-01) authors a whole-house node graph. A node is either a free junction
`{x,y,z,floorId}` or a logical fixture port `{markerId,role}` that follows its marker.
Pipe segments join two node ids and carry their service and diameter. Thumbstick up/down
chooses one of six services:

- cold water
- hot water
- heating supply
- heating return
- refrigerant (owner, 2026-10-07): an air-conditioning line from the outdoor unit to one
  indoor unit, drawn as one run standing for the liquid + gas pipes and the connection
  cable. Each line is its own network (its own nodes), so selecting any segment reads that
  line's length: the readout adds the 3D length of the selected pipe's whole network,
  risers included (`pipeComponentLength`). Buy that plus slack per line.
- VMC (owner, 2026-10-07; `vmc`, light grey): a ventilation extract duct. Its `diameter` is
  the duct's (Ø80 wet-room extract, Ø125 kitchen / outlet), so the ribbon shows its real
  width; a segment drawn in AR starts at Ø80 (no diameter editor yet: a written plan carries
  the real ones). All ducts of one unit form one network through a node at the unit's
  centre, so selecting any of them reads the unit's total plus each diameter's length
  (`pipeLengthText`): the shopping list, with ~0.2 m per duct inside the box as slack.

Fixture ports are logical, not spatial model connectors. Their role is inferred from the
service (`cold`, `hot`, `supply`, or `return`), so one radiator or boiler marker can own
both supply and return nodes and both follow the marker when moved.

Available plumbing fixture markers are radiator, boiler, sink, and washing machine.
Trigger a fixture, existing node, or empty space to start the pen. Empty space creates a
free junction; each later trigger creates a segment and advances the pen, enabling bends,
branches, and loops. Grip cycles overlapping markers/nodes, or lifts the pen over empty
space. Trigger an existing pipe with no active pen to select it; thumbstick changes its
service and B/Y deletes it. B/Y on the current free pen node removes that junction and its
incident segments. In ALL FLOORS, aiming down favours your own storey and aiming up
the one above, and grip reaches farther storeys (the `docs/ar-survey.md` reticle rule). Join them
to create risers.

Colors are blue (cold), red (hot), orange (heating supply), purple (heating return), green (refrigerant), and light grey (VMC).

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
- wastewater/drainage, which needs slope and flow-direction semantics

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

Draft (headset write pending; lengths 3D, into the box centre, so ~0.2 m per duct is inside it):

| Duct | Ø | m | Route |
|---|---|---|---|
| A · ground shower + WC | 80 | 2.33 | blue port north, along wall r112 at the ceiling, over passage r117, through the partition |
| A · kitchen vent | 125 | 0.63 | kitchen port east, vent 0.3 m from the box |
| A · roof outlet | 125 | 1.06 | OUT south, elbow up, cap 0.65 m above the ceiling, 0.17 m from the upper storey's wall |
| B · upper shower + WC | 80 | 6.93 | vent at the ceiling above half wall r210's west end, down a boxing r220 on top of the half wall (15 × 22 cm, 1.15 m to the ceiling), inside the half wall beside the Geberit Duofix frame (about 29 cm free between the west wall and the frame), inside the upper floor's slab (10 cm under the floor) along the west wall to the column, down column r122 (a 19 cm offset inside it, toward the port: the basement wall face is 15 cm further in), straight into the blue port |
| B · laundry vent | 80 | 2.45 | straight north at the basement ceiling, through two basement walls, down into the grey port |
| B · wall outlet | 125 | 2.51 | OUT down, then along the west wall to beside the garage door (owner: it must go out there, not through r76's wall) |

**Hypotheses in it:** the slab can take an Ø80 duct over that 0.6 m (its build-up is not in the plan); the fridge spot (end of the worktop, by wall r112: no fridge in the plan); box A
at 2.50–2.65 m, box B at 1.48–1.85 m, 20 cm under the basement ceiling for the duct bends (ceiling
2.05 m: owner confirmed; the basement doors' 2.10 head is a default, wrong); port positions (photo estimates); the basement outer wall face at
x −5.10; the roof cap height. To check: a wall outlet next to the garage door (DTU 68.3 / the notice);
unit B has no kitchen duct (its kitchen port needs a Ø125 plug, the kit has Ø80 ones), and unit A uses
only two of its five inlets: whether the self-regulated flows still hold with that split (Sauter).
