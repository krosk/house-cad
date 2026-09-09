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
import { footprintFloorGeometry } from '../core/extrude.js';
import { rlog } from './remoteLog.js';

const ACCENT = 0x4ea1ff;

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

  // Highlight for the survey edge you're pointing at (magenta) or have locked
  // (yellow) in EDGE mode — a line drawn along that edge, just above the floor.
  const edgeHiGeo = new THREE.BufferGeometry();
  edgeHiGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3)); // 2 triangles
  const edgeHi = new THREE.Mesh(
    edgeHiGeo,
    new THREE.MeshBasicMaterial({ color: 0xff5db1, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
  );
  edgeHi.renderOrder = 10; // always on top of the resting/active edge strips
  edgeHi.visible = false;
  scene.add(edgeHi);

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

  // Origin gizmo: a ring at the plan origin plus a short +X arrow showing the ALIGN
  // direction, so you always see where the frame is registered — and, when there
  // are no zones yet, it's the placeholder that proves placement worked. It rides
  // planPos/planYaw (see applyPlanMatrix), so it's kept OUT of planGroup (which
  // buildPlan clears every rebuild).
  const originGizmo = new THREE.Group();
  {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.07, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2dd4bf, side: THREE.DoubleSide, depthWrite: false }),
    );
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.001, 0, 0.35, 0.001, 0], 3));
    const arrow = new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: 0x2dd4bf }));
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
  const EDGE_HALF = 0.02; // strip half-width -> 4 cm bold edge
  const restMat = new THREE.MeshBasicMaterial({ color: 0x9b6dff, side: THREE.DoubleSide, depthWrite: false });   // resting zone edges
  const activeMat = new THREE.MeshBasicMaterial({ color: 0xd8b4fe, side: THREE.DoubleSide, depthWrite: false }); // active zone edges

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
  function rectStripGeo(rects, t = EDGE_HALF) {
    const arr = [];
    const tri = (c) => arr.push(c[0], 0, -c[1]);
    for (const r of rects) {
      const b = r.bounds;
      const edges = [
        [b.x0, b.y0, b.x1, b.y0], [b.x1, b.y0, b.x1, b.y1], // bottom, right
        [b.x1, b.y1, b.x0, b.y1], [b.x0, b.y1, b.x0, b.y0], // top, left
      ];
      for (const [ax, ay, bx, by] of edges) {
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

  function buildPlan() {
    // Clear any previous geometry.
    for (const child of [...planGroup.children]) {
      planGroup.remove(child);
      child.geometry?.dispose();
    }
    const footprint = getFootprint?.() ?? [];
    const fillGeo = footprintFloorGeometry(footprint); // merged fill = total free space
    if (fillGeo) planGroup.add(new THREE.Mesh(fillGeo, fillMat));
    // Per-rectangle edge strips: non-active zones purple, active zone brighter/on top.
    const restGeo = rectStripGeo(project.rectangles.filter((r) => r !== activeRect));
    if (restGeo) {
      const o = new THREE.Mesh(restGeo, restMat);
      o.position.y = 0.004; // lift above the fill
      planGroup.add(o);
    }
    if (activeRect) {
      const activeGeo = rectStripGeo([activeRect]);
      if (activeGeo) {
        const o = new THREE.Mesh(activeGeo, activeMat);
        o.position.y = 0.006;
        planGroup.add(o);
      }
    }
    return planGroup.children.length > 0;
  }

  let localSpace = null;
  let currentFrame = null;
  let anchor = null;
  let placed = false;
  const saved = {};
  const planPos = new THREE.Vector3(); // last placed reference point (world)
  let planYaw = 0;                     // plan rotation about vertical, set by ALIGN step
  let floorY = 0;                      // floor height; 0 = local-floor, overridable by FLOOR
  let awaitingAlign = false;           // REGISTER two-step: origin done, awaiting the align touch
  let awaitingRecalDir = false;        // RECAL two-step: corner locked, awaiting the edge-direction touch
  let recalCorner = null;              // {cx, cy} plan corner being re-referenced by RECAL
  const recalWc = new THREE.Vector3(); // world position of the touched real corner (RECAL step 1)
  const UP = new THREE.Vector3(0, 1, 0);

  // SURVEY state. We author free-space rectangles and refine their edges by
  // pointing at an edge (ray) then touching the matching real wall.
  const surveyed = [];      // Rectangle ids this session, in creation order (for undo)
  let activeRect = null;    // the rectangle whose edges EDGE mode edits (last dropped)
  let selectedEdge = null;  // 'left'|'right'|'top'|'bottom' locked, awaiting a wall touch
  let hoverEdge = null;     // ray-previewed edge of activeRect (recomputed each frame)

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
  function planToWorld(px, py, target = _pw) {
    planGroup.updateMatrixWorld(true);
    target.set(px, 0, -py);
    return planGroup.localToWorld(target);
  }

  // Rebuild the plan's transform from its origin (planPos) and yaw (planYaw).
  // Drive position/quaternion (not .matrix) so Three keeps matrixWorld in sync.
  function applyPlanMatrix() {
    planGroup.position.copy(planPos);
    planGroup.quaternion.setFromAxisAngle(UP, planYaw);
    originGizmo.position.copy(planPos); // gizmo rides the same origin + yaw
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

  // Which edge of `rect` is nearest a plan point — smallest perpendicular gap to
  // the four edge lines. Robust enough when you point near the intended edge.
  function nearestEdge(rect, px, py) {
    const b = rect.bounds;
    const d = {
      left: Math.abs(px - b.x0), right: Math.abs(px - b.x1),
      bottom: Math.abs(py - b.y0), top: Math.abs(py - b.y1),
    };
    return Object.keys(d).reduce((a, k) => (d[k] < d[a] ? k : a));
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
  function nearestPlanCorner(px, py) {
    let best = null, bestD = Infinity;
    for (const r of project.rectangles) {
      const b = r.bounds;
      for (const [cx, cy] of [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]) {
        const d = Math.hypot(px - cx, py - cy);
        if (d < bestD) { bestD = d; best = { cx, cy }; }
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

  // Draw the edge-highlight strip along `edge` of `rect`, in the given color —
  // same thickened-quad style as the resting edges, a touch bolder and on top.
  const _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3();
  const _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();
  function showEdge(rect, edge, colorHex) {
    const [[ax, ay], [bx, by]] = edgeEndpoints(rect, edge);
    const c = stripCorners(ax, ay, bx, by, EDGE_HALF * 1.3); // slightly bolder than rest
    planToWorld(c[0][0], c[0][1], _c0);
    planToWorld(c[1][0], c[1][1], _c1);
    planToWorld(c[2][0], c[2][1], _c2);
    planToWorld(c[3][0], c[3][1], _c3);
    const a = edgeHi.geometry.attributes.position.array;
    const w = (i, v) => { a[i] = v.x; a[i + 1] = v.y + 0.014; a[i + 2] = v.z; };
    w(0, _c0); w(3, _c1); w(6, _c2);   // triangle 1: c0,c1,c2
    w(9, _c0); w(12, _c2); w(15, _c3); // triangle 2: c0,c2,c3
    edgeHi.geometry.attributes.position.needsUpdate = true;
    edgeHi.material.color.setHex(colorHex);
    edgeHi.visible = true;
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
    const t = (floorY - _ro.y) / _rd.y;
    if (t <= 0) return null; // floor is behind the controller
    return _rhit.copy(_ro).addScaledVector(_rd, t);
  }

  const C_ORIGIN = 0x4ea1ff, C_ALIGN = 0xffb454; // REGISTER step 1 / step 2 colors
  const C_RECAL = 0x22d3ee, C_RECAL_DIR = 0xa78bfa; // RECAL step 1 (corner) / step 2 (direction) colors

  // Modes share the touch gesture (trigger). A/B (or thumbstick left/right) cycle
  // between them; the tip/reticle/label recolor so the active mode is always
  // visible. FLOOR + REGISTER set up the frame; DROP/EDGE are the survey loop.
  const modes = [
    {
      id: 'floor', label: 'FLOOR', color: 0x51d88a,
      // Calibrate the floor height from a touch on the real floor; re-level if placed.
      onTouch: (pos) => {
        floorY = pos.y;
        if (placed) placeAt(planPos.x, floorY, planPos.z);
      },
    },
    {
      // REGISTER: a two-step place+orient (like EDGE). 1st touch sets the origin;
      // 2nd touch (a point along a real wall from the origin) sets the yaw so the
      // plan's +X points down that wall. The tip label/color flips ORIGIN->ALIGN
      // between the steps so the current step is always visible.
      id: 'register', label: 'ORIGIN', color: C_ORIGIN,
      onTouch: (pos) => {
        if (!awaitingAlign) {
          placeAt(pos.x, floorY, pos.z); // step 1: origin (gizmo appears)
          awaitingAlign = true;
          applyModeVisual('ALIGN', C_ALIGN); // cue step 2
          rlog('register origin', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) });
          return;
        }
        const dx = pos.x - planPos.x;
        const dz = pos.z - planPos.z;
        if (Math.hypot(dx, dz) < 0.05) return; // too close to define a direction
        planYaw = Math.atan2(-dz, dx); // step 2: orient +X toward the wall touch
        applyPlanMatrix();
        awaitingAlign = false;
        applyModeVisual('ORIGIN', C_ORIGIN); // ready to re-register next time
        rlog('register align', { yaw: +planYaw.toFixed(3) });
      },
    },
    {
      id: 'drop', label: 'DROP', color: 0x2dd4bf,
      // Drop a default free-space rectangle at your standing position — no floor
      // touch needed, since the box is throwaway and its edges get pushed to the
      // walls in EDGE mode. It becomes the active rectangle.
      onTouch: () => {
        if (!placed) return; // need a registered frame (ORIGIN) to define plan space
        const e = renderer.xr.getCamera().matrixWorld.elements; // headset world pos
        _drop.set(e[12], floorY, e[14]);
        const { px, py } = worldToPlan(_drop);
        const half = 0.75; // 1.5 m starter box — size is throwaway, edges get pushed
        const rect = new Rectangle({ x: px - half, y: py - half, w: 2 * half, h: 2 * half, op: 'add' });
        project.addRectangle(rect);
        surveyed.push(rect.id);
        activeRect = rect;
        selectedEdge = null;
        buildPlan();       // re-read footprint (now includes the new rect); keeps transform
        applyPlanMatrix(); // buildPlan swaps geometry only; reassert position/yaw
        rlog('drop rect', { id: rect.id, px: +px.toFixed(3), py: +py.toFixed(3) });
      },
    },
    {
      id: 'edge', label: 'EDGE', color: 0xff5db1,
      // Two presses per wall: 1st (aiming at an edge) LOCKS that edge; 2nd (tip
      // touching the real wall) snaps the locked edge to the wall. The ray picks
      // the edge; the touch supplies only the perpendicular coordinate.
      onTouch: (pos) => {
        if (!placed || !activeRect) return;
        if (!selectedEdge) {
          if (hoverEdge) { selectedEdge = hoverEdge; rlog('edge locked', { edge: selectedEdge }); }
          return;
        }
        const { px, py } = worldToPlan(pos);
        setEdge(activeRect, selectedEdge, px, py);
        rlog('edge set', { edge: selectedEdge, px: +px.toFixed(3), py: +py.toFixed(3) });
        selectedEdge = null;
        project.touch();   // rectangle mutated in place -> re-solve + notify
        buildPlan();
        applyPlanMatrix();
      },
    },
    {
      id: 'recal', label: 'RECAL', color: C_RECAL,
      // Correct drift: re-zero the plan against a KNOWN corner. Two touches (like
      // REGISTER, but referencing any surveyed corner, not just plan-origin):
      // 1st = the real corner; 2nd = a point along one of its real edges. Both
      // rotational and positional drift are corrected; the whole plan follows.
      onTouch: (pos) => {
        if (!placed) return;
        if (!awaitingRecalDir) {
          const { px, py } = worldToPlan(pos);
          const corner = nearestPlanCorner(px, py);
          if (!corner) return; // no surveyed corners to reference yet
          recalCorner = corner;
          recalWc.copy(pos);
          awaitingRecalDir = true;
          applyModeVisual('RECAL DIR', C_RECAL_DIR); // cue step 2
          rlog('recal corner', { cx: +corner.cx.toFixed(3), cy: +corner.cy.toFixed(3) });
          return;
        }
        const wdx = pos.x - recalWc.x, wdz = pos.z - recalWc.z;
        if (Math.hypot(wdx, wdz) < 0.05) return; // too close to define a direction
        recalibrate(recalCorner, recalWc, wdx, wdz);
        awaitingRecalDir = false;
        recalCorner = null;
        buildPlan();       // geometry unchanged, but reassert against the new transform
        applyModeVisual('RECAL', C_RECAL); // ready to re-recal next time
        rlog('recal done', { yaw: +planYaw.toFixed(3) });
      },
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
    awaitingAlign = false; // leaving/entering a mode resets the REGISTER two-step
    awaitingRecalDir = false; // ... and the RECAL two-step
    recalCorner = null;
    const m = modes[currentMode];
    applyModeVisual(m.label, m.color);
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
    saved.meshVisible = view.mesh?.visible;

    scene.background = null; // reveal passthrough
    if (view.grid) view.grid.visible = false;
    if (view.floor) view.floor.visible = false;
    if (view.mesh) view.mesh.visible = false; // hide the extruded walls
    view.hideMesh = true; // keep them hidden even as survey edits rebuild the mesh
    view.controls.enabled = false;

    buildPlan();
    scene.add(planGroup);
    planGroup.visible = false;
    placed = false;
    anchor = null;
    planYaw = 0;
    floorY = 0;
    surveyed.length = 0;
    activeRect = null;
    selectedEdge = null;
    hoverEdge = null;
    edgeHi.visible = false;
    cornerHi.visible = false;
    originGizmo.visible = false;
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
    edgeHi.visible = false;
    cornerHi.visible = false;
    originGizmo.visible = false;
    scene.remove(planGroup);

    view.hideMesh = false; // desktop shows the extruded walls again
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

  // Grip button: context-sensitive undo.
  //  - DROP/EDGE: cancel a locked edge, else remove the last surveyed rectangle.
  //  - REGISTER mid-gesture: cancel the pending align step (keep the origin).
  //  - otherwise: un-place the plan so you can register it again.
  function onReset() {
    const mode = modes[currentMode];
    if (mode.id === 'drop' || mode.id === 'edge') {
      if (selectedEdge) { // a locked edge is pending -> just cancel it
        selectedEdge = null;
        rlog('edge lock cancelled');
        return;
      }
      const id = surveyed.pop(); // undo the last surveyed room
      if (id) {
        project.removeRectangle(id);
        // Fall back to the previous surveyed rect as active (or none).
        const prev = surveyed[surveyed.length - 1];
        activeRect = prev ? project.rectangles.find((r) => r.id === prev) ?? null : null;
        buildPlan();
        applyPlanMatrix();
        rlog('survey undo', { id });
      }
      return;
    }
    if (mode.id === 'register' && awaitingAlign) { // cancel the pending align step
      awaitingAlign = false;
      applyModeVisual('ORIGIN', C_ORIGIN);
      rlog('register align cancelled');
      return;
    }
    if (mode.id === 'recal' && awaitingRecalDir) { // cancel the pending direction step
      awaitingRecalDir = false;
      recalCorner = null;
      applyModeVisual('RECAL', C_RECAL);
      rlog('recal dir cancelled');
      return;
    }
    if (!placed) return;
    placed = false;
    anchor = null; // forget the old anchor; a fresh one is made on next place
    planGroup.visible = false;
    originGizmo.visible = false;
    awaitingAlign = false;
    applyModeVisual(mode.label, mode.color);
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
      `mode:   ${modes[currentMode].label}${awaitingAlign ? ' >ALIGN' : ''}${awaitingRecalDir ? ' >DIR' : ''}`,
      `placed: ${placed}   anchor: ${!!anchor}`,
      `rooms:  ${surveyed.length}   active: ${!!activeRect}`,
      `edge:   sel=${selectedEdge ?? '-'} hov=${hoverEdge ?? '-'} rc=${recalCorner ? recalCorner.cx.toFixed(1) + ',' + recalCorner.cy.toFixed(1) : '-'}`,
      `floorY:   ${f2(floorY)}`,
      `plan.y:   ${f2(planPos.y)}`,
      `cam.y:    ${f2(camWorldY())}`,
    ];
    for (const d of debugs) d.setLines(lines);
    // Floor preview + edge highlight, depending on the current mode.
    hoverEdge = null;
    cornerHi.visible = false;
    const modeId = modes[currentMode].id;
    if (modeId === 'edge' && activeRect) {
      // EDGE mode: ray a floor point, pick the nearest edge, ring the aim point.
      let hit = null;
      for (const src of frame.session.inputSources) {
        hit = rayFloorHit(src);
        if (hit) break;
      }
      if (hit) {
        const { px, py } = worldToPlan(hit);
        hoverEdge = nearestEdge(activeRect, px, py);
        reticle.visible = true;
        reticle.position.set(hit.x, floorY + 0.002, hit.z);
      } else {
        reticle.visible = false;
      }
      // Locked edge shows yellow; otherwise preview the ray-picked edge in magenta.
      if (selectedEdge) showEdge(activeRect, selectedEdge, 0xffe14d);
      else if (hoverEdge) showEdge(activeRect, hoverEdge, 0xff5db1);
      else edgeHi.visible = false;
    } else if (modeId === 'floor' || modeId === 'register' || modeId === 'recal') {
      // Tip-touch modes: a ring under whichever controller tip is tracked, so you
      // see where FLOOR/ORIGIN/ALIGN/RECAL will land (both two-step gestures incl.).
      let tipPos = null;
      for (const src of frame.session.inputSources) {
        tipPos = tipPosition(src);
        if (tipPos) break;
      }
      if (tipPos) {
        reticle.visible = true;
        reticle.position.set(tipPos.x, floorY + 0.002, tipPos.z);
      } else {
        reticle.visible = false;
      }
      edgeHi.visible = false;
      // RECAL: mark the corner. While locking (step 1), preview the nearest plan
      // corner under the tip (cyan); once locked (step 2), ride the locked corner
      // (purple) so you see what you're aligning as you touch the edge direction.
      if (modeId === 'recal') {
        let c = recalCorner;
        if (!awaitingRecalDir) {
          if (tipPos) { const { px, py } = worldToPlan(tipPos); c = nearestPlanCorner(px, py); }
          else c = null;
        }
        if (c) {
          planToWorld(c.cx, c.cy, _cw);
          cornerHi.position.set(_cw.x, floorY + 0.008, _cw.z);
          cornerHi.material.color.setHex(awaitingRecalDir ? C_RECAL_DIR : C_RECAL);
          cornerHi.visible = true;
        }
      }
    } else {
      // DROP: no floor target (drops at the standing position).
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
