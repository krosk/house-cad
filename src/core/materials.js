// Surface-finish catalog (design: docs/materials.md). A material is one product: its
// laying pattern, piece size, joint and pack drive BOTH the quantity takeoff
// (src/core/flooring.js) and, later, the 3D texture — so the count and the picture
// can never disagree. Built-ins live here and are never stored; the owner's own
// products live on `project.materials` (same shape, saved with the house).
//
//   pattern  stagger (planks: rows, offcut starts the next row) | grid | brick (rows
//            offset half a piece) | octagon (octagon + cabochon at each lattice corner)
//            | paint (area only)
//   w, h     piece size in metres (octagon: w = octagon width); joint in metres
//   surface  floor | wall | both
//   pack     { pieces } per box, or { area } m² per pack (paint)
//   design   optional product look drawn by src/ui/finishTextures.js (plank: 'oak-rustic',
//            with `bevel` = long-edge V-bevel width, m; brick: 'handmade-gloss', with a
//            bump map in View 3D, `edgeWobble` m, `bumpScale`; grid: 'stone-sticks', a mosaic
//            sheet of `mosaic` = [cols, rows] sticks, with a bump map; octagon: 'porcelain-matte',
//            accent = the tozzetto colour, `grout` = the joint colour); `roughness` optional (3D)
//
// Door products (`surface: 'door'`, `pattern: 'door'`) go on a DOOR zone: `design`
// picks the leaf drawing in src/ui/doorProducts.js, `color` is the leaf/frame colour,
// `accent` the glass, `leafDepth` the leaf thickness (m). Made-to-measure: the size
// comes from the zone. No takeoff.
//
// Window products (`surface: 'window'`, `pattern: 'window'`) go on a WINDOW zone the same
// way: `design` picks the profile in src/ui/windowProducts.js, `color` the PVC, `accent`
// the glass tint, `frameDepth`/`sashDepth` the published profile depths. The zone's
// width, sill, head and hinge (both = two leaves) size it. No takeoff.
//
// Switch products (`surface: 'switch'`, `pattern: 'device'`) go on a switch MARKER
// (`marker.product`, not a finish): `design` picks the builder in src/ui/deviceProducts.js,
// which draws only the visible plate and rocker; sizes are `*Mm` fields. Outlet products
// (`surface: 'outlet'`) go on socket outlet markers the same way. No takeoff.

