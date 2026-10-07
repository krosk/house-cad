// Room heat loss at design conditions (docs/heat-loss.md): a simplified EN 12831.
// Pure derivation from the project, never stored. A "room" is a connected ROOM
// component (geometry2d.connectedRoomComponents), as for the room area.
//
//   loss = Σ A·U·ΔT·b (walls, openings, floor, ceiling) + 0.34·n·V·ΔT (air)
//   U    = 1 / (Rsi + Σ R + Rse)   layers in series add, whatever their order
//
// Exterior walls: a room edge with no other room or stair of the same floor within
// PROBE_M beyond it. Its layers: every WALL or INSULATION zone just inside the edge
// (an interior lining) or crossed by the outward probe (drawn outside the room; owner
// decisions 2026-10-01 and 2026-10-04). Their R add up (where two overlap, that depth
// counts once, at the larger R); where no WALL zone is drawn, a
// placeholder wall `wallDepth` thick stands in for the masonry. Below the earth level
// (one for the house) a wall loses to the ground instead, as a basement wall (ISO 13370). Floor and ceiling are split by overlap with the
// rooms of the floors below/above (floors are ordered bottom → top).

import polygonClipping from 'polygon-clipping';
import { computeFootprint, connectedRoomComponents, multiPolygonArea, roomRectsConnect } from './geometry2d.js';
import { zoneKind } from './zoneColors.js';
import { ceilingHeight } from './storey.js';

// Project settings (`project.heat`), each overridable. Defaults for the owner's house
// (docs/heat-loss.md, owner answers 2026-10-01):
export const HEAT_DEFAULTS = {
  tOut: -7,      // °C outdoor design temperature: Val-de-Marne (94), 43 m (no altitude correction)
  tMean: 12,     // °C annual mean outdoor (Paris area), for ground losses
  tRoom: 19,     // °C indoor design temperature
  ach: 0.5,      // air changes per hour: single-flow VMC
  wallDepth: 0.2, // m, the placeholder wall where no WALL zone is drawn
  wallLambda: 0.8, // W/mK for a wall with no R set: R = depth / λ (20 cm → 0.25, ≈ concrete block)
  lambda: 0.04,  // W/mK for an insulation zone with no R set: R = drawn depth / λ
  windowU: 1.4,  // W/m²K window / sliding door (recent double glazing)
  doorU: 2.0,    // W/m²K door / garage door
  slabR: 0.15,   // m²K/W bare floor slab structure (construction unknown → U ≈ 2 over a basement)
  ceilingR: 0.06, // m²K/W bare ceiling (plasterboard), before attic insulation
  groundU: 0.7,  // W/m²K equivalent U of an uninsulated slab on earth
  earth: 0,      // m, the earth level outside, from the ground floor's floor level (+ up)
  degreeDays: 2200, // K·day/year (base 18 °C) for the yearly estimate; Hypothesis: Paris area, recent winters
  radiatorDT: 50, // K, radiator mean water − room temperature (EN 442 rating: 50; a heat pump runs lower)
  revealPsi: 0.9, // W/mK around a window in a wall with exterior insulation not returned into the reveal (DPE table)
  heavyWallMin: 0.1, // m: a partition this thick or more is heavy masonry (owner, 2026-10-06: under 10 cm is plaster)
  // Whole-house balance (owner, 2026-10-07; houseBalance): off = every room on its own at tRoom.
  balance: false,
  plasterLambda: 0.4, // W/mK, a thin (< heavyWallMin) solid plaster partition; Hypothesis: dense plaster block
};
// "What if" (owner, 2026-10-05: "whether insulation is worth it"): the loss with a kind of
// insulation taken away, never stored. `without` = { wallIns, atticIns, windows }:
// every INSULATION zone ignored; every floor's added attic R 0; every window / sliding door
// at single glazing.
export const SINGLE_GLAZING_U = 5.8; // W/m²K, Hypothesis: old single glazing in a wooden frame
// `without.reveals`: the reveals insulated (exterior insulation returned into them).
export const RETURNED_REVEAL_PSI = 0.25; // W/mK, DPE table: ITE wall, returned, window at the inner face
const REVEAL_NEAR_M = 0.3; // exterior insulation this close to an opening, along the wall, counts
// Per floor (`floor.heat`): heated or not, an unheated floor's winter temperature, and
// insulation ADDED to its floor slab and above its ceiling (attic). The floor's (`floorR`) counts
// only where a floor lies below (owner, 2026-10-06: it goes on the basement's ceiling, so a
// part on earth or over air, like the kitchen, keeps its bare slab).
// `heavy`: this floor's own floor structure (the one under it) is heavy (concrete, brick), so
// its junctions with the walls count (DPE: light, e.g. wooden, floors are neglected); owner,
// 2026-10-06: the ground floor's is concrete over brick, the upper floor's wood. `heavyCeiling`:
// the same for its ceiling where nothing is above it but an attic or the roof.
export const FLOOR_HEAT_DEFAULTS = { heated: true, temp: 6, floorR: 0, ceilingR: 0, heavy: true, heavyCeiling: true };

export const PROBE_M = 0.6;      // how far beyond an edge a neighbour room or exterior layer counts
const STEP_M = 0.05;             // wall sampling step along each edge
// Thermal bridges (owner, 2026-10-06; docs/heat-loss.md "Thermal bridges"): linear ψ (W/mK) at
// each junction of an exterior wall, from the French DPE method's tables (3CL-DPE 2021, arrêté
// du 31 mars 2021 annexe 1; read from the open-source Open3CL engine, src/tv.js
// `pont_thermique`). Keyed by the wall's insulation where the junction is: 'none' | 'ITI'
// (a lining on the room side) | 'ITE' (outside the masonry) | 'ITI+ITE'; then, for a floor or
// a ceiling, by its own insulation: 'none' | 'ITI' (on the room side) | 'ITE' (the far side).
const PSI_LOW = { // lowest floor (on earth, over a basement or air) / wall
  none: { none: 0.39, ITI: 0.47, ITE: 0.8 }, ITI: { none: 0.31, ITI: 0.08, ITE: 0.71 },
  ITE: { none: 0.49, ITI: 0.48, ITE: 0.64 }, 'ITI+ITE': { none: 0.31, ITI: 0.08, ITE: 0.45 } };
const PSI_MID = { none: 0.86, ITI: 0.92, ITE: 0.13, 'ITI+ITE': 0.13 }; // heavy intermediate floor / wall
const PSI_TOP = { // heavy top floor (under an attic or a roof) / wall
  none: { none: 0.3, ITI: 0.83, ITE: 0.4 }, ITI: { none: 0.27, ITI: 0.07, ITE: 0.75 },
  ITE: { none: 0.55, ITI: 0.76, ITE: 0.58 }, 'ITI+ITE': { none: 0.27, ITI: 0.07, ITE: 0.58 } };
