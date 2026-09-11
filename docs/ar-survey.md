# AR survey reference (`src/ui/mr.js`)

Stable operational detail for the Quest MR survey surface. This is the settled "how the
AR tool is put together" reference; the live "where are we / what next" doc is
`.claude/handoff.md`. Deep rationale lives in Claude memory (`phase5-xr-intent`,
`multi-floor-design`, `ar-2d-parity`, `quest-guardian-limitation`). Packaging is
`packaging/quest-apk.md`. Core (non-AR) architecture is `CLAUDE.md`.

AR (`src/ui/mr.js`) is the **only** authoring surface on the Quest — the immersive APK exits
AR by quitting, there is no 2D editor on-device — so it must reach parity with the desktop 2D
editor (`ar-2d-parity` memory).

## Mode hierarchy (14 tools with stable `id`s)

```text
SETUP    · ORIGIN → FLOOR → RECAL → LEVEL
PLAN     · ROOM → WALL → EDGE → EDIT → DIMS
OUTLET   · EDIT → DIMS
PROJECT  · SAVE → LOAD → LANG
```

The headset label and help header show the localized `GROUP · TOOL` breadcrumb. Controller
navigation remains one fast linear cycle across the rows above (A/B or thumbstick-x); group
presentation adds hierarchy without remapping any contextual buttons or thumbstick-y actions.
Internal IDs in traversal order are `register`, `floor`, `recal`, `level`, `drop`, `wall`, `edge`,
`edit`, `plan_dims`, `marker`, `outlet_dims`, `save`, `load`, `lang`.

Modes are DATA in the `modes` array (each has `id`, `color`, `onTouch`; the label + help text
come from i18n keyed by `id` — `t('mode.'+id)` / `t('help.'+id)`, see Localization below).
Per-frame mode visuals/highlights are the big if/else chain keyed on `modeId` near the end of
the animation loop. `setMode` resets in-progress gestures and activates/deactivates the numpad
(both DIMS modes + LEVEL) or slot menu (SAVE/LOAD). No code hardcodes a mode *index* beyond `setMode(0)`
(= ORIGIN at session start); everything else is keyed by `id` or `currentMode ± 1`.

- **FLOOR** — calibrate the ground base level `floorY` by touching the real ground. Guarded to
  the ground floor (a touch on an upper floor would double-count against its elevation).
- **LEVEL** — per-storey height + floor switch (see Multi-floor below).
- **REGISTER** — 3-point derived origin corner. Touch P1,P2 along one wall (sets +X down it),
  then P3 on the perpendicular wall; origin = P3 projected onto the P1→P2 line, so the corner
  needn't be reachable. Tip steps WALL 1 → WALL 2 → PERP; grip undoes one point.
- **ROOM / WALL** — drop a starter rectangle at the standing position. ROOM = add (roomspace),
  WALL = subtract (solid wall). Edges get pushed to real walls in EDGE.
- **EDGE** — two presses per wall: 1st (aiming at an edge of ANY zone) LOCKS it; 2nd (tip on
  the real wall) snaps the locked edge to it. Once locked, the label/reticle turn yellow
  "SNAP TO WALL". Grip cancels a pending lock.
- **PLAN · EDIT** (`id: edit`) — the plan editing domain. Select a zone (trigger; press again cycles down
  through overlapping zones), grip deletes it, and B/Y swaps it room↔wall. Outlet glyphs are inert.
- **PLAN · DIMS** (`id: plan_dims`) — plan constraints only: edge↔edge sizes and edge↔origin
  position locks. Outlet floor icons and outlet pins are inert.
- **OUTLET · EDIT** (`id: marker`) — the outlet editing domain. Empty-space trigger places at the tip;
  pointing directly at an outlet and triggering opens its height pad; ENTER commits the height,
  closes the pad, and clears the selection. Grip-drag moves it in 3D; grip away deletes the selected
  outlet. Every outlet also has a flat projected floor icon showing its plan X/Y. Plan zones are inert.
