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
import { footprintFloorGeometry, footprintOutlineGeometry } from '../core/extrude.js';
import { rlog } from './remoteLog.js';

const ACCENT = 0x4ea1ff;

/**
 * @param {View3D} view
 * @param {() => number[][][][]} getFootprint  returns the current footprint MultiPolygon
 */
export function setupMR(view, getFootprint) {
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
  document.getElementById('pane-3d').appendChild(button);

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
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(0.24, 0.12, 1);
    sprite.position.set(0, 0.14, -0.04);
    const setLines = (lines) => {
      ctx.clearRect(0, 0, 512, 256);
      ctx.fillStyle = 'rgba(15, 18, 24, 0.82)';
      ctx.beginPath();
      ctx.roundRect(6, 6, 500, 244, 14);
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

  // The marker sits ahead of the controller's tracked origin, along the pointing
  // ray, so it clears the physical controller body (which would occlude it) and
  // reads as a "tip." Placement uses this same offset point (see tipPosition).
  const TIP_OFFSET = new THREE.Vector3(0, 0, -0.04); // 4 cm forward along -Z

  // Controllers, each with a small sphere "tip" you touch to the real floor, plus
  // a mode label. Placement uses the controller's tracked position (cm-accurate)
  // rather than a depth raycast, so the floor is defined by physically touching it.
  const tipGeom = new THREE.SphereGeometry(0.012, 16, 12);
  const tipMat = new THREE.MeshBasicMaterial({ color: ACCENT });
  const controllers = [];
  const labels = [];
  const debugs = [];
  for (const i of [0, 1]) {
    const c = renderer.xr.getController(i); // target-ray space: -Z is the pointing dir
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.position.copy(TIP_OFFSET);
    c.add(tip);
    const label = makeLabel();
    label.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + 0.05, TIP_OFFSET.z);
    c.add(label.sprite);
    labels.push(label);
    const dbg = makeDebug(); // debug HUD above each tip so it's always in view
    dbg.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + 0.16, TIP_OFFSET.z);
    c.add(dbg.sprite);
    debugs.push(dbg);
    c.addEventListener('select', onSelect);   // trigger: run current mode
    c.addEventListener('squeeze', onReset);   // grip: undo placement
    scene.add(c);
    controllers.push(c);
  }
  const lastTouch = new THREE.Vector3(NaN, NaN, NaN);

  // A ring that lies on the floor under the active controller tip, previewing
  // where a touch will land. Recolors with the current mode.
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.6 }),
  );
  reticle.visible = false;
  scene.add(reticle);

  // The placed plan lives in this group; its position/rotation follow the anchor.
  const planGroup = new THREE.Group();
  planGroup.visible = false;

  const fillMat = new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const lineMat = new THREE.LineBasicMaterial({ color: ACCENT });

  function buildPlan() {
    // Clear any previous geometry.
    for (const child of [...planGroup.children]) {
      planGroup.remove(child);
      child.geometry?.dispose();
    }
    const footprint = getFootprint?.() ?? [];
    const fillGeo = footprintFloorGeometry(footprint);
    if (fillGeo) planGroup.add(new THREE.Mesh(fillGeo, fillMat));
    const outlineGeo = footprintOutlineGeometry(footprint);
    if (outlineGeo) {
      const outline = new THREE.LineSegments(outlineGeo, lineMat);
      outline.position.y = 0.003; // lift slightly to avoid z-fighting with the fill
      planGroup.add(outline);
    }
    return planGroup.children.length > 0;
  }

  let localSpace = null;
  let currentFrame = null;
  let anchor = null;
  let placed = false;
  const saved = {};
  const planPos = new THREE.Vector3(); // last placed reference point (world)
  let planYaw = 0;                     // plan rotation about vertical, set by ALIGN
  let floorY = 0;                      // floor height; 0 = local-floor, overridable by FLOOR
  const UP = new THREE.Vector3(0, 1, 0);

  // Rebuild the plan's transform from its origin (planPos) and yaw (planYaw).
  // Drive position/quaternion (not .matrix) so Three keeps matrixWorld in sync.
  function applyPlanMatrix() {
    planGroup.position.copy(planPos);
    planGroup.quaternion.setFromAxisAngle(UP, planYaw);
  }

  // Modes share the touch gesture (trigger). A/B (or thumbstick left/right) cycle
  // between them; the tip/reticle/label recolor so the active mode is always
  // visible. Add future modes (corner, wall/registration, survey point) here.
  const modes = [
    {
      label: 'FLOOR', color: 0x51d88a,
      // Calibrate the floor height from a touch on the real floor; re-level if placed.
      onTouch: (pos) => {
        floorY = pos.y;
        if (placed) placeAt(planPos.x, floorY, planPos.z);
      },
    },
    {
      label: 'ORIGIN', color: 0x4ea1ff,
      // Set the origin's horizontal position from the touch; height stays on the floor.
      onTouch: (pos) => placeAt(pos.x, floorY, pos.z),
    },
    {
      label: 'ALIGN', color: 0xffb454,
      // Rotate the plan so its +X axis points from the origin toward this touch —
      // touch a point along a real wall to align the plan to that wall.
      onTouch: (pos) => {
        if (!placed) return;
        const dx = pos.x - planPos.x;
        const dz = pos.z - planPos.z;
        if (Math.hypot(dx, dz) < 0.05) return; // too close to define a direction
        planYaw = Math.atan2(-dz, dx);
        applyPlanMatrix();
      },
    },
  ];
  let currentMode = 0;

  function setMode(i) {
    currentMode = (i + modes.length) % modes.length;
    const m = modes[currentMode];
    tipMat.color.setHex(m.color);
    reticle.material.color.setHex(m.color);
    for (const l of labels) l.setText(m.label, m.color);
  }

  function placeAt(x, y, z) {
    if (!planGroup.children.length) return;
    planPos.set(x, y, z);
    planGroup.visible = true;
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
    saved.meshVisible = view.mesh?.visible;

    scene.background = null; // reveal passthrough
    if (view.grid) view.grid.visible = false;
    if (view.floor) view.floor.visible = false;
    if (view.mesh) view.mesh.visible = false; // hide the extruded walls
    view.controls.enabled = false;

    buildPlan();
    scene.add(planGroup);
    planGroup.visible = false;
    placed = false;
    anchor = null;
    planYaw = 0;
    floorY = 0;
    setMode(0);

    localSpace = await session.requestReferenceSpace('local-floor');
    // Force Three to RENDER with this exact space (not just the type setter, which
    // didn't take through ARButton) so render origin == our measurement origin.
    renderer.xr.setReferenceSpace(localSpace);
    view.onXRFrame = onXRFrame;
  });

  renderer.xr.addEventListener('sessionend', () => {
    view.onXRFrame = null;
    anchor = null;
    reticle.visible = false;
    scene.remove(planGroup);

    scene.background = saved.background ?? null;
    if (view.grid) view.grid.visible = saved.gridVisible ?? true;
    if (view.floor) view.floor.visible = saved.floorVisible ?? true;
    if (view.mesh) view.mesh.visible = saved.meshVisible ?? true;
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

  // Grip button: undo the placement so you can touch the floor and drop it again.
  function onReset() {
    if (!placed) return;
    placed = false;
    anchor = null; // forget the old anchor; a fresh one is made on next place
    planGroup.visible = false;
  }

  // Edge-detection state for the mode-cycle inputs.
  const btn = { next: false, prev: false, stick: false };

  function pollModeCycle(frame) {
    // xr-standard mapping: buttons[4]=A/X (lower), buttons[5]=B/Y (upper),
    // axes[2]=thumbstick x. Accept either controller.
    let next = false, prev = false, stickX = 0;
    for (const src of frame.session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      if (gp.buttons[5]?.pressed) next = true; // upper face button -> next
      if (gp.buttons[4]?.pressed) prev = true; // lower face button -> previous
      const x = gp.axes[2] ?? 0;
      if (Math.abs(x) > Math.abs(stickX)) stickX = x;
    }
    if (next && !btn.next) setMode(currentMode + 1);
    if (prev && !btn.prev) setMode(currentMode - 1);
    btn.next = next;
    btn.prev = prev;
    // Thumbstick flick with a dead zone, one step per flick.
    if (!btn.stick && Math.abs(stickX) > 0.7) {
      setMode(currentMode + (stickX > 0 ? 1 : -1));
      btn.stick = true;
    } else if (Math.abs(stickX) < 0.3) {
      btn.stick = false;
    }
  }

  const f2 = (n) => (Number.isFinite(n) ? n.toFixed(3) : '—');
  const _wp = new THREE.Vector3();
  // XR camera world height (matrixWorld, not .position which stays local/0).
  const camWorldY = () => renderer.xr.getCamera().matrixWorld.elements[13];

  function onXRFrame(time, frame) {
    currentFrame = frame;
    pollModeCycle(frame);
    const lines = [
      `mode:   ${modes[currentMode].label}`,
      `placed: ${placed}   anchor: ${!!anchor}`,
      `floorY:   ${f2(floorY)}`,
      `plan.y:   ${f2(planPos.y)}`,
      `world.y:  ${f2(planGroup.getWorldPosition(_wp).y)}`,
      `touch.y:  ${f2(lastTouch.y)}`,
      `cam.y:    ${f2(camWorldY())}`,
    ];
    for (const d of debugs) d.setLines(lines);
    // Preview: a ring on the floor under whichever controller tip is tracked.
    if (!placed) {
      let shown = false;
      for (const src of frame.session.inputSources) {
        const pos = tipPosition(src);
        if (pos) {
          reticle.visible = true;
          // Project the tip straight down to the floor so you see the ground point.
          reticle.position.set(pos.x, floorY + 0.002, pos.z);
          shown = true;
          break;
        }
      }
      if (!shown) reticle.visible = false;
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
