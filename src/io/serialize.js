// Serialize / deserialize a Project to plain JSON. This is the persistent,
// parametric definition of the house: floors (each = rectangles + constraints +
// markers + electrical links + furniture + height) plus which floor is ground/active,
// plus the WHOLE-HOUSE conduit network (nodes + segments) and wires that span floors.
// The downstream footprint/extrusion and each floor's derived elevation are always
// recomputed, never stored.
//
// File version history: v1 legacy single-floor; v2 floors[] with per-floor conduit/
// wires; v3 lifts the conduit network + wires to the top level (cross-floor). v1/v2
// files load by migrating each floor's network up (stamping node floorIds) — see
// deserializeInto.

import {
  Floor, Rectangle, nextMarkerId, nextElectricalLinkId,
  nextConduitNodeId, nextConduitSegmentId, nextWireId, nextFurnitureId,
  syncRectIdCounter, syncFloorIdCounter, syncMarkerIdCounter, syncElectricalLinkIdCounter,
  syncConduitNodeIdCounter, syncConduitSegmentIdCounter, syncWireIdCounter, syncFurnitureIdCounter,
} from '../core/model.js';
import { ORIGIN_ID, nextConstraintId, syncConstraintIdCounter } from '../core/constraints.js';

export const FILE_VERSION = 3;
export const FLOOR_CLIPBOARD_KEY = 'house-cad:floor-clipboard:v1';
export const FLOOR_CLIPBOARD_VERSION = 1;

function serializeRect(r) {
  const out = { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, op: r.op, kind: r.kind };
  // Aperture fields (opening band + hinge) only exist on door/window/half wall;
  // omit them everywhere else so plain zones stay compact. Missing on load →
  // the Rectangle constructor re-applies the per-kind default (back-compat).
  if (r.sill !== undefined) out.sill = r.sill;
  if (r.head !== undefined) out.head = r.head;
  if (r.hinge !== undefined) out.hinge = r.hinge;
  if (r.swing !== undefined) out.swing = r.swing;
  // Furniture placeholders carry a solid body band [foot, top]; omit elsewhere.
  if (r.foot !== undefined) out.foot = r.foot;
  if (r.top !== undefined) out.top = r.top;
  return out;
}
function serializeConstraint(c) {
  return {
    id: c.id, type: c.type, axis: c.axis,
    a: { ...c.a }, b: { ...c.b }, value: c.value,
    offset: c.offset ?? null,
    labelT: Number.isFinite(c.labelT) ? c.labelT : 0.5,
  };
}
// zDatum/zOff (ceiling-relative height) are omitted when absent → the marker reads as
// a plain absolute z (floor datum), the back-compat default.
function serializeMarker(m) {
  const out = { id: m.id, type: m.type, x: m.x, y: m.y, z: m.z };
  if (m.zDatum) { out.zDatum = m.zDatum; out.zOff = m.zOff || 0; }
  return out;
}
function serializeRoute(route) {
  const mode = route?.mode || 'ceiling';
  const out = { mode };
  if (mode === 'manual' && Array.isArray(route.waypoints)) {
    out.waypoints = route.waypoints.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
  }
  return out;
}
function serializeElectricalLink(link) {
  return {
    id: link.id,
    kind: link.kind || 'control',
    fromMarkerId: link.fromMarkerId,
    toMarkerId: link.toMarkerId,
    route: serializeRoute(link.route),
  };
}
function serializeConduitNode(n) {
  const out = { id: n.id, x: n.x, y: n.y, z: n.z || 0, floorId: n.floorId || null, markerId: n.markerId || null };
  if (n.zDatum) { out.zDatum = n.zDatum; out.zOff = n.zOff || 0; }
  return out;
}
function serializeConduitSegment(s) {
  return { id: s.id, a: s.a, b: s.b };
}
function serializeWire(w) {
  return { id: w.id, fromMarkerId: w.fromMarkerId, toMarkerId: w.toMarkerId, via: [...(w.via || [])] };
}
function serializeFurniture(f) {
  const out = { id: f.id, article: f.article, x: f.x, y: f.y, z: f.z || 0, rotationY: f.rotationY || 0, name: f.name || null };
  if (f.zDatum) { out.zDatum = f.zDatum; out.zOff = f.zOff || 0; }
  return out;
}

