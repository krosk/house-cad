// One floor's air in 3D (owner, 2026-10-11: "Ok" to a per-floor 3D map driven by the network;
// docs/plumbing-workflow.md "Air paths computed"). The whole-house network (core/airflow.js) fixes
// every flow that crosses the floor's boundary: each inlet, each vent, each stairwell. Inside the
// floor the air is solved as potential flow on a non-uniform grid (≤ `hmax`, every room / opening edge
// on a grid line, so a 7 cm wall is its own cells), walls, half walls and furniture solid, a shut
// door its 1 cm undercut (a layer of its own), then the age of the air (seconds since it entered the
// floor through an inlet or the stairs) with a little turbulent mixing D. No heat (no plumes), no
// people: Hypothesis. Pure functions: floorAirInput runs on the page, solveFloor3d in a worker.
import { zoneKind } from './zoneColors.js';
import { ceilingHeight } from './storey.js';

const UNDERCUT = 0.01;
const box = (b, z0, z1) => [b.x0, b.x1, b.y0, b.y1, z0, z1];

/** Plain-data input for one floor: geometry boxes plus the boundary flows of a network result. */
export function floorAirInput(project, floor, result, { hmax = 0.2, D = 0.0005, doorsOpen = false } = {}) {
  const H = ceilingHeight(floor, 2.5);
  const fluid = [], solid = [], cutsX = [], cutsY = [], cutsZ = [UNDERCUT];
  for (const r of floor.rectangles) {
    const k = zoneKind(r), b = r.bounds;
    const sill = Number.isFinite(r.sill) ? r.sill : 0, head = Number.isFinite(r.head) ? r.head : 2.1;
    if ((k === 'room' && !r.outdoor) || k === 'stairs_up' || k === 'stairs_down') fluid.push(box(b, 0, H));
    else if (k === 'passage') { fluid.push(box(b, sill, Math.min(head, H))); cutsZ.push(sill, head); }
    else if (k === 'door' || k === 'sliding' || k === 'garage') { fluid.push(box(b, 0, doorsOpen ? Math.min(head, H) : UNDERCUT)); if (doorsOpen) cutsZ.push(head); }
    else if (k === 'wall' || k === 'insulation') solid.push(box(b, 0, H));
    else if (k === 'halfwall') solid.push(box(b, 0, Math.max(0, sill)));
    else if (k === 'heater') solid.push(box(b, Math.max(0, sill), Math.min(H, head)));
    else if (k === 'furniture') solid.push(box(b, r.foot ?? 0, r.top ?? 0));
    else continue;
    if (k !== 'furniture' && k !== 'heater') { cutsX.push(b.x0, b.x1); cutsY.push(b.y0, b.y1); }
  }
  // Boundary flows (m³/s): + in, − out. A point source sits in the nearest air cell.
  const sources = [];
  for (const i of result.inlets) if (i.floor === floor && i.q) {
    const d = i.half + 0.1;
    sources.push({ x: i.x + i.nx * d, y: i.y + i.ny * d, z: Math.min(H - 0.05, i.zLocal), q: i.q / 3600, kind: 'inlet' });
  }
  for (const v of result.vents) if (v.floor === floor && v.zone) sources.push({ x: v.x, y: v.y, z: Math.min(H - 0.05, Math.max(0.05, v.node.z ?? H - 0.1)), q: -v.q / 3600, kind: 'vent' });
  for (const l of result.links) if (l.kind === 'stairs' && (l.a.floor === floor || l.b.floor === floor) && Math.abs(l.q) > 1e-6) {
    const upper = l.b.floor === floor;           // a = lower storey; q > 0 rises
    const q = (upper ? l.q : -l.q) / 3600;       // into this floor
    // Air arrives from below through the floor, leaves upward under the ceiling (and the reverse).
    sources.push({ box: l.box, z0: upper ? 0 : H - 0.3, z1: upper ? 0.3 : H, q, kind: 'stairs' });
  }
  return { floorId: floor.id, H, fluid, solid, cutsX, cutsY, cutsZ, sources, hmax, D };
}

const brk = (lo, hi, cuts, h) => {
  const c = [...new Set([lo, hi, ...cuts.filter((v) => v > lo + 1e-4 && v < hi - 1e-4)].map((v) => Math.round(v * 1e4) / 1e4))].sort((a, b) => a - b), out = [c[0]];
  for (let n = 1; n < c.length; n++) { const L = c[n] - c[n - 1], m = Math.max(1, Math.ceil(L / h - 1e-9)); for (let s = 1; s <= m; s++) out.push(c[n - 1] + L * s / m); }
  return out;
};

