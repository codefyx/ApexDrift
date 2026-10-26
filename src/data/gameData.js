/** Static tuning data shared by the garage, race and reward systems. */

export const UPGRADES = {
  power: {
    id: 'power',
    name: 'POWER',
    sub: 'Acceleration',
    icon: 'bolt',
    blurb: 'Launch harder out of every corner and get to speed sooner.',
    color: '#ff5d8f',
    baseCost: 260,
    growth: 1.35,
    max: 10,
    effect: (lvl) => `+${(lvl * 1.65).toFixed(1)} m/s² launch`
  },
  speed: {
    id: 'speed',
    name: 'SPEED',
    sub: 'Top speed',
    icon: 'speed',
    blurb: 'Raise the limiter. More top end on every straight.',
    color: '#ffd166',
    baseCost: 260,
    growth: 1.35,
    max: 10,
    effect: (lvl) => `${(57 + lvl * 3.4) * 3.6 | 0} km/h top speed`
  },
  handling: {
    id: 'handling',
    name: 'SKILL',
    sub: 'Stability & grip',
    icon: 'shield',
    blurb: 'Sharper turn-in, more mechanical grip and a calmer car mid-drift.',
    color: '#2ff5ff',
    baseCost: 300,
    growth: 1.35,
    max: 10,
    effect: (lvl) => `+${(lvl * 0.5).toFixed(1)} grip · +${(lvl * 3)}% stability`
  },
  nitro: {
    id: 'nitro',
    name: 'NITRO',
    sub: 'Boost system',
    icon: 'flame',
    blurb: 'Longer burns and a stronger surge when you trigger the boost.',
    color: '#b76bff',
    baseCost: 220,
    growth: 1.33,
    max: 10,
    effect: (lvl) => `${(2.2 + lvl * 0.32).toFixed(1)}s boost · +${(lvl * 2.2).toFixed(0)} thrust`
  }
};

export const UPGRADE_ORDER = ['power', 'speed', 'handling', 'nitro'];

export const PAINTS = [
  { id: 'crimson', name: 'Crimson Rush', hex: '#ff2e63', price: 0 },
  { id: 'sunfire', name: 'Sunfire', hex: '#ff8a1f', price: 0 },
  { id: 'electric', name: 'Electric Cyan', hex: '#19e6ff', price: 0 },
  { id: 'glacier', name: 'Glacier', hex: '#eef4ff', price: 0 },
  { id: 'onyx', name: 'Onyx', hex: '#14151d', price: 0 },
  { id: 'lime', name: 'Acid Lime', hex: '#b6ff3c', price: 350 },
  { id: 'violet', name: 'Ultraviolet', hex: '#8b5cff', price: 350 },
  { id: 'sunset', name: 'Sunset Pearl', hex: '#ff6b9d', price: 450 },
  { id: 'gold', name: '24K Gold', hex: '#e8b84b', price: 900 },
  { id: 'midnight', name: 'Midnight Blue', hex: '#243b8f', price: 300 },
  { id: 'mint', name: 'Mint Bomb', hex: '#7dffcf', price: 400 },
  { id: 'cherry', name: 'Candy Cherry', hex: '#c31a3f', price: 500 }
];

export const FINISHES = [
  { id: 'gloss', name: 'Gloss', price: 0, metalness: 0.45, roughness: 0.18, clearcoat: 1 },
  { id: 'metallic', name: 'Metallic', price: 400, metalness: 0.85, roughness: 0.28, clearcoat: 1 },
  { id: 'matte', name: 'Matte', price: 700, metalness: 0.35, roughness: 0.65, clearcoat: 0.2 },
  { id: 'chrome', name: 'Chrome', price: 1500, metalness: 1, roughness: 0.05, clearcoat: 1 }
];

export const UNDERGLOWS = [
  { id: 'none', name: 'None', hex: null, price: 0 },
  { id: 'cyan', name: 'Cyan', hex: '#19e6ff', price: 0 },
  { id: 'pink', name: 'Hot Pink', hex: '#ff2e88', price: 0 },
  { id: 'gold', name: 'Gold', hex: '#ffcc55', price: 250 },
  { id: 'violet', name: 'Violet', hex: '#a855ff', price: 300 },
  { id: 'lime', name: 'Lime', hex: '#9dff3c', price: 300 },
  { id: 'white', name: 'Ice White', hex: '#e8fbff', price: 400 }
];

