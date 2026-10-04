// IKEA METOD kitchen units assembled from IKEA's own part models (owner, 2026-10-04: "the
// outer shell of those furnitures"; reuse IKEA's models). One catalog entry per planner unit
// (`kitchen: <id>` in public/furniture/index.json) sits on one FURNITURE zone. Its parts are
// rotera GLBs loaded by bare article id through the furniture proxy (docs/furniture.md), plus
// a few plain boxes where IKEA publishes no model. Only the outside is modelled: carcass,
// fronts, handles, plinth, cover panels, worktop, sink and tap; no drawers or shelves inside.
//
// Sources: the owner's IKEA Kitchen Planner export "Maison 2" (design C65F817E-…, printed
// 2026-10-04): article list p. 2–28, front views p. 29–30, top view p. 33, worktop p. 34.
// Every GLB measured from its bounding box (rotera `<article>-mini.glb`, fr/fr), 2026-10-04:
//   METOD base 60x60x80 502.056.26 / 702.135.69   600 × 802 × 600, front +z, floor y = 0
//   METOD base 30x60x80 504.171.95 300 × 802 × 600; 40x60x80 802.134.32 400 × 802 × 600
//   METOD corner base 128x60x80 405.967.53        1275 × 804 × 675: door opening at −x, blind
//                                                 part at +x, a filler stub 75 mm proud at the
//                                                 junction (mirrored here: blind in the corner)
//   METOD high 60x60x200 902.135.68                600 × 2000 × 601
//   METOD top cabinet 60x60x40 402.055.37          lying on its back (front +y): 600 × 600 × 400
//   METOD wall 60x37x100 202.055.38 / 40 502.055.32 lying on its back: 600|400 × 376 × 1000
//   SINARP door 30/40/60x80 605.951.68 / 005.951.71 / 505.951.78   297|397|597 × 797 × 17
//   SINARP drawer front 60x40 005.951.90 597 × 397 × 17; 60x20 205.951.89 597 × 197 × 17
//   SINARP cover panel 62x240 205.951.65 615 × 2400 × 13; 62x80 705.951.63 615 × 800 × 13;
//     39x240 905.951.62 390 × 2400 × 13 (cut into the 57 mm filler, unit 1)
//   SINARP plinth 220x8 406.111.88 2201 × 82 × 10
//   BAGGANÄS handle 143 703.384.18 143 × 35 × 15 (lying, standoff +y); knobs 20 / 21 mm
//     103.384.21 / 903.384.22
//   SÄLJAN worktop 246x3.8 805.568.73 2460 × 38 × 636; HAVSEN sink 803.778.43 535 × 202 × 467;
//   TAKSJÖN tap 506.023.05 130 × 470 × 280; TORSBODA dishwasher 405.480.88 605 × 868 × 551
// No rotera model (404 in fr/fr, gb/en, us/en): ASPUDDEN doors 006.488.53, 206.488.52,
//   206.488.47, 406.488.46 → the owner's suggested framed fronts of one range, 605.950.50
//   (60x80: 597 × 797 × 19) for the 60-high doors and 005.950.48 (60x40: 597 × 397 × 20) for
//   the 40-high ones, a thin raised frame like ASPUDDEN's, scaled to size (the 40-wide doors
//   narrow the frame) and painted matt white; FÖRBÄTTRA
//   panel 006.488.72 → a matt-white 12 mm board. Oven and microwave: none in the list; the
//   owner chose generic placeholders (black glass fronts, steel bar).
// Layout from the front views (mm): legs 80, carcass 802, worktop 38 (top at 920), 560 gap,
// wall cabinets 1000 (1480–2480), tall unit 2400 (80–2480). Fronts stack from 1.5 mm above
// the carcass bottom with 3 mm gaps (40 + 20 + 20 = 797). Handles: horizontal bars centred
// 30 mm below each base front's top edge; the tall door's bar vertical at its hinge-free edge,
// 100 mm up; knobs near the lower inner corner of each wall door (pairs at the 10|11 and 12|13
// junctions, unit 14 on its left), unit 9 a knob top-left. Hypothesis: the drawings show more
// pulls (14 bars, 11 knobs) than the list (7 bars, 6 knobs); the drawings are followed.
// Plinth set 40 mm behind the carcass front (Hypothesis, not in the planner). Legs are hidden
// behind the plinth and not drawn.
import * as THREE from 'three';