/** Solve one floor. Returns the grid, each cell's air fraction and age (minutes; NaN = no air moves there). */
export function solveFloor3d(inp, progress = () => {}) {
  const { H, fluid, solid, sources, hmax, D } = inp;
  if (!fluid.length) return null;
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
  progress('grid', 0.15);
  // Faces: open fraction sampled on the shared face (both sides air just off it).
  const nbStart = new Int32Array(N + 1), nbList = [], gList = [], e = 1e-7;
  const faces = [];
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
  { const cnt = new Int32Array(N); for (let f = 0; f < faces.length; f += 3) { cnt[faces[f]]++; cnt[faces[f + 1]]++; }
    for (let c = 0; c < N; c++) nbStart[c + 1] = nbStart[c] + cnt[c];
    const fill = nbStart.slice(0, N); nbList.length = gList.length = nbStart[N];
    for (let f = 0; f < faces.length; f += 3) { const a = faces[f], b = faces[f + 1], g = faces[f + 2];
      nbList[fill[a]] = b; gList[fill[a]++] = g; nbList[fill[b]] = a; gList[fill[b]++] = g; } }
  const NB = Int32Array.from(nbList), G = Float64Array.from(gList);
  progress('faces', 0.3);
  // Sources into cells (nearest air cell for a point; spread over a box's air cells).
  const cv = (c) => (xs[c % NX + 1] - xs[c % NX]) * (ys[Math.floor(c / NX) % NY + 1] - ys[Math.floor(c / NX) % NY]) * (zs[Math.floor(c / NXY) + 1] - zs[Math.floor(c / NXY)]);
  const ctr = (c) => [(xs[c % NX] + xs[c % NX + 1]) / 2, (ys[Math.floor(c / NX) % NY] + ys[Math.floor(c / NX) % NY + 1]) / 2, (zs[Math.floor(c / NXY)] + zs[Math.floor(c / NXY) + 1]) / 2];
  const src = new Float64Array(N);
  for (const s of sources) {
    if (s.box) {
      const cells = []; let w = 0;
      for (let c = 0; c < N; c++) { if (vol[c] < 0.2 || nbStart[c + 1] === nbStart[c]) continue; const [x, y, z] = ctr(c);
        if (x > s.box.x0 && x < s.box.x1 && y > s.box.y0 && y < s.box.y1 && z > s.z0 && z < s.z1) { const a = cv(c) * vol[c]; cells.push([c, a]); w += a; } }
      for (const [c, a] of cells) src[c] += s.q * a / w;
      continue;
    }
    let best = -1, bd = Infinity;
    for (let c = 0; c < N; c++) { if (vol[c] < 0.2 || nbStart[c + 1] === nbStart[c]) continue; const [x, y, z] = ctr(c);
      const d = (x - s.x) ** 2 + (y - s.y) ** 2 + (z - s.z) ** 2; if (d < bd) { bd = d; best = c; } }
    if (best >= 0) src[best] += s.q;
  }
  // Components: solve only those with both an inflow and an outflow; pin one outflow cell each.
  const comp = new Int32Array(N).fill(-1), live = new Uint8Array(N), pins = new Set();
  for (let c0 = 0, nc = 0; c0 < N; c0++) {
    if (!vol[c0] || comp[c0] >= 0) continue;
    const cells = [c0]; comp[c0] = nc;
    for (let q = 0; q < cells.length; q++) { const c = cells[q]; for (let t = nbStart[c]; t < nbStart[c + 1]; t++) { const d = NB[t]; if (comp[d] < 0) { comp[d] = nc; cells.push(d); } } }
    let pos = 0, neg = 0, pin = -1; for (const c of cells) { if (src[c] > 0) pos += src[c]; if (src[c] < neg) { neg = src[c]; pin = c; } }
    if (pos > 0 && pin >= 0) { for (const c of cells) live[c] = 1; pins.add(pin); }
    nc++;
  }
  const cells = []; for (let c = 0; c < N; c++) if (live[c]) cells.push(c);
  // Pressure: Σ g (p_c − p_d) = src, pins at 0 (CG, Jacobi).
  const p = new Float64Array(N);
  { const diag = new Float64Array(N); for (const c of cells) for (let t = nbStart[c]; t < nbStart[c + 1]; t++) diag[c] += G[t];
    const Av = (x, y) => { for (const c of cells) { if (pins.has(c)) { y[c] = x[c]; continue; } let s = diag[c] * x[c]; for (let t = nbStart[c]; t < nbStart[c + 1]; t++) { const d = NB[t]; if (!pins.has(d)) s -= G[t] * x[d]; } y[c] = s; } };
    const b = new Float64Array(N); for (const c of cells) b[c] = pins.has(c) ? 0 : src[c];
    const M = (c) => (pins.has(c) ? 1 : diag[c]);
    const r = Float64Array.from(b), z = new Float64Array(N), d = new Float64Array(N), Ad = new Float64Array(N);
    for (const c of cells) { z[c] = r[c] / M(c); d[c] = z[c]; }
    let rz = 0; for (const c of cells) rz += r[c] * z[c];
    const bn = Math.sqrt(cells.reduce((s, c) => s + b[c] * b[c], 0)) || 1;
    for (let it = 0; it < 20000; it++) {
      Av(d, Ad); let dAd = 0; for (const c of cells) dAd += d[c] * Ad[c]; const al = rz / dAd;
      let rr = 0; for (const c of cells) { p[c] += al * d[c]; r[c] -= al * Ad[c]; rr += r[c] * r[c]; }
      if (Math.sqrt(rr) < 1e-10 * bn) break;
      let rz2 = 0; for (const c of cells) { z[c] = r[c] / M(c); rz2 += r[c] * z[c]; } const be = rz2 / rz; rz = rz2; for (const c of cells) d[c] = z[c] + be * d[c];
      if (it % 50 === 0) progress('pressure', 0.3 + 0.3 * Math.min(1, it / 1500));
    } }
  progress('age', 0.6);
  // Age: a_c τ_c − Σ_in |F| τ_d + D Σ g (τ_c − τ_d) = V_c (BiCGSTAB, Jacobi). A pin cell lets out what
  // reaches it beyond its own outflow (the network's small mismatch), counted as outflow too.
  const tau = new Float64Array(N);
  { const ad = new Float64Array(N);
    for (const c of cells) { let a = 0, net = src[c];
      for (let t = nbStart[c]; t < nbStart[c + 1]; t++) { const d = NB[t]; if (!live[d]) continue; const F = G[t] * (p[c] - p[d]); if (F > 0) a += F; net -= F; a += D * G[t]; }
      if (src[c] < 0) a -= src[c]; if (pins.has(c) && net > 0) a += net;
      ad[c] = a; }
    const Av = (x, y) => { for (const c of cells) { let s = ad[c] * x[c];
      for (let t = nbStart[c]; t < nbStart[c + 1]; t++) { const d = NB[t]; if (!live[d]) continue; const F = G[t] * (p[c] - p[d]); let v = -D * G[t]; if (F < 0) v += F; s += v * x[d]; }
      y[c] = s; } };
    const b = new Float64Array(N); for (const c of cells) b[c] = vol[c] * cv(c);
    const r = Float64Array.from(b), rh = Float64Array.from(b), pv = new Float64Array(N), v = new Float64Array(N), s = new Float64Array(N), t = new Float64Array(N), y = new Float64Array(N), zz = new Float64Array(N);
    let rho = 1, al = 1, w = 1; const bn = Math.sqrt(cells.reduce((q, c) => q + b[c] * b[c], 0)) || 1;
    for (let it = 0; it < 20000; it++) {
      let rho2 = 0; for (const c of cells) rho2 += rh[c] * r[c]; const be = (rho2 / rho) * (al / w); rho = rho2;
      for (const c of cells) { pv[c] = r[c] + be * (pv[c] - w * v[c]); y[c] = pv[c] / ad[c]; }
      Av(y, v); let rv = 0; for (const c of cells) rv += rh[c] * v[c]; al = rho / rv;
      for (const c of cells) { s[c] = r[c] - al * v[c]; zz[c] = s[c] / ad[c]; }
      Av(zz, t); let ts = 0, tt = 0; for (const c of cells) { ts += t[c] * s[c]; tt += t[c] * t[c]; } w = ts / tt;
      let rr = 0; for (const c of cells) { tau[c] += al * y[c] + w * zz[c]; r[c] = s[c] - w * t[c]; rr += r[c] * r[c]; }
      if (Math.sqrt(rr) < 1e-8 * bn) break;
      if (it % 20 === 0) progress('age', 0.6 + 0.38 * Math.min(1, it / 400));
    } }
  const age = new Float32Array(N).fill(NaN);
  let V = 0, Qin = 0; for (const c of cells) { age[c] = tau[c] / 60; V += vol[c] * cv(c); if (src[c] > 0) Qin += src[c]; }
  progress('done', 1);
  return { floorId: inp.floorId, xs: Float64Array.from(xs), ys: Float64Array.from(ys), zs: Float64Array.from(zs), NX, NY, NZ, vol, age,
    nominal: Qin > 0 ? V / Qin / 60 : NaN, volume: V, cells: cells.length };
}
