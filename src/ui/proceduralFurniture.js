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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  // Top face canvas: 1 px ≈ 1.6 mm, canvas top = the drain edge (−Z).
  const PX = 512 / (W * 1000);
  const cw = 512, ch = Math.round(D * 1000 * PX);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
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
  ctx.drawImage(c, 1, 1);
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
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
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
  const keyMap = canvasTexture(1024, (ctx, S) => {
    ctx.fillStyle = '#f3f1ea';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#9d9a92';
    for (let i = 1; i < 52; i++) ctx.fillRect((S * i) / 52 - 1, 0, 2, S);
  });
  keyMap.wrapS = keyMap.wrapT = THREE.ClampToEdgeWrapping;
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
  const badge = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#b9bcbf'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ffffff'; ctx.font = 'italic bold 34px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ACOVA', s / 2, s / 2 + 2);
  });
  badge.wrapS = badge.wrapT = THREE.ClampToEdgeWrapping;
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
    const map = canvasTexture(512, (ctx, size) => {
      ctx.fillStyle = '#4a4d50'; ctx.fillRect(0, 0, size, size);
      const slats = Math.round(W / 0.012);
      ctx.fillStyle = '#d9dadb';
      for (let i = 0; i < slats; i++) ctx.fillRect((i + 0.5) / slats * size - 1, 0, 2, size);
      ctx.fillStyle = css(p.color ?? 0xf3f3f1);
      ctx.fillRect(size / 2 - 4, 0, 8, size);                       // centre divider
      ctx.fillRect(0, 0, 6, size); ctx.fillRect(size - 6, 0, 6, size);  // end caps
    });
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
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

const BUILDERS = {
  'stockholm-bed': stockholmBed, 'daikin-wall-unit': daikinWallUnit, 'shower-tray': showerTray,
  'upright-piano': uprightPiano, 'towel-radiator': towelRadiator, 'panel-radiator': panelRadiator,
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
