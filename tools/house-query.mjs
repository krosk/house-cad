#!/usr/bin/env node
// Questions about a saved house (a .json export or a headset autosave read with
// tools/quest-storage.mjs), answered through the app's own loader, solver and takeoff
// (docs/headset-data.md). Read-only.
//
//   node tools/house-query.mjs openings <house>         every door/window/sliding/garage zone:
//       solved width, sill/head, product, U value, and the room on each side (OUT = none)
//   node tools/house-query.mjs rooms-with <house> <re>  rooms holding a furniture product whose
//       catalog key matches <re> (e.g. sensea), with their connected room rects and finishes
//   node tools/house-query.mjs takeoff <house> <id>     per wall face and floor region of one
//       material: net m², pieces; then the house total (packs rounded once)
//   node tools/house-query.mjs diff <before> <after>    conflicts, deleted dimensions, and every
//       zone / marker / conduit node whose solved position, band or U value changed
//   node tools/house-query.mjs conflicts <house>        each conflicting loop block: its dimensions
//       and the suspects (one of them alone wrong), stored → the value the others imply
import fs from 'node:fs';
import { Project } from '../src/core/model.js';
import { deserializeInto, validateProjectData } from '../src/io/serialize.js';
import { connectedRoomComponents } from '../src/core/geometry2d.js';
import { materialTakeoff } from '../src/core/flooring.js';
import { diagnoseConflicts, isCertain } from '../src/core/conflicts.js';

