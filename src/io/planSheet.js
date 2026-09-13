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
import { isMarkerConstraint, edgeCoord, ORIGIN_ID } from '../core/constraints.js';
import { fmt, unitLabel } from '../core/units.js';
import { zoneKind } from '../core/zoneColors.js';
import { electricalRoutePoints } from '../core/electrical.js';
import { resolveOutputLayers } from './outputOptions.js';

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
const STRIP = 16;        // bottom band: floor name, scale bar, caption, legend
const DIM_RESERVE = 18;  // band on top + right where auto-stacked dims live

// dimension annotation (paper mm)
const DIM_OFFSET = 7;    // gap from geometry to the first dimension line
const DIM_TIER = 6;      // spacing between stacked dimensions on one axis
const EXT_OVER = 1.5;    // extension line overrun past the dimension line
const ARROW = 2.2;       // arrowhead length
const ARROW_H = 1;       // arrowhead half-width
const DIM_DASH = [1.4, 1];     // measured span
const LEADER_DOT = [0.1, 0.8]; // endpoint -> outside value panel
const MARKER_STACK_TOLERANCE = 0.04; // model m: half a typical 8 cm fixture face
const MARKER_SAME_HEIGHT_EPS = 0.001; // model m: equal-height fixtures share one printed height
const MARKER_STACK_ROW = 3.8;         // paper mm between rows inside a vertical fixture box
const MARKER_STACK_BOX_GAP = 1.4;     // paper mm between distinct height groups

// print palette
const C_LINE = '#111';       // footprint outline
const C_FILL = '#ededed';    // footprint fill (rooms/solid)
const C_DIM = '#333';        // dimension lines + text
const C_DIM_BAD = '#c02626'; // conflicting dimension
const C_MARK = '#111';       // marker glyphs
const C_PIN = '#b45309';     // marker floor-pin dimension (fixture placement), distinct from structural dims
const C_ELECTRICAL = '#0284c7'; // switch-to-light control / automatic ceiling route
const C_ZONE = '#111';       // architectural zone symbols

