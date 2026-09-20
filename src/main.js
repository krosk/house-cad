import './style.css';
import { Project, Rectangle } from './core/model.js';
import { computeFootprint } from './core/geometry2d.js';
import { extrudeFootprint, mergeFloorGeometries } from './core/extrude.js';
import { Sketch2D } from './ui/sketch2d.js';
import { View3D } from './ui/view3d.js';
import { setupMR } from './ui/mr.js';
import { installRemoteLog } from './ui/remoteLog.js';

installRemoteLog(); // dev-only: mirror console/errors to the dev server for headset debugging
import {
  FLOOR_CLIPBOARD_KEY, createFloorClipboard, pasteFloorClipboard,
  serializeProject, deserializeInto,
} from './io/serialize.js';
import { buildShareUrl, decodeViewFromHash, loadView } from './io/shareView.js';
import { exportSTL, exportOBJ, exportGLTF } from './io/exportMesh.js';
import { floorToSvg, floorToPngBlob, floorsToSharedScaleSvgs, sharedScaleSheetOptions } from './io/planSheet.js';
import { floorToDxf, floorToCoohomDxf } from './io/dxf.js';
import { diffAgainstSnapshot } from './core/planDiff.js';
import { getUnit, setUnit, onUnitChange, toMeters, fmt, unitLabel, unitInfo } from './core/units.js';
import { ZONE_KINDS, isAperture } from './core/zoneColors.js';
import { t, localizedFloorName, revLabels, getLang, LANGS, LANG_ORDER } from './core/i18n.js';

const project = new Project();

// True when this session was opened from a shared #view= link: the plan is
// read-only. Declared early because renderConstraints() reads it during init.
let viewMode = false;

const sketch = new Sketch2D(document.getElementById('sketch'), project);
const view = new View3D(document.getElementById('view3d'));

// Desktop presentation: switch the main surface between the plan editor and the
// existing interactive Three.js renderer. Shared #view= links open in 3D by
// default, but the viewer can return to the plan to take measurements.
const app = document.getElementById('app');
const view3dHolder = document.getElementById('view3d-holder');
const view3dToggle = document.getElementById('view3d-toggle');
const view3dFloorList = document.getElementById('view3d-floor-list');
let selected3DFloorId = null;

function render3DFloorList() {
  if (selected3DFloorId && !project.floors.some((f) => f.id === selected3DFloorId)) {
    selected3DFloorId = null;
  }
  view3dFloorList.replaceChildren();
  const addButton = (label, floorId, elevation = null) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.toggle('active', selected3DFloorId === floorId);
    const name = document.createElement('span');
    name.textContent = label;
    button.appendChild(name);
    if (elevation != null) {
      const elev = document.createElement('span');
      elev.className = 'view3d-floor-elev';
      elev.textContent = `${elevation >= 0 ? '+' : ''}${fmt(elevation)} ${unitLabel()}`;
      button.appendChild(elev);
    }
    button.addEventListener('click', () => {
      selected3DFloorId = floorId;
      view.setFloorFilter(floorId);
      render3DFloorList();
    });
    view3dFloorList.appendChild(button);
  };
  addButton('All floors', null);
  for (const floor of [...project.floors].reverse()) {
    addButton(localizedFloorName(floor.name), floor.id, floor.elevation);
  }
}

function setDesktop3D(visible) {
  app.classList.toggle('show-3d', visible);
  view3dHolder.setAttribute('aria-hidden', String(!visible));
  view3dToggle.classList.toggle('active', visible);
  view3dToggle.textContent = visible ? '▦ View plan' : '◈ View 3D';
  view3dToggle.title = visible ? 'Return to the floor plan' : 'Open the interactive 3D model';
  if (visible) {
    // Wait for the formerly parked holder to receive its on-screen dimensions;
    // ResizeObserver updates the renderer and frameModel recenters the orbit.
    render3DFloorList();
    requestAnimationFrame(() => {
      view.setFloorFilter(selected3DFloorId);
      view.frameModel();
    });
  }
}
view3dToggle.addEventListener('click', () => setDesktop3D(!app.classList.contains('show-3d')));

