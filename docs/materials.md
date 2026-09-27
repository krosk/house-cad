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
     on a solid 3D wall, just in front of it. The 1 exception was the half-wall gap above, fixed since
     (Proven, Node, 2026-09-27: r106's top face is back to 3.30 m², the gap wall solid at 2 m).
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

## Octagon + tozzetto products

An `octagon` entry with a `design` draws OCT_CELLS × OCT_CELLS (4 × 4) octagons in `color` with a tozzetto
diamond in `accent` at every lattice corner, on `grout`, plus a bump map. The tozzetto's half-diagonal
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
- Limits: `door` zones only (not sliding or garage); the leaf is drawn closed; the texture is
  stretched over the leaf, so the design scales with the opening's proportions.

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
  - **One device, two markers:** a double switch is surveyed as two switch markers at one plan point
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

- Until the AR 3D view exists, AR shows a wall face's material as a coloured strip along its edge on
  the floor plan.
