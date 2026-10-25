// The street wall's products (owner, 2026-10-25): a Trez gate hung from a sill between pillars,
// the Klos'up fence's posts and glissières, the RENZ letter box. Synthetic plans only.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { doorProductPlacements, fencePostBoxes } from '../src/core/architectural3d.js';
import { materialById } from '../src/core/materials.js';
import { load, stubTextures } from './house.js';

let buildDoorProduct, buildProceduralFurniture;
before(async () => {
  await stubTextures();
  ({ buildDoorProduct } = await import('../src/ui/doorProducts.js'));
  ({ buildProceduralFurniture } = await import('../src/ui/proceduralFurniture.js'));
});

// A garden: a low wall along y (x 0–0.24) at 0.73, pillars at its ends and in it, gates between.
function garden({ rects = [], finishes = [] } = {}) {
  return load({
    app: 'house-cad', version: 3, activeFloorId: 'f1', groundFloorId: 'f1',
    floors: [{
      id: 'f1', name: 'Garden', height: 2.8, slab: 0.2,
      rectangles: [
        { id: 'w1', x: 0, y: 0, w: 0.24, h: 4, kind: 'gardenwall', top: 0.73 },
        { id: 'p1', x: 0, y: -0.2, w: 0.24, h: 0.2, kind: 'gardenwall', top: 1.9 },
        { id: 'p2', x: 0, y: 4, w: 0.24, h: 0.2, kind: 'gardenwall', top: 1.9 },
        ...rects,
      ],
      constraints: [], markers: [], electricalLinks: [], finishes,
    }],
  });
}
// The gate's width, whichever plan axis its zone runs along.
const span = (b) => Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
const bounds = (meshes) => { const b = new THREE.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox); } return b; };

test('a Trez gate with a sill hangs its leaf from the sill, 25 mm in from each pillar', () => {
  const p = garden({
    rects: [{ id: 'g1', x: 0.05, y: 5, w: 0.07, h: 1.04, kind: 'gate', sill: 0.23, head: 1.77 }],
    finishes: [{ target: { rect: 'g1' }, material: 'gate_trez_anthracite_std99' }],
  });
  const [pl] = doorProductPlacements(p.floors[0], (id) => materialById(p, id));
  assert.equal(pl.sill, 0.23);
  const meshes = buildDoorProduct(pl);
  // The stiles: the full-height boxes.
  const stiles = meshes.filter((m) => { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return b.max.y - b.min.y > 1.4; });
  assert.equal(stiles.length, 2);
  const s = bounds(stiles);
  assert.ok(Math.abs(s.min.y - 0.23) < 1e-6 && Math.abs(s.max.y - 1.77) < 1e-6, `leaf ${s.min.y}–${s.max.y}`);
  assert.ok(Math.abs(span(s) - 0.99) < 1e-6, `leaf width ${span(s)}`);
});

test('a 2-leaf Trez to the opening stands 35 mm in from each pillar; its ground stop stays on the ground', () => {
  const p = garden({
    rects: [{ id: 'g2', x: 0.05, y: 6, w: 0.05, h: 2.86, kind: 'gate', sill: 0.115, head: 1.785 }],
    finishes: [{ target: { rect: 'g2' }, material: 'gate_trez2_anthracite_opening' }],
  });
  const [pl] = doorProductPlacements(p.floors[0], (id) => materialById(p, id));
  const meshes = buildDoorProduct(pl);
  const tall = meshes.filter((m) => { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return b.max.y - b.min.y > 1.5; });
  const s = bounds(tall);
  assert.ok(Math.abs(span(s) - 2.79) < 1e-6, `gate width ${span(s)}`);
  assert.ok(Math.abs(bounds(meshes).min.y) < 1e-6, 'the stop reaches the ground');
});

test('Klos\'up fence zones: a glissière against each pillar, one shared post at the bay joint', () => {
  const fence = (id, y0, y1) => ({ id, x: 0.1075, y: y0, w: 0.025, h: y1 - y0, kind: 'fence', foot: 0.755, top: 1.755 });
  const p = garden({
    rects: [fence('f1', 0, 1.772), fence('f2', 1.772, 4)],
    finishes: ['f1', 'f2'].map((id) => ({ target: { rect: id }, material: 'fence_klosup_ajouree_anthracite' })),
  });
  const floor = p.floors[0], def = materialById(p, 'fence_klosup_ajouree_anthracite');
  const ups = floor.rectangles.filter((r) => r.kind === 'fence').flatMap((r) => fencePostBoxes(floor, r, def));
  const unique = new Map(ups.map((u) => [u.key, u.box]));
  assert.equal(unique.size, 3);
  const along = [...unique.values()].map((b) => +(b.y1 - b.y0).toFixed(4)).sort();
  assert.deepEqual(along, [0.0215, 0.0215, 0.042]);
  for (const b of unique.values()) {
    assert.ok(Math.abs(b.z0 - 0.73) < 1e-9 && Math.abs(b.z1 - 1.77) < 1e-9, `upright ${b.z0}–${b.z1}`);
  }
  const post = [...unique.values()].find((b) => b.y1 - b.y0 > 0.03);
  assert.ok(Math.abs((post.y0 + post.y1) / 2 - 1.772) < 1e-9 && Math.abs(post.x1 - post.x0 - 0.074) < 1e-9);
});

test('the RENZ Animation letter box is 285 × 285 × 400 with its flap and locks a few mm proud', async () => {
  const entry = { name: 'renz', sizeMm: [285, 285, 400], procedural: 'letter-box-renz' };
  const g = buildProceduralFurniture(entry);
  const b = new THREE.Box3().setFromObject(g);
  assert.ok(Math.abs(b.max.x - b.min.x - 0.285) < 1e-6 && Math.abs(b.max.y - b.min.y - 0.285) < 1e-6);
  assert.ok(Math.abs(b.min.y) < 1e-6, `stands on Y = 0 (${b.min.y})`);
  const depth = b.max.z - b.min.z;
  assert.ok(depth > 0.4 && depth < 0.42, `depth ${depth}`); // the locks stand 8 mm out front and back
});
