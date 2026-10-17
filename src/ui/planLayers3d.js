// View 3D's Plan mode (owner, 2026-10-14: "a 3d plan view, like what we see in AR but shown
// on desktop", with the conduits and the pipes each behind its own toggle). The AR overlay's
// language on an orbit camera: each floor's plan lies flat at its elevation (the room
// footprint tinted blue, every other zone tinted and outlined in its kind colour, a room
// standing on its own level outlined at that level), and the whole-house networks run in 3D
// between their nodes. Presentation only: built from the live project, never stored.
//
// Runs are thin cylinders (one InstancedMesh per layer) with a 1 px line down their axis, so
// a 16 mm pipe still reads as a line from across the house and as a tube up close.
// PVC pipes (VMC, waste) also show their fittings, derived from the drawn angles (owner, 2026-10-15; sizes and
// checks in src/core/pipeFittings.js): elbows, tees and reducers to size, a failed check in its own colour.

import * as THREE from 'three';
import { computeFootprint } from '../core/geometry2d.js';
import { footprintFloorGeometry } from '../core/extrude.js';
import { ZONE_KINDS, zoneKind, zoneColorHex } from '../core/zoneColors.js';
import { conduitNetworkSegments, conduitNodePos } from '../core/conduit.js';
import { roomFloorZ } from '../core/storey.js';
import { derivePipeFittings } from '../core/pipeFittings.js';
import { ductInsulation, DUCT_INSULATION_M } from '../core/ductInsulation.js';
import { pipeNodeWorld } from '../core/pipeAnchors.js';

// Shared with AR (mr.js) so a run reads the same colour in both.
export const CONDUIT_COLOR = 0xa78bfa;
export const MODEL_PIPE_COLOR = 0x9a9a9a; // the pipes in View 3D's Model view (owner, 2026-10-14)
export const PIPE_SERVICE_COLOR = {
  cold: 0x38bdf8, hot: 0xef4444, heating_supply: 0xf97316, heating_return: 0x8b5cf6, refrigerant: 0x34d399, vmc: 0xcbd5e1, waste: 0xa16207,
};

const CONDUIT_RADIUS = 0.0125; // a 25 mm conduit
const CONDUIT_NODE_RADIUS = 0.02;
const PIPE_NODE_SCALE = 1.3;   // a pipe junction: a bead slightly fatter than its pipe
// Fittings (src/core/pipeFittings.js): PVC-white over the pipe's colour; a check that fails shows in its own colour.
export const FITTING_FLAG_COLOR = { angle: 0xff3b30, short: 0xff9500, mf: 0xffd60a };
const FITTING_TINT = 0.55; // toward white
// A VMC duct outside the heated volume (src/core/ductInsulation.js): a translucent wool jacket over the cold stretch.
export const INSULATION_COLOR = 0xfacc15;
const insulationMaterial = new THREE.MeshLambertMaterial({ color: INSULATION_COLOR, transparent: true, opacity: 0.35, depthWrite: false });

const tubeGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1); // unit, along +Y
const nodeGeometry = new THREE.SphereGeometry(1, 12, 8);
const fillMaterials = new Map();
function fillMaterial(color, opacity) {
  const key = `${color}:${opacity}`;
  if (!fillMaterials.has(key)) {
    fillMaterials.set(key, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
    }));
  }
  return fillMaterials.get(key);
}

// Plan (x, y, z up) → world (x, z, -y), as View 3D and AR.
const world = (p) => new THREE.Vector3(p.x, p.z || 0, -p.y);

function rectFillGeometry(rects, y) {
  const positions = [];
  const indices = [];
  for (const r of rects) {
    const b = r.bounds;
    const base = positions.length / 3;
    positions.push(b.x0, y, -b.y0, b.x1, y, -b.y0, b.x1, y, -b.y1, b.x0, y, -b.y1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

// One floor's plan, in floor-local height (the caller lifts it by the elevation).
function floorPlan(floor) {
  const group = new THREE.Group();
  const footprint = footprintFloorGeometry(computeFootprint(floor.rectangles));
  if (footprint) group.add(new THREE.Mesh(footprint, fillMaterial(zoneColorHex('room'), 0.22)));
  const byKind = new Map();
  for (const r of floor.rectangles) {
    if (r.op !== 'subtract') continue; // rooms are the footprint fill
    const kind = zoneKind(r);
    (byKind.get(kind) ?? byKind.set(kind, []).get(kind)).push(r);
  }
  for (const [kind, rects] of byKind) {
    const geometry = rectFillGeometry(rects, 0.002 + ZONE_KINDS.indexOf(kind) * 0.0003);
    if (geometry) group.add(new THREE.Mesh(geometry, fillMaterial(zoneColorHex(kind), 0.18)));
  }
  // Outlines: every zone in its kind colour; a room at its own floor level.
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  for (const r of floor.rectangles) {
    const kind = zoneKind(r);
    const b = r.bounds;
    const y = (kind === 'room' ? roomFloorZ(r) : 0) + 0.008;
    const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
    color.setHex(zoneColorHex(kind));
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % 4];
      positions.push(ax, y, -ay, bx, y, -by);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  if (positions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true })));
  }
  for (const child of group.children) child.renderOrder = 1;
  return group;
}

