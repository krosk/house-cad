# Heat loss per room

Goal (owner, 2026-10-01): select a room in AR and read how many watts it loses at design
conditions, kept simple. Use: size or check radiators (`docs/furniture.md` radiators), see where the
heat goes. Not a regulatory (RE2020 / DPE) calculation: expect ±20–30 % against a professional study.

## Method: simplified EN 12831 (owner chose it over W/m³, 2026-10-01)

Per heated room, at design conditions:

```
loss = Σ surfaces  A · U · ΔT · b      (walls, windows/doors, floor, ceiling)
     + 0.34 · n · V · ΔT                (air: n air changes per hour, V room volume m³)
ΔT   = T_room − T_outdoor_design
U    = 1 / (Rsi + Σ R_layers + Rse)     layers in series add, whatever their order
```

Surface resistances (m²·K/W, EN ISO 6946): wall Rsi 0.13, Rse 0.04; ceiling (heat up) Rsi 0.10;
floor (heat down) Rsi 0.17; toward an attic or basement Rse = Rsi of that space (0.10 / 0.17).

**b** scales ΔT for a neighbour that is neither heated nor outside:
`b = (T_room − T_neighbour) / (T_room − T_outdoor_design)`.

## Which surfaces lose heat

- **Walls:** a room edge with no other room of the same floor within 0.6 m beyond it is exterior.
  Edges shared with a room, or separated from one by an interior WALL zone, are heated on both sides
  and ignored. Wall height = the room height, storey height − slab (`ceilingHeight`; `docs/product-intent.md`
  multi-floor); the room volume uses it too.