- **OUTLET · DIMS** (`id: outlet_dims`) — outlet pins only. The first reference must be an outlet's
  projected floor icon; only then do plan edges become eligible for the second reference. Plan
  dimensions cannot be selected or changed.
- **RECAL** — re-zero against a known corner, REGISTER-style. First SELECT a corner with the
  pointer reticle (aim so it hugs the wall you want as "1"; nearer wall = 1 cyan, other = 2 purple;
  the active wall receives the standard edge highlight; trigger to lock)
  → P1,P2 along real wall 1 → P3 on real wall 2. Corrects both rotational + positional drift.
- **SAVE / LOAD** — ray-aimed 6-slot menu; the unit is the whole multi-floor project.
- **LANG** — UI language switch (see Localization). Thumbstick up/down moves through the list
  (FR/EN/ZH); trigger picks the ray-aimed row, or advances one if the ray is off the panel.

## Localization (`src/core/i18n.js`)

All user-facing AR text is localized (EN default, FR, ZH) — mode labels, per-mode help boxes,
transient labels (SNAP TO WALL, WALL 1/2, PERP…), numpad keys, DIMS titles + edge/origin ref
names, SAVE/LOAD slot menu, LEVEL pad title, LANG menu. HUD debug lines stay English (diagnostic).

- `i18n.js` mirrors `units.js`: a `current` language + an `onLangChange` bus, plus `t(key)`,
  `setLang`/`cycleLang`, and `getLang`/`langLabel`. The choice **persists** to localStorage
  (`house-cad:lang:v1`) so it survives an APK relaunch. Missing key/lang falls back to en → key.
- `mr.js` re-renders on `onLangChange`: current mode label/help + any open pad/menu. Canvas panels
  (numpad keys, slot cells, lang rows) resolve `t()` **at draw time**, so a redraw picks up the
  switch. Floor NAMES (Basement/Ground/Upper) are model data, deliberately NOT localized.
- **CJK wrapping**: the help-box `wrap()` is CJK-aware — Chinese has no inter-word spaces, so each
  CJK glyph is its own break token (Latin runs stay whole). Without this a ZH sentence overflows as
  one giant "word". Relies on the platform having a CJK font (Quest Chromium ships Noto CJK).

## Inputs

- **trigger** = mode action (place / pick / press a numpad or slot key).
- **grip** = context action. Deletes only within an editing domain (PLAN = selected zone;
  OUTLET = selected outlet); elsewhere it performs a non-destructive cancel/undo (either DIMS = undo a
  dim pick; EDGE = cancel a locked edge; REGISTER/RECAL = back out a point; SAVE/LOAD/LEVEL =
  nothing). UNLESS the
  reticle is over a drag target → **grip-drag** (either DIMS over its own dim panel = slide its offset; EDGE
  over an edge = move it; OUTLET aimed at a marker = move it in 3D at its initial pointer depth).
  Marker drag adjusts existing X/Y pin values so the marker does not snap back on release. Its
  per-frame `moveMarker(..., {emit:false})` updates are visual/model-local; grip release calls
  `project.touch()` once, avoiding a full solve/listener/autosave cascade every XR frame.
  `onReset` early-returns while `gripDrag` is set (`squeeze` fires before `squeezeend`).
- **thumbstick-x** = cycle mode; **thumbstick-y** = change floor only in LEVEL
  (up/down, no wrap), choose language only in LANG, and no-op elsewhere;
  **thumbstick-hold (~1.2 s)** = exit AR.
- **A/X** = prev mode. **B/Y** = next mode, EXCEPT: PLAN swaps the selected zone room↔wall;
  either DIMS mode (pair active) flips the dimension side (`flipConstraintSide`, NOT `swapConstraint`);
  **LEVEL cycles to the next floor** (`cycleFloor`, wraps).
- Only the last-active controller is read (`activeSource`/`pickSource`); the idle hand hides.

## Dimensioning (PLAN DIMS / OUTLET DIMS)

