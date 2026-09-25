# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc: live state only. Stable detail lives in the
repo docs (project knowledge is repo-only; rule in `CLAUDE.md`, "Where project knowledge lives"):

| Doc | What it holds |
|---|---|
| `CLAUDE.md` | **Top rule: label every claim Proven/Hypothesis.** Core architecture, desktop 3D viewer, sheets/DXF/change map, build, git + commit-body rules |
| `docs/product-intent.md` | **Why** the AR tool exists: tape-measure survey, drift/RECAL, multi-floor decisions, Guardian |
| `docs/ar-survey.md` | **How** the AR tool works: every mode, inputs, dimensioning, heights, durable traps |
| `docs/ar-qa-checklist.md` | What has actually been walked on the Quest (mostly stale — see Open questions) |
| `docs/electrical-workflow.md` | Conduit / wire / control-link lanes, derived circuits, owner decisions |
| `docs/plumbing-workflow.md` | The pipe lane (first slice) and what's deferred |
| `docs/furniture.md` | IKEA GLB pipeline, CORS proxy, FURNISH |
| `docs/share-view.md` | View-only share links, `link`/`qr` export, read-only viewer |
| `docs/markers-plan.md` | Marker lane design + roadmap |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-09-25 (session 29)
**Status:** Proven (git + Actions API): `main` = `origin/main` = `fb56fbc`, Pages deploy green, tree
clean apart from the owner's untracked `Document from Alexis He.json`. Everything from this session is
build- and Node-verified; **none of it has been viewed in a browser or walked on the Quest**.

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
   INSULATION zones as solids, **doors and windows cut through the full wall from their sill/head**,
   procedural stairs, **8 cm marker faceplates** mounted on the nearest wall surface, IKEA furniture,
   procedural wood/plaster textures, and **light markers that light the room** (at most 2 shadow
   casters). One floor at a time; two camera states: top-down **overview** ↔ tap a room for a
   **1.65 m POV**. A **☼ Basic lighting** toggle is the cheap fallback. **Mesh exports still use the
   legacy extrusion**; the architectural model is viewer-only until visually accepted.
3. **AR survey tool on the Quest** (`src/ui/mr.js`, the only authoring surface on the device).
   Register the house to a real corner, then author at 1:1 with a tape measure: rooms/walls/edges,
   dimensions via a 3D numpad, markers (electrical, network, TV antenna, plumbing fixtures), heights,
   electrical conduit + wires (electrical or Ethernet), a plumbing pipe network, furniture, save/load
   in 6 slots, and export (sheets, DXF, JSON, view link, QR). Mode list: `docs/ar-survey.md`.

**Sharing:** `🔗 Share view` (desktop) or the AR `link`/`qr` export puts a lossy, compressed snapshot
of the house in the URL `#fragment`. Opening it gives a **read-only** session (no editing controls,
autosave off) where a viewer can pan/zoom, open the 3D view, and add throwaway **measurement**
dimensions. Detail: `docs/share-view.md`.

**The goal (unchanged):** Phase 5 — an on-site MR survey tool, multi-storey, authored entirely in AR.
Read `docs/product-intent.md` before planning AR work.

## What changed in session 29

> Next agent: when you add your own section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete this list.

Before this session, 56 subject-only commits (Sep 20–25) added the 3D viewer, read-only share,
wire types + circuit highlight, the plumbing lane, AR placement/RECAL fixes, and output/change-map
tweaks — all summarized in "What the app is today" above. This session:

1. **Memory → docs** (`c391395`): all Claude memory migrated into `docs/` and deleted; `CLAUDE.md` now
   forbids agent-private memory. New `docs/product-intent.md`, `docs/share-view.md`,
   `docs/furniture.md` (was `furniture-handoff.md`). `docs/ar-survey.md` corrected to floor-only heights.
2. **Claim-labelling rule** (`7308e44`, top of `CLAUDE.md`): every claim is Proven (name the evidence)
   or Hypothesis (say what would prove it).