export const BUILTIN_MATERIALS = [
  {
    id: 'oak_plank', surface: 'floor', pattern: 'stagger', w: 1.2, h: 0.19, joint: 0,
    color: 0xc8a26b, accent: 0x8a6a3b, pack: { pieces: 8 },
    name: { en: 'Oak planks 120×19', fr: 'Parquet chêne 120×19', zh: '橡木地板 120×19' },
  },
  {
    id: 'tile_600', surface: 'floor', pattern: 'grid', w: 0.6, h: 0.6, joint: 0.003,
    color: 0x9ca3af, accent: 0x6b7280, pack: { pieces: 4 },
    name: { en: 'Tile 60×60', fr: 'Carrelage 60×60', zh: '地砖 60×60' },
  },
  {
    id: 'tile_300', surface: 'floor', pattern: 'grid', w: 0.3, h: 0.3, joint: 0.003,
    color: 0xe5e7eb, accent: 0x9ca3af, pack: { pieces: 11 },
    name: { en: 'Tile 30×30', fr: 'Carrelage 30×30', zh: '地砖 30×30' },
  },
  {
    id: 'wall_tile_200', surface: 'wall', pattern: 'grid', w: 0.2, h: 0.2, joint: 0.002,
    color: 0xf8fafc, accent: 0x94a3b8, pack: { pieces: 25 },
    name: { en: 'Wall tile 20×20', fr: 'Faïence 20×20', zh: '墙砖 20×20' },
  },
  {
    id: 'metro_150', surface: 'wall', pattern: 'brick', w: 0.15, h: 0.075, joint: 0.002,
    color: 0xffffff, accent: 0x9ca3af, pack: { pieces: 44 },
    name: { en: 'Metro tile 15×7.5', fr: 'Carreau métro 15×7,5', zh: '地铁砖 15×7.5' },
  },
  {
    id: 'paint_white', surface: 'wall', pattern: 'paint', w: 0, h: 0, joint: 0,
    color: 0xfafaf9, accent: 0xd6d3d1, pack: { area: 12 },
    name: { en: 'White paint', fr: 'Peinture blanche', zh: '白色涂料' },
  },
  {
    // Beaulieu Flooring engineered oak, natural, "charme" (rustic) grade, vitrified
    // (Leroy Merlin ref 92245930): 1180 × 164 mm, 14 mm thick (3.3 mm oak wear layer),
    // V-bevel on the 2 long sides, click, 8 planks = 1.548 m² per pack. Colour from the
    // product's room photo; bevel width is a photo estimate.
    id: 'oak_beaulieu_charme', surface: 'floor', pattern: 'stagger', design: 'oak-rustic',
    w: 1.18, h: 0.164, joint: 0, bevel: 0.002, thickness: 0.014,
    color: 0xc0a585, accent: 0x6a5038, roughness: 0.55, pack: { pieces: 8 },
    name: { en: 'Beaulieu oak charme 118×16.4', fr: 'Parquet chêne charme Beaulieu 118×16,4', zh: 'Beaulieu 橡木地板 118×16.4' },
  },
  {
    // GoodHome Vernisse wall tile, white gloss, "carreaux anciens" relief (Castorama EAN
    // 5036581063269): 301 × 75.4 mm, 8.5 mm, glazed ceramic, not rectified; 40 tiles =
    // 0.92 m² per box. White tile, white grout (owner); the joint width is an estimate.
    id: 'tile_vernisse_white', surface: 'wall', pattern: 'brick', design: 'handmade-gloss',
    w: 0.301, h: 0.0754, joint: 0.003, thickness: 0.0085,
    color: 0xf4f4f0, accent: 0xf8f8f5, roughness: 0.12, bumpScale: 3, pack: { pieces: 40 },
    name: { en: 'Vernisse white tile 30×7.5', fr: 'Faïence Vernisse blanc 30×7,5', zh: 'Vernisse 白色墙砖 30×7.5' },
  },
  {
    // Etruria Design HEX (through-body porcelain, matte, 10 mm): Ottagono regolare 15×15
    // in MATTONE (terracotta) with the 6.2×6.2 Tozzetto in BIANCO at each corner (owner's
    // choice of product and colours). Colours from Etruria's swatch photos; the joint,
    // grout colour and pack size are estimates (the retailer sells per m² / per piece).
    id: 'etruria_hex_octagon_mattone', surface: 'floor', pattern: 'octagon', design: 'porcelain-matte',
    w: 0.15, h: 0.15, joint: 0.002, thickness: 0.01,
    color: 0x7a4534, accent: 0xd4cfc4, grout: 0xcfc8bc, roughness: 0.85, bumpScale: 1.5, pack: { pieces: 1 },
    name: { en: 'Etruria HEX octagon Mattone + white tozzetto 15', fr: 'Etruria HEX octogone Mattone + cabochon blanc 15', zh: 'Etruria HEX 八角砖 砖红 + 白色小方砖 15' },
  },
  {
    // GoodHome Blue stone mosaic, light grey (Castorama EAN 5036581066864): natural stone,
    // matte, not rectified, wall and floor; sold per 30 × 30.4 cm sheet, 8 mm thick. A
    // sheet is 3 × 18 sticks, about 98 × 15 mm with 2 mm joints (measured on the top-down
    // photo). Stone colour from that photo (a mid grey despite "gris clair"); light grout
    // from the retailer's laid renders.
    id: 'mosaic_blue_stone', surface: 'both', pattern: 'grid', design: 'stone-sticks', mosaic: [3, 18],
    w: 0.30, h: 0.304, joint: 0.002, thickness: 0.008,
    color: 0x686767, accent: 0xe2e0dd, roughness: 0.8, bumpScale: 2, pack: { pieces: 1 },
    name: { en: 'Blue stone mosaic 30×30.4', fr: 'Mosaïque Blue stone gris clair 30×30,4', zh: 'Blue stone 马赛克 30×30.4' },
  },
  {
    // Polished marble-cement terrazzo tile 60 × 60 (owner's choice; size from the owner).
    // Look from the owner's 8 × 8 cm sample photo (2026-09-27): off-white cement with
    // greige, white-grey and a few peach marble chips up to ~13 mm. Joint, thickness,
    // grout colour, finish and pack are estimates (no product page).
    id: 'terrazzo_marble_cream', surface: 'floor', pattern: 'grid', design: 'terrazzo', sheets: 2,
    w: 0.6, h: 0.6, joint: 0.002, thickness: 0.02,
    color: 0xf3f4ee, accent: 0xe4e3da, roughness: 0.35, bumpScale: 1,
    chips: [[0xd0c6b6, 5], [0xdcd8cf, 3], [0xc2b8a7, 2], [0xdbc6b0, 0.6], [0xcecbc3, 1]],
    pack: { pieces: 1 },
    name: { en: 'Terrazzo marble cream 60×60', fr: 'Terrazzo marbre ciment crème 60×60', zh: '水磨石 奶白 60×60' },
  },
  {
    // Lapeyre Ange-Line aluminium entrance door, made to measure; RAL 7016-like
    // anthracite with satin triple glazing (product photos, 2026-09-26).
    id: 'door_ange_line', surface: 'door', pattern: 'door', design: 'ange-line',
    w: 0, h: 0, joint: 0, leafDepth: 0.085,
    color: 0x3c4146, accent: 0xf1f4f7, pack: null,
    name: { en: 'Lapeyre Ange-Line door', fr: 'Porte Ange-Line Lapeyre', zh: 'Lapeyre Ange-Line 入户门' },
  },
  {
    // Lapeyre LINE * acoustic door block, pre-painted white (ref 2650701 is the 204 × 73
    // left-hand size; standard and made to measure, so the size comes from the zone): 40 mm
    // leaf, 92 × 44.6 mm frame, three raw-MDF grooves near the lock edge, no threshold.
    id: 'door_line_acoustic_white', surface: 'door', pattern: 'door', design: 'line',
    w: 0, h: 0, joint: 0, leafDepth: 0.04, frameFace: 0.0446, frameDepth: 0.092,
    threshold: false, roseDrop: 0.075, metalness: 0, roughness: 0.7,
    color: 0xf3f3f1, accent: 0xb49f80, pack: null,
    name: { en: 'Lapeyre LINE acoustic door, white', fr: 'Bloc-porte LINE acoustique Lapeyre, blanc', zh: 'Lapeyre LINE 隔音门（白）' },
  },
  {
    // Lapeyre Héméra PVC window, white, made to measure (FPC5837268, 2026-09-26): hidden
    // sash ("ouvrant caché"), frame 80 mm and sash 84 mm deep, 4/20/4 glazing. Profile
    // faces measured on the product photos (src/ui/windowProducts.js PROFILES.hemera).
    id: 'window_hemera_white', surface: 'window', pattern: 'window', design: 'hemera',
    w: 0, h: 0, joint: 0, frameDepth: 0.08, sashDepth: 0.084,
    color: 0xf5f5f3, accent: 0xcfe0e6, pack: null,
    name: { en: 'Lapeyre Héméra PVC window, white', fr: 'Fenêtre PVC Héméra Lapeyre, blanc', zh: 'Lapeyre Héméra 白色 PVC 窗' },
  },
  {
    // Schneider Electric Ovalis two-way switch, white (Leroy Merlin 85231759): 87 mm square
    // polycarbonate plate, one oval rocker. Depths and rocker size measured on the Leroy
    // Merlin photos (docs/materials.md "Switches").
    id: 'switch_ovalis_white', surface: 'switch', pattern: 'device', design: 'rocker',
    w: 0.087, h: 0.087, joint: 0, plateMm: 87, plateCornerMm: 10, rimDepthMm: 4.4,
    collarMm: [54, 64], collarDepthMm: 8.1, openingDepthMm: 9.7, rockerMm: [43, 52],
    rockerTopMm: 11, rockerBottomMm: 13.8, rockerFoldMm: 0,
    color: 0xf2f2f0, roughness: 0.35, pack: null,
    name: { en: 'Schneider Ovalis switch, white', fr: 'Interrupteur Ovalis Schneider, blanc', zh: '施耐德 Ovalis 开关（白）' },
  },
  {
    // Schneider Electric Ovalis double two-way switch, white (Leroy Merlin 85231783): the
    // same plate and rocker, split into two halves (a ~0.5 mm gap on the front photo).
    id: 'switch_ovalis_double_white', surface: 'switch', pattern: 'device', design: 'rocker',
    w: 0.087, h: 0.087, joint: 0, plateMm: 87, plateCornerMm: 10, rimDepthMm: 4.4,
    collarMm: [54, 64], collarDepthMm: 8.1, openingDepthMm: 9.7, rockerMm: [43, 52],
    rockerTopMm: 11, rockerBottomMm: 13.8, rockerFoldMm: 0,
    rockers: 2, splitMm: 0.5,
    color: 0xf2f2f0, roughness: 0.35, pack: null,
    name: { en: 'Schneider Ovalis double switch, white', fr: 'Double interrupteur Ovalis Schneider, blanc', zh: '施耐德 Ovalis 双联开关（白）' },
  },
  {
    // Schneider Electric Ovalis flush outlet with earth, white (Leroy Merlin 85231773): the
    // same plate and collar as the switches; a flat stadium insert in the rocker's place
    // carries the French socket (two pin holes 19 mm apart, earth pin above). Measured on
    // the Leroy Merlin photos (docs/materials.md "Switches").
    id: 'outlet_ovalis_white', surface: 'outlet', pattern: 'device', design: 'socket',
    w: 0.087, h: 0.087, joint: 0, plateMm: 87, plateCornerMm: 10, rimDepthMm: 4.4,
    collarMm: [54, 64], collarDepthMm: 8.1, openingDepthMm: 9.7, rockerMm: [43, 52],
    insertDepthMm: 9.9, socketMm: 38.7, pinHoleMm: 5, pinSpacingMm: 19, earthMm: [10.5, 5.2],
    color: 0xf2f2f0, roughness: 0.35, pack: null,
    name: { en: 'Schneider Ovalis flush outlet, white', fr: 'Prise affleurante Ovalis Schneider, blanc', zh: '施耐德 Ovalis 平装插座（白）' },
  },
  {
    // Schneider Electric Ovalis RJ45 socket, white (Leroy Merlin 85231775): the outlet's
    // plate and flat insert (same front and side silhouettes on the photos), carrying the
    // fixing screw, the embossed icon disc and the jack's dust cover with its pull tab.
    // Measured on the Leroy Merlin front photo (docs/materials.md "Switches").
    id: 'ethernet_ovalis_white', surface: 'ethernet', pattern: 'device', design: 'rj45',
    w: 0.087, h: 0.087, joint: 0, plateMm: 87, plateCornerMm: 10, rimDepthMm: 4.4,
    collarMm: [54, 64], collarDepthMm: 8.1, openingDepthMm: 9.7, rockerMm: [43, 52],
    insertDepthMm: 9.9, screwMm: [-14.1, 5.6, 7.6], screwSlotDeg: 30, iconMm: [-4.4, 6.3, 7.6],
    coverMm: [9.2, -8, 13.5, 17.6], tabMm: [9.2, -14.5, 9, 1.2],
    color: 0xf2f2f0, roughness: 0.35, pack: null,
    name: { en: 'Schneider Ovalis RJ45 socket, white', fr: 'Prise RJ45 Ovalis Schneider, blanc', zh: '施耐德 Ovalis RJ45 网口（白）' },
  },
];

