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
import { connectedRoomComponent } from '../core/geometry2d.js';
import { makeDistance, makeOriginDistance, makeMarkerDistance, isMarkerConstraint, ORIGIN_ID, edgeCoord } from '../core/constraints.js';
import { footprintFloorGeometry } from '../core/extrude.js';
import { getUnit, setUnit, cycleUnit, onUnitChange, UNIT_ORDER, toMeters, unitLabel, fmt } from '../core/units.js';
import { t, localizedFloorName, getLang, langLabel, setLang, cycleLang, onLangChange, LANG_ORDER } from '../core/i18n.js';
import {
  FLOOR_CLIPBOARD_KEY, createFloorClipboard, pasteFloorClipboard,
  serializeProject, deserializeInto,
} from '../io/serialize.js';
import { floorToSvg, floorToCanvas, floorToPngBlob, sharedScaleSheetOptions } from '../io/planSheet.js';
import { floorToDxf, floorToCoohomDxf } from '../io/dxf.js';
import {
  getOutputSettings, cycleOutputFormat, toggleOutputLayer, onOutputSettingsChange,
} from '../io/outputOptions.js';
import { dimLabelCoord, setDimLabelCoord } from '../core/dimline.js';
import { electricalRoutePoints, electricalRouteSegments } from '../core/electrical.js';
import { conduitNetworkSegments, conduitNodePos, conduitNodeForMarker } from '../core/conduit.js';
import { ZONE_KINDS, zoneKind, zoneColorHex, lightenHex } from '../core/zoneColors.js';
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
    const setText = (text, colorHex) => {
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
    mesh.renderOrder = 20;
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
        ctx.fillText(keyLabel(kid), x + w / 2, y + h / 2 + 2);
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

    // metaFor(i) -> {rects, when} | null ; accent is the mode's color as '#rrggbb'.
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
          ctx.fillText(`${meta.rects} ${t('slot.rects')}  ·  ${meta.when}`, W / 2, 186);
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

    function redraw(floor) {
      const oldWidth = canvas.width, oldHeight = canvas.height;
      const sheetOpts = sharedScaleSheetOptions(project.floors, {
        page: 'a4',
        targetPx: 2048,
        layers: getOutputSettings(),
        markerLabel: (ty) => t(`marker.${ty}`),
        markerLegendNote: (ty) => ty === 'outlet_aircon' ? t('marker.dedicatedCircuit') : '',
        zoneLabel: (kind) => t(`mode.${kind}`),
        floorLabel: localizedFloorName,
        generatedLabel: t('sheet.generated'),
        buildLabel: t('sheet.build'),
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
    mesh.renderOrder = 20;
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
    mesh.renderOrder = 20;
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
    const W = 512, H = 640;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.45),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    );
    mesh.renderOrder = 20;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;

    const TOGGLES = ['planDims', 'markerDims', 'markerIcons', 'furniture', 'area'];
    const TOGGLE_Y = 196, ROW_H = 70, BUTTON_Y = 566, BUTTON_H = 124;
    function actionAt(u, v) {
      const cy = (1 - v) * H;
      if (cy >= TOGGLE_Y && cy < TOGGLE_Y + TOGGLES.length * ROW_H) {
        return TOGGLES[Math.floor((cy - TOGGLE_Y) / ROW_H)] || null;
      }
      if (cy >= BUTTON_Y && cy <= BUTTON_Y + BUTTON_H) return 'export';
      return null;
    }
    function draw(accent, hoverAction, settings, floorName) {
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
      const formatLabel = settings.format === 'coohom' ? 'COOHOM DXF' : settings.format.toUpperCase();
      ctx.fillText(`${t('export.format')} · ${formatLabel}`, 28, 152);
      ctx.fillStyle = '#768390';
      ctx.font = '21px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('↑ / ↓', W - 28, 152);

      TOGGLES.forEach((key, i) => {
        const y = TOGGLE_Y + i * ROW_H + 5, h = ROW_H - 10;
        const hot = hoverAction === key;
        ctx.fillStyle = hot ? 'rgba(72,79,88,0.98)' : 'rgba(38,44,52,0.96)';
        ctx.beginPath(); ctx.roundRect(18, y, W - 36, h, 14); ctx.fill();
        ctx.strokeStyle = settings[key] ? accent : '#768390';
        ctx.lineWidth = 4;
        ctx.strokeRect(37, y + 15, 28, 28);
        if (settings[key]) {
          ctx.fillStyle = accent;
          ctx.font = 'bold 29px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✓', 51, y + 29);
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
    new THREE.MeshBasicMaterial({ color: 0x60a5fa, depthTest: false, depthWrite: false }),
  );
  numpadCursor.renderOrder = 21;
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
  // activeFloorId untouched, renders the complete stack, and makes the authoring
  // groups unavailable until a real floor is selected again.
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
  // Draggable waypoint handles for MARKER · WIRE EDIT. Like markerGroup/electricalGroup
  // it shares the plan transform but is rebuilt on demand, not by clearPlanGeometry.
  const wireHandleGroup = new THREE.Group();
  wireHandleGroup.visible = false;
  planGroup.add(wireHandleGroup);
  // The conduit network (segments + node handles), drawn in the CONDUIT modes.
  // Rebuilt on demand like the groups above, not by clearPlanGeometry.
  const conduitGroup = new THREE.Group();
  conduitGroup.visible = false;
  planGroup.add(conduitGroup);
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

  // Cache dim-label textures by their content (text+color). buildPlan rebuilds every
  // label sprite on each change, but a label's canvas only depends on text+color, so
  // reusing the CanvasTexture avoids a fresh canvas draw + GPU upload per rebuild. This
  // is what makes dragging a dim offset cheap: the value text is constant through the
  // drag, so every frame is a cache hit. Bounded by evicting (disposing) in buildDimensions.
  const dimTexCache = new Map(); // `${text}|${color}` -> CanvasTexture
  function dimLabelTexture(text, color) {
    const key = `${text}|${color}`;
    let tex = dimTexCache.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 18, 24, 0.82)';
    ctx.beginPath(); ctx.roundRect(6, 14, 244, 36, 10); ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    tex = new THREE.CanvasTexture(canvas);
    dimTexCache.set(key, tex);
    return tex;
  }

  // A billboarded value label (canvas pill, always faces the user) at a plan point.
  function makeDimLabel(text, color, px, py) {
    const tex = dimLabelTexture(text, color);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(0.16, 0.04, 1);
    sprite.position.set(px, 0.04, -py); // plan (x,y) -> local (x,0,-y), lifted 4 cm
    sprite.userData.dimText = text;     // the value, echoed on the controller on hover
    return sprite;
  }

  // Draw every distance constraint of one floor into planGroup: a dim line between
  // the two edges (offset outward), extension lines, and the value label. `elevation`
  // is zero for the editable active-floor view and the floor's stacked elevation in
  // the read-only ALL FLOORS view. Only the active view publishes pickable labels.
  function buildDimensions(floor = project.activeFloor, elevation = 0, selectable = true) {
    const segs = [];        // {ax,ay,bx,by,conflict,marker?} strips to build
    const floorDimSprites = [];
    if (selectable) dimSprites = []; // value labels, for hover pick in edit modes
    // A dim value label carries its constraint id + both refs, so ray-hovering it can
    // highlight that constraint's edges and selecting it loads the constraint to edit.
    const endpointToRef = (ep) => ep.marker
      ? { kind: 'marker', markerId: ep.marker }
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
    }
    for (const s of floorDimSprites) {
      s.position.y += elevation;
      planGroup.add(s);
    }
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

  // `withDims=false` skips buildDimensions — the per-frame dimension rebuild creates
  // a CanvasTexture per label, which is the dominant cost. During a live edge drag we
  // pass false (edge strip + fill still update for feedback); a full rebuild on the
  // drag release (onSqueezeEnd) brings the dims back correct.
  function clearPlanGeometry() {
    // Clear any previous geometry. Dispose per-rebuild materials; do NOT dispose the
    // sprite .map — dim-label textures are shared/cached in dimTexCache (reused across
    // rebuilds) and are evicted there, not here.
    for (const child of [...planGroup.children]) {
      if (child === markerGroup || child === electricalGroup || child === wireHandleGroup || child === conduitGroup) continue; // rebuilt separately below
      planGroup.remove(child);
      child.geometry?.dispose();
      if (child.isSprite) child.material.dispose();
    }
    dimSprites = [];
    // Safe only after every old label has been removed. In ALL FLOORS,
    // buildDimensions runs once per storey, so evicting inside that function could
    // dispose a texture already attached to an earlier floor in the same rebuild.
    if (dimTexCache.size > 64) {
      for (const texture of dimTexCache.values()) texture.dispose();
      dimTexCache.clear();
    }
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
  function markerTexture(marker) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
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
    return new THREE.CanvasTexture(canvas);
  }

  // Per-type faceplate interior, drawn inside the shared white faceplate above.
  function markerFace(ctx, type) {
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
      // Fixed HVAC supply: snowflake plus cable termination, deliberately not
      // drawn as a general-purpose socket.
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3]) {
        const dx = Math.cos(angle) * 20, dy = Math.sin(angle) * 20;
        ctx.beginPath(); ctx.moveTo(62 - dx, 58 - dy); ctx.lineTo(62 + dx, 58 + dy); ctx.stroke();
      }
      ctx.strokeStyle = '#334155';
      ctx.beginPath(); ctx.moveTo(62, 78); ctx.lineTo(62, 89); ctx.lineTo(82, 89); ctx.stroke();
      ctx.beginPath(); ctx.arc(88, 89, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.lineCap = 'butt';
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
  function markerOutlineTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.beginPath(); ctx.arc(64, 64, 53, 0, Math.PI * 2);
    ctx.lineWidth = 12; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    return new THREE.CanvasTexture(canvas);
  }

  function makeMarkerSprite(marker) {
    const tex = markerTexture(marker);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
    spr.scale.set(0.09, 0.09, 1);
    spr.renderOrder = 32; // above floor overlays/highlights (badges are 30)
    spr.userData.markerId = marker.id;
    spr.userData.markerRole = 'wall';
    return spr;
  }

  // A second copy of the outlet glyph projected flat onto the plan overlay. DIMS
  // uses this as the marker's dimension reference; OUTLET continues to target the
  // wall-height sprite, keeping the two editing domains spatially unambiguous.
  function makeMarkerFloorIcon(marker) {
    const tex = markerTexture(marker);
    const mesh = new THREE.Mesh(markerFloorGeom, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.78,
      side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    }));
    mesh.renderOrder = 31;
    mesh.userData.markerId = marker.id;
    mesh.userData.markerRole = 'floor';
    return mesh;
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
      child.material?.map?.dispose();
      child.material?.dispose();
    }
  }

  // Add one floor's marker glyphs in planGroup-local coordinates. The editable
  // active floor gets selection outlines; stacked overview markers are deliberately
  // inert and therefore omit them.
  function addFloorMarkers(floor, elevation = 0, withOutlines = true) {
    for (const m of floor.markers) {
      const spr = makeMarkerSprite(m);
      spr.position.set(m.x, elevation + m.z, -m.y);
      const floorIcon = makeMarkerFloorIcon(m);
      floorIcon.position.set(m.x, elevation + 0.016, -m.y);
      markerGroup.add(spr, floorIcon);
      if (!withOutlines) continue;
      const wallOutline = makeMarkerOutline(m, 'wall');
      wallOutline.position.copy(spr.position);
      const floorOutline = makeMarkerOutline(m, 'floor');
      floorOutline.position.set(m.x, elevation + 0.018, -m.y);
      markerGroup.add(wallOutline, floorOutline);
    }
  }

  // Rebuild the editable active floor's marker layer.
  function buildMarkers() {
    clearMarkers();
    addFloorMarkers(project.activeFloor);
  }

  function clearElectricalLinks() {
    for (const child of [...electricalGroup.children]) {
      electricalGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
    wirePreviewLine = null; // the live WIRE preview lives here too; recreated on demand
  }

  // Per-surface colors for as-built wires (inferred, not stored): a run inside the
  // ceiling reads cyan, inside a wall amber, inside the floor slab green.
  const WIRE_SURFACE_COLOR = { ceiling: 0x38bdf8, wall: 0xf59e0b, floor: 0x34d399 };

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

  // Two link kinds render here:
  //  - 'control' (switch→light): one dashed line following the DERIVED ceiling
  //    route; LINK mode recolors these by source switch.
  //  - 'wire': the as-built run, drawn as one dashed line PER SEGMENT colored by
  //    the inferred wall/ceiling/floor surface of that segment.
  // The path is derived from live marker positions so edits never detach its ends.
  function buildElectricalLinks(floor = project.activeFloor) {
    clearElectricalLinks();
    for (const link of floor.electricalLinks || []) {
      if ((link.kind || 'control') === 'wire') {
        for (const seg of electricalRouteSegments(floor, link)) {
          const line = makeRouteLine([seg.a, seg.b], WIRE_SURFACE_COLOR[seg.surface] || 0xf59e0b);
          line.userData.electricalLinkId = link.id;
          line.userData.kind = 'wire';
          line.userData.surface = seg.surface;
          electricalGroup.add(line);
        }
        continue;
      }
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

  // ---- MARKER · WIRE EDIT geometry helpers -------------------------------------
  // Plan distance from (px,py) to the segment a→b (both plan-space {x,y}).
  function planPointToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return Math.hypot(px - a.x, py - a.y);
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  // Nearest wire (kind:'wire' link) whose plan projection passes within WIRE_PICK_M
  // of the reticle. Only drawable (non-collapsed) segments count as pickable.
  const WIRE_PICK_M = 0.12; // m; a little wider than the reticle for a thin line
  const WAYPOINT_GRAB_M = 0.14; // m; tip within this of a handle → direct 3D carry, else remote
  function wireAtFloorPoint(px, py) {
    let best = null, bestD = WIRE_PICK_M;
    for (const link of project.electricalLinks) {
      if ((link.kind || 'control') !== 'wire') continue;
      for (const seg of electricalRouteSegments(project.activeFloor, link)) {
        if (seg.a.x === seg.b.x && seg.a.y === seg.b.y) continue; // vertical: no plan extent
        const d = planPointToSegment(px, py, seg.a, seg.b);
        if (d < bestD) { bestD = d; best = link; }
      }
    }
    return best;
  }

  // Nearest waypoint HANDLE of `wire` under the reticle (by floor projection). When
  // several share one floor point (a vertical wall drop), repeated picks cycle them
  // top-to-bottom from the current selection — mirrors stacked-marker picking.
  function waypointHandleAtFloorPoint(wire, px, py) {
    const wps = wire?.route?.waypoints || [];
    let nearest = -1, bestD = RETICLE_OUTER;
    for (let i = 0; i < wps.length; i++) {
      const d = Math.hypot(px - wps[i].x, py - wps[i].y);
      if (d < bestD) { bestD = d; nearest = i; }
    }
    if (nearest < 0) return null;
    const coincident = wps
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.x === wps[nearest].x && w.y === wps[nearest].y)
      .sort((a, b) => (b.w.z || 0) - (a.w.z || 0) || a.i - b.i)
      .map(({ i }) => i);
    if (coincident.length < 2) return nearest;
    const at = coincident.indexOf(selectedWaypointIndex);
    return coincident[at < 0 ? 0 : (at + 1) % coincident.length];
  }

  // Segment (== waypoint insert index) of `wire` nearest the reticle, ignoring
  // collapsed vertical segments; used to splice a new waypoint on the right leg.
  function nearestDrawableSegmentIndex(wire, px, py) {
    const segs = electricalRouteSegments(project.activeFloor, wire);
    let best = null, bestD = WIRE_PICK_M;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.a.x === s.b.x && s.a.y === s.b.y) continue;
      const d = planPointToSegment(px, py, s.a, s.b);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function clearWireHandles() {
    for (const child of [...wireHandleGroup.children]) {
      wireHandleGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }

  // One small sphere per waypoint of the selected wire, at its true 3D position.
  // The active waypoint is amber, the rest white; picking is by floor projection.
  const wireHandleGeom = new THREE.SphereGeometry(0.02, 12, 12);
  function buildWireHandles() {
    clearWireHandles();
    if (!selectedWire) { wireHandleGroup.visible = false; return; }
    wireHandleGroup.visible = true;
    const wps = selectedWire.route?.waypoints || [];
    wps.forEach((w, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: i === selectedWaypointIndex ? 0xfbbf24 : 0xffffff,
        depthTest: false, depthWrite: false, transparent: true, opacity: 0.95,
      });
      const mesh = new THREE.Mesh(wireHandleGeom, mat);
      mesh.position.set(w.x, w.z || 0, -w.y);
      mesh.renderOrder = 16;
      mesh.userData.waypointIndex = i;
      wireHandleGroup.add(mesh);
    });
  }

  // Live waypoint drag, in one of two modes chosen at grip-press by real proximity:
  //  - 'direct': the waypoint sticks to the controller TIP and moves in full 3D
  //    (for points within arm's reach — floor runs, outlet height).
  //  - 'remote': the floor RETICLE drives X/Y while z is held (out-of-reach points —
  //    e.g. a ceiling run); z is set separately by typing on the height pad.
  // Either way, redraw the wire + reposition the handle each frame; commit on release.
  function applyWaypointGripDrag(inputSource) {
    if (gripDrag?.kind !== 'waypoint') return;
    if (!selectedWire || !project.electricalLinks.includes(selectedWire)) return;
    const wp = selectedWire.route?.waypoints?.[gripDrag.index];
    if (!wp) return;
    let nx = wp.x, ny = wp.y, nz = wp.z || 0;
    if (gripDrag.mode === 'direct') {
      const tip = tipPosition(inputSource);
      if (!tip) return;
      const plan = worldToPlan(tip);
      nx = plan.px; ny = plan.py; nz = Math.max(0, tip.y - overlayY());
    } else {
      const hit = rayFloorHit(inputSource);
      if (!hit) return;
      const plan = worldToPlan(hit);
      nx = plan.px; ny = plan.py; // z stays put; the pad owns height for remote points
    }
    project.moveWireWaypoint(selectedWire.id, gripDrag.index, { x: nx, y: ny, z: nz }, { emit: false });
    buildElectricalLinks();
    const handle = wireHandleGroup.children.find((h) => h.userData.waypointIndex === gripDrag.index);
    if (handle) handle.position.set(nx, nz, -ny);
  }

  // ---- Conduit network rendering + picking ---------------------------------
  const conduitNodeGeom = new THREE.SphereGeometry(0.022, 12, 12);
  // Draw every conduit segment (dashed, colored by inferred surface) and a small
  // sphere per node (marker-bound nodes dimmer than free junctions). Rebuilt on
  // any topology change; node spheres carry userData for picking/handles.
  function buildConduits(floor = project.activeFloor) {
    for (const child of [...conduitGroup.children]) {
      conduitGroup.remove(child); child.geometry?.dispose(); child.material?.dispose();
    }
    conduitPreviewLine = null; // recreated on demand in the render branch
    for (const seg of conduitNetworkSegments(floor)) {
      const line = makeRouteLine([seg.a, seg.b], WIRE_SURFACE_COLOR[seg.surface] || 0xf59e0b);
      line.userData.conduitSegmentId = seg.id;
      conduitGroup.add(line);
    }
    for (const node of floor.conduitNodes || []) {
      const p = conduitNodePos(floor, node);
      const mesh = new THREE.Mesh(conduitNodeGeom, new THREE.MeshBasicMaterial({
        color: node.markerId ? 0x94a3b8 : 0xffffff,
        depthTest: false, depthWrite: false, transparent: true, opacity: 0.95,
      }));
      mesh.position.set(p.x, p.z, -p.y);
      mesh.renderOrder = 16;
      mesh.userData.conduitNodeId = node.id;
      conduitGroup.add(mesh);
    }
  }

  // Nearest conduit node under the reticle, by floor projection.
  function conduitNodeAtFloorPoint(px, py) {
    let best = null, bestD = RETICLE_OUTER;
    for (const node of project.conduitNodes) {
      const p = conduitNodePos(project.activeFloor, node);
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < bestD) { bestD = d; best = node; }
    }
    return best;
  }

  // Read-only building overview: every independent plan stays aligned to the shared
  // origin and is lifted by its derived elevation. Dimensions and both marker glyphs
  // remain visible for reference, but none are published to the edit pickers.
  function buildAllFloors(withDims = true) {
    clearPlanGeometry();
    clearMarkers();
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
      addFloorStrips(floor, elevation);
      if (withDims) buildDimensions(floor, elevation, false);
      if (withDims) addFloorMarkers(floor, elevation, false);
    }
    return planGroup.children.length > 0;
  }

  // All existing model-changing call sites rebuild through this dispatcher, so a
  // LOAD/unit change made while overviewing cannot silently fall back to one floor.
  // It also dirties the optional left-hand sheet; the frame loop throttles the
  // expensive 2048px raster refresh during continuous grip drags.
  function buildPlan(withDims = true) {
    sheetDirty = true;
    return allFloorsView ? buildAllFloors(withDims) : buildActivePlan(withDims);
  }

  let localSpace = null;
  let currentFrame = null;
  let anchor = null;
  let placed = false;
  const saved = {};
  const planPos = new THREE.Vector3(); // last placed reference point (world)
  // Horizontal locomotion applied on top of the anchored survey frame. Moving the
  // CAD world beneath the stationary headset is the AR equivalent of teleporting;
  // the physical passthrough camera and the surveyed anchor remain untouched.
  const navOffset = new THREE.Vector3();
  let planYaw = 0;                     // plan rotation about vertical, set by REGISTER
  let floorY = 0;                      // shared ground datum; derived from any storey's real floor in FLOOR
  let registerPts = [];                // REGISTER 3-point gesture: [P1,P2 along a wall, P3 on the perpendicular wall]
  let recalPts = [];                   // RECAL wall touches (world {x,z}): [P1,P2 along wall 1, P3 on wall 2]
  let recalCorner = null;              // {cx, cy, a, b} selected corner; after lock a=wall 1 end, b=wall 2 end
  let recalLocked = false;             // RECAL: corner + wall order explicitly selected (else still previewing)
  let prevRecalStep = null;            // last reticle step number drawn (redraw the badge only on change)
  // MARKER · EDIT drop type. Cycled by B/Y (or thumbstick-y) while in the mode, like
  // LEVEL cycles floors. Session-level (persists across mode switches). Extend the list
  // for new fixture types; each also needs a markerFace() branch, a
  // marker.<type> i18n key, and serialize already round-trips the type.
  const MARKER_TYPES = [
    'outlet', 'outlet_shutter', 'outlet_aircon', 'outlet_cooktop',
    'outlet_oven', 'outlet_water_heater', 'outlet_appliance',
    'switch', 'light', 'ethernet', 'ethernet_dual', 'patch_panel', 'intercom',
    'panel',
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
  let edgeSnapPrompt = false; // EDGE label currently shows the "snap to wall" state (edge locked)
  let hoverEdge = null;     // {rectId, edge} under the ray across ALL zones (per frame)
  let selectedRect = null;  // PLAN mode: the persistently-selected zone (survives aim)
  let hoverStack = [];      // PLAN mode: zones under the ray this frame, topmost-first
  let roomComponentCacheKey = '';
  let roomComponentCache = null;
  let roomAreaHud = null;   // m² shown in the info panel for the selected room component
  let selectedMarker = null; // OUTLET mode: marker being height-edited
  let hoverMarker = null;    // OUTLET mode: marker under the pointer this frame
  let selectedLinkSwitch = null; // MARKER · LINK source; targets are toggled lights
  // MARKER · WIRE authoring: the run's start marker and the waypoints captured so
  // far ({x,y,z} model coords). A live preview line threads start → waypoints → tip.
  let wireFromMarker = null;
  let wireWaypoints = [];
  let wirePreviewLine = null;
  // MARKER · WIRE EDIT: the selected wire link + which of its waypoints is active,
  // plus the per-frame hover targets (a waypoint handle wins over the wire body).
  let selectedWire = null;
  let selectedWaypointIndex = null;
  let hoverWire = null;
  let hoverWaypointIndex = null;
  // MARKER · CONDUIT pen: the node the next segment grows from, plus per-frame hover.
  let penNodeId = null;
  let hoverConduitNode = null;
  let conduitPreviewLine = null; // live pen preview (pen node → tip), lives in conduitGroup
  let markerBuffer = '';     // OUTLET height pad: typed digits (prefilled with the marker's z)
  let markerPristine = false; // markerBuffer holds a prefilled value; first key replaces it
  let waypointBuffer = '';   // WIRE EDIT height pad: the selected waypoint's z (for remote/out-of-reach points)
  let waypointPristine = false;

  // Shared state for the two hard-separated dimension domains. PLAN DIMS accepts
  // edge<->edge and edge<->origin pairs. OUTLET DIMS requires an outlet floor icon
  // first, then an edge. Neither mode can select or mutate the other's constraints.
  let dimRefA = null;       // first-picked reference (the anchor, like desktop)
  let dimRefB = null;       // second-picked reference
  let hoverRef = null;      // reference under the ray this frame (edge or origin)
  let hoverFloorPt = null;  // {px,py} reticle floor point this frame during DIMS ref-pick
  let dimOffsetPt = null;   // {px,py} captured when a pair completes -> new dim's default line placement
  let hoverDim = null;      // dim value panel under the ray this frame (to select/edit a constraint)
  let gripDrag = null;      // active grip-drag: dim (DIMS), edge (EDGE), or marker (OUTLET)
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
  // A normal view is seated on the active storey. ALL FLOORS instead seats the
  // parent group on the registered ground datum because each child is already
  // lifted by its own elevation.
  const displayElevation = () => (allFloorsView ? 0 : activeElevation());
  const overlayY = () => planPos.y + displayElevation();

  // Rebuild the plan's transform from its origin (planPos), yaw (planYaw), and the
  // selected display's elevation lift. Drive position/quaternion (not .matrix)
  // so Three keeps matrixWorld in sync.
  function applyPlanMatrix() {
    planGroup.position.set(planPos.x + navOffset.x, overlayY(), planPos.z + navOffset.z);
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

  // --- PLAN DIMS / OUTLET DIMS (S2 numpad) helpers ---

  const isXEdge = (e) => e === 'left' || e === 'right';
  const isDimMode = (id) => id === 'plan_dims' || id === 'outlet_dims';
  let bufferPristine = false; // buffer holds a prefilled value; first key replaces it

  // A reference is a rect EDGE, the plan ORIGIN axis, or a MARKER (pinned to a wall).
  const markerOf = (ref) => project.markers.find((m) => m.id === ref.markerId);
  const refLabel = (ref) => (!ref ? '?'
    : ref.kind === 'origin' ? t('ref.origin')
    : ref.kind === 'marker' ? t(`marker.${markerOf(ref)?.type ?? 'outlet'}`)
    : t(`edge.${ref.edge}`));
  const refsEqual = (a, b) =>
    !!a && !!b && a.kind === b.kind &&
    (a.kind === 'origin' ? true
      : a.kind === 'marker' ? a.markerId === b.markerId
      : (a.rectId === b.rectId && a.edge === b.edge));

  // Two refs can be dimensioned if they lie on the same coordinate axis (and are not
  // the same target). An edge pairs with the origin on its own axis. A MARKER pin must
  // pair with a rect EDGE (the edge supplies the axis) — marker+marker / marker+origin
  // have no axis source and are disallowed.
  function refsCompatible(a, b) {
    const am = a.kind === 'marker', bm = b.kind === 'marker';
    if (am || bm) return (am && b.kind === 'edge') || (bm && a.kind === 'edge');
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
    dimOffsetPt = null;
    dimBuffer = '';
    bufferPristine = false;
    dimConflict = false;
    numpad.group.visible = false; // back to ref-pick: the pad has no role until a pair is chosen
    numpadCursor.visible = false;
  }

  function dimTitle() {
    if (!dimRefA) return t(modes[currentMode]?.id === 'outlet_dims' ? 'dim.pickOutlet' : 'dim.pickPlan');
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
    resetDim();
    buildPlan();       // solver changed geometry; refresh the MR view
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
    if (c) { project.removeConstraint(c.id); rlog('dim delete', { id: c.id }); }
    else rlog('dim cancel (no constraint)');
    resetDim();
    buildPlan();
    applyPlanMatrix();
    redrawNumpad();
  }

  // Live update for an active grip-drag, from the reticle's floor point (px,py):
  // in DIMS, the perpendicular component places the line while the parallel component
  // places the value box along that line; in EDGE, move the grabbed edge. Rebuilt each
  // frame while held.
  // Place a dimension's perpendicular line marker at the plan floor point (px,py) —
  // the signed offset the dim line sits at. Origin dims store the absolute coord;
  // edge<->edge dims store it relative to the outer edge (the auto-stack baseline),
  // matching buildDimensions. Shared by grip-drag and the default-on-create placement.
  function setDimOffset(c, px, py) {
    if (isMarkerConstraint(c)) {
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
      buildPlan(); applyPlanMatrix(); // presentational; no re-solve needed
    } else if (gripDrag.kind === 'edge') {
      const rect = project.rectangles.find((r) => r.id === gripDrag.rectId);
      if (!rect) return;
      setEdge(rect, gripDrag.edge, px, py);
      project.touch(); // edge moved in place -> re-solve + rebuild
      buildPlan(false); applyPlanMatrix(); // skip dim-label textures while dragging (restored on release)
    }
  }

  const _dragPoint = new THREE.Vector3();
  function applyMarkerGripDrag(inputSource) {
    if (gripDrag?.kind !== 'marker' || !setControllerRay(inputSource)) return;
    const marker = project.markers.find((m) => m.id === gripDrag.markerId);
    if (!marker) return;
    _dragPoint.copy(_ro).addScaledVector(_rd, gripDrag.distance);
    const { px, py } = worldToPlan(_dragPoint);
    // Respect pins ("if its constraints allow"): a locked axis (solveMarkers sets
    // marker._locked from the X/Y pins) does NOT move — only free axes + z follow the
    // grab. A fully-pinned marker therefore becomes a pure vertical (z) slider.
    const nx = marker._locked?.x ? marker.x : px;
    const ny = marker._locked?.y ? marker.y : py;
    // Update marker coordinates + pin offsets without emitting the project's full
    // solve/listener cascade every XR frame. Release commits once via project.touch().
    project.moveMarker(
      marker.id,
      { x: nx, y: ny, z: Math.max(0, _dragPoint.y - overlayY()) },
      { emit: false },
    );
    // Move the existing visuals directly during the drag; on release, buildPlan
    // restores canonical rendering after the single committed model notification.
    for (const visual of markerGroup.children) {
      if (visual.userData.markerId !== marker.id) continue;
      if (visual.userData.markerRole.startsWith('wall')) visual.position.set(marker.x, marker.z, -marker.y);
      else visual.position.set(marker.x, visual.userData.markerRole === 'floor-outline' ? 0.018 : 0.016, -marker.y);
    }
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

  // ---- EDIT marker height: a marker's inherent height above the floor, typed by hand
  // on the DIMS numpad (reused, like LEVEL). SWAP is inert; DEL deletes the marker. X/Y
  // are pinned separately in DIMS — height is never a constraint axis.
  const markerTitle = () => `${t(`marker.${selectedMarker?.type ?? 'outlet'}`)}  ·  ${t('marker.height')}`;
  const redrawMarkerPad = () => numpad.draw(markerTitle(), markerBuffer, hoverKey);

  function refreshMarkerPad() {
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
    if (!Number.isFinite(val) || val < 0) return; // 0 = on the floor; negatives rejected
    const id = selectedMarker.id;
    project.setMarkerHeight(id, toMeters(val));
    rlog('marker height', { id, m: +toMeters(val).toFixed(3) });
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
    if (k === 'swap') return; // no role when entering a height
    if (k === 'del') { deleteSelectedMarker(); return; }
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

  // ---- WIRE EDIT waypoint height: for a REMOTE (out-of-reach) waypoint, X/Y follow
  // the floor reticle during a grip and z is typed here on the reused numpad. A
  // DIRECT (in-reach) grab sets all three from the controller tip instead.
  const selectedWaypoint = () => selectedWire?.route?.waypoints?.[selectedWaypointIndex];
  const waypointPadTitle = () => `${t('wire.point')}  ·  ${t('marker.height')}`;
  const redrawWaypointPad = () => numpad.draw(waypointPadTitle(), waypointBuffer, hoverKey);

  function refreshWaypointPad() {
    const wp = selectedWaypoint();
    waypointBuffer = wp ? fmt(wp.z || 0) : '';
    waypointPristine = true;
    redrawWaypointPad();
  }

  function activateWaypointPad() {
    placePanel(numpad.group);
    numpad.group.visible = true;
    refreshWaypointPad();
  }

  // Select a waypoint of the current wire and open its height pad. Shared by the
  // trigger picker and both grip grabs so the pad always tracks the active point.
  function selectWaypoint(index) {
    selectedWaypointIndex = index;
    buildWireHandles();
    if (index != null) activateWaypointPad();
    else deactivateNumpad();
  }

  function commitWaypointHeight() {
    const wp = selectedWaypoint();
    if (!wp) return;
    const val = parseFloat(waypointBuffer);
    if (!Number.isFinite(val) || val < 0) return; // 0 = on the floor; negatives rejected
    project.moveWireWaypoint(selectedWire.id, selectedWaypointIndex, { x: wp.x, y: wp.y, z: toMeters(val) });
    rlog('wire waypoint height', { index: selectedWaypointIndex, m: +toMeters(val).toFixed(3) });
    buildElectricalLinks(); buildWireHandles();
    refreshWaypointPad(); // keep the point selected so it can be repositioned again
  }

  function pressWaypointKey(k) {
    if (k === 'enter') { commitWaypointHeight(); return; }
    if (k === 'swap') return; // no role when entering a height
    if (k === 'del') { // DEL removes the waypoint, mirroring the marker pad's delete
      if (selectedWire && selectedWaypointIndex != null) {
        project.removeWireWaypoint(selectedWire.id, selectedWaypointIndex);
        rlog('wire waypoint delete (pad)', { index: selectedWaypointIndex });
        selectWaypoint(null);
        buildElectricalLinks();
      }
      return;
    }
    if (waypointPristine && k !== 'back') waypointBuffer = '';
    waypointPristine = false;
    if (k === 'back') waypointBuffer = waypointBuffer.slice(0, -1);
    else if (k === '.') { if (!waypointBuffer.includes('.')) waypointBuffer += '.'; }
    else if (waypointBuffer.replace('.', '').length < 6) waypointBuffer += k;
    redrawWaypointPad();
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
    if (hoverDim) {
      const c = project.constraints.find((k) => k.id === hoverDim.userData.cId);
      const matchesDomain = c && (modeId === 'outlet_dims') === isMarkerConstraint(c);
      if (matchesDomain) { loadConstraint(c.id); return; }
    }
    if (!hoverRef) return;
    if (!dimRefA) {
      if ((modeId === 'plan_dims' && hoverRef.kind === 'marker') ||
          (modeId === 'outlet_dims' && hoverRef.kind !== 'marker')) return;
      dimRefA = hoverRef;
      rlog('dim A', { domain: modeId, ref: refLabel(hoverRef) });
      redrawNumpad();
      return;
    }
    if (modeId === 'plan_dims' && hoverRef.kind === 'marker') return;
    if (modeId === 'outlet_dims' && (dimRefA.kind !== 'marker' || hoverRef.kind !== 'edge')) return;
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
  // Keep the large sheet on the OUTSIDE of the left controller. In controller-local
  // coordinates -X is left/outward, leaving a clear corridor around the -Z aim ray
  // and its cyan floor reticle. Yaw its front normal inward (+X/+Z) so the sheet
  // faces the headset and reads naturally with a simple look to the left; pitch
  // it upward toward the user's head like a clipboard held below eye level.
  const LEFT_SHEET_POS = new THREE.Vector3(-0.42, 0.22, -0.32);
  const LEFT_SHEET_YAW = Math.PI / 4;
  const LEFT_SHEET_PITCH = -Math.PI / 4;

  const currentSheetFloor = () => project.activeFloor;
  const redrawSheet = () => {
    sheetPanel.redraw(currentSheetFloor());
    sheetFloorId = currentSheetFloor().id;
    sheetDirty = false;
    lastSheetRedrawAt = performance.now();
  };
  const isSheetExportMode = (id) => id === 'export';

  // Reparenting to the detected left controller makes the sheet follow its tracked
  // pose exactly like the controller HUD. The panel + dedicated teleport reticle are
  // both absent when LEFT is not connected.
  function updateLeftSheet(time, leftController) {
    if (!leftController) {
      sheetPanel.group.visible = false;
      return;
    }
    if (sheetPanel.group.parent !== leftController) {
      leftController.add(sheetPanel.group);
      sheetPanel.group.position.copy(LEFT_SHEET_POS);
      sheetPanel.group.rotation.set(LEFT_SHEET_PITCH, LEFT_SHEET_YAW, 0);
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
    return extension === 'json'
      ? `house-debug-${stamp}.json`
      : `plan-${floor}-${stamp}.${extension}`;
  };

  // Briefly show a message on the mode label, then restore the breadcrumb.
  function sheetFlash(msg) {
    for (const l of labels) l.setText(msg, modes[currentMode].color);
    clearTimeout(sheetFlashTimer);
    sheetFlashTimer = setTimeout(() => { if (isSheetExportMode(modes[currentMode].id)) setModeInfo(); }, 1600);
  }

  async function performExport() {
    const f = currentSheetFloor();
    const settings = getOutputSettings();
    const format = settings.format;
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
      data = floorToDxf(f, { layers: settings });
      mime = 'application/dxf';
    } else {
      const sheetOpts = sharedScaleSheetOptions(project.floors, {
        page: 'a4',
        layers: settings,
        markerLabel: (ty) => t(`marker.${ty}`),
        markerLegendNote: (ty) => ty === 'outlet_aircon' ? t('marker.dedicatedCircuit') : '',
        zoneLabel: (kind) => t(`mode.${kind}`),
        floorLabel: localizedFloorName,
        generatedLabel: t('sheet.generated'),
        buildLabel: t('sheet.build'),
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
    floorClipboard = createFloorClipboard(project.activeFloor);
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
        localStorage.setItem(slotKey(i), JSON.stringify({ savedAt: Date.now(), data: serializeProject(project) }));
        overwriteSlot = null;
        hoverSlotAction = prevHoverSlotAction = null;
        slotFlash = `${t('slot.saved')} ${i + 1}`;
        rlog('slot save', { slot: i });
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

  // World point where a controller's pointing ray meets the floor plane, or null.
  function rayFloorHit(inputSource) {
    if (!setControllerRay(inputSource)) return null;
    if (Math.abs(_rd.y) < 1e-4) return null; // parallel to the floor
    const t = (overlayY() - _ro.y) / _rd.y;
    if (t <= 0) return null; // floor is behind the controller
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
    navOffset.x += head.x - hit.x;
    navOffset.z += head.z - hit.z;
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
  function markerAtFloorPoint(px, py) {
    let best = null, bestD = RETICLE_OUTER;
    for (const marker of project.markers) {
      const d = Math.hypot(px - marker.x, py - marker.y);
      if (d < bestD) { bestD = d; best = marker; }
    }
    return best;
  }

  // MARKER · EDIT disambiguates any marker types sharing the exact same floor
  // projection. Once one is selected, keep the amber selection on it and preview
  // the next marker in height order under the yellow reticle; another trigger
  // advances the selection and refreshes its height editor.
  function editMarkerAtFloorPoint(px, py) {
    const marker = markerAtFloorPoint(px, py);
    if (!marker) return null;
    const stack = project.markers
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.x === marker.x && candidate.y === marker.y)
      .sort((a, b) => (b.candidate.z || 0) - (a.candidate.z || 0) || a.index - b.index)
      .map(({ candidate }) => candidate);
    if (stack.length < 2) return marker;
    const selectedIndex = stack.findIndex((candidate) => candidate.id === selectedMarker?.id);
    return stack[selectedIndex < 0 ? 0 : (selectedIndex + 1) % stack.length];
  }

  // LINK must disambiguate switches that share one floor projection. Keep the
  // shared marker picker unchanged for EDIT/DIMS. LINK ignores unrelated marker
  // types entirely, then previews the next switch in top-to-bottom order after
  // each trigger. The amber source remains selected while the yellow reticle
  // advances; aiming at a light exits the stack naturally and makes that light
  // the link target.
  function linkMarkerAtFloorPoint(px, py) {
    let marker = null;
    let bestD = RETICLE_OUTER;
    for (const candidate of project.markers) {
      if (candidate.type !== 'switch' && candidate.type !== 'light') continue;
      const d = Math.hypot(px - candidate.x, py - candidate.y);
      if (d < bestD) { bestD = d; marker = candidate; }
    }
    if (!marker) return null;
    const stackedSwitches = project.markers
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.type === 'switch'
        && candidate.x === marker.x && candidate.y === marker.y)
      .sort((a, b) => (b.candidate.z || 0) - (a.candidate.z || 0) || a.index - b.index)
      .map(({ candidate }) => candidate);
    if (stackedSwitches.length < 2) return marker;
    const selectedIndex = stackedSwitches.findIndex((candidate) => candidate.id === selectedLinkSwitch?.id);
    return stackedSwitches[selectedIndex < 0 ? 0 : (selectedIndex + 1) % stackedSwitches.length];
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
  function dimLabelAtPoint(px, py, markerDomain = null) {
    let best = null, bestD = RETICLE_OUTER;
    for (const s of dimSprites) {
      if (markerDomain != null) {
        const c = project.constraints.find((k) => k.id === s.userData.cId);
        if (!c || isMarkerConstraint(c) !== markerDomain) continue;
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
    selectedRect.kind = ZONE_KINDS[(i + dir + ZONE_KINDS.length) % ZONE_KINDS.length];
    selectedRect.op = zoneOp(selectedRect.kind);
    project.touch();
    buildPlan();
    applyPlanMatrix();
    updateRoomAreaHud();
    // The mode breadcrumb deliberately stays PLAN · EDIT. The dedicated TYPE
    // readout is the sole UI element whose label/color changes with the zone kind.
    rlog('edit kind', { id: selectedRect.id, kind: selectedRect.kind, op: selectedRect.op });
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
      id: 'edit', color: 0xa78bfa, // label/help via i18n: mode.edit / help.edit
      // PLAN editing domain: select a zone under the floor pointer; pressing again
      // cycles DOWN through overlapping zones (wraps), so any buried zone is
      // reachable. Outlets are deliberately ignored here. The selection persists +
      // is zebra-highlighted. GRIP deletes it; thumbstick-y cycles its zone kind.
      onTouch: () => {
        if (!placed) return;
        if (!hoverStack.length) return;
        const i = selectedRect ? hoverStack.indexOf(selectedRect) : -1;
        selectedRect = i >= 0 ? hoverStack[(i + 1) % hoverStack.length] : hoverStack[0];
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
        if (hoverMarker) {
          selectedMarker = hoverMarker;
          activateMarkerPad();
          rlog('marker select', { id: selectedMarker.id });
          return;
        }
        // First empty-space trigger leaves an existing edit before another marker
        // can be dropped, avoiding accidental duplicates while operating the pad.
        if (selectedMarker) { selectedMarker = null; deactivateNumpad(); return; }
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
      id: 'marker_conduit', color: 0x22d3ee, // build the shared conduit network (a graph)
      // Pen model: penNodeId is the growing end. Trigger a device/existing node to
      // start (or connect) there; trigger empty space to drop a junction + run a
      // conduit segment to it; trigger another node to join/branch/loop. Grip lifts
      // the pen. See help.marker_conduit.
      onTouch: (pos) => {
        if (!placed) return;
        // Prefer an existing conduit node, then a device marker, then empty space.
        let targetNodeId = hoverConduitNode?.id || null;
        if (!targetNodeId && hoverMarker) {
          targetNodeId = project.ensureConduitNodeAtMarker(hoverMarker.id).id;
        }
        if (!targetNodeId) {
          const { px, py } = worldToPlan(pos);
          const z = Math.max(0, pos.y - overlayY());
          targetNodeId = project.addConduitNode({ x: px, y: py, z }).id;
        }
        if (penNodeId && penNodeId !== targetNodeId) project.addConduitSegment(penNodeId, targetNodeId);
        penNodeId = targetNodeId;
        project.touch(); // ensureConduitNodeAtMarker doesn't emit on its own
        buildConduits(); buildPlan(); applyPlanMatrix();
        rlog('conduit pen', { node: penNodeId });
      },
    },
    {
      id: 'marker_wire', color: 0xf59e0b, // as-built physical wire tracing (any marker → any marker)
      // Trigger a marker to start the run, then trigger the surface along the wire's
      // real path to drop each waypoint (z captured from the tip), then trigger a
      // second marker to finish and store the wire. The endpoints stay live; each
      // segment's wall/ceiling/floor surface is inferred from its geometry. Grip
      // removes the last waypoint, or clears the start before the second end.
      onTouch: (pos) => {
        if (!placed) return;
        if (!wireFromMarker) {
          if (hoverMarker) {
            wireFromMarker = hoverMarker;
            wireWaypoints = [];
            rlog('wire from', { id: hoverMarker.id });
          }
          return;
        }
        if (hoverMarker && hoverMarker.id !== wireFromMarker.id) {
          const result = project.addWire(wireFromMarker.id, hoverMarker.id, wireWaypoints);
          if (result.ok) {
            rlog('wire commit', {
              from: wireFromMarker.id, to: hoverMarker.id,
              waypoints: wireWaypoints.length, linkId: result.link?.id,
            });
            wireFromMarker = null; wireWaypoints = [];
            buildPlan(); applyPlanMatrix();
          }
          return;
        }
        // Empty space (or the start marker again): drop a waypoint at the tip.
        const { px, py } = worldToPlan(pos);
        const z = Math.max(0, pos.y - overlayY());
        wireWaypoints.push({ x: px, y: py, z });
        rlog('wire waypoint', { px: +px.toFixed(3), py: +py.toFixed(3), z: +z.toFixed(3), n: wireWaypoints.length });
      },
    },
    {
      id: 'marker_wire_edit', color: 0xf59e0b, // edit an existing as-built wire's waypoints
      // Two-level selection mirroring MARKER · EDIT. Trigger the wire to select it
      // (its waypoints become handles); trigger a handle to select it (repeat cycles
      // stacked ones); trigger the wire between handles to insert a waypoint; trigger
      // empty space to deselect (waypoint first, then wire). Grip-drag a handle moves
      // it in 3D (onSqueezeStart); grip away from a handle deletes the selected
      // waypoint (onReset). Endpoints are markers and are edited in MARKER · EDIT.
      onTouch: (pos) => {
        if (!placed) return;
        // A selected waypoint opens the height pad; aiming at it, a trigger types a key.
        if (selectedWaypoint() && numpad.group.visible && hoverKey) { pressWaypointKey(hoverKey); return; }
        if (!selectedWire) {
          if (hoverWire) {
            selectedWire = hoverWire; selectWaypoint(null);
            rlog('wire edit select', { id: selectedWire.id });
          }
          return;
        }
        if (hoverWaypointIndex != null) { // select / cycle a waypoint handle (opens the pad)
          selectWaypoint(hoverWaypointIndex);
          rlog('wire waypoint select', { index: selectedWaypointIndex });
          return;
        }
        if (hoverWire && hoverWire.id !== selectedWire.id) { // switch to another wire
          selectedWire = hoverWire; selectWaypoint(null);
          rlog('wire edit reselect', { id: selectedWire.id });
          return;
        }
        if (hoverWire && hoverWire.id === selectedWire.id) { // on the selected wire (off a handle) → insert
          const { px, py } = worldToPlan(pos);
          const seg = nearestDrawableSegmentIndex(selectedWire, px, py);
          if (seg != null) {
            const z = Math.max(0, pos.y - overlayY());
            const i = project.insertWireWaypoint(selectedWire.id, seg, { x: px, y: py, z });
            buildElectricalLinks(); selectWaypoint(i);
            rlog('wire waypoint insert', { seg, index: i });
          }
          return;
        }
        // Empty space: back out one level — the waypoint, then the wire.
        if (selectedWaypointIndex != null) { selectWaypoint(null); return; }
        selectedWire = null; buildWireHandles();
        rlog('wire edit deselect');
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
          applyModeVisual(t('lbl.wall1p1'), C_RECAL);
          rlog('recal corner', { cx: +recalCorner.cx.toFixed(3), cy: +recalCorner.cy.toFixed(3) });
          return;
        }
        const n = recalPts.length;
        if (n === 0) {
          recalPts.push({ x: pos.x, z: pos.z }); // P1 along wall 1
          applyModeVisual(t('lbl.wall1p2'), C_RECAL);
          rlog('recal p1', { x: +pos.x.toFixed(3), z: +pos.z.toFixed(3) });
          return;
        }
        if (n === 1) {
          const p1 = recalPts[0];
          if (Math.hypot(pos.x - p1.x, pos.z - p1.z) < 0.05) return; // too close to define wall 1
          recalPts.push({ x: pos.x, z: pos.z }); // P2 along wall 1
          applyModeVisual(t('lbl.wall2'), C_RECAL_DIR);
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
  ];
  // Canonical controller-menu order. Keep the implementation blocks grouped by
  // behavior above; this list alone defines how A/B and thumbstick-x traverse them.
  const MODE_ORDER = [
    'register', 'floor', 'recal', 'teleport', 'level',
    'drop', 'edge', 'edit', 'translate', 'plan_dims',
    'marker', 'marker_link', 'marker_conduit', 'marker_wire', 'marker_wire_edit', 'outlet_dims', 'copy_floor', 'paste_floor', 'move_up', 'move_down', 'save', 'load', 'export', 'unit', 'lang',
  ];
  const MODE_GROUP = {
    register: 'setup', floor: 'setup', recal: 'setup', teleport: 'setup', level: 'setup',
    drop: 'plan', edge: 'plan', edit: 'plan', translate: 'plan', plan_dims: 'plan',
    marker: 'marker', marker_link: 'marker', marker_conduit: 'marker', marker_wire: 'marker', marker_wire_edit: 'marker', outlet_dims: 'marker',
    copy_floor: 'project', paste_floor: 'project', move_up: 'project', move_down: 'project',
    save: 'project', load: 'project', export: 'project', unit: 'project', lang: 'project',
  };
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
    selectedRect = null; // clear the EDIT selection when changing modes
    roomComponentCacheKey = '';
    roomComponentCache = null;
    roomAreaHud = null;
    lastHudAt = -Infinity;
    selectedMarker = null; // ...and any marker being height-edited (its pad is torn down below)
    selectedLinkSwitch = null; // ...and any electrical-link source switch
    wireFromMarker = null; wireWaypoints = []; // ...and any partially-traced wire
    selectedWire = null; selectedWaypointIndex = null; // ...and any wire-edit selection
    if (wireHandleGroup.children.length) clearWireHandles();
    wireHandleGroup.visible = false;
    penNodeId = null; // ...and lift the conduit pen
    selectedEdge = null; edgeSnapPrompt = false; // drop any pending EDGE lock + its label
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
    if (m.id === 'marker_conduit') buildConduits(); // show the network to author against
    conduitGroup.visible = m.id === 'marker_conduit';
  }

  // In the read-only building overview, mode traversal jumps across both editing
  // categories as a unit. SETUP and PROJECT remain available (including LEVEL,
  // which is how the user returns to a real floor).
  const modeAvailable = (index) => {
    const group = MODE_GROUP[modes[index].id];
    return !allFloorsView || (group !== 'plan' && group !== 'marker');
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

    ensureFloors(); // seed Basement + Upper around Ground on first AR entry
    allFloorsView = false; // every new session starts on the persisted active floor
    buildPlan();
    scene.add(planGroup);
    planGroup.visible = false;
    placed = false;
    anchor = null;
    planYaw = 0;
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
    view.onXRFrame = onXRFrame;
  });

  renderer.xr.addEventListener('sessionend', () => {
    view.onXRFrame = null;
    exiting = false; exitHoldStart = 0; exitProgress = 0; // reset exit gesture
    anchor = null;
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
  // of an undo — a domain-matched dim value panel, an edge, or an outlet.
  function onSqueezeStart(event) {
    if (!isControllerSource(event?.data)) return;
    if (event?.data?.handedness === 'left') return; // companion grip has no editing role
    const id = modes[currentMode].id;
    if (isDimMode(id) && !dimRefA && hoverDim) { gripDrag = { kind: 'dim', cId: hoverDim.userData.cId }; rlog('grip-drag dim', { id: hoverDim.userData.cId }); return; }
    if (id === 'edge' && hoverEdge) { gripDrag = { kind: 'edge', rectId: hoverEdge.rectId, edge: hoverEdge.edge }; rlog('grip-drag edge', hoverEdge); return; }
    if (id === 'marker' && hoverMarker && setControllerRay(event.data)) {
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
    if (id === 'marker_wire_edit' && selectedWire && hoverWaypointIndex != null) {
      const handle = wireHandleGroup.children.find((h) => h.userData.waypointIndex === hoverWaypointIndex);
      if (!handle) return;
      // Choose the move mode by REAL 3D proximity of the controller tip to the
      // waypoint: close enough → carry it directly in 3D; otherwise remote (floor
      // reticle drives X/Y, pad drives z).
      const tip = tipPosition(event.data);
      handle.getWorldPosition(_dp);
      const near = tip && tip.distanceTo(_dp) < WAYPOINT_GRAB_M;
      selectWaypoint(hoverWaypointIndex); // grabbing also selects (and opens the height pad)
      gripDrag = { kind: 'waypoint', index: hoverWaypointIndex, mode: near ? 'direct' : 'remote' };
      rlog('grip-drag waypoint', { index: hoverWaypointIndex, mode: gripDrag.mode });
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
      // A waypoint drag only touched the wire route: redraw its segments + handles,
      // and refresh the height pad since a direct 3D carry also changed z.
      if (gripDrag.kind === 'waypoint') { buildElectricalLinks(); buildWireHandles(); if (numpad.group.visible) refreshWaypointPad(); }
    }
    gripDrag = null;
  }

  // Grip button: context-sensitive deletion belongs to the active editing domain;
  // other modes only cancel an in-progress gesture (or do nothing).
  //  - PLAN: delete the selected zone.
  //  - MARKER EDIT: delete the selected marker (an aimed grip starts a drag instead).
  //  - MARKER LINK: clear the selected source switch without deleting links.
  //  - PLAN DIMS / OUTLET DIMS: cancel the last dimension pick, step by step.
  //  - EDGE: cancel a pending locked edge.
  //  - REGISTER / RECAL mid-gesture: back out the pending point/direction.
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
      if (dimRefA) { dimRefA = null; redrawNumpad(); rlog('dim A cancelled'); return; }
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
    if (mode.id === 'edit') { // PLAN domain: grip deletes only a selected zone
      if (!selectedRect) return;
      const id = selectedRect.id;
      project.removeRectangle(id);
      const si = surveyed.indexOf(id);
      if (si >= 0) surveyed.splice(si, 1);
      if (activeRect && activeRect.id === id) {
        activeRect = project.rectangles[project.rectangles.length - 1] || null;
      }
      selectedRect = null;
      updateRoomAreaHud();
      buildPlan();
      applyPlanMatrix();
      rlog('edit delete', { id });
      return;
    }
    if (mode.id === 'marker_link') {
      if (selectedLinkSwitch) rlog('link switch cleared', { id: selectedLinkSwitch.id });
      selectedLinkSwitch = null;
      return;
    }
    if (mode.id === 'marker_conduit') {
      // Grip lifts the pen (stops the current run) without deleting geometry;
      // node/segment deletion belongs to CONDUIT EDIT.
      if (penNodeId) { rlog('conduit pen lift', { node: penNodeId }); penNodeId = null; }
      return;
    }
    if (mode.id === 'marker_wire') {
      // Grip backs out one step: drop the last waypoint, else clear the start marker.
      if (wireWaypoints.length) { wireWaypoints.pop(); rlog('wire waypoint undo', { n: wireWaypoints.length }); return; }
      if (wireFromMarker) { rlog('wire from cleared', { id: wireFromMarker.id }); wireFromMarker = null; }
      return;
    }
    if (mode.id === 'marker_wire_edit') {
      // Grip away from a handle deletes the selected waypoint; with none selected it
      // deselects the wire. (A grip ON a handle became a drag and never reaches here.)
      if (selectedWire && selectedWaypointIndex != null) {
        project.removeWireWaypoint(selectedWire.id, selectedWaypointIndex);
        rlog('wire waypoint delete', { index: selectedWaypointIndex });
        selectWaypoint(null); // clears selection + closes the height pad
        buildElectricalLinks();
      } else if (selectedWire) {
        selectedWire = null; buildWireHandles(); deactivateNumpad();
        rlog('wire edit deselect (grip)');
      }
      return;
    }
    if (mode.id === 'marker' && selectedMarker) {
      deleteSelectedMarker();
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
      applyModeVisual(n === 0 ? t('mode.register') : n === 1 ? t('lbl.wall2') : t('lbl.perp'), C_ORIGIN);
      rlog('register undo', { remaining: n });
      return;
    }
    if (mode.id === 'recal' && (recalPts.length || recalLocked)) { // back out RECAL step by step
      if (recalPts.length) {
        recalPts.pop(); // undo a wall touch; corner stays selected
        applyModeVisual(recalPts.length === 0 ? t('lbl.wall1p1') : t('lbl.wall1p2'), C_RECAL);
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
  const btn = { next: false, prev: false, stick: false, stickY: false };
  // In-world exit: DOM "EXIT AR" isn't visible in the headset, so hold the
  // thumbstick DOWN (buttons[3]) for EXIT_HOLD_MS to end the session. A hold
  // (not a tap) so it can't collide with stick flicks or be hit by accident.
  const EXIT_HOLD_MS = 1200;
  let exitHoldStart = 0; // performance-time when the hold began (0 = not held)
  let exitProgress = 0;  // 0..1, for the HUD countdown
  let lastHudAt = -Infinity; // ms of the last debug-HUD redraw (throttled; see onXRFrame)
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
    // buttons[4]=A/X (prev mode), buttons[5]=B/Y (DIMS/TRANSLATE flip; does NOT cycle modes),
    // axes[2]=thumbstick x (cycle mode), axes[3]=thumbstick y (cycle the current
    // thing: LEVEL floor / UNIT display unit / LANG language / MARKER type / EDIT zone type).
    // Only the fixed RIGHT editor role is read; LEFT never changes modes.
    let next = false, prev = false, stickX = 0, stickY = 0, stickDown = false;
    const gp = editorSource(frame)?.gamepad;
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
    // Upper face button (B/Y) does NOT cycle modes — mode nav is thumbstick-x (both ways)
    // and A/X (prev). In DIMS, B/Y flips a completed dimension; in TRANSLATE it
    // flips the pending coordinate across the origin. Contextual "cycle the current
    // thing" actions live on thumbstick-y.
    if (next && !btn.next) {
      if (isDimMode(modes[currentMode].id) && dimRefA && dimRefB) swapDim();
      else if (modes[currentMode].id === 'translate' && translateEdge) pressTranslateKey('swap');
    }
    if (prev && !btn.prev) stepMode(-1);
    btn.next = next;
    btn.prev = prev;
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
      else if (modeId === 'drop') cycleZoneKind(stickY < 0 ? 1 : -1); // pick zone type
      else if (modeId === 'edit') cycleSelectedZoneKind(stickY < 0 ? 1 : -1);
      else if (modeId === 'export') cycleOutputFormat(stickY < 0 ? -1 : 1);
      btn.stickY = true;
    } else if (Math.abs(stickY) < 0.3) {
      btn.stickY = false;
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
    pollModeCycle(frame, time);
    const editCtl = editorSource(frame);
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
    updateLeftSheet(time, companionController);
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
      ? (wireFromMarker ? `${t('wire.trace')} · ${wireWaypoints.length}` : t('wire.pickStart'))
      : modes[currentMode].id === 'marker_wire_edit'
      ? (selectedWire ? `${t('wire.editPoints')} · ${selectedWire.route?.waypoints?.length || 0}` : t('wire.pickWire'))
      : modes[currentMode].id === 'marker_conduit'
      ? (penNodeId ? t('conduit.run') : t('conduit.pickStart'))
      : null;
    const translateStatus = modes[currentMode].id === 'translate' && !translateEdge
      ? t(translateTargets.x ? 'translate.pickY' : translateTargets.y ? 'translate.pickX' : 'translate.pickAny')
      : null;
    const exportStatus = modes[currentMode].id === 'export'
      ? `${t('export.format')} · ${getOutputSettings().format === 'coohom'
        ? 'COOHOM DXF' : getOutputSettings().format.toUpperCase()}` : null;
    const typeName = dropKind ? t(`mode.${dropKind}`) : editKind ? t(`mode.${editKind}`) : markerType ? t(`marker.${markerType}`) : null;
    const readoutText = typeName ? `${t('zone.type')} · ${typeName}` : translateStatus || linkStatus || wireStatus || exportStatus || hovDim;
    const readoutColor = dropKind ? zoneColor(dropKind) : editKind ? zoneColor(editKind) : markerType ? C_MARKER
      : wireStatus ? (modes[currentMode].id === 'marker_conduit' ? 0x22d3ee : 0xf59e0b)
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
    // redrawing the two 512x320 canvases + re-uploading their textures each frame is
    // pure waste for numbers no one reads that fast. The EXIT hold bar bypasses the
    // throttle so its countdown stays smooth. The worldToPlan calls that only feed the
    // HUD are inside the gate too, so they're skipped between refreshes.
    if (exitProgress > 0 || exitWasActive || time - lastHudAt >= 500) {
      lastHudAt = time;
      exitWasActive = exitProgress > 0;
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
        ...(exitProgress > 0 ? [`EXIT:   hold ${'█'.repeat(Math.round(exitProgress * 10)).padEnd(10, '·')}`] : []),
        `ptr:    ${ptr ? `${f2(ptr.px)}, ${f2(ptr.py)}, ${f2(ptrW.y - planPos.y)}` : '—'}`,
        `ret:    ${ret ? `${f2(ret.px)}, ${f2(ret.py)}` : '—'}`,
        ...(modeId === 'level' ? [`floor:  ${floorLabel()}`] : []),
        ...(modeId === 'edit' && roomAreaHud != null ? [`area:   ${roomAreaHud.toFixed(2)} m²`] : []),
        ...(edgeM != null ? [`edge:   ${fmt(edgeM)} ${unitLabel()}`] : []),
        ...(battery ? [`batt:   ${Math.round(battery.level * 100)}%${battery.charging ? ' (chg)' : ''}`] : []),
      ];
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
      if (visual.userData.markerRole.endsWith('-outline')) visual.visible = false;
    }
    const modeId = modes[currentMode].id;
    // Routes show in LINK (control links only), WIRE, and WIRE EDIT (as-built wires).
    // Per-child visibility is set by kind so each mode shows its lane.
    const wireMode = modeId === 'marker_wire' || modeId === 'marker_wire_edit';
    electricalGroup.visible = modeId === 'marker_link' || wireMode;
    if (electricalGroup.visible) {
      for (const line of electricalGroup.children) {
        // The live trace preview belongs to WIRE only; the marker_wire branch drives
        // its geometry/visibility, so keep it hidden everywhere else.
        if (line === wirePreviewLine) { line.visible = modeId === 'marker_wire'; continue; }
        line.visible = wireMode || line.userData.kind === 'control';
      }
    }
    // Waypoint handles belong to WIRE EDIT only.
    wireHandleGroup.visible = modeId === 'marker_wire_edit' && !!selectedWire;
    if (modeId === 'teleport') {
      // Dedicated locomotion target. Trigger brings the pointed plan coordinate
      // beneath the headset; no geometry or survey-registration state is edited.
      const hit = placed ? rayFloorHit(editCtl) : null;
      if (hit) {
        reticle.visible = true;
        reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
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
          reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
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
      // EDGE mode: ray a floor point, pick the edge segment the beam lands on across
      // ALL zones, ring the aim point. edgeAtPoint uses true segment distance + a
      // cap, so the highlight tracks the edge under your reticle (open floor = none).
      const hit = rayFloorHit(editCtl);
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
          reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
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
        // Reticle step badge only after the corner is selected: "1" while on wall 1
        // (0-1 touches), "2" once on wall 2. During SELECT the wall badges already lead.
        if (recalLocked && reticle.visible && c) {
          const step = recalPts.length === 2 ? 2 : 1;
          if (step !== prevRecalStep) { recalStep.setText(String(step), step === 2 ? C_WALL2 : C_WALL1); prevRecalStep = step; }
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
          reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          hoverFloorPt = { px, py }; // remember where the tip stands (for a new dim's default placement)
          if (gripDrag) applyGripDrag(px, py); // grip-drag the grabbed dim panel to the reticle
          // A value label takes priority before the first reference, but only when
          // its constraint belongs to the active dimension domain.
          hoverDim = dimRefA ? null : dimLabelAtPoint(px, py, modeId === 'outlet_dims');
          if (!hoverDim) {
            if (modeId === 'plan_dims') {
              // Pick the origin in PLAN space, not against the raw registered world
              // position. TELEPORT shifts planGroup with navOffset, so comparing to
              // planPos left the visible origin ring behind its stale hit target.
              if (Math.hypot(px, py) < 0.12) hoverRef = { kind: 'origin' };
              else { const e = edgeAtPoint(px, py); if (e) hoverRef = { kind: 'edge', rectId: e.rectId, edge: e.edge }; }
            } else if (!dimRefA) {
              const floorMarker = markerAtFloorPoint(px, py);
              if (floorMarker) hoverRef = { kind: 'marker', markerId: floorMarker.id };
            } else {
              const e = edgeAtPoint(px, py);
              if (e) hoverRef = { kind: 'edge', rectId: e.rectId, edge: e.edge };
            }
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
      const hit = rayFloorHit(source);
      if (hit) {
        const { px, py } = worldToPlan(hit);
        hoverStack = rectsAtPoint(px, py);
        reticle.visible = true;
        reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
      } else {
        reticle.visible = false;
        hoverStack = [];
      }
      if (selectedRect && !project.rectangles.includes(selectedRect)) selectedRect = null;
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
        reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
        const { px, py } = worldToPlan(hit);
        hoverMarker = linkMarkerAtFloorPoint(px, py);
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
      // As-built WIRE tracing: aim the floor reticle; any marker under it is the
      // hover endpoint (start, then finish). A live amber preview threads the chosen
      // start through the captured waypoints to the current tip until a second
      // marker commits the run. Committed wires are drawn per-segment by surface.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      const hit = rayFloorHit(source);
      hoverMarker = null;
      if (hit) {
        reticle.visible = true;
        reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
        const { px, py } = worldToPlan(hit);
        hoverMarker = markerAtFloorPoint(px, py);
      } else {
        reticle.visible = false;
      }
      if (wireFromMarker && !project.markers.includes(wireFromMarker)) {
        wireFromMarker = null; wireWaypoints = [];
      }
      if (!wirePreviewLine) {
        wirePreviewLine = makeRouteLine([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], 0xf59e0b);
        wirePreviewLine.frustumCulled = false; // its vertices are rewritten every frame
        wirePreviewLine.renderOrder = 15;
        electricalGroup.add(wirePreviewLine);
      }
      if (wireFromMarker) {
        const pts = [{ x: wireFromMarker.x, y: wireFromMarker.y, z: wireFromMarker.z || 0 }, ...wireWaypoints];
        const tipW = tipPosition(source);
        if (tipW) {
          const { px, py } = worldToPlan(tipW);
          pts.push({ x: px, y: py, z: Math.max(0, tipW.y - overlayY()) });
        }
        wirePreviewLine.visible = pts.length >= 2;
        if (wirePreviewLine.visible) {
          wirePreviewLine.geometry.setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.z, -p.y)));
          wirePreviewLine.computeLineDistances();
        }
      } else {
        wirePreviewLine.visible = false;
      }
      outlineMarker(hoverMarker, 'floor', 0xffe14d);
      outlineMarker(hoverMarker, 'wall', 0xffe14d);
      outlineMarker(wireFromMarker, 'floor', 0xf59e0b);
      outlineMarker(wireFromMarker, 'wall', 0xf59e0b);
    } else if (modeId === 'marker_wire_edit') {
      // WIRE EDIT: aim the floor reticle. A waypoint handle of the selected wire wins
      // over the wire body; otherwise pick a wire for selection. Handles recolor by
      // selection state; a live drag is applied here so the wire follows the hand.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      if (selectedWire && !project.electricalLinks.includes(selectedWire)) {
        selectedWire = null; selectWaypoint(null);
      }
      // When a waypoint's height pad is open and under the ray, it owns the pointer
      // (type z); otherwise the floor reticle picks wires/handles.
      if (selectedWaypoint() && numpad.group.visible) {
        const panelHit = rayPanelHit(source);
        if (panelHit) {
          hoverKey = numpad.keyAt(panelHit.uv.x, panelHit.uv.y);
          numpadCursor.position.copy(panelHit.point);
          numpadCursor.visible = true;
        }
      }
      if (gripDrag?.kind === 'waypoint') applyWaypointGripDrag(source);
      hoverWire = null; hoverWaypointIndex = null;
      if (hoverKey) {
        reticle.visible = false; // the pad owns the ray this frame
      } else {
        const hit = rayFloorHit(source);
        if (hit) {
          reticle.visible = true;
          reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          // A waypoint handle wins over the wire body; only look for a wire when the
          // reticle is not on a handle of the already-selected wire.
          if (selectedWire) hoverWaypointIndex = waypointHandleAtFloorPoint(selectedWire, px, py);
          if (hoverWaypointIndex == null) hoverWire = wireAtFloorPoint(px, py);
        } else {
          reticle.visible = false;
        }
      }
      if (selectedWaypoint() && hoverKey !== prevHoverKey) { redrawWaypointPad(); prevHoverKey = hoverKey; }
      // Recolor handles: selected amber, hovered yellow, rest white.
      for (const handle of wireHandleGroup.children) {
        const i = handle.userData.waypointIndex;
        const color = i === selectedWaypointIndex ? 0xfbbf24 : i === hoverWaypointIndex ? 0xffe14d : 0xffffff;
        handle.material.color.setHex(color);
        handle.scale.setScalar(i === hoverWaypointIndex || i === selectedWaypointIndex ? 1.5 : 1);
      }
      // Brighten the wire under consideration (hovered for select, or the selected one).
      for (const line of electricalGroup.children) {
        if (line.userData.kind !== 'wire') continue;
        const active = line.userData.electricalLinkId === (hoverWire?.id || selectedWire?.id);
        line.material.opacity = active ? 1 : 0.5;
      }
    } else if (modeId === 'marker_conduit') {
      // CONDUIT authoring: aim the floor reticle. A conduit node under it wins over a
      // device marker (both are valid pen targets). The pen node is amber, hover yellow;
      // a live preview runs from the pen node to the tip.
      hoverKey = null;
      numpadCursor.visible = false;
      const source = editCtl;
      if (penNodeId && !project.conduitNodes.some((n) => n.id === penNodeId)) penNodeId = null;
      hoverConduitNode = null; hoverMarker = null;
      const hit = rayFloorHit(source);
      if (hit) {
        reticle.visible = true;
        reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
        const { px, py } = worldToPlan(hit);
        hoverConduitNode = conduitNodeAtFloorPoint(px, py);
        if (!hoverConduitNode) hoverMarker = markerAtFloorPoint(px, py);
      } else {
        reticle.visible = false;
      }
      // Recolor node spheres: pen amber, hovered yellow, else by kind.
      for (const child of conduitGroup.children) {
        const id = child.userData.conduitNodeId;
        if (!id || child === conduitPreviewLine) continue;
        const node = project.conduitNodes.find((n) => n.id === id);
        const color = id === penNodeId ? 0xfbbf24 : id === hoverConduitNode?.id ? 0xffe14d
          : node?.markerId ? 0x94a3b8 : 0xffffff;
        child.material.color.setHex(color);
        child.scale.setScalar(id === penNodeId || id === hoverConduitNode?.id ? 1.5 : 1);
      }
      outlineMarker(hoverMarker, 'floor', 0xffe14d);
      outlineMarker(hoverMarker, 'wall', 0xffe14d);
      // Pen preview: pen node → current tip.
      if (!conduitPreviewLine) {
        conduitPreviewLine = makeRouteLine([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], 0x22d3ee);
        conduitPreviewLine.frustumCulled = false;
        conduitPreviewLine.renderOrder = 15;
        conduitGroup.add(conduitPreviewLine);
      }
      const penNode = penNodeId && project.conduitNodes.find((n) => n.id === penNodeId);
      const tipW = tipPosition(source);
      if (penNode && tipW) {
        const from = conduitNodePos(project.activeFloor, penNode);
        const { px, py } = worldToPlan(tipW);
        const to = { x: px, y: py, z: Math.max(0, tipW.y - overlayY()) };
        conduitPreviewLine.visible = true;
        conduitPreviewLine.geometry.setFromPoints([from, to].map((p) => new THREE.Vector3(p.x, p.z, -p.y)));
        conduitPreviewLine.computeLineDistances();
      } else {
        conduitPreviewLine.visible = false;
      }
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
          reticle.position.set(hit.x, overlayY() + 0.002, hit.z);
          const { px, py } = worldToPlan(hit);
          hoverMarker = editMarkerAtFloorPoint(px, py);
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
