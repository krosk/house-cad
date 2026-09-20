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
const WALL_ZONE_KINDS = new Set(['wall', 'door', 'window', 'halfwall', 'sliding']);

const validBounds = (b) => b && b.x1 - b.x0 > EPS && b.y1 - b.y0 > EPS;
const clipped = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function openingBand(rect, storeyHeight) {
  const kind = zoneKind(rect);
  if (kind === 'door' || kind === 'sliding') {
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
  const half = thickness / 2;
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
          sources.push({
            x0: ax - half, x1: ax + half,
            y0: Math.min(ay, by) - half, y1: Math.max(ay, by) + half,
            source: 'exterior',
          });
        } else if (Math.abs(ay - by) <= EPS) {
          sources.push({
            x0: Math.min(ax, bx) - half, x1: Math.max(ax, bx) + half,
            y0: ay - half, y1: ay + half,
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
  const wallGeometry = boxesGeometry(architecturalWallBoxes(floor, opts));
  return { floorGeometry, wallGeometry, ceilingGeometry };
}