export function serializeFloor(f) {
  return {
    id: f.id,
    name: f.name,
    height: f.height,
    rectangles: f.rectangles.map(serializeRect),
    constraints: f.constraints.map(serializeConstraint),
    markers: f.markers.map(serializeMarker),
    electricalLinks: (f.electricalLinks || []).map(serializeElectricalLink),
    // conduitNodes/conduitSegments/wires are whole-house (top level), not per-floor.
    // `_demo`-flagged items (if any transient ones exist) never persist.
    furniture: (f.furniture || []).filter((x) => !x._demo).map(serializeFurniture),
  };
}

export function serializeProject(project) {
  return {
    app: 'house-cad',
    version: FILE_VERSION,
    revision: project.revision || 0, // saved-revision counter (advanced by explicit saves)
    activeFloorId: project.activeFloorId,
    groundFloorId: project.groundFloorId,
    floors: project.floors.map(serializeFloor),
    // Whole-house conduit network + wires (span floors).
    conduitNodes: (project.conduitNodes || []).map(serializeConduitNode),
    conduitSegments: (project.conduitSegments || []).map(serializeConduitSegment),
    wires: (project.wires || []).map(serializeWire),
  };
}

// A self-contained floor clipboard can outlive a project load. Pasting always mints
// fresh object ids and remaps every internal reference, so ids from two saves cannot
// collide. It replaces only the selected floor's authored plan; that destination
// floor keeps its id/name/height/elevation and ground-floor role.
//
// The conduit network + wires are whole-house, so a floor clipboard carries only the
// INTRA-FLOOR subset: nodes on this floor (bound to its markers, or bare with its
// floorId), segments whose both ends are in that subset, and wires whose both markers
// live on this floor. Cross-floor risers/wires (referencing another storey) are not
// carried, since the other floor is not part of the copy.
export function createFloorClipboard(project, floor) {
  const markerIds = new Set((floor.markers || []).map((m) => m.id));
  const nodes = (project.conduitNodes || []).filter((n) =>
    n.markerId ? markerIds.has(n.markerId) : n.floorId === floor.id);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const segments = (project.conduitSegments || []).filter((s) => nodeIds.has(s.a) && nodeIds.has(s.b));
  const wires = (project.wires || []).filter((w) => markerIds.has(w.fromMarkerId) && markerIds.has(w.toMarkerId));
  return {
    app: 'house-cad-floor',
    version: FLOOR_CLIPBOARD_VERSION,
    floor: serializeFloor(floor),
    conduitNodes: nodes.map(serializeConduitNode),
    conduitSegments: segments.map(serializeConduitSegment),
    wires: wires.map((w) => ({ ...serializeWire(w), via: (w.via || []).filter((v) => nodeIds.has(v)) })),
  };
}

