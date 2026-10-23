#!/usr/bin/env node
// A performance run on the Quest with nobody in the headset (docs/headset-data.md
// "Performance runs"; owner, 2026-10-23). It keeps the headset awake, sets the app's test-hook
// flag (localStorage `house-cad:test-hook:v1`, mr.js `window.houseCadTest`) from a
// version.json tab, launches the installed AR app (its launch is the user activation WebXR
// needs, so it enters AR by itself on the owner's plan), then drives the app's page over
// DevTools: for each scenario it sets the AR VIEW state (3D view, Realistic, sun hour), lets
// it settle, samples frames and runs one PROJECT · PERF sweep. It never edits the plan.
// Always, even on error: closes the app (force-stop) and removes the flag. The headset stays
// awake (`--restore-sensor` restores the proximity sensor).
// Why not a browser tab: the Quest Browser takes a DevTools `userGesture` call as no real
// activation and shows an "Enter VR" chip for the wearer instead (seen 2026-10-23).
//
// Needs: the Quest on adb (skill quest-connect), the app CLOSED (it is launched here), a
// build with the hook on Pages and in the headset (quest-storage update-app). Node 20:
// --experimental-websocket.
//
//   node --experimental-websocket tools/quest-perf.mjs <outDir> [--scenarios a,b,...]
//        [--sample 10] [--scale 0.8] [--no-perf] [--restore-sensor]
//   --scale: the XR framebuffer scale for this launch (default: the browser's)
//   --view x,y[,tx,ty]: stand the headset at plan (x, y) facing (tx, ty) (default the origin),
//     on the floor the app opens on. The owner's hardest view (2026-10-23): the living room's
//     NW corner toward the origin, --view -4.4,4.2 on Ground.
//   --no-perf: frames only, no PERF sweep (a scenario then takes ~20 s instead of ~35)
//
// Scenarios: plan · 3d · real (3D + Realistic at noon) · low (3D + Realistic at 18:00).
// Output: a table on stdout, <outDir>/perf.json and <outDir>/<scenario>.perf.txt (the
// PERF report: GPU ms per layer, calls, triangles, the biggest meshes).
// What it measures is what the headset looks at where it sits: the session is placed
// around the headset (the startup placement), not registered on the room. Compare runs
// with the headset left in the same place.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const ADB = process.env.ADB || path.join(os.homedir(), '.bubblewrap/android_sdk/platform-tools/adb');
const PORT = process.env.QUEST_DEVTOOLS_PORT || 9333;
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const APP_PACKAGE = 'com.krosk.housecad';
const SAFE_PAGE = 'https://krosk.github.io/house-cad/version.json';
const HOOK_KEY = 'house-cad:test-hook:v1';
// `hide`: parts hidden for the whole sample (mr.js testPart: ceiling, walls, furniture,
// catcher, outlines, struct, finish, doorwin, device); `shadow`: Realistic's map size and
// filter. Unset = 2048 PCF, everything shown.
const SCENARIOS = {
  plan: { view3d: false, realistic: false },
  '3d': { view3d: true, realistic: false },
  real: { view3d: true, realistic: true, hour: 12 },
  low: { view3d: true, realistic: true, hour: 18 },
  '3d-noceil': { view3d: true, realistic: false, hide: ['ceiling'] },
  '3d-nowalls': { view3d: true, realistic: false, hide: ['walls'] },
  '3d-nofurn': { view3d: true, realistic: false, hide: ['furniture'] },
  '3d-bare': { view3d: true, realistic: false, hide: ['ceiling', 'walls', 'furniture'] },
  'real-nocatch': { view3d: true, realistic: true, hour: 12, hide: ['catcher'] },
  'real-basic': { view3d: true, realistic: true, hour: 12, shadow: { type: 'basic' } },
  'real-1024': { view3d: true, realistic: true, hour: 12, shadow: { size: 1024 } },
  'real-nofurn': { view3d: true, realistic: true, hour: 12, hide: ['furniture'] },
  // `furnBatch`: the furniture merged across items (mr.js buildFurnitureBatch): 'all', or a cell size in m.
  '3d-fbatch': { view3d: true, realistic: false, furnBatch: 'all' },
  '3d-fcell': { view3d: true, realistic: false, furnBatch: 3 },
  'real-fbatch': { view3d: true, realistic: true, hour: 12, furnBatch: 'all' },
};

