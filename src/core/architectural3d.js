// Shared architectural 3D geometry for desktop view mode and, later, optional AR.
// Unlike the legacy massing mesh (ROOM = full-height solid), this interprets rooms
// as floor area, derives an exterior wall shell from their exposed perimeter, and
// renders explicit WALL zones as interior wall solids. Aperture bands cut those
// wall solids in Z without introducing a general-purpose 3D CSG dependency.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeFootprint } from './geometry2d.js';
import { extrudeFootprint } from './extrude.js';
import { zoneKind, stairClimb } from './zoneColors.js';
import { resolveApertureOrient } from './apertureGlyph.js';
import { ceilingHeight, roomCeiling, roomFloorZ, floorZAt, hasRoomLevels } from './storey.js';

export const ARCH_WALL_THICKNESS = 0.12;
export const ARCH_SLAB_THICKNESS = 0.06;
const EPS = 1e-7;
// Solid wall material in 3D. INSULATION is an interior lining authored over the room
// edge (markers are pinned to its inner face), so it renders as wall too; without it
// the room read 18–21 cm too deep and lining-mounted outlets had no surface.
const WALL_ZONE_KINDS = new Set(['wall', 'insulation', 'door', 'passage', 'garage', 'window', 'halfwall', 'sliding', 'recess']);

