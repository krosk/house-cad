// Explicit deployed-version detection for the static GitHub Pages build.
// version.json is emitted beside index.html but intentionally excluded from the
// Workbox precache, so this request reaches Pages instead of echoing this build.

export const CURRENT_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
export const CURRENT_BUILD_KEY = typeof __BUILD_KEY__ !== 'undefined' ? __BUILD_KEY__ : CURRENT_BUILD;
export const CURRENT_COMMIT = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev';
export const CURRENT_BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null;

let status = { state: 'checking', current: CURRENT_BUILD, latest: null, checkedAt: null };
const listeners = new Set();
let started = false;

export function getVersionStatus() { return status; }

function publish(next) {
  status = { ...status, ...next };
  for (const listener of listeners) listener(status);
}

export function onVersionStatus(listener) {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export async function checkForUpdate() {
  publish({ state: 'checking' });
  try {
    const url = new URL('./version.json', document.baseURI);
    url.searchParams.set('t', String(Date.now()));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const latest = await response.json();
    if (!latest?.build) throw new Error('invalid version manifest');
    const latestKey = latest.key || latest.build; // older manifests remain comparable
    publish({
      state: latestKey === CURRENT_BUILD_KEY ? 'current' : 'available',
      latest,
      checkedAt: Date.now(),
    });
  } catch (error) {
    publish({ state: navigator.onLine ? 'unavailable' : 'offline', checkedAt: Date.now(), error: String(error) });
  }
  return status;
}

export function startVersionChecks() {
  if (started) return;
  started = true;
  checkForUpdate();
  window.addEventListener('online', checkForUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.setInterval(checkForUpdate, 15 * 60 * 1000);
}
