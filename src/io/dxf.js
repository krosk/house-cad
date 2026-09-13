// ASCII DXF (AutoCAD 2000 / AC1015) export for one authored floor.
//
// Unlike the SVG sheet, this is not laid out on paper: model meters become DXF
// millimeters at true 1:1 CAD scale. Semantic entities live on separate layers
// so an importer such as Coohom can isolate clean plan geometry from annotations.

import { computeFootprint, connectedRoomComponents } from '../core/geometry2d.js';
import { edgeCoord, isMarkerConstraint, ORIGIN_ID } from '../core/constraints.js';
import { dimLabelCoord, edgeLineWorld } from '../core/dimline.js';
import { zoneKind } from '../core/zoneColors.js';

const MM = 1000;
const AUTO_DIM_OFFSET = 0.35; // model meters when an AR placement has not been authored
const AUTO_DIM_TIER = 0.25;
const TEXT_HEIGHT = 0.14;

const LAYERS = [
  ['ORIGIN', 7, 'CONTINUOUS'],
  ['FOOTPRINT', 7, 'CONTINUOUS'],
  ['ROOM', 5, 'CONTINUOUS'],
  ['WALL', 1, 'CONTINUOUS'],
  ['DOOR', 3, 'CONTINUOUS'],
  ['WINDOW', 4, 'CONTINUOUS'],
  ['STAIRS', 2, 'CONTINUOUS'],
  ['CABINET', 6, 'CONTINUOUS'],
  ['DIMS', 8, 'DASHED'],
  ['DIMS_EXT', 8, 'DOTTED'],
  ['MARKER_DIMS', 30, 'DASHED'],
  ['ROOM_INFO', 8, 'CONTINUOUS'],
  ['MARKER_HEIGHT', 8, 'CONTINUOUS'],
  ['MARKER_OUTLET', 7, 'CONTINUOUS'],
  ['MARKER_SWITCH', 7, 'CONTINUOUS'],
  ['MARKER_LIGHT', 7, 'CONTINUOUS'],
  ['MARKER_ETHERNET', 7, 'CONTINUOUS'],
  ['MARKER_WIRE', 7, 'CONTINUOUS'],
];

const cleanNumber = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};
const mm = (meters) => cleanNumber(meters * MM);
const safeText = (value) => String(value).replace(/[\r\n]+/g, ' ').replace(/[{}]/g, '');

class DxfWriter {
  constructor() { this.parts = []; this.nextHandle = 1; }
  pair(code, value) { this.parts.push(String(code), String(value)); }
  handle() { return (this.nextHandle++).toString(16).toUpperCase(); }
  entity(type, layer, subclass, linetype = null) {
    this.pair(0, type); this.pair(5, this.handle());
    this.pair(100, 'AcDbEntity'); this.pair(8, layer);
    if (linetype) this.pair(6, linetype);
    this.pair(100, subclass);
  }
  line(layer, ax, ay, bx, by, linetype = null) {
    this.entity('LINE', layer, 'AcDbLine', linetype);
    this.pair(10, mm(ax)); this.pair(20, mm(ay)); this.pair(30, 0);
    this.pair(11, mm(bx)); this.pair(21, mm(by)); this.pair(31, 0);
  }
  point(layer, x, y) {
    this.entity('POINT', layer, 'AcDbPoint');
    this.pair(10, mm(x)); this.pair(20, mm(y)); this.pair(30, 0);
  }
  circle(layer, x, y, radius) {
    this.entity('CIRCLE', layer, 'AcDbCircle');
    this.pair(10, mm(x)); this.pair(20, mm(y)); this.pair(30, 0);
    this.pair(40, mm(radius));
  }
  polyline(layer, points, closed = true) {
    if (points.length < 2) return;
    const pts = [...points];
    const first = pts[0], last = pts[pts.length - 1];
    if (closed && pts.length > 2 && first[0] === last[0] && first[1] === last[1]) pts.pop();
    this.entity('LWPOLYLINE', layer, 'AcDbPolyline');
    this.pair(90, pts.length); this.pair(70, closed ? 1 : 0);
    for (const [x, y] of pts) { this.pair(10, mm(x)); this.pair(20, mm(y)); }
  }
  text(layer, value, x, y, height = TEXT_HEIGHT, rotation = 0) {
    this.entity('TEXT', layer, 'AcDbText');
    this.pair(10, mm(x)); this.pair(20, mm(y)); this.pair(30, 0);
    this.pair(40, mm(height)); this.pair(1, safeText(value)); this.pair(50, cleanNumber(rotation));
    // Middle-center alignment at the supplied point.
    this.pair(72, 1);
    this.pair(11, mm(x)); this.pair(21, mm(y)); this.pair(31, 0);
    this.pair(100, 'AcDbText'); this.pair(73, 2);
  }
  toString() { return this.parts.join('\n') + '\n'; }
}

