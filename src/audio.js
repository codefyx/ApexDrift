/**
 * All game audio is synthesised with the Web Audio API, so there are no
 * audio files to download. Call init() from a user gesture.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.started = false;
    this.settings = { music: true, sfx: true, volume: 0.7 };
    this.engineGain = null;
    this.engineOsc = [];
    this.engineFilter = null;
    this.windGain = null;
    this.screechGain = null;
    this.boostGain = null;
    this.musicTimer = null;
    this.nextMusicTime = 0;
    this.chordIndex = 0;
    this.inRace = false;
  }

  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.volume;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.settings.sfx ? 1 : 0;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.settings.music ? 0.5 : 0;
    this.musicBus.connect(this.master);

    this.noiseBuffer = this._makeNoise(2.5);
    this._buildEngine();
    this.ready = true;
    if (this.settings.music) this.startMusic();
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _noiseSource(loop = true) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = loop;
    return src;
  }

  _buildEngine() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 3.2;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxBus);

    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'square';
      osc.frequency.value = 55 + i * 12;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.18;
      osc.connect(g);
      g.connect(this.engineFilter);
      osc.start();
      this.engineOsc.push(osc);
    }

    // wind / road noise
    const wind = this._noiseSource();
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 900;
    windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.sfxBus);
    wind.start();

    // tyre screech
    const screech = this._noiseSource();
    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 1750;
    screechFilter.Q.value = 6;
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    screech.connect(screechFilter);
    screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.sfxBus);
    screech.start();

    // nitro whoosh
    const boost = this._noiseSource();
    const boostFilter = ctx.createBiquadFilter();
    boostFilter.type = 'highpass';
    boostFilter.frequency.value = 700;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    boost.connect(boostFilter);
    boostFilter.connect(this.boostGain);
    this.boostGain.connect(this.sfxBus);
    boost.start();
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.ready) return;
    const ramp = 0.15;
    this.master.gain.setTargetAtTime(this.settings.volume, this.ctx.currentTime, ramp);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx ? 1 : 0, this.ctx.currentTime, ramp);
    const musicTarget = this.settings.music ? (this.inRace ? 0.26 : 0.5) : 0;
    this.musicBus.gain.setTargetAtTime(musicTarget, this.ctx.currentTime, 0.3);
    if (this.settings.music && !this.musicTimer) this.startMusic();
    if (!this.settings.music && this.musicTimer) this.stopMusic();
  }

  setScene(scene) {
    this.inRace = scene === 'race';
    if (this.ready && this.settings.music && this.musicTimer) {
      this.musicBus.gain.setTargetAtTime(this.inRace ? 0.26 : 0.5, this.ctx.currentTime, 0.4);
    }
  }

  engineUpdate({ speedPct = 0, throttle = 0, boost = false, slip = 0, onTrack = true, active = true }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (!active || !this.settings.sfx) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.12);
      this.windGain.gain.setTargetAtTime(0, t, 0.15);
      this.screechGain.gain.setTargetAtTime(0, t, 0.1);
      this.boostGain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    const base = 42 + speedPct * 190 + throttle * 16;
    for (let i = 0; i < this.engineOsc.length; i++) {
      this.engineOsc[i].frequency.setTargetAtTime(base * (i === 0 ? 1 : 2.01), t, 0.035);
    }
    this.engineFilter.frequency.setTargetAtTime(380 + speedPct * 1500 + throttle * 400, t, 0.06);
    const engineVol = 0.035 + speedPct * 0.035 + throttle * 0.02;
    this.engineGain.gain.setTargetAtTime(engineVol, t, 0.08);
    this.windGain.gain.setTargetAtTime(0.012 + speedPct * 0.045, t, 0.12);
    const screech = THREE_clamp((slip - 3) / 14, 0, 1) * (onTrack ? 1 : 0.25) * (speedPct > 0.08 ? 1 : 0);
    this.screechGain.gain.setTargetAtTime(screech * 0.10, t, 0.06);
    this.boostGain.gain.setTargetAtTime(boost ? 0.075 : 0, t, 0.05);
  }

  idleEngine() {
    this.engineUpdate({ speedPct: 0.03, throttle: 0.2, active: true });
  }

  _env(duration, attack = 0.005) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(this.sfxBus);
    return { gain: g, t };
  }

  tone(freq, duration = 0.15, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
    if (!this.ready || !this.settings.sfx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  noiseBurst(duration = 0.2, freq = 800, vol = 0.18, type = 'lowpass') {
    if (!this.ready || !this.settings.sfx) return;
    const src = this._noiseSource(false);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  click() { this.tone(660, 0.05, 'square', 0.05); }
  hover() { this.tone(880, 0.03, 'sine', 0.02); }
  purchase() {
    this.tone(523, 0.1, 'triangle', 0.09);
    this.tone(784, 0.1, 'triangle', 0.08, null, 0.08);
    this.tone(1046, 0.18, 'triangle', 0.07, null, 0.16);
  }
  error() {
    this.tone(220, 0.12, 'square', 0.06);
    this.tone(180, 0.16, 'square', 0.05, null, 0.1);
  }
  countdown(final = false) {
    if (final) {
      this.tone(880, 0.5, 'square', 0.12);
      this.tone(1320, 0.45, 'sine', 0.06, null, 0.02);
    } else {
      this.tone(440, 0.16, 'square', 0.1);
    }
  }
  pickup() {
    this.tone(1046, 0.08, 'sine', 0.08, 1568);
    this.tone(2093, 0.12, 'sine', 0.05, null, 0.05);
  }
  crash() {
    this.noiseBurst(0.24, 420, 0.22, 'lowpass');
    this.tone(70, 0.22, 'sine', 0.14, 40);
  }
  lap(final = false) {
    this.tone(final ? 784 : 587, 0.12, 'triangle', 0.08);
    this.tone(final ? 1046 : 880, 0.2, 'triangle', 0.07, null, 0.1);
  }
  finish() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.5, 'triangle', 0.1, null, i * 0.12));
    this.tone(1568, 0.8, 'sine', 0.05, null, 0.5);
  }
  countdownBeep(n) {
    this.countdown(n === 0);
  }
  startEngineSound() {
    if (this.ready) this.idleEngine();
  }

  startMusic() {
    if (!this.ready || this.musicTimer) return;
    this.nextMusicTime = this.ctx.currentTime + 0.3;
    this.chordIndex = 0;
    this.musicTimer = setInterval(() => this._scheduleMusic(), 250);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  _scheduleMusic() {
    if (!this.ready || !this.settings.music) return;
    const now = this.ctx.currentTime;
    if (this.nextMusicTime < now) this.nextMusicTime = now + 0.05;
    const chords = [
      [110, 130.81, 164.81],  // Am
      [87.31, 130.81, 174.61], // F
      [130.81, 164.81, 196],   // C
      [98, 146.83, 196]        // G
    ];
    const chordDur = 3.4;
    while (this.nextMusicTime < now + 0.6) {
      const chord = chords[this.chordIndex % chords.length];
      const start = this.nextMusicTime;
      const vol = this.inRace ? 0.02 : 0.032;
      for (const freq of chord) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 8;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(vol, start + 0.8);
        g.gain.linearRampToValueAtTime(vol * 0.7, start + chordDur - 0.8);
        g.gain.linearRampToValueAtTime(0.0001, start + chordDur);
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.musicBus);
        osc.start(start);
        osc.stop(start + chordDur + 0.05);
      }
      // soft arpeggio sparkle
      const arp = [2, 1.5, 2.5, 1.5];
      for (let i = 0; i < 4; i++) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const t = start + 0.5 + i * 0.75;
        osc.type = 'sine';
        osc.frequency.value = chord[i % chord.length] * arp[i] * 2;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(this.inRace ? 0.005 : 0.009, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(g);
        g.connect(this.musicBus);
        osc.start(t);
        osc.stop(t + 0.55);
      }
      this.nextMusicTime += chordDur;
      this.chordIndex++;
    }
  }
}

function THREE_clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export const audio = new AudioEngine();
