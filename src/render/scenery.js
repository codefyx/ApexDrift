import * as THREE from 'three';
import { buildingTextures, adBoardTexture, textTexture } from './textures.js';

function scaledCount(quality, n) {
  return Math.max(6, Math.round(n * (quality > 0.8 ? 1 : 0.55)));
}

function makePlacements(track, def, terrain, quality, options = {}) {
  const {
    spacing = 16, minLat = 7, maxLat = 42, chance = 0.55, sides = [-1, 1],
    count = null, waterLimit = -390, seed = 1
  } = options;
  const out = [];
  const step = Math.max(1, Math.round(spacing / track.spacing));
  let i = 0;
  for (let s = 0; s < track.sampleCount; s += step) {
    const sampleIndex = Math.floor((s + step * 0.37) % track.sampleCount);
    const sample = track.samples[sampleIndex];
    for (const side of sides) {
      const rnd = Math.abs(Math.sin((s + seed * 97) * 12.9898 + side * 78.233) * 43758.5453) % 1;
      if (rnd > chance) continue;
      const rnd2 = Math.abs(Math.sin((s + 51 + seed * 13) * 4.123 + side * 11.7) * 23421.631) % 1;
      const lat = side * (track.halfWidth + minLat + rnd2 * (maxLat - minLat));
      const x = sample.p.x + sample.right.x * lat;
      const z = sample.p.z + sample.right.z * lat;
      if (def.sea && x < waterLimit) continue;
      const y = terrain.heightAt(x, z);
      if (y < -4) continue;
      out.push({
        x, y, z, lat, sample,
        rot: rnd * Math.PI * 2,
        scale: 0.75 + rnd2 * 0.65,
        side
      });
      i++;
      if (count && i >= count) return out;
    }
  }
  return out;
}

function instanced(geo, mat, count, cast = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = cast;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return mesh;
}

function setInstance(mesh, i, pos, rotY, scale, terrainTilt = 0) {
  const dummy = new THREE.Object3D();
  dummy.position.copy(pos);
  dummy.rotation.set(terrainTilt, rotY, 0);
  dummy.scale.set(scale.x, scale.y, scale.z);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

function addPalms(scene, spots, quality) {
  const n = spots.length;
  if (!n) return;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.95 });
  const trunks = instanced(trunkGeo, trunkMat, n);
  const leafGeo = new THREE.SphereGeometry(1, 7, 4);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6b3d, roughness: 0.9, flatShading: true });
  const leaves = instanced(leafGeo, leafMat, n * 2);
  const dummy = new THREE.Object3D();
  let li = 0;
  for (let i = 0; i < n; i++) {
    const sp = spots[i];
    const h = 5.5 + sp.scale * 3.5;
    const tilt = (sp.rot % 0.3) - 0.15;
    dummy.position.set(sp.x, sp.y - 0.2, sp.z);
    dummy.rotation.set(tilt * 0.4, sp.rot, tilt);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 2; k++) {
      dummy.position.set(
        sp.x + Math.cos(sp.rot + k * 2.4) * (0.4 + k * 0.5) + tilt * h * 0.5,
        sp.y + h * 0.96,
        sp.z + Math.sin(sp.rot + k * 2.4) * (0.4 + k * 0.5)
      );
      dummy.rotation.set(0.1 * k, sp.rot + k, 0);
      dummy.scale.set(2.5 - k * 0.5, 0.55, 2.5 - k * 0.5);
      dummy.updateMatrix();
      leaves.setMatrixAt(li++, dummy.matrix);
    }
  }
  trunks.count = n;
  leaves.count = li;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks, leaves);
}