const outDir = args[0];
const names = (opt('--scenarios') || 'plan,3d,real,low').split(',');
const sampleS = +(opt('--sample') || 10);
const scale = opt('--scale');
const sweep = !args.includes('--no-perf');
const view = opt('--view')?.split(',').map(Number);
const die = (msg) => { console.error(msg); process.exit(1); };
if (!outDir || names.some((n) => !SCENARIOS[n])) {
  die(`usage: quest-perf.mjs <outDir> [--scenarios ${Object.keys(SCENARIOS).join(',')}] [--sample s] [--restore-sensor]`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' }).trim();
// pidof exits 1 when nothing runs: '' then.
const pidof = (pkg) => { try { return adb('shell', 'pidof', pkg); } catch { return ''; } };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function connect(wsUrl) {
  const sock = new WebSocket(wsUrl);
  let id = 0;
  const wait = new Map();
  sock.onmessage = (e) => { const m = JSON.parse(e.data); wait.get(m.id)?.(m); wait.delete(m.id); };
  const call = (method, params = {}, ms = 15000) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => reject(new Error(`${method} timed out after ${ms} ms`)), ms);
    wait.set(i, (m) => { clearTimeout(timer); resolve(m); });
    sock.send(JSON.stringify({ id: i, method, params }));
  });
  // `gesture`: the call counts as a user activation (WebXR's requestSession needs one).
  const evaluate = async (expression, { ms = 15000, gesture = false } = {}) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: gesture }, ms);
    if (r.error || r.result.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 400));
    return r.result.result.value;
  };
  return new Promise((resolve, reject) => {
    sock.onopen = () => resolve({ call, evaluate, close: () => sock.close() });
    sock.onerror = () => reject(new Error(`DevTools socket failed: ${wsUrl}`));
  });
}
const list = () => fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());

let app = null; // the app's page (DevTools)
let launched = false;
let ownerRealistic = null; // the owner's saved Realistic setting, put back at the end
// On the version.json tab: no app code runs there.
async function safeTab() {
  const pages = (await list()).filter((t) => t.type === 'page');
  const t = pages.find((p) => p.url === SAFE_PAGE) || pages.find((p) => !p.url.includes('ar=1'));
  if (!t) throw new Error('no browser tab to set the flag from: open the Quest Browser once');
  const tab = await connect(t.webSocketDebuggerUrl);
  if (t.url !== SAFE_PAGE) {
    await tab.call('Page.enable');
    await tab.call('Page.navigate', { url: SAFE_PAGE });
    await sleep(3000);
  }
  return tab;
}
async function cleanup() {
  if (app) {
    if (ownerRealistic != null) {
      await app.evaluate(`window.houseCadTest.setRealistic(${ownerRealistic})`, { ms: 5000 })
        .then((v) => log('Realistic setting put back:', v)).catch((e) => log('could not put Realistic back:', e.message));
    }
    await app.evaluate('window.houseCadTest?.end?.(); true', { ms: 5000 }).catch(() => {});
    app.close();
  }
  if (launched) {
    await sleep(1500);
    adb('shell', 'am', 'force-stop', APP_PACKAGE);
    log('app closed');
  }
  // On the version.json tab (the app's page is gone by now); retried, as the browser can answer
  // late right after the app closes.
  let removed = false;
  for (let i = 0; i < 4 && !removed; i++) {
    if (i) await sleep(4000);
    const tab = await safeTab().catch(() => null);
    if (!tab) continue;
    removed = await tab.evaluate(`localStorage.removeItem(${JSON.stringify(HOOK_KEY)}); localStorage.getItem(${JSON.stringify(HOOK_KEY)}) === null`, { ms: 15000 })
      .catch(() => false);
    tab.close();
  }
  log(removed ? 'hook flag removed' : 'COULD NOT REMOVE the hook flag: remove house-cad:test-hook:v1 by hand');
  if (args.includes('--restore-sensor')) {
    adb('shell', 'am', 'broadcast', '-a', 'com.oculus.vrpowermanager.automation_disable');
    log('proximity sensor restored');
  }
}