export function pasteFloorClipboard(project, clipboard, { targetId = project.activeFloorId } = {}) {
  if (!clipboard || clipboard.app !== 'house-cad-floor' || clipboard.version !== FLOOR_CLIPBOARD_VERSION) {
    throw new Error('Invalid floor clipboard.');
  }
  const source = clipboard.floor;
  if (!source || typeof source !== 'object') throw new Error('Missing copied floor.');
  const err = validateProjectData({ floors: [source] });
  if (err) throw new Error(err);
  for (const m of (source.markers || [])) {
    if (['x', 'y', 'z'].some((k) => typeof m[k] !== 'number')) {
      throw new Error('A copied marker is missing numeric x/y/z.');
    }
  }
  for (const c of (source.constraints || [])) {
    if (!c.a || !c.b || typeof c.value !== 'number') {
      throw new Error('A copied dimension is incomplete.');
    }
  }
  for (const link of (source.electricalLinks || [])) {
    if (typeof link.fromMarkerId !== 'string' || typeof link.toMarkerId !== 'string') {
      throw new Error('A copied electrical link is missing its marker endpoints.');
    }
  }
  const target = project.floors.find((f) => f.id === targetId);
  if (!target) throw new Error('Selected destination floor no longer exists.');

  const rectIds = new Map();
  const rectangles = (source.rectangles || []).map((r) => {
    const copy = new Rectangle({ x: r.x, y: r.y, w: r.w, h: r.h, op: r.op || 'add', kind: r.kind, sill: r.sill, head: r.head, hinge: r.hinge, swing: r.swing, foot: r.foot, top: r.top });
    rectIds.set(r.id, copy.id);
    return copy;
  });
  const markerIds = new Map();
  const markers = (source.markers || []).map((m) => {
    const copy = {
      id: nextMarkerId(), type: m.type || 'outlet', x: m.x, y: m.y, z: m.z,
      ...(m.zDatum ? { zDatum: m.zDatum, zOff: m.zOff || 0 } : {}),
      _locked: { x: false, y: false },
    };
    markerIds.set(m.id, copy.id);
    return copy;
  });

  // Conduit network + wires (whole-house): the clipboard carries the source floor's
  // intra-floor subset at the top level; older floor clipboards stored it inside `floor`.
  // Built BEFORE constraints so a node-dim endpoint ({node}) can remap onto the copied
  // node ids. Rebind marker-bound nodes to the copied markers; stamp bare junctions with
  // the DESTINATION floor id.
  const srcNodes = clipboard.conduitNodes ?? source.conduitNodes ?? [];
  const srcSegments = clipboard.conduitSegments ?? source.conduitSegments ?? [];
  const srcWires = clipboard.wires ?? source.wires ?? [];
  const nodeIds = new Map();
  const conduitNodes = srcNodes.flatMap((n) => {
    const markerId = n.markerId ? markerIds.get(n.markerId) : null;
    if (n.markerId && !markerId) return []; // its device didn't come across
    const copy = { id: nextConduitNodeId(), x: n.x, y: n.y, z: n.z || 0, ...(n.zDatum ? { zDatum: n.zDatum, zOff: n.zOff || 0 } : {}), floorId: target.id, markerId: markerId || null };
    nodeIds.set(n.id, copy.id);
    return [copy];
  });

  const remapEndpoint = (ep) => {
    if (!ep || typeof ep !== 'object') return null;
    if (ep.marker) {
      const id = markerIds.get(ep.marker);
      return id ? { ...ep, marker: id } : null;
    }
    if (ep.node) {
      const id = nodeIds.get(ep.node);
      return id ? { ...ep, node: id } : null; // node didn't cross → drop the dim
    }
    if (ep.rect === ORIGIN_ID) return { ...ep };
    const id = rectIds.get(ep.rect);
    return id ? { ...ep, rect: id } : null;
  };
  const constraints = (source.constraints || []).flatMap((c) => {
    const a = remapEndpoint(c.a), b = remapEndpoint(c.b);
    if (!a || !b) return []; // never bind an imported constraint to an accidental destination id
    return [{
      id: nextConstraintId(), type: c.type || 'distance', axis: c.axis,
      a, b, value: c.value,
      offset: typeof c.offset === 'number' ? c.offset : null,
      labelT: Number.isFinite(c.labelT) ? c.labelT : 0.5,
      conflict: false,
    }];
  });
  const electricalLinks = (source.electricalLinks || []).flatMap((link) => {
    const fromMarkerId = markerIds.get(link.fromMarkerId);
    const toMarkerId = markerIds.get(link.toMarkerId);
    if (!fromMarkerId || !toMarkerId) return [];
    return [{
      id: nextElectricalLinkId(),
      kind: link.kind || 'control',
      fromMarkerId,
      toMarkerId,
      route: serializeRoute(link.route),
    }];
  });
  // Segments/wires reference the copied node ids (nodeIds, built above with the nodes).
  const conduitSegments = srcSegments.flatMap((s) => {
    const a = nodeIds.get(s.a), b = nodeIds.get(s.b);
    if (!a || !b) return [];
    return [{ id: nextConduitSegmentId(), a, b }];
  });
  const wires = srcWires.flatMap((w) => {
    const fromMarkerId = markerIds.get(w.fromMarkerId);
    const toMarkerId = markerIds.get(w.toMarkerId);
    if (!fromMarkerId || !toMarkerId) return [];
    const via = (w.via || []).map((v) => nodeIds.get(v)).filter(Boolean);
    return [{ id: nextWireId(), fromMarkerId, toMarkerId, via }];
  });
  // Furniture has no cross-references — just mint fresh ids.
  const furniture = (source.furniture || []).map((x) => ({
    id: nextFurnitureId(), article: String(x.article), x: x.x, y: x.y, z: x.z || 0,
    ...(x.zDatum ? { zDatum: x.zDatum, zOff: x.zOff || 0 } : {}),
    rotationY: x.rotationY || 0, name: x.name || null,
  }));

  // Drop the destination floor's OLD network slice before its plan is replaced (mirror
  // Project.clear): nodes bound to its outgoing markers or bare on its floor, plus the
  // segments/wires that then lose an endpoint.
  const oldMarkerIds = new Set((target.markers || []).map((m) => m.id));
  const goneNodeIds = new Set((project.conduitNodes || [])
    .filter((n) => n.markerId ? oldMarkerIds.has(n.markerId) : n.floorId === target.id)
    .map((n) => n.id));
  project.conduitNodes = (project.conduitNodes || []).filter((n) => !goneNodeIds.has(n.id));
  project.conduitSegments = (project.conduitSegments || []).filter((s) => !goneNodeIds.has(s.a) && !goneNodeIds.has(s.b));
  project.wires = (project.wires || []).filter((w) => !oldMarkerIds.has(w.fromMarkerId) && !oldMarkerIds.has(w.toMarkerId));
  for (const w of project.wires) w.via = (w.via || []).filter((v) => !goneNodeIds.has(v));

  target.rectangles = rectangles;
  target.constraints = constraints;
  target.markers = markers;
  target.electricalLinks = electricalLinks;
  target.furniture = furniture;
  // Append the remapped intra-floor network subset to the whole-house arrays.
  project.conduitNodes.push(...conduitNodes);
  project.conduitSegments.push(...conduitSegments);
  project.wires.push(...wires);
  project.activeFloorId = target.id;
  project._emit();
  return target;
}

