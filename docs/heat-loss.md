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
- **Air volume** (owner, 2026-10-06: "the area does not mark the actual air volume"): the room's
  floor area × the room height, minus what each zone inside the room really fills (`airVolume`).
  Walls, insulation and cabinets fill the full height; a half wall (incl. a plinth under a shower
  tray) only up to its top; a heater only its band; doors, passages, windows, recesses and stairs
  (owner, 2026-10-07: "stairs can count as air") are air; furniture is ignored. A stair open to the
  room is already part of it ("Open stairs"), so it is not added twice; on the headset plan all three
  stairs that touch a room are open to it, so the stairs rule changes nothing there (Proven in Node:
  hall 17.78 m³, upper landing 10.84 m³, house 6 728 W, as before). Until then the net area (every non-furniture zone taken out) ×
  the full height was used, so a 9.3 cm plinth under a 120 × 80 tray removed 2.6 m³ instead of
  0.09 m³ (13 W in each bathroom). Proven in Node on the headset plan: ground shower room
  8.05 m³ = 3.114 m² × 2.70 m − toilet half wall 0.231 m² × 1.15 m − plinth 0.96 m² × 0.093 m; air
  40 W, as before the plinths. The reported area stays the net floor area.
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
- Thermal bridges: linear ψ at each junction (see "Thermal bridges" below). Until 2026-10-06 they were
  a derating of the insulation instead (interior lining R × 0.85, exterior R × 0.95), now dropped so a
  bridge is not counted twice.
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
| window ψ (ext. insul.) | 0.9 W/mK | DPE table: wall with exterior insulation, frame at the inner face, insulation not returned (see Thermal bridges) |
| per floor: heavy floor, heavy attic floor | yes, yes | DPE: only heavy (concrete, brick) floors count. `heavy` is the floor's own structure (under it; the slab between two storeys is the upper one's floor), `heavyCeiling` its ceiling where only an attic or the roof is above. Owner (2026-10-06): the ground floor's is concrete over brick (heavy), the upper floor's wood and the loft (attic) floor above it wood too: Upper heavy no, heavy attic floor no; Ground heavy attic floor no (the loft over its single-storey part, "probably wood too"). Not yet set in the headset plan (rev 17 read 2026-10-06): the owner sets them in AR |
| heavy partition from | 0.10 m | DPE: only heavy partitions (refends) count. Owner (2026-10-06): a mix, thin ones (< 10 cm) plaster, thick ones meulière; each T's partition thickness is the gap between the two rooms along the façade |
| whole-house balance | off | owner (2026-10-07): a toggle. See "Whole-house balance" |
| plaster partition λ | 0.40 W/mK | Hypothesis: dense solid plaster block; owner (2026-10-07): "full plaster walls". 7 cm → U 2.3, 10 cm → 2.0 (with Rsi 0.13 each side). For the balance only |
| per floor: heated, unheated °C, added floor R | yes, 6, 0 | added floor R (since 2026-10-06) counts only where a floor lies below: owner, "insulation on the basement ceiling … make it so that the kitchen does not double count"; a part on earth or over air keeps the bare slab (the kitchen, on earth). **Proven** (Node, headset plan, 0 °C out, 22 °C in): Ground floor R 3 → the living room 2 908 → 1 961 W, the kitchen 535 W unchanged (it was 484 W when R counted on earth too). |
| per floor: attic R | 0 | blown rock wool planned; owner's quote (2026-10-05): ROCKWOOL JETROCK 2, 360 mm blown, 352 mm settled, R 8 = 0.352 / λ 0.044. Proven against Rockwool's documentation (web search, 2026-10-05): λD 0.044, and for R 8 a settled 352 mm, 360 mm installed, at least 6.80 kg/m², so the quote matches the manufacturer's table; on site, check the depth markers and the bag count against that coverage |

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
no change on the headset (2026-10-05), so that test was dropped. **Window ψ (ext. insul.)** (was
"Reveal ψ") is a project setting. Since 2026-10-06 its default is the DPE table's 0.9 W/mK (was 0.4, a
guess), the what-if **Reveals insulated** uses the table's 0.25 (was 0.08), and an opening in an
uninsulated wall or one with a lining also gets its DPE ψ (see Thermal bridges). Owner (2026-10-06): the
reveals are to be insulated with 1–2 cm of foam (planned). The DPE counts any return as returned
(0.25) whatever its thickness; **Hypothesis:** 1–2 cm, if it lines the whole reveal from the outer
insulation to the frame, comes close to that, and a 3–4 cm return would do better where the frame
leaves room. A RECESS is not needed for
this; one with the window's footprint and band changes nothing (the window owns its band).
**Proven** (Node, made-up 4 m room, 45 cm meulière + 10 cm outdoor insulation R 2.5, 1.2 × 1.2 m window;
the ψ values of that time): 4.80 m of edge, 50 W at ψ 0.4 (the window itself 52 W) whether the window stops at the wall face,
goes into the insulation, or the insulation is drawn in two pieces stopping at it; 10 W with the
reveals insulated; 0 with no outdoor insulation. The owner's local file (older than the headset
plan) has no opening into outdoor insulation: 0 W.

