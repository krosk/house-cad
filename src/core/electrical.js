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

const LEVEL_TOL = 0.1;   // |dz| below this reads as a level run
const PLANE_TOL = 0.25;  // proximity to a storey's ceiling/floor plane

// Storey bands in ABSOLUTE world Z, one per floor, sorted bottom→top. Used to classify
// whole-house conduit runs: a run whose two ends fall in different storeys is a riser.
export function storeyBands(project) {
  return (project?.floors || [])
    .map((f) => ({ lo: f.elevation || 0, hi: (f.elevation || 0) + (Number(f.height) || 0) }))
    .sort((a, b) => a.lo - b.lo);
}

// Which storey band a world-Z falls in (index into a sorted band list). Points on a
// shared slab match the lower storey; points beyond the stack clamp to an end.
function bandIndex(z, bands) {
  for (let i = 0; i < bands.length; i++) {
    if (z >= bands[i].lo - PLANE_TOL && z <= bands[i].hi + PLANE_TOL) return i;
  }
  return z < (bands[0]?.lo ?? 0) ? 0 : bands.length - 1;
}

// Classify one route segment by the surface a contractor would run it on, in absolute
// world Z against the storey `bands` (from storeyBands). A run with vertical extent
// whose ends sit in different storeys is a 'riser' (pierces a slab); otherwise a level
// run near a storey's ceiling/floor plane is 'ceiling'/'floor', and anything else is a
// wall chase. `bands` may be omitted for a single implicit storey [0, height]-less use.
export function segmentSurface(a, b, bands = []) {
  const az = a.z || 0, bz = b.z || 0;
  const level = Math.abs(az - bz) < LEVEL_TOL;
  if (bands.length) {
    if (!level && bandIndex(az, bands) !== bandIndex(bz, bands)) return 'riser';
    const avgZ = (az + bz) / 2;
    const band = bands.find((bd) => avgZ >= bd.lo - PLANE_TOL && avgZ <= bd.hi + PLANE_TOL) || bands[bandIndex(avgZ, bands)];
    if (band) {
      if (level && avgZ >= band.hi - PLANE_TOL) return 'ceiling';
      if (level && avgZ <= band.lo + PLANE_TOL) return 'floor';
    }
  }
  return 'wall';
}
