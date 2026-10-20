// Door products (docs/materials.md "Doors"): a catalog material with
// `surface: 'door'` set on a DOOR zone builds that product's leaf and frame in 3D,
// sized by the opening (made-to-measure doors take the opening's size). The design
// is inferred from product photos: no manufacturer 3D model exists.
//
// `placement` comes from doorProductPlacements (architectural3d.js). Returns plain
// Meshes whose geometry already carries the plan → world transform (plan (x, y) →
// world (x, up, −y), floor at y = 0), so a caller adds them beside its other
// architectural meshes and only lifts them by the floor elevation.

import * as THREE from 'three';
import { paintedTexture } from './paintedTexture.js';

// Defaults (the Ange-Line); a catalog entry may override each: `frameFace`, `frameDepth`,
// `threshold` (false = none), `roseDrop` (the key rose below the handle), `metalness`,
// `roughness`, and `leafInset`: the distance from the zone (the frame's outside) to each
// vertical edge of the leaf when the leaf sits in a rebate of the jambs (owner, 2026-10-20:
// a LINE frame 78 cm outside holds a 73 cm leaf, so 2.5 cm). Without it the leaf fits
// between the jambs (zone − 2 × frame face − 6 mm), as on the Ange-Line.
const FRAME_DEFAULT = 0.05;       // dormant (frame) face width
const FRAME_DEPTH_DEFAULT = 0.08; // dormant depth (Ange-Line: 80 mm)
const HANDLE_Z = 1.05;    // handle height above the floor

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;
const shade = (hex, f) => `#${new THREE.Color(hex).multiplyScalar(f).getHexString()}`;

// Ange-Line face, lock edge at canvas x = 0, hinge edge at x = S·W. A full-height
// groove near the lock edge; a satin-glass half-lens between the groove and an arc
// bulging toward the hinge; the arc's circle continues past the glass as grooves
// running to the lock-edge corners (Lapeyre product photos).
function drawAngeLine(ctx, W, H, def) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(def.color, 1.12));
  g.addColorStop(1, shade(def.color, 0.9));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const grooveX = 0.2 * W, y1 = 0.1 * H, y2 = 0.88 * H, sag = 0.36 * W;
  const c = (y2 - y1) / 2, R = (c * c + sag * sag) / (2 * sag);
  const cx = grooveX + sag - R, cy = (y1 + y2) / 2;
  // Glass: the circle clipped to the right of the groove.
  ctx.save();
  ctx.beginPath(); ctx.rect(grooveX, 0, W - grooveX, H); ctx.clip();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  const glass = ctx.createLinearGradient(0, y1, 0, y2);
  glass.addColorStop(0, css(def.accent));
  glass.addColorStop(0.5, shade(def.accent, 1.06));
  glass.addColorStop(1, shade(def.accent, 0.94));
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.restore();
  // Grooves: the vertical line and the whole arc across the leaf.
  ctx.strokeStyle = shade(def.color, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(grooveX, 0.015 * H); ctx.lineTo(grooveX, 0.985 * H); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.rect(0.03 * W, 0.015 * H, W * 0.97, H * 0.97); ctx.clip();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// LINE face (Lapeyre LINE * acoustic door block): flat paint, lock edge at canvas x = 0,
// three thin full-height grooves near the lock edge showing the raw MDF (`accent`).
// Positions are fractions of the leaf width from the lock edge, measured on Lapeyre's
// straight front photo (docs/materials.md).
const LINE_GROOVES = [0.141, 0.232, 0.319];
function drawLine(ctx, W, H, def) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(def.color, 1.0));
  g.addColorStop(1, shade(def.color, 0.97));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const gw = Math.max(1.5, 0.007 * W); // about 5 mm on a 730 mm leaf
  for (const f of LINE_GROOVES) {
    const x = f * W;
    ctx.fillStyle = css(def.accent);
    ctx.fillRect(x - gw / 2, 0, gw, H);
    ctx.fillStyle = shade(def.accent, 0.7); // shadowed groove wall
    ctx.fillRect(x - gw / 2, 0, gw * 0.35, H);
  }
}

