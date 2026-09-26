// Canvas textures for surface-finish materials (docs/materials.md, phase 2). One
// texture per material draws ONE repeat unit of its pattern; the finish geometry's UVs
// are plan metres, so `repeat` = 1 / unit size lays the pattern at true scale, anchored
// at the plan origin. Pure drawing from the catalog entry, no network/assets, so View
// 3D and (later) the AR 3D view share it.
//
// The plank texture is a representative 1/3 stagger, not the takeoff's cut plan: the
// count comes from src/core/flooring.js, the picture only shows the product.

import * as THREE from 'three';

const css = (hex) => `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
const GROUT = 0xcbd5e1;

// Repeat unit (metres) of a pattern.
export function patternUnit(m) {
  const px = m.w + (m.joint || 0), py = m.h + (m.joint || 0);
  if (m.pattern === 'stagger') return [m.w, 3 * py];
  if (m.pattern === 'brick') return [px, 2 * py];
  return [px, py];
}

function shade(hex, f) {
  const c = new THREE.Color(hex).multiplyScalar(f);
  return `#${c.getHexString()}`;
}

function paintUnit(ctx, m, W, H, ppm) {
  const jp = Math.max(1.5, (m.joint || 0) * ppm); // joint in px, never invisible
  if (m.pattern === 'stagger') {
    const rowH = H / 3;
    ctx.fillStyle = css(m.accent);
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < 3; r++) {
      const off = (W * r) / 3;
      for (const x of [off - W, off]) {
        ctx.fillStyle = shade(m.color, 0.92 + 0.08 * ((r * 7 + (x > 0 ? 3 : 0)) % 3) / 2);
        ctx.fillRect(x + 0.75, r * rowH + 0.75, W - 1.5, rowH - 1.5);
        // light grain
        ctx.strokeStyle = shade(m.color, 0.85);
        ctx.lineWidth = 1;
        for (let g = 1; g < 4; g++) {
          const y = r * rowH + (rowH * g) / 4;
          ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + W - 4, y + (g % 2 ? 1.5 : -1.5)); ctx.stroke();
        }
      }
    }
    return;
  }
  if (m.pattern === 'octagon') {
    ctx.fillStyle = css(GROUT);
    ctx.fillRect(0, 0, W, H);
    const c = (m.w / (2 + Math.SQRT2)) * ppm; // chamfer leg = cabochon half-diagonal
    ctx.fillStyle = css(m.accent);
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const k = Math.max(0, c - jp / 2);
      ctx.beginPath();
      ctx.moveTo(x - k, y); ctx.lineTo(x, y - k); ctx.lineTo(x + k, y); ctx.lineTo(x, y + k);
      ctx.closePath(); ctx.fill();
    }
    const i = jp / 2, s = c;
    ctx.fillStyle = css(m.color);
    ctx.beginPath();
    ctx.moveTo(i + s, i); ctx.lineTo(W - i - s, i); ctx.lineTo(W - i, i + s); ctx.lineTo(W - i, H - i - s);
    ctx.lineTo(W - i - s, H - i); ctx.lineTo(i + s, H - i); ctx.lineTo(i, H - i - s); ctx.lineTo(i, i + s);
    ctx.closePath(); ctx.fill();
    return;
  }
  // grid / brick: grout background, inset tiles
  ctx.fillStyle = css(m.accent ?? GROUT);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = css(m.color);
  if (m.pattern === 'brick') {
    const rowH = H / 2;
    ctx.fillRect(jp / 2, jp / 2, W - jp, rowH - jp);
    for (const x of [-W / 2, W / 2]) ctx.fillRect(x + jp / 2, rowH + jp / 2, W - jp, rowH - jp);
  } else {
    ctx.fillRect(jp / 2, jp / 2, W - jp, H - jp);
  }
}

// → { map, repeat: [ru, rv] } or null for untextured (paint) materials.
export function finishTexture(m, anisotropy = 1) {
  if (!m || m.pattern === 'paint' || !(m.w > 0 && m.h > 0)) return null;
  const [uw, uh] = patternUnit(m);
  const ppm = 512 / Math.max(uw, uh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(uw * ppm));
  canvas.height = Math.max(8, Math.round(uh * ppm));
  paintUnit(canvas.getContext('2d'), m, canvas.width, canvas.height, ppm);
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / uw, 1 / uh);
  map.anisotropy = anisotropy;
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
