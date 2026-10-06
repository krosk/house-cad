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

Storage is **code only, no GLB** (owner decision, 2026-09-26; `docs/furniture.md`). Images may be downloaded at runtime and cached, never committed (owner, 2026-10-03; `docs/realism.md`).

## 1. Rule out a manufacturer model first

- IKEA: curl `https://web-api.ikea.com/<cc>/<lang>/rotera/static/models/<article>-mini.glb` for
  `fr/fr`, `gb/en`, `us/en`, **plus a known-good article as a control** (e.g. `40586508` → 200).
  404 on all = no model. Article ids drop the dots; `S`-prefixed combos use the digits after `S`.
- IKEA app share links (`applink.ikea.com/<token>--<article>--<cc>--<lang>`) carry the article.
- A product page that 301-redirects to a category is usually discontinued (Hypothesis each time).
- If a model exists, register it with `tools/fetch-ikea-model.mjs` instead and stop here.

### A manufacturer CAD model (STEP)

Some makers publish real 3D data, but as CAD rather than a mesh: Villeroy & Boch's product pages list
a STEP file (`assets.villeroy-boch.com/BW/dl_3d_data/<…>.stp`) beside a 2D DXF/DWG/PDF drawing
(`dl_2d_data`) and the manual (`dl_mal`); curl gets them all. Browsers cannot read STEP. Proven
2026-10-06 on 4694R001:
- `occt-import-js` (npm, installed in the scratchpad, never the repo) tessellates it in Node in about
  5 s at any tolerance: 59 332 triangles at 0.5 mm, 8 380 at 2 mm (almost identical), 4 714 at 4 mm
  (facets show).
- Loading it in the app would need a proxy route (no CORS header on `assets.villeroy-boch.com`), a
  3.1 MB (gzip) reader plus the 1.8 MB file per device, and conversion on the Quest (untested). The
  owner chose procedural instead (2026-10-06): runtime download stays acceptable in principle, as
  for IKEA.
- Use it as the best source there is: cut it by plane (a few lines of Node over the triangles), fit
  each section, and overlay the build's silhouettes on the STEP's (scratch preview, orthographic,
  difference of the two masks). The builder `wall-hung-wc` is the example.

## 2. Collect sources: numbers, then the isometric manual, then photos

Owner preference (2026-10-03): **dimension from an isometric assembly drawing whenever one exists**,
and use photos for what the drawing does not show (materials, colour, hidden parts). A photo is a
perspective: its scale changes with depth, so parts further back or nearer read wrong. On the Moder II
table the front photo gave round legs half as splayed as the real ones; the manual's isometric drawing
gave the true blade-shaped legs, and the render laid over it coincided.

| Source | Gives | Example |
|---|---|---|
| Spec sheet / listing | overall size, key heights, thicknesses | bed 223 × 172, foot 35, head 92 cm; door leaf 85, frame 80 mm |
| Assembly manual, **isometric drawing** | every visible part measured to scale, plus the real part structure | Moder II HA833381 p. 1: legs 93 → 42 mm deep, 61 mm splay, 11 + 15 mm edge |
| Assembly manual, other pages | part structure, hidden parts, joints | IKEA AA-809121: tapered legs, 2 headboard slats, rails, centre beam |
| Front / side view photo | what the drawing hides; widths and angles only as estimates | the cushions fill the whole width between the posts; the headboard leans back ~8° |
| Real-room photo | material, finish, colour, scale cues | tapered legs, angled joints |

- **Find the manual first.** Look for "Notice de montage", "manuel d'instruction", "assembly
  instructions", "documents" on the product page, including collapsed sections; open every accordion in
  Chrome, since some sites serve a fuller page to Chrome than to curl. A download *button* is not a link:
  call `read_network_requests`, click it, and read the request it makes (Habitat:
  `habitat.fr/asset/product/<id>`), then download that URL with curl. IKEA:
  `https://www.ikea.com/<cc>/<lang>/assembly_instructions/<name>__AA-<n>_pub.pdf`.
  Third-party manual sites (manualslib) sit behind bot checks: don't try to pass them.

### Measuring an isometric drawing

