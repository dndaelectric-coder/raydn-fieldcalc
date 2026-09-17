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
      need(n0(job.areas.belowHeight) > 0, 'Basement ceiling height', true);
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

  function loadWatts(L) {
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
    if (job.types.indexOf('tub') >= 0 && loads.some(function (L) { return isKind(L, ['tub', 'spa']) && L.state !== 'Existing, being removed' && L.state !== 'Future, not used for sizing'; })) {
      out.push('The hot tub is recorded on the hot tub screen and again as a load card. Only one of them is counted now, but delete the duplicate so the record is clean.');
    }
    if (job.types.indexOf('ev') >= 0 && loads.some(function (L) { return isKind(L, ['evse']); })) {
      out.push('The charger is recorded on the EV screen and again as a load card. Only the load card is counted. Delete the duplicate so the record is clean.');
    }

    /* a cooling or heat pump card with the job type not ticked */
    var orphanAc = loads.filter(function (L) { return isKind(L, AC_KINDS) && L.state !== 'Existing, being removed'; });
    if (orphanAc.length && job.types.indexOf('ac') < 0 && job.types.indexOf('hp') < 0) {
      out.push('A cooling or heat pump load card is recorded but neither the air conditioning nor the heat pump job type is ticked. Tick it on step 3 and fill the HVAC screen, or that load is not being counted.');
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
      if (n0(job.areas.belowHeight) <= 0) out.push('Basement ceiling height is blank. Rule 8-110 c) turns on at 1.8 m. Measure it, do not leave the default.');
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

  function toEngine(job) {
    var s = job.service, a = job.areas;
    var appliances = [], evse = [], notes = [], heatW = 0, heatMode = 'thermostat';
    /* Rule 8-106 8) needs the additional loads kept separate from the existing
       ones, because the measured peak already contains everything existing.
       Counting an existing load again would inflate the augmented total. */
    var newW = 0;

    (job.loads || []).forEach(function (L) {
      if (L.state === 'Existing, being removed') return;
      if (L.state === 'Future, not used for sizing') { notes.push('"' + L.kind + '" marked future and excluded from sizing.'); return; }
      var lw = loadWatts(L);
      if (!lw) return;
      var k = (L.kind || '').toLowerCase();
      if (L.state === 'Proposed') newW += lw.w;
      var nm = (L.kind || 'Load') + (evVal(L.makeModel) ? ', ' + evVal(L.makeModel) : '');
      if (k.indexOf('evse') >= 0) { evse.push({ name: nm, watts: lw.w }); return; }
      if (k.indexOf('range') >= 0 || k.indexOf('cooktop') >= 0 || k.indexOf('oven') >= 0) return;
      if (k.indexOf('ac condenser') >= 0 || k.indexOf('heat pump outdoor') >= 0) return;
      if (k.indexOf('solar inverter') >= 0 || k.indexOf('battery') >= 0) return;
      if (k.indexOf('furnace') >= 0 || k.indexOf('air handler') >= 0 || k.indexOf('backup heat') >= 0) {
        heatW += lw.w;
        if (k.indexOf('furnace') >= 0 || k.indexOf('air handler') >= 0) heatMode = 'furnace';
        return;
      }
      var cat = 'other';
      if (k.indexOf('tub') >= 0 || k.indexOf('spa') >= 0 || k.indexOf('tankless') >= 0) cat = 'tankless';
      appliances.push({ name: nm, watts: lw.w, cat: cat });
    });

    if (job.types.indexOf('ev') >= 0 && !evse.length) {
      var v = Number(job.ev.voltage) || 240;
      var a1 = evNum(job.ev.amps), a2 = evNum(job.ev.mca), a3 = evNum(job.ev.mocp);
      var amp = a1 !== null ? a1 : (a2 !== null ? a2 : a3);
      if (amp !== null) { evse.push({ name: job.ev.chargerMakeModel || 'EVSE', watts: amp * v }); newW += amp * v; }
    }
    var tubCarded = appliances.some(function (x) { return x.cat === 'tankless' && /tub|spa/i.test(x.name); });
    if (job.types.indexOf('tub') >= 0 && !tubCarded) {
      var tv = Number(job.tub.voltage) || 240;
      var ta = evNum(job.tub.amps);
      if (ta === null) ta = evNum(job.tub.mocp);
      if (ta !== null) { appliances.push({ name: 'Hot tub or spa' + (evVal(job.tub.makeModel) ? ', ' + evVal(job.tub.makeModel) : ''), watts: ta * tv, cat: 'tankless' }); newW += ta * tv; }
    }

    var acW = 0;
    if (job.types.indexOf('ac') >= 0 || job.types.indexOf('hp') >= 0) {
      var hv = Number(job.hvac.voltage) || 240;
      var m = evNum(job.hvac.mca);
      if (m === null) m = evNum(job.hvac.mocp);
      if (m !== null) acW = m * hv;
    }
    /* a cooling card with the job type not ticked must never vanish */
    if (!acW) {
      (job.loads || []).forEach(function (L) {
        if (!isKind(L, AC_KINDS)) return;
        if (L.state === 'Existing, being removed' || L.state === 'Future, not used for sizing') return;
        var lw = loadWatts(L);
        if (lw) { acW += lw.w; notes.push('"' + L.kind + '" counted as cooling from a load card. The job type was not ticked.'); }
      });
    }

    var heatKw = evNum(job.hvac.backupHeatKw);
    if (heatKw !== null) heatW += heatKw * 1000;

    var rangeAll = (job.loads || []).filter(function (L) {
      if (L.state === 'Existing, being removed' || L.state === 'Future, not used for sizing') return false;
      var k = (L.kind || '').toLowerCase();
      return k.indexOf('range') >= 0 || k.indexOf('cooktop') >= 0 || k.indexOf('oven') >= 0;
    });
    var rangeLoad = rangeAll[0];
    var rangeW = 0;
    if (rangeLoad) { var rw = loadWatts(rangeLoad); if (rw) rangeW = rw.w; }
    /* a second cooking appliance is a load, not a rounding error */
    rangeAll.slice(1).forEach(function (L) {
      var xw = loadWatts(L);
      if (xw) {
        appliances.push({ name: (L.kind || 'Additional cooking appliance') + ', second unit', watts: xw.w, cat: 'other' });
        notes.push('A second cooking appliance was counted as an other load, not as the range.');
      }
    });

    return {
      occupancy: 'single',
      system: SYS_MAP[s.supplyVoltage] || '120/240-1p',
      serviceA: n0(s.mainBreaker) || n0(s.serviceRating),
      panelSpacesFree: s.spacesFree === '' ? undefined : s.spacesFree,
      areaUnit: a.unit === 'sqft' ? 'sqft' : 'm2',
      areaAbove: n0(a.above),
      areaBelow: n0(a.below),
      belowCeilingM: n0(a.belowHeight) || 0,
      areaExclBasement: n0(a.exclBasement) || n0(a.above),
      heatW: heatW, heatMode: heatMode,
      coolW: acW,
      interlock: job.hvac.interlock === 'Interlocked, cannot run together',
      rangeW: rangeW,
      appliances: appliances, evse: evse,
      evemsMode: 'none',   // EVEMS relief is a Master Electrician decision, never applied automatically
      evemsSetpointW: 0,
      measuredPeakW: measuredPeakW(job), newLoadsW: newW, runway: [],
      _notes: notes
    };
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
      try { inp = toEngine(job); r = global.calculate(inp); } catch (e) { r = null; }
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

    var evPresent = job.types.indexOf('ev') >= 0;
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
        lines.push({ label: 'Electric space heating', w: hcount, note: Number(d.heatKw) > 0 ? 'Rule 62-118 1), first 10 kW at 100 percent then 75 percent with thermostats' : 'No kW given, screened at 45 W per m2. Rule 62-118 1) demand applied.' });
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

  global.FCGates = {
    packet: packet, holds: holds, toEngine: toEngine, status: status, dataWarnings: dataWarnings,
    express: express, alignment: alignment, vdrop: vdrop, evAnnualKwh: evAnnualKwh,
    loadWatts: loadWatts, photoPackFor: photoPackFor, assumedFields: assumedFields, R_CU: R_CU, R_AL: R_AL
  };
})(window);