// Mixed-reality entry point (Quest 3). Adds an "Enter MR" button only where
// immersive-ar is supported; no effect on the desktop app otherwise. MR renders
// the flat floor plan, so it needs the current footprint on demand.
setupMR(view, project, (rectangles = project.rectangles) => computeFootprint(rectangles));

// Rebuild the 3D model whenever the plan changes. Each floor extrudes
// independently and stacks at its elevation; export merges the whole stack.
let firstBuild = true;
let currentGeometry = null; // merged mesh of all floors, kept for export
function rebuild() {
  const floorGeos = project.floors.map((f) => ({
    geometry: extrudeFootprint(computeFootprint(f.rectangles), f.height),
    elevation: f.elevation,
    floorId: f.id,
    name: f.name,
  }));
  view.setGeometry(floorGeos);
  view.setFloorFilter(selected3DFloorId);
  render3DFloorList();
  currentGeometry = mergeFloorGeometries(floorGeos);
  if (firstBuild && floorGeos.some((g) => g.geometry)) {
    view.frameModel();
    firstBuild = false;
  }
}
project.onChange(rebuild);

// ---- toolbar wiring ----
const toolButtons = [...document.querySelectorAll('#tool-group button')];
const hint = document.getElementById('hint');
const HINTS = {
  add: 'Drag on the grid to draw a rectangle that ADDS matter.',
  subtract: 'Drag to draw a rectangle that REMOVES matter (cut-out).',
  dimension: 'Click one edge, then another (same axis) to lock the distance.',
  select: 'Drag rectangles to move, dimension labels to reposition (double-click a label to auto-place). Del to delete.',
  pan: 'Drag anywhere to pan. Pinch or use +/− to zoom.',
};
function setTool(tool) {
  sketch.setTool(tool);
  toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  hint.textContent = HINTS[tool];
}
toolButtons.forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
setTool('add');

// Transient status messages from the sketch (e.g. dimension feedback).
let statusTimer = null;
sketch.onStatus = (msg) => {
  hint.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    hint.textContent = HINTS[sketch.tool];
  }, 2500);
};

// ---- on-screen zoom buttons (touch / Quest controller) ----
document.getElementById('zoom-in').addEventListener('click', () => sketch.zoomBy(1.2));
document.getElementById('zoom-out').addEventListener('click', () => sketch.zoomBy(1 / 1.2));

// ---- constraints panel (live list of dimensions) ----
const cxList = document.getElementById('cx-list');
const cxRows = new Map(); // id -> { row, input, tag }
const EDGE_SHORT = { left: 'L', right: 'R', top: 'T', bottom: 'B' };

const cxCount = document.getElementById('cx-count');

