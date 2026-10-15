// Which VMC ducts need insulating (owner, 2026-10-16): DTU 68.3 wants a duct outside the heated
// volume insulated, R ≥ 0.6 m²·K/W (≈ 25 mm of wool; docs/plumbing-workflow.md), so warm, humid
// extract air does not condense in it. Derived from the plan, never stored, so it follows every edit.
//
// A point of a duct is outside the heated volume when the storey it is in is unheated (floor.heat),
// when it is in no indoor space of that storey (outside the walls), or when it is above that storey's
// ceiling with no heated space of the storey above over it (an attic). Walls and linings count with
// the space, as in the heat-loss model, so a duct crossing a wall top is cold only where it leaves it.
import { floorHeat } from './heatLoss.js';
import { zoneKind } from './zoneColors.js';
import { ceilingAt } from './storey.js';
import { isSplitLevel } from './model.js';

export const DUCT_INSULATION_M = 0.025; // the jacket drawn and recommended (R ≈ 0.6 at λ 0.04)
const STEP_M = 0.02;  // sampling step along a duct
const MIN_RUN_M = 0.03; // shorter cold stretches (a sample at a boundary) are ignored
const SPACE_KINDS = new Set(['room', 'stairs_up', 'stairs_down', 'wall', 'halfwall', 'insulation']);

// A wall drawn as the gap between two rooms (View 3D derives it) has no zone, so the floor's spaces are
// closed by CLOSE_M first: grown by it, then shrunk by it (a point is in when the square of half-side
// CLOSE_M around it lies in the grown zones, sampled on a 3 × 3 grid). Gaps narrower than 2 × CLOSE_M
// fill; a point just outside an exterior wall stays outside.
const CLOSE_M = 0.3;
const inGrown = (floor, x, y) => (floor?.rectangles || []).some((r) => {
  if (!SPACE_KINDS.has(zoneKind(r)) || r.outdoor) return false; // walls are SUBTRACT zones: they count too
  const b = r.bounds;
  return x >= b.x0 - CLOSE_M && x <= b.x1 + CLOSE_M && y >= b.y0 - CLOSE_M && y <= b.y1 + CLOSE_M;
});
function inSpace(floor, x, y) {
  for (const dx of [-CLOSE_M, 0, CLOSE_M]) for (const dy of [-CLOSE_M, 0, CLOSE_M]) if (!inGrown(floor, x + dx, y + dy)) return false;
  return true;
}

// Is the world point (x, y, z absolute) outside the heated volume?
function isCold(stack, p) {
  const i = stack.findIndex((f) => p.z >= (f.elevation || 0) - 1e-6 && p.z < (f.elevation || 0) + f.height - 1e-6);
  const floor = stack[i];
  if (!floor) return true; // above the roof or below the lowest storey
  if (!floorHeat(floor).heated || !inSpace(floor, p.x, p.y)) return true;
  if (p.z - (floor.elevation || 0) <= ceilingAt(floor, p.x, p.y, floor.height) + 1e-6) return false;
  const above = stack[i + 1];
  return !(above && floorHeat(above).heated && inSpace(above, p.x, p.y));
}

// → Map pipeId → { cold: [[t0, t1], …] (fractions along a → b), length (m of cold duct) }, VMC pipes only.
// `pos(node)` gives a node's absolute position { x, y, z }.
export function ductInsulation(project, pos) {
  const stack = (project.floors || []).filter((f) => !isSplitLevel(f))
    .sort((a, b) => (a.elevation || 0) - (b.elevation || 0));
  const nodes = new Map((project.pipeNodes || []).map((n) => [n.id, n]));
  const out = new Map();
  for (const pipe of project.pipes || []) {
    if (pipe.service !== 'vmc') continue;
    const a = nodes.get(pipe.a), b = nodes.get(pipe.b);
    if (!a || !b) continue;
    const A = pos(a), B = pos(b);
    const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    const n = Math.max(1, Math.ceil(L / STEP_M));
    const cold = [];
    let start = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const c = isCold(stack, { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t });
      if (c && start == null) start = t;
      if ((!c || k === n) && start != null) {
        const end = c ? t : (k - 1) / n;
        if ((end - start) * L >= MIN_RUN_M) cold.push([start, end]);
        start = null;
      }
    }
    if (cold.length) out.set(pipe.id, { cold, length: cold.reduce((s, [t0, t1]) => s + (t1 - t0) * L, 0) });
  }
  return out;
}
