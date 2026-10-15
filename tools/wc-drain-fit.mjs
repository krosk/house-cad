#!/usr/bin/env node
// Upper-floor WC drain with real fittings (owner, 2026-10-15: "a simulation of pipe layout fittings before the
// contractor does the work"). It places the parts of layout T1 to scale, checks them against what is known, and
// reports the bay-1 depth the drain needs. docs/plumbing-workflow.md "Fitting study, upper WC drain" has the reasoning
// and the rejected layouts.
//
//   node tools/wc-drain-fit.mjs [layout=T1|S] [screed=0.05] [slabBottom=-0.25] [slope=0.01] [clipBack=0.015]
//                               [teeY=…] [teeEast=0.052|0.077] [stackX=-4.42] [svg=out.svg]
//
// Layout S (owner's alternative, 2026-10-15): the bay-1 run slanted in plan, a bend up under the tee, the tee's branch
// down, its run level: west to a bend up the vent, east to the WC bend. teeY moves the tee's run north of Geberit's
// leg (the WC bend turned a few degrees in plan); teeEast picks which run end (Z 52 or 77) faces the WC.
//
// Taken as true (owner): lintels (trench x -4.70..-4.56, lintel 1 -4.56..-4.50, bay 1 -4.50..-4.21, lintel 2
// -4.21..-4.15; nothing under a lintel), the frame (WC axis x -4.10, 60 cm from the west wall; face y 0.33, 20 cm from
// the north wall face at 0.53), Geberit's bend kept, the vent in boxing r220 (x -4.70..-4.33), the stack down column
// r122 (x -4.705..-4.20, y -0.43..-0.23). Plan metres, z from the finished floor.
//
// Sources (Proven):
//  - Nicoll PVC Ø100, NF EN 1329 (nicoll.fr): FT_coudes_evac_FF.pdf CT88 87°30' F/F Z 77 L 57; FT_coudes_evac_MF.pdf
//    CT8 87°30' M/F Z 77 L 57, spigot 134 from the corner; FT_culottes_simples_FF_evac.pdf BT188 tee 87°30' F/F
//    Z1 77 Z2 77 (branch) Z3 52 L 57. Pipe OD 100.
//  - Geberit Duofix 111.333.00.6: side CAD 111.333.00.6_L.dxf (cdn.data.geberit.com/cad/): the supplied PVC bend
//    90/100 is curved down to 157 mm above the finished floor and straight below (a Ø100 leg, to be cut); its leg axis
//    is 92 mm behind the frame face. Manual 972.363.00.0 p.11: the bend's clip has a second position 15 mm toward the
//    wall (depths 10-13 / 11.5-14.5 cm to the finished wall). Frame steel from src/ui/proceduralFurniture.js
//    geberitDuofix (measured on the same CAD).
// Hypotheses (parameters): screed 5 cm, slab bottom -0.25 (storey 2.95 - room 2.70), socket outer Ø 112, slope 1 %;
// 87°30' treated as 90° for lengths (a few mm).

import fs from 'node:fs';

const P = { layout: 'T1', teeY: NaN, stackX: -4.42, teeEast: 0.052, screed: 0.05, slabBottom: -0.25, slope: 0.01, clipBack: 0.015, svg: '' };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('=');
  if (!(k in P)) throw new Error(`unknown parameter ${k}`);
  P[k] = k === 'svg' || k === 'layout' ? v : Number(v);
}
const S_TOP = -P.screed;               // raw slab top
const R = 0.056, r = 0.05;             // socket / pipe outer radius
const NICOLL = { bendZ: 0.077, socket: 0.057, mfSpigot: 0.134, teeZ1: 0.077, teeZ2: 0.077, teeZ3: 0.052 };
const GEB_STRAIGHT = 0.157;
const CX = -4.10, FACE = 0.33, WALL = 0.53, HALF_WALL_FACE = 0.28;
const LEG_Y = FACE + 0.092 + P.clipBack;
const LINTELS = [[-4.56, -4.50], [-4.21, -4.15]];
const BAY1 = [-4.50, -4.21];
const TEE = { x: -4.42, y: 0.445 }, STACK = { x: P.stackX, y: -0.30 };   // stackX: where the stack drops into r122 (bay 1 only)
const VENT_BOX = [-4.70, -4.33];        // boxing r220 (x), where the vent rises
// VMC Ø80 p39 as drawn on the plan (pn72 (-4.53, 0.48, 2.246) -> pn46 (-4.615, 0.48, -0.07)); movable, so reported apart.
const VMC = { p: [-4.53, 0.48, 2.246], q: [-4.615, 0.48, -0.07], r: 0.04 };

