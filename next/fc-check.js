/* =========================================================================
   Raydn FieldCalc  ::  fc-check.js
   Live load check. Walk the house, tap in the 240 V loads, and watch where
   the service sits while you walk: today, after the job, and with the maybe
   later loads. Every number comes from the validated engine through
   FCGates.run, the same path the Guided Walkdown uses, so the two screens
   can never disagree about a house.

   Nothing on this screen declares anything compliant, sizes a conductor or a
   breaker, or promises a service size. Options are laid side by side for the
   Master Electrician. The crew sees the numbers and sends them to Dmitry.
   ========================================================================= */
(function (global) {
  'use strict';
  var FC = global.FC, G = global.FCGates, U = global.UI;
  var el = U.el;
  function go(v) { global.App.go(v); }

  var STAYING = 'Existing, staying', PROPOSED = 'Proposed', REMOVED = 'Existing, being removed', FUTURE = 'Future, not used for sizing';
  var STATES = [
    { v: STAYING, l: 'There now' }, { v: PROPOSED, l: 'Adding' },
    { v: REMOVED, l: 'Coming out' }, { v: FUTURE, l: 'Maybe later' }
  ];
  var SRCS = [{ v: 'plate', l: 'Nameplate' }, { v: 'breaker', l: 'Breaker' }, { v: 'est', l: 'Estimate' }];
  var SRC_TO = { plate: 'Nameplate photo', breaker: 'Field measurement', est: 'Assumption' };
  var AREA_SRC = [
    { k: 'Municipal property record', label: 'City or County record' },
    { k: 'Field measurement', label: 'Measured' },
    { k: 'Customer statement', label: 'Customer said' },
    { k: 'Assumption', label: 'Estimate' }
  ];
  var IL_YES = 'Interlocked, cannot run together', IL_NO = 'Not interlocked, both can run', IL_UNK = 'Unknown, needs verification';
  var SQFT = 10.7639;
  var BREAKERS = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 125];

  /* The quick add catalogue. Typical values only ever go in as an Estimate,
     tagged Assumption, and the flags list says so until a nameplate replaces
     them. Rare or wildly variable loads carry no typical value on purpose. */
  var QUICK = [
    { g: 'Kitchen and laundry', items: [
      { id: 'range', label: 'Range', kind: 'Range, cooktop or oven', unit: 'kW', typ: 12, hint: 'The plate is usually on the drawer frame or the back panel.' },
      { id: 'cooktop', label: 'Cooktop', kind: 'Range, cooktop or oven', unit: 'kW', typ: 7.5 },
      { id: 'oven', label: 'Wall oven', kind: 'Range, cooktop or oven', unit: 'kW', typ: 5 },
      { id: 'dryer', label: 'Dryer', kind: 'Dryer', unit: 'kW', typ: 5, hint: 'Electric only. A gas dryer is a 120 V plug and does not count here.' },
      { id: 'wh', label: 'Water heater', kind: 'Water heater', unit: 'kW', typ: 3, hint: 'Electric tank. A gas tank does not count here.' },
      { id: 'tankless', label: 'Tankless', kind: 'Tankless water heater', unit: 'kW', typ: 18 }
    ] },
    { g: 'Heating and cooling', items: [
      { id: 'baseboard', label: 'Baseboard heaters', kind: 'Baseboard or wall heaters', unit: 'W', typ: 1500, qty: true, hint: 'One card per heater size. Set how many under the number.' },
      { id: 'infloor', label: 'In-floor heat', kind: 'Electric in-floor heat', unit: 'W', typ: null, qty: true },
      { id: 'furnace', label: 'Electric furnace', kind: 'Furnace or air handler', unit: 'kW', typ: 15, hint: 'Electric furnace or duct heater. A gas furnace blower is not electric heat, leave it out.' },
      { id: 'strips', label: 'Backup heat strips', kind: 'Electric backup heat', unit: 'kW', typ: 10 },
      { id: 'gheater', label: 'Garage heater', kind: 'Garage or shop heater', unit: 'kW', typ: 5, qty: true },
      { id: 'ac', label: 'Air conditioner', kind: 'AC condenser', unit: 'A', typ: 24, state: PROPOSED, hint: 'Use the MCA off the condenser plate.' },
      { id: 'hp', label: 'Heat pump', kind: 'Heat pump outdoor unit', unit: 'A', typ: 30, state: PROPOSED, hint: 'Use the MCA off the outdoor unit plate.' }
    ] },
    { g: 'Garage and outside', items: [
      { id: 'ev', label: 'EV charger', kind: 'EVSE', unit: 'A', typ: 40, state: PROPOSED, hint: 'The highest setting the charger allows, not what the customer plans to use.' },
      { id: 'tub', label: 'Hot tub', kind: 'Hot tub or spa', unit: 'A', typ: 40, state: PROPOSED, hint: 'Amps off the spa pack label.' },
      { id: 'pool', label: 'Pool heater', kind: 'Pool heater', unit: 'kW', typ: null },
      { id: 'welder', label: 'Welder or shop', kind: 'Welder or shop equipment', unit: 'A', typ: null, hint: 'Rated input amps off the plate.' },
      { id: 'pump', label: 'Well or sump pump', kind: 'Sump, well or pump', unit: 'A', typ: null, hint: 'Well pumps are usually 240 V. Most sump pumps are 120 V and 1500 W or less, so they do not count.' }
    ] },
    { g: 'Other', items: [
      { id: 'steam', label: 'Steam shower', kind: 'Steam shower generator', unit: 'kW', typ: null },
      { id: 'other', label: 'Other 240 V load', kind: 'Other load', unit: 'A', typ: null }
    ] }
  ];
  function itemById(id) {
    var hit = null;
    QUICK.forEach(function (g) { g.items.forEach(function (it) { if (it.id === id) hit = it; }); });
    return hit;
  }
  function itemFor(L) {
    if (L.quick) { var x = itemById(L.quick); if (x) return x; }
    var hit = null;
    QUICK.forEach(function (g) {
      g.items.forEach(function (it) { if (!hit && it.kind === L.kind && (!L.label || it.label === L.label)) hit = it; });
    });
    return hit;
  }
  function uidL() { return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function newLoad(it) {
    return {
      id: uidL(), kind: it.kind, label: it.label, quick: it.id, state: it.state || STAYING,
      makeModel: FC.ev(''), voltage: '240',
      w: FC.ev('W'), va: FC.ev('VA'), amps: FC.ev('A'), mca: FC.ev('A'), mocp: FC.ev('A'),
      qty: 1, q: { unit: it.unit, src: '' }, evSet: '', location: '', notes: ''
    };
  }

  /* ---------------------------------------------------------------------
     One number per card. readQ works out what the card already holds, from
     whichever field governs in loadWatts. writeQ puts a typed number in the
     right field and clears only the fields that would outrank it, so a MCA
     and a MOCP recorded on the walkdown are not thrown away.
     --------------------------------------------------------------------- */
  var ORDER = ['w', 'va', 'amps', 'mca', 'mocp'];
  function readQ(L) {
    var q = L.q || {};
    var f = null, n = null, unit = q.unit || '';
    for (var i = 0; i < ORDER.length; i++) {
      if (L[ORDER[i]] && FC.evNum(L[ORDER[i]]) !== null) { f = ORDER[i]; n = FC.evNum(L[f]); break; }
    }
    if (f === 'w' || f === 'va') {
      if (unit !== 'W' && unit !== 'kW') unit = n >= 1000 ? 'kW' : 'W';
      if (unit === 'kW') n = n / 1000;
    } else if (f) unit = 'A';
    var src = q.src || '';
    if (f === 'mocp') src = 'breaker';
    else if (!src && f) {
      var s = L[f].source;
      src = s === 'Assumption' ? 'est' : s === 'Nameplate photo' ? 'plate' : '';
    }
    return { n: n, unit: unit || 'A', src: src, field: f };
  }
  function writeQ(L, n, unit, src) {
    if (src === 'breaker') unit = 'A';
    L.q = { unit: unit, src: src || '' };
    var target;
    if (src === 'breaker') target = 'mocp';
    else if (unit === 'A') target = (L.mca && FC.evNum(L.mca) !== null && !(L.amps && FC.evNum(L.amps) !== null)) ? 'mca' : 'amps';
    else target = 'w';
    /* A card made on this screen only ever holds one number, so everything
       else is cleared and nothing can quietly take over when the box is
       blanked. A walkdown card keeps its lower ranked readings, MCA and MOCP
       are evidence, and only the fields that would outrank the new number go. */
    var ti = ORDER.indexOf(target);
    ORDER.forEach(function (f, i) {
      if (!L[f] || typeof L[f] !== 'object') L[f] = FC.ev(f === 'w' ? 'W' : f === 'va' ? 'VA' : 'A');
      if (f === target) return;
      if ((i < ti || L.quick) && L[f].value !== '') L[f].value = '';
    });
    var o = L[target];
    if (n === null || !isFinite(n)) o.value = '';
    else o.value = String(unit === 'kW' ? Math.round(n * 1000) : n);
    if (src) o.source = SRC_TO[src];
    FC.stampEntry(o);
  }
  function andList(a) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function nfmt(n) { return n === null || n === undefined ? '' : String(Math.round(n * 1000) / 1000); }
  function a1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function kwTxt(w) { return (Math.round(w / 100) / 10).toLocaleString('en-CA') + ' kW'; }

  /* ---------------------------------------------------------------------
     View state. One object per open screen. Inputs write to the job and ask
     for a refresh. The refresh repaints the numbers without rebuilding the
     inputs, so the keyboard never drops while someone is typing.
     --------------------------------------------------------------------- */
  var V = null;
  var tRefresh = null, tSave = null;
  function saveSoon() {
    clearTimeout(tSave);
    tSave = setTimeout(function () { tSave = null; FC.touch(null); }, 400);
  }
  function flush() { if (tSave) { clearTimeout(tSave); tSave = null; FC.touch(null); } }
  function soon() {
    saveSoon();
    clearTimeout(tRefresh);
    tRefresh = setTimeout(refresh, 110);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  global.addEventListener('pagehide', flush);
  global.addEventListener('hashchange', flush);

  function seg(value, options, onpick, cls) {
    var box = el('div', { class: 'seg' + (cls ? ' ' + cls : ''), role: 'group' });
    options.forEach(function (o) {
      var on = String(value) === String(o.v);
      var b = el('button', {
        type: 'button', class: on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', text: o.l,
        onclick: function () {
          Array.prototype.forEach.call(box.children, function (c) { c.className = ''; c.setAttribute('aria-pressed', 'false'); });
          b.className = 'on'; b.setAttribute('aria-pressed', 'true');
          onpick(o.v);
        }
      });
      box.appendChild(b);
    });
    return box;
  }
  function sect(title, sub, kids, cls) {
    return el('section', { class: 'card ck-sec' + (cls ? ' ' + cls : '') }, [
      el('h3', { text: title }),
      sub ? el('p', { class: 'mut', text: sub }) : null,
      el('div', { class: 'bd' }, kids)
    ]);
  }
  function lab(t) { return el('span', { class: 'ck-lab0', text: t }); }

  /* =================================================================== view */
  function vCheck() {
    var j = FC.active();
    if (!j) return go('home');
    FC.migrate(j);
    var A = global.App;
    var isM = FC.isMaster();
    A.header('Live load check', FC.evVal(j.header.customer) || FC.evVal(j.header.address) || 'New load check', j.mode === 'check' ? 'home' : 'job');
    var body = U.clear(document.getElementById('fc-body'));
    body.classList.add('ck-wide');
    var y = V && V.job === j ? global.scrollY : 0;
    V = { job: j, isM: isM, cards: [] };

    var main = el('div', { class: 'ck-main' });
    var side = el('aside', { class: 'ck-side', id: 'ck-results', 'aria-live': 'polite' });
    body.appendChild(el('div', { class: 'ck-grid' }, [main, side]));
    V.side = side;

    main.appendChild(jobSect(j));
    main.appendChild(serviceSect(j));
    main.appendChild(houseSect(j));
    main.appendChild(loadsSect(j));
    V.ilWrap = el('div');
    main.appendChild(V.ilWrap);
    main.appendChild(moreSect(j));
    if (!isM) main.appendChild(A.fieldNotice());

    V.meter = el('div', { class: 'ck-meter' });
    A.bar([V.meter]);
    var bot = document.getElementById('fc-bottom');
    if (bot) bot.classList.add('ck-bot');
    refresh();
    if (y) global.scrollTo(0, y);
  }

  /* ------------------------------------------------------------ job */
  function jobSect(j) {
    var h = j.header;
    return sect('The job', null, [
      el('div', { class: 'row2' }, [
        U.field({ label: 'Customer', value: h.customer, placeholder: 'Name', oninput: function (v) { h.customer = v; saveSoon(); } }),
        U.field({ label: 'Address', value: h.address, placeholder: 'Civic address', oninput: function (v) { h.address = v; saveSoon(); } })
      ])
    ]);
  }

  /* ------------------------------------------------------------ service */
  function serviceSect(j) {
    var s = j.service, box = el('div'), other = { on: false };
    function setMain(v) {
      var o = s.mainBreaker;
      o.value = v === null || v === undefined ? '' : String(v);
      o.source = 'Field measurement';
      FC.stampEntry(o);
      soon();
    }
    function draw() {
      U.clear(box);
      var cur = String(FC.evVal(s.mainBreaker) || '');
      var std = ['60', '100', '125', '150', '200'];
      var isOther = other.on || (cur !== '' && std.indexOf(cur) < 0);
      box.appendChild(U.chips({
        values: isOther ? 'other' : cur, multi: false,
        options: std.map(function (x) { return { k: x, label: x + ' A' }; }).concat([{ k: 'other', label: 'Other' }]),
        onpick: function (k) {
          if (k === 'other') { other.on = true; draw(); var i = box.querySelector('input'); if (i) i.focus(); return; }
          other.on = false; setMain(k); draw();
        }
      }));
      if (isOther) {
        box.appendChild(el('div', { style: 'margin-top:10px' }, [U.field({
          label: 'Main breaker', type: 'number', unit: 'A', value: std.indexOf(cur) < 0 ? cur : '',
          oninput: function (v) { setMain(v); }
        })]));
      }
      if (!FC.evVal(s.mainBreaker) && FC.evNum(s.serviceRating)) {
        box.appendChild(el('p', { class: 'tiny', style: 'margin-top:8px', text: 'The walkdown has the service at ' + FC.evNum(s.serviceRating) + ' A. Tap the main breaker size to confirm it here.' }));
      }
    }
    draw();
    return sect('Main breaker', 'Read it off the main breaker handle. The bus rating on the panel label is a different number and goes under More from the panel.', [box]);
  }

  /* ------------------------------------------------------------ house */
  function houseSect(j) {
    var a = j.areas, c = j.check;
    var unitLbl = function () { return a.unit === 'sqft' ? 'sq ft' : 'm²'; };
    var aboveF, belowF, belowWrap = el('div'), heatHint = el('p', { class: 'tiny', style: 'margin-top:8px' });

    function conv(v, toM2) {
      var x = Number(v);
      if (v === '' || v === null || v === undefined || !isFinite(x)) return v;
      return String(toM2 ? Math.round(x / SQFT * 10) / 10 : Math.round(x * SQFT));
    }
    var unitSeg = seg(a.unit === 'sqft' ? 'sqft' : 'm2', [{ v: 'sqft', l: 'sq ft' }, { v: 'm2', l: 'm²' }], function (v) {
      if (v === a.unit) return;
      var toM2 = v === 'm2';
      a.above = conv(a.above, toM2); a.below = conv(a.below, toM2); a.exclBasement = conv(a.exclBasement, toM2);
      a.unit = v;
      drawAreas();
      soon();
    }, 'sm ck-unit');

    var areaBox = el('div');
    function drawAreas() {
      U.clear(areaBox);
      aboveF = U.field({
        label: 'Above grade living area', type: 'number', unit: unitLbl(), value: a.above,
        hint: 'Inside dimensions, Rule 8-110. The City or County property record is the number to use.',
        oninput: function (v) { a.above = v; soon(); }
      });
      areaBox.appendChild(aboveF);
      drawBelow();
    }
    function drawBelow() {
      U.clear(belowWrap);
      if (a.hasBasement !== 'Yes') return;
      belowF = U.field({
        label: 'Basement floor area', type: 'number', unit: unitLbl(), value: a.below,
        oninput: function (v) { a.below = v; soon(); }
      });
      belowWrap.appendChild(belowF);
    }
    function bClass() {
      if (a.hasBasement === 'No') return 'no';
      if (a.hasBasement !== 'Yes') return '';
      var h = Number(a.belowHeight) || 0;
      if (h > 0) return h > 1.8 ? 'over' : 'under';
      return a.belowClass || '';
    }
    var bSeg = seg(bClass(), [{ v: 'no', l: 'No basement' }, { v: 'over', l: 'Over 1.8 m' }, { v: 'under', l: '1.8 m or less' }], function (v) {
      var h = Number(a.belowHeight) || 0;
      if (v === 'no') { a.hasBasement = 'No'; a.belowClass = ''; a.belowHeight = ''; }
      else {
        a.hasBasement = 'Yes'; a.belowClass = v;
        if (h > 0 && ((v === 'over' && h <= 1.8) || (v === 'under' && h > 1.8))) a.belowHeight = '';
      }
      drawBelow();
      soon();
    }, 'sm');

    function paintHeat() {
      var t = '';
      if (c.heat === 'electric') t = 'Add the baseboards, the in-floor heat or the electric furnace under Heating and cooling. Electric heat is usually the biggest load in the house.';
      else if (c.heat === 'hp') t = 'Add the heat pump outdoor unit, and the backup heat strips if it has them.';
      else if (c.heat === 'fuel') t = 'Gas or propane heat. The furnace blower is a small motor and does not count as electric heat.';
      heatHint.textContent = t;
      heatHint.style.display = t ? '' : 'none';
    }
    var heatSeg = seg(c.heat, [{ v: 'fuel', l: 'Gas or propane' }, { v: 'electric', l: 'Electric' }, { v: 'hp', l: 'Heat pump' }], function (v) {
      c.heat = v; paintHeat(); soon();
    }, 'sm');
    paintHeat();
    drawAreas();

    return sect('The house', null, [
      el('div', { class: 'ck-hrow' }, [lab('Area unit'), unitSeg]),
      areaBox,
      lab('Where the area came from'),
      U.chips({
        values: a.aboveSource, multi: false, options: AREA_SRC,
        onpick: function (k) { a.aboveSource = k; soon(); }
      }),
      el('div', { style: 'height:14px' }),
      lab('Basement, lowest part of the ceiling to the floor'),
      bSeg,
      el('p', { class: 'tiny', style: 'margin:6px 0 10px', text: 'Over 1.8 m, 75 percent of the basement counts under Rule 8-110 c), finished or not.' }),
      belowWrap,
      lab('How the house is heated'),
      heatSeg,
      heatHint
    ]);
  }

  /* ------------------------------------------------------------ loads */
  function loadsSect(j) {
    var qa = el('div', { class: 'ck-qa' });
    var list = el('div', { class: 'ck-list' });
    var screens = el('div');
    V.list = list; V.qa = qa; V.screens = screens;

    function drawQuick() {
      U.clear(qa);
      QUICK.forEach(function (g) {
        var row = el('div', { class: 'ck-qrow' });
        g.items.forEach(function (it) {
          var n = j.loads.filter(function (L) { return itemFor(L) === it; }).length;
          row.appendChild(el('button', {
            type: 'button', class: 'chip ck-add', 'aria-label': 'Add ' + it.label,
            onclick: function () { addLoad(it); }
          }, [el('span', { class: 'ck-plus', 'aria-hidden': 'true', text: '+' }), it.label, n ? el('em', { text: String(n) }) : null]));
        });
        qa.appendChild(el('div', { class: 'ck-qg' }, [el('span', { class: 'ck-qh', text: g.g }), row]));
      });
    }
    V.drawQuick = drawQuick;
    drawQuick();

    j.loads.forEach(function (L) { list.appendChild(buildCard(L, false).node); });
    drawScreens(j, screens);

    V.floorNote = el('p', { class: 'tiny ck-floor', style: 'display:none' });
    return sect('The 240 V loads', 'Tap a load to add it, then type the number off the plate. The amps beside each load are what it does to the result.', [
      qa,
      el('div', { class: 'ck-lhd' }, [el('b', { text: 'On this house' }), el('span', { class: 'tiny', id: 'ck-count' })]),
      V.floorNote,
      list,
      screens
    ]);
  }

  function addLoad(it) {
    var j = V.job;
    var L = newLoad(it);
    j.loads.push(L);
    V.cards.forEach(function (c) { if (c.open && G.loadWatts(c.L)) { c.open = false; drawCard(c); } });
    var c = buildCard(L, true);
    V.list.appendChild(c.node);
    V.drawQuick();
    FC.touch('Load added, ' + it.label);
    refresh();
    setTimeout(function () {
      try { c.node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { c.node.scrollIntoView(); }
      var i = c.node.querySelector('.ck-in');
      if (i) i.focus({ preventScroll: true });
    }, 30);
  }

  function removeLoad(c) {
    var j = V.job, i = j.loads.indexOf(c.L);
    if (i >= 0) j.loads.splice(i, 1);
    V.cards = V.cards.filter(function (x) { return x !== c; });
    if (c.node.parentNode) c.node.parentNode.removeChild(c.node);
    if (c.L.id && j.photos && j.photos['load_' + c.L.id]) { FC.setPhoto('load_' + c.L.id, null); delete j.photos['load_' + c.L.id]; }
    V.drawQuick();
    FC.touch('Load removed, ' + G.nameOf(c.L));
    refresh();
  }

  function buildCard(L, open) {
    if (!L.id) L.id = uidL();
    if (L.qty === undefined) L.qty = 1;
    var c = { L: L, node: el('div', { class: 'ck-load' }), open: !!open, arm: false };
    V.cards.push(c);
    drawCard(c);
    return c;
  }

  function summaryLine(L) {
    var st = STATES.filter(function (s) { return s.v === (L.state || STAYING); })[0];
    var r = G.ratingText(L);
    return (r === 'no rating yet' ? 'No rating yet' : r) + ' · ' + (st ? st.l : 'There now');
  }

  function drawCard(c) {
    var L = c.L, n = U.clear(c.node), j = V.job;
    var it = itemFor(L);
    var q = readQ(L);
    c.unit = q.unit; c.src = q.src;
    n.className = 'ck-load' + (c.open ? ' open' : '') + (G.loadWatts(L) ? '' : ' empty');
    c.pill = el('span', { class: 'ck-pill' });
    c.sum = el('small', { text: summaryLine(L) });
    c.info = el('p', { class: 'ck-info' });
    n.appendChild(el('button', {
      type: 'button', class: 'ck-lh', 'aria-expanded': c.open ? 'true' : 'false',
      onclick: function () { c.open = !c.open; drawCard(c); paintCard(c, {}); }
    }, [
      el('span', { class: 'ck-ln' }, [el('b', { text: G.nameOf(L) }), c.sum]),
      c.pill,
      el('span', { class: 'ck-caret', 'aria-hidden': 'true', text: '▾' })
    ]));
    if (!c.open) { paintCard(c, {}); return; }

    var b = el('div', { class: 'ck-lb' });
    var inp = el('input', {
      class: 'ck-in', type: 'number', inputmode: 'decimal', step: 'any', min: '0',
      placeholder: it && it.typ ? 'Typical ' + it.typ : 'Rating',
      'aria-label': G.nameOf(L) + ' rating'
    });
    inp.value = q.n === null ? '' : nfmt(q.n);
    inp.addEventListener('input', function () {
      var v = inp.value.trim();
      writeQ(L, v === '' ? null : Number(v), c.unit, c.src);
      c.node.classList.toggle('empty', !G.loadWatts(L));
      soon();
    });
    var unitSeg = seg(c.unit, [{ v: 'W', l: 'W' }, { v: 'kW', l: 'kW' }, { v: 'A', l: 'A' }], function (v) {
      c.unit = v;
      if (c.src === 'breaker' && v !== 'A') c.src = '';
      var x = inp.value.trim();
      writeQ(L, x === '' ? null : Number(x), c.unit, c.src);
      drawCard(c); soon();
    }, 'sm ck-units');
    b.appendChild(el('div', { class: 'ck-nr' }, [inp, unitSeg]));

    b.appendChild(seg(c.src, SRCS, function (v) {
      c.src = v;
      if (v === 'breaker') c.unit = 'A';
      var x = inp.value.trim();
      writeQ(L, x === '' ? null : Number(x), c.unit, c.src);
      drawCard(c); soon();
    }, 'sm ck-srcs'));

    if (it && it.qty || G.heatClass(L) === 'room' || (Number(L.qty) || 1) > 1) {
      b.appendChild(el('div', { class: 'ck-qty' }, [
        el('span', { text: 'How many the same' }),
        (function () {
          var qi = el('input', { class: 'ck-in sm', type: 'number', inputmode: 'numeric', min: '1', step: '1', 'aria-label': 'How many' });
          qi.value = String(Number(L.qty) || 1);
          qi.addEventListener('input', function () {
            var v = Math.round(Number(qi.value));
            L.qty = v >= 1 ? v : 1;
            soon();
          });
          return qi;
        })()
      ]));
    }

    b.appendChild(seg(L.state || STAYING, STATES, function (v) {
      L.state = v; FC.touch(null); drawCard(c); refresh();
    }, 'sm ck-states'));

    if (/evse/i.test(L.kind || '')) {
      b.appendChild(lab('Charger setting'));
      b.appendChild(seg(L.evSet || '', [{ v: 'max', l: 'Highest setting' }, { v: 'inside', l: 'Set inside by an electrician' }, { v: '', l: 'Not sure' }], function (v) {
        L.evSet = v; soon();
      }, 'sm'));
      b.appendChild(el('p', { class: 'tiny', style: 'margin-top:6px', text: 'Alberta STANDATA 24-ECI-086 counts the highest setting the charger allows, unless the charger has a manual switch inside the equipment and an electrician sets it.' }));
    }

    b.appendChild(c.info);
    if (it && it.hint) b.appendChild(el('p', { class: 'tiny ck-hint', text: it.hint }));

    var acts = el('div', { class: 'ck-acts' });
    if (it && it.typ) {
      acts.appendChild(el('button', {
        type: 'button', class: 'btn sm gho', text: 'Use typical ' + it.typ + ' ' + it.unit,
        onclick: function () { writeQ(L, it.typ, it.unit, 'est'); drawCard(c); soon(); }
      }));
    }
    var rm = el('button', {
      type: 'button', class: 'btn sm gho ck-rm', text: 'Remove',
      onclick: function () {
        if (!c.arm) { c.arm = true; rm.textContent = 'Tap again to remove'; rm.classList.add('arm'); setTimeout(function () { c.arm = false; if (rm.isConnected) { rm.textContent = 'Remove'; rm.classList.remove('arm'); } }, 3000); return; }
        removeLoad(c);
      }
    });
    acts.appendChild(rm);
    b.appendChild(acts);
    b.appendChild(moreFor(c));
    n.appendChild(b);
    paintCard(c, {});
  }

  function moreFor(c) {
    var L = c.L, j = V.job, key = 'load_' + L.id;
    var rec = j.photos[key];
    var thumb = rec && rec.data ? el('img', { class: 'thumb', src: rec.data, alt: 'Nameplate, ' + G.nameOf(L) }) : null;
    var photoBtn = el('label', { class: 'btn sm cam' }, [
      rec && rec.data ? 'Retake nameplate photo' : 'Nameplate photo',
      el('input', {
        type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
        onchange: function (e) {
          var f = e.target.files[0]; if (!f) return;
          U.toast('Processing photo');
          U.downscale(f, function (d) {
            if (!d) return U.toast('Could not read that photo.');
            var r = { state: 'Captured', data: d, reason: '', owner: '', due: '', at: FC.nowISO(), by: FC.roleObj().name };
            FC.touch('Nameplate photo, ' + G.nameOf(L));
            FC.setPhoto(key, r).then(function (ok) {
              U.toast(ok ? 'Photo saved on this phone' : 'Photo could not be saved. Export the job now.');
              c.open = true; drawCard(c);
            });
          });
        }
      })
    ]);
    var det = el('details', { class: 'ck-more' }, [
      el('summary', { text: 'More: make, volts, photo, note' }),
      el('div', { class: 'ck-mbd' }, [
        U.field({ label: 'Make and model', value: FC.evVal(L.makeModel), oninput: function (v) { if (typeof L.makeModel !== 'object') L.makeModel = FC.ev(''); L.makeModel.value = v; FC.stampEntry(L.makeModel); saveSoon(); } }),
        lab('Volts on the plate'),
        seg(String(FC.evVal(L.voltage) || '240'), [{ v: '240', l: '240 V' }, { v: '208', l: '208 V' }, { v: '120', l: '120 V' }], function (v) { L.voltage = v; soon(); }, 'sm'),
        el('div', { style: 'height:12px' }),
        U.field({ label: 'Note', rows: 2, value: L.notes, placeholder: 'Where it is, what the plate said, anything odd', oninput: function (v) { L.notes = v; saveSoon(); } }),
        el('div', { class: 'ck-ph' }, [thumb, photoBtn])
      ])
    ]);
    return det;
  }

  /* What one load does to the number, and why. */
  function ruleNote(L, lw) {
    var j = V.job, k = (L.kind || '').toLowerCase(), hk = G.heatClass(L);
    if (k.indexOf('evse') >= 0) return 'An EV charger counts at 100 percent, Rule 8-200 1) a) vi).';
    if (/range|cooktop|oven/.test(k)) {
      var first = j.loads.filter(function (x) { return /range|cooktop|oven/i.test(x.kind || '') && G.inScope(x.state, 'after') && G.loadWatts(x); })[0];
      if (first && first !== L && G.inScope(L.state, 'after')) return 'A second cooking appliance counts as an other load at 25 percent. Dmitry confirms that split.';
      return 'A range counts 6,000 W plus 40 percent of anything over 12 kW, Rule 8-200 1) a) iv).';
    }
    if (/tub|spa|tankless|pool|steam/.test(k)) return 'Counts at 100 percent, Rule 8-200 1) a) v).';
    if (k.indexOf('solar inverter') >= 0 || k.indexOf('battery') >= 0) return 'A solar inverter or a battery is a source, not a load. Turn on the solar check under More from the panel.';
    if (k === 'garage or shop' || k === 'basement suite') return 'A subpanel is not one load. Add what it feeds as separate loads, and this card can come out.';
    if (hk === 'room') return 'Room heat on its own thermostats. All the room heat together takes the first 10 kW at 100 percent and the rest at 75 percent, Rule 62-118 3).';
    if (hk === 'central') return lw.w <= 1500 ? 'At 1500 W or less this reads as a blower, not electric heat.' : 'An electric furnace, duct heater or backup heat counts at 100 percent, Rule 62-118 4).';
    if (hk === 'ac') return 'Air conditioning counts at 100 percent, Rule 8-200 1) a) iii).';
    if (hk === 'hp') return 'A heat pump heats and cools, so it sits on both sides of the heating and cooling comparison.';
    if (lw.w <= 1500) return 'At 1500 W or less it is not counted. Rule 8-200 1) a) vii) only takes loads over 1500 W.';
    var hasRange = j.loads.some(function (x) { return /range|cooktop|oven/i.test(x.kind || '') && G.inScope(x.state, 'after') && G.loadWatts(x); });
    return hasRange ? 'With a range in the house, 25 percent of the nameplate, Rule 8-200 1) a) vii) A).'
      : 'No range in the house, so these loads take 100 percent of the first 6,000 W and 25 percent of the rest, Rule 8-200 1) a) vii) B).';
  }

  function paintCard(c, cache) {
    var L = c.L, j = V.job;
    var lw = G.loadWatts(L);
    var m = null;
    if (lw) { try { m = G.marginal(j, L, cache); } catch (e) { m = null; } }
    var txt, tone;
    if (!lw) { txt = 'No rating'; tone = 'warn'; }
    else if (!m) { txt = G.ratingText(L); tone = 'mut'; }
    else {
      var a = Math.abs(m.a) < 0.05 ? 0 : m.a;
      if (L.state === REMOVED) { txt = a ? 'frees ' + a1(a) + ' A' : '0 A'; tone = 'good'; }
      else if (L.state === FUTURE) { txt = '+' + a1(a) + ' A later'; tone = 'mut'; }
      else if (L.state === PROPOSED) { txt = '+' + a1(a) + ' A'; tone = 'amb'; }
      else { txt = a1(a) + ' A'; tone = ''; }
    }
    c.pill.textContent = txt;
    c.pill.className = 'ck-pill ' + tone;
    c.sum.textContent = summaryLine(L);
    if (!c.open) return;
    var bits = [];
    if (!lw) {
      var it = itemFor(L);
      bits.push('No rating yet, so the result reads at least. Type the number off the plate' + (it && it.typ ? ', or tap Use typical to keep moving.' : '.'));
    } else {
      bits.push('Reads as ' + U.fmt(lw.w) + ' W, ' + lw.basis + '.');
      bits.push(ruleNote(L, lw));
      if (lw.fromMocp) bits.push('A breaker is not a load. This reads high until the plate is read.');
      var bad = G.implausible(L);
      if (bad) bits.push('Check this one, it ' + bad);
      if (m && Math.abs(m.a) < 0.05 && m.floor && lw.w > 1500) bits.push('Right now the Rule 8-200 1) b) minimum is governing, so this load does not move the number yet.');
      else if (m && m.a >= 0.05 && m.floorBefore && L.state !== REMOVED) bits.push('Only part of it shows in the number, because the Rule 8-200 1) b) minimum was governing before this load went in.');
    }
    c.info.textContent = bits.join(' ');
  }

  /* The EV, hot tub and HVAC screens of the walkdown, when they hold numbers. */
  function drawScreens(j, box) {
    U.clear(box);
    var rows = [];
    function amp(o) { var x = FC.evNum(o.amps); if (x === null) x = FC.evNum(o.mca); if (x === null) x = FC.evNum(o.mocp); return x; }
    var hasEvCard = j.loads.some(function (L) { return /evse/i.test(L.kind || ''); });
    if (j.types.indexOf('ev') >= 0 && !hasEvCard && amp(j.ev) !== null) rows.push({ k: 'ev', t: 'EV charger from the walkdown', r: amp(j.ev) + ' A' });
    var hasTubCard = j.loads.some(function (L) { return /tub|spa/i.test(L.kind || ''); });
    if (j.types.indexOf('tub') >= 0 && !hasTubCard && (FC.evNum(j.tub.amps) !== null || FC.evNum(j.tub.mocp) !== null)) rows.push({ k: 'tub', t: 'Hot tub from the walkdown', r: (FC.evNum(j.tub.amps) !== null ? FC.evNum(j.tub.amps) : FC.evNum(j.tub.mocp)) + ' A' });
    var hv = FC.evNum(j.hvac.mca); if (hv === null) hv = FC.evNum(j.hvac.mocp);
    if ((j.types.indexOf('ac') >= 0 || j.types.indexOf('hp') >= 0) && (hv !== null || FC.evNum(j.hvac.backupHeatKw) !== null)) rows.push({ k: 'hvac', t: (j.types.indexOf('hp') >= 0 ? 'Heat pump' : 'Air conditioner') + ' from the walkdown', r: (hv !== null ? hv + ' A' : '') + (FC.evNum(j.hvac.backupHeatKw) !== null ? (hv !== null ? ', ' : '') + FC.evNum(j.hvac.backupHeatKw) + ' kW backup' : '') });
    if (!rows.length) { V.screenRows = []; return; }
    box.appendChild(el('div', { class: 'ck-lhd' }, [el('b', { text: 'From the walkdown screens' }), el('span', { class: 'tiny', text: 'Edit them on the walkdown' })]));
    V.screenRows = rows.map(function (r) {
      var pill = el('span', { class: 'ck-pill amb' });
      box.appendChild(el('button', { type: 'button', class: 'ck-load ck-ro', onclick: function () { flush(); go('w-loads'); } }, [
        el('span', { class: 'ck-lh' }, [el('span', { class: 'ck-ln' }, [el('b', { text: r.t }), el('small', { text: r.r + ' · Adding' })]), pill])
      ]));
      return { k: r.k, pill: pill };
    });
  }

  /* ------------------------------------------------------------ interlock */
  function paintInterlock(sc) {
    var j = V.job, p = sc.ready ? sc.after.r._inp._hc : null;
    var need = !!(p && p.H > 0 && p.acW > 0);
    if (!need) { U.clear(V.ilWrap); V.ilOn = false; return; }
    if (V.ilOn) return;
    V.ilOn = true;
    var cur = j.hvac.interlock === IL_YES ? 'yes' : j.hvac.interlock === IL_NO ? 'no' : j.hvac.interlock === IL_UNK ? 'unk' : '';
    V.ilWrap.appendChild(sect('Heat and air conditioning together', 'Electric heat and air conditioning are both in. Rule 8-106 3) counts only the larger one where interlocks are installed so they cannot run at the same time. Without one, both count.', [
      seg(cur, [{ v: 'yes', l: 'Interlocked' }, { v: 'no', l: 'Both can run' }, { v: 'unk', l: 'Not sure' }], function (v) {
        j.hvac.interlock = v === 'yes' ? IL_YES : v === 'no' ? IL_NO : IL_UNK;
        FC.touch('Interlock answered'); refresh();
      }, 'sm'),
      el('p', { class: 'tiny', style: 'margin-top:8px', text: 'Only tap Interlocked when you can see the interlock wiring or the controls that do it. A thermostat setting is not an interlock.' })
    ], 'ck-il'));
  }

  /* ------------------------------------------------------------ more */
  function moreSect(j) {
    var s = j.service, c = j.check, m = s.measured;
    var solarBox = el('div');
    function drawSolar() {
      U.clear(solarBox);
      if (!c.solarOn) return;
      solarBox.appendChild(el('div', { class: 'row2' }, [
        U.field({ label: 'Existing solar breaker', type: 'number', unit: 'A', value: c.solarExistingA, hint: 'Leave blank if there is none.', oninput: function (v) { c.solarExistingA = v; soon(); } }),
        U.field({ label: 'New solar breaker', type: 'number', unit: 'A', value: c.solarNewA, oninput: function (v) { c.solarNewA = v; soon(); } })
      ]));
    }
    drawSolar();
    var masterBits = V.isM ? [
      el('label', { class: 'ck-tog' }, [
        (function () {
          var cb = el('input', { type: 'checkbox' });
          cb.checked = !!c.cont100;
          cb.addEventListener('change', function () { c.cont100 = cb.checked; FC.touch(cb.checked ? 'Main marked for 100 percent continuous operation' : null); refresh(); });
          return cb;
        })(),
        el('span', { text: 'Main is marked for 100 percent continuous operation. Dmitry only. Compares the measured path against the full rating instead of 80 percent, Rule 8-104 5).' })
      ])
    ] : [];

    return U.acc('More from the panel and the bills', 'Optional', '', [
      el('div', { class: 'row2' }, [
        U.field({ label: 'Panel bus rating', type: 'number', unit: 'A', value: FC.evVal(s.busRating), hint: 'Off the panel label.', oninput: function (v) { s.busRating.value = v; s.busRating.source = 'Field measurement'; FC.stampEntry(s.busRating); soon(); } }),
        U.field({ label: 'Spaces free', type: 'number', value: s.spacesFree, oninput: function (v) { s.spacesFree = v; soon(); } })
      ]),
      U.field({ label: 'Double pole breakers in the panel', type: 'number', value: c.dp, hint: 'Count them. Any you cannot match to a load above gets flagged, because a missed heater zone or a subpanel changes the answer.', oninput: function (v) { c.dp = v; soon(); } }),
      el('div', { class: 'row2' }, [
        U.field({ label: 'Measured peak demand', type: 'number', value: m.value, hint: 'A demand reading, not the kWh total off a bill.', oninput: function (v) { m.value = v; soon(); } }),
        el('div', { class: 'fld' }, [lab('Unit'), seg(m.unit || 'kW', [{ v: 'kW', l: 'kW' }, { v: 'A', l: 'A' }, { v: 'W', l: 'W' }], function (v) { m.unit = v; soon(); }, 'sm')])
      ]),
      el('div', { class: 'row2' }, [
        U.field({ label: 'Where it came from', value: m.source, placeholder: 'Utility demand data, logger', oninput: function (v) { m.source = v; soon(); } }),
        U.field({ label: 'Twelve month window', value: m.window, placeholder: 'Oct 2025 to Sep 2026', oninput: function (v) { m.window = v; soon(); } })
      ]),
      el('p', { class: 'tiny', style: 'margin:-6px 0 14px', text: 'Rule 8-106 8). Both the source and the window have to be filled in before the measured path is used.' }),
      lab('Service size to compare an upgrade against'),
      U.chips({
        values: String(c.target || '200'), multi: false,
        options: [{ k: '125', label: '125 A' }, { k: '150', label: '150 A' }, { k: '200', label: '200 A' }, { k: '400', label: '400 A' }],
        onpick: function (k) { c.target = k; soon(); }
      }),
      el('div', { style: 'height:14px' }),
      el('label', { class: 'ck-tog' }, [
        (function () {
          var cb = el('input', { type: 'checkbox' });
          cb.checked = !!c.solarOn;
          cb.addEventListener('change', function () { c.solarOn = cb.checked; drawSolar(); soon(); });
          return cb;
        })(),
        el('span', { text: 'Solar on this panel, now or planned. Checks the breakers against the bus, Rule 64-112 4).' })
      ]),
      solarBox
    ].concat(masterBits), false);
  }

  /* =================================================================== refresh */
  function refresh() {
    if (!V || !V.side || !V.side.isConnected) return;
    var j = V.job, sc;
    try { sc = G.scenarios(j); }
    catch (e) { sc = { ready: false, svc: 0, flags: [{ tone: 'block', text: 'The calculation stopped on an input: ' + (e && e.message || e) + '. Check the last number typed.' }], spaces: { free: null, need: 0, freed: 0, ok: null } }; }
    V.sc = sc;
    var cache = {};
    V.cards.forEach(function (c) { paintCard(c, cache); });
    (V.screenRows || []).forEach(function (r) {
      var m = null;
      try { m = G.marginal(j, r.k, cache); } catch (e) { m = null; }
      r.pill.textContent = m ? '+' + a1(m.a) + ' A' : '';
    });
    var cnt = document.getElementById('ck-count');
    if (cnt) cnt.textContent = j.loads.length ? j.loads.length + (j.loads.length === 1 ? ' load' : ' loads') : 'Nothing added yet';
    if (!j.loads.length && !V.list.firstChild) V.list.appendChild(el('p', { class: 'mut ck-none', text: 'Start with the range, the dryer and the water heater. Then the heat, then anything in the garage or outside.' }));
    else if (j.loads.length) { var none = V.list.querySelector('.ck-none'); if (none) none.remove(); }
    if (V.floorNote) {
      var fl = !!(sc.ready && sc.today.floor && j.loads.some(function (L) { return L.state !== PROPOSED && L.state !== FUTURE && G.loadWatts(L); }));
      V.floorNote.textContent = fl ? 'The Rule 8-200 1) b) minimum of ' + U.fmt(sc.today.r.core.itemB) + ' W is governing today, so the loads already in show 0 A until the itemised total passes it.' : '';
      V.floorNote.style.display = fl ? '' : 'none';
    }
    paintInterlock(sc);
    paintMeter(sc);
    paintSide(sc);
  }

  /* ------------------------------------------------------------ meter bar */
  function paintMeter(sc) {
    var m = U.clear(V.meter);
    if (!sc.ready) {
      m.appendChild(el('div', { class: 'ck-mtx' }, [
        el('b', { text: sc.svc ? 'House size next' : 'Main breaker and house size first' }),
        el('span', { text: 'The number shows up the moment the area is in.' })
      ]));
    } else {
      var least = sc.least;
      m.appendChild(cell('Today', sc.today, least));
      if (sc.changed) m.appendChild(cell('After', sc.after, least));
      m.appendChild(el('div', { class: 'ck-mc main' }, [el('span', { text: 'Main' }), el('b', { text: sc.svc ? sc.svc + ' A' : 'Not set' })]));
    }
    m.appendChild(el('button', {
      type: 'button', class: 'btn pri sm ck-go', text: 'Results',
      onclick: function () { flush(); try { V.side.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { V.side.scrollIntoView(); } }
    }));
  }
  function cell(label, p, least) {
    var tone = p.band.key === 'fits' ? 'good' : p.band.key === 'none' ? '' : 'warn';
    var sub = least ? 'at least' : p.pct !== null ? Math.round(p.pct) + '%' : '';
    return el('div', { class: 'ck-mc ' + tone }, [
      el('span', { text: label }),
      el('b', { text: Math.round(p.a) + ' A' }),
      sub ? el('i', { text: sub }) : null
    ]);
  }

  /* ------------------------------------------------------------ results */
  function paintSide(sc) {
    var keep = V.side.scrollTop;
    var s = U.clear(V.side);
    s.appendChild(el('div', { class: 'ck-sh' }, [el('h2', { class: 'h-sec', text: 'Where the house sits' }), el('span', { class: 'tiny', text: 'Rule 8-200, updates as you type' })]));
    if (!sc.ready) {
      s.appendChild(el('div', { class: 'card ck-empty' }, [
        el('b', { text: sc.svc ? 'House size next' : 'Main breaker and house size first' }),
        el('p', { class: 'mut', text: 'Rule 8-200 starts from the living area, so there is no honest number without it. Everything else can go in now, and the result fills in the moment the area is entered.' })
      ]));
    } else {
      s.appendChild(barsCard(sc));
      var ch = changesCard(sc); if (ch) s.appendChild(ch);
      if (V.isM) { var o = optionsCard(sc); if (o) s.appendChild(o); }
    }
    s.appendChild(flagsCard(sc));
    if (sc.ready) s.appendChild(ledgerCard(sc));
    s.appendChild(actionsCard(sc));
    if (keep) V.side.scrollTop = keep;
  }

  function barsCard(sc) {
    var least = sc.least;
    var rows = [{ k: 'Today', p: sc.today }];
    if (sc.changed) rows.push({ k: 'After the job', p: sc.after });
    if (sc.later.length) rows.push({ k: 'With the maybe later loads', p: sc.future });
    var head = sc.changed ? sc.after : sc.today;
    var max = 125;
    rows.forEach(function (r) { if (r.p.pct !== null && r.p.pct > max) max = Math.ceil(r.p.pct / 25) * 25; });
    var box = el('div', { class: 'card ck-bars' });
    box.appendChild(el('div', { class: 'ck-bhd' }, [
      el('span', { class: 'ck-band ' + head.band.key, text: head.band.label }),
      el('span', { class: 'ck-svc', text: sc.svc ? sc.svc + ' A main' : 'Main breaker not entered' })
    ]));
    box.appendChild(el('div', { class: 'ck-big' }, [
      least ? el('small', { text: 'at least' }) : null,
      el('b', { text: a1(head.a) }), el('span', { text: ' A' }),
      el('i', { text: (sc.changed ? 'After the job' : 'Today') + (head.pct !== null ? ', ' + Math.round(head.pct) + ' percent of the main' : '') })
    ]));
    if (least) box.appendChild(el('p', { class: 'ck-low', text: 'Reads at least, because ' + andList(sc.low) + '. Filling those in can only raise it.' }));
    rows.forEach(function (r) {
      var p = r.p;
      var w = p.pct === null ? 0 : Math.max(1.5, Math.min(p.pct, max) / max * 100);
      box.appendChild(el('div', { class: 'ck-row' }, [
        el('div', { class: 'ck-lab' }, [el('span', { text: r.k }), el('b', { text: (least ? 'at least ' : '') + a1(p.a) + ' A' + (p.pct !== null ? ' · ' + Math.round(p.pct) + '%' : '') })]),
        el('div', { class: 'ck-track' }, [
          el('i', { class: 'ck-fill ' + p.band.key, style: 'width:' + w.toFixed(1) + '%' }),
          sc.svc ? el('b', { class: 'ck-mark', style: 'left:' + (100 / max * 100).toFixed(2) + '%' }) : null
        ])
      ]));
    });
    box.appendChild(el('p', { class: 'tiny', style: 'margin-top:4px', text:
      (sc.svc ? 'The white line is the ' + sc.svc + ' A main. ' : '') +
      U.fmt(head.w) + ' W calculated' + (head.floor ? ', and the Rule 8-200 1) b) minimum is the governing number' : '') +
      '. Rule 8-200 3) says this total is not a continuous load, so it is held against the full rating of the main. Preliminary until Dmitry reviews it.' }));
    return box;
  }

  function changesCard(sc) {
    if (!sc.changed && !sc.later.length) return null;
    var kids = [];
    function line(t, list) {
      if (!list.length) return;
      kids.push(el('div', { class: 'ck-chg' }, [el('span', { text: t }), el('b', { text: list.map(function (x) { return x.name + ' ' + x.rating; }).join(', ') })]));
    }
    line('Adding', sc.adds); line('Coming out', sc.removes); line('Maybe later', sc.later);
    if (sc.changed) {
      var d = sc.after.a - sc.today.a;
      kids.push(el('p', { class: 'tiny', style: 'margin-top:8px', text: Math.abs(d) < 0.05 ? 'The job does not move the calculated load.' : (d > 0 ? 'The job adds ' + a1(d) + ' A to the calculated load.' : 'The job takes ' + a1(-d) + ' A off the calculated load.') }));
    }
    return sect('What the job changes', null, kids, 'ck-chgs');
  }

  function miniBar(p, svc) {
    var max = Math.max(125, p.pct || 0);
    var w = p.pct === null ? 0 : Math.max(1.5, Math.min(p.pct, max) / max * 100);
    return el('div', { class: 'ck-track mini' }, [
      el('i', { class: 'ck-fill ' + p.band.key, style: 'width:' + w.toFixed(1) + '%' }),
      svc ? el('b', { class: 'ck-mark', style: 'left:' + (100 / max * 100).toFixed(2) + '%' }) : null
    ]);
  }
  function optRow(title, value, note, p, svc) {
    return el('div', { class: 'ck-opt' }, [
      el('div', { class: 'ck-oh' }, [el('b', { text: title }), value ? el('span', { class: 'ck-ov ' + (p ? p.band.key : ''), text: value }) : null]),
      p ? miniBar(p, svc) : null,
      note ? el('p', { text: note }) : null
    ]);
  }

  function optionsCard(sc) {
    var svc = sc.svc, least = sc.least ? 'at least ' : '';
    var rows = [];
    function of(p, s) { return least + a1(p.a) + ' A of ' + s + ' A'; }
    if (sc.managed && sc.managed.a < sc.after.a - 0.05) {
      rows.push(optRow('Load manager on the charger', svc ? of(sc.managed, svc) : '', 'Rule 8-106 11). Where an energy management system monitors the service, feeders and branch circuits and controls the charger under Rule 8-500, the charger is left out of the calculation.', svc ? sc.managed : null, svc));
    }
    if (sc.evMax) {
      if (sc.evMax.a >= 16 && sc.evMax.a + 0.5 < sc.evMax.nowA) {
        rows.push(optRow('Charger turned down', 'up to ' + sc.evMax.a + ' A', 'Fits with no manager at up to ' + sc.evMax.a + ' A on ' + sc.evMax.v + ' V, about ' + (sc.evMax.a * sc.evMax.v / 1000).toFixed(1) + ' kW. Only counts where the charger has a manual switch inside the equipment that an electrician sets, Alberta STANDATA 24-ECI-086.', null, svc));
      } else if (sc.evMax.a < 16 && sc.after.band.key !== 'fits') {
        rows.push(optRow('Charger turned down', 'not useful', 'Without a manager or more service there is room for ' + sc.evMax.a + ' A of charging, which is not much of a charger. The 16 A cut off for this option is a practical one, not a code number.', null, svc));
      }
    }
    if (sc.interlock) rows.push(optRow('Interlock the heat and the air conditioning', svc ? of(sc.interlock, svc) : '', 'Rule 8-106 3). With interlocks installed so they cannot run at the same time, only the larger one counts.', svc ? sc.interlock : null, svc));
    if (sc.measured) {
      var ms = sc.measured;
      rows.push(optRow('Measured path, Rule 8-106 8)', a1(ms.a) + ' A',
        'Measured peak ' + kwTxt(ms.peakW) + ' plus ' + kwTxt(ms.newW) + ' of new loads. ' +
        (ms.limitA ? 'Held against ' + Math.round(ms.limitA) + ' A, ' + (ms.full ? '100' : '80') + ' percent of the main under Rule 8-104 5) and 6). ' + (ms.ok ? 'Under that line.' : 'Over that line.') : 'Enter the main breaker to compare it.'), null, svc));
    }
    if (sc.upgrade) {
      var room = sc.upgrade.svc - sc.after.a;
      rows.push(optRow('Service at ' + sc.upgrade.svc + ' A', of(sc.upgrade.after, sc.upgrade.svc),
        (room >= 0 ? 'Room left after the job, about ' + Math.round(room) + ' A.' : 'Still over by about ' + Math.round(-room) + ' A.') +
        (sc.later.length ? ' With the maybe later loads, ' + a1(sc.upgrade.future.a) + ' A.' : '') +
        ' A new panel needs at least four spare spaces at installation, Rule 8-108 1).', sc.upgrade.after, sc.upgrade.svc));
    }
    var sp = sc.spaces;
    if (sp && sp.need) {
      rows.push(optRow('Panel spaces', sp.ok === false ? 'short' : sp.ok ? 'room' : '',
        'The new loads need about ' + sp.need + ' space' + (sp.need === 1 ? '' : 's') + '. ' +
        (sp.free === null ? 'Spaces free is not entered yet.' : 'The panel has ' + sp.free + ' free' + (sp.freed ? ', plus ' + sp.freed + ' from loads coming out' : '') + '.') +
        (sp.ok === false ? ' A subpanel or a new panel are the usual ways around it.' : ''), null, svc));
    }
    if (sc.solar) rows.push(solarRow(sc.solar, sc));
    if (!rows.length) return null;
    return sect('Options, Dmitry only', 'Side by side, same engine, same inputs. Nothing here is a recommendation.', rows, 'ck-opts');
  }

  function solarRow(b, sc) {
    if (!b.ready) return optRow('Solar on this panel, Rule 64-112 4)', '', 'Enter the bus rating, the main breaker and the new solar breaker under More from the panel.', null, 0);
    var srcTxt = (b.existingA ? b.existingA + ' A existing and ' : '') + b.newA + ' A new';
    var t = 'Main ' + b.main + ' A and solar ' + srcTxt + ' add up to ' + b.sum + ' A. A dwelling panel can take source breakers up to 125 percent of the ' + b.bus + ' A bus, ' + (Math.round(b.limit * 10) / 10) + ' A, Rule 64-112 4) f).';
    if (!b.ok) {
      var fit = BREAKERS.filter(function (x) { return x <= b.maxNew; });
      t += ' Over by ' + (Math.round((b.sum - b.limit) * 10) / 10) + ' A. ' + (fit.length ? 'The largest solar breaker that fits is ' + fit[fit.length - 1] + ' A.' : 'No solar breaker fits on this bus as it sits.');
      if (b.derateTo) t += ' Or the main comes down to ' + b.derateTo + ' A, and the calculation after the job reads ' + a1(sc.after.a) + ' A against that, ' + (sc.after.a <= b.derateTo ? 'which fits.' : 'which does not fit.');
    }
    if (b.farEnd) t += ' The total is over the bus rating, so the solar breaker goes at the opposite end of the bus from the main, Rule 64-112 4) b), with a label saying it is not to be moved, 4) c).';
    return optRow('Solar on this panel, Rule 64-112 4)', b.ok ? 'fits' : 'over', t, null, 0);
  }

  function flagsCard(sc) {
    var order = { block: 0, warn: 1, info: 2 };
    var f = (sc.flags || []).slice().sort(function (x, y) { return order[x.tone] - order[y.tone]; });
    var box = el('section', { class: 'card ck-flags' });
    box.appendChild(el('h3', { text: f.length ? 'Check before you say a number' : 'Nothing flagged' }));
    if (!f.length) box.appendChild(el('p', { class: 'mut', text: 'The inputs hang together. It is still a preliminary number until Dmitry reviews it.' }));
    f.forEach(function (x) { box.appendChild(el('div', { class: 'ck-flag ' + x.tone }, [el('i', { 'aria-hidden': 'true' }), el('span', { text: x.text })])); });
    return box;
  }

  function ledgerCard(sc) {
    var p = sc.changed ? sc.after : sc.today, r = p.r;
    var rows = r.core.lines.map(function (l) { return { cells: [{ t: l.label, sub: l.rule }, { t: U.fmt(l.watts), num: true }] }; });
    rows.push({ cls: 'sum', cells: [{ t: 'Item a), the itemised total' }, { t: U.fmt(r.core.itemA), num: true }] });
    rows.push({ cells: [{ t: 'Item b), the minimum', sub: r.core.itemBnote }, { t: U.fmt(r.core.itemB), num: true }] });
    rows.push({ cls: 'sum', cells: [{ t: 'Calculated load, the greater of the two', sub: r.core.governingSource }, { t: U.fmt(r.totalW) + ' W', num: true }] });
    var kids = [
      U.table(['Line', { l: 'Watts', num: true }], rows),
      el('p', { class: 'tiny', style: 'margin-top:10px', text: U.fmt(r.totalW) + ' W divided by ' + r.divisor + ' V is ' + a1(r.amps) + ' A.' }),
      el('ul', { class: 'ck-basis' }, r.core.lines.map(function (l) { return el('li', { text: l.label + '. ' + l.basis + '.' }); }))
    ];
    if (r.core.ignored && r.core.ignored.length) kids.push(el('p', { class: 'tiny', text: 'Not counted, 1500 W or less: ' + r.core.ignored.map(function (x) { return x.name + ' ' + U.fmt(x.watts) + ' W'; }).join(', ') + '.' }));
    var notes = (r._inp && r._inp._notes) || [];
    if (notes.length) kids.push(el('p', { class: 'tiny', text: notes.join(' ') }));
    var d = U.acc('How the number was built', sc.changed ? 'After the job' : 'Today', '', kids, !!V.ledgerOpen);
    d.addEventListener('toggle', function () { V.ledgerOpen = d.open; });
    return d;
  }

  function actionsCard(sc) {
    var j = V.job, kids = [];
    if (V.isM) {
      kids.push(el('button', { type: 'button', class: 'btn pri wide', text: 'Show the customer', disabled: sc.ready ? null : 'disabled', onclick: function () { flush(); go('check-show'); } }));
      kids.push(el('div', { class: 'ck-row2' }, [
        el('button', { type: 'button', class: 'btn sm', text: 'Share the summary', disabled: sc.ready ? null : 'disabled', onclick: function () { shareText(j, V.sc); } }),
        el('button', { type: 'button', class: 'btn sm', text: 'Copy the summary', disabled: sc.ready ? null : 'disabled', onclick: function () { copyText(G.customerText(j, V.sc)); } })
      ]));
      kids.push(el('p', { class: 'tiny', style: 'margin-top:8px', text: 'The summary is plain words, no prices, no final recommendation, and it says the numbers are preliminary.' }));
    } else {
      kids.push(U.note('Options and the customer view are Dmitry\u2019s', 'You can read the numbers and the flags. What gets said to the customer, and how the job gets handled, is his call. Send him the check.', 'lock'));
      kids.push(el('button', { type: 'button', class: 'btn pri wide', text: 'Send to Dmitry', onclick: function () { flush(); go('send'); } }));
    }
    kids.push(el('button', { type: 'button', class: 'btn gho wide', style: 'margin-top:8px', text: 'Open the full walkdown for this job', onclick: function () { flush(); go('job'); } }));
    return el('div', { class: 'ck-actions' }, kids);
  }

  function copyText(t) {
    function fallback() {
      var ta = el('textarea', { style: 'position:fixed;left:-9999px;top:0' });
      ta.value = t; document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      U.toast(ok ? 'Summary copied' : 'Could not copy on this browser.');
    }
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(t).then(function () { U.toast('Summary copied'); }, fallback);
    } else fallback();
  }
  function shareText(j, sc) {
    var t = G.customerText(j, sc);
    if (global.navigator.share) {
      global.navigator.share({ title: 'Home electrical load check', text: t })
        .then(function () { FC.touch('Load check summary shared'); })
        .catch(function (e) { if (e && e.name === 'AbortError') return; copyText(t); });
    } else {
      var href = 'mailto:' + encodeURIComponent(FC.evVal(j.header.email) || '') + '?subject=' + encodeURIComponent('Your home electrical load check') + '&body=' + encodeURIComponent(t);
      global.location.href = href;
    }
  }

  /* =================================================================== customer view */
  function vShow() {
    var j = FC.active();
    if (!j) return go('home');
    if (!FC.isMaster()) { U.toast('Master Electrician only.'); return go('check'); }
    FC.migrate(j);
    var sc = G.scenarios(j);
    var A = global.App;
    A.header('For the customer', FC.evVal(j.header.address) || FC.evVal(j.header.customer) || 'Load check', 'check');
    var body = U.clear(document.getElementById('fc-body'));
    body.classList.add('ck-show');
    if (!sc.ready) {
      body.appendChild(U.note('Not ready yet', 'The house size is still needed before there is a number to show.', 'warn'));
      A.bar([el('button', { class: 'btn wide', text: 'Back to the check', onclick: function () { go('check'); } })]);
      return;
    }
    var least = sc.least ? 'at least ' : '';
    var h = j.header;
    body.appendChild(el('div', { class: 'cs-hero' }, [
      el('div', { class: 'cs-tag', text: 'Raydn Renewables' }),
      el('h1', { class: 'h-hero', text: 'Your home electrical load' }),
      el('p', { class: 'mut', text: [FC.evVal(h.address), new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })].filter(Boolean).join(' · ') })
    ]));

    var rows = [{ k: 'Today', p: sc.today }];
    if (sc.changed) rows.push({ k: 'With the changes', p: sc.after });
    if (sc.later.length) rows.push({ k: 'With what may come later', p: sc.future });
    var max = 125;
    rows.forEach(function (r) { if (r.p.pct !== null && r.p.pct > max) max = Math.ceil(r.p.pct / 25) * 25; });
    var meter = el('section', { class: 'card cs-meter' });
    meter.appendChild(el('p', { class: 'cs-svc', text: sc.svc ? 'Your service: ' + sc.svc + ' A main breaker' : 'Your service size is still being confirmed' }));
    rows.forEach(function (r) {
      var p = r.p, w = p.pct === null ? 0 : Math.max(1.5, Math.min(p.pct, max) / max * 100);
      meter.appendChild(el('div', { class: 'cs-row' }, [
        el('div', { class: 'cs-lab' }, [el('span', { text: r.k }), el('b', { text: least + Math.round(p.a) + ' A' })]),
        el('div', { class: 'ck-track cs-track' }, [
          el('i', { class: 'ck-fill ' + p.band.key, style: 'width:' + w.toFixed(1) + '%' }),
          sc.svc ? el('b', { class: 'ck-mark', style: 'left:' + (100 / max * 100).toFixed(2) + '%' }) : null
        ])
      ]));
    });
    if (sc.svc) meter.appendChild(el('p', { class: 'tiny', text: 'The white line is what your service is rated for.' }));
    if (least) meter.appendChild(el('p', { class: 'tiny', text: 'A few readings are still being confirmed. Filling them in can only raise these numbers, not lower them.' }));
    body.appendChild(meter);

    var k = sc.after.band.key, said;
    if (!sc.svc) said = 'The main breaker size still has to be confirmed before these numbers can be compared to your service.';
    else if (k === 'over') said = 'On paper the house goes over what the service is rated for. The Canadian Electrical Code, Rule 8-104 2), says the calculated load cannot be more than the rating of the service. There are a few ways to handle that.';
    else if (k === 'tight') said = 'It fits, but close to the limit, so every nameplate gets double checked before anything is final.';
    else said = 'It fits inside your existing service on paper' + (sc.changed ? ' with the changes' : '') + '.';
    body.appendChild(el('section', { class: 'card cs-said' }, [el('h3', { text: 'What that means' }), el('p', { text: said })]));

    var opts = [];
    if (sc.svc && k !== 'fits') {
      if (sc.managed && sc.managed.a < sc.after.a - 0.05) opts.push({ t: 'A load manager on the charger', d: 'It watches the whole house and slows or pauses the charger when the house gets busy. With a system that monitors the service and controls the charger, Rule 8-106 11) lets the charger come out of the calculation.', p: sc.managed, s: sc.svc });
      if (sc.evMax && sc.evMax.a >= 16 && sc.evMax.a + 0.5 < sc.evMax.nowA) opts.push({ t: 'The charger set lower', d: 'Up to ' + sc.evMax.a + ' A fits with no load manager. In Alberta that only counts when an electrician sets it on a switch inside the charger.' });
      if (sc.interlock) opts.push({ t: 'Heat and air conditioning interlocked', d: 'So they cannot run at the same time. Rule 8-106 3) then counts only the larger of the two.', p: sc.interlock, s: sc.svc });
      if (sc.upgrade) opts.push({ t: 'A ' + sc.upgrade.svc + ' A service', d: sc.upgrade.svc - sc.after.a >= 1 ? 'Leaves about ' + Math.round(sc.upgrade.svc - sc.after.a) + ' A of room for what comes next.' : 'Still over on paper, so it would need one of the other options as well.', p: sc.upgrade.after, s: sc.upgrade.svc });
    } else if (sc.svc && sc.later.length) {
      opts.push({ t: 'Planning ahead', d: 'With ' + sc.later.map(function (x) { return x.name; }).join(', ') + ' added later, the calculation reads ' + least + Math.round(sc.future.a) + ' A of ' + sc.svc + ' A.', p: sc.future, s: sc.svc });
    }
    if (opts.length) {
      var oc = el('section', { class: 'card cs-opts' }, [el('h3', { text: k === 'fits' ? 'Looking ahead' : 'Ways to handle it' })]);
      opts.forEach(function (o) {
        oc.appendChild(el('div', { class: 'cs-opt' }, [
          el('div', { class: 'ck-oh' }, [el('b', { text: o.t }), o.p ? el('span', { class: 'ck-ov ' + o.p.band.key, text: least + Math.round(o.p.a) + ' A of ' + o.s + ' A' }) : null]),
          o.p ? miniBar(o.p, o.s) : null,
          el('p', { text: o.d })
        ]));
      });
      oc.appendChild(el('p', { class: 'tiny', text: 'These are the options side by side, so you can pick what fits your plans.' }));
      body.appendChild(oc);
    }
    body.appendChild(el('section', { class: 'card cs-foot' }, [
      el('p', { class: 'mut', text: 'Preliminary numbers, calculated under the 2024 Canadian Electrical Code, Rule 8-200, from what we recorded on site today. They get confirmed in the full walkthrough and the permit before anything is final.' }),
      el('p', { class: 'cs-who', text: 'Dmitry Naboka, Master Electrician, ME# 13824' }),
      el('p', { class: 'tiny', text: '(780) 904-3462 | info@raydnrenewables.com | raydnrenewables.com' })
    ]));
    A.bar([
      el('button', { class: 'btn gho', style: 'flex:0 0 auto', text: 'Back', onclick: function () { go('check'); } }),
      el('button', { class: 'btn pri', style: 'flex:1', text: 'Share this summary', onclick: function () { shareText(j, sc); } })
    ]);
  }

  global.FCViews = global.FCViews || {};
  global.FCViews.check = vCheck;
  global.FCViews['check-show'] = vShow;
  global.FCCheck = { QUICK: QUICK, readQ: readQ, writeQ: writeQ, newLoad: newLoad, itemFor: itemFor };
})(window);
