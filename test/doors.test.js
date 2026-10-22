import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildArchitecturalFloor, doorProductPlacements } from '../src/core/architectural3d.js';
import { materialById } from '../src/core/materials.js';
import { oneRoomData, load, stubTextures } from './house.js';

let buildDoorProduct;
before(async () => {
  await stubTextures();
  ({ buildDoorProduct } = await import('../src/ui/doorProducts.js'));
});

const box = (mesh) => new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);

// docs/materials.md "Doors": a LINE frame 78 cm outside holds a 73 cm leaf (leafInset 2.5 cm);
// the handle spindle is 5 cm from the leaf's lock edge (backset).
test('a LINE door in a 0.78 zone gets a 0.73 leaf, its handle 5 cm from the lock edge', () => {
  const data = oneRoomData();
  data.floors[0].finishes = [{ target: { rect: 'r3' }, material: 'door_line_acoustic_white' }];
  const p = load(data);
  const floor = p.floors[0];
  const [placement] = doorProductPlacements(floor, (id) => materialById(p, id));
  assert.equal(placement.rectId, 'r3');
  assert.ok(Math.abs(placement.width - 0.78) < 1e-9);
  const meshes = buildDoorProduct(placement);
  // The leaf is the one box with a material per face.
  const leaf = meshes.find((m) => Array.isArray(m.material));
  const lb = box(leaf);
  assert.ok(Math.abs(lb.max.x - lb.min.x - 0.73) < 1e-6, `leaf ${lb.max.x - lb.min.x}`);
  // The handle roses: 4.4 cm discs at the handle height (1.05 m), one per face.
  // (The jambs are 4.46 cm wide too, but full height.)
  const roses = meshes.map(box).filter((b) => Math.abs(b.max.x - b.min.x - 0.044) < 1e-3
    && b.max.y - b.min.y < 0.1 && Math.abs((b.min.y + b.max.y) / 2 - 1.05) < 1e-3);
  assert.equal(roses.length, 2);
  const roseX = (roses[0].min.x + roses[0].max.x) / 2;
  const fromLock = Math.min(Math.abs(roseX - lb.min.x), Math.abs(roseX - lb.max.x));
  assert.ok(Math.abs(fromLock - 0.05) < 1e-6, `handle ${fromLock} from the lock edge`);
});

// 🚪 Doors (View3D.closedDoors) swaps between two prebuilt leaves, never rebuilding the model.
test('🚪 Doors: a plain door leaf is built both open and closed', () => {
  const floor = load(oneRoomData()).floors[0];
  const { doorLeaves } = buildArchitecturalFloor(floor, { openDoors: true, doorLeavesApart: true });
  assert.equal(doorLeaves.length, 1);
  const [leaf] = doorLeaves;
  assert.equal(leaf.rectId, 'r3');
  assert.ok(leaf.open && leaf.closed, 'both geometries');
  leaf.open.computeBoundingBox();
  leaf.closed.computeBoundingBox();
  // Closed, the leaf fills the opening along the wall; open, it stands across it.
  const along = (g) => g.boundingBox.max.x - g.boundingBox.min.x;
  assert.ok(along(leaf.closed) > 0.7);
  assert.ok(along(leaf.open) < 0.1);
});
