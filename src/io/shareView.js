// Share a house as a compact, VIEW-ONLY link (the geometry travels in the URL
// fragment, so nothing is stored server-side and a static Pages host never sees it).
//
// A saved project (serialize.js) is the full PARAMETRIC definition — rectangles +
// constraints + markers + electrical + conduit — and re-solves on load. A shared VIEW
// needs none of that: the 3D pipeline (computeFootprint → extrudeFootprint) runs purely
// off each rectangle's SOLVED x/y/w/h + kind + storey height, and the solver is a no-op
// when `constraints:[]` (each edge's W_STAY just pins it to its current value). So this
// drops constraints entirely — ~78% of a real file — and ships solved geometry rounded
// to the millimetre. On a real 3-storey house that took the payload from ~16 KB gzip to
// under 1 KB (massing) / ~1.7 KB (+markers), small enough for a QR code.
//
// TRADE-OFF: a view is LOSSY and one-way. Without constraints the recipient can't edit
// it parametrically (moving a wall won't carry its relationships). This is a separate
// export path from Save — "here is my house in 3D", not "keep designing it".

import { deserializeInto, FILE_VERSION } from './serialize.js';

export const VIEW_SCHEMA = 1;
const VIEW_APP = 'house-cad-view';
const HASH_KEY = 'view';

// Round to millimetres (metres internal) — the finest scale the model means. Integers
// pass through untouched so ids/flags stay exact.
const mm = (v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(3) : v);

// Aperture band + orientation fields only exist on door/garage/window/half-wall/heater/sliding; a
// plain zone carries none, so they are emitted only when present.
const APERTURE_KEYS = ['sill', 'head', 'hinge', 'swing', 'foot', 'top'];

// Project → compact view object. `markers` opts them in (they roughly double the size
// and cost the QR-code comfort margin), so the default is massing only.
export function serializeView(project, { markers = false } = {}) {
  return {
    app: VIEW_APP,
    v: VIEW_SCHEMA,
    // Elevation is DERIVED from storey heights + the ground floor, so it is never stored
    // — only the ground/active floor indices (array order is the stacking order).
    ground: Math.max(0, project.floors.findIndex((f) => f.id === project.groundFloorId)),
    active: Math.max(0, project.floors.findIndex((f) => f.id === project.activeFloorId)),
    floors: project.floors.map((f) => {
      const o = { name: f.name, height: mm(f.height) };
      o.rects = f.rectangles.map((r) => {
        const rc = { x: mm(r.x), y: mm(r.y), w: mm(r.w), h: mm(r.h) };
        if (r.op && r.op !== 'add') rc.op = r.op;      // 'add' is the default
        if (r.kind && r.kind !== 'room') rc.kind = r.kind; // 'room' is the default
        for (const k of APERTURE_KEYS) if (r[k] != null) rc[k] = mm(r[k]);
        return rc;
      });
      if (markers) {
        o.markers = f.markers.map((m) => {
          const mk = { t: m.type, x: mm(m.x), y: mm(m.y), z: mm(m.z) };
          if (m.zDatum) mk.d = 1; // a defined (grab-locking / dimensioned) height
          return mk;
        });
      }
      return o;
    }),
  };
}

// Compact view object → full deserialize schema (with fresh ids, constraints:[]), then
// load into the project. Throws on a non-view object.
export function loadView(project, view) {
  if (!view || typeof view !== 'object' || view.app !== VIEW_APP) {
    throw new Error('Not a house-cad view link.');
  }
  let rid = 0, mid = 0; // ids only need to be present + unique (nothing references them)
  const floors = (view.floors || []).map((f, i) => ({
    id: `f${i + 1}`,
    name: f.name || `Floor ${i + 1}`,
    height: typeof f.height === 'number' ? f.height : 2.8,
    rectangles: (f.rects || []).map((rc) => ({
      id: `r${++rid}`, x: rc.x, y: rc.y, w: rc.w, h: rc.h,
      op: rc.op || 'add', kind: rc.kind || 'room',
      sill: rc.sill, head: rc.head, hinge: rc.hinge, swing: rc.swing, foot: rc.foot, top: rc.top,
    })),
    constraints: [], // a view carries no parametric relationships (solver is a no-op)
    markers: (f.markers || []).map((m) => ({
      id: `m${++mid}`, type: m.t || 'outlet', x: m.x, y: m.y, z: m.z,
      ...(m.d ? { zDatum: 'floor' } : {}),
    })),
    electricalLinks: [],
    furniture: [],
  }));
  if (!floors.length) throw new Error('View link has no floors.');
  const gi = Number.isInteger(view.ground) && view.ground < floors.length ? view.ground : 0;
  const ai = Number.isInteger(view.active) && view.active < floors.length ? view.active : gi;
  deserializeInto(project, {
    app: 'house-cad', version: FILE_VERSION,
    groundFloorId: floors[gi].id, activeFloorId: floors[ai].id,
    floors, conduitNodes: [], conduitSegments: [], wires: [],
  });
}

// ---- URL fragment codec: <codec><base64url>, codec 'z'=deflate-raw, 'u'=identity ----

function bytesToB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) { // chunk to keep the arg list small
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

// Project → `view=<codec><b64url>` fragment payload (no leading '#'). Async: compression
// is via the streams API; falls back to identity where it (or deflate-raw) is missing.
export async function encodeViewToHash(project, opts) {
  const bytes = new TextEncoder().encode(JSON.stringify(serializeView(project, opts)));
  let codec = 'u', payload = bytes;
  if (canCompress()) {
    try { payload = await pipe(bytes, new CompressionStream('deflate-raw')); codec = 'z'; }
    catch { codec = 'u'; payload = bytes; }
  }
  return `${HASH_KEY}=${codec}${bytesToB64url(payload)}`;
}

// A full location.hash string (or `view=...`) → the compact view object, or null when
// there is no view payload. Throws only on a corrupt payload.
export async function decodeViewFromHash(hash) {
  const m = new RegExp(`(?:^#?|&)${HASH_KEY}=([A-Za-z0-9\\-_]+)`).exec(hash || '');
  if (!m) return null;
  const raw = m[1];
  const codec = raw[0];
  const bytes = b64urlToBytes(raw.slice(1));
  let jsonBytes = bytes;
  if (codec === 'z') {
    if (!canCompress()) throw new Error('This browser cannot decode a compressed view link.');
    jsonBytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (codec !== 'u') {
    throw new Error('Unknown view link encoding.');
  }
  return JSON.parse(new TextDecoder().decode(jsonBytes));
}

// Full shareable URL for the current project (current page origin+path + fragment).
export async function buildShareUrl(project, opts) {
  const payload = await encodeViewToHash(project, opts);
  const base = `${location.origin}${location.pathname}`;
  return `${base}#${payload}`;
}
