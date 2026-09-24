// Shared architectural 3D geometry for desktop view mode and, later, optional AR.
// Unlike the legacy massing mesh (ROOM = full-height solid), this interprets rooms
// as floor area, derives an exterior wall shell from their exposed perimeter, and
// renders explicit WALL zones as interior wall solids. Aperture bands cut those
// wall solids in Z without introducing a general-purpose 3D CSG dependency.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeFootprint } from './geometry2d.js';
import { extrudeFootprint } from './extrude.js';
import { zoneKind } from './zoneColors.js';

export const ARCH_WALL_THICKNESS = 0.12;
export const ARCH_SLAB_THICKNESS = 0.06;
const EPS = 1e-7;
const WALL_ZONE_KINDS = new Set(['wall', 'door', 'garage', 'window', 'halfwall', 'sliding']);

const validBounds = (b) => b && b.x1 - b.x0 > EPS && b.y1 - b.y0 > EPS;
const clipped = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function openingBand(rect, storeyHeight) {
  const kind = zoneKind(rect);
  if (kind === 'door' || kind === 'garage' || kind === 'sliding') {
    return [0, clipped(rect.head ?? 2.1, 0, storeyHeight)];
  }
  if (kind === 'window') {
    return [
      clipped(rect.sill ?? 0.9, 0, storeyHeight),
      clipped(rect.head ?? 2.1, 0, storeyHeight),
    ];
  }
  if (kind === 'halfwall') {
    return [clipped(rect.sill ?? 1.1, 0, storeyHeight), storeyHeight];
  }
  return null; // heaters are solid fixtures, not wall openings
}