Exact size = dimension constraints only (core design rule; no on-canvas size editor). The two
dimension modes are hard-filtered domains, not one mixed picker. PLAN DIMS permits edge↔edge and
edge↔origin; OUTLET DIMS permits outlet↔edge only and requires the outlet first. Ref-pick is
reticle-gated (`edgeAtPoint` / origin near gizmo / `dimLabelAtPoint` to select a plan constraint).
Numpad row is **SWAP | DEL | ENTER**, shown only in the edit phase. Field prefills the current
value; **0 m is valid** (edge↔origin lock, adjacent edge↔edge); negatives rejected.

- Outlet X/Y pins are selected through the outlet's **projected floor icon**, never its wall-height
  glyph. In OUTLET DIMS, pick the floor icon first and a plan edge second. Before the icon is
  selected, edges are inert; after it is selected, other outlet icons and the origin are inert.
  Hovering or locking a projected icon adds a bold outline to it and its linked wall-height
  outlet without resizing either icon, disambiguating outlets that share X/Y at different heights. The
  resulting one-way constraint moves the outlet, not the wall.
- Every outlet pin renders an orange dashed floor dimension from the anchored wall edge to the
  outlet's projected coordinate, plus a value label. That label can be selected or grip-dragged
  only in OUTLET DIMS; PLAN DIMS ignores it.

- Distance = ordered + signed (`value = coord(b) − coord(a)`). **FLIP = `flipConstraintSide`**
  (negate value, keep order). `swapConstraint` is geometrically a NO-OP (swaps a,b AND negates;
  only the anchor changes) — do not "fix" the AR flip back to it.
- A conflicting size is refused: `commitEntry`/flip count solver conflicts before/after and roll
  back if the count rose; numpad shows `!CONFLICT`, pair stays.