const PSI_PARTITION = { none: 0.73, ITI: 0.82, ITE: 0.13, 'ITI+ITE': 0.13 }; // heavy partition / wall
// Window or door / wall, the frame at the wall's inner face (the owner's house), 5 cm frame,
// insulation not returned; ITE uses the project's revealPsi (0.9), RETURNED_REVEAL_PSI if returned.
const PSI_OPENING = { none: 0.38, ITI: 0, 'ITI+ITE': 0 };
const JUNCTION_INSET_M = 0.1; // a floor's or ceiling's neighbour is looked for this far into the room
const RS_WALL = 0.13 + 0.04;
const RS_CEILING = 0.10 + 0.10;  // heat up, into an attic / heated room above
const RS_FLOOR = 0.17 + 0.17;    // heat down, into a basement
const RS_FLOOR_AIR = 0.17 + 0.04; // heat down, over outside air
const FG1 = 1.45;                // EN 12831 ground: annual temperature swing
const LAMBDA_GROUND = 2.0;       // W/mK, ISO 13370 default soil (clay or silt)
const RS_GROUND = 0.13 + 0.04;   // Rsi + Rse of a basement wall / floor in ISO 13370's d_w / d_t
// Openings cut out of an exterior wall; each may carry its own U (`uValue`, W/m²K, the
// label's Uw/Ud), else the project's window / door U.
export const OPENING_KINDS = new Set(['window', 'sliding', 'door', 'garage']);
export const isGlazedKind = (kind) => kind === 'window' || kind === 'sliding';
const SPACE_KINDS = new Set(['room', 'stairs_up', 'stairs_down']);
// An OUTDOOR room (a veranda; owner, 2026-10-05) is outside: no loss of its own, and a heated
// room's edge on it is exterior. `isSpace` is every heated-or-not indoor space.
const isSpace = (r) => SPACE_KINDS.has(zoneKind(r)) && !r.outdoor;
// Across a slab, a neighbour floor's walls and linings count with its space (a room
// edge sits over the partition below, not over outside air).
const SLAB_KINDS = new Set([...SPACE_KINDS, 'wall', 'insulation']);

// Stored settings keep only known keys of the right type (load and every edit).
const clean = (obj, defaults) => Object.fromEntries(Object.entries(obj && typeof obj === 'object' ? obj : {})
  .filter(([k, v]) => k in defaults && typeof v === typeof defaults[k] && (typeof v !== 'number' || Number.isFinite(v))));
export const cleanHeat = (obj) => clean(obj, HEAT_DEFAULTS);
export const cleanFloorHeat = (obj) => clean(obj, FLOOR_HEAT_DEFAULTS);

export const heatSettings = (project) => ({ ...HEAT_DEFAULTS, ...(project?.heat || {}) });
export const floorHeat = (floor) => ({ ...FLOOR_HEAT_DEFAULTS, ...(floor?.heat || {}) });

const EPS = 1e-6;
const area = (mp) => (mp.length ? multiPolygonArea(mp) : 0);
// A floor's heated-or-not space: its rooms plus stairs (circulation, open to the rooms).
const spacesOf = (floor) => (floor?.rectangles || []).filter((r) => SLAB_KINDS.has(zoneKind(r)) && !r.outdoor)
  .map((r) => ({ bounds: r.bounds, op: 'add', kind: 'room' }));