export const POSITION_REWARDS = [700, 500, 380, 280, 200, 150, 110, 80];

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: 'EASY',
    blurb: 'Auto-throttle and steering assists. Rivals are gentler.',
    desc: 'The car accelerates automatically, corners with extra grip and the AI pack runs calmer. Arrow keys alone are enough.',
    aiSkillMin: 0.16,
    aiSkillMax: 0.52,
    aiSpeed: 0.96,
    aiLevelScale: 0.5,
    playerGrip: 1.22,
    playerStability: 0.2,
    playerSteer: 0.92,
    playerAccel: 1.05,
    autoThrottle: 0.82
  },
  normal: {
    id: 'normal',
    name: 'NORMAL',
    blurb: 'Balanced rivals and a neutral car.',
    desc: 'A fair fight. The AI pack is competitive and the car behaves with its true handling balance.',
    aiSkillMin: 0.29,
    aiSkillMax: 0.91,
    aiSpeed: 1,
    aiLevelScale: 1,
    playerGrip: 1,
    playerStability: 0,
    playerSteer: 1,
    playerAccel: 1,
    autoThrottle: 0
  },
  hard: {
    id: 'hard',
    name: 'HARD',
    blurb: 'Faster rivals, sharper reflexes.',
    desc: 'The pack pushes harder, the car has less margin and mistakes are punished. Upgrades matter.',
    aiSkillMin: 0.58,
    aiSkillMax: 0.99,
    aiSpeed: 1.035,
    aiLevelScale: 1.25,
    playerGrip: 0.96,
    playerStability: -0.04,
    playerSteer: 1.04,
    playerAccel: 0.99,
    autoThrottle: 0
  }
};

export const AI_NAMES = [
  ['K. VOSS', 'DEU'], ['NOVA', 'JPN'], ['BLAZE', 'USA'], ['S. KIM', 'KOR'],
  ['VIPER', 'ITA'], ['GHOST', 'GBR'], ['M. DURAN', 'ESP'], ['RIFT', 'CAN'],
  ['A. SILVA', 'BRA'], ['ZEN', 'IND'], ['FALCON', 'FRA'], ['J. WOLF', 'AUT'],
  ['SABLE', 'AUS'], ['TORQUE', 'MEX'], ['L. NYX', 'NOR'], ['HAVOC', 'RSA'],
  ['ONI', 'JPN'], ['A. PETROV', 'POL'], ['SOL', 'ARG'], ['KATANA', 'JPN'],
  ['D. RHEE', 'KOR'], ['MIRAGE', 'UAE'], ['COBALT', 'SWE'], ['R. DUTCH', 'NED']
];

export const ACHIEVEMENTS = [
  {
    id: 'rookie', name: 'Green Light', desc: 'Complete your first race', reward: 300,
    icon: 'flag', progress: s => [s.stats.races, 1]
  },
  {
    id: 'first_win', name: 'First Blood', desc: 'Win a race', reward: 600,
    icon: 'trophy', progress: s => [s.stats.wins, 1]
  },
  {
    id: 'podium5', name: 'Podium Pro', desc: 'Finish on the podium 5 times', reward: 900,
    icon: 'podium', progress: s => [s.stats.podiums, 5]
  },
  {
    id: 'racer10', name: 'Grid Regular', desc: 'Complete 10 races', reward: 800,
    icon: 'grid', progress: s => [s.stats.races, 10]
  },
  {
    id: 'collector', name: 'Diamond Hunt', desc: 'Collect 30 diamonds on track', reward: 700,
    icon: 'diamond', progress: s => [s.stats.pickups, 30]
  },
  {
    id: 'drift10k', name: 'Drift King', desc: 'Score 10,000 drift points', reward: 700,
    icon: 'drift', progress: s => [s.stats.driftPoints, 10000]
  },
  {
    id: 'tuner', name: 'Master Tuner', desc: 'Purchase 10 upgrades or styles', reward: 900,
    icon: 'wrench', progress: s => [s.stats.upgradesBought, 10]
  },
  {
    id: 'globetrotter', name: 'Globetrotter', desc: 'Race on all four circuits', reward: 1200,
    icon: 'globe', progress: s => [Object.keys(s.stats.tracksRaced || {}).length, 4]
  },
  {
    id: 'speed_demon', name: 'Speed Demon', desc: 'Reach 280 km/h', reward: 500,
    icon: 'speed', progress: s => [s.stats.topSpeed || 0, 280]
  },
  {
    id: 'clean_race', name: 'Spotless', desc: 'Finish a race without hitting a wall', reward: 650,
    icon: 'shield', progress: s => [s.stats.cleanRaces || 0, 1]
  },
  {
    id: 'level5', name: 'Rising Star', desc: 'Reach driver level 5', reward: 800,
    icon: 'star', progress: s => [s.level, 5]
  },
  {
    id: 'streak3', name: 'Loyal Sponsor', desc: 'Claim the daily bonus 3 days in a row', reward: 700,
    icon: 'calendar', progress: s => [s.daily.streak, 3]
  }
];

