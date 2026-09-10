# House CAD → Meta Quest 3: installable offline AR APK

Complete, reproducible steps for turning the web app into a sideloaded, offline,
**immersive-AR** Quest app. Verified end-to-end on a Quest 3 (session 7).

## Why this shape

- The **Meta Quest Browser cannot install a PWA from the browser** —
  `beforeinstallprompt` never fires (confirmed by web.dev and on-device). "Add to
  Home" is only a shortcut. So a real installed app must be **packaged with
  Bubblewrap (TWA) and sideloaded via `adb`**. No Meta Horizon Store needed.
- The app must be packaged **`horizonOSAppMode: "immersive"`**, NOT `2D`:
  - a **2D** APK opens the flat editor but `immersive-ar` is unsupported there
    (START AR → "AR not supported");
  - an **immersive** APK launches straight into an XR session, showing only a
    splash until the page calls `requestSession('immersive-ar')`.
- Consequence: the immersive APK is **AR-only** (no 2D editor UI). Author
  floors/plans in the desktop web app.
  OPEN: whether the installed app shares localStorage with the Quest Browser at
  the same origin, or needs JSON Save/Load transfer — unverified.

## This machine (Steam Deck / SteamOS)

- Node **v20** via nvm; no system `java`/`adb`. Bubblewrap downloads its own JDK +
  Android SDK on first run, under `~/.bubblewrap/`:
  - adb:     `~/.bubblewrap/android_sdk/platform-tools/adb`
  - keytool: `~/.bubblewrap/jdk/jdk-17.0.11+9/bin/keytool`
- Bubblewrap project lives in `~/house-cad-apk/` (separate from this repo).
- Signing passwords kept in `~/.bw_pw` (chmod 600) for non-interactive rebuilds.

Identifiers used: package `com.krosk.housecad`, origin `https://krosk.github.io`,
start URL `/house-cad/?ar=1`.

---

## Part A — Web app must be an installable PWA (already in this repo)

Bubblewrap needs a hosted manifest + service worker. Provided by `vite-plugin-pwa`
(build-only) in `vite.config.js`, which emits `manifest.webmanifest` + `sw.js` and
precaches the build for offline. Icons in `public/` (`pwa-192/512`, maskable,
apple-touch, favicon), generated from `public/icon.svg` via `rsvg-convert`.

Deploy: push to `main` → GitHub Actions builds and publishes to
`https://krosk.github.io/house-cad/`. Verify:

    curl -s https://krosk.github.io/house-cad/manifest.webmanifest
    curl -s -o /dev/null -w "%{http_code}\n" https://krosk.github.io/house-cad/sw.js

### Auto-enter AR (`src/ui/mr.js`)

