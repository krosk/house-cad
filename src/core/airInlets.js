// Window air inlets (owner, 2026-10-11): the fresh-air inlet a dry room's window carries for the
// single-flow VMC (docs/plumbing-workflow.md "Air paths computed"). A WINDOW zone stores the key in
// `airInlet`; absent = no inlet. Edited in AR HEATING · R / U (the window's numpad, SWAP cell).
//
// Sources: Aldes datasheet "EHB² 6-44 m³/h - 34 dB - Blanc" 11014233
// (assets.aldes.fr/assets/productRefDocs/fr/FR-France-Aldes-EHB-6-44-m-h-34-dB-Blanc-11014233.pdf):
// humidity-controlled, 6–44 m³/h, mortise double slot 2 × (172 × 12) mm, 406 × 45.5 × 31 mm, fixing
// centres 372 mm, Avis Technique 14.5/17-2266 (the EasyHOME Hygro units' own). Acoustic 34 dB per the
// product name (the sheet's description says 37 dB). The sheet gives no Δp reference or humidity curve.
export const AIR_INLETS = {
  'aldes-ehb2-6-44': { name: 'Aldes EHB²', short: 'EHB²', hygro: true, flowMin: 6, flowMax: 44, lengthMm: 406 },
};
// The TOGGLE order on a window: none, then each catalog inlet.
export const AIR_INLET_KEYS = Object.keys(AIR_INLETS);
export const nextAirInlet = (key) => {
  const i = key ? AIR_INLET_KEYS.indexOf(key) : -1;
  return i + 1 < AIR_INLET_KEYS.length ? AIR_INLET_KEYS[i + 1] : null;
};
