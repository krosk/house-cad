# Materials (surface finishes): design

Status (2026-09-26): **phases 1–3 implemented**: catalog, finishes, takeoff, AR MATERIAL · FLOOR /
WALL, View 3D textures, and the AR 3D view on LEFT X. Build- and Node-verified on the owner's house;
**not yet seen in a browser or on device**. Phase 4 is not started. The MATERIAL tints were invisible
in AR until the `PLAN_OVERLAY_GROUPS` fix (see `docs/ar-survey.md` "Performance notes"). This file records the owner's decisions so later sessions build the same thing.

## Goal

Apply a material (flooring, wall tile, paint…) to a **room floor** or a **single wall face**, from a
catalog. The same material entry drives:
- **quantities** (how many planks/tiles/packs, how many m²);
- **the texture** in the 3D view (later phase).

A parquet of `x × y` → how many for this room. An octagon + cabochon (small square insert) tile → how
many octagons and how many cabochons.

## Owner decisions

| Decision | Choice | Why |
|---|---|---|
| Where it is authored | **AR, a new MATERIAL group** (separate from PLAN, MARKER and FURNISH) | The owner surveys and decides on site |
| Wall granularity | **Each wall face, one at a time**; no "whole room" shortcut (owner removed it, 2026-09-26) | e.g. only the shower wall is tiled |
| Catalog | **Built-in starter list + the owner's own products** (exact size, joint, pack) | Real counts need the real product |
| Adjacent rooms, same material | **Continuous** (owner note, 2026-09-26) | One floor running through a doorway has no seam and is laid as one |
| Different materials at a doorway | **Meet at the middle of the doorway** (owner, 2026-09-26) | Usual threshold line |
| Pack rounding | **Whole house per product** (owner, 2026-09-26) | Leftovers from one room serve another; saves boxes |
| Seeing materials in AR | **A 3D view in AR, toggled by a LEFT controller button** (owner intent, 2026-09-26) | Walls have no 3D in AR today; the toggle is how wall finishes become visible there |

## Model

Surfaces have no stored identity today: a "room" is a derived connected group of ROOM rectangles
(`connectedRoomComponents`). Proven on the owner's rev 9 house: each real room is its own component,
separated from its neighbours by the wall gap that holds the door zone. For example, Upper has
5 rooms: 14.7, 4.5, 1.5, 18.5 and 0.9 m². Targets therefore reuse identities that already exist:

- **Floor** = a room component, stored against one of its ROOM rectangles (`{rect}`). Applying
  replaces any finish held by another rectangle of the same component.
- **Wall face** = a ROOM rectangle edge seen from inside (`{rect, edge}`, the same
  `left|right|bottom|top` edge references that dimensions use), limited to the part of the
  edge on the component boundary.
- Finishes live in a per-floor list `floor.finishes = [{target, material}]`, next to `constraints`
  (no id: the target is the key). They are never fed to the solver or footprint.
  `removeRectangle` drops finishes that target the removed rectangle; floor paste remaps them. They are
  saved in the project file as **additive fields with no `FILE_VERSION` bump**; a missing list loads
  as `[]`. A finish whose rect is no longer a ROOM, or whose material is unknown, is ignored rather
  than deleted.
- Custom materials live on `project.materials` (saved with the house). Built-ins live in code
  (`src/core/materials.js`) and are never stored.

A material entry is `{id, name, surface: floor|wall|both, pattern, w, h, joint, color, accent, pack}`,
where `pattern` is one of `stagger` (planks), `grid`, `brick`, `octagon` (+ cabochon), `paint`, and
later `herringbone`. `pack` is pieces per box or m² per box.

## Continuity rule

- **Pattern origin is global per material** (the plan origin), never per room. Two surfaces with
  the same material are therefore always aligned, and textures run continuously through
  doorways and along coplanar wall faces.
- **Trade-off (owner acknowledged, 2026-09-26):** a global origin gives continuity, but not the most
  efficient layout. Where the pattern's phase falls against a room's walls sets how many edge pieces
  get cut, and it can leave thin slivers. For 200 mm octagons in a 1.88 × 2.39 m room, that ranges
  from 10 × 12 = 120 octagons at the best phase to 11 × 13 = 143 at the worst. Continuity only needs
  one phase per **connected same-material region**, not per house. A possible improvement: anchor
  each region at its own offset, chosen to minimize pieces and avoid slivers under ⅓ of a piece.
  Not adopted yet; the owner is fine with the global origin.
- **Quantities merge adjacent same-material rooms into one laying region.** Two rooms joined through
  a door/opening zone that touches both are one region, and **the doorway strip is included**.
  Offcuts and edge cuts are counted once for the whole region.
- **Where the materials differ**, each side runs to the middle of the doorway (owner-confirmed): the
  door zone is split along its long axis, and each half joins the room it touches.
