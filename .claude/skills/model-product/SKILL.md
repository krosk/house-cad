---
name: model-product
description: Model a real product (furniture, door, flooring or other surface finish, fixture) that has no manufacturer 3D model, from its specs, assembly drawings and photos, as code in house-cad. Use when the owner gives a product link or article number and wants it in AR (MATERIAL · FURNITURE), View 3D, or as a door/floor/wall material.
---

Follow `docs/product-modelling.md` step by step. It is the canonical workflow; this skill only
sequences it. Read it before acting.

Input: `$ARGUMENTS` (a product URL, article number(s), or name). If empty, ask the owner which product.

1. **Manufacturer model?** For IKEA, check rotera (step 1 of the doc, with a known-good control); if a
   model exists, register it with `tools/fetch-ikea-model.mjs` and stop. Other retailers (Lapeyre,
   Leroy Merlin…) publish none, so go straight to step 2.
2. **Decide where it goes**; ask only if unclear:
   - furniture (a product on a FURNITURE zone, picked in MATERIAL · FURNITURE) → a builder in `src/ui/proceduralFurniture.js`;
   - a product that fills a plan zone: a door → a `surface: 'door'` material + `src/ui/doorProducts.js`;
     a window → a `surface: 'window'` material + a profile in `src/ui/windowProducts.js`;
   - a switch or outlet → a `surface: 'switch'`/`'outlet'` material + a `design` in `src/ui/deviceProducts.js`,
     set on the marker; model only the visible plate and rocker/socket;
   - a surface finish (flooring, tiles, wall covering) → a `surface: 'floor'|'wall'` material with the
     published piece size and pack (the takeoff counts it), plus an optional `design` drawn in
     `src/ui/finishTextures.js`.

   Name it from the product; ask the owner for their own measurements if they have any.
3. **Sources** (steps 2–3): the numbers first, then the **isometric assembly drawing** (preferred for
   dimensions, owner 2026-10-03), then photos.
   - Find the manual: open every section of the product page in Chrome; a download button is not a link
     (read the request it makes with `read_network_requests`), then curl the PDF.
   - If the manual has an isometric view, measure on it (doc step 2, "Measuring an isometric drawing"):
     rasterise at 600 dpi, prove the 0.577 ellipse ratio, then plan px/mm everywhere and heights × 0.816.
   - Photos are perspective (doc step 2, "Using photos"): measure only in the plane of a known length,
     or match a perspective camera to the photo; the drawing wins where they disagree.
   - Photos, documents (manual PDFs) and the spec table:
     `node tools/product-images.mjs --sheet --out <scratchpad>/imgs <url>` (IKEA, Lapeyre, leboncoin).
     Leroy Merlin blocks scripts (DataDome): open the page in Chrome, run the output of
     `node tools/product-images.mjs --snippet` with javascript_tool, then `--download --sheet` the URLs.
     A new site: try the generic mode, then add its pattern to the script.
   - Look at every gallery image and at sibling variants (other widths/colours of the range).
   - If a page 403s to curl/WebFetch, read its specs in the Chrome tools.
   - Tell the owner which photos you use and what you read from each.
4. **Build** (step 4) with the measured dimensions (drawing, else photo) as named constants or `params`. Everything is
   procedural: seeded canvas textures, no stored images.
   **Embed the source material in the generator** (owner, 2026-09-27): a `// Sources:` comment block
   at the builder (and a short one on the catalog entry) with every page URL, the spec-table values
   used, each photo / PDF by its retailer id, and which dimension came from which source or is an
   estimate. The code must be re-checkable against the retailer without the scratchpad or the doc.
5. **Preview and iterate** (step 5): render beside the sources in a scratch preview.
   - Objects with an isometric drawing: an orthographic render along (±1, 1, 1) at the drawing's scale,
     overlaid on it (drawing in red); every outline must sit on its line.
   - Objects: then front + side views with a perspective camera matched to the photos.
   - Surfaces: a straight top-down photo at the same scale, then a room view. Compare pixel statistics
     (mean and spread), not only by eye.

   Ask the owner to compare and correct. Repeat until they are happy.
6. **Photo finish (optional, surface finishes)** (step 7): when the retailer has a straight top-down
   photo and the owner wants the real look in View 3D Realistic, add a `PHOTOS` entry in
   `src/ui/photoFinishes.js`. Check CORS with curl, measure with `tools/photo-measure.mjs`
   (rows / joints / bbox), confirm on crops, cut the photo into pieces laid by the shader (never tile
   it), keep joints in the texture, tone toward the accepted procedural colour. Runtime download only.
7. **Record** (step 6): build, document the entry in `docs/furniture.md` or `docs/materials.md`
   (sources with image ids, estimates), add a `docs/ar-qa-checklist.md` item. Label every claim Proven
   or Hypothesis (CLAUDE.md). Commit/push only when the owner asks; never stage the owner's house JSON.

Store code only, never a GLB or texture image in the repo (owner decision); a photo finish is
downloaded at runtime (step 7 of the doc). Keep scratch files, photos and preview
servers in the scratchpad. When done, stop the preview servers **by port** (`ss -ltnp | grep :5190`,
then `kill <pid>`) and close the browser tabs.
