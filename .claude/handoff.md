# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc: live state only. Everything stable lives in the
repo docs (project knowledge is repo-only; rule in `CLAUDE.md`, "Where project knowledge lives"):

| Doc | What it holds |
|---|---|
| `CLAUDE.md` | **Top rule: label every claim Proven/Hypothesis.** Architecture, View 3D (PLAN/OVERVIEW/POV/ORBIT), sheets/DXF/change map, build, git + commit-body rules |
| `docs/product-intent.md` | **Why** the AR tool exists: tape survey, drift/RECAL, multi-floor, split levels, room levels |
| `docs/ar-survey.md` | **How** AR works: every mode, HUD, **performance rules**, AR traps |
| `docs/ar-qa-checklist.md` | On-device QA items, dated; most are still unwalked |
| `docs/headset-data.md` | Reading/writing the owner's live plan on the Quest (skill `quest-edit`) |
| `docs/plumbing-workflow.md` | Pipe tools; AC, VMC, waste, heating pipes; every owner decision and coordinate of the drawn networks |
| `docs/heat-loss.md` | Heat loss, balance, laundry heater, bare basement pipes, insulation what-ifs |
| `docs/electrical-workflow.md` | Conduit / wire / control-link lanes, circuits |
| `docs/furniture.md` / `docs/product-modelling.md` | Furniture zones + products, procedural builders / how to model a product (skill `model-product`) |
| `docs/materials.md` | Finishes, door/window/switch products, texture worker, window swing, fences, gates, boxing finishes |
| `docs/realism.md` / `docs/share-view.md` / `docs/markers-plan.md` | Realistic + photo finishes / share links (+ the parked Quest-to-TV mirror) / marker roadmap |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-10-23 (session 45; the electrical panel step 1 (item 00e, uncommitted), the kitchen sink drain into the façade vent (item 00g, written); the headset plan is **307 484**. Session 44: tests, the east–west column r263 (00c), the upstairs water (00d))

**Status:**
- Proven (session 45, one write 2026-10-23, `write --base` on a fresh read byte-identical to 306 688, read back
  byte-identical, 307 484): the kitchen sink's Ø40 drain into a Ø100 × 40 tee on the façade vent riser (item 00g;
  `docs/plumbing-workflow.md` "Kitchen sink into the façade vent").
- **Uncommitted (session 45, all mine, `npm test` 19/19 and `npm run build` clean, Proven):** AR Realistic step 1
  (`mr.js` `applyArSun` + `applyArPhoto`, `realism.js` header, `i18n.js` `sun.*`, `test/realism.test.js`, `docs/realism.md` "In AR",
  `docs/ar-survey.md` LEFT Y, a QA section; item 00f); the panel step 1
  (`src/core/panel.js`, `test/panel.test.js`, `materials.js` `panel_drivia_3x13`, `deviceProducts.js` `driviaPanel`,
  breaker `panel`/`row`/`slot` in `serialize.js`, AR MATERIAL · PANEL in `mr.js` + `i18n.js`, `view3d.js` fill),
  its docs (`docs/electrical-workflow.md` "The panel", `docs/materials.md` "Panel", a QA item, a `CLAUDE.md` line),
  the sink-drain section in `docs/plumbing-workflow.md`, and this file. Never seen in a browser or on the headset.
- Proven (session 44, two writes 2026-10-22, each `write --base` on a fresh read byte-identical to its base, read back
  byte-identical): **00c** (300 745), the east–west column r263 (bare Alflex ducts, vent at 1.00 m, m59 removed);
  **00d** (306 688), the upstairs water. Details: `docs/plumbing-workflow.md` "Column turned east–west", "Upstairs water".
- Proven (session 43, two writes): **item 101** (291 747): anchor m274 at the living-room slab hole and r204's pair through it; beam r265 over cabinet
  r125; the west manifold beside the basement pillar; the bus in its real order, touching the west wall; r224+r205
  down the wall; the 3×2 bundle in column r122 (two heating pairs + the water row); the upstairs water pair X and two
  cold lines on the north wall. **Item 102** (301 622): joists r266–r271 (upstairs bathroom, under a 5 cm screed) and
  r272–r279 (kitchen ceiling, attic side). Every coordinate and owner decision: `docs/plumbing-workflow.md` "West
  manifold" and "Re-measured". What the owner must still check or decide: Next step 00b.
- Proven (git; `version.json` "05540e2 1022-1859Z"; Actions run success with its `npm test` step; `update-app`
  installed it): the head is `05540e2`, pushed, served and on the headset. Session 44 commits: `3bebe48` tests + CI +
  CLAUDE.md/README refresh + the `solve-house.mjs` validation fix, `05540e2` docs. Uncommitted since: see above.
- **The base for the next write is 307 484 chars** (the sink drain on 306 688; scratch `readback-1023a.json`,
  written 2026-10-23, read back byte-identical; backup `backup-1023a` holds the 306 688 state; earlier
  `backup-1022` … `backup-1022d`; scratch is session-local). It was written in solved
  form (`solve-house.mjs`), so the app's next save should change nothing (Hypothesis until a fresh read shows it).
- Earlier writes, compressed: 286 266 (10-20, item 98: four door frames, r93 on the Meli, r92 7 cm west), 286 557
  (10-19: FLAVIO vanities, basement ARTENS tile), 287 012 (10-17: VMC option 4i + bed r264), and the 10-15/16 VMC
  steps (`docs/plumbing-workflow.md`). No save slot holds a pre-edit copy: undo = reverse the edit.
- Owner-confirmed on the Quest: AR performance (s29), the MATERIAL flow, the 3D-only AR view, FURNISH removed
  (s32), the floor start corner (s33), PERF clipboard reports and 50–80 fps in the AR 3D view (s37), the
  version.json fix (item 46, by CDP).
- Proven (owner, 10-03): their link's 3D view opens on their phone.
- **Hypothesis:** everything else from sessions 30–40 works on the devices. It is verified only by build, Node or
  a scratch/desktop browser, and nothing from items 47–84 has been seen on the Quest. Item 83's controls, ceiling
  see-through and insulation jackets were seen only in headless Chrome screenshots (the demo house and a made-up test
  house); the View 3D fittings (`6da6a2b`) and anything on the owner's own plan were never seen in a browser.
- **Written 10-17:** option 4i with the bed (above). Its build chain, for reference:
  chain `opt4f.mjs` (NOBOX=1, GEO with YB0 −1.96, XU 0.46) → `move4h.mjs` (KS=1, CX −0.495) → `up100.mjs` → `final4i.mjs`,
  each on the previous output, from the 288 795 read; it already holds the BDH vents, so `draft-bdh.json` is folded in), option 4d (superseded by 4i), option 1e (`draft-col5.json`, rebuild with
  `colStack5.mjs` on the 288 795 read: the laundry's two short 90° turns become one long 45° diagonal each; the
  owner's last instruction before the VMC sizing questions), and a bed draft (`draft-bed.json`, STOCKHOLM r262 in
  bedroom r51 for a legroom check), and the BDH vent swap (`draft-bdh.json` via `editBdh.mjs` on the 288 795 read:
  r251 and r257 → `aldes-bdh-sanitaire-ceiling` / `aldes-bdh-cuisine-ceiling`, r223 → `aldes-bdh-sanitaire`, centres,
  ceiling/wall contact and duct nodes kept; solves clean; folded into 4i). The bed draft's r262 collides with 4i's new
  r262/r263 (box id taken, column): chain the bed after 4i and recompute its ids. See item 86.

## What the app is today

One static Vite build at **https://krosk.github.io/house-cad/**, also a sideloaded Quest 3 APK
(`com.krosk.housecad`, boots into passthrough AR):

1. **2D plan editor** (desktop/mobile). Axis-aligned add/subtract rectangles with zone kinds; exact sizes only
   from dimension constraints. Floors are stacked, plus split levels such as the Garden. Outputs: sheets
   (print/SVG; the PNG is a pipe sheet for now), DXF, mesh, JSON.
2. **◈ View 3D** (desktop/mobile). It opens on ▤ Plan (AR's flat plan on an orbit camera, with conduit/pipe
   toggles). ◈ Model builds the architectural model behind a loading wheel (overview, POV, ORBIT, ruler,
   Realistic). `CLAUDE.md` has the rules.
3. **AR survey tool** (`src/ui/mr.js`, the only authoring surface on the device). Plan, dimensions, markers,
   conduits/wires, the pipe network (services cold, hot, heating supply/return, refrigerant, vmc, waste), MATERIAL products,
   HEATING (heat loss, R/U, AIR INLET), save slots, export, and the AR 3D view on LEFT X. The modes are listed
   in `docs/ar-survey.md`.

**The goal (unchanged):** Phase 5, an on-site MR survey tool authored entirely in AR (`docs/product-intent.md`).
In practice the owner now uses it to design their renovation: they ask for edits, and they go into the headset
plan.

## How work flows now (owner, standing)

- **The owner's house is edited directly on the headset autosave** through the `quest-edit` skill
  (`docs/headset-data.md`), never a Deck copy. Every write needs:
  - the owner's explicit yes ("W");
  - the AR app closed;
  - a full backup;
  - a fresh read equal to the base;
  - `write --base`, then a read-back.
- **Shorthands:**
  - "c p" = commit + push on `main`;
  - "c p w" = commit, push, then the headset write;
  - "W" = write to the headset.
- **After every push:**
  1. Wait for the deploy: read the run at `api.github.com/repos/krosk/house-cad/actions/runs`, then
     `version.json`.
  2. Run `update-app` if the Quest is reachable; otherwise say it was skipped.
- **Share links** are built in Node from a fresh read: `encodeViewToHash(p, { markers: true, network: true })`.
  Send them as a file (SendUserFile), never in chat text, and never put them in the repo.
- **Ask each session whether the Quest is available.**

## Session 40 item index

> Next agent: when you add a session, fold live constraints into "Standing decisions" / "Findings" and shrink
> your items into this index. Each line says what was done and where the detail lives. "Written" = written to the
> headset plan and read back identical.

- **46** `8dc326f` version.json no longer opens the app (Proven on the headset).
- **47** V&B Architectura WC from its STEP (`docs/product-modelling.md`).
- **48–51** Heat loss:
  - real air volume;
  - whole-house balance toggle;
  - the owner's heating answers (`docs/heat-loss.md`).
- **49, 53** Plan edits:
  - WC half walls and WC zones, trays on plinths, upper radiator 90×60;
  - AC units and refrigerant networks;
  - all written.
