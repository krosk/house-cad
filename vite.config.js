import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// A build stamp shown on the in-headset HUD: git short-hash + UTC build time.
// It lets you confirm on-device that a fresh deploy actually loaded (vs. a stale
// service-worker cache) — the stamp changes only when the site is rebuilt.
function buildId() {
  let hash = 'nogit';
  try { hash = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* not a git checkout */ }
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}-${p(t.getUTCHours())}${p(t.getUTCMinutes())}`;
  return `${hash} ${stamp}Z`;
}

// Dev-only: a POST /__log endpoint so the app running in the Quest browser can
// mirror its console/errors/debug values back to a file on this machine
// (quest-debug.log). On-headset DevTools aren't easily reachable, and the Quest
// already talks to this dev server, so this is the simplest remote-logging path.
function questLogger() {
  const logPath = 'quest-debug.log';
  return {
    name: 'quest-logger',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          fs.appendFile(logPath, `[${new Date().toISOString()}] ${body}\n`, () => {});
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // Relative base for production so the build works under GitHub Pages'
  // project-site subpath (https://<user>.github.io/<repo>/) without hard-coding
  // the repo name. Dev server stays at '/'.
  base: command === 'build' ? './' : '/',

  // Inject the build stamp as a compile-time constant (see mr.js HUD).
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },

  // DEV (serve): basic-ssl serves https with a self-signed cert. WebXR
  // (immersive-ar on the Quest) requires a secure context, and the Quest reaches
  // the dev server by LAN IP — which is only "secure" over https. The Quest
  // browser will warn about the self-signed cert once; accept it to proceed.
  // questLogger adds the /__log endpoint.
  //
  // BUILD: VitePWA turns the deployed site into an INSTALLABLE, OFFLINE PWA — the
  // only path that keeps WebXR AR on Quest (a WebView/TWA APK can't enter
  // immersive-ar). Workbox precaches the whole build so, once installed from the
  // https Pages URL, it runs with no network. The PWA is intentionally NOT in dev
  // (a service worker would fight HMR and the self-signed-cert flow).
  plugins: command === 'serve'
    ? [basicSsl(), questLogger()]
    : [VitePWA({
        registerType: 'autoUpdate',
        // Relative paths so it stays portable under the GitHub Pages subpath
        // (same reason base is './'). start_url/scope resolve to the app root.
        includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          name: 'House CAD',
          short_name: 'House CAD',
          description: 'Parametric 2.5D CAD for house massing, with on-site MR survey on Quest 3.',
          theme_color: '#0f1218',
          background_color: '#0f1218',
          display: 'standalone',
          orientation: 'any',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // The three.js chunk exceeds Workbox's 2 MiB default — raise the cap so
          // it's precached (otherwise the app wouldn't be fully offline).
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      })],

  // host: true exposes the dev server on the LAN so you can open it in the Quest
  // 3 browser at the printed Network URL (now https://).
  server: {
    host: true,
    port: 5173,
  },
}));
