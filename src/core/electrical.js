// Electrical control topology and derived routing shared by AR, sheets, and DXF.
// Two kinds of link live in `floor.electricalLinks`:
//   - kind 'control' — a logical switch→light relationship. Its physical path is
//     DERIVED (switch → ceiling → light) so it never needs stored coordinates.
//   - kind 'wire' — an as-built run traced on site between ANY two markers. It
//     stores manual waypoints; the two endpoints still come from live markers so
//     moving a marker keeps the wire attached. The surface each segment runs on
//     (wall / ceiling / floor) is INFERRED from the 3D geometry, not stored.
// Coordinates are always derived from live markers + floor height, so marker and
// storey edits cannot leave stale wire geometry behind.

// Endpoints for a control link require compatible fixtures; a wire accepts any
// two existing markers.
export function electricalLinkEndpoints(floor, link) {
  const markers = floor?.markers || [];
  const from = markers.find((m) => m.id === link?.fromMarkerId);
  const to = markers.find((m) => m.id === link?.toMarkerId);
  if (!from || !to) return null;
  if ((link?.kind || 'control') === 'control') {
    return from.type === 'switch' && to.type === 'light' ? { from, to } : null;
  }
  return { from, to };
}

// Points use model coordinates {x, y, z}: x/y are plan axes and z is height
// above the floor. The first and last points are always the live marker positions.
// A 'wire' with manual waypoints threads them between the endpoints; a 'control'
// link (or a wire lacking waypoints) falls back to the derived ceiling route.
export function electricalRoutePoints(floor, link) {
  const endpoints = electricalLinkEndpoints(floor, link);
  if (!endpoints) return [];
  const { from, to } = endpoints;
  const start = { x: from.x, y: from.y, z: from.z || 0 };
  const end = { x: to.x, y: to.y, z: to.z || 0 };
  const waypoints = link?.route?.mode === 'manual' && Array.isArray(link.route.waypoints)
    ? link.route.waypoints
    : null;
  if (waypoints && waypoints.length) {
    return [start, ...waypoints.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 })), end];
  }
  // Derived ceiling route: rise to the storey ceiling, cross, then drop.
  const ceiling = Math.max(Number(floor.height) || 0, start.z, end.z);
  return [
    start,
    { x: start.x, y: start.y, z: ceiling },
    { x: end.x, y: end.y, z: ceiling },
    end,
  ];
}

// Classify one route segment by the surface a contractor would have run it on.
// Inferred purely from geometry: a roughly level run near the ceiling plane is in
// the ceiling, one near the floor is in the floor slab, and anything with vertical
// extent (a drop/rise) or a level run at mid-height is chased inside a wall.
export function segmentSurface(a, b, height) {
  const CEILING_H = Number(height) || 0;
  const LEVEL_TOL = 0.1;   // |dz| below this reads as a level run
  const PLANE_TOL = 0.25;  // proximity to the ceiling/floor plane
  const level = Math.abs((a.z || 0) - (b.z || 0)) < LEVEL_TOL;
  const avgZ = ((a.z || 0) + (b.z || 0)) / 2;
  if (level && CEILING_H > 0 && avgZ >= CEILING_H - PLANE_TOL) return 'ceiling';
  if (level && avgZ <= PLANE_TOL) return 'floor';
  return 'wall';
}

// Route as classified segments for surface-aware output (per-surface dash on the
// monochrome sheet, per-surface DXF layers, per-surface color in AR).
export function electricalRouteSegments(floor, link) {
  const pts = electricalRoutePoints(floor, link);
  const segments = [];
  for (let i = 1; i < pts.length; i++) {
    segments.push({ a: pts[i - 1], b: pts[i], surface: segmentSurface(pts[i - 1], pts[i], floor?.height) });
  }
  return segments;
}