function writeHeader(w) {
  w.pair(0, 'SECTION'); w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER'); w.pair(1, 'AC1015');
  w.pair(9, '$INSUNITS'); w.pair(70, 4); // millimeters
  w.pair(9, '$MEASUREMENT'); w.pair(70, 1); // metric
  w.pair(9, '$LTSCALE'); w.pair(40, 1);
  w.pair(0, 'ENDSEC');
}

function writeTables(w) {
  w.pair(0, 'SECTION'); w.pair(2, 'TABLES');

  w.pair(0, 'TABLE'); w.pair(2, 'LTYPE');
  const ltypeTable = w.handle();
  w.pair(5, ltypeTable); w.pair(330, 0); w.pair(100, 'AcDbSymbolTable'); w.pair(70, 3);
  for (const [name, description, pattern] of [
    ['CONTINUOUS', 'Solid line', []],
    ['DASHED', 'Dashed __ __ __', [80, -50]],
    ['DOTTED', 'Dotted . . .', [8, -42]],
  ]) {
    w.pair(0, 'LTYPE'); w.pair(5, w.handle()); w.pair(330, ltypeTable);
    w.pair(100, 'AcDbSymbolTableRecord'); w.pair(100, 'AcDbLinetypeTableRecord');
    w.pair(2, name); w.pair(70, 0);
    w.pair(3, description); w.pair(72, 65); w.pair(73, pattern.length);
    w.pair(40, pattern.reduce((sum, n) => sum + Math.abs(n), 0));
    for (const n of pattern) { w.pair(49, n); w.pair(74, 0); }
  }
  w.pair(0, 'ENDTAB');

  w.pair(0, 'TABLE'); w.pair(2, 'LAYER');
  const layerTable = w.handle();
  w.pair(5, layerTable); w.pair(330, 0); w.pair(100, 'AcDbSymbolTable'); w.pair(70, LAYERS.length);
  for (const [name, color, linetype] of LAYERS) {
    w.pair(0, 'LAYER'); w.pair(5, w.handle()); w.pair(330, layerTable);
    w.pair(100, 'AcDbSymbolTableRecord'); w.pair(100, 'AcDbLayerTableRecord');
    w.pair(2, name); w.pair(70, 0);
    w.pair(62, color); w.pair(6, linetype);
  }
  w.pair(0, 'ENDTAB');
  w.pair(0, 'ENDSEC');
}

function rectPoints(rect) {
  const b = rect.bounds;
  return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
}

function writeZoneSymbol(w, rect, kind) {
  const b = rect.bounds;
  const width = b.x1 - b.x0, height = b.y1 - b.y0;
  const horizontal = width >= height;
  if (kind === 'door') {
    w.line('DOOR', b.x0, b.y0, b.x1, b.y1);
  } else if (kind === 'window') {
    if (horizontal) {
      w.line('WINDOW', b.x0, b.y0 + height * 0.35, b.x1, b.y0 + height * 0.35);
      w.line('WINDOW', b.x0, b.y0 + height * 0.65, b.x1, b.y0 + height * 0.65);
    } else {
      w.line('WINDOW', b.x0 + width * 0.35, b.y0, b.x0 + width * 0.35, b.y1);
      w.line('WINDOW', b.x0 + width * 0.65, b.y0, b.x0 + width * 0.65, b.y1);
    }
  } else if (kind === 'stairs') {
    for (let i = 1; i < 6; i++) {
      if (horizontal) w.line('STAIRS', b.x0 + width * i / 6, b.y0, b.x0 + width * i / 6, b.y1);
      else w.line('STAIRS', b.x0, b.y0 + height * i / 6, b.x1, b.y0 + height * i / 6);
    }
    if (horizontal) {
      const cy = (b.y0 + b.y1) / 2, tip = b.x0 + width * 0.82;
      w.line('STAIRS', b.x0 + width * 0.18, cy, tip, cy);
      w.line('STAIRS', tip, cy, b.x0 + width * 0.68, b.y0 + height * 0.25);
      w.line('STAIRS', tip, cy, b.x0 + width * 0.68, b.y0 + height * 0.75);
    } else {
      const cx = (b.x0 + b.x1) / 2, tip = b.y0 + height * 0.82;
      w.line('STAIRS', cx, b.y0 + height * 0.18, cx, tip);
      w.line('STAIRS', cx, tip, b.x0 + width * 0.25, b.y0 + height * 0.68);
      w.line('STAIRS', cx, tip, b.x0 + width * 0.75, b.y0 + height * 0.68);
    }
  } else if (kind === 'cabinet') {
    w.line('CABINET', b.x0, b.y0, b.x1, b.y1);
    w.line('CABINET', b.x0, b.y1, b.x1, b.y0);
  }
}

