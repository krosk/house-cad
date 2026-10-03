// View 3D "Realistic" setting (docs/realism.md): the real sun for a time of day, a
// photographed sky for ambient light and reflections, and ambient occlusion. Desktop
// only; the AR session never uses any of it.
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// The owner's house: Val-de-Marne (94), France (docs/heat-loss.md). North is plan +y
// (owner, 2026-10-03), so plan (x, y) → world (x, up, -y) puts north at world -Z.
export const SITE = { latitude: 48.79, longitude: 2.45 };

// Sun azimuth (radians from north, clockwise through east) and elevation (radians above
// the horizon) at `date`. Low-precision solar ephemeris, about 0.01° over 1950–2050:
// enough for shadows. Proven against tables for Paris (64.6° at the June solstice noon,
// 17.8° at the December one).
export function sunPosition(date, latDeg = SITE.latitude, lonDeg = SITE.longitude) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24; // hours
  const H = (gmst * 15 + lonDeg) * rad - ra; // local hour angle
  const lat = latDeg * rad;
  const elevation = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
  const azimuth = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
  return { azimuth: (azimuth + 2 * Math.PI) % (2 * Math.PI), elevation };
}

// Unit world vector toward the sun (east = +X, north = -Z, up = +Y).
export function sunDirection({ azimuth, elevation }, target = new THREE.Vector3()) {
  const c = Math.cos(elevation);
  return target.set(c * Math.sin(azimuth), Math.sin(elevation), -c * Math.cos(azimuth));
}

// The sky: a CC0 Poly Haven HDRI, downloaded on the fly and kept in the browser's
// Cache Storage, never committed (owner rule, 2026-10-03). A sky-only ("puresky") image
// so no foreign ground or buildings show through the windows.
export const SKY_HDRI = {
  url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  page: 'https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky',
};
const IMAGE_CACHE = 'house-cad:images:v1';

export async function fetchCached(url) {
  const cache = globalThis.caches ? await caches.open(IMAGE_CACHE).catch(() => null) : null;
  const hit = cache && await cache.match(url);
  if (hit) return hit.arrayBuffer();
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  if (cache) await cache.put(url, response.clone()).catch(() => {});
  return response.arrayBuffer();
}

// HDRI → { texture (equirect, sun removed), sunAngle }. The photographed sun is found
// (brightest pixel) and clamped out: the DirectionalLight is the sun, with real shadows,
// and the sky then only adds soft light. `sunAngle` is the image sun's angle from +Z
// toward +X, used to turn the sky so its bright side faces the real sun.
export async function loadSky(sky = SKY_HDRI) {
  const buffer = await fetchCached(sky.url);
  const loader = new RGBELoader().setDataType(THREE.FloatType);
  const parsed = loader.parse(buffer);
  const { width, height, data } = parsed;
  let best = -1, bestU = 0.5;
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum > best) { best = lum; bestU = (x + 0.5) / width; }
    }
  }
  // Clamp the disc and its glare to the brightest sky level (keeps colour, drops energy).
  const CLAMP = 8;
  for (let i = 0; i < data.length; i += 4) {
    const m = Math.max(data[i], data[i + 1], data[i + 2]);
    if (m > CLAMP) { const k = CLAMP / m; data[i] *= k; data[i + 1] *= k; data[i + 2] *= k; }
  }
  const texture = halfTexture(data, width, height, 1);
  // Lighting copy, mostly desaturated: a room is lit by sky light bounced off walls and
  // floors, not by blue straight from the sky (the raw sky turned interiors blue).
  const lightTexture = halfTexture(data, width, height, 0.3);
  // three's equirect lookup: u = atan(dir.z, dir.x) / 2π + 0.5.
  const phi = (bestU - 0.5) * 2 * Math.PI;
  const sunAngle = Math.atan2(Math.cos(phi), Math.sin(phi)); // atan2(x, z)
  return { texture, lightTexture, sunAngle };
}

// Half float: linear filtering of full float textures is optional in WebGL2 (iOS Safari
// lacks it: Hypothesis), half float filtering is core. `saturation` 1 keeps the colours.
function halfTexture(data, width, height, saturation) {
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    for (let c = 0; c < 3; c++) {
      half[i + c] = THREE.DataUtils.toHalfFloat(Math.min(65000, lum + (data[i + c] - lum) * saturation));
    }
    half[i + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const texture = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}
