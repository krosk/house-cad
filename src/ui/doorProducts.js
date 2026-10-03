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
// `roughness`.
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
export function buildDoorProduct(p, { lambert = false, open = false } = {}) {
  if (p.def.mount === 'rail') return buildRailDoor(p, { lambert, open });
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
  // Dormant: two jambs and the head, plus a steel threshold.
  add(new THREE.BoxGeometry(FRAME, h, FRAME_DEPTH), m.body, -w / 2 + FRAME / 2, h / 2, 0);
  add(new THREE.BoxGeometry(FRAME, h, FRAME_DEPTH), m.body, w / 2 - FRAME / 2, h / 2, 0);
  add(new THREE.BoxGeometry(w - 2 * FRAME, FRAME, FRAME_DEPTH), m.body, 0, h - FRAME / 2, 0);
  if (p.def.threshold !== false) add(new THREE.BoxGeometry(w - 2 * FRAME, 0.015, FRAME_DEPTH + 0.02), m.steel, 0, 0.0075, 0);
  // Leaf: BoxGeometry faces are [+x, −x, +y, −y, +z, −z]. The design's lock edge is at
  // canvas x = 0; +Z's U runs toward +X and −Z's toward −X, so the face whose U starts
  // on the hinge side takes the mirrored texture, and both faces agree in the world.
  const leafW = w - 2 * FRAME - 0.006, leafH = h - FRAME - 0.018, leafT = Math.min(p.leafDepth, 0.1);
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
  // Hinge knuckles on the swing face.
  for (const y of [0.25, 1.1, 1.95].map((f) => f * (h / 2.15))) {
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 10), m.body, hingeX * (leafW / 2 + 0.003), y, p.swingZ * (leafT / 2 + 0.008));
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
