// Pipe fittings derived from the drawn network (owner, 2026-10-15: "modelize the bends in 3d view"). Pure data:
// nothing is stored. A PVC run (VMC and waste) is a chain of pipes between nodes; where two pipes turn at a node the
// fitting is the standard elbow of that angle, where three meet a tee, and a size change a reducer. Each fitting has
// one leg per pipe, reaching from the node (the axes' intersection) to its socket mouth: Z (axis to the socket
// bottom, where the pipe stops) + L (the socket depth). Two checks come out of it:
//   - `angle`: no standard fitting turns that way (or a node joins four pipes, or a tee with no straight run);
//   - `short`: the pipe between two fittings is shorter than their two reaches, so the fittings would overlap
//     (F/F); `mf` when an M/F fitting, its spigot straight in the next socket, would still fit.
// Other services (heating, water, refrigerant) get no fittings: their joints are not modelled.
//
// Sizes: PVC drain fittings NF EN 1329, Nicoll as the source of typical dimensions (owner, 2026-10-08: any maker,
// they differ by a few millimetres). Every value below is Proven, read 2026-10-15 from Nicoll's datasheets (owner:
// "make sure the product dimensions are not guessed"):
//   - FT_coudes_evac_FF.pdf (https://www.nicoll.fr/sites/default/files/products/FT_coudes_evac_FF.pdf), F/F elbows
//     C%22 20°, C%33 30°, C%44 45°, C%66 67°30', C%88 87°30': Z (corner to the socket bottom, where the pipe stops)
//     and L (socket depth);
//   - FT_coudes_evac_MF.pdf, M/F elbows (CR8 / CT8 / CX8 / CZ8 87°30'): the same Z and L, and h = Z + L, the spigot
//     end from the corner (its drawing shows Z ending at the socket bottom). Used by the `mf` check below;
//   - FT_culottes_simples_FF_evac.pdf, F/F tees and Y-branches at 45°, 67°30' and 87°30': Z1 (the run leg the
//     branch turns away from), Z2 (the branch), Z3 (the run leg the branch leans toward), L1 (run sockets), L2
//     (branch socket); the reducing ones (D/d) too;
//   - FT_reductions_evac.pdf, M/F eccentric reducers I%: Z (the spigot end to the small socket's bottom), L1 (the big
//     spigot), L2 (the small socket).
// Not covered by a datasheet here (marked `est`): a straight size change between two plain pipes (it needs a coupling
// as well) and a small elbow with the reducer after it (the stub and coupling between them).
// The socket's outer diameter is taken as 1.12 × the pipe's (Ø100 → 112, Hypothesis as in tools/wc-drain-fit.mjs).

export const FITTING_SERVICES = new Set(['vmc', 'waste']);
const ANGLE_TOL = 3;       // degrees either side of a standard angle
const STRAIGHT_TOL = 4;    // a "straight" joint: within this of 0° turn
const SOCKET_OD = 1.12;