export function allMaterials(project) {
  return [...BUILTIN_MATERIALS, ...(project?.materials || [])];
}

export function materialById(project, id) {
  if (!id) return null;
  return allMaterials(project).find((m) => m.id === id) || null;
}

// Materials offered for a surface ('floor' | 'wall'), catalog order.
export function materialsFor(project, surface) {
  return allMaterials(project).filter((m) => m.surface === surface || m.surface === 'both');
}

// The product a marker carries (`marker.product`), if it suits the marker's type:
// switch products on switch markers, outlet products on plain socket outlets (the
// shutter/aircon/cooktop/oven/water-heater variants are usually not sockets), Ethernet
// products on single Ethernet sockets (a dual socket is a different product).
export const DEVICE_SURFACE = { switch: 'switch', outlet: 'outlet', outlet_appliance: 'outlet', ethernet: 'ethernet' };
export function markerProduct(project, marker) {
  const surface = DEVICE_SURFACE[marker?.type];
  const def = surface ? materialById(project, marker.product) : null;
  return def && def.surface === surface ? def : null;
}

// What to draw for a floor's markers: Map markerId → { def, z }, or null for a marker
// drawn by another. A double switch is surveyed as two switch markers at one plan point
// (one per rocker); when they carry the same multi-rocker product it draws once, at
// their mean height (docs/materials.md "Switches").
export function markerProductDraws(project, markers) {
  const out = new Map();
  const zOf = (m) => (Number.isFinite(m.z) ? m.z : 1.1);
  for (const m of markers) {
    if (out.has(m.id)) continue;
    const def = markerProduct(project, m);
    if (!def) continue;
    if ((def.rockers ?? 1) > 1) {
      const stack = markers.filter((o) => o.x === m.x && o.y === m.y && markerProduct(project, o)?.id === def.id);
      for (const o of stack) out.set(o.id, null);
      out.set(m.id, { def, z: stack.reduce((sum, o) => sum + zOf(o), 0) / stack.length });
    } else {
      out.set(m.id, { def, z: zOf(m) });
    }
  }
  return out;
}

export function materialName(material, lang = 'en') {
  const n = material?.name;
  if (!n) return material?.id || '';
  return typeof n === 'string' ? n : (n[lang] || n.en || material.id);
}
