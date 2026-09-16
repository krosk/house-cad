// Serialize / deserialize a Project to plain JSON. This is the persistent,
// parametric definition of the house: floors (each = rectangles + constraints +
// markers + electrical links + height) plus which floor is ground/active. The downstream footprint/extrusion
// and each floor's derived elevation are always recomputed, never stored.

import {
  Floor, Rectangle, nextMarkerId, nextElectricalLinkId,
  nextConduitNodeId, nextConduitSegmentId, nextWireId,
  syncRectIdCounter, syncFloorIdCounter, syncMarkerIdCounter, syncElectricalLinkIdCounter,
  syncConduitNodeIdCounter, syncConduitSegmentIdCounter, syncWireIdCounter,
} from '../core/model.js';
import { ORIGIN_ID, nextConstraintId, syncConstraintIdCounter } from '../core/constraints.js';

export const FILE_VERSION = 2;
export const FLOOR_CLIPBOARD_KEY = 'house-cad:floor-clipboard:v1';
export const FLOOR_CLIPBOARD_VERSION = 1;

function serializeRect(r) {
  return { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, op: r.op, kind: r.kind };
}
function serializeConstraint(c) {
  return {
    id: c.id, type: c.type, axis: c.axis,
    a: { ...c.a }, b: { ...c.b }, value: c.value,
    offset: c.offset ?? null,
    labelT: Number.isFinite(c.labelT) ? c.labelT : 0.5,
  };
}
function serializeMarker(m) {
  return { id: m.id, type: m.type, x: m.x, y: m.y, z: m.z };
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
  return { id: n.id, x: n.x, y: n.y, z: n.z || 0, markerId: n.markerId || null };
}
function serializeConduitSegment(s) {
  return { id: s.id, a: s.a, b: s.b };
}
function serializeWire(w) {
  return { id: w.id, fromMarkerId: w.fromMarkerId, toMarkerId: w.toMarkerId, via: [...(w.via || [])] };
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
    conduitNodes: (f.conduitNodes || []).map(serializeConduitNode),
    conduitSegments: (f.conduitSegments || []).map(serializeConduitSegment),
    wires: (f.wires || []).map(serializeWire),
  };
}

export function serializeProject(project) {
  return {
    app: 'house-cad',
    version: FILE_VERSION,
    activeFloorId: project.activeFloorId,
    groundFloorId: project.groundFloorId,
    floors: project.floors.map(serializeFloor),
  };
}

// A self-contained floor clipboard can outlive a project load. Pasting always mints
// fresh object ids and remaps every internal reference, so ids from two saves cannot
// collide. It replaces only the selected floor's authored plan; that destination
// floor keeps its id/name/height/elevation and ground-floor role.
export function createFloorClipboard(floor) {
  return {
    app: 'house-cad-floor',
    version: FLOOR_CLIPBOARD_VERSION,
    floor: serializeFloor(floor),
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
    const copy = new Rectangle({ x: r.x, y: r.y, w: r.w, h: r.h, op: r.op || 'add', kind: r.kind });
    rectIds.set(r.id, copy.id);
    return copy;
  });
  const markerIds = new Map();
  const markers = (source.markers || []).map((m) => {
    const copy = {
      id: nextMarkerId(), type: m.type || 'outlet', x: m.x, y: m.y, z: m.z,
      _locked: { x: false, y: false },
    };
    markerIds.set(m.id, copy.id);
    return copy;
  });

  const remapEndpoint = (ep) => {
    if (!ep || typeof ep !== 'object') return null;
    if (ep.marker) {
      const id = markerIds.get(ep.marker);
      return id ? { ...ep, marker: id } : null;
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
  // Conduit network + wires: remap node/segment ids, rebind marker-bound nodes and
  // wire endpoints/vias to the copied markers/nodes. Drop anything that loses a ref.
  const nodeIds = new Map();
  const conduitNodes = (source.conduitNodes || []).flatMap((n) => {
    const markerId = n.markerId ? markerIds.get(n.markerId) : null;
    if (n.markerId && !markerId) return []; // its device didn't come across
    const copy = { id: nextConduitNodeId(), x: n.x, y: n.y, z: n.z || 0, markerId: markerId || null };
    nodeIds.set(n.id, copy.id);
    return [copy];
  });
  const conduitSegments = (source.conduitSegments || []).flatMap((s) => {
    const a = nodeIds.get(s.a), b = nodeIds.get(s.b);
    if (!a || !b) return [];
    return [{ id: nextConduitSegmentId(), a, b }];
  });
  const wires = (source.wires || []).flatMap((w) => {
    const fromMarkerId = markerIds.get(w.fromMarkerId);
    const toMarkerId = markerIds.get(w.toMarkerId);
    if (!fromMarkerId || !toMarkerId) return [];
    const via = (w.via || []).map((v) => nodeIds.get(v)).filter(Boolean);
    return [{ id: nextWireId(), fromMarkerId, toMarkerId, via }];
  });

  target.rectangles = rectangles;
  target.constraints = constraints;
  target.markers = markers;
  target.electricalLinks = electricalLinks;
  target.conduitNodes = conduitNodes;
  target.conduitSegments = conduitSegments;
  target.wires = wires;
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
      (r) => new Rectangle({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, op: r.op || 'add', kind: r.kind }),
    ),
    constraints: (f.constraints || []).map(makeConstraint),
    markers: (f.markers || []).map((m) => ({
      id: m.id, type: m.type || 'outlet', x: m.x, y: m.y, z: m.z,
      _locked: { x: false, y: false },
    })),
    electricalLinks: (f.electricalLinks || []).map((link) => ({
      id: link.id || nextElectricalLinkId(),
      kind: link.kind || 'control',
      fromMarkerId: link.fromMarkerId,
      toMarkerId: link.toMarkerId,
      route: serializeRoute(link.route),
    })),
    conduitNodes: (f.conduitNodes || []).map((n) => ({
      id: n.id || nextConduitNodeId(), x: n.x, y: n.y, z: n.z || 0, markerId: n.markerId || null,
    })),
    conduitSegments: (f.conduitSegments || []).map((s) => ({
      id: s.id || nextConduitSegmentId(), a: s.a, b: s.b,
    })),
    wires: (f.wires || []).map((w) => ({
      id: w.id || nextWireId(), fromMarkerId: w.fromMarkerId, toMarkerId: w.toMarkerId, via: [...(w.via || [])],
    })),
  }));

  project.floors = floors;
  project.groundFloorId = floors.some((f) => f.id === data.groundFloorId)
    ? data.groundFloorId : floors[0].id;
  project.activeFloorId = floors.some((f) => f.id === data.activeFloorId)
    ? data.activeFloorId : floors[0].id;

  // Ensure future auto-generated ids don't collide with loaded ones.
  syncFloorIdCounter(floors.map((f) => f.id));
  syncRectIdCounter(floors.flatMap((f) => f.rectangles.map((r) => r.id)));
  syncConstraintIdCounter(floors.flatMap((f) => f.constraints.map((c) => c.id)));
  syncMarkerIdCounter(floors.flatMap((f) => f.markers.map((m) => m.id)));
  syncElectricalLinkIdCounter(floors.flatMap((f) => f.electricalLinks.map((link) => link.id)));
  syncConduitNodeIdCounter(floors.flatMap((f) => f.conduitNodes.map((n) => n.id)));
  syncConduitSegmentIdCounter(floors.flatMap((f) => f.conduitSegments.map((s) => s.id)));
  syncWireIdCounter(floors.flatMap((f) => f.wires.map((w) => w.id)));

  project._emit();
}
