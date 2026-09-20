// Printable floor-plan sheets — one per floor.
//
// A to-scale survey deliverable, drawn from the parametric model (never stored;
// recomputed like the mesh). ONE set of draw calls feeds two backends:
//   - svgBackend()      -> a self-contained SVG string  (desktop print + download,
//                          AR blob download)
//   - canvasBackend()   -> a 2D canvas                   (in-AR preview panel)
// so the linework can never diverge between "what you preview" and "what prints".
//
// Coordinate spaces:
//   model  = meters, +x right, +y up            (the plan)
//   page   = millimeters, +x right, +y DOWN      (paper; SVG viewBox is in mm)
// Everything below is computed in PAGE MILLIMETERS. The SVG backend writes mm
// straight into the viewBox; the canvas backend multiplies by a px-per-mm factor.
// Annotation sizes (text, offsets, arrows) are therefore fixed PAPER sizes and
// stay legible at any scale, while the geometry obeys the chosen ratio.

import { computeFootprint, connectedRoomComponents } from '../core/geometry2d.js';
import { dimLabelCoord, edgeLineWorld } from '../core/dimline.js';
import { isMarkerConstraint, isNodeConstraint, edgeCoord, ORIGIN_ID } from '../core/constraints.js';
import { fmt, unitLabel } from '../core/units.js';
import { zoneKind } from '../core/zoneColors.js';
import { doorSwingSegments, windowCasementSegments, halfWallHatchSegments, heaterFinSegments, slidingDoorSegments, resolveApertureOrient } from '../core/apertureGlyph.js';
import { electricalRoutePoints } from '../core/electrical.js';
import { resolveOutputLayers } from './outputOptions.js';

// Injected by Vite as the source revision + UTC build time. The fallback keeps
// direct module tests and non-Vite tooling usable.
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

// True when a distance rounds to zero AT THE CURRENT DISPLAY PRECISION — such
// dimensions (coincident edges, a marker sitting on its wall) read as "0.00" and
// are pure clutter, so they are not drawn.
const displaysZero = (meters) => parseFloat(fmt(Math.abs(meters))) === 0;

// Dimension boxes are tight paper annotations. Keep the configured precision
// for fractional values, but do not spend width on a fractional part made only
// of zeros (3.00 m / 300.0 cm -> 3 / 300). Other readouts retain normal fmt().
const fmtSheetDim = (meters) => {
  const text = fmt(Math.abs(meters));
  return /^\d+\.0+$/.test(text) ? text.slice(0, text.indexOf('.')) : text;
};

// ---- page + layout constants (all mm) ----
export const PAGES = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
  letter: { w: 215.9, h: 279.4 },
};
// Round drawing ratios, finest first. The finest that fits the content wins.
const RATIOS = [20, 50, 100, 200, 500, 1000];

const MARGIN = 12;       // blank border on every side
// Three wrapped legend rows plus a compact title/scale row. A fixed reserve keeps
// every floor in a shared-scale set aligned even when their legend contents differ.
const STRIP = 34;
const DIM_RESERVE = 18;  // band on top + right where auto-stacked dims live

// dimension annotation (paper mm)
const DIM_OFFSET = 7;    // gap from geometry to the first dimension line
const DIM_TIER = 6;      // spacing between stacked dimensions on one axis
const EXT_OVER = 1.5;    // extension line overrun past the dimension line
const ARROW = 2.2;       // arrowhead length
const ARROW_H = 1;       // arrowhead half-width
const DIM_DASH = [1.4, 1];     // measured span
const LEADER_DOT = [0.1, 0.8]; // endpoint -> outside value panel
const MARKER_STACK_TOLERANCE = 0.08; // model m: one typical 8 cm fixture face, inclusive
const MARKER_STACK_ROW = 3.8;         // paper mm between rows inside a vertical fixture box
const MARKER_STACK_BOX_GAP = 1.4;     // paper mm between distinct height groups

// Monochrome print palette. Annotation domains remain distinguishable through
// line weight and dash patterns, never hue, so SVG/PDF output is printer-neutral.
const C_LINE = '#111';       // footprint outline
const C_FILL = '#ededed';    // footprint fill (rooms/solid)
const C_DIM = '#333';        // dimension lines + text
const C_DIM_BAD = '#111';    // conflicting dimension (stronger black, no color)
const C_MARK = '#111';       // marker glyphs
const C_PIN = '#111';        // marker floor-pin dimension; dashed pattern identifies the domain
const C_ELECTRICAL = '#555'; // dotted switch-to-light route
const C_ZONE = '#111';       // architectural zone symbols

const MARKER_LABELS = {
  outlet: 'Outlet', outlet_shutter: 'Shutter', outlet_aircon: 'Aircon',
  outlet_cooktop: 'Cooktop', outlet_oven: 'Oven',
  outlet_water_heater: 'Water heater', outlet_appliance: 'Appliance outlet',
  switch: 'Switch', light: 'Light', ethernet: 'Ethernet', ethernet_dual: 'Dual Ethernet',
  tv_antenna: 'TV antenna',
  camera_ethernet: 'Camera Ethernet',
  patch_panel: 'Patch panel', intercom: 'Intercom', panel: 'Panel',
};
const MARKER_RECOMMENDED_AMPS = {
  outlet_cooktop: 32,
  outlet_oven: 20,
  outlet_water_heater: 20,
  outlet_appliance: 20,
};
const ZONE_LABELS = {
  insulation: 'Insulation', door: 'Door', halfwall: 'Half wall', heater: 'Heater', sliding: 'Sliding door', window: 'Window', stairs: 'Stairs', cabinet: 'Cabinet', furniture: 'Furniture',
};
const PRINT_ZONE_KINDS = Object.keys(ZONE_LABELS);
const printableRectangles = (floor, layers = resolveOutputLayers()) => (floor.rectangles || [])
  .filter((rect) => layers.furniture || zoneKind(rect) !== 'furniture');

// Furniture constraints still drive the authored geometry, but they are working
// dimensions rather than construction dimensions and must not appear on paper.
// This applies both to structural edge pairs and marker pins anchored to a
// furniture edge. Origin/marker endpoints have no zone kind of their own.
export function constraintInvolvesFurniture(constraint, rectangles) {
  const furnitureIds = new Set((rectangles || [])
    .filter((rect) => zoneKind(rect) === 'furniture')
    .map((rect) => rect.id));
  return [constraint?.a, constraint?.b].some((endpoint) => {
    const id = endpoint?.rect?.id ?? endpoint?.rect;
    return furnitureIds.has(id);
  });
}

// True when this constraint must be dropped from output: it touches a furniture edge
// and the opt-in furnitureDims layer is off. furnitureDims only takes effect when the
// furniture itself is drawn — a dimension to an undrawn furniture edge would dangle.
function skipFurnitureConstraint(constraint, rectangles, layers) {
  if (layers.furniture && layers.furnitureDims) return false;
  return constraintInvolvesFurniture(constraint, rectangles);
}

// A structural dimension endpoint's drawable line. Like edgeLineWorld(), but the
// shared ORIGIN datum resolves to the axis line at coord 0 (it is a corner point,
// not an edge). Without this, any dimension measured FROM the origin corner — a
// natural datum for placing half walls and other zones — was dropped from the sheet
// even though DXF draws it. Marker endpoints still return null (drawn elsewhere).
function structuralDimLine(ep, rectangles) {
  if (ep?.rect === ORIGIN_ID) return { coord: 0, p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 } };
  return edgeLineWorld(ep, rectangles);
}

function localGenerationTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const valid = Number.isFinite(date.getTime()) ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}`
    + ` ${pad(valid.getHours())}:${pad(valid.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Drawing backends — both consume PAGE MILLIMETERS.
// ---------------------------------------------------------------------------

function svgBackend() {
  const parts = [];
  const esc = (s) => String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
  const dash = (d) => (d && d.length ? ` stroke-dasharray="${d.join(' ')}"` : '');
  const cap = (c) => (c ? ` stroke-linecap="${c}"` : '');
  const num = (n) => (Math.round(n * 1000) / 1000);
  return {
    parts,
    line(x0, y0, x1, y1, s = {}) {
      parts.push(`<line x1="${num(x0)}" y1="${num(y0)}" x2="${num(x1)}" y2="${num(y1)}" `
        + `stroke="${s.stroke || '#000'}" stroke-width="${s.width ?? 0.2}"${dash(s.dash)}${cap(s.cap)}/>`);
    },
    // rings = array of point-lists ([[x,y],...]); one fillable path, nonzero winding
    // (footprint outer rings and holes wind oppositely, so holes cut out).
    region(rings, s = {}) {
      const d = rings.map((r) => r.map(([x, y], i) => `${i ? 'L' : 'M'}${num(x)} ${num(y)}`).join(' ') + ' Z').join(' ');
      parts.push(`<path d="${d}" fill="${s.fill || 'none'}" stroke="${s.stroke || 'none'}" `
        + `stroke-width="${s.width ?? 0.2}" stroke-linejoin="round"/>`);
    },
    poly(pts, s = {}) { // filled polygon (arrowheads, glyph parts)
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${num(x)} ${num(y)}`).join(' ') + ' Z';
      parts.push(`<path d="${d}" fill="${s.fill || '#000'}" stroke="${s.stroke || 'none'}" stroke-width="${s.width ?? 0}"/>`);
    },
    rect(x, y, w, h, s = {}) {
      parts.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" `
        + `fill="${s.fill || 'none'}" stroke="${s.stroke || 'none'}" stroke-width="${s.width ?? 0.2}"/>`);
    },
    circle(cx, cy, r, s = {}) {
      parts.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" `
        + `fill="${s.fill || 'none'}" stroke="${s.stroke || '#000'}" stroke-width="${s.width ?? 0.2}"/>`);
    },
    text(str, x, y, s = {}) {
      const anchor = { left: 'start', center: 'middle', right: 'end' }[s.align || 'left'];
      const baseline = { alphabetic: 'alphabetic', middle: 'central', top: 'text-before-edge' }[s.baseline || 'alphabetic'];
      parts.push(`<text x="${num(x)}" y="${num(y)}" fill="${s.fill || '#000'}" `
        + `font-family="sans-serif" font-size="${s.size ?? 2.6}"${s.weight ? ` font-weight="${s.weight}"` : ''} `
        + `text-anchor="${anchor}" dominant-baseline="${baseline}">${esc(str)}</text>`);
    },
    measure(str, size) { return str.length * size * 0.55; }, // estimate; only sizes label boxes
  };
}

