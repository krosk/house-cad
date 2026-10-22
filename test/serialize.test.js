import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject, validateProjectData } from '../src/io/serialize.js';
import { makeDistance } from '../src/core/constraints.js';
import { oneRoomData, load } from './house.js';

// The solved form (tools/solve-house.mjs): load → serialize → load → serialize changes nothing,
// so the app's next save of a headset write is a no-op.
test('a solved save is stable through another load', () => {
  const p = load(oneRoomData());
  const room = p.activeFloor.rectangles[0], wall = p.activeFloor.rectangles[1];
  const c = p.addConstraint(makeDistance(room, 'left', wall, 'left'));
  p.setConstraintMagnitude(c.id, 2.3);
  p.addPipeNode({ x: 1, y: 1, z: 0.1 });
  const once = serializeProject(p);
  assert.equal(validateProjectData(once), null);
  const twice = serializeProject(load(once));
  assert.deepEqual(twice, once);
});

test('a save keeps zones, markers, constraints and the pipe network', () => {
  const p = load(oneRoomData());
  const a = p.addPipeNode({ x: 1, y: 1, z: 0.1 }), b = p.addPipeNode({ x: 1, y: 2, z: 0.1 });
  p.addPipe(a.id, b.id, 'hot', 0.016);
  const back = load(serializeProject(p));
  const f = back.activeFloor;
  assert.deepEqual(f.rectangles.map((r) => [r.id, r.kind]), [['r1', 'room'], ['r2', 'wall'], ['r3', 'door']]);
  assert.deepEqual(f.markers.map((m) => m.id), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(back.pipes.length, 1);
  assert.equal(back.pipes[0].service, 'hot');
  assert.equal(back.pipeNodes.length, 2);
});

test('validateProjectData names what is wrong, and passes a house', () => {
  assert.equal(validateProjectData(oneRoomData()), null);
  assert.match(validateProjectData({ hello: 1 }), /floors/);
  assert.match(validateProjectData({ app: 'other', floors: [] }), /Unknown file/);
});
