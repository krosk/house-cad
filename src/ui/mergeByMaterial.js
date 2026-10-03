// Draw-call reduction for the AR 3D view. Products are built from many small meshes (a
// Héméra window 25–43, a towel radiator 39–49, the piano 27), and WebXR in this three.js
// build draws every mesh once per eye (no multiview): a furnished living room went from
// ~150 to ~1000 calls (owner, 2026-10-03). Merging the meshes that share a material into
// one geometry costs one call per material instead of one per mesh. Geometry only:
// materials, and so the look, are unchanged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Geometries can merge only with the same attributes and the same indexing.
function mergeKey(geometry, material) {
  const attrs = Object.entries(geometry.attributes)
    .map(([name, a]) => `${name}${a.itemSize}${a.normalized ? 'n' : ''}`).sort().join(',');
  return `${material.uuid}|${attrs}|${geometry.index ? 'i' : 'n'}`;
}

// Box and extrude geometries carry per-face groups; with a single material they draw
// nothing different, so they are cleared before merging.
const mergeable = (geometry, material) => geometry && material && !Array.isArray(material)
  && !Object.keys(geometry.morphAttributes).length;

// [[geometry, material], …] in one coordinate frame → one pair per material. Merged
// sources are disposed (callers own them); a pair that cannot merge passes through.
export function mergePartsByMaterial(parts) {
  const out = [], buckets = new Map();
  for (const [geometry, material] of parts) {
    if (!mergeable(geometry, material)) { if (geometry) out.push([geometry, material]); continue; }
    geometry.clearGroups();
    const key = mergeKey(geometry, material);
    if (!buckets.has(key)) buckets.set(key, { material, geometries: [] });
    buckets.get(key).geometries.push(geometry);
  }
  for (const { material, geometries } of buckets.values()) {
    const merged = geometries.length > 1 ? mergeGeometries(geometries) : null;
    if (!merged) { for (const g of geometries) out.push([g, material]); continue; }
    for (const g of geometries) g.dispose();
    out.push([merged, material]);
  }
  return out;
}

// Merge a model's visible meshes by material, in place: each becomes one mesh under
// `root`, in root space. Source geometry is cloned (it may be shared with a cached
// template); the merged meshes are flagged `userData.ownGeometry` for disposal.
export function mergeObjectByMaterial(root) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.visible && mergeable(o.geometry, o.material)) meshes.push(o);
  });
  // A mirrored mesh would bake with flipped winding (its back faces culled): left as is.
  const m = new THREE.Matrix4(), parts = [], taken = [];
  for (const o of meshes) {
    m.multiplyMatrices(toRoot, o.matrixWorld);
    if (m.determinant() <= 0) continue;
    parts.push([o.geometry.clone().applyMatrix4(m), o.material]);
    taken.push(o);
  }
  if (taken.length < 2) { for (const [g] of parts) g.dispose(); return root; }
  for (const o of taken) o.removeFromParent();
  for (const [geometry, material] of mergePartsByMaterial(parts)) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.ownGeometry = true;
    root.add(mesh);
  }
  return root;
}
