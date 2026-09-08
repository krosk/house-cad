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
