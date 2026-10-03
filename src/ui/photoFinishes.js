// Photo textures for finishes in View 3D Realistic (docs/realism.md "Photo finishes"):
// the retailer's own photo of the laid product, downloaded on the fly into Cache Storage
// and never committed (owner rule, 2026-10-03). The procedural design stays the stored
// form and is used everywhere else (normal View 3D, AR, offline).
import * as THREE from 'three';
import { fetchCached } from './imageCache.js';
import { steppedA, steppedB, steppedCells } from '../core/flooring.js';

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
  // Sources: Monastère beige (Leroy Merlin refs 72831325 50×50, 72831311 30×50, 72831304
  // 30×30; catalog entry `monastere_beige_pinwheel`, docs/materials.md). One straight photo of
  // a single tile per size, 2000 × 2000 px, the tile on pure white (255). Tile outlines
  // measured in Node (pixels < 240, 2026-10-03): [x0, y0, x1, y1] below; 50×50 and 30×30 are
  // square within 0.3 %, the 30×50 photo is landscape at 1.63 : 1 (nominal 1.67). The faces
  // average RGB 219–225 / 205–213 blue (cool under the sky light); `tone` (per channel) brings
  // them to the procedural design's greige, which was set darker and warmer toward the
  // owner's showroom photo (docs/materials.md: base 0xd4cfc3, grey mean 204).
  monastere_beige_pinwheel: {
    layout: 'stepped',
    formats: {
      '50×50': { url: 'https://media.adeo.com/media/1165024/media.jpg', box: [31, 23, 1971, 1962], px: [1536, 1536] },
      '30×50': { url: 'https://media.adeo.com/media/989865/media.jpg', box: [45, 416, 1952, 1584], px: [1536, 922] },
      '30×30': { url: 'https://media.adeo.com/media/1182128/media.jpg', box: [50, 34, 1955, 1945], px: [922, 922] },
    },
    tone: [0.95, 0.92, 0.92],
  },
};

export const hasPhotoFinish = (def) => !!(def && PHOTOS[def.id]);

// A page canvas, or an OffscreenCanvas in the finish texture worker. Callers set the size.
const newCanvas = () => (typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1));

// Worker side: the atlas as canvases plus plain numbers (structured-clone safe).
export function photoCanvases(def) {
  const spec = PHOTOS[def.id];
  if (!spec) return Promise.reject(new Error(`no photo for ${def.id}`));
  return spec.layout === 'stepped' ? buildTiles(spec, def) : buildPlanks(spec);
}

// Page side: canvases → { map, bumpMap, plank: [L, W], cells } (planks) or { map, bumpMap,
// rects, grout } (stepped) for patchPhotoMaterial. An atlas: clamp, cells must not bleed round.
// The download and the pixel work run in the texture worker (textureWorker.js
// `loadPhotoFinish`): about 2.9 s of main thread for Charme, 0.9 s for Monastère on the Deck.
export function photoTextures(atlas, anisotropy) {
  const map = new THREE.CanvasTexture(atlas.map);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(atlas.bump);
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = anisotropy;
  }
  if (atlas.layout === 'stepped') {
    return { layout: 'stepped', map, bumpMap, rects: atlas.rects.map((r) => new THREE.Vector4(...r)), grout: new THREE.Color(atlas.groutHex) };
  }
  return { layout: 'planks', map, bumpMap, plank: atlas.plank, cells: atlas.cells };
}

async function buildPlanks(spec) {
  const buffer = await fetchCached(spec.url);
  const image = await createImageBitmap(new Blob([buffer], { type: 'image/jpeg' }));
  const fit = lightFit(image);
  const g = spec.grooves, cells = spec.planks.length;
  const cellW = 1760, cellH = Math.round(cellW * spec.plank[1] / spec.plank[0]);
  const canvas = newCanvas();
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
  return { layout: 'planks', map: canvas, bump: reliefCanvas(pixels), plank: spec.plank, cells };
}

const FORMAT_ORDER = ['50×50', '30×50', '30×30'];

