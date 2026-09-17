/* Raydn FieldCalc: durable storage.

   Three tiers, best first, each one checked at runtime rather than assumed:

     1. localStorage  for the job records. Survives tab close, app close,
        phone restart. Small, synchronous, reliable.
     2. IndexedDB     for photo images. Photos are megabytes. They do not
        belong in localStorage and they are the thing the old build lost.
     3. window.name   last resort only, if a browser has both of the above
        switched off. Survives a reload, not a tab close, and the app says so
        out loud on the home screen rather than pretending.

   Nothing here ever throws into the app. Every call reports what it actually
   managed to do, so the UI can tell the truth about where the data is. */
(function (global) {
  'use strict';

  var KEY = 'raydn.fieldcalc.state.v2';
  var DB = 'raydn-fieldcalc';
  var STORE = 'photos';

  /* ---------------- tier 1, key value ---------------- */
  var ls = null;
  try {
    var probe = global.localStorage;
    probe.setItem('raydn.probe', '1');
    probe.removeItem('raydn.probe');
    ls = probe;
  } catch (e) { ls = null; }

  /* ---------------- tier 2, photo blobs ---------------- */
  var idbOK = false;
  try { idbOK = !!global.indexedDB; } catch (e2) { idbOK = false; }
  var dbp = null;

  function open() {
    if (!idbOK) return Promise.reject(new Error('no photo store'));
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var rq = global.indexedDB.open(DB, 1);
      rq.onupgradeneeded = function () {
        var d = rq.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error || new Error('photo store blocked')); };
      rq.onblocked = function () { rej(new Error('photo store blocked')); };
    });
    dbp.catch(function () { dbp = null; idbOK = false; });
    return dbp;
  }

  function tx(mode, fn) {
    return open().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, mode);
        var out = fn(t.objectStore(STORE));
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error || new Error('photo write aborted')); };
      });
    });
  }

  var Disk = {
    /* What the app is actually running on. The home screen prints this. */
    tier: function () {
      if (ls && idbOK) return { key: 'full', label: 'Saved on this phone', durable: true };
      if (ls) return { key: 'nophotos', label: 'Saved on this phone, photos in memory only', durable: true };
      return { key: 'tab', label: 'Saved in this browser tab only', durable: false };
    },

    saveState: function (obj) {
      var s = JSON.stringify(obj);
      if (ls) {
        try { ls.setItem(KEY, s); return true; }
        catch (e) {
          /* Quota. Drop the oldest approved jobs rather than losing today's. */
          try {
            var trimmed = JSON.parse(s);
            trimmed.jobs = trimmed.jobs.slice(0, 12);
            ls.setItem(KEY, JSON.stringify(trimmed));
            return true;
          } catch (e2) { /* fall through to the tab */ }
        }
      }
      try { global.name = 'RAYDN_FIELDCALC::' + s; return true; }
      catch (e3) { return false; }
    },

    loadState: function () {
      if (ls) {
        try {
          var raw = ls.getItem(KEY);
          if (raw) return JSON.parse(raw);
        } catch (e) { /* fall through */ }
      }
      try {
        var n = global.name || '';
        if (n.indexOf('RAYDN_FIELDCALC::') === 0) return JSON.parse(n.slice(17));
      } catch (e2) { /* nothing stored */ }
      return null;
    },

    clearState: function () {
      try { if (ls) ls.removeItem(KEY); } catch (e) {}
      try { global.name = ''; } catch (e2) {}
    },

    /* ---- photos ---- */
    photosAvailable: function () { return idbOK; },

    putPhoto: function (jobId, key, dataUrl) {
      return tx('readwrite', function (st) { st.put(dataUrl, jobId + '::' + key); })
        .then(function () { return true; })
        .catch(function () { return false; });
    },

    delPhoto: function (jobId, key) {
      return tx('readwrite', function (st) { st.delete(jobId + '::' + key); })
        .then(function () { return true; }).catch(function () { return false; });
    },

    delJobPhotos: function (jobId) {
      return tx('readwrite', function (st) {
        var rq = st.openCursor();
        rq.onsuccess = function () {
          var c = rq.result;
          if (!c) return;
          if (String(c.key).indexOf(jobId + '::') === 0) c.delete();
          c.continue();
        };
      }).then(function () { return true; }).catch(function () { return false; });
    },

    /* Returns { 'photoKey': dataUrl, ... } for one job. */
    getJobPhotos: function (jobId) {
      var out = {};
      return tx('readonly', function (st) {
        var rq = st.openCursor();
        rq.onsuccess = function () {
          var c = rq.result;
          if (!c) return;
          var k = String(c.key);
          if (k.indexOf(jobId + '::') === 0) out[k.slice(jobId.length + 2)] = c.value;
          c.continue();
        };
      }).then(function () { return out; }).catch(function () { return {}; });
    },

    /* Rough bytes used by photos, so the app can warn before it hits a wall. */
    usage: function () {
      if (!global.navigator || !global.navigator.storage || !global.navigator.storage.estimate) {
        return Promise.resolve(null);
      }
      return global.navigator.storage.estimate()
        .then(function (e) { return { used: e.usage || 0, quota: e.quota || 0 }; })
        .catch(function () { return null; });
    },

    /* Ask the browser to stop evicting us under storage pressure. */
    persist: function () {
      if (!global.navigator || !global.navigator.storage || !global.navigator.storage.persist) {
        return Promise.resolve(false);
      }
      return global.navigator.storage.persisted()
        .then(function (already) { return already ? true : global.navigator.storage.persist(); })
        .catch(function () { return false; });
    }
  };

  global.FCDisk = Disk;
})(window);
