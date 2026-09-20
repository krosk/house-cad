// Change map: a per-floor diff between a baseline snapshot (a saved slot) and the
// live project, so a revised plan sheet can show a contractor exactly what moved,
// grew, appeared, or disappeared since the last delivered version.
//
// Markers and constraints are matched by STABLE id across revisions of the same
// project lineage (autosave preserves them; loading a JSON and re-saving preserves
// them via deserializeInto). The diff never guesses geometrically: same id = same
// element, and it compares solved data (both floors are solved — the live one
// always, the baseline because deserializeInto ends in _emit). Zone/rectangle
// changes are deliberately outside the contractor change map.
//
// This module is pure model data: it returns structured change records. The plan
// sheet composes the human-readable revision labels + numbering (it owns unit
// display) and draws the clouds/tags — see drawChangeMap in src/io/planSheet.js.

import { Project } from './model.js';
import { deserializeInto } from '../io/serialize.js';
import { isMarkerConstraint, isNodeConstraint, edgeCoord, ORIGIN_ID } from './constraints.js';

const TOL = 0.001; // meters; below 1 mm is float/solver noise, not a real change.

const near = (a, b) => Math.abs((a || 0) - (b || 0)) <= TOL;

// Diff one live floor against the baseline floor of the same id. Either may be
// absent (a floor added to / removed from the project); callers handle those at
// the project level, but a missing baseline here is treated as "all added".
export function diffFloor(baseFloor, curFloor) {
  const markers = { added: [], removed: [], changed: [] };
  const dims = { added: [], removed: [], changed: [] };

  const baseMarkers = new Map((baseFloor?.markers || []).map((m) => [m.id, m]));
  const curMarkers = new Map((curFloor?.markers || []).map((m) => [m.id, m]));
  const unmatchedAdded = [];
  const unmatchedRemoved = [];
  for (const cur of curMarkers.values()) {
    const base = baseMarkers.get(cur.id);
    if (!base) { unmatchedAdded.push(cur); continue; }
    const moved = !near(base.x, cur.x) || !near(base.y, cur.y) || !near(base.z, cur.z);
    const retyped = base.type !== cur.type;
    if (moved || retyped) {
      markers.changed.push({ id: cur.id, change: moved && retyped ? 'mixed' : moved ? 'moved' : 'retyped', base, cur });
    }
  }
  for (const base of baseMarkers.values()) {
    if (!curMarkers.has(base.id)) unmatchedRemoved.push(base);
  }

  // A delete followed by recreating the same fixture gives it a fresh id, but is
  // not a meaningful contractor change. Reconcile only the still-unmatched markers
  // when type and solved XYZ coincide within the normal 1 mm diff tolerance. Build
  // every candidate and take nearest pairs first so duplicate/stacked fixtures are
  // cancelled deterministically one-to-one rather than depending on array order.
  const candidates = [];
  for (let ai = 0; ai < unmatchedAdded.length; ai++) {
    const cur = unmatchedAdded[ai];
    for (let ri = 0; ri < unmatchedRemoved.length; ri++) {
      const base = unmatchedRemoved[ri];
      if (base.type !== cur.type || !near(base.x, cur.x) || !near(base.y, cur.y) || !near(base.z, cur.z)) continue;
      const dx = (base.x || 0) - (cur.x || 0);
      const dy = (base.y || 0) - (cur.y || 0);
      const dz = (base.z || 0) - (cur.z || 0);
      candidates.push({ ai, ri, d2: dx * dx + dy * dy + dz * dz });
    }
  }
  candidates.sort((a, b) => a.d2 - b.d2 || a.ai - b.ai || a.ri - b.ri);
  const matchedAdded = new Set(), matchedRemoved = new Set();
  for (const { ai, ri } of candidates) {
    if (matchedAdded.has(ai) || matchedRemoved.has(ri)) continue;
    matchedAdded.add(ai); matchedRemoved.add(ri);
  }
  unmatchedAdded.forEach((cur, i) => { if (!matchedAdded.has(i)) markers.added.push({ id: cur.id, cur }); });
  unmatchedRemoved.forEach((base, i) => { if (!matchedRemoved.has(i)) markers.removed.push({ id: base.id, base }); });

  // Only structural distance constraints read as "dimensions" a contractor cares
  // about. Marker pins are reported via their marker; conduit-node pins are
  // authoring data and never belong on a sheet or its revision map.
  const isDim = (c) => c.type === 'distance' && !isMarkerConstraint(c) && !isNodeConstraint(c);
  const baseDims = new Map((baseFloor?.constraints || []).filter(isDim).map((c) => [c.id, c]));
  const curDims = new Map((curFloor?.constraints || []).filter(isDim).map((c) => [c.id, c]));
  const coordOn = (floor, endpoint) => {
    if (endpoint?.rect === ORIGIN_ID) return 0;
    const id = endpoint?.rect?.id ?? endpoint?.rect;
    const rect = (floor?.rectangles || []).find((r) => r.id === id);
    return rect ? edgeCoord(rect, endpoint.edge) : null;
  };
  // An added dimension is a change annotation only when the geometry it describes
  // actually changed. Adding a read-only/informational measurement between stable
  // edges must not manufacture a revision. A missing baseline edge counts as new.
  const addedDimDescribesMovedEdge = (c) => [c.a, c.b].some((endpoint) => {
    const curCoord = coordOn(curFloor, endpoint);
    const baseCoord = coordOn(baseFloor, endpoint);
    return !Number.isFinite(curCoord) || !Number.isFinite(baseCoord) || !near(curCoord, baseCoord);
  });
  for (const cur of curDims.values()) {
    const base = baseDims.get(cur.id);
    if (!base) {
      if (Math.abs(cur.value || 0) > TOL && addedDimDescribesMovedEdge(cur)) {
        dims.added.push({ id: cur.id, cur });
      }
      continue;
    }
    // Compare magnitude: the sign only encodes direction, not the measured length.
    if (!near(Math.abs(base.value), Math.abs(cur.value))) {
      dims.changed.push({ id: cur.id, base, cur, from: Math.abs(base.value), to: Math.abs(cur.value) });
    }
  }
  // Removed dimensions are drafting changes, not changes to the built geometry.
  // Keep `removed` in the stable result shape, but deliberately leave it empty.

  return { markers, dims };
}

// True when a floor diff contains at least one change (so the sheet can skip an
// empty revision legend / cloud pass).
export function floorDiffHasChanges(diff) {
  if (!diff) return false;
  const nonEmpty = (g) => g.added.length || g.removed.length || g.changed.length;
  return !!(nonEmpty(diff.markers) || nonEmpty(diff.dims));
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
