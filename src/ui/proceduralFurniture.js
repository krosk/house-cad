// Procedural furniture: products with no IKEA 3D model (discontinued ranges), built
// from simple solids at their published size. A catalog entry in
// public/furniture/index.json with `procedural: <kind>` routes here instead of the
// IKEA proxy (docs/furniture.md). The returned group follows the IKEA GLB convention —
// metres, Y up, floor at Y = 0, origin centred in plan, front toward +Z — so placement,
// rotation, hover highlight and cloning treat it like any downloaded model.
//
// Textures are small procedural pictures painted in the texture worker (no network/assets;
// paintedTexture.js): stained wood grain, quilted leather, mattress fabric.

import * as THREE from 'three';
import { paintedTexture } from './paintedTexture.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;
const shade = (hex, f) => `#${new THREE.Color(hex).multiplyScalar(f).getHexString()}`;

// Tiny deterministic PRNG so the textures look the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Wood with grain running along U (texture x).
function paintWood(ctx, S, _h, { color }) {
  {
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
  }
}

// Leather cushion face: soft mottling plus a quilted seam grid (cols × rows panels).
function paintLeather(ctx, S, _h, { color, cols = 3, rows = 3 }) {
  {
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
  }
}

function paintFabric(ctx, S, _h, { color }) {
  {
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
  }
}

// Slatted base: light birch slats across the bed width, gaps between.
function paintSlat(ctx, S, _h, { color }) {
  {
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(0, 0, S, S);
    const n = 4;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = shade(color, 0.95 + 0.1 * (i % 2));
      ctx.fillRect(0, (S * i) / n + 3, S, S / n - 6);
    }
  }
}

function paintKeys(ctx, S) {
  ctx.fillStyle = '#f3f1ea';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#9d9a92';
  for (let i = 1; i < 52; i++) ctx.fillRect((S * i) / 52 - 1, 0, 2, S);
}

function paintBadge(ctx, s) {
  ctx.fillStyle = '#b9bcbf'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#ffffff'; ctx.font = 'italic bold 34px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ACOVA', s / 2, s / 2 + 2);
}

// A panel radiator's open top grille: dark fins, light slats, split in two halves.
function paintGrille(ctx, size, _h, { W, color }) {
  ctx.fillStyle = '#4a4d50'; ctx.fillRect(0, 0, size, size);
  const slats = Math.round(W / 0.012);
  ctx.fillStyle = '#d9dadb';
  for (let i = 0; i < slats; i++) ctx.fillRect((i + 0.5) / slats * size - 1, 0, 2, size);
  ctx.fillStyle = css(color);
  ctx.fillRect(size / 2 - 4, 0, 8, size);                       // centre divider
  ctx.fillRect(0, 0, 6, size); ctx.fillRect(size - 6, 0, 6, size);  // end caps
}

// Small textures by name, painted in the texture worker (paintedTexture.js, painters.js).
export const FURNITURE_PAINTERS = {
  furnWood: paintWood, furnLeather: paintLeather, furnFabric: paintFabric, furnSlat: paintSlat,
  furnTrayTop: paintTrayTop, furnKeys: paintKeys, furnBadge: paintBadge, furnGrille: paintGrille,
};
const woodTexture = (color) => paintedTexture('furnWood', { color }, 256, 256, { placeholder: color });
const leatherTexture = (color, cols = 3, rows = 3) => paintedTexture('furnLeather', { color, cols, rows }, 256, 256, { placeholder: color });
const fabricTexture = (color) => paintedTexture('furnFabric', { color }, 128, 128, { placeholder: color });
const slatTexture = (color) => paintedTexture('furnSlat', { color }, 128, 128, { placeholder: color });

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
  // A variant, not a clone: a clone of a painted texture never receives its picture.
  const color = p.woodColor ?? 0x5b3a26;
  woodV.map = paintedTexture('furnWood', { color }, 256, 256, { placeholder: color, variant: 'vertical' });
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

// Daikin Perfera CTXM-A / FTXM-A wall-mounted AC indoor units (sources in docs/furniture.md).
// W × H × D from the catalog `sizeMm` (Daikin: 804 × 298 × 252 or 997 × 298 × 292 mm). Back against the
// wall at −Z; the catalog `mountZMm` lifts it on drop (the foot is the unit's bottom).
//
// Shape, from Daikin's installer guide drawings and retailer front photos:
//   - a flat glossy front panel over the upper ~3/4 of the face (logo centred low);
//   - a slanted lower-front face carrying the horizontal outlet flap and, at the
//     right end, the two round sensor/receiver windows;
//   - an underside that curves up to the wall at the back.
function daikinWallUnit(entry) {
  const [W, H, D] = (entry.sizeMm || [804, 298, 252]).map((v) => v / 1000);
  const p = entry.params || {};
  const panelBottom = (p.panelBottomMm ?? 73) / 1000;   // front panel lower edge (photo)
  const panelT = 0.014;
  const flapX = (p.flapMm || [65, 674]).map((v) => v / 1000 - W / 2); // from the left (photo)
  const white = new THREE.MeshStandardMaterial({ color: p.color ?? 0xf3f3f1, roughness: 0.3 });
  const body = new THREE.MeshStandardMaterial({ color: p.bodyColor ?? 0xf0f0ee, roughness: 0.55 });
  const flap = new THREE.MeshStandardMaterial({ color: 0xe2e2df, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e3034, roughness: 0.3 });
  const g = new THREE.Group();
  g.name = entry.name || 'daikin-wall-unit';

  // Casing: the side profile in (z, y), extruded across the width (a −90° turn about Y
  // maps the shape's x onto world +Z and the extrusion onto −X).
  const zf = D / 2 - panelT;                   // casing front, behind the panel
  const slopeFoot = [D / 2 - 0.05, 0.012];     // bottom of the slanted outlet face
  const s = new THREE.Shape();
  s.moveTo(-D / 2, 0.11);                      // back, where the underside meets the wall
  s.quadraticCurveTo(-D / 2 + 0.01, 0.005, -D / 2 + 0.09, 0);
  s.lineTo(...slopeFoot);
  s.lineTo(zf, panelBottom);
  s.lineTo(zf, H);
  s.lineTo(-D / 2, H);
  s.lineTo(-D / 2, 0.11);
  const cg = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false, curveSegments: 8 });
  cg.rotateY(-Math.PI / 2);
  cg.translate(W / 2, 0, 0);
  g.add(new THREE.Mesh(cg, body));

  // Front panel with softened edges, and the logo mark.
  const ph = H - panelBottom;
  const panel = new THREE.Mesh(new RoundedBoxGeometry(W, ph, panelT, 2, 0.004), white);
  panel.position.set(0, panelBottom + ph / 2, D / 2 - panelT / 2);
  g.add(panel);
  const logoY = H - (p.logoFromTopMm ?? 206) / 1000;
  g.add(box([-0.022, logoY - 0.0035, D / 2], [0.022, logoY + 0.0035, D / 2 + 0.001], dark));

  // Slanted lower face: flap and sensor windows sit on it, 1–2 mm proud.
  // Vectors are (z, y). Local Y of a part = the face's outward normal, local Z = down the slope.
  const a = new THREE.Vector2(zf, panelBottom), b = new THREE.Vector2(...slopeFoot);
  const len = a.distanceTo(b);
  const dir = b.clone().sub(a).normalize();
  const n = new THREE.Vector2(-dir.y, dir.x);         // forward and down
  const tilt = Math.atan2(n.x, n.y);
  const onSlope = (mesh, x, t, out) => {              // t = 0 at the top edge … 1 at the foot
    mesh.position.set(x, a.y + (b.y - a.y) * t + n.y * out, a.x + (b.x - a.x) * t + n.x * out);
    mesh.rotation.x = tilt;
    g.add(mesh);
  };
  onSlope(new THREE.Mesh(new THREE.BoxGeometry(flapX[1] - flapX[0], 0.004, len * 0.72), flap),
    (flapX[0] + flapX[1]) / 2, 0.5, 0.002);
  // Sensor windows: light grey discs with a dark centre (cylinder axis = local Y = normal).
  const lens = new THREE.MeshStandardMaterial({ color: 0xcfd0d0, roughness: 0.35 });
  for (const [xmm, rmm] of p.sensorsMm || [[700, 9], [745, 12]]) { // [centre from the left, radius]
    const x = xmm / 1000 - W / 2, r = rmm / 1000;
    onSlope(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.003, 20), lens), x, 0.45, 0.0015);
    onSlope(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.4, 0.003, 16), dark), x, 0.45, 0.0025);
  }
  return g;
}