// Postformé three-panel face (Leroy Merlin 60742675), drawn from the top of the leaf:
// panel boxes as fractions of the leaf (x from the left edge, y from the top), measured on
// the straight studio photo, media 4334229 (the leaf fills the frame): stiles 0.157 each
// side; top panel 0.070–0.474, middle 0.506–0.594, bottom 0.624–0.860; the raised-moulding
// bevel about 0.05 of the width. Symmetric, so both faces agree unmirrored.
const POSTFORME_PANELS = [[0.070, 0.474], [0.506, 0.594], [0.624, 0.860]];
const POSTFORME_STILE = 0.157, POSTFORME_BEVEL = 0.05;
function drawPostforme(ctx, W, H, def) {
  ctx.fillStyle = css(def.color);
  ctx.fillRect(0, 0, W, H);
  // A faint embossed wood grain (the photo's surface), vertical, seeded.
  let s = 60742675;
  const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    ctx.strokeStyle = `rgba(0,0,0,${0.006 + r() * 0.012})`;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + (r() - 0.5) * 12, H / 3, x + (r() - 0.5) * 12, (2 * H) / 3, x, H); ctx.stroke();
  }
  const x0 = POSTFORME_STILE * W, x1 = W - POSTFORME_STILE * W, b = POSTFORME_BEVEL * W;
  for (const [f0, f1] of POSTFORME_PANELS) {
    const y0 = f0 * H, y1 = f1 * H;
    // Bevel ring: light on the top and left (the studio light), shade on the bottom and right.
    const quad = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
    quad([[x0, y0], [x1, y0], [x1 - b, y0 + b], [x0 + b, y0 + b]], shade(def.color, 1.05));
    quad([[x0, y0], [x0 + b, y0 + b], [x0 + b, y1 - b], [x0, y1]], shade(def.color, 1.02));
    quad([[x0, y1], [x0 + b, y1 - b], [x1 - b, y1 - b], [x1, y1]], shade(def.color, 0.86));
    quad([[x1, y0], [x1, y1], [x1 - b, y1 - b], [x1 - b, y0 + b]], shade(def.color, 0.9));
    // The moulding's outer edge line and the step down to the flat field.
    ctx.strokeStyle = shade(def.color, 0.78);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = shade(def.color, 0.84);
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + b, y0 + b, x1 - x0 - 2 * b, y1 - y0 - 2 * b);
  }
}

const DESIGNS = { 'ange-line': drawAngeLine, line: drawLine, postforme: drawPostforme };

// One leaf texture per catalog entry and orientation (mirrored = hinge at canvas x 0),
// painted in the texture worker (paintedTexture.js; painter `doorLeaf` in painters.js).
export const paintDoorLeaf = (ctx, w, h, { def }) => (DESIGNS[def.design] || drawAngeLine)(ctx, w, h, def);
function leafTexture(def, mirrored) {
  const t = paintedTexture('doorLeaf', { def }, 256, 512, {
    wrap: mirrored ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, variant: mirrored ? 'mirrored' : '', placeholder: def.color ?? 0xf2f2f0,
  });
  if (mirrored) { t.repeat.x = -1; t.offset.x = 1; }
  return t;
}

// Materials are cached per entry and never disposed (callers dispose geometry only).
const matCache = new Map();
function materialsFor(def, lambert) {
  const key = `${JSON.stringify(def)}|${lambert}`;
  if (matCache.has(key)) return matCache.get(key);
  const M = lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const extra = lambert ? {} : { roughness: def.roughness ?? 0.45, metalness: def.metalness ?? 0.3 };
  const m = {
    body: new M({ color: def.color, ...extra }),
    face: new M({ map: leafTexture(def, false), ...extra }),
    faceMirrored: new M({ map: leafTexture(def, true), ...extra }),
    steel: new M({ color: 0xd4d4d8, ...(lambert ? {} : { roughness: 0.3, metalness: 0.4 }) }),
  };
  matCache.set(key, m);
  return m;
}

