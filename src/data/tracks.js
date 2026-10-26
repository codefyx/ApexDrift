import * as THREE from 'three';

/**
 * Track definitions. Points are [x, z, height]. Every layout is a closed
 * centripetal Catmull-Rom spline, sampled into an arc-length table used by
 * rendering, physics, AI and the minimap.
 */
export const TRACK_DEFS = [
  {
    id: 'coast',
    name: 'Sunset Coast',
    location: 'Big Sur · California',
    tagline: 'Ocean cliffs, golden hour, flat-out sweepers.',
    laps: 3,
    width: 17,
    difficulty: 1,
    reward: 1.0,
    theme: 'sunset',
    sea: true,
    props: 'palm',
    points: [
      [0, 0, 0], [220, -10, 0.4], [380, -90, 2.2], [430, -240, 5],
      [360, -370, 6.5], [200, -410, 4.2], [40, -380, 1.8], [-60, -300, 1.1],
      [-200, -320, 2.8], [-320, -240, 4.4], [-330, -90, 2.6], [-230, 20, 1.2],
      [-80, 40, 0.3]
    ],
    sky: {
      turbidity: 9.0, rayleigh: 2.35, mieCoefficient: 0.006, mieDirectionalG: 0.86,
      elevation: 3.2, azimuth: 248, exposure: 0.82, fog: 0xff9e7a, fogDensity: 0.0017,
      sunColor: 0xffd2a1, skyLight: 0x9fb8ff
    },
    colors: {
      ground: 0x6f5b3e, ground2: 0x8a7350, asphalt: 0x2d2d36,
      curbA: 0xff3d6e, curbB: 0xfff3e9, rail: 0xcfd6df, accent: 0xff2e88,
      accent2: 0x2ff5ff, accent3: 0xffd166
    }
  },
  {
    id: 'harbor',
    name: 'Neon Harbor',
    location: 'Docklands · Neo Tokyo',
    tagline: 'Rain-slick docks under a city of neon.',
    laps: 3,
    width: 15,
    difficulty: 2,
    reward: 1.35,
    theme: 'night',
    sea: true,
    props: 'city',
    points: [
      [0, 0, 0], [170, 20, 0.2], [310, -30, 0.8], [340, -160, 1.6],
      [260, -250, 1.1], [120, -260, 0.4], [60, -350, 0.8], [-80, -380, 1.4],
      [-200, -320, 1.0], [-230, -200, 0.5], [-340, -130, 1.1], [-330, -10, 0.6],
      [-200, 40, 0.2], [-90, 30, 0]
    ],
    sky: {
      turbidity: 12, rayleigh: 0.8, mieCoefficient: 0.012, mieDirectionalG: 0.7,
      elevation: -6, azimuth: 120, exposure: 0.6, fog: 0x120a24, fogDensity: 0.0028,
      sunColor: 0x8f7dff, skyLight: 0x4f66ff
    },
    colors: {
      ground: 0x171522, ground2: 0x1f2030, asphalt: 0x24242f,
      curbA: 0x00e5ff, curbB: 0xff2e88, rail: 0x7f8aa6, accent: 0x00e5ff,
      accent2: 0xff2e88, accent3: 0xb76bff
    }
  },
  {
    id: 'canyon',
    name: 'Canyon Vault',
    location: 'Red Mesa · Utah',
    tagline: 'Blind crests, technical esses, zero margin.',
    laps: 3,
    width: 14.5,
    difficulty: 3,
    reward: 1.65,
    theme: 'canyon',
    sea: false,
    props: 'desert',
    points: [
      [0, 0, 0], [190, -20, 1.5], [330, 30, 5.5], [430, -80, 10],
      [410, -200, 14], [300, -270, 11], [330, -380, 7], [200, -460, 4],
      [40, -420, 2], [-60, -330, 3.5], [-190, -360, 6], [-300, -280, 8],
      [-280, -140, 5], [-160, -60, 2.2], [-40, 40, 0.5]
    ],
    sky: {
      turbidity: 6.5, rayleigh: 1.4, mieCoefficient: 0.01, mieDirectionalG: 0.82,
      elevation: 20, azimuth: 200, exposure: 0.9, fog: 0xd98d5f, fogDensity: 0.0019,
      sunColor: 0xffe1b0, skyLight: 0xffcf9e
    },
    colors: {
      ground: 0x9c5f3c, ground2: 0xb97a4e, asphalt: 0x34313a,
      curbA: 0xffbe3b, curbB: 0x3a1f22, rail: 0xb8a58e, accent: 0xff8a3d,
      accent2: 0xffd166, accent3: 0x7dffcf
    }
  },
  {
    id: 'alpine',
    name: 'Alpine Rush',
    location: 'Saint-Véran · France',
    tagline: 'Dawn light, ice-cold air, high-altitude grip.',
    laps: 3,
    width: 15,
    difficulty: 4,
    reward: 1.95,
    theme: 'dawn',
    sea: false,
    props: 'alpine',
    points: [
      [0, 0, 0], [200, 30, 1], [350, -30, 4], [430, -160, 9],
      [370, -290, 14], [230, -320, 11], [140, -420, 7], [-20, -450, 5],
      [-160, -380, 8], [-300, -410, 12], [-410, -300, 9], [-360, -160, 5],
      [-230, -60, 2], [-90, 40, 0.5]
    ],
    sky: {
      turbidity: 4.2, rayleigh: 3.1, mieCoefficient: 0.004, mieDirectionalG: 0.92,
      elevation: 7, azimuth: 105, exposure: 0.88, fog: 0xcfd9f0, fogDensity: 0.0022,
      sunColor: 0xffe4ef, skyLight: 0xa9c6ff
    },
    colors: {
      ground: 0xe8eef7, ground2: 0xc9d7e8, asphalt: 0x2f3440,
      curbA: 0xff3b5c, curbB: 0xf4f8ff, rail: 0xd8e1ec, accent: 0xff5d8f,
      accent2: 0x7dffea, accent3: 0xffd166
    }
  }
];