// The shower tray's top face (colour, also its bump): stone speckle, the step and the
// drain cover outline. 1 px ≈ 1.6 mm, canvas top = the drain edge.
function paintTrayTop(ctx, cw, ch, { W, color, coverW, coverD, coverFrom, stepAt, stepInset }) {
  const PX = cw / (W * 1000);
  // Stone speckle: per-pixel noise, blurred once by drawing the canvas back over itself.
  const img = ctx.createImageData(cw, ch);
  const base = new THREE.Color(color), r = rng(95043721);
  const grain = new Float32Array(Math.ceil(cw / 2) * Math.ceil(ch / 2)).map(() => r());
  for (let i = 0; i < cw * ch; i++) {                   // 2 px grains + fine noise
    const x = i % cw, y = (i / cw) | 0;
    const f = 0.93 + grain[(y >> 1) * Math.ceil(cw / 2) + (x >> 1)] * 0.07 + r() * 0.04;
    img.data[i * 4] = base.r * 255 * f;
    img.data[i * 4 + 1] = base.g * 255 * f;
    img.data[i * 4 + 2] = base.b * 255 * f;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(ctx.canvas, 1, 1);
  ctx.globalAlpha = 1;
  const mm = (v) => v * PX;
  const cx = cw / 2, cx0 = cx - mm(coverW) / 2, cx1 = cx + mm(coverW) / 2;
  const cy0 = mm(coverFrom), cy1 = mm(coverFrom + coverD), cr = mm(17);
  // Step: a shadowed crescent, thick at the cover and a point at each end.
  const sy = mm(stepAt), x0 = mm(stepInset), x1 = cw - mm(stepInset), t = Math.max(2.5, mm(5));
  ctx.fillStyle = shade(color, 0.55);
  ctx.beginPath();
  ctx.moveTo(x0, sy);
  ctx.quadraticCurveTo(cx0, sy - t * 0.1, cx0, sy - t / 2);
  ctx.lineTo(cx1, sy - t / 2);
  ctx.quadraticCurveTo(cx1, sy - t * 0.1, x1, sy);
  ctx.quadraticCurveTo(cx1, sy + t * 0.15, cx1, sy + t / 2);
  ctx.lineTo(cx0, sy + t / 2);
  ctx.quadraticCurveTo(cx0, sy + t * 0.15, x0, sy);
  ctx.fill();
  // Drain cover: a thin shadow gap all round, top corners rounded.
  ctx.strokeStyle = shade(color, 0.6);
  ctx.lineWidth = Math.max(1.5, mm(2.5));
  ctx.beginPath();
  ctx.moveTo(cx0, cy1);
  ctx.lineTo(cx0, cy0 + cr);
  ctx.arcTo(cx0, cy0, cx0 + cr, cy0, cr);
  ctx.lineTo(cx1 - cr, cy0);
  ctx.arcTo(cx1, cy0, cx1, cy0 + cr, cr);
  ctx.lineTo(cx1, cy1);
  ctx.stroke();
}

// Flat resin shower tray (Sensea NEO): a thin slab, drain at the back (−Z) short edge.
// The top relief is only millimetres deep, so it is drawn on the top face (colour +
// bump) instead of modelled:
//   - a fine mineral stone texture (the anti-slip finish);
//   - a straight step across the width in front of the drain, deepest at the cover and
//     tapering to nothing near each side (the field slopes down to it);
//   - the flush drain cover, top corners rounded, bottom edge on the step.
// Positions are measured on Leroy Merlin's straight top-down photo (docs/furniture.md).
function showerTray(entry) {
  const [W, H, D] = (entry.sizeMm || [800, 27, 1200]).map((v) => v / 1000);
  const p = entry.params || {};
  const color = p.color ?? 0xf0f0f0;
  const [coverW, coverD] = p.coverMm || [210, 136];      // drain cover, across × along
  const coverFrom = p.coverFromEdgeMm ?? 37;              // cover's back edge from the tray edge
  const stepAt = p.stepFromEdgeMm ?? 171;                  // step line from the drain edge
  const stepInset = p.stepInsetMm ?? 41;                   // where the step fades, from each side
  // Top face canvas: 1 px ≈ 1.6 mm, canvas top = the drain edge (−Z). Painted in the
  // texture worker (paintTrayTop).
  const ch = Math.round(D * 1000 * 512 / (W * 1000));
  const map = paintedTexture('furnTrayTop', { W, color, coverW, coverD, coverFrom, stepAt, stepInset }, 512, ch, { wrap: THREE.ClampToEdgeWrapping, placeholder: color });
  const top = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.8, roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const g = new THREE.Group();
  g.name = entry.name || 'shower-tray';
  // BoxGeometry's +Y face maps canvas top (v = 1) to −Z: the drain edge.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [side, side, top, side, side, side]);
  slab.position.y = H / 2;
  g.add(slab);
  return g;
}

// Upright piano, traditional cabinet (W. Hoffmann Vision V120; sources in docs/furniture.md).
// W × H × D from the catalog `sizeMm` (151 × 120 × 62 cm). Back at −Z, keys toward +Z.
// Heights and depths not published are standard upright proportions, as `params` (mm):
//   - the upper case (lid, upper panel, sides) is `caseDepthMm` deep from the back;
//   - the keybed juts forward to about the leg fronts; white-key top at `keyTopMm`;
//   - 88 keys (52 white, 23.55 mm pitch) centred between the cheek blocks;
//   - curved front legs on toe blocks that reach the full depth, brass castors;
//   - a recessed lower panel with three brass pedals. Polished black, brass fittings.
function uprightPiano(entry) {
  const [W, H, D] = (entry.sizeMm || [1510, 1200, 620]).map((v) => v / 1000);
  const p = entry.params || {};
  const mm = (v, d) => (v ?? d) / 1000;
  const caseD = mm(p.caseDepthMm, 370);    // upper case depth from the back
  const keyTop = mm(p.keyTopMm, 720);      // white-key top
  const keybedBottom = mm(p.keybedBottomMm, 640);
  const armTop = mm(p.armTopMm, 790);      // cheek block top
  const lidT = 0.022, sideT = 0.028;
  const zb = -D / 2, zCase = zb + caseD;   // back face, upper-case front face
  const zSlip = D / 2 - mm(p.slipInsetMm, 75); // key-slip front
  const keysW = 52 * 0.02355;
  const black = new THREE.MeshStandardMaterial({ color: p.color ?? 0x0a0a0b, roughness: 0.12, metalness: 0.05 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a44c, roughness: 0.28, metalness: 1 });
  const ebony = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.4 });
  const felt = new THREE.MeshStandardMaterial({ color: 0x5a1a1d, roughness: 0.9 });
  const g = new THREE.Group();
  g.name = entry.name || 'upright-piano';

  // Case: two full-height sides, back, lid (overhanging a little), upper panel.
  for (const sx of [-1, 1]) {
    g.add(box([sx < 0 ? -W / 2 : W / 2 - sideT, 0.02, zb], [sx < 0 ? -W / 2 + sideT : W / 2, H - lidT, zCase], black));
  }
  g.add(box([-W / 2 + sideT, 0.02, zb], [W / 2 - sideT, H - lidT, zb + 0.02], black));
  g.add(box([-W / 2 - 0.004, H - lidT, zb - 0.004], [W / 2 + 0.004, H, zCase + 0.012], black));
  const fallTop = mm(p.fallboardTopMm, 890);
  g.add(box([-W / 2 + sideT, fallTop, zCase - 0.03], [W / 2 - sideT, H - lidT, zCase], black));
  // Cheek blocks beside the keys, from the keybed to the arm top, out to the key slip.
  const cheekW = (W - keysW) / 2;
  for (const sx of [-1, 1]) {
    const xo = sx * W / 2, xi = sx * (keysW / 2);
    const c = new THREE.Mesh(new RoundedBoxGeometry(cheekW, armTop - keybedBottom, zSlip - zCase + 0.02, 2, 0.012), black);
    c.position.set((xo + xi) / 2, (armTop + keybedBottom) / 2, (zCase - 0.02 + zSlip) / 2);
    g.add(c);
  }
  // Keybed and key slip under the keys.
  g.add(box([-keysW / 2, keybedBottom, zCase - 0.02], [keysW / 2, keyTop - 0.024, zSlip], black));
  // Fallboard: from behind the keys up to the upper panel, its front rounded.
  const fb = new THREE.Mesh(new RoundedBoxGeometry(keysW, fallTop - (keyTop + 0.012) + 0.01, 0.085, 3, 0.02), black);
  fb.position.set(0, (keyTop + 0.012 + fallTop) / 2, zCase + 0.085 / 2 - 0.035);
  g.add(fb);
  // Brass strip along the fallboard just above the keys (photos), the maker's mark on it,
  // and the music-desk bar above the fallboard.
  const fbFront = zCase + 0.05;
  g.add(box([-keysW / 2 + 0.01, keyTop + 0.024, fbFront - 0.004], [keysW / 2 - 0.01, keyTop + 0.029, fbFront + 0.001], brass));
  g.add(box([-0.04, keyTop + 0.034, fbFront - 0.004], [0.04, keyTop + 0.042, fbFront + 0.001], brass));
  g.add(box([-0.32, fallTop + 0.05, zCase], [0.32, fallTop + 0.085, zCase + 0.025], black));
  // Keys: a white-key slab with the 52 key divisions drawn on top, red felt strip behind,
  // and the 36 black keys merged into one mesh.
  const keyZ0 = zCase + 0.012, keyZ1 = zSlip - 0.004, keyLen = keyZ1 - keyZ0;
  const keyMap = paintedTexture('furnKeys', null, 1024, 1024, { wrap: THREE.ClampToEdgeWrapping, placeholder: 0xf3f1ea });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const whiteTop = new THREE.MeshStandardMaterial({ map: keyMap, roughness: 0.3 });
  const whites = new THREE.Mesh(new THREE.BoxGeometry(keysW, 0.022, keyLen), [white, white, whiteTop, white, white, white]);
  whites.position.set(0, keyTop - 0.011, (keyZ0 + keyZ1) / 2);
  g.add(whites);
  g.add(box([-keysW / 2, keyTop, keyZ0 - 0.004], [keysW / 2, keyTop + 0.006, keyZ0 + 0.006], felt));
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const blacks = [];
  for (let i = 0; i < 51; i++) { // a black key after A, C, D, F, G (never after the top C)
    if (!'ACDFG'.includes(names[i % 7])) continue;
    const bg = new THREE.BoxGeometry(0.0135, 0.012, 0.095);
    bg.translate(-keysW / 2 + (i + 1) * 0.02355, keyTop + 0.006, keyZ0 + 0.095 / 2);
    blacks.push(bg);
  }
  g.add(new THREE.Mesh(mergeGeometries(blacks), ebony));
  // Lower panel, recessed at the case front, with a kick rail; three brass pedals.
  g.add(box([-W / 2 + sideT, 0.02, zCase - 0.03], [W / 2 - sideT, keybedBottom, zCase - 0.01], black));
  for (const [i, x] of [-0.07, 0, 0.07].entries()) {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.1), brass);
    ped.position.set(x, 0.07 - (i === 1 ? 0.004 : 0), zCase + 0.03);
    ped.rotation.x = 0.12;
    g.add(ped);
  }
  // Toe blocks from the case sides forward to the full depth, legs standing on them.
  const legX = W / 2 - cheekW / 2, toeH = 0.065, toeW = 0.055;
  const legD = mm(p.legDepthMm, 60), legFront = zSlip - 0.01;
  for (const sx of [-1, 1]) {
    const x = sx * legX;
    g.add(box([x - toeW / 2, 0.02, zCase - 0.02], [x + toeW / 2, 0.02 + toeH, D / 2], black));
    // Leg: side profile in (z, y), front edge swelling out toward the foot, extruded across X.
    const s = new THREE.Shape();
    const y0 = 0.02 + toeH, y1 = keybedBottom;
    s.moveTo(legFront - legD, y0);
    s.lineTo(legFront + 0.018, y0);
    s.bezierCurveTo(legFront - 0.02, y0 + 0.12, legFront + 0.01, y1 - 0.25, legFront, y1);
    s.lineTo(legFront - legD, y1);
    s.bezierCurveTo(legFront - legD - 0.015, y1 - 0.2, legFront - legD + 0.012, y0 + 0.2, legFront - legD, y0);
    const lg = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 10 });
    lg.rotateY(-Math.PI / 2); // shape x → world +Z, extrusion → −X
    lg.translate(x + 0.025, 0, 0);
    g.add(new THREE.Mesh(lg, black));
    // Brass castors: under each toe block's front and under the case back.
    for (const z of [D / 2 - 0.03, zb + 0.04]) {
      const cst = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), brass);
      cst.rotation.z = Math.PI / 2;
      cst.position.set(x, 0.018, z);
      g.add(cst);
    }
  }
  return g;
}

