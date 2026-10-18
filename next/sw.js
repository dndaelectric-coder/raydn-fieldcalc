/* Raydn FieldCalc service worker.
   The app has to open in a mechanical room with no signal, and it has to pick
   up a fix the moment there is signal. So: network first, and if the network
   has not answered in three seconds or is gone, the saved copy. Job data never
   goes near this cache. It lives on the device, handled by fc-disk.js.

   The same file serves the crew app at the root and the preview at /next/.
   Each one only ever reads and clears its own cache. */
var VERSION = '2-1-0';
var NEXT = /\/next\/sw\.js$/.test(self.location.pathname);
var PREFIX = NEXT ? 'fieldcalc-next-' : 'fieldcalc-v';
var CACHE = PREFIX + VERSION;
var SHELL = [
  './', './index.html', './app.css',
  './engine.js', './fc-disk.js', './fc-store.js', './fc-gates.js',
  './fc-ui.js', './fc-app.js', './fc-views.js', './fc-share.js', './fc-send.js', './fc-check.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './full/', './full/index.html', './full/app.css', './full/ui.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () { /* one missing file must not sink the install */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k.indexOf(PREFIX) === 0 && k !== CACHE ? caches.delete(k) : null;
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // never cache a job log post
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // never cache Google
  var scope = self.registration.scope;
  if (req.url.indexOf(scope) !== 0) return;               // not ours
  if (!NEXT && req.url.indexOf(scope + 'next/') === 0) return;   // the preview looks after itself

  e.respondWith(new Promise(function (resolve) {
    var done = false;
    function finish(r) { if (!done && r) { done = true; resolve(r); } }
    var saved = caches.open(CACHE).then(function (c) { return c.match(req, { ignoreSearch: true }); });
    var timer = setTimeout(function () { saved.then(finish); }, 3000);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      finish(res);
    }).catch(function () {
      clearTimeout(timer);
      saved.then(function (hit) {
        finish(hit || new Response('FieldCalc is offline and this file was not saved on the phone yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
      });
    });
  }));
});
