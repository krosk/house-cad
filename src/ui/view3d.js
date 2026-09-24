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
        if (marker.type !== 'light') continue;
        const fixture = new THREE.Group();
        fixture.userData.floorId = floorId || null;
        fixture.userData.markerId = marker.id || null;
        fixture.position.set(
          Number(marker.x) || 0,
          (elevation || 0) + (Number.isFinite(marker.z) ? marker.z : (entry.height || 2.5)),
          -(Number(marker.y) || 0),
        );

        // A small emissive ceiling puck makes the source legible even where its
        // illumination is washed out by daylight. The actual source sits just
        // below the authored marker to avoid embedding it in the ceiling slab.
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
        fixture.visible = this.floorFilter == null || fixture.userData.floorId === this.floorFilter;
        this.markerLights.add(fixture);
      }
    }
    this.house.visible = !this.hideMesh; // stay hidden if MR is showing the flat plan
    this.markerLights.visible = !this.hideMesh;
    this._updateLightShadows();
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