// Hot-water towel radiator, ladder type (ACOVA Angora, "TYPE P34"): two round vertical
// collectors joined by round horizontal bars in three groups (dense, widely spaced, dense),
// held off the wall by four brackets. Wall at −Z, front toward +Z; the catalog `mountZMm`
// lifts it on drop (the foot is the collectors' bottom end).
//
// Sources:
//   - Leroy Merlin 69044605 (615 W, H 133.2 × L 50 cm):
//     https://www.leroymerlin.fr/produits/seche-serviettes-a-eau-chaude-acova-615-w-h-133-2-x-l-50-cm-angora-69044605.html
//   - Leroy Merlin 69044626 (795 W, H 172.8 × L 50 cm):
//     https://www.leroymerlin.fr/produits/seche-serviettes-eau-chaude-acova-795-w-h-172-8-x-l-50-cm-angora-blanc-69044626.html
//   - Spec tables (both pages): "Largeur 50", "Hauteur 133.2" / "172.8", "Profondeur 8",
//     "Epaisseur totale avec fixations 8.9", "Entraxe (en mm) 462", "Forme des tubes Rond",
//     "Couleur Blanc"; 10.2 / 13 kg.
//   - Dimension photos, media 1630521 (133.2) and 1733745 (172.8): "Epaisseur : 3.8 cm"
//     (the collector diameter), "Epaisseur totale (avec fixations) : entre 8.9 cm et 9.9 cm".
//   - Installation manual "TYPE P34" (media 1316977, both pages link it): L 500 / H 1008, 1332;
//     brackets L1 = L − 150 apart across and H1 = H − 180 apart up (so 90 mm from each end);
//     connections N = L − 38 = 462 mm apart (the collector centres); wall to the tube axis 70–80
//     mm; 4 brackets. Its 1728 mm size isn't drawn; the same rules are assumed (Hypothesis).
//   - Close-up media 3273996: bar vs collector diameter (25 vs 38 mm), the grey ACOVA badge on
//     the top bar next to the left collector (about 36 × 12 mm, 11 mm from it), a bracket's round
//     standoff and square clip behind a bar.
//   - Bar layout measured on media 1630521 and 1733745, scaled by the collector length
//     (1.47 and 1.77 mm/px): `params.rows` [count, pitch units] with `params.groupGapUnits`
//     between groups; first/last bar centres `topMm`/`bottomMm` from the ends (estimates, ±3 mm).
//     The bars are spread evenly on those units, about 36–37 mm per unit.
//   - Air vent on top of the right collector: media 1619614 (size an estimate).
//   Not modelled: the valves (sold separately) and the towel hooks (media 1631660).
function towelRadiator(entry) {
  const [W, H, D] = (entry.sizeMm || [500, 1332, 89]).map((v) => v / 1000);
  const p = entry.params || {};
  const mm = (v, d) => (v ?? d) / 1000;
  const colR = mm(p.collectorMm, 38) / 2;            // "Epaisseur : 3.8 cm"
  const barR = mm(p.barMm, 25) / 2;                  // close-up 3273996 (estimate)
  const colX = mm(p.entraxeMm, 462) / 2;             // "Entraxe 462"
  const axisZ = D / 2 - colR;                        // collector front at +D/2: wall to axis 70 mm
  const white = new THREE.MeshStandardMaterial({ color: p.color ?? 0xf1f1ee, roughness: 0.35 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8cacc, roughness: 0.2, metalness: 0.8 });
  const g = new THREE.Group();
  g.name = entry.name || 'towel-radiator';

  // Collectors, closed flat at both ends.
  for (const x of [-colX, colX]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(colR, colR, H, 24), white);
    c.position.set(x, H / 2, axisZ);
    g.add(c);
  }
  // Bars: positions in pitch units from the top, then spread between topMm and bottomMm.
  const rows = p.rows || [[6, 1], [5, 2], [16, 1]];
  const gap = p.groupGapUnits ?? 3;
  const units = [];
  for (const [n, step] of rows) {
    for (let i = 0; i < n; i++) {
      const last = units[units.length - 1];
      units.push(last === undefined ? 0 : last + (i ? step : gap));
    }
  }
  const yTop = H - mm(p.topMm, 44), yBottom = mm(p.bottomMm, 40);
  const unitM = (yTop - yBottom) / units[units.length - 1];
  const barGeo = new THREE.CylinderGeometry(barR, barR, colX * 2, 16);
  barGeo.rotateZ(Math.PI / 2);
  const barY = units.map((k) => yTop - k * unitM);
  for (const y of barY) {
    const b = new THREE.Mesh(barGeo, white);
    b.position.set(0, y, axisZ);
    g.add(b);
  }

  // ACOVA badge on the top bar's front, next to the left collector (close-up 3273996).
  const badge = paintedTexture('furnBadge', null, 128, 128, { wrap: THREE.ClampToEdgeWrapping, placeholder: 0xb9bcbf });
  badge.repeat.set(1, 0.34); badge.offset.set(0, 0.33);   // a 3:1 strip of the square canvas
  const bw = 0.036, bh = 0.012;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ map: badge, roughness: 0.4 }));
  plate.position.set(-colX + colR + 0.011 + bw / 2, barY[0], axisZ + barR + 0.0008);
  g.add(plate);

  // Air vent on top of the right collector (media 1619614).
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.012, 16), chrome);
  vent.position.set(colX, H + 0.006, axisZ);
  g.add(vent);

  // Four brackets (manual: L − 150 across, 90 mm from each end): a round standoff from the
  // wall to the back of the nearest bar, and a square clip around it.
  const bx = (W - mm(p.bracketInsetMm, 150)) / 2;
  const standR = 0.011;
  const clipGeo = new THREE.BoxGeometry(0.016, barR * 2 + 0.006, 0.016);
  for (const yEnd of [H - 0.09, 0.09]) {
    const y = barY.reduce((a, b) => (Math.abs(b - yEnd) < Math.abs(a - yEnd) ? b : a));
    for (const x of [-bx, bx]) {
      const len = axisZ - barR - (-D / 2);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(standR, standR, len, 16), white);
      s.rotation.x = Math.PI / 2;
      s.position.set(x, y, -D / 2 + len / 2);
      g.add(s);
      const clip = new THREE.Mesh(clipGeo, white);
      clip.position.set(x, y, axisZ - barR + 0.004);
      g.add(clip);
    }
  }
  return g;
}

// Steel panel radiator (De'Longhi EASY, vertical and horizontal): a flat-sided body whose
// front has a row of deep vertical slots inside a flat border (top and bottom bands, side
// borders), standing off the wall on hidden brackets. The double-panel horizontal model
// adds an open convector grille on top and pipe ports in its side covers. Wall at −Z,
// front toward +Z; the catalog `mountZMm` lifts it on drop (the foot is the body's bottom).
//
// Sources:
//   - Leroy Merlin 82273209 (vertical, 1730 W, l 50 × H 200 cm):
//     https://www.leroymerlin.fr/produits/radiateur-eau-chaude-1730w-l-50xh-200-cm-easy-de-longhi-vertical-blanc-82273209.html
//     Spec table: "Largeur 50", "Hauteur 200", "Profondeur 7", "Epaisseur totale avec
//     fixations 10.1", "Raccordement par le bas", "Entraxe 44 ou 5", "Aspect Brillant", 46.8 kg.
//     Room photo 4047392 (straight front, about 3.1 mm/px): 14 slots, stopping 36–39 mm from
//     the top and bottom (`insetMm` 38). Studio render 906020: flat closed sides, plain top.
//   - Leroy Merlin 82273208 (vertical, 1601 W, l 50 × H 180 cm):
//     https://www.leroymerlin.fr/produits/radiateur-eau-chaude-1601w-l-50xh-180-cm-easy-de-longhi-vertical-blanc-82273208.html
//     Spec table: "Largeur 50", "Hauteur 180", "Profondeur 7", "Epaisseur totale avec
//     fixations 10.1", "Entraxe 44 ou 5", 45.01 kg. Studio render 905084: 14 slots. Its
//     manual (media 5497890, De'Longhi "Plattella / Linear") draws the "C6 Vertical" range:
//     type 21 is 70 mm deep, matching the spec, so this is a type-21 body. Room photo 4047391.
//   - Leroy Merlin 82273211 (vertical, 2076 W, l 60 × H 200 cm):
//     https://www.leroymerlin.fr/produits/radiateur-eau-chaude-2076w-l-60xh-200-cm-easy-de-longhi-vertical-blanc-82273211.html
//     Spec table: "Largeur 60", "Hauteur 200", "Profondeur 7", "Epaisseur totale avec
//     fixations 10.1", "Entraxe 54 ou 5", 53.6 kg (1.2 × the 50 cm one's power and weight:
//     the same construction). Studio render 912126: 17 slots (counted at its top end; the
//     50 cm render 906020 shows 14), which is the 33.3 mm pitch on 60 cm. Its room photo
//     4047395 shows 18 at the 50 cm photo's exact pixel pitch: an edited image, not used.
//     Not to be confused with 82273207 (1888 W, same size, flat front, media 996632).
//   - Leroy Merlin 88144739 (horizontal, 1448 W, l 90 × H 60 cm):
//     https://www.leroymerlin.fr/produits/radiateur-eau-chaude-1448w-l-90xh-60-cm-easy-de-longhi-horizontal-blanc-88144739.html
//     Spec table: "Largeur 90", "Hauteur 60", "Profondeur 10", "Epaisseur totale avec
//     fixations 13.2", "Raccordement Latéral", 4 connections, "Entraxe 5400" (read as 540 mm
//     between the top and bottom ports), 29.4 kg; manual media 3746505.
//     Straight front studio photo 3722974 (0.95 mm/px from the 900 × 600 body): 26 slots at
//     33.3 mm (`pitchMm`), about 25 mm from each side, stopping 46 mm from the top and bottom.
//     Top views 3722980 and 3722976: an open grille over the convector fins in two halves;
//     3722976 also shows a round port in the side cover. Room photo 4047397.
//   - Leroy Merlin 82273196 (horizontal, 1930 W, l 120 × H 60 cm):
//     https://www.leroymerlin.fr/produits/radiateur-eau-chaude-1930w-l-120xh-60-cm-easy-de-longhi-horizontal-blanc-82273196.html
//     Spec table: "Largeur 120", "Hauteur 60", "Profondeur 10", "Epaisseur totale avec
//     fixations 13.2", "Entraxe 54" (cm: confirms the 90 cm page's "5400" as 540 mm),
//     "Raccordement Latéral", 37.68 kg; 1.33 × the 90 cm one's power. Room photo 4047370
//     (straight front, 2.39 mm/px from the 1200 mm body): 35 slots at 33.5 mm. Studio
//     render 1064260 (¾): the same grille and ports as the 90 cm one.
//   - All: slots centred at `pitchMm` (default 33.3, measured on 3722974); slot width 15 mm
//     and depth 8 mm (`slotMm`, `depthMm`) are estimates from the photos' shading; the slot
//     floor is drawn darker to stand in for the shadow inside; brackets are hidden blocks;
//     valves are not part of the product and not modelled.
function panelRadiator(entry) {
  const [W, H, D] = (entry.sizeMm || [500, 2000, 101]).map((v) => v / 1000);
  const p = entry.params || {};
  const mm = (v, d) => (v ?? d) / 1000;
  const gap = mm(p.wallGapMm, 31);                 // total with brackets − body depth
  const depth = mm(p.depthMm, 8);
  const slotW = mm(p.slotMm, 15);
  const inset = mm(p.insetMm, 38);
  const pitch = mm(p.pitchMm, 33.3);
  const n = p.slots ?? Math.max(1, Math.round((W - 0.05 - slotW) / pitch) + 1);
  const edge = (W - (n - 1) * pitch - slotW) / 2;
  const white = new THREE.MeshStandardMaterial({ color: p.color ?? 0xf3f3f1, roughness: 0.25 });
  const floor = new THREE.MeshStandardMaterial({ color: 0xc2c4c6, roughness: 0.6 });
  const g = new THREE.Group();
  g.name = entry.name || 'panel-radiator';

  // Top: plain, or an open grille (dark fins, light slats, split in two halves).
  let top = white;
  if (p.topGrille) {
    const map = paintedTexture('furnGrille', { W, color: p.color ?? 0xf3f3f1 }, 512, 512, { wrap: THREE.ClampToEdgeWrapping, placeholder: 0x8a8c8e });
    top = new THREE.MeshStandardMaterial({ map, roughness: 0.5 });
  }
  // Body; its front face is the slot floor.
  const zFront = D / 2, zSlot = zFront - depth, zBack = -D / 2 + gap;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, zSlot - zBack), [white, white, top, white, floor, white]);
  body.position.set(0, H / 2, (zSlot + zBack) / 2);
  g.add(body);
  // Front border: top and bottom bands, then the side borders and the strips between
  // slots with rounded front edges.
  g.add(box([-W / 2, H - inset, zSlot], [W / 2, H, zFront], white));
  g.add(box([-W / 2, 0, zSlot], [W / 2, inset, zFront], white));
  const parts = [];
  const strip = (x0, x1) => {
    const s = new RoundedBoxGeometry(x1 - x0, H - 2 * inset, depth * 2, 2, Math.min(0.004, (x1 - x0) / 3));
    s.translate((x0 + x1) / 2, H / 2, zSlot);
    parts.push(s);
  };
  strip(-W / 2, -W / 2 + edge);
  for (let k = 0; k < n - 1; k++) strip(-W / 2 + edge + k * pitch + slotW, -W / 2 + edge + (k + 1) * pitch);
  strip(W / 2 - edge, W / 2);
  g.add(new THREE.Mesh(mergeGeometries(parts), white));
  // Side ports (horizontal model): a grey ring with a dark bore at each end, top and
  // bottom, `portsMm` apart, centred in the depth.
  if (p.portsMm) {
    const ring = new THREE.MeshStandardMaterial({ color: 0xb4b7ba, roughness: 0.4, metalness: 0.3 });
    const bore = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.8 });
    const off = (H - p.portsMm / 1000) / 2, zc = (zFront + zBack) / 2;
    for (const y of [H - off, off]) {
      for (const sx of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.002, 20), ring);
        r.rotation.z = Math.PI / 2; r.position.set(sx * (W / 2 + 0.001), y, zc); g.add(r);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.003, 16), bore);
        c.rotation.z = Math.PI / 2; c.position.set(sx * (W / 2 + 0.0005), y, zc); g.add(c);
      }
    }
  }
  // Brackets: short blocks from the wall to the back, near the top and bottom.
  const by = Math.min(0.15, H / 4), bx = Math.min(0.08, W / 4);
  for (const y of [H - by, by]) {
    for (const x of [-W / 2 + bx, W / 2 - bx]) g.add(box([x - 0.015, y - 0.02, -D / 2], [x + 0.015, y + 0.02, zBack], white));
  }
  return g;
}