function renderConstraints() {
  // Marker pins and conduit-node pins (a/b endpoint is a marker/node, not a rect edge)
  // are AR-only annotations; they don't belong in the 2D dimension list.
  const cs = project.constraints.filter((c) => !(c.a.marker || c.b.marker || c.a.node || c.b.node));
  cxCount.textContent = cs.length ? String(cs.length) : '';

  // Remove rows for deleted constraints.
  for (const [id, entry] of cxRows) {
    if (!cs.find((c) => c.id === id)) {
      entry.row.remove();
      cxRows.delete(id);
    }
  }

  // Empty-state placeholder.
  let empty = cxList.querySelector('.cx-empty');
  if (cs.length === 0 && !empty) {
    empty = document.createElement('div');
    empty.className = 'cx-empty';
    empty.textContent = 'No dimensions yet. Use 📏 to constrain edge distances.';
    cxList.appendChild(empty);
  } else if (cs.length > 0 && empty) {
    empty.remove();
  }

  for (const c of cs) {
    let entry = cxRows.get(c.id);
    if (!entry) {
      const row = document.createElement('div');
      row.className = 'cx-row';
      const tag = document.createElement('span');
      tag.className = 'cx-tag';
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.min = '0';
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = unitLabel();
      const swap = document.createElement('button');
      swap.className = 'cx-swap';
      swap.textContent = '⇄';
      swap.title = 'Reverse direction (swap which edge anchors)';
      const del = document.createElement('button');
      del.className = 'cx-del';
      del.textContent = '🗑';
      del.title = 'Delete dimension';
      row.append(tag, input, unit, swap, del);
      cxList.appendChild(row);

      // In a view-only session a dimension is a MEASUREMENT of the fixed plan:
      // the value/direction can't change (that would reshape geometry), only
      // adding and deleting are allowed.
      if (viewMode) {
        input.readOnly = true;
        swap.disabled = true;
      } else {
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          if (!Number.isNaN(v)) project.setConstraintMagnitude(c.id, toMeters(v));
        });
        swap.addEventListener('click', () => project.swapConstraint(c.id));
      }
      del.addEventListener('click', () => project.removeConstraint(c.id));

      entry = { row, input, unit, tag };
      cxRows.set(c.id, entry);
    }

    const icon = c.axis === 'x' ? '↔' : '↕';
    entry.tag.textContent = `${icon} ${EDGE_SHORT[c.a.edge]}→${EDGE_SHORT[c.b.edge]}`;
    entry.unit.textContent = unitLabel();
    entry.input.step = String(unitInfo().snap * unitInfo().perMeter);
    // Don't clobber the field the user is actively typing in.
    if (document.activeElement !== entry.input) {
      entry.input.value = fmt(Math.abs(c.value));
    }
    entry.row.classList.toggle('conflict', !!c.conflict);
    entry.input.title = c.conflict ? 'Conflicts with other dimensions' : '';
  }
}
project.onChange(renderConstraints);

// Clicking a dimension in the canvas focuses its panel field.
sketch.onPickConstraint = (id) => {
  const entry = cxRows.get(id);
  if (!entry) return;
  entry.input.focus();
  entry.input.select();
  entry.row.classList.add('flash');
  setTimeout(() => entry.row.classList.remove('flash'), 600);
};

// ---- properties panel (selected rectangle) ----
const propsPanel = document.getElementById('props');
const pX = document.getElementById('p-x');
const pY = document.getElementById('p-y');
const pOp = document.getElementById('p-op');
const pDel = document.getElementById('p-del');
const pRot = document.getElementById('p-rot');
const pApertureRow = document.getElementById('p-aperture-row');
let selectedRect = null;

function updateProps() {
  if (!selectedRect) return;
  // Selection may have been deleted out from under us.
  if (!project.rectangles.includes(selectedRect)) {
    selectedRect = null;
    propsPanel.hidden = true;
    return;
  }
  const r = selectedRect;
  const b = r.bounds;
  const set = (el, meters) => {
    el.step = String(unitInfo().snap * unitInfo().perMeter);
    if (document.activeElement !== el) el.value = fmt(meters);
  };
  set(pX, b.x0);
  set(pY, b.y0);
  const kindLabel = {
    room: '➕ Room', wall: '➖ Wall', insulation: '▧ Insulation', door: '🚪 Door', halfwall: '🧱 Half wall', heater: '♨ Heater', sliding: '↔ Sliding door', window: '🪟 Window', stairs: '🪜 Stairs', cabinet: '🗄 Cabinet', furniture: '🛋 Furniture',
  };
  pOp.textContent = kindLabel[r.kind] ?? (r.op === 'add' ? kindLabel.room : kindLabel.wall);
  pOp.className = `op-toggle ${r.op}`;
  // Rotate control: only apertures have an orientation. Show the current state so
  // it's clear what each click changes (door: hinge·swing, window: hinge side).
  const aperture = isAperture(r.kind) && r.hinge != null;
  pApertureRow.hidden = !aperture;
  if (aperture) {
    const state = (r.kind === 'door' || r.kind === 'sliding') ? `${r.hinge} · ${r.swing}` : r.hinge;
    pRot.textContent = `↻ Rotate (${state})`;
  }
}

sketch.onSelect = (rect) => {
  selectedRect = rect;
  propsPanel.hidden = !rect;
  updateProps();
};
project.onChange(updateProps);

