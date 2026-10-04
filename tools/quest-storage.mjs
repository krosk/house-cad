#!/usr/bin/env node
// Read, back up or write house-cad's localStorage on the Quest (docs/headset-data.md).
// The AR app (APK) shares its storage with the Quest Browser, so a browser tab on the
// house-cad origin reaches the autosave and save slots through Chrome DevTools.
//
// Needs: the Quest on adb, `adb forward tcp:9333 localabstract:chrome_devtools_remote`,
// and the browser OPEN IN FRONT of the wearer (a background or unworn browser's tab never
// answers). Node 20: run with --experimental-websocket (Node 22 has WebSocket built in).
//
//   node --experimental-websocket tools/quest-storage.mjs backup <dir>
//       every house-cad:* key into <dir>/<key>.txt (loads version.json in a tab first if no
//       tab is on the origin: same origin, no app code runs, nothing is written)
//   node --experimental-websocket tools/quest-storage.mjs read <out.json> [key]
//       one key (default house-cad:autosave:v1)
//   node --experimental-websocket tools/quest-storage.mjs write <file> --base <file>
//       re-reads the autosave, refuses unless it is byte-identical to --base (what the edit
//       started from), writes <file>, reads it back. Only with the owner's explicit yes,
//       the AR app closed and no house-cad 2D page open (it would autosave over it).
//   node --experimental-websocket tools/quest-storage.mjs update-app
//       makes the headset's installed app take the build Pages serves now: asks its service
//       worker to update, then waits until the precache holds the live index-*.js. The next
//       launch opens the new build (no relaunch to download it first). Touches no house-cad:*
//       key. Run after every deploy when the headset is reachable (docs/headset-data.md).
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.QUEST_DEVTOOLS_PORT || 9333;
const ORIGIN = 'https://krosk.github.io';
const SAFE_PAGE = `${ORIGIN}/house-cad/version.json`;
const AUTOSAVE = 'house-cad:autosave:v1';
const TIMEOUT_MS = 15000;

const [cmd, a1, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
const die = (msg) => { console.error(msg); process.exit(1); };

async function pages() {
  const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
    .catch(() => die(`no DevTools on :${PORT}: adb forward tcp:${PORT} localabstract:chrome_devtools_remote`));
  return list.filter((t) => t.type === 'page');
}

function connect(ws) {
  const sock = new WebSocket(ws);
  let id = 0;
  const wait = new Map();
  sock.onmessage = (e) => { const m = JSON.parse(e.data); wait.get(m.id)?.(m); wait.delete(m.id); };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => reject(new Error(`${method} timed out: is the browser in front of the wearer?`)), TIMEOUT_MS);
    wait.set(i, (m) => { clearTimeout(timer); resolve(m); });
    sock.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.error || r.result.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails));
    return r.result.result.value;
  };
  return new Promise((resolve) => { sock.onopen = () => resolve({ call, evaluate, close: () => sock.close() }); });
}

// A tab on the house-cad origin; else the first page, navigated to version.json.
async function originTab() {
  const list = await pages();
  if (!list.length) die('no browser tab: open the Quest Browser (in front of you)');
  const onOrigin = list.find((t) => t.url.startsWith(`${ORIGIN}/house-cad/`) && !t.url.includes('ar=1'));
  const tab = await connect((onOrigin || list[0]).webSocketDebuggerUrl);
  if (!onOrigin) {
    await tab.call('Page.enable');
    await tab.call('Page.navigate', { url: SAFE_PAGE });
    await new Promise((r) => setTimeout(r, 3000));
  }
  const href = await tab.evaluate('location.href');
  if (!href.startsWith(`${ORIGIN}/house-cad/`)) die(`tab is on ${href}`);
  if (!href.endsWith('version.json')) console.warn(`warning: tab is the app (${href}); it may autosave over a write`);
  return tab;
}

const getItem = (tab, key) => tab.evaluate(`localStorage.getItem(${JSON.stringify(key)})`);

try {
  if (cmd === 'backup' && a1) {
    const tab = await originTab();
    const entries = JSON.parse(await tab.evaluate(
      "JSON.stringify(Object.keys(localStorage).filter((k) => k.startsWith('house-cad:')).map((k) => [k, localStorage.getItem(k)]))"));
    fs.mkdirSync(a1, { recursive: true });
    for (const [k, v] of entries) {
      fs.writeFileSync(path.join(a1, `${k.replace(/[^a-z0-9.-]/gi, '_')}.txt`), v);
      console.log(k.padEnd(32), v.length, 'chars');
    }
    tab.close();
  } else if (cmd === 'read' && a1) {
    const tab = await originTab();
    const v = await getItem(tab, rest[0] || AUTOSAVE);
    if (v == null) die('no such key');
    fs.writeFileSync(a1, v);
    console.log('read', v.length, 'chars');
    tab.close();
  } else if (cmd === 'write' && a1 && opt('--base')) {
    const text = fs.readFileSync(a1, 'utf8');
    JSON.parse(text); // refuse a broken file
    const base = fs.readFileSync(opt('--base'), 'utf8');
    const tab = await originTab();
    const now = await getItem(tab, AUTOSAVE);
    if (now !== base) die('the headset autosave changed since --base was read: re-read, re-apply the edit, retry');
    await tab.evaluate(`localStorage.setItem(${JSON.stringify(AUTOSAVE)}, ${JSON.stringify(text)}); 'ok'`);
    const back = await getItem(tab, AUTOSAVE);
    console.log(back === text ? `written and read back identical (${text.length} chars)` : 'MISMATCH after write');
    tab.close();
    if (back !== text) process.exit(1);
  } else if (cmd === 'update-app') {
    const html = await fetch(`${ORIGIN}/house-cad/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
    const live = html.match(/assets\/index-[\w-]+\.js/)?.[0];
    const version = await fetch(`${ORIGIN}/house-cad/version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json());
    if (!live) die('no index-*.js in the live index.html');
    const tab = await originTab();
    const cached = () => tab.evaluate(`(async () => { const c = await caches.open('workbox-precache-v2-${ORIGIN}/house-cad/');
      return (await c.keys()).map((r) => r.url).filter((u) => u.includes('/assets/index-') && u.endsWith('.js')).join(' '); })()`);
    if ((await cached()).includes(live)) {
      console.log(`already installed: ${version.build} (${live})`);
    } else {
      // Fire the update without awaiting it: install downloads the whole precache, longer than a call's timeout.
      await tab.evaluate("navigator.serviceWorker.getRegistration('/house-cad/').then((r) => { if (r) r.update(); return !!r; })")
        || die('no service worker registered: the app was never opened in this browser profile');
      let ok = false;
      for (let i = 0; i < 30 && !ok; i++) { await new Promise((r) => setTimeout(r, 3000)); ok = (await cached()).includes(live); }
      if (!ok) die(`update not installed after 90 s (live ${live}; cached ${await cached()})`);
      console.log(`installed ${version.build} (${live}); the next app launch opens it`);
    }
    tab.close();
  } else {
    die('usage: quest-storage.mjs backup <dir> | read <out> [key] | write <file> --base <file> | update-app');
  }
} catch (error) {
  die(String(error.message || error));
}
process.exit(0);
