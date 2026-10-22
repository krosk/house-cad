// Re-save a house in solved form, as the app would: load it through the app's own loader and
// solver (deserializeInto → Project._emit → solve), then serialize it back. Run it on an edited
// copy before `quest-storage.mjs write`, so every stored position already matches its dimensions
// and the app's next save changes nothing (docs/headset-data.md "Editing and checking").
//
//   node tools/solve-house.mjs <in.json> <out.json>
//
// Prints how many stored values changed, the largest move, and any conflicting or deleted
// dimension. Writes only <out.json>.
import fs from 'node:fs';
import { Project } from '../src/core/model.js';
import { deserializeInto, serializeProject, validateProjectData } from '../src/io/serialize.js';

const [inp, out] = process.argv.slice(2);
if (!inp || !out) {
  console.error('usage: solve-house.mjs <in.json> <out.json>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(inp, 'utf8'));
const invalid = validateProjectData(data); // returns an error message, never throws
if (invalid) {
  console.error(`not a house: ${invalid}`);
  process.exit(1);
}
const p = new Project();
deserializeInto(p, data);
const solved = serializeProject(p);
const text = JSON.stringify(solved);
fs.writeFileSync(out, text);

// Every stored number that moved by more than the 0.1 mm grid's rounding.
const moved = [];
const walk = (x, y, path) => {
  if (typeof x === 'number' && typeof y === 'number') {
    if (Math.abs(x - y) > 5e-5) moved.push([path, x, y]);
  } else if (x && y && typeof x === 'object' && typeof y === 'object') {
    for (const k of Object.keys(y)) walk(x[k], y[k], `${path}.${k}`);
  }
};
for (const f of solved.floors) {
  const before = data.floors.find((g) => g.id === f.id);
  if (!before) continue;
  for (const list of ['rectangles', 'markers']) {
    for (const item of f[list]) {
      const old = (before[list] || []).find((o) => o.id === item.id);
      if (old) walk(old, item, `${f.name} ${item.id}`);
    }
  }
}
const conflicts = p.floors.flatMap((f) => f.constraints.filter((c) => c.conflict).map((c) => `${f.name} ${c.id}`));
moved.sort((a, b) => Math.abs(b[2] - b[1]) - Math.abs(a[2] - a[1]));
console.log(`${moved.length} stored value(s) moved past rounding${moved.length ? ':' : ''}`);
for (const [path, x, y] of moved.slice(0, 20)) console.log(`  ${path} ${x} → ${y}`);
if (moved.length > 20) console.log(`  … ${moved.length - 20} more`);
console.log('conflicts', JSON.stringify(conflicts), '| deleted dims', JSON.stringify(p.removedDims || []));
console.log(`wrote ${out} (${text.length} chars)`);