pX.addEventListener('input', () => { const v = parseFloat(pX.value); if (selectedRect && !Number.isNaN(v)) { selectedRect.x = toMeters(v); project.touch(); } });
pY.addEventListener('input', () => { const v = parseFloat(pY.value); if (selectedRect && !Number.isNaN(v)) { selectedRect.y = toMeters(v); project.touch(); } });
pOp.addEventListener('click', () => {
  if (!selectedRect) return;
  const current = ZONE_KINDS.includes(selectedRect.kind)
    ? selectedRect.kind : (selectedRect.op === 'subtract' ? 'wall' : 'room');
  selectedRect.setKind(ZONE_KINDS[(ZONE_KINDS.indexOf(current) + 1) % ZONE_KINDS.length]);
  project.touch();
});
pRot.addEventListener('click', () => {
  if (selectedRect?.rotateAperture(1)) project.touch();
});
pDel.addEventListener('click', () => sketch.deleteSelected());

const heightInput = document.getElementById('height');
heightInput.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  if (!Number.isNaN(v)) project.setHeight(toMeters(v));
});
function setHeightInput() {
  heightInput.step = String(unitInfo().snap * unitInfo().perMeter);
  if (document.activeElement !== heightInput) heightInput.value = fmt(project.height);
}
project.onChange(setHeightInput);

// ---- floor switcher (storeys) ----
// Each floor is an independent plan sharing the same origin corner; editing
// acts on the active floor. Rows list the highest storey first.
const fcList = document.getElementById('fc-list');
function renderFloors() {
  fcList.innerHTML = '';
  const floors = project.floors;
  for (let i = floors.length - 1; i >= 0; i--) {
    const f = floors[i];
    const row = document.createElement('div');
    row.className = 'fc-row' + (f.id === project.activeFloorId ? ' active' : '');
    row.title = 'Click to edit this floor · double-click the name to rename';

    const name = document.createElement('span');
    name.className = 'fc-name';
    name.textContent = f.name;

    const elev = document.createElement('span');
    elev.className = 'fc-elev';
    elev.textContent = `${fmt(f.elevation)} ${unitLabel()}`;

    const ground = document.createElement('button');
    ground.className = 'fc-ground' + (f.id === project.groundFloorId ? ' on' : '');
    ground.textContent = '⌂';
    ground.title = f.id === project.groundFloorId
      ? 'Ground floor (elevation datum)' : 'Set as ground floor';

    const del = document.createElement('button');
    del.className = 'fc-del';
    del.textContent = '✕';
    del.title = 'Remove floor';
    if (floors.length <= 1) del.style.visibility = 'hidden';

    row.append(name, elev, ground, del);
    fcList.appendChild(row);

    row.addEventListener('click', () => {
      if (f.id !== project.activeFloorId) {
        project.setActiveFloor(f.id);
        sketch.clearSelection();
      }
    });
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const nn = prompt('Floor name', f.name);
      if (nn != null && nn.trim()) project.renameFloor(f.id, nn.trim());
    });
    ground.addEventListener('click', (e) => {
      e.stopPropagation();
      project.setGroundFloor(f.id);
    });
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (floors.length <= 1) return;
      const n = f.rectangles.length;
      if (n && !confirm(`Remove floor "${f.name}" and its ${n} rectangle(s)?`)) return;
      project.removeFloor(f.id);
    });
  }
}
project.onChange(renderFloors);
renderFloors();

document.getElementById('fc-add-above').addEventListener('click', () => {
  project.addFloor({ above: true, name: 'Floor' });
  sketch.clearSelection();
});
document.getElementById('fc-add-below').addEventListener('click', () => {
  project.addFloor({ above: false, name: 'Basement' });
  sketch.clearSelection();
});

let desktopFloorClipboard = null;
try {
  const raw = localStorage.getItem(FLOOR_CLIPBOARD_KEY);
  if (raw) desktopFloorClipboard = JSON.parse(raw);
} catch { /* an in-memory copy still works */ }