// A network layer: runs [{ a, b, color, radius }] and nodes [{ p, color, radius }], world
// metres, plan coordinates with absolute z.
function networkLayer(runs, nodes) {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  if (runs.length) {
    const tubes = new THREE.InstancedMesh(tubeGeometry, material, runs.length);
    const positions = [];
    const colors = [];
    runs.forEach((run, i) => {
      const a = world(run.a);
      const b = world(run.b);
      const dir = new THREE.Vector3().subVectors(b, a);
      const length = dir.length();
      quaternion.setFromUnitVectors(up, length > 1e-9 ? dir.clone().divideScalar(length) : up);
      scale.set(run.radius, Math.max(length, 1e-4), run.radius);
      matrix.compose(a.clone().add(b).multiplyScalar(0.5), quaternion, scale);
      tubes.setMatrixAt(i, matrix);
      color.setHex(run.color);
      tubes.setColorAt(i, color);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    });
    tubes.computeBoundingSphere();
    group.add(tubes);
    const axis = new THREE.BufferGeometry();
    axis.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    axis.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    group.add(new THREE.LineSegments(axis, new THREE.LineBasicMaterial({ vertexColors: true })));
  }
  if (nodes.length) {
    const beads = new THREE.InstancedMesh(nodeGeometry, material, nodes.length);
    nodes.forEach((node, i) => {
      scale.setScalar(node.radius);
      matrix.compose(world(node.p), quaternion.identity(), scale);
      beads.setMatrixAt(i, matrix);
      beads.setColorAt(i, color.setHex(node.color));
    });
    beads.computeBoundingSphere();
    group.add(beads);
  }
  return group;
}

const pipeNodePos = pipeNodeWorld;

// The plan layers for one floor (floorId) or the whole house (null). A run shows when either
// end is on the shown floor, so a riser appears on both storeys it joins (as AR). `pipeColor`
// draws every pipe and its beads in one colour (the Model view's neutral grey) instead of by service.
export function buildPlanLayers(project, floorId = null, { pipeColor = null } = {}) {
  const shown = (id) => floorId == null || id === floorId;
  const zones = new THREE.Group();
  for (const floor of project.floors) {
    if (!shown(floor.id)) continue;
    const plan = floorPlan(floor);
    plan.position.y = floor.elevation || 0;
    zones.add(plan);
  }

  const conduitRuns = conduitNetworkSegments(project)
    .filter((s) => shown(s.aFloorId) || shown(s.bFloorId))
    .map((s) => ({ a: s.a, b: s.b, color: CONDUIT_COLOR, radius: CONDUIT_RADIUS }));
  const conduitNodes = (project.conduitNodes || [])
    .filter((n) => shown(project.conduitNodeFloorId(n)))
    .map((n) => ({ p: conduitNodePos(project, n), color: 0xffffff, radius: CONDUIT_NODE_RADIUS }));

  const pipeNodes = new Map((project.pipeNodes || []).map((n) => [n.id, n]));
  const pipeRuns = [];
  const nodeRadius = new Map(); // a junction bead fits the fattest pipe at it
  for (const pipe of project.pipes || []) {
    const a = pipeNodes.get(pipe.a);
    const b = pipeNodes.get(pipe.b);
    if (!a || !b || !(shown(project.pipeNodeFloorId(a)) || shown(project.pipeNodeFloorId(b)))) continue;
    const radius = (pipe.diameter || 0.016) / 2;
    pipeRuns.push({ a: pipeNodePos(project, a), b: pipeNodePos(project, b), service: pipe.service, pipeId: pipe.id,
      color: pipeColor ?? (PIPE_SERVICE_COLOR[pipe.service] || PIPE_SERVICE_COLOR.cold), radius });
    for (const id of [pipe.a, pipe.b]) nodeRadius.set(id, Math.max(nodeRadius.get(id) || 0, radius));
  }
  const { fittings: allFittings } = derivePipeFittings(project.pipeNodes || [], project.pipes || [], (n) => pipeNodePos(project, n));
  const fittings = allFittings.filter((f) => shown(project.pipeNodeFloorId(pipeNodes.get(f.nodeId))));
  const fitted = new Set(fittings.map((f) => f.nodeId));
  const pipeBeads = (project.pipeNodes || [])
    .filter((n) => shown(project.pipeNodeFloorId(n)) && !fitted.has(n.id)) // a fitting replaces its node's bead
    .map((n) => ({ p: pipeNodePos(project, n), color: pipeColor ?? 0xffffff, radius: (nodeRadius.get(n.id) || 0.008) * PIPE_NODE_SCALE }));
  const pipes = networkLayer(pipeRuns, pipeBeads);
  const tint = new THREE.Color();
  addFittings(pipes, fittings, (f) => FITTING_FLAG_COLOR[f.flag]
    ?? tint.setHex(pipeColor ?? PIPE_SERVICE_COLOR[f.service] ?? PIPE_SERVICE_COLOR.cold).lerp(new THREE.Color(0xffffff), FITTING_TINT).getHex());
  const fittingIssues = {};
  for (const f of fittings) if (f.flag) fittingIssues[f.flag] = (fittingIssues[f.flag] || 0) + 1;
  // The ducts to insulate, in the plan's colours only (the Model view's grey pipes stay plain).
  let insulateM = 0;
  if (pipeColor == null) {
    const cold = ductInsulation(project, (n) => pipeNodePos(project, n));
    const jackets = [];
    for (const run of pipeRuns) {
      const c = cold.get(run.pipeId);
      if (!c) continue;
      insulateM += c.length;
      for (const [t0, t1] of c.cold) jackets.push({ a: lerpPos(run.a, run.b, t0), b: lerpPos(run.a, run.b, t1), radius: run.radius + DUCT_INSULATION_M });
    }
    addJackets(pipes, jackets);
  }

  return {
    zones,
    conduits: networkLayer(conduitRuns, conduitNodes),
    pipes,
    // The services present, for the legend, and the fitting checks that failed ({ angle, short, mf } counts).
    services: [...new Set(pipeRuns.map((run) => run.service))],
    fittingIssues,
    insulateM, // metres of VMC duct to insulate on the shown floors (0 in the Model view)
  };
}

