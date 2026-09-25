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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Rectangle, WIRE_TYPES, PIPE_SERVICES } from '../core/model.js';
import { connectedRoomComponent, recalibrationCorners } from '../core/geometry2d.js';
import { makeDistance, makeOriginDistance, makeMarkerDistance, makeNodeDistance, isMarkerConstraint, isNodeConstraint, ORIGIN_ID, edgeCoord } from '../core/constraints.js';
import { footprintFloorGeometry } from '../core/extrude.js';
import { getUnit, setUnit, cycleUnit, onUnitChange, UNIT_ORDER, toMeters, unitLabel, fmt } from '../core/units.js';
import { t, localizedFloorName, revLabels, getLang, langLabel, setLang, cycleLang, onLangChange, LANG_ORDER } from '../core/i18n.js';
import { getVersionStatus } from '../core/versionCheck.js';
import {
  AUTOSAVE_KEY, FLOOR_CLIPBOARD_KEY, createFloorClipboard, pasteFloorClipboard,
  serializeProject, deserializeInto,
} from '../io/serialize.js';
import { floorToSvg, floorToCanvas, floorToPngBlob, sharedScaleSheetOptions } from '../io/planSheet.js';
import { floorToDxf, floorToCoohomDxf } from '../io/dxf.js';
import { buildShareUrl } from '../io/shareView.js';
import { qrToPngBlob } from '../io/qr.js';
import {
  getOutputSettings, cycleOutputFormat, toggleOutputLayer, onOutputSettingsChange,
} from '../io/outputOptions.js';
import { dimLabelCoord, setDimLabelCoord } from '../core/dimline.js';
import { electricalRoutePoints } from '../core/electrical.js';
import { conduitNetworkSegments, conduitNodePos, conduitNodeForMarker, wireRouteSegments } from '../core/conduit.js';
import { deriveCircuits } from '../core/circuits.js';
import { diffAgainstSnapshot } from '../core/planDiff.js';
import { ZONE_KINDS, zoneKind, zoneColorHex, lightenHex, isAperture, verticalBandFields } from '../core/zoneColors.js';
import { doorSwingSegments, garageDoorSegments, windowCasementSegments, halfWallHatchSegments, heaterFinSegments, slidingDoorSegments, resolveApertureOrient } from '../core/apertureGlyph.js';
import { rlog } from './remoteLog.js';

const ACCENT = 0x4ea1ff;
const C_TELEPORT = 0x38bdf8;

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
    // The controller readout calls this EVERY frame; skip the canvas redraw + texture
    // upload when nothing changed (a per-frame canvas upload can stall the Quest GPU).
    let shown = null;
    const setText = (text, colorHex) => {
      const key = `${colorHex}|${text}`;
      if (key === shown) return;
      shown = key;
      ctx.clearRect(0, 0, 256, 64);
      // Dark backing pill so the label stays legible over passthrough.
      ctx.fillStyle = 'rgba(15, 18, 24, 0.78)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
      // Breadcrumbs are longer than the old flat labels. Fit them within the pill
      // while keeping short tool names at the original, highly legible size.
      ctx.font = 'bold 40px sans-serif';
      const fontSize = Math.max(24, Math.min(40, Math.floor(40 * 216 / Math.max(216, ctx.measureText(text).width))));
      ctx.font = `bold ${fontSize}px sans-serif`;
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
    canvas.height = 352; // 10 lines at a 32 px pitch (build … batt, incl. fps/draw/time)
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(0.24, 0.165, 1); // match the 512x352 aspect
    sprite.position.set(0, 0.14, -0.04);
    const setLines = (lines) => {
      ctx.clearRect(0, 0, 512, 352);
      ctx.fillStyle = 'rgba(15, 18, 24, 0.82)';
      ctx.beginPath();
      ctx.roundRect(6, 6, 500, 340, 14);
      ctx.fill();
      ctx.fillStyle = '#e6edf3';
      ctx.font = '28px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => ctx.fillText(line, 20, 18 + i * 32)); // 10 lines fit the 352 px canvas
      tex.needsUpdate = true;
    };
    return { sprite, setLines };
  }

  // A word-wrapped "what does this mode do" box that rides above the debug HUD so
  // the current survey action always carries its own on-headset instructions.
  function makeHelp() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(0.26, 0.195, 1); // match the 512x384 aspect
    // Greedy wrap `text` into lines no wider than `maxW` px. CJK-aware: Chinese has
    // no inter-word spaces, so each CJK glyph is its own break token (Latin runs stay
    // whole); a run of spaces collapses to one separator. Without this a ZH sentence
    // is one giant "word" and overflows.
    const CJK = '\\u2E80-\\u9FFF\\uF900-\\uFAFF\\uFF00-\\uFFEF';
    const tokenRe = new RegExp(`[${CJK}]|[^\\s${CJK}]+|\\s+`, 'g');
    const wrap = (text, maxW) => {
      const out = [];
      for (const para of text.split('\n')) {
        const tokens = para.match(tokenRe) || [''];
        let line = '';
        for (const tok of tokens) {
          if (/^\s+$/.test(tok)) { if (line) line += ' '; continue; } // collapse spaces
          const trial = line + tok;
          if (line && ctx.measureText(trial).width > maxW) { out.push(line.trimEnd()); line = tok; }
          else line = trial;
        }
        out.push(line.trimEnd());
      }
      return out;
    };
    const setText = (title, body, colorHex) => {
      ctx.clearRect(0, 0, 512, 384);
      ctx.fillStyle = 'rgba(15, 18, 24, 0.82)';
      ctx.beginPath();
      ctx.roundRect(6, 6, 500, 372, 14);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#' + (colorHex ?? 0xffffff).toString(16).padStart(6, '0');
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(title, 24, 22);
      ctx.fillStyle = '#cdd9e5';
      ctx.font = '28px sans-serif';
      wrap(body, 464).forEach((line, i) => ctx.fillText(line, 24, 76 + i * 36));
      tex.needsUpdate = true;
    };
    return { sprite, setText };
  }

  // Ray-aimed menus are foreground interaction surfaces. World annotations use
  // orders through 34; the sheet uses 90 and the controller HUD uses 100.
  const MENU_PANEL_RENDER_ORDER = 80;

  // S2 numpad: a canvas-textured panel you aim the controller ray at to enter
  // exact tape dimensions. Keys are hit-tested by the ray's UV on the plane (no
  // per-key meshes). Layout: a display line (field + typed value + unit) over a
  // 3x4 digit grid and a full-width ENTER row.
  function makeNumpad() {
    const W = 512, H = 720;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.30, 0.375),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    );
    // A dimension/height keypad is a foreground interaction surface just like
    // EXPORT; world marker badges (31–33) must never paint over its keys.
    mesh.renderOrder = MENU_PANEL_RENDER_ORDER;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;

    const DISP_H = 140, ROWS = 5, CELL_H = (H - DISP_H) / ROWS, COLS = 3, CELL_W = W / COLS;
    const grid = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['.', '0', 'back']];
    // Localized at draw time (⌫ is language-neutral). swap = the DIMS FLIP action.
    const keyLabel = (kid) => kid === 'back' ? '⌫'
      : kid === 'enter' ? t('key.enter')
      : kid === 'swap' ? t('key.flip')
      : kid === 'del' ? t('key.del')
      : kid;

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

    // swapLabel (optional) overrides the bottom-left SWAP cell's caption — used by
    // the aperture pad (SILL/HEAD field cycler) and the height pads (free↔floor datum
    // toggle). delLabel (optional) overrides the DEL cell. Null keeps the default
    // FLIP / DEL labels.
    function draw(title, buffer, hoverKey, swapLabel = null, delLabel = null) {
      const lbl = (kid) => (kid === 'swap' && swapLabel) ? swapLabel
        : (kid === 'del' && delLabel) ? delLabel : keyLabel(kid);
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
        ctx.fillText(lbl(kid), x + w / 2, y + h / 2 + 2);
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
  // saved, its revision, and how many rectangles it holds; empty slots read "empty". One panel is
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
    mesh.renderOrder = MENU_PANEL_RENDER_ORDER;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;

    const TITLE_H = 96, CELL_H = (H - TITLE_H) / SLOT_ROWS, CELL_W = W / SLOT_COLS;
    const ACTIONS = {
      confirm: { x: 32, y: 244, w: W - 64, h: 126 },
      cancel: { x: 32, y: 402, w: W - 64, h: 126 },
    };

    // Plane UV -> slot index (or null). Texture flipY maps canvas-top to v=1.
    function slotAt(u, v) {
      const cx = u * W, cy = (1 - v) * H;
      if (cy < TITLE_H) return null;
      const row = Math.floor((cy - TITLE_H) / CELL_H);
      const col = Math.floor(cx / CELL_W);
      if (row < 0 || row >= SLOT_ROWS || col < 0 || col >= SLOT_COLS) return null;
      return row * SLOT_COLS + col;
    }

    // Confirmation replaces the slot grid with two genuinely separate buttons.
    // The old slot is therefore not a valid target for the confirming trigger.
    function actionAt(u, v) {
      const cx = u * W, cy = (1 - v) * H;
      for (const [id, r] of Object.entries(ACTIONS)) {
        if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return id;
      }
      return null;
    }

    // metaFor(i) -> {rects, when, revision} | null ; accent is the mode's color as '#rrggbb'.
    function draw(title, accent, hoverSlot, metaFor, confirmSlot = null, hoverAction = null) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15,18,24,0.94)';
      ctx.beginPath(); ctx.roundRect(0, 0, W, H, 22); ctx.fill();
      ctx.fillStyle = accent;
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(title, 26, TITLE_H / 2);
      if (confirmSlot != null) {
        const meta = metaFor(confirmSlot);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${t('slot.slot')} ${confirmSlot + 1}`, W / 2, 142);
        if (meta) {
          ctx.fillStyle = '#8b949e';
          ctx.font = '25px sans-serif';
          ctx.fillText(`${t('sheet.revision')} ${meta.revision}  ·  ${meta.rects} ${t('slot.rects')}  ·  ${meta.when}`, W / 2, 186);
        }
        for (const [id, r] of Object.entries(ACTIONS)) {
          const hot = id === hoverAction;
          const color = id === 'confirm' ? '#ff9f43' : '#4b5563';
          ctx.fillStyle = hot ? color : (id === 'confirm' ? 'rgba(120,65,20,0.9)' : 'rgba(48,54,61,0.95)');
          ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 18); ctx.fill();
          ctx.fillStyle = hot ? '#0d1117' : '#e6edf3';
          ctx.font = 'bold 30px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(t(id === 'confirm' ? 'slot.confirmOverwrite' : 'slot.cancel'), r.x + r.w / 2, r.y + r.h / 2);
        }
        tex.needsUpdate = true;
        return;
      }
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
        ctx.fillText(`${t('slot.slot')} ${i + 1}`, x + 18, y + 14);
        if (meta) {
          ctx.fillStyle = hot ? '#0d1117' : accent;
          ctx.font = 'bold 24px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(`${t('sheet.revision')} ${meta.revision}`, x + w - 18, y + 16);
          ctx.textAlign = 'left';
          ctx.fillStyle = hot ? '#0d1117' : '#e6edf3';
          ctx.font = 'bold 32px sans-serif';
          ctx.fillText(`${meta.rects} ${t('slot.rects')}`, x + 18, y + h - 78);
          ctx.fillStyle = hot ? '#0d1117' : '#79c0ff';
          ctx.font = '24px sans-serif';
          ctx.fillText(meta.when, x + 18, y + h - 40);
        } else {
          ctx.fillStyle = hot ? '#0d1117' : '#484f58';
          ctx.font = 'italic 30px sans-serif';
          ctx.fillText(t('slot.empty'), x + 18, y + h - 56);
        }
      }
      tex.needsUpdate = true;
    }

    return { group, mesh, slotAt, actionAt, draw };
  }

  // SHEET preview: a controller-mounted panel showing one floor's to-scale plan sheet, rasterized
  // from the SAME renderer that produces the printable/downloadable SVG (src/io/planSheet.js),
  // so what you see here is what prints. redraw() re-rasters a floor and fits the plane to
  // the page aspect (portrait or landscape). Read-only — a trigger downloads the SVG.
  const SHEET_RENDER_ORDER = 90; // above world annotations/panels; below controller HUD (100)
  function makeSheetPanel() {
    const canvas = document.createElement('canvas');
    canvas.width = 1448; canvas.height = 2048; // A4 portrait; resized per render by floorToCanvas
    const makeTexture = () => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter; // NPOT canvas — no mipmaps
      texture.generateMipmaps = false;
      return texture;
    };
    let tex = makeTexture();
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      // `transparent:true` deliberately places the sheet in Three's transparent
      // pass. Its canvas is still solid white, while renderOrder makes it paint
      // after room tints, dimension labels, markers, and world-space panels.
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    mesh.renderOrder = SHEET_RENDER_ORDER;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;
    const SIZE = 0.78; // meters on the long edge; large enough to inspect while editing

    function redraw(floor, changeMap = null) {
      const oldWidth = canvas.width, oldHeight = canvas.height;
      const sheetOpts = sharedScaleSheetOptions(project.floors, {
        project, // whole-house conduit/wires span floors; sheets filter per floor
        page: 'a4',
        targetPx: 2048,
        layers: getOutputSettings(),
        ...sheetLabelOpts(), // sheet text in the chosen export language
        changeMap, // revision clouds vs the EXPORT baseline slot (null = none)
      });
      floorToCanvas(floor, canvas, sheetOpts);
      if (canvas.width !== oldWidth || canvas.height !== oldHeight) {
        // Quest Chromium/Three may retain the GPU allocation of a resized canvas,
        // leaving the old page visible or sampled at its former aspect. Replace
        // the CanvasTexture explicitly whenever portrait/landscape dimensions swap.
        const staleTexture = tex;
        tex = makeTexture();
        mesh.material.map = tex;
        mesh.material.needsUpdate = true;
        staleTexture.dispose();
      } else {
        tex.needsUpdate = true;
      }
      const aspect = canvas.width / canvas.height;
      if (aspect >= 1) mesh.scale.set(SIZE, SIZE / aspect, 1);
      else mesh.scale.set(SIZE * aspect, SIZE, 1);
    }

    return { group, mesh, canvas, get tex() { return tex; }, redraw };
  }

  // LANG menu: a small ray-aimed panel listing the languages with the active one
  // highlighted. It's driven mainly by the thumbstick (up/down moves the selection,
  // see pollModeCycle) and by trigger (advances one), so draw() just reflects the
  // current language — no per-key hit-testing beyond an optional ray pick.
  function makeLangMenu() {
    const W = 384, H = 384;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    );
    mesh.renderOrder = MENU_PANEL_RENDER_ORDER;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;

    const TITLE_H = 84, ROWS = LANG_ORDER.length, ROW_H = (H - TITLE_H) / ROWS;
    // Plane UV -> language code (or null), for an optional ray+trigger pick.
    function langAt(u, v) {
      const cy = (1 - v) * H;
      if (cy < TITLE_H) return null;
      const row = Math.floor((cy - TITLE_H) / ROW_H);
      return LANG_ORDER[row] ?? null;
    }
    function draw(accent, hoverLang) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15,18,24,0.94)';
      ctx.beginPath(); ctx.roundRect(0, 0, W, H, 22); ctx.fill();
      ctx.fillStyle = accent;
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('lang.title'), 26, TITLE_H / 2);
      const active = getLang();
      LANG_ORDER.forEach((l, i) => {
        const y = TITLE_H + i * ROW_H + 8, h = ROW_H - 16;
        const on = l === active, hot = l === hoverLang;
        ctx.fillStyle = on ? accent : (hot ? 'rgba(72,79,88,0.95)' : 'rgba(48,54,61,0.9)');
        ctx.beginPath(); ctx.roundRect(12, y, W - 24, h, 16); ctx.fill();
        ctx.fillStyle = on ? '#0d1117' : '#e6edf3';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(langLabel(l), W / 2, y + h / 2 + 2);
      });
      tex.needsUpdate = true;
    }
    return { group, mesh, langAt, draw };
  }

  // UNIT menu mirrors LANG: thumbstick up/down changes the global display/input
  // unit, while the ray and trigger can pick a specific row directly.
  function makeUnitMenu() {
    const W = 384, H = 384;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    );
    mesh.renderOrder = MENU_PANEL_RENDER_ORDER;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;

    const TITLE_H = 84, ROWS = UNIT_ORDER.length, ROW_H = (H - TITLE_H) / ROWS;
    function unitAt(u, v) {
      const cy = (1 - v) * H;
      if (cy < TITLE_H) return null;
      const row = Math.floor((cy - TITLE_H) / ROW_H);
      return UNIT_ORDER[row] ?? null;
    }
    function draw(accent, hoverUnit) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15,18,24,0.94)';
      ctx.beginPath(); ctx.roundRect(0, 0, W, H, 22); ctx.fill();
      ctx.fillStyle = accent;
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('unit.title'), 26, TITLE_H / 2);
      const active = getUnit();
      UNIT_ORDER.forEach((u, i) => {
        const y = TITLE_H + i * ROW_H + 8, h = ROW_H - 16;
        const on = u === active, hot = u === hoverUnit;
        ctx.fillStyle = on ? accent : (hot ? 'rgba(72,79,88,0.95)' : 'rgba(48,54,61,0.9)');
        ctx.beginPath(); ctx.roundRect(12, y, W - 24, h, 16); ctx.fill();
        ctx.fillStyle = on ? '#0d1117' : '#e6edf3';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(u, W / 2, y + h / 2 + 2);
      });
      tex.needsUpdate = true;
    }
    return { group, mesh, unitAt, draw };
  }

  // Unified output panel. Floor selection deliberately does not live here: every
  // preview/export targets the active LEVEL floor. Thumbstick-y switches format;
  // trigger toggles a row or presses the explicit EXPORT button.
  function makeExportMenu() {
    // Tall enough that the format + "Compare" (change-map baseline) + "Language" rows,
    // the seven layer toggles, and the download button all fit without the button
    // clipping off the bottom. The plane keeps the canvas aspect.
    const W = 512, H = 948;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.32 * H / W),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    );
    // Marker badges deliberately render above the floor overlay (31–33), so the
    // foreground export surface must paint later or those world annotations
    // bleed through its opaque-looking canvas.
    mesh.renderOrder = MENU_PANEL_RENDER_ORDER;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;

    const TOGGLES = ['planDims', 'markerDims', 'markerIcons', 'wiring', 'furniture', 'furnitureDims', 'area'];
    const BASELINE_Y = 186, BASELINE_H = 58;   // change-map "Compare" row → 186..244
    const LANG_Y = 250, LANG_H = 58;           // sheet-language row → 250..308
    const TOGGLE_Y = 322, ROW_H = 68;          // 7 layer toggles → 322..798
    const BUTTON_Y = 812, BUTTON_H = 112;      // download button → 812..924 (fits H=948)
    function actionAt(u, v) {
      const cy = (1 - v) * H;
      if (cy >= BASELINE_Y && cy < BASELINE_Y + BASELINE_H) return 'baseline';
      if (cy >= LANG_Y && cy < LANG_Y + LANG_H) return 'lang';
      if (cy >= TOGGLE_Y && cy < TOGGLE_Y + TOGGLES.length * ROW_H) {
        return TOGGLES[Math.floor((cy - TOGGLE_Y) / ROW_H)] || null;
      }
      if (cy >= BUTTON_Y && cy <= BUTTON_Y + BUTTON_H) return 'export';
      return null;
    }
    function draw(accent, hoverAction, settings, floorName, baselineLabel, langLabel) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15,18,24,0.96)';
      ctx.beginPath(); ctx.roundRect(0, 0, W, H, 24); ctx.fill();
      ctx.fillStyle = accent;
      ctx.font = 'bold 38px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${t('group.project')} · ${t('mode.export')}`, 28, 43);
      ctx.fillStyle = '#aab4c0';
      ctx.font = '25px sans-serif';
      ctx.fillText(`${t('export.active')} · ${floorName}`, 28, 99);
      ctx.fillStyle = '#e6edf3';
      ctx.font = 'bold 30px sans-serif';
      const formatLabel = settings.format === 'coohom' ? 'COOHOM DXF'
        : settings.format === 'link' ? 'LINK · 3D VIEW'
        : settings.format === 'qr' ? 'QR · 3D VIEW' : settings.format.toUpperCase();
      ctx.fillText(`${t('export.format')} · ${formatLabel}`, 28, 152);
      ctx.fillStyle = '#768390';
      ctx.font = '21px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('↑ / ↓', W - 28, 152);

      // Compare (change-map baseline) row: point at it and flick the thumbstick to
      // cycle none → each saved slot; a trigger tap also advances it. When a slot is
      // chosen, the sheet (preview + SVG/PNG) is drawn with revision clouds vs it.
      {
        const y = BASELINE_Y, h = BASELINE_H, hot = hoverAction === 'baseline';
        ctx.fillStyle = hot ? 'rgba(72,79,88,0.98)' : 'rgba(38,44,52,0.96)';
        ctx.beginPath(); ctx.roundRect(18, y, W - 36, h, 14); ctx.fill();
        ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 27px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(t('export.compare'), 40, y + h / 2 + 1);
        ctx.fillStyle = accent; ctx.font = 'bold 27px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(baselineLabel, W - 44, y + h / 2 + 1);
      }

      // Language row: point at it and flick the thumbstick (or tap) to cycle the
      // language of the exported/printed sheet text — independent of the app UI
      // language, so a sheet can be handed off in a language you don't run the app in.
      {
        const y = LANG_Y, h = LANG_H, hot = hoverAction === 'lang';
        ctx.fillStyle = hot ? 'rgba(72,79,88,0.98)' : 'rgba(38,44,52,0.96)';
        ctx.beginPath(); ctx.roundRect(18, y, W - 36, h, 14); ctx.fill();
        ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 27px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(t('export.language'), 40, y + h / 2 + 1);
        ctx.fillStyle = accent; ctx.font = 'bold 27px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(langLabel, W - 44, y + h / 2 + 1);
      }

      TOGGLES.forEach((key, i) => {
        const y = TOGGLE_Y + i * ROW_H + 5, h = ROW_H - 10;
        const hot = hoverAction === key;
        ctx.fillStyle = hot ? 'rgba(72,79,88,0.98)' : 'rgba(38,44,52,0.96)';
        ctx.beginPath(); ctx.roundRect(18, y, W - 36, h, 14); ctx.fill();
        ctx.strokeStyle = settings[key] ? accent : '#768390';
        ctx.lineWidth = 4;
        ctx.strokeRect(37, y + 14, 28, 28);
        if (settings[key]) {
          ctx.fillStyle = accent;
          ctx.font = 'bold 29px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✓', 51, y + 28);
        }
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 27px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t(`export.${key}`), 88, y + h / 2 + 1);
      });

      const hot = hoverAction === 'export';
      ctx.fillStyle = hot ? '#f8d76a' : accent;
      ctx.beginPath(); ctx.roundRect(18, BUTTON_Y, W - 36, BUTTON_H, 18); ctx.fill();
      ctx.fillStyle = '#111820';
      ctx.font = 'bold 37px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('export.action'), W / 2, BUTTON_Y + BUTTON_H / 2 + 2);
      tex.needsUpdate = true;
    }
    return { group, mesh, actionAt, draw };
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

  // Vertical offsets (m, above the tip) of the stacked controller panels,
  // bottom -> top: mode label, hover readout, instructions (help), info (debug).
  // The panels are children of the controller, so they ride its tilt (the sprites
  // themselves still billboard). Help below debug: instructions read nearest the
  // hand, the info HUD on top.
  const PANEL_Y = { label: 0.05, readout: 0.11, help: 0.26, debug: 0.46 };

  // Controller objects are resolved by input-source handedness at runtime: RIGHT is
  // the editor, while an optional LEFT is an independent sheet + teleport companion.
  // Each still owns the same child UI objects here; the frame loop exposes only the
  // children appropriate to that fixed role.
  const tipGeom = new THREE.SphereGeometry(0.012, 16, 12);
  const controllers = [];
  const controllerTips = [];
  const labels = [];
  const debugs = [];
  const readouts = []; // per-controller dimension-value pill (shown on ray hover)
  const helps = [];    // per-controller mode explanation box
  for (const i of [0, 1]) {
    const c = renderer.xr.getController(i); // target-ray space: -Z is the pointing dir
    c.userData.uiIndex = i;
    const tip = new THREE.Mesh(tipGeom, new THREE.MeshBasicMaterial({ color: ACCENT }));
    tip.position.copy(TIP_OFFSET);
    c.add(tip);
    controllerTips.push(tip);
    const label = makeLabel();
    label.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + PANEL_Y.label, TIP_OFFSET.z);
    label.sprite.renderOrder = HUD_ORDER; // controller UI paints over every world overlay (zebra etc.)
    c.add(label.sprite);
    labels.push(label);
    // A larger pill above the mode label that shows the value of whichever
    // constraint the ray is pointing at — a legible "close-up" of small in-world
    // dimension text. Hidden until the ray hovers a dimension.
    const readout = makeLabel();
    readout.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + PANEL_Y.readout, TIP_OFFSET.z);
    readout.sprite.scale.set(0.2, 0.05, 1);
    readout.sprite.visible = false;
    readout.sprite.renderOrder = HUD_ORDER;
    c.add(readout.sprite);
    readouts.push(readout);
    // Instructions (help) box sits BELOW the info (debug) HUD; info reads on top.
    const help = makeHelp(); // mode instructions
    help.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + PANEL_Y.help, TIP_OFFSET.z);
    help.sprite.renderOrder = HUD_ORDER;
    c.add(help.sprite);
    helps.push(help);
    const dbg = makeDebug(); // debug HUD (info panel), above the instructions box
    dbg.sprite.position.set(TIP_OFFSET.x, TIP_OFFSET.y + PANEL_Y.debug, TIP_OFFSET.z);
    dbg.sprite.renderOrder = HUD_ORDER;
    c.add(dbg.sprite);
    debugs.push(dbg);
    c.addEventListener('select', onSelect);   // trigger: run current mode
    c.addEventListener('squeezestart', onSqueezeStart); // grip press: begin a grip-drag if over a target
    c.addEventListener('squeeze', onReset);   // grip: undo placement (unless a grip-drag ran)
    c.addEventListener('squeezeend', onSqueezeEnd);     // grip release: end the grip-drag
    // Remember which XRInputSource drives this indexed controller object; handedness
    // (not recent activity) assigns its fixed role in the frame loop.
    c.addEventListener('connected', (e) => { c.userData.inputSource = e.data; });
    c.addEventListener('disconnected', () => { c.userData.inputSource = null; });
    scene.add(c);
    controllers.push(c);
  }
  const lastTouch = new THREE.Vector3(NaN, NaN, NaN);

  // Head-locked notice shown when NO physical controller drives the editor — i.e.
  // the controllers were set down and the headset fell back to hand tracking. The
  // survey UI is controller-only (isControllerSource gates every editing event),
  // so instead of going silently blank we prompt the user to pick a controller
  // back up. Positioned in front of the headset each frame it is visible.
  const handPrompt = makeHelp();
  handPrompt.sprite.renderOrder = HUD_ORDER;
  handPrompt.sprite.scale.set(0.22, 0.11, 1); // shorter than a help box — two lines
  handPrompt.sprite.visible = false;
  scene.add(handPrompt.sprite);

  // Floor-target rings. The main one follows the RIGHT editor and recolors with its
  // current mode. The cyan one belongs permanently to the optional LEFT companion
  // and is always a teleport target.
  const RETICLE_OUTER = 0.08; // m; also the EDGE-pick radius (edge must fall in the ring)
  const reticleGeom = new THREE.RingGeometry(0.06, RETICLE_OUTER, 32).rotateX(-Math.PI / 2);
  const reticleMaterial = (color) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.6,
    // The active storey may be above or below the user's physical storey. Keep the
    // ring visible from either side of that plane; normal depth ordering lets it
    // remain subtly visible through the translucent floor overlay when seen below.
    side: THREE.DoubleSide, depthWrite: false,
  });
  const reticle = new THREE.Mesh(reticleGeom, reticleMaterial(ACCENT));
  reticle.visible = false;
  scene.add(reticle);
  const leftTeleportReticle = new THREE.Mesh(reticleGeom, reticleMaterial(C_TELEPORT));
  leftTeleportReticle.visible = false;
  scene.add(leftTeleportReticle);

  // Highlights for the survey edge you're pointing at (magenta) or have locked
  // (yellow) — a strip drawn along that edge, just above the floor. Two of them so
  // DIMS can show both picked references (edge A and edge B) at once.
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
      ctx.font = `bold ${String(txt).length > 1 ? 58 : 82}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, 64, 72);
      tex.needsUpdate = true;
    }
    scene.add(sprite);
    return { sprite, setText };
  }
  const C_WALL1 = '#22d3ee', C_WALL2 = '#a78bfa'; // RECAL wall-1 (cyan) / wall-2 (purple)
  const recalBadge1 = makeBadge(); recalBadge1.setText('W1', C_WALL1); // rides wall 1
  const recalBadge2 = makeBadge(); recalBadge2.setText('W2', C_WALL2); // rides wall 2
  const recalStep = makeBadge();                                      // rides the reticle (current step)

  // Whole-zone outline highlight for PLAN mode (the room/wall under your ray). All
  // four edges in one buffer (4 edges * 2 triangles * 3 verts = 24 verts / 72 floats).
  const rectHi = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(72), 3)),
    new THREE.MeshBasicMaterial({ color: 0x51d88a, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
  );
  rectHi.renderOrder = 11;
  rectHi.visible = false;
  rectHi.frustumCulled = false; // positions rewritten each frame (see makeEdgeHi note)
  scene.add(rectHi);

  // Zebra fill for the SELECTED zone in PLAN mode: a seamless 45° diagonal stripe
  // texture over the whole rectangle, so the active selection reads instantly and
  // distinctly from the op-colored outline. Tiles at a constant world size (repeat
  // is set per-frame from the zone's dimensions), so stripes stay the same width
  // whatever the zone's size.
  const ZEBRA_PERIOD = 0.6; // m of plan covered by one texture tile (4 stripe pairs)
  // The white stripe texture is multiplied by the selected zone's kind color per
  // frame (see showZebra), matching the shared palette in zoneColors.js.
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
  // corner under the pointer (cyan) before you lock it, then rides the locked
  // corner (purple) while you touch the edge direction.
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
    // Canvas panels and HUD sprites are transparent-pass objects. Keep the pointer
    // in that same pass: an opaque pointer is rendered before every transparent
    // panel regardless of renderOrder, so the panel can paint over its own cursor.
    new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
  );
  // The ray-hit pointer is the final overlay: above menus (80), companion sheet
  // (90), and controller HUD (100), so every interactive panel shows its aim point.
  numpadCursor.renderOrder = 110;
  numpadCursor.visible = false;
  scene.add(numpadCursor);

  // SAVE/LOAD slot menu panel (shares numpadCursor as its ray-hit dot).
  const slotMenu = makeSlotMenu();
  scene.add(slotMenu.group);

  // LANG language-switch panel (shares numpadCursor as its ray-hit dot).
  const langMenu = makeLangMenu();
  scene.add(langMenu.group);

  // UNIT display/input-unit panel (shares numpadCursor as its ray-hit dot).
  const unitMenu = makeUnitMenu();
  scene.add(unitMenu.group);

  // Unified SVG/PNG/DXF/JSON options + explicit export action.
  const exportMenu = makeExportMenu();
  scene.add(exportMenu.group);

  // SHEET plan-preview panel (a rasterized to-scale sheet; read-only).
  const sheetPanel = makeSheetPanel();
  scene.add(sheetPanel.group);

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
  // LEVEL exposes one pseudo-selection above the highest real floor. It leaves
  // activeFloorId untouched and renders the complete stack. Architectural editing
  // stays locked there, but whole-house conduit/wire tools remain available.
  let allFloorsView = false;

  // Marker glyphs (wall-anchored annotations) live in their own group under planGroup
  // so they ride the plan's yaw + per-floor elevation for free. buildPlan clears the
  // rest of planGroup every rebuild but SKIPS this group; buildMarkers repopulates it.
  const markerGroup = new THREE.Group();
  planGroup.add(markerGroup);
  // Derived switch-leg routes share the plan transform but are rebuilt separately
  // from massing geometry and shown only while MARKER · LINK is active.
  const electricalGroup = new THREE.Group();
  electricalGroup.visible = false;
  planGroup.add(electricalGroup);
  // The conduit network (segments + node handles), drawn in the CONDUIT modes.
  // Rebuilt on demand like the groups above, not by clearPlanGeometry.
  const conduitGroup = new THREE.Group();
  conduitGroup.visible = false;
  planGroup.add(conduitGroup);
  // Wires routed over the conduit network, drawn per-segment by inferred surface in
  // MARKER · WIRE. Rebuilt on demand like the groups above, not by clearPlanGeometry.
  const routedWireGroup = new THREE.Group();
  routedWireGroup.visible = false;
  planGroup.add(routedWireGroup);
  const pipeGroup = new THREE.Group();
  pipeGroup.visible = false;
  planGroup.add(pipeGroup);
  // Cross-floor authoring targets: in a single-floor view the floor directly above/below
  // is dimmed at its true height. ALL FLOORS already renders every marker/node directly,
  // so it does not need this duplicate target layer.
  const adjacentGroup = new THREE.Group();
  adjacentGroup.visible = false;
  planGroup.add(adjacentGroup);
  // Furniture GLBs (real-scale product models, e.g. IKEA "rotera" models) live in
  // their own group under planGroup so they ride the plan's yaw + per-floor elevation
  // for free — a parallel lane like markers, never touching the boolean/extrude/solver
  // pipeline. Async-loaded and skipped by clearPlanGeometry (see buildFurniture).
  const furnitureGroup = new THREE.Group();
  planGroup.add(furnitureGroup);
  // Vertical (Z) dimensions: a static height readout for any object whose height is
  // DEFINED (zDatum set). Its own group under planGroup — always visible like the X/Y dim
  // lines, rebuilt by buildMarkers, and NON-interactive (height is typed on the pad, never
  // dragged). The flat plan can't show Z, but in AR we're in 3D, so this is a slim
  // vertical bar from the floor up to the object plus a value label at mid-height. Each
  // dim takes the COLOR OF THE PIECE IT MARKS, matching that piece's X/Y dims: markers
  // amber, conduit nodes cyan, apertures (door/window/half-wall/…) blue.
  const zDimGroup = new THREE.Group();
  planGroup.add(zDimGroup);
  const C_MARKER = 0xff9f43; // outlet accent (orange) when not yet fully pinned
  const markerFloorGeom = new THREE.PlaneGeometry(0.10, 0.10).rotateX(-Math.PI / 2);

  // Merged room free-space fill (the boolean footprint). Tinted the room-blue from
  // the shared palette; subtract zones carve holes here and get their own kind-color
  // fill drawn on top (see addZoneFills).
  const fillMat = new THREE.MeshBasicMaterial({
    color: zoneColorHex('room'), transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false,
  });
  // Per-kind edge (outline) + zone-fill materials, cached so a rebuild reuses them
  // (bounded to the six kinds x rest/active). Resting = the kind's palette color;
  // active (the zone EDGE mode edits) = a lightened tint, brighter and on top.
  const edgeMatCache = new Map();
  const edgeMat = (kind, active) => {
    const key = `${kind}:${active ? 1 : 0}`;
    let m = edgeMatCache.get(key);
    if (!m) {
      const c = active ? lightenHex(zoneColorHex(kind)) : zoneColorHex(kind);
      m = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, depthWrite: false });
      edgeMatCache.set(key, m);
    }
    return m;
  };
  const zoneFillMatCache = new Map();
  const zoneFillMat = (kind) => {
    let m = zoneFillMatCache.get(kind);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color: zoneColorHex(kind), transparent: true, opacity: 0.18,
        side: THREE.DoubleSide, depthWrite: false,
      });
      zoneFillMatCache.set(kind, m);
    }
    return m;
  };
  // Edges are drawn as thin FLOOR STRIPS (flat quads) rather than 1px GL lines, so
  // they read bold at 1:1. Materials are MeshBasic; DoubleSide so they show from
  // any angle. depthWrite off so stacked strips/fill don't z-fight.
  const EDGE_HALF = 0.005;   // strip half-width -> 1 cm resting edge
  const EDGE_HI_HALF = 0.01; // half-width for hover/lock highlights -> 2 cm, bolder than rest
  // Zone edges are colored per kind via edgeMat() above (room=blue, wall=red, …),
  // so you can tell zone types apart at a glance; the active zone uses a lightened
  // tint. lockedMat is the one exception: WHITE marks a fully-pinned edge.
  const lockedMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false });    // WHITE: an edge whose axis is fully pinned (position+size)
  // Dimension (constraint) annotations: thin blue floor strips for the dim/extension
  // lines, orange for outlet-to-wall pins, and red when a constraint conflicts.
  // Values are shown on billboarded labels.
  const dimMat = new THREE.MeshBasicMaterial({ color: 0x79c0ff, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  const markerDimMat = new THREE.MeshBasicMaterial({ color: C_MARKER, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
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
  function edgeLine(ref, rectangles = project.rectangles) {
    if (!ref || ref.rect === ORIGIN_ID) return null;
    const r = rectangles.find((x) => x.id === (ref.rect.id ?? ref.rect));
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
  const DIM_DOT = 0.006;    // m, near-square dot along an outside-panel leader
  const DIM_DOT_GAP = 0.024; // m, gap between leader dots

  // Dimension value labels currently in the plan, for ray-hover pick (their value
  // is echoed big on the controller). Rebuilt with the plan each edit.
  let dimSprites = [];

  // Every planGroup child produced by the active-floor buildDimensions pass (dashed
  // line meshes + value sprites). Tracked so a dim grip-drag can rebuild ONLY the
  // dimensions (see rebuildDimsOnly) instead of the whole plan — dragging a value box
  // is purely presentational, so the footprint boolean, zone fills, edge strips,
  // marker textures, and electrical routes never need to be recomputed per frame.
  let dimObjects = [];

  // Dimension value labels are drawn in BATCHES, not one Sprite each. WebXR in this
  // three.js build renders every object once per eye (no multiview), so the owner's
  // ~400-label ground floor cost ~800 draw calls and halved the Quest frame rate.
  //  - Each distinct text+color is painted once into a slot of a shared atlas page
  //    (a 2048x1024 CanvasTexture, 8x16 slots of the old 256x64 label canvas).
  //  - makeDimLabel returns an invisible PROXY Object3D carrying the position, scale
  //    and userData (dimText, cId, refA, refB) that picking, hover echo and grip-drag
  //    read; addDimLabelBatch draws a set of proxies as one billboard mesh per page.
  //  - Editing a value paints its new text once (one page upload); a grip-drag keeps
  //    its text, so it only rebuilds the batch quads. Stale slots are dropped by
  //    resetDimLabelAtlas() at the start of a full buildPlan once pages pile up,
  //    because that rebuild recreates every batch (plan dims AND Z-dims).
  const DIM_LABEL_W = 256, DIM_LABEL_H = 64, ATLAS_W = 2048, ATLAS_H = 1024;
  const ATLAS_COLS = ATLAS_W / DIM_LABEL_W, ATLAS_SLOTS = ATLAS_COLS * (ATLAS_H / DIM_LABEL_H);
  const labelAtlas = { pages: [], slots: new Map() }; // slots: `${text}|${color}` -> { page, u0, v0 }
  function labelAtlasPage() {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_W; canvas.height = ATLAS_H;
    const texture = new THREE.CanvasTexture(canvas);
    const material = makeBillboardMaterial(texture);
    const page = { canvas, ctx: canvas.getContext('2d'), texture, material, used: 0, dirty: false };
    labelAtlas.pages.push(page);
    return page;
  }
  // Camera-facing quads batched in one mesh, sampling `texture`: the vertex shader
  // offsets each corner in VIEW space like THREE.Sprite, so every quad faces the
  // viewer. Same output path as the SpriteMaterial it replaces (tone mapping + color
  // space). Geometry: position = quad centre (x4), corner = metres offset, uv.
  function makeBillboardMaterial(texture) {
    return new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: `
        attribute vec2 corner; // label-local offset in metres (already scaled)
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          mv.xy += corner; // view-aligned billboard, like THREE.Sprite
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          if (c.a < 0.004) discard;
          gl_FragColor = c;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
  }
  function dimLabelSlot(text, color) {
    const key = `${text}|${color}`;
    let slot = labelAtlas.slots.get(key);
    if (slot) return slot;
    let page = labelAtlas.pages.at(-1);
    if (!page || page.used >= ATLAS_SLOTS) page = labelAtlasPage();
    const i = page.used++;
    const x = (i % ATLAS_COLS) * DIM_LABEL_W, y = Math.floor(i / ATLAS_COLS) * DIM_LABEL_H;
    const ctx = page.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(15, 18, 24, 0.82)';
    ctx.beginPath(); ctx.roundRect(6, 14, 244, 36, 10); ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    ctx.restore();
    page.dirty = true;
    // Canvas y runs down; texture v runs up (flipY), so a slot's top row is v = 1 - y/H.
    slot = { page, u0: x / ATLAS_W, u1: (x + DIM_LABEL_W) / ATLAS_W,
      v0: 1 - (y + DIM_LABEL_H) / ATLAS_H, v1: 1 - y / ATLAS_H };
    labelAtlas.slots.set(key, slot);
    return slot;
  }
  // Drop every slot once more than two pages exist. Only call where every label batch
  // is about to be rebuilt (buildPlan with dims), or live batches would show garbage.
  function resetDimLabelAtlas() {
    if (labelAtlas.pages.length <= 2) return;
    for (const page of labelAtlas.pages) { page.texture.dispose(); page.material.dispose(); }
    labelAtlas.pages = [];
    labelAtlas.slots.clear();
  }
  // One billboard mesh per atlas page for `proxies` (makeDimLabel results, positioned
  // in `parent`'s space), added to `parent`. Returns the meshes (for disposal tracking).
  function addDimLabelBatch(proxies, parent, renderOrder = 0) {
    const byPage = new Map();
    for (const proxy of proxies) {
      const slot = dimLabelSlot(proxy.userData.dimText, proxy.userData.dimColor);
      const list = byPage.get(slot.page) ?? byPage.set(slot.page, []).get(slot.page);
      list.push([proxy, slot]);
    }
    const meshes = [];
    for (const [page, list] of byPage) {
      const pos = [], corner = [], uv = [], index = [];
      for (const [proxy, slot] of list) {
        const base = pos.length / 3;
        const hx = proxy.scale.x / 2, hy = proxy.scale.y / 2;
        for (const [cx, cy, u, v] of [[-hx, -hy, slot.u0, slot.v0], [hx, -hy, slot.u1, slot.v0],
          [hx, hy, slot.u1, slot.v1], [-hx, hy, slot.u0, slot.v1]]) {
          pos.push(proxy.position.x, proxy.position.y, proxy.position.z);
          corner.push(cx, cy);
          uv.push(u, v);
        }
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.setIndex(index);
      const mesh = new THREE.Mesh(geometry, page.material); // page material: shared, never disposed here
      mesh.frustumCulled = false; // quads extend past their centre points
      mesh.renderOrder = renderOrder;
      mesh.userData.dimLabelBatch = true;
      parent.add(mesh);
      meshes.push(mesh);
      if (page.dirty) { page.texture.needsUpdate = true; page.dirty = false; }
    }
    return meshes;
  }

  // A billboarded value label at a plan point: an invisible proxy (see above) that the
  // caller hands to addDimLabelBatch once its final position is set.
  function makeDimLabel(text, color, px, py) {
    const proxy = new THREE.Object3D();
    proxy.scale.set(0.16, 0.04, 1);
    proxy.position.set(px, 0.04, -py); // plan (x,y) -> local (x,0,-y), lifted 4 cm
    proxy.userData.dimText = text;     // the value, echoed on the controller on hover
    proxy.userData.dimColor = color;
    return proxy;
  }

  // Draw every distance constraint of one floor into planGroup: a dim line between
  // the two edges (offset outward), extension lines, and the value label. `elevation`
  // is zero for the editable active-floor view and the floor's stacked elevation in
  // the read-only ALL FLOORS view. Only the active view publishes pickable labels.
  function buildDimensions(floor = project.activeFloor, elevation = 0, selectable = true) {
    const segs = [];        // {ax,ay,bx,by,conflict,marker?} strips to build
    const floorDimSprites = [];
    if (selectable) { dimSprites = []; dimObjects = []; } // value labels for hover pick + rebuild-dims-only tracking
    // A dim value label carries its constraint id + both refs, so ray-hovering it can
    // highlight that constraint's edges and selecting it loads the constraint to edit.
    const endpointToRef = (ep) => ep.marker
      ? { kind: 'marker', markerId: ep.marker }
      : ep.node
        ? { kind: 'node', nodeId: ep.node }
        : ep.rect === ORIGIN_ID
          ? { kind: 'origin' }
          : { kind: 'edge', rectId: ep.rect, edge: ep.edge };
    const pushDim = (sprite, c) => {
      sprite.userData.cId = c.id;
      sprite.userData.refA = endpointToRef(c.a);
      sprite.userData.refB = endpointToRef(c.b);
      floorDimSprites.push(sprite);
      if (selectable) dimSprites.push(sprite);
    };
    // When a value box is dragged beyond the measured span (labelT outside 0..1),
    // join the nearer endpoint to the label with a DOTTED leader so the connection
    // cannot be mistaken for the dashed span where the distance actually applies.
    // Mirrors the plan sheet's drawLabelLeader.
    const pushLeader = (a0, a1, aLabel, perp, axis, flags) => {
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      let from;
      if (aLabel < lo) from = lo;
      else if (aLabel > hi) from = hi;
      else return;
      if (axis === 'x') segs.push({ ax: from, ay: perp, bx: aLabel, by: perp, ...flags, dotted: true });
      else segs.push({ ax: perp, ay: from, bx: perp, by: aLabel, ...flags, dotted: true });
    };
    let xTier = 0, yTier = 0;
    for (const c of (floor.constraints || [])) {
      if (c.type !== 'distance') continue;
      if (isMarkerConstraint(c)) {
        // Outlet pin: draw directly from its wall edge to its projected floor
        // coordinate. The outlet is the dependent endpoint; changing the value
        // moves it while the wall stays fixed.
        const markerEnd = c.a.marker ? c.a : c.b;
        const edgeEnd = c.a.marker ? c.b : c.a;
        const marker = floor.markers.find((m) => m.id === markerEnd.marker);
        const le = edgeLine(edgeEnd, floor.rectangles);
        if (!marker || !le) continue;
        const conflict = !!c.conflict;
        const text = `${fmt(Math.abs(c.value))} ${unitLabel()}`;
        const color = conflict ? '#ff5c5c' : '#ff9f43';
        const tick = 0.045;
        if (c.axis === 'x') {
          const yLine = c.offset != null ? c.offset : marker.y;
          segs.push({ ax: le.coord, ay: yLine, bx: marker.x, by: yLine, conflict, marker: true });
          segs.push({ ax: le.coord, ay: marker.y - tick, bx: le.coord, by: yLine + tick, conflict, marker: true });
          segs.push({ ax: marker.x, ay: marker.y - tick, bx: marker.x, by: yLine + tick, conflict, marker: true });
          const lx = dimLabelCoord(c, le.coord, marker.x);
          pushLeader(le.coord, marker.x, lx, yLine, 'x', { conflict, marker: true });
          pushDim(makeDimLabel(text, color, lx, yLine), c);
        } else {
          const xLine = c.offset != null ? c.offset : marker.x;
          segs.push({ ax: xLine, ay: le.coord, bx: xLine, by: marker.y, conflict, marker: true });
          segs.push({ ax: marker.x - tick, ay: le.coord, bx: xLine + tick, by: le.coord, conflict, marker: true });
          segs.push({ ax: marker.x - tick, ay: marker.y, bx: xLine + tick, by: marker.y, conflict, marker: true });
          const ly = dimLabelCoord(c, le.coord, marker.y);
          pushLeader(le.coord, marker.y, ly, xLine, 'y', { conflict, marker: true });
          pushDim(makeDimLabel(text, color, xLine, ly), c);
        }
        continue;
      }
      if (isNodeConstraint(c)) {
        // Conduit-node pin: draw from its wall edge to the bare junction's plan point,
        // like an outlet pin. Cyan label marks it as conduit (vs the amber outlet pin).
        const nodeEnd = c.a.node ? c.a : c.b;
        const edgeEnd = c.a.node ? c.b : c.a;
        const node = project.conduitNodes.find((n) => n.id === nodeEnd.node);
        const le = edgeLine(edgeEnd, floor.rectangles);
        if (!node || node.markerId || !le) continue; // marker-bound nodes aren't pinned
        const conflict = !!c.conflict;
        const text = `${fmt(Math.abs(c.value))} ${unitLabel()}`;
        const color = conflict ? '#ff5c5c' : '#22d3ee';
        const tick = 0.045;
        if (c.axis === 'x') {
          const yLine = c.offset != null ? c.offset : node.y;
          segs.push({ ax: le.coord, ay: yLine, bx: node.x, by: yLine, conflict, marker: true });
          segs.push({ ax: le.coord, ay: node.y - tick, bx: le.coord, by: yLine + tick, conflict, marker: true });
          segs.push({ ax: node.x, ay: node.y - tick, bx: node.x, by: yLine + tick, conflict, marker: true });
          const lx = dimLabelCoord(c, le.coord, node.x);
          pushLeader(le.coord, node.x, lx, yLine, 'x', { conflict, marker: true });
          pushDim(makeDimLabel(text, color, lx, yLine), c);
        } else {
          const xLine = c.offset != null ? c.offset : node.x;
          segs.push({ ax: xLine, ay: le.coord, bx: xLine, by: node.y, conflict, marker: true });
          segs.push({ ax: node.x - tick, ay: le.coord, bx: xLine + tick, by: le.coord, conflict, marker: true });
          segs.push({ ax: node.x - tick, ay: node.y, bx: xLine + tick, by: node.y, conflict, marker: true });
          const ly = dimLabelCoord(c, le.coord, node.y);
          pushLeader(le.coord, node.y, ly, xLine, 'y', { conflict, marker: true });
          pushDim(makeDimLabel(text, color, xLine, ly), c);
        }
        continue;
      }
      const aOrigin = c.a.rect === ORIGIN_ID, bOrigin = c.b.rect === ORIGIN_ID;
      // Edge<->origin position lock: draw a dim from the origin axis (coord 0) to the
      // edge, so the lock is visible (desktop skips it; the AR survey needs to see it).
      if (aOrigin || bOrigin) {
        const eref = aOrigin ? c.b : c.a;
        const le = edgeLine(eref, floor.rectangles);
        if (!le) continue;
        const conflict = !!c.conflict;
        const text = `${fmt(Math.abs(c.value))} ${unitLabel()}`;
        const color = conflict ? '#ff5c5c' : '#79c0ff';
        if (isXEdge(eref.edge)) {
          const yLine = c.offset != null ? c.offset : (le.p0.y + le.p1.y) / 2; // grip-drag pins offset
          segs.push({ ax: 0, ay: yLine, bx: le.coord, by: yLine, conflict });            // origin -> edge line
          segs.push({ ax: le.coord, ay: le.p0.y, bx: le.coord, by: le.p1.y, conflict }); // tick along the edge
          const lx = dimLabelCoord(c, 0, le.coord);
          pushLeader(0, le.coord, lx, yLine, 'x', { conflict });
          pushDim(makeDimLabel(text, color, lx, yLine), c);
        } else {
          const xLine = c.offset != null ? c.offset : (le.p0.x + le.p1.x) / 2;
          segs.push({ ax: xLine, ay: 0, bx: xLine, by: le.coord, conflict });            // origin -> edge line
          segs.push({ ax: le.p0.x, ay: le.coord, bx: le.p1.x, by: le.coord, conflict }); // tick along the edge
          const ly = dimLabelCoord(c, 0, le.coord);
          pushLeader(0, le.coord, ly, xLine, 'y', { conflict });
          pushDim(makeDimLabel(text, color, xLine, ly), c);
        }
        continue;
      }
      const la = edgeLine(c.a, floor.rectangles), lb = edgeLine(c.b, floor.rectangles);
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
        const lx = dimLabelCoord(c, xa, xb);
        pushLeader(xa, xb, lx, yLine, 'x', { conflict });
        pushDim(makeDimLabel(text, color, lx, yLine), c);
      } else {
        const ya = la.coord, yb = lb.coord;
        const xBase = Math.max(la.p1.x, lb.p1.x);
        const xLine = c.offset != null ? xBase + c.offset : xBase + DIM_OFFSET + (yTier++) * DIM_TIER;
        segs.push({ ax: xLine, ay: ya, bx: xLine, by: yb, conflict });            // dim line
        segs.push({ ax: la.p1.x, ay: ya, bx: xLine + DIM_EXT_OVER, by: ya, conflict }); // ext a
        segs.push({ ax: lb.p1.x, ay: yb, bx: xLine + DIM_EXT_OVER, by: yb, conflict }); // ext b
        const ly = dimLabelCoord(c, ya, yb);
        pushLeader(ya, yb, ly, xLine, 'y', { conflict });
        pushDim(makeDimLabel(text, color, xLine, ly), c);
      }
    }
    // Build strips in separate plan/outlet/conflict batches so each domain keeps
    // its visual identity without allocating one material per segment.
    for (const style of ['plan', 'marker', 'conflict']) {
      const arr = [];
      const tri = (p) => arr.push(p[0], 0, -p[1]);
      // Emit a segment as a row of dashes (thin quads) so dim lines read as dashed
      // and don't visually cover the solid room edges underneath.
      const pushPattern = (ax, ay, bx, by, dash, gap) => {
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-6) return;
        const ux = (bx - ax) / len, uy = (by - ay) / len, period = dash + gap;
        for (let t = 0; t < len; t += period) {
          const t2 = Math.min(t + dash, len);
          const cc = stripCorners(ax + ux * t, ay + uy * t, ax + ux * t2, ay + uy * t2, DIM_T);
          tri(cc[0]); tri(cc[1]); tri(cc[2]);
          tri(cc[0]); tri(cc[2]); tri(cc[3]);
        }
      };
      for (const s of segs) {
        const segmentStyle = s.conflict ? 'conflict' : s.marker ? 'marker' : 'plan';
        if (segmentStyle !== style) continue;
        pushPattern(s.ax, s.ay, s.bx, s.by,
          s.dotted ? DIM_DOT : DIM_DASH,
          s.dotted ? DIM_DOT_GAP : DIM_GAP);
      }
      if (!arr.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const material = style === 'conflict' ? dimConflictMat : style === 'marker' ? markerDimMat : dimMat;
      const m = new THREE.Mesh(geo, material);
      m.position.y = elevation + 0.008; // above this floor's edge strips
      m.renderOrder = 12;
      planGroup.add(m);
      if (selectable) dimObjects.push(m);
    }
    for (const s of floorDimSprites) {
      s.position.y += elevation;
      planGroup.add(s); // invisible proxy: pick position + userData
      if (selectable) dimObjects.push(s);
    }
    for (const mesh of addDimLabelBatch(floorDimSprites, planGroup)) if (selectable) dimObjects.push(mesh);
  }

  // Rebuild ONLY the active floor's dimensions in place — the cheap path for a live
  // dim grip-drag. Removes the tracked dim meshes, label proxies and label batches
  // (geometry is per-build, so dispose it; batch materials are the shared atlas pages)
  // and re-runs buildDimensions, leaving the footprint/strips/markers/electrical
  // untouched. sheetDirty is set so the optional left-hand sheet still refreshes.
  function rebuildDimsOnly() {
    for (const o of dimObjects) {
      planGroup.remove(o);
      o.geometry?.dispose(); // label batches share their atlas page material — never dispose it here
    }
    dimObjects = [];
    buildDimensions(project.activeFloor);
    sheetDirty = true;
  }

  // Edges whose axis is FULLY pinned — both edges on that axis connect to the plan
  // ORIGIN through the constraint graph (so position is tied to the datum AND the
  // size between them is fixed). Returned as a Set of `${rectId}:${edge}`; these
  // render white. Computed per axis via union-find over edge-coordinate nodes.
  function lockedEdges(floor = project.activeFloor) {
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
    for (const c of floor.constraints) {
      if (c.type !== 'distance') continue;
      const aOrigin = c.a.rect === ORIGIN_ID, bOrigin = c.b.rect === ORIGIN_ID;
      const ax = axisOf(aOrigin ? c.b.edge : c.a.edge); // axis from the non-origin endpoint
      union(aOrigin ? `O:${ax}` : `${c.a.rect}:${c.a.edge}`,
            bOrigin ? `O:${ax}` : `${c.b.rect}:${c.b.edge}`);
    }
    const white = new Set();
    const pinned = (rid, e, ax) => parent.has(`${rid}:${e}`) && find(`${rid}:${e}`) === find(`O:${ax}`);
    for (const r of floor.rectangles) {
      if (pinned(r.id, 'left', 'x') && pinned(r.id, 'right', 'x')) { white.add(`${r.id}:left`); white.add(`${r.id}:right`); }
      if (pinned(r.id, 'bottom', 'y') && pinned(r.id, 'top', 'y')) { white.add(`${r.id}:bottom`); white.add(`${r.id}:top`); }
    }
    return white;
  }

  // `withDims=false` skips buildDimensions AND buildMarkers/buildElectricalLinks — the
  // per-frame marker/electrical rebuild creates a CanvasTexture per glyph, the dominant
  // cost. The live edge drag passes false to freeze those (their groups aren't cleared
  // here, so they stay visible at their pre-drag spots) but then re-runs buildDimensions
  // itself, so dimensions stay live and cheap (constant values => existing atlas slots).
  // onSqueezeEnd's full rebuild brings markers/electrical back to their solved positions.
  function clearPlanGeometry() {
    // Clear any previous geometry. Dispose per-rebuild geometry/sprite materials; dim
    // label batches use the shared atlas page materials (see addDimLabelBatch).
    for (const child of [...planGroup.children]) {
      if (child === markerGroup || child === electricalGroup || child === conduitGroup || child === routedWireGroup || child === pipeGroup || child === furnitureGroup) continue; // rebuilt separately below
      planGroup.remove(child);
      child.geometry?.dispose();
      if (child.isSprite) child.material.dispose();
    }
    dimSprites = [];
  }

  // Two-triangle fill quad for the full extent of each rectangle, in planGroup-local
  // coords (plan (x,y) -> (x,0,-y)). Used for the faint per-kind zone tint.
  function rectFillGeo(rects) {
    const arr = [];
    const tri = (x, y) => arr.push(x, 0, -y);
    for (const r of rects) {
      const b = r.bounds;
      tri(b.x0, b.y0); tri(b.x1, b.y0); tri(b.x1, b.y1);
      tri(b.x0, b.y0); tri(b.x1, b.y1); tri(b.x0, b.y1);
    }
    if (!arr.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return geo;
  }

  // Faint per-kind tint under every SUBTRACT zone (room free-space is already tinted
  // by the merged footprint fill). Each kind sits on its own paper-thin y-tier so the
  // coplanar translucent quads don't z-fight, all below the 0.004 edge strips.
  const addZoneFills = (floor, elevation) => {
    const byKind = new Map();
    for (const r of floor.rectangles) {
      if (r.op !== 'subtract') continue; // rooms come from the footprint fill
      const k = zoneKind(r);
      (byKind.get(k) ?? byKind.set(k, []).get(k)).push(r);
    }
    for (const [k, rects] of byKind) {
      const geo = rectFillGeo(rects);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, zoneFillMat(k));
      mesh.position.y = elevation + 0.001 + ZONE_KINDS.indexOf(k) * 0.0003;
      planGroup.add(mesh);
    }
  };

  // Plan symbols for the aperture zones (door swing, window casement, half-wall
  // hatch), drawn as thin floor strips so AR and the printed sheet stay legible
  // side by side. Segments come from the SAME shared module the sheet/DXF use, so
  // the three surfaces can't drift. Each glyph strip is a flat quad per segment
  // with a proper perpendicular (the door arc segments aren't axis-aligned).
  const APERTURE_GLYPH_HALF = 0.006; // 1.2 cm strip
  const addApertureGlyphs = (floor, elevation) => {
    const byKind = new Map();
    for (const r of floor.rectangles) {
      const k = zoneKind(r);
      if (!isAperture(k)) continue;
      (byKind.get(k) ?? byKind.set(k, []).get(k)).push(r);
    }
    for (const [k, rects] of byKind) {
      const arr = [];
      for (const r of rects) {
        const b = r.bounds, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
        const { hingeEnd, perp } = resolveApertureOrient(r, b.x0, b.x1, b.y0, b.y1);
        const segs = k === 'door' ? doorSwingSegments(bw, bh, hingeEnd, { perp })
          : k === 'garage' ? garageDoorSegments(bw, bh, { depth: 2.10, side: 0.15, perp })
          : k === 'sliding' ? slidingDoorSegments(bw, bh, hingeEnd, { over: 0.10, perp })
            : k === 'window' ? windowCasementSegments(bw, bh, hingeEnd)
              : k === 'heater' ? heaterFinSegments(bw, bh)
                : halfWallHatchSegments(bw, bh);
        for (const [ax, ay, bx, by] of segs) {
          // plan (x,y) -> planGroup (x,0,-y); thicken perpendicular to the segment.
          const x0 = b.x0 + ax, y0 = b.y0 + ay, x1 = b.x0 + bx, y1 = b.y0 + by;
          let dx = x1 - x0, dy = y1 - y0; const len = Math.hypot(dx, dy) || 1;
          const px = (-dy / len) * APERTURE_GLYPH_HALF, py = (dx / len) * APERTURE_GLYPH_HALF;
          const c = [[x0 - px, y0 - py], [x1 - px, y1 - py], [x1 + px, y1 + py], [x0 + px, y0 + py]];
          const tri = (p) => arr.push(p[0], 0, -p[1]);
          tri(c[0]); tri(c[1]); tri(c[2]); tri(c[0]); tri(c[2]); tri(c[3]);
        }
      }
      if (!arr.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const mesh = new THREE.Mesh(geo, edgeMat(k, false));
      mesh.position.y = elevation + 0.0035; // above the faint fill, below the 0.004 edge strips
      planGroup.add(mesh);
    }
  };

  const addFloorStrips = (floor, elevation, active = null) => {
    const pushStrips = (rects, mat, y, wantEdge) => {
      const geo = rectStripGeo(rects, EDGE_HALF, wantEdge);
      if (!geo) return;
      const o = new THREE.Mesh(geo, mat);
      o.position.y = elevation + y;
      planGroup.add(o);
    };
    const locked = lockedEdges(floor);
    const isLocked = (r, e) => locked.has(`${r.id}:${e}`);
    const notLocked = (r, e) => !isLocked(r, e);
    const others = floor.rectangles.filter((r) => r !== active);
    // Group resting zones by kind so each type keeps its palette outline color.
    const byKind = new Map();
    for (const r of others) {
      const k = zoneKind(r);
      (byKind.get(k) ?? byKind.set(k, []).get(k)).push(r);
    }
    for (const [k, rects] of byKind) pushStrips(rects, edgeMat(k, false), 0.004, notLocked);
    pushStrips(others, lockedMat, 0.005, isLocked);
    if (active) {
      pushStrips([active], edgeMat(zoneKind(active), true), 0.006, notLocked);
      pushStrips([active], lockedMat, 0.007, isLocked);
    }
  };

  function buildActivePlan(withDims = true) {
    clearPlanGeometry();
    const floor = project.activeFloor;
    const footprint = getFootprint?.(floor.rectangles) ?? [];
    const fillGeo = footprintFloorGeometry(footprint); // merged fill = room free space
    if (fillGeo) planGroup.add(new THREE.Mesh(fillGeo, fillMat));
    addZoneFills(floor, 0); // faint per-kind tint for the subtract zones on top
    addApertureGlyphs(floor, 0); // door swing / window casement / half-wall hatch
    // Per-rectangle edge strips, colored per kind (see edgeMat / zoneColors.js).
    // Non-active zones sit lower; the active zone is a lightened tint and on top.
    addFloorStrips(floor, 0, activeRect);
    if (withDims) {
      buildDimensions(floor);       // constraint dimension lines + value labels
      buildMarkers();               // wall-anchored glyphs (own group, not cleared above)
      buildElectricalLinks(floor);  // derived switch-to-light ceiling routes
    }
    return planGroup.children.length > 0;
  }

  // A wall-fixture glyph on a white faceplate. The dark badge + white faceplate + outer
  // status ring are shared across types; the faceplate interior is drawn per type (outlet
  // = French Type E socket, switch = rocker). The ring changes orange->white when fully
  // pinned. Extend markerFace() for new types (light, ethernet, …).
  function drawMarkerGlyph(ctx, marker) {
    const ringColor = marker._full ? '#ffffff' : '#ff9f43';
    // Dark badge + constraint-status ring keep the white faceplate readable over
    // passthrough and on the projected floor copy.
    ctx.fillStyle = 'rgba(15,18,24,0.82)';
    ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = ringColor; ctx.stroke();

    // White square faceplate (shared by every type).
    ctx.beginPath(); ctx.roundRect(27, 23, 74, 82, 14);
    ctx.fillStyle = '#f8fafc'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#cbd5e1'; ctx.stroke();

    markerFace(ctx, marker.type);
  }

  // Per-type faceplate interior, drawn inside the shared white faceplate above.
  function markerFace(ctx, type) {
    if (['radiator', 'boiler', 'sink', 'washing_machine'].includes(type)) {
      ctx.strokeStyle = '#334155'; ctx.fillStyle = '#dbeafe'; ctx.lineWidth = 4;
      if (type === 'radiator') {
        ctx.strokeRect(40, 43, 48, 40);
        for (let x = 48; x <= 80; x += 8) { ctx.beginPath(); ctx.moveTo(x, 47); ctx.lineTo(x, 79); ctx.stroke(); }
      } else if (type === 'boiler') {
        ctx.beginPath(); ctx.roundRect(43, 35, 42, 56, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(64, 61, 11, 0, Math.PI * 2); ctx.stroke();
      } else if (type === 'sink') {
        ctx.beginPath(); ctx.ellipse(64, 67, 27, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(64, 50); ctx.lineTo(64, 40); ctx.lineTo(76, 40); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.roundRect(42, 36, 44, 56, 5); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(64, 66, 15, 0, Math.PI * 2); ctx.stroke();
      }
      return;
    }
    if (type === 'switch') {
      // French rocker switch: a centered rounded rocker with a horizontal split and a
      // shaded lower (pressed) half.
      ctx.beginPath(); ctx.roundRect(48, 38, 32, 52, 8);
      ctx.fillStyle = '#e5e7eb'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#94a3b8'; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(48, 64, 32, 26, 8);
      ctx.fillStyle = 'rgba(100,116,139,0.20)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(50, 64); ctx.lineTo(78, 64);
      ctx.lineWidth = 2; ctx.strokeStyle = '#64748b'; ctx.stroke();
      return;
    }
    if (type === 'light') {
      // Ceiling light: a filled bulb with radiating rays.
      ctx.beginPath(); ctx.arc(64, 62, 17, 0, Math.PI * 2);
      ctx.fillStyle = '#fde68a'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#eab308'; ctx.stroke();
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(64 + Math.cos(a) * 22, 62 + Math.sin(a) * 22);
        ctx.lineTo(64 + Math.cos(a) * 30, 62 + Math.sin(a) * 30);
        ctx.stroke();
      }
      return;
    }
    if (type === 'tv_antenna') {
      // Coaxial TV wall outlet: concentric socket plus a small aerial crown.
      ctx.beginPath(); ctx.arc(64, 66, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#e5e7eb'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#64748b'; ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 66, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(64, 48); ctx.lineTo(51, 34);
      ctx.moveTo(64, 48); ctx.lineTo(77, 34);
      ctx.lineWidth = 3; ctx.strokeStyle = '#334155'; ctx.stroke();
      return;
    }
    if (type === 'ethernet') {
      // Front view of an RJ45 jack: a framed socket, eight contacts, and the
      // distinctive centered latch recess (matching the plan-sheet symbol).
      ctx.beginPath(); ctx.roundRect(42, 42, 44, 40, 5);
      ctx.fillStyle = '#e5e7eb'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#94a3b8'; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(47, 47);
      ctx.lineTo(81, 47);
      ctx.lineTo(81, 70);
      ctx.lineTo(73, 70);
      ctx.lineTo(73, 79);
      ctx.lineTo(55, 79);
      ctx.lineTo(55, 70);
      ctx.lineTo(47, 70);
      ctx.closePath();
      ctx.fillStyle = '#f8fafc'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#94a3b8'; ctx.stroke();
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const x = 50 + i * 4;
        ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x, 59); ctx.stroke();
      }
      return;
    }
    if (type === 'ethernet_dual') {
      // Two adjacent RJ45 apertures, each retaining contacts and a latch notch.
      ctx.strokeStyle = '#64748b';
      for (const cx of [50, 78]) {
        ctx.beginPath(); ctx.roundRect(cx - 12, 44, 24, 38, 4);
        ctx.fillStyle = '#e5e7eb'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 8, 50); ctx.lineTo(cx + 8, 50); ctx.lineTo(cx + 8, 69);
        ctx.lineTo(cx + 5, 69); ctx.lineTo(cx + 5, 77); ctx.lineTo(cx - 5, 77);
        ctx.lineTo(cx - 5, 69); ctx.lineTo(cx - 8, 69); ctx.closePath();
        ctx.fillStyle = '#f8fafc'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const x = cx - 6 + i * 4;
          ctx.beginPath(); ctx.moveTo(x, 53); ctx.lineTo(x, 60); ctx.stroke();
        }
      }
      return;
    }
    if (type === 'patch_panel') {
      // Compact rack patch panel: two banks of RJ45 ports with status/index dots.
      ctx.beginPath(); ctx.roundRect(35, 43, 58, 42, 5);
      ctx.fillStyle = '#e5e7eb'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#334155'; ctx.stroke();
      for (const y of [54, 72]) {
        for (const x of [45, 57, 69, 81]) {
          ctx.beginPath(); ctx.roundRect(x - 4, y - 4, 8, 8, 1);
          ctx.fillStyle = '#f8fafc'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
        }
      }
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.arc(39, 64, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(89, 64, 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (type === 'outlet_shutter') {
      // Roller shutter: framed slats plus a vertical travel arrow.
      ctx.beginPath(); ctx.roundRect(42, 40, 38, 44, 5);
      ctx.fillStyle = '#f8fafc'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#64748b'; ctx.stroke();
      ctx.lineWidth = 3;
      for (let y = 48; y <= 72; y += 8) {
        ctx.beginPath(); ctx.moveTo(47, y); ctx.lineTo(75, y); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(87, 43); ctx.lineTo(87, 82);
      ctx.moveTo(87, 82); ctx.lineTo(81, 73);
      ctx.moveTo(87, 82); ctx.lineTo(93, 73); ctx.stroke();
      return;
    }
    if (type === 'outlet_aircon') {
      // Fixed HVAC supply: a SQUARE housing (not the round socket) marks it as a
      // service point, not a power outlet. Snowflake inside, cable tail exiting below.
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(41, 40, 46, 40, 6); ctx.fillStyle = '#f8fafc'; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3]) {
        const dx = Math.cos(angle) * 15, dy = Math.sin(angle) * 15;
        ctx.beginPath(); ctx.moveTo(64 - dx, 60 - dy); ctx.lineTo(64 + dx, 60 + dy); ctx.stroke();
      }
      ctx.strokeStyle = '#334155'; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(64, 80); ctx.lineTo(64, 90); ctx.lineTo(80, 90); ctx.stroke();
      ctx.beginPath(); ctx.arc(85, 90, 5, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    if (type === 'camera_ethernet') {
      // Network (PoE/IP) camera: a bullet-camera body with a front lens, plus a short
      // ethernet cable tail ending in an RJ45 plug — a camera that lives on the network.
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(40, 50, 34, 24, 5); // body
      ctx.fillStyle = '#e5e7eb'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(78, 62, 11, 0, Math.PI * 2); // lens housing (front)
      ctx.fillStyle = '#f8fafc'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(78, 62, 5, 0, Math.PI * 2); // aperture
      ctx.fillStyle = '#1f2937'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(50, 74); ctx.lineTo(50, 86); ctx.stroke(); // cable tail
      ctx.beginPath(); ctx.rect(44, 86, 12, 9); // RJ45 plug
      ctx.fillStyle = '#e5e7eb'; ctx.fill(); ctx.stroke();
      return;
    }
    if (type === 'outlet_cooktop') {
      // Four cooking zones make the dedicated cooktop feed unmistakable.
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 4;
      for (const [x, y] of [[53, 53], [75, 53], [53, 75], [75, 75]]) {
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
      }
      return;
    }
    if (type === 'outlet_oven') {
      ctx.beginPath(); ctx.arc(64, 64, 29, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#334155'; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(43, 39, 42, 50, 4);
      ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(46, 50); ctx.lineTo(82, 50); ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 69, 12, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    if (type === 'outlet_water_heater') {
      ctx.beginPath(); ctx.roundRect(48, 37, 32, 54, 14);
      ctx.lineWidth = 4; ctx.strokeStyle = '#334155'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(64, 50); ctx.bezierCurveTo(54, 62, 55, 72, 64, 76);
      ctx.bezierCurveTo(73, 72, 74, 62, 64, 50); ctx.stroke();
      return;
    }
    if (type === 'outlet_appliance') {
      // Circular outlet family outline with a generic appliance/drum inside.
      ctx.beginPath(); ctx.arc(64, 64, 29, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#334155'; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(48, 44, 32, 40, 3);
      ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 66, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(53, 51, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#334155'; ctx.fill();
      return;
    }
    if (type === 'panel') {
      // Consumer unit / distribution board: enclosure with a row of breakers.
      ctx.beginPath(); ctx.roundRect(38, 40, 52, 48, 4);
      ctx.fillStyle = '#e5e7eb'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#334155'; ctx.stroke();
      ctx.lineWidth = 3; ctx.fillStyle = '#94a3b8';
      for (const bx of [46, 58, 70]) {
        ctx.beginPath(); ctx.rect(bx, 48, 8, 14); ctx.fill(); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(44, 74); ctx.lineTo(84, 74); ctx.stroke();
      return;
    }
    if (type === 'breaker') {
      // One modular circuit breaker (matches the desktop 3D fixture): a narrow DIN
      // module on its rail with a raised toggle — vs. the panel's multi-module box.
      ctx.lineWidth = 3; ctx.strokeStyle = '#334155';
      ctx.beginPath(); ctx.moveTo(36, 64); ctx.lineTo(92, 64); ctx.stroke(); // DIN rail
      ctx.beginPath(); ctx.roundRect(50, 34, 28, 60, 4);
      ctx.fillStyle = '#e5e7eb'; ctx.fill();
      ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(57, 46, 14, 20, 3); // toggle lever, up = on
      ctx.fillStyle = '#334155'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(56, 82); ctx.lineTo(72, 82); ctx.lineWidth = 3; ctx.stroke();
      return;
    }
    if (type === 'intercom') {
      // Wall intercom: display, call key, and speaker grille.
      ctx.beginPath(); ctx.roundRect(43, 35, 42, 58, 6);
      ctx.fillStyle = '#e5e7eb'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#334155'; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(49, 42, 30, 22, 3);
      ctx.fillStyle = '#94a3b8'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#334155';
      for (const [x, y] of [[52, 72], [58, 72], [64, 72], [70, 72]]) {
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(76, 81, 4, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    // Default: outlet — Type E circular recessed well, upper earth pin, two contacts.
    ctx.beginPath(); ctx.arc(64, 67, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#e5e7eb'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#94a3b8'; ctx.stroke();
    ctx.beginPath(); ctx.arc(64, 47, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#64748b'; ctx.stroke();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(49, 73, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(79, 73, 6, 0, Math.PI * 2); ctx.fill();
  }

  // Highlight overlay for an outlet. It occupies the exact same footprint as the
  // icon and draws inward from its edge, so hover/selection never changes its size.
  let markerOutlineTex = null; // shared by every outline; never disposed by clearMarkers
  function markerOutlineTexture() {
    if (markerOutlineTex) return markerOutlineTex;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.beginPath(); ctx.arc(64, 64, 53, 0, Math.PI * 2);
    ctx.lineWidth = 12; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    markerOutlineTex = new THREE.CanvasTexture(canvas);
    return markerOutlineTex;
  }

  // ---- Batched marker glyphs ----------------------------------------------------
  // PROJECT · PERF on the owner's Quest measured the marker layer alone at ~47 ms of
  // GPU per frame (the whole plan cost the same), when it was one Sprite + one floor
  // Mesh per marker, each with its OWN 128x128 CanvasTexture (168 textures for 84
  // markers). Now a glyph depends only on type + pinned ring, so each variant is
  // painted once into a shared atlas, and a floor's markers draw as TWO meshes:
  // camera-facing wall glyphs (makeBillboardMaterial) and flat floor icons.
  // Invisible proxies keep userData.markerId / markerRole ('wall' | 'floor') and the
  // position, so picking, grab distance and the live drag work unchanged; after
  // moving proxies call refreshMarkerBatches(). Outlines stay individual (hidden
  // unless highlighted, so they cost nothing at rest).
  const MARKER_TEX = 128, MARKER_ATLAS = 1024, MARKER_COLS = MARKER_ATLAS / MARKER_TEX;
  const MARKER_SLOTS = MARKER_COLS * MARKER_COLS; // 64 ≥ every type × pinned/unpinned
  const MARKER_WALL_HALF = 0.045, MARKER_FLOOR_HALF = 0.05; // the old 0.09 sprite / 0.10 plane
  const markerAtlas = { ctx: null, texture: null, wallMat: null, floorMat: null, slots: new Map(), dirty: false };
  function markerGlyphSlot(marker) {
    if (!markerAtlas.texture) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = MARKER_ATLAS;
      markerAtlas.ctx = canvas.getContext('2d');
      markerAtlas.texture = new THREE.CanvasTexture(canvas);
      markerAtlas.wallMat = makeBillboardMaterial(markerAtlas.texture);
      markerAtlas.floorMat = new THREE.MeshBasicMaterial({
        map: markerAtlas.texture, transparent: true, opacity: 0.78,
        side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      });
    }
    const key = `${marker.type}|${marker._full ? 1 : 0}`;
    let slot = markerAtlas.slots.get(key);
    if (slot) return slot;
    const i = Math.min(markerAtlas.slots.size, MARKER_SLOTS - 1); // full: reuse the last cell
    const x = (i % MARKER_COLS) * MARKER_TEX, y = Math.floor(i / MARKER_COLS) * MARKER_TEX;
    const ctx = markerAtlas.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.clearRect(0, 0, MARKER_TEX, MARKER_TEX);
    drawMarkerGlyph(ctx, marker);
    ctx.restore();
    markerAtlas.dirty = true;
    const inset = 0.5 / MARKER_ATLAS; // half a texel, so neighbours never bleed in
    slot = { u0: x / MARKER_ATLAS + inset, u1: (x + MARKER_TEX) / MARKER_ATLAS - inset,
      v0: 1 - (y + MARKER_TEX) / MARKER_ATLAS + inset, v1: 1 - y / MARKER_ATLAS - inset };
    markerAtlas.slots.set(key, slot);
    return slot;
  }
  function makeMarkerProxy(marker, role) {
    const proxy = new THREE.Object3D();
    proxy.userData.markerId = marker.id;
    proxy.userData.markerRole = role;
    proxy.userData.glyphSlot = markerGlyphSlot(marker);
    return proxy;
  }
  // Write every quad of a marker batch from its proxies' current positions.
  function writeMarkerBatch(mesh) {
    const { proxies, flat } = mesh.userData.markerBatch;
    const pos = mesh.geometry.attributes.position;
    proxies.forEach((proxy, q) => {
      const p = proxy.position;
      for (let k = 0; k < 4; k++) {
        if (!flat) { pos.setXYZ(q * 4 + k, p.x, p.y, p.z); continue; }
        // Flat on the floor, texture top toward plan +y (local -z), like the old
        // PlaneGeometry(0.10).rotateX(-PI/2).
        const sx = k === 0 || k === 3 ? -1 : 1, sz = k < 2 ? 1 : -1;
        pos.setXYZ(q * 4 + k, p.x + sx * MARKER_FLOOR_HALF, p.y, p.z + sz * MARKER_FLOOR_HALF);
      }
    });
    pos.needsUpdate = true;
  }
  function makeMarkerBatch(proxies, flat) {
    const n = proxies.length;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 12), 3));
    const uv = [], corner = [], index = [];
    proxies.forEach((proxy, q) => {
      const { u0, u1, v0, v1 } = proxy.userData.glyphSlot;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      const h = MARKER_WALL_HALF;
      corner.push(-h, -h, h, -h, h, h, -h, h);
      index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    });
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (!flat) geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, flat ? markerAtlas.floorMat : markerAtlas.wallMat);
    mesh.renderOrder = flat ? 31 : 32; // above floor overlays/highlights (badges are 30)
    mesh.frustumCulled = false;
    mesh.userData.markerBatch = { proxies, flat };
    writeMarkerBatch(mesh);
    if (markerAtlas.dirty) { markerAtlas.texture.needsUpdate = true; markerAtlas.dirty = false; }
    return mesh;
  }
  // Re-sync every marker batch after proxies moved (the live marker grip-drag).
  function refreshMarkerBatches() {
    for (const child of markerGroup.children) if (child.userData.markerBatch) writeMarkerBatch(child);
  }

  function makeMarkerOutline(marker, role) {
    const tex = markerOutlineTexture();
    const visual = role === 'wall'
      ? new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, color: 0xffffff,
          depthTest: false, depthWrite: false, transparent: true,
        }))
      : new THREE.Mesh(markerFloorGeom, new THREE.MeshBasicMaterial({
          map: tex, color: 0xffffff, transparent: true,
          side: THREE.DoubleSide, depthTest: false, depthWrite: false,
        }));
    if (role === 'wall') visual.scale.set(0.09, 0.09, 1);
    visual.renderOrder = 33;
    visual.visible = false;
    visual.userData.markerId = marker.id;
    visual.userData.markerRole = `${role}-outline`;
    return visual;
  }

  function clearMarkers() {
    for (const child of [...markerGroup.children]) {
      markerGroup.remove(child);
      // Batches own their geometry but share the atlas materials; outlines own their
      // material but share markerFloorGeom / the sprite quad and the outline texture.
      if (child.userData.markerBatch) child.geometry.dispose();
      else child.material?.dispose();
    }
  }

  // Add one floor's marker glyphs in planGroup-local coordinates. Outlines are
  // visual-only: stacked overview markers remain inert even when WIRE uses their
  // outlines to reveal a whole-house circuit.
  function addFloorMarkers(floor, elevation = 0, withOutlines = true) {
    const wallProxies = [], floorProxies = [];
    for (const m of floor.markers) {
      const spr = makeMarkerProxy(m, 'wall');
      spr.position.set(m.x, elevation + m.z, -m.y);
      const floorIcon = makeMarkerProxy(m, 'floor');
      floorIcon.position.set(m.x, elevation + 0.016, -m.y);
      markerGroup.add(spr, floorIcon);
      wallProxies.push(spr); floorProxies.push(floorIcon);
      if (!withOutlines) continue;
      const wallOutline = makeMarkerOutline(m, 'wall');
      wallOutline.position.copy(spr.position);
      const floorOutline = makeMarkerOutline(m, 'floor');
      floorOutline.position.set(m.x, elevation + 0.018, -m.y);
      markerGroup.add(wallOutline, floorOutline);
    }
    if (floor.markers.length) markerGroup.add(makeMarkerBatch(floorProxies, true), makeMarkerBatch(wallProxies, false));
  }

  // ---- Vertical (Z) dimension visuals. Static, non-pickable height dims drawn in the
  // SAME language as the X/Y dims (buildDimensions): dashed DIM_T strips in the shared
  // dim materials, dashed end ticks, and the standard value label centred on the line.
  // A vertical line has no floor plane to lie in, so each dash is a crossed pair of
  // vertical strips (and each tick a crossed pair of flat ones) — thin from any side.
  // Materials and the label atlas are shared: clearZDims disposes only per-build
  // geometry, never the shared dim materials or atlas pages.
  function clearZDims() {
    for (const child of [...zDimGroup.children]) {
      zDimGroup.remove(child);
      child.geometry?.dispose(); // label batches share their atlas page material
    }
  }
  // Collects one merged geometry per material, like buildDimensions' strip batches.
  function makeZDimBatch() {
    const byMat = new Map();
    const labels = []; // proxies, drawn as one billboard batch in flush()
    const quad = (mat, p0, p1, p2, p3) => {
      const arr = byMat.get(mat) ?? byMat.set(mat, []).get(mat);
      for (const q of [p0, p1, p2, p0, p2, p3]) arr.push(q[0], q[2], -q[1]); // plan (x,y,z) → local (x,z,-y)
    };
    // Dashed pattern along a 3D segment; `across` = the unit plan directions to thicken in.
    const dashed = (mat, a, b, across) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (len < 1e-6) return;
      const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len];
      for (let t = 0; t < len; t += DIM_DASH + DIM_GAP) {
        const t2 = Math.min(t + DIM_DASH, len);
        const p = [a[0] + u[0] * t, a[1] + u[1] * t, a[2] + u[2] * t];
        const q = [a[0] + u[0] * t2, a[1] + u[1] * t2, a[2] + u[2] * t2];
        for (const w of across) {
          const o = [w[0] * DIM_T, w[1] * DIM_T, w[2] * DIM_T];
          quad(mat, [p[0] - o[0], p[1] - o[1], p[2] - o[2]], [q[0] - o[0], q[1] - o[1], q[2] - o[2]],
            [q[0] + o[0], q[1] + o[1], q[2] + o[2]], [p[0] + o[0], p[1] + o[1], p[2] + o[2]]);
        }
      }
    };
    return {
      // One vertical dim at plan (x, y) from height lo to hi, with ticks at both ends
      // and the value label centred on the line.
      add(x, y, lo, hi, value, mat, colorCss) {
        if (!(hi - lo > 1e-4)) return;
        const tick = 0.045; // same half-length as the X/Y pin ticks
        dashed(mat, [x, y, lo], [x, y, hi], [[1, 0, 0], [0, 1, 0]]);
        for (const h of [lo, hi]) {
          dashed(mat, [x - tick, y, h], [x + tick, y, h], [[0, 1, 0], [0, 0, 1]]);
          dashed(mat, [x, y - tick, h], [x, y + tick, h], [[1, 0, 0], [0, 0, 1]]);
        }
        const label = makeDimLabel(`${fmt(value)} ${unitLabel()}`, colorCss, x, y);
        label.position.y = (lo + hi) / 2;
        labels.push(label);
      },
      flush() {
        addDimLabelBatch(labels, zDimGroup, 34);
        for (const [mat, arr] of byMat) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
          const mesh = new THREE.Mesh(geo, mat);
          mesh.renderOrder = 17;
          zDimGroup.add(mesh);
        }
      },
    };
  }
  function buildZDims() {
    clearZDims();
    const batch = makeZDimBatch();
    // Markers and bare conduit junctions use their X/Y pin styling: amber pin strips,
    // with an amber (marker) or cyan (conduit) label — see buildDimensions.
    for (const m of project.activeFloor.markers || []) {
      if (m.zDatum && (m.z || 0) > 1e-4) batch.add(m.x, m.y, 0, m.z, m.z, markerDimMat, '#ff9f43');
    }
    // Marker-bound nodes follow their device and are never dimensioned.
    for (const n of project.conduitNodes || []) {
      if (n.markerId || !n.zDatum || !((n.z || 0) > 1e-4)) continue;
      if (project.conduitNodeFloorId(n) !== project.activeFloorId) continue;
      batch.add(n.x, n.y, 0, n.z, n.z, markerDimMat, '#22d3ee');
    }
    // Apertures (door/garage/window/half-wall/heater/sliding) use the blue structural dim
    // styling: floor→sill and floor→head as two side-by-side dims, offset along the
    // aperture's wall axis. A zero sill and an open top (head:null) are omitted.
    for (const r of project.activeFloor.rectangles || []) {
      if (!isAperture(r.kind)) continue;
      const b = r.bounds;
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const alongX = b.x1 - b.x0 >= b.y1 - b.y0;
      const off = 0.04; // each dim sits 4 cm either side of the centre, along the wall
      const [dx, dy] = alongX ? [off, 0] : [0, off];
      const sill = r.sill || 0;
      if (sill > 1e-4) batch.add(cx - dx, cy - dy, 0, sill, sill, dimMat, '#79c0ff');
      if (r.head != null && r.head > 1e-4) batch.add(cx + dx, cy + dy, 0, r.head, r.head, dimMat, '#79c0ff');
    }
    batch.flush();
  }

  // Rebuild the editable active floor's marker layer.
  function buildMarkers() {
    clearMarkers();
    addFloorMarkers(project.activeFloor);
    buildZDims();
  }

  function clearElectricalLinks() {
    for (const child of [...electricalGroup.children]) {
      electricalGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }

  // Keep the physical carrier visually separate from what it carries. Surface remains
  // inferred routing metadata, but does not recolor either layer in AR.
  const CONDUIT_COLOR = 0xa78bfa;
  const CONDUIT_NODE_COLOR = 0xffffff;
  const CIRCUIT_CONNECTED_COLOR = 0x4ade80;
  const WIRE_TYPE_COLOR = { electrical: 0xf59e0b, ethernet: 0x38bdf8 };
  const wireTypeColor = (wire) => WIRE_TYPE_COLOR[wire?.type] || WIRE_TYPE_COLOR.electrical;

  // Build one dashed line from a list of model points {x,y,z} → world.
  function makeRouteLine(points, color) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) =>
      new THREE.Vector3(p.x, p.z, -p.y)));
    const material = new THREE.LineDashedMaterial({
      color, dashSize: 0.035, gapSize: 0.035,
      transparent: true, opacity: 0.92, depthTest: false, depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.renderOrder = 14;
    return line;
  }

  // Build a flat ribbon quad between two model points {x,y,z} → world, so a conduit
  // segment reads as a WIDE band rather than a hairline. A THREE.Line renders 1px on
  // the Quest regardless of `linewidth`, so a hover recolor on it is nearly invisible;
  // a ribbon makes both the base run and the yellow hover obvious. The band always
  // stands VERTICAL ("flat on a wall") for every run — floor, ceiling, or wall — so it
  // stays visible from a standing viewpoint rather than lying edge-on. A near-vertical
  // run (riser) falls back to a fixed horizontal axis so its band doesn't degenerate.
  const CONDUIT_RIBBON_W = 0.03; // m; band width (~realistic conduit gauge, clearly hoverable)
  function makeConduitRibbon(a, b, color, width = CONDUIT_RIBBON_W) {
    const A = new THREE.Vector3(a.x, a.z, -a.y);
    const B = new THREE.Vector3(b.x, b.z, -b.y);
    const dir = new THREE.Vector3().subVectors(B, A);
    if (dir.lengthSq() < 1e-9) dir.set(1, 0, 0);
    dir.normalize();
    // Width axis = world-up projected perpendicular to the run: the most-vertical
    // direction ⟂ the run, so the band is a vertical plane for any horizontal run.
    const perp = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
    if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0); // run is vertical (riser) → horizontal axis
    perp.normalize().multiplyScalar(width / 2);
    const c0 = new THREE.Vector3().subVectors(A, perp);
    const c1 = new THREE.Vector3().addVectors(A, perp);
    const c2 = new THREE.Vector3().addVectors(B, perp);
    const c3 = new THREE.Vector3().subVectors(B, perp);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z, c3.x, c3.y, c3.z,
    ], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.92,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 14;
    return mesh;
  }

  // Routed wires need stable world-space thickness on Quest (WebGL lines stay one
  // screen pixel). Build the same upright ribbon orientation as conduit, but only
  // 8 mm wide and physically split into the existing 35 mm dash / 35 mm gap cadence.
  const WIRE_RIBBON_W = 0.008;
  const WIRE_DASH_M = 0.035;
  const WIRE_GAP_M = 0.035;
  function makeWireRibbon(a, b, color) {
    const A = new THREE.Vector3(a.x, a.z, -a.y);
    const B = new THREE.Vector3(b.x, b.z, -b.y);
    const delta = new THREE.Vector3().subVectors(B, A);
    const length = delta.length();
    const dir = length > 1e-9 ? delta.clone().multiplyScalar(1 / length) : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
    if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
    perp.normalize().multiplyScalar(WIRE_RIBBON_W / 2);
    const positions = [];
    const indices = [];
    for (let start = 0; start < length; start += WIRE_DASH_M + WIRE_GAP_M) {
      const end = Math.min(length, start + WIRE_DASH_M);
      const p0 = A.clone().addScaledVector(dir, start);
      const p1 = A.clone().addScaledVector(dir, end);
      const corners = [
        p0.clone().sub(perp), p0.clone().add(perp),
        p1.clone().add(perp), p1.clone().sub(perp),
      ];
      const base = positions.length / 3;
      for (const p of corners) positions.push(p.x, p.y, p.z);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 15; // above the 30 mm conduit ribbon
    return mesh;
  }

  // Control links (switch→light) render here: one dashed line following the DERIVED
  // ceiling route; LINK mode recolors these by source switch. The path comes from live
  // marker positions so edits never detach its ends. (Routed wires draw separately in
  // routedWireGroup; the conduit network in conduitGroup.)
  function buildElectricalLinks(floor = project.activeFloor) {
    clearElectricalLinks();
    for (const link of floor.electricalLinks || []) {
      if ((link.kind || 'control') !== 'control') continue;
      const route = electricalRoutePoints(floor, link);
      if (!route.length) continue;
      // Lift the ceiling run slightly so it reads above the overlay.
      const line = makeRouteLine(route.map((p, i) =>
        (i === 1 || i === 2) ? { x: p.x, y: p.y, z: p.z + 0.012 } : p), 0x38bdf8);
      line.userData.electricalLinkId = link.id;
      line.userData.kind = 'control';
      line.userData.fromMarkerId = link.fromMarkerId;
      line.userData.toMarkerId = link.toMarkerId;
      electricalGroup.add(line);
    }
  }

  // ---- Conduit/wire pick geometry ----------------------------------------------
  // Plan distance from (px,py) to the segment a→b (both plan-space {x,y}).
  function planPointToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return Math.hypot(px - a.x, py - a.y);
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  // Pick tolerances shared by the conduit/routed-wire floor pickers and the CONDUIT
  // EDIT / WIRE via-node grip grabs.
  const WIRE_PICK_M = 0.12; // m; a little wider than the reticle for a thin line
  const WAYPOINT_GRAB_M = 0.14; // m; tip within this of a node handle → direct 3D carry, else remote

  // ---- Conduit network rendering + picking ---------------------------------
  // The conduit network + wires are WHOLE-HOUSE and resolve in ABSOLUTE world Z, but
  // conduitGroup/routedWireGroup ride planGroup (already lifted by activeElevation), so
  // strip the active-floor lift off each z to place geometry correctly; a riser's far
  // end then sits at ±storey height above/below the active overlay.
  const planLocalZ = (p) => ({ x: p.x, y: p.y, z: (p.z || 0) - displayElevation() });
  // A segment/wire-leg belongs to the active-floor view if either end is on it.
  const touchesActiveFloor = (s) => allFloorsView
    || s.aFloorId === project.activeFloorId || s.bFloorId === project.activeFloorId;
  // Picking priority. Outside ALL FLOORS only the active floor is pickable (rank 0).
  // ALL FLOORS picks the whole house, but ranks each storey by its distance in storeys
  // from the one the reticle lies on (see allFloorsReticleFloor): the reticle's storey
  // wins by default and grip cycles outward, so a basement breaker can still reach an
  // upstairs outlet. `pickRanker()` returns floorId → rank (Infinity = not pickable).
  let reticleFloorId = null;
  const pickFloorId = () => (allFloorsView ? reticleFloorId : project.activeFloorId);
  const pickFloor = () => project.floors.find((f) => f.id === pickFloorId()) || null;
  function pickRanker() {
    if (!allFloorsView) return (floorId) => (floorId === project.activeFloorId ? 0 : Infinity);
    const order = [...project.floors].sort((a, b) => (a.elevation || 0) - (b.elevation || 0))
      .map((f) => f.id);
    const at = order.indexOf(reticleFloorId);
    return (floorId) => {
      const i = order.indexOf(floorId);
      return at < 0 || i < 0 ? Infinity : Math.abs(i - at);
    };
  }
  // A riser/cross-floor leg ranks by the nearer of its two storeys.
  const segRank = (rank, s) => Math.min(rank(s.aFloorId), rank(s.bFloorId));

  const conduitNodeGeom = new THREE.SphereGeometry(0.022, 12, 12);
  // Flat disc laid on the floor at a node's plan projection — the real aim target for
  // reticle picking, since the node sphere itself sits at storey-local height (often at
  // the ceiling or mid-wall). Mirrors the marker floor icon.
  const conduitNodeFloorGeom = new THREE.CircleGeometry(0.03, 20).rotateX(-Math.PI / 2);
  // Draw every conduit segment touching the active floor in uniform purple and a small sphere per active-floor node
  // (floor projections remain slightly dimmer). Rebuilt on any topology change.
  // BATCHED: the whole layer is ~5 draw calls, not one per run/sphere/dot/leader. On the
  // owner's house the per-object layer added ~300 draw calls and took the Quest from ~70
  // to under 30 fps. Runs are one vertex-coloured mesh; spheres and floor dots are
  // InstancedMeshes; leaders are one LineSegments. Per-item hover/selection styling goes
  // through styleConduitNode / styleConduitSegment, never through child objects.
  // Picking is plan-space math (conduitTargetAtFloorPoint etc.), not raycasts.
  let conduitBatch = null; // { runs, runIndex, spheres, nodeIndex, dotFor, nodePos, styleKey }
  const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3();
  const _cc = new THREE.Color();
  function clearConduits() {
    for (const child of [...conduitGroup.children]) {
      conduitGroup.remove(child);
      if (child.isInstancedMesh) child.dispose(); // instance buffers; the node geometries are shared
      else child.geometry?.dispose();
      child.material?.dispose();
    }
    conduitBatch = null;
    conduitPreviewLine = null; // recreated on demand in the render branch
  }
  function buildConduits() {
    clearConduits();
    const segs = conduitNetworkSegments(project).filter(touchesActiveFloor);
    // Runs: the makeConduitRibbon quad per segment, merged, with per-vertex colour.
    const positions = [], colors = [], indices = [];
    const runIndex = new Map(); // segment id → first vertex
    _cc.setHex(CONDUIT_COLOR);
    for (const seg of segs) {
      const quad = makeConduitRibbon(planLocalZ(seg.a), planLocalZ(seg.b), CONDUIT_COLOR);
      const base = positions.length / 3;
      runIndex.set(seg.id, base);
      positions.push(...quad.geometry.attributes.position.array);
      for (let k = 0; k < 4; k++) colors.push(_cc.r, _cc.g, _cc.b);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      quad.geometry.dispose(); quad.material.dispose();
    }
    let runs = null;
    if (segs.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      runs = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.92,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      }));
      runs.renderOrder = 14;
      runs.frustumCulled = false;
      conduitGroup.add(runs);
    }
    // Nodes: a height sphere + a floor dot (the reticle's aim target) + a faint leader.
    const nodes = (project.conduitNodes || []).filter((node) =>
      allFloorsView || project.conduitNodeFloorId(node) === project.activeFloorId);
    const nodeIndex = new Map(); // node id → sphere instance
    const nodePos = [];          // per instance: { sphere: Vector3, dot: Vector3 } (group-local)
    const dotFor = new Map();    // node id → { mesh, index }
    const leaderPts = [];
    const spheres = new THREE.InstancedMesh(conduitNodeGeom, new THREE.MeshBasicMaterial({
      color: 0xffffff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95,
    }), Math.max(1, nodes.length));
    const dotMat = (opacity) => new THREE.MeshBasicMaterial({
      color: 0xffffff, opacity, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    });
    // Device-bound nodes' dots are dimmer; opacity is per material, hence two batches.
    const boundCount = nodes.filter((n) => n.markerId).length;
    const dotsBare = new THREE.InstancedMesh(conduitNodeFloorGeom, dotMat(0.7), Math.max(1, nodes.length - boundCount));
    const dotsBound = new THREE.InstancedMesh(conduitNodeFloorGeom, dotMat(0.5), Math.max(1, boundCount));
    let nBare = 0, nBound = 0;
    nodes.forEach((node, i) => {
      const floorId = project.conduitNodeFloorId(node);
      const p = planLocalZ(conduitNodePos(project, node));
      const nodeFloor = project.floors.find((floor) => floor.id === floorId);
      const floorZ = allFloorsView ? (nodeFloor?.elevation || 0) + 0.016 : 0.016;
      nodeIndex.set(node.id, i);
      nodePos.push({ sphere: new THREE.Vector3(p.x, p.z, -p.y), dot: new THREE.Vector3(p.x, floorZ, -p.y) });
      dotFor.set(node.id, node.markerId ? { mesh: dotsBound, index: nBound++ } : { mesh: dotsBare, index: nBare++ });
      if (Math.abs(p.z - floorZ) > 0.03) { // draw a leader only when the sphere is clear of the floor
        leaderPts.push(p.x, floorZ, -p.y, p.x, p.z, -p.y);
      }
    });
    spheres.count = nodes.length; dotsBare.count = nBare; dotsBound.count = nBound;
    spheres.renderOrder = 16; dotsBare.renderOrder = 15; dotsBound.renderOrder = 15;
    for (const m of [spheres, dotsBare, dotsBound]) { m.frustumCulled = false; conduitGroup.add(m); }
    if (leaderPts.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(leaderPts, 3));
      const leaders = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        color: CONDUIT_NODE_COLOR, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false,
      }));
      leaders.renderOrder = 14;
      leaders.frustumCulled = false;
      conduitGroup.add(leaders);
    }
    conduitBatch = { runs, runIndex, spheres, nodeIndex, dotFor, nodePos, styleKey: new Map() };
    for (const node of nodes) styleConduitNode(node.id, CONDUIT_NODE_COLOR, 1);
    for (const seg of segs) conduitBatch.styleKey.set(`s:${seg.id}`, CONDUIT_COLOR);
    if (!allFloorsView) buildZDims(); // stacked topology view omits active-floor-only Z dims
  }

  // Per-item styling of the batched conduit layer. Unchanged styles are skipped, so
  // the per-frame recolor loops upload nothing while the hover target is steady.
  function styleConduitNode(id, color, scale = 1) {
    const b = conduitBatch;
    const i = b?.nodeIndex.get(id);
    if (i == null) return;
    const key = color * 4 + scale;
    if (b.styleKey.get(`n:${id}`) === key) return;
    b.styleKey.set(`n:${id}`, key);
    _cc.setHex(color);
    _cs.setScalar(scale);
    b.spheres.setMatrixAt(i, _cm.compose(b.nodePos[i].sphere, _cq, _cs));
    b.spheres.setColorAt(i, _cc);
    b.spheres.instanceMatrix.needsUpdate = true;
    b.spheres.instanceColor.needsUpdate = true;
    const dot = b.dotFor.get(id);
    dot.mesh.setMatrixAt(dot.index, _cm.compose(b.nodePos[i].dot, _cq, _cs));
    dot.mesh.setColorAt(dot.index, _cc);
    dot.mesh.instanceMatrix.needsUpdate = true;
    dot.mesh.instanceColor.needsUpdate = true;
  }
  function styleConduitSegment(id, color) {
    const b = conduitBatch;
    const base = b?.runIndex.get(id);
    if (base == null || b.styleKey.get(`s:${id}`) === color) return;
    b.styleKey.set(`s:${id}`, color);
    _cc.setHex(color);
    const attr = b.runs.geometry.attributes.color;
    for (let k = 0; k < 4; k++) attr.setXYZ(base + k, _cc.r, _cc.g, _cc.b);
    attr.needsUpdate = true;
  }
  // Recolor every drawn node / run: fn(id) → [color, scale] for nodes, → color for runs.
  function restyleConduitNodes(fn) {
    for (const id of conduitBatch?.nodeIndex.keys() ?? []) styleConduitNode(id, ...fn(id));
  }
  function restyleConduitSegments(fn) {
    for (const id of conduitBatch?.runIndex.keys() ?? []) styleConduitSegment(id, fn(id));
  }
  // World position of a drawn node's height sphere (grip-drag near/far test), or null.
  function conduitNodeWorldPos(id, target) {
    const i = conduitBatch?.nodeIndex.get(id);
    if (i == null) return null;
    conduitGroup.updateWorldMatrix(true, false);
    return target.copy(conduitBatch.nodePos[i].sphere).applyMatrix4(conduitGroup.matrixWorld);
  }

  // Nearest eligible conduit node under the reticle, by plan projection: the active
  // floor, or in ALL FLOORS the nearest storey to the reticle's that has one.
  function conduitNodeAtFloorPoint(px, py) {
    const rank = pickRanker();
    let best = null, bestD = RETICLE_OUTER, bestR = Infinity;
    for (const node of project.conduitNodes) {
      const r = rank(project.conduitNodeFloorId(node));
      if (r === Infinity) continue;
      const p = conduitNodePos(project, node);
      const d = Math.hypot(px - p.x, py - p.y);
      if (d <= RETICLE_OUTER && (r < bestR || (r === bestR && d < bestD))) { bestR = r; bestD = d; best = node; }
    }
    return best;
  }

  // MARKER · CONDUIT uses one combined pick stack instead of hard-prioritizing every
  // nearby conduit node over a device. Nearest-to-reticle wins; exact ties put markers
  // first, then order vertical stacks high→low. Grip advances `afterKey`, while trigger
  // commits only the currently highlighted target.
  function conduitTargetAtFloorPoint(px, py, afterKey = null) {
    const candidates = [];
    const rank = pickRanker();
    project.floors.forEach((floor, floorOrder) => {
      const r = rank(floor.id);
      if (r === Infinity) return;
      (floor.markers || []).forEach((marker, order) => {
        const distance = Math.hypot(px - marker.x, py - marker.y);
        if (distance <= RETICLE_OUTER) candidates.push({
          kind: 'marker', item: marker, key: `marker:${marker.id}`, rank: r,
          distance, z: (floor.elevation || 0) + (marker.z || 0), order: floorOrder * 100000 + order,
        });
      });
    });
    project.conduitNodes.forEach((node, order) => {
      const floorId = project.conduitNodeFloorId(node);
      const r = rank(floorId);
      if (r === Infinity) return;
      // A marker-bound node is the same physical endpoint as its marker; presenting
      // both would waste a cycle step without changing the pen target.
      if (node.markerId && project.findMarker(node.markerId)?.floor?.id === floorId) return;
      const p = conduitNodePos(project, node);
      const distance = Math.hypot(px - p.x, py - p.y);
      if (distance <= RETICLE_OUTER) candidates.push({
        kind: 'node', item: node, key: `node:${node.id}`, rank: r,
        distance, z: p.z || 0, order,
      });
    });
    // Existing runs, picked by their floor projection like CONDUIT EDIT: triggering one
    // splits it into a T-junction. Skipped near a run's ends (target that node
    // instead) and for runs already attached to the pen node.
    conduitNetworkSegments(project).forEach((seg, order) => {
      const r = segRank(rank, seg);
      if (r === Infinity) return;
      const source = project.conduitSegments.find((s) => s.id === seg.id);
      if (penNodeId && source && (source.a === penNodeId || source.b === penNodeId)) return;
      const distance = planPointToSegment(px, py, seg.a, seg.b);
      if (distance > WIRE_PICK_M) return;
      const split = conduitSplitPoint(seg, px, py);
      if (!split) return;
      candidates.push({
        kind: 'segment', item: split, key: `segment:${seg.id}`, rank: r,
        distance, z: split.worldZ, order,
      });
    });
    const KIND_RANK = { marker: 0, node: 1, segment: 2 };
    candidates.sort((a, b) => a.rank - b.rank || a.distance - b.distance
      || KIND_RANK[a.kind] - KIND_RANK[b.kind]
      || b.z - a.z || a.order - b.order);
    if (!candidates.length) return null;
    const current = candidates.findIndex((candidate) => candidate.key === afterKey);
    return candidates[(current + 1) % candidates.length];
  }

  // Where triggering run `seg` (a conduitNetworkSegments entry, world-Z ends) under the
  // floor point (px, py) would place a T-junction. Plan X/Y = the reticle projected
  // onto the run; height comes from the RUN, never the hand (interpolated along it).
  // A vertical run projects to a point, so its height is the controller tip's,
  // clamped to the run. The junction's storey is the one whose band holds that
  // height (a riser can split on either floor). Returns null within reach of an end.
  function conduitSplitPoint(seg, px, py) {
    const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y, len2 = dx * dx + dy * dy;
    const zLo = Math.min(seg.a.z || 0, seg.b.z || 0), zHi = Math.max(seg.a.z || 0, seg.b.z || 0);
    let x, y, worldZ;
    if (len2 < 1e-6) {
      const tip = tipPosition(frameEditCtl);
      if (!tip) return null;
      worldZ = Math.max(zLo, Math.min(zHi, tip.y - planPos.y));
      if (worldZ - zLo < RETICLE_OUTER || zHi - worldZ < RETICLE_OUTER) return null;
      x = seg.a.x; y = seg.a.y;
    } else {
      const t = Math.max(0, Math.min(1, ((px - seg.a.x) * dx + (py - seg.a.y) * dy) / len2));
      x = seg.a.x + t * dx; y = seg.a.y + t * dy;
      if (Math.hypot(x - seg.a.x, y - seg.a.y) < RETICLE_OUTER
        || Math.hypot(x - seg.b.x, y - seg.b.y) < RETICLE_OUTER) return null;
      worldZ = (seg.a.z || 0) + t * ((seg.b.z || 0) - (seg.a.z || 0));
    }
    const floors = seg.aFloorId === seg.bFloorId
      ? [project.floors.find((f) => f.id === seg.aFloorId)]
      : project.floors.filter((f) => f.id === seg.aFloorId || f.id === seg.bFloorId);
    const floor = floors.filter(Boolean).reduce((best, f) => {
      const lo = f.elevation || 0, hi = lo + (f.height || 0);
      const d = worldZ < lo ? lo - worldZ : worldZ > hi ? worldZ - hi : 0;
      return !best || d < best.d ? { f, d } : best;
    }, null)?.f || project.activeFloor;
    return { segmentId: seg.id, x, y, worldZ, floorId: floor.id, z: Math.max(0, worldZ - (floor.elevation || 0)) };
  }

  // Ordered vertical stack (high→low z) of DIMS-eligible first-ref targets sharing the
  // floor point under the reticle: bare conduit junctions in CONDUIT DIMS, markers in
  // MARKER DIMS. Returns [{kind,id}] (empty for PLAN DIMS or an empty point). Used so
  // grip can cycle which stacked member the pending dimension will reference.
  function dimStackAt(px, py) {
    if (px == null) return [];
    if (modes[currentMode].id === 'conduit_dims') {
      const anchor = conduitNodeAtFloorPoint(px, py);
      if (!anchor || anchor.markerId) return [];
      const p0 = conduitNodePos(project, anchor);
      return project.conduitNodes
        .filter((n) => !n.markerId && project.conduitNodeFloorId(n) === project.activeFloorId)
        .map((n) => ({ n, p: conduitNodePos(project, n) }))
        .filter(({ p }) => p.x === p0.x && p.y === p0.y)
        .sort((a, b) => (b.p.z || 0) - (a.p.z || 0))
        .map(({ n }) => ({ kind: 'node', id: n.id }));
    }
    if (modes[currentMode].id === 'outlet_dims') {
      const anchor = markerAtFloorPoint(px, py);
      if (!anchor) return [];
      return project.markers
        .filter((m) => m.x === anchor.x && m.y === anchor.y)
        .sort((a, b) => (b.z || 0) - (a.z || 0))
        .map((m) => ({ kind: 'marker', id: m.id }));
    }
    return [];
  }

  // Grip in the DIMS first-ref phase: advance dimStackPick to the next member of the
  // vertical stack under the reticle, so a stacked node/marker can be singled out.
  function cycleDimStackPick() {
    const stack = hoverFloorPt ? dimStackAt(hoverFloorPt.px, hoverFloorPt.py) : [];
    if (stack.length < 2) return false;
    const idx = stack.findIndex((s) => s.id === dimStackPick);
    dimStackPick = stack[idx < 0 ? 0 : (idx + 1) % stack.length].id;
    rlog('dim stack cycle', { id: dimStackPick });
    return true;
  }

  // CONDUIT · EDIT selection stack: nodes and conduit segments compete by plan
  // distance, then grip advances through every overlap before trigger selects one.
  // A vertical segment collapses to a plan point but remains selectable here.
  function conduitEditTargetAtFloorPoint(px, py, currentKey = null, cycleAfterKey = null) {
    const candidates = [];
    const rank = pickRanker();
    project.conduitNodes.forEach((node, order) => {
      const r = rank(project.conduitNodeFloorId(node));
      if (r === Infinity) return;
      const p = conduitNodePos(project, node);
      const distance = Math.hypot(px - p.x, py - p.y);
      if (distance <= RETICLE_OUTER) candidates.push({
        kind: 'node', id: node.id, key: `node:${node.id}`, rank: r, distance, z: p.z || 0, order,
      });
    });
    conduitNetworkSegments(project).forEach((seg, order) => {
      const r = segRank(rank, seg);
      if (r === Infinity) return;
      const distance = planPointToSegment(px, py, seg.a, seg.b);
      if (distance <= WIRE_PICK_M) candidates.push({
        kind: 'segment', id: seg.id, key: `segment:${seg.id}`, rank: r,
        distance, z: Math.max(seg.a.z || 0, seg.b.z || 0), order,
      });
    });
    candidates.sort((a, b) => a.rank - b.rank || a.distance - b.distance
      || (a.kind === b.kind ? 0 : a.kind === 'node' ? -1 : 1)
      || b.z - a.z || a.order - b.order);
    if (!candidates.length) return null;
    // Reticle jitter may reorder this distance-sorted list. Preserve the current
    // highlight whenever it is still present; only an explicit grip cycles it.
    if (cycleAfterKey) {
      const current = candidates.findIndex((candidate) => candidate.key === cycleAfterKey);
      return candidates[current < 0 ? 0 : (current + 1) % candidates.length];
    }
    return candidates.find((candidate) => candidate.key === currentKey) || candidates[0];
  }

  // Live conduit-node drag, mirroring the waypoint drag: 'direct' carries the node
  // 1:1 with the controller tip in 3D; 'remote' lets the floor reticle drive X/Y
  // while z is held (typed on the height pad). Marker-bound nodes are immovable.
  function applyConduitNodeGripDrag(inputSource) {
    if (gripDrag?.kind !== 'conduitNode') return;
    const n = project.conduitNodes.find((nn) => nn.id === gripDrag.nodeId);
    if (!n || n.markerId) return;
    let nx = n.x, ny = n.y, nz = n.z || 0;
    if (gripDrag.mode === 'direct') {
      const tip = tipPosition(inputSource);
      if (!tip) return;
      const plan = worldToPlan(tip);
      const floorId = project.conduitNodeFloorId(n);
      const floorElevation = project.floors.find((floor) => floor.id === floorId)?.elevation || 0;
      // A datum-pinned node holds its height even in the 3D carry (defined dim wins).
      nx = plan.px; ny = plan.py; nz = n.zDatum ? (n.z || 0)
        : Math.max(0, tip.y - planPos.y - floorElevation);
    } else {
      const hit = rayFloorHit(inputSource);
      if (!hit) return;
      const plan = worldToPlan(hit);
      nx = plan.px; ny = plan.py; // z stays put; the pad owns height for remote nodes
    }
    project.moveConduitNode(n.id, { x: nx, y: ny, z: nz }, { emit: false });
    buildConduits();
  }

  // ---- Routed wires (over the conduit network) rendering + picking -------------
  // Each wire is drawn as one narrow dashed ribbon PER derived route segment, colored by its
  // nature. The route comes from src/core/conduit.js
  // (shortest path through the graph, threading the wire's `via` overrides), so it
  // is always live — no stored geometry. An unroutable wire simply draws nothing.
  // BATCHED like the conduit layer: PROJECT · PERF measured ~24 ms/frame of GPU for
  // one dashed-ribbon Mesh (own material) per wire leg. Now:
  //  - `base`: every wire's dashes in one mesh, per-vertex RGBA = type color at 0.5
  //    (the unrelated-wire look). Static until the next rebuild.
  //  - `overlay`: only the emphasized wires (selected/hovered yellow, rest of its
  //    circuit green) at full opacity, drawn above base (renderOrder 17), so the
  //    highlight wins where wires share a conduit. Rebuilt only when the emphasis
  //    set changes (styleRoutedWires).
  // Route legs are cached per wire here too, so floor picking tests what is drawn
  // instead of re-running every wire's Dijkstra route each frame.
  let wireBatch = null; // { base, overlay, quads: Map(wireId → Float32 positions), segs: Map, key }
  function buildRoutedWires() {
    for (const child of [...routedWireGroup.children]) {
      routedWireGroup.remove(child); child.geometry?.dispose(); child.material?.dispose();
    }
    routedWirePreviewLine = null; // the old preview was among the disposed children
    const quads = new Map(), segs = new Map();
    const positions = [], colors = [], index = [];
    const c = new THREE.Color();
    for (const wire of project.wires || []) {
      const legs = wireRouteSegments(project, wire);
      segs.set(wire.id, legs);
      const own = [];
      for (const seg of legs) {
        if (!touchesActiveFloor(seg)) continue; // draw the legs on this floor (incl. riser crossings)
        const ribbon = makeWireRibbon(planLocalZ(seg.a), planLocalZ(seg.b), wireTypeColor(wire));
        const pos = ribbon.geometry.attributes.position.array;
        const idx = ribbon.geometry.index.array;
        // makeWireRibbon emits 4 vertices + 6 indices per dash; flatten to triangles.
        for (const i of idx) own.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        ribbon.geometry.dispose(); ribbon.material.dispose();
      }
      if (!own.length) continue;
      quads.set(wire.id, own);
      c.setHex(wireTypeColor(wire));
      const base = positions.length / 3;
      for (let v = 0; v < own.length / 3; v++) { colors.push(c.r, c.g, c.b, 0.5); index.push(base + v); }
      for (const n of own) positions.push(n); // no spread: a long wire can exceed argument limits
    }
    const wireMaterial = () => new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    let baseMesh = null;
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4)); // RGBA → vertexAlphas
      geometry.setIndex(index);
      baseMesh = new THREE.Mesh(geometry, wireMaterial());
      baseMesh.renderOrder = 15; // above the 30 mm conduit ribbon
      baseMesh.frustumCulled = false;
      routedWireGroup.add(baseMesh);
    }
    const overlay = new THREE.Mesh(new THREE.BufferGeometry(), wireMaterial());
    overlay.renderOrder = 17;
    overlay.frustumCulled = false;
    overlay.visible = false;
    routedWireGroup.add(overlay);
    wireBatch = { base: baseMesh, overlay, quads, segs, key: '' };
  }
  // Per-frame wire emphasis: [wireId, colorHex] pairs, drawn in order (later on top).
  // Cheap when unchanged: the overlay geometry is rebuilt only when the list changes.
  function styleRoutedWires(emphasis) {
    if (!wireBatch) return;
    const key = emphasis.map(([id, color]) => `${id}:${color}`).join(',');
    if (key === wireBatch.key) return;
    wireBatch.key = key;
    const { overlay, quads } = wireBatch;
    const positions = [], colors = [];
    const c = new THREE.Color();
    for (const [id, color] of emphasis) {
      const own = quads.get(id);
      if (!own) continue;
      c.setHex(color);
      for (const n of own) positions.push(n);
      for (let v = 0; v < own.length / 3; v++) colors.push(c.r, c.g, c.b, 1);
    }
    overlay.geometry.dispose();
    overlay.geometry = new THREE.BufferGeometry();
    overlay.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    overlay.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    overlay.visible = positions.length > 0;
  }

  // ---- Plumbing graph (nodes + service-bearing pipe segments) -----------------
  const PIPE_SERVICE_COLOR = {
    cold: 0x38bdf8, hot: 0xef4444, heating_supply: 0xf97316, heating_return: 0x8b5cf6,
  };
  const pipeColor = (pipe) => PIPE_SERVICE_COLOR[pipe?.service] || PIPE_SERVICE_COLOR.cold;
  function pipeNodePos(node) {
    if (node?.markerId) {
      const found = project.findMarker(node.markerId);
      if (found) return { x: found.marker.x, y: found.marker.y,
        z: (found.floor.elevation || 0) + (found.marker.z || 0), floorId: found.floor.id };
    }
    const floor = project.floorById(node?.floorId);
    return { x: node?.x || 0, y: node?.y || 0,
      z: (floor?.elevation || 0) + (node?.z || 0), floorId: floor?.id || project.activeFloorId };
  }
  function buildPipes() {
    for (const child of [...pipeGroup.children]) {
      pipeGroup.remove(child); child.geometry?.dispose(); child.material?.dispose();
    }
    pipePreviewLine = null;
    for (const pipe of project.pipes || []) {
      const aNode = project.pipeNodes.find((n) => n.id === pipe.a);
      const bNode = project.pipeNodes.find((n) => n.id === pipe.b);
      const aWorld = aNode && pipeNodePos(aNode), bWorld = bNode && pipeNodePos(bNode);
      const a = aWorld && planLocalZ(aWorld), b = bWorld && planLocalZ(bWorld);
      if (!a || !b || (!allFloorsView && aWorld.floorId !== project.activeFloorId && bWorld.floorId !== project.activeFloorId)) continue;
      const ribbon = makeConduitRibbon(a, b, pipeColor(pipe), pipe.diameter || 0.016);
      ribbon.userData.pipeId = pipe.id;
      ribbon.userData.baseColor = pipeColor(pipe);
      pipeGroup.add(ribbon);
    }
    for (const node of project.pipeNodes || []) {
      const pWorld = pipeNodePos(node);
      if (!allFloorsView && pWorld.floorId !== project.activeFloorId) continue;
      const p = planLocalZ(pWorld);
      const mesh = new THREE.Mesh(conduitNodeGeom, new THREE.MeshBasicMaterial({
        color: 0xffffff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95,
      }));
      mesh.position.set(p.x, p.z, -p.y); mesh.renderOrder = 17;
      mesh.userData.pipeNodeId = node.id; pipeGroup.add(mesh);
    }
  }
  function pipeAtFloorPoint(px, py) {
    const rank = pickRanker();
    let best = null, bestD = WIRE_PICK_M, bestR = Infinity;
    for (const pipe of project.pipes || []) {
      const an = project.pipeNodes.find((n) => n.id === pipe.a), bn = project.pipeNodes.find((n) => n.id === pipe.b);
      const a = an && pipeNodePos(an), b = bn && pipeNodePos(bn);
      const r = a && b ? Math.min(rank(a.floorId), rank(b.floorId)) : Infinity;
      if (r === Infinity) continue;
      const d = planPointToSegment(px, py, a, b);
      if (d <= WIRE_PICK_M && (r < bestR || (r === bestR && d < bestD))) { bestR = r; bestD = d; best = pipe; }
    }
    return best;
  }
  function pipeTargetAtFloorPoint(px, py, afterKey = null) {
    const candidates = [];
    const rank = pickRanker();
    project.floors.forEach((floor, floorOrder) => {
      const r = rank(floor.id);
      if (r === Infinity) return;
      (floor.markers || []).forEach((marker, order) => {
        const distance = Math.hypot(px - marker.x, py - marker.y);
        if (distance <= RETICLE_OUTER) candidates.push({ kind: 'marker', item: marker, rank: r,
          key: `marker:${marker.id}`, distance, z: (floor.elevation || 0) + (marker.z || 0), order: floorOrder * 100000 + order });
      });
    });
    (project.pipeNodes || []).forEach((node, order) => {
      if (node.markerId) return; // its marker is the same logical target
      const p = pipeNodePos(node);
      const r = rank(p.floorId);
      if (r === Infinity) return;
      const distance = Math.hypot(px - p.x, py - p.y);
      if (distance <= RETICLE_OUTER) candidates.push({ kind: 'node', item: node, rank: r,
        key: `node:${node.id}`, distance, z: p.z || 0, order });
    });
    candidates.sort((a, b) => a.rank - b.rank || a.distance - b.distance
      || (a.kind === b.kind ? 0 : a.kind === 'marker' ? -1 : 1) || b.z - a.z || a.order - b.order);
    if (!candidates.length) return null;
    const current = candidates.findIndex((candidate) => candidate.key === afterKey);
    return candidates[(current + 1) % candidates.length];
  }

  // All routed wires whose plan projection passes within WIRE_PICK_M, nearest first.
  // Multiple wires commonly share exactly one conduit, so `afterId` advances through
  // that overlap stack instead of making the first-created wire permanently win.
  function routedWireAtFloorPoint(px, py, afterId = null) {
    const candidates = [];
    const rank = pickRanker();
    for (let order = 0; order < project.wires.length; order++) {
      const wire = project.wires[order];
      let bestD = Infinity, bestR = Infinity;
      // Cached legs from the last buildRoutedWires (what is drawn); live route as fallback.
      // A wire ranks by its nearest-storey leg under the reticle.
      for (const seg of wireBatch?.segs.get(wire.id) ?? wireRouteSegments(project, wire)) {
        const r = segRank(rank, seg);
        if (r === Infinity || (seg.a.x === seg.b.x && seg.a.y === seg.b.y)) continue;
        const d = planPointToSegment(px, py, seg.a, seg.b);
        if (d <= WIRE_PICK_M && (r < bestR || (r === bestR && d < bestD))) { bestR = r; bestD = d; }
      }
      if (bestR < Infinity) candidates.push({ wire, rank: bestR, distance: bestD, order });
    }
    candidates.sort((a, b) => a.rank - b.rank || a.distance - b.distance || a.order - b.order);
    if (!candidates.length) return null;
    const current = candidates.findIndex((item) => item.wire.id === afterId);
    return candidates[(current + 1) % candidates.length].wire;
  }

  // Every device in the connected wire component containing `wire`, whether the
  // component is a valid breaker-owned circuit, an unfinished unassigned run, or
  // an illegal multi-breaker conflict. Circuit inspection must remain useful while
  // a survey is incomplete, so it intentionally covers all three classifications.
  function wireComponent(wire) {
    if (!wire) return { markerIds: new Set(), wireIds: new Set() };
    const derived = deriveCircuits(project);
    const components = [...derived.circuits, ...derived.conflicts, ...derived.unassigned];
    const component = components.find((candidate) => candidate.wireIds.includes(wire.id));
    return {
      markerIds: new Set(component?.deviceIds || [wire.fromMarkerId, wire.toMarkerId]),
      wireIds: new Set(component?.wireIds || [wire.id]),
    };
  }

  // ---- Cross-floor authoring targets (risers + cross-floor wires) --------------
  // The floors immediately above and below the active one (its stack neighbors).
  function adjacentFloors() {
    const i = project.floors.findIndex((f) => f.id === project.activeFloorId);
    if (i < 0) return [];
    const out = [];
    if (i > 0) out.push(project.floors[i - 1]);
    if (i < project.floors.length - 1) out.push(project.floors[i + 1]);
    return out;
  }

  const adjacentTargetGeom = new THREE.SphereGeometry(0.026, 12, 12);
  // Draw the adjacent floors' pickable targets, dimmed at their true relative height
  // (planLocalZ): device markers in both CONDUIT and WIRE modes (a riser can terminate at
  // a box; a wire spans storeys between two boxes), plus bare conduit junctions in CONDUIT
  // mode. Each carries userData.adjacent = {kind, id, floorId} for the trigger handlers.
  function buildAdjacentTargets(modeId) {
    for (const child of [...adjacentGroup.children]) {
      adjacentGroup.remove(child); child.geometry?.dispose(); child.material?.dispose();
    }
    if (allFloorsView || !['marker_conduit', 'marker_wire', 'marker_pipe'].includes(modeId)) return;
    const wantNodes = modeId === 'marker_conduit';
    const addDot = (wp, adjacent, opacity) => {
      const p = planLocalZ(wp);
      const mesh = new THREE.Mesh(adjacentTargetGeom, new THREE.MeshBasicMaterial({
        color: 0x64748b, depthTest: false, depthWrite: false, transparent: true, opacity,
      }));
      mesh.position.set(p.x, p.z, -p.y);
      mesh.renderOrder = 15;
      mesh.userData.adjacent = adjacent;
      adjacentGroup.add(mesh);
    };
    for (const floor of adjacentFloors()) {
      for (const m of floor.markers || []) {
        addDot({ x: m.x, y: m.y, z: (floor.elevation || 0) + (m.z || 0) }, { kind: 'marker', id: m.id, floorId: floor.id }, 0.5);
      }
      if (wantNodes) {
        for (const node of project.conduitNodes) {
          if (node.markerId || project.conduitNodeFloorId(node) !== floor.id) continue;
          addDot(conduitNodePos(project, node), { kind: 'node', id: node.id, floorId: floor.id }, 0.6);
        }
      }
    }
  }

  // Nearest adjacent-floor target under the reticle (plan projection), or null.
  function adjacentTargetAtFloorPoint(px, py) {
    let best = null, bestD = RETICLE_OUTER;
    for (const child of adjacentGroup.children) {
      const a = child.userData.adjacent;
      if (!a) continue;
      let mx, my;
      if (a.kind === 'marker') { const f = project.findMarker(a.id); if (!f) continue; mx = f.marker.x; my = f.marker.y; }
      else { const n = project.conduitNodes.find((nn) => nn.id === a.id); if (!n) continue; const wp = conduitNodePos(project, n); mx = wp.x; my = wp.y; }
      const d = Math.hypot(px - mx, py - my);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  // Recolor adjacent-floor target dots each frame: the hovered one reads yellow + enlarged
  // (it will close a riser / cross-floor wire), the rest stay dim slate.
  function highlightAdjacentTargets(selectedCircuit = null) {
    const selectedEndpointIds = selectedRoutedWire
      ? new Set([selectedRoutedWire.fromMarkerId, selectedRoutedWire.toMarkerId])
      : selectedPipe ? new Set([selectedPipe.a, selectedPipe.b]
        .map((id) => project.pipeNodes.find((n) => n.id === id)?.markerId).filter(Boolean)) : null;
    for (const child of adjacentGroup.children) {
      const a = child.userData.adjacent;
      if (!a) continue;
      const hot = hoverAdjacent && hoverAdjacent.kind === a.kind && hoverAdjacent.id === a.id;
      const directEndpoint = a.kind === 'marker' && selectedEndpointIds?.has(a.id);
      const circuitMember = a.kind === 'marker' && selectedCircuit?.markerIds.has(a.id);
      const pendingEndpoint = a.kind === 'marker'
        && (wireFromMarker?.id === a.id || (pipePenNodeId
          && project.pipeNodes.find((n) => n.id === pipePenNodeId)?.markerId === a.id));
      const emphasized = hot || directEndpoint || circuitMember || pendingEndpoint;
      child.material.color.setHex(hot || directEndpoint || pendingEndpoint ? 0xffe14d
        : circuitMember ? CIRCUIT_CONNECTED_COLOR : 0x64748b);
      child.scale.setScalar(emphasized ? 1.6 : 1);
    }
  }

  // Read-only building overview: every independent plan stays aligned to the shared
  // origin and is lifted by its derived elevation. Dimensions and both marker glyphs
  // remain visible for reference, but none are published to the edit pickers.
  function buildAllFloors(withDims = true) {
    clearPlanGeometry();
    clearMarkers();
    clearZDims(); // Z-dims are an active-floor editing aid; the stacked overview omits them
    clearElectricalLinks();
    for (const floor of project.floors) {
      const elevation = floor.elevation;
      const footprint = getFootprint?.(floor.rectangles) ?? [];
      const fillGeo = footprintFloorGeometry(footprint);
      if (fillGeo) {
        const fill = new THREE.Mesh(fillGeo, fillMat);
        fill.position.y = elevation;
        planGroup.add(fill);
      }
      addZoneFills(floor, elevation); // faint per-kind tint for subtract zones
      addApertureGlyphs(floor, elevation);
      addFloorStrips(floor, elevation);
      if (withDims) buildDimensions(floor, elevation, false);
      if (withDims) addFloorMarkers(floor, elevation, true);
    }
    // Whole-house topology is rendered by conduitGroup/routedWireGroup in the
    // corresponding interactive ALL FLOORS tools, avoiding a duplicate inert copy.
    return planGroup.children.length > 0;
  }

  // ---- Furniture (real-scale GLB product models) — Milestone 1 spike -------------
  // A DRACO-enabled glTF loader shared by all furniture. The decoder is vendored to
  // public/draco/ (no CDN in the offline APK); BASE_URL resolves it under the Pages
  // subpath and in dev alike. IKEA GLBs are Draco + WebP, authored in METERS at true
  // scale with the floor at Y=0, so they drop straight into planGroup-local space.
  //
  // Models are NOT bundled: they load ON THE FLY from a CORS proxy (Cloudflare Worker
  // in tools/ikea-proxy/) at `${VITE_IKEA_PROXY}/<article>`, because IKEA's host
  // origin-allowlists direct browser fetches. See docs/furniture.md.
  const furnitureDraco = new DRACOLoader().setDecoderPath(import.meta.env.BASE_URL + 'draco/');
  const furnitureLoader = new GLTFLoader().setDRACOLoader(furnitureDraco);
  const furnitureSrc = new Map();     // article -> decoded source scene (cloned per instance)
  const furniturePending = new Map(); // article -> in-flight Promise (dedupe concurrent loads)
  let furnitureCatalog = {};          // article -> { name, sizeMm } (from public/furniture/index.json)
  const IKEA_PROXY = (import.meta.env.VITE_IKEA_PROXY || '').replace(/\/+$/, '');
  const furnitureUrl = (article) => (IKEA_PROXY ? `${IKEA_PROXY}/${article}` : null);
  const FURNITURE_CACHE = 'house-cad:furniture:v1'; // on-device GLB cache (offline reuse)
  let furnitureBuildToken = 0; // bumped per buildFurniture so stale async adds are dropped

  // Load the catalog (bundled, tiny) so box fallbacks + labels know real dimensions.
  fetch(import.meta.env.BASE_URL + 'furniture/index.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((c) => { furnitureCatalog = c || {}; if (!currentFurnitureArticle) currentFurnitureArticle = Object.keys(furnitureCatalog)[0] || null; })
    .catch(() => { furnitureCatalog = {}; });

  // A lit box at the model's real footprint, sitting on the floor (min.y = 0). Shown
  // when no proxy is configured, a fetch fails, or the model isn't decoded yet — so the
  // feature degrades gracefully and placement stays visible instead of vanishing.
  function furnitureBox(article) {
    const mm = furnitureCatalog[article]?.sizeMm || [600, 600, 600];
    const [w, h, d] = mm.map((v) => v / 1000);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x8a9aa5, transparent: true, opacity: 0.55 }),
    );
    mesh.position.y = h / 2; // BoxGeometry is centered; lift so its base is on the floor
    mesh.userData.furniturePlaceholder = article;
    return mesh;
  }

  // Fetch a GLB via the proxy, preferring the on-device Cache API so a model pulled once
  // works offline (on-site, no wifi). Returns the decoded source scene, cached in-memory
  // per article; concurrent requests for the same article share one promise.
  async function loadFurnitureSource(article) {
    if (furnitureSrc.has(article)) return furnitureSrc.get(article);
    if (furniturePending.has(article)) return furniturePending.get(article);
    const url = furnitureUrl(article);
    if (!url) throw new Error('no VITE_IKEA_PROXY');
    const p = (async () => {
      let buf;
      const cache = self.caches ? await caches.open(FURNITURE_CACHE) : null;
      const hit = cache && await cache.match(url);
      if (hit) { buf = await hit.arrayBuffer(); rlog('furniture cache hit', { article }); }
      else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`proxy ${res.status}`);
        if (cache) await cache.put(url, res.clone());
        buf = await res.arrayBuffer();
        rlog('furniture fetched', { article, kb: Math.round(buf.byteLength / 1024) });
      }
      const scene = await new Promise((resolve, reject) =>
        furnitureLoader.parse(buf, '', (gltf) => resolve(gltf.scene), reject));
      furnitureSrc.set(article, scene);
      return scene;
    })();
    furniturePending.set(article, p);
    try { return await p; } finally { furniturePending.delete(article); }
  }

  // --- FURNISH authoring state (M3) ---------------------------------------------
  let selectedFurnitureId = null;      // the placed item under edit (rotate/move/delete)
  let hoverFurnitureId = null;         // item under the reticle this frame
  let furnitureBuffer = '';            // FURNISH foot-elevation pad: typed digits (prefilled with z)
  let furniturePristine = false;       // buffer holds a prefilled value; first key replaces it
  let currentFurnitureArticle = null;  // the article the trigger drops; cycled by thumbstick-y
  const FURN_ROT_STEP = 15;            // degrees per thumbstick tick when an item is selected
  const furnitureArticleList = () => Object.keys(furnitureCatalog);
  const furnitureLabel = (article) => furnitureCatalog[article]?.name || article;

  // Give each instance its OWN materials (textures stay shared) so the hover/selected
  // emissive highlight applies per item, not to every clone of the same article.
  function instantiateFurniture(src) {
    const inst = src.clone();
    inst.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    });
    return inst;
  }

  // Rebuild furnitureGroup from the active floor's `furniture` array. Each item is placed
  // at plan (x,y) -> local (x, 0, -y), rotationY degrees about vertical. Models load async;
  // a build token guards against a floor switch landing an item from a stale rebuild.
  function buildFurniture(floor = project.activeFloor) {
    const token = ++furnitureBuildToken;
    // Remove previous instances. Instance materials are cloned per item (see
    // instantiateFurniture); dispose them so repeated rebuilds don't leak. Geometry +
    // textures belong to the cached source and are left intact.
    for (const child of [...furnitureGroup.children]) {
      furnitureGroup.remove(child);
      child.traverse?.((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.()); });
    }
    for (const item of floor.furniture || []) {
      const place = (obj) => {
        if (token !== furnitureBuildToken) return; // a newer rebuild superseded this one
        obj.position.set(item.x, item.z || 0, -item.y); // z = foot elevation off the floor
        obj.rotation.y = THREE.MathUtils.degToRad(item.rotationY || 0);
        obj.userData.furnitureId = item.id;
        furnitureGroup.add(obj);
      };
      loadFurnitureSource(item.article)
        .then((src) => place(instantiateFurniture(src)))
        .catch((err) => { place(furnitureBox(item.article)); rlog('furniture load → box', { article: item.article, err: String(err) }); });
    }
  }

  // Nearest placed furniture item under the reticle (by plan distance), for hover/pick.
  function furnitureAtFloorPoint(px, py) {
    let best = null, bestD = RETICLE_OUTER;
    for (const f of project.furniture) {
      const d = Math.hypot(px - f.x, py - f.y);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  // Thumbstick-y in FURNISH: rotate the selected item in FURN_ROT_STEP steps, or (nothing
  // selected) cycle the article the trigger will drop.
  function cycleFurnish(dir = 1) {
    if (selectedFurnitureId) {
      const f = project.furniture.find((x) => x.id === selectedFurnitureId);
      if (!f) return;
      project.rotateFurniture(f.id, (((f.rotationY || 0) + dir * FURN_ROT_STEP) % 360 + 360) % 360);
      buildFurniture();
      rlog('furniture rotate', { id: f.id, deg: f.rotationY });
      return;
    }
    const list = furnitureArticleList();
    if (!list.length) return;
    const i = Math.max(0, list.indexOf(currentFurnitureArticle));
    currentFurnitureArticle = list[(i + (dir > 0 ? 1 : -1) + list.length) % list.length];
    setModeInfo();
    rlog('furniture article', { article: currentFurnitureArticle });
  }

  // ---- FURNISH foot elevation: a selected GLB item's z (how high its base sits off
  // the floor) is typed on the reused numpad — a single value, like MARKER height. The
  // GLB's own mesh supplies the height; z only lifts it (wall-hung units, shelves).
  const selectedFurnitureObj = () =>
    selectedFurnitureId ? project.furniture.find((f) => f.id === selectedFurnitureId) : null;
  const furnitureTitle = () => {
    const f = selectedFurnitureObj();
    return `${(f?.name || f?.article || t('mode.furnish'))}  ·  ${t('furniture.foot')} ${datumWord('floor')}`;
  };
  // Foot elevation is floor-referenced only (furniture drags in-plane, never in Z), so
  // there is no datum toggle — the SWAP cell is inert (blank).
  const redrawFurniturePad = () => numpad.draw(furnitureTitle(), furnitureBuffer, hoverKey, ' ');

  function refreshFurniturePad() {
    const f = selectedFurnitureObj();
    furnitureBuffer = f ? fmt(f.z || 0) : '';
    furniturePristine = true;
    redrawFurniturePad();
  }

  function activateFurniturePad() {
    placePanel(numpad.group);
    numpad.group.visible = true;
    refreshFurniturePad();
  }

  function commitFurnitureFoot() {
    const f = selectedFurnitureObj();
    if (!f) return;
    const val = parseFloat(furnitureBuffer);
    if (!Number.isFinite(val) || val < 0) return; // 0 = on the floor / at the ceiling; negatives rejected
    project.setFurnitureVertical(f.id, 'floor', toMeters(val));
    rlog('furniture foot', { id: f.id, m: +toMeters(val).toFixed(3) });
    buildFurniture(); // z changed → the model re-seats at the new elevation
    refreshFurniturePad(); // keep it selected so it can be raised again
  }

  function pressFurnitureKey(k) {
    if (k === 'enter') { commitFurnitureFoot(); return; }
    if (k === 'swap') return; // foot is floor-referenced only — no datum toggle
    if (k === 'del') { deleteInMode(); deactivateNumpad(); return; } // remove the item
    if (furniturePristine && k !== 'back') furnitureBuffer = '';
    furniturePristine = false;
    if (k === 'back') furnitureBuffer = furnitureBuffer.slice(0, -1);
    else if (k === '.') { if (!furnitureBuffer.includes('.')) furnitureBuffer += '.'; }
    else if (furnitureBuffer.replace('.', '').length < 6) furnitureBuffer += k;
    redrawFurniturePad();
  }

  // Live furniture drag over the floor reticle (no ray-distance — furniture sits on the
  // floor). moveFurniture with {emit:false}; release commits once via touch().
  function applyFurnitureGripDrag(source) {
    if (gripDrag?.kind !== 'furniture') return;
    const hit = rayFloorHit(source);
    if (!hit) return;
    const { px, py } = worldToPlan(hit);
    project.moveFurniture(gripDrag.furnitureId, { x: px, y: py }, { emit: false });
    const clone = furnitureGroup.children.find((c) => c.userData.furnitureId === gripDrag.furnitureId);
    if (clone) clone.position.set(px, clone.position.y, -py); // preserve foot elevation (y)
  }

  // Emissive highlight (per-instance materials): reset all, then hover=yellow, selected=amber.
  function paintFurnitureHighlight() {
    const tint = (id, hex) => {
      if (!id) return;
      const obj = furnitureGroup.children.find((c) => c.userData.furnitureId === id);
      obj?.traverse((o) => { if (o.isMesh && o.material?.emissive) o.material.emissive.setHex(hex); });
    };
    for (const child of furnitureGroup.children) {
      child.traverse?.((o) => { if (o.isMesh && o.material?.emissive) o.material.emissive.setHex(0x000000); });
    }
    tint(hoverFurnitureId, 0x4a4416);   // dim yellow
    tint(selectedFurnitureId, 0x5a3d0a); // dim amber (wins if it coincides)
  }

  // All existing model-changing call sites rebuild through this dispatcher, so a
  // LOAD/unit change made while overviewing cannot silently fall back to one floor.
  // It also dirties the optional left-hand sheet; the frame loop throttles the
  // expensive 2048px raster refresh during continuous grip drags.
  function buildPlan(withDims = true) {
    sheetDirty = true;
    if (withDims) resetDimLabelAtlas(); // every label batch is rebuilt below (plan dims + Z-dims)
    const built = allFloorsView ? buildAllFloors(withDims) : buildActivePlan(withDims);
    if (pipeGroup.visible) buildPipes();
    return built;
  }

  let localSpace = null;
  let currentFrame = null;
  let anchor = null;
  let anchorPoseMissing = false;
  let placed = false;
  const saved = {};
  const planPos = new THREE.Vector3(); // last placed reference point (world)
  // Horizontal locomotion applied on top of the anchored survey frame. Moving the
  // CAD world beneath the stationary headset is the AR equivalent of teleporting;
  // the physical passthrough camera and the surveyed anchor remain untouched.
  const navOffset = new THREE.Vector3();
  let planYaw = 0;                     // plan rotation about vertical, set by REGISTER
  let anchorYaw = 0;                   // spatial-anchor yaw in the current local-floor space
  let floorY = 0;                      // shared ground datum; derived from any storey's real floor in FLOOR
  const STARTUP_EYE_HEIGHT = 1.5;      // provisional floor estimate until explicit calibration
  let startupPlacementPending = false;
  let startupPoseFrames = 0;
  let registerPts = [];                // REGISTER 3-point gesture: [P1,P2 along a wall, P3 on the perpendicular wall]
  let recalPts = [];                   // RECAL wall touches (world {x,z}): [P1,P2 along wall 1, P3 on wall 2]
  let recalCorner = null;              // {cx, cy, a, b} selected corner; after lock a=wall 1 end, b=wall 2 end
  let recalLocked = false;             // RECAL: corner + wall order explicitly selected (else still previewing)
  let prevRecalStep = null;            // last reticle step number drawn (redraw the badge only on change)
  let recalCornerCacheKey = null;       // composite edge intersections, rebuilt only when geometry changes
  let recalCornerCache = [];
  // MARKER · EDIT drop type. Cycled by B/Y (or thumbstick-y) while in the mode, like
  // LEVEL cycles floors. Session-level (persists across mode switches). Extend the list
  // for new fixture types; each also needs a markerFace() branch, a
  // marker.<type> i18n key, and serialize already round-trips the type.
  const MARKER_TYPES = [
    'outlet', 'outlet_shutter', 'outlet_aircon', 'outlet_cooktop',
    'outlet_oven', 'outlet_water_heater', 'outlet_appliance',
    'switch', 'light', 'ethernet', 'ethernet_dual', 'tv_antenna', 'camera_ethernet', 'patch_panel', 'intercom',
    'panel', 'breaker', 'radiator', 'boiler', 'sink', 'washing_machine',
  ];
  let currentMarkerType = MARKER_TYPES[0];
  // PLAN · ADD type, picked by thumbstick-y (same UX as the marker type picker) — one
  // ADD action instead of separate zone modes. ROOM adds; every other semantic
  // zone currently subtracts while keeping its distinct saved kind.
  let currentZoneKind = ZONE_KINDS[0]; // ZONE_KINDS + zoneKind imported from zoneColors.js
  const zoneOp = (k) => (k === 'room' ? 'add' : 'subtract');
  const zoneKindOf = (r) => zoneKind(r);
  const zoneColor = (k) => zoneColorHex(k); // shared per-kind palette (mode chip + HUD readouts)
  const UP = new THREE.Vector3(0, 1, 0);

  // SURVEY state. We author free-space rectangles and refine their edges by
  // pointing at an edge (ray) then touching the matching real wall.
  const surveyed = [];      // Rectangle ids this session, in creation order (for undo)
  let activeRect = null;    // the rectangle whose edges EDGE mode edits (last dropped)
  let selectedEdge = null;  // {rectId, edge} locked, awaiting a wall touch
  let edgePickKey = null;   // retained PLAN EDGE candidate; grip advances it before trigger lock
  let edgeSnapPrompt = false; // EDGE label currently shows the "snap to wall" state (edge locked)
  let hoverEdge = null;     // {rectId, edge} under the ray across ALL zones (per frame)
  let selectedRect = null;  // PLAN mode: the persistently-selected zone (survives aim)
  let hoverStack = [];      // PLAN mode: zones under the ray this frame, topmost-first
  let planEditPickAfterId = null;
  let roomComponentCacheKey = '';
  let roomComponentCache = null;
  let roomAreaHud = null;   // m² shown in the info panel for the selected room component
  let selectedMarker = null; // OUTLET mode: marker being height-edited
  let markerEditPickAfterId = null;
  let hoverMarker = null;    // OUTLET mode: marker under the pointer this frame
  let selectedLinkSwitch = null; // MARKER · LINK source; targets are toggled lights
  let markerLinkPickAfterId = null;
  // MARKER · WIRE (routed): the pending first endpoint of a new wire pair.
  let wireFromMarker = null;
  let wireEndpointPickAfterKey = null;
  let currentWireType = WIRE_TYPES[0];
  // MARKER · CONDUIT pen: the node the next segment grows from, plus per-frame hover.
  let penNodeId = null;
  let conduitPickAfterKey = null;
  // B/Y undo for the pen: one entry per trigger step, newest last. Records only what
  // the step CREATED (addConduitSegment / ensureConduitNodeAtMarker can return an
  // existing item), so undo never removes conduit that existed before the step.
  let conduitPenHistory = [];
  let hoverPenSplit = null; // the run (and split point) the pen would T into this frame
  let hoverConduitNode = null;
  // Cross-floor authoring: the adjacent-floor target under the reticle this frame, if any
  // — {kind:'node'|'marker', id, floorId, x, y}. A CONDUIT/WIRE trigger connects to it.
  let hoverAdjacent = null;
  let conduitPreviewLine = null; // live pen preview (pen node → tip), lives in conduitGroup
  // CONDUIT · EDIT: grip cycles a combined node/segment stack before trigger selection.
  let selectedConduitNodeId = null;
  let selectedConduitSegmentId = null;
  let conduitEditHoverKey = null;     // stable while the highlighted candidate remains eligible
  let conduitEditPickAfterKey = null; // one-frame grip request to advance past this candidate
  let hoverConduitSegmentId = null;
  let nodeBuffer = '';        // CONDUIT EDIT height pad: the selected free junction's z
  let nodePristine = false;
  // MARKER · WIRE (routed): the selected wire (for via override) + per-frame hover.
  let selectedRoutedWire = null;
  let hoverRoutedWire = null;
  let routedWirePickAfterId = null;
  let routedWirePreviewLine = null; // live pending-pair preview (from marker → hovered/tip)
  let pipePenNodeId = null;
  let pipePickAfterKey = null;
  let hoverPipeNode = null;
  let pipePreviewLine = null;
  let pendingPipeMerge = null; // {sourceNodeId,targetNodeId,service}; second trigger confirms
  let selectedPipe = null;
  let hoverPipe = null;
  let currentPipeService = PIPE_SERVICES[0];
  let markerBuffer = '';     // OUTLET height pad: typed digits (prefilled with the marker's z)
  let markerPristine = false; // markerBuffer holds a prefilled value; first key replaces it
  // Datum for the marker / node height pads: 'floor' = a defined height above the floor
  // (holds in a 3D grab), 'free' = undefined (grab moves Z). SWAP toggles the two; the
  // typed value is always the floor-referenced height. (Furniture foot is floor-only.)
  let markerDatum = 'floor';
  let nodeDatum = 'floor';
  // PLAN EDIT band pad: type a selected rect's vertical-band bounds (aperture sill/head
  // or furniture foot/top). One field at a time; the SWAP cell cycles which. Buffer
  // prefilled from the rect.
  let bandBuffer = '';
  let bandPristine = false;
  let bandField = 'sill'; // which band bound the pad currently edits (sill/head/foot/top)

  // Shared state for the two hard-separated dimension domains. PLAN DIMS accepts
  // edge<->edge and edge<->origin pairs. OUTLET DIMS requires an outlet floor icon
  // first, then an edge. Neither mode can select or mutate the other's constraints.
  let dimRefA = null;       // first-picked reference (the anchor, like desktop)
  let dimRefB = null;       // second-picked reference
  let hoverRef = null;      // reference under the ray this frame (edge or origin)
  let hoverFloorPt = null;  // {px,py} reticle floor point this frame during DIMS ref-pick
  let dimStackPick = null;  // in DIMS first-ref phase, the chosen member id of a vertical stack (grip cycles it)
  let planDimPickKey = null; // retained PLAN DIMS edge/origin candidate; grip advances it
  let dimOffsetPt = null;   // {px,py} captured when a pair completes -> new dim's default line placement
  let hoverDim = null;      // dim value panel under the ray this frame (to select/edit a constraint)
  let gripDrag = null;      // active grip-drag: selected edge, dim panel, marker, furniture, or conduit node
  let dimBuffer = '';       // typed digits (prefilled with the current value when editing)
  let editingId = null;     // id of the constraint being edited (if it already existed)
  let dimConflict = false;  // last commit was refused (would over-constrain); shown on the numpad, cleared on next key
  let translateTargets = { x: null, y: null }; // rigid TRANSLATE target per axis: {ref,value}
  let translateEdge = null; // edge currently awaiting its desired origin coordinate
  let translateBuffer = '';
  let translatePristine = false;
  let translateSign = 1;
  let hoverKey = null;      // numpad key under the ray this frame
  let prevHoverKey = null;  // last drawn hover (redraw only on change)
  let hoverSlot = null;     // SAVE/LOAD slot under the ray this frame (0-based)
  let prevHoverSlot = null; // last drawn slot hover
  let hoverSlotAction = null;     // overwrite screen button under the ray: confirm/cancel
  let prevHoverSlotAction = null; // last drawn overwrite-button hover
  let hoverLang = null;     // LANG menu row under the ray this frame (lang code)
  let prevHoverLang = null; // last drawn lang hover
  let hoverUnit = null;     // UNIT menu row under the ray this frame (unit id)
  let prevHoverUnit = null; // last drawn unit hover
  let hoverExportAction = null;     // output toggle or explicit export button under the ray
  let prevHoverExportAction = null;
  let slotFlash = null;     // transient panel title after a save/load ("SAVED 3"), cleared on next hover change
  let overwriteSlot = null; // occupied SAVE slot armed for a required second trigger
  let levelBuffer = '';     // LEVEL mode: typed storey-height digits (prefilled with the floor's current height)
  let levelPristine = false; // levelBuffer holds a prefilled value; first key replaces it

  // World point -> plan (x, y). extrude.js maps plan (x, y) -> planGroup-local
  // (x, 0, -y), and planGroup adds anchorYaw + planYaw + planPos; worldToLocal inverts all
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
  // A normal view is seated on the active storey. ALL FLOORS instead seats the
  // parent group on the registered ground datum because each child is already
  // lifted by its own elevation.
  const displayElevation = () => (allFloorsView ? 0 : activeElevation());
  const overlayY = () => planPos.y + displayElevation();

  // navOffset lives in the SURVEY ANCHOR'S horizontal frame, not raw local-floor
  // coordinates. Quest may relocalize local-floor after the headset sleeps; the
  // anchor then reports a translated + rotated pose. Keeping navigation anchor-local
  // makes teleport and viewer-pivot yaw follow that correction instead of jumping.
  const planGroupWorldXZ = () => {
    const c = Math.cos(anchorYaw), s = Math.sin(anchorYaw);
    return {
      x: planPos.x + navOffset.x * c + navOffset.z * s,
      z: planPos.z - navOffset.x * s + navOffset.z * c,
    };
  };
  const setNavOffsetForWorldXZ = (x, z) => {
    const wx = x - planPos.x, wz = z - planPos.z;
    const c = Math.cos(anchorYaw), s = Math.sin(anchorYaw);
    // R_y(anchorYaw)^-1 · world delta.
    navOffset.x = wx * c - wz * s;
    navOffset.z = wx * s + wz * c;
  };

  // Rebuild the plan's transform from its origin (planPos), yaw (planYaw), and the
  // selected display's elevation lift. Drive position/quaternion (not .matrix)
  // so Three keeps matrixWorld in sync.
  function applyPlanMatrix() {
    const p = planGroupWorldXZ();
    planGroup.position.set(p.x, overlayY(), p.z);
    planGroup.quaternion.setFromAxisAngle(UP, anchorYaw + planYaw);
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
  // reticle wins. Shared by EDGE and DIMS ref-picking. Returns {rectId, edge} | null.
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

  const edgeRefKey = (ref) => ref ? `${ref.rectId}:${ref.edge}` : null;

  // Deterministic edge candidates for deliberate grip cycling. Pointer distance only
  // decides membership in the reticle, never order: vertical edges increase by X,
  // then horizontal edges increase by Y, with stable segment/id tie-breakers.
  function orderedEdgesAtPoint(px, py) {
    const candidates = [];
    for (const r of project.rectangles) {
      const b = r.bounds;
      const segs = [
        ['left', b.x0, b.y0, b.x0, b.y1], ['right', b.x1, b.y0, b.x1, b.y1],
        ['bottom', b.x0, b.y0, b.x1, b.y0], ['top', b.x0, b.y1, b.x1, b.y1],
      ];
      for (const [edge, ax, ay, bx, by] of segs) {
        if (ptSegDist(px, py, ax, ay, bx, by) >= EDGE_PICK_M) continue;
        const vertical = isXEdge(edge);
        candidates.push({
          ref: { rectId: r.id, edge }, axisOrder: vertical ? 0 : 1,
          coord: vertical ? ax : ay,
          lo: vertical ? Math.min(ay, by) : Math.min(ax, bx),
          hi: vertical ? Math.max(ay, by) : Math.max(ax, bx),
          id: String(r.id),
        });
      }
    }
    return candidates
      .sort((a, b) => a.axisOrder - b.axisOrder || a.coord - b.coord || a.lo - b.lo || a.hi - b.hi
        || a.id.localeCompare(b.id) || a.ref.edge.localeCompare(b.ref.edge))
      .map(({ ref }) => ref);
  }

  function retainedEdgeAtPoint(px, py, key) {
    const refs = orderedEdgesAtPoint(px, py);
    return refs.find((ref) => edgeRefKey(ref) === key) || refs[0] || null;
  }

  function cycleEdgePick() {
    if (!hoverFloorPt) return false;
    const refs = orderedEdgesAtPoint(hoverFloorPt.px, hoverFloorPt.py);
    if (refs.length < 2) return false;
    const currentKey = edgeRefKey(hoverEdge) || edgePickKey;
    const current = refs.findIndex((ref) => edgeRefKey(ref) === currentKey);
    const next = refs[(current < 0 ? 0 : current + 1) % refs.length];
    edgePickKey = edgeRefKey(next);
    hoverEdge = next;
    rlog('edge target cycle', { key: edgePickKey });
    return true;
  }

  const planDimRefKey = (ref) => ref?.kind === 'origin'
    ? 'origin'
    : ref?.kind === 'edge' ? `edge:${ref.rectId}:${ref.edge}` : null;

  // PLAN DIMS deliberately does not rank overlapping edges by pointer distance: that
  // made the highlighted edge jump whenever a hand shook around a shared wall/corner.
  // Gather everything inside the reticle and use a geometry-only order: origin, then
  // vertical edges by increasing X, then horizontal edges by increasing Y. Segment
  // bounds and persistent ids provide deterministic tie-breakers for coincident edges.
  function planDimRefsAtPoint(px, py) {
    const candidates = [];
    if (Math.hypot(px, py) < 0.12) candidates.push({ ref: { kind: 'origin' }, axisOrder: -1, coord: 0, lo: 0, hi: 0, id: '' });
    for (const edgeRef of orderedEdgesAtPoint(px, py)) {
      candidates.push({ ref: { kind: 'edge', ...edgeRef } });
    }
    return candidates.map(({ ref }) => ref)
      .filter((ref) => !dimRefA || (!refsEqual(ref, dimRefA) && refsCompatible(dimRefA, ref)));
  }

  function planDimRefAtPoint(px, py) {
    const refs = planDimRefsAtPoint(px, py);
    if (!refs.length) return null;
    return refs.find((ref) => planDimRefKey(ref) === planDimPickKey) || refs[0];
  }

  function cyclePlanDimPick() {
    if (!hoverFloorPt) return false;
    const refs = planDimRefsAtPoint(hoverFloorPt.px, hoverFloorPt.py);
    if (refs.length < 2) return false;
    const currentKey = planDimRefKey(hoverRef) || planDimPickKey;
    const current = refs.findIndex((ref) => planDimRefKey(ref) === currentKey);
    const next = refs[(current < 0 ? 0 : current + 1) % refs.length];
    planDimPickKey = planDimRefKey(next);
    hoverRef = next; // immediate visual response; the next XR frame retains this key
    rlog('plan dim target cycle', { key: planDimPickKey });
    return true;
  }

  // All zones containing a plan point, TOPMOST (last-created) first — PLAN mode's
  // overlap stack, which the trigger cycles down through.
  function rectsAtPoint(px, py) {
    const out = [];
    const rects = project.rectangles;
    for (let i = rects.length - 1; i >= 0; i--) if (rects[i].contains(px, py)) out.push(rects[i]);
    return out;
  }

  // Connected-room geometry changes only when ROOM bounds/type or the selection
  // changes. Cache the polygon union so PLAN · EDIT's frame loop does not run
  // polygon clipping at headset frame rate.
  function selectedRoomComponent() {
    if (!selectedRect || zoneKindOf(selectedRect) !== 'room') return null;
    const signature = project.rectangles
      .filter((r) => zoneKindOf(r) === 'room')
      .map((r) => {
        const b = r.bounds;
        return `${r.id}:${b.x0},${b.y0},${b.x1},${b.y1}`;
      })
      .join('|');
    const key = `${project.activeFloorId}:${selectedRect.id}:${signature}`;
    if (key !== roomComponentCacheKey) {
      roomComponentCacheKey = key;
      roomComponentCache = connectedRoomComponent(project.rectangles, selectedRect);
    }
    return roomComponentCache;
  }

  // Area of the selected zone for the info panel: a ROOM shows its connected-room
  // component net area (cutouts deducted); any other kind shows its own rectangle
  // footprint. null when nothing is selected.
  function selectedZoneArea() {
    if (!selectedRect) return null;
    if (zoneKindOf(selectedRect) === 'room') return selectedRoomComponent()?.area ?? null;
    const b = selectedRect.bounds;
    const a = (b.x1 - b.x0) * (b.y1 - b.y0);
    return a > 0 ? a : null;
  }

  function updateRoomAreaHud() {
    const next = selectedZoneArea();
    if (next === roomAreaHud) return;
    roomAreaHud = next;
    lastHudAt = -Infinity; // redraw next frame instead of waiting for the 2 Hz diagnostic cadence
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

  // Nearest structural edge intersection to a plan point. Unlike rectangle-owned
  // corners, this includes composite corners/T-junctions whose horizontal and
  // vertical edges belong to different zones (for example ROOM + INSULATION).
  function nearestPlanCorner(px, py) {
    const signature = project.rectangles
      .filter((r) => zoneKind(r) !== 'furniture')
      .map((r) => {
        const b = r.bounds;
        return `${r.id}:${b.x0}:${b.y0}:${b.x1}:${b.y1}`;
      })
      .join('|');
    const key = `${project.activeFloorId}:${signature}`;
    if (key !== recalCornerCacheKey) {
      recalCornerCacheKey = key;
      recalCornerCache = recalibrationCorners(project.rectangles);
    }
    let best = null, bestD = Infinity;
    for (const corner of recalCornerCache) {
      const d = Math.hypot(px - corner.cx, py - corner.cy);
      if (d < bestD) { bestD = d; best = corner; }
    }
    return best;
  }

  // Order a corner's two walls so that a = "wall 1" = the wall the reticle (px,py) is
  // hugging, b = "wall 2" = the other. corner.a is the X-edge (horizontal), corner.b
  // the Y-edge (vertical); the reticle is nearer the horizontal wall when its vertical
  // offset from the corner is the smaller one. Lets you pick which wall is 1 by aiming.
  function orderWallsByReticle(corner, px, py) {
    const offX = Math.abs(px - corner.cx), offY = Math.abs(py - corner.cy);
    const closerToHorizontal = offY < offX; // hugging the X-edge (corner.a)
    const w1 = closerToHorizontal ? corner.a : corner.b;
    const w2 = closerToHorizontal ? corner.b : corner.a;
    return { cx: corner.cx, cy: corner.cy, a: w1, b: w2 };
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
    // P1 -> P2 is explicitly INWARD toward the corner. Map the selected plan
    // wall's matching endpoint -> corner ray onto that directed physical vector.
    // Unlike the old +/-X/+/-Y guess, this has one solution and deliberately makes
    // reversed samples produce the reversed orientation.
    const Pdx = corner.cx - corner.a.x;
    const Pdy = corner.cy - corner.a.y;
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

  // --- PLAN DIMS / OUTLET DIMS (S2 numpad) helpers ---

  const isXEdge = (e) => e === 'left' || e === 'right';
  const isDimMode = (id) => id === 'plan_dims' || id === 'outlet_dims' || id === 'conduit_dims';
  // A distance constraint's authoring domain, matched against the active DIMS mode.
  const dimDomain = (c) => isMarkerConstraint(c) ? 'marker' : isNodeConstraint(c) ? 'node' : 'plan';
  // The DIMS domain each mode owns (plan_dims → 'plan', outlet_dims → 'marker', conduit_dims → 'node').
  const modeDomain = (id) => id === 'outlet_dims' ? 'marker' : id === 'conduit_dims' ? 'node' : 'plan';
  let bufferPristine = false; // buffer holds a prefilled value; first key replaces it

  // A reference is a rect EDGE, the plan ORIGIN axis, a MARKER, or a conduit NODE
  // (both markers and bare junctions pin one-way to a wall).
  const markerOf = (ref) => project.markers.find((m) => m.id === ref.markerId);
  const nodeOf = (ref) => project.conduitNodes.find((n) => n.id === ref.nodeId);
  const refLabel = (ref) => (!ref ? '?'
    : ref.kind === 'origin' ? t('ref.origin')
    : ref.kind === 'marker' ? t(`marker.${markerOf(ref)?.type ?? 'outlet'}`)
    : ref.kind === 'node' ? t('ref.node')
    : t(`edge.${ref.edge}`));
  const refsEqual = (a, b) =>
    !!a && !!b && a.kind === b.kind &&
    (a.kind === 'origin' ? true
      : a.kind === 'marker' ? a.markerId === b.markerId
      : a.kind === 'node' ? a.nodeId === b.nodeId
      : (a.rectId === b.rectId && a.edge === b.edge));

  // Two refs can be dimensioned if they lie on the same coordinate axis (and are not
  // the same target). An edge pairs with the origin on its own axis. A MARKER or NODE
  // pin must pair with a rect EDGE (the edge supplies the axis) — pin+pin / pin+origin
  // have no axis source and are disallowed.
  function refsCompatible(a, b) {
    const ap = a.kind === 'marker' || a.kind === 'node', bp = b.kind === 'marker' || b.kind === 'node';
    if (ap || bp) return (ap && b.kind === 'edge') || (bp && a.kind === 'edge');
    if (a.kind === 'origin' && b.kind === 'origin') return false;
    if (a.kind === 'edge' && b.kind === 'edge') {
      if (refsEqual(a, b)) return false;
      return isXEdge(a.edge) === isXEdge(b.edge);
    }
    return true; // edge + origin
  }

  const rectOf = (ref) => project.rectangles.find((r) => r.id === ref.rectId);

  // The axis a pair is dimensioned on = the axis of whichever ref is an edge.
  const pairAxis = (a, b) => {
    const e = a.kind === 'edge' ? a : (b.kind === 'edge' ? b : null);
    return e ? (isXEdge(e.edge) ? 'x' : 'y') : 'x';
  };
  // A reference's plan coordinate on the given axis (origin = 0, marker = its x/y).
  const coordOnAxis = (ref, axis) =>
    ref.kind === 'origin' ? 0
      : ref.kind === 'marker' ? (markerOf(ref)?.[axis] ?? 0)
      : ref.kind === 'node' ? (nodeOf(ref)?.[axis] ?? 0)
      : edgeCoord(rectOf(ref), ref.edge);
  // The distance a pair currently spans, in the display unit — used to prefill the
  // numpad with the value you're already at, so entering size edits from the real
  // measurement rather than from a blank field.
  const currentSpan = (a, b) => { const ax = pairAxis(a, b); return Math.abs(coordOnAxis(b, ax) - coordOnAxis(a, ax)); };

  // Find an existing distance constraint between two references (either order).
  function findConstraintForRefs(a, b) {
    const markerRef = a.kind === 'marker' ? a : (b.kind === 'marker' ? b : null);
    if (markerRef) {
      const e = markerRef === a ? b : a; // the edge endpoint
      return project.constraints.find((k) =>
        (k.a.marker === markerRef.markerId || k.b.marker === markerRef.markerId) &&
        ((k.a.rect === e.rectId && k.a.edge === e.edge) || (k.b.rect === e.rectId && k.b.edge === e.edge)),
      ) || null;
    }
    const nodeRef = a.kind === 'node' ? a : (b.kind === 'node' ? b : null);
    if (nodeRef) {
      const e = nodeRef === a ? b : a; // the edge endpoint
      return project.constraints.find((k) =>
        (k.a.node === nodeRef.nodeId || k.b.node === nodeRef.nodeId) &&
        ((k.a.rect === e.rectId && k.a.edge === e.edge) || (k.b.rect === e.rectId && k.b.edge === e.edge)),
      ) || null;
    }
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
    const markerRef = a.kind === 'marker' ? a : (b.kind === 'marker' ? b : null);
    if (markerRef) {
      const e = markerRef === a ? b : a; // the wall edge (anchor)
      const m = markerOf(markerRef);
      const axis = isXEdge(e.edge) ? 'x' : 'y';
      // At most one pin per (marker, axis): drop any existing same-axis pin first so
      // picking a different wall RE-ANCHORS cleanly instead of stacking pins.
      for (const k of [...project.constraints]) {
        if ((k.a.marker === m.id || k.b.marker === m.id) && k.axis === axis) project.removeConstraint(k.id);
      }
      const mc = makeMarkerDistance(m, rectOf(e), e.edge);
      project.addConstraint(mc);
      return mc;
    }
    const nodeRef = a.kind === 'node' ? a : (b.kind === 'node' ? b : null);
    if (nodeRef) {
      const e = nodeRef === a ? b : a; // the wall edge (anchor)
      const n = nodeOf(nodeRef);
      const axis = isXEdge(e.edge) ? 'x' : 'y';
      // At most one pin per (node, axis): drop any existing same-axis node pin first so
      // picking a different wall RE-ANCHORS cleanly instead of stacking pins.
      for (const k of [...project.constraints]) {
        if ((k.a.node === n.id || k.b.node === n.id) && k.axis === axis) project.removeConstraint(k.id);
      }
      const nc = makeNodeDistance(n, rectOf(e), e.edge);
      project.addConstraint(nc);
      return nc;
    }
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
    dimStackPick = null;
    planDimPickKey = null;
    editingId = null;
    dimOffsetPt = null;
    dimBuffer = '';
    bufferPristine = false;
    dimConflict = false;
    numpad.group.visible = false; // back to ref-pick: the pad has no role until a pair is chosen
    numpadCursor.visible = false;
  }

  function dimTitle() {
    if (!dimRefA) {
      const id = modes[currentMode]?.id;
      return t(id === 'outlet_dims' ? 'dim.pickOutlet' : id === 'conduit_dims' ? 'dim.pickNode' : 'dim.pickPlan');
    }
    if (!dimRefB) return refLabel(dimRefA) + '  <->  ?';
    return refLabel(dimRefA) + '  <->  ' + refLabel(dimRefB) + (editingId ? '  ' + t('dim.edit') : '');
  }

  const redrawNumpad = () => numpad.draw(dimTitle() + (dimConflict ? '  ' + t('dim.conflict') : ''), dimBuffer, hoverKey);

  const conflictCount = () => project.constraints.reduce((n, k) => n + (k.conflict ? 1 : 0), 0);

  function commitEntry() {
    if (!dimRefA || !dimRefB) return;
    const val = parseFloat(dimBuffer);
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
    // Default a NEW dim's line placement to where the tip stood when the pair was made
    // (after the solve, so edgeLine reflects final geometry — same baseline the dim draws at).
    if (!existing && dimOffsetPt) setDimOffset(c, dimOffsetPt.px, dimOffsetPt.py);
    rlog('dim set', { a: refLabel(dimRefA), b: refLabel(dimRefB), meters: +meters.toFixed(3) });
    const wasNode = isNodeConstraint(c);
    resetDim();
    buildPlan();       // solver changed geometry; refresh the MR view
    // A node pin moved the junction, but buildPlan doesn't touch the mode-gated conduit
    // group — redraw it so the node sphere snaps to its new (pinned) position.
    if (wasNode) buildConduits();
    applyPlanMatrix();
    redrawNumpad();
  }

  // 🗑 DEL: remove the constraint for the current pair (existing or just-loaded), then
  // clear the pad. For a NEW pair with no constraint yet, DEL cancels the in-progress
  // definition and closes the pad (same "clear + back to ref-pick" result either way).
  function deleteDim() {
    if (!dimRefA || !dimRefB) return;
    const c = editingId ? project.constraints.find((k) => k.id === editingId)
                        : findConstraintForRefs(dimRefA, dimRefB);
    const wasNode = c && isNodeConstraint(c);
    if (c) { project.removeConstraint(c.id); rlog('dim delete', { id: c.id }); }
    else rlog('dim cancel (no constraint)');
    resetDim();
    buildPlan();
    if (wasNode) buildConduits(); // refresh the freed junction's node sphere / highlight state
    applyPlanMatrix();
    redrawNumpad();
  }

  // B/Y delete in a DIMS mode (where "the selected item" is a dimension constraint): a
  // completed pair removes its constraint (deleteDim); otherwise a hovered existing dim
  // label is removed directly. No-op when nothing is targeted. Returns true if it removed.
  function deleteDimContext() {
    if (dimRefA && dimRefB) { deleteDim(); return true; }
    if (hoverDim) {
      const c = project.constraints.find((k) => k.id === hoverDim.userData.cId);
      if (c) {
        const wasNode = isNodeConstraint(c);
        project.removeConstraint(c.id);
        rlog('dim delete (hover)', { id: c.id });
        resetDim(); buildPlan(); if (wasNode) buildConduits(); applyPlanMatrix(); redrawNumpad();
        return true;
      }
    }
    return false;
  }

  // Live update for a dimension-panel or selected-edge grip-drag. A dim uses the
  // perpendicular component for its line and the parallel component for its label;
  // an edge follows the reticle only after trigger has explicitly locked it.
  // Place a dimension's perpendicular line marker at the plan floor point (px,py) —
  // the signed offset the dim line sits at. Origin dims store the absolute coord;
  // edge<->edge dims store it relative to the outer edge (the auto-stack baseline),
  // matching buildDimensions. Shared by grip-drag and the default-on-create placement.
  function setDimOffset(c, px, py) {
    if (isMarkerConstraint(c) || isNodeConstraint(c)) {
      // Pin dims (marker/node) store the absolute perpendicular coord, matching
      // buildDimensions (yLine/xLine default to the pinned point's own coord).
      c.offset = c.axis === 'x' ? py : px;
      return;
    }
    const aOrigin = c.a.rect === ORIGIN_ID, bOrigin = c.b.rect === ORIGIN_ID;
    if (aOrigin || bOrigin) {
      c.offset = isXEdge(aOrigin ? c.b.edge : c.a.edge) ? py : px; // origin dim: absolute perpendicular coord
      return;
    }
    const la = edgeLine(c.a), lb = edgeLine(c.b);
    if (!la || !lb) return;
    c.offset = c.axis === 'x' ? py - Math.max(la.p1.y, lb.p1.y) : px - Math.max(la.p1.x, lb.p1.x);
  }

  // Persist the value box's parallel position as an affine coordinate along the
  // measured span. Values outside 0..1 put it beyond either edge; the affine form
  // survives endpoint swaps and later geometry edits.
  function setDimLabelPosition(c, px, py) {
    const endpointCoord = (ep) => {
      if (ep.marker) return project.markers.find((m) => m.id === ep.marker)?.[c.axis];
      if (ep.node) return project.conduitNodes.find((n) => n.id === ep.node)?.[c.axis];
      if (ep.rect === ORIGIN_ID) return 0;
      const rect = project.rectangles.find((r) => r.id === ep.rect);
      return rect ? edgeCoord(rect, ep.edge) : null;
    };
    const a = endpointCoord(c.a), b = endpointCoord(c.b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    setDimLabelCoord(c, c.axis === 'x' ? px : py, a, b);
  }

  function applyGripDrag(px, py) {
    if (!gripDrag) return;
    if (gripDrag.kind === 'dim') {
      const c = project.constraints.find((k) => k.id === gripDrag.cId);
      if (!c) return;
      setDimOffset(c, px, py);
      setDimLabelPosition(c, px, py);
      // Presentational: no re-solve, and geometry/markers/electrical are unchanged, so
      // rebuild only the dimensions (not the whole plan). The group transform is also
      // unchanged, so applyPlanMatrix is unnecessary.
      rebuildDimsOnly();
    } else if (gripDrag.kind === 'edge') {
      const rect = project.rectangles.find((r) => r.id === gripDrag.rectId);
      if (!rect) return;
      setEdge(rect, gripDrag.edge, px, py);
      // Keep live dragging inside the AR renderer. Release emits one model update so
      // desktop/output listeners catch up without running their work every XR frame.
      project.solveSilently();
      buildPlan(false);
      buildDimensions(project.activeFloor);
      applyPlanMatrix();
    }
  }

  const _dragPoint = new THREE.Vector3();
  function applyMarkerGripDrag(inputSource) {
    if (gripDrag?.kind !== 'marker' || !setControllerRay(inputSource)) return;
    const marker = project.markers.find((m) => m.id === gripDrag.markerId);
    if (!marker) return;
    _dragPoint.copy(_ro).addScaledVector(_rd, gripDrag.distance);
    const { px, py } = worldToPlan(_dragPoint);
    // Respect the defined dims on EACH axis: a locked axis does NOT follow the grab, so
    // only the free axes move. X/Y lock from their distance pins (solveMarkers sets
    // marker._locked); Z locks when it carries a datum pin (a defined vertical dim). A
    // fully-dimensioned marker holds still; a wall-pinned marker at a fixed height won't
    // drift up/down as you slide it — the grab is 3D but constrained by whatever is set.
    const nx = marker._locked?.x ? marker.x : px;
    const ny = marker._locked?.y ? marker.y : py;
    const nz = marker.zDatum ? marker.z : Math.max(0, _dragPoint.y - overlayY());
    // Update marker coordinates + pin offsets without emitting the project's full
    // solve/listener cascade every XR frame. Release commits once via project.touch().
    project.moveMarker(
      marker.id,
      { x: nx, y: ny, z: nz },
      { emit: false },
    );
    // Move the existing visuals directly during the drag; on release, buildPlan
    // restores canonical rendering after the single committed model notification.
    for (const visual of markerGroup.children) {
      if (visual.userData.markerId !== marker.id) continue;
      if (visual.userData.markerRole.startsWith('wall')) visual.position.set(marker.x, marker.z, -marker.y);
      else visual.position.set(marker.x, visual.userData.markerRole === 'floor-outline' ? 0.018 : 0.016, -marker.y);
    }
    refreshMarkerBatches(); // the glyph batches draw from the proxies just moved
  }

  function pressKey(k) {
    if (k === 'enter') { commitEntry(); return; }
    if (k === 'swap') { swapDim(); return; } // ⇄ FLIP: move the edge to the other side
    if (k === 'del') { deleteDim(); return; } // 🗑 DEL: remove this constraint
    dimConflict = false; // any edit clears the refusal warning
    if (bufferPristine && k !== 'back') dimBuffer = ''; // typing over a prefilled edit value
    bufferPristine = false;
    if (k === 'back') dimBuffer = dimBuffer.slice(0, -1);
    else if (k === '.') { if (!dimBuffer.includes('.')) dimBuffer += '.'; }
    else if (dimBuffer.replace('.', '').length < 6) dimBuffer += k; // cap digit count
    redrawNumpad();
  }

  // Load an existing constraint straight into the numpad for editing — used when you
  // select its value panel instead of re-picking both edges. Jumps to the numpad phase.
  function loadConstraint(id) {
    const c = project.constraints.find((k) => k.id === id);
    if (!c) return;
    const toRef = (ep) => ep.marker
      ? { kind: 'marker', markerId: ep.marker }
      : ep.node
        ? { kind: 'node', nodeId: ep.node }
        : ep.rect === ORIGIN_ID
          ? { kind: 'origin' }
          : { kind: 'edge', rectId: ep.rect, edge: ep.edge };
    if (isMarkerConstraint(c)) {
      // Keep the outlet-first invariant even though the stored constraint anchors
      // its wall edge as endpoint a.
      const markerEnd = c.a.marker ? c.a : c.b;
      const edgeEnd = c.a.marker ? c.b : c.a;
      dimRefA = toRef(markerEnd);
      dimRefB = toRef(edgeEnd);
    } else if (isNodeConstraint(c)) {
      // Node-first, mirroring the outlet invariant (the stored constraint anchors
      // its wall edge as endpoint a).
      const nodeEnd = c.a.node ? c.a : c.b;
      const edgeEnd = c.a.node ? c.b : c.a;
      dimRefA = toRef(nodeEnd);
      dimRefB = toRef(edgeEnd);
    } else {
      dimRefA = toRef(c.a);
      dimRefB = toRef(c.b);
    }
    editingId = c.id;
    dimBuffer = fmt(Math.abs(c.value)); // open on the current value; first key replaces it
    bufferPristine = true;
    dimConflict = false;
    rlog('dim load', { id, a: refLabel(dimRefA), b: refLabel(dimRefB) });
    showNumpad();
  }

  // ---- LEVEL: per-storey height, entered by hand (Quest can't measure the vertical
  // offset between floors). Reuses the DIMS numpad; the SWAP/DEL keys have no role here.
  // Thumbstick-y cycles real floors plus the read-only overview (see pollModeCycle);
  // a real floor's height re-stacks every floor above it.
  const levelTitle = () => {
    if (allFloorsView) return t('mode.all_floors');
    const f = project.activeFloor;
    return `${f.name}  ${t('level.base')} ${fmt(f.elevation)} ${unitLabel()}  ·  ${t('level.storeyHeight')}`;
  };
  const redrawLevelPad = () => numpad.draw(levelTitle(), levelBuffer, hoverKey);

  // Prefill the field with the active floor's current height (without re-parking the
  // panel) — used on enter and after cycling to another floor.
  function refreshLevelPad() {
    levelBuffer = fmt(project.activeFloor.height);
    levelPristine = true;
    redrawLevelPad();
  }

  function activateLevelPad() {
    if (allFloorsView) { deactivateNumpad(); return; }
    placePanel(numpad.group);
    numpad.group.visible = true;
    refreshLevelPad();
  }

  function commitLevelHeight() {
    if (allFloorsView) return;
    const val = parseFloat(levelBuffer);
    if (!Number.isFinite(val) || val <= 0) return; // a storey must have positive height
    project.setHeight(toMeters(val)); // sets the active floor's height, re-solves + re-stacks elevations
    rlog('floor height set', { floor: project.activeFloor.name, m: +toMeters(val).toFixed(3) });
    buildPlan(); applyPlanMatrix(); // elevations changed -> the overlay re-seats at the new height
    refreshLevelPad();
  }

  function pressLevelKey(k) {
    if (allFloorsView) return;
    if (k === 'enter') { commitLevelHeight(); return; }
    if (k === 'swap' || k === 'del') return; // not used when entering a height
    if (levelPristine && k !== 'back') levelBuffer = '';
    levelPristine = false;
    if (k === 'back') levelBuffer = levelBuffer.slice(0, -1);
    else if (k === '.') { if (!levelBuffer.includes('.')) levelBuffer += '.'; }
    else if (levelBuffer.replace('.', '').length < 6) levelBuffer += k;
    redrawLevelPad();
  }

  // LEVEL trigger: drive the numpad key under the ray.
  function onLevelTouch() {
    if (allFloorsView) return;
    if (hoverKey) pressLevelKey(hoverKey);
  }

  // ---- Vertical helpers, shared by the marker / node height pads. Heights are
  // floor-referenced ONLY: the typed value is the absolute height above the floor. The
  // datum is just free vs defined — 'free' (undefined, so a 3D grab moves Z) or 'floor'
  // (a defined height that holds in the grab, like an X/Y pin). The SWAP cell toggles
  // free↔floor (the displayed value is unchanged); DEL frees Z; typing a value defines
  // it (floor). datumWord labels the current state; datumSwapLabel names the SWAP target.
  const nextDatum = (d) => d === 'floor' ? 'free' : 'floor';
  const datumWord = (d) => d === 'free' ? `⊘ ${t('z.free')}` : `↑ ${t('z.floor')}`;
  const datumSwapLabel = (d) => `⇄ ${t(`z.${nextDatum(d)}`).toUpperCase()}`;

  // ---- EDIT marker height: a marker's inherent height, typed by hand on the DIMS numpad
  // (reused, like LEVEL). Floor-referenced only; SWAP toggles free↔floor, DEL frees Z.
  // X/Y are pinned separately in DIMS — height is never a constraint axis.
  const markerTitle = () => `${t(`marker.${selectedMarker?.type ?? 'outlet'}`)}  ·  ${datumWord(markerDatum)}`;
  const redrawMarkerPad = () => numpad.draw(markerTitle(), markerBuffer, hoverKey, datumSwapLabel(markerDatum));

  function refreshMarkerPad() {
    // No datum = height never defined = FREE (grab moves Z). The buffer shows the current
    // floor-relative z (informational when free / editable when floor).
    markerDatum = selectedMarker?.zDatum ?? 'free';
    markerBuffer = selectedMarker ? fmt(selectedMarker.z) : '';
    markerPristine = true;
    redrawMarkerPad();
  }

  function activateMarkerPad() {
    placePanel(numpad.group);
    numpad.group.visible = true;
    refreshMarkerPad();
  }

  function commitMarkerHeight() {
    if (!selectedMarker) return;
    const val = parseFloat(markerBuffer);
    if (!Number.isFinite(val) || val < 0) return; // 0 = on the floor / at the ceiling; negatives rejected
    const id = selectedMarker.id;
    const datum = markerDatum === 'free' ? 'floor' : markerDatum; // entering a value DEFINES it (default floor)
    project.setMarkerVertical(id, datum, toMeters(val));
    rlog('marker height', { id, datum, m: +toMeters(val).toFixed(3) });
    selectedMarker = null; // ENTER completes the edit instead of leaving the pad active
    deactivateNumpad();
    buildPlan(); applyPlanMatrix(); // z changed -> the glyph re-seats at the new height
  }

  function deleteSelectedMarker() {
    if (!selectedMarker) return;
    const id = selectedMarker.id;
    project.removeMarker(id); // also drops its X/Y pins
    selectedMarker = null;
    deactivateNumpad();
    buildPlan(); applyPlanMatrix();
    rlog('marker delete', { id });
  }

  function pressMarkerKey(k) {
    if (k === 'enter') { commitMarkerHeight(); return; }
    if (k === 'swap') { // toggle free↔floor, keeping the displayed floor-referenced height
      markerDatum = nextDatum(markerDatum); markerPristine = false; redrawMarkerPad(); return;
    }
    if (k === 'del') { // DEL clears the Z DIM (frees Z for the grab); B/Y deletes the marker
      if (selectedMarker) {
        project.setMarkerVertical(selectedMarker.id, 'free');
        rlog('marker z freed', { id: selectedMarker.id });
        buildPlan(); applyPlanMatrix();
        refreshMarkerPad(); // now reads ⊘ free
      }
      return;
    }
    if (markerDatum === 'free') markerDatum = 'floor'; // typing a height defines it (from the floor)
    if (markerPristine && k !== 'back') markerBuffer = '';
    markerPristine = false;
    if (k === 'back') markerBuffer = markerBuffer.slice(0, -1);
    else if (k === '.') { if (!markerBuffer.includes('.')) markerBuffer += '.'; }
    else if (markerBuffer.replace('.', '').length < 6) markerBuffer += k;
    redrawMarkerPad();
  }

  // MARKER · EDIT thumbstick-y: if a marker is selected, RETYPE it in place;
  // otherwise cycle the DROP type used for the next placement. One control,
  // context-dependent — matches LEVEL/LANG where thumbstick-y cycles the current thing.
  // Extends trivially as MARKER_TYPES grows.
  function cycleMarkerType(dir = 1) {
    const step = (cur) => MARKER_TYPES[(MARKER_TYPES.indexOf(cur) + dir + MARKER_TYPES.length) % MARKER_TYPES.length];
    if (selectedMarker) {
      project.setMarkerType(selectedMarker.id, step(selectedMarker.type)); // mutates the same object
      buildPlan(); applyPlanMatrix(); // swap the glyph immediately
      if (numpad.group.visible) refreshMarkerPad(); // pad title tracks the type
      rlog('marker retype', { id: selectedMarker.id, type: selectedMarker.type });
      return;
    }
    currentMarkerType = step(currentMarkerType);
    // The mode breadcrumb deliberately stays MARKER · EDIT. The dedicated TYPE
    // readout is the sole UI label that changes with the marker type.
    rlog('marker type', { type: currentMarkerType });
  }

  // MARKER · WIRE thumbstick-y mirrors marker/zone typing: it chooses the nature
  // for the next wire, or retypes the currently selected wire in place.
  function cycleWireType(dir = 1) {
    const activeType = selectedRoutedWire?.type || currentWireType;
    const index = WIRE_TYPES.indexOf(activeType);
    const next = WIRE_TYPES[((index < 0 ? 0 : index) + dir + WIRE_TYPES.length) % WIRE_TYPES.length];
    currentWireType = next;
    if (selectedRoutedWire) {
      project.setWireType(selectedRoutedWire.id, next);
      buildRoutedWires();
      rlog('wire retype', { id: selectedRoutedWire.id, type: next });
    } else {
      rlog('wire type', { type: next });
    }
  }

  function cyclePipeService(dir = 1) {
    const active = selectedPipe?.service
      || (pipePenNodeId ? project.pipeServiceAtNode(pipePenNodeId, currentPipeService) : currentPipeService);
    const i = PIPE_SERVICES.indexOf(active);
    const next = PIPE_SERVICES[((i < 0 ? 0 : i) + dir + PIPE_SERVICES.length) % PIPE_SERVICES.length];
    currentPipeService = next;
    if (selectedPipe) {
      project.setPipeService(selectedPipe.id, next);
      buildPipes();
      rlog('pipe retype', { id: selectedPipe.id, service: next });
    } else if (pipePenNodeId && project.pipeComponent(pipePenNodeId).pipes.length) {
      project.setPipeComponentService(pipePenNodeId, next);
      pendingPipeMerge = null;
      buildPipes();
      rlog('pipe network retype', { node: pipePenNodeId, service: next });
    }
  }

  // ---- CONDUIT EDIT node height: a free (bare) junction's z is typed on the reused
  // numpad, exactly like a remote waypoint. Marker-bound nodes have no pad (their z
  // follows the device), so selecting one just arms it for deletion.
  const selectedConduitNodeObj = () =>
    (selectedConduitNodeId ? project.conduitNodes.find((n) => n.id === selectedConduitNodeId) : null) || null;
  const nodePadTitle = () => `${t('conduit.node')}  ·  ${datumWord(nodeDatum)}`;
  const redrawNodePad = () => numpad.draw(nodePadTitle(), nodeBuffer, hoverKey, datumSwapLabel(nodeDatum));

  function refreshNodePad() {
    const n = selectedConduitNodeObj();
    nodeDatum = n?.zDatum ?? 'free'; // no datum = free in the 3D carry
    nodeBuffer = n ? fmt(n.z || 0) : '';
    nodePristine = true;
    redrawNodePad();
  }

  function activateNodePad() {
    placePanel(numpad.group);
    numpad.group.visible = true;
    refreshNodePad();
  }

  // Select a conduit node. Free junctions open the height pad; marker-bound nodes
  // just become the selection (grip deletes, but there is no height to edit).
  function selectConduitNode(id) {
    selectedConduitNodeId = id;
    selectedConduitSegmentId = null;
    const n = selectedConduitNodeObj();
    if (n && !n.markerId) activateNodePad();
    else deactivateNumpad();
  }

  function selectConduitSegment(id) {
    selectedConduitNodeId = null;
    selectedConduitSegmentId = id;
    deactivateNumpad();
  }

  function commitNodeHeight() {
    const n = selectedConduitNodeObj();
    if (!n || n.markerId) return;
    const val = parseFloat(nodeBuffer);
    if (!Number.isFinite(val) || val < 0) return; // 0 = on the floor / at the ceiling; negatives rejected
    const datum = nodeDatum === 'free' ? 'floor' : nodeDatum; // entering a value DEFINES it (default floor)
    project.setConduitNodeVertical(n.id, datum, toMeters(val));
    rlog('conduit node height', { id: n.id, datum, m: +toMeters(val).toFixed(3) });
    buildConduits();
    refreshNodePad(); // keep it selected so it can be repositioned again
  }

  function pressNodeKey(k) {
    if (k === 'enter') { commitNodeHeight(); return; }
    if (k === 'swap') { // toggle free↔floor, keeping the displayed floor-referenced height
      nodeDatum = nextDatum(nodeDatum); nodePristine = false; redrawNodePad(); return;
    }
    if (k === 'del') { // DEL clears the Z DIM (frees Z for the 3D carry); B/Y deletes the node
      const n = selectedConduitNodeObj();
      if (n && !n.markerId) {
        project.setConduitNodeVertical(n.id, 'free');
        rlog('conduit node z freed', { id: n.id });
        buildConduits();
        refreshNodePad(); // now reads ⊘ free
      }
      return;
    }
    if (nodeDatum === 'free') nodeDatum = 'floor'; // typing a height defines it (from the floor)
    if (nodePristine && k !== 'back') nodeBuffer = '';
    nodePristine = false;
    if (k === 'back') nodeBuffer = nodeBuffer.slice(0, -1);
    else if (k === '.') { if (!nodeBuffer.includes('.')) nodeBuffer += '.'; }
    else if (nodeBuffer.replace('.', '').length < 6) nodeBuffer += k;
    redrawNodePad();
  }

  // PLAN · ADD thumbstick-y: pick which kind the next trigger places. All non-room
  // kinds currently share subtract geometry, but the rectangle keeps its identity.
  function cycleZoneKind(dir = 1) {
    const i = ZONE_KINDS.indexOf(currentZoneKind);
    currentZoneKind = ZONE_KINDS[(i + dir + ZONE_KINDS.length) % ZONE_KINDS.length];
    // The mode breadcrumb deliberately stays PLAN · ADD. The dedicated TYPE
    // readout is the sole UI label that changes with the zone type.
    rlog('zone kind', { kind: currentZoneKind });
  }

  // Shared dimension trigger. Frame-time picking enforces the domain, and these
  // guards enforce it again at mutation time: PLAN DIMS accepts plan refs only;
  // OUTLET DIMS requires outlet-first then edge. Once paired, the ray drives the pad.
  function onNumpadTouch() {
    if (!placed || !activeRect) return;
    const modeId = modes[currentMode].id;
    if (dimRefA && dimRefB) { if (hoverKey) pressKey(hoverKey); return; }
    const domain = modeDomain(modeId);
    if (hoverDim) {
      const c = project.constraints.find((k) => k.id === hoverDim.userData.cId);
      if (c && dimDomain(c) === domain) { loadConstraint(c.id); return; }
    }
    if (!hoverRef) return;
    if (!dimRefA) {
      // First pick must be the domain's dependent target: plan = edge/origin,
      // marker = an outlet, node = a bare conduit junction.
      const pinKind = domain === 'marker' ? 'marker' : domain === 'node' ? 'node' : null;
      if (pinKind ? hoverRef.kind !== pinKind : (hoverRef.kind === 'marker' || hoverRef.kind === 'node')) return;
      dimRefA = hoverRef;
      planDimPickKey = null; // begin the second reference at its stable first candidate
      rlog('dim A', { domain: modeId, ref: refLabel(hoverRef) });
      redrawNumpad();
      return;
    }
    // Second pick: plan pairs edge/origin; a marker/node pin must anchor to a wall edge.
    if (domain === 'plan' && (hoverRef.kind === 'marker' || hoverRef.kind === 'node')) return;
    if (domain === 'marker' && (dimRefA.kind !== 'marker' || hoverRef.kind !== 'edge')) return;
    if (domain === 'node' && (dimRefA.kind !== 'node' || hoverRef.kind !== 'edge')) return;
    if (refsEqual(hoverRef, dimRefA) || !refsCompatible(dimRefA, hoverRef)) return;
    dimRefB = hoverRef;
    dimOffsetPt = hoverFloorPt; // where the tip stands as the pair completes -> new dim's default line
    const existing = findConstraintForRefs(dimRefA, dimRefB);
    editingId = existing ? existing.id : null;
    // Prefill with the constrained value if one exists, else the current measured
    // span. Either way the field opens on the real value; the first keypress replaces it.
    dimBuffer = fmt(existing ? Math.abs(existing.value) : currentSpan(dimRefA, dimRefB));
    bufferPristine = true;
    rlog('dim B', { ref: refLabel(hoverRef), editing: !!existing });
    showNumpad(); // pair complete -> enter the numpad/edit phase
  }

  // Park a ray-aimed panel ~0.55 m in front of the headset, upright, facing the
  // user (yaw-only). Shared by the DIMS numpad and the SAVE/LOAD slot menu.
  function placePanel(group, dist = 0.55, drop = 0.12) {
    const e = renderer.xr.getCamera().matrixWorld.elements;
    _cam.set(e[12], e[13], e[14]);
    _camQ.setFromRotationMatrix(_rm.fromArray(e));
    _fwd.set(0, 0, -1).applyQuaternion(_camQ); _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    group.position.copy(_cam).addScaledVector(_fwd, dist);
    group.position.y = _cam.y - drop; // a touch below eye level
    group.lookAt(_cam.x, group.position.y, _cam.z); // yaw-only face
    group.updateMatrixWorld(true); // so the same-frame raycast sees the new pose
  }

  // Enter either dimension domain in the ref-pick phase; the pad itself appears only
  // once a pair/constraint is chosen, since it has no role while picking references.
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

  // Slot summary for the menu cell: saved revision, rectangle count (all floors),
  // and a short local date/time. Pre-revision slots read Rev 0.
  function slotMeta(i) {
    const o = readSlot(i);
    if (!o) return null;
    const rects = o.data.floors.reduce((n, f) => n + (f.rectangles?.length || 0), 0);
    const d = new Date(o.savedAt);
    const when = Number.isFinite(d.getTime())
      ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '?';
    const revision = Number.isFinite(o.data.revision) ? o.data.revision : 0;
    return { rects, when, revision };
  }

  const slotTitle = () => overwriteSlot != null
    ? `${t('slot.overwrite')} · ${t('slot.slot')} ${overwriteSlot + 1}?`
    : slotFlash || (modes[currentMode].id === 'save' ? t('slot.saveTitle') : t('slot.loadTitle'));
  const slotAccent = () => overwriteSlot != null
    ? '#ff9f43'
    : (modes[currentMode].id === 'save' ? '#51d88a' : '#4ea1ff');
  const redrawSlotMenu = () => slotMenu.draw(
    slotTitle(), slotAccent(), hoverSlot, slotMeta, overwriteSlot, hoverSlotAction,
  );

  function showSlotMenu() {
    placePanel(slotMenu.group);
    slotFlash = null;
    overwriteSlot = null;
    hoverSlot = prevHoverSlot = null;
    hoverSlotAction = prevHoverSlotAction = null;
    slotMenu.group.visible = true;
    redrawSlotMenu();
  }

  function deactivateSlotMenu() {
    slotMenu.group.visible = false;
    numpadCursor.visible = false;
    hoverSlot = prevHoverSlot = null;
    hoverSlotAction = prevHoverSlotAction = null;
    slotFlash = null;
    overwriteSlot = null;
  }

  // ---- EXPORT: active-floor SVG/PNG/DXF + complete-project debug JSON ----
  // The preview is persistently mounted on the optional LEFT controller and always
  // follows the active floor. PROJECT · EXPORT only changes output format/layers;
  // floor selection remains owned by SETUP · LEVEL.
  let sheetFloorId = null;
  let sheetFlashTimer = null;
  let sheetDirty = true;
  let lastSheetRedrawAt = -Infinity;
  const SHEET_REFRESH_MS = 125; // at most 8 fps while a dim/edge is being dragged
  // Neutral companion-sheet pose in target-ray/controller-local coordinates.
  // With an unrotated controller, -Z points away from the user and the plane's +Z
  // front faces back toward them: upright, vertical, and directly above the hand.
  // The sheet is grip-gated, so it may occupy this readable central position without
  // permanently obstructing the left teleport ray.
  const LEFT_SHEET_POS = new THREE.Vector3(0, 0.46, 0);

  const currentSheetFloor = () => project.activeFloor;
  const redrawSheet = () => {
    sheetPanel.redraw(currentSheetFloor(), exportChangeMap());
    sheetFloorId = currentSheetFloor().id;
    sheetDirty = false;
    lastSheetRedrawAt = performance.now();
  };
  const isSheetExportMode = (id) => id === 'export';

  // Reparenting to the detected left controller makes the sheet follow its tracked
  // pose exactly like the controller HUD. The panel + dedicated teleport reticle are
  // both absent when LEFT is not connected.
  function updateLeftSheet(time, leftController, gripPressed) {
    if (!leftController || !gripPressed) {
      sheetPanel.group.visible = false;
      return;
    }
    if (sheetPanel.group.parent !== leftController) {
      leftController.add(sheetPanel.group);
      sheetPanel.group.position.copy(LEFT_SHEET_POS);
      sheetPanel.group.rotation.set(0, 0, 0);
    }
    if (sheetFloorId !== project.activeFloorId) sheetDirty = true;
    if (sheetDirty && time - lastSheetRedrawAt >= SHEET_REFRESH_MS) redrawSheet();
    sheetPanel.group.visible = true;
  }

  function showSheet() {
    sheetDirty = true;
    redrawSheet();
  }

  function hideSheet() {
    clearTimeout(sheetFlashTimer);
  }

  // Fire-and-forget blob download. In the immersive TWA the download UI isn't visible,
  // but Android's DownloadManager still writes the file to the headset's Download folder
  // (retrieve by cable). Returns false if the browser refused it.
  function downloadBlob(filename, data, mime) {
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch { return false; }
  }

  let directExportCount = 0;

  // Clipboard writes must start directly inside the trigger's user-activation turn.
  // Building the compressed view URL is asynchronous, so keep the current variant
  // warm instead of awaiting compression after the trigger. Project change events
  // invalidate ONLY this cache; AR visuals still rebuild explicitly elsewhere.
  let shareUrlCache = null; // { url, markers, furniture }
  let shareUrlGeneration = 0;
  let shareUrlTimer = null;
  async function refreshShareUrl(generation, markers, furniture) {
    try {
      const url = await buildShareUrl(project, { markers, furniture });
      if (generation === shareUrlGeneration) shareUrlCache = { url, markers, furniture };
    } catch (error) {
      if (generation === shareUrlGeneration) shareUrlCache = null;
      rlog('share URL precompute failed', String(error?.message || error));
    }
  }
  function scheduleShareUrlRefresh() {
    shareUrlCache = null;
    const generation = ++shareUrlGeneration;
    const settings = getOutputSettings();
    const markers = settings.markerIcons;
    const furniture = settings.furniture;
    clearTimeout(shareUrlTimer);
    shareUrlTimer = setTimeout(() => refreshShareUrl(generation, markers, furniture), 0);
  }
  project.onChange(scheduleShareUrlRefresh);
  scheduleShareUrlRefresh();

  // Chromium permits the first synthetic file download from an immersive page,
  // then may gate later files behind its "multiple automatic downloads" setting.
  // Android Web Share is a user-confirmed delivery path and is not subject to that
  // gate, so use it for later exports where the platform supports sharing files.
  async function deliverExport(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const file = new File([blob], filename, { type: mime });
    const shareData = { files: [file], title: filename };
    let canShare = false;
    try {
      canShare = directExportCount > 0 && !!navigator.share
        && (!navigator.canShare || navigator.canShare(shareData));
    } catch (error) {
      rlog('output share capability check failed', String(error?.message || error));
    }
    if (canShare) {
      try {
        await navigator.share(shareData);
        return { ok: true, delivery: 'share' };
      } catch (error) {
        // Quest Browser can expose Web Share yet reject it from an immersive XR
        // select event. Do not let that capability mismatch consume the export:
        // retry through DownloadManager using the already-unique filename.
        rlog('output share unavailable; falling back to download', String(error?.message || error));
      }
    }
    const ok = downloadBlob(filename, blob, mime);
    if (ok) directExportCount += 1;
    return { ok, delivery: directExportCount > 1 ? 'download-fallback' : 'download' };
  }

  // Android's download layer may reject a second write to the same destination
  // name while the first still exists. Give every trigger its own sortable name
  // so repeated exports in one immersive session never become implicit overwrites.
  const exportFileName = (f, extension, now = new Date()) => {
    const floor = (f.name || 'floor').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'floor';
    const pad = (n, width = 2) => String(n).padStart(width, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
      + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`;
    const rev = project.revision > 0 ? `-r${project.revision}` : ''; // omit for a never-saved project
    if (extension === 'json') return `house-debug-${stamp}.json`;
    if (extension === 'qr.png') return `house-3dview${rev}-${stamp}.png`; // whole-house share, not a floor sheet
    return `plan-${floor}${rev}-${stamp}.${extension}`;
  };

  // Briefly show a message on the mode label, then restore the breadcrumb.
  function sheetFlash(msg) {
    for (const l of labels) l.setText(msg, modes[currentMode].color);
    clearTimeout(sheetFlashTimer);
    sheetFlashTimer = setTimeout(() => { if (isSheetExportMode(modes[currentMode].id)) setModeInfo(); }, 1600);
  }

  // ---- EXPORT change-map baseline ------------------------------------------
  // null = no comparison; otherwise a save-slot index (0..SLOT_COUNT-1). The slots
  // (house-cad:slot:i, written by PROJECT · SAVE) double as delivered-version
  // baselines. Session state — it references volatile slot contents, so it is not
  // persisted and drops back to "none" if the slot is cleared.
  let exportBaselineSlot = null;
  const filledBaselineSlots = () => {
    const out = [];
    for (let i = 0; i < SLOT_COUNT; i++) if (readSlot(i)) out.push(i);
    return out;
  };
  // Cycle none → each saved slot → none. dir < 0 reverses.
  function cycleExportBaseline(dir = 1) {
    const options = [null, ...filledBaselineSlots()];
    const at = Math.max(0, options.indexOf(exportBaselineSlot));
    exportBaselineSlot = options[(at + (dir < 0 ? -1 : 1) + options.length) % options.length];
    rlog('export baseline', { slot: exportBaselineSlot });
    sheetDirty = true; // the LEFT preview must re-render with/without clouds
    if (exportMenu.group.visible) redrawExportMenu();
  }
  const baselineLabel = () => (exportBaselineSlot == null
    ? t('export.baselineNone') : `${t('export.slot')} ${exportBaselineSlot + 1}`);

  // ---- EXPORT sheet language -----------------------------------------------
  // The language of the exported/printed SHEET text (labels, legends, floor names),
  // chosen independently of the app UI language — so a plan can be handed off in a
  // language you don't run the tool in. Session state; defaults to the current UI
  // language and does not follow later UI-language switches (that's the point).
  let exportSheetLang = getLang();
  function cycleExportLang(dir = 1) {
    const at = Math.max(0, LANG_ORDER.indexOf(exportSheetLang));
    exportSheetLang = LANG_ORDER[(at + (dir < 0 ? -1 : 1) + LANG_ORDER.length) % LANG_ORDER.length];
    rlog('export sheet lang', { lang: exportSheetLang });
    sheetDirty = true; // the LEFT preview must re-render in the new language
    if (exportMenu.group.visible) redrawExportMenu();
  }
  // Shared per-language label options for the preview AND the download, so the two
  // can never drift. Resolves every sheet string in the chosen export language.
  function sheetLabelOpts(lang = exportSheetLang) {
    return {
      markerLabel: (ty) => t(`marker.${ty}`, lang),
      markerLegendNote: (ty) => ty === 'outlet_aircon' ? t('marker.dedicatedCircuit', lang) : '',
      zoneLabel: (kind) => t(`mode.${kind}`, lang),
      revLabels: revLabels(lang),
      floorLabel: (name) => localizedFloorName(name, lang),
      generatedLabel: t('sheet.generated', lang),
      buildLabel: t('sheet.build', lang),
      revision: project.revision, // saved-revision number, stamped on the sheet strip
      revisionLabel: t('sheet.revision', lang),
    };
  }
  // The active baseline's per-floor diff Map<floorId, diff>, or null (no comparison /
  // slot vanished / invalid snapshot). Sheet outputs (preview/SVG/PNG) consume it;
  // DXF/Coohom/JSON never do. Recomputed on demand — the diff deserializes + solves
  // the baseline, so callers gate it behind the ≤8 fps preview throttle.
  function exportChangeMap() {
    if (exportBaselineSlot == null) return null;
    const o = readSlot(exportBaselineSlot);
    if (!o) { exportBaselineSlot = null; return null; }
    try { return diffAgainstSnapshot(project, o.data); }
    catch (error) { rlog('change map skipped', String(error?.message || error)); return null; }
  }

  async function performExport() {
    const f = currentSheetFloor();
    const settings = getOutputSettings();
    const format = settings.format;
    // LINK and QR are separate whole-house view-only exports. LINK uses the warmed
    // cache so writeText starts inside the trigger activation; it never silently
    // substitutes a file. QR independently creates and delivers its PNG.
    if (format === 'link') {
      const cached = shareUrlCache?.markers === settings.markerIcons
        && shareUrlCache?.furniture === settings.furniture ? shareUrlCache.url : null;
      if (cached && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(cached);
          rlog('share URL copied', { chars: cached.length, markers: settings.markerIcons });
          sheetFlash('URL COPIED');
          return;
        } catch (error) {
          rlog('share URL copy failed', String(error?.message || error));
        }
      }
      scheduleShareUrlRefresh();
      sheetFlash('URL COPY FAILED');
      return;
    }
    if (format === 'qr') {
      let url;
      let blob;
      try {
        const cached = shareUrlCache?.markers === settings.markerIcons
          && shareUrlCache?.furniture === settings.furniture ? shareUrlCache.url : null;
        url = cached || await buildShareUrl(project, {
          markers: settings.markerIcons,
          furniture: settings.furniture,
        });
        blob = await qrToPngBlob(url, { scale: 8, margin: 4 });
      } catch (error) {
        rlog('qr generation failed', String(error?.message || error));
        sheetFlash('QR EXPORT FAILED');
        return;
      }
      if (!blob) { sheetFlash('QR FAILED · TOO LARGE'); rlog('qr too large', { chars: url.length }); return; }
      const name = exportFileName(f, 'qr.png');
      const result = await deliverExport(name, blob, 'image/png');
      rlog('qr share', { name, chars: url.length, markers: settings.markerIcons, ok: result.ok, delivery: result.delivery });
      sheetFlash(result.ok ? `${result.delivery === 'share' ? '↗' : '⬇'} ${name}` : 'QR EXPORT FAILED');
      return;
    }
    const extension = format === 'coohom' ? 'dxf' : format;
    const name = format === 'coohom'
      ? exportFileName(f, 'coohom.dxf')
      : exportFileName(f, extension);
    let data;
    let mime;
    if (extension === 'json') {
      // Debug export is the complete persisted project structure. Sheet filters
      // deliberately do not alter it, so it can reproduce the exact saved state.
      data = JSON.stringify(serializeProject(project), null, 2);
      mime = 'application/json';
    } else if (format === 'coohom') {
      data = floorToCoohomDxf(f);
      mime = 'application/dxf';
    } else if (extension === 'dxf') {
      data = floorToDxf(project, f, { layers: settings });
      mime = 'application/dxf';
    } else {
      const sheetOpts = sharedScaleSheetOptions(project.floors, {
        project, // whole-house conduit/wires span floors; sheets filter per floor
        page: 'a4',
        layers: settings,
        ...sheetLabelOpts(), // sheet text in the chosen export language
        changeMap: exportChangeMap(), // revision clouds when a baseline slot is chosen
      });
      if (extension === 'png') {
        data = await floorToPngBlob(f, sheetOpts);
        mime = 'image/png';
      } else {
        data = floorToSvg(f, sheetOpts);
        mime = 'image/svg+xml';
      }
    }
    const result = await deliverExport(name, data, mime);
    rlog('output download', {
      floor: f.name, format, name,
      ok: result.ok, delivery: result.delivery, layers: settings,
    });
    sheetFlash(result.ok ? `${result.delivery === 'share' ? '↗' : '⬇'} ${name}` : 'download blocked');
  }

  async function onExportTouch() {
    if (!hoverExportAction) return;
    if (hoverExportAction === 'export') {
      try {
        await performExport();
      } catch (error) {
        rlog('output download failed', String(error?.message || error));
        sheetFlash('export failed');
      }
      return;
    }
    if (hoverExportAction === 'baseline') { cycleExportBaseline(1); return; } // tap advances the baseline
    if (hoverExportAction === 'lang') { cycleExportLang(1); return; } // tap advances the sheet language
    toggleOutputLayer(hoverExportAction);
  }

  // ---- PROJECT one-shot actions: floor clipboard + whole-plan movement ----
  let projectFlashTimer = null;
  function projectFlash(msg, sticky = false) {
    for (const l of labels) l.setText(msg, modes[currentMode].color);
    clearTimeout(projectFlashTimer);
    if (sticky) return;
    projectFlashTimer = setTimeout(() => {
      if (['copy_floor', 'paste_floor', 'move_up', 'move_down'].includes(modes[currentMode].id)) setModeInfo();
    }, 1800);
  }

  // The in-memory copy survives LOAD (which replaces project contents), and the
  // localStorage copy survives a browser/APK relaunch. COPY simply replaces the old
  // clipboard; PASTE replaces the active floor's authored plan after confirmation.
  let floorClipboard = null;
  let pasteConfirmFloorId = null;
  try {
    const raw = localStorage.getItem(FLOOR_CLIPBOARD_KEY);
    if (raw) floorClipboard = JSON.parse(raw);
  } catch { /* unavailable or invalid storage: keep an in-memory clipboard */ }

  function copyActiveFloor() {
    floorClipboard = createFloorClipboard(project, project.activeFloor);
    try { localStorage.setItem(FLOOR_CLIPBOARD_KEY, JSON.stringify(floorClipboard)); } catch { /* memory copy still works */ }
    projectFlash(`${t('floorCopy.copied')} ${project.activeFloor.name}`);
    rlog('floor copied', {
      name: project.activeFloor.name, rects: project.rectangles.length,
      constraints: project.constraints.length, markers: project.markers.length, links: project.electricalLinks.length,
    });
  }

  function pasteCopiedFloor() {
    // Pick up a clipboard written by the desktop UI after setupMR initialized;
    // retain the in-memory value if storage is unavailable.
    try {
      const raw = localStorage.getItem(FLOOR_CLIPBOARD_KEY);
      if (raw) floorClipboard = JSON.parse(raw);
    } catch { /* keep the in-memory clipboard */ }
    if (!floorClipboard) {
      projectFlash(t('floorCopy.empty'));
      return;
    }
    const target = project.activeFloor;
    const occupied = target.rectangles.length || target.constraints.length || target.markers.length || target.electricalLinks.length;
    if (occupied && pasteConfirmFloorId !== target.id) {
      pasteConfirmFloorId = target.id;
      projectFlash(`${t('floorCopy.replace')} ${target.name}? ${t('slot.triggerAgain')}`, true);
      rlog('floor paste armed', { target: target.name });
      return;
    }
    try {
      const floor = pasteFloorClipboard(project, floorClipboard, { targetId: target.id });
      pasteConfirmFloorId = null;
      afterFloorChange(); // rebuild all per-floor edit state after replacing the active plan
      projectFlash(`${t('floorCopy.pasted')} ${floor.name}`);
      rlog('floor pasted', {
        name: floor.name, rects: floor.rectangles.length,
        constraints: floor.constraints.length, markers: floor.markers.length, links: floor.electricalLinks.length,
      });
    } catch (e) {
      pasteConfirmFloorId = null;
      projectFlash(t('floorCopy.failed'));
      rlog('floor paste failed', String(e?.message || e));
    }
  }

  function moveFloorBy(delta) {
    const source = project.activeFloor;
    const i = project.floors.indexOf(source);
    const target = project.floors[i + delta];
    if (!target) {
      const reason = delta > 0 ? 'no upper floor' : 'no lower floor';
      projectFlash(t(delta > 0 ? 'moveFloor.noUpper' : 'moveFloor.noLower'));
      rlog('move floor refused', { reason, source: source?.name });
      return;
    }
    const result = project.moveFloorContents(source.id, target.id);
    if (!result.ok) {
      const key = result.reason === 'occupied' ? 'moveFloor.occupied' : 'moveFloor.empty';
      projectFlash(t(key));
      rlog('move floor refused', { reason: result.reason, source: source.name, target: target.name });
      return;
    }
    afterFloorChange(); // target is now active; rebuild at its elevation
    projectFlash(`${t('moveFloor.moved')} ${target.name}`);
    rlog(delta > 0 ? 'move floor up' : 'move floor down', {
      source: source.name, target: target.name,
      rects: target.rectangles.length, constraints: target.constraints.length,
      markers: target.markers.length, links: target.electricalLinks.length,
    });
  }

  // ---- LANG: switch the UI language (see i18n.js) ----
  const redrawLangMenu = () => langMenu.draw('#' + C_LANG.toString(16).padStart(6, '0'), hoverLang);

  function showLangMenu() {
    placePanel(langMenu.group);
    hoverLang = prevHoverLang = null;
    langMenu.group.visible = true;
    redrawLangMenu();
  }

  function hideLangMenu() {
    langMenu.group.visible = false;
    numpadCursor.visible = false;
    hoverLang = prevHoverLang = null;
  }

  // ---- UNIT: switch display/input units without touching meter-based geometry ----
  const redrawUnitMenu = () => unitMenu.draw('#' + C_UNIT.toString(16).padStart(6, '0'), hoverUnit);

  function showUnitMenu() {
    placePanel(unitMenu.group);
    hoverUnit = prevHoverUnit = null;
    unitMenu.group.visible = true;
    redrawUnitMenu();
  }

  function hideUnitMenu() {
    unitMenu.group.visible = false;
    numpadCursor.visible = false;
    hoverUnit = prevHoverUnit = null;
  }

  // ---- EXPORT: persistent layer profile + explicit active-floor download ----
  const redrawExportMenu = () => exportMenu.draw(
    '#' + C_EXPORT.toString(16).padStart(6, '0'),
    hoverExportAction,
    getOutputSettings(),
    project.activeFloor.name,
    baselineLabel(),
    langLabel(exportSheetLang),
  );

  function showExportMenu() {
    placePanel(exportMenu.group, 0.62, 0.10);
    hoverExportAction = prevHoverExportAction = null;
    exportMenu.group.visible = true;
    redrawExportMenu();
  }

  function hideExportMenu() {
    exportMenu.group.visible = false;
    numpadCursor.visible = false;
    hoverExportAction = prevHoverExportAction = null;
  }

  // Trigger in SAVE/LOAD: act on the slot under the ray. SAVE writes an empty slot
  // immediately but requires its separate confirmation button before overwrite; LOAD replaces the whole
  // project from a filled slot (empty = no-op) and
  // rebuilds the MR view (the registered frame/anchor is untouched — the loaded plan
  // drops into wherever you already registered).
  function onSlotTouch() {
    if (modes[currentMode].id === 'save') {
      // Once armed, the slot grid is gone. Only the new CONFIRM button can write;
      // CANCEL returns to the grid, and triggering blank panel space is inert.
      if (overwriteSlot != null) {
        if (hoverSlotAction === 'cancel') {
          rlog('slot overwrite cancelled', { slot: overwriteSlot });
          overwriteSlot = null;
          hoverSlotAction = prevHoverSlotAction = null;
          redrawSlotMenu();
          return;
        }
        if (hoverSlotAction !== 'confirm') return;
      } else if (hoverSlot == null) return;
      const i = overwriteSlot ?? hoverSlot;
      // Empty slots save immediately. A populated slot switches to the distinct
      // confirmation screen; selecting that slot itself performs no storage write.
      if (overwriteSlot == null && readSlot(i)) {
        overwriteSlot = i;
        slotFlash = null;
        hoverSlot = prevHoverSlot = null;
        hoverSlotAction = prevHoverSlotAction = null;
        redrawSlotMenu();
        rlog('slot overwrite armed', { slot: i });
        return;
      }
      try {
        project.bumpRevision(); // deliberate save → advance the revision
        const data = serializeProject(project);
        localStorage.setItem(slotKey(i), JSON.stringify({ savedAt: Date.now(), data }));
        // bumpRevision intentionally does not emit a model change, so the debounced
        // autosave listener will not run. Mirror this exact saved snapshot explicitly;
        // otherwise startup restores the prior revision even though the slot is newer.
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        overwriteSlot = null;
        hoverSlotAction = prevHoverSlotAction = null;
        slotFlash = `${t('slot.saved')} ${i + 1}`;
        rlog('slot save', { slot: i, revision: project.revision });
      } catch (e) {
        overwriteSlot = null;
        hoverSlotAction = prevHoverSlotAction = null;
        slotFlash = t('slot.saveFailed');
        rlog('slot save FAIL', String(e));
      }
    } else {
      if (hoverSlot == null) return;
      const i = hoverSlot;
      const o = readSlot(i);
      if (!o) { slotFlash = `${t('slot.slot')} ${i + 1} ${t('slot.empty')}`; redrawSlotMenu(); return; }
      try {
        deserializeInto(project, o.data); // emits a change (re-solves every floor)
        refreshFloorEditState();          // re-seed EDGE target + undo stack from the loaded active floor
        buildPlan();                      // mr.js rebuilds manually (no onChange subscription)
        applyPlanMatrix();
        slotFlash = `${t('slot.loaded')} ${i + 1}`;
        rlog('slot load', { slot: i });
      } catch (e) {
        slotFlash = t('slot.loadFailed');
        rlog('slot load FAIL', String(e));
      }
    }
    redrawSlotMenu();
  }

  // Draw an edge-highlight strip between two plan-space endpoints — the same
  // thickened-quad style as the resting edges, a touch bolder and on top.
  const _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3();
  const _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();
  function showPlanEdge(ax, ay, bx, by, colorHex, mesh = edgeHi) {
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

  // Draw the edge-highlight strip along `edge` of `rect`.
  function showEdge(rect, edge, colorHex, mesh = edgeHi) {
    const [[ax, ay], [bx, by]] = edgeEndpoints(rect, edge);
    showPlanEdge(ax, ay, bx, by, colorHex, mesh);
  }

  // Outline a whole rectangle (all four edges) into rectHi, in the given color —
  // PLAN mode's "this is the zone under your ray" highlight.
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
    zebra.material.color.setHex(zoneColorHex(zoneKind(rect))); // per-kind palette tint
    zebra.visible = true;
  }

  // Resolve the controller's target ray into shared world-space scratch vectors.
  const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
  const _rhit = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4();
  function setControllerRay(inputSource) {
    const space = inputSource?.targetRaySpace;
    if (!space || !currentFrame) return false;
    const pose = currentFrame.getPose(space, localSpace);
    if (!pose) return false;
    _rm.fromArray(pose.transform.matrix);
    _ro.setFromMatrixPosition(_rm);
    _rq.setFromRotationMatrix(_rm);
    _rd.set(0, 0, -1).applyQuaternion(_rq).normalize();
    return true;
  }

  // ALL FLOORS reticle plane: the storey holding the headset ("my storey"). A ray
  // aimed down lands on my storey's floor, a ray aimed up on the floor of the storey
  // directly above — never further, so the reticle stays near and readable. Returns
  // that floor or null (aimed up from the top storey).
  function allFloorsReticleFloor() {
    const floors = [...project.floors].sort((a, b) => (a.elevation || 0) - (b.elevation || 0));
    if (!floors.length) return null;
    const viewer = currentFrame?.getViewerPose(localSpace);
    const headZ = viewer ? viewer.transform.position.y - planPos.y : 0;
    let mine = 0;
    for (let i = 0; i < floors.length; i++) if ((floors[i].elevation || 0) <= headZ) mine = i;
    return _rd.y < 0 ? floors[mine] : floors[mine + 1] || null;
  }

  // World point where a controller's pointing ray meets the floor plane, or null.
  // `rayHitFloorId` records which storey's floor that plane is (always the active
  // floor outside ALL FLOORS), so ALL FLOORS picking can follow the reticle.
  let rayHitFloorId = null;
  let frameEditCtl = null; // this frame's editor input source (the frame loop's editCtl)
  function rayFloorHit(inputSource) {
    rayHitFloorId = null;
    if (inputSource === frameEditCtl) reticleFloorId = null;
    if (!setControllerRay(inputSource)) return null;
    if (Math.abs(_rd.y) < 1e-4) return null; // parallel to the floor
    let planeY = overlayY(), floorId = project.activeFloorId;
    if (allFloorsView) {
      const floor = allFloorsReticleFloor();
      if (!floor) return null;
      planeY = planPos.y + (floor.elevation || 0);
      floorId = floor.id;
    }
    const t = (planeY - _ro.y) / _rd.y;
    if (t <= 0) return null; // floor is behind the controller
    rayHitFloorId = floorId;
    if (inputSource === frameEditCtl) reticleFloorId = floorId; // the editor reticle scopes picking
    return _rhit.copy(_ro).addScaledVector(_rd, t);
  }

  // Put the plan point under the pointer reticle beneath the user's current X/Z.
  // This shifts only the CAD navigation frame: passthrough cannot move, and planPos
  // remains the physical survey registration maintained by its XR anchor.
  function teleportToReticle(inputSource) {
    if (!placed || !currentFrame || !localSpace) return;
    const hit = rayFloorHit(inputSource);
    const viewer = currentFrame.getViewerPose(localSpace);
    if (!hit || !viewer) return;
    const head = viewer.transform.position;
    const { px, py } = worldToPlan(hit);
    const groupPos = planGroupWorldXZ();
    setNavOffsetForWorldXZ(groupPos.x + head.x - hit.x, groupPos.z + head.z - hit.z);
    applyPlanMatrix();
    if (inputSource?.handedness === 'left') leftTeleportReticle.visible = false;
    else reticle.visible = false;
    rlog('teleport', {
      px: +px.toFixed(3), py: +py.toFixed(3),
      dx: +(head.x - hit.x).toFixed(3), dz: +(head.z - hit.z).toFixed(3),
    });
  }

  // MARKER · EDIT, LINK, and DIMS pick markers only through their flat floor projection,
  // using the same reticle-radius gating as plan edges — a stable plan-space target,
  // and it disambiguates markers stacked at the same X/Y far better than the billboard.
  function markerAtFloorPoint(px, py, markers = project.markers) {
    let best = null, bestD = RETICLE_OUTER;
    for (const marker of markers) {
      const d = Math.hypot(px - marker.x, py - marker.y);
      if (d < bestD) { bestD = d; best = marker; }
    }
    return best;
  }

  // MARKER · WIRE endpoint picker. Grip advances `afterKey`; trigger commits the
  // yellow marker as PICK START or PICK END. Nearby and vertically stacked devices
  // share one distance-then-height ordered cycle.
  function wireMarkerAtFloorPoint(px, py, afterKey = null) {
    const floors = allFloorsView
      ? project.floors
      : [project.activeFloor, ...adjacentFloors()].filter(Boolean);
    // ALL FLOORS: the reticle's storey first, then outward (see pickRanker); a normal
    // view keeps its active + adjacent floors on equal footing.
    const rank = allFloorsView ? pickRanker() : () => 0;
    const candidates = floors.flatMap((floor, floorOrder) => (floor.markers || []).map((marker, order) => ({
        marker, floorId: floor.id, floorOrder, order, key: `marker:${marker.id}`, rank: rank(floor.id),
        distance: Math.hypot(px - marker.x, py - marker.y),
        z: (floor.elevation || 0) + (marker.z || 0),
      })))
      .filter((candidate) => candidate.distance <= RETICLE_OUTER && candidate.rank < Infinity)
      .sort((a, b) => a.rank - b.rank || a.distance - b.distance || b.z - a.z
        || a.floorOrder - b.floorOrder || a.order - b.order);
    if (!candidates.length) return null;
    const current = candidates.findIndex((candidate) => candidate.key === afterKey);
    return candidates[(current + 1) % candidates.length];
  }

  // MARKER · EDIT disambiguates any marker types sharing the exact same floor
  // projection. Once one is selected, keep the amber selection on it and preview
  // the next marker in height order under the yellow reticle; another trigger
  // advances the selection and refreshes its height editor.
  function editMarkerAtFloorPoint(px, py, afterId = null) {
    const marker = markerAtFloorPoint(px, py);
    if (!marker) return null;
    const stack = project.markers
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.x === marker.x && candidate.y === marker.y)
      .sort((a, b) => (b.candidate.z || 0) - (a.candidate.z || 0) || a.index - b.index)
      .map(({ candidate }) => candidate);
    if (stack.length < 2) return marker;
    const selectedIndex = stack.findIndex((candidate) => candidate.id === afterId);
    return stack[selectedIndex < 0 ? 0 : (selectedIndex + 1) % stack.length];
  }

  // LINK must disambiguate switches that share one floor projection. Keep the
  // shared marker picker unchanged for EDIT/DIMS. LINK ignores unrelated marker
  // types entirely, then previews the next switch in top-to-bottom order after
  // each trigger. The amber source remains selected while the yellow reticle
  // advances; aiming at a light exits the stack naturally and makes that light
  // the link target.
  function linkMarkerAtFloorPoint(px, py, afterId = null) {
    const wanted = selectedLinkSwitch ? 'light' : 'switch';
    const candidates = project.markers
      .map((marker, order) => ({ marker, order, distance: Math.hypot(px - marker.x, py - marker.y) }))
      .filter(({ marker, distance }) => marker.type === wanted && distance <= RETICLE_OUTER)
      .sort((a, b) => a.distance - b.distance || (b.marker.z || 0) - (a.marker.z || 0) || a.order - b.order);
    if (!candidates.length) return null;
    const current = candidates.findIndex(({ marker }) => marker.id === afterId);
    return candidates[(current + 1) % candidates.length].marker;
  }

  function outlineMarker(marker, role = 'wall', color = 0xffe14d) {
    if (!marker) return;
    const visual = markerGroup.children.find(
      (o) => o.userData.markerId === marker.id && o.userData.markerRole === `${role}-outline`,
    );
    if (!visual) return;
    visual.material.color.setHex(color);
    visual.visible = true;
  }

  // The dim value panel the RETICLE is over: the nearest eligible sprite within the
  // reticle radius. `markerDomain` hard-filters overlapping labels so a label from
  // the other dimension domain cannot mask the intended target.
  function dimLabelAtPoint(px, py, domain = null) {
    let best = null, bestD = RETICLE_OUTER;
    for (const s of dimSprites) {
      if (domain != null) {
        const c = project.constraints.find((k) => k.id === s.userData.cId);
        if (!c || dimDomain(c) !== domain) continue;
      }
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
  // null. Used by the numpad and every ray-picked menu to select a cell/row.
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

  const C_ORIGIN = 0x4ea1ff; // REGISTER accent — one color across all 3 gesture steps
  const C_RECAL = 0x22d3ee, C_RECAL_DIR = 0xa78bfa; // RECAL step 1 (corner) / step 2 (direction) colors
  const C_LEVEL = 0x38bdf8; // LEVEL (storey height / floor switch) accent
  const C_UNIT = 0xa78bfa; // UNIT (display/input units) accent
  const C_LANG = 0x94a3b8; // LANG (UI language switch) accent — neutral slate
  const C_EXPORT = 0xe0b341; // unified sheet/CAD output accent

  // Drop a throwaway starter rectangle (ROOM = add; every other kind = subtract) at the user's
  // standing position — no floor touch needed, since the box is throwaway and its
  // edges get pushed to the real walls in EDGE mode. It becomes the active rect.
  function dropRect(kind) {
    if (!placed) return; // need a registered frame (ORIGIN) to define plan space
    const e = renderer.xr.getCamera().matrixWorld.elements; // headset world pos
    _drop.set(e[12], floorY, e[14]);
    const { px, py } = worldToPlan(_drop);
    const half = 0.75; // 1.5 m starter box — size is throwaway, edges get pushed
    const op = zoneOp(kind);
    const rect = new Rectangle({ x: px - half, y: py - half, w: 2 * half, h: 2 * half, op, kind });
    project.addRectangle(rect);
    surveyed.push(rect.id);
    activeRect = rect;
    selectedEdge = null;
    edgePickKey = null;
    buildPlan();       // re-read footprint (now includes the new rect); keeps transform
    applyPlanMatrix(); // buildPlan swaps geometry only; reassert position/yaw
    rlog('drop rect', { id: rect.id, kind, op, px: +px.toFixed(3), py: +py.toFixed(3) });
  }

  // PLAN · EDIT thumbstick-y: cycle the selected zone's authored kind. Every
  // non-room kind maps to subtract until type-specific geometry arrives.
  function cycleSelectedZoneKind(dir = 1) {
    if (!selectedRect) return;
    const current = zoneKindOf(selectedRect);
    const i = ZONE_KINDS.indexOf(current);
    selectedRect.setKind(ZONE_KINDS[(i + dir + ZONE_KINDS.length) % ZONE_KINDS.length]);
    project.touch();
    buildPlan();
    applyPlanMatrix();
    updateRoomAreaHud();
    // The mode breadcrumb deliberately stays PLAN · EDIT. The dedicated TYPE
    // readout is the sole UI element whose label/color changes with the zone kind.
    rlog('edit kind', { id: selectedRect.id, kind: selectedRect.kind, op: selectedRect.op });
    // Retyping can flip a room into an aperture (or back): keep the sill/head pad in
    // sync so it opens on the new opening band and closes for non-apertures.
    syncBandPad();
  }

  // ---- PLAN EDIT vertical-band editor (aperture sill/head + furniture foot/top) ----
  // Selecting a rect that carries a vertical band opens the reused DIMS numpad to type
  // its bounds; the SWAP cell becomes a field toggle. Two kinds of band share this pad:
  //   • apertures — opening band [sill, head] (which bounds are editable is per-kind:
  //     window/heater = SILL+HEAD, door/garage/sliding = HEAD only, half wall = SILL only);
  //   • furniture placeholders — solid body band [foot, top] (both bounds).
  // Bounds are always [lower, upper] in field order; the commit keeps them ordered.
  // Aperture hinge/swing stay on A/X rotate; B/Y deletes the whole zone.
  const bandFields = (rect) => verticalBandFields(rect);
  const rectHasBand = (rect) => bandFields(rect).length > 0;
  // Field labels are namespaced by which band the field belongs to.
  const bandFieldLabel = (f) =>
    (f === 'foot' || f === 'top') ? t(`furniture.${f}`) : t(`aperture.${f}`);
  const bandKindLabel = () => selectedRect ? t(`mode.${zoneKindOf(selectedRect)}`) : '';
  const bandTitle = () => `${bandKindLabel()}  ·  ${bandFieldLabel(bandField)}`;
  // SWAP names the field it switches TO (null when a single bound is editable → inert).
  const bandSwapLabel = () => {
    const fs = bandFields(selectedRect);
    if (fs.length < 2) return null;
    const other = fs[(fs.indexOf(bandField) + 1) % fs.length];
    return `⇄ ${bandFieldLabel(other).toUpperCase()}`;
  };
  const redrawBandPad = () =>
    numpad.draw(bandTitle(), bandBuffer, hoverKey, bandSwapLabel());

  function refreshBandPad() {
    const fs = bandFields(selectedRect);
    if (!fs.includes(bandField)) bandField = fs[0]; // clamp after a retype
    bandBuffer = selectedRect ? fmt(selectedRect[bandField] ?? 0) : '';
    bandPristine = true;
    redrawBandPad();
  }

  function activateBandPad() {
    bandField = bandFields(selectedRect)[0] || 'sill'; // door/garage/sliding open on HEAD
    placePanel(numpad.group);
    numpad.group.visible = true;
    refreshBandPad();
  }

  // Open/refresh/close the pad to match the current selection — a band-carrying rect
  // shows it, anything else (or no selection) tears it down.
  function syncBandPad() {
    if (rectHasBand(selectedRect)) {
      if (numpad.group.visible) refreshBandPad(); else activateBandPad();
    } else if (numpad.group.visible) {
      deactivateNumpad();
    }
  }

  function cycleBandField() {
    const fs = bandFields(selectedRect);
    if (fs.length < 2) return; // nothing to toggle
    bandField = fs[(fs.indexOf(bandField) + 1) % fs.length];
    refreshBandPad();
  }

  function commitBandField() {
    if (!rectHasBand(selectedRect)) return;
    const val = parseFloat(bandBuffer);
    if (!Number.isFinite(val) || val < 0) return; // negatives rejected; 0 = at the floor
    const m = toMeters(val);
    // Keep the band ordered: field[0] is the lower bound, field[1] the upper.
    const fs = bandFields(selectedRect), i = fs.indexOf(bandField);
    const upper = i === 0 && fs.length > 1 ? selectedRect[fs[1]] : null;
    const lower = i === 1 ? selectedRect[fs[0]] : null;
    if (upper != null && m >= upper) { rlog('band lower rejected (>= upper)', { id: selectedRect.id, m }); return; }
    if (lower != null && m <= lower) { rlog('band upper rejected (<= lower)', { id: selectedRect.id, m }); return; }
    selectedRect[bandField] = m;
    project.touch(); // band bounds aren't solver inputs, but mark dirty → autosave + listeners
    rlog('band edit', { id: selectedRect.id, field: bandField, m: +m.toFixed(3) });
    refreshBandPad(); // stay open so the other bound can be typed next
  }

  function pressBandKey(k) {
    if (k === 'enter') { commitBandField(); return; }
    if (k === 'swap') { cycleBandField(); return; }
    if (k === 'del') { deleteInMode(); deactivateNumpad(); return; } // remove the whole zone
    if (bandPristine && k !== 'back') bandBuffer = '';
    bandPristine = false;
    if (k === 'back') bandBuffer = bandBuffer.slice(0, -1);
    else if (k === '.') { if (!bandBuffer.includes('.')) bandBuffer += '.'; }
    else if (bandBuffer.replace('.', '').length < 6) bandBuffer += k;
    redrawBandPad();
  }

  // DIMS mode: flip which SIDE ref B sits on relative to ref A — negates the signed
  // distance (magnitude kept). Works for edge<->edge (the edge jumps to A's other
  // side) AND edge<->origin (the edge jumps to the other side of the origin axis; the
  // origin datum itself never moves). Bound to B/Y in DIMS. To flip an existing
  // dimension, re-pick its two refs (re-selects the constraint) then press B/Y. No-op
  // before a distance exists. A flip that would over-constrain is refused.
  function swapDim() {
    if (!dimRefA || !dimRefB) return;
    let c = editingId ? project.constraints.find((k) => k.id === editingId)
                      : findConstraintForRefs(dimRefA, dimRefB);
    if (!c) {
      // No constraint yet: create one at the current buffer value so FLIP has something
      // to act on (same as committing then flipping, without leaving the pad).
      const val = parseFloat(dimBuffer);
      if (!Number.isFinite(val) || val < 0) { rlog('dim flip: enter a distance first'); return; }
      c = makeConstraintForRefs(dimRefA, dimRefB);
      project.setConstraintMagnitude(c.id, toMeters(val));
      if (dimOffsetPt) setDimOffset(c, dimOffsetPt.px, dimOffsetPt.py); // default line where the tip stood
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

  // ---- PLAN · TRANSLATE: define one X edge and one Y edge against origin, then
  // move the complete active floor once. This avoids asking the solver to satisfy
  // the two coordinates sequentially, which can deform a constrained graph.
  const translateAxis = (ref) => isXEdge(ref.edge) ? 'x' : 'y';

  function resetTranslate() {
    translateTargets = { x: null, y: null };
    translateEdge = null;
    translateBuffer = '';
    translatePristine = false;
    translateSign = 1;
    numpad.group.visible = false;
    numpadCursor.visible = false;
    hoverKey = prevHoverKey = null;
  }

  const translateTitle = () => translateEdge
    ? `${t(`edge.${translateEdge.edge}`)} · ${t(`translate.set${translateAxis(translateEdge).toUpperCase()}`)}`
    : t('translate.pickAny');
  const redrawTranslatePad = () => numpad.draw(translateTitle(), `${translateSign < 0 ? '−' : ''}${translateBuffer}`, hoverKey);

  function beginTranslateEdge(ref) {
    const axis = translateAxis(ref);
    if (translateTargets[axis]) return;
    translateEdge = { ...ref };
    const coord = coordOnAxis(ref, axis);
    translateSign = coord < 0 ? -1 : 1;
    translateBuffer = fmt(Math.abs(coord));
    translatePristine = true;
    placePanel(numpad.group);
    numpad.group.visible = true;
    redrawTranslatePad();
    rlog('translate edge', { axis, ref, coord: +coord.toFixed(3) });
  }

  function finishTranslateAxis() {
    if (!translateEdge) return;
    const entered = parseFloat(translateBuffer);
    if (!Number.isFinite(entered) || entered < 0) return;
    const axis = translateAxis(translateEdge);
    translateTargets[axis] = { ref: { ...translateEdge }, value: translateSign * toMeters(entered) };
    translateEdge = null;
    translateBuffer = '';
    numpad.group.visible = false;
    numpadCursor.visible = false;
    hoverKey = prevHoverKey = null;

    if (!translateTargets.x || !translateTargets.y) {
      rlog('translate axis set', { axis, value: +translateTargets[axis].value.toFixed(3) });
      return;
    }

    const tx = translateTargets.x, ty = translateTargets.y;
    const dx = tx.value - coordOnAxis(tx.ref, 'x');
    const dy = ty.value - coordOnAxis(ty.ref, 'y');

    // Retain the chosen positioning references as explicit origin constraints.
    // They are created after the transform but before its single emit, so a new
    // dimension starts at its natural midpoint rather than inheriting a phantom
    // pre-translation label position.
    project.translateActiveFloor(dx, dy, { originEdges: [tx.ref, ty.ref] });
    rlog('floor translated', { dx: +dx.toFixed(3), dy: +dy.toFixed(3) });
    resetTranslate();
    buildPlan();
    applyPlanMatrix();
  }

  function pressTranslateKey(k) {
    if (!translateEdge) return;
    if (k === 'enter') { finishTranslateAxis(); return; }
    if (k === 'swap') { translateSign *= -1; redrawTranslatePad(); return; }
    if (k === 'del') {
      translateEdge = null;
      translateBuffer = '';
      numpad.group.visible = false;
      numpadCursor.visible = false;
      return;
    }
    if (translatePristine && k !== 'back') translateBuffer = '';
    translatePristine = false;
    if (k === 'back') translateBuffer = translateBuffer.slice(0, -1);
    else if (k === '.') { if (!translateBuffer.includes('.')) translateBuffer += '.'; }
    else if (translateBuffer.replace('.', '').length < 6) translateBuffer += k;
    redrawTranslatePad();
  }

  function onTranslateTouch() {
    if (!placed || !project.rectangles.length) return;
    if (translateEdge) { if (hoverKey) pressTranslateKey(hoverKey); return; }
    if (hoverEdge) beginTranslateEdge({ kind: 'edge', rectId: hoverEdge.rectId, edge: hoverEdge.edge });
  }

  // Modes share the touch gesture (trigger). A/B (or thumbstick left/right) cycle
  // between them; the tip/reticle/label recolor so the active mode is always
  // visible. FLOOR + REGISTER set up the frame; DROP authors typed zones and EDGE snaps
  // their edges to the real walls.
  const modes = [
    {
      id: 'floor', color: 0x51d88a, // label/help via i18n: mode.floor / help.floor
      // Calibrate the shared GROUND datum from whichever storey is active. The
      // touched surface is that storey's real floor, so subtract its model
      // elevation before lifting the active overlay by the same amount.
      onTouch: (pos) => {
        const elevation = activeElevation();
        floorY = pos.y - elevation;
        if (placed) placeAt(planPos.x, floorY, planPos.z);
        rlog('floor calibrated', {
          floor: project.activeFloor?.name,
          touchY: +pos.y.toFixed(3),
          elevation: +elevation.toFixed(3),
          groundY: +floorY.toFixed(3),
        });
      },
    },
    {
      id: 'level', color: C_LEVEL, // label/help via i18n: mode.level / help.level
      // Per-storey height, entered by hand (Quest can't measure the vertical offset).
      // Trigger drives the numpad; thumbstick-y cycles the floor/view.
      onTouch: onLevelTouch,
    },
    {
      id: 'teleport', color: C_TELEPORT,
      // Locomotion only: aim at the active floor and bring that virtual plan point
      // beneath the headset. Does not mutate geometry, constraints, or registration.
      onTouch: (_pos, inputSource) => teleportToReticle(inputSource),
    },
    {
      // REGISTER: a 3-point gesture that DERIVES the origin corner, so the corner
      // itself never has to be reachable (it's often blocked by furniture/walls).
      // Touch two points P1,P2 along one real wall (this sets +X down that wall),
      // then a third point P3 on the perpendicular wall. The origin is the corner
      // where the two walls meet = P3 projected onto the P1->P2 wall line. The tip
      // label steps WALL 1 -> WALL 2 -> PERP so the current step is always visible.
      id: 'register', color: C_ORIGIN, // label/help via i18n: mode.register / help.register
      onTouch: (pos) => {
        registerPts.push({ x: pos.x, z: pos.z });
        const n = registerPts.length;
        if (n === 1) { applyModeVisual(t('lbl.wall2'), C_ORIGIN); rlog('register p1', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) }); return; }
        if (n === 2) {
          const [p1, p2] = registerPts;
          if (Math.hypot(p2.x - p1.x, p2.z - p1.z) < 0.05) { registerPts.pop(); return; } // too close to define the wall
          applyModeVisual(t('lbl.perp'), C_ORIGIN); rlog('register p2', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) }); return;
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
        applyModeVisual(t('mode.register'), C_ORIGIN);              // ready to re-register next time
        rlog('register corner', { cx: +cx.toFixed(3), cz: +cz.toFixed(3), yaw: +planYaw.toFixed(3) });
      },
    },
    {
      id: 'drop', color: zoneColorHex('room'), // stable PLAN · ADD accent
      // One action: drop a rectangle of the current zone kind (ROOM = add roomspace;
      // every other kind = subtract solid for now) at your standing position. Thumbstick up/down picks the kind
      // (the separate TYPE readout tracks it); push the edges to the real walls in EDGE.
      onTouch: () => dropRect(currentZoneKind),
    },
    {
      id: 'edge', color: 0xff5db1, // label/help via i18n: mode.edge / help.edge
      // Two presses per wall: 1st (aiming at an edge of ANY zone) LOCKS that edge;
      // 2nd (tip touching the real wall) snaps the locked edge to the wall. The ray
      // picks the edge across all zones; the touch supplies only the perpendicular
      // coordinate.
      onTouch: (pos) => {
        if (!placed) return;
        if (!selectedEdge) {
          if (hoverEdge) {
            selectedEdge = hoverEdge;
            edgePickKey = null;
            rlog('edge locked', { edge: hoverEdge.edge, rect: hoverEdge.rectId });
          }
          return;
        }
        const rect = project.rectangles.find((r) => r.id === selectedEdge.rectId);
        if (rect) {
          const { px, py } = worldToPlan(pos);
          setEdge(rect, selectedEdge.edge, px, py);
          rlog('edge set', { edge: selectedEdge.edge, px: +px.toFixed(3), py: +py.toFixed(3) });
        }
        selectedEdge = null;
        edgePickKey = null;
        project.touch();   // rectangle mutated in place -> re-solve + notify
        buildPlan();
        applyPlanMatrix();
      },
    },
    {
      id: 'edit', color: 0xa78bfa, // label/help via i18n: mode.edit / help.edit
      // PLAN editing domain: select a zone under the floor pointer; pressing again
      // cycles DOWN through overlapping zones (wraps), so any buried zone is
      // reachable. Outlets are deliberately ignored here. The selection persists +
      // is zebra-highlighted. GRIP deletes it; thumbstick-y cycles its zone kind.
      onTouch: () => {
        if (!placed) return;
        // While a band pad is open and the ray is on a key, the trigger drives the pad
        // (mirrors MARKER). Aiming at the floor (hoverKey null) falls through to zone
        // stack-cycling below.
        if (selectedRect && numpad.group.visible && hoverKey) { pressBandKey(hoverKey); return; }
        if (selectedRect) {
          selectedRect = null; deactivateNumpad(); updateRoomAreaHud();
          rlog('edit deselect'); return;
        }
        if (!hoverStack.length) return;
        selectedRect = hoverStack[0];
        syncBandPad(); // a band-carrying rect opens its pad; a plain room tears it down
        updateRoomAreaHud();
        setModeInfo();
        rlog('edit select', {
          id: selectedRect.id, kind: zoneKindOf(selectedRect), op: selectedRect.op, stack: hoverStack.length,
        });
      },
    },
    {
      id: 'translate', color: 0x2dd4bf,
      // Pick one vertical and one horizontal edge, enter their signed distances
      // from origin, then rigidly translate every item and annotation on this floor.
      onTouch: onTranslateTouch,
    },
    {
      id: 'marker', color: C_MARKER, // label/help via i18n: mode.marker / help.marker
      // MARKER editing domain. Thumbstick-y picks the drop type (currentMarkerType).
      // Aim at an existing marker to edit its height; grip-drag moves it and grip away deletes
      // the selection. Trigger on empty space drops a new marker of the current type at the
      // tip. MARKER DIMS owns its wall-pin constraints.
      onTouch: (pos) => {
        if (!placed) return;
        if (selectedMarker && numpad.group.visible && hoverKey) { pressMarkerKey(hoverKey); return; }
        if (selectedMarker) { selectedMarker = null; deactivateNumpad(); rlog('marker deselect'); return; }
        if (hoverMarker) {
          selectedMarker = hoverMarker;
          activateMarkerPad();
          rlog('marker select', { id: selectedMarker.id });
          return;
        }
        // First empty-space trigger leaves an existing edit before another marker
        // can be dropped, avoiding accidental duplicates while operating the pad.
        const { px, py } = worldToPlan(pos);
        // Lights live on the ceiling (unreachable to tip-capture), so default their z to
        // the storey height; other fixtures capture z from the controller tip height.
        const z = currentMarkerType === 'light' ? project.height : Math.max(0, pos.y - overlayY());
        const m = project.addMarker({ type: currentMarkerType, x: px, y: py, z });
        buildPlan(); applyPlanMatrix();
        rlog('marker drop', { id: m.id, type: m.type, px: +px.toFixed(3), py: +py.toFixed(3), z: +z.toFixed(3) });
      },
    },
    {
      id: 'marker_link', color: 0x38bdf8, // logical electrical control + auto ceiling route
      // Trigger a switch to make it the source, then trigger lights to toggle
      // independent control links. Repeated triggers over an exact-X/Y vertical
      // switch stack cycle its members from highest to lowest before light picking.
      // Multiple lights per switch and multiple switches per light emerge naturally
      // from pairwise links.
      onTouch: () => {
        if (!placed || !hoverMarker) return;
        if (hoverMarker.type === 'switch') {
          selectedLinkSwitch = hoverMarker;
          markerLinkPickAfterId = null;
          rlog('link switch selected', { id: hoverMarker.id });
          return;
        }
        if (!selectedLinkSwitch || hoverMarker.type !== 'light') return;
        const result = project.toggleElectricalLink(selectedLinkSwitch.id, hoverMarker.id);
        if (!result.ok) return;
        buildPlan();
        applyPlanMatrix();
        rlog(result.linked ? 'light linked' : 'light unlinked', {
          switchId: selectedLinkSwitch.id, lightId: hoverMarker.id, linkId: result.link?.id,
        });
      },
    },
    {
      id: 'marker_conduit', color: 0xa78bfa, // build the shared conduit network (a graph)
      // Pen model: penNodeId is the growing end. Trigger a device/existing node to
      // start (or connect) there; trigger empty space to drop a junction + run a
      // conduit segment to it; trigger another node to join/branch/loop. Grip lifts
      // the pen. See help.marker_conduit.
      onTouch: (pos) => {
        if (!placed) return;
        // The per-frame combined picker has already disambiguated active-floor nodes
        // and devices by distance/cycle order. Adjacent targets and empty floor follow.
        const prevPen = penNodeId;
        const nodesBefore = new Set(project.conduitNodes.map((n) => n.id));
        const segmentsBefore = new Set(project.conduitSegments.map((s) => s.id));
        let targetNodeId = hoverConduitNode?.id || null;
        if (!targetNodeId && hoverMarker) {
          targetNodeId = project.ensureConduitNodeAtMarker(hoverMarker.id).id;
        }
        let split = null;
        if (!targetNodeId && !hoverMarker && hoverPenSplit) {
          // T-junction: split the run and branch from the new junction.
          const source = project.conduitSegments.find((s) => s.id === hoverPenSplit.segmentId);
          if (source) {
            split = { a: source.a, b: source.b };
            const { x, y, z, floorId } = hoverPenSplit;
            targetNodeId = project.splitConduitSegment(source.id, { x, y, z, floorId })?.id || null;
          }
        }
        if (!targetNodeId && hoverAdjacent) {
          targetNodeId = hoverAdjacent.kind === 'node'
            ? hoverAdjacent.id
            : project.ensureConduitNodeAtMarker(hoverAdjacent.id).id;
        }
        if (!targetNodeId) {
          const { px, py } = worldToPlan(pos);
          let floor = project.activeFloor;
          let z = Math.max(0, pos.y - overlayY());
          if (allFloorsView) {
            const absoluteZ = Math.max(0, pos.y - planPos.y);
            floor = project.floors.reduce((best, candidate) => {
              const lo = candidate.elevation || 0;
              const hi = lo + (candidate.height || 0);
              const distance = absoluteZ < lo ? lo - absoluteZ : absoluteZ > hi ? absoluteZ - hi : 0;
              return !best || distance < best.distance ? { floor: candidate, distance } : best;
            }, null)?.floor || project.activeFloor;
            z = Math.max(0, Math.min(floor.height || Infinity, absoluteZ - (floor.elevation || 0)));
          }
          targetNodeId = project.addConduitNode({ x: px, y: py, z, floorId: floor.id, emit: false }).id;
        }
        const seg = penNodeId && penNodeId !== targetNodeId
          ? project.addConduitSegment(penNodeId, targetNodeId, { emit: false }) : null;
        conduitPenHistory.push({
          prevPen,
          nodeId: nodesBefore.has(targetNodeId) ? null : targetNodeId,
          segmentId: seg && !segmentsBefore.has(seg.id) ? seg.id : null,
          split, // the run {a, b} this step split at nodeId, re-joined on undo
        });
        penNodeId = targetNodeId;
        // One solve + notify for the whole pen step (node + segment + any marker bind),
        // instead of an _emit per mutation. A conduit node touches no plan geometry, so
        // skip the costly buildPlan()/dimension rebuild — only the conduit layer changed.
        project.touch();
        buildConduits(); buildAdjacentTargets('marker_conduit');
        rlog('conduit pen', { node: penNodeId, riser: !!hoverAdjacent || allFloorsView });
      },
    },
    {
      id: 'conduit_edit', color: 0xa78bfa, // select/move/delete conduit nodes or segments
      // With nothing selected, grip cycles overlapping nodes/segments and trigger
      // selects the highlighted candidate. Only a selected node may then be grip-dragged;
      // B/Y deletes the selected node or segment. Trigger again deselects.
      onTouch: () => {
        if (!placed) return;
        if (selectedConduitNodeObj() && numpad.group.visible && hoverKey) { pressNodeKey(hoverKey); return; }
        if (selectedConduitNodeId || selectedConduitSegmentId) {
          rlog('conduit deselect', { node: selectedConduitNodeId, segment: selectedConduitSegmentId });
          selectConduitNode(null);
          return;
        }
        if (hoverConduitNode) {
          selectConduitNode(hoverConduitNode.id);
          rlog('conduit node select', { id: hoverConduitNode.id });
          return;
        }
        if (hoverConduitSegmentId) {
          selectConduitSegment(hoverConduitSegmentId);
          rlog('conduit segment select', { id: hoverConduitSegmentId });
        }
      },
    },
    {
      id: 'marker_wire', color: 0xf59e0b, // wires routed over the conduit network
      // Define a wire by triggering its two device markers — its physical path is the
      // AUTO shortest route through the conduits, drawn instantly. While a wire is
      // selected, trigger a conduit node to force the route through it (a manual `via`
      // override); grip pops the last override, or (with none) deletes the wire. An
      // existing wire can be re-selected by triggering it.
      onTouch: () => {
        if (!placed) return;
        // A device endpoint may be on the active floor (hoverMarker) OR an adjacent floor
        // (hoverAdjacent) — the latter makes the wire span storeys over a riser.
        const endMarker = hoverMarker
          || (hoverAdjacent?.kind === 'marker' ? project.findMarker(hoverAdjacent.id)?.marker : null);
        // A selected wire is in override mode: pick conduit nodes to thread it.
        if (selectedRoutedWire) {
          if (hoverConduitNode) {
            project.addWireVia(selectedRoutedWire.id, hoverConduitNode.id);
            buildRoutedWires();
            rlog('wire via add', { wire: selectedRoutedWire.id, node: hoverConduitNode.id });
            return;
          }
          if (endMarker) { selectedRoutedWire = null; wireFromMarker = endMarker; wireEndpointPickAfterKey = null; rlog('wire from', { id: endMarker.id }); return; }
          if (hoverRoutedWire && hoverRoutedWire.id !== selectedRoutedWire.id) { selectedRoutedWire = hoverRoutedWire; rlog('wire reselect', { id: hoverRoutedWire.id }); return; }
          selectedRoutedWire = null; rlog('wire deselect'); return;
        }
        // No pending pair: a marker starts a new wire; an existing wire selects for override.
        if (!wireFromMarker) {
          if (endMarker) { wireFromMarker = endMarker; wireEndpointPickAfterKey = null; rlog('wire from', { id: endMarker.id }); return; }
          if (hoverRoutedWire) {
            selectedRoutedWire = hoverRoutedWire; routedWirePickAfterId = null;
            rlog('wire select', { id: hoverRoutedWire.id }); return;
          }
          return;
        }
        // Second endpoint → create the wire (auto shortest route) and select it.
        if (endMarker && endMarker.id !== wireFromMarker.id) {
          const result = project.addWire(wireFromMarker.id, endMarker.id, currentWireType);
          if (result.ok) {
            selectedRoutedWire = result.wire;
            wireFromMarker = null;
            wireEndpointPickAfterKey = null;
            buildRoutedWires();
            rlog('wire create', { from: result.wire.fromMarkerId, to: result.wire.toMarkerId, id: result.wire.id });
          }
        }
      },
    },
    {
      id: 'marker_pipe', color: 0x38bdf8,
      onTouch: (pos) => {
        if (!placed) return;
        if (selectedPipe) { selectedPipe = null; pendingPipeMerge = null; return; }
        const sourceService = pipePenNodeId
          ? project.pipeServiceAtNode(pipePenNodeId, currentPipeService) : currentPipeService;
        let targetNodeId = hoverPipeNode?.id || null;
        if (!targetNodeId && hoverMarker) {
          targetNodeId = project.ensurePipeNodeAtMarker(hoverMarker.id, sourceService)?.id || null;
        }
        if (!targetNodeId && !pipePenNodeId && hoverPipe) { selectedPipe = hoverPipe; return; }
        if (!targetNodeId) {
          const { px, py } = worldToPlan(pos);
          let floor = project.activeFloor;
          let z = Math.max(0, pos.y - overlayY());
          if (allFloorsView) {
            const absoluteZ = Math.max(0, pos.y - planPos.y);
            floor = project.floors.reduce((best, candidate) => {
              const lo = candidate.elevation || 0, hi = lo + (candidate.height || 0);
              const distance = absoluteZ < lo ? lo - absoluteZ : absoluteZ > hi ? absoluteZ - hi : 0;
              return !best || distance < best.distance ? { floor: candidate, distance } : best;
            }, null)?.floor || project.activeFloor;
            z = Math.max(0, Math.min(floor.height || Infinity, absoluteZ - (floor.elevation || 0)));
          }
          targetNodeId = project.addPipeNode({ x: px, y: py, z, floorId: floor.id, emit: false }).id;
        }
        if (pipePenNodeId && pipePenNodeId !== targetNodeId) {
          const sourceComponent = project.pipeComponent(pipePenNodeId);
          const targetComponent = project.pipeComponent(targetNodeId);
          const networksDiffer = !sourceComponent.nodeIds.has(targetNodeId)
            && targetComponent.pipes.some((pipe) => pipe.service !== sourceService);
          const samePending = pendingPipeMerge?.sourceNodeId === pipePenNodeId
            && pendingPipeMerge?.targetNodeId === targetNodeId
            && pendingPipeMerge?.service === sourceService;
          if (networksDiffer && !samePending) {
            pendingPipeMerge = { sourceNodeId: pipePenNodeId, targetNodeId, service: sourceService };
            setModeInfo();
            rlog('pipe merge warning', { from: pipePenNodeId, to: targetNodeId, service: sourceService });
            return;
          }
          if (networksDiffer) project.setPipeComponentService(targetNodeId, sourceService, { emit: false });
          project.addPipe(pipePenNodeId, targetNodeId, sourceService, 0.016, { emit: false });
        }
        pipePenNodeId = targetNodeId;
        currentPipeService = sourceService;
        pendingPipeMerge = null;
        pipePickAfterKey = null;
        project.touch(); buildPipes();
        setModeInfo();
        rlog('pipe pen', { node: pipePenNodeId, service: currentPipeService });
      },
    },
    {
      id: 'furnish', color: 0xa78bfa, // place real furniture GLB models (loaded on the fly)
      // Thumbstick-y cycles the article to drop (or rotates the selected item 15°/tick).
      // Trigger an item to select it; trigger empty floor to drop the current article;
      // grip-drag an item to move it; grip away from an item to delete the selection.
      onTouch: (pos) => {
        if (!placed) return;
        // With the foot-elevation pad open and the ray on a key, the trigger drives the
        // pad (mirrors MARKER); aiming at the floor falls through to select/drop.
        if (selectedFurnitureId && numpad.group.visible && hoverKey) { pressFurnitureKey(hoverKey); return; }
        if (hoverFurnitureId) { // select the aimed item (opens the foot pad; also rotate/move/delete)
          selectedFurnitureId = hoverFurnitureId;
          activateFurniturePad();
          setModeInfo();
          rlog('furniture select', { id: selectedFurnitureId });
          return;
        }
        if (selectedFurnitureId) { selectedFurnitureId = null; deactivateNumpad(); setModeInfo(); return; } // first empty trigger deselects
        if (!currentFurnitureArticle) { rlog('furniture drop skipped: empty catalog'); return; }
        const { px, py } = worldToPlan(pos);
        const item = project.addFurniture({ article: currentFurnitureArticle, x: px, y: py, rotationY: 0 });
        buildFurniture();
        rlog('furniture drop', { id: item.id, article: item.article, px: +px.toFixed(3), py: +py.toFixed(3) });
      },
    },
    {
      id: 'recal', color: C_RECAL, // label/help via i18n: mode.recal / help.recal
      // Correct drift: re-zero the plan against a KNOWN corner, REGISTER-style so the
      // corner apex needn't be reachable. First SELECT a corner — point so the reticle
      // hugs the wall you want as "wall 1" (the nearer wall becomes 1, the other 2) and
      // trigger to lock it. Then touch P1,P2 along real wall 1 (sets the true orientation)
      // and P3 on real wall 2; the real corner = P3 projected onto the wall-1 line.
      // recalibrate() re-solves yaw + position so the selected plan corner lands on it —
      // both rotational and positional drift are corrected.
      onTouch: (pos, inputSource) => {
        if (!placed) return;
        if (!recalLocked) {
          // SELECT phase is pointer-driven: lock the corner + wall order at the
          // ray/floor reticle, not at the floor projection beneath the physical tip.
          const hit = rayFloorHit(inputSource);
          if (!hit) return;
          const { px, py } = worldToPlan(hit);
          const near = nearestPlanCorner(px, py);
          if (!near) return; // no surveyed corners to reference yet
          recalCorner = orderWallsByReticle(near, px, py); // a = wall 1 (hugged wall), b = wall 2
          recalLocked = true;
          recalPts = [];
          applyModeVisual(t('lbl.recalP1'), C_RECAL);
          rlog('recal corner', { cx: +recalCorner.cx.toFixed(3), cy: +recalCorner.cy.toFixed(3) });
          return;
        }
        const n = recalPts.length;
        if (n === 0) {
          recalPts.push({ x: pos.x, z: pos.z }); // P1 along wall 1
          applyModeVisual(t('lbl.recalP2'), C_RECAL);
          rlog('recal p1', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) });
          return;
        }
        if (n === 1) {
          const p1 = recalPts[0];
          if (Math.hypot(pos.x - p1.x, pos.z - p1.z) < 0.05) return; // too close to define wall 1
          recalPts.push({ x: pos.x, z: pos.z }); // P2 along wall 1
          applyModeVisual(t('lbl.recalP3'), C_RECAL_DIR);
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
        recalLocked = false;
        buildPlan();       // geometry unchanged, but reassert against the new transform
        applyModeVisual(t('mode.recal'), C_RECAL); // ready to re-recal next time
        rlog('recal done', { yaw: +planYaw.toFixed(3) });
      },
    },
    {
      id: 'plan_dims', color: 0xfbbf24,
      // Plan constraint domain: edge<->edge size or edge<->origin position lock.
      // Outlet references and pins are completely unavailable here.
      onTouch: onNumpadTouch,
    },
    {
      id: 'outlet_dims', color: C_MARKER,
      // Outlet constraint domain: explicitly select an outlet floor projection first,
      // then a plan edge. Plan edge<->edge/origin constraints are unavailable here.
      onTouch: onNumpadTouch,
    },
    {
      id: 'conduit_dims', color: 0xa78bfa,
      // Conduit-node constraint domain: select a bare junction, then a wall edge, so the
      // junction is PINNED to that wall (one-way, like an outlet) and tracks it on every
      // edit. Marker-bound nodes are inert here (they follow their device).
      onTouch: onNumpadTouch,
    },
    {
      id: 'save', color: 0x51d88a, // label/help via i18n: mode.save / help.save
      // Aim the ray at a slot on the menu and trigger to write the whole project
      // there (overwrites a filled slot). Slots show their save time + rect count.
      onTouch: onSlotTouch,
    },
    {
      id: 'load', color: 0x4ea1ff, // label/help via i18n: mode.load / help.load
      // Aim at a filled slot and trigger to replace the project with it; the loaded
      // plan drops into the frame you already registered. Empty slots are a no-op.
      onTouch: onSlotTouch,
    },
    {
      id: 'export', color: C_EXPORT, // label/help via i18n: mode.export / help.export
      // Active LEVEL floor for sheet/CAD formats; JSON exports the complete project.
      // Thumbstick-y switches SVG/PNG/DXF/JSON; ray+trigger toggles
      // the output profile or presses the separate EXPORT button.
      onTouch: onExportTouch,
    },
    {
      id: 'copy_floor', color: 0x34d399,
      // Snapshot the complete active floor into a clipboard that survives LOAD.
      onTouch: copyActiveFloor,
    },
    {
      id: 'paste_floor', color: 0x2dd4bf,
      // Replace the active floor's plan with a fresh-ID copy; occupied floors confirm.
      onTouch: pasteCopiedFloor,
    },
    {
      id: 'move_up', color: 0x60a5fa,
      // Safe whole-plan reassignment: the next higher floor must exist and be empty.
      onTouch: () => moveFloorBy(1),
    },
    {
      id: 'move_down', color: 0x818cf8,
      // Symmetric whole-plan reassignment to the next lower empty floor.
      onTouch: () => moveFloorBy(-1),
    },
    {
      id: 'unit', color: C_UNIT, // label/help via i18n: mode.unit / help.unit
      // Display/input unit switch (m/cm/mm). The thumbstick moves through the list;
      // a trigger picks the ray-aimed row, or advances one if the ray is off-panel.
      // The unit is a persisted UI preference; authored geometry remains in meters.
      onTouch: () => (hoverUnit ? setUnit(hoverUnit) : cycleUnit(1)),
    },
    {
      id: 'lang', color: C_LANG, // label/help via i18n: mode.lang / help.lang
      // UI language switch (FR/EN/ZH). The thumbstick up/down moves through the list
      // (see pollModeCycle); a trigger picks the ray-aimed row, or advances one if the
      // ray is off the panel. Applies everywhere via the i18n change bus (onLangChange).
      onTouch: () => (hoverLang ? setLang(hoverLang) : cycleLang(1)),
    },
    {
      id: 'perf', color: 0xf472b6, // label/help via i18n: mode.perf / help.perf
      // Diagnostic: trigger starts/stops the GPU layer sweep (see PERF_LAYERS); its
      // results replace the lower debug-HUD lines. Session-only, never saved.
      onTouch: () => {
        togglePerf();
        applyModeVisual(modeChildLabel('perf'), modes[currentMode].color);
      },
    },
  ];
  // Canonical controller-menu order. Keep the implementation blocks grouped by
  // behavior above; this list alone defines how A/B and thumbstick-x traverse them.
  const MODE_ORDER = [
    'register', 'floor', 'level', 'recal', 'teleport',
    'drop', 'edge', 'plan_dims', 'edit',
    'marker', 'outlet_dims', 'marker_link', 'marker_conduit', 'conduit_dims', 'conduit_edit', 'marker_wire', 'marker_pipe',
    'furnish',
    'copy_floor', 'paste_floor', 'move_up', 'move_down', 'translate', 'export', 'save', 'load', 'unit', 'lang', 'perf',
  ];
  const MODE_GROUP = {
    register: 'setup', floor: 'setup', recal: 'setup', teleport: 'setup', level: 'setup',
    drop: 'plan', edge: 'plan', edit: 'plan', plan_dims: 'plan',
    marker: 'marker', marker_link: 'marker', marker_conduit: 'marker', conduit_dims: 'marker', conduit_edit: 'marker', marker_wire: 'marker', marker_pipe: 'marker', outlet_dims: 'marker',
    furnish: 'furnish',
    copy_floor: 'project', paste_floor: 'project', move_up: 'project', move_down: 'project',
    translate: 'project', save: 'project', load: 'project', export: 'project', unit: 'project', lang: 'project',
    perf: 'project',
  };
  // These project tools stay defined and fully functional (SAVE/LOAD can still be
  // driven programmatically) but are removed from the RIGHT thumbstick cycle so the
  // list stays short. Un-hide by deleting the id here — nothing else needs to change.
  const MODE_HIDDEN = new Set(['copy_floor', 'paste_floor', 'move_up', 'move_down']);
  const modeRank = new Map(MODE_ORDER.map((id, i) => [id, i]));
  modes.sort((a, b) => modeRank.get(a.id) - modeRank.get(b.id));
  let currentMode = 0;

  // The interaction remains a fast linear cycle, but every label is presented as
  // GROUP · TOOL so the growing tool list has an explicit, localized hierarchy.
  const modeBreadcrumb = (id, child = t(`mode.${id}`)) => `${t(`group.${MODE_GROUP[id]}`)} · ${child}`;

  // The tool portion of a mode's label. Floor targeting remains visible only in
  // LEVEL; EXPORT's format is shown as a separate controller readout and panel row.
  const modeChildLabel = (id) =>
    id === 'level' ? `${t('mode.level')} · ${allFloorsView ? t('mode.all_floors') : project.activeFloor.name}`
    : id === 'unit' ? `${t('mode.unit')} · ${unitLabel()}`
    : id === 'perf' ? `${t('mode.perf')} · ${t(perfEnabled ? 'perf.on' : 'perf.off')}`
    : t(`mode.${id}`);
  // Mode accents stay fixed; contextual type colors belong to the separate TYPE readout.
  const modeColor = (m) => m.color;

  // Recolor the tip + reticle and set the floating label — used both by setMode
  // and by REGISTER to flip ORIGIN<->ALIGN mid-gesture.
  function applyModeVisual(label, color) {
    for (const tip of controllerTips) tip.material.color.setHex(color);
    reticle.material.color.setHex(color);
    const id = modes[currentMode]?.id;
    const title = id ? modeBreadcrumb(id, label) : label;
    for (const l of labels) l.setText(title, color);
  }

  // Refresh EVERY per-mode panel (label chip + help/info box) to the current mode's tool
  // label and color. Contextual ADD/EDIT types live in the separate TYPE readout.
  // Shared by setMode, the language switch, and the kind pickers so the help box never goes
  // stale behind the label (e.g. switching ROOM->WALL must update both, not just the chip).
  function setModeInfo() {
    const m = modes[currentMode];
    const child = modeChildLabel(m.id), color = modeColor(m);
    applyModeVisual(child, color);
    for (const h of helps) h.setText(modeBreadcrumb(m.id, child), t(`help.${m.id}`), color);
  }

  function setMode(i) {
    currentMode = (i + modes.length) % modes.length;
    registerPts = []; // leaving/entering a mode resets the REGISTER 3-point gesture
    recalPts = []; recalCorner = null; recalLocked = false; // ... and the RECAL gesture
    selectedRect = null; planEditPickAfterId = null; // clear the EDIT selection/picker
    bandBuffer = ''; bandField = 'sill'; // ...and any vertical band being typed (pad torn down below)
    roomComponentCacheKey = '';
    roomComponentCache = null;
    roomAreaHud = null;
    lastHudAt = -Infinity;
    selectedMarker = null; markerEditPickAfterId = null; // ...and marker edit picker
    selectedLinkSwitch = null; markerLinkPickAfterId = null; // ...and link picker/source
    wireFromMarker = null; wireEndpointPickAfterKey = null; // ...and any pending wire pair/picker
    selectedRoutedWire = null; routedWirePickAfterId = null; // ...and routed-wire selection picker
    pipePenNodeId = null; pipePickAfterKey = null; hoverPipeNode = null; selectedPipe = null; pendingPipeMerge = null;
    penNodeId = null; conduitPickAfterKey = null; conduitPenHistory = []; hoverPenSplit = null; // ...and lift/reset the conduit pen picker + its undo
    selectedConduitNodeId = null; selectedConduitSegmentId = null;
    conduitEditHoverKey = null; conduitEditPickAfterKey = null; nodeBuffer = ''; // ...and any CONDUIT EDIT selection
    selectedFurnitureId = null; furnitureBuffer = ''; // ...and any FURNISH selection + its foot pad
    selectedEdge = null; edgePickKey = null; edgeSnapPrompt = false; // drop any pending EDGE lock + its label
    resetTranslate(); // ...and any partially-defined rigid floor translation
    clearTimeout(projectFlashTimer);
    pasteConfirmFloorId = null;
    rectHi.visible = false;
    zebra.visible = false;
    const m = modes[currentMode];
    setModeInfo(); // fixed mode label chip + help box
    if (isDimMode(m.id)) activateNumpad(); // start the selected domain in ref-pick phase
    else if (m.id === 'level' && !allFloorsView) activateLevelPad(); // real floors expose height entry
    else deactivateNumpad();
    if (m.id === 'save' || m.id === 'load') showSlotMenu(); // park the slot menu in front of you
    else deactivateSlotMenu();
    if (m.id === 'lang') showLangMenu(); // park the language menu in front of you
    else hideLangMenu();
    if (m.id === 'unit') showUnitMenu(); // park the unit menu in front of you
    else hideUnitMenu();
    if (m.id === 'export') showExportMenu();
    else hideExportMenu();
    if (isSheetExportMode(m.id)) showSheet(); // refresh active-floor preview on entry
    else hideSheet();
    // CONDUIT authoring/editing and WIRE routing all need the network on screen;
    // WIRE additionally draws the routed wires it defines over that network.
    const showConduits = m.id === 'marker_conduit' || m.id === 'conduit_edit' || m.id === 'marker_wire' || m.id === 'conduit_dims';
    if (showConduits) buildConduits();
    conduitGroup.visible = showConduits;
    if (m.id === 'marker_wire') buildRoutedWires();
    routedWireGroup.visible = m.id === 'marker_wire';
    if (m.id === 'marker_pipe') buildPipes();
    pipeGroup.visible = m.id === 'marker_pipe';
    // Cross-floor authoring targets: CONDUIT (risers) + WIRE (cross-floor wires) only.
    hoverAdjacent = null;
    buildAdjacentTargets(m.id);
    adjacentGroup.visible = m.id === 'marker_conduit' || m.id === 'marker_wire' || m.id === 'marker_pipe';
  }

  // The stacked overview remains read-only for architecture and marker placement,
  // but the whole-house topology tools are deliberately available there: every
  // storey's existing devices/nodes can be joined without changing active floor.
  const ALL_FLOORS_TOPOLOGY = new Set(['marker_conduit', 'conduit_edit', 'marker_wire', 'marker_pipe']);
  const modeAvailable = (index) => {
    const id = modes[index].id;
    if (MODE_HIDDEN.has(id)) return false; // parked tools: never a cycle stop
    const group = MODE_GROUP[id];
    // TRANSLATE now lives in PROJECT but still rigidly edits the active floor, so it
    // stays out of the read-only ALL FLOORS overview alongside PLAN/MARKER.
    if (allFloorsView && (group === 'plan' || group === 'marker' || group === 'furnish' || id === 'translate')
        && !ALL_FLOORS_TOPOLOGY.has(id)) return false;
    return true;
  };
  function stepMode(direction) {
    let index = currentMode;
    do index = (index + direction + modes.length) % modes.length;
    while (!modeAvailable(index) && index !== currentMode);
    setMode(index);
  }

  // Re-render every localized on-screen string when the UI language changes. This
  // only fires from LANG mode (cycleLang / trigger), so the current label/help is
  // LANG's; any open pad/menu is redrawn too for good measure.
  onLangChange(() => {
    const m = modes[currentMode];
    setModeInfo();
    if (numpad.group.visible) {
      (m.id === 'level' ? redrawLevelPad : m.id === 'translate' ? redrawTranslatePad : redrawNumpad)();
    }
    if (slotMenu.group.visible) redrawSlotMenu();
    if (langMenu.group.visible) redrawLangMenu();
    if (unitMenu.group.visible) redrawUnitMenu(); // title follows the current language
    if (exportMenu.group.visible) redrawExportMenu();
    if (sheetPanel.group.visible) redrawSheet(); // legend/marker names are localized
  });

  // UNIT can be changed from either AR or the desktop selector. Refresh every
  // meter-derived string in the immersive view and keep the selection panel current.
  onUnitChange(() => {
    const m = modes[currentMode];
    setModeInfo();
    buildPlan();
    if (numpad.group.visible) {
      if (m.id === 'level') refreshLevelPad();
      else if (m.id === 'translate') redrawTranslatePad();
      else if (selectedMarker) refreshMarkerPad();
      else redrawNumpad();
    }
    if (unitMenu.group.visible) redrawUnitMenu();
    if (sheetPanel.group.visible) redrawSheet();
  });

  // Output preferences are device-local. Every change repaints the options panel
  // and the left-controller sheet immediately; the authored project is untouched.
  onOutputSettingsChange(() => {
    sheetDirty = true;
    scheduleShareUrlRefresh(); // marker-icons/furniture toggles change the view payload
    if (exportMenu.group.visible) redrawExportMenu();
    if (sheetPanel.group.visible) redrawSheet();
  });

  // Point the survey edit-state at the active floor: EDGE edits its last rect,
  // and grip-undo pops from its own rects. Keeps `surveyed` scoped to the active
  // floor so removeRectangle (which acts on the active floor) always resolves.
  function refreshFloorEditState() {
    surveyed.length = 0;
    for (const r of project.rectangles) surveyed.push(r.id); // active floor, creation order
    activeRect = project.rectangles[project.rectangles.length - 1] || null;
    selectedEdge = null;
    edgePickKey = null;
    selectedRect = null; // EDIT selection is per-floor; drop it on a floor switch
    roomComponentCacheKey = '';
    roomComponentCache = null;
    roomAreaHud = null;
    selectedMarker = null; // ...and any marker being height-edited
    selectedLinkSwitch = null; // LINK source selection is scoped to one floor
    resetDim();
    resetTranslate();
  }

  // Ensure the survey has the three storeys we author on-device: a Basement below
  // and an Upper above the existing Ground. Only seeds a fresh single-floor project
  // (a loaded/already-multi-floor project is left alone). Heights are the Floor
  // default; they're meant to be corrected by hand in LEVEL mode (Quest can't measure
  // the vertical offset between floors). All three share the same plan origin (0,0).
  function ensureFloors() {
    if (project.floors.length > 1) return;
    const groundId = project.groundFloorId;
    project.addFloor({ refId: groundId, above: false, name: 'Basement' }); // below ground
    project.addFloor({ refId: groundId, above: true, name: 'Upper' });     // above ground
    project.setActiveFloor(groundId); // start on the ground floor (the registration storey)
  }

  // Shared refresh after the active floor changes (cycle or thumbstick). Re-seats the
  // survey edit state + overlay at the new elevation, and — because refreshFloorEditState
  // hides the numpad via resetDim — re-shows the LEVEL height pad + label if that's the
  // current mode.
  function afterFloorChange() {
    refreshFloorEditState();
    buildPlan();
    if (!allFloorsView) buildFurniture(); // per-floor furniture; hide in ALL FLOORS
    else for (const child of [...furnitureGroup.children]) furnitureGroup.remove(child);
    applyPlanMatrix(); // real floor lifts; ALL FLOORS stays on the ground datum
    sheetDirty = true;
    if (exportMenu.group.visible) redrawExportMenu();
    if (modes[currentMode].id === 'level') {
      setModeInfo();
      if (allFloorsView) deactivateNumpad();
      else activateLevelPad();
    }
  }

  // Switch the active storey up (+1) / down (-1). One extra read-only pseudo-level
  // sits above the top floor and shows the whole stack. It never replaces
  // activeFloorId, so flicking down returns to the same top storey. No wrap.
  function switchFloor(delta) {
    const floors = project.floors;
    if (allFloorsView) {
      if (delta >= 0) return;
      allFloorsView = false;
      afterFloorChange();
      rlog('floor switch', { name: project.activeFloor.name, elev: +project.activeFloor.elevation.toFixed(3) });
      return;
    }
    const i = floors.findIndex((f) => f.id === project.activeFloorId);
    const j = i + delta;
    if (j === floors.length) {
      allFloorsView = true;
      afterFloorChange();
      rlog('floor switch', { name: 'all floors', count: floors.length });
      return;
    }
    if (j < 0 || j > floors.length) return;
    project.setActiveFloor(floors[j].id);
    afterFloorChange();
    rlog('floor switch', { name: project.activeFloor.name, elev: +project.activeFloor.elevation.toFixed(3) });
  }

  function placeAt(x, y, z) {
    navOffset.set(0, 0, 0); // a fresh registration/recalibration exits virtual locomotion
    anchorYaw = 0; // the newly requested anchor has identity orientation in this space
    planPos.set(x, y, z);
    planGroup.visible = true; // may have no zones yet — the origin gizmo is the placeholder
    originGizmo.visible = true;
    applyPlanMatrix(); // keeps the current yaw (from ALIGN)
    placed = true;
    reticle.visible = false;
    anchor = null; // drop the old anchor so the frame loop won't snap us back
    anchorPoseMissing = false;
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
    if (perfEnabled) perfStart();
    const session = renderer.xr.getSession();

    // Stash desktop state so we can restore it on exit.
    saved.background = scene.background;
    saved.gridVisible = view.grid?.visible;
    saved.floorVisible = view.floor?.visible;
    saved.controls = view.controls.enabled;
    saved.meshVisible = view.house?.visible;
    saved.markerLightsVisible = view.markerLights?.visible;
    saved.furnitureModelsVisible = view.furnitureModels?.visible;

    scene.background = null; // reveal passthrough
    if (view.grid) view.grid.visible = false;
    if (view.floor) view.floor.visible = false;
    if (view.house) view.house.visible = false; // hide the extruded walls
    if (view.markerLights) view.markerLights.visible = false;
    if (view.furnitureModels) view.furnitureModels.visible = false;
    view.hideMesh = true; // keep them hidden even as survey edits rebuild the mesh
    view.controls.enabled = false;

    ensureFloors(); // seed Basement + Upper around Ground on first AR entry
    allFloorsView = false; // every new session starts on the persisted active floor
    buildPlan();
    buildFurniture();     // async — furniture appears in furnitureGroup once decoded
    scene.add(planGroup);
    planGroup.visible = false;
    placed = false;
    anchor = null;
    anchorPoseMissing = false;
    planYaw = 0;
    anchorYaw = 0;
    floorY = 0;
    navOffset.set(0, 0, 0);
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
    startupPlacementPending = true;
    startupPoseFrames = 0;
    view.onXRFrame = onXRFrame;
  });

  renderer.xr.addEventListener('sessionend', () => {
    if (perfEnabled) perfStop();
    view.onXRFrame = null;
    exiting = false; exitHoldStart = 0; exitProgress = 0; // reset exit gesture
    fpsFrames = 0; fpsSince = -1; fpsPrevTime = -1; fpsWorstMs = 0; fpsText = '—'; timeText = '—'; // fresh fps probe per session
    Object.assign(view.xrTiming, { js: 0, gl: 0, frames: 0 });
    anchor = null;
    anchorPoseMissing = false;
    startupPlacementPending = false;
    startupPoseFrames = 0;
    reticle.visible = false;
    leftTeleportReticle.visible = false;
    sheetPanel.group.visible = false;
    exportMenu.group.visible = false;
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
    if (view.markerLights) view.markerLights.visible = saved.markerLightsVisible ?? true;
    if (view.furnitureModels) view.furnitureModels.visible = saved.furnitureModelsVisible ?? true;
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
    if (!isControllerSource(event.data)) return; // hand pinch/select never edits or teleports
    // LEFT trigger is permanently teleport, independent of RIGHT's current mode.
    if (event.data?.handedness === 'left') {
      teleportToReticle(event.data);
      return;
    }
    const pos = tipPosition(event.data);
    if (!pos) return;
    lastTouch.copy(pos); // for the debug HUD
    rlog('touch', {
      mode: modes[currentMode].id, placed,
      touchY: +pos.y.toFixed(3), floorY: +floorY.toFixed(3), planY: +planPos.y.toFixed(3),
    });
    // Run whatever the current mode does with the touched point.
    modes[currentMode].onTouch(pos, event.data);
    // Force matrixWorld so we log the ACTUAL rendered world position, not just planPos.
    planGroup.updateMatrixWorld(true);
    const wp = planGroup.getWorldPosition(new THREE.Vector3());
    rlog('after', {
      floorY: +floorY.toFixed(3), planY: +planPos.y.toFixed(3),
      worldY: +wp.y.toFixed(3), camY: +camWorldY().toFixed(3),
      visible: planGroup.visible, placed,
    });
  }

  // Grip PRESS: if the pointer is over a draggable target, start a grip-drag instead
  // of a cycle/reset — a domain-matched dim value panel or a selected outlet.
  function onSqueezeStart(event) {
    if (!isControllerSource(event?.data)) return;
    if (event?.data?.handedness === 'left') return; // companion grip has no editing role
    const id = modes[currentMode].id;
    if (isDimMode(id) && !dimRefA && hoverDim) { gripDrag = { kind: 'dim', cId: hoverDim.userData.cId }; rlog('grip-drag dim', { id: hoverDim.userData.cId }); return; }
    if (id === 'edge' && selectedEdge) {
      gripDrag = { kind: 'edge', rectId: selectedEdge.rectId, edge: selectedEdge.edge };
      rlog('grip-drag selected edge', selectedEdge);
      return;
    }
    if (id === 'marker' && selectedMarker && hoverMarker?.id === selectedMarker.id && setControllerRay(event.data)) {
      const sprite = markerGroup.children.find(
        (s) => s.userData.markerId === hoverMarker.id && s.userData.markerRole === 'wall',
      );
      if (!sprite) return;
      sprite.getWorldPosition(_dp);
      const distance = _dv.copy(_dp).sub(_ro).dot(_rd);
      if (distance <= 0) return;
      gripDrag = { kind: 'marker', markerId: hoverMarker.id, distance };
      rlog('grip-drag marker', { id: hoverMarker.id });
    }
    if (id === 'furnish' && hoverFurnitureId) {
      gripDrag = { kind: 'furniture', furnitureId: hoverFurnitureId };
      rlog('grip-drag furniture', { id: hoverFurnitureId });
      return;
    }
    if (id === 'conduit_edit' && selectedConduitNodeId
        && hoverConduitNode?.id === selectedConduitNodeId && !hoverConduitNode.markerId) {
      if (!conduitNodeWorldPos(hoverConduitNode.id, _dp)) return;
      // Same dual-move choice as WIRE EDIT: tip near the node → carry it in 3D;
      // far → the floor reticle drives X/Y and the pad drives z.
      const tip = tipPosition(event.data);
      const near = tip && tip.distanceTo(_dp) < WAYPOINT_GRAB_M;
      selectConduitNode(hoverConduitNode.id); // grabbing also selects (opens the height pad)
      gripDrag = { kind: 'conduitNode', nodeId: hoverConduitNode.id, mode: near ? 'direct' : 'remote' };
      rlog('grip-drag conduit node', { id: hoverConduitNode.id, mode: gripDrag.mode });
    }
  }

  // Grip RELEASE: end any grip-drag (persist via touch); if none, onReset already ran.
  function onSqueezeEnd(event) {
    if (!isControllerSource(event?.data)) return;
    if (event?.data?.handedness === 'left') return;
    if (gripDrag) {
      const rebuild = gripDrag.kind === 'edge' || gripDrag.kind === 'marker';
      project.touch(); rlog('grip-drag end', gripDrag);
      // Edge and marker drags use a lightweight live visual; rebuild once so all
      // dimensions, marker lock colors, and canonical geometry return on release.
      if (rebuild) { buildPlan(); applyPlanMatrix(); }
      // A conduit-node drag rewrote the network geometry: rebuild it once and, for a
      // direct 3D carry (which also changed z), refresh the height pad.
      if (gripDrag.kind === 'conduitNode') { buildConduits(); if (numpad.group.visible) refreshNodePad(); }
      if (gripDrag.kind === 'furniture') buildFurniture(); // reseat canonically after the live drag
    }
    gripDrag = null;
  }

  // B/Y delete: remove the mode's selected/hovered item (see pollModeCycle). Deletion
  // was moved off grip so grip means only grab-drag / cancel. Returns true if it removed
  // something.
  //  - PLAN EDIT: the selected zone.  - MARKER EDIT: the selected marker.
  //  - FURNISH: the selected furniture.  - CONDUIT EDIT: the hovered segment (keeps its
  //    nodes) else the selected node + its segments.  - WIRE: the selected wire.
  // MARKER · CONDUIT B/Y: undo the newest pen step — remove the segment it created,
  // then the node it created if nothing else now uses it, and move the pen back to
  // where that step started. Repeated presses walk back step by step. Steps whose
  // items were since removed elsewhere just no-op their missing parts.
  function undoConduitPenStep() {
    const step = conduitPenHistory.pop();
    if (!step) return false;
    const segmentId = step.segmentId
      && project.conduitSegments.some((s) => s.id === step.segmentId) ? step.segmentId : null;
    const nodeId = step.nodeId && project.conduitNodes.some((n) => n.id === step.nodeId)
      && !project.conduitSegments.some((s) => s.id !== segmentId && (s.a === step.nodeId || s.b === step.nodeId))
      ? step.nodeId : null;
    if (segmentId) project.removeConduitSegment(segmentId);
    if (nodeId) project.removeConduitNode(nodeId);
    else if (step.split && step.nodeId && project.conduitNodes.some((n) => n.id === step.nodeId)) {
      // A T-junction step: once the branch is gone, the junction carries exactly the
      // two halves of the original run → remove it and restore the single run.
      const incident = project.conduitSegments.filter((s) => s.a === step.nodeId || s.b === step.nodeId);
      const halves = incident.length === 2 && incident.every((s) =>
        [s.a, s.b].includes(step.split.a) || [s.a, s.b].includes(step.split.b));
      if (halves) {
        project.removeConduitNode(step.nodeId);
        project.addConduitSegment(step.split.a, step.split.b);
      }
    }
    penNodeId = step.prevPen && project.conduitNodes.some((n) => n.id === step.prevPen) ? step.prevPen : null;
    conduitPickAfterKey = null;
    buildConduits(); buildAdjacentTargets('marker_conduit');
    rlog('conduit pen undo', { segmentId, nodeId, pen: penNodeId });
    return true;
  }

  function deleteInMode() {
    const mode = modes[currentMode];
    if (mode.id === 'edit') {
      if (!selectedRect) return false;
      const id = selectedRect.id;
      project.removeRectangle(id);
      const si = surveyed.indexOf(id);
      if (si >= 0) surveyed.splice(si, 1);
      if (activeRect && activeRect.id === id) activeRect = project.rectangles[project.rectangles.length - 1] || null;
      selectedRect = null;
      updateRoomAreaHud();
      buildPlan(); applyPlanMatrix();
      rlog('edit delete', { id });
      return true;
    }
    if (mode.id === 'marker' && selectedMarker) { deleteSelectedMarker(); return true; }
    if (mode.id === 'furnish' && selectedFurnitureId) {
      const id = selectedFurnitureId;
      project.removeFurniture(id);
      selectedFurnitureId = null;
      buildFurniture();
      setModeInfo();
      rlog('furniture delete', { id });
      return true;
    }
    if (mode.id === 'marker_conduit') return undoConduitPenStep();
    if (mode.id === 'conduit_edit') {
      if (selectedConduitSegmentId) { // one leg of a branch, leaving its end nodes
        rlog('conduit segment delete', { id: selectedConduitSegmentId });
        project.removeConduitSegment(selectedConduitSegmentId);
        selectedConduitSegmentId = null;
        buildConduits();
        return true;
      }
      if (selectedConduitNodeId) {
        rlog('conduit node delete', { id: selectedConduitNodeId });
        project.removeConduitNode(selectedConduitNodeId);
        selectConduitNode(null);
        buildConduits();
        return true;
      }
      return false;
    }
    if (mode.id === 'marker_wire' && selectedRoutedWire) {
      rlog('wire delete', { id: selectedRoutedWire.id });
      project.removeWire(selectedRoutedWire.id);
      selectedRoutedWire = null;
      buildRoutedWires();
      return true;
    }
    if (mode.id === 'marker_pipe') {
      if (selectedPipe) {
        project.removePipe(selectedPipe.id);
        selectedPipe = null;
        buildPipes();
        return true;
      }
      const node = project.pipeNodes.find((n) => n.id === pipePenNodeId);
      if (node && !node.markerId) {
        project.removePipeNode(node.id);
        pipePenNodeId = null;
        buildPipes();
        return true;
      }
    }
    return false;
  }

  // Grip button: NON-destructive only — grab-drag a target (armed in onSqueezeStart), or
  // cancel/undo/back-out an in-progress gesture. Deletion lives on B/Y (deleteInMode).
  //  - MARKER LINK: clear the selected source switch without deleting links.
  //  - MARKER CONDUIT: over a target, cycle the node/marker stack; elsewhere lift the pen.
  //  - MARKER WIRE: pop the last via override (B/Y deletes the wire).
  //  - PLAN/MARKER/CONDUIT DIMS: undo the last dim pick, step by step; else cycle a stack.
  //  - EDGE: cancel a pending locked edge.
  //  - TRANSLATE / REGISTER / RECAL mid-gesture: back out the pending point/direction.
  function onReset(event) {
    if (!isControllerSource(event?.data)) return;
    if (event?.data?.handedness === 'left') return;
    if (gripDrag) return; // this grip was a drag, not an undo (cleared on squeezeend)
    const mode = modes[currentMode];
    if (mode.id === 'save' && overwriteSlot != null) {
      rlog('slot overwrite cancelled', { slot: overwriteSlot });
      overwriteSlot = null;
      hoverSlotAction = prevHoverSlotAction = null;
      slotFlash = null;
      redrawSlotMenu();
      return;
    }
    if (mode.id === 'paste_floor' && pasteConfirmFloorId != null) {
      rlog('floor paste cancelled', { target: pasteConfirmFloorId });
      pasteConfirmFloorId = null;
      setModeInfo();
      return;
    }
    if (isDimMode(mode.id)) { // undo the last dimension pick, step by step
      if (dimRefB || editingId) { dimRefB = null; editingId = null; dimBuffer = ''; bufferPristine = false; redrawNumpad(); rlog('dim B cancelled'); return; }
      // PLAN DIMS uses grip as an explicit target cycler in BOTH reference phases.
      // Only fall back to cancelling A when there is no overlap to advance through.
      if (mode.id === 'plan_dims' && cyclePlanDimPick()) return;
      if (dimRefA) { dimRefA = null; planDimPickKey = null; redrawNumpad(); rlog('dim A cancelled'); return; }
      // Nothing picked yet: grip cycles a vertical stack under the reticle so a stacked
      // node/marker can be singled out before its first-ref pick.
      if (cycleDimStackPick()) return;
      return;
    }
    if (mode.id === 'translate') {
      if (translateEdge) {
        translateEdge = null;
        translateBuffer = '';
        numpad.group.visible = false;
        numpadCursor.visible = false;
        rlog('translate edge cancelled');
        return;
      }
      if (translateTargets.y) { translateTargets.y = null; rlog('translate Y cancelled'); return; }
      if (translateTargets.x) { translateTargets.x = null; rlog('translate X cancelled'); return; }
      return;
    }
    if (mode.id === 'edit' && !selectedRect && hoverStack.length) {
      planEditPickAfterId = hoverStack[0].id;
      rlog('plan edit target cycle', { after: planEditPickAfterId });
      return;
    }
    if (mode.id === 'marker' && !selectedMarker && hoverMarker) {
      markerEditPickAfterId = hoverMarker.id;
      rlog('marker edit target cycle', { after: markerEditPickAfterId });
      return;
    }
    if (mode.id === 'marker_link') {
      if (hoverMarker) {
        markerLinkPickAfterId = hoverMarker.id;
        rlog('marker link target cycle', { after: markerLinkPickAfterId });
        return;
      }
      if (selectedLinkSwitch) rlog('link switch cleared', { id: selectedLinkSwitch.id });
      selectedLinkSwitch = null; markerLinkPickAfterId = null;
      return;
    }
    if (mode.id === 'marker_conduit') {
      // Over a target, grip advances the combined node/marker pick stack without
      // changing geometry. On empty space it retains its original pen-lift meaning.
      if (hoverMarker) {
        conduitPickAfterKey = `marker:${hoverMarker.id}`;
        rlog('conduit target cycle', { after: conduitPickAfterKey });
        return;
      }
      if (hoverConduitNode) {
        conduitPickAfterKey = `node:${hoverConduitNode.id}`;
        rlog('conduit target cycle', { after: conduitPickAfterKey });
        return;
      }
      if (penNodeId) { rlog('conduit pen lift', { node: penNodeId }); penNodeId = null; }
      return;
    }
    if (mode.id === 'conduit_edit') {
      if (selectedConduitNodeId || selectedConduitSegmentId) return;
      if (hoverConduitNode) {
        conduitEditPickAfterKey = `node:${hoverConduitNode.id}`;
        rlog('conduit edit target cycle', { after: conduitEditPickAfterKey });
      } else if (hoverConduitSegmentId) {
        conduitEditPickAfterKey = `segment:${hoverConduitSegmentId}`;
        rlog('conduit edit target cycle', { after: conduitEditPickAfterKey });
      }
      return;
    }
    if (mode.id === 'marker_wire') {
      // Grip pops the last via override (non-destructive undo); B/Y deletes the wire.
      if (selectedRoutedWire && (selectedRoutedWire.via || []).length) {
        project.popWireVia(selectedRoutedWire.id);
        buildRoutedWires();
        rlog('wire via pop', { id: selectedRoutedWire.id });
        return;
      }
      if (!selectedRoutedWire && hoverMarker) {
        wireEndpointPickAfterKey = `marker:${hoverMarker.id}`;
        rlog('wire endpoint cycle', {
          phase: wireFromMarker ? 'end' : 'start', after: wireEndpointPickAfterKey,
        });
        return;
      }
      if (!selectedRoutedWire && hoverAdjacent?.kind === 'marker') {
        wireEndpointPickAfterKey = `marker:${hoverAdjacent.id}`;
        rlog('wire endpoint cycle', {
          phase: wireFromMarker ? 'end' : 'start', after: wireEndpointPickAfterKey,
        });
        return;
      }
      if (!selectedRoutedWire && !wireFromMarker && hoverRoutedWire) {
        routedWirePickAfterId = hoverRoutedWire.id;
        rlog('routed wire target cycle', { after: routedWirePickAfterId });
        return;
      }
      if (wireFromMarker) {
        rlog('wire from cleared', { id: wireFromMarker.id });
        wireFromMarker = null;
        wireEndpointPickAfterKey = null;
      }
      return;
    }
    if (mode.id === 'marker_pipe') {
      if (pendingPipeMerge) {
        rlog('pipe merge cancelled', pendingPipeMerge);
        pendingPipeMerge = null;
        setModeInfo();
        return;
      }
      if (selectedPipe) { selectedPipe = null; return; }
      if (hoverMarker) {
        pipePickAfterKey = `marker:${hoverMarker.id}`;
        return;
      }
      if (hoverPipeNode) {
        pipePickAfterKey = `node:${hoverPipeNode.id}`;
        return;
      }
      if (pipePenNodeId) { pipePenNodeId = null; pipePickAfterKey = null; return; }
    }
    if (mode.id === 'edge') {
      if (selectedEdge) { // cancel a pending locked edge (no rect removal)
        selectedEdge = null;
        edgePickKey = null;
        rlog('edge lock cancelled');
        return;
      }
      // First stage: advance through every edge inside the reticle without moving it.
      // Trigger is the separate confirmation that locks the highlighted candidate.
      cycleEdgePick();
      return;
    }
    if (mode.id === 'register' && registerPts.length) { // back out the last REGISTER point
      registerPts.pop();
      const n = registerPts.length;
      applyModeVisual(n === 0 ? t('mode.register') : n === 1 ? t('lbl.wall2') : t('lbl.perp'), C_ORIGIN);
      rlog('register undo', { remaining: n });
      return;
    }
    if (mode.id === 'recal' && (recalPts.length || recalLocked)) { // back out RECAL step by step
      if (recalPts.length) {
        recalPts.pop(); // undo a wall touch; corner stays selected
        applyModeVisual(recalPts.length === 0 ? t('lbl.recalP1') : t('lbl.recalP2'), C_RECAL);
      } else {
        recalLocked = false; recalCorner = null; // deselect the corner
        applyModeVisual(t('mode.recal'), C_RECAL);
      }
      rlog('recal undo', { locked: recalLocked, pts: recalPts.length });
      return;
    }
    // No destructive fallback: rooms are removed only via EDIT; re-register via REGISTER.
  }

  // Edge-detection state for the mode-cycle / floor-switch inputs.
  const btn = { a: false, b: false, stick: false, stickY: false, leftStick: false };
  const PLAN_YAW_STEP = THREE.MathUtils.degToRad(20); // LEFT stick-x nudges plan yaw in 20° steps
  // In-world exit: DOM "EXIT AR" isn't visible in the headset, so hold the
  // thumbstick DOWN (buttons[3]) for EXIT_HOLD_MS to end the session. A hold
  // (not a tap) so it can't collide with stick flicks or be hit by accident.
  const EXIT_HOLD_MS = 1200;
  let exitHoldStart = 0; // performance-time when the hold began (0 = not held)
  let exitProgress = 0;  // 0..1, for the HUD countdown
  let lastHudAt = -Infinity; // ms of the last debug-HUD redraw (throttled; see onXRFrame)
  // Frame-rate probe for the debug HUD: frames counted and the longest frame gap seen
  // since the last HUD refresh, so a steady rate and a periodic hitch both show up.
  let fpsFrames = 0, fpsSince = -1, fpsPrevTime = -1, fpsWorstMs = 0, fpsText = '—';
  // Average CPU ms per frame in onXRFrame ("js") and in renderer.render ("render"),
  // from View3D.xrTiming. Both small while fps is low ⇒ the GPU is the bottleneck.
  let timeText = '—';

  // ---- ?perf diagnostic: what each overlay layer costs the GPU ------------------
  // Toggle it with PROJECT · PERF (trigger), or open the app with ?perf to start it
  // on, then hold a view. It survives mode switches, so any mode can be measured. The sweep cycles
  // through PERF_LAYERS, hiding one layer per PERF_WINDOW_MS, and the debug HUD lists
  // each layer's cost = (time with everything) − (time without that layer). Time is
  // GPU ms per frame from EXT_disjoint_timer_query_webgl2 when available, else the
  // frame interval. Layers are hidden only between scene.onBeforeRender and
  // onAfterRender, and restored right after, so no editing state is touched.
  let perfEnabled = new URLSearchParams(location.search).has('perf');
  const PERF_WINDOW_MS = 1500, PERF_SETTLE_MS = 300;
  const PERF_LAYERS = [
    ['all', () => []],
    ['fill', () => planGroup.children.filter((o) => o.material === fillMat)],
    ['zones', () => planGroup.children.filter((o) => [...zoneFillMatCache.values()].includes(o.material))],
    ['edges', () => planGroup.children.filter((o) => o.material === lockedMat || [...edgeMatCache.values()].includes(o.material))],
    ['dimln', () => planGroup.children.filter((o) => o.material === dimMat || o.material === markerDimMat || o.material === dimConflictMat)],
    ['labels', () => planGroup.children.filter((o) => o.userData.dimLabelBatch)],
    ['marker', () => [markerGroup]],
    ['zdims', () => [zDimGroup]],
    ['links', () => [electricalGroup, routedWireGroup]],
    ['condt', () => [conduitGroup, adjacentGroup, pipeGroup]],
    ['furn', () => [furnitureGroup]],
    ['plan', () => [planGroup]], // the whole plan; what remains is HUD + controllers
  ];
  const perf = { phase: 0, phaseStart: -1, samples: new Map(), result: new Map(), hidden: [],
    ext: null, gl: null, active: false, pending: [], source: 'frame' };
  function perfRecord(name, ms) {
    const s = perf.samples.get(name) ?? perf.samples.set(name, { sum: 0, n: 0 }).get(name);
    s.sum += ms; s.n++;
  }
  // Per XR frame: advance the sweep, file this frame's interval, collect timer results.
  function perfFrame(time, dt) {
    if (perf.phaseStart < 0) perf.phaseStart = time;
    if (time - perf.phaseStart >= PERF_WINDOW_MS) {
      const name = PERF_LAYERS[perf.phase][0];
      const s = perf.samples.get(name);
      if (s?.n) perf.result.set(name, s.sum / s.n);
      perf.samples.delete(name);
      perf.phase = (perf.phase + 1) % PERF_LAYERS.length;
      perf.phaseStart = time;
    }
    const settled = time - perf.phaseStart >= PERF_SETTLE_MS;
    perf.current = settled ? PERF_LAYERS[perf.phase][0] : null;
    if (!perf.ext && perf.current && dt > 0) perfRecord(perf.current, dt);
    const gl = perf.gl;
    while (perf.ext && perf.pending.length) {
      const { query, name } = perf.pending[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT);
      if (!gl.getParameter(perf.ext.GPU_DISJOINT_EXT) && name) perfRecord(name, ns / 1e6);
      gl.deleteQuery(query);
      perf.pending.shift();
    }
  }
  function perfBeforeRender() {
    if (!renderer.xr.isPresenting) return;
    // Hide for the whole window (settling included); only recording waits to settle.
    perf.hidden = PERF_LAYERS[perf.phase][1]().filter((o) => o.visible);
    for (const o of perf.hidden) o.visible = false;
    if (perf.ext && perf.pending.length < 8) {
      const query = perf.gl.createQuery();
      perf.gl.beginQuery(perf.ext.TIME_ELAPSED_EXT, query);
      perf.active = { query, name: perf.current }; // null while settling → not recorded
    }
  }
  function perfAfterRender() {
    for (const o of perf.hidden) o.visible = true;
    perf.hidden = [];
    if (perf.active) {
      perf.gl.endQuery(perf.ext.TIME_ELAPSED_EXT);
      perf.pending.push(perf.active);
      perf.active = false;
    }
  }
  function perfStart() {
    perf.gl = renderer.getContext();
    perf.ext = perf.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    perf.source = perf.ext ? 'gpu' : 'frame';
    Object.assign(perf, { phase: 0, phaseStart: -1, pending: [], active: false });
    perf.samples.clear(); perf.result.clear();
    scene.onBeforeRender = perfBeforeRender;
    scene.onAfterRender = perfAfterRender;
  }
  function perfStop() {
    if (!perf.gl) return;
    scene.onBeforeRender = () => {};
    scene.onAfterRender = () => {};
    for (const { query } of perf.pending) perf.gl.deleteQuery(query);
    perf.pending = [];
    perf.gl = null;
  }
  function togglePerf() {
    perfEnabled = !perfEnabled;
    if (perfEnabled) perfStart(); else perfStop();
    lastHudAt = -Infinity; // show the change on the next frame
  }
  // HUD lines: the running measurement, then each layer's cost vs 'all', two per line.
  function perfHudLines() {
    const all = perf.result.get('all');
    const cells = PERF_LAYERS.slice(1).map(([name]) => {
      const t = perf.result.get(name);
      return `${name.padEnd(6)} ${all != null && t != null ? (all - t).toFixed(1).padStart(5) : '    ?'}`;
    });
    const out = [`${perf.source}:  all ${all != null ? all.toFixed(1) : '?'} ms [${PERF_LAYERS[perf.phase][0]}]`];
    for (let i = 0; i < cells.length; i += 2) out.push(cells.slice(i, i + 2).join('  '));
    return out;
  }
  let exitWasActive = false; // EXIT bar shown last frame -> force one redraw when it clears
  let exiting = false;   // guard so session.end() fires once

  // Fixed controller roles — never reassigned by recent activity. RIGHT owns the
  // editing modes/HUD; optional LEFT owns only its live sheet and teleport trigger.
  // An unhanded source is accepted as the editor only when no right/left-labelled
  // editor exists, preserving support for runtimes that omit handedness metadata.
  // A physical motion controller has a gamepad and no XRHand. Test both so a
  // runtime exposing synthesized hand buttons cannot accidentally promote a hand
  // pinch to the fixed RIGHT editor or LEFT companion role.
  function isControllerSource(source) {
    return !!source?.gamepad && !source?.hand;
  }
  function sourceForHand(frame, handedness) {
    const list = [...frame.session.inputSources];
    return list.find((s) => s.handedness === handedness && isControllerSource(s)) ?? null;
  }
  const leftSource = (frame) => sourceForHand(frame, 'left');
  function editorSource(frame) {
    const right = sourceForHand(frame, 'right');
    if (right) return right;
    return [...frame.session.inputSources].find((s) =>
      s.handedness !== 'left' && isControllerSource(s)) ?? null;
  }
  const controllerForSource = (source) => controllers.find((c) => c.userData.inputSource === source) ?? null;

  function pollModeCycle(frame, time) {
    // xr-standard mapping: buttons[3]=thumbstick press (hold to EXIT),
    // buttons[4]=A/X (flip: DIMS completed pair / TRANSLATE pending coord; else inert),
    // buttons[5]=B/Y (delete the selected/hovered item; never cycles modes),
    // axes[2]=thumbstick x (cycle mode, both ways), axes[3]=thumbstick y (cycle the current
    // thing: LEVEL floor / UNIT display unit / LANG language / MARKER type / EDIT zone type).
    // Only the fixed RIGHT editor role is read; LEFT never changes modes.
    let aBtn = false, bBtn = false, stickX = 0, stickY = 0, stickDown = false;
    const gp = editorSource(frame)?.gamepad;
    if (gp) {
      aBtn = !!gp.buttons[4]?.pressed;      // A/X (lower face) -> flip (DIMS / TRANSLATE)
      bBtn = !!gp.buttons[5]?.pressed;      // B/Y (upper face) -> delete
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
    // Neither face button cycles modes — mode nav is thumbstick-x (both ways). A/X = FLIP:
    // a completed DIMS dimension, or the pending TRANSLATE coordinate across the origin
    // (inert otherwise). B/Y = DELETE the mode's selected/hovered item where applicable
    // (grip no longer deletes; TRANSLATE has nothing to delete). Contextual "cycle the
    // current thing" lives on thumbstick-y.
    if (aBtn && !btn.a) {
      if (isDimMode(modes[currentMode].id) && dimRefA && dimRefB) swapDim();
      else if (modes[currentMode].id === 'translate' && translateEdge) pressTranslateKey('swap');
      // PLAN EDIT: A/X rotates the selected aperture (door: hinge×swing, window: hinge).
      else if (modes[currentMode].id === 'edit' && selectedRect?.rotateAperture(1)) {
        project.touch(); buildPlan(); applyPlanMatrix();
      }
    }
    if (bBtn && !btn.b) {
      if (isDimMode(modes[currentMode].id)) deleteDimContext();
      else deleteInMode();
    }
    btn.a = aBtn;
    btn.b = bBtn;
    // Thumbstick flick, dead-zoned, one step per flick. The dominant axis wins so
    // a diagonal doesn't cycle a mode AND change floor at once.
    if (!btn.stick && Math.abs(stickX) > 0.7 && Math.abs(stickX) >= Math.abs(stickY)) {
      stepMode(stickX > 0 ? 1 : -1);
      btn.stick = true;
    } else if (Math.abs(stickX) < 0.3) {
      btn.stick = false;
    }
    // Stick up/down is the universal "cycle the current thing" control: LEVEL = floor,
    // UNIT = display/input unit, LANG = language, EXPORT = SVG/PNG/DXF/JSON format,
    // MARKER = retype the selected marker (or the drop type if none
    // selected), PLAN·ADD = zone kind to add, PLAN·EDIT = selected zone kind.
    // Inert in every other mode.
    if (!btn.stickY && Math.abs(stickY) > 0.7 && Math.abs(stickY) > Math.abs(stickX)) {
      const modeId = modes[currentMode].id;
      if (modeId === 'lang') cycleLang(stickY < 0 ? -1 : 1); // up = previous in the list
      else if (modeId === 'unit') cycleUnit(stickY < 0 ? -1 : 1); // up = previous in the list
      else if (modeId === 'level') switchFloor(stickY < 0 ? 1 : -1);
      else if (modeId === 'marker') cycleMarkerType(stickY < 0 ? 1 : -1); // retype selected / drop type
      else if (modeId === 'marker_wire') cycleWireType(stickY < 0 ? 1 : -1); // retype selected / new-wire type
      else if (modeId === 'marker_pipe') cyclePipeService(stickY < 0 ? 1 : -1);
      else if (modeId === 'furnish') cycleFurnish(stickY < 0 ? 1 : -1); // rotate selected / cycle drop article
      else if (modeId === 'drop') cycleZoneKind(stickY < 0 ? 1 : -1); // pick zone type
      else if (modeId === 'edit') cycleSelectedZoneKind(stickY < 0 ? 1 : -1);
      else if (modeId === 'export') { // point at Compare/Language → cycle that; else format
        if (hoverExportAction === 'baseline') cycleExportBaseline(stickY < 0 ? -1 : 1);
        else if (hoverExportAction === 'lang') cycleExportLang(stickY < 0 ? -1 : 1);
        else cycleOutputFormat(stickY < 0 ? -1 : 1);
      }
      btn.stickY = true;
    } else if (Math.abs(stickY) < 0.3) {
      btn.stickY = false;
    }
    // LEFT companion stick-x rotates the PLACED plan about the HEADSET position in
    // 20° steps (one per flick), so the point under you stays put and the room swings
    // around you — you can align the virtual plan to the room without re-registering.
    // planYaw is session anchoring (not model geometry), so this stays a view/companion
    // action, never an editor edit. Pivoting off-origin translates navOffset so the
    // headset's world XZ is invariant: newPos = P + R_y(d)·(oldPos − P). Do NOT
    // put this translation in planPos: the spatial-anchor pass restores planPos to
    // the registered origin later in every frame and would discard it, leaving only
    // the yaw and making the plan visibly rotate about that origin.
    const lgp = leftSource(frame)?.gamepad;
    const lx = lgp?.axes[2] ?? 0;
    if (placed && !btn.leftStick && Math.abs(lx) > 0.7) {
      const d = (lx > 0 ? 1 : -1) * PLAN_YAW_STEP;
      // XRFrame's viewer pose is authoritative here. The renderer's ArrayCamera
      // matrix can describe the fixed reference-space origin on Quest, which made
      // this apparently pivot around registration (especially after TELEPORT).
      const viewer = localSpace ? frame.getViewerPose(localSpace) : null;
      const fallback = renderer.xr.getCamera().matrixWorld.elements;
      const px = viewer?.transform.position.x ?? fallback[12];
      const pz = viewer?.transform.position.z ?? fallback[14];
      // Rotate the plan group's current world XZ about the headset pivot by d
      // (R_y: x' = x·cos + z·sin, z' = −x·sin + z·cos), then store the resulting
      // group translation in anchor-local navOffset.
      const { x: gx, z: gz } = planGroupWorldXZ();
      const vx = gx - px, vz = gz - pz;
      const c = Math.cos(d), s = Math.sin(d);
      const nextX = px + (vx * c + vz * s);
      const nextZ = pz + (-vx * s + vz * c);
      setNavOffsetForWorldXZ(nextX, nextZ);
      planYaw += d;
      applyPlanMatrix();
      rlog('plan yaw about viewer', {
        deg: +THREE.MathUtils.radToDeg(planYaw).toFixed(0),
        px: +px.toFixed(3), pz: +pz.toFixed(3),
        navX: +navOffset.x.toFixed(3), navZ: +navOffset.z.toFixed(3),
      });
      btn.leftStick = true;
    } else if (Math.abs(lx) < 0.3) {
      btn.leftStick = false;
    }
  }

  const f2 = (n) => (Number.isFinite(n) ? n.toFixed(3) : '—');
  // Length (meters) of an edge ref {rectId, edge}, or null if it can't be resolved.
  const edgeLen = (ref) => {
    if (!ref) return null;
    const r = project.rectangles.find((x) => x.id === ref.rectId);
    if (!r) return null;
    const [[ax, ay], [bx, by]] = edgeEndpoints(r, ref.edge);
    return Math.hypot(bx - ax, by - ay);
  };
  // Headset battery for the HUD. getBattery() resolves once to a live BatteryManager
  // whose .level/.charging update in place, so we just read it per-frame. Not all
  // browsers expose it — stays null (and off the HUD) when unavailable.
  let battery = null;
  if (navigator.getBattery) navigator.getBattery().then((b) => { battery = b; }).catch(() => {});
  // Active floor as "Name i/N" for the HUD.
  const floorLabel = () => {
    if (allFloorsView) return t('mode.all_floors');
    const fl = project.floors;
    const i = fl.findIndex((f) => f.id === project.activeFloorId);
    return `${project.activeFloor?.name ?? '-'} ${i + 1}/${fl.length}`;
  };
  const _wp = new THREE.Vector3();
  // XR camera world height (matrixWorld, not .position which stays local/0).
  const camWorldY = () => renderer.xr.getCamera().matrixWorld.elements[13];

  function onXRFrame(time, frame) {
    currentFrame = frame;
    if (perfEnabled) perfFrame(time, fpsPrevTime >= 0 ? time - fpsPrevTime : 0);
    if (fpsPrevTime >= 0) fpsWorstMs = Math.max(fpsWorstMs, time - fpsPrevTime);
    if (fpsSince < 0) fpsSince = time;
    fpsPrevTime = time;
    fpsFrames++;
    // Give tracking a few frames to settle, then expose the plan immediately with a
    // provisional placement: active-floor origin directly below the initial headset,
    // 1.50 m down, with plan +Y aligned to the viewer's horizontal forward direction.
    // FLOOR/ORIGIN/RECAL remain authoritative and replace this estimate normally.
    if (startupPlacementPending && localSpace) {
      const viewer = frame.getViewerPose(localSpace);
      if (viewer) {
        startupPoseFrames++;
        if (startupPoseFrames >= 3) {
          const p = viewer.transform.position;
          const q = viewer.transform.orientation;
          _camQ.set(q.x, q.y, q.z, q.w);
          _fwd.set(0, 0, -1).applyQuaternion(_camQ);
          _fwd.y = 0;
          if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
          else _fwd.normalize();
          planYaw = Math.atan2(-_fwd.x, -_fwd.z); // local plan +Y (world -Z at yaw 0) faces forward
          floorY = p.y - STARTUP_EYE_HEIGHT - activeElevation();
          placeAt(p.x, floorY, p.z);
          startupPlacementPending = false;
          rlog('startup provisional placement', {
            x: +p.x.toFixed(3), floorY: +floorY.toFixed(3), z: +p.z.toFixed(3),
            eyeHeight: STARTUP_EYE_HEIGHT,
            yaw: +planYaw.toFixed(3), activeElevation: +activeElevation().toFixed(3),
          });
        }
      }
    }
    pollModeCycle(frame, time);
    const editCtl = editorSource(frame);
    frameEditCtl = editCtl;
    // No physical controller in the editor role → the headset is in hand tracking
    // (controllers set down). Prompt to pick one up rather than going blank; the
    // rest of the HUD (keyed on editCtl) stays hidden this frame.
    if (!editCtl) {
      handPrompt.setText(t('controllers.pickUp'), t('controllers.handMode'), 0xfbbf24);
      placePanel(handPrompt.sprite, 1.0, 0.05);
    }
    handPrompt.sprite.visible = !editCtl;
    const companionCtl = leftSource(frame);
    const companionController = controllerForSource(companionCtl);
    // Fixed roles replace last-active hiding. RIGHT exposes the editor HUD; LEFT,
    // when present, exposes its controller-mounted sheet and teleport target only.
    controllers.forEach((c, i) => {
      const editor = c.userData.inputSource === editCtl;
      const companion = c.userData.inputSource === companionCtl;
      c.visible = editor || companion;
      if (editor) controllerTips[i].material.color.setHex(modeColor(modes[currentMode]));
      else if (companion) controllerTips[i].material.color.setHex(C_TELEPORT);
      labels[i].sprite.visible = editor;
      helps[i].sprite.visible = editor;
      debugs[i].sprite.visible = editor;
    });
    // xr-standard button 1 is squeeze/grip. The sheet is a hold-to-view companion:
    // hidden at rest, visible only for as long as the LEFT grip remains pressed.
    const companionGripPressed = !!companionCtl?.gamepad?.buttons[1]?.pressed;
    updateLeftSheet(time, companionController, companionGripPressed);
    const companionHit = placed && companionCtl ? rayFloorHit(companionCtl) : null;
    if (companionHit) {
      leftTeleportReticle.position.set(companionHit.x, overlayY() + 0.003, companionHit.z);
      leftTeleportReticle.visible = true;
    } else {
      leftTeleportReticle.visible = false;
    }
    // Echo the pointed-at constraint's value on the RIGHT editor. PLAN · ADD,
    // PLAN · EDIT, and MARKER · EDIT instead own this pill for their current TYPE; their
    // mode breadcrumbs remain fixed while thumbstick-y changes this separate label.
    const hovSprite = pickDimLabel(editCtl);
    const hovDim = hovSprite?.userData.dimText ?? null;
    const dropKind = modes[currentMode].id === 'drop' ? currentZoneKind : null;
    const editKind = modes[currentMode].id === 'edit' && selectedRect ? zoneKindOf(selectedRect) : null;
    const markerType = modes[currentMode].id === 'marker' ? (selectedMarker?.type || currentMarkerType) : null;
    const linkStatus = modes[currentMode].id === 'marker_link'
      ? t(selectedLinkSwitch ? 'link.pickLight' : 'link.pickSwitch') : null;
    const wireStatus = modes[currentMode].id === 'marker_wire'
      ? `${t(`wire.type.${selectedRoutedWire?.type || currentWireType}`)} · ${selectedRoutedWire
        ? `${t('wire.override')} ${(selectedRoutedWire.via || []).length}`
        : wireFromMarker ? t('wire.pickEnd') : t('wire.pickStart')}`
      : modes[currentMode].id === 'marker_conduit'
      ? (penNodeId ? t('conduit.run') : t('conduit.pickStart'))
      : modes[currentMode].id === 'conduit_edit'
      ? (selectedConduitSegmentId ? t('conduit.editSeg')
        : selectedConduitNodeId ? t('conduit.editNode') : t('conduit.pickTarget'))
      : null;
    const pipeStatus = modes[currentMode].id === 'marker_pipe'
      ? pendingPipeMerge
        ? `${t(`pipe.service.${project.pipeServiceAtNode(pendingPipeMerge.targetNodeId)}`)} → ${t(`pipe.service.${pendingPipeMerge.service}`)} · ${t('pipe.confirmMerge')}`
        : `${t(`pipe.service.${selectedPipe?.service || currentPipeService}`)} · ${pipePenNodeId ? t('conduit.run') : t('pipe.pickStart')}`
      : null;
    const translateStatus = modes[currentMode].id === 'translate' && !translateEdge
      ? t(translateTargets.x ? 'translate.pickY' : translateTargets.y ? 'translate.pickX' : 'translate.pickAny')
      : null;
    const exportStatus = modes[currentMode].id === 'export'
      ? `${t('export.format')} · ${getOutputSettings().format === 'coohom' ? 'COOHOM DXF'
        : getOutputSettings().format === 'link' ? 'LINK · 3D VIEW'
        : getOutputSettings().format === 'qr' ? 'QR · 3D VIEW' : getOutputSettings().format.toUpperCase()}` : null;
    const furnishStatus = modes[currentMode].id === 'furnish'
      ? (selectedFurnitureId ? t('furnish.selected')
        : currentFurnitureArticle ? furnitureLabel(currentFurnitureArticle) : t('furnish.none'))
      : null;
    const typeName = dropKind ? t(`mode.${dropKind}`) : editKind ? t(`mode.${editKind}`) : markerType ? t(`marker.${markerType}`) : null;
    const readoutText = typeName ? `${t('zone.type')} · ${typeName}` : furnishStatus || translateStatus || linkStatus || wireStatus || pipeStatus || exportStatus || hovDim;
    const readoutColor = dropKind ? zoneColor(dropKind) : editKind ? zoneColor(editKind) : markerType ? C_MARKER
      : furnishStatus ? 0xa78bfa
      : pipeStatus ? pipeColor(selectedPipe || { service: currentPipeService })
      : wireStatus ? (modes[currentMode].id === 'marker_conduit' || modes[currentMode].id === 'conduit_edit'
        ? CONDUIT_COLOR : wireTypeColor(selectedRoutedWire || { type: currentWireType }))
      : exportStatus ? C_EXPORT : 0x38bdf8;
    controllers.forEach((c, i) => {
      const on = c.userData.inputSource === editCtl && !!readoutText;
      readouts[i].sprite.visible = on;
      if (on) readouts[i].setText(readoutText, readoutColor);
    });
    // Minimal HUD: build stamp + the controller pointer and the reticle's floor
    // point, BOTH in plan coordinates (relative to the registered origin, yaw-
    // corrected) so they read the same as the model — not the session-start frame.
    // Before REGISTER the plan sits at the session origin, so it degrades gracefully.
    // ptr's 3rd value is height above the registered floor. reticle.position is this
    // frame's value from the previous mode pass — one frame of lag is imperceptible.
    // Throttle the debug HUD to ~2 Hz: its coordinate readouts change every frame, so
    // redrawing the two 512x352 canvases + re-uploading their textures each frame is
    // pure waste for numbers no one reads that fast. The EXIT hold bar bypasses the
    // throttle so its countdown stays smooth. The worldToPlan calls that only feed the
    // HUD are inside the gate too, so they're skipped between refreshes.
    if (exitProgress > 0 || exitWasActive || time - lastHudAt >= 500) {
      lastHudAt = time;
      exitWasActive = exitProgress > 0;
      if (time - fpsSince >= 500) {
        fpsText = `${Math.round((fpsFrames * 1000) / (time - fpsSince))}  (worst ${Math.round(fpsWorstMs)} ms)`;
        fpsFrames = 0; fpsSince = time; fpsWorstMs = 0;
        const t = view.xrTiming;
        if (t.frames) timeText = `js ${(t.js / t.frames).toFixed(1)}  render ${(t.gl / t.frames).toFixed(1)} ms`;
        t.js = 0; t.gl = 0; t.frames = 0;
      }
      const ptrW = tipPosition(editCtl);
      const ptr = ptrW ? worldToPlan(ptrW) : null;
      const ret = reticle.visible ? worldToPlan(reticle.position) : null;
      // Length of the currently highlighted edge (locked wins over hovered). In EDGE
      // that's selectedEdge/hoverEdge; in either DIMS mode it's the edge under the ray
      // (hoverRef). All hold last frame's value here — recomputed just below — the
      // same imperceptible lag the ret/ptr lines already accept.
      const modeId = modes[currentMode].id;
      const dimHoverEdge = isDimMode(modeId) && hoverRef?.kind === 'edge' ? hoverRef : null;
      const edgeRef = selectedEdge || hoverEdge || dimHoverEdge;
      const edgeM = edgeLen(edgeRef);
      const lines = [
        `build:  ${BUILD_ID}`,
        `update: ${getVersionStatus().state === 'available' ? `NEW ${getVersionStatus().latest?.build || ''}`
          : getVersionStatus().state === 'current' ? 'current'
          : getVersionStatus().state}`,
        // The EXIT bar takes the fps line's slot while held, so the HUD never outgrows its canvas.
        exitProgress > 0 ? `EXIT:   hold ${'█'.repeat(Math.round(exitProgress * 10)).padEnd(10, '·')}` : `fps:    ${fpsText}`,
        // Last frame's renderer totals (autoReset: one render per XR frame), to tell a
        // draw-call-bound slowdown from a triangle-bound one.
        `draw:   ${renderer.info.render.calls} calls, ${(renderer.info.render.triangles / 1000).toFixed(1)}k tris`,
        `time:   ${timeText}`,
        `ptr:    ${ptr ? `${f2(ptr.px)}, ${f2(ptr.py)}, ${f2(ptrW.y - planPos.y)}` : '—'}`,
        `ret:    ${ret ? `${f2(ret.px)}, ${f2(ret.py)}` : '—'}`,
        ...(modeId === 'level' ? [`floor:  ${floorLabel()}`] : []),
        ...(modeId === 'edit' && roomAreaHud != null ? [`area:   ${roomAreaHud.toFixed(2)} m²`] : []),
        ...(edgeM != null ? [`edge:   ${fmt(edgeM)} ${unitLabel()}`] : []),
        ...(battery ? [`batt:   ${Math.round(battery.level * 100)}%${battery.charging ? ' (chg)' : ''}`] : []),
      ];
      // ?perf: keep build/fps/draw and give the rest of the panel to the layer sweep.
      if (perfEnabled) {
        lines.splice(1, 1); // drop update:
        lines.splice(3);    // keep build, fps, draw
        lines.push(...perfHudLines());
      }
      for (const d of debugs) d.setLines(lines);
    }
    // Floor preview + edge highlight, depending on the current mode.
    hoverEdge = null;
    cornerHi.visible = false;
    rectHi.visible = false;
    zebra.visible = false;
    recalBadge1.sprite.visible = recalBadge2.sprite.visible = recalStep.sprite.visible = false;
    hoverStack = [];
    hoverMarker = null;
    for (const visual of markerGroup.children) {
      if (visual.userData.markerRole?.endsWith('-outline')) visual.visible = false; // batches have no role
    }
    const modeId = modes[currentMode].id;
    // electricalGroup carries the LINK switch→light control routes only; the routed
    // WIRE lane draws from routedWireGroup, so it never touches electricalGroup.
    electricalGroup.visible = modeId === 'marker_link';
    if (modeId === 'teleport') {
      // Dedicated locomotion target. Trigger brings the pointed plan coordinate
      // beneath the headset; no geometry or survey-registration state is edited.
      const hit = placed ? rayFloorHit(editCtl) : null;
      if (hit) {
        reticle.visible = true;
        reticle.position.set(hit.x, hit.y + 0.002, hit.z);
      } else {
        reticle.visible = false;
      }
      edgeHi.visible = false;
    } else if (modeId === 'translate') {
      // Pick one edge per axis. Each selected edge opens the numpad for its desired
      // signed coordinate; after both entries the model applies one rigid delta.
      reticle.visible = false;
      hoverEdge = null;
      hoverKey = null;
      numpadCursor.visible = false;
      edgeHi.visible = false;
      edgeHi2.visible = false;
      if (translateEdge) {
        const panelHit = rayPanelHit(editCtl);
        if (numpad.group.visible && panelHit) {
          hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
          numpadCursor.position.copy(panelHit.point);
          numpadCursor.visible = true;
        }
        if (hoverKey !== prevHoverKey) { redrawTranslatePad(); prevHoverKey = hoverKey; }
      } else {
        const hit = rayFloorHit(editCtl);
        if (hit) {
          reticle.visible = true;
          reticle.position.set(hit.x, hit.y + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          const candidate = edgeAtPoint(px, py);
          if (candidate && !translateTargets[isXEdge(candidate.edge) ? 'x' : 'y']) hoverEdge = candidate;
        }
      }
      let slot = 0;
      const showTranslateEdge = (ref, color) => {
        if (!ref || slot > 1) return;
        const rect = rectOf(ref);
        if (rect) showEdge(rect, ref.edge, color, slot++ === 0 ? edgeHi : edgeHi2);
      };
      showTranslateEdge(translateTargets.x?.ref, 0xfbbf24);
      showTranslateEdge(translateTargets.y?.ref, 0xfbbf24);
      showTranslateEdge(translateEdge || hoverEdge, translateEdge ? 0xfbbf24 : 0xffe14d);
    } else if (modeId === 'edge') {
      // EDGE mode is two-stage. Before trigger lock, grip cycles the stable geometry-
      // ordered set inside the reticle. After lock, the controller tip supplies the
      // real-wall coordinate on the second trigger.
      const hit = rayFloorHit(editCtl);
      if (hit) {
        const { px, py } = worldToPlan(hit);
        hoverFloorPt = { px, py };
        hoverEdge = selectedEdge ? null : retainedEdgeAtPoint(px, py, edgePickKey);
        if (!hoverEdge && !selectedEdge) edgePickKey = null;
        reticle.visible = true;
        reticle.position.set(hit.x, hit.y + 0.002, hit.z);
        if (gripDrag?.kind === 'edge') applyGripDrag(px, py);
      } else {
        hoverEdge = null;
        hoverFloorPt = null;
        if (!selectedEdge) edgePickKey = null;
        reticle.visible = false;
      }
      // Once an edge is locked, retitle/recolor the mode to YELLOW "SNAP TO WALL" so
      // it's clear the next touch snaps the locked edge to the real wall (only on change,
      // since applyModeVisual rebuilds the label texture).
      if (!!selectedEdge !== edgeSnapPrompt) {
        edgeSnapPrompt = !!selectedEdge;
        if (edgeSnapPrompt) applyModeVisual(t('lbl.snap'), 0xffe14d);
        else applyModeVisual(t('mode.edge'), 0xff5db1);
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
      // FLOOR and REGISTER are tip-touch modes. RECAL starts with a pointer-driven
      // corner pick; after the corner locks, its three real-wall points are tip touches.
      const source = editCtl;
      const tipPos = tipPosition(source);
      let recalAim = null;
      if (modeId === 'recal' && !recalLocked) {
        const hit = rayFloorHit(source);
        if (hit) {
          reticle.visible = true;
          reticle.position.set(hit.x, hit.y + 0.002, hit.z);
          recalAim = worldToPlan(hit);
        } else {
          reticle.visible = false;
        }
      } else if (tipPos) {
        reticle.visible = true;
        reticle.position.set(tipPos.x, floorY + 0.002, tipPos.z);
      } else {
        reticle.visible = false;
      }
      edgeHi.visible = false;
      // RECAL: highlight the corner and badge its two walls 1 & 2. Until you SELECT
      // (first trigger), the nearest corner previews under the pointer and the wall
      // order tracks which wall the reticle hugs — so aim at the wall you want as "1". Once
      // selected, the order is locked and the reticle echoes the current wall-touch step.
      if (modeId === 'recal') {
        let c = recalCorner; // the locked corner (a=wall 1, b=wall 2)
        if (!recalLocked) {  // preview: nearest corner, walls ordered live by the reticle
          if (recalAim) { const { px, py } = recalAim; const near = nearestPlanCorner(px, py); c = near ? orderWallsByReticle(near, px, py) : null; }
          else c = null;
        }
        if (c) {
          planToWorld(c.cx, c.cy, _cw);
          cornerHi.position.set(_cw.x, overlayY() + 0.008, _cw.z);
          cornerHi.material.color.setHex(C_RECAL);
          cornerHi.visible = true;
          placeWallBadge(recalBadge1, c.cx, c.cy, c.a);
          placeWallBadge(recalBadge2, c.cx, c.cy, c.b);
          // Standard edge strip marks the pointer-selected wall (wall 1 during selection +
          // wall-1 capture; wall 2 for P3), in the RECAL accent (C_RECAL) so the highlight
          // reads as part of the recal action. NOT C_WALL1/C_WALL2: those are CSS strings for
          // the canvas badges, and setHex() on a string yields NaN → the strip renders black.
          // The 1/2 badges carry wall identity.
          const activeWall = recalLocked && recalPts.length === 2 ? c.b : c.a;
          showPlanEdge(c.cx, c.cy, activeWall.x, activeWall.y, C_RECAL);
        }
        // Reticle badge names each physical sample: 1 farther on wall 1, 2 inward
        // toward the corner, then 3 on wall 2. Wall identity uses W1/W2 badges.
        if (recalLocked && reticle.visible && c) {
          const step = recalPts.length + 1;
          if (step !== prevRecalStep) { recalStep.setText(String(step), step === 3 ? C_WALL2 : C_WALL1); prevRecalStep = step; }
          recalStep.sprite.position.set(reticle.position.x, reticle.position.y + 0.05, reticle.position.z);
          recalStep.sprite.visible = true;
        }
      }
    } else if (isDimMode(modeId)) {
      // The two DIMS modes share mechanics but not targets. PLAN DIMS exposes only
      // plan edges/origin and existing plan constraints. OUTLET DIMS exposes only
      // an outlet floor icon for the first pick and a plan edge for the second.
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
        const panelHit = rayPanelHit(editCtl);
        if (numpad.group.visible && panelHit) {
          hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
          numpadCursor.position.copy(panelHit.point);
          numpadCursor.visible = true;
        }
      } else {
        // Reference-pick phase. Plan value panels are selectable only in PLAN DIMS.
        // OUTLET DIMS requires the projected outlet icon first, making it impossible
        // for an accidental edge-to-edge pick to alter a room dimension.
        const source = editCtl;
        const hit = rayFloorHit(source);
        if (hit) {
          reticle.visible = true; // reticle always tracks the floor point
          reticle.position.set(hit.x, hit.y + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          hoverFloorPt = { px, py }; // remember where the tip stands (for a new dim's default placement)
          if (gripDrag) applyGripDrag(px, py); // grip-drag the grabbed dim panel to the reticle
          // A value label takes priority before the first reference, but only when
          // its constraint belongs to the active dimension domain.
          hoverDim = dimRefA ? null : dimLabelAtPoint(px, py, modeDomain(modeId));
          if (!hoverDim) {
            if (modeId === 'plan_dims') {
              // Retain the grip-selected candidate while it remains in the reticle.
              // Candidate order is geometry-fixed, never pointer-distance-ranked, so
              // hand shake cannot reorder coincident/shared edges between presses.
              hoverRef = planDimRefAtPoint(px, py);
              if (!hoverRef) planDimPickKey = null;
            } else if (!dimRefA) {
              // First pick is the domain's dependent target: an outlet, or a bare junction.
              // Honor grip-cycled stack selection: default to the top of the vertical
              // stack under the reticle, but if grip picked a lower member, target that.
              // Reset the pick once the reticle moves off that stack.
              const stack = dimStackAt(px, py);
              if (dimStackPick && !stack.some((s) => s.id === dimStackPick)) dimStackPick = null;
              const picked = stack.find((s) => s.id === dimStackPick) || stack[0];
              if (picked) {
                hoverRef = modeId === 'conduit_dims'
                  ? { kind: 'node', nodeId: picked.id }
                  : { kind: 'marker', markerId: picked.id };
              }
            } else {
              const e = edgeAtPoint(px, py);
              if (e) hoverRef = { kind: 'edge', rectId: e.rectId, edge: e.edge };
            }
          }
        }
      }
      // CONDUIT DIMS: highlight referenced nodes as well as edges. In particular, a
      // hovered value panel previews BOTH endpoints in cyan; previously its edge lit
      // up but its node was omitted from the node-state loop.
      if (modeId === 'conduit_dims') {
        const selectedNodeIds = new Set([dimRefA, dimRefB]
          .filter((r) => r?.kind === 'node').map((r) => r.nodeId));
        const hoverNodeIds = new Set([hoverRef]
          .filter((r) => r?.kind === 'node').map((r) => r.nodeId));
        const panelNodeIds = new Set((hoverDim
          ? [hoverDim.userData.refA, hoverDim.userData.refB] : [])
          .filter((r) => r?.kind === 'node').map((r) => r.nodeId));
        restyleConduitNodes((id) => [
          panelNodeIds.has(id) ? 0x22d3ee
            : selectedNodeIds.has(id) ? 0xfbbf24
            : hoverNodeIds.has(id) ? 0xffe14d : CONDUIT_NODE_COLOR,
          panelNodeIds.has(id) || selectedNodeIds.has(id) || hoverNodeIds.has(id) ? 1.5 : 1,
        ]);
      }
      // Highlights: ref A (amber), then ref B if set (amber) else the hover (yellow).
      // When hovering a dim panel, preview BOTH its references (cyan) so you see how it's defined.
      let ei = 0;
      const slots = [edgeHi, edgeHi2];
      const showRef = (ref, color) => {
        if (!ref) return;
        if (ref.kind === 'origin') originRingMat.color.setHex(color);
        else if (ref.kind === 'marker') {
          const marker = markerOf(ref);
          // The floor projection is DIMS' hit target, but it may overlap another
          // outlet at the same X/Y. Emphasize the linked wall-height glyph too so
          // the user can see exactly which vertical outlet this reference means.
          outlineMarker(marker, 'floor', color);
          outlineMarker(marker, 'wall', color);
        }
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
    } else if (modeId === 'level') {
      // LEVEL: the numpad is always shown (height entry); ray it for the key under the
      // beam. No floor target — B/Y cycles the floor, the pad sets its height.
      reticle.visible = false;
      edgeHi.visible = false;
      hoverKey = null;
      numpadCursor.visible = false;
      const panelHit = rayPanelHit(editCtl);
      if (numpad.group.visible && panelHit) {
        hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
        numpadCursor.position.copy(panelHit.point);
        numpadCursor.visible = true;
      }
      if (hoverKey !== prevHoverKey) { redrawLevelPad(); prevHoverKey = hoverKey; }
    } else if (modeId === 'edit') {
      // PLAN: ray the floor and edit only the zone overlap stack. Marker glyphs are
      // intentionally inert in this domain; OUTLET owns all marker interactions.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      // With an aperture's band pad open, the ray drives the numpad (like MARKER);
      // otherwise it rays the floor to hover/cycle the zone stack.
      const padOpen = selectedRect && numpad.group.visible;
      if (padOpen) {
        const panelHit = rayPanelHit(source);
        if (panelHit) {
          hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
          numpadCursor.position.copy(panelHit.point);
          numpadCursor.visible = true;
        }
      }
      if (hoverKey) {
        reticle.visible = false; // the pad owns the ray this frame
      } else {
        const hit = rayFloorHit(source);
        if (hit) {
          const { px, py } = worldToPlan(hit);
          hoverStack = rectsAtPoint(px, py);
          if (!selectedRect && hoverStack.length) {
            const current = hoverStack.findIndex((rect) => rect.id === planEditPickAfterId);
            if (current >= 0) hoverStack = [
              ...hoverStack.slice(current + 1), ...hoverStack.slice(0, current + 1),
            ];
            else planEditPickAfterId = null;
          }
          reticle.visible = true;
          reticle.position.set(hit.x, hit.y + 0.002, hit.z);
        } else {
          reticle.visible = false;
          hoverStack = [];
        }
      }
      if (selectedRect && !project.rectangles.includes(selectedRect)) selectedRect = null;
      // No band-carrying selection ⇒ the band pad has no subject: tear it down (covers
      // B/Y delete, which clears selectedRect but can't reach the pad itself).
      if (numpad.group.visible && !rectHasBand(selectedRect)) deactivateNumpad();
      if (padOpen && hoverKey !== prevHoverKey) { redrawBandPad(); prevHoverKey = hoverKey; }
      updateRoomAreaHud();
      if (selectedRect) {
        showRectOutline(selectedRect, lightenHex(zoneColorHex(zoneKind(selectedRect))));
        showZebra(selectedRect);
      } else if (hoverStack.length) {
        showRectOutline(hoverStack[0], 0xffe14d); // preview the topmost, not yet selected
      }
    } else if (modeId === 'marker_link') {
      // LINK uses the same stable floor-icon targeting as marker editing. A switch
      // is the persistent source; each light trigger toggles one logical control.
      hoverKey = null;
      numpadCursor.visible = false;
      const hit = rayFloorHit(editCtl);
      hoverMarker = null;
      if (hit) {
        reticle.visible = true;
        reticle.position.set(hit.x, hit.y + 0.002, hit.z);
        const { px, py } = worldToPlan(hit);
        hoverMarker = linkMarkerAtFloorPoint(px, py, markerLinkPickAfterId);
        if (!hoverMarker) markerLinkPickAfterId = null;
      } else {
        reticle.visible = false;
      }
      if (selectedLinkSwitch && (!project.markers.includes(selectedLinkSwitch) || selectedLinkSwitch.type !== 'switch')) {
        selectedLinkSwitch = null;
      }
      const linkedLightIds = new Set((project.electricalLinks || [])
        .filter((link) => link.fromMarkerId === selectedLinkSwitch?.id)
        .map((link) => link.toMarkerId));
      for (const lightId of linkedLightIds) {
        const light = project.markers.find((m) => m.id === lightId);
        outlineMarker(light, 'floor', 0x22d3ee);
        outlineMarker(light, 'wall', 0x22d3ee);
      }
      // All routes remain visible in cyan; the selected switch's routes brighten
      // amber so the one-to-many control set is immediately readable.
      for (const line of electricalGroup.children) {
        if (line.userData.kind !== 'control') continue;
        line.material.color.setHex(line.userData.fromMarkerId === selectedLinkSwitch?.id ? 0xfbbf24 : 0x38bdf8);
      }
      outlineMarker(hoverMarker, 'floor', 0xffe14d);
      outlineMarker(hoverMarker, 'wall', 0xffe14d);
      outlineMarker(selectedLinkSwitch, 'floor', 0xfbbf24);
      outlineMarker(selectedLinkSwitch, 'wall', 0xfbbf24);
    } else if (modeId === 'marker_wire') {
      // Routed WIRE: aim the floor reticle. Picking two markers defines a wire whose
      // path is derived (shortest route through the conduits). While a wire is
      // selected, conduit nodes become `via` override targets and the network shows so
      // they can be picked; otherwise markers (and existing wires) are the hover targets.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      // wireFromMarker may live on an adjacent floor (cross-floor wire) → resolve house-wide.
      if (wireFromMarker && !project.findMarker(wireFromMarker.id)) wireFromMarker = null;
      if (selectedRoutedWire && !project.wires.includes(selectedRoutedWire)) selectedRoutedWire = null;
      hoverMarker = null; hoverConduitNode = null; hoverRoutedWire = null; hoverAdjacent = null;
      const hit = rayFloorHit(source);
      if (hit) {
        reticle.visible = true;
        reticle.position.set(hit.x, hit.y + 0.002, hit.z);
        const { px, py } = worldToPlan(hit);
        if (selectedRoutedWire) { // override mode: conduit nodes are the primary target
          hoverConduitNode = conduitNodeAtFloorPoint(px, py);
          if (!hoverConduitNode) hoverMarker = markerAtFloorPoint(px, py, pickFloor()?.markers || []);
        } else {
          const endpoint = wireMarkerAtFloorPoint(px, py, wireEndpointPickAfterKey);
          if (endpoint && (allFloorsView || endpoint.floorId === project.activeFloorId)) hoverMarker = endpoint.marker;
          else if (endpoint) hoverAdjacent = {
            kind: 'marker', id: endpoint.marker.id, floorId: endpoint.floorId,
          };
          if (!endpoint) {
            wireEndpointPickAfterKey = null;
          }
        }
        if (!selectedRoutedWire && !wireFromMarker
            && !hoverMarker && !hoverConduitNode && !hoverAdjacent) {
          hoverRoutedWire = routedWireAtFloorPoint(px, py, routedWirePickAfterId);
          if (!hoverRoutedWire) routedWirePickAfterId = null;
        }
      } else {
        reticle.visible = false;
      }
      const selectedCircuit = wireComponent(selectedRoutedWire);
      highlightAdjacentTargets(selectedCircuit);
      // Show conduit nodes as white context; hovered target yellow, existing vias cyan.
      restyleConduitNodes((id) => {
        const viaOn = selectedRoutedWire && (selectedRoutedWire.via || []).includes(id);
        return [id === hoverConduitNode?.id ? 0xffe14d : viaOn ? 0x22d3ee : CONDUIT_NODE_COLOR,
          id === hoverConduitNode?.id ? 1.5 : 1];
      });
      // Keep the individual wire legible inside its circuit: selected/hovered is
      // yellow, other connected wires green, unrelated wires dim in type color.
      // Connected (green) first, then the selected/hovered wire (yellow) on top.
      const emphasis = [];
      if (selectedRoutedWire) {
        for (const id of selectedCircuit.wireIds) if (id !== selectedRoutedWire.id) emphasis.push([id, CIRCUIT_CONNECTED_COLOR]);
        emphasis.push([selectedRoutedWire.id, 0xffe14d]);
      } else if (hoverRoutedWire) {
        emphasis.push([hoverRoutedWire.id, 0xffe14d]);
      }
      styleRoutedWires(emphasis);
      // Live preview for a pending pair: from the first endpoint to the hovered marker
      // (or the tip). No preview once a wire is selected (it draws its derived route).
      if (!routedWirePreviewLine) {
        routedWirePreviewLine = makeRouteLine([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], 0xf59e0b);
        routedWirePreviewLine.frustumCulled = false; // vertices rewritten every frame
        routedWirePreviewLine.renderOrder = 15;
        routedWireGroup.add(routedWirePreviewLine);
      }
      routedWirePreviewLine.material.color.setHex(wireTypeColor({ type: currentWireType }));
      if (wireFromMarker) {
        const fromFound = project.findMarker(wireFromMarker.id);
        const a = {
          x: wireFromMarker.x, y: wireFromMarker.y,
          z: (fromFound?.floor?.elevation || 0) - displayElevation() + (wireFromMarker.z || 0),
        };
        let b = null;
        if (hoverMarker && hoverMarker.id !== wireFromMarker.id) {
          const found = project.findMarker(hoverMarker.id);
          b = {
            x: hoverMarker.x, y: hoverMarker.y,
            z: (found?.floor?.elevation || 0) - displayElevation() + (hoverMarker.z || 0),
          };
        }
        else if (hoverAdjacent?.kind === 'marker' && hoverAdjacent.id !== wireFromMarker.id) {
          const found = project.findMarker(hoverAdjacent.id);
          if (found) b = {
            x: found.marker.x, y: found.marker.y,
            z: (found.floor.elevation || 0) - displayElevation() + (found.marker.z || 0),
          };
        }
        else { const tipW = tipPosition(source); if (tipW) { const { px, py } = worldToPlan(tipW); b = { x: px, y: py, z: Math.max(0, tipW.y - overlayY()) }; } }
        routedWirePreviewLine.visible = !!b;
        if (b) {
          routedWirePreviewLine.geometry.setFromPoints([a, b].map((p) => new THREE.Vector3(p.x, p.z, -p.y)));
          routedWirePreviewLine.computeLineDistances();
        }
      } else {
        routedWirePreviewLine.visible = false;
      }
      outlineMarker(hoverMarker, 'floor', 0xffe14d);
      outlineMarker(hoverMarker, 'wall', 0xffe14d);
      outlineMarker(wireFromMarker, 'floor', wireTypeColor({ type: currentWireType }));
      outlineMarker(wireFromMarker, 'wall', wireTypeColor({ type: currentWireType }));
      if (selectedRoutedWire) {
        for (const markerId of selectedCircuit.markerIds) {
          const endpoint = project.findMarker(markerId)?.marker;
          outlineMarker(endpoint, 'floor', CIRCUIT_CONNECTED_COLOR);
          outlineMarker(endpoint, 'wall', CIRCUIT_CONNECTED_COLOR);
        }
        for (const markerId of [selectedRoutedWire.fromMarkerId, selectedRoutedWire.toMarkerId]) {
          const endpoint = project.findMarker(markerId)?.marker;
          outlineMarker(endpoint, 'floor', 0xffe14d);
          outlineMarker(endpoint, 'wall', 0xffe14d);
        }
      }
    } else if (modeId === 'marker_pipe') {
      hoverKey = null;
      numpadCursor.visible = false;
      hoverMarker = null; hoverAdjacent = null; hoverPipe = null; hoverPipeNode = null;
      if (selectedPipe && !project.pipes.includes(selectedPipe)) selectedPipe = null;
      if (pipePenNodeId && !project.pipeNodes.some((n) => n.id === pipePenNodeId)) pipePenNodeId = null;
      const hit = rayFloorHit(editCtl);
      if (hit) {
        reticle.visible = true;
        reticle.position.set(hit.x, hit.y + 0.002, hit.z);
        const { px, py } = worldToPlan(hit);
        const target = pipeTargetAtFloorPoint(px, py, pipePickAfterKey);
        if (target?.kind === 'marker') hoverMarker = target.item;
        else if (target?.kind === 'node') hoverPipeNode = target.item;
        else pipePickAfterKey = null;
        if (!target && !pipePenNodeId && !selectedPipe) hoverPipe = pipeAtFloorPoint(px, py);
      } else reticle.visible = false;
      highlightAdjacentTargets();
      const warningComponent = pendingPipeMerge
        ? project.pipeComponent(pendingPipeMerge.targetNodeId) : null;
      for (const ribbon of pipeGroup.children) {
        if (ribbon === pipePreviewLine) continue;
        if (ribbon.userData.pipeNodeId) {
          const hot = ribbon.userData.pipeNodeId === (hoverPipeNode?.id || pipePenNodeId);
          const warning = warningComponent?.nodeIds.has(ribbon.userData.pipeNodeId);
          ribbon.material.color.setHex(warning ? 0xff1744 : hot ? 0xffe14d : 0xffffff);
          ribbon.scale.setScalar(warning || hot ? 1.5 : 1);
          continue;
        }
        const warning = warningComponent?.pipes.some((pipe) => pipe.id === ribbon.userData.pipeId);
        const active = ribbon.userData.pipeId === (selectedPipe?.id || hoverPipe?.id);
        ribbon.material.color.setHex(warning ? 0xff1744 : active ? 0xffe14d : ribbon.userData.baseColor);
        ribbon.material.opacity = warning || active ? 1 : 0.62;
        ribbon.renderOrder = warning || active ? 17 : 14;
      }
      outlineMarker(hoverMarker, 'floor', 0xffe14d);
      outlineMarker(hoverMarker, 'wall', 0xffe14d);
      const penNode = project.pipeNodes.find((n) => n.id === pipePenNodeId);
      const penMarker = penNode?.markerId ? project.findMarker(penNode.markerId)?.marker : null;
      outlineMarker(penMarker, 'floor', pipeColor({ service: currentPipeService }));
      outlineMarker(penMarker, 'wall', pipeColor({ service: currentPipeService }));
      if (selectedPipe) {
        for (const markerId of [selectedPipe.a, selectedPipe.b]
          .map((id) => project.pipeNodes.find((n) => n.id === id)?.markerId).filter(Boolean)) {
          const marker = project.findMarker(markerId)?.marker;
          outlineMarker(marker, 'floor', 0xffe14d);
          outlineMarker(marker, 'wall', 0xffe14d);
        }
      }
      if (!pipePreviewLine) {
        pipePreviewLine = makeRouteLine([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], pipeColor({ service: currentPipeService }));
        pipePreviewLine.frustumCulled = false;
        pipePreviewLine.renderOrder = 16;
        pipeGroup.add(pipePreviewLine);
      }
      const tipW = tipPosition(editCtl);
      if (penNode && tipW) {
        const from = planLocalZ(pipeNodePos(penNode));
        const { px, py } = worldToPlan(tipW);
        const to = { x: px, y: py, z: Math.max(0, tipW.y - overlayY()) };
        pipePreviewLine.material.color.setHex(pipeColor({ service: currentPipeService }));
        pipePreviewLine.visible = true;
        pipePreviewLine.geometry.setFromPoints([from, to].map((p) => new THREE.Vector3(p.x, p.z, -p.y)));
        pipePreviewLine.computeLineDistances();
      } else {
        pipePreviewLine.visible = false;
      }
    } else if (modeId === 'marker_conduit') {
      // CONDUIT authoring: aim the floor reticle. Nodes and markers share one nearest-
      // first pick stack; grip advances through overlaps and trigger commits. The pen node is amber,
      // the next target yellow; a live preview runs from the pen node to the tip.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      if (penNodeId && !project.conduitNodes.some((n) => n.id === penNodeId)) penNodeId = null;
      hoverConduitNode = null; hoverMarker = null; hoverAdjacent = null; hoverPenSplit = null;
      const hit = rayFloorHit(source);
      if (hit) {
        reticle.visible = true;
        reticle.position.set(hit.x, hit.y + 0.002, hit.z);
        const { px, py } = worldToPlan(hit);
        const target = conduitTargetAtFloorPoint(px, py, conduitPickAfterKey);
        if (target?.kind === 'node') hoverConduitNode = target.item;
        else if (target?.kind === 'marker') hoverMarker = target.item;
        else if (target?.kind === 'segment') hoverPenSplit = target.item;
        else conduitPickAfterKey = null; // leaving the stack restarts it at nearest
        // Fall back to an adjacent-floor node/device → the next pen segment is a riser.
        if (!hoverConduitNode && !hoverMarker && !hoverPenSplit) hoverAdjacent = adjacentTargetAtFloorPoint(px, py);
      } else {
        reticle.visible = false;
      }
      highlightAdjacentTargets();
      // Recolor node spheres: pen amber, hovered yellow, otherwise white.
      restyleConduitNodes((id) => [
        id === penNodeId ? 0xfbbf24 : id === hoverConduitNode?.id ? 0xffe14d : CONDUIT_NODE_COLOR,
        id === penNodeId || id === hoverConduitNode?.id ? 1.5 : 1,
      ]);
      // The run a trigger would split into a T-junction previews yellow.
      restyleConduitSegments((segId) => segId === hoverPenSplit?.segmentId ? 0xffe14d : CONDUIT_COLOR);
      outlineMarker(hoverMarker, 'floor', 0xffe14d);
      outlineMarker(hoverMarker, 'wall', 0xffe14d);
      // Pen preview: pen node → current tip (or → the T-junction point on a hovered run).
      if (!conduitPreviewLine) {
        conduitPreviewLine = makeRouteLine([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], CONDUIT_COLOR);
        conduitPreviewLine.frustumCulled = false;
        conduitPreviewLine.renderOrder = 15;
        conduitGroup.add(conduitPreviewLine);
      }
      const penNode = penNodeId && project.conduitNodes.find((n) => n.id === penNodeId);
      const tipW = tipPosition(source);
      if (penNode && tipW) {
        const from = planLocalZ(conduitNodePos(project, penNode)); // world Z → active-plan-local
        const { px, py } = worldToPlan(tipW);
        const to = hoverPenSplit
          ? planLocalZ({ x: hoverPenSplit.x, y: hoverPenSplit.y, z: hoverPenSplit.worldZ })
          : { x: px, y: py, z: Math.max(0, tipW.y - overlayY()) };
        conduitPreviewLine.visible = true;
        conduitPreviewLine.geometry.setFromPoints([from, to].map((p) => new THREE.Vector3(p.x, p.z, -p.y)));
        conduitPreviewLine.computeLineDistances();
      } else {
        conduitPreviewLine.visible = false;
      }
    } else if (modeId === 'conduit_edit') {
      // CONDUIT EDIT is two-stage: grip cycles the combined node/segment stack while
      // nothing is selected; trigger selects the yellow candidate. Only afterward can
      // a selected node be grip-dragged or either selected object be deleted with B/Y.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      if (selectedConduitNodeId && !project.conduitNodes.some((n) => n.id === selectedConduitNodeId)) {
        selectConduitNode(null);
      }
      if (selectedConduitSegmentId && !project.conduitSegments.some((s) => s.id === selectedConduitSegmentId)) {
        selectedConduitSegmentId = null;
      }
      if (selectedConduitNodeObj() && numpad.group.visible) {
        const panelHit = rayPanelHit(source);
        if (panelHit) {
          hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
          numpadCursor.position.copy(panelHit.point);
          numpadCursor.visible = true;
        }
      }
      if (gripDrag?.kind === 'conduitNode') applyConduitNodeGripDrag(source);
      hoverConduitNode = null; hoverConduitSegmentId = null;
      if (hoverKey) {
        reticle.visible = false; // the pad owns the ray this frame
      } else {
        const hit = rayFloorHit(source);
        if (hit) {
          reticle.visible = true;
          reticle.position.set(hit.x, hit.y + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          if (!selectedConduitNodeId && !selectedConduitSegmentId) {
            const target = conduitEditTargetAtFloorPoint(
              px, py, conduitEditHoverKey, conduitEditPickAfterKey,
            );
            conduitEditPickAfterKey = null; // consume the explicit grip-cycle request
            conduitEditHoverKey = target?.key || null;
            if (target?.kind === 'node') {
              hoverConduitNode = project.conduitNodes.find((n) => n.id === target.id) || null;
            } else if (target?.kind === 'segment') {
              hoverConduitSegmentId = target.id;
            } else {
              conduitEditHoverKey = null;
            }
          } else if (selectedConduitNodeId) {
            const node = conduitNodeAtFloorPoint(px, py);
            if (node?.id === selectedConduitNodeId) hoverConduitNode = node;
          }
        } else {
          reticle.visible = false;
          if (!selectedConduitNodeId && !selectedConduitSegmentId) conduitEditHoverKey = null;
        }
      }
      if (selectedConduitNodeObj() && hoverKey !== prevHoverKey) { redrawNodePad(); prevHoverKey = hoverKey; }
      // Recolor node sphere + floor dot: selected amber, candidate yellow, else white.
      restyleConduitNodes((id) => [
        id === selectedConduitNodeId ? 0xfbbf24 : id === hoverConduitNode?.id ? 0xffe14d : CONDUIT_NODE_COLOR,
        id === selectedConduitNodeId || id === hoverConduitNode?.id ? 1.5 : 1,
      ]);
      // Selected segment amber; current pre-selection candidate yellow.
      restyleConduitSegments((segId) => segId === selectedConduitSegmentId ? 0xfbbf24
        : segId === hoverConduitSegmentId ? 0xffe14d : CONDUIT_COLOR);
    } else if (modeId === 'marker') {
      // MARKER: aim a FLOOR reticle; the marker under it — picked via its flat floor icon
      // (markerAtFloorPoint), a stable plan-space target vs. the floating wall billboard —
      // is the hover target. Trigger selects it for height entry; grip-drag grabs the
      // HOVERED marker (no prior select) and moves it in 3D, with pinned axes locked.
      // Empty-space trigger still drops a new marker at the TIP (z capture) via onTouch.
      // While the height pad is open, the ray drives the numpad instead.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      if (selectedMarker && numpad.group.visible) {
        const panelHit = rayPanelHit(source);
        if (panelHit) {
          hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
          numpadCursor.position.copy(panelHit.point);
          numpadCursor.visible = true;
        }
      }
      if (gripDrag?.kind === 'marker') applyMarkerGripDrag(source);
      hoverMarker = null;
      if (hoverKey) {
        reticle.visible = false; // the pad owns the ray
      } else {
        const hit = rayFloorHit(source);
        if (hit) {
          reticle.visible = true;
          reticle.position.set(hit.x, hit.y + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          if (selectedMarker) {
            const picked = markerAtFloorPoint(px, py);
            hoverMarker = picked?.id === selectedMarker.id ? picked : null;
          } else {
            hoverMarker = editMarkerAtFloorPoint(px, py, markerEditPickAfterId);
            if (!hoverMarker) markerEditPickAfterId = null;
          }
        } else {
          reticle.visible = false;
        }
      }
      if (selectedMarker && !project.markers.includes(selectedMarker)) {
        selectedMarker = null;
        deactivateNumpad();
      }
      // Outline BOTH the floor icon and the wall glyph so the icon↔fixture link reads
      // clearly. Hover = yellow; selected = amber, drawn last so it wins when they coincide.
      outlineMarker(hoverMarker, 'floor', 0xffe14d);
      outlineMarker(hoverMarker, 'wall', 0xffe14d);
      outlineMarker(selectedMarker, 'floor', 0xfbbf24);
      outlineMarker(selectedMarker, 'wall', 0xfbbf24);
      if (selectedMarker && hoverKey !== prevHoverKey) { redrawMarkerPad(); prevHoverKey = hoverKey; }
    } else if (modeId === 'furnish') {
      // FURNISH: aim a floor reticle; the placed item under it is the hover target
      // (select / grip-drag / grip-away delete). Empty-floor trigger drops the current
      // article. A live grip drag is applied here so the model follows the reticle.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      if (gripDrag?.kind === 'furniture') applyFurnitureGripDrag(source);
      // With the foot pad open, the ray drives the numpad (like MARKER); otherwise it
      // rays the floor to hover/select/drop.
      const padOpen = selectedFurnitureId && numpad.group.visible;
      if (padOpen) {
        const panelHit = rayPanelHit(source);
        if (panelHit) {
          hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
          numpadCursor.position.copy(panelHit.point);
          numpadCursor.visible = true;
        }
      }
      hoverFurnitureId = null;
      if (hoverKey) {
        reticle.visible = false; // the pad owns the ray this frame
      } else {
        const hit = rayFloorHit(source);
        if (hit) {
          reticle.visible = true;
          reticle.position.set(hit.x, hit.y + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          hoverFurnitureId = furnitureAtFloorPoint(px, py)?.id || null;
        } else {
          reticle.visible = false;
        }
      }
      if (selectedFurnitureId && !project.furniture.some((f) => f.id === selectedFurnitureId)) selectedFurnitureId = null;
      // No live selection ⇒ the foot pad has no subject: tear it down (covers B/Y delete).
      if (numpad.group.visible && !selectedFurnitureId) deactivateNumpad();
      if (padOpen && hoverKey !== prevHoverKey) { redrawFurniturePad(); prevHoverKey = hoverKey; }
      paintFurnitureHighlight();
    } else if (modeId === 'save' || modeId === 'load') {
      // SAVE/LOAD: aim at a slot, or at the separate confirm/cancel buttons once
      // an occupied SAVE slot has armed the overwrite screen.
      reticle.visible = false;
      edgeHi.visible = false;
      hoverSlot = null;
      hoverSlotAction = null;
      numpadCursor.visible = false;
      const panelHit = rayPanelHit(editCtl, slotMenu.mesh);
      if (slotMenu.group.visible && panelHit) {
        if (overwriteSlot != null) hoverSlotAction = slotMenu.actionAt(panelHit.uv.x, panelHit.uv.y);
        else hoverSlot = slotMenu.slotAt(panelHit.uv.x, panelHit.uv.y);
        numpadCursor.position.copy(panelHit.point);
        numpadCursor.visible = true;
      }
      if (overwriteSlot != null && hoverSlotAction !== prevHoverSlotAction) {
        redrawSlotMenu();
        prevHoverSlotAction = hoverSlotAction;
      } else if (overwriteSlot == null && hoverSlot !== prevHoverSlot) {
        if (hoverSlot !== null) slotFlash = null;
        redrawSlotMenu();
        prevHoverSlot = hoverSlot;
      }
    } else if (modeId === 'export') {
      // EXPORT: the right-controller ray owns four checkboxes and the explicit
      // action button. Thumbstick-y changes format without changing floors.
      reticle.visible = false;
      edgeHi.visible = false;
      hoverExportAction = null;
      numpadCursor.visible = false;
      const panelHit = rayPanelHit(editCtl, exportMenu.mesh);
      if (exportMenu.group.visible && panelHit) {
        hoverExportAction = exportMenu.actionAt(panelHit.uv.x, panelHit.uv.y);
        numpadCursor.position.copy(panelHit.point);
        numpadCursor.visible = true;
      }
      if (hoverExportAction !== prevHoverExportAction) {
        redrawExportMenu();
        prevHoverExportAction = hoverExportAction;
      }
    } else if (modeId === 'lang') {
      // LANG: thumbstick up/down is the primary selector, but also let the ray hover a
      // language row so a trigger can pick it directly (see the lang mode onTouch).
      reticle.visible = false;
      edgeHi.visible = false;
      hoverLang = null;
      numpadCursor.visible = false;
      const panelHit = rayPanelHit(editCtl, langMenu.mesh);
      if (langMenu.group.visible && panelHit) {
        hoverLang = langMenu.langAt(panelHit.uv.x, panelHit.uv.y);
        numpadCursor.position.copy(panelHit.point);
        numpadCursor.visible = true;
      }
      if (hoverLang !== prevHoverLang) { redrawLangMenu(); prevHoverLang = hoverLang; }
    } else if (modeId === 'unit') {
      // UNIT: thumbstick up/down cycles; ray + trigger directly picks m/cm/mm.
      reticle.visible = false;
      edgeHi.visible = false;
      hoverUnit = null;
      numpadCursor.visible = false;
      const panelHit = rayPanelHit(editCtl, unitMenu.mesh);
      if (unitMenu.group.visible && panelHit) {
        hoverUnit = unitMenu.unitAt(panelHit.uv.x, panelHit.uv.y);
        numpadCursor.position.copy(panelHit.point);
        numpadCursor.visible = true;
      }
      if (hoverUnit !== prevHoverUnit) { redrawUnitMenu(); prevHoverUnit = hoverUnit; }
    } else {
      // DROP modes: no floor target (zones drop at the standing position).
      reticle.visible = false;
      edgeHi.visible = false;
    }
    // Keep the placed plan locked to the COMPLETE anchor pose. In particular, Quest
    // may rotate local-floor while relocalizing after headset sleep; ignoring the
    // anchor quaternion preserves its position but makes the plan jump/turn around
    // the new tracking origin. planYaw + navOffset remain anchor-relative.
    if (placed && anchor) {
      const pose = frame.getPose(anchor.anchorSpace, localSpace);
      if (pose) {
        if (anchorPoseMissing) rlog('anchor pose recovered after tracking interruption');
        anchorPoseMissing = false;
        const p = pose.transform.position;
        planPos.set(p.x, p.y, p.z);
        const o = pose.transform.orientation;
        _camQ.set(o.x, o.y, o.z, o.w);
        _fwd.set(0, 0, -1).applyQuaternion(_camQ);
        anchorYaw = Math.atan2(-_fwd.x, -_fwd.z);
        planGroup.visible = true;
        originGizmo.visible = true;
        applyPlanMatrix();
      } else {
        // Do not render one stale local-floor frame while Quest is still
        // relocalizing. It can be metres/degrees away until the anchor pose returns.
        if (!anchorPoseMissing) rlog('anchor pose unavailable; hiding placed plan');
        anchorPoseMissing = true;
        planGroup.visible = false;
        originGizmo.visible = false;
      }
    }
  }
}
