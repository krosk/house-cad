// Electrical control topology and derived routing shared by AR, sheets, and DXF.
// V1 stores only the logical switch/light ids plus route mode. Coordinates remain
// derived from live markers and floor height, so marker and storey edits cannot
// leave stale wire geometry behind.

export function electricalLinkEndpoints(floor, link) {
  const markers = floor?.markers || [];
  const from = markers.find((m) => m.id === link?.fromMarkerId);
  const to = markers.find((m) => m.id === link?.toMarkerId);
  return from?.type === 'switch' && to?.type === 'light' ? { from, to } : null;
}

// Points use model coordinates {x, y, z}: x/y are plan axes and z is height
// above the floor. The first and last points are always the live marker positions.
export function electricalRoutePoints(floor, link) {
  const endpoints = electricalLinkEndpoints(floor, link);
  if (!endpoints) return [];
  const { from, to } = endpoints;
  const ceiling = Math.max(Number(floor.height) || 0, from.z || 0, to.z || 0);
  return [
    { x: from.x, y: from.y, z: from.z || 0 },
    { x: from.x, y: from.y, z: ceiling },
    { x: to.x, y: to.y, z: ceiling },
    { x: to.x, y: to.y, z: to.z || 0 },
  ];
}
