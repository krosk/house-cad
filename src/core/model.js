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

import { makeOriginDistance, ORIGIN_ID, solve, solveMarkers, solveConduitNodes, snapM } from './constraints.js';
import { ZONE_KINDS, APERTURE_DEFAULTS, FURNITURE_BAND, STAIR_CLIMBS, isStairs, stairClimb } from './zoneColors.js';
import { translateFloor } from './translate.js';
import { isSwitch, linkRocker } from './electrical.js';
import { cleanHeat, cleanFloorHeat } from './heatLoss.js';

let _id = 0;
const nextId = () => `r${++_id}`;

// Write a vertical placement onto any z-bearing object (marker / furniture item /
// conduit node). Heights are ALWAYS floor-referenced (z = absolute height above the
// active floor). Setting a height DEFINES a vertical dim, so `zDatum` is stamped — that
// is what makes the value hold during a 3D grab (like an X/Y pin). An object with NO
// zDatum (e.g. a freshly dropped marker whose height was never set) is free in Z and
// follows the grab.
function setVertical(obj, datum, value) {
  if (!obj) return;
  if (datum === 'free') { delete obj.zDatum; return; } // un-define → free in grab; keep the current z
  obj.zDatum = 'floor'; obj.z = value;
}

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
export const WIRE_TYPES = ['electrical', 'ethernet'];
export const nextWireId = () => `w${++_wid}`;
export function syncWireIdCounter(ids) {
  for (const id of ids) { const m = /^w(\d+)$/.exec(id); if (m) _wid = Math.max(_wid, Number(m[1])); }
}
let _pid = 0;
let _pnid = 0;
export const PIPE_SERVICES = ['cold', 'hot', 'heating_supply', 'heating_return'];
export const PIPE_SERVICE_ROLE = {
  cold: 'cold', hot: 'hot', heating_supply: 'supply', heating_return: 'return',
};
export const nextPipeId = () => `p${++_pid}`;
export const nextPipeNodeId = () => `pn${++_pnid}`;
export function syncPipeIdCounter(ids) {
  for (const id of ids) { const m = /^p(\d+)$/.exec(id); if (m) _pid = Math.max(_pid, Number(m[1])); }
}
export function syncPipeNodeIdCounter(ids) {
  for (const id of ids) { const m = /^pn(\d+)$/.exec(id); if (m) _pnid = Math.max(_pnid, Number(m[1])); }
}
// Facing of a furniture zone: degrees about vertical, a multiple of 90 (owner decision:
// four directions only). 0 = the product's front toward plan −y; 90 → +x; 180 → +y;
// 270 → −x (the same angle the 3D model is turned by).
export const FURNITURE_FACINGS = [0, 90, 180, 270];
export const snapFacing = (deg) => ((Math.round((Number(deg) || 0) / 90) % 4 + 4) % 4) * 90;

// Old placed furniture items (`floor.furniture[]`: {article, x, y, z, rotationY}, from
// saved files and share links before the merge) → furniture ZONES carrying the product
// (docs/furniture.md "merge"). The item's point becomes the zone's centre and its
// rotation snaps to the nearest 90°. The catalog isn't known here (it is fetched), so the
// zone starts 60 cm square with no `productMm`; Project.applyFurnitureCatalog sizes it
// once the catalog arrives.
export function furnitureItemsToZones(items) {
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    if (item == null || item.article == null || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return [];
    const foot = Number.isFinite(item.z) ? item.z : 0;
    return [new Rectangle({
      x: item.x - 0.3, y: item.y - 0.3, w: 0.6, h: 0.6, kind: 'furniture',
      foot, top: foot + FURNITURE_BAND.top,
      article: String(item.article), facing: snapFacing(item.rotationY),
    })];
  });
}

let _fid = 0;
const nextFloorId = () => `f${++_fid}`;

export function syncFloorIdCounter(ids) {
  for (const id of ids) {
    const m = /^f(\d+)$/.exec(id);
    if (m) _fid = Math.max(_fid, Number(m[1]));
  }
}

// Furniture zones that carry a product → where to draw its model (docs/furniture.md):
// the zone's centre, the band's foot as the height off the floor, and the facing as the
// model's turn (degrees). Shared by the desktop View 3D and the AR 3D view.
export function furnitureProductPlacements(floor) {
  return (floor?.rectangles || []).filter((r) => r.kind === 'furniture' && r.article).map((r) => {
    const b = r.bounds;
    return { id: r.id, article: r.article, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2,
      z: Number(r.foot) || 0, rotationY: r.facing || 0 };
  });
}

// Write a catalog product onto a furniture zone (see Project.setFurnitureProduct).
// `key` is the catalog KEY (not the entry's retailer `article` number, which can differ).
function applyProduct(rect, key, entry, { seedFoot }) {
  rect.article = String(key);
  const mm = entry.sizeMm;
  if (!entry.madeToMeasure && Array.isArray(mm) && mm.length === 3 && mm.every((v) => v > 0)) rect.productMm = [...mm];
  else delete rect.productMm;
  if (seedFoot) rect.foot = (Number(entry.mountZMm) || 0) / 1000;
  if (rect.productMm) rect.top = rect.foot + rect.productMm[1] / 1000;
}

