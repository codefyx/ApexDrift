/**
 * Apex Drift — application shell.
 * Owns the renderer, menu showroom, screen routing, economy UI and the
 * lifecycle of individual races.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { store } from './state.js';
import {
  TRACK_DEFS, getTrackDef, getBuiltTrack, formatTrackLength
} from './data/tracks.js';
import {
  UPGRADES, UPGRADE_ORDER, PAINTS, FINISHES, UNDERGLOWS, ACHIEVEMENTS,
  DIFFICULTIES, iconSvg, upgradeCost, positionLabel
} from './data/gameData.js';
import { audio } from './audio.js';
import { input } from './ui/input.js';
import { Hud, fmtTime } from './ui/hud.js';
import { Showroom } from './render/showroom.js';
import { Race } from './game/race.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = n => Number(n || 0).toLocaleString('en-US');
const diamondsLabel = () => store.hasUnlimitedDiamonds() ? '∞' : num(store.save.diamonds);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
const CHEAT_CODE = 'apex28';

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

function dateLabel(iso) {
  try { return DATE_FMT.format(new Date(iso)); } catch { return '—'; }
}

function currentDifficulty() {
  return DIFFICULTIES[store.save.settings.difficulty] || DIFFICULTIES.normal;
}

function setDifficulty(id, { silent = false } = {}) {
  const diff = DIFFICULTIES[id];
  if (!diff || currentDifficulty().id === id) return;
  store.save.settings.difficulty = id;
  store.persist();
  renderSettings();
  renderTracks();
  if (!silent) {
    audio.click();
    showToast(`Difficulty: ${diff.name}. ${diff.blurb}`, 'info', 'gauge');
  }
}

function cycleDifficulty() {
  const i = DIFFICULTY_ORDER.indexOf(currentDifficulty().id);
  setDifficulty(DIFFICULTY_ORDER[(i + 1) % DIFFICULTY_ORDER.length]);
}

function isCoarsePointer() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function detectMobile() {
  return isCoarsePointer() || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

const MOBILE = detectMobile();

function qualityValue(mode = store.save.settings.quality) {
  if (mode === 'high') return 1;
  if (mode === 'low') return 0.36;
  return MOBILE ? 0.56 : 1;
}

function bloomEnabled(mode = store.save.settings.quality) {
  if (mode === 'high') return true;
  if (mode === 'low') return false;
  return !MOBILE;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function secureInstallContext() {
  return location.protocol === 'https:' ||
    ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
}

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

let renderer = null;
let composer = null;
let renderPass = null;
let bloomPass = null;
let outputPass = null;
let showroom = null;
let race = null;
let hud = null;

let booted = false;
let bootFailed = false;
let currentScreen = 'home';
let garageTab = 'performance';
let selectedTrackId = TRACK_DEFS.some(t => t.id === store.save.lastTrack)
  ? store.save.lastTrack : 'coast';
let raceTrackId = null;
let raceMode = 'race';
let startingRace = false;
let settled = false;
let resultsOpen = false;
let confirmOpen = false;
let confirmResolve = null;
let deferredInstall = null;
let tiltGranted = false;
let lastFrame = performance.now();
let elapsed = 0;
let lastSaveTick = Date.now();
let cheatBuffer = '';
let bootTapTimes = [];

const cornerCache = new Map();

const els = {};

/* ------------------------------------------------------------------ */
/* renderer + boot                                                     */
/* ------------------------------------------------------------------ */

function init() {
  cacheElements();
  bindStaticUI();

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: els.stage,
      antialias: !MOBILE,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = qualityValue() > 0.5;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch (err) {
    bootFailed = true;
    console.error('WebGL unavailable', err);
    showBootFailure();
    return;
  }

  showroom = new Showroom(store, window.innerWidth / window.innerHeight, qualityValue());
  configurePost();
  resizeViewport();

  hud = new Hud(els.hudRoot, {
    onResume: () => { if (race) race.setPaused(false); },
    onRestart: () => restartRace(),
    onQuit: () => quitToCircuits()
  });

  input.attach();
  input.onAction = handleInputAction;

  applySettings();
  renderChrome();
  renderHome();
  renderTracks();
  renderGarage();
  renderRewards();
  renderHistory();
  renderSettings();
  updatePortrait();
  updateInstallUI();
  updateNetStatus();
  showScreen('home', { silent: true });

  store.onChange(() => renderChrome());

  window.addEventListener('resize', resizeViewport);
  window.addEventListener('orientationchange', () => setTimeout(resizeViewport, 220));
  window.addEventListener('keydown', handleGlobalKey, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && race && !race.isPaused() && !resultsOpen) {
      race.setPaused(true);
    }
  });

  setInterval(() => {
    if (!booted) return;
    const now = Date.now();
    const secs = Math.max(1, Math.round((now - lastSaveTick) / 1000));
    lastSaveTick = now;
    store.addPlayTime(secs);
    store.persist();
  }, 30000);

  window.addEventListener('beforeunload', () => {
    if (booted) store.persist();
  });

  bindInstallFlow();
  registerServiceWorker();

  els.boot.classList.remove('is-ready');
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function cacheElements() {
  els.stage = $('#stage');
  els.shell = $('#shell');
  els.screens = $('#screens');
  els.boot = $('#boot');
  els.bootStart = $('#boot-start');
  els.bootMark = $('.boot-mark');
  els.bootCode = $('#boot-code');
  els.bootCodeClose = $('#boot-code-close');
  els.bootCodeInput = $('#boot-code-input');
  els.bootCodeSubmit = $('#boot-code-submit');
  els.bootCodeNote = $('#boot-code-note');
  els.hudRoot = $('#hud-root');
  els.loading = $('#loading');
  els.loadingTitle = $('#loading-title');
  els.loadingSub = $('#loading-sub');
  els.results = $('#results');
  els.resultsContent = $('#results-content');
  els.confirm = $('#confirm');
  els.confirmIcon = $('#confirm-icon');
  els.confirmTitle = $('#confirm-title');
  els.confirmBody = $('#confirm-body');
  els.confirmYes = $('#confirm-yes');
  els.confirmNo = $('#confirm-no');
  els.toastRoot = $('#toast-root');
  els.portrait = $('#portrait-warning');
  els.dailyCard = $('#daily-card');
  els.levelCard = $('#level-card');
  els.achievementGrid = $('#achievement-grid');
  els.achievementCount = $('#achievement-count');
  els.garageBody = $('#garage-body');
  els.trackNodes = $('#track-nodes');
  els.trackDetail = $('#track-detail');
  els.progressMap = $('#progress-map');
  els.historyList = $('#history-list');
  els.homeRecord = $('#home-record');
  els.homeStats = $('#home-stats');
  els.homeDaily = $('#home-daily-card');
  els.homeStrip = $('#home-strip');
}

function showBootFailure() {
  const meta = $('.boot-meta');
  if (meta) meta.innerHTML = '<span class="bad">WEBGL UNAVAILABLE</span><span>TRY CHROME OR EDGE</span><span>v1.1.0</span>';
  if (els.bootStart) {
    els.bootStart.disabled = true;
    els.bootStart.textContent = 'WEBGL REQUIRED';
  }
  const hint = $('.boot-hint');
  if (hint) hint.textContent = 'Enable hardware acceleration in your browser, then reload.';
}

function revealCheatEntry() {
  if (booted || bootFailed || !els.bootCode) return;
  els.bootCode.classList.add('show');
  els.bootCode.setAttribute('aria-hidden', 'false');
  if (els.bootCodeInput) {
    els.bootCodeInput.value = '';
    setTimeout(() => els.bootCodeInput.focus({ preventScroll: true }), 30);
  }
  if (els.bootCodeNote) els.bootCodeNote.textContent = 'CLEARANCE REQUIRED';
}

function closeCheatEntry() {
  if (!els.bootCode) return;
  els.bootCode.classList.remove('show');
  els.bootCode.setAttribute('aria-hidden', 'true');
  if (els.bootCodeInput) {
    els.bootCodeInput.value = '';
    els.bootCodeInput.blur();
  }
}

function activateCheat() {
  const fresh = store.activateUnlimitedDiamonds();
  closeCheatEntry();
  cheatBuffer = '';
  renderChrome();
  if (booted) {
    renderGarage();
    renderRewards();
    renderHistory();
  }
  showToast(
    fresh ? 'ACCESS GRANTED · UNLIMITED DIAMONDS' : 'UNLIMITED DIAMONDS ALREADY ACTIVE',
    'success',
    'diamond'
  );
}

function submitCheatCode() {
  if (!els.bootCodeInput) return;
  const code = els.bootCodeInput.value.trim().toLowerCase();
  if (code === CHEAT_CODE) {
    activateCheat();
    return;
  }
  audio.error();
  if (els.bootCodeNote) els.bootCodeNote.textContent = 'ACCESS DENIED · TRY AGAIN';
  els.bootCode.classList.remove('shake');
  void els.bootCode.offsetWidth;
  els.bootCode.classList.add('shake');
  els.bootCodeInput.value = '';
  els.bootCodeInput.focus({ preventScroll: true });
}

function registerBootTap() {
  if (booted || bootFailed) return;
  const now = performance.now();
  bootTapTimes = bootTapTimes.filter(t => now - t < 2200);
  bootTapTimes.push(now);
  if (bootTapTimes.length >= 5) {
    bootTapTimes = [];
    revealCheatEntry();
  }
}

function bootGame() {
  if (booted || bootFailed) return;
  booted = true;
  lastSaveTick = Date.now();
  closeCheatEntry();

  try { audio.init(); } catch (err) { console.warn('Audio could not start', err); }
  applySettings();

  els.shell.classList.remove('is-hidden');
  els.boot.classList.add('is-out');
  setTimeout(() => els.boot.classList.add('is-hidden'), 520);

  showScreen('home');
  renderChrome();
  updatePortrait();
  updateInstallUI();

  // iOS requires a user gesture for gyro permission.
  if (store.save.settings.tilt) {
    input.requestTiltPermission().then(granted => {
      tiltGranted = granted;
      applySettings();
      if (!granted) showToast('Tilt permission was not granted.', 'error');
    });
  }
}

