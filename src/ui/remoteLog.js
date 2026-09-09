// Dev-only remote logging: mirror console output, uncaught errors, and structured
// debug values to the dev server (POST /__log), so they can be read on the host
// machine while running in the Quest headset (where DevTools aren't reachable).
// Completely inert in production builds.

const ENABLED = import.meta.env.DEV;

function post(text) {
  if (!ENABLED) return;
  try {
    // sendBeacon is fire-and-forget and survives navigation; fall back to fetch.
    if (!navigator.sendBeacon?.('/__log', text)) {
      fetch('/__log', { method: 'POST', body: text, keepalive: true }).catch(() => {});
    }
  } catch { /* ignore */ }
}

const fmt = (a) => {
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
};

// Structured log for our own debug values.
export function rlog(...args) {
  post(args.map(fmt).join(' '));
}

export function installRemoteLog() {
  if (!ENABLED) return;
  for (const level of ['log', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      post(`[${level}] ${args.map(fmt).join(' ')}`);
    };
  }
  window.addEventListener('error', (e) => {
    post(`[error] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    post(`[reject] ${fmt(e.reason)}`);
  });
  post(`[remoteLog] installed — ${navigator.userAgent}`);
}