// Does rect r intersect the axis-aligned segment from (ax,ay) to (bx,by)?
function hitsSegment(b, ax, ay, bx, by) {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  return b.x0 < x1 + EPS && b.x1 > x0 - EPS && b.y0 < y1 + EPS && b.y1 > y0 - EPS
    && (x1 - x0 > EPS ? (y0 > b.y0 + EPS && y0 < b.y1 - EPS) : (x0 > b.x0 + EPS && x0 < b.x1 - EPS));
}
const contains = (b, x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
// Zones that are layers of an exterior wall, each with an R.
export const LAYER_KINDS = new Set(['wall', 'insulation']);
// A layer's λ when it has no R: the masonry's or the insulation's.
export const layerLambda = (kind, s) => (kind === 'wall' ? s.wallLambda : s.lambda);
// A layer's own λ: typed on the zone (`lambda`), else the project's for its kind.
export const zoneLambda = (rect, s) => (Number.isFinite(rect.lambda) && rect.lambda > 0
  ? rect.lambda : layerLambda(zoneKind(rect), s));
// A layer's R: authored `rValue`, else its depth across the wall / its λ.
function zoneR(rect, nx, s) {
  if (Number.isFinite(rect.rValue) && rect.rValue >= 0) return rect.rValue;
  const b = rect.bounds;
  return (nx ? b.x1 - b.x0 : b.y1 - b.y0) / zoneLambda(rect, s);
}

// The R of a wall's layers in series. Where layers overlap across the wall's depth, that
// stretch counts once, at the larger R (owner, 2026-10-04): each layer's R spreads evenly
// over its depth, and the overlap keeps the layer whose share there is the larger.
// `cuts`: [{ lo, hi (m across the wall), rz (its derated R), wall }].
export function layerStack(cuts) {
  let r = 0, insulated = false;
  const walled = cuts.some((c) => c.wall);
  const thin = cuts.filter((c) => c.hi - c.lo < EPS), deep = cuts.filter((c) => c.hi - c.lo >= EPS);
  for (const c of thin) { r += c.rz; if (!c.wall) insulated = true; }
  const ends = [...new Set(deep.flatMap((c) => [c.lo, c.hi]))].sort((a, b) => a - b);
  for (let i = 0; i < ends.length - 1; i++) {
    const lo = ends[i], hi = ends[i + 1], mid = (lo + hi) / 2;
    let best = null, bestR = -1;
    for (const c of deep) {
      if (mid <= c.lo || mid >= c.hi) continue;
      const per = c.rz / (c.hi - c.lo);
      if (per > bestR) { bestR = per; best = c; }
    }
    if (!best) continue;
    r += bestR * (hi - lo);
    if (!best.wall) insulated = true;
  }
  return { r, insulated, walled };
}

// The part of layer `c` outside the depth [lo, hi] a recess takes out, its R in
// proportion (a layer's R spreads evenly over its depth, as in layerStack).
function carve(c, lo, hi) {
  const span = c.hi - c.lo;
  if (span < EPS) return c.lo > lo && c.lo < hi ? [] : [c];
  const out = [];
  for (const [a, b] of [[c.lo, Math.min(c.hi, lo)], [Math.max(c.lo, hi), c.hi]]) {
    if (b - a > EPS) out.push({ ...c, lo: a, hi: b, rz: c.rz * (b - a) / span });
  }
  return out;
}

// ISO 13370 basement wall: the U of a wall buried z m deep (the floor's depth below the
// earth), from its own R and the floor's equivalent thickness d_t.
export function buriedWallU(z, wallR, dt) {
  const dw = LAMBDA_GROUND * (RS_GROUND + wallR);
  return (2 * LAMBDA_GROUND / (Math.PI * z)) * (1 + 0.5 * dt / (dt + z)) * Math.log(z / dw + 1);
}

// The wall's insulation class at a column: 'none' | 'ITI' | 'ITE' | 'ITI+ITE'. An insulation
// layer is interior when it is drawn inside the room (a lining) or, where masonry (a WALL
// zone) is drawn, on the room's side of it; exterior otherwise.
function insulationClass(cuts) {
  const walls = cuts.filter((c) => c.wall);
  const wallLo = walls.length ? Math.min(...walls.map((c) => c.lo)) : null;
  let iti = false, ite = false;
  for (const c of cuts) {
    if (c.wall) continue;
    if (c.inner || (wallLo != null && (c.lo + c.hi) / 2 < wallLo)) iti = true; else ite = true;
  }
  return iti && ite ? 'ITI+ITE' : iti ? 'ITI' : ite ? 'ITE' : 'none';
}

// The thermal bridges of one ring of a room's outline (docs/heat-loss.md "Thermal bridges"),
// from its 5 cm columns in order: [{ ext, x0, y0, x1, y1, nx, ny, cls, dn, up }] where `dn` /
// `up` = { type ('low' | 'mid' | 'top'), psi, share, cls2 } at the floor / the ceiling. Each
// junction: { type, at ('floor' | 'ceiling' | 'height'), cls, cls2, psi, share, length, w,
// x0, y0, x1, y1, nx, ny, z0, z1 }; w = ψ · length · share · ΔT (share ½ where the room on
// the other side counts the other half).
function ringJunctions(cols, s, H, dT, out, others, own) {
  const push = (j) => { j.w = j.psi * j.length * j.share * dT; out.junctions.push(j); out.bridge += j.w; };
  for (const [at, side] of [['floor', 'dn'], ['ceiling', 'up']]) {
    let run = null;
    // A run under 10 cm is a corner artefact of floors that don't line up (a column or two).
    const flush = () => { if (run && run.length >= 0.1 - EPS) push(run); run = null; };
    for (const c of cols) {
      const j = c.ext ? c[side] : null;
      if (!j || !(j.psi > 0)) { flush(); continue; }
      if (run && run.type === j.type && run.psi === j.psi && run.cls === c.cls && run.nx === c.nx && run.ny === c.ny
        && Math.abs(run.x1 - c.x0) < 1e-6 && Math.abs(run.y1 - c.y0) < 1e-6) {
        run.x1 = c.x1; run.y1 = c.y1; run.length += Math.hypot(c.x1 - c.x0, c.y1 - c.y0);
        continue;
      }
      flush();
      run = { ...j, at, cls: c.cls, length: Math.hypot(c.x1 - c.x0, c.y1 - c.y0), x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1,
        nx: c.nx, ny: c.ny, z0: at === 'floor' ? 0 : H, z1: at === 'floor' ? 0 : H };
    }
    flush();
  }
  // A partition meets the façade at a corner of the outline where an exterior edge turns
  // into one with a heated room across, and the façade carries on past the partition: going
  // on along it, within PROBE_M, lies another room whose own façade is there. The room on the
  // other side sees the same junction, so half each. (A turn with no room past it along the
  // façade, e.g. a wall facing nothing drawn, is not a partition.)
  // Its thickness is the gap between the two rooms along the façade: from `heavyWallMin` up it
  // is heavy masonry (a refend, counted); thinner it is light (owner's plaster ones, ψ 0), still
  // listed so the AR drawing shows what was decided.
  const found = [];
  for (let i = 0; i < cols.length; i++) {
    const a = cols[i], b = cols[(i + 1) % cols.length];
    if (a.ext === b.ext || (a.nx === b.nx && a.ny === b.ny)) continue; // a corner only
    const e = a.ext ? a : b, sgn = a.ext ? 1 : -1;
    const len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0), ex = sgn * (e.x1 - e.x0) / len, ey = sgn * (e.y1 - e.y0) / len;
    const px = a.x1, py = a.y1;
    let across = null; // the room past the partition
    for (let t = 0.05; t <= PROBE_M + EPS && !across; t += 0.05) {
      const qx = px + ex * t - e.nx * JUNCTION_INSET_M, qy = py + ey * t - e.ny * JUNCTION_INSET_M;
      const r = others.find((o) => contains(o, qx, qy));
      if (!r) continue;
      const fx = px + ex * t, fy = py + ey * t; // that room's façade: nothing beyond it
      if (![...others, ...own].some((o) => hitsSegment(o, fx + e.nx * 1e-4, fy + e.ny * 1e-4, fx + e.nx * PROBE_M, fy + e.ny * PROBE_M))) across = r;
    }
    if (!across || found.some(([x, y]) => Math.hypot(x - px, y - py) < 0.3)) continue;
    found.push([px, py]);
    const thick = Math.max(0, ex > 0.5 ? across.x0 - px : ex < -0.5 ? px - across.x1 : ey > 0.5 ? across.y0 - py : py - across.y1);
    const heavy = thick >= s.heavyWallMin - EPS;
    push({ type: 'partition', at: 'height', cls: e.cls, cls2: null, psi: heavy ? PSI_PARTITION[e.cls] : 0, share: 0.5,
      length: H, thick, heavy, x0: px, y0: py, x1: px, y1: py, nx: e.nx, ny: e.ny, z0: 0, z1: H });
  }
}

// What lies across a room's floor or ceiling at a wall column (mid-point mx, my, outward
// normal nx, ny), for its junction there. A neighbour floor's space is looked for at a few
// depths into the room and a little to each side along the wall: its walls rarely sit exactly
// over this floor's, and a slightly thicker wall above would otherwise read as the roof at the
// corners (owner's plan, 2026-10-06: 5–27 cm stretches).
const SLAB_DEPTHS_M = [JUNCTION_INSET_M, 0.3, 0.6], SLAB_ALONG_M = [0, -0.3, 0.3];
function slabJunctions(mx, my, nx, ny, s, fh, nb) {
  const over = (n) => SLAB_ALONG_M.some((a) => SLAB_DEPTHS_M.some((d) => n?.rects.some((b) =>
    contains(b, mx - nx * d - ny * a, my - ny * d + nx * a))));
  const inAbove = over(nb.above), inBelow = over(nb.below);
  return (cls) => {
    // The slab between two floors is the upper one's floor (its `heavy`).
    const upHeavy = inAbove ? nb.above.heavy : fh.heavyCeiling;
    const up = inAbove && nb.above.heated
      ? { type: 'mid', psi: upHeavy ? PSI_MID[cls] : 0, share: 0.5, cls2: null }
      : (() => { // under an attic, a roof or an unheated floor: insulation on its far side
        const r = inAbove ? nb.above.floorR : fh.ceilingR, cls2 = r > 0 ? 'ITE' : 'none';
        return { type: 'top', psi: upHeavy ? PSI_TOP[cls][cls2] : 0, share: 1, cls2 };
      })();
    const dn = inBelow && nb.below.heated
      ? { type: 'mid', psi: fh.heavy ? PSI_MID[cls] : 0, share: 0.5, cls2: null }
      : (() => { // floor insulation under the slab, only over the floor below (on the basement's ceiling)
        const cls2 = inBelow && fh.floorR > 0 ? 'ITE' : 'none';
        return { type: 'low', psi: fh.heavy ? PSI_LOW[cls][cls2] : 0, share: 1, cls2 };
      })();
    return { up, dn };
  };
}

