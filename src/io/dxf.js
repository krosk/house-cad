// ASCII DXF (AutoCAD 2000 / AC1015) export for one authored floor.
//
// Unlike the SVG sheet, this is not laid out on paper: model meters become DXF
// millimeters at true 1:1 CAD scale. Semantic entities live on separate layers
// so an importer such as Coohom can isolate clean plan geometry from annotations.

import { computeFootprint, connectedRoomComponents } from '../core/geometry2d.js';
import { edgeCoord, isMarkerConstraint, ORIGIN_ID } from '../core/constraints.js';
import { dimLabelCoord, edgeLineWorld } from '../core/dimline.js';
import { zoneKind } from '../core/zoneColors.js';
import { doorSwingSegments, windowCasementSegments, halfWallHatchSegments, heaterFinSegments, slidingDoorSegments, resolveApertureOrient } from '../core/apertureGlyph.js';
import { electricalRoutePoints } from '../core/electrical.js';
import { conduitNetworkSegments, wireRouteSegments, segmentsForFloor } from '../core/conduit.js';
import { resolveOutputLayers } from './outputOptions.js';

const MM = 1000;
const AUTO_DIM_OFFSET = 0.35; // model meters when an AR placement has not been authored
const AUTO_DIM_TIER = 0.25;
const TEXT_HEIGHT = 0.14;

