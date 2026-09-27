// Device products (docs/materials.md "Switches"): a catalog material with
// `surface: 'switch'` set on a switch marker (`marker.product`) replaces that marker's
// standard 8 cm faceplate in 3D. Only the visible part is modelled (owner, 2026-09-27):
// the plate and the rocker, never the mechanism inside the wall box.
//
// Returns a Group (a shared-geometry clone) in the faceplate convention (view3d
// `_wallMarkerFixture`): metres, back on the wall at z = 0, room-facing front toward +Z,
// centred on the marker.

import * as THREE from 'three';

// Contours as radial functions: for a direction (c, s) from the centre, the distance to
// the outline, found by bisection on an inside test (rings of one loft share directions,
// so any two outlines blend into each other).
function radial(inside, max) {
  return (c, s) => {
    let lo = 0, hi = max;
    for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (inside(c * m, s * m)) lo = m; else hi = m; }
    return lo;
  };
}
// A rounded square, half-size a, corner radius r.
const roundedSquare = (a, r) => radial((x, y) => {
  const qx = Math.abs(x) - (a - r), qy = Math.abs(y) - (a - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= r;
}, a * 1.5);
// A vertical stadium w × h: two half-circles (radius w/2) joined by straight sides.
const stadium = (w, h) => radial((x, y) => {
  const L = Math.max(0, h / 2 - w / 2);
  return Math.hypot(x, Math.max(0, Math.abs(y) - L)) <= w / 2;
}, h);

const N = 128; // directions per ring
const DIRS = Array.from({ length: N }, (_, i) => [Math.cos((i / N) * Math.PI * 2), Math.sin((i / N) * Math.PI * 2)]);
// A ring: the blend of two outlines (t = 0 → a, 1 → b), at height z(x, y).
function ring(a, b, t, z) {
  return DIRS.map(([c, s]) => {
    const d = a(c, s) * (1 - t) + b(c, s) * t, x = c * d, y = s * d;
    return [x, y, typeof z === 'function' ? z(x, y) : z];
  });
}
// Stitch rings (outer to inner) into one smooth indexed surface; `cap` closes the last
// ring with a fan to its centre at height cap(0, 0).
function loft(rings, cap = null) {
  const pos = [], idx = [];
  for (const r of rings) for (const p of r) pos.push(...p);
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < N; i++) {
      const a = k * N + i, b = k * N + (i + 1) % N, c = a + N, d = b + N;
      idx.push(a, b, d, a, d, c);
    }
  }
  if (cap) {
    const centre = pos.length / 3, last = (rings.length - 1) * N;
    pos.push(0, 0, cap(0, 0));
    for (let i = 0; i < N; i++) idx.push(last + i, last + (i + 1) % N, centre);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const matCache = new Map();
function materialsFor(def, lambert) {
  const key = `${JSON.stringify(def)}|${lambert}`;
  if (matCache.has(key)) return matCache.get(key);
  const M = lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const std = (roughness) => (lambert ? {} : { roughness, metalness: 0 });
  const m = {
    plate: new M({ color: def.color ?? 0xf2f2f0, ...std(def.roughness ?? 0.35) }),
    rocker: new M({ color: def.accent ?? def.color ?? 0xf2f2f0, ...std((def.roughness ?? 0.35) * 0.8) }),
    gap: new M({ color: 0x9a9a98, ...std(0.6) }),
    split: new M({ color: 0x2a2a2a, ...std(0.8) }),
  };
  matCache.set(key, m);
  return m;
}

// Ovalis-style rocker switch, profile read on Leroy Merlin's side photo (docs/materials.md):
//   - the plate is a smooth pyramid: rim `rimDepthMm` at the square edge, rising (faster
//     toward the middle) to `collarDepthMm` at a stadium-shaped collar `collarMm`;
//   - the collar band keeps rising gently to `openingDepthMm` at the rocker opening;
//   - the rocker is a stadium `rockerMm` (two half-circles joined by straight sides) with
//     two flat faces folded at `rockerFoldMm` above its centre: the upper one parallel to
//     the wall at `rockerTopMm`, the lower one slanting out to `rockerBottomMm`;
//   - `rockers: 2` (double switch) splits that rocker into two halves (`splitMm` gap).
function rockerSwitch(def, m) {
  const mm = (v) => v / 1000;
  const g = new THREE.Group();
  const P = mm(def.plateMm ?? 87), pr = mm(def.plateCornerMm ?? 10);
  const rim = mm(def.rimDepthMm ?? 4.4), collarZ = mm(def.collarDepthMm ?? 8.1);
  const openZ = mm(def.openingDepthMm ?? 9.7);
  const [cw, ch] = (def.collarMm || [54, 64]).map(mm);
  const [rw, rh] = (def.rockerMm || [43, 52]).map(mm);
  const gapW = mm(1);
  const outer = roundedSquare(P / 2, pr), edge = roundedSquare(P / 2 - mm(0.8), Math.max(0.001, pr - mm(0.8)));
  const collar = stadium(cw, ch), opening = stadium(rw + 2 * gapW, rh + 2 * gapW);
  const rings = [ring(outer, outer, 0, 0), ring(outer, outer, 0, rim - mm(0.6)), ring(edge, edge, 0, rim)];
  for (let i = 1; i <= 10; i++) { // pyramid: the rise steepens toward the collar
    const t = i / 10;
    rings.push(ring(edge, collar, t, rim + (collarZ - rim) * (0.6 * t + 0.4 * t * t)));
  }
  for (let i = 1; i <= 4; i++) { // collar band, easing out at the opening
    const t = i / 4;
    rings.push(ring(collar, opening, t, collarZ + (openZ - collarZ) * (1 - (1 - t) ** 2)));
  }
  rings.push(ring(opening, opening, 0, openZ - mm(3))); // the opening's wall, into the shadow
  g.add(new THREE.Mesh(loft(rings, () => openZ - mm(3)), m.plate));
  // The rocker: a stadium prism with two flat faces meeting at a crisp fold: the upper
  // one parallel to the wall, the lower one slanting out to the bottom edge (owner).
  const top = mm(def.rockerTopMm ?? 11), bottom = mm(def.rockerBottomMm ?? 13.8);
  const fold = mm(def.rockerFoldMm ?? 0); // the fold's height from the rocker's centre
  const face = (x, y) => (y >= fold ? top : top + ((fold - y) / (fold + rh / 2)) * (bottom - top));
  const inW = rw - mm(2.4), inH = rh - mm(2.4);
  const rk = stadium(rw, rh), rkIn = stadium(inW, inH);
  g.add(new THREE.Mesh(loft([ring(rk, rk, 0, openZ - mm(2.5)),
    ring(rk, rk, 0, (x, y) => face(x, y) - mm(0.9)), ring(rkIn, rkIn, 0, face)]), m.rocker));
  for (const half of [1, -1]) { // each face flat, so its own mesh (no normal smoothing across the fold)
    const f = new THREE.ShapeGeometry(halfStadium(inW, inH, fold, half), 16);
    const pos = f.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, face(pos.getX(i), pos.getY(i)));
    f.computeVertexNormals();
    g.add(new THREE.Mesh(f, m.rocker));
  }
  // A double switch (`rockers: 2`): the same rocker split into two halves by a thin
  // vertical gap, drawn as a dark strip just on the faces (following the fold).
  if ((def.rockers ?? 1) > 1) {
    const half = mm(def.splitMm ?? 0.5) / 2, ys = [-inH / 2, Math.min(fold, inH / 2), inH / 2];
    const pos = [];
    for (let i = 0; i + 1 < ys.length; i++) {
      const [y0, y1] = [ys[i], ys[i + 1]], z0 = face(0, y0) + 0.00005, z1 = face(0, y1) + 0.00005;
      pos.push(-half, y0, z0, half, y0, z0, half, y1, z1, -half, y0, z0, half, y1, z1, -half, y1, z1);
    }
    const split = new THREE.BufferGeometry();
    split.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    split.computeVertexNormals();
    g.add(new THREE.Mesh(split, m.split));
  }
  // The shadow in the gap: the opening's floor.
  const floor = new THREE.ShapeGeometry(stadiumShape(rw + 2 * gapW, rh + 2 * gapW), 12);
  floor.translate(0, 0, openZ - mm(2.9));
  g.add(new THREE.Mesh(floor, m.gap));
  return g;
}