// Build the door for one placement. `lambert` selects the cheap AR materials.
// `open`: the leaf (with its handles and roses) swung 90° to the swing face about the
// hinge line (View 3D and the AR 3D view both show doors open).
export function buildDoorProduct(p, opts = {}) {
  const meshes = buildDoorProductAtFloor(p, opts);
  // A door on a sill (a door into a room on its own floor level): the whole product stands on it.
  if (p.sill > 0) for (const mesh of meshes) mesh.geometry?.translate(0, p.sill, 0);
  return meshes;
}
function buildDoorProductAtFloor(p, { lambert = false, open = false } = {}) {
  if (p.def.mount === 'rail') return buildRailDoor(p, { lambert, open });
  if (p.def.mount === 'gate') return buildGate(p, { lambert });
  const m = materialsFor(p.def, lambert);
  // Local frame: X along the wall (−w/2..w/2), Y up, Z across the wall.
  const w = p.width, h = p.head;
  const FRAME = p.def.frameFace ?? FRAME_DEFAULT, FRAME_DEPTH = p.def.frameDepth ?? FRAME_DEPTH_DEFAULT;
  const hingeX = p.hingeEnd === 'hi' ? 1 : -1; // hinge jamb at local +X or −X
  const parts = [];
  const add = (geometry, material, x, y, z) => {
    geometry.translate(x, y, z);
    parts.push([geometry, material]);
  };
  const leafT = Math.min(p.leafDepth, 0.1);
  // A rebated frame: the leaf lies flush with the frame's swing face, overlapping each jamb
  // by FRAME − inset; each jamb is a full-width stop behind the leaf plus a narrower band
  // (the inset) beside it.
  const inset = p.def.leafInset;
  const rebated = Number.isFinite(inset) && inset > 0 && inset < FRAME && leafT < FRAME_DEPTH;
  const leafZ = rebated ? p.swingZ * (FRAME_DEPTH / 2 - leafT / 2) : 0; // the leaf's centre across the wall
  // Dormant: two jambs and the head, plus a steel threshold.
  for (const side of [-1, 1]) {
    if (rebated) {
      const stopD = FRAME_DEPTH - leafT;
      add(new THREE.BoxGeometry(FRAME, h, stopD), m.body, side * (w / 2 - FRAME / 2), h / 2, -p.swingZ * leafT / 2);
      add(new THREE.BoxGeometry(inset, h, leafT), m.body, side * (w / 2 - inset / 2), h / 2, leafZ);
    } else {
      add(new THREE.BoxGeometry(FRAME, h, FRAME_DEPTH), m.body, side * (w / 2 - FRAME / 2), h / 2, 0);
    }
  }
  add(new THREE.BoxGeometry(w - 2 * FRAME, FRAME, FRAME_DEPTH), m.body, 0, h - FRAME / 2, 0);
  if (p.def.threshold !== false) add(new THREE.BoxGeometry(w - 2 * FRAME, 0.015, FRAME_DEPTH + 0.02), m.steel, 0, 0.0075, 0);
  // Leaf: BoxGeometry faces are [+x, −x, +y, −y, +z, −z]. The design's lock edge is at
  // canvas x = 0; +Z's U runs toward +X and −Z's toward −X, so the face whose U starts
  // on the hinge side takes the mirrored texture, and both faces agree in the world.
  const leafW = rebated ? w - 2 * inset : w - 2 * FRAME - 0.006, leafH = h - FRAME - 0.018;
  const plusZ = hingeX < 0 ? m.faceMirrored : m.face;
  const minusZ = hingeX < 0 ? m.face : m.faceMirrored;
  const leafFrom = parts.length; // parts from here to the knuckles move with the leaf
  const leaf = new THREE.BoxGeometry(leafW, leafH, leafT);
  leaf.translate(0, 0.015 + leafH / 2, 0);
  parts.push([leaf, [m.body, m.body, m.body, m.body, plusZ, minusZ]]);
  // Handle (bar + rose) and cylinder rose on both faces, on the lock side.
  const lockX = -hingeX * (leafW / 2 - 0.09);
  for (const side of [1, -1]) {
    const zFace = side * (leafT / 2);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 16).rotateX(Math.PI / 2), m.steel, lockX, HANDLE_Z, zFace + side * 0.006);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10).rotateX(Math.PI / 2), m.steel, lockX, HANDLE_Z, zFace + side * 0.03);
    // Bar points toward the hinge.
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 10).rotateZ(Math.PI / 2), m.steel, lockX + hingeX * 0.08, HANDLE_Z, zFace + side * 0.055);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 16).rotateX(Math.PI / 2), m.steel, lockX, HANDLE_Z - (p.def.roseDrop ?? 0.1), zFace + side * 0.005);
  }
  if (open) {
    // Turn about the hinge line (hinge edge, swing face) so the lock edge heads to swingZ:
    // rotating (−hingeX, 0, 0) by θ about Y gives z = hingeX·sin θ.
    const px = hingeX * (leafW / 2), pz = p.swingZ * (leafT / 2);
    const R = new THREE.Matrix4().makeTranslation(px, 0, pz)
      .multiply(new THREE.Matrix4().makeRotationY(hingeX * p.swingZ * Math.PI / 2))
      .multiply(new THREE.Matrix4().makeTranslation(-px, 0, -pz));
    for (let i = leafFrom; i < parts.length; i++) parts[i][0].applyMatrix4(R);
  }
  if (leafZ) for (let i = leafFrom; i < parts.length; i++) parts[i][0].translate(0, 0, leafZ);
  // Hinge knuckles on the swing face.
  for (const y of [0.25, 1.1, 1.95].map((f) => f * (h / 2.15))) {
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 10), m.body, hingeX * (leafW / 2 + 0.003), y, leafZ + p.swingZ * (leafT / 2 + 0.008));
  }
  return place(parts, p);
}

// Plan placement: rotate so local X runs along the wall, then move to the centre.
// rotation.y = +90° maps local +X to world −Z = plan +y.
function place(parts, p) {
  const M = new THREE.Matrix4().makeRotationY(p.alongX ? 0 : Math.PI / 2)
    .premultiply(new THREE.Matrix4().makeTranslation(p.cx, 0, -p.cy));
  return parts.map(([geometry, material]) => {
    geometry.applyMatrix4(M);
    return new THREE.Mesh(geometry, material);
  });
}