- Coplanar wall faces of the same material across a room boundary (e.g. a corridor wall passing two
  rooms) share the pattern through the global origin. Wrapping a pattern around corners is out of
  scope.

## Quantities (`src/core/flooring.js`, pure, Node-testable)

- **Planks (`stagger`)**: lay rows along the chosen direction through the region's rectilinear
  polygon. Each row starts with the previous row's offcut when it keeps joints ≥ min stagger
  (default 30 cm) and pieces ≥ min length. Count planks bought.
- **Tiles (`grid`/`brick`)**: count the lattice cells that intersect the region, whole vs cut.
- **Octagon + cabochon**: the repeat cell is one octagon with one cabochon at its lattice corner.
  Count the octagons and cabochons intersecting the region, whole vs cut.
- **Walls**: net face area = face length × height, minus door and window openings on that face
  (their `sill/head` bands are known). Paint = m²; tile = the lattice count on the face rectangle.
- Implementation limits (v1):
  - a cut lattice piece counts as a whole piece bought (offcuts are not reused between cells);
  - an octagon counts as its full lattice cell, so a region that only grazes its chamfered corner
    still counts it;
  - planks run along the region's long axis;
  - a wall face follows the **finished surface**:
    - a wall/insulation lining drawn over the room edge insets it by the lining's depth (the owner's
      house has 18–21 cm linings), with stacked linings chaining;
    - a lining that reaches deeper than it runs along the edge is the corner end of the neighbouring
      wall's lining, so that stretch is hidden and dropped;
    - an edge onto a stairwell is open (no wall), as in `architecturalWallBoxes`;
    - a half wall cuts the face above its sill;
    - known gap: the part below a half wall standing *inside* the room stays on the room edge, hidden
      inside the half wall;
  - a doorway belongs to a room within 5 cm, and an opening pierces a face when it sits within
    45 cm behind it.
- Always show the naive `area ÷ piece + waste%` beside the laid-out count. Round packs up **once per
  product for the whole house**, not per room (owner decision). The per-room readout shows pieces;
  the whole-house total shows packs.

Owner's house (Proven, Node, rev 9 Upper):
- oak on both bedrooms and the 1.5 m² landing gives **one** region of 34.81 m² (both doorways
  included) = 158 planks, 20 packs;
- 200 mm octagons in the bathroom at the global phase = 143 octagons (99 whole, 44 cut) + 120
  cabochons, the worst-phase case from the trade-off above;
- bathroom walls: the 2.39 m faces net 4.94 and 4.79 m² once the door/window are deducted.

Prototype (Proven, Node, owner's upstairs bathroom 1.88 × 2.39 m = 4.49 m²):
- planks 1200 × 190 → 20 laid out vs 22 naive (+10%);
- 200 mm octagons → 120 octagons (99 whole, 21 cut), ~139 cabochons, vs a naive 112.

## Phases

1. **Core + AR authoring:** catalog, `floor.finishes`, save/load, quantities + continuity, and AR
   MATERIAL modes:
   - **FLOOR:** aim at a room, thumbstick-y cycles the material, B/Y clears;
   - **WALL:** aim near a room edge picks that face (one face at a time).

   AR shows a floor tint plus the readout (material, pieces, packs, m²).
2. **3D textures** (implemented): `finishSurfaces` (flooring.js, no counting) → `finishGeometries`
   (architectural3d.js: 2 mm overlays, one mesh per material and role, UVs in plan metres) →
   `finishTexture` (src/ui/finishTextures.js: one canvas repeat unit per material, `repeat = 1/unit`).
   - Floor overlays keep the `floor` role, so they are POV tap targets; wall overlays keep the `walls`
     role.
   - Planks swap U/V where the region runs along Y, matching the takeoff.
   - **The plank texture is a representative ⅓ stagger, not the takeoff's cut plan**: the count
     comes from the simulation, the picture only shows the product.
   - Paint is a flat colour.
   - Checked in Node: with every room on Ground and Upper finished, 133 of 134 wall overlay quads sit
     on a solid 3D wall, just in front of it. The 1 exception is the half-wall gap above.
   The same geometry and textures are meant to feed the **AR 3D view** below.
3. **AR 3D view** (implemented): **LEFT X** toggles it (owner choice). It shows the same
   `architectural3d.js` walls/openings/stairs/outlines plus the finish overlays and textures, for the
   floors on show; the real floor stays visible. Details are in `docs/ar-survey.md` (controls).
   - Unmeasured: check PROJECT · PERF with it on, because the AR budget is tight and batching was what
     fixed it.
   - Other free LEFT buttons: **Y** (`buttons[5]`) and the stick click (`buttons[3]`).
4. **Custom products in AR:** the numpad enters w/h/joint/pack; the list is kept per project.

## Open questions

- Until the AR 3D view exists, AR shows a wall face's material as a coloured strip along its edge on
  the floor plan.
