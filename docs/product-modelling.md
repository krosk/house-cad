# Modelling a real product with no 3D model: workflow

How the STOCKHOLM bed (`src/ui/proceduralFurniture.js`) and the Lapeyre Ange-Line door
(`src/ui/doorProducts.js`) were made on 2026-09-26. Both took about an hour each, including
iterations with the owner. Follow the same steps for the next product; the skill
`.claude/skills/model-product/SKILL.md` runs this file.

Where the result goes:
- **furniture** → a `procedural: <kind>` entry in `public/furniture/index.json` and a builder in
  `proceduralFurniture.js` (`docs/furniture.md` "Procedural furniture");
- **door (or other product that fills a zone)** → a `surface: 'door'` material in
  `src/core/materials.js` and a `design` drawing in `doorProducts.js` (`docs/materials.md` "Doors").

Storage is **code only, no GLB** (owner decision, 2026-09-26; `docs/furniture.md`).

## 1. Rule out a manufacturer model first

- IKEA: curl `https://web-api.ikea.com/<cc>/<lang>/rotera/static/models/<article>-mini.glb` for
  `fr/fr`, `gb/en`, `us/en`, **plus a known-good article as a control** (e.g. `40586508` → 200).
  404 on all = no model. Article ids drop the dots; `S`-prefixed combos use the digits after `S`.
- IKEA app share links (`applink.ikea.com/<token>--<article>--<cc>--<lang>`) carry the article.
- A product page that 301-redirects to a category is usually discontinued (Hypothesis each time).
- If a model exists, register it with `tools/fetch-ikea-model.mjs` instead and stop here.

## 2. Collect sources: numbers first, then drawings, then photos

| Source | Gives | Example |
|---|---|---|
| Spec sheet / listing | overall size, key heights, thicknesses | bed 223 × 172, foot 35, head 92 cm; door leaf 85, frame 80 mm |
| Assembly instructions PDF | the real part structure | IKEA AA-809121: tapered legs, 2 headboard slats, rails, centre beam |
| Front view photo | widths, panel layout | the cushions fill the whole width between the posts |
| Side view photo | depth, angles, stacking | the headboard leans back ~8°; the cushion bottom sits behind the mattress |
| Real-room photo | material, finish, scale cues | tapered legs, angled joints |

- Web-search summaries can misattribute (one called a bed article a lamp): **trust the page, not the
  summary**.
- IKEA assembly PDFs download fine: `https://www.ikea.com/<cc>/<lang>/assembly_instructions/<name>__AA-<n>_pub.pdf`.
  Read the pages with the Read tool (`pages: "1-6"`); page 1 is usually a clean isometric.
- Record every source (URL) and every number's origin in the doc entry.

## 3. Getting photos that automated access can reach

- **Blocked** (402/403 to curl and WebFetch): IKEAPEDIA (ikeaddict.com), AptDeco, ikea-club.org,
  manuall.
- **Worked:** Design Plus Gallery, lot-art, and manufacturer image hosts
  (`statics-lapeyre.fr`), all by plain `curl` + a regex for `https?://…\.(jpe?g|png|webp)`.
- **Leboncoin:** curl a search-landing page such as `https://www.leboncoin.fr/ck/ameublement/lit-stockholm`,
  parse `<script id="__NEXT_DATA__">` JSON, walk objects that have `subject` + `images`, and filter
  on the product name. `images.urls_large` gives full photos. Listings sometimes repost the
  manufacturer's own studio shots, which are the best side views.
- Save photos to the session scratchpad (never the repo), view them with Read, and pick one straight
  front view, one straight side view, and one in-context photo.

## 4. Build from shapes in code

- Follow the IKEA GLB convention: metres, Y up, floor at Y = 0, centred in plan, front toward +Z.
  Then FURNISH/View 3D place, rotate, highlight and clone it like a downloaded model.
- Overall size from the catalog (`sizeMm`); every other dimension is a named constant or a
  `params` field (`footHeightMm`, `mattressHeightMm`…), so owner corrections are one-line edits.
- Primitives that were enough: `BoxGeometry`; a 4-sided `CylinderGeometry` turned 45° for a tapered
  square leg or post (`member(a, b, wBottom, wTop)`); `RoundedBoxGeometry` for soft parts (cushion,
  mattress).
- Textures are small CanvasTextures drawn in code with a seeded PRNG (identical on every load): wood
  grain along U (a rotated clone for vertical members), leather mottling + seams (+ the same canvas as
  a bump map), fabric weave, slats; the door leaf design drawn once per product.
- Two-sided parts (a door leaf): BoxGeometry's +Z and −Z faces run U in opposite directions, so the
  face whose U starts on the wrong side gets the mirrored texture (`repeat.x = -1, offset.x = 1`),
  or the design disagrees between the two faces.
- For the AR 3D view, give it cached Lambert materials; View 3D uses Standard.

## 5. Check the render against the photos, then iterate

- Scratch preview, plain HTTP (the dev server's self-signed HTTPS blocks browser automation): a
  Vite config in the scratchpad with `root` = its own dir, an alias for `three` to the project's
  `node_modules`, `server.fs.allow` the project; a page that imports the builder via `/@fs/…` and
  renders it with fixed camera views (`?v=front|side|back`). Screenshot with the Chrome tools and
  compare with the same view of the photo.
- Real-app check: a second scratch config with `root` = the project, `server.https: false`,
  another port. In a fresh origin the app seeds a demo house; inject test data into
  `localStorage['house-cad:autosave:v1']` (add zones/finishes/furniture), reload, open View 3D.
- **Owner review per iteration:** show front + side renders beside the photo views. The bed's first
  version had half-width cushions; the owner caught it by comparing with the front photos.
- Stop the servers with `kill $(pgrep -f "[b]edview/…")`: a plain `pkill -f` matches its own
  shell and kills it.

## 6. Measure, record, verify

- Report numbers you measured: bounding box (`Box3.setFromObject`), and if asked, GLB size via
  `GLTFExporter.parseAsync(obj, {binary: true})` (the bed: 204 KB, 14 meshes, 1,624 triangles).
- `npm run build`, then document the entry (sources, which dimensions are photo estimates) and add an
  on-device item to `docs/ar-qa-checklist.md`.
- Photo estimates stay Hypothesis until the owner measures the real object (tape measure beats any
  photo).