// A garden gate (`mount: 'gate'`) on a GATE zone: the zone is the gate itself (its leaves
// and, for two leaves, the gap between them), made to measure from it; the pillars stand
// beyond its ends with the product's play. It stands closed (a GATE never opens in 3D).
// Owner's plan, 2026-10-12: the driveway GATE r242 is drawn 3.010 m, exactly the Bono's
// published width (two 1.495 m leaves + the 20 mm gap), inside a 3.06 m opening (its
// published width between pillars). `def.design` picks the profile set (GATE_PROFILES).
// Each leaf: two stiles, top and bottom rails set in from the stile ends, horizontal
// open-work slats between them (`renfort`: a mid rail among them, `filler`: a cut slat
// against each rail), a lever on both faces at the lock stile, the capped top hinge and
// the bottom angle hinge at the hinge stile. Two leaves (`leaves: 2`) meet at the middle
// under a cover strip (battue) with a ground stop (sabot); the active leaf, which carries
// the lock, is the +X one.
//
// Sources (2026-10-12), JAX (design 'jax'):
//   Leroy Merlin 97503536 "Portillon battant aluminium Cap's jax gris anthracite KLOS UP,
//   l.99.5 x H.155.6" (Klos'up / Maison Cadiou, model JAX)
//     https://www.leroymerlin.fr/produits/portillon-battant-aluminium-cap-s-jax-gris-anthracite-klos-up-l-99-5-x-h-155-6-97503536.html
//     spec table: 99.5 × 155.6 cm; width between pillars 104 cm; operating play 5 cm;
//     rails ("traverses") 95 × 30 mm; aluminium, powder-coated anthracite; open-work
//     infill ("Ajouré"); lock; reversible; made to measure 50–150 × 95.6–185.9 cm.
//   PDF media 5386925 (exploded view sheet): stiles ("montants") 95 × 50 mm, rails 95 × 30,
//     open-work slats 90 × 15 mm, mortise lock fitted, a 7 mm × 88 mm square spindle (a
//     lever on each face), steel top hinge with cover, bottom angle bracket.
//   PDF media 5351363 (fitting manual) p. 9: 20 mm play on the lock side, 25 mm on the hinge
//     side, 35 mm under the leaf; p. 7: top hinge cover over the stile top, bottom hinge an
//     angle bracket under the stile; p. 10: the bottom pin 90–120 mm from the pillar corner.
//   Photo media 5312131 (straight studio front, 1.860 mm/px from the published 995 mm width,
//     its 1555 mm height agreeing): stiles 52 px = 97 mm (spec 95); the rails 30 mm in from
//     the stile ends (16 px), 95 mm tall; 13 slats of 49 px = 91 mm (spec 90) with even gaps
//     of 5–6 px ≈ 10 mm; lever axis 1003 mm above the leaf bottom, lever ≈ 130 mm long;
//     lock plate ≈ 30 × 210 mm; top hinge cover ≈ 100 × 40 mm above the stile, its bottom
//     bracket under it. Photos 5312128, 5312130, 5312087 (in context), 5312132 (three
//     quarters), 5400248 (labelled parts) show the same frame and colour.
// Sources (2026-10-12), BONO (design 'bono'):
//   Leroy Merlin 80118263 "Portail battant aluminium Bono gris zinc Klos up!, l.299 x
//   H.168.5 cm"
//     https://www.leroymerlin.fr/produits/portail-battant-aluminium-bono-gris-zinc-klos-up-l-299-x-h-168-5-cm-80118263.html
//     spec table: 299 × 168.5 cm; 306 cm between pillars; operating play 7 cm; rails
//     92 × 36 mm; stiles 93 wide × 60 thick; integrated lock; 2 handles; adjustable top
//     hinges, lacquered bottom angle brackets, a central stop ("sabot central"); RAL 7016T
//     (the page's colour: anthracite; its title: gris zinc); 66 kg; made to measure
//     150–500 × 75–200 cm.
//   PDF media 3581359 (exploded view sheet): stiles 93 × 60, rails 92 × 36, open-work slats
//     160 × 25 mm, central cover strip ("battement central") 48 × 50 mm, mortise lock, a
//     50 mm high polyamide central stop.
//   Photo media 3312852 (dimension drawing): fabrication height 1685, above ground 1720
//     (+ 35 mm bottom bracket), width 3010 incl. 20 mm between the 2 leaves, 3060 between
//     pillars, pillars 1825. Photo 3312854 (labelled parts): top rail, a reinforcing rail
//     ("traverse de renfort") among the slats, the cover strip on the meeting stiles, the
//     handle on the leaf to the right seen from the street.
//   Photo media 3481086 (straight studio front of the 1685 × 3060 gate, 3.68 mm/px from
//     the 1685 mm stile = 460 px, the 3010 mm width = 816 px agreeing): stiles 24–25 px =
//     90 mm; the rails 9 px = 33 mm in from the stile ends, 25 px = 92 mm; from the top a
//     cut slat 19 px = 70 mm against the top rail, 4 slats of 44 px = 160 mm, the reinforcing
//     rail 25 px, 3 slats, a cut slat 19 px against the bottom rail, gaps ≈ 2.5 px = 9 mm;
//     the cover strip 13 px = 48 mm over the meeting; the lever 273 px = 1005 mm above the
//     leaf bottom, ≈ 33 px = 120 mm long; the black stop ≈ 120 × 50 mm under the meeting.
//     Photos 3312790 (in context), 3481094 (three quarters), 3491424 (colour swatch).
// Sources (2026-10-17), TREZ (design 'trez'):
//   Leroy Merlin 80095323 "Portillon ajoure anthracite Trez Klos up, l.99x H.174.5 cm" (the URL
//   still says gris zinc, H 173.5)
//     https://www.leroymerlin.fr/produits/portillon-battant-aluminium-trez-gris-zinc-klos-up-l-99x-h-173-5-cm-80095323.html
//     spec table: 99 × 174.5 cm; 104 cm between pillars; operating play 5 cm; rails 92 × 36 mm;
//     stiles 93 × 60 mm; integrated lock; adjustable top hinge, lacquered bottom angle bracket,
//     2 handles, a strike and a stop; RAL 7016T anthracite; thermolacquered; made to measure
//     50–150 × 50–200 cm.
//   PDF media 3607730 (exploded view sheet): stiles 93 × 60, rails 92 × 36, open-work slats
//     90 × 25 mm, mortise lock fitted, a 98 mm square kit, steel angle hinges with covers, a
//     bottom bracket. PDF media 4637159: the fitting manual (61 pages, single and double gates;
//     not used for a dimension).
//   Photo media 3247470 (straight studio render of the 174.5 cm leaf, 1.976 mm/px from the
//     1745 mm stile = 883 px): stiles 47–49 px = 93–97 mm; the rails 15–16 px = 30–32 mm in
//     from the stile ends, 45–47 px = 89–93 mm; from the top rail down 14 slats of 45–46 px
//     = 90 mm, each below a gap, slat pitch 50.8–51.2 px = 100–101 mm, then a cut slat 38 px
//     = 75 mm resting on the bottom rail with no gap; the lever axis 538 px = 1063 mm above
//     the leaf bottom, 65 px = 128 mm long. Photos 1698454 (straight front of a lower leaf:
//     12 slats, same order: top rail, gap, slats, a cut slat on the bottom rail), 3828988 (in
//     context with matching fence panels), 3491424 (colour swatch).
//   Fitted, not published: the gap 11.1 mm (15 gaps: above each slat and the cut one), so that
//     14 slats leave the photo's 75 mm cut slat
//     in the 174.5 cm leaf (pitch 101.1 mm, the photo's 100–101; its width, 506 px =
//     1001 mm, reads 1 % wider than the published 99 cm).
// Sources (2026-10-17), TREZ 2 leaves (design 'trez', `leaves: 2`), ordered to the owner's size:
//   Leroy Merlin 80092306 "Portail battant aluminium Trez gris zinc Klos up!, l.299 x H.173.5 cm"
//     https://www.leroymerlin.fr/produits/portail-battant-aluminium-trez-gris-zinc-klos-up-l-299-x-h-173-5-cm-80092306.html
//     spec table: 299 × 174.5 cm; 306 cm between pillars (so 35 mm play each side); pillars
//     1.87 m; operating play 7 cm; rails 92 × 36; stiles 93 × 60; slats 90 wide; opens to the
//     right seen from the street; integrated lock; a central stop ("sabot central"); a
//     motorisation reinforcement; RAL 7016T anthracite; 68 kg; made to measure 150–500 × 75–200 cm.
//   PDF media 3581468 (exploded view sheet): the single Trez's profiles, slats 90 × 25, central
//     cover strip ("battement central") 48 × 50 mm, mortise lock, a 50 mm high polyamide stop.
//   PDF media 3581362 (fitting manual) p. 15–16 (gonds A): "Réglez l'axe du gond à 65 mm"
//     from the pillar: with the 35 mm play, each hinge axis is 30 mm inside the gate's outer
//     edge (`axisIn`). The owner's order (2026-10-17): 2.70 m between the two hinge axes
//     (`axisSpan`), so the gate is 2.76 m wide and its pillars 2.83 m apart.
//   Photos 883331, 1039077 (studio fronts, ~4.4 mm/px: too coarse to measure the slats; the
//     same order as the single leaf: top rail, gap, slats), 3828945 (in context). The slat
//     layout is the single Trez's (photo 3247470 above).
//   Estimates: the stop's 120 × 100 mm footprint (Bono's); the cover strip on the +X leaf.
// Estimates (all): slats and rails centred in the stiles' depth; the leaf centred in the
//   zone's depth; for another height the slat count keeps the slat and gap sizes (Bono:
//   the cut slats take the rest, the reinforcing rail after half the slats, rounded up);
//   the lever 1.0 m above the leaf bottom; hinge shapes simplified; colours (lit studio
//   greys read lighter: JAX ≈ #6e7882 in its photo, #5a636c used under daylight).
const GATE_PROFILES = {
  jax: {
    stile: 0.095, stileD: 0.05, rail: 0.095, railD: 0.03, railIn: 0.03,
    slat: 0.09, slatD: 0.015, gap: 0.0097, playHinge: 0.025, under: 0.035, handleZ: 1.0,
  },
  trez: {
    stile: 0.093, stileD: 0.06, rail: 0.092, railD: 0.036, railIn: 0.03,
    slat: 0.09, slatD: 0.025, gap: 0.0111, cutBottom: 0.03, playHinge: 0.025, under: 0.035, handleZ: 1.06,
    leafGap: 0.02, battue: [0.048, 0.05], sabot: [0.12, 0.05, 0.1],
  },
  bono: {
    stile: 0.093, stileD: 0.06, rail: 0.092, railD: 0.036, railIn: 0.033,
    slat: 0.16, slatD: 0.025, gap: 0.009, renfort: true, filler: 0.04, playHinge: 0.025,
    under: 0.035, handleZ: 1.0, leafGap: 0.02, battue: [0.048, 0.05], sabot: [0.12, 0.05, 0.1],
  },
};
// Powder-coated aluminium, no painted face: plain cached materials.
const gateCache = new Map();
function gateMaterials(def, lambert) {
  const key = `${def.id}|${def.color}|${lambert}`;
  if (!gateCache.has(key)) {
    const M = lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    const extra = lambert ? {} : { roughness: def.roughness ?? 0.55, metalness: def.metalness ?? 0.2 };
    gateCache.set(key, {
      body: new M({ color: def.color, ...extra }),
      steel: new M({ color: 0x9ca3af, ...extra }),
      black: new M({ color: 0x1d1d1f, ...extra }),
    });
  }
  return gateCache.get(key);
}
function buildGate(p, { lambert }) {
  const G = GATE_PROFILES[p.def.design] || GATE_PROFILES.jax;
  const m = gateMaterials(p.def, lambert);
  const parts = [];
  const box = (sx, sy, sz, x, y, z, material = m.body) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    parts.push([g, material]);
  };
  // From 35 mm above the ground up to the zone's head.
  const y0 = G.under, H = Math.max(0.4, p.head - y0);
  // A gate ordered to a hinge-axis spacing (`def.axisSpan`, each axis `def.axisIn` inside the
  // gate's outer edge) has its own width, centred on the zone; otherwise the zone is the gate.
  const W = p.def.axisSpan ? p.def.axisSpan + 2 * (p.def.axisIn ?? G.stile / 2) : Math.max(0.3, p.width);
  const two = (p.def.leaves ?? 1) === 2;
  // One leaf from `left` to `right`; `hx` = its hinge side (+1 = right), `lock` = it carries the lock.
  const leaf = (left, right, hx, lock) => {
    const L = right - left, cx = (left + right) / 2;
    box(G.stile, H, G.stileD, left + G.stile / 2, y0 + H / 2, 0);
    box(G.stile, H, G.stileD, right - G.stile / 2, y0 + H / 2, 0);
    const inner = L - 2 * G.stile;
    const railBot = y0 + G.railIn, railTop = y0 + H - G.railIn;
    box(inner, G.rail, G.railD, cx, railBot + G.rail / 2, 0);
    box(inner, G.rail, G.railD, cx, railTop - G.rail / 2, 0);
    const lo = railBot + G.rail, span = (railTop - G.rail) - lo;
    if (G.renfort) {
      // Top down: cut slat, gap, ⌈n/2⌉ slats, reinforcing rail, ⌊n/2⌋ slats, gap, cut slat;
      // every element separated by one gap.
      const n = Math.max(0, Math.floor((span - G.rail - 2 * G.filler - (3 * G.gap)) / (G.slat + G.gap)));
      const f = Math.max(0, (span - G.rail - n * G.slat - (n + 3) * G.gap) / 2);
      const seq = [f, ...Array(Math.ceil(n / 2)).fill(G.slat), -G.rail, ...Array(Math.floor(n / 2)).fill(G.slat), f];
      let y = lo + span;
      seq.forEach((h, i) => {
        const t = Math.abs(h);
        if (t > 0.001) box(inner, t, h < 0 ? G.railD : G.slatD, cx, y - t / 2, 0);
        y -= t + (i < seq.length - 1 ? G.gap : 0);
      });
    } else if (G.cutBottom) {
      // Top down: a gap then a slat, as many as fit leaving at least `cutBottom`; the rest is a
      // cut slat resting on the bottom rail (no gap under it).
      const n = Math.max(0, Math.floor((span - G.cutBottom) / (G.slat + G.gap)));
      let y = lo + span;
      for (let i = 0; i < n; i++) {
        y -= G.gap;
        box(inner, G.slat, G.slatD, cx, y - G.slat / 2, 0);
        y -= G.slat;
      }
      const cut = y - G.gap - lo;
      if (cut > 0.005) box(inner, cut, G.slatD, cx, lo + cut / 2, 0);
    } else {
      const n = Math.max(1, Math.floor((span - G.gap) / (G.slat + G.gap)));
      const gap = (span - n * G.slat) / (n + 1);
      for (let i = 0; i < n; i++) box(inner, G.slat, G.slatD, cx, lo + gap * (i + 1) + G.slat * (i + 0.5), 0);
    }
    if (lock) {
      // The lock plate and a lever on each face, the lever pointing to the hinge.
      const lockX = hx > 0 ? left + G.stile / 2 : right - G.stile / 2;
      const leverY = y0 + Math.min(G.handleZ, H * 0.65);
      for (const side of [1, -1]) {
        const z = side * G.stileD / 2;
        box(0.03, 0.21, 0.006, lockX, leverY - 0.04, z + side * 0.003);
        const rose = new THREE.CylinderGeometry(0.009, 0.009, 0.045, 10).rotateX(Math.PI / 2);
        rose.translate(lockX, leverY, z + side * 0.025);
        parts.push([rose, m.body]);
        box(0.13, 0.018, 0.016, lockX + hx * 0.06, leverY, z + side * 0.05);
      }
    }
    // Hinges on the hinge stile: the top cover over its top, the bottom angle under it,
    // fixed to the pillar past the play.
    const hingeX = hx > 0 ? right - G.stile / 2 : left + G.stile / 2;
    box(0.1, 0.04, G.stileD + 0.01, hingeX + hx * 0.02, y0 + H + 0.02, 0);
    box(0.06, 0.006, 0.06, hingeX + hx * 0.02, y0 - 0.012, 0);
    box(0.006, 0.07, 0.06, hingeX + hx * (G.stile / 2 + G.playHinge - 0.003), y0 + 0.02, 0);
    const pin = new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8);
    const axisX = p.def.axisIn != null ? (hx > 0 ? right - p.def.axisIn : left + p.def.axisIn) : hingeX;
    pin.translate(axisX, y0 - 0.005, 0);
    parts.push([pin, m.steel]);
  };
  if (two) {
    const half = (W - G.leafGap) / 2;
    leaf(-W / 2, -W / 2 + half, -1, false);
    leaf(W / 2 - half, W / 2, 1, true);
    // The cover strip over the meeting stiles, full height; the stop under the gap.
    box(G.battue[0], H, G.battue[1], 0, y0 + H / 2, 0);
    box(G.sabot[0], G.sabot[1], G.sabot[2], 0, G.sabot[1] / 2, 0, m.black);
  } else {
    leaf(-W / 2, W / 2, p.hingeEnd === 'hi' ? 1 : -1, true);
  }
  return place(parts, p);
}

