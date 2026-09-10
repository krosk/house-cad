# Sideloading House CAD to Quest as an APK (Bubblewrap)

The Meta Quest Browser does **not** install PWAs from the browser
(`beforeinstallprompt` never fires — confirmed by web.dev and on-device). The
only way to a real installed, offline, standalone app is to package the PWA into
an APK with Bubblewrap and **sideload via adb**. No Meta Horizon Store needed.

App is deployed at `https://krosk.github.io/house-cad/` with a valid manifest +
service worker (the inputs Bubblewrap needs).

## WORKING recipe (verified on a Quest 3, session 7)

Packaging: **`horizonOSAppMode: "immersive"`** — NOT 2D.
- A **2D-mode** APK opens the flat editor but `immersive-ar` is unsupported there
  (START AR reports "AR not supported"). Confirmed on-device.
- An **immersive-mode** APK launches straight into an immersive session, showing
  only a splash until the web page starts one — so the app must call
  `requestSession('immersive-ar')` on load.

Two things that make the immersive APK actually enter AR:
1. **`startUrl: "/house-cad/?ar=1"`** in `twa-manifest.json`. The web app treats
   `?ar=1` as "auto-enter AR on load" (see `src/ui/mr.js`); desktop web (no `?ar`)
   keeps the manual START AR button.
2. The auto-AR code calls `requestSession` **directly** — do NOT gate it on
   `navigator.xr.isSessionSupported('immersive-ar')`. In the immersive shell that
   check returns false/unreliable; gating on it bails out and the launch splash
   never dismisses. Retry a few times for XR-device readiness. The app-icon
   launch supplies the required user activation.

Consequence: the immersive APK is **AR-only** (no 2D editor). Author floors/plans
in the desktop web app. OPEN: whether the installed app shares localStorage with
the Quest Browser at the same origin, or needs JSON transfer — unverified.

Because the APK just loads the live site, **web-app changes need only a Pages
deploy + an app cache refresh** (`adb shell pm clear com.krosk.housecad`), NOT an
APK rebuild. Rebuild the APK only when `twa-manifest.json` (mode, startUrl, icons,
version) changes.

---

## 1. Host Digital Asset Links at the ORIGIN ROOT (required)

An immersive PWA won't launch without origin verification, and it must live at
the domain root — NOT under `/house-cad/`:

    https://krosk.github.io/.well-known/assetlinks.json

Since this app is a *project* Pages site, create a **user Pages repo** to serve
the root:

1. Create a new public repo named exactly **`krosk.github.io`**.
2. Add the file `.well-known/assetlinks.json` (use `assetlinks.template.json`
   here, with the real fingerprint from step 2 filled in).
3. Enable Pages (Source: deploy from branch, root). It serves at
   `https://krosk.github.io/`, so the file resolves at the URL above.
4. Verify: `curl https://krosk.github.io/.well-known/assetlinks.json`

`package_name` must match what you pick in step 2 (default here:
`com.krosk.housecad`). The fingerprint is filled after the keystore exists.

---

## 2. Build the APK with Bubblewrap (on your machine)

Prereqs: Node 18+ (have 20), Quest in Developer Mode, `adb`. Bubblewrap
auto-downloads a JDK + Android SDK (incl. platform-tools/adb) on first run — on
this machine they live under `~/.bubblewrap/`:
- adb:     `~/.bubblewrap/android_sdk/platform-tools/adb`
- keytool: `~/.bubblewrap/jdk/jdk-17.0.11+9/bin/keytool`

    npm install --global @meta-quest/bubblewrap-cli

    mkdir ~/house-cad-apk && cd ~/house-cad-apk
    bubblewrap init --manifest=https://krosk.github.io/house-cad/manifest.webmanifest --metaquest

During init:
- App mode:            immersive   (NOT 2D — see working recipe above)
- Package id:          com.krosk.housecad   (unique; reuse forever for updates)
- Display:             standalone
- Horizon Billing:     no
- Signing key:         create a new one (KEEP the keystore + alias + passwords)

Then set `startUrl` to `/house-cad/?ar=1` in `twa-manifest.json` and
`bubblewrap update`.

Build (BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD env vars avoid the
prompt; otherwise it prompts):

    bubblewrap build          # -> app-release-signed.apk

Get the SHA-256 fingerprint from the SIGNED APK (no keystore password needed) and
generate assetlinks (populates twa-manifest fingerprints, writes assetlinks.json):

    ~/.bubblewrap/jdk/jdk-17.0.11+9/bin/keytool -printcert -jarfile app-release-signed.apk | grep SHA256
    bubblewrap fingerprint add <SHA-256>
    bubblewrap fingerprint generateAssetLinks --output=assetlinks.json
    # copy assetlinks.json into the krosk.github.io repo at .well-known/ (step 1)
    # NOTE: add a .nojekyll file in that repo or Jekyll strips the dot-folder -> 404

---

## 3. Sideload

    ADB=~/.bubblewrap/android_sdk/platform-tools/adb
    $ADB devices                              # allow USB debugging in-headset
    $ADB install -r ./app-release-signed.apk

Launch from **Unknown Sources** in the headset app library. After a web redeploy,
`$ADB shell pm clear com.krosk.housecad` forces the app to fetch the fresh build.

---

## Updating later

- Rebuild with the **same** package id and the **same** signing key.
- If the web app changed, `bubblewrap update` then `bubblewrap build`.
- The web content itself updates whenever you push to `main` (Pages) — the APK
  is just the shell loading `https://krosk.github.io/house-cad/`.

## Notes / gotchas

- The APK is a thin TWA shell; it loads the live web app, so the app still needs
  network on first run to cache (service worker) before it works offline.
- The Quest app has its own storage — move a model between desktop and Quest via
  the app's JSON Save/Load, not automatic sync.
- assetlinks `sha256_cert_fingerprints` is an array; add a second entry if you
  ever ship an upload key vs. a local key.
