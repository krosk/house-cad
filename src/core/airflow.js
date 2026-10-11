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
// The stack effect acts on each inlet at its world height (outdoor tOut vs indoor tRoom). Envelope
// leakage is not modelled (an airtight house): every m³ comes in through the inlets.
// Pure model code: nothing is stored; the AR AIR INLET tool runs it on every change.
import { heatComponents, heatSettings } from './heatLoss.js';
import { AIR_INLETS } from './airInlets.js';
import { zoneKind } from './zoneColors.js';

const RHO_IN = 1.204, CD = 0.6, UNDERCUT = 0.01;
// Scenarios (owner may cycle them in AR). Vent flows m³/h: typical hygro B extract figures
// (Hypothesis: the kitchen vent's real flows are not known); inlets: the flow at 20 Pa each EHB²
// is opened to, the same for all (one humidity for the house: Hypothesis).
export const AIRFLOW_SCENARIOS = [
  { id: 'normal', kitchen: 30, sanitary: 15, inletOpen: 25 },
  { id: 'night', kitchen: 15, sanitary: 15, inletOpen: 44 },
  { id: 'bathBoost', kitchen: 30, sanitary: 45, inletOpen: 25 },
  { id: 'kitchenBoost', kitchen: 135, sanitary: 15, inletOpen: 25 },
  { id: 'allBoost', kitchen: 135, sanitary: 45, inletOpen: 25 },
];
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
        inlets.push({ rect: r, zone: inside, z: (floor.elevation || 0) + head - 0.1, zLocal: head - 0.1, q20: Math.min(sc.inletOpen, AIR_INLETS[r.airInlet].flowMax), x: cx, y: cy, nx, ny, half: (alongX ? h : w) / 2, floor });
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
  return { scenario: sc, zones, links, inlets, vents, doorsOpen };
}

/** Solve the network: zone pressures (Pa, at world height 0) and every flow (m³/h). */
export function solveAirNetwork(net, project) {
  const s = heatSettings(project);
  const rhoOut = 353 / (273.15 + s.tOut), rhoIn = 353 / (273.15 + s.tRoom), dRho = rhoOut - rhoIn;
  const { zones, links, inlets, vents } = net;
  const lost = vents.filter((v) => !v.zone);
  // Spaces reachable from an inlet; a vent in a space no inlet reaches cannot be fed.
  const fed = new Set(inlets.map((i) => i.zone.index));
  for (let grow = true; grow;) { grow = false; for (const l of links) for (const [p, q] of [[l.a, l.b], [l.b, l.a]]) if (fed.has(p.index) && !fed.has(q.index)) { fed.add(q.index); grow = true; } }
  const starved = vents.filter((v) => v.zone && !fed.has(v.zone.index));
  const active = zones.filter((z) => fed.has(z.index)), idx = new Map(active.map((z, i) => [z.index, i]));
  const N = active.length, p = new Float64Array(N).fill(-5);
  const sq = (k, dp) => (Math.abs(dp) < 1e-3 ? k * dp / Math.sqrt(1e-3) : Math.sign(dp) * k * Math.sqrt(Math.abs(dp)));
  const inletDp = (i, P) => -P[idx.get(i.zone.index)] - dRho * 9.81 * i.z;
  const net0 = (P) => {
    const f = new Float64Array(N);
    for (const i of inlets) f[idx.get(i.zone.index)] += sq(i.q20 / Math.sqrt(20), inletDp(i, P));
    for (const l of links) { if (!idx.has(l.a.index)) continue; const a = idx.get(l.a.index), b = idx.get(l.b.index), q = sq(l.C, P[a] - P[b]); f[a] -= q; f[b] += q; }
    for (const v of vents) if (v.zone && idx.has(v.zone.index)) f[idx.get(v.zone.index)] -= v.q;
    return f;
  };
  let resid = Infinity;
  if (N && inlets.length) {
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
  // Each space's supply: what flows into it (from outside and from other spaces).
  const supply = new Map(zones.map((z) => [z.index, 0]));
  for (const i of inletFlows) if (i.q > 0) supply.set(i.zone.index, supply.get(i.zone.index) + i.q);
  for (const l of linkFlows) supply.set((l.q > 0 ? l.b : l.a).index, supply.get((l.q > 0 ? l.b : l.a).index) + Math.abs(l.q));
  const extract = vents.reduce((a, v) => a + (v.zone && fed.has(v.zone.index) ? v.q : 0), 0);
  const dps = inletFlows.map((i) => i.dp);
  return { inlets: inletFlows, links: linkFlows, vents, zones: zones.map((z) => ({ ...z, p: P(z), supply: supply.get(z.index) })),
    extract, suction: dps.length ? { min: Math.min(...dps), max: Math.max(...dps) } : null,
    ok: Number.isFinite(resid) && resid < 1e-3 * Math.max(1, extract), resid, lost, starved, noInlets: !inlets.length };
}

export const runAirflow = (project, scenario, opts) => solveAirNetwork(buildAirNetwork(project, scenario, opts), project);
