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
// decisions 2026-10-01 and 2026-10-04). Their R add up; where no WALL zone is drawn, a
// placeholder wall `wallDepth` thick stands in for the masonry. Below the earth level
// (one for the house) a wall loses to the ground instead, as a basement wall (ISO 13370). Floor and ceiling are split by overlap with the
// rooms of the floors below/above (floors are ordered bottom → top).

import polygonClipping from 'polygon-clipping';
import { computeFootprint, connectedRoomComponents, multiPolygonArea } from './geometry2d.js';
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
};
// Per floor (`floor.heat`): heated or not, an unheated floor's winter temperature, and
// insulation ADDED to its floor slab and above its ceiling (attic).
export const FLOOR_HEAT_DEFAULTS = { heated: true, temp: 6, floorR: 0, ceilingR: 0 };

export const PROBE_M = 0.6;      // how far beyond an edge a neighbour room or exterior layer counts
const STEP_M = 0.05;             // wall sampling step along each edge
const DERATE_INTERIOR = 0.85;    // thermal bridges at slabs/partitions/rails (interior lining)
const DERATE_EXTERIOR = 0.95;    // exterior insulation wraps the junctions
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
const spacesOf = (floor) => (floor?.rectangles || []).filter((r) => SLAB_KINDS.has(zoneKind(r)))
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
// A layer's R: authored `rValue`, else its depth across the wall / λ.
function zoneR(rect, nx, s) {
  if (Number.isFinite(rect.rValue) && rect.rValue >= 0) return rect.rValue;
  const b = rect.bounds;
  return (nx ? b.x1 - b.x0 : b.y1 - b.y0) / layerLambda(zoneKind(rect), s);
}

// ISO 13370 basement wall: the U of a wall buried z m deep (the floor's depth below the
// earth), from its own R and the floor's equivalent thickness d_t.
export function buriedWallU(z, wallR, dt) {
  const dw = LAMBDA_GROUND * (RS_GROUND + wallR);
  return (2 * LAMBDA_GROUND / (Math.PI * z)) * (1 + 0.5 * dt / (dt + z)) * Math.log(z / dw + 1);
}

function wallLoss(floor, comp, s, fh, dT) {
  const out = { wall: 0, opening: 0, wallArea: 0, openingArea: 0, insulated: 0, earthArea: 0 };
  const H = ceilingHeight(floor); // the room's walls, below the slab
  // Below the earth: the part of each wall under it loses to the ground at the annual
  // mean temperature (EN 12831's fg1 · fg2 · ΔT, as for a slab on earth).
  const z = s.earth - (floor.elevation || 0), buriedH = Math.min(H, Math.max(0, z));
  const dt = s.wallDepth + LAMBDA_GROUND * (0.17 + s.slabR + fh.floorR + 0.04);
  const groundDT = FG1 * (s.tRoom - s.tMean);
  const others = floor.rectangles.filter((r) => SPACE_KINDS.has(zoneKind(r)) && !comp.ids.has(r.id))
    .map((r) => r.bounds);
  const layers = floor.rectangles.filter((r) => LAYER_KINDS.has(zoneKind(r)));
  const openings = floor.rectangles.filter((r) => OPENING_KINDS.has(zoneKind(r)));
  for (const polygon of computeFootprint(comp.rectangles)) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < EPS) continue;
        // The room lies on the LEFT of each directed boundary edge (polygon-clipping),
        // so the outward normal is the right-hand one.
        const nx = (by - ay) / len, ny = -(bx - ax) / len;
        const n = Math.max(1, Math.ceil(len / STEP_M)), ds = len / n;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
          const px = mx + nx * PROBE_M, py = my + ny * PROBE_M;
          const sx = mx + nx * 1e-4, sy = my + ny * 1e-4;
          if (others.some((b) => hitsSegment(b, sx, sy, px, py))) continue; // heated both sides
          let r = 0, insulated = false, walled = false;
          for (const z of layers) {
            const b = z.bounds, wall = zoneKind(z) === 'wall';
            const inner = contains(b, mx - nx * 0.005, my - ny * 0.005);
            if (!inner && !hitsSegment(b, sx, sy, px, py)) continue;
            // Thermal bridges derate insulation only: a lining more (cut by slabs and
            // partitions) than insulation outside (it wraps the junctions).
            r += zoneR(z, nx, s) * (wall ? 1 : inner ? DERATE_INTERIOR : DERATE_EXTERIOR);
            if (wall) walled = true; else insulated = true;
          }
          if (!walled) r += s.wallDepth / s.wallLambda; // the placeholder masonry
          const u = 1 / (RS_WALL + r);
          let openH = 0, openU = 0, openSill = 0;
          for (const o of openings) {
            if (!hitsSegment(o.bounds, mx - nx * 0.3, my - ny * 0.3, px, py)) continue;
            const kind = zoneKind(o);
            const sill = Math.max(0, o.sill ?? 0), head = Math.min(H, o.head ?? H);
            if (head - sill > openH) {
              openH = head - sill; openSill = sill;
              openU = Number.isFinite(o.uValue) && o.uValue > 0 ? o.uValue
                : isGlazedKind(kind) ? s.windowU : s.doorU;
            }
          }
          // The opening's band takes its share of the buried height first (a window
          // above the earth leaves the buried wall whole).
          const openBuried = Math.max(0, Math.min(buriedH, openSill + openH) - openSill);
          const earthA = ds * Math.max(0, buriedH - openBuried);
          const wallA = ds * Math.max(0, H - openH), openA = ds * openH, airA = Math.max(0, wallA - earthA);
          out.wallArea += wallA; out.openingArea += openA; out.earthArea += earthA;
          if (insulated) out.insulated += wallA;
          out.wall += airA * u * dT;
          if (earthA > 0) out.wall += earthA * buriedWallU(z, r, dt) * groundDT;
          out.opening += openA * openU * dT;
        }
      }
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

