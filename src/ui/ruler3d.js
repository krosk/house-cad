// View 3D ruler (owner, 2026-10-08: "a ruler function on the 3d view, basically selecting two
// walls/halfs/etc"; top-down overview only, shared links too). Each tap snaps to the nearest
// vertical face (a wall, half wall, slab edge, stair or furniture side) within PICK_PX on screen.
// Two parallel faces read the gap between their planes, as a tape between two walls would;
// any other pair (or a tap with no face nearby) reads point to point with its plan X / Y legs.
// Session-only presentation: nothing is stored in the project or the share link.
import * as THREE from 'three';
import { fmt, unitLabel, onUnitChange } from '../core/units.js';

const PICK_PX = 22; // snap reach on screen
const AXIS_EPS = 0.999; // |normal| component of an axis-aligned face
const PLANE_EPS = 1e-4; // faces closer than this share a plane
// House meshes a pick may snap to: door leaves and glass excluded, and floor slabs too (their
// edges line up across rooms, and every room edge already has its wall face).
const ROLES = new Set(['walls', 'stairs']);
const LAND_SKIP = new Set(['doors', 'ceiling']); // open door leaves; the hidden ceiling
const COLOR_FACE = 0xffd166;
const COLOR_LINE = 0x38bdf8;

// The axis-aligned vertical triangles of a mesh, in world space:
// { axis: 'x' | 'z', c (the plane coordinate), s (the side it faces: ±1 along the axis),
//   a0, a1 (extent along the other plan axis), y0, y1 }.
function meshFaces(mesh) {
  const pos = mesh.geometry?.attributes?.position;
  if (!pos) return [];
  const index = mesh.geometry.index;
  const count = index ? index.count : pos.count;
  const m = mesh.matrixWorld;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const out = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia).applyMatrix4(m);
    b.fromBufferAttribute(pos, ib).applyMatrix4(m);
    c.fromBufferAttribute(pos, ic).applyMatrix4(m);
    const n = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const len = n.length();
    if (len < 1e-10) continue;
    n.divideScalar(len);
    let axis = null;
    if (Math.abs(n.x) > AXIS_EPS) axis = 'x';
    else if (Math.abs(n.z) > AXIS_EPS) axis = 'z';
    if (!axis) continue;
    const along = axis === 'x' ? 'z' : 'x';
    out.push({
      axis, c: (a[axis] + b[axis] + c[axis]) / 3, s: Math.sign(n[axis]),
      a0: Math.min(a[along], b[along], c[along]), a1: Math.max(a[along], b[along], c[along]),
      y0: Math.min(a.y, b.y, c.y), y1: Math.max(a.y, b.y, c.y),
    });
  }
  return out;
}

export class Ruler3D {
  // `view` is the View3D: its camera, renderer, house and furniture groups.
  constructor(view) {
    this.view = view;
    this.enabled = false;
    // Up to two: { point (the tap), cands (faces within reach, nearest first), face (the chosen
    // one or null), x, y, z (the tap snapped onto it) }, world coordinates.
    this.picks = [];
    this.cache = new WeakMap(); // mesh → its faces (a rebuild makes new meshes)
    this.group = new THREE.Group();
    this.group.renderOrder = 10;
    view.scene.add(this.group);
    this.label = document.createElement('div');
    this.label.className = 'view3d-ruler-label';
    this.label.hidden = true;
    view.container.appendChild(this.label);
    this.labelAt = null; // world point the label follows
    onUnitChange(() => this._draw());
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.clear();
  }

  clear() {
    this.picks = [];
    this._draw();
  }

  // The meshes a pick may snap to: visible architecture plus visible furniture. With
  // `landing`, every visible surface a tap may land on (floors, their finishes and window
  // glass too, but not door leaves or ceilings); a tap never snaps to those surfaces' edges.
  _targets(landing = false) {
    const out = [];
    for (const mesh of this.view.house.children) {
      const role = mesh.userData.architecturalRole;
      if (!mesh.isMesh || !mesh.visible) continue;
      if (ROLES.has(role) || (landing && !LAND_SKIP.has(role))) out.push(mesh);
    }
    this.view.furnitureModels.traverseVisible((o) => { if (o.isMesh) out.push(o); });
    return out;
  }

  _faces(mesh) {
    let faces = this.cache.get(mesh);
    if (!faces) { mesh.updateWorldMatrix(true, false); faces = meshFaces(mesh); this.cache.set(mesh, faces); }
    return faces;
  }

