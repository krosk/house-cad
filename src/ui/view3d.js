// The 3D viewport: a Three.js scene with constrained overview/POV navigation.
// Call setGeometry() whenever the model changes to replace the house mesh.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function canvasTexture(size, paint, { repeat = 1, color = true, anisotropy = 1 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = anisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function woodTextures(anisotropy) {
  const paint = (ctx, size, relief = false) => {
    ctx.fillStyle = relief ? '#888' : '#b98550';
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const rowH = size / rows;
    for (let row = 0; row < rows; row++) {
      const y = row * rowH;
      const offset = row % 2 ? size * 0.5 : 0;
      for (let x = -offset; x < size; x += size) {
        if (!relief) {
          const shade = 174 + ((row * 23 + Math.round(x)) % 19);
          ctx.fillStyle = `rgb(${shade},${Math.round(shade * 0.72)},${Math.round(shade * 0.43)})`;
          ctx.fillRect(x + 1, y + 1, size - 2, rowH - 2);
        }
        ctx.strokeStyle = relief ? '#666' : 'rgba(65,37,18,.35)';
        ctx.lineWidth = relief ? 3 : 1.5;
        ctx.strokeRect(x, y, size, rowH);
      }
      // Long, low-contrast grain follows the board direction.
      for (let line = 0; line < 5; line++) {
        const gy = y + ((line * 13 + row * 7) % Math.max(1, rowH - 5)) + 2;
        ctx.strokeStyle = relief ? 'rgba(150,150,150,.3)' : 'rgba(74,40,18,.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= size; x += 16) {
          const wave = Math.sin((x + row * 31 + line * 17) * 0.035) * 2;
          if (x === 0) ctx.moveTo(x, gy + wave); else ctx.lineTo(x, gy + wave);
        }
        ctx.stroke();
      }
    }
  };
  return {
    map: canvasTexture(512, (ctx, size) => paint(ctx, size), { anisotropy }),
    bumpMap: canvasTexture(512, (ctx, size) => paint(ctx, size, true), { color: false, anisotropy }),
  };
}

function plasterTextures(anisotropy) {
  const paint = (ctx, size, relief = false) => {
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const p = i / 4;
      // Deterministic fine mottling: enough to catch light without visual noise.
      const noise = ((p * 73 + Math.floor(p / size) * 151) % 17) - 8;
      const value = relief ? 128 + noise * 2 : 239 + Math.round(noise * 0.35);
      image.data[i] = value;
      image.data[i + 1] = relief ? value : value - 1;
      image.data[i + 2] = relief ? value : value - 3;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  };
  return {
    map: canvasTexture(256, (ctx, size) => paint(ctx, size), { repeat: 3, anisotropy }),
    bumpMap: canvasTexture(256, (ctx, size) => paint(ctx, size, true), { repeat: 3, color: false, anisotropy }),
  };
}

