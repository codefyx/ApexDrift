import * as THREE from 'three';
import { softCircleTexture, smokeTexture } from './textures.js';

class Pool {
  constructor(scene, { count, color, size, additive = false, texture = 'soft', opacity = 1 }) {
    this.count = count;
    this.cursor = 0;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.baseSize = new Float32Array(count);
    this.gravity = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.fade = new Float32Array(count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture === 'smoke' ? smokeTexture() : softCircleTexture() },
        uColor: { value: new THREE.Color(color) },
        uScale: { value: 500 },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float a = tex.a * vAlpha * uOpacity;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 4;
    scene.add(this.points);
    // Hide everything initially.
    for (let i = 0; i < count; i++) this.positions[i * 3 + 1] = -9999;
  }

  setScale(scale) {
    this.material.uniforms.uScale.value = scale;
  }

  spawn(x, y, z, vx, vy, vz, life, size, opts = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;
    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = opts.alpha ?? 1;
    this.gravity[i] = opts.gravity ?? 0;
    this.drag[i] = opts.drag ?? 1.4;
    this.fade[i] = opts.fade ?? 1;
  }

  update(dt) {
    const p = this.positions, v = this.velocities;
    let alive = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      alive = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const drag = Math.exp(-this.drag[i] * dt);
      v[i3] *= drag;
      v[i3 + 1] = v[i3 + 1] * drag - this.gravity[i] * dt;
      v[i3 + 2] *= drag;
      p[i3] += v[i3] * dt;
      p[i3 + 1] += v[i3 + 1] * dt;
      p[i3 + 2] += v[i3 + 2] * dt;
      const fadeCurve = Math.min(1, t * 3.2);
      this.alpha[i] = fadeCurve * Math.min(1, t * 1.5) * (0.35 + 0.65 * t);
      this.size[i] = this.baseSize[i] * (1.6 - t * 0.6);
      if (this.life[i] <= 0) this.alpha[i] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
    if (!alive) this.points.visible = false;
    else this.points.visible = true;
  }
}

export class ParticleFX {
  constructor(scene) {
    this.smoke = new Pool(scene, { count: 220, color: 0xbfc2c9, size: 1.5, texture: 'smoke' });
    this.dust = new Pool(scene, { count: 160, color: 0xc9a97e, size: 1.7, texture: 'smoke', opacity: 0.8 });
    this.sparks = new Pool(scene, { count: 130, color: 0xffb347, size: 0.7, additive: true });
    this.nitro = new Pool(scene, { count: 140, color: 0x54e8ff, size: 1.1, additive: true });
    this.debris = new Pool(scene, { count: 90, color: 0xff5d3a, size: 0.5, additive: true });
    this.pools = [this.smoke, this.dust, this.sparks, this.nitro, this.debris];
  }

  setViewportHeight(height, fov = 60) {
    const scale = height * 0.5 / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    for (const p of this.pools) p.setScale(scale);
  }

  tireSmoke(pos, forward, amount = 1) {
    const n = Math.ceil(amount * 2);
    for (let i = 0; i < n; i++) {
      this.smoke.spawn(
        pos.x + (Math.random() - 0.5) * 1.8, pos.y + 0.14 + Math.random() * 0.25, pos.z + (Math.random() - 0.5) * 1.8,
        -forward.x * (1 + Math.random() * 3) + (Math.random() - 0.5) * 2,
        0.5 + Math.random() * 1.8,
        -forward.z * (1 + Math.random() * 3) + (Math.random() - 0.5) * 2,
        0.7 + Math.random() * 0.9, 0.7 + Math.random() * 1.1,
        { alpha: 0.32, drag: 1.1 }
      );
    }
  }

  offroadDust(pos, forward, amount = 1) {
    const n = Math.ceil(amount * 2);
    for (let i = 0; i < n; i++) {
      this.dust.spawn(
        pos.x + (Math.random() - 0.5) * 1.8, pos.y + 0.2, pos.z + (Math.random() - 0.5) * 1.8,
        -forward.x * (2 + Math.random() * 3) + (Math.random() - 0.5) * 3,
        1 + Math.random() * 2.5,
        -forward.z * (2 + Math.random() * 3) + (Math.random() - 0.5) * 3,
        0.8 + Math.random() * 0.9, 0.8 + Math.random() * 1.2,
        { alpha: 0.3, drag: 1.4 }
      );
    }
  }

  wallSparks(pos, normal, amount = 1) {
    const n = Math.ceil(amount * 10);
    for (let i = 0; i < n; i++) {
      this.sparks.spawn(
        pos.x, pos.y + 0.4 + Math.random() * 0.5, pos.z,
        normal.x * (2 + Math.random() * 7) + (Math.random() - 0.5) * 6,
        1 + Math.random() * 5,
        normal.z * (2 + Math.random() * 7) + (Math.random() - 0.5) * 6,
        0.25 + Math.random() * 0.4, 0.22 + Math.random() * 0.35,
        { gravity: 14, drag: 0.7, alpha: 1 }
      );
    }
    for (let i = 0; i < 4; i++) {
      this.debris.spawn(
        pos.x, pos.y + 0.5, pos.z,
        normal.x * (1 + Math.random() * 3) + (Math.random() - 0.5) * 3,
        1 + Math.random() * 3,
        normal.z * (1 + Math.random() * 3) + (Math.random() - 0.5) * 3,
        0.5, 0.3,
        { gravity: 12, drag: 0.8 }
      );
    }
  }

  boostTrail(pos, forward, color = 0x54e8ff) {
    this.nitro.material.uniforms.uColor.value.set(color);
    for (let i = 0; i < 3; i++) {
      this.nitro.spawn(
        pos.x - forward.x * 2.1 + (Math.random() - 0.5) * 0.5,
        pos.y + 0.32 + (Math.random() - 0.5) * 0.2,
        pos.z - forward.z * 2.1 + (Math.random() - 0.5) * 0.5,
        -forward.x * (4 + Math.random() * 5) + (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.2) * 0.8,
        -forward.z * (4 + Math.random() * 5) + (Math.random() - 0.5) * 1.5,
        0.28 + Math.random() * 0.25, 0.45 + Math.random() * 0.4,
        { drag: 2.2, alpha: 0.9 }
      );
    }
  }

  pickupBurst(pos, color = 0x3df5ff) {
    this.nitro.material.uniforms.uColor.value.set(color);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      this.nitro.spawn(
        pos.x, pos.y, pos.z,
        Math.cos(a) * s, (Math.random() - 0.2) * 4, Math.sin(a) * s,
        0.45 + Math.random() * 0.4, 0.3 + Math.random() * 0.35,
        { gravity: 4, drag: 1.2 }
      );
    }
  }

  update(dt) {
    for (const p of this.pools) p.update(dt);
  }

  dispose() {
    for (const p of this.pools) {
      p.points.geometry.dispose();
      p.material.dispose();
      p.points.removeFromParent();
    }
  }
}