/* ------------------------------------------------------------------ */
/* render loop                                                         */
/* ------------------------------------------------------------------ */

function loop(now) {
  requestAnimationFrame(loop);
  const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
  lastFrame = now;
  elapsed += dt;

  if (!race) {
    if (showroom) showroom.update(dt, elapsed);
    renderScene(showroom.scene, showroom.camera);
    return;
  }

  if (!resultsOpen) {
    race.update(dt);
  }
  renderScene(race.scene, race.camera);
}

function renderScene(scene, camera) {
  if (!scene || !camera) return;
  if (composer && renderPass) {
    renderPass.scene = scene;
    renderPass.camera = camera;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

function configurePost() {
  disposeComposer();
  if (!renderer || !bloomEnabled()) return;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(showroom.scene, showroom.camera);
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.52, 0.72, 0.84
  );
  outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
}

function disposeComposer() {
  if (composer) {
    for (const pass of composer.passes) {
      if (pass && typeof pass.dispose === 'function') pass.dispose();
    }
  }
  composer = null;
  renderPass = null;
  bloomPass = null;
  outputPass = null;
}

function resizeViewport() {
  if (!renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityValue() > 0.6 ? 1.8 : 1.25));
  renderer.setSize(w, h, false);
  if (showroom) showroom.resize(w / h, w);
  if (race) race.resize(w / h);
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  }
  updatePortrait();
}

/* ------------------------------------------------------------------ */
/* screen routing                                                      */
/* ------------------------------------------------------------------ */