function wallLoss(floor, comp, s, fh, dT, nb) {
  const out = { wall: 0, opening: 0, bridge: 0, wallArea: 0, openingArea: 0, insulated: 0, earthArea: 0, samples: [], junctions: [] };
  // Windows and doors (owner, 2026-10-05, then the DPE table 2026-10-06): an opening leaks
  // along its edge (sill, head, both jambs; a door's threshold belongs to the floor's
  // junction) by the wall's insulation around it, taken at the opening's columns or within
  // REVEAL_NEAR_M of them along the edge (insulation is often drawn stopping at the opening,
  // and the opening never needs to be drawn into it: an opening always goes through it).
  const revealITE = s.noReveals ? RETURNED_REVEAL_PSI : s.revealPsi;
  const openingPsi = (cls) => (cls === 'ITE' ? revealITE : PSI_OPENING[cls]);
  const revealDone = new Set(); // openings already counted (an opening spans one edge)
  const H = ceilingHeight(floor); // the room's walls, below the slab
  // Below the earth: the part of each wall under it loses to the ground at the annual
  // mean temperature (EN 12831's fg1 · fg2 · ΔT, as for a slab on earth).
  const z = s.earth - (floor.elevation || 0), buriedH = Math.min(H, Math.max(0, z));
  const dt = s.wallDepth + LAMBDA_GROUND * (0.17 + s.slabR + 0.04); // floorR: not on earth
  const groundDT = FG1 * (s.tRoom - s.tMean);
  const others = floor.rectangles.filter((r) => isSpace(r) && !comp.ids.has(r.id))
    .map((r) => r.bounds);
  const own = comp.rectangles.map((r) => r.bounds);
  const layers = floor.rectangles.filter((r) => LAYER_KINDS.has(zoneKind(r))
    && !(s.noWallIns && zoneKind(r) === 'insulation'));
  const openings = floor.rectangles.filter((r) => OPENING_KINDS.has(zoneKind(r)));
  const recesses = floor.rectangles.filter((r) => zoneKind(r) === 'recess');
  for (const polygon of computeFootprint(comp.rectangles)) {
    for (const ring of polygon) {
      const cols = []; // every 5 cm column of the ring, in order (ringJunctions)
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < EPS) continue;
        // The room lies on the LEFT of each directed boundary edge (polygon-clipping),
        // so the outward normal is the right-hand one.
        const nx = (by - ay) / len, ny = -(bx - ax) / len;
        const n = Math.max(1, Math.ceil(len / STEP_M)), ds = len / n;
        const colCls = new Array(n).fill(null), openCols = new Map(); // opening → { ks, h, sill }
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
          const px = mx + nx * PROBE_M, py = my + ny * PROBE_M;
          const sx = mx + nx * 1e-4, sy = my + ny * 1e-4;
          const col = { ext: false, x0: ax + (bx - ax) * (k / n), y0: ay + (by - ay) * (k / n),
            x1: ax + (bx - ax) * ((k + 1) / n), y1: ay + (by - ay) * ((k + 1) / n), nx, ny };
          cols.push(col);
          // Heated both sides: another room, or this room itself past a thin gap (a room that
          // wraps around a slot, e.g. a stairwell's balustrade; owner's plan, 2026-10-06).
          if (others.some((b) => hitsSegment(b, sx, sy, px, py)) || own.some((b) => hitsSegment(b, sx, sy, px, py))) continue;
          const cuts = [];
          for (const z of layers) {
            const b = z.bounds, wall = zoneKind(z) === 'wall';
            const inner = contains(b, mx - nx * 0.005, my - ny * 0.005);
            if (!inner && !hitsSegment(b, sx, sy, px, py)) continue;
            // No derating: the junctions are counted as thermal bridges (ringJunctions).
            const rz = zoneR(z, nx, s);
            // Its depth across the wall, outward from the edge.
            const e0 = nx ? (b.x0 - mx) * nx : (b.y0 - my) * ny, e1 = nx ? (b.x1 - mx) * nx : (b.y1 - my) * ny;
            cuts.push({ lo: Math.min(e0, e1), hi: Math.max(e0, e1), rz, wall, inner });
          }
          col.ext = true;
          col.cls = colCls[k] = insulationClass(cuts);
          Object.assign(col, slabJunctions(mx, my, nx, ny, s, fh, nb)(col.cls));
          let { r, insulated, walled } = layerStack(cuts);
          const placeholder = walled ? 0 : s.wallDepth / s.wallLambda; // the placeholder masonry
          r += placeholder;
          const u = 1 / (RS_WALL + r);
          // Recesses here (owner, 2026-10-05): between its sill and head a recess takes
          // its depth out of every layer it overlaps; the rest of the layers stay.
          const here = [];
          for (const q of recesses) {
            const b = q.bounds;
            if (!contains(b, mx - nx * 0.005, my - ny * 0.005) && !hitsSegment(b, sx, sy, px, py)) continue;
            const e0 = nx ? (b.x0 - mx) * nx : (b.y0 - my) * ny, e1 = nx ? (b.x1 - mx) * nx : (b.y1 - my) * ny;
            const z0 = Math.max(0, q.sill ?? 0), z1 = Math.min(H, q.head ?? H);
            if (z1 - z0 > EPS) here.push({ lo: Math.min(e0, e1), hi: Math.max(e0, e1), z0, z1 });
          }
          const rWith = new Map(); // R of the layers left under a set of recesses
          const rUnder = (active) => {
            if (!active.length) return r;
            const key = active.map((q) => here.indexOf(q)).join(',');
            if (!rWith.has(key)) {
              let left = cuts;
              for (const q of active) left = left.flatMap((c) => carve(c, q.lo, q.hi));
              rWith.set(key, layerStack(left).r + placeholder);
            }
            return rWith.get(key);
          };
          let openH = 0, openU = 0, openSill = 0, openO = null;
          for (const o of openings) {
            if (!hitsSegment(o.bounds, mx - nx * 0.3, my - ny * 0.3, px, py)) continue;
            const kind = zoneKind(o);
            const sill = Math.max(0, o.sill ?? 0), head = Math.min(H, o.head ?? H);
            if (head - sill > openH) {
              openH = head - sill; openSill = sill; openO = o;
              openU = s.noWindows && isGlazedKind(kind) ? SINGLE_GLAZING_U
                : Number.isFinite(o.uValue) && o.uValue > 0 ? o.uValue
                : isGlazedKind(kind) ? s.windowU : s.doorU;
            }
          }
          // Opening bookkeeping, resolved after the edge (see revealDone).
          if (openO) {
            const e = openCols.get(openO) ?? openCols.set(openO, { ks: [], h: 0, sill: Infinity }).get(openO);
            e.ks.push(k); e.h = Math.max(e.h, openH); e.sill = Math.min(e.sill, openSill);
          }
          // Split the column by height: the opening's band, each recess band, the buried
          // part below the earth, the rest in air. Each piece has its own U.
          const openTop = openSill + openH;
          const zs = [...new Set([0, H, buriedH, openSill, openTop, ...here.flatMap((q) => [q.z0, q.z1])]
            .filter((v) => v >= 0 && v <= H))].sort((p, q) => p - q);
          const band = {}; // kind → { area, w, u (last), r, sill, head }
          const add = (kind, a, uu, wm2, extra) => {
            const e = band[kind] ?? (band[kind] = { kind, area: 0, w: 0, ...extra });
            e.area += a; e.w += a * wm2; e.u = uu;
            e.sill = Math.min(e.sill ?? Infinity, extra.sill ?? Infinity); e.head = Math.max(e.head ?? -Infinity, extra.head ?? -Infinity);
          };
          let wallA = 0, openA = 0, earthA = 0, wAir = 0, wEarth = 0, wOpen = 0;
          for (let zi = 0; zi < zs.length - 1; zi++) {
            const lo = zs[zi], hi = zs[zi + 1], a = ds * (hi - lo), mid = (lo + hi) / 2;
            if (a <= 0) continue;
            if (openH > 0 && mid > openSill && mid < openTop) {
              openA += a; wOpen += a * openU * dT;
              add('opening', a, openU, openU * dT, { sill: openSill, head: openTop });
              continue;
            }
            wallA += a;
            const active = here.filter((q) => mid > q.z0 && mid < q.z1);
            const rr = rUnder(active), uu = active.length ? 1 / (RS_WALL + rr) : u;
            const rec = active.length ? { sill: Math.min(...active.map((q) => q.z0)), head: Math.max(...active.map((q) => q.z1)), r: rr } : { r: rr };
            if (mid < buriedH) {
              const ue = buriedWallU(z, rr, dt);
              earthA += a; wEarth += a * ue * groundDT;
              add('earth', a, ue, ue * groundDT, rec);
            } else {
              wAir += a * uu * dT;
              add(active.length ? 'recess' : 'wall', a, uu, uu * dT, rec);
            }
          }
          out.wallArea += wallA; out.openingArea += openA; out.earthArea += earthA;
          if (insulated) out.insulated += wallA;
          out.wall += wAir + wEarth;
          out.opening += wOpen;
          // The heat map (docs/heat-loss.md "Where the heat goes"): this 5 cm column of
          // wall, its bands (W/m² each) and the whole column's W/m².
          const bands = ['wall', 'recess', 'opening', 'earth'].filter((k) => band[k]?.area > EPS).map((k) => {
            const e = band[k];
            return { kind: k, area: e.area, u: e.u, wm2: e.w / e.area, r: e.r,
              ...(Number.isFinite(e.sill) ? { sill: e.sill, head: e.head } : {}) };
          });
          out.samples.push({
            x0: ax + (bx - ax) * (k / n), y0: ay + (by - ay) * (k / n),
            x1: ax + (bx - ax) * ((k + 1) / n), y1: ay + (by - ay) * ((k + 1) / n),
            nx, ny, r, insulated, walled, bands,
            w: wAir + wEarth + wOpen, wm2: H > 0 ? (wAir + wEarth + wOpen) / (ds * H) : 0,
          });
        }
        // Each opening on this edge, by the wall's insulation at or near it: sill (none for a
        // door at the floor) + head over its columns, plus its two jambs.
        const near = Math.ceil(REVEAL_NEAR_M / ds);
        for (const [o, { ks, h, sill }] of openCols) {
          if (revealDone.has(o.id)) continue;
          revealDone.add(o.id);
          const ka = Math.min(...ks), kb = Math.max(...ks);
          const around = colCls.slice(Math.max(0, ka - near), Math.min(n - 1, kb + near) + 1).filter(Boolean);
          const iti = around.some((c) => c.startsWith('ITI')), ite = around.some((c) => c.endsWith('ITE'));
          const cls = iti && ite ? 'ITI+ITE' : iti ? 'ITI' : ite ? 'ITE' : 'none', psi = openingPsi(cls);
          if (!(psi > 0)) continue;
          const width = ds * ks.length, length = (sill > EPS ? 2 : 1) * width + 2 * h, w = psi * length * dT;
          out.junctions.push({ type: 'opening', at: 'frame', cls, cls2: null, psi, share: 1, length, w,
            x0: ax + (bx - ax) * (ka / n), y0: ay + (by - ay) * (ka / n),
            x1: ax + (bx - ax) * ((kb + 1) / n), y1: ay + (by - ay) * ((kb + 1) / n), nx, ny, z0: sill, z1: sill + h });
          out.bridge += w;
        }
      }
      ringJunctions(cols, s, H, dT, out, others, own);
    }
  }
  return out;
}