- **DEL** removes the pair's constraint and closes the pad; for a NEW pair with no constraint
  yet, DEL cancels the in-progress definition and closes the pad (both resolve to "clear + back
  to ref-pick").
- `c.offset` = signed perpendicular line placement (serialized): origin and outlet dims store it
  absolute, edge↔edge relative to the outer edge; `setDimOffset` is the shared setter (grip-drag +
  default-on-create). A new dim's line defaults to the tip position when the pair completes.
- AR renders edge↔origin dimensions (the DESKTOP draws none for origin refs — that parity note
  is AR-only).

## Multi-floor (LEVEL)

Floors are independent plans sharing the same plan origin (0,0); elevation is DERIVED by
stacking per-floor heights (`Project._recomputeElevations`: ground = 0, up accumulates,
basement negative). See `multi-floor-design` memory for the settled design.

- Entering AR seeds **Basement · Ground · Upper** around Ground (`ensureFloors`; no-op if
  already multi-floor; default 2.8 m, persists via autosave).
- **LEVEL mode**: **B/Y cycles** the active floor (wrap); the DIMS numpad is reused to type a
  storey height, **ENTER** sets the active floor's height (`project.setHeight`) and re-stacks
  elevations. Heights are entered **by hand** — Quest can't measure the vertical offset. The
  pad's SWAP/DEL keys are inert here. Label reads `LEVEL · <FloorName>`; pad title shows the
  floor's base elevation.
- `afterFloorChange()` is shared by LEVEL's B/Y `cycleFloor` and vertical-thumbstick
  `switchFloor`: it rebuilds the
  overlay at the new elevation and re-shows the LEVEL pad (which `refreshFloorEditState`'s
  `resetDim` hides).
- **Stacking gotcha**: a storey's elevation is driven by the floor *below*. To lift the Upper
  overlay, edit the **Ground** height; to drop the Basement, edit the **Basement's** height.
  Editing the topmost floor's own height moves nothing.
- **Cross-floor size constraints are impossible by construction** — `edgeAtPoint` only scans the
  active floor's rectangles and constraints are stored per floor.

## Coordinate mapping

Plan `(x,y)` → planGroup-local `(x,0,−y)`; planGroup applies `planYaw` + `planPos`. Overlay lift
per floor is a pure Y translation (`overlayY() = planPos.y + activeElevation()`), so
`worldToPlan` (reads x/z only) stays correct on every storey. `worldToPlan`/`planToWorld` invert
through planGroup. HUD `ptr`/`ret` read in registered-origin (plan) coords.

## HUD (controller-mounted panels)

All controller UI uses `depthTest:false` + `renderOrder = HUD_ORDER (100)` so it paints over
world overlays. Per controller, stacked above the tip: mode **label**, hover **readout** pill
(dimension value on ray-hover), **debug** HUD, **help** box (per-mode `help` string, set in
`setMode`). The idle hand's whole controller is hidden.

- **Debug HUD** lines: `build:` stamp, `ptr:` (tip in plan coords + height above floor), `ret:`
  (reticle floor point), `edge:` (length of the highlighted edge, EDGE mode only), `batt:`
  (`navigator.getBattery()`, hidden if unsupported), plus a transient `EXIT:` hold bar. The HUD
  redraw is **throttled to ~2 Hz** (its canvases re-upload on redraw); the EXIT bar bypasses the
  throttle.

## Performance notes (per-frame cost)

- **Dim-label textures are cached** by text+color (`dimTexCache`, evicted in `buildDimensions`,
  bounded at 64). `buildPlan` no longer disposes the shared sprite `.map`. This makes the DIMS
  dim-offset grip-drag a per-frame cache hit.
- **EDGE grip-drag** calls `buildPlan(false)` (skips `buildDimensions`, the dominant cost); the
  full rebuild is restored on drag release (`onSqueezeEnd`).
- Dynamically-rewritten highlight meshes (`edgeHi`/`edgeHi2`/`rectHi`) set `frustumCulled=false`
  (their vertices are rewritten in world space each frame; an origin-centered bounding sphere
  would get them culled on head-turn).

## Durable traps

- **`View3D.setGeometry` rebuilds meshes every change** — MR uses `hideMesh` + `view.house` (the
  floor Group), not `view.mesh`. `mr.js` does NOT subscribe to `project.onChange`; it rebuilds
  overlays manually via `buildPlan()`/`applyPlanMatrix()`, so any model-changing action (incl.
  LOAD, height edits, floor switch) must call them itself.
- **The solver can produce negative w/h** unless normalized. `edgeCoord` reads raw x/w while
  every picker/highlight reads normalized min/max; the solver write-back normalizes
  (`src/core/constraints.js`). Don't reintroduce a raw negative-size path.
- **XR reference-space**: in `sessionstart` request `local-floor` AND
  `renderer.xr.setReferenceSpace(localSpace)` (the type setter alone did NOT take through
  ARButton). Read world cam pos from `matrixWorld.elements` ([12],[13],[14]);
  `getCamera().position` stays ~0.
- **Remote logging** (`rlog` → dev-only `POST /__log` → `quest-debug.log`, gitignored — never
  stage it) works only on the dev server, NOT on Pages/the APK. The release TWA has **no web
  console** — debug the `?ar=1` page in the plain Quest Browser or Oculus Remote Web Inspector.

## Key artifacts

| Path | Role |
|---|---|
| `src/ui/mr.js` | The whole MR session: modes, HUD, numpad, slot menu, grip-drag, multi-floor/LEVEL, RECAL, `?ar=1` auto-AR, thumbstick-hold exit |
| `src/core/model.js` | `Floor` + `Project` (floors[], active/ground); facade to active floor; `_emit` recomputes elevations + solves each floor; constraint ops |
| `src/core/constraints.js` | per-axis weighted least-squares `solve(floor)` (normalizes w/h in write-back); `makeDistance`/`makeOriginDistance`/`ORIGIN_ID`/`edgeCoord`; `c.conflict` |
| `src/io/serialize.js` | `serializeProject`/`deserializeInto` (rectangles + constraints incl. `offset` + height, multi-floor) — desktop JSON, localStorage autosave, AND the AR slots |
| `packaging/quest-apk.md` | reproduce-from-scratch Quest APK runbook |
