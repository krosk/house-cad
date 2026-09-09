import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';

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

  // basic-ssl serves the dev server over https with a self-signed cert. WebXR
  // (immersive-ar on the Quest) requires a secure context, and the Quest reaches
  // the dev server by LAN IP — which is only "secure" over https. The Quest
  // browser will warn about the self-signed cert once; accept it to proceed.
  // questLogger adds the /__log endpoint. Neither is applied to `build`.
  plugins: command === 'serve' ? [basicSsl(), questLogger()] : [],

  // host: true exposes the dev server on the LAN so you can open it in the Quest
  // 3 browser at the printed Network URL (now https://).
  server: {
    host: true,
    port: 5173,
  },
}));
