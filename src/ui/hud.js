import { iconSvg } from '../data/gameData.js';

function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--.---';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function fmtGap(sec) {
  if (sec == null || !isFinite(sec)) return '';
  if (sec <= 0.05) return 'LEADER';
  return '+' + sec.toFixed(1) + 's';
}

export class Hud {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.race = null;
    this.frame = 0;
    this.paused = false;
    this.cache = {};
    this.msgTimer = null;
    this.lastCountdown = null;
    this.lastLapFlash = 0;
    this.lastStandings = [];
    root.innerHTML = this._markup();
    this.el = {
      hud: root.querySelector('#hud'),
      position: root.querySelector('#hud-position'),
      positionSmall: root.querySelector('#hud-position + small'),
      lap: root.querySelector('#hud-lap'),
      time: root.querySelector('#hud-time'),
      best: root.querySelector('#hud-best'),
      speed: root.querySelector('#hud-speed'),
      gear: root.querySelector('#hud-gear'),
      arc: root.querySelector('#speed-arc'),
      nitro: root.querySelector('#nitro-fill'),
      leaderboard: root.querySelector('#leaderboard'),
      minimap: root.querySelector('#minimap'),
      mmTrack: root.querySelector('#mm-track'),
      mmLap: root.querySelector('#mm-lap'),
      countdown: root.querySelector('#countdown'),
      message: root.querySelector('#race-message'),
      msgTitle: root.querySelector('#race-message .rm-title'),
      msgSub: root.querySelector('#race-message .rm-sub'),
      wrongWay: root.querySelector('#wrong-way'),
      driftMeter: root.querySelector('#drift-meter'),
      driftPoints: root.querySelector('#drift-points'),
      driftMult: root.querySelector('#drift-mult'),
      flash: root.querySelector('#damage-flash'),
      pickupFeed: root.querySelector('#pickup-feed'),
      startLights: root.querySelector('#start-lights'),
      pause: root.querySelector('#pause-screen'),
      pauseStats: root.querySelector('#pause-stats')
    };
    this.mctx = this.el.minimap.getContext('2d');
    this._bind();
  }

  _markup() {
    return `
    <div class="hud" id="hud" aria-hidden="true">
      <div class="race-top">
        <div class="race-position glass">
          <div class="position-badge"><span id="hud-position">P8</span><small>/8</small></div>
          <div class="race-meta">
            <div class="lap-line"><span class="dot"></span><span id="hud-lap">LAP 1/3</span></div>
            <div class="time-line" id="hud-time">0:00.000</div>
            <div class="best-line">BEST <span id="hud-best">--:--.---</span></div>
          </div>
        </div>
        <div class="race-center">
          <div class="start-lights" id="start-lights"><i></i><i></i><i></i></div>
          <div class="countdown" id="countdown"></div>
          <div class="race-message" id="race-message"><span class="rm-title"></span><span class="rm-sub"></span></div>
          <div class="wrong-way" id="wrong-way">${iconSvg('back', 16)} WRONG WAY</div>
          <div class="drift-meter" id="drift-meter">
            <span class="drift-label">DRIFT</span>
            <span class="drift-points" id="drift-points">0</span>
            <span class="drift-mult" id="drift-mult">x1.0</span>
          </div>
        </div>
        <div class="race-right">
          <div class="minimap-panel glass">
            <canvas id="minimap" width="320" height="320"></canvas>
            <div class="mm-footer"><span id="mm-track">CIRCUIT</span><span id="mm-lap">L1/3</span></div>
          </div>
          <div class="leaderboard glass" id="leaderboard"></div>
        </div>
      </div>

      <div class="race-bottom">
        <div class="speed-cluster">
          <div class="speed-ring-wrap">
            <svg viewBox="0 0 120 120" class="speed-ring">
              <circle cx="60" cy="60" r="50" class="sr-bg"/>
              <circle cx="60" cy="60" r="50" class="sr-fill" id="speed-arc"/>
            </svg>
            <div class="speed-readout"><span id="hud-speed">0</span><span class="unit">KM/H</span></div>
          </div>
          <div class="gear-badge"><span id="hud-gear">1</span><small>GEAR</small></div>
          <div class="nitro-block"><span class="nitro-label">NITRO</span><div class="nitro-track"><div id="nitro-fill"></div></div></div>
        </div>

        <div class="touch-controls">
          <div class="tc-steer">
            <button class="tc-btn steer" data-action="steer-left" aria-label="Steer left"><span>◀</span></button>
            <button class="tc-btn steer" data-action="steer-right" aria-label="Steer right"><span>▶</span></button>
          </div>
          <div class="tc-pedals">
            <button class="tc-btn pedal boost" data-action="boost" aria-label="Nitro">NITRO</button>
            <button class="tc-btn pedal drift" data-action="handbrake" aria-label="Drift">DRIFT</button>
            <button class="tc-btn pedal brake" data-action="brake" aria-label="Brake">BRAKE</button>
            <button class="tc-btn pedal gas" data-action="throttle" aria-label="Accelerate">GAS</button>
          </div>
        </div>

        <div class="race-buttons">
          <button class="icon-btn" data-action="camera" title="Camera (C)">${iconSvg('camera', 18)}</button>
          <button class="icon-btn" data-action="reset" title="Reset to track (R)">${iconSvg('tire', 18)}</button>
          <button class="icon-btn" data-action="pause" title="Pause (Esc)">${iconSvg('pause', 18)}</button>
        </div>
      </div>

      <div class="damage-flash" id="damage-flash"></div>
      <div class="pickup-feed" id="pickup-feed"></div>

      <div class="pause-screen hud-overlay" id="pause-screen">
        <div class="overlay-card pause-card">
          <div class="eyebrow">RACE PAUSED</div>
          <h2>TAKE A BREATH</h2>
          <div class="pause-stats" id="pause-stats"></div>
          <div class="pause-actions">
            <button class="btn primary" data-hud="resume">${iconSvg('play', 18)} RESUME</button>
            <button class="btn ghost" data-hud="restart">${iconSvg('back', 18)} RESTART RACE</button>
            <button class="btn ghost danger" data-hud="quit">QUIT TO CIRCUITS</button>
          </div>
          <div class="pause-footer">
            <span>WASD / ARROWS · SPACE DRIFT · SHIFT NITRO · C CAMERA · R RESET</span>
          </div>
        </div>
      </div>
    </div>`;
  }

  _bind() {
    this.root.querySelectorAll('[data-hud]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.hud;
        if (a === 'resume' && this.callbacks.onResume) this.callbacks.onResume();
        if (a === 'restart' && this.callbacks.onRestart) this.callbacks.onRestart();
        if (a === 'quit' && this.callbacks.onQuit) this.callbacks.onQuit();
      });
    });
  }

  show(race) {
    this.race = race;
    this.paused = false;
    this.cache = {};
    this.lastCountdown = null;
    this.el.hud.classList.add('visible');
    this.el.hud.setAttribute('aria-hidden', 'false');
    this.el.pause.classList.remove('open');
    this.el.mmTrack.textContent = race.mode === 'practice' ? 'PRACTICE' : race.def.name.toUpperCase();
    this.el.leaderboard.classList.toggle('is-hidden', race.mode === 'practice');
    this.el.wrongWay.classList.remove('show');
    this.el.driftMeter.classList.remove('active');
    this.setMessage('', '', 0);
    this.el.countdown.textContent = '';
    this.el.countdown.classList.remove('show', 'go');
    this.el.startLights.className = 'start-lights';
    this.el.pickupFeed.innerHTML = '';
    this.makeMapPath(race.track);
  }

  hide() {
    this.el.hud.classList.remove('visible');
    this.el.hud.setAttribute('aria-hidden', 'true');
    this.el.pause.classList.remove('open');
  }

  makeMapPath(track) {
    const pts = track.map;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const size = 320;
    const pad = 34;
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const scale = (size - pad * 2) / span;
    const ox = (size - span * scale) / 2 - minX * scale;
    const oy = (size - span * scale) / 2 - minY * scale;
    this.mapPath = pts.map(p => ({ x: p.x * scale + ox, y: p.y * scale + oy, t: p.t }));
    this.mapSize = size;
  }

  mapPoint(t) {
    // mapPath is evenly sampled; interpolate between the two nearest entries.
    const pts = this.mapPath;
    const f = ((t % 1) + 1) % 1;
    const raw = f * (pts.length - 1);
    const i = Math.floor(raw);
    const frac = raw - i;
    const a = pts[Math.min(i, pts.length - 1)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
  }

  setMessage(title, sub = '', duration = 1.8, cls = '') {
    if (this.msgTimer) clearTimeout(this.msgTimer);
    const msg = this.el.message;
    msg.className = 'race-message ' + cls;
    if (!title) {
      msg.classList.remove('show');
      return;
    }
    this.el.msgTitle.textContent = title;
    this.el.msgSub.textContent = sub;
    void msg.offsetWidth;
    msg.classList.add('show');
    if (duration > 0) {
      this.msgTimer = setTimeout(() => {
        msg.classList.remove('show');
      }, duration * 1000);
    }
  }

  setCountdown(text, go = false) {
    if (this.lastCountdown === text) return;
    this.lastCountdown = text;
    const el = this.el.countdown;
    if (!text) {
      el.textContent = '';
      el.classList.remove('show', 'go');
      return;
    }
    el.textContent = text;
    el.classList.remove('show', 'go');
    void el.offsetWidth;
    el.classList.add('show');
    if (go) el.classList.add('go');
  }

  setStartLights(n, go = false) {
    const lights = this.el.startLights.querySelectorAll('i');
    lights.forEach((l, i) => {
      l.classList.toggle('on', go ? true : i < n);
      l.classList.toggle('green', go);
    });
    this.el.startLights.classList.toggle('go', go);
  }

  setPaused(paused) {
    this.paused = paused;
    this.el.pause.classList.toggle('open', paused);
    if (paused && this.race) {
      const p = this.race.player;
      const modeCell = this.race.mode === 'practice'
        ? '<div><span>MODE</span><b>PRACTICE</b></div>'
        : `<div><span>POSITION</span><b>${this.race.playerPosition}/${this.race.cars.length}</b></div>`;
      this.el.pauseStats.innerHTML = `
        ${modeCell}
        <div><span>LAP</span><b>${Math.max(1, p.lineCrossings)}/${p.laps}</b></div>
        <div><span>RACE TIME</span><b>${fmtTime(this.race.raceTime)}</b></div>
        <div><span>BEST LAP</span><b>${fmtTime(p.bestLap)}</b></div>`;
    }
  }

  flashDamage(strength = 1) {
    const el = this.el.flash;
    el.style.opacity = String(Math.min(0.5, 0.16 + strength * 0.15));
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
    setTimeout(() => { el.style.opacity = '0'; }, 380);
  }

  pickup(text) {
    const d = document.createElement('div');
    d.className = 'pickup-toast';
    d.innerHTML = `<span class="diamond">◆</span> ${text}`;
    this.el.pickupFeed.appendChild(d);
    setTimeout(() => d.remove(), 1400);
  }

  lapFlash(lap, laps, time) {
    if (lap >= laps) return;
    if (lap === laps - 1) {
      this.setMessage('FINAL LAP', 'LAP ' + lap + '  ' + fmtTime(time), 2.6, 'final');
    } else {
      this.setMessage(`LAP ${lap + 1} / ${laps}`, 'LAP ' + lap + '  ' + fmtTime(time), 2.2, '');
    }
  }

  update(race) {
    if (!this.race || this.paused) return;
    this.frame++;
    const p = race.player;
    const total = race.cars.length;
    if (race.mode === 'practice') {
      this.el.position.textContent = 'TT';
      this.el.positionSmall.textContent = 'SOLO';
    } else {
      this.el.position.textContent = 'P' + race.playerPosition;
      this.el.positionSmall.textContent = '/' + total;
    }

    const lap = Math.min(p.laps, Math.max(1, p.lineCrossings));
    this.el.lap.textContent = `LAP ${lap}/${p.laps}`;
    this.el.mmLap.textContent = `L${lap}/${p.laps}`;
    this.el.time.textContent = fmtTime(p.finished ? p.finishTime : race.raceTime);
    const best = p.bestLap || race.sessionBest;
    this.el.best.textContent = fmtTime(best);

    const kmh = Math.round(p.speedKmh);
    if (this.cache.kmh !== kmh) {
      this.cache.kmh = kmh;
      this.el.speed.textContent = kmh;
      const pct = Math.min(1, p.speedKmh / (p.stats.topSpeed * 3.6));
      const circumference = 2 * Math.PI * 50;
      this.el.arc.style.strokeDashoffset = String(circumference * (1 - pct * 0.82));
      this.el.arc.classList.toggle('hot', pct > 0.8);
    }
    const gear = p.speed < -1 ? 'R' : String(p.gear);
    if (this.cache.gear !== gear) {
      this.cache.gear = gear;
      this.el.gear.textContent = gear;
    }
    this.el.nitro.style.width = (p.nitro * 100).toFixed(1) + '%';
    this.el.nitro.classList.toggle('boosting', p.boosting);

    this.el.wrongWay.classList.toggle('show', !!p.wrongWay && !p.finished);
    this.el.driftMeter.classList.toggle('active', p.drifting && p.driftScore > 1);
    if (p.drifting) {
      this.el.driftPoints.textContent = Math.round(p.driftScore).toLocaleString();
      this.el.driftMult.textContent = 'x' + p.driftCombo.toFixed(1);
    }

    if (this.frame % 2 === 0) this.drawMinimap(race);
    if (this.frame % 6 === 0) this.drawLeaderboard(race);
  }

  drawLeaderboard(race) {
    if (race.mode === 'practice') return;
    const standings = race.standings;
    if (!standings || !standings.length) return;
    const playerIdx = standings.findIndex(c => c.isPlayer);
    let rows = standings.slice(0, 5);
    if (playerIdx >= 5) rows = rows.concat([{ ...standings[playerIdx] }]);
    const leader = standings[0];
    let html = '';
    for (const c of rows) {
      let gap = '';
      if (c !== leader) {
        if (c.finished && leader.finished) gap = fmtGap(c.finishTime - leader.finishTime);
        else {
          const dist = (leader.raceProgress - c.raceProgress) * race.track.length;
          gap = dist <= 1 ? '' : '+' + (dist / 34).toFixed(1) + 's';
        }
      } else {
        gap = 'LEADER';
      }
      const pos = standings.indexOf(c) + 1;
      html += `<div class="lb-row ${c.isPlayer ? 'you' : ''}">
        <span class="lb-pos">${pos}</span>
        <span class="lb-color" style="background:${c.cssColor}"></span>
        <span class="lb-name">${c.isPlayer ? 'YOU' : c.name}</span>
        <span class="lb-gap">${gap}</span>
      </div>`;
    }
    if (this.el.leaderboard.innerHTML !== html) this.el.leaderboard.innerHTML = html;
  }

  drawMinimap(race) {
    const ctx = this.mctx;
    const S = this.mapSize || 320;
    ctx.clearRect(0, 0, S, S);
    const pts = this.mapPath;
    if (!pts) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // base circuit
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(8,10,18,0.55)';
    ctx.lineWidth = 7;
    ctx.stroke();

    // completed progress
    const p = race.player;
    const prog = p.lineCrossings > 0 ? p.progress : 0;
    if (prog > 0.001) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      const end = Math.floor(prog * (pts.length - 1));
      for (let i = 1; i <= end; i++) ctx.lineTo(pts[i].x, pts[i].y);
      const ep = this.mapPoint(prog);
      ctx.lineTo(ep.x, ep.y);
      ctx.strokeStyle = 'rgba(61,245,255,0.95)';
      ctx.lineWidth = 5;
      ctx.shadowColor = 'rgba(61,245,255,0.8)';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // start line
    const start = pts[0];
    const dir = { x: pts[2].x - pts[0].x, y: pts[2].y - pts[0].y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const nx = -dir.y / len, ny = dir.x / len;
    ctx.beginPath();
    ctx.moveTo(start.x - nx * 8, start.y - ny * 8);
    ctx.lineTo(start.x + nx * 8, start.y + ny * 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // cars
    for (const c of race.cars) {
      const pos = this.mapPoint(c.progress);
      if (c.isPlayer) {
        const ahead = this.mapPoint(c.progress + 0.006);
        const a = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(a);
        const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.1;
        ctx.fillStyle = 'rgba(61,245,255,0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-6, 5.5);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, -5.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3df5ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = c.cssColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}

export { fmtTime };
