// Render arbitrary text (here: a share-view URL) to a QR-code PNG. Thin wrapper over
// qrcode-generator (zero-dep, synchronous, does the Reed–Solomon + masking).
//
// PURPOSE: the QR is a TRUNCATION-PROOF carrier for the long `#view=` link — shared as a
// digital image so messaging/social apps can't clip the URL. It is never printed, so
// scan robustness is irrelevant and we always use ECC **L**: for a given payload L gives
// the MAX capacity AND the FEWEST modules (least-dense → easiest to scan on a screen).
// QR's hard ceiling is version 40 / byte mode / ECC L ≈ 2953 bytes; makeQr returns null
// past that so the caller can degrade instead of shipping a broken image. shareView.js
// keeps the payload small (view-only, mm-rounded, deflate) precisely so it fits here.

import qrcode from 'qrcode-generator';

// Build a QR for `text` at ECC L. Returns { qr, ecc, count } or null when it overflows.
export function makeQr(text) {
  try {
    const qr = qrcode(0, 'L'); // typeNumber 0 = auto-pick the smallest version
    qr.addData(text);
    qr.make();
    return { qr, ecc: 'L', count: qr.getModuleCount() };
  } catch {
    return null; // exceeds even version 40 @ ECC L (~2953 bytes)
  }
}

// Draw a QR to a fresh canvas. `scale` = px per module, `margin` = quiet-zone modules
// (the spec requires ≥4). Returns { canvas, ecc, count } or null when it doesn't fit.
export function qrToCanvas(text, { scale = 8, margin = 4 } = {}) {
  const made = makeQr(text);
  if (!made) return null;
  const { qr, ecc, count } = made;
  const px = (count + margin * 2) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px); // white incl. the quiet zone — scanners need it
  ctx.fillStyle = '#000000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
    }
  }
  return { canvas, ecc, count };
}

// QR → PNG Blob (or null if the text is too large for any QR). Async only because
// canvas.toBlob is callback-based.
export function qrToPngBlob(text, opts) {
  const res = qrToCanvas(text, opts);
  if (!res) return Promise.resolve(null);
  return new Promise((resolve) => res.canvas.toBlob((b) => resolve(b), 'image/png'));
}

// QR → standalone SVG string (crisp at any size; handy for a desktop download).
export function qrToSvg(text, { margin = 4 } = {}) {
  const made = makeQr(text);
  if (!made) return null;
  const { qr, count } = made;
  const dim = count + margin * 2;
  let path = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) path += `M${c + margin},${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`
    + `<rect width="${dim}" height="${dim}" fill="#fff"/>`
    + `<path d="${path}" fill="#000"/></svg>`;
}