1. **Rasterise the vector page** at 600 dpi into the scratchpad: `pdftoppm -r 600 -f <p> -l <p> -png
   manual.pdf page` (assembly PDFs are vector drawings, so lines stay 1–3 px thick at any resolution).
   Pick the view of the assembled product with the most parts visible (often the cover).
2. **Prove it is isometric.** A horizontal circle (a round top, a tube end) draws as an ellipse with
   minor/major = 0.577 (tan 30°); for a box, horizontal edges run at ±30°. Dimetric or perspective
   drawings fail this check: then use them for structure only.
3. **Scale.** The ellipse's major axis (or any known published length along a horizontal direction,
   divided by its foreshortening) gives *s* px/mm for horizontal lengths, the same everywhere in the
   drawing; vertical lengths use 0.816 × *s*. A known published height checks it.
4. **Axes.** Identify the product's axes on the drawing (a seam, an edge, a rail runs along an
   isometric axis). Screen-horizontal is then the plan diagonal between them, so a corner leg on the
   left/right is seen in its diagonal depth and one at the front in its width across.
5. **Measure** with pixel scans: decode with `ffmpeg -i page.png -f rawvideo -pix_fmt gray -`,
   then list the runs of dark pixels along chosen rows and columns (a few lines of Python or Node): edges of each part at several heights, so tapers and splay come out as
   rates; positions follow from `u = s · a`, `v = v0 + 0.577 · s · b − 0.816 · s · (z − z0)` (a across,
   b toward the viewer, z up). Write every number into the builder's `// Sources:` block with its pixel
   reading.
6. **Overlay to verify** (step 5): render with an orthographic camera along (±1, 1, 1) at the same
   px/mm, scale the drawing to it, and multiply the two with the drawing tinted red
   (`ffmpeg … blend=all_mode=multiply`). Every outline should sit on a red line; mirror the camera
   if the drawing views the product from the other side.

### Using photos: a perspective (pinhole) camera

