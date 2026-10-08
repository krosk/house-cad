# View-only share links

A house can be shared as a **view-only link**: the whole house travels in the URL `#fragment`,
so nothing is stored server-side and the static Pages host never receives it. Code:
`src/io/shareView.js` (payload), `src/io/qr.js` (QR image), `src/main.js` (desktop button and
startup decode).

## Why the payload is tiny

A saved project (`serialize.js`) is the full **parametric** definition, and **constraints are
about 78% of a real file**. A view needs none of them:
- rectangles already hold **solved** `x/y/w/h`;
- the 3D pipeline runs off rectangles, kind, and storey height;
- the solver is a **no-op with `constraints: []`** (each edge's `W_STAY` pins it to its current
  value).

So `serializeView` drops constraints, rounds coordinates to the **millimeter** (3 dp), and ships a
compact positional schema (`VIEW_SCHEMA`). `loadView` expands it (fresh ids, `constraints: []`,
op/kind defaults) and reuses `deserializeInto`. Elevation is derived from the stored heights and
ground index, never shipped. The bytes are `deflate-raw` via `CompressionStream`, then base64url.
A one-letter codec tag (`z` deflate, `u` identity) falls back to identity where compression
streams are missing. Decoding a `z` link needs `DecompressionStream` in the viewer's browser.

What a view carries: massing, aperture bands and orientation, **furniture products (always, from
both desktop Share view and AR EXPORT LINK/QR)**. AR used to follow the sheet FURNITURE layer, which
is off by default, so the owner's AR links carried no products and View 3D showed none (owner,
2026-10-03; Proven by decoding the link: empty `a`). Encoding: a FURNITURE zone's `facing` rides after `climb` in its compact rect, then an index into the
`a` article list (`docs/furniture.md` "merge"); links made before the merge carried free-placed
items in floor slot 4, which still decode and migrate to zones. And **markers: always in a LINK (desktop Share view and AR EXPORT · LINK), never in a QR**
(owner, 2026-10-03): they are the view's ceiling lights and switch/outlet products, and the owner's
house with markers is about 4 000 chars, past QR capacity (about 2 950). The AR sheet layers
(MARKER ICONS, FURNITURE) no longer change a link. Markers
keep their device product (`marker.product`, `docs/materials.md` "Switches"): the ids are listed
once in `p` and a marker's optional slot 5 indexes it (slot 4 is the height flag, written as 0 when
only a product needs the slot), so links made before products still decode. **Surface finishes
(always)**: floor/wall finishes and the door and window products, which are finishes on their zones
(`docs/materials.md`). Floor slot 5 holds `[rectIndex, materialIndex, edge, anchorRectIndex, corner,
turn]` (trailing defaults dropped), indexes into that floor's rects and a top-level `m` id list; the
owner's own products used by a finish ride in `cm`. Added 2026-10-03 after the owner's link showed no
Héméra windows (Proven in Node on the owner's file: 28 finishes round-trip identical, 8 windows and 6
doors restored, link 1 835 → 2 205 chars without markers); older links decode with none. Not
carried: constraints, the conduit/wire network, control links, circuits. To see exactly what a given house loses,
run `node tools/check-share-link.mjs <house.json>` (Node only: it builds the link with the app's code,
decodes it, and lists every differing field plus the link length with and without markers). Any of these could be
added as an opt-in layer.

**Compression facts** (for future size work): after gzip, only high-entropy bytes matter. Float
mantissas dominate; repeated keys are nearly free (short keys saved about 3%, not worth it).
Precision is the lever: rounding a full file to mm alone cut it 16.3 → 10.1 KB gzip. Measured on a
real 3-storey house: massing about 0.9 KB (about 1.2k base64url chars), plus markers about 1.7 KB.
Proven (Node, 2026-09-27, the owner's 176-marker house): the hash is 1494 chars without markers (QR
fits) and 3026 with them, which already overflows the QR; giving 111 markers a product adds about
120 chars (3145).

## Opening a link (the viewer)

At startup a `#view=` hash **wins over autosave** and sets `viewMode`, which:
- **suppresses autosave**, so opening someone's link never clobbers the viewer's own project;
- makes the session **read-only**: `Sketch2D.setReadOnly(true)` limits tools to pan and
  dimension, and the `#app.view-only` CSS hides every geometry-editing control (add/subtract/
  select, height, delete/clear, save/load, floor add/copy/paste, rectangle properties);
- opens on a centered plan, unless the link says otherwise (next paragraph).

