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
- **Openings:** WINDOW / DOOR / SLIDING / GARAGE zones on an exterior edge are cut out of the wall
  area (width × their sill/head band) and counted at their own U: the zone's `uValue` (owner,
  2026-10-01: each window carries its own, typed from its label's Uw / Ud in HEATING · R / U), else the
  project's Window U (window, sliding) or Door U (door, garage). Window products carry no Uw yet. A
  HALF WALL is plain wall; PASSAGE and HEATER are ignored (interior / not an opening).
- **Floor and ceiling are split by overlap** with the floors below and above (rooms' plan union):
  heated room → no loss; unheated floor → `b`; nothing below → ground; nothing above → roof/attic.

## Insulation layers

- An INSULATION zone **inside** a room rect is an interior lining (all of them in the owner's house,
  2026-10-01). One drawn **outside** (within 0.6 m of the edge) is exterior insulation: owner
  decision 2026-10-01, draw exterior insulation as zones. Both may cover the same wall: R values add.
- **Proven** (read `zoneColors.js`, `geometry2d.js`, `architectural3d.js`, 2026-10-01): INSULATION is a
  subtract zone, so one outside every room changes no room area and no exported massing; View 3D
  draws it as solid wall wherever it is. **Hypothesis:** outside a wall thicker than the inferred
  12 cm shell it floats with a visible gap (cosmetic); a WALL zone for the real wall would close it.
- Each zone carries its R (from the product label), or λ with the zone's drawn depth as thickness.
- Thermal bridges: interior lining R × 0.85 (cut by slabs, partitions, rails); exterior R × 0.95.
- Partial coverage splits the wall into pieces, each with its own U (area-weighted sum).
- The masonry's thickness is not drawn (the shell is inferred), so its R is a project setting
  (e.g. concrete block 20 cm ≈ 0.23).

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
zone's `rValue`; additive, no FILE_VERSION bump); defaults in `src/core/heatLoss.js`.

| Setting | Default | Source |
|---|---|---|
| outdoor design °C | −7 | owner: Val-de-Marne (94), 43 m (no altitude correction) |
| annual mean °C | 12 | Paris area (ground losses only; not in the panel) |
| indoor °C | 19 | EN 12831 living rooms (one value for every room) |
| air changes /h | 0.5 | owner: single-flow VMC |
| bare wall R | 0.25 | Hypothesis: masonry unknown (owner knows thickness, not material) |
| window / door U | 1.4 / 2.0 | Hypothesis: recent double glazing / ordinary door |
| bare slab R | 0.15 | Hypothesis: owner does not know the slab construction |
| insulation λ (no R) | 0.04 | the 3 existing linings have no R yet; owner sets it per zone |
| per floor: heated, unheated °C, added floor R, attic R | yes, 6, 0, 0 | attic: blown rock wool planned (λ ≈ 0.045; set R when known) |

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

Open: the masonry material, slab construction, attic R once blown, and the R of the existing linings.
