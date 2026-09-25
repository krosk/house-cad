# Electrical workflow: conduits, wires, circuits

How the electrical model is meant to be authored and how its layers relate. This is the
conceptual "why", complementary to the mode-by-mode mechanics in `docs/ar-survey.md`
(the `MARKER · *` / `CONDUIT · *` modes) and the whole-house data model in
`CLAUDE.md`. Core code: `src/core/conduit.js` (network + routing), `src/core/circuits.js`
(circuit derivation), `src/core/electrical.js` (control-link routes + surface classifier),
`src/core/model.js` (`Project` owns the whole-house network/wires).

## The three lanes (keep them distinct)

Electrical is **not** one thing. There are three separate concepts, and most confusion
comes from conflating them:

1. **Conduit network** — the *physical* channels (raceway / trunking drilled into
   walls, floors, ceilings). A graph of **nodes** joined by **segments**. Whole-house
   (lives on `Project`, not a floor).
2. **Wires** — *logical power connections* between two devices. A wire does not draw its
   own path; it **rides** the conduit network and its route is **derived**. Whole-house.
   Circuits are derived from this lane.
3. **Control links** (`MARKER · LINK`, `electricalLinks`) — switch→light *control*
   relationships. Separate, **per-floor**, and route themselves directly
   (switch → ceiling → light) **without** the conduit network. Listed here only so you
   don't expect them to interact with wires — they don't.

## Why conduit and wire are two layers

It mirrors a real installation: you run conduit **once**, then pull **several cables**
through it. So the model keeps them separate:

- **conduit** records the as-built physical raceway (lengths, surfaces, and cross-slab
  risers are all derived from geometry);
- **wires** record which devices are electrically joined;
- because many wires share one conduit, **circuit grouping cannot live on the conduit** —
  it lives on the wire layer. Two circuits can run through the exact same conduit segment
  with no ambiguity, because the grouping is derived from wires + breakers, never from
  shared conduit.

## Intended authoring order

```
1. Place device markers        MARKER · EDIT     outlets, switches, lights, panel, breakers
2. Run the conduit network     MARKER · CONDUIT  pen device → junction → device; cross-slab = riser
   (branch / fix)              MARKER · CONDUIT  trigger an existing run → T-junction; B/Y undoes a step
   (refine)                    CONDUIT · EDIT    move / split / delete nodes & segments, set node height
   (survey to walls)           CONDUIT · DIMS    pin a bare junction to a wall so it tracks edits
3. Declare wires               MARKER · WIRE     choose electrical/Ethernet, then pick two devices
4. Circuits fall out           (derived)         deriveCircuits(): components of the wire graph + breakers
```

The pivotal mechanic in **step 2**: penning **onto a device marker** binds a conduit node
to that device (`ensureConduitNodeAtMarker`) — that is how a device gets *onto the graph*.
Penning empty space drops a **bare junction**; segments join nodes. A segment whose ends
sit on two storeys is a **riser** through the slab. To author one, select `ALL FLOORS` in
`LEVEL`, return to `MARKER · CONDUIT`, then trigger the two nodes/devices. Aiming down favours your own
storey and aiming up the storey above; grip cycles outward to farther storeys under the reticle.
A basement breaker can therefore be wired to an upstairs outlet, either by gripping, or by picking
the breaker and flicking the LEFT stick up to teleport storeys before picking the outlet. The same stacked workspace
supports `CONDUIT · EDIT` and `MARKER · WIRE`; other plan and marker editing remains locked.

## The dependency rules (the part people trip on)

- **A wire can only exist where conduit physically goes.** Its path is the shortest route
  through the conduit graph between the two devices' bound nodes (`wireSegmentPath` →
  Dijkstra, threading any `via`). No conduit path between them ⇒ the wire **routes to
  nothing and draws nothing**.
- **A device is wireable only after conduit reaches it.** The wire tool (`addWire`) does
  **not** create conduit nodes — only `MARKER · CONDUIT` binds a device to the graph.
  So the order is **conduit first, then wire.**
- You *may* create a wire before the conduit connects its endpoints. The wire is stored;
  it simply stays **invisible/unrouted** until a conduit path exists. (Practical tip: an
  "invisible wire" almost always means missing conduit, not a broken wire.)
- **`via` = bare junctions only, in order.** It's an override to force a wire down a
  specific run when you don't want the automatic shortest path. Never devices — a device
  is only ever a wire **endpoint** (`fromMarkerId` / `toMarkerId`), never a mid-path stop.
- **Wire nature is authored, not inferred.** `type` is `electrical` or `ethernet`
  (legacy saves default to electrical). In AR, thumbstick up/down picks the next wire's
  type or retypes the selected wire. Purple is reserved for conduit; electrical wires
  draw amber and Ethernet wires cyan.
