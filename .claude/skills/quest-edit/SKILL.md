---
name: quest-edit
description: Read, back up and edit the owner's live house plan stored on the Quest (autosave and save slots), for example to apply a supplier quote, place furniture or set finishes. Follows docs/headset-data.md.
argument-hint: [what to change]
---

Follow `docs/headset-data.md` step by step; it is the canonical procedure. This skill only sequences
it. Requested change: `$ARGUMENTS` (if empty, ask the owner what to change).

1. **Connect** ("Connecting"): adb device, `adb forward tcp:9333 localabstract:chrome_devtools_remote`,
   `prox_close` if the headset is unworn, and ask the owner to open the Quest Browser in front of them.
2. **Back up, then read** with `tools/quest-storage.mjs backup` and `read` into the scratchpad. Say
   which save slot, if any, still holds the pre-edit plan.
3. **Work out the targets** with `tools/house-query.mjs` (`openings`, `rooms-with`, `takeoff`). Rooms
   have no names: identify them by contents or size, and ask the owner when a mapping is not certain.
4. **Edit a copy** with a scratchpad Node script that prints every change; sizes go through dimension
   constraints. Check with `house-query.mjs diff`: no conflicts, no deleted dimensions, only intended
   changes; list markers that followed a moved edge.
5. **Show the owner the change list and get an explicit yes**, with the AR app closed and no house-cad
   2D page open. Then `quest-storage.mjs write <edited> --base <read>`; it refuses if the headset copy
   changed. If it did, re-read, re-apply, re-check.
6. **After a push that deploys**: once `version.json` shows the commit, run
   `quest-storage.mjs update-app` if the headset is reachable ("Waiting for a deploy, then updating the
   headset app"); if not, say so and skip it.
7. **Finish**: `automation_disable` if you sent `prox_close` (unless the owner wants the headset kept
   awake), and record what the owner should verify in `.claude/handoff.md` (Next step A).
   Label every claim Proven or Hypothesis (CLAUDE.md).

Never `adb shell pm clear com.krosk.housecad`. Never write without the owner's yes for that edit.
Never commit the owner's plan or the backups.
