// アプリ更新時は VERSION と index.html の ?v= を変更するとキャッシュが入れ替わる
const VERSION = 'v3';
const CACHE = 'slot-tracker-' + VERSION;
const ASSETS = [
  './', './index.html', './style.css?v=3', './app.js?v=3', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => {
  // ブラウザのHTTPキャッシュ(GitHub Pagesは10分)を経由せず必ずサーバーから取得
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// ネット優先(HTTPキャッシュも毎回サーバーに確認)・オフライン時はキャッシュ
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