function addPines(scene, spots, theme, quality) {
  const n = spots.length;
  if (!n) return;
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.24, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 1 });
  const trunks = instanced(trunkGeo, trunkMat, n);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  const needleMat = new THREE.MeshStandardMaterial({
    color: theme === 'dawn' ? 0x2d4a44 : 0x264535, roughness: 0.95, flatShading: true
  });
  const cones = instanced(coneGeo, needleMat, n * 3);
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f7ff, roughness: 0.9, flatShading: true });
  const snow = theme === 'dawn' ? instanced(coneGeo, snowMat, Math.floor(n * 1.2)) : null;
  const dummy = new THREE.Object3D();
  let ci = 0, si = 0;
  for (let i = 0; i < n; i++) {
    const sp = spots[i];
    const h = 6 + sp.scale * 7;
    dummy.position.set(sp.x, sp.y - 0.15, sp.z);
    dummy.rotation.set(0, sp.rot, 0);
    dummy.scale.set(1, h * 0.55, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 3; k++) {
      const cw = (2.4 - k * 0.55) * (0.8 + sp.scale * 0.25);
      const ch = h * (0.55 - k * 0.1);
      dummy.position.set(sp.x, sp.y + h * (0.32 + k * 0.2), sp.z);
      dummy.rotation.set(0, sp.rot + k * 0.4, 0);
      dummy.scale.set(cw, ch, cw);
      dummy.updateMatrix();
      cones.setMatrixAt(ci++, dummy.matrix);
      if (snow && k > 0 && si < snow.count) {
        dummy.position.y += ch * 0.3;
        dummy.scale.set(cw * 0.82, ch * 0.45, cw * 0.82);
        dummy.updateMatrix();
        snow.setMatrixAt(si++, dummy.matrix);
      }
    }
  }
  scene.add(trunks, cones);
  if (snow) { snow.count = si; snow.instanceMatrix.needsUpdate = true; scene.add(snow); }
  trunks.count = n;
  cones.count = ci;
  trunks.instanceMatrix.needsUpdate = true;
  cones.instanceMatrix.needsUpdate = true;
}

function addCacti(scene, spots, quality) {
  const n = spots.length;
  if (!n) return;
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.9, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.34, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = instanced(trunkGeo, mat, n);
  const armGeo = new THREE.CylinderGeometry(0.16, 0.18, 1, 6);
  armGeo.translate(0, 0.5, 0);
  const arms = instanced(armGeo, mat, n * 2);
  const dummy = new THREE.Object3D();
  let ai = 0;
  for (let i = 0; i < n; i++) {
    const sp = spots[i];
    const h = 3.5 + sp.scale * 3;
    dummy.position.set(sp.x, sp.y - 0.2, sp.z);
    dummy.rotation.set(0, sp.rot, 0);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1;
      dummy.position.set(sp.x + side * 0.45, sp.y + h * (0.45 + k * 0.15), sp.z);
      dummy.rotation.set(0, 0, side * 0.9);
      dummy.scale.set(1, h * 0.34, 1);
      dummy.updateMatrix();
      arms.setMatrixAt(ai++, dummy.matrix);
    }
  }
  if (quality < 0.8) arms.count = ai;
  scene.add(trunks, arms);
}

function addRocks(scene, spots, def, quality) {
  const n = spots.length;
  if (!n) return;
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.colors.ground2).multiplyScalar(0.85),
    roughness: 1, flatShading: true
  });
  const rocks = instanced(geo, mat, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const sp = spots[i];
    const s = 0.8 + sp.scale * 3.2;
    dummy.position.set(sp.x, sp.y + s * 0.25, sp.z);
    dummy.rotation.set(sp.rot, sp.rot * 2, sp.rot * 0.5);
    dummy.scale.set(s, s * (0.5 + sp.scale * 0.4), s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);
}

