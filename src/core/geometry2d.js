// Turn the ordered list of add/subtract rectangles into a set of 2D polygons
// (the building footprint), using robust polygon boolean operations.
//
// We fold the rectangles in order: each "add" unions into the accumulated
// region, each "subtract" is differenced out. The result is a GeoJSON-style
// MultiPolygon: an array of polygons, where each polygon is an array of rings,
// ring[0] is the outer boundary (CCW) and ring[1..] are holes (CW). That maps
// directly onto Three.js Shape + holes for extrusion.

import polygonClipping from 'polygon-clipping';

function ringOf(rect) {
  const { x0, y0, x1, y1 } = rect.bounds;
  // Closed ring, counter-clockwise.
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
}

/**
 * @param {Rectangle[]} rectangles
 * @returns {number[][][][]} MultiPolygon
 */
export function computeFootprint(rectangles) {
  let result = []; // empty MultiPolygon

  for (const rect of rectangles) {
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
    // Net area: the connected rooms' union MINUS every subtract zone (walls, doors,
    // …) carved out of them. Adds must precede subtracts so computeFootprint unions
    // the rooms first, then differences the cutouts.
    const subtracts = (rectangles || []).filter((r) => r?.op === 'subtract');
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