// The tile photos in one atlas (stacked, each the tile's outline box at about 3 px/mm), the
// white background turned to grout, and a relief map: the tile's outline blurred over
// about 12 mm (the pillowed edge rolling down to the joint) plus the photo's grain.
async function buildTiles(spec, def) {
  const images = await Promise.all(FORMAT_ORDER.map(async (f) => {
    const buffer = await fetchCached(spec.formats[f].url);
    return createImageBitmap(new Blob([buffer], { type: 'image/jpeg' }));
  }));
  // Each atlas cell is the nominal cell: the tile plus half a joint of grout all round, so
  // joints come out of the texture with its mip filtering (a joint drawn by the shader
  // aliased into dashes at a distance: seen in a screenshot).
  const tileM = 0.5 - (def.joint || 0); // the 50×50 tile's face (m)
  const M = Math.round((def.joint || 0) / 2 * spec.formats['50×50'].px[0] / tileM);
  const W = Math.max(...FORMAT_ORDER.map((f) => spec.formats[f].px[0])) + 2 * M;
  const H = FORMAT_ORDER.reduce((h, f) => h + spec.formats[f].px[1] + 2 * M, 0);
  const canvas = newCanvas();
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const rects = [];
  let y = 0;
  FORMAT_ORDER.forEach((f, i) => {
    const { box: [x0, y0, x1, y1], px: [tw, th] } = spec.formats[f];
    const w = tw + 2 * M, h = th + 2 * M;
    ctx.drawImage(images[i], x0, y0, x1 - x0 + 1, y1 - y0 + 1, M, y + M, tw, th);
    images[i].close?.();
    // Texture UVs (flipY): u across, v = 1 − canvas y / H.
    rects.push({ uv: [0, 1 - (y + h) / H, w / W, 1 - y / H], cell: [0, y, w, h] });
    y += h;
  });
  const pixels = ctx.getImageData(0, 0, W, H);
  const d = pixels.data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  // Background = the near-white region connected to each cell's border (flood fill), so
  // light spots inside a tile stay stone.
  const bg = new Uint8Array(W * H);
  for (const r of rects) {
    const [cx, cy, cw, ch] = r.cell;
    const stack = [];
    const push = (x, yy) => {
      if (x < cx || yy < cy || x >= cx + cw || yy >= cy + ch) return;
      const p = yy * W + x;
      if (bg[p] || lum(p * 4) < 238) return;
      bg[p] = 1; stack.push(p);
    };
    for (let x = cx; x < cx + cw; x++) { push(x, cy); push(x, cy + ch - 1); }
    for (let yy = cy; yy < cy + ch; yy++) { push(cx, yy); push(cx + cw - 1, yy); }
    while (stack.length) {
      const p = stack.pop(), x = p % W, yy = (p - x) / W;
      push(x + 1, yy); push(x - 1, yy); push(x, yy + 1); push(x, yy - 1);
    }
    // Outside the drawn cell (the narrower formats) is background too.
    for (let yy = cy; yy < cy + ch; yy++) for (let x = cw; x < W; x++) bg[yy * W + x] = 1;
  }
  const groutHex = def.grout ?? 0xe6dfcd; // the page makes it a linear THREE.Color for the shader
  const g255 = [(groutHex >> 16) & 255, (groutHex >> 8) & 255, groutHex & 255]; // sRGB bytes, for the canvas
  const mask = new Float32Array(W * H);
  for (let p = 0, i = 0; p < bg.length; p++, i += 4) {
    if (bg[p]) { d[i] = g255[0]; d[i + 1] = g255[1]; d[i + 2] = g255[2]; continue; }
    mask[p] = 1;
    // The photo's anti-aliased rim (between stone and white) fades to grout, not white.
    const l = lum(i), t = Math.min(1, Math.max(0, (l - 228) / 27));
    for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] * spec.tone[c]) * (1 - t) + g255[c] * t;
  }
  ctx.putImageData(pixels, 0, 0);
  return { layout: 'stepped', map: canvas, bump: tileReliefCanvas(pixels, mask), rects: rects.map((r) => r.uv), groutHex };
}

// Height: the outline blurred over about 12 mm (two 18 px boxes at 3 px/mm), so the face
// rolls down into the joint, plus a little of the photo's own grain.
function tileReliefCanvas({ data, width, height }, mask) {
  const box = (src, R) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += src[y * width + Math.min(width - 1, Math.max(0, k))];
      for (let x = 0; x < width; x++) {
        tmp[y * width + x] = sum / (2 * R + 1);
        sum += src[y * width + Math.min(width - 1, x + R + 1)] - src[y * width + Math.max(0, x - R)];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += tmp[Math.min(height - 1, Math.max(0, k)) * width + x];
      for (let y = 0; y < height; y++) {
        out[y * width + x] = sum / (2 * R + 1);
        sum += tmp[Math.min(height - 1, y + R + 1) * width + x] - tmp[Math.max(0, y - R) * width + x];
      }
    }
    return out;
  };
  const pillow = box(box(mask, 18), 18);
  const lum = new Float32Array(width * height);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const local = box(lum, 3);
  const canvas = newCanvas();
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(width, height);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    const edge = mask[p] ? Math.min(1, pillow[p] * 2 - 0.0) : 0; // 0 at the joint, 1 well inside
    const v = Math.max(0, Math.min(255, 40 + 190 * Math.sqrt(Math.max(0, edge)) + (mask[p] ? 1.2 * (lum[p] - local[p]) : 0)));
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

