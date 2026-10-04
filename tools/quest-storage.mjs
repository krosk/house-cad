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
    const r = await call('Runtime.evaluate', { expression, returnByValue: true });
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
  } else {
    die('usage: quest-storage.mjs backup <dir> | read <out> [key] | write <file> --base <file>');
  }
} catch (error) {
  die(String(error.message || error));
}
process.exit(0);
