// The 3D viewport: a Three.js scene with constrained overview/POV navigation.
// Call setGeometry() whenever the model changes to replace the house mesh.

import { onceByKey } from './onceByKey.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { buildProceduralFurniture, isProcedural } from './proceduralFurniture.js';
import { assembleKitchenUnit, isKitchenUnit } from './kitchenUnits.js';
import { buildDoorProduct } from './doorProducts.js';
import { buildDeviceProduct } from './deviceProducts.js';
import { buildWindowProduct } from './windowProducts.js';
import { MARKER_FACE } from '../core/architectural3d.js';
import { applyFinishDetail } from './finishTextures.js';
import { paintFinish, loadPhotoFinish } from './textureWorker.js';
import { paintedTexture, startDeferredTextures } from './paintedTexture.js';
import { loadFurnitureCatalog } from './furnitureCatalog.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { sunPosition, sunDirection, loadSky } from './realism.js';
import { hasPhotoFinish, patchPhotoMaterial } from './photoFinishes.js';
import { Ruler3D } from './ruler3d.js';
import { buildPlanLayers, disposePlanLayer, MODEL_PIPE_COLOR, PIPE_SERVICE_COLOR } from './planLayers3d.js';
import { PIPE_ANCHOR_SERVICES } from '../core/pipeAnchors.js';

// Desktop/mobile camera (view-only, never saved): the overview's vertical FOV, and the
// narrowest horizontal FOV POV allows on a portrait screen.
const OVERVIEW_FOV = 50;
const POV_MIN_HFOV = 65;
// DeviceOrientationControls constants: -90° about X (camera looks out the back of the
// screen, not up), and the axes for the screen-angle and yaw-offset turns.
const TILT_Q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const TILT_Z = new THREE.Vector3(0, 0, 1);
const TILT_Y = new THREE.Vector3(0, 1, 0);

// The default floor wood and wall plaster, painted in the texture worker (painters.js
// `viewWood` / `viewPlaster`) once the 3D model is first built (deferred); the flat
// placeholder colour shows until they arrive.
function viewTexture(name, size, { repeat = 1, color = true, anisotropy = 1, placeholder } = {}) {
  const texture = paintedTexture(name, { relief: !color }, size, size, { color, placeholder, variant: `${repeat}`, deferred: true });
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = anisotropy;
  return texture;
}

function woodTextures(anisotropy) {
  return {
    map: viewTexture('viewWood', 512, { anisotropy, placeholder: 0xb98550 }),
    bumpMap: viewTexture('viewWood', 512, { color: false, anisotropy, placeholder: 0x888888 }),
  };
}

function plasterTextures(anisotropy) {
  return {
    map: viewTexture('viewPlaster', 256, { repeat: 3, anisotropy, placeholder: 0xefeeeb }),
    bumpMap: viewTexture('viewPlaster', 256, { repeat: 3, color: false, anisotropy, placeholder: 0x808080 }),
  };
}

