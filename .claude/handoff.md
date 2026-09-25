# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc: live state only. Stable detail lives in the
repo docs (project knowledge is repo-only; rule in `CLAUDE.md`, "Where project knowledge lives"):

| Doc | What it holds |
|---|---|
| `CLAUDE.md` | Core architecture, desktop 3D viewer, sheets/DXF/change map, build, git + commit-body rules |
| `docs/product-intent.md` | **Why** the AR tool exists: tape-measure survey, drift/RECAL, multi-floor decisions, Guardian |
| `docs/ar-survey.md` | **How** the AR tool works: every mode, inputs, dimensioning, heights, durable traps |
| `docs/ar-qa-checklist.md` | What has actually been walked on the Quest (mostly stale — see Open questions) |
| `docs/electrical-workflow.md` | Conduit / wire / control-link lanes, derived circuits, owner decisions |
| `docs/plumbing-workflow.md` | The new pipe lane (first slice) and what's deferred |
| `docs/furniture.md` | IKEA GLB pipeline, CORS proxy, FURNISH |
| `docs/share-view.md` | View-only share links, `link`/`qr` export, read-only viewer |
| `docs/markers-plan.md` | Marker lane design + roadmap |
| `packaging/quest-apk.md` | Quest APK runbook (read before any packaging work) |

**Date:** 2026-09-25 (session 29 — a catch-up/documentation session)
**Status:** this session pushed two commits on top of `847b804`: a **3D-view wall/door fix** and the
**memory→docs migration + this handoff** (see Commits). Since the s28 handoff (`91aff00`), **58 commits** landed (Sep 20–25);
56 of them have subject-only messages, so they are summarized below from the code and the docs they
updated.

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
2. **Desktop/mobile 3D viewer (NEW since s28, `◈ View 3D`).** Not the old extruded block but an
   **architectural** reading of the plan (`src/core/architectural3d.js`): room floor slabs, an inferred
   outer wall shell, interior WALL zones, **doors and windows cut into walls from their sill/head**,
   procedural stairs, marker fixtures, IKEA furniture, procedural wood/plaster textures, and **light
   markers that light the room** (warm point lights, at most 2 shadow casters). One floor at a time.
   Two camera states only: top-down **overview** (drag pans) ↔ tap a room for a **1.65 m eye-level
   POV** (drag looks around, tap returns). A **☼ Basic lighting** toggle swaps lights/shadows for a
   cheap directional + crease-outline mode. **Mesh exports still use the legacy extrusion**; the
   architectural model is viewer-only until visually accepted.