function canvasBackend(ctx, k) {
  const dashPx = (d) => (d || []).map((v) => v * k);
  return {
    line(x0, y0, x1, y1, s = {}) {
      ctx.strokeStyle = s.stroke || '#000';
      ctx.lineWidth = (s.width ?? 0.2) * k;
      ctx.lineCap = s.cap || 'butt';
      ctx.setLineDash(dashPx(s.dash));
      ctx.beginPath(); ctx.moveTo(x0 * k, y0 * k); ctx.lineTo(x1 * k, y1 * k); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    },
    region(rings, s = {}) {
      // One path, one subpath per ring; nonzero winding cuts the (oppositely-wound) holes.
      ctx.beginPath();
      for (const r of rings) {
        r.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
        ctx.closePath();
      }
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fill('nonzero'); }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke; ctx.lineWidth = (s.width ?? 0.2) * k;
        ctx.lineJoin = 'round'; ctx.stroke();
      }
    },
    poly(pts, s = {}) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
      ctx.closePath();
      ctx.fillStyle = s.fill || '#000'; ctx.fill();
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = (s.width ?? 0) * k; ctx.stroke(); }
    },
    rect(x, y, w, h, s = {}) {
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fillRect(x * k, y * k, w * k, h * k); }
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = (s.width ?? 0.2) * k; ctx.strokeRect(x * k, y * k, w * k, h * k); }
    },
    circle(cx, cy, r, s = {}) {
      ctx.beginPath(); ctx.arc(cx * k, cy * k, r * k, 0, Math.PI * 2);
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = (s.width ?? 0.2) * k; ctx.stroke(); }
    },
    text(str, x, y, s = {}) {
      ctx.fillStyle = s.fill || '#000';
      ctx.font = `${s.weight ? s.weight + ' ' : ''}${(s.size ?? 2.6) * k}px system-ui, sans-serif`;
      ctx.textAlign = s.align || 'left';
      ctx.textBaseline = s.baseline === 'alphabetic' ? 'alphabetic' : (s.baseline || 'alphabetic');
      ctx.fillText(str, x * k, y * k);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    },
    measure(str, size) {
      ctx.font = `${size * k}px system-ui, sans-serif`;
      return ctx.measureText(str).width / k;
    },
  };
}

// ---------------------------------------------------------------------------
// Layout: content bbox -> chosen scale -> model->page transform.
// ---------------------------------------------------------------------------

function contentBBox(floor, footprint, layers = resolveOutputLayers()) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
  for (const poly of footprint) for (const ring of poly) for (const [x, y] of ring) add(x, y);
  // Raw rect bounds too, so an all-subtract or otherwise empty footprint still frames.
  for (const r of printableRectangles(floor, layers)) { const b = r.bounds; add(b.x0, b.y0); add(b.x1, b.y1); }
  // Marker positions affect fit only when their glyphs or dimensions are visible.
  // Electrical routes are tied to markerIcons and therefore add no independent fit.
  if (layers.markerIcons || layers.markerDims) {
    for (const m of floor.markers || []) add(m.x, m.y);
  }
  // Saved dimension placement is authoritative, including a label dragged beyond
  // its two endpoints. Include those model-space locations when choosing the print
  // scale so an intentional outside label/line is not clipped off the sheet.
  const endpointCoord = (ep, axis) => {
    if (ep?.marker) return (floor.markers || []).find((m) => m.id === ep.marker)?.[axis];
    if (ep?.rect === ORIGIN_ID) return 0;
    const rectId = ep?.rect?.id ?? ep?.rect;
    const rect = floor.rectangles.find((r) => r.id === rectId);
    return rect ? edgeCoord(rect, ep.edge) : null;
  };
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance') continue;
    if (skipFurnitureConstraint(c, floor.rectangles, layers)) continue;
    if (isMarkerConstraint(c) ? !layers.markerDims : !layers.planDims) continue;
    const a = endpointCoord(c.a, c.axis), b = endpointCoord(c.b, c.axis);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const label = dimLabelCoord(c, a, b);
    if (isMarkerConstraint(c)) {
      const markerEnd = c.a?.marker ? c.a : c.b;
      const marker = (floor.markers || []).find((m) => m.id === markerEnd?.marker);
      if (!marker) continue;
      const line = c.offset != null ? c.offset : marker[c.axis === 'x' ? 'y' : 'x'];
      if (c.axis === 'x') { add(a, line); add(b, line); add(label, line); }
      else { add(line, a); add(line, b); add(line, label); }
      continue;
    }
    const la = structuralDimLine(c.a, floor.rectangles), lb = structuralDimLine(c.b, floor.rectangles);
    if (!la || !lb) continue;
    if (c.axis === 'x') {
      if (c.offset == null) { add(label, la.p0.y); continue; } // only parallel overflow affects model bbox
      const line = Math.max(la.p1.y, lb.p1.y) + c.offset;
      add(a, line); add(b, line); add(label, line);
    } else {
      if (c.offset == null) { add(la.p0.x, label); continue; }
      const line = Math.max(la.p1.x, lb.p1.x) + c.offset;
      add(line, a); add(line, b); add(line, label);
    }
  }
  if (!Number.isFinite(x0)) return null; // nothing to draw
  return { x0, y0, x1, y1 };
}