// The part of a stadium above (half = 1) or below (half = -1) the line y = cut.
function halfStadium(w, h, cut, half) {
  const s = new THREE.Shape(), R = w / 2, L = Math.max(0, h / 2 - R);
  const c = Math.max(-L, Math.min(L, cut)); // the fold lies on the straight sides
  if (half > 0) {
    s.moveTo(R, c); s.lineTo(R, L); s.absarc(0, L, R, 0, Math.PI, false); s.lineTo(-R, c);
  } else {
    s.moveTo(-R, c); s.lineTo(-R, -L); s.absarc(0, -L, R, Math.PI, Math.PI * 2, false); s.lineTo(R, c);
  }
  return s;
}

// A stadium as a Shape (for flat fills).
function stadiumShape(w, h) {
  const s = new THREE.Shape(), R = w / 2, L = Math.max(0, h / 2 - R);
  s.moveTo(R, -L); s.lineTo(R, L); s.absarc(0, L, R, 0, Math.PI, false);
  s.lineTo(-R, -L); s.absarc(0, -L, R, Math.PI, Math.PI * 2, false);
  return s;
}

const DESIGNS = { 'rocker': rockerSwitch };

// Built once per catalog entry and material kind; callers get a clone that shares the
// geometry and materials, so they must never dispose them (a baked copy clones first).
const built = new Map();
export function buildDeviceProduct(def, { lambert = false } = {}) {
  const key = `${JSON.stringify(def)}|${lambert}`;
  if (!built.has(key)) {
    const g = (DESIGNS[def.design] || rockerSwitch)(def, materialsFor(def, lambert));
    g.name = def.id || 'device-product';
    built.set(key, g);
  }
  return built.get(key).clone();
}