  // A tap at (clientX, clientY) in the overview.
  pick(clientX, clientY) {
    const v = this.view;
    const rect = v.renderer.domElement.getBoundingClientRect();
    v.viewNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    v.viewRaycaster.setFromCamera(v.viewNdc, v.camera);
    const targets = this._targets();
    const hit = v.viewRaycaster.intersectObjects(this._targets(true), false)[0];
    const point = hit?.point
      || v.viewRaycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -v.overviewPlaneY), new THREE.Vector3());
    if (!point) return;
    // Metres per screen pixel at the tapped depth (the overview looks straight down).
    const depth = Math.max(0.5, v.camera.position.y - point.y);
    const mpp = 2 * depth * Math.tan(THREE.MathUtils.degToRad(v.camera.fov / 2)) / Math.max(1, rect.height);
    // A tap that lands on a vertical face (seen in perspective) measures from that face;
    // otherwise the nearest face plane within reach of the tap.
    let onFace = null;
    const snaps = hit && (ROLES.has(hit.object.userData.architecturalRole) || !this.view.house.children.includes(hit.object));
    if (hit?.face && snaps) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (Math.abs(n.x) > AXIS_EPS) onFace = 'x';
      else if (Math.abs(n.z) > AXIS_EPS) onFace = 'z';
    }
    const cands = this._candidates(targets, point, PICK_PX * mpp, onFace ? { axis: onFace, mesh: hit.object } : null);
    if (this.picks.length >= 2) this.picks = [];
    this.picks.push({ point: point.clone(), cands });
    this._resolve();
    this._draw();
  }

  // Choose each pick's face. Two picks with parallel candidates take the pair that faces each
  // other (a tape between two walls: a thin wall tapped on its top reads from its room-side
  // face), then the nearest; otherwise each pick's nearest face.
  _resolve() {
    for (const k of this.picks) k.face = k.cands[0] || null;
    const [p, q] = this.picks;
    if (p && q) {
      let best = null;
      for (const f of p.cands) {
        for (const g of q.cands) {
          if (f.axis !== g.axis || Math.abs(f.c - g.c) < 1e-6) continue;
          const [lo, hi] = f.c < g.c ? [f, g] : [g, f];
          const score = (lo.s > 0 && hi.s < 0 ? 0 : 1000) + f.d + g.d;
          if (!best || score < best.score) best = { score, f, g };
        }
      }
      if (best) { p.face = best.f; q.face = best.g; }
    }
    for (const k of this.picks) {
      const at = k.point.clone();
      if (k.face) { at[k.face.axis] = k.face.c; at.y = k.face.y1; }
      k.x = at.x; k.y = at.y; k.z = at.z;
    }
  }

  // The face planes within `tol` of `p` in plan (one per plane and side, nearest first, at most
  // four per axis), each grown into one continuous face for its highlight. A tap that landed on a vertical
  // face puts that face first.
  _candidates(targets, p, tol, onFace = null) {
    const near = new Map(); // plane key → { f, d, mesh }
    const consider = (mesh, f, d) => {
      const key = `${f.axis}|${f.c.toFixed(4)}|${f.s}`;
      const old = near.get(key);
      if (!old || d < old.d - 1e-6 || (Math.abs(d - old.d) <= 1e-6 && f.y1 > old.f.y1)) near.set(key, { f, d, mesh });
    };
    for (const mesh of targets) {
      for (const f of this._faces(mesh)) {
        const along = f.axis === 'x' ? p.z : p.x;
        if (along < f.a0 - tol || along > f.a1 + tol) continue;
        let d = Math.abs((f.axis === 'x' ? p.x : p.z) - f.c);
        if (onFace && mesh === onFace.mesh && f.axis === onFace.axis && d < 0.005) d = -1; // the face under the tap
        if (d <= tol) consider(mesh, f, d);
      }
    }
    // The nearest few per axis, so a window's many reveal faces never hide the wall's own face.
    const sorted = [...near.values()].sort((u, w) => u.d - w.d);
    return [...sorted.filter((n) => n.f.axis === 'x').slice(0, 4), ...sorted.filter((n) => n.f.axis === 'z').slice(0, 4)]
      .sort((u, w) => u.d - w.d)
      .map(({ f, d, mesh }) => ({ ...this._grow(mesh, f, p), d: Math.max(0, d) }));
  }

  // The highlight: a triangle grown along its plane through the same mesh's triangles that
  // face the same way and start at the same height (one wall face, not the lintel over a door).
  _grow(mesh, best, p) {
    const along = best.axis === 'x' ? p.z : p.x;
    const same = this._faces(mesh).filter((f) => f.axis === best.axis && f.s === best.s
      && Math.abs(f.c - best.c) < PLANE_EPS && Math.abs(f.y0 - best.y0) < 0.01);
    let a0 = Math.max(best.a0, Math.min(best.a1, along)), a1 = a0, y1 = best.y1, grew = true;
    a0 = Math.min(a0, best.a0); a1 = Math.max(a1, best.a1);
    while (grew) {
      grew = false;
      for (const f of same) {
        if (f.a1 >= a0 - 1e-4 && f.a0 <= a1 + 1e-4 && (f.a0 < a0 - 1e-9 || f.a1 > a1 + 1e-9)) {
          a0 = Math.min(a0, f.a0); a1 = Math.max(a1, f.a1); y1 = Math.max(y1, f.y1); grew = true;
        }
      }
    }
    return { axis: best.axis, c: best.c, s: best.s, a0, a1, y1 };
  }

  // The reading: a gap between parallel faces, else point to point with plan X / Y legs.
  // Plan X = world x, plan Y = world z.
  measure() {
    const [p, q] = this.picks;
    if (!p || !q) return null;
    if (p.face && q.face && p.face.axis === q.face.axis) {
      return { kind: 'gap', axis: p.face.axis, value: Math.abs(q.face.c - p.face.c) };
    }
    const dx = Math.abs(q.x - p.x), dy = Math.abs(q.z - p.z);
    return { kind: 'points', dx, dy, value: Math.hypot(dx, dy) };
  }

  _draw() {
    for (const child of this.group.children) child.geometry.dispose();
    this.group.clear();
    this.labelAt = null;
    this.label.hidden = true;
    if (!this.enabled || !this.picks.length) return;
    const bar = (from, to, color, width) => {
      const d = new THREE.Vector3().subVectors(to, from), len = d.length();
      if (len < 1e-6) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width, len),
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
      mesh.position.addVectors(from, to).multiplyScalar(0.5);
      mesh.lookAt(to);
      mesh.renderOrder = 10;
      this.group.add(mesh);
    };
    const top = Math.max(...this.picks.map((k) => k.y)) + 0.01;
    for (const k of this.picks) {
      const f = k.face;
      if (f) {
        const from = new THREE.Vector3(), to = new THREE.Vector3();
        from[f.axis] = to[f.axis] = f.c;
        const along = f.axis === 'x' ? 'z' : 'x';
        from[along] = f.a0; to[along] = f.a1;
        from.y = to.y = top;
        bar(from, to, COLOR_FACE, 0.04);
      } else {
        const at = new THREE.Vector3(k.x, top, k.z);
        bar(at.clone().add(new THREE.Vector3(-0.08, 0, 0)), at.clone().add(new THREE.Vector3(0.08, 0, 0)), COLOR_FACE, 0.04);
        bar(at.clone().add(new THREE.Vector3(0, 0, -0.08)), at.clone().add(new THREE.Vector3(0, 0, 0.08)), COLOR_FACE, 0.04);
      }
    }
    const unit = unitLabel();
    const m = this.measure();
    if (!m) {
      const k = this.picks[0];
      this.labelAt = new THREE.Vector3(k.x, top, k.z);
      this.label.textContent = 'Tap a second surface';
      this.label.hidden = false;
      return;
    }
    const [p, q] = this.picks;
    if (m.kind === 'gap') {
      // A line square to both faces, where they overlap (else at the second tap).
      const along = m.axis === 'x' ? 'z' : 'x';
      const lo = Math.max(p.face.a0, q.face.a0), hi = Math.min(p.face.a1, q.face.a1);
      const at = lo <= hi ? (Math.max(lo, Math.min(hi, q[along])) + Math.max(lo, Math.min(hi, p[along]))) / 2 : q[along];
      const from = new THREE.Vector3(), to = new THREE.Vector3();
      from[m.axis] = p.face.c; to[m.axis] = q.face.c;
      from[along] = to[along] = at;
      from.y = to.y = top;
      bar(from, to, COLOR_LINE, 0.025);
      this.labelAt = from.clone().add(to).multiplyScalar(0.5);
      this.label.textContent = `${fmt(m.value)} ${unit} · ${m.axis === 'x' ? 'X' : 'Y'}`;
    } else {
      const a = new THREE.Vector3(p.x, top, p.z), b = new THREE.Vector3(q.x, top, q.z);
      const corner = new THREE.Vector3(q.x, top, p.z);
      bar(a, b, COLOR_LINE, 0.025);
      bar(a, corner, 0xef4444, 0.015);
      bar(corner, b, 0x22c55e, 0.015);
      this.labelAt = a.clone().add(b).multiplyScalar(0.5);
      this.label.textContent = `${fmt(m.value)} ${unit} · X ${fmt(m.dx)} · Y ${fmt(m.dy)}`;
    }
    this.label.hidden = false;
  }

  // Each frame: keep the label on its world point.
  updateLabel() {
    if (!this.labelAt || this.label.hidden) return;
    const v = this.view;
    const s = this.labelAt.clone().project(v.camera);
    const w = v.container.clientWidth, h = v.container.clientHeight;
    this.label.style.left = `${(s.x + 1) / 2 * w}px`;
    this.label.style.top = `${(1 - s.y) / 2 * h}px`;
  }
}