// Split a room's footprint by what lies across its floor (below) or ceiling (above).
function splitByNeighbour(foot, neighbour) {
  if (!neighbour) return { heated: 0, unheated: 0, none: area(foot), temp: null };
  const nfoot = computeFootprint(spacesOf(neighbour));
  if (!nfoot.length) return { heated: 0, unheated: 0, none: area(foot), temp: null };
  const over = area(polygonClipping.intersection(foot, nfoot));
  const h = floorHeat(neighbour);
  return {
    heated: h.heated ? over : 0,
    unheated: h.heated ? 0 : over,
    none: Math.max(0, area(foot) - over),
    temp: h.heated ? null : h.temp,
  };
}

// The pieces of a room's footprint by what lies across its floor or ceiling, as
// polygons for the heat map: [{ poly (MultiPolygon), what: 'heated' | 'unheated' | 'none' }].
function neighbourPieces(foot, neighbour) {
  const nfoot = neighbour ? computeFootprint(spacesOf(neighbour)) : [];
  if (!nfoot.length) return [{ poly: foot, what: 'none' }];
  const over = polygonClipping.intersection(foot, nfoot), rest = polygonClipping.difference(foot, nfoot);
  const out = [];
  if (over.length) out.push({ poly: over, what: floorHeat(neighbour).heated ? 'heated' : 'unheated' });
  if (rest.length) out.push({ poly: rest, what: 'none' });
  return out;
}