export class Rectangle {
  constructor({ x, y, w, h, op = 'add', kind, id = nextId(), sill, head, hinge, swing, foot, top, climb, article, productMm, facing, rValue } = {}) {
    this.id = id;
    this.x = x; // left edge (min x)
    this.y = y; // bottom edge (min y)
    this.w = w; // width  (>= 0)
    this.h = h; // height (>= 0)
    // `op` remains the boolean-geometry behavior. `kind` preserves user intent so
    // Non-room zone kinds share subtract behavior today and can diverge later.
    const inferredKind = op === 'subtract' ? 'wall' : 'room';
    const normalizedKind = kind === 'stairs' ? 'stairs_up' : kind;
    this.kind = ZONE_KINDS.includes(normalizedKind) ? normalizedKind : inferredKind;
    this.op = this.kind === 'room' ? 'add' : 'subtract';
    // Aperture kinds (door/window/half wall) carry an opening band [sill, head]
    // and a `hinge` side. Explicit values win (deserialize/clone); otherwise the
    // per-kind default fills in. Non-aperture kinds carry none of these fields.
    const d = APERTURE_DEFAULTS[this.kind];
    if (d) {
      this.sill  = sill  !== undefined ? sill  : d.sill;
      this.head  = head  !== undefined ? head  : d.head;
      this.hinge = hinge !== undefined ? hinge : d.hinge;
      if (d.swing !== undefined) this.swing = swing !== undefined ? swing : d.swing;
    } else if (this.kind === 'furniture') {
      // A furniture placeholder carries a solid [foot, top] body band (the dual of
      // an aperture opening). Explicit values win on deserialize/clone.
      this.foot = foot !== undefined ? foot : FURNITURE_BAND.foot;
      this.top  = top  !== undefined ? top  : FURNITURE_BAND.top;
      // Optional product (docs/furniture.md "merge"): `article` keys the furniture
      // catalog; `productMm` snapshots its [width, height, depth] so the solver can size
      // the zone without the (fetched) catalog; absent for a made-to-measure product.
      // `facing` turns the product in 90° steps (FURNITURE_FACINGS).
      if (article != null && article !== '') this.article = String(article);
      if (Array.isArray(productMm) && productMm.length === 3 && productMm.every((v) => v > 0)) this.productMm = [...productMm];
      if (facing !== undefined && facing !== 0) this.facing = snapFacing(facing);
    } else if (this.kind === 'insulation') {
      // Thermal resistance R (m²K/W) from the product label, for the heat-loss
      // calculation (docs/heat-loss.md); absent = drawn depth / the project's λ.
      if (Number.isFinite(rValue) && rValue >= 0) this.rValue = rValue;
    } else if (isStairs(this.kind) && STAIR_CLIMBS.includes(climb)) {
      // Stairs keep an authored ascent direction once rotated; absent = legacy
      // long-axis reading (see stairClimb in zoneColors.js).
      this.climb = climb;
    }
  }

  // Retype in place (used by the desktop panel + AR kind-cycle). Keeps `op` in
  // sync and resets the aperture band/hinge to the new kind's defaults (there is
  // no per-instance editor yet, so a retype adopts the target kind's presets);
  // retyping to a non-aperture kind clears the aperture fields entirely.
  setKind(kind) {
    if (kind === 'stairs') kind = 'stairs_up';
    if (ZONE_KINDS.includes(kind)) this.kind = kind;
    if (this.kind !== 'insulation') delete this.rValue;
    this.op = this.kind === 'room' ? 'add' : 'subtract';
    const d = APERTURE_DEFAULTS[this.kind];
    // UP↔DOWN retypes the same flight, so its climb survives; any other kind drops it.
    if (!isStairs(this.kind)) delete this.climb;
    if (this.kind !== 'furniture') { delete this.article; delete this.productMm; delete this.facing; }
    if (d) {
      this.sill = d.sill; this.head = d.head; this.hinge = d.hinge;
      if (d.swing !== undefined) this.swing = d.swing; else delete this.swing;
      delete this.foot; delete this.top;
    } else {
      delete this.sill; delete this.head; delete this.hinge; delete this.swing;
      if (this.kind === 'furniture') { this.foot = FURNITURE_BAND.foot; this.top = FURNITURE_BAND.top; }
      else { delete this.foot; delete this.top; }
    }
    return this;
  }

  // Cycle an aperture through its orientations (used by the AR A/X flip and the
  // desktop panel). A door has 4: hinge left/right × swing in/out. A window has 3:
  // hinge left → right → both. Stairs turn their ascent 90° (4 states, clockwise).
  // Half walls / other zones have nothing to rotate.
  rotateAperture(dir = 1) {
    if (isStairs(this.kind)) {
      const i = STAIR_CLIMBS.indexOf(stairClimb(this));
      this.climb = STAIR_CLIMBS[((i + dir) % 4 + 4) % 4];
      return true;
    }
    // A garage door has no jamb hinge: rotation only chooses which wall face its
    // 2.1 m overhead footprint extends into.
    if (this.kind === 'garage') {
      this.swing = this.swing === 'in' ? 'out' : 'in';
      return true;
    }
    // Doors and sliding doors share the 4-state hinge×swing cycle (for a slider,
    // hinge = slide direction and swing = which wall face the rail sits on).
    if (this.kind === 'door' || this.kind === 'sliding') {
      const states = [['left', 'in'], ['right', 'in'], ['right', 'out'], ['left', 'out']];
      const i = states.findIndex(([h, s]) => h === this.hinge && s === this.swing);
      const [h, s] = states[(((i < 0 ? 0 : i) + dir) % 4 + 4) % 4];
      this.hinge = h; this.swing = s;
      return true;
    }
    // A furniture zone turns its product's front 90° counter-clockwise (seen from above) per
    // step; with a product, the solver swaps the zone's footprint to match.
    if (this.kind === 'furniture') {
      this.facing = snapFacing((this.facing || 0) + 90 * dir);
      if (!this.facing) delete this.facing;
      return true;
    }
    if (this.kind === 'window') {
      const states = ['left', 'right', 'both'];
      const i = states.indexOf(this.hinge);
      this.hinge = states[(((i < 0 ? 0 : i) + dir) % 3 + 3) % 3];
      return true;
    }
    return false;
  }

