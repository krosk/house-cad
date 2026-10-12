// Whole-house VMC air network (owner, 2026-10-11: "drive the simulation in AR, as someone places the
// inlet and launch a computation"; docs/plumbing-workflow.md "Air paths computed"). Each space (a floor's
// connected rooms with the stairs open to them, core/heatLoss.js heatComponents) is one node at one
// pressure. Links:
//  - a window's air inlet (core/airInlets.js) from outside: Q = Q20 · √(Δp / 20 Pa), Q20 = the opening
//    the scenario gives (Hypothesis: an inlet's flow is quoted at 20 Pa and behaves as an orifice);
//  - a door, sliding door or garage door between two spaces: shut, its 1 cm undercut (or open, full);
//    a passage: open over its sill–head band. Orifice, Cd 0.6;
//  - an open stairwell between two storeys: their stair zones overlap (as in houseBalance), orifice of
//    the overlap area;
//  - the VMC extract vents: every open end of a `vmc` duct that is neither at a VMC unit nor an outlet
//    (≥ Ø160): a fixed flow (the hygro vents hold their flow in their pressure range), Ø ≥ 125 mm a
//    kitchen vent. Its space: the one containing the duct end on the end's floor.
//  - envelope leakage (heat setting `airtight`, Q4Pa-surf): each heated space's envelope (outside walls
//    with their openings above the earth, ceiling under the attic) leaks Q = Q4 · A · (Δp / 4 Pa)^0.67,
//    split in two at a quarter and three quarters of the storey's height, so the stack effect can push
//    air in low and out high.
// The stack effect acts on each inlet and leak at its world height (outdoor tOut vs indoor tRoom).
// With sleepers (a room's `sleepers`, night scenarios) each space's CO₂ is solved too (well mixed,
// steady state).
// Pure model code: nothing is stored; the AR AIR INLET tool runs it on every change.
import { heatComponents, heatSettings, floorHeatLoss } from './heatLoss.js';
import { AIR_INLETS } from './airInlets.js';
import { zoneKind } from './zoneColors.js';
import { ceilingHeight } from './storey.js';

const RHO_IN = 1.204, CD = 0.6, UNDERCUT = 0.01;
// Scenarios (cycled in AR). Vent flows m³/h: typical hygro B extract figures (Hypothesis: the
// kitchen vent's real flows are not known, and it has no setting for its minimum: owner, 2026-10-12).
// `inlets`: the flow at 20 Pa every inlet is opened to (one humidity for the house: Hypothesis), or
// 'sleepers': each opens with the people sleeping in its space (inletOpenFor). `tOut` °C: the outdoor
// air of the stack effect; 5 = a typical winter day or night (Hypothesis: Paris area, January),
// null = the heating design temperature (heatSettings tOut). `night`: the sleepers are in (CO₂).
export const AIRFLOW_SCENARIOS = [
  { id: 'normal', kitchen: 30, sanitary: 15, inlets: 25, tOut: 5 },
  { id: 'night', kitchen: 15, sanitary: 15, inlets: 'sleepers', tOut: 5, night: true },
  { id: 'nightCold', kitchen: 15, sanitary: 15, inlets: 'sleepers', tOut: null, night: true },
  { id: 'bathBoost', kitchen: 30, sanitary: 45, inlets: 25, tOut: 5 },
  { id: 'kitchenBoost', kitchen: 135, sanitary: 15, inlets: 25, tOut: 5 },
  { id: 'allBoost', kitchen: 135, sanitary: 45, inlets: 25, tOut: 5 },
];
// A humidity-controlled inlet's opening (m³/h at 20 Pa) with `sleepers` people in its space.
// Hypothesis: the EHB²'s humidity curve is not published (Aldes sheet 11014233): an empty space keeps
// it at its minimum, each sleeper opens it by 19 m³/h, two open it fully (6 → 25 → 44).
export const inletOpenFor = (inlet, sleepers) => (inlet.hygro
  ? Math.max(inlet.flowMin, Math.min(inlet.flowMax, inlet.flowMin + 19 * (sleepers || 0))) : inlet.flowMax);
