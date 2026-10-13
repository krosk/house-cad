// A storey's room height: floor to ceiling, below the slab of the storey above. A floor's
// `height` is floor to floor (the floors stack on it, stairs climb it) and `slab` is the
// slab thickness above its ceiling (owner, 2026-10-04: the house's 2.95 storeys are 2.70
// rooms + 0.25 slab). Walls, ceilings, wall finishes, links and heat loss use this.
// Its own module so electrical.js / heatLoss.js (imported by model.js) can use it without a cycle.
export const ceilingHeight = (floor, fallback = 0) =>
  Math.max(0, (floor?.height || fallback) - (floor?.slab || 0));

// A ROOM may carry its own lower `ceiling` (owner, 2026-10-13: the veranda is on the ground
// floor's level, out of the kitchen, under a 2.20 m roof in a 2.70 m storey). It only lowers:
// a value above the storey's ceiling, or none, is the storey's. Floors keep stacking on `height`.
export const roomCeiling = (floor, rect, fallback = 0) => {
  const H = ceilingHeight(floor, fallback);
  const c = Number(rect?.ceiling);
  return Number.isFinite(c) && c > 0 && c < H ? c : H;
};
// The ceiling over a plan point: the room there with its own lower ceiling, else the storey's.
export const ceilingAt = (floor, x, y, fallback = 0) => {
  let c = ceilingHeight(floor, fallback);
  for (const r of floor?.rectangles || []) {
    if (r.kind !== 'room' || r.ceiling == null) continue;
    const b = r.bounds;
    if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) c = Math.min(c, roomCeiling(floor, r, fallback));
  }
  return c;
};

// A ROOM may stand at its own floor level, m above (or, negative, below) its storey's floor
// (owner, 2026-10-13: the Upper small room up a few steps; the Basement's rooms flat at
// different heights). Every other height (markers, `ceiling`, sills and heads) stays measured
// from the storey's floor, so a room's height is its ceiling − its floor level.
export const roomFloorZ = (rect) => {
  const z = Number(rect?.floorZ);
  return Number.isFinite(z) ? z : 0;
};
// The floor level at a plan point: the room there (the highest, if rooms overlap), else 0.
export const floorZAt = (floor, x, y) => {
  let z = null;
  for (const r of floor?.rectangles || []) {
    if (r.kind !== 'room') continue;
    const b = r.bounds;
    if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) z = Math.max(z ?? -Infinity, roomFloorZ(r));
  }
  return z ?? 0;
};
// Does a room stand on its own level? (any room, for the cheap common-case checks)
export const hasRoomLevels = (floor) => (floor?.rectangles || []).some((r) => r.kind === 'room' && roomFloorZ(r) !== 0);
