/* =========================================================================
   Raydn FieldCalc  ::  fc-ui.js
   Small DOM helpers and the form components. Everything is built to be
   thumb sized and readable in daylight on a phone.
   ========================================================================= */
(function (global) {
  'use strict';
  var FC = global.FC;

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'style') e.setAttribute('style', v);
      else e.setAttribute(k, v);
    });
    (Array.isArray(kids) ? kids : (kids === undefined || kids === null ? [] : [kids]))
      .forEach(function (k) {
        if (k === null || k === undefined || k === false) return;
        e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
      });
    return e;
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function fmt(n, d) {
    if (n === null || n === undefined || !isFinite(n)) return '';
    return Number(n).toLocaleString('en-CA', { minimumFractionDigits: d || 0, maximumFractionDigits: d === undefined ? 0 : d });
  }

  var toastT = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = el('div', { class: 'toast', id: 'toast' }); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* --------------------------- basic fields --------------------------- */

  function field(opts) {
    // {label, value, type, placeholder, hint, unit, req, options, rows, onchange, inputmode}
    var input;
    if (opts.options) {
      input = el('select');
      var opts0 = [{ v: '', l: opts.placeholder || 'Choose one' }].concat(
        opts.options.map(function (o) {
          return typeof o === 'string' ? { v: o, l: o } : { v: o.v !== undefined ? o.v : o.k, l: o.l !== undefined ? o.l : o.label };
        })
      );
      opts0.forEach(function (o) {
        input.appendChild(el('option', { value: o.v, selected: String(opts.value) === String(o.v) ? 'selected' : null }, o.l));
      });
    } else if (opts.rows) {
      input = el('textarea', { placeholder: opts.placeholder || '', rows: opts.rows });
      input.value = opts.value === undefined || opts.value === null ? '' : opts.value;
    } else {
      input = el('input', {
        type: opts.type || 'text',
        placeholder: opts.placeholder || '',
        inputmode: opts.inputmode || (opts.type === 'number' ? 'decimal' : null),
        step: opts.type === 'number' ? (opts.step || 'any') : null
      });
      input.value = opts.value === undefined || opts.value === null ? '' : opts.value;
    }
    input.addEventListener('input', function () { if (opts.oninput) opts.oninput(input.value, input); });
    input.addEventListener('change', function () { if (opts.onchange) opts.onchange(input.value, input); });

    var wrap = opts.unit && !opts.options && !opts.rows
      ? el('div', { class: 'wrap' }, [input, el('span', { class: 'unit', text: opts.unit })])
      : input;

    return el('label', { class: 'fld' }, [
      opts.label ? el('span', { class: 'lab', html: esc(opts.label) + (opts.req ? '<i class="req">*</i>' : '') }) : null,
      wrap,
      opts.hint ? el('span', { class: 'hint', text: opts.hint }) : null
    ]);
  }

  /* Evidence backed field. Value plus source, status and a reference. */
  function evField(opts) {
    // {label, obj, unit, req, hint, type, placeholder, options, onchange}
    var o = opts.obj;
    if (!o || typeof o !== 'object') return field(opts);
    var pill = el('span', { class: 'pill-ev' });

    function paint() {
      var s = o.evidenceStatus || 'Pending';
      pill.textContent = s;
      pill.className = 'pill-ev ' + (s === 'Verified' ? 'v' : s === 'Cannot verify' ? 'c' : s === 'Not applicable' ? '' : 'p');
    }
    paint();

    var main = field({
      label: opts.label, value: o.value, unit: opts.unit || o.unit, req: opts.req,
      type: opts.type, placeholder: opts.placeholder, options: opts.options, hint: opts.hint,
      oninput: function (v) { o.value = v; FC.stampEntry(o); if (opts.onchange) opts.onchange(); },
      onchange: function (v) { o.value = v; FC.stampEntry(o); if (opts.onchange) opts.onchange(); }
    });

    var srcSel = el('select');
    [''].concat(FC.SOURCES).forEach(function (s) {
      srcSel.appendChild(el('option', { value: s, selected: o.source === s ? 'selected' : null }, s || 'Where did it come from'));
    });
    srcSel.addEventListener('change', function () { o.source = srcSel.value; FC.stampEntry(o); if (opts.onchange) opts.onchange(); });

    var stSel = el('select');
    FC.EV_STATUS.forEach(function (s) {
      stSel.appendChild(el('option', { value: s, selected: (o.evidenceStatus || 'Pending') === s ? 'selected' : null }, s));
    });
    stSel.addEventListener('change', function () {
      o.evidenceStatus = stSel.value; FC.stampEntry(o); paint(); if (opts.onchange) opts.onchange();
    });

    main.appendChild(el('div', { class: 'evstrip' }, [srcSel, stSel, pill]));
    return main;
  }

  /* --------------------------- controls --------------------------- */

  function seg(opts) {
    // {value, options:[{v,l}], onpick}
    var box = el('div', { class: 'seg' });
    opts.options.forEach(function (o) {
      var v = typeof o === 'string' ? o : o.v;
      var l = typeof o === 'string' ? o : o.l;
      var b = el('button', {
        type: 'button', class: String(opts.value) === String(v) ? 'on' : '', text: l,
        onclick: function () {
          Array.prototype.forEach.call(box.children, function (c) { c.className = ''; });
          b.className = 'on';
          opts.onpick(v);
        }
      });
      box.appendChild(b);
    });
    return box;
  }

  function chips(opts) {
    // {values:[], options:[{k,label}], multi, onpick}
    var box = el('div', { class: 'chips' });
    opts.options.forEach(function (o) {
      var k = o.k !== undefined ? o.k : o;
      var l = o.label !== undefined ? o.label : o;
      var on = opts.multi ? opts.values.indexOf(k) >= 0 : String(opts.values) === String(k);
      var c = el('button', {
        type: 'button', class: 'chip' + (on ? ' on' : ''), text: l,
        onclick: function () {
          if (opts.multi) {
            var i = opts.values.indexOf(k);
            if (i >= 0) { opts.values.splice(i, 1); c.classList.remove('on'); }
            else { opts.values.push(k); c.classList.add('on'); }
          } else {
            Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('on'); });
            c.classList.add('on');
          }
          opts.onpick(k);
        }
      });
      box.appendChild(c);
    });
    return box;
  }

  function card(title, num, kids, opts) {
    opts = opts || {};
    return el('section', { class: 'card' }, [
      title ? el('h3', {}, [num ? el('span', { class: 'n', text: num }) : null, title]) : null,
      opts.sub ? el('p', { class: 'mut', text: opts.sub }) : null,
      el('div', { class: 'bd' }, kids)
    ]);
  }

  function acc(title, badge, badgeTone, kids, open) {
    return el('details', { class: 'card acc', open: open ? 'open' : null }, [
      el('summary', {}, [
        el('h3', { style: 'font-size:16px;margin:0', text: title }),
        badge ? el('span', { class: 'badge ' + (badgeTone || ''), text: badge }) : null,
        el('span', { class: 'caret', text: '▾' })
      ]),
      el('div', { class: 'bd' }, kids)
    ]);
  }

  function note(title, body, tone) {
    return el('div', { class: 'note ' + (tone || '') }, [
      title ? el('b', { text: title }) : null,
      el('span', { text: body })
    ]);
  }

  function band(tone, key, headline, reasons, why) {
    return el('div', { class: 'band ' + (tone || '') }, [
      el('span', { class: 'k', text: key }),
      headline ? el('div', { class: 'big', text: headline }) : null,
      why ? el('p', { class: 'why', text: why }) : null,
      (reasons && reasons.length)
        ? el('ul', {}, reasons.map(function (r) { return el('li', { text: r }); }))
        : null
    ]);
  }

  function ring(pct, title, sub) {
    var C = 2 * Math.PI * 24;
    var off = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
    var colour = pct >= 100 ? '#4ade80' : pct >= 60 ? '#f5a524' : '#8a94a6';
    var svg = '<svg width="56" height="56" viewBox="0 0 56 56">' +
      '<circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="6"/>' +
      '<circle cx="28" cy="28" r="24" fill="none" stroke="' + colour + '" stroke-width="6" stroke-linecap="round" ' +
      'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>';
    return el('div', { class: 'prog' }, [
      el('div', { class: 'ring', html: svg + '<b>' + Math.round(pct) + '%</b>' }),
      el('div', { class: 'tx' }, [el('b', { text: title }), el('span', { text: sub })])
    ]);
  }

  function table(head, rows, opts) {
    opts = opts || {};
    return el('div', { class: 'scrollx' }, el('table', { class: 'tbl' }, [
      el('thead', {}, el('tr', {}, head.map(function (h) {
        return el('th', { class: (typeof h === 'object' && h.num) ? 'num' : '', text: typeof h === 'object' ? h.l : h });
      }))),
      el('tbody', {}, rows.map(function (r) {
        return el('tr', { class: r.cls || '' }, (r.cells || r).map(function (c) {
          if (c && typeof c === 'object' && !c.nodeType) {
            return el('td', { class: c.num ? 'num' : '' }, [
              document.createTextNode(String(c.t === undefined ? '' : c.t)),
              c.sub ? el('span', { class: 'rule', text: c.sub }) : null
            ]);
          }
          return el('td', {}, c && c.nodeType ? c : String(c === undefined || c === null ? '' : c));
        }));
      }))
    ]));
  }

  /* --------------------------- photo capture --------------------------- */

  function downscale(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1400;
        var w = img.width, h = img.height;
        if (w > max || h > max) { var s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(c.toDataURL('image/jpeg', 0.7)); }
        catch (e) { cb(fr.result); }
      };
      img.onerror = function () { cb(fr.result); };
      img.src = fr.result;
    };
    fr.onerror = function () { cb(null); };
    fr.readAsDataURL(file);
  }

  global.UI = {
    el: el, esc: esc, clear: clear, fmt: fmt, toast: toast,
    field: field, evField: evField, seg: seg, chips: chips,
    card: card, acc: acc, note: note, band: band, ring: ring, table: table,
    downscale: downscale
  };
})(window);
