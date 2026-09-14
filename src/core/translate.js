// Rigid plan translation for one floor. This is deliberately separate from the
// constraint solver: changing two origin dimensions sequentially can deform a
// fully constrained graph, while translating every authored point atomically
// preserves its shape and all relative constraints.

import { edgeCoord, isMarkerConstraint, ORIGIN_ID } from './constraints.js';
import { dimLabelCoord, setDimLabelCoord } from './dimline.js';

function endpointCoord(endpoint, axis, rectById, markerById) {
  if (endpoint?.rect === ORIGIN_ID) return 0;
  if (endpoint?.marker) return markerById.get(endpoint.marker)?.[axis];
  const rect = rectById.get(endpoint?.rect);
  return rect ? edgeCoord(rect, endpoint.edge) : null;
}

/** Mutate a floor by one rigid plan-space translation. The caller emits once. */
export function translateFloor(floor, dx, dy) {
  if (!floor || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const delta = { x: dx, y: dy };
  const rectById = new Map((floor.rectangles || []).map((r) => [r.id, r]));
  const markerById = new Map((floor.markers || []).map((m) => [m.id, m]));

  // An origin dimension has one stationary endpoint. Capture its authored value
  // panel in absolute plan coordinates so the box can receive the full delta too.
  const originLabelCoords = new Map();
  for (const c of (floor.constraints || [])) {
    if (c.a?.rect !== ORIGIN_ID && c.b?.rect !== ORIGIN_ID) continue;
    const a = endpointCoord(c.a, c.axis, rectById, markerById);
    const b = endpointCoord(c.b, c.axis, rectById, markerById);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      originLabelCoords.set(c, dimLabelCoord(c, a, b));
    }
  }

  for (const rect of (floor.rectangles || [])) {
    rect.x += dx;
    rect.y += dy;
  }
  for (const marker of (floor.markers || [])) {
    marker.x += dx;
    marker.y += dy;
  }

  for (const c of (floor.constraints || [])) {
    const axisDelta = delta[c.axis] || 0;
    const aOrigin = c.a?.rect === ORIGIN_ID;
    const bOrigin = c.b?.rect === ORIGIN_ID;
    if (aOrigin !== bOrigin) c.value += aOrigin ? axisDelta : -axisDelta;

    // Marker dim offsets and plan origin-dim offsets are absolute coordinates on
    // the perpendicular axis. Relative edge-edge offsets already move with edges.
    if (Number.isFinite(c.offset) && (isMarkerConstraint(c) || aOrigin || bOrigin)) {
      c.offset += c.axis === 'x' ? dy : dx;
    }

    const oldLabel = originLabelCoords.get(c);
    if (Number.isFinite(oldLabel)) {
      const a = endpointCoord(c.a, c.axis, rectById, markerById);
      const b = endpointCoord(c.b, c.axis, rectById, markerById);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        setDimLabelCoord(c, oldLabel + axisDelta, a, b);
      }
    }
  }
  return true;
}
