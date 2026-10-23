// The AR 3D view's furniture merged across items (mergeAcrossByMaterial, docs/ar-survey.md
// "Performance notes"): one mesh per material look, same triangles and bounds, front faces kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeAcrossByMaterial, materialSignature } from '../src/ui/mergeByMaterial.js';

const tex = new THREE.Texture();
// An item like instantiateFurniture's: its own material copies, sharing the texture.
function item(x, { mirror = false } = {}) {
  const root = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x996633, map: tex });
  const steel = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.5), wood);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2), steel);
  handle.position.set(0.2, 0.3, 0.26);
  root.add(body, handle);
  root.position.set(x, 0, -1);
  if (mirror) root.scale.x = -1;
  return root;
}
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const box = (objs) => { const b = new THREE.Box3(); for (const o of objs) b.expandByObject(o); return b; };

test('copies of one look share a signature; another colour does not', () => {
  const a = new THREE.MeshLambertMaterial({ color: 0x996633, map: tex });
  assert.equal(materialSignature(a), materialSignature(a.clone()));
  assert.notEqual(materialSignature(a), materialSignature(new THREE.MeshLambertMaterial({ color: 0x996634, map: tex })));
  assert.notEqual(materialSignature(a), materialSignature(new THREE.MeshLambertMaterial({ color: 0x996633 })));
});

test('three items become one mesh per look, same triangles and bounds', () => {
  const frame = new THREE.Group();
  const items = [item(0), item(1), item(2)];
  frame.add(...items);
  frame.position.set(5, 1, 2); // the frame's own transform must not leak into the batch
  frame.updateMatrixWorld(true);
  const before = box(items), srcTris = items.length * (tris(items[0].children[0].geometry) + tris(items[0].children[1].geometry));
  const { meshes, taken } = mergeAcrossByMaterial(items, frame);
  assert.equal(meshes.length, 2);
  assert.equal(taken.length, 6);
  assert.equal(meshes.reduce((n, m) => n + tris(m.geometry), 0), srcTris);
  const batch = new THREE.Group(); batch.add(...meshes); frame.add(batch); frame.updateMatrixWorld(true);
  const after = box([batch]);
  assert.ok(after.min.distanceTo(before.min) < 1e-6 && after.max.distanceTo(before.max) < 1e-6);
});

test('cells keep far items apart', () => {
  const frame = new THREE.Group();
  const items = [item(0.5), item(1), item(7), item(7.5)];
  frame.add(...items);
  assert.equal(mergeAcrossByMaterial(items, frame, { cell: 3 }).meshes.length, 4);
});

test('a mirrored item keeps its faces outward', () => {
  const frame = new THREE.Group();
  const items = [item(0), item(2, { mirror: true })];
  frame.add(...items);
  const { meshes } = mergeAcrossByMaterial(items, frame);
  const body = meshes.find((m) => m.material.map);
  const g = body.geometry, p = g.attributes.position, n = g.attributes.normal, idx = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(p, idx[t]); b.fromBufferAttribute(p, idx[t + 1]); c.fromBufferAttribute(p, idx[t + 2]);
    face.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    nrm.fromBufferAttribute(n, idx[t]);
    assert.ok(face.dot(nrm) > 0.99, `triangle ${t / 3} faces inward`);
  }
});

test('bakeColours joins untextured parts of different colours, colour per vertex', () => {
  const frame = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xff0000 }), blue = new THREE.MeshLambertMaterial({ color: 0x0000ff });
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red), b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blue);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
  b.position.x = 2;
  frame.add(a, b, glass);
  assert.equal(mergeAcrossByMaterial([a, b, glass], frame).meshes.length, 0); // without it: nothing shared
  const { meshes, taken } = mergeAcrossByMaterial([a, b, glass], frame, { bakeColours: true });
  assert.equal(meshes.length, 1);
  assert.deepEqual(taken, [a, b]); // the transparent one stays apart
  const [mesh] = meshes, col = mesh.geometry.attributes.color, n = a.geometry.attributes.position.count;
  assert.ok(mesh.material.vertexColors && mesh.material.color.getHex() === 0xffffff && mesh.material.userData.ownMaterial);
  assert.deepEqual([col.getX(0), col.getY(0), col.getZ(0)], [red.color.r, red.color.g, red.color.b]);
  assert.deepEqual([col.getX(n), col.getY(n), col.getZ(n)], [blue.color.r, blue.color.g, blue.color.b]);
  assert.equal(red.color.getHex(), 0xff0000); // the items' own materials are untouched
});
