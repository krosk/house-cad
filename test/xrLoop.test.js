import { test } from 'node:test';
import assert from 'node:assert/strict';
import { View3D } from '../src/ui/view3d.js';

// During AR only the XR session's frames may render (view3d.js _animate). three's window loop,
// restarted by View3D's sessionstart setAnimationLoop, calls _animate with no frame: it used to
// render the whole scene again, unhidden, ~6 times per XR frame on the Quest (2026-10-23).
function stub(presenting) {
  const renders = [];
  const self = {
    renderer: { xr: { isPresenting: presenting }, render: (scene, camera) => renders.push(camera) },
    scene: {}, camera: {}, cameraTransition: null, tiltEnabled: false, navigationMode: 'overview',
    realisticEnabled: false, composer: null, ruler: null,
    xrTiming: { js: 0, gl: 0, frames: 0 }, xrTimingTotal: { js: 0, gl: 0, frames: 0 },
    onXRFrame: () => {}, onXRAfterRender: () => {},
  };
  return { self, renders };
}

test('AR: the window loop renders nothing, the XR frame renders once', () => {
  const { self, renders } = stub(true);
  View3D.prototype._animate.call(self, 16); // window rAF: no XRFrame
  assert.equal(renders.length, 0);
  View3D.prototype._animate.call(self, 16, {}); // XR frame
  assert.equal(renders.length, 1);
  assert.equal(self.xrTimingTotal.frames, 1);
});

test('desktop: the window loop still renders', () => {
  const { self, renders } = stub(false);
  View3D.prototype._animate.call(self, 16);
  assert.equal(renders.length, 1);
});