- **Wires never create or move conduit; conduit carries no circuit identity.** Clean
  separation both directions.

## Nothing is stored as geometry (why edits never go stale)

Neither wires nor the conduit network store coordinates. Node positions come from the live
markers/junctions, each segment's surface (wall / ceiling / floor / riser) is **inferred**
from geometry (`segmentSurface`), and routes are recomputed on demand. So moving a wall,
dragging a marker, or changing a floor height re-derives every length, path, riser, and
circuit automatically — there is no stale electrical geometry to clean up. (A bare junction
can additionally be **pinned to a wall** in `CONDUIT · DIMS` so it tracks that wall on
every edit, resolved one-way like a marker pin.)

## Circuits: a derived projection of the wire lane

A **circuit** is a physical fact — the set of devices interconnected by wires and fed from
one breaker. Because a **breaker is its own marker** (type `breaker`), not a shared panel
enclosure, each circuit is exactly one **connected component** of the graph whose vertices
are device markers and whose edges are `project.wires`. `src/core/circuits.js` derives this
with union-find and classifies each component:

| Component contains | Meaning |
|---|---|
| **1 breaker** | a circuit (0 wires = an empty, just-placed circuit) |
| **≥2 breakers** | a **conflict** — an illegal cross-tie between breakers; flagged, unowned |
| **0 breakers** | **unassigned** — wired devices not yet traced to a breaker; benign mid-survey |

You never "assign" a wire to a circuit — you wire the home run to a breaker and the circuit
*is* that component. Circuit identity/metadata (`number`, `rating`, `poles`) live on the
breaker marker; membership is **derived, never stored**. Control links are deliberately
**not** circuit edges (they're the control lane, not power).

`deriveCircuits(project)` returns `{ circuits, conflicts, unassigned, deviceCircuit,
wireCircuit, circuitColor }`. It is pure and recomputed like wire routes.

In AR `MARKER · WIRE`, selecting any existing wire keeps that wire and its direct endpoints
yellow, while every other wire and marker in its connected component turns green. Unrelated
wires remain dim in their normal type color. This inspection works for a normal breaker-owned
circuit, an unfinished unassigned component, and a multi-breaker conflict; it does not modify
or store membership. In `ALL FLOORS`, every member glyph is outlined at its true elevation.

## Owner decisions and their rationale

These are settled; don't reopen them without the owner.

- **Routing is automatic shortest path plus manual override.** A wire with an empty `via` list
  takes the Dijkstra shortest route through the conduit graph; ordered `via` nodes force it
  through specific junctions.
- **Bare junction nodes are allowed** (nodes not bound to a device).
- **Conduit node `z` is floor-relative, never absolute.** A floor-height edit re-stacks
  elevations, so every higher node's world Z follows while its stored `z` stays put, and a riser
  through the moved slab stretches to match. Storing absolute Z would desync on a height edit.
- **Markers stay on one floor** (a device is mounted on one storey's wall). Only the conduit
  network and wires are whole-house.
- **Control links stay per-floor, intentionally not cross-floor.** A ground-floor switch driving an
  upstairs light is authored as **two lights and two links**, so the light and its link print on
  **both** floor sheets; the contractor needs to see it on each. A single cross-floor link would
  print only once. Don't promote `electricalLinks` to `Project`.
- **Junctions are pinned to walls by a dimension, not snapped on drop.** A `{node}` dimension
  (`CONDUIT · DIMS`) makes the junction follow the wall on every later edit; a snap would not
  re-track. It is solved one-way in `solveConduitNodes`, like a marker pin; z stays out of the
  solver.
- **Output:** the conduit network and routed wires are authoring scaffolding. They are always
  excluded from plan sheets and change maps; in DXF they are an opt-in `wiring` layer (default
  off). Markers and control links are unaffected.

## Status (as of this writing)

- Conduit network, wires, routing, risers, wall-pinned junctions: **implemented**
  (build-verified; the whole AR conduit/wire lane is not yet walked on device — see
  `docs/ar-survey.md` and `.claude/handoff.md`).
- `breaker` marker type + `number`/`rating`/`poles` persistence, and `circuits.js`
  derivation: **implemented** as model helpers.
- Selected-wire circuit membership highlighting in AR: **implemented**.
- **Not yet done** (deliberately deferred): surfacing circuits in any output (the print
  sheet stays as-is), per-circuit coloring/numbering/schedule, conflict warnings in the UI,
  AR editing of breaker `number`/`rating`, and tying a breaker to a `panel` enclosure
  (`panelId`) for schedule grouping.
