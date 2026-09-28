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

// Every stored length sits on a 0.1 mm grid (owner, 2026-09-28: float noise split a
// marker stack that was one point, docs/ar-survey.md "Same point"). `n / 1e4` is the
// one canonical double for n tenths of a millimetre, so two lengths that mean the same
// point are bit-identical and compare equal with ===. Project._emit snaps the inputs;
// the solvers snap what they write; a derived edge (x + w) is snapped where it is read.
const GRID_PER_M = 1e4;
export const snapM = (v) => (Number.isFinite(v) ? Math.round(v * GRID_PER_M) / GRID_PER_M : v);

// Store a solved edge pair as the rect's min + size on one axis (both on the grid).
function writeAxis(r, axis, lo, hi) {
  lo = snapM(lo); hi = snapM(hi);
  if (axis === 'x') { r.x = Math.min(lo, hi); r.w = snapM(Math.abs(hi - lo)); }
  else { r.y = Math.min(lo, hi); r.h = snapM(Math.abs(hi - lo)); }
}

export function edgeCoord(rect, edge) {
  switch (edge) {
    case 'left': return rect.x;
    case 'right': return snapM(rect.x + rect.w);
    case 'bottom': return rect.y;
    case 'top': return snapM(rect.y + rect.h);
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
    labelT: 0.5, // affine position along the span (outside 0..1 is allowed)
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

// ---- conduit-node pins (bare junctions dimensioned to a wall) ----
// A node endpoint is { node: <conduitNodeId> } (no edge). A node distance pins a
// bare conduit junction's X or Y to a rect edge (or the origin) — same signed shape
// as a marker pin, so the numpad/flip logic transfers. Resolved ONE-WAY in
// solveConduitNodes (the node follows; it never moves the wall), excluded from the
// rectangle solve(). Marker-bound nodes are never pinned (they follow their device).

export function isNodeConstraint(c) {
  return !!(c.a?.node || c.b?.node);
}

/** Pin a node's X or Y to a rect edge. value = node coord − edge coord (0 = on the wall). */
export function makeNodeDistance(node, refRect, refEdge) {
  const axis = EDGE_AXIS[refEdge];
  return {
    id: nextConstraintId(),
    type: 'distance',
    axis,
    a: { rect: refRect.id, edge: refEdge }, // anchor (the real wall edge)
    b: { node: node.id },                   // dependent (follows)
    value: node[axis] - edgeCoord(refRect, refEdge),
    offset: null,
    labelT: 0.5,
    conflict: false,
  };
}

/** Pin a node's X or Y to the plan origin (coordinate 0 on that axis). */
export function makeNodeOriginDistance(node, axis) {
  return {
    id: nextConstraintId(),
    type: 'distance',
    axis,
    a: { rect: ORIGIN_ID, edge: axis }, // origin line, fixed at 0
    b: { node: node.id },
    value: node[axis],
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
 * the user drew/dragged). Project._emit() calls this once per floor. Returns the
 * furniture dimensions it removed as over-specified: [{constraint, miss}] (m); with
 * `prune: false`, or while a rect is being dragged, they are skipped but kept.
 */
export function solve(floor, { prune = true } = {}) {
  const furniture = floor.rectangles.filter((r) => r.kind === 'furniture');
  if (!furniture.length) { solveRects(floor.rectangles, floor.constraints); return []; }
  // Furniture is solved ONE-WAY, after the structure (docs/furniture.md "Constraints"):
  // walls and rooms settle from their own dimensions only, then each furniture zone is
  // placed against that settled geometry. A furniture dimension can never move a wall.
  const furnIds = new Set(furniture.map((r) => r.id));
  const touchesFurniture = (c) => furnIds.has(c.a?.rect) || furnIds.has(c.b?.rect);
  solveRects(floor.rectangles.filter((r) => !furnIds.has(r.id)),
    floor.constraints.filter((c) => !touchesFurniture(c)));
  const removed = solveFurniture(floor.rectangles, furniture,
    floor.constraints.filter((c) => touchesFurniture(c) && !c.measurement
      && !isMarkerConstraint(c) && !isNodeConstraint(c)));
  // Never delete mid-drag (a drag passing through a tight spot would lose the dimension
  // for good); the over-specified one is just skipped until the drag's final settle.
  if (!prune || floor.rectangles.some((r) => r._dragging)) return [];
  if (removed.length) {
    const gone = new Set(removed.map((r) => r.constraint));
    floor.constraints = floor.constraints.filter((c) => !gone.has(c));
  }
  return removed;
}

// A furniture zone's plan footprint from its product: `productMm` = the catalog's
// [width, height, depth]; facing 90/270 turns it, so width runs along plan y.
export function furnitureFootprint(rect) {
  const mm = rect.productMm;
  if (!Array.isArray(mm) || !(mm[0] > 0) || !(mm[2] > 0)) return null;
  const turned = ((Number(rect.facing) || 0) / 90) % 2 !== 0;
  const w = mm[0] / 1000, d = mm[2] / 1000;
  return turned ? { x: d, y: w } : { x: w, y: d };
}

// Place furniture zones one-way. Every dimension is a difference equation
// coord(b) − coord(a) = value, and structural edges (and the origin) are constants, so
// each axis is a union-find with offsets: equations join edges into rigid groups, a
// group holding a constant is fully placed, and a floating group keeps its weighted
// current position (the same stay/anchor/drag weights as the rectangle solve). A
// product fixes its zone's size first. A later equation that contradicts its group by
// more than CONFLICT_TOL is over-specified: it is REMOVED (owner decision), never
// flagged, and returned with its miss so the UI can say so.
function solveFurniture(allRects, furniture, constraints) {
  const rectById = new Map(allRects.map((r) => [r.id, r]));
  const furnIds = new Set(furniture.map((r) => r.id));
  const removed = [];
  for (const axis of ['x', 'y']) {
    const edges = axis === 'x' ? ['left', 'right'] : ['bottom', 'top'];
    const parent = new Map(); // key -> parent key; 'G' is the fixed ground
    const off = new Map();    // key -> value(key) − value(parent)
    const find = (k) => {
      if (!parent.has(k)) { parent.set(k, k); off.set(k, 0); }
      let root = k, sum = 0;
      while (parent.get(root) !== root) { sum += off.get(root); root = parent.get(root); }
      // Path compression: point k straight at the root.
      if (k !== root) { parent.set(k, root); off.set(k, sum); }
      return [root, sum];
    };
    // Join b to a with value(b) − value(a) = v; false when already joined inconsistently
    // (the returned miss is the signed amount it fails by).
    const join = (a, b, v) => {
      const [ra, oa] = find(a), [rb, ob] = find(b);
      if (ra === rb) return { ok: Math.abs(ob - oa - v) <= CONFLICT_TOL, miss: ob - oa - v };
      // Keep the ground as a root so a placed group is recognised by its root.
      if (rb === 'G') { parent.set(ra, rb); off.set(ra, ob - v - oa); }
      else { parent.set(rb, ra); off.set(rb, oa + v - ob); }
      return { ok: true };
    };
    find('G');
    // An endpoint → its union-find key (a structural edge is joined to the ground at its
    // settled coordinate), or null when it references nothing on this floor.
    const keyOf = (end) => {
      if (end.rect === ORIGIN_ID) return 'G';
      const r = rectById.get(end.rect);
      if (!r || EDGE_AXIS[end.edge] !== axis) return null;
      const key = `${r.id}:${end.edge}`;
      if (!furnIds.has(r.id) && !parent.has(key)) join('G', key, edgeCoord(r, end.edge));
      return key;
    };
    for (const r of furniture) {
      const size = furnitureFootprint(r);
      find(`${r.id}:${edges[0]}`); find(`${r.id}:${edges[1]}`);
      if (size) join(`${r.id}:${edges[0]}`, `${r.id}:${edges[1]}`, size[axis]);
    }
    const anchors = new Set();
    for (const c of constraints) {
      if (c.axis !== axis) continue;
      c.conflict = false; // one-way placement never shows a conflict
      const a = keyOf(c.a), b = keyOf(c.b);
      if (!a || !b || a === b) continue;
      const res = join(a, b, c.value);
      if (!res.ok) removed.push({ constraint: c, miss: res.miss });
      else anchors.add(a);
    }
    // Floating groups settle at the weighted mean of their members' current positions.
    const current = new Map();
    for (const r of furniture) for (const e of edges) current.set(`${r.id}:${e}`, { v: edgeCoord(r, e), r });
    const acc = new Map(); // root -> [Σw·(v − off), Σw]
    for (const [k, { v, r }] of current) {
      const [root, o] = find(k);
      if (root === 'G') continue;
      const w = r._dragging ? W_DRAG : anchors.has(k) ? W_ANCHOR : W_STAY;
      const s = acc.get(root) || [0, 0];
      s[0] += w * (v - o); s[1] += w;
      acc.set(root, s);
    }
    const value = (k) => {
      const [root, o] = find(k);
      if (root === 'G') return o;
      const [sw, w] = acc.get(root);
      return sw / w + o;
    };
    for (const r of furniture) {
      writeAxis(r, axis, value(`${r.id}:${edges[0]}`), value(`${r.id}:${edges[1]}`));
    }
  }
  return removed;
}

// The weighted least-squares rectangle solve (see the header) over one set of rects.
function solveRects(rects, constraints) {
  if (!constraints.length || !rects.length) {
    for (const c of constraints) c.conflict = false;
    return;
  }

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
    const axisConstraints = constraints.filter(
      (c) => c.axis === axis && !c.measurement && !isMarkerConstraint(c) && !isNodeConstraint(c),
    );
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
      writeAxis(r, axis, x[index.get(`${r.id}:${edges[0]}`)], x[index.get(`${r.id}:${edges[1]}`)]);
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
    m[c.axis] = snapM(markerIsB ? refCoord + c.value : refCoord - c.value);
    m._locked[c.axis] = true;
  }

  for (const m of markers) m._full = m._locked.x && m._locked.y;
}

/**
 * Resolve whole-house conduit-node pins, ONE-WAY, after every floor's solve()/
 * solveMarkers() has settled. A node distance constraint lives in the constraints
 * of the node's OWN floor and pins the bare junction's X or Y to a (now-resolved)
 * rect edge or the plan origin ON THAT FLOOR; the node follows, the wall never
 * moves. Marker-bound nodes are skipped (they follow their device marker). Tags
 * each pinned node `_locked = {x,y}` and `_full` (both pinned → glyph reads placed);
 * z is never touched — it is inherent, edited on the CONDUIT·EDIT height pad.
 */
export function solveConduitNodes(project) {
  const nodes = project.conduitNodes || [];
  if (!nodes.length) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) n._locked = { x: false, y: false };

  for (const floor of project.floors) {
    const rectById = new Map(floor.rectangles.map((r) => [r.id, r]));
    for (const c of floor.constraints) {
      if (!isNodeConstraint(c)) continue;
      c.conflict = false; // one-way pins are always satisfiable
      const nodeIsB = !!c.b.node;
      const nodeEnd = nodeIsB ? c.b : c.a;
      const refEnd = nodeIsB ? c.a : c.b;
      const n = byId.get(nodeEnd.node);
      if (!n || n.markerId) continue; // dangling, or marker-bound (follows its device)
      let refCoord;
      if (refEnd.rect === ORIGIN_ID) refCoord = 0;
      else {
        const rr = rectById.get(refEnd.rect);
        if (!rr) continue; // dangling ref (rect deleted) — leave the node free
        refCoord = edgeCoord(rr, refEnd.edge);
      }
      n[c.axis] = snapM(nodeIsB ? refCoord + c.value : refCoord - c.value);
      n._locked[c.axis] = true;
    }
  }

  for (const n of nodes) n._full = n._locked.x && n._locked.y;
}
