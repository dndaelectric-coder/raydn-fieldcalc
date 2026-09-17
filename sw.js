/* Raydn FieldCalc service worker.
   The job is simple: the app has to open in a mechanical room with no signal.
   Cache the shell on install, serve it from cache first, and quietly refresh
   it in the background when there is a connection. Job data never goes near
   this cache. It lives on the device, handled by fc-disk.js. */
var CACHE = 'fieldcalc-v2-0-2';
var SHELL = [
  './', './index.html', './app.css',
  './engine.js', './fc-disk.js', './fc-store.js', './fc-gates.js',
  './fc-ui.js', './fc-app.js', './fc-views.js', './fc-share.js', './fc-send.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () { /* one missing file must not sink the install */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // never cache a job log post
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // never cache Google

  e.respondWith(
    caches.match(req).then(function (hit) {
      var live = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || live;
    })
  );
});
