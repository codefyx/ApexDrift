/* Apex Drift service worker — offline-first shell for desktop + Android PWA. */
const VERSION = 'apexdrift-v1.1.0';
const CORE = `${VERSION}-core`;

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './assets/fonts/orbitron-700.woff2',
  './assets/fonts/orbitron-900.woff2',
  './assets/fonts/rajdhani-400.woff2',
  './assets/fonts/rajdhani-500.woff2',
  './assets/fonts/rajdhani-600.woff2',
  './assets/fonts/rajdhani-700.woff2',
  './assets/vendor/three.module.min.js',
  './assets/vendor/objects/Sky.js',
  './assets/vendor/postprocessing/EffectComposer.js',
  './assets/vendor/postprocessing/MaskPass.js',
  './assets/vendor/postprocessing/OutputPass.js',
  './assets/vendor/postprocessing/Pass.js',
  './assets/vendor/postprocessing/RenderPass.js',
  './assets/vendor/postprocessing/ShaderPass.js',
  './assets/vendor/postprocessing/UnrealBloomPass.js',
  './assets/vendor/shaders/CopyShader.js',
  './assets/vendor/shaders/LuminosityHighPassShader.js',
  './assets/vendor/shaders/OutputShader.js',
  './src/main.js',
  './src/state.js',
  './src/audio.js',
  './src/data/gameData.js',
  './src/data/tracks.js',
  './src/game/ai.js',
  './src/game/camera.js',
  './src/game/physics.js',
  './src/game/race.js',
  './src/render/car.js',
  './src/render/particles.js',
  './src/render/scenery.js',
  './src/render/showroom.js',
  './src/render/textures.js',
  './src/render/world.js',
  './src/ui/hud.js',
  './src/ui/input.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);
    // Cache files individually so one optional 404 cannot abort installation.
    await Promise.all(PRECACHE.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok || res.type === 'opaque') await cache.put(url, res);
      } catch {
        /* offline-only asset optional during first install */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch { /* ignore */ }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Navigations: network-first with cached shell fallback.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CORE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CORE);
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('Apex Drift is offline. Reconnect once to install the game cache.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  // Assets: cache-first, revalidate in background for HTML/CSS/JS.
  event.respondWith((async () => {
    const cache = await caches.open(CORE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) {
      if (/\.(?:html|css|js|webmanifest)$/.test(url.pathname)) {
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(req);
            if (fresh.ok) await cache.put(req, fresh);
          } catch { /* offline */ }
        })());
      }
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return new Response('', { status: 504, statusText: 'Offline asset unavailable' });
    }
  })());
});
