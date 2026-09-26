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
| `docs/furniture.md` | IKEA GLB pipeline, CORS proxy, FURNISH, procedural furniture (products with no IKEA model) |
| `docs/product-modelling.md` | How to model a product with no 3D model from specs/drawings/photos; run by the `/model-product` skill |
| `docs/share-view.md` | View-only share links, `link`/`qr` export, read-only viewer |
| `docs/markers-plan.md` | Marker lane design + roadmap |
| `docs/materials.md` | Surface finishes and door products: owner decisions, continuity rule, takeoff method + limits, phases |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-09-26 (session 30)
**Status:** Proven (git + live `version.json`): `origin/main` includes the flooring commit that
also carries this handoff (verify the tip with `git log -1 origin/main`). The tree is clean apart from the owner's untracked
`Document from Alexis He.json`. AR performance (session 29) is **owner-confirmed on the Quest**;
everything from session 30 is build/Node-verified only and **parked for the owner to walk** (Next step A).

## What the app is today (the gist, no code needed)

**One app, three surfaces**, all from the same static Vite build at
**https://krosk.github.io/house-cad/** (also a sideloaded Quest 3 APK, `com.krosk.housecad`, that
boots straight into passthrough AR):

1. **Desktop/mobile 2D plan editor.** Draw axis-aligned rectangles tagged **add** (room space) or
   **subtract** (wall, door, window, garage door, half wall, heater, sliding door, insulation,
   stairs up/down, cabinet, furniture placeholder). Exact sizes come only from **dimension
   constraints** (a 2× 1-D least-squares solver). Multi-storey: independent plans stacked on a shared
   origin. Outputs: to-scale print/SVG/PNG sheets per floor (monochrome, optional change-map revision
   clouds vs a saved slot), DXF + a simplified Coohom DXF, STL/OBJ/GLB mesh, JSON save.
2. **Desktop/mobile 3D viewer (`◈ View 3D`).** An **architectural** reading of the plan
   (`src/core/architectural3d.js`): room floor slabs, an inferred 12 cm outer wall shell, WALL and
   INSULATION zones as solids, doors and windows cut from their sill/head, procedural stairs, 8 cm
   marker faceplates, IKEA furniture, light markers that light the room, and **textured surface
   finishes**. One floor at a time; top-down overview ↔ tap a room for a 1.65 m POV. **Mesh exports
   still use the legacy extrusion.**
3. **AR survey tool on the Quest** (`src/ui/mr.js`, the only authoring surface on the device).
   Register the house to a real corner, then author at 1:1 with a tape measure: rooms/walls/edges,
   dimensions via a 3D numpad, markers, heights, electrical conduit + wires (electrical or Ethernet)
   with circuit diagnostics, a plumbing pipe network, furniture, **surface materials and door
   products**, save/load in 6
   slots, export (sheets, DXF, JSON, view link, QR), and an **AR 3D view on LEFT X**. Mode list:
   `docs/ar-survey.md`.

**Sharing:** `🔗 Share view` (desktop) or the AR `link`/`qr` export opens a **read-only** session.
Detail: `docs/share-view.md`.

**The goal (unchanged):** Phase 5 — an on-site MR survey tool, multi-storey, authored entirely in AR.
Read `docs/product-intent.md` before planning AR work.

## What changed in session 30

> Next agent: when you add your own section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete this list.

1. **Stairs rotate like doors** (`47c08de`): A/X in PLAN · EDIT / desktop ↻ Rotate turns the ascent 90°.
   Optional `climb` field = physical climb direction; sheet, DXF, a new AR floor glyph and View 3D
   treads read it. `docs/ar-survey.md` (A/X rotate).