3. **3D walls over doors/windows** (`f457bd5`): Proven (Node, owner's house) — two causes fixed:
   float-noise **zero-thickness wall sheets** (grid snapped to 1 µm; 17 sheets → 0) and a **skin**
   where an aperture rect is thinner than its wall (openings now pierce every contiguous wall layer
   spanning their full width, ≤ 0.6 m; 13 blocked openings → 0 at centre line).
4. **3D markers** (`309d807`): every marker is an **8 × 8 cm faceplate** (`MARKER_FACE`; light puck 8 cm);
   `wallMarkerPlacements()` mounts each on the nearest exposed wall-box side facing open air;
   **INSULATION now renders as wall**. Proven (Node): 125/125 wall markers have open air in front,
   120 sit exactly at their authored point; 58 previously faced into the wall.
5. **Conduit pen** (`dce02f1`, `MARKER · CONDUIT`): **B/Y undoes the last pen step** (only what the
   step created; re-joins a split run); **triggering an existing run branches from it** (T-junction,
   height from the run). Proven (Node replay on a synthetic wired network): wire routes through the T;
   4 undos restore exact topology + route.
6. **AR Z-dims** (`fb56fbc`): height dims now use the X/Y drawing language (dashed strips, ticks,
   centred label, X/Y pin colours; nodes cyan instead of purple; apertures show floor→sill and
   floor→head side by side).

## Standing decisions (live constraints; the "why" is in the docs above)

- **Label every claim Proven or Hypothesis** (`CLAUDE.md` top rule), in reports, commit bodies, docs.
- **Git:** commit + push directly on `main`, only when asked. **Every push publishes** (Pages
  auto-deploy). Non-trivial commits need a **descriptive body** (`847b804`). Stage by explicit path,
  never `git add -A`.
- **Project knowledge is repo-only.** Design docs, decisions, and traps go in `docs/`; never
  agent-private memory.
- **Axis-aligned rectangles only** for Phase 5; `add` = room space, `subtract` = wall. Exact size comes
  only from dimension constraints. → `docs/product-intent.md`
- **Drift = RECAL + tape; no per-room anchors, no Quest room scan.** → `docs/product-intent.md`
- **Heights are floor-referenced only**; `zDatum` = free vs defined; a defined Z holds in a 3D grab; Z
  is not in the solver. → `docs/ar-survey.md` ("Vertical authoring")
- **Every marker is an 8 cm × 8 cm fixture** (owner spec) — 3D faceplate, and the sheet's stack
  tolerance already assumes it. 3D placement is presentation-only; marker data never changes.
- **Exports stay on the legacy extrusion** until the architectural 3D model is visually accepted.
- **Markers, conduit, wires, pipes, and furniture are parallel lanes**; never in the footprint/
  boolean/extrude/solver pipeline. Conduit, wires, pipes are whole-house with floor-relative node z;
  markers and control links stay per-floor. → `docs/electrical-workflow.md`, `docs/plumbing-workflow.md`
- **Circuits are derived, never stored**; used in AR wire inspection, **not in any output**.
- **Sheets are monochrome**; conduit, wires, pipes never print on sheets; DXF `wiring` layer is opt-in.
- **AR input model:** thumbstick-x = mode, thumbstick-y = cycle the current thing, A/X = flip (or
  rotate a selected aperture), B/Y = delete (**undo in `MARKER · CONDUIT`**), grip = non-destructive
  (cycle overlaps, drag, cancel), trigger = commit. RIGHT edits; LEFT is a companion.
- **Shared views are read-only.** Measurement dims never reach the solver or storage; autosave is off.
- **This machine is a Steam Deck** (Node v20 via nvm). The fnm/PowerShell block in `CLAUDE.md` is
  Windows-only; ignore it here.

## Findings / traps worth knowing

- **`mr.js` does NOT subscribe to `project.onChange`.** Any AR model change must call the right
  rebuild by hand (`buildPlan()`, `buildConduits()`, …). Z-dims refresh inside `buildMarkers` +
  `buildConduits`. Aperture glyphs live in `planGroup` and need `buildPlan()`.
- **The AR pen/edit code runs only inside the XR closure** — it can't be imported in Node. Verify its
  model effects by replaying the bookkeeping against `Project` in a scratch script (and say so).
- **Solved coordinates carry float noise** (`-1.88` vs `-1.8799999999999999`). Any grid/union built
  from edge coordinates must snap (see `snap()` in `architectural3d.js`) or it grows zero-thickness
  slivers.
- **`addConduitSegment` / `ensureConduitNodeAtMarker` return EXISTING items when present** — anything
  that undoes or deletes by "what was returned" must first check what it actually created.
- **`wireSegmentPath` returns segment IDS**; a merged/recreated run gets a new id, so compare wire
  routes physically (`wireRoutePoints`), not by ids.
- **The owner's house file has 0 wires** — a wire test on it is vacuous; build a synthetic network.
- **Thick walls between rooms are hollow in 3D**: inferred walls are 12 cm per room face, so a gap
  wider than 24 cm leaves a void (e.g. Basement door r73 reveal; switch m139 has no wall behind it).
- **The desktop `Sketch2D` stays live during AR.** Every `project.constraints` consumer must tolerate
  `{marker}`/`{node}` endpoints and the origin; a throw in any `onChange` listener aborts the AR caller.
- **Numpad SWAP/DEL are context-overloaded**; object delete is B/Y. Continuous AR drags must not run the
  full `_emit` per frame. `material.color.setHex()` needs a number.
- **`rlog` works only on the dev server** in the plain Quest Browser (`?ar=1`); never stage
  `quest-debug.log`. The self-signed dev cert blocks Chrome automation (use a plain-HTTP Vite config).
- **Web change = Pages deploy + relaunch the APK** (watch the version badge). **Latent:**
  `~/house-cad-apk/app/src/main/res/values/strings.xml` lacks `appName`/`launcherName` (Proven this
  session) — add them before the next `bubblewrap build`.

## Commits

All pushed; `origin/main` = `fb56fbc`. Session 29 (all with descriptive bodies): `f457bd5` 3D
wall/door fix · `c391395` memory→docs + handoff · `7308e44` claim-labelling rule · `309d807` 3D marker
faceplates + insulation walls · `dce02f1` conduit pen undo + T-junction · `fb56fbc` Z-dims like X/Y.
Earlier: `git log` (the Sep 20–25 commits are subject-only). **Never stage** `Document from Alexis
He.json` (untracked) — the owner's real 3-storey house; a useful read-only Node fixture.

## Resuming from a clean checkout

```bash
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | tail -1)/bin:$PATH"
npm install                                       # once; node_modules is already present
npm run dev -- --host --port 5174 --strictPort    # https; usually already running on :5174
npm run build                                     # the only automated check; expect "✓ built in …"
```

LAN IP last seen `192.168.1.154` → desktop `https://192.168.1.154:5174/`, AR `…/?ar=1`. Report the
Network URL, not just localhost. Deploy check:
`curl -s "https://api.github.com/repos/krosk/house-cad/actions/runs?per_page=1"`. The Quest APK project
(`~/house-cad-apk`), assetlinks repo (`~/krosk.github.io`), `~/.bw_pw`, and Bubblewrap's JDK/SDK
exist; see `packaging/quest-apk.md` and don't re-init.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/ui/mr.js` | The whole AR session: modes, HUD, numpads, grip-drag, conduit pen (+ undo/T), wire/pipe authoring, Z-dims, export |
| `src/core/architectural3d.js` | Plan → slabs/walls/openings/stairs + `wallMarkerPlacements()` for the 3D viewer (pure, Node-testable) |
| `src/ui/view3d.js` | Three.js renderer shared by AR and the desktop 3D viewer (camera states, lights, marker faceplates, furniture) |
| `src/ui/sketch2d.js` | 2D plan editor (incl. read-only mode + measurements) |
| `src/main.js` | Desktop wiring: toolbar, panels, autosave, share/view mode, 3D toggle, version badge |
| `src/core/model.js` | `Floor` + `Project`; `_emit` solves then notifies; conduit/wire/pipe/furniture ops |
| `src/core/constraints.js` | 2× 1-D solver; one-way marker/node pins |
| `src/core/conduit.js` / `circuits.js` / `electrical.js` | Conduit graph + routing / derived circuits / control links + surface classifier |
| `src/io/serialize.js` | JSON v3 (all additions additive) |
| `src/io/shareView.js` / `qr.js` | View-only link payload / QR PNG |
| `src/io/planSheet.js` / `dxf.js` / `outputOptions.js` | Sheets / DXF / output layer toggles + formats |

## Next step

- **A — Look at this session's work, then walk the AR backlog** and update `docs/ar-qa-checklist.md`.
  Desktop (browser): doors/windows from both faces, marker faceplates (size, facing, outdoor cameras),
  insulated walls. Quest: conduit pen undo + T-junction (pick priority near junctions, vertical-run
  splits), Z-dims (does the crossed-strip line read cleanly?). Then the older unwalked backlog: plumbing,
  wire types + circuit highlight, grip-cycle selection, cross-floor conduit, startup placement,
  RECAL, left-grip sheet, `link`/`qr` export, height pads, band pad, aperture rotate.
- **B — More conduit-drawing speed-ups** (owner asked for suggestions; 1 = T-junction and 2 = undo are
  done). Remaining, in the suggested order: **height snap + "ceiling run" toggle** (thumbstick-y is
  free in `MARKER · CONDUIT`) → **straight runs** (lock each segment to its dominant axis, optional
  auto-elbow) → **one-press vertical drop from a device** → **snap-to-wall + auto-pin** → desktop
  conduit authoring → suggested routing from the panel. Hypothesis: height snap + straight runs remove
  most precise hand positioning — the owner's on-device experience decides.
- **C — Solid thick walls in 3D** (only if asked): fill the void between two inferred 12 cm skins when
  rooms are separated by a wider gap.
- **D — Plumbing / circuits in output** (only on request; see the workflow docs).
- **E — 3D viewer → exports / AR** (needs an owner decision): architectural model for STL/OBJ/GLB; an
  optional AR 3D layer reusing `architectural3d.js`.
- ~~Wire `VITE_IKEA_PROXY` into CI~~ — done (`6acd3c2`).
- ~~Height-aware extrude that carves `[sill,head]`~~ — superseded for viewing: the 3D viewer cuts
  openings. Only the **mesh export** still ignores bands (see E).

## Known open questions

- **Everything from session 29 is unviewed.** Hypothesis: the 3D wall/marker fixes, the conduit pen
  changes, and the Z-dim restyle look/behave right; Proven only by build + Node checks.
- **On-device status is largely unknown**: `docs/ar-qa-checklist.md` hasn't been updated for most work
  since s16; treat every AR feature after s21 as unwalked until the owner confirms.
- **Data oddities in the owner's house**: cameras m174/m183 have `z = 0` (render at floor level;
  Hypothesis: height never set); doors r77/r120 are drawn wider than the opening behind them (a crossing
  wall shows at one jamb — faithful to the plan).
- **Shared-link decode on real phones** (`DecompressionStream`) and **Web Share of the QR from
  immersive** are unverified.
- **Guessed tunings, unwalked:** Z-dim crossed strips + 8 cm aperture spacing; conduit ribbon width and
  node discs; `WAYPOINT_GRAB_M` (0.14 m); `MARKER_SNAP` (0.3 m); left-stick 20°/flick; heater band
  (`0`/`0.6`); furniture zone band (`0`/`0.9`); startup floor estimate (1.50 m below the camera).
- **Mobile 3D performance** with lights and shadows on real phones is untested.
