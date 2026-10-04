// Material takeoff: turn `floor.finishes` into laying regions and piece counts
// (design + owner decisions: docs/materials.md). Pure and Node-testable; nothing
// here is stored.
//
// Finishes target identities that already exist (rooms have no stored id):
//   floor finish  { target: { rect }, material }         → the rect's connected ROOM
//                                                         component (whole room)
//   wall finish   { target: { rect, edge }, material }   → that room rect edge, seen
//                                                         from inside, on the room boundary
// `edge` is left|right|bottom|top, the same vocabulary dimension constraints use.
//   half wall     { target: { rect, edge }, material }   → a side of a half wall standing
//                 { target: { rect, edge: 'cap' } }        inside a room, or its top (`cap`)
//
// Continuity (owner decisions): every pattern is anchored at the plan origin, so equal
// materials line up everywhere, unless a floor region names its own start corner
// (`anchor`, below): its pattern then starts there, still continuous across the region. Rooms with the SAME floor material joined through a
// doorway (door/sliding/garage zone touching both) are ONE laying region that includes
// the doorway strip; different materials each run to the middle of the doorway. Packs
// are rounded once per product for the whole house.

import { connectedRoomComponents } from './geometry2d.js';
import { zoneKind } from './zoneColors.js';
import { materialById } from './materials.js';

const EPS = 1e-6;
// Door-family zones a floor runs through (full-height openings).
const DOORWAY_KINDS = new Set(['door', 'passage', 'sliding', 'garage']);
// Openings cut out of a wall face's area. A half wall is open ABOVE its sill (its
// `head` is null → the band runs to the ceiling), so it cuts the face there too.
const OPENING_KINDS = new Set(['door', 'passage', 'sliding', 'garage', 'window', 'halfwall']);
// A doorway/opening belongs to a room or face within this gap (AR-authored plans are
// rarely exact to the millimetre; a real wall is thicker than this is loose).
const TOUCH = 0.05;
// How far behind a wall face an opening zone may sit and still pierce it.
const FACE_DEPTH = 0.45;
export const EDGES = ['left', 'right', 'bottom', 'top'];
// The top of a half wall, as a finish target edge (owner, 2026-10-04: tiled like its sides).
export const CAP = 'cap';

