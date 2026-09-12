// The 2D plan editor: a pannable/zoomable grid where you draw axis-aligned
// rectangles. Left panel of the app. Emits model changes; the 3D view and the
// footprint pipeline react to those.
//
// Coordinate systems:
//   world  = meters, +x right, +y up, (0,0) is the plan origin
//   screen = CSS pixels on the canvas, +y DOWN (canvas convention)

import { Rectangle } from '../core/model.js';
import { makeDistance, EDGE_AXIS, isMarkerConstraint } from '../core/constraints.js';
import { edgeLineWorld } from '../core/dimline.js';
import { fmt, unitLabel, unitInfo } from '../core/units.js';

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

    this._pointers = new Map(); // pointerId -> {px,py}; drives multi-touch
    this._gesture = null; // {mid,dist} while two-finger pan/pinch is active
    this._coarse = false; // last pointer was touch/pen → use fatter hit targets

    this._dimFirst = null; // first edge picked for a dimension {rect, edge}
    this._hoverEdge = null; // edge under cursor (dimension tool)
    this._dimLabelHits = []; // clickable dimension labels, rebuilt each render

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
    const CURSOR = { select: 'default', pan: 'grab' };
    this.canvas.style.cursor = CURSOR[tool] ?? 'crosshair';
    this.render();
  }

  // Coarse pointers (finger / controller ray) get larger hit targets.
  get _edgePickPx() { return this._coarse ? EDGE_PICK_PX * 2 : EDGE_PICK_PX; }
  get _handlePx() { return this._coarse ? HANDLE_PX * 2 : HANDLE_PX; }

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
    c.addEventListener('pointercancel', (e) => this._onUp(e));
    c.addEventListener('pointerleave', (e) => this._onUp(e));
    c.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    c.addEventListener('dblclick', (e) => this._onDblClick(e));
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
    this._coarse = e.pointerType !== 'mouse';
    this._pointers.set(e.pointerId, { px, py });

    // A second finger turns the interaction into a two-finger pan + pinch-zoom.
    // Abort whatever the first finger started so it leaves no stray draft.
    if (this._pointers.size >= 2) {
      this._abortPointerAction();
      const pts = [...this._pointers.values()];
      this._gesture = { mid: this._centroid(pts), dist: this._spread(pts) };
      this.render();
      return;
    }

    // Pan via: the Pan tool (touch / controller), middle/right mouse, or Space.
    const panning = this.tool === 'pan' || e.button === 1 || e.button === 2
      || this._spaceDown;

    if (panning) {
      this.canvas.style.cursor = 'grabbing';
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
      // A dimension label takes priority over rectangle selection. Grabbing it
      // starts a reposition drag; a click without movement focuses its field.
      const label = this._hitDimLabel(px, py);
      if (label) {
        const c = this.project.constraints.find((k) => k.id === label.id);
        this._drag = { mode: 'dimOffset', c, moved: false, downX: px, downY: py };
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
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { px, py });

    // Two-finger pan + pinch-zoom takes over while active.
    if (this._gesture && this._pointers.size >= 2) {
      this._updateGesture();
      return;
    }

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
        } else if (this._hitDimLabel(px, py)) {
          this.canvas.style.cursor = 'move';
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
    } else if (this._drag.mode === 'dimOffset') {
      const d = this._drag;
      // A small dead-zone keeps a plain click from nudging the placement.
      if (!d.moved && Math.hypot(px - d.downX, py - d.downY) < 4) return;
      d.moved = true;
      this.canvas.style.cursor = 'grabbing';
      const c = d.c;
      if (!c) return;
      const la = this._edgeLineWorld(c.a);
      const lb = this._edgeLineWorld(c.b);
      if (!la || !lb) return;
      // Perpendicular distance from the same anchor the renderer uses.
      c.offset = c.axis === 'x'
        ? world.y - Math.max(la.p1.y, lb.p1.y)
        : world.x - Math.max(la.p1.x, lb.p1.x);
      this.project.touch();
    }
  }

  _onUp(e) {
    this._pointers.delete(e.pointerId);

    // Winding down a multi-touch gesture.
    if (this._gesture) {
      if (this._pointers.size < 2) this._gesture = null;
      // Don't let a leftover finger start a fresh action; wait for a new touch.
      return;
    }

    if (this.tool === 'pan' && !this._drag) this.canvas.style.cursor = 'grab';
    if (!this._drag) return;
    if (this._drag.mode === 'pan' && this.tool === 'pan') {
      this.canvas.style.cursor = 'grab';
    }
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
    } else if (this._drag.mode === 'dimOffset') {
      // No movement → treat as a click: focus the dimension's value field.
      if (!this._drag.moved) this.onPickConstraint?.(this._drag.c?.id);
      this.canvas.style.cursor = 'move';
    }
    this._drag = null;
    this.render();
  }

  // Double-click a dimension label to return it to automatic placement.
  _onDblClick(e) {
    if (this.tool !== 'select') return;
    const { px, py } = this._localXY(e);
    const label = this._hitDimLabel(px, py);
    if (label) this.project.setConstraintOffset(label.id, null);
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

  // ---- multi-touch (two-finger pan + pinch-zoom) ----
  _centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.px; y += p.py; }
    const n = pts.length || 1;
    return { x: x / n, y: y / n };
  }
  _spread(pts) {
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].px - pts[1].px, pts[0].py - pts[1].py);
  }

  _updateGesture() {
    const pts = [...this._pointers.values()];
    const mid = this._centroid(pts);
    const dist = this._spread(pts);

    // Pan by how far the two-finger midpoint moved.
    this.originX += mid.x - this._gesture.mid.x;
    this.originY += mid.y - this._gesture.mid.y;

    // Pinch-zoom about the midpoint, keeping that world point pinned.
    if (this._gesture.dist > 0 && dist > 0) {
      const before = this.toWorld(mid.x, mid.y);
      this.scale = Math.min(400, Math.max(4, this.scale * (dist / this._gesture.dist)));
      const after = this.toWorld(mid.x, mid.y);
      this.originX += (after.x - before.x) * this.scale;
      this.originY -= (after.y - before.y) * this.scale;
    }

    this._gesture.mid = mid;
    this._gesture.dist = dist;
    this.render();
  }

  // Discard an in-flight single-pointer action (used when a 2nd finger lands).
  _abortPointerAction() {
    if (this._drag && (this._drag.mode === 'move' || this._drag.mode === 'resize')) {
      this._drag.rect._dragging = false;
      this.project.touch();
    }
    this._drag = null;
    this.draft = null;
  }

  // Zoom about the viewport center by a factor (on-screen +/- buttons).
  zoomBy(factor) {
    const cx = this._cssW / 2;
    const cy = this._cssH / 2;
    const before = this.toWorld(cx, cy);
    this.scale = Math.min(400, Math.max(4, this.scale * factor));
    const after = this.toWorld(cx, cy);
    this.originX += (after.x - before.x) * this.scale;
    this.originY -= (after.y - before.y) * this.scale;
    this.render();
  }

  // ---- edge picking (dimension tool) ----
  // Returns {rect, edge, axis} for the nearest rectangle edge within threshold.
  _hitEdge(px, py) {
    let best = null;
    let bestDist = this._edgePickPx;
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
    const t = this._handlePx;
    const pts = this._handlePoints(rect);
    for (const [name, [wx, wy]] of Object.entries(pts)) {
      const s = this.toScreen(wx, wy);
      if (Math.abs(px - s.x) <= t && Math.abs(py - s.y) <= t) return name;
    }
    return null;
  }

  _hitDimLabel(px, py) {
    const pad = this._coarse ? 8 : 2; // easier to grab, esp. on touch
    for (const h of this._dimLabelHits) {
      if (px >= h.x - pad && px <= h.x + h.w + pad
        && py >= h.y - pad && py <= h.y + h.h + pad) return h;
    }
    return null;
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

    this._drawGrid();
    this._drawAxes();
    this._drawGhost();

    for (const rect of this.project.rectangles) {
      this._drawRect(rect, rect.id === this.selectedId);
    }

    this._drawDimensions();
    this._drawEdgePick();

    if (this.draft) this._drawDraft();
    this._drawCursorReadout();
  }

  _edgeLineWorld(ref) {
    // Shared, guarded lookup (see src/core/dimline.js): returns the world-space
    // edge line for a rect edge, or null for marker/origin endpoints.
    return edgeLineWorld(ref, this.project.rectangles);
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
      if (isMarkerConstraint(c)) continue; // marker pins are AR-only; the 2D editor doesn't draw them
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
      const EXT_OVER = 5; // px the extension line runs past the dimension line
      const arrow = 5;

      if (c.axis === 'x') {
        const sxa = this.toScreen(la.coord, 0).x;
        const sxb = this.toScreen(lb.coord, 0).x;
        // Dimension line screen-y: auto = stacked above the taller shape;
        // pinned = a signed model-space offset from that top (drag to place).
        let sy;
        if (c.offset == null) {
          const topY = Math.max(la.p1.y, lb.p1.y);
          sy = this.toScreen(0, topY).y - OFFSET - xTier++ * TIER;
        } else {
          const topY = Math.max(la.p1.y, lb.p1.y);
          sy = this.toScreen(0, topY + c.offset).y;
        }
        // Each extension line springs from the edge end nearer the dim line, so
        // it always touches the shape whether the dim sits above or below.
        const conn = (l) => {
          const top = this.toScreen(0, l.p1.y).y;
          const bot = this.toScreen(0, l.p0.y).y;
          return Math.abs(sy - top) <= Math.abs(sy - bot) ? top : bot;
        };
        const cya = conn(la);
        const cyb = conn(lb);
        ctx.setLineDash([3, 3]);
        this._seg(sxa, cya, sxa, sy + Math.sign(sy - cya) * EXT_OVER);
        this._seg(sxb, cyb, sxb, sy + Math.sign(sy - cyb) * EXT_OVER);
        ctx.setLineDash([]);
        this._seg(sxa, sy, sxb, sy);
        this._arrowH(sxa, sy, Math.sign(sxb - sxa) * arrow);
        this._arrowH(sxb, sy, Math.sign(sxa - sxb) * arrow);
        const above = sy <= Math.min(cya, cyb);
        this._dimLabel(c, (sxa + sxb) / 2, above ? sy - 4 : sy + 16);
      } else {
        const sya = this.toScreen(0, la.coord).y;
        const syb = this.toScreen(0, lb.coord).y;
        let sx;
        if (c.offset == null) {
          const rightX = Math.max(la.p1.x, lb.p1.x);
          sx = this.toScreen(rightX, 0).x + OFFSET + yTier++ * TIER;
        } else {
          const rightX = Math.max(la.p1.x, lb.p1.x);
          sx = this.toScreen(rightX + c.offset, 0).x;
        }
        const conn = (l) => {
          const right = this.toScreen(l.p1.x, 0).x;
          const left = this.toScreen(l.p0.x, 0).x;
          return Math.abs(sx - right) <= Math.abs(sx - left) ? right : left;
        };
        const cxa = conn(la);
        const cxb = conn(lb);
        ctx.setLineDash([3, 3]);
        this._seg(cxa, sya, sx + Math.sign(sx - cxa) * EXT_OVER, sya);
        this._seg(cxb, syb, sx + Math.sign(sx - cxb) * EXT_OVER, syb);
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

  // The floor to show as a faint underlay for alignment: the one directly
  // below the active floor (build up), falling back to the one above.
  _ghostFloor() {
    const p = this.project;
    if (!p.floors) return null;
    const i = p.floors.findIndex((f) => f.id === p.activeFloorId);
    if (i < 0) return null;
    return p.floors[i - 1] || p.floors[i + 1] || null;
  }

  _drawGhost() {
    const gf = this._ghostFloor();
    if (!gf || !gf.rectangles.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const rect of gf.rectangles) {
      const b = rect.bounds;
      const p0 = this.toScreen(b.x0, b.y1);
      const p1 = this.toScreen(b.x1, b.y0);
      ctx.strokeStyle = rect.op === 'add'
        ? 'rgba(120,140,170,0.38)' : 'rgba(255,107,107,0.30)';
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    }
    ctx.setLineDash([]);
    // Name the underlay so it's clear which storey it is.
    ctx.fillStyle = 'rgba(154,163,178,0.7)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`underlay: ${gf.name}`, this._cssW / 2, 16);
    ctx.textAlign = 'left';
    ctx.restore();
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


    if (selected) {
      const hs = this._coarse ? 6 : 3.5; // half-size; fatter for touch
      const pts = this._handlePoints(rect);
      for (const [wx, wy] of Object.values(pts)) {
        const s = this.toScreen(wx, wy);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.fillRect(s.x - hs, s.y - hs, hs * 2, hs * 2);
        ctx.strokeRect(s.x - hs, s.y - hs, hs * 2, hs * 2);
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
