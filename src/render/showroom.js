import * as THREE from 'three';
import { createCarModel, setCarPaint } from './car.js';
import { envTexture, textTexture, softCircleTexture, starTexture } from './textures.js';

export class Showroom {
  constructor(store, aspect = 16 / 9, quality = 1) {
    this.store = store;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060f);
    this.scene.fog = new THREE.FogExp2(0x080a18, 0.018);
    this.scene.environment = envTexture('night');
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 500);
    this.camera.position.set(6.4, 3.0, 7.6);
    this.camera.lookAt(0, 0.9, 0);
    this.spin = 0;
    this.cameraAngle = 0.72;
    this.layout = 'menu';
    this.pan = 0;
    this.viewWidth = 1920;
    this.dragging = false;
    this.dragVelocity = 0;
    this.lastPointerX = 0;
    this.interactive = false;
    this.pointerHandlers = null;

    this.buildStudio();
    this.buildCar();
    this.buildParticles();
    this.resize(aspect);
  }

  buildStudio() {
    const scene = this.scene;
    const accent = new THREE.Color(this.store.save.paint.underglow !== 'none'
      ? this.store.getGlowHex() : '#ff2e88');

    scene.add(new THREE.HemisphereLight(0x7a8dff, 0x0a0a12, 0.7));

    const key = new THREE.SpotLight(0xffffff, 320, 40, Math.PI / 5.5, 0.55, 1.6);
    key.position.set(3.5, 9, 6);
    key.target.position.set(0, 0.5, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(this.quality > 0.8 ? 1024 : 512, this.quality > 0.8 ? 1024 : 512);
    scene.add(key, key.target);

    const rimA = new THREE.PointLight(0x2ff5ff, 55, 22, 2);
    rimA.position.set(-6, 3.2, -2.5);
    scene.add(rimA);
    const rimB = new THREE.PointLight(0xff2e88, 50, 22, 2);
    rimB.position.set(5.5, 2.6, -5);
    scene.add(rimB);
    const fill = new THREE.PointLight(0x8b5cff, 30, 18, 2);
    fill.position.set(-1, 1.5, 7);
    scene.add(fill);

    // Glossy floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(18, 72),
      new THREE.MeshStandardMaterial({
        color: 0x0c0e18, metalness: 0.9, roughness: 0.22, envMapIntensity: 1.1
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    // Platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 3.7, 0.24, 64),
      new THREE.MeshStandardMaterial({ color: 0x12141f, metalness: 0.9, roughness: 0.25 })
    );
    platform.position.y = 0.12;
    platform.receiveShadow = true;
    scene.add(platform);

    const ringMat = new THREE.MeshBasicMaterial({ color: accent });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.035, 8, 80), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.012, 6, 64), new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.26;
    scene.add(ring2);

    // Backdrop rings
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(4.6 + i * 1.25, 0.025, 6, 96),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0xff2e88 : 0x2ff5ff,
          transparent: true, opacity: 0.8 - i * 0.18
        })
      );
      r.position.set(0, 3.6, -6 - i * 1.7);
      scene.add(r);
    }

    // Brand text
    const brandTex = textTexture('APEX DRIFT', {
      w: 1024, h: 256, bg: 'transparent', color: '#ffffff',
      font: '900 138px Orbitron, sans-serif', sub: 'SUNSET GRAND PRIX'
    });
    const brand = new THREE.Mesh(
      new THREE.PlaneGeometry(10.2, 2.55),
      new THREE.MeshBasicMaterial({ map: brandTex, transparent: true, opacity: 0.24, depthWrite: false })
    );
    brand.position.set(0, 4.9, -9.5);
    scene.add(brand);

    // Side neon slats
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 5.5, 0.06),
          new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2ff5ff : 0xff2e88 })
        );
        bar.position.set(side * (5.5 + i * 1.5), 3.0, -4.2 - i * 1.2);
        scene.add(bar);
      }
    }

    // Volumetric-ish beams
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x8fc9ff, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 13, 16, 1, true), beamMat);
      beam.position.set(side * 4.2, 6.4, -2.5);
      beam.rotation.z = side * 0.25;
      scene.add(beam);
    }

    // Fake contact shadow
    const shadowTex = softCircleTexture();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(6.6, 8.4),
      new THREE.MeshBasicMaterial({
        map: shadowTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.27;
    this.contactShadow = shadow;
    scene.add(shadow);
  }

  buildCar() {
    const color = new THREE.Color(this.store.getPaintHex());
    const glow = this.store.getGlowHex();
    this.car = createCarModel({
      color,
      accent: 0xffd166,
      accent2: new THREE.Color(glow || '#2ff5ff'),
      finish: this.store.getFinish(),
      // Always build the glow mesh so the player can switch it on later.
      underglow: new THREE.Color(glow || '#2ff5ff'),
      number: 7,
      quality: this.quality,
      showLights: false
    });
    this.car.group.position.y = 0.26;
    this.car.group.traverse(o => {
      if (o.isMesh) o.castShadow = true;
    });
    this.scene.add(this.car.group);
    this.refresh();
  }

  buildParticles() {
    const count = this.quality > 0.8 ? 220 : 110;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set([
        (Math.random() - 0.5) * 20,
        0.4 + Math.random() * 7,
        -12 + Math.random() * 15
      ], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      map: starTexture(), color: 0x9feaff, size: 0.09, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.scene.add(this.motes);
  }

  refresh() {
    const glow = this.store.getGlowHex();
    setCarPaint(this.car, {
      color: new THREE.Color(this.store.getPaintHex()),
      finish: this.store.getFinish(),
      underglow: glow ? new THREE.Color(glow) : null
    });
  }

  setLayout(layout) {
    this.layout = layout;
  }

  setInteractive(v) {
    this.interactive = v;
    if (v && !this.pointerHandlers) {
      const down = e => {
        if (e.target.closest && e.target.closest('.page, .overlay, button, input, .panel, .garage-panel, .topbar, .dock')) return;
        this.dragging = true;
        this.lastPointerX = e.clientX;
        this.dragVelocity = 0;
      };
      const move = e => {
        if (!this.dragging) return;
        const dx = e.clientX - this.lastPointerX;
        this.lastPointerX = e.clientX;
        this.car.group.rotation.y += dx * 0.012;
        this.dragVelocity = dx * 0.012;
      };
      const up = () => { this.dragging = false; };
      this.pointerHandlers = { down, move, up };
      window.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
    if (!v && this.pointerHandlers) {
      window.removeEventListener('pointerdown', this.pointerHandlers.down);
      window.removeEventListener('pointermove', this.pointerHandlers.move);
      window.removeEventListener('pointerup', this.pointerHandlers.up);
      window.removeEventListener('pointercancel', this.pointerHandlers.up);
      this.pointerHandlers = null;
      this.dragging = false;
    }
  }

  update(dt, elapsed) {
    if (!this.dragging) {
      this.car.group.rotation.y += dt * 0.16 + this.dragVelocity;
      this.dragVelocity *= Math.exp(-dt * 3.2);
    }
    this.car.group.position.y = 0.26 + Math.sin(elapsed * 1.2) * 0.008;
    this.cameraAngle = 0.58 + Math.sin(elapsed * 0.14) * 0.3;
    const portrait = this.camera.aspect < 1;
    const radius = (this.layout === 'garage' ? 7.1 : 7.6) * (portrait ? 1.16 : 1);
    const height = (this.layout === 'garage' ? 2.75 : 2.9) * (portrait ? 1.04 : 1);
    this.camera.position.x = Math.sin(this.cameraAngle) * radius;
    this.camera.position.z = Math.cos(this.cameraAngle) * radius;
    this.camera.position.y = height + Math.sin(elapsed * 0.4) * 0.08;

    const target = new THREE.Vector3(0, 0.95, 0);
    // Shift the car to the left when the garage panel is open on desktop.
    const wantedPan = this.layout === 'garage' && this.viewWidth > 980 ? 1.55 : 0;
    this.pan += (wantedPan - this.pan) * Math.min(1, dt * 3);
    const fwd = new THREE.Vector3(-this.camera.position.x, 0, -this.camera.position.z).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    target.addScaledVector(right, -this.pan);
    this.camera.lookAt(target);
    this.motes.rotation.y += dt * 0.012;
    if (this.car.glowMat) this.car.glowMat.opacity = 0.5 + Math.sin(elapsed * 3) * 0.12;
  }

  resize(aspect, width = 1920) {
    this.viewWidth = width;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.85 ? 54 : aspect < 1.25 ? 46 : 38;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.setInteractive(false);
    const mats = new Set();
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) mats.add(m);
      }
    });
    for (const m of mats) m.dispose();
  }
}
