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
  if (horizontal) {
    const r = reach ?? w, sy = perp >= 0 ? 0 : h, dir = perp >= 0 ? 1 : -1;
    if (hingeEnd === 'hi') {
      out.push([w, sy, w, sy + dir * r]);
      arcSegments(w, sy, r, dir * Math.PI / 2, Math.PI, steps, out);
    } else {
      out.push([0, sy, 0, sy + dir * r]);
      arcSegments(0, sy, r, dir * Math.PI / 2, 0, steps, out);
    }
  } else {
    const r = reach ?? h, sx = perp >= 0 ? 0 : w, dir = perp >= 0 ? 1 : -1;
    if (hingeEnd === 'hi') {
      out.push([sx, h, sx + dir * r, h]);
      arcSegments(sx, h, r, dir >= 0 ? 0 : Math.PI, -Math.PI / 2, steps, out);
    } else {
      out.push([sx, 0, sx + dir * r, 0]);
      arcSegments(sx, 0, r, dir >= 0 ? 0 : Math.PI, Math.PI / 2, steps, out);
    }
  }
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

// Resolve a rectangle's `hinge` ('left'|'right'|'both') to a box 'lo'/'hi'/'both'
// for a caller whose box coordinates run the SAME way as plan (min = lo): DXF and
// the AR floor overlay. The print page (flipped Y) resolves lo/hi itself.
export function hingeEndFromPlan(hinge) {
  if (hinge === 'both') return 'both';
  return hinge === 'right' ? 'hi' : 'lo';
}
