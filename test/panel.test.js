import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelFill, slotCentre } from '../src/core/panel.js';
import { materialById, markerProductDraws } from '../src/core/materials.js';
import { serializeProject } from '../src/io/serialize.js';
import { buildDeviceProduct } from '../src/ui/deviceProducts.js';
import { oneRoomData, load } from './house.js';

// A panel on the north wall, and three breakers: row 1 slot 3, row 2 slot 3, and one
// overlapping row 1's RCD (slots 1–2), which is not drawn.
function panelHouse() {
  const data = oneRoomData();
  data.floors[0].markers.push(
    { id: 'm5', type: 'panel', x: 1, y: 3, z: 1.4, product: 'panel_drivia_3x13' },
    { id: 'm6', type: 'breaker', x: 0, y: 2.5, z: 0.3, rating: 20, panel: 'm5', row: 1, slot: 3 },
    { id: 'm7', type: 'breaker', x: 0, y: 2.6, z: 0.3, rating: 16, panel: 'm5', row: 2, slot: 3 },
    { id: 'm8', type: 'breaker', x: 0, y: 2.7, z: 0.3, panel: 'm5', row: 1, slot: 2 },
  );
  return load(data);
}

test('the panel fill: each row starts with its RCD, breakers sit in their slots', () => {
  const p = panelHouse();
  const panel = p.floors[0].markers.find((m) => m.id === 'm5');
  const def = materialById(p, 'panel_drivia_3x13');
  const { rows, misplaced } = panelFill(p, panel, def);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].modules.map((m) => [m.kind, m.slot, m.width, m.breakerId]),
    [['rcd', 1, 2, undefined], ['breaker', 3, 1, 'm6']]);
  assert.deepEqual(rows[2].modules.map((m) => m.kind), ['rcd']);
  assert.equal(rows[2].rcd.type, 'A');
  assert.deepEqual(misplaced, ['m8']);
  // markerProductDraws carries the same fill to View 3D and AR.
  const draw = markerProductDraws(p, p.floors[0].markers).get('m5');
  assert.equal(draw.def.id, 'panel_drivia_3x13');
  assert.deepEqual(draw.fill.rows, rows);
});

test('slots: rows 125 mm apart about the centre, 13 modules of 17.5 mm', () => {
  const def = materialById(null, 'panel_drivia_3x13');
  const a = slotCentre(def, 1, 1), b = slotCentre(def, 3, 13);
  assert.ok(Math.abs(a.y - 0.125) < 1e-9 && Math.abs(b.y + 0.125) < 1e-9);
  assert.ok(Math.abs(a.x + 13 * 0.0175 / 2 - 0.0175 / 2) < 1e-9);
  assert.ok(Math.abs(b.x - (13 * 0.0175 / 2 - 0.0175 / 2)) < 1e-9);
});

test('a breaker keeps its panel slot through a save', () => {
  const back = load(serializeProject(panelHouse()));
  const b = back.floors[0].markers.find((m) => m.id === 'm6');
  assert.deepEqual([b.panel, b.row, b.slot, b.rating], ['m5', 1, 3, 20]);
});

test('the Drivia builds at its catalogue size, a blank on every free module', () => {
  const p = panelHouse();
  const draw = markerProductDraws(p, p.floors[0].markers).get('m5');
  const g = buildDeviceProduct(draw.def, { fill: draw.fill });
  g.updateMatrixWorld(true);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, back = Infinity, blanks = 0;
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    minX = Math.min(minX, bb.min.x); maxX = Math.max(maxX, bb.max.x);
    minY = Math.min(minY, bb.min.y); maxY = Math.max(maxY, bb.max.y);
    back = Math.min(back, bb.min.z);
    if (Math.abs(bb.max.z - bb.min.z - 0.001) < 1e-6) blanks++;
  });
  assert.ok(Math.abs(maxX - minX - 0.25) < 1e-6 && Math.abs(maxY - minY - 0.5) < 1e-6);
  assert.ok(Math.abs(back) < 1e-6, `back on the wall (${back})`);
  // 39 modules − 3 RCDs × 2 − 2 placed breakers.
  assert.equal(blanks, 39 - 6 - 2);
});
