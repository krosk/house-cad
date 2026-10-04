// Which dimension is wrong? (owner, 2026-10-04: "identify the other constraints that cause
// the conflict, so that I can verify systematically which one is wrong"; docs/ar-survey.md
// "Conflicting dimensions").
//
// On each axis the plan's dimensions form a graph: a node per rect edge (plus the
// origin), an arc per dimension (coord(b) − coord(a) = value). A conflict is a loop whose
// values do not add up. For every dimension of a conflicting group we ask: "if this one
// alone were wrong, would everything else agree?" Those that pass are the SUSPECTS, each
// with the value the others imply for it: remeasure the suspects, and the one whose tape
// reading matches its implied value (rather than its stored value) is the wrong one. No
// suspect means at least two dimensions are wrong.
//
// It mirrors solveRects' inputs: furniture dimensions (solved one-way, never in conflict),
// marker and node pins (one-way) and shared-view measurements are left out.

import { ORIGIN_ID, isMarkerConstraint, isNodeConstraint } from './constraints.js';

export const LOOP_TOL = 1e-3; // m, as the solver's conflict flag
// A 0 mm dimension (a shared wall, an alignment) is beyond doubt (owner, 2026-10-04): it
// still links its two edges in every loop, but it is never a suspect nor listed.
export const isCertain = (c) => Math.abs(c.value) < 5e-5;

// The dimensions the structure solve uses on one floor, grouped by axis.
function structuralDims(floor) {
  const rects = new Map(floor.rectangles.map((r) => [r.id, r]));
  const isFurniture = (id) => rects.get(id)?.kind === 'furniture';
  const known = (ep) => ep.rect === ORIGIN_ID || rects.has(ep.rect);
  return (floor.constraints || []).filter((c) => c.type === 'distance' && !c.measurement
    && !isMarkerConstraint(c) && !isNodeConstraint(c)
    && known(c.a) && known(c.b) && !(c.a.rect === ORIGIN_ID && c.b.rect === ORIGIN_ID)
    && !isFurniture(c.a.rect) && !isFurniture(c.b.rect));
}

const nodeOf = (ep) => (ep.rect === ORIGIN_ID ? ORIGIN_ID : `${ep.rect}:${ep.edge}`);

// Position every node reachable through `dims` (skipping `skip`), from the first node of
// each connected part. Returns the positions and the largest loop mismatch.
function potentials(dims, skip = null) {
  const adj = new Map();
  const link = (n, arc) => (adj.get(n) ?? adj.set(n, []).get(n)).push(arc);
  for (const c of dims) {
    if (c === skip) continue;
    const a = nodeOf(c.a), b = nodeOf(c.b);
    link(a, { to: b, d: c.value, c });
    link(b, { to: a, d: -c.value, c });
  }
  const pos = new Map();
  let worst = 0;
  for (const start of adj.keys()) {
    if (pos.has(start)) continue;
    pos.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      for (const { to, d } of adj.get(n)) {
        const want = pos.get(n) + d;
        if (!pos.has(to)) { pos.set(to, want); queue.push(to); }
        else worst = Math.max(worst, Math.abs(pos.get(to) - want));
      }
    }
  }
  return { pos, worst };
}

// The loop blocks of one axis (biconnected components, Tarjan): every loop lies wholly in
// one block, so each block's conflict is independent of the others. Two wrong dimensions
// in two different blocks still give each block its own suspects. A dimension on no loop
// (a bridge) is a block of its own and never conflicts.
function blocks(dims) {
  const adj = new Map();
  for (const c of dims) {
    const a = nodeOf(c.a), b = nodeOf(c.b);
    (adj.get(a) ?? adj.set(a, []).get(a)).push({ to: b, c });
    (adj.get(b) ?? adj.set(b, []).get(b)).push({ to: a, c });
  }
  const disc = new Map(), low = new Map(), used = new Set(), stack = [], out = [];
  let time = 0;
  const visit = (u, via) => {
    disc.set(u, time); low.set(u, time); time++;
    for (const { to, c } of adj.get(u)) {
      if (c === via || used.has(c)) continue;
      used.add(c); stack.push(c);
      if (!disc.has(to)) {
        visit(to, c);
        low.set(u, Math.min(low.get(u), low.get(to)));
        if (low.get(to) >= disc.get(u)) { // u separates this block: pop it
          const block = [];
          let e;
          do { e = stack.pop(); block.push(e); } while (e !== c);
          out.push(block);
        }
      } else low.set(u, Math.min(low.get(u), disc.get(to)));
    }
  };
  for (const n of adj.keys()) if (!disc.has(n)) visit(n, null);
  return out;
}

/**
 * Every conflicting loop block of dimensions on `floor`:
 * [{ axis, ids: Set (every dimension of the block, 0 mm ones included), worst (m, the largest loop
 *    mismatch), suspects: [{ id, value, implied, delta }] }] — delta = implied − value.
 * Suspects are ordered by |delta|, smallest first (a small slip is the likelier error).
 */
export function diagnoseConflicts(floor) {
  const out = [];
  for (const axis of ['x', 'y']) {
    const dims = structuralDims(floor).filter((c) => c.axis === axis);
    for (const group of blocks(dims)) {
      const { worst } = potentials(group);
      if (worst <= LOOP_TOL) continue;
      const suspects = [];
      for (const c of group) {
        if (isCertain(c)) continue;
        const rest = potentials(group, c);
        if (rest.worst > LOOP_TOL) continue;
        // In a block every dimension is on a loop, so its two edges stay tied by the
        // others, from one start: the difference is the value they imply for it.
        const implied = rest.pos.get(nodeOf(c.b)) - rest.pos.get(nodeOf(c.a));
        suspects.push({ id: c.id, value: c.value, implied, delta: implied - c.value });
      }
      suspects.sort((p, q) => Math.abs(p.delta) - Math.abs(q.delta));
      out.push({ axis, ids: new Set(group.map((c) => c.id)), worst, suspects });
    }
  }
  return out;
}

/** The conflicting block holding dimension `cId`, or null. */
export const conflictGroupOf = (floor, cId) => diagnoseConflicts(floor).find((g) => g.ids.has(cId)) || null;