// CO₂ (ppm): outdoor air, and what a sleeping adult breathes out (m³/h; Hypothesis: published figures
// for a sleeping adult run 13–17 L/h).
export const CO2_OUT = 420, CO2_SLEEPER = 0.015;
const LEAK_N = 0.67;   // the envelope's flow exponent (the usual blower-door figure)
// A VMC unit's duct ports are not vents (furniture article of a ventilation box).
const VMC_UNIT = /easyhome|agalina|vmc/i;
const OUTLET_D = 0.155;      // m: a duct this wide or wider is the unit's outlet (Ø160)
const KITCHEN_D = 0.12;      // m: a kitchen vent's duct (Ø125)
const PORT_REACH = 0.15;     // m: a duct end this close to a unit's footprint is one of its ports

const inBox = (b, x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const orifice = (A) => CD * A * Math.sqrt(2 / RHO_IN) * 3600;   // m³/h per √Pa

/** The network of `project` for `scenario` (an AIRFLOW_SCENARIOS entry or its id), doors shut unless `doorsOpen`. */
export function buildAirNetwork(project, scenario = 'normal', { doorsOpen = false } = {}) {
  const sc = typeof scenario === 'string' ? AIRFLOW_SCENARIOS.find((s) => s.id === scenario) : scenario;
  const floors = [...project.floors].sort((a, b) => (a.elevation || 0) - (b.elevation || 0));
  const zones = [], links = [], inlets = [], vents = [];
  const zoneAt = (floor, x, y) => zones.find((z) => z.floor === floor && z.rects.some((r) => inBox(r.bounds, x, y)));
  for (const floor of floors) {
    for (const comp of heatComponents(floor)) {
      if (comp.rectangles.every((r) => r.outdoor)) continue;
      const big = comp.rectangles.reduce((a, r) => (r.bounds.x1 - r.bounds.x0) * (r.bounds.y1 - r.bounds.y0) > (a.bounds.x1 - a.bounds.x0) * (a.bounds.y1 - a.bounds.y0) ? r : a);
      zones.push({ index: zones.length, floor, rects: comp.rectangles, ids: comp.ids,
        sleepers: comp.rectangles.reduce((a, r) => a + (r.sleepers || 0), 0),
        label: { x: (big.bounds.x0 + big.bounds.x1) / 2, y: (big.bounds.y0 + big.bounds.y1) / 2 } });
    }
  }
  // Openings: probe both sides of each zone across its thin axis.
  for (const floor of floors) {
    for (const r of floor.rectangles) {
      const kind = zoneKind(r);
      const isDoor = kind === 'door' || kind === 'sliding' || kind === 'garage', isPassage = kind === 'passage', isWindow = kind === 'window';
      if (!isDoor && !isPassage && !(isWindow && AIR_INLETS[r.airInlet])) continue;
      const b = r.bounds, w = b.x1 - b.x0, h = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const alongX = w >= h, width = alongX ? w : h;
      const sideA = alongX ? zoneAt(floor, cx, b.y0 - 0.05) : zoneAt(floor, b.x0 - 0.05, cy);
      const sideB = alongX ? zoneAt(floor, cx, b.y1 + 0.05) : zoneAt(floor, b.x1 + 0.05, cy);
      if (isWindow) {
        const inside = sideA && !sideB ? sideA : sideB && !sideA ? sideB : null;
        if (!inside) continue;     // an interior window, or no room beside it
        const head = Number.isFinite(r.head) ? r.head : 2.1;
        // (nx, ny): the unit vector into the room; zLocal: the inlet's height above its floor.
        const nx = alongX ? 0 : inside === sideA ? -1 : 1, ny = alongX ? (inside === sideA ? -1 : 1) : 0;
        inlets.push({ rect: r, zone: inside, z: (floor.elevation || 0) + head - 0.1, zLocal: head - 0.1, q20: sc.inlets === 'sleepers' ? inletOpenFor(AIR_INLETS[r.airInlet], inside.sleepers) : Math.min(sc.inlets, AIR_INLETS[r.airInlet].flowMax), x: cx, y: cy, nx, ny, half: (alongX ? h : w) / 2, floor });
        continue;
      }
      if (!sideA || !sideB || sideA === sideB) continue; // an exterior door (shut, not modelled) or inside one space
      const band = Math.max(0, (Number.isFinite(r.head) ? r.head : 2.1) - (Number.isFinite(r.sill) ? r.sill : 0));
      const area = isPassage || doorsOpen ? width * band : width * UNDERCUT;
      // (nx, ny): the unit vector from side a to side b across the opening.
      links.push({ a: sideA, b: sideB, C: orifice(area), kind: isPassage ? 'passage' : 'door', rect: r, x: cx, y: cy, floor, nx: alongX ? 0 : 1, ny: alongX ? 1 : 0 });
    }
  }
  // Stairwells between consecutive storeys.
  // heatComponents stands each open stair in as a room proxy flagged `stair`.
  const stairsOf = (z) => z.rects.filter((r) => r.stair || /stairs/.test(zoneKind(r))).map((r) => r.bounds);
  for (let f = 0; f + 1 < floors.length; f++) {
    for (const za of zones.filter((z) => z.floor === floors[f])) for (const zb of zones.filter((z) => z.floor === floors[f + 1])) {
      let best = null, A = 0;
      for (const sa of stairsOf(za)) for (const sb of stairsOf(zb)) { const o = overlapArea(sa, sb); if (o > A) { A = o; best = { sa, sb }; } }
      if (A > 0.1) links.push({ a: za, b: zb, C: orifice(A), kind: 'stairs',
        box: { x0: Math.max(best.sa.x0, best.sb.x0), x1: Math.min(best.sa.x1, best.sb.x1), y0: Math.max(best.sa.y0, best.sb.y0), y1: Math.min(best.sa.y1, best.sb.y1) }, x: (Math.max(best.sa.x0, best.sb.x0) + Math.min(best.sa.x1, best.sb.x1)) / 2,
        y: (Math.max(best.sa.y0, best.sb.y0) + Math.min(best.sa.y1, best.sb.y1)) / 2, floor: floors[f + 1] });
    }
  }
  // Vents: open ends of the vmc ducts.
  const pipes = (project.pipes || []).filter((p) => p.service === 'vmc');
  const degree = new Map(), dia = new Map();
  for (const p of pipes) for (const n of [p.a, p.b]) { degree.set(n, (degree.get(n) || 0) + 1); dia.set(n, Math.max(dia.get(n) || 0, p.diameter || 0)); }
  const units = floors.flatMap((floor) => floor.rectangles.filter((r) => zoneKind(r) === 'furniture' && VMC_UNIT.test(r.article || '')).map((r) => ({ floor, b: r.bounds })));
  for (const node of project.pipeNodes || []) {
    if (degree.get(node.id) !== 1) continue;
    const d = dia.get(node.id) || 0;
    if (d >= OUTLET_D) continue;
    const floor = floors.find((f) => f.id === node.floorId);
    if (!floor) continue;
    let { x, y } = node;
    if (node.markerId) { const m = floor.markers?.find((mm) => mm.id === node.markerId); if (m) ({ x, y } = m); }
    if (units.some((u) => u.floor === floor && x > u.b.x0 - PORT_REACH && x < u.b.x1 + PORT_REACH && y > u.b.y0 - PORT_REACH && y < u.b.y1 + PORT_REACH)) continue;
    const zone = zoneAt(floor, x, y);
    const kitchen = d >= KITCHEN_D;
    vents.push({ node, zone, kitchen, q: kitchen ? sc.kitchen : sc.sanitary, x, y, floor });
  }
  // Envelope leaks: each heated space's envelope area, from the heat-loss model (same spaces).
  const leaks = [], q4 = heatSettings(project).airtight;
  if (q4 > 0) {
    for (const floor of floors) {
      const H = ceilingHeightOf(floor);
      for (const room of floorHeatLoss(project, floor)) {
        const zone = zones.find((z) => z.floor === floor && [...room.ids].some((id) => z.ids.has(id)));
        if (!zone) continue;
        // The walls leak half low, half high; the ceiling under the attic at the ceiling.
        const d = room.detail, wallA = Math.max(0, d.wallArea + d.openingArea - d.earthArea), ceilA = d.above?.none || 0;
        for (const [A, z] of [[wallA / 2, H * 0.25], [wallA / 2, H * 0.75], [ceilA, H - 0.05]]) {
          if (A > 0) leaks.push({ zone, floor, A, C: q4 * A / 4 ** LEAK_N, zLocal: z, z: (floor.elevation || 0) + z });
        }
      }
    }
  }
  return { scenario: sc, zones, links, inlets, vents, leaks, doorsOpen };
}
const ceilingHeightOf = (floor) => ceilingHeight(floor, 2.5);

/** Solve the network: zone pressures (Pa, at world height 0) and every flow (m³/h). */
export function solveAirNetwork(net, project) {
  const s = heatSettings(project), sc = net.scenario, tOut = sc.tOut ?? s.tOut;
  const rhoOut = 353 / (273.15 + tOut), rhoIn = 353 / (273.15 + s.tRoom), dRho = rhoOut - rhoIn;
  const { zones, links, inlets, vents } = net, leaks = net.leaks || [];
  const lost = vents.filter((v) => !v.zone);
  // Spaces reachable from an inlet; a vent in a space no inlet reaches cannot be fed.
  const fed = new Set([...inlets, ...leaks].map((i) => i.zone.index));
  for (let grow = true; grow;) { grow = false; for (const l of links) for (const [p, q] of [[l.a, l.b], [l.b, l.a]]) if (fed.has(p.index) && !fed.has(q.index)) { fed.add(q.index); grow = true; } }
  const starved = vents.filter((v) => v.zone && !fed.has(v.zone.index));
  const active = zones.filter((z) => fed.has(z.index)), idx = new Map(active.map((z, i) => [z.index, i]));
  const N = active.length, p = new Float64Array(N).fill(-5);
  const sq = (k, dp) => (Math.abs(dp) < 1e-3 ? k * dp / Math.sqrt(1e-3) : Math.sign(dp) * k * Math.sqrt(Math.abs(dp)));
  const inletDp = (i, P) => -P[idx.get(i.zone.index)] - dRho * 9.81 * i.z;
  const pw = (C, dp) => (Math.abs(dp) < 1e-3 ? C * dp * 1e-3 ** (LEAK_N - 1) : Math.sign(dp) * C * Math.abs(dp) ** LEAK_N);
  const net0 = (P) => {
    const f = new Float64Array(N);
    for (const i of inlets) f[idx.get(i.zone.index)] += sq(i.q20 / Math.sqrt(20), inletDp(i, P));
    for (const l of leaks) f[idx.get(l.zone.index)] += pw(l.C, inletDp(l, P));
    for (const l of links) { if (!idx.has(l.a.index)) continue; const a = idx.get(l.a.index), b = idx.get(l.b.index), q = sq(l.C, P[a] - P[b]); f[a] -= q; f[b] += q; }
    for (const v of vents) if (v.zone && idx.has(v.zone.index)) f[idx.get(v.zone.index)] -= v.q;
    return f;
  };
  let resid = Infinity;
  if (N && (inlets.length || leaks.length)) {
    for (let it = 0; it < 400; it++) {
      const f0 = net0(p), J = Array.from({ length: N }, () => new Float64Array(N)), h = 1e-6;
      for (let j = 0; j < N; j++) { p[j] += h; const f1 = net0(p); for (let i = 0; i < N; i++) J[i][j] = (f1[i] - f0[i]) / h; p[j] -= h; }
      const b = Array.from(f0, (v) => -v);
      for (let k = 0; k < N; k++) {
        let m = k; for (let r = k + 1; r < N; r++) if (Math.abs(J[r][k]) > Math.abs(J[m][k])) m = r;
        [J[k], J[m]] = [J[m], J[k]]; [b[k], b[m]] = [b[m], b[k]];
        for (let r = k + 1; r < N; r++) { const fct = J[r][k] / J[k][k]; if (!fct) continue; for (let c = k; c < N; c++) J[r][c] -= fct * J[k][c]; b[r] -= fct * b[k]; }
      }
      const x = new Float64Array(N); for (let k = N - 1; k >= 0; k--) { let t = b[k]; for (let c = k + 1; c < N; c++) t -= J[k][c] * x[c]; x[k] = t / J[k][k]; }
      let mx = 0; for (let i = 0; i < N; i++) { const d = Math.max(-5, Math.min(5, x[i])) * 0.8; p[i] += d; mx = Math.max(mx, Math.abs(d)); }
      if (mx < 1e-9) break;
    }
    resid = net0(p).reduce((a, v) => a + Math.abs(v), 0);
  }
  const P = (z) => (idx.has(z.index) ? p[idx.get(z.index)] : null);
  const inletFlows = inlets.map((i) => ({ ...i, dp: idx.has(i.zone.index) ? inletDp(i, p) : 0, q: idx.has(i.zone.index) ? sq(i.q20 / Math.sqrt(20), inletDp(i, p)) : 0 }));
  const linkFlows = links.map((l) => ({ ...l, q: idx.has(l.a.index) ? sq(l.C, P(l.a) - P(l.b)) : 0 }));
  const leakFlows = leaks.map((l) => ({ ...l, q: idx.has(l.zone.index) ? pw(l.C, inletDp(l, p)) : 0 }));
  // Each space's supply: what flows into it (from outside and from other spaces).
  const supply = new Map(zones.map((z) => [z.index, 0]));
  for (const i of inletFlows) if (i.q > 0) supply.set(i.zone.index, supply.get(i.zone.index) + i.q);
  for (const l of leakFlows) if (l.q > 0) supply.set(l.zone.index, supply.get(l.zone.index) + l.q);
  for (const l of linkFlows) supply.set((l.q > 0 ? l.b : l.a).index, supply.get((l.q > 0 ? l.b : l.a).index) + Math.abs(l.q));
  // Each space's fresh air: what comes straight from outside (its inlets and leaks).
  const fresh = new Map(zones.map((z) => [z.index, 0]));
  for (const i of [...inletFlows, ...leakFlows]) if (i.q > 0) fresh.set(i.zone.index, fresh.get(i.zone.index) + i.q);
  const co2 = sc.night ? solveCo2(zones, idx, inletFlows, leakFlows, linkFlows, vents) : null;
  const extract = vents.reduce((a, v) => a + (v.zone && fed.has(v.zone.index) ? v.q : 0), 0);
  const dps = inletFlows.map((i) => i.dp);
  const leakIn = leakFlows.reduce((a, l) => a + Math.max(0, l.q), 0), leakOut = leakFlows.reduce((a, l) => a - Math.min(0, l.q), 0);
  return { scenario: sc, tOut, inlets: inletFlows, links: linkFlows, leaks: leakFlows, leakIn, leakOut, vents,
    zones: zones.map((z) => ({ ...z, p: P(z), supply: supply.get(z.index), fresh: fresh.get(z.index), co2: co2?.get(z.index) ?? null })),
    extract, suction: dps.length ? { min: Math.min(...dps), max: Math.max(...dps) } : null,
    ok: Number.isFinite(resid) && resid < 1e-3 * Math.max(1, extract), resid, lost, starved, noInlets: !inlets.length };
}

// Steady CO₂ (ppm) of each solved space, well mixed: what flows out at its own concentration balances what
// flows in at its source's (outside = CO2_OUT) plus its sleepers' breath. Linear, one unknown per space.
function solveCo2(zones, idx, inlets, leaks, links, vents) {
  const N = idx.size, A = Array.from({ length: N }, () => new Float64Array(N)), b = new Float64Array(N);
  const outOf = (i, q) => { A[i][i] += q; };
  for (const z of zones) if (idx.has(z.index)) b[idx.get(z.index)] += z.sleepers * CO2_SLEEPER * 1e6;
  for (const e of [...inlets, ...leaks]) { if (!idx.has(e.zone.index)) continue; const i = idx.get(e.zone.index);
    if (e.q > 0) b[i] += e.q * CO2_OUT; else outOf(i, -e.q); }
  for (const v of vents) if (v.zone && idx.has(v.zone.index)) outOf(idx.get(v.zone.index), v.q);
  for (const l of links) { if (!idx.has(l.a.index) || !idx.has(l.b.index) || !l.q) continue;
    const [from, to] = l.q > 0 ? [idx.get(l.a.index), idx.get(l.b.index)] : [idx.get(l.b.index), idx.get(l.a.index)], q = Math.abs(l.q);
    outOf(from, q); A[to][from] -= q; }
  // A space no air flows through has no steady value: pin it to outside, reported as null.
  const still = new Set(); for (let i = 0; i < N; i++) if (!(A[i][i] > 1e-9)) { still.add(i); A[i].fill(0); A[i][i] = 1; b[i] = CO2_OUT; }
  for (let k = 0; k < N; k++) {
    let m = k; for (let r = k + 1; r < N; r++) if (Math.abs(A[r][k]) > Math.abs(A[m][k])) m = r;
    [A[k], A[m]] = [A[m], A[k]]; [b[k], b[m]] = [b[m], b[k]];
    for (let r = k + 1; r < N; r++) { const f = A[r][k] / A[k][k]; if (!f) continue; for (let c = k; c < N; c++) A[r][c] -= f * A[k][c]; b[r] -= f * b[k]; }
  }
  const x = new Float64Array(N); for (let k = N - 1; k >= 0; k--) { let t = b[k]; for (let c = k + 1; c < N; c++) t -= A[k][c] * x[c]; x[k] = t / A[k][k]; }
  return new Map([...idx].map(([zi, i]) => [zi, still.has(i) ? null : x[i]]));
}

export const runAirflow = (project, scenario, opts) => solveAirNetwork(buildAirNetwork(project, scenario, opts), project);
