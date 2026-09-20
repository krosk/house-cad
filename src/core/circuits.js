// Electrical CIRCUITS, DERIVED (never stored) from the whole-house wire graph.
//
// A circuit is a physical fact: the set of devices interconnected by WIRES and fed
// from one breaker. Because a breaker is its own marker (not a single shared panel
// enclosure), each circuit is exactly one CONNECTED COMPONENT of the graph whose
// vertices are device markers and whose edges are `project.wires`. Circuit identity +
// metadata (number, rating, poles) live on the `breaker` marker; NOTHING is tagged on
// the wires — so the same conduit can carry wires from different circuits with no
// ambiguity. The grouping lives on the electrical layer, never on the shared conduit.
//
// Derivation is pure and cheap (union-find over a house-sized graph), recomputed at
// render time like wire routes (`conduit.js`). Control links (switch→light) are the
// CONTROL lane and are deliberately NOT circuit edges here.
//
// Classification of each component by how many breakers it contains:
//   1 breaker  → a circuit (the normal case; 0 wires = an empty, just-placed circuit)
//   ≥2 breakers→ a CONFLICT (an illegal cross-tie between breakers) — flagged, not owned
//   0 breakers → UNASSIGNED (wired devices not yet traced back to a breaker) — benign
//                during an incomplete survey, shown as "no circuit yet".

// A small, stable palette so each circuit reads distinctly in AR and (later) DXF layers.
// NOTE: print sheets are monochrome by design — there, distinguish circuits by NUMBER
// labels + the schedule, not by hue.
export const CIRCUIT_PALETTE = [
  0x22d3ee, 0xf59e0b, 0x4ade80, 0xa78bfa, 0xf472b6,
  0xfbbf24, 0x38bdf8, 0xfb7185, 0x34d399, 0xc084fc,
];

export function isBreaker(marker) {
  return marker?.type === 'breaker';
}

// Every marker house-wide (circuits span storeys, like wires). Returns bare marker objects.
function allMarkers(project) {
  const out = [];
  for (const f of project?.floors || []) for (const m of f.markers || []) out.push(m);
  return out;
}

// Minimal union-find with path halving; keys are marker ids (strings).
function makeDSU() {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) { const nxt = parent.get(x); parent.set(x, r); x = nxt; }
    return r;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  return { find, union };
}

// Parse a breaker's number for stable ordering; non-numeric / missing sort last.
function numOf(breaker) {
  const n = parseInt(breaker?.number, 10);
  return Number.isFinite(n) ? n : Infinity;
}

/**
 * Derive circuits from the live project.
 * @returns {{
 *   circuits: Array<{ breakerId, breaker, number, rating, poles, color, deviceIds: string[], wireIds: string[], deviceCount: number }>,
 *   conflicts: Array<{ breakerIds: string[], deviceIds: string[], wireIds: string[] }>,
 *   unassigned: Array<{ deviceIds: string[], wireIds: string[] }>,
 *   deviceCircuit: Map<string, string|null>,   // markerId → owning breakerId (null if conflict/unassigned)
 *   wireCircuit: Map<string, string|null>,      // wireId → owning breakerId (null if conflict/unassigned)
 *   circuitColor: Map<string, number>,          // breakerId → hex
 * }}
 */
export function deriveCircuits(project) {
  const markers = allMarkers(project);
  const byId = new Map(markers.map((m) => [m.id, m]));
  // Only wires whose BOTH endpoints resolve to a real marker are edges.
  const wires = (project?.wires || []).filter((w) => byId.has(w.fromMarkerId) && byId.has(w.toMarkerId));

  // Which markers touch a wire? Those + all breakers are the graph's vertices.
  const touched = new Set();
  for (const w of wires) { touched.add(w.fromMarkerId); touched.add(w.toMarkerId); }

  const dsu = makeDSU();
  for (const m of markers) if (isBreaker(m)) dsu.find(m.id); // an unwired breaker = its own (empty) circuit
  for (const w of wires) dsu.union(w.fromMarkerId, w.toMarkerId);

  // Bucket everything into components keyed by DSU root.
  const comp = new Map();
  const ensure = (root) => {
    if (!comp.has(root)) comp.set(root, { deviceIds: [], wireIds: [], breakerIds: [] });
    return comp.get(root);
  };
  for (const m of markers) {
    if (!isBreaker(m) && !touched.has(m.id)) continue; // isolated non-breaker markers aren't in any circuit
    const c = ensure(dsu.find(m.id));
    c.deviceIds.push(m.id);
    if (isBreaker(m)) c.breakerIds.push(m.id);
  }
  for (const w of wires) ensure(dsu.find(w.fromMarkerId)).wireIds.push(w.id);

  // Classify components.
  const circuitComps = [];
  const conflicts = [];
  const unassigned = [];
  for (const c of comp.values()) {
    if (c.breakerIds.length === 1) circuitComps.push(c);
    else if (c.breakerIds.length >= 2) conflicts.push({ breakerIds: c.breakerIds, deviceIds: c.deviceIds, wireIds: c.wireIds });
    else unassigned.push({ deviceIds: c.deviceIds, wireIds: c.wireIds });
  }

  // Stable order (by breaker number, then id) drives fallback numbering + color assignment.
  circuitComps.sort((a, b) => {
    const ba = byId.get(a.breakerIds[0]), bb = byId.get(b.breakerIds[0]);
    return (numOf(ba) - numOf(bb)) || (a.breakerIds[0] < b.breakerIds[0] ? -1 : 1);
  });

  const deviceCircuit = new Map();
  const wireCircuit = new Map();
  const circuitColor = new Map();
  const circuits = circuitComps.map((c, i) => {
    const breakerId = c.breakerIds[0];
    const breaker = byId.get(breakerId);
    const color = Number.isFinite(breaker?.color) ? breaker.color : CIRCUIT_PALETTE[i % CIRCUIT_PALETTE.length];
    circuitColor.set(breakerId, color);
    for (const id of c.deviceIds) deviceCircuit.set(id, breakerId);
    for (const id of c.wireIds) wireCircuit.set(id, breakerId);
    return {
      breakerId,
      breaker,
      number: breaker?.number ?? (i + 1),          // fall back to stable-order index when unnumbered
      rating: breaker?.rating ?? null,
      poles: breaker?.poles ?? 1,
      color,
      deviceIds: c.deviceIds,
      wireIds: c.wireIds,
      deviceCount: c.deviceIds.filter((id) => id !== breakerId).length,
    };
  });
  // Conflict / unassigned members own no circuit.
  for (const c of conflicts) { for (const id of c.deviceIds) deviceCircuit.set(id, null); for (const id of c.wireIds) wireCircuit.set(id, null); }
  for (const c of unassigned) { for (const id of c.deviceIds) deviceCircuit.set(id, null); for (const id of c.wireIds) wireCircuit.set(id, null); }

  return { circuits, conflicts, unassigned, deviceCircuit, wireCircuit, circuitColor };
}
