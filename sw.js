// ============================================================
// sw.js — Service worker: guarda os arquivos do app no celular
// para ele abrir rápido e funcionar sem internet.
// Ao publicar uma versão nova, aumente o número em VERSAO.
// ============================================================

const VERSAO = '1.1.0';
const CACHE = `ditado-${VERSAO}`;
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilo.css',
  './js/app.js',
  './js/db.js',
  './js/texto.js',
  './js/voz.js',
  './js/ui.js',
  './js/editor.js',
  './js/historias.js',
  './js/dicionario.js',
  './js/ajustes.js',
  './js/exportar.js',
  './icons/icone.svg',
  './icons/icone-192.png',
  './icons/icone-512.png',
  './icons/icone-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (ev) => {
  // cache: 'reload' busca da internet (não do cache do navegador), para a versão nova vir completa.
  ev.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('ditado-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Responde com a cópia guardada e, ao mesmo tempo, busca a versão
// mais nova na internet para a próxima vez.
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(req, { ignoreSearch: true });
    const daRede = fetch(req)
      .then((resp) => {
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      })
      .catch(() => null);
    if (guardada) {
      ev.waitUntil(daRede);
      return guardada;
    }
    const resp = await daRede;
    if (resp) return resp;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  })());
});