export function upgradeCost(id, level) {
  const u = UPGRADES[id];
  return Math.round((u.baseCost * Math.pow(u.growth, level)) / 10) * 10;
}

export function xpForNext(level) {
  return 600 + level * 300;
}

export function positionLabel(pos) {
  if (pos === 1) return 'P1';
  if (pos === 2) return 'P2';
  if (pos === 3) return 'P3';
  return 'P' + pos;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---- icon paths (24x24, stroke based) ---- */
export const ICONS = {
  bolt: 'M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z',
  speed: 'M12 21a9 9 0 1 1 9-9M12 12l4.8-3.6M12 3v2M4.2 7.5l1.6 1M3 15h2M19 15h2M6.4 20.5l1.2-1.6',
  shield: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z',
  flame: 'M12 22c4 0 6.5-2.8 6.5-6.4 0-2.8-1.7-4.7-3.2-6.6C14 7.3 12.8 5.4 12.6 3c-2.7 2.2-4 4.6-4 7-1-.7-1.6-1.8-1.8-3C5.6 8.8 5 10.8 5 13c0 4.9 3 9 7 9Z',
  wrench: 'M14.5 6.5a4.5 4.5 0 0 0 5.6 5.7L11 21.3a2.4 2.4 0 0 1-3.4-3.4l9-9.1a4.5 4.5 0 0 0-2.1-2.3Z',
  diamond: 'M6 3h12l4 6-10 12L2 9l4-6Zm0 0 6 6 6-6M2 9h20M9 9l3 12M15 9l-3 12',
  trophy: 'M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6',
  flag: 'M5 21V3m0 1h12l-2.5 5L17 14H5',
  podium: 'M3 21h18M6 21v-8h4v8M14 21V7h4v14M11 21V3h2v18',
  grid: 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.4 3.8 5.4 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3Z',
  star: 'm12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.4 6.4 20.3l1.2-6.3L3 9.6l6.3-.8L12 3Z',
  calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 18h2M14 18h2',
  play: 'M8 5v14l11-7L8 5Z',
  garage: 'M3 21V9l9-6 9 6v12M7 21v-7h10v7M3 21h18M9 9h6',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l4 2',
  gift: 'M4 11h16v10H4zM2 7h20v4H2zM12 7v14M12 7C9 7 7 3 9.5 3 11 3 12 5 12 7Zm0 0c3 0 5-4 2.5-4C13 3 12 5 12 7Z',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a8 8 0 0 0-.2-1.7l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.9-1.7L14.1 2H9.9l-.4 2.6a8 8 0 0 0-2.9 1.7l-2.4-1-2 3.4 2 1.5a8 8 0 0 0 0 3.4l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.9 1.7l.4 2.8h4.2l.4-2.8a8 8 0 0 0 2.9-1.7l2.4 1 2-3.4-2-1.5c.1-.6.2-1.1.2-1.7Z',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 18-6-6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  mute: 'M4 9h4l5-4v14l-5-4H4V9Zm12-1a6 6 0 0 1 0 8M18.5 5.5a10 10 0 0 1 0 13',
  camera: 'M4 7h3l2-2h6l2 2h3v13H4V7Zm8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  pause: 'M8 5v14M16 5v14',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5',
  check: 'm5 13 4 4L19 7',
  lock: 'M6 11h12v10H6V11Zm3 0V8a3 3 0 0 1 6 0v3',
  gauge: 'M12 21a9 9 0 1 1 9-9M12 12l5-5M12 3v2M3 12h2M19 12h2M6 5.5 7.5 7',
  tire: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  drift: 'M4 17c3-1 4-5 7-5s4 3 7 2M4 13c2-.8 3.4-4 6.5-4 3.7 0 4.5 4 8 3M4 9c1.6-.5 2.6-3 5.2-3 2.8 0 4 3 7.8 2M16 3l4 2-2 4',
  download: 'M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 17v3h16v-3'
};

export function iconSvg(name, size = 20) {
  const path = ICONS[name] || ICONS.star;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}
