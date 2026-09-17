// The parametric data model.
//
// Phase 1 keeps this deliberately small: a Project is an ordered list of
// axis-aligned rectangles, each tagged "add" or "subtract", plus a wall
// height. Later phases attach a constraint graph that *drives* the edge
// coordinates instead of storing them directly — but the boolean/extrude
// pipeline downstream only ever sees resolved {x, y, w, h} rectangles, so it
// will not need to change when constraints arrive.
//
// Units are meters throughout (maps 1:1 to WebXR world scale later).

import { makeOriginDistance, ORIGIN_ID, solve, solveMarkers } from './constraints.js';
import { ZONE_KINDS } from './zoneColors.js';
import { translateFloor } from './translate.js';

let _id = 0;
const nextId = () => `r${++_id}`;

// After loading a project, advance the counter past any loaded ids so newly
// created rectangles never reuse an existing id.
export function syncRectIdCounter(ids) {
  for (const id of ids) {
    const m = /^r(\d+)$/.exec(id);
    if (m) _id = Math.max(_id, Number(m[1]));
  }
}

let _mid = 0;
export const nextMarkerId = () => `m${++_mid}`;

// Advance the marker-id counter past any loaded ids after a project load.
export function syncMarkerIdCounter(ids) {
  for (const id of ids) {
    const m = /^m(\d+)$/.exec(id);
    if (m) _mid = Math.max(_mid, Number(m[1]));
  }
}

let _elid = 0;
export const nextElectricalLinkId = () => `el${++_elid}`;

// Advance the electrical-link id counter past ids restored from saves/clipboard.
export function syncElectricalLinkIdCounter(ids) {
  for (const id of ids) {
    const m = /^el(\d+)$/.exec(id);
    if (m) _elid = Math.max(_elid, Number(m[1]));
  }
}

// Conduit network (shared physical channels) + wires routed over it. Nodes are
// graph vertices (bare junctions, or bound to a device marker); segments are the
// drilled conduit runs; a wire references its two device markers plus optional
// ordered `via` nodes and derives its path by shortest route through the graph.
let _cnid = 0;
export const nextConduitNodeId = () => `cn${++_cnid}`;
export function syncConduitNodeIdCounter(ids) {
  for (const id of ids) { const m = /^cn(\d+)$/.exec(id); if (m) _cnid = Math.max(_cnid, Number(m[1])); }
}
let _csid = 0;
export const nextConduitSegmentId = () => `cs${++_csid}`;
export function syncConduitSegmentIdCounter(ids) {
  for (const id of ids) { const m = /^cs(\d+)$/.exec(id); if (m) _csid = Math.max(_csid, Number(m[1])); }
}
let _wid = 0;
export const nextWireId = () => `w${++_wid}`;
export function syncWireIdCounter(ids) {
  for (const id of ids) { const m = /^w(\d+)$/.exec(id); if (m) _wid = Math.max(_wid, Number(m[1])); }
}

let _fid = 0;
const nextFloorId = () => `f${++_fid}`;

export function syncFloorIdCounter(ids) {
  for (const id of ids) {
    const m = /^f(\d+)$/.exec(id);
    if (m) _fid = Math.max(_fid, Number(m[1]));
  }
}

export class Rectangle {
  constructor({ x, y, w, h, op = 'add', kind, id = nextId() }) {
    this.id = id;
    this.x = x; // left edge (min x)
    this.y = y; // bottom edge (min y)
    this.w = w; // width  (>= 0)
    this.h = h; // height (>= 0)
    // `op` remains the boolean-geometry behavior. `kind` preserves user intent so
    // Non-room zone kinds share subtract behavior today and can diverge later.
    const inferredKind = op === 'subtract' ? 'wall' : 'room';
    this.kind = ZONE_KINDS.includes(kind) ? kind : inferredKind;
    this.op = this.kind === 'room' ? 'add' : 'subtract';
  }

  // Normalized bounds (handles rectangles drawn right-to-left / top-to-bottom).
  get bounds() {
    const x0 = Math.min(this.x, this.x + this.w);
    const y0 = Math.min(this.y, this.y + this.h);
    return { x0, y0, x1: x0 + Math.abs(this.w), y1: y0 + Math.abs(this.h) };
  }

  contains(px, py) {
    const b = this.bounds;
    return px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1;
  }

  clone() {
    return new Rectangle({ ...this });
  }
}

