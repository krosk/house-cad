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

What a view carries: massing, aperture bands and orientation, **furniture placements (default
on)**, and **markers (opt-in)**, because large marker sets eat the QR capacity margin. Not
carried: constraints, the conduit/wire network, control links, circuits. Any of these could be
added as an opt-in layer.

**Compression facts** (for future size work): after gzip, only high-entropy bytes matter. Float
mantissas dominate; repeated keys are nearly free (short keys saved about 3%, not worth it).
Precision is the lever: rounding a full file to mm alone cut it 16.3 → 10.1 KB gzip. Measured on a
real 3-storey house: massing about 0.9 KB (about 1.2k base64url chars), plus markers about 1.7 KB.

## Opening a link (the viewer)

At startup a `#view=` hash **wins over autosave** and sets `viewMode`, which:
- **suppresses autosave**, so opening someone's link never clobbers the viewer's own project;
- makes the session **read-only**: `Sketch2D.setReadOnly(true)` limits tools to pan and
  dimension, and the `#app.view-only` CSS hides every geometry-editing control (add/subtract/
  select, height, delete/clear, save/load, floor add/copy/paste, rectangle properties);
- opens on a centered plan.

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