const validBounds = (b) => b && b.x1 - b.x0 > EPS && b.y1 - b.y0 > EPS;
const clipped = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Solved coordinates carry float noise (a room edge at -1.88 beside a door edge at
// -1.8799999999999999). Snap grid lines to 1 µm so near-equal edges share one line;
// otherwise the 1e-14 m band between them became a zero-thickness, full-height wall
// "sheet" that no opening could cut, drawn straight across door faces.
const snap = (v) => Math.round(v * 1e6) / 1e6;
// Furthest an opening may be extended through wall layers beyond its own footprint.
const PIERCE_MAX = 0.6;
const DOORWAY_KINDS = new Set(['door', 'passage', 'sliding', 'garage']);

function openingBand(rect, storeyHeight) {
  const kind = zoneKind(rect);
  if (kind === 'garage') return [0, clipped(rect.head ?? 2.1, 0, storeyHeight)];
  if (kind === 'door' || kind === 'passage' || kind === 'sliding') {
    // A door's sill: 0, or a room's own floor level it opens onto (storey.js roomFloorZ).
    const head = clipped(rect.head ?? 2.1, 0, storeyHeight);
    return [clipped(rect.sill ?? 0, 0, head), head];
  }
  if (kind === 'window' || kind === 'recess') {
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

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInFootprint(x, y, footprint) {
  return footprint.some((polygon) => polygon.length && pointInRing(x, y, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(x, y, hole)));
}

// Resolve a set of axis-aligned rectangles into non-overlapping boxes. Optional
// cut coordinates let room boundaries split candidate strips before cells whose
// midpoint lies in free-room space are rejected. Adjacent retained cells are
// merged again, keeping the eventual mesh compact.
function unionRectSources(sources, { cuts = [], excludeFootprint = null } = {}) {
  if (!sources.length) return [];
  const xs = new Set(), ys = new Set();
  for (const b of sources) { xs.add(snap(b.x0)); xs.add(snap(b.x1)); ys.add(snap(b.y0)); ys.add(snap(b.y1)); }
  for (const [x, y] of cuts) { xs.add(snap(x)); ys.add(snap(y)); }
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const complete = [];
  let active = new Map();
  for (let yi = 0; yi < Y.length - 1; yi++) {
    const y0 = Y[yi], y1 = Y[yi + 1], my = (y0 + y1) / 2;
    const runs = [];
    let runStart = null;
    for (let xi = 0; xi < X.length - 1; xi++) {
      const x0 = X[xi], x1 = X[xi + 1], mx = (x0 + x1) / 2;
      const covered = sources.some((b) => mx > b.x0 - EPS && mx < b.x1 + EPS
        && my > b.y0 - EPS && my < b.y1 + EPS);
      const keep = covered && !(excludeFootprint && pointInFootprint(mx, my, excludeFootprint));
      if (keep && runStart == null) runStart = x0;
      if (runStart != null && (!keep || xi === X.length - 2)) {
        runs.push({ x0: runStart, x1: keep && xi === X.length - 2 ? x1 : x0 });
        runStart = null;
      }
    }
    const next = new Map();
    for (const run of runs) {
      if (run.x1 - run.x0 <= EPS) continue;
      const key = `${run.x0}:${run.x1}`;
      const previous = active.get(key);
      const box = previous && Math.abs(previous.y1 - y0) <= EPS
        ? previous : { ...run, y0, y1: y0, source: 'resolved' };
      box.y1 = y1;
      next.set(key, box);
    }
    for (const [key, box] of active) if (!next.has(key)) complete.push(box);
    active = next;
  }
  complete.push(...active.values());
  return complete;
}

// An aperture zone is often authored thinner than the wall it sits in: a 10 cm
// window rect against a 12 cm inferred exterior wall, or a gap strip beside a half
// wall. Cutting only the rect's own footprint left a skin of wall across the opening
// on one face. So extend the cut along the wall normal through every contiguous
// layer of wall that spans the aperture's FULL width. Requiring full-width coverage
// (and PIERCE_MAX) keeps it from tunnelling into a perpendicular wall, or past a
// door rect drawn wider than the real opening behind it.
function piercedBounds(b, sources) {
  const alongX = b.x1 - b.x0 >= b.y1 - b.y0;
  const [A0, A1, N0, N1] = alongX ? ['x0', 'x1', 'y0', 'y1'] : ['y0', 'y1', 'x0', 'x1'];
  const a0 = b[A0], a1 = b[A1];
  const inSpan = sources.filter((s) => Math.min(s[A1], a1) - Math.max(s[A0], a0) > EPS);
  // Does wall material at normal coordinate m cover the aperture's whole width?
  const covers = (m) => {
    const spans = inSpan.filter((s) => m > s[N0] + EPS && m < s[N1] - EPS)
      .map((s) => [s[A0], s[A1]]).sort((p, q) => p[0] - q[0]);
    let reach = a0;
    for (const [lo, hi] of spans) {
      if (lo > reach + EPS) return false;
      reach = Math.max(reach, hi);
    }
    return reach >= a1 - EPS;
  };
  const stops = [...new Set(inSpan.flatMap((s) => [snap(s[N0]), snap(s[N1])]))].sort((p, q) => p - q);
  let n0 = b[N0], n1 = b[N1];
  for (const s of stops) {
    if (s <= n1 + EPS) continue;
    if (s - b[N1] > PIERCE_MAX || !covers((n1 + s) / 2)) break;
    n1 = s;
  }
  for (const s of [...stops].reverse()) {
    if (s >= n0 - EPS) continue;
    if (b[N0] - s > PIERCE_MAX || !covers((n0 + s) / 2)) break;
    n0 = s;
  }
  return { ...b, [N0]: n0, [N1]: n1 };
}

// a − b for axis-aligned plan boxes: up to four boxes (south and north strips full
// width, then the west and east strips between them).
function rectMinus(a, b) {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return [a];
  return [
    { x0: a.x0, x1: a.x1, y0: a.y0, y1: y0 },
    { x0: a.x0, x1: a.x1, y0: y1, y1: a.y1 },
    { x0: a.x0, x1: x0, y0, y1 },
    { x0: x1, x1: a.x1, y0, y1 },
  ].filter((r) => r.x1 - r.x0 > EPS && r.y1 - r.y0 > EPS);
}

function splitWallByOpenings(source, storeyHeight, openings) {
  const overlaps = openings.flatMap((opening) => {
    const b = opening.bounds;
    const x0 = snap(Math.max(source.x0, b.x0)), x1 = snap(Math.min(source.x1, b.x1));
    const y0 = snap(Math.max(source.y0, b.y0)), y1 = snap(Math.min(source.y1, b.y1));
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
  const height = ceilingHeight(floor);
  if (height <= EPS) return [];
  const rectangles = floor?.rectangles || [];
  const rooms = rectangles.filter((rect) => zoneKind(rect) === 'room' && validBounds(rect.bounds));
  const stairs = rectangles.filter((rect) => {
    const kind = zoneKind(rect);
    return (kind === 'stairs_up' || kind === 'stairs_down') && validBounds(rect.bounds);
  });
  // Stairs are holes in the horizontal slab, but they are circulation space for
  // wall inference. Union them with rooms as positive areas so a shared room↔stair
  // edge stays open, while the staircase's exposed outer perimeter still gets walls.
  const circulationRects = [
    ...rooms,
    ...stairs.map((rect) => ({ bounds: rect.bounds, op: 'add', kind: 'room' })),
  ];
  const circulationFootprint = computeFootprint(circulationRects);
  const inferred = exteriorWallSources(circulationFootprint, wallThickness);
  const roomCuts = circulationFootprint.flatMap((polygon) => polygon.flatMap((ring) => ring));
  // A candidate from one room may cross a narrow gap and reach another room.
  // Clip every inferred strip against the complete room union first, then union
  // the survivors so opposing faces produce one wall rather than overlapping solids.
  const clippedInferred = unionRectSources(inferred, {
    cuts: roomCuts,
    excludeFootprint: circulationFootprint,
  });
  const explicit = [];
  for (const rect of rectangles) {
    const kind = zoneKind(rect);
    if (!WALL_ZONE_KINDS.has(kind) || !validBounds(rect.bounds)) continue;
    // An aperture zone is itself a wall segment carrying an opening band. This
    // matters for interior doors/windows authored between adjacent wall pieces,
    // where there may be no overlapping generic WALL rectangle to carve.
    explicit.push({ ...rect.bounds, source: kind === 'wall' || kind === 'insulation' ? 'interior' : `aperture:${kind}` });
  }
  const sources = unionRectSources([...clippedInferred, ...explicit]);
  // A half wall standing inside a room is a free-standing low wall: it cuts only its
  // own footprint. Piercing would also open the full-height wall behind it (owner's
  // Ground r139 against the 7 cm gap wall to r106). A half wall authored in the wall
  // line (outside the room area) still pierces, like any other opening.
  const insideRoom = (b) => pointInFootprint((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, circulationFootprint);
  // A taller half wall standing on a lower one (owner, 2026-10-10: a boxing is a half wall,
  // e.g. Upper r220 up to the ceiling on top of the 1.15 m r210): the lower one's band above
  // its top must not cut the taller one away, so its opening skips the taller footprints.
  const halfwalls = rectangles.filter((r) => zoneKind(r) === 'halfwall' && validBounds(r.bounds));
  const openings = rectangles.flatMap((rect) => {
    const band = openingBand(rect, height);
    if (!band || !validBounds(rect.bounds)) return [];
    // A recess is the reveal itself: it cuts its own footprint, never through the wall.
    const bounds = (zoneKind(rect) === 'halfwall' && insideRoom(rect.bounds)) || zoneKind(rect) === 'recess'
      ? rect.bounds : piercedBounds(rect.bounds, sources);
    let pieces = [bounds];
    if (zoneKind(rect) === 'halfwall') {
      for (const other of halfwalls) {
        if (other !== rect && (other.sill ?? 1.1) > (rect.sill ?? 1.1)) {
          pieces = pieces.flatMap((p) => rectMinus(p, other.bounds));
        }
      }
    }
    return pieces.map((b) => ({ rect, bounds: b, z0: band[0], z1: band[1] }));
  });
  const boxes = sources.flatMap((source) => splitWallByOpenings(source, height, openings));
  return fitWallsToRooms(floor, boxes, [...rooms, ...stairs], height, wallThickness + 0.01);
}

// Rooms with their own ceiling or floor level (storey.js). A room with a lower ceiling (the
// veranda's 2.20 m roof in a 2.70 m storey): a wall piece whose every neighbouring room or
// stair within `reach` (plan gap) is lower stops at the highest of their ceilings; a wall
// shared with a full-height room keeps the storey's height. A room standing below the
// storey's floor (a Basement room a step down): a wall piece reaching down from the floor
// goes down to the lowest neighbour's level. A piece near no room (a thick wall's core) is unchanged.
function fitWallsToRooms(floor, boxes, spaces, height, reach) {
  const low = spaces.some((r) => roomCeiling(floor, r) < height - EPS);
  const sunk = spaces.some((r) => roomFloorZ(r) < -EPS);
  if (!low && !sunk) return boxes;
  const gap = (b, r) => Math.max(0, r.x0 - b.x1, b.x0 - r.x1, r.y0 - b.y1, b.y0 - r.y1);
  return boxes.flatMap((box) => {
    let top = -Infinity, bottom = Infinity;
    for (const s of spaces) {
      if (gap(box, s.bounds) > reach) continue;
      top = Math.max(top, roomCeiling(floor, s));
      bottom = Math.min(bottom, roomFloorZ(s));
    }
    if (top === -Infinity) return [box];
    const z0 = box.z0 <= EPS && bottom < -EPS ? bottom : box.z0;
    const z1 = top < box.z1 - EPS ? top : box.z1;
    if (z1 <= box.z0 + EPS) return [];
    return z0 === box.z0 && z1 === box.z1 ? [box] : [{ ...box, z0, z1 }];
  });
}

export function boxesGeometry(boxes) {
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

// A plain DOOR zone's leaf swung 90° open (View 3D, `openDoors`): a leaf per hinge
// (`hinge: 'both'` = two half-width leaves), standing at its hinge jamb and reaching
// from the opening's centre line to the swing side (`resolveApertureOrient`, the same
// hinge and swing as the plan symbol).
const OPEN_LEAF_T = 0.035;
function openDoorLeafBoxes(rect, z0, z1) {
  const b = rect.bounds;
  const alongX = (b.x1 - b.x0) >= (b.y1 - b.y0);
  const { hingeEnd, perp } = resolveApertureOrient(rect, b.x0, b.x1, b.y0, b.y1);
  const ends = hingeEnd === 'both' ? ['lo', 'hi'] : [hingeEnd];
  const width = (alongX ? b.x1 - b.x0 : b.y1 - b.y0) / ends.length;
  const c = alongX ? (b.y0 + b.y1) / 2 : (b.x0 + b.x1) / 2;
  const [a0, a1] = [c, c + perp * width].sort((p, q) => p - q); // across the wall
  return ends.map((end) => {
    const lo = alongX ? b.x0 : b.y0, hi = alongX ? b.x1 : b.y1;
    const [s0, s1] = end === 'hi' ? [hi - OPEN_LEAF_T, hi] : [lo, lo + OPEN_LEAF_T]; // along
    return alongX ? { x0: s0, x1: s1, y0: a0, y1: a1, z0, z1 } : { x0: a0, x1: a1, y0: s0, y1: s1, z0, z1 };
  });
}

// `doorLeavesApart` (View 3D's 🚪 Doors toggle): each plain DOOR zone's leaf comes out apart, open
// and closed (`doorLeaves`: {rectId, open, closed} geometries), instead of in the merged doors.
function apertureInsertGeometries(floor, skip = null, { openDoors = false, doorLeavesApart = false } = {}) {
  const height = ceilingHeight(floor);
  const doors = [];
  const windows = [];
  const doorLeaves = [];
  for (const rect of floor?.rectangles || []) {
    if (!validBounds(rect.bounds) || skip?.has(rect.id)) continue;
    const kind = zoneKind(rect);
    const sill = kind === 'door' || kind === 'sliding' ? Math.max(0, rect.sill ?? 0) : 0;
    if (kind === 'door' && openDoors) {
      const head = clipped(rect.head ?? 2.1, 0, height);
      const z0 = sill + 0.015, z1 = Math.max(sill + 0.015, head - 0.015);
      if (head - sill <= EPS) continue;
      if (doorLeavesApart) {
        doorLeaves.push({ rectId: rect.id, open: boxesGeometry(openDoorLeafBoxes(rect, z0, z1)), closed: boxesGeometry([apertureInsertBox(rect, z0, z1)]) });
      } else doors.push(...openDoorLeafBoxes(rect, z0, z1));
    } else if (kind === 'door' || kind === 'garage' || kind === 'sliding') {
      const head = clipped(rect.head ?? 2.1, 0, height);
      if (head - sill > EPS) doors.push(apertureInsertBox(rect, sill + 0.015, Math.max(sill + 0.015, head - 0.015)));
    } else if (kind === 'gate') {
      // Free-standing and outdoors: the leaf, closed, up to its own head (no ceiling clip), from
      // its sill when it has one (a leaf hung high, over a platform), else just off the ground.
      const head = Math.max(0, rect.head ?? 1.2), foot = rect.sill > 0 ? rect.sill : 0.02;
      if (head - foot > 0.01) doors.push(apertureInsertBox(rect, foot, head, 0.04));
    } else if (kind === 'window') {
      const sill = clipped(rect.sill ?? 0.9, 0, height);
      const head = clipped(rect.head ?? 2.1, 0, height);
      if (head - sill > EPS) windows.push(apertureInsertBox(rect, sill, head, 0.018));
    }
  }
  return { doorGeometry: boxesGeometry(doors), windowGeometry: boxesGeometry(windows), doorLeaves };
}

// Lightweight procedural staircase: one merged thin tread per riser. The flight
// runs along the stair's `climb` (stairClimb: legacy = long axis toward max). STAIRS
// UP climbs from this floor up along it; STAIRS DOWN is the same flight seen from
// the storey above, so it descends against it.
// A stair zone holds only the steps drawn in it, starting at its own floor level
// (owner, 2026-10-01): STAIRS UP rises from the floor, STAIRS DOWN descends from it,
// one STAIR_RISER per step. The step count is the zone's run / STAIR_GOING, capped so
// the flight never passes the storey above (up) or the one below (down). Before this,
// every zone climbed the full storey height, far too steep in a short zone.
// Keeping treads as thin slabs (rather than a solid stepped mass) makes both the
// direction and the opening below readable while staying cheap on mobile GPUs.
export const STAIR_RISER = 0.18; // m, fixed (owner)
export const STAIR_GOING = 0.25; 
export const STAIR_WAIST = 0.12; // m, the sloped slab under a flight's steps (Hypothesis: a common concrete waist) // m per tread in plan (a common going; Hypothesis)
// A flight between two room levels of its own floor (storey.js roomFloorZ; owner, 2026-10-13:
// the Upper small room up a few steps): the room just past its top (`climb`) end stands higher
// than the one just past its other end. Returns { zLo, zHi } (m above the storey's floor), else
// null: the flight climbs to the next floor (or down to the one below) as before. Such a flight
// is floor, not a hole in the slab.
export function innerStairSpan(floor, rect) {
  const kind = zoneKind(rect);
  if ((kind !== 'stairs_up' && kind !== 'stairs_down') || !hasRoomLevels(floor) || !validBounds(rect.bounds)) return null;
  const b = rect.bounds, climb = stairClimb(rect), d = 0.05;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const past = (sign) => (climb[1] === 'x'
    ? floorZAt(floor, (sign > 0 ? b.x1 + d : b.x0 - d), cy)
    : floorZAt(floor, cx, (sign > 0 ? b.y1 + d : b.y0 - d)));
  const up = climb[0] === '+' ? 1 : -1;
  const zHi = past(up), zLo = past(-up);
  return zHi - zLo > EPS ? { zLo, zHi } : null;
}

// The stairwell under a flight going down (owner, 2026-10-13: "stairs that go down don't have
// walls either"), for a view of this floor alone: the floor below draws its own walls around
// the staircase, so in a view of every floor this would double them. A lining
// (`wallThickness`) on the flight's two sides and its top end, from the floor below up to this
// floor; the bottom end stays open (the way off the stairs). A flight between two room levels
// (innerStairSpan) has none. Returns { walls } (or null); the viewers show it only with one floor.
function stairwellGeometries(floor, { downRise = floor?.height || 2.8, wallThickness = ARCH_WALL_THICKNESS } = {}) {
  const walls = [];
  const box = (x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0);
    g.translate((x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2);
    return g;
  };
  for (const rect of floor?.rectangles || []) {
    if (zoneKind(rect) !== 'stairs_down' || !validBounds(rect.bounds) || innerStairSpan(floor, rect)) continue;
    const b = rect.bounds, climb = stairClimb(rect);
    const alongX = climb[1] === 'x', forward = climb[0] === '+';
    const drop = Math.max(STAIR_RISER, downRise);
    const T = wallThickness;
    if (alongX) {
      walls.push(box(b.x0, b.x1, b.y0 - T, b.y0, -drop, 0), box(b.x0, b.x1, b.y1, b.y1 + T, -drop, 0));
      walls.push(forward ? box(b.x1, b.x1 + T, b.y0 - T, b.y1 + T, -drop, 0) : box(b.x0 - T, b.x0, b.y0 - T, b.y1 + T, -drop, 0));
    } else {
      walls.push(box(b.x0 - T, b.x0, b.y0, b.y1, -drop, 0), box(b.x1, b.x1 + T, b.y0, b.y1, -drop, 0));
      walls.push(forward ? box(b.x0 - T, b.x1 + T, b.y1, b.y1 + T, -drop, 0) : box(b.x0 - T, b.x1 + T, b.y0 - T, b.y0, -drop, 0));
    }
  }
  return { walls: walls.length ? (walls.length === 1 ? walls[0] : mergeGeometries(walls)) : null };
}

// A RAMP or PLATFORM zone's own floor material (owner, 2026-10-13: the garden driveway ramp in
// cement): a `{rect}` finish with a floor material; drawn in its colour, untextured.
function pavedDef(rect, materialOf) {
  const def = materialOf?.(rect) || null;
  return def && (def.surface === 'floor' || def.surface === 'both') ? def : null;
}
// The paved ramps and platforms of the floor, grouped by colour: [{ color, roughness, geometry }].
function pavedParts(floor, fillDepth, materialOf) {
  const byColor = new Map();
  for (const rect of floor?.rectangles || []) {
    const def = pavedDef(rect, materialOf);
    if (!def) continue;
    const g = rampPlatformGeometries(floor, fillDepth, (r) => r === rect);
    if (!g.length) continue;
    const key = `${def.color}|${def.roughness ?? 0.75}`;
    (byColor.get(key) ?? byColor.set(key, { color: def.color, roughness: def.roughness ?? 0.75, geos: [] }).get(key)).geos.push(...g);
  }
  return [...byColor.values()].map(({ color, roughness, geos }) => ({
    color, roughness, geometry: geos.length === 1 ? geos[0] : mergeGeometries(geos),
  }));
}

function stairsGeometry(floor, opts = {}) {
  const { downRise = floor?.height || 2.8, upRise = floor?.height || 2.8, fillDepth = 0 } = opts;
  const geometries = [];
  for (const rect of floor?.rectangles || []) {
    const kind = zoneKind(rect);
    if ((kind !== 'stairs_up' && kind !== 'stairs_down') || !validBounds(rect.bounds)) continue;
    const b = rect.bounds;
    const width = b.x1 - b.x0, depth = b.y1 - b.y0;
    const climb = stairClimb(rect);
    const alongX = climb[1] === 'x';
    const forward = climb[0] === '+';
    const run = alongX ? width : depth;
    const cross = alongX ? depth : width;
    const span = innerStairSpan(floor, rect);
    const maxRise = Math.max(STAIR_RISER, kind === 'stairs_down' ? downRise : upRise);
    // A flight between two room levels of this floor climbs their difference in equal risers
    // as close to STAIR_RISER as fit, the last one up onto the higher room's floor (so one
    // tread fewer than risers in the zone); any other flight climbs to the next floor in STAIR_RISERs.
    const risers = span ? Math.max(1, Math.min(Math.round((span.zHi - span.zLo) / STAIR_RISER) || 1,
      Math.max(1, Math.round(run / STAIR_GOING)) + 1)) : 0;
    const count = span ? risers - 1
      : Math.max(1, Math.min(Math.round(run / STAIR_GOING), Math.floor(maxRise / STAIR_RISER + 1e-6)));
    const riser = span ? (span.zHi - span.zLo) / risers : STAIR_RISER;
    const treadRun = run / Math.max(1, count);
    const slab = Math.min(0.05, STAIR_RISER * 0.3);
    const stepRise = span ? riser : STAIR_RISER;
    let zFirst = 0, zLast = 0;
    for (let i = 0; i < count; i++) {
      // i-th tread from the bottom of the flight, walking the climb direction. Up: the
      // first tread is one riser above the floor. Down: the top tread, next to the
      // floor edge, is one riser below it. Between room levels: from the lower one up.
      const level = span ? span.zLo + (i + 1) * riser
        : kind === 'stairs_up' ? (i + 1) * STAIR_RISER : -(count - i) * STAIR_RISER;
      // Each step is a full block (one riser high) under its tread, and the flight's steps
      // stand on a sloped slab (owner, 2026-10-13: "stairs are floating", then "maybe stairs
      // should not be full below it, but at least the steps are connected by a slab or slope").
      const h = Math.max(slab, stepRise);
      const geometry = alongX
        ? new THREE.BoxGeometry(treadRun, h, cross)
        : new THREE.BoxGeometry(cross, h, treadRun);
      const s = forward ? treadRun * (i + 0.5) : run - treadRun * (i + 0.5);
      const planX = alongX ? b.x0 + s : (b.x0 + b.x1) / 2;
      const planY = alongX ? (b.y0 + b.y1) / 2 : b.y0 + s;
      geometry.translate(planX, level - h / 2, -planY);
      geometries.push(geometry);
      if (i === 0) zFirst = level - stepRise;
      zLast = level;
    }
    // The slab: its top runs through every step's front bottom edge, from the foot of the
    // flight (its low end) up to the top tread at its climb end; STAIR_WAIST thick.
    if (count > 0 && zLast > zFirst) {
      const rise = zLast - zFirst, len = Math.hypot(run, rise), angle = Math.atan2(rise, run);
      const g = alongX ? new THREE.BoxGeometry(len, STAIR_WAIST, cross) : new THREE.BoxGeometry(cross, STAIR_WAIST, len);
      g.translate(0, -STAIR_WAIST / 2, 0);
      if (alongX) g.rotateZ(forward ? angle : -angle); // as a ramp: the top rises toward the climb end
      else g.rotateX(forward ? angle : -angle);
      g.translate((b.x0 + b.x1) / 2, (zFirst + zLast) / 2, -(b.y0 + b.y1) / 2);
      geometries.push(g);
    }
  }
  // A ramp or platform with its own floor material is drawn apart (pavedParts).
  geometries.push(...rampPlatformGeometries(floor, fillDepth, (r) => !pavedDef(r, opts.fenceMaterial)));
  if (!geometries.length) return null;
  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
  if (geometries.length > 1) geometries.forEach((geometry) => geometry.dispose());
  merged.computeVertexNormals();
  return merged;
}

// Every wall-mounted marker renders as one standard faceplate (owner spec: 8 cm ×
// 8 cm, the same "typical fixture face" the plan sheet's stack tolerance assumes).
export const MARKER_FACE = 0.08;
// A marker this close to a wall surface is presented flush on it. Authored markers
// are usually dimensioned exactly onto a face, but AR tip placement can leave one a
// few cm inside the wall mass (buried) or just off it.
const MARKER_SNAP = 0.3;

// Presentation placement for each wall-mounted (non-light) marker: attach it to the
// nearest EXPOSED vertical side of the resolved wall boxes at the marker's height,
// facing away from that wall. Using the real wall solids (openings already cut)
// covers room faces, exterior faces (outdoor cameras/outlets face outward), and door
// jambs alike. A side shared by two adjacent boxes is an internal seam, not a
// surface, so it is skipped. Beyond MARKER_SNAP the marker keeps its position and
// only takes the nearest surface's facing. Marker data is never changed.
export function wallMarkerPlacements(floor, wallBoxes = architecturalWallBoxes(floor)) {
  const placements = new Map();
  const solidAt = (x, y, z) => wallBoxes.some((w) => x > w.x0 && x < w.x1
    && y > w.y0 && y < w.y1 && z > w.z0 && z < w.z1);
  for (const marker of floor?.markers || []) {
    if (marker.type === 'light') continue;
    const mx = Number(marker.x) || 0, my = Number(marker.y) || 0;
    const z = clipped(Number.isFinite(marker.z) ? marker.z : 1.1, 0.01, Math.max(0.01, ceilingHeight(floor, 2.5) - 0.01));
    const candidates = [];
    for (const w of wallBoxes) {
      if (z < w.z0 || z > w.z1) continue;
      const cx = clipped(mx, w.x0, w.x1), cy = clipped(my, w.y0, w.y1);
      for (const [px, py, nx, ny] of [
        [w.x0, cy, -1, 0], [w.x1, cy, 1, 0], [cx, w.y0, 0, -1], [cx, w.y1, 0, 1],
      ]) candidates.push({ d: Math.hypot(mx - px, my - py), px, py, nx, ny });
    }
    candidates.sort((p, q) => p.d - q.d);
    const best = candidates.find((c) => !solidAt(c.px + c.nx * 0.002, c.py + c.ny * 0.002, z));
    placements.set(marker.id, best
      ? {
        x: best.d <= MARKER_SNAP ? best.px : mx,
        y: best.d <= MARKER_SNAP ? best.py : my,
        nx: best.nx, ny: best.ny, snapped: best.d <= MARKER_SNAP,
      }
      : { x: mx, y: my, nx: 0, ny: -1, snapped: false });
  }
  return placements;
}

// RAMP and PLATFORM zones (owner, 2026-10-12: the garden's driveway down to the garage door,
// and the landing at the front door). Both reach down `fillDepth`, from this floor's level to
// the nearest floor below (floorRises(...).fill, model.js). A ramp is a thin slab sloping from
// this floor's level at its `climb` end down to the floor below at the other end; a platform
// is a solid block from this floor's level down to it. Plain boxes, drawn with the stairs.
export function rampPlatformBoxes(floor, fillDepth = 0, only = null) {
  const out = [];
  for (const rect of floor?.rectangles || []) {
    const kind = zoneKind(rect);
    if ((kind !== 'ramp' && kind !== 'platform') || !validBounds(rect.bounds)) continue;
    if (only && !only(rect)) continue;
    const b = rect.bounds;
    if (kind === 'platform') {
      out.push({ kind, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: -Math.max(RAMP_SLAB, fillDepth), z1: 0 });
      continue;
    }
    const climb = stairClimb(rect);
    out.push({ kind, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, climb, drop: Math.max(0, fillDepth) });
  }
  return out;
}
const RAMP_SLAB = 0.05;
function rampPlatformGeometries(floor, fillDepth, only = null) {
  return rampPlatformBoxes(floor, fillDepth, only).map((box) => {
    const w = box.x1 - box.x0, d = box.y1 - box.y0;
    if (box.kind === 'platform') {
      const h = box.z1 - box.z0;
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate((box.x0 + box.x1) / 2, box.z0 + h / 2, -(box.y0 + box.y1) / 2);
      return g;
    }
    // Ramp: a slab whose top runs from −drop (low end) up to 0 (the `climb` end).
    const alongX = box.climb[1] === 'x', forward = box.climb[0] === '+';
    const run = alongX ? w : d;
    const len = Math.hypot(run, box.drop);
    const g = alongX ? new THREE.BoxGeometry(len, RAMP_SLAB, d) : new THREE.BoxGeometry(w, RAMP_SLAB, len);
    g.translate(0, -RAMP_SLAB / 2, 0);
    const angle = Math.atan2(box.drop, run);
    // Tilt so the top rises toward the climb end. World: plan x → x, plan y → −z.
    if (alongX) g.rotateZ(forward ? angle : -angle);
    else g.rotateX(forward ? angle : -angle);
    g.translate((box.x0 + box.x1) / 2, -box.drop / 2, -(box.y0 + box.y1) / 2);
    return g;
  });
}

// FENCE zones (owner, 2026-10-12: its own piece, its own material and thickness). Where a
// fence stands from: its `foot`, or else the top of the tallest garden wall under its centre
// (it sits on the wall), or else the ground.
export function fenceFoot(floor, rect) {
  if (Number.isFinite(rect?.foot)) return rect.foot;
  const b = rect.bounds, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  let foot = 0;
  for (const r of floor?.rectangles || []) {
    if (zoneKind(r) !== 'gardenwall' || !validBounds(r.bounds)) continue;
    const w = r.bounds;
    if (cx >= w.x0 - EPS && cx <= w.x1 + EPS && cy >= w.y0 - EPS && cy <= w.y1 + EPS) foot = Math.max(foot, r.top ?? 0);
  }
  return foot;
}
// The default look (no material): vertical wood slats.
const FENCE_DEFAULT = { design: 'slats', w: 0.09, joint: 0.03, color: 0x9a7b55 };
// One fence's boxes for its material `def` (materials.js "Fence materials"). Pieces run
// along the zone's long axis and fill its depth (the drawn thickness).
export function fenceBoxes(floor, rect, def = null) {
  const d = def?.surface === 'fence' ? def : FENCE_DEFAULT;
  const b = rect.bounds, alongX = (b.x1 - b.x0) >= (b.y1 - b.y0);
  const lo = alongX ? b.x0 : b.y0, hi = alongX ? b.x1 : b.y1;
  const a0 = alongX ? b.y0 : b.x0, a1 = alongX ? b.y1 : b.x1; // across: the thickness
  const z0 = fenceFoot(floor, rect), z1 = rect.top ?? 1.8;
  if (!(z1 - z0 > EPS) || !(hi - lo > EPS)) return [];
  const box = (s0, s1, za, zb, c0 = a0, c1 = a1) => (alongX
    ? { x0: s0, x1: s1, y0: c0, y1: c1, z0: za, z1: zb }
    : { x0: c0, x1: c1, y0: s0, y1: s1, z0: za, z1: zb });
  const piece = Math.max(0.005, d.w || 0.09), gap = Math.max(0, d.joint ?? 0.03);
  const out = [];
  if (d.design === 'boards') {
    const n = Math.max(1, Math.round((z1 - z0 + gap) / (piece + gap)));
    const pitch = (z1 - z0) / n, h = Math.max(0.005, pitch - gap);
    for (let i = 0; i < n; i++) out.push(box(lo, hi, z0 + pitch * i, z0 + pitch * i + h));
    return out;
  }
  // slats / bars: vertical pieces evenly spread along the run.
  const n = Math.max(1, Math.round((hi - lo + gap) / (piece + gap)));
  const pitch = (hi - lo) / n, w = Math.min(piece, pitch);
  const c = (a0 + a1) / 2, t = Math.min(a1 - a0, d.design === 'bars' ? piece : a1 - a0);
  for (let i = 0; i < n; i++) {
    const m = lo + pitch * (i + 0.5);
    out.push(box(m - w / 2, m + w / 2, z0, z1, c - t / 2, c + t / 2));
  }
  if (d.design === 'bars') { // a rail at the bottom and the top, the fence's full depth
    const r = Math.min(0.04, (z1 - z0) / 4);
    out.push(box(lo, hi, z0, z0 + r), box(lo, hi, z1 - r, z1));
  }
  return out;
}
// A fence material with `posts` (owner, 2026-10-25: Klos'up) also stands its uprights at the zone's
// two ends, from the wall top under them to `posts.above` over the zone's top: a glissière (`channel`,
// [along, across]) inside the zone where the end meets a garden wall at least as tall as the fence
// (a pillar), else a post (`post`) centred on the end. Fences meeting end to end share that post, so
// a run split into one zone per bay puts a post at each bay joint. [{ key, box }]: equal keys are
// the same upright (fenceParts draws it once).
export function fencePostBoxes(floor, rect, def) {
  const P = def?.surface === 'fence' ? def.posts : null;
  if (!P) return [];
  const b = rect.bounds, alongX = (b.x1 - b.x0) >= (b.y1 - b.y0);
  const lo = alongX ? b.x0 : b.y0, hi = alongX ? b.x1 : b.y1;
  const c = alongX ? (b.y0 + b.y1) / 2 : (b.x0 + b.x1) / 2;
  const z0 = fenceFoot(floor, { ...rect, bounds: b, foot: undefined }), z1 = (rect.top ?? 1.8) + (P.above ?? 0);
  if (!(z1 - z0 > EPS)) return [];
  const box = (s0, s1, across) => (alongX
    ? { x0: s0, x1: s1, y0: c - across / 2, y1: c + across / 2, z0, z1 }
    : { x0: c - across / 2, x1: c + across / 2, y0: s0, y1: s1, z0, z1 });
  // A garden wall at least as tall as the fence, beyond `e` on side `dir` (−1 below lo, +1 above hi).
  const pillarAt = (e, dir) => (floor?.rectangles || []).some((r) => {
    if (zoneKind(r) !== 'gardenwall' || !validBounds(r.bounds) || !((r.top ?? 0) >= (rect.top ?? 1.8) - EPS)) return false;
    const w = r.bounds, rlo = alongX ? w.x0 : w.y0, rhi = alongX ? w.x1 : w.y1;
    const clo = alongX ? w.y0 : w.x0, chi = alongX ? w.y1 : w.x1;
    return c > clo - EPS && c < chi + EPS && (dir < 0 ? Math.abs(rhi - e) < 0.002 : Math.abs(rlo - e) < 0.002);
  });
  const out = [];
  for (const [e, dir] of [[lo, -1], [hi, 1]]) {
    const key = `${alongX ? 'x' : 'y'}${e.toFixed(3)}@${c.toFixed(3)}`;
    if (pillarAt(e, dir)) {
      const [w, d] = P.channel;
      out.push({ key: `${key}${dir}`, box: dir < 0 ? box(e, e + w, d) : box(e - w, e, d) });
    } else {
      const [w, d] = P.post;
      out.push({ key, box: box(e - w / 2, e + w / 2, d) });
    }
  }
  return out;
}
// Every fence of the floor, grouped by colour: [{ color, geometry }].
function fenceParts(floor, materialOf) {
  const byColor = new Map(), posts = new Set();
  for (const rect of floor?.rectangles || []) {
    if (zoneKind(rect) !== 'fence' || !validBounds(rect.bounds)) continue;
    const def = materialOf?.(rect) || null;
    const color = def?.surface === 'fence' ? def.color : FENCE_DEFAULT.color;
    const boxes = fenceBoxes(floor, rect, def);
    for (const { key, box } of fencePostBoxes(floor, rect, def)) if (!posts.has(key)) { posts.add(key); boxes.push(box); }
    if (boxes.length) (byColor.get(color) ?? byColor.set(color, []).get(color)).push(...boxes);
  }
  return [...byColor].map(([color, boxes]) => ({ color, geometry: boxesGeometry(boxes) }));
}

export function buildArchitecturalFloor(floor, opts = {}) {
  const rooms = (floor?.rectangles || []).filter((rect) => zoneKind(rect) === 'room');
  const stairs = (floor?.rectangles || []).filter((rect) => {
    const kind = zoneKind(rect);
    return kind === 'stairs_up' || kind === 'stairs_down';
  });
  // Stair zones are the only subtract zones that cut the presentation slabs:
  // walls/doors/windows sit on the floor, while a staircase needs a real opening.
  const roomFootprint = computeFootprint([...rooms, ...stairs]);
  const slabThickness = opts.slabThickness ?? ARCH_SLAB_THICKNESS;
  let floorGeometry;
  if (!hasRoomLevels(floor)) {
    floorGeometry = extrudeFootprint(roomFootprint, slabThickness);
    if (floorGeometry) floorGeometry.translate(0, -slabThickness, 0); // finished floor remains at local Y=0
  } else {
    // Rooms on their own levels (storey.js roomFloorZ): one slab per level, each reaching down
    // to under the lowest level so a step between two rooms shows a solid face. A flight
    // between two levels (innerStairSpan) is floor at its lower level, not a hole.
    const inner = stairs.filter((st) => innerStairSpan(floor, st));
    const holes = stairs.filter((st) => !inner.includes(st));
    const levels = new Map();
    const at = (z) => levels.get(z) ?? levels.set(z, []).get(z);
    for (const r of rooms) at(roomFloorZ(r)).push(r);
    for (const st of inner) at(innerStairSpan(floor, st).zLo).push({ bounds: st.bounds, op: 'add', kind: 'room' });
    const bottom = Math.min(0, ...levels.keys()) - slabThickness;
    const pieces = [];
    for (const [z, group] of levels) {
      const g = extrudeFootprint(computeFootprint([...group, ...holes]), z - bottom);
      if (g) { g.translate(0, bottom, 0); pieces.push(g); }
    }
    floorGeometry = pieces.length > 1 ? mergeGeometries(pieces) : pieces[0] || null;
  }
  // Reuse the exact room footprint for an overhead slab. Its underside is at
  // the ceiling (storey height − slab, ceilingHeight); View3D only reveals it in first-person mode so
  // the exterior orbit remains an unobstructed architectural overview.
  // A room with its own lower ceiling (roomCeiling) gets its own piece at that height.
  const H = ceilingHeight(floor);
  const lowRooms = rooms.filter((r) => roomCeiling(floor, r) < H - EPS);
  // An opening whose head reaches the ceiling (a passage at full height) has no wall above it, and no room
  // covers its strip: the ceiling closes over it (owner, 2026-10-15: the passage into the kitchen had none).
  const openTop = (floor?.rectangles || []).filter((r) => DOORWAY_KINDS.has(zoneKind(r))
    && (openingBand(r, H)?.[1] ?? 0) >= H - EPS).map((r) => ({ bounds: r.bounds, op: 'add', kind: 'room' }));
  let ceilingGeometry = null;
  if (!lowRooms.length && !hasRoomLevels(floor) && !openTop.length) {
    ceilingGeometry = floorGeometry?.clone() || null;
    if (ceilingGeometry) ceilingGeometry.translate(0, H + slabThickness, 0);
  } else {
    // A flight between two room levels (innerStairSpan) has the ceiling over it, not a hole.
    const inner = stairs.filter((st) => innerStairSpan(floor, st));
    const holes = stairs.filter((st) => !inner.includes(st));
    const groups = new Map([[H, [...rooms.filter((r) => !lowRooms.includes(r)), ...openTop,
      ...inner.map((st) => ({ bounds: st.bounds, op: 'add', kind: 'room' }))]]]);
    for (const r of lowRooms) {
      const c = roomCeiling(floor, r);
      (groups.get(c) ?? groups.set(c, []).get(c)).push(r);
    }
    const pieces = [];
    for (const [c, group] of groups) {
      if (!group.length) continue;
      const g = extrudeFootprint(computeFootprint([...group, ...holes]), slabThickness);
      if (g) { g.translate(0, c, 0); pieces.push(g); }
    }
    ceilingGeometry = pieces.length > 1 ? mergeGeometries(pieces) : pieces[0] || null;
  }
  const wallBoxes = architecturalWallBoxes(floor, opts);
  // `splitHalfWalls` (View 3D, owner 2026-10-10: half walls can be shown see-through):
  // the boxes standing on an in-room half wall's footprint go to `halfWallGeometry`.
  let halfWallGeometry = null, solidBoxes = wallBoxes;
  if (opts.splitHalfWalls) {
    const halves = (floor?.rectangles || []).filter((r) => zoneKind(r) === 'halfwall' && validBounds(r.bounds))
      .map((r) => r.bounds).filter((b) => pointInFootprint((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, roomFootprint));
    const onHalf = (b) => {
      const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      return halves.some((h) => mx > h.x0 - EPS && mx < h.x1 + EPS && my > h.y0 - EPS && my < h.y1 + EPS);
    };
    // A half wall against a wall is merged with it into one box (a boxing on the west
    // wall): cut every box on the half walls' outlines first, then sort the pieces.
    const pieces = wallBoxes.flatMap((b) => {
      const xs = new Set([b.x0, b.x1]), ys = new Set([b.y0, b.y1]);
      for (const h of halves) {
        for (const x of [h.x0, h.x1]) if (x > b.x0 + EPS && x < b.x1 - EPS) xs.add(x);
        for (const y of [h.y0, h.y1]) if (y > b.y0 + EPS && y < b.y1 - EPS) ys.add(y);
      }
      if (xs.size === 2 && ys.size === 2) return [b];
      const X = [...xs].sort((p, q) => p - q), Y = [...ys].sort((p, q) => p - q), out = [];
      for (let i = 0; i < X.length - 1; i++) {
        for (let j = 0; j < Y.length - 1; j++) out.push({ ...b, x0: X[i], x1: X[i + 1], y0: Y[j], y1: Y[j + 1] });
      }
      return out;
    });
    solidBoxes = pieces.filter((b) => !onHalf(b));
    halfWallGeometry = boxesGeometry(pieces.filter(onHalf));
  }
  // Garden walls: solid from the ground to their own top, outside the house's wall logic.
  const gardenWalls = (floor?.rectangles || []).filter((r) => zoneKind(r) === 'gardenwall' && validBounds(r.bounds) && (r.top ?? 0) > EPS)
    .map((r) => ({ ...r.bounds, z0: 0, z1: r.top, source: 'garden' }));
  // Ceiling boxings (soffits, zoneColors.js): plaster solids from their foot up to the ceiling, over the room.
  const soffits = (floor?.rectangles || []).filter((r) => zoneKind(r) === 'soffit' && validBounds(r.bounds))
    .map((r) => ({ ...r.bounds, z0: Math.min(Math.max(0, r.foot ?? H), H), z1: H, source: 'soffit' }))
    .filter((b) => b.z1 - b.z0 > EPS);
  // Beams (zoneColors.js BEAM_BAND, src/core/beams.js): solid from their foot to their top, m from this floor, in
  // the slab over the ceiling or (negative) under the floor. One merged geometry; `beamSpan` [min foot, max top]
  // lets a viewer also show them with the storey whose slab they sit in.
  const beams = (floor?.rectangles || []).filter((r) => zoneKind(r) === 'beam' && validBounds(r.bounds) && (r.top ?? 0) > (r.foot ?? 0) + EPS)
    .map((r) => ({ ...r.bounds, z0: r.foot ?? 0, z1: r.top ?? 0, source: 'beam' }));
  const beamGeometry = boxesGeometry(beams);
  const beamSpan = beams.length ? [Math.min(...beams.map((b) => b.z0)), Math.max(...beams.map((b) => b.z1))] : null;
  const wallGeometry = boxesGeometry([...solidBoxes, ...gardenWalls]);
  // Apart from the walls so View 3D's see-through toggle reaches them (owner, 2026-10-14).
  const soffitGeometry = boxesGeometry(soffits);
  const outlineGeometry = boxesOutlineGeometry([...wallBoxes, ...soffits]);
  // Door/window zones carrying a product draw that product instead
  // (doorProductPlacements / windowProductPlacements).
  const skip = new Set([...(opts.productDoors || []), ...(opts.productWindows || [])]);
  const { doorGeometry, windowGeometry, doorLeaves } = apertureInsertGeometries(floor, skip,
    { openDoors: !!opts.openDoors, doorLeavesApart: !!opts.doorLeavesApart });
  const stairGeometry = stairsGeometry(floor, opts);
  return {
    floorGeometry, wallGeometry, halfWallGeometry, soffitGeometry, beamGeometry, beamSpan, ceilingGeometry, doorGeometry, doorLeaves, windowGeometry,
    outlineGeometry, stairGeometry, fenceParts: fenceParts(floor, opts.fenceMaterial),
    pavedParts: pavedParts(floor, opts.fillDepth ?? 0, opts.fenceMaterial),
    stairwell: stairwellGeometries(floor, opts), // shown only with this floor alone
    markerPlacements: wallMarkerPlacements(floor, [...wallBoxes, ...gardenWalls]),
  };
}

// Door products (docs/materials.md "Doors"): every DOOR zone whose `{rect}` finish is a
// `surface: 'door'` material, with what src/ui/doorProducts.js needs to build it at
// the opening's size. `materialOf(id)` resolves the catalog entry. Plan axes: the
// door runs along its zone's long axis; `hingeEnd` 'lo'/'hi' is the hinge jamb on
// that axis; `swingZ` is the swing face in the builder's local frame (+Z = world +Z
// = plan −y for a door along X; plan +x for a door along Y, turned +90°).
export function doorProductPlacements(floor, materialOf) {
  const out = [];
  const height = ceilingHeight(floor);
  for (const f of floor?.finishes || []) {
    if (f.target?.edge) continue;
    const rect = (floor.rectangles || []).find((r) => r.id === f.target?.rect);
    // A rail-hung product (`mount: 'rail'`) goes on a SLIDING zone, a gate (`mount: 'gate'`)
    // on a GATE zone; any other on a DOOR zone.
    const kind = rect && zoneKind(rect);
    if (!rect || (kind !== 'door' && kind !== 'sliding' && kind !== 'gate') || !validBounds(rect.bounds)) continue;
    const def = materialOf(f.material);
    if (def?.surface !== 'door' || (kind === 'sliding') !== (def.mount === 'rail')
      || (kind === 'gate') !== (def.mount === 'gate')) continue;
    const b = rect.bounds;
    const alongX = (b.x1 - b.x0) >= (b.y1 - b.y0);
    const { hingeEnd, perp } = resolveApertureOrient(rect, b.x0, b.x1, b.y0, b.y1);
    out.push({
      rectId: rect.id, material: f.material, def, alongX,
      cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2,
      width: alongX ? b.x1 - b.x0 : b.y1 - b.y0,
      depth: alongX ? b.y1 - b.y0 : b.x1 - b.x0, // the wall thickness at the zone
      // A gate is outdoors: its own head, no ceiling clip (as apertureInsertGeometries). A door's
      // product stands on its sill (`sill`, buildDoorProduct lifts it); `head` is its height above it.
      // A gate's sill (owner, 2026-10-25) is where its leaf starts above the ground (0 = the
      // product's own gap); buildGate draws it from there.
      sill: Math.max(0, rect.sill ?? 0),
      head: kind === 'gate' ? Math.max(0, rect.head ?? 1.2) : clipped(rect.head ?? 2.1, 0, height) - Math.max(0, rect.sill ?? 0),
      hingeEnd: hingeEnd === 'hi' ? 'hi' : 'lo',
      swingZ: alongX ? -perp : perp,
      leafDepth: def.leafDepth || 0.07,
    });
  }
  return out;
}

// Window products (docs/materials.md "Windows"): every WINDOW zone whose `{rect}` finish
// is a `surface: 'window'` material, with what src/ui/windowProducts.js needs. The zone's
// hinge picks the leaves (both = two). `roomZ` is the room side in the builder's local
// frame (same convention as a door's swingZ): the side whose probe point, just past the
// zone, falls in a ROOM rect; when both or neither do, the zone's swing side.
export function windowProductPlacements(floor, materialOf) {
  const out = [];
  const height = ceilingHeight(floor);
  const rooms = (floor?.rectangles || []).filter((r) => zoneKind(r) === 'room' && validBounds(r.bounds));
  const inRoom = (x, y) => rooms.some((r) => {
    const b = r.bounds;
    return x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
  });
  for (const f of floor?.finishes || []) {
    if (f.target?.edge) continue;
    const rect = (floor.rectangles || []).find((r) => r.id === f.target?.rect);
    if (!rect || zoneKind(rect) !== 'window' || !validBounds(rect.bounds)) continue;
    const def = materialOf(f.material);
    if (def?.surface !== 'window') continue;
    const b = rect.bounds;
    const alongX = (b.x1 - b.x0) >= (b.y1 - b.y0);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const { hingeEnd, perp } = resolveApertureOrient(rect, b.x0, b.x1, b.y0, b.y1);
    // Plan side (+1 = toward the larger perpendicular coordinate) that is the room.
    const reach = (alongX ? b.y1 - b.y0 : b.x1 - b.x0) / 2 + 0.1;
    const plus = alongX ? inRoom(cx, cy + reach) : inRoom(cx + reach, cy);
    const minus = alongX ? inRoom(cx, cy - reach) : inRoom(cx - reach, cy);
    const side = plus !== minus ? (plus ? 1 : -1) : perp;
    const sill = clipped(rect.sill ?? 0.9, 0, height);
    out.push({
      rectId: rect.id, material: f.material, def, alongX, cx, cy,
      width: alongX ? b.x1 - b.x0 : b.y1 - b.y0,
      sill, head: clipped(rect.head ?? 2.1, sill, height),
      leaves: (rect.hinge ?? 'left') === 'both' ? 2 : 1,
      hingeEnd: hingeEnd === 'hi' ? 'hi' : 'lo',
      roomZ: alongX ? -side : side,
    });
  }
  return out;
}

// Surface finishes (docs/materials.md, phase 2): thin textured overlays laid just in
// front of the slab / wall surface, one merged geometry per material. UVs are PLAN
// METRES (floors: x,y from the plan origin or the region's start corner; walls: the plan
// coordinate along the face, height), so every pattern is anchored at the plan origin and
// equal materials run continuously through doorways and along coplanar faces. The viewer scales UVs to the pattern's
// repeat unit. Planks swap U/V where their rows run along Y (the region's `alongX`),
// matching the takeoff's lay direction; other patterns never swap (a swap is a mirror). `surfaces` = finishSurfaces(project, floor).
const FINISH_LIFT = 0.002; // above the slab top / in front of the wall face
export function finishGeometries(surfaces) {
  // One bucket per (role, material): floor overlays keep the 'floor' role (POV tap
  // target), wall overlays the 'walls' role, so the viewer treats them like the surface.
  const byMaterial = new Map();
  const bucket = (role, id, halfWall = false) => {
    const key = `${role}|${id}|${halfWall}`;
    return byMaterial.get(key) ?? byMaterial.set(key, { role, material: id, halfWall, pos: [], uv: [], normal: [] }).get(key);
  };
  const quad = (b, corners, uvs, n) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      b.pos.push(...corners[i]); b.uv.push(...uvs[i]); b.normal.push(...n);
    }
  };
  for (const region of surfaces?.floors || []) {
    const b = bucket('floor', region.material);
    // The pattern frame of the takeoff (flooring.js): from the region's start corner
    // (`anchor`), planks swapped to their row axis (`alongX`), any other pattern turned
    // 90° when the region is (`patternTurn`: (u, v) = (y, −x)).
    // A stepped pattern then moves by `frameOffset` inside that frame (flooring.js).
    const ax = region.anchor?.x || 0, ay = region.anchor?.y || 0;
    const ox = region.frameOffset?.x || 0, oy = region.frameOffset?.y || 0;
    const uvOf = (x, y) => {
      const dx = x - ax, dy = y - ay;
      if (region.alongX === false) return [dy, dx];
      return region.patternTurn ? [dy + ox, -dx + oy] : [dx + ox, dy + oy];
    };
    for (const r of region.boxes) {
      const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
      quad(b, pts.map(([x, y]) => [x, (r.z || 0) + FINISH_LIFT, -y]), pts.map(([x, y]) => uvOf(x, y)), [0, 1, 0]); // at its room's level
    }
  }
  for (const wall of surfaces?.walls || []) {
    const b = bucket('walls', wall.material, !!wall.halfWall);
    const { face } = wall;
    if (face.cap) { // a half wall's top (or a ceiling boxing's underside, `down`): (u = along it, v = across)
      const z = face.down ? face.z - FINISH_LIFT : face.z + FINISH_LIFT;
      for (const r of wall.boxes) {
        const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
        const at = (u, v) => (face.alongX ? [u, z, -v] : [v, z, -u]);
        const corners = pts.map(([u, v]) => at(u, v));
        // Wound to face up either way (u along y mirrors the quad); an underside the other way round.
        const flip = face.alongX === !!face.down;
        quad(b, flip ? [...corners].reverse() : corners, flip ? [...pts].reverse() : pts, [0, face.down ? -1 : 1, 0]);
      }
      continue;
    }
    for (const r of wall.boxes) { // (u = along, v = height) boxes
      // The finished surface may sit past a lining: each box carries its inset.
      const n = face.at + face.inward * ((r.inset || 0) + FINISH_LIFT);
      const at = (u, v) => (face.vertical ? [n, v, -u] : [u, v, -n]);
      const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
      const normal = face.vertical ? [face.inward, 0, 0] : [0, 0, -face.inward];
      quad(b, pts.map(([u, v]) => at(u, v)), pts, normal);
    }
  }
  return [...byMaterial.values()].filter((b) => b.pos.length).map((b) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    return { material: b.material, role: b.role, halfWall: b.halfWall, geometry };
  });
}
