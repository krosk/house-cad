// Output-layer preferences shared by the AR sheet preview, SVG export, and DXF
// export. These are UI preferences rather than authored project data, so they
// live in localStorage and old project saves remain unchanged.

export const OUTPUT_FORMATS = ['svg', 'png', 'dxf', 'coohom', 'json'];
export const OUTPUT_LAYER_KEYS = ['planDims', 'markerDims', 'markerIcons', 'wiring', 'furniture', 'furnitureDims', 'area'];
export const OUTPUT_LAYER_DEFAULTS = Object.freeze({
  planDims: true,
  markerDims: true,
  markerIcons: true,
  // The conduit network + routed wires (both riser glyphs included). Default OFF: they
  // are authoring scaffold that clutters a contractor sheet. Markers and switch→light
  // control links are unaffected. Gated under markerIcons (routes need endpoint glyphs).
  wiring: false,
  furniture: false,
  // Structural + marker-pin dimensions anchored to a furniture edge. Default OFF: these
  // are working dimensions, not construction dimensions. Gated under `furniture` (a dim
  // to an undrawn furniture edge would dangle), like wiring is gated under markerIcons.
  furnitureDims: false,
  area: true,
});

const STORE_KEY = 'house-cad:output:v1';

const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;

export function resolveOutputLayers(options = {}) {
  const source = options.layers || options;
  return {
    planDims: bool(source.planDims, OUTPUT_LAYER_DEFAULTS.planDims),
    markerDims: bool(source.markerDims, OUTPUT_LAYER_DEFAULTS.markerDims),
    markerIcons: bool(source.markerIcons, OUTPUT_LAYER_DEFAULTS.markerIcons),
    wiring: bool(source.wiring, OUTPUT_LAYER_DEFAULTS.wiring),
    furniture: bool(source.furniture, OUTPUT_LAYER_DEFAULTS.furniture),
    furnitureDims: bool(source.furnitureDims, OUTPUT_LAYER_DEFAULTS.furnitureDims),
    area: bool(source.area, OUTPUT_LAYER_DEFAULTS.area),
  };
}

let current = { format: 'svg', ...OUTPUT_LAYER_DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    current = {
      format: OUTPUT_FORMATS.includes(saved.format) ? saved.format : 'svg',
      ...resolveOutputLayers(saved),
    };
  }
} catch { /* localStorage may be unavailable or contain stale data */ }

const listeners = new Set();

function persistAndNotify() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(current)); } catch { /* ignore */ }
  for (const fn of listeners) fn(getOutputSettings());
}

export function getOutputSettings() {
  return { ...current };
}

export function setOutputFormat(format) {
  if (!OUTPUT_FORMATS.includes(format) || format === current.format) return;
  current = { ...current, format };
  persistAndNotify();
}

export function cycleOutputFormat(direction) {
  const index = OUTPUT_FORMATS.indexOf(current.format);
  const count = OUTPUT_FORMATS.length;
  setOutputFormat(OUTPUT_FORMATS[((index + direction) % count + count) % count]);
}

export function toggleOutputLayer(key) {
  if (!OUTPUT_LAYER_KEYS.includes(key)) return;
  current = { ...current, [key]: !current[key] };
  persistAndNotify();
}

export function onOutputSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
