// The parametric constraint solver.
//
// Because every rectangle edge is axis-aligned, each edge is a single scalar:
// a left/right edge is an X-coordinate, a bottom/top edge is a Y-coordinate.
// The constraint problem therefore DECOUPLES into two independent 1-D systems
// (all the x's, all the y's), each of which is linear. We solve each axis as a
// small weighted least-squares problem:
//
//   minimize   Σ w_c (constraint residual)²  +  Σ w_s (edge − current)²
//
// Hard constraints get a large weight so they are satisfied essentially
// exactly; the soft "stay" term (weight 1) pins the remaining degrees of
// freedom to the current geometry, giving minimal-movement behavior. The
// first-picked edge of a dimension gets an anchor boost so the dimension grows
// from it; a rectangle being dragged gets a stronger pull so the rest of the
// model accommodates the drag.
//
// Every constraint type we care about (distance, coincident/align, equal,
// symmetric, chained) is linear, so they all slot into the same machinery.

const W_HARD = 1e4;
const W_STAY = 1;
const W_ANCHOR = 50;
const W_DRAG = 300;
const CONFLICT_TOL = 1e-3; // meters

// ---- edge helpers ----
// An edge reference is { rect: <id>, edge: 'left'|'right'|'bottom'|'top' }.

export const EDGE_AXIS = { left: 'x', right: 'x', bottom: 'y', top: 'y' };

export function edgeCoord(rect, edge) {
  switch (edge) {
    case 'left': return rect.x;
    case 'right': return rect.x + rect.w;
    case 'bottom': return rect.y;
    case 'top': return rect.y + rect.h;
    default: throw new Error(`bad edge ${edge}`);
  }
}

let _cid = 0;
export const nextConstraintId = () => `c${++_cid}`;

// Sentinel "rectangle" id for the plan ORIGIN. An edge reference with this id is
// the origin line on its axis, fixed at coordinate 0 (a constant, not a variable).
export const ORIGIN_ID = '__origin__';

// Advance the constraint-id counter past any loaded ids after a project load.
export function syncConstraintIdCounter(ids) {
  for (const id of ids) {
    const m = /^c(\d+)$/.exec(id);
    if (m) _cid = Math.max(_cid, Number(m[1]));
  }
}

/**
 * Create a distance (dimension) constraint between two same-axis edges.
 * Stored value is signed: coord(b) - coord(a). Direction is captured at
 * creation from current geometry so editing the magnitude keeps the side.
 */
export function makeDistance(rectA, edgeA, rectB, edgeB) {
  if (EDGE_AXIS[edgeA] !== EDGE_AXIS[edgeB]) {
    throw new Error('distance requires two edges on the same axis');
  }
  const value = edgeCoord(rectB, edgeB) - edgeCoord(rectA, edgeA);
  return {
    id: nextConstraintId(),
    type: 'distance',
    axis: EDGE_AXIS[edgeA],
    a: { rect: rectA.id, edge: edgeA },
    b: { rect: rectB.id, edge: edgeB },
    value,
    offset: null, // signed perpendicular placement (m); null = auto-stack
    labelT: 0.5, // normalized position along the measured span
    conflict: false,
  };
}

/**
 * Distance from the plan ORIGIN (coordinate 0 on the edge's axis) to a rect edge
 * — i.e. an absolute position lock in plan space. Stored like a distance
 * constraint with the origin as endpoint a (fixed at 0), so value = the signed
 * edge coordinate; editing the magnitude keeps the side (via setConstraintMagnitude).
 */
export function makeOriginDistance(rect, edge) {
  const axis = EDGE_AXIS[edge];
  return {
    id: nextConstraintId(),
    type: 'distance',
    axis,
    a: { rect: ORIGIN_ID, edge: axis }, // origin line, fixed at 0 on this axis
    b: { rect: rect.id, edge },
    value: edgeCoord(rect, edge),
    offset: null,
    labelT: 0.5,
    conflict: false,
  };
}

// ---- marker pins (wall-anchored annotations) ----
// A marker endpoint is { marker: <id> } (no edge). A marker distance pins the
// marker's X or Y to a rect edge (or the origin) — same signed shape as a normal
// distance, so the numpad/flip logic transfers. These are resolved ONE-WAY in
// solveMarkers (the marker follows; it never moves the wall), and are excluded
// from the rectangle solve().