function formatMm(meters) {
  const value = Math.abs(meters) * MM;
  const rounded = Math.round(value * 1000) / 1000;
  return cleanNumber(rounded);
}

function endpointCoord(floor, endpoint, axis) {
  if (endpoint?.marker) return (floor.markers || []).find((m) => m.id === endpoint.marker)?.[axis];
  if (endpoint?.rect === ORIGIN_ID) return 0;
  const id = endpoint?.rect?.id ?? endpoint?.rect;
  const rect = floor.rectangles.find((r) => r.id === id);
  return rect ? edgeCoord(rect, endpoint.edge) : null;
}

function writeTick(w, layer, x, y) {
  const d = 0.055;
  w.line(layer, x - d, y - d, x + d, y + d);
}

function writeLeader(w, layer, a, b, label, fixed, axis) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const from = label < lo ? lo : label > hi ? hi : null;
  if (from == null) return;
  if (axis === 'x') w.line(layer, from, fixed, label, fixed, 'DOTTED');
  else w.line(layer, fixed, from, fixed, label, 'DOTTED');
}

function writeDimensions(w, floor) {
  let xTier = 0, yTier = 0;
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance' || isMarkerConstraint(c) || Math.abs(c.value) < 5e-7) continue;
    const la = edgeLineWorld(c.a, floor.rectangles), lb = edgeLineWorld(c.b, floor.rectangles);
    const aOrigin = c.a?.rect === ORIGIN_ID, bOrigin = c.b?.rect === ORIGIN_ID;
    if ((!la && !aOrigin) || (!lb && !bOrigin)) continue;
    const aCoord = aOrigin ? 0 : la.coord, bCoord = bOrigin ? 0 : lb.coord;
    const label = dimLabelCoord(c, aCoord, bCoord);
    if (c.axis === 'x') {
      const top = Math.max(0, ...(la ? [la.p1.y] : []), ...(lb ? [lb.p1.y] : []));
      const y = c.offset == null ? top + AUTO_DIM_OFFSET + xTier++ * AUTO_DIM_TIER : top + c.offset;
      for (const [edge, coord] of [[la, aCoord], [lb, bCoord]]) {
        const connect = edge
          ? (Math.abs(y - edge.p1.y) <= Math.abs(y - edge.p0.y) ? edge.p1.y : edge.p0.y)
          : 0;
        w.line('DIMS_EXT', coord, connect, coord, y, 'DOTTED');
      }
      w.line('DIMS', aCoord, y, bCoord, y, 'DASHED');
      writeTick(w, 'DIMS', aCoord, y); writeTick(w, 'DIMS', bCoord, y);
      writeLeader(w, 'DIMS_EXT', aCoord, bCoord, label, y, 'x');
      w.text('DIMS', formatMm(c.value), label, y, TEXT_HEIGHT);
    } else {
      const right = Math.max(0, ...(la ? [la.p1.x] : []), ...(lb ? [lb.p1.x] : []));
      const x = c.offset == null ? right + AUTO_DIM_OFFSET + yTier++ * AUTO_DIM_TIER : right + c.offset;
      for (const [edge, coord] of [[la, aCoord], [lb, bCoord]]) {
        const connect = edge
          ? (Math.abs(x - edge.p1.x) <= Math.abs(x - edge.p0.x) ? edge.p1.x : edge.p0.x)
          : 0;
        w.line('DIMS_EXT', connect, coord, x, coord, 'DOTTED');
      }
      w.line('DIMS', x, aCoord, x, bCoord, 'DASHED');
      writeTick(w, 'DIMS', x, aCoord); writeTick(w, 'DIMS', x, bCoord);
      writeLeader(w, 'DIMS_EXT', aCoord, bCoord, label, x, 'y');
      w.text('DIMS', formatMm(c.value), x, label, TEXT_HEIGHT, 90);
    }
  }
}

function writeMarkerDimensions(w, floor) {
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance' || !isMarkerConstraint(c) || Math.abs(c.value) < 5e-7) continue;
    const markerEnd = c.a?.marker ? c.a : c.b;
    const refEnd = c.a?.marker ? c.b : c.a;
    const marker = (floor.markers || []).find((m) => m.id === markerEnd?.marker);
    if (!marker) continue;
    const ref = endpointCoord(floor, refEnd, c.axis);
    if (!Number.isFinite(ref)) continue;
    const target = marker[c.axis];
    const label = dimLabelCoord(c, ref, target);
    if (c.axis === 'x') {
      const y = c.offset == null ? marker.y : c.offset;
      w.line('MARKER_DIMS', ref, y, target, y, 'DASHED');
      writeTick(w, 'MARKER_DIMS', ref, y); writeTick(w, 'MARKER_DIMS', target, y);
      writeLeader(w, 'DIMS_EXT', ref, target, label, y, 'x');
      w.text('MARKER_DIMS', formatMm(c.value), label, y, TEXT_HEIGHT);
    } else {
      const x = c.offset == null ? marker.x : c.offset;
      w.line('MARKER_DIMS', x, ref, x, target, 'DASHED');
      writeTick(w, 'MARKER_DIMS', x, ref); writeTick(w, 'MARKER_DIMS', x, target);
      writeLeader(w, 'DIMS_EXT', ref, target, label, x, 'y');
      w.text('MARKER_DIMS', formatMm(c.value), x, label, TEXT_HEIGHT, 90);
    }
  }
}