// Orientation follows authored plan geometry, not movable annotation positions.
// A dragged dimension may enlarge the scale-fitting bbox, but must never rotate
// every page—and the controller panel—between portrait and landscape.
function geometryBBox(floor, footprint, layers = resolveOutputLayers()) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  };
  for (const poly of footprint) for (const ring of poly) for (const [x, y] of ring) add(x, y);
  for (const r of printableRectangles(floor, layers)) {
    const b = r.bounds;
    add(b.x0, b.y0); add(b.x1, b.y1);
  }
  if (layers.markerIcons) {
    for (const m of floor.markers || []) add(m.x, m.y);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

function pageDimensions(page, orientation) {
  return orientation === 'landscape'
    ? { w: Math.max(page.w, page.h), h: Math.min(page.w, page.h) }
    : { w: Math.min(page.w, page.h), h: Math.max(page.w, page.h) };
}

function orientationCapacity(bbox, page, orientation) {
  const oriented = pageDimensions(page, orientation);
  const cw = Math.max(bbox.x1 - bbox.x0, 1e-3);
  const ch = Math.max(bbox.y1 - bbox.y0, 1e-3);
  const availW = oriented.w - 2 * MARGIN - DIM_RESERVE;
  const availH = oriented.h - 2 * MARGIN - STRIP - DIM_RESERVE;
  return Math.min(availW / cw, availH / ch);
}

function bestOrientation(bbox, page) {
  return orientationCapacity(bbox, page, 'landscape') > orientationCapacity(bbox, page, 'portrait')
    ? 'landscape' : 'portrait';
}

function layoutSheet(bbox, opts) {
  const page = PAGES[opts.page] || PAGES.a4;
  const cw = Math.max(bbox.x1 - bbox.x0, 1e-3);
  const ch = Math.max(bbox.y1 - bbox.y0, 1e-3);
  // Pick the orientation by actual usable-space fit (the asymmetric title/dim
  // reserves mean a raw content-vs-paper aspect comparison is not quite optimal).
  const orientation = opts.orientation || bestOrientation(bbox, page);
  const oriented = pageDimensions(page, orientation);
  const pageW = oriented.w, pageH = oriented.h;

  const availW = pageW - 2 * MARGIN - DIM_RESERVE;         // right band reserved for y-dims
  const availH = pageH - 2 * MARGIN - STRIP - DIM_RESERVE; // top band reserved for x-dims
  const availX0 = MARGIN;
  const availY0 = MARGIN + DIM_RESERVE;

  // Pick the finest round ratio that fits; else fit exactly and report it.
  let mmPerM = 0, ratio = 0, exact = false;
  if (Number.isFinite(opts.mmPerM) && opts.mmPerM > 0) {
    mmPerM = opts.mmPerM;
    ratio = 1000 / mmPerM;
    exact = true;
  } else if (opts.ratio && RATIOS.includes(opts.ratio)) { ratio = opts.ratio; mmPerM = 1000 / ratio; }
  else {
    for (const r of RATIOS) {
      const m = 1000 / r;
      if (cw * m <= availW && ch * m <= availH) { ratio = r; mmPerM = m; break; }
    }
    if (!ratio) { mmPerM = Math.min(availW / cw, availH / ch); ratio = Math.round(1000 / mmPerM); exact = true; }
  }

  const contentW = cw * mmPerM, contentH = ch * mmPerM;
  const offX = availX0 + (availW - contentW) / 2;
  const offTopY = availY0 + (availH - contentH) / 2;
  const X = (mx) => offX + (mx - bbox.x0) * mmPerM;
  const Y = (my) => offTopY + (bbox.y1 - my) * mmPerM;

  return { page: { w: pageW, h: pageH }, orientation, mmPerM, ratio, exact, X, Y, bbox };
}

// ---------------------------------------------------------------------------
// Drawing pieces
// ---------------------------------------------------------------------------

function drawFootprint(be, L, footprint) {
  if (!footprint.length) return;
  const rings = [];
  for (const poly of footprint) for (const ring of poly) rings.push(ring.map(([x, y]) => [L.X(x), L.Y(y)]));
  be.region(rings, { fill: C_FILL, stroke: C_LINE, width: 0.5 });
}

// Black-and-white architectural symbols for the semantic subtract zones. These
// sit over the corresponding cutouts in the computed footprint so a door,
// window, stair or cabinet no longer prints as an anonymous rectangular hole.
// The same function draws the compact legend samples below.
function drawZoneGlyph(be, x, y, w, h, kind, hingeEnd = 'lo', compact = false, perp = 1, over = 0) {
  if (!(w > 0 && h > 0)) return;
  const x1 = x + w, y1 = y + h;
  const horizontal = w >= h;
  const line = (ax, ay, bx, by, width = 0.18) =>
    be.line(ax, ay, bx, by, { stroke: C_ZONE, width });
  // Draw a shared box-space segment list at the glyph's page origin.
  const segs = (list, width) => { for (const [ax, ay, bx, by] of list) line(x + ax, y + ay, x + bx, y + by, width); };

  be.rect(x, y, w, h, { fill: '#fff', stroke: C_ZONE, width: 0.25 });

  if (kind === 'door') {
    // Real architectural door: hinge-side leaf + swing arc (sampled — no arc primitive).
    // In the compact legend, cap the arc reach to the sample height so it can't
    // overflow into the row above.
    segs(doorSwingSegments(w, h, hingeEnd, { perp, reach: compact ? Math.min(w, h) : undefined }), 0.22);
  } else if (kind === 'halfwall') {
    // Inverse of a door: a poché of uniform diagonal hatch = solid (but low) wall.
    segs(halfWallHatchSegments(w, h), 0.13);
  } else if (kind === 'heater') {
    // Wall-mounted radiator: outline + fins (the conventional heater symbol).
    segs(heaterFinSegments(w, h), 0.13);
  } else if (kind === 'sliding') {
    // Surface slider: panel (opening + 10 cm) at rest + open, rail, slide arrow.
    segs(slidingDoorSegments(w, h, hingeEnd, { over, perp }), 0.16);
  } else if (kind === 'window') {
    // Glazing panes + a casement "V" pointing at the hinge (which side opens).
    segs(windowCasementSegments(w, h, hingeEnd));
  } else if (kind === 'insulation') {
    // Repeating diagonal batts distinguish insulation from a plain wall cutout.
    const count = 6;
    for (let i = 0; i < count; i++) {
      if (horizontal) {
        const xa = x + w * i / count, xb = x + w * (i + 1) / count;
        line(xa, i % 2 ? y : y1, xb, i % 2 ? y1 : y, 0.13);
      } else {
        const ya = y + h * i / count, yb = y + h * (i + 1) / count;
        line(i % 2 ? x : x1, ya, i % 2 ? x1 : x, yb, 0.13);
      }
    }
  } else if (kind === 'stairs') {
    // Five tread divisions plus an arrow showing the run direction.
    for (let i = 1; i < 6; i++) {
      if (horizontal) line(x + (w * i) / 6, y, x + (w * i) / 6, y1, 0.13);
      else line(x, y + (h * i) / 6, x1, y + (h * i) / 6, 0.13);
    }
    if (horizontal) {
      const cy = y + h / 2, tip = x + w * 0.82;
      line(x + w * 0.18, cy, tip, cy, 0.25);
      line(tip, cy, x + w * 0.68, y + h * 0.25, 0.25);
      line(tip, cy, x + w * 0.68, y + h * 0.75, 0.25);
    } else {
      const cx = x + w / 2, tip = y + h * 0.18;
      line(cx, y + h * 0.82, cx, tip, 0.25);
      line(cx, tip, x + w * 0.25, y + h * 0.32, 0.25);
      line(cx, tip, x + w * 0.75, y + h * 0.32, 0.25);
    }
  } else if (kind === 'cabinet') {
    // Cabinet carcass/front: crossed diagonals distinguish it from openings.
    line(x, y, x1, y1);
    line(x, y1, x1, y);
  } else if (kind === 'furniture') {
    // Loose furniture: a simple inset footprint, distinct from fixed cabinetry.
    const ix = Math.min(w * 0.18, 1.2), iy = Math.min(h * 0.18, 1.2);
    if (w > ix * 2 && h > iy * 2) be.rect(x + ix, y + iy, w - ix * 2, h - iy * 2,
      { fill: 'none', stroke: C_ZONE, width: 0.16 });
  }
}

function drawZones(be, L, floor, layers) {
  for (const rect of floor.rectangles) {
    const kind = zoneKind(rect);
    if (!PRINT_ZONE_KINDS.includes(kind)) continue;
    if (kind === 'furniture' && !layers.furniture) continue;
    const b = rect.bounds;
    const sx0 = L.X(b.x0), sx1 = L.X(b.x1);
    const sy0 = L.Y(b.y0), sy1 = L.Y(b.y1);
    const { hingeEnd, perp } = resolveApertureOrient(rect, sx0, sx1, sy0, sy1);
    // Sliding panel overhangs the opening by a fixed 10 cm; convert to page units.
    const over = kind === 'sliding' ? 0.10 * Math.abs(L.X(1) - L.X(0)) : 0;
    drawZoneGlyph(
      be,
      Math.min(sx0, sx1), Math.min(sy0, sy1),
      Math.abs(sx1 - sx0), Math.abs(sy1 - sy0),
      kind, hingeEnd, false, perp, over,
    );
  }
}

function drawArrow(be, x, y, dir, axis) {
  const pts = axis === 'x'
    ? [[x, y], [x + dir * ARROW, y - ARROW_H], [x + dir * ARROW, y + ARROW_H]]
    : [[x, y], [x - ARROW_H, y + dir * ARROW], [x + ARROW_H, y + dir * ARROW]];
  be.poly(pts, { fill: C_DIM });
}

function drawDimLabel(be, text, cx, cy, color, textColor = color) {
  const size = 2.6;
  const w = be.measure(text, size) + 2.4;
  const h = 3.8;
  be.rect(cx - w / 2, cy - h / 2, w, h, { fill: '#fff', stroke: color, width: 0.12 });
  be.text(text, cx, cy + 0.15, { fill: textColor, size, align: 'center', baseline: 'middle' });
}

// When a value box is dragged beyond the measured endpoints (labelT outside 0..1),
// extend the dimension line from the nearer endpoint out to the label so it never
// floats disconnected. `along*` are the on-axis screen coords, `perp` the fixed
// cross-axis coord. The leader is dotted so it cannot be mistaken for the dashed
// span where the distance applies. No-op when the label sits between the endpoints
// — the measured span already reaches it.
function drawLabelLeader(be, along0, along1, alongLabel, perp, axis, style) {
  const lo = Math.min(along0, along1), hi = Math.max(along0, along1);
  let from;
  if (alongLabel < lo) from = lo;
  else if (alongLabel > hi) from = hi;
  else return;
  const dotted = { ...style, dash: LEADER_DOT, cap: 'round' };
  if (axis === 'x') be.line(from, perp, alongLabel, perp, dotted);
  else be.line(perp, from, perp, alongLabel, dotted);
}

// A small white knockout chip for a value that sits over the footprint fill (marker
// heights) — keeps it readable and stops it disappearing into the gray.
function drawTextChip(be, text, cx, cy, size = 1.9, color = C_MARK) {
  const w = be.measure(text, size) + 1.4;
  const h = size + 1.2;
  be.rect(cx - w / 2, cy - h / 2, w, h, { fill: '#fff', stroke: '#c8c8c8', width: 0.08 });
  be.text(text, cx, cy + size * 0.05, { fill: color, size, align: 'center', baseline: 'middle' });
}

function drawDimensions(be, L, floor, layers) {
  const rects = floor.rectangles;
  let xTier = 0, yTier = 0;
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance' || isMarkerConstraint(c) || isNodeConstraint(c)) continue;
    if (skipFurnitureConstraint(c, rects, layers)) continue;
    if (displaysZero(c.value)) continue; // a 0.00 dimension is clutter
    const la = structuralDimLine(c.a, rects);
    const lb = structuralDimLine(c.b, rects);
    if (!la || !lb) continue; // marker refs have no drawable edge; origin resolves to coord 0
    const color = c.conflict ? C_DIM_BAD : C_DIM;
    const label = fmtSheetDim(c.value);

    if (c.axis === 'x') {
      const sxa = L.X(la.coord), sxb = L.X(lb.coord);
      const topModel = Math.max(la.p1.y, lb.p1.y);
      // A saved AR offset is authoritative. With no saved placement, use the same
      // measured-edge baseline as AR and apply a paper-sized automatic gap.
      const dimY = c.offset == null
        ? L.Y(topModel) - DIM_OFFSET - (xTier++) * DIM_TIER
        : L.Y(topModel + c.offset);
      for (const l of [la, lb]) {
        const cyTop = L.Y(l.p1.y), cyBot = L.Y(l.p0.y);
        const conn = Math.abs(dimY - cyTop) <= Math.abs(dimY - cyBot) ? cyTop : cyBot;
        const sx = L.X(l.coord);
        be.line(sx, conn, sx, dimY + Math.sign(dimY - conn) * EXT_OVER, { stroke: color, width: 0.1 });
      }
      const lx = L.X(dimLabelCoord(c, la.coord, lb.coord));
      be.line(sxa, dimY, sxb, dimY, { stroke: color, width: 0.18, dash: DIM_DASH });
      const dir = Math.sign(sxb - sxa) || 1;
      const arrowDir = Math.abs(sxb - sxa) < ARROW * 2 ? -dir : dir;
      drawArrow(be, sxa, dimY, arrowDir, 'x');
      drawArrow(be, sxb, dimY, -arrowDir, 'x');
      drawLabelLeader(be, sxa, sxb, lx, dimY, 'x', { stroke: color, width: 0.18 });
      drawDimLabel(be, label, lx, dimY, color);
    } else {
      const sya = L.Y(la.coord), syb = L.Y(lb.coord);
      const rightModel = Math.max(la.p1.x, lb.p1.x);
      const dimX = c.offset == null
        ? L.X(rightModel) + DIM_OFFSET + (yTier++) * DIM_TIER
        : L.X(rightModel + c.offset);
      for (const l of [la, lb]) {
        const cxRight = L.X(l.p1.x), cxLeft = L.X(l.p0.x);
        const conn = Math.abs(dimX - cxRight) <= Math.abs(dimX - cxLeft) ? cxRight : cxLeft;
        const sy = L.Y(l.coord);
        be.line(conn, sy, dimX + Math.sign(dimX - conn) * EXT_OVER, sy, { stroke: color, width: 0.1 });
      }
      const ly = L.Y(dimLabelCoord(c, la.coord, lb.coord));
      be.line(dimX, sya, dimX, syb, { stroke: color, width: 0.18, dash: DIM_DASH });
      const dir = Math.sign(syb - sya) || 1;
      const arrowDir = Math.abs(syb - sya) < ARROW * 2 ? -dir : dir;
      drawArrow(be, dimX, sya, arrowDir, 'y');
      drawArrow(be, dimX, syb, -arrowDir, 'y');
      drawLabelLeader(be, sya, syb, ly, dimX, 'y', { stroke: color, width: 0.18 });
      drawDimLabel(be, label, dimX, ly, color);
    }
  }
}

// Marker floor pins: the surveyed distance from a wall (or the origin) to a marker's
// plan coordinate — i.e. WHERE to place the fixture. One-way pins (isMarkerConstraint),
// drawn in a distinct color, terminating at the marker so the glyph reads as the target.
function drawMarkerPins(be, L, floor, layers) {
  const rects = floor.rectangles;
  const markers = floor.markers || [];
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance' || !isMarkerConstraint(c)) continue;
    if (skipFurnitureConstraint(c, rects, layers)) continue;
    if (displaysZero(c.value)) continue; // marker sits on the wall — nothing to place-measure
    const markerEnd = c.b?.marker ? c.b : c.a;
    const refEnd = c.b?.marker ? c.a : c.b;
    const m = markers.find((mm) => mm.id === markerEnd.marker);
    if (!m) continue;
    // Reference coordinate on this axis: the origin line (0) or the wall edge.
    let refCoord;
    if (refEnd.rect === ORIGIN_ID) refCoord = 0;
    else {
      const rr = rects.find((r) => r.id === refEnd.rect);
      if (!rr) continue; // dangling ref
      refCoord = edgeCoord(rr, refEnd.edge);
    }
    const label = fmtSheetDim(c.value);
    if (c.axis === 'x') {
      const y = L.Y(c.offset != null ? c.offset : m.y), xa = L.X(refCoord), xb = L.X(m.x);
      const lx = L.X(dimLabelCoord(c, refCoord, m.x));
      // Thin solid witness lines tie the offset dimension back to both measured
      // objects. The measured span remains dashed and an external label leader
      // remains dotted, preserving the three distinct drafting roles.
      const markerY = L.Y(m.y);
      be.line(xb, markerY, xb, y + Math.sign(y - markerY) * EXT_OVER,
        { stroke: C_PIN, width: 0.1 });
      if (refEnd.rect !== ORIGIN_ID) {
        const refLine = edgeLineWorld(refEnd, rects);
        if (refLine) {
          const refA = L.Y(refLine.p0.y), refB = L.Y(refLine.p1.y);
          const refY = Math.abs(y - refA) <= Math.abs(y - refB) ? refA : refB;
          be.line(xa, refY, xa, y + Math.sign(y - refY) * EXT_OVER,
            { stroke: C_PIN, width: 0.1 });
        }
      }
      be.line(xa, y, xb, y, { stroke: C_PIN, width: 0.15, dash: DIM_DASH });
      const dir = Math.sign(xb - xa) || 1;
      const arrowDir = Math.abs(xb - xa) < ARROW * 2 ? -dir : dir;
      drawArrow(be, xa, y, arrowDir, 'x');
      drawArrow(be, xb, y, -arrowDir, 'x');
      drawLabelLeader(be, xa, xb, lx, y, 'x', { stroke: C_PIN, width: 0.15 });
      drawDimLabel(be, label, lx, y, C_PIN, C_MARK);
    } else {
      const x = L.X(c.offset != null ? c.offset : m.x), ya = L.Y(refCoord), yb = L.Y(m.y);
      const ly = L.Y(dimLabelCoord(c, refCoord, m.y));
      const markerX = L.X(m.x);
      be.line(markerX, yb, x + Math.sign(x - markerX) * EXT_OVER, yb,
        { stroke: C_PIN, width: 0.1 });
      if (refEnd.rect !== ORIGIN_ID) {
        const refLine = edgeLineWorld(refEnd, rects);
        if (refLine) {
          const refA = L.X(refLine.p0.x), refB = L.X(refLine.p1.x);
          const refX = Math.abs(x - refA) <= Math.abs(x - refB) ? refA : refB;
          be.line(refX, ya, x + Math.sign(x - refX) * EXT_OVER, ya,
            { stroke: C_PIN, width: 0.1 });
        }
      }
      be.line(x, ya, x, yb, { stroke: C_PIN, width: 0.15, dash: DIM_DASH });
      const dir = Math.sign(yb - ya) || 1;
      const arrowDir = Math.abs(yb - ya) < ARROW * 2 ? -dir : dir;
      drawArrow(be, x, ya, arrowDir, 'y');
      drawArrow(be, x, yb, -arrowDir, 'y');
      drawLabelLeader(be, ya, yb, ly, x, 'y', { stroke: C_PIN, width: 0.15 });
      drawDimLabel(be, label, x, ly, C_PIN, C_MARK);
    }
  }
}

