import * as THREE from 'three';
import { numberDecalTexture, softCircleTexture } from './textures.js';

let GEO = null;

function geometries() {
  if (GEO) return GEO;
  const body = new THREE.Shape();
  body.moveTo(-2.12, 0.28);
  body.lineTo(-2.3, 0.52);
  body.lineTo(-2.24, 0.8);
  body.lineTo(-1.55, 0.9);
  body.lineTo(-0.92, 1.0);
  body.lineTo(0.95, 0.99);
  body.lineTo(1.86, 0.83);
  body.lineTo(2.24, 0.66);
  body.lineTo(2.3, 0.4);
  body.lineTo(2.1, 0.28);
  body.lineTo(-1.95, 0.28);
  body.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(body, {
    depth: 1.82, bevelEnabled: true, bevelSize: 0.13, bevelThickness: 0.13,
    bevelSegments: 4, curveSegments: 1
  });
  bodyGeo.translate(0, 0, -0.91);
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.computeVertexNormals();

  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.24, 0.88);
  cabinShape.lineTo(-0.92, 1.03);
  cabinShape.lineTo(-0.36, 1.4);
  cabinShape.lineTo(0.4, 1.42);
  cabinShape.lineTo(1.04, 1.02);
  cabinShape.lineTo(1.22, 0.9);
  cabinShape.closePath();
  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.5, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07,
    bevelSegments: 3, curveSegments: 1
  });
  cabinGeo.translate(0, 0, -0.75);
  cabinGeo.rotateY(-Math.PI / 2);
  cabinGeo.computeVertexNormals();

  GEO = {
    body: bodyGeo,
    cabin: cabinGeo,
    wheel: new THREE.CylinderGeometry(0.37, 0.37, 0.3, 24, 1),
    rim: new THREE.CylinderGeometry(0.235, 0.235, 0.315, 20, 1),
    disc: new THREE.CylinderGeometry(0.2, 0.2, 0.02, 18),
    spoke: new THREE.BoxGeometry(0.06, 0.39, 0.075),
    arch: new THREE.TorusGeometry(0.47, 0.085, 8, 18, Math.PI),
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    sphere: new THREE.SphereGeometry(1, 16, 12)
  };
  return GEO;
}

const PAINT_BASE = {
  metalness: 0.5, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08
};

function matPhysical(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 0.5, roughness: 0.25,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.35, ...opts
  });
}