// Double pedal bin (JOYFURNOS 2 × 30 L): a powder-coated steel body with rounded
// vertical corners, a brushed-steel top frame holding two cream lids side by side
// (closed), a black gasket line under the frame, a black base band, a recessed black
// handle in each side and two brushed pedals in black housings at the front, one under
// each bucket. Front toward +Z.
//
// Sources:
//   - Joybuy 100001750045278, "JOYFURNOS Poubelle double à pédale, 2 seaux amovibles,
//     couvercle à fermeture douce", colour Crème (also Blanc et gris, Gris verdâtre, Gris
//     ardoise, Argent et Noir):
//     https://www.joybuy.fr/dp/joyfurnos-poubelle-double-%C3%A0-p%C3%A9dale-2/100001750045278
//     No spec table on the page ("Pays d'Origine Chine", "Marque JOYFURNOS" only).
//   - Gallery image 6a4cad01E11ac9d64 (dimension drawing): "2 x 30 L", width 59 cm,
//     depth 36,5 cm, height 62,4 cm closed, 91 cm with a lid open (`sizeMm`). On its
//     near-straight front (1.39 px/mm vertically): top frame 24 mm tall (`rimMm`), a 6 mm
//     black gasket under it, a 16 mm black base band (`baseMm`), pedals 27 mm tall in black
//     housings topping out at 82 mm, about 130 mm wide (`pedal`); the pedal centre reads
//     61 mm here and 43 mm on the ¾ render 6a4cad01Edf4c5c27 (perspective): 52 mm used. The
//     housing shows black above the pedal (the pedal travels in it);
//     side handle 47 mm tall, its top 43 mm below the frame top (`handle`).
//   - Gallery 6a4cad01Edf4c5c27 (front ¾ studio render): rounded vertical corners, the
//     frame slightly proud of the body, the lid seam in the middle; body colour sampled at
//     about rgb(229, 222, 208) under the render's light. `color` 0xf0e8da gives the same hue
//     in the scratch preview (rgb(211, 206, 194); the first guess 0xebe3d1 read yellow-green).
//   - Gallery 6a4cad01E16a88556 / 6a4cad02E13ffa38e (lids open): one black inner bucket per
//     lid, hinged at the back (not modelled: drawn closed).
//   - Estimates: pedal centres ±145 mm (the two photos disagree, 130–156; placed under each
//     bucket), pedal projection 20 mm (included in the 365 mm depth), handle width 100 mm
//     along the depth, corner radius 25 mm, lid inset 14 mm inside the frame.
function pedalBin(entry) {
  const [W, H, D] = (entry.sizeMm || [590, 624, 365]).map((v) => v / 1000);
  const p = entry.params || {};
  const mm = (v, d) => (v ?? d) / 1000;
  const rim = mm(p.rimMm, 24), base = mm(p.baseMm, 16), gasket = 0.006;
  const proj = mm(p.pedal?.projMm, 20), r = mm(p.cornerMm, 25);
  const bodyD = D - proj, zc = -proj / 2; // body centred behind the pedals
  const coat = new THREE.MeshStandardMaterial({ color: p.color ?? 0xf0e8da, roughness: 0.55 });
  // Brushed steel kept mostly dielectric: the AR and View 3D scenes have no environment
  // map, so a strongly metallic surface renders near-black.
  const steel = new THREE.MeshStandardMaterial({ color: 0xd4d7db, roughness: 0.35, metalness: 0.25 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.7 });
  const g = new THREE.Group();
  g.name = entry.name || 'pedal-bin';
  const rounded = (w, h, d, y, material, radius = r) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, d / 2, h / 2)), material);
    m.position.set(0, y, zc);
    return m;
  };
  // Base band, body, gasket line, steel frame (2 mm proud), then the two lids.
  g.add(rounded(W - 0.004, base, bodyD - 0.004, base / 2, black));
  const bodyH = H - rim - gasket - base;
  g.add(rounded(W, bodyH, bodyD, base + bodyH / 2, coat));
  g.add(rounded(W - 0.002, gasket, bodyD - 0.002, H - rim - gasket / 2, black));
  g.add(rounded(W + 0.004, rim, bodyD + 0.004, H - rim / 2, steel));
  const inset = mm(p.lidInsetMm, 14), seam = 0.004;
  const lidW = (W - 2 * inset - seam) / 2, lidD = bodyD - 2 * inset;
  for (const sx of [-1, 1]) {
    const lid = new THREE.Mesh(new RoundedBoxGeometry(lidW, 0.004, lidD, 2, 0.0015), coat);
    lid.position.set(sx * (seam / 2 + lidW / 2), H - 0.0015, zc);
    g.add(lid);
  }
  // Side handles: a black recess plate flush with each side, near the top.
  const hW = mm(p.handle?.wMm, 100), hH = mm(p.handle?.hMm, 47), hTop = mm(p.handle?.topMm, 43);
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.0005);
    g.add(box([x - 0.001, H - hTop - hH, zc - hW / 2], [x + 0.001, H - hTop, zc + hW / 2], black));
  }
  // Pedals: a black housing on the front face, the brushed pedal standing out of it.
  const pw = mm(p.pedal?.wMm, 130), ph = mm(p.pedal?.hMm, 27), py = mm(p.pedal?.yMm, 52);
  const hTopP = mm(p.pedal?.housingTopMm, 82);
  const off = mm(p.pedal?.offMm, 145), zFace = zc + bodyD / 2;
  for (const sx of [-1, 1]) {
    const x = sx * off;
    g.add(box([x - pw / 2 + 0.004, py - ph / 2 - 0.003, zFace - 0.001], [x + pw / 2 - 0.004, hTopP, zFace + 0.002], black));
    const pedal = new THREE.Mesh(new RoundedBoxGeometry(pw, ph, proj, 2, 0.004), steel);
    pedal.position.set(x, py, zFace + proj / 2);
    g.add(pedal);
  }
  return g;
}

// Sauter Agalina extra-plat: a single-flow self-regulating VMC unit (box only; the
// vents and ducts are the plan's VMC pipes, docs/plumbing-workflow.md "VMC").
// W × H × D from the catalog `sizeMm` (379 × 150 × 372). Front (+Z) = the face with the
// two Ø80 sockets; the kitchen Ø125 is on −X, the OUT Ø125 and one Ø80 at the back (−Z),
// one Ø80 on +X. Ducts are pushed onto the spigots, so a spigot stands out of the box
// footprint (the plan zone is the body only).
//
// Sources:
//   - Product page https://www.leroymerlin.fr/produits/kit-vmc-simple-flux-auto-a-detection-humidite-sauter-agalina-extra-plat-80127930.html
//     (Leroy Merlin 80127930), spec table: "Dimension du caisson (LxHxP) (en cm): 37,9x15x37,2",
//     "Nombre de piquages sanitaires (diamètre 80 mm): 4", "Nombre de piquages cuisine (diamètre
//     125 mm): 1", "Diamètre piquage rejet (en mm): 125", "Emplacement du caisson préconisé: Faux
//     plafond", "Poids du produit nu (en kg): 3.7".
//   - Notice (media 4666866, Sauter ref 123 209) p. 2: the dimension drawing (379 wide across the
//     socket face, 372 deep, 150 high, Ø125 kitchen on the left side, Ø80 on the right side), the
//     exploded view (A–I); p. 5: fixed by 4 silentblocs or hung by cords.
//   - Exploded view (media 4532339) p. 2–3: kitchen Ø125 regulated, rejet Ø125, Ø80 15/30 m³/h,
//     125→80 adapter rings in the two front sockets.
//   - Photos: media 1704578 (front, the dimensioned view: socket centres at about 0.28 and 0.71
//     of the 379 width, kitchen spigot ~85 mm long, the base wider than the body with corner
//     feet), media 1604438 (top: the lid's fan and OUT arrow; the back carries OUT near the
//     kitchen side and an Ø80 near the other; the +X Ø80 ~0.27 of the depth from the front;
//     the kitchen Ø125 ~0.68 of the depth from the front), media 3592542 / 3592541 (body
//     black, lid dark grey graphic, kitchen and bathroom spigots blue, the others light grey).
//   Port positions, spigot lengths and the lid graphic are photo estimates.
// `params.wall` (owner, 2026-10-07: "can it be placed flat on the wall?"; notice p. 1: "montage
// possible dans toutes les positions"): the same box on its back, base against the wall (−Z),
// the socket face up, OUT down; `sizeMm` is then 379 W × 372 H × 150 D.
function vmcAgalina(entry) {
  if (entry.params?.wall) {
    const [W, H, D] = (entry.sizeMm || [379, 372, 150]).map((v) => v / 1000);
    const flat = vmcAgalina({ ...entry, sizeMm: [W * 1000, D * 1000, H * 1000], params: { ...entry.params, wall: false } });
    // Flat X → −X, flat Y (height) → Z (out of the wall), flat Z (front) → Y (up): a proper
    // rotation (det +1), 180° about (0, 1, 1).
    flat.setRotationFromMatrix(new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    flat.position.set(0, H / 2, -D / 2);
    const g = new THREE.Group();
    g.name = entry.name || 'vmc-agalina-wall';
    g.add(flat);
    return g;
  }
  const [W, H, D] = (entry.sizeMm || [379, 150, 372]).map((v) => v / 1000);
  const p = entry.params || {};
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.6 });
  const lidMark = new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x5b9bd5, roughness: 0.45 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.5 });
  const g = new THREE.Group();
  g.name = entry.name || 'vmc-agalina';
  // Base plate with corner feet (silentbloc tabs), then the body, a touch narrower.
  const baseH = 0.018, foot = 0.03; // base plate; 30 mm corner feet, 6 mm proud (photo estimate)
  const base = new THREE.Mesh(new RoundedBoxGeometry(W - 0.012, baseH, D - 0.012, 2, 0.006), black);
  base.position.set(0, baseH / 2, 0);
  g.add(base);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - foot / 2), z = sz * (D / 2 - foot / 2);
    g.add(box([x - foot / 2, 0, z - foot / 2], [x + foot / 2, baseH * 0.7, z + foot / 2], black));
  }
  const bw = W - 0.012, bd = D - 0.012, bh = H - baseH;
  const body = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, bd, 3, 0.02), black);
  body.position.set(0, baseH + bh / 2, 0);
  g.add(body);
  // Lid graphic: four fan blades and the OUT arrow, 1 mm proud.
  const blade = new THREE.Shape();
  blade.moveTo(0, 0);
  blade.bezierCurveTo(0.03, 0.02, 0.10, 0.03, 0.115, -0.005);
  blade.bezierCurveTo(0.12, -0.04, 0.05, -0.05, 0, 0);
  const lidY = H + 0.0008;
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(blade, 8), lidMark);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = i * Math.PI / 2;
    m.position.set(-0.02, lidY, 0.03);
    g.add(m);
  }
  const hubM = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), lidMark);
  hubM.rotation.x = -Math.PI / 2;
  hubM.position.set(-0.02, lidY + 0.0002, 0.03);
  g.add(hubM);
  // A spigot: a short tube (outer ring + darker bore) standing out of a face.
  // `axis` is the face normal ('x' | 'z'), `s` its sign, `at` the position along the face.
  const yC = baseH + bh / 2;
  const spigot = (axis, s, at, dia, len, mat, ring = false) => {
    const r = dia / 2;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24, 1, true), mat);
    const bore = new THREE.Mesh(new THREE.CircleGeometry(r * 0.94, 24), black);
    const face = (axis === 'z' ? bd : bw) / 2;
    const c = face + len / 2 - 0.004;
    if (axis === 'z') {
      tube.rotation.x = Math.PI / 2; tube.position.set(at, yC, s * c);
      bore.position.set(at, yC, s * (face + len - 0.006)); if (s < 0) bore.rotation.y = Math.PI;
    } else {
      tube.rotation.z = Math.PI / 2; tube.position.set(s * c, yC, at);
      bore.rotation.y = s * Math.PI / 2; bore.position.set(s * (face + len - 0.006), yC, at);
    }
    tube.material.side = THREE.DoubleSide;
    g.add(tube, bore);
    if (ring) { // the 125 socket around a 125→80 adapter (front face)
      const rr = new THREE.Mesh(new THREE.RingGeometry(r + 0.004, 0.068, 32), lidMark);
      if (axis === 'z') rr.position.set(at, yC, s * (face + 0.001));
      g.add(rr);
    }
  };
  const P = p.portsMm || {};
  const mm = (v, d) => (v ?? d) / 1000;
  // Front: bathroom Ø80 (blue, the humidity port) and a WC/bathroom Ø80, in 125 sockets.
  spigot('z', 1, -W / 2 + mm(P.frontBlueFromLeft, 106), 0.08, mm(P.frontLen, 55), blue, true);
  spigot('z', 1, -W / 2 + mm(P.frontGreyFromLeft, 269), 0.08, mm(P.frontLen, 55), grey, true);
  // Left (−X): kitchen Ø125, blue, toward the back.
  spigot('x', -1, D / 2 - mm(P.kitchenFromFront, 253), 0.125, mm(P.kitchenLen, 85), blue);
  // Right (+X): Ø80, toward the front.
  spigot('x', 1, D / 2 - mm(P.rightFromFront, 100), 0.08, mm(P.sideLen, 50), grey);
  // Back (−Z): OUT Ø125 near the kitchen side, an Ø80 near the other.
  spigot('z', -1, -W / 2 + mm(P.outFromLeft, 114), 0.125, mm(P.outLen, 90), grey);
  spigot('z', -1, -W / 2 + mm(P.backGreyFromLeft, 276), 0.08, mm(P.sideLen, 50), grey);
  return g;
}

