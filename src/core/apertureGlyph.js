// Pure, backend-agnostic plan symbols for the aperture zone kinds (door swing,
// window casement, half-wall poché). Every function returns a flat list of line
// segments [x0, y0, x1, y1] in a NORMALISED BOX whose origin is (0,0) and whose
// size is (w, h) — the caller offsets by the box origin and draws each segment
// with its own line primitive (SVG/canvas via planSheet, DXF via dxf, thin floor
// quads in AR). Keeping the geometry here is what stops the three surfaces from
// drifting apart (they must stay superposable on a printed sheet).
//
// `hingeEnd` is which end of the box's LONG axis carries the hinge, expressed in
// the CALLER'S OWN coordinate space: 'lo' = the smaller coordinate end, 'hi' =
// the larger, 'both' = a double casement. Callers whose Y runs the opposite way
// to plan (the print page) resolve lo/hi against their mapped corners, so a
// hinge authored on the wall's min-coordinate jamb ("left") always renders on
// the correct side regardless of axis flips.

function arcSegments(cx, cy, r, a0, a1, steps, out) {
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + ((a1 - a0) * i) / steps;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
    out.push([cx + r * Math.cos(t0), cy + r * Math.sin(t0),
      cx + r * Math.cos(t1), cy + r * Math.sin(t1)]);
  }
}

// Door: the leaf (a straight line perpendicular to the wall, length = door
// width) plus its swing arc back to the far jamb. Radius = the opening's long
// dimension, so the quarter-circle sweeps into the room past the thin cutout,
// exactly like the architectural symbol. `perp` (+1/-1) is the swing side across
// the wall (deferred in/out control); a consistent default reads fine.
export function doorSwingSegments(w, h, hingeEnd = 'lo', { perp = 1, steps = 8, reach } = {}) {
  const out = [];
  const horizontal = w >= h;
  const dir = perp >= 0 ? 1 : -1; // leaf swings toward +axis (dir>0) or −axis
  // Pivot P (hinge on the wall line), leaf tip T (perpendicular), far jamb F
  // (along the wall). The wall line sits on the box edge the leaf swings FROM, so
  // the quarter-arc always sweeps to the swing side.
  let Px, Py, Tx, Ty, Fx, Fy, r;
  if (horizontal) {
    r = reach ?? w;
    const sy = perp >= 0 ? 0 : h;
    Px = hingeEnd === 'hi' ? w : 0; Py = sy;
    Tx = Px; Ty = sy + dir * r;
    Fx = Px + (hingeEnd === 'hi' ? -r : r); Fy = sy;
  } else {
    r = reach ?? h;
    const sx = perp >= 0 ? 0 : w;
    Px = sx; Py = hingeEnd === 'hi' ? h : 0;
    Tx = sx + dir * r; Ty = Py;
    Fx = sx; Fy = Py + (hingeEnd === 'hi' ? -r : r);
  }
  out.push([Px, Py, Tx, Ty]); // leaf
  // Sweep from the leaf tip to the far jamb the SHORT way (they're 90° apart).
  const a0 = Math.atan2(Ty - Py, Tx - Px);
  let d = Math.atan2(Fy - Py, Fx - Px) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  arcSegments(Px, Py, r, a0, a0 + d, steps, out);
  return out;
}

// Window: two glazing panes along the long axis (the "it's glass" cue) plus a
// casement "V" that converges on the hinge jamb, showing which side opens.
// 'both' draws a V per half (a double casement).
export function windowCasementSegments(w, h, hingeEnd = 'lo') {
  const out = [];
  const horizontal = w >= h;
  if (horizontal) {
    out.push([0, h * 0.35, w, h * 0.35], [0, h * 0.65, w, h * 0.65]);
    const my = h / 2;
    const v = (x0, x1) => out.push([x1, 0, x0, my], [x1, h, x0, my]); // far edge x1 → hinge x0
    if (hingeEnd === 'both') { v(0, w / 2); v(w, w / 2); }
    else if (hingeEnd === 'hi') v(w, 0);
    else v(0, w);
  } else {
    out.push([w * 0.35, 0, w * 0.35, h], [w * 0.65, 0, w * 0.65, h]);
    const mx = w / 2;
    const v = (y0, y1) => out.push([0, y1, mx, y0], [w, y1, mx, y0]);
    if (hingeEnd === 'both') { v(0, h / 2); v(h, h / 2); }
    else if (hingeEnd === 'hi') v(h, 0);
    else v(0, h);
  }
  return out;
}

// Half wall: uniform same-direction diagonal hatch (a poché of solid material) —
// the inverse of the door's empty swing. Same-direction strokes distinguish it
// from insulation's alternating zigzag. No hinge (opens upward everywhere).
export function halfWallHatchSegments(w, h, count = 5) {
  const out = [];
  const horizontal = w >= h;
  for (let i = 0; i < count; i++) {
    if (horizontal) {
      const xa = (w * i) / count, xb = (w * (i + 1)) / count;
      out.push([xa, h, xb, 0]);
    } else {
      const ya = (h * i) / count, yb = (h * (i + 1)) / count;
      out.push([0, ya, w, yb]);
    }
  }
  return out;
}

// Resolve an aperture's authored `hinge` (along the wall's own axis: 'left' =
// min-coord jamb) and `swing` ('in'/'out') into the box-space `hingeEnd`
// ('lo'/'hi'/'both') and `perp` (+1/-1) the glyph functions consume — given the
// rectangle's four corners AS MAPPED INTO THE CALLER'S SPACE. Pass plan corners
// (b.x0,b.x1,b.y0,b.y1) for DXF and the AR overlay (min = lo, no flip); pass the
// page-mapped corners for the print sheet (flipped Y) so left/right and in/out
// both stay put across the flip and the three surfaces remain superposable.
// `swing:'in'` is defined as the +plan-normal side (toward +y for a horizontal
// opening, +x for a vertical one); the caller's axis orientation is inferred from
// its own corners, so no surface has to special-case the flip.
export function resolveApertureOrient(rect, sx0, sx1, sy0, sy1) {
  const hinge = rect?.hinge ?? 'left';
  const horizontal = Math.abs(sx1 - sx0) >= Math.abs(sy1 - sy0);
  let hingeEnd;
  if (hinge === 'both') hingeEnd = 'both';
  else {
    const [lo, jamb] = horizontal
      ? [Math.min(sx0, sx1), hinge === 'right' ? sx1 : sx0]
      : [Math.min(sy0, sy1), hinge === 'right' ? sy1 : sy0];
    hingeEnd = jamb === lo ? 'lo' : 'hi';
  }
  const swingIn = (rect?.swing ?? 'in') === 'in';
  // Which caller-space direction is box '+' (toward the larger mapped coord on the
  // perpendicular axis)? +plan-normal maps there only when that axis isn't flipped.
  const flip = horizontal ? (sy1 >= sy0 ? 1 : -1) : (sx1 >= sx0 ? 1 : -1);
  return { hingeEnd, perp: (swingIn ? 1 : -1) * flip };
}
