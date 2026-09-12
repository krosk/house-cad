// Edge-line geometry for a dimension endpoint, in plan (model) coordinates.
//
// A distance constraint's endpoint is one of:
//   - a rect edge   { rect: <id>, edge: 'left'|'right'|'bottom'|'top' }
//   - the origin     { rect: ORIGIN_ID, edge: 'x'|'y' }   (no real edge)
//   - a marker pin   { marker: <id> }                     (no rect at all)
// Only the first has a drawable edge line. This helper returns that line for a
// rect edge and `null` for everything else, so every consumer (the 2D editor,
// the print/AR sheet renderer) shares ONE guarded lookup.
//
// TRAP (s16): a throw here propagates out of Project._emit() and aborts whatever
// AR gesture triggered the change mid-commit (the desktop Sketch2D re-renders on
// every onChange, even during an AR session). Never assume ref.rect is a real
// edge — bail on marker/origin endpoints instead of dereferencing them.

import { edgeCoord } from './constraints.js';

// Dimension labels sit at an affine position along their measured span: 0 and 1
// are the endpoints, while values below 0 or above 1 deliberately place the label
// beyond them. Keeping this independent of endpoint order means swapping a
// constraint does not move its label, while geometry edits preserve the user's
// relative choice.
export function dimLabelCoord(constraint, coordA, coordB) {
  const t = Number.isFinite(constraint?.labelT)
    ? constraint.labelT
    : 0.5;
  const lo = Math.min(coordA, coordB);
  return lo + (Math.max(coordA, coordB) - lo) * t;
}

export function setDimLabelCoord(constraint, coord, coordA, coordB) {
  const lo = Math.min(coordA, coordB);
  const span = Math.abs(coordB - coordA);
  constraint.labelT = span > 1e-9
    ? (coord - lo) / span
    : 0.5;
}

/**
 * @param {{rect?: any, edge?: string, marker?: any}} ref  a constraint endpoint
 * @param {Array<{id: string, bounds: {x0,y0,x1,y1}}>} rectangles  the floor's rects
 * @returns {{p0:{x,y}, p1:{x,y}, coord:number} | null}
 *   world-space endpoints of the edge and its scalar coordinate, or null when the
 *   endpoint is a marker pin or the origin (no drawable rect edge).
 */
export function edgeLineWorld(ref, rectangles) {
  if (!ref || ref.rect == null) return null; // marker endpoint (no .rect)
  const r = rectangles.find((x) => x.id === (ref.rect.id ?? ref.rect));
  if (!r) return null; // origin sentinel or a deleted/dangling rect
  const b = r.bounds;
  const coord = edgeCoord(r, ref.edge);
  switch (ref.edge) {
    case 'left': return { p0: { x: b.x0, y: b.y0 }, p1: { x: b.x0, y: b.y1 }, coord };
    case 'right': return { p0: { x: b.x1, y: b.y0 }, p1: { x: b.x1, y: b.y1 }, coord };
    case 'bottom': return { p0: { x: b.x0, y: b.y0 }, p1: { x: b.x1, y: b.y0 }, coord };
    case 'top': return { p0: { x: b.x0, y: b.y1 }, p1: { x: b.x1, y: b.y1 }, coord };
    default: return null;
  }
}
