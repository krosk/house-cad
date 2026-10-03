// Paints finish textures off the main thread (docs/materials.md "Painting in a worker").
// In: { id, m, detail }. Out: { id, canvases } with each canvas as an ImageBitmap
// (transferred), or { id, error }. The page wraps them with finishTexturesFrom.
import { finishCanvases } from './finishTextures.js';

self.onmessage = ({ data: { id, m, detail } }) => {
  try {
    const canvases = finishCanvases(m, { detail });
    const transfer = [];
    for (const c of Object.values(canvases)) {
      if (!c) continue;
      c.canvas = c.canvas.transferToImageBitmap();
      transfer.push(c.canvas);
    }
    self.postMessage({ id, canvases }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
