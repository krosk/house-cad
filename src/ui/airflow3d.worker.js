// The 3D floor air solve off the page (core/airflow3d.js): seconds of work that would freeze AR.
import { solveFloor3d } from '../core/airflow3d.js';

self.onmessage = (e) => {
  const { id, input } = e.data;
  try {
    let last = 0;
    const out = solveFloor3d(input, (phase, f) => {
      if (f - last < 0.02 && f < 1) return; last = f;
      self.postMessage({ id, phase, progress: f });
    });
    self.postMessage({ id, out }, out ? [out.vol.buffer, out.age.buffer] : []);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
