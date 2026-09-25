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
| `docs/furniture.md` | IKEA GLB pipeline, CORS proxy, FURNISH |
| `docs/share-view.md` | View-only share links, `link`/`qr` export, read-only viewer |
| `docs/markers-plan.md` | Marker lane design + roadmap |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-09-26 (session 29, continued)
**Status:** Proven (git): `main` was pushed with `2f7d7df` plus the commit that adds this handoff.
The tree is clean apart from the owner's untracked `Document from Alexis He.json`. Check the deploy with
`version.json` (see traps).
The AR performance work is **owner-confirmed on the Quest**; the rest of this session is build/Node-verified only.

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
   INSULATION zones as solids, doors and windows cut through the full wall from their sill/head,
   procedural stairs, **8 cm marker faceplates** mounted on the nearest wall surface, IKEA furniture,
   procedural textures, and light markers that light the room. One floor at a time; top-down
   **overview** ↔ tap a room for a **1.65 m POV**. **Mesh exports still use the legacy extrusion.**
3. **AR survey tool on the Quest** (`src/ui/mr.js`, the only authoring surface on the device).
   Register the house to a real corner, then author at 1:1 with a tape measure: rooms/walls/edges,
   dimensions via a 3D numpad, markers (electrical, network, TV antenna, plumbing fixtures), heights,
   electrical conduit + wires (electrical or Ethernet), a plumbing pipe network, furniture, save/load
   in 6 slots, and export (sheets, DXF, JSON, view link, QR). Mode list: `docs/ar-survey.md`.

**Sharing:** `🔗 Share view` (desktop) or the AR `link`/`qr` export opens a **read-only** session
(pan/zoom, 3D view, throwaway measurement dims, no autosave). Detail: `docs/share-view.md`.

**The goal (unchanged):** Phase 5 — an on-site MR survey tool, multi-storey, authored entirely in AR.
Read `docs/product-intent.md` before planning AR work.

## What changed in session 29

> Next agent: when you add your own section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete this list.

1. **Memory → docs** (`c391395`) and the **claim-labelling rule** (`7308e44`, top of `CLAUDE.md`).
2. **3D viewer:** walls no longer cover doors/windows (`f457bd5`); markers are 8 cm faceplates facing
   open air, insulation renders as wall (`309d807`). Proven by Node checks on the owner's house only.
3. **AR conduit pen** (`dce02f1`): B/Y undoes the last pen step; triggering an existing run makes a
   T-junction. Proven by a Node replay. **AR Z-dims** drawn like X/Y dims (`fb56fbc`).
4. **AR performance** (owner-reported: the ground floor ran at ~18 fps; below 30 with conduits). In order:
   - **Diagnostics:**
     - HUD `fps:`/`draw:`/`time:` lines (`7bca037`, `f4bca98`, `332b6dd`);
     - a GPU layer sweep, **PROJECT · PERF** (`36fa3d1`, `425c2e5`). A menu toggle is needed because
       the APK can't pass `?perf`.
   - **Fixes:**
     - conduit layer batched (`54d1b15`);
     - dim labels on an atlas (`4369ac2`);
     - controller label redraw guarded (`7f329c3`);
     - **markers batched on a glyph atlas** (`4af1d20`), the big one: PERF measured the markers at
       47.2 ms of GPU per frame, equal to the whole plan;
     - routed wires batched (`4d3610b`).
   - **Result, owner-confirmed on the Quest:** ~90 fps with the whole ground floor in view; >80 fps in
     `MARKER · WIRE` with under 130 draw calls. The rules that came out of this are in
     `docs/ar-survey.md` → "Performance notes".
5. **Breaker glyph** (`dee978f`): breakers drew as outlets in AR and on sheets; now a DIN-module-with-
   lever icon matching the 3D fixture. Proven by rendering both glyph functions to PNG; not yet seen
   on the Quest.
6. **ALL FLOORS reticle** (`2f7d7df`, owner-reported: "no floor reticle" in ALL FLOORS, so there was
   no way to pick conduits or wires). The reticle now lands on your storey's floor when you aim down,
   and on the floor of the storey above when you aim up. Picking is scoped to that storey. The rule
   is in `docs/ar-survey.md`. The same commit fixes a latent ReferenceError when the pen hovers a riser.
   Build-verified only.

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

## Findings / traps worth knowing

- **`mr.js` does NOT subscribe to `project.onChange`.** AR model changes must call the rebuild by hand
  (`buildPlan()`, `buildConduits()`, `buildRoutedWires()`, …). Wire picking deliberately uses the legs
  cached by the last `buildRoutedWires` (it picks what is drawn).
- **AR code runs only inside the XR closure.** Verify it in Node by slicing the verbatim functions out
  of `mr.js` into a harness with stubs (the scratchpad pattern used all session), or replaying model
  bookkeeping against `Project`. Say which you did.
- **The APK always opens `/house-cad/?ar=1`**, so URL switches (`?perf`, `#view=`) can't reach it.
  AR diagnostics need an in-menu toggle.
