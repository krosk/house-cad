// Display units. Geometry is always stored in METERS internally (maps 1:1 to
// WebXR world scale and to the extruded mesh). Only what the user reads and
// types is converted, via the current display unit.

export const UNITS = {
  m: { label: 'm', perMeter: 1, decimals: 2, snap: 0.1 },
  cm: { label: 'cm', perMeter: 100, decimals: 1, snap: 0.01 },
  mm: { label: 'mm', perMeter: 1000, decimals: 0, snap: 0.001 },
};
export const UNIT_ORDER = ['m', 'cm', 'mm'];

const STORE_KEY = 'house-cad:unit:v1';

let current = 'm';
try {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved && UNITS[saved]) current = saved;
} catch { /* localStorage may be unavailable */ }
const listeners = new Set();

export function getUnit() {
  return current;
}
export function unitInfo() {
  return UNITS[current];
}
export function unitLabel() {
  return UNITS[current].label;
}
export function setUnit(u) {
  if (UNITS[u] && u !== current) {
    current = u;
    try { localStorage.setItem(STORE_KEY, u); } catch { /* ignore */ }
    for (const fn of listeners) fn(current);
  }
}
export function cycleUnit(dir) {
  const i = UNIT_ORDER.indexOf(current);
  const n = UNIT_ORDER.length;
  setUnit(UNIT_ORDER[(((i + dir) % n) + n) % n]);
}
export function onUnitChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// meters -> display number
export function toDisplay(meters) {
  return meters * UNITS[current].perMeter;
}
// display number -> meters
export function toMeters(value) {
  return value / UNITS[current].perMeter;
}
// meters -> display string (no unit suffix)
export function fmt(meters) {
  return toDisplay(meters).toFixed(UNITS[current].decimals);
}
