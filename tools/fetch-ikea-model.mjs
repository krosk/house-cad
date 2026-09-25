#!/usr/bin/env node
// REGISTER an IKEA product in the furniture catalog (public/furniture/index.json).
// Models are NOT stored — the app loads them ON THE FLY from the CORS proxy
// (tools/ikea-proxy/). This tool just confirms a model exists and measures it, so the
// catalog carries a friendly name + real dimensions (for the picker + placeholder boxes).
// IKEA's GLBs are authored in METERS at true scale, floor at Y=0 (Y-up), Draco + WebP.
//
// Usage:
//   node tools/fetch-ikea-model.mjs <article-or-url> [<article-or-url> ...]
//   node tools/fetch-ikea-model.mjs 59511278
//   node tools/fetch-ikea-model.mjs https://www.ikea.com/fr/fr/p/...-s59511278/
//   node tools/fetch-ikea-model.mjs 59511278=jattebo-green      # give it a name
//
// Options (anywhere in args):
//   --lang=fr/fr     rotera locale path segment (default fr/fr; try us/en etc.)
//   --force          re-measure / re-register even if already in the catalog
//
// Only the PUBLIC static GLB is used (no auth). The richer rotera *data* endpoint
// (official measurements, planeClassification, product name) needs a browser bearer
// token, so it is NOT used here — dimensions are derived from the GLB's bounding box
// instead (matches IKEA's published spec to ~1%). See docs/furniture.md.

import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Only the manifest lives here (no GLBs — models load on the fly via the proxy).
const OUT_DIR = resolve(ROOT, 'public/furniture');
const MANIFEST = resolve(OUT_DIR, 'index.json');

const args = process.argv.slice(2);
let lang = 'fr/fr';
let force = false;
const targets = [];
for (const a of args) {
  if (a.startsWith('--lang=')) lang = a.slice(7);
  else if (a === '--force') force = true;
  else targets.push(a);
}
if (!targets.length) {
  console.error('usage: node tools/fetch-ikea-model.mjs <article-or-url>[=name] [more...] [--lang=fr/fr] [--force]');
  process.exit(1);
}

// Pull the article id out of a bare number, a product URL (…-sNNNNNNNN/), or an
// applink (…--NNNNNNNN--…). Accepts an optional "=name" suffix for the output file.
function parseTarget(t) {
  let name = null;
  const eq = t.indexOf('=');
  if (eq > -1 && !t.slice(eq + 1).includes('/')) { name = t.slice(eq + 1); t = t.slice(0, eq); }
  let article = null;
  if (/^\d{6,}$/.test(t)) article = t;
  else {
    const m = t.match(/s(\d{6,})/) || t.match(/--(\d{6,})--/) || t.match(/(\d{8})/);
    if (m) article = m[1];
  }
  return { article, name };
}

const modelUrl = (article) =>
  `https://web-api.ikea.com/${lang}/rotera/static/models/${article}-mini.glb`;

// ---- GLB bounding box (no geometry decode needed: glTF requires min/max on the
// POSITION accessor, so we transform each primitive's local bbox corners by its
// node's world matrix). Works even though geometry is Draco-compressed. -----------
function glbBBoxMeters(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = dv.getUint32(8, true);
  let off = 12, g = null;
  while (off < len) {
    const clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true);
    if (ctype === 0x4E4F534A) g = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + clen)));
    off += 8 + clen;
  }
  const mat = (n) => {
    if (n.matrix) return n.matrix.slice();
    const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const [x, y, z, w] = r, x2 = x + x, y2 = y + y, z2 = z + z,
      xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2,
      wx = w * x2, wy = w * y2, wz = w * z2, [sx, sy, sz] = s;
    return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
      (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
      (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, t[0], t[1], t[2], 1];
  };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const xf = (m, p) => { const [x, y, z] = p; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const walk = (ni, parent) => {
    const node = g.nodes[ni], world = mul(parent, mat(node));
    if (node.mesh != null) for (const prim of g.meshes[node.mesh].primitives) {
      const a = g.accessors[prim.attributes.POSITION]; if (!a?.min || !a?.max) continue;
      for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
        const p = xf(world, [cx, cy, cz]); for (let d = 0; d < 3; d++) { if (p[d] < min[d]) min[d] = p[d]; if (p[d] > max[d]) max[d] = p[d]; }
      }
    }
    for (const c of (node.children || [])) walk(c, world);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const n of g.scenes[g.scene || 0].nodes) walk(n, I);
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

mkdirSync(OUT_DIR, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

// This tool REGISTERS furniture in the catalog; it does NOT keep the GLB. Models load
// on the fly in the app via the CORS proxy (tools/ikea-proxy/), so the only artifact is
// the manifest entry (name, article, real dimensions). Bytes are fetched here only
// transiently, to confirm the model exists and to measure it — then discarded.
for (const t of targets) {
  const { article, name } = parseTarget(t);
  if (!article) { console.error(`✗ ${t}: could not find an article id`); continue; }
  const url = modelUrl(article);
  try {
    if (manifest[article] && !force) {
      console.log(`• ${article}: already in catalog (${manifest[article].name || 'unnamed'}) — use --force to re-measure`);
      continue;
    }
    const res = await fetch(url); // server-side (no Origin) → IKEA returns 200 if it exists
    if (!res.ok) { console.error(`✗ ${article}: no 3D model (HTTP ${res.status}) at ${url}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== 'glTF') { console.error(`✗ ${article}: not a GLB (got ${buf.subarray(0, 16).toString('hex')})`); continue; }
    const { size } = glbBBoxMeters(buf);
    const mm = size.map((v) => Math.round(v * 1000));
    console.log(`✓ ${article}: has a model, ${(buf.length / 1024).toFixed(0)} KB, ${mm[0]} × ${mm[1]} × ${mm[2]} mm (W×H×D) — registered`);
    manifest[article] = {
      name: name || manifest[article]?.name || null,
      article,
      sizeMm: mm, // [width, height, depth] — real scale, for placeholder boxes + labels
      source: url,
      registeredAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error(`✗ ${article}: ${e.message}`);
  }
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
const n = Object.keys(manifest).length;
console.log(`\ncatalog: public/furniture/index.json (${n} item${n === 1 ? '' : 's'}) — models load on the fly via the proxy`);