const LEG = 80, BASE = 802, GAP = 3, T = 17;
const BASE_D = 620; // footprint depth: carcass 600 + 2 mm hinge gap + 17 mm front
const WALL_D = 395; // wall carcass 376 + 2 + 17
const FRONT_Z = BASE_D / 2 - T / 2 - 0.5; // front centre (z), base units
const FACE = BASE_D / 2 - 1; // front face, where pulls sit
const WALL_FRONT_Z = WALL_D / 2 - T / 2 - 0.5, WALL_FACE = WALL_D / 2 - 1;
const Y0 = LEG + 1.5; // bottom edge of the lowest base front

const DOOR80 = { 30: '60595168', 40: '00595171', 60: '50595178' };
const DRAWER = { 40: '00595190', 20: '20595189' }; // 60 cm wide
const HANDLE = '70338418', KNOB20 = '10338421', KNOB21 = '90338422';
const PULL = [['x', 90]]; // a pull lies with its standoff up (+y): stand it on the front (+z)

// A part: { a: article | box: [w, h, d] (mm, origin bottom-centre), at: [x, y, z] mm,
// rot: [[axis, deg], …] applied in order, scale: [sx, sy, sz], paint: name }.
const handle = (x, y, z = FACE, vertical = false) => ({ a: HANDLE, at: [x, y, z], rot: vertical ? [...PULL, ['z', 90]] : PULL });
const knob = (a, x, y, z) => ({ a, at: [x, y, z], rot: PULL });

// Base-unit fronts, bottom → top: heights in cm (80 door, 40 / 20 drawer fronts) of width w.
function baseFronts(w, heights, { x = 0, pulls = true } = {}) {
  const parts = [];
  let y = Y0;
  for (const h of heights) {
    const hh = h * 10 - 3;
    parts.push({ a: h === 80 ? DOOR80[w] : DRAWER[h], at: [x, y, FRONT_Z] });
    if (pulls) parts.push(handle(x, y + hh - 30));
    y += hh + GAP;
  }
  return parts;
}
const plinth = (w, x = 0) => ({ a: '40611188', at: [x, 0, BASE_D / 2 - 19 - 40], scale: [w / 2201, 1, 1] });
const carcass = (a, x = 0) => ({ a, at: [x, LEG, -BASE_D / 2 + 300] });
// A cover panel on a unit's side (side = −1 left, +1 right as seen from the front).
const sidePanel = (a, xFace, side, y, depth = 615) => ({ a, at: [xFace + side * 6.5, y, -BASE_D / 2 + depth / 2], rot: [['y', 90]] });

// A wall cabinet (lying model stood up: +90° about x maps its front +y onto +z).
function wallUnit(w, a, { knobsAt }) {
  const parts = [{ a, at: [0, 500, -WALL_D / 2], rot: [['x', 90]] }];
  // ASPUDDEN fronts: the framed stand-in, 60 cm door below, 40 cm above.
  let y = 1.5;
  for (const h of [60, 40]) {
    const hh = h * 10 - 3, fw = w - 3;
    const [a, mh, mt] = h === 40 ? ['00595048', 397, 20] : ['60595050', 797, 19];
    parts.push({ a, at: [0, y, WALL_FRONT_Z], scale: [fw / 597, hh / mh, T / mt], paint: 'aspudden' });
    for (const side of knobsAt) parts.push(knob(KNOB21, side * (fw / 2 - 40), y + 40, WALL_FACE));
    y += hh + GAP;
  }
  return parts;
}

// Generic built-in oven (595 × 595) and microwave (595 × 388): glass fronts with a steel bar.
const oven = (y) => [
  { box: [595, 595, 22], at: [0, y, FRONT_Z + 2], paint: 'glass' },
  { box: [480, 18, 26], at: [0, y + 595 - 70, FACE + 14], paint: 'steel' },
];
const microwave = (y) => [
  { box: [595, 388, 22], at: [0, y, FRONT_Z + 2], paint: 'glass' },
  { box: [18, 300, 26], at: [250, y + 44, FACE + 14], paint: 'steel' },
];

