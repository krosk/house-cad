// The page side of the texture worker (textures.worker.js; docs/materials.md "Texture
// preparation in a worker"). Owner rule (2026-10-03): everything that is texture
// preparation runs in the background. Painting a finish took up to 2 s of main thread
// (Lucia, Monastère), a photo floor 0.9–2.9 s, on the Steam Deck: a link with finishes
// froze the 2D pan. Callers get promises; the page only wraps canvases into textures.
// Without Worker/OffscreenCanvas, or if the worker fails, each job runs on the page
// instead, one per task.
import { finishCanvases, finishTexturesFrom, hasFinishDetail } from './finishTextures.js';
import { photoCanvases, photoTextures } from './photoFinishes.js';
import { skyPixels } from './skyPixels.js';
import { PAINTERS } from './painters.js';
import { setTexturePainter } from './paintedTexture.js';

let worker = null;
let workerBroken = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined';
// Why the page paints instead of the worker (shown with the View 3D counter), or ''.
let fallbackReason = workerBroken
  ? (typeof Worker === 'undefined' ? 'no Worker' : 'no OffscreenCanvas') : '';
// Jobs the page ran because the worker could not, and the worker's last error.
let pageJobs = 0;
let lastJobError = '';

const pending = new Map(); // id → { job, resolve, reject }
let nextId = 0;

// The same jobs on the page (the fallback): canvases stay page canvases.
const PAGE_JOBS = {
  finish: ({ m, bump, detail }) => finishCanvases(m, { bump, detail }),
  photo: ({ def }) => photoCanvases(def),
  sky: ({ url }) => skyPixels(url),
  paint: ({ name, args, w, h }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    PAINTERS[name](canvas.getContext('2d'), w, h, args ?? undefined);
    return { canvas };
  },
};
let pageQueue = Promise.resolve();
function runOnPage(job) {
  const run = pageQueue.then(() => new Promise((resolve, reject) => {
    setTimeout(() => { Promise.resolve().then(() => PAGE_JOBS[job.kind](job)).then(resolve, reject); }, 0);
  }));
  pageQueue = run.catch(() => {});
  return run;
}

// ImageBitmaps back to page canvases, so textures upload exactly as before (flipY applies
// to a canvas, not to an ImageBitmap).
function unpack(value, depth = 0) {
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = value.width;
    canvas.height = value.height;
    canvas.getContext('2d').drawImage(value, 0, 0);
    value.close();
    return canvas;
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value) && depth < 2) {
    for (const k of Object.keys(value)) value[k] = unpack(value[k], depth + 1);
  }
  return value;
}

function fallBack(reason) {
  console.warn('texture worker unavailable, preparing textures on the page:', reason);
  workerBroken = true;
  fallbackReason = String(reason || 'worker error').slice(0, 60);
  worker?.terminate();
  worker = null;
  for (const [id, { job, resolve, reject }] of pending) {
    pending.delete(id);
    runOnPage(job).then(resolve, reject);
  }
}

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./textures.worker.js', import.meta.url), { type: 'module' });
  } catch (error) {
    fallBack(error?.message || error);
    return null;
  }
  worker.onmessage = ({ data }) => {
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (!data.error) { entry.resolve(unpack(data.result)); return; }
    if (entry.job.kind === 'finish' || entry.job.kind === 'paint') {
      // A canvas feature missing in this worker: paint that one on the page.
      console.warn('texture worker failed', entry.job.m?.id || entry.job.name, data.error);
      pageJobs += 1;
      lastJobError = String(data.error).slice(0, 60);
      runOnPage(entry.job).then(entry.resolve, entry.reject);
    } else {
      entry.reject(new Error(data.error)); // a download failure is the same on the page
    }
  };
  worker.onerror = (event) => { event.preventDefault?.(); fallBack(event.message); };
  return worker;
}

// { total, done, onPage } of every job so far (onPage: why jobs run on the page, or '');
// main.js holds View 3D until done === total and shows onPage beside the count.
const progress = { total: 0, done: 0 };
const progressListeners = new Set();
export function onTextureProgress(fn) {
  progressListeners.add(fn);
  fn({ ...progress, onPage: onPage() });
}
const onPage = () => fallbackReason || (pageJobs ? `${pageJobs} job(s): ${lastJobError}` : '');
function step(added, done) {
  progress.total += added;
  progress.done += done;
  for (const fn of progressListeners) fn({ ...progress, onPage: onPage() });
}

function run(job) {
  step(1, 0);
  const w = getWorker();
  if (!w) pageJobs += 1;
  const result = w ? new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { job, resolve, reject });
    w.postMessage({ id, ...job });
  }) : runOnPage(job);
  // Counted done once the caller's wrapping (a microtask later) has run.
  result.then(() => {}, () => {}).then(() => setTimeout(() => step(0, 1), 0));
  return result;
}

// paintedTexture.js asks here for its pictures.
setTexturePainter((job) => run({ kind: 'paint', ...job }).then((r) => r.canvas));

// → Promise<{ map, bumpMap }> (either may be null), the textures finishTexture and
// finishBumpTexture make; the detail layer is cached for applyFinishDetail. `bump: false`
// paints the colour only (AR's Lambert materials ignore relief and detail).
export function paintFinish(m, anisotropy = 1, { bump = true } = {}) {
  const detail = bump && !hasFinishDetail(m);
  return run({ kind: 'finish', m, bump, detail }).then((canvases) => finishTexturesFrom(m, canvases, anisotropy));
}

// → Promise of a photo finish's atlas textures (photoFinishes.js), once per finish.
const photos = new Map();
export function loadPhotoFinish(def, anisotropy = 1) {
  if (!photos.has(def.id)) {
    const p = run({ kind: 'photo', def }).then((atlas) => photoTextures(atlas, anisotropy));
    p.catch(() => photos.delete(def.id)); // a failed download may be retried later
    photos.set(def.id, p);
  }
  return photos.get(def.id);
}

// → Promise<{ width, height, texture, light, sunAngle }> (realism.js wraps the arrays).
export const loadSkyPixels = (url) => run({ kind: 'sky', url });
