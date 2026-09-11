// Mixed-reality (immersive-ar) session for Quest 3 — Phase 5, Milestone 0.
//
// Scope of M0: enter passthrough, aim at the real floor, drop the plan there, and
// lock it to a spatial anchor so it stays put as you walk. We render the FLOOR
// PLAN flat on the ground (footprint fill + outline), NOT the extruded walls — at
// 1:1 the walls would obscure the real room, and the flat plan is what the survey
// workflow needs. NO editing, NO survey yet — this only proves the XR plumbing.
//
// Fully additive: does nothing to the desktop app until the user taps "START AR",
// and the button only appears where immersive-ar is supported (the Quest browser).
// CANNOT be verified headlessly — `npm run build` only proves it compiles; the
// real check is putting on the Quest in the Meta/Horizon browser.

import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { Rectangle } from '../core/model.js';
import { makeDistance, makeOriginDistance, ORIGIN_ID, edgeCoord } from '../core/constraints.js';
import { footprintFloorGeometry } from '../core/extrude.js';
import { toMeters, unitLabel, fmt } from '../core/units.js';
import { serializeProject, deserializeInto } from '../io/serialize.js';
import { rlog } from './remoteLog.js';

const ACCENT = 0x4ea1ff;

// Build stamp (git hash + UTC time), injected by Vite `define`. Shown on the HUD so
// you can confirm on-device that a fresh deploy loaded, not a stale SW cache.
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/**
 * @param {View3D} view
 * @param {Project} project  the live model — SURVEY mode authors rectangles into it
 * @param {() => number[][][][]} getFootprint  returns the current footprint MultiPolygon
 */
