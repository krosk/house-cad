// View 3D "Realistic" setting (docs/realism.md): the real sun for a time of day, a
// photographed sky for ambient light and reflections, and ambient occlusion. Desktop
// only; the AR session never uses any of it.
import * as THREE from 'three';
import { loadSkyPixels } from './textureWorker.js';

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
// HDRI → { texture (equirect, sun removed), lightTexture, sunAngle }. The photographed sun
// is found (brightest pixel) and clamped out: the DirectionalLight is the sun, with real
// shadows, and the sky then only adds soft light. `sunAngle` is the image sun's angle from
// +Z toward +X, used to turn the sky so its bright side faces the real sun. The download,
// parse and pixel work run in the texture worker (textureWorker.js `loadSkyPixels`).
export async function loadSky(sky = SKY_HDRI) {
  const { width, height, texture, light, sunAngle } = await loadSkyPixels(sky.url);
  return { texture: halfTexture(texture, width, height), lightTexture: halfTexture(light, width, height), sunAngle };
}

function halfTexture(half, width, height) {
  const texture = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}
