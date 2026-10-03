// Photo textures for finishes in View 3D Realistic (docs/realism.md "Photo finishes"):
// the retailer's own photo of the laid product, downloaded on the fly into Cache Storage
// and never committed (owner rule, 2026-10-03). The procedural design stays the stored
// form and is used everywhere else (normal View 3D, AR, offline).
import * as THREE from 'three';
import { fetchCached } from './realism.js';

// Sources: Beaulieu oak charme 118 × 16.4 (Leroy Merlin ref 92245930; catalog entry
// `oak_beaulieu_charme` in src/core/materials.js, docs/materials.md).
// Photo: media.adeo.com media id 799228, a straight top-down render of the laid floor,
// 3000 × 3000 px. Measured in Node on the full image (2026-10-03):
// - grooves (row-mean luminance minima) at the y below: 11 full rows, mean pitch 247.9 px
//   for the published 164 mm;
// - butt joints (column contrast within each row, checked on a crop): the three whole
//   planks span 1749–1764 px, so a plank is about 1760 px long (1.18 m published).
// Each `planks` entry is one whole plank per row, [x0, x1] in photo px: a whole plank
// between two joints, or 1760 px from a joint toward the photo edge.
const PHOTOS = {
  oak_beaulieu_charme: {
    url: 'https://media.adeo.com/media/799228/media.jpg',
    grooves: [162, 410, 659, 907, 1153, 1402, 1653, 1898, 2140, 2393, 2638, 2889],
    planks: [[1230, 2990], [51, 1811], [633, 2397], [1213, 2973], [25, 1785], [619, 2368],
      [1195, 2955], [19, 1779], [593, 2355], [1172, 2932], [0, 1755]],
    plank: [1.18, 0.164], // published length × width (m)
  },
};

export const hasPhotoFinish = (def) => !!(def && PHOTOS[def.id]);

const cache = new Map();

// → Promise<{ map, bumpMap, plank: [L, W], cells }>: an atlas of the photo's whole
// planks (one per cell, stacked) for patchPlankMaterial, or rejects.
export function loadPhotoFinish(def, anisotropy = 1) {
  const spec = PHOTOS[def.id];
  if (!cache.has(def.id)) {
    const p = build(spec, anisotropy);
    p.catch(() => cache.delete(def.id)); // a failed download may be retried later
    cache.set(def.id, p);
  }
  return cache.get(def.id);
}

async function build(spec, anisotropy) {
  const buffer = await fetchCached(spec.url);
  const image = await createImageBitmap(new Blob([buffer], { type: 'image/jpeg' }));
  const fit = lightFit(image);
  const g = spec.grooves, cells = spec.planks.length;
  const cellW = 1760, cellH = Math.round(cellW * spec.plank[1] / spec.plank[0]);
  const canvas = document.createElement('canvas');
  canvas.width = cellW; canvas.height = cellH * cells;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // A cell runs groove to groove, so each long edge keeps half a groove and a plank turned
  // 180° still meets its neighbours with a full groove.
  spec.planks.forEach(([x0, x1], r) => {
    ctx.drawImage(image, x0, g[r], x1 - x0, g[r + 1] - g[r], 0, r * cellH, cellW, cellH);
  });
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  // Divide out the photo's soft lighting falloff, at each pixel's place in the photo.
  for (let r = 0; r < cells; r++) {
    const [x0, x1] = spec.planks[r];
    for (let y = 0; y < cellH; y++) {
      const py = g[r] + (y + 0.5) / cellH * (g[r + 1] - g[r]);
      for (let x = 0; x < cellW; x++) {
        const k = fit.gain(x0 + (x + 0.5) / cellW * (x1 - x0), py);
        const i = ((r * cellH + y) * cellW + x) * 4;
        d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
      }
      // Butt ends: plain cut ends (bevels are on the long sides only), a faint dark line.
      for (const [x, k] of [[0, 0.8], [1, 0.92], [cellW - 1, 0.86]]) {
        const i = ((r * cellH + y) * cellW + x) * 4;
        d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
      }
    }
  }
  image.close?.();
  ctx.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(reliefCanvas(pixels));
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; // an atlas: cells must not bleed round
    t.anisotropy = anisotropy;
  }
  return { map, bumpMap, plank: spec.plank, cells };
}

