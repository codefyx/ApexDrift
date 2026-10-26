import * as THREE from 'three';
import { buildWorld } from '../render/world.js';
import { createCarModel, animateCar } from '../render/car.js';
import { getBuiltTrack, getTrackDef, trackPointAt } from '../data/tracks.js';
import { AI_NAMES, PAINTS, DIFFICULTIES } from '../data/gameData.js';
import { textTexture } from '../render/textures.js';
import { RaceCamera } from './camera.js';
import { AIDriver } from './ai.js';
import {
  makeCar, placeCarOnGrid, stepCar, resetToTrack, resolveCarCollisions
} from './physics.js';

const CM = 1 / 60.0;
const AI_COLORS = [0xff3b5c, 0xffd166, 0x2ff5ff, 0x8b5cff, 0xff8a1f, 0x7dffcf, 0xf2f2f2, 0x38a8ff];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeAIStats(base, skill) {
  return {
    accel: base.accel * (0.85 + skill * 0.27),
    topSpeed: base.topSpeed * (0.89 + skill * 0.2),
    grip: base.grip * (0.92 + skill * 0.13),
    steerRate: base.steerRate * (0.95 + skill * 0.08),
    stability: base.stability,
    nitroThrust: base.nitroThrust * (0.8 + skill * 0.25),
    nitroDuration: base.nitroDuration,
    nitroRegen: base.nitroRegen
  };
}

export class Race {
  constructor({ trackId, quality = 1, store, audio, input, hud, aspect = 16 / 9, mode = 'race', callbacks = {} }) {
    this.def = getTrackDef(trackId);
    this.track = getBuiltTrack(trackId);
    this.quality = quality;
    this.store = store;
    this.audio = audio;
    this.input = input;
    this.hud = hud;
    this.mode = mode === 'practice' ? 'practice' : 'race';
    this.difficulty = DIFFICULTIES[store.save.settings.difficulty] || DIFFICULTIES.normal;
    this.callbacks = callbacks;
    this.onFinish = callbacks.onFinish || (() => {});

    this.world = buildWorld(this.track, this.def, { quality });
    this.scene = this.world.scene;
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.25, 30000);
    this.camera.position.set(0, 5, -10);
    this.raceCamera = new RaceCamera(this.camera);
    this.raceCamera.setMode(store.save.settings.camera || 'chase');

    this.cars = [];
    this.models = [];
    this.pickupItems = [];
    this.pickupsCollected = 0;
    this.smokeAccums = new Map();
    this.state = 'countdown';
    this.countdownT = 0;
    this.countdownStage = -1;
    this.raceTime = 0;
    this.elapsed = 0;
    this.physicsAccum = 0;
    this.finishHandled = false;
    this.resultsSent = false;
    this.finishDelay = 0;
    this.playerPosition = 8;
    this.standings = [];
    this.crashCooldown = 0;
    this.lastImpact = 0;
    this.sessionBest = null;
    this.weather = null;

