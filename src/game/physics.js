import * as THREE from 'three';
import { projectToTrack } from '../data/tracks.js';

export const CAR_RADIUS = 1.55;
export const CAR_LENGTH = 4.5;

export const ZERO_INPUT = Object.freeze({
  throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false
});

export function makeCar({
  id, name, number, color, isPlayer = false, stats, laps = 3, skill = 0.5
}) {
  return {
    id, name, number, color, isPlayer, stats, laps, skill,
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, yawRate: 0, steer: 0,
    speed: 0, speedKmh: 0, gear: 1, nitro: 0.55, boosting: false,
    trackIndex: 0, progress: 0, prevProgress: 0, lateral: 0, onTrack: true,
    lineCrossings: 0, lapStart: null, lapTimes: [], bestLap: null,
    finished: false, finishTime: null, totalTime: 0,
    driftScore: 0, driftCombo: 1, driftTime: 0, drifting: false, slip: 0,
    nitroUsed: 0, wallHits: 0, wallCooldown: 0, topSpeed: 0,
    justCrossed: false, justFinished: false, justLapped: null, hitWall: false,
    input: { ...ZERO_INPUT }, boostInput: false,
    ai: null, resetCooldown: 0
  };
}

export function placeCarOnGrid(car, track, distanceBehindLine, lateral) {
  const t = ((1 - distanceBehindLine / track.length) % 1 + 1) % 1;
  const idx = Math.floor(t * track.sampleCount) % track.sampleCount;
  const s = track.samples[idx];
  const alongFrac = (t * track.sampleCount) % 1;
  const next = track.samples[(idx + 1) % track.sampleCount];
  car.x = THREE.MathUtils.lerp(s.p.x, next.p.x, alongFrac) + s.right.x * lateral;
  car.z = THREE.MathUtils.lerp(s.p.z, next.p.z, alongFrac) + s.right.z * lateral;
  car.y = s.p.y;
  car.yaw = s.yaw;
  car.trackIndex = idx;
  car.progress = projectToTrack(track, car.x, car.z, idx).progress;
  car.prevProgress = car.progress;
  car.lateral = lateral;
  car.lineCrossings = 0;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function stepCar(car, raceTime, dt, track, events = {}) {
  car.justCrossed = false;
  car.justFinished = false;
  car.justLapped = null;
  car.hitWall = false;
  car.wallCooldown = Math.max(0, car.wallCooldown - dt);
  car.resetCooldown = Math.max(0, car.resetCooldown - dt);

  if (car.finished) {
    car.input.throttle = 0;
    car.input.brake = 0.25;
    car.input.steer = 0;
    car.input.handbrake = false;
    car.input.boost = false;
  }

  // --- Project current position onto the spline (also gives off-track state)
  const proj = projectToTrack(track, car.x, car.z, car.trackIndex, 110);
  car.trackIndex = proj.index;
  car.lateral = proj.lateral;
  car.sampleHeight = proj.height;
  car.onTrack = Math.abs(proj.lateral) <= track.halfWidth + 0.35;

  const inp = car.input;
  const stats = car.stats;

  // --- Steering input smoothing
  const steerTarget = THREE.MathUtils.clamp(inp.steer, -1, 1);
  const steerSpeed = 8.5 + stats.stability * 5;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * steerSpeed);

  // --- Yaw
  const oldSpeed = car.speed;
  const speedFactor = THREE.MathUtils.clamp(Math.abs(oldSpeed) / 7, 0, 1) *
    (1 - 0.4 * THREE.MathUtils.clamp(Math.abs(oldSpeed) / stats.topSpeed, 0, 1));
  const handbrakeFactor = inp.handbrake ? 1.16 : 1;
  const targetYawRate = car.steer * stats.steerRate * speedFactor * handbrakeFactor *
    (oldSpeed < 0 ? -1 : 1);
  const yawResponse = 7 + stats.stability * 8;
  car.yawRate += (targetYawRate - car.yawRate) * Math.min(1, dt * yawResponse);
  car.yaw += car.yawRate * dt;

  // --- Decompose world velocity in the new car frame
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw);
  const rz = -Math.sin(car.yaw);
  let vLong = car.vx * fx + car.vz * fz;
  let vLat = car.vx * rx + car.vz * rz;

  const offroad = !car.onTrack;
  let topLimit = stats.topSpeed * (car.speedBonus || 1) * (offroad ? 0.58 : 1);

  // Nitro
  car.boosting = false;
  if (inp.boost && car.nitro > 0.01 && !car.finished) {
    car.boosting = true;
    car.nitro = Math.max(0, car.nitro - dt / (stats.nitroDuration * 1.35));
    car.nitroUsed += dt;
    topLimit *= 1.13;
    vLong += stats.nitroThrust * dt;
  } else {
    car.nitro = Math.min(1, car.nitro + stats.nitroRegen * dt * (car.drifting ? 2.1 : 1));
  }

  // --- Longitudinal forces
  let force = 0;
  const limitRatio = THREE.MathUtils.clamp(vLong / Math.max(1, topLimit), 0, 1);
  if (inp.throttle > 0 && !car.finished) {
    force += inp.throttle * stats.accel * (1 - Math.pow(limitRatio, 2.0));
  }
  if (inp.brake > 0) {
    if (vLong > 0.8) force -= inp.brake * 30;
    else force -= inp.brake * 7.5;
  }
  if (car.boosting) force += stats.nitroThrust * 0.65;
  // drag + rolling resistance
  const dragSign = Math.sign(vLong);
  force -= dragSign * (0.7 + 0.0022 * vLong * vLong);
  if (offroad) force -= dragSign * 4.2 * THREE.MathUtils.clamp(Math.abs(vLong) / 10, 0.2, 1);
  if (inp.handbrake) force -= dragSign * 2.6;

  vLong += force * dt;
  if (vLong < -13) vLong = -13;

  // --- Lateral grip. Lower grip = longer slides.
  let grip = stats.grip;
  if (inp.handbrake) grip *= 0.19;
  else if (inp.brake > 0.4 && Math.abs(vLong) > 18) grip *= 0.72;
  if (offroad) grip *= 0.52;
  if (Math.abs(vLong) < 2) grip *= 0.4;
  vLat *= Math.exp(-grip * dt);
  // hard safety cap on sideways speed
  const maxLat = 22 + stats.grip;
  vLat = THREE.MathUtils.clamp(vLat, -maxLat, maxLat);

  // Recompose world velocity
  car.vx = fx * vLong + rx * vLat;
  car.vz = fz * vLong + rz * vLat;
  car.speed = vLong;
  car.slip = Math.abs(vLat);

  // --- Integrate
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // --- Vertical follow + visual pitch information
  const proj2 = projectToTrack(track, car.x, car.z, car.trackIndex, 160);
  car.trackIndex = proj2.index;
  car.lateral = proj2.lateral;
  car.sampleHeight = proj2.height;
  car.onTrack = Math.abs(proj2.lateral) <= track.halfWidth + 0.35;

  const s = proj2.sample;
  const sAhead = track.samples[(proj2.index + 2) % track.sampleCount];
  const sBehind = track.samples[(proj2.index - 2 + track.sampleCount) % track.sampleCount];
  car.slope = Math.atan2(sAhead.p.y - sBehind.p.y, track.spacing * 4);
  const targetY = proj2.height;
  car.y += (targetY - car.y) * Math.min(1, dt * 14);

  // --- Wall collisions
  const limit = track.wallLimit;
  if (Math.abs(car.lateral) > limit) {
    const side = Math.sign(car.lateral);
    const nx = s.right.x * side;
    const nz = s.right.z * side;
    car.x = s.p.x + s.right.x * side * limit;
    car.z = s.p.z + s.right.z * side * limit;
    const vn = car.vx * nx + car.vz * nz;
    if (vn > 0) {
      car.vx -= nx * vn * 1.28;
      car.vz -= nz * vn * 1.28;
      car.hitWall = true;
      car.wallNormal = { x: nx, z: nz };
    }
    car.vx *= 0.9;
    car.vz *= 0.9;
    car.yawRate *= 0.45;
    if (car.wallCooldown <= 0 && Math.abs(car.speed) > 4) {
      car.wallHits++;
      car.wallCooldown = 0.45;
      if (events.onWall) events.onWall(car);
    }
    car.speed = car.vx * fx + car.vz * fz;
  }

  // --- Drift scoring
  const totalSpeed = Math.hypot(car.vx, car.vz);
  const slip = Math.abs(vLat);
  car.slip = slip;
  const driftCond = slip > 3.6 && totalSpeed > 13 && car.onTrack && !car.finished;
  if (driftCond) {
    car.driftTime += dt;
    car.drifting = true;
    const intensity = THREE.MathUtils.clamp((slip - 3.6) / 11, 0, 1);
    car.driftCombo = Math.min(5, 1 + car.driftTime * 0.6);
    car.driftScore += totalSpeed * intensity * 8 * dt * (1 + car.driftTime * 0.12);
    car.nitro = Math.min(1, car.nitro + dt * 0.05 * intensity);
    if (events.onDrift) events.onDrift(car, intensity);
  } else {
    car.driftTime = Math.max(0, car.driftTime - dt * 2.4);
    if (car.driftTime <= 0.02) {
      car.drifting = false;
      car.driftCombo = 1;
    }
  }

  // --- Lap / progress detection
  const p = proj2.progress;
  const wrapped = car.prevProgress > 0.9 && p < 0.15;
  if (wrapped && vLong > 0.8 && car.lineCrossings < car.laps + 1) {
    car.lineCrossings++;
    car.justCrossed = true;
    if (car.lineCrossings === 1) {
      car.lapStart = raceTime;
    } else {
      const lapTime = raceTime - (car.lapStart ?? raceTime);
      car.lapTimes.push(lapTime);
      car.justLapped = { lap: car.lineCrossings - 1, time: lapTime };
      if (!car.bestLap || lapTime < car.bestLap) car.bestLap = lapTime;
      car.lapStart = raceTime;
      if (car.lineCrossings - 1 >= car.laps && !car.finished) {
        car.finished = true;
        car.finishTime = raceTime;
        car.totalTime = raceTime;
        car.justFinished = true;
        if (events.onFinish) events.onFinish(car);
      }
    }
  }
  car.prevProgress = p;
  car.progress = p;
  car.raceProgress = (car.lineCrossings - 1) + p;
  car.speedKmh = totalSpeed * 3.6;
  car.topSpeed = Math.max(car.topSpeed, car.speedKmh);
  car.gear = Math.min(6, 1 + Math.floor(THREE.MathUtils.clamp(Math.abs(vLong) / stats.topSpeed, 0, 0.999) * 6));
  car.wrongWay = car.vx * s.tangent.x + car.vz * s.tangent.z < -2.5;
  car.slopeAngle = car.slope;
  car.events = events;
  return car;
}