// Aldes EasyHOME Hygro Compact Classic: a single-flow humidity-controlled (hygro B) VMC unit
// (box only; the vents and ducts are the plan's VMC pipes, docs/plumbing-workflow.md "VMC").
// W × H × D from the catalog `sizeMm` (360 × 187 × 361): the body, as on the Agalina; the
// spigots and the left mounting lug stand out of it (overall 459 × 460, the spec table's
// 46 × 45,9). Seen from above as in the manual's top view: front (+Z) = the OUT Ø160 (left)
// and an Ø80; back (−Z) = the kitchen Ø125 (left) and an Ø80; right (+X) = two Ø80; left
// (−X) = the base's long mounting lug, no spigot.
//
// Sources:
//   - Product page https://www.leroymerlin.fr/produits/kit-vmc-simple-flux-hygroreglable-aldes-11033404-82201371.html
//     (Leroy Merlin 82201371, Aldes 11033404), spec table: "Composition du kit: Groupe EasyHOME
//     Hygro COMPACT+ 3x Bouches Bdh", "Dimension du caisson (LxHxP) (en cm): 46X18,7X45,9",
//     "Nombre de piquages sanitaires (diamètre 80 mm): 4", "Nombre de piquages cuisine (diamètre
//     125 mm): 1", "Diamètre piquage rejet (en mm): 160", "Poids du produit nu (en kg): 7.17".
//   - Notice (media 3963727, Aldes 11028725 "EasyHOME Hygro Compact Classic / Premium …") p. 3,
//     "1.2 Dimensions": an orthographic top view and side view, rasterised at 600 dpi (2.37 px/mm:
//     the 459 overall = 1087 px, the 460 = 1090 px). Measured there:
//       body 360 × 361 (the 406 is the spacing of the two keyhole mounting holes), corners
//         r ≈ 46 (built as 50, quadratic corners); lid top 325 square, its inner panel 274;
//       spigot centres from the body centre: kitchen Ø125 x −100, back Ø80 x +95, OUT Ø160
//         x −85, front Ø80 x +95, right Ø80s z −94 and +97; every end 229–230 from the centre
//         (≈ 49 mm out of the body); outside diameters 83 / 126 / 162;
//       side view, from the bottom: base flange 0–11, body wall to 164, lid bevel to 187;
//         Ø80 and Ø125 centres at 90, the Ø160 at 95 (14–176);
//       left lug: out to 228 from the centre, 256 long (z −140 … +115), joined to the body by
//         slanted sides; right lug: a tab out to 225 at z 0, between the two right Ø80s.
//     p. 3 isometric views and p. 10 (electrical): the left lug is a flat plate at the base.
//     p. 5 "1.6": 400 mm free around the sides, 440 × 340 mm above the lid to open it.
//   - Photos: media 1703321 (straight top view, the drawing turned 180°, same 2.37 px/mm: blue
//     lid rim from the body edge to ~323 mm, black top, a blue "HYGRO" badge 113 × 31 mm centred
//     114 mm toward the OUT side, the Aldes logo mid-lid); 6045647 (3/4 view: blue rim band on a
//     black body, black spigots); 1702632 (a spigot's ribs and the flange's keyhole).
//   Lid rim height, badge and logo sizes are photo estimates; everything else is the drawing.
// `params.wall` (owner's unit B is wall-mounted): the same box with its base against the wall
// (−Z). `params.up` picks the face that points up: 'right' (default: the two right Ø80 up, OUT
// sideways toward +X, the left lug down) or 'back' (kitchen Ø125 + an Ø80 up, OUT down).
// `params.hung` (owner, 2026-10-10: unit B under the laundry ceiling): base screwed to the ceiling,
// lid down; the flat box turned 180° about its front axis, so the front (OUT) and back keep their
// sides, the two right Ø80 point toward −X and the spigot axes sit 90 mm (OUT 95) below the top.
// The notice (media 3963727 p. 4–5) shows the box hung under a ceiling in a false ceiling.
function vmcEasyhome(entry) {
  const p = entry.params || {};
  if (p.hung) {
    const flat = vmcEasyhome({ ...entry, params: { ...p, hung: false } });
    const H = (entry.sizeMm || [360, 187, 361])[1] / 1000;
    flat.rotation.z = Math.PI;
    flat.position.y = H;
    const g = new THREE.Group();
    g.name = entry.name || 'vmc-easyhome-hung';
    g.add(flat);
    return g;
  }
  if (p.wall) {
    const right = (p.up || 'right') === 'right';
    const [W, H, D] = (entry.sizeMm || (right ? [361, 360, 187] : [360, 361, 187])).map((v) => v / 1000);
    const flatSize = right ? [H, D, W] : [W, D, H];
    const flat = vmcEasyhome({ ...entry, sizeMm: flatSize.map((v) => v * 1000), params: { ...p, wall: false } });
    if (right) {
      // Flat X → +Y (up), flat Y (height) → +Z (out of the wall), flat Z (front) → +X.
      flat.setRotationFromMatrix(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    } else {
      flat.rotation.x = Math.PI / 2; // flat Y → +Z, flat Z (front, OUT) → −Y (down)
    }
    flat.position.set(0, H / 2, -D / 2);
    const g = new THREE.Group();
    g.name = entry.name || 'vmc-easyhome-wall';
    g.add(flat);
    return g;
  }
  const [W, H, D] = (entry.sizeMm || [360, 187, 361]).map((v) => v / 1000);
  const black = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.55 });
  const spigotMat = new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.5, side: THREE.DoubleSide });
  const bore = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.4 });
  const logo = new THREE.MeshStandardMaterial({ color: 0xd8dadd, roughness: 0.5 });
  const g = new THREE.Group();
  g.name = entry.name || 'vmc-easyhome';
  // A rounded rectangle w × d (corner r), extruded h upward from y0.
  const slab = (w, d, r, h, y0, mat, cx = 0, cz = 0) => {
    const s = new THREE.Shape(), x = w / 2, z = d / 2;
    s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r);
    s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z); s.lineTo(-x + r, z);
    s.quadraticCurveTo(-x, z, -x, z - r); s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2); // shape Y → −Z; extrusion → +Y
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, y0, cz);
    g.add(m);
    return m;
  };
  const flangeH = 0.011, wallTop = 0.164; // drawing p. 3 side view
  const rimH = 0.016;                      // blue rim band under the bevel (photo estimate)
  // Base flange with the two mounting lugs (keyhole slots drawn as dark plates).
  slab(W - 0.004, D - 0.004, 0.05, flangeH, 0, black);
  const lug = new THREE.Shape(); // left lug: slanted sides from the body to the plate
  lug.moveTo(-W / 2 + 0.01, 0.170); lug.lineTo(-0.205, 0.140); lug.quadraticCurveTo(-0.228, 0.135, -0.228, 0.110);
  lug.lineTo(-0.228, -0.085); lug.quadraticCurveTo(-0.228, -0.110, -0.205, -0.115); lug.lineTo(-W / 2 + 0.01, -0.150);
  const lugGeo = new THREE.ExtrudeGeometry(lug, { depth: flangeH, bevelEnabled: false, curveSegments: 6 });
  lugGeo.rotateX(-Math.PI / 2);
  g.add(new THREE.Mesh(lugGeo, black));
  slab(0.05, 0.06, 0.012, flangeH, 0, black, W / 2 + 0.02, 0); // right tab, out to ~225
  for (const x of [-0.203, 0.203]) slab(0.022, 0.009, 0.0045, 0.0005, flangeH, bore, x, 0);
  // Body, then the blue rim band and the bevelled lid with its black top.
  slab(W, D, 0.05, wallTop - flangeH, flangeH, black);
  slab(W + 0.002, D + 0.002, 0.051, rimH, wallTop - 0.004, blue);
  // The bevel: a loft between two rounded rectangles, the rim (W) to the lid top (0.325).
  const loft = (w0, d0, r0, w1, d1, r1, y0, y1, mat) => {
    const n = 6, ring = (w, d, r, y) => {
      const pts = [], x = w / 2, z = d / 2;
      for (const [cx, cz, a0] of [[x - r, z - r, 0], [-x + r, z - r, Math.PI / 2], [-x + r, -z + r, Math.PI], [x - r, -z + r, 1.5 * Math.PI]]) {
        for (let i = 0; i <= n; i++) {
          const a = a0 + (i / n) * Math.PI / 2;
          pts.push(cx + r * Math.cos(a), y, cz + r * Math.sin(a));
        }
      }
      return pts;
    };
    const a = ring(w0, d0, r0, y0), b = ring(w1, d1, r1, y1), k = a.length / 3;
    const pos = [...a, ...b], idx = [];
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k;
      idx.push(i, k + i, j, j, k + i, k + j);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.material.side = THREE.DoubleSide;
    g.add(m);
  };
  const yRim = wallTop - 0.004 + rimH;
  loft(W + 0.002, D + 0.002, 0.051, 0.325, 0.325, 0.03, yRim, H - 0.0005, blue);
  slab(0.325, 0.325, 0.03, 0.0005, H - 0.001, black);         // lid top (black)
  slab(0.274, 0.274, 0.025, 0.0004, H - 0.0006, black);       // inner panel outline
  slab(0.113, 0.031, 0.006, 0.0012, H - 0.0006, blue, 0, 0.114); // HYGRO badge, OUT side
  slab(0.075, 0.016, 0.002, 0.0008, H - 0.0006, logo, -0.02, 0.0); // Aldes logo
  // A spigot: a ribbed tube (outside Ø `od`) standing out of a face up to `end` from the centre.
  // `axis` is the face normal ('x' | 'z'), `s` its sign, `at` the position along the face.
  const spigot = (axis, s, at, od, yC, end = 0.2295) => {
    const face = (axis === 'z' ? D : W) / 2 - 0.01, len = end - face, r = od / 2;
    const parts = [
      new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28, 1, true), spigotMat),
      new THREE.Mesh(new THREE.TorusGeometry(r, 0.0015, 4, 28), spigotMat), // rib near the end
      new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 28), bore),
    ];
    const [tube, rib, hole] = parts;
    const u = face + len / 2, ribAt = end - 0.012, holeAt = end - 0.004;
    if (axis === 'z') {
      tube.rotation.x = Math.PI / 2; tube.position.set(at, yC, s * u);
      rib.position.set(at, yC, s * ribAt);
      hole.position.set(at, yC, s * holeAt); if (s < 0) hole.rotation.y = Math.PI;
    } else {
      tube.rotation.z = Math.PI / 2; tube.position.set(s * u, yC, at);
      rib.rotation.y = Math.PI / 2; rib.position.set(s * ribAt, yC, at);
      hole.rotation.y = s * Math.PI / 2; hole.position.set(s * holeAt, yC, at);
    }
    g.add(tube, rib, hole);
  };
  spigot('z', 1, -0.085, 0.162, 0.095);  // OUT Ø160 (front)
  spigot('z', 1, 0.095, 0.083, 0.090);   // Ø80 (front)
  spigot('z', -1, -0.100, 0.126, 0.090); // kitchen Ø125 (back)
  spigot('z', -1, 0.095, 0.083, 0.090);  // Ø80 (back)
  spigot('x', 1, -0.094, 0.083, 0.090);  // Ø80 (right, toward the back)
  spigot('x', 1, 0.097, 0.083, 0.090);   // Ø80 (right, toward the front)
  return g;
}

