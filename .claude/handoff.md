# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc: live state only. Stable detail lives in the
repo docs (project knowledge is repo-only; rule in `CLAUDE.md`, "Where project knowledge lives"):

| Doc | What it holds |
|---|---|
| `CLAUDE.md` | **Top rule: label every claim Proven/Hypothesis.** Core architecture, desktop 3D viewer, sheets/DXF/change map, build, git + commit-body rules |
| `docs/product-intent.md` | **Why** the AR tool exists: tape-measure survey, drift/RECAL, multi-floor decisions, Guardian |
| `docs/ar-survey.md` | **How** the AR tool works: every mode (incl. PROJECT · PERF), HUD lines, **performance rules**, durable traps |
| `docs/ar-qa-checklist.md` | What has actually been walked on the Quest (mostly stale — see Open questions) |
| `docs/electrical-workflow.md` | Conduit / wire / control-link lanes, derived circuits, owner decisions |
| `docs/plumbing-workflow.md` | The pipe lane (first slice) and what's deferred |
| `docs/furniture.md` | IKEA GLB pipeline, CORS proxy, furniture zones + products (the merge), procedural furniture (products with no IKEA model: bed, Daikin units, shower tray, piano, **towel and panel radiators**) |
| `docs/product-modelling.md` | How to model a product with no 3D model from specs/drawings/photos (incl. per-retailer photo access; **step 7: a photo finish for View 3D Realistic**); run by the `/model-product` skill |
| `docs/realism.md` | View 3D **Realistic** setting (sun, downloaded sky, AO) and **photo finishes** (Charme, Monastère); owner rule on runtime-downloaded images |
| `docs/share-view.md` | View-only share links, `link`/`qr` export, read-only viewer; **parked**: Quest-to-TV live mirror + Steam Deck big-screen viewer (options worked out, not built) |
| `docs/markers-plan.md` | Marker lane design + roadmap |
| `docs/materials.md` | **Texture preparation in a worker** (plan view prepares nothing 3D, the View 3D loading wheel, phone memory), surface finishes, flooring/tile/mosaic/octagon (**diagonal**)/terrazzo/pinwheel/**stepped random (Monastère)**/**stone wall tile (Lucia)** products, **pattern start corner + 90° turn**, **grout weight**, the View 3D **detail layer**, reflections, door (**drawn open in both 3D views**; **rail-hung sliding door**), window (Héméra window + porte-fenêtre, **Néva sliding bay**), switch, outlet and Ethernet products, doorway kinds (incl. **PASSAGE**): owner decisions, continuity rule, takeoff method + limits, phases |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-10-08 (session 40, continued; the Quest was reachable all session)
**Status:** Proven (git, 2026-10-08): everything committed and pushed on `main`; the app head is
`2f3771a` (the WASTE pipe service; `git log -1 -- src`). Proven (`update-app` output): the headset
precache holds `d68a7c9` (same app, docs after it). Proven (`quest-storage read` after each write,
byte-identical): the headset plan carries every session-40 edit (items 49, 53, 59, 60); the last write
was the WC stack + VMC riser (item 60). Scratchpad backups before each
write are session-local (gone in a new session); no save slot holds a pre-edit copy, so undo = reverse
the edit in AR. Nothing from sessions 38–40 has been reported from the device (items 31–57 unwalked),
except the version.json fix (item 46, Proven on the headset by CDP).
Proven (owner, 2026-10-03, after `856592c`): their link's 3D view opens on their phone.
Owner-confirmed on the Quest: AR performance (session 29), the MATERIAL flow, the 3D-only AR view,
FURNISH's removal (session 32), the floor pattern **start corner** (session 33), and in session 37 the
PERF clipboard report (two reports pasted) and an AR 3D view frame rate the owner accepts (50–80 fps on
Ground with 33 device products). Everything else from sessions 30–40 is verified by build, Node or a
scratch/desktop browser only (Next step A).

## What the app is today (the gist, no code needed)

**One app, three surfaces**, all from the same static Vite build at
**https://krosk.github.io/house-cad/** (also a sideloaded Quest 3 APK, `com.krosk.housecad`, that
boots straight into passthrough AR):

1. **Desktop/mobile 2D plan editor.** Draw axis-aligned rectangles tagged **add** (room space) or
   **subtract** (wall, door, **passage** (open doorway), window, garage door, half wall, heater,
   sliding door, insulation, stairs up/down, cabinet, **furniture** (can carry a real product)). Exact sizes come only from **dimension
   constraints** (a 2× 1-D least-squares solver). Multi-storey: independent plans stacked on a shared
   origin. Outputs: to-scale print/SVG/PNG sheets per floor (monochrome, optional change-map revision
   clouds vs a saved slot), DXF + a simplified Coohom DXF, STL/OBJ/GLB mesh, JSON save.
2. **Desktop/mobile 3D viewer (`◈ View 3D`).** An **architectural** reading of the plan
   (`src/core/architectural3d.js`): room floor slabs, an inferred 12 cm outer wall shell, WALL and
   INSULATION zones as solids, doors and windows cut from their sill/head (door leaves drawn open), procedural stairs, 8 cm
   marker faceplates, IKEA furniture, light markers that light the room, and **textured surface
   finishes**. One floor at a time: a top-down overview (pinch/wheel zoom; a wide house turns 90° on a
   portrait phone) ↔ tap a room for a 1.65 m POV (tap a floor to walk there, Overview button to leave,
   opt-in phone tilt look). Rules in `CLAUDE.md`. **Mesh exports still use the legacy extrusion.**
   It is built only on demand: ◈ View 3D prepares the model and every texture (in a background
   worker) behind a loading wheel, then opens; the plan view does no 3D work.
   An opt-in **◑ Realistic** setting adds the real sun for a time of day (north = plan up), a
   downloaded sky, ambient occlusion, and the retailer's own photos on the Charme oak and Monastère
   floors (`docs/realism.md`).
3. **AR survey tool on the Quest** (`src/ui/mr.js`, the only authoring surface on the device).
   Register the house to a real corner, then author at 1:1 with a tape measure: rooms/walls/edges,
   dimensions via a 3D numpad, markers, heights, electrical conduit + wires (electrical or Ethernet)
   with circuit diagnostics, a plumbing pipe network, **surface materials and door, window,
   furniture, switch, outlet and Ethernet products** (all in the MATERIAL group), a **HEATING** group (pipes, room heat loss in W, insulation R
   / window U), save/load in 6
   slots, export (sheets, DXF, JSON, view link, QR), and an **AR 3D view on LEFT X** that hides every
   plan overlay while on. Mode list: `docs/ar-survey.md`.

**Sharing:** `🔗 Share view` (desktop) or the AR `link`/`qr` export opens a **read-only** session.
Detail: `docs/share-view.md`.

**The goal (unchanged):** Phase 5 — an on-site MR survey tool, multi-storey, authored entirely in AR.
Read `docs/product-intent.md` before planning AR work.

## What changed in session 40 (2026-10-06 evening – 10-07)

> Next agent: when you add your own section, fold what is still live into "Standing decisions" or
> "Findings" and shrink this list into the item index below.

46. **version.json no longer opens the app** (`8dc326f`; owner noticed). The service worker answered
    every navigation with `index.html`, so `quest-storage.mjs`'s "safe" `version.json` tab ran the app
    (it could autosave over a write). `navigateFallbackDenylist: [/version\.json$/]`; the tool checks
    `document.contentType`. Proven on the headset (navigation shows `application/json`).
47. **V&B Architectura wall-hung WC 4694R001** (`734560a`, `/model-product`): builder `wall-hung-wc`,
    rings measured from V&B's own STEP (3D data on the product page; owner chose procedural over a
    runtime STEP loader: proxy route + 3.1 MB reader). Generic slim seat (`seat`, `lidOpen` params).
    2 336 triangles; silhouettes within a few mm of the STEP. `docs/product-modelling.md` "A
    manufacturer CAD model (STEP)". Not seen in View 3D or AR.
48. **Heat loss air volume** (`ce85140`): floor area × room height minus each zone's real solid part
    (half wall/plinth to its top, heater its band, openings and stairs air); before, a 9.3 cm plinth
    removed a 2.70 m column. `docs/heat-loss.md` "Air volume".
