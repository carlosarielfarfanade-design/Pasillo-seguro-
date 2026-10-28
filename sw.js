/* Pasillo Seguro · service worker: funciona sin internet tras la primera carga */
const CACHE = 'pasillo-seguro-v30';
const ARCHIVOS = [
  './', './index.html', './styles.css', './app.js', './crypto.js', './voz.js', './protocolos.js', './emergencia.js', './evidencia.js', './lib/qrcode.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './lib/html5-qrcode.min.js', './lib/jspdf.umd.min.js', './lib/jspdf.plugin.autotable.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ARCHIVOS.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.url.includes('script.google.com') || req.url.includes('/datos/')) return; // el servidor nunca se cachea
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const red = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return res;
      }).catch(() => hit);
      return hit || red;
    })
  );
});
