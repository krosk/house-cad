// Canvas textures for surface-finish materials (docs/materials.md, phase 2). One
// texture per material draws ONE repeat unit of its pattern; the finish geometry's UVs
// are plan metres, so `repeat` = 1 / unit size lays the pattern at true scale, anchored
// at the plan origin. Pure drawing from the catalog entry, no network/assets, so View
// 3D and (later) the AR 3D view share it.
//
// The plank texture is a representative 1/3 stagger, not the takeoff's cut plan: the
// count comes from src/core/flooring.js, the picture only shows the product.

import * as THREE from 'three';
import { pinwheelCells, pinwheelPitch, steppedCells, steppedA, steppedB } from '../core/flooring.js';

// A canvas on the page, or an OffscreenCanvas in the texture worker (textures.worker.js),
// so the same painters run off the main thread. Callers set width and height.
const newCanvas = () => (typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1));
const css = (hex) => `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
const GROUT = 0xcbd5e1;

// Product designs (docs/materials.md "Flooring products"): a `design` on a plank
// material swaps the generic stagger for a drawn product look over a larger unit
// (DESIGN_PER_ROW planks per row, DESIGN_ROWS rows, so the repeat is hard to spot).
const DESIGN_ROWS = 10, DESIGN_PER_ROW = 3;
// Brick-bond tile designs: BRICK_COLS tiles per row, BRICK_ROWS rows, rows offset by half.
const BRICK_COLS = 4, BRICK_ROWS = 8;
// Mosaic-sheet designs (grid pattern, piece = one sheet): GRID_SHEETS × GRID_SHEETS sheets
// (`m.sheets` overrides it: fewer, larger-scale pieces keep small detail sharp).
const GRID_SHEETS = 3;
const gridSheets = (m) => m.sheets || GRID_SHEETS;
// Octagon + tozzetto designs: OCT_CELLS × OCT_CELLS octagons (tone varies per tile).
const OCT_CELLS = 4;
// Pinwheel designs: PINWHEEL_MODULES × PINWHEEL_MODULES modules of nine tiles (`m.modules`
// overrides it), so 36 different faces before the picture repeats.
const PINWHEEL_MODULES = 2;
const pinwheelModules = (m) => m.modules || PINWHEEL_MODULES;
// Stepped designs: STEPPED_CELLS × STEPPED_CELLS lattice cells (one module each, so 45
// different faces) in one square canvas, sheared back onto the plan by the texture matrix.
const STEPPED_CELLS = 3;
const hasDesign = (m) => (m.pattern === 'stagger' && !!DESIGNS[m.design])
  || (m.pattern === 'brick' && !!BRICK_DESIGNS[m.design])
  || (m.pattern === 'grid' && !!GRID_DESIGNS[m.design])
  || (m.pattern === 'octagon' && !!OCT_DESIGNS[m.design])
  || (m.pattern === 'pinwheel' && !!PINWHEEL_DESIGNS[m.design])
  || (m.pattern === 'stepped' && !!PINWHEEL_DESIGNS[m.design]);

// Repeat unit (metres) of a pattern. A `diagonal` octagon draws its straight unit turned
// 45°: that repeats along plan x and y every √2 × the straight unit.
export function patternUnit(m) {
  if (m.pattern === 'octagon' && m.diagonal) return straightUnit(m).map((u) => u * Math.SQRT2);
  // Stepped: the texture repeats along the oblique lattice, not x/y (steppedTexture); its
  // nominal unit = STEPPED_CELLS cells of the lattice's mean pitch (√det), for the detail layer.
  if (m.pattern === 'stepped') return [STEPPED_CELLS * steppedPitch(), STEPPED_CELLS * steppedPitch()];
  return straightUnit(m);
}
function straightUnit(m) {
  const px = m.w + (m.joint || 0), py = m.h + (m.joint || 0);
  if (m.pattern === 'stagger' && DESIGNS[m.design]) return [DESIGN_PER_ROW * m.w, DESIGN_ROWS * py];
  if (m.pattern === 'brick' && BRICK_DESIGNS[m.design]) return [BRICK_COLS * px, BRICK_ROWS * py];
  if (m.pattern === 'grid' && GRID_DESIGNS[m.design]) return [gridSheets(m) * px, gridSheets(m) * py];
  if (m.pattern === 'octagon' && OCT_DESIGNS[m.design]) return [OCT_CELLS * px, OCT_CELLS * py];
  if (m.pattern === 'pinwheel') {
    const u = pinwheelPitch(m) * (PINWHEEL_DESIGNS[m.design] ? pinwheelModules(m) : 1);
    return [u, u];
  }
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

// Glossy handmade-look wall tile ("carreaux anciens"): slightly wavy edges, tiny tone
// differences, a soft glaze ripple, and a thin grey shadow where the rounded edge meets
// the joint. `bump` draws the matching height map instead (grout low, tile high, edges
// rounding down, glaze ripples), which gives the rippled gloss highlights in View 3D.
function glossTile(ctx, m, x, y, w, h, ppm, r, bump) {
  const wob = (m.edgeWobble ?? 0.0006) * ppm;
  // Outline: each edge wanders a little, through a few random control points.
  const edge = (x0, y0, x1, y1, nx, ny) => {
    const pts = [];
    const k = 5, amp = [0, ...Array.from({ length: k - 1 }, () => (r() - 0.5) * 2 * wob), 0];
    for (let i = 0; i <= k; i++) pts.push([x0 + ((x1 - x0) * i) / k + nx * amp[i], y0 + ((y1 - y0) * i) / k + ny * amp[i]]);
    return pts;
  };
  const outline = [
    ...edge(x, y, x + w, y, 0, 1), ...edge(x + w, y, x + w, y + h, -1, 0).slice(1),
    ...edge(x + w, y + h, x, y + h, 0, -1).slice(1), ...edge(x, y + h, x, y, 1, 0).slice(1, -1),
  ];
  const path = () => {
    ctx.beginPath();
    outline.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
  };
  // Glaze ripples: long, gentle waves along the tile (the glaze pools unevenly), drawn
  // as elongated blobs and heavily blurred so they read as smooth undulation.
  const ripples = (lightCss, darkCss, alpha) => {
    ctx.filter = `blur(${Math.max(2, 0.006 * ppm)}px)`;
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = alpha * (0.5 + r());
      ctx.fillStyle = r() < 0.5 ? lightCss : darkCss;
      ctx.beginPath();
      ctx.ellipse(x + r() * w, y + r() * h, (0.08 + r() * 0.25) * w, (0.12 + r() * 0.25) * h, (r() - 0.5) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  };
  ctx.save();
  path(); ctx.clip();
  if (bump) {
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(x, y, w, h);
    ripples('#ffffff', '#6a6a6a', 0.35);
    // Rounded edge: a blurred dark rim just inside the outline.
    ctx.filter = `blur(${Math.max(1, 0.0015 * ppm)}px)`;
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 0.004 * ppm;
    path(); ctx.stroke();
    ctx.filter = 'none';
  } else {
    // White on white: the colour layer stays nearly flat; the look comes from the bump
    // map + gloss. Only a faint edge shade, for the AR view (no bump there).
    const base = new THREE.Color(m.color).multiplyScalar(0.99 + r() * 0.015);
    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(x, y, w, h);
    ctx.filter = `blur(${Math.max(1, 0.001 * ppm)}px)`;
    ctx.strokeStyle = `#${base.clone().multiplyScalar(0.8).getHexString()}`;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 0.0022 * ppm;
    path(); ctx.stroke();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