export function setupMR(view, project, getFootprint) {
  const { renderer, scene } = view;

  // Render in the SAME reference space we measure/place in. Three defaults to
  // 'local' (origin at head height at session start); our hit poses and anchors
  // use 'local-floor' (origin on the floor). That mismatch drew the plan a full
  // eye-height too high. Align Three's render space to the floor.
  renderer.xr.setReferenceSpaceType('local-floor');

  // Passthrough is implicit in immersive-ar. local-floor puts the real floor at
  // y=0; anchors keep the placed plan put against tracking drift. We place by
  // touching the floor with the controller (tracked position), so no hit-test is
  // needed. depth-sensing is intentionally OMITTED: its automatic occlusion is
  // noisy at the floor plane and makes the flat plan flicker/spotty. Re-add it
  // later, selectively, for the 3D walls where real-object occlusion helps.
  const sessionInit = {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['anchors'],
  };

  // ARButton handles support-detection, the secure-context/HTTPS requirement, and
  // the whole start/stop session lifecycle. It disables itself where unsupported.
  const button = ARButton.createButton(renderer, sessionInit);
  button.classList.add('mr-btn');
  (document.getElementById('ar-group') || document.body).appendChild(button);

  // Packaged Quest APK (immersive app mode) launches with ?ar=1 and shows only a
  // splash until the page starts an immersive session — so auto-enter AR on load.
  // Launching the app icon provides the user-activation WebXR needs. The desktop
  // web app has no ?ar, so it keeps the manual START AR button. console.* is
  // mirrored to `adb logcat` (chromium) for on-device debugging of the APK.
  if (new URLSearchParams(location.search).has('ar')) {
    // Call requestSession DIRECTLY — NOT gated on isSessionSupported, which
    // returns false/unreliable in the immersive shell and, if we bailed, would
    // leave the launch splash up forever. Retry a few times for XR-device
    // readiness; the app-icon launch supplies the required user activation.
    const autoStartAR = async (attempt = 0) => {
      console.info('[auto-AR] attempt', attempt); rlog('auto-AR attempt', { attempt });
      try {
        const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
        await renderer.xr.setSession(session);
        console.info('[auto-AR] session started'); rlog('auto-AR: started');
      } catch (e) {
        const msg = `${e?.name || ''} ${e?.message || e}`;
        console.error('[auto-AR] failed:', msg); rlog('auto-AR failed', { attempt, msg });
        if (attempt < 6) setTimeout(() => autoStartAR(attempt + 1), 700);
      }
    };
    if (navigator.xr) autoStartAR();
  }

  // A small floating text label (canvas texture) that rides a controller tip and
  // always shows the current mode — so a shared touch gesture can't be misfired.
  function makeLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(0.12, 0.03, 1);
    sprite.position.set(0, 0.06, 0); // just above the tip
    const setText = (text, colorHex) => {
      ctx.clearRect(0, 0, 256, 64);
      // Dark backing pill so the label stays legible over passthrough.
      ctx.fillStyle = 'rgba(15, 18, 24, 0.78)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 34);
      tex.needsUpdate = true;
    };
    return { sprite, setText };
  }

  // A multi-line debug HUD (rides the left controller) for on-headset diagnosis.
  function makeDebug() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320; // taller so the extra build-stamp line fits without clipping
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(0.24, 0.15, 1); // match the 512x320 aspect
    sprite.position.set(0, 0.14, -0.04);
    const setLines = (lines) => {
      ctx.clearRect(0, 0, 512, 320);
      ctx.fillStyle = 'rgba(15, 18, 24, 0.82)';
      ctx.beginPath();
      ctx.roundRect(6, 6, 500, 308, 14);
      ctx.fill();
      ctx.fillStyle = '#e6edf3';
      ctx.font = '28px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => ctx.fillText(line, 20, 20 + i * 36));
      tex.needsUpdate = true;
    };
    return { sprite, setLines };
  }

  // S2 numpad: a canvas-textured panel you aim the controller ray at to enter
  // exact tape dimensions. Keys are hit-tested by the ray's UV on the plane (no
  // per-key meshes). Layout: a display line (field + typed value + unit) over a
  // 3x4 digit grid and a full-width ENTER row.
  function makeNumpad() {
    const W = 512, H = 640;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.30, 0.375),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    );
    mesh.renderOrder = 20;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;

    const DISP_H = 140, ROWS = 5, CELL_H = (H - DISP_H) / ROWS, COLS = 3, CELL_W = W / COLS;
    const grid = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['.', '0', 'back']];
    const keyLabel = { back: '⌫', enter: 'ENTER', swap: '⇄ FLIP', del: '🗑 DEL' };

    // Plane UV -> key id (or null). Texture flipY maps canvas-top to v=1.
    function keyAt(u, v) {
      const cx = u * W, cy = (1 - v) * H;
      if (cy < DISP_H) return null;
      const row = Math.floor((cy - DISP_H) / CELL_H);
      if (row < 0 || row >= ROWS) return null;
      if (row === 4) { const t = Math.floor(cx / (W / 3)); return t === 0 ? 'swap' : t === 1 ? 'del' : 'enter'; } // SWAP | DEL | ENTER
      const col = Math.min(COLS - 1, Math.max(0, Math.floor(cx / CELL_W)));
      return grid[row]?.[col] ?? null;
    }

    function draw(title, buffer, hoverKey) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15,18,24,0.94)';
      ctx.beginPath(); ctx.roundRect(0, 0, W, H, 22); ctx.fill();
      // Display line: the two references (or a prompt), then value + unit.
      ctx.fillStyle = '#8b949e';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(title, 26, 42);
      ctx.fillStyle = '#e6edf3';
      ctx.font = 'bold 60px monospace';
      ctx.textAlign = 'right';
      ctx.fillText((buffer || '0') + ' ' + unitLabel(), W - 26, 98);
      // Keys.
      ctx.font = 'bold 46px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const key = (kid, x, y, w, h) => {
        const hot = hoverKey && hoverKey === kid;
        if (kid === 'enter') ctx.fillStyle = hot ? 'rgba(52,211,153,0.95)' : 'rgba(34,110,80,0.9)';
        else if (kid === 'swap') ctx.fillStyle = hot ? 'rgba(251,191,36,0.95)' : 'rgba(146,104,20,0.9)';
        else if (kid === 'del') ctx.fillStyle = hot ? 'rgba(248,113,113,0.95)' : 'rgba(127,29,29,0.9)';
        else ctx.fillStyle = hot ? 'rgba(96,165,250,0.9)' : 'rgba(48,54,61,0.92)';
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill();
        ctx.fillStyle = '#e6edf3';
        ctx.fillText(keyLabel[kid] ?? kid, x + w / 2, y + h / 2 + 2);
      };
      for (let r = 0; r < 4; r++) { // digit rows
        for (let c = 0; c < COLS; c++) {
          key(grid[r][c], c * CELL_W + 6, DISP_H + r * CELL_H + 6, CELL_W - 12, CELL_H - 12);
        }
      }
      // Bottom row: SWAP | DEL | ENTER (thirds). Smaller font so labels fit.
      ctx.font = 'bold 34px sans-serif';
      const by = DISP_H + 4 * CELL_H + 6, bh = CELL_H - 12, tw = W / 3;
      key('swap', 6, by, tw - 12, bh);
      key('del', tw + 6, by, tw - 12, bh);
      key('enter', 2 * tw + 6, by, tw - 12, bh);
      tex.needsUpdate = true;
    }

    return { group, mesh, keyAt, draw };
  }

  // SAVE/LOAD slot menu: same ray-aimed canvas panel as the numpad, but the cells
  // are persistence slots (2 cols x 3 rows = 6). A filled slot shows when it was
  // saved and how many rectangles it holds; empty slots read "empty". One panel is
  // reused by both modes — draw() recolors/retitles for SAVE (green) vs LOAD (blue).
  const SLOT_COLS = 2, SLOT_ROWS = 3, SLOT_COUNT = SLOT_COLS * SLOT_ROWS;
  function makeSlotMenu() {
    const W = 512, H = 640;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.30, 0.375),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    );
    mesh.renderOrder = 20;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;

    const TITLE_H = 96, CELL_H = (H - TITLE_H) / SLOT_ROWS, CELL_W = W / SLOT_COLS;

    // Plane UV -> slot index (or null). Texture flipY maps canvas-top to v=1.
    function slotAt(u, v) {
      const cx = u * W, cy = (1 - v) * H;
      if (cy < TITLE_H) return null;
      const row = Math.floor((cy - TITLE_H) / CELL_H);
      const col = Math.floor(cx / CELL_W);
      if (row < 0 || row >= SLOT_ROWS || col < 0 || col >= SLOT_COLS) return null;
      return row * SLOT_COLS + col;
    }

    // metaFor(i) -> {rects, when} | null ; accent is the mode's color as '#rrggbb'.
    function draw(title, accent, hoverSlot, metaFor) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15,18,24,0.94)';
      ctx.beginPath(); ctx.roundRect(0, 0, W, H, 22); ctx.fill();
      ctx.fillStyle = accent;
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(title, 26, TITLE_H / 2);
      for (let i = 0; i < SLOT_COUNT; i++) {
        const row = Math.floor(i / SLOT_COLS), col = i % SLOT_COLS;
        const x = col * CELL_W + 8, y = TITLE_H + row * CELL_H + 8;
        const w = CELL_W - 16, h = CELL_H - 16;
        const meta = metaFor(i);
        const hot = hoverSlot === i;
        ctx.fillStyle = hot ? accent : (meta ? 'rgba(48,54,61,0.95)' : 'rgba(33,38,45,0.8)');
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill();
        ctx.fillStyle = hot ? '#0d1117' : '#8b949e';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`SLOT ${i + 1}`, x + 18, y + 14);
        if (meta) {
          ctx.fillStyle = hot ? '#0d1117' : '#e6edf3';
          ctx.font = 'bold 32px sans-serif';
          ctx.fillText(`${meta.rects} rect${meta.rects === 1 ? '' : 's'}`, x + 18, y + h - 78);
          ctx.fillStyle = hot ? '#0d1117' : '#79c0ff';
          ctx.font = '24px sans-serif';
          ctx.fillText(meta.when, x + 18, y + h - 40);
        } else {
          ctx.fillStyle = hot ? '#0d1117' : '#484f58';
          ctx.font = 'italic 30px sans-serif';
          ctx.fillText('empty', x + 18, y + h - 56);
        }
      }
      tex.needsUpdate = true;
    }

    return { group, mesh, slotAt, draw };
  }

  // The marker sits ahead of the controller's tracked origin, along the pointing
  // ray, so it clears the physical controller body (which would occlude it) and
  // reads as a "tip." Placement uses this same offset point (see tipPosition).
  const TIP_OFFSET = new THREE.Vector3(0, 0, -0.04); // 4 cm forward along -Z

  // Render order for controller-mounted UI (mode label, readout pill, debug HUD).
  // All overlays use depthTest:false, so paint order is purely renderOrder; this
  // must sit above every world-space overlay (edges/rectHi/zebra ≤12, numpad ≤21)
  // so the controller panels are never hidden by a floor fill like the zebra.
  const HUD_ORDER = 100;

  // Controllers, each with a small sphere "tip" you touch to the real floor, plus
  // a mode label. Placement uses the controller's tracked position (cm-accurate)
  // rather than a depth raycast, so the floor is defined by physically touching it.
  const tipGeom = new THREE.SphereGeometry(0.012, 16, 12);
  const tipMat = new THREE.MeshBasicMaterial({ color: ACCENT });
  const controllers = [];
  const labels = [];
  const debugs = [];
  const readouts = []; // per-controller dimension-value pill (shown on ray hover)
  for (const i of [0, 1]) {
    const c = renderer.xr.getController(i); // target-ray space: -Z is the pointing dir
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.position.copy(TIP_OFFSET);
    c.add(tip);
    const label = makeLabel();
    label.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + 0.05, TIP_OFFSET.z);
    label.sprite.renderOrder = HUD_ORDER; // controller UI paints over every world overlay (zebra etc.)
    c.add(label.sprite);
    labels.push(label);
    // A larger pill above the mode label that shows the value of whichever
    // constraint the ray is pointing at — a legible "close-up" of small in-world
    // dimension text. Hidden until the ray hovers a dimension.
    const readout = makeLabel();
    readout.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + 0.10, TIP_OFFSET.z);
    readout.sprite.scale.set(0.2, 0.05, 1);
    readout.sprite.visible = false;
    readout.sprite.renderOrder = HUD_ORDER;
    c.add(readout.sprite);
    readouts.push(readout);
    const dbg = makeDebug(); // debug HUD above each tip so it's always in view
    dbg.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + 0.20, TIP_OFFSET.z);
    dbg.sprite.renderOrder = HUD_ORDER;
    c.add(dbg.sprite);
    debugs.push(dbg);
    c.addEventListener('select', onSelect);   // trigger: run current mode
    c.addEventListener('squeezestart', onSqueezeStart); // grip press: begin a grip-drag if over a target
    c.addEventListener('squeeze', onReset);   // grip: undo placement (unless a grip-drag ran)
    c.addEventListener('squeezeend', onSqueezeEnd);     // grip release: end the grip-drag
    // Remember which XRInputSource drives this controller object so we can show
    // its tip/label only while it's the active hand.
    c.addEventListener('connected', (e) => { c.userData.inputSource = e.data; });
    c.addEventListener('disconnected', () => { c.userData.inputSource = null; });
    scene.add(c);
    controllers.push(c);
  }
  const lastTouch = new THREE.Vector3(NaN, NaN, NaN);

  // A ring that lies on the floor under the active controller tip, previewing
  // where a touch will land. Recolors with the current mode.
  const RETICLE_OUTER = 0.08; // m; also the EDGE-pick radius (edge must fall in the ring)
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, RETICLE_OUTER, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.6 }),
  );
  reticle.visible = false;
  scene.add(reticle);

  // Highlights for the survey edge you're pointing at (magenta) or have locked
  // (yellow) — a strip drawn along that edge, just above the floor. Two of them so
  // SIZE can show both picked references (edge A and edge B) at once.
  function makeEdgeHi() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3)); // 2 triangles
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff5db1, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    m.renderOrder = 10; // always on top of the resting/active edge strips
    m.visible = false;
    // We rewrite the vertex positions (world-space) every frame in showEdge but never
    // recompute the bounding sphere, so it stays at the origin with radius 0. Disable
    // frustum culling or Three culls the strip whenever the world origin leaves view —
    // i.e. the highlight vanishes when you turn away from origin with the reticle held.
    m.frustumCulled = false;
    scene.add(m);
    return m;
  }
  const edgeHi = makeEdgeHi();
  const edgeHi2 = makeEdgeHi();

  // A round numeric badge (canvas sprite, always faces you) — RECAL uses these to
  // number the two walls "1"/"2" and to echo the current step on the reticle.
  function makeBadge() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false }));
    sprite.scale.set(0.10, 0.10, 1);
    sprite.renderOrder = 30; // above the floor overlays/highlights
    sprite.visible = false;
    function setText(txt, color) {
      ctx.clearRect(0, 0, 128, 128);
      ctx.fillStyle = 'rgba(15,18,24,0.92)';
      ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 9; ctx.strokeStyle = color; ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 82px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, 64, 72);
      tex.needsUpdate = true;
    }
    scene.add(sprite);
    return { sprite, setText };
  }
  const C_WALL1 = '#22d3ee', C_WALL2 = '#a78bfa'; // RECAL wall-1 (cyan) / wall-2 (purple)
  const recalBadge1 = makeBadge(); recalBadge1.setText('1', C_WALL1); // rides wall 1
  const recalBadge2 = makeBadge(); recalBadge2.setText('2', C_WALL2); // rides wall 2
  const recalStep = makeBadge();                                      // rides the reticle (current step)

  // Whole-zone outline highlight for EDIT mode (the room/wall under your ray). All
  // four edges in one buffer (4 edges * 2 triangles * 3 verts = 24 verts / 72 floats).
  const rectHi = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(72), 3)),
    new THREE.MeshBasicMaterial({ color: 0x51d88a, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
  );
  rectHi.renderOrder = 11;
  rectHi.visible = false;
  rectHi.frustumCulled = false; // positions rewritten each frame (see makeEdgeHi note)
  scene.add(rectHi);

  // Zebra fill for the SELECTED zone in EDIT mode: a seamless 45° diagonal stripe
  // texture over the whole rectangle, so the active selection reads instantly and
  // distinctly from the op-colored outline. Tiles at a constant world size (repeat
  // is set per-frame from the zone's dimensions), so stripes stay the same width
  // whatever the zone's size.
  const ZEBRA_PERIOD = 0.6; // m of plan covered by one texture tile (4 stripe pairs)
  // Zebra tints (white texture is multiplied by these): blue for ROOM (add),
  // red for WALL (subtract) — matches the desktop add=blue / subtract=red convention.
  const ZEBRA_ADD = 0x60a5fa, ZEBRA_SUB = 0xff6b6b;
  function makeZebraTexture() {
    const N = 64, P = 16; // tile px, stripe period px (P divides N -> seamless)
    const canvas = document.createElement('canvas');
    canvas.width = N; canvas.height = N;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const on = ((x + y) % P) < P * 0.375; // thin 45° bands, exactly periodic in x and y
        const i = (y * N + x) * 4;
        // White so the material color tints it; low alpha keeps the fill discreet.
        img.data[i] = 0xff; img.data[i + 1] = 0xff; img.data[i + 2] = 0xff;
        img.data[i + 3] = on ? 90 : 0; // faint stripe / transparent gap
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }
  const zebra = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), // lie flat, matching plan (x,y)->(x,0,-y)
    new THREE.MeshBasicMaterial({ map: makeZebraTexture(), transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
  );
  zebra.renderOrder = 10; // under the outline (11), over the fill
  zebra.visible = false;
  scene.add(zebra);
  const _zp = new THREE.Vector3(); // scratch: selected-zone center in world

  // RECAL corner marker: a floor ring at a plan corner — previews the nearest
  // corner under your tip (cyan) before you lock it, then rides the locked corner
  // (purple) while you touch the edge direction.
  const cornerHi = new THREE.Mesh(
    new THREE.RingGeometry(0.035, 0.06, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
  );
  cornerHi.renderOrder = 11; // above the edge highlight
  cornerHi.visible = false;
  scene.add(cornerHi);

  // S2 numpad panel + a small cursor dot showing where the ray meets it.
  const numpad = makeNumpad();
  scene.add(numpad.group);
  const numpadCursor = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x60a5fa, depthTest: false, depthWrite: false }),
  );
  numpadCursor.renderOrder = 21;
  numpadCursor.visible = false;
  scene.add(numpadCursor);

  // SAVE/LOAD slot menu panel (shares numpadCursor as its ray-hit dot).
  const slotMenu = makeSlotMenu();
  scene.add(slotMenu.group);

  // Origin gizmo: a ring at the plan origin plus a short +X arrow showing the ALIGN
  // direction, so you always see where the frame is registered — and, when there
  // are no zones yet, it's the placeholder that proves placement worked. It rides
  // planPos/planYaw (see applyPlanMatrix), so it's kept OUT of planGroup (which
  // buildPlan clears every rebuild).
  const originGizmo = new THREE.Group();
  const C_ORIGIN_GIZMO = 0x2dd4bf;
  const originRingMat = new THREE.MeshBasicMaterial({ color: C_ORIGIN_GIZMO, side: THREE.DoubleSide, depthWrite: false });
  {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.07, 24).rotateX(-Math.PI / 2), originRingMat);
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.001, 0, 0.35, 0.001, 0], 3));
    const arrow = new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: C_ORIGIN_GIZMO }));
    originGizmo.add(ring, arrow); // arrow along local +X = plan +X (the ALIGN axis)
  }
  originGizmo.visible = false;
  scene.add(originGizmo);

  // The placed plan lives in this group; its position/rotation follow the anchor.
  const planGroup = new THREE.Group();
  planGroup.visible = false;

  const fillMat = new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false,
  });
  // Edges are drawn as thin FLOOR STRIPS (flat quads) rather than 1px GL lines, so
  // they read bold at 1:1. Materials are MeshBasic; DoubleSide so they show from
  // any angle. depthWrite off so stacked strips/fill don't z-fight.
  const EDGE_HALF = 0.005;   // strip half-width -> 1 cm resting edge
  const EDGE_HI_HALF = 0.01; // half-width for hover/lock highlights -> 2 cm, bolder than rest
  const restMat = new THREE.MeshBasicMaterial({ color: 0x9b6dff, side: THREE.DoubleSide, depthWrite: false });   // resting ROOM (add) edges
  const activeMat = new THREE.MeshBasicMaterial({ color: 0xd8b4fe, side: THREE.DoubleSide, depthWrite: false }); // active ROOM (add) edges
  // WALL (subtract) zones get a red hue so "wall" reads distinctly from "roomspace"
  // (add), matching the desktop add=blue / subtract=red convention.
  const restSubMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b, side: THREE.DoubleSide, depthWrite: false });   // resting WALL (subtract) edges
  const activeSubMat = new THREE.MeshBasicMaterial({ color: 0xffb4b4, side: THREE.DoubleSide, depthWrite: false }); // active WALL (subtract) edges
  const lockedMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false });    // WHITE: an edge whose axis is fully pinned (position+size)
  // Dimension (constraint) annotations: thin blue floor strips for the dim/extension
  // lines, red when the constraint conflicts. Value shown on a billboarded label.
  const dimMat = new THREE.MeshBasicMaterial({ color: 0x79c0ff, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  const dimConflictMat = new THREE.MeshBasicMaterial({ color: 0xff5c5c, side: THREE.DoubleSide, depthTest: false, depthWrite: false });

  // Plan-space corners [c0,c1,c2,c3] of a thickened axis-aligned segment A->B.
  function stripCorners(ax, ay, bx, by, t) {
    let px = 0, py = 0;
    if (Math.abs(ax - bx) < 1e-9) px = t; // vertical edge -> thicken in x
    else py = t;                          // horizontal edge -> thicken in y
    return [[ax - px, ay - py], [bx - px, by - py], [bx + px, by + py], [ax + px, ay + py]];
  }

  // Two-triangle strip geometry for the 4 edges of each rectangle, in planGroup-
  // local coords (plan (x,y) -> (x,0,-y)). Drawn UNMERGED so every zone's own
  // edges stay visible for editing, even where zones overlap.
  function rectStripGeo(rects, t = EDGE_HALF, wantEdge = null) {
    const arr = [];
    const tri = (c) => arr.push(c[0], 0, -c[1]);
    for (const r of rects) {
      const b = r.bounds;
      const edges = [
        ['bottom', b.x0, b.y0, b.x1, b.y0], ['right', b.x1, b.y0, b.x1, b.y1],
        ['top', b.x1, b.y1, b.x0, b.y1], ['left', b.x0, b.y1, b.x0, b.y0],
      ];
      for (const [name, ax, ay, bx, by] of edges) {
        if (wantEdge && !wantEdge(r, name)) continue;
        const c = stripCorners(ax, ay, bx, by, t);
        tri(c[0]); tri(c[1]); tri(c[2]);
        tri(c[0]); tri(c[2]); tri(c[3]);
      }
    }
    if (!arr.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return geo;
  }

  // Endpoints + coordinate of an edge in plan coords (mirror of sketch2d's
  // _edgeLineWorld). null for the origin ref, so origin-distance constraints are
  // skipped here — same as the desktop, which draws no line for __origin__.
  function edgeLine(ref) {
    if (!ref || ref.rect === ORIGIN_ID) return null;
    const r = project.rectangles.find((x) => x.id === (ref.rect.id ?? ref.rect));
    if (!r) return null;
    const b = r.bounds;
    const coord = edgeCoord(r, ref.edge);
    switch (ref.edge) {
      case 'left': return { p0: { x: b.x0, y: b.y0 }, p1: { x: b.x0, y: b.y1 }, coord };
      case 'right': return { p0: { x: b.x1, y: b.y0 }, p1: { x: b.x1, y: b.y1 }, coord };
      case 'bottom': return { p0: { x: b.x0, y: b.y0 }, p1: { x: b.x1, y: b.y0 }, coord };
      case 'top': return { p0: { x: b.x0, y: b.y1 }, p1: { x: b.x1, y: b.y1 }, coord };
      default: return null;
    }
  }

  const DIM_OFFSET = 0.2;   // m, dim line sits this far outside the geometry
  const DIM_TIER = 0.14;    // m, stack successive dims on an axis to reduce overlap
  const DIM_EXT_OVER = 0.04; // m, extension line runs a little past the dim line
  const DIM_T = 0.0025;     // m, strip half-width -> 0.5 cm thin, so dims don't cover room edges
  const DIM_DASH = 0.04;    // m, dash length for the dashed dim/extension lines
  const DIM_GAP = 0.03;     // m, gap between dashes

  // Dimension value labels currently in the plan, for ray-hover pick (their value
  // is echoed big on the controller). Rebuilt with the plan each edit.
  let dimSprites = [];

  // A billboarded value label (canvas pill, always faces the user) at a plan point.
  function makeDimLabel(text, color, px, py) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 18, 24, 0.82)';
    ctx.beginPath(); ctx.roundRect(6, 14, 244, 36, 10); ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(0.16, 0.04, 1);
    sprite.position.set(px, 0.04, -py); // plan (x,y) -> local (x,0,-y), lifted 4 cm
    sprite.userData.dimText = text;     // the value, echoed on the controller on hover
    return sprite;
  }

  // Draw every distance constraint of the active floor into planGroup: a dim line
  // between the two edges (offset outward), extension lines, and the value label.
  function buildDimensions() {
    const segs = [];        // {ax,ay,bx,by,conflict} strips to build
    dimSprites = [];        // value labels, for hover pick
    // A dim value label carries its constraint id + both refs, so ray-hovering it can
    // highlight that constraint's edges and selecting it loads the constraint to edit.
    const endpointToRef = (ep) => ep.rect === ORIGIN_ID ? { kind: 'origin' } : { kind: 'edge', rectId: ep.rect, edge: ep.edge };
    const pushDim = (sprite, c) => {
      sprite.userData.cId = c.id;
      sprite.userData.refA = endpointToRef(c.a);
      sprite.userData.refB = endpointToRef(c.b);
      dimSprites.push(sprite);
    };
    let xTier = 0, yTier = 0;
    for (const c of (project.constraints || [])) {
      if (c.type !== 'distance') continue;
      const aOrigin = c.a.rect === ORIGIN_ID, bOrigin = c.b.rect === ORIGIN_ID;
      // Edge<->origin position lock: draw a dim from the origin axis (coord 0) to the
      // edge, so the lock is visible (desktop skips it; the AR survey needs to see it).
      if (aOrigin || bOrigin) {
        const eref = aOrigin ? c.b : c.a;
        const le = edgeLine(eref);
        if (!le) continue;
        const conflict = !!c.conflict;
        const text = `${fmt(Math.abs(c.value))} ${unitLabel()}`;
        const color = conflict ? '#ff5c5c' : '#79c0ff';
        if (isXEdge(eref.edge)) {
          const yLine = c.offset != null ? c.offset : (le.p0.y + le.p1.y) / 2; // grip-drag pins offset
          segs.push({ ax: 0, ay: yLine, bx: le.coord, by: yLine, conflict });            // origin -> edge line
          segs.push({ ax: le.coord, ay: le.p0.y, bx: le.coord, by: le.p1.y, conflict }); // tick along the edge
          pushDim(makeDimLabel(text, color, le.coord / 2, yLine), c);
        } else {
          const xLine = c.offset != null ? c.offset : (le.p0.x + le.p1.x) / 2;
          segs.push({ ax: xLine, ay: 0, bx: xLine, by: le.coord, conflict });            // origin -> edge line
          segs.push({ ax: le.p0.x, ay: le.coord, bx: le.p1.x, by: le.coord, conflict }); // tick along the edge
          pushDim(makeDimLabel(text, color, xLine, le.coord / 2), c);
        }
        continue;
      }
      const la = edgeLine(c.a), lb = edgeLine(c.b);
      if (!la || !lb) continue;
      const conflict = !!c.conflict;
      const text = `${fmt(Math.abs(c.value))} ${unitLabel()}`;
      const color = conflict ? '#ff5c5c' : '#79c0ff';
      if (c.axis === 'x') {
        const xa = la.coord, xb = lb.coord;
        const yBase = Math.max(la.p1.y, lb.p1.y);
        // Pinned offset (grip-dragged) overrides auto-stacking; unpinned dims still tier.
        const yLine = c.offset != null ? yBase + c.offset : yBase + DIM_OFFSET + (xTier++) * DIM_TIER;
        segs.push({ ax: xa, ay: yLine, bx: xb, by: yLine, conflict });            // dim line
        segs.push({ ax: xa, ay: la.p1.y, bx: xa, by: yLine + DIM_EXT_OVER, conflict }); // ext a
        segs.push({ ax: xb, ay: lb.p1.y, bx: xb, by: yLine + DIM_EXT_OVER, conflict }); // ext b
        pushDim(makeDimLabel(text, color, (xa + xb) / 2, yLine), c);
      } else {
        const ya = la.coord, yb = lb.coord;
        const xBase = Math.max(la.p1.x, lb.p1.x);
        const xLine = c.offset != null ? xBase + c.offset : xBase + DIM_OFFSET + (yTier++) * DIM_TIER;
        segs.push({ ax: xLine, ay: ya, bx: xLine, by: yb, conflict });            // dim line
        segs.push({ ax: la.p1.x, ay: ya, bx: xLine + DIM_EXT_OVER, by: ya, conflict }); // ext a
        segs.push({ ax: lb.p1.x, ay: yb, bx: xLine + DIM_EXT_OVER, by: yb, conflict }); // ext b
        pushDim(makeDimLabel(text, color, xLine, (ya + yb) / 2), c);
      }
    }
    // Build strips in two batches so conflict lines share a material with the rest.
    for (const conflict of [false, true]) {
      const arr = [];
      const tri = (p) => arr.push(p[0], 0, -p[1]);
      // Emit a segment as a row of dashes (thin quads) so dim lines read as dashed
      // and don't visually cover the solid room edges underneath.
      const pushDashed = (ax, ay, bx, by) => {
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-6) return;
        const ux = (bx - ax) / len, uy = (by - ay) / len, period = DIM_DASH + DIM_GAP;
        for (let t = 0; t < len; t += period) {
          const t2 = Math.min(t + DIM_DASH, len);
          const cc = stripCorners(ax + ux * t, ay + uy * t, ax + ux * t2, ay + uy * t2, DIM_T);
          tri(cc[0]); tri(cc[1]); tri(cc[2]);
          tri(cc[0]); tri(cc[2]); tri(cc[3]);
        }
      };
      for (const s of segs) {
        if (s.conflict !== conflict) continue;
        pushDashed(s.ax, s.ay, s.bx, s.by);
      }
      if (!arr.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const m = new THREE.Mesh(geo, conflict ? dimConflictMat : dimMat);
      m.position.y = 0.008; // above the edge strips
      m.renderOrder = 12;
      planGroup.add(m);
    }
    for (const s of dimSprites) planGroup.add(s);
  }

  // Edges whose axis is FULLY pinned — both edges on that axis connect to the plan
  // ORIGIN through the constraint graph (so position is tied to the datum AND the
  // size between them is fixed). Returned as a Set of `${rectId}:${edge}`; these
  // render white. Computed per axis via union-find over edge-coordinate nodes.
  function lockedEdges() {
    const parent = new Map();
    const find = (k) => {
      if (!parent.has(k)) parent.set(k, k);
      let root = k;
      while (parent.get(root) !== root) root = parent.get(root);
      while (parent.get(k) !== root) { const nx = parent.get(k); parent.set(k, root); k = nx; }
      return root;
    };
    const union = (a, b) => { parent.set(find(a), find(b)); };
    const axisOf = (edge) => (edge === 'left' || edge === 'right' ? 'x' : 'y');
    for (const c of project.constraints) {
      if (c.type !== 'distance') continue;
      const aOrigin = c.a.rect === ORIGIN_ID, bOrigin = c.b.rect === ORIGIN_ID;
      const ax = axisOf(aOrigin ? c.b.edge : c.a.edge); // axis from the non-origin endpoint
      union(aOrigin ? `O:${ax}` : `${c.a.rect}:${c.a.edge}`,
            bOrigin ? `O:${ax}` : `${c.b.rect}:${c.b.edge}`);
    }
    const white = new Set();
    const pinned = (rid, e, ax) => parent.has(`${rid}:${e}`) && find(`${rid}:${e}`) === find(`O:${ax}`);
    for (const r of project.rectangles) {
      if (pinned(r.id, 'left', 'x') && pinned(r.id, 'right', 'x')) { white.add(`${r.id}:left`); white.add(`${r.id}:right`); }
      if (pinned(r.id, 'bottom', 'y') && pinned(r.id, 'top', 'y')) { white.add(`${r.id}:bottom`); white.add(`${r.id}:top`); }
    }
    return white;
  }

  function buildPlan() {
    // Clear any previous geometry. Dispose sprite textures/materials too (dim
    // labels create a CanvasTexture each rebuild) so they don't leak.
    for (const child of [...planGroup.children]) {
      planGroup.remove(child);
      child.geometry?.dispose();
      if (child.isSprite) { child.material.map?.dispose(); child.material.dispose(); }
    }
    const footprint = getFootprint?.() ?? [];
    const fillGeo = footprintFloorGeometry(footprint); // merged fill = total free space
    if (fillGeo) planGroup.add(new THREE.Mesh(fillGeo, fillMat));
    // Per-rectangle edge strips. Non-active zones sit lower; the active zone is
    // brighter and on top. ROOM (add) zones are purple, WALL (subtract) zones red —
    // so you can tell roomspace from wall at a glance.
    const pushStrips = (rects, mat, y, wantEdge) => {
      const geo = rectStripGeo(rects, EDGE_HALF, wantEdge);
      if (!geo) return;
      const o = new THREE.Mesh(geo, mat);
      o.position.y = y; // lift above the fill
      planGroup.add(o);
    };
    // Fully-pinned (position+size) edges render WHITE; the rest keep their op color.
    const locked = lockedEdges();
    const isLocked = (r, e) => locked.has(`${r.id}:${e}`);
    const notLocked = (r, e) => !isLocked(r, e);
    const others = project.rectangles.filter((r) => r !== activeRect);
    pushStrips(others.filter((r) => r.op !== 'subtract'), restMat, 0.004, notLocked);
    pushStrips(others.filter((r) => r.op === 'subtract'), restSubMat, 0.004, notLocked);
    pushStrips(others, lockedMat, 0.005, isLocked); // white locked edges, just above resting
    if (activeRect) {
      pushStrips([activeRect], activeRect.op === 'subtract' ? activeSubMat : activeMat, 0.006, notLocked);
      pushStrips([activeRect], lockedMat, 0.007, isLocked); // white locked edges of the active zone
    }
    buildDimensions(); // constraint dimension lines + value labels
    return planGroup.children.length > 0;
  }

  let localSpace = null;
  let currentFrame = null;
  let anchor = null;
  let placed = false;
  const saved = {};
  const planPos = new THREE.Vector3(); // last placed reference point (world)
  let planYaw = 0;                     // plan rotation about vertical, set by REGISTER
  let floorY = 0;                      // floor height; 0 = local-floor, overridable by FLOOR
  let registerPts = [];                // REGISTER 3-point gesture: [P1,P2 along a wall, P3 on the perpendicular wall]
  let recalPts = [];                   // RECAL 3-point gesture (world {x,z}): [P1,P2 along wall 1, P3 on wall 2]
  let recalCorner = null;              // {cx, cy, a, b} plan corner being re-referenced + its two wall endpoints
  let prevRecalStep = null;            // last reticle step number drawn (redraw the badge only on change)
  const UP = new THREE.Vector3(0, 1, 0);

  // SURVEY state. We author free-space rectangles and refine their edges by
  // pointing at an edge (ray) then touching the matching real wall.
  const surveyed = [];      // Rectangle ids this session, in creation order (for undo)
  let activeRect = null;    // the rectangle whose edges EDGE mode edits (last dropped)
  let selectedEdge = null;  // {rectId, edge} locked, awaiting a wall touch
  let edgeSnapPrompt = false; // EDGE label currently shows the "snap to wall" state (edge locked)
  let hoverEdge = null;     // {rectId, edge} under the ray across ALL zones (per frame)
  let selectedRect = null;  // EDIT mode: the persistently-selected zone (survives aim)
  let hoverStack = [];      // EDIT mode: zones under the ray this frame, topmost-first

  // SIZE state (S2 numpad): the desktop dimension tool in AR. Pick two references
  // (each a rect EDGE or the plan ORIGIN axis), then type the exact distance,
  // written as a hard constraint. edge<->edge = a size; edge<->origin = a position
  // lock. Also edits an existing constraint between the same two references.
  // A reference is { kind:'edge', rectId, edge } or { kind:'origin' }.
  let dimRefA = null;       // first-picked reference (the anchor, like desktop)
  let dimRefB = null;       // second-picked reference
  let hoverRef = null;      // reference under the ray this frame (edge or origin)
  let hoverDim = null;      // dim value panel under the ray this frame (to select/edit a constraint)
  let gripDrag = null;      // active grip-drag: {kind:'dim',cId} (SIZE) or {kind:'edge',rectId,edge} (EDGE)
  let sizeBuffer = '';      // typed digits (prefilled with the current value when editing)
  let editingId = null;     // id of the constraint being edited (if it already existed)
  let dimConflict = false;  // last commit was refused (would over-constrain); shown on the numpad, cleared on next key
  let hoverKey = null;      // numpad key under the ray this frame
  let prevHoverKey = null;  // last drawn hover (redraw only on change)
  let hoverSlot = null;     // SAVE/LOAD slot under the ray this frame (0-based)
  let prevHoverSlot = null; // last drawn slot hover
  let slotFlash = null;     // transient panel title after a save/load ("SAVED 3"), cleared on next hover change

  // World point -> plan (x, y). extrude.js maps plan (x, y) -> planGroup-local
  // (x, 0, -y), and planGroup adds planYaw + planPos; worldToLocal inverts both
  // (and tracks any drift correction folded into planPos). Undo the y-flip.
  const _local = new THREE.Vector3();
  function worldToPlan(world) {
    planGroup.updateMatrixWorld(true); // planGroup may be hidden -> force a fresh matrix
    _local.copy(world);
    planGroup.worldToLocal(_local);
    return { px: _local.x, py: -_local.z };
  }

  // Plan (x, y) -> world, the inverse mapping (used to draw edge highlights).
  const _pw = new THREE.Vector3();
  const _drop = new THREE.Vector3(); // scratch for the DROP standing-position point
  const _cw = new THREE.Vector3();   // scratch for the RECAL corner-marker world point
  const _cam = new THREE.Vector3();  // scratch: camera world pos (numpad placement)
  const _camQ = new THREE.Quaternion();
  const _fwd = new THREE.Vector3();
  function planToWorld(px, py, target = _pw) {
    planGroup.updateMatrixWorld(true);
    target.set(px, 0, -py);
    return planGroup.localToWorld(target);
  }

  // Active floor's derived base elevation (m) off the ground datum. Register-once
  // establishes the ground origin; each storey's overlay lifts by this so it
  // renders at its real height above that origin (see Project._recomputeElevations).
  const activeElevation = () => project.activeFloor?.elevation ?? 0;
  // World Y of the active floor's overlay plane = registered ground level +
  // elevation. EDGE/SIZE ray hits and reticles use this so you edit at the floor
  // you're standing on, not the ground. A pure Y lift, so worldToPlan (which
  // reads x/z only) is unaffected — plan coords stay correct on every storey.
  const overlayY = () => planPos.y + activeElevation();

  // Rebuild the plan's transform from its origin (planPos), yaw (planYaw), and the
  // active floor's elevation lift. Drive position/quaternion (not .matrix) so
  // Three keeps matrixWorld in sync.
  function applyPlanMatrix() {
    planGroup.position.set(planPos.x, overlayY(), planPos.z);
    planGroup.quaternion.setFromAxisAngle(UP, planYaw);
    originGizmo.position.copy(planGroup.position); // gizmo rides the lifted origin + yaw
    originGizmo.quaternion.copy(planGroup.quaternion);
  }

  // --- edge-survey geometry helpers (plan space, using normalized bounds) ---

  // Plan-space endpoints [[x,y],[x,y]] of one edge of a rectangle.
  function edgeEndpoints(rect, edge) {
    const b = rect.bounds;
    switch (edge) {
      case 'left':   return [[b.x0, b.y0], [b.x0, b.y1]];
      case 'right':  return [[b.x1, b.y0], [b.x1, b.y1]];
      case 'bottom': return [[b.x0, b.y0], [b.x1, b.y0]];
      default:       return [[b.x0, b.y1], [b.x1, b.y1]]; // 'top'
    }
  }

  // Perpendicular distance from a plan point to an axis-aligned edge SEGMENT (not
  // its infinite line): clamps to the segment ends so a point off the end of an
  // edge isn't counted as "on" it.
  function ptSegDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const L2 = vx * vx + vy * vy;
    let t = L2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0;
    t = Math.min(1, Math.max(0, t));
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
  }

  // The edge the beam is actually pointing AT: the edge SEGMENT closest to the
  // aimed floor point (px,py), across ALL zones, within EDGE_PICK_M. Uses true
  // segment distance + a cap, so open floor picks nothing and the edge under your
  // reticle wins. Shared by EDGE and SIZE ref-picking. Returns {rectId, edge} | null.
  // Cap = the reticle's outer radius, so an edge is pickable ONLY when it actually
  // falls inside the ring you're aiming — not merely "somewhere near."
  const EDGE_PICK_M = RETICLE_OUTER; // m; edge must lie within the reticle ring to pick
  function edgeAtPoint(px, py) {
    let best = null, bestD = EDGE_PICK_M;
    for (const r of project.rectangles) {
      const b = r.bounds;
      const segs = [
        ['left', b.x0, b.y0, b.x0, b.y1], ['right', b.x1, b.y0, b.x1, b.y1],
        ['bottom', b.x0, b.y0, b.x1, b.y0], ['top', b.x0, b.y1, b.x1, b.y1],
      ];
      for (const [edge, ax, ay, bx, by] of segs) {
        const d = ptSegDist(px, py, ax, ay, bx, by);
        if (d < bestD) { bestD = d; best = { rectId: r.id, edge }; }
      }
    }
    return best;
  }

  // All zones containing a plan point, TOPMOST (last-created) first — EDIT mode's
  // overlap stack, which the trigger cycles down through.
  function rectsAtPoint(px, py) {
    const out = [];
    const rects = project.rectangles;
    for (let i = rects.length - 1; i >= 0; i--) if (rects[i].contains(px, py)) out.push(rects[i]);
    return out;
  }

  // Move one edge to a wall touch, keeping the OPPOSITE edge fixed and w/h >= 0.
  // left/right consume the touch's plan-X; bottom/top consume its plan-Y.
  function setEdge(rect, edge, px, py) {
    if (edge === 'left' || edge === 'right') {
      const other = edge === 'left' ? rect.x + rect.w : rect.x; // fixed opposite edge X
      rect.x = Math.min(px, other);
      rect.w = Math.abs(px - other);
    } else {
      const other = edge === 'bottom' ? rect.y + rect.h : rect.y; // fixed opposite edge Y
      rect.y = Math.min(py, other);
      rect.h = Math.abs(py - other);
    }
  }

  // Nearest plan-space corner of ANY surveyed rectangle to a plan point — RECAL's
  // reference-point pick (so you can re-zero off any known corner, not just origin).
  // Returns {cx, cy, a, b} where a/b are the far endpoints of the two walls meeting
  // at the corner (a = along the rectangle's X edge, b = along its Y edge), so RECAL
  // can badge them "wall 1" / "wall 2".
  function nearestPlanCorner(px, py) {
    let best = null, bestD = Infinity;
    for (const r of project.rectangles) {
      const b = r.bounds;
      const corners = [
        { cx: b.x0, cy: b.y0, a: { x: b.x1, y: b.y0 }, b: { x: b.x0, y: b.y1 } },
        { cx: b.x1, cy: b.y0, a: { x: b.x0, y: b.y0 }, b: { x: b.x1, y: b.y1 } },
        { cx: b.x1, cy: b.y1, a: { x: b.x0, y: b.y1 }, b: { x: b.x1, y: b.y0 } },
        { cx: b.x0, cy: b.y1, a: { x: b.x1, y: b.y1 }, b: { x: b.x0, y: b.y0 } },
      ];
      for (const c of corners) {
        const d = Math.hypot(px - c.cx, py - c.cy);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    return best;
  }

  // Re-zero the whole plan against a KNOWN plan corner to correct drift. Given the
  // corner's real-world position (Wc) and a world direction along one of its real
  // edges (wdx,wdz), solve the rigid floor transform (planYaw + planPos) so both
  // the corner and the edge direction land on the touches. All rectangles, stored
  // in plan space, follow rigidly, so rotational AND positional drift are fixed.
  // Same Ry(yaw)·(x,0,-y)+planPos convention as applyPlanMatrix/REGISTER, so it's
  // self-consistent regardless of the (untested) global world->plan handedness.
  function recalibrate(corner, Wc, wdx, wdz) {
    const wlen = Math.hypot(wdx, wdz);
    const wx = wdx / wlen, wz = wdz / wlen;
    // Pick the plan axis whose CURRENT world direction best matches the touch, so
    // recal makes the small intended rotation (not a 90° flip to another edge).
    const c0 = Math.cos(planYaw), s0 = Math.sin(planYaw);
    let Pdx = 1, Pdy = 0, best = -Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ex = dx * c0 - dy * s0;   // Ry(yaw)·(dx,0,-dy), horizontal x
      const ez = -dx * s0 - dy * c0;  // ... horizontal z
      const dot = ex * wx + ez * wz;
      if (dot > best) { best = dot; Pdx = dx; Pdy = dy; }
    }
    // yaw so plan dir (Pdx,Pdy) maps to world (wx,wz).
    const yaw1 = Math.atan2(-wz, wx) - Math.atan2(Pdy, Pdx);
    planYaw = yaw1;
    // planPos so the plan corner maps to the touched world corner.
    const c1 = Math.cos(yaw1), s1 = Math.sin(yaw1);
    const rx = corner.cx * c1 - corner.cy * s1;   // Ry(yaw1)·(cx,0,-cy), horizontal
    const rz = -corner.cx * s1 - corner.cy * c1;
    placeAt(Wc.x - rx, floorY, Wc.z - rz); // sets planPos, keeps the new yaw, re-anchors at origin
  }

  // Show a RECAL wall badge 35% of the way along the wall from the corner (cx,cy)
  // toward its far endpoint `end` — near enough the corner to read as "this wall".
  const _wb = new THREE.Vector3();
  function placeWallBadge(badge, cx, cy, end) {
    const t = 0.35;
    planToWorld(cx + t * (end.x - cx), cy + t * (end.y - cy), _wb);
    badge.sprite.position.set(_wb.x, overlayY() + 0.05, _wb.z);
    badge.sprite.visible = true;
  }

  // --- SIZE (S2 numpad) helpers: the desktop dimension tool in AR ---

  const isXEdge = (e) => e === 'left' || e === 'right';
  let bufferPristine = false; // buffer holds a prefilled value; first key replaces it

  // A reference is a rect EDGE or the plan ORIGIN axis.
  const refLabel = (ref) => (!ref ? '?' : ref.kind === 'origin' ? 'ORIGIN' : ref.edge.toUpperCase());
  const refsEqual = (a, b) =>
    !!a && !!b && a.kind === b.kind &&
    (a.kind === 'origin' || (a.rectId === b.rectId && a.edge === b.edge));

  // Two refs can be dimensioned if they lie on the same coordinate axis (and are
  // not the same target). An edge pairs with the origin on its own axis.
  function refsCompatible(a, b) {
    if (a.kind === 'origin' && b.kind === 'origin') return false;
    if (a.kind === 'edge' && b.kind === 'edge') {
      if (refsEqual(a, b)) return false;
      return isXEdge(a.edge) === isXEdge(b.edge);
    }
    return true; // edge + origin
  }

  const rectOf = (ref) => project.rectangles.find((r) => r.id === ref.rectId);

  // Current plan coordinate of a reference (origin axis = 0, else the edge coord).
  const refCoord = (ref) => (ref.kind === 'origin' ? 0 : edgeCoord(rectOf(ref), ref.edge));
  // The distance a pair currently spans, in the display unit — used to prefill the
  // numpad with the value you're already at, so entering size edits from the real
  // measurement rather than from a blank field.
  const currentSpan = (a, b) => Math.abs(refCoord(b) - refCoord(a));

  // Find an existing distance constraint between two references (either order).
  function findConstraintForRefs(a, b) {
    const origin = a.kind === 'origin' ? a : (b.kind === 'origin' ? b : null);
    if (origin) {
      const e = origin === a ? b : a;
      return project.constraints.find((k) =>
        k.type === 'distance' && k.a.rect === ORIGIN_ID &&
        k.b.rect === e.rectId && k.b.edge === e.edge) || null;
    }
    return project.constraints.find((k) =>
      k.type === 'distance' && k.a.rect !== ORIGIN_ID && k.b.rect !== ORIGIN_ID &&
      ((k.a.rect === a.rectId && k.a.edge === a.edge && k.b.rect === b.rectId && k.b.edge === b.edge) ||
       (k.a.rect === b.rectId && k.a.edge === b.edge && k.b.rect === a.rectId && k.b.edge === a.edge))) || null;
  }

  // Create the constraint for a pair (a is the anchor/first pick, like desktop).
  function makeConstraintForRefs(a, b) {
    const origin = a.kind === 'origin' ? a : (b.kind === 'origin' ? b : null);
    let c;
    if (origin) {
      const e = origin === a ? b : a;
      c = makeOriginDistance(rectOf(e), e.edge); // origin<->edge = position lock
    } else {
      c = makeDistance(rectOf(a), a.edge, rectOf(b), b.edge); // edge<->edge = size
    }
    project.addConstraint(c);
    return c;
  }

  function resetDim() {
    dimRefA = dimRefB = null;
    editingId = null;
    sizeBuffer = '';
    bufferPristine = false;
    dimConflict = false;
    numpad.group.visible = false; // back to ref-pick: the pad has no role until a pair is chosen
    numpadCursor.visible = false;
  }

  function dimTitle() {
    if (!dimRefA) return 'pick edge / origin';
    if (!dimRefB) return refLabel(dimRefA) + '  <->  ?';
    return refLabel(dimRefA) + '  <->  ' + refLabel(dimRefB) + (editingId ? '  (edit)' : '');
  }

  const redrawNumpad = () => numpad.draw(dimTitle() + (dimConflict ? '  !CONFLICT' : ''), sizeBuffer, hoverKey);

  const conflictCount = () => project.constraints.reduce((n, k) => n + (k.conflict ? 1 : 0), 0);

  function commitEntry() {
    if (!dimRefA || !dimRefB) return;
    const val = parseFloat(sizeBuffer);
    // 0 m is valid: an edge<->origin lock puts the edge on the origin axis, and an
    // edge<->edge 0 makes two zones adjacent (shared wall). Only reject negatives/NaN.
    if (!Number.isFinite(val) || val < 0) return; // wait for valid input
    const meters = toMeters(val); // interpret in the current display unit
    const existing = editingId ? project.constraints.find((k) => k.id === editingId) : findConstraintForRefs(dimRefA, dimRefB);
    const prevValue = existing ? existing.value : null;
    const c = existing ?? makeConstraintForRefs(dimRefA, dimRefB);
    const before = conflictCount();
    project.setConstraintMagnitude(c.id, meters); // preserves side (sign); re-solves + notifies
    if (conflictCount() > before) {
      // This size can't hold alongside the existing constraints. Refuse it: undo so
      // the model stays consistent, and keep the pair on-screen for a retry.
      if (existing) project.setConstraintMagnitude(c.id, Math.abs(prevValue)); // restore old value
      else project.removeConstraint(c.id);                                     // drop the just-made one
      dimConflict = true;
      redrawNumpad();
      rlog('dim refused (conflict)', { a: refLabel(dimRefA), b: refLabel(dimRefB), meters: +meters.toFixed(3) });
      return;
    }
    rlog('dim set', { a: refLabel(dimRefA), b: refLabel(dimRefB), meters: +meters.toFixed(3) });
    resetDim();
    buildPlan();       // solver changed geometry; refresh the MR view
    applyPlanMatrix();
    redrawNumpad();
  }

  // 🗑 DEL: remove the constraint for the current pair (existing or just-loaded), then
  // clear the pad. No-op if the pair has no constraint yet.
  function deleteDim() {
    if (!dimRefA || !dimRefB) return;
    const c = editingId ? project.constraints.find((k) => k.id === editingId)
                        : findConstraintForRefs(dimRefA, dimRefB);
    if (!c) { rlog('dim delete: no constraint'); return; }
    project.removeConstraint(c.id);
    rlog('dim delete', { id: c.id });
    resetDim();
    buildPlan();
    applyPlanMatrix();
    redrawNumpad();
  }

  // Live update for an active grip-drag, from the reticle's floor point (px,py):
  // in SIZE, slide the dim's perpendicular offset (akin to the desktop dim drag); in
  // EDGE, move the grabbed edge to the touch coordinate. Rebuilt each frame while held.
  function applyGripDrag(px, py) {
    if (!gripDrag) return;
    if (gripDrag.kind === 'dim') {
      const c = project.constraints.find((k) => k.id === gripDrag.cId);
      if (!c) return;
      const aOrigin = c.a.rect === ORIGIN_ID, bOrigin = c.b.rect === ORIGIN_ID;
      if (aOrigin || bOrigin) {
        c.offset = isXEdge(aOrigin ? c.b.edge : c.a.edge) ? py : px; // origin dim: absolute perpendicular coord
      } else {
        const la = edgeLine(c.a), lb = edgeLine(c.b);
        if (!la || !lb) return;
        c.offset = c.axis === 'x' ? py - Math.max(la.p1.y, lb.p1.y) : px - Math.max(la.p1.x, lb.p1.x);
      }
      buildPlan(); applyPlanMatrix(); // presentational; no re-solve needed
    } else if (gripDrag.kind === 'edge') {
      const rect = project.rectangles.find((r) => r.id === gripDrag.rectId);
      if (!rect) return;
      setEdge(rect, gripDrag.edge, px, py);
      project.touch(); // edge moved in place -> re-solve + rebuild
      buildPlan(); applyPlanMatrix();
    }
  }

  function pressKey(k) {
    if (k === 'enter') { commitEntry(); return; }
    if (k === 'swap') { swapDim(); return; } // ⇄ FLIP: move the edge to the other side
    if (k === 'del') { deleteDim(); return; } // 🗑 DEL: remove this constraint
    dimConflict = false; // any edit clears the refusal warning
    if (bufferPristine && k !== 'back') sizeBuffer = ''; // typing over a prefilled edit value
    bufferPristine = false;
    if (k === 'back') sizeBuffer = sizeBuffer.slice(0, -1);
    else if (k === '.') { if (!sizeBuffer.includes('.')) sizeBuffer += '.'; }
    else if (sizeBuffer.replace('.', '').length < 6) sizeBuffer += k; // cap digit count
    redrawNumpad();
  }

  // Load an existing constraint straight into the numpad for editing — used when you
  // select its value panel instead of re-picking both edges. Jumps to the numpad phase.
  function loadConstraint(id) {
    const c = project.constraints.find((k) => k.id === id);
    if (!c) return;
    const toRef = (ep) => ep.rect === ORIGIN_ID ? { kind: 'origin' } : { kind: 'edge', rectId: ep.rect, edge: ep.edge };
    dimRefA = toRef(c.a);
    dimRefB = toRef(c.b);
    editingId = c.id;
    sizeBuffer = fmt(Math.abs(c.value)); // open on the current value; first key replaces it
    bufferPristine = true;
    dimConflict = false;
    rlog('dim load', { id, a: refLabel(dimRefA), b: refLabel(dimRefB) });
    showNumpad();
  }

  // SIZE trigger: while both refs aren't chosen, select the dim value panel under the
  // ray (edit that constraint) or pick a rect edge / the origin (two picks, like
  // clicking two edges on desktop). Once both are chosen, the ray drives the numpad.
  function onNumpadTouch() {
    if (!placed || !activeRect) return;
    if (dimRefA && dimRefB) { if (hoverKey) pressKey(hoverKey); return; }
    if (hoverDim) { loadConstraint(hoverDim.userData.cId); return; } // select a constraint by its panel
    if (!hoverRef) return;
    if (!dimRefA) { dimRefA = hoverRef; rlog('dim A', { ref: refLabel(hoverRef) }); redrawNumpad(); return; }
    if (refsEqual(hoverRef, dimRefA) || !refsCompatible(dimRefA, hoverRef)) return;
    dimRefB = hoverRef;
    const existing = findConstraintForRefs(dimRefA, dimRefB);
    editingId = existing ? existing.id : null;
    // Prefill with the constrained value if one exists, else the current measured
    // span. Either way the field opens on the real value; the first keypress replaces it.
    sizeBuffer = fmt(existing ? Math.abs(existing.value) : currentSpan(dimRefA, dimRefB));
    bufferPristine = true;
    rlog('dim B', { ref: refLabel(hoverRef), editing: !!existing });
    showNumpad(); // pair complete -> enter the numpad/edit phase
  }

  // Park a ray-aimed panel ~0.55 m in front of the headset, upright, facing the
  // user (yaw-only). Shared by the SIZE numpad and the SAVE/LOAD slot menu.
  function placePanel(group) {
    const e = renderer.xr.getCamera().matrixWorld.elements;
    _cam.set(e[12], e[13], e[14]);
    _camQ.setFromRotationMatrix(_rm.fromArray(e));
    _fwd.set(0, 0, -1).applyQuaternion(_camQ); _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    group.position.copy(_cam).addScaledVector(_fwd, 0.55);
    group.position.y = _cam.y - 0.12; // a touch below eye level
    group.lookAt(_cam.x, group.position.y, _cam.z); // yaw-only face
    group.updateMatrixWorld(true); // so the same-frame raycast sees the new pose
  }

  // Enter SIZE in the ref-pick phase; the pad itself appears only once a pair/constraint
  // is chosen (see showNumpad), since it has no role while you're still picking refs.
  function activateNumpad() {
    resetDim();
  }

  // Park the pad in front of the user and show it — called when a pair is completed or
  // an existing constraint is selected (i.e. entering the numpad/edit phase).
  function showNumpad() {
    placePanel(numpad.group);
    numpad.group.visible = true;
    redrawNumpad();
  }

  function deactivateNumpad() {
    numpad.group.visible = false;
    numpadCursor.visible = false;
    edgeHi2.visible = false;
    originRingMat.color.setHex(C_ORIGIN_GIZMO);
    hoverKey = prevHoverKey = null;
    hoverRef = null;
  }

  // ---- SAVE / LOAD: persist the whole project to localStorage slots ----
  // The slot unit is the entire multi-floor project (what serializeProject emits),
  // since deserializeInto replaces everything — saving one floor would be a trap.
  const slotKey = (i) => `house-cad:slot:${i}`;

  // Parsed slot payload {savedAt, data} | null (bad/absent/foreign JSON -> null).
  function readSlot(i) {
    try {
      const raw = localStorage.getItem(slotKey(i));
      if (!raw) return null;
      const o = JSON.parse(raw);
      return o && o.data && Array.isArray(o.data.floors) ? o : null;
    } catch { return null; }
  }

  // Slot summary for the menu cell: rectangle count (all floors) + a short local
  // date/time. null for an empty slot.
  function slotMeta(i) {
    const o = readSlot(i);
    if (!o) return null;
    const rects = o.data.floors.reduce((n, f) => n + (f.rectangles?.length || 0), 0);
    const d = new Date(o.savedAt);
    const when = Number.isFinite(d.getTime())
      ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '?';
    return { rects, when };
  }

  const slotTitle = () => slotFlash || (modes[currentMode].id === 'save' ? 'SAVE — pick slot' : 'LOAD — pick slot');
  const slotAccent = () => (modes[currentMode].id === 'save' ? '#51d88a' : '#4ea1ff');
  const redrawSlotMenu = () => slotMenu.draw(slotTitle(), slotAccent(), hoverSlot, slotMeta);

  function showSlotMenu() {
    placePanel(slotMenu.group);
    slotFlash = null;
    hoverSlot = prevHoverSlot = null;
    slotMenu.group.visible = true;
    redrawSlotMenu();
  }

  function deactivateSlotMenu() {
    slotMenu.group.visible = false;
    numpadCursor.visible = false;
    hoverSlot = prevHoverSlot = null;
    slotFlash = null;
  }

  // Trigger in SAVE/LOAD: act on the slot under the ray. SAVE writes/overwrites the
  // slot; LOAD replaces the whole project from a filled slot (empty = no-op) and
  // rebuilds the MR view (the registered frame/anchor is untouched — the loaded plan
  // drops into wherever you already registered).
  function onSlotTouch() {
    if (hoverSlot == null) return;
    const i = hoverSlot;
    if (modes[currentMode].id === 'save') {
      try {
        localStorage.setItem(slotKey(i), JSON.stringify({ savedAt: Date.now(), data: serializeProject(project) }));
        slotFlash = `SAVED → ${i + 1}`;
        rlog('slot save', { slot: i });
      } catch (e) {
        slotFlash = 'SAVE FAILED';
        rlog('slot save FAIL', String(e));
      }
    } else {
      const o = readSlot(i);
      if (!o) { slotFlash = `SLOT ${i + 1} empty`; redrawSlotMenu(); return; }
      try {
        deserializeInto(project, o.data); // emits a change (re-solves every floor)
        refreshFloorEditState();          // re-seed EDGE target + undo stack from the loaded active floor
        buildPlan();                      // mr.js rebuilds manually (no onChange subscription)
        applyPlanMatrix();
        slotFlash = `LOADED ${i + 1}`;
        rlog('slot load', { slot: i });
      } catch (e) {
        slotFlash = 'LOAD FAILED';
        rlog('slot load FAIL', String(e));
      }
    }
    redrawSlotMenu();
  }

  // Draw the edge-highlight strip along `edge` of `rect`, in the given color —
  // same thickened-quad style as the resting edges, a touch bolder and on top.
  const _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3();
  const _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();
  function showEdge(rect, edge, colorHex, mesh = edgeHi) {
    const [[ax, ay], [bx, by]] = edgeEndpoints(rect, edge);
    const c = stripCorners(ax, ay, bx, by, EDGE_HI_HALF); // bolder than the resting edges
    planToWorld(c[0][0], c[0][1], _c0);
    planToWorld(c[1][0], c[1][1], _c1);
    planToWorld(c[2][0], c[2][1], _c2);
    planToWorld(c[3][0], c[3][1], _c3);
    const a = mesh.geometry.attributes.position.array;
    const w = (i, v) => { a[i] = v.x; a[i + 1] = v.y + 0.014; a[i + 2] = v.z; };
    w(0, _c0); w(3, _c1); w(6, _c2);   // triangle 1: c0,c1,c2
    w(9, _c0); w(12, _c2); w(15, _c3); // triangle 2: c0,c2,c3
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.material.color.setHex(colorHex);
    mesh.visible = true;
  }

  // Outline a whole rectangle (all four edges) into rectHi, in the given color —
  // EDIT mode's "this is the zone under your ray" highlight.
  function showRectOutline(rect, colorHex) {
    const b = rect.bounds;
    const edges = [
      [b.x0, b.y0, b.x1, b.y0], [b.x1, b.y0, b.x1, b.y1], // bottom, right
      [b.x1, b.y1, b.x0, b.y1], [b.x0, b.y1, b.x0, b.y0], // top, left
    ];
    const a = rectHi.geometry.attributes.position.array;
    let o = 0;
    const put = (v) => { a[o++] = v.x; a[o++] = v.y + 0.014; a[o++] = v.z; };
    for (const [ax, ay, bx, by] of edges) {
      const c = stripCorners(ax, ay, bx, by, EDGE_HI_HALF);
      planToWorld(c[0][0], c[0][1], _c0); planToWorld(c[1][0], c[1][1], _c1);
      planToWorld(c[2][0], c[2][1], _c2); planToWorld(c[3][0], c[3][1], _c3);
      put(_c0); put(_c1); put(_c2);
      put(_c0); put(_c2); put(_c3);
    }
    rectHi.geometry.attributes.position.needsUpdate = true;
    rectHi.material.color.setHex(colorHex);
    rectHi.visible = true;
  }

  // Lay the zebra stripe fill over a whole rectangle: flat on its floor, yaw-aligned
  // with the plan, sized to the zone, with the texture repeat set so stripe width is
  // constant in the real world regardless of zone size.
  function showZebra(rect) {
    const b = rect.bounds;
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (w <= 0 || h <= 0) { zebra.visible = false; return; }
    planToWorld((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, _zp);
    zebra.position.set(_zp.x, overlayY() + 0.012, _zp.z); // above the fill + outline base
    zebra.quaternion.copy(planGroup.quaternion);          // plan yaw (stays flat)
    zebra.scale.set(w, 1, h);
    zebra.material.map.repeat.set(w / ZEBRA_PERIOD, h / ZEBRA_PERIOD);
    zebra.material.color.setHex(rect.op === 'subtract' ? ZEBRA_SUB : ZEBRA_ADD); // blue add / red wall
    zebra.visible = true;
  }

  // World point where a controller's pointing ray meets the floor plane, or null.
  const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
  const _rhit = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4();
  function rayFloorHit(inputSource) {
    const space = inputSource?.targetRaySpace;
    if (!space || !currentFrame) return null;
    const pose = currentFrame.getPose(space, localSpace);
    if (!pose) return null;
    _rm.fromArray(pose.transform.matrix);
    _ro.setFromMatrixPosition(_rm);
    _rq.setFromRotationMatrix(_rm);
    _rd.set(0, 0, -1).applyQuaternion(_rq); // pointing ray = controller -Z
    if (Math.abs(_rd.y) < 1e-4) return null; // parallel to the floor
    const t = (overlayY() - _ro.y) / _rd.y;
    if (t <= 0) return null; // floor is behind the controller
    return _rhit.copy(_ro).addScaledVector(_rd, t);
  }

  // The dim value panel the RETICLE is over: the sprite whose plan position is nearest
  // the floor point (px,py), within the reticle radius. Reticle-gated like edgeAtPoint,
  // so a panel is "hovered" only when the ring is actually on it. Returns the sprite | null.
  function dimLabelAtPoint(px, py) {
    let best = null, bestD = RETICLE_OUTER;
    for (const s of dimSprites) {
      const d = Math.hypot(px - s.position.x, py - (-s.position.z)); // local (x,0,-y) -> plan (x,y)
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  // The dimension value whose label the controller's ray is aimed at, or null.
  // Angular pick (nearest label within a small cone) so it works at any distance
  // even when the in-world text is too small to hit precisely — that's the point.
  const _dp = new THREE.Vector3(), _dv = new THREE.Vector3();
  const DIM_HOVER_COS = Math.cos(5 * Math.PI / 180); // ~5° cone
  function pickDimLabel(inputSource) {
    if (!dimSprites.length) return null;
    const space = inputSource?.targetRaySpace;
    if (!space || !currentFrame) return null;
    const pose = currentFrame.getPose(space, localSpace);
    if (!pose) return null;
    _rm.fromArray(pose.transform.matrix);
    _ro.setFromMatrixPosition(_rm);
    _rq.setFromRotationMatrix(_rm);
    _rd.set(0, 0, -1).applyQuaternion(_rq).normalize(); // pointing ray
    let best = null, bestCos = DIM_HOVER_COS;
    for (const s of dimSprites) {
      s.getWorldPosition(_dp);
      _dv.copy(_dp).sub(_ro);
      if (_dv.dot(_rd) <= 0) continue; // behind the controller
      const cos = _dv.normalize().dot(_rd);
      if (cos > bestCos) { bestCos = cos; best = s; }
    }
    return best; // the hovered dim sprite (userData: dimText, cId, refA, refB) or null
  }

  // Intersection of a controller's pointing ray with a canvas panel (with .uv), or
  // null. Used by SIZE (numpad) and SAVE/LOAD (slot menu) to pick the cell under the ray.
  const _raycaster = new THREE.Raycaster();
  function rayPanelHit(inputSource, mesh = numpad.mesh) {
    const space = inputSource?.targetRaySpace;
    if (!space || !currentFrame) return null;
    const pose = currentFrame.getPose(space, localSpace);
    if (!pose) return null;
    _rm.fromArray(pose.transform.matrix);
    _ro.setFromMatrixPosition(_rm);
    _rq.setFromRotationMatrix(_rm);
    _rd.set(0, 0, -1).applyQuaternion(_rq);
    _raycaster.set(_ro, _rd);
    const hits = _raycaster.intersectObject(mesh, false);
    return hits.length ? hits[0] : null;
  }

  const C_ORIGIN = 0x4ea1ff, C_ALIGN = 0xffb454; // REGISTER step 1 / step 2 colors
  const C_RECAL = 0x22d3ee, C_RECAL_DIR = 0xa78bfa; // RECAL step 1 (corner) / step 2 (direction) colors

  // Drop a throwaway starter rectangle (ROOM = add / WALL = subtract) at the user's
  // standing position — no floor touch needed, since the box is throwaway and its
  // edges get pushed to the real walls in EDGE mode. It becomes the active rect.
  function dropRect(op) {
    if (!placed) return; // need a registered frame (ORIGIN) to define plan space
    const e = renderer.xr.getCamera().matrixWorld.elements; // headset world pos
    _drop.set(e[12], floorY, e[14]);
    const { px, py } = worldToPlan(_drop);
    const half = 0.75; // 1.5 m starter box — size is throwaway, edges get pushed
    const rect = new Rectangle({ x: px - half, y: py - half, w: 2 * half, h: 2 * half, op });
    project.addRectangle(rect);
    surveyed.push(rect.id);
    activeRect = rect;
    selectedEdge = null;
    buildPlan();       // re-read footprint (now includes the new rect); keeps transform
    applyPlanMatrix(); // buildPlan swaps geometry only; reassert position/yaw
    rlog('drop rect', { id: rect.id, op, px: +px.toFixed(3), py: +py.toFixed(3) });
  }

  // EDIT mode: flip the selected zone room<->wall (add<->subtract). Bound to the
  // upper face button (B/Y) while in EDIT — see pollModeCycle.
  function swapSelected() {
    if (!selectedRect) return;
    selectedRect.op = selectedRect.op === 'subtract' ? 'add' : 'subtract';
    project.touch();
    buildPlan();
    applyPlanMatrix();
    rlog('edit swap', { id: selectedRect.id, op: selectedRect.op });
  }

  // SIZE mode: flip which SIDE ref B sits on relative to ref A — negates the signed
  // distance (magnitude kept). Works for edge<->edge (the edge jumps to A's other
  // side) AND edge<->origin (the edge jumps to the other side of the origin axis; the
  // origin datum itself never moves). Bound to B/Y in SIZE. To flip an existing
  // dimension, re-pick its two refs (re-selects the constraint) then press B/Y. No-op
  // before a distance exists. A flip that would over-constrain is refused.
  function swapDim() {
    if (!dimRefA || !dimRefB) return;
    let c = editingId ? project.constraints.find((k) => k.id === editingId)
                      : findConstraintForRefs(dimRefA, dimRefB);
    if (!c) {
      // No constraint yet: create one at the current buffer value so FLIP has something
      // to act on (same as committing then flipping, without leaving the pad).
      const val = parseFloat(sizeBuffer);
      if (!Number.isFinite(val) || val < 0) { rlog('dim flip: enter a distance first'); return; }
      c = makeConstraintForRefs(dimRefA, dimRefB);
      project.setConstraintMagnitude(c.id, toMeters(val));
      editingId = c.id;
    }
    const before = conflictCount();
    project.flipConstraintSide(c.id); // move ref B to the other side of ref A
    if (conflictCount() > before) {
      project.flipConstraintSide(c.id); // undo — the flip can't hold
      dimConflict = true; redrawNumpad();
      rlog('dim flip refused (conflict)', { id: c.id });
      return;
    }
    buildPlan(); applyPlanMatrix();
    redrawNumpad();
    rlog('dim flip', { id: c.id, value: +c.value.toFixed(3) });
  }

  // Modes share the touch gesture (trigger). A/B (or thumbstick left/right) cycle
  // between them; the tip/reticle/label recolor so the active mode is always
  // visible. FLOOR + REGISTER set up the frame; ROOM/WALL drop zones and EDGE snaps
  // their edges to the real walls.
  const modes = [
    {
      id: 'floor', label: 'FLOOR', color: 0x51d88a,
      // Calibrate the GROUND base level (the datum every storey's overlay lifts
      // off). A touch on an upper floor is at that floor's height, which would
      // double-count against its elevation — so only re-level on the ground floor.
      onTouch: (pos) => {
        if (placed && project.activeFloorId !== project.groundFloorId) {
          rlog('floor: switch to ground floor to re-level'); return;
        }
        floorY = pos.y;
        if (placed) placeAt(planPos.x, floorY, planPos.z);
      },
    },
    {
      // REGISTER: a 3-point gesture that DERIVES the origin corner, so the corner
      // itself never has to be reachable (it's often blocked by furniture/walls).
      // Touch two points P1,P2 along one real wall (this sets +X down that wall),
      // then a third point P3 on the perpendicular wall. The origin is the corner
      // where the two walls meet = P3 projected onto the P1->P2 wall line. The tip
      // label steps WALL 1 -> WALL 2 -> PERP so the current step is always visible.
      id: 'register', label: 'ORIGIN', color: C_ORIGIN,
      onTouch: (pos) => {
        registerPts.push({ x: pos.x, z: pos.z });
        const n = registerPts.length;
        if (n === 1) { applyModeVisual('WALL 2', C_ALIGN); rlog('register p1', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) }); return; }
        if (n === 2) {
          const [p1, p2] = registerPts;
          if (Math.hypot(p2.x - p1.x, p2.z - p1.z) < 0.05) { registerPts.pop(); return; } // too close to define the wall
          applyModeVisual('PERP', C_ALIGN); rlog('register p2', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) }); return;
        }
        // 3rd touch: derive the corner (projection of P3 onto the P1->P2 wall line) + yaw.
        const [p1, p2, p3] = registerPts;
        registerPts = [];
        const dx = p2.x - p1.x, dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz);
        const ux = dx / len, uz = dz / len;                         // unit wall direction
        const proj = (p3.x - p1.x) * ux + (p3.z - p1.z) * uz;       // P3 -> nearest point on the wall line
        const cx = p1.x + proj * ux, cz = p1.z + proj * uz;         // the (possibly unreachable) corner
        planYaw = Math.atan2(-dz, dx);                              // orient +X along the P1->P2 wall
        placeAt(cx, floorY, cz);                                    // origin at the derived corner; applies yaw + re-anchors
        applyModeVisual('ORIGIN', C_ORIGIN);                        // ready to re-register next time
        rlog('register corner', { cx: +cx.toFixed(3), cz: +cz.toFixed(3), yaw: +planYaw.toFixed(3) });
      },
    },
    {
      id: 'drop', label: 'ROOM', color: 0x2dd4bf,
      // Drop a ROOMSPACE (add) rectangle at your standing position. It becomes the
      // active rectangle; push its edges to the walls in EDGE.
      onTouch: () => dropRect('add'),
    },
    {
      id: 'wall', label: 'WALL', color: 0xff6b6b,
      // Drop a WALL (subtract) rectangle — solid, no roomspace — the same way. It
      // carves a hole in the footprint fill; push its edges to the real wall faces
      // in EDGE. add = roomspace, subtract = wall.
      onTouch: () => dropRect('subtract'),
    },
    {
      id: 'edge', label: 'EDGE', color: 0xff5db1,
      // Two presses per wall: 1st (aiming at an edge of ANY zone) LOCKS that edge;
      // 2nd (tip touching the real wall) snaps the locked edge to the wall. The ray
      // picks the edge across all zones; the touch supplies only the perpendicular
      // coordinate.
      onTouch: (pos) => {
        if (!placed) return;
        if (!selectedEdge) {
          if (hoverEdge) { selectedEdge = hoverEdge; rlog('edge locked', { edge: hoverEdge.edge, rect: hoverEdge.rectId }); }
          return;
        }
        const rect = project.rectangles.find((r) => r.id === selectedEdge.rectId);
        if (rect) {
          const { px, py } = worldToPlan(pos);
          setEdge(rect, selectedEdge.edge, px, py);
          rlog('edge set', { edge: selectedEdge.edge, px: +px.toFixed(3), py: +py.toFixed(3) });
        }
        selectedEdge = null;
        project.touch();   // rectangle mutated in place -> re-solve + notify
        buildPlan();
        applyPlanMatrix();
      },
    },
    {
      id: 'edit', label: 'EDIT', color: 0xa78bfa,
      // Select a zone to edit. TRIGGER picks the zone under your ray; pressing again
      // cycles DOWN through overlapping zones (wraps), so any buried zone is
      // reachable. The selection persists + is zebra-highlighted. Then GRIP deletes
      // it (see onReset), or the upper face button B/Y swaps it room<->wall (see
      // swapSelected / pollModeCycle).
      onTouch: () => {
        if (!placed || !hoverStack.length) return;
        const i = selectedRect ? hoverStack.indexOf(selectedRect) : -1;
        selectedRect = i >= 0 ? hoverStack[(i + 1) % hoverStack.length] : hoverStack[0];
        rlog('edit select', { id: selectedRect.id, op: selectedRect.op, stack: hoverStack.length });
      },
    },
    {
      id: 'recal', label: 'RECAL', color: C_RECAL,
      // Correct drift: re-zero the plan against a KNOWN corner, REGISTER-style so the
      // corner apex needn't be reachable. The nearest surveyed corner is highlighted
      // with its two walls badged 1 & 2. Touch P1,P2 along real wall 1 (sets the true
      // orientation), then P3 on real wall 2; the real corner = P3 projected onto the
      // wall-1 line. recalibrate() then re-solves yaw + position so the highlighted
      // plan corner lands on it — both rotational and positional drift are corrected.
      onTouch: (pos) => {
        if (!placed) return;
        const n = recalPts.length;
        if (n === 0) {
          const { px, py } = worldToPlan(pos);
          const corner = nearestPlanCorner(px, py);
          if (!corner) return; // no surveyed corners to reference yet
          recalCorner = corner;            // lock the corner this first touch is nearest to
          recalPts.push({ x: pos.x, z: pos.z }); // P1 along wall 1
          applyModeVisual('WALL 1 · P2', C_RECAL);
          rlog('recal p1', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) });
          return;
        }
        if (n === 1) {
          const p1 = recalPts[0];
          if (Math.hypot(pos.x - p1.x, pos.z - p1.z) < 0.05) return; // too close to define wall 1
          recalPts.push({ x: pos.x, z: pos.z }); // P2 along wall 1
          applyModeVisual('WALL 2', C_RECAL_DIR);
          rlog('recal p2', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) });
          return;
        }
        // 3rd touch: P3 on wall 2 -> derive the real corner + wall-1 direction.
        const [p1, p2] = recalPts;
        recalPts = [];
        const dx = p2.x - p1.x, dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz);
        const ux = dx / len, uz = dz / len;                   // unit wall-1 direction
        const proj = (pos.x - p1.x) * ux + (pos.z - p1.z) * uz; // P3 -> foot on the wall-1 line
        const Wc = { x: p1.x + proj * ux, z: p1.z + proj * uz }; // = the real corner (walls ⊥)
        recalibrate(recalCorner, Wc, dx, dz);
        recalCorner = null;
        buildPlan();       // geometry unchanged, but reassert against the new transform
        applyModeVisual('RECAL', C_RECAL); // ready to re-recal next time
        rlog('recal done', { yaw: +planYaw.toFixed(3) });
      },
    },
    {
      id: 'size', label: 'SIZE', color: 0xfbbf24,
      // The desktop dimension tool in AR: pick two references — each a rect EDGE
      // or the plan ORIGIN axis — then type the exact distance on the numpad.
      // edge<->edge = a size (width/height); edge<->origin = a position lock. If a
      // constraint already exists between the pair, its value is prefilled to edit.
      // Written as a hard constraint (exact size = dimension constraints).
      onTouch: onNumpadTouch,
    },
    {
      id: 'save', label: 'SAVE', color: 0x51d88a,
      // Aim the ray at a slot on the menu and trigger to write the whole project
      // there (overwrites a filled slot). Slots show their save time + rect count.
      onTouch: onSlotTouch,
    },
    {
      id: 'load', label: 'LOAD', color: 0x4ea1ff,
      // Aim at a filled slot and trigger to replace the project with it; the loaded
      // plan drops into the frame you already registered. Empty slots are a no-op.
      onTouch: onSlotTouch,
    },
  ];
  let currentMode = 0;

  // Recolor the tip + reticle and set the floating label — used both by setMode
  // and by REGISTER to flip ORIGIN<->ALIGN mid-gesture.
  function applyModeVisual(label, color) {
    tipMat.color.setHex(color);
    reticle.material.color.setHex(color);
    for (const l of labels) l.setText(label, color);
  }

  function setMode(i) {
    currentMode = (i + modes.length) % modes.length;
    registerPts = []; // leaving/entering a mode resets the REGISTER 3-point gesture
    recalPts = []; recalCorner = null; // ... and the RECAL 3-point gesture
    selectedRect = null; // clear the EDIT selection when changing modes
    selectedEdge = null; edgeSnapPrompt = false; // drop any pending EDGE lock + its label
    rectHi.visible = false;
    zebra.visible = false;
    const m = modes[currentMode];
    applyModeVisual(m.label, m.color);
    if (m.id === 'size') activateNumpad(); // spawn/refresh the numpad in front of you
    else deactivateNumpad();
    if (m.id === 'save' || m.id === 'load') showSlotMenu(); // park the slot menu in front of you
    else deactivateSlotMenu();
  }

  // Point the survey edit-state at the active floor: EDGE edits its last rect,
  // and grip-undo pops from its own rects. Keeps `surveyed` scoped to the active
  // floor so removeRectangle (which acts on the active floor) always resolves.
  function refreshFloorEditState() {
    surveyed.length = 0;
    for (const r of project.rectangles) surveyed.push(r.id); // active floor, creation order
    activeRect = project.rectangles[project.rectangles.length - 1] || null;
    selectedEdge = null;
    selectedRect = null; // EDIT selection is per-floor; drop it on a floor switch
    resetDim();
  }

  // Switch the active storey up (+1) / down (-1) in the stack. Register-once
  // means the frame is shared; only the overlay's elevation changes. No wrap —
  // you can't step past the top or bottom floor.
  function switchFloor(delta) {
    const floors = project.floors;
    const i = floors.findIndex((f) => f.id === project.activeFloorId);
    const j = i + delta;
    if (j < 0 || j >= floors.length) return;
    project.setActiveFloor(floors[j].id);
    refreshFloorEditState();
    buildPlan();
    applyPlanMatrix(); // overlay lifts to the new floor's elevation
    const f = project.activeFloor;
    rlog('floor switch', { name: f.name, elev: +f.elevation.toFixed(3) });
  }

  function placeAt(x, y, z) {
    planPos.set(x, y, z);
    planGroup.visible = true; // may have no zones yet — the origin gizmo is the placeholder
    originGizmo.visible = true;
    applyPlanMatrix(); // keeps the current yaw (from ALIGN)
    placed = true;
    reticle.visible = false;
    anchor = null; // drop the old anchor so the frame loop won't snap us back
    if (currentFrame?.createAnchor) {
      const xform = new XRRigidTransform({ x, y, z }, { x: 0, y: 0, z: 0, w: 1 });
      currentFrame.createAnchor(xform, localSpace)
        .then((a) => { anchor = a; rlog('anchor ok', { y: +y.toFixed(3) }); })
        .catch((e) => { anchor = null; rlog('anchor FAIL', String(e)); });
    } else {
      rlog('no createAnchor on frame');
    }
  }

  renderer.xr.addEventListener('sessionstart', async () => {
    const session = renderer.xr.getSession();

    // Stash desktop state so we can restore it on exit.
    saved.background = scene.background;
    saved.gridVisible = view.grid?.visible;
    saved.floorVisible = view.floor?.visible;
    saved.controls = view.controls.enabled;
    saved.meshVisible = view.house?.visible;

    scene.background = null; // reveal passthrough
    if (view.grid) view.grid.visible = false;
    if (view.floor) view.floor.visible = false;
    if (view.house) view.house.visible = false; // hide the extruded walls
    view.hideMesh = true; // keep them hidden even as survey edits rebuild the mesh
    view.controls.enabled = false;

    buildPlan();
    scene.add(planGroup);
    planGroup.visible = false;
    placed = false;
    anchor = null;
    planYaw = 0;
    floorY = 0;
    refreshFloorEditState(); // seed EDGE target + undo stack from the active floor
    hoverEdge = null;
    edgeHi.visible = false;
    edgeHi2.visible = false;
    cornerHi.visible = false;
    originGizmo.visible = false;
    originRingMat.color.setHex(C_ORIGIN_GIZMO);
    resetDim();
    hoverRef = null;
    hoverKey = prevHoverKey = null;
    numpad.group.visible = false;
    numpadCursor.visible = false;
    setMode(0);

    localSpace = await session.requestReferenceSpace('local-floor');
    // Force Three to RENDER with this exact space (not just the type setter, which
    // didn't take through ARButton) so render origin == our measurement origin.
    renderer.xr.setReferenceSpace(localSpace);
    view.onXRFrame = onXRFrame;
  });

  renderer.xr.addEventListener('sessionend', () => {
    view.onXRFrame = null;
    exiting = false; exitHoldStart = 0; exitProgress = 0; // reset exit gesture
    activeSource = null; // next session re-latches on first use
    anchor = null;
    reticle.visible = false;
    edgeHi.visible = false;
    edgeHi2.visible = false;
    cornerHi.visible = false;
    rectHi.visible = false;
    zebra.visible = false;
    selectedRect = null;
    originGizmo.visible = false;
    originRingMat.color.setHex(C_ORIGIN_GIZMO);
    numpad.group.visible = false;
    numpadCursor.visible = false;
    scene.remove(planGroup);

    view.hideMesh = false; // desktop shows the extruded walls again
    scene.background = saved.background ?? null;
    if (view.grid) view.grid.visible = saved.gridVisible ?? true;
    if (view.floor) view.floor.visible = saved.floorVisible ?? true;
    if (view.house) view.house.visible = saved.meshVisible ?? true;
    view.controls.enabled = saved.controls ?? true;
    view._resize(); // XR left the framebuffer at headset size
  });

  // World-space position of a controller's tip (origin + TIP_OFFSET along the
  // pointing ray), or null if not tracked this frame. Uses targetRaySpace so it
  // matches the visual tip marker, which is parented to the target-ray controller.
  const _pos = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  function tipPosition(inputSource) {
    const space = inputSource?.targetRaySpace || inputSource?.gripSpace;
    if (!space || !currentFrame) return null;
    const pose = currentFrame.getPose(space, localSpace);
    if (!pose) return null;
    _m.fromArray(pose.transform.matrix);
    return _pos.copy(TIP_OFFSET).applyMatrix4(_m);
  }

  function onSelect(event) {
    activeSource = event.data; // trigger claims control for this controller
    const pos = tipPosition(event.data);
    if (!pos) return;
    lastTouch.copy(pos); // for the debug HUD
    rlog('touch', {
      mode: modes[currentMode].label, placed,
      touchY: +pos.y.toFixed(3), floorY: +floorY.toFixed(3), planY: +planPos.y.toFixed(3),
    });
    // Run whatever the current mode does with the touched point.
    modes[currentMode].onTouch(pos);
    // Force matrixWorld so we log the ACTUAL rendered world position, not just planPos.
    planGroup.updateMatrixWorld(true);
    const wp = planGroup.getWorldPosition(new THREE.Vector3());
    rlog('after', {
      floorY: +floorY.toFixed(3), planY: +planPos.y.toFixed(3),
      worldY: +wp.y.toFixed(3), camY: +camWorldY().toFixed(3),
      visible: planGroup.visible, placed,
    });
  }

  // Grip PRESS: if the reticle is over a draggable target, start a grip-drag instead
  // of an undo — a dim value panel in SIZE (ref-pick phase), or an edge in EDGE.
  function onSqueezeStart(event) {
    if (event?.data) activeSource = event.data;
    const id = modes[currentMode].id;
    if (id === 'size' && !dimRefA && hoverDim) { gripDrag = { kind: 'dim', cId: hoverDim.userData.cId }; rlog('grip-drag dim', { id: hoverDim.userData.cId }); return; }
    if (id === 'edge' && hoverEdge) { gripDrag = { kind: 'edge', rectId: hoverEdge.rectId, edge: hoverEdge.edge }; rlog('grip-drag edge', hoverEdge); return; }
  }

  // Grip RELEASE: end any grip-drag (persist via touch); if none, onReset already ran.
  function onSqueezeEnd() {
    if (gripDrag) { project.touch(); rlog('grip-drag end', gripDrag); }
    gripDrag = null;
  }

  // Grip button: context-sensitive, but it only ever DELETES geometry in EDIT — every
  // other mode does a non-destructive cancel of an in-progress gesture (or nothing), so
  // grip can't wipe a room/dimension/registration by accident.
  //  - EDIT: delete the selected zone.
  //  - SIZE: cancel the last dimension pick, step by step.
  //  - EDGE: cancel a pending locked edge.
  //  - REGISTER / RECAL mid-gesture: back out the pending point/direction.
  function onReset(event) {
    if (event?.data) activeSource = event.data; // grip claims control too
    if (gripDrag) return; // this grip was a drag, not an undo (cleared on squeezeend)
    const mode = modes[currentMode];
    if (mode.id === 'size') { // undo the last dimension pick, step by step
      if (dimRefB || editingId) { dimRefB = null; editingId = null; sizeBuffer = ''; bufferPristine = false; redrawNumpad(); rlog('dim B cancelled'); return; }
      if (dimRefA) { dimRefA = null; redrawNumpad(); rlog('dim A cancelled'); return; }
      return;
    }
    if (mode.id === 'edit') { // grip deletes the selected zone (the ONLY grip delete)
      if (!selectedRect) return;
      const id = selectedRect.id;
      project.removeRectangle(id);
      const si = surveyed.indexOf(id);
      if (si >= 0) surveyed.splice(si, 1);
      if (activeRect && activeRect.id === id) {
        activeRect = project.rectangles[project.rectangles.length - 1] || null;
      }
      selectedRect = null;
      buildPlan();
      applyPlanMatrix();
      rlog('edit delete', { id });
      return;
    }
    if (mode.id === 'edge' && selectedEdge) { // cancel a pending locked edge (no rect removal)
      selectedEdge = null;
      rlog('edge lock cancelled');
      return;
    }
    if (mode.id === 'register' && registerPts.length) { // back out the last REGISTER point
      registerPts.pop();
      const n = registerPts.length;
      applyModeVisual(n === 0 ? 'ORIGIN' : n === 1 ? 'WALL 2' : 'PERP', n === 0 ? C_ORIGIN : C_ALIGN);
      rlog('register undo', { remaining: n });
      return;
    }
    if (mode.id === 'recal' && recalPts.length) { // back out the last RECAL touch, step by step
      recalPts.pop();
      if (recalPts.length === 0) recalCorner = null; // unlocked the corner
      const lbl = recalPts.length === 0 ? 'RECAL' : recalPts.length === 1 ? 'WALL 1 · P2' : 'WALL 2';
      applyModeVisual(lbl, recalPts.length === 2 ? C_RECAL_DIR : C_RECAL);
      rlog('recal undo', { remaining: recalPts.length });
      return;
    }
    // No destructive fallback: rooms are removed only via EDIT; re-register via REGISTER.
  }

  // Edge-detection state for the mode-cycle / floor-switch inputs.
  const btn = { next: false, prev: false, stick: false, stickY: false };
  // In-world exit: DOM "EXIT AR" isn't visible in the headset, so hold the
  // thumbstick DOWN (buttons[3]) for EXIT_HOLD_MS to end the session. A hold
  // (not a tap) so it can't collide with stick flicks or be hit by accident.
  const EXIT_HOLD_MS = 1200;
  let exitHoldStart = 0; // performance-time when the hold began (0 = not held)
  let exitProgress = 0;  // 0..1, for the HUD countdown
  let exiting = false;   // guard so session.end() fires once

  // The controller the user is currently driving with. Two controllers reading
  // the same actions fight each other (e.g. both sticks summed), so ALL input —
  // buttons, sticks, the exit hold, and every ray/tip pick — reads from ONLY
  // this one. It flips to whichever controller last showed activity.
  let activeSource = null;
  // Any button pressed or a real stick deflection counts as "using" a controller.
  function isActing(gp) {
    return gp.buttons.some((b) => b?.pressed) ||
      Math.abs(gp.axes[2] ?? 0) > 0.5 || Math.abs(gp.axes[3] ?? 0) > 0.5;
  }
  // The source to read this frame: the active one if still present, else the
  // first tracked source (so reticles preview before the user has acted).
  function pickSource(frame) {
    const list = [...frame.session.inputSources];
    if (activeSource && list.includes(activeSource)) return activeSource;
    return list.find((s) => s.gamepad) ?? list[0] ?? null;
  }

  function pollModeCycle(frame, time) {
    // xr-standard mapping: buttons[3]=thumbstick press (hold to EXIT),
    // buttons[4]=A/X (lower), buttons[5]=B/Y (upper),
    // axes[2]=thumbstick x (cycle mode), axes[3]=thumbstick y (change floor).
    // Latch onto whichever controller is being used, then read ONLY that one.
    for (const src of frame.session.inputSources) {
      if (src.gamepad && isActing(src.gamepad)) activeSource = src;
    }
    let next = false, prev = false, stickX = 0, stickY = 0, stickDown = false;
    const gp = pickSource(frame)?.gamepad;
    if (gp) {
      next = !!gp.buttons[5]?.pressed;     // upper face button -> next
      prev = !!gp.buttons[4]?.pressed;     // lower face button -> previous
      stickDown = !!gp.buttons[3]?.pressed; // thumbstick click (hold to exit)
      stickX = gp.axes[2] ?? 0;
      stickY = gp.axes[3] ?? 0;
    }
    // Hold-to-exit: accumulate hold time; end the session past the threshold.
    if (stickDown && !exiting) {
      if (!exitHoldStart) exitHoldStart = time;
      exitProgress = Math.min(1, (time - exitHoldStart) / EXIT_HOLD_MS);
      if (exitProgress >= 1) {
        exiting = true;
        rlog('exit AR (thumbstick hold)');
        frame.session.end().catch(() => {});
      }
    } else {
      exitHoldStart = 0;
      exitProgress = 0;
    }
    // Upper face button (B/Y) normally cycles to the next mode, but it's overridden
    // in EDIT (swap the selected zone room<->wall) and in SIZE with a pair chosen
    // (reverse the dimension's direction). Thumbstick-x still cycles modes there.
    if (next && !btn.next) {
      if (modes[currentMode].id === 'edit') swapSelected();
      else if (modes[currentMode].id === 'size' && dimRefA && dimRefB) swapDim();
      else setMode(currentMode + 1);
    }
    if (prev && !btn.prev) setMode(currentMode - 1);
    btn.next = next;
    btn.prev = prev;
    // Thumbstick flick, dead-zoned, one step per flick. The dominant axis wins so
    // a diagonal doesn't cycle a mode AND change floor at once.
    if (!btn.stick && Math.abs(stickX) > 0.7 && Math.abs(stickX) >= Math.abs(stickY)) {
      setMode(currentMode + (stickX > 0 ? 1 : -1));
      btn.stick = true;
    } else if (Math.abs(stickX) < 0.3) {
      btn.stick = false;
    }
    // Stick up (negative Y) = floor above; down = floor below.
    if (!btn.stickY && Math.abs(stickY) > 0.7 && Math.abs(stickY) > Math.abs(stickX)) {
      switchFloor(stickY < 0 ? 1 : -1);
      btn.stickY = true;
    } else if (Math.abs(stickY) < 0.3) {
      btn.stickY = false;
    }
  }

  const f2 = (n) => (Number.isFinite(n) ? n.toFixed(3) : '—');
  // Active floor as "Name i/N" for the HUD.
  const floorLabel = () => {
    const fl = project.floors;
    const i = fl.findIndex((f) => f.id === project.activeFloorId);
    return `${project.activeFloor?.name ?? '-'} ${i + 1}/${fl.length}`;
  };
  const _wp = new THREE.Vector3();
  // XR camera world height (matrixWorld, not .position which stays local/0).
  const camWorldY = () => renderer.xr.getCamera().matrixWorld.elements[13];

  function onXRFrame(time, frame) {
    currentFrame = frame;
    pollModeCycle(frame, time);
    // Show the tip/label/HUD on ONLY the active controller — the other hand's
    // markers are hidden so the two don't clutter or read as both being live.
    const activeCtl = pickSource(frame);
    for (const c of controllers) c.visible = c.userData.inputSource === activeCtl;
    // Echo the pointed-at constraint's value big on the active controller so
    // small in-world dimension text can be read up close.
    const hovSprite = pickDimLabel(activeCtl);
    const hovDim = hovSprite?.userData.dimText ?? null;
    controllers.forEach((c, i) => {
      const on = c.userData.inputSource === activeCtl && !!hovDim;
      readouts[i].sprite.visible = on;
      if (on) readouts[i].setText(hovDim, 0x79c0ff);
    });
    // Minimal HUD: build stamp + the controller pointer and the reticle's floor
    // point, BOTH in plan coordinates (relative to the registered origin, yaw-
    // corrected) so they read the same as the model — not the session-start frame.
    // Before REGISTER the plan sits at the session origin, so it degrades gracefully.
    // ptr's 3rd value is height above the registered floor. reticle.position is this
    // frame's value from the previous mode pass — one frame of lag is imperceptible.
    const ptrW = tipPosition(activeCtl);
    const ptr = ptrW ? worldToPlan(ptrW) : null;
    const ret = reticle.visible ? worldToPlan(reticle.position) : null;
    const lines = [
      `build:  ${BUILD_ID}`,
      ...(exitProgress > 0 ? [`EXIT:   hold ${'█'.repeat(Math.round(exitProgress * 10)).padEnd(10, '·')}`] : []),
      `ptr:    ${ptr ? `${f2(ptr.px)}, ${f2(ptr.py)}, ${f2(ptrW.y - planPos.y)}` : '—'}`,
      `ret:    ${ret ? `${f2(ret.px)}, ${f2(ret.py)}` : '—'}`,
    ];
    for (const d of debugs) d.setLines(lines);
    // Floor preview + edge highlight, depending on the current mode.
    hoverEdge = null;
    cornerHi.visible = false;
    rectHi.visible = false;
    zebra.visible = false;
    recalBadge1.sprite.visible = recalBadge2.sprite.visible = recalStep.sprite.visible = false;
    hoverStack = [];
    const modeId = modes[currentMode].id;
    if (modeId === 'edge') {
      // EDGE mode: ray a floor point, pick the edge segment the beam lands on across
      // ALL zones, ring the aim point. edgeAtPoint uses true segment distance + a
      // cap, so the highlight tracks the edge under your reticle (open floor = none).
      const hit = rayFloorHit(pickSource(frame));
      if (hit) {
        const { px, py } = worldToPlan(hit);
        hoverEdge = edgeAtPoint(px, py); // {rectId, edge} | null
        reticle.visible = true;
        reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
        if (gripDrag) applyGripDrag(px, py); // grip-drag the grabbed edge to the reticle
      } else {
        hoverEdge = null;
        reticle.visible = false;
      }
      // Once an edge is locked, retitle/recolor the mode to YELLOW "SNAP TO WALL" so
      // it's clear the next touch snaps the locked edge to the real wall (only on change,
      // since applyModeVisual rebuilds the label texture).
      if (!!selectedEdge !== edgeSnapPrompt) {
        edgeSnapPrompt = !!selectedEdge;
        if (edgeSnapPrompt) applyModeVisual('SNAP TO WALL', 0xffe14d);
        else applyModeVisual('EDGE', 0xff5db1);
      }
      // Locked edge shows yellow; otherwise preview the ray-picked edge in magenta.
      const shown = selectedEdge || hoverEdge;
      if (shown) {
        const r = project.rectangles.find((x) => x.id === shown.rectId);
        if (r) showEdge(r, shown.edge, selectedEdge ? 0xffe14d : 0xff5db1);
        else edgeHi.visible = false;
      } else {
        edgeHi.visible = false;
      }
    } else if (modeId === 'floor' || modeId === 'register' || modeId === 'recal') {
      // Tip-touch modes: a ring under whichever controller tip is tracked, so you
      // see where FLOOR/REGISTER/RECAL will land (REGISTER & RECAL are 3-point gestures).
      const tipPos = tipPosition(pickSource(frame));
      if (tipPos) {
        reticle.visible = true;
        reticle.position.set(tipPos.x, floorY + 0.002, tipPos.z);
      } else {
        reticle.visible = false;
      }
      edgeHi.visible = false;
      // RECAL: highlight the corner (nearest to the tip until the first touch locks
      // it), badge its two walls 1 & 2 to guide the touch order, and echo the current
      // step number on the reticle. Wall 1 = the corner's X-edge, wall 2 = its Y-edge.
      if (modeId === 'recal') {
        // Before the first touch the corner previews under the tip; after, it's locked.
        let c = recalCorner;
        if (recalPts.length === 0) {
          if (tipPos) { const { px, py } = worldToPlan(tipPos); c = nearestPlanCorner(px, py); }
          else c = null;
        }
        if (c) {
          planToWorld(c.cx, c.cy, _cw);
          cornerHi.position.set(_cw.x, overlayY() + 0.008, _cw.z);
          cornerHi.material.color.setHex(C_RECAL);
          cornerHi.visible = true;
          placeWallBadge(recalBadge1, c.cx, c.cy, c.a);
          placeWallBadge(recalBadge2, c.cx, c.cy, c.b);
        }
        // Reticle badge: "1" while still on wall 1 (0-1 touches), "2" once on wall 2.
        if (reticle.visible && c) {
          const step = recalPts.length === 2 ? 2 : 1;
          if (step !== prevRecalStep) { recalStep.setText(String(step), step === 2 ? C_WALL2 : C_WALL1); prevRecalStep = step; }
          recalStep.sprite.position.set(reticle.position.x, reticle.position.y + 0.05, reticle.position.z);
          recalStep.sprite.visible = true;
        }
      }
    } else if (modeId === 'size') {
      // SIZE: pick two references (edge or origin) then type on the numpad. While
      // the pair isn't complete, aim at the floor to pick refs; once complete, the
      // ray drives the numpad. Locked refs (amber) and the hover ref (yellow) are
      // drawn — edges as strips, the origin by tinting its gizmo ring.
      reticle.visible = false;
      hoverKey = null;
      hoverRef = null;
      hoverDim = null;
      numpadCursor.visible = false;
      edgeHi.visible = false;
      edgeHi2.visible = false;
      originRingMat.color.setHex(C_ORIGIN_GIZMO);
      if (dimRefA && dimRefB) {
        // Numpad phase: raycast the panel for the key under the ray.
        const panelHit = rayPanelHit(pickSource(frame));
        if (numpad.group.visible && panelHit) {
          hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
          numpadCursor.position.copy(panelHit.point);
          numpadCursor.visible = true;
        }
      } else {
        // Reference-pick phase. If the ray is on an existing dim value panel, THAT is
        // the pick (select it to edit the constraint); otherwise ray the floor for an
        // edge/origin. edgeAtPoint caps at the reticle radius, same as EDGE mode.
        const hit = rayFloorHit(pickSource(frame));
        if (hit) {
          reticle.visible = true; // reticle always tracks the floor point
          reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          if (gripDrag) applyGripDrag(px, py); // grip-drag the grabbed dim panel to the reticle
          // A dim panel is hovered only when the RETICLE is over it (before the first ref).
          hoverDim = dimRefA ? null : dimLabelAtPoint(px, py);
          if (!hoverDim) { // a hovered dim panel takes over the pick; otherwise pick a floor edge/origin
            if (Math.hypot(hit.x - planPos.x, hit.z - planPos.z) < 0.12) hoverRef = { kind: 'origin' };
            else { const e = edgeAtPoint(px, py); if (e) hoverRef = { kind: 'edge', rectId: e.rectId, edge: e.edge }; }
          }
        }
      }
      // Highlights: ref A (amber), then ref B if set (amber) else the hover (yellow).
      // When hovering a dim panel, preview BOTH its edges (cyan) so you see how it's defined.
      let ei = 0;
      const slots = [edgeHi, edgeHi2];
      const showRef = (ref, color) => {
        if (!ref) return;
        if (ref.kind === 'origin') originRingMat.color.setHex(color);
        else { const r = rectOf(ref); if (r && ei < slots.length) showEdge(r, ref.edge, color, slots[ei++]); }
      };
      if (hoverDim) {
        showRef(hoverDim.userData.refA, 0x22d3ee);
        showRef(hoverDim.userData.refB, 0x22d3ee);
      } else {
        showRef(dimRefA, 0xfbbf24);
        showRef(dimRefB ?? hoverRef, dimRefB ? 0xfbbf24 : 0xffe14d);
      }
      if (hoverKey !== prevHoverKey) { redrawNumpad(); prevHoverKey = hoverKey; }
    } else if (modeId === 'edit') {
      // EDIT: ray the floor, gather the overlap stack under the reticle. The
      // persistent selection (if any) is zebra-filled + outlined in its op color;
      // otherwise preview the topmost zone under the reticle in yellow outline.
      const hit = rayFloorHit(pickSource(frame));
      if (hit) {
        const { px, py } = worldToPlan(hit);
        hoverStack = rectsAtPoint(px, py);
        reticle.visible = true;
        reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
      } else {
        reticle.visible = false;
      }
      if (selectedRect && !project.rectangles.includes(selectedRect)) selectedRect = null;
      if (selectedRect) {
        showRectOutline(selectedRect, selectedRect.op === 'subtract' ? 0xff6b6b : 0x51d88a);
        showZebra(selectedRect);
      } else if (hoverStack.length) {
        showRectOutline(hoverStack[0], 0xffe14d); // preview the topmost, not yet selected
      }
    } else if (modeId === 'save' || modeId === 'load') {
      // SAVE/LOAD: aim the ray at the slot menu; highlight the cell under the ray.
      reticle.visible = false;
      edgeHi.visible = false;
      hoverSlot = null;
      numpadCursor.visible = false;
      const panelHit = rayPanelHit(pickSource(frame), slotMenu.mesh);
      if (slotMenu.group.visible && panelHit) {
        hoverSlot = slotMenu.slotAt(panelHit.uv.x, panelHit.uv.y);
        numpadCursor.position.copy(panelHit.point);
        numpadCursor.visible = true;
      }
      // Moving to a different slot clears a lingering "SAVED/LOADED" flash.
      if (hoverSlot !== prevHoverSlot) {
        if (hoverSlot !== null) slotFlash = null;
        redrawSlotMenu();
        prevHoverSlot = hoverSlot;
      }
    } else {
      // ROOM/WALL: no floor target (drops at the standing position).
      reticle.visible = false;
      edgeHi.visible = false;
    }
    // Keep the placed plan locked to its anchor (the runtime corrects drift here),
    // preserving the ALIGN yaw about the drift-corrected origin.
    if (placed && anchor) {
      const pose = frame.getPose(anchor.anchorSpace, localSpace);
      if (pose) {
        const p = pose.transform.position;
        planPos.set(p.x, p.y, p.z);
        applyPlanMatrix();
      }
    }
  }
}