// Normalize either shape (v2 floors[], or legacy v1 top-level rectangles) into a
// list of plain floor descriptors. Returns null if the data is unusable.
function floorDescriptors(data) {
  if (Array.isArray(data.floors)) return data.floors;
  if (Array.isArray(data.rectangles)) {
    // Legacy v1: one implicit Ground floor.
    return [{
      name: 'Ground',
      height: data.height,
      rectangles: data.rectangles,
      constraints: data.constraints || [],
    }];
  }
  return null;
}

// Basic shape validation so a bad/foreign file fails loudly, not silently.
export function validateProjectData(data) {
  if (!data || typeof data !== 'object') return 'Not a JSON object.';
  if (data.app && data.app !== 'house-cad') return `Unknown file (app="${data.app}").`;
  const floors = floorDescriptors(data);
  if (!floors) return 'Missing "floors" (or legacy "rectangles") array.';
  if (!floors.length) return 'File has no floors.';
  // Whole-house network arrays (v3) are optional but must be arrays when present.
  for (const key of ['conduitNodes', 'conduitSegments', 'wires']) {
    if (data[key] != null && !Array.isArray(data[key])) return `"${key}" must be an array.`;
  }
  for (const f of floors) {
    if (!Array.isArray(f.rectangles)) return 'A floor is missing its "rectangles" array.';
    for (const r of f.rectangles) {
      if (['x', 'y', 'w', 'h'].some((k) => typeof r[k] !== 'number')) {
        return 'A rectangle is missing numeric x/y/w/h.';
      }
    }
    if (f.constraints && !Array.isArray(f.constraints)) return '"constraints" must be an array.';
    if (f.markers && !Array.isArray(f.markers)) return '"markers" must be an array.';
    if (f.electricalLinks && !Array.isArray(f.electricalLinks)) return '"electricalLinks" must be an array.';
    for (const link of (f.electricalLinks || [])) {
      if (typeof link.fromMarkerId !== 'string' || typeof link.toMarkerId !== 'string') {
        return 'An electrical link is missing marker endpoint ids.';
      }
    }
  }
  return null; // ok
}

function makeConstraint(c) {
  return {
    id: c.id,
    type: c.type || 'distance',
    axis: c.axis,
    a: { ...c.a },
    b: { ...c.b },
    value: c.value,
    offset: typeof c.offset === 'number' ? c.offset : null,
    labelT: Number.isFinite(c.labelT) ? c.labelT : 0.5,
    conflict: false,
  };
}