// Frame steel boxes [x0, x1, y0, y1, z0, z1]; the feet stand on the raw slab.
const FRAME = {};
const fb = (a, b, d0, d1, z0, z1) => [CX + a, CX + b, FACE + d0, FACE + d1, z0, z1];
for (const [s, n] of [[-1, 'W'], [1, 'E']]) {
  const lo = (u, v) => [Math.min(s * u, s * v), Math.max(s * u, s * v)];
  FRAME[`post ${n}`] = fb(...lo(0.212, 0.25), 0, 0.04, 0.057, 1.12);
  FRAME[`leg ${n}`] = fb(...lo(0.212, 0.246), 0.006, 0.034, S_TOP, 0.057);
  FRAME[`foot ${n}`] = fb(...lo(0.15, 0.25), 0, 0.06, S_TOP - 0.008, S_TOP);
  FRAME[`bracket arm ${n}`] = fb(...lo(0.214, 0.25), 0.04, 0.176, 1.075, 1.105);
  FRAME[`bracket plate ${n}`] = fb(...lo(0.214, 0.295), 0.176, 0.182, 1.06, 1.12);
}
FRAME['lower bar'] = fb(-0.212, 0.212, 0, 0.04, 0.127, 0.169);
FRAME['WC bar'] = fb(-0.212, 0.212, 0, 0.04, 0.315, 0.393);
FRAME['top rail'] = fb(-0.212, 0.212, 0, 0.04, 1.09, 1.12);
FRAME.cistern = fb(-0.207, 0.21, 0.04, 0.116, 0.642, 1.08);

// T1: WC CT88 turning west -> pipe -> BT188 tee (vent up its short end, water down) -> CT8 M/F spigot home in the
// tee, turning south in bay 1 -> pipe at the slope -> CT88 down into the column.
function layoutT1() {
  const { bendZ, socket, mfSpigot, teeZ1, teeZ2, teeZ3 } = NICOLL;
  const reach = bendZ + socket;                          // corner to socket mouth (134)
  const zC = GEB_STRAIGHT - reach;                       // the WC bend's top socket ends where Geberit's leg is straight
  const branch = Math.hypot(TEE.x - CX, TEE.y - LEG_Y);
  const zT = zC - P.slope * branch;
  const u = [(TEE.x - CX) / branch, (TEE.y - LEG_Y) / branch];
  const zB = zT - teeZ1 - mfSpigot;
  const run = Math.hypot(STACK.x - TEE.x, STACK.y - TEE.y);
  const v = [(STACK.x - TEE.x) / run, (STACK.y - TEE.y) / run];
  const zS = zB - P.slope * run;
  const at = (x, y, z) => [x, y, z];
  const parts = [
    ['Geberit leg, straight', 'geb', at(CX, LEG_Y, zC + bendZ), at(CX, LEG_Y, GEB_STRAIGHT), r],
    ['CT88 WC bend, top socket', 'fit', at(CX, LEG_Y, zC), at(CX, LEG_Y, zC + reach), R],
    ['CT88 WC bend, west socket', 'fit', at(CX, LEG_Y, zC), at(CX + u[0] * reach, LEG_Y + u[1] * reach, zC - P.slope * reach), R],
    ['WC branch pipe', 'pipe', at(CX + u[0] * bendZ, LEG_Y + u[1] * bendZ, zC - P.slope * bendZ), at(TEE.x - u[0] * teeZ2, TEE.y - u[1] * teeZ2, zT + P.slope * teeZ2), r],
    ['BT188 tee, branch', 'fit', at(TEE.x, TEE.y, zT), at(TEE.x - u[0] * (teeZ2 + socket), TEE.y - u[1] * (teeZ2 + socket), zT), R],
    ['BT188 tee, up (vent)', 'fit', at(TEE.x, TEE.y, zT), at(TEE.x, TEE.y, zT + teeZ3 + socket), R],
    ['BT188 tee, down', 'fit', at(TEE.x, TEE.y, zT), at(TEE.x, TEE.y, zT - teeZ1 - socket), R],
    ['CT8 bay bend, spigot', 'fit', at(TEE.x, TEE.y, zB), at(TEE.x, TEE.y, zB + mfSpigot), R],
    ['CT8 bay bend, south socket', 'fit', at(TEE.x, TEE.y, zB), at(TEE.x + v[0] * reach, TEE.y + v[1] * reach, zB - P.slope * reach), R],
    ['bay-1 run pipe', 'pipe', at(TEE.x + v[0] * bendZ, TEE.y + v[1] * bendZ, zB - P.slope * bendZ), at(STACK.x - v[0] * bendZ, STACK.y - v[1] * bendZ, zS + P.slope * bendZ), r],
    ['CT88 stack bend, north socket', 'fit', at(STACK.x, STACK.y, zS), at(STACK.x - v[0] * reach, STACK.y - v[1] * reach, zS + P.slope * reach), R],
    ['CT88 stack bend, down socket', 'col', at(STACK.x, STACK.y, zS), at(STACK.x, STACK.y, zS - reach), R],
    ['vent riser', 'pipe', at(TEE.x, TEE.y, zT + teeZ3), at(TEE.x, TEE.y, 1.49), r],
  ];
  return { geom: { zC, zT, zB, zS, branch, run, tee: TEE, vent: TEE }, parts, labels: [
    [TEE.x, 0.30, 'vent ↑ r220'], [TEE.x, zT + 0.02, 'BT188 tee'], [CX, 0.07, 'CT88'],
    [TEE.x, zB - 0.01, `CT8 M/F, axis ${zB.toFixed(3)}, turning south`]] };
}