3. **AR survey tool on the Quest** (`src/ui/mr.js`, the only authoring surface on the device).
   Register the house to a real corner, then author at 1:1 with a tape measure: rooms/walls/edges,
   dimensions via a 3D numpad, markers (outlets, switches, lights, breakers, network, TV antenna, and
   the new plumbing fixtures: radiator, boiler, sink, washing machine), heights, electrical conduit +
   wires (electrical or Ethernet), a **plumbing pipe network** (NEW), furniture, save/load in 6 slots,
   and export (sheets, DXF, JSON, view link, QR). The mode list is in `docs/ar-survey.md` ("Mode
   hierarchy").

**Sharing:** `🔗 Share view` (desktop) or the AR `link`/`qr` export puts a lossy, compressed snapshot
of the house in the URL `#fragment`. Opening it gives a **read-only** session (no editing controls,
autosave off) where a viewer can pan/zoom, open the 3D view, and add throwaway **measurement**
dimensions. Detail: `docs/share-view.md`.

**The goal (unchanged):** Phase 5 — an on-site MR survey tool, multi-storey, authored entirely in AR.
Read `docs/product-intent.md` before planning AR work.

## What changed since s28 + this session

> Next agent: when you add your own section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete this list.

1. **Desktop 3D viewer** (about 20 commits): as described above. It pauses rendering while hidden and
   defers its rebuild during a WebXR session (AR owns live rebuilding).
2. **Read-only share** (`eecaee1`, `153de53`, `1fe55fc`, `b0f9313`, `59c33bb`): view links open
   read-only with measurement-only dims (bypass the solver, never persisted); links got more compact;
   the AR export split into `link` (text) and `qr` (PNG); shared views open on a centered plan and
   carry furniture by default.
3. **AR electrical:** wires carry an authored **type** (`electrical` amber / `ethernet` cyan; purple is
   reserved for conduit; conduit nodes render white). Selection is explicit everywhere: **grip cycles
   overlapping candidates, trigger commits the yellow one**. Cross-floor conduit is edited from
   `LEVEL · ALL FLOORS`. Selecting a wire highlights its whole **circuit** (first real use of
   `deriveCircuits`).
4. **AR plumbing (NEW lane, `4f3cd9c`):** `MARKER · PIPE` — a whole-house pipe graph with four services
   (cold/hot/heating supply/heating return), fixture ports that follow their marker, and
   confirm-before-retype when joining unlike services. Serialized (`pipeNodes`/`pipes`); **no sheet or
   DXF output yet**.
5. **AR placement and navigation:** a provisional plan placement at startup (under the headset); the
   plan stays put when the Quest relocalizes after sleep (full anchor pose applied); left-stick rotate
   pivots on the viewer (fixed after teleport); RECAL supports composite corners and an explicit
   P1 far → P2 toward the corner → P3 direction.
6. **AR UI:** left-grip **hold-to-view** companion print sheet; menus and pointer render above world
   annotations; deliberate edge-selection cycling in PLAN EDGE; batch-download permission preflight;
   faster marker updates.
7. **Output and change map:** conduit/wire data is always excluded from **sheets** (DXF keeps the opt-in
   `wiring` layer); zone changes are excluded from change maps; markers recreated in place and
   informational dims no longer count as changes; narrow dims flip their arrows; new sectional
   **garage door** zone kind.
8. **Infra:** the saved-revision counter survives restarts; a `version.json` check shows when a newer
   Pages build is live (toolbar + AR HUD); the IKEA proxy is wired into the Pages build (real models
   ship).
9. **This session — 3D wall fix (`f457bd5`):** walls no longer cover doors/windows in the 3D view.
   Two causes: float-noise **zero-thickness wall sheets** on door faces (grid lines now snapped to
   1 µm), and a **skin** left when an aperture rect is thinner than its wall (openings now pierce the
   full wall thickness that spans their width, capped at 0.6 m). Node-verified on the owner's house;
   **not yet viewed in a browser**. A door rect drawn wider than the opening behind it still shows the
   crossing wall at its jamb — deliberate (Basement r77/r120).
10. **This session — docs:** migrated all Claude memory into repo docs and made that
   a rule (`CLAUDE.md`); new `docs/product-intent.md` and `docs/share-view.md`;
   `docs/furniture-handoff.md` → `docs/furniture.md` (rewritten); electrical owner decisions added;
   **`docs/ar-survey.md`'s height section corrected to floor-only** (it still documented the removed
   ceiling datum); aperture band-output wording corrected (bands now reach the desktop 3D viewer).

## Standing decisions (live constraints; the "why" is in the docs above)

- **Git:** commit + push directly on `main`, only when asked. **Every push publishes** (Pages
  auto-deploy). Non-trivial commits need a **descriptive body** (owner rule, `847b804`). Stage by
  explicit path, never `git add -A`.
- **Project knowledge is repo-only.** Design docs, decisions, and traps go in `docs/`; never
  agent-private memory. The old Claude memory notes were migrated and deleted this session.
- **Axis-aligned rectangles only** for Phase 5; `add` = room space, `subtract` = wall. Exact size comes
  only from dimension constraints (no size fields or labels). → `docs/product-intent.md`
- **Drift = RECAL + tape; no per-room anchors, no Quest room scan.** → `docs/product-intent.md`
- **Heights are floor-referenced only**; `zDatum` = free vs defined; a defined Z holds in a 3D grab; Z
  is not in the solver. → `docs/ar-survey.md` ("Vertical authoring")
- **Exports stay on the legacy extrusion** until the architectural 3D model is visually accepted;
  don't silently change STL/OBJ/GLB when editing the viewer. (`CLAUDE.md`)
- **Markers, conduit, wires, pipes, and furniture are parallel lanes**; they never enter the footprint/
  boolean/extrude/solver pipeline. Conduit, wires, and pipes are whole-house with floor-relative node
  z; markers and control links stay per-floor. → `docs/electrical-workflow.md`,
  `docs/plumbing-workflow.md`
- **Circuits are derived, never stored** (connected components per `breaker` marker). Used in AR wire
  inspection; **not in any output**.
- **Sheets are monochrome**; conduit, wires, and pipes never print on sheets; the DXF `wiring` layer is
  opt-in.
