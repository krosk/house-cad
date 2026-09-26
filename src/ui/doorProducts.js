// Door products (docs/materials.md "Doors"): a catalog material with
// `surface: 'door'` set on a DOOR zone builds that product's leaf and frame in 3D,
// sized by the opening (made-to-measure doors take the opening's size). The design
// is inferred from product photos: no manufacturer 3D model exists.
//
// `placement` comes from doorProductPlacements (architectural3d.js). Returns plain
// Meshes whose geometry already carries the plan → world transform (plan (x, y) →
// world (x, up, −y), floor at y = 0), so a caller adds them beside its other
// architectural meshes and only lifts them by the floor elevation.

import * as THREE from 'three';

const FRAME = 0.05;       // dormant (frame) face width
const FRAME_DEPTH = 0.08; // dormant depth (Ange-Line: 80 mm)
const HANDLE_Z = 1.05;    // handle height above the floor

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;
const shade = (hex, f) => `#${new THREE.Color(hex).multiplyScalar(f).getHexString()}`;

// Ange-Line face, lock edge at canvas x = 0, hinge edge at x = S·W. A full-height
// groove near the lock edge; a satin-glass half-lens between the groove and an arc
// bulging toward the hinge; the arc's circle continues past the glass as grooves
// running to the lock-edge corners (Lapeyre product photos).
function drawAngeLine(ctx, W, H, def) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(def.color, 1.12));
  g.addColorStop(1, shade(def.color, 0.9));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const grooveX = 0.2 * W, y1 = 0.1 * H, y2 = 0.88 * H, sag = 0.36 * W;
  const c = (y2 - y1) / 2, R = (c * c + sag * sag) / (2 * sag);
  const cx = grooveX + sag - R, cy = (y1 + y2) / 2;
  // Glass: the circle clipped to the right of the groove.
  ctx.save();
  ctx.beginPath(); ctx.rect(grooveX, 0, W - grooveX, H); ctx.clip();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  const glass = ctx.createLinearGradient(0, y1, 0, y2);
  glass.addColorStop(0, css(def.accent));
  glass.addColorStop(0.5, shade(def.accent, 1.06));
  glass.addColorStop(1, shade(def.accent, 0.94));
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.restore();
  // Grooves: the vertical line and the whole arc across the leaf.
  ctx.strokeStyle = shade(def.color, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(grooveX, 0.015 * H); ctx.lineTo(grooveX, 0.985 * H); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.rect(0.03 * W, 0.015 * H, W * 0.97, H * 0.97); ctx.clip();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

const DESIGNS = { 'ange-line': drawAngeLine };

// One leaf texture per catalog entry and orientation (mirrored = hinge at canvas x 0).
const texCache = new Map();
function leafTexture(def, mirrored) {
  const key = `${def.id}|${JSON.stringify(def)}|${mirrored}`;
  if (texCache.has(key)) return texCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 512;
  (DESIGNS[def.design] || drawAngeLine)(canvas.getContext('2d'), 256, 512, def);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (mirrored) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; }
  texCache.set(key, t);
  return t;
}

// Materials are cached per entry and never disposed (callers dispose geometry only).
const matCache = new Map();
function materialsFor(def, lambert) {
  const key = `${JSON.stringify(def)}|${lambert}`;
  if (matCache.has(key)) return matCache.get(key);
  const M = lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const extra = lambert ? {} : { roughness: 0.45, metalness: 0.3 };
  const m = {
    body: new M({ color: def.color, ...extra }),
    face: new M({ map: leafTexture(def, false), ...extra }),
    faceMirrored: new M({ map: leafTexture(def, true), ...extra }),
    steel: new M({ color: 0xd4d4d8, ...(lambert ? {} : { roughness: 0.3, metalness: 0.4 }) }),
  };
  matCache.set(key, m);
  return m;
}

// Build the door for one placement. `lambert` selects the cheap AR materials.
export function buildDoorProduct(p, { lambert = false } = {}) {
  const m = materialsFor(p.def, lambert);
  // Local frame: X along the wall (−w/2..w/2), Y up, Z across the wall.
  const w = p.width, h = p.head;
  const hingeX = p.hingeEnd === 'hi' ? 1 : -1; // hinge jamb at local +X or −X
  const parts = [];
  const add = (geometry, material, x, y, z) => {
    geometry.translate(x, y, z);
    parts.push([geometry, material]);
  };
  // Dormant: two jambs and the head, plus a steel threshold.
  add(new THREE.BoxGeometry(FRAME, h, FRAME_DEPTH), m.body, -w / 2 + FRAME / 2, h / 2, 0);
  add(new THREE.BoxGeometry(FRAME, h, FRAME_DEPTH), m.body, w / 2 - FRAME / 2, h / 2, 0);
  add(new THREE.BoxGeometry(w - 2 * FRAME, FRAME, FRAME_DEPTH), m.body, 0, h - FRAME / 2, 0);
  add(new THREE.BoxGeometry(w - 2 * FRAME, 0.015, FRAME_DEPTH + 0.02), m.steel, 0, 0.0075, 0);
  // Leaf: BoxGeometry faces are [+x, −x, +y, −y, +z, −z]. The design's lock edge is at
  // canvas x = 0; +Z's U runs toward +X and −Z's toward −X, so the face whose U starts
  // on the hinge side takes the mirrored texture, and both faces agree in the world.
  const leafW = w - 2 * FRAME - 0.006, leafH = h - FRAME - 0.018, leafT = Math.min(p.leafDepth, 0.1);
  const plusZ = hingeX < 0 ? m.faceMirrored : m.face;
  const minusZ = hingeX < 0 ? m.face : m.faceMirrored;
  const leaf = new THREE.BoxGeometry(leafW, leafH, leafT);
  leaf.translate(0, 0.015 + leafH / 2, 0);
  parts.push([leaf, [m.body, m.body, m.body, m.body, plusZ, minusZ]]);
  // Handle (bar + rose) and cylinder rose on both faces, on the lock side.
  const lockX = -hingeX * (leafW / 2 - 0.09);
  for (const side of [1, -1]) {
    const zFace = side * (leafT / 2);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 16).rotateX(Math.PI / 2), m.steel, lockX, HANDLE_Z, zFace + side * 0.006);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10).rotateX(Math.PI / 2), m.steel, lockX, HANDLE_Z, zFace + side * 0.03);
    // Bar points toward the hinge.
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 10).rotateZ(Math.PI / 2), m.steel, lockX + hingeX * 0.08, HANDLE_Z, zFace + side * 0.055);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 16).rotateX(Math.PI / 2), m.steel, lockX, HANDLE_Z - 0.1, zFace + side * 0.005);
  }
  // Hinge knuckles on the swing face.
  for (const y of [0.25, 1.1, 1.95].map((f) => f * (h / 2.15))) {
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 10), m.body, hingeX * (leafW / 2 + 0.003), y, p.swingZ * (leafT / 2 + 0.008));
  }
  // Plan placement: rotate so local X runs along the wall, then move to the centre.
  // rotation.y = +90° maps local +X to world −Z = plan +y.
  const M = new THREE.Matrix4().makeRotationY(p.alongX ? 0 : Math.PI / 2)
    .premultiply(new THREE.Matrix4().makeTranslation(p.cx, 0, -p.cy));
  return parts.map(([geometry, material]) => {
    geometry.applyMatrix4(M);
    return new THREE.Mesh(geometry, material);
  });
}
