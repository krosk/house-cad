---
name: quest-perf
description: Profile and optimise the AR app's frame rate on the owner's Quest 3 with nobody in the headset (tools/quest-perf.mjs, the test hook, the standard viewpoint). Use for any AR performance question, fps drop, or optimisation. Follows docs/performance-profiling.md.
argument-hint: [what to measure or optimise]
---

Follow `docs/performance-profiling.md`. It is the canonical process; this skill only sequences it.
Read it, then `docs/ar-survey.md` "Performance notes" (the results so far) before acting.

Input: `$ARGUMENTS` (what to measure or optimise). If empty, re-run the baseline and report.

1. **Connect:** skill `quest-connect`; the AR app closed.
2. **Build:** the headset must run the build to measure: `update-app` after a deploy (push only on the
   owner's "c p"). Check the build the tool prints.
3. **Baseline** from the standard viewpoint, `--view -4.4,4.2` (the living room's NW corner toward the
   origin), with the doc's scenario list.
4. **Find the cost** by hiding parts / changing settings one at a time; PERF reports for the per-layer view.
   If a switch changes nothing, suspect the measurement (the doc's "probing the running app").
5. **Change behind a hook switch,** old path kept, plus a scenario and a Node test; measure on and off in
   one session.
6. **Record** the before/after table in `docs/ar-survey.md` "Performance notes" (date, build, view,
   command), every number Proven or Hypothesis.
7. **Ask the owner** before a change they would see, with the measured gain.

Always check the tool's last lines: app closed, hook flag removed, the owner's Realistic setting put back.