// The heated spaces of a floor: its connected ROOM components, each with the stairs open to it
// (owner, 2026-10-06: "only if it is opened without a door separating"). A STAIRS zone joins a
// room it touches or overlaps, unless a DOOR / SLIDING zone sits on their contact; a stair
// behind a wall gap (a doorway in a partition) stays apart, as before (not counted). A stair
// open to two rooms joins them into one space. The stair then counts with that room: its
// walls, floor, ceiling and air (its area is no longer taken out of the room's).
const STAIR_KINDS = new Set(['stairs_up', 'stairs_down']);
const DOOR_KINDS = new Set(['door', 'sliding', 'garage']);
function heatComponents(floor) {
  const rects = floor.rectangles;
  const doors = rects.filter((r) => DOOR_KINDS.has(zoneKind(r)));
  const doorBetween = (a, b) => {
    const A = a.bounds, B = b.bounds, e = 0.02;
    const box = { x0: Math.max(A.x0, B.x0) - e, x1: Math.min(A.x1, B.x1) + e, y0: Math.max(A.y0, B.y0) - e, y1: Math.min(A.y1, B.y1) + e };
    return doors.some((d) => { const D = d.bounds; return D.x0 < box.x1 && D.x1 > box.x0 && D.y0 < box.y1 && D.y1 > box.y0; });
  };
  const stairs = rects.filter((r) => STAIR_KINDS.has(zoneKind(r)) && !r.outdoor);
  const comps = connectedRoomComponents(rects);
  if (!stairs.length) return comps;
  // Group rooms' components and stairs: a stair links to a component, or to another stair (a
  // flight and its landing), where they touch with no door between.
  const nodes = [...comps.map((c) => ({ comp: c })), ...stairs.map((st) => ({ st }))];
  const parent = nodes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const link = (a, b) => { parent[find(a)] = find(b); };
  const touches = (n, st) => (n.comp ? n.comp.rectangles : [n.st]).some((r) => roomRectsConnect(st, r) && !doorBetween(st, r));
  stairs.forEach((st, k) => nodes.forEach((n, i) => { if (i !== comps.length + k && touches(n, st)) link(comps.length + k, i); }));
  const groups = new Map();
  nodes.forEach((n, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(n); });
  // Each open stair stands in as a room (same id and geometry, kind room, added); a stair
  // reaching no room stays out (not counted, as before).
  const proxy = (st) => Object.assign(Object.create(st), { kind: 'room', op: 'add', stair: true });
  const out = [];
  for (const members of groups.values()) {
    const cs = members.filter((n) => n.comp), sts = members.filter((n) => n.st).map((n) => n.st);
    if (!cs.length) continue;
    if (!sts.length) { out.push(cs[0].comp); continue; }
    const rectangles = [...cs.flatMap((n) => n.comp.rectangles), ...sts.map(proxy)];
    const subtracts = rects.filter((r) => r.op === 'subtract' && zoneKind(r) !== 'furniture' && !sts.includes(r));
    out.push({ rectangles, ids: new Set(rectangles.map((r) => r.id)),
      area: multiPolygonArea(computeFootprint([...rectangles, ...subtracts])) });
  }
  return out;
}

// Air volume of a heated space (owner, 2026-10-06: "the area does not mark the actual air
// volume"). The net area (the room minus every non-furniture subtract zone) × the ceiling
// height takes each zone out over the full height, right for walls, insulation and cabinets.
// A half wall (or a plinth under a shower tray) is solid only from the floor to its top, a
// heater only over its band, and an opening (door, passage, window, recess) or a stair (owner,
// 2026-10-07: "stairs can count as air") is air: their footprint inside the room gets its air
// back above / around the solid part. A stair open to the room is already part of it (its
// proxy is in `comp.ids`), so it is skipped rather than counted twice.
const OPEN_KINDS = new Set(['door', 'passage', 'garage', 'window', 'sliding', 'recess', ...STAIR_KINDS]);
function solidHeight(z, kind, H) {
  if (OPEN_KINDS.has(kind)) return 0;
  if (kind === 'halfwall') return Math.min(H, Math.max(0, z.sill ?? 0));
  if (kind === 'heater') return Math.max(0, Math.min(H, z.head ?? H) - Math.max(0, z.sill ?? 0));
  return H;
}
function airVolume(comp, rects, H) {
  let volume = comp.area * H, gross = null;
  const R = computeFootprint(comp.rectangles).flat(2);
  const xs = R.map((q) => q[0]), ys = R.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (const z of rects) {
    const kind = zoneKind(z);
    if (z.op !== 'subtract' || kind === 'furniture' || comp.ids.has(z.id)) continue;
    const solid = solidHeight(z, kind, H);
    const b = z.bounds;
    if (solid >= H || b.x1 <= x0 || b.x0 >= x1 || b.y1 <= y0 || b.y0 >= y1) continue;
    gross ??= multiPolygonArea(computeFootprint(comp.rectangles));
    const inside = gross - multiPolygonArea(computeFootprint([...comp.rectangles, z]));
    if (inside > EPS) volume += inside * (H - solid);
  }
  return volume;
}

/**
 * Heat loss of every room of `floor`, or [] for an unheated floor. Each result:
 * { ids, rectangles, area, volume, dT, total, parts: {wall, opening, floor, ceiling, air},
 *   detail: { wallArea, openingArea, insulatedArea, earthArea, below, above },
 *   map: { wall: [5 cm columns], floor: [pieces], ceiling: [pieces] } } — watts and m².
 * wallArea includes earthArea, the part of it below the earth level; parts.bridge is the
 * thermal bridges, each in map.junctions (ringJunctions). A map piece is
 * { poly, what ('heated' | 'unheated' | 'earth' | 'air' | 'attic'), u, wm2 }.
 */
