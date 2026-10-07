// How far each window leaf opens before it hits something (owner, 2026-10-07: "how far
// can I open the windows; they will hit heaters and aircon units"). Pure plan + heights:
// MATERIAL · WINDOW draws it in AR, View 3D can show every product window opened that far
// (docs/materials.md "Window swing").
//
// A leaf turns into the room about a vertical axis at its hinge jamb, on the sash's room
// face. At each degree, points along the sash (its centre line and both faces) and its
// lever handle are tested against what stands in the room at their heights: FURNITURE
// zones (foot..top), CABINET zones, a HALF WALL (0..sill), WALL / INSULATION zones, and
// anything outside the floor's ROOM rects (the walls). The window's own opening (and any
// other opening) is free space. The first degree that touches stops the leaf.
//
// The sash numbers match the Héméra builder (src/ui/windowProducts.js PROFILES.hemera and
// the frame centred on the zone): frame face 19 mm, exterior lip 20 mm, sash 85 % of the
// product's sashDepth. A plain window (no product) uses the same defaults. Sliding
// products (`design: 'neva'`) have no swing and are left out.

import { zoneKind } from './zoneColors.js';
import { resolveApertureOrient } from './apertureGlyph.js';
import { ceilingHeight } from './storey.js';

export const SWING_FRAME_FACE = 0.019; // frame face seen from inside (PROFILES.hemera.frameIn)
const LIP = 0.02;                      // exterior lip (PROFILES.hemera.lipDepth)
const HANDLE_OUT = 0.055;              // lever, from the sash's room face (builder: sz1 + 0.045 ± 0.008)
const HANDLE_IN = 0.03;                // lever, in from the leaf's free edge
const STEP_DEG = 1;
const SAMPLE = 0.02;                   // m between points along the sash

const EPS = 1e-6;
const inBox = (b, x, y) => x > b.x0 + EPS && x < b.x1 - EPS && y > b.y0 + EPS && y < b.y1 - EPS;

// The pivot's offset from the zone centre toward the room, and the sash depth, for a
// product (or the defaults). Same formula as buildWindowProduct: frame centred on the
// zone, sash from behind the lip to 85 % of sashDepth.
export function sashSection(def) {
  const frameD = def?.frameDepth ?? 0.08, sashD = def?.sashDepth ?? 0.084;
  const thick = sashD * 0.85;
  return { pivot: -frameD / 2 + LIP + thick, thick };
}

