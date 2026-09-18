// Conduit network topology + wire routing, shared by AR, sheets, and DXF.
//
// Two layers (see docs/markers-plan.md):
//   1. The CONDUIT NETWORK — a graph of `conduitNodes` (bare junctions, or nodes
//      bound to a device marker) joined by `conduitSegments`. This is the set of
//      physical channels drilled into walls/floors/ceilings.
//   2. WIRES — each references two device markers plus optional ordered `via` nodes,
//      and derives its physical path as the SHORTEST route through the graph (passing
//      through the vias in order). Nothing is stored as coordinates: node positions
//      come from the live markers/junctions and the wall/ceiling/floor surface of each
//      segment is inferred, so marker/storey edits never leave stale geometry.
//
// The network is WHOLE-HOUSE (lives on Project, not Floor). Every position resolves in
// ABSOLUTE world Z = floor.elevation + local z, so a segment joining nodes on two
// storeys is a riser through the slab and routes/lengths cross floors naturally. All
// exported functions therefore take `project`, not a single `floor`.

import { segmentSurface, storeyBands } from './electrical.js';

// Resolve a node's ABSOLUTE world position {x,y,z}. A marker-bound node follows its
// marker (on whatever floor the marker lives); a bare junction adds its floor's
// elevation to its floor-relative z.
export function conduitNodePos(project, node) {
  if (node?.markerId) {
    const found = project?.findMarker?.(node.markerId);
    if (found) return { x: found.marker.x, y: found.marker.y, z: (found.floor.elevation || 0) + (found.marker.z || 0) };
  }
  const f = project?.floorById?.(node.floorId);
  return { x: node.x, y: node.y, z: (f?.elevation || 0) + (node.z || 0) };
}

export function conduitNodeById(project, id) {
  return (project?.conduitNodes || []).find((n) => n.id === id) || null;
}

export function conduitNodeForMarker(project, markerId) {
  return (project?.conduitNodes || []).find((n) => n.markerId === markerId) || null;
}

export function conduitSegmentEndpoints(project, seg) {
  const a = conduitNodeById(project, seg?.a);
  const b = conduitNodeById(project, seg?.b);
  if (!a || !b) return null;
  return { a: conduitNodePos(project, a), b: conduitNodePos(project, b) };
}

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

// nodeId -> [{ segId, to, length }] over live world geometry.
export function conduitAdjacency(project) {
  const adj = new Map();
  for (const n of project?.conduitNodes || []) adj.set(n.id, []);
  for (const s of project?.conduitSegments || []) {
    const ep = conduitSegmentEndpoints(project, s);
    if (!ep) continue;
    const len = dist3(ep.a, ep.b);
    adj.get(s.a)?.push({ segId: s.id, to: s.b, length: len });
    adj.get(s.b)?.push({ segId: s.id, to: s.a, length: len });
  }
  return adj;
}

// Dijkstra shortest path (segment-id list) between two nodes; [] if same node,
// null if unreachable. Graphs are house-sized, so a linear-scan frontier is fine.
function dijkstra(adj, from, to) {
  if (from === to) return [];
  if (!adj.has(from) || !adj.has(to)) return null;
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const visited = new Set();
  for (;;) {
    let u = null, best = Infinity;
    for (const [node, d] of dist) if (!visited.has(node) && d < best) { best = d; u = node; }
    if (u == null || u === to) break;
    visited.add(u);
    for (const e of adj.get(u) || []) {
      if (visited.has(e.to)) continue;
      const nd = best + e.length;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { seg: e.segId, from: u }); }
    }
  }
  if (!prev.has(to)) return null;
  const segs = [];
  let cur = to;
  while (cur !== from) { const p = prev.get(cur); if (!p) return null; segs.unshift(p.seg); cur = p.from; }
  return segs;
}

// Ordered segment ids for the shortest route from→to threading the `via` nodes in
// order; null if any leg is unreachable.
export function shortestConduitPath(project, fromNodeId, toNodeId, via = []) {
  const adj = conduitAdjacency(project);
  const stops = [fromNodeId, ...via, toNodeId];
  const path = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const leg = dijkstra(adj, stops[i], stops[i + 1]);
    if (leg == null) return null;
    path.push(...leg);
  }
  return path;
}