// Habitat Moder II extendable round dining table, natural oak (Habitat ref 910365).
// W × H × D from the catalog `sizeMm`: closed 1100 × 750 × 1100, extended 1550 × 750 × 1100
// (a second catalog entry). The leaf is W − D: the top is two half-discs of radius D/2
// with a straight middle of that length, and the legs move out with each half.
// Extends along X; grain along X.
//
// Sources:
//   - Product page https://www.habitat.fr/p/moder-table-de-salle-a-manger-naturel (RÉF 910365,
//     sku 122190), "Dimensions": Longueur 155 cm, 110 cm; Hauteur 75 cm; Profondeur / Largeur
//     110 cm; Longueur de la rallonge 45 cm. "Composition & matériaux": plateau et allonges
//     panneaux de particules et MDF avec placage chêne; structure chêne massif et rail en
//     acier; piètement chêne massif; finition laque nitrocellulose.
//   - Assembly manual "Moder II - HA833381", "(110+45)x110x75 cm", 15 pages: the page's
//     "Notice de montage" button, https://www.habitat.fr/asset/product/13552185 (PDF). p. 6
//     parts: top (1), 4 legs (2), the leaf (3); p. 8 legs bolted to the outside corners of
//     the apron frame, slide rails inside it, each leg's top a pentagon-like section; pp. 10–11
//     the leaf is one panel folded in two, stored under the top; p. 9 / 11 the extended top:
//     two seams across, the fold between them. Max load 30 kg (p. 14).
//   - Measured on the manual's p. 1 drawing of the closed table, rendered at 600 dpi. It is a
//     true isometric (the top's ellipse is 1561 × 899 px, ratio 0.576 = tan 30°), so plan
//     lengths scale 1561 px / 1100 mm = 1.419 px/mm and heights 0.816 × that = 1.158 px/mm,
//     everywhere in the drawing. The seam lies on an isometric axis, so the legs stand on
//     the diagonals: the left/right legs show their depth along the diagonal, the front leg
//     its width across it.
//       top edge: 13 px square (11 mm) + 5 px of chamfer below, i.e. ~15 mm at 45°;
//       leg depth along the diagonal: 77 mm at 495 mm up, 42 mm at the foot (side legs),
//         so ~93 mm under the apron;
//       leg width across: 44–47 mm at the top, 22 mm at the foot (front leg), with an
//         outer flat face 29 mm wide at the top, 6 mm at the foot (the two inner lines);
//       foot: its outer edge at 550 mm from the centre (the top's radius); centre at 529,
//         i.e. ±374 mm per axis; outer face leaning in 61 mm to the top, inner face 87 mm,
//         so the leg centre is ±313 mm per axis under the apron (61 mm splay per axis).
//   - Photos (cdn.habitat.fr/thumbnails/product/122/122190/raw/<n>/<id>.webp):
//     13546302 straight front view, closed: apron ~65 mm high (90 px at ~0.73 mm/px), its
//       outer faces ~±310 mm (930 px); thin top with a darker chamfer under its edge.
//     13546298 3/4 view, extended: two seams 45 cm apart and the leaf's fold, apron continuous
//       along the long sides (it telescopes), legs at the four corners of the longer frame.
//     13546301 / 13546300 the leaf being opened: steel rails inside the apron (not modelled,
//       hidden under the top).
//     13546303 3/4 closed, 13546304 grain close-up (fine straight oak grain).
//   - Colour: mean of the top in 13546302 (rgb 209 164 122) under studio light; base colour
//     0xd6a673 (rgb 214 166 115) chosen to match it in the preview (estimate).
function moderTable(entry) {
  const [W, H, D] = (entry.sizeMm || [1100, 750, 1100]).map((v) => v / 1000);
  const p = entry.params || {};
  const mm = (v, d) => (v ?? d) / 1000;
  const R = D / 2, leaf = Math.max(0, W - D);
  const edge = mm(p.topEdgeMm, 11), chamfer = mm(p.chamferMm, 15);
  const apronH = mm(p.apronHMm, 65), apronT = mm(p.apronTMm, 20), apronOut = mm(p.apronOutMm, 310);
  const leg = p.leg || {};
  const legTopAt = mm(leg.topAtMm, 313), legFootAt = mm(leg.footAtMm, 374); // centre, per axis
  const depthTop = mm(leg.depthTopMm, 93), depthFoot = mm(leg.depthFootMm, 42);
  const widthTop = mm(leg.widthTopMm, 47), widthFoot = mm(leg.widthFootMm, 22);
  const faceTop = mm(leg.faceTopMm, 29), faceFoot = mm(leg.faceFootMm, 6);
  const half = leaf / 2;

  const color = p.woodColor ?? 0xd6a673;
  // Own texture variants, not clones: a clone of a painted texture never receives its picture.
  const grain = (variant) => paintedTexture('furnWood', { color }, 256, 256, { placeholder: color, variant });
  const topMap = grain('moder-top');
  topMap.repeat.set(1 / 0.6, 1 / 0.6); // the cap UVs are plan metres: one picture per 60 cm
  const legMap = grain('moder-leg');
  legMap.repeat.set(1 / 0.6, 1 / 0.6);
  legMap.center.set(0.5, 0.5);
  legMap.rotation = Math.PI / 2; // grain along the legs (their UV v is the height)
  const wood = new THREE.MeshStandardMaterial({ map: topMap, roughness: 0.55 });
  const woodV = new THREE.MeshStandardMaterial({ map: legMap, roughness: 0.55 });
  const seamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), roughness: 0.8 });
  const g = new THREE.Group();
  g.name = entry.name || 'moder-table';

  // Top outline in plan: a stadium (a circle when there is no leaf), shape y = −Z.
  const outline = (r) => {
    const s = new THREE.Shape();
    s.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.absarc(-half, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    return s;
  };
  const slab = (geometry, y) => {
    geometry.rotateX(-Math.PI / 2); // shape XY → plan XZ, extrusion → +Y
    const m = new THREE.Mesh(geometry, wood);
    m.position.y = y;
    return m;
  };
  // Upper slab with a square edge, then the 45° chamfer under it: a bevelled extrusion of
  // the inset outline whose widest point meets the slab (its upper bevel hides inside it).
  g.add(slab(new THREE.ExtrudeGeometry(outline(R), { depth: edge, bevelEnabled: false, curveSegments: 48 }), H - edge));
  const under = new THREE.ExtrudeGeometry(outline(R - chamfer), {
    depth: 0.0005, bevelEnabled: true, bevelThickness: chamfer, bevelSize: chamfer, bevelSegments: 1, curveSegments: 48,
  });
  const zs = under.attributes.position;
  for (let i = 0; i < zs.count; i++) zs.setZ(i, Math.min(zs.getZ(i), edge * 0.9)); // keep the upper bevel inside the slab
  g.add(slab(under, H - edge - 0.0005));

  // Seams across the top: one in the middle closed, one each side of the leaf extended,
  // and the leaf's fold between them (manual p. 10).
  for (const x of leaf ? [-half, half] : [0]) {
    g.add(box([x - 0.0008, H, -R + 0.003], [x + 0.0008, H + 0.0003, R - 0.003], seamMat));
  }
  if (leaf) g.add(box([-half, H, -0.0008], [half, H + 0.0003, 0.0008], seamMat));

  // Square apron under the top; continuous along the long sides when extended (it
  // telescopes, 13546298). The legs cover its corners.
  const yA1 = H - edge - chamfer, yA0 = yA1 - apronH;
  const ox = apronOut + half;
  for (const sz of [-1, 1]) {
    const z = sz * apronOut;
    g.add(box([-ox, yA0, Math.min(z, z - sz * apronT)], [ox, yA1, Math.max(z, z - sz * apronT)], wood));
  }
  for (const sx of [-1, 1]) {
    const x = sx * ox;
    g.add(box([Math.min(x, x - sx * apronT), yA0, -apronOut], [Math.max(x, x - sx * apronT), yA1, apronOut], woodV));
  }

  // Legs: a six-sided blade along the diagonal (outer flat face, two bevels to the full
  // width, sides narrowing to the inner edge), tapering from under the apron to the foot,
  // which sits further out on the diagonal (manual p. 1, measured above).
  const section = (depth, width, face) => {
    const bev = (width - face) / 2, inner = width * 0.4;
    return [[depth / 2, -face / 2], [depth / 2, face / 2], [depth / 2 - bev, width / 2],
      [-depth / 2, inner / 2], [-depth / 2, -inner / 2], [depth / 2 - bev, -width / 2]];
  };
  const top = section(depthTop, widthTop, faceTop), foot = section(depthFoot, widthFoot, faceFoot);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const d = [sx / Math.SQRT2, sz / Math.SQRT2], n = [-d[1], d[0]]; // radial, across
    const at = (c, [r, t], y) => [sx * (c + half) + r * d[0] + t * n[0], y, sz * c + r * d[1] + t * n[1]];
    g.add(new THREE.Mesh(loft(top.map((q) => at(legTopAt, q, yA1)), foot.map((q) => at(legFootAt, q, 0))), woodV));
  }
  return g;
}