const MARKER_LABELS = {
  outlet: 'Outlet', switch: 'Switch', light: 'Light', ethernet: 'Ethernet', wire: 'Wire',
};
const ZONE_LABELS = {
  door: 'Door', window: 'Window', stairs: 'Stairs', cabinet: 'Cabinet', furniture: 'Furniture',
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
  // Marker positions affect fit when their glyphs or dimensions are visible. Keep
  // linked endpoints too because electrical routes remain an independent layer.
  if (layers.markerIcons || layers.markerDims || (floor.electricalLinks || []).length) {
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
    if (constraintInvolvesFurniture(c, floor.rectangles)) continue;
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
    const la = edgeLineWorld(c.a, floor.rectangles), lb = edgeLineWorld(c.b, floor.rectangles);
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
  if (layers.markerIcons || (floor.electricalLinks || []).length) {
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
function drawZoneGlyph(be, x, y, w, h, kind) {
  if (!(w > 0 && h > 0)) return;
  const x1 = x + w, y1 = y + h;
  const horizontal = w >= h;
  const line = (ax, ay, bx, by, width = 0.18) =>
    be.line(ax, ay, bx, by, { stroke: C_ZONE, width });

  be.rect(x, y, w, h, { fill: '#fff', stroke: C_ZONE, width: 0.25 });

  if (kind === 'door') {
    // Door leaf: one unmistakable diagonal across the authored opening.
    line(x, y1, x1, y, 0.28);
  } else if (kind === 'window') {
    // Glazing: two parallel panes along the wall/opening's long axis.
    if (horizontal) {
      line(x, y + h * 0.35, x1, y + h * 0.35);
      line(x, y + h * 0.65, x1, y + h * 0.65);
    } else {
      line(x + w * 0.35, y, x + w * 0.35, y1);
      line(x + w * 0.65, y, x + w * 0.65, y1);
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
    drawZoneGlyph(
      be,
      Math.min(sx0, sx1), Math.min(sy0, sy1),
      Math.abs(sx1 - sx0), Math.abs(sy1 - sy0),
      kind,
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

function drawDimensions(be, L, floor) {
  const rects = floor.rectangles;
  let xTier = 0, yTier = 0;
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance' || isMarkerConstraint(c)) continue;
    if (constraintInvolvesFurniture(c, rects)) continue;
    if (displaysZero(c.value)) continue; // a 0.00 dimension is clutter
    const la = edgeLineWorld(c.a, rects);
    const lb = edgeLineWorld(c.b, rects);
    if (!la || !lb) continue; // origin/marker refs have no drawable edge (matches the 2D editor)
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
        be.line(sx, conn, sx, dimY + Math.sign(dimY - conn) * EXT_OVER, { stroke: color, width: 0.13, dash: [1, 1] });
      }
      const lx = L.X(dimLabelCoord(c, la.coord, lb.coord));
      be.line(sxa, dimY, sxb, dimY, { stroke: color, width: 0.18, dash: DIM_DASH });
      drawArrow(be, sxa, dimY, Math.sign(sxb - sxa), 'x');
      drawArrow(be, sxb, dimY, Math.sign(sxa - sxb), 'x');
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
        be.line(conn, sy, dimX + Math.sign(dimX - conn) * EXT_OVER, sy, { stroke: color, width: 0.13, dash: [1, 1] });
      }
      const ly = L.Y(dimLabelCoord(c, la.coord, lb.coord));
      be.line(dimX, sya, dimX, syb, { stroke: color, width: 0.18, dash: DIM_DASH });
      drawArrow(be, dimX, sya, Math.sign(syb - sya), 'y');
      drawArrow(be, dimX, syb, Math.sign(sya - syb), 'y');
      drawLabelLeader(be, sya, syb, ly, dimX, 'y', { stroke: color, width: 0.18 });
      drawDimLabel(be, label, dimX, ly, color);
    }
  }
}

// Marker floor pins: the surveyed distance from a wall (or the origin) to a marker's
// plan coordinate — i.e. WHERE to place the fixture. One-way pins (isMarkerConstraint),
// drawn in a distinct color, terminating at the marker so the glyph reads as the target.
function drawMarkerPins(be, L, floor) {
  const rects = floor.rectangles;
  const markers = floor.markers || [];
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance' || !isMarkerConstraint(c)) continue;
    if (constraintInvolvesFurniture(c, rects)) continue;
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
      be.line(xa, y, xb, y, { stroke: C_PIN, width: 0.15, dash: DIM_DASH });
      drawArrow(be, xa, y, Math.sign(xb - xa), 'x');
      drawArrow(be, xb, y, Math.sign(xa - xb), 'x');
      drawLabelLeader(be, xa, xb, lx, y, 'x', { stroke: C_PIN, width: 0.15 });
      drawDimLabel(be, label, lx, y, C_PIN, C_MARK);
    } else {
      const x = L.X(c.offset != null ? c.offset : m.x), ya = L.Y(refCoord), yb = L.Y(m.y);
      const ly = L.Y(dimLabelCoord(c, refCoord, m.y));
      be.line(x, ya, x, yb, { stroke: C_PIN, width: 0.15, dash: DIM_DASH });
      drawArrow(be, x, ya, Math.sign(yb - ya), 'y');
      drawArrow(be, x, yb, Math.sign(ya - yb), 'y');
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
  } else { // outlet (default): French Type E — round socket, two round contacts, top earth pin
    be.circle(cx, cy, r, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.circle(cx - r * 0.42, cy + r * 0.12, r * 0.2, { fill: C_MARK, stroke: C_MARK, width: 0.1 }); // line
    be.circle(cx + r * 0.42, cy + r * 0.12, r * 0.2, { fill: C_MARK, stroke: C_MARK, width: 0.1 }); // neutral
    be.circle(cx, cy - r * 0.44, r * 0.18, { fill: '#fff', stroke: C_MARK, width: 0.2 });          // earth pin
  }
}

function pairwiseCluster(items, within) {
  const groups = [];
  for (const item of items) {
    const group = groups.find((candidate) => candidate.every((other) => within(item, other)));
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups;
}

const markerHeight = (marker) => (Number.isFinite(marker.z) ? marker.z : 0);

// One plan-position callout may contain several separate white boxes. Markers
// share a box only when their complete 3D positions are within 4 cm: horizontal
// neighbors at one height produce a horizontal box, while vertical neighbors at
// different heights produce a vertical box with one height per row.
function groupFixtureBoxes(markers, tolerance) {
  const boxes = pairwiseCluster(markers, (a, b) => Math.hypot(
    a.x - b.x, a.y - b.y, markerHeight(a) - markerHeight(b),
  ) <= tolerance + 1e-9).map((members) => {
    const minZ = Math.min(...members.map(markerHeight));
    const maxZ = Math.max(...members.map(markerHeight));
    const horizontal = maxZ - minZ <= MARKER_SAME_HEIGHT_EPS;
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

// Markers within 4 cm in plan share one leader so their projected glyphs cannot
// obscure each other. Their authored points remain untouched. Requiring every
// member to be within tolerance avoids merging a long chain of nearby fixtures.
export function groupFixtureStacks(markers, tolerance = MARKER_STACK_TOLERANCE) {
  const groups = pairwiseCluster(markers || [], (a, b) =>
    Math.hypot(a.x - b.x, a.y - b.y) <= tolerance + 1e-9);
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
  const labels = box.markers.map((marker) => Number.isFinite(marker.z) ? fmt(marker.z) : '');
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
      be.text(labels[0], glyphX - metrics.glyphGap + labelGap, glyphY, {
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
}

function drawFixtureStack(be, L, stack) {
  const ax = L.X(stack.x), ay = L.Y(stack.y);
  const count = stack.markers.length;
  if (count === 1) {
    const marker = stack.markers[0];
    drawMarkerGlyph(be, L.X(marker.x), L.Y(marker.y), marker.type, 2.8);
    if (Number.isFinite(marker.z)) {
      drawTextChip(be, fmt(marker.z), L.X(marker.x), L.Y(marker.y) + 3.9, 1.9);
    }
    return;
  }

  const boxes = stack.boxes;
  const metrics = boxes.map((box) => fixtureBoxMetrics(be, box));
  const totalHeight = metrics.reduce((sum, item) => sum + item.height, 0)
    + (metrics.length - 1) * MARKER_STACK_BOX_GAP;
  const maxBoxWidth = Math.max(...metrics.map((item) => item.width));
  const requiredWidth = 4.4 + maxBoxWidth;
  const leftRoom = ax - MARGIN;
  const rightRoom = L.page.w - MARGIN - ax;
  const dir = rightRoom >= requiredWidth || rightRoom >= leftRoom ? 1 : -1;
  const spineX = ax + dir * 3.2;

  // Keep even a tall callout inside the drawing field. If the anchor is near a
  // page edge, the leader bends along the spine without moving the true point.
  const halfSpan = totalHeight / 2;
  const minCenterY = MARGIN + halfSpan;
  const maxCenterY = L.page.h - MARGIN - STRIP - halfSpan;
  const centerY = minCenterY <= maxCenterY
    ? Math.max(minCenterY, Math.min(maxCenterY, ay))
    : ay;
  let boxY = centerY - totalHeight / 2;
  const boxCenters = metrics.map((item) => {
    const cy = boxY + item.height / 2;
    boxY += item.height + MARKER_STACK_BOX_GAP;
    return cy;
  });

  // The bracket joins each distinct physical fixture box back to the compact
  // installation's shared plan anchor.
  be.circle(ax, ay, 0.45, { fill: '#fff', stroke: C_MARK, width: 0.2 });
  be.line(ax + dir * 0.45, ay, spineX, ay, { stroke: C_MARK, width: 0.16 });
  be.line(spineX, Math.min(boxCenters[0], ay), spineX, Math.max(boxCenters.at(-1), ay), {
    stroke: C_MARK, width: 0.16,
  });

  boxY = centerY - totalHeight / 2;
  boxes.forEach((box, i) => {
    const item = metrics[i];
    const x = dir > 0 ? spineX + 1.2 : spineX - 1.2 - item.width;
    const nearX = dir > 0 ? x : x + item.width;
    be.line(spineX, boxCenters[i], nearX, boxCenters[i], { stroke: C_MARK, width: 0.16 });
    drawFixtureBox(be, box, item, x, boxY);
    boxY += item.height + MARKER_STACK_BOX_GAP;
  });
}

function drawMarkers(be, L, floor) {
  for (const stack of groupFixtureStacks(floor.markers)) drawFixtureStack(be, L, stack);
}

// A ceiling-routed switch leg projects to its switch-to-light span in plan view;
// vertical rise/drop segments collapse onto the endpoint glyphs. Keep it dotted so
// electrical control never reads as wall or structural dimension geometry.
function drawElectricalLinks(be, L, floor) {
  for (const link of floor.electricalLinks || []) {
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
  const rowY = yBase + STRIP * 0.5; // vertical center of the strip content

  // Floor name (left) — a single label, not a full title block.
  be.text(floor.name || 'Floor', MARGIN, yBase + 4, { fill: '#000', size: 4, weight: 'bold', baseline: 'top' });
  const generatedLabel = opts.generatedLabel || 'Generated';
  be.text(`${generatedLabel}: ${localGenerationTime(opts.generatedAt)}`, MARGIN, yBase + 8,
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

  // Legends (right): semantic plan zones and fixture markers have independent
  // rows. Entries are included only when that type occurs on this floor.
  const layers = resolveOutputLayers(opts);
  const markerTypes = layers.markerIcons
    ? [...new Set((floor.markers || []).map((m) => m.type))] : [];
  const zoneTypes = PRINT_ZONE_KINDS.filter((kind) =>
    (kind !== 'furniture' || layers.furniture)
    && floor.rectangles.some((rect) => zoneKind(rect) === kind));
  const markerName = opts.markerLabel || ((t) => MARKER_LABELS[t] || t);
  const zoneName = opts.zoneLabel || ((t) => ZONE_LABELS[t] || t);

  if (zoneTypes.length) {
    const entries = zoneTypes.map((t) => ({ t, label: zoneName(t) }));
    const widths = entries.map((e) => 7.4 + be.measure(e.label, 2.2) + 2.2);
    let x = page.w - MARGIN - widths.reduce((a, b) => a + b, 0);
    const y = markerTypes.length ? yBase + 4.5 : rowY;
    for (let i = 0; i < entries.length; i++) {
      drawZoneGlyph(be, x, y - 1.6, 6, 3.2, entries[i].t);
      be.text(entries[i].label, x + 7.4, y,
        { fill: '#000', size: 2.2, align: 'left', baseline: 'middle' });
      x += widths[i];
    }
  }

  if (markerTypes.length) {
    const entries = markerTypes.map((t) => ({ t, label: markerName(t) }));
    const widths = entries.map((e) => 4.4 + be.measure(e.label, 2.4) + 3);
    let x = page.w - MARGIN - widths.reduce((a, b) => a + b, 0);
    const y = zoneTypes.length ? yBase + 11.5 : rowY;
    for (let i = 0; i < entries.length; i++) {
      drawMarkerGlyph(be, x + 2, y, entries[i].t, 2.6);
      be.text(entries[i].label, x + 4.4, y,
        { fill: '#000', size: 2.4, align: 'left', baseline: 'middle' });
      x += widths[i];
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
    be.text(floor.name || 'Floor', MARGIN, MARGIN + 4, { fill: '#000', size: 4, weight: 'bold', baseline: 'top' });
    be.text('(empty floor)', page.w / 2, page.h / 2, { fill: '#888', size: 4, align: 'center', baseline: 'middle' });
    return { page, ratio: 0, exact: false };
  }
  const L = layoutSheet(opts.layoutBBox || bbox, opts);
  drawFootprint(be, L, footprint);
  drawZones(be, L, floor, layers); // semantic fixed-zone/furniture symbols over the footprint
  drawElectricalLinks(be, L, floor); // dotted switch-to-light ceiling-route projection
  if (layers.planDims) drawDimensions(be, L, floor);
  if (layers.markerDims) drawMarkerPins(be, L, floor); // fixture-placement dimensions, under the glyphs
  drawRoomAreas(be, L, floor);
  if (layers.markerIcons) drawMarkers(be, L, floor); // glyphs/fixture-stack callouts stay foremost
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
