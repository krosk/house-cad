// Turn the ordered list of add/subtract rectangles into a set of 2D polygons
// (the building footprint), using robust polygon boolean operations.
//
// We fold the rectangles in order: each "add" unions into the accumulated
// region, each "subtract" is differenced out. The result is a GeoJSON-style
// MultiPolygon: an array of polygons, where each polygon is an array of rings,
// ring[0] is the outer boundary (CCW) and ring[1..] are holes (CW). That maps
// directly onto Three.js Shape + holes for extrusion.

import polygonClipping from 'polygon-clipping';
import { zoneKind } from './zoneColors.js';

// Constraint solving and JSON round-trips can leave mathematically coincident
// edges a few floating-point ulps apart (for example 1.7e-16 m). Polygon boolean
// operations correctly treat those raw numbers as distinct and retain a hairline
// seam. Snap only the boolean input to a nanometre grid; authored/model values and
// serialized precision remain untouched.
const BOOLEAN_SNAP = 1e-9;
const snapBooleanCoord = (value) => Math.round(value / BOOLEAN_SNAP) * BOOLEAN_SNAP;

function ringOf(rect) {
  const { x0, y0, x1, y1 } = rect.bounds;
  // Closed ring, counter-clockwise.
  return [
    [snapBooleanCoord(x0), snapBooleanCoord(y0)],
    [snapBooleanCoord(x1), snapBooleanCoord(y0)],
    [snapBooleanCoord(x1), snapBooleanCoord(y1)],
    [snapBooleanCoord(x0), snapBooleanCoord(y1)],
    [snapBooleanCoord(x0), snapBooleanCoord(y0)],
  ];
}

/**
 * @param {Rectangle[]} rectangles
 * @returns {number[][][][]} MultiPolygon
 */
export function computeFootprint(rectangles) {
  let result = []; // empty MultiPolygon

  for (const rect of rectangles) {
    // Furniture is a movable object sitting IN the room, not part of the building
    // massing: it must never carve the footprint (nor, via extrude, the 3D shell).
    // Its plan symbol is drawn separately; here it is simply ignored, so the room
    // outline (and its bold extremity line) encloses the furniture rather than
    // notching around it.
    if (zoneKind(rect) === 'furniture') continue;
    const b = rect.bounds;
    if (b.x1 - b.x0 <= 0 || b.y1 - b.y0 <= 0) continue; // skip degenerate

    const mp = [[ringOf(rect)]];
    if (rect.op === 'add') {
      result = result.length ? polygonClipping.union(result, mp) : mp;
    } else if (result.length) {
      result = polygonClipping.difference(result, mp);
    }
  }

  return result;
}

/**
 * Axis-aligned reference corners usable by AR recalibration.
 *
 * A useful surveyed corner is not necessarily owned by one rectangle: a room
 * edge can terminate against the side of an insulation/wall rectangle. Build
 * candidates from every horizontal/vertical structural-edge intersection so
 * those composite corners and T-junctions are selectable too. Duplicate
 * intersections (common where several zones share a boundary) collapse to one.
 * Furniture is deliberately excluded because it is movable, not a building
 * registration reference.
 *
 * Returns {cx,cy,a,b}; `a` is an endpoint along the horizontal edge and `b`
 * along the vertical edge, matching RECAL's existing wall-ordering contract.
 */
export function recalibrationCorners(rectangles, epsilon = 1e-6) {
  const horizontal = [];
  const vertical = [];
  for (const rect of rectangles || []) {
    if (zoneKind(rect) === 'furniture') continue;
    const bounds = rect?.bounds;
    if (!bounds) continue;
    const x0 = Math.min(bounds.x0, bounds.x1), x1 = Math.max(bounds.x0, bounds.x1);
    const y0 = Math.min(bounds.y0, bounds.y1), y1 = Math.max(bounds.y0, bounds.y1);
    if (x1 - x0 <= epsilon || y1 - y0 <= epsilon) continue;
    horizontal.push({ y: y0, lo: x0, hi: x1 }, { y: y1, lo: x0, hi: x1 });
    vertical.push({ x: x0, lo: y0, hi: y1 }, { x: x1, lo: y0, hi: y1 });
  }

  const candidates = new Map();
  for (const h of horizontal) {
    for (const v of vertical) {
      if (v.x < h.lo - epsilon || v.x > h.hi + epsilon
          || h.y < v.lo - epsilon || h.y > v.hi + epsilon) continue;
      const cx = v.x, cy = h.y;
      const ax = cx - h.lo > h.hi - cx ? h.lo : h.hi;
      const by = cy - v.lo > v.hi - cy ? v.lo : v.hi;
      const candidate = {
        cx, cy,
        a: { x: ax, y: cy },
        b: { x: cx, y: by },
        span: (h.hi - h.lo) + (v.hi - v.lo),
      };
      const key = `${Math.round(cx / epsilon)}:${Math.round(cy / epsilon)}`;
      const previous = candidates.get(key);
      if (!previous || candidate.span > previous.span) candidates.set(key, candidate);
    }
  }
  return [...candidates.values()].map(({ span, ...corner }) => corner);
}

