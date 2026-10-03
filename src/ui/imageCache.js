// Runtime-downloaded images (docs/realism.md: fetched on the fly, kept in the browser's
// Cache Storage, never committed). Worker-safe: the finish texture worker uses it too.
const IMAGE_CACHE = 'house-cad:images:v1';

export async function fetchCached(url) {
  const cache = globalThis.caches ? await caches.open(IMAGE_CACHE).catch(() => null) : null;
  const hit = cache && await cache.match(url);
  if (hit) return hit.arrayBuffer();
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  if (cache) await cache.put(url, response.clone()).catch(() => {});
  return response.arrayBuffer();
}
