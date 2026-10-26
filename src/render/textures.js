import * as THREE from 'three';

const cache = new Map();

export function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function tex(canvas, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export function cssColor(hexNum) {
  return '#' + hexNum.toString(16).padStart(6, '0');
}

function shade(hex, amt) {
  const r = Math.min(255, Math.max(0, (hex >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (hex & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function asphaltTexture(baseHex) {
  return cached('asphalt' + baseHex, () => {
    const { c, ctx } = canvas2d(512, 512);
    ctx.fillStyle = cssColor(baseHex);
    ctx.fillRect(0, 0, 512, 512);
    // Grain
    for (let i = 0; i < 26000; i++) {
      const v = Math.random();
      const a = Math.random() * 0.16;
      ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
      const s = Math.random() * 2 + 0.4;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
    }
    // Patches
    for (let i = 0; i < 24; i++) {
      const g = ctx.createRadialGradient(
        Math.random() * 512, Math.random() * 512, 4,
        Math.random() * 512, Math.random() * 512, 60 + Math.random() * 90
      );
      g.addColorStop(0, 'rgba(0,0,0,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
    }
    // Faint tire racing line wear
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(120, 0, 45, 512);
    ctx.fillRect(340, 0, 45, 512);
    // Cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      let x = Math.random() * 512, y = Math.random() * 512;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += (Math.random() - 0.5) * 30;
        y += Math.random() * 22;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

export function asphaltRoughness() {
  return cached('asphaltRough', () => {
    const { c, ctx } = canvas2d(256, 256);
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const g = 130 + Math.random() * 110;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    return tex(c, { srgb: false });
  });
}

export function curbTexture(aHex, bHex) {
  return cached('curb' + aHex + bHex, () => {
    const { c, ctx } = canvas2d(128, 128);
    const cols = [cssColor(aHex), cssColor(bHex)];
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = cols[i % 2];
      ctx.fillRect(0, i * 16, 128, 16);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 800; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    return tex(c, { repeat: [1, 1] });
  });
}

export function checkerTexture() {
  return cached('checker', () => {
    const { c, ctx } = canvas2d(512, 128);
    const size = 32;
    for (let y = 0; y < 128; y += size) {
      for (let x = 0; x < 512; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2) ? '#f7f7f7' : '#101018';
        ctx.fillRect(x, y, size, size);
      }
    }
    return tex(c, { repeat: [1, 1] });
  });
}

export function whiteLineTexture() {
  return cached('whiteLine', () => {
    const { c, ctx } = canvas2d(64, 64);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    for (let i = 0; i < 300; i++) ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    return tex(c);
  });
}

export function groundTexture(theme, baseHex) {
  return cached('ground' + theme + baseHex, () => {
    const { c, ctx } = canvas2d(512, 512);
    ctx.fillStyle = cssColor(baseHex);
    ctx.fillRect(0, 0, 512, 512);
    const isSnow = theme === 'dawn';
    const isDesert = theme === 'canyon';
    const isNight = theme === 'night';
    for (let i = 0; i < 5000; i++) {
      const a = Math.random() * (isSnow ? 0.16 : 0.22);
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      const s = Math.random() * 3 + 0.5;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
    }
    if (isDesert) {
      ctx.strokeStyle = 'rgba(80,35,20,0.18)';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        let x = Math.random() * 512, y = Math.random() * 512;
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (Math.random() - 0.5) * 50;
          y += (Math.random() - 0.5) * 50;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    if (isSnow) {
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = 'rgba(120,150,190,0.12)';
        ctx.beginPath();
        ctx.ellipse(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 60, 10 + Math.random() * 25, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (isNight) {
      for (let i = 0; i < 40; i++) {
        const g = ctx.createRadialGradient(Math.random() * 512, Math.random() * 512, 2, Math.random() * 512, Math.random() * 512, 50);
        g.addColorStop(0, 'rgba(70,60,120,0.10)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 512);
      }
    }
    return tex(c, { repeat: [1, 1] });
  });
}

export function softCircleTexture() {
  return cached('softCircle', () => {
    const { c, ctx } = canvas2d(128, 128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return tex(c, { wrap: false });
  });
}

export function smokeTexture() {
  return cached('smoke', () => {
    const { c, ctx } = canvas2d(128, 128);
    for (let i = 0; i < 16; i++) {
      const x = 64 + (Math.random() - 0.5) * 46;
      const y = 64 + (Math.random() - 0.5) * 46;
      const r = 16 + Math.random() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.30)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    return tex(c, { wrap: false });
  });
}

export function cloudTexture() {
  return cached('cloud', () => {
    const { c, ctx } = canvas2d(512, 256);
    for (let i = 0; i < 28; i++) {
      const x = 90 + Math.random() * 330;
      const y = 120 + Math.random() * 70;
      const r = 30 + Math.random() * 80;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
    }
    return tex(c, { wrap: false });
  });
}

export function envTexture(theme, variant = 'main') {
  return cached('env' + theme + variant, () => {
    const { c, ctx } = canvas2d(1024, 512);
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    const palettes = {
      sunset: ['#2a1c52', '#8a3a72', '#ff7a5c', '#ffd39e', '#4c3a30', '#1c1a24'],
      night: ['#05040f', '#0b0a24', '#241d4a', '#443366', '#0b0d1a', '#05060c'],
      canyon: ['#3a5f8a', '#7a99b8', '#e5c4a2', '#e09a68', '#6d4630', '#2a1b18'],
      dawn: ['#12234a', '#3b5d92', '#d9a5c4', '#ffd7df', '#6f829e', '#2a3145']
    };
    const p = palettes[theme] || palettes.sunset;
    grad.addColorStop(0, p[0]);
    grad.addColorStop(0.32, p[1]);
    grad.addColorStop(0.52, p[2]);
    grad.addColorStop(0.6, p[3]);
    grad.addColorStop(0.66, p[4]);
    grad.addColorStop(0.75, p[5]);
    grad.addColorStop(1, '#08070c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    // Sun / moon hotspot for reflections
    const sunX = theme === 'canyon' ? 300 : theme === 'dawn' ? 760 : 220;
    const sunY = theme === 'night' ? 190 : 290;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, theme === 'night' ? 90 : 170);
    glow.addColorStop(0, theme === 'night' ? 'rgba(180,200,255,0.95)' : 'rgba(255,246,220,1)');
    glow.addColorStop(0.08, theme === 'night' ? 'rgba(140,170,255,0.6)' : 'rgba(255,220,170,0.9)');
    glow.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1024, 512);

    if (theme === 'night') {
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 280, 1.5, 1.5);
      }
      // neon city glow strips
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(0,229,255,0.35)' : 'rgba(255,46,136,0.3)';
        ctx.fillRect(i * 130, 330 + Math.random() * 40, 60, 3);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function textTexture(text, opts = {}) {
  const {
    w = 1024, h = 256, bg = 'transparent', color = '#ffffff',
    font = '900 120px Orbitron, sans-serif', accent = null, sub = ''
  } = opts;
  const key = 'text' + text + w + h + bg + color + font + accent + sub;
  return cached(key, () => {
    const { c, ctx } = canvas2d(w, h);
    if (bg !== 'transparent') {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (accent) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, w - 16, h - 16);
    }
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.fillText(text, w / 2, h / 2 - (sub ? h * 0.08 : 0), w * 0.94);
    if (sub) {
      ctx.font = '500 38px Rajdhani, sans-serif';
      ctx.fillStyle = accent || color;
      ctx.fillText(sub.toUpperCase(), w / 2, h * 0.8);
    }
    return tex(c, { wrap: false });
  });
}

export function buildingTextures(theme) {
  return cached('building' + theme, () => {
    const { c, ctx } = canvas2d(256, 512);
    const map = ctx;
    map.fillStyle = theme === 'night' ? '#101223' : '#2a3444';
    map.fillRect(0, 0, 256, 512);
    const { c: ec, ctx: ectx } = canvas2d(256, 512);
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, 256, 512);
    const colors = theme === 'night'
      ? ['#3df5ff', '#ff4f9a', '#ffd166', '#b76bff']
      : ['#7c93a8', '#5e7488', '#a8b7c4'];
    for (let y = 18; y < 490; y += 34) {
      for (let x = 14; x < 240; x += 30) {
        const lit = Math.random() < (theme === 'night' ? 0.56 : 0.28);
        const col = colors[(Math.random() * colors.length) | 0];
        if (lit) {
          ectx.fillStyle = col;
          ectx.globalAlpha = 0.55 + Math.random() * 0.45;
          ectx.fillRect(x, y, 18, 22);
          ectx.globalAlpha = 1;
          map.fillStyle = col;
          map.globalAlpha = 0.5;
          map.fillRect(x, y, 18, 22);
          map.globalAlpha = 1;
        } else {
          map.fillStyle = 'rgba(0,0,0,0.35)';
          map.fillRect(x, y, 18, 22);
        }
      }
    }
    return {
      map: tex(c, { repeat: [1, 1] }),
      emissiveMap: tex(ec, { repeat: [1, 1] })
    };
  });
}

export function adBoardTexture(theme, text) {
  return cached('ad' + theme + text, () => {
    const { c, ctx } = canvas2d(512, 256);
    const palettes = {
      sunset: ['#2a0d2e', '#ff2e88', '#ffd166'],
      night: ['#060a18', '#00e5ff', '#ff2e88'],
      canyon: ['#2a1108', '#ff8a3d', '#ffe3b0'],
      dawn: ['#101a30', '#7dffea', '#ff8fb1']
    };
    const [bg, a, b] = palettes[theme] || palettes.sunset;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = a;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 492, 236);
    ctx.fillStyle = b;
    ctx.font = '900 74px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 112);
    ctx.fillStyle = a;
    ctx.font = '600 30px Rajdhani, sans-serif';
    ctx.fillText('APEX DRIFT SERIES', 256, 190);
    return tex(c, { wrap: false });
  });
}

export function startGantryTexture(theme) {
  return cached('gantry' + theme, () => {
    const { c, ctx } = canvas2d(1024, 320);
    ctx.fillStyle = '#080a12';
    ctx.fillRect(0, 0, 1024, 320);
    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    const colors = {
      sunset: ['#ff2e88', '#ffd166'],
      night: ['#00e5ff', '#ff2e88'],
      canyon: ['#ff8a3d', '#ffd166'],
      dawn: ['#ff5d8f', '#7dffea']
    };
    const [a, b] = colors[theme] || colors.sunset;
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 14);
    ctx.fillRect(0, 306, 1024, 14);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 150px Orbitron, sans-serif';
    ctx.fillText('APEX DRIFT', 512, 175);
    ctx.fillStyle = b;
    ctx.font = '600 42px Rajdhani, sans-serif';
    ctx.fillText('SUNSET  ·  GRAND  ·  PRIX', 512, 250);
    // corner checker motif
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#101018';
      ctx.fillRect(i * 20, 0, 20, 14);
      ctx.fillStyle = i % 2 ? '#101018' : '#ffffff';
      ctx.fillRect(1024 - 160 + i * 20, 306, 20, 14);
    }
    return tex(c, { wrap: false });
  });
}

export function starTexture() {
  return cached('star', () => {
    const { c, ctx } = canvas2d(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(220,235,255,0.8)');
    g.addColorStop(1, 'rgba(160,190,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return tex(c, { wrap: false });
  });
}

export function numberDecalTexture(number, accent) {
  return cached('num' + number + accent, () => {
    const { c, ctx } = canvas2d(256, 256);
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(6,8,16,0.9)';
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 130px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 128, 136);
    return tex(c, { wrap: false });
  });
}

export function flagTexture() {
  return checkerTexture();
}