export function isMarkerConstraint(c) {
  return !!(c.a?.marker || c.b?.marker);
}

/** Pin marker X or Y to a rect edge. value = marker coord − edge coord (0 = on the wall). */
export function makeMarkerDistance(marker, refRect, refEdge) {
  const axis = EDGE_AXIS[refEdge];
  return {
    id: nextConstraintId(),
    type: 'distance',
    axis,
    a: { rect: refRect.id, edge: refEdge }, // anchor (the real wall edge)
    b: { marker: marker.id },               // dependent (follows)
    value: marker[axis] - edgeCoord(refRect, refEdge),
    offset: null,
    labelT: 0.5,
    conflict: false,
  };
}

/** Pin marker X or Y to the plan origin (coordinate 0 on that axis). */
export function makeMarkerOriginDistance(marker, axis) {
  return {
    id: nextConstraintId(),
    type: 'distance',
    axis,
    a: { rect: ORIGIN_ID, edge: axis }, // origin line, fixed at 0
    b: { marker: marker.id },
    value: marker[axis],
    offset: null,
    labelT: 0.5,
    conflict: false,
  };
}

// ---- dense linear solver (Gaussian elimination, partial pivoting) ----
// Solves M x = rhs for small symmetric positive-definite M.
function solveLinear(M, rhs) {
  const n = rhs.length;
  // Work on copies.
  const A = M.map((row) => row.slice());
  const b = rhs.slice();

  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-12) continue; // singular column; leave as-is
    if (piv !== col) {
      [A[piv], A[col]] = [A[col], A[piv]];
      [b[piv], b[col]] = [b[col], b[piv]];
    }
    const d = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let s = b[row];
    for (let c = row + 1; c < n; c++) s -= A[row][c] * x[c];
    const d = A[row][row];
    x[row] = Math.abs(d) < 1e-12 ? 0 : s / d;
  }
  return x;
}

// Accumulate a weighted row (w * Σ coef·var = w * target) into normal equations.
function addRow(M, rhs, terms, target, w) {
  const w2 = w * w;
  for (const [i, ci] of terms) {
    for (const [j, cj] of terms) M[i][j] += w2 * ci * cj;
    rhs[i] += w2 * ci * target;
  }
}

/**
 * Solve all constraints of one floor (or any {rectangles, constraints} scope)
 * and write resolved coordinates back into its rectangles. Safe to call on
 * every change. No-op when there are no constraints (geometry is then whatever
 * the user drew/dragged). Project._emit() calls this once per floor.
 */