const UP = new THREE.Vector3(0, 1, 0);

function smoothAngle(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * 0.5;
}

/**
 * Builds the sampled representation of a track.
 * @param {object} def Track definition
 * @param {number} sampleCount number of centerline samples
 */
export function buildTrack(def, sampleCount = 1400) {
  const control = def.points.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(control, true, 'centripetal', 0.5);
  // Arc-length-spaced points make the physics and lateral math uniform.
  const raw = curve.getSpacedPoints(sampleCount);
  const pts = raw.slice(0, sampleCount);

  const samples = [];
  let total = 0;
  for (let i = 0; i < sampleCount; i++) {
    const prev = pts[(i - 1 + sampleCount) % sampleCount];
    const next = pts[(i + 1) % sampleCount];
    const tangent = new THREE.Vector3().subVectors(next, prev);
    tangent.y = 0;
    tangent.normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
    const p = pts[i].clone();
    if (i > 0) total += p.distanceTo(pts[i - 1]);
    samples.push({
      p, tangent, right, dist: total,
      yaw: Math.atan2(tangent.x, tangent.z),
      curvature: 0,
      index: i
    });
  }

  // Close the distance loop.
  total += pts[0].distanceTo(pts[sampleCount - 1]);
  for (const s of samples) s.totalLength = total;

  const spacing = total / sampleCount;
  // Signed curvature over a small window, used for AI speed targets.
  const windowSize = Math.max(3, Math.round(12 / spacing));
  for (let i = 0; i < sampleCount; i++) {
    const a = samples[(i - windowSize + sampleCount) % sampleCount].tangent;
    const b = samples[(i + windowSize) % sampleCount].tangent;
    const cross = a.x * b.z - a.z * b.x;
    const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
    const angle = Math.atan2(cross, dot);
    const arc = spacing * windowSize * 2;
    const k = -angle / arc; // positive = left turn
    samples[i].curvature = k;
  }

  // Minimap outline, normalized to a unit box, plus a downsampled elevation.
  const minX = Math.min(...samples.map(s => s.p.x));
  const maxX = Math.max(...samples.map(s => s.p.x));
  const minZ = Math.min(...samples.map(s => s.p.z));
  const maxZ = Math.max(...samples.map(s => s.p.z));
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const map = [];
  const mapStep = Math.max(1, Math.floor(sampleCount / 260));
  for (let i = 0; i < sampleCount; i += mapStep) {
    const s = samples[i];
    map.push({
      x: (s.p.x - cx) / span + 0.5,
      y: (s.p.z - cz) / span + 0.5,
      t: i / sampleCount
    });
  }
  // Ensure the loop closes in the map polyline.
  map.push({ ...map[0], t: 1 });

  // Center of the start line and its direction.
  const start = samples[0];
  return {
    def,
    id: def.id,
    samples,
    sampleCount,
    spacing,
    length: total,
    map,
    bounds: { minX, maxX, minZ, maxZ, cx, cz, span },
    start,
    halfWidth: def.width / 2,
    wallLimit: def.width / 2 + 3.1,
    startOffset: 0,
    up: UP.clone()
  };
}