- **AR input model:** thumbstick-x = mode, thumbstick-y = cycle the current thing, A/X = flip (or
  rotate a selected aperture in PLAN EDIT), B/Y = delete, **grip = non-destructive** (cycle
  overlapping candidates, drag, cancel), trigger = commit. Controller roles are fixed: RIGHT edits;
  LEFT is a companion (sheet on grip, teleport reticle, plan rotate). → `docs/ar-survey.md` ("Inputs")
- **Shared views are read-only.** Measurement dims never reach the solver or storage; autosave is off.
- **This machine is a Steam Deck** (Node v20 via nvm). The fnm/PowerShell block in `CLAUDE.md` is
  Windows-only; ignore it here.

## Findings / traps worth knowing

- **`mr.js` does NOT subscribe to `project.onChange`.** Any model change in AR must call the right
  rebuild by hand (`buildPlan()`, `buildConduits()`, …). Z-dims refresh inside `buildMarkers` +
  `buildConduits`. Aperture glyphs live in `planGroup` and need `buildPlan()`.
- **The desktop `Sketch2D` stays live during AR.** Every `project.constraints` consumer must tolerate
  `{marker}`/`{node}` endpoints (no `.rect`) and the origin; a throw in any `onChange` listener aborts
  the AR caller mid-commit.
- **Any dim-label drag helper needs a branch per pin kind** (marker AND node), or the label freezes.
- **Numpad SWAP/DEL are context-overloaded** (FLIP / field-cycle / free↔floor; DEL clears the dim or
  deletes the item depending on the pad). Object delete is always B/Y.
- **Continuous AR drags must not run the full `_emit` cascade per frame** (`{emit:false}`, then one
  `touch()` on release).
- **`material.color.setHex()` needs a number**, not a CSS string (renders black otherwise).
- **`rlog` works only on the dev server** in the plain Quest Browser (`?ar=1`), not the TWA or Pages.
  `quest-debug.log` is gitignored; never stage it.
- **The self-signed HTTPS dev cert blocks Chrome automation**; use a plain-HTTP Vite config from the
  scratchpad for headless desktop checks.
- **Quest batch downloads** need a one-time permission granted from the normal 2D Quest Browser
  (`docs/ar-survey.md`, EXPORT); JavaScript can't grant it.
- **Web change = Pages deploy + relaunch the APK** (watch the version badge). Rebuild the APK only for
  `twa-manifest.json` changes. **Latent:** `~/house-cad-apk/app/src/main/res/values/strings.xml` still
  lacks `appName`/`launcherName` (verified this session); add them before the next `bubblewrap build`.

## Commits

All pushed: `origin/main` = `847b804`, deploy green. The recent commits have **subject-only
messages** (they predate the commit-body rule), so `git log` subjects are the index:
`51feb9f..cafa936` desktop 3D viewer, stairs, lighting · `153de53`/`1fe55fc`/`b0f9313`/`59c33bb` share
view · `f0cce95..0bbac5f` wire types, target cycling, cross-floor conduit · `f081139` circuit
inspection · `4f3cd9c` plumbing · `0079630`/`751f200`/`44ab1e2`/`ddb02e8`/`dca9b0e` AR placement and
RECAL · `847b804` commit-body rule. Earlier sessions: `git log`.

**This session:** `f457bd5` 3D-view wall/door fix · then one docs commit (memory→docs migration,
knowledge rule, `docs/furniture.md` rename, this handoff). Nothing of mine left uncommitted.
**Not mine, never stage:** `Document from Alexis He.json` (untracked) — it is the owner's real
3-storey house and a useful Node test fixture (read-only).

## Resuming from a clean checkout

```bash
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | tail -1)/bin:$PATH"
npm install                                       # once; node_modules is already present
npm run dev -- --host --port 5174 --strictPort    # https; usually already running on :5174
npm run build                                     # the only automated check; expect "✓ built in …"
```

