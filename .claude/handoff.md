# House CAD — session handoff

**Read this first, then `CLAUDE.md`.** This is the "how do I resume" doc. Deep Phase-5 rationale
and every XR gotcha live in Claude memory `phase5-xr-intent.md` + `multi-floor-design.md`, which
auto-load each session — don't duplicate them here.

**Date:** 2026-09-10 (session 7)
**Status:** **Quest APK path is WORKING** — the app installs as an immersive, offline, sideloaded
Quest 3 APK and **launches into AR (proven on device).** Everything is **committed and pushed**
(`main` = `origin/main`, tree clean). **Still owed: on-device FUNCTIONAL QA** — entering AR is
proven, but the survey flow and multi-floor have NOT been exercised on the Quest.

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is now also an **installable PWA** packaged into a
**sideloaded Quest 3 APK** (`com.krosk.housecad`, Bubblewrap/TWA, immersive mode). Tapping the app
icon launches straight into passthrough AR — the survey overlay. **The current goal is still Phase 5:
an on-site MR survey tool** (read `phase5-xr-intent.md` before planning), now multi-storey and
installable. **What's proven:** the APK installs, verifies its origin, and enters AR; the PWA serves
correctly; multi-floor + the session-7 AR features build clean and are deployed. **What's NOT proven:**
the actual survey workflow on device (REGISTER→DROP→EDGE→SIZE→RECAL), multi-floor behaviour (desktop
eyeball + MR), and the session-7 AR features (single-controller, in-world exit, dimensions overlay)
have not been functionally QA'd on the Quest — only that AR launches. So the immediate need is
**on-device functional verification**, not more features.

## What changed in session 7
> Next agent: when you add your section, fold anything still a live constraint into "Standing
> decisions" or "Findings" and delete the rest.

