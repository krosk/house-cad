# House CAD — session handoff

**Read this first.** This is the "how do I resume" doc — live state only. Stable detail lives in:
- `docs/ar-survey.md` — how the AR survey tool (`src/ui/mr.js`) is built: modes, inputs,
  dimensioning, multi-floor/LEVEL, HUD, perf, durable traps, artifacts.
- `CLAUDE.md` — core (desktop) architecture, build/verify, git workflow, deployment.
- `packaging/quest-apk.md` — Quest APK runbook (read before any packaging work).
- Claude memory (auto-loads): `phase5-xr-intent`, `multi-floor-design`, `ar-2d-parity`,
  `quest-guardian-limitation` — Phase-5 rationale and XR gotchas. Don't duplicate them here.

**Date:** 2026-09-11 (session 11)
**Status:** Quest APK path WORKING (installs, verifies origin, launches into AR — proven on
device). Everything committed and pushed (`main` = `origin/main`). Session 11 added HUD readouts
(edge size, battery) + a per-mode help box, a drag/HUD performance pass, **in-headset multi-floor
(LEVEL mode)**, and a SIZE DEL fix. **All build-verified only — none walked on the Quest.**

## Where things stand in one paragraph

The desktop parametric 2.5D CAD tool (vanilla JS + Vite + Three.js) is deployed at
**https://krosk.github.io/house-cad/** and is also a sideloaded Quest 3 APK (`com.krosk.housecad`,
Bubblewrap/TWA, immersive) that launches straight into passthrough AR. **The goal is Phase 5: an
on-site MR survey tool** (read `phase5-xr-intent` memory before planning), multi-storey, authored
entirely in AR. **Proven:** the APK installs/verifies/enters AR; the PWA serves; everything builds
clean and deploys. **NOT proven:** essentially the entire survey/edit/dimension/save/floor workflow
is build-verified only — it has never been walked end-to-end on the Quest. The only on-device
signals to date are a handful of fixed visual-bug reports.

## What changed in session 11
> Next agent: when you add your section, fold anything still a live constraint into `docs/ar-survey.md`
> (stable) or "Standing decisions" (live) and delete the narrative.

All in `src/ui/mr.js` unless noted. Driven by owner feature requests + bug reports.

1. **HUD: edge size + battery + per-mode help box** (`5bb8e1a`). Debug HUD gained an `edge:` line
   (highlighted edge length, EDGE mode) and a `batt:` line (`navigator.getBattery()`). Each mode
   now carries a `help` string rendered in a new word-wrapped help box on each controller.
2. **Drag / HUD performance pass** (`5bb8e1a`). EDGE grip-drag skips the per-frame dimension
   rebuild (`buildPlan(false)`, restored on release); dim-label `CanvasTexture`s are cached by
   text+color (`dimTexCache`) so the SIZE offset-drag stops churning GPU uploads; the debug HUD
   redraw is throttled to ~2 Hz (EXIT bar bypasses it). See `docs/ar-survey.md` → Performance.
3. **In-headset multi-floor (LEVEL mode)** (`ef24512`). AR entry seeds Basement · Ground · Upper
   (`ensureFloors`); new LEVEL mode cycles floors (B/Y) and sets storey heights by hand on the
   numpad. Closes the desktop-only floor gap. See `docs/ar-survey.md` → Multi-floor and the
   updated `multi-floor-design` memory.
4. **SIZE DEL fix** (`ef24512`). DEL on a NEW pair (no constraint yet) now cancels the definition
   and closes the pad instead of a no-op; existing-constraint DEL unchanged.

## Standing decisions (live constraints; stable architecture is in the docs above)

- **Git: commit + push directly on `main`, no feature branches. Every push auto-deploys to Pages
  = publishes** — only push when asked. No `gh` CLI; deploy check:
  `curl -s "https://api.github.com/repos/krosk/house-cad/actions/runs?per_page=1"`.
- **`npm run build` is the only automated check** (no tests/linter/types). Clean build = imports/
  syntax sound; it does NOT catch runtime/visual/XR bugs. **All session-8→11 AR work is
  build-verified only.**
- **This machine is a Steam Deck (SteamOS), Node v20 via nvm.** No system `java`/`adb` — Bubblewrap
  brought its own under `~/.bubblewrap/`. The fnm/Node-22 block in `CLAUDE.md` is Windows-only (a
  prior machine); ignore it here.