function exteriorWallSources(roomFootprint, thickness) {
  const sources = [];
  const seen = new Set();
  for (const polygon of roomFootprint) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
        const key = ax < bx || (ax === bx && ay <= by)
          ? `${ax},${ay}:${bx},${by}` : `${bx},${by}:${ax},${ay}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (Math.abs(ax - bx) <= EPS) {
          // polygon-clipping orients every boundary so the occupied room lies
          // on the LEFT of its directed edge. The wall therefore grows only
          // to the RIGHT: the authored line remains the finished room face.
          const outward = by > ay ? 1 : -1;
          sources.push({
            x0: outward > 0 ? ax : ax - thickness,
            x1: outward > 0 ? ax + thickness : ax,
            y0: Math.min(ay, by), y1: Math.max(ay, by),
            source: 'exterior',
          });
        } else if (Math.abs(ay - by) <= EPS) {
          const outward = bx > ax ? -1 : 1;
          sources.push({
            x0: Math.min(ax, bx), x1: Math.max(ax, bx),
            y0: outward > 0 ? ay : ay - thickness,
            y1: outward > 0 ? ay + thickness : ay,
            source: 'exterior',
          });
        }
      }
    }
  }
  return sources;
}

function splitWallByOpenings(source, storeyHeight, openings) {
  const overlaps = openings.flatMap((opening) => {
    const b = opening.rect.bounds;
    const x0 = Math.max(source.x0, b.x0), x1 = Math.min(source.x1, b.x1);
    const y0 = Math.max(source.y0, b.y0), y1 = Math.min(source.y1, b.y1);
    if (x1 - x0 <= EPS || y1 - y0 <= EPS || opening.z1 - opening.z0 <= EPS) return [];
    return [{ x0, x1, y0, y1, z0: opening.z0, z1: opening.z1 }];
  });
  if (!overlaps.length) return [{ ...source, z0: 0, z1: storeyHeight }];

  const xs = new Set([source.x0, source.x1]);
  const ys = new Set([source.y0, source.y1]);
  const zs = new Set([0, storeyHeight]);
  for (const o of overlaps) {
    xs.add(o.x0); xs.add(o.x1); ys.add(o.y0); ys.add(o.y1); zs.add(o.z0); zs.add(o.z1);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  const boxes = [];
  for (let xi = 0; xi < X.length - 1; xi++) {
    for (let yi = 0; yi < Y.length - 1; yi++) {
      for (let zi = 0; zi < Z.length - 1; zi++) {
        const box = { x0: X[xi], x1: X[xi + 1], y0: Y[yi], y1: Y[yi + 1], z0: Z[zi], z1: Z[zi + 1] };
        if (box.x1 - box.x0 <= EPS || box.y1 - box.y0 <= EPS || box.z1 - box.z0 <= EPS) continue;
        const mx = (box.x0 + box.x1) / 2, my = (box.y0 + box.y1) / 2, mz = (box.z0 + box.z1) / 2;
        const cut = overlaps.some((o) => mx > o.x0 - EPS && mx < o.x1 + EPS
          && my > o.y0 - EPS && my < o.y1 + EPS
          && mz > o.z0 - EPS && mz < o.z1 + EPS);
        if (!cut) boxes.push({ ...box, source: source.source });
      }
    }
  }
  return boxes;
}

// Pure box description, exported so architectural interpretation can be verified
// in Node without constructing a WebGL renderer.
export function architecturalWallBoxes(floor, { wallThickness = ARCH_WALL_THICKNESS } = {}) {
  const height = Math.max(0, floor?.height || 0);
  if (height <= EPS) return [];
  const rectangles = floor?.rectangles || [];
  const rooms = rectangles.filter((rect) => zoneKind(rect) === 'room' && validBounds(rect.bounds));
  const roomFootprint = computeFootprint(rooms);
  const sources = exteriorWallSources(roomFootprint, wallThickness);
  for (const rect of rectangles) {
    const kind = zoneKind(rect);
    if (!WALL_ZONE_KINDS.has(kind) || !validBounds(rect.bounds)) continue;
    // An aperture zone is itself a wall segment carrying an opening band. This
    // matters for interior doors/windows authored between adjacent wall pieces,
    // where there may be no overlapping generic WALL rectangle to carve.
    sources.push({ ...rect.bounds, source: kind === 'wall' ? 'interior' : `aperture:${kind}` });
  }
  const openings = rectangles.flatMap((rect) => {
    const band = openingBand(rect, height);
    return band && validBounds(rect.bounds) ? [{ rect, z0: band[0], z1: band[1] }] : [];
  });
  return sources.flatMap((source) => splitWallByOpenings(source, height, openings));
}

function boxesGeometry(boxes) {
  const geometries = boxes.map((b) => {
    const geometry = new THREE.BoxGeometry(b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0);
    geometry.translate((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, -(b.y0 + b.y1) / 2);
    return geometry;
  });
  if (!geometries.length) return null;
  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
  if (geometries.length > 1) geometries.forEach((geometry) => geometry.dispose());
  merged.computeVertexNormals();
  return merged;
}

// Extract only real axis-aligned creases from the UNION of the generated wall
// boxes. EdgesGeometry cannot be used here: the opening splitter creates many
// adjacent boxes, and it would reveal every coplanar implementation seam.
// Around a genuine crease, occupancy of the four quadrants perpendicular to the
// edge is 1/3 (outer/inner corner) or two diagonal quadrants. Two adjacent occupied
// quadrants are merely one flat face and are intentionally suppressed.
function boxesOutlineGeometry(boxes) {
  if (!boxes.length) return null;
  const groups = new Map();
  const q = (v) => Math.round(v / EPS) * EPS;
  const add = (axis, a, b, lo, hi) => {
    const key = `${axis}:${q(a)}:${q(b)}`;
    let group = groups.get(key);
    if (!group) groups.set(key, group = { axis, a: q(a), b: q(b), cuts: new Set() });
    group.cuts.add(q(lo)); group.cuts.add(q(hi));
  };
  for (const b of boxes) {
    for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) add('x', y, z, b.x0, b.x1);
    for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) add('y', x, z, b.y0, b.y1);
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) add('z', x, y, b.z0, b.z1);
  }
  const inside = (x, y, z) => boxes.some((b) => x > b.x0 + EPS && x < b.x1 - EPS
    && y > b.y0 + EPS && y < b.y1 - EPS && z > b.z0 + EPS && z < b.z1 - EPS);
  const delta = 1e-5;
  const positions = [];
  const emit = (x0, y0, z0, x1, y1, z1) => positions.push(x0, z0, -y0, x1, z1, -y1);
  for (const group of groups.values()) {
    const cuts = [...group.cuts].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i], hi = cuts[i + 1];
      if (hi - lo <= EPS) continue;
      const mid = (lo + hi) / 2;
      let occupied;
      if (group.axis === 'x') occupied = [
        inside(mid, group.a - delta, group.b - delta), inside(mid, group.a + delta, group.b - delta),
        inside(mid, group.a - delta, group.b + delta), inside(mid, group.a + delta, group.b + delta),
      ];
      else if (group.axis === 'y') occupied = [
        inside(group.a - delta, mid, group.b - delta), inside(group.a + delta, mid, group.b - delta),
        inside(group.a - delta, mid, group.b + delta), inside(group.a + delta, mid, group.b + delta),
      ];
      else occupied = [
        inside(group.a - delta, group.b - delta, mid), inside(group.a + delta, group.b - delta, mid),
        inside(group.a - delta, group.b + delta, mid), inside(group.a + delta, group.b + delta, mid),
      ];
      const count = occupied.filter(Boolean).length;
      const diagonal = count === 2 && ((occupied[0] && occupied[3]) || (occupied[1] && occupied[2]));
      if (count !== 1 && count !== 3 && !diagonal) continue;
      if (group.axis === 'x') emit(lo, group.a, group.b, hi, group.a, group.b);
      else if (group.axis === 'y') emit(group.a, lo, group.b, group.a, hi, group.b);
      else emit(group.a, group.b, lo, group.a, group.b, hi);
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

// Aperture zones describe the full opening footprint, which is often thicker
// than the visible leaf/glass. Reduce only the wall-depth axis so inserts sit
// clearly inside the carved opening rather than looking like another wall block.
function apertureInsertBox(rect, z0, z1, depth = 0.035) {
  const b = rect.bounds;
  const alongX = (b.x1 - b.x0) >= (b.y1 - b.y0);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  return alongX
    ? { x0: b.x0, x1: b.x1, y0: cy - depth / 2, y1: cy + depth / 2, z0, z1 }
    : { x0: cx - depth / 2, x1: cx + depth / 2, y0: b.y0, y1: b.y1, z0, z1 };
}

function apertureInsertGeometries(floor) {
  const height = Math.max(0, floor?.height || 0);
  const doors = [];
  const windows = [];
  for (const rect of floor?.rectangles || []) {
    if (!validBounds(rect.bounds)) continue;
    const kind = zoneKind(rect);
    if (kind === 'door' || kind === 'garage' || kind === 'sliding') {
      const head = clipped(rect.head ?? 2.1, 0, height);
      if (head > EPS) doors.push(apertureInsertBox(rect, 0.015, Math.max(0.015, head - 0.015)));
    } else if (kind === 'window') {
      const sill = clipped(rect.sill ?? 0.9, 0, height);
      const head = clipped(rect.head ?? 2.1, 0, height);
      if (head - sill > EPS) windows.push(apertureInsertBox(rect, sill, head, 0.018));
    }
  }
  return { doorGeometry: boxesGeometry(doors), windowGeometry: boxesGeometry(windows) };
}

export function buildArchitecturalFloor(floor, opts = {}) {
  const rooms = (floor?.rectangles || []).filter((rect) => zoneKind(rect) === 'room');
  const roomFootprint = computeFootprint(rooms);
  const slabThickness = opts.slabThickness ?? ARCH_SLAB_THICKNESS;
  const floorGeometry = extrudeFootprint(roomFootprint, slabThickness);
  if (floorGeometry) floorGeometry.translate(0, -slabThickness, 0); // finished floor remains at local Y=0
  // Reuse the exact room footprint for an overhead slab. Its underside is at
  // the authored storey height; View3D only reveals it in first-person mode so
  // the exterior orbit remains an unobstructed architectural overview.
  const ceilingGeometry = floorGeometry?.clone() || null;
  if (ceilingGeometry) ceilingGeometry.translate(0, (floor?.height || 0) + slabThickness, 0);
  const wallBoxes = architecturalWallBoxes(floor, opts);
  const wallGeometry = boxesGeometry(wallBoxes);
  const outlineGeometry = boxesOutlineGeometry(wallBoxes);
  const { doorGeometry, windowGeometry } = apertureInsertGeometries(floor);
  return { floorGeometry, wallGeometry, ceilingGeometry, doorGeometry, windowGeometry, outlineGeometry };
}