// ---- rect-set regions ----------------------------------------------------------
// A region is a list of disjoint axis-aligned boxes. Built by coordinate compression:
// a cell is inside when (in an include box and not in an exclude box) or in an add box.
const within = (b, x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
export function regionBoxes(include, exclude = [], add = []) {
  const xs = new Set(), ys = new Set();
  for (const b of [...include, ...add]) { xs.add(b.x0); xs.add(b.x1); ys.add(b.y0); ys.add(b.y1); }
  for (const b of exclude) { xs.add(b.x0); xs.add(b.x1); ys.add(b.y0); ys.add(b.y1); }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
  const boxes = [];
  for (let j = 0; j < Y.length - 1; j++) {
    const y0 = Y[j], y1 = Y[j + 1];
    if (y1 - y0 <= EPS) continue;
    let run = null;
    for (let i = 0; i < X.length - 1; i++) {
      const x0 = X[i], x1 = X[i + 1];
      if (x1 - x0 <= EPS) continue;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const inside = add.some((b) => within(b, mx, my))
        || (include.some((b) => within(b, mx, my)) && !exclude.some((b) => within(b, mx, my)));
      if (inside && run && Math.abs(run.x1 - x0) <= EPS) run.x1 = x1; // merge along the row
      else if (inside) boxes.push(run = { x0, x1, y0, y1 });
      else run = null;
    }
  }
  return boxes;
}
const boxesArea = (boxes) => boxes.reduce((s, b) => s + (b.x1 - b.x0) * (b.y1 - b.y0), 0);
const overlapArea = (boxes, x0, x1, y0, y1) => {
  let a = 0;
  for (const b of boxes) {
    const w = Math.min(b.x1, x1) - Math.max(b.x0, x0);
    const h = Math.min(b.y1, y1) - Math.max(b.y0, y0);
    if (w > EPS && h > EPS) a += w * h;
  }
  return a;
};
const bboxOf = (boxes) => boxes.reduce((o, b) => ({
  x0: Math.min(o.x0, b.x0), x1: Math.max(o.x1, b.x1), y0: Math.min(o.y0, b.y0), y1: Math.max(o.y1, b.y1),
}), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

// ---- counting --------------------------------------------------------------------
// Lattice patterns (grid/brick/octagon): one piece per lattice cell the region
// touches with positive area; `whole` cells are fully covered. A cut piece is counted
// as a full piece bought (offcut reuse across cells is not assumed: conservative).
function latticeCount(material, boxes) {
  if (material.pattern === 'octagon' && material.diagonal) return diagonalOctagonCount(material, boxes);
  const px = material.w + (material.joint || 0), py = material.h + (material.joint || 0);
  const cellArea = px * py;
  const cells = new Map();
  for (const b of boxes) {
    for (let j = Math.floor(b.y0 / py); j * py < b.y1 - EPS; j++) {
      const ox = material.pattern === 'brick' && (j & 1) ? px / 2 : 0;
      for (let i = Math.floor((b.x0 - ox) / px); i * px + ox < b.x1 - EPS; i++) {
        const x0 = i * px + ox, y0 = j * py;
        const a = overlapArea([b], x0, x0 + px, y0, y0 + py);
        if (a <= EPS) continue;
        const key = `${i},${j}`;
        cells.set(key, (cells.get(key) || 0) + a);
      }
    }
  }
  let whole = 0, cut = 0;
  for (const a of cells.values()) {
    if (a < 1e-6) continue; // a sub-mm² touch needs no piece
    if (a >= cellArea * (1 - 1e-6)) whole++; else cut++;
  }
  const out = { pieces: whole + cut, whole, cut };
  if (material.pattern === 'octagon') {
    // Regular octagon of width w: chamfer leg c = w / (2 + √2); the cabochon at each
    // lattice corner is a diamond of half-diagonal c. Counted by its bounding square.
    const c = material.w / (2 + Math.SQRT2);
    const bb = bboxOf(boxes);
    let cw = 0, cc = 0;
    for (let j = Math.floor(bb.y0 / py); j * py <= bb.y1 + c; j++) {
      for (let i = Math.floor(bb.x0 / px); i * px <= bb.x1 + c; i++) {
        const X = i * px, Y = j * py;
        const a = overlapArea(boxes, X - c, X + c, Y - c, Y + c);
        if (a < 1e-6) continue;
        if (a >= 4 * c * c * (1 - 1e-6)) cw++; else cc++;
      }
    }
    out.cabochons = cw + cc;
    out.cabochonWhole = cw;
  }
  return out;
}

// Octagon + cabochon turned 45° (`diagonal`, owner 2026-09-27): the cabochons become squares
// square to the walls. A regular octagon is unchanged by a 45° turn, so the laid pattern is
// a square grid of pitch q = (w + joint)/√2 in plan x/y: a cabochon on each vertex (m, n)
// with m + n even (one at the origin, as in the straight lattice) and an octagon on each
// with m + n odd. Counted by the real tile shapes: a piece the region touches is bought,
// whole when the region covers it.
function clipArea(poly, b) { // area of a convex polygon inside box b (Sutherland–Hodgman)
  let pts = poly;
  const planes = [[0, b.x0, 1], [0, b.x1, -1], [1, b.y0, 1], [1, b.y1, -1]];
  for (const [axis, v, sgn] of planes) {
    const inside = (p) => (p[axis] - v) * sgn >= 0;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(c)) {
        const t = (v - a[axis]) / (c[axis] - a[axis]);
        out.push([a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])]);
      }
    }
    pts = out;
    if (!pts.length) return 0;
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    s += a[0] * c[1] - c[0] * a[1];
  }
  return Math.abs(s) / 2;
}
function diagonalOctagonCount(material, boxes) {
  const w = material.w, q = (w + (material.joint || 0)) / Math.SQRT2;
  const hw = w / 2, c = w / (2 + Math.SQRT2), side = w / (1 + Math.SQRT2), hs = side / 2;
  const octArea = w * w - 2 * c * c, cabArea = side * side;
  const bb = bboxOf(boxes);
  let whole = 0, cut = 0, cw = 0, cc = 0;
  for (let n = Math.floor((bb.y0 - hw) / q); n * q <= bb.y1 + hw; n++) {
    for (let m = Math.floor((bb.x0 - hw) / q); m * q <= bb.x1 + hw; m++) {
      const X = m * q, Y = n * q;
      const octagon = (m + n) % 2 !== 0;
      const poly = octagon
        ? [[-hw + c, -hw], [hw - c, -hw], [hw, -hw + c], [hw, hw - c], [hw - c, hw], [-hw + c, hw], [-hw, hw - c], [-hw, -hw + c]]
        : [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]];
      const pts = poly.map(([x, y]) => [X + x, Y + y]);
      const a = boxes.reduce((s, b) => s + clipArea(pts, b), 0);
      if (a < 1e-6) continue; // a sub-mm² touch needs no piece
      const full = a >= (octagon ? octArea : cabArea) * (1 - 1e-6);
      if (octagon) { if (full) whole++; else cut++; } else if (full) cw++; else cc++;
    }
  }
  return { pieces: whole + cut, whole, cut, cabochons: cw + cc, cabochonWhole: cw };
}

// Pinwheel (opus) of 30/50 cm tiles (owner spec, 2026-09-27): a 130 × 130 cm module of
// nine tiles, [x, y, w, h] in nominal cm from its top-left: four 50×50 arms spiral
// clockwise round a 30×30, and 30×50 / 50×30 fill the corners. Every row and column of
// the module crosses exactly three tiles (30 + 50 + 50), so with joints the module
// pitch is 1.30 m + 3 joints and a nominal coordinate c shifts by one joint per tile
// before it.
export const PINWHEEL = [
  [30, 0, 50, 50], [80, 30, 50, 50], [50, 80, 50, 50], [0, 50, 50, 50], // arms
  [50, 50, 30, 30], // centre
  [0, 0, 30, 50], [80, 0, 50, 30], [100, 80, 30, 50], [0, 100, 50, 30], // corners
];
const pinwheelAt = (c, j) => c / 100 + j * (c === 0 ? 0 : c <= 50 ? 1 : c <= 100 ? 2 : 3);
export const pinwheelPitch = (material) => pinwheelAt(130, material.joint || 0);
// Module cells in metres ({x0, y0, x1, y1} incl. the joint, like a lattice cell) with
// their format key ('50×50', '30×50', '30×30'; a 50×30 is a turned 30×50).
export function pinwheelCells(material) {
  const j = material.joint || 0;
  return PINWHEEL.map(([x, y, w, h]) => ({
    x0: pinwheelAt(x, j), y0: pinwheelAt(y, j), x1: pinwheelAt(x + w, j), y1: pinwheelAt(y + h, j),
    format: `${Math.min(w, h)}×${Math.max(w, h)}`,
  }));
}

