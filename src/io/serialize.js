// Serialize / deserialize a Project to plain JSON. This is the persistent,
// parametric definition of the house: rectangles + constraints + height. The
// downstream footprint/extrusion is always recomputed, never stored.

import { Rectangle, syncRectIdCounter } from '../core/model.js';
import { syncConstraintIdCounter } from '../core/constraints.js';

export const FILE_VERSION = 1;

export function serializeProject(project) {
  return {
    app: 'house-cad',
    version: FILE_VERSION,
    height: project.height,
    rectangles: project.rectangles.map((r) => ({
      id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, op: r.op,
    })),
    constraints: project.constraints.map((c) => ({
      id: c.id, type: c.type, axis: c.axis,
      a: { ...c.a }, b: { ...c.b }, value: c.value,
      offset: c.offset ?? null,
    })),
  };
}

// Basic shape validation so a bad/foreign file fails loudly, not silently.
export function validateProjectData(data) {
  if (!data || typeof data !== 'object') return 'Not a JSON object.';
  if (data.app && data.app !== 'house-cad') return `Unknown file (app="${data.app}").`;
  if (!Array.isArray(data.rectangles)) return 'Missing "rectangles" array.';
  for (const r of data.rectangles) {
    if (['x', 'y', 'w', 'h'].some((k) => typeof r[k] !== 'number')) {
      return 'A rectangle is missing numeric x/y/w/h.';
    }
  }
  if (data.constraints && !Array.isArray(data.constraints)) return '"constraints" must be an array.';
  return null; // ok
}

// Replace the project's contents from parsed JSON data. Emits one change.
export function deserializeInto(project, data) {
  const err = validateProjectData(data);
  if (err) throw new Error(err);

  project.rectangles = data.rectangles.map(
    (r) => new Rectangle({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, op: r.op || 'add' }),
  );
  project.constraints = (data.constraints || []).map((c) => ({
    id: c.id,
    type: c.type || 'distance',
    axis: c.axis,
    a: { ...c.a },
    b: { ...c.b },
    value: c.value,
    offset: typeof c.offset === 'number' ? c.offset : null,
    conflict: false,
  }));
  project.height = typeof data.height === 'number' ? data.height : 2.8;

  // Ensure future auto-generated ids don't collide with loaded ones.
  syncRectIdCounter(project.rectangles.map((r) => r.id));
  syncConstraintIdCounter(project.constraints.map((c) => c.id));

  project._emit();
}
