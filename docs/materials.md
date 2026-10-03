# Materials (surface finishes): design

Status (2026-09-26): **phases 1–3 implemented** (plus door, window and switch products): catalog, finishes, takeoff, AR MATERIAL · FLOOR /
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
| Where it is authored | **AR, a new MATERIAL group** (separate from PLAN and MARKER) | The owner surveys and decides on site |
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
  Not adopted as an automatic optimiser.
- **Grout weight (owner, 2026-09-27):** the takeoff gives kg of grout per region / wall face
  (`count.grout`) and per product for the house (`totals.grout`), from `groutKg` (flooring.js): joint
  length per m² × joint width × depth × 1.6 kg/dm³. That is the usual manufacturer formula
  `(A + B) / (A × B) × C × D × 1.6` for a rectangular tile (a 30×30 tile, 3 mm joint, 10 mm deep =
  0.32 kg/m², matching it), generalised per pattern: pinwheel = Σ (w + h) of the 9 cells per 1.69 m²
  (4.62 m/m²), stepped = Σ (w + h) of the 5 cells per 0.79 m² (5.06 m/m²), octagon + cabochon = 6 sides per lattice cell, a mosaic sheet = its sticks. Depth = the
  tile thickness (full-depth joint), 10 mm for products with none. ρ = 1.6 is a typical cement grout,
  not a chosen product: the bag's own coverage wins. No waste margin; plank (click) floors, paint and
  joint-free products have none. AR shows it only for the room being looked at, on its quantity line
  (`… · 4.5 kg grout`; owner: the house total isn't needed for now, though `totals.grout` has it); for mixed formats the room line drops its total pieces (the per-size lines
  carry them) to leave room.
- **Pattern turn (owner, 2026-09-27):** a laying region may turn its pattern 90° (`turn: true` on
  its floor finishes, set on all of them by `setFloorTurn`), for patterns with a direction such as the
  mosaic sticks and the planks. Planks swap to the other axis (they otherwise follow the region's long
  axis). Any other pattern turns about the start point: its frame is `(u, v) = (y, −x)` of the plan
  shifted to the start, in the takeoff (`turnBoxes`) and the 3D UVs alike. The pinwheel and the octagon
  look identical after a 90° turn, so turning them changes nothing. Kept on a material change, dropped
  with the material; additive save field.
  - Fixed on the way: the 3D UVs used to swap x/y for **every** pattern in a region deeper than wide
    (meant for planks only), mirroring the tiles against the takeoff. Only planks swap now.
