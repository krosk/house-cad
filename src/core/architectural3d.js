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

export const ARCH_WALL_THICKNESS = 0.12;
export const ARCH_SLAB_THICKNESS = 0.06;
const EPS = 1e-7;
// Solid wall material in 3D. INSULATION is an interior lining authored over the room
// edge (markers are pinned to its inner face), so it renders as wall too; without it
// the room read 18–21 cm too deep and lining-mounted outlets had no surface.
const WALL_ZONE_KINDS = new Set(['wall', 'insulation', 'door', 'garage', 'window', 'halfwall', 'sliding']);

const validBounds = (b) => b && b.x1 - b.x0 > EPS && b.y1 - b.y0 > EPS;
const clipped = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Solved coordinates carry float noise (a room edge at -1.88 beside a door edge at
// -1.8799999999999999). Snap grid lines to 1 µm so near-equal edges share one line;
// otherwise the 1e-14 m band between them became a zero-thickness, full-height wall
// "sheet" that no opening could cut, drawn straight across door faces.
const snap = (v) => Math.round(v * 1e6) / 1e6;
// Furthest an opening may be extended through wall layers beyond its own footprint.
const PIERCE_MAX = 0.6;

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
  const height = Math.max(0, floor?.height || 0);
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
  const openings = rectangles.flatMap((rect) => {
    const band = openingBand(rect, height);
    return band && validBounds(rect.bounds)
      ? [{ rect, bounds: piercedBounds(rect.bounds, sources), z0: band[0], z1: band[1] }]
      : [];
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

// Lightweight procedural staircase: one merged thin tread per riser. The flight
// runs along the stair's `climb` (stairClimb: legacy = long axis toward max). STAIRS
// UP climbs from this floor up along it; STAIRS DOWN is the same flight seen from
// the storey above, so it descends against it.
// Keeping treads as thin slabs (rather than a solid stepped mass) makes both the
// direction and the opening below readable while staying cheap on mobile GPUs.
function stairsGeometry(floor, { downRise = floor?.height || 2.8 } = {}) {
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
    const rise = Math.max(0.2, kind === 'stairs_down' ? downRise : (floor.height || 2.8));
    const count = Math.max(3, Math.min(24, Math.ceil(rise / 0.18)));
    const treadRun = run / count;
    const slab = Math.min(0.05, rise / count * 0.3);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const level = kind === 'stairs_up' ? t * rise : -rise + t * rise;
      const geometry = alongX
        ? new THREE.BoxGeometry(treadRun, slab, cross)
        : new THREE.BoxGeometry(cross, slab, treadRun);
      // i-th tread from the bottom of the flight, walking the climb direction.
      const s = forward ? treadRun * (i + 0.5) : run - treadRun * (i + 0.5);
      const planX = alongX ? b.x0 + s : (b.x0 + b.x1) / 2;
      const planY = alongX ? (b.y0 + b.y1) / 2 : b.y0 + s;
      geometry.translate(planX, level - slab / 2, -planY);
      geometries.push(geometry);
    }
  }
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
    const z = clipped(Number.isFinite(marker.z) ? marker.z : 1.1, 0.01, Math.max(0.01, (floor?.height || 2.5) - 0.01));
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
  const stairGeometry = stairsGeometry(floor, opts);
  return {
    floorGeometry, wallGeometry, ceilingGeometry, doorGeometry, windowGeometry,
    outlineGeometry, stairGeometry, markerPlacements: wallMarkerPlacements(floor, wallBoxes),
  };
}