**A link that opens in 3D** (owner, 2026-10-08: "a direct link entry for a 3d view"). 🔗 Share view
pressed while View 3D is shown appends `&open=3d` and the floor shown, `&floor=<n>` (its position in
the floor list counting from 1, since a shared view renumbers floor ids `f1…` in list order) or
`&floor=all`. Opening such a link goes straight to ◈ View 3D (same loading wheel) on that floor;
copied from the plan, the link opens on the plan as before. `init()` reads the hash once before
decoding (it is async). AR's EXPORT · LINK carries no `open=3d`. **Proven** (local build, Chrome, the
owner's plan as a share link, 2026-10-08): `&open=3d&floor=2` opened View 3D on Ground floor.

**The View 3D ruler works in a view too** (it stores nothing): see `CLAUDE.md` "Core architecture"
(View 3D) and `src/ui/ruler3d.js`.

**Dimensions in a view are measurements, not constraints.** A viewer may add dimensions to read
the fixed geometry; they are tagged `measurement`, bypass `Project._emit()`, never feed the solver,
never rebuild 3D/export geometry, and are never persisted. Their value and direction can't be
edited (that would reshape the plan); they can only be added and deleted.

## Sharing from AR: `link` and `qr` export formats

PROJECT · EXPORT offers two whole-house view formats (`OUTPUT_FORMATS` in `outputOptions.js`),
delivered through the normal export path (Web Share on Quest, download fallback):
- **`link`**: the view URL as text.
- **`qr`**: the view URL as a **QR-code PNG** (`qrcode-generator`, wrapped by `src/io/qr.js`).

Purpose of the QR (owner): a **truncation-proof carrier** for the long link. It is shared as a
digital image so messaging apps can't clip the URL; it is **not** meant to be printed. So
robustness doesn't matter and it always uses **ECC level L** (maximum capacity, fewest modules).
Byte-mode capacity is about 2953 bytes; `makeQr` returns null past that ("too large for QR").
These formats ignore the per-floor layer toggles, except `markerIcons`, which decides whether
markers ride along.

## Trade-offs

- A view is **lossy and one-way**: no constraints means it can't be edited parametrically. It is
  "here is my house", not "keep designing it".
- mm rounding can drop **sub-mm slivers** in the boolean (one real floor's footprint went from 108
  to 100 vertices, max shift 0.5 mm; visually identical).

## Parked: mirroring the Quest to a TV (owner, 2026-09-27)

The owner wants to edit in AR on the Quest 3 while a TV (the Steam Deck, docked) shows the same
house live. Parked, not built. What was worked out, so it need not be re-derived:

- **Quest system cast** (Cast → Computer at meta.com/casting in the Deck's Chrome, or a
  Chromecast): no code; shows the headset's own view. Hypothesis, untested: passthrough may or may
  not appear in a WebXR session's cast, and whether the video stays on the LAN.
- **scrcpy over Wi-Fi adb**: fully local; shows the raw side-by-side stereo frame (crop one eye);
  passthrough may be black (Hypothesis). adb/scrcpy are not installed on the Deck. Same adb access as
  the `pm clear` rule: never clear the app.
- **Live model mirror** (the preferred design if built): the Quest sends the serialized project on
  each change (rate-limited), plus optionally its head pose; the TV renders it read-only in View 3D,
  like a share link, never touching its own autosave.
  - Transport, recommended: **the Deck serves the app** (the HTTPS dev/preview server, whose
    self-signed cert the Quest already accepts) with a same-origin WebSocket endpoint beside
    `/__log`; the Quest opens `https://<deck-ip>:5174/?pair=<token>` from a QR on the TV. No
    WebRTC needed, nothing leaves the LAN. Cost: the Quest uses the Quest Browser, not the APK
    (the TWA is locked to the Pages origin), with its own storage; the Deck server must be running.
  - From the published HTTPS site instead, a LAN socket needs `wss://` with a cert the Quest trusts
    and may hit Chrome's local-network-access prompt; WebRTC through a public signalling server
    (e.g. PeerJS) avoids that but depends on the Quest resolving Chrome's mDNS-obfuscated host
    candidates (Hypothesis; the first thing to test) and on router client isolation being off.
  - First step if resumed: a ping-only page pair, two tabs on the Deck, then the Quest.
- **Steam Deck as a big-screen viewer** (also parked): View 3D has no gamepad input and no
  fullscreen/presentation mode (Proven, code search). Proposed: Gamepad API controls (sticks
  pan/walk/look, A enter POV at a centre crosshair, B overview, bumpers floors) and a `?present`
  mode hiding the plan UI.