  // Normalized bounds (handles rectangles drawn right-to-left / top-to-bottom).
  get bounds() {
    const x0 = snapM(Math.min(this.x, this.x + this.w));
    const y0 = snapM(Math.min(this.y, this.y + this.h));
    return { x0, y0, x1: snapM(x0 + Math.abs(this.w)), y1: snapM(y0 + Math.abs(this.h)) };
  }

  contains(px, py) {
    const b = this.bounds;
    return px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1;
  }

  clone() {
    return new Rectangle({ ...this, productMm: this.productMm && [...this.productMm] });
  }
}

// A storey: an independent plan (its own rectangles + constraints) with its own
// wall height. All floors share the SAME plan origin (0,0) — the surveyed corner
// — so corners stack by construction and 2D underlays line up for free.
// `elevation` (base Z, meters) is DERIVED by stacking heights off the ground
// datum, not authored; Project._recomputeElevations() keeps it current.
export class Floor {
  constructor({ id = nextFloorId(), name = 'Floor', rectangles = [], constraints = [], markers = [], electricalLinks = [], finishes = [], height = 2.8, elevation = 0, heat = null } = {}) {
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
    // NOTE: the conduit network (`conduitNodes`/`conduitSegments`) and `wires` are
    // WHOLE-HOUSE and live on Project, not here — a conduit run (a "riser") may pierce a
    // slab to join nodes on two storeys, and a wire may connect device markers on
    // different floors. electricalLinks (switch→light controls) remain per-floor.
    // Furniture is a `furniture` ZONE in `rectangles`, optionally carrying a product
    // (`article`); the old separate `furniture[]` placements migrate to zones on load
    // (furnitureItemsToZones). docs/furniture.md.
    // Surface finishes (docs/materials.md): { target: {rect} | {rect, edge}, material }.
    // {rect} = the floor of that rect's connected ROOM component; {rect, edge} = that
    // room edge's wall face. Never solved; quantities derive in src/core/flooring.js.
    this.finishes = finishes;
    this.height = height; // storey height, meters
    this.elevation = elevation; // base Z (m), derived cache — see _recomputeElevations
    // Heat-loss settings of this storey (heated or not, added slab/attic insulation),
    // only the keys set; defaults in src/core/heatLoss.js FLOOR_HEAT_DEFAULTS.
    this.heat = heat || {};
  }
}

export class Project {
  constructor() {
    const ground = new Floor({ name: 'Ground' });
    this.floors = [ground]; // ordered bottom → top
    this.activeFloorId = ground.id;
    this.groundFloorId = ground.id; // elevation datum (0) + MR registration floor
    // Whole-house conduit network + wires (see Floor note). Nodes store position
    // RELATIVE to their floor ({x, y, z, floorId} or {markerId}); absolute world Z is
    // derived (floor.elevation + z) so a floor-height edit re-stacks elevations and every
    // higher node's world height follows, while its floor-relative z stays put. A segment
    // whose two nodes resolve to different floors is a riser (slab penetration).
    this.conduitNodes = [];
    this.conduitSegments = [];
    this.wires = [];
    // Whole-house plumbing graph. Nodes are free junctions or fixture-bound logical
    // ports; pipe segments connect nodes and carry service + diameter.
    this.pipeNodes = [];
    this.pipes = [];
    // The owner's own finish products (same shape as BUILTIN_MATERIALS in materials.js).
    this.materials = [];
    // Heat-loss settings (docs/heat-loss.md): only the keys the owner set; defaults in
    // src/core/heatLoss.js HEAT_DEFAULTS.
    this.heat = {};
    // Saved-revision counter: advanced by every explicit SAVE (desktop house.json,
    // AR slot) — NOT by autosave — so it tracks deliberate saves. Persisted with the
    // project and stamped on export filenames and printed sheets. 0 = never saved.
    this.revision = 0;
    this._listeners = new Set();
  }

  // Advance the saved-revision counter and return the new value. Call from every
  // explicit save path (never from autosave). Pure state change — no _emit, since
  // the number surfaces only on export outputs, which are recomputed on demand.
  bumpRevision() {
    this.revision = (this.revision || 0) + 1;
    return this.revision;
  }

  // --- floor access -------------------------------------------------------
  get activeFloor() {
    return this.floors.find((f) => f.id === this.activeFloorId) || this.floors[0];
  }