export class View3D {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d23);

    const { clientWidth: w, clientHeight: h } = container;
    this.camera = new THREE.PerspectiveCamera(OVERVIEW_FOV, w / Math.max(1, h), 0.1, 1000);
    this.camera.position.set(10, 10, 14);

    // alpha:true so an immersive-ar session can show the real world through the
    // canvas (we null out scene.background in MR). Opaque on desktop regardless.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.xr.enabled = true; // harmless on desktop; required for WebXR
    container.appendChild(this.renderer.domElement);

    // Optional per-frame hook, set by the MR module; receives (time, XRFrame).
    this.onXRFrame = null;
    this.onXRAfterRender = null; // runs right after each XR frame's render (mr.js restores what it hid)
    this.xrTiming = { js: 0, gl: 0, frames: 0 }; // summed ms per XR frame; see _animate
    this.xrTimingTotal = { js: 0, gl: 0, frames: 0 }; // the same, never reset (mr.js test hook)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // Kept for the MR lifecycle, which temporarily saves/disables this field.
    // Desktop navigation below is intentionally limited to two custom modes.
    this.controls.enabled = false;
    this.controls.target.set(0, 1, 0);

    // OVERVIEW: fixed top-down camera; dragging pans on the plan X/Y plane, two fingers
    // (or the wheel) zoom, and a tap on a floor enters POV there.
    // POV: eye height; dragging (or phone tilt) looks around, a tap on a floor walks
    // there, and the Overview button (exitPov) goes back. Nothing here enters
    // project/share data.
    this.navigationMode = 'overview';
    this.eyeHeight = 1.65;
    this.viewYaw = 0;
    this.viewPitch = 0;
    this.viewPointer = null;
    this.viewRaycaster = new THREE.Raycaster();
    this.viewNdc = new THREE.Vector2();
    this._viewDirection = new THREE.Vector3();
    this.overviewPose = null;
    this.overviewDistance = 10;
    this.overviewFitDistance = 10; // the framed distance; pinch/wheel zoom is clamped around it
    this.overviewPlaneY = 0; // the plan plane the overview looks at (top of the visible house)
    this.overviewPortrait = null; // aspect < 1 when last framed; flipping it re-frames
    this.cameraTransition = null;
    this.viewPointers = new Map(); // active pointers, for the two-finger overview gesture
    this.viewGesture = null; // { dist, midX, midY } while two fingers pinch/pan the overview
    // Phone tilt look (POV only, opt-in; iOS asks permission on the button tap).
    this.tiltEnabled = false;
    this.tiltYawOffset = 0;
    this.tiltRecalibrate = true;
    this._deviceOrientation = null;
    this._onDeviceOrientation = (event) => {
      if (event.alpha == null) return;
      this._deviceOrientation = { alpha: event.alpha, beta: event.beta, gamma: event.gamma };
    };
    // Called with the new mode ('overview' | 'pov' | 'orbit' | 'plan') when it changes.
    this.onNavigationChange = null;

    // Lighting.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.9);
    this.scene.add(hemi);
    this.hemi = hemi;
    this.reflectionsEnabled = false;
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(12, 20, 8);
    this.sun.castShadow = false;
    this.sun.visible = true; // retained in basic mode: directional shading is cheap and reveals corners
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 30;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target); // aimed at the house in Realistic (_applySun)
    this.lightingEnabled = false;
    // Realistic (docs/realism.md): real sun + photographed sky + ambient occlusion.
    this.realisticEnabled = false;
    this.sunDate = new Date();
    this.sky = null; // { texture, envTexture, sunAngle } once downloaded
    this.composer = null;
    this.onSkyStatus = null; // (text) → main.js shows download/failure state

    // Ground grid + subtle floor to catch shadows. Kept as fields so the MR
    // module can hide them during passthrough.
    this.grid = new THREE.GridHelper(60, 60, 0x3a4150, 0x2a2f38);
    this.scene.add(this.grid);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.001;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.material = new THREE.MeshStandardMaterial({
      color: 0xc9d3e0,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const wood = woodTextures(anisotropy);
    const plaster = plasterTextures(anisotropy);
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: wood.map,
      bumpMap: wood.bumpMap,
      bumpScale: 0.012,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: plaster.map,
      bumpMap: plaster.bumpMap,
      bumpScale: 0.006,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    // Half walls see-through (owner, 2026-10-10: to look at what stands inside them,
    // e.g. a WC frame): the same plaster, faint, not hiding what is behind it.
    this.halfWallGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8e4ec, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      transparent: true, opacity: 0.18, depthWrite: false,
    });
    this.halfWallsSeeThrough = false;
    // Floors see-through (owner, 2026-10-15: to see the pipes under them): the slab faint, its finishes hidden.
    this.floorGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8dcc8, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      transparent: true, opacity: 0.18, depthWrite: false,
    });
    this.floorsSeeThrough = false;
    // Ceiling see-through (owner, 2026-10-16: to see the ducts above it in POV): the ceiling faint, its finishes hidden.
    this.ceilingGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4f4f4, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      transparent: true, opacity: 0.18, depthWrite: false,
    });
    this.ceilingsSeeThrough = false;
    // 🚪 Doors (owner, 2026-10-20: to see where handles clash): while on, a tap on a door opens or
    // closes it. Every door is built both ways and shows one; `closedDoors` holds `floorId:rectId`
    // keys, session-only and kept across rebuilds. View-only: nothing reaches the project.
    this.doorsToggleEnabled = false;
    this.closedDoors = new Set();
    this.doorMaterial = new THREE.MeshStandardMaterial({
      color: 0xa9794f,
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.windowMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9ed8ea,
      roughness: 0.12,
      metalness: 0,
      transmission: 0.55,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.outlineMaterial = new THREE.LineBasicMaterial({
      color: 0x59616b,
      transparent: true,
      opacity: 0.72,
      depthTest: true,
      depthWrite: false,
    });
    this.beamMaterial = new THREE.MeshStandardMaterial({ color: 0xa0703f, roughness: 0.8 }); // BEAM zones: plain wood
    this.stairMaterial = new THREE.MeshStandardMaterial({
      color: 0xc7955f,
      map: wood.map,
      bumpMap: wood.bumpMap,
      bumpScale: 0.008,
      roughness: 0.76,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: plaster.map,
      bumpMap: plaster.bumpMap,
      bumpScale: 0.004,
      roughness: 0.94,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    // Ceiling light puck: the same 8 cm face as every other marker (owner spec).
    this.lightFixtureGeometry = new THREE.CylinderGeometry(MARKER_FACE / 2, MARKER_FACE / 2, 0.02, 24);
    this.lightFixtureMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff3df,
      emissive: 0xffc27a,
      emissiveIntensity: 1.8,
      roughness: 0.45,
      metalness: 0,
    });
    // Reusable low-poly electrical fixture parts. Marker instances only allocate
    // Groups/Meshes; geometry and materials stay shared across rebuilds.
    this.markerBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.markerSocketGeometry = new THREE.CylinderGeometry(1, 1, 1, 18).rotateX(Math.PI / 2);
    this.pipeAnchorGeometry = new THREE.TorusGeometry(0.06, 0.008, 8, 32); // a pipe anchor's hole ring, in its XY plane
    this.markerWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.62 });
    this.markerDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x26313a, roughness: 0.58 });
    this.markerAccentMaterials = new Map();
    // The house is a stack of one mesh per floor, each offset in Y by its
    // elevation. Kept in a group so multi-floor models frame/hide as a unit.
    this.house = new THREE.Group();
    this.scene.add(this.house);
    this.markerLights = new THREE.Group();
    this.scene.add(this.markerLights);
    this.furnitureModels = new THREE.Group();
    this.scene.add(this.furnitureModels);
    // PLAN mode (src/ui/planLayers3d.js): the AR-style flat plan with the conduits and the
    // pipes, on a free orbit camera. Built from `planProject` only while the mode is on.
    this.planGroup = new THREE.Group();
    this.planGroup.visible = false;
    this.scene.add(this.planGroup);
    this.planProject = null;
    this.planLayers = null;
    this.planShow = { conduits: false, pipes: false, beams: false };
    this.planFramedFor = undefined; // the floor filter the plan camera was last framed for
    this.onPlanServices = null; // (services[], fittingIssues, insulateM) → main.js draws the pipe legend
    this.furnitureBuildToken = 0;
    // One decoded scene per article, shared by every instance and kitchen unit (onceByKey).
    this.furnitureSources = onceByKey((article) => this._fetchFurnitureSource(article));
    this.furnitureCatalog = {};
    this.ikeaProxy = (import.meta.env.VITE_IKEA_PROXY || '').replace(/\/+$/, '');
    const furnitureDraco = new DRACOLoader().setDecoderPath(import.meta.env.BASE_URL + 'draco/');
    this.furnitureLoader = new GLTFLoader().setDRACOLoader(furnitureDraco);
    this.furnitureCatalogReady = loadFurnitureCatalog()
      .then((catalog) => { this.furnitureCatalog = catalog; });
    // While MR is active the extruded walls must stay hidden (the flat plan is
    // shown instead). setGeometry rebuilds on every model change, so it honors
    // this flag rather than a one-time visibility toggle.
    this.hideMesh = false;
    this.floorFilter = null; // null = all floors; otherwise a floor id

    this._onResize = this._resize.bind(this);
    window.addEventListener('resize', this._onResize);
    // Also react to splitter drags / layout changes.
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(container);

    this._animate = this._animate.bind(this);
    this.desktopActive = true;
    this._loopRunning = false;
    this._startLoop = () => {
      if (this._loopRunning) return;
      this.renderer.setAnimationLoop(this._animate);
      this._loopRunning = true;
    };
    this._stopLoop = () => {
      if (!this._loopRunning || this.renderer.xr.isPresenting) return;
      this.renderer.setAnimationLoop(null);
      this._loopRunning = false;
    };
    this._startLoop();
    // AR always owns a live XR animation loop. After it exits, return to the
    // requested desktop state rather than resuming an invisible render loop.
    this.renderer.xr.addEventListener('sessionstart', this._startLoop);
    this.renderer.xr.addEventListener('sessionend', () => {
      if (!this.desktopActive) this._stopLoop();
    });

    this.renderer.domElement.addEventListener('pointerdown', this._viewPointerDown.bind(this));
    this.renderer.domElement.addEventListener('pointermove', this._viewPointerMove.bind(this));
    this.renderer.domElement.addEventListener('pointerup', this._viewPointerUp.bind(this));
    this.renderer.domElement.addEventListener('pointercancel', this._viewPointerUp.bind(this));
    this.renderer.domElement.addEventListener('wheel', this._viewWheel.bind(this), { passive: false });
    // Overview ruler (src/ui/ruler3d.js): while on, an overview tap measures instead of entering POV.
    this.ruler = new Ruler3D(this);
  }

  setRulerEnabled(enabled) {
    this.ruler.setEnabled(enabled);
  }

  setDoorsToggleEnabled(enabled) {
    this.doorsToggleEnabled = !!enabled;
  }

  // Open or close the door under the tap, when a door is the first thing it hits (a wall in
  // front blocks it). False when it hits no door, so the tap does what it would otherwise.
  _toggleDoorAtPointer(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.viewNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.viewRaycaster.setFromCamera(this.viewNdc, this.camera);
    const targets = this.house.children.filter((mesh) => mesh.visible && mesh.isMesh);
    const key = this.viewRaycaster.intersectObjects(targets, false)[0]?.object.userData.doorKey;
    if (!key) return false;
    if (this.closedDoors.has(key)) this.closedDoors.delete(key);
    else this.closedDoors.add(key);
    for (const mesh of this.house.children) if (mesh.userData.doorKey === key) mesh.visible = this._meshVisible(mesh);
    this.renderer.shadowMap.needsUpdate = true;
    return true;
  }

  // Half walls and ceiling boxings see-through: their solid turns faint and their finishes hide. View-only.
  setHalfWallsSeeThrough(on) {
    this.halfWallsSeeThrough = !!on;
    for (const mesh of this.house.children) {
      if (mesh.userData.halfWall) {
        mesh.material = this.halfWallsSeeThrough ? this.halfWallGlassMaterial : this.wallMaterial;
        mesh.castShadow = !this.halfWallsSeeThrough;
      }
      if (mesh.userData.halfWallFinish) mesh.visible = this._meshVisible(mesh);
    }
  }

  // Floors see-through: the floor slabs turn faint and their finishes hide; POV still stands on them. View-only.
  setFloorsSeeThrough(on) {
    this.floorsSeeThrough = !!on;
    for (const mesh of this.house.children) {
      if (mesh.userData.floorSlab) mesh.material = this.floorsSeeThrough ? this.floorGlassMaterial : this.floorMaterial;
      if (mesh.userData.floorFinish) mesh.visible = this._meshVisible(mesh);
    }
  }

  // Ceiling see-through: the ceilings turn faint and their finishes hide. View-only.
  setCeilingsSeeThrough(on) {
    this.ceilingsSeeThrough = !!on;
    for (const mesh of this.house.children) {
      if (mesh.userData.ceilingSlab) {
        mesh.material = this.ceilingsSeeThrough ? this.ceilingGlassMaterial : this.ceilingMaterial;
        mesh.castShadow = !this.ceilingsSeeThrough;
      }
      if (mesh.userData.ceilingFinish) mesh.visible = this._meshVisible(mesh);
    }
  }

  // The renderer is shared with WebXR, but the desktop plan does not need its
  // parked 3D canvas to consume GPU continuously. Visible 3D and AR run it;
  // plan view stops it completely until either one is requested again.
  setDesktopActive(active) {
    this.desktopActive = !!active;
    if (this.desktopActive || this.renderer.xr.isPresenting) this._startLoop();
    else this._stopLoop();
  }

  // Accepts an array of { geometry, elevation } (one per floor) or a single
  // BufferGeometry (treated as one floor at elevation 0). Rebuilds the stacked
  // house group on every model change.
  setGeometry(floors) {
    if (!this._built) { // first build: start what the plan view never needed
      this._built = true;
      startDeferredTextures();
      if (this.realisticEnabled) this._ensureComposer();
      this._applyEnvironment();
      this._loadSky();
    }
    for (const m of this.house.children) m.geometry.dispose();
    this.house.clear();
    this.ruler?.clear(); // its faces were on the old meshes
    for (const child of this.markerLights.children) if (child.isInstancedMesh) child.dispose(); // the anchor rings' instance buffers
    this.markerLights.clear();
    this._clearFurniture();
    const furnitureToken = ++this.furnitureBuildToken;

    const list = Array.isArray(floors)
      ? floors
      : (floors ? [{ geometry: floors, elevation: 0 }] : []);

    for (const entry of list) {
      const {
        geometry, floorGeometry, wallGeometry, halfWallGeometry, soffitGeometry, beamGeometry, ceilingGeometry,
        doorGeometry, windowGeometry, outlineGeometry, stairGeometry, elevation, floorId, name,
        markerPlacements, furniture,
      } = entry;
      const parts = geometry
        ? [[geometry, this.material, 'massing']]
        : [
          [floorGeometry, this.floorMaterial, 'floor'],
          [wallGeometry, this.wallMaterial, 'walls'],
          [halfWallGeometry, this.wallMaterial, 'walls', true],
          [soffitGeometry, this.wallMaterial, 'walls', true], // ceiling boxing: see-through with the half walls
          [beamGeometry, this.beamMaterial, 'beams'], // beams in the slabs (src/core/beams.js)
          [doorGeometry, this.doorMaterial, 'doors'],
          [windowGeometry, this.windowMaterial, 'windows'],
          [stairGeometry, this.stairMaterial, 'stairs'],
          [ceilingGeometry, this.ceilingMaterial, 'ceiling'],
          // The stairwell walls around a flight going down, only with this floor alone (_meshVisible).
          [entry.stairwell?.walls, this.wallMaterial, 'walls', false, true],
        ];
      for (const [partGeometry, material, role, halfWall, stairwell] of parts) {
        if (!partGeometry) continue;
        const glass = halfWall && this.halfWallsSeeThrough ? this.halfWallGlassMaterial
          : role === 'floor' && this.floorsSeeThrough ? this.floorGlassMaterial
            : role === 'ceiling' && this.ceilingsSeeThrough ? this.ceilingGlassMaterial : material;
        const mesh = new THREE.Mesh(partGeometry, glass);
        if (halfWall) mesh.userData.halfWall = true;
        if (role === 'floor') mesh.userData.floorSlab = true;
        if (role === 'ceiling') mesh.userData.ceilingSlab = true;
        if (stairwell) mesh.userData.stairwell = true;
        mesh.castShadow = role !== 'floor' && role !== 'windows'; // glass lets the sun through
        if (halfWall && this.halfWallsSeeThrough) mesh.castShadow = false;
        if (role === 'ceiling' && this.ceilingsSeeThrough) mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.position.y = elevation || 0;
        mesh.userData.floorId = floorId || null;
        mesh.userData.floorName = name || '';
        mesh.userData.architecturalRole = role;
        if (role === 'beams' && entry.beamSpan) mesh.userData.beamWorld = entry.beamSpan.map((z) => (elevation || 0) + z);
        mesh.visible = this._meshVisible(mesh);
        this.house.add(mesh);
      }
      // Fences (FENCE zones): one mesh per colour, the colour of their fence material.
      for (const part of entry.fenceParts || []) {
        const mesh = new THREE.Mesh(part.geometry, this._fenceMaterial(part.color));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.y = elevation || 0;
        mesh.userData.floorId = floorId || null;
        mesh.userData.floorName = name || '';
        mesh.userData.architecturalRole = 'doors';
        mesh.visible = this._meshVisible(mesh);
        this.house.add(mesh);
      }
      // Ramps and platforms with their own floor material (pavedParts): its colour, plain.
      for (const part of entry.pavedParts || []) {
        const mesh = new THREE.Mesh(part.geometry, this._pavedMaterial(part.color, part.roughness));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.y = elevation || 0;
        mesh.userData.floorId = floorId || null;
        mesh.userData.floorName = name || '';
        mesh.userData.architecturalRole = 'stairs';
        mesh.visible = this._meshVisible(mesh);
        this.house.add(mesh);
      }
      // Surface finishes (docs/materials.md): textured overlays, one mesh per material
      // and role, treated like the floor/wall they cover (visibility, POV tap target).
      for (const finish of entry.finishGeometries || []) {
        const mesh = new THREE.Mesh(finish.geometry, this._finishMaterial(finish.def));
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.position.y = elevation || 0;
        mesh.userData.floorId = floorId || null;
        mesh.userData.floorName = name || '';
        mesh.userData.architecturalRole = finish.role;
        if (finish.halfWall) mesh.userData.halfWallFinish = true;
        if (finish.role === 'floor') mesh.userData.floorFinish = true;
        if (finish.role === 'ceiling') mesh.userData.ceilingFinish = true;
        mesh.visible = this._meshVisible(mesh);
        this.house.add(mesh);
      }
      // Door products on DOOR zones (docs/materials.md "Doors"), in place of the plain slab, and the
      // plain leaves (`doorLeaves`, built apart by main.js): each built open and closed, one shown
      // (open unless the 🚪 Doors toggle closed it, `closedDoors`).
      const addDoorMesh = (mesh, rectId, open) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.y = elevation || 0;
        mesh.userData.floorId = floorId || null;
        mesh.userData.floorName = name || '';
        mesh.userData.architecturalRole = 'doors';
        mesh.userData.doorKey = `${floorId}:${rectId}`;
        mesh.userData.doorOpen = open;
        mesh.visible = this._meshVisible(mesh);
        this.house.add(mesh);
      };
      for (const placement of entry.doorProducts || []) {
        for (const open of [true, false]) {
          for (const mesh of buildDoorProduct(placement, { open })) addDoorMesh(mesh, placement.rectId, open);
        }
      }
      for (const leaf of entry.doorLeaves || []) {
        addDoorMesh(new THREE.Mesh(leaf.open, this.doorMaterial), leaf.rectId, true);
        addDoorMesh(new THREE.Mesh(leaf.closed, this.doorMaterial), leaf.rectId, false);
      }
      // Window products on WINDOW zones (docs/materials.md "Windows"), in place of the pane.
      for (const placement of entry.windowProducts || []) {
        for (const mesh of buildWindowProduct(placement)) {
          mesh.castShadow = !mesh.material.transparent;
          mesh.receiveShadow = true;
          mesh.position.y = elevation || 0;
          mesh.userData.floorId = floorId || null;
          mesh.userData.floorName = name || '';
          mesh.userData.architecturalRole = 'windows';
          mesh.visible = this._meshVisible(mesh);
          this.house.add(mesh);
        }
      }
      if (outlineGeometry) {
        const lines = new THREE.LineSegments(outlineGeometry, this.outlineMaterial);
        lines.position.y = elevation || 0;
        lines.renderOrder = 2;
        lines.userData.floorId = floorId || null;
        lines.userData.floorName = name || '';
        lines.userData.architecturalRole = 'outlines';
        lines.visible = this._meshVisible(lines);
        this.house.add(lines);
      }
      const anchors = [];
      for (const marker of entry.markers || []) {
        const light = marker.type === 'light';
        if (PIPE_ANCHOR_SERVICES[marker.type]) { anchors.push(marker); continue; }
        // A product (docs/materials.md "Switches"): { def, z }, or null when another
        // marker of the same double switch draws it.
        const product = light ? undefined : entry.markerProducts?.get(marker.id);
        if (product === null) continue;
        const fixture = light ? this._lightMarkerFixture(marker)
          : product ? this._productMarkerFixture(product.def, product.fill) : this._wallMarkerFixture(marker);
        fixture.userData.floorId = floorId || null;
        fixture.userData.markerId = marker.id || null;
        // Wall fixtures sit flush on their nearest finished face, turned to face the
        // room (placement from architectural3d). Plan (x, y) → world (x, up, -y), so
        // the plan normal (nx, ny) is world (nx, -ny) and rotation.y = atan2(nx, -ny).
        const place = light ? null : markerPlacements?.get(marker.id);
        const px = place ? place.x : Number(marker.x) || 0;
        const py = place ? place.y : Number(marker.y) || 0;
        if (place) fixture.rotation.y = Math.atan2(place.nx, -place.ny);
        fixture.position.set(
          px,
          (elevation || 0) + (product ? product.z : Number.isFinite(marker.z)
            ? marker.z
            : (light ? (entry.height || 2.5) : 1.1)),
          -py,
        );

        fixture.visible = this.floorFilter == null || fixture.userData.floorId === this.floorFilter;
        this.markerLights.add(fixture);
      }
      if (anchors.length) this.markerLights.add(this._pipeAnchorRings(anchors, entry, floorId, elevation, markerPlacements));
      for (const item of furniture || []) {
        this._addFurniture(item, entry, furnitureToken);
      }
    }
    // A beam also shows with the storey whose slab it sits in (drawn from above, it is in the slab over the
    // floor below's ceiling): a storey reaching from its floor to its floor-to-floor top.
    for (const mesh of this.house.children) {
      const w = mesh.userData.beamWorld;
      if (!w) continue;
      mesh.userData.alsoFloorIds = list.filter((e) => e.floorId !== mesh.userData.floorId
        && w[1] > (e.elevation || 0) - 1e-6 && w[0] < (e.elevation || 0) + (e.storeyHeight || e.height || 2.5) + 1e-6)
        .map((e) => e.floorId);
      mesh.visible = this._meshVisible(mesh);
    }
    this._applyModelVisibility();
    this._updateLightShadows();
    if (this.realisticEnabled) this._applySun();
  }

  _clearFurniture() {
    for (const child of [...this.furnitureModels.children]) {
      this.furnitureModels.remove(child);
      child.traverse?.((object) => {
        if (!object.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.dispose?.();
        if (object.userData.furniturePlaceholder) object.geometry?.dispose?.();
      });
    }
  }

  _loadFurnitureSource(article) { return this.furnitureSources(article); }

  async _fetchFurnitureSource(article) {
    await this.furnitureCatalogReady;
    const entry = this.furnitureCatalog[article];
    if (isProcedural(entry)) return buildProceduralFurniture(entry);
    if (isKitchenUnit(entry)) { // IKEA part models assembled by code (src/ui/kitchenUnits.js)
      return assembleKitchenUnit(entry, (part) => this._loadFurnitureSource(part));
    }
    if (!this.ikeaProxy) throw new Error('no VITE_IKEA_PROXY');
    const url = `${this.ikeaProxy}/${article}`;
    const cache = globalThis.caches ? await caches.open('house-cad:furniture:v1') : null;
    const hit = cache && await cache.match(url);
    let buffer;
    if (hit) buffer = await hit.arrayBuffer();
    else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`proxy ${response.status}`);
      if (cache) await cache.put(url, response.clone());
      buffer = await response.arrayBuffer();
    }
    return new Promise((resolve, reject) =>
      this.furnitureLoader.parse(buffer, '', (gltf) => resolve(gltf.scene), reject));
  }

  _furnitureInstance(source) {
    const instance = source.clone();
    instance.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
      object.castShadow = true;
      object.receiveShadow = true;
    });
    return instance;
  }

  _furnitureFallback(article) {
    const mmSize = this.furnitureCatalog[article]?.sizeMm || [600, 600, 600];
    const [width, height, depth] = mmSize.map((value) => value / 1000);
    const object = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: 0x8a9aa5, transparent: true, opacity: 0.55 }),
    );
    object.position.y = height / 2;
    object.userData.furniturePlaceholder = article;
    return object;
  }

  _addFurniture(item, entry, token) {
    const place = (object) => {
      if (token !== this.furnitureBuildToken) {
        object.traverse?.((child) => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) material?.dispose?.();
          if (child.userData.furniturePlaceholder) child.geometry?.dispose?.();
        });
        return;
      }
      object.position.set(
        Number(item.x) || 0,
        (Number(entry.elevation) || 0) + (Number(item.z) || 0),
        -(Number(item.y) || 0),
      );
      object.rotation.y = THREE.MathUtils.degToRad(Number(item.rotationY) || 0);
      object.userData.floorId = entry.floorId || null;
      object.userData.furnitureId = item.id || null;
      object.visible = this.floorFilter == null || object.userData.floorId === this.floorFilter;
      this.furnitureModels.add(object);
    };
    const article = String(item.article);
    this._loadFurnitureSource(article)
      .then((source) => place(this._furnitureInstance(source)))
      .catch(() => place(this._furnitureFallback(article)));
  }

  _markerAccent(type) {
    const colors = {
      outlet: 0xd8dee5, outlet_shutter: 0x60a5fa, outlet_aircon: 0x38bdf8,
      outlet_cooktop: 0xef4444, outlet_oven: 0xf97316,
      outlet_water_heater: 0x06b6d4, outlet_appliance: 0xeab308,
      switch: 0xcbd5e1, switch_dual: 0xcbd5e1, ethernet: 0x3b82f6, ethernet_dual: 0x2563eb,
      tv_antenna: 0xa855f7, camera_ethernet: 0x14b8a6,
      patch_panel: 0x6366f1, intercom: 0x84cc16, panel: 0xf59e0b, breaker: 0xef4444,
      radiator: 0xfb923c, boiler: 0xef4444, sink: 0x60a5fa, washing_machine: 0x3b82f6,
    };
    const color = colors[type] ?? 0x94a3b8;
    if (!this.markerAccentMaterials.has(color)) {
      this.markerAccentMaterials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
    }
    return this.markerAccentMaterials.get(color);
  }

  // Pipe anchors (src/core/pipeAnchors.js) show the hole: a ring in its service's pipe colour at
  // the marker itself (never moved onto a face). On the floor or the ceiling it lies flat (a slab
  // hole); elsewhere it stands in the plane of its nearest wall (a wall hole). One floor's rings
  // are one InstancedMesh (one draw call), coloured per instance.
  _pipeAnchorRings(anchors, entry, floorId, elevation, markerPlacements) {
    this.pipeAnchorMaterial ??= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
    const rings = new THREE.InstancedMesh(this.pipeAnchorGeometry, this.pipeAnchorMaterial, anchors.length);
    const ceiling = entry.height ?? 2.5; // the ceiling height (main.js)
    const pose = new THREE.Object3D(), color = new THREE.Color();
    anchors.forEach((marker, i) => {
      const z = Number.isFinite(marker.z) ? marker.z : 0;
      const place = markerPlacements?.get(marker.id);
      pose.rotation.set(0, 0, 0);
      if (z <= 0.05 || z >= ceiling - 0.05 || !place?.snapped) pose.rotation.x = Math.PI / 2;
      else pose.rotation.y = Math.atan2(place.nx, -place.ny);
      pose.position.set(Number(marker.x) || 0, (elevation || 0) + z, -(Number(marker.y) || 0));
      pose.updateMatrix();
      rings.setMatrixAt(i, pose.matrix);
      rings.setColorAt(i, color.setHex(PIPE_SERVICE_COLOR[PIPE_ANCHOR_SERVICES[marker.type][0]] ?? 0x94a3b8));
    });
    rings.computeBoundingSphere();
    rings.userData.floorId = floorId || null;
    rings.visible = this.floorFilter == null || rings.userData.floorId === this.floorFilter;
    return rings;
  }

  _lightMarkerFixture() {
    const fixture = new THREE.Group();
    // A small emissive ceiling puck makes the source legible even in basic mode.
    const puck = new THREE.Mesh(this.lightFixtureGeometry, this.lightFixtureMaterial);
    puck.position.y = -0.01; // 2 cm puck, top flush with the ceiling
    fixture.add(puck);
    const source = new THREE.PointLight(0xffc58f, 70, 8, 2);
    source.position.y = -0.08;
    source.castShadow = false;
    source.shadow.mapSize.set(256, 256);
    source.shadow.camera.near = 0.08;
    source.shadow.camera.far = 8;
    source.shadow.bias = -0.001;
    source.visible = this.lightingEnabled;
    fixture.add(source);
    return fixture;
  }

  // A switch carrying a product (docs/materials.md "Switches") shows that product in
  // place of the standard faceplate, in the same convention (back at z = 0, front +Z).
  _productMarkerFixture(def, fill = null) {
    const fixture = buildDeviceProduct(def, { fill });
    fixture.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return fixture;
  }

  // Every wall marker is one 8 cm × 8 cm faceplate (MARKER_FACE, owner spec). Its
  // local +Z is the room-facing front; the back is at z = 0 so the group origin can
  // sit exactly on the wall face. Type detailing stays inside the face.
  _wallMarkerFixture(marker) {
    const fixture = new THREE.Group();
    const type = marker.type || 'outlet';
    const F = MARKER_FACE, depth = 0.02;
    const body = new THREE.Mesh(this.markerBoxGeometry, this.markerWhiteMaterial);
    body.scale.set(F, F, depth);
    body.position.z = depth / 2;
    body.castShadow = true;
    fixture.add(body);
    const addBox = (x, y, w, h, d = 0.004, material = this.markerDarkMaterial) => {
      const mesh = new THREE.Mesh(this.markerBoxGeometry, material);
      mesh.scale.set(w, h, d); mesh.position.set(x, y, depth + d / 2); fixture.add(mesh);
    };
    const addSocket = (x, y, radius, material = this.markerDarkMaterial, d = 0.004) => {
      const mesh = new THREE.Mesh(this.markerSocketGeometry, material);
      mesh.scale.set(radius, radius, d); mesh.position.set(x, y, depth + d / 2); fixture.add(mesh);
    };
    const accent = this._markerAccent(type);
    if (type === 'switch') {
      addBox(0, 0, 0.045, 0.057, 0.005, accent);
      addBox(0, 0, 0.038, 0.002, 0.007);
    } else if (type === 'switch_dual') { // two rockers side by side, each split across
      for (const x of [-0.0115, 0.0115]) {
        addBox(x, 0, 0.021, 0.057, 0.005, accent);
        addBox(x, 0, 0.017, 0.002, 0.007);
      }
    } else if (type === 'ethernet' || type === 'ethernet_dual') {
      const ys = type === 'ethernet_dual' ? [-0.018, 0.018] : [0];
      for (const y of ys) { addBox(0, y, 0.044, 0.022, 0.004, accent); addBox(0, y, 0.028, 0.010, 0.006); }
    } else if (type === 'patch_panel') {
      for (const [x, y, i] of [[-0.016, 0.014, 0], [0.016, 0.014, 1], [-0.016, -0.014, 1], [0.016, -0.014, 0]]) {
        addBox(x, y, 0.024, 0.018, 0.004, i ? accent : this.markerDarkMaterial);
      }
    } else if (type === 'panel') {
      addBox(0, 0, 0.064, 0.064, 0.004, accent);
      for (const y of [-0.018, 0, 0.018]) addBox(0, y, 0.05, 0.006, 0.006);
    } else if (type === 'breaker') {
      addBox(0, 0, 0.03, 0.05, 0.004, accent);
      addBox(0, 0.008, 0.016, 0.022, 0.008);
    } else if (type === 'intercom') {
      for (const y of [0.026, 0.014, 0.002]) addBox(0, y, 0.05, 0.005);
      addSocket(0, -0.022, 0.012, accent);
    } else if (type === 'camera_ethernet') {
      addBox(0, 0, 0.06, 0.04, 0.03, accent);
      addSocket(0, 0, 0.014, this.markerDarkMaterial, 0.034);
    } else if (type === 'radiator') {
      for (let i = -2; i <= 2; i++) addBox(i * 0.014, 0, 0.008, 0.06, 0.006, accent);
    } else if (type === 'boiler') {
      addBox(0, 0.016, 0.06, 0.03, 0.004, accent);
      addSocket(0, -0.02, 0.01);
    } else if (type === 'sink') {
      addBox(0, -0.01, 0.06, 0.04, 0.004, accent);
      addBox(0, 0.025, 0.008, 0.018, 0.008);
    } else if (type === 'washing_machine') {
      addSocket(0, 0, 0.028, accent); addSocket(0, 0, 0.019, this.markerDarkMaterial, 0.006);
    } else if (type === 'tv_antenna') {
      addSocket(0, 0, 0.024, accent); addSocket(0, 0, 0.010, this.markerDarkMaterial, 0.006);
    } else {
      // Every outlet variant keeps the recognizable circular socket while its
      // application-specific accent identifies shutter/HVAC/high-current uses.
      addSocket(0, 0, 0.026, accent);
      addSocket(0, 0, 0.014, this.markerDarkMaterial, 0.006);
      addBox(0, 0.020, 0.006, 0.011, 0.008, this.markerWhiteMaterial); // Type-E earth pin
    }
    return fixture;
  }

  // The architectural model hides in PLAN mode (its markers stay) and while MR shows the flat plan.
  // planGroup also holds the Model view's grey pipes, so it shows in every mode.
  _applyModelVisibility() {
    const plan = this.navigationMode === 'plan';
    this.house.visible = !this.hideMesh && !plan;
    this.markerLights.visible = !this.hideMesh;
    this.furnitureModels.visible = !this.hideMesh && !plan;
    this.planGroup.visible = !this.hideMesh;
  }

  // PLAN mode on/off (owner, 2026-10-14: switching keeps the view, both ways). On starts the orbit
  // from the camera as it is (the overview, a POV or the model's orbit). Off keeps the camera too:
  // if it was not moved in the plan, the overview, POV or orbit it came from comes back as it was;
  // otherwise the model shows from exactly where the plan camera is, on the same orbit (ORBIT).
  // `frame`: View 3D opening on the plan (the model is built only when asked for): frame the plan.
  setPlanMode(on, project = this.planProject, { frame = false } = {}) {
    if (!!on === (this.navigationMode === 'plan')) return;
    this.cameraTransition = null;
    this.ruler?.clear();
    if (on) {
      const from = this.navigationMode;
      const mode = from.endsWith('pov') ? 'pov' : from === 'orbit' ? 'orbit' : 'overview';
      this.modelPose = frame ? null : { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(),
        up: this.camera.up.clone(), fov: this.camera.fov, distance: this.overviewDistance, floor: this.floorFilter, mode };
      this.planProject = project;
      this.navigationMode = 'plan';
      this.planFramedFor = this.floorFilter;
      this._rebuildPlanLayers();
      this._enableOrbit();
      if (frame) { this.camera.up.set(0, 1, 0); this._framePlan(); }
      else if (mode !== 'orbit') this._aimPlanFromCamera(mode === 'pov' ? 2 : null); // ORBIT keeps its target
      this.planEntry = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
      this._applyModelVisibility();
      this._updateLightShadows();
      this.onNavigationChange?.('plan');
    } else {
      const pose = this.modelPose, entry = this.planEntry;
      this.modelPose = this.planEntry = null;
      const moved = !entry || entry.position.distanceTo(this.camera.position) > 1e-4
        || entry.quaternion.angleTo(this.camera.quaternion) > 1e-4;
      if (moved || !pose || pose.floor !== this.floorFilter) {
        // The model from the plan camera, on the same orbit.
        this.navigationMode = 'orbit';
        this.modelFramedFor = this.floorFilter; // a rebuild on this floor keeps the orbit
        this._rebuildPlanLayers();
        this._applyModelVisibility();
        for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
        this._updateLightShadows();
        this.onNavigationChange?.('orbit');
        return;
      }
      this.controls.enabled = false;
      this.navigationMode = 'overview';
      this._rebuildPlanLayers();
      this._applyModelVisibility();
      this.camera.up.copy(pose.up);
      this.camera.position.copy(pose.position);
      this.camera.quaternion.copy(pose.quaternion);
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      this.overviewDistance = pose.distance;
      if (pose.mode === 'pov') { this._finishTransition('pov'); return; } // back where the walk stood
      if (pose.mode === 'orbit') { this._enableOrbit(); this._finishTransition('orbit'); return; }
      for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
      this._updateLightShadows();
      this.onNavigationChange?.('overview');
    }
  }

  // The free orbit (OrbitControls) of PLAN and of the model's ORBIT view.
  _enableOrbit() {
    this.controls.enabled = true;
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
  }

  // The orbit starts where the camera is: its target is the plan point at the screen's centre (from
  // POV, `ahead` metres in front of the eye), and a top-down camera is nudged a hair south so the
  // orbit's +Y up keeps plan north up the screen.
  _aimPlanFromCamera(ahead = null) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const ray = new THREE.Ray(this.camera.position.clone(), forward);
    const target = (ahead == null
      && ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.overviewPlaneY), new THREE.Vector3()))
      || this.camera.position.clone().addScaledVector(forward, ahead ?? this.overviewDistance);
    const distance = this.camera.position.distanceTo(target);
    if (Math.abs(forward.y) > 0.9999) this.camera.position.set(target.x, this.camera.position.y, target.z + distance * 1e-3);
    this.camera.up.set(0, 1, 0);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
  }

  // Show or hide one PLAN layer ('conduits' | 'pipes' | 'beams'); view-only. The pipes (grey) and the beams
  // (x-ray) also show in the Model view, built only once asked for.
  setPlanLayerVisible(name, on) {
    this.planShow[name] = !!on;
    if (this.planLayers?.[name]) this.planLayers[name].visible = !!on;
    else if (on) this._rebuildPlanLayers();
  }

  _clearPlanLayers() {
    for (const child of [...this.planGroup.children]) {
      this.planGroup.remove(child);
      disposePlanLayer(child);
    }
    this.planLayers = null;
  }

  // Rebuilt on every model change and floor choice (cheap: a few draw calls). PLAN: the zones, the
  // conduits, the pipes by service and the beams. Model view (owner, 2026-10-14): only the pipes, neutral
  // grey, and the beams through the slabs (2026-10-22), each only while its toggle is on.
  _rebuildPlanLayers() {
    this._clearPlanLayers();
    if (!this.planProject) return;
    const plan = this.navigationMode === 'plan';
    if (!plan && !this.planShow.pipes && !this.planShow.beams) return;
    this.planLayers = buildPlanLayers(this.planProject, this.floorFilter, plan ? {} : { pipeColor: MODEL_PIPE_COLOR });
    for (const name of plan ? ['zones', 'conduits', 'pipes', 'beams'] : ['pipes', 'beams']) {
      const layer = this.planLayers[name];
      if (name !== 'zones') layer.visible = this.planShow[name];
      this.planGroup.add(layer);
    }
    this.onPlanServices?.(this.planLayers.services, this.planLayers.fittingIssues, this.planLayers.insulateM);
  }

  // Frame the shown plan from the south, looking down at ~40°, orbiting about its centre.
  _framePlan() {
    const box = new THREE.Box3();
    for (const child of this.planGroup.children) box.expandByObject(child);
    if (box.isEmpty()) return;
    this.planFramedFor = this.floorFilter;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.camera.fov = OVERVIEW_FOV;
    this.camera.updateProjectionMatrix();
    const radius = Math.max(2, size.length() / 2);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(OVERVIEW_FOV / 2)) * Math.max(1, 1 / this.camera.aspect) * 0.9;
    const pitch = THREE.MathUtils.degToRad(40);
    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + distance * Math.sin(pitch), center.z + distance * Math.cos(pitch));
    this.camera.lookAt(center);
    this.controls.update();
  }

  setFloorFilter(floorId = null) {
    this.floorFilter = floorId;
    this.ruler?.clear();
    for (const mesh of this.house.children) {
      mesh.visible = this._meshVisible(mesh);
    }
    for (const fixture of this.markerLights.children) {
      fixture.visible = floorId == null || fixture.userData.floorId === floorId;
    }
    for (const object of this.furnitureModels.children) {
      object.visible = floorId == null || object.userData.floorId === floorId;
    }
    this._updateLightShadows();
    if (this.navigationMode === 'plan') {
      // A model change keeps the orbit; choosing another floor frames it.
      this._rebuildPlanLayers();
      if (this.planFramedFor !== floorId) this._framePlan();
      return;
    }
    this._rebuildPlanLayers();
    // A model rebuild on the same floor (an edit, ▯ Windows open) keeps the overview or POV as it is
    // (owner, 2026-10-14); choosing another floor frames it.
    if (this.modelFramedFor === floorId && (this.overviewPose || this.navigationMode === 'orbit')) return;
    this.frameModel();
  }

  // Performance switch for older mobile GPUs. Basic mode keeps the hemisphere plus
  // one shadowless directional light so corners remain readable, while disabling
  // marker point lights and every shadow render pass. Fixture meshes remain visible.
  setLightingEnabled(enabled) {
    this.lightingEnabled = !!enabled;
    this._applyShadowState();
    for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
    this._updateLightShadows();
  }

  _applyShadowState() {
    const shadows = this.lightingEnabled || this.realisticEnabled;
    this.renderer.shadowMap.enabled = shadows;
    this.sun.visible = true;
    this.sun.castShadow = shadows;
    this.floor.receiveShadow = shadows;
    this.renderer.shadowMap.needsUpdate = true;
  }

  // Realistic (docs/realism.md, desktop only): the sun at `sunDate` for the site, with
  // shadows; a downloaded sky (Poly Haven, CC0, Cache Storage) for ambient light,
  // reflections and the background; ambient occlusion (GTAO) through a composer.
  // The XR loop never uses the composer, and mr.js stashes background/environment.
  setRealisticEnabled(enabled) {
    this.realisticEnabled = !!enabled;
    this.renderer.setPixelRatio(this.realisticEnabled ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio);
    this.grid.visible = !this.realisticEnabled;
    // Realistic keeps a faint hemisphere as the warm bounce off wooden floors.
    this.hemi.color.setHex(this.realisticEnabled ? 0xfff6ec : 0xffffff);
    this.hemi.groundColor.setHex(this.realisticEnabled ? 0x9a7652 : 0x445566);
    this.renderer.toneMappingExposure = this.realisticEnabled ? 1.0 : 0.9;
    if (this.realisticEnabled) {
      if (this._built) this._ensureComposer(); // else at the first model build
      this._loadSky();
    } else {
      this.sun.position.set(12, 20, 8);
      this.sun.target.position.set(0, 0, 0);
      this.sun.intensity = 1.6;
      this.sun.color.set(0xffffff);
      this.sun.shadow.camera.left = -30; this.sun.shadow.camera.right = 30;
      this.sun.shadow.camera.top = 30; this.sun.shadow.camera.bottom = -30;
      this.sun.shadow.camera.near = 0.5; this.sun.shadow.camera.far = 500;
      this.sun.shadow.camera.updateProjectionMatrix();
      this.sun.shadow.bias = 0; this.sun.shadow.normalBias = 0;
    }
    this._applyShadowState();
    this._applyEnvironment();
    if (this.realisticEnabled) this._applySun();
    for (const material of this.finishMaterials?.values() || []) {
      if (material.userData.photoDef) this._applyPhotoFinish(material);
    }
    for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
    this._resize();
  }

  // The downloaded sky (Realistic): only once the 3D model has been built, so the plan
  // view never downloads or prepares it (owner, 2026-10-03).
  _loadSky() {
    if (!this.realisticEnabled || !this._built) return;
    if (!this.sky && !this._skyLoading) {
      this._skyLoading = true;
      this.onSkyStatus?.('downloading sky…');
      loadSky().then((sky) => {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.sky = { ...sky, envTexture: pmrem.fromEquirectangular(sky.lightTexture).texture };
        sky.lightTexture.dispose();
        pmrem.dispose();
        this.onSkyStatus?.('');
        this._applyEnvironment();
        this._applySun();
      }).catch((error) => {
        console.warn('sky download failed', error);
        this.onSkyStatus?.('sky download failed: generated room light');
      }).finally(() => { this._skyLoading = false; });
    }
  }

  setSunDate(date) {
    this.sunDate = date;
    if (this.realisticEnabled) this._applySun();
  }

  _ensureComposer() {
    if (this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const { clientWidth: w, clientHeight: h } = this.container;
    this.gtaoPass = new GTAOPass(this.scene, this.camera, w, h);
    this.gtaoPass.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1, thickness: 1, scale: 1, samples: 16 });
    this.gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.composer.addPass(this.gtaoPass);
    this.composer.addPass(new OutputPass());
  }

  // The sky when Realistic has it (the generated room while it downloads or if it
  // fails), else the opt-in generated room (Reflections), else none.
  _applyEnvironment() {
    if (this.renderer.xr.isPresenting) return; // mr.js owns these during a session
    if (!this._built) return; // the plan view prepares nothing 3D: applied at the first build
    this._plainBackground ??= this.scene.background?.isColor ? this.scene.background : new THREE.Color(0x1a1d23);
    if (this.realisticEnabled && this.sky) {
      this.scene.environment = this.sky.envTexture;
      this.scene.background = this.sky.texture;
      this._applySun();
      return;
    }
    const room = this.realisticEnabled || this.reflectionsEnabled;
    this.scene.environment = room ? this._roomEnvironment() : null;
    this.scene.background = this._plainBackground;
    this.scene.environmentIntensity = 0.6;
    this.scene.environmentRotation.set(0, 0, 0);
    this.hemi.intensity = this.realisticEnabled ? 0.45 : this.reflectionsEnabled ? 0.35 : 0.9;
  }

  _roomEnvironment() {
    if (!this._envTexture) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this._envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    return this._envTexture;
  }

  // Sun direction, colour and strength for `sunDate`; the shadow camera is fitted to the
  // visible house so a 2048 map keeps about 1 cm texels on a 20 m house.
  _applySun() {
    const pos = sunPosition(this.sunDate);
    const dir = sunDirection(pos);
    const box = this._visibleBox() || new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(4, box.getSize(new THREE.Vector3()).length() / 2 + 1);
    this.sun.position.copy(center).addScaledVector(dir, radius * 2);
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
    cam.near = 0.1; cam.far = radius * 4;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    const up = Math.sin(pos.elevation);
    const day = THREE.MathUtils.smoothstep(up, -0.05, 0.25); // dusk → full day
    this.sun.intensity = 3.2 * THREE.MathUtils.smoothstep(up, 0, 0.15);
    this.sun.color.setHex(0xffa860).lerp(new THREE.Color(0xfff3e2), THREE.MathUtils.smoothstep(up, 0.05, 0.5));
    if (this.sky && !this.renderer.xr.isPresenting) {
      const yaw = Math.atan2(dir.x, dir.z) - this.sky.sunAngle; // turn the sky's bright side to the sun
      this.scene.environmentRotation.set(0, yaw, 0);
      this.scene.backgroundRotation.set(0, yaw, 0);
      this.scene.environmentIntensity = 0.08 + 0.82 * day;
      this.hemi.intensity = 0.05 + 0.4 * day;
      this.scene.backgroundIntensity = 0.06 + 0.94 * day;
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  // Reflections (opt-in per device: some devices struggle): an environment map from
  // three's RoomEnvironment, built once on first use, so glossy finishes (glazed tile,
  // vitrified floor) reflect a soft room. It adds light, so the hemisphere fill drops
  // while it is on. MR clears scene.environment for its session (mr.js).
  setReflectionsEnabled(enabled) {
    this.reflectionsEnabled = !!enabled;
    this._applyEnvironment();
  }

  // One cached material per catalog entry (keyed by its content, so an edited custom
  // product gets a fresh texture). Never disposed with the per-build geometry.
  // Its textures are painted in the texture worker (textureWorker.js): the material shows the
  // finish's flat colour until they arrive; main.js holds the 3D view until every
  // background texture job is done (owner, 2026-10-03).
  // A fence's colour (its fence material, materials.js); cached, never disposed.
  _pavedMaterial(color, roughness) {
    this.pavedMaterials ??= new Map();
    const key = `${color}|${roughness}`;
    let material = this.pavedMaterials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      this.pavedMaterials.set(key, material);
    }
    return material;
  }

  _fenceMaterial(color) {
    this.fenceMaterials ??= new Map();
    let material = this.fenceMaterials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
      this.fenceMaterials.set(color, material);
    }
    return material;
  }

  _finishMaterial(def) {
    this.finishMaterials ??= new Map();
    const key = JSON.stringify(def || {});
    let material = this.finishMaterials.get(key);
    if (material) return material;
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    material = new THREE.MeshStandardMaterial({
      color: def?.color ?? 0xffffff,
      roughness: def?.roughness ?? (def?.pattern === 'stagger' ? 0.72 : def?.pattern === 'paint' ? 0.92 : 0.45),
      metalness: 0,
      side: THREE.DoubleSide,
      // Pull the 2 mm overlay firmly in front of the slab/wall it covers.
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    if (hasPhotoFinish(def)) material.userData.photoDef = def;
    this.finishMaterials.set(key, material);
    if (!def || def.pattern === 'paint' || !(def.w > 0 && def.h > 0)) return material; // no texture
    paintFinish(def, anisotropy).then(({ map, bumpMap }) => {
      if (map) {
        material.color.setHex(0xffffff);
        material.map = map;
      }
      if (bumpMap) {
        material.bumpMap = bumpMap;
        material.bumpScale = def.bumpScale ?? 1;
      }
      applyFinishDetail(material, def, anisotropy); // sub-mm grain up close (finishTextures.js)
      material.needsUpdate = true;
      if (material.userData.photoDef) {
        material.userData.procedural = { map: material.map, bumpMap: material.bumpMap ?? null, bumpScale: material.bumpScale };
        if (this.realisticEnabled) this._applyPhotoFinish(material);
      }
    }).catch((error) => console.warn('finish texture failed', def.id, error));
    return material;
  }

  // Realistic swaps a finish's procedural texture for the retailer's photo when one is
  // registered (src/ui/photoFinishes.js, docs/realism.md); off, or on failure, the
  // procedural one stays.
  _applyPhotoFinish(material) {
    const def = material.userData.photoDef;
    const procedural = material.userData.procedural;
    if (!procedural) return; // still painting: applied once the procedural texture is in
    if (!this.realisticEnabled) {
      if (material.userData.restorePhoto) {
        material.userData.restorePhoto();
        material.userData.restorePhoto = null;
        Object.assign(material, procedural);
        material.needsUpdate = true;
      }
      return;
    }
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    if (material.userData.photoLoading) return;
    material.userData.photoLoading = true;
    loadPhotoFinish(def, anisotropy).then((photo) => {
      if (!this.realisticEnabled || material.userData.restorePhoto) return;
      Object.assign(material, { map: photo.map, bumpMap: photo.bumpMap, bumpScale: photo.layout === 'stepped' ? 2 : 0.6 });
      material.userData.restorePhoto = patchPhotoMaterial(material, photo);
    }).catch((error) => console.warn('photo finish failed', def.id, error))
      .finally(() => { material.userData.photoLoading = false; });
  }


  _meshVisible(mesh) {
    const onSelectedFloor = this.floorFilter == null || mesh.userData.floorId === this.floorFilter
      || !!mesh.userData.alsoFloorIds?.includes(this.floorFilter);
    const role = mesh.userData.architecturalRole;
    if (role === 'outlines' && (this.lightingEnabled || this.realisticEnabled)) return false;
    if (mesh.userData.halfWallFinish && this.halfWallsSeeThrough) return false;
    if (mesh.userData.floorFinish && this.floorsSeeThrough) return false;
    if (mesh.userData.ceilingFinish && this.ceilingsSeeThrough) return false;
    // A floor's stairwell under its flights going down: the floor below draws it otherwise.
    if (mesh.userData.stairwell && this.floorFilter == null) return false;
    if (mesh.userData.doorKey && mesh.userData.doorOpen === this.closedDoors.has(mesh.userData.doorKey)) return false;
    return onSelectedFloor && (role !== 'ceiling' || this.navigationMode === 'pov');
  }

  _viewPointerDown(event) {
    if (event.button !== 0 || this.cameraTransition) return;
    try { this.renderer.domElement.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    this.viewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.viewPointers.size === 2 && this.navigationMode === 'overview') {
      // A second finger turns the drag into a pinch-zoom + pan; no tap follows it.
      this.viewGesture = this._pointerPair();
      if (this.viewPointer) this.viewPointer.moved = true;
      return;
    }
    if (this.viewPointers.size > 1) return;
    this.viewPointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
  }

  _pointerPair() {
    const [a, b] = [...this.viewPointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  }

  _viewPointerMove(event) {
    const tracked = this.viewPointers.get(event.pointerId);
    if (tracked) { tracked.x = event.clientX; tracked.y = event.clientY; }
    if (this.cameraTransition) return;
    if (this.viewGesture && this.viewPointers.size >= 2 && this.navigationMode === 'overview') {
      const next = this._pointerPair();
      this._panOverview(next.midX - this.viewGesture.midX, next.midY - this.viewGesture.midY);
      if (this.viewGesture.dist > 0 && next.dist > 0) {
        this._zoomOverview(this.viewGesture.dist / next.dist, next.midX, next.midY);
      }
      this.viewGesture = next;
      return;
    }
    const p = this.viewPointer;
    if (!p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    if (Math.hypot(event.clientX - p.startX, event.clientY - p.startY) > 6) p.moved = true;
    if (!p.moved) return;
    if (this.navigationMode === 'overview') {
      this._panOverview(dx, dy);
    } else if (this.navigationMode === 'pov') {
      if (this.tiltEnabled && this._deviceOrientation) {
        this.tiltYawOffset -= dx * 0.005; // tilt owns pitch; a drag still turns
      } else {
        this.viewYaw -= dx * 0.005;
        this.viewPitch = THREE.MathUtils.clamp(this.viewPitch - dy * 0.005, -Math.PI * 0.48, Math.PI * 0.48);
        this._applyPovLook();
      }
    }
  }

  _viewPointerUp(event) {
    this.viewPointers.delete(event.pointerId);
    if (this.viewPointers.size < 2) this.viewGesture = null;
    const p = this.viewPointer;
    if (!p || p.id !== event.pointerId) return;
    if (!p.moved && !this.cameraTransition && event.type === 'pointerup') {
      if (this.doorsToggleEnabled && this.navigationMode !== 'plan' && this._toggleDoorAtPointer(event.clientX, event.clientY)) { /* toggled */ }
      else if (this.navigationMode === 'overview' && this.ruler.enabled) this.ruler.pick(event.clientX, event.clientY);
      else if (this.navigationMode === 'overview' || this.navigationMode === 'orbit') this._enterPovFromPointer(event.clientX, event.clientY);
      else if (this.navigationMode === 'pov') this._walkToPointer(event.clientX, event.clientY);
    }
    this.viewPointer = null;
  }

  _viewWheel(event) {
    if (this.navigationMode !== 'overview' || this.cameraTransition) return;
    event.preventDefault();
    this._zoomOverview(Math.exp(event.deltaY * 0.0015), event.clientX, event.clientY);
  }

  // Overview pan in screen terms: the camera's own right/up axes, so it stays a
  // "grab the plan" drag whichever way the overview is turned.
  _panOverview(dx, dy) {
    const visibleHeight = 2 * this.overviewDistance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const metresPerPixel = visibleHeight / Math.max(1, this.renderer.domElement.clientHeight);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.camera.position.addScaledVector(right, -dx * metresPerPixel).addScaledVector(up, dy * metresPerPixel);
    this.camera.updateMatrixWorld();
    this.overviewPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
  }

  // Zoom the top-down overview by `factor` (<1 = closer), keeping the plan point
  // under (clientX, clientY) fixed on screen.
  _zoomOverview(factor, clientX, clientY) {
    const next = THREE.MathUtils.clamp(this.overviewDistance * factor,
      Math.min(1.5, this.overviewFitDistance), this.overviewFitDistance * 3);
    if (Math.abs(next - this.overviewDistance) < 1e-6) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.viewNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.viewRaycaster.setFromCamera(this.viewNdc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.overviewPlaneY);
    const anchor = this.viewRaycaster.ray.intersectPlane(plane, new THREE.Vector3());
    const k = next / this.overviewDistance;
    if (anchor) {
      this.camera.position.x = anchor.x + (this.camera.position.x - anchor.x) * k;
      this.camera.position.z = anchor.z + (this.camera.position.z - anchor.z) * k;
    }
    this.camera.position.y = this.overviewPlaneY + next;
    this.overviewDistance = next;
    this.camera.updateMatrixWorld();
    this.overviewPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
  }

  _enterPovFromPointer(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.viewNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.viewRaycaster.setFromCamera(this.viewNdc, this.camera);
    const floors = this.house.children.filter((mesh) => mesh.visible
      && (mesh.userData.architecturalRole === 'floor' || mesh.userData.architecturalRole === 'stairs'));
    const hit = this.viewRaycaster.intersectObjects(floors, false).find((h) => this._standable(h));
    if (!hit) return;
    // The pose ▦ Overview returns to: the overview, or the ORBIT view with its target.
    this.overviewPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), distance: this.overviewDistance,
      orbit: this.navigationMode === 'orbit' ? this.controls.target.clone() : null };
    this.controls.enabled = false; // POV drags look around
    const endPosition = new THREE.Vector3(hit.point.x, hit.point.y + this.eyeHeight, hit.point.z);
    const box = this._visibleBox();
    const center = box?.getCenter(new THREE.Vector3()) || new THREE.Vector3(endPosition.x, endPosition.y, endPosition.z - 1);
    center.y = endPosition.y;
    if (center.distanceToSquared(endPosition) < 1e-6) center.z -= 1;
    const matrix = new THREE.Matrix4().lookAt(endPosition, center, new THREE.Vector3(0, 1, 0));
    const endQuaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    this._startTransition(endPosition, endQuaternion, 'pov');
  }

  // Somewhere to stand: a floor (at any room level, above or below its storey's floor), or
  // the top of a step, a ramp or a platform (role 'stairs', facing up). Not their sides.
  _standable(hit) {
    const role = hit.object.userData.architecturalRole;
    if (role === 'floor') return true;
    return role === 'stairs' && !!hit.face && hit.face.normal.y > 0.5;
  }

  // POV tap: walk to the tapped floor spot (through a doorway into the next room too),
  // facing the way you walked. Walls in front block the tap; it does nothing then.
  _walkToPointer(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.viewNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.viewRaycaster.setFromCamera(this.viewNdc, this.camera);
    // Door leaves don't block: tapping through a doorway walks into the next room.
    const targets = this.house.children.filter((mesh) => mesh.visible && mesh.isMesh
      && mesh.userData.architecturalRole !== 'doors');
    const hit = this.viewRaycaster.intersectObjects(targets, false)[0];
    if (!hit || !this._standable(hit)) return;
    const end = new THREE.Vector3(hit.point.x, hit.point.y + this.eyeHeight, hit.point.z);
    const travel = end.clone().sub(this.camera.position);
    travel.y = 0;
    const endQuaternion = travel.lengthSq() > 1e-4
      ? new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(end, end.clone().add(travel), new THREE.Vector3(0, 1, 0)))
      : this.camera.quaternion.clone();
    const duration = THREE.MathUtils.clamp(350 + 180 * Math.sqrt(travel.length()), 450, 1100);
    this._startTransition(end, endQuaternion, 'pov', duration);
  }

  // Leave POV for the saved overview (the Overview button; no longer a stray tap).
  // From ORBIT, ▦ Overview frames the top-down overview.
  exitPov() {
    if (this.cameraTransition) return;
    if (this.navigationMode === 'orbit') { this.frameModel(); return; }
    if (this.navigationMode !== 'pov') return;
    this._returnToOverview();
  }

  // Vertical FOV: the overview keeps 50°. POV keeps at least ~65° across on a narrow
  // (portrait) screen, capped at 100° vertical so the top and bottom don't stretch.
  _fovFor(destination) {
    if (destination !== 'pov') return OVERVIEW_FOV;
    const aspect = Math.max(0.1, this.camera.aspect);
    const vertical = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(POV_MIN_HFOV / 2)) / aspect);
    return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vertical), OVERVIEW_FOV, 100);
  }

  _returnToOverview() {
    if (!this.overviewPose) return;
    if (this.overviewPose.distance) this.overviewDistance = this.overviewPose.distance;
    for (const mesh of this.house.children) {
      if (mesh.userData.architecturalRole === 'ceiling') mesh.visible = false;
    }
    this._startTransition(this.overviewPose.position, this.overviewPose.quaternion, this.overviewPose.orbit ? 'orbit' : 'overview');
  }

  _startTransition(position, quaternion, destination, duration = 700) {
    this.cameraTransition = {
      start: performance.now(), duration, destination,
      fromPosition: this.camera.position.clone(), fromQuaternion: this.camera.quaternion.clone(),
      toPosition: position.clone(), toQuaternion: quaternion.clone(),
      fromFov: this.camera.fov, toFov: this._fovFor(destination),
    };
    this.navigationMode = `transition-${destination}`;
  }

  _finishTransition(destination) {
    this.navigationMode = destination;
    this.cameraTransition = null;
    this.tiltRecalibrate = true; // tilt resumes from the heading the transition ended on
    this.camera.up.set(0, destination === 'overview' ? 0 : 1, destination === 'overview' ? -1 : 0);
    if (destination === 'orbit') {
      // Back on the model's orbit about its saved target (OrbitControls re-derives its angles).
      if (this.overviewPose?.orbit) this.controls.target.copy(this.overviewPose.orbit);
      this._enableOrbit();
      this.controls.update();
    }
    if (destination === 'pov') {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      this.viewYaw = Math.atan2(-direction.x, -direction.z);
      this.viewPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    }
    for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
    this._updateLightShadows();
    this.onNavigationChange?.(destination);
  }

  // Phone tilt look. Must be called from a user gesture: iOS 13+ only grants
  // DeviceOrientationEvent permission from a tap. Resolves to the new state.
  async setTiltEnabled(enabled) {
    if (enabled && typeof DeviceOrientationEvent === 'undefined') return false;
    if (enabled && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false;
      } catch { return false; }
    }
    this.tiltEnabled = !!enabled;
    this.tiltRecalibrate = true;
    this._deviceOrientation = null;
    if (this.tiltEnabled) window.addEventListener('deviceorientation', this._onDeviceOrientation);
    else {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
      if (this.navigationMode === 'pov') {
        // Hand the tilt heading back to drag look, level, without a jump in yaw.
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        this.viewYaw = Math.atan2(-direction.x, -direction.z);
        this.viewPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
        this._applyPovLook();
      }
    }
    return this.tiltEnabled;
  }

  // Device angles → camera quaternion (the three.js DeviceOrientationControls
  // formula), turned about world Y by the yaw offset that keeps the heading the
  // user had when tilt took over.
  _applyTiltLook() {
    const o = this._deviceOrientation;
    if (!o) return;
    const deg = THREE.MathUtils.degToRad;
    const screenAngle = deg(screen.orientation?.angle ?? window.orientation ?? 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(o.beta), deg(o.alpha), -deg(o.gamma), 'YXZ'));
    q.multiply(TILT_Q1).multiply(new THREE.Quaternion().setFromAxisAngle(TILT_Z, -screenAngle));
    if (this.tiltRecalibrate) {
      const now = this.camera.getWorldDirection(new THREE.Vector3());
      const device = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      this.tiltYawOffset = Math.atan2(-now.x, -now.z) - Math.atan2(-device.x, -device.z);
      this.tiltRecalibrate = false;
    }
    this.camera.quaternion.setFromAxisAngle(TILT_Y, this.tiltYawOffset).multiply(q);
  }

  _updateLightShadows() {
    const candidates = [];
    for (const fixture of this.markerLights.children) {
      const source = fixture.children.find((child) => child.isPointLight);
      if (!source) continue;
      source.visible = this.lightingEnabled;
      source.castShadow = false;
      if (this.lightingEnabled && this.navigationMode === 'pov' && fixture.visible && this.markerLights.visible) {
        const position = source.getWorldPosition(new THREE.Vector3());
        candidates.push({ source, distance: position.distanceToSquared(this.camera.position) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const { source } of candidates.slice(0, 2)) source.castShadow = true;
  }

  _applyPovLook() {
    const cosPitch = Math.cos(this.viewPitch);
    this._viewDirection.set(
      -Math.sin(this.viewYaw) * cosPitch,
      Math.sin(this.viewPitch),
      -Math.cos(this.viewYaw) * cosPitch,
    );
    this.camera.lookAt(this.camera.position.clone().add(this._viewDirection));
  }

  _visibleBox() {
    const box = new THREE.Box3();
    for (const mesh of this.house.children) {
      if (mesh.visible && mesh.userData.architecturalRole !== 'ceiling') box.expandByObject(mesh);
    }
    return box.isEmpty() ? null : box;
  }

  frameModel() {
    if (this.navigationMode === 'plan') { this._framePlan(); return; }
    const box = this._visibleBox();
    if (!box) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Always the plan's orientation (owner, 2026-10-12: "Keep the plan"; a portrait screen
    // used to turn a wide house 90°). Plan X across the screen, plan Y up it.
    this.overviewPortrait = this.camera.aspect < 1;
    const [across, down] = [size.x, size.z];
    this.camera.fov = OVERVIEW_FOV;
    this.camera.updateProjectionMatrix();
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const distanceForHeight = down / (2 * Math.tan(vFov / 2));
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distanceForWidth = across / (2 * Math.tan(hFov / 2));
    const distance = Math.max(2, distanceForHeight, distanceForWidth) * 1.12;
    this.overviewDistance = distance;
    this.overviewFitDistance = distance;
    this.overviewPlaneY = box.max.y;
    this.modelFramedFor = this.floorFilter;
    this.navigationMode = 'overview';
    this.controls.enabled = false;
    this.cameraTransition = null;
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(center.x, box.max.y + distance, center.z);
    this.camera.lookAt(center.x, center.y, center.z);
    this.camera.updateMatrixWorld();
    this.overviewPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
    for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
    this._updateLightShadows();
    if (this.realisticEnabled) this._applySun(); // refit the sun's shadow to the shown floors
    this.onNavigationChange?.('overview');
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    if (!this.renderer.xr.isPresenting && this.navigationMode === 'pov') this.camera.fov = this._fovFor('pov');
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    // Phone rotated while in the overview: re-frame so the house fits the new shape.
    if (!this.renderer.xr.isPresenting && this.desktopActive && this.navigationMode === 'overview'
        && this.overviewPortrait != null && this.overviewPortrait !== (this.camera.aspect < 1)) {
      this.frameModel();
    }
  }

  _animate(time, frame) {
    // While presenting, only the XR session's frames render. The sessionstart listener's
    // setAnimationLoop (needed: the XR loop takes its callback from it) also restarts three's
    // window loop, whose calls come here without a frame and rendered the whole scene again,
    // unhidden, into the XR framebuffer: about 6 extra renders per XR frame on the Quest
    // (Proven 2026-10-23 by call stacks at render start; docs/ar-survey.md "Performance notes").
    if (!frame && this.renderer.xr.isPresenting) return;
    if (!this.renderer.xr.isPresenting && this.cameraTransition) {
      const a = Math.min(1, (time - this.cameraTransition.start) / this.cameraTransition.duration);
      const eased = a * a * (3 - 2 * a);
      this.camera.position.lerpVectors(this.cameraTransition.fromPosition, this.cameraTransition.toPosition, eased);
      this.camera.quaternion.slerpQuaternions(this.cameraTransition.fromQuaternion, this.cameraTransition.toQuaternion, eased);
      this.camera.fov = THREE.MathUtils.lerp(this.cameraTransition.fromFov, this.cameraTransition.toFov, eased);
      this.camera.updateProjectionMatrix();
      if (a >= 1) this._finishTransition(this.cameraTransition.destination);
    } else if (!this.renderer.xr.isPresenting && this.tiltEnabled && this.navigationMode === 'pov') {
      this._applyTiltLook();
    } else if (!this.renderer.xr.isPresenting && (this.navigationMode === 'plan' || this.navigationMode === 'orbit')) {
      this.controls.update(); // orbit damping
    }
    if (frame && this.onXRFrame) {
      // CPU cost split for the AR debug HUD: frame logic vs. three's render submission.
      // mr.js reads and resets xrTiming at each HUD refresh.
      const t0 = performance.now();
      this.onXRFrame(time, frame);
      const t1 = performance.now();
      this.renderer.render(this.scene, this.camera);
      this.onXRAfterRender?.();
      const t = this.xrTiming, total = this.xrTimingTotal, gl = performance.now() - t1;
      t.js += t1 - t0; t.gl += gl; t.frames++;
      total.js += t1 - t0; total.gl += gl; total.frames++;
      return;
    }
    this.ruler?.updateLabel();
    if (this.realisticEnabled && this.composer && !this.renderer.xr.isPresenting && this.navigationMode !== 'plan') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