49. **Headset plan edits** (owner's yes each time; AR closed, backup, `--base` write, read back identical):
    - half wall `r139` (Ground, the WC frame box): 0.22 deep (`c1003` −0.22), 1.15 high; new half wall
      `r210` (Upper, U1): 0.88 × 0.22, 1.15 high, tiled Lucia (sides + cap), `c1411`–`c1414`. Frame:
      Geberit Duofix 111.333.00.6 (50 × 112 × 12 cm, free-standing);
    - WC zones `r211` (Ground, facing 180, `c1415`/`c1416`) and `r212` (Upper, facing 0, `c1417`/`c1418`),
      `vb-architectura-4694r001`, foot 0.08 (rim 41.5 cm);
    - both Sensea trays (`r131`, `r136`) raised: foot 0.093, top 0.12; plinth half walls `r213`/`r214`
      under them (sill 0.093), pinned like their trays (`c1419`–`c1426`);
    - Upper `r207` radiator: EASY horizontal 120×60 → **90×60** (1 448 W), bottom end kept on the
      window jamb (`c1406`).
50. **Whole-house balance** (`ce85140`; owner: one water temperature for every radiator): WHOLE HOUSE
    toggle `balance` (off by default) + plaster partition λ 0.40. `houseBalance` solves every heated
    space at the set ΔT: valves cap rooms at tRoom, short rooms settle lower and draw heat through
    partitions (U from the gap) and floors; the hall + upper landing are one node (stairwell).
    Panel: reached °C per room, "Reaches … · from neighbours …", "Water needed". On the plan (22 °C,
    ΔT 24): shower room 20.4 °C at −7 °C; water needed 28.6 K at −7, 23.8 K at 0 °C, ≈ the tightest
    room alone (valves hold the others at exactly tRoom: deliberate). `docs/heat-loss.md`.
51. **Answers, no code (owner's heating decisions, Node on the headset plan):** the owner keeps water
    at ΔT 24 (46 °C mean) and accepts the −7 °C shortfalls; the ground shower towel radiator sets the
    water temperature (upgrade to the 173 cm Angora suggested), then the hall + landing (EASY 60×200
    suggested); a gas condensing boiler heats for the next 5 years, then a heat pump; the
    basement-ceiling board: **SOPREMA PU 25 mm, R 1.0, €11.42/m²** (Leroy Merlin 69644526; no 20 mm PU
    sold there), ≈ 61 m² ≈ €700, ≈ €340–450/yr on gas (Hypothesis prices); covering only the living
    room fixes the living room only (other rooms over the basement stay near bare). The plan still
    models Ground floorR 0.9 (offered: set 1.0 if SOPREMA is chosen). Fire class and ceiling use of
    the SOPREMA board unchecked.

52. **Air conditioning planned (owner's Daikin 5MXM90A multi-split, four wall units):** positions,
    line routes and lengths, clearances and the Daikin rules are recorded in `docs/plumbing-workflow.md`
    "Air conditioning" (manuals read: indoor 4P518023-17P, outdoor 3P600450-9V). Lines total 32.41 m
    as drawn (+1 m each to buy); every line ≥ 3 m (Daikin minimum). Façade elevation plots were made
    in the scratchpad only (`ac-plot-*.mjs`, gone next session).
53. **Headset plan edits (AC)** (owner's yes each time; AR closed, backup, `--base`, read back identical):
    - indoor units `r148`/`r149` (Upper) moved beside their windows, top 2.50 (`c1184`/`c1186` replaced by
      `c1427`/`c1428`); `r215` FTXM60A and `r216` CTXM15A added on Ground (`c1429`–`c1432`); the owner then
      moved `r215`/`r216` over their windows and `r149` to y 3.11–3.91 in AR themselves;
    - outdoor unit `r217` (plain furniture box) under camera m183 (`c1441`/`c1442`);
    - four `refrigerant` pipe networks `pn1`–`pn35` / `p1`–`p31` (needs `a913657`+: older builds turn
      an unknown service into `cold` on load).
54. **Shutter outlets take outlet products** (`4da7198`; owner: to see whether the AC units leave room
    for them). Model check: the upper shutter outlets' 87 mm plates clear the CTXM15A's curved underside
    by ~6 cm; the steel mounting plate behind is the unknown.
55. **Window swing** (`74e4bff`): `src/core/windowSwing.js`; AR MATERIAL · WINDOW overlay (fan, arc,
    leaf at its stop, obstacle red, readout per leaf) and View 3D **◫ Windows open (max)** toggle.
    Proven: the 3D leaves' free edges land on the computed points (0 mm). On the plan now: r80 96°
    (radiator r205), r108 155° (r204), r113 98° (unit r148), r114 100° (radiator r208), r115 175°.
    `docs/materials.md` "Window swing".
56. **HEATING · PIPE `refrigerant` service** (`a913657`, green; the readout adds the selected
    network's 3D length).
57. **A share link from the headset plan** (owner asked): built in Node with `encodeViewToHash` on a
    fresh `quest-storage read` (round-trip checked), given in chat in a code block, never in the repo.
58. **TOOL menu** (owner: "cycling through menus has grown big"): a right-thumbstick **tap** opens a
    panel of every tool by group; ray + trigger jumps to one. The hold-to-exit is unchanged (its bar
    starts after the 0.3 s tap window). Build only; never seen on the Quest (`docs/ar-survey.md` "Tool menu").
59. **VMC** (owner): a `vmc` pipe service (light grey, ducts drawn at their diameter, readout per
    diameter) and the Sauter Agalina extra-plat unit as furniture (`sauter-agalina-extra-plat`, plus a
    `-wall` variant mounted flat on a wall). Two units drafted with their ducts (unit A above the kitchen
    fridge, roof outlet; unit B on the wall of basement r76 under column r122, outlet beside the garage
    door; the upper duct inside WC half wall r210 and the slab): `docs/plumbing-workflow.md` "VMC".
    Written to the headset on the owner's yes (2026-10-08; AR closed, backup, `--base`, read back
    identical): r218, r219, boxing r220, 20 `vmc` segments (`pn36`–`pn57`, `p32`–`p51`). Then, owner
    asked: the Geberit Duofix 111.333.00.6 frames as plain furniture boxes inside the WC half walls,
    `r221` (Ground, in r139) and `r222` (Upper, in r210): 50 × 12 cm, 0–1.12 m, centred on their WC,
    2 cm behind the half wall's face (Hypothesis: the board thickness). Same check, read back identical.
    Then B's outlet moved 0.47 m from the garage door (`pn56`/`pn57`, read back identical). The duct
    rules (DTU 68.3 via the RE2020 checklist) are in the VMC doc; owner: no inspection, efficiency only.
60. **WASTE pipe service + WC stack and VMC riser draft** (owner, 2026-10-08): a `waste` service
    (brown, Ø100 default, no slope semantics). **Written to the headset** on the owner's yes (2026-10-08;
    AR closed, backup, fresh read unchanged, `--base`, read back identical; `p53`–`p61`, `pn60`–`pn68`): the upper WC's
    stack in column r122 (extended 23 cm north, c774 −0.20 → −0.43), its roof vent up half wall r210 and
    boxing r220 (widened to 27 cm), the basement run back to laundry r66 (exit later); unit B's upper VMC
    duct re-routed against the west wall on both floors, straight down the column, slab runs 3 cm under
    the floor (trenches 11 / 13.5 cm), 45° pairs at the two rigid turns, soft pieces at both ends. Every
    coordinate and choice is in `docs/plumbing-workflow.md` "VMC" / "WC stack".
61. **Heating pipes, radiator layout: answers + a sketch, no code, nothing in the plan** (owner,
    2026-10-08; pipes are composite/multilayer): boiler (gas, later a heat pump) at the water heater
    in the basement north-east room; manifold on the boiler; every ground radiator on its own pair
    (kitchen and shower too); the upper floor on two pairs up column r122 (north bedroom; bathroom +
    south bedroom); **16×2 only** (owner); the contractor routes along the basement north then west
    wall, past the garage door (fit is a site check). Lengths ≈ 190 m (sketch). The owner asked to
    keep the maps: scratchpad `heat-map.mjs` / `-zh.mjs` / `-c.mjs` + PNGs (session-local, so the
    route geometry is also recorded in the doc). Detail: `docs/plumbing-workflow.md` "Heating pipes".

### Item index, sessions 38–39 (detail in the docs and `git log`; numbers are cited below)

1–3 links carry furniture/finishes/markers; URL-copy failure reason (cause unknown) · 4–5 photo finishes
+ process · 7–9 textures in a worker, plan view prepares nothing 3D, phone memory · 11 collapsible View
3D floor panel · 12–13 Moder II table, modelling from isometric manuals · 14 Vernisse grid · 15 Lapeyre
quote applied (open: which French door has the Sw 0.51 glass; Hypothesis `r111`) · 16 half-wall finishes
· 17 headset editing tools · 18 slab thickness (Ground 2.95 / 0.25, rooms 2.70) · 19 `update-app` after
every deploy · 20 IKEA kitchen (r153–r168) · 21 wall layers + earth level (open: `r112` 7 cm on an
exterior edge; real earth level) · 22 conflict suspects · 23 Vernisse relief, software-painted finishes ·
24 five deleted dims re-added · 25 heat map, R or λ, RECESS (agreed, not started: the heat map on the AR
3D view's walls) · 26–27 conflict signs + routes; the owner's r59 → r60 conflict (open: which value was
wrong) · 28 HUD edge id · 30–31 PERF reports, furniture plan pieces batched (fps not re-measured) · 32
RULER · 33 OUTDOOR rooms · 34–38 heat-loss what-if, radiators, owner facts · 39 thermal bridges (DPE ψ,
AR junction view) · 40 per-floor heaviness, partition thickness · 41 floor R only over the basement ·
42 own-gap fix, ΔT 1 K steps · 43 open stairs join their room · 44 furniture-only dims on sheets (CJK
legend overlap seen) · 45 the owner's heating plan (`docs/heat-loss.md` "Heating plan").

## Standing decisions (live constraints; the "why" is in the docs above)

- **Heating (owner, 2026-10-07):** one water temperature for every radiator, kept at ΔT 24 (46 °C
  mean); the −7 °C shortfalls are accepted. A condensing gas boiler for the next 5 years, then a heat
  pump. The whole-house balance stays a toggle, off by default. Detail: `docs/heat-loss.md`.
- **VMC and waste (owner, 2026-10-07/08):** two Sauter Agalina units; ducts and the WC drain live in
  the pipe network (services `vmc`, `waste`). The owner wants an **efficient** system and will invite no
  inspector: DTU 68.3 limits are guidance, not compliance targets. Prefer **few bends, pipes against the
  wall, shallow slab trenches**; rigid PVC Ø80 for the long riser, soft insulated pieces at both ends.
  Keep product advice **generic** (the owner may not find a given brand; a brand's datasheet is only a
  source of typical sizes). Plots: the owner asks for elevations "west wall facing me" (north on the
  right), sometimes in Chinese. Detail: `docs/plumbing-workflow.md` "VMC".
- **Air conditioning (owner, 2026-10-07):** outdoor unit under the west-façade camera; refrigerant lines
  drawn in the pipe network (service `refrigerant`), not the electrical conduits (WIRE routes through
  those); no trench (high shared duct). Detail: `docs/plumbing-workflow.md` "Air conditioning".
- **Products with manufacturer CAD (STEP):** build procedurally, measured from the STEP (owner,
  2026-10-06); a runtime STEP loader stays acceptable in principle but needs a proxy route + 3.1 MB reader.
- **The owner's house is now edited directly on the headset** (owner, 2026-10-04: "we will keep
  continue modify the house via direct edit"): changes they ask for go into the headset autosave
  through the `quest-edit` skill (`docs/headset-data.md`), not into a Deck export. There is no Deck
  copy any more (owner deleted the rev 9 export, 2026-10-06); read the headset.

- **Label every claim Proven or Hypothesis** (`CLAUDE.md` top rule), in reports, commit bodies, docs.
- **Session 36 features (folded):** the AR group **HEATING** = PIPE (id `marker_pipe`) + HEAT LOSS +
  R / U (`docs/heat-loss.md`: simplified EN 12831, settings are project data, openings store U);
  stairs hold only their own steps from their floor at an 18 cm riser (going 25 cm, a Hypothesis);
  CONDUIT · EDIT `LENGTH` / `RUN`; ACOVA and De'Longhi radiators and the JOYFURNOS bin as procedural
  furniture (`docs/furniture.md`). Stairs stay circulation, not rooms, in heat loss (owner: "No need
  yet" to merge them).
- **Session 37 features (folded):** PLAN · EDIT FOOT/TOP move a furniture product as a unit; PROJECT ·
  PERF sweeps the AR 3D view's layers and the stop trigger copies a full report (ask the owner to paste
  it). The plan possibly drawn under the AR 3D view is parked (Next step D′).
- **AR 3D view geometry budget** (session 37): products are merged per material
  (`mergeByMaterial.js`), so **a product material must be cached per entry** (not created per call)
  to merge across items; device products are built at `detail: 'low'` in AR (a new design must use
  `D.dirs` / `D.slope` / `D.collar` / `segs()`); AR furniture is Lambert. Desktop is untouched.
- **Git:** commit + push directly on `main`, only when asked. **Every push publishes** (Pages
  auto-deploy). Non-trivial commits need a **descriptive body**. Stage by explicit path, never
  `git add -A`.
- **Project knowledge is repo-only.** Design docs, decisions, and traps go in `docs/`; never
  agent-private memory.
- **AR overlays are batched, never one Mesh/Sprite per item.** Reuse the patterns in `docs/ar-survey.md`
  → "Performance notes". **Measure with PROJECT · PERF before optimising**; reading the code
  guessed wrong once already (floor fills looked like the suspect; markers were the cost).
- **Axis-aligned rectangles only** for Phase 5; exact size only from dimension constraints.
- **Drift = RECAL + tape; no per-room anchors, no Quest room scan.** → `docs/product-intent.md`
- **Heights are floor-referenced only**; Z is not in the solver. → `docs/ar-survey.md`
- **Every marker is an 8 cm × 8 cm fixture** (owner spec) unless it carries a switch/outlet product;
  3D placement is presentation-only.
- **Exports stay on the legacy extrusion** until the architectural 3D model is visually accepted.
- **Markers, conduit, wires, pipes, furniture are parallel lanes**, never in the solver/footprint
  pipeline; circuits are derived, never stored, not in any output. → the workflow docs
- **Sheets are monochrome**; conduit/wires/pipes never print; DXF `wiring` layer is opt-in.
- **AR input model:** thumbstick-x = mode, thumbstick-y = cycle, A/X = flip, B/Y = delete (undo in
  `MARKER · CONDUIT`), grip = non-destructive, trigger = commit. RIGHT edits; LEFT is a companion.
- **Shared views are read-only.**
- **This machine is a Steam Deck** (Node v20 via nvm); the fnm/PowerShell block in `CLAUDE.md` is
  Windows-only.
- **Circuits are derived per wire nature**; Ethernet never counts toward breakers. CHECK flags only
  `needsPower` devices (outlet*/switch/light), and never flags spare breakers (owner choices).
- **A double switch is one `switch_dual` marker** with per-rocker links (owner, 2026-09-28) and
  **per-rocker wire ends** (2026-09-29: each rocker may be its own circuit); rockers read **left/right**
  in the UI (1 = left facing the switch), storage keeps 1/2. Older two-marker pairs still load and work,
  and A/X in MARKER · EDIT merges one (never on retype). Wires drawn before session 35 sit on the left
  rocker; the owner moves them with A/X on the wire in MARKER · WIRE. Never draw stacked markers apart in AR; an
  amber count badge shows the overlap (owner's choice).
- **One grip cycle for every picking mode** (`gripCycle`, owner 2026-09-29): sticky target, grip steps
  a fixed ring, `i/n` shown when 2+ targets. A new picking mode should use it, not its own distance sort
  (a distance-sorted "next after" jumps with the hand).
- **Every stored length is on a 0.1 mm grid** (`CLAUDE.md` "Units"): a new stored length field must
  be added to `Project._snapToGrid`; `===` on stored coordinates is then safe.
- **Materials** (`docs/materials.md`):
  - Monastère is laid **stepped random** (owner, 2026-09-29), not pinwheel; the pinwheel code stays,
    unused by the catalog;
  - patterns are anchored at the plan origin (a stepped pattern: centred in its region), unless a laying region sets its own **start corner**
    (A/X near a corner; one per region so joints stay continuous through doorways) or a **90° turn**
    (A/X away from corners); floors only, walls keep the plan origin;
  - grout weight is shown per room only (owner); no waste margin; ρ 1.6 is generic, not a product;
  - same-material rooms joined by a doorway are one region; different materials meet mid-doorway;
  - packs are rounded once per product for the whole house;
  - wall faces are set one at a time: the owner removed a copy-to-every-wall action, so don't re-add it.
- **Products with no manufacturer model are code, never stored GLBs** (owner decision): a
  `procedural` furniture builder or a door `design`. A non-code model would go in
  `public/furniture/models/` (not built). Follow `docs/product-modelling.md` / `/model-product`.
- **A door product is a material of its DOOR zone** (owner decision), authored in MATERIAL · DOOR;
  made-to-measure products take the zone's size. A **rail-hung** product (`mount: 'rail'`) goes on a
  **SLIDING** zone instead, at its own fixed leaf size (zone = opening, swing = rail face, hinge =
  slide side). **Window products follow the same rule** (WINDOW zone, MATERIAL · WINDOW); a product
  with its own `leaves` ignores the zone hinge. Portes-fenêtres and bays go on WINDOW zones with sill 0
  (owner).
- **Every product generator embeds its source material** (owner, 2026-09-28): a `// Sources:` block
  with page URLs, spec values, photo/PDF ids and what each gave, and the estimates. Ids, never copies.
- **Switch, outlet and Ethernet products are a material category on the marker** (owner, 2026-09-27):
  stored as `marker.product` (not a finish, carried by view links), switch products on switches,
  outlet products on `outlet` / `outlet_appliance`, Ethernet products on `ethernet` only (not
  `ethernet_dual` / `camera_ethernet`). **Model only the visible parts** (plate, rocker, socket), never the in-wall
  mechanism. A `switch_dual` takes only a two-rocker product; on an old two-marker pair a multi-rocker
  product is set on the whole stack and drawn once. Where targets overlap, **grip cycles them before
  the trigger selects** (owner).
- **Catalog entries for the owner's real products replace generic placeholders** when the owner says
  so (`octagon_200` removed for Etruria). A saved finish naming a removed id shows as no material:
  every `materialById` caller handles null.
- **Images: downloaded at runtime and cached, never committed** (owner, 2026-10-03, amending "code
  only"). Procedural code stays the stored form and what AR, normal View 3D and offline use; the
  retailer's photo (or a CC0 Poly Haven asset) may replace it in View 3D **Realistic** only
  (`src/ui/photoFinishes.js`, `docs/product-modelling.md` step 7). Photos used while modelling stay in
  the scratchpad.
- **Every texture is prepared in the background** (owner, 2026-10-03): never paint a texture on the
  page from a build path; add a painter to `src/ui/painters.js` + `paintedTexture()`, or a worker job.
  **The plan view prepares nothing 3D** (owner): View 3D builds and loads behind its wheel on demand.
  Phones get half-size textures; texture canvases are freed after upload (`docs/materials.md`
  "Texture preparation in a worker").
- **North is plan up (+y)**; the site is Val-de-Marne 48.79° N 2.45° E (`SITE` in `realism.js`). The
  owner views the desktop on a Steam Deck and an iPhone 14.
- **Share links carry everything View 3D draws** (owner, 2026-10-03): furniture, finishes and markers,
  regardless of the AR sheet layers; QR without markers. What a link still drops (constraints, control
  links, conduits/wires, pipes, heat settings, R/U): `node tools/check-share-link.mjs <house.json>`.
- **View 3D reflections are on demand, per device** (owner: some devices struggle): off by default,
  `localStorage`, never in project/share data, and **cleared for AR sessions** (Quest cost). AR
  reflections were asked about, not built: `docs/materials.md` lists what they would need.
- **AR furniture models show only with the AR 3D view on**; otherwise flat plan pieces (owner, 2026-09-27).
- **The AR 3D view (LEFT X) shows only the 3D model** (owner, 2026-09-27): plan overlays are hidden
  for the render only (`hideForArch3d` / `view.onXRAfterRender`), so modes' visibility logic is
  untouched; reticle, HUD and panels stay. It draws a **white ceiling** and **opaque exterior-picture
  glass** (owner, 2026-09-27); the real floor still shows. Desktop View 3D keeps transparent glass.
- **MATERIAL · FLOOR A/X** = start corner (near a corner) or 90° turn (elsewhere); the thumbstick stays
  the material cycle. A/X is the flip/turn button in every mode.
- **An applied material is a centre badge on the AR plan, never a coloured fill/strip** (owner, 2026-09-27).
- **PASSAGE** (owner, 2026-09-27): an open doorway between two rooms; floors meet at its middle like
  a door; no leaf, nothing to rotate.
- **The controller readout holds up to 6 lines** (tighter pitch past 4); a mode that needs more must
  condense, as the mixed-format house line does (`HOUSE 8 · 4 · 2 packs`). Pills **widen** to fit up to
  `LABEL_MAX_W` (576 px) before the font shrinks (owner, 2026-09-30); no marquee (per-frame uploads).
- **Doors are drawn open in both View 3D and the AR 3D view** (owner, 2026-09-27; AR was closed
  until then). `main.js` and `mr.js` both pass `openDoors` / `open`.
- **A mixed-format product counts and boxes each size separately** (each is its own article): `pack:
  { formats: { '50×50': 5, … } }`; the house box total appears only when every size's box is known.
  No wastage margin and no offcut reuse (the owner was asked; unanswered). The desktop has no
  quantity view yet.
- **Furniture merge** (owner, 2026-09-26/27, `docs/furniture.md`):
  - four facing directions only;
  - the product is picked in MATERIAL · FURNITURE (owner, 2026-09-27); a furniture zone is drawn in
    PLAN · ADD. ~~FURNISH (drop a pre-sized zone)~~ was removed: the owner said it overlaps;
  - sheets/DXF print the rectangle plus a front notch;
  - furniture solves one-way after the structure;
  - an over-specified furniture dimension is **deleted, never shown as a conflict**.
- **LEFT controller:** trigger = teleport, grip = hold-to-view sheet (**material card in MATERIAL
  modes**), stick-x = rotate plan, stick-y = storey teleport (ALL FLOORS), **X = AR 3D view**. Y and the
  stick click are free.
- **Heat loss stays simple** (owner, session 36): simplified EN 12831 chosen over W/m³; **exterior
  insulation is drawn as INSULATION zones outside the room** (within 0.6 m of the edge), linings inside;
  every setting configurable in AR. Owner's house: basement unheated and staying uninsulated (stair
  door closed), Ground part on an earth slab, flat ceilings under a ~1 m attic (blown rock wool
  planned), VMC, Val-de-Marne at 43 m. Limits kept on purpose (one indoor temperature, stairs not
  counted, attic = outside): `docs/heat-loss.md`. Stairs stay circulation, not rooms (owner declined
  merging them into rooms for now; their own walls are not counted).
- **Radiators are furniture products** (session 36): a FURNITURE zone against the wall, picked in
  MATERIAL · FURNITURE; the catalog `mountZMm` sets the height. They are not tied to the `radiator`
  marker or the HEATER zone kind (no link was asked for).
- **FLOOR changes only the ground height** (owner, 2026-09-30): it keeps the teleport and the plan's
  world yaw; only ORIGIN/RECAL re-register.

## Findings / traps worth knowing

- **`version.json` used to open the app** (fixed `8dc326f`): the service worker served `index.html` for
  every navigation. An old cached app (before the update) still does; `quest-storage.mjs` now checks
  the page's content type and warns. `docs/headset-data.md`.
- **Pipe services are normalised on load:** an app older than `a913657` turns `refrigerant` into
  `cold` and autosaves it. Any new pipe service (or other enum) must deploy and `update-app` **before**
  the headset write.
- **Share links carry no pipe network** (Proven, `src/io/shareView.js`): VMC ducts, the WC stack and
  the AC lines are missing from a link; only the headset plan has them.
- **The basement's west face is x −4.55** in the plan, 15 cm inside the ground floor's −4.705: a duct
  straight down against the ground-floor wall lands inside the basement wall (owner: a survey error to
  correct later; the VMC riser is drawn that way on purpose).
- **Plotting from a saved JSON shows stored, not solved, zone sizes**: load it through
  `deserializeInto` + `serializeProject` first (a widened column plotted at its old size).
- **Wait-for-deploy loops must grep the pushed hash** (`git log -1 --format=%h`): a loop with a wrong
  hash polled 7 minutes after Pages already served the build (owner asked "did the deploy fail?").
- **The diff tool ignores furniture heights** (`house-query.mjs diff` compares footprints and bands):
  check a foot/top edit from the edit script's own output and the read-back.
- **The AR app process stub** (`pidof com.krosk.housecad`) persists after the owner closes the app; the
  DevTools page list (no house-cad app page) is what shows it closed.
- **After every deploy, update the headset app if reachable**: `quest-storage.mjs update-app` makes the
  app's service worker take the live build, so the next launch opens it (`docs/headset-data.md`).
- **`floor.height` is floor-to-floor; the room height is `ceilingHeight(floor)` = height − slab**
  (owner, 2026-10-04; `docs/product-intent.md` multi-floor). Use `ceilingHeight` for anything that
  means the room (walls, ceiling, finishes, heat loss); `height` only for stacking and stairs.

- **A module the texture worker imports must never import `textureWorker.js`** (its `new Worker(new
  URL(…))` would bundle a worker inside the worker). Page sides live in `realism.js`, `view3d.js`,
  `textureWorker.js`; `photoFinishes.js`, `skyPixels.js`, `imageCache.js`, `painters.js` and the painter
  modules are worker-safe (no DOM at load; canvases via `newCanvas()`).
- **A texture freed by `freeAfterUpload` must never upload again** (`needsUpdate`, `dispose()`, or a
  lost WebGL context would upload its 1 px canvas). Ours upload once and are never disposed; a lost
  context on a phone would show flat textures until reload (Hypothesis, unseen).
- **Measuring main-thread stalls in an automation tab:** `longtask` / `long-animation-frame` entries
  and timers are unreliable once the tab goes hidden; a `MessageChannel` ping loop is not throttled
  and logs every gap. ◈ View 3D's opener waits on one rAF, so in a hidden tab it stalls at
  `Preparing 3D…` until a screenshot makes the tab visible. A session-38 claim that the photo atlas
  build "never blocked over 16 ms" was a bad measurement (it blocked 2.9 s); re-measure, don't trust it.
- **Profiling without the owner's house in the browser:** generate a synthetic house in Node with the
  same ingredients (finish ids, door/window products, furniture keys, marker types and products) at
  invented positions, encode it with `encodeViewToHash`, and open that link (scratchpad `synth.mjs`
  pattern, session 38).
- **A photo finish must never be tiled**: a tiled photo repeats every few metres and its wrap seams
  stair-step; cut it into pieces laid by the shader. **Joints/grooves must come from the texture**, not a
  shader branch, or they alias into dashes (both seen in screenshots, session 38).
- **When Chrome reports the automation tab `hidden`**, rAF stops: fps counts read ~0 and screenshots
  can time out. Drive the page with `javascript_tool`; get fps from the owner.
- **Clipboard writes in AR need a user gesture and almost no work before them.** EXPORT LINK and the
  PERF report both build their text beforehand and call `writeText` first thing in the trigger's XR
  `select` handler. The first PERF version built its report inside the trigger and the Quest refused
  it (`PERF COPY FAILED`); prebuilding fixed it (Proven: the owner pasted the reports). The owner
  rejected a download fallback.
- **The Quest browser has no GPU timer:** PERF's source reads `frame` (Proven, owner's reports), so
  per-layer ms are frame-interval differences and noisy. Per-layer **calls and triangles are exact**:
  calls = meshes × materials × 2 eyes (no multiview). Ask the owner to paste the report (stop trigger)
  rather than read the HUD.
- **AR frame rate swings with the headset's state:** identical content ran at 23 fps then 82 fps
  minutes apart with js 0.6 ms and render 2.7 ms (Proven, two reports). Compare runs only back to back.

- **`mr.js` does NOT subscribe to `project.onChange`.** AR model changes must call the rebuild by hand
  (`buildPlan()`, `buildConduits()`, `buildRoutedWires()`, …). Wire picking deliberately uses the legs
  cached by the last `buildRoutedWires` (it picks what is drawn).
- **Every planGroup overlay group must be in `PLAN_OVERLAY_GROUPS`** (`mr.js`), or the first
  `buildPlan` silently detaches it. That already hid four layers for several sessions.
- **Wall faces follow the finished surface, not the room rect edge** (`edgeFace` in `flooring.js`):
  - wall/insulation linings over the room edge inset the face (the owner's house has 18–21 cm linings);
  - edges onto stairwells are open;
  - a half wall in the wall line cuts the face above its sill; one standing inside a room cuts nothing
    (session 31 fix; `docs/materials.md`).
- **AR code runs only inside the XR closure.** Verify it in Node by slicing the verbatim functions out
  of `mr.js` into a harness with stubs (the scratchpad pattern used all session), or replaying model
  bookkeeping against `Project`. Say which you did.
- **The APK always opens `/house-cad/?ar=1`**, so URL switches (`?perf`, `#view=`) can't reach it.
  AR diagnostics need an in-menu toggle. It has no 2D view (exit = quit), but it shares
  `localStorage` with the Quest Browser, so the 2D page is the on-device import/export path.
- **Never run `adb shell pm clear com.krosk.housecad`** casually: it wipes the owner's autosave and
  save slots too. To pick up a new build, relaunch the APK and check the HUD `update:` line.
  adb is at `~/Android/Sdk/platform-tools/adb` or `~/.bubblewrap/android_sdk/platform-tools/adb`; both
  talk to one adb server, which finds the already-paired Quest over mDNS once Wireless debugging is
  on (an empty `adb devices` first can just be early or the headset asleep). If the Quest forgot the
  pairing: the sibling project's `../quest-mcp-test/.claude/skills/quest-connect/SKILL.md` (pair via
  QRookie's Flatpak adb; pairing and connection ports differ).
- **Reading or editing the owner's plan on the headset:** `docs/headset-data.md` (skill `quest-edit`,
  tools `tools/quest-storage.mjs` + `tools/house-query.mjs`). Traps: the browser must be the app in
  front of the wearer or DevTools calls hang; write only with the AR app closed, after a backup, on
  the owner's yes; the app re-saves edits in solved form (diff, don't byte-compare).
- **Retailer pages fight scripts:** Leroy Merlin = DataDome (Chrome only), Lapeyre = Akamai (exact
  curl headers), leboncoin rejects Node's fetch (curl passes). `tools/product-images.mjs` encodes all
  of it; a new site starts in its generic mode. Look at every gallery image, not just the first.
- **Chrome tools:** screenshots of a WebGL preview tab time out (every time in sessions 33–34, even on
  plain pages). Instead the scratch page POSTs `canvas.toDataURL()` to a tiny local receiver on :5191
  (a ~20-line Python `http.server` that base64-decodes the body to a file; rewrite it in the new
  scratchpad), and ffmpeg builds side-by-side comparisons with the photos. For a texture, sampling
  pixels with `getImageData` in the tab is enough to prove layout. The javascript tool returns a bare
  async IIFE as `{}` (prefix `await`) and blocks output containing a query string. Stop
  scratch Vite servers by port (`ss -ltnp | grep :5190`), not `pkill -f` (it kills its own shell).
- **Scratch previews of AR UI code** (session 35 pattern): a Vite config in the scratchpad (`root` = the
  scratch dir, `resolve.alias.three` → the project's `node_modules/three`, `server.fs.allow` both dirs,
  plain HTTP on :5190) lets a page import `/@fs/…/src/ui/*.js` directly, e.g. `materialCard.js` with real
  finish textures and product builders, then POST the canvas to the :5191 receiver.
- **HUD panels live in three's transparent pass** (order 90 sheet/card, 100 HUD, 110 pointer): world
  overlays ignore depth and draw in that pass too. An opaque panel would be drawn first and painted
  over; an opaque model on a transparent panel is painted over by the panel. The material card clones
  its model's materials as transparent (never mutate shared product/AR 3D materials).
- **`placeAt` is a fresh registration**: it resets `navOffset`, `navLift` and `anchorYaw`. Anything that
  only re-anchors (FLOOR) goes through `regroundAt`.
- **Measuring text width without a browser:** Node has no canvas; read glyph advances from
  `/usr/share/fonts/noto/NotoSans-Bold.ttf` or DejaVu Sans Bold (a ~40-line Python `cmap`/`hmtx` parser,
  no fontTools here). A per-character average is not good enough (not monospace).
- **Browser checks of the app:** Chrome shows an error page for the dev server's self-signed HTTPS, so
  serve `dist/` over plain HTTP (e.g. `python3 -m http.server 5192 -d dist`). The window can't be
  resized here: load the app in a 390 × 844 iframe for phone width. The app's service worker then
  serves the old build ("UPDATE AVAILABLE"): unregister it and clear `caches` in that origin. Synthetic
  `PointerEvent`s work for taps and pinches; the view's first `frameModel` runs a frame later and can
  reset a gesture sent too early.
- **The owner's house JSON never goes into a served folder or browser** (the auto-mode classifier
  blocked copying it into `dist/`). Use it in Node only; inject a synthetic house into
  `localStorage['house-cad:autosave:v1']` for browser checks.
- **Check a texture up close against the full-resolution photo**, not only after shrinking the photo to
  the texture's scale: that hid the 2048 px limit until the owner zoomed in. The detail layer is the fix;
  a bigger canvas is too heavy for the Quest (`docs/materials.md` "Detail layer").
- **Joybuy** (`joybuy.fr`): the short `m.joybuy.fr/dp/<id>` link and any curl land on a login page
  (never log in); the full product link opens in Chrome. No spec table: sizes are in a gallery
  dimension drawing. Gallery = the `s128x128_` thumbnail strip (protocol-relative URLs).
- **Leroy Merlin search:** type into the site's search box (it lands on `/search?q=…`); a guessed
  `/recherche=…` URL is a 404. A "Verifying the device" page can appear first and passes by itself
  after a few seconds (never solve a CAPTCHA). Variants of a range can differ in more than size: the
  60 × 200 EASY exists slotted (82273211) and flat-fronted (82273207), so check the photo, and use a
  power/weight ratio to spot the true sibling.
- **Retailer marketing photos can be edited:** the EASY 60 × 200 room photo shows 18 slots at the 50 cm
  photo's exact pixel pitch (a widened copy); its studio render shows 17. Count on a studio render or a
  straight photo whose scale matches the body's known size.
- **Leroy Merlin sibling articles** (other sizes of a range) aren't linked from the page. Their refs sit
  near each other: `HEAD` the same URL slug with neighbouring refs from inside the Chrome tab (found the
  Monastère 30×50, 72831311, that way).
- **The owner's house view link with markers and finishes (~4.0k chars) doesn't fit a QR** (about
  2 950); share the text `link` instead, which is why QR now drops markers.
- **Héméra two-leaf windows** come from the zone's hinge (`both`), not a separate product. The window
  page URL is only in an old transcript (`https://www.lapeyre.fr/produits/fenetre-pvc-blanc-hemera-sur-mesure-FPC5837268`,
  unverified).
- **Deploy check:** `curl -s https://krosk.github.io/house-cad/version.json` (the commit it serves).
  The unauthenticated Actions API rate-limits quickly, and there is no `gh` CLI here.
- **Splitting mixed hunks into separate commits:** `git apply --cached --unidiff-zero` misplaces pure
  insertions (one landed at the end of a file). `git stash --keep-index` + `pop` then merged the bad
  staged copy back into the working file as a duplicate. Build the staged file as a blob instead
  (`git hash-object -w` + `git update-index --cacheinfo`), and diff the result before committing.
- **Injecting a test house into `localStorage` right after the page's first load gets overwritten** by
  the pending autosave of the seeded demo house. Wait a few seconds after the first load, then write
  the key, then reload.
- **A furniture zone's `article` is the catalog KEY**, not the entry's `article` field (the NEO tray's
  key is `sensea-neo-120x80`, its `article` a Leroy Merlin number).
- **The furniture catalog is fetched** (`src/ui/furnitureCatalog.js`), so core code can't size a zone
  from it synchronously: `productMm` snapshots the size, and `applyFurnitureCatalog` sizes migrated
  zones later (main.js listener; mr.js on every `buildPlan`).
- **A pattern that looks the same after a 90° turn** (pinwheel, octagon) is unchanged by the floor
  turn; a UV x↔y swap is a **mirror**, not a turn, which is why only planks may swap.
- **No PIL here**: dump pixels with `ffmpeg -f rawvideo -pix_fmt gray|rgb24` and read them in Python.
- **Circuits over a `switch_dual`:** vertices are terminals (`id`, `id#2`); a double switch can sit in
  two components and `deviceIds` lists it in both. CHECK's `unwired` looks at the marker, so one wired
  rocker hides the other (deliberate limit).
- **Float noise:** stored lengths are on the 0.1 mm grid since `7babb98`, but values computed from
  them (x + w, pin + value) are not, unless they go through `snapM`. Grids built from edges also
  snap (`snap()` in `architectural3d.js`).
- **A texture that repeats obliquely** uses its own `texture.matrix` (`matrixAutoUpdate = false`):
  don't set `repeat`/`offset` on the stepped texture, they would be ignored.
- **`addConduitSegment` / `ensureConduitNodeAtMarker` return EXISTING items**; `addWire` returns
  `{ ok, wire }`; `wireSegmentPath` returns segment IDS (compare routes physically).
- **The owner's house file is a real wired network** (rev 9, 47 wires). It suits wire/length tests
  directly; a synthetic network is still handy to control an exact expectation.
- **Thick walls between rooms are hollow in 3D** (12 cm skin per room face; wider gaps leave a void).
- **The desktop `Sketch2D` stays live during AR**; a throw in any `onChange` listener aborts the AR caller.
- **`rlog` works only on the dev server**; never stage `quest-debug.log`.
- **`update-app` and headset reads need the browser in front of the wearer** (after `adb forward
  tcp:9333 localabstract:chrome_devtools_remote`): an unworn headset times out (`Page.enable` /
  `Runtime.evaluate`). `am broadcast` `prox_close` keeps it awake for a DevTools session;
  `automation_disable` after. The AR app's page (`?ar=1`) is a CDP target too: its loaded
  `assets/index-*.js` tells which build it runs (read-only `Runtime.evaluate`).
- **PERF's frame-interval source** (Quest: no GPU timer) steps at 11.1 / 22.2 ms: read layer costs as
  over/under the 90 fps budget, not as ms.
- **Latent:** `~/house-cad-apk/app/src/main/res/values/strings.xml` lacks `appName`/`launcherName` —
  add them before the next `bubblewrap build`.

## Commits

All pushed, all with descriptive bodies. Doc-only commits are omitted.
- **Session 38:** `c00e97b` links always carry furniture · `f8e1f35` View 3D Realistic · `fec23b8`
  URL copy failure names its cause · `4c819aa` links carry finishes + markers, QR without · `ade036e`
  Charme photo planks · `71208e4` Monastère photo tiles · `6854420` photo-finish process + tools ·
  `2798bc9` finish textures in a worker · `96e342f` every texture in the worker · `cc72e0b` plan view
  prepares nothing 3D, View 3D loading wheel · `856592c` phones: half-size textures, canvases freed ·
  `054aad7` collapsible View 3D floor panel · `a57716f` Moder II table + bed texture fix · `780aeeb`
  modelling from isometric manuals · `2352c66` Vernisse straight grid, tiles upright · `afcdd90`
  half-wall finishes (sides + cap) · `fa10818` headset editing tools + skill · `b5a55f2` slab
  thickness · `4ae38b3` `update-app` · `e2f6f7a` IKEA kitchen units · `1a25943` kitchen tap placement · `e13576d` heat-loss wall layers + earth level.
- **Session 37:** `1cd1c14` furniture FOOT/TOP move the unit · `3bb9564` merge AR products per
  material · `1c48801` PERF 3D-view sweep + Lambert furniture · `d37f09d` low-detail AR devices ·
  `62d6627` PERF clipboard report · `d00be61` report prebuilt, copied like LINK.
- **Session 36:** `542e46f` ACOVA towel radiators · `e08eb59` conduit length readout · `084709f`
  De'Longhi EASY radiators (4) · `8824dc3` EASY 120 × 60 · `99d0cd9` heat loss · `51b0968` pedal bin ·
  `a2084e2` HEATING group + per-window U · `c2f6e0b` stairs from the floor.
- **Session 40:** `8dc326f` version.json not answered with the app · `734560a` V&B WC from its STEP ·
  `ce85140` real air volume + whole-house balance · `4da7198` shutter outlets take outlet products ·
  `74e4bff` window swing (AR overlay, View 3D windows open) · `a913657` refrigerant pipe service ·
  `b1cd35d` TOOL menu (right-thumbstick tap) · `52583bc` VMC pipe service + Sauter Agalina furniture
  (flat and `-wall`) · `2f3771a` WASTE pipe service.
- **Session 39:** `d2831ed` thermal bridges (DPE ψ) + AR junction view · `9ebba86` per-floor heavy,
  partition thickness · `4ebe481` floors that don't line up · `9615e2a` floor R only over the basement ·
  `bb28c35` own-gap fix + 1 K ΔT step · `d6ff2f7` open stairs + furniture-only dims.
- **Session 38, later:** `e13576d` heat-loss wall layers + earth level · `d87eb21` conflict suspects ·
  `f857b41` Vernisse edges + software-painted finish textures · `ba5f59e` overlap rule + R or λ ·
  `7e0f3e0` heat map · `b4dc594` RECESS · `1d0bcd3` eye-level conflict signs · `85ef047`/`5c51858` HUD
  edge id · `c20544c` conflict routes · `c88ae9a` furniture plan pieces batched + PERF fps ·
  `6247c24`/`3c839ef` RULER + OUTDOOR rooms · `9f3be4a` Insulation λ label · `0078f1b` what-if +
  reveals · `3cabce1` radiators in HEAT LOSS + reveal fix.
- **Session 35:** `948c5ed` wire rockers (left/right) + pass-through node rejoin · `10c320a` shared
  grip cycle + `i/n` · `a031a0c` FLOOR keeps the teleport · `d481128` pills widen · `ba33078` material
  card.
- **Session 34:** `4e080fc` PERF `mat` layer · `0110e85` adjacent dots batched + overlap badge ·
  `42aa336` double switch marker + LINK batch · `283ba28` conduit sticky grip · `7babb98` 0.1 mm grid
  · `26aa3f2` Monastère stepped layout.
- **Session 33:** `4ba575d` floor start corner · `a7ac8bb` grout weight · `ecca41f` diagonal
  octagon, 90° turn, UV fix, Héméra porte-fenêtre, Néva bay · `8eb1b99` AR ceiling + exterior glass ·
  `f5f30f9` rail-hung sliding door, sources-in-generators rule.
- **Session 32:** `e9ace98` furniture merge + MATERIAL · FURNITURE · `63e640a` material badges ·
  `912be58` 3D-only AR view, FURNISH removed · `ac60665` PASSAGE, Monastère readout fits ·
  `8948472` doors open in the AR 3D view.
- **Session 31:** `3362251` Ethernet product · `c44fd5c` products in view links · `38d42c5` View 3D on
  phones · `899d72d` in-room half wall · `00b4612` terrazzo · `977a29d` V120 piano · `46cd6a8`
  `4cad922` Monastère, Lucia, detail layer · `9a82898` open doors in View 3D.
- Earlier sessions: see `git log`.

The owner's old `Document from Alexis He.json` (rev 9) was deleted at their request (2026-10-06): if a
house JSON ever appears in the tree, never stage it. The current plan is the **headset autosave** (read it with `quest-storage.mjs read`,
`docs/headset-data.md`); scratchpad copies are session-local.

## Resuming from a clean checkout

```bash
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | tail -1)/bin:$PATH"
npm install                                       # once; node_modules is already present
npm run dev -- --host --port 5174 --strictPort    # https; usually already running on :5174
npm run build                                     # the only automated check; expect "✓ built in …"
```

LAN IP last seen `192.168.1.154` → `https://192.168.1.154:5174/` (AR: `…/?ar=1`). Report the Network
URL. The owner mostly tests through the APK, which loads the **published** site, so on-device checks
need a push. The APK project (`~/house-cad-apk`), assetlinks repo (`~/krosk.github.io`), `~/.bw_pw`,
and Bubblewrap's JDK/SDK exist; see `packaging/quest-apk.md` and don't re-init.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/ui/mr.js` | The whole AR session: modes, HUD + PERF sweep, batched overlays (labels, markers, conduit, wires), numpads, grip-drag, conduit pen, export |
| `src/ui/view3d.js` | Three.js renderer shared by AR and the desktop 3D viewer (overview/POV camera, pinch, walk, tilt); `_animate` feeds the HUD's `time:` split |
| `src/io/shareView.js` | View-link payload (compact positional schema; marker slot 4 height flag, slot 5 product; floor slot 5 finishes) |
| `src/core/architectural3d.js` | Plan → slabs/walls/openings/stairs + `wallMarkerPlacements()` (pure, Node-testable) |
| `src/io/planSheet.js` | Sheets (incl. the shared monochrome `drawMarkerGlyph`) |
| `src/core/model.js` / `constraints.js` / `conduit.js` | Model + `_emit`; the solver; conduit graph, routing and `conduitRunLength` |
| `src/core/conflicts.js` | `diagnoseConflicts` (suspects), `conflictRoutes` (routes), `isCertain` (0 mm) |
| `src/core/heatLoss.js` | Room heat loss (`floorHeatLoss(project, floor, without)`, `houseHeatLoss`, `roomHeaters`, `roomHeatLoss`; `heatComponents` (rooms + open stairs), `airVolume`, `houseBalance` (whole-house balance, `partitionLinks`), thermal bridges `ringJunctions` / `slabJunctions` and the `PSI_*` DPE tables, OUTDOOR rooms), defaults `HEAT_DEFAULTS` / `FLOOR_HEAT_DEFAULTS`, `OPENING_KINDS`, settings sanitizers used by model + serialize |
| `src/core/architectural3d.js` stair part | `stairsGeometry`: `STAIR_RISER` 0.18 (owner), `STAIR_GOING` 0.25 (estimate) |
| `src/core/i18n.js` | EN/FR/ZH strings: every new mode needs `mode.*` + `help.*` |
| `src/core/circuits.js` | Derived circuits (per wire nature) + `circuitDiagnostics` for MARKER · CHECK |
| `src/core/materials.js` / `src/core/flooring.js` | Finish catalog; takeoff, regions, wall faces (pure, Node-testable) |
| `src/ui/finishTextures.js` | Canvas pattern textures shared by View 3D and the AR 3D view; product `design`s per pattern (`DESIGNS` stagger, `BRICK_DESIGNS`, `GRID_DESIGNS` mosaic/terrazzo/limestone, `OCT_DESIGNS`, `PINWHEEL_DESIGNS`), their bump maps, the shared stone cloud helpers (`stoneField`, `drawStoneCloud`) and the View 3D detail layer (`DETAIL_DESIGNS`, `applyFinishDetail`) |
| `tools/product-images.mjs` | Per-retailer product photo extraction (`--snippet` for Chrome-only sites) |
| `tools/photo-measure.mjs` | Measure a retailer photo for a photo finish: `rows` (grooves), `joints --grooves …`, `bbox` (tile on white) |
| `tools/check-share-link.mjs` | What a saved house loses in a share link, and the link length (Node only) |
| `src/ui/realism.js` | Realistic: `sunPosition`/`sunDirection`, `SITE`, `loadSky` (wraps the worker's sky arrays as half-float textures) |
| `src/ui/skyPixels.js` / `src/ui/imageCache.js` | Worker-safe sky pixel work (HDR parse, sun clamp, half-float arrays) / `fetchCached` (Cache Storage `house-cad:images:v1`) |
| `src/ui/photoFinishes.js` | Photo finishes: `PHOTOS` (with `// Sources:`), `photoCanvases` (worker side, `scale`), `photoTextures` (page side), `patchPhotoMaterial` (shader layouts) |
| `src/ui/textureWorker.js` / `src/ui/textures.worker.js` | Texture worker client (`paintFinish`, `loadPhotoFinish`, `loadSkyPixels`, `onTextureProgress`, `TEXTURE_SCALE`, page fallback) / the worker (jobs `finish`, `photo`, `sky`, `paint`) |
| `src/ui/paintedTexture.js` / `src/ui/painters.js` | Placeholder texture swapped when its picture arrives (`deferred`, `startDeferredTextures`, `freeAfterUpload`) / every named painter the worker runs |
| `src/ui/furnitureCatalog.js` | The furniture catalog fetch, once, shared by View 3D, AR and migrated-zone sizing |
| `src/core/apertureGlyph.js` | Shared plan-symbol segments for sheets, DXF and the AR plan (door, passage, window, …, furniture notch) |
| `src/ui/proceduralFurniture.js` | Code-built furniture (`procedural: <kind>` catalog entries: STOCKHOLM bed, Daikin wall units, NEO shower tray, V120 upright piano, ACOVA `towel-radiator`, De'Longhi `panel-radiator`, JOYFURNOS `pedal-bin`, Habitat `moder-table`, V&B `wall-hung-wc`, Sauter Agalina `vmc-agalina`); used by the AR 3D view and View 3D |
| `src/ui/doorProducts.js` | Door product builder (frame, leaf `DESIGNS`: Ange-Line, LINE, postformé; hardware) from `doorProductPlacements`; `buildRailDoor` for rail-hung doors on SLIDING zones |
| `src/ui/deviceProducts.js` | Switch/outlet/Ethernet product builder: shared `plate()` (pyramid + stadium collar) and `flatInsert()`, `rocker` (single/double), `socket` and `rj45` designs, lofted from radial outlines; cached per entry and `detail` (`full` desktop, `low` AR), clones share geometry |
| `src/ui/mergeByMaterial.js` | AR draw-call reduction: `mergePartsByMaterial` (the 3D view's parts) and `mergeObjectByMaterial` (a furniture model) |
| `src/core/windowSwing.js` | `windowSwings(floor, materialOf)`: each leaf's max opening and what stops it (AR MATERIAL · WINDOW overlay, View 3D windows open) |
| `src/ui/windowProducts.js` | Window product builder (`PROFILES` per design: frame, sashes, glass, hardware; `buildSliding` for the Néva) from `windowProductPlacements` |
| `src/ui/exteriorView.js` | The AR 3D view's opaque glass material (procedural daylight exterior) |
| `public/furniture/index.json` | Furniture catalog: IKEA articles + procedural entries (`params` hold the tweakable dimensions) |
| `src/main.js` / `src/ui/sketch2d.js` | Desktop wiring / 2D editor (incl. read-only view mode) |

## Next step

**Ask the owner each session whether the Quest is available.** Without it: no headset read/write,
skip `update-app` and say so.

- **First, with the Quest:**
  - VMC (item 59): the two units (MATERIAL · FURNITURE), boxing r220 and the frames r221/r222 in place;
    HEATING · PIPE shows the grey ducts at their width, and a selected duct reads its unit's total
    and per-diameter lengths (A: Ø80 2.33 · Ø125 1.70 m; B: Ø80 9.38 · Ø125 2.36 m).
  - WC stack + VMC riser (item 60): in place in AR (HEATING · PIPE: brown stack and vent, grey VMC
    against the wall; column r122 deeper; boxing r220 wider); the basement wall face (x −4.55) is a
    survey question the owner will correct.
  - TOOL menu (item 58): tap opens/closes, labels fit in EN/FR/ZH, no accidental open while flicking,
    the tap window (0.3 s) feels right (`docs/ar-qa-checklist.md`).
  - AC (items 52–56): HEATING · PIPE shows four green lines from each unit out through the west wall
    to `r217`; select each, its length matches item 52. MATERIAL · WINDOW: the swing overlay and
    readout on r80/r113/r115 (r80's right leaf should stop at ~96° on radiator r205). MATERIAL · OUTLET
    on shutter outlets m164/m144: the plate under the upper units. View 3D ◫ Windows open (max).
    Ask: are the ground windows' shutter boxes inside (units sit 30 mm above the heads)? the real
    ground level outside? r148 is at Daikin's 50 mm minimum: move 1–2 cm if the wall gets a finish.
  - The owner opens AR: the session-40 plan edits (item 49) in place: both WCs on their half walls
    (LEFT X: pan shape, seat, rim 41.5 cm), half walls 1.15 m, trays at 12 cm on plinths, the upper
    90×60 radiator. HEAT LOSS → Whole-house balance → yes: header `Water needed ΔT 28.6 K (50.6 °C)`,
    shower room `Reaches 20.4 °C` (red), hall and landing "with the stairwell"; panel fit (two more
    rows, taller room box) and how long a recompute takes on the Quest.
  - Then the junction view (item 39) and items 32–37 as before; still unread: item 27's wrong value,
    a PERF report after `c88ae9a` (item 31).
- **Offered, not built (heat):** set Ground floorR 1.0 once the owner picks the SOPREMA 25 mm; the split
  counted in the balance on cold days; per-room insulation under the basement ceiling (only Node-tested
  in a temporary copy); per-room indoor temperature (22 °C
  living / 20 elsewhere / 24 bathroom); a split (FTXM60A) counted as a heater below an outdoor
  temperature; the CJK legend spacing and furniture names on sheets; € per year; heat-recovery VMC
  what-if. The heat map's AR 3D version (agreed in item 25) is still not started.
- Never put the owner's share link or plan into the repo: it encodes the owner's house.

- **A — Owner walks the parked work on the Quest**, then update `docs/ar-qa-checklist.md` (items exist
  for each). Newest first:
  - session 38, IKEA kitchen (`e2f6f7a`; written to the headset autosave 2026-10-04, read back
    identical): Ground r153–r168 = the planner's units 1–14 + worktops A/B (`metod-*`, pinned to r65's
    left and bottom walls, 8 mm tile allowance); the placeholders r134, r141–r145 and their 24
    dimensions removed (owner). In LEFT X / View 3D: every unit loads, matches the planner's front
    views, worktop at 92 cm, wall cabinets 148–248; light m126 behind wall cabinet r163 is deliberate
    (owner: a supply outlet for the cabinet lights, stays); pedal bin r150 and the De'Longhi r151 kept. If wrong: undo by
    re-applying the edit in reverse (the session-local scratchpad backup is gone in a new session);
  - session 38, slabs (`b5a55f2`; written to the headset autosave 2026-10-04, read back identical; the
    app's precache already holds that build): LEVEL shows Basement 2.27 / slab 0.22, Ground 2.95 / 0.25,
    Upper 2.95 (was 2.70) / 0.25; ⇄ SLAB on the numpad; LEFT X walls and the painted ceiling at 2.05 /
    2.70 / 2.70; the house readout 60 Lucia boxes (was 64). If wrong: slot 4 is the plan before
    today's edits; the pre-slab autosave is in the scratchpad backup;
  - session 38, the Lapeyre quote edit (item 15): in AR, every quoted opening at its new size and
    height (upstairs heads 2.43, French doors and Néva 2.27, door 2.25, basement window sill 1.50); the
    kept end of each re-pinned opening (`r109`, `r110`, `r114`, `r115` keep the top, `r111` the bottom)
    is the end the owner measured; `m212`/`m213` (moved 5 cm) and `m7` (1 cm) are still right, else
    re-pin them to the wall; HEATING R / U shows the Uw; nothing else moved; the Moder table `r152`
    under the living-room light `m12` (LEFT X: size, turned along the Néva wall); once written, Lucia
    on both bathrooms' walls and the half wall `r139` (side + top) in LEFT X, and the house readout
    (64 boxes counted with the entrance's existing Lucia face: generous, cut pieces count whole). If wrong: load slot 4
    (pre-edit). Then ask which French door has the Sw 0.51 glass. The Vernisse tile on a wall: upright,
    straight grid;
  - session 38: their link on the phone: the plan pans freely, ◈ View 3D's wheel (does it show
    `· on page`?), then switch floors, toggle Realistic, leave the app and come back (flat textures
    after a lost context?); is Monastère there in the latest link; copy a fresh EXPORT · LINK and open
    it on desktop (Héméra windows, doors, finishes, lights and device products show?); if the copy
    fails, the bracketed reason; View 3D **Realistic** on the Steam Deck and the iPhone 14 (fps, sky
    download, sun slider, the Charme and Monastère photo floors: tone vs the showroom, a repeated
    Monastère face; half-size textures on the phone acceptable?); the View 3D floor panel collapsed
    on the phone; `habitat-moder-ii-110` / `-155` on a furniture zone (LEFT X and View 3D: legs,
    seams, colour vs the real table); the STOCKHOLM bed's legs show wood grain, not a flat colour;
  - session 37: raise the Daikin CTXM15A in PLAN · EDIT (FOOT 230 cm, then ⇄ TOP 250 cm → foot
    2.202 m); outlets/switches up close with LEFT X (low detail: faceted corners?); furniture looks
    matte (Lambert) but right; windows/glass unchanged after the merge;
  - session 36: HEATING (PIPE still works after the move; HEAT LOSS: set the Basement unheated first,
    it defaults to heated, then the attic R; R / U: the 3 linings' R and the windows' Uw; panel
    height, labels vs dims overlap); the stairs in LEFT X (treads from the floor, 25 cm going vs the
    real one); the pedal bin on a furniture zone; CONDUIT · EDIT
    `LENGTH` / `RUN` against a tape measure; the ACOVA and De'Longhi radiators on furniture zones
    (LEFT X: size, wall side, mount height vs the real ones);
  - session 35: the material card (LEFT grip in each MATERIAL mode; paint stall when flicking? debug
    log `material card` ms; a furniture card); the widened pills (a long French name reads whole; is a
    0.45 m pill too big?); teleport then FLOOR (stays put, plan doesn't turn); the `i/n` line in EDIT,
    LINK, WIRE, CONDUIT, CONDUIT · EDIT and MATERIAL devices (EDIT at the 132 cm Ethernet stack: no
    jump); A/X rocker swap on a wire to the double switch, then CHECK shows no cross-tie; deleting a
    node mid-run in CONDUIT · EDIT;
  - session 34: Monastère stepped with LEFT X (centred module, a 30×30 in a start corner, no seams,
    first-draw delay); MARKER · EDIT grip on the Ethernet/switch stack (badge "3"); CONDUIT grip
    cycling; the double switch (LINK rocker swap, A/X merge); **PERF in CONDUIT again** (did the
    batching fix the 30 fps? does `zones` still read 12 ms?);
  - session 33: the rail sliding door on a SLIDING zone; the white ceiling + exterior glass with LEFT X
    (PERF on); the Héméra porte-fenêtre and Néva bay (sill-0 WINDOW zones); the diagonal Etruria; the
    90° turn (Blue stone, Charme; A/X near a corner still sets the corner); grout on the quantity
    line;
  - session 32: MATERIAL · FURNITURE on a real zone (cycle, A/X turn, B/Y clear, `DIM REMOVED`
    flash), a slot saved with old FURNISH items migrating, the material badges, a PASSAGE between two
    rooms of different floors, the Monastère 6-line readout, doors open with LEFT X;
  - Z-dims, adjacent-floor dots, CHECK rings (never rendered before `f0f6bf1`);
  - MATERIAL · FLOOR/WALL/DOOR/WINDOW products (the Ange-Line on the entrance door; Héméra's handle
    side; Beaulieu oak, Etruria in the upstairs bathroom, Blue stone mosaic, Vernisse, terrazzo, Lucia;
    watch PERF: each design texture is 2048 px);
  - furniture products: the STOCKHOLM bed, the TV bench (does a real IKEA model replace the box on
    the APK?), both Daikin units (foot at 2.0 m), the V120 piano;
  - MATERIAL · SWITCH / OUTLET / ETHERNET: grip cycling on a double switch, Ovalis models flush;
  - the LEFT X AR 3D view with **PROJECT · PERF** on;
  - View 3D on a phone and an iPhone (Tilt look, pinch, walking, Reflections frame rate), a
    WhatsApp-sent `link` with products, the Ground gap wall behind half wall r139, the detail layer
    shader on the phone and the Quest browser;
  - MARKER · CHECK, the stacked readout, stair rotation, then session 29's list (ALL FLOORS
    reticle/teleport, WIRE cycle + lengths, breaker glyph, pen undo/T).
- ~~**B — Build the furniture merge**~~ — done in session 32 (`e9ace98`), plus FURNISH removed at the
  owner's request. Remaining small gaps (not asked for): desktop product picker, desktop
  "dimension removed" message, the notch in the desktop 2D sketch.
- **B′ — More products** as the owner names them: run `/model-product <link>` (step 7 adds a photo
  finish when a straight top-down photo exists); a real manufacturer
  model is always checked first. Offered, not asked for: detail designs for terrazzo, the mosaic and
  the oak; a desktop quantity table (per room and size: tiles, cut, m², boxes); a wastage margin; the
  Lucia leaf decor tile.
- **B⁗″ — Realistic, next options** (offered, not asked for; `docs/realism.md`): a path-traced
  **Render** button (`three-gpu-pathtracer`, three 0.170 compatibility unknown); Poly Haven PBR
  textures for plaster/wood/concrete; photo finishes for more products (Lucia, Vernisse, Etruria…);
  bloom on light pucks.
- **B‴ — Quest-to-TV mirror / Steam Deck viewer:** parked by the owner. If resumed, start from
  `docs/share-view.md` "Parked" (first step: a ping-only page pair on the Deck).
- **B″ — Materials phase 4:** the owner's own products entered in AR (numpad: size, joint, pack) into
  `project.materials`. Possible improvements the owner has not asked for (see `docs/materials.md`):
  - ~~per-region pattern offset~~ — done as the start corner (owner chose a corner, not a wall line or a
    numeric offset); an automatic "fewest tiles" corner was offered, not asked for;
  - start corner / turn for wall faces (floors only today);
  - a plank texture drawn from the real cut plan;
  - the hidden face below a half wall that stands inside a room (still counted in the wall area).
- ~~**B⁗ — Sticky pick for CONDUIT · EDIT and WIRE**~~ — done in session 35 as the shared `gripCycle`
  (`10c320a`), which also covers EDIT, LINK and MATERIAL devices.
- ~~Help box overflow (grow + smaller font, or one line per control)~~ — offered in session 35; the
  owner said no need. ~15 help texts exceed its 8 lines (estimate), mostly FR.
- **B⁗′ — Material card extras**, not asked for: a thumbnail beside the readout (option 2), piece size
  and pack on the card, the AR 3D view on the target (option 3 already exists as LEFT X).
- **C — Conduit-drawing speed-ups:** height snap + "ceiling run" toggle, straight runs, one-press drop
  from a device, snap-to-wall + auto-pin. The owner decides priority.
- **D′ — AR 3D view: the plan drawn under it** (session 37 reports), parked by the owner (fps 50–80
  is fine). Resume per `docs/ar-survey.md` "Open: the plan may still be drawn under the AR 3D view".
- **D — Remaining AR per-object layers**, only if a mode drops frames (adjacent-floor spheres, pipes,
  furniture, control links). Measure with PERF first.
- ~~Draw stacked markers apart in AR~~ — rejected: the floor icon, pick, dims and sheet all use the
  shared point, so an offset would draw glyphs where the data isn't.
- ~~Copy a wall material to every wall of the room (A/X)~~ — built, then removed at the owner's request.
- ~~Floor-fill overdraw as the AR GPU cost~~ — refuted by PERF; the per-marker objects were the cost.
- ~~Ray-picking wires in 3D~~ — the owner said floor-projection picking works.

## Known open questions

- **Session 40, VMC + WC stack (items 59–60):** nothing seen on the Quest. Hypotheses: the slab's build-up
  (concrete or joists; 3 cm cover over the pipes), the fridge spot, the basement wall face, the roof
  height (vent drawn to a 0.5 m stub), unit B with no kitchen duct (Ø125 plug), the Agalina port
  positions (photo estimates), fitting sizes (typical, brand-dependent), loss factors in the PVC
  estimates.
- **Session 40, AC + windows (items 52–57):** nothing seen on the Quest. Hypotheses: r217's connection
  side/height; the ground level outside; hole positions (±10 cm); the window lever on the right-hand
  leaf seen from the room and the hinge axis (a few degrees); +1 m slack per line; 32.4 m of liquid line
  → about 50 g extra refrigerant; the View 3D windows-open toggle in a share link (not opened).
- **Session 40:** nothing seen on the Quest except item 46. Hypotheses: partition U from plaster λ 0.40
  (dense block) and meulière via the wall λ; the light floor's R 0.25; doors counted as partition; the
  balance's linear loss around tRoom; heat-pump efficiency −2–3 %/K; gas €0.12/kWh, boiler 92 %,
  electricity €0.25/kWh, SCOP 3.5; degree-days 2 200 (base 18) understate a 22 °C target (≈ 2 900
  suggested, not set). WC seat/lid/hinges are generic estimates; the WC zones' rim height assumes
  V&B's 415 mm. The Geberit drawing's "10–14.5" was read as the waste axis behind the frame front
  (half-wall depth 22 cm rests on it). The SOPREMA board's fire class and ceiling use unknown.
- **Session 39:** nothing seen on the Quest. The DPE ψ are cautious defaults read from Open3CL (not
  the arrêté itself). Hypotheses: partition detection misses T's a 60 cm probe can't cross; no thick
  partition found on rev 17; the basement at 9 °C (0 °C day) / 6 °C; ach 0.5; radiator exponent 1.3 at
  low ΔT; the 5MXM90A can't heat water (product type, not a data sheet); the shower-room and Upper
  sizing advice. Heat-loss tests are scratch Node scripts (none in the repo); the made-up two-storey
  plan and rev 17 per-room diffs were the checks.

- **Session 38, later:**
  - The GPU-canvas glitch's cause is unproven (a minimal repro would settle it), and the Quest's and
    the phone's GPU paths are untested; the software path avoids both questions.
  - Conflict suspects: a single loop can't single out its wrong member (routes help, item 26); there
    is no desktop UI. Routes are capped at 12 within a search budget (1 ms worst on the house).
  - Which value was wrong in the owner's r59 → r60 conflict (item 27); the plan since our last read.
  - Furniture batch's effect on fps (item 31); the warning triangles' size/height in passthrough.
  - Heat loss: `r112` (7 cm, on an exterior edge) and the real earth level are unknown.
  - Items 32–37 never seen on device; the reveal fix (item 36) not re-checked; the owner's local file
    has no radiator product and no opening near exterior insulation, so neither is proven on the house.
    Hypotheses: ψ 0.4 / 0.08, single glazing 5.8, degree-days 2200, radiator exponent 1.3, kWh/yr
    scaling ground losses linearly; b = 1 for the veranda overstates the kitchen's shared wall.
  - Heat loss: the overlap rule's reading (layer over layer, R per metre) awaits the owner's
    confirmation; Ground ceilings with no room above lose ~3300 W at bare R 0.06 (no roof R set;
    Hypothesis: too high); every floor, Basement included, is set heated.

- **Session 38 kitchen / slab open:** every unit on device (load time, frame rate with 16 assembled
  zones, ~2.5 MB of parts); the 60-high ASPUDDEN stand-ins (60x80 model scaled, frame rails a quarter
  thinner; the 60x60 808.595.049 has no model); pulls follow the drawings (14 bars, 11 knobs) not the
  list (7 + 6); plinth 40 mm behind the fronts and no legs (Hypotheses); faint seams in worktop A where
  four scaled slices meet around the sink (offered to smooth); the planner's far-end room shape differs
  from the plan (right wall 3183 vs 3060, notch 1033 × 919 vs 1120 × 1060), not acted on; a Ground light
  marker at z 3.80 (above the 2.95 storey) never identified; the AR slab pad and the lowered ceilings
  never seen on device.
- **Session 38 open:** why the AR URL copy got `NotAllowedError` (same path as the working PERF
  copy); Realistic frame rate on the Deck and iPhone 14 (never measured); iOS half-float sky filtering
  (Hypothesis it works); the Monastère tone and its one-face-per-size variety (the range has 24); a
  thin light leak seen at one wall joint of the demo house in Realistic; which texture path the
  owner's devices take (worker or `· on page`) and why their plan stalled while this Deck's did not;
  whether the phone crash was canvas memory (Hypothesis; fixed by halving + freeing, cause unproven);
  a WebGL context loss on the phone (freed textures would come back flat); a download that never
  settles keeps the View 3D wheel waiting (no timeout). Moder II: the apron size/position and the
  legs' inner-edge width are photo/guess estimates (the drawing hides them); colour matched by eye.
 Proven by grep (2026-10-03): no other code clones a texture; objects and materials are cloned,
  which share the texture and are safe.
- **Unwalked, Hypothesis only.** Sessions 32–38: everything in Next step A's first seven bullets.
  Session 37: whether the plan really draws under the 3D view and why (the hide path reads correct);
  what made the 23 vs 82 fps swing; the low-detail device look up close.
  Session 36 heat loss: every default without an owner answer (bare wall R 0.25, slab R 0.15, window
  U 1.4, door U 2.0, λ 0.04 for the 3 linings until their R is set, basement 6 °C); Node totals with
  defaults (Ground 11.7 kW, Upper 8.4 kW; 8.8 / 4.6 with attic R 7) are not checked against any real
  heating. Next, if asked: exterior/interior edges coloured in HEAT LOSS (offered), stairs merged into
  their room (offered, declined for now), ~~radiator W against the need~~ (done, item 37), window
  products' Uw, a 22 °C bathroom, a desktop panel.
  Session 36 stairs: the 25 cm going; the 7–11 cm per storey no zone covers. Pedal bin estimates:
  pedal height 52 mm (photos 43 vs 61), spacing ±145 mm, handle width, corner radius.
  Session 36 estimates: ACOVA bar end positions (±3 mm, photos), the 1728 mm size's bracket rules
  (manual draws only 1008/1332); EASY slot width 15 mm and depth 8 mm, the 46 mm horizontal margin on
  the 120 cm (its room photo suggests ~37), the 38 mm vertical margin on the 180 cm (copied from the
  200 cm); every radiator's mount height. No radiator has been seen in View 3D or AR.
  Session 35: the card's paint time on the Quest (five cards ~1 s on desktop) and a furniture card
  (not previewed); the Quest's `sans-serif` font (likely Roboto, narrower than the fonts measured);
  **PERF in MARKER · CONDUIT is still not re-measured** since session 34's batching.
  Session 34: the stepped Monastère's joint comes out of nominal cells (tiles drawn 5 mm under
  size); the texture's paint time on the Quest (0.65 s per map on desktop); the plan sheet grouping
  the Ethernet into its stack now that coordinates are equal (SVG not looked at).
  Session 33 estimates: the Néva faces (photo scale assumes the 180 cm width), the rail door's bar
  section, wheel Ø and wall gap; the exterior picture's horizon sits at the same pane fraction for every
  window. Session 30:
  - everything in Next step A;
  - ~~frame cost of the AR 3D view~~ measured in session 37 (owner: 50–80 fps on Ground, accepted);
  - whether MARKER · CHECK's 1-px pins read, and whether ~100 rings hold frame rate;
  - the readout pill (4 lines, 6 at a tighter pitch since session 32) and its legibility;
  - how the textures look in a browser;
  - the bed and the door in AR (both rendered only in a desktop browser);
  - the oak floor, Vernisse tile, Blue stone mosaic and Etruria octagons on real rooms (seen only in
    scratch previews), and Reflections on any device other than a desktop Chrome;
  - the Daikin units, the LINE door and the furniture plan pieces in AR (the plan-piece outline is a
    1 px line; a ribbon is the fix if it reads faint). The FTXM60A and the LINE door were only seen in a
    scratch preview, not in View 3D;
  - the Ovalis switch, double switch and outlet in the real View 3D and in AR (seen only in scratch
    renders; an 8.7 cm device is invisible from the View 3D overview, and the POV couldn't be aimed);
  - session 31, all unwalked: phone View 3D (Tilt look is untestable on desktop), products in a real
    shared link, the half-wall fix rendered, terrazzo and piano outside scratch previews;
  - Héméra windows in AR, and on the owner's real window zones (seen only on an injected demo house in
    desktop View 3D). The frame is centred in the zone's depth; real fitting position is not modelled.

  Estimates to confirm with a tape measure or the owner: the bed's rail height, headboard lean and
  cushion size (from photos); the door colour (anthracite ~RAL 7016 guessed; Lapeyre colours are
  customisable) and which door zone in the owner's house is the entrance; the oak's 2 mm bevel and the
  tile's 3 mm joint (photo estimates); the mosaic's 2 mm joint (renders suggest ~3.5 mm); the Etruria
  joint, grout colour and **pack size** (entered as 1 piece per pack); Héméra profile faces are
  scaled by an assumed ~160 mm handle; the Daikin front layouts (panel edge, flap, sensors: photo
  estimates); the LINE grooves (photo estimates, assumed on both faces) and its lever handle (the
  product ships without one: ask which handle the owner buys); the NEO tray's layout (top-down photo) and
  the Ovalis depths (read on side-photo silhouettes); the terrazzo joint (2 mm), grout, thickness and
  finish; the V120's key-top height, lid depth and key overhang (standard proportions, no straight
  photo exists); the Monastère joint (page 5 mm vs showroom board 3 mm; 5 used), its grout colour and
  tone; the Lucia grout colour.

  Session 29: breaker glyph, conduit pen undo/T, Z-dim look, 3D-viewer fixes. The owner has used AR
  with markers, labels, conduits and wires since the batching, and reported them working.
- **Why 168 per-marker canvas textures cost ~47 ms** is unexplained. The batching fixed it; the
  mechanism is a Hypothesis (per-texture handling in the Quest browser).
- ~~Is `EXT_disjoint_timer_query_webgl2` on the Quest?~~ No: the session 37 reports read `source
  frame` (OculusBrowser 152, Adreno 740), so every PERF ms is a frame interval.
- `docs/ar-qa-checklist.md` is stale for most work since s16.
- **Data oddities in the owner's house:** cameras m174/m183 have `z = 0`; doors r77/r120 are drawn
  wider than their opening.
- **IKEA furniture on the published app:** the Pages build embeds the proxy and the Worker returns a
  valid GLB with CORS for `https://krosk.github.io` (Proven by curl). Nobody has yet seen a real model
  replace the placeholder box on Pages/APK (Hypothesis).
- **Unverified:** shared-link decode on real phones, Web Share of the QR from immersive mode, and
  mobile 3D performance with lights.
