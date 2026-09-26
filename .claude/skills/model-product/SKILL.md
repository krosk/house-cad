---
name: model-product
description: Model a real product (furniture, door, flooring or other surface finish, fixture) that has no manufacturer 3D model, from its specs, assembly drawings and photos, as code in house-cad. Use when the owner gives a product link or article number and wants it in AR FURNISH, View 3D, or as a door/floor/wall material.
---

Follow `docs/product-modelling.md` step by step. It is the canonical workflow; this skill only
sequences it. Read it before acting.

Input: `$ARGUMENTS` (a product URL, article number(s), or name). If empty, ask the owner which product.

1. **Manufacturer model?** For IKEA, check rotera (step 1 of the doc, with a known-good control); if a
   model exists, register it with `tools/fetch-ikea-model.mjs` and stop. Other retailers (Lapeyre,
   Leroy Merlin…) publish none, so go straight to step 2.
2. **Decide where it goes**; ask only if unclear:
   - a FURNISH item (free-placed furniture) → a builder in `src/ui/proceduralFurniture.js`;
   - a product that fills a plan zone (a door) → a `surface: 'door'` material + `src/ui/doorProducts.js`;
   - a surface finish (flooring, tiles, wall covering) → a `surface: 'floor'|'wall'` material with the
     published piece size and pack (the takeoff counts it), plus an optional `design` drawn in
     `src/ui/finishTextures.js`.

   Name it from the product; ask the owner for their own measurements if they have any.
3. **Sources** (steps 2–3): the numbers first, then drawings, then photos.
   - Photos: `node tools/product-images.mjs --out <scratchpad>/imgs <url>` (IKEA, Lapeyre, leboncoin).
     Leroy Merlin blocks scripts (DataDome): open the page in Chrome, run the output of
     `node tools/product-images.mjs --snippet` with javascript_tool, then `--download` the URLs.
     A new site: try the generic mode, then add its pattern to the script.
   - Look at every gallery image and at sibling variants (other widths/colours of the range).
   - If a page 403s to curl/WebFetch, read its specs in the Chrome tools.
   - Tell the owner which photos you use and what you read from each.
4. **Build** (step 4) with the photo-derived dimensions as named constants or `params`. Everything is
   procedural: seeded canvas textures, no stored images.
5. **Preview and iterate** (step 5): render beside the photos in a scratch preview.
   - Objects: front + side views.
   - Surfaces: a straight top-down photo at the same scale, then a room view. Compare pixel statistics
     (mean and spread), not only by eye.

   Ask the owner to compare and correct. Repeat until they are happy.
6. **Record** (step 6): build, document the entry in `docs/furniture.md` or `docs/materials.md`
   (sources with image ids, estimates), add a `docs/ar-qa-checklist.md` item. Label every claim Proven
   or Hypothesis (CLAUDE.md). Commit/push only when the owner asks; never stage the owner's house JSON.

Store code only, never a GLB or texture image (owner decision). Keep scratch files, photos and preview
servers in the scratchpad. When done, stop the preview servers **by port** (`ss -ltnp | grep :5190`,
then `kill <pid>`) and close the browser tabs.