function markerLayer(type) {
  const layer = `MARKER_${String(type || 'outlet').toUpperCase()}`;
  return LAYERS.some(([name]) => name === layer) ? layer : 'MARKER_OUTLET';
}

function writeMarker(w, marker) {
  const layer = markerLayer(marker.type);
  const x = marker.x, y = marker.y, r = 0.08;
  if (marker.type === 'switch') {
    w.polyline(layer, [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]);
    w.line(layer, x - r * 0.5, y - r * 0.5, x + r * 0.5, y + r * 0.5);
  } else if (marker.type === 'light') {
    w.circle(layer, x, y, r);
    w.line(layer, x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7);
    w.line(layer, x - r * 0.7, y + r * 0.7, x + r * 0.7, y - r * 0.7);
  } else if (marker.type === 'ethernet') {
    w.polyline(layer, [[x - r, y - r * 0.7], [x + r, y - r * 0.7], [x + r, y + r * 0.7], [x - r, y + r * 0.7]]);
    for (let i = 0; i < 8; i++) {
      const px = x - r * 0.56 + i * (r * 1.12 / 7);
      w.line(layer, px, y - r * 0.4, px, y - r * 0.08);
    }
    w.polyline(layer, [[x - r * 0.38, y + r * 0.15], [x + r * 0.38, y + r * 0.15], [x + r * 0.38, y + r * 0.48], [x - r * 0.38, y + r * 0.48]]);
  } else if (marker.type === 'wire') {
    w.circle(layer, x, y, r);
    w.line(layer, x - r * 0.65, y, x - r * 0.2, y + r * 0.45);
    w.line(layer, x - r * 0.2, y + r * 0.45, x + r * 0.2, y - r * 0.45);
    w.line(layer, x + r * 0.2, y - r * 0.45, x + r * 0.65, y);
  } else {
    // French Type E outlet: socket, line/neutral contacts, and earth pin.
    w.circle(layer, x, y, r);
    w.circle(layer, x - r * 0.42, y - r * 0.12, r * 0.2);
    w.circle(layer, x + r * 0.42, y - r * 0.12, r * 0.2);
    w.circle(layer, x, y + r * 0.44, r * 0.18);
  }
  if (Number.isFinite(marker.z)) {
    w.text('MARKER_HEIGHT', `Z=${formatMm(marker.z)}`, x, y - 0.16, 0.1);
  }
}

/**
 * Export one floor as an ASCII AutoCAD 2000 DXF in millimeters.
 * Geometry is full-size (1 model meter = 1000 DXF units), never paper-scaled.
 */
export function floorToDxf(floor) {
  const w = new DxfWriter();
  writeHeader(w);
  writeTables(w);
  w.pair(0, 'SECTION'); w.pair(2, 'ENTITIES');

  w.point('ORIGIN', 0, 0);
  const footprint = computeFootprint(floor.rectangles);
  for (const polygon of footprint) for (const ring of polygon) w.polyline('FOOTPRINT', ring);

  for (const rect of floor.rectangles) {
    const kind = zoneKind(rect);
    const layer = kind.toUpperCase();
    w.polyline(layer, rectPoints(rect));
    writeZoneSymbol(w, rect, kind);
  }

  writeDimensions(w, floor);
  writeMarkerDimensions(w, floor);
  for (const marker of floor.markers || []) writeMarker(w, marker);

  for (const component of connectedRoomComponents(floor.rectangles)) {
    const anchor = component.rectangles.reduce((largest, rect) => {
      const b = rect.bounds, lb = largest.bounds;
      return (b.x1 - b.x0) * (b.y1 - b.y0) > (lb.x1 - lb.x0) * (lb.y1 - lb.y0) ? rect : largest;
    });
    const b = anchor.bounds;
    w.text('ROOM_INFO', `AREA=${component.area.toFixed(2)}m2`,
      (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0.16);
  }

  w.pair(0, 'ENDSEC'); w.pair(0, 'EOF');
  return w.toString();
}
