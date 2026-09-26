// Procedural furniture: products with no IKEA 3D model (discontinued ranges), built
// from simple solids at their published size. A catalog entry in
// public/furniture/index.json with `procedural: <kind>` routes here instead of the
// IKEA proxy (docs/furniture.md). The returned group follows the IKEA GLB convention —
// metres, Y up, floor at Y = 0, origin centred in plan, front toward +Z — so placement,
// rotation, hover highlight and cloning treat it like any downloaded model.
//
// Textures are small CanvasTextures drawn here (no network/assets), like the finish
// textures: stained wood grain, quilted leather, mattress fabric.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;
const shade = (hex, f) => `#${new THREE.Color(hex).multiplyScalar(f).getHexString()}`;

// Tiny deterministic PRNG so the textures look the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Wood with grain running along U (texture x).
function woodTexture(color) {
  return canvasTexture(256, (ctx, S) => {
    const r = rng(7);
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const y = r() * S, amp = 1 + r() * 3, ph = r() * 6;
      ctx.strokeStyle = shade(color, 0.72 + r() * 0.4);
      ctx.globalAlpha = 0.25 + r() * 0.35;
      ctx.lineWidth = 0.6 + r() * 1.6;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const yy = y + Math.sin(x / 40 + ph) * amp;
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

// Leather cushion face: soft mottling plus a quilted seam grid (cols × rows panels).
function leatherTexture(color, cols = 3, rows = 3) {
  return canvasTexture(256, (ctx, S) => {
    const r = rng(11);
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = shade(color, 0.8 + r() * 0.45);
      ctx.globalAlpha = 0.25;
      ctx.fillRect(r() * S, r() * S, 2 + r() * 3, 2 + r() * 3);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = 3;
    for (let i = 1; i < cols; i++) { const x = (S * i) / cols; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
    for (let j = 1; j < rows; j++) { const y = (S * j) / rows; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
    // Stitch highlight beside each seam.
    ctx.strokeStyle = shade(color, 1.6);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 1; i < cols; i++) { const x = (S * i) / cols + 4; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
    for (let j = 1; j < rows; j++) { const y = (S * j) / rows + 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
  });
}

function fabricTexture(color) {
  return canvasTexture(128, (ctx, S) => {
    const r = rng(3);
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < S; i += 2) {
      ctx.fillStyle = shade(color, 0.9 + r() * 0.08);
      ctx.fillRect(0, i, S, 1);
      ctx.fillRect(i, 0, 1, S);
    }
    ctx.globalAlpha = 1;
  });
}

// Slatted base: light birch slats across the bed width, gaps between.
function slatTexture(color) {
  return canvasTexture(128, (ctx, S) => {
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(0, 0, S, S);
    const n = 4;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = shade(color, 0.95 + 0.1 * (i % 2));
      ctx.fillRect(0, (S * i) / n + 3, S, S / n - 6);
    }
  });
}

// A box from p0 to p1 (min/max corners, metres).
function box(p0, p1, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), material);
  m.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  return m;
}

// A square-section member from base centre `a` to top centre `b`, tapering from
// `wBottom` to `wTop` (4-sided cylinder turned 45° = square section).
function member(a, b, wBottom, wTop, material) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(wTop / Math.SQRT2, wBottom / Math.SQRT2, len, 4, 1);
  g.rotateY(Math.PI / 4);
  const m = new THREE.Mesh(g, material);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return m;
}

// IKEA STOCKHOLM bed frame (2013 range, discontinued; sources in docs/furniture.md).
// Overall W × H × L from the catalog `sizeMm` [w, h, d]; the foot rail top and the
// mattress size are params. Head at −Z, foot at +Z.
//
// Shape, from IKEA's assembly drawing (AA-809121) and sale photos:
//   - four square legs tapering toward the floor, flush under the corners;
//   - thick side/end rails between them;
//   - two head posts leaning back (~8°) carrying two headboard slats;
//   - two leather cushions filling the width between the posts, resting on the slats;
//   - a slatted base below the rail top.
function stockholmBed(entry) {
  const [W, H, L] = (entry.sizeMm || [1720, 920, 2230]).map((v) => v / 1000);
  const p = entry.params || {};
  const railTop = (p.footHeightMm ?? 350) / 1000;
  const railH = 0.13;
  const leg = 0.065, railT = 0.035;
  const matW = (p.mattressMm?.[0] ?? 1600) / 1000, matL = (p.mattressMm?.[1] ?? 2000) / 1000;
  const lean = 0.13; // head post top sits this much further back than its foot

  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(p.woodColor ?? 0x5b3a26), roughness: 0.6 });
  const woodV = wood.clone();
  woodV.map = wood.map.clone();
  woodV.map.center.set(0.5, 0.5);
  woodV.map.rotation = Math.PI / 2; // grain along the legs
  const leatherMap = leatherTexture(p.cushionColor ?? 0x2a2422, 3, 1);
  const leather = new THREE.MeshStandardMaterial({ map: leatherMap, bumpMap: leatherMap, bumpScale: 0.6, roughness: 0.45 });
  const g = new THREE.Group();
  g.name = entry.name || 'stockholm-bed';

  const x0 = -W / 2, x1 = W / 2, zF = L / 2;
  const zHeadTop = -L / 2 + leg / 2;          // post top (leans back to the overall length)
  const zHeadFoot = zHeadTop + lean;           // post foot on the floor
  const zFootLeg = zF - leg / 2;
  const xl = x0 + leg / 2, xr = x1 - leg / 2;

  // Legs: foot pair straight to the rail top, head pair = the leaning posts.
  g.add(member([xl, 0, zFootLeg], [xl, railTop, zFootLeg], leg * 0.75, leg, woodV));
  g.add(member([xr, 0, zFootLeg], [xr, railTop, zFootLeg], leg * 0.75, leg, woodV));
  g.add(member([xl, 0, zHeadFoot], [xl, H, zHeadTop], leg * 0.8, leg, woodV));
  g.add(member([xr, 0, zHeadFoot], [xr, H, zHeadTop], leg * 0.8, leg, woodV));

  // Where the leaning post is at a given height.
  const postZ = (y) => zHeadFoot + (zHeadTop - zHeadFoot) * (y / H);
  const zHeadRail = postZ(railTop - railH / 2);

  // Rails: sides flush with the legs' outer faces; foot and head rails between the legs.
  g.add(box([x0, railTop - railH, zHeadRail], [x0 + railT, railTop, zFootLeg], wood));
  g.add(box([x1 - railT, railTop - railH, zHeadRail], [x1, railTop, zFootLeg], wood));
  g.add(box([xl + leg / 2, railTop - railH, zF - railT], [xr - leg / 2, railTop, zF], wood));
  g.add(box([xl + leg / 2, railTop - railH, zHeadRail - railT / 2], [xr - leg / 2, railTop, zHeadRail + railT / 2], wood));

  // Headboard slats between the posts, tilted with them.
  const tilt = Math.atan2(lean, H);
  for (const y of [H * 0.6, H * 0.86]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * leg, 0.09, 0.025), wood);
    s.position.set(0, y, postZ(y));
    s.rotation.x = -tilt;
    g.add(s);
  }

  // Slatted base, then the mattress on it.
  const baseY = railTop - railH + 0.03;
  const zBase0 = zHeadRail + railT / 2, zBase1 = zF - railT;
  const slatMap = slatTexture(0xd9b98a);
  slatMap.repeat.set(1, 7);
  g.add(box([x0 + railT, baseY, zBase0], [x1 - railT, baseY + 0.015, zBase1],
    new THREE.MeshStandardMaterial({ map: slatMap, roughness: 0.8 })));
  if (p.mattress !== false) {
    const matH = (p.mattressHeightMm ?? 250) / 1000;
    const fabric = new THREE.MeshStandardMaterial({ map: fabricTexture(0xf1eee8), roughness: 0.95 });
    const m = new THREE.Mesh(new RoundedBoxGeometry(matW, matH, matL, 2, 0.03), fabric);
    m.position.set(0, baseY + 0.015 + matH / 2, (zBase0 + zBase1) / 2 + 0.01);
    g.add(m);
  }

  // Two cushions side by side filling the whole width between the head posts, from
  // the rail top (behind the mattress) up to the post tops; thick and soft, with
  // vertical channel seams (sale photos).
  const gap = 0.012;
  const cw = (W - 2 * leg - gap) / 2, ct = 0.13;
  const cBottom = railTop, ch = H - 0.01 - cBottom;
  const cy = cBottom + ch / 2;
  for (const cx of [-(cw + gap) / 2, (cw + gap) / 2]) {
    const c = new THREE.Mesh(new RoundedBoxGeometry(cw, ch, ct, 3, 0.045), leather);
    c.position.set(cx, cy, postZ(cy) + 0.025 / 2 + ct / 2);
    c.rotation.x = -tilt;
    g.add(c);
  }
  return g;
}

const BUILDERS = { 'stockholm-bed': stockholmBed };

export function isProcedural(entry) {
  return !!(entry && BUILDERS[entry.procedural]);
}

// Build a fresh source scene for a procedural catalog entry.
export function buildProceduralFurniture(entry) {
  const g = BUILDERS[entry.procedural](entry);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
