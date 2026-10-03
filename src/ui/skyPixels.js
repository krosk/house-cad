// The sky's pixel work for View 3D Realistic (docs/realism.md): runs in the texture worker
// (textures.worker.js), or on the page as a fallback. realism.js wraps the result.
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { fetchCached } from './imageCache.js';

// Worker side: { width, height, texture, light (half-float RGBA Uint16Arrays), sunAngle }.
export async function skyPixels(url) {
  const buffer = await fetchCached(url);
  const loader = new RGBELoader().setDataType(THREE.FloatType);
  const { width, height, data } = loader.parse(buffer);
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
  // three's equirect lookup: u = atan(dir.z, dir.x) / 2π + 0.5.
  const phi = (bestU - 0.5) * 2 * Math.PI;
  return {
    width, height,
    texture: halfData(data, 1),
    // Lighting copy, mostly desaturated: a room is lit by sky light bounced off walls and
    // floors, not by blue straight from the sky (the raw sky turned interiors blue).
    light: halfData(data, 0.3),
    sunAngle: Math.atan2(Math.cos(phi), Math.sin(phi)), // atan2(x, z)
  };
}

// Half float: linear filtering of full float textures is optional in WebGL2 (iOS Safari
// lacks it: Hypothesis), half float filtering is core. `saturation` 1 keeps the colours.
function halfData(data, saturation) {
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    for (let c = 0; c < 3; c++) {
      half[i + c] = THREE.DataUtils.toHalfFloat(Math.min(65000, lum + (data[i + c] - lum) * saturation));
    }
    half[i + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  return half;
}

