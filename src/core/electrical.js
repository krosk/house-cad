// Electrical control topology and derived routing shared by AR, sheets, and DXF.
// One kind of link lives in `floor.electricalLinks`: kind 'control' — a logical
// switch→light relationship whose physical path is DERIVED (switch → ceiling →
// light), so it never needs stored coordinates. Coordinates come from live markers
// + floor height, so marker and storey edits cannot leave stale geometry behind.
// (As-built runs are now modeled as wires routed over the conduit network — see
// src/core/conduit.js — which reuses segmentSurface below for classification.)

// A control link's endpoints require compatible fixtures (switch → light).
export function electricalLinkEndpoints(floor, link) {
  const markers = floor?.markers || [];
  const from = markers.find((m) => m.id === link?.fromMarkerId);
  const to = markers.find((m) => m.id === link?.toMarkerId);
  if (!from || !to) return null;
  return from.type === 'switch' && to.type === 'light' ? { from, to } : null;
}

// Points use model coordinates {x, y, z}: x/y are plan axes and z is height above
// the floor. The derived ceiling route rises from the switch to the storey ceiling,
// crosses, then drops to the light.
export function electricalRoutePoints(floor, link) {
  const endpoints = electricalLinkEndpoints(floor, link);
  if (!endpoints) return [];
  const { from, to } = endpoints;
  const start = { x: from.x, y: from.y, z: from.z || 0 };
  const end = { x: to.x, y: to.y, z: to.z || 0 };
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
