# AR on-device QA checklist

On-device functional verification for the Quest MR survey surface (`src/ui/mr.js`). Sessions 8→13
shipped this surface build-verified only. **First on-device pass: session 14 — SETUP + PLAN +
PROJECT(save/load/lang) confirmed OK. Session 16 — MARKER · DIMS commit + dim-line render confirmed
(a real crash found + fixed there).** Still unverified: LEVEL (multi-floor), MARKER EDIT (incl. the
session-15 **switch** type + picker/retype), the rest of MARKER DIMS (white-when-pinned, hover
outline, one-way pin), cross-cutting HUD/input, and accuracy. Tick a box when confirmed on device.

- Build tested: `0e98d02`  ·  Dates: `2026-09-11` (s14), `2026-09-12` (s16)  ·  Device: Quest 3
- Debug: open `?ar=1` in the **plain Quest Browser** or the **Oculus Remote Web Inspector** — the
  release TWA has no console. `rlog` only works on the dev server.
- Legend: `[ ]` untested · `[x]` verified · `[!]` broken (write what happened).

## Pre-flight (mostly proven)
- [x] APK installs, verifies origin, launches straight into passthrough AR *(proven on device)*
- [x] **Guardian disabled** on-device so you can walk the whole house *(necessarily true — a full walk happened)*
- [ ] HUD build stamp visible and matches the deployed build
- [ ] Only the last-active controller is read; the idle hand hides

