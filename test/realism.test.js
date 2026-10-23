import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunPosition, sunDirection } from '../src/ui/realism.js';

// The AR sun (mr.js applyArSun) puts sunDirection in planGroup-local space, where plan
// (x, y) is (x, up, -y) and plan +y is north (docs/realism.md): the sun must come from the
// south at solar noon and from the east in the morning, in plan terms.
const deg = (r) => r * 180 / Math.PI;
const planOf = (d) => ({ x: d.x, y: -d.z, up: d.y }); // world → plan (y north)

test('the sun: Paris solstice heights, from plan south at noon, plan east in the morning', () => {
  // Solar noon at 2.45° E is about 11:50 UTC.
  const june = sunPosition(new Date(Date.UTC(2026, 5, 21, 11, 50)));
  const dec = sunPosition(new Date(Date.UTC(2026, 11, 21, 11, 50)));
  assert.ok(Math.abs(deg(june.elevation) - 64.6) < 0.5, `June ${deg(june.elevation)}`);
  assert.ok(Math.abs(deg(dec.elevation) - 17.8) < 0.5, `December ${deg(dec.elevation)}`);
  const noon = planOf(sunDirection(june));
  assert.ok(noon.y < 0 && Math.abs(noon.x) < 0.05 && noon.up > 0, 'noon sun due plan south');
  const morning = planOf(sunDirection(sunPosition(new Date(Date.UTC(2026, 5, 21, 6, 0)))));
  assert.ok(morning.x > 0.5 && morning.up > 0, 'morning sun in the plan east');
});