try {
  if (pidof(APP_PACKAGE).length) die('the AR app is running: close it first');
  adb('shell', 'am', 'broadcast', '-a', 'com.oculus.vrpowermanager.prox_close'); // awake, as if worn
  adb('forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote');
  if (!pidof('com.oculus.browser').length) {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', SAFE_PAGE, 'com.oculus.browser');
    await sleep(6000);
  }
  const flagTab = await safeTab();
  const flag = scale ? JSON.stringify({ scale: +scale }) : '1';
  await flagTab.evaluate(`localStorage.setItem(${JSON.stringify(HOOK_KEY)}, ${JSON.stringify(flag)}); true`);
  flagTab.close();
  adb('shell', 'monkey', '-p', APP_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  launched = true;
  log('app launched');
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(1000);
    const page = (await list()).find((t) => t.type === 'page' && t.url.includes('ar=1'));
    if (!page) continue;
    app ??= await connect(page.webSocketDebuggerUrl);
    ready = await app.evaluate('!!window.houseCadTest').catch(() => false);
  }
  if (!ready) throw new Error('no test hook in the app after 40 s (an old build? run quest-storage update-app)');
  const first = await app.evaluate('window.houseCadTest.state()');
  ownerRealistic = first.realistic;
  log('app loaded', JSON.stringify({ build: first.build, realistic: first.realistic }));
  let state = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    state = await app.evaluate('window.houseCadTest.state()');
    if (state.presenting && state.placed) break;
  }
  if (!state?.presenting) throw new Error('AR did not start in 30 s (the app auto-enters AR on launch)');
  log('AR on', JSON.stringify({ placed: state.placed, floor: state.floor, framebuffer: state.framebuffer, scale: state.scale, shadowMapOn: state.shadowMapOn, lights: state.lights, foveation: state.foveation, frameRate: state.frameRate }));

  if (view) {
    const [x, y, tx = 0, ty = 0] = view;
    log('view from', JSON.stringify({ x, y, toward: [tx, ty] }), JSON.stringify(
      await app.evaluate(`window.houseCadTest.viewFrom(${JSON.stringify({ x, y, toward: { x: tx, y: ty } })})`)));
  }
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const name of names) {
    const s = SCENARIOS[name];
    await app.evaluate(`(() => { const h = window.houseCadTest; h.set3d(${s.view3d}); h.setRealistic(${s.realistic});
      h.hide(${JSON.stringify(s.hide || [])}); h.setFurnitureBatch?.(${JSON.stringify(s.furnBatch || 'off')}); h.setShadow(${JSON.stringify({ size: 2048, type: 'pcf', ...s.shadow })});
      ${s.hour != null ? `h.setSunHour(${s.hour});` : ''} return true; })()`);
    const moves0 = (await app.evaluate('window.houseCadTest.state()')).shadowMoves;
    log(name, 'settling');
    await sleep(s.realistic ? 10000 : 5000); // textures, photo atlases, shader compiles
    const frames = await app.evaluate(`window.houseCadTest.sample(${sampleS * 1000})`, { ms: sampleS * 1000 + 15000 });
    const st = await app.evaluate('window.houseCadTest.state()');
    const shadowMoves = st.shadowMoves - moves0; // over the settle + sample
    let report = null;
    if (sweep) {
      await app.evaluate('window.houseCadTest.setPerf(true)');
      for (let i = 0; i < 60 && !report; i++) { await sleep(1000); report = await app.evaluate('window.houseCadTest.perfReport()'); }
      await app.evaluate('window.houseCadTest.setPerf(false)');
    }
    if (report) fs.writeFileSync(path.join(outDir, `${name}.perf.txt`), report);
    const gpuAll = report?.match(/^all: ([\d.]+) ms/m)?.[1] ?? null;
    results.push({ name, ...s, ...frames, gpuAll: gpuAll && +gpuAll, shadowMoves, sun: st.sun, programs: st.programs, textures: st.textures, geometries: st.geometries });
    log(name, JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(outDir, 'perf.json'), JSON.stringify({ state, view, scale, results }, null, 1));
  console.log(`\n${'scenario'.padEnd(12)}   fps   p50   p95  worst  >14ms    js  render  gpu(all)  calls    tris  shadowMoves`);
  for (const r of results) {
    console.log([r.name.padEnd(12), String(r.fps).padStart(5), String(r.p50).padStart(5), String(r.p95).padStart(5),
      String(r.worst).padStart(6), String(r.over14ms).padStart(6), String(r.js).padStart(5), String(r.render).padStart(7),
      String(r.gpuAll ?? '-').padStart(9), String(r.calls).padStart(6), String(r.tris).padStart(7), String(r.shadowMoves).padStart(12)].join(' '));
  }
} catch (error) {
  console.error('FAILED:', error.message || error);
  process.exitCode = 1;
} finally {
  await cleanup().catch((e) => console.error('cleanup:', e.message));
  process.exit(process.exitCode || 0);
}