// A per-type glyph, drawn centered at (cx,cy) in page mm. Shared by the plan and
// the legend so a symbol always reads the same in both.
export function drawMarkerGlyph(be, cx, cy, type, size = 2.6) {
  const r = size / 2;
  if (type === 'switch') {
    be.rect(cx - r, cy - r, size, size, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.line(cx - r * 0.5, cy + r * 0.5, cx + r * 0.5, cy - r * 0.5, { stroke: C_MARK, width: 0.25 }); // rocker
  } else if (type === 'light') {
    be.circle(cx, cy, r, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.line(cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7, { stroke: C_MARK, width: 0.2 });
    be.line(cx - r * 0.7, cy + r * 0.7, cx + r * 0.7, cy - r * 0.7, { stroke: C_MARK, width: 0.2 });
  } else if (type === 'tv_antenna') {
    // Coaxial TV outlet with the familiar V-shaped aerial crown.
    be.circle(cx, cy + r * 0.15, r * 0.72, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.circle(cx, cy + r * 0.15, r * 0.25, { fill: '#fff', stroke: C_MARK, width: 0.16 });
    be.line(cx, cy - r * 0.57, cx - r * 0.52, cy - r, { stroke: C_MARK, width: 0.18 });
    be.line(cx, cy - r * 0.57, cx + r * 0.52, cy - r, { stroke: C_MARK, width: 0.18 });
  } else if (type === 'ethernet') {
    // Front view of an RJ45 socket: the eight contacts and the wider latch
    // recess make this read as a network port instead of a generic rectangle.
    const top = cy - r * 0.72;
    const bottom = cy + r * 0.68;
    be.rect(cx - r, top, size, bottom - top, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.poly([
      [cx - r * 0.72, cy - r * 0.45],
      [cx + r * 0.72, cy - r * 0.45],
      [cx + r * 0.72, cy + r * 0.22],
      [cx + r * 0.38, cy + r * 0.22],
      [cx + r * 0.38, cy + r * 0.5],
      [cx - r * 0.38, cy + r * 0.5],
      [cx - r * 0.38, cy + r * 0.22],
      [cx - r * 0.72, cy + r * 0.22],
    ], { fill: '#fff', stroke: C_MARK, width: 0.16 });
    for (let i = 0; i < 8; i++) {
      const x = cx - r * 0.56 + i * (r * 1.12 / 7);
      be.line(x, cy - r * 0.36, x, cy - r * 0.05, { stroke: C_MARK, width: 0.1 });
    }
  } else if (type === 'ethernet_dual') {
    // Two RJ45 faces in a single fixture glyph.
    for (const dx of [-0.52, 0.52]) {
      const px = cx + r * dx;
      be.rect(px - r * 0.44, cy - r * 0.72, r * 0.88, r * 1.4,
        { fill: '#fff', stroke: C_MARK, width: 0.16 });
      be.poly([
        [px - r * 0.3, cy - r * 0.42], [px + r * 0.3, cy - r * 0.42],
        [px + r * 0.3, cy + r * 0.22], [px + r * 0.16, cy + r * 0.22],
        [px + r * 0.16, cy + r * 0.48], [px - r * 0.16, cy + r * 0.48],
        [px - r * 0.16, cy + r * 0.22], [px - r * 0.3, cy + r * 0.22],
      ], { fill: '#fff', stroke: C_MARK, width: 0.12 });
      for (let i = 0; i < 4; i++) {
        const contactX = px - r * 0.2 + i * (r * 0.4 / 3);
        be.line(contactX, cy - r * 0.34, contactX, cy - r * 0.08,
          { stroke: C_MARK, width: 0.08 });
      }
    }
  } else if (type === 'camera_ethernet') {
    // Network (PoE/IP) camera: a bullet-camera body with a front lens and a short
    // ethernet cable tail with an RJ45 plug, so it reads as a camera on the network.
    be.rect(cx - r * 0.7, cy - r * 0.4, r * 1.2, r * 0.8, { fill: '#fff', stroke: C_MARK, width: 0.18 }); // body
    be.circle(cx + r * 0.5, cy, r * 0.34, { fill: '#fff', stroke: C_MARK, width: 0.16 });                 // lens
    be.circle(cx + r * 0.5, cy, r * 0.14, { fill: C_MARK, stroke: C_MARK, width: 0.08 });                 // aperture
    be.line(cx - r * 0.2, cy + r * 0.4, cx - r * 0.2, cy + r * 0.82, { stroke: C_MARK, width: 0.14 });    // cable tail
    be.rect(cx - r * 0.34, cy + r * 0.82, r * 0.28, r * 0.22, { fill: '#fff', stroke: C_MARK, width: 0.1 }); // RJ45 plug
  } else if (type === 'patch_panel') {
    // Rack patch panel with two compact banks of ports.
    be.rect(cx - r, cy - r * 0.68, size, r * 1.36, { fill: '#fff', stroke: C_MARK, width: 0.18 });
    for (const dy of [-0.3, 0.3]) {
      for (const dx of [-0.6, -0.2, 0.2, 0.6]) {
        be.rect(cx + r * dx - r * 0.13, cy + r * dy - r * 0.13, r * 0.26, r * 0.26,
          { fill: '#fff', stroke: C_MARK, width: 0.1 });
      }
    }
    be.circle(cx - r * 0.88, cy, r * 0.06, { fill: C_MARK, stroke: C_MARK, width: 0.05 });
    be.circle(cx + r * 0.88, cy, r * 0.06, { fill: C_MARK, stroke: C_MARK, width: 0.05 });
  } else if (type === 'outlet_shutter') {
    // Circular outlet family outline containing unmistakable shutter slats and
    // a travel arrow. It remains legible in compact stacked-marker boxes.
    be.circle(cx, cy, r, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    for (const dy of [-0.42, -0.12, 0.18, 0.48]) {
      be.line(cx - r * 0.58, cy + r * dy, cx + r * 0.32, cy + r * dy,
        { stroke: C_MARK, width: 0.16 });
    }
    be.line(cx + r * 0.58, cy - r * 0.5, cx + r * 0.58, cy + r * 0.45,
      { stroke: C_MARK, width: 0.16 });
    be.line(cx + r * 0.58, cy + r * 0.45, cx + r * 0.4, cy + r * 0.22,
      { stroke: C_MARK, width: 0.16 });
  } else if (type === 'outlet_aircon') {
    // Fixed HVAC supply: a SQUARE housing (never the round socket outline) marks it as
    // a service point rather than a power outlet; snowflake + cable tail inside.
    be.rect(cx - r, cy - r, size, size, { fill: '#fff', stroke: C_MARK, width: 0.18 });
    for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3]) {
      const dx = Math.cos(angle) * r * 0.58, dy = Math.sin(angle) * r * 0.58;
      be.line(cx - dx, cy - r * 0.18 - dy, cx + dx, cy - r * 0.18 + dy, { stroke: C_MARK, width: 0.17 });
    }
    be.line(cx, cy + r * 0.4, cx, cy + r * 0.82, { stroke: C_MARK, width: 0.17 });
    be.line(cx, cy + r * 0.82, cx + r * 0.5, cy + r * 0.82, { stroke: C_MARK, width: 0.17 });
    be.circle(cx + r * 0.67, cy + r * 0.82, r * 0.17, { fill: '#fff', stroke: C_MARK, width: 0.15 });
  } else if (type === 'outlet_cooktop') {
    be.circle(cx, cy, r, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    for (const [dx, dy] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]])
      be.circle(cx + r * dx, cy + r * dy, r * 0.22, { fill: '#fff', stroke: C_MARK, width: 0.15 });
  } else if (type === 'outlet_oven') {
    be.circle(cx, cy, r, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.rect(cx - r * 0.55, cy - r * 0.68, r * 1.1, r * 1.36, { fill: '#fff', stroke: C_MARK, width: 0.15 });
    be.line(cx - r * 0.48, cy - r * 0.4, cx + r * 0.48, cy - r * 0.4, { stroke: C_MARK, width: 0.12 });
    be.circle(cx, cy + r * 0.18, r * 0.32, { fill: '#fff', stroke: C_MARK, width: 0.14 });
  } else if (type === 'outlet_water_heater') {
    be.rect(cx - r * 0.55, cy - r * 0.88, r * 1.1, r * 1.76, { fill: '#fff', stroke: C_MARK, width: 0.18 });
    be.circle(cx, cy + r * 0.08, r * 0.34, { fill: '#fff', stroke: C_MARK, width: 0.16 });
    be.line(cx, cy - r * 0.45, cx - r * 0.2, cy, { stroke: C_MARK, width: 0.14 });
    be.line(cx - r * 0.2, cy, cx, cy + r * 0.28, { stroke: C_MARK, width: 0.14 });
  } else if (type === 'outlet_appliance') {
    // Circular outlet convention; the inset machine/drum communicates its use.
    be.circle(cx, cy, r, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.rect(cx - r * 0.52, cy - r * 0.65, r * 1.04, r * 1.3, { fill: '#fff', stroke: C_MARK, width: 0.14 });
    be.circle(cx, cy + r * 0.12, r * 0.34, { fill: '#fff', stroke: C_MARK, width: 0.14 });
    be.circle(cx - r * 0.34, cy - r * 0.42, r * 0.07, { fill: C_MARK, stroke: C_MARK, width: 0.06 });
  } else if (type === 'panel') {
    // Consumer unit: enclosure with a row of breaker modules.
    be.rect(cx - r * 0.82, cy - r * 0.7, r * 1.64, r * 1.4, { fill: '#fff', stroke: C_MARK, width: 0.18 });
    for (const dx of [-0.42, 0, 0.42])
      be.rect(cx + r * dx - r * 0.08, cy - r * 0.28, r * 0.16, r * 0.56, { fill: '#fff', stroke: C_MARK, width: 0.1 });
  } else if (type === 'intercom') {
    be.rect(cx - r * 0.68, cy - r, r * 1.36, r * 2, { fill: '#fff', stroke: C_MARK, width: 0.18 });
    be.rect(cx - r * 0.48, cy - r * 0.72, r * 0.96, r * 0.68, { fill: '#fff', stroke: C_MARK, width: 0.14 });
    for (const dx of [-0.42, -0.14, 0.14, 0.42])
      be.circle(cx + r * dx, cy + r * 0.34, r * 0.055, { fill: C_MARK, stroke: C_MARK, width: 0.06 });
    be.circle(cx + r * 0.38, cy + r * 0.7, r * 0.14, { fill: '#fff', stroke: C_MARK, width: 0.13 });
  } else { // outlet (default): French Type E — round socket, two round contacts, top earth pin
    be.circle(cx, cy, r, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.circle(cx - r * 0.42, cy + r * 0.12, r * 0.2, { fill: C_MARK, stroke: C_MARK, width: 0.1 }); // line
    be.circle(cx + r * 0.42, cy + r * 0.12, r * 0.2, { fill: C_MARK, stroke: C_MARK, width: 0.1 }); // neutral
    be.circle(cx, cy - r * 0.44, r * 0.18, { fill: '#fff', stroke: C_MARK, width: 0.2 });          // earth pin
  }
}

// Connected-component clustering: an item joins a group when it is within the
// threshold of any member, including transitively. Thus heights 117, 109, 101 cm
// form one box through two inclusive 8 cm neighbor links, even though the two
// endpoints are 16 cm apart.
function connectedClusters(items, within) {
  const groups = [];
  const assigned = new Set();
  for (let seed = 0; seed < items.length; seed++) {
    if (assigned.has(seed)) continue;
    const indices = [seed];
    const group = [];
    assigned.add(seed);
    while (indices.length) {
      const index = indices.shift();
      group.push(items[index]);
      for (let candidate = 0; candidate < items.length; candidate++) {
        if (assigned.has(candidate) || !within(items[index], items[candidate])) continue;
        assigned.add(candidate);
        indices.push(candidate);
      }
    }
    groups.push(group);
  }
  return groups;
}

const markerHeight = (marker) => (Number.isFinite(marker.z) ? marker.z : 0);

// One plan-position callout may contain several separate white boxes. Markers
// share a box only when their complete 3D positions are within 8 cm inclusive: horizontal
// neighbors at one height produce a horizontal box, while vertical neighbors at
// different heights produce a vertical box with one height per row.
function groupFixtureBoxes(markers, tolerance) {
  // A true vertical installation shares one physical face position, so keep all
  // of its fixtures in one enclosure even when their heights are far apart. A
  // separator records every break between the inclusive 8 cm height clusters.
  // This reads as one installation without implying that 248 cm and 24 cm are
  // members of the same tight fixture cluster.
  if (markers.length > 1
      && markers.every((marker) => marker.x === markers[0].x && marker.y === markers[0].y)) {
    const ordered = [...markers].sort((a, b) => markerHeight(b) - markerHeight(a));
    const separators = [];
    for (let i = 1; i < ordered.length; i++) {
      if (markerHeight(ordered[i - 1]) - markerHeight(ordered[i]) > tolerance + 1e-9) {
        separators.push(i);
      }
    }
    return [{
      orientation: 'vertical',
      markers: ordered,
      maxZ: markerHeight(ordered[0]),
      separators,
    }];
  }
  const boxes = connectedClusters(markers, (a, b) => Math.hypot(
    a.x - b.x, a.y - b.y, markerHeight(a) - markerHeight(b),
  ) <= tolerance + 1e-9).map((members) => {
    const maxZ = Math.max(...members.map(markerHeight));
    const horizontal = members.every((marker) => markerHeight(marker) === markerHeight(members[0]));
    const ordered = [...members];
    if (horizontal) {
      const xs = ordered.map((m) => m.x), ys = ordered.map((m) => m.y);
      const along = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y';
      ordered.sort((a, b) => a[along] - b[along]);
    } else {
      ordered.sort((a, b) => markerHeight(b) - markerHeight(a));
    }
    return { orientation: horizontal ? 'horizontal' : 'vertical', markers: ordered, maxZ };
  });
  return boxes.sort((a, b) => b.maxZ - a.maxZ);
}

// A vertical fixture stack requires STRICT plan coincidence: both x and y must be
// exactly equal. This prevents fixtures on opposite faces of a thin wall (for
// example 7 cm apart) from sharing a callout. Side-by-side fixtures may still form
// a horizontal stack only when their heights match exactly and successive plan
// neighbors are within the inclusive 8 cm face-width threshold. Both relationships
// form connected components, so a row may extend through several qualifying links.
export function groupFixtureStacks(markers, tolerance = MARKER_STACK_TOLERANCE) {
  const samePlanPosition = (a, b) => a.x === b.x && a.y === b.y;
  const sameHeight = (a, b) => markerHeight(a) === markerHeight(b);
  const groups = connectedClusters(markers || [], (a, b) => samePlanPosition(a, b)
    || (sameHeight(a, b) && Math.hypot(a.x - b.x, a.y - b.y) <= tolerance + 1e-9));
  return groups.map((members) => {
    const markersByHeight = [...members].sort((a, b) =>
      (Number.isFinite(b.z) ? b.z : -Infinity) - (Number.isFinite(a.z) ? a.z : -Infinity));
    return {
      x: members.reduce((sum, marker) => sum + marker.x, 0) / members.length,
      y: members.reduce((sum, marker) => sum + marker.y, 0) / members.length,
      markers: markersByHeight,
      boxes: groupFixtureBoxes(markersByHeight, tolerance),
    };
  });
}

function fixtureBoxMetrics(be, box) {
  const glyphSize = 2.8;
  const padding = 0.8;
  const labelGap = 1;
  const textSize = 1.9;
  const labels = box.markers.map((marker) => Number.isFinite(marker.z) ? fmtSheetDim(marker.z) : '');
  const labelWidths = labels.map((label) => label ? be.measure(label, textSize) : 0);
  if (box.orientation === 'horizontal') {
    const glyphGap = 0.8;
    const glyphsWidth = box.markers.length * glyphSize + (box.markers.length - 1) * glyphGap;
    const labelWidth = Math.max(0, ...labelWidths);
    return {
      width: padding * 2 + glyphsWidth + (labelWidth ? labelGap + labelWidth : 0),
      height: padding * 2 + glyphSize,
      glyphSize, padding, labelGap, textSize, labels, labelWidths, glyphGap,
    };
  }
  return {
    width: padding * 2 + glyphSize + labelGap + Math.max(0, ...labelWidths),
    height: padding * 2 + glyphSize + (box.markers.length - 1) * MARKER_STACK_ROW,
    glyphSize, padding, labelGap, textSize, labels, labelWidths,
  };
}

function drawFixtureBox(be, box, metrics, x, y) {
  const { glyphSize, padding, labelGap, textSize, labels } = metrics;
  const glyphR = glyphSize / 2;
  be.rect(x, y, metrics.width, metrics.height, { fill: '#fff', stroke: C_MARK, width: 0.16 });
  if (box.orientation === 'horizontal') {
    let glyphX = x + padding + glyphR;
    const glyphY = y + metrics.height / 2;
    for (const marker of box.markers) {
      drawMarkerGlyph(be, glyphX, glyphY, marker.type, glyphSize);
      glyphX += glyphSize + metrics.glyphGap;
    }
    if (labels[0]) {
      // `glyphX` now points at the next glyph centre. Step back by the inter-glyph
      // gap and one radius to reach the last glyph's right edge before adding the
      // label gap. Omitting the radius placed the label outside its measured box.
      be.text(labels[0], glyphX - metrics.glyphGap - glyphR + labelGap, glyphY, {
        fill: C_MARK, size: textSize, align: 'left', baseline: 'middle',
      });
    }
    return;
  }

  box.markers.forEach((marker, i) => {
    const rowY = y + padding + glyphR + i * MARKER_STACK_ROW;
    const glyphX = x + padding + glyphR;
    drawMarkerGlyph(be, glyphX, rowY, marker.type, glyphSize);
    if (labels[i]) {
      be.text(labels[i], glyphX + glyphR + labelGap, rowY, {
        fill: C_MARK, size: textSize, align: 'left', baseline: 'middle',
      });
    }
  });
  for (const row of box.separators || []) {
    const separatorY = y + padding + glyphR + (row - 0.5) * MARKER_STACK_ROW;
    be.line(x + 0.45, separatorY, x + metrics.width - 0.45, separatorY,
      { stroke: C_MARK, width: 0.1 });
  }
}

function pointOnRingSegment(x, y, a, b, epsilon = 1e-7) {
  const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
  if (Math.abs(cross) > epsilon) return false;
  return x >= Math.min(a[0], b[0]) - epsilon && x <= Math.max(a[0], b[0]) + epsilon
    && y >= Math.min(a[1], b[1]) - epsilon && y <= Math.max(a[1], b[1]) + epsilon;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (pointOnRingSegment(x, y, a, b)) return true;
    const crosses = ((a[1] > y) !== (b[1] > y))
      && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInFootprint(x, y, footprint) {
  for (const polygon of footprint || []) {
    if (!polygon.length || !pointInRing(x, y, polygon[0])) continue;
    if (!polygon.slice(1).some((hole) => pointInRing(x, y, hole))) return true;
  }
  return false;
}

const clamp = (value, min, max) => min <= max ? Math.max(min, Math.min(max, value)) : value;

// Build one of four upright callout arrangements. Distinct height-group boxes are
// ALWAYS ordered vertically, highest to lowest, even when the room-aware placement
// sends the whole callout above or below its anchor. Individual boxes still express
// physical disposition: equal-height fixtures read horizontally, while differing
// heights read vertically.
function fixtureStackCandidate(side, ax, ay, metrics, L) {
  const gap = MARKER_STACK_BOX_GAP;
  const horizontalSide = side === 'left' || side === 'right';
  const placements = [];
  const totalHeight = metrics.reduce((sum, item) => sum + item.height, 0) + (metrics.length - 1) * gap;
  const maxWidth = Math.max(...metrics.map((item) => item.width));
  if (horizontalSide) {
    const dir = side === 'right' ? 1 : -1;
    const centerY = clamp(ay, MARGIN + totalHeight / 2, L.page.h - MARGIN - STRIP - totalHeight / 2);
    const spine = ax + dir * 3.2;
    let y = centerY - totalHeight / 2;
    for (const item of metrics) {
      const x = dir > 0 ? spine + 1.2 : spine - 1.2 - item.width;
      placements.push({ x, y, cx: x + item.width / 2, cy: y + item.height / 2, item });
      y += item.height + gap;
    }
    return { side, placements, spine, anchorAlong: ay };
  }

  const dir = side === 'below' ? 1 : -1;
  const centerX = clamp(ax, MARGIN + maxWidth / 2, L.page.w - MARGIN - maxWidth / 2);
  const spine = ay + dir * 3.2;
  let y = dir > 0 ? spine + 1.2 : spine - 1.2 - totalHeight;
  for (const item of metrics) {
    const x = centerX - item.width / 2;
    placements.push({ x, y, cx: x + item.width / 2, cy: y + item.height / 2, item });
    y += item.height + gap;
  }
  return { side, placements, spine };
}

function fixtureCandidateScore(candidate, stack, L, footprint) {
  let inside = 0;
  let samples = 0;
  let onPage = 0;
  for (const p of candidate.placements) {
    for (const [px, py] of [
      [p.x, p.y], [p.x + p.item.width, p.y],
      [p.x, p.y + p.item.height], [p.x + p.item.width, p.y + p.item.height],
      [p.cx, p.cy],
    ]) {
      samples++;
      if (px >= MARGIN && px <= L.page.w - MARGIN
          && py >= MARGIN && py <= L.page.h - MARGIN - STRIP) onPage++;
      const mx = stack.x + (px - L.X(stack.x)) / L.mmPerM;
      const my = stack.y - (py - L.Y(stack.y)) / L.mmPerM;
      if (pointInFootprint(mx, my, footprint)) inside++;
    }
  }
  // Room containment dominates; page fit breaks ties and remains the fallback for
  // isolated markers whose four candidate boxes are all outside the footprint.
  return inside * 100 + onPage / Math.max(samples, 1);
}

function markerHasZeroEdgeConstraint(floor, marker) {
  return (floor.constraints || []).some((constraint) => {
    if (constraint.type !== 'distance' || !isMarkerConstraint(constraint)
        || Math.abs(constraint.value) > 5e-7) return false;
    const markerEnd = constraint.a?.marker ? constraint.a : constraint.b;
    const refEnd = constraint.a?.marker ? constraint.b : constraint.a;
    return markerEnd?.marker === marker.id && refEnd?.rect && refEnd.rect !== ORIGIN_ID;
  });
}

// A zero-distance pin to a room edge tells us which face the fixture belongs to.
// This is stronger evidence than footprint sampling on an internal wall, where
// both sides can legitimately lie inside rooms and therefore receive equal scores.
function fixtureStackAttachedRoomSide(stack, floor) {
  const sides = [];
  const sideForEdge = { left: 'right', right: 'left', bottom: 'above', top: 'below' };
  const epsilon = 1e-7;
  for (const marker of stack.markers) {
    for (const constraint of floor.constraints || []) {
      if (constraint.type !== 'distance' || !isMarkerConstraint(constraint)
          || Math.abs(constraint.value) > 5e-7) continue;
      const markerEnd = constraint.a?.marker ? constraint.a : constraint.b;
      const refEnd = constraint.a?.marker ? constraint.b : constraint.a;
      if (markerEnd?.marker !== marker.id || !refEnd?.rect || refEnd.rect === ORIGIN_ID) continue;
      const rect = floor.rectangles.find((candidate) => candidate.id === refEnd.rect);
      if (rect && zoneKind(rect) === 'room' && sideForEdge[refEnd.edge]) {
        sides.push(sideForEdge[refEnd.edge]);
        continue;
      }
      const refCoord = rect ? edgeCoord(rect, refEnd.edge) : null;
      if (!Number.isFinite(refCoord)) continue;
      // The authored reference can be a door, stair, wall, etc. Find a room edge
      // coincident with that same constrained line and marker position, then use
      // the adjoining room's inward face. This covers fixtures pinned to an
      // opening drawn directly over a room boundary.
      for (const room of floor.rectangles) {
        if (zoneKind(room) !== 'room') continue;
        const b = room.bounds;
        if (constraint.axis === 'x' && Math.abs(marker.x - refCoord) <= epsilon
            && marker.y >= b.y0 - epsilon && marker.y <= b.y1 + epsilon) {
          if (Math.abs(marker.x - b.x0) <= epsilon) sides.push(sideForEdge.left);
          if (Math.abs(marker.x - b.x1) <= epsilon) sides.push(sideForEdge.right);
        } else if (constraint.axis === 'y'
            && Math.abs(marker.y - refCoord) <= epsilon
            && marker.x >= b.x0 - epsilon && marker.x <= b.x1 + epsilon) {
          if (Math.abs(marker.y - b.y0) <= epsilon) sides.push(sideForEdge.bottom);
          if (Math.abs(marker.y - b.y1) <= epsilon) sides.push(sideForEdge.top);
        }
      }
    }
  }
  if (!sides.length) return null;
  const counts = new Map();
  for (const side of sides) counts.set(side, (counts.get(side) || 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  return ranked.length === 1 || ranked[0][1] > ranked[1][1] ? ranked[0][0] : null;
}

function contextualHeightChip(be, L, marker, footprint) {
  const text = fmtSheetDim(marker.z);
  const size = 1.9;
  const width = be.measure(text, size) + 1.4;
  const height = size + 1.2;
  const ax = L.X(marker.x), ay = L.Y(marker.y);
  const glyphRadius = 1.4, gap = 0.8;
  const distanceX = glyphRadius + gap + width / 2;
  const distanceY = glyphRadius + gap + height / 2;
  const centers = {
    below: [ax, ay + distanceY],
    right: [ax + distanceX, ay],
    left: [ax - distanceX, ay],
    above: [ax, ay - distanceY],
  };
  const candidates = ['below', 'right', 'left', 'above'].map((side) => {
    const [cx, cy] = centers[side];
    return {
      side,
      placements: [{ x: cx - width / 2, y: cy - height / 2, cx, cy, item: { width, height } }],
    };
  });
  const anchor = { x: marker.x, y: marker.y };
  const candidate = candidates.reduce((best, item) =>
    fixtureCandidateScore(item, anchor, L, footprint) > fixtureCandidateScore(best, anchor, L, footprint)
      ? item : best);
  return { text, cx: candidate.placements[0].cx, cy: candidate.placements[0].cy };
}

function drawFixtureStack(be, L, stack, footprint, floor) {
  const ax = L.X(stack.x), ay = L.Y(stack.y);
  const count = stack.markers.length;
  if (count === 1) {
    const marker = stack.markers[0];
    drawMarkerGlyph(be, L.X(marker.x), L.Y(marker.y), marker.type, 2.8);
    if (Number.isFinite(marker.z)) {
      if (markerHasZeroEdgeConstraint(floor, marker)) {
        const chip = contextualHeightChip(be, L, marker, footprint);
        drawTextChip(be, chip.text, chip.cx, chip.cy, 1.9);
      } else {
        drawTextChip(be, fmtSheetDim(marker.z), L.X(marker.x), L.Y(marker.y) + 3.9, 1.9);
      }
    }
    return;
  }

  const boxes = stack.boxes;
  const metrics = boxes.map((box) => fixtureBoxMetrics(be, box));
  // Evaluate all four sides against the actual printable room footprint. This
  // naturally sends a right-wall marker left, a top-wall marker downward, etc.
  // The stable order preserves a predictable fallback when no room contains it.
  const candidates = ['right', 'left', 'below', 'above']
    .map((side) => fixtureStackCandidate(side, ax, ay, metrics, L));
  const attachedSide = fixtureStackAttachedRoomSide(stack, floor);
  const candidate = candidates.find((item) => item.side === attachedSide)
    || candidates.reduce((best, item) =>
      fixtureCandidateScore(item, stack, L, footprint) > fixtureCandidateScore(best, stack, L, footprint)
        ? item : best);

  // The bracket joins each distinct physical fixture box back to the compact
  // installation's shared plan anchor.
  be.circle(ax, ay, 0.45, { fill: '#fff', stroke: C_MARK, width: 0.2 });
  if (candidate.side === 'left' || candidate.side === 'right') {
    const dir = candidate.side === 'right' ? 1 : -1;
    const centers = candidate.placements.map((p) => p.cy);
    be.line(ax + dir * 0.45, ay, candidate.spine, ay, { stroke: C_MARK, width: 0.16 });
    be.line(candidate.spine, Math.min(...centers, ay), candidate.spine, Math.max(...centers, ay), {
      stroke: C_MARK, width: 0.16,
    });
    candidate.placements.forEach((p, i) => {
      const nearX = dir > 0 ? p.x : p.x + p.item.width;
      be.line(candidate.spine, p.cy, nearX, p.cy, { stroke: C_MARK, width: 0.16 });
      drawFixtureBox(be, boxes[i], p.item, p.x, p.y);
    });
  } else {
    const below = candidate.side === 'below';
    const nearestIndex = below ? 0 : candidate.placements.length - 1;
    const nearest = candidate.placements[nearestIndex];
    const nearY = below ? nearest.y : nearest.y + nearest.item.height;
    // Horizontal-wall callouts enter through the box face nearest the wall,
    // instead of turning into its left or right side. When legacy grouping yields
    // several boxes, join their facing horizontal edges through the vertical gaps.
    be.line(ax, ay + (below ? 0.45 : -0.45), nearest.cx, nearY,
      { stroke: C_MARK, width: 0.16 });
    for (let i = 1; i < candidate.placements.length; i++) {
      const previous = candidate.placements[i - 1];
      const current = candidate.placements[i];
      be.line(previous.cx, previous.y + previous.item.height, current.cx, current.y,
        { stroke: C_MARK, width: 0.16 });
    }
    candidate.placements.forEach((p, i) => drawFixtureBox(be, boxes[i], p.item, p.x, p.y));
  }
}

function drawMarkers(be, L, floor, footprint) {
  for (const stack of groupFixtureStacks(floor.markers)) drawFixtureStack(be, L, stack, footprint, floor);
}

// A ceiling-routed switch leg projects to its switch-to-light span in plan view;
// vertical rise/drop segments collapse onto the endpoint glyphs. Keep it dotted so
// electrical control never reads as wall or structural dimension geometry.
function drawElectricalLinks(be, L, floor) {
  for (const link of floor.electricalLinks || []) {
    if ((link.kind || 'control') !== 'control') continue; // only logical switch→light legs here
    const route = electricalRoutePoints(floor, link);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      if (a.x === b.x && a.y === b.y) continue; // vertical rise/drop collapses in plan
      be.line(L.X(a.x), L.Y(a.y), L.X(b.x), L.Y(b.y), {
        stroke: C_ELECTRICAL, width: 0.28, dash: [0.35, 0.9], cap: 'round',
      });
    }
  }
}

// One conventional floor-area chip per semantic ROOM component. Use the center
// of its largest source rectangle as a stable point inside the union; this avoids
// polygon-centroid labels falling outside an L-shaped room.
function drawRoomAreas(be, L, floor) {
  for (const component of connectedRoomComponents(floor.rectangles)) {
    const anchor = component.rectangles.reduce((largest, r) => {
      const b = r.bounds, lb = largest.bounds;
      return (b.x1 - b.x0) * (b.y1 - b.y0) > (lb.x1 - lb.x0) * (lb.y1 - lb.y0) ? r : largest;
    });
    const b = anchor.bounds;
    drawTextChip(
      be, `${component.area.toFixed(2)} m²`,
      L.X((b.x0 + b.x1) / 2), L.Y((b.y0 + b.y1) / 2),
      2.2, C_LINE,
    );
  }
}

function drawStrip(be, L, floor, opts) {
  const { page, ratio, exact } = L;
  const yBase = page.h - MARGIN - STRIP;
  const rowY = yBase + STRIP - 5; // title/scale row below the wrapped legends

  // Floor name (left) — a single label, not a full title block. The saved-revision
  // number (when the project has been saved at least once) rides alongside it as the
  // sheet's document identity.
  const floorName = opts.floorLabel?.(floor.name) || floor.name || 'Floor';
  const revision = Number(opts.revision) || 0;
  const revChip = revision > 0 ? `  ·  ${opts.revisionLabel || 'Rev'} ${revision}` : '';
  be.text(`${floorName}${revChip}`, MARGIN, yBase + 20, { fill: '#000', size: 4, weight: 'bold', baseline: 'top' });
  const generatedLabel = opts.generatedLabel || 'Generated';
  const buildLabel = opts.buildLabel || 'Build';
  const buildId = opts.buildId || BUILD_ID;
  be.text(`${generatedLabel}: ${localGenerationTime(opts.generatedAt)} · ${buildLabel}: ${buildId}`, MARGIN, yBase + 25,
    { fill: '#444', size: 2.1, baseline: 'top' });

  // Scale bar (left, below the name): a divided bar of a round metric length.
  const target = 40; // mm
  const barMeters = [0.5, 1, 2, 5, 10, 20, 50].reduce((best, v) =>
    (v * L.mmPerM <= target ? v : best), 0.5);
  const segs = 4;
  const barMM = barMeters * L.mmPerM;
  const bx = MARGIN, by = yBase + STRIP - 4;
  for (let i = 0; i < segs; i++) {
    be.rect(bx + (i * barMM) / segs, by - 1.4, barMM / segs, 1.4,
      { fill: i % 2 ? '#fff' : '#000', stroke: '#000', width: 0.1 });
  }
  be.text('0', bx, by + 2.6, { fill: '#000', size: 2.2, align: 'center', baseline: 'alphabetic' });
  be.text(`${fmt(barMeters)} ${unitLabel()}`, bx + barMM, by + 2.6, { fill: '#000', size: 2.2, align: 'center' });

  // Scale + unit caption (center).
  const ratioText = exact ? ratio.toFixed(1).replace(/\.0$/, '') : String(ratio);
  be.text(`1:${ratioText}  ·  ${unitLabel()}`, page.w / 2, rowY,
    { fill: '#000', size: 3, align: 'center', baseline: 'middle' });

  // Legends: semantic plan zones and fixture markers occupy separate row groups.
  // Greedy wrapping keeps every row inside the printable width; this matters for
  // descriptive entries such as "Aircon supply · dedicated circuit".
  const layers = resolveOutputLayers(opts);
  const markerTypes = layers.markerIcons
    ? [...new Set((floor.markers || []).map((m) => m.type))] : [];
  const zoneTypes = PRINT_ZONE_KINDS.filter((kind) =>
    (kind !== 'furniture' || layers.furniture)
    && floor.rectangles.some((rect) => zoneKind(rect) === kind));
  const markerName = opts.markerLabel || ((t) => MARKER_LABELS[t] || t);
  const markerNote = opts.markerLegendNote || ((t) => t === 'outlet_aircon' ? 'Dedicated circuit' : '');
  const zoneName = opts.zoneLabel || ((t) => ZONE_LABELS[t] || t);

  const wrapRows = (entries, widthOf) => {
    const rows = [];
    const available = page.w - 2 * MARGIN;
    for (const entry of entries) {
      entry.width = widthOf(entry);
      const row = rows[rows.length - 1];
      if (!row || row.width + entry.width > available) rows.push({ entries: [entry], width: entry.width });
      else { row.entries.push(entry); row.width += entry.width; }
    }
    return rows;
  };
  const zoneRows = wrapRows(zoneTypes.map((t) => ({ t, label: zoneName(t) })),
    (entry) => 7.4 + be.measure(entry.label, 2.2) + 2.2);
  const markerRows = wrapRows(markerTypes.map((t) => ({
      t,
      label: `${markerName(t)}${MARKER_RECOMMENDED_AMPS[t] ? ` · ${MARKER_RECOMMENDED_AMPS[t]} A` : markerNote(t) ? ` · ${markerNote(t)}` : ''}`,
    })), (entry) => 4.4 + be.measure(entry.label, 2.4) + 3);

  let legendRow = 0;
  for (const row of zoneRows) {
    let x = page.w - MARGIN - row.width;
    const y = yBase + 4 + legendRow++ * 6;
    for (const entry of row.entries) {
      drawZoneGlyph(be, x, y - 1.6, 6, 3.2, entry.t, 'lo', true);
      be.text(entry.label, x + 7.4, y,
        { fill: '#000', size: 2.2, align: 'left', baseline: 'middle' });
      x += entry.width;
    }
  }
  for (const row of markerRows) {
    let x = page.w - MARGIN - row.width;
    const y = yBase + 4 + legendRow++ * 6;
    for (const entry of row.entries) {
      drawMarkerGlyph(be, x + 2, y, entry.t, 2.6);
      be.text(entry.label, x + 4.4, y,
        { fill: '#000', size: 2.4, align: 'left', baseline: 'middle' });
      x += entry.width;
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Issue every draw call for one floor's sheet to a backend, in page mm.
 * Returns the layout (page size + chosen scale) so callers can size the output.
 */
// ---------------------------------------------------------------------------
// Change map — revision clouds + numbered delta tags vs a baseline snapshot.
// Monochrome by design (matches the sheet); the caller passes a per-floor diff
// (src/core/planDiff.js) in opts.changeMap. Everything below is in PAGE MM.
// ---------------------------------------------------------------------------
const C_REV = '#000';       // revision markup is monochrome, drawn a touch bolder
const C_GHOST = '#999';     // vanished (removed) geometry, drawn faint
const CLOUD_R = 1.6;        // scallop radius on paper (mm), a fixed annotation size
const CLOUD_OUTSET = 1.4;   // clouds sit just outside the changed region (mm)
const REV_TAG = 3.6;        // revision-triangle side (mm)
// Changed regions whose (outset) clouds would overlap or nearly touch are merged
// into one cloud for readability; this is that proximity threshold in page mm.
const CLOUD_MERGE_GAP = 2 * CLOUD_OUTSET + CLOUD_R;
// English fallback for the change-map label templates. Callers pass a localized set
// as opts.revLabels (see revLabels() in i18n.js); planSheet interpolates the
// {kind}/{name}/{from}/{to}/{value}/{unit} placeholders since it owns unit display.
const REV_TEXT_EN = {
  title: 'CHANGES',
  zoneAdded: 'Zone added ({kind})', zoneRemoved: 'Zone removed ({kind})', zoneRetyped: 'Zone {from}→{to}',
  zoneResized: 'Zone resized', zoneMoved: 'Zone moved', zoneChanged: 'Zone changed',
  markerAdded: '{name} added', markerRemoved: '{name} removed', markerMoved: '{name} moved', markerRetyped: '{from}→{to}',
  dimChanged: 'Dim {from}→{to} {unit}', dimAdded: 'Dim added {value} {unit}', dimRemoved: 'Dim removed',
};

// Quadratic bezier sample (the backends have no arc primitive; sampling as short
// line segments keeps the SVG and canvas outputs pixel-identical).
function quadPt(ax, ay, cx, cy, bx, by, t) {
  const u = 1 - t;
  return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by };
}

// One outward-bulging scallop from a→b, its control apex pushed away from the
// region center so every bump faces outward (the revision-cloud look).
function scallop(be, ax, ay, bx, by, ctrX, ctrY, style) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if ((mx - ctrX) * nx + (my - ctrY) * ny < 0) { nx = -nx; ny = -ny; } // face outward
  const cx = mx + nx * len * 0.9, cy = my + ny * len * 0.9;
  let px = ax, py = ay;
  for (let i = 1; i <= 5; i++) {
    const p = quadPt(ax, ay, cx, cy, bx, by, i / 5);
    be.line(px, py, p.x, p.y, style); px = p.x; py = p.y;
  }
}

// A revision cloud around a page-mm box; outset a little, then scallop each side.
function drawCloud(be, x0, y0, x1, y1) {
  x0 -= CLOUD_OUTSET; y0 -= CLOUD_OUTSET; x1 += CLOUD_OUTSET; y1 += CLOUD_OUTSET;
  const ctrX = (x0 + x1) / 2, ctrY = (y0 + y1) / 2;
  const pts = [];
  const edge = (ax, ay, bx, by) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (2 * CLOUD_R)));
    for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n]);
  };
  edge(x0, y0, x1, y0); edge(x1, y0, x1, y1); edge(x1, y1, x0, y1); edge(x0, y1, x0, y0);
  const style = { stroke: C_REV, width: 0.3 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    scallop(be, a[0], a[1], b[0], b[1], ctrX, ctrY, style);
  }
}

// Union-find clustering of page-mm boxes [x0,y0,x1,y1] (x0<x1, y0<y1) that overlap
// or sit within `gap` mm of each other. Returns { bbox, members } per cluster, where
// members are input indices — so a dense group (e.g. a vertical marker stack sharing
// one plan point) draws as ONE cloud AND collapses to one tag + one grouped legend
// entry instead of a pile of overlapping triangles.
function clusterBoxes(boxes, gap) {
  const parent = boxes.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const near = (a, b) => a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (near(boxes[i], boxes[j])) parent[find(i)] = find(j);
  const groups = new Map();
  boxes.forEach((box, i) => {
    const r = find(i), g = groups.get(r);
    if (!g) groups.set(r, { bbox: [...box], members: [i] });
    else {
      const b = g.bbox;
      b[0] = Math.min(b[0], box[0]); b[1] = Math.min(b[1], box[1]); b[2] = Math.max(b[2], box[2]); b[3] = Math.max(b[3], box[3]);
      g.members.push(i);
    }
  });
  return [...groups.values()];
}

// A numbered revision triangle (delta) at page-mm (x,y), keyed to the legend.
function drawRevTag(be, x, y, n) {
  const s = REV_TAG;
  be.poly([[x, y - s * 0.6], [x - s * 0.55, y + s * 0.5], [x + s * 0.55, y + s * 0.5]],
    { fill: '#fff', stroke: C_REV, width: 0.3 });
  be.text(String(n), x, y + s * 0.12, { fill: C_REV, size: 2.2, weight: 'bold', align: 'center', baseline: 'middle' });
}

// Plan-space anchor for a dimension's tag: the label midpoint along the measured
// span, at the outer edge line. Null when an endpoint has no drawable edge.
function dimAnchor(floor, c) {
  const la = edgeLineWorld(c.a, floor.rectangles);
  const lb = edgeLineWorld(c.b, floor.rectangles);
  if (!la || !lb) return null;
  return c.axis === 'x'
    ? { x: dimLabelCoord(c, la.coord, lb.coord), y: Math.max(la.p1.y, lb.p1.y) }
    : { x: Math.max(la.p1.x, lb.p1.x), y: dimLabelCoord(c, la.coord, lb.coord) };
}

// A boxed revision legend flush to the sheet's right edge — the minimum a numbered
// tag needs to mean something. Kept off the drawing's top-left so it can't obstruct
// the plan. Each row is one location: its △N is printed once, then every change at
// that location is listed under it (so a co-located stack reads as one grouped block
// instead of repeated numbers). White-filled so it sits cleanly over any geometry.
function drawRevLegend(be, rows, pageW, title = 'CHANGES') {
  const size = 2.4, lh = 4.2, pad = 2.4;
  const labels = rows.flatMap((r) => r.labels);
  const w = Math.max(be.measure(title, 2.6), ...labels.map((label) => 7 + be.measure(label, size))) + pad * 2;
  const lines = labels.length; // one line per individual change, grouped under its tag
  const h = pad * 2 + 6 + lines * lh;
  const x = pageW - w, y = MARGIN + 8; // right edge: x + w == pageW
  be.rect(x, y, w, h, { fill: '#fff', stroke: C_REV, width: 0.3 });
  be.text(title, x + pad, y + pad + 1, { fill: C_REV, size: 2.6, weight: 'bold', baseline: 'top' });
  let line = 0;
  for (const r of rows) {
    r.labels.forEach((label, i) => {
      const ry = y + pad + 7 + line * lh;
      if (i === 0) be.text(`△${r.n}`, x + pad, ry, { fill: C_REV, size, weight: 'bold', baseline: 'middle' }); // number once per location
      be.text(label, x + pad + 7, ry, { fill: C_REV, size, baseline: 'middle' });
      line += 1;
    });
  }
}

// Draw the whole change map for one floor: clouds + tags over changed geometry,
// then the keyed legend. Numbering is assigned here so tags and legend agree.
function drawChangeMap(be, L, floor, diff, layers = resolveOutputLayers(), opts = {}) {
  if (!diff) return;
  // Localized label templates + name lookups (English fallbacks keep this usable
  // standalone). fill() interpolates {placeholder} tokens per the current language.
  const R = { ...REV_TEXT_EN, ...(opts.revLabels || {}) };
  const fill = (tmpl, vars) => tmpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const kindLabel = (k) => opts.zoneLabel?.(k) || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Zone');
  const markerLabel = (type) => opts.markerLabel?.(type) || MARKER_LABELS[type] || 'Marker';
  // A zone kind is only worth flagging when the sheet actually draws it — furniture
  // is layer-gated, so its edits stay off a sheet that omits furniture.
  const zoneShown = (kind) => kind !== 'furniture' || layers.furniture;

  // Collect every change as an item, layer-filtered, BEFORE drawing so co-located
  // changes can be clustered. box = page-mm cloud region (null for dims, which carry a
  // tag only); tag = page-mm tag anchor (dims only; box items are tagged per cluster);
  // ghost = model bounds of a vanished zone to outline faintly.
  const items = [];
  const zoneBox = (b) => [L.X(b.x0), L.Y(b.y1), L.X(b.x1), L.Y(b.y0)]; // Y flips: y0<y1 in page mm
  const pushZone = (b, label, ghost = null) => items.push({ box: zoneBox(b), label, ghost });
  const pushPoint = (x, y, label) => {
    const r = 3, px = L.X(x), py = L.Y(y);
    items.push({ box: [px - r, py - r, px + r, py + r], label });
  };
  const pushDim = (anchor, label) => items.push({ box: null, tag: anchor ? [L.X(anchor.x), L.Y(anchor.y)] : null, label });

  for (const { base } of diff.rects.removed)
    if (zoneShown(base.kind)) pushZone(base.bounds, fill(R.zoneRemoved, { kind: kindLabel(base.kind) }), base.bounds);
  for (const { cur } of diff.rects.added)
    if (zoneShown(cur.kind)) pushZone(cur.bounds, fill(R.zoneAdded, { kind: kindLabel(cur.kind) }));
  for (const { cur, base, change } of diff.rects.changed) {
    if (!zoneShown(cur.kind) && !zoneShown(base.kind)) continue; // a retype touching a shown kind still counts
    const label = change === 'retyped' ? fill(R.zoneRetyped, { from: kindLabel(base.kind), to: kindLabel(cur.kind) })
      : change === 'resized' ? R.zoneResized : change === 'moved' ? R.zoneMoved : R.zoneChanged;
    pushZone(cur.bounds, label);
  }

  if (layers.markerIcons) { // no glyph on the sheet → its add/move/retype means nothing to the reader
    for (const { cur } of diff.markers.added) pushPoint(cur.x, cur.y, fill(R.markerAdded, { name: markerLabel(cur.type) }));
    for (const { base } of diff.markers.removed) pushPoint(base.x, base.y, fill(R.markerRemoved, { name: markerLabel(base.type) }));
    for (const { cur, base, change } of diff.markers.changed)
      pushPoint(cur.x, cur.y, change === 'retyped'
        ? fill(R.markerRetyped, { from: markerLabel(base.type), to: markerLabel(cur.type) })
        : fill(R.markerMoved, { name: markerLabel(cur.type) }));
  }

  if (layers.planDims) { // structural dimensions aren't drawn → don't flag their deltas
    const u = unitLabel();
    // A furniture-anchored dimension the sheet suppresses must not have its delta flagged.
    const dimShown = (c) => !skipFurnitureConstraint(c, floor.rectangles, layers);
    for (const { cur, from, to } of diff.dims.changed) if (dimShown(cur)) pushDim(dimAnchor(floor, cur), fill(R.dimChanged, { from: fmtSheetDim(from), to: fmtSheetDim(to), unit: u }));
    for (const { cur } of diff.dims.added) if (dimShown(cur)) pushDim(dimAnchor(floor, cur), fill(R.dimAdded, { value: fmtSheetDim(cur.value), unit: u }));
    for (const _ of diff.dims.removed) pushDim(null, R.dimRemoved);
  }

  if (!items.length) return; // nothing survived the layer filter: no clouds, tags, or legend

  // Faint ghosts of vanished zones, under the clouds.
  for (const { ghost: b } of items) {
    if (!b) continue;
    be.rect(L.X(b.x0), L.Y(b.y1), (b.x1 - b.x0) * L.mmPerM, (b.y1 - b.y0) * L.mmPerM, { stroke: C_GHOST, width: 0.3 });
  }

  // Cluster the boxed changes: each cluster is ONE location, so it draws one cloud,
  // one numbered tag, and one grouped legend entry (its members' labels together).
  // This is what stops a co-located stack from piling up overlapping tags.
  const boxItems = items.filter((it) => it.box);
  const rows = [];
  let n = 0;
  for (const cluster of clusterBoxes(boxItems.map((it) => it.box), CLOUD_MERGE_GAP)) {
    const [x0, y0, x1, y1] = cluster.bbox;
    drawCloud(be, x0, y0, x1, y1);
    n += 1;
    drawRevTag(be, x1 + CLOUD_OUTSET + 2, y0 - CLOUD_OUTSET, n); // one tag at the cluster corner
    rows.push({ n, labels: cluster.members.map((mi) => boxItems[mi].label) });
  }
  // Dimension changes carry no cloud box and rarely co-locate, so each keeps its own
  // tag at its edge anchor and its own single-label legend entry.
  for (const it of items) {
    if (it.box) continue;
    n += 1;
    if (it.tag) drawRevTag(be, it.tag[0], it.tag[1], n);
    rows.push({ n, labels: [it.label] });
  }
  drawRevLegend(be, rows, L.page.w, R.title);
}

function renderFloor(be, floor, opts = {}) {
  const layers = resolveOutputLayers(opts);
  const footprint = computeFootprint(printableRectangles(floor, layers));
  const bbox = contentBBox(floor, footprint, layers);
  if (!bbox) {
    // In a shared print set, even an empty floor uses the common page orientation
    // and scale so its paper edges still align with every other storey.
    if (opts.layoutBBox) {
      const L = layoutSheet(opts.layoutBBox, opts);
      be.text('(empty floor)', L.page.w / 2, L.page.h / 2, { fill: '#888', size: 4, align: 'center', baseline: 'middle' });
      drawStrip(be, L, floor, opts);
      return L;
    }
    const page = PAGES[opts.page] || PAGES.a4;
    const floorName = opts.floorLabel?.(floor.name) || floor.name || 'Floor';
    be.text(floorName, MARGIN, MARGIN + 4, { fill: '#000', size: 4, weight: 'bold', baseline: 'top' });
    be.text('(empty floor)', page.w / 2, page.h / 2, { fill: '#888', size: 4, align: 'center', baseline: 'middle' });
    return { page, ratio: 0, exact: false };
  }
  const L = layoutSheet(opts.layoutBBox || bbox, opts);
  drawFootprint(be, L, footprint);
  drawZones(be, L, floor, layers); // semantic fixed-zone/furniture symbols over the footprint
  if (layers.markerIcons) {
    drawElectricalLinks(be, L, floor); // logical switch→light control legs; conduit topology is never printed
  }
  if (layers.planDims) drawDimensions(be, L, floor, layers);
  if (layers.markerDims) drawMarkerPins(be, L, floor, layers); // fixture-placement dimensions, under the glyphs
  if (layers.area) drawRoomAreas(be, L, floor);
  if (layers.markerIcons) drawMarkers(be, L, floor, footprint); // contextual room-side callouts stay foremost
  // Revision clouds sit above the drawing but below the strip. opts.changeMap is a
  // Map<floorId, diff> (shared across a multi-floor set), so pick this floor's diff.
  const diff = opts.changeMap instanceof Map ? opts.changeMap.get(floor.id) : null;
  if (diff) drawChangeMap(be, L, floor, diff, layers, opts); // clouds/tags honor the same layer gating + localized labels
  drawStrip(be, L, floor, opts);
  return L;
}

/** One floor -> a complete, self-contained SVG document string (mm units). */
export function floorToSvg(floor, opts = {}) {
  const be = svgBackend();
  const L = renderFloor(be, floor, opts);
  const { w, h } = L.page;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" `
    + `viewBox="0 0 ${w} ${h}">`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>`
    + be.parts.join('')
    + `</svg>`;
}

/**
 * Build the common paper transform for a project. Pass the result to ANY
 * single-floor SVG/canvas render to make it exactly match that floor's page in
 * the multi-floor print set: same page, orientation, scale, and origin.
 */
export function sharedScaleSheetOptions(floors, opts = {}) {
  // Capture generation time once for the complete rendition so every page in a
  // print set—and any single-floor view made from these options—shows one date.
  const sharedOpts = {
    ...opts,
    layers: resolveOutputLayers(opts),
    generatedAt: opts.generatedAt ?? new Date(),
  };
  const page = PAGES[sharedOpts.page] || PAGES.a4;
  const floorBoxes = floors.map((floor) => {
    const footprint = computeFootprint(printableRectangles(floor, sharedOpts.layers));
    return {
      content: contentBBox(floor, footprint, sharedOpts.layers),
      geometry: geometryBBox(floor, footprint, sharedOpts.layers),
    };
  }).filter(({ content }) => content);
  if (!floorBoxes.length) return sharedOpts;
  const unionBoxes = (boxes) => boxes.reduce((all, bbox) => ({
    x0: Math.min(all.x0, bbox.x0), y0: Math.min(all.y0, bbox.y0),
    x1: Math.max(all.x1, bbox.x1), y1: Math.max(all.y1, bbox.y1),
  }), { ...boxes[0] });
  const layoutBBox = unionBoxes(floorBoxes.map(({ content }) => content));
  const geometryBoxes = floorBoxes.map(({ geometry }) => geometry).filter(Boolean);
  const orientationBBox = geometryBoxes.length ? unionBoxes(geometryBoxes) : layoutBBox;
  const orientation = sharedOpts.orientation || bestOrientation(orientationBBox, page);
  let mmPerM;
  if (Number.isFinite(sharedOpts.mmPerM) && sharedOpts.mmPerM > 0) {
    mmPerM = sharedOpts.mmPerM;
  } else {
    // Maximize the drawing, then round the scale denominator UP to a whole
    // number. Upward is deliberate: 1:56.7 -> 1:57 gets fractionally smaller
    // and remains inside the page; rounding down could clip the fitted extent.
    const fittedMmPerM = orientationCapacity(layoutBBox, page, orientation);
    const integerRatio = Math.max(1, Math.ceil(1000 / fittedMmPerM - 1e-9));
    mmPerM = 1000 / integerRatio;
  }
  return {
    ...sharedOpts,
    layoutBBox,
    orientation,
    mmPerM,
  };
}

/**
 * Render one SVG per floor through one common paper transform. A union bounding
 * box selects one orientation and the largest exact scale that fits the complete
 * stack; therefore model origin (0,0) maps to the same paper point on every page.
 */
export function floorsToSharedScaleSvgs(floors, opts = {}) {
  const sharedOpts = sharedScaleSheetOptions(floors, opts);
  return floors.map((floor) => floorToSvg(floor, sharedOpts));
}

/**
 * Render one floor onto a canvas at ~targetLongPx on its long edge. Sizes the
 * canvas to the page aspect, fills white, and draws. Returns the layout.
 * Used for the in-AR preview panel (canvas -> CanvasTexture).
 */
export function floorToCanvas(floor, canvas, opts = {}) {
  // First lay out to know the page size (needs the bbox), then size the canvas.
  const layers = resolveOutputLayers(opts);
  const footprint = computeFootprint(printableRectangles(floor, layers));
  const bbox = contentBBox(floor, footprint, layers);
  const sheetBBox = opts.layoutBBox || bbox;
  const page = sheetBBox ? layoutSheet(sheetBBox, opts).page : (PAGES[opts.page] || PAGES.a4);
  const targetLong = opts.targetPx || 2048;
  const k = targetLong / Math.max(page.w, page.h); // px per mm
  const width = Math.round(page.w * k), height = Math.round(page.h * k);
  // Preserve the backing store when orientation/aspect did not change. Assigning
  // either canvas dimension clears it and forces a texture reallocation.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const be = canvasBackend(ctx, k);
  return renderFloor(be, floor, opts);
}

/** Render one floor's complete paper sheet to a downloadable PNG image. */
export function floorToPngBlob(floor, opts = {}) {
  const canvas = document.createElement('canvas');
  floorToCanvas(floor, canvas, { targetPx: 4096, ...opts });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}