const lerpPos = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// The insulation jackets: [{ a, b, radius }], one translucent instanced cylinder each.
function addJackets(group, jackets) {
  if (!jackets.length) return;
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const mesh = new THREE.InstancedMesh(tubeGeometry, insulationMaterial, jackets.length);
  jackets.forEach((j, i) => {
    const a = world(j.a), b = world(j.b);
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    quaternion.setFromUnitVectors(up, length > 1e-9 ? dir.clone().divideScalar(length) : up);
    scale.set(j.radius, Math.max(length, 1e-4), j.radius);
    matrix.compose(a.clone().add(b).multiplyScalar(0.5), quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.computeBoundingSphere();
  mesh.renderOrder = 1; // after the opaque pipes, so they show through
  group.add(mesh);
}

// The fittings at the shown nodes, drawn into the pipe layer: each leg a socket-wide cylinder from the node to its
// socket mouth, and a ball of the same width at the node closing the mitre (a moulded elbow or tee).
function addFittings(group, fittings, colorOf) {
  if (!fittings.length) return;
  const legs = fittings.flatMap((f) => f.legs.map((leg) => ({ f, leg })));
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const sleeves = new THREE.InstancedMesh(tubeGeometry, material, legs.length);
  legs.forEach(({ f, leg }, i) => {
    const a = world(f.center);
    const dir = new THREE.Vector3(leg.dir.x, leg.dir.z, -leg.dir.y);
    quaternion.setFromUnitVectors(up, dir);
    scale.set(leg.od / 2, leg.reach, leg.od / 2);
    matrix.compose(a.clone().addScaledVector(dir, leg.reach / 2), quaternion, scale);
    sleeves.setMatrixAt(i, matrix);
    sleeves.setColorAt(i, color.setHex(colorOf(f)));
  });
  sleeves.computeBoundingSphere();
  group.add(sleeves);
  const balls = new THREE.InstancedMesh(nodeGeometry, material, fittings.length);
  fittings.forEach((f, i) => {
    scale.setScalar(Math.max(...f.legs.map((leg) => leg.od)) / 2);
    matrix.compose(world(f.center), quaternion.identity(), scale);
    balls.setMatrixAt(i, matrix);
    balls.setColorAt(i, color.setHex(colorOf(f)));
  });
  balls.computeBoundingSphere();
  group.add(balls);
}

// Free a built layer's own buffers (the shared geometries and fill materials stay).
export function disposePlanLayer(object) {
  object.traverse((child) => {
    if (child.isInstancedMesh) child.dispose();
    if (child.geometry && child.geometry !== tubeGeometry && child.geometry !== nodeGeometry) child.geometry.dispose();
    if (child.material && ![...fillMaterials.values()].includes(child.material)) child.material.dispose();
  });
}