export function solve(floor) {
  const constraints = floor.constraints;
  const rects = floor.rectangles;
  if (!constraints.length || !rects.length) {
    for (const c of constraints) c.conflict = false;
    return;
  }

  const rectById = new Map(rects.map((r) => [r.id, r]));

  for (const axis of ['x', 'y']) {
    const edges = axis === 'x' ? ['left', 'right'] : ['bottom', 'top'];

    // Build the variable list: two edges per rectangle on this axis.
    const vars = [];
    const index = new Map(); // `${rectId}:${edge}` -> var index
    for (const r of rects) {
      for (const edge of edges) {
        const key = `${r.id}:${edge}`;
        index.set(key, vars.length);
        vars.push({
          rect: r.id,
          edge,
          value: edgeCoord(r, edge),
          weight: r._dragging ? W_DRAG : W_STAY,
        });
      }
    }

    // Anchor boost: the first edge (a) of each distance dimension holds. Marker
    // pins are excluded — they reference a marker endpoint that is not a rect
    // variable, are resolved one-way in solveMarkers, and must never tug a wall.
    const axisConstraints = constraints.filter((c) => c.axis === axis && !isMarkerConstraint(c));
    for (const c of axisConstraints) {
      const ia = index.get(`${c.a.rect}:${c.a.edge}`);
      if (ia != null && vars[ia].weight === W_STAY) vars[ia].weight = W_ANCHOR;
    }

    const n = vars.length;
    const M = Array.from({ length: n }, () => new Array(n).fill(0));
    const rhs = new Array(n).fill(0);

    // Soft "stay" terms.
    for (let i = 0; i < n; i++) addRow(M, rhs, [[i, 1]], vars[i].value, vars[i].weight);

    // Hard constraint terms.
    const rowsForResidual = [];
    for (const c of axisConstraints) {
      const aOrigin = c.a.rect === ORIGIN_ID;
      const bOrigin = c.b.rect === ORIGIN_ID;
      const ia = aOrigin ? null : index.get(`${c.a.rect}:${c.a.edge}`);
      const ib = bOrigin ? null : index.get(`${c.b.rect}:${c.b.edge}`);
      // Every NON-origin endpoint must resolve to a variable; a two-origin
      // constraint is meaningless.
      if ((!aOrigin && ia == null) || (!bOrigin && ib == null) || (aOrigin && bOrigin)) {
        c.conflict = false; continue;
      }
      // coord(b) - coord(a) = value; an origin endpoint contributes a fixed 0
      // (it just drops out of the left-hand side).
      const terms = [];
      if (!bOrigin) terms.push([ib, 1]);
      if (!aOrigin) terms.push([ia, -1]);
      addRow(M, rhs, terms, c.value, W_HARD);
      rowsForResidual.push({ c, terms });
    }

    const x = solveLinear(M, rhs);

    // Flag conflicting (unsatisfiable) hard constraints via residual.
    for (const { c, terms } of rowsForResidual) {
      let lhs = 0;
      for (const [i, ci] of terms) lhs += ci * x[i];
      c.conflict = Math.abs(lhs - c.value) > CONFLICT_TOL;
    }

    // Write results back: reconstruct x/w (or y/h) per rectangle. The two edge
    // variables are solved positionally and CAN cross (e.g. a constraint pushes an
    // edge past its unconstrained opposite), which would yield a negative w/h. We
    // normalize to keep the documented w>=0, h>=0 invariant: bounds-based edge
    // identity (used by every picker/highlight) then always agrees with edgeCoord
    // (raw), so picking an edge never resolves to its opposite.
    for (const r of rects) {
      const lo = x[index.get(`${r.id}:${edges[0]}`)];
      const hi = x[index.get(`${r.id}:${edges[1]}`)];
      if (axis === 'x') { r.x = Math.min(lo, hi); r.w = Math.abs(hi - lo); }
      else { r.y = Math.min(lo, hi); r.h = Math.abs(hi - lo); }
    }
  }
}

/**
 * Resolve a floor's marker pins, ONE-WAY, after solve() has settled the rects.
 * Each marker distance constraint pins the marker's X or Y to a (now-resolved)
 * rect edge or the plan origin; the marker follows, the wall never moves. A
 * marker with no pin on an axis keeps its current (captured/edited) coordinate.
 * Tags each marker `_locked = {x,y}` and `_full` (both pinned → the glyph reads
 * as fully placed). z is never touched — it is inherent, edited by hand.
 */
export function solveMarkers(floor) {
  const markers = floor.markers || [];
  if (!markers.length) return;
  const rectById = new Map(floor.rectangles.map((r) => [r.id, r]));
  const byId = new Map(markers.map((m) => [m.id, m]));

  for (const m of markers) m._locked = { x: false, y: false };

  for (const c of floor.constraints) {
    if (!isMarkerConstraint(c)) continue;
    c.conflict = false; // one-way pins are always satisfiable
    // Identify the marker endpoint (dependent) and the reference endpoint.
    const markerIsB = !!c.b.marker;
    const markerEnd = markerIsB ? c.b : c.a;
    const refEnd = markerIsB ? c.a : c.b;
    const m = byId.get(markerEnd.marker);
    if (!m) continue;
    // Resolve the reference coordinate on this axis from settled geometry.
    let refCoord;
    if (refEnd.rect === ORIGIN_ID) refCoord = 0;
    else {
      const rr = rectById.get(refEnd.rect);
      if (!rr) continue; // dangling ref (rect deleted) — leave the marker free
      refCoord = edgeCoord(rr, refEnd.edge);
    }
    // value = coord(b) − coord(a). Solve for the marker's coordinate.
    m[c.axis] = markerIsB ? refCoord + c.value : refCoord - c.value;
    m._locked[c.axis] = true;
  }

  for (const m of markers) m._full = m._locked.x && m._locked.y;
}
