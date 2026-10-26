import * as THREE from 'three';
import { angleLerp } from './physics.js';

const MODES = ['chase', 'close', 'hood'];

export class RaceCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.fov = 62;
    this.shake = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.initialized = false;
    this.roll = 0;
    this.finishTime = 0;
  }

  setMode(mode) {
    this.mode = MODES.includes(mode) ? mode : 'chase';
    this.initialized = false;
  }

  cycleMode() {
    const i = MODES.indexOf(this.mode);
    this.setMode(MODES[(i + 1) % MODES.length]);
    return this.mode;
  }

  impact(amount = 1) {
    this.shake = Math.min(1.6, this.shake + amount);
  }

  update(dt, car, time) {
    const speed = Math.hypot(car.vx, car.vz);
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const carPos = new THREE.Vector3(car.x, car.y, car.z);
    let desired = new THREE.Vector3();
    let lookTarget = new THREE.Vector3();

    if (car.finished) {
      this.finishTime += dt;
      const a = car.yaw + Math.PI * 0.75 + this.finishTime * 0.22;
      const r = 9.5;
      desired.set(car.x + Math.sin(a) * r, car.y + 3.2, car.z + Math.cos(a) * r);
      lookTarget.set(car.x, car.y + 0.7, car.z);
      this.pos.lerp(desired, Math.min(1, dt * 2));
      this.look.lerp(lookTarget, Math.min(1, dt * 3));
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.look);
      const targetFov = 48;
      this.fov += (targetFov - this.fov) * Math.min(1, dt * 2);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      return;
    }

    if (this.mode === 'hood') {
      desired.set(
        car.x + fx * 0.75 + Math.cos(car.yaw) * 0.0,
        car.y + 1.15,
        car.z + fz * 0.75
      );
      lookTarget.set(car.x + fx * 42, car.y + 1.25, car.z + fz * 42);
      const roll = -car.steer * 0.045 - car.yawRate * 0.04;
      this.camera.position.copy(desired);
      this.camera.up.set(Math.sin(roll), Math.cos(roll), 0);
      this.camera.lookAt(lookTarget);
      const targetFov = 70 + Math.min(18, speed * 0.22) + (car.boosting ? 3 : 0);
      this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      this._applyShake(dt, speed, time);
      return;
    }

    this.camera.up.set(0, 1, 0);
    const close = this.mode === 'close';
    const motionYaw = speed > 4 ? Math.atan2(car.vx, car.vz) : car.yaw;
    const viewYaw = angleLerp(car.yaw, motionYaw, car.drifting ? 0.32 : 0.08);
    const dist = close ? 5.6 : 7.2 + Math.min(2.6, speed * 0.028);
    const height = close ? 2.15 : 2.65 + Math.min(0.9, speed * 0.012);
    desired.set(
      car.x - Math.sin(viewYaw) * dist,
      car.y + height,
      car.z - Math.cos(viewYaw) * dist
    );
    // Look slightly through the corner as the car steers.
    lookTarget.set(
      car.x + fx * 7.5,
      car.y + 1.15,
      car.z + fz * 7.5
    );

    if (!this.initialized) {
      this.pos.copy(desired);
      this.look.copy(lookTarget);
      this.initialized = true;
    }
    const posLerp = 1 - Math.exp(-dt * (car.boosting ? 6.5 : 5.2));
    const lookLerp = 1 - Math.exp(-dt * 9);
    this.pos.lerp(desired, posLerp);
    this.look.lerp(lookTarget, lookLerp);
    const rollTarget = -(car.yawRate * 0.032 + car.steer * 0.015);
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 5);
    this.camera.position.copy(this.pos);
    this.camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.camera.lookAt(this.look);

    const speedPct = THREE.MathUtils.clamp(speed / car.stats.topSpeed, 0, 1);
    const targetFov = 61 + speedPct * 16 + (car.boosting ? 5 : 0);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3.2);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this._applyShake(dt, speed, time);
  }

  _applyShake(dt, speed, time) {
    if (this.shake <= 0.001) return;
    const s = this.shake * (0.06 + Math.min(0.12, speed * 0.0015));
    this.camera.position.x += Math.sin(time * 71) * s;
    this.camera.position.y += Math.cos(time * 83) * s * 0.6;
    this.camera.position.z += Math.sin(time * 97) * s;
    this.shake = Math.max(0, this.shake - dt * 2.6);
  }
}
