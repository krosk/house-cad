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

import { solve, solveMarkers } from './constraints.js';

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

let _fid = 0;
const nextFloorId = () => `f${++_fid}`;

export function syncFloorIdCounter(ids) {
  for (const id of ids) {
    const m = /^f(\d+)$/.exec(id);
    if (m) _fid = Math.max(_fid, Number(m[1]));
  }
}

export class Rectangle {
  constructor({ x, y, w, h, op = 'add', id = nextId() }) {
    this.id = id;
    this.x = x; // left edge (min x)
    this.y = y; // bottom edge (min y)
    this.w = w; // width  (>= 0)
    this.h = h; // height (>= 0)
    this.op = op; // 'add' | 'subtract'
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
  constructor({ id = nextFloorId(), name = 'Floor', rectangles = [], constraints = [], markers = [], height = 2.8, elevation = 0 } = {}) {
    this.id = id;
    this.name = name;
    this.rectangles = rectangles;
    this.constraints = constraints;
    // Wall-anchored survey annotations (outlets/switches/lights/wires). A parallel
    // lane: {id, type, x, y, z} in plan meters + height above the floor. NOT part of
    // the footprint/extrude pipeline. X/Y can be pinned by marker distance constraints
    // (resolved one-way in solveMarkers); z is inherent, edited by hand.
    this.markers = markers;
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

  // Change a marker's kind in place (outlet/switch/…). Type is pure annotation —
  // it doesn't touch geometry or pins — so this only swaps the field and notifies.
  setMarkerType(id, type) {
    const m = this.markers.find((m) => m.id === id);
    if (!m) return;
    m.type = type;
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
}
