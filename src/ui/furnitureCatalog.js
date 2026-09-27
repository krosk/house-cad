// The furniture catalog (public/furniture/index.json: IKEA articles + procedural
// entries), fetched once and shared by the desktop 3D view, the AR session and the
// load-time sizing of migrated furniture zones (Project.applyFurnitureCatalog).
// Resolves to {} when the fetch fails, so callers degrade to placeholder boxes.
let catalogPromise = null;
export function loadFurnitureCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(import.meta.env.BASE_URL + 'furniture/index.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((c) => c || {})
      .catch(() => ({}));
  }
  return catalogPromise;
}
