# View 3D realism

Goal (owner, 2026-10-03): push the desktop/mobile View 3D toward photo realism, as several opt-in
settings so lighter devices keep working. Target devices: the Steam Deck and an iPhone 14.

## Owner decisions (2026-10-03)

- **Images: downloaded on the fly, never committed.** Photos, HDRIs and photo textures may be used
  when fetched at runtime and kept in the browser's Cache Storage (`house-cad:images:v1`). Nothing
  image-like goes into the repo. This amends the earlier "code only" rule
  (`docs/furniture.md` Storage, `docs/product-modelling.md`): procedural code remains the stored form
  and the offline fallback.
- **Sources:** CC0 libraries first (Poly Haven: HDRIs and textures, `access-control-allow-origin: *`,
  Proven by curl 2026-10-03; ambientCG ships zips, so it is not used). A crop of a retailer photo for
  an exact product look is acceptable (owner) but would need the Cloudflare proxy (retailer CDNs and
  Leroy Merlin's DataDome: Hypothesis); not built.
- **North is plan up** (+y). Plan (x, y) → world (x, up, −y), so north is world −Z, east +X.
- **Site:** Val-de-Marne, 48.79° N 2.45° E (`SITE` in `src/ui/realism.js`; the heat-loss site).

## Settings (View 3D floor panel; per device, never project or share data)

| Setting | What it adds |
|---|---|
| Basic / Full lighting | as before: Full adds marker lights and two point-light shadows |
| Reflections | the generated RoomEnvironment for glossy finishes |
| **Realistic** (`house-cad:view3d-realistic:v1`) | real sun + shadows, downloaded sky, GTAO; a time slider |

Realistic (`View3D.setRealisticEnabled`, `src/ui/realism.js`):

- **Sun:** `sunPosition(date)` (low-precision solar ephemeris; Proven in Node: Paris 64.6° at the
  June solstice noon, 17.8° in December, morning sun ENE, evening W). The slider sets today's hour
  (04:00–22:30, session-only). The DirectionalLight sits on that direction, its 2048 shadow camera
  fitted to the visible floors (refit on rebuild, floor filter and framing). Intensity fades to 0 at
  the horizon and warms near it. Plain window panes no longer cast shadows, so sun comes through.
- **Sky:** Poly Haven `kloofendal_48d_partly_cloudy_puresky` 1k HDR (1.4 MB, CC0), fetched once into
  Cache Storage. Its photographed sun is found (brightest pixel) and clamped to the sky level, so the
  DirectionalLight is the only sun; the sky is turned so its bright side faces the real sun. The
  background uses the raw sky; the lighting copy is desaturated to 30 % (the raw sky turned rooms blue,
  seen in a screenshot) and a faint warm hemisphere stands in for the floor bounce. Both textures are
  half float (full-float filtering is optional in WebGL2; iOS: Hypothesis). Download failure falls
  back to the generated room and says so under the slider.
- **Ambient occlusion:** `EffectComposer` → `RenderPass` → `GTAOPass` (radius 0.45 m) → `OutputPass`,
  into a 4× MSAA half-float target. Pixel ratio capped at 1.5 while on.
- The XR loop never uses the composer; `mr.js` stashes and restores background/environment.

**Proven** (Chrome on the Steam Deck, local build, demo house, 2026-10-03): the sky downloads, sun
patches fall through the windows at the slider time, house shadow points north at midday, corner AO
shows, walls read neutral in POV. **Not measured:** frame rate (the test tab was hidden, so the
browser paused rendering). **Hypothesis:** usable on the Deck and the iPhone 14; check fps on both.

## Photo finishes (Realistic only)

`src/ui/photoFinishes.js`: a finish whose catalog id is registered there swaps its procedural texture
for the retailer's own photo while Realistic is on (normal View 3D, AR and offline keep the
procedural design, which stays the stored form). Leroy Merlin's image CDN `media.adeo.com` answers
`access-control-allow-origin: *` (Proven by curl, 2026-10-03), so no proxy is needed.

- **Beaulieu oak charme** (`oak_beaulieu_charme`): photo 799228, a 3000 px straight top-down render
  of the laid floor. Measured in Node: 11 full rows between grooves (247.9 px = 164 mm) and each
  row's butt joints (whole planks 1749–1764 px ≈ 1.18 m; checked on a crop). One whole plank per row
  is cut out (groove to groove, so turned planks still meet with a full groove), the photo's soft
  light falloff divided out (least-squares quadratic), and the 11 planks stacked in an atlas with a
  relief map from the photo's local contrast.
- **Owner question (2026-10-03): does a photo texture show a pattern repeat?** Tiling the photo
  did: the same planks every 2 m, and each row's wrap seam drew the same staircase in every tile
  (seen in a screenshot). So the photo is not tiled: a shader (`patchPlankMaterial`) lays planks from
  plan UVs (row, random offset per row, random plank of 11, turned 180° half the time), so the floor
  never repeats and every plank is exactly 1.18 × 0.164 m. `textureGrad` keeps mip levels continuous
  across plank edges.
- **Proven** (Chrome on the Steam Deck, local build, demo house): the photo downloads, planks read as
  long, knotted oak with grooves, no repeat visible in the overview or up close.
  **Hypothesis:** with only 11 source planks, a distinctive knot can be spotted twice in a large room.

## Next options (not built)

- **Render button:** path-traced still (`three-gpu-pathtracer`); compatibility with three 0.170 is a
  Hypothesis.
- **Photo textures:** Poly Haven PBR sets (colour, normal, roughness) for plaster, wood, concrete,
  downloaded like the sky, procedural fallback offline; retailer crops through the proxy.
- Bloom on light pucks; baked bounce light.