// The segment ids of a wire's derived route, or null if its endpoints/vias are not
// connected in the current network.
export function wireSegmentPath(project, wire) {
  const from = conduitNodeForMarker(project, wire?.fromMarkerId);
  const to = conduitNodeForMarker(project, wire?.toMarkerId);
  if (!from || !to) return null;
  const via = (wire.via || []).filter((id) => conduitNodeById(project, id));
  return shortestConduitPath(project, from.id, to.id, via);
}

// Ordered node objects along a wire's route (from-marker node → to-marker node through
// the derived path), or [] if unroutable. The basis for both points and floor tagging.
function wireRouteNodes(project, wire) {
  const path = wireSegmentPath(project, wire);
  const from = conduitNodeForMarker(project, wire?.fromMarkerId);
  if (path == null || !from) return [];
  const nodes = [from];
  let cur = from.id;
  for (const segId of path) {
    const seg = (project.conduitSegments || []).find((s) => s.id === segId);
    if (!seg) return [];
    const nextId = seg.a === cur ? seg.b : seg.b === cur ? seg.a : null;
    if (nextId == null) return [];
    const node = conduitNodeById(project, nextId);
    if (!node) return [];
    nodes.push(node);
    cur = nextId;
  }
  return nodes;
}

// Ordered ABSOLUTE world points {x,y,z} for a wire's route, or [] if unroutable.
export function wireRoutePoints(project, wire) {
  return wireRouteNodes(project, wire).map((n) => conduitNodePos(project, n));
}

// Wire route as surface-classified world segments (for per-surface drawing/DXF layers).
// Each carries the endpoint nodes' floor ids so per-floor output can partition by
// authoritative floor membership (not ambiguous slab-proximity).
export function wireRouteSegments(project, wire) {
  const nodes = wireRouteNodes(project, wire);
  const bands = storeyBands(project);
  const out = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = conduitNodePos(project, nodes[i - 1]);
    const b = conduitNodePos(project, nodes[i]);
    const aFloorId = project.conduitNodeFloorId(nodes[i - 1]);
    const bFloorId = project.conduitNodeFloorId(nodes[i]);
    out.push({ a, b, surface: aFloorId !== bFloorId ? 'riser' : segmentSurface(a, b, bands), aFloorId, bFloorId });
  }
  return out;
}

// The conduit network itself as surface-classified world segments (to draw the
// channels, independent of any wire). Endpoint floor ids included as above.
export function conduitNetworkSegments(project) {
  const bands = storeyBands(project);
  const out = [];
  for (const s of project?.conduitSegments || []) {
    const na = conduitNodeById(project, s.a);
    const nb = conduitNodeById(project, s.b);
    if (!na || !nb) continue;
    const a = conduitNodePos(project, na);
    const b = conduitNodePos(project, nb);
    const aFloorId = project.conduitNodeFloorId(na);
    const bFloorId = project.conduitNodeFloorId(nb);
    out.push({ id: s.id, a, b, surface: aFloorId !== bFloorId ? 'riser' : segmentSurface(a, b, bands), aFloorId, bFloorId });
  }
  return out;
}

// Split whole-house world segments into what one FLOOR should draw on its 2D sheet/DXF,
// partitioned by the endpoint nodes' floor membership: a segment with both ends on this
// floor becomes a plan run; one with exactly one end on this floor is a riser piercing
// this slab and becomes a riser glyph at that end's (x,y) (dir toward the other end), so
// it appears on both floors it connects. `segs` come from conduitNetworkSegments /
// wireRouteSegments (they carry aFloorId/bFloorId).
export function segmentsForFloor(floor, segs) {
  const fid = floor?.id;
  const runs = [];
  const risers = [];
  for (const s of segs || []) {
    const onA = s.aFloorId === fid, onB = s.bFloorId === fid;
    if (onA && onB) runs.push({ a: s.a, b: s.b, surface: s.surface });
    else if (onA) risers.push({ x: s.a.x, y: s.a.y, dir: (s.b.z || 0) > (s.a.z || 0) ? 'up' : 'down' });
    else if (onB) risers.push({ x: s.b.x, y: s.b.y, dir: (s.a.z || 0) > (s.b.z || 0) ? 'up' : 'down' });
    // else: the segment does not touch this floor.
  }
  return { runs, risers };
}
