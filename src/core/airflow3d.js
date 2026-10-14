// The whole house's air in 3D (owner, 2026-10-11: "Add the whole house instead then, not per floor";
// docs/plumbing-workflow.md "Air paths computed"). The whole-house network (core/airflow.js) fixes
// every flow that crosses a floor's boundary: each inlet, each vent, each stairwell, stack effect
// included (a potential-flow field has no buoyancy, so it cannot find the stair flows itself). Inside
// each floor the air is solved as potential flow on a non-uniform grid (≤ `hmax`, every room / opening
// edge on a grid line, so a 7 cm wall is its own cells), walls, half walls and furniture solid, a shut
// door its 1 cm undercut (a layer of its own). Then ONE age-of-air system over every floor: the air a
// stairwell brings into a floor carries the age of the air leaving the other floor there, so each
// cell's age is the time since that air came in from OUTSIDE through an inlet. A little turbulent
// mixing D. The walls' leaks enter or leave spread over their rooms. No heat (no plumes), no people: Hypothesis. Pure functions: houseAirInput runs on the page,
// solveHouse3d in a worker.
import { zoneKind } from './zoneColors.js';
import { ceilingHeight, roomCeiling, roomFloorZ } from './storey.js';

const UNDERCUT = 0.01;
const box = (b, z0, z1) => [b.x0, b.x1, b.y0, b.y1, z0, z1];

/** Plain-data input for one floor: geometry boxes plus the boundary flows of a network result. */
function floorAirInput(floor, result, { hmax, doorsOpen }) {
  const H = ceilingHeight(floor, 2.5);
  const fluid = [], solid = [], cutsX = [], cutsY = [], cutsZ = [UNDERCUT];
  for (const r of floor.rectangles) {
    const k = zoneKind(r), b = r.bounds;
    const sill = Number.isFinite(r.sill) ? r.sill : 0, head = Number.isFinite(r.head) ? r.head : 2.1;
    if (k === 'room' && !r.outdoor) fluid.push(box(b, Math.max(0, roomFloorZ(r)), roomCeiling(floor, r, 2.5))); // its own floor level and ceiling
    else if (k === 'stairs_up' || k === 'stairs_down') fluid.push(box(b, 0, H));
    else if (k === 'passage') { fluid.push(box(b, sill, Math.min(head, H))); cutsZ.push(sill, head); }
    else if (k === 'door' || k === 'sliding' || k === 'garage') { fluid.push(box(b, sill, doorsOpen ? Math.min(head, H) : sill + UNDERCUT)); if (sill > 0) cutsZ.push(sill, sill + UNDERCUT); if (doorsOpen) cutsZ.push(head); }
    else if (k === 'wall' || k === 'insulation') solid.push(box(b, 0, H));
    else if (k === 'halfwall') solid.push(box(b, 0, Math.max(0, sill)));
    else if (k === 'heater') solid.push(box(b, Math.max(0, sill), Math.min(H, head)));
    else if (k === 'furniture') solid.push(box(b, r.foot ?? 0, r.top ?? 0));
    else if (k === 'soffit') solid.push(box(b, Math.min(H, r.foot ?? H), H));
    else continue;
    if (k !== 'furniture' && k !== 'heater' && k !== 'soffit') { cutsX.push(b.x0, b.x1); cutsY.push(b.y0, b.y1); }
  }
  // Boundary flows (m³/s): + in, − out. A point source sits in the nearest air cell; a stairwell
  // spreads over its overlap box, tagged with its link so the two floors' ends can be paired.
  const sources = [];
  for (const i of result.inlets) if (i.floor === floor && i.q) {
    const d = i.half + 0.1;
    sources.push({ x: i.x + i.nx * d, y: i.y + i.ny * d, z: Math.min(H - 0.05, i.zLocal), q: i.q / 3600, kind: 'inlet' });
  }
  for (const v of result.vents) if (v.floor === floor && v.zone) sources.push({ x: v.x, y: v.y, z: Math.min(H - 0.05, Math.max(0.05, v.node.z ?? H - 0.1)), q: -v.q / 3600, kind: 'vent' });
  result.links.forEach((l, link) => {
    if (l.kind !== 'stairs' || (l.a.floor !== floor && l.b.floor !== floor) || Math.abs(l.q) < 1e-6) return;
    const upper = l.b.floor === floor;           // a = lower storey; q > 0 rises
    const q = (upper ? l.q : -l.q) / 3600;       // into this floor
    // Air arrives from below through the floor, leaves upward under the ceiling (and the reverse).
    sources.push({ box: l.box, z0: upper ? 0 : H - 0.3, z1: upper ? 0.3 : H, q, kind: 'stairs', link });
  });
  // Envelope leaks (Hypothesis: spread over the space's rooms in the leak's height band, as a stand-in
  // for its outside walls / ceiling): in or out, by the room's share of the space's area.
  for (const l of result.leaks || []) if (l.floor === floor && Math.abs(l.q) > 1e-6) {
    const rooms = l.zone.rects.filter((r) => zoneKind(r) === 'room').map((r) => r.bounds);
    const area = rooms.reduce((a, b) => a + (b.x1 - b.x0) * (b.y1 - b.y0), 0);
    const z0 = Math.max(0, Math.min(l.zLocal, H) - H / 4), z1 = Math.min(H, z0 + H / 2);
    for (const b of rooms) sources.push({ box: b, z0, z1, q: l.q / 3600 * (b.x1 - b.x0) * (b.y1 - b.y0) / area, kind: 'leak' });
  }
  return { floorId: floor.id, H, fluid, solid, cutsX, cutsY, cutsZ, sources, hmax };
}