  // Whole-house lookups: the conduit network / wires span floors, so they resolve
  // markers and floors across every storey (markers themselves stay floor-scoped).
  floorById(id) { return this.floors.find((f) => f.id === id) || null; }
  findMarker(id) {
    for (const f of this.floors) {
      const marker = f.markers.find((m) => m.id === id);
      if (marker) return { marker, floor: f };
    }
    return null;
  }
  floorOfMarker(id) { return this.findMarker(id)?.floor || null; }

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
  // conduitNodes / conduitSegments / wires are real Project fields (whole-house), NOT
  // facades — see the constructor. Do not re-add active-floor facades for them.
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
      this.floors[i].elevation = snapM(this.floors[i - 1].elevation + this.floors[i - 1].height);
    }
    for (let i = gi - 1; i >= 0; i--) {
      this.floors[i].elevation = snapM(this.floors[i + 1].elevation - this.floors[i].height);
    }
  }

  // Recompute elevations, resolve every floor's constraints, then notify
  // listeners so they see fully-solved, stacked geometry. Markers are resolved
  // in a one-way pass AFTER the rectangle solve (they read resolved wall edges
  // but never move them — see solveMarkers).
  // Put every authored length on the 0.1 mm grid (snapM, constraints.js) before the
  // solve, whatever path set it: typed values, AR captures, drags, loaded files. Moves a
  // loaded value by at most 0.05 mm. Solver outputs are snapped where they are written.
  _snapToGrid() {
    const snap = (o, keys) => { for (const k of keys) if (typeof o[k] === 'number') o[k] = snapM(o[k]); };
    for (const f of this.floors) {
      snap(f, ['height']);
      for (const r of f.rectangles) snap(r, ['x', 'y', 'w', 'h', 'sill', 'head', 'foot', 'top']);
      for (const c of f.constraints) snap(c, ['value']);
      for (const m of f.markers || []) snap(m, ['x', 'y', 'z']);
    }
    for (const n of this.conduitNodes) snap(n, ['x', 'y', 'z']);
    for (const n of this.pipeNodes || []) snap(n, ['x', 'y', 'z']);
  }

  _emit({ solveRectangles = true } = {}) {
    this._snapToGrid();
    this._recomputeElevations();
    const removed = [];
    for (const f of this.floors) {
      if (solveRectangles) for (const r of solve(f)) removed.push({ id: r.constraint.id, miss: r.miss, floorId: f.id });
      solveMarkers(f);
    }
    // Over-specified furniture dimensions the solver just removed (docs/furniture.md):
    // a sequence number lets a view that polls (the AR HUD) say so once.
    if (removed.length) this.removedDims = { seq: (this.removedDims?.seq || 0) + 1, items: removed };
    solveConduitNodes(this); // whole-house node pins follow the walls, one-way
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
  // constraint, marker, and electrical-link objects move together so every
  // reference remains valid; storey metadata (name, height, elevation, ground
  // designation) stays with its floor. The whole-house conduit/wire network is NOT
  // per-floor: marker-bound nodes follow their markers automatically, and bare junctions
  // authored on the source floor are re-stamped to the target floor.
  // Returns a result instead of overwriting or merging destination data implicitly.
  moveFloorContents(sourceId, targetId) {
    const source = this.floors.find((f) => f.id === sourceId);
    const target = this.floors.find((f) => f.id === targetId);
    if (!source || !target || source === target) return { ok: false, reason: 'invalid' };
    const hasContent = (f) => f.rectangles.length || f.constraints.length || f.markers.length
      || f.electricalLinks.length;
    if (!hasContent(source)) return { ok: false, reason: 'empty' };
    if (hasContent(target)) return { ok: false, reason: 'occupied' };

    target.rectangles = source.rectangles;
    target.constraints = source.constraints;
    target.markers = source.markers;
    target.electricalLinks = source.electricalLinks;
    source.rectangles = [];
    source.constraints = [];
    source.markers = [];
    source.electricalLinks = [];
    // Follow the relocated plan: bare junctions on the source floor move to the target.
    for (const n of this.conduitNodes) {
      if (!n.markerId && n.floorId === sourceId) n.floorId = targetId;
    }
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
      this.activeFloor.finishes = (this.activeFloor.finishes || []).filter((f) => f.target?.rect !== id);
      this._emit();
    }
  }

  // Remove all authored content on the ACTIVE floor. The conduit/wire network is
  // whole-house, so prune only its active-floor slice: bare junctions on this floor and
  // nodes bound to this floor's markers, plus segments/wires that then lose an endpoint.
  clear() {
    const floorId = this.activeFloorId;
    const markerIds = new Set(this.markers.map((m) => m.id));
    const goneNodeIds = new Set(this.conduitNodes
      .filter((n) => n.markerId ? markerIds.has(n.markerId) : n.floorId === floorId)
      .map((n) => n.id));
    this.conduitNodes = this.conduitNodes.filter((n) => !goneNodeIds.has(n.id));
    this.conduitSegments = this.conduitSegments.filter((s) => !goneNodeIds.has(s.a) && !goneNodeIds.has(s.b));
    this.wires = this.wires.filter((w) => !markerIds.has(w.fromMarkerId) && !markerIds.has(w.toMarkerId));
    const gonePipeNodeIds = new Set(this.pipeNodes.filter((n) => n.markerId && markerIds.has(n.markerId)).map((n) => n.id));
    this.pipeNodes = this.pipeNodes.filter((n) => !gonePipeNodeIds.has(n.id) && !(n.floorId === this.activeFloorId && !n.markerId));
    this.pipes = this.pipes.filter((pipe) => !gonePipeNodeIds.has(pipe.a) && !gonePipeNodeIds.has(pipe.b));
    for (const w of this.wires) w.via = (w.via || []).filter((v) => !goneNodeIds.has(v));
    this.rectangles = [];
    this.constraints = [];
    this.markers = [];
    this.electricalLinks = [];
    this.activeFloor.finishes = [];
    this._emit();
  }

  // --- surface finishes (docs/materials.md) ---------------------------------
  // Floor: one finish per ROOM component. `componentIds` = every rect id of the room;
  // the finish is stored on `seedId`, replacing any other rect's floor finish there.
  // A null material clears it. Marker-like light emit: the rectangles don't change.
  setFloorFinish(componentIds, seedId, material) {
    const floor = this.activeFloor;
    const ids = new Set(componentIds);
    // A new material keeps the room's pattern start corner and turn (they are about the room).
    const old = (floor.finishes || []).filter((f) => !f.target?.edge && ids.has(f.target?.rect));
    const anchor = old.find((f) => f.anchor)?.anchor, turn = old.some((f) => f.turn);
    floor.finishes = (floor.finishes || []).filter((f) => f.target?.edge || !ids.has(f.target?.rect));
    if (material) floor.finishes.push({ target: { rect: seedId }, material, ...(anchor ? { anchor } : {}), ...(turn ? { turn } : {}) });
    this._emit({ solveRectangles: false });
  }

  // Pattern start corner of a floor laying region (docs/materials.md): cleared on every
  // floor finish of the region (`regionRectIds`), then stored on the finish of the room
  // `componentIds` (the room holding the corner). A null anchor = the plan origin.
  // Pattern turned 90° for a whole laying region: set on every floor finish of it.
  setFloorTurn(regionRectIds, turn) {
    const region = new Set(regionRectIds);
    for (const f of this.activeFloor.finishes || []) {
      if (f.target?.edge || !region.has(f.target?.rect)) continue;
      if (turn) f.turn = true; else delete f.turn;
    }
    this._emit({ solveRectangles: false });
  }

  setFloorAnchor(regionRectIds, componentIds, anchor) {
    const floor = this.activeFloor;
    const region = new Set(regionRectIds), comp = new Set(componentIds);
    for (const f of floor.finishes || []) {
      if (f.target?.edge || !region.has(f.target?.rect)) continue;
      delete f.anchor;
      if (anchor && comp.has(f.target.rect)) f.anchor = { rect: anchor.rect, corner: anchor.corner };
    }
    this._emit({ solveRectangles: false });
  }

  setWallFinish(faces, material) {
    const floor = this.activeFloor;
    const key = (t) => `${t.rect}:${t.edge}`;
    const keys = new Set(faces.map(key));
    floor.finishes = (floor.finishes || []).filter((f) => !f.target?.edge || !keys.has(key(f.target)));
    if (material) for (const t of faces) floor.finishes.push({ target: { rect: t.rect, edge: t.edge }, material });
    this._emit({ solveRectangles: false });
  }

  // Door or window: one product per DOOR / WINDOW zone, stored as a `{rect}` target on
  // the zone itself (an aperture rect is never part of a room component, so it can't
  // collide with a floor finish). A null material clears it.
  setWindowFinish(rectId, material) { this.setDoorFinish(rectId, material); }
  setDoorFinish(rectId, material) {
    const floor = this.activeFloor;
    floor.finishes = (floor.finishes || []).filter((f) => f.target?.edge || f.target?.rect !== rectId);
    if (material) floor.finishes.push({ target: { rect: rectId }, material });
    this._emit({ solveRectangles: false });
  }

  // Switch (later outlet) product on a marker of the ACTIVE floor (docs/materials.md
  // "Switches"): stored on the marker itself, so it follows copy/paste and deletion.
  // A null material clears it.
  setMarkerProduct(markerId, material) {
    const marker = this.activeFloor.markers.find((m) => m.id === markerId);
    if (!marker) return;
    if (material) marker.product = material;
    else delete marker.product;
    this._emit({ solveRectangles: false });
  }

  // --- markers (wall-anchored survey annotations) -------------------------
  // Add a marker (plain object {type, x, y, z}) to the active floor, minting an
  // id if none was supplied. z is its inherent height above the floor.
  addMarker(marker) {
    if (!marker.id) marker.id = nextMarkerId();
    if (!marker._locked) marker._locked = { x: false, y: false };
    this.markers.push(marker);
    // Marker creation cannot alter structural rectangles. Avoid the dense
    // all-floor rectangle solve; marker pins still resolve in the lightweight
    // one-way pass and listeners still receive the change.
    this._emit({ solveRectangles: false });
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
      const gonePipeNodeIds = new Set(this.pipeNodes.filter((n) => n.markerId === id).map((n) => n.id));
      this.pipeNodes = this.pipeNodes.filter((n) => !gonePipeNodeIds.has(n.id));
      this.pipes = this.pipes.filter((pipe) => !gonePipeNodeIds.has(pipe.a) && !gonePipeNodeIds.has(pipe.b));
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

  // Set a marker's vertical placement. datum 'floor' → value is the absolute height
  // above the floor (defines the dim, so it holds in a 3D grab); 'free' → un-defines
  // the height (grab moves Z).
  setMarkerVertical(id, datum, value) {
    const m = this.markers.find((m) => m.id === id);
    if (!m) return;
    setVertical(m, datum, value);
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
    // and therefore survive retyping untouched. A double switch retyped to a single one
    // keeps its links, all on the one rocker.
    this.electricalLinks = this.electricalLinks.filter((link) =>
      (link.kind || 'control') !== 'control' ||
      ((link.fromMarkerId !== id || isSwitch(m)) &&
       (link.toMarkerId !== id || type === 'light')));
    if (type !== 'switch_dual') {
      for (const link of this.electricalLinks) if (link.fromMarkerId === id) delete link.rocker;
      for (const w of this.wires) {
        if (w.fromMarkerId === id) delete w.fromRocker;
        if (w.toMarkerId === id) delete w.toRocker;
      }
    }
    this._emit();
  }

  // Toggle one logical switch-to-light control. The physical V1 wire route is
  // derived via the ceiling at render time and therefore needs no stale XYZ copy.
  // `rocker` (1 or 2) names the double switch's rocker that drives the light: toggling a
  // light already linked on the OTHER rocker moves it to this one.
  toggleElectricalLink(fromMarkerId, toMarkerId, rocker = 1) {
    const from = this.markers.find((m) => m.id === fromMarkerId);
    const to = this.markers.find((m) => m.id === toMarkerId);
    if (!from || !to || !isSwitch(from) || to.type !== 'light') {
      return { ok: false, reason: 'incompatible' };
    }
    const r = from.type === 'switch_dual' && rocker === 2 ? 2 : 1;
    const i = this.electricalLinks.findIndex((link) =>
      link.kind === 'control' && link.fromMarkerId === fromMarkerId && link.toMarkerId === toMarkerId);
    if (i >= 0 && (this.electricalLinks[i].rocker === 2 ? 2 : 1) !== r) {
      const link = this.electricalLinks[i];
      if (r === 2) link.rocker = 2; else delete link.rocker;
      this._emit();
      return { ok: true, linked: true, link };
    }
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
      ...(r === 2 ? { rocker: 2 } : {}),
      route: { mode: 'ceiling' },
    };
    this.electricalLinks.push(link);
    this._emit();
    return { ok: true, linked: true, link };
  }

  // Merge a double switch surveyed the old way (two switch markers at one point, one per
  // rocker) into the double-switch marker `id`: the plain switch at exactly the same
  // x, y and height becomes its rocker 2. Its lights move to rocker 2 (a light both
  // already drive stays on rocker 1), its wires move to `id` landing on rocker 2 (so two
  // independent circuits stay apart), its conduit/pipe bindings move to `id`,
  // then it is removed with its dimensions (`id` keeps its own, at the same point).
  // Returns the removed marker's id, or null when there is no partner.
  switchPairPartner(id) {
    const m = this.markers.find((k) => k.id === id);
    if (m?.type !== 'switch_dual') return null;
    return this.markers.find((k) => k !== m && k.type === 'switch'
      && k.x === m.x && k.y === m.y && (k.z ?? null) === (m.z ?? null)) || null;
  }
  mergeSwitchPair(id) {
    const partner = this.switchPairPartner(id);
    if (!partner) return null;
    const pid = partner.id;
    const mine = new Set(this.electricalLinks.filter((l) => l.fromMarkerId === id).map((l) => l.toMarkerId));
    for (const link of this.electricalLinks) {
      if (link.fromMarkerId !== pid || mine.has(link.toMarkerId)) continue;
      link.fromMarkerId = id; link.rocker = 2;
    }
    for (const w of this.wires) {
      if (w.fromMarkerId === pid) { w.fromMarkerId = id; w.fromRocker = 2; }
      if (w.toMarkerId === pid) { w.toMarkerId = id; w.toRocker = 2; }
    }
    this.wires = this.wires.filter((w) => w.fromMarkerId !== w.toMarkerId);
    // Conduit: rebind the partner's box node, or fold it into ours if we have one.
    const ours = this.conduitNodes.find((n) => n.markerId === id);
    for (const node of this.conduitNodes.filter((n) => n.markerId === pid)) {
      if (!ours) { node.markerId = id; continue; }
      for (const seg of this.conduitSegments) {
        if (seg.a === node.id) seg.a = ours.id;
        if (seg.b === node.id) seg.b = ours.id;
      }
      for (const w of this.wires) w.via = (w.via || []).map((v) => (v === node.id ? ours.id : v));
      this.conduitNodes = this.conduitNodes.filter((n) => n !== node);
    }
    const seen = new Set();
    this.conduitSegments = this.conduitSegments.filter((seg) => {
      const key = [seg.a, seg.b].sort().join('|');
      if (seg.a === seg.b || seen.has(key)) return false;
      seen.add(key); return true;
    });
    for (const node of this.pipeNodes) if (node.markerId === pid) node.markerId = id;
    if (!this.markers.find((k) => k.id === id).product && partner.product) {
      this.markers.find((k) => k.id === id).product = partner.product;
    }
    this.removeMarker(pid); // what is left on it: its dimensions and any duplicate link
    return pid;
  }

  // Remove one electrical link (control) by id.
  removeElectricalLink(id) {
    const i = this.electricalLinks.findIndex((link) => link.id === id);
    if (i < 0) return { ok: false };
    const [link] = this.electricalLinks.splice(i, 1);
    this._emit();
    return { ok: true, link };
  }

  // ---- Conduit network (whole-house physical channels) ---------------------
  // A node is either a bare junction ({x,y,z,floorId} — position RELATIVE to that
  // floor) or bound to a device marker (markerId set → position + floor follow the live
  // marker). Segments join two nodes; one whose ends resolve to different floors is a
  // riser. `floorId` defaults to the active floor for a bare junction.
  addConduitNode({ x = 0, y = 0, z = 0, floorId = this.activeFloorId, markerId = null, emit = true } = {}) {
    const node = { id: nextConduitNodeId(), x, y, z: z || 0, floorId, markerId };
    this.conduitNodes.push(node);
    if (emit) this._emit();
    return node;
  }

  // The conduit node bound to a marker, creating one if absent (so a conduit can
  // terminate at that device box). New nodes seed position + floor from the marker,
  // wherever it lives in the house.
  ensureConduitNodeAtMarker(markerId) {
    let node = this.conduitNodes.find((n) => n.markerId === markerId);
    if (node) return node;
    const found = this.findMarker(markerId);
    const m = found?.marker;
    node = { id: nextConduitNodeId(), x: m?.x ?? 0, y: m?.y ?? 0, z: m?.z ?? 0, floorId: found?.floor?.id ?? this.activeFloorId, markerId };
    this.conduitNodes.push(node);
    return node; // caller emits
  }

  // Join two nodes with a conduit segment (idempotent — one segment per node pair).
  addConduitSegment(aNodeId, bNodeId, { emit = true } = {}) {
    if (!aNodeId || !bNodeId || aNodeId === bNodeId) return null;
    const existing = this.conduitSegments.find((s) =>
      (s.a === aNodeId && s.b === bNodeId) || (s.a === bNodeId && s.b === aNodeId));
    if (existing) return existing;
    const seg = { id: nextConduitSegmentId(), a: aNodeId, b: bNodeId };
    this.conduitSegments.push(seg);
    if (emit) this._emit();
    return seg;
  }

  // Resolve which floor a node sits on: a marker-bound node inherits its marker's
  // floor; a bare junction carries its own floorId (default: active floor).
  conduitNodeFloorId(node) {
    if (!node) return this.activeFloorId;
    if (node.markerId) return this.floorOfMarker(node.markerId)?.id ?? node.floorId ?? this.activeFloorId;
    return node.floorId ?? this.activeFloorId;
  }

  // Move a bare junction node. Marker-bound nodes follow their marker and ignore this.
  moveConduitNode(id, { x, y, z }, { emit = true } = {}) {
    const n = this.conduitNodes.find((n) => n.id === id);
    if (!n || n.markerId) return;
    n.x = x; n.y = y; n.z = z || 0; // a pinned z is held by the drag caller, so the datum survives
    if (emit) this._emit();
  }

  // Set a bare junction's vertical placement against a datum (see setMarkerVertical).
  setConduitNodeVertical(id, datum, value) {
    const n = this.conduitNodes.find((n) => n.id === id);
    if (!n || n.markerId) return;
    setVertical(n, datum, value);
    this._emit();
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
  // Removing a node deletes its segments. A pass-through node (exactly two segments)
  // keeps the run: its two neighbours are rejoined by one segment (owner, 2026-09-29).
  // A branch node (3+ segments) has no single way to rejoin, so its segments just go.
  removeConduitNode(id) {
    if (!this.conduitNodes.some((n) => n.id === id)) return;
    const incident = this.conduitSegments.filter((s) => s.a === id || s.b === id);
    this.conduitNodes = this.conduitNodes.filter((n) => n.id !== id);
    this.conduitSegments = this.conduitSegments.filter((s) => s.a !== id && s.b !== id);
    for (const w of this.wires) w.via = (w.via || []).filter((v) => v !== id);
    if (incident.length === 2) {
      const [a, b] = incident.map((s) => (s.a === id ? s.b : s.a));
      this.addConduitSegment(a, b, { emit: false }); // no-op when a === b or already joined
    }
    this._emit();
  }

  // Split a segment with a new junction node at p, replacing it with two segments. The
  // junction inherits endpoint a's floor (for a riser this lands it on a's storey — the
  // user can relocate it afterward).
  splitConduitSegment(id, { x, y, z = 0, floorId } = {}) {
    const seg = this.conduitSegments.find((s) => s.id === id);
    if (!seg) return null;
    const aNode = this.conduitNodes.find((n) => n.id === seg.a);
    const node = { id: nextConduitNodeId(), x, y, z: z || 0, floorId: floorId ?? this.conduitNodeFloorId(aNode), markerId: null };
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
  addWire(fromMarkerId, toMarkerId, type = 'electrical') {
    // Wires are whole-house: resolve endpoints across every floor, not just the active
    // one, so a wire may run up a riser between markers on different storeys.
    const from = this.findMarker(fromMarkerId)?.marker;
    const to = this.findMarker(toMarkerId)?.marker;
    if (!from || !to || fromMarkerId === toMarkerId) return { ok: false, reason: 'incompatible' };
    const wire = {
      id: nextWireId(), fromMarkerId, toMarkerId,
      type: WIRE_TYPES.includes(type) ? type : 'electrical', via: [],
    };
    // A double-switch end starts on the rocker that controls the other end's light, if
    // any (the switched leg); otherwise rocker 1. setWireRockers changes it.
    if (this._controlRocker(from, to) === 2) wire.fromRocker = 2;
    if (this._controlRocker(to, from) === 2) wire.toRocker = 2;
    this.wires.push(wire);
    this._emit();
    return { ok: true, wire };
  }

  _controlRocker(sw, light) {
    if (sw.type !== 'switch_dual') return 1;
    for (const f of this.floors) {
      const link = (f.electricalLinks || []).find((l) =>
        (l.kind || 'control') === 'control' && l.fromMarkerId === sw.id && l.toMarkerId === light.id);
      if (link) return linkRocker(link);
    }
    return 1;
  }

  // Set the rocker each double-switch end of a wire lands on (1 or 2; ignored for an
  // end that is not a double switch).
  setWireRockers(id, fromRocker, toRocker) {
    const wire = this.wires.find((w) => w.id === id);
    if (!wire) return false;
    const dual = (markerId) => this.findMarker(markerId)?.marker?.type === 'switch_dual';
    if (dual(wire.fromMarkerId) && fromRocker === 2) wire.fromRocker = 2; else delete wire.fromRocker;
    if (dual(wire.toMarkerId) && toRocker === 2) wire.toRocker = 2; else delete wire.toRocker;
    this._emit();
    return true;
  }

  removeWire(id) {
    const i = this.wires.findIndex((w) => w.id === id);
    if (i < 0) return { ok: false };
    const [wire] = this.wires.splice(i, 1);
    this._emit();
    return { ok: true, wire };
  }

  setWireType(id, type) {
    const wire = this.wires.find((w) => w.id === id);
    if (!wire || !WIRE_TYPES.includes(type)) return false;
    wire.type = type;
    this._emit();
    return true;
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

  // ---- Plumbing graph (separate from electrical conduit/wires) -------------
  addPipeNode({ x = 0, y = 0, z = 0, floorId = this.activeFloorId, markerId = null, role = null, emit = true } = {}) {
    const node = { id: nextPipeNodeId(), x, y, z: z || 0, floorId, markerId, role };
    this.pipeNodes.push(node);
    if (emit) this._emit();
    return node;
  }

  ensurePipeNodeAtMarker(markerId, service = 'cold') {
    const normalizedService = PIPE_SERVICES.includes(service) ? service : 'cold';
    const role = PIPE_SERVICE_ROLE[normalizedService];
    let node = this.pipeNodes.find((n) => n.markerId === markerId && n.role === role);
    if (node) return node;
    const found = this.findMarker(markerId);
    if (!found) return null;
    const m = found.marker;
    node = { id: nextPipeNodeId(), x: m.x, y: m.y, z: m.z || 0, floorId: found.floor.id, markerId, role };
    this.pipeNodes.push(node);
    return node;
  }

  pipeNodeFloorId(node) {
    if (node?.markerId) return this.floorOfMarker(node.markerId)?.id ?? node.floorId ?? this.activeFloorId;
    return node?.floorId ?? this.activeFloorId;
  }

  addPipe(aNodeId, bNodeId, service = 'cold', diameter = 0.016, { emit = true } = {}) {
    if (!aNodeId || !bNodeId || aNodeId === bNodeId) return { ok: false, reason: 'incompatible' };
    if (!this.pipeNodes.some((n) => n.id === aNodeId) || !this.pipeNodes.some((n) => n.id === bNodeId)) return { ok: false, reason: 'missing-node' };
    const normalizedService = PIPE_SERVICES.includes(service) ? service : 'cold';
    const existing = this.pipes.find((p) => p.service === normalizedService
      && ((p.a === aNodeId && p.b === bNodeId) || (p.a === bNodeId && p.b === aNodeId)));
    if (existing) return { ok: true, pipe: existing };
    const pipe = { id: nextPipeId(), service: normalizedService,
      diameter: Number.isFinite(diameter) && diameter > 0 ? diameter : 0.016, a: aNodeId, b: bNodeId };
    this.pipes.push(pipe);
    if (emit) this._emit();
    return { ok: true, pipe };
  }

  removePipeNode(id) {
    if (!this.pipeNodes.some((n) => n.id === id)) return false;
    this.pipeNodes = this.pipeNodes.filter((n) => n.id !== id);
    this.pipes = this.pipes.filter((p) => p.a !== id && p.b !== id);
    this._emit();
    return true;
  }

  // Return the complete plumbing component reachable from one node. Service behaves
  // as a network property in the UI, while remaining stamped on segments for compact
  // persistence and future reducers/manifolds.
  pipeComponent(nodeId) {
    if (!this.pipeNodes.some((n) => n.id === nodeId)) return { nodeIds: new Set(), pipes: [] };
    const nodeIds = new Set([nodeId]);
    const pipes = [];
    const seenPipes = new Set();
    const queue = [nodeId];
    while (queue.length) {
      const current = queue.shift();
      for (const pipe of this.pipes) {
        if (seenPipes.has(pipe.id) || (pipe.a !== current && pipe.b !== current)) continue;
        seenPipes.add(pipe.id); pipes.push(pipe);
        const other = pipe.a === current ? pipe.b : pipe.a;
        if (!nodeIds.has(other)) { nodeIds.add(other); queue.push(other); }
      }
    }
    return { nodeIds, pipes };
  }

  pipeServiceAtNode(nodeId, fallback = 'cold') {
    return this.pipeComponent(nodeId).pipes[0]?.service
      || (PIPE_SERVICES.includes(fallback) ? fallback : 'cold');
  }

  setPipeComponentService(nodeId, service, { emit = true } = {}) {
    if (!PIPE_SERVICES.includes(service)) return false;
    const component = this.pipeComponent(nodeId);
    if (!component.nodeIds.size) return false;
    for (const pipe of component.pipes) pipe.service = service;
    for (const id of component.nodeIds) {
      const node = this.pipeNodes.find((candidate) => candidate.id === id);
      if (node?.markerId) node.role = PIPE_SERVICE_ROLE[service];
    }
    if (emit) this._emit();
    return true;
  }

  removePipe(id) {
    const i = this.pipes.findIndex((pipe) => pipe.id === id);
    if (i < 0) return { ok: false };
    const [pipe] = this.pipes.splice(i, 1);
    this._emit();
    return { ok: true, pipe };
  }

  setPipeService(id, service) {
    const pipe = this.pipes.find((candidate) => candidate.id === id);
    if (!pipe || !PIPE_SERVICES.includes(service)) return false;
    return this.setPipeComponentService(pipe.a, service);
  }

  // --- furniture products (docs/furniture.md "merge") ----------------------
  // A product is a material of its FURNITURE zone, like a door product on a DOOR zone.
  // `key` names the catalog entry `entry` (public/furniture/index.json); null clears. Assigning
  // snapshots the product size (the solver then sizes the zone, keeping its centre when
  // nothing pins it) and seeds the body band: foot = the catalog mount height, top =
  // foot + the product height. Clearing keeps the zone's current size.
  setFurnitureProduct(rectId, key, entry, { emit = true } = {}) {
    const rect = this.activeFloor.rectangles.find((r) => r.id === rectId && r.kind === 'furniture');
    if (!rect) return null;
    if (key == null || !entry) { delete rect.article; delete rect.productMm; }
    else applyProduct(rect, key, entry, { seedFoot: true });
    if (emit) this._emit();
    return rect;
  }

  // Size zones that name a product but hold no size snapshot (migrated from the old
  // furniture items, or a share link) once the catalog is loaded. Emits only if one
  // changed. The migrated foot is kept (it was the item's authored height).
  applyFurnitureCatalog(catalog) {
    let changed = false;
    for (const f of this.floors) {
      for (const r of f.rectangles) {
        if (r.kind !== 'furniture' || !r.article || r.productMm) continue;
        const entry = catalog?.[r.article];
        if (!entry || entry.madeToMeasure) continue;
        applyProduct(r, r.article, entry, { seedFoot: false });
        changed = changed || !!r.productMm;
      }
    }
    if (changed) this._emit();
    return changed;
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
    m.z = z; // a pinned z is held by the drag caller (passes the resolved z), so the datum survives
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

  // Heat-loss settings (docs/heat-loss.md), project-wide or for one floor. null resets
  // the key to its default. Not solver inputs: the emit only saves and notifies.
  setHeat(key, value, floor = null) {
    const next = { ...(floor ? floor.heat : this.heat) };
    if (value == null) delete next[key]; else next[key] = value;
    if (floor) floor.heat = cleanFloorHeat(next); else this.heat = cleanHeat(next); // drops bad keys/types
    this._emit();
  }

  // Re-solve every floor's constraints IN PLACE but skip the listener cascade —
  // for continuous render-loop drags (e.g. the AR edge grab) that need live,
  // fully-solved geometry each frame yet must NOT fire the whole desktop pipeline
  // (3D re-extrude, 2D canvas redraw, DOM panel rebuilds) 60+ times a second. The
  // caller updates its own view directly and commits once with touch() on release.
  solveSilently() {
    this._recomputeElevations();
    for (const f of this.floors) { solve(f, { prune: false }); solveMarkers(f); }
    solveConduitNodes(this); // keep node pins tracking the wall live during AR edge drags
  }
}