- **OUTDOOR rooms** (owner, 2026-10-05: the unheated glazed veranda next to the kitchen, "I wish to
  have it as a room, because its measurements matter", and "ok to treat it same as outside"). A ROOM
  can be flagged `outdoor` (AR PLAN · EDIT: A/X on a selected room; desktop: the Indoor/Outdoor
  button). It is measured, dimensioned and drawn like any room, but for heat loss it is outside: it
  has no figure of its own, and a heated room's edge on it is exterior (b = 1), with the WALL /
  INSULATION zones there as its layers. It never merges with an indoor room it touches
  (`roomRectsConnect`), so its area is its own. Across a slab it counts as nothing (not a space).
  That overstates the shared wall's share: **Hypothesis:** a glazed veranda is nearer b ≈ 0.6–0.9 at
  night; accepted, as it errs on the safe side for sizing.
  **Proven** (Node, made-up plan, 2026-10-05): a 4 × 4 m kitchen loses 4685 W with no veranda; with a
  3 × 4 m indoor veranda beyond a 20 cm WALL zone 3992 W (the wall heated both sides), or 7159 W
  touching it (merged); with the veranda OUTDOOR 4685 W in both cases. The flag survives save/load and
  is dropped when the zone is retyped.
- **Walls in the earth** (owner, 2026-10-04: one earth level for the house, for now): the HEAT LOSS
  setting **Earth level** is the outside ground's height from the ground floor's floor level (+ up,
  default 0). On every floor, the part of each exterior wall below it loses to the ground instead of
  the air, as a basement wall in ISO 13370:
  `U_bw = 2λ/(π z) · (1 + 0.5 d_t/(d_t + z)) · ln(z/d_w + 1)`, z = the floor's depth below the earth,
  d_w = λ(0.17 + R_wall) with R_wall the same layers as above, d_t = undrawn wall depth +
  λ(0.17 + slab R + added floor R + 0.04), λ = 2.0 W/mK (clay or silt, the standard's default). It
  loses `A · U_bw · fg1 · (T_room − T_annual_mean)`, like the slab on earth. An opening's band is cut
  out of the buried part only where it reaches below the earth. Not modelled: a sloping site (a level
  per side), groundwater, and a heated room's partition to an unheated basement below the earth.
  **Proven** (Node on the headset copy, 2026-10-04; Basement still heated as stored): earth below
  the house = the previous figures (Basement 6982 W); earth 0 → Basement 2856 W with 77.3 m² of
  walls in earth, Ground and Upper unchanged; −1 m → Basement 4539 W; +0.5 m → Ground 8685 W.
  U_bw = 0.90 W/m²K at 2 m deep for R 0.25 (Hypothesis: within the usual 0.8–1.2 for an uninsulated
  basement wall; a professional study would prove it). **Open:** the owner's real earth level.
- **Openings:** WINDOW / DOOR / SLIDING / GARAGE zones on an exterior edge are cut out of the wall
  area (width × their sill/head band) and counted at their own U: the zone's `uValue` (owner,
  2026-10-01: each window carries its own, typed from its label's Uw / Ud in HEATING · R / U), else the
  project's Window U (window, sliding) or Door U (door, garage). Window products carry no Uw yet. A
  HALF WALL is plain wall; PASSAGE and HEATER are ignored (interior / not an opening).
- **Floor and ceiling are split by overlap** with the floors below and above (rooms' plan union):
  heated room → no loss; unheated floor → `b`; nothing below → ground; nothing above → roof/attic.

## Insulation layers

- **An exterior wall is its layers** (owner, 2026-10-04): at each point along the edge, every WALL
  and INSULATION zone just inside the edge or within 0.6 m beyond it is a layer, and their R add up.
  A layer with no R typed uses its drawn depth across the wall / λ: the wall λ (default 0.8, so 20 cm
  → R 0.25, about concrete block) or the insulation λ (0.04). **Where no WALL zone is drawn, a
  placeholder wall stands in** (default 20 cm at the wall λ), added to any insulation there. So drawing
  the real wall, with its depth or R, replaces the placeholder at that spot. Interpretation of the
  owner's rule, to confirm if exterior insulation is ever drawn without its wall: insulation alone
  still gets the placeholder (it needs a wall behind it).
- An INSULATION zone **inside** a room rect is an interior lining (all of them in the owner's house,
  2026-10-01). One drawn **outside** (within 0.6 m of the edge) is exterior insulation: owner
  decision 2026-10-01, draw exterior insulation as zones. Both may cover the same wall: R values add.
- **Overlapping layers: the larger R prevails** (owner, 2026-10-04: "if rooms and walls overlap, the
  layer with the biggest R prevails"). Where two layer zones cover the same depth across the wall (an
  insulation drawn over a wall zone, a wall drawn twice), that depth counts once, for the layer whose R
  there is the larger; each layer's R is spread evenly over its drawn depth, so a layer partly
  overlapped keeps the R of its free part. Layers side by side across the depth still add.
  Interpretation to confirm: the rule read as layer over layer, compared on derated R per metre.
  **Proven** (Node, `layerStack` in `src/core/heatLoss.js`, 2026-10-04): 20 cm wall R 0.25 with 10 cm
  insulation R 2.5 inside its depth → 2.625 (not 2.75); on the plan written this morning nothing
  overlaps (Basement 2856, Ground 9240, Upper 8329 W unchanged); `r135` drawn twice gave Ground 8809 W
  before (counted twice) and 9240 W now.
- **Proven** (read `zoneColors.js`, `geometry2d.js`, `architectural3d.js`, 2026-10-01): INSULATION is a
  subtract zone, so one outside every room changes no room area and no exported massing; View 3D
  draws it as solid wall wherever it is. **Hypothesis:** outside a wall thicker than the inferred
  12 cm shell it floats with a visible gap (cosmetic); a WALL zone for the real wall would close it.
- Each zone carries its R (from the product label), **or its own λ** (owner, 2026-10-04: "a dual
  option: to enter R, or to enter lambda"), R = drawn depth / λ; neither = the project's wall or
  insulation λ. Setting one clears the other (a file with both uses R). R is absolute, the product's
  at its thickness; λ is per metre, so a typed λ follows the drawn depth. For a lining of polystyrene +
  13 mm plaster, the label R usually covers the polystyrene only; the plaster adds ≈ 0.05, negligible,
  but a depth-derived R counts the plaster as insulation (13 mm / 0.04 ≈ 0.33), so type the label R.
  **Proven** (Node on the headset plan, 2026-10-04): R 0.9 on every insulation zone instead of depth /
  0.04 (R 4.5–5.25) → living room r55+r58+r59 3567 → 3922 W, Upper r88+r90 3546 → 3751 W.
- Thermal bridges: interior lining R × 0.85 (cut by slabs, partitions, rails); exterior R × 0.95.
- Partial coverage splits the wall into pieces, each with its own U (area-weighted sum).
- A WALL zone's R is typed in HEATING · R / U like an insulation's (e.g. the wall's build-up from a
  survey); the masonry material is unknown, so the default λ is a Hypothesis.
- **Proven** (Node on the headset copy of 2026-10-04, against the previous fixed bare-wall R 0.25,
  which the placeholder reproduces): Basement 6982 W unchanged, Ground 9277 → 9240 W, Upper 8374 →
  8329 W. The 25 cm wall `r135` behind the kitchen lowers it (R 0.31); the **7 cm wall `r112`** on an
  exterior edge of the kitchen's room raises it by about 160 W, as it now stands for the whole wall
  there (R 0.09). **Hypothesis:** r112 is a partition or a lining, not the outer wall; if so, give it
  its real R, or the outer wall behind it a WALL zone.

## The owner's house (owner answers, 2026-10-01)

**Proven** (Node count of the owner's file on a 5 cm grid, 2026-10-01): Basement 61.0 m² of rooms,
Ground 73.2 m², Upper 40.9 m²; 54.0 m² of Ground is over Basement, 39.2 m² of Upper over Ground.

- **Basement: unheated, will not be insulated**, stair closed by a door. No heat requirement of its
  own; the Ground slab above it loses with `b` from a basement temperature setting (default 6 °C →
  b ≈ 0.5 at 19 / −7 °C). The closed stair is ignored. Insulating the basement ceiling would be an R
  on Ground's slab over Basement.
- **Ground not over Basement (~19 m²): slab on earth.** Ground loss uses EN 12831's simplified
  factors: `fg1 · fg2 · A · U_equiv · ΔT`, fg1 1.45, fg2 = (T_room − T_annual_mean) / ΔT (≈ 0.31 for
  an 11 °C annual mean), U_equiv ≈ 0.7 for an uninsulated slab. Net ≈ 0.45 × A × 0.7 × ΔT.
- **Ground not under Upper (~34 m²) and Upper's ceiling: flat ceiling under a ~1 m attic below the
  sloping roof.** The ceiling is flat, so the 2.5D model fits (no roof pitch needed). The attic counts
  as outside (b = 1, the safe side); its loss is the ceiling area with the attic-floor insulation R.
- **Hypothesis** (no slab data yet): an uninsulated slab over the basement is U ≈ 2, so
  54 m² × 2 × 26 K × 0.5 ≈ 1 400 W, likely the house's largest single loss.

## Settings: all editable in AR (owner, 2026-10-01: "make it configurable in app")

Stored as project data, only the keys the owner set (`project.heat`, `floor.heat`, an insulation
zone's `rValue` or `lambda`; additive, no FILE_VERSION bump); defaults in `src/core/heatLoss.js`.

| Setting | Default | Source |
|---|---|---|
| outdoor design °C | −7 | owner: Val-de-Marne (94), 43 m (no altitude correction) |
| annual mean °C | 12 | Paris area (ground losses only; not in the panel) |
| indoor °C | 19 | EN 12831 living rooms (one value for every room) |
| air changes /h | 0.5 | owner: single-flow VMC |
| earth level | 0 m | from the ground floor's floor level; Hypothesis until the owner measures it |
| undrawn wall depth | 0.20 m | placeholder where no WALL zone is drawn (owner, 2026-10-04) |
| wall λ (no R) | 0.8 W/mK | Hypothesis: masonry unknown (owner knows thickness, not material); 20 cm → R 0.25 |
| window / door U | 1.4 / 2.0 | Hypothesis: recent double glazing / ordinary door |
| bare slab R | 0.15 | owner (2026-10-05): concrete slab about 20 cm → R ≈ 0.09 (0.20 / λ 2.3, reinforced; Hypothesis: reinforcement assumed, 0.11 if plain at λ 1.75); to type in the AR panel, the default stays generic |
| insulation λ (no R) | 0.04 | the 3 existing linings have no R yet; owner sets it per zone |
| radiator water ΔT | 50 K | EN 442 rating; Hypothesis for the owner's system (heaters only) |
| per floor: heated, unheated °C, added floor R, attic R | yes, 6, 0, 0 | attic: blown rock wool planned; owner's quote (2026-10-05): ROCKWOOL JETROCK 2, 360 mm blown, 352 mm settled, R 8 = 0.352 / λ 0.044. Proven against Rockwool's documentation (web search, 2026-10-05): λD 0.044, and for R 8 a settled 352 mm, 360 mm installed, at least 6.80 kg/m², so the quote matches the manufacturer's table; on site, check the depth markers and the bag count against that coverage |

## Recesses: a window's reveal through a thick wall (owner, 2026-10-05)

Owner: "semantically it is a recess, and functionally it is like a passage with a sill, that I want to
count for heat loss"; "I probably need insulation to have a sill at that location too". A RECESS zone
(sill + head, default 0.90 / 2.10) takes its depth out of every WALL and INSULATION layer it overlaps,
only between its sill and head; outside that band the layers are whole. That is the insulation's
"sill": draw the recess over the lining and the lining is cut there. In the heat loss each 5 cm column
is split by height (opening band, each recess band, buried part, the rest), each piece with its own U;
in a recess band the remaining layers count (a cut layer keeps R in proportion to its remaining depth;
where no wall zone is drawn the placeholder stays). In 3D it cuts its own footprint only (a window or
door pierces through contiguous layers; a recess must not). A PASSAGE over a window was rejected: it
cuts from the floor, the floor finish runs through it, and it prints as a doorway.
**Proven** (Node, 2026-10-05): with no recess, every room part, area and map column is identical to
the previous code at earth 0, 1.2 and 3.5 m. A test window 1 m wide on the living-room wall (lining
R 4.08): a recess the window's width changes nothing (3604 W; the window band already replaces the
wall); 1.6 m wide → the columns beside the window lose the lining in 0.90–2.10 (R 0.25, 6 → 31 W/m²,
room 3644 W); sill 0.60 / head 2.30 → 3690 W. 3D wall boxes: the lining in the recess is open only
between sill and head; the outer wall beside the window stays solid.

## Reveals: an opening through exterior insulation (owner, 2026-10-05)

Owner's walls: meulière with exterior insulation, windows at the indoor face, the opening going
through the wall and the insulation. Around the frame heat bypasses both the window and the
insulation: a linear thermal bridge, **ψ · edge length · ΔT**, added to the room's openings. It
applies to an opening (WINDOW / SLIDING / DOOR / GARAGE) with exterior INSULATION at its columns or
within 30 cm of them along the wall (`REVEAL_NEAR_M`): the opening need not be drawn into the
insulation, and insulation drawn stopping at the opening still counts (an opening always goes through
it). The length is its sill and head along its columns plus its two jambs, once per opening. First
version (`0078f1b`) required the window zone to reach into the insulation; the owner's switch showed
no change on the headset (2026-10-05), so that test was dropped. **Reveal ψ (ext. insul.)** is a project setting, default 0.4 W/mK (**Hypothesis:** typical
when the insulation is not returned into the reveal, 0.3–0.5); the what-if **Reveals insulated**
switch uses 0.08 (`RETURNED_REVEAL_PSI`; Hypothesis: insulation returned 2–3 cm into the reveal). An
opening in a wall with no exterior insulation gets none. A RECESS is not needed for
this; one with the window's footprint and band changes nothing (the window owns its band).
**Proven** (Node, made-up 4 m room, 45 cm meulière + 10 cm outdoor insulation R 2.5, 1.2 × 1.2 m window):
4.80 m of edge, 50 W at ψ 0.4 (the window itself 52 W) whether the window stops at the wall face,
goes into the insulation, or the insulation is drawn in two pieces stopping at it; 10 W with the
reveals insulated; 0 with no outdoor insulation. The owner's local file (older than the headset
plan) has no opening into outdoor insulation: 0 W.

## Heaters: what the radiators give (owner, 2026-10-05)

Owner: "display the heaters contributions as well as a separate category"; radiators are FURNITURE
zones with a radiator product. A catalog entry's **`powerW`** (`public/furniture/index.json`, the rated
output from the retailer's spec, EN 442 at ΔT 50 K) counts for the room holding the zone's centre
(`roomHeaters`). It is scaled to the project's **Radiator water ΔT** (mean water − room, default 50) by
the usual exponent 1.3: at 30 K a radiator gives about half (0.51). **Hypothesis:** 50 K suits a boiler
at 70–80 °C; a heat pump or condensing boiler at 45–55 °C is nearer 25–35 K. HEAT LOSS shows the
heaters as their own category, never mixed with the losses: each room's plan label `<loss> W · rad.
<heaters> W`, the room breakdown's HEATERS line (W, count, % of its loss; green when they cover it,
red when not), and this floor's line under the title. HEATER zones and radiator markers carry no
power (not counted). **Proven** (Node): a 4 × 4 m room losing 4685 W with the 50 × 200 EASY (1730 W):
1730 W at ΔT 50, 891 W at 30. The owner's local file has no radiator product.

## What if: is the insulation worth it? (owner, 2026-10-05)

Owner: "a toggle for all wall insulations, all attic insulations … whether insulation is worth it",
then "a toggle windows insulations as well". The HEAT LOSS panel's **WHAT IF (NOT SAVED)** section has
four switches, session-only (never in the project, back to as drawn on reload):
- **Wall insulation** no: every INSULATION zone is ignored (its wall, or the placeholder, remains);
- **Attic insulation** no: every floor's added attic R (`ceilingR`) is 0 (the bare ceiling remains);
- **Windows** no: every WINDOW / SLIDING at single glazing, U 5.8 (`SINGLE_GLAZING_U`; Hypothesis:
  old single glazing in a wooden frame); doors keep their U;
- **Reveals insulated** yes: the reveal ψ drops to 0.08 (see Reveals above), an improvement.

The room labels, the heat map and the floor total follow the switches. Under the title the panel shows
the **whole house** (`houseHeatLoss`): design watts and a yearly estimate, kWh/yr = W / ΔT × degree-days
× 24 / 1000, with **Degree-days /year** a project setting (default 2200 K·day base 18 °C; Hypothesis:
Paris area, recent winters; ground losses are scaled the same way, a simplification). With any switch
changed, a line shows the difference against as drawn, in W, % and kWh/yr (red = loses more,
green = saves). A yearly cost needs the
owner's heating energy and price (not modelled). Each whole-house total is cached until the project
changes: ~140 ms per pass on a laptop for the owner's plan (Hypothesis: a few hundred ms on the Quest).
**Proven** (Node on the owner's local file, older than the headset plan, 2026-10-05; nothing typed in
`project.heat`): all counted 21 607 W / 43 878 kWh/yr; without wall insulation +1 996 W; without the
windows +1 806 W; without attic insulation +0 (no attic R typed in that file). With attic R 8 typed on
the top floor: 17 636 W, and without it +3 971 W (+22 %, +8 064 kWh/yr).

## Where the heat goes: the heat map (owner, 2026-10-04)

Owner: "see at a glance where I lose heat, whether floor, wall, or ceiling", values shown "as the
reticle pass over them". Everything in W/m² on one scale so walls, floor and ceiling compare.
- `floorHeatLoss` returns each room's `map`: `wall` = every 5 cm column of exterior wall with its
  bands (`wall` in air, `recess` the wall behind a recess, `opening` sill–head, `earth` below the earth level), each with U and W/m², and
  the column's average W/m² over the room height; `floor` / `ceiling` = the room's footprint cut by
  what lies across (`heated` 0, `unheated`, `earth`, `air`, `attic`), each with U and W/m².
  **Proven** (Node on the headset plan, 2026-10-04): the map's watts add back to every room's parts on
  all three floors (mismatch < 1e-11 W); totals unchanged.
- Plan (AR HEATING · HEAT LOSS, `docs/ar-survey.md`): a wall's column collapses to one colour (its
  average) plus an opening strip; the height split is in the readout. **Next (agreed, not built):** the
  same map painted on the wall faces in the AR 3D view, band by band at their real height.
- Seen on first render (offline, Node → SVG with the same geometry): the 7 cm wall r112 shows red
  (≈100 W/m², counted as the whole exterior wall); Ground ceilings with nothing above are red (bare R
  0.06, no roof R set).

UI: the HEATING group (owner, 2026-10-01: pipes, heat loss and R together), `docs/ar-survey.md`:
HEATING · HEAT LOSS (room watts + settings) and HEATING · R / U (each insulation zone's R and each
opening's U, typed on the numpad; an insulation R also on the PLAN · EDIT band pad). The room's watts also show on the PLAN · EDIT `area:`
HUD line. No desktop UI yet.

**Proven** (Node on the owner's file, 2026-10-01; Basement set unheated, everything else default):
Ground 11.7 kW, Upper 8.4 kW. One Ground room checked by hand term by term (wall 22.1 m² × 2.38 × 26
= 1 368 W vs 1 371; floor 12.1 m² over basement × 2.04 × 13 + 2.6 m² on earth = 340 W; air 182 W).
With attic R 7 on both floors: Ground 8.8 kW, Upper 4.6 kW. Save/reload keeps every setting.
**Hypothesis:** totals are high because nothing but 3 linings is insulated yet; the absolute values
depend on the unknown wall, slab and lining R. Unverified on the Quest.

## Limits (deliberate, keep it simple)

- One indoor temperature for every room (no 22 °C bathroom yet).
- Stairs are circulation, not rooms: their own loss is not counted.
- The attic counts as outside (b = 1); a sloped ceiling is counted flat (owner: flat ceilings under
  a ~1 m attic, so it fits).
- Thermal bridges are a fixed derating of the insulation, not linear ψ values.

Open: the earth level, the masonry material, slab construction, attic R once blown, and the R of the existing linings.
