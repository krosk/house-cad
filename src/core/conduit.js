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

import { segmentSurface } from './electrical.js';

// Resolve a node's model position {x,y,z}. A marker-bound node follows its marker.
export function conduitNodePos(floor, node) {
  if (node?.markerId) {
    const m = (floor?.markers || []).find((mk) => mk.id === node.markerId);
    if (m) return { x: m.x, y: m.y, z: m.z || 0 };
  }
  return { x: node.x, y: node.y, z: node.z || 0 };
}

export function conduitNodeById(floor, id) {
  return (floor?.conduitNodes || []).find((n) => n.id === id) || null;
}

export function conduitNodeForMarker(floor, markerId) {
  return (floor?.conduitNodes || []).find((n) => n.markerId === markerId) || null;
}

export function conduitSegmentEndpoints(floor, seg) {
  const a = conduitNodeById(floor, seg?.a);
  const b = conduitNodeById(floor, seg?.b);
  if (!a || !b) return null;
  return { a: conduitNodePos(floor, a), b: conduitNodePos(floor, b) };
}

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

// nodeId -> [{ segId, to, length }] over live geometry.
export function conduitAdjacency(floor) {
  const adj = new Map();
  for (const n of floor?.conduitNodes || []) adj.set(n.id, []);
  for (const s of floor?.conduitSegments || []) {
    const ep = conduitSegmentEndpoints(floor, s);
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
export function shortestConduitPath(floor, fromNodeId, toNodeId, via = []) {
  const adj = conduitAdjacency(floor);
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
export function wireSegmentPath(floor, wire) {
  const from = conduitNodeForMarker(floor, wire?.fromMarkerId);
  const to = conduitNodeForMarker(floor, wire?.toMarkerId);
  if (!from || !to) return null;
  const via = (wire.via || []).filter((id) => conduitNodeById(floor, id));
  return shortestConduitPath(floor, from.id, to.id, via);
}

// Ordered model points {x,y,z} for a wire's route, or [] if unroutable.
export function wireRoutePoints(floor, wire) {
  const path = wireSegmentPath(floor, wire);
  const from = conduitNodeForMarker(floor, wire?.fromMarkerId);
  if (path == null || !from) return [];
  const pts = [conduitNodePos(floor, from)];
  let cur = from.id;
  for (const segId of path) {
    const seg = (floor.conduitSegments || []).find((s) => s.id === segId);
    if (!seg) return [];
    const nextId = seg.a === cur ? seg.b : seg.b === cur ? seg.a : null;
    if (nextId == null) return [];
    const node = conduitNodeById(floor, nextId);
    if (!node) return [];
    pts.push(conduitNodePos(floor, node));
    cur = nextId;
  }
  return pts;
}

// Wire route as surface-classified segments (for per-surface drawing/DXF layers).
export function wireRouteSegments(floor, wire) {
  const pts = wireRoutePoints(floor, wire);
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    out.push({ a: pts[i - 1], b: pts[i], surface: segmentSurface(pts[i - 1], pts[i], floor?.height) });
  }
  return out;
}

// The conduit network itself as surface-classified segments (to draw the channels,
// independent of any wire).
export function conduitNetworkSegments(floor) {
  const out = [];
  for (const s of floor?.conduitSegments || []) {
    const ep = conduitSegmentEndpoints(floor, s);
    if (!ep) continue;
    out.push({ id: s.id, a: ep.a, b: ep.b, surface: segmentSurface(ep.a, ep.b, floor?.height) });
  }
  return out;
}