for (const def of TRACK_DEFS) {
  def.built = null;
}

export function getTrackDef(id) {
  return TRACK_DEFS.find(t => t.id === id) || TRACK_DEFS[0];
}

export function getBuiltTrack(id) {
  const def = getTrackDef(id);
  if (!def.built) def.built = buildTrack(def);
  return def.built;
}

/** Project a world position onto the track near a previous sample index. */
export function projectToTrack(track, x, z, hintIndex = -1, window = 140) {
  const samples = track.samples;
  const n = track.sampleCount;
  let best = -1;
  let bestD = Infinity;
  if (hintIndex >= 0) {
    for (let k = -window; k <= window; k++) {
      const i = (hintIndex + k + n * 2) % n;
      const s = samples[i];
      const dx = s.p.x - x;
      const dz = s.p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  if (best < 0 || bestD > 900) {
    // Fall back to a full scan (only on recovery/reset or teleports).
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const dx = s.p.x - x;
      const dz = s.p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  const s = samples[best];
  const lateral = (x - s.p.x) * s.right.x + (z - s.p.z) * s.right.z;
  const along = (x - s.p.x) * s.tangent.x + (z - s.p.z) * s.tangent.z;
  return {
    index: best,
    progress: ((best + along / track.spacing) % n + n) % n / n,
    lateral,
    sample: s,
    height: s.p.y,
    distance: Math.sqrt(bestD)
  };
}

/** World point at a normalized progress plus lateral offset. */
export function trackPointAt(track, progress, lateral = 0) {
  const n = track.sampleCount;
  const f = ((progress % 1) + 1) % 1;
  const raw = f * n;
  const i = Math.floor(raw) % n;
  const frac = raw - Math.floor(raw);
  const a = track.samples[i];
  const b = track.samples[(i + 1) % n];
  return {
    x: THREE.MathUtils.lerp(a.p.x, b.p.x, frac) + THREE.MathUtils.lerp(a.right.x, b.right.x, frac) * lateral,
    z: THREE.MathUtils.lerp(a.p.z, b.p.z, frac) + THREE.MathUtils.lerp(a.right.z, b.right.z, frac) * lateral,
    y: THREE.MathUtils.lerp(a.p.y, b.p.y, frac),
    yaw: smoothAngle(a.yaw, b.yaw),
    tangent: a.tangent,
    right: a.right
  };
}

export function formatTrackLength(track) {
  return (track.length / 1000).toFixed(2) + ' km';
}