// S: WC CT8 M/F (socket on Geberit's leg) turning toward the tee, its spigot home in the BT188 tee's east run end;
// tee branch down; the tee's west run end takes a second CT8 M/F spigot turning up the vent; under the tee a CT8 M/F
// spigot up into the branch, turning in bay 1 toward the column (slanted in plan) -> pipe at the slope -> CT88 down.
function layoutS() {
  const { bendZ, socket, mfSpigot, teeZ1, teeZ2, teeZ3 } = NICOLL;
  const reach = bendZ + socket;
  const zC = GEB_STRAIGHT - reach;
  const zEast = P.teeEast, zWest = zEast === teeZ3 ? teeZ1 : teeZ3;
  const teeY = Number.isNaN(P.teeY) ? LEG_Y : P.teeY;
  const d1 = mfSpigot + zEast;                         // WC bend corner to the tee centre
  const dy = teeY - LEG_Y, dx = -Math.sqrt(d1 * d1 - dy * dy);
  const u = [dx / d1, dy / d1];                        // unit, WC -> tee -> vent
  const tee = { x: CX + dx, y: teeY };
  const zT = zC - P.slope * d1;
  const d2 = zWest + mfSpigot;
  const vent = { x: tee.x + u[0] * d2, y: tee.y + u[1] * d2 };
  const zV = zT + P.slope * d2;                        // the vent leg rises from the tee
  const zB = zT - teeZ2 - mfSpigot;
  const run = Math.hypot(STACK.x - tee.x, STACK.y - tee.y);
  const v = [(STACK.x - tee.x) / run, (STACK.y - tee.y) / run];
  const zS = zB - P.slope * run;
  const along = (o, w, d, z) => [o.x + w[0] * d, o.y + w[1] * d, z];
  const parts = [
    ['Geberit leg, straight', 'geb', [CX, LEG_Y, zC + bendZ], [CX, LEG_Y, GEB_STRAIGHT], r],
    ['CT8 WC bend, top socket', 'fit', [CX, LEG_Y, zC], [CX, LEG_Y, zC + reach], R],
    ['CT8 WC bend, spigot', 'fit', [CX, LEG_Y, zC], along({ x: CX, y: LEG_Y }, u, mfSpigot, zC - P.slope * mfSpigot), r],
    ['BT188 tee, east run end', 'fit', [tee.x, tee.y, zT], along(tee, u, -(zEast + socket), zT), R],
    ['BT188 tee, west run end', 'fit', [tee.x, tee.y, zT], along(tee, u, zWest + socket, zT), R],
    ['BT188 tee, branch down', 'fit', [tee.x, tee.y, zT], [tee.x, tee.y, zT - teeZ2 - socket], R],
    ['CT8 vent bend, spigot', 'fit', [vent.x, vent.y, zV], along(vent, u, -mfSpigot, zV), r],
    ['CT8 vent bend, socket up', 'fit', [vent.x, vent.y, zV], [vent.x, vent.y, zV + reach], R],
    ['vent riser', 'pipe', [vent.x, vent.y, zV + bendZ], [vent.x, vent.y, 1.49], r],
    ['CT8 trunk bend, spigot up', 'fit', [tee.x, tee.y, zB], [tee.x, tee.y, zB + mfSpigot], r],
    ['CT8 trunk bend, socket', 'fit', [tee.x, tee.y, zB], along(tee, v, reach, zB - P.slope * reach), R],
    ['bay-1 run pipe (slanted)', 'pipe', along(tee, v, bendZ, zB - P.slope * bendZ), along(STACK, v, -bendZ, zS + P.slope * bendZ), r],
    ['CT88 stack bend, north socket', 'fit', [STACK.x, STACK.y, zS], along(STACK, v, -reach, zS + P.slope * reach), R],
    ['CT88 stack bend, down socket', 'col', [STACK.x, STACK.y, zS], [STACK.x, STACK.y, zS - reach], R],
  ];
  return { geom: { zC, zT, zB, zS, branch: d1, run, tee, vent }, parts, labels: [
    [vent.x, 0.30, 'vent ↑ r220'], [tee.x, zT + 0.02, 'BT188 tee, branch down'], [CX, 0.07, 'CT8'],
    [tee.x, zB - 0.01, `CT8 M/F, axis ${zB.toFixed(3)}, slanted to the column`]] };
}