document.getElementById('fc-copy').addEventListener('click', () => {
  desktopFloorClipboard = createFloorClipboard(project, project.activeFloor);
  try {
    localStorage.setItem(FLOOR_CLIPBOARD_KEY, JSON.stringify(desktopFloorClipboard));
  } catch { /* the current-page clipboard still works */ }
  sketch.onStatus?.(`Copied floor "${project.activeFloor.name}". Load another project, then paste.`);
});

document.getElementById('fc-paste').addEventListener('click', () => {
  try {
    // Refresh in case the clipboard was written from AR after this page initialized.
    try {
      const raw = localStorage.getItem(FLOOR_CLIPBOARD_KEY);
      if (raw) desktopFloorClipboard = JSON.parse(raw);
    } catch { /* keep the in-memory clipboard */ }
    if (!desktopFloorClipboard) { sketch.onStatus?.('Nothing copied yet.'); return; }
    const target = project.activeFloor;
    const occupied = target.rectangles.length || target.constraints.length || target.markers.length || target.electricalLinks.length;
    if (occupied && !confirm(`Replace all plan content on "${target.name}" with the copied floor?`)) return;
    const floor = pasteFloorClipboard(project, desktopFloorClipboard, { targetId: target.id });
    sketch.clearSelection();
    view.frameModel();
    sketch.onStatus?.(`Replaced the plan on "${floor.name}" from the floor clipboard.`);
  } catch (err) {
    alert(`Could not paste the floor:\n${err.message}`);
  }
});

document.getElementById('delete').addEventListener('click', () => sketch.deleteSelected());
document.getElementById('clear').addEventListener('click', () => {
  const hasContent = project.rectangles.length || project.constraints.length
    || project.markers.length || project.electricalLinks.length;
  if (hasContent
    && confirm(`Remove all authored content on "${project.activeFloor.name}"?`)) project.clear();
});

// ---- collapsible dimensions panel ----
(() => {
  const panel = document.getElementById('constraints');
  const toggle = document.getElementById('cx-toggle');
  const KEY = 'house-cad:cx-collapsed';
  const apply = (collapsed) => {
    panel.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
  };
  apply(localStorage.getItem(KEY) === '1');
  toggle.addEventListener('click', () => {
    const collapsed = !panel.classList.contains('collapsed');
    apply(collapsed);
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  });
})();

// ---- unit selector (m / cm / mm) ----
const unitSelect = document.getElementById('unit');
unitSelect.value = getUnit();
unitSelect.addEventListener('change', () => setUnit(unitSelect.value));
const syncUnitUI = () => {
  // Update every visible unit label and re-render all numeric fields.
  unitSelect.value = getUnit(); // AR can change the same global preference
  for (const el of document.querySelectorAll('.unit-label')) el.textContent = unitLabel();
  sketch.snapStep = unitInfo().snap;
  setHeightInput();
  updateProps();
  renderConstraints();
  render3DFloorList();
  sketch.render();
};
onUnitChange(syncUnitUI);
syncUnitUI(); // apply a preference restored from an earlier desktop/AR session

// ---- resizable splitter ----
(() => {
  const splitter = document.getElementById('splitter');
  if (!splitter) return; // 3D pane removed — no splitter to wire up
  const left = document.getElementById('pane-2d');
  const panes = document.getElementById('panes');
  let dragging = false;
  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    splitter.setPointerCapture(e.pointerId);
  });
  splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = panes.getBoundingClientRect();
    const frac = Math.min(0.85, Math.max(0.15, (e.clientX - rect.left) / rect.width));
    left.style.flex = `0 0 ${frac * 100}%`;
  });
  splitter.addEventListener('pointerup', (e) => {
    dragging = false;
    splitter.releasePointerCapture(e.pointerId);
  });
})();