const LAYERS = [
  ['ORIGIN', 7, 'CONTINUOUS'],
  ['FOOTPRINT', 7, 'CONTINUOUS'],
  ['ROOM', 5, 'CONTINUOUS'],
  ['WALL', 1, 'CONTINUOUS'],
  ['INSULATION', 6, 'CONTINUOUS'],
  ['DOOR', 3, 'CONTINUOUS'],
  ['HALFWALL', 8, 'CONTINUOUS'],
  ['HEATER', 40, 'CONTINUOUS'],
  ['SLIDING', 130, 'CONTINUOUS'],
  ['WINDOW', 4, 'CONTINUOUS'],
  ['STAIRS', 2, 'CONTINUOUS'],
  ['CABINET', 6, 'CONTINUOUS'],
  ['FURNITURE', 30, 'CONTINUOUS'],
  ['DIMS', 8, 'DASHED'],
  ['DIMS_EXT', 8, 'DOTTED'],
  ['MARKER_DIMS', 30, 'DASHED'],
  ['ROOM_INFO', 8, 'CONTINUOUS'],
  ['MARKER_HEIGHT', 8, 'CONTINUOUS'],
  ['MARKER_OUTLET', 7, 'CONTINUOUS'],
  ['MARKER_OUTLET_SHUTTER', 7, 'CONTINUOUS'],
  ['MARKER_OUTLET_AIRCON', 7, 'CONTINUOUS'],
  ['MARKER_OUTLET_COOKTOP', 7, 'CONTINUOUS'],
  ['MARKER_OUTLET_OVEN', 7, 'CONTINUOUS'],
  ['MARKER_OUTLET_WATER_HEATER', 7, 'CONTINUOUS'],
  ['MARKER_OUTLET_APPLIANCE', 7, 'CONTINUOUS'],
  ['MARKER_INTERCOM', 7, 'CONTINUOUS'],
  ['MARKER_PANEL', 7, 'CONTINUOUS'],
  ['MARKER_SWITCH', 7, 'CONTINUOUS'],
  ['MARKER_LIGHT', 7, 'CONTINUOUS'],
  ['MARKER_ETHERNET', 7, 'CONTINUOUS'],
  ['MARKER_ETHERNET_DUAL', 7, 'CONTINUOUS'],
  ['MARKER_TV_ANTENNA', 7, 'CONTINUOUS'],
  ['MARKER_CAMERA_ETHERNET', 7, 'CONTINUOUS'],
  ['MARKER_PATCH_PANEL', 7, 'CONTINUOUS'],
  ['ELECTRICAL_ROUTE', 4, 'DOTTED'],
  ['ELECTRICAL_ROUTE_WALL', 4, 'DOTTED'],
  ['ELECTRICAL_ROUTE_CEILING', 4, 'DOTTED'],
  ['ELECTRICAL_ROUTE_FLOOR', 4, 'DOTTED'],
  ['ELECTRICAL_ROUTE_RISER', 4, 'DOTTED'], // routed wire crossing a slab (riser)
  ['CONDUIT', 8, 'DASHED'],
  ['CONDUIT_RISER', 8, 'DASHED'],          // conduit crossing a slab (riser)
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
    this.line3d(layer, ax, ay, 0, bx, by, 0, linetype);
  }
  line3d(layer, ax, ay, az, bx, by, bz, linetype = null) {
    this.entity('LINE', layer, 'AcDbLine', linetype);
    this.pair(10, mm(ax)); this.pair(20, mm(ay)); this.pair(30, mm(az));
    this.pair(11, mm(bx)); this.pair(21, mm(by)); this.pair(31, mm(bz));
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

function writeTables(w, layers = LAYERS) {
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
  w.pair(5, layerTable); w.pair(330, 0); w.pair(100, 'AcDbSymbolTable'); w.pair(70, layers.length);
  for (const [name, color, linetype] of layers) {
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
  // DXF model space runs the same way as plan (min = lo), so pass plan corners.
  const { hingeEnd, perp } = resolveApertureOrient(rect, b.x0, b.x1, b.y0, b.y1);
  const segs = (layer, list) => { for (const [ax, ay, bx, by] of list) w.line(layer, b.x0 + ax, b.y0 + ay, b.x0 + bx, b.y0 + by); };
  if (kind === 'door') {
    segs('DOOR', doorSwingSegments(width, height, hingeEnd, { perp }));
  } else if (kind === 'halfwall') {
    // Inverse of the door opening: uniform diagonal hatch reading as solid (low) wall.
    segs('HALFWALL', halfWallHatchSegments(width, height));
  } else if (kind === 'heater') {
    // Wall-mounted radiator: outline + fins (the conventional heater symbol).
    segs('HEATER', heaterFinSegments(width, height));
  } else if (kind === 'sliding') {
    // Surface slider; panel is opening + 10 cm (native meters in model space).
    segs('SLIDING', slidingDoorSegments(width, height, hingeEnd, { over: 0.10, perp }));
  } else if (kind === 'window') {
    segs('WINDOW', windowCasementSegments(width, height, hingeEnd));
  } else if (kind === 'insulation') {
    const count = 6;
    for (let i = 0; i < count; i++) {
      if (horizontal) {
        const xa = b.x0 + width * i / count, xb = b.x0 + width * (i + 1) / count;
        w.line('INSULATION', xa, i % 2 ? b.y0 : b.y1, xb, i % 2 ? b.y1 : b.y0);
      } else {
        const ya = b.y0 + height * i / count, yb = b.y0 + height * (i + 1) / count;
        w.line('INSULATION', i % 2 ? b.x0 : b.x1, ya, i % 2 ? b.x1 : b.x0, yb);
      }
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
  } else if (kind === 'furniture') {
    const ix = width * 0.18, iy = height * 0.18;
    if (width > ix * 2 && height > iy * 2) {
      w.polyline('FURNITURE', [
        [b.x0 + ix, b.y0 + iy], [b.x1 - ix, b.y0 + iy],
        [b.x1 - ix, b.y1 - iy], [b.x0 + ix, b.y1 - iy],
      ]);
    }
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

function constraintInvolvesFurniture(constraint, rectangles) {
  const furnitureIds = new Set((rectangles || [])
    .filter((rect) => zoneKind(rect) === 'furniture')
    .map((rect) => rect.id));
  return [constraint?.a, constraint?.b].some((endpoint) => {
    const id = endpoint?.rect?.id ?? endpoint?.rect;
    return furnitureIds.has(id);
  });
}

// Drop a furniture-anchored dimension unless the opt-in furnitureDims layer is on and
// furniture itself is drawn (mirrors the plan-sheet rule so exports stay consistent).
function skipFurnitureConstraint(constraint, rectangles, layers) {
  if (layers.furniture && layers.furnitureDims) return false;
  return constraintInvolvesFurniture(constraint, rectangles);
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

function writeDimensions(w, floor, layers) {
  let xTier = 0, yTier = 0;
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance' || isMarkerConstraint(c) || Math.abs(c.value) < 5e-7) continue;
    if (skipFurnitureConstraint(c, floor.rectangles, layers)) continue;
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

function writeMarkerDimensions(w, floor, layers) {
  for (const c of floor.constraints || []) {
    if (c.type !== 'distance' || !isMarkerConstraint(c) || Math.abs(c.value) < 5e-7) continue;
    if (skipFurnitureConstraint(c, floor.rectangles, layers)) continue;
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
  } else if (marker.type === 'tv_antenna') {
    w.circle(layer, x, y - r * 0.15, r * 0.72);
    w.circle(layer, x, y - r * 0.15, r * 0.25);
    w.line(layer, x, y + r * 0.57, x - r * 0.52, y + r);
    w.line(layer, x, y + r * 0.57, x + r * 0.52, y + r);
  } else if (marker.type === 'ethernet') {
    w.polyline(layer, [[x - r, y - r * 0.7], [x + r, y - r * 0.7], [x + r, y + r * 0.7], [x - r, y + r * 0.7]]);
    for (let i = 0; i < 8; i++) {
      const px = x - r * 0.56 + i * (r * 1.12 / 7);
      w.line(layer, px, y - r * 0.4, px, y - r * 0.08);
    }
    w.polyline(layer, [[x - r * 0.38, y + r * 0.15], [x + r * 0.38, y + r * 0.15], [x + r * 0.38, y + r * 0.48], [x - r * 0.38, y + r * 0.48]]);
  } else if (marker.type === 'ethernet_dual') {
    for (const dx of [-0.52, 0.52]) {
      const px = x + r * dx;
      w.polyline(layer, [[px - r * 0.44, y - r * 0.7], [px + r * 0.44, y - r * 0.7], [px + r * 0.44, y + r * 0.7], [px - r * 0.44, y + r * 0.7]]);
      w.polyline(layer, [[px - r * 0.3, y + r * 0.42], [px + r * 0.3, y + r * 0.42], [px + r * 0.3, y - r * 0.22], [px + r * 0.16, y - r * 0.22], [px + r * 0.16, y - r * 0.48], [px - r * 0.16, y - r * 0.48], [px - r * 0.16, y - r * 0.22], [px - r * 0.3, y - r * 0.22]]);
      for (let i = 0; i < 4; i++) {
        const contactX = px - r * 0.2 + i * (r * 0.4 / 3);
        w.line(layer, contactX, y + r * 0.34, contactX, y + r * 0.08);
      }
    }
  } else if (marker.type === 'patch_panel') {
    w.polyline(layer, [[x - r, y - r * 0.68], [x + r, y - r * 0.68], [x + r, y + r * 0.68], [x - r, y + r * 0.68]]);
    for (const dy of [-0.3, 0.3]) {
      for (const dx of [-0.6, -0.2, 0.2, 0.6]) {
        const px = x + r * dx, py = y + r * dy, pr = r * 0.13;
        w.polyline(layer, [[px - pr, py - pr], [px + pr, py - pr], [px + pr, py + pr], [px - pr, py + pr]]);
      }
    }
    w.circle(layer, x - r * 0.88, y, r * 0.06);
    w.circle(layer, x + r * 0.88, y, r * 0.06);
  } else if (marker.type === 'outlet_shutter') {
    w.circle(layer, x, y, r);
    for (const dy of [-0.42, -0.12, 0.18, 0.48]) {
      w.line(layer, x - r * 0.58, y + r * dy, x + r * 0.32, y + r * dy);
    }
    w.line(layer, x + r * 0.58, y - r * 0.5, x + r * 0.58, y + r * 0.45);
    w.line(layer, x + r * 0.58, y + r * 0.45, x + r * 0.4, y + r * 0.22);
  } else if (marker.type === 'outlet_aircon') {
    // Square housing (not the round socket) marks an HVAC service point, not an outlet.
    w.polyline(layer, [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]);
    for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3]) {
      const dx = Math.cos(angle) * r * 0.58, dy = Math.sin(angle) * r * 0.58;
      w.line(layer, x - dx, y + r * 0.18 - dy, x + dx, y + r * 0.18 + dy);
    }
    w.line(layer, x, y - r * 0.4, x, y - r * 0.82);
    w.line(layer, x, y - r * 0.82, x + r * 0.5, y - r * 0.82);
    w.circle(layer, x + r * 0.67, y - r * 0.82, r * 0.17);
  } else if (marker.type === 'camera_ethernet') {
    // Network (PoE/IP) camera: body + front lens, plus an ethernet cable tail + RJ45 plug.
    w.polyline(layer, [[x - r * 0.7, y - r * 0.4], [x + r * 0.5, y - r * 0.4], [x + r * 0.5, y + r * 0.4], [x - r * 0.7, y + r * 0.4]]);
    w.circle(layer, x + r * 0.5, y, r * 0.34);
    w.circle(layer, x + r * 0.5, y, r * 0.14);
    w.line(layer, x - r * 0.2, y - r * 0.4, x - r * 0.2, y - r * 0.82);
    w.polyline(layer, [[x - r * 0.34, y - r * 0.82], [x - r * 0.06, y - r * 0.82], [x - r * 0.06, y - r * 1.04], [x - r * 0.34, y - r * 1.04]]);
  } else if (marker.type === 'outlet_cooktop') {
    w.circle(layer, x, y, r);
    for (const [dx, dy] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]])
      w.circle(layer, x + r * dx, y + r * dy, r * 0.22);
  } else if (marker.type === 'outlet_oven') {
    w.circle(layer, x, y, r);
    w.polyline(layer, [[x - r * 0.55, y - r * 0.68], [x + r * 0.55, y - r * 0.68], [x + r * 0.55, y + r * 0.68], [x - r * 0.55, y + r * 0.68]]);
    w.line(layer, x - r * 0.48, y + r * 0.4, x + r * 0.48, y + r * 0.4);
    w.circle(layer, x, y - r * 0.18, r * 0.32);
  } else if (marker.type === 'outlet_water_heater') {
    w.polyline(layer, [[x - r * 0.55, y - r * 0.88], [x + r * 0.55, y - r * 0.88], [x + r * 0.55, y + r * 0.88], [x - r * 0.55, y + r * 0.88]]);
    w.circle(layer, x, y - r * 0.08, r * 0.34);
  } else if (marker.type === 'outlet_appliance') {
    w.circle(layer, x, y, r);
    w.polyline(layer, [[x - r * 0.52, y - r * 0.65], [x + r * 0.52, y - r * 0.65], [x + r * 0.52, y + r * 0.65], [x - r * 0.52, y + r * 0.65]]);
    w.circle(layer, x, y - r * 0.12, r * 0.34);
    w.circle(layer, x - r * 0.34, y + r * 0.42, r * 0.07);
  } else if (marker.type === 'panel') {
    w.polyline(layer, [[x - r * 0.82, y - r * 0.7], [x + r * 0.82, y - r * 0.7], [x + r * 0.82, y + r * 0.7], [x - r * 0.82, y + r * 0.7]]);
    for (const bx of [-0.42, 0, 0.42]) w.polyline(layer, [[x + r * bx - r * 0.08, y - r * 0.28], [x + r * bx + r * 0.08, y - r * 0.28], [x + r * bx + r * 0.08, y + r * 0.28], [x + r * bx - r * 0.08, y + r * 0.28]]);
  } else if (marker.type === 'intercom') {
    w.polyline(layer, [[x - r * 0.68, y - r], [x + r * 0.68, y - r], [x + r * 0.68, y + r], [x - r * 0.68, y + r]]);
    w.polyline(layer, [[x - r * 0.48, y + r * 0.04], [x + r * 0.48, y + r * 0.04], [x + r * 0.48, y + r * 0.72], [x - r * 0.48, y + r * 0.72]]);
    for (const dx of [-0.42, -0.14, 0.14, 0.42]) w.circle(layer, x + r * dx, y - r * 0.34, r * 0.055);
    w.circle(layer, x + r * 0.38, y - r * 0.7, r * 0.14);
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

const WIRE_SURFACE_LAYER = {
  wall: 'ELECTRICAL_ROUTE_WALL',
  ceiling: 'ELECTRICAL_ROUTE_CEILING',
  floor: 'ELECTRICAL_ROUTE_FLOOR',
  riser: 'ELECTRICAL_ROUTE_RISER',
};

// A riser glyph on a floor's plan: a small circle at the slab-penetration point plus a
// UP/DN tag toward the connected storey. Drawn in plan (2D), like all sheet symbols.
function writeRiserGlyph(w, layer, r) {
  w.circle(layer, r.x, r.y, 0.07);
  w.text(layer, r.dir === 'up' ? 'UP' : 'DN', r.x + 0.09, r.y - 0.05, 0.1);
}

function writeElectricalLinks(w, floor) {
  for (const link of floor.electricalLinks || []) {
    if ((link.kind || 'control') !== 'control') continue; // only logical switch→light legs
    const route = electricalRoutePoints(floor, link);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      w.line3d('ELECTRICAL_ROUTE', a.x, a.y, a.z, b.x, b.y, b.z, 'DOTTED');
    }
  }
}

// The whole-house conduit network filtered to one floor: intra-floor runs as true-3D
// LINEs at storey-LOCAL Z (elevation subtracted, matching the control routes/markers on
// this sheet), and slab-piercing risers as plan glyphs on the CONDUIT_RISER layer.
function writeConduits(w, project, floor) {
  const dz = floor.elevation || 0;
  const { runs, risers } = segmentsForFloor(floor, conduitNetworkSegments(project));
  for (const s of runs) {
    w.line3d('CONDUIT', s.a.x, s.a.y, s.a.z - dz, s.b.x, s.b.y, s.b.z - dz, 'DASHED');
  }
  for (const r of risers) writeRiserGlyph(w, 'CONDUIT_RISER', r);
}

// Wires routed over the conduits, split onto per-surface layers (wall/ceiling/floor/
// riser) so the inferred run location survives into CAD. Filtered per floor: intra-floor
// legs are true-3D at local Z; slab crossings become riser glyphs.
function writeRoutedWires(w, project, floor) {
  const dz = floor.elevation || 0;
  const worldSegs = (project.wires || []).flatMap((wire) => wireRouteSegments(project, wire));
  const { runs, risers } = segmentsForFloor(floor, worldSegs);
  for (const s of runs) {
    const layer = WIRE_SURFACE_LAYER[s.surface] || 'ELECTRICAL_ROUTE_WALL';
    w.line3d(layer, s.a.x, s.a.y, s.a.z - dz, s.b.x, s.b.y, s.b.z - dz, 'DOTTED');
  }
  for (const r of risers) writeRiserGlyph(w, 'ELECTRICAL_ROUTE_RISER', r);
}

/**
 * Export one floor as an ASCII AutoCAD 2000 DXF in millimeters.
 * Geometry is full-size (1 model meter = 1000 DXF units), never paper-scaled.
 * `project` supplies the whole-house conduit network + wires (they span floors);
 * only the parts touching `floor` are drawn, with slab crossings as riser glyphs.
 */
export function floorToDxf(project, floor, opts = {}) {
  const layers = resolveOutputLayers(opts);
  const rectangles = floor.rectangles.filter((rect) => layers.furniture || zoneKind(rect) !== 'furniture');
  const w = new DxfWriter();
  writeHeader(w);
  writeTables(w);
  w.pair(0, 'SECTION'); w.pair(2, 'ENTITIES');

  w.point('ORIGIN', 0, 0);
  const footprint = computeFootprint(rectangles);
  for (const polygon of footprint) for (const ring of polygon) w.polyline('FOOTPRINT', ring);

  for (const rect of rectangles) {
    const kind = zoneKind(rect);
    const layer = kind.toUpperCase();
    w.polyline(layer, rectPoints(rect));
    writeZoneSymbol(w, rect, kind);
  }

  if (layers.planDims) writeDimensions(w, floor, layers);
  if (layers.markerDims) writeMarkerDimensions(w, floor, layers);
  if (layers.markerIcons) {
    for (const marker of floor.markers || []) writeMarker(w, marker);
    if (layers.wiring) { // conduit network + routed wires are an opt-in layer (default off)
      writeConduits(w, project, floor);
      writeRoutedWires(w, project, floor);
    }
    writeElectricalLinks(w, floor);
  }

  if (layers.area) {
    for (const component of connectedRoomComponents(floor.rectangles)) {
      const anchor = component.rectangles.reduce((largest, rect) => {
        const b = rect.bounds, lb = largest.bounds;
        return (b.x1 - b.x0) * (b.y1 - b.y0) > (lb.x1 - lb.x0) * (lb.y1 - lb.y0) ? rect : largest;
      });
      const b = anchor.bounds;
      w.text('ROOM_INFO', `AREA=${component.area.toFixed(2)}m2`,
        (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0.16);
    }
  }

  w.pair(0, 'ENDSEC'); w.pair(0, 'EOF');
  return w.toString();
}

// Coohom's CAD recognizer works best on a deliberately sparse architectural
// drawing: one floor in model space, millimetres, with only wall faces, doors,
// and windows. Keep this separate from the detailed archival/electrical DXF.
const COOHOM_LAYERS = [
  ['WALL', 7, 'CONTINUOUS'],
  ['WINDOW', 7, 'CONTINUOUS'],
];

// R12 ASCII deliberately avoids the handles, subclass markers, block-record
// tables, and object dictionaries required by later DXF revisions. Recognition
// services tend to accept this small interchange subset more reliably.
class R12DxfWriter extends DxfWriter {
  entity(type, layer, _subclass, linetype = null) {
    this.pair(0, type);
    this.pair(8, layer);
    if (linetype) this.pair(6, linetype);
  }
}

function writeR12CoohomHeader(w) {
  w.pair(0, 'SECTION'); w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER'); w.pair(1, 'AC1009');
  w.pair(9, '$MEASUREMENT'); w.pair(70, 1);
  w.pair(0, 'ENDSEC');
}

function writeR12CoohomTables(w) {
  w.pair(0, 'SECTION'); w.pair(2, 'TABLES');
  w.pair(0, 'TABLE'); w.pair(2, 'LTYPE'); w.pair(70, 1);
  w.pair(0, 'LTYPE'); w.pair(2, 'CONTINUOUS'); w.pair(70, 0);
  w.pair(3, 'Solid line'); w.pair(72, 65); w.pair(73, 0); w.pair(40, 0);
  w.pair(0, 'ENDTAB');
  w.pair(0, 'TABLE'); w.pair(2, 'LAYER'); w.pair(70, COOHOM_LAYERS.length);
  for (const [name, color, linetype] of COOHOM_LAYERS) {
    w.pair(0, 'LAYER'); w.pair(2, name); w.pair(70, 0);
    w.pair(62, color); w.pair(6, linetype);
  }
  w.pair(0, 'ENDTAB');
  w.pair(0, 'ENDSEC');
}

function coohomLineWriter(w) {
  const seen = new Set();
  return (layer, ax, ay, bx, by) => {
    const a = [cleanNumber(ax), cleanNumber(ay)];
    const b = [cleanNumber(bx), cleanNumber(by)];
    const ordered = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
    const key = `${layer}:${ordered[0].join(',')}:${ordered[1].join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    w.line(layer, ax, ay, bx, by);
  };
}

function writeCoohomWindow(line, rect) {
  const b = rect.bounds;
  const width = b.x1 - b.x0, height = b.y1 - b.y0;
  // Four parallel projection lines match Coohom's documented linear-window
  // convention. End caps are intentionally omitted to avoid a generic rectangle.
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    if (width >= height) {
      const y = b.y0 + height * t;
      line('WINDOW', b.x0, y, b.x1, y);
    } else {
      const x = b.x0 + width * t;
      line('WINDOW', x, b.y0, x, b.y1);
    }
  }
}

// Remove door intervals from axis-aligned wall faces. Coohom then receives a
// literal opening rather than a door symbol it might fail to recognize.
function writeCoohomWallSegment(line, a, b, doors) {
  const epsilon = 1e-7;
  const horizontal = Math.abs(a[1] - b[1]) <= epsilon;
  const vertical = Math.abs(a[0] - b[0]) <= epsilon;
  if (!horizontal && !vertical) {
    line('WALL', a[0], a[1], b[0], b[1]);
    return;
  }
  const start = horizontal ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]);
  const end = horizontal ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
  const fixed = horizontal ? a[1] : a[0];
  const cuts = [];
  for (const door of doors) {
    const d = door.bounds;
    const doorHorizontal = d.x1 - d.x0 >= d.y1 - d.y0;
    if (horizontal !== doorHorizontal) continue;
    const crosses = horizontal
      ? fixed >= d.y0 - epsilon && fixed <= d.y1 + epsilon
      : fixed >= d.x0 - epsilon && fixed <= d.x1 + epsilon;
    if (!crosses) continue;
    const lo = Math.max(start, horizontal ? d.x0 : d.y0);
    const hi = Math.min(end, horizontal ? d.x1 : d.y1);
    if (hi > lo + epsilon) cuts.push([lo, hi]);
  }
  cuts.sort((x, y) => x[0] - y[0]);
  let cursor = start;
  for (const [lo, hi] of cuts) {
    if (lo > cursor + epsilon) {
      if (horizontal) line('WALL', cursor, fixed, lo, fixed);
      else line('WALL', fixed, cursor, fixed, lo);
    }
    cursor = Math.max(cursor, hi);
  }
  if (cursor < end - epsilon) {
    if (horizontal) line('WALL', cursor, fixed, end, fixed);
    else line('WALL', fixed, cursor, fixed, end);
  }
}

/**
 * Recognition-oriented DXF for Coohom: one floor, 2D model space, millimetres,
 * and no annotations/electrical/furniture entities. Rooms provide the wall-face
 * linework; explicit WALL rectangles preserve authored wall thicknesses.
 */
export function floorToCoohomDxf(floor) {
  const w = new R12DxfWriter();
  writeR12CoohomHeader(w);
  writeR12CoohomTables(w);
  w.pair(0, 'SECTION'); w.pair(2, 'ENTITIES');
  const line = coohomLineWriter(w);

  // Union room construction rectangles first, otherwise their authored seams
  // would be misread as walls. Include explicit WALL subtraction rectangles so
  // their opposite faces remain present in the resulting free-space boundary.
  const structural = (floor.rectangles || [])
    .filter((rect) => ['room', 'wall', 'insulation'].includes(zoneKind(rect)));
  const doors = (floor.rectangles || []).filter((rect) => zoneKind(rect) === 'door');
  const footprint = computeFootprint(structural);
  for (const polygon of footprint) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        writeCoohomWallSegment(line, a, b, doors);
      }
    }
  }
  for (const rect of floor.rectangles || []) {
    const kind = zoneKind(rect);
    if (kind === 'window') writeCoohomWindow(line, rect);
  }

  w.pair(0, 'ENDSEC'); w.pair(0, 'EOF');
  // AutoCAD-authored ASCII DXF conventionally uses CRLF; keep the recognition
  // preset conservative for importers with stricter text parsers.
  return w.toString().replace(/\n/g, '\r\n');
}
