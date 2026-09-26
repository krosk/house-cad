// Window products (docs/materials.md "Windows"): a catalog material with
// `surface: 'window'` set on a WINDOW zone builds that product's frame, sashes, glass
// and handle in 3D, sized by the opening (made-to-measure windows take the zone's
// width, sill and head). The zone's hinge picks the leaves: left/right = one leaf
// hinged on that side, both = two leaves. Shapes are inferred from product photos and
// the published profile depths: no manufacturer 3D model exists.
//
// `placement` comes from windowProductPlacements (architectural3d.js). Returns plain
// Meshes whose geometry already carries the plan → world transform, like
// buildDoorProduct, so a caller only lifts them by the floor elevation.

import * as THREE from 'three';

// Profile faces (m), measured on Lapeyre's straight-on Héméra photos, scaled by the
// handle (about 160 mm): see docs/materials.md. The sash hides behind the frame's
// exterior lip ("ouvrant caché"), so outside shows one wide face, inside two steps.
const PROFILES = {
  hemera: {
    frameIn: 0.019,   // frame face visible from inside
    frameOut: 0.076,  // exterior lip, covering the sash
    sash: 0.062,      // sash face (with glazing bead) from inside
    meet: 0.040,      // each sash's meeting stile on a two-leaf window (80 mm together)
    lipDepth: 0.02,   // exterior lip thickness
    glass: 0.028,     // 4/20/4 insulated glazing
  },
};

// Materials are cached per entry and never disposed (callers dispose geometry only).
const matCache = new Map();
function materialsFor(def, lambert) {
  const key = `${JSON.stringify(def)}|${lambert}`;
  if (matCache.has(key)) return matCache.get(key);
  const M = lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const pvc = lambert ? {} : { roughness: 0.35, metalness: 0 };
  const m = {
    pvc: new M({ color: def.color, ...pvc }),
    glass: new M({
      color: def.accent, transparent: true, opacity: 0.22, depthWrite: false,
      ...(lambert ? {} : { roughness: 0.05, metalness: 0 }),
    }),
    gasket: new M({ color: 0x222428, ...(lambert ? {} : { roughness: 0.6, metalness: 0 }) }),
    hinge: new M({ color: 0xc9ccd1, ...(lambert ? {} : { roughness: 0.3, metalness: 0.5 }) }),
  };
  matCache.set(key, m);
  return m;
}