// ---- save / load ----
function download(filename, data, mime = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById('save').addEventListener('click', () => {
  const rev = project.bumpRevision(); // deliberate save → advance the revision
  const data = JSON.stringify(serializeProject(project), null, 2);
  // Mirror to autosave right away so the new revision survives a reload without an
  // intervening edit (autosave only re-runs on project changes, which a save is not).
  try { localStorage.setItem(LS_KEY, data); } catch { /* storage unavailable — ignore */ }
  download('house.json', data);
  sketch.onStatus?.(`Saved house.json (rev ${rev})`);
});

// Copy a view-only 3D link: solved geometry in the URL fragment, no server, not editable.
// Massing only by default so the link stays short (QR-able); markers are opt-in.
document.getElementById('share-view').addEventListener('click', async () => {
  try {
    const url = await buildShareUrl(project, { markers: false });
    let copied = false;
    try { await navigator.clipboard?.writeText(url); copied = true; } catch { /* clipboard blocked */ }
    const kb = (new Blob([url]).size / 1024).toFixed(1);
    sketch.onStatus?.(copied
      ? `Copied a view-only 3D link (${kb} KB). Paste to share — it's not editable.`
      : `View link ready (${kb} KB) — copy failed; see console.`);
    if (!copied) console.log('Share view URL:\n' + url);
  } catch (err) {
    alert(`Could not build a share link:\n${err.message}`);
  }
});

const fileInput = document.getElementById('file-input');
document.getElementById('load').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    deserializeInto(project, data);
    sketch.clearSelection();
    view.frameModel();
    sketch.onStatus?.(`Loaded ${file.name}`);
  } catch (err) {
    alert(`Could not load file:\n${err.message}`);
  } finally {
    fileInput.value = ''; // allow re-loading the same file
  }
});

// ---- mesh export (STL / OBJ / glTF) ----
(() => {
  const btn = document.getElementById('export-btn');
  const pop = document.getElementById('export-pop');
  const close = () => { pop.hidden = true; };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
  });
  pop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close); // click-outside dismisses

  const EXPORTERS = {
    stl: () => exportSTL(currentGeometry, 'house.stl'),
    obj: () => exportOBJ(currentGeometry, 'house.obj'),
    glb: () => exportGLTF(currentGeometry, 'house.glb'),
  };

  pop.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', async () => {
      close();
      if (!currentGeometry) {
        sketch.onStatus?.('Nothing to export — the model is empty.');
        return;
      }
      const fmt = b.dataset.fmt;
      try {
        await EXPORTERS[fmt]();
        sketch.onStatus?.(`Exported house.${fmt}`);
      } catch (err) {
        alert(`Export failed:\n${err.message}`);
      }
    });
  });
})();

// ---- print / SVG plan sheets ----
// A to-scale floor-plan sheet per floor, drawn from the model (src/io/planSheet.js).
// "Print all floors" opens a hidden iframe holding every floor's SVG (one per page)
// at a shared, maximized scale, then invokes the browser print dialog → Save as PDF.
// SVG saves the active floor as a vector sheet; PNG rasterizes that same sheet at
// high resolution. DXF saves authored CAD geometry at 1:1 in millimeters. Vector
// sheets are in real mm; print SVG/PDF at 100% for true scale.
function safeName(s) {
  return (s || 'floor').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'floor';
}