// A storey: an independent plan (its own rectangles + constraints) with its own
// wall height. All floors share the SAME plan origin (0,0) — the surveyed corner
// — so corners stack by construction and 2D underlays line up for free.
// `elevation` (base Z, meters) is DERIVED by stacking heights off the ground
// datum, not authored; Project._recomputeElevations() keeps it current.
export class Floor {
  constructor({ id = nextFloorId(), name = 'Floor', rectangles = [], constraints = [], markers = [], electricalLinks = [], conduitNodes = [], conduitSegments = [], wires = [], height = 2.8, elevation = 0 } = {}) {
    this.id = id;
    this.name = name;
    this.rectangles = rectangles;
    this.constraints = constraints;
    // Wall-anchored survey annotations (outlets/switches/lights/wires). A parallel
    // lane: {id, type, x, y, z} in plan meters + height above the floor. NOT part of
    // the footprint/extrude pipeline. X/Y can be pinned by marker distance constraints
    // (resolved one-way in solveMarkers); z is inherent, edited by hand.
    this.markers = markers;
    // Logical switch-to-light controls. V1 routes are derived automatically via
    // the ceiling, so moving either marker keeps the displayed wire attached.
    // {id, kind:'control', fromMarkerId, toMarkerId, route:{mode:'ceiling'}}
    this.electricalLinks = electricalLinks;
    // Conduit network: `conduitNodes` = graph vertices {id, x, y, z, markerId?}
    // (markerId-bound nodes derive their position from the live marker). `conduitSegments`
    // = {id, a, b} node-id edges. `wires` = {id, fromMarkerId, toMarkerId, via:[nodeId]}
    // whose physical path is DERIVED as the shortest route through the graph (through the
    // ordered `via` nodes when set) — see src/core/conduit.js. Nothing here touches the
    // footprint/extrude pipeline; it is a parallel lane like markers.
    this.conduitNodes = conduitNodes;
    this.conduitSegments = conduitSegments;
    this.wires = wires;
    this.height = height; // storey height, meters
    this.elevation = elevation; // base Z (m), derived cache — see _recomputeElevations
  }
}

export class Project {
  constructor() {
    const ground = new Floor({ name: 'Ground' });
    this.floors = [ground]; // ordered bottom → top
    this.activeFloorId = ground.id;
    this.groundFloorId = ground.id; // elevation datum (0) + MR registration floor
    this._listeners = new Set();
  }

  // --- floor access -------------------------------------------------------
  get activeFloor() {
    return this.floors.find((f) => f.id === this.activeFloorId) || this.floors[0];
  }

  // Facade: the editing surface (sketch2d, solver, serialize, MR) works on the
  // ACTIVE floor via these, so nothing downstream needs to know about floors.
  get rectangles() { return this.activeFloor.rectangles; }
  set rectangles(v) { this.activeFloor.rectangles = v; }
  get constraints() { return this.activeFloor.constraints; }
  set constraints(v) { this.activeFloor.constraints = v; }
  get markers() { return this.activeFloor.markers; }
  set markers(v) { this.activeFloor.markers = v; }
  get electricalLinks() { return this.activeFloor.electricalLinks; }
  set electricalLinks(v) { this.activeFloor.electricalLinks = v; }
  get conduitNodes() { return this.activeFloor.conduitNodes; }
  set conduitNodes(v) { this.activeFloor.conduitNodes = v; }
  get conduitSegments() { return this.activeFloor.conduitSegments; }
  set conduitSegments(v) { this.activeFloor.conduitSegments = v; }
  get wires() { return this.activeFloor.wires; }
  set wires(v) { this.activeFloor.wires = v; }
  get height() { return this.activeFloor.height; }
  set height(v) { this.activeFloor.height = v; }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // Re-derive each floor's base elevation by stacking heights off the ground
  // datum: ground = 0, floors above accumulate, floors below go negative.
  _recomputeElevations() {
    let gi = this.floors.findIndex((f) => f.id === this.groundFloorId);
    if (gi < 0) gi = 0;
    this.floors[gi].elevation = 0;
    for (let i = gi + 1; i < this.floors.length; i++) {
      this.floors[i].elevation = this.floors[i - 1].elevation + this.floors[i - 1].height;
    }
    for (let i = gi - 1; i >= 0; i--) {
      this.floors[i].elevation = this.floors[i + 1].elevation - this.floors[i].height;
    }
  }

