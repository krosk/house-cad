import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDistance, makeOriginDistance, edgeCoord, snapM } from '../src/core/constraints.js';
import { oneRoomData, load } from './house.js';

const rect = (p, id) => p.activeFloor.rectangles.find((r) => r.id === id);

test('a distance stores the signed b − a and holds a while b moves', () => {
  const p = load(oneRoomData());
  const room = rect(p, 'r1'), wall = rect(p, 'r2');
  const c = p.addConstraint(makeDistance(room, 'left', wall, 'left'));
  assert.equal(c.value, 2);
  p.setConstraintMagnitude(c.id, 1.5); // the left edge only: past the right edge (2.1) the wall would flip
  // Least squares: the dimension holds to the solver's 1 mm tolerance, a barely moves, b takes the change.
  assert.ok(Math.abs(edgeCoord(wall, 'left') - edgeCoord(room, 'left') - 1.5) < 1e-3);
  assert.ok(Math.abs(edgeCoord(room, 'left')) < 1e-3);
  assert.equal(c.conflict, false);
});

test('a reversed distance keeps its side when its magnitude is edited', () => {
  const p = load(oneRoomData());
  const room = rect(p, 'r1'), wall = rect(p, 'r2');
  const c = p.addConstraint(makeDistance(wall, 'left', room, 'left'));
  assert.equal(c.value, -2);
  p.setConstraintMagnitude(c.id, 1.5);
  assert.equal(c.value, -1.5);
  assert.equal(edgeCoord(wall, 'left') - edgeCoord(room, 'left'), 1.5);
  p.swapConstraint(c.id); // same geometry, the other anchor
  assert.equal(c.value, 1.5);
  assert.equal(edgeCoord(wall, 'left') - edgeCoord(room, 'left'), 1.5);
});

test('two dimensions that disagree are flagged as a conflict', () => {
  const p = load(oneRoomData());
  const room = rect(p, 'r1');
  p.addConstraint(makeOriginDistance(room, 'left'));          // left = 0
  const w = p.addConstraint(makeDistance(room, 'left', room, 'right'));
  assert.equal(w.conflict, false);
  const other = makeOriginDistance(room, 'right');            // right = 4 …
  other.value = 4.2;                                           // … but this one says 4.2
  p.addConstraint(other);
  assert.ok(p.activeFloor.constraints.some((c) => c.conflict), 'a dimension is red');
});

test('every stored length lands on the 0.1 mm grid', () => {
  const data = oneRoomData();
  data.floors[0].rectangles[1].x = 2.000049;
  data.floors[0].markers[0].z = 0.30004;
  const p = load(data);
  assert.equal(rect(p, 'r2').x, 2);
  assert.equal(p.activeFloor.markers[0].z, 0.3);
  assert.equal(snapM(0.1 + 0.2), 0.3);
});
