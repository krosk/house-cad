// A generic daylight exterior for window glass in the AR 3D view (owner, 2026-09-27: the
// passthrough seen through see-through glass spoiled the model-only view). Procedural,
// seeded, drawn once: a sky gradient with soft clouds, a distant tree line and a lawn.
// One picture per pane face (BoxGeometry UVs span 0..1 on each face); an unlit material,
// so it reads as bright outdoor light whatever the room's lighting.

import * as THREE from 'three';
import { paintedTexture } from './paintedTexture.js';

const SIZE = 512;
const HORIZON = 0.58; // from the top of the picture

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Painter (painters.js, run in the texture worker).
export function paintExterior(ctx) {
  const r = rng(20260927), H = SIZE * HORIZON;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#8fbfe6');
  sky.addColorStop(1, '#dcebf5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, H);
  // Soft clouds: clusters of translucent white ellipses in the upper sky.
  for (let c = 0; c < 5; c++) {
    const cx = r() * SIZE, cy = (0.08 + r() * 0.3) * SIZE, w = (0.12 + r() * 0.14) * SIZE;
    for (let k = 0; k < 7; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.18 + r() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(cx + (r() - 0.5) * w, cy + (r() - 0.5) * w * 0.18, w * (0.2 + r() * 0.25), w * (0.08 + r() * 0.08), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Lawn below the horizon, lighter toward the viewer.
  const lawn = ctx.createLinearGradient(0, H, 0, SIZE);
  lawn.addColorStop(0, '#7f9f5a');
  lawn.addColorStop(1, '#9dbb6e');
  ctx.fillStyle = lawn;
  ctx.fillRect(0, H, SIZE, SIZE - H);
  // Distant tree line: overlapping rounded crowns in a few greens, sitting on the horizon.
  const greens = ['#4f6b3c', '#5b7a44', '#476236', '#65854b'];
  for (let k = 0; k < 70; k++) {
    const x = r() * SIZE, rad = (0.025 + r() * 0.05) * SIZE, y = H - rad * (0.3 + r() * 0.9);
    ctx.fillStyle = greens[k % greens.length];
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // Trunk-line shadow where the trees meet the lawn.
  ctx.fillStyle = 'rgba(40,55,30,0.35)';
  ctx.fillRect(0, H - 2, SIZE, 5);
}

let material = null;
// The shared glass material (cached, never disposed).
export function exteriorGlassMaterial() {
  if (material) return material;
  const map = paintedTexture('exterior', null, SIZE, SIZE, { wrap: THREE.ClampToEdgeWrapping, placeholder: 0xb7d3e8 });
  material = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
  return material;
}
