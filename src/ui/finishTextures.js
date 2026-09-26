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
// Brick-bond tile designs: BRICK_COLS tiles per row, BRICK_ROWS rows, rows offset by half.
const BRICK_COLS = 4, BRICK_ROWS = 8;
// Mosaic-sheet designs (grid pattern, piece = one sheet): GRID_SHEETS × GRID_SHEETS sheets.
const GRID_SHEETS = 3;
const hasDesign = (m) => (m.pattern === 'stagger' && !!DESIGNS[m.design])
  || (m.pattern === 'brick' && !!BRICK_DESIGNS[m.design])
  || (m.pattern === 'grid' && !!GRID_DESIGNS[m.design]);

// Repeat unit (metres) of a pattern.
export function patternUnit(m) {
  const px = m.w + (m.joint || 0), py = m.h + (m.joint || 0);
  if (m.pattern === 'stagger' && DESIGNS[m.design]) return [DESIGN_PER_ROW * m.w, DESIGN_ROWS * py];
  if (m.pattern === 'brick' && BRICK_DESIGNS[m.design]) return [BRICK_COLS * px, BRICK_ROWS * py];
  if (m.pattern === 'grid' && GRID_DESIGNS[m.design]) return [GRID_SHEETS * px, GRID_SHEETS * py];
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

const GRID_DESIGNS = { 'stone-sticks': stoneStick };

// Mosaic sheets: GRID_SHEETS × GRID_SHEETS sheets, each `m.mosaic` = [cols, rows] sticks,
// all on one even pitch: the joint inside a sheet equals the one between sheets, so a laid
// mosaic shows no sheet edges. Grout is `m.accent` (colour) / low (bump).
function paintGridDesign(ctx, m, W, H, ppm, bump) {
  const r = rng(m.seed ?? 53);
  const [cols, rows] = m.mosaic || [1, 1];
  const n = GRID_SHEETS, jp = (m.joint || 0) * ppm;
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

function paintUnit(ctx, m, W, H, ppm) {
  if (m.pattern === 'stagger' && DESIGNS[m.design]) return paintDesign(ctx, m, W, H, ppm);
  if (m.pattern === 'brick' && BRICK_DESIGNS[m.design]) return paintBrickDesign(ctx, m, W, H, ppm, false);
  if (m.pattern === 'grid' && GRID_DESIGNS[m.design]) return paintGridDesign(ctx, m, W, H, ppm, false);
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

function unitCanvas(m, paint) {
  const [uw, uh] = patternUnit(m);
  const ppm = (hasDesign(m) ? 2048 : 512) / Math.max(uw, uh);
  const canvas = document.createElement('canvas');
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

// → a CanvasTexture (repeat = 1 / unit size, UVs in plan metres) or null for untextured
// (paint) materials.
export function finishTexture(m, anisotropy = 1) {
  if (!m || m.pattern === 'paint' || !(m.w > 0 && m.h > 0)) return null;
  const map = repeatTexture(unitCanvas(m, (ctx, W, H, ppm) => paintUnit(ctx, m, W, H, ppm)), anisotropy);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// Height map for designs that have one (same unit and seed as finishTexture, so the two
// line up), else null. View 3D only: the AR 3D view's Lambert materials ignore it.
export function finishBumpTexture(m, anisotropy = 1) {
  if (m?.pattern === 'grid' && GRID_DESIGNS[m.design]) {
    return repeatTexture(unitCanvas(m, (ctx, W, H, ppm) => paintGridDesign(ctx, m, W, H, ppm, true)), anisotropy);
  }
  if (!m || m.pattern !== 'brick' || !BRICK_DESIGNS[m.design]) return null;
  return repeatTexture(unitCanvas(m, (ctx, W, H, ppm) => paintBrickDesign(ctx, m, W, H, ppm, true)), anisotropy);
}
