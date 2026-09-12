// Serialize / deserialize a Project to plain JSON. This is the persistent,
// parametric definition of the house: floors (each = rectangles + constraints +
// height) plus which floor is ground/active. The downstream footprint/extrusion
// and each floor's derived elevation are always recomputed, never stored.

import { Floor, Rectangle, nextMarkerId, syncRectIdCounter, syncFloorIdCounter, syncMarkerIdCounter } from '../core/model.js';
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

export function serializeFloor(f) {
  return {
    id: f.id,
    name: f.name,
    height: f.height,
    rectangles: f.rectangles.map(serializeRect),
    constraints: f.constraints.map(serializeConstraint),
    markers: f.markers.map(serializeMarker),
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
      labelT: Number.isFinite(c.labelT) ? Math.max(0, Math.min(1, c.labelT)) : 0.5,
      conflict: false,
    }];
  });

  target.rectangles = rectangles;
  target.constraints = constraints;
  target.markers = markers;
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
    labelT: Number.isFinite(c.labelT) ? Math.max(0, Math.min(1, c.labelT)) : 0.5,
    conflict: false,
  };
}

// Replace the project's contents from parsed JSON data. Emits one change.
export function deserializeInto(project, data) {
  const err = validateProjectData(data);
  if (err) throw new Error(err);

  const descriptors = floorDescriptors(data);
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

  project._emit();
}