function showScreen(name, { silent = false } = {}) {
  if (race) return;
  if (!['home', 'tracks', 'garage', 'rewards', 'history', 'settings'].includes(name)) {
    name = 'home';
  }
  const changed = currentScreen !== name;
  currentScreen = name;
  document.body.dataset.screen = name;

  $$('.page').forEach(page => page.classList.toggle('active', page.dataset.page === name));
  $$('.dock-btn').forEach(btn => {
    const on = btn.dataset.screen === name;
    btn.classList.toggle('active', on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  if (name === 'tracks') renderTracks();
  else if (name === 'garage') renderGarage();
  else if (name === 'rewards') renderRewards();
  else if (name === 'history') renderHistory();
  else if (name === 'settings') renderSettings();
  else renderHome();

  if (showroom) {
    showroom.setLayout(name === 'garage' ? 'garage' : 'menu');
    showroom.setInteractive(name === 'garage');
    showroom.resize(window.innerWidth / window.innerHeight, window.innerWidth);
  }

  if (changed && !silent) {
    els.screens.scrollTop = 0;
    const page = $(`.page[data-page="${name}"]`);
    if (page) page.scrollTop = 0;
  }
  renderChrome();
}

/* ------------------------------------------------------------------ */
/* chrome / persistent UI                                              */
/* ------------------------------------------------------------------ */

function renderChrome() {
  const s = store.save;
  const xpNeeded = store.xpNeeded();
  const daily = store.dailyInfo();
  const claimable = ACHIEVEMENTS.filter(a => store.achievementState(a.id).claimable).length;

  setText('#diamond-count', diamondsLabel());
  setText('#garage-bank', diamondsLabel());
  setText('#rewards-bank', diamondsLabel());
  const unlimited = store.hasUnlimitedDiamonds();
  $$('.diamond-chip, .garage-bank').forEach(el => el.classList.toggle('unlimited', unlimited));
  const diamondChip = $('.diamond-chip');
  if (diamondChip) diamondChip.title = unlimited ? 'Unlimited diamonds — access code active' : 'Your diamonds';
  setText('#level-badge', `LV ${s.level}`);
  setText('#xp-label', `${num(s.xp)} / ${num(xpNeeded)} XP`);
  const fill = $('#xp-fill');
  if (fill) fill.style.width = clamp((s.xp / xpNeeded) * 100, 0, 100) + '%';

  const dailyDot = $('#daily-dot');
  if (dailyDot) dailyDot.classList.toggle('show', !daily.claimedToday);
  const rewardDot = $('#reward-dot');
  if (rewardDot) rewardDot.classList.toggle('show', claimable > 0);

  const mute = $('#mute-btn');
  if (mute) {
    const muted = !!s.settings.muted;
    mute.classList.toggle('is-muted', muted);
    mute.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    mute.title = muted ? 'Unmute audio' : 'Mute audio';
  }

  updateNetStatus();
}

function setText(selector, text) {
  const el = $(selector);
  if (el) el.textContent = text;
}

function renderHome() {
  if (!els.homeRecord) return;
  const s = store.save;
  const last = s.history[0];
  const daily = store.dailyInfo();
  const nextTrackId = nextTrackAfter(s.lastTrack)?.id || 'coast';
  const nextUnlock = store.trackUnlock(nextTrackId);

  if (last) {
    const cls = last.position <= 3 ? 'podium' : last.position <= 5 ? 'points' : '';
    els.homeRecord.innerHTML = `
      <div class="record-card glass">
        <div class="record-head">
          <span class="record-kicker">LAST RACE</span>
          <span class="record-date">${esc(dateLabel(last.date))}</span>
        </div>
        <div class="record-main">
          <span class="record-pos ${cls}">${positionLabel(last.position)}</span>
          <div class="record-copy">
            <b>${esc(last.trackName)}</b>
            <small>${last.laps} LAPS · ${last.clean ? 'CLEAN RUN' : last.wallHits + ' WALL HITS'}</small>
          </div>
          <div class="record-time">
            <b>${fmtTime(last.time)}</b>
            <small>BEST ${fmtTime(last.bestLap)}</small>
          </div>
        </div>
        <div class="record-foot">
          <span>${iconSvg('diamond', 14)} +${num(last.diamonds)} earned</span>
          <span>${iconSvg('history', 14)} ${num(s.stats.races)} total races</span>
        </div>
      </div>`;
  } else {
    els.homeRecord.innerHTML = `
      <div class="record-card glass record-empty">
        <span class="record-empty-icon">${iconSvg('flag', 24)}</span>
        <div>
          <b>YOUR FIRST RACE IS WAITING</b>
          <small>Sunset Coast is open. Learn the line, bank diamonds and build your machine.</small>
        </div>
      </div>`;
  }

  const stats = [
    ['flag', num(s.stats.races), 'RACES'],
    ['trophy', num(s.stats.wins), 'WINS'],
    ['podium', num(s.stats.podiums), 'PODIUMS'],
    ['diamond', num(s.stats.diamondsEarned), 'EARNED']
  ];
  els.homeStats.innerHTML = stats.map(([icon, value, label]) => `
    <div class="hstat">
      <span class="hstat-icon">${iconSvg(icon, 18)}</span>
      <b>${value}</b>
      <small>${label}</small>
    </div>`).join('');

  const claimed = daily.claimedToday;
  els.homeDaily.innerHTML = `
    <span class="hd-icon">${iconSvg('gift', 22)}</span>
    <span class="hd-copy">
      <small>DAILY SPONSOR BONUS</small>
      <b>${claimed ? 'COLLECTED TODAY' : '+' + num(daily.reward) + ' ◆ READY'}</b>
      <em>${daily.streak > 0 ? `${daily.streak} day streak` : 'Start a streak today'}</em>
    </span>
    <span class="hd-cta">${claimed ? 'REWARDS' : 'CLAIM'} ${iconSvg('chevron', 15)}</span>`;

  const primary = $('#home-primary-label');
  if (primary) primary.textContent = s.history.length ? 'CONTINUE TOUR' : 'RACE NOW';

  els.homeStrip.innerHTML = TRACK_DEFS.map((def, i) => {
    const unlock = store.trackUnlock(def.id);
    const best = store.bestPosition(def.id);
    const sel = def.id === selectedTrackId;
    return `
      <button class="mini-track ${unlock.unlocked ? '' : 'locked'} ${sel ? 'selected' : ''}"
        type="button" data-open-track="${def.id}" aria-label="${esc(def.name)}">
        <span class="mini-index">0${i + 1}</span>
        <span class="mini-preview">${circuitSvg(getBuiltTrack(def.id), def.colors.accent)}</span>
        <span class="mini-copy">
          <b>${esc(def.name)}</b>
          <small>${unlock.unlocked ? (best < Infinity ? 'BEST P' + best : formatTrackLength(getBuiltTrack(def.id))) : 'LOCKED'}</small>
        </span>
        ${unlock.unlocked ? iconSvg('chevron', 15) : iconSvg('lock', 15)}
      </button>`;
  }).join('');

}

/* ------------------------------------------------------------------ */
/* circuits                                                            */
/* ------------------------------------------------------------------ */

const NODE_POS = {
  coast: { x: 17, y: 76 },
  harbor: { x: 40, y: 58 },
  canyon: { x: 63, y: 39 },
  alpine: { x: 84, y: 19 }
};

function nextTrackAfter(trackId) {
  const i = TRACK_DEFS.findIndex(t => t.id === trackId);
  return i >= 0 ? TRACK_DEFS[i + 1] || null : null;
}

function circuitSvg(track, color = '#2ff5ff') {
  const pts = track.map;
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = 86 / span;
  const ox = (100 - span * scale) / 2 - minX * scale;
  const oy = (100 - span * scale) / 2 - minY * scale;
  let d = '';
  pts.forEach((p, i) => {
    d += (i === 0 ? 'M' : 'L') + (p.x * scale + ox).toFixed(2) + ' ' + (p.y * scale + oy).toFixed(2);
  });
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path d="${d}Z" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8" stroke-linejoin="round"/>
    <path d="${d}Z" fill="none" stroke="${color}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function trackCorners(track) {
  if (cornerCache.has(track.id)) return cornerCache.get(track.id);
  let dir = 0;
  let corners = 0;
  let run = 0;
  const step = 4;
  for (let i = 0; i < track.sampleCount; i += step) {
    const k = track.samples[i].curvature;
    const s = Math.abs(k) > 1 / 82 ? Math.sign(k) : 0;
    if (s === 0) {
      if (dir !== 0 && run < 4) { run = 0; dir = 0; }
      continue;
    }
    if (s === dir) {
      run++;
    } else {
      if (dir !== 0 && run >= 3) corners++;
      dir = s;
      run = 1;
    }
  }
  if (dir !== 0 && run >= 3) corners++;
  corners = clamp(Math.round(corners), 4, 18);
  cornerCache.set(track.id, corners);
  return corners;
}

function renderTracks() {
  if (!els.trackNodes) return;
  const unlocked = TRACK_DEFS.filter(t => store.trackUnlock(t.id).unlocked).length;
  setText('#track-progress-summary', `${unlocked}/4 CIRCUITS · ${store.save.stats.races} RACES`);
  setText('#map-legend', `
    <span><i class="dot cyan"></i> OPEN</span>
    <span><i class="dot gold"></i> SELECTED</span>
    <span><i class="dot dim"></i> LOCKED</span>`);

  els.progressMap.innerHTML = `
    <defs>
      <linearGradient id="tourGrad" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#2ff5ff"/>
        <stop offset=".55" stop-color="#b76bff"/>
        <stop offset="1" stop-color="#ff2e88"/>
      </linearGradient>
      <filter id="tourGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <path class="map-grid-line" d="M4 28 Q 28 18 50 30 T 96 24"/>
    <path class="map-grid-line" d="M2 52 Q 30 44 54 56 T 98 50"/>
    <path class="map-grid-line" d="M0 84 Q 32 74 58 86 T 100 78"/>
    <path class="tour-route under" d="M17 76 C 25 68 30 60 40 58 S 53 47 63 39 S 75 27 84 19"/>
    <path class="tour-route live" d="M17 76 C 25 68 30 60 40 58 S 53 47 63 39 S 75 27 84 19"/>
    <circle class="map-start" cx="17" cy="76" r="1.4"/>`;

  els.trackNodes.innerHTML = TRACK_DEFS.map((def, i) => {
    const unlock = store.trackUnlock(def.id);
    const pos = NODE_POS[def.id];
    const best = store.bestPosition(def.id);
    const status = unlock.unlocked
      ? (best < Infinity ? `BEST P${best}` : 'OPEN')
      : 'LOCKED';
    return `
      <button type="button"
        class="track-node ${def.id === selectedTrackId ? 'selected' : ''} ${unlock.unlocked ? 'open' : 'locked'}"
        style="--x:${pos.x}%;--y:${pos.y}%;--accent:${def.colors.accent}"
        data-track="${def.id}"
        aria-label="${esc(def.name)} — ${status}">
        <span class="tn-beacon"></span>
        <span class="tn-card">
          <span class="tn-top">
            <em>ROUND 0${i + 1}</em>
            <i class="tn-state">${unlock.unlocked ? status : iconSvg('lock', 12) + ' LOCKED'}</i>
          </span>
          <span class="tn-preview">${circuitSvg(getBuiltTrack(def.id), def.colors.accent)}</span>
          <strong>${esc(def.name)}</strong>
          <small>${esc(def.location)}</small>
        </span>
      </button>`;
  }).join('');

  renderTrackDetail(getTrackDef(selectedTrackId));
}

function renderTrackDetail(def) {
  if (!els.trackDetail) return;
  const track = getBuiltTrack(def.id);
  const unlock = store.trackUnlock(def.id);
  const best = store.bestPosition(def.id);
  const bestLap = store.save.stats.bestLaps[def.id];
  const raced = (store.save.stats.tracksRaced[def.id] || 0) > 0;
  const rewardPct = Math.round(def.reward * 100);
  const difficulty = '◆'.repeat(def.difficulty) + '<i>' + '◇'.repeat(4 - def.difficulty) + '</i>';
  const rivals = currentDifficulty();
  const unlockCopy = unlock.unlocked
    ? (def.id === 'coast' ? 'Ready to race' : `Unlocked by: ${unlock.requirement}`)
    : `${unlock.requirement}${unlock.progress ? ' · ' + unlock.progress : ''}`;

  els.trackDetail.innerHTML = `
    <div class="td-topline">
      <span class="td-round">ROUND 0${TRACK_DEFS.indexOf(def) + 1}</span>
      <span class="td-diff" title="Track difficulty">${difficulty}</span>
      <button class="td-ai-diff" type="button" data-cycle-difficulty title="Rival difficulty — tap to change">AI <b>${rivals.name}</b></button>
    </div>
    <div class="td-preview" style="--accent:${def.colors.accent}">
      ${circuitSvg(track, def.colors.accent)}
      <span class="td-preview-glow"></span>
    </div>
    <h3>${esc(def.name)}</h3>
    <p class="td-loc">${esc(def.location)}</p>
    <p class="td-tagline">${esc(def.tagline)}</p>

    <div class="td-stats">
      <div><span>LENGTH</span><b>${formatTrackLength(track)}</b></div>
      <div><span>CORNERS</span><b>${trackCorners(track)}</b></div>
      <div><span>GRID</span><b>8 cars · ${def.laps} laps</b></div>
      <div><span>PAYOUT</span><b>${rewardPct}%</b></div>
    </div>

    <div class="td-records">
      <div><span>BEST FINISH</span><b>${best < Infinity ? positionLabel(best) : '—'}</b></div>
      <div><span>BEST LAP</span><b>${bestLap ? fmtTime(bestLap) : '—'}</b></div>
    </div>

    <div class="td-unlock ${unlock.unlocked ? 'met' : 'locked'}">
      <span class="td-unlock-icon">${iconSvg(unlock.unlocked ? 'check' : 'lock', 15)}</span>
      <div>
        <b>${unlock.unlocked ? 'CIRCUIT OPEN' : 'CIRCUIT LOCKED'}</b>
        <small>${esc(unlockCopy)}</small>
      </div>
    </div>

    <div class="td-actions">
      <button class="btn primary wide" type="button" data-start-track="${def.id}" ${unlock.unlocked ? '' : 'disabled'}>
        <span class="btn-glow"></span>
        ${unlock.unlocked ? iconSvg('play', 17) + ' START RACE' : iconSvg('lock', 17) + ' LOCKED'}
      </button>
      <button class="btn ghost wide practice-btn" type="button" data-practice-track="${def.id}" title="Solo practice — no AI, no rewards">
        ${iconSvg('flag', 17)} PRACTICE
      </button>
    </div>
    ${raced ? `<div class="td-raced">RACED ${store.save.stats.tracksRaced[def.id]}× · ${store.save.history.filter(h => h.trackId === def.id).length} logged</div>` : ''}`;
}

function selectTrack(id) {
  if (!TRACK_DEFS.some(t => t.id === id)) return;
  selectedTrackId = id;
  store.save.lastTrack = id;
  store.persist();
  renderTracks();
  audio.click();
}

/* ------------------------------------------------------------------ */
/* garage                                                              */
/* ------------------------------------------------------------------ */

function renderGarage() {
  if (!els.garageBody) return;
  const paint = PAINTS.find(p => p.id === store.save.paint.paintId) || PAINTS[0];
  const finish = store.getFinish();
  const glow = UNDERGLOWS.find(g => g.id === store.save.paint.underglow) || UNDERGLOWS[0];
  const stats = store.carStats();

  setText('#garage-car-name', paint.name.toUpperCase());
  setText('#garage-car-sub', `${finish.name.toUpperCase()} · ${glow.hex ? glow.name.toUpperCase() + ' GLOW' : 'NO UNDERGLOW'}`);

  const spec = [
    ['POWER', stats.accel.toFixed(1) + ' m/s²', store.save.upgrades.power, 10],
    ['SPEED', Math.round(stats.topSpeed * 3.6) + ' km/h', store.save.upgrades.speed, 10],
    ['GRIP', stats.grip.toFixed(1), store.save.upgrades.handling, 10],
    ['NITRO', stats.nitroDuration.toFixed(1) + ' s', store.save.upgrades.nitro, 10]
  ];
  const strip = $('#car-spec-strip');
  if (strip) {
    strip.innerHTML = spec.map(([label, value, lvl, max]) => `
      <div class="spec-chip">
        <span>${label}</span>
        <b>${value}</b>
        <i><s style="width:${clamp(lvl / max, 0, 1) * 100}%"></s></i>
      </div>`).join('');
  }

  $$('#garage-tabs .tab').forEach(tab => {
    const on = tab.dataset.garageTab === garageTab;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  els.garageBody.innerHTML = garageTab === 'performance'
    ? performanceMarkup()
    : styleMarkup();
}

function performanceMarkup() {
  return `
    <div class="garage-intro">
      <span>${iconSvg('gauge', 16)}</span>
      <p>Spend diamonds on permanent upgrades. Every level applies instantly in the next race.</p>
    </div>
    <div class="upgrade-list">
      ${UPGRADE_ORDER.map(id => {
        const u = UPGRADES[id];
        const lvl = store.save.upgrades[id] || 0;
        const maxed = lvl >= u.max;
        const cost = maxed ? 0 : upgradeCost(id, lvl);
        const poor = !maxed && !store.canAfford(cost);
        return `
          <article class="upgrade-card ${maxed ? 'maxed' : ''}" style="--up:${u.color}">
            <div class="up-head">
              <span class="up-icon">${iconSvg(u.icon, 20)}</span>
              <div class="up-title"><small>${u.sub}</small><strong>${u.name}</strong></div>
              <span class="up-lvl">LV <b>${lvl}</b><i>/${u.max}</i></span>
            </div>
            <p class="up-blurb">${u.blurb}</p>
            <div class="up-dots" aria-hidden="true">
              ${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}
            </div>
            <div class="up-foot">
              <span class="up-effect">${lvl ? u.effect(lvl) : 'STOCK SETUP'}</span>
              <button type="button" class="up-buy ${poor ? 'poor' : ''}" data-upgrade="${id}" ${maxed ? 'disabled' : ''}>
                ${maxed ? iconSvg('check', 14) + ' MAXED' : 'UPGRADE <b>◆ ' + num(cost) + '</b>'}
              </button>
            </div>
          </article>`;
      }).join('')}
    </div>`;
}

function styleMarkup() {
  const paint = store.save.paint.paintId;
  const finishId = store.save.paint.finish;
  const glowId = store.save.paint.underglow;
  const ownedPaints = store.save.owned.paints.length;
  return `
    <div class="garage-intro">
      <span>${iconSvg('star', 16)}</span>
      <p>Paint, finish and underglow are yours forever. Drag the car to inspect every angle.</p>
    </div>

    <section class="style-section">
      <div class="style-head"><h4>PAINT</h4><span>${ownedPaints}/${PAINTS.length} owned</span></div>
      <div class="paint-grid">
        ${PAINTS.map(p => {
          const owned = store.isPaintOwned(p.id);
          const equipped = paint === p.id;
          return `
            <button type="button" class="paint-swatch ${equipped ? 'equipped' : ''} ${owned ? 'owned' : 'locked'}"
              data-paint="${p.id}" aria-label="${esc(p.name)}${owned ? '' : ', ' + p.price + ' diamonds'}">
              <i style="--swatch:${p.hex}"><s></s></i>
              <span><b>${esc(p.name)}</b><small>${equipped ? 'EQUIPPED' : owned ? 'OWNED' : '◆ ' + num(p.price)}</small></span>
              ${equipped ? '<em>' + iconSvg('check', 13) + '</em>' : ''}
            </button>`;
        }).join('')}
      </div>
    </section>

    <section class="style-section">
      <div class="style-head"><h4>FINISH</h4><span>Surface material</span></div>
      <div class="finish-grid">
        ${FINISHES.map(f => {
          const owned = store.isFinishOwned(f.id);
          const equipped = finishId === f.id;
          return `
            <button type="button" class="finish-card ${equipped ? 'equipped' : ''} ${owned ? 'owned' : 'locked'}"
              data-finish="${f.id}">
              <span class="finish-chip finish-${f.id}" style="--m:${f.metalness};--r:${f.roughness}"></span>
              <span><b>${f.name}</b><small>${equipped ? 'EQUIPPED' : owned ? 'OWNED' : '◆ ' + num(f.price)}</small></span>
            </button>`;
        }).join('')}
      </div>
    </section>

    <section class="style-section">
      <div class="style-head"><h4>UNDERGLOW</h4><span>Night signature</span></div>
      <div class="glow-grid">
        ${UNDERGLOWS.map(g => {
          const owned = store.isGlowOwned(g.id);
          const equipped = glowId === g.id;
          return `
            <button type="button" class="glow-card ${equipped ? 'equipped' : ''} ${owned ? 'owned' : 'locked'}"
              data-glow="${g.id}">
              <span class="glow-dot ${g.hex ? '' : 'none'}" style="--glow:${g.hex || '#000'}"></span>
              <span><b>${g.name}</b><small>${equipped ? 'ACTIVE' : owned ? 'OWNED' : '◆ ' + num(g.price)}</small></span>
            </button>`;
        }).join('')}
      </div>
    </section>`;
}

function buyUpgrade(id) {
  const u = UPGRADES[id];
  if (!u) return;
  const lvl = store.save.upgrades[id] || 0;
  if (lvl >= u.max) return;
  const cost = upgradeCost(id, lvl);
  if (!store.canAfford(cost)) {
    audio.error();
    showToast(`Need ${num(cost - store.save.diamonds)} more ◆ for ${u.name}.`, 'error');
    return;
  }
  const res = store.buyUpgrade(id);
  if (res.ok) {
    audio.purchase();
    showToast(`${u.name} upgraded to Lv ${res.level}.`, 'success', u.icon);
    renderGarage();
    renderChrome();
  } else {
    audio.error();
    showToast('Upgrade unavailable.', 'error');
  }
}

function buyPaint(id) {
  const p = PAINTS.find(x => x.id === id);
  if (!p) return;
  const owned = store.isPaintOwned(id);
  if (!owned && !store.canAfford(p.price)) {
    audio.error();
    showToast(`Need ${num(p.price - store.save.diamonds)} more ◆ for ${p.name}.`, 'error');
    return;
  }
  const res = store.buyPaint(id);
  if (res.ok) {
    audio.purchase();
    if (!owned) showToast(`${p.name} painted.`, 'success', 'star');
    showroom.refresh();
    renderGarage();
    renderChrome();
  }
}

function buyFinish(id) {
  const f = FINISHES.find(x => x.id === id);
  if (!f) return;
  const owned = store.isFinishOwned(id);
  if (!owned && !store.canAfford(f.price)) {
    audio.error();
    showToast(`Need ${num(f.price - store.save.diamonds)} more ◆ for ${f.name}.`, 'error');
    return;
  }
  const res = store.buyFinish(id);
  if (res.ok) {
    audio.purchase();
    if (!owned) showToast(`${f.name} finish applied.`, 'success', 'star');
    showroom.refresh();
    renderGarage();
    renderChrome();
  }
}

function buyGlow(id) {
  const g = UNDERGLOWS.find(x => x.id === id);
  if (!g) return;
  const owned = store.isGlowOwned(id);
  if (!owned && !store.canAfford(g.price)) {
    audio.error();
    showToast(`Need ${num(g.price - store.save.diamonds)} more ◆ for ${g.name}.`, 'error');
    return;
  }
  const res = store.buyGlow(id);
  if (res.ok) {
    audio.purchase();
    if (!owned) showToast(`${g.name} underglow fitted.`, 'success', 'flame');
    showroom.refresh();
    renderGarage();
    renderChrome();
  }
}

/* ------------------------------------------------------------------ */
/* rewards                                                             */
/* ------------------------------------------------------------------ */

function renderRewards() {
  if (!els.dailyCard) return;
  const daily = store.dailyInfo();
  const level = store.save.level;
  const needed = store.xpNeeded();
  const claimed = store.save.achievements.claimed.length;
  const streakDays = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const reward = Math.min(900, 350 + i * 75);
    const done = daily.claimedToday ? day <= daily.streak : day < daily.nextStreak;
    const current = daily.claimedToday
      ? day === Math.min(daily.streak, 7)
      : day === Math.min(daily.nextStreak, 7);
    return `<div class="streak-day ${done ? 'done' : ''} ${current ? 'current' : ''}">
      <span>D${day}</span><b>${reward}</b>${done ? iconSvg('check', 12) : ''}
    </div>`;
  }).join('');

  els.dailyCard.innerHTML = `
    <div class="daily-top">
      <div class="daily-icon">${iconSvg('gift', 26)}</div>
      <div>
        <div class="eyebrow"><span class="eyebrow-line"></span> DAILY SPONSOR BONUS</div>
        <h3>${daily.claimedToday ? 'COME BACK TOMORROW' : 'YOUR PAYOUT IS READY'}</h3>
        <p>${daily.claimedToday
          ? `You are on a ${daily.streak}-day streak. The next bonus is ${num(Math.min(900, 350 + daily.streak * 75))} ◆.`
          : `Claim day ${daily.nextStreak} of your streak for a bigger drop.`}</p>
      </div>
      <div class="daily-reward"><small>REWARD</small><b>+${num(daily.reward)} ◆</b></div>
    </div>
    <div class="streak-row">${streakDays}</div>
    <div class="daily-foot">
      <span>Streak resets if you miss a day. Rewards cap at 900 ◆.</span>
      <button type="button" class="btn primary" data-claim-daily ${daily.claimedToday ? 'disabled' : ''}>
        ${daily.claimedToday ? iconSvg('check', 16) + ' COLLECTED' : iconSvg('gift', 16) + ' CLAIM ' + num(daily.reward) + ' ◆'}
      </button>
    </div>`;

  els.levelCard.innerHTML = `
    <div class="level-top">
      <div class="level-orb"><b>${level}</b><small>LEVEL</small></div>
      <div>
        <div class="eyebrow"><span class="eyebrow-line"></span> DRIVER LEVEL</div>
        <h3>${level < 5 ? 'RISING THROUGH THE RANKS' : level < 10 ? 'ESTABLISHED CONTENDER' : 'APEX LEGEND'}</h3>
        <p>Every level pays <b>+250 ◆</b>. Race clean and drift hard for more XP.</p>
      </div>
    </div>
    <div class="level-bar">
      <div class="level-bar-top"><span>LEVEL ${level}</span><span>${num(store.save.xp)} / ${num(needed)} XP</span></div>
      <div class="xp-track big"><i style="width:${clamp(store.save.xp / needed * 100, 0, 100)}%"></i></div>
      <div class="level-bar-foot"><span>${num(Math.max(0, needed - store.save.xp))} XP TO LEVEL ${level + 1}</span><span>+250 ◆ BONUS</span></div>
    </div>
    <div class="level-perks">
      <span>${iconSvg('trophy', 15)} ${num(store.save.stats.podiums)} podiums</span>
      <span>${iconSvg('diamond', 15)} ${num(store.save.stats.diamondsEarned)} earned</span>
      <span>${iconSvg('drift', 15)} ${num(store.save.stats.driftPoints)} drift pts</span>
    </div>`;

  els.achievementCount.textContent = `${claimed} / ${ACHIEVEMENTS.length} CLAIMED`;
  els.achievementGrid.innerHTML = ACHIEVEMENTS.map(def => {
    const st = store.achievementState(def.id);
    const pct = clamp((st.value / st.target) * 100, 0, 100);
    return `
      <article class="ach-card ${st.claimed ? 'claimed' : st.claimable ? 'claimable' : 'locked'}">
        <div class="ach-head">
          <span class="ach-icon">${iconSvg(def.icon, 20)}</span>
          <div><b>${esc(def.name)}</b><small>${esc(def.desc)}</small></div>
          <span class="ach-reward">◆ ${num(def.reward)}</span>
        </div>
        <div class="ach-progress">
          <div class="xp-track"><i style="width:${pct}%"></i></div>
          <span>${num(st.value)} / ${num(st.target)}</span>
        </div>
        <button type="button" class="ach-action"
          data-claim-ach="${def.id}"
          ${st.claimed || !st.complete ? 'disabled' : ''}>
          ${st.claimed ? iconSvg('check', 14) + ' CLAIMED' : st.complete ? 'CLAIM ◆ ' + num(def.reward) : 'IN PROGRESS'}
        </button>
      </article>`;
  }).join('');
}

function claimDaily() {
  const res = store.claimDaily();
  if (res.ok) {
    audio.purchase();
    showToast(`Daily bonus collected: +${num(res.reward)} ◆.`, 'success', 'gift');
    renderRewards();
    renderChrome();
  } else {
    audio.error();
    showToast('Daily bonus already collected today.', 'error');
  }
}

function claimAchievement(id) {
  const res = store.claimAchievement(id);
  if (res.ok) {
    audio.purchase();
    const def = ACHIEVEMENTS.find(a => a.id === id);
    showToast(`${def ? def.name : 'Achievement'} claimed: +${num(res.reward)} ◆.`, 'success', 'trophy');
    renderRewards();
    renderChrome();
  } else {
    audio.error();
    showToast('This reward is not ready yet.', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* history                                                             */
/* ------------------------------------------------------------------ */

function renderHistory() {
  if (!els.historyList) return;
  const s = store.save;
  const stats = $('#career-stats');
  if (stats) {
    const items = [
      ['flag', num(s.stats.races), 'RACES'],
      ['trophy', num(s.stats.wins), 'WINS'],
      ['podium', num(s.stats.podiums), 'PODIUMS'],
      ['speed', Math.round(s.stats.topSpeed || 0) + ' km/h', 'TOP SPEED'],
      ['drift', num(s.stats.driftPoints), 'DRIFT PTS'],
      ['diamond', num(s.stats.diamondsEarned), 'EARNED']
    ];
    stats.innerHTML = items.map(([icon, value, label]) => `
      <div class="career-stat glass">
        <span>${iconSvg(icon, 17)}</span>
        <b>${value}</b><small>${label}</small>
      </div>`).join('');
  }

  setText('#history-count', num(s.history.length));

  if (!s.history.length) {
    els.historyList.innerHTML = `
      <div class="empty-state glass">
        <span>${iconSvg('history', 30)}</span>
        <h3>NO RACES LOGGED YET</h3>
        <p>Finish your first race and every lap, payout and dusty wall hit lands here.</p>
        <button class="btn primary" type="button" data-screen="tracks">${iconSvg('play', 16)} FIND A CIRCUIT</button>
      </div>`;
  } else {
    els.historyList.innerHTML = s.history.map(r => {
      const posClass = r.position === 1 ? 'win' : r.position <= 3 ? 'podium' : r.position <= 5 ? 'points' : '';
      return `
        <article class="history-item" data-history="${esc(r.id)}">
          <button type="button" class="history-row" data-history-toggle="${esc(r.id)}" aria-expanded="false">
            <span class="hr-pos ${posClass}">P${r.position}</span>
            <span class="hr-track"><b>${esc(r.trackName)}</b><small>${esc(dateLabel(r.date))} · ${r.laps} laps</small></span>
            <span class="hr-metric"><small>TIME</small><b>${fmtTime(r.time)}</b></span>
            <span class="hr-metric hide-sm"><small>BEST LAP</small><b>${fmtTime(r.bestLap)}</b></span>
            <span class="hr-diamonds">+${num(r.diamonds)} <i>◆</i></span>
            <span class="hr-chev">${iconSvg('chevron', 16)}</span>
          </button>
          <div class="history-detail" hidden>
            <div class="hd-breakdown">
              ${(r.breakdown || []).map(([label, value]) => `<span><small>${esc(label)}</small><b>+${num(value)} ◆</b></span>`).join('') || '<span><small>BASE REWARD</small><b>◆</b></span>'}
            </div>
            <div class="hd-extra">
              <span>${iconSvg('drift', 14)} ${num(r.driftScore)} drift</span>
              <span>${iconSvg('diamond', 14)} ${num(r.pickups)} pickups</span>
              <span>${iconSvg('speed', 14)} ${Math.round(r.topSpeed || 0)} km/h</span>
              <span>${iconSvg(r.clean ? 'shield' : 'wrench', 14)} ${r.clean ? 'clean race' : (r.wallHits || 0) + ' wall hits'}</span>
              <span>${iconSvg('star', 14)} +${num(r.xp)} XP</span>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  const insights = $('#history-insights');
  if (insights) {
    const bestLaps = Object.entries(s.stats.bestLaps || {}).map(([id, time]) => {
      const def = getTrackDef(id);
      return `<div class="insight-row"><span>${esc(def.name)}</span><b>${fmtTime(time)}</b></div>`;
    }).join('') || '<p class="insight-empty">Set a lap record to see it here.</p>';

    const bestPos = TRACK_DEFS.map(def => {
      const p = store.bestPosition(def.id);
      return `<div class="insight-row"><span>${esc(def.name)}</span><b>${p < Infinity ? 'P' + p : '—'}</b></div>`;
    }).join('');

    insights.innerHTML = `
      <h3>${iconSvg('trophy', 18)} RECORD BOOK</h3>
      <div class="insight-title">LAP RECORDS</div>
      <div class="insight-list">${bestLaps}</div>
      <div class="insight-title">BEST FINISHES</div>
      <div class="insight-list">${bestPos}</div>
      <div class="insight-title">CAREER</div>
      <div class="insight-row"><span>Diamonds earned</span><b>◆ ${num(s.stats.diamondsEarned)}</b></div>
      <div class="insight-row"><span>Diamonds spent</span><b>◆ ${num(s.stats.diamondsSpent)}</b></div>
      <div class="insight-row"><span>Upgrades & styles</span><b>${num(s.stats.upgradesBought)}</b></div>
      <div class="insight-row"><span>Clean races</span><b>${num(s.stats.cleanRaces)}</b></div>
      <div class="insight-row"><span>Play time</span><b>${playTimeLabel(s.totalPlaySeconds)}</b></div>`;
  }
}

function playTimeLabel(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

function renderSettings() {
  const settings = store.save.settings;
  const nameInput = $('#player-name');
  if (nameInput && document.activeElement !== nameInput) nameInput.value = store.save.playerName || 'YOU';
  const volume = $('#volume');
  if (volume) volume.value = String(Math.round(settings.volume * 100));
  setText('#volume-label', Math.round(settings.volume * 100) + '%');

  setSegmented('#quality-segment', 'quality', settings.quality);
  setSegmented('#camera-segment', 'camera', settings.camera || 'chase');
  const diff = currentDifficulty();
  setSegmented('#difficulty-segment', 'difficulty', diff.id);
  setText('#difficulty-copy', diff.desc);
  setSwitch($('#music-toggle'), !!settings.music);
  setSwitch($('#sfx-toggle'), !!settings.sfx);
  setSwitch($('#autothrottle-toggle'), !!settings.autoThrottle);
  setSwitch($('#tilt-toggle'), !!settings.tilt);

  const installBtn = $('#install-btn');
  if (installBtn) installBtn.disabled = isStandalone();
  updateInstallUI();
  updateNetStatus();
}

function setSegmented(selector, key, value) {
  $$(selector + ' [data-' + key + ']').forEach(btn => {
    btn.classList.toggle('active', btn.dataset[key] === value);
  });
}

function setSwitch(el, on) {
  if (!el) return;
  el.classList.toggle('on', on);
  el.setAttribute('aria-checked', on ? 'true' : 'false');
  const span = el.querySelector('span');
  if (span) span.textContent = on ? 'ON' : 'OFF';
}

function applySettings() {
  const s = store.save.settings;
  const effectiveTilt = tiltGranted;
  input.setSettings({
    autoThrottle: !!s.autoThrottle,
    tilt: !!s.tilt,
    tiltPermission: effectiveTilt
  });
  audio.setSettings({
    music: !!s.music && !s.muted,
    sfx: !!s.sfx && !s.muted,
    volume: s.muted ? 0 : s.volume
  });
  if (renderer) {
    renderer.shadowMap.enabled = qualityValue() > 0.5;
    renderer.toneMappingExposure = 1.04;
  }
  renderChrome();
}

function persistSettings() {
  store.persist();
  applySettings();
  renderSettings();
}

function setQuality(mode) {
  store.save.settings.quality = mode;
  store.persist();
  configurePost();
  resizeViewport();
  renderSettings();
  showToast(mode === 'auto'
    ? `Auto quality: ${qualityValue() > 0.6 ? 'high' : 'performance'} on this device.`
    : `Graphics set to ${mode.toUpperCase()}${race ? ' — applies next race' : ''}.`, 'info', 'gear');
}

function toggleMute() {
  store.save.settings.muted = !store.save.settings.muted;
  store.persist();
  applySettings();
  renderChrome();
  showToast(store.save.settings.muted ? 'Audio muted.' : 'Audio on.', 'info', store.save.settings.muted ? 'mute' : 'gauge');
}

async function toggleTilt() {
  const next = !store.save.settings.tilt;
  if (next) {
    const granted = await input.requestTiltPermission();
    tiltGranted = granted;
    if (!granted) {
      store.save.settings.tilt = false;
      store.persist();
      applySettings();
      renderSettings();
      showToast('Tilt steering needs motion permission.', 'error');
      return;
    }
  } else {
    tiltGranted = false;
  }
  store.save.settings.tilt = next;
  store.persist();
  applySettings();
  renderSettings();
  showToast(next ? 'Tilt steering enabled.' : 'Tilt steering off.', 'info', 'gauge');
}

async function resetCareer() {
  const ok = await showConfirm({
    title: 'ERASE YOUR CAREER?',
    body: 'This permanently removes diamonds, upgrades, paint unlocks, race history, records and achievements. The game starts fresh.',
    confirmLabel: 'ERASE EVERYTHING',
    danger: true,
    icon: '!'
  });
  if (!ok) return;
  store.reset();
  garageTab = 'performance';
  selectedTrackId = 'coast';
  tiltGranted = false;
  if (showroom) {
    showroom.refresh();
    showroom.setLayout('menu');
    showroom.setInteractive(false);
  }
  applySettings();
  renderChrome();
  showScreen('home');
  showToast('Career reset. A clean slate, a full tank.', 'success', 'flag');
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    showToast('Fullscreen is not available in this browser.', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* race lifecycle                                                      */
/* ------------------------------------------------------------------ */

function startRace(trackId, { mode = 'race' } = {}) {
  if (startingRace || race || !renderer) return;
  const def = getTrackDef(trackId);
  const runMode = mode === 'practice' ? 'practice' : 'race';
  const unlock = store.trackUnlock(trackId);
  if (runMode !== 'practice' && !unlock.unlocked) {
    audio.error();
    showToast(`Locked: ${unlock.requirement}.`, 'error', 'lock');
    return;
  }

  startingRace = true;
  settled = false;
  raceMode = runMode;
  raceTrackId = trackId;
  selectedTrackId = trackId;
  store.save.lastTrack = trackId;
  store.persist();

  closeResults({ restoreInput: false });
  if (hud) hud.hide();
  if (showroom) showroom.setInteractive(false);
  if (audio) audio.init();

  els.shell.classList.add('is-hidden');
  document.body.classList.add('in-race');
  document.body.classList.remove('results-open');
  input.setEnabled(false);
  input.clear();
  showLoading(def, runMode);

  const startedAt = performance.now();
  setTimeout(() => {
    try {
      const quality = qualityValue();
      race = new Race({
        trackId,
        quality,
        store,
        audio,
        input,
        hud,
        mode: runMode,
        aspect: window.innerWidth / window.innerHeight,
        callbacks: { onFinish: handleRaceFinish }
      });
      applySettings();
      resizeViewport();
      input.setEnabled(true);
      document.body.classList.add('in-race');
      const wait = Math.max(0, 620 - (performance.now() - startedAt));
      setTimeout(hideLoading, wait);
    } catch (err) {
      console.error('Race failed to start', err);
      hideLoading();
      input.setEnabled(true);
      race = null;
      document.body.classList.remove('in-race');
      els.shell.classList.remove('is-hidden');
      showScreen('tracks');
      showToast('Could not build the circuit. Try lowering graphics quality.', 'error');
    } finally {
      startingRace = false;
    }
  }, 70);
}

function handleRaceFinish(payload) {
  if (settled) return;
  settled = true;

  // Practice is a sandbox: no economy, XP, records or progression changes.
  if (payload.mode === 'practice') {
    showPracticeResults(payload);
    return;
  }

  const nextDef = nextTrackAfter(payload.trackId);
  const nextWasUnlocked = nextDef ? store.trackUnlock(nextDef.id).unlocked : false;
  const result = store.finishRace(payload);
  const nextUnlock = nextDef ? store.trackUnlock(nextDef.id) : null;
  const newlyUnlocked = !!(nextDef && nextUnlock.unlocked && !nextWasUnlocked);
  renderChrome();
  showResults(payload, result, { nextDef, nextUnlock, newlyUnlocked });

  // Refresh anything that may be visible after settling.
  renderHome();
  renderTracks();
  renderRewards();
  renderHistory();
}

function showResults(payload, result, meta) {
  const position = payload.position;
  const title = position === 1 ? 'VICTORY' : position <= 3 ? 'PODIUM' : position <= 5 ? 'POINTS FINISH' : 'RACE COMPLETE';
  const placeClass = position === 1 ? 'win' : position <= 3 ? 'podium' : position <= 5 ? 'points' : '';
  const winner = payload.standings[0];
  const total = payload.standings.length;

  const standingsMarkup = payload.standings.map(row => {
    const gap = row.position === 1 ? 'WINNER' : '+' + Math.max(0, row.time - winner.time).toFixed(3) + 's';
    return `
      <div class="res-row ${row.isPlayer ? 'you' : ''} ${row.position <= 3 ? 'podium-row' : ''}">
        <span class="res-rpos">${row.position}</span>
        <span class="res-rcolor" style="background:${row.color}"></span>
        <span class="res-rname">${esc(row.name)} ${row.isPlayer && row.name !== 'YOU' ? '<em>YOU</em>' : ''}</span>
        <span class="res-rgap">${gap}${row.estimated ? ' <i>EST</i>' : ''}</span>
        <span class="res-rtime">${fmtTime(row.time)}</span>
      </div>`;
  }).join('');

  const payoutMarkup = result.breakdown.map(([label, value]) => `
    <li><span>${esc(label)}</span><b>+${num(value)} ◆</b></li>`).join('');

  const achievements = result.newAchievements
    .map(id => ACHIEVEMENTS.find(a => a.id === id))
    .filter(Boolean)
    .map(a => `<span class="res-ach">${iconSvg(a.icon, 14)} ${esc(a.name)} <b>+◆${num(a.reward)}</b></span>`)
    .join('');

  const levelMarkup = result.levelsGained
    ? `<div class="res-levelup">${iconSvg('star', 18)} LEVEL UP <b>LV ${result.prevLevel} → ${result.level}</b> <span>+${num(result.levelBonus)} ◆</span></div>`
    : '';

  const unlockMarkup = meta.newlyUnlocked && meta.nextDef
    ? `<div class="res-unlock">${iconSvg('lock', 16)} NEW CIRCUIT UNLOCKED <b>${esc(meta.nextDef.name)}</b></div>`
    : '';

  const nextLabel = meta.nextDef
    ? (meta.nextUnlock && meta.nextUnlock.unlocked ? 'NEXT CIRCUIT' : 'VIEW CIRCUIT MAP')
    : 'CIRCUIT MAP';

  els.resultsContent.innerHTML = `
    <div class="res-head">
      <div>
        <div class="res-kicker">${esc(payload.trackName)} · ${payload.lapCount} LAPS · ${payload.total} CARS · ${esc(payload.difficultyName || currentDifficulty().name)}</div>
        <div class="res-titleline">
          <span class="res-bigpos ${placeClass}">P${position}</span>
          <div>
            <h2>${title}</h2>
            <p>${position <= 3 ? 'A statement drive under the lights.' : position <= 5 ? 'Solid points. The garage is waiting.' : 'Every lap is data. Go again.'}</p>
          </div>
        </div>
      </div>
      <button class="icon-btn res-close" type="button" data-results="close" aria-label="Close results">${iconSvg('close', 20)}</button>
    </div>

    <div class="res-hero">
      <div class="res-placement">
        <span class="res-placement-pos ${placeClass}">${positionLabel(position)}</span>
        <small>OF ${total} · ${fmtTime(payload.time)}</small>
      </div>
      <div class="res-payout">
        <small>DIAMONDS EARNED</small>
        <strong>+${num(result.diamonds)} <i>◆</i></strong>
        <span>${result.isBestLap ? 'NEW LAP RECORD' : result.firstWin ? 'FIRST WIN BONUS' : 'PAYOUT SECURED'}</span>
      </div>
      <div class="res-levelbox">
        <div class="res-level-top"><span>LEVEL ${result.level}</span><span>${num(result.xp)} / ${num(result.xpNeeded)} XP</span></div>
        <div class="xp-track big"><i style="width:${clamp(result.xp / result.xpNeeded * 100, 0, 100)}%"></i></div>
        <small>+${num(result.xpGain)} XP THIS RACE</small>
      </div>
    </div>

    ${levelMarkup}
    ${unlockMarkup}

    <div class="res-grid">
      <section class="res-panel res-payout-panel">
        <h4>PAYOUT BREAKDOWN</h4>
        <ul class="payout-list">
          ${payoutMarkup}
          <li class="payout-total"><span>TOTAL</span><b>+${num(result.diamonds)} ◆</b></li>
        </ul>
      </section>

      <section class="res-panel">
        <h4>RACE DATA</h4>
        <div class="res-datagrid">
          <div><span>BEST LAP</span><b>${fmtTime(payload.bestLap)}</b></div>
          <div><span>TOP SPEED</span><b>${Math.round(payload.topSpeed)} km/h</b></div>
          <div><span>DRIFT SCORE</span><b>${num(payload.driftScore)}</b></div>
          <div><span>PICKUPS</span><b>${num(payload.pickups)}</b></div>
          <div><span>WALL HITS</span><b>${num(payload.wallHits)}</b></div>
          <div><span>CLEAN RACE</span><b>${payload.wallHits === 0 ? 'YES' : 'NO'}</b></div>
        </div>
        <div class="res-splits">
          <span>LAP SPLITS</span>
          <div>${(payload.lapTimes || []).map((t, i) => `<b><i>L${i + 1}</i>${fmtTime(t)}</b>`).join('') || '<em>—</em>'}</div>
        </div>
        <div class="res-bonuses">${achievements}</div>
      </section>

      <section class="res-panel res-standings-panel">
        <h4>CLASSIFICATION</h4>
        <div class="res-standings">${standingsMarkup}</div>
      </section>
    </div>

    <div class="res-actions">
      <button class="btn primary" type="button" data-results="again">${iconSvg('play', 17)} RACE AGAIN</button>
      <button class="btn ghost" type="button" data-results="next">${iconSvg('flag', 17)} ${nextLabel}</button>
      <button class="btn ghost" type="button" data-results="garage">${iconSvg('wrench', 17)} GARAGE</button>
      ${achievements ? `<button class="btn ghost" type="button" data-results="rewards">${iconSvg('trophy', 17)} CLAIM REWARDS</button>` : ''}
    </div>`;

  openResults();
}

function showPracticeResults(payload) {
  const laps = payload.lapTimes || [];
  const best = payload.bestLap;
  const totalLapTime = laps.reduce((sum, t) => sum + t, 0);
  const average = laps.length ? totalLapTime / laps.length : payload.time;
  const spread = laps.length > 1 ? Math.max(...laps) - Math.min(...laps) : 0;
  const tips = [];

  if (payload.wallHits === 0) {
    tips.push('Clean session. That is race-ready line discipline.');
  } else if (payload.wallHits <= 2) {
    tips.push(`Only ${payload.wallHits} wall hit${payload.wallHits === 1 ? '' : 's'}. Brake a touch earlier and carry more speed out.`);
  } else {
    tips.push(`${payload.wallHits} wall hits. Smooth inputs beat late heroics — brake before the apex, not at it.`);
  }
  if (payload.driftScore >= 300) {
    tips.push('Strong drift score. Link the next corner to keep the multiplier alive.');
  } else {
    tips.push('Try the drift button through the hairpins to build a cleaner, faster exit.');
  }
  if (spread > 4) {
    tips.push(`Lap spread is ${spread.toFixed(2)}s. Find one repeatable reference point and chase consistency.`);
  } else if (laps.length > 1) {
    tips.push(`Lap spread is just ${spread.toFixed(2)}s. Your rhythm is consistent.`);
  }
  tips.push('Practice pays no diamonds or XP, so experiment freely.');

  const lapMarkup = laps.map((t, i) => `
    <b><i>L${i + 1}</i>${fmtTime(t)}</b>`).join('') || '<em>—</em>';

  els.resultsContent.innerHTML = `
    <div class="res-head">
      <div>
        <div class="res-kicker">${esc(payload.trackName)} · ${payload.lapCount} LAPS · PRACTICE · ${esc(payload.difficultyName)}</div>
        <div class="res-titleline">
          <span class="res-bigpos practice">PR</span>
          <div>
            <h2>PRACTICE COMPLETE</h2>
            <p>No rivals. No payouts. Just the line.</p>
          </div>
        </div>
      </div>
      <button class="icon-btn res-close" type="button" data-results="close" aria-label="Close practice results">${iconSvg('close', 20)}</button>
    </div>

    <div class="res-hero practice-hero">
      <div class="res-placement">
        <span class="res-placement-pos">BEST LAP</span>
        <small>${fmtTime(best)}</small>
      </div>
      <div class="res-payout practice-payout">
        <small>SESSION TIME</small>
        <strong>${fmtTime(payload.time)}</strong>
        <span>NO REWARDS EARNED</span>
      </div>
      <div class="res-levelbox">
        <div class="res-level-top"><span>DIFFICULTY</span><span>${esc(payload.difficultyName)}</span></div>
        <div class="res-level-top"><span>LAPS</span><span>${laps.length} / ${payload.lapCount}</span></div>
        <small>NO DIAMONDS · NO XP · NO PRESSURE</small>
      </div>
    </div>

    <div class="res-grid">
      <section class="res-panel">
        <h4>SESSION DATA</h4>
        <div class="res-datagrid">
          <div><span>BEST LAP</span><b>${fmtTime(best)}</b></div>
          <div><span>AVERAGE LAP</span><b>${fmtTime(average)}</b></div>
          <div><span>TOP SPEED</span><b>${Math.round(payload.topSpeed)} km/h</b></div>
          <div><span>DRIFT SCORE</span><b>${num(payload.driftScore)}</b></div>
          <div><span>WALL HITS</span><b>${num(payload.wallHits)}</b></div>
          <div><span>LAP SPREAD</span><b>${spread ? spread.toFixed(2) + 's' : '—'}</b></div>
        </div>
      </section>

      <section class="res-panel">
        <h4>LAP SPLITS</h4>
        <div class="res-splits practice-splits">
          <span>SESSION LAPS</span>
          <div>${lapMarkup}</div>
        </div>
        <div class="practice-total">
          <span>LAPS COMPLETED</span><b>${laps.length} / ${payload.lapCount}</b>
        </div>
      </section>

      <section class="res-panel">
        <h4>PRACTICE NOTES</h4>
        <ul class="practice-tips">
          ${tips.map(tip => `<li>${iconSvg('check', 12)} ${esc(tip)}</li>`).join('')}
        </ul>
      </section>
    </div>

    <div class="res-actions">
      <button class="btn primary" type="button" data-results="again">${iconSvg('play', 17)} RUN LAPS AGAIN</button>
      <button class="btn ghost" type="button" data-results="tracks">${iconSvg('flag', 17)} CHANGE CIRCUIT</button>
      <button class="btn ghost" type="button" data-results="garage">${iconSvg('wrench', 17)} GARAGE</button>
    </div>`;

  openResults();
}

function openResults() {
  resultsOpen = true;
  input.setEnabled(false);
  input.clear();
  document.body.classList.add('results-open');
  els.results.classList.remove('is-hidden');
  els.results.setAttribute('aria-hidden', 'false');
  els.results.classList.add('open');
}

function closeResults({ restoreInput = true } = {}) {
  if (!resultsOpen && !els.results) return;
  resultsOpen = false;
  if (els.results) {
    els.results.classList.add('is-hidden');
    els.results.classList.remove('open');
    els.results.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('results-open');
  if (restoreInput && booted) input.setEnabled(true);
}

function handleResultsAction(action) {
  const id = raceTrackId;
  const mode = raceMode;
  if (action === 'again') {
    closeResults({ restoreInput: false });
    teardownRace({ toMenus: false });
    startRace(id, { mode });
    return;
  }
  if (action === 'next') {
    const next = nextTrackAfter(id);
    if (next && store.trackUnlock(next.id).unlocked) {
      closeResults({ restoreInput: false });
      teardownRace({ toMenus: false });
      startRace(next.id);
    } else {
      if (next) selectedTrackId = next.id;
      closeResults();
      teardownRace();
      showScreen('tracks');
      if (next) showToast(`Locked: ${store.trackUnlock(next.id).requirement}.`, 'info', 'lock');
    }
    return;
  }
  if (action === 'garage') {
    closeResults();
    teardownRace();
    garageTab = 'performance';
    showScreen('garage');
    return;
  }
  if (action === 'rewards') {
    closeResults();
    teardownRace();
    showScreen('rewards');
    return;
  }
  if (action === 'tracks') {
    closeResults();
    teardownRace();
    showScreen('tracks');
    return;
  }
  closeResults();
  teardownRace();
  showScreen('tracks');
}

function teardownRace({ toMenus = true } = {}) {
  hideLoading();
  if (race) {
    const dying = race;
    race = null;
    try { dying.dispose(); } catch (err) { console.warn('Race teardown issue', err); }
  }
  if (hud) hud.hide();
  closeResults({ restoreInput: false });
  document.body.classList.remove('in-race', 'results-open');
  input.clear();
  input.setEnabled(toMenus);
  if (toMenus) {
    raceTrackId = null;
    raceMode = 'race';
    els.shell.classList.remove('is-hidden');
    audio.setScene('menu');
    applySettings();
    if (showroom) {
      showroom.setInteractive(currentScreen === 'garage');
      showroom.setLayout(currentScreen === 'garage' ? 'garage' : 'menu');
    }
  }
}

function restartRace() {
  const id = raceTrackId;
  if (!id) return;
  const mode = raceMode;
  closeResults({ restoreInput: false });
  teardownRace({ toMenus: false });
  startRace(id, { mode });
}

function quitToCircuits() {
  teardownRace();
  showScreen('tracks');
}

function togglePause(force) {
  if (!race || resultsOpen || startingRace) return;
  const want = typeof force === 'boolean' ? force : !race.isPaused();
  race.setPaused(want);
}

function handleInputAction(action) {
  if (confirmOpen) return;
  if (resultsOpen) return;
  if (action === 'camera' && race) race.cycleCamera();
  else if (action === 'reset' && race) race.resetPlayer();
  else if (action === 'pause') togglePause();
  else if (action === 'mute') toggleMute();
}

/* ------------------------------------------------------------------ */
/* loading                                                             */
/* ------------------------------------------------------------------ */

function showLoading(def, mode = 'race') {
  const diff = currentDifficulty();
  els.loadingTitle.textContent = mode === 'practice' ? 'PRACTICE SESSION' : 'PREPARING GRID';
  els.loadingSub.textContent = `${def.name} · ${diff.name}${mode === 'practice' ? ' · SOLO' : ''}`;
  els.loading.classList.remove('is-hidden');
  document.body.classList.add('loading-race');
}

function hideLoading() {
  els.loading.classList.add('is-hidden');
  document.body.classList.remove('loading-race');
}

/* ------------------------------------------------------------------ */
/* confirm / toast                                                     */
/* ------------------------------------------------------------------ */

function showConfirm({ title, body, confirmLabel = 'CONFIRM', cancelLabel = 'CANCEL', danger = false, icon = '!' }) {
  return new Promise(resolve => {
    if (confirmResolve) confirmResolve(false);
    confirmResolve = resolve;
    confirmOpen = true;
    els.confirmTitle.textContent = title;
    els.confirmBody.textContent = body;
    els.confirmIcon.textContent = icon;
    els.confirmYes.textContent = confirmLabel;
    els.confirmNo.textContent = cancelLabel;
    els.confirmYes.classList.toggle('danger', danger);
    els.confirm.classList.remove('is-hidden');
    els.confirm.setAttribute('aria-hidden', 'false');
    setTimeout(() => els.confirmYes.focus({ preventScroll: true }), 40);
  });
}

function settleConfirm(value) {
  if (!confirmOpen) return;
  confirmOpen = false;
  els.confirm.classList.add('is-hidden');
  els.confirm.setAttribute('aria-hidden', 'true');
  const resolve = confirmResolve;
  confirmResolve = null;
  if (resolve) resolve(value);
}

function showToast(message, tone = 'info', icon = 'info') {
  if (!els.toastRoot) return;
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  const iconMarkup = icon === 'gem' || icon === 'diamond'
    ? '<span class="toast-gem">◆</span>'
    : iconSvg(icon, 17);
  toast.innerHTML = `<span class="toast-icon">${iconMarkup}</span><span>${esc(message)}</span>`;
  els.toastRoot.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 320);
  }, 3000);
}

function handleGlobalKey(e) {
  if (confirmOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      settleConfirm(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      settleConfirm(true);
    }
    return;
  }
  if (resultsOpen) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleResultsAction('close');
    }
    return;
  }
  if (!booted) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (els.bootCode && els.bootCode.classList.contains('show') && e.key === 'Escape') {
      e.preventDefault();
      closeCheatEntry();
      return;
    }
    if (/^[a-z0-9]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      cheatBuffer = (cheatBuffer + e.key.toLowerCase()).slice(-24);
      if (cheatBuffer.endsWith(CHEAT_CODE)) {
        e.preventDefault();
        activateCheat();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      bootGame();
    }
  }
}

/* ------------------------------------------------------------------ */
/* static UI wiring                                                    */
/* ------------------------------------------------------------------ */

function bindStaticUI() {
  els.bootStart.addEventListener('click', bootGame);

  // Hidden access-code entry: type the code, or tap the logo five times on touch.
  if (els.bootMark) els.bootMark.addEventListener('click', registerBootTap);
  const bootLogo = $('.boot-logo');
  if (bootLogo) bootLogo.addEventListener('click', registerBootTap);
  if (els.bootCodeClose) els.bootCodeClose.addEventListener('click', closeCheatEntry);
  if (els.bootCodeSubmit) els.bootCodeSubmit.addEventListener('click', submitCheatCode);
  if (els.bootCodeInput) {
    els.bootCodeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        submitCheatCode();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeCheatEntry();
      }
    });
  }

  document.addEventListener('click', e => {
    const nav = e.target.closest('button[data-screen]');
    if (nav && !race) {
      showScreen(nav.dataset.screen);
      audio.click();
    }
  });

  $('#mute-btn').addEventListener('click', toggleMute);

  $('#garage-tabs').addEventListener('click', e => {
    const tab = e.target.closest('[data-garage-tab]');
    if (!tab) return;
    garageTab = tab.dataset.garageTab;
    audio.click();
    renderGarage();
  });

  els.garageBody.addEventListener('click', e => {
    const up = e.target.closest('[data-upgrade]');
    if (up) { buyUpgrade(up.dataset.upgrade); return; }
    const paint = e.target.closest('[data-paint]');
    if (paint) { buyPaint(paint.dataset.paint); return; }
    const finish = e.target.closest('[data-finish]');
    if (finish) { buyFinish(finish.dataset.finish); return; }
    const glow = e.target.closest('[data-glow]');
    if (glow) buyGlow(glow.dataset.glow);
  });

  els.trackNodes.addEventListener('click', e => {
    const node = e.target.closest('[data-track]');
    if (node) selectTrack(node.dataset.track);
  });

  els.trackDetail.addEventListener('click', e => {
    const cycle = e.target.closest('[data-cycle-difficulty]');
    if (cycle) { cycleDifficulty(); return; }
    const practice = e.target.closest('[data-practice-track]');
    if (practice) { startRace(practice.dataset.practiceTrack, { mode: 'practice' }); return; }
    const start = e.target.closest('[data-start-track]');
    if (start && !start.disabled) startRace(start.dataset.startTrack);
  });

  els.homeStrip.addEventListener('click', e => {
    const track = e.target.closest('[data-open-track]');
    if (!track) return;
    selectedTrackId = track.dataset.openTrack;
    store.save.lastTrack = selectedTrackId;
    store.persist();
    showScreen('tracks');
    audio.click();
  });

  els.dailyCard.addEventListener('click', e => {
    if (e.target.closest('[data-claim-daily]')) claimDaily();
  });

  els.achievementGrid.addEventListener('click', e => {
    const claim = e.target.closest('[data-claim-ach]');
    if (claim && !claim.disabled) claimAchievement(claim.dataset.claimAch);
  });

  els.historyList.addEventListener('click', e => {
    const toggle = e.target.closest('[data-history-toggle]');
    if (!toggle) return;
    const item = toggle.closest('.history-item');
    const detail = item?.querySelector('.history-detail');
    if (!detail) return;
    const open = detail.hidden;
    detail.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    item.classList.toggle('expanded', open);
    audio.click();
  });

  els.resultsContent.addEventListener('click', e => {
    const btn = e.target.closest('[data-results]');
    if (btn) handleResultsAction(btn.dataset.results);
  });

  els.confirmYes.addEventListener('click', () => settleConfirm(true));
  els.confirmNo.addEventListener('click', () => settleConfirm(false));
  els.confirm.addEventListener('click', e => {
    if (e.target === els.confirm) settleConfirm(false);
  });

  els.portrait.querySelector('#portrait-skip').addEventListener('click', () => {
    portraitSkipped = true;
    try { sessionStorage.setItem('apexdrift.portraitSkip', '1'); } catch { /* ignore */ }
    updatePortrait();
  });

  $('#quality-segment').addEventListener('click', e => {
    const btn = e.target.closest('[data-quality]');
    if (btn) setQuality(btn.dataset.quality);
  });

  $('#difficulty-segment').addEventListener('click', e => {
    const btn = e.target.closest('[data-difficulty]');
    if (btn) setDifficulty(btn.dataset.difficulty);
  });

  $('#camera-segment').addEventListener('click', e => {
    const btn = e.target.closest('[data-camera]');
    if (!btn) return;
    store.save.settings.camera = btn.dataset.camera;
    store.persist();
    setSegmented('#camera-segment', 'camera', btn.dataset.camera);
    if (race) race.raceCamera.setMode(btn.dataset.camera);
    audio.click();
  });

  $('#volume').addEventListener('input', e => {
    store.save.settings.volume = clamp(Number(e.target.value) / 100, 0, 1);
    setText('#volume-label', Math.round(store.save.settings.volume * 100) + '%');
    applySettings();
  });
  $('#volume').addEventListener('change', () => store.persist());

  $('#music-toggle').addEventListener('click', () => {
    store.save.settings.music = !store.save.settings.music;
    persistSettings();
    showToast(store.save.settings.music ? 'Music on.' : 'Music off.', 'info', 'gauge');
  });
  $('#sfx-toggle').addEventListener('click', () => {
    store.save.settings.sfx = !store.save.settings.sfx;
    persistSettings();
    showToast(store.save.settings.sfx ? 'Sound effects on.' : 'Sound effects off.', 'info', 'gauge');
  });
  $('#autothrottle-toggle').addEventListener('click', () => {
    store.save.settings.autoThrottle = !store.save.settings.autoThrottle;
    persistSettings();
    showToast(store.save.settings.autoThrottle ? 'Auto throttle on. Just steer.' : 'Auto throttle off.', 'info', 'bolt');
  });
  $('#tilt-toggle').addEventListener('click', toggleTilt);

  $('#player-name').addEventListener('change', e => {
    const name = e.target.value.trim().replace(/[<>]/g, '').slice(0, 12) || 'YOU';
    store.save.playerName = name.toUpperCase();
    e.target.value = store.save.playerName;
    store.persist();
    renderChrome();
    showToast('Callsign updated.', 'success', 'star');
  });

  $('#fullscreen-btn').addEventListener('click', toggleFullscreen);
  $('#reset-save').addEventListener('click', resetCareer);
  $('#install-btn').addEventListener('click', promptInstall);

  window.addEventListener('online', updateNetStatus);
  window.addEventListener('offline', updateNetStatus);
}

let portraitSkipped = false;
try { portraitSkipped = sessionStorage.getItem('apexdrift.portraitSkip') === '1'; } catch { /* ignore */ }

function updatePortrait() {
  if (!els.portrait) return;
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 920px)').matches;
  els.portrait.classList.toggle('show', booted && portrait && !portraitSkipped);
}

/* ------------------------------------------------------------------ */
/* PWA                                                                 */
/* ------------------------------------------------------------------ */

function bindInstallFlow() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    updateInstallUI();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    updateInstallUI();
    showToast('Apex Drift installed. Find it on your home screen.', 'success', 'check');
  });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateInstallUI);
}

async function promptInstall() {
  if (isStandalone()) {
    showToast('Apex Drift is already installed.', 'info', 'check');
    return;
  }
  if (deferredInstall) {
    deferredInstall.prompt();
    try {
      const choice = await deferredInstall.userChoice;
      if (choice && choice.outcome === 'accepted') {
        showToast('Installing Apex Drift…', 'success', 'check');
      }
      deferredInstall = null;
      updateInstallUI();
    } catch {
      deferredInstall = null;
      updateInstallUI();
    }
    return;
  }
  const note = $('#install-note');
  if (note) {
    if (!secureInstallContext()) {
      note.textContent = 'Install needs HTTPS or localhost. On Android, open the local server through `adb reverse` or an HTTPS tunnel, then use Chrome’s ⋮ menu → Install app.';
    } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      note.textContent = 'On iPhone or iPad, open this page in Safari, tap Share, then choose “Add to Home Screen”.';
    } else {
      note.textContent = 'Open your browser menu (⋮) and choose “Install app” or “Add to Home screen”. If that option is missing, reload once over localhost.';
    }
    note.classList.add('flash');
    setTimeout(() => note.classList.remove('flash'), 1200);
  }
  showToast('Use your browser menu to install Apex Drift.', 'info', 'info');
}

function updateInstallUI() {
  const note = $('#install-note');
  const btn = $('#install-btn');
  if (!note || !btn) return;
  if (isStandalone()) {
    note.textContent = 'Installed. This window runs fullscreen and offline.';
    btn.disabled = true;
    btn.innerHTML = iconSvg('check', 18) + ' INSTALLED';
    return;
  }
  btn.disabled = false;
  btn.innerHTML = iconSvg('download', 18) + ' INSTALL APP';
  if (deferredInstall) {
    note.textContent = 'Ready to install. Fullscreen play and offline loading included.';
  } else if (!secureInstallContext()) {
    note.textContent = 'Open over HTTPS or localhost to enable installation. LAN HTTP may only offer a home-screen shortcut.';
  } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    note.textContent = 'Safari: Share → Add to Home Screen for fullscreen play.';
  } else {
    note.textContent = 'Chrome: menu ⋮ → Install app. Runs offline after the first load.';
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!secureInstallContext()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.warn('Service worker registration failed', err));
  });
}

function updateNetStatus() {
  const dot = $('#net-dot');
  const label = $('#net-label');
  if (!dot || !label) return;
  const online = navigator.onLine;
  dot.classList.toggle('offline', !online);
  label.textContent = online ? 'ONLINE' : 'OFFLINE';
}

/* ------------------------------------------------------------------ */
/* start                                                               */
/* ------------------------------------------------------------------ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

// Small read-only debug handle for support and automated smoke tests.
window.__apex = {
  store,
  input,
  get race() { return race; },
  get hud() { return hud; },
  get showroom() { return showroom; },
  get renderer() { return renderer; }
};