1. **MR input → single active controller + in-world exit** (`mr.js`, commit `fc11499`). All input
   (mode cycle, floor switch, rays, tips) now reads only the controller that last showed activity
   (`activeSource`/`pickSource`); the idle controller's tip/label/HUD are hidden. **Hold the
   thumbstick (buttons[3]) ~1.2 s to exit AR** (DOM "EXIT AR" isn't visible in-headset).
2. **Constraint dimensions drawn in AR + controller readout** (`mr.js`, `9b68199`). Each active-floor
   distance constraint renders as a dim line + billboarded value label (origin-refs skipped, matching
   desktop). Pointing the active controller at a dimension echoes its value big on a controller pill
   (angular pick, ~5° cone).
3. **Installable offline PWA** (`vite.config.js`, `public/`, `8f3cf3d`). `vite-plugin-pwa`
   (build-only) emits manifest + service worker, precaches the build. Icons generated from
   `public/icon.svg`. **Confirmed: Quest Browser does NOT do in-browser install** (`beforeinstallprompt`
   never fires) — so a real app requires packaging (below). The in-browser Install button was added
   for diagnosis then removed (`18bf322`).
4. **Quest APK via Bubblewrap — WORKING** (`ec8d5cf`, `b656ee8`; runbook `packaging/quest-apk.md`).
   Packaged **immersive** mode; APK start URL is `/house-cad/?ar=1`; the web app auto-enters AR on
   `?ar=1` by calling `requestSession('immersive-ar')` **directly** (NOT gated on `isSessionSupported`,
   which is false/unreliable in the immersive shell and would hang on the splash). Sideloaded via adb;
   launches into AR on device.

## Standing decisions

- **This machine is a Steam Deck (SteamOS), Node v20 via nvm.** No system `java`/`adb` — Bubblewrap
  brought its own under `~/.bubblewrap/` (adb: `~/.bubblewrap/android_sdk/platform-tools/adb`,
  keytool: `~/.bubblewrap/jdk/jdk-17.0.11+9/bin/keytool`). The fnm/Node-22 block in `CLAUDE.md`
  Commands is Windows-only (a prior machine); ignore.
- **Git: commit and push directly on `main`, no feature branches.** `main` auto-deploys to Pages on
  push, so **every push publishes** — only push when asked. (`packaging/` docs aren't in the built
  site, so doc pushes don't change the live app.)
- **`npm run build` is the only automated check** — no tests/linter/types. Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs.
- **Quest distribution = SIDELOAD APK, immersive mode** (owner ruled out the Meta Horizon Store).
  Full reproducible runbook: **`packaging/quest-apk.md`** (read it before touching packaging). Key
  invariants: package `com.krosk.housecad`, immersive `horizonOSAppMode`, start URL `/house-cad/?ar=1`,
  same signing key forever. Signing passwords kept in `~/.bw_pw` (chmod 600) for non-interactive
  rebuilds (`set -a; . ~/.bw_pw; set +a; bubblewrap build`).
- **Digital Asset Links MUST be at the origin root** `https://krosk.github.io/.well-known/assetlinks.json`
  (an immersive PWA won't launch unverified). Served by a **separate user-site repo `krosk.github.io`**
  (local clone `~/krosk.github.io`, remote `git@github.com:krosk/krosk.github.io.git`) with a
  `.nojekyll` file (Jekyll otherwise strips the dot-folder). Contains the signing SHA-256
  `F7:99:55:CB:…:5A`.
- **The APK is a thin shell that loads the LIVE site.** So a web change needs only a Pages deploy +
  `adb shell pm clear com.krosk.housecad` (refresh the SW cache); rebuild the APK only when
  `twa-manifest.json` changes (mode/startUrl/icons/version).
- **Phase 5 = on-site MR survey tool.** Physical tape = source of truth; Quest tracking/anchors =
  scaffold only. Keep the axis-aligned rectangle model. Rationale + XR gotchas: `phase5-xr-intent.md`.
- **Multi-floor (settled session 6):** floors are **independent plans** (not copy-from-below); per-floor
  height; all floors share the **same plan origin corner** (differ only in elevation). MR = register
  once on the ground; each floor carries its own elevation (from stacked heights); RECAL fixes drift.
  **NO per-room anchors, NO Quest room scan / plane detection** (so USE_SCENE permission declined in
  the APK). `Project.floors[]` + `activeFloorId`/`groundFloorId`; a facade makes
  `project.rectangles/constraints/height` point at the active floor so most consumers were untouched.
- **Survey modes (6, stable `id`s):** FLOOR → REGISTER → DROP → EDGE → RECAL → SIZE. Modes are DATA in
  `modes`. Thumbstick ↔ cycles modes, ↕ changes floor, grip = context undo, thumbstick-hold = exit AR.
- **Exact size = dimension constraints only** (desktop AND in-headset SIZE). No on-canvas W/H, no inline
  size editor. **Geometry in meters**; `units.js` converts only display/input. Distance constraints
  ordered+signed (`value = coord(b)−coord(a)`).
- **Coordinate mapping:** plan `(x,y)` → planGroup-local `(x,0,−y)`; planGroup applies `planYaw` +
  `planPos`. Overlay lift per floor is a pure Y translation (`overlayY()`), so plan coords stay correct
  on every storey.

## Findings / traps worth knowing

- **The facade is why multi-floor was cheap.** `project.rectangles/constraints/height` are getters onto
  the active floor — don't reintroduce raw fields. Solver runs per floor in `_emit()`.
- **Quest APK, hard-won (all in `packaging/quest-apk.md`):** in-browser PWA install doesn't exist on
  Quest; 2D-mode APK can't enter `immersive-ar`; immersive-mode shows only a splash until the page
  starts a session; gating auto-AR on `isSessionSupported` hangs it; `assetlinks.json` must be
  origin-root + `.nojekyll`; get the fingerprint from the SIGNED APK (`keytool -printcert -jarfile`,
  no keystore password); a release TWA gives no web console (logcat has no `console.*`; `chrome://
  inspect` needs the Oculus Browser's Remote Web Inspector enabled); the SW can serve a stale build in
  the APK after redeploy → `pm clear`; one headset can show multiple adb transports → `adb -s <serial>`.
- **XR reference-space mismatch (cost hours, still in force).** In `sessionstart`: request
  `local-floor` AND `renderer.xr.setReferenceSpace(localSpace)`; `setReferenceSpaceType()` alone did NOT
  take. Read world cam pos from `matrixWorld.elements` ([12],[13],[14]); `getCamera().position` stays ~0.
- **Desktop does NOT render origin-referenced dimensions** (edge↔`__origin__`); they solve/lock but draw
  no line. Same in the AR overlay (skipped for parity).
- **`View3D.setGeometry` rebuilds meshes every change** — MR uses the `hideMesh` flag and references
  `view.house` (the floor Group), not `view.mesh`. `LineBasicMaterial` is always 1px → edges/dims are
  flat floor-strip quads.
- **Remote logging (`rlog` → dev-only `POST /__log` → `quest-debug.log`, gitignored — never stage it)**
  only works on the dev server, NOT on Pages/the APK. On the APK, `console.*` isn't visible either.
- **WebXR AR is Quest/Android only** (not iOS). `GLTFExporter` fails in Node (works in browser) — don't
  "fix" headlessly.

## Commits

Substantive only (doc-only omitted; `git log` has all). `main` = `origin/main` — **everything pushed.**

- `b656ee8` robust auto-AR (drop `isSessionSupported` gate, retry) — the fix that made AR launch.
- `ec8d5cf` auto-enter AR on `?ar=1` (Quest immersive APK).
- `8f3cf3d` installable offline PWA (vite-plugin-pwa + manifest + icons).
- `9b68199` constraint dimensions in AR + controller readout.
- `fc11499` single active controller + in-world AR exit.
- `a38f31a` (session 6) multi-floor storeys (model, 2D, 3D, serialize, MR).
- (Intermediate PWA-diagnostic commits `cdbccad`/`2171c63`/`cef38e2` were the in-browser-install probe,
  since removed in `18bf322` — ignore.)

## Resuming from a clean checkout

```bash
npm install                                            # once
npm run dev -- --host --port 5174 --strictPort         # https dev server; report the https:// Network URL
npm run build                                          # the only automated check — expect "✓ built in …"
```

Node v20 + `node_modules` present. Dev server often left running on `:5174` (check before starting).
Quest APK: the Bubblewrap project (`~/house-cad-apk`), the assetlinks repo (`~/krosk.github.io`),
`~/.bw_pw`, and Bubblewrap's JDK/SDK all already exist on this machine — see `packaging/quest-apk.md`
to rebuild/reinstall (don't re-init from scratch).

## The artifacts and what each is for

| Path | Role |
|---|---|
| `src/core/model.js` | `Floor` + `Project` (floors[], active/ground); facade to active floor; `_recomputeElevations`; `_emit` solves each floor |
| `src/core/constraints.js` | per-axis weighted least-squares `solve(floor)`; `makeDistance`, `makeOriginDistance`/`ORIGIN_ID`; `edgeCoord` |
| `src/io/serialize.js` | v2 floors[] + v1→one-Ground migration |
| `src/ui/mr.js` | MR session; modes; single active controller + thumbstick-hold exit; dimension overlay + readout; `overlayY()` per-floor lift; **`?ar=1` auto-enter-AR**; numpad; anchors; HUD |
| `src/ui/sketch2d.js` / `view3d.js` | 2D editor (ghost underlay) / 3D `house` Group (one mesh per floor at elevation) |
| `src/main.js` | wiring; `#floor-ctl` switcher; per-floor rebuild + stacked export; `setupMR` |
| `vite.config.js` | https dev + `/__log`; **vite-plugin-pwa (build-only)** |
| `public/` | PWA icons + `icon.svg` |
| `packaging/quest-apk.md` | **Complete reproduce-from-scratch Quest APK runbook** (read before packaging work) |
| `packaging/assetlinks.template.json` | Digital Asset Links template (fingerprint filled from the signed APK) |
| `~/house-cad-apk/` (not in repo) | Bubblewrap project: `twa-manifest.json`, `android.keystore`, `app-release-signed.apk` |
| `~/krosk.github.io/` (separate repo) | serves `/.well-known/assetlinks.json` + `.nojekyll` |
| `phase5-xr-intent.md`, `multi-floor-design.md` (Claude memory) | deep rationale; auto-load |

## Next step

- **A — ON-DEVICE FUNCTIONAL QA (do this first; owed since session 5).** AR *launches* on the APK, but
  nothing functional has been exercised. Set up storeys + heights on DESKTOP first (MR can't create
  floors), then on the Quest walk **REGISTER→DROP→EDGE→SIZE→RECAL** on the ground, thumbstick-↕ to
  another floor and confirm the overlay lifts + edits target that floor, check the **dimension overlay +
  controller readout**, single-active-controller behaviour, and **thumbstick-hold exit**. No web console
  on the APK — for web-side debugging use the plain Quest Browser (`?ar=1` URL) or enable the Oculus
  Browser Remote Web Inspector.
- **B — Resolve model transfer to the Quest app.** The immersive APK has **no 2D editor**, so a plan
  authored on desktop must reach it. Verify whether the installed app shares localStorage with the Quest
  Browser at the same origin, else wire JSON export/import (or in-AR floor setup). Currently a Hypothesis.
- **C — Desktop multi-floor eyeball** (still owed from session 6): add a floor, draw offset, confirm the
  ghost underlay lines up + 3D stacks + save/reload; add a basement; toggle ⌂.
- ~~Meta Horizon Store distribution~~ — **out of scope** (owner: sideload only).
- ~~In-browser PWA install button~~ — **removed**; Quest Browser can't install PWAs (`beforeinstallprompt`
  never fires), so it was dead weight.

## Known open questions

- **Nothing on the Quest is functionally verified beyond "AR launches."** Survey flow, multi-floor
  switching/elevation, dimension overlay/readout, single-controller, exit gesture — all unexercised on
  device. No runtime/XR regression guard exists.
- **Upper-floor overlay height depends on desktop-entered storey heights** — no in-MR capture; a wrong
  height floats the overlay off the real floor (RECAL fixes horizontal drift, not this).
- **Model transfer desktop→Quest APK** unverified (see Next step B).
- **Anchor drift over a multi-room / multi-floor house** untested — only single-room exercised.
