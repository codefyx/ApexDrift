#!/usr/bin/env node
/**
 * Apex Drift local server.
 *
 *   node server.js            -> http://localhost:5173
 *   PORT=8080 node server.js  -> custom port
 *
 * Serves this folder over HTTP. No build step, no dependencies.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const START_PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm'
};

function headersFor(file, { noStore = false } = {}) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': '*'
  };

  if (noStore || ext === '.html' || ext === '.webmanifest') {
    headers['Cache-Control'] = 'no-cache, must-revalidate';
  } else if (ext === '.js' || ext === '.css' || ext === '.woff2') {
    headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
  } else {
    headers['Cache-Control'] = 'public, max-age=3600';
  }
  return headers;
}

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const normalized = path.posix.normalize(decoded);
  if (normalized.includes('..')) return null;

  const relative = normalized.replace(/^\/+/, '');
  const target = path.resolve(ROOT, relative);

  // Final guard: the resolved file must stay inside ROOT.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  return target;
}

async function statFile(file) {
  try {
    const st = await fsp.stat(file);
    return st;
  } catch {
    return null;
  }
}

async function sendFile(req, res, file, status = 200) {
  const st = await statFile(file);
  if (!st || !st.isFile()) return false;

  const noStore = /(?:sw\.js)$/.test(file);
  const headers = headersFor(file, { noStore });
  headers['Content-Length'] = String(st.size);
  headers['Last-Modified'] = st.mtime.toUTCString();

  if (noStore) {
    headers['Service-Worker-Allowed'] = '/';
  }

  if (req.method === 'HEAD') {
    res.writeHead(status, headers);
    res.end();
    return true;
  }

  res.writeHead(status, headers);
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  return true;
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  let target = safePath(req.url || '/');
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  let st = await statFile(target);

  // Directory -> index.html
  if (st && st.isDirectory()) {
    target = path.join(target, 'index.html');
    st = await statFile(target);
  }

  // Extensionless requests fall back to index.html only for "/".
  if (!st && (req.url === '/' || req.url === '')) {
    target = path.join(ROOT, 'index.html');
    st = await statFile(target);
  }

  if (st && st.isFile()) {
    const ok = await sendFile(req, res, target);
    if (ok) return;
  }

  // Friendly 404
  const fallback = path.join(ROOT, '404.html');
  if (await sendFile(req, res, fallback, 404)) return;

  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>Not found</title>
  <style>body{background:#05060e;color:#eef3ff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0}
  a{color:#2ff5ff}</style><div><h1>404</h1><p>That file is not on the grid.</p><a href="/">Back to Apex Drift</a></div>`);
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

function listen(port, attempts = 12) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      console.error('[server]', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal server error');
    });
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE' && attempts > 0) {
      console.log(`Port ${port} is busy, trying ${port + 1}…`);
      listen(port + 1, attempts - 1);
      return;
    }
    console.error(err);
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    console.log('');
    console.log('  APEX DRIFT — local server');
    console.log('  ─────────────────────────────────────────');
    console.log(`  Desktop:  http://localhost:${port}`);
    const lan = lanAddresses();
    if (lan.length) {
      console.log(`  Phone:    http://${lan[0]}:${port}   (same Wi-Fi)`);
    }
    console.log('');
    console.log('  PWA install needs localhost or HTTPS.');
    console.log('  Android via USB:  adb reverse tcp:' + port + ' tcp:' + port);
    console.log('  then open http://localhost:' + port + ' on the phone.');
    console.log('');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
  });
}

listen(START_PORT);
