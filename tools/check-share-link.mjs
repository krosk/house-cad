#!/usr/bin/env node
// What does a share link lose? (docs/share-view.md) Loads a saved project JSON with the
// app's own code, builds the view link (markers on, as LINK does), decodes it back, and
// lists every field that differs, plus the link length with and without markers (QR fits
// about 2 950 chars). Node only: a house file is private, never open it in a browser.
//   node tools/check-share-link.mjs <house.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const { Project } = await import(path.join(src, 'core/model.js'));
const { deserializeInto, serializeProject } = await import(path.join(src, 'io/serialize.js'));
const { encodeViewToHash, decodeViewFromHash, loadView } = await import(path.join(src, 'io/shareView.js'));

const file = process.argv[2];
if (!file) { console.error('usage: check-share-link.mjs <house.json>'); process.exit(1); }
const p = new Project();
deserializeInto(p, JSON.parse(fs.readFileSync(file, 'utf8')));
const base = 'https://krosk.github.io/house-cad/#'.length;
for (const markers of [true, false]) {
  console.log(`link ${markers ? 'with' : 'without'} markers: ${base + (await encodeViewToHash(p, { markers })).length} chars`);
}

const q = new Project();
loadView(q, await decodeViewFromHash(await encodeViewToHash(p, { markers: true })));
const A = serializeProject(p), B = serializeProject(q);
const lost = new Map();
const note = (k, v) => { if (!lost.has(k)) lost.set(k, new Set()); lost.get(k).add(v); };
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.0006; // links carry mm
const show = (v) => (Array.isArray(v) ? `${v.length} items` : (JSON.stringify(v) ?? 'missing').slice(0, 50));
// Ids are renumbered in a link: compare floors, rects and markers by position, and
// references (finish targets, ground/active floor) by what they point at.
const finishKey = (f, x) => {
  const i = (id) => f.rectangles.findIndex((r) => r.id === id);
  return `${i(x.target.rect)}:${x.target.edge || ''}:${x.material}:${x.anchor ? `${i(x.anchor.rect)}${x.anchor.corner}` : ''}:${x.turn ? 1 : 0}`;
};
const floorIndex = (d, id) => d.floors.findIndex((f) => f.id === id);
for (const k of Object.keys(A)) {
  if (k === 'floors') continue;
  if (k === 'groundFloorId' || k === 'activeFloorId') {
    if (floorIndex(A, A[k]) !== floorIndex(B, B[k])) note('project', `${k}: floor ${floorIndex(A, A[k])} → ${floorIndex(B, B[k])}`);
    continue;
  }
  if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) note('project', `${k}: ${show(A[k])} → ${show(B[k])}`);
}
A.floors.forEach((fa, i) => {
  const fb = B.floors[i];
  for (const k of Object.keys(fa)) {
    if (['id', 'rectangles', 'markers'].includes(k)) continue;
    if (k === 'finishes') {
      const a = fa.finishes.map((x) => finishKey(fa, x)).sort().join('|');
      const b = (fb.finishes || []).map((x) => finishKey(fb, x)).sort().join('|');
      if (a !== b) note('floor', `finishes (${fa.name}): differ`);
      continue;
    }
    if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) note('floor', `${k} (${fa.name}): ${show(fa[k])} → ${show(fb[k])}`);
  }
  for (const [list, label] of [['rectangles', 'rect'], ['markers', 'marker']]) {
    fa[list].forEach((a, j) => {
      const b = fb[list][j];
      for (const k of Object.keys(a)) {
        if (k === 'id' || near(a[k], b?.[k]) || JSON.stringify(a[k]) === JSON.stringify(b?.[k])) continue;
        note(label, `${k} (${a.kind || a.type})`);
      }
    });
  }
});
if (!lost.size) console.log('nothing lost');
for (const [k, v] of lost) console.log(`${k}:\n  ${[...v].join('\n  ')}`);