  // Recompute elevations, resolve every floor's constraints, then notify
  // listeners so they see fully-solved, stacked geometry. Markers are resolved
  // in a one-way pass AFTER the rectangle solve (they read resolved wall edges
  // but never move them — see solveMarkers).
  _emit() {
    this._recomputeElevations();
    for (const f of this.floors) { solve(f); solveMarkers(f); }
    for (const fn of this._listeners) fn(this);
  }

  // --- floor management ---------------------------------------------------
  setActiveFloor(id) {
    if (this.floors.some((f) => f.id === id)) {
      this.activeFloorId = id;
      this._emit();
    }
  }

  setGroundFloor(id) {
    if (this.floors.some((f) => f.id === id)) {
      this.groundFloorId = id;
      this._emit();
    }
  }

  renameFloor(id, name) {
    const f = this.floors.find((f) => f.id === id);
    if (f) { f.name = name; this._emit(); }
  }

  // Insert a new empty floor adjacent to `refId` (default: active floor),
  // inheriting its storey height. Becomes the active floor.
  addFloor({ refId = this.activeFloorId, above = true, name } = {}) {
    const ri = Math.max(0, this.floors.findIndex((f) => f.id === refId));
    const ref = this.floors[ri];
    const floor = new Floor({ name: name || 'Floor', height: ref ? ref.height : 2.8 });
    this.floors.splice(above ? ri + 1 : ri, 0, floor);
    this.activeFloorId = floor.id;
    this._emit();
    return floor;
  }

  // Remove a floor (never the last one). If it was ground or active, reassign.
  removeFloor(id) {
    if (this.floors.length <= 1) return;
    const i = this.floors.findIndex((f) => f.id === id);
    if (i < 0) return;
    this.floors.splice(i, 1);
    if (this.activeFloorId === id) {
      this.activeFloorId = this.floors[Math.min(i, this.floors.length - 1)].id;
    }
    if (this.groundFloorId === id) this.groundFloorId = this.floors[0].id;
    this._emit();
  }

  // Move one floor's complete authored plan into another EMPTY floor. Rectangle,
  // constraint, marker, and electrical-link objects move together so every reference remains valid;
  // storey metadata (name, height, elevation, ground designation) stays with its floor.
  // Returns a result instead of overwriting or merging destination data implicitly.
  moveFloorContents(sourceId, targetId) {
    const source = this.floors.find((f) => f.id === sourceId);
    const target = this.floors.find((f) => f.id === targetId);
    if (!source || !target || source === target) return { ok: false, reason: 'invalid' };
    const hasContent = (f) => f.rectangles.length || f.constraints.length || f.markers.length
      || f.electricalLinks.length || f.conduitNodes.length || f.wires.length;
    if (!hasContent(source)) return { ok: false, reason: 'empty' };
    if (hasContent(target)) return { ok: false, reason: 'occupied' };

    target.rectangles = source.rectangles;
    target.constraints = source.constraints;
    target.markers = source.markers;
    target.electricalLinks = source.electricalLinks;
    target.conduitNodes = source.conduitNodes;
    target.conduitSegments = source.conduitSegments;
    target.wires = source.wires;
    source.rectangles = [];
    source.constraints = [];
    source.markers = [];
    source.electricalLinks = [];
    source.conduitNodes = [];
    source.conduitSegments = [];
    source.wires = [];
    this.activeFloorId = target.id;
    this._emit();
    return { ok: true, source, target };
  }

  // Apply one rigid XY transform to the active floor, including origin locks and
  // authored dimension-label placement, then solve/notify exactly once.
  translateActiveFloor(dx, dy, { originEdges = [] } = {}) {
    if (!translateFloor(this.activeFloor, dx, dy)) return false;
    for (const ref of originEdges) {
      const rect = this.rectangles.find((r) => r.id === ref.rectId);
      if (!rect) continue;
      const exists = this.constraints.some((c) =>
        (c.a?.rect === ORIGIN_ID && c.b?.rect === rect.id && c.b?.edge === ref.edge)
        || (c.b?.rect === ORIGIN_ID && c.a?.rect === rect.id && c.a?.edge === ref.edge));
      if (!exists) this.constraints.push(makeOriginDistance(rect, ref.edge));
    }
    this._emit();
    return true;
  }

  addRectangle(rect) {
    this.rectangles.push(rect);
    this._emit();
    return rect;
  }