## Thermal bridges (owner, 2026-10-06)

Owner: "Any more sophisticated way to compute thermal bridges?", then, with no reference values, the
French DPE defaults; "how do I see your pick?" → drawn in the room in AR (option 2 of 3; no panel
breakdown, no Node report). Method: linear ψ × junction length × ΔT at every junction of an exterior
wall, the ψ from the **3CL-DPE 2021** tables (arrêté du 31 mars 2021, annexe 1). **Proven** (read
2026-10-06 from the open-source Open3CL engine, `src/tv.js` table `pont_thermique`, and matching
methode3cl.com 3.4.2 / 3.4.3): the values in `PSI_LOW`, `PSI_MID`, `PSI_TOP`, `PSI_PARTITION`,
`PSI_OPENING` of `src/core/heatLoss.js`. They are deliberately cautious (upper bounds).

The wall's insulation at each 5 cm column picks the row: **none**, **ITI** (an INSULATION zone inside
the room, or on the room side of a drawn WALL zone), **ITE** (insulation outside the masonry, or beyond
the edge where no WALL zone is drawn), **ITI+ITE**. Junctions (`ringJunctions`, `slabJunctions`):

| Junction | Where it is found | Length | ψ (wall none / ITI / ITE) |
|---|---|---|---|
| lowest floor / wall | exterior columns of a room with no heated room under that point (earth, basement, unheated floor, air) | the run, full | 0.39 / 0.31 / 0.49 with the floor uninsulated; floor R set and a floor below that point → "ITE" (insulation under the slab, on earth or over air never: the owner's planned renovation puts it on the basement's ceiling; today, 2026-10-06, the ground floor is a bare concrete/brick slab, floor R 0): 0.80 / 0.71 / 0.64 |
| intermediate floor / wall | a heated room above (at the ceiling) or below (at the floor), looked for 10, 30 and 60 cm into the room and 30 cm to each side along the wall (floors rarely line up; a single 10 cm probe left 5–27 cm "roof" stretches at the corners on the owner's plan, 2026-10-06); runs under 10 cm are dropped | the run, half per side | 0.86 / 0.92 / 0.13, if the upper floor's `heavy` |
| top floor / wall | nothing heated above: attic, roof or an unheated floor | the run, full | 0.30 / 0.27 / 0.55 uninsulated; with attic R (or the unheated floor's floor R) → "ITE" (insulation above; owner, 2026-10-06: laid on the attic floor): 0.40 / 0.75 / 0.58; if `heavyCeiling` (an unheated floor above: its `heavy`) |
| partition / wall | a corner of the room's outline where an exterior edge turns into one facing a heated room, and the façade carries on past the partition: within 60 cm along it lies another room whose own façade is there | the ceiling height, half per side | 0.73 / 0.82 / 0.13 if the gap between the rooms is at least `heavyWallMin` (10 cm); thinner = plaster, ψ 0, drawn grey |
| window or door / wall | each opening, by the insulation at or within 30 cm of it | sill + head + jambs (a door: no sill) | 0.38 / 0 / 0.9 (window ψ setting; 0.25 with "Reveals insulated"); frame at the inner face (owner, 2026-10-06), 5 cm |

Rooms share an intermediate floor or a partition, so each counts half. The DPE neglects light (wood)
floors and partitions: **Heavy floor** and **Heavy attic floor** (per floor, THIS FLOOR rows, default
yes) turn floors off; a partition is heavy from **Heavy partition from** (project, 0.10 m) up.
**Proven** (Node on the owner's old local file): its 8 detected T's are all 7–9 cm (light, 0 W; the
house 24 965 → 24 752 W). **Hypothesis:** the thick meulière partitions either do not reach the façade
in that file or are missed; the AR posts (green = counted, grey = light) show which.
**Proven** (Node on the headset plan rev 17, read 2026-10-06): 8 811 W as stored, bridges 2 712 W
(windows in exterior insulation the largest, 50.6 m at ψ 0.9); with the owner's answers (Upper floor
and loft floor wood) 8 178 W, bridges 2 078 W; with the reveals insulated as well 7 322 W. Ground keeps
≈ 250 W of top junctions in three rooms with only the loft above them (Ground's own heavy attic floor);
the owner (2026-10-06): that loft floor is probably wood too, so Ground heavy attic floor no as well. The lowest floor's junction follows its
floor's `heavy` too. **Proven** (Node on the owner's old local file, 2026-10-06): Upper heavy and heavy
attic floor no → the house 24 965 → 24 235 W (Ground's ceiling and Upper's floor junction 515 W, Upper's
top 209 W, Upper's lowest floor 8 W gone); both survive save and reload. Ground still has 167 W of top
junctions where nothing but the roof is above it, set by Ground's own heavy attic floor. Wall corners are not counted (DPE). The per-room part is `parts.bridge` (the panel's
"bridges" figure, after floor and ceiling); `map.junctions` lists each junction with its type, wall
and floor classes, ψ, length, share and W.

In AR HEAT LOSS each junction is drawn where it is, 4 cm inside the wall face: a bar along the wall at
the floor or at the ceiling, a post floor to ceiling for a partition, a frame around an opening. The
colour is the type (amber lowest floor, pink intermediate, cyan top, green partition, red window), brighter for a larger ψ.
Aiming the reticle within 15 cm inside a wall (or at a post) shows the junctions there:
"Intermediate floor · at ceiling · 31 W / interior insulation / ψ 0.92 × 3.40 m × ½", one line each
when several overlap.

**Proven** (Node, made-up two-storey plan, two 4 × 4 m rooms per floor, 45 cm walls, a 20 cm partition):
each partition T found once per room (half each), the intermediate slab on both floors at half, the
window frame 4.90 m; with exterior insulation on one façade its slab ψ drops 0.86 → 0.13 and its window
rises 0.38 → 0.9; a lining makes the window 0. **Proven** (Node on the owner's local file, older than
the headset plan, 2026-10-06; nothing typed in `project.heat`): the house goes 21 607 → 24 965 W
(+16 %): bridges 3 385 W (windows 947, lowest floor 709, intermediate 1 050, top 467, partitions 212),
the rest from dropping the derating. A first partition rule (any turn from exterior to a heated room)
found 74 on that file, mostly false: walls facing undrawn spaces; the corner-and-façade rule above
finds 10. **Hypothesis:** partitions that a 60 cm probe cannot cross, or rooms drawn with odd gaps,
are missed; the AR drawing is how the owner checks. Unverified on the Quest.

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

Owner plan (2026-10-05): a **future heat pump** on the existing radiators. Method agreed: set Radiator
water ΔT to the design-day value (20 ≈ water 45/40 °C, 30 ≈ 55/45 °C) and treat the rooms that turn
red (insulation or more radiator surface) so the water can stay as cool as possible. **Hypothesis**
(typical air-to-water figures, a data sheet would prove them): SCOP ~4.5–5 at 35 °C, ~3.2–3.6 at 55 °C;
a weather-compensated pump needs the design temperature only on the coldest days.

## Heating plan: heat pump water temperature (owner, 2026-10-06)

The owner's target and decisions, and what the model says they need. Numbers: **Proven** by Node on
the headset plan rev 17 (read 2026-10-06), with the settings below typed in; heat pump behaviour and
products are **Hypothesis** (typical figures; the installer's calculation and the data sheet decide).

**Target:** 22 °C in every room, at all times. **Water:** 50 °C flow (≈ 41 °C return, 45.5 °C mean,
Radiator water ΔT 23.5; the panel steps by 1 K, so 23 or 24) at 0 °C outside, without the split; up to 55 °C flow below about −3 °C
(weather compensation; "hotter when very cold" accepted). Not underfloor-heating levels.

Assumed renovation (all typed in the model for these numbers):
- **Basement ceiling insulation: 2 cm PIR, R 0.9** (Ground · Floor ins. R (over basement); it counts
  only over the basement, the kitchen on earth stays bare). R 2 (6–8 cm) was too thick; 2 cm already
  removes ~75 % of the living room's floor loss (1 207 → ~290 W at 0 °C). Check fire covering rules
  for exposed PIR in the basement.
- **Reveals insulated** with 1–2 cm foam (Window ψ 0.25).
- Upper floor, its loft floor and the loft floor over Ground: wood (heavy no); the ground floor
  slab concrete over brick; partitions: plaster < 10 cm, meulière thicker.
- Today's radiators (De'Longhi EASY, ACOVA Angora products in the plan); Basement unheated at 9 °C
  (0 °C day) / 6 °C (−7 °C day).

| Room | Loss 0 °C | Radiators at 50 °C flow | Loss −7 °C | At −7 °C, 50 °C flow |
|---|---|---|---|---|
| Ground living 39 m² | 2 010 W | 2 334 W ✓ | 2 604 W | −270 W: the **FTXM60A split** covers it (cold days only; not at 0 °C) |
| Ground 14 m² | 647 W | 778 W ✓ | 835 W | −57 W |
| Ground 3 m² (shower room) | 232 W | 230 W ≈ | 299 W | −69 W |
| Ground kitchen 10 m² (on earth) | 535 W | 600 W ✓ | 672 W | −72 W |
| Ground 5 m² | 382 W | 600 W ✓ | 496 W | ✓ |
| Upper (3 rooms) | ✓ | ✓ | ✓ | ✓ (4 m² bathroom just) |
| **House** | **5.1 kW** | | **6.6 kW** | |

(Living room corrected 2026-10-06 for the self-facing gap fix, see Limits; the rest unchanged.)

At −7 °C the small shortfalls go away at ~55 °C flow, or with the bathroom's electric element and
21 °C in the 14 m² room and the kitchen. Mean water needed with today's radiators at 0 °C, for
reference: bare slab 50 °C in the living room; R 0.6 (2 cm XPS) 45.2; R 0.9 44.4; R 2 43.0.

- **Bathrooms:** a heat pump heats one circuit at one temperature (zones can be mixed cooler, never
  hotter). For a warmer bathroom or towel drying: a dual-energy towel radiator (water + electric
  element). Not from the hot-water tank.
- **Efficiency (Hypothesis):** COP at 0 °C outside ≈ 3 at 50 °C flow (≈ 4 at 35 °C, ≈ 2.5 at 55–60 °C);
  most of the season runs cooler (≈ 40 °C mean at +7 °C).
- **Sizing (Hypothesis):** ~5–7 kW of heating at −7 °C / 55 °C flow, plus domestic hot water; not
  oversized (short cycling). Check the operating map (55 °C at −7 °C), the output and COP at −7 / 55,
  not the nominal +7 / 35 figures. Standard R32 air-to-water units reach 55–65 °C.
- **The owner's Daikin 5MXM90A is an air-to-air multi-split** (5 indoor units such as the FTXM60A
  and the CTXM15A in the plan; 10 kW nominal heating, web listings 2026-10-06). **Hypothesis**
  (from the product type): it heats air only and cannot feed the radiators; the radiators need a
  separate air-to-water heat pump. (The 5MWXM90A variant adds a domestic hot-water tank, not
  radiator heating.)
- The model has no per-room temperature, no "water needed" readout and no split as a heater yet
  (offered, not built).

## Whole-house balance (owner, 2026-10-07)

Owner: "I won't be able to have individual water temp line", then "can we account for adjacent room
spare?" and "make the whole house balance as a toggle option". With one water temperature, a room whose
radiators fall short settles below the indoor temperature and draws heat from warmer neighbours; a room
with spare is held at the indoor temperature by its thermostatic valve. `houseBalance` (heatLoss.js),
on with the WHOLE HOUSE row **Whole-house balance**:

- **Nodes:** every heated space on every heated floor. Spaces joined by an open stairwell across storeys
  (a stair of one floor over a stair of the next, each open to its room) are one node (owner: "the
  ground hall and upper landing are actually connected").
- **Each node's loss** is linear around the indoor temperature: its loss there plus G·(T − tRoom), G =
  walls, openings, bridges and air over (tRoom − tOut), the floor over (tRoom − what is below: the
  annual mean on earth, the basement's temperature), the ceiling over (tRoom − what is above).
- **Radiators:** rated × ((tRoom + water ΔT − T) / 50)^1.3, capped by the valve at tRoom.
- **Between nodes:** partitions, sampled every 5 cm of each space's outline (the first other space
  within 0.6 m; its gap is the partition's thickness), U = 1 / (0.26 + gap / λ), λ = the plaster
  partition λ under the heavy-partition thickness, else the wall λ (meulière); each side samples the
  wall once, so halved. Floors between two heated storeys: the overlap area at
  U = 1 / (0.20 + bare slab R + 0.25 for a light floor) (Hypothesis: boards, joist void, plaster ceiling).
- **Solved** by Gauss-Seidel (each node bisected for its temperature with the others fixed) until
  nothing moves by 0.00001 K.
- **Shown** (AR panel): each room's label adds the temperature it reaches; the room box adds
  "Reaches 20.4 °C · from neighbours +23 W" (green at the indoor temperature, red under it; "with the
  stairwell" for a joined node); the header adds **Water needed**, the lowest ΔT at which every space
  with a radiator reaches the indoor temperature (bisection, up to 60 K).
- **Not modelled:** a door in a partition (counted as partition), the air through an open door, the
  split units, sun, people, appliances.

**Proven** (Node, headset plan as of 2026-10-07 with the trays and toilets, 22 °C inside, ΔT 24 K =
46 °C mean water, plaster λ 0.40):

| Space | −7 °C: reaches, from neighbours | 0 °C |
|---|---|---|
| Ground shower room (1.9 m² net) | **20.4 °C**, +23 W (19.3 °C on its own) | 22.0 °C |
| Ground hall + upper landing (stairwell, one node) | 21.1 °C, +31 W | 22.0 °C (gives 17 W) |
| Ground living room | 21.2 °C, +7 W (the split not counted) | 22.0 °C |
| Ground kitchen, 14 m² room | 21.1 °C, 21.5 °C | 22.0 °C |
| Upper 18.4 m², bathroom, 14.7 m² | 21.8, 21.9, 22.0 °C; they give 34, 14, 39 W | 22.0 °C |
| Upper 0.9 m² space (no radiator) | 20.1 °C, +32 W | 21.0 °C |

**Water needed:** ΔT 28.6 K (50.6 °C mean) at −7 °C, 23.8 K (45.8 °C) at 0 °C, about the same as the
tightest room on its own (the ground shower room: 28.8 and 24.0 K). Deliberate, not a bug: the valves
hold every other room at exactly the indoor temperature, so at the point where all rooms reach it no
neighbour is warmer and none can give. The balance changes how far short a room falls (19.3 → 20.4 °C),
not the water needed for all to reach it. One run took about 0.4 s in Node (the floors' geometry,
already the cost of the house total); the panel computes it once per plan change, only while on.

## What if: is the insulation worth it? (owner, 2026-10-05)

Owner: "a toggle for all wall insulations, all attic insulations … whether insulation is worth it",
then "a toggle windows insulations as well". The HEAT LOSS panel's **WHAT IF (NOT SAVED)** section has
four switches, session-only (never in the project, back to as drawn on reload):
- **Wall insulation** no: every INSULATION zone is ignored (its wall, or the placeholder, remains);
- **Attic insulation** no: every floor's added attic R (`ceilingR`) is 0 (the bare ceiling remains);
- **Windows** no: every WINDOW / SLIDING at single glazing, U 5.8 (`SINGLE_GLAZING_U`; Hypothesis:
  old single glazing in a wooden frame); doors keep their U;
- **Reveals insulated** yes: the window ψ in exterior insulation drops to 0.25 (see Reveals above), an improvement.

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
- Stairs (owner, 2026-10-06: "only if it is opened without a door separating"; `heatComponents`):
  a STAIRS zone counts with the room it touches or overlaps, its walls, floor, ceiling and air, unless
  a DOOR / SLIDING / GARAGE zone sits on their contact; a stair behind a wall gap stays apart and is not
  counted (as all stairs were before). A stair open to two rooms joins them; a flight and its landing
  join each other. Room areas elsewhere (EDIT, sheets) are unchanged. **Proven** (Node, headset plan,
  0 °C out, 22 °C in): the Ground hall + its stair up 6.6 m², 417 W (382 W alone) for its 600 W
  radiator at 50 °C flow (sized right, not oversized); the basement stair stays out (a gap); Upper's
  landing + both stairs 4.0 m², 124 W (no radiator: heated by the hall below); the 0.9 m² cupboard
  behind door r138 stays apart.
- A room's own far side across a thin gap counts as heated (2026-10-06). Before, a room wrapping
  around a slot (the living room around a wall stub; a stairwell's balustrade) counted that edge as
  an exterior wall: the living room 3 636 → 3 426 W as stored, 2 187 → 2 010 W at 0 °C / 22 °C (Node).
- The attic counts as outside (b = 1); a sloped ceiling is counted flat (owner: flat ceilings under
  a ~1 m attic, so it fits).
- Thermal bridges use the DPE's tabulated ψ (cautious defaults), not a computed ψ per junction; balconies,
  beams, lintels and cantilevers are not in the plan and not counted; wall corners are left out, as in the DPE.

Open: the earth level, the masonry material, slab construction, attic R once blown, and the R of the existing linings.

## Laundry heater (owner, 2026-10-10: "it does not need to reach 22 deg, but just enough to reduce humidity … such as 15")

Laundry r66 (basement, 12.3 m², 25.3 m³) heated to **15 °C**, the rest of the basement unheated (6 °C), −7 °C outside,
earth −0.4 m (project settings). **Proven** (Node, `floorHeatLoss` on the 2026-10-10 headset plan with only the
Basement's `heated` and `tRoom` changed, scratch script): r66 alone **543 W**: walls 178 (19.8 m², 18.2 in the earth;
south, west and east are exterior, the north side is partitions), window r146 22, thermal bridges 212, floor on earth 38,
air 94 (0.5 ach from outside). The model cannot see the two neighbours the heated-basement run hides, so by hand
(Hypothesis; U from the project's λ 1.5, Rsi 0.13 each side): **+ ≈ 150 W** through the north partitions to the unheated
basement (≈ 17 W/K: 46 cm to r67, 7 cm plaster and door r120 to r68, 40 cm to the stair), **− ≈ 75 W** gained from the
heated ground floor through its insulated ceiling (R 0.9: ≈ 0.87 W/m²K × 12.3 m² × 7 K). Air: the laundry's VMC extract
(30 m³/h assumed) drawing basement air at 6 °C ≈ 92 W, about the model's 94; drawn from outside ≈ 225 W.
**Design loss ≈ 620 W** (≈ 750 W if the replacement air comes from outside), plus ≈ 70 W on average to evaporate a
load a day (≈ 2.5 kg of water after a 1200 rpm spin, Hypothesis). At 12 °C: ≈ 350 W.
Sizing (owner, same day: "Hot water", a radiator on the house circuit). The project's radiator ΔT 24 K is above
a 22 °C room, so the mean water is ≈ 46 °C and in a 15 °C laundry the radiator sees ≈ 31 K: (31/50)^1.3 ≈ 0.54 of its
EN 442 rating. **≈ 1150 W rated** for 620 W (≈ 1400 W if the air comes from outside), with a thermostatic valve set
to ≈ 15 °C; its flow and return cross the unheated basement, so insulate them (Hypothesis). Heat lowers relative humidity (air saturated at 6 °C
is ≈ 54 % at 15 °C) but removes no water: the VMC extract (or a dehumidifier) does. The bridges (212 W) are the largest
uncertainty: the ψ table is meant for walls above ground.
Shared pair (owner, same day, corrected: "one pipe for the ground floor bedroom and the laundry room, with tees"):
one 16 × 2 flow + return pair, each radiator teed off with its own valves (two-pipe). The ground bedroom r51 (13.9 m²
with r133) lies right above the laundry (Proven, headset plan), so the tees sit on the laundry ceiling. Load at −7 °C
≈ 1.45 kW: bedroom 835 W at 22 °C (Proven: Node, headset plan) + laundry ≈ 620 W. Hypothesis (12 mm bore, water ≈ 45 °C):
10 K drop (boiler) ≈ 125 l/h, ≈ 0.31 m/s, ≈ 0.15 kPa/m; 5 K drop (a future heat pump) ≈ 250 l/h, ≈ 0.61 m/s, ≈ 0.5 kPa/m:
fine now, at the noise limit with a heat pump on a long run. Each radiator sees the same water, so the laundry stays
≈ 1150 W rated. ~~Hall + laundry, in series~~: a misreading (the owner meant the bedroom, with tees).
East basement room r74 (owner, same day: "the same rule as laundry room", 15 °C), 7.75 m² (x 0.69…4.31, y −0.87…1.27).
Proven (Node, same run as the laundry): 501 W: walls 130, openings 85, bridges 185, floor 24, ceiling 17, air 59. By hand
(Hypothesis): + ≈ 148 W through the north partition to r72 (27 cm, door r75) at 6 °C; − ≈ 50 W because door r73 opens
onto the unheated basement, not outside (the model counts it exterior); − ≈ 46 W gained from the heated ground floor
above (7.5 m², R 0.9). **≈ 550 W**, so ≈ 1000 W rated at the house water (31 K over 15 °C). On the kitchen + ground
shower pair (owner question): ≈ 1.5 kW in all; 16 × 2 ≈ 130 l/h at a 10 K drop, ≈ 260 l/h (≈ 0.64 m/s) at 5 K: fine on
the boiler, at the noise limit with a heat pump. Those two pairs already rise at r74's south edge, so its tee sits in its
own ceiling (reachable), r74 first on the pair (Hypothesis).
**Owner, same day: the ground shower room keeps its own pair; the kitchen and r74 share one** (and the bedroom + laundry
share one, thermostatic valves only, no lockshields). Kitchen + r74 ≈ 1.2 kW: ≈ 105 l/h at 10 K, ≈ 210 l/h (≈ 0.52 m/s) at
5 K, fine (Hypothesis). The tee is in r74's ceiling; the slab trench keeps its two pairs; the tightest room, the shower,
is on nobody else's flow. Not drawn in the plan yet.
At **17 °C** instead (owner question, same day): Proven (Node, same run) r66 659 W, r74 592 W; with the same hand
corrections (Hypothesis) **laundry ≈ 800 W, r74 ≈ 690 W**; the house water is then 29 K over the room, ×0.49 of the rating:
≈ **1600 W** and ≈ **1400 W** rated. Pairs at 5 K (heat pump): bedroom + laundry ≈ 1.64 kW, ≈ 280 l/h, ≈ 0.69 m/s (over the
≈ 0.6 m/s noise limit); kitchen + r74 ≈ 1.36 kW, ≈ 0.58 m/s. Fine on the boiler (10 K). Relative humidity of air
saturated at 6 °C: ≈ 54 % at 15 °C, ≈ 48 % at 17 °C.
Owner, same day: **A kept** (kitchen + r74, shower alone). ~~B: r74 + shower, kitchen alone~~: evener loads (≈ 0.42 m/s
at 5 K) but the shower room, the tightest room, would share with r74, first on the pair and slow to warm (buried
masonry, ≈ 1400 W rated), so it would warm last on a cold start.