function sheetDownloadName(floor, extension, now = new Date()) {
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`;
  const rev = project.revision > 0 ? `-r${project.revision}` : ''; // omit for a never-saved project
  return `plan-${safeName(floor.name)}${rev}-${stamp}.${extension}`;
}

// Sheet text follows an explicitly chosen language (the Print menu's "Language"
// picker), independent of the app UI language. Defaults to the current UI language.
const localizedSheetOptions = (lang = getLang()) => ({
  project, // whole-house conduit network + wires (they span floors); sheets filter per floor
  floorLabel: (name) => localizedFloorName(name, lang),
  generatedLabel: t('sheet.generated', lang),
  buildLabel: t('sheet.build', lang),
  markerLabel: (ty) => t(`marker.${ty}`, lang),
  markerLegendNote: (ty) => (ty === 'outlet_aircon' ? t('marker.dedicatedCircuit', lang) : ''),
  zoneLabel: (kind) => t(`mode.${kind}`, lang),
  revLabels: revLabels(lang),
  revision: project.revision, // saved-revision number, stamped on the sheet strip
  revisionLabel: t('sheet.revision', lang),
});

function printSheets(svgs) {
  // Every SVG in a shared print set has the same physical page dimensions. Feed
  // those dimensions to @page so the browser does not silently rotate/scale a
  // landscape set back onto its default portrait paper.
  const size = svgs[0]?.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
  const pageSize = size ? `${size[1]}mm ${size[2]}mm` : 'auto';
  const sheetSize = size ? `width:${size[1]}mm;height:${size[2]}mm;` : '';
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>House CAD — plan</title>'
    + `<style>@page{size:${pageSize};margin:0}html,body{margin:0;padding:0}`
    + `.sheet{${sheetSize}overflow:hidden;break-inside:avoid;page-break-inside:avoid;break-after:page;page-break-after:always}`
    + '.sheet:last-child{break-after:auto;page-break-after:auto}'
    + 'svg{display:block;width:100%;height:100%}</style></head><body>'
    + svgs.map((s) => `<div class="sheet">${s}</div>`).join('')
    + '</body></html>';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    win.addEventListener('afterprint', cleanup, { once: true });
    try { win.focus(); win.print(); } catch { cleanup(); }
    setTimeout(cleanup, 60000); // safety net if afterprint never fires
  };
  iframe.srcdoc = html;
}

(() => {
  const btn = document.getElementById('print-btn');
  const pop = document.getElementById('print-pop');
  const baselineSel = document.getElementById('print-baseline');
  const langSel = document.getElementById('print-lang');
  const close = () => { pop.hidden = true; };

  // Export-sheet language picker: one option per supported language, defaulting to
  // the current UI language. The choice is read per export (sheetLang), so it never
  // changes the app UI language — only the text baked into the printed/exported sheet.
  for (const l of LANG_ORDER) {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = LANGS[l]?.label ?? l;
    langSel.appendChild(opt);
  }
  langSel.value = getLang();
  const sheetLang = () => langSel.value || getLang();

  // The 6 AR save slots (house-cad:slot:0..5) double as change-map baselines. Read
  // one as {savedAt, data} | null (bad/absent/foreign JSON -> null).
  const SLOT_COUNT = 6;
  const readSlot = (i) => {
    try {
      const o = JSON.parse(localStorage.getItem(`house-cad:slot:${i}`));
      return o && o.data && Array.isArray(o.data.floors) ? o : null;
    } catch { return null; }
  };

  // Rebuild the baseline dropdown from the slots present now, preserving the
  // current selection when it still exists.
  const refreshBaselines = () => {
    const prev = baselineSel.value;
    baselineSel.innerHTML = '<option value="">No comparison</option>';
    let any = false;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const o = readSlot(i);
      if (!o) continue;
      any = true;
      const rects = o.data.floors.reduce((n, f) => n + (f.rectangles?.length || 0), 0);
      const when = o.savedAt ? new Date(o.savedAt).toLocaleString() : 'saved';
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `Slot ${i + 1} — ${when} (${rects})`;
      baselineSel.appendChild(opt);
    }
    baselineSel.value = readSlot(Number(prev)) ? prev : '';
    document.getElementById('print-baseline-row').style.display = any ? '' : 'none';
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    if (!pop.hidden) refreshBaselines();
  });
  pop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);

  const anyGeometry = () => project.floors.some((f) => f.rectangles.length > 0);

  // The selected baseline slot's per-floor diff Map (floorId -> diff), or null for
  // no comparison / an unreadable slot. Plan sheets (Print/SVG/PNG) read this;
  // CAD exports (DXF/Coohom) ignore it.
  const currentChangeMap = () => {
    const sel = baselineSel.value;
    if (sel === '') return null;
    const o = readSlot(Number(sel));
    if (!o) return null;
    try { return diffAgainstSnapshot(project, o.data); }
    catch (err) { sketch.onStatus?.(`Change map skipped: ${err.message}`); return null; }
  };

  pop.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', async () => {
      close();
      if (!anyGeometry()) { sketch.onStatus?.('Nothing to print — the plan is empty.'); return; }
      try {
        // Plan sheets carry the change map when a baseline slot is chosen; the CAD
        // (DXF/Coohom) exports never do. Computed once so a print set is consistent.
        const changeMap = currentChangeMap();
        if (b.dataset.print === 'svg') {
          const f = project.activeFloor;
          // A single-floor export uses the exact project-wide print transform so
          // it can be superposed with a page from Print All without rescaling.
          const sheetOpts = { ...sharedScaleSheetOptions(project.floors, localizedSheetOptions(sheetLang())), changeMap };
          const name = sheetDownloadName(f, 'svg');
          download(name, floorToSvg(f, sheetOpts), 'image/svg+xml');
          sketch.onStatus?.(`Downloaded ${name}${changeMap ? ' — with change map' : ''}`);
        } else if (b.dataset.print === 'png') {
          const f = project.activeFloor;
          const sheetOpts = { ...sharedScaleSheetOptions(project.floors, localizedSheetOptions(sheetLang())), changeMap };
          const blob = await floorToPngBlob(f, sheetOpts);
          const name = sheetDownloadName(f, 'png');
          download(name, blob, 'image/png');
          sketch.onStatus?.(`Downloaded ${name}${changeMap ? ' — with change map' : ''}`);
        } else if (b.dataset.print === 'dxf') {
          const f = project.activeFloor;
          const name = sheetDownloadName(f, 'dxf');
          download(name, floorToDxf(project, f), 'application/dxf');
          sketch.onStatus?.(`Downloaded ${name} — millimeters, 1:1 CAD scale.`);
        } else if (b.dataset.print === 'coohom') {
          const f = project.activeFloor;
          const name = sheetDownloadName(f, 'coohom.dxf');
          download(name, floorToCoohomDxf(f), 'application/dxf');
          sketch.onStatus?.(`Downloaded ${name} — simplified Coohom recognition geometry.`);
        } else {
          printSheets(floorsToSharedScaleSvgs(project.floors, { ...localizedSheetOptions(sheetLang()), changeMap }));
          sketch.onStatus?.(`Opening print dialog — choose Save as PDF, print at 100%.${changeMap ? ' Change map included.' : ''}`);
        }
      } catch (err) {
        alert(`Print failed:\n${err.message}`);
      }
    });
  });
})();

// ---- autosave to localStorage (survives page reload) ----
const LS_KEY = 'house-cad:autosave:v1';
// When the session was opened from a shared VIEW link, autosave is suppressed so the
// viewer's own saved project is never silently clobbered by someone else's link. An
// explicit Save (which writes LS_KEY directly) adopts it as their own.
// (`viewMode` itself is declared near the top — it's read during init.)
let saveTimer = null;
project.onChange(() => {
  if (viewMode) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(serializeProject(project)));
    } catch { /* storage unavailable / full — ignore */ }
  }, 400);
});

function seedDemo() {
  project.addRectangle(new Rectangle({ x: -5, y: -3, w: 8, h: 6, op: 'add' }));
  project.addRectangle(new Rectangle({ x: 3, y: -3, w: 4, h: 3, op: 'add' }));
  project.addRectangle(new Rectangle({ x: -2, y: -1, w: 3, h: 2, op: 'subtract' }));
}

// A shared view link (#view=…) wins over autosave; otherwise restore the last session,
// otherwise seed a demo house.
(async function init() {
  try {
    const viewData = await decodeViewFromHash(location.hash);
    if (viewData) {
      loadView(project, viewData);
      viewMode = true;
      // Read-only: hide every plan-editing affordance and lock the sketch to pan/zoom.
      document.getElementById('app').classList.add('view-only');
      sketch.setReadOnly(true);
      setTool('pan');
      view.frameModel();
      setDesktop3D(true);
      sketch.onStatus?.('Opened a shared 3D view — read-only. Pan/zoom to inspect; 📏 to measure.');
      return;
    }
  } catch (err) {
    console.warn('Ignoring an unreadable view link:', err.message);
  }
  let restored = false;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      deserializeInto(project, JSON.parse(saved));
      restored = project.floors.some((f) => f.rectangles.length > 0);
    }
  } catch { restored = false; }
  if (!restored) seedDemo();
})();

console.log('House CAD ready.');
