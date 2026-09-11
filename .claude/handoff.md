# House CAD — session handoff

**Read this first, then `CLAUDE.md`.** This is the "how do I resume" doc. Deep Phase-5 rationale
and every XR gotcha live in Claude memory (`phase5-xr-intent.md`, `multi-floor-design.md`,
`ar-2d-parity.md`, `quest-guardian-limitation.md`), which auto-load each session — don't duplicate
them here.

**Date:** 2026-09-11 (session 9)
**Status:** Quest APK path WORKING (installs, verifies origin, launches into AR — proven on device).
Session 9 did a big pass on **in-AR dimensioning/authoring** (3-point origin, flip, white locked
edges, conflict refusal, constraint select/edit/delete/drag on the numpad, dashed dims). Session 8
had already built subtract zones + zone edit. **All of it is build-verified; only a few pieces were
eyeballed on device** (see below). Everything committed and pushed (`main` = `origin/main`, tree clean).

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent.md` before planning), multi-storey. **The immersive
APK exits AR by quitting — there is no 2D editor on-device**, so `src/ui/mr.js` is the *only*
authoring surface a Quest user has and must reach parity with the desktop 2D editor
(`ar-2d-parity.md`). **Proven:** the APK installs/verifies/enters AR; the PWA serves; multi-floor +
all AR features build clean and deploy. **NOT proven:** most of the session-8/9 survey/edit/dimension
workflow has not been functionally QA'd on the Quest — the on-device signals so far are a couple of
bug reports (zebra render order, reticle disappearing) that were fixed, not a full walkthrough.

## What changed in session 9
> Next agent: when you add your section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete the rest.

All in `src/ui/mr.js` unless noted. Driven by live on-device QA feedback from the owner.

1. **REGISTER is now a 3-point derived corner** (`cb8fe1f`). Touch P1,P2 along one wall (sets +X
   down it) then P3 on the perpendicular wall; the origin = P3 projected onto the P1→P2 line, so the
   real corner never has to be reachable. Tip steps WALL 1 → WALL 2 → PERP; grip undoes one point.
   Replaced the old touch-origin-then-touch-direction two-step.
2. **In-headset dimension FLIP** (`b83dd1e`, `dc0e349`). New `Project.flipConstraintSide` negates the
   signed value KEEPING order (moves the edge to the other side) — unlike `swapConstraint` which
   swaps+negates and is geometrically identical. Bound to **B/Y in SIZE** and to a **⇄ FLIP key** on
   the numpad; works for edge↔edge AND edge↔origin; a flip that would over-constrain is refused.
3. **White locked edges** (`cb8fe1f`). An edge renders white once its axis is *fully pinned* — both
   edges on that axis connect to the plan origin through the constraint graph (union-find in
   `lockedEdges()`). Unlocked edges keep their op color.
4. **Conflicting sizes refused** (`cb8fe1f`). `commitEntry`/flip count solver conflicts before/after
   and roll back if the count rose; numpad shows `!CONFLICT` (cleared on next key), pair stays.
5. **Edge↔origin dimensions are now DRAWN in AR** (`b83dd1e`). Previously skipped "for desktop
   parity"; the survey needs them visible (also shows why an axis went white).
6. **Select/edit a constraint by its value panel** (`dc0e349`). Dim sprites carry `cId` + both refs;
   reticle-over-panel (`dimLabelAtPoint`) highlights its edges (cyan) and the trigger loads it into
   the numpad prefilled (`loadConstraint`) — no re-picking edges.
7. **Numpad DEL key** (`4653f2b`). Bottom row is **SWAP | DEL | ENTER**; `deleteDim` removes the
   current pair's constraint.
8. **Numpad shows only while editing** (`4653f2b`). Hidden during ref-pick; appears when a pair is
   completed or a constraint is loaded; hidden again on ENTER/DEL so the reticle returns.
9. **Grip-drag** (`4653f2b`). Grip-hold over a target drags it (grip elsewhere still undoes): SIZE
   over a dim panel slides its perpendicular `c.offset` (akin to the desktop dim drag); EDGE over an
   edge moves it to the reticle. `buildDimensions` now honors `c.offset`; it's serialized, so it
   persists.
12. **Grip deletes only in EDIT.** Removed grip's rect-removal in ROOM/WALL/EDGE and the un-place
    fallback, so grip can no longer wipe a room/registration by accident; other modes only do
    non-destructive cancels. Rooms are removed only via EDIT (select + grip); re-register via REGISTER.
10. **Numpad SIZE polish** (`9d0963c`, `cb8fe1f`): prefill the current measured span; 0 m allowed
    (edge↔origin lock, and edge↔edge for adjacent zones); SIZE ref-pick uses the reticle rule
    (`edgeAtPoint`) like EDGE.
11. **Zebra + dims cosmetics** (`9d0963c`, `e16d247`): controller HUD `renderOrder` 100 so the zebra
    no longer covers the controller panel; zebra tinted per op (blue add / red wall), fainter; dim
    lines dashed and 0.5 cm thin so they don't cover room edges.

## Standing decisions

- **This machine is a Steam Deck (SteamOS), Node v20 via nvm.** No system `java`/`adb` — Bubblewrap
  brought its own under `~/.bubblewrap/` (adb: `~/.bubblewrap/android_sdk/platform-tools/adb`,
  keytool: `~/.bubblewrap/jdk/jdk-17.0.11+9/bin/keytool`, aapt2:
  `~/.bubblewrap/android_sdk/build-tools/34.0.0/aapt2`). The fnm/Node-22 block in `CLAUDE.md` is
  Windows-only (a prior machine); ignore.
- **Git: commit and push directly on `main`, no feature branches.** `main` auto-deploys to Pages on
  push, so **every push publishes** — only push when asked. (`packaging/` docs aren't in the built
  site, so doc pushes don't change the live app.)
- **`npm run build` is the only automated check** — no tests/linter/types. Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs. **Session-8/9 AR work is build-verified.**
- **AR is the only Quest authoring surface** (`ar-2d-parity.md`). The immersive APK has no 2D editor
  and exiting AR quits, so any desktop capability must be replicated in `mr.js`. Session 9 closed
  several parity gaps: **flip direction, delete a specific dimension, edit a dimension by selecting
  it, drag a dimension's placement.** Still open: unit switch, save/load JSON in AR, in-AR floor
  creation + per-floor height.
- **Quest distribution = SIDELOAD APK, immersive mode.** Runbook: **`packaging/quest-apk.md`** (read
  before touching packaging). Invariants: package `com.krosk.housecad`, immersive `horizonOSAppMode`,
  start URL `/house-cad/?ar=1`, same signing key forever. Signing passwords in `~/.bw_pw` (chmod 600):
  `set -a; . ~/.bw_pw; set +a; bubblewrap build`.
- **The APK is a thin shell loading the LIVE site.** A web change = Pages deploy +
  `adb shell pm clear com.krosk.housecad` (or relaunch — SW usually swaps it; watch the build stamp).
  Rebuild the APK only for `twa-manifest.json` changes.
- **Guardian must be disabled on-device to walk a whole house** (`quest-guardian-limitation.md`).
  OS-level; `local-floor` is correct. Owner disabled it via Quest Developer settings (persistent).
- **Multi-floor (session 6):** floors are **independent plans** (not copy-from-below); per-floor
  height; all share the **same plan origin corner** (differ only in elevation). MR = register once on
  the ground; each floor carries its own elevation. `Project.floors[]` + `activeFloorId`/
  `groundFloorId`; a facade makes `project.rectangles/constraints/height` point at the active floor.
- **Survey modes (8, stable `id`s):** FLOOR → REGISTER → ROOM(id `drop`) → WALL → EDGE → EDIT →
  RECAL → SIZE. Modes are DATA in `modes`.
- **Inputs (session-9 current):**
  - **trigger** = mode action (place/pick/press a numpad key).
  - **grip** = context action. It **deletes geometry ONLY in EDIT** (the selected zone); every other
    mode does a non-destructive cancel of an in-progress gesture or nothing (SIZE = undo the last dim
    pick; EDGE = cancel a locked edge; REGISTER/RECAL = back out the pending point/dir). There is NO
    destructive fallback — rooms are removed only via EDIT; re-register via REGISTER. UNLESS the
    reticle is over a drag target → **grip-drag** (SIZE ref-pick over a dim panel = slide its offset;
    EDGE over an edge = move the edge). See `onSqueezeStart`/`onSqueezeEnd`; `onReset` early-returns
    while `gripDrag` is set.
  - **thumbstick-x** = cycle mode; **thumbstick-y** = change floor; **thumbstick-hold (~1.2 s)** =
    exit AR.
  - **A/X** = prev mode. **B/Y** = next mode, EXCEPT: in **EDIT** it swaps the selected zone
    room↔wall, and in **SIZE** (with a pair active) it flips the dimension's side.
  - Only the last-active controller is read (`activeSource`/`pickSource`); the idle hand hides.
- **SIZE / dimensioning (session-9 current):** exact size = dimension constraints only. Numpad row is
  **SWAP | DEL | ENTER**. It appears only in the **edit phase** (a pair chosen / a constraint loaded);
  during ref-pick the reticle is shown and the pad is hidden. Ref-pick is reticle-gated: aim the ring
  at an edge (`edgeAtPoint`), the origin (near the gizmo), or a dim value panel (`dimLabelAtPoint`) to
  select that constraint. Field prefills the current value; **0 m is valid** (edge↔origin lock, and
  edge↔edge for adjacent zones); negatives rejected. Distance constraints are ordered+signed
  (`value = coord(b)−coord(a)`); **FLIP = `flipConstraintSide` (negate value, keep order)**, NOT
  `swapConstraint`.
- **Geometry in meters**; `units.js` converts only display/input.
- **Coordinate mapping:** plan `(x,y)` → planGroup-local `(x,0,−y)`; planGroup applies `planYaw` +
  `planPos`. Overlay lift per floor is a pure Y translation (`overlayY()`), so plan coords stay
  correct on every storey. `worldToPlan`/`planToWorld` invert through planGroup.

## Findings / traps worth knowing

- **`swapConstraint` is geometrically a NO-OP** (swaps a,b AND negates value → identical solve; only
  the anchor changes). The desktop `⇄` button uses it, so it also doesn't visibly move anything. To
  actually move an edge to the other side you must negate the value while KEEPING order —
  `flipConstraintSide` (added session 9). This bit the owner ("swap does nothing"); don't "fix" the
  AR flip back to `swapConstraint`.
- **Grip is overloaded (session 9).** It starts a drag when the reticle is over a dim panel (SIZE
  ref-pick) or an edge (EDGE); otherwise it's undo/delete. `onReset` must early-return when `gripDrag`
  is set (the `squeeze` event fires before `squeezeend`), or a drag would also undo.
- **AR NOW renders edge↔origin dimensions** (session 9) — previously skipped for desktop parity. The
  DESKTOP still draws no line for origin refs; that parity note is stale for AR only.
- **Dim value panels are reticle-gated for selection/drag** (`dimLabelAtPoint`, within
  `RETICLE_OUTER`). The big value echo on the controller (`pickDimLabel`) is still an ANGULAR pick
  (read-anywhere) — deliberately different; don't unify them.
- **`c.offset` is a signed perpendicular placement** (serialized). AR grip-drag sets it like the
  desktop dim drag; `buildDimensions` uses it (pinned) instead of auto-tiering. Origin dims store it
  as the absolute perpendicular coordinate.
- **"App name unavailable" in the Meta menu is NOT a bug** — standard fallback for sideloaded
  immersive apps; the signed APK's `application-label` is correctly `House CAD`. Cosmetic.
- **LATENT: `~/house-cad-apk/app/src/main/res/values/strings.xml` is missing `appName`/`launcherName`**
  — a future `bubblewrap build` could regress the label to empty. Add the two strings before the next
  APK rebuild. Not in this repo (under `~/house-cad-apk`).
- **The facade is why multi-floor was cheap.** `project.rectangles/constraints/height` are getters
  onto the active floor — don't reintroduce raw fields. Solver runs per floor in `_emit()`.
- **Quest APK, hard-won (all in `packaging/quest-apk.md`):** no in-browser PWA install on Quest;
  2D-mode APK can't enter `immersive-ar`; gating auto-AR on `isSessionSupported` hangs it;
  `assetlinks.json` must be origin-root + `.nojekyll`; fingerprint from the SIGNED APK; release TWA
  has NO web console (debug the `?ar=1` page in the plain Quest Browser or Oculus Remote Web
  Inspector); SW can serve a stale build → `pm clear` / build stamp; one headset can show multiple
  adb transports → `adb -s <serial>`.
- **XR reference-space mismatch (cost hours).** In `sessionstart`: request `local-floor` AND
  `renderer.xr.setReferenceSpace(localSpace)`; `setReferenceSpaceType()` alone did NOT take. Read
  world cam pos from `matrixWorld.elements` ([12],[13],[14]); `getCamera().position` stays ~0.
- **`View3D.setGeometry` rebuilds meshes every change** — MR uses `hideMesh` and references
  `view.house` (the floor Group), not `view.mesh`. `LineBasicMaterial` is always 1px → edges/dims are
  flat floor-strip quads (thickness via `stripCorners`).
- **Edge-pick is floor-plane based:** `edgeAtPoint`/EDIT/`dimLabelAtPoint` use where the ray meets
  the overlay plane (the reticle), not true 3D ray-vs-geometry — aim the reticle at the wall base.
- **Remote logging (`rlog` → dev-only `POST /__log` → `quest-debug.log`, gitignored — never stage
  it)** only works on the dev server, NOT on Pages/the APK. On the APK `console.*` isn't visible.

## Commits

Substantive only (doc-only omitted; `git log` has all). `main` = `origin/main` — **everything pushed.**

Session 9:
- `4653f2b` grip-drag dim panels & edges; numpad DEL; numpad only while editing.
- `e16d247` reticle-gated dim panel hover; reticle stays visible; dashed 0.5 cm dims.
- `dc0e349` on-pad ⇄ FLIP; select/edit a constraint by its value panel.
- `b83dd1e` flip-side (`flipConstraintSide`) for edge & origin; render edge↔origin dims.
- `cb8fe1f` 3-point derived-corner REGISTER; in-headset swap; white locked edges; conflict refusal.
- `9d0963c` on-device QA polish: HUD render order, zebra tint/discretion, reticle-gated edge pick,
  SIZE current-value prefill.

Session 8 (still relevant): `5831e13` EDIT mode; `adb29e0` reticle edge picking; `1ea4eef` HUD build
stamp; `518e24e` WALL (subtract) mode. Earlier: `a38f31a` multi-floor; `fc11499` single controller +
in-world exit; `ec8d5cf`/`b656ee8` auto-enter AR on `?ar=1`.

## Resuming from a clean checkout

```bash
npm install                                            # once
npm run dev -- --host --port 5174 --strictPort         # https dev server; report the https:// Network URL
npm run build                                          # the only automated check — expect "✓ built in …"
```

Node v20 + `node_modules` present; dev server often already up on `:5174`. LAN IP last seen
`192.168.1.154` (AR page: `https://192.168.1.154:5174/?ar=1`). Quest APK: Bubblewrap project
(`~/house-cad-apk`), assetlinks repo (`~/krosk.github.io`), `~/.bw_pw`, and Bubblewrap's JDK/SDK all
already exist — see `packaging/quest-apk.md` to rebuild/reinstall (don't re-init).

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/core/model.js` | `Floor` + `Project` (floors[], active/ground); facade to active floor; `_emit` solves each floor; `setConstraintMagnitude`/`swapConstraint`/**`flipConstraintSide`**/`setConstraintOffset`/`removeConstraint` |
| `src/core/constraints.js` | per-axis weighted least-squares `solve(floor)`; `makeDistance`, `makeOriginDistance`/`ORIGIN_ID`, `edgeCoord`; `c.conflict` via residual |
| `src/ui/mr.js` | MR session; 8 modes; SIZE numpad (SWAP/DEL/ENTER, current-value prefill, conflict refusal, select-by-panel, flip); `lockedEdges()` white edges; grip-drag (`applyGripDrag`); `dimLabelAtPoint`; edge↔origin dims; `?ar=1` auto-AR; thumbstick-hold exit; build-stamp HUD |
| `src/ui/sketch2d.js` / `view3d.js` | desktop 2D editor (dim drag = `dimOffset` → `c.offset`) / 3D `house` Group |
| `src/main.js` | wiring; floor switcher; per-floor rebuild + stacked export; `setupMR`; localStorage autosave |
| `src/io/serialize.js` | serializes rectangles + constraints (incl. `offset`) + height |
| `vite.config.js` | https dev + `/__log`; vite-plugin-pwa (build-only); `buildId()` → `__BUILD_ID__` |
| `packaging/quest-apk.md` | reproduce-from-scratch Quest APK runbook (read before packaging) |
| `~/house-cad-apk/` (not in repo) | Bubblewrap project. **strings.xml label bug — see Findings.** |
| `~/krosk.github.io/` (separate repo) | serves `/.well-known/assetlinks.json` + `.nojekyll` |

## Next step

- **A — ON-DEVICE FUNCTIONAL QA (owed since session 5; session 9 added a lot to test).** Nothing in
  AR is functionally verified beyond "AR launches" + a couple of fixed visual bugs. Set up storeys +
  heights on DESKTOP first (MR can't create floors), then on the Quest walk **REGISTER (3-point) →
  ROOM/WALL → EDGE → SIZE → RECAL**, and exercise the session-9 dimensioning: **select a dim by its
  panel, edit/FLIP/DEL on the numpad, grip-drag a panel and an edge, white-edge trigger, conflict
  refusal (`!CONFLICT`), 0 m dims (adjacent + origin lock).** No web console on the APK — debug via
  the plain Quest Browser (`?ar=1`) or the Oculus Remote Web Inspector.
- **B — In-AR floor creation + per-floor height.** Biggest remaining parity gap: MR can't create
  floors and there's no in-MR height capture, so upper-floor overlays float if the desktop height is
  wrong (RECAL fixes horizontal drift, not height).
- **C — Model transfer desktop→APK** (unverified). Does the installed TWA share localStorage with the
  Quest Browser at the same origin, or is JSON export/import needed? Blocks getting a desktop-authored
  plan onto the device.
- **D — Remaining parity gaps** (`ar-2d-parity.md`): unit switch in AR; save/load JSON in AR.
- ~~Subtract rectangles in AR~~ (session 8, WALL). ~~Swap/flip a dimension in AR~~,
  ~~delete a specific dimension~~, ~~edit a dimension by selecting it~~, ~~drag a dimension's
  placement~~ — **all DONE session 9.** ~~Store distribution~~ / ~~in-browser PWA install~~ — out of
  scope (sideload only).

## Known open questions

- **Session-8/9 AR work is build-verified; only the zebra render order and reticle-visibility fixes
  were prompted by on-device reports.** No runtime/XR regression guard exists. The full
  survey/dimension workflow has never been walked end-to-end on the Quest.
- **Most likely to need an on-device eyeball:** the 3-point corner landing where real walls meet;
  white-edge trigger firing exactly when a room is fully dimensioned; grip-drag feel (panel + edge);
  conflict rollback on an over-constrained entry; that a plain grip (not over a target) still undoes.
- **Upper-floor overlay height** depends on desktop-entered storey heights (no in-MR capture).
- **Model transfer desktop→APK** unverified. **Anchor drift over a multi-room/multi-floor house**
  untested.
