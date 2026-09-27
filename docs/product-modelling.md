# Modelling a real product with no 3D model: workflow

How the STOCKHOLM bed (`src/ui/proceduralFurniture.js`) and the Lapeyre Ange-Line door
(`src/ui/doorProducts.js`) were made on 2026-09-26. Both took about an hour each, including
iterations with the owner. Follow the same steps for the next product; the skill
`.claude/skills/model-product/SKILL.md` runs this file.

Where the result goes:
- **furniture** → a `procedural: <kind>` entry in `public/furniture/index.json` and a builder in
  `proceduralFurniture.js` (`docs/furniture.md` "Procedural furniture");
- **flooring (or other finish)** → a `surface: 'floor'` material in `src/core/materials.js` with the
  published piece size and pack, plus an optional `design` drawn in `src/ui/finishTextures.js`
  (`docs/materials.md` "Flooring products"); tune colour and figure against a room photo from the top
  and at a low perspective angle. Glossy surfaces need a bump texture and View 3D's Reflections
  toggle to look right (`docs/materials.md` "Wall tile products");
- **door (or other product that fills a zone)** → a `surface: 'door'` material in
  `src/core/materials.js` and a `design` drawing in `doorProducts.js` (`docs/materials.md` "Doors").
- **switch or outlet** → a `surface: 'switch'` / `'outlet'` material in `src/core/materials.js` and a `design` in
  `src/ui/deviceProducts.js` (switches and outlets share `plate()`), set on the marker (`docs/materials.md`
  "Switches"). Model only the visible parts (owner, 2026-09-27).
- **window** → a `surface: 'window'` material and a profile set in `windowProducts.js` (`docs/materials.md`
  "Windows"). Measure the profile faces on straight-on photos, inside and outside, scaled by a known
  part (the handle, about 160 mm).

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

## 3. Getting photos, documents and specs: `tools/product-images.mjs`

The script knows each retailer's image pattern and downloads full-size photos, plus the page's
documents (PDF links: installation manual, spec sheet, declaration of performance) and its spec table
(`<th>`/`<td>` rows on any site; Lapeyre's own layout). Send them to the scratchpad with `--out`, never
the repo. Files are named `<n>-<source id>.<ext>` (e.g. `05-5368981.png`) so a doc entry can cite the
retailer's image id. `--sheet` also writes labelled 4 × 4 contact sheets (`sheet-<k>.png`, ffmpeg), so
every photo gets a look. Images Proven 2026-09-26 on every site below; documents, specs, ids and sheets
Proven 2026-09-27 on Leroy Merlin (NEO tray) and Lapeyre (LINE door).

```bash
node tools/product-images.mjs --sheet --out <scratchpad>/imgs <product-url>   # IKEA, Lapeyre, leboncoin
node tools/product-images.mjs --list <url>                            # report only: images, docs, specs
node tools/product-images.mjs --snippet    # Leroy Merlin: JS to run in Chrome on the product page
node tools/product-images.mjs --download --sheet --out <dir> <url>...   # then download what it returned
```

- The snippet starts with `await`: the Chrome tool returns a bare async IIFE as `{}`. The tool truncates
  long output and blocks any output containing a query string, so the report lists URLs without one
  (`--download` adds `?width=1200` for Leroy Merlin) and the full result stays in `window.__product`
  (read `__product.specs` in a second call).
- The generic PDF scan also picks up site-wide PDFs (warranty notices, a Lapeyre kitchen buying
  guide): the link text names each one; download only the relevant ones.

| Site | Pattern the script uses | Access |
|---|---|---|
| IKEA | `ikea.com/<cc>/<lang>/images/products/<slug>__<id>_<code>_s5.jpg`, only this product's slug; 1400 px | curl |
| Lapeyre | `statics-lapeyre.fr/img/catalogue/collMain/…/<ref>_<n>.jpg` (1240 × 900), or `…/zoom1/…/<id>.jpg` on some pages (the LINE door block, 780 × 780); pictos excluded | curl, **these exact headers** (Akamai: another Accept/UA got "Access Denied") |
| Leroy Merlin | the thumbnail strip (`m-nav-thumbnails__image`) = the gallery, in order: `media.adeo.com/media/<id>/media.<png\|jpg>` (ids come in both formats; the last can be a video poster), downloaded with `?width=1200`; the page's other media ids are menu icons, ads and recommendations. Documents from `data-file-name` links; sibling variants listed from `product-variants__item__picture` | **Chrome only** (DataDome, below); images download fine by curl |
| Castorama | Scene7 `media.castorama.fr/is/image/Castorama/<slug>~<EAN>_<code>`, only this EAN (from `…/<EAN>_CAFR.prd`); `?wid=1400`. Specs and pack are in the page (tile count sits in its embedded data) | curl |
| leboncoin | `<script id="__NEXT_DATA__">`: objects with `subject` + `images.urls_large`, filtered by title (`--filter`, default the URL's words) | curl (Node's own fetch gets 403) |
| other | every absolute image URL minus logos/icons: review by eye | curl |

- **Why a site blocks:** Leroy Merlin runs DataDome (403 with `x-datadome: protected` and a JS challenge
  from `geo.captcha-delivery.com`). A real Chrome passes it silently and gets a `datadome` cookie, so
  the snippet re-fetches the page from inside the tab. A proxy would not help. The script fetches with
  curl because leboncoin rejects Node's fetch with identical headers (TLS fingerprint: Hypothesis).
- **Blocked everywhere we tried** (402/403 to curl and WebFetch; Chrome route untested): IKEAPEDIA
  (ikeaddict.com), AptDeco, ikea-club.org, manuall. Design Plus Gallery and lot-art worked with curl
  (generic pattern).
- Look at **every** gallery image, and at sibling variants (other widths/colours of the same range).
  The first pass on the Beaulieu floor stopped at the main photo and missed the top-down shot. Before
  2026-09-27 the Leroy Merlin pattern kept only `.jpg` ids and found 1 of the NEO tray's 10 photos
  (the rest were `.png`); it now reads the thumbnail strip instead.
- Listings on leboncoin sometimes repost the manufacturer's own studio shots, the best side views.
- For a surface, a straight top-down photo is the best reference: render at the same scale beside it
  and compare pixel statistics, not just by eye.
- View photos with Read, and pick one straight front view, one straight side view, and one in-context
  photo.

## 4. Build from shapes in code

- Follow the IKEA GLB convention: metres, Y up, floor at Y = 0, centred in plan, front toward +Z.
  Then FURNISH / MATERIAL · FURNITURE / View 3D place, turn and clone it like a downloaded model.
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
- Stop the servers by port: `ss -ltnp | grep :5190` gives the pid, then `kill <pid>`. A plain
  `pkill -f <pattern>` matches its own shell and kills it, and a `pgrep -f` on the scratch folder name
  misses a server started from inside that folder (its command line is just `vite.js --config …`).

## 6. Measure, record, verify

- Report numbers you measured: bounding box (`Box3.setFromObject`), and if asked, GLB size via
  `GLTFExporter.parseAsync(obj, {binary: true})` (the bed: 204 KB, 14 meshes, 1,624 triangles).
- `npm run build`, then document the entry (sources, which dimensions are photo estimates) and add an
  on-device item to `docs/ar-qa-checklist.md`.
- Photo estimates stay Hypothesis until the owner measures the real object (tape measure beats any
  photo).
