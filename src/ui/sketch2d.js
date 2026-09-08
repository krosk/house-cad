// The 2D plan editor: a pannable/zoomable grid where you draw axis-aligned
// rectangles. Left panel of the app. Emits model changes; the 3D view and the
// footprint pipeline react to those.
//
// Coordinate systems:
//   world  = meters, +x right, +y up, (0,0) is the plan origin
//   screen = CSS pixels on the canvas, +y DOWN (canvas convention)

import { Rectangle } from '../core/model.js';
import { makeDistance, edgeCoord, EDGE_AXIS } from '../core/constraints.js';
import { fmt, unitLabel, toMeters, unitInfo } from '../core/units.js';

const MIN_DRAW = 0.05; // ignore tiny accidental drags (meters)
const EDGE_PICK_PX = 8; // edge hit-test threshold (screen px)
const HANDLE_PX = 7; // resize-handle hit-test threshold (screen px)

// Cursor shape per resize handle.
const HANDLE_CURSOR = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
};

export class Sketch2D {
  constructor(canvas, project) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.project = project;

    this.tool = 'add'; // 'add' | 'subtract' | 'select' | 'dimension'
    this.snapStep = unitInfo().snap; // meters; follows the display unit

    // View transform.
    this.scale = 40; // pixels per meter
    this.originX = 0; // screen px where world x=0 sits
    this.originY = 0; // screen px where world y=0 sits

    this.selectedId = null;
    this.onSelect = null; // callback(rect|null)
    this.onPickConstraint = null; // callback(constraintId) when a dimension is clicked
    this.onStatus = null; // callback(message) for transient hints

    this.draft = null; // {x0,y0,x1,y1} while drawing
    this._drag = null; // active pointer interaction
    this._spaceDown = false;

    this._dimFirst = null; // first edge picked for a dimension {rect, edge}
    this._hoverEdge = null; // edge under cursor (dimension tool)
    this._dimLabelHits = []; // clickable dimension labels, rebuilt each render
    this._sizeLabelHits = []; // clickable rectangle W/H labels, rebuilt each render
    this._sizeInput = null; // lazily-created inline number editor