- **Never run `adb shell pm clear com.krosk.housecad`** casually: it wipes the owner's autosave and
  save slots too. To pick up a new build, relaunch the APK and check the HUD `update:` line.
  adb is at `~/Android/Sdk/platform-tools/adb`; the headset has been connected over wireless adb.
- **Deploy check:** `curl -s https://krosk.github.io/house-cad/version.json` (the commit it serves).
  The unauthenticated Actions API rate-limits quickly, and there is no `gh` CLI here.
- **Solved coordinates carry float noise**; grids built from edges must snap (`snap()` in
  `architectural3d.js`).
- **`addConduitSegment` / `ensureConduitNodeAtMarker` return EXISTING items**; `addWire` returns
  `{ ok, wire }`; `wireSegmentPath` returns segment IDS (compare routes physically).
- **The owner's house file has 0 wires**; build a synthetic network for wire tests.
- **Thick walls between rooms are hollow in 3D** (12 cm skin per room face; wider gaps leave a void).
- **The desktop `Sketch2D` stays live during AR**; a throw in any `onChange` listener aborts the AR caller.
- **`rlog` works only on the dev server**; never stage `quest-debug.log`.
- **Latent:** `~/house-cad-apk/app/src/main/res/values/strings.xml` lacks `appName`/`launcherName` —
  add them before the next `bubblewrap build`.

## Commits

All pushed; `origin/main` = `dee978f`. Session 29, all with descriptive bodies:
- **3D / docs:** `f457bd5` 3D walls/doors · `c391395` memory→docs · `7308e44` claim rule ·
  `309d807` 3D faceplates.
- **Conduit pen and Z-dims:** `dce02f1` pen undo + T · `fb56fbc` Z-dims.
- **Performance:** `7bca037`/`f4bca98`/`332b6dd` HUD perf lines · `54d1b15` conduit batch ·
  `4369ac2` label atlas · `7f329c3` label redraw guard · `36fa3d1`/`425c2e5` PERF sweep ·
  `4af1d20` marker atlas · `4d3610b` wire batch.
- **Glyph:** `dee978f` breaker glyph.

Doc-only commits are omitted. **Never stage** `Document from Alexis He.json` (untracked): it is the
owner's real 3-storey house and a useful read-only Node fixture.

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
| `src/main.js` / `src/ui/sketch2d.js` | Desktop wiring / 2D editor (incl. read-only view mode) |

## Next step

- **A — Owner walks the unconfirmed work**, then update `docs/ar-qa-checklist.md`:
  - breaker glyph;
  - ALL FLOORS reticle + per-storey picking (up/down);
  - conduit pen undo + T-junction;
  - Z-dim look;
  - 3D-viewer wall/door and faceplate fixes (desktop);
  - then the older backlog (plumbing, cross-floor conduit, RECAL, left-grip sheet, `link`/`qr`).
- **B — More conduit-drawing speed-ups** (T-junction + undo done). Suggested order:
  1. height snap + "ceiling run" toggle (thumbstick-y is free in `MARKER · CONDUIT`);
  2. straight runs;
  3. one-press drop from a device;
  4. snap-to-wall + auto-pin;
  5. desktop conduit authoring;
  6. suggested routing.

  The owner decides priority.
- **C — Remaining AR per-object layers**, only if a mode drops frames: adjacent-floor target spheres,
  pipes, furniture, control links. Measure with PERF first.
- **D — Solid thick walls in 3D / plumbing + circuits in output / 3D model → exports or AR** — each
  only on request (E needs an owner decision).
- ~~Floor-fill overdraw as the AR GPU cost~~ — refuted by PERF: all floor layers together were < 10 ms;
  the per-marker objects were the cost.
- ~~Ray-picking wires in 3D~~ — offered; the owner said floor-projection picking works, so it isn't needed.
- ~~Height-aware extrude that carves `[sill,head]`~~ — superseded for viewing by the 3D viewer; only
  mesh export still ignores bands (see D).

## Known open questions

- **Unwalked, Hypothesis only:**
  - the breaker glyph on the Quest;
  - the conduit pen undo/T;
  - whether the Z-dim restyle reads well;
  - the 3D viewer fixes (never viewed in a browser).

  The owner has used AR with markers, labels, conduits and wires since the batching, and reported
  them working.
- **Why 168 per-marker canvas textures cost ~47 ms** is unexplained. The batching fixed it; the
  mechanism is a Hypothesis (per-texture handling in the Quest browser).
- **`EXT_disjoint_timer_query_webgl2` on the Quest:** the owner's PERF line prefix (`gpu:` vs
  `frame:`) was not reported, so it is unknown whether the numbers were GPU time or frame intervals.
- `docs/ar-qa-checklist.md` is stale for most work since s16.
- **Data oddities in the owner's house:** cameras m174/m183 have `z = 0`; doors r77/r120 are drawn
  wider than their opening.
- **Unverified:** shared-link decode on real phones, Web Share of the QR from immersive mode, and
  mobile 3D performance with lights.