- **Pattern start corner (owner, 2026-09-27):** a laying region may instead start its pattern at one
  of its corners. The owner chose a corner (not a wall line, not a numeric offset) and one start
  point per **laying region**, so joints still run continuously through a doorway between rooms of
  the same material. Stored on the floor finish as `anchor: { rect, corner: bl|br|tl|tr }` (a room
  rect's corner, b = min y, l = min x), so it follows the walls when the plan is edited. It resolves
  (`resolveAnchor`, flooring.js) to the region's own outline corner of that type nearest the rect
  corner, so a wall/insulation lining drawn over the room edge moves it to where the floor really
  starts. The takeoff counts the region shifted by that point; the 3D UVs subtract it. One anchor per
  region; if merged regions carry several, the first finish wins. Changing the material keeps it;
  clearing the material drops it. Deleting its rect falls back to the origin. Share links carry no
  finishes, so they carry no anchor either. Rooms without an anchor keep the plan origin (their
  counts are unchanged). Floors only: wall faces still use the global origin.
- **Quantities merge adjacent same-material rooms into one laying region.** Two rooms joined through
  a door/opening zone that touches both are one region, and **the doorway strip is included**.
  Doorway kinds: DOOR, **PASSAGE** (an open doorway with no leaf, added 2026-09-27 as a separator
  between two rooms), SLIDING and GARAGE.
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
- **Pinwheel (30/50 opus)**: count the module cells (9 per 1.30 m module, `PINWHEEL`) that
  intersect the region, whole vs cut, per format (50×50, 30×50, 30×30); each format is its own
  article and box, so whole-house packs need every format's box size (`pack.formats`).
- **Stepped random**: the same per-format count over the oblique lattice copies (`steppedCount`).
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
    - a half wall in the wall line (outside the room area) cuts the face above its sill;
    - a half wall standing *inside* a room is a free-standing low wall: it cuts no face, and the 3D
      wall behind it stays full height (owner, 2026-09-27: Ground r139 against the 7 cm gap wall to
      r106 had been opened above 1.1 m); known gap: the part of the face below it stays counted,
      hidden inside the half wall;
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

   AR shows a swatch badge at the room's centre plus the readout (material, pieces, packs, m²); no
   coloured fill (owner, 2026-09-27).
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
     on a solid 3D wall, just in front of it. The 1 exception was the half-wall gap above, fixed since
     (Proven, Node, 2026-09-27: r106's top face is back to 3.30 m², the gap wall solid at 2 m).
   The same geometry and textures are meant to feed the **AR 3D view** below.
3. **AR 3D view** (implemented): **LEFT X** toggles it (owner choice). It shows the same
   `architectural3d.js` walls/openings/stairs/outlines plus the finish overlays and textures, for the
   floors on show; the real floor stays visible. Details are in `docs/ar-survey.md` (controls).
   - Unmeasured: check PROJECT · PERF with it on, because the AR budget is tight and batching was what
     fixed it.
   - Other free LEFT buttons: **Y** (`buttons[5]`) and the stick click (`buttons[3]`).
4. **Material card** (implemented 2026-09-30): LEFT grip in a MATERIAL mode shows the target's
   texture patch with a scale bar, or its product in 3D; see `docs/ar-survey.md` "Material card".
5. **Custom products in AR:** the numpad enters w/h/joint/pack; the list is kept per project.

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
  In View 3D Realistic the planks come from photo 799228 itself, laid by a shader with no repeat
  (`docs/realism.md` "Photo finishes").
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

## Mosaic products (a design on a grid of sheets)

A mosaic is sold by the **sheet**, so the catalog piece is the sheet: `pattern: 'grid'`, `w`/`h` = the
sheet, `pack: { pieces: 1 }`, and the takeoff counts sheets. `mosaic: [cols, rows]` gives the sticks on
a sheet; the texture spaces them all on one even pitch (the joint inside a sheet equals the joint
between sheets, as on a laid wall) over a 3 × 3 sheet unit, with a bump map like the brick designs.

- `mosaic_blue_stone`: GoodHome Blue stone mosaic, "gris clair" (Castorama, EAN 5036581066864,
  2026-09-26). From the page: natural stone, matte, not rectified, wall **and** floor (`surface:
  'both'`), 30 × 30.4 cm sheet, 8 mm, 1 per pack. Photos (Scene7 codes): **02c** straight top-down
  sheet, **36c** / **38c** angled close-ups, **37c** a laid wall about 1.2 m wide, **01i** a shower
  room; 70t_FR is a recycling logo.
  - The sheet layout was measured on **02c**: 3 × 18 sticks, about 98 × 15 mm, with 2 mm gaps. The
    joint pitch in **37c** agrees (column : row pitch 6.0 there, against 10 : 1.7 cm).
  - The stone is a mid grey despite the name: about (97, 94, 94) on **02c**. The render uses base
    `0x686767`, which lands the median near the photo's under the preview light.
  - The details are also from **02c** and the close-ups: diagonal scuff patches, hairline veins, a
    white calcite vein across about one stick in seven, and tumbled edges.
  - The grout colour (`0xe2e0dd`) comes from the laid renders. Those renders show a wider joint
    (about 3.5 mm) than the 2 mm measured on the sheet; the entry keeps 2 mm.
  - Proven:
    - the build passes;
    - scratch renders beside **02c**, **37c** and **01i**, with pixel medians of 95 (render stone)
      and 101 (photo);
    - takeoff (Node): a 2 × 1.5 m floor = 35 sheets (24 whole, 11 cut).
  - Not yet seen in View 3D on a real room or in AR.

## Terrazzo tile products (a design on a grid of tiles)

The same `pattern: 'grid'` + `GRID_DESIGNS` path as the mosaics, with one tile per piece (no
`mosaic`) and `sheets: 2`: the texture unit is 2 × 2 tiles instead of 3 × 3, so the 2048 px canvas
gives about 1.7 px/mm and the smaller chips stay visible. Polished flat, so the bump map only lowers
the joint.

- `terrazzo_marble_cream`: marble-cement terrazzo, 60 × 60 cm tiles (owner, 2026-09-27; no product
  page). The look comes from the owner's photo of an 8 × 8 cm sample (scratchpad only, not stored):
  - Measured on a 50 mm crop at about 15 px/mm: angular crushed-marble chips about 6–13 mm (the
    largest share), 3–6 mm and 1–3 mm, packed close with thin cement between, plus fine grey and
    white sand specks. The design places them by share of the face (`TERRAZZO_CHIPS`: 34 / 20 / 12%)
    on a 1 mm occupancy grid, so chips rarely overlap.
  - Colours: off-white cement (`0xf3f4ee`); greige, white-grey, darker greige and a few pale peach
    chips (`chips`, weighted). The photo's cement reads slightly cool; the palette follows it.
  - Estimates: 2 mm joint, grout `0xe4e3da`, 20 mm thick, polished (`roughness: 0.35`), sold per
    tile (`pack: { pieces: 1 }`).
  - Proven:
    - the build passes;
    - a scratch render of a 50 mm square beside the sample crop, pixel grey (mean / p5 / p50 / p95):
      render 201 / 173 / 209 / 217, photo 197 / 164 / 204 / 217;
    - takeoff (Node): a 4 × 3.5 m floor = 42 tiles (30 whole, 12 cut).
  - Not yet seen in View 3D on a real room or in AR; the owner has not yet judged the render.

## Pinwheel products (mixed 30/50 cm tiles)

`pattern: 'pinwheel'` lays three formats of one range as the owner's pinwheel (owner spec,
2026-09-27): a 130 × 130 cm module of nine tiles, four 50×50 arms spiralling clockwise round a
30×30, with 30×50 / 50×30 in the corners. The layout lives once in `src/core/flooring.js`
(`PINWHEEL`, `pinwheelCells`), so the takeoff and the texture read the same cells. Every row and
column of the module crosses three tiles, so the pitch is 1.30 m + 3 joints (1.315 m at 5 mm),
anchored at the plan origin (or the region's start corner) like every pattern. `w = h = 1.3` (the module). The texture unit is
2 × 2 modules (`m.modules`), 36 different faces, about 0.78 px/mm; `PINWHEEL_DESIGNS` draws each tile.

No catalog product uses the pinwheel since 2026-09-29 (Monastère moved to the stepped layout below);
the code stays, as a documented owner layout.

## Stepped random (mixed 30/50 cm tiles, no continuous joint)

`pattern: 'stepped'` (owner spec, 2026-09-29, replacing the pinwheel on Monastère): a 5-tile module
that is not a rectangle, `[x, y, w, h]` cm with the spec's y down: (0,0,30×30), (30,0,50×30),
(0,30,50×30), (50,30,50×50), (20,60,30×50), repeated at `m·A + n·B`, A = (80, −30), B = (50, 80).
The layout lives once in `src/core/flooring.js` (`STEPPED`, `steppedCells`); the pattern frame is
plan (y up), so y is flipped there and the top view matches the spec's drawing.
- **Proven** (raster test and Node takeoff, 2026-09-29): exact cover (det = 7900 cm² = the module
  area; clipped tiles sum to the region area); longest straight joint 210 cm across, 110 cm along;
  a 20 × 20 m room counts 1.32 50×50, 3.92 30×50 (both ways) and 1.29 30×30 per m², the spec's
  1.27 / 3.80 / 1.27 plus edge cuts.
- **Placement:** with a start corner, the module's 30×30 lands whole in that corner; without one, the
  module centroid sits at the region's bounding-box centre (the spec's advice: balanced cuts), not
  at the plan origin. `floorRegions` returns it as `frameOffset`, which the takeoff and the 3D UVs
  (`finishGeometries`) both add, after the start-corner shift and the turn.
- **Joints:** cells are nominal and the joint comes out of each tile (a 50 cm cell holds a 49.5 cm
  tile at 5 mm). This lattice has no joint-consistent pitch (a 30 and a 50 would each need their own
  scale), unlike the pinwheel.
- **Texture:** the smallest x/y repeat is 7.9 × 7.9 m (0.26 px/mm in 2048 px), so the texture repeats
  along the lattice instead. `steppedCanvas` draws 3 × 3 lattice cells (45 faces) through a shear, and
  the texture's own `matrix` maps plan metres to lattice coordinates (`matrixAutoUpdate = false`):
  about 0.77 px/mm, like the old pinwheel unit. The detail layer samples the same sheared UVs, so the
  grain is skewed by about 11°, which does not show on random grain. **Proven** in a Chrome render: tile
  joints on the takeoff's outlines, no seam at the wrap. Paint takes about 0.65 s on desktop Chrome.

- `monastere_beige_pinwheel` (id kept from the pinwheel so saved finishes resolve; laid `stepped`):
  Leroy Merlin Monastère beige, glazed matte porcelain, aged limestone
  look. Three articles, each with its own box (the takeoff counts and boxes each size):

  | Size | Ref | Box |
  |---|---|---|
  | 50×50 | [72831325](https://www.leroymerlin.fr/produits/carrelage-mur-interieur-sol-interieur-effet-pierre-beige-monastere-l-50-x-l-50-72831325.html) | 5 tiles = 1.25 m² |
  | 30×50 | [72831311](https://www.leroymerlin.fr/produits/carrelage-mur-interieur-sol-interieur-effet-pierre-beige-monastere-l-30-x-l-50-72831311.html) | 7 tiles = 1.05 m² |
  | 30×30 | [72831304](https://www.leroymerlin.fr/produits/carrelage-mur-interieur-sol-interieur-effet-pierre-beige-monastere-l-30-x-l-30-72831304.html) | 12 tiles = 1.08 m² |

  - From the pages: irregular edges, 9 mm, 5 mm joint advised, 24 face designs (the 50×50 page
    says 20). The 30×50 page was found by trying refs next to the 30×30's with the same URL
    pattern (only 72831311 answered).
  - The owner's showroom photo (2026-09-27, scratchpad only) shows the board: 3 mm joints, 24
    designs, PEI 5/5, R10. The page and the board disagree on the joint; 5 mm is used (it moves
    the module by 6 mm).
  - Takeoff: per room, each size's pieces and whole pieces (`count.formats`); whole-house totals
    per size (`totals.formats`) and boxes per size (`packsByFormat`, rounded up once per size),
    `packs` = their sum. The AR readout shows this room's pieces per size, one line each, largest
    first (`50×50 39 pcs (9 cut)`), then ONE house line with the boxes per size in the same order
    (`HOUSE 8 · 4 · 2 packs`): 6 lines in all. The controller pill used to keep only 4 lines, so the
    30×30 line and the house lines were cut off (owner report, 2026-09-27); it now fits up to 6 by
    tightening the pitch. No wastage margin and no offcut
    reuse (a cut spot = one tile bought); the desktop has no quantity view yet.
  - Design `aged-stone`:
    - per-tile tone (±4%), a faint tan / cream value-noise cloud, dense fine mottle and pits
      gathered in the clouds;
    - a few rust-orange pits (`rust`, as on the 30×50 photo); white crackle veins on about
      half the tiles (as on the 30×30 photo);
    - a wavy outline drawn inward (`edgeWobble` 3 mm, slow waves, the odd chip) with rounded
      corners (5–11 mm);
    - a pillowed edge: nested outline strokes make the bump map roll the face down to the joint
      over about 12 mm (`bumpScale: 3`), which is what makes each tile read as a soft stone in a
      lit room view, as in the retailer's laid render;
    - plus the View 3D detail layer below.
  - Sources:
    - the straight tile photos of the three formats (50×50 media 1165024, 30×50 989865,
      30×30 1182128) for colour and spread; they agree (grey mean 214–217);
    - the owner's showroom photo for the greige tone, cream grout and even surface (the first
      version's clouds were far too strong beside it);
    - the laid mixed-format render (4237191) for the edges. Room renders 944246 / 926892 are
      warm-lit laid-look references only.
  - Proven:
    - the build passes;
    - Node: the 9 cells cover the module exactly (no overlap; area = pitch²);
    - Node, 4 × 3.5 m floor: 86 tiles (17 cut): 39 × 50×50, 38 × 30×50, 9 × 30×30;
    - Node, two rooms (4 × 3.5 + 3 × 3 m): 67 × 50×50 = 14 boxes, 63 × 30×50 = 9, 15 × 30×30 = 2,
      25 boxes;
    - texture grey on a 50×50 face (mean / p5 / p50 / p95): 204 / 194 / 204 / 214 against the top-down
      photo 217 / 199 / 218 / 233. It is deliberately darker, toward the showroom photo, where the
      tile reads about 15% darker than the grout.
  - Hypothesis / unknown:
    - grout colour `0xe6dfcd` and tile brightness, which the owner accepted for now (2026-09-27);
    - not yet seen in the real app's View 3D or in AR.
  - In View 3D Realistic the faces come from the three tile photos, laid by a shader
    (`docs/realism.md` "Photo finishes").

## Stone wall tile products (a design on a grid of tiles)

- `lucia_ivory_30x90`: Leroy Merlin Lucia ivoire,
  [ref 88400736](https://www.leroymerlin.fr/produits/carrelage-mur-interieur-effet-pierre-ivoire-lucia-l-30-x-l-90-cm-x-ep-10-mm-88400736.html).
  - From the page: glazed white-body faïence, fine limestone look, satin, smooth, rectified, 90 × 30,
    10 mm, 2 mm joint, 15 designs, interior walls only, box 5 tiles = 1.35 m².
  - Laid landscape and stacked (`pattern: 'grid'`, `sheets: 3`: 3 × 3 tiles per 2.7 × 0.9 m unit), as
    in the retailer's bathroom photo (media 3737972). That photo's upper wall is a leaf-pattern tile,
    taken to be a separate Lucia decor (Hypothesis) and not modelled.
  - Design `limestone`: per-tile tone; faint grey clouds from a value-noise field kept square on the
    long tile (`stoneField(…, {aspect: true})`: an N × N field stretched 3:1 smeared the clouds
    sideways); dense small grey-beige flecks, many elongated, gathered in the clouds; 2% rust
    flecks; 0–2 hairline veins; a fine per-pixel grain. Smooth: the bump map only lowers the joint.
  - Colours and fleck density from the straight tile photo (media 3907316); grout `0xe4e0d8` is an
    estimate.
  - Proven:
    - build;
    - texture grey on one tile (mean / p5 / p50 / p95): 238 / 229 / 238 / 246 against the photo
      237 / 223 / 238 / 246, at the same scale;
    - Node: a 2.4 × 2.5 m wall = 27 tiles (11 cut).
  - Not yet seen in the real app or in AR.

## Detail layer (View 3D close-ups)

- **Why:** a finish's texture is one repeat unit in at most 2048 px (`unitCanvas`). On a 2–3 m unit
  that is under 1 px/mm: the Monastère unit (then 2 × 2 pinwheel modules, 2.63 m) got 0.78 px/mm and Lucia 0.76, so
  sub-mm pits and flecks became 1 px dots and blurred to mush up close. Owner noticed, 2026-09-27.
  The earlier checks hid it: photos were compared after shrinking them to the texture's scale.
- **How:** a design listed in `DETAIL_DESIGNS` (`finishTextures.js`) draws its fine grain once on a
  512 px tile covering `size` metres (Monastère 0.16 m, Lucia 0.12 m, 3–4 px/mm).
  - Channels: R = colour multiplier, G = micro height. The R mean is held at 0.5, so the far look is
    unchanged.
  - `applyFinishDetail(material, def)` patches View 3D's finish material (`onBeforeCompile`):
    colour × 2R, and the bump height + `detailBump` × (G − ½). It reads the map's own UVs scaled by
    unit ÷ detail size.
  - One texture per design, cached, about 1 MB.
- **Monastère detail:** 1–3 mm granular mottle, pits of 0.2–1.2 mm (dark and deep), sand specks,
  grain. **Lucia:** dense 0.2–0.9 mm grey flecks, pale specks, a light grain.
- **Trap:** the bump patch first rewrote every `texture2D( bumpMap, … ).x` read, including the one
  inside the new `finishHeight` function, which then called itself and failed to compile ("Recursive
  function call"). Replace the reads first, then insert the function.
- **Proven** (scratch renders about 35 cm away; before/after beside the full-resolution photos):
  - crisp pits and granular relief on Monastère, sharp flecks on Lucia;
  - at 3 m the grey mean is unchanged with and without the layer (169.2 vs 169.3; Lucia 168.2 vs
    168.3).
- **Not covered:**
  - other designs have no detail yet;
  - AR's Lambert materials don't use it;
  - not yet seen in the real app, on the phone or on the Quest browser (Hypothesis: the patched
    shader compiles there as it does in desktop Chrome).

## Texture preparation in a worker

- **Owner rule (2026-10-03): everything that is texture preparation runs in the background.**
  - Why: once share links carried finishes (session 38), opening the owner's link froze the page.
    The 2D pan stalled and smeared.
  - Then, with finishes painting in a worker (`2798bc9`), the owner saw the texture count rise while
    the UI stayed frozen. The Realistic photo floors were still built on the page.
- **What used to block the main thread** (Chrome on the Steam Deck):
  - the 7 finishes of the owner's house: about 5.1 s (Lucia 1.9 s, Monastère 1.8 s);
  - the Charme photo atlas: 2.9 s; Monastère's: 0.9 s;
  - the sky's HDR parse: 0.2 s;
  - furniture pictures, repainted on every rebuild (the shower tray's stone 37 ms).
- **How:**
  - One module worker, `src/ui/textures.worker.js`, with its page client `src/ui/textureWorker.js`.
  - Jobs:
    - `finish`: `finishCanvases`, colour, bump and detail; AR asks for colour only.
    - `photo`: download plus `photoCanvases` (`photoFinishes.js`).
    - `sky`: download plus `skyPixels` (`skyPixels.js`), returning half-float arrays.
    - `paint`: a named painter from `src/ui/painters.js` for the small procedural textures. These
      are View 3D's default wood and plaster, the exterior behind window glass, door leaves, and
      furniture (wood, leather, fabric, slats, shower tray, piano keys, badge, radiator grille).
  - Canvases come back as transferred ImageBitmaps and are copied onto page canvases, so `flipY` and
    uploads behave as before. The page only wraps them into textures.
  - **Small textures** (`paintedTexture.js`): the caller gets a texture at once with a 1 px
    placeholder of the product's colour, and its builder stays synchronous. When the picture
    arrives, the texture is disposed (the GPU copy was 1 × 1) and refilled. One texture per name,
    args, size and variant, shared and never disposed, so a rebuild never repaints.
  - **Finishes:** a finish shows its flat colour until its texture is in, then the detail layer
    and, in Realistic, the photo attach. AR's finish material does the same, and the AR material
    card waits for the texture.
- **Owner choice: "work in progress → done".**
  - `onTextureProgress` counts every job. While any is pending and the plan is shown, ◈ View 3D is
    disabled and reads `3D: textures n/N…`; it opens when all are done.
  - If 3D is already open, it stays open.
- **Fallback:** without Worker or OffscreenCanvas, or if the worker fails, each job runs on the
  page, one per task. A finish that fails inside the worker alone is repainted on the page. A
  download failure rejects as before.
- **Trap: a module imported by the worker must never import `textureWorker.js`.** Its `new Worker`
  call would bundle a worker inside the worker. So `photoFinishes.js`, `skyPixels.js`,
  `imageCache.js`, `painters.js` and the painter modules are worker-safe: no DOM use at load time,
  and canvases made via `newCanvas()`. `realism.js` and `view3d.js` hold the page sides.
- **Proven** (Chrome on the Steam Deck, scratch dev server, 2026-10-03):
  - All 7 finishes, both photo atlases and the sky, started at once, finished in 7.9 s. The main
    thread never blocked for more than 40 ms.
  - Pixels compared with the page versions:
    - photo atlases, the sky arrays and 10 of the 11 painter pictures are byte-identical;
    - the door leaf differs in 0.003 % of bytes (max 7/255);
    - finishes: 4 identical; for Charme, mosaic, Lucia and terrazzo the canvas `blur` filter
      rasterizes slightly differently in the worker (channel means within 0.3/255, worst 28/255).
  - The 13 procedural furniture products build in about 140 ms in total, down from about 280 ms. The
    rest is geometry.
  - A synthetic 7-finish link shows the counter, then ◈ View 3D.
- **Hypothesis:**
  - The 3D view after the swap looks as before; not seen, because the test tab was hidden.
  - Safari on the iPhone 14 runs the module worker (Safari 15+) and OffscreenCanvas 2D (16.4+),
    including `ctx.filter` and text.
  - Painted textures look right in the Quest browser's AR view.
  - A download that never settles would leave ◈ View 3D disabled; there is no timeout.
- **Not moved:** GPU work (the sky's PMREM, shader compiles) needs the WebGL context. UI text
  canvases (AR labels, the material card, the QR code, sheet previews) are drawn on demand.

## Octagon + tozzetto products

An `octagon` entry with a `design` draws OCT_CELLS × OCT_CELLS (4 × 4) octagons in `color` with a tozzetto
diamond in `accent` at every lattice corner, on `grout`, plus a bump map.

**`diagonal: true`** (owner, 2026-09-27; set on the Etruria entry) lays the pattern turned 45° so the
tozzetti are **squares, square to the walls**. A regular octagon is unchanged by a 45° turn, so the
laid pattern is a square grid of pitch `(w + joint)/√2`: a cabochon on each vertex with m + n even (one
on the plan origin / start corner) and an octagon on each with m + n odd. The takeoff
(`diagonalOctagonCount`) clips the real tile shapes against the region, so a piece counts only if the
region reaches the tile itself. The texture paints the straight 4 × 4 unit and fills the canvas with it
as a pattern turned 45°, scaled so one period is exactly the canvas (unit √2 × wider, no seam).
Proven 2026-09-27: counts in Node (whole + ½ cut = area ÷ pitch² within 0.5 % on 100 and 400 m²);
texture pixel samples in Chrome (white tozzetti on even vertices, terracotta octagons on odd ones, a
point 2.8 cm from a tozzetto centre on both axes is still white, so square; exact wrap at 2048 px).
Not yet seen on the Quest. The tozzetto's half-diagonal
is the chamfer leg minus the joint's share, so the chamfer-to-tozzetto gap equals the joint. The
geometry already fits a real regular octagon: a 150 mm octagon's side is 150 / (1 + √2) = 62.1 mm,
the published 6.2 cm tozzetto.

The generic placeholder `octagon_200` (200 mm, white + black cabochon) was removed on 2026-09-26: the owner
chose Etruria as the real product. A saved finish that still names it shows as having no material
(every `materialById` caller handles null: no texture, no count). The 200 mm figures quoted above
were measured with that placeholder.

- `etruria_hex_octagon_mattone`: Etruria Design HEX, *Ottagono regolare* 15 × 15 in **MATTONE** with the
  *Tozzetto* 6.2 × 6.2 in **BIANCO** (owner's product; "terracotta" octagon, white tozzetto,
  2026-09-26).
  - From Etruria's HEX catalogue PDF (`wp-content/uploads/2016/04/ETRURIAdesign_HEXcollection_Catalogue.pdf`,
    pages 58–59): through-body coloured porcelain, 10 mm, not rectified, 17 colours.
  - Colours: Etruria's swatch photos `Etruria_Hex_col_Mattone.jpg` (mean #703f2f) and `…_Bianco.jpg`
    (#d4cfc4). The catalogue's printed swatches are lighter (#8f5844, #e6dfcd). The entry uses
    `0x7a4534` between the two, and BIANCO as is.
  - Look: the close-up `Etruria_Hex_amb_01.jpg` shows a matte, fine sandy surface with a softly rounded
    edge. The cellar `Etruria_Hex_amb_08.jpg` is this exact combination laid, with a thin light grout
    and a slight shade shift between tiles. A retailer sample (cristiani.it `Ottagono-Avorio.jpeg`)
    confirms the proportions.
  - **Estimates:** the joint (2 mm), the grout colour (`0xcfc8bc`) and the pack. Retailers sell the
    octagon per m² and the tozzetto per piece, so `pack: { pieces: 1 }` until the owner has the real
    box size.
  - Other options: BISCOTTO is the lighter terracotta; SUPER BIANCO is a whiter white.
  - Proven:
    - the build passes;
    - scratch renders beside the sample and the cellar photo;
    - takeoff (Node) of the upstairs bathroom 1.88 × 2.39 m = 208 octagons (180 whole, 28 cut) and
      221 tozzetti.
  - Not yet seen in View 3D on a real room or in AR.

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

Owner decisions (2026-09-26): a door product is a **material of a DOOR zone** (not a free-placed furniture item),
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
- **Lapeyre LINE \* acoustic door block, pre-painted white** (`door_line_acoustic_white`; source page ref
  2650701, the 204 × 73 cm push-left size; sold standard and made to measure, so the size comes from the
  zone). Spec sheet: 40 mm MDF leaf with a chipboard core, 92 × 44.6 mm frame section ("huisserie 90",
  no architrave), 3 steel pin hinges, lock for key or privacy, no glazing, 19.4 kg, passage 69 cm,
  handle sold separately. Design from Lapeyre's two straight front photos (zoom1 ids 202546627 push-left,
  202546631 push-right): three thin full-height grooves showing the raw MDF, at 14%, 23% and 32% of the
  leaf width from the lock edge, about 5 mm wide (photo estimates). The two roses sit about 1.06 m and
  0.98 m up (`roseDrop: 0.075`). No threshold (`threshold: false`), matte paint (`metalness: 0`).
  The builder still draws a lever handle; the photos show only the roses, since the handle is sold
  separately. Assumed: the grooves are on both faces (Hypothesis; the photos show one face). Proven
  2026-09-27 in a scratch preview: both faces, hinge left; the Ange-Line renders unchanged. Not yet
  seen in View 3D or AR.
- The door builder's frame face/depth, threshold, key-rose drop and paint finish are catalog fields
  (`frameFace`, `frameDepth`, `threshold`, `roseDrop`, `metalness`, `roughness`), defaulting to the
  Ange-Line's values.
- Limits: `door` zones only (not sliding or garage); the texture is stretched over the leaf, so
  the design scales with the opening's proportions.
- Open in View 3D (owner, 2026-09-27): desktop/mobile View 3D draws every DOOR zone's leaf swung
  90° open toward its swing side, a door product (`buildDoorProduct(p, {open: true})`, leaf +
  handles turned about the hinge line) and a plain zone alike (`buildArchitecturalFloor({openDoors})`:
  a 35 mm leaf per hinge at the jamb, `hinge: 'both'` = two half leaves). Hinge and swing come from
  `resolveApertureOrient`, as for the plan symbol. The AR 3D view (LEFT X) opens them too since
  2026-09-27 (owner asked, after expecting it on the Quest); before that AR kept them closed;
  sliding and garage zones stay closed slabs. Proven on a scratch render: each open leaf lies on the
  plan symbol's leaf line (hinge left/in, right/out, both). Not yet seen in the real app or on device.

### Rail-hung sliding doors (`mount: 'rail'`)

Owner request 2026-09-27: a surface-mounted sliding door on a wall rail. Set on a **SLIDING** zone in
MATERIAL · DOOR (which now also picks SLIDING zones; a SLIDING zone cycles only rail-hung products, a
DOOR zone only the others). The zone is the **opening** and keeps the existing SLIDING convention
(`apertureGlyph.js`): `swing` = the wall face carrying the rail, `hinge` = the side it slides to open
(PLAN · EDIT A/X cycles both). The leaf is the product's **fixed size** (`leafWidth`/`leafHeight`/
`leafDepth`), not made to measure; the AR readout shows `LEAF 0.83 × 2.04` and turns it red when the
opening is wider than the leaf. Closed = centred on the opening; open (View 3D and AR) = parked with
its leading edge on the jamb. `doorProductPlacements` passes the zone's wall `depth` so the rail sits on
the right face.

- **Postformé sliding door 83 on Indus rail, white** (`door_postforme_rail_white`, design
  `postforme`, `buildRailDoor` + `drawPostforme` in `src/ui/doorProducts.js`). **The full source
  list, every number's origin and the estimates are embedded in that code** (the owner's rule,
  `docs/product-modelling.md` step 6). In short:
  - leaf: [Leroy Merlin 60742675](https://www.leroymerlin.fr/produits/porte-coulissante-postforme-bois-h-204-x-l-83-cm-60742675.html),
    204 × 83 cm, 40 mm, white, honeycomb core, no handle supplied; the 3-panel layout measured on
    the straight photo media 4334229;
  - rail: [ARTENS Indus 2, Leroy Merlin 82002392](https://www.leroymerlin.fr/produits/rail-coulissant-indus-2-pour-porte-de-largeur-93-cm-maximum-artens-82002392.html),
    186 cm black steel, 4 cm deep; the manual (PDF media 3837502) gives the rail line at H + 4.8 cm,
    a 1 cm floor gap, spacers every 45 cm, rollers 12.5 cm in from each edge, the rail's start
    (90 − W) cm past the jamb; the drawing (4285352) 11.7 cm door top to roller top;
  - estimates: bar 40 × 6 mm, wheel Ø 59 mm, spacer blocks, the door centred under the bar.
  - No handle is modelled (none supplied). The floor guide and anti-jump blocks are not modelled.
  - Proven 2026-09-27: build; front and three-quarter renders, closed and open against a wall with
    an 80 cm opening, beside the studio photo (panel layout and proportions agree). Not yet seen
    in View 3D on a real plan or in AR.

## Windows (window products)

Same model as doors: a window product is a **material of a WINDOW zone**, stored as a `{rect}` finish on
the zone (`project.setWindowFinish`, an alias of `setDoorFinish`), authored in AR as
**MATERIAL · WINDOW**, made to measure from the zone (width, sill, head). No takeoff.

- Catalog entries: `surface: 'window'`, `pattern: 'window'`, `design` (the profile set in
  `src/ui/windowProducts.js`), `color` (PVC), `accent` (glass tint), `frameDepth`, `sashDepth`.
- **Leaves come from the zone's hinge**: left/right = one leaf hinged on that side, both = two leaves
  (the hinge the plan already cycles with the A/X flip). Tilt-and-turn vs casement is not modelled.
- 3D: `windowProductPlacements` (architectural3d.js) resolves centre, axis, width, sill, head, leaves,
  hinge end and the **room side**. That is the side whose probe point, 10 cm past the zone, is inside
  a ROOM rect, falling back to the zone's swing side when both or neither are. The builder puts the
  handle and hinges on that side. `buildArchitecturalFloor({productWindows})` skips the plain pane.
  The frame is centred in the zone's depth; real fitting (flush with the inside face, renovation
  frame) is not modelled.
- **Lapeyre Héméra, white PVC** (`window_hemera_white`), made to measure (page FPC5837268, 2026-09-26).
  - From the page: hidden sash ("ouvrant caché"), frame 80 mm and sash 84 mm deep, 4/20/4 glazing;
    leaves and opening type are chosen at order; the handle is sold separately.
  - Profile faces were measured on the straight-on photos: `202443669_2` (two leaves, inside),
    `202443668` (one leaf, inside) and `202443669_3` (two leaves, outside). The scale comes from the
    handle (about 160 mm), and the one- and two-leaf photos agree within 1 mm. Measurements:
    - inside: a 19 mm frame lip, then a 62 mm sash face;
    - outside: one 76 mm face (the sash is hidden);
    - two leaves: an 80 mm centre where they meet.
  - Also modelled: a white handle on the lock stile, or the centre on two leaves; three hinges per
    hinged side (two below 1 m); a black glazing gasket and drain caps outside.
  - **Estimates:** the handle size is the photo scale, and the colour is a white close to RAL 9016.
  - Proven 2026-09-26:
    - the build passes;
    - scratch renders beside the photos: one and two leaves, inside and outside;
    - the real desktop View 3D on an injected demo house: two leaves along X, one leaf along Y on
      both sides; handle and hinges face the room; no console errors.
  - Not yet seen in AR.
- **Product leaf count:** an entry with `leaves` always has that many (the zone's hinge only picks one
  or two leaves for products without it); `hinges` = hinges per side, evenly spaced. The AR readout
  uses the product's count.
- **Lapeyre Héméra porte-fenêtre, 2 leaves, white** (`window_hemera_pf2_white`; page
  [FPC8051131](https://www.lapeyre.fr/produits/porte-fenetre-pvc-blanc-hemera-sur-mesure-FPC8051131),
  plaxé variant [FPC8051135](https://www.lapeyre.fr/produits/porte-fenetre-pvc-plaxee-hemera-sur-mesure-FPC8051135),
  2026-09-27). The page's spec table is the window's (frame 80 mm, sash 84 mm, 4/20/4), and the
  straight photos (`202443671_3` white two-leaf, `202445455` plaxé two-leaf) show the same profile
  faces as the window. So it reuses the `hemera` profile with `leaves: 2, hinges: 5` (five per side
  in both photos). Drawn on a WINDOW zone with sill 0 (owner). Estimate: the handle at mid-height.
- **Lapeyre Néva aluminium sliding bay, 2 leaves, white** (`window_neva_white`, design `neva`; page
  [FPC804460](https://www.lapeyre.fr/produits/baie-coulissante-neva-aluminium-FPC804460), 2026-09-27). The owner first said "triple baie Héméra"; there is no sliding Héméra, and
  the owner corrected it to the 2-leaf Néva.
  - From the page: aluminium, standard 215 × 180 cm or made to measure, frame 100 mm, sash 36 mm,
    4/20/4, 2 leaves, handle supplied, colour "Blanc / Gris" (white modelled).
  - Faces measured on the straight photo `202600034_5` at about 2.55 mm/px, taking its frame as
    the 180 cm width (Hypothesis: the photo's size is not stated): frame 30 mm, sash stiles and top
    rail 45 mm, bottom rail 38 mm, 41 mm between the two glasses at the meeting stiles.
  - Model (`buildSliding`): the frame ring over the full depth; two sashes on two tracks 25 mm
    either side of the centre, the room-side one toward the zone's hinge end, overlapping the outer
    one at the meeting stiles; dark gaskets on both glass faces; a flat lever on the room sash's
    outer stile, a small dark pull on the outer sash. Drawn closed. Rails, rollers and the drainage
    sill are not modelled.
  - Proven 2026-09-27: build; front and three-quarter renders in a scratch preview beside the
    photos (both products). Not yet seen in View 3D or AR.

## Switches and outlets (device products)

Owner decisions (2026-09-27): a switch product is **a new material category that applies only to
switch markers**; outlets will get the same next. Only the visible part is modelled (the plate and the
rocker), never the mechanism inside the wall box, because it is invisible. Where switches overlap
(a double switch is two markers at one plan point), grip cycles them before the trigger selects.

- **Stored on the marker** (`marker.product` = a catalog id), not in `floor.finishes`: finish targets
  are rectangles, and a marker field follows save/load, floor copy/paste and deletion with no extra
  code. Additive field, no `FILE_VERSION` bump. `project.setMarkerProduct(markerId, id | null)`.
- Catalog entries: `surface: 'switch'`, `pattern: 'device'`, `design` (the builder in
  `src/ui/deviceProducts.js`), sizes as `*Mm` fields. `markerProduct(project, marker)` resolves a
  product only when its surface suits the marker type (`DEVICE_SURFACE`: switch → switch; outlet and
  outlet_appliance → outlet; ethernet → ethernet),
  so a stale id on another type is ignored.
- **Two detail levels** (`buildDeviceProduct(def, { detail })`). Desktop View 3D builds `full`: the
  plate lofted from 128 directions × ~19 rings, ~5 100–5 500 triangles per device. AR builds `low`
  (owner, 2026-10-03: fps fell to 10 in the kitchen after more outlets were set): 48 directions, 4
  slope and 2 collar rings, circle marks at half their segments, 1 170–1 420 triangles, same outline,
  heights and bounds (**Proven**, Node). On the owner's Ground floor (34 device products) devices were
  180k of the AR 3D view's ~190k triangles; `low` makes them ~45k. A new design must use `D.dirs`
  (through `ring`), `D.slope`/`D.collar` and `segs()` so it follows the level.
- 3D: View 3D draws the product in place of the standard 8 cm faceplate, at the same placement
  (`wallMarkerPlacements`: flush on the nearest wall face, facing the room); the AR 3D view (LEFT X)
  bakes it in the same way. The builder caches one model per entry and hands out clones sharing its
  geometry.
- AR: **MATERIAL · SWITCH**, **OUTLET**, **ETHERNET** (`mat_switch`, `mat_outlet`, `mat_ethernet`), see `docs/ar-survey.md`. Plan sheets and exports are
  unchanged.
- **Schneider Ovalis two-way switch, white** (`switch_ovalis_white`, Leroy Merlin 85231759, 2026-09-27).
  - From the page: 87 mm wide, 1 module, polycarbonate, made in Spain. The installation sheet is a
    wiring diagram only (media 3161952).
  - Shape (owner corrections, 2026-09-27): the rocker and its collar are **stadiums** (two half-circles
    joined by straight sides), the rocker has **two flat faces** (the upper one parallel to the wall, the
    lower one slanted, folded at the middle), and the plate is a **smooth pyramid**. Built as lofted rings between outlines (`deviceProducts.js`), not extrusions.
  - Measured on the photos (12.4 px/mm, scaled by the 87 mm width): the straight front (media 3162760)
    for outlines, and the side (3162765) for the profile, read row by row from its silhouette:
    - plate 4.4 mm at the rim, rising faster toward the middle to 8.1 mm at a 54 × 64 mm collar
      (the same at top and bottom), then 9.7 mm at the rocker opening;
    - rocker 43 × 52 mm: the upper face flat at 11 mm, the lower face slanting from the fold to
      13.8 mm at the bottom edge (the silhouette's slope starts at the middle; its upper half reads
      9.8–11.2 mm, taken as flat per the owner).
  - **Estimates:** every depth is a photo reading; the collar outline and the fold height are by eye;
    the maker's mark is not modelled.
  - Proven 2026-09-27:
    - the build passes;
    - Node: the product survives save/load and floor copy/paste; clearing works; an outlet ignores a
      switch product;
    - a scratch render beside the photos (front, side, angled, and a low view showing the fold): the
      side silhouette matches, bounding box 87 × 87 × 13.7 mm.
  - Not yet seen in the real View 3D or in AR.

- **Schneider Ovalis double two-way switch, white** (`switch_ovalis_double_white`, Leroy Merlin 85231783,
  2026-09-27). The same plate and rocker, with the rocker divided into two halves (owner); the split is
  ~0.5 mm on the straight front photo (media 3162824) and draws as a dark line on the faces
  (`rockers: 2`, `splitMm`).
  - **Double switch marker** (2026-09-28): a `switch_dual` marker takes only a two-rocker product
    (`productFitsMarker`) and carries it alone; the two-marker stack below still works for older surveys.
  - **One device, two markers (older surveys):** a double switch is surveyed as two switch markers at one plan point
    (one per rocker, so each drives its own light). MATERIAL · SWITCH sets or clears a multi-rocker
    product on that whole stack; going back to a single product keeps it on the selected marker only.
    `markerProductDraws` draws such a stack once, at the markers' mean height.
  - Proven 2026-09-27: build; Node (a two-marker stack draws once at the mean height, a separate single
    switch still draws); a scratch render beside the front and angled photos. Not yet seen in the real
    View 3D or in AR.

- **Schneider Ovalis flush outlet with earth, white** (`outlet_ovalis_white`, `surface: 'outlet'`,
  Leroy Merlin 85231773, 2026-09-27). Outlet products go on `outlet` and `outlet_appliance` markers
  (`DEVICE_SURFACE`); the shutter, aircon, cooktop, oven and water-heater variants are usually not
  sockets and keep the standard faceplate. Authored in AR with **MATERIAL · OUTLET** (`mat_outlet`,
  the same code path as SWITCH).
  - From the page: 87 mm wide, 44 mm deep (the mechanism, not modelled), 1 module.
  - Same plate and collar as the switches (`plate()` in `deviceProducts.js`, design `socket`). The side
    photo (media 3163218) repeats the switch's plate profile (4.4 mm rim, ~6 mm 7 mm in) and shows the
    insert nearly flat at ~9.9 mm, level with the collar opening ("affleurante" = flush).
  - Front photo (media 3163214, 12.4 px/mm): a stadium insert 42 × 53 mm in the rocker's place; the
    socket's round edge 38.7 mm across (a grey groove); two pin holes 19 mm apart (the French standard),
    ~5 mm, light grey with a darker rim; the earth pin 10.5 mm above the centre in a ~5.2 mm dark ring,
    metal tip. The socket details are flat marks on the insert, not holes.
  - Proven 2026-09-27: build; Node (the product applies to `outlet` and `outlet_appliance`, not to
    `outlet_shutter` or a switch); a scratch render beside the front, side and angled (3163217) photos,
    bounding box 87 × 87 × 10 mm. Not yet seen in the real View 3D or in AR.

- **Schneider Ovalis RJ45 socket, white** (`ethernet_ovalis_white`, `surface: 'ethernet'`, design `rj45`,
  Leroy Merlin 85231775, 2026-09-27). Ethernet products go on single `ethernet` markers only
  (`DEVICE_SURFACE`); `ethernet_dual` would need a double-socket product. Authored in AR with
  **MATERIAL · ETHERNET** (`mat_ethernet`, the same code path as SWITCH and OUTLET). Only the plate and
  the insert face are modelled (owner, again for this product).
  - From the page: 87 mm wide, 42.7 mm deep (the mechanism, not modelled), 1 module, "prise multimédia".
  - Same plate and flat insert as the outlet (`flatInsert()` in `deviceProducts.js`): the side photo
    (media 3211364) has the outlet's silhouette, and the insert measures 42.7 mm across on the front
    photo's middle row.
  - Front photo (media 3211372, 12.4 px/mm), positions from the insert's centre, y up: the fixing screw
    Ø7.6 mm at (−14.1, 5.6) with its slot at ~30°; the embossed icon disc Ø7.6 mm at (−4.4, 6.3), drawn
    as a faint ring (the icon itself is not modelled); the jack's dust cover 13.5 × 17.6 mm at
    (9.2, −8.0), drawn as a groove, with a raised pull tab 9 × 1.2 mm at (9.2, −14.5), 0.8 mm proud.
  - **Estimates:** the tab's height off the face and the screw slot's angle are by eye.
  - Proven 2026-09-27: build; Node (the product applies to `ethernet` only, not to `ethernet_dual`,
    `camera_ethernet`, outlets or switches; an outlet product is ignored on an Ethernet marker); a scratch
    render beside the front photo (front and angled), bounding box 87 × 87 × 10.7 mm. Not yet seen in the
    real View 3D or in AR.

## Open questions

- On the AR plan, a wall face's material is a swatch badge 12 cm inside the middle of the face (it was
  a coloured strip until 2026-09-27; the owner found full overlays hard to read).