2. **MARKER · CHECK** (`0ad552d`): read-only circuit diagnostics (red cross-tie, orange no breaker,
   white unwired outlet/switch/light; thumbstick-y filters). **Also fixed: Ethernet wires were power
   edges** (7 false "no breaker" circuits in the owner's house); circuits are per nature now.
   `docs/electrical-workflow.md`.
3. **Stacked-marker readout** (`9bce6e7`): a double switch stays two markers at one point (owner
   decision); hovering adds `<type> i/n → k× light`. `docs/ar-survey.md` "Stacked devices".
4. **Surface materials, phases 1–3** (`72ca05a`, `92975bf`, `f0f6bf1`), design and every owner decision in
   **`docs/materials.md`**:
   - AR MATERIAL · FLOOR / WALL, a catalog, and a whole-house takeoff (pieces, packs);
   - View 3D textures;
   - the AR 3D view on LEFT X.

   Phase 4 (the owner's own products entered in AR) is not started.
5. **Proven bug, fixed in `f0f6bf1`:** `clearPlanGeometry` detached four planGroup overlay groups on the
   first plan build, so **Z-dims, adjacent-floor target dots, CHECK rings and MATERIAL tints never
   rendered in AR** (picking still worked). All overlay groups are now in `PLAN_OVERLAY_GROUPS`.
6. **Furniture catalog:** IKEA STOCKHOLM 2025 TV bench (`40586508`, a real IKEA model, `63cfd17`), and
   **procedural furniture** (`4abecef`): a catalog entry with `procedural: <kind>` is built in code
   (`src/ui/proceduralFurniture.js`) instead of fetched. First one: the owner's discontinued STOCKHOLM
   bed (`stockholm-bed-160x200`; no IKEA model for any of the 10 articles tried). `docs/furniture.md`.
7. **Door products** (`cc55640`): the owner's Lapeyre Ange-Line entrance door as a material of a DOOR
   zone, AR **MATERIAL · DOOR**, drawn at the zone's size/hinge/swing in View 3D and the AR 3D view
   (`src/ui/doorProducts.js`). `docs/materials.md` "Doors".
8. **Workflow recorded** (`2972e7a`): `docs/product-modelling.md` + the `/model-product` skill, from
   how the bed and door were made.
9. **Flooring product** (the commit that carries this handoff): Beaulieu oak charme 118×16.4 (Leroy
   Merlin 92245930) as a floor material with a procedural `design: 'oak-rustic'` texture, tuned
   against the product's top-down gallery photo. `docs/materials.md` "Flooring products".

## Standing decisions (live constraints; the "why" is in the docs above)

- **Label every claim Proven or Hypothesis** (`CLAUDE.md` top rule), in reports, commit bodies, docs.
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
- **Every marker is an 8 cm × 8 cm fixture** (owner spec); 3D placement is presentation-only.
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
- **A double switch = two switch markers at one point**; never draw stacked markers apart in AR.
- **Materials** (`docs/materials.md`):
  - patterns are anchored at the plan origin (continuity over efficiency, owner-acknowledged);
  - same-material rooms joined by a doorway are one region; different materials meet mid-doorway;
  - packs are rounded once per product for the whole house;
  - wall faces are set one at a time: the owner removed a copy-to-every-wall action, so don't re-add it.
- **Products with no manufacturer model are code, never stored GLBs** (owner decision): a
  `procedural` furniture builder or a door `design`. A non-code model would go in
  `public/furniture/models/` (not built). Follow `docs/product-modelling.md` / `/model-product`.
- **A door product is a material of its DOOR zone** (owner decision), authored in MATERIAL · DOOR;
  made-to-measure products take the zone's size.
- **LEFT controller:** trigger = teleport, grip = hold-to-view sheet, stick-x = rotate plan, stick-y =
  storey teleport (ALL FLOORS), **X = AR 3D view**. Y and the stick click are free.

## Findings / traps worth knowing

- **`mr.js` does NOT subscribe to `project.onChange`.** AR model changes must call the rebuild by hand
  (`buildPlan()`, `buildConduits()`, `buildRoutedWires()`, …). Wire picking deliberately uses the legs
  cached by the last `buildRoutedWires` (it picks what is drawn).
- **Every planGroup overlay group must be in `PLAN_OVERLAY_GROUPS`** (`mr.js`), or the first
  `buildPlan` silently detaches it. That already hid four layers for several sessions.
- **Wall faces follow the finished surface, not the room rect edge** (`edgeFace` in `flooring.js`):
  - wall/insulation linings over the room edge inset the face (the owner's house has 18–21 cm linings);
  - edges onto stairwells are open;
  - half walls cut the face above their sill.
- **AR code runs only inside the XR closure.** Verify it in Node by slicing the verbatim functions out
  of `mr.js` into a harness with stubs (the scratchpad pattern used all session), or replaying model
  bookkeeping against `Project`. Say which you did.
- **The APK always opens `/house-cad/?ar=1`**, so URL switches (`?perf`, `#view=`) can't reach it.
  AR diagnostics need an in-menu toggle. It has no 2D view (exit = quit), but it shares
  `localStorage` with the Quest Browser, so the 2D page is the on-device import/export path.
- **Reading the headset's live state without touching it:** `adb forward tcp:9333
  localabstract:chrome_devtools_remote`, list pages at `http://127.0.0.1:9333/json/list`, then run a
  CDP `Runtime.evaluate` over the page's WebSocket (Node 20 needs `--experimental-websocket`). Use it
  **read-only** unless the owner explicitly asks for a write; their slots/autosave are the real survey.
- **Never run `adb shell pm clear com.krosk.housecad`** casually: it wipes the owner's autosave and
  save slots too. To pick up a new build, relaunch the APK and check the HUD `update:` line.
  adb is at `~/Android/Sdk/platform-tools/adb`; the headset has been connected over wireless adb.
- **Deploy check:** `curl -s https://krosk.github.io/house-cad/version.json` (the commit it serves).
  The unauthenticated Actions API rate-limits quickly, and there is no `gh` CLI here.
- **Solved coordinates carry float noise**; grids built from edges must snap (`snap()` in
  `architectural3d.js`).
- **`addConduitSegment` / `ensureConduitNodeAtMarker` return EXISTING items**; `addWire` returns
  `{ ok, wire }`; `wireSegmentPath` returns segment IDS (compare routes physically).
- **The owner's house file is a real wired network** (rev 9, 47 wires). It suits wire/length tests
  directly; a synthetic network is still handy to control an exact expectation.
- **Thick walls between rooms are hollow in 3D** (12 cm skin per room face; wider gaps leave a void).
- **The desktop `Sketch2D` stays live during AR**; a throw in any `onChange` listener aborts the AR caller.
- **`rlog` works only on the dev server**; never stage `quest-debug.log`.
- **Latent:** `~/house-cad-apk/app/src/main/res/values/strings.xml` lacks `appName`/`launcherName` —
  add them before the next `bubblewrap build`.

## Commits

All pushed (`origin/main` = `2972e7a` before the handoff commit), all with descriptive bodies.
Doc-only commits are omitted.
- **Session 30:**
  - `47c08de` stair `climb`;
  - `0ad552d` MARKER · CHECK + per-nature circuits;
  - `9bce6e7` stacked-marker readout;
  - materials: `72ca05a` catalog/takeoff/AR modes · `92975bf` View 3D textures + wall-face fixes ·
    `f0f6bf1` AR 3D view + the `PLAN_OVERLAY_GROUPS` fix;
  - products: `63cfd17` TV bench (+ previous handoff) · `4abecef` procedural furniture / STOCKHOLM bed ·
    `cc55640` door products / Ange-Line · `2972e7a` modelling workflow + skill ·
    the Beaulieu oak flooring commit (with this handoff).
- **Session 29:**
  - 3D walls/faceplates: `f457bd5`, `309d807`;
  - conduit pen undo/T `dce02f1`, Z-dims `fb56fbc`;
  - performance: batching `54d1b15` `4369ac2` `4af1d20` `4d3610b`, PERF sweep `36fa3d1`/`425c2e5`;
  - breaker glyph `dee978f`;
  - ALL FLOORS: `2f7d7df` `47c5b66` `245cb3f`;
  - WIRE: `5698fb7` `8603501`.

**Never stage** `Document from Alexis He.json` (untracked): it is the owner's real 3-storey house (rev 9,
47 wires) and the read-only Node fixture for almost every check.

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
| `src/ui/view3d.js` | Three.js renderer shared by AR and the desktop 3D viewer; `_animate` feeds the HUD's `time:` split |
| `src/core/architectural3d.js` | Plan → slabs/walls/openings/stairs + `wallMarkerPlacements()` (pure, Node-testable) |
| `src/io/planSheet.js` | Sheets (incl. the shared monochrome `drawMarkerGlyph`) |
| `src/core/model.js` / `constraints.js` / `conduit.js` | Model + `_emit`; the solver; conduit graph + routing |
| `src/core/i18n.js` | EN/FR/ZH strings: every new mode needs `mode.*` + `help.*` |
| `src/core/circuits.js` | Derived circuits (per wire nature) + `circuitDiagnostics` for MARKER · CHECK |
| `src/core/materials.js` / `src/core/flooring.js` | Finish catalog; takeoff, regions, wall faces (pure, Node-testable) |
| `src/ui/finishTextures.js` | Canvas pattern textures shared by View 3D and the AR 3D view |
| `src/ui/proceduralFurniture.js` | Code-built furniture (`procedural: <kind>` catalog entries); used by FURNISH and View 3D |
| `src/ui/doorProducts.js` | Door product builder (frame, leaf design, hardware) from `doorProductPlacements` |
| `public/furniture/index.json` | Furniture catalog: IKEA articles + procedural entries (`params` hold the tweakable dimensions) |
| `src/main.js` / `src/ui/sketch2d.js` | Desktop wiring / 2D editor (incl. read-only view mode) |

## Next step

- **A — Owner walks the parked work on the Quest**, then update `docs/ar-qa-checklist.md` (items exist
  for each). The owner said they would verify later. First, check that the four overlays that never
  rendered before `f0f6bf1` now show: Z-dims, adjacent-floor dots, CHECK rings, MATERIAL tints. Then:
  - MATERIAL · FLOOR/WALL/DOOR (set the Ange-Line on the real entrance door zone; Beaulieu oak on a
    room, watch PERF: its texture is 2048 px);
  - FURNISH: the STOCKHOLM bed and the TV bench (does a real IKEA model replace the box on the APK?);
  - the LEFT X AR 3D view, with **PROJECT · PERF** on;
  - View 3D textures (desktop);
  - MARKER · CHECK;
  - the stacked readout;
  - stair rotation;
  - then session 29's list: ALL FLOORS reticle/teleport, WIRE cycle + lengths, breaker glyph, pen undo/T.
- **B′ — More products** as the owner names them: run `/model-product <link>`; a real manufacturer
  model is always checked first.
- **B — Materials phase 4:** the owner's own products entered in AR (numpad: size, joint, pack) into
  `project.materials`. Possible improvements the owner has not asked for (see `docs/materials.md`):
  - per-region pattern offset to cut waste;
  - a plank texture drawn from the real cut plan;
  - the hidden face below a half wall that stands inside a room.
- **C — Conduit-drawing speed-ups:** height snap + "ceiling run" toggle, straight runs, one-press drop
  from a device, snap-to-wall + auto-pin. The owner decides priority.
- **D — Remaining AR per-object layers**, only if a mode drops frames (adjacent-floor spheres, pipes,
  furniture, control links). Measure with PERF first.
- ~~Draw stacked markers apart in AR~~ — rejected: the floor icon, pick, dims and sheet all use the
  shared point, so an offset would draw glyphs where the data isn't.
- ~~Copy a wall material to every wall of the room (A/X)~~ — built, then removed at the owner's request.
- ~~Floor-fill overdraw as the AR GPU cost~~ — refuted by PERF; the per-marker objects were the cost.
- ~~Ray-picking wires in 3D~~ — the owner said floor-projection picking works.

## Known open questions

- **Unwalked, Hypothesis only.** Session 30:
  - everything in Next step A;
  - frame cost of the AR 3D view (Lambert walls + textures; opaque walls may hide the real room);
  - whether MARKER · CHECK's 1-px pins read, and whether ~100 rings hold frame rate;
  - the readout pill, which grew to 4 lines and sits 1.25 cm higher in every mode;
  - how the textures look in a browser;
  - the bed and the door in AR (both rendered only in a desktop browser).

  Estimates to confirm with a tape measure or the owner: the bed's rail height, headboard lean and
  cushion size (from photos); the door colour (anthracite ~RAL 7016 guessed; Lapeyre colours are
  customisable) and which door zone in the owner's house is the entrance.

  Session 29: breaker glyph, conduit pen undo/T, Z-dim look, 3D-viewer fixes. The owner has used AR
  with markers, labels, conduits and wires since the batching, and reported them working.
- **Why 168 per-marker canvas textures cost ~47 ms** is unexplained. The batching fixed it; the
  mechanism is a Hypothesis (per-texture handling in the Quest browser).
- **`EXT_disjoint_timer_query_webgl2` on the Quest:** the owner's PERF line prefix (`gpu:` vs
  `frame:`) was not reported, so it is unknown whether the numbers were GPU time or frame intervals.
- `docs/ar-qa-checklist.md` is stale for most work since s16.
- **Data oddities in the owner's house:** cameras m174/m183 have `z = 0`; doors r77/r120 are drawn
  wider than their opening.
- **IKEA furniture on the published app:** the Pages build embeds the proxy and the Worker returns a
  valid GLB with CORS for `https://krosk.github.io` (Proven by curl). Nobody has yet seen a real model
  replace the placeholder box on Pages/APK (Hypothesis).
- **Unverified:** shared-link decode on real phones, Web Share of the QR from immersive mode, and
  mobile 3D performance with lights.
