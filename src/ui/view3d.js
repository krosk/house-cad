// The 3D viewport: a Three.js scene with orbit controls and a ground grid.
// Call setGeometry() whenever the model changes to replace the house mesh.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
    this.renderer.shadowMap.enabled = true;
    this.renderer.xr.enabled = true; // harmless on desktop; required for WebXR
    container.appendChild(this.renderer.domElement);

    // Optional per-frame hook, set by the MR module; receives (time, XRFrame).
    this.onXRFrame = null;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1, 0);

    // View-only first-person navigation. Camera state is local to this browser
    // session and never enters the project or its shared-view payload.
    this.walkMode = false;
    this.eyeHeight = 1.65;
    this.walkSpeed = 2.2;
    this.walkYaw = 0;
    this.walkPitch = 0;
    this.walkKeys = new Set();
    this.walkPointer = null;
    this.walkRaycaster = new THREE.Raycaster();
    this.walkNdc = new THREE.Vector2();
    this._walkDirection = new THREE.Vector3();
    this._walkRight = new THREE.Vector3();
    this._lastTime = null;

    // Lighting.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(12, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 30;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    this.scene.add(sun);

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
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x8995a3,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xd7dee7,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0xe4e8ed,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    // The house is a stack of one mesh per floor, each offset in Y by its
    // elevation. Kept in a group so multi-floor models frame/hide as a unit.
    this.house = new THREE.Group();
    this.scene.add(this.house);
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
    this.renderer.setAnimationLoop(this._animate);

    this.renderer.domElement.addEventListener('pointerdown', this._walkPointerDown.bind(this));
    this.renderer.domElement.addEventListener('pointermove', this._walkPointerMove.bind(this));
    this.renderer.domElement.addEventListener('pointerup', this._walkPointerUp.bind(this));
    this.renderer.domElement.addEventListener('pointercancel', this._walkPointerUp.bind(this));
    window.addEventListener('keydown', this._walkKeyDown.bind(this));
    window.addEventListener('keyup', this._walkKeyUp.bind(this));
  }

  // Accepts an array of { geometry, elevation } (one per floor) or a single
  // BufferGeometry (treated as one floor at elevation 0). Rebuilds the stacked
  // house group on every model change.
  setGeometry(floors) {
    for (const m of this.house.children) m.geometry.dispose();
    this.house.clear();

    const list = Array.isArray(floors)
      ? floors
      : (floors ? [{ geometry: floors, elevation: 0 }] : []);

    for (const entry of list) {
      const { geometry, floorGeometry, wallGeometry, ceilingGeometry, elevation, floorId, name } = entry;
      const parts = geometry
        ? [[geometry, this.material, 'massing']]
        : [
          [floorGeometry, this.floorMaterial, 'floor'],
          [wallGeometry, this.wallMaterial, 'walls'],
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
    }
    this.house.visible = !this.hideMesh; // stay hidden if MR is showing the flat plan
  }

  setFloorFilter(floorId = null) {
    this.floorFilter = floorId;
    for (const mesh of this.house.children) {
      mesh.visible = this._meshVisible(mesh);
    }
    this.frameModel();
  }

  setWalkMode(enabled) {
    this.walkMode = Boolean(enabled);
    this.controls.enabled = !this.walkMode;
    this.walkKeys.clear();
    this.walkPointer = null;
    for (const mesh of this.house.children) mesh.visible = this._meshVisible(mesh);
    if (this.walkMode) {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      this.walkYaw = Math.atan2(-direction.x, -direction.z);
      this.walkPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
      this._applyWalkLook();
    } else {
      // Hand control back to OrbitControls around the place being viewed,
      // rather than its stale pre-walk target on the model overview.
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      this.controls.target.copy(this.camera.position).addScaledVector(direction, 3);
      this.controls.update();
    }
  }

  _meshVisible(mesh) {
    const onSelectedFloor = this.floorFilter == null || mesh.userData.floorId === this.floorFilter;
    return onSelectedFloor && (mesh.userData.architecturalRole !== 'ceiling' || this.walkMode);
  }

  setWalkMotion(direction, active) {
    if (active) this.walkKeys.add(direction);
    else this.walkKeys.delete(direction);
  }

  _walkKeyDown(event) {
    if (!this.walkMode) return;
    const direction = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' }[event.code];
    if (!direction) {
      if (event.code === 'Escape') this.onWalkExit?.();
      return;
    }
    event.preventDefault();
    this.walkKeys.add(direction);
  }

  _walkKeyUp(event) {
    const direction = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' }[event.code];
    if (direction) this.walkKeys.delete(direction);
  }

  _walkPointerDown(event) {
    if (!this.walkMode || event.button !== 0) return;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.walkPointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
  }

  _walkPointerMove(event) {
    const p = this.walkPointer;
    if (!this.walkMode || !p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    if (Math.hypot(event.clientX - p.startX, event.clientY - p.startY) > 6) p.moved = true;
    if (!p.moved) return;
    this.walkYaw -= dx * 0.005;
    this.walkPitch = THREE.MathUtils.clamp(this.walkPitch - dy * 0.005, -Math.PI * 0.48, Math.PI * 0.48);
    this._applyWalkLook();
  }

  _walkPointerUp(event) {
    const p = this.walkPointer;
    if (!p || p.id !== event.pointerId) return;
    if (this.walkMode && !p.moved) this._teleportFromPointer(event.clientX, event.clientY);
    this.walkPointer = null;
  }

  _teleportFromPointer(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.walkNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.walkRaycaster.setFromCamera(this.walkNdc, this.camera);
    const floors = this.house.children.filter((mesh) => mesh.visible && mesh.userData.architecturalRole === 'floor');
    const hit = this.walkRaycaster.intersectObjects(floors, false)[0];
    if (!hit) return;
    this.camera.position.set(hit.point.x, hit.point.y + this.eyeHeight, hit.point.z);
    // A placed POV starts level even if the overview camera was looking steeply
    // down at the plan. The current compass bearing is preserved.
    this.walkPitch = 0;
    this._applyWalkLook();
  }

  _applyWalkLook() {
    const cosPitch = Math.cos(this.walkPitch);
    this._walkDirection.set(
      -Math.sin(this.walkYaw) * cosPitch,
      Math.sin(this.walkPitch),
      -Math.cos(this.walkYaw) * cosPitch,
    );
    this.camera.lookAt(this.camera.position.clone().add(this._walkDirection));
  }

  _updateWalk(dt) {
    if (!this.walkMode || !this.walkKeys.size) return;
    this._walkDirection.set(-Math.sin(this.walkYaw), 0, -Math.cos(this.walkYaw));
    this._walkRight.set(-this._walkDirection.z, 0, this._walkDirection.x);
    const movement = new THREE.Vector3();
    if (this.walkKeys.has('forward')) movement.add(this._walkDirection);
    if (this.walkKeys.has('back')) movement.sub(this._walkDirection);
    if (this.walkKeys.has('right')) movement.add(this._walkRight);
    if (this.walkKeys.has('left')) movement.sub(this._walkRight);
    if (movement.lengthSq()) this.camera.position.addScaledVector(movement.normalize(), this.walkSpeed * dt);
  }

  frameModel() {
    if (!this.house.children.length) return;
    const box = new THREE.Box3();
    for (const mesh of this.house.children) {
      if (mesh.visible) box.expandByObject(mesh);
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(center);
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate(time, frame) {
    // In an XR session the headset drives the camera, so skip orbit controls.
    const dt = this._lastTime == null ? 0 : Math.min(0.1, (time - this._lastTime) / 1000);
    this._lastTime = time;
    if (!this.renderer.xr.isPresenting) {
      if (this.walkMode) this._updateWalk(dt);
      else this.controls.update();
    }
    if (frame && this.onXRFrame) this.onXRFrame(time, frame);
    this.renderer.render(this.scene, this.camera);
  }
}
