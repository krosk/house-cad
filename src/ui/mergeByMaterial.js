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

// A material's look as a string: two materials with the same signature draw the same, so
// their meshes can share one draw call. Each furniture instance has its own material copies
// (instantiateFurniture), so the uuid alone would never match across items. A material with
// custom shader code keys on its uuid.
const SIG_MAPS = ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap'];
const SIG_PROPS = ['type', 'opacity', 'transparent', 'side', 'alphaTest', 'vertexColors', 'depthWrite', 'depthTest',
  'blending', 'flatShading', 'wireframe', 'fog', 'toneMapped', 'emissiveIntensity', 'roughness', 'metalness',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'visible'];
export function materialSignature(m, { ignoreColour = false } = {}) {
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || m.isShaderMaterial) return `uuid:${m.uuid}`;
  const parts = SIG_PROPS.map((p) => String(m[p]));
  for (const c of ['color', 'emissive', 'specular']) {
    parts.push(c === 'color' && ignoreColour ? '*' : m[c]?.isColor ? m[c].getHexString() : '-');
  }
  for (const k of SIG_MAPS) parts.push(m[k]?.uuid ?? '-');
  return parts.join('|');
}

// A mirrored transform reverses triangle winding: put it back so front faces stay front.
function flipWinding(geometry) {
  if (geometry.index) {
    const a = geometry.index.array;
    for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    geometry.index.needsUpdate = true;
    return;
  }
  for (const attr of Object.values(geometry.attributes)) {
    const n = attr.itemSize, a = attr.array;
    for (let v = 0; v + 2 < attr.count; v += 3) {
      for (let k = 0; k < n; k++) {
        const i1 = (v + 1) * n + k, i2 = (v + 2) * n + k, t = a[i1];
        a[i1] = a[i2]; a[i2] = t;
      }
    }
    attr.needsUpdate = true;
  }
}

// An untextured, opaque material whose colour can move into the vertices: meshes that differ
// only by colour then share one material (`bakeColours`). Vertex colours multiply the
// material colour in three's shaders, both in linear space, so the look is unchanged.
const SIG_ANY_MAP = SIG_MAPS.concat(['specularMap', 'envMap', 'displacementMap']);
const bakeable = (geometry, m) => m.isMeshLambertMaterial && !m.vertexColors && !m.transparent
  && !geometry.attributes.color && !SIG_ANY_MAP.some((k) => m[k]);

// Merge the meshes of many placed models (the AR 3D view's furniture, docs/ar-survey.md
// "Performance notes") into one mesh per material look, in `frame` space: 36 products were
// 209 meshes, each drawn once per eye. `cell` (m, optional) keeps items whose origins fall in
// different square cells apart, so a batch behind the viewer can still be frustum-culled.
// `bakeColours` also joins untextured opaque Lambert meshes of different colours, their colour
// written per vertex on a white copy of the material (`userData.ownMaterial`).
// The sources are left in place for the caller to hide; the merged meshes own their geometry
// (`userData.ownGeometry`) and use the first source's material. Returns { meshes, taken }.
export function mergeAcrossByMaterial(items, frame, { cell = 0, bakeColours = false } = {}) {
  frame.updateMatrixWorld(true);
  const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const buckets = new Map(), taken = [], m = new THREE.Matrix4(), origin = new THREE.Vector3();
  for (const item of items) {
    origin.setFromMatrixPosition(item.matrixWorld).applyMatrix4(toFrame);
    const cellKey = cell > 0 ? `${Math.floor(origin.x / cell)},${Math.floor(origin.z / cell)}` : '';
    item.traverseVisible((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !mergeable(o.geometry, o.material)) return;
      const attrs = Object.entries(o.geometry.attributes)
        .map(([name, a]) => `${name}${a.itemSize}${a.normalized ? 'n' : ''}`).sort().join(',');
      const bake = bakeColours && bakeable(o.geometry, o.material);
      const key = [materialSignature(o.material, { ignoreColour: bake }), attrs, o.geometry.index ? 'i' : 'n',
        o.castShadow ? 'c' : '', o.receiveShadow ? 'r' : '', o.renderOrder, cellKey, bake ? 'vc' : ''].join('#');
      if (!buckets.has(key)) buckets.set(key, { source: o, meshes: [], bake });
      buckets.get(key).meshes.push(o);
    });
  }
  const meshes = [];
  for (const { source, meshes: group, bake } of buckets.values()) {
    if (group.length < 2) continue; // nothing to gain: the source stays as it is
    const geometries = group.map((o) => {
      m.multiplyMatrices(toFrame, o.matrixWorld);
      const g = o.geometry.clone().applyMatrix4(m);
      g.clearGroups();
      if (m.determinant() < 0) flipWinding(g);
      if (bake) {
        const { r, g: gr, b } = o.material.color, n = g.attributes.position.count, c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { c[3 * i] = r; c[3 * i + 1] = gr; c[3 * i + 2] = b; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      return g;
    });
    const merged = mergeGeometries(geometries);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    let material = source.material;
    if (bake) {
      material = source.material.clone();
      material.color.setRGB(1, 1, 1);
      material.vertexColors = true;
      material.userData.ownMaterial = true;
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow; mesh.renderOrder = source.renderOrder;
    mesh.userData.ownGeometry = true;
    meshes.push(mesh);
    taken.push(...group);
  }
  return { meshes, taken };
}
