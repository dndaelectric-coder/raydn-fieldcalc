/* =========================================================================
   Raydn FieldCalc  ::  fc-gates.js
   Packet completeness, hold conditions, status computation, and the bridge
   from a walkdown record into the validated CEC engine in engine.js.

   Nothing in here releases a conclusion. It produces a preliminary reading
   and a list of what is missing. Only Master Review releases anything.
   ========================================================================= */
(function (global) {
  'use strict';

  var FC = global.FC;
  var evVal = FC.evVal, evNum = FC.evNum, evKnown = FC.evKnown;

  function has(v) { return String(evVal(v) === undefined ? '' : evVal(v)).trim() !== ''; }
  function n0(v) { var x = evNum(v); return x === null ? 0 : x; }

  function photoPackFor(job) {
    var pack = FC.PHOTO_PACK.slice();
    if (job.types.indexOf('solar') >= 0) pack = pack.concat(FC.PHOTO_SOLAR);
    return pack;
  }

  /* ------------------------------------------------------------------
     Completeness
     ------------------------------------------------------------------ */
  function packet(job) {
    var missing = [], blockers = [], follow = [], total = 0, done = 0;
    function need(ok, label, blocking) {
      total++;
      if (ok) done++;
      else { missing.push(label); if (blocking) blockers.push(label); }
    }

    var h = job.header, ju = job.juris;
    need(has(h.customer), 'Customer name', true);
    need(has(h.address), 'Service address', true);
    need(has(h.phone) || has(h.email), 'Phone or email', false);
    need(has(h.leadSource), 'Lead source', false);
    need(has(h.request), 'Customer request in their own words', false);
    need(job.types.length > 0, 'At least one job type', true);

    need(has(ju.preset), 'Jurisdiction selected', true);
    need(has(ju.authority), 'Inspection authority named', true);
    need(has(ju.utility), 'Wires owner named', true);
    if (job.types.indexOf('solar') >= 0) need(has(ju.retailer), 'Retailer for solar', false);

    var s = job.service;
    need(evKnown(s.serviceRating), 'Existing service rating', true);
    need(evKnown(s.mainBreaker), 'Main breaker rating', true);
    need(evKnown(s.busRating), 'Panel bus rating', true);
    need(evKnown(s.panelMakeModel), 'Panel make and model', false);
    need(has(s.spacesFree), 'Spaces available', false);
    need(has(s.meterLocation), 'Meter location', false);
    need(has(s.overheadUnderground), 'Overhead or underground service', true);
    need(has(s.panelLocation), 'Panel location', false);
    need(has(s.panelCondition), 'Panel condition', false);

    need(n0(job.areas.above) > 0, 'Above grade living area', true);
    need(has(job.areas.aboveSource), 'Where the living area came from', false);
    need(has(job.areas.hasBasement), 'Basement, yes or no', true);
    if (job.areas.hasBasement === 'Yes') {
      need(n0(job.areas.below) > 0, 'Below grade area', true);
      need(n0(job.areas.belowHeight) > 0 || job.areas.belowClass === 'over' || job.areas.belowClass === 'under', 'Basement ceiling height', true);
    }

    photoPackFor(job).forEach(function (p) {
      var rec = job.photos[p.k];
      var st = rec && rec.state;
      var ok = false;
      if (st === 'Captured') ok = !!rec.data;
      else if (st) ok = String(rec.reason || '').trim() !== '' && String(rec.owner || '').trim() !== '';
      need(ok, 'Photo: ' + p.label, p.req && !st);
      if (st && st !== 'Captured' && st !== 'Not applicable') {
        follow.push({ item: p.label, state: st, reason: rec.reason || '', owner: rec.owner || '', due: rec.due || '' });
      }
    });

    if (job.types.indexOf('ev') >= 0) {
      need(evKnown(job.ev.amps) || evKnown(job.ev.mocp) || evKnown(job.ev.mca), 'EVSE nameplate amperes, MCA or MOCP', true);
      need(has(job.ev.location), 'EVSE location', false);
      need(has(job.ev.status), 'EV status, confirmed or planned', false);
      need(has(job.ev.chargerMakeModel), 'Charger make and model', false);
    }
    if (job.types.indexOf('tub') >= 0) {
      need(evKnown(job.tub.amps) || evKnown(job.tub.mocp), 'Hot tub nameplate amperes or MOCP', true);
      need(has(job.tub.disconnect), 'Hot tub disconnect location', false);
      need(has(job.tub.state), 'Hot tub existing or proposed', false);
    }
    if (job.types.indexOf('ac') >= 0 || job.types.indexOf('hp') >= 0) {
      need(evKnown(job.hvac.mca) || evKnown(job.hvac.mocp), 'Outdoor unit MCA or MOCP', true);
      need(evKnown(job.hvac.outdoorMakeModel), 'Outdoor unit make and model', false);
      need(has(job.hvac.interlock), 'Heating and cooling simultaneous operation status', false);
    }
    if (job.types.indexOf('solar') >= 0) {
      var months = job.solar.months || [];
      var filled = months.filter(function (m) { return m && n0(m.kwh) > 0; }).length;
      need(filled >= 12, 'Twelve months of measured kWh', true);
      need(months.filter(function (m) { return m && m.status; }).length >= 12, 'Bill quality flag on every month', false);
      need(has(job.solar.occupancy), 'Seasonal occupancy pattern', true);
      need(has(job.solar.roofMaterial), 'Roof material', false);
      need(evKnown(job.solar.roofCondition), 'Roof condition', false);
      need((job.solar.planes || []).length > 0, 'At least one roof plane recorded', true);
      need(has(job.solar.inverterLocation), 'Proposed inverter location', false);
    }

    return {
      total: total, done: done, missing: missing, blockers: blockers, follow: follow,
      pct: total ? Math.round(done / total * 100) : 0
    };
  }

  /* ------------------------------------------------------------------
     Hold conditions. Anything here forces Master Review Hold.
     ------------------------------------------------------------------ */
  function holds(job) {
    var out = [];
    if (job.juris.preset === 'unknown' || !job.juris.preset) {
      out.push('Jurisdiction or wires owner is not resolved. ' + FC.JURISDICTION_WARNING);
    }
    if (job.occupancyPath && job.occupancyPath !== 'single') {
      out.push('Occupancy path is ' + job.occupancyPath + '. That does not run on the Rule 8-200 single dwelling path and needs the Master Electrician to pick the calculation route.');
    }
    var s = job.service;
    var bus = evNum(s.busRating), main = evNum(s.mainBreaker), rating = evNum(s.serviceRating);
    if (bus !== null && main !== null && bus !== main) {
      out.push('Panel bus is ' + bus + ' A and the main is ' + main + ' A. A ' + bus + ' A rated panel with a ' + main + ' A main is not a ' + bus + ' A service.');
    }
    if (rating !== null && main !== null && rating !== main) {
      out.push('Recorded service rating is ' + rating + ' A and the main breaker is ' + main + ' A. Those are separate facts and they disagree.');
    }
    if ((job.types.indexOf('ac') >= 0 || job.types.indexOf('hp') >= 0) && !job.hvac.interlock) {
      out.push('Simultaneous operation of heating and cooling is not recorded. Rule 8-106 3) only permits the greater of the two where interlocks are installed.');
    }
    (job.loads || []).forEach(function (L) {
      var known = evKnown(L.w) || evKnown(L.va) || evKnown(L.amps) || evKnown(L.mca);
      if (!known && L.state !== 'Existing, being removed') {
        out.push('Load "' + (L.kind || 'unnamed') + '" has no nameplate data. Placeholder only, the final service result cannot be released.');
      }
    });
    (job.flags || []).forEach(function (f) {
      if (f.severity === 'Safety risk' || f.severity === 'Blocker') {
        out.push('Site flag, ' + f.severity.toLowerCase() + ': ' + (f.note || 'no detail recorded'));
      }
    });
    dataWarnings(job).forEach(function (w) { out.push(w); });
    return out;
  }

  /* ------------------------------------------------------------------
     Bridge into engine.js
     ------------------------------------------------------------------ */
  var SYS_MAP = {
    '120/240 V single phase, 3 wire': '120/240-1p',
    '120/208 V, 3 wire from a 3 phase 4 wire supply': '120/208-3w',
    '120/208 V, 3 phase 4 wire': '120/208-3p',
    '347/600 V, 3 phase 4 wire': '347/600-3p'
  };

  /* A card can carry a count of identical units, six baseboards at 1500 W.
     The count multiplies the rating and the basis says so. */
  function loadWatts(L) {
    var r = loadWattsOne(L);
    var q = Math.round(Number(L && L.qty) || 1);
    if (r && q > 1) { r.w = r.w * q; r.basis = q + ' units at ' + r.basis; r.qty = q; }
    return r;
  }
  function loadWattsOne(L) {
    var stated = evNum(L.voltage);
    var v = stated || 240;
    var vTag = stated ? '' : ' (voltage not recorded, 240 V assumed)';
    var assumedV = !stated;
    if (evNum(L.w) !== null) return { w: evNum(L.w), basis: 'nameplate watts' };
    if (evNum(L.va) !== null) return { w: evNum(L.va), basis: 'nameplate VA' };
    if (evNum(L.amps) !== null) return { w: evNum(L.amps) * v, basis: evNum(L.amps) + ' A at ' + v + ' V' + vTag, assumedVoltage: assumedV };
    if (evNum(L.mca) !== null) return { w: evNum(L.mca) * v, basis: 'MCA ' + evNum(L.mca) + ' A at ' + v + ' V' + vTag, assumedVoltage: assumedV };
    if (evNum(L.mocp) !== null) return { w: evNum(L.mocp) * v, basis: 'MOCP ' + evNum(L.mocp) + ' A at ' + v + ' V' + vTag, assumedVoltage: assumedV, fromMocp: true };
    return null;
  }

  /* ------------------------------------------------------------------
     Input integrity. One place that decides whether the numbers going
     into the engine are trustworthy. holds() reads this, so a data
     problem can never reach a status without being written down.
     ------------------------------------------------------------------ */
  var AC_KINDS = ['ac condenser', 'heat pump outdoor'];
  function isKind(L, list) {
    var k = (L.kind || '').toLowerCase();
    return list.some(function (x) { return k.indexOf(x) >= 0; });
  }
  function assumedFields(job) {
    var hits = [];
    function look(o, label) {
      if (o && typeof o === 'object' && String(o.value || '').trim() !== '' && o.source === 'Assumption') hits.push(label);
    }
    var s = job.service;
    look(s.serviceRating, 'Existing service rating');
    look(s.mainBreaker, 'Main breaker rating');
    look(s.busRating, 'Panel bus rating');
    look(s.panelMakeModel, 'Panel make and model');
    look(s.serviceConductors, 'Service conductors');
    look(job.ev.amps, 'EVSE amperes'); look(job.ev.mca, 'EVSE MCA'); look(job.ev.mocp, 'EVSE MOCP');
    look(job.tub.amps, 'Hot tub amperes'); look(job.tub.mocp, 'Hot tub MOCP');
    look(job.hvac.mca, 'Outdoor unit MCA'); look(job.hvac.mocp, 'Outdoor unit MOCP');
    look(job.hvac.backupHeatKw, 'Backup heat');
    if (job.areas.aboveSource === 'Assumption') hits.push('Above grade living area');
    (job.loads || []).forEach(function (L) {
      ['w', 'va', 'amps', 'mca', 'mocp'].forEach(function (f) {
        look(L[f], (L.kind || 'Load') + ' ' + f);
      });
    });
    return hits;
  }
  function dataWarnings(job) {
    var out = [];
    var loads = job.loads || [];

    /* duplicate entry: the same equipment on its own screen and as a load card */
    var tubScreen = evNum(job.tub.amps) !== null || evNum(job.tub.mocp) !== null;
    var evScreen = evNum(job.ev.amps) !== null || evNum(job.ev.mca) !== null || evNum(job.ev.mocp) !== null;
    if (job.types.indexOf('tub') >= 0 && tubScreen && loads.some(function (L) { return isKind(L, ['tub', 'spa']) && L.state !== 'Existing, being removed' && L.state !== 'Future, not used for sizing'; })) {
      out.push('The hot tub is recorded on the hot tub screen and again as a load card. Only one of them is counted now, but delete the duplicate so the record is clean.');
    }
    if (job.types.indexOf('ev') >= 0 && evScreen && loads.some(function (L) { return isKind(L, ['evse']); })) {
      out.push('The charger is recorded on the EV screen and again as a load card. Only the load card is counted. Delete the duplicate so the record is clean.');
    }

    /* a cooling or heat pump card with the job type not ticked */
    var orphanAc = loads.filter(function (L) { return isKind(L, AC_KINDS) && L.state !== 'Existing, being removed'; });
    if (orphanAc.length && job.types.indexOf('ac') < 0 && job.types.indexOf('hp') < 0) {
      if (!job.hvac.interlock && heatParts(job).H > 0) out.push('A cooling or heat pump load card is recorded with electric heat in the house, and nobody has recorded whether the two can run together. Both are counted until an interlock is confirmed under Rule 8-106 3).');
    }

    /* more than one cooking appliance */
    var ranges = loads.filter(function (L) { return isKind(L, ['range', 'cooktop', 'oven']) && L.state !== 'Existing, being removed' && L.state !== 'Future, not used for sizing'; });
    if (ranges.length > 1) {
      out.push('There are ' + ranges.length + ' cooking appliances recorded. Rule 8-200 1) a) iv) covers a single range. The first one is taken as the range and the rest are counted as other loads. The Master Electrician needs to confirm that split.');
    }

    /* a breaker rating standing in for a load */
    function mocpOnly(o, mo, label, rule) {
      if (evNum(o) === null && mo !== undefined && evNum(mo) !== null) {
        out.push(label + ' is sized from the ' + evNum(mo) + ' A overcurrent device because no nameplate load was recorded. A breaker rating is not a load. This overstates the calculation. Get the nameplate.');
      }
    }
    if (job.types.indexOf('ev') >= 0) mocpOnly(job.ev.amps, job.ev.mocp, 'The charger');
    if (job.types.indexOf('tub') >= 0) mocpOnly(job.tub.amps, job.tub.mocp, 'The hot tub');
    if (job.types.indexOf('ac') >= 0 || job.types.indexOf('hp') >= 0) mocpOnly(job.hvac.mca, job.hvac.mocp, 'The outdoor unit');
    loads.forEach(function (L) {
      var lw = loadWatts(L);
      if (lw && lw.fromMocp) out.push('Load "' + (L.kind || 'unnamed') + '" is sized from its breaker rating because no nameplate load was recorded. A breaker rating is not a load.');
      if (lw && lw.assumedVoltage) out.push('Load "' + (L.kind || 'unnamed') + '" has amperes but no voltage. 240 V was assumed. If it is a 120 V load this doubles it. Record the voltage.');
    });

    /* the basement */
    if (job.areas.hasBasement === 'Yes') {
      if (n0(job.areas.below) <= 0) out.push('The basement is recorded as present but its area is blank, so Rule 8-110 c) is counting zero. Measure it.');
      if (n0(job.areas.belowHeight) <= 0 && job.areas.belowClass !== 'over' && job.areas.belowClass !== 'under') out.push('Basement ceiling height is blank. Rule 8-110 c) turns on at 1.8 m. Measure it, do not leave the default.');
    }

    /* assumptions */
    var as = assumedFields(job);
    if (as.length) {
      out.push('There ' + (as.length === 1 ? 'is 1 value' : 'are ' + as.length + ' values') + ' recorded with the source set to Assumption: ' + as.join(', ') + '. An assumed value cannot support a released result. Replace each one with a nameplate photo, a field measurement or a municipal record.');
    }
    return out;
  }

  /* Rule 8-106 8) alternative. The number wanted is the measured maximum
     DEMAND of the existing installation over the most recent 12 months, which
     is not the same thing as a kWh total off a bill. It only counts when a
     demand figure was actually read from somewhere, so it is entered by hand
     with its source named and it stays at zero until it is. */
  function measuredPeakW(job) {
    var m = (job.service && job.service.measured) || {};
    if (!m.source || !m.window) return 0;
    var v = n0(job.service.supplyVoltage === '120/208 V, 3 wire' ? 208 : 240) || 240;
    if (m.unit === 'A') return (n0(m.value) || 0) * v;
    if (m.unit === 'kW') return (n0(m.value) || 0) * 1000;
    return n0(m.value) || 0;
  }

  /* ------------------------------------------------------------------
     Which picture of the house a load belongs to.
       today   what is connected right now: staying, coming out, or blank
       after   what is connected when the job is done
       future  after, plus everything marked maybe later
     A walkdown screen (EV, hot tub, HVAC) with no state is the job lane
     itself, so it reads as proposed.
     ------------------------------------------------------------------ */
  var FUTURE = 'Future, not used for sizing', REMOVED = 'Existing, being removed', PROPOSED = 'Proposed';
  function inScope(state, scope) {
    state = state || '';
    if (state === FUTURE) return scope === 'future';
    if (scope === 'today') return state !== PROPOSED;
    return state !== REMOVED;
  }

  /* Heating and cooling parts. Room heaters on their own thermostats take the
     Rule 62-118 3) demand. An electric furnace, duct heater or backup strip
     is 100 percent under Rule 62-118 4). A heat pump outdoor unit heats and
     cools, so it sits on both sides of the Rule 8-106 3) comparison. */
  var ROOM_HEAT = ['baseboard', 'in-floor', 'garage or shop heater', 'wall heater', 'unit heater', 'space heater'];
  var CENTRAL_HEAT = ['furnace', 'air handler', 'backup heat', 'duct heater', 'thermal storage'];
  function heatClass(L) {
    var k = (L.kind || '').toLowerCase();
    if (k.indexOf('heat pump outdoor') >= 0) return 'hp';
    if (k.indexOf('ac condenser') >= 0) return 'ac';
    if (CENTRAL_HEAT.some(function (x) { return k.indexOf(x) >= 0; })) return 'central';
    if (ROOM_HEAT.some(function (x) { return k.indexOf(x) >= 0; })) return 'room';
    return '';
  }
  function isRange(L) {
    var k = (L.kind || '').toLowerCase();
    return k.indexOf('range') >= 0 || k.indexOf('cooktop') >= 0 || k.indexOf('oven') >= 0;
  }
  function room62(w) { return w > 0 ? Math.min(w, 10000) + Math.max(0, w - 10000) * 0.75 : 0; }
  function fmtW(w) { return Math.round(Number(w) || 0).toLocaleString('en-CA'); }
  function sumW(list) { return list.reduce(function (t, x) { return t + x.w; }, 0); }

  function toEngine(job, opts) {
    opts = opts || {};
    var scope = opts.scope || 'after';
    var skip = opts.skip || null;          // one load, or 'ev' 'tub' 'hvac', left out for a per load difference
    var s = job.service, a = job.areas;
    var loads = job.loads || [];
    var appliances = [], evse = [], notes = [];
    var hc = { room: [], central: [], hp: [], ac: [] };
    /* Rule 8-106 8) needs the additional loads kept separate from the existing
       ones, because the measured peak already contains everything existing.
       Counting an existing load again would inflate the augmented total. */
    var newW = 0;
    function addNew(state, w) { if ((state || '') === PROPOSED) newW += w; }

    loads.forEach(function (L) {
      if (L === skip) return;
      if (!inScope(L.state, scope)) {
        if (L.state === FUTURE && scope !== 'future') notes.push('"' + L.kind + '" marked future and excluded from sizing.');
        return;
      }
      var lw = loadWatts(L);
      if (!lw) return;
      var k = (L.kind || '').toLowerCase();
      var nm = (L.kind || 'Load') + (evVal(L.makeModel) ? ', ' + evVal(L.makeModel) : '');
      if (k.indexOf('evse') >= 0) { evse.push({ name: nm, watts: lw.w }); addNew(L.state, lw.w); return; }
      if (isRange(L)) return;                                   // handled below
      if (k.indexOf('solar inverter') >= 0 || k.indexOf('battery') >= 0) return;
      var hk = heatClass(L);
      if (hk === 'ac' || hk === 'hp') return;                   // handled below
      if (hk === 'central' && lw.w <= 1500) {
        /* A gas furnace blower is a motor under 1500 W, not electric heat. */
        appliances.push({ name: nm + ', blower only', watts: lw.w, cat: 'other' });
        notes.push('"' + L.kind + '" is ' + fmtW(lw.w) + ' W, which reads as a fan or blower, not electric heat.');
        addNew(L.state, lw.w);
        return;
      }
      if (hk) { hc[hk].push({ name: nm, w: lw.w }); addNew(L.state, lw.w); return; }
      var cat = 'other';
      if (k.indexOf('tub') >= 0 || k.indexOf('spa') >= 0 || k.indexOf('tankless') >= 0 || k.indexOf('pool') >= 0 || k.indexOf('steam') >= 0) cat = 'tankless';
      appliances.push({ name: nm, watts: lw.w, cat: cat });
      addNew(L.state, lw.w);
    });

    if (job.types.indexOf('ev') >= 0 && !evse.length && skip !== 'ev' && inScope(PROPOSED, scope)) {
      var v = Number(job.ev.voltage) || 240;
      var a1 = evNum(job.ev.amps), a2 = evNum(job.ev.mca), a3 = evNum(job.ev.mocp);
      var amp = a1 !== null ? a1 : (a2 !== null ? a2 : a3);
      if (amp !== null) { evse.push({ name: job.ev.chargerMakeModel || 'EVSE', watts: amp * v }); newW += amp * v; }
    }
    var tubCarded = appliances.some(function (x) { return x.cat === 'tankless' && /tub|spa/i.test(x.name); });
    var tubState = job.tub.state || PROPOSED;
    if (job.types.indexOf('tub') >= 0 && !tubCarded && skip !== 'tub' && inScope(tubState, scope)) {
      var tv = Number(job.tub.voltage) || 240;
      var ta = evNum(job.tub.amps);
      if (ta === null) ta = evNum(job.tub.mocp);
      if (ta !== null) { appliances.push({ name: 'Hot tub or spa' + (evVal(job.tub.makeModel) ? ', ' + evVal(job.tub.makeModel) : ''), watts: ta * tv, cat: 'tankless' }); addNew(tubState, ta * tv); }
    }

    /* The HVAC screen, then the cooling cards. A card never vanishes: with the
       screen empty, a cooling or heat pump card is counted from the card. */
    var hvState = job.hvac.state || PROPOSED;
    var screenW = 0;
    if ((job.types.indexOf('ac') >= 0 || job.types.indexOf('hp') >= 0) && skip !== 'hvac' && inScope(hvState, scope)) {
      var hv = Number(job.hvac.voltage) || 240;
      var m = evNum(job.hvac.mca);
      if (m === null) m = evNum(job.hvac.mocp);
      if (m !== null) screenW = m * hv;
    }
    if (screenW) {
      hc[job.types.indexOf('hp') >= 0 ? 'hp' : 'ac'].push({ name: 'Outdoor unit' + (evVal(job.hvac.outdoorMakeModel) ? ', ' + evVal(job.hvac.outdoorMakeModel) : ''), w: screenW });
      addNew(hvState, screenW);
    } else {
      loads.forEach(function (L) {
        if (L === skip || !inScope(L.state, scope)) return;
        var hk = heatClass(L);
        if (hk !== 'ac' && hk !== 'hp') return;
        var lw = loadWatts(L);
        if (!lw) return;
        hc[hk].push({ name: (L.kind || 'Outdoor unit') + (evVal(L.makeModel) ? ', ' + evVal(L.makeModel) : ''), w: lw.w });
        addNew(L.state, lw.w);
        if (job.types.indexOf('ac') < 0 && job.types.indexOf('hp') < 0) notes.push('"' + L.kind + '" counted from its load card.');
      });
    }
    var heatKw = evNum(job.hvac.backupHeatKw);
    if (heatKw !== null && skip !== 'hvac' && inScope(hvState, scope)) {
      hc.central.push({ name: 'Backup heat on the HVAC screen', w: heatKw * 1000 });
      addNew(hvState, heatKw * 1000);
    }

    var rangeAll = loads.filter(function (L) { return L !== skip && inScope(L.state, scope) && isRange(L); });
    var rangeW = 0;
    if (rangeAll[0]) { var rw = loadWatts(rangeAll[0]); if (rw) { rangeW = rw.w; addNew(rangeAll[0].state, rw.w); } }
    /* a second cooking appliance is a load, not a rounding error */
    rangeAll.slice(1).forEach(function (L) {
      var xw = loadWatts(L);
      if (xw) {
        appliances.push({ name: (L.kind || 'Additional cooking appliance') + ', second unit', watts: xw.w, cat: 'other' });
        addNew(L.state, xw.w);
        notes.push('A second cooking appliance was counted as an other load, not as the range.');
      }
    });

    var roomW = sumW(hc.room), centralW = sumW(hc.central), hpW = sumW(hc.hp), acW = sumW(hc.ac);
    var roomD = room62(roomW);
    var H = roomD + centralW + hpW;
    var C = acW + hpW;
    var interlock = opts.interlock !== undefined ? !!opts.interlock : job.hvac.interlock === 'Interlocked, cannot run together';
    var parts = { room: hc.room, central: hc.central, hp: hc.hp, ac: hc.ac, roomW: roomW, roomD: roomD, centralW: centralW, hpW: hpW, acW: acW, H: H, C: C, interlock: interlock };

    return {
      occupancy: 'single',
      system: SYS_MAP[s.supplyVoltage] || '120/240-1p',
      serviceA: n0(s.mainBreaker) || n0(s.serviceRating),
      panelSpacesFree: s.spacesFree === '' ? undefined : s.spacesFree,
      areaUnit: a.unit === 'sqft' ? 'sqft' : 'm2',
      areaAbove: n0(a.above),
      areaBelow: n0(a.below),
      belowCeilingM: belowHeightM(a),
      areaExclBasement: n0(a.exclBasement) || n0(a.above),
      /* heating arrives already demanded per Section 62, so the engine takes it
         at face value. The ledger line is rewritten in run() to show the parts. */
      heatW: H, heatMode: 'furnace',
      coolW: interlock ? C : acW,
      interlock: interlock,
      rangeW: rangeW,
      appliances: appliances, evse: evse,
      evemsMode: opts.evems || 'none',   // EVEMS relief is only ever a what if, never applied to the record
      evemsSetpointW: opts.evemsW || 0,
      measuredPeakW: measuredPeakW(job), newLoadsW: newW, runway: [],
      _notes: notes, _hc: parts, _scope: scope
    };
  }

  /* Basement height for Rule 8-110 c). A measured number wins. Without one,
     the field answer, over or under 1.8 m, is used, and the screen says so. */
  function belowHeightM(a) {
    var h = n0(a.belowHeight);
    if (h > 0) return h;
    if (a.belowClass === 'over') return 1.81;
    if (a.belowClass === 'under') return 1.5;
    return 0;
  }

  function hcBasis(p) {
    var bits = [];
    if (p.roomW) bits.push('room heaters ' + fmtW(p.roomW) + ' W connected, ' + fmtW(p.roomD) + ' W after Rule 62-118 3), the first 10 kW at 100 percent and the balance at 75 percent');
    if (p.centralW) bits.push('electric furnace, air handler or backup heat ' + fmtW(p.centralW) + ' W at 100 percent, Rule 62-118 4)');
    if (p.hpW) bits.push('heat pump outdoor unit ' + fmtW(p.hpW) + ' W, counted with the heating and with the cooling because it does both');
    if (p.acW) bits.push('air conditioning ' + fmtW(p.acW) + ' W at 100 percent');
    var head = '';
    if (p.interlock) head = 'Interlock recorded, so Rule 8-106 3) takes the greater of heating ' + fmtW(p.H) + ' W and cooling ' + fmtW(p.C) + ' W. ';
    else if (p.H && p.acW) head = 'No interlock recorded, so Rule 8-106 3) does not apply and heating ' + fmtW(p.H) + ' W plus cooling ' + fmtW(p.acW) + ' W both count. ';
    return head + 'Parts: ' + bits.join('; ') + '.';
  }

  /* One call that builds the engine input, runs the validated engine, and
     rewrites the heating line so it shows its parts. engine.js is untouched. */
  function run(job, opts) {
    var inp = toEngine(job, opts);
    var r = global.calculate(inp);
    var p = inp._hc;
    if (r && r.core && r.core.lines && p && (p.H > 0 || p.C > 0)) {
      r.core.lines.forEach(function (l) {
        if (l.label !== 'Space heating and air conditioning') return;
        l.basis = hcBasis(p);
        l.rule = '8-200 1) a) iii), 62-118' + (p.interlock ? ', 8-106 3)' : '');
      });
    }
    r._inp = inp;
    return r;
  }

  /* ------------------------------------------------------------------
     Status
     ------------------------------------------------------------------ */
  function status(job) {
    var p = packet(job);
    var hd = holds(job);
    var out = { packet: p, holds: hd, calc: null, key: 'HOLD', reasons: [], engineInput: null };

    if (job.review && job.review.approved) {
      out.key = 'APPROVED';
      out.reasons.push('Approved by ' + job.review.reviewer + ' on ' + FC.stamp(job.review.approvedAt) + '.');
    }

    var inp = null, r = null;
    // Never produce a number out of thin air. Without a known living area the
    // Rule 8-200 1) b) floor would print as if it were a real result.
    if (FC.evKnown(job.areas.above)) {
      try { r = run(job); inp = r._inp; } catch (e) { r = null; }
    }
    out.calc = r; out.engineInput = inp;

    var svc = n0(job.service.mainBreaker) || n0(job.service.serviceRating);
    var pct = (r && svc) ? r.amps / svc * 100 : 0;
    out.pct = pct;
    out.svc = svc;

    if (out.key === 'APPROVED') return out;

    if (p.blockers.length) {
      out.key = 'INCOMPLETE';
      out.reasons = p.blockers.slice(0, 8);
      return out;
    }
    if (hd.length) {
      out.key = 'HOLD';
      out.reasons = hd.slice(0, 8);
      return out;
    }
    if (!r || !svc) {
      out.key = 'HOLD';
      out.reasons.push('The calculation could not be completed from the field data.');
      return out;
    }

    var evPresent = job.types.indexOf('ev') >= 0 || (job.loads || []).some(function (L) { return /evse/i.test(L.kind || '') && inScope(L.state, 'after'); });
    var line = 'Preliminary calculated load is ' + r.amps.toFixed(1) + ' A against a ' + svc + ' A main, ' + Math.round(pct) + ' percent.';

    if (pct > 100) {
      out.key = evPresent ? 'EVEMS' : 'UPGRADE';
      out.reasons.push(line);
      if (evPresent) out.reasons.push('An energy management system under Rule 8-106 10) or 11) may bring this inside the existing service. Equipment, control and code requirements are a Master Electrician decision.');
      out.reasons.push('Paths open: keep the existing service if a lean compliant route exists, review load management, review a service or panel upgrade, or stage the work.');
    } else if (pct > 90) {
      out.key = 'TIGHT';
      out.reasons.push(line);
      out.reasons.push('Little margin. Verify every nameplate before anything is priced.');
    } else {
      out.key = 'PASS';
      out.reasons.push(line);
    }
    if (p.missing.length) {
      out.reasons.push(p.missing.length + ' non blocking item' + (p.missing.length === 1 ? '' : 's') + ' still open in the field packet.');
    }
    return out;
  }

  /* ------------------------------------------------------------------
     Express screen. Coarse on purpose. No final code decision.
     ------------------------------------------------------------------ */
  function express(d) {
    var svc = Number(d.serviceRating) || 0;
    var area = Number(d.area) || 0;
    if (d.unit === 'sqft') area = area / 10.7639;
    var lines = [];
    var w = 0;
    if (area > 0) {
      var base = 5000 + Math.max(0, Math.ceil((area - 90) / 90)) * 1000;
      w += base; lines.push({ label: 'Basic load for ' + area.toFixed(0) + ' m2', w: base, note: 'Rule 8-200 1) a) i) and ii) shape, screening only' });
      w += 6000; lines.push({ label: 'Range allowance', w: 6000, note: 'Rule 8-200 base range figure' });
    }
    /* Heating is the biggest single load in an Alberta house. Leaving it off
       the Express screen made every electrically heated home read low. */
    if (d.heat === 'electric') {
      var hw = Number(d.heatKw) > 0 ? Number(d.heatKw) * 1000 : (area > 0 ? Math.round(area * 45) : 0);
      if (hw > 0) {
        var hcount = hw <= 10000 ? hw : 10000 + (hw - 10000) * 0.75;
        w += hcount;
        lines.push({ label: 'Electric space heating', w: hcount, note: Number(d.heatKw) > 0 ? 'Rule 62-118 3), first 10 kW at 100 percent then 75 percent with thermostats' : 'No kW given, screened at 45 W per m2. Rule 62-118 3) demand applied.' });
      }
    } else if (d.heat === 'gas') {
      lines.push({ label: 'Gas or other fuel heating', w: 0, note: 'No electric heating load added. The furnace blower is under 1500 W and is not counted separately.' });
    }
    if (d.wh === 'electric') { w += 3000; lines.push({ label: 'Electric water heater, storage tank', w: 3000, note: 'Screening figure. Alberta STANDATA 24-ECB-008 puts a storage tank in the 25 percent group at the full calculation.' }); }
    if (d.ev)     { w += 9600; lines.push({ label: 'EV charger', w: 9600, note: '40 A at 240 V screening figure' }); }
    if (d.tub)    { w += 9600; lines.push({ label: 'Hot tub or spa', w: 9600, note: '40 A at 240 V screening figure' }); }
    if (d.ac)     { w += 5760; lines.push({ label: 'Air conditioning', w: 5760, note: '24 A at 240 V screening figure' }); }
    if (d.hp)     { w += 7200; lines.push({ label: 'Heat pump', w: 7200, note: '30 A at 240 V screening figure' }); }
    if (d.suite)  { w += 5000; lines.push({ label: 'Basement suite', w: 5000, note: 'Screening allowance' }); }
    if (d.garage) { w += 3000; lines.push({ label: 'Garage or shop', w: 3000, note: 'Screening allowance' }); }
    if (d.solar)  { lines.push({ label: 'Solar', w: 0, note: 'No load added. Interconnection is reviewed separately.' }); }

    var amps = w / 240;
    var pct = svc ? amps / svc * 100 : 0;
    var verdict;
    if (!svc || !area || !d.heat) verdict = { key: 'HOLD', label: 'Not enough to screen yet', tone: 'warn' };
    else if (pct > 100) verdict = { key: 'UPGRADE', label: 'Upgrade review likely', tone: 'warn' };
    else if (pct > 85) verdict = { key: 'TIGHT', label: 'Tight, load study required', tone: 'warn' };
    else verdict = { key: 'PASS', label: 'Likely fit, site review required', tone: 'good' };
    return { w: w, amps: amps, pct: pct, verdict: verdict, lines: lines, svc: svc, area: area };
  }

  /* ------------------------------------------------------------------
     Solar annual use alignment. Not an automatic cap.
     ------------------------------------------------------------------ */
  function alignment(job) {
    var s = job.solar || {};
    var months = s.months || [];
    var filled = months.filter(function (m) { return m && n0(m.kwh) > 0; });
    var actual = months.filter(function (m) { return m && m.status === 'Actual'; }).length;
    var dirty = months.filter(function (m) { return m && (m.status === 'Estimated' || m.status === 'True-up' || m.status === 'Adjusted'); }).length;
    var histor = filled.reduce(function (t, m) { return t + n0(m.kwh); }, 0);
    var future = Number(s.futureAnnualKwh) || 0;
    var supported = histor + future;
    var forecast = Number(s.forecastAnnualAcKwh) || 0;
    var ratio = supported ? forecast / supported : 0;

    var band, note;
    if (filled.length < 12) {
      band = { key: 'grey', label: 'Incomplete actual use data', tone: 'muted' };
      note = filled.length + ' of 12 months entered. Alignment cannot be stated until the billing history is complete. Ask the retailer for a 12 month monthly kWh export.';
    } else if (dirty > 0 && actual < 9) {
      band = { key: 'grey', label: 'Incomplete actual use data', tone: 'muted' };
      note = 'Only ' + actual + ' of 12 months are marked actual and ' + dirty + ' are estimated, adjusted or true-up. Those stay preliminary until they are reconciled.';
    } else if (!forecast) {
      band = { key: 'hold', label: 'Technical and site review pending', tone: 'warn' };
      note = 'Annual use is established at ' + Math.round(histor).toLocaleString('en-CA') + ' kWh. A forecast annual AC generation figure is needed before alignment can be read.';
    } else if (ratio <= 1.0 && !future) {
      band = { key: 'green', label: 'Historic use aligned', tone: 'good' };
      note = 'Forecast generation is ' + Math.round(ratio * 100) + ' percent of verified historic annual use. No projected load is being relied on.';
    } else if (ratio <= 1.0 && future) {
      band = { key: 'yellow', label: 'Projected load supported', tone: 'warn' };
      note = 'Alignment relies on ' + Math.round(future).toLocaleString('en-CA') + ' kWh of projected load. Every future load needs a category, an arithmetic basis, a start date and evidence.';
    } else {
      band = { key: 'red', label: 'Unsupported oversize risk', tone: 'block' };
      note = 'Forecast generation is ' + Math.round(ratio * 100) + ' percent of supported annual use. Master Electrician review is required before anything goes to the wires owner.';
    }
    return {
      historic: histor, future: future, supported: supported, forecast: forecast,
      ratio: ratio, band: band, note: note, filled: filled.length, actual: actual, dirty: dirty
    };
  }

  function evAnnualKwh(e) {
    var km = Number(e.annualKm) || 0;
    var eff = Number(e.efficiency) || 0;       // kWh per 100 km
    var share = (Number(e.homeShare) || 0) / 100;
    var chg = 0.90;                             // charging efficiency
    if (!km || !eff) return null;
    return km * eff * share / 100 / chg;
  }

  /* ------------------------------------------------------------------
     Voltage drop screening. Never sizes a conductor on its own.
     ------------------------------------------------------------------ */
  var R_CU = { '14': 8.286, '12': 5.211, '10': 3.277, '8': 2.061, '6': 1.296, '4': 0.815, '3': 0.646, '2': 0.513, '1': 0.407, '1/0': 0.323, '2/0': 0.256, '3/0': 0.203, '4/0': 0.161, '250': 0.136, '350': 0.098, '500': 0.069 };
  var R_AL = { '8': 3.383, '6': 2.128, '4': 1.338, '3': 1.061, '2': 0.841, '1': 0.667, '1/0': 0.529, '2/0': 0.419, '3/0': 0.333, '4/0': 0.264, '250': 0.224, '350': 0.160, '500': 0.112 };

  function vdrop(d) {
    var V = Number(d.systemVoltage) || 0;
    var I = Number(d.loadA) || 0;
    var L = n0(d.lengthM);
    var par = Math.max(1, Number(d.parallel) || 1);
    var table = d.material === 'al' ? R_AL : R_CU;
    var k = d.phase === '3' ? Math.sqrt(3) : 2;
    var rows = (d.sizes || []).map(function (sz) {
      var R = table[sz];
      if (!R || !V || !I || !L) return null;
      var r = R / 1000 / par;
      var vd = k * L * I * r;
      return { size: sz, vd: vd, pct: V ? vd / V * 100 : 0, recv: V - vd, ohmsPerKm: R };
    }).filter(Boolean);
    return {
      rows: rows,
      formula: d.phase === '3' ? 'VD = 1.73 x L x I x R' : 'VD = 2 x L x I x R',
      material: d.material === 'al' ? 'aluminum' : 'copper',
      ready: !!(V && I && L)
    };
  }

  /* ==================================================================
     LIVE LOAD CHECK
     Today, after the job, and what each lever does to the number. Every
     figure below comes out of the same validated engine. Nothing in here
     decides anything. It lays the options side by side for the Master.
     ================================================================== */
  var STD_MAINS = [60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225];
  var KIND_SHORT = {
    'EVSE': 'EV charger', 'Range, cooktop or oven': 'Range', 'Heat pump outdoor unit': 'Heat pump',
    'AC condenser': 'Air conditioner', 'Hot tub or spa': 'Hot tub', 'Furnace or air handler': 'Electric furnace',
    'Electric backup heat': 'Backup heat', 'Baseboard or wall heaters': 'Baseboard heaters',
    'Electric in-floor heat': 'In-floor heat', 'Garage or shop heater': 'Garage heater',
    'Steam shower generator': 'Steam shower', 'Welder or shop equipment': 'Welder or shop',
    'Garage or shop': 'Garage or shop subpanel', 'Basement suite': 'Basement suite subpanel'
  };
  function nameOf(L) { return (L && (L.label || KIND_SHORT[L.kind] || L.kind)) || 'Load'; }
  function heatParts(job) { try { return toEngine(job, { scope: 'after' })._hc; } catch (e) { return { H: 0, C: 0, roomW: 0, centralW: 0, hpW: 0, acW: 0 }; } }
  function svcOf(job) { return n0(job.service.mainBreaker) || n0(job.service.serviceRating); }
  function bandOf(pct) {
    if (pct === null || pct === undefined) return { key: 'none', label: 'No service size yet', tone: 'muted' };
    if (pct > 100) return { key: 'over', label: 'Over the service on paper', tone: 'warn' };
    if (pct > 90) return { key: 'tight', label: 'Tight', tone: 'warn' };
    return { key: 'fits', label: 'Fits', tone: 'good' };
  }
  function pic(r, svc) {
    var pct = svc ? r.amps / svc * 100 : null;
    return { w: r.totalW, a: r.amps, pct: pct, band: bandOf(pct), floor: r.core.itemB > r.core.itemA, r: r };
  }
  function ratingField(L) {
    var f = ['w', 'va', 'amps', 'mca', 'mocp'];
    for (var i = 0; i < f.length; i++) if (L[f[i]] && evNum(L[f[i]]) !== null) return L[f[i]];
    return null;
  }
  function poles(L) { return evNum(L.voltage) === 120 ? 1 : 2; }
  /* How a card's rating reads back to a person: 40 A, 12 kW, 5,600 W. */
  function ratingText(L) {
    var lw = loadWatts(L);
    if (!lw) return 'no rating yet';
    var unit = L.q && L.q.unit;
    var q = lw.qty ? lw.qty + ' x ' : '';
    if (evNum(L.amps) !== null && unit !== 'kW' && unit !== 'W') return q + fmtW(evNum(L.amps)) + ' A';
    if (evNum(L.mocp) !== null && evNum(L.w) === null && evNum(L.amps) === null) return q + fmtW(evNum(L.mocp)) + ' A breaker';
    var one = lw.w / (lw.qty || 1);
    if (unit === 'W') return q + fmtW(one) + ' W';
    return q + (Math.round(one / 100) / 10).toLocaleString('en-CA') + ' kW';
  }
  /* Numbers that are almost certainly a slip of the thumb. */
  function implausible(L) {
    var lw = loadWatts(L);
    if (!lw) return '';
    var unit = L.q && L.q.unit;
    var one = lw.w / (lw.qty || 1);
    if (unit === 'W' && one < 500) return 'reads as ' + fmtW(one) + ' W. Check the unit, it may be kW.';
    if (unit === 'kW' && one > 60000) return 'reads as ' + fmtW(one / 1000) + ' kW. Check the unit, it may be W.';
    if (evNum(L.amps) !== null && evNum(L.amps) > 125) return 'reads as ' + evNum(L.amps) + ' A on one appliance. Check the unit.';
    return '';
  }
  function screenState(job, k) {
    if (k === 'tub') return job.tub.state || PROPOSED;
    if (k === 'hvac') return job.hvac.state || PROPOSED;
    return PROPOSED;
  }

  /* What the job changes, in plain names. */
  function changes(job) {
    var adds = [], removes = [], later = [];
    (job.loads || []).forEach(function (L) {
      var it = { name: nameOf(L), rating: ratingText(L), w: (loadWatts(L) || {}).w || 0 };
      if (L.state === PROPOSED) adds.push(it);
      else if (L.state === REMOVED) removes.push(it);
      else if (L.state === FUTURE) later.push(it);
    });
    var inp = toEngine(job, { scope: 'after' });
    if (job.types.indexOf('ev') >= 0 && !(job.loads || []).some(function (L) { return /evse/i.test(L.kind || '') && inScope(L.state, 'after'); })) {
      var a = evNum(job.ev.amps); if (a === null) a = evNum(job.ev.mca); if (a === null) a = evNum(job.ev.mocp);
      if (a !== null) adds.push({ name: 'EV charger', rating: fmtW(a) + ' A', w: a * (Number(job.ev.voltage) || 240) });
    }
    if (job.types.indexOf('tub') >= 0 && screenState(job, 'tub') === PROPOSED && inp.appliances.some(function (x) { return x.name.indexOf('Hot tub or spa') === 0 && x.cat === 'tankless'; }) &&
        !(job.loads || []).some(function (L) { return /tub|spa/i.test(L.kind || '') && inScope(L.state, 'after'); })) {
      var ta = evNum(job.tub.amps); if (ta === null) ta = evNum(job.tub.mocp);
      adds.push({ name: 'Hot tub', rating: fmtW(ta) + ' A', w: ta * (Number(job.tub.voltage) || 240) });
    }
    return { adds: adds, removes: removes, later: later };
  }

  function spaces(job) {
    var raw = job.service.spacesFree;
    var free = raw === '' || raw === undefined || raw === null || !isFinite(Number(raw)) ? null : Number(raw);
    var need = 0, freed = 0;
    (job.loads || []).forEach(function (L) {
      if (L.state === PROPOSED) need += poles(L);
      else if (L.state === REMOVED) freed += poles(L);
    });
    return { free: free, need: need, freed: freed, ok: free === null ? null : free + freed >= need };
  }

  /* Rule 64-112 4). Load side solar or battery connection on a dwelling
     panel: the source breakers, main included, may add up to 125 percent of
     the bus rating under f). Over the bus rating itself, b) puts the
     connection at the far end from the main and c) wants a label. */
  function backfeed(job) {
    var c = job.check || {};
    var bus = evNum(job.service.busRating), main = evNum(job.service.mainBreaker);
    var exA = Number(c.solarExistingA) || 0, newA = Number(c.solarNewA) || 0;
    var src = exA + newA;
    var out = { ready: !!(bus && main && newA), bus: bus, main: main, existingA: exA, newA: newA };
    if (!out.ready) return out;
    out.limit = bus * 1.25;
    out.sum = main + src;
    out.ok = out.sum <= out.limit;
    out.maxNew = Math.max(0, out.limit - main - exA);
    out.farEnd = out.sum > bus;
    var maxMain = out.limit - src;
    var fits = STD_MAINS.filter(function (x) { return x <= maxMain && x < main; });
    out.derateTo = fits.length ? fits[fits.length - 1] : null;
    return out;
  }

  /* Double pole breakers the load cards account for. A card of identical
     room heaters counts one per heater, because each one is usually its own
     thermostat circuit. */
  function dpKnown(loads) {
    return loads.filter(function (L) { return inScope(L.state, 'today') && poles(L) === 2; })
      .reduce(function (t, L) { return t + (heatClass(L) === 'room' ? Math.max(1, Math.round(Number(L.qty) || 1)) : 1); }, 0);
  }
  /* Anything still missing that can only push the number up. While any of
     these is open the result is a floor, and the screen says at least. A
     missing value is never allowed to read as a finished answer. */
  function lowBound(job, r) {
    var a = job.areas, c = job.check || {}, loads = job.loads || [], out = [];
    var unr = loads.filter(function (L) { return L.state !== REMOVED && L.state !== FUTURE && !loadWatts(L); }).length;
    if (unr) out.push(unr === 1 ? 'a load has no rating' : unr + ' loads have no rating');
    if (!a.hasBasement) out.push('the basement is not answered');
    else if (a.hasBasement === 'Yes') {
      if (!(n0(a.below) > 0)) out.push('the basement area is blank');
      if (!(belowHeightM(a) > 0)) out.push('the basement height is not answered');
    }
    var p = r && r._inp ? r._inp._hc : heatParts(job);
    /* The heating question lives on the live check screen only. A walkdown
       records its heat as load cards, so a blank answer there is not a gap. */
    if (job.mode === 'check') {
      if (!c.heat && !(p.roomW + p.centralW + p.hpW > 0)) out.push('the heating type is not answered');
      else if (c.heat === 'electric' && !(p.roomW + p.centralW > 0)) out.push('electric heat is picked with no heaters entered');
      else if (c.heat === 'hp' && !(p.hpW > 0)) out.push('a heat pump is picked with no outdoor unit entered');
    }
    var dpRaw = c.dp;
    if (dpRaw !== '' && dpRaw !== undefined && dpRaw !== null && isFinite(Number(dpRaw)) && Number(dpRaw) > dpKnown(loads)) out.push('some double pole breakers are not matched to a load');
    function amp(o) { var x = evNum(o.amps); if (x === null) x = evNum(o.mca); if (x === null) x = evNum(o.mocp); return x; }
    var types = job.types || [];
    if (types.indexOf('ev') >= 0 && !loads.some(function (L) { return /evse/i.test(L.kind || ''); }) && amp(job.ev) === null) out.push('the EV charger on the walkdown has no amps yet');
    if (types.indexOf('tub') >= 0 && !loads.some(function (L) { return /tub|spa/i.test(L.kind || ''); }) && evNum(job.tub.amps) === null && evNum(job.tub.mocp) === null) out.push('the hot tub on the walkdown has no amps yet');
    if ((types.indexOf('ac') >= 0 || types.indexOf('hp') >= 0) && evNum(job.hvac.mca) === null && evNum(job.hvac.mocp) === null &&
        !loads.some(function (L) { var k = heatClass(L); return k === 'ac' || k === 'hp'; })) out.push('the outdoor unit on the walkdown has no rating yet');
    return out;
  }

  function scenarios(job) {
    var svc = svcOf(job);
    var sc = { ready: false, svc: svc };
    sc.spaces = spaces(job);
    if (!(n0(job.areas.above) > 0)) { sc.flags = checkFlags(job, sc); return sc; }
    sc.ready = true;
    var t = run(job, { scope: 'today' }), af = run(job, { scope: 'after' }), fu = run(job, { scope: 'future' });
    sc.today = pic(t, svc); sc.after = pic(af, svc); sc.future = pic(fu, svc);
    var ch = changes(job);
    sc.adds = ch.adds; sc.removes = ch.removes; sc.later = ch.later;
    sc.changed = ch.adds.length + ch.removes.length > 0;
    sc.unrated = (job.loads || []).filter(function (L) { return L.state !== REMOVED && L.state !== FUTURE && !loadWatts(L); }).map(nameOf);
    sc.low = lowBound(job, af);
    sc.least = sc.low.length > 0;

    var ev = af._inp.evse;
    if (ev.length) {
      sc.managed = pic(run(job, { scope: 'after', evems: 'exempt' }), svc);
      if (ev.length === 1 && svc) {
        var z = run(job, { scope: 'after', evems: 'setpoint', evemsW: 0 });
        var limitW = svc * z.divisor;
        var extra = z.totalW - z.core.governing;
        var card = (job.loads || []).filter(function (L) { return /evse/i.test(L.kind || '') && inScope(L.state, 'after') && loadWatts(L); })[0];
        var evV = card ? (evNum(card.voltage) || 240) : (Number(job.ev.voltage) || 240);
        var room = z.core.itemB + extra > limitW ? 0 : limitW - extra - z.core.itemA;
        sc.evMax = { a: Math.max(0, Math.floor(room / evV)), nowA: ev[0].watts / evV, v: evV };
      }
    }
    var p = af._inp._hc;
    if (!p.interlock && p.H > 0 && p.acW > 0) {
      var il = run(job, { scope: 'after', interlock: true });
      if (il.totalW < af.totalW - 0.5) sc.interlock = pic(il, svc);
    }
    if (af.alt) {
      var full = !!(job.check && job.check.cont100);
      var lim = svc ? svc * (full ? 1 : 0.8) : 0;
      sc.measured = { a: af.altAmps, peakW: af.alt.peak, newW: af.alt.newLoads, limitA: lim, ok: lim ? af.altAmps <= lim : null, full: full };
    }
    var tgt = Number(job.check && job.check.target) || 200;
    if (svc && tgt > svc) sc.upgrade = { svc: tgt, after: pic(af, tgt), future: pic(fu, tgt) };
    if (job.check && job.check.solarOn) sc.solar = backfeed(job);
    sc.flags = checkFlags(job, sc);
    return sc;
  }

  /* The difference one load makes, in amps, inside the picture it belongs to.
     cache is optional and holds the full run per scope. */
  function marginal(job, L, cache) {
    if (!(n0(job.areas.above) > 0)) return null;
    var state = typeof L === 'string' ? screenState(job, L) : (L.state || '');
    var scope = state === PROPOSED ? 'after' : state === FUTURE ? 'future' : 'today';
    cache = cache || {};
    var w = cache[scope] || (cache[scope] = run(job, { scope: scope }));
    var wo = run(job, { scope: scope, skip: L });
    return { a: (w.totalW - wo.totalW) / w.divisor, scope: scope, state: state, floor: w.core.itemB > w.core.itemA, floorBefore: wo.core.itemB > wo.core.itemA };
  }

  /* Everything a careful Master would want checked before the number is
     said out loud. Tone warn means the number can move. Info is context. */
  function checkFlags(job, sc) {
    var out = [];
    function f(tone, text) { out.push({ tone: tone, text: text }); }
    var a = job.areas, c = job.check || {}, loads = job.loads || [];
    var svc = svcOf(job);
    var bus = evNum(job.service.busRating), main = evNum(job.service.mainBreaker);
    if (bus && main && bus < main) f('block', 'The panel bus is rated ' + bus + ' A under a ' + main + ' A main. The main does not protect that bus. Dmitry looks at this before anything else.');
    if (!svc) f('warn', 'Main breaker size is not entered, so nothing can be compared yet.');
    if (!(n0(a.above) > 0)) f('warn', 'House size is not entered. Rule 8-200 starts from the living area, so there is no number without it.');
    else if (!a.aboveSource) f('warn', 'Where the house size came from is not recorded. The municipal property record is the number to quote from.');
    else if (a.aboveSource === 'Assumption' || a.aboveSource === 'Customer statement') f('warn', 'House size is ' + (a.aboveSource === 'Assumption' ? 'an estimate' : 'what the customer said') + '. Pull the municipal property record before anything is quoted. A guessed area has been off by 500 sq ft on a past job.');
    if (!a.hasBasement) f('warn', 'Basement not answered. Rule 8-110 c) counts 75 percent of basement area with more than 1.8 m of headroom, finished or not.');
    else if (a.hasBasement === 'Yes') {
      if (!(n0(a.below) > 0)) f('warn', 'Basement area is blank, so it is counting as zero.');
      if (!(n0(a.belowHeight) > 0) && a.belowClass !== 'over' && a.belowClass !== 'under') f('warn', 'Basement height not answered. Over 1.8 m counts, under does not.');
    }
    var p = sc && sc.ready ? sc.after.r._inp._hc : heatParts(job);
    if (!c.heat) f('warn', 'Heating type not answered. Electric heat is usually the biggest load in the house.');
    else if (c.heat === 'electric' && !(p.roomW + p.centralW > 0)) f('warn', 'Electric heat is selected but no heaters are entered yet. The result is missing its biggest load.');
    else if (c.heat === 'hp' && !(p.hpW > 0)) f('warn', 'Heat pump is selected but no heat pump outdoor unit is entered.');
    if (p.H > 0 && p.acW > 0 && job.hvac.interlock !== 'Interlocked, cannot run together') {
      f('warn', 'Electric heat and air conditioning are both in and no interlock is confirmed, so both count. Rule 8-106 3) only takes the larger one where interlocks are installed.');
    }
    var unrated = loads.filter(function (L) { return L.state !== REMOVED && L.state !== FUTURE && !loadWatts(L); }).map(nameOf);
    if (unrated.length) f('warn', unrated.length + (unrated.length === 1 ? ' load has' : ' loads have') + ' no rating yet: ' + unrated.join(', ') + '. Until they are filled the result reads at least.');
    var est = loads.filter(function (L) { var r = ratingField(L); return L.state !== REMOVED && r && r.source === 'Assumption'; }).map(nameOf);
    if (est.length) f('info', est.length + (est.length === 1 ? ' rating is' : ' ratings are') + ' a typical value, not a nameplate: ' + est.join(', ') + '. Read the nameplates before anything is quoted.');
    var brk = loads.filter(function (L) { var lw = loadWatts(L); return L.state !== REMOVED && lw && lw.fromMocp; }).map(nameOf);
    if (brk.length) f('info', brk.join(', ') + (brk.length === 1 ? ' is' : ' are') + ' sized from the breaker. A breaker is not a load, so this reads high until the nameplate is read.');
    loads.forEach(function (L) { var m = implausible(L); if (m && L.state !== REMOVED) f('warn', nameOf(L) + ' ' + m); });
    loads.filter(function (L) { return /evse/i.test(L.kind || '') && L.state !== REMOVED && loadWatts(L); }).forEach(function (L) {
      if (L.evSet === 'inside') f('info', nameOf(L) + ' is counted at a setting made by an electrician. Alberta STANDATA 24-ECI-086 accepts a lower setting only where the charger has a manual switch inside the equipment and an electrician has to set it. Confirm that is this charger.');
      else if (L.evSet !== 'max') f('warn', nameOf(L) + ' is counted at ' + ratingText(L) + '. Confirm that is the highest setting the charger allows. Alberta STANDATA 24-ECI-086 counts the maximum unless an electrician sets it on a switch inside the unit.');
    });
    var ranges = loads.filter(function (L) { return isRange(L) && inScope(L.state, 'after') && loadWatts(L); });
    if (ranges.length > 1) f('info', ranges.length + ' cooking appliances. The first counts as the range under Rule 8-200 1) a) iv) and the rest as other loads at 25 percent. Dmitry confirms that split.');
    var sp = sc && sc.spaces;
    if (sp && sp.free !== null && sp.need > sp.free + sp.freed) f('warn', 'Panel spaces: the new loads need ' + sp.need + ', the panel has ' + sp.free + ' free' + (sp.freed ? ' plus ' + sp.freed + ' from loads coming out' : '') + '.');
    var dpRaw = c.dp;
    if (dpRaw !== '' && dpRaw !== undefined && dpRaw !== null && isFinite(Number(dpRaw))) {
      var dp = Number(dpRaw);
      var known = dpKnown(loads);
      if (dp > known) f('warn', (dp - known) + ' double pole breaker' + (dp - known === 1 ? '' : 's') + ' in the panel ' + (dp - known === 1 ? 'is' : 'are') + ' not matched to a load. Find what ' + (dp - known === 1 ? 'it feeds' : 'each one feeds') + '. A missed heater zone or a subpanel changes the answer.');
    }
    if (sc && sc.ready && sc.after.floor) f('info', 'The Rule 8-200 1) b) minimum of ' + fmtW(sc.after.r.core.itemB) + ' W is governing, not the itemised loads. Small loads do not move the number until the itemised total passes it.');
    if (sc && sc.measured) f('info', 'The measured path under Rule 8-106 8) is subject to Rule 8-104 5) and 6), so it is compared against ' + (sc.measured.full ? '100 percent of the main, which needs a main marked for 100 percent continuous operation' : '80 percent of the main, the usual marking on a residential main breaker') + '.');
    return out;
  }

  /* The customer summary. Plain words, no dashes, no final recommendation.
     Every rule number in here was read from the 2024 book. */
  function customerText(job, sc) {
    var L = [];
    var h = job.header || {};
    function A(x) { return Math.round(x) + ' A'; }
    L.push('Raydn Renewables, home electrical load check');
    if (h.address) L.push(h.address);
    L.push(new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }));
    L.push('');
    if (!sc.ready) { L.push('The load check is not finished yet. The house size is still needed.'); return L.join('\n'); }
    var least = sc.least ? 'at least ' : '';
    L.push('Your service: ' + (sc.svc ? sc.svc + ' A main breaker' : 'not recorded yet'));
    var a = job.areas;
    var unit = a.unit === 'sqft' ? ' sq ft' : ' m2';
    var area = 'House size used: ' + fmtW(n0(a.above)) + unit + ' above grade';
    if (sc.today.r.core.area && sc.today.r.core.area.counts) area += ', plus 75 percent of the ' + fmtW(n0(a.below)) + unit + ' basement';
    L.push(area);
    L.push('');
    L.push('Today, calculated: ' + least + A(sc.today.a) + (sc.svc ? ' of ' + sc.svc + ' A' : ''));
    if (sc.changed) {
      L.push('With the changes: ' + least + A(sc.after.a) + (sc.svc ? ' of ' + sc.svc + ' A' : ''));
      if (sc.adds.length) L.push('Adding: ' + sc.adds.map(function (x) { return x.name + ' ' + x.rating; }).join(', '));
      if (sc.removes.length) L.push('Coming out: ' + sc.removes.map(function (x) { return x.name; }).join(', '));
    }
    if (least) L.push('A few readings are still being confirmed. Filling them in can only raise these numbers, not lower them.');
    L.push('');
    var k = sc.after.band.key;
    if (!sc.svc) L.push('The main breaker size still has to be confirmed before these numbers can be compared to your service.');
    else if (k === 'over') L.push('What that means: on paper the house goes over what the service is rated for. Rule 8-104 2) of the Canadian Electrical Code says the calculated load cannot be more than the rating of the service. There are a few ways to handle that.');
    else if (k === 'tight') L.push('What that means: it fits, but close to the limit, so every nameplate gets double checked before anything is final.');
    else L.push('What that means: it fits inside your existing service on paper' + (sc.changed ? ' with the changes' : '') + '.');
    var opts = [];
    if (sc.svc && k !== 'fits') {
      if (sc.managed && sc.managed.a < sc.after.a - 0.05) opts.push('Load manager on the charger. It watches the whole house and slows or pauses the charger when the house gets busy. With a system that monitors the service and controls the charger, Rule 8-106 11) lets the charger come out of the calculation. Calculated load with it: ' + least + A(sc.managed.a) + ' of ' + sc.svc + ' A.');
      if (sc.evMax && sc.evMax.a >= 16 && sc.evMax.a + 0.5 < sc.evMax.nowA) opts.push('Charger set lower. Up to ' + sc.evMax.a + ' A fits with no load manager. In Alberta that only counts when an electrician sets it on a switch inside the charger.');
      if (sc.interlock) opts.push('Interlock the heat and the air conditioning so they cannot run at the same time. Rule 8-106 3) then counts only the larger of the two. Calculated load with it: ' + least + A(sc.interlock.a) + ' of ' + sc.svc + ' A.');
      if (sc.upgrade) {
        var room = sc.upgrade.svc - sc.after.a;
        opts.push('Upgrade the service to ' + sc.upgrade.svc + ' A. Calculated load: ' + least + A(sc.after.a) + ' of ' + sc.upgrade.svc + ' A' +
          (room >= 1 ? ', which leaves about ' + A(room) + ' of room for what comes next.' : '. That is still over, so it would need one of the other options as well.'));
      }
    } else if (sc.svc && sc.later && sc.later.length) {
      opts.push('Planning ahead: with ' + sc.later.map(function (x) { return x.name; }).join(', ') + ' added later, the calculation reads ' + least + A(sc.future.a) + ' of ' + sc.svc + ' A.');
    }
    if (opts.length) {
      L.push('');
      L.push(k === 'fits' ? 'Looking ahead:' : 'Ways to handle it:');
      opts.forEach(function (o, i) { L.push((i + 1) + '. ' + o); });
    }
    L.push('');
    L.push('These are preliminary numbers, calculated under the 2024 Canadian Electrical Code, Rule 8-200, from what we recorded on site today. They get confirmed in the full walkthrough and the permit before anything is final.');
    L.push('');
    L.push('Dmitry Naboka, Master Electrician, ME# 13824 | (780) 904-3462 | info@raydnrenewables.com | raydnrenewables.com');
    return L.join('\n');
  }

  global.FCGates = {
    packet: packet, holds: holds, toEngine: toEngine, run: run, status: status, dataWarnings: dataWarnings,
    scenarios: scenarios, marginal: marginal, checkFlags: checkFlags, backfeed: backfeed, customerText: customerText,
    inScope: inScope, heatClass: heatClass, nameOf: nameOf, ratingText: ratingText, implausible: implausible,
    spaces: spaces, changes: changes, svcOf: svcOf, bandOf: bandOf, STD_MAINS: STD_MAINS, KIND_SHORT: KIND_SHORT,
    express: express, alignment: alignment, vdrop: vdrop, evAnnualKwh: evAnnualKwh,
    loadWatts: loadWatts, photoPackFor: photoPackFor, assumedFields: assumedFields, R_CU: R_CU, R_AL: R_AL
  };
})(window);
