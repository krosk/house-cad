// Finish textures painted in a worker (docs/materials.md "Painting in a worker"): View 3D
// asks here instead of calling finishTexture directly, so a link or a house with several
// tiled finishes no longer freezes the page (pan included) for seconds while they paint.
// Without OffscreenCanvas or module workers, or if the worker fails, each finish is painted
// on the page instead, one per task.
import { finishTexturesFrom, finishTexture, finishBumpTexture, hasFinishDetail } from './finishTextures.js';

let worker = null;
let workerBroken = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined';
const pending = new Map(); // id → { m, anisotropy, resolve }
let nextId = 0;

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./finishTextures.worker.js', import.meta.url), { type: 'module' });
  } catch (error) {
    console.warn('finish texture worker unavailable, painting on the page', error);
    workerBroken = true;
    return null;
  }
  worker.onmessage = ({ data }) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.error) {
      console.warn('finish texture worker failed', job.m.id, data.error);
      job.resolve(paintOnPage(job.m, job.anisotropy));
      return;
    }
    // Back to page canvases, so the textures upload exactly as before (flipY applies to
    // a canvas, not to an ImageBitmap).
    for (const c of Object.values(data.canvases)) {
      if (!c) continue;
      const bitmap = c.canvas;
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      c.canvas = canvas;
    }
    job.resolve(finishTexturesFrom(job.m, data.canvases, job.anisotropy));
  };
  worker.onerror = (event) => {
    // A worker that cannot load (no module worker support): finish everything on the page.
    console.warn('finish texture worker error, painting on the page', event.message);
    event.preventDefault?.();
    workerBroken = true;
    worker?.terminate();
    worker = null;
    for (const [id, job] of pending) {
      pending.delete(id);
      job.resolve(paintOnPage(job.m, job.anisotropy));
    }
  };
  return worker;
}

// The fallback: one finish per task, so the page can still paint between finishes.
let pageQueue = Promise.resolve();
function paintOnPage(m, anisotropy) {
  const job = pageQueue.then(() => new Promise((resolve) => {
    setTimeout(() => resolve({ map: finishTexture(m, anisotropy), bumpMap: finishBumpTexture(m, anisotropy) }), 0);
  }));
  pageQueue = job.catch(() => {});
  return job;
}

// → Promise<{ map, bumpMap }> (either may be null), the same textures finishTexture and
// finishBumpTexture return; the detail layer is cached for applyFinishDetail.
export function paintFinish(m, anisotropy = 1) {
  const w = getWorker();
  if (!w) return paintOnPage(m, anisotropy);
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, { m, anisotropy, resolve });
    w.postMessage({ id, m, detail: !hasFinishDetail(m) });
  });
}