/** Plain-data input for the whole house (every floor) from a network result. */
export function houseAirInput(project, result, { hmax = 0.2, D = 0.0005, doorsOpen = false } = {}) {
  // A split level (the garden, model.js isSplitLevel) is outdoors: not part of the air network.
  const floors = project.floors.filter((f) => !Number.isFinite(f.level)).sort((a, b) => (a.elevation || 0) - (b.elevation || 0));
  return { D, floors: floors.map((f) => floorAirInput(f, result, { hmax, doorsOpen })).filter((f) => f.fluid.length) };
}

const brk = (lo, hi, cuts, h) => {
  const c = [...new Set([lo, hi, ...cuts.filter((v) => v > lo + 1e-4 && v < hi - 1e-4)].map((v) => Math.round(v * 1e4) / 1e4))].sort((a, b) => a - b), out = [c[0]];
  for (let n = 1; n < c.length; n++) { const L = c[n] - c[n - 1], m = Math.max(1, Math.ceil(L / h - 1e-9)); for (let s = 1; s <= m; s++) out.push(c[n - 1] + L * s / m); }
  return out;
};

// One floor's grid, face conductances, sources per cell and potential flow.
function floorField(inp, progress) {
  const { H, fluid, solid, sources, hmax } = inp;
  const X0 = Math.min(...fluid.map((b) => b[0])), X1 = Math.max(...fluid.map((b) => b[1]));
  const Y0 = Math.min(...fluid.map((b) => b[2])), Y1 = Math.max(...fluid.map((b) => b[3]));
  const xs = brk(X0, X1, inp.cutsX, hmax), ys = brk(Y0, Y1, inp.cutsY, hmax), zs = brk(0, H, inp.cutsZ, Math.min(0.15, hmax));
  const NX = xs.length - 1, NY = ys.length - 1, NZ = zs.length - 1, N = NX * NY * NZ, NXY = NX * NY;
  const id = (i, j, k) => k * NXY + j * NX + i;
  // Boxes overlapping each plan column, so a sample tests a handful.
  const colBoxes = (list) => { const out = new Array(NXY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) out[j * NX + i] = list.filter((b) => b[0] < xs[i + 1] && b[1] > xs[i] && b[2] < ys[j + 1] && b[3] > ys[j]);
    return out; };
  const fc = colBoxes(fluid), sc = colBoxes(solid);
  const inB = (b, x, y, z) => x > b[0] && x < b[1] && y > b[2] && y < b[3] && z > b[4] && z < b[5];
  const isAir = (col, x, y, z) => fc[col].some((b) => inB(b, x, y, z)) && !sc[col].some((b) => inB(b, x, y, z));
  const S = 4, vol = new Float32Array(N);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const col = j * NX + i; if (!fc[col].length) continue;
    for (let k = 0; k < NZ; k++) { let n = 0;
      for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) for (let c = 0; c < S; c++)
        n += isAir(col, xs[i] + (a + 0.5) / S * (xs[i + 1] - xs[i]), ys[j] + (b + 0.5) / S * (ys[j + 1] - ys[j]), zs[k] + (c + 0.5) / S * (zs[k + 1] - zs[k]));
      vol[id(i, j, k)] = n / S ** 3; } }
  progress(0.3);
  // Faces: open fraction sampled on the shared face (both sides air just off it).
  const faces = [], e = 1e-7;
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = id(i, j, k); if (!vol[c]) continue;
    for (const ax of [0, 1, 2]) {
      const ii = i + (ax === 0), jj = j + (ax === 1), kk = k + (ax === 2);
      if (ii >= NX || jj >= NY || kk >= NZ) continue;
      const d = id(ii, jj, kk); if (!vol[d]) continue;
      const colA = j * NX + i, colB = jj * NX + ii; let n = 0;
      for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const u = (a + 0.5) / S, v = (b + 0.5) / S;
        const p = ax === 0 ? [xs[i + 1], ys[j] + u * (ys[j + 1] - ys[j]), zs[k] + v * (zs[k + 1] - zs[k])]
          : ax === 1 ? [xs[i] + u * (xs[i + 1] - xs[i]), ys[j + 1], zs[k] + v * (zs[k + 1] - zs[k])]
            : [xs[i] + u * (xs[i + 1] - xs[i]), ys[j] + v * (ys[j + 1] - ys[j]), zs[k + 1]];
        const o = [0, 0, 0]; o[ax] = e;
        n += isAir(colA, p[0] - o[0], p[1] - o[1], p[2] - o[2]) && isAir(colB, p[0] + o[0], p[1] + o[1], p[2] + o[2]); }
      if (!n) continue;
      const A = ax === 0 ? (ys[j + 1] - ys[j]) * (zs[k + 1] - zs[k]) : ax === 1 ? (xs[i + 1] - xs[i]) * (zs[k + 1] - zs[k]) : (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      const L = ax === 0 ? (xs[ii + 1] - xs[i]) / 2 : ax === 1 ? (ys[jj + 1] - ys[j]) / 2 : (zs[kk + 1] - zs[k]) / 2;
      faces.push(c, d, n / (S * S) * A / L);
    }
  }
  const nbStart = new Int32Array(N + 1), cnt = new Int32Array(N);
  for (let f = 0; f < faces.length; f += 3) { cnt[faces[f]]++; cnt[faces[f + 1]]++; }
  for (let c = 0; c < N; c++) nbStart[c + 1] = nbStart[c] + cnt[c];
  const NB = new Int32Array(nbStart[N]), G = new Float64Array(nbStart[N]), fill = nbStart.slice(0, N);
  for (let f = 0; f < faces.length; f += 3) { const a = faces[f], b = faces[f + 1], g = faces[f + 2];
    NB[fill[a]] = b; G[fill[a]++] = g; NB[fill[b]] = a; G[fill[b]++] = g; }
  progress(0.45);
  // Sources into cells (nearest air cell for a point; spread over a box's air cells).
  const cv = (c) => (xs[c % NX + 1] - xs[c % NX]) * (ys[Math.floor(c / NX) % NY + 1] - ys[Math.floor(c / NX) % NY]) * (zs[Math.floor(c / NXY) + 1] - zs[Math.floor(c / NXY)]);
  const ctr = (c) => [(xs[c % NX] + xs[c % NX + 1]) / 2, (ys[Math.floor(c / NX) % NY] + ys[Math.floor(c / NX) % NY + 1]) / 2, (zs[Math.floor(c / NXY)] + zs[Math.floor(c / NXY) + 1]) / 2];
  const usable = (c) => vol[c] >= 0.2 && nbStart[c + 1] > nbStart[c];
  const src = new Float64Array(N), stairs = [];   // stairs: { link, cells: [[c, q]] }
  for (const s of sources) {
    if (s.box) {
      const cells = []; let w = 0;
      for (let c = 0; c < N; c++) { if (!usable(c)) continue; const [x, y, z] = ctr(c);
        if (x > s.box.x0 && x < s.box.x1 && y > s.box.y0 && y < s.box.y1 && z > s.z0 && z < s.z1) { const a = cv(c) * vol[c]; cells.push([c, a]); w += a; } }
      const list = cells.map(([c, a]) => [c, s.q * a / w]);
      for (const [c, q] of list) src[c] += q;
      if (s.link != null) stairs.push({ link: s.link, cells: list });
      continue;
    }
    let best = -1, bd = Infinity;
    for (let c = 0; c < N; c++) { if (!usable(c)) continue; const [x, y, z] = ctr(c);
      const d = (x - s.x) ** 2 + (y - s.y) ** 2 + (z - s.z) ** 2; if (d < bd) { bd = d; best = c; } }
    if (best >= 0) src[best] += s.q;
  }
  // Components: solve only those with both an inflow and an outflow; pin one outflow cell each.
  const comp = new Int32Array(N).fill(-1), live = new Uint8Array(N), pins = new Uint8Array(N);
  for (let c0 = 0, nc = 0; c0 < N; c0++) {
    if (!vol[c0] || comp[c0] >= 0) continue;
    const cells = [c0]; comp[c0] = nc;
    for (let q = 0; q < cells.length; q++) { const c = cells[q]; for (let t = nbStart[c]; t < nbStart[c + 1]; t++) { const d = NB[t]; if (comp[d] < 0) { comp[d] = nc; cells.push(d); } } }
    let pos = 0, neg = 0, pin = -1; for (const c of cells) { if (src[c] > 0) pos += src[c]; if (src[c] < neg) { neg = src[c]; pin = c; } }
    if (pos > 0 && pin >= 0) { for (const c of cells) live[c] = 1; pins[pin] = 1; }
    nc++;
  }
  const cells = []; for (let c = 0; c < N; c++) if (live[c]) cells.push(c);
  // Pressure: Σ g (p_c − p_d) = src, pins at 0 (CG, Jacobi).
  const p = new Float64Array(N);
  { const diag = new Float64Array(N); for (const c of cells) for (let t = nbStart[c]; t < nbStart[c + 1]; t++) diag[c] += G[t];
    const Av = (x, y) => { for (const c of cells) { if (pins[c]) { y[c] = x[c]; continue; } let s = diag[c] * x[c]; for (let t = nbStart[c]; t < nbStart[c + 1]; t++) { const d = NB[t]; if (!pins[d]) s -= G[t] * x[d]; } y[c] = s; } };
    const b = new Float64Array(N); for (const c of cells) b[c] = pins[c] ? 0 : src[c];
    const M = (c) => (pins[c] ? 1 : diag[c]);
    const r = Float64Array.from(b), z = new Float64Array(N), d = new Float64Array(N), Ad = new Float64Array(N);
    for (const c of cells) { z[c] = r[c] / M(c); d[c] = z[c]; }
    let rz = 0; for (const c of cells) rz += r[c] * z[c];
    const bn = Math.sqrt(cells.reduce((s, c) => s + b[c] * b[c], 0)) || 1;
    for (let it = 0; it < 20000; it++) {
      Av(d, Ad); let dAd = 0; for (const c of cells) dAd += d[c] * Ad[c]; const al = rz / dAd;
      let rr = 0; for (const c of cells) { p[c] += al * d[c]; r[c] -= al * Ad[c]; rr += r[c] * r[c]; }
      if (Math.sqrt(rr) < 1e-10 * bn) break;
      let rz2 = 0; for (const c of cells) { z[c] = r[c] / M(c); rz2 += r[c] * z[c]; } const be = rz2 / rz; rz = rz2; for (const c of cells) d[c] = z[c] + be * d[c];
      if (it % 50 === 0) progress(0.45 + 0.55 * Math.min(1, it / 1500));
    } }
  return { floorId: inp.floorId, xs, ys, zs, NX, NY, NZ, N, vol, nbStart, NB, G, src, live, pins, cells, p, cv, stairs };
}