    this._bindEvents();

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas);
    this._resize(); // sets size + centers origin, then renders

    project.onChange(() => this.render());
  }

  setTool(tool) {
    this.tool = tool;
    this._dimFirst = null;
    this._hoverEdge = null;
    this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    this.render();
  }

  // ---- coordinate transforms ----
  toWorld(px, py) {
    return { x: (px - this.originX) / this.scale, y: (this.originY - py) / this.scale };
  }
  toScreen(wx, wy) {
    return { x: this.originX + wx * this.scale, y: this.originY - wy * this.scale };
  }
  snap(v) {
    return Math.round(v / this.snapStep) * this.snapStep;
  }

  // ---- sizing ----
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const first = this.canvas.width === 0;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._cssW = w;
    this._cssH = h;

    if (first) {
      // Center world origin in the viewport on first layout.
      this.originX = w / 2;
      this.originY = h / 2;
    }
    this.render();
  }

  // ---- events ----
  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._onDown(e));
    c.addEventListener('pointermove', (e) => this._onMove(e));
    c.addEventListener('pointerup', (e) => this._onUp(e));
    c.addEventListener('pointerleave', (e) => this._onUp(e));
    c.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') this._spaceDown = true;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedId) {
        // Avoid hijacking Backspace while typing in an input.
        if (document.activeElement?.tagName === 'INPUT') return;
        this.deleteSelected();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this._spaceDown = false;
    });
  }

  _localXY(e) {
    const r = this.canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  _onDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const { px, py } = this._localXY(e);
    const panning = e.button === 1 || this._spaceDown || e.button === 2;

    if (panning) {
      this._drag = { mode: 'pan', px, py, ox: this.originX, oy: this.originY };
      return;
    }

    const world = this.toWorld(px, py);

    if (this.tool === 'dimension') {
      const edge = this._hitEdge(px, py);
      if (!edge) { this._dimFirst = null; this.render(); return; }
      if (!this._dimFirst) {
        this._dimFirst = edge;
      } else {
        this._createDimension(this._dimFirst, edge);
        this._dimFirst = null;
      }
      this.render();
      return;
    }

    if (this.tool === 'select') {
      // A dimension-constraint label takes priority over rectangle selection.
      const label = this._hitDimLabel(px, py);
      if (label) {
        this.onPickConstraint?.(label.id);
        this.render();
        return;
      }
      // Resize handles of the already-selected rectangle take priority.
      if (this.selectedId) {
        const sel = this.project.rectangles.find((r) => r.id === this.selectedId);
        const handle = sel && this._hitHandle(px, py, sel);
        if (handle) {
          sel._dragging = true;
          const b = sel.bounds;
          this._drag = { mode: 'resize', rect: sel, handle, fixed: { ...b } };
          return;
        }
      }
      // A rectangle's own W/H label opens the inline size editor.
      const sizeLabel = this._hitSizeLabel(px, py);
      if (sizeLabel) {
        // Release capture so the canvas doesn't hold pointer focus over the input.
        try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        this._beginSizeEdit(sizeLabel);
        return;
      }

      const hit = this._hitTest(world.x, world.y);
      this._select(hit ? hit.id : null);
      if (hit) {
        hit._dragging = true;
        this._drag = {
          mode: 'move',
          rect: hit,
          startX: world.x,
          startY: world.y,
          origX: hit.x,
          origY: hit.y,
        };
      }
      this.render();
      return;
    }

    // Drawing tools.
    const sx = this.snap(world.x);
    const sy = this.snap(world.y);
    this._drag = { mode: 'draw' };
    this.draft = { x0: sx, y0: sy, x1: sx, y1: sy };
    this.render();
  }

  _onMove(e) {
    const { px, py } = this._localXY(e);
    const world = this.toWorld(px, py);
    this._cursor = world;

    if (!this._drag) {
      // Hover cursor feedback in select mode.
      if (this.tool === 'select') {
        const sel = this.selectedId
          ? this.project.rectangles.find((r) => r.id === this.selectedId)
          : null;
        const handle = sel && this._hitHandle(px, py, sel);
        if (handle) {
          this.canvas.style.cursor = HANDLE_CURSOR[handle];
        } else if (this._hitDimLabel(px, py) || this._hitSizeLabel(px, py)) {
          this.canvas.style.cursor = 'text';
        } else {
          const hit = this._hitTest(world.x, world.y);
          this.canvas.style.cursor = hit ? 'move' : 'default';
        }
      } else if (this.tool === 'dimension') {
        this._hoverEdge = this._hitEdge(px, py);
        this.canvas.style.cursor = this._hoverEdge ? 'pointer' : 'crosshair';
      }
      this.render();
      return;
    }

    if (this._drag.mode === 'pan') {
      this.originX = this._drag.ox + (px - this._drag.px);
      this.originY = this._drag.oy + (py - this._drag.py);
      this.render();
    } else if (this._drag.mode === 'draw') {
      this.draft.x1 = this.snap(world.x);
      this.draft.y1 = this.snap(world.y);
      this.render();
    } else if (this._drag.mode === 'move') {
      const dx = this.snap(world.x - this._drag.startX);
      const dy = this.snap(world.y - this._drag.startY);
      this._drag.rect.x = this._drag.origX + dx;
      this._drag.rect.y = this._drag.origY + dy;
      this.project.touch();
    } else if (this._drag.mode === 'resize') {
      const f = this._drag.fixed;
      const h = this._drag.handle;
      let { x0, y0, x1, y1 } = f;
      const wx = this.snap(world.x);
      const wy = this.snap(world.y);
      if (h.includes('e')) x1 = wx; // right edge
      if (h.includes('w')) x0 = wx; // left edge
      if (h.includes('n')) y1 = wy; // top edge (y up)
      if (h.includes('s')) y0 = wy; // bottom edge
      const r = this._drag.rect;
      r.x = Math.min(x0, x1);
      r.w = Math.abs(x1 - x0);
      r.y = Math.min(y0, y1);
      r.h = Math.abs(y1 - y0);
      this.project.touch();
    }
  }

  _onUp(e) {
    if (!this._drag) return;
    if (this._drag.mode === 'draw') {
      const d = this.draft;
      const w = Math.abs(d.x1 - d.x0);
      const h = Math.abs(d.y1 - d.y0);
      if (w >= MIN_DRAW && h >= MIN_DRAW) {
        const rect = new Rectangle({
          x: Math.min(d.x0, d.x1),
          y: Math.min(d.y0, d.y1),
          w,
          h,
          op: this.tool === 'subtract' ? 'subtract' : 'add',
        });
        this.project.addRectangle(rect);
        this._select(rect.id);
      }
      this.draft = null;
    } else if (this._drag.mode === 'move' || this._drag.mode === 'resize') {
      this._drag.rect._dragging = false;
      this.project.touch(); // final settle without drag priority
    }
    this._drag = null;
    this.render();
  }

  _onWheel(e) {
    e.preventDefault();
    const { px, py } = this._localXY(e);
    const before = this.toWorld(px, py);
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.scale = Math.min(400, Math.max(4, this.scale * factor));
    // Keep the world point under the cursor fixed.
    const after = this.toWorld(px, py);
    this.originX += (after.x - before.x) * this.scale;
    this.originY -= (after.y - before.y) * this.scale;
    this.render();
  }

  // ---- edge picking (dimension tool) ----
  // Returns {rect, edge, axis} for the nearest rectangle edge within threshold.
  _hitEdge(px, py) {
    let best = null;
    let bestDist = EDGE_PICK_PX;
    for (const r of this.project.rectangles) {
      const b = r.bounds;
      const c0 = this.toScreen(b.x0, b.y0);
      const c1 = this.toScreen(b.x1, b.y1);
      const left = c0.x, right = c1.x, top = c1.y, bottom = c0.y; // screen px
      const within = (v, lo, hi) => v >= Math.min(lo, hi) - 2 && v <= Math.max(lo, hi) + 2;

      const candidates = [
        { edge: 'left', d: Math.abs(px - left), ok: within(py, top, bottom) },
        { edge: 'right', d: Math.abs(px - right), ok: within(py, top, bottom) },
        { edge: 'bottom', d: Math.abs(py - bottom), ok: within(px, left, right) },
        { edge: 'top', d: Math.abs(py - top), ok: within(px, left, right) },
      ];
      for (const cand of candidates) {
        if (cand.ok && cand.d < bestDist) {
          bestDist = cand.d;
          best = { rect: r, edge: cand.edge, axis: EDGE_AXIS[cand.edge] };
        }
      }
    }
    return best;
  }

  _createDimension(first, second) {
    if (first.axis !== second.axis) {
      this.onStatus?.('Pick two edges on the SAME axis (both vertical or both horizontal).');
      return;
    }
    if (first.rect.id === second.rect.id && first.edge === second.edge) {
      this.onStatus?.('Pick two different edges.');
      return;
    }
    const c = makeDistance(first.rect, first.edge, second.rect, second.edge);
    this.project.addConstraint(c);
    this.onStatus?.(`Dimension added: ${Math.abs(c.value).toFixed(2)} m`);
  }

  // World-space positions of the 8 resize handles for a rectangle.
  _handlePoints(rect) {
    const b = rect.bounds;
    const mx = (b.x0 + b.x1) / 2;
    const my = (b.y0 + b.y1) / 2;
    return {
      nw: [b.x0, b.y1], n: [mx, b.y1], ne: [b.x1, b.y1],
      w: [b.x0, my], e: [b.x1, my],
      sw: [b.x0, b.y0], s: [mx, b.y0], se: [b.x1, b.y0],
    };
  }

  _hitHandle(px, py, rect) {
    const pts = this._handlePoints(rect);
    for (const [name, [wx, wy]] of Object.entries(pts)) {
      const s = this.toScreen(wx, wy);
      if (Math.abs(px - s.x) <= HANDLE_PX && Math.abs(py - s.y) <= HANDLE_PX) return name;
    }
    return null;
  }

  _hitDimLabel(px, py) {
    for (const h of this._dimLabelHits) {
      if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h;
    }
    return null;
  }

  _hitSizeLabel(px, py) {
    // Reverse order so topmost-drawn labels win.
    for (let i = this._sizeLabelHits.length - 1; i >= 0; i--) {
      const h = this._sizeLabelHits[i];
      if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h;
    }
    return null;
  }

  // ---- inline size editor ----
  _ensureSizeInput() {
    if (this._sizeInput) return this._sizeInput;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    input.className = 'inline-size-input';
    input.hidden = true;
    this.canvas.parentElement.appendChild(input);

    const commit = () => {
      if (input.hidden) return;
      const v = parseFloat(input.value);
      const t = input._target;
      input.hidden = true;
      if (t && !Number.isNaN(v)) {
        const meters = Math.max(0, toMeters(v));
        const r = this.project.rectangles.find((x) => x.id === t.rect);
        if (r) {
          if (t.dim === 'w') r.w = meters; // anchors left edge
          else r.h = meters; // anchors bottom edge
          this.project.touch();
        }
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { commit(); this.canvas.focus(); }
      else if (e.key === 'Escape') { input.hidden = true; }
      e.stopPropagation();
    });
    input.addEventListener('blur', commit);
    this._sizeInput = input;
    return input;
  }

  _beginSizeEdit(hit) {
    const r = this.project.rectangles.find((x) => x.id === hit.rect);
    if (!r) return;
    this._select(r.id);
    const b = r.bounds;
    const val = hit.dim === 'w' ? b.x1 - b.x0 : b.y1 - b.y0;
    const input = this._ensureSizeInput();
    input._target = { rect: hit.rect, dim: hit.dim };
    input.step = String(unitInfo().snap * unitInfo().perMeter);
    input.value = fmt(val);
    input.style.left = `${Math.round(hit.x)}px`;
    input.style.top = `${Math.round(hit.y - 2)}px`;
    input.hidden = false;
    this.render();
    // Focus must be deferred: calling focus() inside the pointerdown handler is
    // undone by the browser's default focus handling after the handler returns
    // (which would immediately blur+hide the input).
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  // ---- selection ----
  _hitTest(wx, wy) {
    const rects = this.project.rectangles;
    for (let i = rects.length - 1; i >= 0; i--) {
      if (rects[i].contains(wx, wy)) return rects[i];
    }
    return null;
  }
  _select(id) {
    this.selectedId = id;
    const rect = id ? this.project.rectangles.find((r) => r.id === id) : null;
    this.onSelect?.(rect || null);
  }
  deleteSelected() {
    if (!this.selectedId) return;
    this.project.removeRectangle(this.selectedId);
    this._select(null);
  }

  clearSelection() {
    this._select(null);
    if (this._sizeInput) this._sizeInput.hidden = true;
    this.render();
  }

  // ---- rendering ----
  render() {
    const ctx = this.ctx;
    const w = this._cssW;
    const h = this._cssH;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1d23';
    ctx.fillRect(0, 0, w, h);

    this._sizeLabelHits = [];
    this._drawGrid();
    this._drawAxes();

    for (const rect of this.project.rectangles) {
      this._drawRect(rect, rect.id === this.selectedId);
    }

    this._drawDimensions();
    this._drawEdgePick();

    if (this.draft) this._drawDraft();
    this._drawCursorReadout();
  }

  _edgeLineWorld(ref) {
    // Return the [{x,y},{x,y}] world endpoints of an edge, and its coordinate.
    const r = this.project.rectangles.find((x) => x.id === (ref.rect.id ?? ref.rect));
    if (!r) return null;
    const b = r.bounds;
    const coord = edgeCoord(r, ref.edge);
    switch (ref.edge) {
      case 'left': return { p0: { x: b.x0, y: b.y0 }, p1: { x: b.x0, y: b.y1 }, coord };
      case 'right': return { p0: { x: b.x1, y: b.y0 }, p1: { x: b.x1, y: b.y1 }, coord };
      case 'bottom': return { p0: { x: b.x0, y: b.y0 }, p1: { x: b.x1, y: b.y0 }, coord };
      case 'top': return { p0: { x: b.x0, y: b.y1 }, p1: { x: b.x1, y: b.y1 }, coord };
    }
  }

  _drawEdgePick() {
    if (this.tool !== 'dimension') return;
    const ctx = this.ctx;
    const draw = (ref, color, width) => {
      const line = this._edgeLineWorld(ref);
      if (!line) return;
      const a = this.toScreen(line.p0.x, line.p0.y);
      const c = this.toScreen(line.p1.x, line.p1.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    };
    if (this._hoverEdge) draw(this._hoverEdge, '#ffd166', 3);
    if (this._dimFirst) draw(this._dimFirst, '#ffa94d', 3.5);
  }

  _drawDimensions() {
    const ctx = this.ctx;
    this._dimLabelHits = [];
    const constraints = this.project.constraints || [];
    // Stagger successive dimensions on each axis to reduce overlap.
    let xTier = 0;
    let yTier = 0;

    for (const c of constraints) {
      if (c.type !== 'distance') continue;
      const la = this._edgeLineWorld(c.a);
      const lb = this._edgeLineWorld(c.b);
      if (!la || !lb) continue;

      const color = c.conflict ? '#ff5c5c' : '#79c0ff';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.25;
      ctx.font = '12px system-ui';

      const OFFSET = 26; // px from geometry to dimension line
      const TIER = 20; // px between stacked dimensions
      const arrow = 5;

      if (c.axis === 'x') {
        const xa = la.coord;
        const xb = lb.coord;
        const topY = Math.max(la.p1.y, lb.p1.y); // world y (bounds y1)
        const tier = xTier++;
        const sy = this.toScreen(0, topY).y - OFFSET - tier * TIER;
        const sxa = this.toScreen(xa, 0).x;
        const sxb = this.toScreen(xb, 0).x;
        // Extension lines.
        ctx.setLineDash([3, 3]);
        this._seg(sxa, this.toScreen(0, topY).y, sxa, sy);
        this._seg(sxb, this.toScreen(0, topY).y, sxb, sy);
        ctx.setLineDash([]);
        // Dimension line + arrows.
        this._seg(sxa, sy, sxb, sy);
        this._arrowH(sxa, sy, Math.sign(sxb - sxa) * arrow);
        this._arrowH(sxb, sy, Math.sign(sxa - sxb) * arrow);
        this._dimLabel(c, (sxa + sxb) / 2, sy - 4);
      } else {
        const ya = la.coord;
        const yb = lb.coord;
        const rightX = Math.max(la.p1.x, lb.p1.x); // world x (bounds x1)
        const tier = yTier++;
        const sx = this.toScreen(rightX, 0).x + OFFSET + tier * TIER;
        const sya = this.toScreen(0, ya).y;
        const syb = this.toScreen(0, yb).y;
        ctx.setLineDash([3, 3]);
        this._seg(this.toScreen(rightX, 0).x, sya, sx, sya);
        this._seg(this.toScreen(rightX, 0).x, syb, sx, syb);
        ctx.setLineDash([]);
        this._seg(sx, sya, sx, syb);
        this._arrowV(sx, sya, Math.sign(syb - sya) * arrow);
        this._arrowV(sx, syb, Math.sign(sya - syb) * arrow);
        this._dimLabel(c, sx, (sya + syb) / 2);
      }
    }
  }

  _seg(x0, y0, x1, y1) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  _arrowH(x, y, dx) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y - 3);
    ctx.lineTo(x + dx, y + 3);
    ctx.closePath();
    ctx.fill();
  }
  _arrowV(x, y, dy) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y + dy);
    ctx.lineTo(x + 3, y + dy);
    ctx.closePath();
    ctx.fill();
  }
  _dimLabel(c, cx, cy) {
    const ctx = this.ctx;
    const text = fmt(Math.abs(c.value));
    ctx.font = '12px system-ui';
    const w = ctx.measureText(text).width + 8;
    const h = 16;
    const x = cx - w / 2;
    const y = cy - h + 2;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = c.conflict ? '#ff5c5c' : '#79c0ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = c.conflict ? '#ff5c5c' : '#cfe6ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this._dimLabelHits.push({ id: c.id, x, y, w, h });
  }

  // A clickable size chip centered at (cx, cy). Registers a matching hit box.
  _drawSizeChip(rectId, dim, text, cx, cy, selected, color) {
    const ctx = this.ctx;
    ctx.font = '11px system-ui';
    const tw = ctx.measureText(text).width;
    const chipW = tw + 10;
    const chipH = 15;
    const bx = cx - chipW / 2;
    const by = cy - chipH / 2;

    ctx.fillStyle = selected ? 'rgba(74,158,255,0.22)' : 'rgba(13,17,23,0.72)';
    ctx.fillRect(bx, by, chipW, chipH);
    ctx.strokeStyle = selected ? color : 'rgba(150,160,175,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, chipW, chipH);

    ctx.fillStyle = selected ? '#ffffff' : '#c9d3e0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    this._sizeLabelHits.push({ rect: rectId, dim, x: bx, y: by, w: chipW, h: chipH });
  }

  _niceStep() {
    // Choose a grid step (m) whose on-screen spacing is ~pleasant.
    const targetPx = 70;
    const raw = targetPx / this.scale; // meters per targetPx
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const candidates = [1, 2, 5, 10].map((m) => m * pow);
    return candidates.find((c) => c >= raw) || candidates[candidates.length - 1];
  }

  _drawGrid() {
    const ctx = this.ctx;
    const w = this._cssW;
    const h = this._cssH;
    const major = this._niceStep();
    const minor = major / 5;

    const tl = this.toWorld(0, 0);
    const br = this.toWorld(w, h);
    const x0 = Math.floor(tl.x / minor) * minor;
    const x1 = Math.ceil(br.x / minor) * minor;
    const y0 = Math.floor(br.y / minor) * minor;
    const y1 = Math.ceil(tl.y / minor) * minor;

    ctx.lineWidth = 1;
    for (let x = x0; x <= x1 + 1e-9; x += minor) {
      const s = this.toScreen(x, 0).x;
      const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? '#2f3742' : '#252a32';
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(s, h);
      ctx.stroke();
    }
    for (let y = y0; y <= y1 + 1e-9; y += minor) {
      const s = this.toScreen(0, y).y;
      const isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? '#2f3742' : '#252a32';
      ctx.beginPath();
      ctx.moveTo(0, s);
      ctx.lineTo(w, s);
      ctx.stroke();
    }

    // Scale label.
    ctx.fillStyle = '#6b7480';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`grid ${fmt(major)} ${unitLabel()}`, w - 8, h - 8);
    ctx.textAlign = 'left';
  }

  _drawAxes() {
    const ctx = this.ctx;
    const o = this.toScreen(0, 0);
    ctx.strokeStyle = '#4a5563';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, o.y);
    ctx.lineTo(this._cssW, o.y);
    ctx.moveTo(o.x, 0);
    ctx.lineTo(o.x, this._cssH);
    ctx.stroke();
  }

  _drawRect(rect, selected) {
    const ctx = this.ctx;
    const b = rect.bounds;
    const p0 = this.toScreen(b.x0, b.y1); // top-left in screen space
    const p1 = this.toScreen(b.x1, b.y0); // bottom-right
    const x = p0.x;
    const y = p0.y;
    const w = p1.x - p0.x;
    const h = p1.y - p0.y;

    const add = rect.op === 'add';
    const color = add ? '#4a9eff' : '#ff6b6b';

    if (add) {
      ctx.fillStyle = 'rgba(74,158,255,0.16)';
      ctx.fillRect(x, y, w, h);
    } else {
      this._hatch(x, y, w, h, 'rgba(255,107,107,0.5)');
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeRect(x, y, w, h);

    // Editable size chips (click to type a new value). Both horizontal so
    // they are easy to read and click; hit boxes match the drawn chips exactly.
    const bw = Math.abs(b.x1 - b.x0);
    const bh = Math.abs(b.y1 - b.y0);
    this._drawSizeChip(rect.id, 'w', fmt(bw), x + w / 2, y - 11, selected, color);
    this._drawSizeChip(rect.id, 'h', fmt(bh), x - 22, y + h / 2, selected, color);

    if (selected) {
      const pts = this._handlePoints(rect);
      for (const [wx, wy] of Object.values(pts)) {
        const s = this.toScreen(wx, wy);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.fillRect(s.x - 3.5, s.y - 3.5, 7, 7);
        ctx.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
      }
    }
  }

  _hatch(x, y, w, h, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const step = 8;
    for (let i = -h; i < w; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawDraft() {
    const ctx = this.ctx;
    const d = this.draft;
    const p0 = this.toScreen(Math.min(d.x0, d.x1), Math.max(d.y0, d.y1));
    const p1 = this.toScreen(Math.max(d.x0, d.x1), Math.min(d.y0, d.y1));
    const x = p0.x;
    const y = p0.y;
    const w = p1.x - p0.x;
    const h = p1.y - p0.y;
    const color = this.tool === 'subtract' ? '#ff6b6b' : '#4a9eff';
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    const bw = Math.abs(d.x1 - d.x0);
    const bh = Math.abs(d.y1 - d.y0);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px system-ui';
    ctx.fillText(`${fmt(bw)} × ${fmt(bh)} ${unitLabel()}`, x + 4, y - 6);
  }

  _drawCursorReadout() {
    if (!this._cursor) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#6b7480';
    ctx.font = '11px system-ui';
    ctx.fillText(
      `x ${fmt(this._cursor.x)}  y ${fmt(this._cursor.y)} ${unitLabel()}`,
      8,
      this._cssH - 8,
    );
  }
}