// SÄLJAN worktop slices (the 2460 model scaled to each piece; the stone figure stretches a little).
const top = (x0, x1, z0, z1) => ({ a: '80556873', at: [(x0 + x1) / 2, 0, (z0 + z1) / 2], scale: [(x1 - x0) / 2460, 1, (z1 - z0) / 636] });

// Units by planner number. size [w, h, d] mm is the footprint the zone takes (d = depth).
export const KITCHEN_UNITS = {
  // 1: filler strip between the tall unit and the wall, cut from a SINARP 39x240 panel.
  'filler-57': { size: [57, 2480, BASE_D], parts: () => [
    { a: '90595162', at: [0, LEG, FRONT_Z], scale: [57 / 390, 1, 1] },
  ] },
  // 2: ME/MA 735 tall unit for oven + microwave: high cabinet + top cabinet, drawers 40 + 20
  // below, the 1000 mm appliance opening, a 60x80 door on top; SINARP 62x240 panel on its left.
  'tall-oven-735': { size: [613, 2480, BASE_D], parts: () => {
    const x = 6.5; // the cabinet; the 13 mm panel takes the left
    return [
      carcass('90213568', x),
      { a: '40205537', at: [x, LEG + 2000 + 200, -BASE_D / 2], rot: [['x', 90]] },
      ...baseFronts(60, [40, 20], { x }),
      ...oven(Y0 + 600).map((p) => ({ ...p, at: [x + p.at[0], p.at[1], p.at[2]] })),
      ...microwave(Y0 + 600 + 598).map((p) => ({ ...p, at: [x + p.at[0], p.at[1], p.at[2]] })),
      { a: DOOR80[60], at: [x, LEG + 2400 - 1.5 - 797, FRONT_Z] },
      handle(x + 299 - 25, LEG + 2400 - 1.5 - 797 + 100, FACE, true),
      sidePanel('20595165', -300, 0, LEG),
      plinth(613),
    ];
  } },
  // 3: ME 219, 30 cm pull-out: one door, bar on top.
  'base-30-pullout-219': { size: [300, 882, BASE_D], parts: () => [
    carcass('50417195'), ...baseFronts(30, [80]), plinth(300),
  ] },
  // 4: ME/MA 431, cooktop base: drawer fronts 40 + 20 + 20.
  'base-60-cooktop-431': { size: [600, 882, BASE_D], parts: () => [
    carcass('70213569'), ...baseFronts(60, [40, 20, 20]), plinth(600),
  ] },
  // 5: ME/MA 145, drawers: fronts 40 + 20 + 20.
  'base-60-drawers-145': { size: [600, 882, BASE_D], parts: () => [
    carcass('50205626'), ...baseFronts(60, [40, 20, 20]), plinth(600),
  ] },
  // 6: ME 189, corner base 128: the carcass mirrored so the blind part (with IKEA's filler
  // stub) is in the corner (−x); the 60x80 door on the open part (+x), bar on top.
  'corner-128-189': { size: [1275, 882, BASE_D], parts: () => [
    { a: '40596753', at: [0, LEG, -BASE_D / 2 + 337.5], scale: [-1, 1, 1] },
    ...baseFronts(60, [80], { x: 637.5 - 301.5 }),
    plinth(1275),
  ] },
  // 7: ME/MA 196, sink base: two 40 cm drawer fronts.
  'base-60-sink-196': { size: [600, 882, BASE_D], parts: () => [
    carcass('70213569'), ...baseFronts(60, [40, 40]), plinth(600),
  ] },
  // 8: ME 1002, TORSBODA integrated dishwasher behind a 60x80 door.
  'dishwasher-60-1002': { size: [600, 882, BASE_D], parts: () => [
    { a: '40548088', at: [0, 0, -BASE_D / 2 + 275.5] }, ...baseFronts(60, [80]), plinth(600),
  ] },
  // 9: ME 104, 40 cm wire baskets: door, knob top-left; SINARP 62x80 panel on its right (the
  // run's free end).
  'base-40-baskets-104': { size: [413, 882, BASE_D], parts: () => {
    const x = -6.5;
    return [
      carcass('80213432', x), ...baseFronts(40, [80], { x, pulls: false }),
      knob(KNOB20, x - 199 + 35, Y0 + 797 - 35, FACE),
      sidePanel('70595163', 200 + x, 1, LEG),
      plinth(413),
    ];
  } },
  // 10–13: ME 313, wall 60x100, knobs on the inner edge (10, 12 right; 11, 13 left).
  'wall-60-313-r': { size: [600, 1000, WALL_D], parts: () => wallUnit(600, '20205538', { knobsAt: [1] }) },
  'wall-60-313-l': { size: [600, 1000, WALL_D], parts: () => wallUnit(600, '20205538', { knobsAt: [-1] }) },
  // 14: ME 312, wall 40x100, knobs left; FÖRBÄTTRA 39x101 panel (white board) on its right.
  'wall-40-312': { size: [412, 1000, WALL_D], parts: () => [
    ...wallUnit(400, '50205532', { knobsAt: [-1] }).map((p) => ({ ...p, at: [p.at[0] - 6, p.at[1], p.at[2]] })),
    { box: [12, 1010, 390], at: [200, -5, -WALL_D / 2 + 195], paint: 'aspudden' },
  ] },
  // Worktop A, along the sink wall: 2903 × 635, corner square included; HAVSEN sink centred
  // 1575 from the corner end (planner p. 34: 635 + 940), cut-out 515 × 447 with 88 behind it;
  // TAKSJÖN tap centred behind the bowl.
  'worktop-a-2903-sink': { size: [2903, 38, 635], parts: () => {
    const L = 2903 / 2, D = 635 / 2, sx = -L + 1575, c0 = sx - 257.5, c1 = sx + 257.5;
    const z0 = -D + 88, z1 = z0 + 447;
    return [
      top(-L, c0, -D, D), top(c1, L, -D, D), top(c0, c1, -D, z0), top(c0, c1, z1, D),
      { a: '80377843', at: [sx, 38 + 3 - 202, (z0 + z1) / 2] },
      { a: '50602305', at: [sx, 38, -D + 44] },
    ];
  } },
  // Worktop B, along the cooktop wall: 1540 × 635 (planner p. 34: 2175 − 635).
  'worktop-b-1540': { size: [1540, 38, 635], parts: () => [top(-770, 770, -317.5, 317.5)] },
};

