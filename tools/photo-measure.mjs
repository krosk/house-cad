#!/usr/bin/env node
// Measure a retailer photo for a View 3D photo finish (docs/product-modelling.md step 7):
// decodes the image to raw grey with ffmpeg (no npm image library), then reports
//   rows   <img>                      grooves: rows of minimum mean luminance (plank rows)
//   joints <img> --grooves y0,y1,...  butt joints per row: columns darker than their neighbours
//   bbox   <img> [--threshold 240]    the tile's box on a white background (pixels < threshold)
// Run it on a copy in the scratchpad; confirm every number on a crop before using it.
import { execFileSync } from 'node:child_process';

const [mode, file, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
if (!mode || !file) {
  console.error('usage: photo-measure.mjs rows|joints|bbox <image> [--grooves y0,y1,…] [--threshold 240]');
  process.exit(1);
}

const size = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
  'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
const [W, H] = size;
const g = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
  { maxBuffer: W * H + 1024 });
console.log(`${file}: ${W} × ${H}`);

if (mode === 'rows') {
  const mean = [];
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x += 2) s += g[y * W + x]; mean.push(s / (W / 2)); }
  const avg = mean.reduce((a, b) => a + b) / H;
  const minima = [];
  for (let y = 3; y < H - 3; y++) {
    const v = mean[y];
    if (v < avg - 12 && v <= Math.min(...mean.slice(y - 3, y + 4)) && (!minima.length || y - minima.at(-1) > 40)) minima.push(y);
  }
  console.log('grooves (y):', minima.join(','));
  console.log('pitch (px):', minima.slice(1).map((y, i) => y - minima[i]).join(','));
  console.log('Drop outliers by eye (a dark knot can make a false row), then divide the pitch by the published width.');
} else if (mode === 'joints') {
  const grooves = (opt('grooves', '') || '').split(',').map(Number).filter(Number.isFinite);
  if (grooves.length < 2) { console.error('--grooves y0,y1,… required (from the rows mode)'); process.exit(1); }
  for (let r = 0; r < grooves.length - 1; r++) {
    const y0 = grooves[r] + 15, y1 = grooves[r + 1] - 15;
    const col = [];
    for (let x = 0; x < W; x++) { let s = 0; for (let y = y0; y < y1; y++) s += g[y * W + x]; col.push(s / (y1 - y0)); }
    // A joint is a thin line darker than the columns 8–14 px either side.
    const c = col.map((v, x) => {
      let s = 0, n = 0;
      for (const d of [-14, -12, -10, -8, 8, 10, 12, 14]) { const k = x + d; if (k >= 0 && k < W) { s += col[k]; n++; } }
      return v - s / n;
    });
    const found = [];
    for (let x = 20; x < W - 20; x++) {
      if (c[x] < -4 && c[x] <= Math.min(...c.slice(x - 10, x + 11))) found.push(`${x}(${c[x].toFixed(1)})`);
    }
    console.log(`row ${r} (${grooves[r]}–${grooves[r + 1]}):`, found.join(' ') || '—');
  }
  console.log('Joints are faint: read the expected ones off a downscaled copy, keep the candidates near them, check on a crop.');
} else if (mode === 'bbox') {
  const thr = Number(opt('threshold', 240));
  const rowCov = [], colCov = new Array(W).fill(0);
  for (let y = 0; y < H; y++) {
    let c = 0;
    for (let x = 0; x < W; x++) if (g[y * W + x] < thr) { c++; colCov[x]++; }
    rowCov.push(c);
  }
  const minCover = Math.max(20, Math.round(Math.min(W, H) * 0.1));
  const rows = rowCov.flatMap((c, i) => (c > minCover ? [i] : [])), cols = colCov.flatMap((c, i) => (c > minCover ? [i] : []));
  const [x0, x1, y0, y1] = [Math.min(...cols), Math.max(...cols), Math.min(...rows), Math.max(...rows)];
  console.log(`box [x0, y0, x1, y1] = [${x0}, ${y0}, ${x1}, ${y1}], ${x1 - x0 + 1} × ${y1 - y0 + 1} px, ratio ${((x1 - x0 + 1) / (y1 - y0 + 1)).toFixed(3)}`);
} else {
  console.error(`unknown mode ${mode}`);
  process.exit(1);
}
