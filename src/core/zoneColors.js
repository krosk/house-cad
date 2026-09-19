// Canonical per-kind color coding for zones, shared by the desktop 2D sketch and
// the AR plan/edit overlays so a zone reads the same everywhere. Kind already
// encodes op (room = add, every other kind = subtract), so the color also tells
// add from subtract at a glance: blue is the only "add".
//
// Values are numeric hex (Three.js material colors). Use the helpers below for
// canvas/CSS ('#rrggbb') and rgba() consumers.

export const ZONE_KINDS = ['room', 'wall', 'insulation', 'door', 'halfwall', 'sliding', 'window', 'stairs', 'cabinet', 'furniture'];

export const ZONE_COLORS = {
  room:    0x4a9eff, // blue
  wall:    0xff6b6b, // red
  insulation: 0xe879f9, // magenta
  door:    0x4ade80, // green
  halfwall: 0x94a3b8, // slate — a low wall; wall-family but distinct from the red full wall
  sliding: 0x14b8a6, // teal — a sliding door; door-family but distinct from the green swing door
  window:  0x22d3ee, // cyan
  stairs:  0xfbbf24, // yellow
  cabinet: 0xa78bfa, // purple
  furniture: 0xfb923c, // orange
};

// Vertical + opening semantics for the "aperture" kinds. Every aperture is one
// opening band [sill, head] cut into the wall; the kinds differ only in which
// band is solid: a door is open [0..head] (solid lintel above), a window is open
// [sill..head] (solid below and above), a half wall is solid [0..sill] (open
// above, so `head:null` = up to the ceiling — the inverse of a door). These are
// stored for a future height-aware extrude; today only `hinge` reaches the plan
// glyph. `hinge` is the sideways opening direction measured ALONG THE WALL'S OWN
// AXIS — 'left' = the min-coordinate jamb, 'right' = the max-coordinate jamb,
// 'both' = a double casement. Doors open left/right; windows left/right/both; a
// half wall opens uniformly upward, so it has no side (`hinge:null`). A door also
// carries `swing` ('in'/'out') = which face of the wall the leaf sweeps; hinge ×
// swing gives the four door orientations you rotate through. Windows/half walls
// have no swing.
export const APERTURE_DEFAULTS = {
  door:     { sill: 0,   head: 2.1,  hinge: 'left', swing: 'in' },
  window:   { sill: 0.9, head: 2.1,  hinge: 'left' },
  halfwall: { sill: 1.1, head: null, hinge: null   },
  // Sliding (surface-mounted / barn-door): rail on one wall face; the panel is
  // INFERRED as the opening + a fixed 10 cm overhang (not authored). Rotates through
  // 4 states like a door — `hinge` = slide direction (left/right), `swing` = which
  // wall face the rail/panel sits on (in/out).
  sliding:  { sill: 0,   head: 2.1,  hinge: 'left', swing: 'in' },
};

export function isAperture(kind) {
  return Object.prototype.hasOwnProperty.call(APERTURE_DEFAULTS, kind);
}

const FALLBACK = ZONE_COLORS.room;

// Resolve a rectangle to its zone kind. Mirrors the model's rule so rectangles
// authored before the kind field (kind absent) still map sensibly: any subtract
// is a wall, anything else a room.
export function zoneKind(rect) {
  if (rect && ZONE_KINDS.includes(rect.kind)) return rect.kind;
  return rect?.op === 'subtract' ? 'wall' : 'room';
}

export function zoneColorHex(kind) {
  return ZONE_COLORS[kind] ?? FALLBACK;
}

// '#rrggbb' for canvas fillStyle / strokeStyle and CSS.
export function zoneColorCss(kind) {
  return '#' + zoneColorHex(kind).toString(16).padStart(6, '0');
}

// [r, g, b] 0-255 components, for building rgba() fills at an arbitrary alpha.
export function zoneColorRgb(kind) {
  const h = zoneColorHex(kind);
  return [(h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff];
}

// Mix a hex color toward white by t (0..1). Used for the "active zone" edge tint
// in AR, which is a lightened version of the zone's resting color.
export function lightenHex(hex, t = 0.45) {
  const m = (c) => Math.round(c + (255 - c) * t);
  return (m((hex >> 16) & 0xff) << 16) | (m((hex >> 8) & 0xff) << 8) | m(hex & 0xff);
}