Treat a product photo as an ordinary eye perspective: one camera point, straight lines stay
straight, sizes shrink with distance. So a pixel scale holds only in the plane where it was taken
(the top's front edge is not the scale of a leg further back), and parallel edges converge.
- Measure only between points at the **same depth as a known length** (a published width at the
  same plane), and call the result an estimate.
- Better, **match the camera**: in the scratch preview, render with a `PerspectiveCamera` and move
  its position, target and field of view until the published sizes line up with the photo (the
  top's outline, the floor contact points), then overlay the render on the photo as in step 6
  above. What still disagrees is a modelling error, not perspective. Studio shots are usually a
  long lens (a narrow field of view, 15–25°) from about table height.
- Where a photo and an isometric drawing disagree on a dimension, the drawing wins.

- Web-search summaries can misattribute (one called a bed article a lamp): **trust the page, not the
  summary**.
- Read a manual's pages with the Read tool (`pages: "1-6"`) to find the views; page 1 is usually a
  clean isometric of the assembled product.
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
| Habitat | gallery `cdn.habitat.fr/thumbnails/product/<p>/<sku>/raw/<n>/<id>.webp` (the generic mode lists them; take `raw`, the full size). The spec table and composition come fully only in Chrome (curl gets an older layout without "Composition & matériaux"). The assembly manual is a **button** ("Télécharger le manuel d'instruction…" under "Détails du colis & livraison"), not a link: watch the network on click, it fetches `habitat.fr/asset/product/<id>` (a PDF; curl downloads it) | curl for images and the PDF; Chrome for the page text |
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
  Then MATERIAL · FURNITURE / View 3D place, turn and clone it like a downloaded model.
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
- **Isometric overlay first** when the manual has an isometric drawing (step 2, "Measuring an
  isometric drawing"): an orthographic render over the drawing at the same scale checks every visible
  dimension at once. Then match a perspective camera to a photo for the look (step 2, "Using photos").
- **Owner review per iteration:** show front + side renders beside the photo views. The bed's first
  version had half-width cushions; the owner caught it by comparing with the front photos.
- A built app served from `dist/` registers a service worker: before reloading a new local build,
  unregister it and delete the non-`house-cad:` caches, or the old build keeps loading (the toolbar
  says UPDATE AVAILABLE).
- When Chrome reports the automation tab as `hidden`, requestAnimationFrame stops: a frame-rate count
  reads near 0 and a screenshot can time out after 30 s. Drive the page with `javascript_tool`
  (click the View 3D button there) and ask the owner for frame rates on their devices.
- Stop the servers by port: `ss -ltnp | grep :5190` gives the pid, then `kill <pid>`. A plain
  `pkill -f <pattern>` matches its own shell and kills it, and a `pgrep -f` on the scratch folder name
  misses a server started from inside that folder (its command line is just `vite.js --config …`).

## 6. Measure, record, verify

- **Sources live in the generator** (owner, 2026-09-27). The builder in code carries a `// Sources:`
  comment block, and the catalog entry a short one pointing to it:
  - every page URL (product, and any accessory it is modelled with, e.g. a rail);
  - the spec-table values used, quoted as the page gives them;
  - each photo and document by its retailer id (Leroy Merlin media id, Lapeyre image ref, IKEA id,
    PDF media id), with what was read from it;
  - for each dimension constant: its source, or "estimate" and from what.
  No stored images: ids and URLs, not copies (a photo may be downloaded at runtime, step 7). The docs
  entry summarises and points to the code.

- Report numbers you measured: bounding box (`Box3.setFromObject`), and if asked, GLB size via
  `GLTFExporter.parseAsync(obj, {binary: true})` (the bed: 204 KB, 14 meshes, 1,624 triangles).
- `npm run build`, then document the entry (sources, which dimensions are photo estimates) and add an
  on-device item to `docs/ar-qa-checklist.md`.
- Photo estimates stay Hypothesis until the owner measures the real object (tape measure beats any
  photo).

## 7. Optional: a photo finish for View 3D Realistic (surface finishes)

Owner, 2026-10-03: in Realistic mode a floor/wall finish may use the retailer's own photo,
**downloaded at runtime and cached, never committed**; the procedural design stays the stored form
and is what normal View 3D, AR and offline use. Done for the Beaulieu oak charme (planks) and
Monastère (stepped tiles): `src/ui/photoFinishes.js`, `docs/realism.md` "Photo finishes".

1. **The right photo:** a straight, evenly lit top-down shot: of the laid floor (planks) or of one
   tile on white (tiles). Room renders are perspective: references only.
2. **Browser access:** `curl -sI -H "Origin: https://krosk.github.io" <image url>` must answer
   `access-control-allow-origin: *` (`media.adeo.com` and Poly Haven do). Otherwise it needs the
   Cloudflare proxy (`tools/ikea-proxy/`), not built for images.
3. **Measure** the full-size image, copied into the scratchpad, with `tools/photo-measure.mjs`
   (ffmpeg → raw grey → Node, no image library):
   - `rows` gives the grooves; drop false rows (a dark knot) and check the pitch against the
     published width;
   - `joints --grooves …` gives butt-joint candidates per row; joints are faint, so read the expected
     ones off a downscaled copy first and keep the candidates near them;
   - `bbox` gives a tile's box on white.
   Confirm every number on a crop (`ffmpeg -vf crop=w:h:x:y`, then read the image).
4. **Sources in the code:** the `PHOTOS` entry carries a `// Sources:` block with the product refs,
   each photo's media id, and every measured number.
5. **Never tile the photo.** A tiled 2 m photo repeats every 2 m, and its wrap seams line up in a
   staircase (owner asked; seen in a screenshot). Cut it into its pieces (one whole plank per row; each
   tile with its own edge) in an atlas, and lay the pieces in the shader from the plan UVs with a
   random pick and turn per piece (`patchPhotoMaterial`). Colour and relief read the same piece with
   `textureGrad`, so mip levels stay continuous across piece edges.
6. **Joints and grooves come from the texture, never from a shader branch:** a joint drawn by the
   shader aliased into dashes at a distance (seen in a screenshot). Cut planks groove to groove (half
   a groove on each long edge, so a turned plank still meets with a full groove); give each tile cell
   half a joint of grout all round.
7. **Tone:** compare the photo's mean RGB with the procedural design the owner accepted and tone per
   channel toward it (the Monastère photos read grey under the sky light). Divide out a soft lighting
   falloff (least-squares quadratic) when the photo has one.
8. **Check** in a scratch browser on the demo house with the finish injected (step 5): overview and
   POV, then record in `docs/realism.md` with Proven / Hypothesis, including the variety limit (how
   many distinct pieces the photo gives).
