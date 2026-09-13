// Canonical per-kind color coding for zones, shared by the desktop 2D sketch and
// the AR plan/edit overlays so a zone reads the same everywhere. Kind already
// encodes op (room = add, every other kind = subtract), so the color also tells
// add from subtract at a glance: blue is the only "add".
//
// Values are numeric hex (Three.js material colors). Use the helpers below for
// canvas/CSS ('#rrggbb') and rgba() consumers.

export const ZONE_KINDS = ['room', 'wall', 'door', 'window', 'stairs', 'cabinet'];

export const ZONE_COLORS = {
  room:    0x4a9eff, // blue
  wall:    0xff6b6b, // red
  door:    0x4ade80, // green
  window:  0x22d3ee, // cyan
  stairs:  0xfbbf24, // yellow
  cabinet: 0xa78bfa, // purple
};

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