const mm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / 1000]));
// per diameter: socket L, F/F elbow Z by angle, and tees by branch angle as [Z1, Z2, Z3]
export const PVC_FITTINGS = {
  0.08: { socket: 0.047, bends: mm({ 20: 15, 30: 20, 45: 26.5, 67.5: 43, 87.5: 61 }),
    tees: { 45: [0.0265, 0.103, 0.103], 67.5: [0.043, 0.0635, 0.0635], 87.5: [0.061, 0.061, 0.040] } },
  0.1: { socket: 0.057, bends: mm({ 20: 20, 30: 23.5, 45: 33, 67.5: 53, 87.5: 77 }),
    tees: { 45: [0.033, 0.126, 0.126], 67.5: [0.053, 0.079, 0.079], 87.5: [0.077, 0.077, 0.052] } },
  0.125: { socket: 0.061, bends: mm({ 20: 20, 30: 25, 45: 41, 67.5: 67, 87.5: 96 }),
    tees: { 45: [0.041, 0.156, 0.156], 67.5: [0.067, 0.098, 0.098], 87.5: [0.096, 0.096, 0.065] } },
  0.16: { socket: 0.061, bends: mm({ 20: 23, 30: 30, 45: 53, 67.5: 86, 87.5: 122 }),
    tees: { 45: [0.053, 0.197, 0.197], 67.5: [0.086, 0.124, 0.124], 87.5: [0.121, 0.122, 0.083] } },
};
// reducing tees, key `${D}/${d}` (the run D, the branch d): [Z1, Z2, Z3], the branch socket from the branch's table
const REDUCING_TEES = {
  '0.1/0.08': { 45: [0.029, 0.124, 0.126], 87.5: [0.071, 0.059, 0.051] },
  '0.125/0.1': { 45: [0.041, 0.153, 0.156], 87.5: [0.096, 0.075, 0.065] },
  '0.16/0.125': { 45: [0.024, 0.183, 0.176], 87.5: [0.083, 0.110, 0.067] },
  '0.16/0.1': { 87.5: [0.083, 0.110, 0.067] },
};
// M/F eccentric reducers, key `${D}/${d}`: Z from the big spigot's end to the small socket's bottom
const REDUCERS = { '0.1/0.08': 0.080, '0.125/0.1': 0.089, '0.125/0.08': 0.109, '0.16/0.125': 0.099, '0.16/0.1': 0.124 };