## SETUP · ORIGIN (`register`)  ✅ session 14
- [x] 3-point origin: P1,P2 along one wall (sets +X down it), P3 on the perpendicular wall
- [x] Origin lands = P3 projected onto the P1→P2 line (corner needn't be reachable)
- [x] Tip label steps WALL 1 → WALL 2 → PERP
- [x] Grip undoes one point
- [x] Origin gizmo appears at the derived corner

## SETUP · FLOOR (`floor`)  ✅ session 14
- [x] Touching the real ground sets the base level (`floorY`)
- [x] Guarded to the ground floor (a touch on an upper floor does NOT double-count)

## SETUP · RECAL (`recal`)  ✅ session 14 — the reticle you asked about
- [x] SELECT phase: reticle rides the **pointer/ray floor point** (not the tip)
- [x] Nearest corner previews under the pointer; aim biases which wall is "1"
- [x] Nearer wall = **1 (cyan)**, other = **2 (purple)**; active wall gets the edge highlight
- [x] Trigger locks the corner + wall order
- [x] Then P1,P2 along real wall 1, P3 on real wall 2
- [x] Geometry lands on the touches — both rotational AND positional drift corrected
- [x] Grip backs out a point / deselects the corner
- [x] Reticle step badge shows "1" on wall 1, "2" on wall 2 after lock

## SETUP · LEVEL (`level`) — multi-floor  ⬜ NOT covered in session 14
- [ ] AR entry seeds **Basement · Ground · Upper**
- [ ] **Thumbstick up/down switches** the active floor (no wrap)
- [ ] Thumbstick-y changes floor **only in LEVEL** (no-op in modes without a cycle action)
- [ ] Numpad types a storey height; **ENTER** sets the active floor's height and re-stacks elevations
- [ ] Label reads `LEVEL · <FloorName>`; pad title shows the floor's base elevation
- [ ] Stacking: editing **Ground** height lifts **Upper**; editing **Basement** height drops Basement
- [ ] Editing the topmost floor's own height moves nothing (expected)
- [ ] SWAP/DEL keys are inert here

## SETUP · TELEPORT (`teleport`)  ⬜ NEW — build-verified only
- [ ] Pointer reticle tracks the active floor
- [ ] Trigger brings the reticle's plan coordinate beneath the headset without changing height
- [ ] Repeated teleports accumulate correctly
- [ ] Survey geometry, dimensions, yaw, and anchored `planPos` are unchanged
- [ ] Switching modes keeps the teleported position; ORIGIN/FLOOR/RECAL clears it
- [ ] Grip and thumbstick up/down are inert

## PLAN · DROP (`drop`)  ⬜ merged ROOM+WALL into one action in s15 — retest the picker
- [ ] **Thumbstick up/down picks ROOM ↔ WALL**; label (ROOM/WALL) + accent (green/red) track it
- [ ] Trigger with **ROOM** selected drops an **add** rectangle (roomspace) at your standing position
- [ ] Trigger with **WALL** selected drops a **subtract** rectangle (solid wall)
- [ ] 3D extrusion updates live *(drop-of-a-box itself was verified s14; the kind picker is new)*

## PLAN · EDGE (`edge`)  ✅ session 14
- [x] 1st press aiming at an edge of ANY zone LOCKS it; label/reticle turn yellow "SNAP TO WALL"
- [x] 2nd press (tip on the real wall) snaps the locked edge to it
- [x] Grip cancels a pending lock
- [x] HUD `edge:` line shows the highlighted edge length

## PLAN · EDIT (`edit`)  ✅ session 14
- [x] Trigger selects a zone; pressing again cycles DOWN through overlapping zones
- [x] Grip deletes the selected zone
- [ ] Thumbstick up/down swaps the selected zone room↔wall *(control changed from B/Y in s15 — retest)*
- [ ] Outlet glyphs are **inert** here *(needs an outlet placed to confirm — see OUTLET EDIT)*

## PLAN · DIMS (`plan_dims`)  ✅ session 14
- [x] edge↔edge size: pick two edges → numpad → size applied
- [x] edge↔origin position lock (**0 m valid**)
- [x] Numpad **SWAP | DEL | ENTER** shown in the edit phase; field prefills current value
- [x] B/Y = **FLIP** side (flips the dimension, keeps order); negatives rejected
- [x] Conflicting size refused → `!CONFLICT`, pair stays
- [x] DEL removes the constraint (or cancels an in-progress new pair) and closes the pad
- [x] Grip-drag over the dim panel slides its perpendicular offset
- [ ] Parallel grip movement slides the value box along the dimension line; SAVE/LOAD and SHEET preserve that position
- [ ] Outlet floor icons + outlet pins are **inert** here *(needs an outlet placed to confirm)*

## MARKER · EDIT (`marker`)  ⬜ NOT covered on device (type picker + switch are new in session 15)
- [ ] **Thumbstick up/down cycles the drop type** (outlet → switch → light → ethernet, wraps); label reads `MARKER · EDIT · <type>`
- [ ] With a marker **selected**, thumbstick up/down **retypes that marker** in place (glyph swaps, pad title updates)
- [ ] Empty-space trigger drops a marker **of the current type** at the tip; z = tip height above floor
- [ ] Each type's glyph is distinct: outlet = Type E socket, switch = rocker, **light** = bulb + rays, **ethernet** = RJ45 jack
- [ ] Dropping a **light** defaults its height to the storey height (ceiling); other types capture tip height
- [ ] A **floor reticle** tracks the aimed floor point; the marker under it highlights (floor icon + wall glyph outlined, yellow hover / amber selected)
- [ ] Hovering a marker's **floor icon** picks it (stable plan-space target, not the floating billboard)
- [ ] Aiming at a marker + trigger opens its **height pad** (pad title shows the type); ENTER commits, closes, clears
- [ ] **Grip-drag grabs the HOVERED marker** (no prior select) and moves it in 3D; it does NOT snap back on release
- [ ] Dragging a marker with a **pinned X or Y leaves that axis fixed** (only free axes + z move); a fully-pinned marker acts as a **vertical z slider**
- [ ] Grip aimed at empty space deletes the selected marker
- [ ] Each marker shows a wall-height glyph AND a flat projected floor icon
- [ ] Plan zones are **inert** here
- [ ] Depth-test-off glyphs/icons + the reticle read clearly through walls

## MARKER · DIMS (`outlet_dims`)  🟡 commit + render VERIFIED (session 16); rest untested
> s16: a real bug was found + fixed here — the desktop `Sketch2D` (live on `onChange` during AR)
> threw on the marker `{marker}` endpoint, aborting `commitEntry` before `buildPlan`, so pins never
> committed and no dim drew. Now confirmed on device for a TOP and a LEFT pin. See `0e98d02`.
- [x] First reference must be a marker's **projected floor icon**, second a plan edge (floor-icon-first flow works)
- [ ] Plan edges are inert until the floor icon is picked; other marker icons + origin inert after the first pick *(flow worked; the inert-half not explicitly forced)*
- [x] Orange dashed floor dim-line + value label from the anchored edge to the marker
- [x] ENTER commits and closes the pad (was the bug: it did nothing until s16)
- [ ] Glyph turns **WHITE** once BOTH X and Y are pinned
- [ ] Hover/lock adds a bold outline to the icon AND its linked wall-height glyph (shared-X/Y disambig)
- [ ] Pin is one-way: it moves the outlet, not the wall
- [ ] The floor dim label is selectable / grip-draggable here (PLAN DIMS ignores it)

## PROJECT · SAVE / LOAD (`save` / `load`)  ✅ session 14
- [x] Ray-aimed 6-slot menu appears
- [x] SAVE persists the whole multi-floor project
- [x] LOAD round-trips rectangles + constraints (+ offsets), floors + heights
- [ ] LOAD also round-trips **markers + outlet pins** *(needs an outlet in the scene to confirm)*
- [x] Overlays rebuild correctly after LOAD

## PROJECT · MOVE UP / MOVE DOWN (`move_up` / `move_down`)  ⬜ NEW — build-verified only
- [ ] From Ground, trigger moves all rectangles, constraints, and markers to Upper
- [ ] From Ground, MOVE DOWN transfers the same complete plan to Basement
- [ ] Upper becomes active and its overlay appears at the Upper elevation; Ground becomes empty
- [ ] Floor names, storey heights, elevations, and the ground-floor datum do not move
- [ ] Trigger refuses an occupied Upper floor without changing either floor
- [ ] MOVE UP on the top floor, MOVE DOWN on the bottom floor, or either action on an empty source is a visible no-op
- [ ] SAVE/LOAD round-trips the moved plan on its new floor
- [ ] Grip and thumbstick up/down are inert

## PROJECT · SHEET (`sheet`)  ⬜ NEW — build-verified only (canvas preview never rendered on device)
> Preview + download a to-scale plan sheet. The SVG path is desktop-verified (rendered + eyeballed);
> the in-AR canvas raster is untested on the Quest. Debug via the plain Quest Browser (`?ar=1`).
- [ ] Entering SHEET shows a floating panel with the ACTIVE floor's plan, correctly proportioned
- [ ] The sheet reads clearly through passthrough (linework/text legible at the panel distance)
- [ ] Footprint, dimensions, markers + legend, scale bar, `1:N · unit` caption, floor name all present
- [ ] Marker floor-pin dimensions (amber, wall→fixture) show where to place each marker
- [ ] A marker sitting on its wall (0.00 pin) draws NO pin dimension; other 0.00 dims are omitted too
- [ ] **Thumbstick up/down** cycles the previewed floor (wraps); label reads `SHEET · <FloorName>`
- [ ] The previewed floor's geometry matches that floor (not the active one) after cycling
- [ ] **Trigger** downloads the SVG; the label flashes `⬇ plan-<floor>.svg` (or `download blocked`)
- [ ] The downloaded file lands in the headset's Download folder (retrieve by cable) — TWA + Quest Browser
- [ ] Grip is inert here (no delete/undo); leaving the mode hides the panel
- [ ] Marker legend names switch with LANG (outlet/switch localized)

## PROJECT · LANG (`lang`)  ✅ session 14
- [x] Thumbstick up/down moves through FR / EN / ZH
- [x] Trigger picks the ray-aimed row (or advances one if the ray is off the panel)
- [x] All UI text switches (labels, help, numpad, slot menu, LEVEL pad, DIMS titles)
- [x] Choice persists across an APK relaunch
- [x] ZH help text wraps (CJK-aware) without overflowing the box

## Cross-cutting / HUD / inputs  ⬜ mostly not explicitly checked
- [ ] **Reverted HUD panels ride the controller** — they sit right when the hand tilts down (s12 revert)
- [ ] Mode label + help show the localized `GROUP · TOOL` breadcrumb
- [ ] Thumbstick-x cycles modes (both ways); A/X = prev mode; **B/Y does NOT cycle modes** (only flips a completed DIMS pair, else inert)
- [ ] Thumbstick up/down = "cycle the current thing" (LEVEL floor / LANG language / MARKER type / EDIT room-wall), no-op elsewhere
- [ ] Thumbstick-hold (~1.2 s) exits AR; the EXIT bar shows during the hold
- [ ] HUD debug lines present: `build` `ptr` `ret` `edge` (EDGE only) `batt`
- [ ] Overlays ride the correct elevation on each floor

## Harder / accuracy (do last)
- [ ] Anchor drift over a multi-room, multi-floor house stays acceptable
- [ ] Upper/basement overlay heights match reality (only as good as the typed storey heights)
</content>