function segBoxDist(p, q, b, n = 80) {
  let best = Infinity;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, z = p[2] + (q[2] - p[2]) * t;
    const dx = Math.max(b[0] - x, 0, x - b[1]), dy = Math.max(b[2] - y, 0, y - b[3]), dz = Math.max(b[4] - z, 0, z - b[5]);
    best = Math.min(best, Math.hypot(dx, dy, dz));
  }
  return best;
}

function check(parts) {
  const clashes = [], tight = [], vmc = [];
  for (const [name, kind, p, q, rad] of parts) {
    if (kind === 'geb') continue;
    for (const [fn, b] of Object.entries(FRAME)) {
      const d = segBoxDist(p, q, b) - rad;
      if (d < 0) clashes.push(`${name} into the frame's ${fn} by ${(-d * 100).toFixed(1)} cm`);
      else if (d < 0.01) tight.push(`${name} ${(d * 100).toFixed(1)} cm from the frame's ${fn}`);
    }
    for (const [x0, x1] of LINTELS) {
      const d = segBoxDist(p, q, [x0, x1, -9, 9, P.slabBottom, S_TOP]) - rad;
      if (d < 0) clashes.push(`${name} into a lintel (${x0}..${x1}) by ${(-d * 100).toFixed(1)} cm`);
    }
    const yMax = Math.max(p[1], q[1]) + rad;
    if (yMax > WALL) clashes.push(`${name} into the north wall by ${((yMax - WALL) * 100).toFixed(1)} cm`);
    else if (yMax > WALL - 0.01) tight.push(`${name} ${((WALL - yMax) * 100).toFixed(1)} cm from the north wall`);
    for (const t of [0, 0.5, 1]) {
      const x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, z = p[2] + (q[2] - p[2]) * t;
      if (z + rad > 0 && y - rad < HALF_WALL_FACE && y > -0.23) clashes.push(`${name} shows in the room (above the floor, south of the half wall)`);
      if (kind !== 'col' && z - rad < S_TOP - 1e-3 && (x - rad < BAY1[0] || x + rad > BAY1[1])) clashes.push(`${name} in the slab outside bay 1`);
    }
  }
  for (const [name, kind, p, q, rad] of parts) {
    if (name === 'vent riser' && (p[0] - rad < VENT_BOX[0] || p[0] + rad > VENT_BOX[1])) clashes.push('vent riser outside boxing r220');
    if (kind === 'geb') continue;
    let best = Infinity;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = p.map((c, k) => c + (q[k] - c) * t);
      for (let j = 0; j <= 80; j++) {
        const w = j / 80, b = VMC.p.map((c, k) => c + (VMC.q[k] - c) * w);
        best = Math.min(best, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      }
    }
    const d = best - rad - VMC.r;
    if (d < 0) vmc.push(`${name} into the drawn VMC Ø80 p39 by ${(-d * 100).toFixed(1)} cm`);
  }
  const lowest = Math.min(...parts.filter(([, k]) => k === 'fit' || k === 'pipe').map(([, , p, q, rad]) => Math.min(p[2], q[2]) - rad));
  return { clashes: [...new Set(clashes)], tight: [...new Set(tight)], vmc, lowest };
}