export function floorHeatLoss(project, floor, without = {}) {
  const s = { ...heatSettings(project), noWallIns: !!without.wallIns, noWindows: !!without.windows,
    noReveals: !!without.reveals };
  const fh = without.atticIns ? { ...floorHeat(floor), ceilingR: 0 } : floorHeat(floor);
  if (!fh.heated || !(ceilingHeight(floor) > 0)) return [];
  const i = project.floors.indexOf(floor);
  const below = project.floors[i - 1] || null, above = project.floors[i + 1] || null;
  const gi = project.floors.findIndex((f) => f.id === project.groundFloorId);
  const onEarth = i <= (gi < 0 ? 0 : gi); // nothing below at or under ground level = earth
  const dT = s.tRoom - s.tOut;
  const b = (temp) => (s.tRoom - temp) / dT;
  const aboveH = floorHeat(above);
  // The neighbour floors' spaces, for the junctions at this floor's floor and ceiling.
  const nbOf = (f) => (f ? { rects: spacesOf(f).map((r) => r.bounds), heated: floorHeat(f).heated,
    floorR: floorHeat(f).floorR, heavy: floorHeat(f).heavy } : null);
  const nb = { above: nbOf(above), below: nbOf(below) };
  return heatComponents(floor).filter((comp) => !comp.rectangles[0].outdoor).map((comp) => {
    const foot = computeFootprint(comp.rectangles);
    const w = wallLoss(floor, comp, s, fh, dT, nb);
    const dn = splitByNeighbour(foot, below), up = splitByNeighbour(foot, above);
    // Floor: over a heated room 0; over an unheated floor (basement), with the added floor
    // insulation; over nothing = slab on earth (at/below ground level) or outside air (an
    // overhang), bare.
    const uFloorUnheated = 1 / (RS_FLOOR + s.slabR + fh.floorR);
    const uGround = s.groundU;
    const fg2 = (s.tRoom - s.tMean) / dT;
    const uFloorAir = 1 / (RS_FLOOR_AIR + s.slabR);
    const floorW = dn.unheated * uFloorUnheated * dT * b(dn.temp ?? s.tOut)
      + (onEarth ? FG1 * fg2 * dn.none * uGround * dT : dn.none * uFloorAir * dT);
    // Ceiling: under a heated room 0; under an unheated floor b; otherwise the attic
    // (counted as outside, the safe side) with this floor's added insulation.
    const uCeiling = 1 / (RS_CEILING + s.ceilingR + fh.ceilingR);
    const uCeilingUnheated = 1 / (RS_CEILING + s.slabR + aboveH.floorR);
    const ceilingW = up.unheated * uCeilingUnheated * dT * b(up.temp ?? s.tOut)
      + up.none * uCeiling * dT;
    const floorMap = neighbourPieces(foot, below).map(({ poly, what }) => {
      if (what === 'heated') return { poly, what, u: 0, wm2: 0 };
      if (what === 'unheated') return { poly, what, u: uFloorUnheated, wm2: uFloorUnheated * dT * b(dn.temp ?? s.tOut) };
      return onEarth ? { poly, what: 'earth', u: uGround, wm2: FG1 * fg2 * uGround * dT }
        : { poly, what: 'air', u: uFloorAir, wm2: uFloorAir * dT };
    });
    const ceilingMap = neighbourPieces(foot, above).map(({ poly, what }) => {
      if (what === 'heated') return { poly, what, u: 0, wm2: 0 };
      if (what === 'unheated') return { poly, what, u: uCeilingUnheated, wm2: uCeilingUnheated * dT * b(up.temp ?? s.tOut) };
      return { poly, what: 'attic', u: uCeiling, wm2: uCeiling * dT };
    });
    const volume = airVolume(comp, floor.rectangles, ceilingHeight(floor));
    const air = 0.34 * s.ach * volume * dT;
    const parts = { wall: w.wall, opening: w.opening, bridge: w.bridge, floor: floorW, ceiling: ceilingW, air };
    return {
      ids: comp.ids, rectangles: comp.rectangles, area: comp.area, volume, dT,
      total: Object.values(parts).reduce((a, v) => a + v, 0),
      parts,
      detail: {
        wallArea: w.wallArea, openingArea: w.openingArea, insulatedArea: w.insulated, earthArea: w.earthArea,
        below: { ...dn, onEarth },
        above: up,
      },
      map: { wall: w.samples, floor: floorMap, ceiling: ceilingMap, junctions: w.junctions },
    };
  });
}

/** The whole house at design conditions, with `without` taken away: { watts, kwh } (kWh/year
 *  ≈ the design loss per kelvin × degree-days × 24 h; ground losses scaled the same way). */
export function houseHeatLoss(project, without = {}) {
  const s = heatSettings(project);
  const watts = project.floors.reduce((a, f) => a + floorHeatLoss(project, f, without)
    .reduce((b, r) => b + r.total, 0), 0);
  return { watts, kwh: watts / (s.tRoom - s.tOut) * s.degreeDays * 24 / 1000 };
}

/**
 * The heaters of each room (owner, 2026-10-05: "the heaters contributions … as a separate
 * category"): every FURNITURE zone whose product has a rated power (`powerOf(article)` → W,
 * the catalog's `powerW`, EN 442 at ΔT 50 K) and whose centre lies in the room, scaled to the
 * project's radiator ΔT by the usual exponent 1.3. Returns, per room of `rooms` (the results
 * of floorHeatLoss), { watts, rated, count }.
 */
export function roomHeaters(project, floor, rooms, powerOf) {
  const scale = Math.pow(Math.max(0, heatSettings(project).radiatorDT) / 50, 1.3);
  const heaters = floor.rectangles.filter((r) => zoneKind(r) === 'furniture' && r.article && powerOf(r.article) > 0);
  return rooms.map((room) => {
    const mine = heaters.filter((h) => {
      const b = h.bounds, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      return room.rectangles.some((r) => { const rb = r.bounds; return cx >= rb.x0 && cx <= rb.x1 && cy >= rb.y0 && cy <= rb.y1; });
    });
    const rated = mine.reduce((a, h) => a + powerOf(h.article), 0);
    return { watts: rated * scale, rated, count: mine.length };
  });
}

/** The heat loss of the room containing `rect` on `floor`, or null. */
export function roomHeatLoss(project, floor, rect) {
  if (!rect || zoneKind(rect) !== 'room') return null;
  return floorHeatLoss(project, floor).find((r) => r.ids.has(rect.id)) || null;
}

// ---- Whole-house balance (owner, 2026-10-07: "make the whole house balance as a toggle option") ----
// With one water temperature for every radiator, a room whose radiators fall short settles a
// little under tRoom and draws heat from warmer neighbours, through the partitions and the
// floors between heated storeys; a room with spare is held at tRoom by its thermostatic valve.
// Each heated space is a node: its loss is linear around tRoom (the room's loss at tRoom plus
// G·(T − tRoom), G = each part over its own driving difference); its radiators give
// rated · ((tWater − T) / 50)^1.3 (tWater = tRoom + radiatorDT); it exchanges K·(Tj − T) with each
// neighbour. Spaces joined by an open stairwell across storeys (a stair of one floor over a stair
// of the next, each open to its room) are one node (owner, 2026-10-07: the hall and the upper
// landing are connected). Solved by Gauss-Seidel with the valve cap. Not modelled: doors in a
// partition (counted as partition), an open door's air exchange, the split units, sun, people.
const WOOD_FLOOR_R = 0.25; // m²K/W, a light (wooden) floor between heated storeys: boards, joist void, plaster ceiling (Hypothesis)
const PROBE_STEP_M = 0.01;

// Conductance (W/K) between the heated spaces of one floor through their partitions: every
// STEP_M of a space's outline probes outward; the first other space within PROBE_M is across a
// partition as thick as the gap. U = 1 / (Rsi + gap/λ + Rsi), λ = plaster under heavyWallMin,
// else the wall λ (masonry). Each side samples the wall once: halved.
function partitionLinks(rooms, H, s) {
  const K = new Map();
  const add = (i, j, v) => { const k = i < j ? `${i}|${j}` : `${j}|${i}`; K.set(k, (K.get(k) || 0) + v / 2); };
  const boxes = rooms.map((r) => r.rectangles.map((q) => q.bounds));
  const inRoom = (j, x, y) => boxes[j].some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
  rooms.forEach((room, i) => {
    for (const poly of computeFootprint(room.rectangles)) for (const ring of poly) {
      for (let e = 0; e + 1 < ring.length; e++) {
        const [ax, ay] = ring[e], [bx, by] = ring[e + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < EPS) continue;
        const nx = (by - ay) / len, ny = -(bx - ax) / len; // the room lies on the left: outward is right
        const n = Math.max(1, Math.round(len / STEP_M)), step = len / n;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
          if (inRoom(i, px + nx * 0.005, py + ny * 0.005)) continue; // not an outer face
          for (let d = PROBE_STEP_M; d <= PROBE_M; d += PROBE_STEP_M) {
            const j = rooms.findIndex((_, jj) => jj !== i && inRoom(jj, px + nx * d, py + ny * d));
            if (j < 0) continue;
            const gap = d - PROBE_STEP_M / 2;
            const u = 1 / (2 * 0.13 + gap / (gap < s.heavyWallMin ? s.plasterLambda : s.wallLambda));
            add(i, j, u * step * H);
            break;
          }
        }
      }
    }
  });
  return K;
}

