// Mesh export: turn the current extruded BufferGeometry into downloadable
// STL / OBJ / glTF(.glb) files via Three.js's stock exporters.
//
// The geometry handed in comes straight from extrudeFootprint(), so it is
// already standing up (plan-Y -> world-Z, extrusion -> +Y) and in meters —
// the same orientation and scale you see in the 3D viewport. The exporters
// operate on an Object3D, so we wrap the geometry in a throwaway Mesh, then
// serialize and trigger a browser download.

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Wrap a bare geometry in a Mesh the exporters can walk. The material is
// irrelevant to STL/OBJ and only nominal for glTF, so a default one is fine.
function meshFrom(geometry) {
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
}

// Push bytes/text to the user as a file download. `data` may be a string,
// ArrayBuffer, or a typed-array/DataView view — all valid Blob parts.
function triggerDownload(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Binary STL — compact, the de-facto 3D-printing format. */
export function exportSTL(geometry, filename = 'house.stl') {
  const data = new STLExporter().parse(meshFrom(geometry), { binary: true });
  triggerDownload(filename, data, 'model/stl');
}

/** Wavefront OBJ — plain text, widely importable. */
export function exportOBJ(geometry, filename = 'house.obj') {
  const text = new OBJExporter().parse(meshFrom(geometry));
  triggerDownload(filename, text, 'model/obj');
}

/** Binary glTF (.glb) — a single self-contained file, best for sharing/web. */
export function exportGLTF(geometry, filename = 'house.glb') {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      meshFrom(geometry),
      (result) => {
        triggerDownload(filename, result, 'model/gltf-binary');
        resolve();
      },
      (err) => reject(err),
      { binary: true },
    );
  });
}