function addBushes(scene, spots, def, quality) {
  const n = spots.length;
  if (!n) return;
  const geo = new THREE.SphereGeometry(1, 6, 4);
  const mat = new THREE.MeshStandardMaterial({
    color: def.theme === 'canyon' ? 0x76653c : 0x3d5c37, roughness: 1, flatShading: true
  });
  const mesh = instanced(geo, mat, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const sp = spots[i];
    const s = 0.6 + sp.scale * 1.4;
    dummy.position.set(sp.x, sp.y + s * 0.4, sp.z);
    dummy.rotation.set(0, sp.rot, 0);
    dummy.scale.set(s, s * 0.6, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(mesh);
}

function addCity(scene, track, def, terrain, quality) {
  const spots = makePlacements(track, def, terrain, quality, {
    spacing: 26, minLat: 20, maxLat: 105, chance: 0.6, sides: [-1, 1],
    count: scaledCount(quality, 58), seed: 4
  });
  const n = spots.length;
  if (!n) return;
  const { map, emissiveMap } = buildingTextures(def.theme);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.15,
    color: 0xffffff, roughness: 0.8, metalness: 0.2
  });
  const buildings = instanced(geo, mat, n);
  const dummy = new THREE.Object3D();
  const rooftops = [];
  for (let i = 0; i < n; i++) {
    const sp = spots[i];
    const w = 7 + sp.scale * 14;
    const h = 14 + sp.scale * (sp.lat > 60 ? 42 : 26);
    const d = 8 + sp.scale * 12;
    dummy.position.set(sp.x, sp.y + h / 2 - 1, sp.z);
    dummy.rotation.set(0, Math.round(sp.rot / (Math.PI / 2)) * Math.PI / 2, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    if (i % 3 === 0) rooftops.push({ x: sp.x, y: sp.y + h - 0.6, z: sp.z, w: w * 0.4, h: 0.5, d: d * 0.4 });
  }
  buildings.instanceMatrix.needsUpdate = true;
  buildings.castShadow = true;
  scene.add(buildings);

  const roofMat = new THREE.MeshBasicMaterial({ color: 0x9ff6ff });
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMesh = instanced(roofGeo, roofMat, rooftops.length, false);
  rooftops.forEach((r, i) => {
    dummy.position.set(r.x, r.y + 0.8, r.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(r.w, 0.4, r.d);
    dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(roofMesh);

  // Neon billboards attached to a handful of buildings
  const palette = ['NEON', 'APEX', 'DRIFT', 'NITRO'];
  for (let i = 0; i < Math.min(6, n); i++) {
    const sp = spots[(i * 7) % n];
    const tex = adBoardTexture('night', palette[i % palette.length]);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 4.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(sp.x, sp.y + 12 + sp.scale * 15, sp.z);
    sign.rotation.y = sp.rot + Math.PI / 2;
    scene.add(sign);
  }
}

function addTireStacks(scene, track, def, quality) {
  const stackGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.3, 10);
  const stackMat = new THREE.MeshStandardMaterial({ color: 0x121319, roughness: 0.95 });
  const positions = [];
  const step = Math.max(3, Math.round(18 / track.spacing));
  for (let i = 0; i < track.sampleCount; i += step) {
    const s = track.samples[i];
    if (Math.abs(s.curvature) < 0.006) continue;
    const side = Math.sign(s.curvature) * -1;
    const lat = side * (track.halfWidth + 3.9);
    positions.push({
      x: s.p.x + s.right.x * lat, y: s.p.y, z: s.p.z + s.right.z * lat
    });
    if (positions.length > (quality > 0.8 ? 150 : 80)) break;
  }
  if (!positions.length) return;
  const mesh = instanced(stackGeo, stackMat, positions.length * 3, true);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (const p of positions) {
    for (let k = 0; k < 3; k++) {
      dummy.position.set(p.x, p.y + 0.18 + k * 0.3, p.z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
  }
  mesh.count = idx;
  scene.add(mesh);
}

function addFlags(scene, track, def, terrain) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b3, metalness: 0.8, roughness: 0.3 });
  const flagTex = textTexture('APEX', {
    w: 256, h: 128, bg: 'rgba(8,10,18,0.9)', color: '#ffffff',
    font: '900 62px Orbitron, sans-serif', accent: '#' + def.colors.accent.toString(16).padStart(6, '0')
  });
  for (let i = 0; i < 6; i++) {
    const t = i / 6 + 0.02;
    const p = trackPointAtLocal(track, t);
    const side = i % 2 ? 1 : -1;
    const lat = side * (track.halfWidth + 8);
    const x = p.x + p.right.x * lat;
    const z = p.z + p.right.z * lat;
    const y = terrain.heightAt(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8, 6), poleMat);
    pole.position.set(x, y + 4, z);
    group.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.1),
      new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide, transparent: true })
    );
    flag.position.set(x + p.tangent.x * 1.05, y + 7.2, z + p.tangent.z * 1.05);
    flag.rotation.y = p.yaw;
    group.add(flag);
  }
  scene.add(group);
}

