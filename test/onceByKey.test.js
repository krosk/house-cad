// The AR furniture's model cache (src/ui/onceByKey.js): concurrent callers share one load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onceByKey } from '../src/ui/onceByKey.js';

test('concurrent calls for one key share one load, even when the load awaits first', async () => {
  let loads = 0;
  const get = onceByKey(async (k) => { await new Promise((r) => setTimeout(r, 5)); loads++; return { k }; });
  const [a, b, c] = await Promise.all([get('x'), get('x'), get('x')]);
  assert.equal(loads, 1);
  assert.ok(a === b && b === c);
  assert.equal(await get('x'), a); // kept after it finished
  await get('y');
  assert.equal(loads, 2);
});

test('a failed load is forgotten, so the next call retries', async () => {
  let n = 0;
  const get = onceByKey(async () => { if (n++ === 0) throw new Error('offline'); return 'ok'; });
  await assert.rejects(get('x'));
  assert.equal(await get('x'), 'ok');
});