export function createCarModel(options = {}) {
  const {
    color = 0xff2e63, accent = 0xffd166, accent2 = 0x2ff5ff,
    finish = { metalness: 0.45, roughness: 0.18, clearcoat: 1 },
    underglow = 0x19e6ff, number = 7, quality = 1, showLights = false
  } = options;
  const g = geometries();
  const group = new THREE.Group();
  const refs = { group, wheels: [], frontWheels: [], materials: {} };

  const paintMat = matPhysical(color, {
    metalness: finish.metalness, roughness: finish.roughness,
    clearcoat: finish.clearcoat ?? 1
  });
  const accentMat = matPhysical(accent, { metalness: 0.6, roughness: 0.3 });
  const accent2Mat = matPhysical(accent2, { metalness: 0.5, roughness: 0.35 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x10111a, roughness: 0.72, metalness: 0.45 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0f, roughness: 0.94, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9e2f2, metalness: 1, roughness: 0.22 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1220, metalness: 0.2, roughness: 0.06, transparent: true, opacity: 0.82,
    envMapIntensity: 2.0, clearcoat: 1
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xf8fbff, emissive: 0xd9ecff, emissiveIntensity: 3.2, roughness: 0.2
  });
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x7a0714, emissive: 0xff1f3d, emissiveIntensity: 1.2, roughness: 0.4
  });
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x6b7484, metalness: 1, roughness: 0.3 });

  refs.paintMat = paintMat;
  refs.accentMat = accentMat;
  refs.accent2Mat = accent2Mat;
  refs.brakeMat = brakeMat;
  refs.headMat = headMat;
  refs.glassMat = glassMat;
  refs.materials = { paintMat, accentMat, accent2Mat, brakeMat };

  // Main body
  const body = new THREE.Mesh(g.body, paintMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Cabin glass + roof
  const cabin = new THREE.Mesh(g.cabin, glassMat);
  cabin.castShadow = true;
  group.add(cabin);

  const roof = new THREE.Mesh(g.box, paintMat);
  roof.scale.set(1.28, 0.05, 1.06);
  roof.position.set(0, 1.44, -0.03);
  roof.castShadow = true;
  group.add(roof);

  // Roof racing stripe
  const stripe = new THREE.Mesh(g.box, accentMat);
  stripe.scale.set(0.2, 0.03, 3.7);
  stripe.position.set(0, 1.465, -0.05);
  group.add(stripe);

  // Side accent line
  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(g.box, accent2Mat);
    line.scale.set(0.02, 0.07, 3.3);
    line.position.set(side * 0.995, 0.52, -0.05);
    group.add(line);
  }

  // Fender arches
  for (const z of [1.42, -1.38]) {
    for (const side of [-1, 1]) {
      const arch = new THREE.Mesh(g.arch, paintMat);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(side * 0.88, 0.4, z);
      arch.scale.set(1, 1, 1.15);
      group.add(arch);
    }
  }

  // Front splitter, rear diffuser, side skirts
  const splitter = new THREE.Mesh(g.box, carbonMat);
  splitter.scale.set(1.96, 0.08, 0.46);
  splitter.position.set(0, 0.17, 2.16);
  group.add(splitter);

  const diffuser = new THREE.Mesh(g.box, carbonMat);
  diffuser.scale.set(1.86, 0.12, 0.5);
  diffuser.position.set(0, 0.2, -2.15);
  group.add(diffuser);

  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(g.box, carbonMat);
    skirt.scale.set(0.08, 0.16, 2.6);
    skirt.position.set(side * 0.96, 0.26, 0);
    group.add(skirt);
    const mirrorStalk = new THREE.Mesh(g.box, carbonMat);
    mirrorStalk.scale.set(0.16, 0.04, 0.04);
    mirrorStalk.position.set(side * 0.98, 1.0, 0.62);
    group.add(mirrorStalk);
    const mirror = new THREE.Mesh(g.box, accentMat);
    mirror.scale.set(0.13, 0.14, 0.29);
    mirror.position.set(side * 1.08, 1.03, 0.6);
    group.add(mirror);
  }

  // Grille + intakes
  const grille = new THREE.Mesh(g.box, carbonMat);
  grille.scale.set(1.1, 0.24, 0.06);
  grille.position.set(0, 0.48, 2.31);
  group.add(grille);

  // Headlights and tail light bar
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(g.box, headMat);
    hl.scale.set(0.52, 0.12, 0.06);
    hl.position.set(side * 0.57, 0.73, 2.25);
    group.add(hl);
    const intake = new THREE.Mesh(g.box, carbonMat);
    intake.scale.set(0.3, 0.14, 0.06);
    intake.position.set(side * 0.62, 0.47, 2.3);
    group.add(intake);
  }
  const tail = new THREE.Mesh(g.box, brakeMat);
  tail.scale.set(1.62, 0.09, 0.06);
  tail.position.set(0, 0.82, -2.29);
  group.add(tail);

  // Exhausts
  for (const side of [-1, 1]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.18, 10), exhaustMat);
    ex.rotation.x = Math.PI / 2;
    ex.position.set(side * 0.45, 0.26, -2.28);
    group.add(ex);
  }

  // Rear wing
  const wing = new THREE.Mesh(g.box, accentMat);
  wing.scale.set(2.0, 0.07, 0.42);
  wing.position.set(0, 1.31, -1.96);
  wing.rotation.x = -0.13;
  wing.castShadow = true;
  group.add(wing);
  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(g.box, carbonMat);
    upright.scale.set(0.07, 0.4, 0.22);
    upright.position.set(side * 0.62, 1.11, -1.95);
    group.add(upright);
  }

  // Hood vents
  for (const side of [-1, 1]) {
    const vent = new THREE.Mesh(g.box, carbonMat);
    vent.scale.set(0.34, 0.02, 0.5);
    vent.position.set(side * 0.4, 0.9, 1.22);
    vent.rotation.x = -0.12;
    group.add(vent);
  }

  // Driver helmet
  const helmet = new THREE.Mesh(g.sphere, accentMat);
  helmet.scale.setScalar(0.17);
  helmet.position.set(0, 1.18, 0.05);
  group.add(helmet);

  // Side number decals
  const decalTex = numberDecalTexture(number, '#' + new THREE.Color(accent2).getHexString());
  for (const side of [-1, 1]) {
    const decal = new THREE.Mesh(
      g.plane,
      new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    decal.scale.setScalar(0.62);
    decal.position.set(side * 1.008, 0.66, -0.25);
    decal.rotation.y = side * Math.PI / 2;
    group.add(decal);
  }

  // Wheels
  for (const z of [1.42, -1.38]) {
    for (const side of [-1, 1]) {
      const steerGroup = new THREE.Group();
      steerGroup.position.set(side * 0.9, 0.37, z);
      const spin = new THREE.Group();
      steerGroup.add(spin);

      const tire = new THREE.Mesh(g.wheel, rubberMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      spin.add(tire);

      const rim = new THREE.Mesh(g.rim, rimMat);
      rim.rotation.z = Math.PI / 2;
      spin.add(rim);

      const disc = new THREE.Mesh(g.disc, new THREE.MeshStandardMaterial({
        color: 0x8f99aa, metalness: 1, roughness: 0.45
      }));
      disc.rotation.z = Math.PI / 2;
      disc.position.x = side * 0.02;
      spin.add(disc);

      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(g.spoke, accentMat);
        spoke.rotation.x = (i / 5) * Math.PI * 2;
        spoke.position.x = side * 0.15;
        spin.add(spoke);
      }

      const caliper = new THREE.Mesh(g.box, accent2Mat);
      caliper.scale.set(0.06, 0.13, 0.08);
      caliper.position.set(side * 0.16, 0.05, 0.16);
      spin.add(caliper);

      group.add(steerGroup);
      refs.wheels.push(spin);
      if (z > 0) refs.frontWheels.push(steerGroup);
    }
  }

  // Underglow
  if (underglow) {
    const glowTex = softCircleTexture();
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex, color: underglow, transparent: true, opacity: 0.72,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const glow = new THREE.Mesh(g.plane, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.scale.set(2.6, 4.9, 1);
    glow.position.y = 0.055;
    group.add(glow);
    refs.glowMat = glowMat;
    refs.glow = glow;
  }

  // Two little emissive exhaust flames shown under boost
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x66e8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    depthWrite: false, map: softCircleTexture()
  });
  refs.flameMat = flameMat;
  refs.flames = [];
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(g.plane, flameMat);
    flame.position.set(side * 0.45, 0.28, -2.48);
    flame.scale.setScalar(0.4);
    flame.visible = false;
    group.add(flame);
    refs.flames.push(flame);
  }

  if (showLights) {
    const underLight = new THREE.PointLight(underglow || 0x19e6ff, 4, 7, 2);
    underLight.position.set(0, 0.08, 0);
    group.add(underLight);
    refs.underLight = underLight;

    const headL = new THREE.SpotLight(0xd9ecff, 30, 70, Math.PI / 7, 0.5, 1.6);
    headL.position.set(0, 0.75, 2.1);
    headL.target.position.set(0, 0, 24);
    group.add(headL);
    group.add(headL.target);
    refs.headLight = headL;
  }

  group.userData.refs = refs;
  return refs;
}

