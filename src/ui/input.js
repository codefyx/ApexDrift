/**
 * Unified keyboard / touch / tilt input.
 * Touch buttons live in the HUD and are wired through data-action attributes.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.actions = new Set();
    this.pointerActions = new Map();
    this.tilt = 0;
    this.tiltEnabled = false;
    this.autoThrottle = false;
    this.onAction = null;
    this.enabled = true;
    this._bound = false;
    this._lastInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false };
  }

  attach() {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup', e => this._onKey(e, false));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('pointerdown', e => this._onPointer(e, true), { passive: false });
    document.addEventListener('pointerup', e => this._onPointer(e, false));
    document.addEventListener('pointercancel', e => this._onPointer(e, false));
    window.addEventListener('deviceorientation', e => {
      if (!this.tiltEnabled || e.gamma == null) return;
      const gamma = Math.max(-35, Math.min(35, e.gamma));
      this.tilt = gamma / 35;
    });
  }

  setSettings(settings) {
    this.autoThrottle = !!settings.autoThrottle;
    this.tiltEnabled = !!settings.tilt && !!settings.tiltPermission;
  }

  async requestTiltPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  _onKey(e, down) {
    if (!this.enabled) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    const mapping = {
      arrowup: 'throttle', w: 'throttle',
      arrowdown: 'brake', s: 'brake',
      arrowleft: 'left', a: 'left',
      arrowright: 'right', d: 'right',
      ' ': 'handbrake',
      shift: 'boost'
    };
    if (mapping[k]) {
      e.preventDefault();
      if (down) this.keys.add(mapping[k]);
      else this.keys.delete(mapping[k]);
      return;
    }
    if (!down) return;
    if (k === 'c') this._action('camera');
    else if (k === 'r') this._action('reset');
    else if (k === 'p' || k === 'escape') this._action('pause');
    else if (k === 'm') this._action('mute');
    else if (k === 'enter') this._action('confirm');
  }

  _onPointer(e, down) {
    const target = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!target) return;
    const action = target.dataset.action;
    if (down) {
      e.preventDefault();
      if (target.dataset.hold !== 'false') {
        this.pointerActions.set(e.pointerId, action);
        this.actions.add(action);
      }
      this._action(action, target);
    } else {
      const prev = this.pointerActions.get(e.pointerId);
      if (prev) {
        this.pointerActions.delete(e.pointerId);
        if (![...this.pointerActions.values()].includes(prev)) this.actions.delete(prev);
      }
    }
  }

  _action(action, element) {
    if (['pause', 'camera', 'reset', 'mute', 'confirm'].includes(action)) {
      if (this.onAction) this.onAction(action, element);
    }
  }

  clear() {
    this.keys.clear();
    this.actions.clear();
    this.pointerActions.clear();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.clear();
  }

  read() {
    const k = this.keys;
    const a = this.actions;
    let steer = 0;
    if (k.has('left') || a.has('steer-left')) steer += 1;
    if (k.has('right') || a.has('steer-right')) steer -= 1;
    if (this.tiltEnabled && Math.abs(this.tilt) > 0.08) {
      steer = Math.max(-1, Math.min(1, - (this.tilt * 1.35)));
    }
    let throttle = (k.has('throttle') || a.has('throttle')) ? 1 : 0;
    if (this.autoThrottle) throttle = 1;
    const brake = (k.has('brake') || a.has('brake')) ? 1 : 0;
    if (brake) throttle = 0;
    const handbrake = k.has('handbrake') || a.has('handbrake');
    const boost = k.has('boost') || a.has('boost');
    this._lastInput = { steer, throttle, brake, handbrake, boost };
    return this._lastInput;
  }
}

export const input = new Input();
