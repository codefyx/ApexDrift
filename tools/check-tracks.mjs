import { TRACK_DEFS, buildTrack } from '../src/data/tracks.js';

function segIntersect(a, b, c, d) {
  const d1 = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.z - c.z) - (d.z - c.z) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.z - c.z) - (d.z - c.z) * (b.x - c.x);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

for (const def of TRACK_DEFS) {
  const t = buildTrack(def, 1200);
  const samples = t.samples;
  let minRadius = Infinity;
  let tight = [];
  for (let i = 0; i < samples.length; i += 5) {
    const k = Math.abs(samples[i].curvature);
    if (k > 1e-5) {
      const r = 1 / k;
      if (r < minRadius) minRadius = r;
      if (r < 40) tight.push([i, r.toFixed(1)]);
    }
  }
  // clearance between distant parts of the track
  let minClear = Infinity;
  const step = 8;
  outer:
  for (let i = 0; i < samples.length; i += step) {
    for (let j = 0; j < samples.length; j += step) {
      let di = Math.abs(i - j);
      di = Math.min(di, samples.length - di);
      if (di < 90) continue;
      const dx = samples[i].p.x - samples[j].p.x;
      const dz = samples[i].p.z - samples[j].p.z;
      const d = Math.hypot(dx, dz);
      if (d < minClear) {
        minClear = d;
        if (d < 1) break outer;
      }
    }
  }
  let crossings = 0;
  for (let i = 0; i < samples.length; i += 4) {
    for (let j = i + 20; j < samples.length; j += 4) {
      if (i === 0 && j > samples.length - 20) continue;
      if (segIntersect(samples[i].p, samples[(i + 4) % samples.length].p, samples[j].p, samples[(j + 4) % samples.length].p)) crossings++;
    }
  }
  console.log(
    def.id.padEnd(8),
    'len', Math.round(t.length) + 'm',
    'minR', minRadius.toFixed(1) + 'm',
    'clear', minClear.toFixed(1) + 'm',
    'cross', crossings,
    'tight(under40m)', tight.length
  );
}
