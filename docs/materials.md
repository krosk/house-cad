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

## Flooring products (a design on a plank material)

A real flooring product is an ordinary `surface: 'floor'`, `pattern: 'stagger'` catalog entry with its
published plank size and pack, so the takeoff (`src/core/flooring.js`) counts it like any plank. An
optional `design` swaps the generic 3-row stagger texture for a drawn product look
(`src/ui/finishTextures.js`, `DESIGNS`), over a larger repeat unit (3 planks × 10 rows, joints at
seeded random offsets) so the repeat is hard to spot. `bevel` (m) draws V-bevelled long edges;
`roughness` overrides the View 3D default. The texture stays representative: it is not the takeoff's
cut plan.

- `oak_beaulieu_charme`: Beaulieu Flooring engineered oak, natural, charme (rustic) grade, vitrified
  (Leroy Merlin ref 92245930, 2026-09-26). From the page's characteristics: 1180 × 164 mm, 14 mm thick,
  3.3 mm wear layer, V-bevel on the 2 long sides, click, 8 planks = 1.548 m² per pack (8 × 1.18 ×
  0.164 = 1.548, consistent). Look tuned against the product gallery (media.adeo.com ids): **799228**, a
  straight top-down shot of the laid floor (the main reference: render at the same 2 m scale beside
  it; mean colour matched by pixel statistics, rendered #b79c7b vs photo #b69977), **1045179** (edge
  close-up: knot, grain), room shots **1587720** and **964334** (these two disagree in warmth: studio
  lighting), and the same wood in the M (13 cm) and XL (18.7 cm) widths. Figure: mild per-plank tone,
  fine broken grain, small flames on about half the planks, clusters of pin knots, some larger knots.
  The bevel width (2 mm) is an estimate.
  Proven: build; scratch browser renders beside photos 799228 and 964334; takeoff of a 5 × 4 m room = 107 planks
  (Node). Not yet seen in View 3D on a real room or in AR.
- Photos come from `tools/product-images.mjs` (Leroy Merlin via its Chrome snippet: the site runs
  DataDome); see `docs/product-modelling.md` step 3.
- Texture cost: the design canvas is 2048 × 949 px (about 10 MB of GPU memory with mipmaps), four times
  the generic planks. Hypothesis: fine on Quest for one or two such materials; watch PERF in the AR 3D view.

## Wall tile products (a design on a brick-bond material)

Same idea as flooring: a `surface: 'wall'`, `pattern: 'brick'` entry with the published tile size and
pack (the takeoff counts it), plus a `design` drawn over a 4 tiles × 8 rows unit. A brick design also
has a **bump texture** (`finishBumpTexture`, same unit and seed) that View 3D applies; `bumpScale`
sets its strength and `edgeWobble` (m) the handmade edge wander.

- `tile_vernisse_white`: GoodHome Vernisse wall tile, white gloss, "carreaux anciens" relief (Castorama,
  EAN 5036581063269, 2026-09-26). From the page: 301 × 75.4 mm, 8.5 mm, glazed ceramic, not rectified;
  40 tiles = 0.92 m² per box (the page's embedded data: `"0.92","m²",…,"count",40`). White tile, white
  grout (owner). Joint 3 mm and the half-offset layout are estimates from photo **05** (straight-on);
  the relief from **03** (edge) and **09** (kitchen, raking light). The colour layer is nearly flat
  white; the look comes from the bump (rounded edges, long glaze undulations) and gloss
  (`roughness` 0.12, `bumpScale` 3). Owner: "looks really good".
  Proven: build; scratch renders beside photos 05 and 09; takeoff of a 2 × 0.6 m splashback = 60 tiles
  (Node). Not yet seen on a real wall in View 3D or in AR.
- **Its look depends on reflections.** Photo 09's character is the room mirrored in a wavy glaze. That
  needs an environment map: View 3D's **✦ Reflections** toggle (below). Without it the tiles show
  their relief but little shine.
- **AR shows only the colour layer**: the AR 3D view's Lambert materials ignore bump and reflections, so
  the tile reads as flat white with faint joints there.

### View 3D reflections (owner decision, 2026-09-26: on demand)

A **✦ Reflections** button under the View 3D lighting toggle sets `scene.environment` to three's
`RoomEnvironment` (PMREM, built once on first use; hemisphere fill 0.9 → 0.35 while on, environment
intensity 0.6). Off by default and remembered **per device** (`localStorage`
`house-cad:view3d-reflections:v1`), because some devices struggle; it never enters project or share
data. MR saves and clears `scene.environment` at session start and restores it at the end, so AR never
pays for it. Proven: toggles, persists across reload, no console errors, in a plain-HTTP dev app. Not
measured on a phone.

Could AR have it? Possible, not built. It would need Standard (PBR) finish materials in the AR 3D view
instead of Lambert, plus the environment map: both cost GPU on Quest, where performance was hard to
get. Hypothesis: WebXR light estimation could supply a real-room reflection map on some headsets
(unverified on the Quest browser). If wanted, make it a separate opt-in inside AR and watch PERF.

## Doors (door products)

Owner decisions (2026-09-26): a door product is a **material of a DOOR zone** (not a FURNISH item),
authored in the MATERIAL group as **MATERIAL · DOOR**. Made-to-measure products take their size from
the zone.

- Stored like any finish: `{target: {rect: <door rect id>}, material}`. A door rect never belongs to a
  room component, so it can't be mistaken for a floor finish; the takeoff ignores it.
  `project.setDoorFinish(rectId, material)`.
- Catalog entries have `surface: 'door'`, `pattern: 'door'`, a `design` (the leaf drawing), `color`
  (leaf and frame), `accent` (glass), `leafDepth`.
- 3D: `doorProductPlacements` (architectural3d.js) resolves each door's centre, axis, width, head,
  hinge jamb and swing face from the zone; `buildArchitecturalFloor({productDoors})` skips the plain
  door slab there; `src/ui/doorProducts.js` builds the frame (50 mm face, 80 mm deep), a steel
  threshold, the leaf with its design texture on both faces (mirrored so the lock edge is the same
  in the world from either side), handles and cylinder roses on both faces, and hinge knuckles on the
  swing face. View 3D uses Standard materials; the AR 3D view uses cached Lambert ones.
- **Lapeyre Ange-Line** (`door_ange_line`), aluminium, sold made to measure: no manufacturer 3D model,
  so the design is inferred from Lapeyre's product photos: a full-height groove about 20% of the
  width in from the lock edge; a satin-glass half-lens from that groove bulging about 36% of the width
  toward the hinge, from 10% to 88% of the height; the same circle continued as grooves to the
  lock-edge corners. Leaf 85 mm and frame 80 mm (Lapeyre spec sheet); colour an anthracite close to
  RAL 7016 (a guess from the photos: the product colour is customisable).
- Proven 2026-09-26: renders in a scratch preview (both faces, hinge either side) and in the real
  desktop View 3D on an injected demo house (door along X and along Y). Not yet seen in AR.
- Limits: `door` zones only (not sliding or garage); the leaf is drawn closed; the texture is
  stretched over the leaf, so the design scales with the opening's proportions.

## Open questions

- Until the AR 3D view exists, AR shows a wall face's material as a coloured strip along its edge on
  the floor plan.
