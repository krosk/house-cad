// Extrude the 2D footprint (MultiPolygon) into a 3D solid.
//
// Coordinate mapping: the plan is drawn in an (x, y) plane. In the 3D world we
// use Y-up (Three.js convention), so the plan lies on the ground plane and the
// extrusion goes up:  plan (x, y)  ->  world (x, height-axis, y).
// We build the shape in Three's XY plane, extrude along +Z, then rotate it so
// +Z (the extrusion/height direction) points up along +Y.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Drop the duplicated closing vertex that polygon-clipping emits.
function ringToVec2(ring) {
  const pts = [];
  for (let i = 0; i < ring.length - 1; i++) {
    pts.push(new THREE.Vector2(ring[i][0], ring[i][1]));
  }
  return pts;
}

/**
 * @param {number[][][][]} multiPolygon  output of computeFootprint()
 * @param {number} height  extrusion height in meters
 * @returns {THREE.BufferGeometry | null}
 */
export function extrudeFootprint(multiPolygon, height) {
  const geometries = [];

  for (const polygon of multiPolygon) {
    if (!polygon.length) continue;
    const outer = ringToVec2(polygon[0]);
    if (outer.length < 3) continue;

    const shape = new THREE.Shape(outer);
    for (let i = 1; i < polygon.length; i++) {
      const hole = ringToVec2(polygon[i]);
      if (hole.length >= 3) shape.holes.push(new THREE.Path(hole));
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
    });
    geometries.push(geo);
  }

  if (!geometries.length) return null;

  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);

  // Stand the extrusion up: plan-Y becomes world-Z, extrusion becomes world-Y.
  merged.rotateX(-Math.PI / 2);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Merge a stack of per-floor extrusions into one geometry for mesh export,
 * translating each up by its elevation. Clones the inputs so the live display
 * meshes (positioned via mesh.position.y) are untouched.
 * @param {{geometry: THREE.BufferGeometry|null, elevation: number}[]} floors
 * @returns {THREE.BufferGeometry | null}
 */
export function mergeFloorGeometries(floors) {
  const geos = [];
  for (const { geometry, elevation } of floors) {
    if (!geometry) continue;
    const g = geometry.clone();
    if (elevation) g.translate(0, elevation, 0);
    geos.push(g);
  }
  if (!geos.length) return null;
  return geos.length === 1 ? geos[0] : mergeGeometries(geos);
}

/**
 * Flat floor-plan fill: the footprint lying on the ground plane (no extrusion).
 * Used by MR to show the plan on the real floor instead of the 3D massing.
 * @param {number[][][][]} multiPolygon  output of computeFootprint()
 * @returns {THREE.BufferGeometry | null}
 */
export function footprintFloorGeometry(multiPolygon) {
  const geometries = [];
  for (const polygon of multiPolygon) {
    if (!polygon.length) continue;
    const outer = ringToVec2(polygon[0]);
    if (outer.length < 3) continue;
    const shape = new THREE.Shape(outer);
    for (let i = 1; i < polygon.length; i++) {
      const hole = ringToVec2(polygon[i]);
      if (hole.length >= 3) shape.holes.push(new THREE.Path(hole));
    }
    geometries.push(new THREE.ShapeGeometry(shape));
  }
  if (!geometries.length) return null;
  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
  merged.rotateX(-Math.PI / 2); // lay flat: plan-Y -> world-Z, face normal -> +Y
  return merged;
}

/**
 * Floor-plan outline: the footprint edges as ground-plane line segments.
 * @param {number[][][][]} multiPolygon  output of computeFootprint()
 * @returns {THREE.BufferGeometry | null}
 */
export function footprintOutlineGeometry(multiPolygon) {
  const pts = [];
  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        // Match footprintFloorGeometry's rotateX(-PI/2): plan (x, y) -> world (x, 0, -y).
        pts.push(a[0], 0, -a[1], b[0], 0, -b[1]);
      }
    }
  }
  if (!pts.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}
