// AR material card (owner, 2026-09-30; docs/ar-survey.md "Material card"): in a MATERIAL
// mode, holding LEFT grip shows the target's material instead of the print sheet.
// - A floor/wall finish shows a square patch of its real texture at a stated size, with a
//   scale bar, so it reads as "what this looks like over S metres", not a stretched tile.
// - A product (door, window, switch/outlet, furniture) shows its 3D model on a slow
//   turntable, fitted to the card, with its real overall size.
// The card only draws what mr.js hands it (show(spec)); painting and caching of textures
// stay with the caller. Canvas text is redrawn only when the spec changes.
import * as THREE from 'three';

const CARD_W = 0.4, CARD_H = 0.5;          // metres
const PX_W = 800, PX_H = 1000;             // canvas px (2000 px/m)
const VIEW = { top: 190, bottom: 870 };    // the swatch / model area, canvas px
const SWATCH_M = (VIEW.bottom - VIEW.top) / (PX_H / CARD_H); // 0.34 m
const VIEW_Y = CARD_H / 2 - ((VIEW.top + VIEW.bottom) / 2) / (PX_H / CARD_H); // area centre, card-local
const TURN_RAD_S = 0.5;                    // turntable speed

// The patch shown for a finish: about three pieces across, 1 to 3 m, in 0.5 m steps.
// A stepped layout's w × h is its whole module (1.0 × 1.1 m), so its piece is its
// largest tile (STEPPED in core/flooring.js: 50 cm).
export function swatchSpan(def) {
  const piece = def?.pattern === 'stepped' ? 0.5 : Math.max(def?.w || 0, def?.h || 0);
  if (!(piece > 0)) return 1;
  return Math.min(3, Math.max(1, Math.ceil(piece * 3 * 2) / 2));
}
// The longest round scale-bar length that fits half the patch.
function barLength(span) {
  return [1, 0.5, 0.2, 0.1].find((l) => l <= span / 2) ?? 0.1;
}

