/* =========================================================================
   Raydn FieldCalc  ::  fc-views.js
   Solar walkdown, the preliminary screen, Express Screen, wire and voltage
   drop, Master Review, and the three reports.
   ========================================================================= */
(function (global) {
  'use strict';
  var FC = global.FC, G = global.FCGates, U = global.UI, App = global.App;
  var el = U.el, field = U.field, evField = U.evField, card = U.card, acc = U.acc;
  function go(v, a) { global.App.go(v, a); }

  /* ==================================================== 8 solar walkdown */
  function vSolar() {
    var j = FC.active(); if (!j) return go('home');
    var s = j.solar;
    var bandHost = el('div');

    function paintBand() {
      U.clear(bandHost);
      var a = G.alignment(j);
      var tone = a.band.tone;
      bandHost.appendChild(U.band(tone, a.band.label, null, [
        'Verified historic annual use, ' + U.fmt(a.historic) + ' kWh from ' + a.filled + ' of 12 months, ' + a.actual + ' marked actual.',
        'Documented projected future use, ' + U.fmt(a.future) + ' kWh.',
        'Supported annual site use, ' + U.fmt(a.supported) + ' kWh.',
        a.forecast ? 'Forecast annual AC generation, ' + U.fmt(a.forecast) + ' kWh, which is ' + Math.round(a.ratio * 100) + ' percent of supported use.' : 'No forecast generation entered yet.'
      ], a.note));
      bandHost.appendChild(U.note('How Rule 024 is treated here',
        'Annual use alignment check. The final micro generation and interconnection outcome is subject to current wires owner and regulatory review. This app does not treat Rule 024 as a universal automatic 100 percent cap, and it does not state an interconnection outcome.', 'lock'));
    }

    /* 12 month table */
    var monthsBox = el('div');
    function paintMonths() {
      U.clear(monthsBox);
      (s.months || []).forEach(function (m) {
        monthsBox.appendChild(el('div', { class: 'mrow' }, [
          el('span', { class: 'mn', text: m.month }),
          field({ type: 'number', unit: 'kWh', value: m.kwh, placeholder: 'kWh', oninput: function (v) { m.kwh = v; FC.touch(null); paintBand(); } }),
          field({
            value: m.status, placeholder: 'Quality',
            options: ['Actual', 'Estimated', 'True up', 'Adjusted', 'Missing'],
            onchange: function (v) { m.status = v; FC.touch(null); paintBand(); }
          })
        ]));
      });
    }
    paintMonths();

    /* roof planes */
    var planeBox = el('div');
    function paintPlanes() {
      U.clear(planeBox);
      if (!s.planes.length) planeBox.appendChild(el('p', { class: 'mut', text: 'No roof planes recorded yet. Add one card per usable plane.' }));
      s.planes.forEach(function (p, i) {
        planeBox.appendChild(el('div', { class: 'subcard' }, [
          el('div', { class: 'hd' }, [
            el('b', { text: p.name || 'Plane ' + (i + 1) }),
            el('button', { class: 'xbtn', text: '×', onclick: function () { s.planes.splice(i, 1); FC.touch(null); paintPlanes(); } })
          ]),
          field({ label: 'Name it', value: p.name, placeholder: 'South garage, rear main', oninput: function (v) { p.name = v; } }),
          el('div', { class: 'row3' }, [
            field({ label: 'Azimuth', type: 'number', unit: '°', value: p.azimuth, oninput: function (v) { p.azimuth = v; } }),
            field({ label: 'Pitch', value: p.pitch, placeholder: '6/12', oninput: function (v) { p.pitch = v; } }),
            field({ label: 'Usable area', type: 'number', unit: 'ft²', value: p.area, oninput: function (v) { p.area = v; } })
          ]),
          field({ label: 'Shade on this plane', options: ['None', 'Light, morning only', 'Light, evening only', 'Moderate', 'Heavy', 'Needs a shade study'], value: p.shade, onchange: function (v) { p.shade = v; } }),
          field({ label: 'Obstructions on this plane', rows: 2, value: p.obstructions, oninput: function (v) { p.obstructions = v; } })
        ]));
      });
      planeBox.appendChild(el('button', {
        class: 'btn wide sm', text: '+ Add a roof plane',
        onclick: function () { s.planes.push({ name: '', azimuth: '', pitch: '', area: '', shade: '', obstructions: '' }); FC.touch(null); paintPlanes(); }
      }));
    }
    paintPlanes();

    /* future loads */
    var futBox = el('div');
    function paintFuture() {
      U.clear(futBox);
      if (!s.futureLoads.length) futBox.appendChild(el('p', { class: 'mut', text: 'No projected loads documented. Without documentation, sizing rests on verified historic use only, which is the safe place to be.' }));
      s.futureLoads.forEach(function (f, i) {
        futBox.appendChild(el('div', { class: 'subcard' }, [
          el('div', { class: 'hd' }, [
            el('b', { text: f.category || 'Projected load ' + (i + 1) }),
            el('button', { class: 'xbtn', text: '×', onclick: function () { s.futureLoads.splice(i, 1); recalcFuture(); paintFuture(); } })
          ]),
          field({ label: 'Category', options: ['EV charging', 'Heat pump or electrification', 'Hot tub or spa', 'Shop or garage', 'Basement suite or addition', 'Occupancy change', 'Other'], value: f.category, onchange: function (v) { f.category = v; FC.touch(null); paintFuture(); } }),
          field({ label: 'Annual kWh', type: 'number', unit: 'kWh', value: f.kwh, oninput: function (v) { f.kwh = v; recalcFuture(); } }),
          field({ label: 'How that number was worked out', rows: 3, hint: 'Show the arithmetic. Kilometres times efficiency, or a manufacturer figure, or a heating load estimate.', value: f.basis, oninput: function (v) { f.basis = v; } }),
          el('div', { class: 'row2' }, [
            field({ label: 'Start date', type: 'month', value: f.start, oninput: function (v) { f.start = v; } }),
            field({ label: 'Evidence', options: ['Signed quote', 'Vehicle ordered', 'Customer written statement', 'Verbal intent only', 'Assumption'], value: f.evidence, onchange: function (v) { f.evidence = v; } })
          ])
        ]));
      });
      futBox.appendChild(el('button', {
        class: 'btn wide sm', text: '+ Document a projected load',
        onclick: function () { s.futureLoads.push({ category: '', kwh: '', basis: '', start: '', evidence: '' }); FC.touch(null); paintFuture(); }
      }));
    }
    function recalcFuture() {
      s.futureAnnualKwh = s.futureLoads.reduce(function (t, f) { return t + (Number(f.kwh) || 0); }, 0);
      FC.touch(null); paintBand();
    }
    paintFuture();

    paintBand();

    App.header('Solar walkdown', 'Step 8 of 9', 'job');
    U.clear(document.getElementById('fc-body'));
    var body = document.getElementById('fc-body');

    [
      bandHost,
      acc('Twelve months of measured use', null, '', [
        U.note('kWh, never dollars', 'Sizing runs on meter period kWh. Bill dollars are never a sizing input. Mark each month actual, estimated, true-up or adjusted, because an estimated read followed by a true-up distorts a month badly.', ''),
        monthsBox,
        field({ label: 'Where the data came from', options: ['Retailer 12 month export', 'Photos of 12 paper bills', 'Customer portal screenshots', 'Partial data, gaps noted', 'Customer recollection only'], value: s.dataQuality, onchange: function (v) { s.dataQuality = v; FC.touch(null); paintBand(); } })
      ], true),
      acc('Occupancy pattern', null, '', [
        U.note('Snowbird rule', 'Where the property is empty for part of the year, the design is based on actual measured consumption for the way they really live. Do not inflate the design to a full time pattern that does not exist. A future full time scenario is a separate documented scenario, and an expansion ready design beats an oversized one.', ''),
        field({ label: 'How the property is occupied', req: true, options: ['Full time, all year', 'Snowbird, away part of the winter', 'Seasonal or summer only', 'Weekends only', 'Rental or tenant occupied', 'Vacant'], value: s.occupancy, onchange: function (v) { s.occupancy = v; FC.touch(null); } }),
        field({ label: 'Which months they are away', value: s.awayMonths, placeholder: 'November to March', oninput: function (v) { s.awayMonths = v; } }),
        el('div', { class: 'row2' }, [
          field({ label: 'Winter base use while away', type: 'number', unit: 'kWh/mo', value: s.winterBase, oninput: function (v) { s.winterBase = v; } }),
          field({ label: 'Winter use when home', type: 'number', unit: 'kWh/mo', value: s.winterOccupied, oninput: function (v) { s.winterOccupied = v; } })
        ]),
        field({ label: 'Any plan to change that', rows: 2, hint: 'A future full time scenario is documented here as a separate case, not folded into the design.', value: s.futureOccupancy, oninput: function (v) { s.futureOccupancy = v; } })
      ]),
      acc('Projected future loads', null, '', [futBox]),
      acc('Roof', null, '', [
        field({ label: 'Roof material', options: ['Asphalt shingle', 'Metal', 'Cedar shake', 'Tile', 'Flat membrane', 'Other'], value: s.roofMaterial, onchange: function (v) { s.roofMaterial = v; FC.touch(null); } }),
        evField({ label: 'Roof age', obj: s.roofAge, type: 'number', unit: 'years', hint: 'Ask, and look. If the customer does not know, say Cannot verify.' }),
        evField({ label: 'Roof condition', obj: s.roofCondition, options: ['Good, many years left', 'Fair, watch it', 'Worn, re roof before solar', 'Failing', 'Cannot assess from the ground'], hint: 'Panels on a roof that needs replacing is a removal and reinstall bill later.' }),
        field({ label: 'Re roof timing', options: ['Not needed', 'Planned before solar', 'Planned after solar', 'Customer undecided', 'Roofer to advise'], value: s.reroofTiming, onchange: function (v) { s.reroofTiming = v; } }),
        field({ label: 'Roofer findings', rows: 3, hint: 'Roofer and electrician findings travel in the same packet. Do not split them across two conversations.', value: s.rooferNotes, oninput: function (v) { s.rooferNotes = v; } }),
        planeBox,
        field({ label: 'Obstructions overall', rows: 2, value: s.obstructions, oninput: function (v) { s.obstructions = v; } }),
        field({ label: 'Shade sources overall', rows: 2, value: s.shade, oninput: function (v) { s.shade = v; } }),
        field({ label: 'Roof access', options: ['Easy, single storey', 'Two storey', 'Steep pitch', 'Restricted access', 'Needs a lift'], value: s.access, onchange: function (v) { s.access = v; } })
      ]),
      acc('Equipment and interconnection', null, '', [
        field({ label: 'Proposed inverter location', value: s.inverterLocation, oninput: function (v) { s.inverterLocation = v; FC.touch(null); } }),
        field({ label: 'Conduit route, roof to panel', rows: 2, value: s.conduitRoute, oninput: function (v) { s.conduitRoute = v; } }),
        field({ label: 'Battery interest', options: ['Not interested', 'Curious about it', 'Wants backup power', 'Wants full off grid capability', 'Battery ready only'], value: s.batteryInterest, onchange: function (v) { s.batteryInterest = v; } }),
        field({ label: 'Monitoring preference', options: ['Phone app is fine', 'Wants a wall display', 'Not fussed'], value: s.monitoring, onchange: function (v) { s.monitoring = v; } }),
        field({
          label: 'Forecast annual AC generation', type: 'number', unit: 'kWh',
          hint: FC.isMaster() ? 'Master entry. From the design tool, not from a rule of thumb.' : 'Locked. The Master Electrician enters the production forecast.',
          value: s.forecastAnnualAcKwh,
          oninput: function (v) { if (!FC.isMaster()) return; s.forecastAnnualAcKwh = v; FC.touch(null); paintBand(); }
        })
      ])
    ].forEach(function (n) { body.appendChild(n); });

    if (!FC.isMaster()) {
      body.appendChild(App.fieldNotice());
      var inp = body.querySelectorAll('input');
      Array.prototype.forEach.call(inp, function (x) {
        if (x.previousSibling && String(x.parentNode.textContent).indexOf('Forecast annual AC generation') === 0) x.disabled = true;
      });
    }

    App.bar([
      el('button', { class: 'btn gho', style: 'flex:0 0 auto', text: 'Steps', onclick: function () { go('job'); } }),
      el('button', { class: 'btn pri', style: 'flex:1', text: 'Next, site flags', onclick: function () { FC.touch(null); go('w-flags'); } })
    ]);
  }

  /* ==================================================== preliminary screen */
  function ledgerTable(r) {
    if (!r) return el('p', { class: 'mut', text: 'Not calculated yet. The living area and the major loads have to be recorded before any number is produced. Nothing is assumed and nothing defaults to zero.' });
    var rows = r.core.lines.map(function (l) {
      return { cells: [{ t: l.label, sub: 'Rule ' + (l.rule || '') + '. ' + (l.basis || '') }, { t: U.fmt(l.watts), num: true }] };
    });
    if (r.core.itemB) {
      rows.push({ cells: [{ t: 'Item a), the itemised calculation', sub: 'Sum of the lines above' }, { t: U.fmt(r.core.itemA), num: true }] });
      rows.push({ cells: [{ t: 'Item b), the Code minimum', sub: r.core.itemBnote }, { t: U.fmt(r.core.itemB), num: true }] });
    }
    rows.push({ cls: 'sum', cells: [{ t: 'Governing figure', sub: r.core.governingSource || '' }, { t: U.fmt(r.totalW) + ' W', num: true }] });
    rows.push({ cls: 'sum', cells: [{ t: 'Calculated demand', sub: 'Divided by ' + r.divisor + ' V' }, { t: r.amps.toFixed(1) + ' A', num: true }] });
    return U.table(['Item', { l: 'Watts', num: true }], rows);
  }

  function vStatus() {
    var j = FC.active(); if (!j) return go('home');
    var st = G.status(j);
    var s = FC.STATUS[st.key];
    App.header('Preliminary screen', FC.evVal(j.header.customer) || 'This job', 'job');
    var body = U.clear(document.getElementById('fc-body'));

    body.appendChild(U.band(s.tone, s.label,
      st.calc && st.svc ? st.calc.amps.toFixed(1) + ' A of ' + st.svc + ' A' : null,
      st.reasons, s.blurb));

    if (st.packet.blockers.length) {
      body.appendChild(card('What is blocking review', null, [
        el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
          st.packet.blockers.map(function (b) { return el('li', { text: b, style: 'margin-bottom:5px' }); }))
      ]));
    }
    if (st.packet.follow.length) {
      body.appendChild(card('Follow ups owed', null, [
        U.table(['Item', 'State', 'Owner', 'Due'], st.packet.follow.map(function (f) {
          return [f.item, f.state, f.owner || 'Unassigned', f.due || 'No date'];
        }))
      ]));
    }

    body.appendChild(el('h2', { class: 'h-sec', text: 'How the number was built' }));
    body.appendChild(card(null, null, [
      ledgerTable(st.calc),
      el('p', { class: 'tiny', style: 'margin-top:12px', text: st.calc ? st.calc.title + '. ' + st.calc.ruleRef : '' }),
      st.calc && st.calc.core.ignored && st.calc.core.ignored.length
        ? el('p', { class: 'tiny', style: 'margin-top:6px', text: 'Not counted, at or under 1500 W: ' + st.calc.core.ignored.map(function (x) { return x.name + ' ' + U.fmt(x.watts) + ' W'; }).join('. ') })
        : null
    ]));

    if (st.calc && st.calc.alt) {
      body.appendChild(card('Second path', null, [
        el('p', { class: 'mut', text: 'Rule 8-106 8) allows the measured peak demand over 12 months plus the new loads. Where the two paths disagree, the disagreement is itself the argument, and the Master Electrician decides which one is defensible.' }),
        el('p', { style: 'font-family:var(--serif);font-size:20px;margin-top:8px', text: st.calc.altAmps.toFixed(1) + ' A on the measured path' })
      ]));
    }

    body.appendChild(el('h2', { class: 'h-sec', text: 'Paths that stay open' }));
    body.appendChild(card(null, null, [
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.65' }, [
        el('li', { text: 'Keep the existing service where a compliant route exists.', style: 'margin-bottom:6px' }),
        el('li', { text: 'Load management or an energy management system, subject to Master Electrician review of the equipment and the controls.', style: 'margin-bottom:6px' }),
        el('li', { text: 'A service or panel upgrade.', style: 'margin-bottom:6px' }),
        el('li', { text: 'Stage the work, and build in expansion so the next load does not mean starting again.' })
      ]),
      el('p', { class: 'mut', style: 'margin-top:12px', text: 'This tool never issues an automatic fail and it never declares that a 200 A upgrade is mandatory. Those are Master Electrician decisions made against the site, the authority and the code.' })
    ]));

    body.appendChild(App.fieldNotice());
    App.bar([
      el('button', { class: 'btn gho', style: 'flex:1', text: 'Reports', onclick: function () { go('reports'); } }),
      FC.isMaster()
        ? el('button', { class: 'btn pri', style: 'flex:1', text: 'Master Review', onclick: function () { go('master'); } })
        : el('button', { class: 'btn pri', style: 'flex:1', text: 'Send to Dmitry', onclick: function () { App.download(j, true); } })
    ]);
  }

  /* ==================================================== express screen */
  var exState = { serviceRating: '', area: '', unit: 'sqft', heat: '', heatKw: '', wh: '', ev: false, tub: false, ac: false, hp: false, suite: false, garage: false, solar: false };

  function vExpress() {
    App.header('Express Screen', 'Fast direction, not a design', 'home');
    var body = U.clear(document.getElementById('fc-body'));
    var out = el('div');
    var hb = el('div');
    function heatBox() {
      U.clear(hb);
      if (exState.heat !== 'electric') return;
      hb.appendChild(field({
        label: 'Electric heating, total kW', type: 'number', unit: 'kW',
        hint: 'Add up the baseboards and the furnace element. Leave blank and it screens at 45 W per m2, which is a guess.',
        value: exState.heatKw, oninput: function (v) { exState.heatKw = v; paint(); }
      }));
    }

    function paint() {
      U.clear(out);
      var r = G.express(exState);
      out.appendChild(U.band(r.verdict.tone, r.verdict.label,
        r.svc && r.area ? r.amps.toFixed(0) + ' A of ' + r.svc + ' A, about ' + Math.round(r.pct) + ' percent' : null,
        null,
        'Coarse screening figures only. This is not a Section 8 calculation, it does not use nameplates, and it decides nothing. Run a Guided Walkdown before anything is priced.'));
      if (r.lines.length) {
        out.appendChild(card('What went into it', null, [
          U.table(['Item', { l: 'Watts', num: true }], r.lines.map(function (l) {
            return { cells: [{ t: l.label, sub: l.note }, { t: l.w ? U.fmt(l.w) : 'none', num: true }] };
          }))
        ]));
      }
    }

    body.appendChild(U.note('What this is for', 'A one minute answer on the phone or at the door, so nobody drives out on a job that was never going to work. It is deliberately coarse. Every real number comes from the walkdown.', ''));
    body.appendChild(card('The house', null, [
      field({ label: 'Existing main breaker', type: 'number', unit: 'A', value: exState.serviceRating, oninput: function (v) { exState.serviceRating = v; paint(); } }),
      U.seg({ value: exState.unit, options: [{ v: 'sqft', l: 'Square feet' }, { v: 'm2', l: 'Square metres' }], onpick: function (v) { exState.unit = v; paint(); } }),
      el('div', { style: 'height:14px' }),
      field({ label: 'Living area', type: 'number', unit: exState.unit === 'sqft' ? 'ft²' : 'm²', value: exState.area, oninput: function (v) { exState.area = v; paint(); } }),
      el('div', { style: 'height:6px' }),
      el('div', { class: 'lab' }, ['How is it heated? ', el('i', { class: 'req', text: '*' })]),
      U.seg({
        value: exState.heat,
        options: [{ v: 'gas', l: 'Gas or other fuel' }, { v: 'electric', l: 'Electric' }],
        onpick: function (v) { exState.heat = v; paint(); heatBox(); }
      }),
      el('div', { style: 'height:10px' }),
      hb,
      el('div', { class: 'lab', text: 'Water heater' }),
      U.seg({
        value: exState.wh,
        options: [{ v: 'gas', l: 'Gas' }, { v: 'electric', l: 'Electric' }],
        onpick: function (v) { exState.wh = v; paint(); }
      })
    ]));
    body.appendChild(card('What they want to add', null, [
      U.chips({
        values: Object.keys(exState).filter(function (k) { return exState[k] === true; }), multi: true,
        options: [
          { k: 'ev', label: 'EV charger' }, { k: 'tub', label: 'Hot tub' }, { k: 'ac', label: 'Air conditioning' },
          { k: 'hp', label: 'Heat pump' }, { k: 'suite', label: 'Basement suite' },
          { k: 'garage', label: 'Garage or shop' }, { k: 'solar', label: 'Solar' }
        ],
        onpick: function (k) { exState[k] = !exState[k]; paint(); }
      })
    ]));
    body.appendChild(out);
    heatBox();
    paint();

    App.bar([
      el('button', { class: 'btn gho', style: 'flex:1', text: 'Home', onclick: function () { go('home'); } }),
      el('button', {
        class: 'btn pri', style: 'flex:1', text: 'Start a real walkdown',
        onclick: function () {
          var j = FC.newJob();
          j.areas.unit = exState.unit; j.areas.above = exState.area;
          j.areas.aboveSource = 'Customer statement';
          j.service.mainBreaker.value = exState.serviceRating;
          j.service.mainBreaker.source = 'Customer statement';
          ['ev', 'tub', 'ac', 'hp', 'suite', 'garage', 'solar'].forEach(function (k) { if (exState[k]) j.types.push(k); });
          FC.touch('Seeded from an Express Screen');
          go('job');
        }
      })
    ]);
  }

  /* ==================================================== wire and voltage drop */
  function vWire() {
    var j = FC.active();
    var d = j ? j.wire : { systemVoltage: '240', phase: '1', loadA: '', lengthM: FC.ev('m'), material: 'cu', sizes: ['10', '8', '6', '4', '3', '2', '1/0'], parallel: '1', ampacityReviewed: false, dataSource: 'Conductor resistance table, ohms per kilometre at 75 C' };
    App.header('Wire and voltage drop', 'Screening only', j ? 'job' : 'home');
    var body = U.clear(document.getElementById('fc-body'));
    var out = el('div');

    function paint() {
      U.clear(out);
      var r = G.vdrop(d);
      if (!r.ready) { out.appendChild(el('p', { class: 'mut', text: 'Enter the load current and the run length to see the screening table.' })); return; }
      out.appendChild(card('Voltage drop by size', null, [
        U.table([{ l: 'Size' }, { l: 'Ω/km', num: true }, { l: 'Drop', num: true }, { l: 'Percent', num: true }], r.rows.map(function (x) {
          return {
            cls: x.pct <= 3 ? '' : 'warnrow',
            cells: [
              { t: x.size + ' AWG' },
              { t: x.ohmsPerKm.toFixed(3), num: true },
              { t: x.vd.toFixed(1) + ' V', num: true },
              { t: x.pct.toFixed(2) + ' %', num: true }
            ]
          };
        })),
        el('p', { class: 'tiny', style: 'margin-top:12px', text: r.formula + ', ' + r.material + ' at 75 C. R is the conductor resistance per kilometre divided by 1000 and by the number of parallel runs.' })
      ]));
      out.appendChild(U.note('This does not size a conductor',
        'Voltage drop is one constraint out of several. Ampacity, the correction factors for ambient and grouping, the termination temperature rating, the overcurrent device and the wiring method all have to be checked before a size is chosen. The Master Electrician selects the conductor and the overcurrent device. This screen only shows where the drop sits.', 'lock'));
    }

    body.appendChild(card('The run', null, [
      el('div', { class: 'row2' }, [
        field({ label: 'System volts', type: 'number', value: d.systemVoltage, oninput: function (v) { d.systemVoltage = v; paint(); } }),
        field({ label: 'Phase', options: [{ v: '1', l: 'Single phase' }, { v: '3', l: 'Three phase' }], value: d.phase, onchange: function (v) { d.phase = v; paint(); } })
      ]),
      field({ label: 'Load current', type: 'number', unit: 'A', value: d.loadA, oninput: function (v) { d.loadA = v; paint(); } }),
      evField({ label: 'One way run length', obj: d.lengthM, type: 'number', unit: 'm', hint: 'Pace it or measure it. Add the vertical runs.', onchange: paint }),
      el('div', { class: 'row2' }, [
        field({ label: 'Conductor material', options: [{ v: 'cu', l: 'Copper' }, { v: 'al', l: 'Aluminum' }], value: d.material, onchange: function (v) { d.material = v; paint(); } }),
        field({ label: 'Parallel runs', type: 'number', value: d.parallel, oninput: function (v) { d.parallel = v; paint(); } })
      ]),
      field({ label: 'Wiring method', options: ['NMD90 in a wall', 'Teck90', 'RW90 in conduit', 'ACWU90', 'Direct buried', 'Other'], value: d.method, onchange: function (v) { d.method = v; if (j) FC.touch(null); } })
    ]));
    body.appendChild(out);
    paint();
    App.bar([el('button', { class: 'btn wide gho', text: j ? 'Back to the job' : 'Home', onclick: function () { go(j ? 'job' : 'home'); } })]);
  }

  /* ==================================================== master review */
  function vMaster() {
    var j = FC.active(); if (!j) return go('home');
    if (!FC.isMaster()) { U.toast('Master Electrician only.'); return go('job'); }
    var r = j.review;
    var st = G.status(j);
    App.header('Master Review', FC.evVal(j.header.customer) || 'This job', 'job');
    var body = U.clear(document.getElementById('fc-body'));

    var gateHost = el('div');
    function gates() {
      var out = [];
      if (!FC.evVal(j.juris.preset) || j.juris.preset === 'unknown') out.push('Jurisdiction and wires owner are not resolved.');
      var proofOk = ['panel_open', 'main_label', 'panel_label', 'meter', 'service_entrance'].every(function (k) {
        var p = j.photos[k];
        return p && (p.state === 'Captured' ? !!p.data : (p.state && p.reason));
      });
      if (!proofOk) out.push('Service and panel proof is neither captured nor documented as a limitation.');
      var nameOk = (j.loads || []).every(function (L) {
        return FC.evKnown(L.w) || FC.evKnown(L.amps) || FC.evKnown(L.mca) || String(L.notes || '').toLowerCase().indexOf('unknown') >= 0;
      });
      if (!nameOk) out.push('A major new load has no nameplate data and is not listed as unknown.');
      if (!r.calcPath) out.push('The calculation path has not been selected.');
      if (!String(r.assumptions || '').trim()) out.push('Assumptions and data gaps are not written down.');
      if (!String(r.reviewer || '').trim()) out.push('The reviewer name or initials are missing.');
      if (!r.standataChecked) out.push('The Alberta STANDATA layer has not been confirmed as checked.');
      return out;
    }
    function paintGates() {
      U.clear(gateHost);
      var g = gates();
      if (!g.length) {
        gateHost.appendChild(U.note('Ready to approve', 'Every finalization gate is answered. Approving locks the record and stamps your name and the time on it.', 'good'));
      } else {
        gateHost.appendChild(U.note('Approval is blocked', 'Finalization gates still open:', ''));
        gateHost.appendChild(el('ul', { style: 'margin:0 0 14px;padding-left:18px;font-size:13px;color:var(--ink-2);line-height:1.6' },
          g.map(function (x) { return el('li', { text: x, style: 'margin-bottom:5px' }); })));
      }
      approveBtn.disabled = g.length > 0 || r.approved;
    }

    body.appendChild(U.band(FC.STATUS[st.key].tone, FC.STATUS[st.key].label, null, st.reasons, FC.STATUS[st.key].blurb));

    body.appendChild(el('h2', { class: 'h-sec', text: 'CEC ledger' }));
    body.appendChild(card(null, null, [
      ledgerTable(st.calc),
      el('p', { class: 'tiny', style: 'margin-top:12px', text: FC.CEC_VERSION }),
      st.calc ? el('p', { class: 'tiny', text: st.calc.ruleRef }) : null
    ]));

    if (st.calc && st.calc.runway && st.calc.runway.length) {
      body.appendChild(card('Future load runway', null, [
        U.table(['Scenario', { l: 'Amps', num: true }], st.calc.runway.map(function (x) {
          return { cells: [{ t: x.name }, { t: (x.amps || 0).toFixed(1) + ' A', num: true }] };
        }))
      ]));
    }

    body.appendChild(el('h2', { class: 'h-sec', text: 'Reviewer entries' }));
    body.appendChild(card(null, null, [
      field({ label: 'Calculation path selected', req: true, options: ['Rule 8-200 calculated demand', 'Rule 8-106 8) measured peak plus new loads', 'Both, reported side by side', 'Other, described in the notes'], value: r.calcPath, onchange: function (v) { r.calcPath = v; FC.touch('Calculation path selected'); paintGates(); } }),
      field({ label: 'Assumptions and data gaps', req: true, rows: 4, hint: 'Every gap goes in the report. Nothing gets quietly resolved in your head.', value: r.assumptions, oninput: function (v) { r.assumptions = v; FC.touch(null); paintGates(); } }),
      field({ label: 'Open questions', rows: 3, value: r.openQuestions, oninput: function (v) { r.openQuestions = v; } }),
      field({ label: 'Service conclusion', rows: 3, hint: 'Write what the rule requires and what was found. Never write that it will pass inspection.', value: r.conclusion, oninput: function (v) { r.conclusion = v; } }),
      field({ label: 'Conductor and overcurrent note', rows: 2, hint: 'Master only. Nothing in this app selects a conductor or an overcurrent device.', value: r.conductorNote, oninput: function (v) { r.conductorNote = v; } }),
      j.types.indexOf('solar') >= 0 ? field({ label: 'Solar and interconnection note', rows: 3, value: r.solarNote, oninput: function (v) { r.solarNote = v; } }) : null,
      field({ label: 'Next action', value: r.nextAction, oninput: function (v) { r.nextAction = v; } }),
      el('div', { class: 'row2' }, [
        field({ label: 'Owner', value: r.nextOwner, oninput: function (v) { r.nextOwner = v; } }),
        field({ label: 'Due', type: 'date', value: r.nextDue, oninput: function (v) { r.nextDue = v; } })
      ]),
      el('label', { class: 'chip', style: 'margin-top:6px' + (r.standataChecked ? '' : ''), onclick: function () { r.standataChecked = !r.standataChecked; FC.touch(null); global.App.render(); } }, r.standataChecked ? 'Alberta STANDATA layer checked' : 'Confirm the Alberta STANDATA layer was checked'),
      field({ label: 'Reviewer name or initials', req: true, value: r.reviewer, oninput: function (v) { r.reviewer = v; FC.touch(null); paintGates(); } })
    ].filter(Boolean)));

    /* override log */
    body.appendChild(el('h2', { class: 'h-sec', text: 'Override log' }));
    var ovHost = el('div');
    function paintOv() {
      U.clear(ovHost);
      if (!r.overrides.length) ovHost.appendChild(el('p', { class: 'mut', text: 'No overrides recorded. Every change a reviewer makes to a field value is logged here with a written reason.' }));
      r.overrides.slice().reverse().forEach(function (o) {
        ovHost.appendChild(el('div', { class: 'subcard' }, [
          el('b', { style: 'font-family:var(--serif);font-size:14px', text: o.fieldChanged }),
          el('p', { class: 'tiny', style: 'margin-top:6px', text: 'From "' + (o.priorValue || 'blank') + '" to "' + (o.newValue || 'blank') + '".' }),
          el('p', { class: 'tiny', text: 'Reason: ' + o.reason }),
          el('p', { class: 'tiny', text: o.changedBy + ', ' + FC.stamp(o.changedAt) })
        ]));
      });
    }
    paintOv();
    var ovF = { field: '', prior: '', next: '', reason: '' };
    body.appendChild(card(null, null, [
      ovHost,
      acc('Record an override', null, '', [
        field({ label: 'Field changed', value: ovF.field, oninput: function (v) { ovF.field = v; } }),
        el('div', { class: 'row2' }, [
          field({ label: 'Prior value', value: ovF.prior, oninput: function (v) { ovF.prior = v; } }),
          field({ label: 'New value', value: ovF.next, oninput: function (v) { ovF.next = v; } })
        ]),
        field({ label: 'Reason', req: true, rows: 3, value: ovF.reason, oninput: function (v) { ovF.reason = v; } }),
        el('button', {
          class: 'btn wide sm', text: 'Log the override',
          onclick: function () {
            if (!ovF.field.trim() || !ovF.reason.trim()) return U.toast('A field and a written reason are both required.');
            FC.override(ovF.field, ovF.prior, ovF.next, ovF.reason);
            ovF.field = ovF.prior = ovF.next = ovF.reason = '';
            U.toast('Override logged.'); global.App.render();
          }
        })
      ])
    ]));

    body.appendChild(el('h2', { class: 'h-sec', text: 'Approval' }));
    var approveBtn = el('button', {
      class: 'btn pri wide', text: r.approved ? 'Approved on ' + FC.stamp(r.approvedAt) : 'Approve and lock this record',
      onclick: function () {
        if (r.approved) return;
        if (!confirm('Approve and lock this record as ' + r.reviewer + '? This stamps your name and the time on the conclusion.')) return;
        r.approved = true; r.approvedAt = FC.nowISO(); r.status = 'APPROVED';
        j.stage = 'Proposal Ready';
        FC.touch('Master approved by ' + r.reviewer);
        U.toast('Record approved and locked.');
        global.App.render();
      }
    });
    body.appendChild(card(null, null, [
      gateHost,
      approveBtn,
      r.approved ? el('button', {
        class: 'btn wide gho', style: 'margin-top:10px', text: 'Reopen for revision',
        onclick: function () {
          var why = prompt('Reopening a locked record. Why?');
          if (!why) return;
          FC.override('Master approval', 'Approved', 'Reopened', why);
          r.approved = false; r.approvedAt = ''; FC.touch('Record reopened');
          global.App.render();
        }
      }) : null
    ].filter(Boolean)));
    paintGates();

    body.appendChild(U.note('Standing rule', FC.INTERNAL_NOTICE, 'lock'));
    App.bar([
      el('button', { class: 'btn gho', style: 'flex:1', text: 'Job', onclick: function () { go('job'); } }),
      el('button', { class: 'btn pri', style: 'flex:1', text: 'Reports', onclick: function () { go('reports'); } })
    ]);
  }

  /* ==================================================== reports */
  function vReports() {
    var j = FC.active(); if (!j) return go('home');
    App.header('Reports', FC.evVal(j.header.customer) || 'This job', 'job');
    var body = U.clear(document.getElementById('fc-body'));
    var st = G.status(j);

    body.appendChild(U.note('How printing works', 'Choose a report, then use the browser share or print menu and pick Save as PDF. The report is laid out for letter paper. Nothing else on the screen prints.', ''));

    [
      { k: 'internal', t: 'Internal field report', s: 'Everything. Evidence, gaps, ledger, photos, follow ups. For Dmitry and the crew.', ok: true },
      { k: 'customer', t: 'Customer next steps summary', s: 'Plain words, what was found, what happens next. No code language, no promises.', ok: j.review.approved || FC.isMaster() },
      { k: 'proposal', t: 'Proposal handoff summary', s: 'The scope facts a proposal needs, and the decisions that are still open.', ok: FC.isMaster() }
    ].forEach(function (x) {
      body.appendChild(el('div', {
        class: 'item' + (x.ok ? '' : ' warnb'), style: x.ok ? '' : 'opacity:.55',
        onclick: function () {
          if (!x.ok) return U.toast('Master Electrician releases this one.');
          buildReport(j, st, x.k);
          setTimeout(function () { global.print(); }, 120);
        }
      }, [
        el('span', { class: 'dot' }),
        el('div', { class: 'tx' }, [el('b', { text: x.t + (x.ok ? '' : ', locked') }), el('span', { text: x.s })]),
        el('span', { class: 'go', text: '›' })
      ]));
    });

    if (!j.review.approved) {
      body.appendChild(U.note('Not approved yet', 'This record has not been through Master Review. Every report will carry the preliminary notice and the words code compliant, approved and guaranteed appear nowhere in it.', ''));
    }

    body.appendChild(card('Send the whole job', null, [
      el('p', { class: 'mut', text: 'The job file carries every value, every evidence tag, every photo and the full log. Send it to Dmitry and he opens it on his phone exactly as you left it.' }),
      el('div', { style: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap' }, [
        el('button', { class: 'btn sm', style: 'flex:1;min-width:150px', text: 'Export with photos', onclick: function () { App.download(j, true); } }),
        el('button', { class: 'btn sm gho', style: 'flex:1;min-width:150px', text: 'Export data only', onclick: function () { App.download(j, false); } })
      ])
    ]));

    App.bar([el('button', { class: 'btn wide gho', text: 'Back to the job', onclick: function () { go('job'); } })]);
  }

  /* ---- report builder ---- */
  function rowsFrom(pairs) {
    return pairs.filter(function (p) { return p[1]; }).map(function (p) { return '<tr><td style="width:38%"><b>' + U.esc(p[0]) + '</b></td><td>' + U.esc(p[1]) + '</td></tr>'; }).join('');
  }
  function evLine(o) {
    if (!o) return '';
    var v = FC.evVal(o);
    if (!v) return 'Not recorded';
    var bits = [v + (o.unit ? ' ' + o.unit : '')];
    if (o.source) bits.push(o.source);
    if (o.evidenceStatus) bits.push(o.evidenceStatus);
    return bits.join(', ');
  }

  function buildReport(j, st, kind) {
    var host = document.getElementById('rpt');
    var s = FC.STATUS[st.key];
    var cust = FC.evVal(j.header.customer) || 'Customer';
    var addr = FC.evVal(j.header.address) || '';
    var when = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    var h = '';

    h += '<div class="rhead"><div>' +
      '<div class="desig' + (kind === 'customer' ? ' cust' : '') + '">' +
      (kind === 'internal' ? 'Internal field report' : kind === 'customer' ? 'Your site visit summary' : 'Proposal handoff') + '</div>' +
      '<h1>' + U.esc(cust) + '</h1><p class="tagline">' + U.esc(addr) + '</p></div>' +
      '<div class="co"><b>Raydn Renewables</b><br>Dmitry Naboka, Master Electrician<br>ME# 13824<br>(780) 904-3462<br>info@raydnrenewables.com<br>raydnrenewables.com</div></div>';
    h += '<div class="stripe"></div>';

    h += '<div class="facts">' +
      '<div><span>Date</span><b>' + when + '</b></div>' +
      '<div><span>Recorded by</span><b>' + U.esc(FC.ROLES[j.rep].name) + '</b></div>' +
      '<div><span>Authority</span><b>' + U.esc(j.juris.authority || 'Not resolved') + '</b></div>' +
      '<div><span>Wires owner</span><b>' + U.esc(j.juris.utility || 'Not resolved') + '</b></div>' +
      '</div>';

    if (j.demo) h += '<div class="flagbox d"><b>DEMO ONLY</b>This record is a training and testing record. No number in it describes a real property.</div>';

    /* ---------------- customer ---------------- */
    if (kind === 'customer') {
      h += '<div class="verdict"><div class="badge' + (s.tone === 'good' ? ' good' : s.tone === 'block' ? ' block' : '') + '">' +
        (st.key === 'APPROVED' ? 'Reviewed' : 'In review') + '</div><div class="tx"><b>Where your job stands</b>' +
        '<p>' + (st.key === 'APPROVED'
          ? 'Your site information has been reviewed by our Master Electrician. The next steps are below.'
          : 'We have your site information. It is with our Master Electrician for review, and we will come back to you with the options.') + '</p></div></div>';

      h += '<h2>What we looked at</h2><table><tbody>' + rowsFrom([
        ['Your request', FC.evVal(j.header.request)],
        ['What we are looking at', j.types.map(function (t) { var f = FC.JOB_TYPES.filter(function (x) { return x.k === t; })[0]; return f ? f.label : t; }).join(', ')],
        ['Existing main breaker', FC.evVal(j.service.mainBreaker) ? FC.evVal(j.service.mainBreaker) + ' A' : 'To be confirmed'],
        ['Panel', FC.evVal(j.service.panelMakeModel)],
        ['Home size on record', j.areas.above ? j.areas.above + ' ' + (j.areas.unit === 'sqft' ? 'sq ft above grade' : 'm2 above grade') : ''],
        ['Photos taken on site', String(Object.keys(j.photos).filter(function (k) { return j.photos[k].data; }).length)]
      ]) + '</tbody></table>';

      h += '<h2>What happens next</h2>';
      if (j.review.nextAction) {
        h += '<p>' + U.esc(j.review.nextAction) + (j.review.nextOwner ? ' Owner, ' + U.esc(j.review.nextOwner) + '.' : '') + (j.review.nextDue ? ' By ' + U.esc(j.review.nextDue) + '.' : '') + '</p>';
      } else {
        h += '<p>Our Master Electrician reviews the site information, the calculation and the local utility requirements, then we come back with your options and what each one involves.</p>';
      }
      var fu = st.packet.follow.filter(function (f) { return f.state !== 'Not applicable'; });
      if (fu.length) {
        h += '<h3>Still needed from the visit</h3><table><thead><tr><th>Item</th><th>Why</th><th>Who</th><th>By</th></tr></thead><tbody>' +
          fu.map(function (f) { return '<tr><td>' + U.esc(f.item.replace(/^Photo: /, '')) + '</td><td>' + U.esc(f.reason) + '</td><td>' + U.esc(f.owner) + '</td><td>' + U.esc(f.due || 'To be set') + '</td></tr>'; }).join('') +
          '</tbody></table>';
      }
      h += '<div class="flagbox"><b>Please note</b>This summary describes what we found on site and what happens next. It is not a quote, it is not a design, and it is not a statement about code compliance. Those come from our Master Electrician after the review is finished.</div>';
    }

    /* ---------------- internal ---------------- */
    if (kind === 'internal') {
      h += '<div class="verdict"><div class="badge' + (s.tone === 'good' ? ' good' : s.tone === 'block' ? ' block' : '') + '">' + U.esc(s.label) + '</div>' +
        '<div class="tx"><b>' + (st.calc && st.svc ? st.calc.amps.toFixed(1) + ' A calculated against a ' + st.svc + ' A main' : 'Calculation incomplete') + '</b>' +
        '<p>' + U.esc(s.blurb) + '</p></div></div>';

      if (st.reasons.length) h += '<div class="flagbox"><b>Why</b>' + st.reasons.map(U.esc).join('<br>') + '</div>';

      h += '<h2>Job header</h2><table><tbody>' + rowsFrom([
        ['Customer', cust], ['Address', addr],
        ['Phone', FC.evVal(j.header.phone)], ['Email', FC.evVal(j.header.email)],
        ['Lead source', j.header.leadSource], ['Campaign', j.header.campaign], ['Referred by', j.header.referrer],
        ['Request', j.header.request], ['Budget signal', j.header.budget], ['Timeline', j.header.timeline],
        ['Decision makers', j.header.decisionMakers],
        ['Job types', j.types.map(function (t) { var f = FC.JOB_TYPES.filter(function (x) { return x.k === t; })[0]; return f ? f.label : t; }).join(', ')]
      ]) + '</tbody></table>';

      h += '<h2>Jurisdiction</h2><table><tbody>' + rowsFrom([
        ['Inspection authority', j.juris.authority || 'NOT RESOLVED'],
        ['Wires owner', j.juris.utility || 'NOT RESOLVED'],
        ['Retailer', j.juris.retailer],
        ['Boundary notes', j.juris.boundaryNotes]
      ]) + '</tbody></table>';
      h += '<div class="flagbox"><b>Standing warning</b>' + U.esc(FC.JURISDICTION_WARNING) + '</div>';

      h += '<h2>Service and panel</h2><table><tbody>' + rowsFrom([
        ['Supply voltage', j.service.supplyVoltage],
        ['Service rating', evLine(j.service.serviceRating)],
        ['Main breaker', evLine(j.service.mainBreaker)],
        ['Panel bus rating', evLine(j.service.busRating)],
        ['Panel make and model', evLine(j.service.panelMakeModel)],
        ['Arrangement', j.service.panelArrangement],
        ['Condition', j.service.panelCondition],
        ['Location', j.service.panelLocation],
        ['Spaces used and free', (j.service.spacesTotal || '?') + ' used, ' + (j.service.spacesFree || '?') + ' free'],
        ['Overhead or underground', j.service.overheadUnderground],
        ['Meter location', j.service.meterLocation],
        ['Service conductors', evLine(j.service.serviceConductors)],
        ['Entrance notes', j.service.entranceNotes],
        ['Subpanels', j.service.subpanels],
        ['Special equipment', j.service.specialEquipment],
        ['Route notes', j.service.routeNotes]
      ]) + '</tbody></table>';

      h += '<h2>Areas</h2><table><tbody>' + rowsFrom([
        ['Above grade', j.areas.above ? j.areas.above + ' ' + j.areas.unit : ''],
        ['Below grade', j.areas.below ? j.areas.below + ' ' + j.areas.unit : ''],
        ['Basement ceiling height', j.areas.belowHeight ? j.areas.belowHeight + ' m' : ''],
        ['Excluding basement', j.areas.exclBasement ? j.areas.exclBasement + ' ' + j.areas.unit : '']
      ]) + '</tbody></table>';

      if (j.loads.length) {
        h += '<h2>Major loads</h2><table><thead><tr><th>Load</th><th>State</th><th>Make and model</th><th>Nameplate</th><th>Evidence</th></tr></thead><tbody>' +
          j.loads.map(function (L) {
            var lw = G.loadWatts(L);
            var e = [L.w, L.amps, L.mca].map(function (x) { return x && x.evidenceStatus; }).filter(Boolean)[0] || 'Pending';
            return '<tr><td>' + U.esc(L.kind || 'Unnamed') + '</td><td>' + U.esc(L.state || '') + '</td><td>' + U.esc(FC.evVal(L.makeModel)) + '</td><td>' +
              (lw ? U.fmt(lw.w) + ' W, ' + U.esc(lw.basis) : 'UNKNOWN, holds the result') + '</td><td>' + U.esc(e) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }

      if (st.calc) {
        h += '<h2>CEC ledger</h2><table><thead><tr><th>Item</th><th>Rule</th><th class="num">Watts</th></tr></thead><tbody>' +
          st.calc.core.lines.map(function (l) {
            return '<tr><td>' + U.esc(l.label) + '<br><span style="font-size:7.4pt;color:#667085">' + U.esc(l.basis || '') + '</span></td><td>' + U.esc(l.rule || '') + '</td><td class="num">' + U.fmt(l.watts) + '</td></tr>';
          }).join('') +
          (st.calc.core.itemB ? '<tr><td>Item a), the itemised calculation</td><td>8-200 1) a)</td><td class="num">' + U.fmt(st.calc.core.itemA) + '</td></tr>' +
            '<tr><td>Item b), the Code minimum<br><span style="font-size:7.4pt;color:#667085">' + U.esc(st.calc.core.itemBnote) + '</span></td><td>8-200 1) b)</td><td class="num">' + U.fmt(st.calc.core.itemB) + '</td></tr>' : '') +
          '<tr class="sum"><td colspan="2">Governing figure, ' + U.esc(st.calc.core.governingSource || '') + '</td><td class="num">' + U.fmt(st.calc.totalW) + ' W</td></tr>' +
          '<tr class="sum"><td colspan="2">Calculated demand, divided by ' + st.calc.divisor + ' V</td><td class="num">' + st.calc.amps.toFixed(1) + ' A</td></tr>' +
          '</tbody></table>';
        h += '<p class="rnote">' + U.esc(st.calc.title + '. ' + st.calc.ruleRef) + '</p>';
        if (st.calc.core.ignored && st.calc.core.ignored.length) h += '<p class="rnote">Not counted, at or under 1500 W: ' + U.esc(st.calc.core.ignored.map(function (x) { return x.name + ' ' + U.fmt(x.watts) + ' W'; }).join('. ')) + '</p>';
      }

      if (j.types.indexOf('solar') >= 0) {
        var al = G.alignment(j);
        h += '<h2>Solar and annual use alignment</h2><table><tbody>' + rowsFrom([
          ['Occupancy pattern', j.solar.occupancy],
          ['Away months', j.solar.awayMonths],
          ['Verified historic annual use', U.fmt(al.historic) + ' kWh from ' + al.filled + ' of 12 months, ' + al.actual + ' actual'],
          ['Documented projected use', U.fmt(al.future) + ' kWh'],
          ['Supported annual site use', U.fmt(al.supported) + ' kWh'],
          ['Forecast annual AC generation', al.forecast ? U.fmt(al.forecast) + ' kWh' : 'Not entered'],
          ['Alignment ratio', al.forecast ? Math.round(al.ratio * 100) + ' percent' : 'Cannot be stated'],
          ['Band', al.band.label],
          ['Roof material', j.solar.roofMaterial],
          ['Roof age', evLine(j.solar.roofAge)],
          ['Roof condition', evLine(j.solar.roofCondition)],
          ['Re roof timing', j.solar.reroofTiming],
          ['Roofer findings', j.solar.rooferNotes],
          ['Roof planes recorded', String(j.solar.planes.length)],
          ['Data quality', j.solar.dataQuality]
        ]) + '</tbody></table>';
        h += '<p class="rnote">' + U.esc(al.note) + '</p>';
        h += '<div class="flagbox"><b>Rule 024</b>Annual use alignment check only. The final micro generation and interconnection outcome is subject to current wires owner and regulatory review. This is not a universal automatic 100 percent cap and no interconnection outcome is stated here.</div>';
      }

      var gaps = st.packet.missing;
      if (gaps.length) {
        h += '<h2>Data gaps</h2><table><thead><tr><th>Missing</th><th>Blocking</th></tr></thead><tbody>' +
          gaps.map(function (g2) { return '<tr><td>' + U.esc(g2) + '</td><td>' + (st.packet.blockers.indexOf(g2) >= 0 ? 'Yes' : 'No') + '</td></tr>'; }).join('') +
          '</tbody></table>';
      }
      if (st.packet.follow.length) {
        h += '<h2>Follow ups</h2><table><thead><tr><th>Item</th><th>State</th><th>Reason</th><th>Owner</th><th>Due</th></tr></thead><tbody>' +
          st.packet.follow.map(function (f) {
            return '<tr><td>' + U.esc(f.item) + '</td><td>' + U.esc(f.state) + '</td><td>' + U.esc(f.reason) + '</td><td>' + U.esc(f.owner) + '</td><td>' + U.esc(f.due || '') + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      if (j.flags.length) {
        h += '<h2>Site flags</h2>' + j.flags.map(function (f) {
          return '<div class="flagbox' + (f.severity === 'Safety risk' || f.severity === 'Blocker' ? ' d' : '') + '"><b>' + U.esc(f.severity) + (f.where ? ', ' + U.esc(f.where) : '') + '</b>' + U.esc(f.note) + '</div>';
        }).join('');
      }
      if (j.clamp.length) {
        h += '<h2>Clamp readings</h2><table><thead><tr><th>Where</th><th class="num">Leg A</th><th class="num">Leg B</th><th>Time</th><th>Running</th></tr></thead><tbody>' +
          j.clamp.map(function (c) {
            return '<tr><td>' + U.esc(c.where) + '</td><td class="num">' + U.esc(c.a) + ' A</td><td class="num">' + U.esc(c.b) + ' A</td><td>' + U.esc(c.time) + '</td><td>' + U.esc(c.running) + '</td></tr>';
          }).join('') + '</tbody></table>';
        h += '<p class="rnote">Clamp readings are supporting evidence only. A snapshot reading is not a demand study and it never substitutes for the Section 8 calculation.</p>';
      }

      var r2 = j.review;
      h += '<h2>Master Review</h2><table><tbody>' + rowsFrom([
        ['Status', r2.approved ? 'Approved by ' + r2.reviewer + ' on ' + FC.stamp(r2.approvedAt) : 'Not approved'],
        ['Calculation path', r2.calcPath],
        ['Assumptions and gaps', r2.assumptions],
        ['Open questions', r2.openQuestions],
        ['Service conclusion', r2.conclusion],
        ['Conductor and overcurrent note', r2.conductorNote],
        ['Solar note', r2.solarNote],
        ['Next action', r2.nextAction],
        ['Code edition', FC.CEC_VERSION]
      ]) + '</tbody></table>';

      if (r2.overrides.length) {
        h += '<h3>Override log</h3><table><thead><tr><th>Field</th><th>From</th><th>To</th><th>Reason</th><th>By and when</th></tr></thead><tbody>' +
          r2.overrides.map(function (o) {
            return '<tr><td>' + U.esc(o.fieldChanged) + '</td><td>' + U.esc(o.priorValue) + '</td><td>' + U.esc(o.newValue) + '</td><td>' + U.esc(o.reason) + '</td><td>' + U.esc(o.changedBy + ', ' + FC.stamp(o.changedAt)) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }

      var pics = Object.keys(j.photos).filter(function (k) { return j.photos[k].data; });
      if (pics.length) {
        var labelOf = {};
        G.photoPackFor(j).forEach(function (p) { labelOf[p.k] = p.label; });
        h += '<h2 class="pb">Photo evidence</h2><div class="photos">' +
          pics.map(function (k) {
            var p = j.photos[k];
            return '<figure><img src="' + p.data + '" alt="' + U.esc(labelOf[k] || k) + '"><figcaption>' + U.esc(labelOf[k] || k) + '<br>' + U.esc(p.by || '') + ', ' + U.esc(FC.stamp(p.at)) + '</figcaption></figure>';
          }).join('') + '</div>';
      }

      h += '<div class="sig"><div>Field rep, ' + U.esc(FC.ROLES[j.rep].name) + '</div><div>Master Electrician, ' + U.esc(j.review.reviewer || 'not yet signed') + '</div></div>';
    }

    /* ---------------- proposal handoff ---------------- */
    if (kind === 'proposal') {
      h += '<div class="verdict"><div class="badge' + (j.review.approved ? ' good' : '') + '">' + (j.review.approved ? 'Released' : 'Not released') + '</div>' +
        '<div class="tx"><b>Scope facts for the proposal</b><p>' +
        (j.review.approved ? 'Master Review complete. These are the facts the proposal is written against.' : 'Master Review is not complete. Do not price from this sheet.') +
        '</p></div></div>';
      h += '<h2>Confirmed facts</h2><table><tbody>' + rowsFrom([
        ['Customer', cust], ['Address', addr],
        ['Authority', j.juris.authority], ['Wires owner', j.juris.utility],
        ['Service rating', evLine(j.service.serviceRating)],
        ['Main breaker', evLine(j.service.mainBreaker)],
        ['Bus rating', evLine(j.service.busRating)],
        ['Calculated demand', st.calc ? st.calc.amps.toFixed(1) + ' A' : 'Not available'],
        ['Calculation path', j.review.calcPath],
        ['Service conclusion', j.review.conclusion],
        ['Overhead or underground', j.service.overheadUnderground],
        ['Panel condition', j.service.panelCondition],
        ['Route notes', j.service.routeNotes]
      ]) + '</tbody></table>';
      h += '<h2>Still open</h2><table><thead><tr><th>Item</th><th>Owner</th><th>Due</th></tr></thead><tbody>' +
        st.packet.follow.map(function (f) { return '<tr><td>' + U.esc(f.item) + '</td><td>' + U.esc(f.owner) + '</td><td>' + U.esc(f.due || '') + '</td></tr>'; }).join('') +
        (j.review.openQuestions ? '<tr><td colspan="3">' + U.esc(j.review.openQuestions) + '</td></tr>' : '') +
        '</tbody></table>';
      h += '<h2>Utility boundary</h2><p>' + U.esc(j.juris.boundaryNotes || 'Not recorded. Write down who owns the trench, the conductors in the trench, the mast, the service head, the meter socket, the meter and the shutdown before anything is priced.') + '</p>';
    }

    h += '<div class="foot">' +
      '<b>' + (kind === 'customer' ? 'Scope of this summary. ' : 'Scope of this document. ') + '</b>' +
      U.esc(kind === 'customer'
        ? 'This is a summary of a site visit. It is not a quote, a design, a permit document or a code compliance statement.'
        : FC.INTERNAL_NOTICE) +
      '<br>' + U.esc(FC.FIELD_NOTICE) +
      '<br><b>Raydn Renewables.</b> Dmitry Naboka, Master Electrician, ME# 13824. 14 years in the trade. (780) 904-3462. info@raydnrenewables.com. ' +
      '<a href="https://raydnrenewables.com">raydnrenewables.com</a>' +
      '<br>' + U.esc(FC.CEC_VERSION) + ' Raydn FieldCalc ' + FC.version + '. Record ' + j.id + '.' +
      '</div>';

    host.innerHTML = h;
  }

  global.FCViews = {
    'w-solar': vSolar, status: vStatus, express: vExpress, wire: vWire,
    master: vMaster, reports: vReports,
    buildReport: buildReport
  };
})(window);