// Build the window for one placement. `lambert` selects the cheap AR materials.
export function buildWindowProduct(p, { lambert = false } = {}) {
  const m = materialsFor(p.def, lambert);
  const P = PROFILES[p.def.design] || PROFILES.hemera;
  const frameD = p.def.frameDepth ?? 0.08, sashD = p.def.sashDepth ?? 0.084;
  // Local frame: X along the wall (−w/2..w/2), Y up from the sill, Z across the wall
  // with the frame centred on the zone and +Z toward the room (flipped below).
  const w = p.width, h = p.head - p.sill;
  if (w < 0.2 || h < 0.2) return [];
  const zOut = -frameD / 2; // exterior face of the frame
  const parts = [];
  const box = (sx, sy, sz, x, y, z, material) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    parts.push([g, material]);
  };
  // A rectangular ring (outer w×h, face width per side [l, r, b, t]) at depth z0..z1.
  const ring = (x0, x1, y0, y1, [l, r, b, t], z0, z1, material) => {
    const d = z1 - z0, zc = (z0 + z1) / 2;
    box(l, y1 - y0, d, x0 + l / 2, (y0 + y1) / 2, zc, material);
    box(r, y1 - y0, d, x1 - r / 2, (y0 + y1) / 2, zc, material);
    box(x1 - x0 - l - r, b, d, (x0 + x1) / 2, y0 + b / 2, zc, material);
    box(x1 - x0 - l - r, t, d, (x0 + x1) / 2, y1 - t / 2, zc, material);
  };
  const F = P.frameIn;
  // Frame: the full-depth ring plus the exterior lip that hides the sash.
  ring(-w / 2, w / 2, 0, h, [F, F, F, F], zOut, zOut + frameD, m.pvc);
  const lip = Math.min(P.frameOut, w / 4, h / 4);
  ring(-w / 2, w / 2, 0, h, [lip, lip, lip, lip], zOut, zOut + P.lipDepth, m.pvc);
  // Sashes: inside the frame, from behind the lip to past the frame's inner face.
  const leaves = p.leaves === 2 ? 2 : 1;
  const sz0 = zOut + P.lipDepth, sz1 = zOut + P.lipDepth + sashD * 0.85;
  const inner = { x0: -w / 2 + F, x1: w / 2 - F, y0: F, y1: h - F };
  const leafW = (inner.x1 - inner.x0) / leaves;
  const glassZ = (sz0 + sz1) / 2;
  const handleY = h / 2;
  for (let k = 0; k < leaves; k++) {
    const x0 = inner.x0 + k * leafW, x1 = x0 + leafW;
    const s = Math.min(P.sash, leafW / 4, h / 4);
    // Meeting stiles are narrower (two of them make the thin centre).
    const l = leaves === 2 && k === 1 ? P.meet : s, r = leaves === 2 && k === 0 ? P.meet : s;
    ring(x0, x1, inner.y0, inner.y1, [l, r, s, s], sz0, sz1, m.pvc);
    const gx0 = x0 + l, gx1 = x1 - r, gy0 = inner.y0 + s, gy1 = inner.y1 - s;
    box(gx1 - gx0, gy1 - gy0, P.glass, (gx0 + gx1) / 2, (gy0 + gy1) / 2, glassZ, m.glass);
    // The black glazing gasket seen from outside, just inside the glass edge.
    const gk = 0.004;
    ring(gx0, gx1, gy0, gy1, [gk, gk, gk, gk], glassZ - P.glass / 2 - 0.004, glassZ - P.glass / 2, m.gasket);
  }
  // Handle on the room face: on the meeting stiles (two leaves) or the lock stile,
  // opposite the hinge (one leaf). White rose + lever pointing down (closed).
  const hingeSign = p.hingeEnd === 'hi' ? 1 : -1;
  const hx = leaves === 2 ? 0 : -hingeSign * (inner.x1 - P.sash / 2);
  box(0.03, 0.075, 0.012, hx, handleY, sz1 + 0.006, m.pvc);
  box(0.014, 0.014, 0.035, hx, handleY + 0.012, sz1 + 0.025, m.pvc);
  box(0.018, 0.12, 0.016, hx, handleY - 0.045, sz1 + 0.045, m.pvc);
  // Hinges on the room face at the outer stiles (both sides on a two-leaf window).
  const hingeXs = leaves === 2 ? [-1, 1] : [hingeSign];
  const hingeYs = h > 1 ? [0.1, h / 2, h - 0.1] : [0.08, h - 0.08];
  for (const side of hingeXs) {
    for (const y of hingeYs) box(0.012, 0.07, 0.014, side * (inner.x1 - 0.002), y, zOut + frameD + 0.007, m.hinge);
  }
  // Drain caps on the exterior of the bottom lip, two per leaf.
  for (let k = 0; k < leaves; k++) {
    for (const f of [0.2, 0.8]) box(0.03, 0.012, 0.006, inner.x0 + (k + f) * leafW, lip / 2, zOut - 0.003, m.pvc);
  }
  // Plan placement: face the room, rotate so local X runs along the wall, lift to the
  // sill and move to the zone centre (same frame as buildDoorProduct).
  const M = new THREE.Matrix4().makeRotationY(p.alongX ? 0 : Math.PI / 2)
    .multiply(new THREE.Matrix4().makeScale(1, 1, p.roomZ < 0 ? -1 : 1))
    .premultiply(new THREE.Matrix4().makeTranslation(p.cx, p.sill, -p.cy));
  const flip = p.roomZ < 0;
  return parts.map(([geometry, material]) => {
    geometry.applyMatrix4(M);
    if (flip) flipWinding(geometry); // a mirror turns faces inside out
    return new THREE.Mesh(geometry, material);
  });
}

// Restore outward faces after a mirroring transform (indexed BoxGeometry).
function flipWinding(geometry) {
  const idx = geometry.index;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  idx.needsUpdate = true;
  geometry.computeVertexNormals();
}