// Wall-hung WC pan (Villeroy & Boch Architectura rimless, 4694R001) with a generic slim
// seat and lid. Every ceramic surface is a stack of horizontal plan rings of one shape: a
// straight back with rounded corners, straight sides, and an elliptical front (`wcRing`),
// stitched into smooth shells; about 2 500 triangles in all. Wall at −Z, front toward +Z;
// the catalog `mountZMm` lifts it on drop (the foot is the trap's bottom).
//
// Sources:
//   - Product page: https://pro.villeroy-boch.com/en/hu/bw/p/Architectura-Washdown-toilet,-rimless-Round-4694R001
//     ("Washdown toilet, rimless, wall-mounted, with DirectFlush", 370 × 530 mm, White Alpin).
//   - V&B 3D data VB-Architectura-4694R0-3D01-v00-42570.stp (assets.villeroy-boch.com/BW/dl_3d_data/;
//     NX 10 export, 2019-01-22): every ring below is a section of it, tessellated at 0.5 mm with
//     occt-import-js and cut by plane. STEP axes: x across, y = −d (wall at 0), z up with the
//     rim top near 0. Overall 368.5 × 529.3 × 339.1 mm. Each plan section fits the ring shape
//     within 3 mm RMS (elliptical front 174–188 mm long).
//   - V&B 2D drawing VB-Architectura-4694R0-2D01-v02-39072.pdf (V01, 22.11.2022): 370 × 530,
//     rim 415 above the floor (→ `mountZMm` 80 with the rim at STEP z +6), bowl opening
//     280 × 335 (STEP: 286 × 338), waste Ø102, inlet Ø55, fixing bolts 180 apart.
//   - Installation manual VB-Architectura-4694R0-II-v01-43643-en.pdf (dl_mal).
//   - Rings (mm; STEP z → hw half-width, db..df from the wall, bF front ellipse, rB corners):
//     outer z −8: 184.2, 0..529.3, bF 188 · z −45: 183.5, ..528.5 · z −55: 173.7, ..519 (the step
//     under the rim slab) · z −60: 169.3, ..513.2, bF 174 · z −100: 164.3, ..497.2, bF 182 ·
//     z −150: 157.8, ..474.1, bF 186 · z −200: 150.2, ..448.1 · z −240: 142.1, ..425.4 · flat
//     underside at z −254. Top at z +6 (the STEP reads +5 at the front to +10 at the wall).
//     Bowl: opening hw 143, 150..488, bF 158, rB 55 · z −100: 139, 134..478 · z −120: 110,
//     142..452 · z −140: 63, 154..410 · z −160: 48, 166..370 · z −200: 45, 188..316 · z −240:
//     41, 200..288 (closed there by the water surface). The undercut under the rimless rim is
//     not modelled. Trap bulb: z −250: 51, 114..293 down to z −325: 23, 163..228, bottom −329.1.
//     Wall foot: z −256: 129, 0..78 down to z −280: 33, 0..64. Seat holes Ø16 at x ±77.5, d 115.
//   - The seat and lid are generic (not part of 4694R001, sold separately): 12 mm seat and
//     12 mm lid following the rim outline, on 7 mm hinge posts at the seat holes. Estimates.
const WC_Z0 = 329.1;            // STEP z of the lowest point (trap bottom) → Y = 0
const WC_D = 529.3;             // depth, wall to front (plan centred on it)
const WC_TOP = 6;               // STEP z of the flat seating rim
const WC_SEG = { back: 2, corner: 4, side: 1, front: 16 };

// One plan ring (mm): x across, d from the wall. Same point count for every ring.
function wcRing(hw, db, df, bF, rB) {
  const fit = Math.min(1, (df - db) / (bF + rB));
  bF *= fit; rB = Math.max(1, rB * fit);
  const { back, corner, side, front } = WC_SEG, pts = [];
  const run = (n, f) => { for (let i = 0; i < n; i++) pts.push(f(i / n)); };
  run(back, (t) => [-hw + rB + t * 2 * (hw - rB), db]);
  run(corner, (t) => { const a = -Math.PI / 2 + t * Math.PI / 2; return [hw - rB + rB * Math.cos(a), db + rB + rB * Math.sin(a)]; });
  run(side, (t) => [hw, db + rB + t * (df - bF - db - rB)]);
  run(front, (t) => { const a = t * Math.PI; return [hw * Math.cos(a), df - bF + bF * Math.sin(a)]; });
  run(side, (t) => [-hw, df - bF - t * (df - bF - db - rB)]);
  run(corner, (t) => { const a = Math.PI + t * Math.PI / 2; return [-hw + rB + rB * Math.cos(a), db + rB + rB * Math.sin(a)]; });
  return pts;
}

