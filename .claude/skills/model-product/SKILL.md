---
name: model-product
description: Model a real product (furniture, door, fixture) that has no manufacturer 3D model, from its specs, assembly drawings and photos, as code in house-cad. Use when the owner gives a product link or article number and wants it in AR FURNISH, View 3D, or as a door/material product.
---

Follow `docs/product-modelling.md` step by step. It is the canonical workflow; this skill only
sequences it. Read it before acting.

Input: `$ARGUMENTS` (a product URL, article number(s), or name). If empty, ask the owner which product.

1. **Manufacturer model?** Check it (step 1 of the doc, with a known-good control). If one exists,
   register it with `tools/fetch-ikea-model.mjs` and stop.
2. **Ask where it goes** only if unclear: a FURNISH item (free-placed furniture) or a product that
   fills a plan zone (a door → `surface: 'door'` material). Ask the owner for the name to show and,
   if they have one, their own measurements.
3. **Sources** (step 2–3): numbers, assembly drawing, front/side/in-context photos into the
   scratchpad. Tell the owner which photos you are using and what you read from each.
4. **Build** (step 4) as a builder in `src/ui/proceduralFurniture.js` or a design in
   `src/ui/doorProducts.js`, with photo-derived dimensions as named constants or `params`.
5. **Preview and iterate** (step 5): front + side renders against the photos; ask the owner to
   compare and correct. Repeat until they are happy.
6. **Record** (step 6): build, document the entry in `docs/furniture.md` or `docs/materials.md`
   (sources, estimates), add a `docs/ar-qa-checklist.md` item. Label every claim Proven or
   Hypothesis (CLAUDE.md). Commit/push only when the owner asks; never stage the owner's house JSON.

Store code only, never a GLB (owner decision). Keep scratch files, photos and preview servers in
the scratchpad, and stop the preview servers when done.