// Pinwheel: one piece per module cell the region touches, whole vs cut, per format.
function pinwheelCount(material, boxes) {
  const P = pinwheelPitch(material), cells = pinwheelCells(material), bb = bboxOf(boxes);
  const formats = {};
  let whole = 0, cut = 0;
  for (let mj = Math.floor(bb.y0 / P); mj * P < bb.y1 - EPS; mj++) {
    for (let mi = Math.floor(bb.x0 / P); mi * P < bb.x1 - EPS; mi++) {
      for (const c of cells) {
        const x0 = mi * P + c.x0, x1 = mi * P + c.x1, y0 = mj * P + c.y0, y1 = mj * P + c.y1;
        const a = overlapArea(boxes, x0, x1, y0, y1);
        if (a < 1e-6) continue; // a sub-mm² touch needs no piece
        const f = formats[c.format] || (formats[c.format] = { pieces: 0, whole: 0 });
        f.pieces++;
        if (a >= (x1 - x0) * (y1 - y0) * (1 - 1e-6)) { whole++; f.whole++; } else cut++;
      }
    }
  }
  return { pieces: whole + cut, whole, cut, formats };
}

// Stepped random (owner spec, 2026-09-29): a 5-tile module of 30/50 cm tiles that is NOT a
// rectangle, repeated on the oblique lattice m·A + n·B, so no joint line crosses a room
// (longest straight joint 210 cm across, 110 cm along). [x, y, w, h] in nominal cm with the
// spec's y DOWN; the pattern frame is plan (y up), so y is flipped once here (the top view
// then matches the spec's drawing). det(A, B) = 7900 cm² = the module area: exact cover.
// Cells are nominal (the joint is taken out of each tile, 5 mm on a 50 cm cell), unlike the
// pinwheel whose pitch grows by its joints: this lattice has no joint-consistent pitch.
export const STEPPED = {
  tiles: [[0, 0, 30, 30], [30, 0, 50, 30], [0, 30, 50, 30], [50, 30, 50, 50], [20, 60, 30, 50]],
  a: [80, -30], b: [50, 80],
};
// Lattice vectors and cells in the pattern frame, metres ({x0, y0, x1, y1, format}).
export const steppedA = () => [STEPPED.a[0] / 100, -STEPPED.a[1] / 100];
export const steppedB = () => [STEPPED.b[0] / 100, -STEPPED.b[1] / 100];
export function steppedCells() {
  return STEPPED.tiles.map(([x, y, w, h]) => ({
    x0: x / 100, x1: (x + w) / 100, y0: -(y + h) / 100, y1: -y / 100,
    format: `${Math.min(w, h)}×${Math.max(w, h)}`,
  }));
}
const steppedArea = () => STEPPED.tiles.reduce((s, [, , w, h]) => s + w * h, 0) / 1e4;
// Area centroid of the module (pattern frame): the point centred in a region.
function steppedCentroid() {
  let sx = 0, sy = 0, sa = 0;
  for (const c of steppedCells()) {
    const a = (c.x1 - c.x0) * (c.y1 - c.y0);
    sx += a * (c.x0 + c.x1) / 2; sy += a * (c.y0 + c.y1) / 2; sa += a;
  }
  return { x: sx / sa, y: sy / sa };
}
// (x, y) → lattice coordinates (s, t) with (x, y) = s·A + t·B.
export function steppedLattice(x, y) {
  const [ax, ay] = steppedA(), [bx, by] = steppedB(), det = ax * by - ay * bx;
  return [(x * by - y * bx) / det, (ax * y - ay * x) / det];
}
// Stepped: one piece per module cell the region touches, whole vs cut, per format.
function steppedCount(boxes) {
  const cells = steppedCells(), bb = bboxOf(boxes), [ax, ay] = steppedA(), [bx, by] = steppedB();
  // Lattice range: the region's corners grown by the module's own extent (≤ 1.1 m).
  const R = 1.2, ls = [[bb.x0 - R, bb.y0 - R], [bb.x1 + R, bb.y0 - R], [bb.x0 - R, bb.y1 + R], [bb.x1 + R, bb.y1 + R]]
    .map(([x, y]) => steppedLattice(x, y));
  const lo = (i) => Math.floor(Math.min(...ls.map((l) => l[i]))), hi = (i) => Math.ceil(Math.max(...ls.map((l) => l[i])));
  const formats = {};
  let whole = 0, cut = 0;
  for (let m = lo(0); m <= hi(0); m++) {
    for (let n = lo(1); n <= hi(1); n++) {
      const ox = m * ax + n * bx, oy = m * ay + n * by;
      for (const c of cells) {
        const x0 = ox + c.x0, x1 = ox + c.x1, y0 = oy + c.y0, y1 = oy + c.y1;
        if (x1 <= bb.x0 || x0 >= bb.x1 || y1 <= bb.y0 || y0 >= bb.y1) continue;
        const a = overlapArea(boxes, x0, x1, y0, y1);
        if (a < 1e-6) continue; // a sub-mm² touch needs no piece
        const f = formats[c.format] || (formats[c.format] = { pieces: 0, whole: 0 });
        f.pieces++;
        if (a >= (x1 - x0) * (y1 - y0) * (1 - 1e-6)) { whole++; f.whole++; } else cut++;
      }
    }
  }
  return { pieces: whole + cut, whole, cut, formats };
}
// Where the stepped pattern frame sits in a region (added after the start-corner shift and
// turn, see floorRegions): with a start corner, the corner of the module's 30×30 tile that
// points into the room lands on it (a whole tile in the corner); without one, the module
// centroid lands on the region's bounding-box centre (the spec's advice: balanced cuts on
// opposite walls). `dir` = the corner's floor direction in the pattern frame.
function steppedOffset(boxes, anchor, dir, turn) {
  if (anchor) {
    const t = steppedCells()[0];
    return { x: dir[0] > 0 ? t.x0 : t.x1, y: dir[1] > 0 ? t.y0 : t.y1 };
  }
  const bb = bboxOf(boxes), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, c = steppedCentroid();
  const [u, v] = turn ? [cy, -cx] : [cx, cy];
  return { x: c.x - u, y: c.y - v };
}