// The photo's lighting falloff: a least-squares quadratic surface of luminance over the
// image (too smooth to touch per-plank tone). gain(x, y) brings a pixel to the mean.
function lightFit(image) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(image, 0, 0, S, S);
  const data = cx.getImageData(0, 0, S, S).data;
  const basis = (u, v) => [1, u, v, u * u, u * v, v * v];
  const N = 6, A = Array.from({ length: N }, () => new Float64Array(N)), b = new Float64Array(N);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const f = basis((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5);
      for (let p = 0; p < N; p++) { b[p] += f[p] * l; for (let q = 0; q < N; q++) A[p][q] += f[p] * f[q]; }
    }
  }
  const co = solve(A, b);
  const mean = co[0] + (co[3] + co[5]) / 12; // the surface's mean over the unit square
  return {
    gain(px, py) {
      const f = basis(px / image.width - 0.5, py / image.height - 0.5);
      let v = 0;
      for (let p = 0; p < N; p++) v += co[p] * f[p];
      return mean / Math.max(1, v);
    },
  };
}

function solve(A, b) { // Gaussian elimination, small dense system
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) {
      const f = M[r][i] / M[i][i];
      for (let k = i; k <= n; k++) M[r][k] -= f * M[i][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let k = i + 1; k < n; k++) sum -= M[i][k] * x[k];
    x[i] = sum / M[i][i];
  }
  return x;
}

// Relief from the photo: luminance minus its local mean (a 9 px box), so grooves, joints,
// knots and the dark grain lines sit low and the plank faces stay flat.
function reliefCanvas({ data, width, height }) {
  const lum = new Float32Array(width * height);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const R = 4, tmp = new Float32Array(lum.length), blur = new Float32Array(lum.length);
  const clampX = (x) => Math.min(width - 1, Math.max(0, x)), clampY = (y) => Math.min(height - 1, Math.max(0, y));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += lum[y * width + clampX(x + k)];
      tmp[y * width + x] = sum / (2 * R + 1);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += tmp[clampY(y + k) * width + x];
      blur[y * width + x] = sum / (2 * R + 1);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(width, height);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    const v = Math.max(0, Math.min(255, 128 + 2.5 * (lum[p] - blur[p])));
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

// Lay the atlas's planks on the floor in the shader: plan UVs (metres) → row, a random
// offset per row, plank index along it, and a random cell and 180° turn per plank, so
// the floor never repeats. Colour and relief read the same plank (textureGrad keeps the
// mip level continuous across plank edges). Returns a restore function.
export function patchPlankMaterial(material, photo) {
  const before = { onBeforeCompile: material.onBeforeCompile, key: material.customProgramCacheKey };
  const uniforms = {
    plankSize: { value: new THREE.Vector2(...photo.plank) },
    plankCells: { value: photo.cells },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = `uniform vec2 plankSize;
uniform float plankCells;
vec2 plankHash( vec2 p ) {
	p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
	return fract( sin( p ) * 43758.5453 );
}
vec4 plankSample( sampler2D tex, vec2 uv ) {
	float row = floor( uv.y / plankSize.y );
	float s = uv.x / plankSize.x + plankHash( vec2( row, 7.0 ) ).x;
	float k = floor( s );
	vec2 local = vec2( fract( s ), fract( uv.y / plankSize.y ) );
	vec2 h = plankHash( vec2( k, row ) + 0.37 );
	float cell = min( floor( h.x * plankCells ), plankCells - 1.0 );
	if ( h.y < 0.5 ) local = 1.0 - local;
	vec2 scale = vec2( 1.0 / plankSize.x, 1.0 / ( plankSize.y * plankCells ) );
	return textureGrad( tex, vec2( local.x, ( cell + local.y ) / plankCells ), dFdx( uv ) * scale, dFdy( uv ) * scale );
}
` + shader.fragmentShader
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'plankSample( map, vMapUv )'))
      .replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment
        .replace(/texture2D\( bumpMap, ([^)]*?) \)/g, 'plankSample( bumpMap, $1 )'));
  };
  material.customProgramCacheKey = () => 'plank-photo';
  material.needsUpdate = true;
  return () => {
    material.onBeforeCompile = before.onBeforeCompile;
    material.customProgramCacheKey = before.key;
    material.needsUpdate = true;
  };
}
