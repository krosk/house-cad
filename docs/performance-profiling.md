# Performance profiling on the Quest

How we measure and optimise the AR app's frame rate on the owner's Quest 3, driven from the Steam
Deck with nobody in the headset (owner, 2026-10-23: "we will do a lot more of that"). Skill
`quest-perf` sequences this doc. The tool's mechanics and traps are in `docs/headset-data.md`
"Performance runs". The results log is `docs/ar-survey.md` "Performance notes".

## The rule: measure first, on the headset, from the same view

- **Measure before changing anything,** and again after each change, in the same session where possible.
  A desktop browser or Node cannot show the Quest's GPU cost.
- **Compare like with like.** Use the same viewpoint, floor, sample length and build, with the headset in
  the same place.
- **Label every number** Proven (measured, with build, viewpoint and command) or Hypothesis (CLAUDE.md).
  A plausible cause stays a Hypothesis until a run confirms it.
- **When a switch changes nothing, distrust the measurement before the theory.** On 2026-10-23,
  `hide('furniture')` changed nothing. The cause was that the scene was being rendered about 7 times
  per frame, not that the furniture was cheap.

## The standard viewpoint

The living room's north-west corner, looking toward the origin, on Ground: `--view -4.4,4.2` (owner,
2026-10-23: the hardest view, most of the furnished house in sight). The headset lies still and
unworn. `viewFrom` moves the plan so the headset stands at that point, at eye height. Use it for
every run unless a problem is specific to another view; then record which view.

## The loop

1. **Connect** (skill `quest-connect`). The app must be closed. The headset is kept awake by the
   tool (`prox_close`).
2. **Make sure the headset runs the build you mean to measure:** push (only on the owner's "c p"),
   wait for CI and `version.json`, then `tools/quest-storage.mjs update-app`. The tool prints the
   build it launched. Check it.
3. **Baseline:**

   ```bash
   node --experimental-websocket tools/quest-perf.mjs <scratch>/perf-N --view -4.4,4.2 --no-perf --sample 8 \
     --scenarios plan,3d,3d-nofurn,3d-bare,real,real-nofurn
   ```

   - **Coverage:** add the other scenarios when they matter (`3d-noceil`, `3d-nowalls`, `real-nocatch`,
     `real-basic`, `real-1024`, `low`).
   - **Per-layer view:** drop `--no-perf` to get PERF's per-layer report (`<scenario>.perf.txt`: ms,
     calls, triangles, the biggest meshes). The Quest exposes no GPU timer, so PERF's ms come from
     frame intervals: about ±4 ms noise, worse at low fps.
   - **The fps sample:** sampling the fps with parts hidden (`--no-perf`) is the more reliable number.
4. **Find the cost.** Hiding one part at a time gives its cost in fps:
   - **draw calls:** many small meshes, each drawn once per eye (three.js 0.170 has no multiview);
   - **triangles:** the biggest meshes are listed in the PERF report;
   - **pixels:** big surfaces, per-pixel shadow lookups; try `--scale 0.8` at launch to see whether
     the cost follows the resolution.
5. **Build the change behind a test-hook switch.** Keep the old path, so one deploy measures both, on
   and off in the same session and view. Add a scenario for it in `SCENARIOS` (`tools/quest-perf.mjs`)
   and a switch in `window.houseCadTest` (`mr.js` "Test hook"). Add a Node test where the change is
   reachable in Node.
6. **Re-measure,** then record in `docs/ar-survey.md` "Performance notes":
   - the date, build, viewpoint and command;
   - a before/after table (fps, p50 frame, calls, triangles);
   - what is left.

   Keep the switch only while it is useful for comparing; make the winner the default.
7. **Ask the owner** before each optimisation that changes what they see (detail, LOD, shadows),
   with the measured gain.

## Reading the numbers

- **fps and frame times:** `fps`, `p50`, `p95`, `worst` are from XR frame times. On the Quest at 90 Hz,
  11.1 ms is a full-rate frame.
- **`js` / `render`:** CPU ms per frame (the app's frame logic / three's render submission). Under
  ~4 ms total, the GPU is the limit.
- **`calls` / `tris`:** the last frame, both eyes.
- **`shadowMoves`:** shadow map redraws caused by the plan moving (anchor jitter), over the settle and
  sample time.
- **A hidden part's cost** is the fps difference with everything else equal. At 90 fps the frame is
  capped, so hiding something can show no gain while still costing GPU time. Use a heavier view or
  more scenarios to see it.

## When the numbers do not add up: probing the running app

The production build is minified, so its internals have no readable names. With the test hook on,
DevTools can still reach them:
- `Runtime.getProperties` on a hook function returns its `[[Scopes]]`. In the closure, test each
  object variable with `Runtime.callFunctionOn` (e.g. `this.isScene`) to find the scene or a group.
- Wrapping `scene.onBeforeRender` then records what three renders: render counts, visibility at render
  start, `new Error().stack` for which path rendered.

This found the double render (2026-10-23, `docs/ar-survey.md` "Performance notes"). Use it read-only
(record, do not change the plan), from scratch scripts in the repo root that are deleted after, and
always close the app and remove the hook flag at the end. A finding goes into the docs and gets a real
fix plus a Node test; the probe never ships.

## Do not

- open the owner's plan in a browser, or measure on the desktop and call it the Quest;
- start AR through a browser tab's DevTools gesture (the "Enter VR" chip is the wearer's consent);
  the tool launches the app;
- take headset screen captures except as a last resort (they show the owner's private windows);
  crop and delete them at once;
- leave the app running or the hook flag set (the tool cleans up; check its last lines);
- run `pm clear`.