export function setCarPaint(refs, { color, accent, accent2, finish, underglow }) {
  if (color !== undefined) refs.paintMat.color.set(color);
  if (accent !== undefined) refs.accentMat.color.set(accent);
  if (accent2 !== undefined) refs.accent2Mat.color.set(accent2);
  if (finish) {
    refs.paintMat.metalness = finish.metalness;
    refs.paintMat.roughness = finish.roughness;
    refs.paintMat.clearcoat = finish.clearcoat ?? 1;
    refs.paintMat.needsUpdate = true;
  }
  if (underglow !== undefined) {
    if (refs.glowMat) refs.glowMat.color.set(underglow || 0x000000);
    if (refs.glow) refs.glow.visible = !!underglow;
    if (refs.underLight) refs.underLight.color.set(underglow || 0x000000);
  }
}

export function animateCar(refs, dt, speed, steer, braking, boosting, time) {
  for (const wheel of refs.wheels) {
    wheel.rotation.x += (speed / 0.37) * dt;
  }
  for (const fw of refs.frontWheels) {
    fw.rotation.y = steer * 0.42;
  }
  if (refs.brakeMat) {
    refs.brakeMat.emissiveIntensity = braking ? 5.5 : 1.2;
  }
  for (const flame of refs.flames) {
    flame.visible = !!boosting;
    if (boosting) {
      const s = 0.5 + Math.sin(time * 55) * 0.1 + Math.random() * 0.2;
      flame.scale.set(0.38, s * 1.9, 1);
      flame.rotation.z = Math.random() * 2;
    }
  }
  if (refs.glowMat) {
    refs.glowMat.opacity = 0.55 + Math.sin(time * 4) * 0.12;
  }
}

export function updateCarPaintFromStore(refs, store) {
  const finish = store.getFinish();
  setCarPaint(refs, {
    color: new THREE.Color(store.getPaintHex()),
    finish,
    underglow: store.getGlowHex() ? new THREE.Color(store.getGlowHex()) : null
  });
}
