import './style.css';
import { Project, Rectangle } from './core/model.js';
import { computeFootprint } from './core/geometry2d.js';
import { extrudeFootprint } from './core/extrude.js';
import { Sketch2D } from './ui/sketch2d.js';
import { View3D } from './ui/view3d.js';
import { serializeProject, deserializeInto } from './io/serialize.js';
import { setUnit, onUnitChange, toMeters, fmt, unitLabel, unitInfo } from './core/units.js';

const project = new Project();

const sketch = new Sketch2D(document.getElementById('sketch'), project);
const view = new View3D(document.getElementById('view3d'));

// Rebuild the 3D model whenever the plan changes.
let firstBuild = true;
function rebuild() {
  const footprint = computeFootprint(project.rectangles);
  const geometry = extrudeFootprint(footprint, project.height);
  view.setGeometry(geometry);
  if (firstBuild && geometry) {
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
  select: 'Click a rectangle to select; drag to move; Del to delete.',
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

// ---- constraints panel (live list of dimensions) ----
const cxList = document.getElementById('cx-list');
const cxRows = new Map(); // id -> { row, input, tag }
const EDGE_SHORT = { left: 'L', right: 'R', top: 'T', bottom: 'B' };

const cxCount = document.getElementById('cx-count');

function renderConstraints() {
  const cs = project.constraints;
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
      const del = document.createElement('button');
      del.textContent = '🗑';
      del.title = 'Delete dimension';
      row.append(tag, input, unit, del);
      cxList.appendChild(row);

      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isNaN(v)) project.setConstraintMagnitude(c.id, toMeters(v));
      });
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
const pW = document.getElementById('p-w');
const pH = document.getElementById('p-h');
const pOp = document.getElementById('p-op');
const pDel = document.getElementById('p-del');
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
  set(pW, b.x1 - b.x0);
  set(pH, b.y1 - b.y0);
  pOp.textContent = r.op === 'add' ? '➕ Add' : '➖ Subtract';
  pOp.className = `op-toggle ${r.op}`;
}

sketch.onSelect = (rect) => {
  selectedRect = rect;
  propsPanel.hidden = !rect;
  updateProps();
};
project.onChange(updateProps);

pX.addEventListener('input', () => { const v = parseFloat(pX.value); if (selectedRect && !Number.isNaN(v)) { selectedRect.x = toMeters(v); project.touch(); } });
pY.addEventListener('input', () => { const v = parseFloat(pY.value); if (selectedRect && !Number.isNaN(v)) { selectedRect.y = toMeters(v); project.touch(); } });
pW.addEventListener('input', () => { const v = parseFloat(pW.value); if (selectedRect && !Number.isNaN(v)) { selectedRect.w = Math.max(0, toMeters(v)); project.touch(); } });
pH.addEventListener('input', () => { const v = parseFloat(pH.value); if (selectedRect && !Number.isNaN(v)) { selectedRect.h = Math.max(0, toMeters(v)); project.touch(); } });
pOp.addEventListener('click', () => {
  if (!selectedRect) return;
  selectedRect.op = selectedRect.op === 'add' ? 'subtract' : 'add';
  project.touch();
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

document.getElementById('delete').addEventListener('click', () => sketch.deleteSelected());
document.getElementById('clear').addEventListener('click', () => {
  if (project.rectangles.length && confirm('Remove all rectangles?')) project.clear();
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
unitSelect.value = 'm';
unitSelect.addEventListener('change', () => setUnit(unitSelect.value));
onUnitChange(() => {
  // Update every visible unit label and re-render all numeric fields.
  for (const el of document.querySelectorAll('.unit-label')) el.textContent = unitLabel();
  sketch.snapStep = unitInfo().snap;
  setHeightInput();
  updateProps();
  renderConstraints();
  sketch.render();
});

// ---- resizable splitter ----
(() => {
  const splitter = document.getElementById('splitter');
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
function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById('save').addEventListener('click', () => {
  download('house.json', JSON.stringify(serializeProject(project), null, 2));
  sketch.onStatus?.('Saved house.json');
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

// ---- autosave to localStorage (survives page reload) ----
const LS_KEY = 'house-cad:autosave:v1';
let saveTimer = null;
project.onChange(() => {
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

// Restore the last session if present, otherwise seed a demo house.
(function init() {
  let restored = false;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      deserializeInto(project, JSON.parse(saved));
      restored = project.rectangles.length > 0;
    }
  } catch { restored = false; }
  if (!restored) seedDemo();
})();

console.log('House CAD ready.');
