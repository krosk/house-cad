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
//
// Continuity (owner decisions): every pattern is anchored at the plan origin, so equal
// materials line up everywhere. Rooms with the SAME floor material joined through a
// doorway (door/sliding/garage zone touching both) are ONE laying region that includes
// the doorway strip; different materials each run to the middle of the doorway. Packs
// are rounded once per product for the whole house.

import { connectedRoomComponents } from './geometry2d.js';
import { zoneKind } from './zoneColors.js';
import { materialById } from './materials.js';

const EPS = 1e-6;
// Door-family zones a floor runs through (full-height openings).
const DOORWAY_KINDS = new Set(['door', 'sliding', 'garage']);
// Openings cut out of a wall face's area. A half wall is open ABOVE its sill (its
// `head` is null → the band runs to the ceiling), so it cuts the face there too.
const OPENING_KINDS = new Set(['door', 'sliding', 'garage', 'window', 'halfwall']);
// A doorway/opening belongs to a room or face within this gap (AR-authored plans are
// rarely exact to the millimetre; a real wall is thicker than this is loose).
const TOUCH = 0.05;
// How far behind a wall face an opening zone may sit and still pierce it.
const FACE_DEPTH = 0.45;
export const EDGES = ['left', 'right', 'bottom', 'top'];

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

// Planks: rows across the region's long axis at the global row phase. Each row is
// laid left to right; a row starts with a pooled offcut when that keeps every joint
// ≥ minStagger from the previous row's and the piece ≥ minPiece, else a fresh plank.
// Planks run along the region's long axis (shared by the count and the 3D texture).
export function plankAlongX(boxes) {
  const bb = bboxOf(boxes);
  return bb.x1 - bb.x0 >= bb.y1 - bb.y0;
}
function staggerCount(material, boxes) {
  const alongX = plankAlongX(boxes);
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

export function countPieces(material, boxes) {
  const area = boxesArea(boxes);
  if (!material || !boxes.length) return { area, pieces: 0 };
  if (material.pattern === 'paint' || !(material.w > 0 && material.h > 0)) return { area, pieces: 0 };
  const counted = material.pattern === 'stagger' ? staggerCount(material, boxes) : latticeCount(material, boxes);
  // Naive estimate beside it: area ÷ piece area + 10 % waste.
  const naive = Math.ceil(area / (material.w * material.h) * 1.1);
  return { area, ...counted, naive };
}

// ---- floor regions -------------------------------------------------------------
const touches = (a, b, gap = TOUCH) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -gap && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -gap
  && (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > EPS);

// The floor finish (material id) held by any rect of a room component.
function componentMaterial(floor, component) {
  for (const f of floor.finishes || []) {
    if (!f.target?.edge && component.ids.has(f.target?.rect)) return f.material;
  }
  return null;
}

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
  const mats = components.map((c) => {
    const id = componentMaterial(floor, c);
    return materialById(project, id) ? id : null;
  });
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
    const g = groups.get(root) || { material: mats[i], rectIds: new Set(), include: [], add: [] };
    for (const r of c.rectangles) { g.rectIds.add(r.id); g.include.push(r.bounds); }
    g.add.push(...adds[i]);
    groups.set(root, g);
  });
  for (const [bounds, i] of merged) groups.get(find(i))?.add.push(bounds);
  return [...groups.values()].map((g) => {
    const boxes = regionBoxes(g.include, excludes, g.add);
    const material = materialById(project, g.material);
    return { floorId: floor.id, material: g.material, rectIds: g.rectIds, boxes,
      count: count ? countPieces(material, boxes) : null };
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

// A wall face as (u, v) boxes: u = plan coordinate along the edge (global origin),
// v = height above the floor. Door/window openings piercing the face are excluded.
export function wallFaceBoxes(floor, rect, edge) {
  const face = edgeFace(floor, rect, edge);
  const H = floor.height || 2.8;
  const include = face.segments.map((s) => ({ x0: s.a, x1: s.b, y0: 0, y1: H }));
  const exclude = [];
  for (const r of floor.rectangles || []) {
    if (!OPENING_KINDS.has(zoneKind(r))) continue;
    const rb = r.bounds;
    const [n0, n1] = face.vertical ? [rb.x0, rb.x1] : [rb.y0, rb.y1];
    // The opening sits in the wall mass just behind the face (outside the room).
    const behind0 = face.inward > 0 ? face.at - FACE_DEPTH : face.at - TOUCH;
    const behind1 = face.inward > 0 ? face.at + TOUCH : face.at + FACE_DEPTH;
    if (Math.min(n1, behind1) - Math.max(n0, behind0) <= EPS) continue;
    const [u0, u1] = face.vertical ? [rb.y0, rb.y1] : [rb.x0, rb.x1];
    const sill = r.sill || 0, head = r.head == null ? H : Math.min(H, r.head);
    if (head - sill > EPS) exclude.push({ x0: u0, x1: u1, y0: sill, y1: head });
  }
  // Per segment, so each box keeps its segment's lining `inset` (regionBoxes would
  // merge neighbouring segments that sit at different depths).
  const boxes = include.flatMap((inc, i) =>
    regionBoxes([inc], exclude).map((box) => ({ ...box, inset: face.segments[i].inset })));
  return { face, boxes };
}

// Geometry-only view of one floor's finishes for the 3D view: no piece counting
// (that runs per model change on desktop; the texture does not need it).
export function finishSurfaces(project, floor) {
  const roomIds = new Set((floor.rectangles || []).filter((r) => zoneKind(r) === 'room').map((r) => r.id));
  const floors = floorRegions(project, floor, { count: false })
    .map((r) => ({ material: r.material, boxes: r.boxes, alongX: plankAlongX(r.boxes) }));
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
    const roomIds = new Set((floor.rectangles || []).filter((r) => zoneKind(r) === 'room').map((r) => r.id));
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
    totals.set(item.material, t);
  }
  for (const [id, t] of totals) {
    const pack = materialById(project, id)?.pack || {};
    t.packs = pack.pieces ? Math.ceil(t.pieces / pack.pieces) : pack.area ? Math.ceil(t.area / pack.area) : null;
  }
  return { regions, walls, totals };
}
