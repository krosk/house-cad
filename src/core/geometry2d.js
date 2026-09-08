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
