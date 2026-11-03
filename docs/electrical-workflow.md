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

**Only electrical wires are power edges** (fixed 2026-09-26). Ethernet wires form their own
networks (`deriveCircuits(project, { type: 'ethernet' })`) and are never judged against breakers.
Before this fix, every Ethernet jack pair showed up as an "unassigned" circuit: 7 false components
in the owner's rev 9 house. Selecting a wire in `MARKER · WIRE` highlights the component of that
wire's own nature.

You never "assign" a wire to a circuit — you wire the home run to a breaker and the circuit
*is* that component. Circuit identity/metadata (`number`, `rating`, `poles`) live on the
breaker marker; membership is **derived, never stored**. Control links are deliberately
**not** circuit edges (they're the control lane, not power).

`deriveCircuits(project)` returns `{ circuits, conflicts, unassigned, deviceCircuit,
wireCircuit, circuitColor }`. It is pure and recomputed like wire routes.

### Double switch: one terminal per rocker

A `switch_dual` is one marker but two terminals (owner, 2026-09-29): its two rockers may be on
independent circuits. Before this, a vertex was a marker, so wiring circuit A to one rocker and
circuit B to the other joined them into one component: a false cross-tie. Now each wire end on a
double switch names its rocker (`wire.fromRocker` / `wire.toRocker`: 2 = right, absent = 1 = left;
`wireRocker` in `src/core/electrical.js`), and the circuit graph's vertex is `id` (left) or `id#2`
(right). The marker then belongs to two components, and `deviceIds` lists it in both.

- A new wire's double-switch end starts on the rocker that controls the other end's light (the
  switched leg); otherwise on the left.
- In `MARKER · WIRE`, **A/X on a selected wire** swaps its rocker (with both ends on double
  switches, it steps through the four combinations). The readout shows `ROCKER LEFT|RIGHT`.
- Merging an old two-marker pair puts the single switch's wires on the right rocker.
- Retyping to a single switch drops the rockers, so its wires share one terminal again.
- Wires created before 2026-09-29 all sit on the left rocker: to split a circuit that was already
  surveyed, select the other circuit's wire at the switch and press A/X.
- Deliberate limit: `unwired` in CHECK looks at the marker, so a double switch with only one
  wired rocker is not flagged.

In AR `MARKER · WIRE`, selecting any existing wire keeps that wire and its direct endpoints
yellow, while every other wire and marker in its connected component turns green. Unrelated
wires remain dim in their normal type color. This inspection works for a normal breaker-owned
circuit, an unfinished unassigned component, and a multi-breaker conflict; it does not modify
or store membership. In `ALL FLOORS`, every member glyph is outlined at its true elevation.

While a wire is selected, the controller readout adds two lines (owner request, 2026-09-26;
`selectedCircuitLengths`):
- **`CIRCUIT <len>`** is the total routed **cable** length of every wire in that component. Parallel
  wires in one conduit each count, because each is a separate cable.
- **`SHARED <len>`** is drawn in the *other* nature's color and shown only when non-zero. It is the
  **conduit** length, each run counted once, that carries both this component's wires of the
  selected nature and any wire of the other nature: Ethernet running beside power, or power
  beside Ethernet. It exists so separation or shielding needs can be sized.

## Circuit diagnostics (`circuitDiagnostics`, AR `MARKER · CHECK`)

Owner request, 2026-09-26. Each device carries at most one issue, most severe first:

| Issue | Meaning | Ring |
|---|---|---|
| `cross_tie` | its power chain reaches 2+ breakers (an illegal tie); its breakers are flagged too | red |
| `no_breaker` | wired, but its chain never reaches a breaker | orange |
| `unwired` | a device that needs power has no electrical wire at all | white |

**Needs power** (`needsPower`) is deliberately narrow: `outlet*`, `switch` and `light`. Radiators and
boilers may be hydronic. Panels, Ethernet and plumbing markers are not fed by a breaker wire. Widen the
list only with the owner. **Breakers feeding nothing are not flagged** (owner choice): a spare breaker is
normal. Counts are whole-house: chains for `cross_tie`/`no_breaker`, devices for `unwired`. Proven on the
owner's rev 9 house (Node): 0 cross-ties, 5 no-breaker chains, 93 unwired devices.

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

## Home automation: the owner's own system (owner, 2026-10-25)

The owner wants a **custom home-automation suite, not tied to vendor apps or clouds** (and resists closed
ecosystems such as Somfy's io-homecontrol). Each automated device is driven by the owner's own controller
(an ESP32 running ESPHome or the owner's firmware, talking MQTT / HTTP / Home Assistant's API to the owner's
hub), through **documented wired inputs** where possible. A brand is judged on: wired dry-contact inputs, a
status output, standard spare parts, local-only operation, a manual release.

**The street gate's motor** (Leroy Merlin quote 780480: Nice Home Leggio 300 kit, LM 98747035; manual
IS0965A00FR). Proven (manual): control unit CLB212, IP54, 310 × 232 × 122 mm, mounted ≥ 40 cm above the ground,
cables only through the bottom outdoors, motor cables ≤ 10 m; inputs **Sbs** (step by step) and **Open**
(normally-open contacts), **Stop** (NO / NC / 8.2 kΩ), output **OGI** (24 V gate-open light, 5 W, or a 12 V
lock); **ECSbus** (photocells) switches off in standby (5 min after a movement by default), while the
**IBT4N** connector "stays powered". Operators: 1800 N, 120 W, 700 × 100 × 177 mm, leaves ≤ 300 kg or ≤ 3 m;
rear bracket A/B from the hinge axis 95/270 or 195/200 mm (90°), 150/150 (110°); durability 125 000 cycles at a
0 % load index down to ~40 000 at 100 % (Table 1; the owner's light open-work leaves: 0–35 %, ~125 000–65 000,
read off the curve: Hypothesis). Two remotes in the kit work without any network.
- **Room for the Leggio on the 24 × 20 pillars (2026-10-25, scratch `nice/leggio_top.py`, top views to scale on the
  headset plan).** Proven (arithmetic on the manual's Figure 4: 1100 mm between pivots closed, front pivot 107 mm off
  the leaf; Table 3 A/B): the three settings give a stroke of 377–393 mm at 90° for the two 90° rows, consistent with
  one operator. With the leaves hung on the pillars' centre line (Hypothesis: the installer's choice), the rear pivot
  falls **35 / 85 / 155 mm** beyond the pillar's garden face (A/B 150/150, 195/200, 95/270); open, the operator lies
  beside its leaf within 200 / 245 / 157 mm of the hinge axis: the north one clears wall r241 (281 mm away) by 36–124
  mm and ends before wall r240; the south one passes over the 13 cm platform r284. So the room is there; what is
  left is the stand-off of the rear bracket (Figure 8, size not given), a spacer plate where it falls short, or a
  leaf hung nearer the street face (more pillar depth behind the axis).