const { geom, parts, labels } = P.layout === 'S' ? layoutS() : layoutT1();
const { clashes, tight, vmc, lowest } = check(parts);
const f = (v) => v.toFixed(4);
console.log('parameters', JSON.stringify(P));
console.log(`${P.layout}  WC bend corner (${CX}, ${f(LEG_Y)}, ${f(geom.zC)})  tee (${f(geom.tee.x)}, ${f(geom.tee.y)}, ${f(geom.zT)})  vent (${f(geom.vent.x)}, ${f(geom.vent.y)})  bay-1 bend ${f(geom.zB)}  stack bend (${STACK.x}, ${STACK.y}, ${f(geom.zS)})`);
console.log(`    lowest surface in the slab ${f(lowest)}: bay 1 must be ${((S_TOP - lowest) * 100).toFixed(1)} cm deep under the raw slab top; ` +
  (lowest >= P.slabBottom ? 'inside the slab' : `${((P.slabBottom - lowest) * 100).toFixed(1)} cm below the assumed slab bottom`));
console.log(clashes.length ? clashes.map((c) => '    CLASH ' + c).join('\n') : '    no clash with the frame, the lintels, the north wall or the room');
if (tight.length) console.log(tight.map((c) => '    tight ' + c).join('\n'));
if (vmc.length) console.log(vmc.map((c) => '    VMC ' + c).join('\n'));

if (P.svg) fs.writeFileSync(P.svg, drawSvg(geom, parts, lowest, labels)), console.log('drawing', P.svg);