function table(d) {
  const key = Object.keys(PVC_FITTINGS).map(Number).find((k) => Math.abs(k - d) < 0.004);
  return key == null ? null : { ...PVC_FITTINGS[key], d: key };
}
const reducerZ = (D, d) => REDUCERS[`${D}/${d}`];

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const unit = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const deg = (c) => (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;

// The standard bend nearest a turn (deg, 0 = straight on), or null. A drawn 90° is an 87°30' (the drain's 2.5°).
function standardBend(turn, t) {
  let best = null;
  for (const a of Object.keys(t.bends).map(Number)) {
    const target = a === 87.5 ? 90 : a;
    const tol = a === 87.5 ? ANGLE_TOL + 2.5 : ANGLE_TOL;
    if (Math.abs(turn - target) <= tol && (!best || Math.abs(turn - target) < Math.abs(turn - best.target))) best = { angle: a, target };
  }
  return best;
}
export const angleLabel = (a) => (a === 87.5 ? "87°30'" : a === 67.5 ? "67°30'" : `${a}°`);

// project-independent: nodes [{id}], pipes [{id, a, b, service, diameter}], pos(node) → {x, y, z} absolute metres.
// Returns { fittings, shortPipes } where each fitting is
//   { nodeId, kind: 'elbow'|'tee'|'reducer'|'joint', service, center, legs: [{ pipeId, dir, reach, od }],
//     label, flag: null|'angle'|'short'|'mf', est }
export function derivePipeFittings(nodes, pipes, pos) {
  const byNode = new Map();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const p of pipes) {
    if (!FITTING_SERVICES.has(p.service)) continue;
    const a = nodeById.get(p.a), b = nodeById.get(p.b);
    if (!a || !b) continue;
    for (const [here, there] of [[a, b], [b, a]]) {
      (byNode.get(here.id) ?? byNode.set(here.id, []).get(here.id)).push({ pipe: p, from: here, to: there });
    }
  }
  const fittings = [];
  const reachAt = new Map(); // `${nodeId}:${pipeId}` → { reach: to the socket mouth, z: to where the pipe stops }
  const mmLabel = (d) => `Ø${Math.round(d * 1000)}`;
  for (const [nodeId, ends] of byNode) {
    if (ends.length < 2) continue; // a free end (a vent, a port): no fitting
    const center = pos(nodeById.get(nodeId));
    const legs = ends.map((e) => ({ pipe: e.pipe, d: e.pipe.diameter || 0.1, dir: unit(sub(pos(e.to), center)) }));
    if (legs.some((l) => !table(l.d))) continue; // a size with no datasheet here: no fitting rather than a guess
    const dMax = Math.max(...legs.map((l) => l.d)), dMin = Math.min(...legs.map((l) => l.d));
    const t = table(dMax);
    const fit = { nodeId, service: legs[0].pipe.service, center, legs: [], label: '', flag: null, est: false };
    const push = (l, z, reach) => {
      fit.legs.push({ pipeId: l.pipe.id, dir: l.dir, reach, od: l.d * SOCKET_OD, d: l.d });
      reachAt.set(`${nodeId}:${l.pipe.id}`, { reach, z });
    };
    // a leg of the fitting's own size: the pipe stops at Z, the socket mouth is L further
    const own = (l, z, tt = t) => push(l, z, z + tt.socket);
    // a smaller pipe on a bigger socket at Z: an M/F reducer's spigot home there, the pipe stops Zr further
    const reduced = (l, zBig, D = dMax) => {
      const zr = reducerZ(D, l.d);
      if (zr == null) fit.est = true;
      const z = zBig + (zr ?? table(l.d).socket + (D - l.d));
      push(l, z, z + table(l.d).socket);
    };
    const sizes = dMin < dMax - 1e-6 ? ` ${mmLabel(dMax)}→${mmLabel(dMin)}` : '';
    if (legs.length === 2) {
      const turn = 180 - deg(dot(legs[0].dir, legs[1].dir));
      if (turn <= STRAIGHT_TOL) {
        if (!sizes) continue; // a pipe split in two: no fitting
        // a size change between two pipes: the reducer's spigot in a coupling on the big pipe (est: the coupling)
        fit.kind = 'reducer';
        fit.est = true;
        for (const l of legs) (l.d === dMax ? own(l, 0) : reduced(l, 0));
        fit.label = `reducer${sizes}`;
      } else {
        fit.kind = 'elbow';
        const bend = standardBend(turn, t);
        const tSmall = table(dMin), bendSmall = sizes ? standardBend(turn, tSmall) : null;
        const pipeLen = (l) => len(sub(pos(nodeById.get(l.pipe.a === nodeId ? l.pipe.b : l.pipe.a)), center));
        // two sizes: the big elbow with the reducer in its socket (datasheet), or the small elbow with a stub,
        // the reducer and a coupling after it (est), whichever leaves more pipe
        const bigFirst = bend && Math.min(...legs.map((l) => pipeLen(l) - (l.d === dMax
          ? t.bends[bend.angle] + t.socket : t.bends[bend.angle] + (reducerZ(dMax, l.d) ?? 0.08) + tSmall.socket)));
        const smallFirst = bendSmall && Math.min(...legs.map((l) => pipeLen(l) - (l.d === dMin
          ? tSmall.bends[bendSmall.angle] + tSmall.socket
          : tSmall.bends[bendSmall.angle] + 2 * tSmall.socket + (reducerZ(dMax, dMin) ?? 0.08) + t.socket)));
        if (bendSmall && (!bend || smallFirst > bigFirst)) {
          const z0 = tSmall.bends[bendSmall.angle];
          for (const l of legs) {
            if (l.d === dMin) own(l, z0, tSmall);
            else { const z = z0 + 2 * tSmall.socket + (reducerZ(dMax, dMin) ?? 0.08); push(l, z, z + t.socket); }
          }
          fit.est = true;
          fit.label = `${angleLabel(bendSmall.angle)} ${mmLabel(dMin)}, then a reducer to ${mmLabel(dMax)}`;
        } else if (bend) {
          const z0 = t.bends[bend.angle];
          for (const l of legs) (l.d === dMax ? own(l, z0) : reduced(l, z0));
          fit.label = `${angleLabel(bend.angle)} ${mmLabel(dMax)}${sizes ? ` + reducer to ${mmLabel(dMin)}` : ''}`;
        } else {
          for (const l of legs) own(l, t.bends[87.5]);
          fit.flag = 'angle';
          fit.label = `no standard elbow for ${turn.toFixed(1)}°`;
        }
      }
    } else if (legs.length === 3) {
      // the run: the straightest pair; the third pipe is the branch
      let run = null;
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const turn = 180 - deg(dot(legs[i].dir, legs[j].dir));
        if (!run || turn < run.turn) run = { i, j, turn };
      }
      const branch = legs[3 - run.i - run.j];
      const [m1, m2] = [legs[run.i], legs[run.j]];
      const D = Math.max(m1.d, m2.d);
      const tRun = table(D);
      const a1 = deg(dot(branch.dir, m1.dir)), a2 = deg(dot(branch.dir, m2.dir));
      const near = Math.min(a1, a2);
      const angle = [87.5, 67.5, 45].find((a) => Math.abs(near - (a === 87.5 ? 90 : a)) <= (a === 87.5 ? ANGLE_TOL + 2.5 : ANGLE_TOL));
      fit.kind = 'tee';
      if (run.turn > STRAIGHT_TOL + 2 || angle == null) {
        for (const l of legs) own(l, t.bends[87.5]);
        fit.flag = 'angle';
        fit.label = run.turn > STRAIGHT_TOL + 2 ? `three pipes with no straight run (${run.turn.toFixed(0)}° off)`
          : `no standard tee for a ${near.toFixed(0)}° branch`;
      } else {
        // Z1 on the run leg the branch turns away from, Z2 the branch, Z3 the run leg it leans toward
        const zs = branch.d === D ? tRun.tees[angle] : REDUCING_TEES[`${D}/${branch.d}`]?.[angle];
        const [z1, z2, z3] = zs ?? tRun.tees[angle];
        if (!zs) fit.est = true;
        const [lean, away] = a1 <= a2 ? [m1, m2] : [m2, m1];
        for (const [l, z] of [[away, z1], [lean, z3]]) (l.d === D ? own(l, z, tRun) : reduced(l, z, D));
        if (branch.d === D || zs) own(branch, z2, table(branch.d));
        else reduced(branch, z2, D);
        fit.label = `${angleLabel(angle)} ${angle === 87.5 ? 'tee' : 'branch'} ${mmLabel(D)}${branch.d < D ? `/${Math.round(branch.d * 1000)}` : ''}`;
      }
    } else {
      for (const l of legs) own(l, table(l.d).bends[87.5], table(l.d));
      fit.kind = 'joint';
      fit.flag = 'angle';
      fit.label = `${legs.length} pipes at one node`;
    }
    fittings.push(fit);
  }
  // Fittings that overlap: the pipe between them is shorter than their two reaches (1 mm slack). When an M/F
  // fitting would do (its spigot, as long as a socket, home in the other's socket: reach + the other's Z), the
  // pipe is `mf` instead: buildable, with no pipe between, if that part exists in the size.
  const shortPipes = [];
  const none = { reach: 0, z: 0 };
  for (const p of pipes) {
    const ra = reachAt.get(`${p.a}:${p.id}`) || none, rb = reachAt.get(`${p.b}:${p.id}`) || none;
    if (!ra.reach && !rb.reach) continue;
    const a = nodeById.get(p.a), b = nodeById.get(p.b);
    if (!a || !b) continue;
    const length = len(sub(pos(b), pos(a)));
    // a free end (a vent's or a unit's spigot) can go straight into the fitting's socket: the fitting's Z is enough
    const free = (id) => (byNode.get(id)?.length || 0) <= 1;
    const need = !rb.reach && free(p.b) ? ra.z : !ra.reach && free(p.a) ? rb.z : ra.reach + rb.reach;
    if (length >= need - 0.001) continue;
    const needMF = ra.reach && rb.reach ? Math.min(ra.reach + rb.z, rb.reach + ra.z) : need;
    shortPipes.push({ pipeId: p.id, length, need, needMF, mf: length >= needMF - 0.001 });
  }
  const shortBy = new Map(shortPipes.map((s) => [s.pipeId, s]));
  for (const f of fittings) {
    if (f.flag) continue;
    const hits = f.legs.map((l) => shortBy.get(l.pipeId)).filter(Boolean);
    if (hits.some((h) => !h.mf)) f.flag = 'short';
    else if (hits.length) f.flag = 'mf';
  }
  return { fittings, shortPipes };
}
