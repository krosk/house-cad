// Texture preparation off the main thread (docs/materials.md "Texture preparation in a
// worker"): every texture that takes real time to make is made here, so the page (2D pan,
// buttons) never freezes while a house, a link or Realistic loads.
// In: { id, kind, ... }. Out: { id, result } with each canvas as an ImageBitmap and each
// typed array's buffer transferred, or { id, error }. textureWorker.js wraps the results.
//   finish { m, bump, detail } → finishCanvases (finishTextures.js)
//   photo  { def }             → photoCanvases (photoFinishes.js), download included
//   sky    { url }             → skyPixels (skyPixels.js), download included
//   paint  { name, args, w, h } → a painters.js painter on a w × h canvas (paintedTexture.js)
import { finishCanvases } from './finishTextures.js';
import { photoCanvases } from './photoFinishes.js';
import { skyPixels } from './skyPixels.js';
import { PAINTERS } from './painters.js';

const JOBS = {
  finish: ({ m, bump, detail, scale }) => finishCanvases(m, { bump, detail, scale }),
  photo: ({ def, scale }) => photoCanvases(def, { scale }),
  sky: ({ url }) => skyPixels(url),
  paint: ({ name, args, w, h }) => {
    const canvas = new OffscreenCanvas(w, h);
    PAINTERS[name](canvas.getContext('2d'), w, h, args ?? undefined);
    return { canvas };
  },
};

// Canvases → ImageBitmaps (transferred); typed arrays → their buffers transferred. Two levels
// deep is all the results have ({ map: { canvas } }, { map: canvas }, { texture: Uint16Array }).
function pack(value, transfer, depth = 0) {
  if (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) {
    const bitmap = value.transferToImageBitmap();
    transfer.push(bitmap);
    return bitmap;
  }
  if (ArrayBuffer.isView(value)) { transfer.push(value.buffer); return value; }
  if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) {
    for (const k of Object.keys(value)) value[k] = pack(value[k], transfer, depth + 1);
  }
  return value;
}

self.onmessage = async ({ data }) => {
  try {
    const result = await JOBS[data.kind](data);
    const transfer = [];
    self.postMessage({ id: data.id, result: pack(result, transfer) }, transfer);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message || error) });
  }
};
