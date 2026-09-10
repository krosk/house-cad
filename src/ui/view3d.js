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
    // The house is a stack of one mesh per floor, each offset in Y by its
    // elevation. Kept in a group so multi-floor models frame/hide as a unit.
    this.house = new THREE.Group();
    this.scene.add(this.house);
    // While MR is active the extruded walls must stay hidden (the flat plan is
    // shown instead). setGeometry rebuilds on every model change, so it honors
    // this flag rather than a one-time visibility toggle.
    this.hideMesh = false;

    this._onResize = this._resize.bind(this);
    window.addEventListener('resize', this._onResize);
    // Also react to splitter drags / layout changes.
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(container);

    this._animate = this._animate.bind(this);
    this.renderer.setAnimationLoop(this._animate);
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

    for (const { geometry, elevation } of list) {
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.y = elevation || 0;
      this.house.add(mesh);
    }
    this.house.visible = !this.hideMesh; // stay hidden if MR is showing the flat plan
  }

  frameModel() {
    if (!this.house.children.length) return;
    const box = new THREE.Box3().setFromObject(this.house);
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
    if (!this.renderer.xr.isPresenting) this.controls.update();
    if (frame && this.onXRFrame) this.onXRFrame(time, frame);
    this.renderer.render(this.scene, this.camera);
  }
}