// Replace the project's contents from parsed JSON data. Emits one change.
export function deserializeInto(project, data) {
  const err = validateProjectData(data);
  if (err) throw new Error(err);

  const descriptors = floorDescriptors(data);
  // Reserve every authored link id before minting a fallback for hand-edited data,
  // preventing a missing id from colliding with a later `elN` in the same file.
  syncElectricalLinkIdCounter(descriptors.flatMap((f) =>
    (f.electricalLinks || []).map((link) => link.id).filter(Boolean)));
  const floors = descriptors.map((f) => new Floor({
    id: f.id, // undefined for legacy → Floor mints one
    name: f.name || 'Floor',
    height: typeof f.height === 'number' ? f.height : 2.8,
    rectangles: (f.rectangles || []).map(
      (r) => new Rectangle({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, op: r.op || 'add', kind: r.kind, sill: r.sill, head: r.head, hinge: r.hinge, swing: r.swing, foot: r.foot, top: r.top }),
    ),
    constraints: (f.constraints || []).map(makeConstraint),
    markers: (f.markers || []).map((m) => ({
      id: m.id, type: m.type || 'outlet', x: m.x, y: m.y, z: m.z,
      ...(m.zDatum ? { zDatum: m.zDatum, zOff: m.zOff || 0 } : {}),
      _locked: { x: false, y: false },
    })),
    electricalLinks: (f.electricalLinks || []).map((link) => ({
      id: link.id || nextElectricalLinkId(),
      kind: link.kind || 'control',
      fromMarkerId: link.fromMarkerId,
      toMarkerId: link.toMarkerId,
      route: serializeRoute(link.route),
    })),
    furniture: (f.furniture || []).map((x) => ({
      id: x.id || nextFurnitureId(), article: String(x.article), x: x.x, y: x.y, z: x.z || 0,
      ...(x.zDatum ? { zDatum: x.zDatum, zOff: x.zOff || 0 } : {}),
      rotationY: x.rotationY || 0, name: x.name || null,
    })),
  }));

  project.floors = floors;
  project.revision = Number.isFinite(data.revision) ? data.revision : 0; // 0 for pre-revision files
  project.groundFloorId = floors.some((f) => f.id === data.groundFloorId)
    ? data.groundFloorId : floors[0].id;
  project.activeFloorId = floors.some((f) => f.id === data.activeFloorId)
    ? data.activeFloorId : floors[0].id;

  // Whole-house conduit network + wires. v3 stores them at the top level; v1/v2 stored
  // them per-floor, so MIGRATE by gathering each floor's arrays and stamping every
  // conduit node with that floor's id (each old network was single-floor → same geometry).
  const fallbackFloorId = project.groundFloorId;
  const makeNode = (n, floorId) => ({
    id: n.id || nextConduitNodeId(), x: n.x, y: n.y, z: n.z || 0,
    ...(n.zDatum ? { zDatum: n.zDatum, zOff: n.zOff || 0 } : {}),
    floorId: n.floorId || floorId || fallbackFloorId, markerId: n.markerId || null,
  });
  const makeSeg = (s) => ({ id: s.id || nextConduitSegmentId(), a: s.a, b: s.b });
  const makeWire = (w) => ({
    id: w.id || nextWireId(), fromMarkerId: w.fromMarkerId, toMarkerId: w.toMarkerId, via: [...(w.via || [])],
  });
  const topLevelNetwork = Array.isArray(data.conduitNodes) || Array.isArray(data.conduitSegments) || Array.isArray(data.wires);
  if (topLevelNetwork) {
    project.conduitNodes = (data.conduitNodes || []).map((n) => makeNode(n, n.floorId));
    project.conduitSegments = (data.conduitSegments || []).map(makeSeg);
    project.wires = (data.wires || []).map(makeWire);
  } else {
    project.conduitNodes = [];
    project.conduitSegments = [];
    project.wires = [];
    descriptors.forEach((f, i) => {
      const floorId = floors[i].id;
      for (const n of (f.conduitNodes || [])) project.conduitNodes.push(makeNode(n, floorId));
      for (const s of (f.conduitSegments || [])) project.conduitSegments.push(makeSeg(s));
      for (const w of (f.wires || [])) project.wires.push(makeWire(w));
    });
  }

  // Ensure future auto-generated ids don't collide with loaded ones.
  syncFloorIdCounter(floors.map((f) => f.id));
  syncRectIdCounter(floors.flatMap((f) => f.rectangles.map((r) => r.id)));
  syncConstraintIdCounter(floors.flatMap((f) => f.constraints.map((c) => c.id)));
  syncMarkerIdCounter(floors.flatMap((f) => f.markers.map((m) => m.id)));
  syncElectricalLinkIdCounter(floors.flatMap((f) => f.electricalLinks.map((link) => link.id)));
  syncConduitNodeIdCounter(project.conduitNodes.map((n) => n.id));
  syncConduitSegmentIdCounter(project.conduitSegments.map((s) => s.id));
  syncWireIdCounter(project.wires.map((w) => w.id));
  syncFurnitureIdCounter(floors.flatMap((f) => f.furniture.map((x) => x.id)));

  project._emit();
}