export class View3D {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d23);

    const { clientWidth: w, clientHeight: h } = container;
    this.camera = new THREE.PerspectiveCamera(50, w / Math.max(1, h), 0.1, 1000);
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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // Kept for the MR lifecycle, which temporarily saves/disables this field.
    // Desktop navigation below is intentionally limited to two custom modes.
    this.controls.enabled = false;
    this.controls.target.set(0, 1, 0);

    // OVERVIEW: fixed top-down camera; dragging pans on the plan X/Y plane.
    // POV: fixed position at eye height; dragging changes viewing direction.
    // A tap animates between them. Nothing here enters project/share data.
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
    this.cameraTransition = null;

    // Lighting.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.9);
    this.scene.add(hemi);
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
    this.lightingEnabled = false;

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
    this.lightFixtureGeometry = new THREE.CylinderGeometry(0.11, 0.11, 0.035, 24);
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
    this.markerWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.62 });
    this.markerDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x26313a, roughness: 0.58 });
    this.markerAccentMaterials = new Map();
    // The house is a stack of one mesh per floor, each offset in Y by its
    // elevation. Kept in a group so multi-floor models frame/hide as a unit.
    this.house = new THREE.Group();
    this.scene.add(this.house);
    this.markerLights = new THREE.Group();
    this.scene.add(this.markerLights);
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
    for (const m of this.house.children) m.geometry.dispose();
    this.house.clear();
    this.markerLights.clear();

    const list = Array.isArray(floors)
      ? floors
      : (floors ? [{ geometry: floors, elevation: 0 }] : []);

    for (const entry of list) {
      const {
        geometry, floorGeometry, wallGeometry, ceilingGeometry,
        doorGeometry, windowGeometry, outlineGeometry, stairGeometry, elevation, floorId, name,
        constraints, rectangles,
      } = entry;
      const parts = geometry
        ? [[geometry, this.material, 'massing']]
        : [
          [floorGeometry, this.floorMaterial, 'floor'],
          [wallGeometry, this.wallMaterial, 'walls'],
          [doorGeometry, this.doorMaterial, 'doors'],
          [windowGeometry, this.windowMaterial, 'windows'],
          [stairGeometry, this.stairMaterial, 'stairs'],
          [ceilingGeometry, this.ceilingMaterial, 'ceiling'],
        ];
      for (const [partGeometry, material, role] of parts) {
        if (!partGeometry) continue;
        const mesh = new THREE.Mesh(partGeometry, material);
        mesh.castShadow = role !== 'floor';
        mesh.receiveShadow = true;
        mesh.position.y = elevation || 0;
        mesh.userData.floorId = floorId || null;
        mesh.userData.floorName = name || '';
        mesh.userData.architecturalRole = role;
        mesh.visible = this._meshVisible(mesh);
        this.house.add(mesh);
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
      for (const marker of entry.markers || []) {
        const fixture = marker.type === 'light'
          ? this._lightMarkerFixture(marker)
          : this._wallMarkerFixture(marker, { constraints, rectangles });
        fixture.userData.floorId = floorId || null;
        fixture.userData.markerId = marker.id || null;
        fixture.position.set(
          Number(marker.x) || 0,
          (elevation || 0) + (Number.isFinite(marker.z)
            ? marker.z
            : (marker.type === 'light' ? (entry.height || 2.5) : 1.1)),
          -(Number(marker.y) || 0),
        );

        fixture.visible = this.floorFilter == null || fixture.userData.floorId === this.floorFilter;
        this.markerLights.add(fixture);
      }
    }
    this.house.visible = !this.hideMesh; // stay hidden if MR is showing the flat plan
    this.markerLights.visible = !this.hideMesh;
    this._updateLightShadows();
  }

  _markerAccent(type) {
    const colors = {
      outlet: 0xd8dee5, outlet_shutter: 0x60a5fa, outlet_aircon: 0x38bdf8,
      outlet_cooktop: 0xef4444, outlet_oven: 0xf97316,
      outlet_water_heater: 0x06b6d4, outlet_appliance: 0xeab308,
      switch: 0xcbd5e1, ethernet: 0x3b82f6, ethernet_dual: 0x2563eb,
      tv_antenna: 0xa855f7, camera_ethernet: 0x14b8a6,
      patch_panel: 0x6366f1, intercom: 0x84cc16, panel: 0xf59e0b, breaker: 0xef4444,
    };
    const color = colors[type] ?? 0x94a3b8;
    if (!this.markerAccentMaterials.has(color)) {
      this.markerAccentMaterials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
    }
    return this.markerAccentMaterials.get(color);
  }

  _lightMarkerFixture() {
    const fixture = new THREE.Group();
    // A small emissive ceiling puck makes the source legible even in basic mode.
    const puck = new THREE.Mesh(this.lightFixtureGeometry, this.lightFixtureMaterial);
    puck.position.y = -0.025;
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

  _markerWallAxis(marker, entry) {
    for (const c of entry.constraints || []) {
      if (c.a?.marker !== marker.id && c.b?.marker !== marker.id) continue;
      const ref = c.a?.marker === marker.id ? c.b : c.a;
      if (ref?.edge === 'left' || ref?.edge === 'right') return 'x';
      if (ref?.edge === 'top' || ref?.edge === 'bottom') return 'y';
    }
    let best = { distance: Infinity, axis: 'y' };
    for (const rect of entry.rectangles || []) {
      const b = rect.bounds;
      for (const [distance, axis] of [
        [Math.abs(marker.x - b.x0), 'x'], [Math.abs(marker.x - b.x1), 'x'],
        [Math.abs(marker.y - b.y0), 'y'], [Math.abs(marker.y - b.y1), 'y'],
      ]) if (distance < best.distance) best = { distance, axis };
    }
    return best.axis;
  }

  _wallMarkerFixture(marker, entry) {
    const fixture = new THREE.Group();
    const type = marker.type || 'outlet';
    const size = type === 'panel' ? [0.38, 0.50, 0.055]
      : type === 'patch_panel' ? [0.30, 0.14, 0.045]
        : type === 'intercom' ? [0.13, 0.22, 0.038]
          : type === 'breaker' ? [0.10, 0.18, 0.04]
            : type === 'camera_ethernet' ? [0.11, 0.09, 0.06]
              : [0.085, 0.085, 0.022];
    const body = new THREE.Mesh(this.markerBoxGeometry, this.markerWhiteMaterial);
    body.scale.set(...size);
    body.castShadow = true;
    fixture.add(body);
    const frontZ = size[2] / 2 + 0.005;
    const addBox = (x, y, w, h, d = 0.008, material = this.markerDarkMaterial) => {
      const mesh = new THREE.Mesh(this.markerBoxGeometry, material);
      mesh.scale.set(w, h, d); mesh.position.set(x, y, frontZ + d / 2); fixture.add(mesh);
    };
    const addSocket = (x, y, radius, material = this.markerDarkMaterial) => {
      const mesh = new THREE.Mesh(this.markerSocketGeometry, material);
      mesh.scale.set(radius, radius, 0.006); mesh.position.set(x, y, frontZ + 0.003); fixture.add(mesh);
    };
    const accent = this._markerAccent(type);
    if (type === 'switch') {
      addBox(0, 0, 0.045, 0.057, 0.009, accent);
      addBox(0, 0, 0.038, 0.002, 0.011, this.markerDarkMaterial);
    } else if (type === 'ethernet' || type === 'ethernet_dual') {
      const ys = type === 'ethernet_dual' ? [-0.018, 0.018] : [0];
      for (const y of ys) { addBox(0, y, 0.044, 0.022, 0.008, accent); addBox(0, y, 0.028, 0.010); }
    } else if (type === 'patch_panel') {
      for (let i = 0; i < 6; i++) addBox(-0.105 + i * 0.042, 0, 0.028, 0.035, 0.008, i % 2 ? accent : this.markerDarkMaterial);
    } else if (type === 'panel') {
      addBox(0, 0, 0.30, 0.39, 0.012, accent);
      for (let i = -2; i <= 2; i++) addBox(0, i * 0.058, 0.24, 0.012, 0.014, this.markerDarkMaterial);
    } else if (type === 'breaker') {
      addBox(0, 0.035, 0.055, 0.055, 0.012, accent);
      addBox(0, -0.045, 0.04, 0.045, 0.014, this.markerDarkMaterial);
    } else if (type === 'intercom') {
      for (let i = -1; i <= 1; i++) addBox(0, 0.045 + i * 0.018, 0.065, 0.006);
      addSocket(0, -0.055, 0.018, accent);
    } else if (type === 'camera_ethernet') {
      addBox(0, 0, 0.075, 0.045, 0.045, accent);
      addSocket(0, 0, 0.018, this.markerDarkMaterial);
    } else if (type === 'tv_antenna') {
      addSocket(0, 0, 0.024, accent); addSocket(0, 0, 0.010, this.markerDarkMaterial);
    } else {
      // Every outlet variant keeps the recognizable circular socket while its
      // application-specific accent identifies shutter/HVAC/high-current uses.
      addSocket(0, 0, 0.026, accent);
      addSocket(0, 0, 0.014, this.markerDarkMaterial);
      addBox(0, 0.020, 0.006, 0.011, 0.008, this.markerWhiteMaterial); // Type-E earth pin
    }
    if (this._markerWallAxis(marker, entry) === 'x') fixture.rotation.y = Math.PI / 2;
    return fixture;
  }

  setFloorFilter(floorId = null) {
    this.floorFilter = floorId;
    for (const mesh of this.house.children) {
      mesh.visible = this._meshVisible(mesh);
    }
    for (const fixture of this.markerLights.children) {
      fixture.visible = floorId == null || fixture.userData.floorId === floorId;
    }
    this._updateLightShadows();
    this.frameModel();
  }

  // Performance switch for older mobile GPUs. Basic mode keeps the hemisphere plus
  // one shadowless directional light so corners remain readable, while disabling
  // marker point lights and every shadow render pass. Fixture meshes remain visible.
  setLightingEnabled(enabled) {
    this.lightingEnabled = !!enabled;
    this.renderer.shadowMap.enabled = this.lightingEnabled;
    this.sun.visible = true;
    this.sun.castShadow = this.lightingEnabled;
    this.floor.receiveShadow = this.lightingEnabled;
    for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
    this._updateLightShadows();
  }

  _meshVisible(mesh) {
    const onSelectedFloor = this.floorFilter == null || mesh.userData.floorId === this.floorFilter;
    const role = mesh.userData.architecturalRole;
    if (role === 'outlines' && this.lightingEnabled) return false;
    return onSelectedFloor && (role !== 'ceiling' || this.navigationMode === 'pov');
  }

  _viewPointerDown(event) {
    if (event.button !== 0 || this.cameraTransition) return;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.viewPointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
  }

  _viewPointerMove(event) {
    const p = this.viewPointer;
    if (!p || p.id !== event.pointerId || this.cameraTransition) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    if (Math.hypot(event.clientX - p.startX, event.clientY - p.startY) > 6) p.moved = true;
    if (!p.moved) return;
    if (this.navigationMode === 'overview') {
      const visibleHeight = 2 * this.overviewDistance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const metresPerPixel = visibleHeight / Math.max(1, this.renderer.domElement.clientHeight);
      this.camera.position.x -= dx * metresPerPixel;
      this.camera.position.z -= dy * metresPerPixel;
      this.overviewPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
    } else if (this.navigationMode === 'pov') {
      this.viewYaw -= dx * 0.005;
      this.viewPitch = THREE.MathUtils.clamp(this.viewPitch - dy * 0.005, -Math.PI * 0.48, Math.PI * 0.48);
      this._applyPovLook();
    }
  }

  _viewPointerUp(event) {
    const p = this.viewPointer;
    if (!p || p.id !== event.pointerId) return;
    if (!p.moved && !this.cameraTransition) {
      if (this.navigationMode === 'overview') this._enterPovFromPointer(event.clientX, event.clientY);
      else if (this.navigationMode === 'pov') this._returnToOverview();
    }
    this.viewPointer = null;
  }

  _enterPovFromPointer(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.viewNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.viewRaycaster.setFromCamera(this.viewNdc, this.camera);
    const floors = this.house.children.filter((mesh) => mesh.visible && mesh.userData.architecturalRole === 'floor');
    const hit = this.viewRaycaster.intersectObjects(floors, false)[0];
    if (!hit) return;
    this.overviewPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
    const endPosition = new THREE.Vector3(hit.point.x, hit.point.y + this.eyeHeight, hit.point.z);
    const box = this._visibleBox();
    const center = box?.getCenter(new THREE.Vector3()) || new THREE.Vector3(endPosition.x, endPosition.y, endPosition.z - 1);
    center.y = endPosition.y;
    if (center.distanceToSquared(endPosition) < 1e-6) center.z -= 1;
    const matrix = new THREE.Matrix4().lookAt(endPosition, center, new THREE.Vector3(0, 1, 0));
    const endQuaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    this._startTransition(endPosition, endQuaternion, 'pov');
  }

  _returnToOverview() {
    if (!this.overviewPose) return;
    for (const mesh of this.house.children) {
      if (mesh.userData.architecturalRole === 'ceiling') mesh.visible = false;
    }
    this._startTransition(this.overviewPose.position, this.overviewPose.quaternion, 'overview');
  }

  _startTransition(position, quaternion, destination) {
    this.cameraTransition = {
      start: performance.now(), duration: 700, destination,
      fromPosition: this.camera.position.clone(), fromQuaternion: this.camera.quaternion.clone(),
      toPosition: position.clone(), toQuaternion: quaternion.clone(),
    };
    this.navigationMode = `transition-${destination}`;
  }

  _finishTransition(destination) {
    this.navigationMode = destination;
    this.cameraTransition = null;
    this.camera.up.set(0, destination === 'pov' ? 1 : 0, destination === 'pov' ? 0 : -1);
    if (destination === 'pov') {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      this.viewYaw = Math.atan2(-direction.x, -direction.z);
      this.viewPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    }
    for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
    this._updateLightShadows();
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
    const box = this._visibleBox();
    if (!box) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const distanceForHeight = size.z / (2 * Math.tan(vFov / 2));
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distanceForWidth = size.x / (2 * Math.tan(hFov / 2));
    const distance = Math.max(2, distanceForHeight, distanceForWidth) * 1.12;
    this.overviewDistance = distance;
    this.navigationMode = 'overview';
    this.cameraTransition = null;
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(center.x, box.max.y + distance, center.z);
    this.camera.lookAt(center.x, center.y, center.z);
    this.overviewPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
    for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
    this._updateLightShadows();
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate(time, frame) {
    if (!this.renderer.xr.isPresenting && this.cameraTransition) {
      const a = Math.min(1, (time - this.cameraTransition.start) / this.cameraTransition.duration);
      const eased = a * a * (3 - 2 * a);
      this.camera.position.lerpVectors(this.cameraTransition.fromPosition, this.cameraTransition.toPosition, eased);
      this.camera.quaternion.slerpQuaternions(this.cameraTransition.fromQuaternion, this.cameraTransition.toQuaternion, eased);
      if (a >= 1) this._finishTransition(this.cameraTransition.destination);
    }
    if (frame && this.onXRFrame) this.onXRFrame(time, frame);
    this.renderer.render(this.scene, this.camera);
  }
}
