// A storey's room height: floor to ceiling, below the slab of the storey above. A floor's
// `height` is floor to floor (the floors stack on it, stairs climb it) and `slab` is the
// slab thickness above its ceiling (owner, 2026-10-04: the house's 2.95 storeys are 2.70
// rooms + 0.25 slab). Walls, ceilings, wall finishes, links and heat loss use this.
// Its own module so electrical.js / heatLoss.js (imported by model.js) can use it without a cycle.
export const ceilingHeight = (floor, fallback = 0) =>
  Math.max(0, (floor?.height || fallback) - (floor?.slab || 0));