  removeRectangle(id) {
    const i = this.rectangles.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.rectangles.splice(i, 1);
      // Drop any constraints that referenced the removed rectangle.
      this.constraints = this.constraints.filter(
        (c) => c.a.rect !== id && c.b.rect !== id,
      );
      this._emit();
    }
  }

  clear() {
    this.rectangles = [];
    this.constraints = [];
    this.markers = [];
    this.electricalLinks = [];
    this.conduitNodes = [];
    this.conduitSegments = [];
    this.wires = [];
    this._emit();
  }

  // --- markers (wall-anchored survey annotations) -------------------------
  // Add a marker (plain object {type, x, y, z}) to the active floor, minting an
  // id if none was supplied. z is its inherent height above the floor.
  addMarker(marker) {
    if (!marker.id) marker.id = nextMarkerId();
    if (!marker._locked) marker._locked = { x: false, y: false };
    this.markers.push(marker);
    this._emit();
    return marker;
  }

  removeMarker(id) {
    const i = this.markers.findIndex((m) => m.id === id);
    if (i >= 0) {
      this.markers.splice(i, 1);
      // Drop any constraints that pinned the removed marker.
      this.constraints = this.constraints.filter(
        (c) => c.a.marker !== id && c.b.marker !== id,
      );
      // Logical controls cannot survive without either endpoint.
      this.electricalLinks = this.electricalLinks.filter(
        (link) => link.fromMarkerId !== id && link.toMarkerId !== id,
      );
      // Detach the marker from the conduit network: drop its bound node + incident
      // segments, and remove wires that terminated at it (vias to the gone node too).
      const goneNodeIds = new Set(this.conduitNodes.filter((n) => n.markerId === id).map((n) => n.id));
      if (goneNodeIds.size) {
        this.conduitNodes = this.conduitNodes.filter((n) => !goneNodeIds.has(n.id));
        this.conduitSegments = this.conduitSegments.filter((s) => !goneNodeIds.has(s.a) && !goneNodeIds.has(s.b));
      }
      this.wires = this.wires.filter((w) => w.fromMarkerId !== id && w.toMarkerId !== id);
      for (const w of this.wires) w.via = (w.via || []).filter((v) => !goneNodeIds.has(v));
      this._emit();
    }
  }

  // Set a marker's inherent height above the floor (meters). Edited by hand in
  // EDIT; z is never a constraint axis.
  setMarkerHeight(id, z) {
    const m = this.markers.find((m) => m.id === id);
    if (!m) return;
    m.z = z;
    this._emit();
  }

  // Change a marker's kind in place (outlet/switch/…). It does not touch geometry
  // or pins, but any now-incompatible electrical control links are removed.
  setMarkerType(id, type) {
    const m = this.markers.find((m) => m.id === id);
    if (!m) return;
    m.type = type;
    // Retyping an endpoint to an incompatible fixture removes its logical CONTROLS
    // rather than retaining hidden/dangling data. As-built wires connect any marker
    // and therefore survive retyping untouched.
    this.electricalLinks = this.electricalLinks.filter((link) =>
      (link.kind || 'control') !== 'control' ||
      ((link.fromMarkerId !== id || type === 'switch') &&
       (link.toMarkerId !== id || type === 'light')));
    this._emit();
  }

  // Toggle one logical switch-to-light control. The physical V1 wire route is
  // derived via the ceiling at render time and therefore needs no stale XYZ copy.
  toggleElectricalLink(fromMarkerId, toMarkerId) {
    const from = this.markers.find((m) => m.id === fromMarkerId);
    const to = this.markers.find((m) => m.id === toMarkerId);
    if (!from || !to || from.type !== 'switch' || to.type !== 'light') {
      return { ok: false, reason: 'incompatible' };
    }
    const i = this.electricalLinks.findIndex((link) =>
      link.kind === 'control' && link.fromMarkerId === fromMarkerId && link.toMarkerId === toMarkerId);
    if (i >= 0) {
      const [link] = this.electricalLinks.splice(i, 1);
      this._emit();
      return { ok: true, linked: false, link };
    }
    const link = {
      id: nextElectricalLinkId(),
      kind: 'control',
      fromMarkerId,
      toMarkerId,
      route: { mode: 'ceiling' },
    };
    this.electricalLinks.push(link);
    this._emit();
    return { ok: true, linked: true, link };
  }

  // Remove one electrical link (control) by id.
  removeElectricalLink(id) {
    const i = this.electricalLinks.findIndex((link) => link.id === id);
    if (i < 0) return { ok: false };
    const [link] = this.electricalLinks.splice(i, 1);
    this._emit();
    return { ok: true, link };
  }

  // ---- Conduit network (shared physical channels) --------------------------
  // A node is either a bare junction (x,y,z) or bound to a device marker
  // (markerId set → position follows the live marker). Segments join two nodes.
  addConduitNode({ x = 0, y = 0, z = 0, markerId = null } = {}) {
    const node = { id: nextConduitNodeId(), x, y, z: z || 0, markerId };
    this.conduitNodes.push(node);
    this._emit();
    return node;
  }

  // The conduit node bound to a marker, creating one if absent (so a conduit can
  // terminate at that device box). New nodes seed their position from the marker.
  ensureConduitNodeAtMarker(markerId) {
    let node = this.conduitNodes.find((n) => n.markerId === markerId);
    if (node) return node;
    const m = this.markers.find((mk) => mk.id === markerId);
    node = { id: nextConduitNodeId(), x: m?.x ?? 0, y: m?.y ?? 0, z: m?.z ?? 0, markerId };
    this.conduitNodes.push(node);
    return node; // caller emits
  }

  // Join two nodes with a conduit segment (idempotent — one segment per node pair).
  addConduitSegment(aNodeId, bNodeId) {
    if (!aNodeId || !bNodeId || aNodeId === bNodeId) return null;
    const existing = this.conduitSegments.find((s) =>
      (s.a === aNodeId && s.b === bNodeId) || (s.a === bNodeId && s.b === aNodeId));
    if (existing) return existing;
    const seg = { id: nextConduitSegmentId(), a: aNodeId, b: bNodeId };
    this.conduitSegments.push(seg);
    this._emit();
    return seg;
  }

  // Move a bare junction node. Marker-bound nodes follow their marker and ignore this.
  moveConduitNode(id, { x, y, z }, { emit = true } = {}) {
    const n = this.conduitNodes.find((n) => n.id === id);
    if (!n || n.markerId) return;
    n.x = x; n.y = y; n.z = z || 0;
    if (emit) this._emit();
  }

  // Remove a conduit segment. Wires derive their path live, so nothing else needs
  // patching — a wire that relied on it simply reroutes (or becomes unroutable).
  removeConduitSegment(id) {
    const i = this.conduitSegments.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.conduitSegments.splice(i, 1);
    this._emit();
  }

  // Remove a node and its incident segments; drop any `via` references to it. A
  // bare junction disappears entirely; a marker-bound node just detaches the marker
  // from the network (the marker itself is untouched).
  removeConduitNode(id) {
    if (!this.conduitNodes.some((n) => n.id === id)) return;
    this.conduitNodes = this.conduitNodes.filter((n) => n.id !== id);
    this.conduitSegments = this.conduitSegments.filter((s) => s.a !== id && s.b !== id);
    for (const w of this.wires) w.via = (w.via || []).filter((v) => v !== id);
    this._emit();
  }

  // Split a segment with a new junction node at p, replacing it with two segments.
  splitConduitSegment(id, { x, y, z = 0 }) {
    const seg = this.conduitSegments.find((s) => s.id === id);
    if (!seg) return null;
    const node = { id: nextConduitNodeId(), x, y, z: z || 0, markerId: null };
    this.conduitNodes.push(node);
    this.conduitSegments = this.conduitSegments.filter((s) => s.id !== id);
    this.conduitSegments.push({ id: nextConduitSegmentId(), a: seg.a, b: node.id });
    this.conduitSegments.push({ id: nextConduitSegmentId(), a: node.id, b: seg.b });
    this._emit();
    return node;
  }

  // ---- Wires (routed over the conduit network) -----------------------------
  // A wire connects two device markers; its path is DERIVED as the shortest route
  // through the conduits (via src/core/conduit.js), so it needs no stored geometry.
  addWire(fromMarkerId, toMarkerId) {
    const from = this.markers.find((m) => m.id === fromMarkerId);
    const to = this.markers.find((m) => m.id === toMarkerId);
    if (!from || !to || fromMarkerId === toMarkerId) return { ok: false, reason: 'incompatible' };
    const wire = { id: nextWireId(), fromMarkerId, toMarkerId, via: [] };
    this.wires.push(wire);
    this._emit();
    return { ok: true, wire };
  }

  removeWire(id) {
    const i = this.wires.findIndex((w) => w.id === id);
    if (i < 0) return { ok: false };
    const [wire] = this.wires.splice(i, 1);
    this._emit();
    return { ok: true, wire };
  }

  // Force a wire's route through an extra conduit node (manual override). Appends
  // to the ordered via list; the derived path then threads it.
  addWireVia(wireId, nodeId) {
    const wire = this.wires.find((w) => w.id === wireId);
    if (!wire || !this.conduitNodes.some((n) => n.id === nodeId)) return;
    wire.via = wire.via || [];
    wire.via.push(nodeId);
    this._emit();
  }

  // Undo the last manual via on a wire (back toward the automatic shortest path).
  popWireVia(wireId) {
    const wire = this.wires.find((w) => w.id === wireId);
    if (!wire || !(wire.via || []).length) return;
    wire.via.pop();
    this._emit();
  }

  // Move a marker while preserving its pin relationships. A pin's signed value
  // is the marker-to-reference offset, so dragging changes that value by the same
  // axis delta instead of letting solveMarkers snap the marker back afterward.
  // Continuous render-loop drags pass { emit:false } and call touch() once on
  // release; this avoids a full solve + listener cascade on every XR frame.
  moveMarker(id, { x, y, z }, { emit = true } = {}) {
    const m = this.markers.find((m) => m.id === id);
    if (!m) return;
    const delta = { x: x - m.x, y: y - m.y };
    for (const c of this.constraints) {
      const markerIsA = c.a?.marker === id;
      const markerIsB = c.b?.marker === id;
      if ((!markerIsA && !markerIsB) || (c.axis !== 'x' && c.axis !== 'y')) continue;
      c.value += markerIsB ? delta[c.axis] : -delta[c.axis];
    }
    m.x = x;
    m.y = y;
    m.z = z;
    if (emit) this._emit();
  }

  addConstraint(c) {
    this.constraints.push(c);
    this._emit();
    return c;
  }

  removeConstraint(id) {
    const i = this.constraints.findIndex((c) => c.id === id);
    if (i >= 0) {
      this.constraints.splice(i, 1);
      this._emit();
    }
  }

  // Update a constraint's target magnitude, preserving its stored direction.
  setConstraintMagnitude(id, magnitude) {
    const c = this.constraints.find((c) => c.id === id);
    if (!c) return;
    const sign = c.value < 0 ? -1 : 1;
    c.value = sign * Math.abs(magnitude);
    this._emit();
  }

  // Reverse a distance constraint's direction: swap its two edges and negate
  // the value. Geometrically identical, but flips which edge anchors (a holds,
  // b moves) and the displayed a→b direction.
  swapConstraint(id) {
    const c = this.constraints.find((c) => c.id === id);
    if (!c) return;
    [c.a, c.b] = [c.b, c.a];
    c.value = -c.value;
    this._emit();
  }

  // Flip which SIDE b sits on relative to a: negate the signed value but KEEP the
  // ordered pair (and anchor). Unlike swapConstraint (order+value both flip =
  // geometrically identical), this actually moves b to the opposite side of a.
  flipConstraintSide(id) {
    const c = this.constraints.find((c) => c.id === id);
    if (!c) return;
    c.value = -c.value;
    this._emit();
  }

  // Pin a dimension's perpendicular placement (signed meters), or pass null to
  // return it to automatic stacking. Purely presentational — not solved.
  setConstraintOffset(id, offset) {
    const c = this.constraints.find((c) => c.id === id);
    if (!c) return;
    c.offset = offset;
    this._emit();
  }

  setHeight(h) {
    this.height = Math.max(0.01, h);
    this._emit();
  }

  // Call after mutating a rectangle in place (e.g. moving it).
  touch() {
    this._emit();
  }

  // Re-solve every floor's constraints IN PLACE but skip the listener cascade —
  // for continuous render-loop drags (e.g. the AR edge grab) that need live,
  // fully-solved geometry each frame yet must NOT fire the whole desktop pipeline
  // (3D re-extrude, 2D canvas redraw, DOM panel rebuilds) 60+ times a second. The
  // caller updates its own view directly and commits once with touch() on release.
  solveSilently() {
    this._recomputeElevations();
    for (const f of this.floors) { solve(f); solveMarkers(f); }
  }
}
