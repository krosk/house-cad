import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Relative base for production so the build works under GitHub Pages'
  // project-site subpath (https://<user>.github.io/<repo>/) without hard-coding
  // the repo name. Dev server stays at '/'.
  base: command === 'build' ? './' : '/',

  // host: true exposes the dev server on the LAN. Handy later for opening the
  // app in the Quest 3 browser (WebXR). WebXR needs https on-device, which we
  // will add in the WebXR phase; for desktop dev http is fine.
  server: {
    host: true,
    port: 5173,
  },
}));
