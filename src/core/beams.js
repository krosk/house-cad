// BEAM zones (owner, 2026-10-17; zoneColors.js BEAM_BAND): the lintels and joists in the slabs, drawn so
// that pipe routes avoid them. A beam is stored on the floor whose walls it is measured from, its band
// [foot, top] m from that floor: in the slab above the ceiling when drawn from the storey below (the
// kitchen ceiling), below the floor (negative) when drawn from the storey above. Everything else
// (both storeys' views, the clash check) uses its world box, so either side means the same beam
// (docs/plumbing-workflow.md "Beams").
import { zoneKind } from './zoneColors.js';
import { ceilingHeight } from './storey.js';
import { floorBelow } from './model.js';
import { pipeNodeWorld } from './pipeAnchors.js';

const SLAB_FALLBACK = 0.25;

// The default band of a new beam on `floor`: in the slab above its ceiling, or (under) in the slab
// under its floor, the floor below's slab thickness.
export function beamBand(project, floor, under = false) {
  if (under) {
    const below = floorBelow(project, floor, { stacked: true });
    return { foot: -(below?.slab || SLAB_FALLBACK), top: 0 };
  }
  const H = ceilingHeight(floor, 2.5);
  const top = floor?.height || H + SLAB_FALLBACK;
  return { foot: H, top: top > H ? top : H + SLAB_FALLBACK };
}

// A beam drawn from above (its top at or below its floor): the band pad reads it as depths under the floor.
export const beamUnder = (rect) => zoneKind(rect) === 'beam' && (rect.top ?? 0) <= 1e-6;

// Every beam of the house as a world box: { rect, floor, x0, x1, y0, y1, z0, z1 }.
export function worldBeams(project) {
  const out = [];
  for (const floor of project?.floors || []) {
    const e = floor.elevation || 0;
    for (const rect of floor.rectangles || []) {
      if (zoneKind(rect) !== 'beam') continue;
      const b = rect.bounds, foot = rect.foot ?? 0, top = rect.top ?? 0;
      if (!(b.x1 > b.x0 && b.y1 > b.y0 && top > foot)) continue;
      out.push({ rect, floor, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: e + foot, z1: e + top });
    }
  }
  return out;
}

// The beams to show with `floor` (its own, and the other storeys' that reach into the slab under or over
// it): a world box overlapping [the floor below's ceiling, the floor above's floor], beyond its own rooms.
export function beamsAround(project, floor) {
  const e = floor?.elevation || 0;
  const below = floorBelow(project, floor, { stacked: true });
  const lo = below ? (below.elevation || 0) + ceilingHeight(below) : e - SLAB_FALLBACK;
  const hi = e + (floor?.height || ceilingHeight(floor, 2.5) + SLAB_FALLBACK);
  return worldBeams(project).filter((b) => b.z1 > lo + 1e-6 && b.z0 < hi - 1e-6);
}

// The part of segment a→b (world) inside box (grown by r): [t0, t1] or null (slab clipping).
function clipSegment(a, b, box, r) {
  let t0 = 0, t1 = 1;
  for (const [p, q, lo, hi] of [[a.x, b.x, box.x0, box.x1], [a.y, b.y, box.y0, box.y1], [a.z, b.z, box.z0, box.z1]]) {
    const d = q - p, L = lo - r, H = hi + r;
    if (Math.abs(d) < 1e-12) { if (p <= L || p >= H) return null; continue; }
    let u0 = (L - p) / d, u1 = (H - p) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t1 <= t0) return null;
  }
  return [t0, t1];
}

// Every pipe crossing a beam, the pipe taken as its outer radius: { pipe, beam, length (m of axis inside),
// depth (how far the pipe's axis goes into the beam past its nearest face, m; ≥ 0) }. A pipe that only
// touches a face (depth ≤ `tolerance`) is not a clash.
export function pipeBeamClashes(project, tolerance = 0.002) {
  const nodes = new Map((project.pipeNodes || []).map((n) => [n.id, n]));
  const beams = worldBeams(project);
  const out = [];
  for (const pipe of project.pipes || []) {
    const an = nodes.get(pipe.a), bn = nodes.get(pipe.b);
    if (!an || !bn) continue;
    const a = pipeNodeWorld(project, an), b = pipeNodeWorld(project, bn);
    const r = (pipe.diameter || 0.016) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    for (const beam of beams) {
      const t = clipSegment(a, b, beam, r);
      if (!t) continue;
      // Penetration at the midpoint of the clipped part: the smallest distance to leave the grown box.
      const tm = (t[0] + t[1]) / 2;
      const p = { x: a.x + (b.x - a.x) * tm, y: a.y + (b.y - a.y) * tm, z: a.z + (b.z - a.z) * tm };
      const depth = Math.min(p.x - (beam.x0 - r), beam.x1 + r - p.x, p.y - (beam.y0 - r), beam.y1 + r - p.y,
        p.z - (beam.z0 - r), beam.z1 + r - p.z);
      if (depth <= tolerance) continue;
      out.push({ pipe, beam, length: (t[1] - t[0]) * len, depth });
    }
  }
  return out;
}