const load = (file) => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateProjectData(data);
  const p = new Project();
  deserializeInto(p, data);
  return p;
};
const mm = (m) => Math.round(m * 1000);
const box = (b) => `x ${b.x0.toFixed(2)}…${b.x1.toFixed(2)} y ${b.y0.toFixed(2)}…${b.y1.toFixed(2)}`;
const inside = (b, x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
const [cmd, a, b] = process.argv.slice(2);

if (cmd === 'conflicts' && a) {
  const p = load(a);
  const end = (ep) => (ep.rect === '__origin__' ? 'origin' : `${ep.rect}.${ep.edge}`);
  for (const f of p.floors) {
    const found = diagnoseConflicts(f);
    console.log(`\n== ${f.name}: ${found.length ? `${found.length} conflicting block(s)` : 'no conflict'}`);
    for (const g of found) {
      console.log(`${g.axis} block, ${g.ids.size} dims, off by ${mm(g.worst)} mm: ${g.suspects.length
        ? `${g.suspects.length} suspect(s)` : 'no single suspect (2+ dims wrong)'}`);
      const byId = new Map(f.constraints.map((c) => [c.id, c]));
      for (const s of g.suspects) {
        const c = byId.get(s.id);
        console.log(`  ${s.id.padEnd(6)} ${end(c.a)} → ${end(c.b)}: ${mm(Math.abs(s.value))} mm, others say ${mm(Math.abs(s.implied))} (${s.delta > 0 ? '+' : ''}${mm(s.delta)})`);
      }
      // 0 mm dimensions are beyond doubt: never suspects, not listed (owner, 2026-10-04).
      const others = [...g.ids].filter((id) => !g.suspects.some((s) => s.id === id) && !isCertain(byId.get(id)));
      if (others.length) console.log(`  consistent elsewhere: ${others.join(' ')}`);
    }
  }
} else if (cmd === 'openings' && a) {
  const p = load(a);
  for (const f of p.floors) {
    console.log(`\n== ${f.name}`);
    const rooms = f.rectangles.filter((r) => r.kind === 'room');
    const product = (id) => f.finishes.find((x) => x.target.rect === id && !x.target.edge)?.material || '';
    for (const r of f.rectangles.filter((z) => ['window', 'sliding', 'door', 'garage'].includes(z.kind))) {
      const bb = r.bounds, alongX = bb.x1 - bb.x0 >= bb.y1 - bb.y0;
      const width = alongX ? bb.x1 - bb.x0 : bb.y1 - bb.y0;
      const mid = alongX ? (bb.x0 + bb.x1) / 2 : (bb.y0 + bb.y1) / 2;
      const probes = alongX ? [[mid, bb.y0 - 0.1], [mid, bb.y1 + 0.1]] : [[bb.x0 - 0.1, mid], [bb.x1 + 0.1, mid]];
      const sides = probes.map(([x, y]) => rooms.filter((q) => inside(q.bounds, x, y)).map((q) => q.id).join('+') || 'OUT');
      const head = r.head ?? 2.1, sill = r.sill ?? 0;
      console.log(`${r.id.padEnd(5)} ${r.kind.padEnd(7)} W ${mm(width)} × H ${mm(head - sill)} (sill ${sill} head ${head})`
        + ` ${sides.join(' | ')} ${product(r.id)}${r.uValue ? ` U ${r.uValue}` : ''}`);
    }
  }
} else if (cmd === 'rooms-with' && a && b) {
  const p = load(a), re = new RegExp(b, 'i');
  for (const f of p.floors) {
    const comps = connectedRoomComponents(f.rectangles);
    for (const s of f.rectangles.filter((r) => r.kind === 'furniture' && re.test(r.article || ''))) {
      const sb = s.bounds, cx = (sb.x0 + sb.x1) / 2, cy = (sb.y0 + sb.y1) / 2;
      const room = f.rectangles.find((r) => r.kind === 'room' && inside(r.bounds, cx, cy));
      const comp = comps.find((c) => c.ids.has(room?.id));
      console.log(`\n${f.name}: ${s.id} ${s.article} in ${room?.id ?? '?'}${comp ? ` (${comp.area.toFixed(1)} m² net)` : ''}`);
      for (const r of comp?.rectangles || []) console.log(`  room ${r.id} ${box(r.bounds)}`);
      const touches = (z) => comp?.rectangles.some((r) => z.bounds.x0 < r.bounds.x1 && z.bounds.x1 > r.bounds.x0
        && z.bounds.y0 < r.bounds.y1 && z.bounds.y1 > r.bounds.y0);
      for (const z of f.rectangles.filter((z) => z.kind !== 'room' && touches(z))) {
        console.log(`  · ${z.id} ${z.kind}${z.article ? ` ${z.article}` : ''} ${box(z.bounds)}`);
      }
      for (const x of f.finishes.filter((x) => comp?.ids.has(x.target.rect))) {
        console.log(`  finish ${x.target.rect} ${x.target.edge || 'floor'} ${x.material}`);
      }
    }
  }
} else if (cmd === 'takeoff' && a && b) {
  const p = load(a), t = materialTakeoff(p);
  const name = (id) => p.floors.find((f) => f.id === id)?.name;
  for (const r of t.regions.filter((r) => r.material === b)) {
    console.log(`${name(r.floorId)} floor ${[...r.rectIds].join('+')} ${r.count.area.toFixed(2)} m² ${r.count.pieces ?? ''} pcs`);
  }
  for (const w of t.walls.filter((w) => w.material === b)) {
    console.log(`${name(w.floorId)} wall ${w.rectId} ${w.edge.padEnd(6)} ${w.count.area.toFixed(2)} m² ${w.count.pieces ?? ''} pcs`);
  }
  console.log('house total', JSON.stringify(t.totals.get(b) || null));
} else if (cmd === 'diff' && a && b) {
  const p = load(a), q = load(b);
  const conflicts = (x) => x.floors.flatMap((f) => f.constraints.filter((c) => c.conflict).map((c) => c.id));
  console.log('conflicts before', conflicts(p), 'after', conflicts(q), '| deleted dims', JSON.stringify(q.removedDims || []));
  const geo = (x) => {
    const m = new Map();
    for (const f of x.floors) {
      for (const r of f.rectangles) m.set(`${f.name} ${r.id}`, JSON.stringify([r.kind, r.bounds, r.sill, r.head, r.uValue, r.article]));
      for (const k of f.markers) m.set(`${f.name} ${k.id}`, JSON.stringify([k.type, k.x, k.y, k.z]));
    }
    for (const n of x.conduitNodes || []) m.set(`node ${n.id}`, JSON.stringify([n.x, n.y, n.z]));
    return m;
  };
  const gp = geo(p), gq = geo(q);
  for (const [k, v] of gq) if (gp.get(k) !== v) console.log(gp.has(k) ? 'changed' : 'added  ', k, gp.get(k) ?? '', '→', v);
  for (const k of gp.keys()) if (!gq.has(k)) console.log('removed', k);
  const fin = (x) => new Set(x.floors.flatMap((f) => f.finishes.map((y) => `${f.name} ${y.target.rect}:${y.target.edge || ''}=${y.material}`)));
  const fp = fin(p), fq = fin(q);
  for (const k of fq) if (!fp.has(k)) console.log('finish +', k);
  for (const k of fp) if (!fq.has(k)) console.log('finish −', k);
} else {
  console.error('usage: house-query.mjs openings <house> | rooms-with <house> <re> | takeoff <house> <materialId> | diff <before> <after>');
  process.exit(1);
}
