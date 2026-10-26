import {
  UPGRADES, PAINTS, FINISHES, UNDERGLOWS, ACHIEVEMENTS, POSITION_REWARDS,
  upgradeCost, xpForNext
} from './data/gameData.js';

const KEY = 'apexdrift.save.v1';
const SAVE_VERSION = 1;

function defaultSave() {
  return {
    version: SAVE_VERSION,
    createdAt: new Date().toISOString(),
    playerName: 'YOU',
    diamonds: 1500,
    unlimitedDiamonds: false,
    level: 1,
    xp: 0,
    upgrades: { power: 0, speed: 0, handling: 0, nitro: 0 },
    paint: {
      paintId: 'crimson',
      color: '#ff2e63',
      finish: 'gloss',
      underglow: 'cyan'
    },
    owned: {
      paints: ['crimson', 'sunfire', 'electric', 'glacier', 'onyx'],
      finishes: ['gloss'],
      glows: ['none', 'cyan', 'pink']
    },
    stats: {
      races: 0,
      wins: 0,
      podiums: 0,
      diamondsEarned: 0,
      diamondsSpent: 0,
      driftPoints: 0,
      pickups: 0,
      upgradesBought: 0,
      cleanRaces: 0,
      topSpeed: 0,
      bestLaps: {},
      bestPositions: {},
      tracksRaced: {},
      firstWins: []
    },
    history: [],
    achievements: { claimed: [] },
    daily: { lastClaim: null, streak: 0 },
    settings: {
      quality: 'auto',
      music: true,
      sfx: true,
      volume: 0.7,
      muted: false,
      camera: 'chase',
      autoThrottle: false,
      tilt: false,
      difficulty: 'normal'
    },
    lastTrack: 'coast',
    totalPlaySeconds: 0
  };
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function mergeDefaults(base, saved) {
  if (!isPlainObject(saved)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const key of Object.keys(base)) {
    if (isPlainObject(base[key]) && isPlainObject(saved[key])) {
      out[key] = mergeDefaults(base[key], saved[key]);
    } else if (saved[key] !== undefined) {
      out[key] = saved[key];
    }
  }
  return out;
}

class Store {
  constructor() {
    this.save = this.load();
    this.listeners = new Set();
    this._dailyChecked = false;
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      const merged = mergeDefaults(defaultSave(), parsed);
      merged.version = SAVE_VERSION;
      return merged;
    } catch (err) {
      console.warn('Could not load save, starting fresh.', err);
      return defaultSave();
    }
  }

  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.save));
    } catch (err) {
      console.warn('Save failed', err);
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.persist();
    for (const fn of this.listeners) fn(this.save);
  }

  reset() {
    this.save = defaultSave();
    this.emit();
  }

  addDiamonds(amount) {
    this.save.diamonds = Math.max(0, this.save.diamonds + Math.round(amount));
    this.emit();
  }

  hasUnlimitedDiamonds() {
    return this.save.unlimitedDiamonds === true;
  }

  activateUnlimitedDiamonds() {
    if (this.hasUnlimitedDiamonds()) return false;
    this.save.unlimitedDiamonds = true;
    this.emit();
    return true;
  }

  canAfford(amount) {
    return this.hasUnlimitedDiamonds() || this.save.diamonds >= Math.round(amount);
  }

  spend(amount) {
    amount = Math.round(amount);
    if (!this.hasUnlimitedDiamonds() && this.save.diamonds < amount) return false;
    if (!this.hasUnlimitedDiamonds()) this.save.diamonds -= amount;
    this.save.stats.diamondsSpent += amount;
    return true;
  }

  /* ---------- upgrades ---------- */

  buyUpgrade(id) {
    const def = UPGRADES[id];
    if (!def) return { ok: false, reason: 'unknown' };
    const lvl = this.save.upgrades[id] || 0;
    if (lvl >= def.max) return { ok: false, reason: 'max' };
    const cost = upgradeCost(id, lvl);
    if (!this.spend(cost)) return { ok: false, reason: 'funds', cost };
    this.save.upgrades[id] = lvl + 1;
    this.save.stats.upgradesBought++;
    this.emit();
    return { ok: true, cost, level: lvl + 1 };
  }

  /* ---------- style ---------- */

  isPaintOwned(id) {
    return this.save.owned.paints.includes(id);
  }

  isFinishOwned(id) {
    return this.save.owned.finishes.includes(id);
  }

  isGlowOwned(id) {
    return this.save.owned.glows.includes(id);
  }

  buyPaint(id) {
    const p = PAINTS.find(x => x.id === id);
    if (!p) return { ok: false };
    let cost = 0;
    if (!this.isPaintOwned(id)) {
      if (!this.spend(p.price)) return { ok: false, reason: 'funds', cost: p.price };
      this.save.owned.paints.push(id);
      this.save.stats.upgradesBought++;
      cost = p.price;
    }
    this.save.paint.paintId = id;
    this.save.paint.color = p.hex;
    this.emit();
    return { ok: true, cost, color: p.hex };
  }

  buyFinish(id) {
    const f = FINISHES.find(x => x.id === id);
    if (!f) return { ok: false };
    let cost = 0;
    if (!this.isFinishOwned(id)) {
      if (!this.spend(f.price)) return { ok: false, reason: 'funds', cost: f.price };
      this.save.owned.finishes.push(id);
      this.save.stats.upgradesBought++;
      cost = f.price;
    }
    this.save.paint.finish = id;
    this.emit();
    return { ok: true, cost };
  }

  buyGlow(id) {
    const g = UNDERGLOWS.find(x => x.id === id);
    if (!g) return { ok: false };
    let cost = 0;
    if (!this.isGlowOwned(id)) {
      if (!this.spend(g.price)) return { ok: false, reason: 'funds', cost: g.price };
      this.save.owned.glows.push(id);
      this.save.stats.upgradesBought++;
      cost = g.price;
    }
    this.save.paint.underglow = id;
    this.emit();
    return { ok: true, cost };
  }

  getPaintHex() {
    const p = PAINTS.find(x => x.id === this.save.paint.paintId);
    return p ? p.hex : (this.save.paint.color || '#ff2e63');
  }

  getFinish() {
    return FINISHES.find(f => f.id === this.save.paint.finish) || FINISHES[0];
  }

  getGlowHex() {
    return (UNDERGLOWS.find(g => g.id === this.save.paint.underglow) || UNDERGLOWS[0]).hex;
  }

  /* ---------- derived stats ---------- */

  carStats() {
    const u = this.save.upgrades;
    const handling = u.handling || 0;
    return {
      accel: 16.5 + (u.power || 0) * 1.65,
      topSpeed: 57 + (u.speed || 0) * 3.4,
      grip: 5.4 + handling * 0.5,
      steerRate: 1.28 + handling * 0.05,
      stability: 0.76 + handling * 0.024,
      nitroThrust: 15 + (u.nitro || 0) * 2.2,
      nitroDuration: 2.2 + (u.nitro || 0) * 0.32,
      nitroRegen: 0.055 + (u.nitro || 0) * 0.004
    };
  }

  xpNeeded() {
    return xpForNext(this.save.level);
  }

  /* ---------- circuit progression ---------- */

  bestPosition(trackId) {
    const stored = this.save.stats.bestPositions?.[trackId];
    if (stored) return stored;
    let best = Infinity;
    for (const r of this.save.history) {
      if (r.trackId === trackId) best = Math.min(best, r.position);
    }
    return best;
  }

  trackUnlock(trackId) {
    const order = ['coast', 'harbor', 'canyon', 'alpine'];
    const i = order.indexOf(trackId);
    if (i <= 0) return { unlocked: true, requirement: 'Open from the start', met: true };
    const prev = order[i - 1];
    const raced = (this.save.stats.tracksRaced[prev] || 0) > 0;
    const best = this.bestPosition(prev);
    if (i === 1) {
      return {
        unlocked: raced,
        requirement: 'Finish any race at Sunset Coast',
        met: raced,
        progress: raced ? 'Complete' : (this.save.history.length ? 'In progress' : 'Not started')
      };
    }
    if (i === 2) {
      return {
        unlocked: raced && best <= 5,
        requirement: 'Place top 5 at Neon Harbor',
        met: raced && best <= 5,
        progress: raced ? `Best finish P${best}` : 'Not started'
      };
    }
    return {
      unlocked: raced && best <= 3,
      requirement: 'Take a podium at Canyon Vault',
      met: raced && best <= 3,
      progress: raced ? `Best finish P${best}` : 'Not started'
    };
  }

  /* ---------- achievements & daily ---------- */

  achievementState(id) {
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def) return null;
    const [value, target] = def.progress(this.save);
    const claimed = this.save.achievements.claimed.includes(id);
    const complete = value >= target;
    return { ...def, value: Math.min(value, target), target, claimed, complete, claimable: complete && !claimed };
  }

  claimAchievement(id) {
    const st = this.achievementState(id);
    if (!st || !st.claimable) return { ok: false };
    this.save.achievements.claimed.push(id);
    this.save.diamonds += st.reward;
    this.emit();
    return { ok: true, reward: st.reward };
  }

  dailyInfo() {
    const today = dateKey(new Date());
    const yesterday = dateKey(new Date(Date.now() - 86400000));
    const last = this.save.daily.lastClaim;
    const claimedToday = last === today;
    let nextStreak = 1;
    if (last === yesterday) nextStreak = (this.save.daily.streak || 0) + 1;
    else if (last === today) nextStreak = this.save.daily.streak || 1;
    const reward = Math.min(900, 350 + (nextStreak - 1) * 75);
    return { claimedToday, streak: this.save.daily.streak || 0, nextStreak, reward, today };
  }

  claimDaily() {
    const info = this.dailyInfo();
    if (info.claimedToday) return { ok: false, reason: 'claimed' };
    this.save.daily.lastClaim = info.today;
    this.save.daily.streak = info.nextStreak;
    this.save.diamonds += info.reward;
    this.emit();
    return { ok: true, reward: info.reward, streak: info.nextStreak };
  }

  /* ---------- race settlement ---------- */

  finishRace(payload) {
    const s = this.save;
    const {
      trackId, trackName, trackReward = 1, position = 8, total = 8,
      time = 0, bestLap = null, driftScore = 0, pickups = 0,
      topSpeed = 0, wallHits = 0, lapCount = 3
    } = payload;

    const prevLevel = s.level;
    const prevCompleted = new Set(ACHIEVEMENTS.filter(a => {
      const [v, t] = a.progress(s);
      return v >= t;
    }).map(a => a.id));

    const base = Math.round(POSITION_REWARDS[Math.min(position, 8) - 1] * trackReward);
    const driftBonus = Math.min(180, Math.floor(driftScore / 45));
    const pickupBonus = pickups * 15;
    const cleanBonus = wallHits === 0 ? 120 : 0;
    const priorBest = s.stats.bestLaps[trackId];
    const isBestLap = bestLap != null && (!priorBest || bestLap < priorBest);
    const bestLapBonus = isBestLap ? 90 : 0;
    const firstWin = position === 1 && !s.stats.firstWins.includes(trackId);
    const firstWinBonus = firstWin ? 300 : 0;
    const placementXp = [150, 120, 100, 80, 60, 50, 40, 30][Math.min(position, 8) - 1] || 30;
    const xpGain = 70 + placementXp + Math.min(80, Math.floor(driftScore / 40));
    let raceDiamonds = base + driftBonus + pickupBonus + cleanBonus + bestLapBonus + firstWinBonus;

    // Level progression with repeatable level-ups.
    let levelsGained = 0;
    let levelBonus = 0;
    s.xp += xpGain;
    let guard = 0;
    while (s.xp >= xpForNext(s.level) && guard++ < 20) {
      s.xp -= xpForNext(s.level);
      s.level++;
      levelsGained++;
      levelBonus += 250;
    }
    if (levelsGained) raceDiamonds += levelBonus;

    // Stats
    s.stats.races++;
    if (position === 1) {
      s.stats.wins++;
      if (!s.stats.firstWins.includes(trackId)) s.stats.firstWins.push(trackId);
    }
    if (position <= 3) s.stats.podiums++;
    const prevBestPos = s.stats.bestPositions?.[trackId];
    if (!prevBestPos || position < prevBestPos) {
      s.stats.bestPositions = s.stats.bestPositions || {};
      s.stats.bestPositions[trackId] = position;
    }
    s.stats.driftPoints += driftScore;
    s.stats.pickups += pickups;
    s.stats.diamondsEarned += raceDiamonds;
    s.stats.topSpeed = Math.max(s.stats.topSpeed || 0, topSpeed);
    if (wallHits === 0) s.stats.cleanRaces++;
    s.stats.tracksRaced[trackId] = (s.stats.tracksRaced[trackId] || 0) + 1;
    if (isBestLap) s.stats.bestLaps[trackId] = bestLap;

    const record = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString(),
      trackId,
      trackName,
      position,
      total,
      laps: lapCount,
      time,
      bestLap,
      diamonds: raceDiamonds,
      breakdown: [
        ['Position', base],
        ['Drift style', driftBonus],
        ['Diamond pickups', pickupBonus],
        ['Clean race', cleanBonus],
        ['Best lap', bestLapBonus],
        ['First win', firstWinBonus],
        ['Level bonus', levelBonus]
      ].filter(([, v]) => v > 0),
      driftScore,
      pickups,
      xp: xpGain,
      topSpeed,
      clean: wallHits === 0,
      wallHits
    };
    s.history.unshift(record);
    if (s.history.length > 60) s.history.length = 60;
    s.diamonds += raceDiamonds;

    const newAchievements = ACHIEVEMENTS.filter(a => {
      if (prevCompleted.has(a.id) || s.achievements.claimed.includes(a.id)) return false;
      const [v, t] = a.progress(s);
      return v >= t;
    }).map(a => a.id);

    this.emit();
    const afterLevel = s.level;
    return {
      record,
      diamonds: raceDiamonds,
      breakdown: record.breakdown,
      xpGain,
      prevLevel,
      levelsGained,
      levelBonus,
      level: afterLevel,
      xp: s.xp,
      xpNeeded: xpForNext(s.level),
      isBestLap,
      firstWin,
      newAchievements
    };
  }

  addPlayTime(seconds) {
    this.save.totalPlaySeconds = (this.save.totalPlaySeconds || 0) + seconds;
  }
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export const store = new Store();
export { defaultSave };