// Planks: rows across the region's long axis at the global row phase. Each row is
// laid left to right; a row starts with a pooled offcut when that keeps every joint
// ≥ minStagger from the previous row's and the piece ≥ minPiece, else a fresh plank.
// Planks run along the region's long axis (shared by the count and the 3D texture).
export function plankAlongX(boxes) {
  const bb = bboxOf(boxes);
  return bb.x1 - bb.x0 >= bb.y1 - bb.y0;
}
function staggerCount(material, boxes, alongX = plankAlongX(boxes)) {
  // Work in (u along the row, v across rows) coordinates.
  const uv = boxes.map((b) => (alongX
    ? { u0: b.x0, u1: b.x1, v0: b.y0, v1: b.y1 }
    : { u0: b.y0, u1: b.y1, v0: b.x0, v1: b.x1 }));
  const L = material.w, pitch = material.h + (material.joint || 0);
  const minPiece = Math.min(0.3, L / 4), minStagger = Math.min(0.3, L / 3);
  const v0 = Math.min(...uv.map((b) => b.v0)), v1 = Math.max(...uv.map((b) => b.v1));
  let bought = 0;
  const offcuts = [];
  let prevJoints = [];
  for (let j = Math.floor(v0 / pitch); j * pitch < v1 - EPS; j++) {
    const ra = j * pitch, rb = ra + pitch;
    // Merged u-intervals of the row band.
    const spans = uv.filter((b) => Math.min(b.v1, rb) - Math.max(b.v0, ra) > 1e-4)
      .map((b) => [b.u0, b.u1]).sort((a, b) => a[0] - b[0]);
    const runs = [];
    for (const s of spans) {
      const last = runs[runs.length - 1];
      if (last && s[0] <= last[1] + EPS) last[1] = Math.max(last[1], s[1]); else runs.push([...s]);
    }
    const joints = [];
    for (const [a, b] of runs) {
      let u = a;
      const ok = (len) => len >= minPiece && prevJoints.every((p) => Math.abs(p - (a + len)) >= minStagger);
      const k = offcuts.findIndex(ok);
      let first;
      if (k >= 0) first = offcuts.splice(k, 1)[0];
      else if (ok(L)) { first = L; bought++; }
      else { first = L / 2; bought++; offcuts.push(L - first); }
      u = Math.min(b, a + first);
      if (a + first > b + EPS && a + first - b >= minPiece) offcuts.push(a + first - b);
      joints.push(u);
      while (u < b - EPS) {
        const need = b - u;
        if (need >= L) { bought++; u += L; joints.push(u); continue; }
        const m = offcuts.findIndex((o) => o >= need);
        if (m >= 0) {
          const o = offcuts.splice(m, 1)[0];
          if (o - need >= minPiece) offcuts.push(o - need);
        } else {
          bought++;
          if (L - need >= minPiece) offcuts.push(L - need);
        }
        u = b;
      }
    }
    prevJoints = joints;
  }
  return { pieces: bought, alongX };
}

// Grout (owner, 2026-09-27): kg = joint length × joint width × depth × density, the
// usual manufacturer formula kg/m² = (A + B) / (A × B) × C × D × ρ generalised to the
// pattern's joint length per m². Depth D = the tile thickness (a full-depth joint;
// 10 mm when the product has none); ρ = 1.6 kg/dm³, a typical cement grout (not a chosen
// product: check the bag). No waste margin. Plank patterns (click floors), paint and
// joint-free products have none (null).
export const GROUT_DENSITY = 1600; // kg/m³
const GROUT_DEFAULT_DEPTH = 0.01;
export function jointLengthPerM2(material) {
  const { pattern, w, h } = material;
  if (pattern === 'pinwheel') {
    // Each tile owns half its perimeter: Σ (w + h) over the 9 cells per 1.30 m module.
    const len = PINWHEEL.reduce((sum, [, , cw, ch]) => sum + (cw + ch) / 100, 0);
    return len / (1.3 * 1.3);
  }
  if (pattern === 'stepped') {
    const len = STEPPED.tiles.reduce((sum, [, , cw, ch]) => sum + (cw + ch) / 100, 0);
    return len / steppedArea();
  }
  if (pattern === 'octagon') {
    // Per lattice cell: half an octagon (8 sides) + half a cabochon (4 equal sides).
    const side = w / (1 + Math.SQRT2);
    return (6 * side) / (w * w);
  }
  if (pattern === 'grid' || pattern === 'brick') {
    // A mosaic sheet is sticks: its joints are the sticks' (the sheet's own edges included).
    const [cols, rows] = material.mosaic || [1, 1];
    const a = w / cols, b = h / rows;
    return (a + b) / (a * b);
  }
  return 0;
}
export function groutKg(material, area) {
  if (!material || !(material.joint > 0) || !(area > 0)) return null;
  const perM2 = jointLengthPerM2(material);
  if (!perM2) return null;
  return area * perM2 * material.joint * (material.thickness || GROUT_DEFAULT_DEPTH) * GROUT_DENSITY;
}

// `alongX` (planks only) overrides the long-axis rule (a turned region, below).
export function countPieces(material, boxes, { alongX } = {}) {
  const area = boxesArea(boxes);
  if (!material || !boxes.length) return { area, pieces: 0 };
  if (material.pattern === 'paint' || !(material.w > 0 && material.h > 0)) return { area, pieces: 0 };
  const counted = material.pattern === 'stagger' ? staggerCount(material, boxes, alongX ?? plankAlongX(boxes))
    : material.pattern === 'pinwheel' ? pinwheelCount(material, boxes)
      : material.pattern === 'stepped' ? steppedCount(boxes) : latticeCount(material, boxes);
  // Naive estimate beside it: area ÷ piece area + 10 % waste (mixed formats: the mean piece).
  const piece = material.pattern === 'pinwheel' ? 1.69 / PINWHEEL.length
    : material.pattern === 'stepped' ? steppedArea() / STEPPED.tiles.length : material.w * material.h;
  const naive = Math.ceil(area / piece * 1.1);
  return { area, ...counted, naive, grout: groutKg(material, area) };
}