// local to avoid circular import at module top
let trackPointAtFn = null;
function trackPointAtLocal(track, p) {
  if (!trackPointAtFn) {
    // minimal interpolation: use nearest sample, sufficient for flags
    const i = Math.floor(p * track.sampleCount) % track.sampleCount;
    const s = track.samples[i];
    return { x: s.p.x, z: s.p.z, y: s.p.y, yaw: s.yaw, tangent: s.tangent, right: s.right };
  }
  return trackPointAtFn(track, p);
}

export function populateScenery(scene, track, def, terrain, quality) {
  const kind = def.props;
  const common = { spacing: 13, minLat: 6.5, maxLat: 34, chance: 0.62, seed: 2 };

  if (kind === 'palm') {
    const spots = makePlacements(track, def, terrain, quality, { ...common, count: scaledCount(quality, 95) });
    addPalms(scene, spots, quality);
    const bush = makePlacements(track, def, terrain, quality, { spacing: 11, minLat: 6, maxLat: 26, chance: 0.4, seed: 8, count: scaledCount(quality, 80) });
    addBushes(scene, bush, def, quality);
    addRocks(scene, makePlacements(track, def, terrain, quality, { spacing: 30, minLat: 12, maxLat: 45, chance: 0.5, seed: 12, count: scaledCount(quality, 35) }), def, quality);
  } else if (kind === 'desert') {
    addCacti(scene, makePlacements(track, def, terrain, quality, { ...common, chance: 0.5, count: scaledCount(quality, 75) }), quality);
    addRocks(scene, makePlacements(track, def, terrain, quality, { spacing: 16, minLat: 9, maxLat: 42, chance: 0.7, seed: 5, count: scaledCount(quality, 90) }), def, quality);
    addBushes(scene, makePlacements(track, def, terrain, quality, { spacing: 13, minLat: 6, maxLat: 30, chance: 0.3, seed: 8, count: scaledCount(quality, 50) }), def, quality);
  } else if (kind === 'city') {
    addCity(scene, track, def, terrain, quality);
    addPalms(scene, makePlacements(track, def, terrain, quality, { spacing: 24, minLat: 6, maxLat: 14, chance: 0.6, sides: [-1, 1], count: 26, seed: 7 }), quality);
    addRocks(scene, makePlacements(track, def, terrain, quality, { spacing: 35, minLat: 8, maxLat: 22, chance: 0.4, count: 18, seed: 3 }), def, quality);
  } else {
    addPines(scene, makePlacements(track, def, terrain, quality, { ...common, spacing: 12, chance: 0.66, count: scaledCount(quality, 110) }), def.theme, quality);
    addRocks(scene, makePlacements(track, def, terrain, quality, { spacing: 18, minLat: 8, maxLat: 38, chance: 0.5, count: scaledCount(quality, 55) }), def, quality);
    addBushes(scene, makePlacements(track, def, terrain, quality, { spacing: 14, minLat: 6, maxLat: 24, chance: 0.35, count: scaledCount(quality, 45) }), def, quality);
  }

  addTireStacks(scene, track, def, quality);
  addFlags(scene, track, def, terrain);
}
