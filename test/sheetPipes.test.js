// The sheet's pipes are an output layer (owner, 2026-11-03): off by default, on through
// `layers.pipes`, the same for every sheet output. Before, the PNG was a pipes-only sheet
// with the dimensions and fixtures turned off, so it differed from the preview and the SVG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { oneRoomData, load } from './house.js';
import { floorToSvg, sheetPipeServices, SHEET_PIPE_SERVICES } from '../src/io/planSheet.js';

function withWastePipe() {
  const data = oneRoomData();
  data.pipeNodes = [
    { id: 'pn1', x: 0.5, y: 1, z: 0, floorId: 'f1' },
    { id: 'pn2', x: 1.5, y: 1, z: 0, floorId: 'f1' },
  ];
  data.pipes = [{ id: 'p1', a: 'pn1', b: 'pn2', service: 'waste', diameter: 0.1 }];
  return load(data);
}

test('pipes layer: off by default, on through layers.pipes, overridden by pipeServices', () => {
  assert.deepEqual(sheetPipeServices({}), []);
  assert.deepEqual(sheetPipeServices({ layers: { pipes: true } }), SHEET_PIPE_SERVICES);
  assert.deepEqual(sheetPipeServices({ layers: { pipes: true }, pipeServices: ['vmc'] }), ['vmc']);
});

test('a sheet with pipes on keeps its markers and labels, and gains the pipe legend', () => {
  const p = withWastePipe();
  const f = p.floors[0];
  const labels = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])
    .filter((t) => !t.startsWith('Generated'));
  const off = labels(floorToSvg(f, { project: p }));
  const on = labels(floorToSvg(f, { project: p, layers: { pipes: true } }));
  assert.ok(off.includes('Outlet') && off.includes('1.10'), 'the default sheet has the marker legend and heights');
  assert.ok(!off.some((t) => t.startsWith('Waste')), 'no pipes by default');
  // The pipes add to the sheet; every other label stays (the old PNG dropped markers and dims).
  assert.deepEqual(on.filter((t) => !t.startsWith('Waste')), off);
  assert.ok(on.includes('Waste Ø100 mm'), 'the pipe legend with the layer on');
});
