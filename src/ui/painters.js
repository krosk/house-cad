// Every procedural texture painter that the texture worker runs (textures.worker.js), by
// name, for paintedTexture.js: (ctx, width, height, args) with plain-data args. Worker-safe:
// the modules imported here touch no DOM at load time.
import { paintExterior } from './exteriorView.js';
import { paintDoorLeaf } from './doorProducts.js';
import { FURNITURE_PAINTERS } from './proceduralFurniture.js';

// View 3D's default floor: stained planks, or their relief.
function viewWood(ctx, size, _h, { relief = false } = {}) {
  ctx.fillStyle = relief ? '#888' : '#b98550';
  ctx.fillRect(0, 0, size, size);
  const rows = 8;
  const rowH = size / rows;
  for (let row = 0; row < rows; row++) {
    const y = row * rowH;
    const offset = row % 2 ? size * 0.5 : 0;
    for (let x = -offset; x < size; x += size) {
      if (!relief) {
        const shade = 174 + ((row * 23 + Math.round(x)) % 19);
        ctx.fillStyle = `rgb(${shade},${Math.round(shade * 0.72)},${Math.round(shade * 0.43)})`;
        ctx.fillRect(x + 1, y + 1, size - 2, rowH - 2);
      }
      ctx.strokeStyle = relief ? '#666' : 'rgba(65,37,18,.35)';
      ctx.lineWidth = relief ? 3 : 1.5;
      ctx.strokeRect(x, y, size, rowH);
    }
    // Long, low-contrast grain follows the board direction.
    for (let line = 0; line < 5; line++) {
      const gy = y + ((line * 13 + row * 7) % Math.max(1, rowH - 5)) + 2;
      ctx.strokeStyle = relief ? 'rgba(150,150,150,.3)' : 'rgba(74,40,18,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 16) {
        const wave = Math.sin((x + row * 31 + line * 17) * 0.035) * 2;
        if (x === 0) ctx.moveTo(x, gy + wave); else ctx.lineTo(x, gy + wave);
      }
      ctx.stroke();
    }
  }
}

// View 3D's default wall plaster: fine deterministic mottling, or its relief.
function viewPlaster(ctx, size, _h, { relief = false } = {}) {
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const p = i / 4;
    // Deterministic fine mottling: enough to catch light without visual noise.
    const noise = ((p * 73 + Math.floor(p / size) * 151) % 17) - 8;
    const value = relief ? 128 + noise * 2 : 239 + Math.round(noise * 0.35);
    image.data[i] = value;
    image.data[i + 1] = relief ? value : value - 1;
    image.data[i + 2] = relief ? value : value - 3;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

export const PAINTERS = {
  viewWood,
  viewPlaster,
  exterior: paintExterior,
  doorLeaf: paintDoorLeaf,
  ...FURNITURE_PAINTERS,
};