/** Solve the whole house. Returns each floor's grid, air fraction and age (minutes since the air came in
 *  from outside; NaN = no air moves there), and the house's fully-mixed age `nominal` (minutes). */
export function solveHouse3d(input, progress = () => {}) {
  const { D } = input, F = input.floors.length;
  const fields = input.floors.map((inp, f) => floorField(inp, (x) => progress('floor', (f + x) / F * 0.6)));
  // One age system over every floor: global index = floor offset + local cell.
  const off = []; let NT = 0; for (const fl of fields) { off.push(NT); NT += fl.N; }
  const rows = [];                      // per live global cell: [g, diag, cols Int32Array, vals Float64Array]
  const rowOf = new Int32Array(NT).fill(-1), b = new Float64Array(NT);
  // Stair coupling: an inflow cell receives q · (flux-weighted age of the other floor's outflow cells).
  const ends = new Map();               // link → { inflow: [[g, q]], outflow: [[g, |q|]] }
  fields.forEach((fl, f) => { for (const s of fl.stairs) for (const [c, q] of s.cells) { if (!fl.live[c]) continue;
    const e = ends.get(s.link) ?? ends.set(s.link, { inflow: [], outflow: [] }).get(s.link);
    (q > 0 ? e.inflow : e.outflow).push([off[f] + c, Math.abs(q)]); } });
  const extra = new Map();              // g → [[g2, coef]]
  for (const { inflow, outflow } of ends.values()) {
    const W = outflow.reduce((a, [, q]) => a + q, 0);
    if (!(W > 0)) continue;
    for (const [g, q] of inflow) { const list = extra.get(g) ?? extra.set(g, []).get(g); for (const [g2, q2] of outflow) list.push([g2, -q * q2 / W]); }
  }
  fields.forEach((fl, f) => {
    const { nbStart, NB, G, src, live, pins, cells, p, cv, vol } = fl;
    for (const c of cells) { let a = 0, net = src[c]; const cols = [], vals = [];
      for (let t = nbStart[c]; t < nbStart[c + 1]; t++) { const d = NB[t]; if (!live[d]) continue; const Fl = G[t] * (p[c] - p[d]);
        if (Fl > 0) a += Fl; net -= Fl; a += D * G[t]; cols.push(off[f] + d); vals.push(-D * G[t] + (Fl < 0 ? Fl : 0)); }
      if (src[c] < 0) a -= src[c]; if (pins[c] && net > 0) a += net;
      const g = off[f] + c;
      for (const [g2, v] of extra.get(g) || []) { cols.push(g2); vals.push(v); }
      rowOf[g] = rows.length; rows.push([g, a, Int32Array.from(cols), Float64Array.from(vals)]);
      b[g] = vol[c] * cv(c); }
  });
  // A stair outflow cell on a floor no inlet feeds is not live: drop its coupling (its column is not solved).
  for (const row of rows) { const keep = [...row[2]].map((g2, n) => [g2, row[3][n]]).filter(([g2]) => rowOf[g2] >= 0); row[2] = Int32Array.from(keep.map((k) => k[0])); row[3] = Float64Array.from(keep.map((k) => k[1])); }
  progress('age', 0.6);
  const tau = new Float64Array(NT);
  { const Av = (x, y) => { for (const [g, a, cols, vals] of rows) { let s = a * x[g]; for (let n = 0; n < cols.length; n++) s += vals[n] * x[cols[n]]; y[g] = s; } };
    const ad = new Float64Array(NT); for (const [g, a] of rows) ad[g] = a;
    const R = rows.map((r) => r[0]);
    const r = Float64Array.from(b), rh = Float64Array.from(b), pv = new Float64Array(NT), v = new Float64Array(NT), s = new Float64Array(NT), t = new Float64Array(NT), y = new Float64Array(NT), zz = new Float64Array(NT);
    let rho = 1, al = 1, w = 1; const bn = Math.sqrt(R.reduce((q, g) => q + b[g] * b[g], 0)) || 1;
    for (let it = 0; it < 20000; it++) {
      let rho2 = 0; for (const g of R) rho2 += rh[g] * r[g]; const be = (rho2 / rho) * (al / w); rho = rho2;
      for (const g of R) { pv[g] = r[g] + be * (pv[g] - w * v[g]); y[g] = pv[g] / ad[g]; }
      Av(y, v); let rv = 0; for (const g of R) rv += rh[g] * v[g]; al = rho / rv;
      for (const g of R) { s[g] = r[g] - al * v[g]; zz[g] = s[g] / ad[g]; }
      Av(zz, t); let ts = 0, tt = 0; for (const g of R) { ts += t[g] * s[g]; tt += t[g] * t[g]; } w = ts / tt;
      let rr = 0; for (const g of R) { tau[g] += al * y[g] + w * zz[g]; r[g] = s[g] - w * t[g]; rr += r[g] * r[g]; }
      if (Math.sqrt(rr) < 1e-8 * bn) break;
      if (it % 20 === 0) progress('age', 0.6 + 0.38 * Math.min(1, it / 500));
    } }
  let V = 0, Qout = 0, live = 0;
  const floors = fields.map((fl, f) => {
    const age = new Float32Array(fl.N).fill(NaN);
    for (const c of fl.cells) { age[c] = tau[off[f] + c] / 60; V += fl.vol[c] * fl.cv(c); live++; }
    for (const c of fl.cells) if (fl.src[c] < 0 && !fl.stairs.some((s) => s.cells.some(([cc]) => cc === c))) Qout -= fl.src[c];
    return { floorId: fl.floorId, xs: Float64Array.from(fl.xs), ys: Float64Array.from(fl.ys), zs: Float64Array.from(fl.zs), NX: fl.NX, NY: fl.NY, NZ: fl.NZ, vol: fl.vol, age, cells: fl.cells.length };
  });
  progress('done', 1);
  return { floors, nominal: Qout > 0 ? V / Qout / 60 : NaN, volume: V, cells: live };
}
