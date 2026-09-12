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

// True when a distance rounds to zero AT THE CURRENT DISPLAY PRECISION — such
// dimensions (coincident edges, a marker sitting on its wall) read as "0.00" and
// are pure clutter, so they are not drawn.
const displaysZero = (meters) => parseFloat(fmt(Math.abs(meters))) === 0;

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

// print palette
const C_LINE = '#111';       // footprint outline
const C_FILL = '#ededed';    // footprint fill (rooms/solid)
const C_DIM = '#333';        // dimension lines + text
const C_DIM_BAD = '#c02626'; // conflicting dimension
const C_MARK = '#111';       // marker glyphs
const C_PIN = '#b45309';     // marker floor-pin dimension (fixture placement), distinct from structural dims

const MARKER_LABELS = {
  outlet: 'Outlet', switch: 'Switch', light: 'Light', ethernet: 'Ethernet', wire: 'Wire',
};

// ---------------------------------------------------------------------------
// Drawing backends — both consume PAGE MILLIMETERS.
// ---------------------------------------------------------------------------

function svgBackend() {
  const parts = [];
  const esc = (s) => String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
  const dash = (d) => (d && d.length ? ` stroke-dasharray="${d.join(' ')}"` : '');
  const num = (n) => (Math.round(n * 1000) / 1000);
  return {
    parts,
    line(x0, y0, x1, y1, s = {}) {
      parts.push(`<line x1="${num(x0)}" y1="${num(y0)}" x2="${num(x1)}" y2="${num(y1)}" `
        + `stroke="${s.stroke || '#000'}" stroke-width="${s.width ?? 0.2}"${dash(s.dash)}/>`);
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
      ctx.setLineDash(dashPx(s.dash));
      ctx.beginPath(); ctx.moveTo(x0 * k, y0 * k); ctx.lineTo(x1 * k, y1 * k); ctx.stroke();
      ctx.setLineDash([]);
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

function contentBBox(floor, footprint) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
  for (const poly of footprint) for (const ring of poly) for (const [x, y] of ring) add(x, y);
  // Raw rect bounds too, so an all-subtract or otherwise empty footprint still frames.
  for (const r of floor.rectangles) { const b = r.bounds; add(b.x0, b.y0); add(b.x1, b.y1); }
  for (const m of floor.markers || []) add(m.x, m.y);
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

function layoutSheet(bbox, opts) {
  const page = PAGES[opts.page] || PAGES.a4;
  const cw = Math.max(bbox.x1 - bbox.x0, 1e-3);
  const ch = Math.max(bbox.y1 - bbox.y0, 1e-3);
  // Orientation: match the content's aspect to the paper's.
  const landscape = cw / ch > page.w / page.h;
  const pageW = landscape ? Math.max(page.w, page.h) : Math.min(page.w, page.h);
  const pageH = landscape ? Math.min(page.w, page.h) : Math.max(page.w, page.h);

  const availW = pageW - 2 * MARGIN - DIM_RESERVE;         // right band reserved for y-dims
  const availH = pageH - 2 * MARGIN - STRIP - DIM_RESERVE; // top band reserved for x-dims
  const availX0 = MARGIN;
  const availY0 = MARGIN + DIM_RESERVE;

  // Pick the finest round ratio that fits; else fit exactly and report it.
  let mmPerM = 0, ratio = 0, exact = false;
  if (opts.ratio && RATIOS.includes(opts.ratio)) { ratio = opts.ratio; mmPerM = 1000 / ratio; }
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

  return { page: { w: pageW, h: pageH }, mmPerM, ratio, exact, X, Y, bbox };
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

function drawArrow(be, x, y, dir, axis) {
  const pts = axis === 'x'
    ? [[x, y], [x + dir * ARROW, y - ARROW_H], [x + dir * ARROW, y + ARROW_H]]
    : [[x, y], [x - ARROW_H, y + dir * ARROW], [x + ARROW_H, y + dir * ARROW]];
  be.poly(pts, { fill: C_DIM });
}

function drawDimLabel(be, text, cx, cy, color) {
  const size = 2.6;
  const w = be.measure(text, size) + 2.4;
  const h = 3.8;
  be.rect(cx - w / 2, cy - h / 2, w, h, { fill: '#fff', stroke: color, width: 0.12 });
  be.text(text, cx, cy + 0.15, { fill: color, size, align: 'center', baseline: 'middle' });
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
    if (displaysZero(c.value)) continue; // a 0.00 dimension is clutter
    const la = edgeLineWorld(c.a, rects);
    const lb = edgeLineWorld(c.b, rects);
    if (!la || !lb) continue; // origin/marker refs have no drawable edge (matches the 2D editor)
    const color = c.conflict ? C_DIM_BAD : C_DIM;
    const label = fmt(Math.abs(c.value));

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
      be.line(sxa, dimY, sxb, dimY, { stroke: color, width: 0.18 });
      drawArrow(be, sxa, dimY, Math.sign(sxb - sxa), 'x');
      drawArrow(be, sxb, dimY, Math.sign(sxa - sxb), 'x');
      drawDimLabel(be, label, L.X(dimLabelCoord(c, la.coord, lb.coord)), dimY, color);
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
      be.line(dimX, sya, dimX, syb, { stroke: color, width: 0.18 });
      drawArrow(be, dimX, sya, Math.sign(syb - sya), 'y');
      drawArrow(be, dimX, syb, Math.sign(sya - syb), 'y');
      drawDimLabel(be, label, dimX, L.Y(dimLabelCoord(c, la.coord, lb.coord)), color);
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
    const label = fmt(Math.abs(c.value));
    if (c.axis === 'x') {
      const y = L.Y(c.offset != null ? c.offset : m.y), xa = L.X(refCoord), xb = L.X(m.x);
      be.line(xa, y, xb, y, { stroke: C_PIN, width: 0.15, dash: [1.4, 1] });
      drawArrow(be, xa, y, Math.sign(xb - xa), 'x');
      drawArrow(be, xb, y, Math.sign(xa - xb), 'x');
      drawDimLabel(be, label, L.X(dimLabelCoord(c, refCoord, m.x)), y, C_PIN);
    } else {
      const x = L.X(c.offset != null ? c.offset : m.x), ya = L.Y(refCoord), yb = L.Y(m.y);
      be.line(x, ya, x, yb, { stroke: C_PIN, width: 0.15, dash: [1.4, 1] });
      drawArrow(be, x, ya, Math.sign(yb - ya), 'y');
      drawArrow(be, x, yb, Math.sign(ya - yb), 'y');
      drawDimLabel(be, label, x, L.Y(dimLabelCoord(c, refCoord, m.y)), C_PIN);
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
    be.rect(cx - r, cy - r * 0.7, size, size * 0.7, { fill: '#fff', stroke: C_MARK, width: 0.2 });
  } else { // outlet (default): French Type E — round socket, two round contacts, top earth pin
    be.circle(cx, cy, r, { fill: '#fff', stroke: C_MARK, width: 0.2 });
    be.circle(cx - r * 0.42, cy + r * 0.12, r * 0.2, { fill: C_MARK, stroke: C_MARK, width: 0.1 }); // line
    be.circle(cx + r * 0.42, cy + r * 0.12, r * 0.2, { fill: C_MARK, stroke: C_MARK, width: 0.1 }); // neutral
    be.circle(cx, cy - r * 0.44, r * 0.18, { fill: '#fff', stroke: C_MARK, width: 0.2 });          // earth pin
  }
}

function drawMarkers(be, L, floor) {
  for (const m of floor.markers || []) {
    drawMarkerGlyph(be, L.X(m.x), L.Y(m.y), m.type, 2.8);
    if (typeof m.z === 'number') {
      drawTextChip(be, fmt(m.z), L.X(m.x), L.Y(m.y) + 3.9, 1.9); // height, in a white box
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
  be.text(`${exact ? '≈ ' : ''}1:${ratio}  ·  ${unitLabel()}`, page.w / 2, rowY,
    { fill: '#000', size: 3, align: 'center', baseline: 'middle' });

  // Legend (right): one entry per marker type present on this floor.
  const types = [...new Set((floor.markers || []).map((m) => m.type))];
  const nameOf = opts.markerLabel || ((t) => MARKER_LABELS[t] || t);
  if (types.length) {
    // Lay entries left-to-right, right-aligned to the right margin.
    const entries = types.map((t) => ({ t, label: nameOf(t) }));
    const widths = entries.map((e) => 4.4 + be.measure(e.label, 2.4) + 3);
    let x = page.w - MARGIN - widths.reduce((a, b) => a + b, 0);
    for (let i = 0; i < entries.length; i++) {
      drawMarkerGlyph(be, x + 2, rowY, entries[i].t, 2.6);
      be.text(entries[i].label, x + 4.4, rowY, { fill: '#000', size: 2.4, align: 'left', baseline: 'middle' });
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
  const footprint = computeFootprint(floor.rectangles);
  const bbox = contentBBox(floor, footprint);
  if (!bbox) {
    // Empty floor: just a name + note, centered.
    const page = PAGES[opts.page] || PAGES.a4;
    be.text(floor.name || 'Floor', MARGIN, MARGIN + 4, { fill: '#000', size: 4, weight: 'bold', baseline: 'top' });
    be.text('(empty floor)', page.w / 2, page.h / 2, { fill: '#888', size: 4, align: 'center', baseline: 'middle' });
    return { page, ratio: 0, exact: false };
  }
  const L = layoutSheet(bbox, opts);
  drawFootprint(be, L, footprint);
  drawDimensions(be, L, floor);
  drawMarkerPins(be, L, floor); // fixture-placement dimensions, under the glyphs
  drawMarkers(be, L, floor);
  drawRoomAreas(be, L, floor); // area chips stay legible above linework + markers
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
 * Render one floor onto a canvas at ~targetLongPx on its long edge. Sizes the
 * canvas to the page aspect, fills white, and draws. Returns the layout.
 * Used for the in-AR preview panel (canvas -> CanvasTexture).
 */
export function floorToCanvas(floor, canvas, opts = {}) {
  // First lay out to know the page size (needs the bbox), then size the canvas.
  const footprint = computeFootprint(floor.rectangles);
  const bbox = contentBBox(floor, footprint);
  const page = bbox ? layoutSheet(bbox, opts).page : (PAGES[opts.page] || PAGES.a4);
  const targetLong = opts.targetPx || 2048;
  const k = targetLong / Math.max(page.w, page.h); // px per mm
  canvas.width = Math.round(page.w * k);
  canvas.height = Math.round(page.h * k);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const be = canvasBackend(ctx, k);
  return renderFloor(be, floor, opts);
}