// Every swinging window of `floor`: [{ rectId, alongX, side, sill, head, leaves: [{ end,
// hand, hinge: {x, y}, closedDir, openDir, radius, maxDeg, stop }] }]. `side` is the room
// side on the perpendicular plan axis (+1 = toward larger coordinates). `end` is the hinge
// jamb on the long axis ('lo' | 'hi'); `hand` is 'left' | 'right' as seen from the room
// (single leaf: its hinge side). `closedDir`/`openDir` are unit plan vectors from the hinge
// along the closed leaf and into the room. `stop` = { rect, kind, article } | { wall: true }
// | null (opens flat, 180°). `materialOf(id)` resolves the window's product.
export function windowSwings(floor, materialOf = () => null) {
  const rects = floor?.rectangles || [];
  const ceil = ceilingHeight(floor, 2.5);
  const rooms = rects.filter((r) => zoneKind(r) === 'room' && r.op !== 'subtract').map((r) => r.bounds);
  const openings = rects.filter((r) => ['window', 'door', 'passage', 'sliding', 'garage'].includes(zoneKind(r))).map((r) => r.bounds);
  const solids = [];
  for (const r of rects) {
    const kind = zoneKind(r);
    if (kind === 'wall' || kind === 'insulation') solids.push({ r, kind, b: r.bounds, z0: 0, z1: ceil, structural: true });
    else if (kind === 'furniture' || kind === 'cabinet') solids.push({ r, kind, b: r.bounds, z0: r.foot ?? 0, z1: r.top ?? 0.9 });
    else if (kind === 'halfwall') solids.push({ r, kind, b: r.bounds, z0: 0, z1: r.sill ?? 1 });
  }
  // What stands at plan (x, y) between heights z0..z1 (null = free).
  const blocker = (x, y, z0, z1) => {
    const inOpening = openings.some((b) => inBox(b, x, y));
    if (!inOpening && !rooms.some((b) => inBox(b, x, y))) return { wall: true };
    // The wall around an opening is cut by it: only free-standing things count there.
    const s = solids.find((o) => !(inOpening && o.structural) && o.z0 < z1 && o.z1 > z0 && inBox(o.b, x, y));
    return s ? { rect: s.r.id, kind: s.kind, article: s.r.article || null } : null;
  };
  const finishOf = (rect) => (floor.finishes || []).find((f) => !f.target?.edge && f.target?.rect === rect.id);

  const out = [];
  for (const rect of rects) {
    if (zoneKind(rect) !== 'window') continue;
    const b = rect.bounds;
    if (!(b.x1 - b.x0 > EPS && b.y1 - b.y0 > EPS)) continue;
    const def = materialOf(finishOf(rect)?.material) || null;
    if (def && def.surface !== 'window') continue;
    if (def?.design === 'neva') continue; // sliding: nothing swings
    const alongX = (b.x1 - b.x0) >= (b.y1 - b.y0);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    // Room side: the side whose probe point just past the zone is in a room (as
    // windowProductPlacements does); neither or both = no swing analysis.
    const reach = (alongX ? b.y1 - b.y0 : b.x1 - b.x0) / 2 + 0.1;
    const plus = alongX ? rooms.some((r) => inBox(r, cx, cy + reach)) : rooms.some((r) => inBox(r, cx + reach, cy));
    const minus = alongX ? rooms.some((r) => inBox(r, cx, cy - reach)) : rooms.some((r) => inBox(r, cx - reach, cy));
    if (plus === minus) continue;
    const side = plus ? 1 : -1;
    const sill = Math.max(0, rect.sill ?? 0.9), head = Math.min(ceil, rect.head ?? 2.1);
    if (head - sill < 0.2) continue;
    const lo = alongX ? b.x0 : b.y0, hi = alongX ? b.x1 : b.y1;
    const leafCount = def?.leaves ?? ((rect.hinge ?? 'left') === 'both' ? 2 : 1);
    const radius = (hi - lo - 2 * SWING_FRAME_FACE) / leafCount;
    if (radius < 0.1) continue;
    const { pivot, thick } = sashSection(def);
    const face = (alongX ? cy : cx) + side * pivot; // perpendicular coordinate of the hinge axis
    // Seen from the room, which plan end is on the right: facing the window from a room on
    // the +side of a wall along Y you look toward −x, so +y (hi) is on your right.
    const rightEnd = (alongX ? side < 0 : side > 0) ? 'hi' : 'lo';
    const { hingeEnd } = resolveApertureOrient(rect, b.x0, b.x1, b.y0, b.y1);
    const ends = leafCount === 2 ? ['lo', 'hi'] : [hingeEnd === 'hi' ? 'hi' : 'lo'];
    // The lever: on the free stile of a single leaf, on the right-hand (service) leaf of two.
    const handleEnd = leafCount === 2 ? rightEnd : ends[0];
    const z0 = sill + SWING_FRAME_FACE, z1 = head - SWING_FRAME_FACE;
    const hz = sill + (head - sill) / 2; // handle height (builder: h / 2), lever hanging below
    const leaves = ends.map((end) => {
      const along0 = end === 'lo' ? lo + SWING_FRAME_FACE : hi - SWING_FRAME_FACE;
      const k = end === 'lo' ? 1 : -1; // closed leaf points from its jamb toward the middle
      const toPlan = (a, n) => (alongX ? { x: a, y: n } : { x: n, y: a });
      let maxDeg = 180, stop = null;
      for (let deg = STEP_DEG; deg <= 180 && !stop; deg += STEP_DEG) {
        const t = (deg * Math.PI) / 180;
        // (along, across) unit vectors: the sash direction and its exterior-face normal.
        const da = k * Math.cos(t), dn = side * Math.sin(t);
        const na = k * Math.sin(t), nn = -side * Math.cos(t);
        const test = (r, off, za, zb) => {
          const a = along0 + r * da + off * na, n = face + r * dn + off * nn;
          const p = toPlan(a, n);
          return blocker(p.x, p.y, za, zb);
        };
        for (let r = SAMPLE; r <= radius + EPS && !stop; r += SAMPLE) {
          for (const off of [0, thick / 2, thick]) {
            const hit = test(r, off, z0, z1);
            if (hit) { stop = hit; break; }
          }
        }
        if (!stop && end === handleEnd) stop = test(radius - HANDLE_IN, -HANDLE_OUT, hz - 0.105, hz + 0.02);
        if (stop) maxDeg = deg - STEP_DEG;
      }
      return {
        end, hand: end === rightEnd ? 'right' : 'left',
        hinge: toPlanXY(alongX, along0, face), radius, maxDeg, stop,
        closedDir: toPlanXY(alongX, k, 0), openDir: toPlanXY(alongX, 0, side),
        handle: end === handleEnd,
      };
    });
    out.push({ rectId: rect.id, alongX, side, sill, head, leaves });
  }
  return out;
}

const toPlanXY = (alongX, a, n) => (alongX ? { x: a, y: n } : { x: n, y: a });

// The plan direction of a leaf opened `deg` degrees (unit vector from its hinge).
export function leafDirection(leaf, deg) {
  const t = (deg * Math.PI) / 180;
  return {
    x: leaf.closedDir.x * Math.cos(t) + leaf.openDir.x * Math.sin(t),
    y: leaf.closedDir.y * Math.cos(t) + leaf.openDir.y * Math.sin(t),
  };
}
