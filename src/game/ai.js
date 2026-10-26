import * as THREE from 'three';
import { wrapAngle } from './physics.js';

/**
 * Lightweight racing-line AI. It uses curvature look-ahead to brake for
 * corners, a personal line offset for overtaking variety, and subtle
 * rubber-banding to keep the pack competitive.
 */
export class AIDriver {
  constructor(car, track, { skill = 0.6, seed = Math.random() * 1000, aggression = 0.5 } = {}) {
    this.car = car;
    this.track = track;
    this.skill = skill;
    this.seed = seed;
    this.aggression = aggression;
    this.lineOffset = (Math.random() * 2 - 1) * track.halfWidth * 0.32;
    this.baseLine = this.lineOffset;
    this.stuckTime = 0;
    this.mistakeTimer = 2 + Math.random() * 8;
    this.mistakeFor = 0;
    this.avoidTimer = 0;
    this.avoidDir = Math.random() > 0.5 ? 1 : -1;
    this.boostHold = 0;
    this.t = Math.random() * 10;
  }

  update(dt, raceTime, cars, player) {
    const car = this.car;
    this.t += dt;
    const track = this.track;
    const n = track.sampleCount;
    const speed = Math.hypot(car.vx, car.vz);
    const progress = car.progress ?? 0;

    // Rubber banding relative to the player (meters of track).
    let band = 0;
    if (player) {
      const delta = (player.raceProgress - car.raceProgress) * track.length;
      band = THREE.MathUtils.clamp(delta / 900, -0.075, 0.085);
      if (car.finished) band = 0;
    }
    car.speedBonus = 1 + band;

    // ----- Corner speed planning
    const gripAccel = 13 + car.stats.grip * 1.15 + this.skill * 4;
    const brakeDecel = 24 + this.skill * 6;
    let target = car.stats.topSpeed * (0.93 + this.skill * 0.12) * (1 + band);
    const aheadDistances = [14, 30, 55, 85, 120];
    for (const dist of aheadDistances) {
      const idx = (car.trackIndex + Math.round(dist / track.spacing)) % n;
      const k = Math.abs(track.samples[idx].curvature);
      if (k < 1e-5) continue;
      const vmax = Math.sqrt(gripAccel / k) * (0.82 + this.skill * 0.22);
      const allowed = Math.sqrt(vmax * vmax + 2 * brakeDecel * dist);
      target = Math.min(target, allowed);
    }
    target = Math.max(9, target);

    // ----- Corner entry: look where the car should be in a moment
    const lookahead = 10 + Math.min(52, speed * 0.55);
    const lookIdx = (car.trackIndex + Math.round(lookahead / track.spacing)) % n;
    const look = track.samples[lookIdx];
    const localK = track.samples[(car.trackIndex + Math.round(26 / track.spacing)) % n].curvature;

    // Racing line drifts to the inside of the corner.
    let offset = this.baseLine - Math.sign(localK) * Math.min(track.halfWidth * 0.3, Math.abs(localK) * 700);
    offset = THREE.MathUtils.clamp(offset, -track.halfWidth * 0.52, track.halfWidth * 0.52);

    // ----- Avoid other cars just ahead
    this.avoidTimer = Math.max(0, this.avoidTimer - dt);
    if (this.avoidTimer <= 0) {
      for (const other of cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const dist = Math.hypot(dx, dz);
        const ahead = dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw);
        if (ahead > 0.5 && ahead < 22 && dist < 9) {
          const relLat = other.lateral - car.lateral;
          if (Math.abs(relLat) < 3.4) {
            this.avoidDir = relLat > 0 ? -1 : 1;
            this.avoidTimer = 0.9;
            break;
          }
        }
      }
    }
    if (this.avoidTimer > 0) {
      offset += this.avoidDir * 2.8;
    }

    // Recovery if running wide.
    if (Math.abs(car.lateral) > track.halfWidth * 0.7) {
      offset -= Math.sign(car.lateral) * (Math.abs(car.lateral) - track.halfWidth * 0.7) * 0.7;
    }
    offset = THREE.MathUtils.clamp(offset, -track.halfWidth * 0.6, track.halfWidth * 0.6);

    const targetX = look.p.x + look.right.x * offset;
    const targetZ = look.p.z + look.right.z * offset;
    const desiredYaw = Math.atan2(targetX - car.x, targetZ - car.z);
    let diff = wrapAngle(desiredYaw - car.yaw);

    // Mistake / wobble makes each opponent feel human.
    this.mistakeTimer -= dt;
    if (this.mistakeTimer <= 0) {
      this.mistakeFor = 0.5 + Math.random() * 1.1;
      this.mistakeTimer = 7 + Math.random() * 14;
    }
    if (this.mistakeFor > 0) {
      this.mistakeFor -= dt;
      diff += Math.sin(this.t * 7.5 + this.seed) * 0.035 * (1.25 - this.skill);
    }

    let steer = THREE.MathUtils.clamp(diff * (2.0 + this.skill * 0.8) - car.yawRate * 0.16, -1, 1);

    // Speed control
    let throttle = 0, brake = 0;
    if (speed < target - 1.5) throttle = 1;
    else if (speed > target + 2.2) brake = THREE.MathUtils.clamp((speed - target) / 8, 0.15, 1);
    else throttle = 0.55;
    if (car.wrongWay) { throttle = 0.6; brake = 0; }
    if (!car.onTrack) { throttle = Math.min(throttle, 0.55); steer = THREE.MathUtils.clamp(-car.lateral * 0.18, -1, 1); }

    // Nitro on long straights
    const straightK = Math.abs(track.samples[(car.trackIndex + Math.round(60 / track.spacing)) % n].curvature) +
      Math.abs(track.samples[(car.trackIndex + Math.round(110 / track.spacing)) % n].curvature);
    let boost = false;
    if (speed > car.stats.topSpeed * 0.55 && straightK < 0.004 && car.nitro > 0.3 && !car.finished) {
      boost = true;
    }

    if (this.mistakeFor > 0) throttle *= 0.55;

    car.input.throttle = THREE.MathUtils.clamp(throttle, 0, 1);
    car.input.brake = THREE.MathUtils.clamp(brake, 0, 1);
    car.input.steer = steer;
    car.input.handbrake = false;
    car.input.boost = boost;

    // Stuck detection (engaged by Race for recovery)
    if (speed < 1.5 && !car.finished) this.stuckTime += dt;
    else this.stuckTime = 0;
  }
}

export function createOpponents(track, playerStats, baseSkill = 0.5) {
  return [];
}
