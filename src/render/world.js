import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  asphaltTexture, asphaltRoughness, curbTexture, checkerTexture, whiteLineTexture,
  groundTexture, envTexture, textTexture, adBoardTexture, startGantryTexture,
  softCircleTexture, starTexture, cloudTexture
} from './textures.js';
import { ParticleFX } from './particles.js';
import { populateScenery } from './scenery.js';
import { trackPointAt } from '../data/tracks.js';

const TAU = Math.PI * 2;

function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function stripGeometry(samples, { offset = 0, width = 1, y = 0.05, vScale = 12, step = 1, uRepeat = 1 }) {
  const n = samples.length;
  const pos = [];
  const uv = [];
  const idx = [];
  const count = Math.ceil(n / step);
  for (let k = 0; k <= count; k++) {
    const s = samples[(k * step) % n];
    const lat = offset;
    const lx = s.p.x + s.right.x * (lat - width / 2);
    const lz = s.p.z + s.right.z * (lat - width / 2);
    const rx = s.p.x + s.right.x * (lat + width / 2);
    const rz = s.p.z + s.right.z * (lat + width / 2);
    pos.push(lx, s.p.y + y, lz, rx, s.p.y + y, rz);
    const v = (s.dist / vScale) % 4096;
    uv.push(0, v, uRepeat, v);
    if (k < count) {
      const a = k * 2, b = k * 2 + 1, c = (k + 1) * 2, d = (k + 1) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function verticalStrip(samples, { offset, bottom = 0.25, top = 1.0, step = 1, vScale = 8 }) {
  const n = samples.length;
  const pos = [];
  const uv = [];
  const idx = [];
  const count = Math.ceil(n / step);
  for (let k = 0; k <= count; k++) {
    const s = samples[(k * step) % n];
    const x = s.p.x + s.right.x * offset;
    const z = s.p.z + s.right.z * offset;
    pos.push(x, s.p.y + bottom, z, x, s.p.y + top, z);
    const v = (s.dist / vScale) % 2048;
    uv.push(0, v, 1, v);
    if (k < count) {
      const a = k * 2, b = k * 2 + 1, c = (k + 1) * 2, d = (k + 1) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeTerrain(track, def, quality) {
  const theme = def.theme;
  const isSea = def.sea;
  const seg = quality > 0.8 ? 96 : 64;
  const sizeX = 2600;
  const sizeZ = 2600;
  const centerX = 150;
  const centerZ = -180;
  const geo = new THREE.PlaneGeometry(sizeX, sizeZ, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(centerX, 0, centerZ);

  const samples = track.samples;
  const sub = 4;
  const baseColor = new THREE.Color(def.colors.ground);
  const altColor = new THREE.Color(def.colors.ground2);
  const colors = [];

  function heightRaw(x, z) {
    let bestD = Infinity;
    let roadY = 0;
    for (let i = 0; i < samples.length; i += sub) {
      const s = samples[i];
      const dx = s.p.x - x;
      const dz = s.p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; roadY = s.p.y; }
    }
    const dist = Math.sqrt(bestD);
    const blend = smoothstep(12, 130, dist);
    const noise = Math.sin(x * 0.012) * 2.4 + Math.cos(z * 0.009) * 2.0 +
      Math.sin((x + z) * 0.027) * 0.9 + Math.cos(x * 0.05 - z * 0.04) * 0.35;
    let h = roadY * (1 - blend) + (roadY * 0.65 + noise) * blend;
    const themeAmp = theme === 'alpine' ? 2.2 : theme === 'canyon' ? 1.7 : 1;
    h += smoothstep(30, 220, dist) * noise * (themeAmp - 0.5);
    h += smoothstep(280, 900, dist) * (theme === 'alpine' ? 45 : 16);
    if (isSea && x < -430) h = -16 + noise * 0.2;
    return h;
  }

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let h = heightRaw(x, z);
    if (isSea && x < -430) h = -16;
    pos.setY(i, h - 0.22);
    const n = (Math.sin(x * 0.09) * Math.cos(z * 0.07) + 1) * 0.5;
    const c = baseColor.clone().lerp(altColor, n * 0.8 + Math.random() * 0.2);
    if (theme === 'alpine') c.offsetHSL(0, 0, 0.03 * n);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const map = groundTexture(theme, def.colors.ground);
  map.repeat.set(70, 70);
  const mat = new THREE.MeshStandardMaterial({
    map, vertexColors: true, roughness: 0.96, metalness: 0.02, color: 0xffffff
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  return { mesh, heightAt: (x, z) => heightRaw(x, z) - 0.22 };
}

function makeWater(def) {
  const geo = new THREE.PlaneGeometry(3800, 5000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(def.theme === 'night' ? 0x061022 : 0x0b3d54) },
    uShallow: { value: new THREE.Color(def.theme === 'night' ? 0x112e4d : 0x2f8ea3) },
    uSun: { value: new THREE.Color(def.sky.sunColor) },
    uSky: { value: new THREE.Color(def.theme === 'night' ? 0x2a2150 : 0xffa477) },
    uFog: { value: new THREE.Color(def.sky.fog) },
    uFogDensity: { value: def.sky.fogDensity }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSun;
      uniform vec3 uSky;
      uniform vec3 uFog;
      uniform float uFogDensity;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float w = sin(p.x * 0.085 + uTime * 0.9) * 0.5
                + sin(p.y * 0.11 - uTime * 0.7) * 0.35
                + sin((p.x + p.y) * 0.035 + uTime * 0.4) * 0.3;
        vec3 col = mix(uDeep, uShallow, clamp(0.45 + w * 0.3, 0.0, 1.0));
        float dist = length(cameraPosition - vWorld);
        float glint = pow(max(0.0, 1.0 - abs(sin(dot(p, normalize(vec2(0.6, 0.4))) * 0.22 + uTime * 1.2 + w * 2.0))), 9.0);
        col += uSun * glint * 0.85;
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(viewDir.y), 4.0);
        col = mix(col, uSky, fres * 0.55);
        float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        gl_FragColor = vec4(mix(col, uFog, fogF), 1.0);
      }
    `
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(-2180, -1.1, -150);
  mesh.name = 'ocean';
  return { mesh, uniforms };
}

function buildSky(scene, def, quality) {
  const sky = new Sky();
  sky.scale.setScalar(14000);
  const u = sky.material.uniforms;
  const s = def.sky;
  u.turbidity.value = s.turbidity;
  u.rayleigh.value = s.rayleigh;
  u.mieCoefficient.value = s.mieCoefficient;
  u.mieDirectionalG.value = s.mieDirectionalG;
  const phi = THREE.MathUtils.degToRad(90 - s.elevation);
  const theta = THREE.MathUtils.degToRad(s.azimuth);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // Sun / moon glow sprite
  const glowTex = softCircleTexture();
  const spriteMat = new THREE.SpriteMaterial({
    map: glowTex, color: s.sunColor, transparent: true, opacity: def.theme === 'night' ? 0.55 : 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const glow = new THREE.Sprite(spriteMat);
  glow.position.copy(sunDir).multiplyScalar(9000);
  glow.scale.setScalar(def.theme === 'night' ? 900 : 1600);
  scene.add(glow);

  if (def.theme === 'night' || def.theme === 'dawn') {
    const starCount = quality > 0.8 ? 900 : 450;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.08;
      v.multiplyScalar(11000);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({
      map: starTexture(), size: 26, transparent: true, opacity: def.theme === 'night' ? 0.95 : 0.4,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe4ff, fog: false, sizeAttenuation: true
    }));
    stars.frustumCulled = false;
    scene.add(stars);
  }

  return { sky, sunDir, glow };
}

function addClouds(scene, def, quality) {
  const group = new THREE.Group();
  const count = quality > 0.8 ? 12 : 7;
  const tex = cloudTexture();
  const color = def.theme === 'night' ? 0x4e4870 : def.theme === 'dawn' ? 0xffd9e6 : 0xffddc4;
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex, color, transparent: true, opacity: def.theme === 'night' ? 0.18 : 0.32,
      depthWrite: false, fog: false
    });
    const sp = new THREE.Sprite(mat);
    const angle = Math.random() * TAU;
    const r = 1200 + Math.random() * 1600;
    sp.position.set(Math.cos(angle) * r, 240 + Math.random() * 420, Math.sin(angle) * r - 300);
    const sc = 500 + Math.random() * 900;
    sp.scale.set(sc, sc * 0.4, 1);
    sp.userData.speed = 2 + Math.random() * 4;
    group.add(sp);
  }
  scene.add(group);
  return group;
}

function addMountains(scene, track, def, quality) {
  const count = quality > 0.8 ? 26 : 16;
  const group = new THREE.Group();
  const base = new THREE.Color(def.colors.ground);
  base.offsetHSL(0, -0.05, -0.12);
  const geo = new THREE.ConeGeometry(1, 1, 7, 1, true);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 1, metalness: 0, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 1, flatShading: true });
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const radius = 750 + Math.random() * 650;
    const h = 120 + Math.random() * (def.theme === 'alpine' ? 400 : 260);
    const w = h * (0.7 + Math.random() * 0.6);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(angle) * radius + 50, -10, Math.sin(angle) * radius - 250);
    m.scale.set(w, h, w * (0.7 + Math.random() * 0.5));
    m.rotation.y = Math.random() * TAU;
    group.add(m);
    if (def.theme === 'alpine' && h > 200) {
      const snow = new THREE.Mesh(geo, snowMat);
      snow.position.copy(m.position);
      snow.position.y += h * 0.62;
      snow.scale.set(w * 0.34, h * 0.38, w * 0.3);
      snow.rotation.y = m.rotation.y;
      group.add(snow);
    }
  }
  scene.add(group);
  return group;
}

function addStartGantry(scene, track, def) {
  const s = track.start;
  const half = track.halfWidth;
  const group = new THREE.Group();
  group.position.set(s.p.x, s.p.y, s.p.z);
  group.rotation.y = s.yaw;
  const metal = new THREE.MeshStandardMaterial({ color: 0x1b1e2a, metalness: 0.85, roughness: 0.35 });
  const beamW = half * 2 + 6;

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9.2, 0.7), metal);
    pillar.position.set(side * (half + 2.4), 4.6, 0);
    pillar.castShadow = true;
    group.add(pillar);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 8.2, 0.18),
      new THREE.MeshBasicMaterial({ color: def.colors.accent })
    );
    strip.position.set(side * (half + 2.05), 4.4, 0.4);
    group.add(strip);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, 2.2, 1.1), metal);
  beam.position.set(0, 8.7, 0);
  beam.castShadow = true;
  group.add(beam);

  const bannerTex = startGantryTexture(def.theme);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTex, emissiveMap: bannerTex, emissive: 0xffffff, emissiveIntensity: 0.55,
    roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(beamW - 1.2, 2.0), bannerMat);
  banner.position.set(0, 8.7, 0.57);
  group.add(banner);
  const banner2 = banner.clone();
  banner2.position.z = -0.57;
  banner2.rotation.y = Math.PI;
  group.add(banner2);

  const checker = checkerTexture();
  checker.repeat.set(beamW / 2.2, 1);
  const startMat = new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7, metalness: 0.05 });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 5), startMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.12, 0);
  group.add(line);

  // Under-beam light wash
  if (def.theme === 'night' || def.theme === 'sunset') {
    const l1 = new THREE.PointLight(new THREE.Color(def.colors.accent), 18, 45, 2);
    l1.position.set(-half * 0.5, 7.4, 2);
    group.add(l1);
    const l2 = new THREE.PointLight(new THREE.Color(def.colors.accent2), 12, 35, 2);
    l2.position.set(half * 0.5, 7.4, 2);
    group.add(l2);
  }

  scene.add(group);
  return group;
}

function addGrandstand(scene, track, def, terrain) {
  const group = new THREE.Group();
  const start = track.start;
  const side = 1;
  const lat = side * (track.halfWidth + 15);
  const pos = {
    x: start.p.x + start.right.x * lat + start.tangent.x * 22,
    z: start.p.z + start.right.z * lat + start.tangent.z * 22
  };
  const y = terrain.heightAt(pos.x, pos.z);
  group.position.set(pos.x, y, pos.z);
  group.rotation.y = start.yaw;

  const concrete = new THREE.MeshStandardMaterial({ color: 0x2b2d38, roughness: 0.85, metalness: 0.1 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x363a48, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x181b25, metalness: 0.7, roughness: 0.35 });
  const glowMat = new THREE.MeshBasicMaterial({ color: def.colors.accent });

  const base = new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 46), concrete);
  base.position.set(0, 1.7, 0);
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  const crowdGeo = new THREE.BoxGeometry(0.34, 0.5, 0.34);
  const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 420);
  const dummy = new THREE.Object3D();
  const palette = [0xff5d8f, 0xffd166, 0x2ff5ff, 0xf2f2f2, 0x8b5cff, 0xff8a3d, 0x2f5cff];
  let ci = 0;
  for (let tier = 0; tier < 5; tier++) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 45), seatMat);
    seat.position.set(-2.4 + tier * 1.25, 3.35 + tier * 0.55, 0);
    group.add(seat);
    for (let z = -20.5; z <= 20.5; z += 1.35) {
      if (Math.random() > 0.86) continue;
      if (ci >= 420) break;
      dummy.position.set(-2.35 + tier * 1.25 + (Math.random() - 0.5) * 0.5, 3.85 + tier * 0.55, z + (Math.random() - 0.5) * 0.4);
      dummy.rotation.y = Math.PI;
      dummy.scale.setScalar(0.85 + Math.random() * 0.4);
      dummy.updateMatrix();
      crowd.setMatrixAt(ci, dummy.matrix);
      crowd.setColorAt(ci, new THREE.Color(palette[(Math.random() * palette.length) | 0]));
      ci++;
    }
  }
  crowd.count = ci;
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 48), roofMat);
  roof.position.set(-1.4, 9.4, 0);
  roof.rotation.z = -0.09;
  roof.castShadow = true;
  group.add(roof);
  for (const z of [-21, 21]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9.4, 0.3), roofMat);
    pole.position.set(3.2, 4.7, z);
    group.add(pole);
  }
  const led = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.4), new THREE.MeshBasicMaterial({
    map: textTexture('APEX', { w: 512, h: 128, bg: '#0a0b14', color: '#ffffff', font: '900 86px Orbitron, sans-serif' })
  }));
  led.position.set(4.7, 6.7, 0);
  led.rotation.y = Math.PI / 2;
  group.add(led);
  const accents = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 46), glowMat);
  accents.position.set(3.9, 9.2, 0);
  group.add(accents);

  scene.add(group);
  return group;
}

function addArches(scene, track, def, quality) {
  const group = new THREE.Group();
  const count = quality > 0.8 ? 6 : 4;
  const archMats = [
    new THREE.MeshBasicMaterial({ color: def.colors.accent }),
    new THREE.MeshBasicMaterial({ color: def.colors.accent2 })
  ];
  const dark = new THREE.MeshStandardMaterial({ color: 0x171a24, metalness: 0.7, roughness: 0.4 });
  for (let i = 0; i < count; i++) {
    const p = (i + 0.55) / count;
    const t = trackPointAt(track, p);
    const g = new THREE.Group();
    g.position.set(t.x, t.y, t.z);
    g.rotation.y = t.yaw;
    const R = track.halfWidth + 2.2;
    const mat = archMats[i % 2];
    const torus = new THREE.Mesh(new THREE.TorusGeometry(R, 0.17, 8, 44, Math.PI), mat);
    g.add(torus);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R - 0.55, 0.055, 6, 36, Math.PI), mat);
    inner.position.z = 0.05;
    g.add(inner);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 6.4, 0.32), dark);
      pillar.position.set(side * R, -3.1, 0);
      g.add(pillar);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(0.09, 5.8, 0.09), mat);
      neon.position.set(side * (R - 0.12), -3.0, 0.28);
      g.add(neon);
    }
    // Hanging banners from arch
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.9), new THREE.MeshBasicMaterial({
      map: textTexture(i % 2 ? 'APEX DRIFT' : 'NITRO', {
        w: 512, h: 96, bg: 'rgba(4,6,14,0.9)', color: '#ffffff',
        font: '700 54px Orbitron, sans-serif'
      }),
      transparent: true, side: THREE.DoubleSide, depthWrite: false
    }));
    banner.position.set(0, R * 0.55, 0.0);
    banner.rotation.z = 0;
    g.add(banner);
    group.add(g);
    if (quality > 0.8 && i < 2) {
      const light = new THREE.PointLight(new THREE.Color(i % 2 ? def.colors.accent2 : def.colors.accent), 14, 46, 2);
      light.position.set(t.x, t.y + 6, t.z);
      scene.add(light);
    }
  }
  scene.add(group);
  return group;
}

function addAdBoards(scene, track, def, terrain, quality) {
  const group = new THREE.Group();
  const count = quality > 0.8 ? 7 : 4;
  const boards = [['NITRO', def.colors.accent], ['APEX', def.colors.accent2], ['DRIFT', def.colors.accent3]];
  for (let i = 0; i < count; i++) {
    const p = (i + 0.35) / count;
    const t = trackPointAt(track, p);
    const side = i % 2 ? 1 : -1;
    const lat = side * (track.halfWidth + 7.5);
    const x = t.x + t.right.x * lat;
    const z = t.z + t.right.z * lat;
    const y = terrain.heightAt(x, z);
    const [text, accent] = boards[i % boards.length];
    const boardTex = adBoardTexture(def.theme, text);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 3.5),
      new THREE.MeshStandardMaterial({
        map: boardTex, emissiveMap: boardTex, emissive: 0xffffff, emissiveIntensity: 0.45,
        roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide
      })
    );
    board.position.set(x, y + 2.6, z);
    board.rotation.y = t.yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    group.add(board);
    for (const off of [-2.4, 2.4]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 2.8, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x2b2f3b, metalness: 0.6, roughness: 0.5 })
      );
      post.position.set(x + t.tangent.x * off, y + 1.1, z + t.tangent.z * off);
      group.add(post);
    }
    const trim = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: accent }));
    trim.position.set(x, y + 4.4, z);
    trim.rotation.y = t.yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    group.add(trim);
  }
  scene.add(group);
  return group;
}

function addLightPoles(scene, track, def, terrain, quality) {
  const group = new THREE.Group();
  const count = quality > 0.8 ? 14 : 9;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x252a36, metalness: 0.75, roughness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial({ color: def.theme === 'night' ? 0xbfeaff : 0xffe9c9 });
  for (let i = 0; i < count; i++) {
    const p = (i + 0.1) / count;
    const t = trackPointAt(track, p);
    const side = i % 2 ? 1 : -1;
    const lat = side * (track.halfWidth + 4.4);
    const x = t.x + t.right.x * lat;
    const z = t.z + t.right.z * lat;
    const y = t.y + 0.1;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 7.5, 6), poleMat);
    pole.position.set(x, y + 3.75, z);
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.09), poleMat);
    arm.position.set(x - t.right.x * side * 0.75, y + 7.4, z - t.right.z * side * 0.75);
    group.add(arm);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.28), lampMat);
    lamp.position.set(x - t.right.x * side * 1.45, y + 7.32, z - t.right.z * side * 1.45);
    group.add(lamp);
    if (def.theme === 'night' && quality > 0.8 && i % 4 === 0) {
      const pl = new THREE.PointLight(0x9fd8ff, 10, 34, 2);
      pl.position.set(x, y + 6.8, z);
      scene.add(pl);
    }
  }
  scene.add(group);
  return group;
}

export function buildWorld(track, def, options = {}) {
  const quality = options.quality ?? 1;
  const scene = new THREE.Scene();
  const theme = def.theme;
  const colors = def.colors;

  scene.fog = new THREE.FogExp2(def.sky.fog, def.sky.fogDensity);
  const env = envTexture(theme);
  scene.environment = env;

  const { sky, sunDir, glow } = buildSky(scene, def, quality);

  const hemi = new THREE.HemisphereLight(
    new THREE.Color(def.sky.skyLight),
    new THREE.Color(colors.ground),
    theme === 'night' ? 0.5 : 1.05
  );
  scene.add(hemi);

  let lightDir = sunDir.clone();
  let sunIntensity = 2.7;
  let sunColor = def.sky.sunColor;
  if (theme === 'night') {
    lightDir = new THREE.Vector3(0.35, 0.75, 0.25).normalize();
    sunIntensity = 0.55;
    sunColor = 0x9fb8ff;
  }
  const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
  sun.position.copy(lightDir).multiplyScalar(260);
  sun.castShadow = true;
  const shadowSize = quality > 0.8 ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.055;
  scene.add(sun);
  scene.add(sun.target);

  const rim = new THREE.DirectionalLight(new THREE.Color(colors.accent2), theme === 'night' ? 0.8 : 0.5);
  rim.position.set(-160, 90, -200);
  scene.add(rim);

  const terrain = makeTerrain(track, def, quality);
  scene.add(terrain.mesh);

  if (def.sea) {
    const water = makeWater(def);
    scene.add(water.mesh);
    // Beach strip along the shoreline
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 2600),
      new THREE.MeshStandardMaterial({ color: theme === 'night' ? 0x2b2a30 : 0xcbb184, roughness: 1 })
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(-420, -0.45, -180);
    scene.add(beach);
    options.water = water;
  }

  // Road surface
  const samples = track.samples;
  const step = quality > 0.8 ? 1 : 2;
  const asphaltMap = asphaltTexture(colors.asphalt);
  asphaltMap.repeat.set(1.2, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltMap,
    roughnessMap: asphaltRoughness(),
    color: 0xffffff,
    roughness: 0.94,
    metalness: theme === 'night' ? 0.22 : 0.06,
    envMapIntensity: theme === 'night' ? 0.7 : 0.35
  });
  const road = new THREE.Mesh(
    stripGeometry(samples, { offset: 0, width: track.halfWidth * 2, y: 0.06, vScale: 11, step }),
    roadMat
  );
  road.receiveShadow = true;
  road.name = 'road';
  scene.add(road);

  // Run-off apron
  for (const side of [-1, 1]) {
    const apron = new THREE.Mesh(
      stripGeometry(samples, {
        offset: side * (track.halfWidth + 2.1), width: 4.2, y: 0.035, vScale: 22, step
      }),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(colors.ground2).multiplyScalar(0.65).getHex(),
        roughness: 1, metalness: 0.02
      })
    );
    apron.receiveShadow = true;
    scene.add(apron);
  }

  // Curbs
  const curbTex = curbTexture(colors.curbA, colors.curbB);
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(
      stripGeometry(samples, {
        offset: side * (track.halfWidth + 0.85), width: 1.7, y: 0.1, vScale: 8, step
      }),
      new THREE.MeshStandardMaterial({
        map: curbTex, roughness: 0.72, metalness: 0.05
      })
    );
    curb.receiveShadow = true;
    scene.add(curb);
  }

  // Edge lines
  const lineTex = whiteLineTexture();
  lineTex.repeat.set(1, 1);
  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(
      stripGeometry(samples, {
        offset: side * (track.halfWidth - 0.4), width: 0.24, y: 0.085, vScale: 3, step
      }),
      new THREE.MeshStandardMaterial({
        map: lineTex, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.16,
        roughness: 0.6, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2
      })
    );
    scene.add(line);
  }

  // Guardrails
  const railMat = new THREE.MeshStandardMaterial({
    color: colors.rail, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide
  });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      verticalStrip(samples, {
        offset: side * (track.halfWidth + 3.0), bottom: 0.35, top: 1.0, step, vScale: 6
      }),
      railMat
    );
    rail.castShadow = true;
    scene.add(rail);

    const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.accent).multiplyScalar(0.55) });
    const strip = new THREE.Mesh(
      verticalStrip(samples, {
        offset: side * (track.halfWidth + 3.02), bottom: 0.3, top: 0.36, step: step * 2, vScale: 6
      }),
      accentMat
    );
    scene.add(strip);
  }

  // Guardrail posts
  {
    const postGeo = new THREE.BoxGeometry(0.13, 1.05, 0.13);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5a6170, metalness: 0.8, roughness: 0.4 });
    const postStep = Math.max(2, Math.round(9 / track.spacing));
    const count = Math.floor(track.sampleCount / postStep);
    const posts = new THREE.InstancedMesh(postGeo, postMat, count * 2);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < track.sampleCount; i += postStep) {
      const s = samples[i];
      for (const side of [-1, 1]) {
        dummy.position.set(
          s.p.x + s.right.x * side * (track.halfWidth + 3.12),
          s.p.y + 0.5,
          s.p.z + s.right.z * side * (track.halfWidth + 3.12)
        );
        dummy.rotation.set(0, s.yaw, 0);
        dummy.updateMatrix();
        posts.setMatrixAt(idx++, dummy.matrix);
      }
    }
    posts.count = idx;
    scene.add(posts);
  }

  // Start line, gantry, grandstand, arches, boards, lights
  addStartGantry(scene, track, def);
  addGrandstand(scene, track, def, terrain);
  addArches(scene, track, def, quality);
  addAdBoards(scene, track, def, terrain, quality);
  addLightPoles(scene, track, def, terrain, quality);
  addMountains(scene, track, def, quality);
  const clouds = addClouds(scene, def, quality);
  populateScenery(scene, track, def, terrain, quality);

  // Distant ambient dust motes
  const moteCount = quality > 0.8 ? 260 : 130;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 1800;
    motePos[i * 3 + 1] = 1 + Math.random() * 55;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 1800 - 200;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: theme === 'night' ? 0x7fe9ff : 0xffe6c4, size: 0.5, transparent: true, opacity: 0.45,
    depthWrite: false, blending: THREE.AdditiveBlending, map: softCircleTexture(), sizeAttenuation: true
  }));
  scene.add(motes);

  const particles = new ParticleFX(scene);

  // Big light shafts near the start for atmosphere
  if (quality > 0.8) {
    const shaftMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colors.accent).lerp(new THREE.Color(0xffffff), 0.4),
      transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    });
    for (let i = 0; i < 4; i++) {
      const t = trackPointAt(track, i * 0.03 + 0.5);
      const shaft = new THREE.Mesh(new THREE.ConeGeometry(9, 55, 12, 1, true), shaftMat);
      shaft.position.set(t.x + (i - 1.5) * 35, 30, t.z - 30);
      shaft.rotation.z = (Math.random() - 0.5) * 0.15;
      scene.add(shaft);
    }
  }

  const world = {
    scene, def, track, sky, sun, sunDir, terrain, particles, clouds, motes,
    quality, water: options.water || null, time: 0,
    follow(pos) {
      sun.position.set(pos.x + lightDir.x * 210, pos.y + lightDir.y * 210, pos.z + lightDir.z * 210);
      sun.target.position.copy(pos);
      sun.target.updateMatrixWorld();
    },
    update(dt, elapsed) {
      world.time = elapsed;
      if (world.water) world.water.uniforms.uTime.value = elapsed;
      for (const c of clouds.children) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 3600) c.position.x = -3600;
      }
      motes.rotation.y += dt * 0.004;
      glow.material.opacity = (theme === 'night' ? 0.4 : 0.8) + Math.sin(elapsed * 0.8) * 0.08;
      particles.update(dt);
    },
    dispose() {
      particles.dispose();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            m.dispose();
          }
        }
      });
      scene.clear();
    }
  };

  return world;
}