// Indexed shells from rings: consecutive stitches share vertices (smooth); a fresh ring
// starts a crease. Faces point 'out'/'in' (from the ring's centre) or 'up'/'down'.
class WcMesher {
  constructor() { this.pos = []; this.idx = []; }
  ring(pts, z) {
    const base = this.pos.length / 3;
    for (const [x, d] of pts) this.pos.push(x / 1000, (z + WC_Z0) / 1000, (d - WC_D / 2) / 1000);
    return { base, pts, z };
  }
  tri(a, b, c, face, centre) {
    const P = (i) => this.pos.slice(i * 3, i * 3 + 3);
    const [pa, pb, pc] = [P(a), P(b), P(c)];
    const e1 = pb.map((v, k) => v - pa[k]), e2 = pc.map((v, k) => v - pa[k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    let s;
    if (face === 'up' || face === 'down') s = n[1] * (face === 'up' ? 1 : -1);
    else {
      const m = [(pa[0] + pb[0] + pc[0]) / 3 - centre[0], 0, (pa[2] + pb[2] + pc[2]) / 3 - centre[1]];
      s = (n[0] * m[0] + n[2] * m[2]) * (face === 'out' ? 1 : -1);
    }
    this.idx.push(...(s >= 0 ? [a, b, c] : [a, c, b]));
  }
  stitch(r1, r2, face) {
    const n = r1.pts.length, c = r1.pts.reduce((s, [x, d]) => [s[0] + x / n, s[1] + d / n], [0, 0]);
    const centre = [c[0] / 1000, (c[1] - WC_D / 2) / 1000];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.tri(r1.base + i, r1.base + j, r2.base + j, face, centre);
      this.tri(r1.base + i, r2.base + j, r2.base + i, face, centre);
    }
  }
  // A smooth shell through `rings` ([hw, db, df, bF, rB, z]), top to bottom.
  shell(rings, face) {
    let prev = null, first = null, last = null;
    for (const [hw, db, df, bF, rB, z] of rings) {
      const r = this.ring(wcRing(hw, db, df, bF, rB), z);
      if (prev) this.stitch(prev, r, face);
      first ??= r; prev = last = r;
    }
    return { first, last };
  }
  // A flat cap over a ring (fresh vertices, so its edge is a crease).
  cap(r, face) {
    const c = this.ring(r.pts, r.z), n = r.pts.length;
    const mid = r.pts.reduce((s, [x, d]) => [s[0] + x / n, s[1] + d / n], [0, 0]);
    const m = this.ring([mid], r.z).base;
    for (let i = 0; i < n; i++) this.tri(m, c.base + i, c.base + (i + 1) % n, face);
  }
  // A flat band between two rings at one height (fresh vertices).
  band(r1, r2, face) { this.stitch(this.ring(r1.pts, r1.z), this.ring(r2.pts, r2.z), face); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

function wallHungWc(entry) {
  const p = entry.params || {};
  const ceramic = new THREE.MeshStandardMaterial({ color: p.color ?? 0xf6f6f3, roughness: 0.12 });
  const water = new THREE.MeshStandardMaterial({ color: 0xc4d2d8, roughness: 0.05 });
  const plastic = new THREE.MeshStandardMaterial({ color: p.seatColor ?? 0xf9f9f7, roughness: 0.3 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 0.9, roughness: 0.25 });
  const T = WC_TOP;

  // Ceramic: outer shell, seating rim, bowl, trap bulb, wall foot.
  const m = new WcMesher();
  const outer = m.shell([
    [176, 0, 521, 180, 2, T], [182.5, 0, 527.5, 186, 2, T - 3], [184.2, 0, 529.3, 188, 2, -8],
    [183.5, 0, 528.5, 188, 2, -45], [173.7, 0, 519, 180, 2, -55], [169.3, 0, 513.2, 174, 2, -60],
    [164.3, 0, 497.2, 182, 2, -100], [157.8, 0, 474.1, 186, 2, -150], [150.2, 0, 448.1, 186, 2, -200],
    [142.1, 0, 425.4, 184, 2, -240], [136, 0, 419, 180, 2, -250], [126, 0, 410, 172, 2, -254],
  ], 'out');
  m.cap(outer.last, 'down');
  const bowl = m.shell([
    [147, 146, 492, 160, 58, T], [139, 154, 484, 156, 55, -5], [139, 134, 478, 150, 40, -100],
    [110, 142, 452, 140, 40, -120], [63, 154, 410, 110, 25, -140], [48, 166, 370, 90, 20, -160],
    [45, 188, 316, 45, 30, -200], [41, 200, 288, 41, 30, -240],
  ], 'in');
  m.band(outer.first, bowl.first, 'up');
  const bulb = m.shell([
    [51, 114, 293, 51, 51, -250], [49, 119, 288, 49, 49, -270], [47.5, 125, 280, 47.5, 47.5, -290],
    [45, 130, 273, 45, 45, -300], [41, 138, 263, 41, 41, -310], [34, 149, 249, 34, 34, -318],
    [23, 163, 228, 23, 23, -325], [9, 186, 206, 9, 9, -329.1],
  ], 'out');
  m.cap(bulb.last, 'down');
  const foot = m.shell([
    [129, 0, 78, 30, 1, -252], [68, 0, 77, 30, 1, -262], [54, 0, 76, 30, 1, -270],
    [33, 0, 64, 25, 1, -280], [25, 0, 55, 20, 1, -285],
  ], 'out');
  m.cap(foot.last, 'down');
  const g = new THREE.Group();
  g.name = entry.name || 'wall-hung-wc';
  g.add(new THREE.Mesh(m.geometry(), ceramic));

  // Water surface where the bowl's last ring closes.
  const w = new WcMesher();
  w.cap(w.ring(wcRing(41, 200, 288, 41, 30), -240), 'up');
  g.add(new THREE.Mesh(w.geometry(), water));

  if (p.seat === false) return g;
  // Generic slim seat and lid (estimates), on hinge posts at the seat holes.
  const S0 = T + 2, S1 = S0 + 12, L1 = S1 + 12, back = 128;
  const s = new WcMesher();
  const so = s.shell([[176, back, 524, 184, 12, S1 - 2], [178, back, 526, 186, 12, S1 - 6], [178, back, 526, 186, 12, S0]], 'out');
  const si = s.shell([[116, 190, 462, 124, 50, S1 - 2], [114, 192, 460, 122, 50, S0]], 'in');
  s.band(so.first, si.first, 'up');
  s.band(so.last, si.last, 'down');
  g.add(new THREE.Mesh(s.geometry(), plastic));
  const l = new WcMesher();
  const lo = l.shell([[175, back + 2, 523, 183, 12, L1], [178, back, 526, 186, 12, L1 - 3], [178, back, 526, 186, 12, S1 + 0.5]], 'out');
  l.cap(lo.first, 'up');
  l.cap(lo.last, 'down');
  const lid = new THREE.Mesh(l.geometry(), plastic);
  const hingeY = (S1 + WC_Z0) / 1000, hingeZ = (back - WC_D / 2) / 1000;
  const pivot = new THREE.Group();
  pivot.position.set(0, hingeY, hingeZ);
  lid.position.set(0, -hingeY, -hingeZ);
  pivot.add(lid);
  if (p.lidOpen) pivot.rotation.x = -THREE.MathUtils.degToRad(100);
  g.add(pivot);
  for (const x of [-77.5, 77.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, (S1 - T) / 1000, 12), chrome);
    post.position.set(x / 1000, ((T + S1) / 2 + WC_Z0) / 1000, (115 - WC_D / 2) / 1000);
    g.add(post);
  }
  return g;
}

// A closed solid between two convex rings of plan points (same count, same order), flat
// shaded; UVs: u along the perimeter, v the height, both in metres.
function loft(upper, lower) {
  const pos = [], uv = [];
  const n = upper.length;
  const cx = upper.reduce((s, q) => s + q[0], 0) / n, cz = upper.reduce((s, q) => s + q[2], 0) / n;
  const tri = (a, b, c, ua, ub, uc) => {
    // Wind each triangle so its normal points away from the ring's axis.
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - (upper[0][1] + lower[0][1]) / 2, mz = (a[2] + b[2] + c[2]) / 3 - cz;
    const out = nx * mx + ny * my + nz * mz > 0;
    for (const [q, u] of out ? [[a, ua], [b, ub], [c, uc]] : [[a, ua], [c, uc], [b, ub]]) { pos.push(...q); uv.push(...u); }
  };
  let u = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const w = Math.hypot(upper[j][0] - upper[i][0], upper[j][2] - upper[i][2]);
    const a = upper[i], b = upper[j], c = lower[j], e = lower[i];
    tri(a, b, c, [u, a[1]], [u + w, b[1]], [u + w, c[1]]);
    tri(a, c, e, [u, a[1]], [u + w, c[1]], [u, e[1]]);
    u += w;
  }
  for (const ring of [upper, lower]) {
    for (let i = 1; i < n - 1; i++) tri(ring[0], ring[i], ring[i + 1], [ring[0][0], ring[0][2]], [ring[i][0], ring[i][2]], [ring[i + 1][0], ring[i + 1][2]]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Aldes Bahia Curve S hygro extract vent (Ø80), wall or ceiling. The visible part only: the
// 155 × 155 domed face, 44 mm deep; the Ø75.6 barrel (22 mm, into the duct or sleeve) is hidden in
// the wall and not built.
//
// Sources:
//   - Aldes product sheet 11015144 "BW21 BAHIA CURVE S 5-45/30 m³/h - Ø 80 mm présence - Blanc"
//     https://assets.aldes.fr/assets/productRefDocs/fr/FR-France-Aldes-BW21-BAHIA-CURVE-S-5-45-30-m-h-O-80-mm-presence-Blanc-11015144.pdf
//     "Données dimensionnelles": H 155, L 48, Ø raccordement 80. Page 2 drawing (front and side
//     orthographic views, rasterised at 600 dpi, 3.28 px/mm: the 155 width = 509 px, height 515 px):
//       side view: 66 overall, 44 the face, the barrel 75.6 tall behind it; the face's depth from the
//         wall read every 2.4 mm of height = PROFILE below (deepest, 44, from 67 to 120 mm up; the
//         top falls off faster than the bottom);
//       front view: side bands from 30 and 125 mm across (the face rounds off outside them); a
//         recess 41–115 across, 73–127 up, bevelled in to the sensor window 54–102 across,
//         81–120 up; a removable panel's edges at 57 and 138 mm up; the logo at 48 mm up; a small
//         icon at 133 mm across, 100–110 up.
//     Page 1: "à une hauteur d'au moins 1,80 m", "au moins 20 cm entre le centre de la bouche et les
//     parois adjacentes", "en partie haute d'une paroi verticale ou au plafond".
//   - Photo storeonline.aldes.fr image 3516 ("Bouche Bahia Curve bain Ø 80 mm", 11015171): white
//     plastic, a rounded-square face with a softly rounded rim, a recessed square opening, the logo
//     on the plain part. It shows the opening below the logo, the drawing above it: built as drawn.
//   The face is concave (owner, 2026-10-09: "It should be concave"): the outline is the rim; the
//   face dishes DISH mm in toward the middle, read from the side view's inner line at ≈ 35 mm, and
//   the recess bottoms at ≈ 26 mm (its second inner line). Dish shape, the side edges' roll-over,
//   corner rounding and the window, logo and icon tones are estimates.
// `params.ceiling`: the same vent on a ceiling, face down; `sizeMm` is then 155 W × 44 H × 155 D.
function vmcVentBahia(entry) {
  const p = entry.params || {};
  if (p.ceiling) {
    const [W, H, D] = (entry.sizeMm || [155, 44, 155]).map((v) => v / 1000);
    const wall = vmcVentBahia({ ...entry, sizeMm: [W * 1000, D * 1000, H * 1000], params: { ...p, ceiling: false } });
    wall.rotation.x = Math.PI / 2; // wall front (+Z) → down (−Y), wall up (+Y) → +Z
    wall.position.set(0, H / 2, -D / 2);
    const g = new THREE.Group();
    g.name = entry.name || 'vmc-vent-bahia-ceiling';
    g.add(wall);
    return g;
  }
  const [W, H, D] = (entry.sizeMm || [155, 155, 44]).map((v) => v / 1000);
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.45 });
  const frame = new THREE.MeshStandardMaterial({ color: 0xe2e3e1, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x8e9195, roughness: 0.8 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xa7aaae, roughness: 0.5 });
  // Rim depth (mm) against height (mm, from the bottom): the side view's outline, drawing p. 2.
  const PROFILE = [[0, 5], [5, 11], [10, 16], [15, 20], [20, 23], [25, 26], [30, 28.5], [35, 31], [40, 33.5],
    [45, 35.5], [50, 37], [55, 38.5], [60, 40], [67, 43], [75, 44], [115, 44], [122, 43], [128, 40.5],
    [134, 38], [140, 35], [145, 30], [150, 24], [153, 19], [155, 12]];
  const DISH = 9, RECESS = 26;          // mm: the face dishes 9 below the rim (side view's inner line at
  //                                       ≈ 35 mid-height); the recess bottom at 26 (inner line at ≈ 26)
  const OUT = [-36.5, 37.5, 73, 127], IN = [-24, 24, 81, 120]; // recess, sensor window (mm; x from centre)
  const N = 8, a = W / 2, b = H / 2, mx = (W * 1000) / 155, mz = (H * 1000) / 155, md = (D * 1000) / 44;
  const prof = (zmm) => {
    const z = Math.min(155, Math.max(0, zmm / mz));
    for (let i = 1; i < PROFILE.length; i++) if (z <= PROFILE[i][0]) {
      const [z0, d0] = PROFILE[i - 1], [z1, d1] = PROFILE[i];
      return d0 + (d1 - d0) * (z - z0) / (z1 - z0);
    }
    return PROFILE[PROFILE.length - 1][1];
  };
  const smooth = (e0, e1, t) => { const u = Math.min(1, Math.max(0, (t - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
  // Depth in mm at (x mm from the centre, z mm from the bottom): the rim (side edges rolled over their
  // last ~8 mm), minus the dish, flat across the middle where the recess sits.
  const depthMm = (x, z) => {
    const ax = Math.abs(x / mx), r = ((ax / 77.5) ** N + (Math.abs(z / mz - 77.5) / 77.5) ** N) ** (1 / N);
    const rim = prof(z) * (1 - 0.6 * smooth(69.5, 77.5, ax));
    return Math.max(2, rim - DISH * smooth(0.92, 0.55, r)) * md;
  };
  const dz = (xm, ym) => -D / 2 + depthMm(xm * 1000, ym * 1000) / 1000; // metres, from the group's origin
  // Grid: columns and rows in mm, with lines on the recess edges so its hole is exact; each column
  // runs between the superellipse outline's bottom and top at that x.
  const lines = (lo, hi, n, extra) => [...new Set([...Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n), ...extra])].sort((p1, p2) => p1 - p2);
  const xs = lines(-77.5, 77.5, 14, OUT.slice(0, 2)).map((v) => v * mx / 1000);
  const vs = lines(0, 155, 14, OUT.slice(2)).map((v) => (v - 77.5) / 77.5);
  const yMax = (x) => b * Math.max(0, 1 - Math.abs(x / a) ** N) ** (1 / N);
  const pos = [], idx = [], NX = xs.length, NV = vs.length;
  for (const x of xs) for (const v of vs) { const y = b + v * yMax(x); pos.push(x, y, dz(x, y)); }
  const id = (i, j) => i * NV + j;
  const inHole = (i, j) => { const xm = (xs[i] + xs[i + 1]) / 2 * 1000 / mx, zm = (vs[j] + vs[j + 1]) / 2 * 77.5 + 77.5;
    return xm > OUT[0] && xm < OUT[1] && zm > OUT[2] && zm < OUT[3]; };
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NV - 1; j++) {
    if (inHole(i, j)) continue;
    idx.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  }
  // Rim edge down to the wall plane all round (the grid's outline), then a flat back.
  const edge = [];
  for (let i = 0; i < NX; i++) edge.push(id(i, 0));
  for (let j = 1; j < NV; j++) edge.push(id(NX - 1, j));
  for (let i = NX - 2; i >= 0; i--) edge.push(id(i, NV - 1));
  for (let j = NV - 2; j > 0; j--) edge.push(id(0, j));
  const base = pos.length / 3;
  for (const e of edge) pos.push(pos[e * 3], pos[e * 3 + 1], -D / 2);
  const ne = edge.length;
  for (let k = 0; k < ne; k++) { const o0 = edge[k], o1 = edge[(k + 1) % ne], b0 = base + k, b1 = base + (k + 1) % ne; idx.push(o0, b1, b0, o0, o1, b1); }
  const back = pos.length / 3;
  pos.push(0, b, -D / 2);
  for (let k = 0; k < ne; k++) idx.push(back, base + k, base + (k + 1) % ne);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.name = entry.name || 'vmc-vent-bahia';
  const face = new THREE.Mesh(geo, white);
  face.material.side = THREE.DoubleSide;
  g.add(face);
  // The recess: four bevels from the dish down to the sensor window at RECESS mm.
  const P = (x, z, d) => [x * mx / 1000, z * mz / 1000, d === undefined ? dz(x * mx / 1000, z * mz / 1000) : -D / 2 + d * md / 1000];
  const quad = (q, mat) => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]], 3));
    geom.computeVertexNormals();
    g.add(new THREE.Mesh(geom, mat));
  };
  const bev = new THREE.MeshStandardMaterial({ color: 0xeceeeb, roughness: 0.5, side: THREE.DoubleSide });
  const [ox0, ox1, oz0, oz1] = OUT, [ix0, ix1, iz0, iz1] = IN;
  quad([P(ox0, oz1), P(ox1, oz1), P(ix1, iz1, RECESS), P(ix0, iz1, RECESS)], bev); // top
  quad([P(ox0, oz0), P(ix0, iz0, RECESS), P(ix1, iz0, RECESS), P(ox1, oz0)], bev); // bottom
  quad([P(ox0, oz0), P(ox0, oz1), P(ix0, iz1, RECESS), P(ix0, iz0, RECESS)], bev); // left
  quad([P(ox1, oz0), P(ix1, iz0, RECESS), P(ix1, iz1, RECESS), P(ox1, oz1)], bev); // right
  // Flat parts: the sensor window and its opening at the recess bottom; the logo and icon on the face.
  const patch = (x0, x1, z0, z1, mat, d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * mx / 1000, (z1 - z0) * mz / 1000), mat);
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    m.position.set(...P(xm, zm, d ?? depthMm(xm * mx, zm * mz) / md + 0.6));
    g.add(m);
  };
  patch(ix0, ix1, iz0, iz1, frame, RECESS);         // sensor window, 54–102 across, 81–120 up
  patch(-17, 17, 86, 115, dark, RECESS + 0.5);      // its opening
  patch(-10, 10, 46.5, 49.5, grey);                 // logo
  patch(53, 58, 100, 110, grey);                    // icon
  return g;
}

const BUILDERS = {
  'stockholm-bed': stockholmBed, 'daikin-wall-unit': daikinWallUnit, 'shower-tray': showerTray,
  'upright-piano': uprightPiano, 'towel-radiator': towelRadiator, 'panel-radiator': panelRadiator,
  'pedal-bin': pedalBin, 'moder-table': moderTable, 'wall-hung-wc': wallHungWc, 'vmc-agalina': vmcAgalina,
  'vmc-easyhome': vmcEasyhome, 'vmc-vent-bahia': vmcVentBahia,
};

export function isProcedural(entry) {
  return !!(entry && BUILDERS[entry.procedural]);
}

// Build a fresh source scene for a procedural catalog entry.
export function buildProceduralFurniture(entry) {
  const g = BUILDERS[entry.procedural](entry);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