// Signed shoelace area of a closed or open ring. Polygon-clipping normally closes
// its rings, but the modulo keeps this useful for either representation.
function ringArea(ring) {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice / 2;
}

// Area of a GeoJSON-style MultiPolygon. Ring orientation is not assumed: the
// first ring contributes positively and any following hole rings subtract.
export function multiPolygonArea(multiPolygon) {
  let area = 0;
  for (const polygon of multiPolygon || []) {
    if (!polygon.length) continue;
    area += Math.abs(ringArea(polygon[0]));
    for (let i = 1; i < polygon.length; i++) area -= Math.abs(ringArea(polygon[i]));
  }
  return Math.max(0, area);
}

// Whether two axis-aligned rectangles belong to the same continuous room patch.
// Positive-area overlap counts, as does a shared boundary segment with positive
// length. A single shared corner explicitly does not.
function roomRectsConnect(a, b, epsilon) {
  const ab = a.bounds, bb = b.bounds;
  const overlapX = Math.min(ab.x1, bb.x1) - Math.max(ab.x0, bb.x0);
  const overlapY = Math.min(ab.y1, bb.y1) - Math.max(ab.y0, bb.y0);
  if (overlapX > epsilon && overlapY > epsilon) return true;
  const sharesVerticalEdge = (Math.abs(ab.x1 - bb.x0) <= epsilon || Math.abs(bb.x1 - ab.x0) <= epsilon)
    && overlapY > epsilon;
  const sharesHorizontalEdge = (Math.abs(ab.y1 - bb.y0) <= epsilon || Math.abs(bb.y1 - ab.y0) <= epsilon)
    && overlapX > epsilon;
  return sharesVerticalEdge || sharesHorizontalEdge;
}

/** Every connected ROOM component and its union area in m². */
export function connectedRoomComponents(rectangles, epsilon = 1e-6) {
  const rooms = (rectangles || []).filter((r) => r?.kind === 'room');
  const assigned = new Set();
  const components = [];
  for (const seed of rooms) {
    if (assigned.has(seed.id)) continue;
    const connected = [], ids = new Set([seed.id]), queue = [seed];
    assigned.add(seed.id);
    while (queue.length) {
      const current = queue.shift();
      connected.push(current);
      for (const candidate of rooms) {
        if (assigned.has(candidate.id) || !roomRectsConnect(current, candidate, epsilon)) continue;
        assigned.add(candidate.id);
        ids.add(candidate.id);
        queue.push(candidate);
      }
    }
    // Net architectural area: connected-room union MINUS fixed subtract zones
    // (walls, doors, windows, stairs, cabinets, …). Furniture remains authored as
    // a subtract zone for editing/visualization, but movable furniture does not
    // reduce the room's reported floor area.
    const subtracts = (rectangles || []).filter((r) =>
      r?.op === 'subtract' && zoneKind(r) !== 'furniture');
    components.push({
      rectangles: connected,
      ids,
      area: multiPolygonArea(computeFootprint([...connected, ...subtracts])),
    });
  }
  return components;
}

/** The connected ROOM component containing `seedRect`, or null for a non-room. */
export function connectedRoomComponent(rectangles, seedRect, epsilon = 1e-6) {
  if (!seedRect) return null;
  return connectedRoomComponents(rectangles, epsilon)
    .find((component) => component.ids.has(seedRect.id)) || null;
}