The desktop keeps the manual **START AR** button. When the URL has `?ar=1` (only
the APK's start URL), the app auto-enters AR on load:

- call `navigator.xr.requestSession('immersive-ar', sessionInit)` **directly** —
  do NOT gate on `isSessionSupported('immersive-ar')` (returns false/unreliable in
  the immersive shell; gating leaves the splash up forever);
- retry a few times (700 ms) for XR-device readiness;
- the app-icon launch supplies the required user activation.

---

## Part B — Host Digital Asset Links at the ORIGIN ROOT (required)

An immersive PWA won't launch unless the origin is verified, and the file must be
at the domain root, NOT under `/house-cad/`:

    https://krosk.github.io/.well-known/assetlinks.json

This app is a *project* Pages site, so serve the root from a **user Pages repo**:

1. Create a public repo named exactly **`krosk.github.io`** (empty — no README).
2. Add `.well-known/assetlinks.json` (from `packaging/assetlinks.template.json`,
   fingerprint filled in Part D).
3. **Add an empty `.nojekyll` file at the repo root** — otherwise Jekyll strips
   the `.well-known` dot-folder from the Pages build → 404.
4. Enable Pages: Settings → Pages → Deploy from branch → `main` / root.
5. Verify (Pages can take 1–2 min):

       curl -s https://krosk.github.io/.well-known/assetlinks.json

`package_name` must equal the APK package (`com.krosk.housecad`).

Local staging used here (then create the GitHub repo and push):

    mkdir -p ~/krosk.github.io/.well-known
    cp ~/house-cad-apk/assetlinks.json ~/krosk.github.io/.well-known/assetlinks.json
    touch ~/krosk.github.io/.nojekyll
    cd ~/krosk.github.io && git init -b main && git add -A && git commit -m "assetlinks"
    git remote add origin git@github.com:krosk/krosk.github.io.git && git push -u origin main

---

## Part C — Initialise the Bubblewrap project

    npm install --global @meta-quest/bubblewrap-cli

    mkdir ~/house-cad-apk && cd ~/house-cad-apk
    bubblewrap init --manifest=https://krosk.github.io/house-cad/manifest.webmanifest --metaquest
    # First run asks to install the JDK + Android SDK -> Yes (few hundred MB).

Answer the init prompts:
- App mode (`horizonOSAppMode`): **immersive**
- Package id: **com.krosk.housecad**   (unique; reuse forever for updates)
- Display: **standalone**
- Horizon Billing / in-app purchases: **no**
- USE_SCENE permission: **no** (app uses only local-floor + anchors; no room scan)
- Signing key: **create a new one** — KEEP the keystore, alias (`android`), and
  passwords.

Then point the APK at the auto-AR URL and regenerate the Android project:

    # edit ~/house-cad-apk/twa-manifest.json:  "startUrl": "/house-cad/?ar=1"
    bubblewrap update      # bumps appVersionCode, regenerates the Android project

---

## Part D — Build, fingerprint, publish assetlinks

Store the signing passwords once (kept for future rebuilds):

    umask 077; cat > ~/.bw_pw <<'EOF'
    BUBBLEWRAP_KEYSTORE_PASSWORD=yourKeystorePass
    BUBBLEWRAP_KEY_PASSWORD=yourKeyPass
    EOF

Build non-interactively (env vars are read by Bubblewrap; no prompt):

    cd ~/house-cad-apk && set -a && . ~/.bw_pw && set +a && bubblewrap build
    # -> app-release-signed.apk  (+ app-release-bundle.aab)

Read the SHA-256 straight from the SIGNED APK (no keystore password needed),
record it, and generate the assetlinks file:

    KT=~/.bubblewrap/jdk/jdk-17.0.11+9/bin/keytool
    $KT -printcert -jarfile app-release-signed.apk | grep -i SHA256
    bubblewrap fingerprint add <SHA-256> --name=housecad-signing
    bubblewrap fingerprint generateAssetLinks --output=assetlinks.json

Copy `assetlinks.json` into the `krosk.github.io` repo (Part B) and push, then
confirm it resolves at `https://krosk.github.io/.well-known/assetlinks.json`.

(The fingerprint for THIS keystore is also stored in `twa-manifest.json`
→ `fingerprints[]`.)

---

## Part E — Sideload and run

    ADB=~/.bubblewrap/android_sdk/platform-tools/adb
    $ADB devices                          # accept "Allow USB debugging" in-headset
    # If several transports for one headset are listed, target one:
    #   $ADB -s 192.168.1.36:40313 ...
    $ADB install -r ./app-release-signed.apk

In the headset: **App Library → Unknown Sources → House CAD**. It should launch
straight into passthrough AR (auto-AR).

Launch / relaunch from the command line:

    $ADB shell monkey -p com.krosk.housecad -c android.intent.category.LAUNCHER 1
    $ADB shell am force-stop com.krosk.housecad      # to relaunch clean

---

## Part F — Iterating

- **Web-app change** (any `src/**` change): push to `main` (Pages redeploys). The
  APK loads the live site, so **no rebuild needed** — just refresh its cache so
  the service worker fetches the new build:

      $ADB shell pm clear com.krosk.housecad     # wipes cache+storage; next launch refetches

- **APK change** (`twa-manifest.json`: mode, startUrl, icons, version): `bubblewrap
  update` → `bubblewrap build` (Part D) → `adb install -r`. Always same package id
  + same signing key.

- Confirm the live build before testing the headset:

      js=$(curl -s https://krosk.github.io/house-cad/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
      curl -s "https://krosk.github.io/house-cad/$js" | grep -c "SOME_MARKER_FROM_YOUR_CHANGE"

---

## Gotchas we actually hit

- **`beforeinstallprompt` never fires** in Quest Browser → no in-browser install.
- **2D app mode can't enter `immersive-ar`** → must be `immersive`.
- **Immersive shows only a splash** until the page starts a session → need auto-AR.
- **Gating auto-AR on `isSessionSupported` breaks it** (false/unreliable) → call
  `requestSession` directly + retry.
- **Jekyll strips `.well-known`** on Pages → add `.nojekyll`.
- **`assetlinks.json` must be at the ORIGIN ROOT**, not the project subpath →
  separate `krosk.github.io` user-site repo.
- **Release TWA gives no web console** (`console.*` not in logcat; `chrome://
  inspect` needs the Oculus Browser's Remote Web Inspector enabled). Debug the
  page in the plain Quest Browser instead, or enable the inspector.
- **Service-worker cache** can serve a stale build in the APK after a redeploy →
  `pm clear` (or wait for the autoUpdate SW to swap on a later launch).
- **Multiple adb transports** for one headset → pass `-s <serial>`.
- Get the fingerprint from the **signed APK** (`keytool -printcert -jarfile`) — no
  keystore password required, unlike reading the keystore directly.

## Distribution note

Sideload only (no Store). To distribute more widely you would submit the AAB to
the Meta Horizon Store — deliberately out of scope here.