// ---- floor regions -------------------------------------------------------------
const touches = (a, b, gap = TOUCH) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -gap && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -gap
  && (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > EPS);

// The floor finish held by any rect of a room component.
function componentFinish(floor, component) {
  return (floor.finishes || []).find((f) => !f.target?.edge && component.ids.has(f.target?.rect)) || null;
}

// ---- pattern start corner ----------------------------------------------------------
// A laying region's pattern may start at one of its corners instead of the plan origin
// (owner, 2026-09-27): a floor finish's `anchor` = { rect, corner: bl|br|tl|tr } names a
// corner of a ROOM rect (b = min y, l = min x), so it follows the walls when the plan is
// edited. It resolves to the region's own outline corner of the same type nearest that
// rect corner: the laid floor stops at wall/insulation linings, so its real corner can
// sit inside the rect's. One anchor per region; with several, the first finish wins.
export const CORNERS = ['bl', 'br', 'tl', 'tr'];
const rectCorner = (b, corner) => ({ x: corner[1] === 'l' ? b.x0 : b.x1, y: corner[0] === 'b' ? b.y0 : b.y1 });
const inBoxes = (boxes, x, y) => boxes.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
// Convex outline corners of a box set: [{x, y, corner}], the region filling only the
// quadrant the corner type points into (a 'bl' corner has floor up and to the right).
export function regionCorners(boxes) {
  const seen = new Set(), out = [], e = 1e-4;
  for (const b of boxes) {
    for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      const key = `${x.toFixed(5)},${y.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const q = { tr: inBoxes(boxes, x + e, y + e), tl: inBoxes(boxes, x - e, y + e),
        br: inBoxes(boxes, x + e, y - e), bl: inBoxes(boxes, x - e, y - e) };
      const filled = Object.keys(q).filter((k) => q[k]);
      if (filled.length !== 1) continue;
      // The filled quadrant is where the floor is; the corner type is the opposite side.
      const corner = { tr: 'bl', tl: 'br', br: 'tl', bl: 'tr' }[filled[0]];
      out.push({ x, y, corner });
    }
  }
  return out;
}
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
// The plan point {x, y, corner} a region's pattern starts at, or null (the plan origin).
export function resolveAnchor(rects, anchor, boxes) {
  const rect = anchor && rects.find((r) => r.id === anchor.rect);
  if (!rect || !CORNERS.includes(anchor.corner)) return null;
  const p = rectCorner(rect.bounds, anchor.corner);
  const same = regionCorners(boxes).filter((c) => c.corner === anchor.corner);
  if (!same.length) return { ...p, corner: anchor.corner };
  const best = same.reduce((m, c) => (dist2(c, p) < dist2(m, p) ? c : m));
  return { x: best.x, y: best.y, corner: anchor.corner };
}
// The anchor for the region corner nearest plan point (px, py): the room rect of the
// region whose same-type corner is nearest that outline corner. `rects` = the region's
// room rects. Returns { anchor: {rect, corner}, point } or null.
export function anchorNear(rects, boxes, px, py) {
  const corners = regionCorners(boxes);
  if (!corners.length || !rects.length) return null;
  const c = corners.reduce((m, k) => (dist2(k, { x: px, y: py }) < dist2(m, { x: px, y: py }) ? k : m));
  const rect = rects.reduce((m, r) => (dist2(rectCorner(r.bounds, c.corner), c) < dist2(rectCorner(m.bounds, c.corner), c) ? r : m));
  return { anchor: { rect: rect.id, corner: c.corner }, point: { x: c.x, y: c.y } };
}
// A region may also turn its pattern 90° (`turn`, owner 2026-09-27: the mosaic sticks and
// the planks have a direction). Planks just swap to the other axis (they already follow the
// region's long axis). Every other pattern turns about the start point: its own frame is
// (u, v) = (y, −x) of the shifted plan, in the takeoff and the 3D UVs alike.
const turnBoxes = (boxes) => boxes.map((b) => ({ ...b, x0: b.y0, x1: b.y1, y0: -b.x1, y1: -b.x0 }));
const shiftBoxes = (boxes, a) => (a ? boxes.map((b) => ({ ...b, x0: b.x0 - a.x, x1: b.x1 - a.x, y0: b.y0 - a.y, y1: b.y1 - a.y })) : boxes);

// Half of a doorway box on the side of `component` (across the doorway's short axis).
function doorwayHalf(door, component) {
  const b = door.bounds;
  const acrossX = b.x1 - b.x0 < b.y1 - b.y0; // the thin axis crosses the wall
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const rc = component.rectangles.map((r) => r.bounds)
    .filter((rb) => touches(rb, b))
    .map((rb) => (acrossX ? (rb.x0 + rb.x1) / 2 : (rb.y0 + rb.y1) / 2));
  const side = rc.length ? rc.reduce((s, v) => s + v, 0) / rc.length : (acrossX ? cx : cy);
  if (acrossX) return side < cx ? { ...b, x1: cx } : { ...b, x0: cx };
  return side < cy ? { ...b, y1: cy } : { ...b, y0: cy };
}

export function floorRegions(project, floor, { count = true } = {}) {
  const rects = floor.rectangles || [];
  const components = connectedRoomComponents(rects);
  const finishes = components.map((c) => componentFinish(floor, c));
  const mats = finishes.map((f) => (materialById(project, f?.material) ? f.material : null));
  const parent = components.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const adds = components.map(() => []);
  const merged = []; // [doorBounds, compIndex] for doorways fully inside one region
  for (const door of rects) {
    if (!DOORWAY_KINDS.has(zoneKind(door))) continue;
    const touching = components.map((c, i) => i)
      .filter((i) => components[i].rectangles.some((r) => touches(r.bounds, door.bounds)));
    const withMat = touching.filter((i) => mats[i]);
    if (withMat.length === 2 && mats[withMat[0]] === mats[withMat[1]]) {
      parent[find(withMat[0])] = find(withMat[1]);
      merged.push([door.bounds, withMat[0]]);
    } else {
      for (const i of withMat) adds[i].push(doorwayHalf(door, components[i]));
    }
  }
  const excludes = rects.filter((r) => r.op === 'subtract' && zoneKind(r) !== 'furniture').map((r) => r.bounds);
  const groups = new Map();
  components.forEach((c, i) => {
    if (!mats[i]) return;
    const root = find(i);
    const g = groups.get(root) || { material: mats[i], rectIds: new Set(), rects: [], include: [], add: [], anchor: null };
    for (const r of c.rectangles) { g.rectIds.add(r.id); g.rects.push(r); g.include.push(r.bounds); }
    g.add.push(...adds[i]);
    g.anchor ??= finishes[i]?.anchor || null;
    g.turn ??= finishes[i]?.turn ?? null;
    groups.set(root, g);
  });
  for (const [bounds, i] of merged) groups.get(find(i))?.add.push(bounds);
  return [...groups.values()].map((g) => {
    const boxes = regionBoxes(g.include, excludes, g.add);
    const material = materialById(project, g.material);
    // The pattern starts at `anchor` (plan point) or the plan origin: count in the
    // pattern's own frame by shifting the region, not the lattice.
    const anchor = resolveAnchor(g.rects, g.anchor, boxes);
    const turn = !!g.turn, plank = material?.pattern === 'stagger';
    // alongX: planks' row axis (the long axis, swapped by a turn); other patterns never swap.
    const alongX = plank ? plankAlongX(boxes) !== turn : true;
    const local = shiftBoxes(boxes, anchor);
    const framed = turn && !plank ? turnBoxes(local) : local;
    // A stepped pattern also moves within its frame (steppedOffset); the 3D UVs add the
    // same `frameOffset`, so the picture and the count stay one layout.
    let frameOffset = null;
    if (material?.pattern === 'stepped') {
      const d = anchor ? [anchor.corner[1] === 'l' ? 1 : -1, anchor.corner[0] === 'b' ? 1 : -1] : [1, 1];
      frameOffset = steppedOffset(boxes, anchor, turn ? [d[1], -d[0]] : d, turn);
    }
    const pattern = frameOffset ? shiftBoxes(framed, { x: -frameOffset.x, y: -frameOffset.y }) : framed;
    return { floorId: floor.id, material: g.material, rectIds: g.rectIds, rects: g.rects, boxes, anchor,
      turn, alongX, patternTurn: turn && !plank, frameOffset,
      count: count ? countPieces(material, pattern, { alongX }) : null };
  });
}

// ---- wall faces ----------------------------------------------------------------
// The parts of a room rect's edge on its component boundary: [{a, b}] along the edge's
// axis (plan coordinate), with the edge line `at` and the inward normal sign.
export function edgeFace(floor, rect, edge) {
  const b = rect.bounds;
  const vertical = edge === 'left' || edge === 'right';
  const at = edge === 'left' ? b.x0 : edge === 'right' ? b.x1 : edge === 'bottom' ? b.y0 : b.y1;
  const inward = edge === 'left' || edge === 'bottom' ? 1 : -1;
  const lo = vertical ? b.y0 : b.x0, hi = vertical ? b.y1 : b.x1;
  // Stairs are circulation space: a room edge onto a stairwell is open, with no wall
  // (the same rule architecturalWallBoxes uses), so it is not a wall face.
  const rooms = (floor.rectangles || []).filter((r) => r !== rect
    && ['room', 'stairs_up', 'stairs_down'].includes(zoneKind(r)));
  const cuts = new Set([lo, hi]);
  for (const r of rooms) {
    const rb = r.bounds;
    for (const v of vertical ? [rb.y0, rb.y1] : [rb.x0, rb.x1]) if (v > lo && v < hi) cuts.add(v);
  }
  const C = [...cuts].sort((p, q) => p - q);
  const out = [];
  const probe = at - inward * 1e-3; // just outside the room
  for (let i = 0; i < C.length - 1; i++) {
    const m = (C[i] + C[i + 1]) / 2;
    const px = vertical ? probe : m, py = vertical ? m : probe;
    if (rooms.some((r) => within(r.bounds, px, py))) continue; // interior seam, not a wall
    const last = out[out.length - 1];
    if (last && Math.abs(last.b - C[i]) <= EPS) last.b = C[i + 1]; else out.push({ a: C[i], b: C[i + 1] });
  }
  return { vertical, at, inward, segments: insetSegments(floor, vertical, at, inward, out) };
}

// The finished surface is often INSIDE the room rect: a wall or insulation lining
// zone drawn over the room edge (owner's house: 18–21 cm linings on Ground/Upper).
// Split each boundary segment where linings start/stop, and give every piece its
// `inset` = how far the lining(s) reach into the room from the edge line. Stacked
// linings (wall then insulation) chain. Pieces with equal insets re-merge.
const LINING_KINDS = new Set(['wall', 'insulation']);
function insetSegments(floor, vertical, at, inward, segments) {
  const linings = (floor.rectangles || []).filter((r) => LINING_KINDS.has(zoneKind(r))).map((r) => {
    const b = r.bounds;
    return vertical ? { n0: b.x0, n1: b.x1, u0: b.y0, u1: b.y1 } : { n0: b.y0, n1: b.y1, u0: b.x0, u1: b.x1 };
  });
  const out = [];
  for (const seg of segments) {
    const cuts = new Set([seg.a, seg.b]);
    for (const l of linings) for (const v of [l.u0, l.u1]) if (v > seg.a && v < seg.b) cuts.add(v);
    const C = [...cuts].sort((p, q) => p - q);
    for (let i = 0; i < C.length - 1; i++) {
      if (C[i + 1] - C[i] < 1e-3) continue; // float slivers
      const m = (C[i] + C[i + 1]) / 2;
      let inset = 0, covered = false;
      for (let guard = 0; guard < 4 && !covered; guard++) { // follow chained linings inward
        const face = at + inward * inset;
        let reach = inset;
        for (const l of linings) {
          if (!(m > l.u0 && m < l.u1)) continue;
          // The lining must touch the current surface and extend into the room.
          const near = inward > 0 ? l.n0 : l.n1, far = inward > 0 ? l.n1 : l.n0;
          if ((near - face) * inward > 0.01 || (far - face) * inward <= EPS) continue;
          // Deeper than it runs along this edge = it crosses this wall (the corner end of
          // a lining along the NEIGHBOUR wall): that stretch is hidden, not inset.
          if ((far - face) * inward > l.u1 - l.u0) { covered = true; break; }
          reach = Math.max(reach, (far - at) * inward);
        }
        if (covered || reach <= inset + EPS) break;
        inset = reach;
      }
      if (covered) continue;
      const last = out[out.length - 1];
      if (last && Math.abs(last.b - C[i]) <= EPS && Math.abs(last.inset - inset) <= EPS) last.b = C[i + 1];
      else out.push({ a: C[i], b: C[i + 1], inset });
    }
  }
  return out;
}

// ---- half walls standing inside a room ---------------------------------------
// A half wall inside a room is a free-standing low wall (architectural3d.js): its sides
// facing the room and its top take wall finishes like a room face (owner, 2026-10-04),
// and the room faces it stands against are hidden below its top.
const roomBoxesOf = (floor) => (floor.rectangles || []).filter((r) => zoneKind(r) === 'room').map((r) => r.bounds);
const inRoomsAt = (rooms, b) => {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return rooms.some((q) => cx > q.x0 && cx < q.x1 && cy > q.y0 && cy < q.y1);
};
export function isInRoomHalfWall(floor, rect) {
  return !!rect && zoneKind(rect) === 'halfwall' && inRoomsAt(roomBoxesOf(floor), rect.bounds);
}
export function inRoomHalfWalls(floor) {
  const rooms = roomBoxesOf(floor);
  return (floor.rectangles || []).filter((r) => zoneKind(r) === 'halfwall' && inRoomsAt(rooms, r.bounds));
}
// Its height: the opening band starts at `sill` (architectural3d.js openingBand).
export const halfWallTop = (floor, rect) => Math.min(rect.sill ?? 1.1, floor.height || 2.8);

// A side of an in-room half wall as a face (edgeFace's shape: `inward` points away from
// the half wall, into the room). Exposed where just in front of it is room floor, not a
// wall, lining or another half wall; a side against a wall has no segments.
export function halfWallFace(floor, rect, edge) {
  const b = rect.bounds;
  const vertical = edge === 'left' || edge === 'right';
  const at = edge === 'left' ? b.x0 : edge === 'right' ? b.x1 : edge === 'bottom' ? b.y0 : b.y1;
  const inward = edge === 'left' || edge === 'bottom' ? -1 : 1;
  const lo = vertical ? b.y0 : b.x0, hi = vertical ? b.y1 : b.x1;
  const rooms = roomBoxesOf(floor);
  const blockers = (floor.rectangles || []).filter((r) => r !== rect
    && ['wall', 'insulation', 'halfwall'].includes(zoneKind(r))).map((r) => r.bounds);
  const cuts = new Set([lo, hi]);
  for (const q of [...rooms, ...blockers]) {
    for (const v of vertical ? [q.y0, q.y1] : [q.x0, q.x1]) if (v > lo && v < hi) cuts.add(v);
  }
  const C = [...cuts].sort((p, q) => p - q);
  const probe = at + inward * 0.01; // 1 cm in front of the side
  const segments = [];
  for (let i = 0; i < C.length - 1; i++) {
    const m = (C[i] + C[i + 1]) / 2;
    const px = vertical ? probe : m, py = vertical ? m : probe;
    if (!rooms.some((q) => within(q, px, py)) || blockers.some((q) => within(q, px, py))) continue;
    const last = segments[segments.length - 1];
    if (last && Math.abs(last.b - C[i]) <= EPS) last.b = C[i + 1]; else segments.push({ a: C[i], b: C[i + 1], inset: 0 });
  }
  return { vertical, at, inward, segments, halfWall: true };
}

// The top of an in-room half wall: one box with u along its long side (so a tile's
// width runs along it, as on a face) and v across; `alongX` says which plan axis u is.
export function halfWallCap(floor, rect) {
  const b = rect.bounds;
  const alongX = b.x1 - b.x0 >= b.y1 - b.y0;
  const box = alongX ? { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 } : { x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 };
  return { face: { cap: true, alongX, z: halfWallTop(floor, rect) }, boxes: [box] };
}

// A wall face as (u, v) boxes: u = plan coordinate along the edge (global origin),
// v = height above the floor. Door/window openings piercing the face are excluded, and
// so is the part hidden behind an in-room half wall standing against it. A half wall's
// own side runs from the floor to its top; its `cap` is halfWallCap.
export function wallFaceBoxes(floor, rect, edge) {
  if (zoneKind(rect) === 'halfwall') {
    if (edge === CAP) return halfWallCap(floor, rect);
    const face = halfWallFace(floor, rect, edge), top = halfWallTop(floor, rect);
    return { face, boxes: face.segments.map((s) => ({ x0: s.a, x1: s.b, y0: 0, y1: top, inset: 0 })) };
  }
  const face = edgeFace(floor, rect, edge);
  const H = floor.height || 2.8;
  const include = face.segments.map((s) => ({ x0: s.a, x1: s.b, y0: 0, y1: H }));
  const exclude = [];
  // A half wall standing inside a room is a free-standing low wall, not a gap in the
  // wall mass: it opens no face (as in architecturalWallBoxes).
  const rooms = roomBoxesOf(floor);
  const inRoom = (b) => inRoomsAt(rooms, b);
  for (const r of floor.rectangles || []) {
    if (!OPENING_KINDS.has(zoneKind(r))) continue;
    const rb = r.bounds;
    if (zoneKind(r) === 'halfwall' && inRoom(rb)) continue;
    const [n0, n1] = face.vertical ? [rb.x0, rb.x1] : [rb.y0, rb.y1];
    // The opening sits in the wall mass just behind the face (outside the room).
    const behind0 = face.inward > 0 ? face.at - FACE_DEPTH : face.at - TOUCH;
    const behind1 = face.inward > 0 ? face.at + TOUCH : face.at + FACE_DEPTH;
    if (Math.min(n1, behind1) - Math.max(n0, behind0) <= EPS) continue;
    const [u0, u1] = face.vertical ? [rb.y0, rb.y1] : [rb.x0, rb.x1];
    const sill = r.sill || 0, head = r.head == null ? H : Math.min(H, r.head);
    if (head - sill > EPS) exclude.push({ x0: u0, x1: u1, y0: sill, y1: head });
  }
  // Hidden behind an in-room half wall whose side touches the finished surface (within
  // 3 cm): from the floor to its top, over its length along the face.
  for (const r of inRoomHalfWalls(floor)) {
    const rb = r.bounds;
    const near = face.inward > 0 ? (face.vertical ? rb.x0 : rb.y0) : (face.vertical ? rb.x1 : rb.y1);
    const [u0, u1] = face.vertical ? [rb.y0, rb.y1] : [rb.x0, rb.x1];
    const touches = face.segments.some((sg) => Math.min(sg.b, u1) - Math.max(sg.a, u0) > EPS
      && Math.abs(near - (face.at + face.inward * sg.inset)) <= 0.03);
    if (touches) exclude.push({ x0: u0, x1: u1, y0: 0, y1: halfWallTop(floor, r) });
  }
  // Per segment, so each box keeps its segment's lining `inset` (regionBoxes would
  // merge neighbouring segments that sit at different depths).
  const boxes = include.flatMap((inc, i) =>
    regionBoxes([inc], exclude).map((box) => ({ ...box, inset: face.segments[i].inset })));
  return { face, boxes };
}

// Geometry-only view of one floor's finishes for the 3D view: no piece counting
// (that runs per model change on desktop; the texture does not need it).
// A wall-finish target rect: a room, or a half wall standing inside one.
const wallTargetIds = (floor) => new Set([
  ...(floor.rectangles || []).filter((r) => zoneKind(r) === 'room').map((r) => r.id),
  ...inRoomHalfWalls(floor).map((r) => r.id),
]);
export function finishSurfaces(project, floor) {
  const roomIds = wallTargetIds(floor);
  const floors = floorRegions(project, floor, { count: false })
    .map((r) => ({ material: r.material, boxes: r.boxes, anchor: r.anchor, alongX: r.alongX, patternTurn: r.patternTurn,
      frameOffset: r.frameOffset }));
  const walls = [];
  for (const f of floor.finishes || []) {
    if (!f.target?.edge || !roomIds.has(f.target.rect) || !materialById(project, f.material)) continue;
    const rect = floor.rectangles.find((r) => r.id === f.target.rect);
    walls.push({ material: f.material, ...wallFaceBoxes(floor, rect, f.target.edge) });
  }
  return { floors, walls };
}

// ---- whole-house takeoff ---------------------------------------------------------
export function materialTakeoff(project) {
  const regions = [], walls = [];
  for (const floor of project.floors || []) {
    const roomIds = wallTargetIds(floor);
    regions.push(...floorRegions(project, floor));
    for (const f of floor.finishes || []) {
      if (!f.target?.edge || !roomIds.has(f.target.rect)) continue;
      const material = materialById(project, f.material);
      if (!material) continue;
      const rect = floor.rectangles.find((r) => r.id === f.target.rect);
      const { face, boxes } = wallFaceBoxes(floor, rect, f.target.edge);
      walls.push({ floorId: floor.id, rectId: rect.id, edge: f.target.edge, material: f.material, face, boxes,
        count: countPieces(material, boxes) });
    }
  }
  // Whole-house totals per product; packs rounded once (owner decision).
  const totals = new Map();
  for (const item of [...regions, ...walls]) {
    const t = totals.get(item.material) || { area: 0, pieces: 0, cabochons: 0 };
    t.area += item.count.area; t.pieces += item.count.pieces || 0; t.cabochons += item.count.cabochons || 0;
    if (item.count.grout != null) t.grout = (t.grout || 0) + item.count.grout;
    for (const [k, f] of Object.entries(item.count.formats || {})) {
      t.formats ??= {};
      const tf = t.formats[k] || (t.formats[k] = { pieces: 0, whole: 0 });
      tf.pieces += f.pieces; tf.whole += f.whole;
    }
    totals.set(item.material, t);
  }
  for (const [id, t] of totals) {
    const pack = materialById(project, id)?.pack || {};
    t.packs = pack.pieces ? Math.ceil(t.pieces / pack.pieces) : pack.area ? Math.ceil(t.area / pack.area) : null;
    if (t.formats) { // mixed formats: each is its own article and box; packs only when all are known
      t.packsByFormat = Object.fromEntries(Object.entries(t.formats)
        .map(([k, f]) => [k, pack.formats?.[k] ? Math.ceil(f.pieces / pack.formats[k]) : null]));
      const known = Object.values(t.packsByFormat);
      t.packs = known.every((n) => n != null) ? known.reduce((a, n) => a + n, 0) : null;
    }
  }
  return { regions, walls, totals };
}
