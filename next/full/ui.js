/* Raydn CEC Load Calculator, interface layer */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const form = $('#form');
  const STORE = 'raydn-cec-loadcalc-v1';

  const RESIDENTIAL = ['single', 'apt-unit', 'apt-building'];
  const AREA_OCC = ['school', 'hospital', 'hotel'];

  const QUICK = [
    ['Hot tub or spa heater', 9600, 'tankless'],
    ['Tankless water heater', 14400, 'tankless'],
    ['Pool heater', 11000, 'tankless'],
    ['Storage tank water heater', 3000, 'other'],
    ['Clothes dryer', 5000, 'other'],
    ['Air handler or furnace blower', 1800, 'other'],
    ['Wall oven', 4800, 'other'],
    ['Cooktop', 7200, 'other'],
    ['Welder', 7200, 'other'],
    ['Garage or shop heater', 5000, 'other'],
    ['Well pump', 2200, 'other'],
    ['Steam shower', 6000, 'tankless']
  ];

  /* ---------- populate the static selects ---------- */
  const sysSel = $('#system');
  Object.keys(engineSystems()).forEach(k => {
    const o = document.createElement('option');
    o.value = k; o.textContent = engineSystems()[k].label;
    sysSel.appendChild(o);
  });
  const t14 = $('#table14Key');
  TABLE_14.forEach(t => {
    const o = document.createElement('option');
    o.value = t.key;
    o.textContent = t.label + ', ' + t.wpm2 + ' W/m2';
    t14.appendChild(o);
  });
  function engineSystems() { return SYSTEMS; }

  /* ---------- dynamic rows ---------- */
  const rowDefs = {
    appliance: {
      host: '#applianceRows',
      empty: 'No loads added yet.',
      make: (d) => {
        const wrap = document.createElement('div');
        const commercial = AREA_OCC.includes(occ()) || occ() === 'other';
        wrap.className = 'row' + (commercial ? ' norow' : '');
        wrap.innerHTML =
          '<input type="text" class="r-name" placeholder="Load description" value="' + esc(d.name || '') + '">' +
          '<div class="withunit"><input type="number" class="r-watts" min="0" step="10" placeholder="0" value="' + (d.watts || '') + '"><span>W</span></div>' +
          (commercial ? '' :
            '<select class="r-cat">' +
            '<option value="other"' + (d.cat !== 'tankless' ? ' selected' : '') + '>Other load over 1500 W</option>' +
            '<option value="tankless"' + (d.cat === 'tankless' ? ' selected' : '') + '>Tankless, pool, tub or spa heater</option>' +
            '</select>') +
          '<button type="button" class="del" aria-label="Remove">&times;</button>';
        return wrap;
      },
      read: (el) => ({
        name: el.querySelector('.r-name').value || 'Unnamed load',
        watts: Number(el.querySelector('.r-watts').value) || 0,
        cat: el.querySelector('.r-cat') ? el.querySelector('.r-cat').value : 'other'
      })
    },
    evse: {
      host: '#evseRows',
      empty: 'No chargers added yet.',
      make: (d) => {
        const wrap = document.createElement('div');
        wrap.className = 'row norow';
        wrap.innerHTML =
          '<input type="text" class="r-name" placeholder="Charger, and its maximum adjustable setting" value="' + esc(d.name || '') + '">' +
          '<div class="withunit"><input type="number" class="r-watts" min="0" step="10" placeholder="0" value="' + (d.watts || '') + '"><span>W</span></div>' +
          '<button type="button" class="del" aria-label="Remove">&times;</button>';
        return wrap;
      },
      read: (el) => ({
        name: el.querySelector('.r-name').value || 'EV supply equipment',
        watts: Number(el.querySelector('.r-watts').value) || 0
      })
    },
    runway: {
      host: '#runwayRows',
      empty: 'No future loads added yet.',
      make: (d) => {
        const wrap = document.createElement('div');
        wrap.className = 'row norow';
        wrap.innerHTML =
          '<input type="text" class="r-name" placeholder="Future load" value="' + esc(d.name || '') + '">' +
          '<div class="withunit"><input type="number" class="r-watts" min="0" step="10" placeholder="0" value="' + (d.watts || '') + '"><span>W</span></div>' +
          '<button type="button" class="del" aria-label="Remove">&times;</button>';
        return wrap;
      },
      read: (el) => ({
        name: el.querySelector('.r-name').value || 'Future load',
        watts: Number(el.querySelector('.r-watts').value) || 0
      })
    }
  };

  function esc(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function addRow(kind, data) {
    const def = rowDefs[kind];
    const host = $(def.host);
    const ph = host.querySelector('.empty');
    if (ph) ph.remove();
    const el = def.make(data || {});
    host.appendChild(el);
    el.querySelector('.del').addEventListener('click', () => { el.remove(); ensureEmpty(kind); recalc(); });
    el.addEventListener('input', recalc);
    el.addEventListener('change', recalc);
    return el;
  }
  function ensureEmpty(kind) {
    const host = $(rowDefs[kind].host);
    if (!host.querySelector('.row')) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = rowDefs[kind].empty;
      host.appendChild(p);
    }
  }
  function readRows(kind) {
    return Array.from($(rowDefs[kind].host).querySelectorAll('.row')).map(rowDefs[kind].read);
  }
  function clearRows(kind) { $(rowDefs[kind].host).innerHTML = ''; ensureEmpty(kind); }

  $$('[data-add]').forEach(b => b.addEventListener('click', () => { addRow(b.dataset.add); recalc(); }));

  // quick add chips
  const qa = $('#quickAdd');
  QUICK.forEach(([name, w, cat]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '+ ' + name;
    b.addEventListener('click', () => { addRow('appliance', { name, watts: w, cat }); recalc(); });
    qa.appendChild(b);
  });

  /* ---------- occupancy driven visibility ---------- */
  function occ() { return $('#occupancy').value; }

  function applyVisibility() {
    const o = occ();
    const isRes = RESIDENTIAL.includes(o);
    const isAreaOcc = AREA_OCC.includes(o);
    const isOther = o === 'other';

    show('#dwellingArea', isRes);
    show('#buildingArea', !isRes);
    show('#wrapExcl', o === 'single');
    show('#wrapClassroom', o === 'school');
    show('#wrapHighIntensity', o === 'hospital');
    show('#wrapSpecialLighting', o === 'hotel');
    show('#wrapShowWindow', isOther);
    show('#wrapTable14', isOther);
    show('#wrapTarget', isOther);
    show('#wrapCord', isAreaOcc);
    show('#cardApartment', o === 'apt-building');
    show('#cardRange', isRes);
    show('#wrapSpares', o === 'single' || o === 'apt-unit');

    $('#applianceHeading').textContent = isRes
      ? 'Heavy appliances and permanently connected loads'
      : 'Permanently connected equipment and special loads';
    $('#applianceLede').textContent = isRes
      ? 'Enter the nameplate rating of each load. Alberta STANDATA 24-ECB-008 requires the nameplate rating of each load over 1500 W to be used, and it puts a domestic hot water storage tank heater in the other loads group, not in the tankless group.'
      : 'Enter each permanently connected load at the rating of the equipment installed. Motors, process equipment, stage lighting and similar special loads belong here.';

    // rebuild appliance rows so the category column matches the occupancy
    const current = readRows('appliance');
    clearRows('appliance');
    current.forEach(r => addRow('appliance', r));
    if (!current.length) ensureEmpty('appliance');
  }
  function show(sel, on) { const el = $(sel); if (el) el.classList.toggle('hidden', !on); }

  $('#occupancy').addEventListener('change', () => { applyVisibility(); recalc(); });
  $('#system').addEventListener('change', () => {
    $('#systemHint').textContent = SYSTEMS[$('#system').value].note;
    recalc();
  });
  $('#evemsMode').addEventListener('change', () => {
    show('#wrapSetpoint', $('#evemsMode').value === 'setpoint');
    recalc();
  });

  /* ---------- gather ---------- */
  function val(n) { const e = form.elements[n]; return e ? e.value : ''; }
  function num(n) { return Number(val(n)) || 0; }

  function gather() {
    return {
      customer: val('customer'), address: val('address'),
      authority: val('authority'), utility: val('utility'),
      occupancy: occ(), system: val('system'),
      serviceA: num('serviceA'),
      panelSpacesFree: val('panelSpacesFree'),
      conductorTarget: val('conductorTarget'),
      table14Key: val('table14Key'),
      areaUnit: (form.elements['areaUnit'].value || 'sqft'),
      areaAbove: num('areaAbove'), areaBelow: num('areaBelow'),
      belowCeilingM: num('belowCeilingM'),
      areaExclBasement: num('areaExclBasement') || num('areaAbove'),
      buildingArea: num('buildingArea'), classroomArea: num('classroomArea'),
      highIntensityArea: num('highIntensityArea'),
      specialLightingW: num('specialLightingW'), showWindowM: num('showWindowM'),
      cordConnectedW: num('cordConnectedW'),
      heatW: num('heatW'), heatMode: val('heatMode'), coolW: num('coolW'),
      interlock: form.elements['interlock'].checked,
      rangeW: num('rangeW'),
      appliances: readRows('appliance'),
      evse: readRows('evse'),
      evemsMode: val('evemsMode'), evemsSetpointW: num('evemsSetpointW'),
      unitCount: num('unitCount'), nonDwellingW: num('nonDwellingW'), evCommonW: num('evCommonW'),
      stallCount: num('stallCount'), stallCircuit: val('stallCircuit'), stallControlled: val('stallControlled'),
      measuredPeakW: num('measuredPeakW'), newLoadsW: num('newLoadsW'),
      runway: readRows('runway')
    };
  }

  /* ---------- standard service sizes ---------- */
  const SERVICE_SIZES = [60, 100, 125, 150, 200, 225, 300, 400, 600, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000];
  function nextService(a) {
    for (const s of SERVICE_SIZES) if (s >= a) return s;
    return Math.ceil(a / 100) * 100;
  }
  const nf = n => Math.round(n).toLocaleString('en-CA');

  /* ---------- live results ---------- */
  let last = null;
  function recalc() {
    const inp = gather();
    const r = calculate(inp);
    last = { inp, r };
    save(inp);

    const box = $('#verdictBox');
    box.className = 'verdictbox v-' + r.verdict.code;
    $('#vLabel').textContent =
      r.verdict.code === 'PASS' ? 'Meets capacity' :
      r.verdict.code === 'TIGHT' ? 'Meets capacity, tight' :
      r.verdict.code === 'FAIL' ? 'Over capacity' : 'Enter a service rating';
    $('#vAmps').textContent = r.amps.toFixed(1);
    $('#vService').textContent = r.serviceA || '0';
    $('#vFill').style.width = Math.min(100, r.verdict.pct) + '%';

    const minSvc = nextService(r.amps);
    $('#vNote').textContent = !r.serviceA
      ? 'Enter the service rating to get a verdict.'
      : r.verdict.code === 'FAIL'
        ? 'The calculated load is ' + r.verdict.pct.toFixed(0) + ' percent of the ' + r.serviceA +
          ' A service. The smallest standard service that carries this calculation is ' + minSvc + ' A.'
        : 'The calculated load is ' + r.verdict.pct.toFixed(0) + ' percent of the ' + r.serviceA +
          ' A service, leaving ' + r.headroomA.toFixed(1) + ' A of headroom.';

    $('#sBasis').textContent = r.ruleRef;
    $('#sWatts').textContent = nf(r.totalW) + ' W';
    $('#sDiv').textContent = r.divisor.toFixed(0) + ' V';
    $('#sHead').textContent = r.headroomA.toFixed(1) + ' A';
    $('#sMin').textContent = minSvc + ' A';

    // itemised lines
    const ll = $('#liveLines');
    ll.innerHTML = '';
    const allLines = r.core.lines.concat(r.extraLines);
    allLines.forEach(l => {
      const d = document.createElement('div');
      d.className = 'll';
      d.innerHTML = '<span class="lab">' + esc(l.label) + '<span class="rule">' + esc(l.rule) + '</span></span>' +
        '<span class="w">' + nf(l.watts) + ' W</span>';
      ll.appendChild(d);
    });
    if (r.core.itemB > r.core.itemA && r.core.itemB > 0) {
      const d = document.createElement('div');
      d.className = 'll';
      d.innerHTML = '<span class="lab">Code minimum governs<span class="rule">' +
        (inp.occupancy === 'single' ? '8-200 1) b)' : '8-202 1) b)') + '</span></span><span class="w">' +
        nf(r.core.itemB) + ' W</span>';
      ll.appendChild(d);
    }
    const tot = document.createElement('div');
    tot.className = 'll total';
    tot.innerHTML = '<span class="lab">Total calculated load</span><span class="w">' +
      nf(r.totalW) + ' W, ' + r.amps.toFixed(1) + ' A</span>';
    ll.appendChild(tot);

    // flags
    const flags = buildFlags(inp, r);
    const fh = $('#liveFlags');
    fh.innerHTML = '';
    flags.forEach(f => {
      const d = document.createElement('div');
      d.className = 'flag' + (f.ok ? ' ok' : '');
      d.innerHTML = '<strong>' + esc(f.title) + '</strong>' + esc(f.body);
      fh.appendChild(d);
    });
  }

  function buildFlags(inp, r) {
    const out = [];
    if (r.core.itemB > r.core.itemA && r.core.itemB > 0) {
      out.push({
        title: 'The Code minimum is governing',
        body: 'The itemised loads total ' + nf(r.core.itemA) + ' W, which is below the minimum in ' +
          (inp.occupancy === 'single' ? 'Rule 8-200 1) b). ' : 'Rule 8-202 1) b). ') +
          'The calculation is carried at ' + nf(r.core.itemB) + ' W.'
      });
    }
    if ((Number(inp.heatW) > 0) && (Number(inp.coolW) > 0) && !inp.interlock) {
      out.push({
        title: 'No heating and cooling interlock declared',
        body: 'Both loads are counted in full. Rule 8-106 3) only permits the greater of the two where an interlock is installed. If an interlock exists, tick the box and the calculation drops.'
      });
    }
    if (r.core.area && r.core.area.belowRaw > 0 && !r.core.area.counts) {
      out.push({
        title: 'Below grade area is not being counted',
        body: 'Rule 8-110 c) only counts below grade area where the ceiling exceeds 1.8 m, measured to the lowest part of the ceiling assembly. Enter the height to include it.'
      });
    }
    if (r.core.ignored && r.core.ignored.length) {
      out.push({
        title: 'Loads at or under 1500 W were left out',
        body: r.core.ignored.map(a => a.name).join(', ') + '. Rule 8-200 1) a) vii) and Rule 8-202 1) a) viii) only reach loads with a rating in excess of 1500 W.'
      });
    }
    if (inp.evemsMode === 'exempt') {
      out.push({
        title: 'EVEMS exemption is claimed',
        body: 'Rule 8-106 11) only applies where the system monitors the service, feeders and branch circuits and controls the EVSE per Rule 8-500. EVEMS controls demand, it does not create service capacity.'
      });
    }
    if (r.evseMax) { /* reserved */ }
    if (r.spares) {
      out.push({
        ok: r.spares.ok,
        title: r.spares.ok ? 'Spare panel spaces are satisfied' : 'Spare panel spaces are short',
        body: r.spares.free + ' free against ' + r.spares.need + ' required by Rule ' + r.spares.rule + '. At the time of the original installation the panelboard needs at least ' + r.spares.need + ' additional spaces with provision for a two pole device.'
      });
    }
    if (r.alt) {
      const d = r.alt.total - r.totalW;
      out.push({
        title: 'The measured alternative disagrees by ' + nf(Math.abs(d)) + ' W',
        body: 'Rule 8-106 8) gives ' + nf(r.alt.total) + ' W, which is ' + r.altAmps.toFixed(1) +
          ' A, against ' + r.amps.toFixed(1) + ' A on the full calculation. Report both.'
      });
    }
    if (r.verdict.code === 'FAIL') {
      out.push({
        title: 'The service does not carry the calculated load',
        body: 'Rule 8-104 2), the calculated load in a consumer service shall not exceed the ampere rating of the circuit. The smallest standard service that clears is ' +
          nextService(r.amps) + ' A.'
      });
    }
    return out;
  }

  /* ---------- report ---------- */
  function buildReport() {
    if (!last) return;
    const { inp, r } = last;
    const now = new Date();
    const stamp = now.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    const unitLabel = inp.areaUnit === 'sqft' ? 'sq ft' : 'm2';

    const rows = r.core.lines.concat(r.extraLines).map(l =>
      '<tr><td class="rule">' + esc(l.rule) + '</td><td>' + esc(l.label) +
      '</td><td class="basis">' + esc(l.basis) + '</td><td class="num">' + nf(l.watts) + '</td></tr>'
    ).join('');

    let minRow = '';
    if (r.core.itemB > 0) {
      const governs = r.core.itemB > r.core.itemA;
      minRow = '<tr><td class="rule">' + (inp.occupancy === 'single' ? '8-200 1) b)' : '8-202 1) b)') +
        '</td><td>Code minimum calculated load</td><td class="basis">' + esc(r.core.itemBnote || '') +
        (governs ? '. This minimum governs because it exceeds the itemised total of ' + nf(r.core.itemA) + ' W'
                 : '. The itemised total of ' + nf(r.core.itemA) + ' W is greater, so it governs') +
        '</td><td class="num">' + nf(r.core.itemB) + '</td></tr>';
    }

    const rawRows = (r.core.rawLines || []).map(l =>
      '<tr><td class="rule">' + esc(l.rule) + '</td><td>' + esc(l.label) +
      '</td><td class="basis">' + esc(l.basis) + '</td><td class="num">' + nf(l.watts) + '</td></tr>'
    ).join('');

    const flags = buildFlags(inp, r).map(f =>
      '<div class="rp-flag' + (f.ok ? ' ok' : '') + '"><b>' + esc(f.title) + '</b>' + esc(f.body) + '</div>'
    ).join('');

    const runwayTable = r.runway.length
      ? '<h2>Future load runway</h2><table class="avoid"><thead><tr><th>Load added</th><th class="num">Load, W</th>' +
        '<th class="num">Running total, W</th><th class="num">Running total, A</th><th class="num">Against ' +
        (r.serviceA || 0) + ' A</th></tr></thead><tbody>' +
        r.runway.map(x =>
          '<tr><td>' + esc(x.name) + '</td><td class="num">' + nf(x.watts) + '</td><td class="num">' +
          nf(x.cumulativeW) + '</td><td class="num">' + x.amps.toFixed(1) + '</td><td class="num">' +
          (r.serviceA ? (x.amps / r.serviceA * 100).toFixed(0) + ' percent' : 'n/a') + '</td></tr>').join('') +
        '</tbody></table><p class="rp-note">This table shows where the service runs out, in the order the loads are likely to arrive. It is not a recommendation to install any of them.</p>'
      : '';

    const altBlock = r.alt
      ? '<h2>Measured demand alternative, Rule 8-106 8)</h2><table class="avoid"><thead><tr><th>Rule</th><th>Component</th>' +
        '<th class="num">Watts</th><th class="num">Amperes</th></tr></thead><tbody>' +
        '<tr><td class="rule">8-106 8)</td><td>Measured maximum demand over the most recent 12 month period</td><td class="num">' +
        nf(r.alt.peak) + '</td><td class="num">' + (r.alt.peak / r.divisor).toFixed(1) + '</td></tr>' +
        '<tr><td class="rule">8-106 8)</td><td>Additional loads with Code demand factors</td><td class="num">' +
        nf(r.alt.newLoads) + '</td><td class="num">' + (r.alt.newLoads / r.divisor).toFixed(1) + '</td></tr>' +
        '<tr class="sum"><td></td><td>Augmented calculated load</td><td class="num">' + nf(r.alt.total) +
        '</td><td class="num">' + r.altAmps.toFixed(1) + '</td></tr></tbody></table>' +
        '<p class="rp-note">Rule 8-106 8) permits the augmented load to be calculated from the measured 12 month peak plus the additional loads, subject to Rule 8-104 5) and 6). Against the ' +
        (r.serviceA || 0) + ' A service this is ' + (r.serviceA ? (r.altAmps / r.serviceA * 100).toFixed(0) + ' percent' : 'not assessed') +
        ', against ' + (r.serviceA ? r.verdict.pct.toFixed(0) + ' percent' : 'n/a') + ' on the full calculation. Both figures are reported because they answer different questions.</p>'
      : '';

    const apt = r.core.building
      ? '<h2>Dwelling unit basis, Rule 8-202 1)</h2><table class="avoid"><thead><tr><th>Rule</th><th>Component</th>' +
        '<th class="basis">Basis</th><th class="num">Watts</th></tr></thead><tbody>' +
        r.core.unit.lines.map(l => '<tr><td class="rule">' + esc(l.rule) + '</td><td>' + esc(l.label) +
          '</td><td class="basis">' + esc(l.basis) + '</td><td class="num">' + nf(l.watts) + '</td></tr>').join('') +
        '<tr class="sum"><td></td><td>Calculated load, one dwelling unit</td><td></td><td class="num">' +
        nf(r.core.unit.governing) + '</td></tr></tbody></table>' +
        '<p class="rp-note">Per unit load carried into the diversity ladder, with electric vehicle supply equipment, space heating and air conditioning removed first: ' +
        nf(r.core.building.perUnit) + ' W. Alberta STANDATA 24-ECB-008 requires the electric vehicle loads to be excluded during the derating step and added back at the final step at 100 percent so the service conductors are not undersized.</p>'
      : '';

    const html =
      '<div class="rp-head"><div><h1>Electrical Load Calculation</h1>' +
      '<p class="rp-sub">' + esc(r.title) + ', ' + esc(r.ruleRef) +
      '. CSA C22.1:24, the 2024 Canadian Electrical Code Part I, as adopted in Alberta on April 1, 2025.</p></div>' +
      '<div class="co"><b>Raydn Renewables</b>Dmitry Naboka, Master Electrician<br>ME# 13824<br>(780) 904-3462<br>info@raydnrenewables.com<br>raydnrenewables.com</div></div>' +

      '<div class="rp-meta">' +
      m('Customer', inp.customer) + m('Address', inp.address) +
      m('Permit authority', inp.authority) + m('Wire owner', inp.utility) +
      m('Occupancy', r.title) + m('System voltage', r.sys.label) +
      m('Service rating', (r.serviceA || 0) + ' A') + m('Date of calculation', stamp) +
      '</div>' +

      '<div class="rp-verdict rp-' + r.verdict.code + '"><span class="badge">' +
      (r.verdict.code === 'PASS' ? 'Meets capacity' : r.verdict.code === 'TIGHT' ? 'Meets capacity, tight' :
       r.verdict.code === 'FAIL' ? 'Over capacity' : 'Not assessed') + '</span>' +
      '<div class="vtext"><b>' + nf(r.totalW) + ' W, ' + r.amps.toFixed(1) + ' A calculated</b>' +
      (r.serviceA
        ? 'The calculated load is ' + r.verdict.pct.toFixed(0) + ' percent of the ' + r.serviceA +
          ' A service rating. ' +
          (r.verdict.code === 'FAIL'
            ? 'Rule 8-104 2) states that the calculated load in a consumer service, feeder or branch circuit shall not exceed the ampere rating of the circuit. The smallest standard rating that carries this calculation is ' + nextService(r.amps) + ' A.'
            : 'Headroom is ' + r.headroomA.toFixed(1) + ' A. Rule 8-104 1) makes the ampere rating of the service the lesser of the overcurrent device rating and the conductor ampacity, so both are to be confirmed in the field.')
        : 'No service rating was entered, so no capacity verdict was made.') +
      '</div></div>' +

      (rawRows ? '<h2>Connected load before demand factors</h2><table class="avoid"><thead><tr><th>Rule</th><th>Component</th>' +
        '<th class="basis">Basis</th><th class="num">Watts</th></tr></thead><tbody>' + rawRows +
        '<tr class="sum"><td></td><td>Balance of the load before demand factor</td><td></td><td class="num">' +
        nf(r.core.balanceRaw || 0) + '</td></tr></tbody></table>' : '') +

      apt +

      '<h2>Calculated load</h2><table><thead><tr><th style="width:15%">Rule</th><th style="width:22%">Component</th>' +
      '<th class="basis">Demand factor and basis</th><th class="num" style="width:11%">Watts</th></tr></thead><tbody>' +
      rows + minRow +
      '<tr class="sum"><td></td><td>Total calculated load</td><td>Governed by ' + esc(r.core.governingSource) +
      '. Converted to amperes at a divisor of ' + r.divisor.toFixed(0) + ' V, ' + esc(r.sys.note) +
      '</td><td class="num">' + nf(r.totalW) + '</td></tr>' +
      '<tr class="sum"><td></td><td>Calculated load in amperes</td><td></td><td class="num">' + r.amps.toFixed(1) + ' A</td></tr>' +
      '</tbody></table>' +
      '<p class="rp-note">Rule 8-200 3) and Rule 8-202 2) state that the total load calculated under those Rules is not to be considered a continuous load for the application of Rule 8-104, so the 80 percent factor of Rule 8-104 6) is not applied to the dwelling total. It still applies to individual continuous branch circuit loads.</p>' +

      altBlock + runwayTable +

      (flags ? '<h2>Notes and open items</h2>' + flags : '') +

      '<h2>Code basis</h2><table class="avoid"><thead><tr><th style="width:20%">Reference</th><th>What it governs in this calculation</th></tr></thead><tbody>' +
      cb('CSA C22.1:24, Section 8', 'Circuit loading and demand factors. Declared in force in Alberta on April 1, 2025.') +
      cb('Rule 8-100', 'Current calculations and the voltage divisor used to convert watts to amperes.') +
      cb('Rule 8-104', 'Maximum circuit loading. The ampere rating of a service is the lesser of the overcurrent device rating and the conductor ampacity.') +
      cb('Rule 8-106 3)', 'The greater of space heating and air conditioning may be used only where interlocks are installed.') +
      cb('Rule 8-106 8)', 'Augmented load from the measured 12 month maximum demand plus the additional loads.') +
      cb('Rule 8-106 10) and 11)', 'Electric vehicle energy management systems. Demand equals the maximum the system allows, or the load is not counted where the system monitors the service, feeders and branch circuits and controls per Rule 8-500.') +
      cb('Rule 8-108', 'Spare spaces for future overcurrent devices, four in a single dwelling and two in an apartment dwelling unit.') +
      cb('Rule 8-110', 'Determination of living area. 100 percent above grade, 75 percent of below grade area exceeding 1.8 m in height.') +
      cb('Rule ' + r.ruleRef.replace(/^Rule /, ''), 'The calculated load for the service or feeder for this occupancy.') +
      cb('Rule 62-118', 'Demand factors for electric space heating. First 10 kW at 100 percent then 75 percent with thermostatic control in each heated area, and 100 percent for a furnace, duct heater or thermal storage system.') +
      (r.extraLines.length ? cb('Rule 8-400', 'Branch circuits and feeders supplying heater receptacles for vehicles powered by flammable or combustible fuels, calculated separately with its own demand factor and then added.') : '') +
      cb('Alberta STANDATA 24-ECB-008', 'Section 8 circuit loading and demand factors, April 2025. Storage tank water heaters belong in the other loads item, tankless and spa heaters in the 100 percent item, nameplate ratings are used for loads over 1500 W, and electric vehicle loads are excluded from the apartment derating step and added back at 100 percent.') +
      cb('Alberta STANDATA 24-ECI-086', 'Adjustable electric vehicle supply equipment is counted at its maximum adjustable setting. A lower setting may be accepted only where the equipment has a manual switch inside it and an electrician is required to set the load.') +
      '</tbody></table>' +

      '<div class="rp-sig"><div><div class="line"></div>Dmitry Naboka, Master Electrician, ME# 13824<br>Raydn Renewables</div>' +
      '<div><div class="line"></div>Reviewed by, date</div></div>' +

      '<div class="rp-foot"><b>Basis and limits.</b> This calculation was produced from the values entered above. ' +
      'Floor areas are to be taken from the municipal property record and measured field dimensions, not estimated. ' +
      'Nameplate ratings are to be read off the equipment. The permit authority and the wire owner are set by the civic address and are to be confirmed before any work is scheduled. ' +
      'A bus rating is not demand approval. This document states what the Rules require and what was calculated. The inspector having jurisdiction makes the compliance determination on the day.<br><br>' +
      '<b>Sources.</b><br>' +
      'CSA C22.1:24, Canadian Electrical Code Part I, 26th edition, Section 8 and Section 62, read verbatim from the book.<br>' +
      'Alberta electrical codes in force, Municipal Affairs: <a href="https://www.alberta.ca/electrical-codes-and-standards">alberta.ca/electrical-codes-and-standards</a><br>' +
      'Electrical STANDATA index: <a href="https://www.alberta.ca/electrical-standata">alberta.ca/electrical-standata</a><br>' +
      'STANDATA 24-ECB-008, Section 8 circuit loading and demand factors, April 2025: <a href="https://open.alberta.ca/dataset/1d00b178-0415-40da-a6ab-f53355be316d/resource/5709b38b-6c23-4164-b2d9-bb7fe4bdf336/download/ma-standata-bulletin-24-ecb-008-2025-04.pdf">open.alberta.ca, ma-standata-bulletin-24-ecb-008-2025-04.pdf</a><br>' +
      'STANDATA 24-ECI-086, adjustable EVSE settings, April 2025: <a href="https://open.alberta.ca/dataset/31a89916-44cb-499e-a4f7-ad4c88c00a35/resource/990f5d7c-787a-4d6f-9675-a1e8e9ea46b9/download/ma-standata-interpretation-electrical-24-eci-086-2025-04.pdf">open.alberta.ca, ma-standata-interpretation-electrical-24-eci-086-2025-04.pdf</a><br><br>' +
      'Raydn Renewables. Dmitry Naboka, Master Electrician, ME# 13824. (780) 904-3462. info@raydnrenewables.com. raydnrenewables.com. Generated ' + stamp + '.</div>';

    $('#report').innerHTML = html;

    function m(k, v) {
      return '<div><span>' + esc(k) + '</span><b>' + esc(v || 'To be confirmed') + '</b></div>';
    }
    function cb(k, v) {
      return '<tr><td class="rule">' + esc(k) + '</td><td class="basis">' + esc(v) + '</td></tr>';
    }
  }

  $('#printBtn').addEventListener('click', () => {
    buildReport();
    setTimeout(() => window.print(), 60);
  });

  $('#copyBtn').addEventListener('click', () => {
    if (!last) return;
    const { inp, r } = last;
    const txt = [
      'Load calculation, ' + r.title + ', ' + r.ruleRef,
      inp.customer ? 'Customer: ' + inp.customer : '',
      inp.address ? 'Address: ' + inp.address : '',
      'System: ' + r.sys.label,
      ''
    ].filter(Boolean)
      .concat(r.core.lines.concat(r.extraLines).map(l => l.rule + '  ' + l.label + ': ' + nf(l.watts) + ' W'))
      .concat([
        '',
        'Total calculated load: ' + nf(r.totalW) + ' W, ' + r.amps.toFixed(1) + ' A',
        'Service rating: ' + (r.serviceA || 0) + ' A',
        'Result: ' + (r.verdict.code === 'PASS' ? 'meets capacity' : r.verdict.code === 'TIGHT' ? 'meets capacity but tight' : r.verdict.code === 'FAIL' ? 'over capacity' : 'not assessed'),
        r.alt ? 'Rule 8-106 8) alternative: ' + nf(r.alt.total) + ' W, ' + r.altAmps.toFixed(1) + ' A' : '',
        '',
        'Basis: CSA C22.1:24 Section 8, Alberta STANDATA 24-ECB-008 and 24-ECI-086.'
      ].filter(Boolean)).join('\n');
    navigator.clipboard.writeText(txt).then(() => {
      const b = $('#copyBtn'); const o = b.textContent;
      b.textContent = 'Copied'; setTimeout(() => b.textContent = o, 1600);
    });
  });

  /* ---------- persistence ----------
     In memory for the session. The preview host blocks browser storage APIs,
     so state is held in a variable and rebuilt from the form on every change.
     Use Print to PDF to keep a calculation. */
  let memStore = null;
  function save(inp) {
    try { memStore = JSON.stringify(inp); } catch (e) {}
  }
  function load() {
    try {
      if (!memStore) return null;
      return JSON.parse(memStore);
    } catch (e) { return null; }
  }
  function apply(d) {
    if (!d) return;
    Object.keys(d).forEach(k => {
      const el = form.elements[k];
      if (!el || ['appliances', 'evse', 'runway', 'areaUnit'].includes(k)) return;
      if (el.type === 'checkbox') el.checked = !!d[k];
      else if (el.value !== undefined) el.value = d[k];
    });
    if (d.areaUnit) {
      const radios = form.elements['areaUnit'];
      Array.from(radios).forEach(r => r.checked = (r.value === d.areaUnit));
    }
    applyVisibility();
    show('#wrapSetpoint', d.evemsMode === 'setpoint');
    ['appliance:appliances', 'evse:evse', 'runway:runway'].forEach(pair => {
      const [kind, key] = pair.split(':');
      clearRows(kind);
      (d[key] || []).forEach(x => addRow(kind, x));
      ensureEmpty(kind);
    });
  }

  /* ---------- demo ---------- */
  const DEMO = {
    customer: 'Worked example, new build with an EV charger',
    address: 'Spruce Grove, Alberta',
    authority: 'City of Spruce Grove',
    utility: 'FortisAlberta',
    occupancy: 'single', system: '120/240-1p', serviceA: 100, panelSpacesFree: 2,
    areaUnit: 'sqft', areaAbove: 2400, areaBelow: 1100, belowCeilingM: 2.4, areaExclBasement: 2400,
    heatW: 0, heatMode: 'thermostat', coolW: 0, interlock: false,
    rangeW: 13000,
    appliances: [{ name: 'Clothes dryer', watts: 5000, cat: 'other' }],
    evse: [{ name: 'Portable 40 A charger on a 14-50 receptacle', watts: 9600 }],
    evemsMode: 'none', evemsSetpointW: 0,
    stallCount: 0, stallCircuit: '15', stallControlled: 'no',
    measuredPeakW: 0, newLoadsW: 0,
    runway: [
      { name: 'Air conditioning', watts: 5760 },
      { name: 'Basement development', watts: 1000 },
      { name: 'Hot tub', watts: 9600 },
      { name: 'Second range', watts: 6400 }
    ]
  };

  $('#demoBtn').addEventListener('click', () => { apply(DEMO); recalc(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#resetBtn').addEventListener('click', () => {
    form.reset();
    ['appliance', 'evse', 'runway'].forEach(clearRows);
    memStore = null;
    applyVisibility(); recalc();
  });

  form.addEventListener('input', recalc);
  form.addEventListener('change', recalc);

  /* ---------- boot ---------- */
  $('#systemHint').textContent = SYSTEMS[$('#system').value].note;
  ['appliance', 'evse', 'runway'].forEach(ensureEmpty);
  const saved = load();
  if (saved) apply(saved); else applyVisibility();
  recalc();
})();