// A surface-mounted sliding door on a wall rail (`mount: 'rail'`), set on a SLIDING zone:
// the zone is the OPENING; `swingZ` picks the wall face carrying the rail and `hingeEnd`
// the side the leaf slides to (the plan glyph's convention, apertureGlyph.js). The leaf
// is the product's own size (not made to measure), centred on the opening when closed,
// parked with its leading edge on the jamb when open.
//
// Sources (2026-09-27):
//   Leaf: Leroy Merlin 60742675 "Porte coulissante postformé bois, H.204 x l.83 cm"
//     https://www.leroymerlin.fr/produits/porte-coulissante-postforme-bois-h-204-x-l-83-cm-60742675.html
//     spec table: 204 × 83 cm, 40 mm, white, wood, honeycomb core ("Alvéolaire"), solid
//     ("Plein"), series "Postformée", 12.5 kg, handle not supplied. Photos: media 4334229
//     (straight studio front, the panel layout: drawPostforme), 3812425 (dimension
//     drawing, 93 cm variant), 4343488 (in a room, hung on a black rail), 1703304 and
//     1031676 (other fronts). Docs: 1386557 (spare parts list), 1366302, 1236774.
//   Rail: Leroy Merlin 82002392 "Rail coulissant Indus 2, pour porte de largeur 93 cm
//     maximum, ARTENS" (ADEO 845686, EAN 3276000551751)
//     https://www.leroymerlin.fr/produits/rail-coulissant-indus-2-pour-porte-de-largeur-93-cm-maximum-artens-82002392.html
//     spec table: length 186 cm, depth 4 cm, steel, black, door 25–40 mm thick, up to
//     80 kg, doors 63/73/83/93 cm, stops supplied, floor guide invisible once fitted.
//     Exploded view (PDF media 3975252): flat bar, 5 wall spacers, 2 rollers on
//     door-top plates, 2 end stops, 2 anti-jump blocks, 1 floor guide. Manual (PDF
//     media 3837502) p. 8: 186 cm = spacers every 45 cm; rail line H + 4.8 cm above the
//     floor, 1 cm under the door; p. 9: the rail's first hole 90 − W cm beyond the jamb
//     (7 cm for an 83 cm door); pp. 13–14: roller plates on the door top, 12.5 cm in from
//     each edge. Photo 4285352 (drawing): 11.7 cm from the door top to the roller top.
//     Photos 4285354, 456860, 4285356 (rollers, bar, stops in black).
//   Estimates (photo proportion, not published): bar 40 × 6 mm; roller wheel Ø 59 mm
//     (the 11.7 cm total less the bar); spacer blocks 30 × 30 mm; the bar's end 3 cm past
//     its first hole; the door centred under the bar, its back face 17 mm off the wall.
const RAIL = {
  length: 1.86, spacing: 0.45, barH: 0.04, barT: 0.006, standoff: 0.04, // standoff = spec depth
  floorGap: 0.01, lineAbove: 0.048, rollerIn: 0.125, wheelR: 0.0295, wheelT: 0.018,
  endPastHole: 0.03, maxDoor: 0.93,
};
function buildRailDoor(p, { lambert, open }) {
  const m = materialsFor(p.def, lambert);
  const black = railMaterial(lambert);
  const L = p.def.leafWidth ?? p.width, H = p.def.leafHeight ?? p.head, T = Math.min(p.def.leafDepth ?? 0.04, 0.08);
  const w = p.width, sd = p.hingeEnd === 'hi' ? 1 : -1; // slide (open) direction along local X
  const wallZ = p.swingZ * (p.depth ?? 0.2) / 2;         // the wall face carrying the rail
  const out = (d) => wallZ + p.swingZ * d;               // d metres off that face
  const barZ = out(RAIL.standoff - RAIL.barT / 2);
  const parts = [];
  const box = (sx, sy, sz, x, y, z, material) => {
    const g = new THREE.BoxGeometry(sx, sy, Math.abs(sz));
    g.translate(x, y, z);
    parts.push([g, material]);
  };
  // Leaf: closed = centred on the opening; open = parked beside it, leading edge on the jamb.
  const leafX = open ? sd * (w / 2 + L / 2) : 0;
  const bottom = RAIL.floorGap, top = bottom + H;
  box(L, H, T, leafX, bottom + H / 2, barZ, [m.body, m.body, m.body, m.body, m.face, m.face]);
  // Bar: its line H + 4.8 cm above the floor; its non-park end (90 − L) + 3 cm past the jamb.
  const lineY = H + RAIL.lineAbove;
  const start = -sd * (w / 2 + RAIL.maxDoor - 0.03 - L + RAIL.endPastHole);
  const mid = start + sd * RAIL.length / 2;
  box(RAIL.length, RAIL.barH, RAIL.barT, mid, lineY, barZ, black);
  // Spacers between the wall and the bar, every 45 cm from the first hole.
  for (let i = 0; i < 5; i++) {
    const x = start + sd * (RAIL.endPastHole + i * RAIL.spacing);
    box(0.03, 0.03, RAIL.standoff - RAIL.barT, x, lineY, out((RAIL.standoff - RAIL.barT) / 2), black);
  }
  // Rollers: a plate on the leaf top, a strap up the bar's room face, a wheel on the bar.
  const railTop = lineY + RAIL.barH / 2, wheelY = railTop + RAIL.wheelR;
  const strapZ = barZ + p.swingZ * (RAIL.barT / 2 + 0.004);
  for (const s of [-1, 1]) {
    const x = leafX + s * (L / 2 - RAIL.rollerIn);
    box(0.1, 0.005, T, x, top + 0.0025, barZ, black);
    box(0.035, wheelY - top, 0.005, x, (top + wheelY) / 2, strapZ, black);
    const wheel = new THREE.CylinderGeometry(RAIL.wheelR, RAIL.wheelR, RAIL.wheelT, 20).rotateX(Math.PI / 2);
    wheel.translate(x, wheelY, barZ);
    parts.push([wheel, black]);
    const axle = new THREE.CylinderGeometry(0.008, 0.008, Math.abs(strapZ - barZ) + 0.012, 10).rotateX(Math.PI / 2);
    axle.translate(x, wheelY, (strapZ + barZ) / 2);
    parts.push([axle, black]);
  }
  // End stops just past the rollers' closed and open travel.
  const rollerSpan = L / 2 - RAIL.rollerIn;
  for (const x of [-sd * (rollerSpan + 0.045), sd * (w / 2 + L / 2 + rollerSpan + 0.045)]) {
    box(0.03, 0.05, RAIL.barT + 0.02, x, lineY, barZ, black);
  }
  return place(parts, p);
}
const railCache = new Map();
function railMaterial(lambert) {
  if (!railCache.has(lambert)) {
    railCache.set(lambert, lambert ? new THREE.MeshLambertMaterial({ color: 0x1d1d1f })
      : new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.55, metalness: 0.5 }));
  }
  return railCache.get(lambert);
}