/**
 * Heat loss of every room of `floor`, or [] for an unheated floor. Each result:
 * { ids, rectangles, area, volume, dT, total, parts: {wall, opening, floor, ceiling, air},
 *   detail: { wallArea, openingArea, insulatedArea, earthArea, below, above } } — watts and m².
 * wallArea includes earthArea, the part of it below the earth level.
 */
export function floorHeatLoss(project, floor) {
  const s = heatSettings(project), fh = floorHeat(floor);
  if (!fh.heated || !(ceilingHeight(floor) > 0)) return [];
  const i = project.floors.indexOf(floor);
  const below = project.floors[i - 1] || null, above = project.floors[i + 1] || null;
  const gi = project.floors.findIndex((f) => f.id === project.groundFloorId);
  const onEarth = i <= (gi < 0 ? 0 : gi); // nothing below at or under ground level = earth
  const dT = s.tRoom - s.tOut;
  const b = (temp) => (s.tRoom - temp) / dT;
  const aboveH = floorHeat(above);
  return connectedRoomComponents(floor.rectangles).map((comp) => {
    const foot = computeFootprint(comp.rectangles);
    const w = wallLoss(floor, comp, s, fh, dT);
    const dn = splitByNeighbour(foot, below), up = splitByNeighbour(foot, above);
    // Floor: over a heated room 0; over an unheated floor (basement); over nothing
    // = slab on earth (at/below ground level) or outside air (an overhang).
    const uFloorUnheated = 1 / (RS_FLOOR + s.slabR + fh.floorR);
    const uGround = 1 / (1 / s.groundU + fh.floorR);
    const fg2 = (s.tRoom - s.tMean) / dT;
    const uFloorAir = 1 / (RS_FLOOR_AIR + s.slabR + fh.floorR);
    const floorW = dn.unheated * uFloorUnheated * dT * b(dn.temp ?? s.tOut)
      + (onEarth ? FG1 * fg2 * dn.none * uGround * dT : dn.none * uFloorAir * dT);
    // Ceiling: under a heated room 0; under an unheated floor b; otherwise the attic
    // (counted as outside, the safe side) with this floor's added insulation.
    const uCeiling = 1 / (RS_CEILING + s.ceilingR + fh.ceilingR);
    const ceilingW = up.unheated * (1 / (RS_CEILING + s.slabR + aboveH.floorR)) * dT * b(up.temp ?? s.tOut)
      + up.none * uCeiling * dT;
    const volume = comp.area * ceilingHeight(floor);
    const air = 0.34 * s.ach * volume * dT;
    const parts = { wall: w.wall, opening: w.opening, floor: floorW, ceiling: ceilingW, air };
    return {
      ids: comp.ids, rectangles: comp.rectangles, area: comp.area, volume, dT,
      total: Object.values(parts).reduce((a, v) => a + v, 0),
      parts,
      detail: {
        wallArea: w.wallArea, openingArea: w.openingArea, insulatedArea: w.insulated, earthArea: w.earthArea,
        below: { ...dn, onEarth },
        above: up,
      },
    };
  });
}

/** The heat loss of the room containing `rect` on `floor`, or null. */
export function roomHeatLoss(project, floor, rect) {
  if (!rect || zoneKind(rect) !== 'room') return null;
  return floorHeatLoss(project, floor).find((r) => r.ids.has(rect.id)) || null;
}