// Face view (looking north, west left) and side view (looking west, the room left), to scale.
function drawSvg(g, parts, lowest, labels) {
  const S = 820, out = [];
  const T = (x, y, s, size = 12, col = '#000', bold = false, anchor = 'start') =>
    out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${col}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ''}>${s}</text>`);
  const za = -0.33, zb = 0.42;
  function view(ox, oy, ha, hb, H, title, sub) {
    const X = (h) => ox + (h - ha) * S, Z = (z) => oy + (zb - z) * S;
    T(ox, oy - 40, title, 17, '#000', true); T(ox, oy - 20, sub, 12, '#444');
    const rect = (h0, h1, z0, z1, style) => {
      const xa = Math.min(X(h0), X(h1)), xb = Math.max(X(h0), X(h1));
      out.push(`<rect x="${xa.toFixed(1)}" y="${Z(Math.max(z0, z1)).toFixed(1)}" width="${(xb - xa).toFixed(1)}" height="${(Math.abs(z1 - z0) * S).toFixed(1)}" ${style}/>`);
    };
    const seg = (p, q, w, col, op) => {
      let a = p, b = q;
      const hi = zb - 0.01, lo = za + 0.01;
      const clip = (a, b, lim, above) => { const t = (lim - a[2]) / (b[2] - a[2]); return a.map((c, k) => c + (b[k] - c) * t); };
      if (a[2] > hi && b[2] > hi) return;
      if (a[2] > hi) a = clip(b, a, hi); else if (b[2] > hi) b = clip(a, b, hi);
      if (a[2] < lo && b[2] < lo) return;
      if (a[2] < lo) a = clip(b, a, lo); else if (b[2] < lo) b = clip(a, b, lo);
      const x1 = X(H(a)), y1 = Z(a[2]), x2 = X(H(b)), y2 = Z(b[2]);
      out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-opacity="${op}" stroke-width="${(w * S).toFixed(1)}"/>`);
      out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#000" stroke-width="0.7" stroke-dasharray="3 3"/>`);
    };
    rect(ha, hb, za, P.slabBottom, 'fill="#fafafa"');
    rect(ha, hb, P.slabBottom, S_TOP, 'fill="#e0e0e0"');
    rect(ha, hb, S_TOP, 0, 'fill="#f3eee4"');
    return { X, Z, rect, seg };
  }
  const drawParts = (seg) => {
    for (const [, k, p, q, rad] of parts) if (k === 'fit' || k === 'col') seg(p, q, 2 * rad, '#78909c', 0.55);
    for (const [, k, p, q, rad] of parts) if (k === 'pipe' || k === 'geb') seg(p, q, 2 * rad, k === 'geb' ? '#424242' : '#8d6e63', 0.7);
  };
  const steel = 'fill="#a7adb3" fill-opacity="0.45" stroke="#666" stroke-width="0.6"';
  // face view
  const ha = -4.74, hb = -3.82;
  const fv = view(30, 80, ha, hb, (p) => p[0], 'FACE VIEW looking north', 'west left, east right · Nicoll Ø100 + Geberit, to scale');
  for (const [x0, x1] of LINTELS) fv.rect(x0, x1, P.slabBottom, S_TOP, 'fill="#9e9e9e" stroke="#424242"');
  fv.rect(ha, -4.70, za, zb, 'fill="#bbb"');
  for (const b of Object.values(FRAME)) if (b[4] < zb) fv.rect(b[0], b[1], b[4], Math.min(b[5], zb), steel);
  fv.rect(CX - 0.05, CX + 0.05, GEB_STRAIGHT, 0.30, 'fill="#424242" fill-opacity="0.45" stroke="#000"');
  drawParts(fv.seg);
  const [lv, lt, lw, lb] = labels;
  T(fv.X(lv[0]), fv.Z(lv[1]), lv[2], 11, '#4e342e', true, 'middle');
  T(fv.X(lt[0]) + 48, fv.Z(lt[1]) - 16, lt[2], 11, '#263238', true);
  T(fv.X(lw[0]) + 45, fv.Z(lw[1]), lw[2], 11, '#263238', true);
  T(fv.X(lb[0]) + 48, fv.Z(lb[1]) + 4, lb[2], 11, '#263238', true);
  T(fv.X(CX) + 45, fv.Z(0.24), `Geberit bend (clip +${(P.clipBack * 1000).toFixed(0)} mm)`, 10, '#222');
  // side view
  const ya = -0.50, yb = 0.58, ox2 = 30 + (hb - ha) * S + 120;
  const sv = view(ox2, 80, ya, yb, (p) => p[1], 'SIDE VIEW looking west', 'room left (south), north wall right · drop and run to column r122');
  sv.rect(WALL, yb, za, zb, 'fill="#bbb"');
  sv.rect(HALF_WALL_FACE, WALL, 0, zb, 'fill="#fff8e1" fill-opacity="0.6" stroke="#8d6e63"');
  sv.rect(-0.43, -0.23, za, P.slabBottom, 'fill="#bdbdbd" stroke="#616161"');
  T(sv.X(-0.33), sv.Z(-0.30) + 4, 'column r122', 10, '#000', false, 'middle');
  for (const [n, b] of Object.entries(FRAME)) if (b[4] < zb && (n.endsWith('W') || n.includes('bar'))) sv.rect(b[2], b[3], b[4], Math.min(b[5], zb), steel);
  sv.rect(-0.249, HALF_WALL_FACE, 0.08, zb - 0.005, 'fill="none" stroke="#6a1b9a" stroke-dasharray="5 3"');
  const gy = (xc) => FACE + P.clipBack - xc / 1000, gz = (zc) => (zc - 80) / 1000;
  const arc = [[25, 310], [-52, 310]];
  for (let a = 90; a <= 180; a += 5) arc.push([-52 + 42 * Math.cos(a * Math.PI / 180), 268 + 42 * Math.sin(a * Math.PI / 180)]);
  arc.push([-94.2, 237.4]);
  out.push(`<polyline points="${arc.map(([a, b]) => `${sv.X(gy(a)).toFixed(1)},${sv.Z(gz(b)).toFixed(1)}`).join(' ')}" fill="none" stroke="#424242" stroke-opacity="0.6" stroke-width="${(0.09 * S).toFixed(1)}"/>`);
  drawParts(sv.seg);
  out.push(`<line x1="${sv.X(ya)}" y1="${sv.Z(lowest)}" x2="${sv.X(yb)}" y2="${sv.Z(lowest)}" stroke="#b71c1c" stroke-width="1.5" stroke-dasharray="6 3"/>`);
  T(sv.X(0.05), sv.Z(lowest) + 15, `lowest fitting ${lowest.toFixed(3)}: bay 1 ${((S_TOP - lowest) * 100).toFixed(1)} cm deep under the raw slab top`, 11, '#b71c1c', true, 'middle');
  const W = ox2 + (yb - ya) * S + 60, H = 80 + (zb - za) * S + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" font-family="DejaVu Sans"><rect width="100%" height="100%" fill="#fff"/>${out.join('\n')}</svg>`;
}
