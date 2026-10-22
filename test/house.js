// Small synthetic houses for the tests: never the owner's plan. Each call returns a fresh,
// solved Project loaded through the app's own loader (deserializeInto → Project._emit).
import { Project } from '../src/core/model.js';
import { deserializeInto } from '../src/io/serialize.js';

// One storey: a 4 × 3 m room, an interior wall at x 2.0–2.1, a door zone in the south wall,
// and four wall devices, one on each kind of face (exterior wall's room side, both sides of
// the interior wall, the north wall).
export function oneRoomData() {
  return {
    app: 'house-cad', version: 3, activeFloorId: 'f1', groundFloorId: 'f1',
    floors: [{
      id: 'f1', name: 'Ground', height: 2.8, slab: 0.2,
      rectangles: [
        { id: 'r1', x: 0, y: 0, w: 4, h: 3, kind: 'room' },
        { id: 'r2', x: 2, y: 0, w: 0.1, h: 3, kind: 'wall' },
        { id: 'r3', x: 0.5, y: -0.06, w: 0.78, h: 0.12, kind: 'door' },
      ],
      constraints: [],
      markers: [
        { id: 'm1', type: 'outlet', x: 0, y: 1.5, z: 0.3 },
        { id: 'm2', type: 'switch', x: 2, y: 1, z: 1.1 },
        { id: 'm3', type: 'switch', x: 2.1, y: 2, z: 1.1 },
        { id: 'm4', type: 'outlet', x: 3, y: 3, z: 0.3 },
      ],
      electricalLinks: [],
      finishes: [],
    }],
  };
}

export function load(data) {
  const p = new Project();
  deserializeInto(p, structuredClone(data));
  return p;
}

// The builders that paint textures (src/ui) reach for `document` and the texture worker.
// A 1 px canvas stand-in and a painter that never answers are enough to build geometry.
export async function stubTextures() {
  globalThis.document ??= {
    createElement: () => ({ width: 1, height: 1, getContext: () => ({ fillRect() {}, fillStyle: '' }) }),
  };
  const { setTexturePainter } = await import('../src/ui/paintedTexture.js');
  setTexturePainter(() => new Promise(() => {}));
}