- **Web change = Pages deploy + relaunch the APK** (SW usually swaps it; watch the HUD build stamp)
  or `adb shell pm clear com.krosk.housecad`. Rebuild the APK only for `twa-manifest.json` changes.
- **LATENT (not in this repo):** `~/house-cad-apk/app/src/main/res/values/strings.xml` is missing
  `appName`/`launcherName`; add them before the next `bubblewrap build` or the label regresses.

## Commits (substantive only; doc-only omitted — `git log` has all)

`main` = `origin/main` — **everything pushed.**

Session 11:
- `ef24512` in-headset multi-floor (LEVEL mode) + SIZE DEL cancels a new pair.
- `5bb8e1a` HUD edge size + battery + per-mode help box; drag/HUD perf (EDGE-drag skip, dim-label
  texture cache, HUD throttle).

Earlier substantive AR commits: `f5027da` new-dim line at tip (+ RECAL explicit-corner select,
mislabeled commit); `7d6cb87` RECAL 3-point reframe; `40e959c` plan-space ptr HUD + EDGE snap
prompt + edge-highlight `frustumCulled`; `f60f0fd` SAVE/LOAD slots; `7ad996f` minimal HUD;
`0372d90` edge-pick/negative-w/h fix (`constraints.js`). Full history in `git log`.

## Resuming from a clean checkout

```bash
npm install                                            # once
npm run dev -- --host --port 5174 --strictPort         # https dev server; report the https:// Network URL
npm run build                                          # the only automated check — expect "✓ built in …"
```

Node v20 + `node_modules` present; dev server often already up on `:5174`. LAN IP last seen
`192.168.1.154` (AR page: `https://192.168.1.154:5174/?ar=1`). Quest APK project (`~/house-cad-apk`),
assetlinks repo (`~/krosk.github.io`), `~/.bw_pw`, and Bubblewrap's JDK/SDK already exist — see
`packaging/quest-apk.md` (don't re-init).

## Next step

- **A — ON-DEVICE FUNCTIONAL QA (owed since session 5; sessions 8–11 all added untested surface).**
  Nothing beyond "AR launches" is functionally verified. Walk: REGISTER → ROOM/WALL → EDGE (SNAP
  prompt) → SIZE (dim line at tip; select/edit/FLIP/**DEL on a new vs existing pair**; grip-drag;
  `!CONFLICT`; 0 m) → RECAL (corner select, wall "1"/"2" swap, 3-point reframe) → **LEVEL (B/Y
  cycles Basement/Ground/Upper; type a height + ENTER; watch the overlay re-seat)** → SAVE/LOAD a
  slot. Confirm the drag-perf changes feel smoother and the HUD edge/batt lines read right. Debug
  via the plain Quest Browser (`?ar=1`) or Oculus Remote Web Inspector — the release TWA has no
  console.
- **B — Model transfer desktop→APK.** LOAD/SAVE share the origin's localStorage, but the desktop
  autosave (`house-cad:autosave:v1`) and AR slots (`house-cad:slot:<i>`) use different keys. Verify
  on device whether the installed TWA sees Quest-Browser localStorage, and decide if LOAD should
  surface the desktop autosave as a slot.
- **C — Remaining parity gaps** (`ar-2d-parity` memory): unit switch in AR; slot naming/delete/
  overwrite-confirm. Cosmetic: LEVEL mode's inert SWAP/DEL numpad keys could be hidden/relabeled.
- ~~Subtract in AR~~, ~~flip/delete/edit/drag a dimension~~, ~~save/load in AR~~, ~~in-AR floor
  creation + per-floor height~~ — **DONE.** ~~Store distribution~~ / ~~in-browser PWA install~~ —
  out of scope (sideload only).

## Known open questions

- **The entire session-8→11 workflow is build-verified only** — never walked end-to-end on the
  Quest. No runtime/XR regression guard exists.
- **Most likely to need an on-device eyeball (session 11):** LEVEL floor cycle + height entry
  re-seating the overlay at the right elevation (and the counter-intuitive "edit the floor below
  to move this one" stacking); the drag-perf changes actually smoothing the judder; HUD edge/batt
  lines reading correctly; battery line present at all (depends on `getBattery()` support in the
  TWA).
- **Upper/basement overlay height** now depends on hand-entered storey heights (LEVEL) — accuracy
  is only as good as what's typed. Anchor drift over a multi-room/multi-floor house untested.