- **The alternative, Nice Walky (articulated arm; manual ISTWLR02.4865, scratch `walky/`), checked 2026-10-25.**
  Proven (manual): 100 Nm, leaves ≤ 1.8 m (full arm) / 1.6 m (shortened) and ≤ 100 kg (Graph 1; ≤ 180 kg at
  0.8 m), ≤ 2 m tall, ≤ 110° (≤ 90° with a shortened arm), 100 cycles a day, IP44, 90 × 125 × 385 mm, the arm
  in the leaf's upper part, a column at least 80 mm wide; inputs PP (step by step) and STOP only (no Open, no OGI;
  the flash / lock outputs are reprogrammable with Nice's Oview), Bluebus photocells, and a **BusT4 connector**.
  Mounting: B = the hinge axis to the column face (~115 mm with the leaves on the pillars' centre line), A from
  Graph 2A; E = the motor's centre line to an obstacle: 80–299 mm → shortened arm, ≥ 300 → full arm.
  Hypothesis (arithmetic, plan geometry, Graph 2A read by eye): on the 200 mm garden face of r280 the 125 mm
  body needs A 144–219 mm, and E = 281 − A ≥ 80 caps A at 201: a **shortened arm, 90°**, fine for 1.385 m leaves;
  on r281 nothing stands beside it (the platform is 13 cm) → full arm. No stand-off plate needed.
- **Decision (owner, 2026-10-25): keep the quoted Leggio 300.** Compared: the Walky 2024 kit (fits the pillar face
  directly, BusT4, IP44; ~500–840 € online, not on Leroy Merlin France as a 2-leaf kit) and the Wingo (a ram like
  the Leggio, same stand-off question; 2024 kit ~255 € at Leroy Merlin Italy, 5024 595 € in France); prices from
  search listings (Hypothesis). With the Leggio, ask the installer for A/B 150/150 (the least stand-off, 35 mm)
  and the rear bracket's own stand-off.
- **Options for the owner's controller, in order** (Hypothesis until tried on the unit): (1) an ESP32 on the
  IBT4N connector (likely Nice's BusT4 port: power and the protocol; community `esphome-BusT4`), pinout and
  current to check; (2) relays on Sbs / Open plus an optocoupler on OGI, with its own 5 V supply from the
  unit's 230 V feed (the Flash, OGI and ECSbus outputs are not steady supplies); (3) the quoted Wi-Fi interface
  (LM 98747037, model unconfirmed; not IT4WIFI's 83701302) with the owner's own app on Nice's undocumented local
  protocol (community: `homeassistant_nice`). The Wi-Fi interface is **optional** (owner, 2026-10-25: the remotes
  suffice); dropping it from the quote is the owner's call.
- Link to the hub: Wi-Fi, or (suggested) a network cable in the gate's trench to an ESP32 PoE board. Outdoors:
  inside the Nice box if it fits, else an IP65/66 box ≥ 40 cm up, bottom glands, drip loops, a breather vent,
  shade, surge protection on a long cable, a 30 mA RCD on the 230 V feed.

### The pedestrian gate's electric strike (owner decision, 2026-10-25)

- **Decision: a custom upright, not the quoted Klos'up kit** (quote line 88975782, 399 − 59.85 = 339.15 €).
- **The kit** (Proven, klosup.fr page and notice, kit images):
  - its parts: a "demi-montant" upright with an end cap screwed to the latch pillar, a "battement" carrying the
    strike, a key lock, a 12/24 V AC/DC strike "en émission", and screws;
  - it needs "1070 mm entre piliers, finitions type enduit comprises" (the standard 1040 + 30);
  - no IP rating and no memory function are stated, and the strike's make is not named;
  - Klos'up sells no electric strike on its own (searched: only the plain keeper 206093KIT and a sliding-gate
    strike).
- **The custom version** (the kit's layout, own parts; layout drawn in the scratch plot `door-tube.mjs`):
  - an aluminium tube screwed full height to the latch pillar r282's side face, packed out so the strike's face
    sits ~4 mm from the leaf;
  - a narrow strike that releases when powered (fail-secure), set in a slot in the tube;
  - a flat strike plate on the tube until the electric strike goes in.
- **The Leroy Merlin set considered** (sold by Leroy Merlin, Proven 2026-10-25):
  - EXTEL strike 54843684, 19.90 €: 250 × 25 × 31.5, 90 mm body, 12 V AC/DC, a mechanical memory, a manual
    release lever;
  - STANDERS tube 45 × 25 × 1.5, 87825777, 14.90 € per metre;
  - LUXENS non-ferrous primer 84235833, 13.90 €;
  - V33 Décolab RAL 7016 "poudré" spray 80153504, 14.90 €, matching the gate's "texturé" finish.
- **Fallbacks:**
  - a tube 50 × 30 × 2 (marketplace 88311485), or 50 × 30 × 3 if the strike is ≤ 20 mm wide;
  - narrow strikes 15–16 mm wide, all published sizes: effeff 118 W (IP54; Leroy Merlin's marketplace has only
    the 118 E), IZYX 25XMU10 (memory), Dorcas 41.
- **Open, all Hypothesis until measured:**
  - whether the EXTEL body is ≤ 20 mm wide, so it fits the STANDERS tube (22 mm inside);
  - the leaf width, 990 (LM listing) vs 995 (Klos'up notice);
  - the hinge-side gap, 20–25 mm;
  - the latch's throw and height on the delivered gate.
- **Opening:** ~1075 mm between pillars, render included, to absorb masonry tolerance, the tube packed to fit
  (Hypothesis); not yet in the plan, where r243 is still 1.04.
- **The pillars are not built** (owner, 2026-10-25), so build in:
  - in r282: a Ø20 sleeve out behind the tube at ~1.00 m (the Trez guide's height), and a spare sleeve on the
    street face (~1.40) for a bell or keypad;
  - sleeves for the Leggio on the car-gate pillars;
  - separate buried 230 V and data conduits.
- **Wiring:**
  - the strike on a 12 V supply switched by the ESP32's relay;
  - if the lock is key-locked so the handle is dead, an inside exit button wired in parallel with that relay;
  - deburred holes with a grommet in the tube, about a 1 A fuse, stainless screws in the aluminium;
  - with no power the key still opens the gate (Proven, the notice: the multifunction lock always opens with the
    key).

## The panel (owner, 2026-10-22)

The owner's panel is a **Legrand Drivia ready-wired T4 panel**, 3 rows × 13 modules (Leroy Merlin
71653631), on the basement's south wall about 20 cm from its east wall (owner). Built-in product
`panel_drivia_3x13` (`src/core/materials.js`, sources there and in `docs/materials.md` "Panel").

- **A `panel` marker carries the product** (`marker.product`, like a switch product; AR
  `MATERIAL · PANEL`). The marker is the enclosure's centre on the wall; the 3D model stands on its
  nearest wall face like any wall device (`wallMarkerPlacements`), back on the wall.
- **The breaker markers stay where they were surveyed.** The owner uses them as the head of each
  circuit line (owner, 2026-10-22: "placeholders for connecting markers in the same circuit line"):
  the home run's conduit and wires end on them. Moving them into the panel would re-route every
  home run, so they are not moved.
- **A breaker's place in the panel is three fields on the breaker:** `panel` (the panel marker's
  id), `row` (1..3, top first) and `slot` (1..13, the module its left edge is on). Saved additively
  (`breakerFields`, no FILE_VERSION bump); a floor paste keeps them only when the panel was copied
  too. Nothing is stored on the panel.
- **The fill is derived** (`panelFill`, `src/core/panel.js`): each row starts with its RCD switch
  (the product's `rows[i].rcd`, 2 modules), then the breakers that name it, in slot order. A
  breaker off the rail or overlapping another module is listed as `misplaced` and not drawn (the
  first in marker order keeps the slot). Every free module shows a white blank.
- **Which RCD heads which row is an estimate** (63 A AC, 40 A AC, 40 A type A, top to bottom);
  confirm on the panel. Type A is the one the washing machine and the hob need (NF C 15-100,
  Hypothesis until checked against the standard).

Next steps, not built yet (proposal 2026-10-22, owner to confirm the order):
1. AR editing of a breaker's slot (and its `number`/`rating`/name), today only through a headset write.
2. A label on each module (circuit number, rating, name) in its circuit's colour, and a thin line from
   each slot to its breaker marker.
3. Pointing: a slot highlights its circuit's wires and devices on every floor; a device highlights its slot.
4. Checks on the panel: a full row, a breaker rating too high for the cable, a washing machine or hob not
   under the type A RCD, a breaker marker with no slot.
5. The three label strips as a printout.

## Status (as of this writing)

- Conduit network, wires, routing, risers, wall-pinned junctions: **implemented**
  (build-verified; the whole AR conduit/wire lane is not yet walked on device — see
  `docs/ar-survey.md` and `.claude/handoff.md`).
- `breaker` marker type + `number`/`rating`/`poles` persistence, and `circuits.js`
  derivation: **implemented** as model helpers.
- Selected-wire circuit membership highlighting in AR: **implemented**.
- Circuit diagnostics (`MARKER · CHECK`: cross-tie, no breaker, unwired): **implemented**,
  build- and Node-verified, not yet walked on device.
- **Not yet done** (deliberately deferred): surfacing circuits in any output (the print
  sheet stays as-is), per-circuit coloring/numbering/schedule, diagnostics outside AR (desktop/sheets),
  AR editing of breaker `number`/`rating`/slot. A breaker's place in a panel (`panel`/`row`/`slot`)
  and the panel's 3D fill: **implemented** (2026-10-22, Node-verified; see "The panel").