export const isKitchenUnit = (entry) => !!(entry && KITCHEN_UNITS[entry.kitchen]);

const PAINTS = {
  aspudden: () => new THREE.MeshStandardMaterial({ color: 0xf0efe9, roughness: 0.85, metalness: 0 }),
  glass: () => new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.12, metalness: 0.2 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0xb8bbbe, roughness: 0.35, metalness: 0.9 }),
};

// Every article a unit needs (for preloading / tests).
export const kitchenUnitArticles = (entry) =>
  [...new Set(KITCHEN_UNITS[entry.kitchen].parts().filter((p) => p.a).map((p) => p.a))];

// Assemble a unit as one Group (metres, Y up, front +z, footprint centred on the origin, floor
// y = 0), like any furniture source. `loadArticle(article)` resolves a part's source scene; a
// part that fails to load is skipped (logged), so one missing model never hides the unit.
export async function assembleKitchenUnit(entry, loadArticle) {
  const parts = KITCHEN_UNITS[entry.kitchen].parts();
  const group = new THREE.Group();
  const sources = await Promise.all(parts.map((p) => (p.a ? loadArticle(p.a).catch((error) => {
    console.warn('[kitchen] part failed', p.a, error);
    return null;
  }) : null)));
  parts.forEach((p, i) => {
    let object;
    if (p.box) {
      const [w, h, d] = p.box.map((v) => v / 1000);
      object = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), PAINTS[p.paint]());
    } else if (sources[i]) {
      object = sources[i].clone();
      if (p.paint) object.traverse((o) => { if (o.isMesh) o.material = PAINTS[p.paint](); });
    } else return;
    const pivot = new THREE.Group();
    pivot.add(object);
    object.scale.set(...(p.scale || [1, 1, 1]));
    for (const [axis, deg] of p.rot || []) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), THREE.MathUtils.degToRad(deg));
      pivot.quaternion.premultiply(q);
    }
    pivot.position.set(...p.at.map((v) => v / 1000));
    group.add(pivot);
  });
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}
