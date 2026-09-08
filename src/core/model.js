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

import { solve } from './constraints.js';

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

export class Project {
  constructor() {
    this.rectangles = [];
    this.constraints = [];
    this.height = 2.8; // wall height, meters
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // Resolve constraints, then notify listeners so they see solved geometry.
  _emit() {
    solve(this);
    for (const fn of this._listeners) fn(this);
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
    this._emit();
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

  setHeight(h) {
    this.height = Math.max(0.01, h);
    this._emit();
  }

  // Call after mutating a rectangle in place (e.g. moving it).
  touch() {
    this._emit();
  }
}
