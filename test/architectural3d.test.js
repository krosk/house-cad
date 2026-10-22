import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArchitecturalFloor, architecturalWallBoxes, MARKER_FACE } from '../src/core/architectural3d.js';
import { oneRoomData, load } from './house.js';

const roomCentre = { x: 1, y: 1.5 }; // inside r1, west of the interior wall

// Item 100's regression (e85912c): the builder lost markerPlacements and every wall device
// faced −y. Each device must be placed on a face, its normal pointing into open air.
test('buildArchitecturalFloor places every wall device on a face, facing the room', () => {
  const floor = load(oneRoomData()).floors[0];
  const { markerPlacements } = buildArchitecturalFloor(floor);
  assert.ok(markerPlacements instanceof Map);
  const expected = {
    m1: { x: 0, y: 1.5, nx: 1, ny: 0 },   // the west exterior wall, room side
    m2: { x: 2, y: 1, nx: -1, ny: 0 },    // the interior wall, west face
    m3: { x: 2.1, y: 2, nx: 1, ny: 0 },   // the interior wall, east face
    m4: { x: 3, y: 3, nx: 0, ny: -1 },    // the north exterior wall, room side
  };
  for (const [id, want] of Object.entries(expected)) {
    const got = markerPlacements.get(id);
    assert.ok(got, `${id} has a placement`);
    assert.equal(got.snapped, true, `${id} snapped to a face`);
    assert.deepEqual({ x: got.x, y: got.y, nx: got.nx, ny: got.ny }, want, id);
  }
  // m1's face looks toward the room's centre.
  const m1 = markerPlacements.get('m1');
  assert.ok((roomCentre.x - m1.x) * m1.nx + (roomCentre.y - m1.y) * m1.ny > 0);
});

// No plate (the standard 8 cm face, 25 mm deep, set on its placement) may sit inside a wall solid.
test('no device plate cuts into a wall', () => {
  const floor = load(oneRoomData()).floors[0];
  const boxes = architecturalWallBoxes(floor);
  const { markerPlacements } = buildArchitecturalFloor(floor);
  const s = MARKER_FACE / 2, DEPTH = 0.025;
  for (const m of floor.markers) {
    const q = markerPlacements.get(m.id);
    const tx = -q.ny, ty = q.nx;
    const xs = [q.x + tx * s, q.x - tx * s, q.x + q.nx * DEPTH + tx * s, q.x + q.nx * DEPTH - tx * s];
    const ys = [q.y + ty * s, q.y - ty * s, q.y + q.ny * DEPTH + ty * s, q.y + q.ny * DEPTH - ty * s];
    const plate = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: m.z - s, z1: m.z + s };
    for (const w of boxes) {
      const ox = Math.min(plate.x1, w.x1) - Math.max(plate.x0, w.x0);
      const oy = Math.min(plate.y1, w.y1) - Math.max(plate.y0, w.y0);
      const oz = Math.min(plate.z1, w.z1) - Math.max(plate.z0, w.z0);
      assert.ok(!(ox > 1e-4 && oy > 1e-4 && oz > 1e-4), `${m.id} overlaps a wall box ${JSON.stringify(w)}`);
    }
  }
});

test('a door zone cuts the wall up to its head', () => {
  const floor = load(oneRoomData()).floors[0];
  const boxes = architecturalWallBoxes(floor);
  // Nothing solid in the opening (x 0.5–1.28 on the south wall) below the 2.1 m head.
  const inOpening = boxes.filter((w) => w.x0 < 1.28 - 1e-6 && w.x1 > 0.5 + 1e-6 && w.y1 <= 0.06 + 1e-6 && w.z0 < 2.1 - 1e-6);
  assert.deepEqual(inOpening, []);
  // The lintel above it is there.
  assert.ok(boxes.some((w) => w.x0 <= 0.5 + 1e-6 && w.x1 >= 1.28 - 1e-6 && Math.abs(w.z0 - 2.1) < 1e-6));
});