    this.createCars();
    this.createPickups();
    this.updateStandings();
    this.setupCountdown();
    this.hud.show(this);
    this.audio.setScene('race');
    this.audio.idleEngine();
    this.world.follow(new THREE.Vector3(this.player.x, this.player.y, this.player.z));
    this.updateCarVisuals(0, 0);
    this.raceCamera.update(0.016, this.player, 0);
  }

  createCars() {
    const baseStats = this.store.carStats();
    const diff = this.difficulty;
    const playerStats = {
      ...baseStats,
      accel: baseStats.accel * diff.playerAccel,
      grip: baseStats.grip * diff.playerGrip,
      steerRate: baseStats.steerRate * diff.playerSteer,
      stability: Math.max(0.55, baseStats.stability + diff.playerStability)
    };
    const def = this.def;
    const playerColor = new THREE.Color(this.store.getPaintHex());
    const accent = new THREE.Color(def.colors.accent3 || def.colors.accent2);
    const glow = this.store.getGlowHex();
    const finish = this.store.getFinish();
    const player = makeCar({
      id: 'player', name: this.store.save.playerName || 'YOU', number: 7,
      color: playerColor.getHex(), isPlayer: true, stats: playerStats, laps: def.laps, skill: 1
    });
    player.laps = def.laps;
    player.cssColor = '#' + playerColor.getHexString();
    player.country = 'YOU';
    player.model = createCarModel({
      color: playerColor, accent: accent, accent2: new THREE.Color(glow || def.colors.accent2),
      finish, underglow: glow ? new THREE.Color(glow) : null,
      number: 7, quality: this.quality, showLights: true
    });
    player.model.group.userData.isPlayer = true;
    this.scene.add(player.model.group);
    this.player = player;

    // Practice is a solo, no-pressure session: no grid, no AI, no pickups.
    if (this.mode === 'practice') {
      placeCarOnGrid(player, this.track, 8, 0);
      player.raceProgress = -1 + player.progress;
      player.gridIndex = 0;
      player.model.group.position.set(player.x, player.y, player.z);
      player.model.group.rotation.y = player.yaw;
      this.cars = [player];
      return;
    }

    const names = shuffle(AI_NAMES).filter(n => n[0] !== 'YOU').slice(0, 7);
    const usedNumbers = new Set([7]);
    const aiCars = [];
    for (let i = 0; i < 7; i++) {
      const skillBase = diff.aiSkillMin + Math.random() * (diff.aiSkillMax - diff.aiSkillMin);
      const trackBoost = (def.difficulty - 1) * 0.03;
      const levelScale = this.store.save.level > 1
        ? 1 + Math.min(0.06, this.store.save.level * 0.008) * diff.aiLevelScale
        : 1;
      const skill = THREE.MathUtils.clamp((skillBase + trackBoost) * levelScale, 0.12, 1);
      const aiStats = makeAIStats(baseStats, skill);
      aiStats.accel *= diff.aiSpeed;
      aiStats.topSpeed *= diff.aiSpeed;
      let number = 2 + Math.floor(Math.random() * 96);
      while (usedNumbers.has(number)) number = 2 + Math.floor(Math.random() * 96);
      usedNumbers.add(number);
      const color = new THREE.Color(AI_COLORS[i % AI_COLORS.length]);
      const [name, country] = names[i];
      const car = makeCar({
        id: 'ai' + i, name, number, color: color.getHex(),
        stats: aiStats, laps: def.laps, skill
      });
      car.cssColor = '#' + color.getHexString();
      car.country = country;
      car.model = createCarModel({
        color, accent: new THREE.Color(def.colors.accent2), accent2: accent,
        finish: { metalness: 0.55 + Math.random() * 0.3, roughness: 0.15 + Math.random() * 0.3, clearcoat: 1 },
        underglow: Math.random() < 0.55 ? new THREE.Color(def.colors.accent) : null,
        number, quality: this.quality, showLights: false
      });
      car.model.group.userData.isAI = true;
      this.scene.add(car.model.group);
      this.addNameTag(car);
      aiCars.push(car);
    }

    // Starting grid: 8 slots, player starts mid-pack.
    const grid = [null, null, null, null, null, null, null, null];
    grid[4] = player;
    const aiPool = shuffle(aiCars);
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i]) grid[i] = aiPool.pop();
    }
    const offsets = [8, 11, 17, 20, 26, 29, 35, 38];
    grid.forEach((car, i) => {
      const row = Math.floor(i / 2);
      const lateral = (i % 2 === 0 ? -1 : 1) * this.track.halfWidth * 0.31;
      placeCarOnGrid(car, this.track, offsets[i], lateral);
      car.raceProgress = -1 + car.progress;
      car.gridIndex = i;
      car.model.group.position.set(car.x, car.y, car.z);
      car.model.group.rotation.y = car.yaw;
    });
    this.cars = grid;

    // AI controllers
    for (const car of aiCars) {
      car.ai = new AIDriver(car, this.track, {
        skill: car.skill,
        seed: Math.random() * 100,
        aggression: Math.random()
      });
    }
  }

  addNameTag(car) {
    const tex = textTexture(car.name, {
      w: 512, h: 112, bg: 'rgba(6,8,16,0.55)', color: '#ffffff',
      font: '700 54px Orbitron, sans-serif'
    });
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.82, sizeAttenuation: true
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4.6, 1.0, 1);
    sprite.position.set(0, 2.25, 0);
    car.model.group.add(sprite);
    car.nameTag = sprite;
  }

  createPickups() {
    if (this.mode === 'practice') return;
    const geo = new THREE.OctahedronGeometry(0.58, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9ff6ff, emissive: 0x22e6ff, emissiveIntensity: 2.6,
      metalness: 0.4, roughness: 0.15
    });
    const glowTex = this.world.particles.nitro.material.uniforms.uMap.value;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const prog = (i + 0.45) / count;
      const lat = (Math.sin(i * 2.7) * 0.52) * this.track.halfWidth;
      const t = trackPointAt(this.track, prog, lat);
      const group = new THREE.Group();
      group.position.set(t.x, t.y + 1.35, t.z);
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0x3df5ff, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.scale.setScalar(3.4);
      group.add(halo);
      this.scene.add(group);
      this.pickupItems.push({
        group, mesh, progress: prog, x: t.x, y: t.y + 1.35, z: t.z,
        taken: false, phase: Math.random() * 6.28
      });
    }
  }

  setupCountdown() {
    this.state = 'countdown';
    this.countdownT = 0;
    this.countdownStage = -1;
    this.hud.setCountdown('');
    this.hud.setStartLights(0);
    this.hud.setMessage('', '', 0);
    this.audio.setScene('race');
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setPaused(paused) {
    if (paused && (this.state === 'racing' || this.state === 'countdown')) {
      this.prePauseState = this.state;
      this.state = 'paused';
      this.audio.engineUpdate({ active: false });
      this.hud.setPaused(true);
    } else if (!paused && this.state === 'paused') {
      this.state = this.prePauseState || 'racing';
      this.hud.setPaused(false);
      this.audio.setScene('race');
    }
  }

  isPaused() {
    return this.state === 'paused';
  }

  resetPlayer() {
    if (this.state !== 'racing' || this.player.finished) return;
    resetToTrack(this.player, this.track);
    this.raceCamera.initialized = false;
    this.hud.setMessage('BACK ON TRACK', 'GO GO GO', 1.2);
  }

  cycleCamera() {
    const mode = this.raceCamera.cycleMode();
    this.store.save.settings.camera = mode;
    this.store.persist();
    this.hud.setMessage(mode.toUpperCase() + ' CAM', '', 0.9);
    return mode;
  }

  update(dt) {
    if (this.state === 'paused') return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.world.update(dt, this.elapsed);
    this.updatePickupVisuals(dt);
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);

    if (this.state === 'countdown') {
      this.updateCountdown(dt);
      this.updateCarVisuals(dt, this.elapsed);
      this.raceCamera.update(dt, this.player, this.elapsed);
      this.audio.engineUpdate({ speedPct: 0.02, throttle: this.input.read().throttle * 0.5, active: true });
      this.hud.update(this);
      return;
    }

    if (this.state === 'racing') {
      this.raceTime += dt;
      this.updatePlayerInput();
      for (const car of this.cars) {
        if (car.ai && !car.finished) {
          car.ai.update(dt, this.raceTime, this.cars, this.player);
          if (car.ai.stuckTime > 2.6) {
            resetToTrack(car, this.track);
            car.ai.stuckTime = 0;
          }
        }
      }
      this.stepPhysics(dt);
      this.handleLapEvents();
      if (this.player.justFinished || this.player.finished) {
        if (!this.finishHandled) this.handlePlayerFinish();
      }
    }

    if (this.state === 'finished') {
      this.finishDelay -= dt;
      // Keep the world alive while the results card slides in.
      for (const car of this.cars) {
        if (car.ai && !car.finished) car.ai.update(dt, this.raceTime, this.cars, this.player);
      }
      this.stepPhysics(dt);
      this.handleLapEvents();
      if (this.finishDelay <= 0 && !this.resultsSent) {
        this.resultsSent = true;
        this.state = 'results';
        this.onFinish(this.buildResultsPayload());
      }
    }

    this.updateStandings();
    this.updateCarVisuals(dt, this.elapsed);
    this.updateEffects(dt);
    this.updatePickups();
    this.raceCamera.update(dt, this.player, this.elapsed);
    this.world.follow(new THREE.Vector3(this.player.x, this.player.y, this.player.z));

    const speedPct = THREE.MathUtils.clamp(Math.hypot(this.player.vx, this.player.vz) / this.player.stats.topSpeed, 0, 1);
    this.audio.engineUpdate({
      speedPct,
      throttle: this.player.input.throttle,
      boost: this.player.boosting,
      slip: this.player.slip,
      onTrack: this.player.onTrack,
      active: this.state !== 'results'
    });
    this.hud.update(this);
  }

  updateCountdown(dt) {
    this.countdownT += dt;
    const t = this.countdownT;
    const stage = t < 1 ? 0 : t < 2 ? 1 : t < 3 ? 2 : 3;
    if (stage !== this.countdownStage) {
      this.countdownStage = stage;
      if (stage === 0) {
        this.hud.setCountdown('3');
        this.hud.setStartLights(1);
        this.audio.countdownBeep(3);
      } else if (stage === 1) {
        this.hud.setCountdown('2');
        this.hud.setStartLights(2);
        this.audio.countdownBeep(2);
      } else if (stage === 2) {
        this.hud.setCountdown('1');
        this.hud.setStartLights(3);
        this.audio.countdownBeep(1);
      } else {
        this.hud.setCountdown('GO!', true);
        this.hud.setStartLights(3, true);
        this.hud.setMessage('', '', 0);
        this.audio.countdownBeep(0);
        this.state = 'racing';
        this.raceTime = 0;
        setTimeout(() => this.hud.setCountdown(''), 900);
        setTimeout(() => this.hud.setStartLights(0), 1400);
        const modeLabel = this.mode === 'practice' ? 'PRACTICE' : this.def.name.toUpperCase();
        this.hud.setMessage(
          this.mode === 'practice' ? 'FEEL THE LINE' : 'SEND IT',
          `${modeLabel} · ${this.difficulty.name}`,
          1.5,
          'go'
        );
      }
    }
  }

  updatePlayerInput() {
    const i = this.input.read();
    const p = this.player;
    const idleThrottle = this.difficulty.autoThrottle;
    p.input.throttle = i.throttle > 0
      ? i.throttle
      : (idleThrottle > 0 && i.brake < 0.05 && !p.finished ? idleThrottle : 0);
    p.input.brake = i.brake;
    p.input.steer = i.steer;
    p.input.handbrake = i.handbrake;
    p.input.boost = i.boost && !p.finished;
  }

  stepPhysics(dt) {
    this.physicsAccum += dt;
    let steps = 0;
    while (this.physicsAccum >= CM && steps < 5) {
      this.physicsAccum -= CM;
      steps++;
      for (const car of this.cars) {
        if (car.finished && car.isPlayer) continue;
        stepCar(car, this.raceTime, CM, this.track, {
          onWall: (c) => this.onWallHit(c),
          onDrift: (c, intensity) => this.onDrift(c, intensity)
        });
        if (car.finished) {
          car.input.throttle = 0;
        }
      }
      resolveCarCollisions(this.cars, (a, b, impact) => {
        if ((a.isPlayer || b.isPlayer) && impact > 2.2) {
          const p = a.isPlayer ? a : b;
          this.raceCamera.impact(Math.min(1.2, impact / 9));
          this.hud.flashDamage(Math.min(1, impact / 10));
          if (this.crashCooldown <= 0) {
            this.audio.crash();
            this.crashCooldown = 0.35;
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
            this.world.particles.wallSparks(
              { x: mx, y: p.y, z: mz },
              { x: (b.x - a.x) * 0.1, z: (b.z - a.z) * 0.1 }, 0.4
            );
          }
        }
      });
    }
    this.player.speedKmh = Math.hypot(this.player.vx, this.player.vz) * 3.6;
  }

  onWallHit(car) {
    const p = car.isPlayer ? car : null;
    if (p) {
      this.audio.crash();
      this.raceCamera.impact(0.9);
      this.hud.flashDamage(0.8);
    }
    const dist = Math.hypot(car.x - this.player.x, car.z - this.player.z);
    if (car.isPlayer || dist < 60) {
      const n = car.wallNormal || { x: 0, z: 0 };
      this.world.particles.wallSparks({ x: car.x, y: car.y, z: car.z }, { x: -n.x, z: -n.z }, car.isPlayer ? 1 : 0.35);
    }
  }

  onDrift(car, intensity) {
    if (!car.isPlayer && Math.hypot(car.x - this.player.x, car.z - this.player.z) > 65) return;
    const key = car.id;
    const acc = (this.smokeAccums.get(key) || 0) + intensity * 26;
    let n = Math.floor(acc);
    this.smokeAccums.set(key, acc - n);
    if (n > 4) n = 4;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
    for (let i = 0; i < n; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      this.world.particles.tireSmoke(
        { x: car.x - fx * 1.5 + rx * side * 0.8, y: car.y, z: car.z - fz * 1.5 + rz * side * 0.8 },
        { x: fx, z: fz },
        1
      );
    }
  }

  handleLapEvents() {
    const car = this.player;
    if (car && car.justLapped) {
      this.hud.lapFlash(car.justLapped.lap, car.laps, car.justLapped.time);
      this.audio.lap(car.justLapped.lap >= car.laps);
      this.sessionBest = car.bestLap;
      // Finished cars stop being stepped, so clear the event ourselves.
      car.justLapped = null;
    }
  }

  handlePlayerFinish() {
    this.finishHandled = true;
    const p = this.player;
    this.state = 'finished';
    this.finishDelay = 2.4;
    this.audio.finish();
    this.hud.setMessage(
      this.mode === 'practice' ? 'SESSION COMPLETE' : 'FINISH',
      this.mode === 'practice' ? 'PRACTICE LAPS LOGGED' : 'CALCULATING RESULTS',
      2.2,
      'finish'
    );
    this.updateStandings();
    const pos = this.playerPosition;
    this.raceCamera.mode = 'chase';
  }

  updateStandings() {
    const sorted = this.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceProgress - a.raceProgress;
    });
    this.standings = sorted;
    const idx = sorted.indexOf(this.player);
    this.playerPosition = idx >= 0 ? idx + 1 : 8;
  }

  updateCarVisuals(dt, time) {
    for (const car of this.cars) {
      const g = car.model.group;
      g.position.set(car.x, car.y + 0.02, car.z);
      g.rotation.order = 'YXZ';
      g.rotation.y = car.yaw;
      const targetPitch = -(car.slopeAngle || 0) * 0.55;
      g.rotation.x += (targetPitch - g.rotation.x) * Math.min(1, dt * 10);
      const targetRoll = THREE.MathUtils.clamp(car.yawRate * Math.min(1, Math.abs(car.speed) / 40) * 0.045, -0.08, 0.08);
      g.rotation.z += (targetRoll - g.rotation.z) * Math.min(1, dt * 8);
      animateCar(
        car.model, dt, car.speed, car.steer,
        car.input.brake > 0.2 || car.input.handbrake,
        car.boosting, time
      );
      if (car.nameTag) {
        const d = Math.hypot(car.x - this.player.x, car.z - this.player.z);
        car.nameTag.visible = d < 90 && !car.isPlayer;
        car.nameTag.material.opacity = THREE.MathUtils.clamp(1 - (d - 45) / 55, 0, 0.9);
      }
    }
  }

  updatePickupVisuals(dt) {
    for (const p of this.pickupItems) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.rotation.x = Math.sin(this.elapsed * 1.5 + p.phase) * 0.3;
      p.group.position.y = p.y + Math.sin(this.elapsed * 2 + p.phase) * 0.22;
    }
  }

  updatePickups() {
    if (this.state !== 'racing' && this.state !== 'finished') return;
    const p = this.player;
    for (const item of this.pickupItems) {
      if (item.taken) continue;
      const d = Math.hypot(p.x - item.x, p.z - item.z);
      if (d < 3.2) {
        item.taken = true;
        item.group.visible = false;
        this.pickupsCollected++;
        p.nitro = Math.min(1, p.nitro + 0.18);
        this.audio.pickup();
        this.world.particles.pickupBurst({ x: item.x, y: item.y, z: item.z });
        this.hud.pickup('+15');
      }
    }
  }

  updateEffects(dt) {
    const p = this.player;
    if (p.boosting) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      this.world.particles.boostTrail({ x: p.x, y: p.y, z: p.z }, { x: fx, z: fz });
    }
    if (!p.onTrack && Math.hypot(p.vx, p.vz) > 8) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      this.world.particles.offroadDust({ x: p.x, y: p.y, z: p.z }, { x: fx, z: fz }, 0.6);
    }
    for (const car of this.cars) {
      if (!car.isPlayer && car.boosting && Math.hypot(car.x - p.x, car.z - p.z) < 70) {
        const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
        this.world.particles.boostTrail({ x: car.x, y: car.y, z: car.z }, { x: fx, z: fz });
      }
    }
  }

  buildResultsPayload() {
    const p = this.player;
    const playerTime = p.finishTime ?? this.raceTime;
    const rows = this.cars.map(c => {
      let time = c.finishTime;
      let estimated = false;
      if (!c.finished) {
        const remaining = Math.max(0, (c.laps + 1 - (c.lineCrossings + c.progress)) * this.track.length);
        const avg = Math.max(18, Math.hypot(c.vx, c.vz) * 0.94, c.stats.topSpeed * (0.55 + c.skill * 0.22));
        time = playerTime + remaining / avg + (1 - c.skill) * 1.6;
        estimated = true;
      }
      return {
        id: c.id, name: c.isPlayer ? this.store.save.playerName || 'YOU' : c.name,
        country: c.country, isPlayer: c.isPlayer, color: c.cssColor,
        time, estimated, finished: c.finished,
        bestLap: c.bestLap, laps: c.lapTimes.length,
        topSpeed: c.topSpeed
      };
    });
    rows.sort((a, b) => a.time - b.time);
    const playerIndex = rows.findIndex(r => r.isPlayer);
    this.playerPosition = playerIndex + 1;
    return {
      trackId: this.def.id,
      trackName: this.def.name,
      trackReward: this.def.reward,
      mode: this.mode,
      difficulty: this.difficulty.id,
      difficultyName: this.difficulty.name,
      position: this.playerPosition,
      total: this.cars.length,
      time: playerTime,
      bestLap: p.bestLap,
      driftScore: Math.round(p.driftScore),
      pickups: this.pickupsCollected,
      topSpeed: p.topSpeed,
      wallHits: p.wallHits,
      lapCount: this.def.laps,
      lapTimes: p.lapTimes.slice(),
      standings: rows.map((r, i) => ({ ...r, position: i + 1 })),
      playerTime,
      playerTopSpeed: p.topSpeed
    };
  }

  status() {
    return {
      state: this.state,
      player: this.player,
      standings: this.standings,
      raceTime: this.raceTime,
      playerPosition: this.playerPosition
    };
  }

  dispose() {
    this.audio.engineUpdate({ active: false });
    this.hud.hide();
    for (const car of this.cars) {
      this.scene.remove(car.model.group);
      const mats = new Set();
      car.model.group.traverse(o => {
        if (o.material) {
          const list = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of list) mats.add(m);
        }
      });
      for (const m of mats) m.dispose();
      if (car.nameTag) car.nameTag.material.dispose();
    }
    this.world.dispose();
  }
}