- **52–56** AC multi-split (`docs/plumbing-workflow.md` "Air conditioning"):
  - shutter outlets take products;
  - window swing (`docs/materials.md`);
  - `refrigerant` service.
- **57** Share link from the headset plan. **58** AR TOOL menu (right-stick tap; `docs/ar-survey.md`).
- **59–60, 63, 66–67** VMC and WC stack, all written; the detail is in `docs/plumbing-workflow.md` "VMC" and the
  sections after it. The design was later superseded by item 80's one unit.
- **61, 73** Heating pipe network, façade vent, Ø100 valve, basement radiators: written
  (`docs/plumbing-workflow.md` "Heating pipes", "Open vent").
- **62** View 3D ruler, links that open in 3D.
- **65** Upper WC at 60 cm, drain option A: written ("Upper WC position and its drain").
- **68, 70, 71** Boxing r220 as a half wall to the ceiling:
  - see-through half walls;
  - Lucia tiles on it;
  - the Duofix product;
  - written, except the Duofix product.
- **69** Ground shower room, WC under the east window, shower 100 × 80, radiator north: written 10-12.
  ~~Item 64, the WC on the north wall~~ is replaced by item 69 (owner chose the window).
- **72** Answers: no roof vent, the façade vent; laundry and r74 at 15 °C (`docs/heat-loss.md` "Laundry heater").
- **74** VMC airflow:
  - window `airInlet`, AR AIR INLET, airflow network + whole-house 3D age map;
  - sleepers, leakage, CO₂;
  - detail in `docs/plumbing-workflow.md` "Air paths computed".
- **75** AR pipes batched, PIPE DIMS / PIPE EDIT / T-split; View 3D keeps the plan's orientation.
- **76** Garden split level with RAMP, PLATFORM, GATE, GARDEN WALL, FENCE: written 10-12.
- **77** Gate products JAX/Bono (not set on the plan: the owner sets them in AR); veranda glass; stone paving.
- **78** Room ceilings + floor levels, door sills, basement floors, sloped stairs, the veranda on the Garden:
  written 10-13.
- **79** Links keep room levels; POV stands on steps/ramps; basement heating band as installed: written.
  Bare-pipe heat analysis in `docs/heat-loss.md` "Bare heating pipes in the basement".
- **80** (2026-10-14):
  - View 3D: Plan mode, ORBIT, plan-first, grey pipes in Model;
  - links carry conduits + pipes;
  - PNG pipe sheet;
  - ceiling boxing `soffit`;
  - the kitchen vent C21;
  - **one VMC unit for the house** (unit A removed);
  - unit B turned, window r146 two-leaf;
  - Falmec hood at 65 cm, generic hob;
  - see-through + finished boxings;
  - bedroom recess floored with a boxing above 2.50;
  - conduit cs418 snapped to the wall;
  - (10-15) the kitchen vent out of r162's door swing, options 1c then 1d: both ducts against the south wall through
    the drilled bedroom wall top, the kitchen Ø125 laid out for standard PVC elbows (box 37 cm, dropped to 2.46 round
    the vent, bedroom box 21 cm, a 45° pair in the laundry), the vent turned at x 1.60; the owner keeps PVC (≈ 64–80 Pa
    at the vent at boost, Hypothesis).

  All written (287 752); then the upper WC drain T1 (287 757), then layout S + narrower column (287 926). `docs/plumbing-workflow.md` "One unit for the whole house", "Unit B turned",
  "Ceiling boxings", "Kitchen vent", "Hood and alcove".