/**
 * The whole house in balance at one water temperature (`radiatorDT`). `powerOf(article)` = a
 * heater's rated W (EN 442, ΔT 50). Returns { rooms: Map(`${floorId}|${index}` → node), nodes,
 * water } where index follows floorHeatLoss(project, floor, without); a node: { temp (°C the
 * space settles at), radiator (W its radiators give there), maxRadiator (at tRoom), fromNeighbours
 * (W received, negative = given), loss (W at tRoom), rated, stair (joined across storeys) }.
 * water: { dT, mean } the lowest ΔT at which every space with a radiator reaches tRoom, or null
 * when none does by 60 K.
 */
export function houseBalance(project, powerOf, without = {}) {
  const s = heatSettings(project);
  const dT = s.tRoom - s.tOut;
  const spaces = []; // { floor, index, room, rated, G }
  const perFloor = project.floors.map((floor) => {
    const rooms = floorHeatLoss(project, floor, without);
    const heaters = roomHeaters(project, floor, rooms, powerOf);
    const first = spaces.length;
    rooms.forEach((room, index) => {
      const d = room.detail, p = room.parts;
      const tBelow = d.below.onEarth ? s.tMean : (d.below.temp ?? s.tOut);
      const tAbove = d.above.temp ?? s.tOut;
      const per = (w, diff) => (w > EPS ? w / Math.max(0.5, diff) : 0);
      const G = per(p.wall + p.opening + p.bridge + p.air, dT) + per(p.floor, s.tRoom - tBelow)
        + per(p.ceiling, s.tRoom - tAbove);
      spaces.push({ floor, index, room, rated: heaters[index].rated, G });
    });
    return { floor, rooms, first };
  });
  // Nodes: spaces, merged across an open stairwell.
  const parent = spaces.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const stairsOf = (sp) => sp.floor.rectangles.filter((r) => STAIR_KINDS.has(zoneKind(r)) && sp.room.ids.has(r.id)).map((r) => r.bounds);
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const K = new Map();
  const addK = (i, j, v) => { if (i === j || !(v > 0)) return; const k = i < j ? `${i}|${j}` : `${j}|${i}`; K.set(k, (K.get(k) || 0) + v); };
  perFloor.forEach(({ floor, rooms, first }, fi) => {
    for (const [k, v] of partitionLinks(rooms, ceilingHeight(floor), s)) { const [a, b] = k.split('|').map(Number); addK(first + a, first + b, v); }
    const next = perFloor[fi + 1];
    if (!next || !rooms.length || !next.rooms.length) return;
    const uMid = 1 / (RS_CEILING + s.slabR + (floorHeat(next.floor).heavy ? 0 : WOOD_FLOOR_R));
    rooms.forEach((ra, a) => next.rooms.forEach((rb, b) => {
      const i = first + a, j = next.first + b;
      const sa = stairsOf(spaces[i]), sb = stairsOf(spaces[j]);
      if (sa.some((x) => sb.some((y) => overlap(x, y) > 0.1))) parent[find(i)] = find(j);
      const both = polygonClipping.intersection(computeFootprint(ra.rectangles), computeFootprint(rb.rectangles));
      addK(i, j, uMid * multiPolygonArea(both));
    }));
  });
  const roots = [...new Set(spaces.map((_, i) => find(i)))];
  const nodeOf = new Map(roots.map((r, n) => [r, n]));
  const nodes = roots.map(() => ({ loss: 0, G: 0, rated: 0, members: [], links: new Map(), temp: s.tRoom }));
  spaces.forEach((sp, i) => {
    const nd = nodes[nodeOf.get(find(i))];
    nd.loss += sp.room.total; nd.G += sp.G; nd.rated += sp.rated; nd.members.push(sp);
  });
  for (const [k, v] of K) {
    const [i, j] = k.split('|').map(Number), a = nodeOf.get(find(i)), b = nodeOf.get(find(j));
    if (a === b) continue;
    nodes[a].links.set(b, (nodes[a].links.get(b) || 0) + v);
    nodes[b].links.set(a, (nodes[b].links.get(a) || 0) + v);
  }
  const solve = (radiatorDT) => {
    const tw = s.tRoom + radiatorDT;
    const rad = (nd, T) => nd.rated * Math.pow(Math.max(0, tw - T) / 50, 1.3);
    const net = (nd, T) => {
      let inflow = 0;
      for (const [j, k] of nd.links) inflow += k * (nodes[j].temp - T);
      return { inflow, need: nd.loss + nd.G * (T - s.tRoom) - inflow };
    };
    for (const nd of nodes) nd.temp = s.tRoom;
    for (let it = 0; it < 500; it++) {
      let moved = 0;
      for (const nd of nodes) {
        const before = nd.temp;
        if (rad(nd, s.tRoom) >= net(nd, s.tRoom).need) nd.temp = s.tRoom; // the valve holds tRoom
        else {
          let lo = Math.min(s.tOut, s.tRoom - 40), hi = s.tRoom;
          for (let b = 0; b < 50; b++) { const T = (lo + hi) / 2; if (rad(nd, T) >= net(nd, T).need) lo = T; else hi = T; }
          nd.temp = lo;
        }
        moved = Math.max(moved, Math.abs(nd.temp - before));
      }
      if (moved < 1e-5) break;
    }
    return nodes.map((nd) => {
      const { inflow, need } = net(nd, nd.temp);
      return { temp: nd.temp, radiator: Math.min(rad(nd, nd.temp), Math.max(0, need)), maxRadiator: rad(nd, s.tRoom),
        fromNeighbours: inflow, loss: nd.loss, rated: nd.rated, stair: new Set(nd.members.map((m) => m.floor)).size > 1 };
    });
  };
  const reaches = (res) => res.every((r, n) => !nodes[n].rated || r.temp >= s.tRoom - 0.05);
  let water = null;
  if (nodes.some((nd) => nd.rated) && reaches(solve(60))) {
    let lo = 0, hi = 60;
    for (let b = 0; b < 30; b++) { const m = (lo + hi) / 2; if (reaches(solve(m))) hi = m; else lo = m; }
    water = { dT: hi, mean: s.tRoom + hi };
  }
  const result = solve(s.radiatorDT);
  const rooms = new Map();
  spaces.forEach((sp, i) => rooms.set(`${sp.floor.id}|${sp.index}`, result[nodeOf.get(find(i))]));
  return { rooms, nodes: result, water };
}