export function resetToTrack(car, track) {
  const proj = projectToTrack(track, car.x, car.z, car.trackIndex, 220);
  const s = track.samples[proj.index];
  car.x = s.p.x;
  car.z = s.p.z;
  car.y = s.p.y;
  car.yaw = s.yaw;
  car.vx = 0;
  car.vz = 0;
  car.yawRate = 0;
  car.speed = 0;
  car.steer = 0;
  car.nitro = Math.max(car.nitro, 0.3);
  car.trackIndex = proj.index;
  car.prevProgress = proj.progress;
  car.lineCrossings = Math.max(car.lineCrossings, 1);
  car.drifting = false;
  car.driftTime = 0;
}

export function resolveCarCollisions(cars, onImpact) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const minD = CAR_RADIUS * 2;
      if (d2 > minD * minD || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const overlap = minD - d;
      const massA = a.finished ? 2.2 : 1;
      const massB = b.finished ? 2.2 : 1;
      a.x -= nx * overlap * (massB / (massA + massB)) * 0.9;
      a.z -= nz * overlap * (massB / (massA + massB)) * 0.9;
      b.x += nx * overlap * (massA / (massA + massB)) * 0.9;
      b.z += nz * overlap * (massA / (massA + massB)) * 0.9;
      const relV = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (relV < 0) {
        const imp = relV * 0.65;
        a.vx += nx * imp;
        a.vz += nz * imp;
        b.vx -= nx * imp;
        b.vz -= nz * imp;
        if (onImpact) onImpact(a, b, Math.abs(relV));
      }
    }
  }
}

export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export { wrapAngle, projectToTrack };