export function makeMaterialCard({ renderOrder = 90 } = {}) {
  const group = new THREE.Group();
  group.visible = false;

  const canvas = document.createElement('canvas');
  canvas.width = PX_W; canvas.height = PX_H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    // Transparent pass at the sheet's order (90), after the world overlays that ignore
    // depth (docs/ar-survey.md, LEFT sheet). three draws every opaque object before any
    // transparent one, so the model's materials are cloned as transparent too (order +2)
    // to paint over the card; the originals are shared with the AR 3D view.
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
  );
  panel.renderOrder = renderOrder;
  group.add(panel);

  // The finish patch: UVs span `span` metres, so the caller's plan-metre texture (repeat =
  // 1 / pattern unit, or the stepped lattice matrix) tiles at true scale.
  const swatchGeom = new THREE.PlaneGeometry(SWATCH_M, SWATCH_M);
  const swatchUv0 = swatchGeom.attributes.uv.array.slice();
  const swatch = new THREE.Mesh(swatchGeom, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
  swatch.position.set(0, VIEW_Y, 0.001);
  swatch.renderOrder = renderOrder + 1;
  swatch.visible = false;
  group.add(swatch);

  // The product turntable, in front of the card: a fixed tilt (a little from above),
  // and inside it the spin, so the model turns about its own vertical.
  const pivot = new THREE.Group();
  pivot.position.set(0, VIEW_Y, 0.12);
  pivot.rotation.x = 0.25;
  const spinner = new THREE.Group();
  pivot.add(spinner);
  group.add(pivot);
  let model = null, disposeModel = null, clones = [];

  const clearModel = () => {
    if (model) spinner.remove(model);
    disposeModel?.();
    for (const m of clones) m.dispose();
    model = null; disposeModel = null; clones = [];
  };
  // The model's own transparent-pass copies of its materials (see the panel above).
  const cloneMaterials = (root) => {
    const copies = new Map();
    const copy = (m) => {
      if (!copies.has(m)) {
        const c = m.clone();
        c.transparent = true;
        copies.set(m, c);
        clones.push(c);
      }
      return copies.get(m);
    };
    root.traverse((o) => {
      if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
    });
  };

  // Wrap `text` into at most `max` lines of `maxW` px at the current font.
  const wrap = (text, maxW, max) => {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(trial).width > maxW) { lines.push(line); line = w; } else line = trial;
    }
    if (line) lines.push(line);
    if (lines.length > max) { lines.length = max; lines[max - 1] += '…'; }
    return lines;
  };

  function drawCanvas(spec) {
    ctx.fillStyle = '#0f1218';
    ctx.fillRect(0, 0, PX_W, PX_H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 44px sans-serif';
    const title = wrap(spec.title || '', PX_W - 80, 3);
    const lh = title.length > 2 ? 46 : 54;
    title.forEach((l, i) => ctx.fillText(l, PX_W / 2, 100 - (title.length - 1) * lh / 2 + i * lh));
    // The view area's frame (the model floats in front of it).
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(60, VIEW.top, PX_W - 120, VIEW.bottom - VIEW.top);
    if (spec.kind === 'text') {
      ctx.fillStyle = '#94a3b8'; ctx.font = '38px sans-serif';
      wrap(spec.message || '', PX_W - 160, 4)
        .forEach((l, i, a) => ctx.fillText(l, PX_W / 2, (VIEW.top + VIEW.bottom) / 2 - (a.length - 1) * 24 + i * 48));
    }
    ctx.fillStyle = '#cbd5e1'; ctx.font = '36px sans-serif';
    if (spec.kind === 'finish') {
      // Scale bar under the patch: `len` metres at the patch's px per metre.
      const span = spec.span, len = barLength(span);
      const px = len / span * (VIEW.bottom - VIEW.top);
      const x0 = PX_W / 2 - px / 2, y = VIEW.bottom + 44;
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x0, y); ctx.lineTo(x0 + px, y);
      ctx.moveTo(x0, y - 14); ctx.lineTo(x0, y + 14);
      ctx.moveTo(x0 + px, y - 14); ctx.lineTo(x0 + px, y + 14);
      ctx.stroke();
      ctx.fillText(spec.barLabel(len), PX_W / 2, y + 50);
    } else if (spec.caption) {
      ctx.fillText(spec.caption, PX_W / 2, VIEW.bottom + 64);
    }
    tex.needsUpdate = true;
  }

  let shownKey = null;
  // spec: { key, kind: 'finish' | 'object' | 'text', title,
  //   finish: { map (Texture|null), color, span, barLabel(len) },
  //   object: { root (Object3D), dispose() }, caption (text, or (size: Vector3, metres) => text),
  //   message }
  function show(spec) {
    if (spec.key === shownKey) return;
    shownKey = spec.key;
    clearModel();
    swatch.visible = false;
    if (spec.kind === 'finish') {
      const span = spec.span;
      const uv = swatchGeom.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, swatchUv0[2 * i] * span, swatchUv0[2 * i + 1] * span);
      uv.needsUpdate = true;
      swatch.material.map = spec.map || null;
      swatch.material.color.setHex(spec.map ? 0xffffff : (spec.color ?? 0xcccccc));
      swatch.material.needsUpdate = true;
      swatch.visible = true;
    } else if (spec.kind === 'object' && spec.object?.root) {
      // Centre the model on the pivot and fit its largest side to the view area.
      const root = spec.object.root;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      root.position.sub(centre);
      holder.add(root);
      // 75 %: the model floats in front of the card, so perspective enlarges it.
      holder.scale.setScalar((SWATCH_M * 0.75) / Math.max(size.x, size.y, size.z, 1e-3));
      cloneMaterials(root);
      holder.traverse((o) => { o.renderOrder = renderOrder + 2; });
      spec = { ...spec, caption: typeof spec.caption === 'function' ? spec.caption(size) : spec.caption };
      model = holder;
      disposeModel = spec.object.dispose || null;
      // Start with the broadest face toward the viewer, a little turned (three-quarter).
      spinner.rotation.y = (size.x >= size.z ? 0 : Math.PI / 2) + 0.45;
      spinner.add(model);
    }
    drawCanvas(spec);
  }

  function update(dt) {
    if (model) spinner.rotation.y += TURN_RAD_S * dt;
  }

  // Forget the shown spec so the next show() redraws (language or unit change).
  const invalidate = () => { shownKey = null; };

  return { group, show, update, invalidate };
}