- **81** (2026-10-15):
  - `129407e` View 3D: the ceiling closes over an opening whose head reaches the ceiling (passage r117 into the
    kitchen had a slit);
  - `f106c5a` View 3D ▱ Floors see-through (to see pipes under a floor);
  - **the upper WC drain re-solved with real parts** (owner: "Dont assume the pipe layout on the headset is
    correct"): option A as written did not fit (the drop clashed by 11.8 cm with Nicoll sizes); T1 (the same
    route, Geberit's bend in its rear clip position) has no clash but needs bay 1 ≈ 20.5 cm deep; written
    (287 757). `tools/wc-drain-fit.mjs` re-runs it; `docs/plumbing-workflow.md` "Option A with real fittings" and
    "Fitting study, upper WC drain" hold every number and the rejected layouts;
  - the owner's slanted alternative **layout S** (tee branch down, its run west to the vent and east to the WC)
    solved with real parts (`tools/wc-drain-fit.mjs layout=S teeY=0.45 stackX=-4.434`): fits with ≈ 4 mm margins,
    same depth as T1, moves the vent to x −4.50 into the drawn VMC Ø80. With the stack at x −4.434 column r122
    narrows 50.5 → 35.5 cm and passage r56 widens with it. **Owner chose S + the narrower column: written
    (287 926)**, replacing T1; open: move the VMC Ø80 p39 west in r220 (2.6 cm overlap);
  - **the ground bathroom and kitchen ducts into the attic** (owner: the ceiling boxes are ugly; the roof slopes down
    to the east): written (287 526); the bath vent on the ceiling over the shower (2.45, −1.85), the C21 flush on the
    ceiling, only a corner box left in the kitchen; Ø80 all the way checked and rejected (≈ 69–81 Pa at the vent at
    boost, Hypothesis). Vent positions kept after an age-of-air comparison (owner, 10-15: "we keep those positions";
    every candidate within ≈ 5 %, the model has no plumes);
  - **View 3D pipe fittings** (`src/core/pipeFittings.js`, every size from Nicoll's datasheets): elbows, tees,
    reducers drawn from the angles, with buildability flags; it found the kitchen turn over the alcove and the laundry
    45° pair too short (draft 1d had left out the sockets). Owner chose **fix A** (a CX8 M/F at ①, the kitchen run 4.75 cm
    north, boxes +4.75 cm) and the longer laundry pair, **written (287 516)**: `docs/plumbing-workflow.md` "Fittings to datasheet sizes".
    Not yet in AR; never seen in a browser (Hypothesis). Still flagged: the WC stack foot (pn62–pn63) and pn81.
    Realistic drawings of both ducts (plan + looking north + looking west, distances, EN and ZH) were sent to the
    owner as files; their scripts were scratch only.
- **82** The bath Ø100's two flat 87°30′ (attic pn302, laundry pn306) as Nicoll 45° pairs, 18.4 cm diagonals:
  **written (287 829)**; ≈ 12–13.5 Pa at boost instead of 13–15 (Hypothesis). `docs/plumbing-workflow.md` "The bath
  duct's two flat corners".
- **83** `d3f566e`: View 3D controls regrouped (owner: "too many buttons over the view"): the nav keeps the actions,
  icons only on a phone; every show/hide switch and the look options in one 👁 Show menu (count of switches on); the
  floor panel a picker, collapsed on a phone; the pipe legend a chip. New ▭ Ceiling see-through (POV). Duct
  insulation derived from the plan (`src/core/ductInsulation.js`): VMC stretches outside the heated volume wear a
  yellow jacket in ▤ Plan, the metres in the legend (19.5 of 34.1 m on the owner's plan). `CLAUDE.md` View 3D
  paragraph; `docs/plumbing-workflow.md` "Which ducts to insulate".
- **84** The kitchen corner box r254 narrowed to its ducts, 40.3 → 30 cm west–east: **written (287 813)**; the
  boxes stay at 2.50 (in line with the alcove head). `docs/plumbing-workflow.md` "The kitchen corner box narrowed".
  Drawings with the box sizes (B1–B3) sent in EN and ZH, plus full share links, as files.
- **85** The bedroom box and the alcove column replaced by a 17.25 × 41.35 cm corner column r261; the ducts drop 45°
  through the slab and turn in parallel in the laundry; the bath duct moved north (y −4.655); the hub cable cs433
  rerouted (new cn352): **written (288 795)**. `docs/plumbing-workflow.md` "The bedroom box replaced by a corner column".
  Option 2 (no box at all, through the bedroom floor's lintel gap) set aside until the gap is measured.
- **86** VMC laundry layout and duct/vent sizing (owner questions, 10-16; nothing written):
  - **Option 4i written to the headset with the bed (10-17, 287 012 chars):** 4d with the shower vent moved onto the
    duct line (11 cm from the wall, the owner's deliberate deviation from Aldes' 20 cm), the shower Ø80 slanting 45°
    through the 41.5 wall's top from the attic (no kitchen box), unit B moved to the laundry's north-east part and turned
    (outlet straight south, 1.87 m Ø160 flexible), the upper duct Ø100 in the basement (sealed Ø80 above). The owner plans
    flexible kitchen and shower ducts. Pressure: the CSTB check (CPT 3828_V1) with the façade's 20 Pa fails for the
    Compact Classic in every layout; the Compact Premium HP+ passes in rigid PVC, misses one point by ≤ 2 Pa with
    flexibles. Unit choice open (Classic kept / MW from Leroy Merlin / HP+ from a marketplace seller). Open before W: the
    wall top at slab height where the slant passes (a ring beam?), the attic lintels at y −1.96, the outlet terminal, the
    chosen unit's datasheet. Full record: `docs/plumbing-workflow.md` "Option 4i" … "Option 4d", "Vent pressures against
    the BDH range".
  - ~~**Option 4d drafted, the owner adjusting it (supersedes 1e as the next write):**~~ (superseded by 4e–4i, same day) both ducts cross the kitchen–bedroom
    wall near the bedroom's north-east corner, every attic run east–west (the lintels run east–west); shower-room Ø80
    10.33 m, kitchen Ø125 7.86 m on the 41.5 wall's kitchen face, a 17 × 58 cm column with an S in each duct; fitting,
    clash and solver checks clean. Full record: `docs/plumbing-workflow.md` "Option 4d". Scratch: `opt4d.mjs`,
    `opt4d-rebuild.sh` (the parameters), `views4d.mjs` (the drawing), `draft-4d.json`; sketches `opt4bSketch.mjs`,
    `opt4dSketch.mjs`.
  - ~~**Option 1e drafted, awaiting W:**~~ (superseded by 4d, kept for reference) the slab slants stay west as written; in the laundry each duct runs west,
    turns 45° north-west, runs one long diagonal (14.3 cm between centres) and turns 45° west into its lane at
    x ≈ −1.27. Four 45° per duct instead of six; column and box unchanged; no clash; bath 12.47 m, kitchen 8.90 m.
    Option 1d (north-west slants, tilted elbow planes; bath +3.55 cm north, column 44.9) was set aside for 1e
    (owner: "I am ok if the duct land westward in basement before turning 45").
  - **Everyday flows and air (10-17, Hypothesis):** an operating-point simulation (`simFlow.mjs`) finds every unit delivers
    every vent's humidity flow at 40–50 % RH; at the evening peak the Classic's showers fall to ≈ 31.5 of 35 m³/h in wind,
    the MW to ≈ 34, the HP+ none. The app's age-of-air model (`kitchenAge.mjs`, `ageMap.mjs`; assumed EHB² inlets and two
    sleepers per bedroom, not in the plan) finds no stagnant kitchen pocket on 4i (91–95 min, the air arriving ≈ 1.5 h old
    from the living room); the weak point is the bedrooms at night (≈ 15–23 m³/h each, ≈ 1 850–2 260 ppm CO₂ from the
    10-12 runs), not the kitchen.
  - ~~**Open owner choices**~~ (settled 10-17: kitchen Ø125 and shower Ø80, both flexible; upper Ø80 sealed + Ø100 in the
    basement) (the redraft depends on them): kitchen Ø125 (as drawn) or Ø100 with two Ø125→Ø100
    eccentric reducers (C51 daily 15–55 fine, boost ≈ 113–124 instead of 135; the hood covers cooking); ground shower
    Ø100 (as drawn) or Ø80 (fine at the BW51's 35); the upper bath Ø100 (as drawn) or Ø80 (Hypothesis ≈ 21 Pa at 35). Owner settled: **one vent per bathroom**
    (both are combined shower + WC rooms; r107 + r62 is one room), **Ø160 insulated flexible** on B's outlet.
  - **Vents: Aldes BDH, never Bahia** (owner, 10-16: "Forget everything about Bahia"). The kit (LM 82201371) is
    "3x Bouches Bdh"; the approval is 14.5/25-2320_V2. F4 (owner: 3 bedrooms + living), Hygro B: kitchen **C51**
    (to buy; Ø125 cordelette 11015167), a **BW51** in each bathroom (CORD wanted, no presence), the owner's **B51** in
    the laundry; the owner's W16 has no room. Modelled: builder `vmc-vent-bdh`, entries `aldes-bdh-sanitaire[-ceiling]`,
    `aldes-bdh-cuisine[-ceiling]` (`dd00055`).
  - All in `docs/plumbing-workflow.md` under "The bedroom box replaced by a corner column" (the loss method, the
    vent flows, B's 221 m³/h capacity risk).

- **87** `d9d0b67` **Pipe anchors** (owner, 10-17): marker types `pipe_anchor_heating|water|waste|vmc`, a beacon
  where a pipe is known to pass (a slab hole). **No app function** (owner: "they only serve you as a beacon"); drawn as a
  ring in the service colour (View 3D: one InstancedMesh per floor, `3d09428`), H/W/D/V on sheets/DXF.
  `house-query anchors <house>` checks a route passes each one within 5 cm. None placed in the owner's plan yet
  (they place them in AR). `docs/plumbing-workflow.md` "Pipe anchors".
- **88** `3d09428` AR shows only the relevant dims per mode (owner): a DIMS mode its own kind; other modes the wall dims
  plus their group's pins; conflicts always. `docs/ar-survey.md` "Which dimensions show".
- **89** `1ee0a41` **BEAM zones** (owner, 10-17: the lintels, "it needs to help resolution of passing pipes"): PLAN · ADD
  BEAM · CEILING / BEAM · FLOOR (one kind; stored on the floor it is measured from, band relative to it, negative =
  under the floor; world box everywhere else). Clashing pipes magenta in AR pipe modes and ▤ Plan;
  `house-query beams <house>`. None drawn in the owner's plan yet. `docs/plumbing-workflow.md` "Beams".
- **90** `3d426f1` Furniture `lapeyre-flavio-80-oak` (builder `flavio-vanity`, Lapeyre Réf 1248230, 497.20 €): owner
  saw the photo comparison; not placed in the plan, no mount height chosen (wall-hung: the zone's FOOT).
  `docs/furniture.md`.
- **91** Floor finish `artens_easy_terracotta_45` (Leroy Merlin 95598422, grid design `concrete`, `concreteTile`):
  owner, 10-17: replaces the dark red 20×20 on the basement. Proven (preview stats vs photo 4908555; Node takeoff with
  the swap on the 287 012 read: 25.1 m², 162 tiles, 24 boxes). **Written 10-19** (the 286 557 write): the 7 `tile_200_dark_red`
  finishes (r66 r67 r68 r69 r74 r76 r227) swapped. `drawStoneCloud` gained an `srgb` flag (older designs unchanged).
  `docs/materials.md` "ARTENS Easy".
- **92** Gate `gate_trez_anthracite` (80095323, single leaf; design `trez`: 14 slats from the top, a cut slat on the
  bottom rail; fitted 11.1 mm gap, Hypothesis). Overlay on render 3247470: edges within 2–6 mm. Not placed (r243 has
  no product in the 287 012 read).
- **93** Gate `gate_trez2_anthracite_270` (80092306, 2 leaves) made to the owner's order: **2.70 m between hinge
  axes** → `axisSpan` 2.7, `axisIn` 0.03 (manual: axis 65 mm from the pillar, 35 mm play) → a 2.76 m gate centred on
  its zone whatever the zone's width, pillars 2.83 m apart. Proven (Node): pins at ±1.35 m. Not placed; r242 is
  drawn 3.010 m and would need 2.76 m.
- **94** Fence `fence_klosup_ajouree_anthracite` (98659652 slat, `boards` 9 cm / 9 mm gap, Hypothesis; no posts drawn).
  The plan has no FENCE zone yet.
- **95** Furniture `lapeyre-flavio-60-oak` (Réf 1248229, the 80's builder and params at 600 wide). **Written 10-19**
  (the 286 557 write; owner to verify in AR): `vanities.mjs` (on the 287 012 read) put the FLAVIO 60 on r130 (Ground, NW
  corner of r62, front south, beside door r64) and the FLAVIO 80 on r132 (Upper, NE corner of r86, beside door r93),
  foot 0.33 / top 0.88 (Hypothesis: owner to confirm the height), dropping their size dims (c870 c871, c906 c907).
  Proven (`house-query diff` / `conflicts`): only r130 and r132 change, no conflict. Rebuild it on the fresh read: set
  those fields, `x`/`y` = 2.225/−0.298 and −3.62/0.062, `w` 0.6/0.8, `h` 0.468, `productMm`, `facing` 0.
- **96** (10-18/19, docs only, no plan change; all in `docs/plumbing-workflow.md` after "4i with the kitchen and shower
  ducts in flexible"): **owner decisions: the unit is the Aldes Compact Premium MW (not the HP+); the kitchen Ø125 is
  flexible or semi-rigid (rigid not available in Ø125), threaded through the drilled holes.** Findings: semi-rigid
  aluminium loses ≈ 2.4× smooth and ≈ 1.8× taut flexible (Lindab chart, Proven reading); Aldes ALFLEX publishes no
  loss figure; the Ø160 outlet in semi-rigid costs ≈ 1–2 Pa (no effect); the MW re-run (Hypothesis, scratch
  `sim-semi*.mjs`) delivers every flow except ≈ 34/35 m³/h at the showers on a windy evening peak and ≈ 126/135 at a
  windy kitchen boost; the ground shower duct (duct 2, 6.49 m Ø80, 3.97 m of it outside bedroom r51) in rigid fixes the
  shower; Ø100 semi-rigid outside the bedroom ≈ 9–13 Pa (not drafted, room in the holes unchecked); unit connections =
  EasyCLIP adapters (Ø80 11033011, Ø125 11033010, Ø160 11033016), fit on ALFLEX semi-rigid is Hypothesis; joints CSF
  wire clamps. Also answered from the 287 012 read: the garden's west garden walls r236/r237 are 0.73 m high; the
  refrigerant lines 4.66 / 10.84 / 11.44 / 5.48 = 32.41 m; the VMC ducts 25.73 m (Ø80 13.43, Ø100 6.54, Ø125 3.89,
  Ø160 1.87).
- **97** (`d3894d5`, 10-19) Desktop 2D tool **#️⃣ Edge #** (owner: "a way to select an edge with a number" to
  say "a pipe marker x from one edge and y from another"): numbered pink edge tags, session-only, and an EDGE TAGS list
  with Copy (`Floor: x = … m (left edge of r…, kind; span)`); works in share views. Reading a pasted list: the
  coordinate is the reference (a share link renumbers zones), `docs/headset-data.md` "Pointing at edges". Proven: build,
  synthetic clicks in Chrome; not yet tried by the owner (QA item 2026-10-19).
  - (`d62477e`, 10-20) Share links now carry the zone ids (opt-in `ids`, top-level `ri`; on for 🔗 Share view and AR
    `link`, off for the QR), so tags in a share view name the headset's ids. Proven (Node, the 286 557 plan): +365
    chars, 181/181 ids and geometry kept; a bad `ri` falls back to fresh ids. Node also showed the plan holds 5 orphan
    finishes on r254 (removed 10-17); a link drops them. Harmless; clean them up on a later W if the owner wants.
- **98** (10-20, **written**, see Status; r92 then moved 7 cm west) **Door zones = the frame's outside** (owner: "the plan should reflect door frames
  instead of doors"; the door builder already treats the zone as the frame). A blanket +9.52 cm (LINE jambs) did not
  fit 5 of 8 doors (corridors/stairs too narrow), so the owner measured instead:
  - r137 (Ground): frame 71, flush with the north wall (new dim c1571 r54.top → r137.top = 0), 2 cm into the south wall.
  - r138 (Upper): frame 69, against the north wall (c1001 r138.top → r94.top 0.03 → 0): y −1.85 → −1.16, 1 cm
    short of the opening's south end.
  - r92 (Upper): frame 78, 12.5 cm from the corridor r87's west face (c987); it crosses the stair-side wall by 9.5 cm
    (owner confirmed).
  - r91 (Upper): frame 78, against the corridor's west face (new dim r87.left → r91.left = 0; c986 and c985 deleted).

  Scratch `door137.mjs` then `doorsUpper.mjs` on the 286 557 read (`edit-doors4.json`): `house-query diff` shows only
  those 4 zones, no conflict. Still to measure: r120, r119, r226, r78.

  **Leaf (`fdb802a`):** the owner measured r92's leaf at 73 in its 78 frame. The LINE entry got `leafInset: 0.025` and
  the builder a rebated leaf (`docs/materials.md` "A rebated leaf"). Proven in Node only. So a LINE frame = leaf + 5 cm
  (0.78 for a 73), not the 0.825 first assumed.
  **Meli rail (10-20, uncommitted):** the owner swapped r93's rail for the ARTENS Meli white (LM 91176300). There's a new
  entry `door_postforme_meli_white` (`rail: 'meli'`, `buildMeliRail`), and scratch `r93meli.mjs` switches r93's finish
  in the draft (`edit-doors5.json`, chained after `doorsUpper.mjs`). The Indus rail's end overlapped r91's frame by
  1.6 cm; the Meli box ends 3.1 cm clear, with the closed leaf flush with its end, as the manual draws (Node).
  (A first reading put the Meli's first hole inside the opening, which left the leaf 3.7 cm past the rail; the owner
  spotted it and the manual's pp. 10/18/20 corrected it.)

  **The r91 / r93 corner** (the owner felt r91 is too close to the sliding door). Proven in Node on the draft:
  - r91 is against the corridor's west wall; the frame stands 1.6 cm proud of each wall face (92 mm frame, 60 mm wall);
  - r93's opening ends 10 cm from the corner;
  - the closed sliding leaf (centred, 5 cm over each side) ends 3.4 cm from r91's frame; its face is 5.1 cm off the
    wall (Meli; the box 6.2 cm, Hypothesis: the leaf centred under the box);
  - r91 hinges at its east end, so its handles are at the corner end. It opens north into r90.

  **The LINE handle position** (found 2026-10-20, uncommitted): new catalog field `backset` (spindle to the leaf's
  lock edge; builder default 9 cm, unsourced). LINE: `backset: 0.05`, `roseDrop: 0.07` (was 0.075). Hypothesis,
  photo-measured: Lapeyre publishes no lock drawing; on both straight front photos (zoom1 202546631/633, an 83 leaf,
  3.65 px/cm) the roses are 7.5 ± 0.4 cm in from the frame's outside and 7.2 cm apart, matching the usual French lock
  (axe 50, entraxe 70). The owner's tape on a mounted door would prove it (`docs/materials.md`).
  Corner with it (arithmetic on the draft, scratch): r91's spindle is 7.5 cm from the corridor's west wall (was 11.5);
  in plan its rose's west edge lines up with the closed Meli leaf's face (0.2 cm apart across), but the leaf ends
  2.2 cm short of the handle bar's corridor side and 7.4 cm short of the rose's plane, so they don't touch; the
  Meli box (from 2.07 m) is far above the 1.05 m handle. The lever points east, away from the corner.

  Drawings (scratch, session-local): `doormap/doors-*.png` (doors to check per floor), `corner91.png`,
  `top-r91-r93.png` (Indus), `meli-top.png`, `meli-elev.png` (`meliViews.mjs`).

  **🚪 Doors** (`864cebd`): View 3D nav toggle; a tap on a door opens/closes it (every door built both ways,
  `View3D.closedDoors`, session-only). The owner used it on a draft link and said "R91 is ok now".
- **99** (10-21, uncommitted) **Write the solved form** (owner OK): `tools/solve-house.mjs <in> <out>` loads a plan
  through the app's loader + solver and serializes it back. Why: edit scripts change a dimension but not the stored
  positions, so the file stays stale until the app's next save, and then a fresh read no longer equals the base. Seen:
  edit 69 (10-12) set c997 −0.22 but left m210's stored y at −1.18 for 8 days; the app re-saved −0.05 on 10-20.
  Proven: on the app's own save the tool is byte-identical; on the stale copy it moves only m210 (and matches except
  `activeFloorId`). The headset copy (286 266) still stores r92 x −2.625 (solved −2.695): the next fresh read will differ
  by that once the app saves. Procedure updated (`docs/headset-data.md`, skill `quest-edit` step 4).
  Also answered: an AR save never reorders or renumbers zones, dims or markers (serializer keeps order; Proven on the
  10-20 reads).
- **100** (10-21, uncommitted) **Wall devices faced south since 10-13.** Owner report with a phone screenshot: the two
  plates above the Ground bathroom vanity (m13/m19 switch, m210 outlet on the west wall) stood edge-on, half in the wall.
  Cause (Proven, code + git): `b8e9f38` (10-13) merged `markerPlacements: wallMarkerPlacements(...)` into the `//` comment
  of the `stairwell` line in `buildArchitecturalFloor`, so View 3D and the AR 3D view got no placements: every plate at
  its raw point, rotation 0 (facing plan −y). Fix: the entry back on its own line. Proven in desktop Chrome on a
  synthetic test house (same layout): edge-on before, flat after. Not seen on the owner's plan, phone or AR. My Node
  plate checks missed it because they called `wallMarkerPlacements` directly; this is why tests come next (Next step).
  Side findings (Node, the 286 266 plan): basement m119/m140 standard faces cut a perpendicular wall by 4 cm (a corner);
  six wall lights (m112 m137 m20 m126 m128 m192) draw as a horizontal ceiling puck half inside their wall (offered:
  turn a light near a wall and below the ceiling into a wall light; the owner said that was not their issue; undecided);
  m13 and m19 are two plates at one point.
- Answered 10-17 (no change): the Ø160 outlet on 4i is **1.87 m** (p70, straight south); AR draws VMC ducts as flat
  light-grey bands at true height, real width, only in the HEATING pipe modes.

Sessions 31–39 (items 1–45): see `git log` and the docs. Item numbers are still cited in `docs/ar-qa-checklist.md`.

## Standing decisions (the "why" is in the docs)

**Process**
- **Pipe anchors (2026-10-17):** before drafting or writing any pipe route, run `node tools/house-query.mjs anchors <house>`; a route must pass every anchor of its service (`docs/plumbing-workflow.md` "Pipe anchors"). Anchors are beacons only, no app function. Also run `house-query beams <house>`: a route must cross no BEAM ("Beams", same doc).
- **Label every claim Proven or Hypothesis** (in reports, commit bodies and docs).
- **Git:**
  - commit + push directly on `main`, only when asked; **every push publishes**;
  - non-trivial commits get a descriptive body;
  - stage by explicit path, never `git add -A`;
  - never stage a house JSON.
- **This machine is a Steam Deck** (Node v20 via nvm). The fnm/PowerShell block in `CLAUDE.md` is Windows-only.
- **Products:**
  - **Products with no manufacturer model are code, never stored GLBs** (a procedural builder or a `design`).
  - Products with a manufacturer STEP are built procedurally, measured from the STEP.
  - Every generator embeds a `// Sources:` block (URLs, spec values, photo/PDF ids, estimates).
- **Images** are downloaded at runtime and cached, never committed. A retailer photo may replace the procedural
  texture in View 3D Realistic only.
- **Every texture is prepared in the background** (a painter in `src/ui/painters.js` + `paintedTexture()`, or a
  worker job). The plan view prepares nothing 3D.
- **Owner preferences:**
  - keep product advice **generic** (a brand's datasheet only gives typical sizes);
  - plots are elevations "west wall facing me" (north on the right), sometimes in Chinese; "realistic" drawings show
    pipes and fittings to size, with distances outside the views;
  - a "face view" is drawn as seen standing in the room facing that wall (facing south: east left, west right).
    Earlier session-40 "elevations facing the south wall" were mirrored.

**Owner design decisions in force**
- **Heating:**
  - one water temperature for every radiator, ΔT 24 (46 °C mean); the −7 °C shortfalls are accepted;
  - a gas boiler for 5 years, then a heat pump; 16×2 multilayer pipes;
  - kitchen + ground shower + workshop r74 on ONE pair with lockshields (the plan still draws the shower's own
    pair: Next step 1);
  - the whole-house balance stays a toggle, off by default.
- **VMC:**
  - ONE Aldes EasyHOME unit B in the laundry, a Classic (not HP);
  - efficiency, not compliance: no inspector, so DTU 68.3 is only guidance;
  - few bends, pipes against the wall, shallow trenches;
  - **PVC ducts, also the kitchen Ø125** (owner, 10-15: "I for sure will keep pvc"); short PVC elbows where room is
    tight, a 45° pair wherever there is room;
  - Aldes's "≥ 20 cm from the vent's centre to adjacent surfaces" counts only surfaces hanging down beside the vent
    (walls, a hood chimney), never a box edge that goes up (owner, 10-15: "absence of surface should not count, it is
    not a wall");
  - the bedroom's south-wall top (x −0.53…0) may be drilled/channelled for the ducts (owner, 10-15; builder's call);
  - **the ground bathroom and kitchen ducts run in the attic** (owner, 10-15), never in kitchen ceiling boxes; the
    vents stay where they are (bath over the shower, C21 beside the hob); the bath duct stays Ø100;
  - the alcove turn uses a Nicoll **CX8** M/F 87°30′ Ø125 (fix A); the owner wants product sizes from datasheets,
    never guessed (10-15): `src/core/pipeFittings.js` holds Nicoll's values;
  - the hood gets a real Ø150 exhaust through the south wall (owner); its chimney stays at 2.50 for now; it needs a
    `hood` pipe service first (owner OK) so the VMC airflow model ignores it.
- **Waste:**
  - no roof vent; a Ø100 façade vent at the upper floor's south-east corner;
  - a Ø100 air valve on the upper riser;
  - **upper WC drain (owner, 10-15):** only the lintels and the frame's distances (WC axis 60 cm from the west wall,
    frame face 20 cm from the north wall) are true; the headset's pipe layout is not to be trusted. Fixed: Geberit's
    bend kept, the frame doesn't move, the vent in boxing r220, the stack down column r122. Kept: **T1**, rear
    clip. Pipe layouts get checked with real fitting sizes before the contractor works.
- **AC:** Daikin 5MXM90A, outdoor unit under the west-façade camera; refrigerant lines are pipes, not conduits.
- **Conduits are drawn on the wall face but are buried in reality** (owner, 10-14). A conduit may touch furniture
  backs. Ducts may cross the wall top above the bedroom alcove (owner, 10-14).
- **Materials:**
  - Monastère is laid stepped random;
  - patterns are anchored at the plan origin unless a floor region sets a start corner / 90° turn;
  - no waste margin; grout weight per room only;
  - wall faces are set one at a time (a copy-to-all action was removed at the owner's request);
  - an applied material is a centre badge in AR, never a fill.
- **Doors and windows:**
  - a door/window product is a material of its zone;
  - a rail-hung door goes on a SLIDING zone;
  - portes-fenêtres and bays go on WINDOW zones with sill 0.
- **Device products:** switch/outlet/Ethernet products are stored as `marker.product`. Model only the visible
  parts. Grip cycles overlapping targets before the trigger selects.
- **Furniture:**
  - four facing directions;
  - picked in MATERIAL · FURNITURE;
  - solved one-way after the structure;
  - an over-specified dimension is **deleted, never shown as a conflict**;
  - radiators are furniture products.
- **AR (detail in `docs/ar-survey.md`):**
  - the AR 3D view (LEFT X) shows only the model: white ceiling, opaque exterior glass;
  - doors are drawn open in both 3D views;
  - the readout holds up to 6 lines; pills widen up to 576 px before the font shrinks;
  - one `gripCycle` for every picking mode;
  - stacked markers are never drawn apart (an amber count badge shows them);
  - a double switch is one `switch_dual` marker, rockers left/right;
  - FLOOR changes only the ground height;
  - input model: thumbstick-x = mode, thumbstick-y = cycle, A/X = flip, B/Y = delete, grip = non-destructive,
    trigger = commit;
  - RIGHT edits; LEFT: trigger teleport, grip sheet/card, stick rotate/storey, X = AR 3D view.
- **AR overlays are batched**, never one Mesh/Sprite per item. **Measure with PROJECT · PERF before optimising.**
  A product material is cached per entry so products merge. AR devices are built at `detail: 'low'`.
- **Model:**
  - axis-aligned rectangles only;
  - heights are floor-referenced (also in a room with its own `floorZ`);
  - every stored length is on the 0.1 mm grid (a new length field goes into `_snapToGrid`);
  - markers/conduit/wires/pipes/furniture are parallel lanes, never in the solver;
  - sheets are monochrome; exports stay on the legacy extrusion; shared views are read-only.
- **Heat loss stays simple** (simplified EN 12831, the limits listed in `docs/heat-loss.md`). Exterior insulation
  is drawn as INSULATION zones outside the room.
- **Share links carry everything View 3D draws**, plus the network (opt-in). Floors are named by list position.
  The QR drops markers and the network.

## Findings / traps worth knowing

- **`encodeViewToHash` already returns `view=…`:** a link is `base + '#' + payload`. Prepending `#view=` made a dead
  `#view=view=…` link on 10-22 (the owner saw no beams). Check a link by decoding the fragment after `#`.
- **A local test port may still hold a copy of the owner's plan** (10-21: 127.0.0.1:5193 opened on a 3-floor plan from
  an earlier session; closed at once). Before loading the app on a port, open a plain page on that origin (serve a
  `blank.html`) and check `localStorage` is empty, then write the synthetic house there first. Also unregister the
  service worker after a rebuild, or it serves the old bundle.
- **A property can vanish into a comment:** `key: value, // note otherKey: …` silently drops `otherKey` and the build
  stays clean (item 100). Only a test or a look catches it.

**Air model and drafts (session 41)**
- `src/core/airflow.js` treats a `vmc` duct end within 15 cm (`PORT_REACH`) of a VMC unit's footprint as a unit port,
  not a vent: 4i's laundry stub ends 12.9 cm from unit B, so the model silently drops the laundry vent (and with it all
  basement airflow). Lengthen the stub (≥ 15 cm clear) before trusting a basement run. Proven by reading the code and a run.
- A `halfwall` zone's `sill` is its top (default 1.1): a new floor-to-ceiling column needs `sill: 2.7`, or it shows low
  (the owner caught it on 4i's column r263; the share link carries the sill).

**Headset**
- **Never run `adb shell pm clear com.krosk.housecad`:** it wipes the owner's autosave and slots.
- **Connecting to the headset:**
  - `quest-storage.mjs` needs `node --experimental-websocket` and
    `adb forward tcp:9333 localabstract:chrome_devtools_remote`;
  - adb is at `~/Android/Sdk/platform-tools/adb`;
  - the Quest Browser must be in front of the wearer, or calls hang (`prox_close` keeps an unworn headset
    awake);
  - if the pairing is lost: `../quest-mcp-test/.claude/skills/quest-connect/SKILL.md`.
- **Checking the app is closed:** an empty `adb shell pidof com.krosk.housecad` means it is closed. A process
  stub can persist after the owner closes it; then the DevTools page list (no `?ar=1` page) is the proof.
- **An edit script takes its next ids before removing anything** (a script once reused r245 and c1537–c1541).
  Check that rect and dimension ids are unique across floors before writing.
- **New zone kinds, catalog articles or enums:** write a plan holding one only after the app that knows it is
  installed and relaunched. Hypothesis, from `Rectangle`: an unknown kind reads as a WALL and is autosaved; an
  older app turns an unknown pipe service into `cold`.
  - minimum builds: `soffit` ≥ `f9a4340`, C21 ≥ `61e3493`, the hood/hob ≥ `106f527`/`007e2ca`;
  - the Garden split level needs ≥ `23ac94a`.
- **The diff tool ignores furniture heights** (`house-query.mjs diff`): check foot/top edits from the script and
  the read-back.
- **Plotting from a saved JSON shows stored sizes, not solved ones:** run it through `deserializeInto` +
  `serializeProject` first.
- **The APK always opens `/house-cad/?ar=1`** (no URL switches), but it shares `localStorage` with the Quest
  Browser.
- **Latent:** `~/house-cad-apk/app/src/main/res/values/strings.xml` lacks `appName`/`launcherName`; add them before
  the next `bubblewrap build`.

**Deploy**
- **A deploy can build but not publish** (`deploy-pages` 500, seen twice). Check the run's jobs without login
  (`curl -s https://api.github.com/repos/krosk/house-cad/actions/runs?per_page=3`, then `/jobs`; there is no
  `gh` here) instead of polling `version.json` for 10 minutes. Grep `version.json` for the hash you pushed.
  The next push or a re-run on the Actions page carries it.

**The owner's plan**
- **The Garden** is a split level (`level` −0.90). Its height is 3.10 so the veranda on it reaches its 2.20 roof;
  lowering it cuts the glass.
- **A wall zone over a room removes that room's floor** (flooring, slab, area). For a recess that keeps its floor,
  keep the room and put a `soffit` over the wall part.
- **The west heating pipes are one flat band at 26 mm centres** (as installed). Clash scripts flag every neighbour
  in it; that is real, not a defect. It stays ≥ 20 cm off the west wall: column r122 also holds the WC waste.
- **Check a window's leaves before routing at head height:** the sweep comes from `windowSwings`, not the
  rectangle. r146 was wrongly drawn as one leaf until 10-14.
- **The basement's west face is x −4.55, 15 cm inside the ground floor's** (a survey error the owner will
  correct; the ducts are drawn that way on purpose).
- **Data oddities:** cameras m174/m183 have `z = 0`; doors r77/r120 are drawn wider than their opening.
- **Clash-check risers in absolute height.** The per-floor scratch check (`clashFloor.mjs`) skips any conduit with an
  end on another floor, so it missed the hub cable cs433 (bedroom wall hub cn70 → laundry) crossing the duct drops
  (found 10-16, rerouted). A cable hub sits in the 41.5 wall's bedroom face at y −4.74 (cs76/77/299/305–307).
- **A 45° elbow at the foot of a 45° slant can only come out level straight on** (geometry): to leave level in
  another direction, tilt the slant itself (1d) or turn after landing (1e).
- **Vent flows are the Aldes datasheet figures, not measurements**, and each needs 80–160 Pa (C21 70–160 at boost)
  to hold them; below that it acts as an orifice. Unit B's only published point is 122 Pa at 144 m³/h, max 221.
- **r107 + r62 are one room** (the ground shower room with its WC, owner 10-16): r62 is not a separate WC.
- **The model draws pipe turns as sharp corners; View 3D's fittings (`src/core/pipeFittings.js`) and their flags
  show the real ones.** Nicoll's Z runs from the corner to the **socket bottom** (Proven: the M/F datasheet's drawing),
  so two F/F fittings need (Z + L) + (Z + L) between corners (two Ø125 87°30′: 31.4 cm; draft 1d's 19.2 left out
  the sockets), an M/F one h + the other's Z (CX8 + CX88: 25.3 cm). A face-down Ø125 vent turning into a run needs
  ≈ 16 cm (spigot in the socket + Z 96). Any 45° that descends must start inside a column, never under a 20 cm box.
- **A wall cabinet's door sweeps at its top edge:** r162's 60 cm door (hinge x 0.818, y −5.067) reaches x 1.418 at
  2.48 when fully open. Anything lower than 2.48 near there (a vent, a dropped box) must stay outside that sweep.
- **Real fitting sizes, not the drawn corners, decide a layout:** Nicoll PVC Ø100 87°30 needs **13.4 cm** from the
  corner to the socket mouth (Z 77 + socket 57); two joined fittings need the sum of theirs (21.1 cm for a CT8 M/F
  pushed into a BT188 tee). The 9 October option A plot (`opa.mjs`) assumed 9.9 cm and never checked the drop, so it
  "looked fine". Use `tools/wc-drain-fit.mjs` or the same arithmetic before calling a waste layout buildable.
- **Geberit Duofix 111.333.00.6 facts (Proven: CAD + manual 972.363.00.0):** drain axis 23 cm above the
  **finished** floor (the frame's 0 mark; legs reach a raw floor 0–25 cm lower); the supplied PVC bend 90/100 is
  curved down to 15.7 cm and straight below (cut there, never above); it points down or straight back only; its clip
  has two positions, the second 15 mm toward the wall (the 10–13 / 11.5–14.5 cm figures are the inlet's reach to the
  finished wall, not free play). Geberit also sells sideways "offset" bends (366.913.16.1 left / 366.914.16.1 right,
  Ø90): level outlet 10.3 cm below the WC axis (Proven from their CAD; not yet checked against this frame).

**View 3D, textures and products**
- **Metal renders near-black in basic View 3D** (no environment map outside Reflections/Realistic). Keep steel at
  metalness ≈ 0.25–0.35 and preview without `scene.environment`.
- **Scratch previews:**
  - a preview that paints textures must import `src/ui/textureWorker.js`;
  - a module the worker imports must never import `textureWorker.js`;
  - a texture freed by `freeAfterUpload` must never upload again;
  - the setup: a Vite config in the scratchpad (`root` = scratch, alias `three` → the project's, `server.fs.allow`
    both dirs, :5190); the page POSTs `canvas.toDataURL()` to a small receiver on :5191 (Chrome screenshots of
    WebGL tabs time out); compare with ffmpeg (there is no PIL);
  - stop the servers by port (`ss -ltnp | grep :5190`), never `pkill -f`.
- **Browser checks of the app:**
  - serve `dist/` over plain HTTP;
  - unregister the service worker and clear `caches` after a rebuild;
  - a hidden tab stalls rAF and the View 3D wheel;
  - long `#view=` URLs are echoed in every Chrome-tool result (use `history.replaceState` after load);
  - inject a test house into `localStorage` a few seconds after the first load (the demo autosave overwrites an
    earlier write).
- **The owner's house JSON never goes into a served folder or a browser;** use it in Node only.
- **The Chrome extension tools could not load any page from this machine** in session 40 (`chrome-error` for
  localhost, the LAN IP over HTTP; the HTTPS dev server stops at the self-signed-certificate warning, which must not
  be clicked through). **What worked (Proven, 10-16):** `npm run build`, serve `dist/` over plain HTTP
  (`python3 -m http.server 5194 --bind 127.0.0.1` in `dist/`), start
  `flatpak run com.google.Chrome --headless=new --remote-debugging-port=9555 --user-data-dir=<scratch> --use-angle=swiftshader --enable-unsafe-swiftshader`,
  and drive it over CDP with `node --experimental-websocket` (set the viewport, click by id, `Input.dispatchMouseEvent`
  for taps and drags, `Page.captureScreenshot`). WebGL renders. Inject a made-up test house into
  `house-cad:autosave:v1` and reload; never the owner's plan. In POV a mouse drag upward looks up. Stop both by port.
- **Photo finishes:** never tile a photo; joints come from the texture. Check textures against the full-resolution
  photo.
- **Retailer sites:**
  - Leroy Merlin = DataDome (Chrome only; use the search box; the "Verifying" page passes by itself; sibling
    refs are near each other);
  - Lapeyre = Akamai;
  - leboncoin rejects Node's fetch;
  - Joybuy shows a login to curl;
  - marketing photos can be edited copies, so count on studio renders;
  - `tools/product-images.mjs` encodes all of this.
- **A furniture zone's `article` is the catalog KEY.** The catalog is fetched, so core code snapshots `productMm`.

**AR code**
- **`mr.js` does not subscribe to `project.onChange`:** call `buildPlan()` / `buildConduits()` / … by hand.
- **Every planGroup overlay must be in `PLAN_OVERLAY_GROUPS`**, or `buildPlan`
  detaches it.
- **AR code runs only inside the XR closure.** Verify it in Node by slicing functions into a harness, and say so.
- **Clipboard writes in AR** need the text prebuilt and `writeText` called first in the XR `select` handler.
- **The Quest has no GPU timer:** PERF ms are frame intervals (steps of 11.1 ms); calls and triangles are exact.
  The frame rate swings with headset state, so compare runs only back to back.
- **HUD panels draw in the transparent pass** (order 90/100/110). The material card clones materials; never mutate
  shared ones.
- **`placeAt` resets `navOffset`/`navLift`/`anchorYaw`;** re-anchoring goes through `regroundAt`.

**Code**
- **API returns:**
  - `addConduitSegment` / `ensureConduitNodeAtMarker` return existing items;
  - `addWire` returns `{ ok, wire }`;
  - `wireSegmentPath` returns ids.
- **Wall faces follow the finished surface** (`edgeFace`): linings inset the face, stairwell edges are open.
- **A furniture zone's `facing` turns counter-clockwise** in 90° steps (seen from above); a 90° clockwise turn is
  `facing: 270`. With a product, the solver swaps the footprint.
- **A soffit's side is hidden only by a neighbour as low or lower** (`soffitFace`): a lower box beside a higher one
  draws (and counts) its whole side, part of it inside the neighbour.
- **Thick walls between rooms are hollow in 3D** (a 12 cm skin per face).
- **Mixed-hunk commits:** build the staged blob with `git hash-object -w` + `update-index --cacheinfo`; never
  `apply --unidiff-zero` or `stash --keep-index`.
- **`rlog` works only on the dev server;** never stage `quest-debug.log`.

## Commits (sessions 40–43; all pushed, doc-only omitted; earlier sessions: `git log`)

Session 41: `dd00055` Aldes BDH vent models (`vmc-vent-bdh`) + VMC docs · `d9d0b67` pipe anchors + `house-query anchors` ·
`3d09428` per-mode AR dims, batched anchor rings · `1ee0a41` BEAM zones + `house-query beams` · `3d426f1` FLAVIO vanity ·
`796a788` ARTENS Easy tile (`concrete` design), Trez gates (one leaf; two leaves with `axisSpan`/`axisIn`), Klos'up fence
slat · `74ca566` FLAVIO 60 · `6ec32b6` skill `quest-connect` (port scan) · `d3894d5` 2D #️⃣ Edge # tags · `d62477e`
links carry zone ids (`ids`) · `fdb802a` the LINE rebated leaf (`leafInset`). Session 42: `b9e8676` Meli rail +
LINE `backset` · `864cebd` View 3D 🚪 Doors. Session 43: `e85912c` wall devices face the room · `c85cb39`
`tools/solve-house.mjs` · `64b29ce` View 3D ▬ Beams. Session 44: `3bebe48` `npm test` (14 tests, run in CI before
the build). Session 40:

`8dc326f` version.json · `734560a` V&B WC · `ce85140` air volume + balance · `4da7198` shutter outlet products ·
`74e4bff` window swing · `a913657` refrigerant · `b1cd35d` TOOL menu · `52583bc` VMC service + Agalina ·
`2f3771a` waste · `d7538ff` ruler + 3D links · `c29de11` Aldes EasyHOME · `26aaad7` Duofix, see-through half walls ·
`1844a8c` / `54d4d22` / `b7be815` airflow, 3D map, sleepers · `42220b3` AR pipes batched · `e6ef977` PIPE DIMS/EDIT ·
`ac1c277` keep the plan's orientation · `23ac94a` garden split level · `eed5dc1` FENCE · `cfd3193` gates ·
`9375539` stone paving · `f868bda` room ceiling/floor level, sills · `66ea099` basement floors · `b8e9f38` paved
ramps, sloped stairs · `92fffea` links keep room levels · `72440f4` POV on steps · `f9a93f1` View 3D Plan ·
`ad651fa` links carry the network · `481ad14` PNG pipe sheet · `f9a4340` `soffit` · `61e3493` C21 vent ·
`3dacf2b` grey pipes in Model · `bfd0c83` opens on Plan · `969e599` Plan from POV · `ce570b9` ORBIT ·
`106f527` Falmec hood · `d476b07` see-through boxings · `007e2ca` generic hob · `7ef82c4` hood at 65 cm ·
`d6b710f` boxing finishes · `07a5ce5` the Plan/Model button no longer shows pressed · `129407e` ceiling over
full-height openings · `f106c5a` ▱ Floors see-through · `1a40798` `tools/wc-drain-fit.mjs` (layouts T1 and S) ·
`6da6a2b` View 3D pipe fittings to Nicoll sizes + buildability checks · `d3f566e` 👁 Show menu, ▭ Ceiling,
duct insulation marking.

## Resuming from a clean checkout

```bash
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | tail -1)/bin:$PATH"
npm install                                       # once; node_modules is already present
npm run dev -- --host                             # https on 5173; report the Network URL (stopped at the end of s40)
npm test                                          # 14 tests, under a second; expect "# fail 0"
npm run build                                     # expect "✓ built in …"
```

The owner tests through the APK, which loads the **published** site, so on-device checks need a push. The APK
project (`~/house-cad-apk`), the assetlinks repo (`~/krosk.github.io`), `~/.bw_pw` and Bubblewrap's JDK/SDK
exist (`packaging/quest-apk.md`); don't re-init. Scratchpad scripts and backups from earlier sessions are gone.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `tools/quest-storage.mjs` / `tools/house-query.mjs` | Headset backup/read/write/update-app / query, diff and check a plan in Node |
| `src/core/pipeAnchors.js` / `src/core/beams.js` | Anchor types + `checkPipeAnchors` / beam world boxes, `beamBand` defaults, `pipeBeamClashes` (both Node-testable; `house-query anchors` / `beams`) |
| `src/core/pipeFittings.js` | Fittings derived from a pipe network: Nicoll datasheet sizes, `angle` / `short` / `mf` checks (View 3D draws them; Node-testable) |
| `src/core/ductInsulation.js` | Which VMC duct stretches lie outside the heated volume (`ductInsulation(project, pos)`); ▤ Plan draws the jackets; Node-testable |
| `tools/wc-drain-fit.mjs` | Upper WC drain T1 (default) or `layout=S`, with real Nicoll/Geberit parts: clash check, bay-1 depth, `svg=` face + side views; `screed=`/`slabBottom=` take site measurements |
| `src/ui/mr.js` | The whole AR session (modes, HUD, PERF, batched overlays, export) |
| `src/ui/view3d.js` / `src/ui/planLayers3d.js` | Shared renderer and the four camera states / View 3D's ▤ Plan layers |
| `src/core/architectural3d.js` | Plan → slabs, walls, openings, stairs, soffits, finish geometry (pure, Node-testable) |
| `src/core/model.js` / `constraints.js` / `conduit.js` | Model + `_emit` / the solver / the conduit + pipe graph |
| `src/core/flooring.js` / `src/core/materials.js` | Finish regions, wall and soffit faces, takeoff / the finish catalog |
| `src/core/heatLoss.js` / `airflow.js` / `windowSwing.js` | Heat loss + balance / VMC air network / window leaf sweep |
| `src/ui/proceduralFurniture.js` + `public/furniture/index.json` | Procedural products (`BUILDERS`) + the catalog (`sizeMm`, `mountZMm`, `params`) |
| `src/ui/finishTextures.js` / `painters.js` / `textureWorker.js` | Finish designs / named painters / the worker client |
| `src/io/shareView.js` / `src/io/planSheet.js` | Link payload / sheets (incl. `pipeSheetOptions`) |
| `src/core/i18n.js` | EN/FR/ZH strings: every new mode needs `mode.*` + `help.*` |
| `src/ui/doorProducts.js` | Door, rail-door and gate builders; `GATE_PROFILES` (jax, trez, bono); a gate with `def.axisSpan` has its own width |
| `.claude/skills/quest-connect/connect.sh` | Connects adb to the Quest (Bubblewrap's adb; mDNS, the cached address, then a port scan of that one host) and forwards DevTools |
| scratchpad `door137.mjs` → `doorsUpper.mjs` → `r93meli.mjs` (`edit-doors5.json`), `read-1020.json` | Item 98's door draft on the 286 557 read, chained in that order (session-local; item 98 lists every value to rebuild it) |
| scratchpad `colStack2…5.mjs`, `ductViewsCol*.mjs`, `zhCol.mjs`, `clashAbs.mjs`, `cmpDucts.mjs` | Session-local: the corner-column edits (1b…1e), their drawings (EN/ZH), the true-height clash check, duct length/fitting counts. Gone with the scratchpad; rebuild from the doc if needed |

## Next step

**Active:**
00f. **AR Realistic: step 1 (sun + shadows) built 2026-10-23 on the owner's go, uncommitted.** LEFT Y in the AR 3D
   view toggles it, held LEFT Y + stick-x moves the hour; design and limits in `docs/realism.md` "In AR". Proven:
   `npm test` (19, incl. `test/realism.test.js`: noon sun from plan south, morning from plan east) and the build.
   Hypothesis until seen on the headset: the look (sun 2.4, hemisphere 0.3–0.65, catcher 0.35 are guesses), the fps
   (PERF, 3D view on, Realistic off/on), shadow acne; QA items in `docs/ar-qa-checklist.md` "AR Realistic".
   Step 2 built too: the photo finishes in AR (`applyArPhoto`, colour only), Proven in Chrome on a scratch page
   (both photo shaders compile and draw on Lambert with a PCF shadow; not seen on the headset). Not in AR, by design:
   the sky and GTAO.
00h. **Performance runs driven from here (owner asked 2026-10-23), built, uncommitted.** `tools/quest-perf.mjs` + the
   flag-gated test hook (`mr.js` `window.houseCadTest`, `view3d.js` `xrTimingTotal`); design and traps in
   `docs/headset-data.md` "Performance runs". Proven: the hook loads on the headset (a local build through
   `adb reverse`); a DevTools gesture cannot start AR (the browser's "Enter VR" chip waits for the wearer); the
   launched app's page is in `/json/list`. First run done 10-23 on `619b37d` (results in `docs/ar-survey.md` "Performance notes": plan 86 fps, 3D 27,
   Realistic 16; GPU-bound). Then the experiment switches (hide parts, shadow size/type, `--scale`, shadow redraw count,
   `--view`: the owner's standard viewpoint is the living room's NW corner toward the origin, `--view -4.4,4.2`).
   **Found 10-23: AR rendered the scene ~7 times per XR frame** (three's window loop restarted at session start,
   `docs/ar-survey.md` "Performance notes"). Fixed in `view3d.js` `_animate` (uncommitted), test `test/xrLoop.test.js`.
   Next: "c p", then re-run `quest-perf.mjs --view -4.4,4.2` (all scenarios) and only then optimise furniture etc. The headset is left awake with
   `prox_close` (owner asked); `automation_disable` restores the sensor.
00e. **The electrical panel (owner 2026-10-22/23), step 1 built, uncommitted (above); the rest parked by the owner.**
   Owner facts: Legrand Drivia ready-wired T4, 3 × 13 (Leroy Merlin 71653631), on the basement's south wall ~20 cm from
   the east wall; the 23 breaker markers (m235–m272) are "placeholders for connecting markers in the same circuit
   line" (20 wires end on them) and stay put. Design: `docs/electrical-workflow.md` "The panel". Not done: a panel
   marker on the plan (owner to place it in AR, or a W with its height), the breakers' slots (owner to give them).
   The owner found AR markers too big for slots (9 cm vs 17.5 mm) and asked for other UX; offered and **parked**:
   magnified floating panel (3×) with circuit tags to drop · the app proposes a layout and the owner swaps ·
   label the real panel in passthrough · walk circuit by circuit with a mini panel on the left controller · pull a
   rubber-band cable to a slot · a desktop panel editor. My pick: the app proposes, then the magnified panel; also
   half-size breaker markers (4.5 cm). Wait for the owner's choice.
00g. **Kitchen sink drain: written 2026-10-23 (307 484).** Owner: the sink is as per plan (unit r159, west wall).
   Owner to check: the trap height (0.50 assumed), the route behind corner unit r158 (back panel or plinth). The
   façade vent stays Ø100 (owner asked about smaller: see the doc section). Plot sent (scratch `sink-tee.png`).
~~0000. Tests~~: done 10-22 (`3bebe48`, pushed). `npm test` (`node --test test/*.test.js`, 14 tests then, 19 with
   the uncommitted panel and sun tests, Proven passing; CI runs it before the build). Synthetic houses in `test/house.js`. They cover:
   - device placements facing the room, and no plate cutting a wall (Proven: removing `markerPlacements` makes 2 fail);
   - a door cutting the wall to its head;
   - a solved save staying stable, and the save round-trip;
   - the solver: signed distances, conflicts, the 0.1 mm grid;
   - a share link round-trip (and no `view=view=`);
   - the LINE door's 0.73 leaf and its handle 5 cm from the lock edge, and 🚪 Doors open and closed.
   Found along the way:
   - `validateProjectData` returns a message and never throws, so `solve-house.mjs` ignored it (fixed: it exits 1);
   - a dimension moving a zone's edge past its opposite edge flips the zone and is not flagged red (Proven in Node,
     solver.test.js comment; not fixed; owner's call whether it should be).
   Next tests worth adding: heat loss, takeoff (`flooring.js`), conduit/pipe risers across floors.
~~000. "c p" for the uncommitted files~~: done 10-22 (`e85912c`…`f1b4def`, installed on the headset). The owner still
   checks the vanity plates on the phone (View 3D) and in AR.
00d. **Upstairs water: written 2026-10-22 (306 688).** Design: `docs/plumbing-workflow.md` "Upstairs water". Still
   to confirm with the owner: the outlet heights (WC 0.95, vanity 0.55, mixer 1.10), the tees' spacing, the crossing.
00c. **Column r263 turned east–west: written 2026-10-22 (300 745).** Design and numbers: `docs/plumbing-workflow.md`
   "Column turned east–west". Owner to see it in View 3D (💧 Pipes, ▱ Floors). Hypotheses still open:
   - the basement notch depth: the band's face is unmeasured;
   - the Alflex outside diameter;
   - View 3D colours the Ø80's 49° slab bend as a failed fitting, because the app models rigid PVC (expected).
00b. **Items 101–102, owner to verify and decide** (`docs/plumbing-workflow.md` "West manifold", "Re-measured"):
   - see in AR / View 3D (▤ Plan, 💧 Pipes, ▬ Beams): the bus, manifold, column bundle, water X, the joists;
   - clashes waiting on the owner: the upstairs WC drain p54/p64 through joist r267 (builder's call); the shower-room
     VMC p318/p319 lying along kitchen joist r273 (offered: move it into a bay, y −1.73 or −2.23, with its drop at
     x −0.08); the hot riser 8 mm into the basement VMC Ø100 (water row "south for now"); r224+r205 supply 1–7 mm
     from the waste; the bundle 7–10 cm west of the basement wall face (ground vs basement wall offset);
   - unknowns: X's hot source, where the other north-wall cold line goes, ~~the upstairs water routes~~ (drawn,
     item 00d), the r208/r207 tees' fittings (press or compression; offered: anchors on them), stray p262.
00a. **Item 98 is written** (286 266). The owner checked the r91 / r93 corner on a draft link and said "R91 is ok now".
   - Owner to verify in AR / View 3D: the four frames, r92 7 cm west (clear of m53 / m127), r93 on the Meli, the
     LINE handle (5 cm) with 🚪 Doors.
   - Still to measure: r120, r119, r226, r78 (r78 is a LINE door: 0.78 for a 73 leaf).
00. **Owner to verify in AR** (the 286 557 write): the two FLAVIO vanities (r130 Ground, r132 Upper) and their height
   (top 0.88, a Hypothesis), and the basement ARTENS tile. Connect with skill `quest-connect`. Before any route work:
   `house-query anchors` and `house-query beams` on a fresh read. The attic lintels at y −1.96 (open check below) are a
   natural first use of BEAM · FLOOR / CEILING, drawn by the owner.
0a. **Optional W (owner's go needed):** the Trez on r243 (item 92), the 2-leaf Trez on r242 resized to 2.76 m
   (item 93), and FENCE zones once the owner gives their lines (item 94). ~~The vanities (95) and the basement tile
   (91)~~: written 10-19.
0. **Item 86 after the 4i write:** ~~the owner's unit choice~~ decided 2026-10-18: the **Aldes Compact Premium MW** (not the HP+); kitchen Ø125 flexible or semi-rigid (docs/plumbing-workflow.md, after "4i with the kitchen and shower ducts in flexible"). Still open: the checks (wall top at slab height
   where the shower duct slants, attic lintels at y −1.96, the outlet terminal); on the headset, the laundry stub ends
   12.9 cm from unit B (inside airflow.js's 15 cm PORT_REACH: the app's air model ignores the laundry vent). ~~Finish item 86 on option 4d~~
   (done through 4e–4i; the vents' furniture, losses and share link are in 4i). Older wording kept for its steps: get the owner's choices (kitchen Ø125/Ø100, ground shower Ø80/Ø100, the bathroom vent model),
   redraft on 1e (`colStack5.mjs` + a sizing edit: pipe `diameter` and the reducers' nodes; the column/box follow the
   largest socket), check (`fitTest.mjs`, `solveChk.mjs`, `clashAbs.mjs`, `house-query diff`), drawing, then W
   (fresh read == 288 795). The BDH vent swap (`draft-bdh.json`) can go in the same write, after the push that
   deploys `vmc-vent-bdh` and `update-app`.
1. **A `hood` pipe service** (owner OK, 10-15): add it to `PIPE_SERVICES` (+ colour, i18n, AR cycle), keep it out of
   `airflow.js`, then draft the Ø150 from the hood's outlet through the south wall. The clear band behind the chimney
   is ≈ 1.85–2.39 m (conduits at 1.83 and 2.40). Owner: park the hood's datasheet check; write only after the app that
   knows `hood` is installed (an older app turns an unknown service into `cold`).
2. **The two spots the fittings still flag:** the WC stack foot in the basement (pn62 → pn63, 9.6 cm, too short)
   and pn81 (an 8.5° bend on the outside collector). Re-solve with real parts, ask, then W.
3. **Fittings in AR** (`mr.js` draws ribbons; reuse `derivePipeFittings`), only if the owner wants it.
4. **Redraw the heating so the ground shower room tees off the kitchen + r74 pair** (item 80). Remove its own pair,
   taking new ids before removing anything. Read-base-write on the owner's W (fresh read == 288 795).
5. **Device QA** (app `d3f566e`; relaunch it). The items are in `docs/ar-qa-checklist.md`:
   - (10-15) 💧 Pipes fittings in View 3D (Plan and Model), the flags' colours and legend;
   - the ducts (288 795): only the kitchen corner box (30 × 57.35 cm) under the ceiling, no bedroom box, the
     alcove one open 1.02 m bay, the corner column r261 (17.25 × 41.35) with both ducts inside it, the 45° slants
     through the slab and the parallel 45° turns in the laundry; the vents flush on the ceiling;
   - POV under passage r117: the ceiling closes; ◈ Model ▱ Floors see-through with 💧 Pipes;
   - the hood, the hob, the alcove floor; View 3D Plan/Model/ORBIT/POV; a PNG download; a link with pipes.
   - (10-16) the insulation jackets in ▤ Plan; the new View 3D controls (👁 Show menu,
     icons-only nav on a phone, the legend chip, the floor panel collapsed on a phone); ▭ Ceiling see-through in POV.
     Headless Chrome screenshots only (demo and a made-up test house), never the Quest browser.

   Then, in order: item 78 (veranda, r95 raised, basement floors, sloped stairs), item 76 (garden), item 75 (PIPE
   in ALL FLOORS frame rate, the phone link's orientation), item 69 (WC under the window), then items 73 and
   earlier.

**Waiting on the owner (no code):**
- **Item 80:**
  - the outside of the laundry's west wall at 1.95 m (B's OUT);
  - the slab holes beside the wall's bearing;
  - access hatches; the upper waste's exit to the collector;
  - the real hob model (a generic one is drawn);
  - the kitchen Ø125: a flexible end at unit B or rigid to the end (undecided; ≈ 2–2.5 Pa); the 13 × 12.5 cm channel
    in the bedroom wall top for the bath Ø100 (builder);
  - ~~the C21's push button out of reach on the ceiling~~: the kitchen vent is now a C51 to buy; the cord version
    11015167 (with Aldes' cord return 11015001 on a ceiling) or the push version on a wall button 11026011;
  - the attic: the roof underside along x 2.45 (≥ ≈ 3.10 m for full wool over the bath duct) and the joists'
    direction (Hypothesis inputs of the attic heights);
  - (done 2026-10-16) the bath duct's two flat 87°30′ are 45° pairs, written: `docs/plumbing-workflow.md` "The bath
    duct's two flat corners".
- **Item 79:**
  - the band's real height (drawn at 1.97 m);
  - ceiling boards over the band vs wrapping, and the fire covering;
  - the basement radiators: option A (none), B (sleeve + keep both) or C (bare runs in the laundry and r74).
  - Candidate board, Proven from the page 10-14: Recticel PU + alu 30 mm, R 1.35, ref 82034165, €16.90/m²; its fire
    class was not shown.
  - Then set Ground "Floor ins. R" (still 0.9).
- **Item 78:** r95's real raise (set FLOOR UP and r138's SILL); the Basement rooms' levels; whether m204/m216/m218
  move to the Garden (m204 would lose its switch link).
- **Item 76/77:** the garden stairs, the entrance PLATFORM and any FENCE; the gate products on r242/r243.
- **Item 74:** after QA of AIR INLET on the Quest, and on the owner's yes, write the five EHB² inlets (r80, r108,
  r109, r113, r115) and two sleepers each in r51, r85, r88.
  - The model gives ≈ 1 400–2 300 ppm CO₂ in the bedrooms whatever the tweak (Hypothesis inputs). A measured
    overnight CO₂ and a blower-door Q4 would decide it.
- **Item 68/70/71 drafts, not written:**
  - the stand-alone column (r210 shortened, r220 pinned; this also removes the ≈ 0.43 m² of tiles counted twice);
  - the Duofix product on frames r221/r222.
  - Both need re-drafting on the current base.
- **Item 69:** the basement's east wall under the ground window; a possible slab ring beam at the WC drop; the
  window handle's reach.
- **Item 65 / 81 (upper WC drain, layout S written 287 926; T1 is the fallback):** measure the screed, the slab depth in bay 1 and the lintels' depth;
  T1 needs bay 1 ≈ **20.5 cm** under the raw slab top with a 5 cm screed (re-run `tools/wc-drain-fit.mjs` with the
  figures). If bay 1 is shallower: Geberit's sideways offset bend (≈ 12 cm, frame unmoved; check the Ø90→Ø100
  transition length, its mounting depth vs the lower bar, which side is "left") or the frame 10.6 cm forward with the
  bend straight back (≈ 12 cm). Also: the upper shower's Ø40 route; the optional sink. **Measure the box face too**:
  Geberit allows 11.5–14.5 cm from the bend's leg (rear clip) to the finished wall face; the half wall drawn at
  y 0.28 gives 15.7 (Hypothesis until measured; `docs/plumbing-workflow.md` "To check for both layouts").
- **Item 15:** which French door has the Sw 0.51 glass (Hypothesis r111). **Item 27:** which value was wrong in
  the r59 → r60 conflict.

**Offered, not asked for** (do only on request):
- **Heat:** per-room indoor temperature; the split counted as a heater; € per year; a heat-recovery VMC what-if;
  the heat map on the AR 3D view's walls (agreed in item 25, not started).
- **AR:** WALL mode picking boxing faces (Hypothesis that it can't yet).
- **Materials and products:**
  - start corner / turn for wall faces; a desktop quantity table;
  - detail designs for terrazzo/mosaic/oak; more photo finishes;
  - the desktop furniture picker.
- **C:** conduit-drawing speed-ups (height snap, ceiling run, snap-to-wall + auto-pin); the owner sets the priority.
- **D′ / D:** the plan possibly drawn under the AR 3D view; the remaining per-object AR layers. Both are parked:
  the fps is accepted, so measure with PERF first.
- **Realistic:** path-traced render, PBR textures, bloom (`docs/realism.md`). **Quest-to-TV mirror:** parked
  (`docs/share-view.md`).

**Superseded or rejected (don't redo):**
- ~~Kitchen and bath ducts in kitchen ceiling boxes (1c, 1d, r252/r261/r262)~~: moved to the attic 10-15 (owner: ugly).
- ~~Three 45° at the alcove turn~~ (none fits, exhaustive search) / ~~fix B, two F/F~~ (cuts buried conduits) /
  ~~swapping the ducts in the alcove~~ (a laundry crossing at 1.77 m): fix A chosen 10-15.
- ~~Ø80 all the way for the ground bath duct~~: ≈ 30 Pa, the vent under 80 Pa at boost.
- ~~Option A's heights as written 10-09 (bay 1 ≈ 15 cm)~~: real fittings need ≈ 21 cm; T1 replaced it (10-15).
- ~~A tee at 20 cm with Geberit's bend pointing down~~ / ~~the bend straight back at the current frame depth~~ /
  ~~a 7.6 cm frame move~~: the WC branch is held at ≤ 2.3 cm; 10.1 cm into the north wall; the bend has no forward
  adjustment (all 10-15, `docs/plumbing-workflow.md`).
- ~~Unit A, the Agalina units, B on the laundry wall~~: replaced by item 80's one Aldes unit B, turned.
- ~~The roof vent~~: the owner chose the façade vent + valve.
- ~~The WC on the north wall (item 64)~~: replaced by item 69.
- ~~Colour conduit/heating layers on the PNG~~: the owner narrowed it to waste + VMC.
- ~~A veranda "Surroundings" level~~: the owner chose a room floor level on the Garden.
- ~~FURNISH~~: removed (overlaps MATERIAL · FURNITURE).
- ~~Copy a wall material to every wall~~: built, then removed at the owner's request.
- ~~Draw stacked markers apart~~: rejected, since every view uses the shared point.
- ~~Floor-fill overdraw as the AR GPU cost~~: refuted by PERF.
- ~~Ray-picking wires in 3D~~: the owner said floor-projection picking works.
- ~~Help box overflow~~: the owner said no need.

## Known open questions

- **Unseen on any device (Hypothesis until walked):** items 47–80, and most of sessions 30–38's QA items.
  `docs/ar-qa-checklist.md` is the list; much of it is stale since s16.
- **Product estimates** (photo-measured sizes, colours, joints, pack sizes, mount heights) are listed in each
  product's `// Sources:` block and its `docs/furniture.md` / `docs/materials.md` entry. Confirm them with a tape
  or the owner when they come up.
- **Heat-loss inputs** without an owner answer: defaults, degree-days, prices, ψ values, partition λ, the
  basement's loss coefficient. `docs/heat-loss.md` marks each one. A basement thermometer reading this winter would
  ground the bare-pipe figures.
- **VMC:**
  - the slab build-up over the ducts; fitting sizes; boost pressures (Hypothesis, Colebrook);
  - at boost (B's curve unpublished; ≥ 122 Pa assumed; read both vents at commissioning): the kitchen C21 ≈ 61–78 Pa
    against its 70 Pa floor; the bath vent ≈ 84–98 Pa against 80, less when both boost;
  - the EHB² humidity curve; wind;
  - the kitchen vent's real minimum flow.
- **Upper WC drain T1:** bay 1's real depth and the screed (decide whether T1 is buildable); the socket outer Ø
  (112 mm assumed); that Geberit's clip has only two positions; that 23 cm is the common drain height (not checked
  against EN or the V&B bowl's sheet).
- **Technical unknowns:**
  - why 168 per-marker canvases cost ~47 ms (batching fixed it);
  - the GPU-canvas glitch (the software path avoids it);
  - a WebGL context loss on the phone (freed textures would come back flat);
  - Realistic's frame rate on the Deck/iPhone;
  - why the AR URL copy once got `NotAllowedError`.
- **IKEA models on Pages/APK:** the proxy returns a valid GLB with CORS (Proven by curl). Nobody has seen a real
  model replace the placeholder box on the device (Hypothesis).