// The photo's lighting falloff: a least-squares quadratic surface of luminance over the
// image (too smooth to touch per-plank tone). gain(x, y) brings a pixel to the mean.
function lightFit(image) {
  const S = 256, c = newCanvas();
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
  const canvas = newCanvas();
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
export function patchPhotoMaterial(material, photo) {
  return photo.layout === 'stepped' ? patchTileMaterial(material, photo) : patchPlankMaterial(material, photo);
}

function patchPlankMaterial(material, photo) {
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

// Lay the tile photos on the stepped lattice (src/core/flooring.js STEPPED) in the shader:
// plan UVs (metres, pattern frame) → lattice cell and which of the module's 5 tiles, then that
// format's photo, turned and mirrored at random per tile (a 30×50 only by 180°, turned 90°
// first when it stands upright). The joint is grout. Colour and relief read the same tile.
function patchTileMaterial(material, photo) {
  const before = { onBeforeCompile: material.onBeforeCompile, key: material.customProgramCacheKey };
  const cells = steppedCells();
  const uniforms = {
    tA: { value: new THREE.Vector2(...steppedA()) },
    tB: { value: new THREE.Vector2(...steppedB()) },
    tCell: { value: cells.map((c) => new THREE.Vector4(c.x0, c.y0, c.x1, c.y1)) },
    tFmt: { value: cells.map((c) => FORMAT_ORDER.indexOf(c.format)) },
    tRect: { value: photo.rects },
    tGrout: { value: new THREE.Vector3(photo.grout.r, photo.grout.g, photo.grout.b) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = `uniform vec2 tA;
uniform vec2 tB;
uniform vec4 tCell[ 5 ];
uniform float tFmt[ 5 ];
uniform vec4 tRect[ 3 ];
uniform vec3 tGrout;
vec2 tileHash( vec2 p ) {
	p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
	return fract( sin( p ) * 43758.5453 );
}
vec2 tileTurn( vec2 v, float k ) {
	if ( k < 0.5 ) return v;
	if ( k < 1.5 ) return vec2( - v.y, v.x );
	if ( k < 2.5 ) return - v;
	return vec2( v.y, - v.x );
}
vec4 tileSample( sampler2D tex, vec2 uv, bool height ) {
	vec2 gx = dFdx( uv ), gy = dFdy( uv );
	float det = tA.x * tB.y - tA.y * tB.x;
	vec2 base = floor( vec2( uv.x * tB.y - uv.y * tB.x, tA.x * uv.y - tA.y * uv.x ) / det );
	vec4 none = height ? vec4( 0.0 ) : vec4( tGrout, 1.0 );
	for ( int dm = - 1; dm <= 1; dm ++ ) {
		for ( int dn = - 1; dn <= 1; dn ++ ) {
			vec2 mn = base + vec2( float( dm ), float( dn ) );
			vec2 q = uv - mn.x * tA - mn.y * tB;
			for ( int i = 0; i < 5; i ++ ) {
				vec4 c = tCell[ i ];
				if ( q.x < c.x || q.x >= c.z || q.y < c.y || q.y >= c.w ) continue;
				vec2 size = c.zw - c.xy;
				vec2 lt = ( q - c.xy ) / size; // the atlas cell includes half a joint all round
				int f = int( tFmt[ i ] + 0.5 );
				vec2 h = tileHash( mn * 7.13 + float( i ) * 1.71 );
				vec2 p = lt - 0.5, dx = gx / size, dy = gy / size;
				if ( f == 1 && size.y > size.x ) { p = tileTurn( p, 1.0 ); dx = tileTurn( dx, 1.0 ); dy = tileTurn( dy, 1.0 ); }
				float k = f == 1 ? 2.0 * floor( h.x * 2.0 ) : floor( h.x * 4.0 );
				p = tileTurn( p, k ); dx = tileTurn( dx, k ); dy = tileTurn( dy, k );
				if ( h.y < 0.5 ) { p.x = - p.x; dx.x = - dx.x; dy.x = - dy.x; }
				vec4 r = tRect[ f ];
				vec2 span = r.zw - r.xy;
				return textureGrad( tex, r.xy + ( p + 0.5 ) * span, dx * span, dy * span );
			}
		}
	}
	return none;
}
` + shader.fragmentShader
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'tileSample( map, vMapUv, false )'))
      .replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment
        .replace(/texture2D\( bumpMap, ([^)]*?) \)/g, 'tileSample( bumpMap, $1, true )'));
  };
  material.customProgramCacheKey = () => 'tile-photo';
  material.needsUpdate = true;
  return () => {
    material.onBeforeCompile = before.onBeforeCompile;
    material.customProgramCacheKey = before.key;
    material.needsUpdate = true;
  };
}