LAN IP last seen `192.168.1.154` → desktop `https://192.168.1.154:5174/`, AR `…/?ar=1` (plain Quest
Browser for `rlog`). Report the Network URL, not just localhost. Deploy check:
`curl -s "https://api.github.com/repos/krosk/house-cad/actions/runs?per_page=1"`. The Quest APK project
(`~/house-cad-apk`), assetlinks repo (`~/krosk.github.io`), `~/.bw_pw`, and Bubblewrap's JDK/SDK
exist; see `packaging/quest-apk.md` and don't re-init.

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/ui/mr.js` | The whole AR session: modes, HUD, numpads, grip-drag, conduit/wire/pipe authoring, export |
| `src/ui/view3d.js` | Three.js renderer shared by AR and the desktop 3D viewer (camera states, lights, furniture) |
| `src/core/architectural3d.js` | Plan → slabs/walls/openings/stairs for the desktop 3D viewer (reusable for AR later) |
| `src/ui/sketch2d.js` | 2D plan editor (incl. read-only mode + measurements) |
| `src/main.js` | Desktop wiring: toolbar, panels, autosave, share/view mode, 3D toggle, version badge |
| `src/core/model.js` | `Floor` + `Project`; `_emit` solves then notifies; conduit/wire/pipe/furniture ops |
| `src/core/constraints.js` | 2× 1-D solver; one-way marker/node pins |
| `src/core/conduit.js` / `circuits.js` / `electrical.js` | Conduit graph + routing / derived circuits / control links + surface classifier |
| `src/io/serialize.js` | JSON v3 (all additions additive, incl. `pipeNodes`/`pipes`) |
| `src/io/shareView.js` / `qr.js` | View-only link payload / QR PNG |
| `src/io/planSheet.js` / `dxf.js` / `outputOptions.js` | Sheets / DXF / output layer toggles + formats |
| `src/core/versionCheck.js` | Newer-Pages-build detection via `version.json` |

## Next step

- **A — Walk the AR backlog on the Quest, then update `docs/ar-qa-checklist.md`.** Almost nothing after
  s16 is recorded as walked. Some fixes since s28 look like responses to device use, but that is a
  **hypothesis**: the checklist wasn't updated. Newest first: plumbing (`MARKER · PIPE`); wire types +
  circuit highlight; grip-cycle/trigger-commit selection in every mode; cross-floor conduit from ALL
  FLOORS; startup placement + relocalization; RECAL composite corners/direction; left-grip sheet;
  `link`/`qr` export (Web Share from immersive; scan → read-only 3D view); Z-dims (now drawn like X/Y dims); height pads
  (free↔floor, Z grab-lock); band pad; aperture rotate. Then older: the s23 input rework, conduit
  ribbons/dims, LEVEL, the MARKER lanes.
- **B — Plumbing follow-ups** (only on request; list in `docs/plumbing-workflow.md`): diameters,
  valves/manifolds, fixture validation, print/DXF layers, drainage.
- **C — Circuits in output** (only on request; `docs/electrical-workflow.md`): breaker glyph, circuit
  numbers + schedule on sheets, AR editing of breaker number/rating.
- **D — 3D viewer → exports / AR** (needs an owner decision): switch STL/OBJ/GLB to the architectural
  model once it's visually accepted; optionally an AR 3D layer reusing `architectural3d.js`.
- **E — Desktop follow-ups** (only if asked): desktop QR download (reuse `qr.js`); sill/head/foot/top
  annotations on sheets/DXF; env-map lighting for flat-looking furniture in AR.
- ~~Wire `VITE_IKEA_PROXY` into CI~~ — done (`6acd3c2`); Pages ships real models.
- ~~Height-aware extrude that carves `[sill,head]`~~ — superseded for viewing: the desktop 3D viewer
  now cuts openings (`architectural3d.js`). Only the **mesh export** still ignores bands (see D).

## Known open questions

- **On-device status is largely unknown.** `docs/ar-qa-checklist.md` hasn't been updated for most work
  since s16; treat every AR feature after s21 as unwalked until the owner confirms.
- **56 commits have subject-only messages**, so the intent behind some behaviors is recorded only in
  `CLAUDE.md`/`docs/ar-survey.md` (which those commits did update). Where the docs are silent, the
  code is the only source.
- **Shared-link decode on real phones** (needs `DecompressionStream`) and **Web Share of the QR from
  immersive** are unverified.
- **Guessed tunings, unwalked:** Z-dim crossed-strip look; conduit ribbon width and node discs;
  `WAYPOINT_GRAB_M` (0.14 m); left-stick 20° per flick; heater default band (`0`/`0.6`); furniture zone
  band (`0`/`0.9`); aperture glyph sizes; startup floor estimate (1.50 m below the camera).
- **The 3D wall fix (`f457bd5`) is Node-verified only** — confirm doors/windows from both faces in
  `◈ View 3D`.
- **Mobile 3D performance** with lights and shadows on real phones is untested, beyond the Basic
  lighting fallback existing.