const BRICK_DESIGNS = { 'handmade-gloss': glossTile };

// Brick bond: each row offset by half a tile; tiles crossing the right edge are drawn
// again at the left so the unit tiles. Grout is `m.accent` (colour) / low (bump).
function paintBrickDesign(ctx, m, W, H, ppm, bump) {
  const r = rng(m.seed ?? 41);
  const pw = W / BRICK_COLS, ph = H / BRICK_ROWS, jp = (m.joint || 0) * ppm;
  ctx.fillStyle = bump ? '#5a5a5a' : css(m.accent); // grout: a shallow recess
  ctx.fillRect(0, 0, W, H);
  for (let row = 0; row < BRICK_ROWS; row++) {
    const off = row % 2 ? pw / 2 : 0;
    for (let k = 0; k < BRICK_COLS; k++) {
      const x = off + k * pw, s = Math.floor(r() * 1e9);
      for (const dx of x + pw > W ? [0, -W] : [0]) {
        BRICK_DESIGNS[m.design](ctx, m, x + dx + jp / 2, row * ph + jp / 2, pw - jp, ph - jp, ppm, rng(s), bump);
      }
    }
  }
}

// Honed stone stick (mosaic): a mid grey with per-stick tone, soft mottling, patches of
// fine diagonal saw/polish scuffs, faint hairline veins, the odd white calcite vein across
// the stick, and slightly tumbled edges. `bump` draws the height map (grout low, stone
// high, edges rounding down), which is what makes the joints read as recessed.
function stoneStick(ctx, m, x, y, w, h, ppm, r, bump) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (bump) {
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(x, y, w, h);
    ctx.filter = `blur(${Math.max(1, 0.001 * ppm)}px)`;
    ctx.strokeStyle = '#6a6a6a';
    ctx.lineWidth = 0.0016 * ppm;
    ctx.strokeRect(x, y, w, h);
    ctx.filter = 'none';
    ctx.restore();
    return;
  }
  const base = new THREE.Color(m.color).multiplyScalar(0.88 + r() * 0.24);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(x, y, w, h);
  const hex = (f) => `#${base.clone().multiplyScalar(f).getHexString()}`;
  // Mottling: big soft blobs a little lighter or darker.
  ctx.filter = `blur(${Math.max(2, 0.006 * ppm)}px)`;
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.2 + r() * 0.2;
    ctx.fillStyle = hex(r() < 0.5 ? 1.3 : 0.75);
    ctx.beginPath();
    ctx.ellipse(x + r() * w, y + r() * h, (0.1 + r() * 0.25) * w, (0.4 + r() * 0.6) * h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = 'none';
  // Scuff patches: bunches of fine light lines at a shared diagonal angle.
  const lw = Math.max(0.6, 0.00025 * ppm);
  for (let p = r() < 0.85 ? 1 + Math.floor(r() * 3) : 0; p > 0; p--) {
    const cx = x + r() * w, a = (r() < 0.5 ? -1 : 1) * (0.2 + r() * 0.4), len = (0.2 + r() * 0.35) * w;
    ctx.strokeStyle = hex(1.8);
    ctx.lineWidth = lw;
    for (let k = 0; k < 24; k++) {
      const ox = cx + (r() - 0.5) * 0.3 * w, oy = y + r() * h, l = len * (0.3 + r() * 0.7);
      ctx.globalAlpha = 0.06 + r() * 0.16;
      ctx.beginPath();
      ctx.moveTo(ox - Math.cos(a) * l / 2, oy - Math.sin(a) * l / 2);
      ctx.lineTo(ox + Math.cos(a) * l / 2, oy + Math.sin(a) * l / 2);
      ctx.stroke();
    }
  }
  // Hairline veins: a thin wandering light line.
  for (let v = r() < 0.6 ? 1 + Math.floor(r() * 2) : 0; v > 0; v--) {
    ctx.strokeStyle = hex(1.8);
    ctx.lineWidth = lw * 1.3;
    ctx.globalAlpha = 0.3 + r() * 0.3;
    let px = x + r() * w, py = y + (r() < 0.5 ? 0 : h);
    const dx = (r() - 0.5) * 2, dy = py === y ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += (dx + (r() - 0.5)) * h * 0.4; py += dy * h * (0.1 + r() * 0.25);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // Calcite vein: a white band straight across the stick (about one stick in seven).
  if (r() < (m.veinRate ?? 0.14)) {
    const vx = x + (0.1 + r() * 0.8) * w, lean = (r() - 0.5) * 0.25 * h, vw = (0.0012 + r() * 0.001) * ppm;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#d6d4d0';
    ctx.beginPath();
    ctx.moveTo(vx - vw / 2, y); ctx.lineTo(vx + vw / 2, y);
    ctx.lineTo(vx + lean + vw * (0.3 + r() * 0.5), y + h); ctx.lineTo(vx + lean - vw * (0.3 + r() * 0.5), y + h);
    ctx.closePath(); ctx.fill();
  }
  // Pits: a few tiny light and dark specks.
  for (let k = 0; k < 10; k++) {
    ctx.globalAlpha = 0.3 + r() * 0.3;
    ctx.fillStyle = hex(r() < 0.5 ? 1.5 : 0.6);
    ctx.fillRect(x + r() * w, y + r() * h, lw * 1.5, lw * 1.5);
  }
  // Tumbled edge: a soft dark rim.
  ctx.globalAlpha = 0.7;
  ctx.filter = `blur(${Math.max(1, 0.0008 * ppm)}px)`;
  ctx.strokeStyle = hex(0.65);
  ctx.lineWidth = 0.0012 * ppm;
  ctx.strokeRect(x, y, w, h);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Polished marble-chip terrazzo tile (the owner's 8 × 8 cm sample, 2026-09-27): crushed
// marble chips in an off-white cement, cut flat and polished. Chip sizes and share of
// the face were measured on the sample at ~15 px/mm; colours are `m.chips`
// ([hex, weight] pairs) over the cement `m.color`. Large chips go down first and later
// ones skip spots already taken, so chips sit apart in cement as in the sample.
const TERRAZZO_CHIPS = [ // [min, max] size in mm, share of the tile face
  [6, 13, 0.34],
  [3, 6, 0.2],
  [1, 3, 0.12],
];
function terrazzoTile(ctx, m, x, y, w, h, ppm, r, bump) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (bump) { // polished flat: only the joint (drawn by the caller) reads as low
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  ctx.fillStyle = css(m.color);
  ctx.fillRect(x, y, w, h);
  const mm = ppm / 1000;
  const palette = m.chips || [[0xcfc3b0, 1]];
  const total = palette.reduce((a, [, k]) => a + k, 0);
  const pick = () => {
    let t = r() * total;
    for (const [hex, k] of palette) if ((t -= k) <= 0) return hex;
    return palette[0][0];
  };
  // Occupancy grid (1 mm cells) so chips mostly don't overlap.
  const cell = 1 * mm, gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1;
  const taken = new Uint8Array(gw * gh);
  const free = (cx, cy, rad) => {
    const i0 = Math.max(0, Math.floor((cx - x - rad) / cell)), i1 = Math.min(gw - 1, Math.floor((cx - x + rad) / cell));
    const j0 = Math.max(0, Math.floor((cy - y - rad) / cell)), j1 = Math.min(gh - 1, Math.floor((cy - y + rad) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (taken[j * gw + i]) return false;
    return true;
  };
  const mark = (cx, cy, rad) => {
    const i0 = Math.max(0, Math.floor((cx - x - rad) / cell)), i1 = Math.min(gw - 1, Math.floor((cx - x + rad) / cell));
    const j0 = Math.max(0, Math.floor((cy - y - rad) / cell)), j1 = Math.min(gh - 1, Math.floor((cy - y + rad) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) taken[j * gw + i] = 1;
  };
  const face = (w / mm) * (h / mm);
  for (const [lo, hi, share] of TERRAZZO_CHIPS) {
    let area = 0, tries = 0;
    const target = face * share;
    while (area < target && tries++ < target) {
      const d = lo + (hi - lo) * r() ** 1.6; // more small than large within a class
      const cx = x + r() * w, cy = y + r() * h, rad = (d / 2) * mm;
      // Small chips may nestle closer: test a shrunken footprint.
      if (!free(cx, cy, rad * (lo < 3 ? 0.3 : 0.6))) continue;
      // Angular crushed chip: 4–7 corners, stretched and turned.
      const n = 4 + Math.floor(r() * 4), rot = r() * Math.PI, stretch = 1 + r() * 0.8;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / n);
        const rr = rad * (0.55 + r() * 0.45);
        const px = Math.cos(a) * rr * stretch, py = Math.sin(a) * rr / stretch;
        pts.push([cx + px * Math.cos(rot) - py * Math.sin(rot), cy + px * Math.sin(rot) + py * Math.cos(rot)]);
      }
      let poly = 0; // shoelace area, px²
      pts.forEach(([ax, ay], k) => { const [bx, by] = pts[(k + 1) % n]; poly += ax * by - bx * ay; });
      area += Math.abs(poly) / 2 / (mm * mm);
      mark(cx, cy, rad * 0.75);
      const base = new THREE.Color(pick()).multiplyScalar(0.92 + r() * 0.14);
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      if (lo >= 7) { // large chips: a soft tone drift across the stone
        const a = r() * Math.PI * 2;
        const g = ctx.createLinearGradient(cx - Math.cos(a) * rad, cy - Math.sin(a) * rad, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        g.addColorStop(0, `#${base.clone().multiplyScalar(1.06).getHexString()}`);
        g.addColorStop(1, `#${base.clone().multiplyScalar(0.9).getHexString()}`);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = `#${base.getHexString()}`;
      }
      ctx.fill();
      if (lo >= 3 && r() < 0.25) { // a faint grey vein through some chips
        ctx.save(); ctx.clip();
        ctx.strokeStyle = `#${base.clone().multiplyScalar(0.72).getHexString()}`;
        ctx.globalAlpha = 0.35 + r() * 0.3;
        ctx.lineWidth = Math.max(0.6, 0.25 * mm);
        const a = r() * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * rad, cy - Math.sin(a) * rad);
        ctx.quadraticCurveTo(cx + (r() - 0.5) * rad, cy + (r() - 0.5) * rad, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  // Sand in the cement: fine grey and white specks.
  const specks = Math.round(face * 0.02);
  for (let k = 0; k < specks; k++) {
    ctx.globalAlpha = 0.25 + r() * 0.35;
    ctx.fillStyle = r() < 0.6 ? '#9c978c' : '#ffffff';
    const s = Math.max(0.7, (0.2 + r() * 0.3) * mm);
    ctx.fillRect(x + r() * w, y + r() * h, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Fine ivory limestone on a satin glazed wall tile (Leroy Merlin Lucia ivoire 30 × 90,
// tuned against its straight tile photo, media 3907316): a pale ground (`m.color`, per-tile
// tone), faint grey clouds (`m.cloud`), dense small grey-beige flecks (`m.fleck`), many
// elongated, gathered where the cloud is, a few rust flecks (`m.rust`) and the odd hairline
// vein. Rectified and smooth: the bump map is flat, only the joint reads low.
function limestoneTile(ctx, m, x, y, w, h, ppm, r, bump) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (bump) {
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  const mm = ppm / 1000;
  ctx.fillStyle = `#${new THREE.Color(m.color).multiplyScalar(0.975 + r() * 0.04).getHexString()}`;
  ctx.fillRect(x, y, w, h);
  const cloud = stoneField(r, 2 + Math.floor(r() * 2), 0, x, y, w, h, { aspect: true }), { at } = cloud;
  drawStoneCloud(ctx, cloud, x, y, w, h, m.cloud ?? 0xd9d3c8, 0xffffff, [0.5, 0.85, 0.09], [0.4, 0.2, 0.25]);
  const fleck = new THREE.Color(m.fleck ?? 0xb8b0a3), rust = new THREE.Color(m.rust ?? 0xc39a70);
  const n = Math.round((w / mm) * (h / mm) * (m.flecks ?? 0.06));
  for (let k = 0; k < n; k++) {
    const px = x + r() * w, py = y + r() * h;
    if (r() > 0.35 + 0.65 * smooth(0.3, 0.75, at(px, py))) continue;
    const len = (0.4 + r() ** 3 * 3.5) * mm, wid = (0.3 + r() * 0.4) * mm, rot = r() * Math.PI;
    const c = r() < 0.02 ? rust : fleck;
    ctx.globalAlpha = 0.12 + r() * 0.3;
    ctx.fillStyle = `#${c.clone().multiplyScalar(0.85 + r() * 0.3).getHexString()}`;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(rot);
    ctx.fillRect(-len / 2, -wid / 2, Math.max(0.8, len), Math.max(0.8, wid));
    ctx.restore();
  }
  // Hairline veins: 0–2 thin curved grey lines.
  const veins = Math.floor(r() * 3);
  ctx.strokeStyle = css(m.fleck ?? 0xb8b0a3);
  ctx.lineWidth = Math.max(0.6, 0.3 * mm);
  for (let k = 0; k < veins; k++) {
    const x0 = x + r() * w, y0 = y + r() * h, a = r() * Math.PI, L = (50 + r() * 150) * mm;
    ctx.globalAlpha = 0.25 + r() * 0.25;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + Math.cos(a + 0.4) * L / 2, y0 + Math.sin(a + 0.4) * L / 2, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Fine sandy grain over the tile.
  const X = Math.round(x), Y = Math.round(y), W = Math.round(w), H = Math.round(h);
  const img = ctx.getImageData(X, Y, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const f = 1 + (r() - 0.5) * 0.05;
    d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
  }
  ctx.putImageData(img, X, Y);
  ctx.restore();
}

const GRID_DESIGNS = { 'stone-sticks': stoneStick, terrazzo: terrazzoTile, limestone: limestoneTile };

// Mosaic sheets: GRID_SHEETS × GRID_SHEETS sheets, each `m.mosaic` = [cols, rows] sticks,
// all on one even pitch: the joint inside a sheet equals the one between sheets, so a laid
// mosaic shows no sheet edges. Grout is `m.accent` (colour) / low (bump).
function paintGridDesign(ctx, m, W, H, ppm, bump) {
  const r = rng(m.seed ?? 53);
  const [cols, rows] = m.mosaic || [1, 1];
  const n = gridSheets(m), jp = (m.joint || 0) * ppm;
  const cw = W / (n * cols), ch = H / (n * rows); // stick pitch
  ctx.fillStyle = bump ? '#5a5a5a' : css(m.accent);
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < n * cols; i++) {
    for (let k = 0; k < n * rows; k++) {
      const s = Math.floor(r() * 1e9);
      GRID_DESIGNS[m.design](ctx, m, i * cw + jp / 2, k * ch + jp / 2, cw - jp, ch - jp, ppm, rng(s), bump);
    }
  }
}

// Matte through-body porcelain piece (Etruria HEX): one flat colour per piece with a
// slight tone shift, faint clouding, and a soft rounded edge. `pts` = the outline (px).
// The fine sandy grain is added over the whole unit afterwards (grainPass).
function porcelainPiece(ctx, hex, pts, ppm, r, bump) {
  const path = () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  ctx.save();
  path(); ctx.clip();
  const base = new THREE.Color(hex).multiplyScalar(bump ? 1 : 0.95 + r() * 0.1);
  const fill = bump ? '#b4b4b4' : `#${base.getHexString()}`;
  ctx.fillStyle = fill;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (!bump) {
    // Clouding: a couple of very faint soft blobs.
    ctx.filter = `blur(${Math.max(2, 0.01 * ppm)}px)`;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.05 + r() * 0.06;
      ctx.fillStyle = `#${base.clone().multiplyScalar(r() < 0.5 ? 1.12 : 0.88).getHexString()}`;
      ctx.beginPath();
      ctx.arc(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), (0.2 + r() * 0.3) * (x1 - x0), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Rounded edge: a soft rim darker than the face (colour) / falling away (bump).
  ctx.filter = `blur(${Math.max(1, 0.0008 * ppm)}px)`;
  ctx.globalAlpha = bump ? 1 : 0.55;
  ctx.strokeStyle = bump ? '#6a6a6a' : `#${base.clone().multiplyScalar(0.72).getHexString()}`;
  ctx.lineWidth = 0.0016 * ppm;
  path(); ctx.stroke();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.restore();
}

const OCT_DESIGNS = { 'porcelain-matte': porcelainPiece };

// Fine sandy grain over the whole unit: per-pixel brightness noise plus rare specks.
function grainPass(ctx, W, H, r, amount) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let f = 1 + (r() - 0.5) * amount;
    if (r() < 0.0004) f *= r() < 0.5 ? 0.6 : 1.25;
    d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
  }
  ctx.putImageData(img, 0, 0);
}

// Octagons (`m.color`) with a tozzetto diamond (`m.accent`) at every lattice corner, in
// `m.grout`. Corner diamonds on the unit edge are drawn on both sides with one seed so
// the unit tiles. Gap between a chamfer and its diamond = the joint.
function paintOctDesign(ctx, m, W, H, ppm, bump) {
  const r = rng(m.seed ?? 67);
  const n = OCT_CELLS, px = W / n, py = H / n, jp = (m.joint || 0) * ppm;
  const hw = (m.w * ppm) / 2, c = (m.w / (2 + Math.SQRT2)) * ppm;
  const k = c - jp * (Math.SQRT2 - 1); // tozzetto half-diagonal
  ctx.fillStyle = bump ? '#5a5a5a' : css(m.grout ?? GROUT);
  ctx.fillRect(0, 0, W, H);
  const seeds = Array.from({ length: n * n * 2 }, () => Math.floor(r() * 1e9));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * px, cy = (j + 0.5) * py;
      const oct = [[-hw + c, -hw], [hw - c, -hw], [hw, -hw + c], [hw, hw - c], [hw - c, hw], [-hw + c, hw], [-hw, hw - c], [-hw, -hw + c]]
        .map(([x, y]) => [cx + x, cy + y]);
      OCT_DESIGNS[m.design](ctx, m.color, oct, ppm, rng(seeds[j * n + i]), bump);
    }
  }
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const X = i * px, Y = j * py;
      const dia = [[X, Y - k], [X + k, Y], [X, Y + k], [X - k, Y]];
      OCT_DESIGNS[m.design](ctx, m.accent, dia, ppm, rng(seeds[n * n + (j % n) * n + (i % n)]), bump);
    }
  }
  grainPass(ctx, Math.round(W), Math.round(H), rng((m.seed ?? 67) + 1), bump ? 0.12 : 0.05);
}

// Stone cloud field over one tile: coarse (g1 cells) + medium (11 cells) smoothstep value
// noise plus a little per-cell noise, `bias` shifts it (+ = more cloud). N × N samples and
// cells, stretched over the tile; `aspect` instead keeps them square on a long tile (more
// samples and cells along its long side). `at(px, py)` samples it at a canvas point inside
// the tile (x, y, w, h).
const STONE_N = 48;
const smooth = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function stoneField(r, g1, bias, x, y, w, h, { aspect = false } = {}) {
  const k = aspect ? w / h : 1; // x stretch (< 1 for a tall tile)
  const nx = Math.round(STONE_N * Math.max(1, k)), ny = Math.round(STONE_N * Math.max(1, 1 / k));
  const field = new Float32Array(nx * ny);
  const cells = (g) => [Math.max(1, Math.round(g * Math.max(1, k))), Math.max(1, Math.round(g * Math.max(1, 1 / k)))];
  const grid = ([gx, gy]) => ({ gx, gy, v: Float32Array.from({ length: (gx + 1) * (gy + 1) }, () => r()) });
  const n1 = grid(cells(g1)), n2 = grid(cells(11));
  const lerp2 = ({ gx, gy, v }, u, t) => {
    const X = u * gx, Y = t * gy, i = Math.min(gx - 1, Math.floor(X)), j = Math.min(gy - 1, Math.floor(Y));
    const fx = X - i, fy = Y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => v[b * (gx + 1) + a];
    return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      field[j * nx + i] = 0.62 * lerp2(n1, i / (nx - 1), j / (ny - 1)) + 0.3 * lerp2(n2, i / (nx - 1), j / (ny - 1))
        + 0.08 * r() + bias;
    }
  }
  const at = (px, py) => field[Math.min(ny - 1, Math.floor((py - y) / h * ny)) * nx + Math.min(nx - 1, Math.floor((px - x) / w * nx))];
  return { field, at, nx, ny };
}
// Paint a field as soft clouds: `darkHex` at alpha up to aD over smoothstep(d0, d1), `lightHex`
// up to aL over smoothstep(l0, l1) (l0 > l1: low field = light), from a small canvas scaled up.
function drawStoneCloud(ctx, { field, nx, ny }, x, y, w, h, darkHex, lightHex, [d0, d1, aD], [l0, l1, aL]) {
  const layer = newCanvas();
  layer.width = nx; layer.height = ny;
  const lx = layer.getContext('2d'), img = lx.createImageData(nx, ny);
  const tan = new THREE.Color(darkHex), lt = new THREE.Color(lightHex);
  for (let k = 0; k < nx * ny; k++) {
    const v = field[k], dark = smooth(d0, d1, v), light = smooth(l0, l1, v);
    const c = dark > light ? tan : lt, a = Math.max(dark * aD, light * aL);
    img.data.set([c.r * 255, c.g * 255, c.b * 255, a * 255], k * 4);
  }
  lx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer, x, y, w, h);
}

// Aged limestone-look porcelain with tumbled edges (Leroy Merlin Monastère; tuned against
// the straight photos of its three formats, media 1165024 / 989865 / 1182128, the owner's
// showroom photo of a laid wall, 2026-09-27, and the laid mixed-format render 4237191): a
// greige face (`m.color`, per-tile tone) with soft darker tan clouds (`m.accent`) and lighter
// patches (`m.light`), small brown pits (`m.pit`) gathered in the clouds with a few rust ones
// (`m.rust`), white crackle veins on some tiles, and a wavy outline with rounded corners and
// the odd chip (`m.edgeWobble` m, inward only so the joint never closes). Bump: a pillowed
// edge (the face rolls down over ~12 mm to the joint), pits low.
function agedStone(ctx, m, x, y, w, h, ppm, r, bump) {
  const mm = ppm / 1000, wob = (m.edgeWobble ?? 0.003) * ppm;
  // Outline, clockwise from the top-left: each corner a quarter arc of its own radius
  // (5–11 mm), each side walked in ~6 mm steps and inset by two slow waves plus the odd
  // chip; the wave fades in over 10 mm from each arc so the outline stays continuous.
  const rad = [0, 1, 2, 3].map(() => (5 + r() * 6) * mm);
  const pts = [];
  const arc = (cx, cy, R, a0) => {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
  };
  const side = (ax, ay, bx, by, nx, ny, r0, r1) => {
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    const run = len - r0 - r1, steps = Math.max(2, Math.round(run / (6 * mm)));
    const p1 = r() * 6.28, p2 = r() * 6.28, f1 = 1.5 + r() * 2.5, f2 = 5 + r() * 5;
    let chip = 0;
    for (let k = 1; k < steps; k++) {
      const s = r0 + (k / steps) * run, t = s / len;
      if (chip <= 0 && r() < 0.01) chip = 2 + Math.floor(r() * 3);
      const e = wob * (0.5 + 0.3 * Math.sin(t * f1 * 6.28 + p1) + 0.2 * Math.sin(t * f2 * 6.28 + p2))
        + (chip-- > 0 ? wob * (0.8 + r()) : 0);
      const fade = Math.min(1, (s - r0) / (10 * mm), (len - r1 - s) / (10 * mm));
      pts.push([ax + ux * s + nx * e * fade, ay + uy * s + ny * e * fade]);
    }
  };
  arc(x + rad[0], y + rad[0], rad[0], Math.PI);
  side(x, y, x + w, y, 0, 1, rad[0], rad[1]);
  arc(x + w - rad[1], y + rad[1], rad[1], -Math.PI / 2);
  side(x + w, y, x + w, y + h, -1, 0, rad[1], rad[2]);
  arc(x + w - rad[2], y + h - rad[2], rad[2], 0);
  side(x + w, y + h, x, y + h, 0, -1, rad[2], rad[3]);
  arc(x + rad[3], y + h - rad[3], rad[3], Math.PI / 2);
  side(x, y + h, x, y, 1, 0, rad[3], rad[0]);
  const outline = () => {
    ctx.beginPath();
    pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
  };
  ctx.save();
  outline();
  const tone = 0.95 + r() * 0.08; // per-tile shade (the showroom wall varies tile to tile)
  ctx.fillStyle = bump ? '#b4b4b4' : `#${new THREE.Color(m.color).multiplyScalar(tone).getHexString()}`;
  ctx.fill();
  ctx.clip();
  // Clouds: warm tan (`m.accent`) where the field is high, lighter cream (`m.light`)
  // where it is low; fine mottling everywhere.
  const cloud = stoneField(r, 3 + Math.floor(r() * 3), (m.clouds ?? 0.5) - 0.5, x, y, w, h), { at } = cloud;
  drawStoneCloud(ctx, cloud, x, y, w, h, bump ? 0x8a8a8a : m.accent, bump ? 0xc8c8c8 : m.light ?? 0xf0ede6,
    [0.5, 0.9, 0.13], [0.45, 0.2, 0.2]);
  // Mottling: dense small specks, tan (denser where the field is high) and cream, so
  // the clouds read as grainy stone rather than smooth stains.
  const nm = Math.round((w / mm) * (h / mm) * 0.012);
  for (let k = 0; k < nm; k++) {
    const px = x + r() * w, py = y + r() * h, v = at(px, py), rad = (0.5 + r() ** 2 * 2.5) * mm, al = 0.12 + r() * 0.25;
    const tanSpeck = r() < 0.2 + 0.7 * smooth(0.35, 0.75, v);
    ctx.globalAlpha = al;
    ctx.fillStyle = css(bump ? (tanSpeck ? 0x7a7a7a : 0xd8d8d8) : tanSpeck ? m.accent : m.light ?? 0xf0ede6);
    ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2 * (0.6 + r() * 0.8));
  }
  // Pits: many tiny holes, most where the clouds are.
  const npit = Math.round((w / mm) * (h / mm) * 0.003);
  const pit = new THREE.Color(m.pit ?? 0x9a8a78);
  for (let k = 0; k < npit; k++) {
    const px = x + r() * w, py = y + r() * h, keep = r() < 0.15 + 0.85 * smooth(0.45, 0.8, at(px, py));
    const s = Math.max(0.8, (0.4 + r() ** 3 * 1.8) * mm), al = 0.25 + r() * 0.45, f = 0.85 + r() * 0.3, e = 0.6 + r() * 0.8;
    if (!keep) continue;
    ctx.globalAlpha = al;
    ctx.fillStyle = bump ? '#303030' : `#${pit.clone().multiplyScalar(f).getHexString()}`;
    ctx.fillRect(px, py, s, s * e);
  }
  // Rust pits: a few larger orange-brown ones anywhere on the face (the 30×50 photo).
  const nrust = Math.round((w / mm) * (h / mm) * 0.00008 * (r() * 2));
  const rust = new THREE.Color(m.rust ?? 0xa86a3c);
  for (let k = 0; k < nrust; k++) {
    const px = x + r() * w, py = y + r() * h, s = (0.8 + r() * 1.6) * mm, al = 0.45 + r() * 0.4;
    ctx.globalAlpha = al;
    ctx.fillStyle = bump ? '#303030' : `#${rust.getHexString()}`;
    ctx.beginPath(); ctx.ellipse(px, py, s, s * (0.6 + r() * 0.4), r() * 3.14, 0, 6.2832); ctx.fill();
  }
  // White crackle veins on some tiles (the 30×30 photo): a few branching hairlines.
  if (r() < 0.45) {
    ctx.strokeStyle = bump ? '#c8c8c8' : css(m.light ?? 0xf0ede6);
    const nv = 2 + Math.floor(r() * 5);
    for (let k = 0; k < nv; k++) {
      let px = x + r() * w, py = y + r() * h, a = r() * 6.28;
      const segs = 4 + Math.floor(r() * 8);
      ctx.globalAlpha = 0.35 + r() * 0.35;
      ctx.lineWidth = Math.max(0.7, (0.4 + r() * 0.8) * mm);
      ctx.beginPath(); ctx.moveTo(px, py);
      for (let j = 0; j < segs; j++) {
        a += (r() - 0.5) * 1.2;
        const L = (6 + r() * 18) * mm;
        px += Math.cos(a) * L; py += Math.sin(a) * L;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // Pillowed, tumbled edge: nested strokes of the outline (clipped to the face, so each
  // shows half its width inside) build a ramp over ~12 mm: in the bump map the face rolls
  // down to the joint; in colour a faint darker rim with the worn arris darkest.
  outline();
  if (bump) {
    ctx.strokeStyle = '#303030';
    for (const [wd, al] of [[24, 0.12], [16, 0.14], [10, 0.18], [5, 0.25], [2, 0.3]]) {
      ctx.lineWidth = wd * mm; ctx.globalAlpha = al; ctx.stroke();
    }
  } else {
    ctx.strokeStyle = css(m.accent);
    for (const [wd, al] of [[12, 0.12], [5, 0.2], [2, 0.25]]) {
      ctx.lineWidth = wd * mm; ctx.globalAlpha = al; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

const PINWHEEL_DESIGNS = { 'aged-stone': agedStone };

// Pinwheel modules (src/core/flooring.js PINWHEEL, the count's own layout) over the joint
// colour `m.grout`; each tile drawn by the design with its own seed. Without a design,
// plain `m.color` tiles.
function paintPinwheel(ctx, m, W, H, ppm, bump) {
  const r = rng(m.seed ?? 71), design = PINWHEEL_DESIGNS[m.design];
  const n = design ? pinwheelModules(m) : 1, P = pinwheelPitch(m) * ppm, jp = (m.joint || 0) * ppm;
  ctx.fillStyle = bump ? '#5a5a5a' : css(m.grout ?? GROUT);
  ctx.fillRect(0, 0, W, H);
  for (let mj = 0; mj < n; mj++) {
    for (let mi = 0; mi < n; mi++) {
      for (const c of pinwheelCells(m)) {
        const x = mi * P + c.x0 * ppm + jp / 2, y = mj * P + c.y0 * ppm + jp / 2;
        const w = (c.x1 - c.x0) * ppm - jp, h = (c.y1 - c.y0) * ppm - jp;
        if (design) design(ctx, m, x, y, w, h, ppm, rng(Math.floor(r() * 1e9)), bump);
        else { ctx.fillStyle = css(m.color); ctx.fillRect(x, y, w, h); }
      }
    }
  }
  if (design) grainPass(ctx, Math.round(W), Math.round(H), rng((m.seed ?? 71) + 1), bump ? 0.2 : 0.09);
}

// ---- Stepped random (src/core/flooring.js STEPPED) --------------------------------------
// Its smallest x/y-aligned repeat is 7.9 × 7.9 m (0.26 px/mm in 2048 px), so the texture
// repeats along the lattice instead: the canvas is lattice space, (s, t) ∈ [0, N)² with the
// plan point s·A + t·B, drawn through a shear (ctx transform) and mapped back by the
// texture's own matrix (UV plan metres → (s/N, −t/N); the minus undoes the canvas flip).
const steppedDet = () => { const [ax, ay] = steppedA(), [bx, by] = steppedB(); return ax * by - ay * bx; };
const steppedPitch = () => Math.sqrt(Math.abs(steppedDet()));
function steppedCanvas(m, bump) {
  const N = STEPPED_CELLS, S = 2048, design = PINWHEEL_DESIGNS[m.design];
  const ppm = (S / N) / steppedPitch(); // draw units per plan metre (area-true)
  const [ax, ay] = steppedA(), [bx, by] = steppedB(), det = steppedDet();
  // plan metres → lattice (s, t): the inverse of [A B]; canvas px = (S/N)·(s, t).
  const k = S / N / ppm;
  const toCanvas = [by / det * k, -ay / det * k, -bx / det * k, ax / det * k]; // a b c d (DOMMatrix order)
  const canvas = newCanvas();
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bump ? '#5a5a5a' : css(m.grout ?? GROUT);
  ctx.fillRect(0, 0, S, S);
  const cells = steppedCells(), jp = (m.joint || 0) * ppm, seed = m.seed ?? 71;
  const px = (x, y) => [toCanvas[0] * x + toCanvas[2] * y, toCanvas[1] * x + toCanvas[3] * y];
  const mod = (v) => ((v % N) + N) % N;
  for (let mi = -2; mi <= N + 1; mi++) {
    for (let ni = -2; ni <= N + 1; ni++) {
      cells.forEach((c, i) => {
        const x = (mi * ax + ni * bx + c.x0) * ppm + jp / 2, y = (mi * ay + ni * by + c.y0) * ppm + jp / 2;
        const w = (c.x1 - c.x0) * ppm - jp, h = (c.y1 - c.y0) * ppm - jp;
        const q = [px(x, y), px(x + w, y), px(x, y + h), px(x + w, y + h)];
        if (q.every(([u]) => u < -4) || q.every(([u]) => u > S + 4)
          || q.every(([, v]) => v < -4) || q.every(([, v]) => v > S + 4)) return; // off canvas
        // One seed per (cell mod N, tile): a tile wrapped across the canvas edge draws the
        // same face on both sides, so the repeat has no seam.
        const r = rng(seed * 7919 + (mod(mi) * N + mod(ni)) * 31 + i * 7);
        ctx.save();
        ctx.setTransform(...toCanvas, 0, 0);
        if (design) design(ctx, m, x, y, w, h, ppm, rng(Math.floor(r() * 1e9)), bump);
        else { ctx.fillStyle = css(m.color); ctx.fillRect(x, y, w, h); }
        ctx.restore();
      });
    }
  }
  if (design) grainPass(ctx, S, S, rng(seed + 1), bump ? 0.2 : 0.09);
  return canvas;
}
function steppedTexture(canvas, anisotropy) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  const [ax, ay] = steppedA(), [bx, by] = steppedB(), det = steppedDet(), N = STEPPED_CELLS;
  t.matrixAutoUpdate = false; // the shear is not an offset/repeat/rotation
  t.matrix.set(by / det / N, -bx / det / N, 0, ay / det / N, -ax / det / N, 0, 0, 0, 1);
  return t;
}

function paintUnit(ctx, m, W, H, ppm) {
  if (m.pattern === 'stagger' && DESIGNS[m.design]) return paintDesign(ctx, m, W, H, ppm);
  if (m.pattern === 'brick' && BRICK_DESIGNS[m.design]) return paintBrickDesign(ctx, m, W, H, ppm, false);
  if (m.pattern === 'grid' && GRID_DESIGNS[m.design]) return paintGridDesign(ctx, m, W, H, ppm, false);
  if (m.pattern === 'octagon' && OCT_DESIGNS[m.design]) return paintOctDesign(ctx, m, W, H, ppm, false);
  if (m.pattern === 'pinwheel') return paintPinwheel(ctx, m, W, H, ppm, false);
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

// Paint a `diagonal` octagon: draw the straight unit (same ppm) on its own canvas, then
// fill this canvas with it as a pattern turned 45° about the origin, so a cabochon stays
// on the plan origin (as in the takeoff, flooring.js) and the tiling has no seams.
function paintDiagonal(ctx, m, W, H, ppm, paintStraight) {
  const [ux, uy] = straightUnit(m);
  const src = newCanvas();
  src.width = Math.max(8, Math.round(ux * ppm));
  src.height = Math.max(8, Math.round(uy * ppm));
  paintStraight(src.getContext('2d'), src.width, src.height, ppm);
  // Scale the source so its turned period is exactly W / √2 canvas px: the canvas then
  // holds exactly one period along x and y (the source's integer size would leave a seam).
  const pattern = ctx.createPattern(src, 'repeat');
  pattern.setTransform(new DOMMatrix([W / Math.SQRT2 / src.width, 0, 0, H / Math.SQRT2 / src.height, 0, 0]));
  ctx.save();
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = pattern;
  const R = W + H;
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.restore();
}
const withDiagonal = (m, paint) => (m.pattern === 'octagon' && m.diagonal
  ? (ctx, W, H, ppm) => paintDiagonal(ctx, m, W, H, ppm, paint)
  : paint);

function unitCanvas(m, paint) {
  const [uw, uh] = patternUnit(m);
  const ppm = (hasDesign(m) ? 2048 : 512) / Math.max(uw, uh);
  const canvas = newCanvas();
  canvas.width = Math.max(8, Math.round(uw * ppm));
  canvas.height = Math.max(8, Math.round(uh * ppm));
  paint(canvas.getContext('2d'), canvas.width, canvas.height, ppm);
  return { canvas, uw, uh };
}

function repeatTexture({ canvas, uw, uh }, anisotropy) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / uw, 1 / uh);
  t.anisotropy = anisotropy;
  return t;
}

// The colour canvas: { canvas, uw, uh } (one repeat unit), { canvas, stepped: true } (the
// stepped lattice), or null for untextured (paint) materials.
function mapCanvas(m) {
  if (!m || m.pattern === 'paint' || !(m.w > 0 && m.h > 0)) return null;
  if (m.pattern === 'stepped') return { canvas: steppedCanvas(m, false), stepped: true };
  return unitCanvas(m, withDiagonal(m, (ctx, W, H, ppm) => paintUnit(ctx, m, W, H, ppm)));
}

// The height canvas for designs that have one (same unit and seed as the colour, so the
// two line up), else null.
function bumpCanvas(m) {
  if (m?.pattern === 'octagon' && OCT_DESIGNS[m.design]) {
    return unitCanvas(m, withDiagonal(m, (ctx, W, H, ppm) => paintOctDesign(ctx, m, W, H, ppm, true)));
  }
  if (m?.pattern === 'grid' && GRID_DESIGNS[m.design]) {
    return unitCanvas(m, (ctx, W, H, ppm) => paintGridDesign(ctx, m, W, H, ppm, true));
  }
  if (m?.pattern === 'pinwheel' && PINWHEEL_DESIGNS[m.design]) {
    return unitCanvas(m, (ctx, W, H, ppm) => paintPinwheel(ctx, m, W, H, ppm, true));
  }
  if (m?.pattern === 'stepped' && PINWHEEL_DESIGNS[m.design]) return { canvas: steppedCanvas(m, true), stepped: true };
  if (!m || m.pattern !== 'brick' || !BRICK_DESIGNS[m.design]) return null;
  return unitCanvas(m, (ctx, W, H, ppm) => paintBrickDesign(ctx, m, W, H, ppm, true));
}

const canvasTexture = (c, anisotropy) => (!c ? null
  : c.stepped ? steppedTexture(c.canvas, anisotropy) : repeatTexture(c, anisotropy));

// → a CanvasTexture (repeat = 1 / unit size, UVs in plan metres) or null for untextured
// (paint) materials.
export function finishTexture(m, anisotropy = 1) {
  const map = canvasTexture(mapCanvas(m), anisotropy);
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// Height map for designs that have one, else null. View 3D only: the AR 3D view's
// Lambert materials ignore it.
export function finishBumpTexture(m, anisotropy = 1) {
  return canvasTexture(bumpCanvas(m), anisotropy);
}

// Painting a finish takes up to about 2 s of main-thread time (Lucia, Monastère: measured
// in Chrome on the Steam Deck, 2026-10-03), so View 3D has them painted in a worker
// (textures.worker.js) and wraps the result here. `finishCanvases` runs in the worker:
// every canvas a finish needs, each with its unit; `finishTexturesFrom` turns them (as
// page canvases) into the same textures finishTexture/finishBumpTexture return.
export function finishCanvases(m, { bump = true, detail = true } = {}) {
  const d = m && DETAIL_DESIGNS[m.design] && m.w > 0 && m.h > 0 ? DETAIL_DESIGNS[m.design] : null;
  return {
    map: mapCanvas(m),
    bump: bump ? bumpCanvas(m) : null,
    detail: d && detail ? { canvas: detailCanvas(d.size, (m.seed ?? 0) + 97, d.paint) } : null,
  };
}
export function finishTexturesFrom(m, canvases, anisotropy = 1) {
  const map = canvasTexture(canvases.map, anisotropy);
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  if (canvases.detail && !hasFinishDetail(m)) detailCache.set(detailKey(m), detailTexture(canvases.detail.canvas));
  return { map, bumpMap: canvasTexture(canvases.bump, anisotropy) };
}

// ---- Detail layer (View 3D) ---------------------------------------------------------
// The main texture holds one repeat unit in at most 2048 px, so a 2–3 m unit gets under
// 1 px/mm and sub-mm grain (pits, flecks, sand) blurs when the camera is close. A detail
// design draws that grain once on a small tile (DETAIL_PX over `size` m, 3–4 px/mm) that
// repeats densely over the finish: R = albedo multiplier (0.5 = ×1, mean held at 0.5 so
// the far look is unchanged), G = micro height (0.5 = flat). applyFinishDetail patches a
// MeshStandardMaterial to multiply R into the colour and add G to the bump height.
const DETAIL_PX = 512;

// Draws on a DETAIL_PX canvas where 1 m = ppm px. `dot(x, y, s, v, a)` stamps a soft
// square of albedo/height value v (0–255) wrapped across the tile edges.
function detailCanvas(size, seed, paint) {
  const c = newCanvas();
  c.width = c.height = DETAIL_PX;
  const ctx = c.getContext('2d'), ppm = DETAIL_PX / size, r = rng(seed);
  const albedo = new Float32Array(DETAIL_PX * DETAIL_PX).fill(128), height = new Float32Array(DETAIL_PX * DETAIL_PX).fill(128);
  // Stamp a round-ish spot into a channel with wrap-around (seamless tile).
  const spot = (buf, cx, cy, rad, value, alpha) => {
    const R = Math.max(0.5, rad), x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const k = alpha * Math.min(1, Math.max(0, R + 0.5 - d)); // 1 px antialiased edge
        if (k <= 0) continue;
        const i = ((y + DETAIL_PX) % DETAIL_PX) * DETAIL_PX + ((x + DETAIL_PX) % DETAIL_PX);
        buf[i] += (value - buf[i]) * k;
      }
    }
  };
  paint({ ppm, r, albedo, height, spot });
  // Hold the albedo mean at 128 so the detail only adds contrast, never a tone shift.
  let mean = 0;
  for (const v of albedo) mean += v;
  mean /= albedo.length;
  const img = ctx.createImageData(DETAIL_PX, DETAIL_PX);
  for (let i = 0; i < albedo.length; i++) {
    img.data[i * 4] = Math.max(0, Math.min(255, albedo[i] - mean + 128));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, height[i]));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Per-pixel grain: albedo ± a/2, height ± h/2 (independent).
function detailGrain(r, albedo, height, a, h) {
  for (let i = 0; i < albedo.length; i++) {
    albedo[i] += (r() - 0.5) * a * 255;
    height[i] += (r() - 0.5) * h * 255;
  }
}

const DETAIL_DESIGNS = {
  // Monastère: a matte pitted stone skin. Sub-mm pits (dark, low), fine light and dark sand
  // specks, and a soft grain; the main texture keeps the clouds, veins and larger pits.
  'aged-stone': {
    size: 0.16,
    paint({ ppm, r, albedo, height, spot }) {
      const mm = ppm / 1000, area = (DETAIL_PX / mm) ** 2; // mm² on the tile
      detailGrain(r, albedo, height, 0.12, 0.3);
      for (let k = 0; k < area * 0.004; k++) { // granular mottle, 1–3 mm light and dark
        const x = r() * DETAIL_PX, y = r() * DETAIL_PX, rad = (0.5 + r() * 1) * mm;
        const up = r() < 0.5;
        spot(albedo, x, y, rad, up ? 150 : 108, 0.35 + r() * 0.3);
        spot(height, x, y, rad, up ? 150 : 100, 0.5);
      }
      for (let k = 0; k < area * 0.03; k++) { // pits 0.2–1.2 mm
        const x = r() * DETAIL_PX, y = r() * DETAIL_PX, rad = (0.1 + r() ** 2 * 0.5) * mm;
        spot(albedo, x, y, rad, 35 + r() * 45, 0.7 + r() * 0.3);
        spot(height, x, y, rad * 1.2, 0, 1);
      }
      for (let k = 0; k < area * 0.05; k++) { // sand specks
        const x = r() * DETAIL_PX, y = r() * DETAIL_PX, rad = (0.08 + r() * 0.2) * mm;
        spot(albedo, x, y, rad, r() < 0.5 ? 85 : 175, 0.4 + r() * 0.3);
      }
    },
  },
  // Lucia: satin limestone, near-flat; dense fine grey flecks and a light grain.
  limestone: {
    size: 0.12,
    paint({ ppm, r, albedo, height, spot }) {
      const mm = ppm / 1000, area = (DETAIL_PX / mm) ** 2;
      detailGrain(r, albedo, height, 0.06, 0.08);
      for (let k = 0; k < area * 0.1; k++) { // flecks 0.2–0.9 mm, grey
        const x = r() * DETAIL_PX, y = r() * DETAIL_PX, rad = (0.1 + r() ** 2 * 0.35) * mm;
        spot(albedo, x, y, rad, 55 + r() * 45, 0.5 + r() * 0.4);
      }
      for (let k = 0; k < area * 0.03; k++) { // pale specks between them
        const x = r() * DETAIL_PX, y = r() * DETAIL_PX, rad = (0.1 + r() * 0.3) * mm;
        spot(albedo, x, y, rad, 170, 0.4 + r() * 0.3);
      }
    },
  },
};

const detailCache = new Map();
const detailKey = (m) => `${m.design}:${m.seed ?? 0}`;
export const hasFinishDetail = (m) => detailCache.has(detailKey(m)); // already painted
function detailTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; // data, not colour: no sRGB
  return t;
}
// → { texture, size } for a design that has a detail layer, else null.
export function finishDetailTexture(m, anisotropy = 1) {
  const d = m && DETAIL_DESIGNS[m.design];
  if (!d || !(m.w > 0 && m.h > 0)) return null;
  const key = detailKey(m);
  let t = detailCache.get(key);
  if (!t) {
    t = detailTexture(detailCanvas(d.size, (m.seed ?? 0) + 97, d.paint));
    detailCache.set(key, t);
  }
  t.anisotropy = Math.max(t.anisotropy, anisotropy);
  return { texture: t, size: d.size };
}

// Patch a finish's MeshStandardMaterial (with `map`, and `bumpMap` when the design has one)
// to use the detail layer: colour ×= 2·R, bump height += detailBump·(G − ½). Both sample
// the map's own UVs (plan metres / unit) scaled by unit / detail size.
export function applyFinishDetail(material, m, anisotropy = 1) {
  const d = finishDetailTexture(m, anisotropy);
  if (!d || !material.map) return material;
  const [uw, uh] = patternUnit(m);
  const uniforms = {
    detailMap: { value: d.texture },
    detailScale: { value: new THREE.Vector2(uw / d.size, uh / d.size) },
    detailBump: { value: m.detailBump ?? 1.2 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // Route the chunk's height reads through finishHeight first, then define it (in that
    // order, or the replace would rewrite finishHeight's own read into a recursive call).
    const bumpChunk = THREE.ShaderChunk.bumpmap_pars_fragment
      .replace(/texture2D\( bumpMap, ([^)]*?) \)\.x/g, 'finishHeight( $1 )')
      .replace('uniform float bumpScale;', `uniform float bumpScale;
	float finishHeight( vec2 uv ) {
		return texture2D( bumpMap, uv ).x + detailBump / bumpScale * ( texture2D( detailMap, uv * detailScale ).g - 0.5 );
	}`);
    shader.fragmentShader = 'uniform sampler2D detailMap;\nuniform vec2 detailScale;\nuniform float detailBump;\n'
      + shader.fragmentShader
        .replace('#include <bumpmap_pars_fragment>', bumpChunk)
        .replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb *= texture2D( detailMap, vMapUv * detailScale ).r * 2.0;');
  };
  material.customProgramCacheKey = () => 'finish-detail';
  return material;
}
