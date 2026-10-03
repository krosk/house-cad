// A small procedural texture whose picture is painted in the background (owner rule,
// 2026-10-03: everything that is texture preparation runs in the background). The
// caller gets a CanvasTexture at once, a 1 px placeholder of `placeholder` colour, and
// keeps building synchronously; the picture arrives from the texture worker
// (textureWorker.js registers the painter) and replaces the placeholder.
// `name` is a painter in painters.js, `args` plain data (structured-clone safe).
// One texture per name, args, size and `variant` (callers set wrap/repeat the same way each
// time, so it is shared, never disposed); one painted picture per name, args and size.
import * as THREE from 'three';

let painter = null; // ({ name, args, w, h }) → Promise<canvas>
export const setTexturePainter = (fn) => { painter = fn; };

const pictures = new Map();
const textures = new Map();

export function paintedTexture(name, args, w, h = w, { color = true, wrap = THREE.RepeatWrapping, wrapT = wrap, placeholder = 0xcccccc, variant = '', deferred = false } = {}) {
  const pictureKey = `${name}|${JSON.stringify(args ?? null)}|${w}x${h}`;
  const key = `${pictureKey}|${color}|${wrap}|${wrapT}|${variant}`;
  if (textures.has(key)) return textures.get(key);
  const swatch = document.createElement('canvas');
  swatch.width = swatch.height = 1;
  const ctx = swatch.getContext('2d');
  ctx.fillStyle = `#${new THREE.Color(placeholder).getHexString()}`;
  ctx.fillRect(0, 0, 1, 1);
  const texture = new THREE.CanvasTexture(swatch);
  texture.wrapS = wrap;
  texture.wrapT = wrapT;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, texture);
  const start = () => {
    if (!pictures.has(pictureKey)) pictures.set(pictureKey, painter({ name, args, w, h }));
    pictures.get(pictureKey).then((canvas) => {
      texture.dispose(); // the GPU copy was allocated at 1 × 1: reallocate at the real size
      texture.image = canvas;
      texture.needsUpdate = true;
    }).catch((error) => console.warn('texture paint failed', name, error));
  };
  if (deferred && deferredStarts) deferredStarts.push(start);
  else start();
  return texture;
}

// `deferred` textures (made at startup but only needed in 3D) wait for this call, made
// by View 3D's first model build, so the plan view prepares nothing (owner, 2026-10-03).
let deferredStarts = [];
export function startDeferredTextures() {
  const starts = deferredStarts;
  deferredStarts = null;
  for (const start of starts || []) start();
}
