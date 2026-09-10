# House CAD — session handoff

**Read this first, then `CLAUDE.md`.** This is the "how do I resume" doc. Deep Phase-5 rationale
and every XR gotcha live in Claude memory (`phase5-xr-intent.md`, `multi-floor-design.md`,
`ar-2d-parity.md`, `quest-guardian-limitation.md`), which auto-load each session — don't duplicate
them here.

**Date:** 2026-09-11 (session 8)
**Status:** Quest APK path WORKING (installs, verifies origin, launches into AR — proven on device).
Session 8 built out **in-AR authoring parity** (subtract zones, zone selection/edit, better edge
picking) — all **build-verified only, NOT yet exercised on device.** Everything committed and pushed
(`main` = `origin/main`, tree clean).

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also an installable PWA packaged into a sideloaded
Quest 3 APK (`com.krosk.housecad`, Bubblewrap/TWA, immersive mode) that launches straight into
passthrough AR. **The current goal is Phase 5: an on-site MR survey tool** (read `phase5-xr-intent.md`
before planning), multi-storey. **Key realization driving session 8:** the immersive APK **exits AR by
quitting — there is no 2D editor on-device**, so the AR surface (`src/ui/mr.js`) is the *only*
authoring surface a Quest user has, and it must reach parity with the desktop 2D editor
(`ar-2d-parity.md` tracks the gap list). **What's proven:** the APK installs/verifies/enters AR; the
PWA serves; multi-floor + all AR features build clean and deploy. **What's NOT proven:** none of the
survey/edit workflow has been functionally QA'd on the Quest — only that AR launches.

## What changed in session 8
> Next agent: when you add your section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete the rest.

