// Change map: a per-floor diff between a baseline snapshot (a saved slot) and the
// live project, so a revised plan sheet can show a contractor exactly what moved,
// grew, appeared, or disappeared since the last delivered version.
//
// Everything is matched by STABLE id — rectangles, markers, and constraints all
// keep their ids across revisions of the same project lineage (autosave preserves
// them; loading a JSON and re-saving preserves them via deserializeInto). So the
// diff never guesses geometrically: same id = same element, and we compare its
// SOLVED geometry (both floors are solved — the live one always, the baseline
// because deserializeInto ends in _emit). Elements without a matching id are
// genuinely added/removed.
//
// This module is pure model data: it returns structured change records. The plan
// sheet composes the human-readable revision labels + numbering (it owns unit
// display) and draws the clouds/tags — see drawChangeMap in src/io/planSheet.js.

import { Project } from './model.js';
import { deserializeInto } from '../io/serialize.js';
import { isMarkerConstraint } from './constraints.js';

const TOL = 0.001; // meters; below 1 mm is float/solver noise, not a real change.

const near = (a, b) => Math.abs((a || 0) - (b || 0)) <= TOL;

// Compare two solved rectangles of the same id. Returns the kind of change, or
// null when nothing meaningful moved.
function rectChange(base, cur) {
  const a = base.bounds, b = cur.bounds;
  const moved = !near(a.x0, b.x0) || !near(a.y0, b.y0);
  const resized = !near(a.x1 - a.x0, b.x1 - b.x0) || !near(a.y1 - a.y0, b.y1 - b.y0);
  const retyped = base.kind !== cur.kind;
  if (!moved && !resized && !retyped) return null;
  const flags = [moved && 'moved', resized && 'resized', retyped && 'retyped'].filter(Boolean);
  return flags.length > 1 ? 'mixed' : flags[0];
}

// Diff one live floor against the baseline floor of the same id. Either may be
// absent (a floor added to / removed from the project); callers handle those at
// the project level, but a missing baseline here is treated as "all added".
export function diffFloor(baseFloor, curFloor) {
  const rects = { added: [], removed: [], changed: [] };
  const markers = { added: [], removed: [], changed: [] };
  const dims = { added: [], removed: [], changed: [] };

  const baseRects = new Map((baseFloor?.rectangles || []).map((r) => [r.id, r]));
  const curRects = new Map((curFloor?.rectangles || []).map((r) => [r.id, r]));
  for (const cur of curRects.values()) {
    const base = baseRects.get(cur.id);
    if (!base) { rects.added.push({ id: cur.id, cur }); continue; }
    const change = rectChange(base, cur);
    if (change) rects.changed.push({ id: cur.id, change, base, cur });
  }
  for (const base of baseRects.values()) {
    if (!curRects.has(base.id)) rects.removed.push({ id: base.id, base });
  }

  const baseMarkers = new Map((baseFloor?.markers || []).map((m) => [m.id, m]));
  const curMarkers = new Map((curFloor?.markers || []).map((m) => [m.id, m]));
  for (const cur of curMarkers.values()) {
    const base = baseMarkers.get(cur.id);
    if (!base) { markers.added.push({ id: cur.id, cur }); continue; }
    const moved = !near(base.x, cur.x) || !near(base.y, cur.y) || !near(base.z, cur.z);
    const retyped = base.type !== cur.type;
    if (moved || retyped) {
      markers.changed.push({ id: cur.id, change: moved && retyped ? 'mixed' : moved ? 'moved' : 'retyped', base, cur });
    }
  }
  for (const base of baseMarkers.values()) {
    if (!curMarkers.has(base.id)) markers.removed.push({ id: base.id, base });
  }

  // Only structural (non-marker) distance constraints read as "dimensions" a
  // contractor cares about; marker-pin changes are reported via the marker itself.
  const isDim = (c) => !isMarkerConstraint(c);
  const baseDims = new Map((baseFloor?.constraints || []).filter(isDim).map((c) => [c.id, c]));
  const curDims = new Map((curFloor?.constraints || []).filter(isDim).map((c) => [c.id, c]));
  for (const cur of curDims.values()) {
    const base = baseDims.get(cur.id);
    if (!base) { dims.added.push({ id: cur.id, cur }); continue; }
    // Compare magnitude: the sign only encodes direction, not the measured length.
    if (!near(Math.abs(base.value), Math.abs(cur.value))) {
      dims.changed.push({ id: cur.id, base, cur, from: Math.abs(base.value), to: Math.abs(cur.value) });
    }
  }
  for (const base of baseDims.values()) {
    if (!curDims.has(base.id)) dims.removed.push({ id: base.id, base });
  }

  return { rects, markers, dims };
}

// True when a floor diff contains at least one change (so the sheet can skip an
// empty revision legend / cloud pass).
export function floorDiffHasChanges(diff) {
  if (!diff) return false;
  const nonEmpty = (g) => g.added.length || g.removed.length || g.changed.length;
  return !!(nonEmpty(diff.rects) || nonEmpty(diff.markers) || nonEmpty(diff.dims));
}

// Deserialize a saved snapshot (a slot's `data`) into a throwaway Project — which
// solves it on load — then diff each live floor against the baseline floor of the
// same id. Returns Map<floorId, floorDiff> covering every floor present in EITHER
// version (a floor only in the baseline diffs as all-removed; one only in the live
// project as all-added). Throws if the snapshot fails validation.
export function diffAgainstSnapshot(project, snapshotData) {
  const baseline = new Project(); // its seed floor is discarded by deserializeInto
  deserializeInto(baseline, snapshotData);
  const baseFloors = new Map(baseline.floors.map((f) => [f.id, f]));
  const result = new Map();
  for (const cur of project.floors) {
    result.set(cur.id, diffFloor(baseFloors.get(cur.id), cur));
  }
  for (const base of baseline.floors) {
    if (!result.has(base.id)) result.set(base.id, diffFloor(base, null));
  }
  return result;
}
