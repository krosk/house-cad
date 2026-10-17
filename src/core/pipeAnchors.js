// Pipe anchors (owner, 2026-10-17): a marker where a pipe is already known to pass, such as a
// hole through the ground-floor slab to the basement. Routing must go through it, so a route
// (in the app or in a script) is checked against every anchor of its service
// (docs/plumbing-workflow.md "Pipe anchors"). An anchor is an ordinary marker: it is placed
// in MARKER · EDIT and dimensioned to walls like any other, and nothing in the model moves
// a pipe to it.

// Anchor marker type → the pipe services that satisfy it.
export const PIPE_ANCHOR_SERVICES = {
  pipe_anchor_heating: ['heating_supply', 'heating_return'],
  pipe_anchor_water: ['cold', 'hot'],
  pipe_anchor_waste: ['waste'],
  pipe_anchor_vmc: ['vmc'],
};
export const PIPE_ANCHOR_TYPES = Object.keys(PIPE_ANCHOR_SERVICES);
export const isPipeAnchor = (marker) => !!PIPE_ANCHOR_SERVICES[marker?.type];

// A pipe passes an anchor when its axis comes within this distance of the anchor point: a
// hole with some play around the pipe.
export const PIPE_ANCHOR_TOLERANCE = 0.05;

// A pipe node's world position (z absolute): a marker-bound node follows its device.
export function pipeNodeWorld(project, node) {
  if (node?.markerId) {
    const found = project.findMarker(node.markerId);
    if (found) return { x: found.marker.x, y: found.marker.y, z: (found.floor.elevation || 0) + (found.marker.z || 0) };
  }
  const floor = project.floorById(node?.floorId);
  return { x: node?.x || 0, y: node?.y || 0, z: (floor?.elevation || 0) + (node?.z || 0) };
}

function pointSegment(p, a, b) {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len2 = d.x * d.x + d.y * d.y + d.z * d.z;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / len2)) : 0;
  return Math.hypot(a.x + d.x * t - p.x, a.y + d.y * t - p.y, a.z + d.z * t - p.z);
}

// One row per anchor: { marker, floor, services, at (world), pass, through (the pipes of its
// services within the tolerance), nearest ({ pipe, dist } of its services, or null) }.
// Each service of a heating or water anchor is checked on its own: a heating hole is passed
// when a supply OR a return goes through it (`missing` lists the services with no pipe there).
export function checkPipeAnchors(project, tolerance = PIPE_ANCHOR_TOLERANCE) {
  const nodes = new Map((project.pipeNodes || []).map((n) => [n.id, n]));
  const runs = [];
  for (const pipe of project.pipes || []) {
    const a = nodes.get(pipe.a), b = nodes.get(pipe.b);
    if (a && b) runs.push({ pipe, a: pipeNodeWorld(project, a), b: pipeNodeWorld(project, b) });
  }
  const rows = [];
  for (const floor of project.floors || []) {
    for (const marker of floor.markers || []) {
      const services = PIPE_ANCHOR_SERVICES[marker.type];
      if (!services) continue;
      const at = { x: marker.x, y: marker.y, z: (floor.elevation || 0) + (marker.z || 0) };
      let nearest = null;
      const through = [];
      for (const run of runs) {
        if (!services.includes(run.pipe.service)) continue;
        const dist = pointSegment(at, run.a, run.b);
        if (!nearest || dist < nearest.dist) nearest = { pipe: run.pipe, dist };
        if (dist <= tolerance) through.push({ pipe: run.pipe, dist });
      }
      const missing = services.filter((s) => !through.some((r) => r.pipe.service === s));
      rows.push({ marker, floor, services, at, pass: through.length > 0, through, missing, nearest });
    }
  }
  return rows;
}
