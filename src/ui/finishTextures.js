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

// Product designs (docs/materials.md "Flooring products"): a `design` on a plank
// material swaps the generic stagger for a drawn product look over a larger unit
// (DESIGN_PER_ROW planks per row, DESIGN_ROWS rows, so the repeat is hard to spot).
const DESIGN_ROWS = 10, DESIGN_PER_ROW = 3;

// Repeat unit (metres) of a pattern.
export function patternUnit(m) {
  const px = m.w + (m.joint || 0), py = m.h + (m.joint || 0);
  if (m.pattern === 'stagger' && DESIGNS[m.design]) return [DESIGN_PER_ROW * m.w, DESIGN_ROWS * py];
  if (m.pattern === 'stagger') return [m.w, 3 * py];
  if (m.pattern === 'brick') return [px, 2 * py];
  return [px, py];
}

function shade(hex, f) {
  const c = new THREE.Color(hex).multiplyScalar(f);
  return `#${c.getHexString()}`;
}

// Tiny deterministic PRNG so a design looks the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Natural oak, rustic ("charme") grade, tuned against the product's top-down photo:
// mild per-plank tone, fine broken grain with the odd small flame, clusters of dark
// pin knots and some larger knots with a swirl, V-bevelled long edges (a thin dark
// groove) and plain butt ends. `m.bevel` = bevel width (m) on the long edges.
function oakPlank(ctx, m, x, y, w, h, ppm, r) {
  const base = new THREE.Color(m.color).multiplyScalar(0.84 + r() * 0.26)
    .lerp(new THREE.Color(r() < 0.8 ? 0xb4a288 : 0xc9a574), r() * 0.3); // greyer, sometimes warmer
  const dark = new THREE.Color(m.accent);
  const mix = (f, a) => { ctx.globalAlpha = a; return `#${base.clone().lerp(dark, f).getHexString()}`; };
  const light = (a) => { ctx.globalAlpha = a; return `#${base.clone().lerp(new THREE.Color(0xf3e6d2), 0.5).getHexString()}`; };
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(x, y, w, h);
  // Soft tone bands along the plank.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = r() < 0.6 ? mix(0.35, 0.08 + r() * 0.1) : light(0.08 + r() * 0.08);
    ctx.beginPath();
    ctx.ellipse(x + r() * w, y + r() * h, w * (0.15 + r() * 0.35), (0.008 + r() * 0.03) * ppm, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine broken grain: many wavy fragments of varying length along the plank.
  const wavy = (u0, v0, len, amp, per, ph) => {
    ctx.beginPath();
    for (let u = 0; u <= len; u += 4) {
      const yy = v0 + Math.sin((u / per) * 6.28 + ph) * amp;
      u ? ctx.lineTo(u0 + u, yy) : ctx.moveTo(u0, yy);
    }
    ctx.stroke();
  };
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = r() < 0.8 ? mix(0.4 + r() * 0.4, 0.2 + r() * 0.28) : light(0.15 + r() * 0.15);
    ctx.lineWidth = 0.6 + r() * 1.2;
    wavy(x + (r() * 1.2 - 0.2) * w, y + r() * h, (0.08 + r() * 0.5) * ppm,
      (0.0005 + r() * 0.003) * ppm, (0.05 + r() * 0.25) * ppm, r() * 6);
  }
  // Occasional small flame (flat-sawn figure): a few nested, broken parabolas.
  if (r() < 0.55) {
    const tip = x + r() * w, cy = y + (0.2 + r() * 0.6) * h, dir = r() < 0.5 ? 1 : -1;
    let spread = (0.002 + r() * 0.004) * ppm;
    for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
      const len = spread * (5 + r() * 6), t = tip + dir * k * (0.005 + r() * 0.01) * ppm;
      ctx.strokeStyle = mix(0.55 + r() * 0.3, 0.28 + r() * 0.22);
      ctx.lineWidth = 1 + r() * 1.5;
      ctx.setLineDash([(0.02 + r() * 0.06) * ppm, (0.004 + r() * 0.01) * ppm]);
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const v = -1.2 + (2.4 * i) / 20;
        const u = t - dir * len * v * v;
        i ? ctx.lineTo(u, cy + v * spread) : ctx.moveTo(u, cy + v * spread);
      }
      ctx.stroke();
      spread += (0.003 + r() * 0.006) * ppm;
    }
    ctx.setLineDash([]);
  }
  // Knots: clusters of dark pin knots; sometimes one larger knot with a pale halo
  // and grain swirling round it.
  const pin = (kx, ky, kr) => {
    ctx.fillStyle = mix(0.6, 0.35);
    ctx.beginPath(); ctx.ellipse(kx, ky, kr * 1.8, kr * 1.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#3b2717';
    ctx.beginPath(); ctx.ellipse(kx, ky, kr, kr * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2); ctx.fill();
  };
  const clusters = r() < 0.65 ? 1 + Math.floor(r() * 2) : 0;
  for (let c = 0; c < clusters; c++) {
    const cx = x + r() * w, cy = y + (0.15 + r() * 0.7) * h;
    for (let i = 0, n = 1 + Math.floor(r() * 4); i < n; i++) {
      pin(cx + (r() - 0.5) * 0.05 * ppm, cy + (r() - 0.5) * 0.035 * ppm, (0.0015 + r() * 0.003) * ppm);
    }
  }
  if (r() < 0.22) {
    const kx = x + (0.1 + r() * 0.8) * w, ky = y + (0.25 + r() * 0.5) * h, kr = (0.004 + r() * 0.005) * ppm;
    for (let k = 4; k >= 1; k--) {
      ctx.strokeStyle = mix(0.55, 0.22);
      ctx.lineWidth = 1 + r();
      ctx.beginPath(); ctx.ellipse(kx, ky, kr * (1.5 + k * 1.6), kr * (1.2 + k * 0.9), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = light(0.25);
    ctx.beginPath(); ctx.ellipse(kx, ky, kr * 2, kr * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    pin(kx, ky, kr);
  }
  // Edges: V-bevel on the long sides (a thin dark groove), a hairline at the ends.
  const bev = Math.max(1.5, (m.bevel ?? 0) * ppm);
  if (m.bevel) {
    ctx.fillStyle = mix(0.75, 0.9);
    ctx.fillRect(x, y, w, bev * 0.6);
    ctx.fillStyle = mix(0.45, 0.6);
    ctx.fillRect(x, y + h - bev * 0.6, w, bev * 0.6);
  }
  ctx.fillStyle = mix(0.8, 0.7);
  ctx.fillRect(x, y, 1, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

const DESIGNS = { 'oak-rustic': oakPlank };

// DESIGN_PER_ROW planks per row; each row's joints at its own random offset. A plank that
// crosses the unit's right edge is drawn again at the left, so the unit tiles.
function paintDesign(ctx, m, W, H, ppm) {
  const r = rng(m.seed ?? 29);
  const L = W / DESIGN_PER_ROW, rowH = H / DESIGN_ROWS;
  let prev = -1;
  for (let row = 0; row < DESIGN_ROWS; row++) {
    let off;
    do off = r() * L; while (prev >= 0 && Math.abs(off - prev) < 0.2 * L);
    prev = off;
    for (let k = 0; k < DESIGN_PER_ROW; k++) {
      const x = off + k * L, s = Math.floor(r() * 1e9);
      for (const dx of [0, -W]) DESIGNS[m.design](ctx, m, x + dx, row * rowH, L, rowH, ppm, rng(s));
    }
  }
}

function paintUnit(ctx, m, W, H, ppm) {
  if (m.pattern === 'stagger' && DESIGNS[m.design]) return paintDesign(ctx, m, W, H, ppm);
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
  const ppm = (DESIGNS[m.design] ? 2048 : 512) / Math.max(uw, uh);
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