1. **Subtract zones in AR** (`518e24e`). DROP→renamed **ROOM** (add); new **WALL** mode (subtract),
   both via a shared `dropRect(op)`. Semantics: **add = roomspace, subtract = wall** (owner's model).
   WALL edges render red vs ROOM purple; a subtract carves the footprint fill automatically.
2. **Build stamp on the AR HUD** (`1ea4eef`). Vite `define` injects `__BUILD_ID__` (git short-hash +
   UTC build time); shown as the top HUD line. Lets you confirm on-device that a fresh deploy loaded
   vs. a stale SW cache — the stamp changes only on rebuild. Debug HUD panel made taller to fit it.
3. **EDGE picking rewritten** (`adb29e0`). Was active-rect-only + perpendicular-to-line (picked far
   parallel edges / nothing). Now `edgeAtPoint`: the edge SEGMENT the beam lands on across ALL zones,
   nearest wins, capped at 40 cm (`EDGE_PICK_M`); open floor picks nothing. `selectedEdge`/`hoverEdge`
   now carry `{rectId, edge}`. Resting edges thinned to **1 cm** (`EDGE_HALF`); highlights kept bolder
   (`EDGE_HI_HALF`, 2 cm). Old `nearestEdge` (single-rect) removed.
4. **EDIT mode — select a zone, delete or swap** (`5831e13`). New mode. Trigger selects the zone under
   the ray; pressing again **cycles down the overlap stack** (wraps) so buried zones are reachable;
   selection persists. **Grip deletes**; **upper face button B/Y swaps room↔wall** (thumbstick-x still
   cycles modes in EDIT). Selected zone gets a seamless 45° **zebra fill** + op-colored outline (green
   ROOM / red WALL); unselected topmost previews yellow outline.

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
  syntax sound; it does NOT catch runtime/visual/XR bugs. **All session-8 AR work is build-only.**
- **AR is the only Quest authoring surface** (`ar-2d-parity.md`). The immersive APK has no 2D editor
  and exiting AR quits, so any desktop capability must be replicated in `mr.js` or consciously deemed
  not-needed-on-site. AR already exceeds desktop in one spot: edge↔origin position-lock (SIZE mode).
- **Quest distribution = SIDELOAD APK, immersive mode** (owner ruled out the Store). Runbook:
  **`packaging/quest-apk.md`** (read before touching packaging). Invariants: package `com.krosk.housecad`,
  immersive `horizonOSAppMode`, start URL `/house-cad/?ar=1`, same signing key forever. Signing
  passwords in `~/.bw_pw` (chmod 600): `set -a; . ~/.bw_pw; set +a; bubblewrap build`.
- **The APK is a thin shell loading the LIVE site.** A web change = Pages deploy +
  `adb shell pm clear com.krosk.housecad` (or relaunch — `autoUpdate` SW usually swaps it; watch the
  build stamp). Rebuild the APK only for `twa-manifest.json` changes (mode/startUrl/icons/version/key).
- **Guardian must be disabled on-device to walk a whole house** (`quest-guardian-limitation.md`).
  OS-level; WebXR can't opt out (`unbounded` unsupported on Quest Browser); `local-floor` is correct.
  Owner disabled it via Quest **Developer settings** (persistent). A real setup-step limitation.
- **Multi-floor (session 6):** floors are **independent plans** (not copy-from-below); per-floor
  height; all share the **same plan origin corner** (differ only in elevation). MR = register once on
  the ground; each floor carries its own elevation. **NO per-room anchors, NO room scan / plane
  detection** (USE_SCENE declined). `Project.floors[]` + `activeFloorId`/`groundFloorId`; a facade makes
  `project.rectangles/constraints/height` point at the active floor.
- **Survey modes (8, stable `id`s):** FLOOR → REGISTER → ROOM(id `drop`) → WALL → EDGE → EDIT → RECAL
  → SIZE. Modes are DATA in `modes`. **Inputs:** trigger = mode action; grip = context undo/delete;
  thumbstick-x = cycle mode; thumbstick-y = change floor; thumbstick-hold (~1.2 s) = exit AR; face
  buttons A/X = prev mode, B/Y = next mode **except in EDIT where B/Y swaps room↔wall**. Only the
  last-active controller is read (`activeSource`/`pickSource`); the idle hand's markers hide.
- **Exact size = dimension constraints only** (desktop AND in-headset SIZE). No on-canvas W/H, no
  inline size editor. **Geometry in meters**; `units.js` converts only display/input. Distance
  constraints ordered+signed (`value = coord(b)−coord(a)`).
- **Coordinate mapping:** plan `(x,y)` → planGroup-local `(x,0,−y)`; planGroup applies `planYaw` +
  `planPos`. Overlay lift per floor is a pure Y translation (`overlayY()`), so plan coords stay correct
  on every storey.

## Findings / traps worth knowing

- **"App name unavailable" in the Meta menu is NOT a bug.** Verified the signed APK's
  `application-label` is correctly `House CAD` (`aapt2 dump badging`). The menu text is the standard
  fallback for sideloaded (Unknown Sources) immersive apps — the panel resolves names from Meta's
  catalog, which sideloads aren't in. Cosmetic; Quit + thumbstick-hold exit both work.
- **LATENT: `~/house-cad-apk/app/src/main/res/values/strings.xml` is missing `appName`/`launcherName`**
  (only `assetStatements` present), yet the installed APK's label is fine. A future `bubblewrap build`
  could regress the real label to empty. Add the two strings (or re-run `bubblewrap update` and check)
  before the next APK rebuild. Not in this repo — it's under `~/house-cad-apk`.
- **The facade is why multi-floor was cheap.** `project.rectangles/constraints/height` are getters onto
  the active floor — don't reintroduce raw fields. Solver runs per floor in `_emit()`.
- **Quest APK, hard-won (all in `packaging/quest-apk.md`):** no in-browser PWA install on Quest; 2D-mode
  APK can't enter `immersive-ar`; immersive shows only a splash until the page starts a session; gating
  auto-AR on `isSessionSupported` hangs it; `assetlinks.json` must be origin-root + `.nojekyll`; get the
  fingerprint from the SIGNED APK (`keytool -printcert -jarfile`); release TWA has NO web console
  (debug the `?ar=1` page in the plain Quest Browser, or enable the Oculus Browser Remote Web Inspector);
  SW can serve a stale build after redeploy → `pm clear` / build stamp; one headset can show multiple
  adb transports → `adb -s <serial>`.
- **XR reference-space mismatch (cost hours, still in force).** In `sessionstart`: request `local-floor`
  AND `renderer.xr.setReferenceSpace(localSpace)`; `setReferenceSpaceType()` alone did NOT take. Read
  world cam pos from `matrixWorld.elements` ([12],[13],[14]); `getCamera().position` stays ~0.
- **Desktop does NOT render origin-referenced dimensions** (edge↔`__origin__`); they solve/lock but draw
  no line. Same in the AR overlay (skipped for parity).
- **`View3D.setGeometry` rebuilds meshes every change** — MR uses `hideMesh` and references `view.house`
  (the floor Group), not `view.mesh`. `LineBasicMaterial` is always 1px → edges/dims are flat floor-
  strip quads (thickness via `stripCorners`).
- **Edge-pick is floor-plane based:** `edgeAtPoint`/EDIT use where the ray meets the overlay plane
  (the reticle), not true 3D ray-vs-edge — so aim the reticle at the wall base. If that feels off on
  device, true 3D ray-segment picking is the next step up.
- **Remote logging (`rlog` → dev-only `POST /__log` → `quest-debug.log`, gitignored — never stage it)**
  only works on the dev server, NOT on Pages/the APK. On the APK `console.*` isn't visible either.
- **WebXR AR is Quest/Android only** (not iOS). `GLTFExporter` fails in Node (works in browser).

## Commits

Substantive only (doc-only omitted; `git log` has all). `main` = `origin/main` — **everything pushed.**

- `5831e13` AR EDIT mode (select zone; cycle overlaps; grip delete; B/Y swap; zebra highlight).
- `adb29e0` AR EDGE: 1 cm resting edges + point-at-reticle (`edgeAtPoint`) picking across all zones.
- `1ea4eef` build stamp on the AR HUD (Vite `define` → `__BUILD_ID__`).
- `518e24e` WALL (subtract) mode; DROP→ROOM; add=roomspace / subtract=wall.
- `a38f31a` (session 6) multi-floor storeys. `fc11499` single active controller + in-world AR exit.
  `9b68199` constraint dimensions in AR + controller readout. `8f3cf3d` installable offline PWA.
  `ec8d5cf`/`b656ee8` auto-enter AR on `?ar=1` (the fix that made AR launch).

## Resuming from a clean checkout

```bash
npm install                                            # once
npm run dev -- --host --port 5174 --strictPort         # https dev server; report the https:// Network URL
npm run build                                          # the only automated check — expect "✓ built in …"
```

Node v20 + `node_modules` present; dev server often already up on `:5174`. LAN IP last seen
`192.168.1.154` (AR page: `https://<ip>:5174/?ar=1`). Quest APK: Bubblewrap project (`~/house-cad-apk`),
assetlinks repo (`~/krosk.github.io`), `~/.bw_pw`, and Bubblewrap's JDK/SDK all already exist — see
`packaging/quest-apk.md` to rebuild/reinstall (don't re-init).

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/core/model.js` | `Floor` + `Project` (floors[], active/ground); facade to active floor; `_emit` solves each floor |
| `src/core/constraints.js` | per-axis weighted least-squares `solve(floor)`; `makeDistance`, `makeOriginDistance`/`ORIGIN_ID` |
| `src/ui/mr.js` | MR session; 8 modes (ROOM/WALL drop, EDGE `edgeAtPoint`, **EDIT** select/delete/swap + zebra); numpad SIZE; per-floor `overlayY()`; `?ar=1` auto-AR; single active controller; thumbstick-hold exit; **build-stamp HUD** |
| `src/ui/sketch2d.js` / `view3d.js` | desktop 2D editor (ghost underlay) / 3D `house` Group (one mesh per floor) |
| `src/main.js` | wiring; floor switcher; per-floor rebuild + stacked export; `setupMR` |
| `vite.config.js` | https dev + `/__log`; vite-plugin-pwa (build-only); **`buildId()` → `__BUILD_ID__`** |
| `packaging/quest-apk.md` | Complete reproduce-from-scratch Quest APK runbook (read before packaging) |
| `~/house-cad-apk/` (not in repo) | Bubblewrap project: `twa-manifest.json`, keystore, signed APK. **strings.xml label bug — see Findings.** |
| `~/krosk.github.io/` (separate repo) | serves `/.well-known/assetlinks.json` + `.nojekyll` |

## Next step

- **A — ON-DEVICE FUNCTIONAL QA (owed since session 5; now more to test).** Nothing in AR is
  functionally verified beyond "AR launches." Set up storeys + heights on DESKTOP first (MR can't
  create floors), then on the Quest walk **REGISTER → ROOM/WALL → EDGE → SIZE → RECAL**, exercise the
  new **EDIT** mode (select, overlap-cycle, delete via grip, swap via B/Y, zebra highlight), the
  point-at-reticle edge pick + 40 cm tolerance, thumbstick-↕ floors, dimension overlay/readout,
  single-controller, thumbstick-hold exit. No web console on the APK — debug via the plain Quest
  Browser (`?ar=1`) or the Oculus Browser Remote Web Inspector.
- **B — In-AR floor creation + per-floor height.** Still the biggest parity gap: MR can't create
  floors and there's no in-MR height capture, so upper-floor overlays float if the desktop height is
  wrong (RECAL fixes horizontal drift, not height).
- **C — Model transfer desktop→APK** (unverified hypothesis). Does the installed TWA share localStorage
  with the Quest Browser at the same origin, or is JSON export/import needed? Blocks getting a
  desktop-authored plan onto the device.
- **D — Remaining parity gaps** (`ar-2d-parity.md`): delete/swap a *specific* dimension; unit switch;
  save/load JSON in AR.
- ~~Subtract rectangles in AR~~ — **DONE** (session 8, WALL mode).
- ~~Meta Horizon Store distribution~~ / ~~in-browser PWA install~~ — out of scope (sideload only; Quest
  Browser can't install PWAs).

## Known open questions

- **Session-8 AR work (WALL, EDIT select/delete/swap, zebra, `edgeAtPoint`, 1 cm edges) is
  build-verified only — none exercised on device.** No runtime/XR regression guard exists.
- **Nothing else on the Quest is functionally verified beyond "AR launches."**
- **B/Y-in-EDIT swap and zebra orientation/tiling** are the session-8 things most likely to need an
  on-device eyeball.
- **Upper-floor overlay height** depends on desktop-entered storey heights (no in-MR capture).
- **Model transfer desktop→APK** unverified (Next step C). **Anchor drift over a multi-room/multi-floor
  house** untested.
