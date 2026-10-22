import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Project } from '../src/core/model.js';
import { encodeViewToHash, decodeViewFromHash, loadView } from '../src/io/shareView.js';
import { oneRoomData, load } from './house.js';

const zones = (p) => p.floors.flatMap((f) => f.rectangles.map((r) => ({ id: r.id, kind: r.kind, ...r.bounds })));

test('a share link round-trips the zones, finishes and ids', async () => {
  const data = oneRoomData();
  data.floors[0].finishes = [{ target: { rect: 'r1' }, material: 'oak_plank' }];
  const p = load(data);
  const hash = await encodeViewToHash(p, { markers: true, ids: true });
  // The encoder already returns `view=…`: a link is base + '#' + hash (the 10-22 broken link).
  assert.match(hash, /^view=[uz]/);
  assert.doesNotMatch(hash, /view=view=/);
  const view = await decodeViewFromHash(`#${hash}`);
  const q = new Project();
  loadView(q, view);
  assert.deepEqual(zones(q), zones(p));
  assert.deepEqual(q.floors[0].finishes.map((f) => [f.target.rect, f.material]), [['r1', 'oak_plank']]);
  assert.equal(q.floors[0].markers.length, 4);
});

test('a link without a view payload decodes to null', async () => {
  assert.equal(await decodeViewFromHash('#other=1'), null);
});
