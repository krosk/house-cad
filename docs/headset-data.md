# Editing the owner's house on the headset

How to change the owner's live plan on the Quest from this machine. The plan is
never in the repo: it lives in the headset browser's `localStorage`, which the AR app (APK) shares
with the Quest Browser (`packaging/quest-apk.md`). Every step here worked on 2026-10-04 (session 38)
unless marked Hypothesis. Skill: `quest-edit`.

## Rules (owner)

- **This is the normal way to change the owner's house** (owner, 2026-10-04): their edits go to the
  headset autosave, not to an export on the Deck.
- **Read freely, write only on the owner's explicit yes**, for that edit. The autosave and the six
  save slots are the real survey.
- **Back up every `house-cad:*` key before a write**, into the scratchpad. A save slot that still holds
  the pre-edit plan is a second undo; say which one.
- **Never `adb shell pm clear com.krosk.housecad`**: it wipes the autosave and the slots.
- The headset copy is the only current plan (the Deck's old rev 9 export was deleted at the owner's
  request, 2026-10-06: "a newer format was introduced anyway"). Edit the headset copy, never push a
  Deck file over it; Node checks run on a fresh `read` in the scratchpad.

## Connecting

1. `adb devices -l` (either adb: `~/.bubblewrap/android_sdk/platform-tools/adb` or
   `~/Android/Sdk/platform-tools/adb`; they share one adb server). A paired Quest reconnects by itself
   over mDNS once Wireless debugging is on; an empty list can just mean asleep or not yet found.
   If the Quest forgot the pairing: `../quest-mcp-test/.claude/skills/quest-connect/SKILL.md` (pair with
   QRookie's Flatpak adb; the pairing and connection ports differ and change).
2. `adb forward tcp:9333 localabstract:chrome_devtools_remote`.
3. **The Quest Browser must be the app in front of the wearer.** A tab in a background browser, or on
   an awake but unworn headset, never answers DevTools calls (three timeouts; it answered at once when
   the owner opened a browser tab). Ask the owner to open the browser; an empty tab is enough.
4. Keep an unworn headset awake with `adb shell am broadcast -a com.oculus.vrpowermanager.prox_close`
   (it also woke a sleeping one); restore with `...automation_disable` when done (the only broadcast
   that fully restores the sensor, per the sibling skill). It does not replace step 3.

## Reading and writing (`tools/quest-storage.mjs`)

The storage is per origin, so DevTools needs a tab on `krosk.github.io`. The tool loads
`/house-cad/version.json` in a tab when none is on the origin: same origin, none of the app's code
runs, so nothing gets saved. Quest Browser refuses `/json/new`, so it navigates an existing tab.

Trap (owner, 2026-10-06): until the service worker excluded it (`navigateFallbackDenylist` in
`vite.config.js`), navigating to `version.json` served `index.html` under that URL, so the "safe" tab
ran the app (title "House CAD"). Proven: the deployed `sw.js` bound every navigation to `index.html`;
the headset tab showed "House CAD" at `.../version.json`; a cache-bypassing reload showed
`application/json`. The session-39 write went through such a tab and read back identical, and the
autosave still matched afterwards. The tool now checks `document.contentType`, not the URL, and warns
when the tab is the app. Proven on the headset after `8dc326f` installed: a plain navigation to
`version.json`, with the service worker in control, shows `application/json`.

```bash
node --experimental-websocket tools/quest-storage.mjs backup <scratch>/quest-backup-<stamp>
node --experimental-websocket tools/quest-storage.mjs read <scratch>/base.json
#   edit a copy in Node, check it (below), show the owner the change list, get a yes
node --experimental-websocket tools/quest-storage.mjs write <scratch>/edited.json --base <scratch>/base.json
```

`write` re-reads the autosave and refuses unless it still equals `--base`, then reads it back. Before
writing: the AR app closed and no house-cad 2D page open (either would autosave its older copy over
yours). The owner then opens the AR app, which loads the autosave at launch.

When the app runs between your read and your write, it re-saves the plan **in solved form**: stored
x/y/w/h become the solved values, so the bytes differ although the model is the same.
`tools/house-query.mjs diff` shows only what moved; re-apply the edit on the new copy.

## Editing and checking (`tools/house-query.mjs`)

Edit the JSON with a small Node script in the scratchpad (one script per edit, printing every change).
Change a size through its **dimension constraints**, never by moving x/y/w/h alone: the solver
re-imposes the constraints on load. Then:

- `diff <base> <edited>`: no conflicts, no deleted dimensions, and only the intended zones, markers
  and finishes change. A marker pinned to a moved edge follows it: list those for the owner.
- `openings <house>`: every opening's solved width, band, product and U, and the room on each side.
- `rooms-with <house> <re>`: rooms identified by what they hold (the bathrooms are the rooms holding a
  `sensea` shower tray); rooms have no names.
- `takeoff <house> <materialId>`: m² and pieces per wall face and floor region, and the house's packs.
- `conflicts <house>`: each conflicting loop of dimensions and its suspects, the stored value against
  the value the other dimensions imply (`docs/ar-survey.md` "Conflicting dimensions").

New fields that the deployed app doesn't know yet (e.g. a finish `edge: 'cap'` before `afcdd90`)
must wait until Pages serves the build (`version.json` shows its commit) and the app has updated, or
an older app misreads them.

## Applying a supplier quote to the openings (2026-10-04)

The owner's Lapeyre quote (PDF, H × W per line, Uw, Sw):

1. `pdftotext -layout` the PDF. Each product line gives the product, quantity, H × W, Uw and Sw. The
   shutter lines name rooms ("SALON", "CHAMBRE"), which helps the mapping.
2. `openings` on the headset copy. Map quote lines to zones by width, then by the shutter room labels
   and counts. Products the owner already set on the zones confirm the mapping.
3. Owner rules, that time: **the quote is the correct size**; extra height goes to a **higher head**,
   keeping the sill; where both ends of an opening are pinned, **remove one end pin** and add a width
   dimension from the kept end (keep the end a marker is pinned to); a centred change moves both side
   dimensions by half. Uw goes in the zone's `uValue` (heat loss); Sw is solar gain, unused for now.
4. Ask about anything the quote cannot settle (which identical window gets which Sw, a placeholder
   window's sill), then `diff`, owner's yes, `write`.

## Placing furniture and finishes in the stored plan

- A product on the plan is a `furniture` zone: `{ kind: 'furniture', op: 'subtract', foot, top,
  article: <catalog key>, productMm: [w, h, d], facing }`. `facing` 90/270 swaps the footprint, so a
  long side runs along y. Next id = the highest `r` number + 1. Place it from the owner's reference
  ("under light m12"): the light marker's x/y centres it.
- A wall finish is `{ target: { rect, edge }, material }` per room-rect edge. A face onto another room
  of the same component has no wall: skip it (the takeoff shows 0 m²). A half wall inside a room takes
  its own sides and `cap` (`docs/materials.md`).
- Check with `takeoff`, then `diff`, then write as above.

## Waiting for a deploy, then updating the headset app

Pushing main deploys Pages in a minute or two. Poll `https://krosk.github.io/house-cad/version.json?t=<now>`
until its `commit` is the pushed one (a background loop with `curl`, 15 s apart; `gh` is not installed).

**Then update the headset app automatically when the headset is reachable** (owner, 2026-10-04):

```bash
adb devices -l                                   # the Quest listed?
adb forward tcp:9333 localabstract:chrome_devtools_remote
node --experimental-websocket tools/quest-storage.mjs update-app
```

The AR app is a PWA served from its service worker's precache, which is why it used to need a launch
to download a new build and another to run it. The browser shares that service worker, so a browser
tab on the origin can call `registration.update()`. `update-app` does that, then waits until the
precache holds the live `assets/index-*.js`; the next app launch opens the new build. It touches no
`house-cad:*` key (no plan data). Proven 2026-10-04: after `b5a55f2` deployed, the precache went from
`index-COeH9U4m.js` to the live `index-DwP4V2UA.js` with the service worker active (by hand); after
`4ae38b3` deployed, the command itself installed `index-6DJNLGKr.js` in under 90 s.

It needs the same conditions as a read (Connecting above): the Quest on adb and a browser tab that
answers. **It will not always be reachable** (asleep, off the network, browser not in front): then
skip it, say so, and tell the owner the app updates over its next launch or two. Confirm on the HUD's
`update:` line either way.
