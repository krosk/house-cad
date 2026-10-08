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
  cable. Each line is its own network (its own nodes), so selecting any segment reads that
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
Trigger a fixture, existing node, or empty space to start the pen. Empty space creates a
free junction; each later trigger creates a segment and advances the pen, enabling bends,
branches, and loops. Grip cycles overlapping markers/nodes, or lifts the pen over empty
space. Trigger an existing pipe with no active pen to select it; thumbstick changes its
service and B/Y deletes it. B/Y on the current free pen node removes that junction and its
incident segments. In ALL FLOORS, aiming down favours your own storey and aiming up
the one above, and grip reaches farther storeys (the `docs/ar-survey.md` reticle rule). Join them
to create risers.

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
| A · ground shower + WC | 80 | 2.33 | blue port north, along wall r112 at the ceiling, over passage r117, through the partition |
| A · kitchen vent | 125 | 0.63 | kitchen port east, vent 0.3 m from the box |
| A · roof outlet | 125 | 1.06 | OUT south, elbow up, cap 0.65 m above the ceiling, 0.17 m from the upper storey's wall |
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
  works over: viable. Watch: the PVC-to-spigot joint (both may be 80 mm outside), a short insulated
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

**WC stack (draft, 2026-10-08; owner: "the WC pipe needs to go alongside the VMC pipe")**, service
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
