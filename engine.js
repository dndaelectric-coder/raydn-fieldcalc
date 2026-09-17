/* =====================================================================
   Raydn CEC Load Calculator, calculation engine
   Basis: CSA C22.1:24, 2024 Canadian Electrical Code Part I, 26th ed.
   Alberta layer: STANDATA 24-ECB-008 (April 2025), 24-ECI-086 (April 2025)
   All rule text read verbatim from the book on 2026-09-05.
   ===================================================================== */

const SQFT_PER_M2 = 10.7639;

/* ---------- unit helpers ---------- */
function toM2(value, unit) {
  const v = Number(value) || 0;
  return unit === 'sqft' ? v / SQFT_PER_M2 : v;
}
function fmtW(w) {
  return (Math.round(w)).toLocaleString('en-CA');
}
function fmtA(a) {
  return a.toFixed(1);
}

/* ---------- system voltage divisors ----------
   Rule 8-100 as clarified by Alberta STANDATA 24-ECB-008:
   a 120/208 V 3 wire feeder from a 120/208 V 3 phase 4 wire supply uses a
   divisor of 240 V (120 x 2). A 120/208 V 3 phase 4 wire service uses
   1.73 x 208.                                                            */
const SYSTEMS = {
  '120/240-1p': { label: '120/240 V single phase, 3 wire', divisor: 240, note: 'Rule 8-100, 240 V divisor' },
  '120/208-3w': { label: '120/208 V, 3 wire from a 3 phase 4 wire supply', divisor: 240, note: 'STANDATA 24-ECB-008, divisor is 120 x 2 = 240 V' },
  '120/208-3p': { label: '120/208 V, 3 phase 4 wire', divisor: 1.73 * 208, note: 'STANDATA 24-ECB-008, divisor is 1.73 x 208 V' },
  '347/600-3p': { label: '347/600 V, 3 phase 4 wire', divisor: 1.73 * 600, note: 'Rule 8-100, divisor is 1.73 x 600 V' }
};

/* ---------- Rule 8-110, determination of areas ----------
   a) 100 percent of the ground floor
   b) 100 percent of areas above the ground floor used for living purposes
   c) 75 percent of ONLY those areas below the ground floor that exceed
      1.8 m in height. Item c) does NOT say "used for living purposes", so
      an unfinished basement with more than 1.8 m of headroom still counts. */
function livingArea(inp) {
  const above = toM2(inp.areaAbove, inp.areaUnit);
  const belowRaw = toM2(inp.areaBelow, inp.areaUnit);
  const counts = belowRaw > 0 && Number(inp.belowCeilingM) > 1.8;
  const belowCounted = counts ? belowRaw * 0.75 : 0;
  return {
    above,
    belowRaw,
    belowCounted,
    counts,
    total: above + belowCounted
  };
}

/* ---------- Section 62 space heating demand ----------
   Rule 62-118 3): residential occupancy with automatic thermostatic control
   in each room or heated area, first 10 kW at 100 percent, balance at 75.
   Rule 62-118 4): an electric furnace, duct heater or thermal storage
   heating system is calculated at 100 percent.                            */
function heatingDemand(connectedW, mode) {
  const w = Number(connectedW) || 0;
  if (w <= 0) return { value: 0, rule: '', note: '' };
  if (mode === 'furnace') {
    return {
      value: w,
      rule: '62-118 4)',
      note: 'electric furnace, duct heater or thermal storage, 100 percent demand'
    };
  }
  if (mode === 'thermostat') {
    const value = Math.min(w, 10000) + Math.max(0, w - 10000) * 0.75;
    return {
      value,
      rule: '62-118 3)',
      note: 'thermostatic control in each heated area, first 10 kW at 100 percent then 75 percent'
    };
  }
  return { value: w, rule: '62-118 1)', note: 'no thermostatic control declared, full connected rating' };
}

/* ---------- Rule 8-106 3), heat versus cool ----------
   The larger of the two is permitted ONLY where interlocks are installed. */
function heatCoolLine(heatW, heatMode, coolW, interlock, ruleRef) {
  const h = heatingDemand(heatW, heatMode);
  const c = Number(coolW) || 0;
  if (h.value <= 0 && c <= 0) return null;
  if (interlock) {
    const larger = Math.max(h.value, c);
    return {
      label: 'Space heating and air conditioning',
      rule: ruleRef + ', 8-106 3)',
      basis: 'interlock installed, so the greater of heating ' + fmtW(h.value) +
        ' W (' + (h.rule || 'n/a') + ') and cooling ' + fmtW(c) + ' W is used',
      watts: larger
    };
  }
  return {
    label: 'Space heating and air conditioning',
    rule: ruleRef,
    basis: 'no interlock declared, so 8-106 3) does not apply and both loads count. Heating ' +
      fmtW(h.value) + ' W' + (h.rule ? ' per ' + h.rule : '') + ' plus cooling ' + fmtW(c) + ' W at 100 percent',
    watts: h.value + c
  };
}

/* ---------- Rule 8-500 / 8-106 10) and 11), EVSE ----------
   Alberta STANDATA 24-ECI-086 requires the MAXIMUM adjustable setting to be
   used unless the setting is made by an electrician and is behind a barrier. */
function evseLine(inp, ruleRef) {
  const list = (inp.evse || []).filter(e => Number(e.watts) > 0);
  if (!list.length) return null;
  const total = list.reduce((s, e) => s + Number(e.watts), 0);
  const names = list.map(e => e.name + ' ' + fmtW(e.watts) + ' W').join(', ');

  if (inp.evemsMode === 'exempt') {
    return {
      label: 'Electric vehicle supply equipment',
      rule: '8-106 11)',
      basis: 'EVEMS monitors the service, feeders and branch circuits and controls the EVSE per Rule 8-500, so the EVSE load is not required to be counted. Connected: ' + names,
      watts: 0
    };
  }
  if (inp.evemsMode === 'setpoint') {
    const sp = Number(inp.evemsSetpointW) || 0;
    return {
      label: 'Electric vehicle supply equipment',
      rule: '8-106 10)',
      basis: 'EVEMS installed, demand equals the maximum load allowed by the system, ' + fmtW(sp) + ' W. Connected: ' + names,
      watts: sp
    };
  }
  return {
    label: 'Electric vehicle supply equipment',
    rule: ruleRef,
    basis: '100 percent at the maximum adjustable setting per Alberta STANDATA 24-ECI-086. ' + names,
    watts: total
  };
}

/* ---------- Rule 8-200, single dwelling ---------- */
function calc8200(inp) {
  const lines = [];
  const area = livingArea(inp);

  // i) and ii) basic load. 5000 W for the first 90 m2, then 1000 W for each
  // 90 m2 OR PORTION THEREOF in excess, so it rounds up.
  let basic = 5000, portions = 0;
  if (area.total > 90) {
    portions = Math.ceil((area.total - 90) / 90);
    basic = 5000 + 1000 * portions;
  }
  lines.push({
    label: 'Basic load, general lighting and receptacles',
    rule: '8-200 1) a) i) and ii)',
    basis: area.total.toFixed(1) + ' m2 living area per Rule 8-110' +
      (area.counts ? ' (includes 75 percent of ' + area.belowRaw.toFixed(1) + ' m2 below grade over 1.8 m)' : '') +
      '. 5000 W for the first 90 m2 plus ' + portions + ' x 1000 W',
    watts: basic
  });

  // iii) heating and cooling
  const hc = heatCoolLine(inp.heatW, inp.heatMode, inp.coolW, inp.interlock, '8-200 1) a) iii)');
  if (hc) lines.push(hc);

  // iv) range
  const rangeW = Number(inp.rangeW) || 0;
  const hasRange = rangeW > 0;
  if (hasRange) {
    const v = 6000 + 0.40 * Math.max(0, rangeW - 12000);
    lines.push({
      label: 'Electric range',
      rule: '8-200 1) a) iv)',
      basis: 'nameplate ' + fmtW(rangeW) + ' W. 6000 W plus 40 percent of the amount over 12 kW',
      watts: v
    });
  }

  // v) tankless and specialty water heating, 100 percent
  const tankless = (inp.appliances || []).filter(a => a.cat === 'tankless' && Number(a.watts) > 0);
  if (tankless.length) {
    const t = tankless.reduce((s, a) => s + Number(a.watts), 0);
    lines.push({
      label: 'Tankless water heaters, pool, hot tub and spa heaters',
      rule: '8-200 1) a) v)',
      basis: '100 percent demand factor per Rule 8-200 1) a) v), confirmed by Alberta STANDATA 24-ECB-008. ' +
        tankless.map(a => a.name + ' ' + fmtW(a.watts) + ' W').join(', '),
      watts: t
    });
  }

  // vi) EVSE
  const ev = evseLine(inp, '8-200 1) a) vi)');
  if (ev) lines.push(ev);

  // vii) any other load over 1500 W. STANDATA 24-ECB-008 puts the domestic
  // hot water STORAGE TANK heater here, not in item v), and requires the
  // nameplate rating of each load to be used.
  const others = (inp.appliances || []).filter(a => a.cat !== 'tankless' && Number(a.watts) > 1500);
  const ignored = (inp.appliances || []).filter(a => a.cat !== 'tankless' && Number(a.watts) > 0 && Number(a.watts) <= 1500);
  if (others.length) {
    const sum = others.reduce((s, a) => s + Number(a.watts), 0);
    let v, basis;
    if (hasRange) {
      v = others.reduce((s, a) => s + 0.25 * Number(a.watts), 0);
      basis = 'a range is provided, so 25 percent of the nameplate rating of each load over 1500 W per STANDATA 24-ECB-008. ' +
        others.map(a => a.name + ' ' + fmtW(a.watts) + ' W').join(', ');
    } else {
      v = Math.min(sum, 6000) + 0.25 * Math.max(0, sum - 6000);
      basis = 'no range is provided, so 100 percent of the combined ' + fmtW(sum) +
        ' W up to 6000 W plus 25 percent of the balance. ' +
        others.map(a => a.name + ' ' + fmtW(a.watts) + ' W').join(', ');
    }
    lines.push({ label: 'Other loads over 1500 W', rule: '8-200 1) a) vii)', basis, watts: v });
  }

  const itemA = lines.reduce((s, l) => s + l.watts, 0);

  // b) the floor, not a cap
  const exclM2 = toM2(inp.areaExclBasement || inp.areaAbove, inp.areaUnit);
  const itemB = exclM2 >= 80 ? 24000 : 14400;
  const itemBnote = exclM2.toFixed(1) + ' m2 exclusive of basement floor area, ' +
    (exclM2 >= 80 ? '80 m2 or more, so the minimum is 24 000 W' : 'under 80 m2, so the minimum is 14 400 W');

  const governing = Math.max(itemA, itemB);
  return {
    lines, itemA, itemB, itemBnote, governing,
    governingSource: governing === itemB && itemB > itemA ? 'Item b), the Code minimum' : 'Item a), the itemised calculation',
    ignored,
    area
  };
}

/* ---------- Rule 8-202 1), one dwelling unit in an apartment ---------- */
function calc8202Unit(inp) {
  const lines = [];
  const area = livingArea(inp);

  // i) 3500 W first 45 m2, ii) 1500 W for the second 45 m2 or portion,
  // iii) 1000 W for each additional 90 m2 or portion over the initial 90 m2
  let basic = 3500, detail = '3500 W for the first 45 m2';
  if (area.total > 45) { basic += 1500; detail += ' plus 1500 W for the second 45 m2'; }
  let extra = 0;
  if (area.total > 90) {
    extra = Math.ceil((area.total - 90) / 90);
    basic += 1000 * extra;
    detail += ' plus ' + extra + ' x 1000 W for each additional 90 m2 or portion over 90 m2';
  }
  lines.push({
    label: 'Basic load, general lighting and receptacles',
    rule: '8-202 1) a) i) to iii)',
    basis: area.total.toFixed(1) + ' m2 living area per Rule 8-110. ' + detail,
    watts: basic
  });

  const hc = heatCoolLine(inp.heatW, inp.heatMode, inp.coolW, inp.interlock, '8-202 1) a) iv)');
  if (hc) lines.push(hc);

  const rangeW = Number(inp.rangeW) || 0;
  const hasRange = rangeW > 0;
  if (hasRange) {
    lines.push({
      label: 'Electric range',
      rule: '8-202 1) a) v)',
      basis: 'nameplate ' + fmtW(rangeW) + ' W. 6000 W plus 40 percent of the amount over 12 kW',
      watts: 6000 + 0.40 * Math.max(0, rangeW - 12000)
    });
  }

  const tankless = (inp.appliances || []).filter(a => a.cat === 'tankless' && Number(a.watts) > 0);
  if (tankless.length) {
    lines.push({
      label: 'Tankless water heaters, pool, hot tub and spa heaters',
      rule: '8-202 1) a) vi)',
      basis: '100 percent demand factor, confirmed by Alberta STANDATA 24-ECB-008. ' +
        tankless.map(a => a.name + ' ' + fmtW(a.watts) + ' W').join(', '),
      watts: tankless.reduce((s, a) => s + Number(a.watts), 0)
    });
  }

  const ev = evseLine(inp, '8-202 1) a) vii)');
  if (ev) lines.push(ev);

  // viii) 25 percent of each load over 1500 W, plus 6000 W if there is no range
  const others = (inp.appliances || []).filter(a => a.cat !== 'tankless' && Number(a.watts) > 1500);
  const ignored = (inp.appliances || []).filter(a => a.cat !== 'tankless' && Number(a.watts) > 0 && Number(a.watts) <= 1500);
  if (others.length || !hasRange) {
    const quarter = others.reduce((s, a) => s + 0.25 * Number(a.watts), 0);
    const v = hasRange ? quarter : quarter + 6000;
    lines.push({
      label: 'Other loads over 1500 W',
      rule: '8-202 1) a) viii)',
      basis: (hasRange
        ? 'a range is provided, so 25 percent of the rating of each load over 1500 W'
        : 'no range is provided, so 25 percent of each load over 1500 W plus 6000 W') +
        (others.length ? '. ' + others.map(a => a.name + ' ' + fmtW(a.watts) + ' W').join(', ') : ''),
      watts: v
    });
  }

  const itemA = lines.reduce((s, l) => s + l.watts, 0);
  const divisor = SYSTEMS[inp.system || '120/240-1p'].divisor;
  const itemBamps = 60; // 8-202 1) b) is stated in amperes, not watts
  const itemB = itemBamps * divisor;

  const governing = Math.max(itemA, itemB);

  // Pieces the building calculation needs separated out, per 8-202 3) a)
  const evW = ev ? ev.watts : 0;
  const hcW = hc ? hc.watts : 0;

  return {
    lines, itemA, itemB, itemBamps,
    itemBnote: 'Rule 8-202 1) b) sets a minimum of 60 A, which is ' + fmtW(itemB) + ' W at this system voltage',
    governing,
    governingSource: governing === itemB && itemB > itemA ? 'Item b), the 60 A Code minimum' : 'Item a), the itemised calculation',
    ignored, area,
    parts: { evW, hcW, base: itemA - evW - hcW }
  };
}

/* ---------- Rule 8-202 3), the apartment building service ----------
   Diversity applies to the unit loads with EVSE, space heating and air
   conditioning EXCLUDED. Alberta STANDATA 24-ECB-008 is explicit that EV
   loads come out before the derating step and go back in at 100 percent at
   the end, so the service is not undersized.                              */
function calc8202Building(inp, unit) {
  const n = Math.max(1, Math.round(Number(inp.unitCount) || 1));
  const per = unit.parts.base; // per unit, less EVSE, heat and cool
  const lines = [];

  // a) 100 / 65 / 40 / 25 / 10 diversity ladder
  const bands = [
    { count: Math.min(n, 1), pct: 1.00, label: 'the unit having the heaviest load' },
    { count: Math.min(Math.max(n - 1, 0), 2), pct: 0.65, label: 'the next 2 units' },
    { count: Math.min(Math.max(n - 3, 0), 2), pct: 0.40, label: 'the next 2 units' },
    { count: Math.min(Math.max(n - 5, 0), 15), pct: 0.25, label: 'the next 15 units' },
    { count: Math.max(n - 20, 0), pct: 0.10, label: 'the remaining units' }
  ];
  let diversified = 0;
  const bandRows = [];
  bands.forEach(b => {
    if (b.count <= 0) return;
    const w = b.count * per * b.pct;
    diversified += w;
    bandRows.push({ n: b.count, pct: b.pct * 100, label: b.label, watts: w });
  });
  lines.push({
    label: 'Dwelling unit loads with diversity',
    rule: '8-202 3) a)',
    basis: n + ' units at ' + fmtW(per) + ' W each, excluding EVSE, space heating and air conditioning. ' +
      bandRows.map(r => r.n + ' at ' + r.pct + ' percent').join(', '),
    watts: diversified,
    bands: bandRows
  });

  // b) all space heating, Section 62, subject to 8-106 3)
  // c) all air conditioning at 100 percent, subject to 8-106 3)
  if (unit.parts.hcW > 0) {
    lines.push({
      label: 'Space heating and air conditioning, all units',
      rule: '8-202 3) b) and c)',
      basis: 'no diversity is permitted on these loads. ' + n + ' units at ' + fmtW(unit.parts.hcW) + ' W each',
      watts: n * unit.parts.hcW
    });
  }

  // d) EVSE not supplied from a unit panelboard, at 100 percent.
  // Per STANDATA 24-ECB-008, in unit EVSE also returns at 100 percent at the
  // final step rather than being derated.
  const evUnits = unit.parts.evW * n;
  const evCommon = Number(inp.evCommonW) || 0;
  if (evUnits + evCommon > 0) {
    lines.push({
      label: 'Electric vehicle supply equipment',
      rule: '8-202 3) d), STANDATA 24-ECB-008',
      basis: 'added back at the final step at 100 percent with no derating. In unit ' +
        fmtW(evUnits) + ' W, common area ' + fmtW(evCommon) + ' W',
      watts: evUnits + evCommon
    });
  }

  // e) non dwelling loads at 75 percent
  const nonDwelling = Number(inp.nonDwellingW) || 0;
  if (nonDwelling > 0) {
    lines.push({
      label: 'Lighting, heating and power not in dwelling units',
      rule: '8-202 3) e)',
      basis: fmtW(nonDwelling) + ' W connected, 75 percent demand factor',
      watts: nonDwelling * 0.75
    });
  }

  const total = lines.reduce((s, l) => s + l.watts, 0);
  return { lines, total, unitCount: n, perUnit: per };
}

/* ---------- Rules 8-204, 8-206, 8-208, area based occupancies ---------- */
const AREA_OCC = {
  school: {
    rule: '8-204', label: 'School',
    build: (inp) => {
      const cls = toM2(inp.classroomArea, inp.areaUnit);
      const total = toM2(inp.buildingArea, inp.areaUnit);
      const rest = Math.max(0, total - cls);
      return [
        { label: 'Classroom area', rule: '8-204 1) a)', basis: cls.toFixed(1) + ' m2 at 50 W/m2', watts: cls * 50 },
        { label: 'Remaining building area', rule: '8-204 1) b)', basis: rest.toFixed(1) + ' m2 at 10 W/m2, outside dimensions', watts: rest * 10 }
      ];
    },
    balancePct: 0.75, largePct: 0.50
  },
  hospital: {
    rule: '8-206', label: 'Hospital',
    build: (inp) => {
      const total = toM2(inp.buildingArea, inp.areaUnit);
      const hi = toM2(inp.highIntensityArea, inp.areaUnit);
      const rows = [{ label: 'Building area', rule: '8-206 1) a)', basis: total.toFixed(1) + ' m2 at 20 W/m2, outside dimensions', watts: total * 20 }];
      if (hi > 0) rows.push({ label: 'High intensity areas such as operating rooms', rule: '8-206 1) b)', basis: hi.toFixed(1) + ' m2 at 100 W/m2', watts: hi * 100 });
      return rows;
    },
    balancePct: 0.80, largePct: 0.65
  },
  hotel: {
    rule: '8-208', label: 'Hotel, motel or dormitory',
    build: (inp) => {
      const total = toM2(inp.buildingArea, inp.areaUnit);
      const rows = [{ label: 'Building area', rule: '8-208 1) a)', basis: total.toFixed(1) + ' m2 at 20 W/m2, outside dimensions', watts: total * 20 }];
      const sp = Number(inp.specialLightingW) || 0;
      if (sp > 0) rows.push({ label: 'Special area lighting such as ballrooms', rule: '8-208 1) b)', basis: 'rating of the equipment installed', watts: sp });
      return rows;
    },
    balancePct: 0.80, largePct: 0.65
  }
};

function calcAreaOccupancy(inp, key) {
  const spec = AREA_OCC[key];
  const totalArea = toM2(inp.buildingArea, inp.areaUnit);
  const base = spec.build(inp);

  // c) permanently connected equipment at the rating installed
  const perm = (inp.appliances || []).filter(a => Number(a.watts) > 0);
  const permW = perm.reduce((s, a) => s + Number(a.watts), 0);

  // e) cord connected equipment on receptacles over 125 V or 20 A
  const cordW = Number(inp.cordConnectedW) || 0;

  const heat = heatingDemand(inp.heatW, inp.heatMode);
  const cool = Number(inp.coolW) || 0;
  const interlock = !!inp.interlock;
  const hcW = interlock ? Math.max(heat.value, cool) : heat.value + cool;

  const ev = evseLine(inp, spec.rule + ' 1) d)');
  const evW = ev ? ev.watts : 0;

  // Balance of the load, meaning everything except space heating and EVSE.
  // Space heating carries its own Section 62 factor and EVSE is 100 percent.
  const balanceRaw = base.reduce((s, r) => s + r.watts, 0) + permW + cordW +
    (interlock ? Math.max(0, hcW - heat.value) : cool);

  let balanceDemand, balanceNote;
  if (totalArea <= 900) {
    balanceDemand = balanceRaw * spec.balancePct;
    balanceNote = 'building area is ' + totalArea.toFixed(1) + ' m2, up to and including 900 m2, so ' +
      (spec.balancePct * 100) + ' percent applies to the balance of the load';
  } else {
    const perM2 = balanceRaw / totalArea;
    balanceDemand = spec.balancePct * perM2 * 900 + spec.largePct * perM2 * (totalArea - 900);
    balanceNote = 'building area is ' + totalArea.toFixed(1) + ' m2. Balance of ' + fmtW(balanceRaw) +
      ' W divided by area is ' + perM2.toFixed(1) + ' W/m2. ' + (spec.balancePct * 100) +
      ' percent on the first 900 m2 plus ' + (spec.largePct * 100) + ' percent on the remaining ' +
      (totalArea - 900).toFixed(1) + ' m2';
  }

  const lines = [];
  base.forEach(r => lines.push(Object.assign({ raw: true }, r)));
  if (permW > 0) lines.push({ raw: true, label: 'Permanently connected equipment', rule: spec.rule + ' 1) c)', basis: 'rating of the equipment installed. ' + perm.map(a => a.name + ' ' + fmtW(a.watts) + ' W').join(', '), watts: permW });
  if (cordW > 0) lines.push({ raw: true, label: 'Cord connected equipment over 125 V or 20 A', rule: spec.rule + ' 1) e)', basis: '80 percent of the receptacle rating or the rating of the equipment', watts: cordW });
  if (cool > 0 || (interlock && hcW > heat.value)) lines.push({ raw: true, label: 'Air conditioning', rule: spec.rule + ' 1) c)', basis: interlock ? 'interlock installed, 8-106 3), the greater of heat and cool' : '100 percent of the rating installed', watts: interlock ? Math.max(0, hcW - heat.value) : cool });

  const demandLines = [{
    label: 'Balance of the load with demand factor',
    rule: spec.rule + ' 2)',
    basis: balanceNote,
    watts: balanceDemand
  }];

  const heatCounted = interlock ? Math.min(heat.value, hcW) : heat.value;
  if (heatCounted > 0) {
    demandLines.push({
      label: 'Electric space heating',
      rule: spec.rule + ' 2) a) i), Section 62',
      basis: heat.note + (interlock ? '. Interlock installed, 8-106 3) applies' : ''),
      watts: heatCounted
    });
  }
  if (ev) demandLines.push(ev);

  const total = demandLines.reduce((s, l) => s + l.watts, 0);
  return { rawLines: lines, lines: demandLines, balanceRaw, total, label: spec.label };
}

/* ---------- Rule 8-210 and Table 14, other occupancies ---------- */
const TABLE_14 = [
  { key: 'store', label: 'Store or restaurant', wpm2: 30, svc: 100, fdr: 100 },
  { key: 'office', label: 'Office', wpm2: 50, svc: 90, fdr: 100, tiered: true },
  { key: 'industrial', label: 'Industrial and commercial', wpm2: 25, svc: 100, fdr: 100 },
  { key: 'church', label: 'Church', wpm2: 10, svc: 100, fdr: 100 },
  { key: 'garage', label: 'Garage', wpm2: 10, svc: 100, fdr: 100 },
  { key: 'warehouse', label: 'Storage warehouse', wpm2: 5, svc: 70, fdr: 90 },
  { key: 'theatre', label: 'Theatre', wpm2: 30, svc: 75, fdr: 95 },
  { key: 'armoury', label: 'Armoury or auditorium', wpm2: 10, svc: 80, fdr: 100 },
  { key: 'bank', label: 'Bank', wpm2: 50, svc: 100, fdr: 100 },
  { key: 'barber', label: 'Barbershop or beauty parlour', wpm2: 30, svc: 90, fdr: 100 },
  { key: 'club', label: 'Club', wpm2: 20, svc: 80, fdr: 100 },
  { key: 'courthouse', label: 'Courthouse', wpm2: 20, svc: 100, fdr: 100 },
  { key: 'lodge', label: 'Lodge', wpm2: 15, svc: 80, fdr: 100 }
];

function calc8210(inp) {
  const t = TABLE_14.find(x => x.key === inp.table14Key) || TABLE_14[0];
  const area = toM2(inp.buildingArea, inp.areaUnit);
  const forFeeder = inp.conductorTarget === 'feeder';
  const lines = [];

  if (t.tiered) {
    // Office: first 930 m2 at 90 percent service / 100 percent feeder,
    // all in excess of 930 m2 at 70 percent service / 90 percent feeder.
    const first = Math.min(area, 930), rest = Math.max(0, area - 930);
    const p1 = forFeeder ? 1.00 : 0.90;
    const p2 = forFeeder ? 0.90 : 0.70;
    lines.push({
      label: 'Basic load, first 930 m2',
      rule: '8-210 a), Table 14',
      basis: first.toFixed(1) + ' m2 at 50 W/m2, demand factor ' + (p1 * 100) + ' percent for ' + (forFeeder ? 'feeders' : 'service conductors'),
      watts: first * t.wpm2 * p1
    });
    if (rest > 0) lines.push({
      label: 'Basic load, area over 930 m2',
      rule: '8-210 a), Table 14',
      basis: rest.toFixed(1) + ' m2 at 50 W/m2, demand factor ' + (p2 * 100) + ' percent',
      watts: rest * t.wpm2 * p2
    });
  } else {
    const p = (forFeeder ? t.fdr : t.svc) / 100;
    lines.push({
      label: 'Basic load, ' + t.label.toLowerCase(),
      rule: '8-210 a), Table 14',
      basis: area.toFixed(1) + ' m2 at ' + t.wpm2 + ' W/m2, outside dimensions, demand factor ' +
        (p * 100) + ' percent for ' + (forFeeder ? 'feeders' : 'service conductors'),
      watts: area * t.wpm2 * p
    });
  }

  // b) special loads at the rating installed with Code demand factors
  const heat = heatingDemand(inp.heatW, inp.heatMode);
  const cool = Number(inp.coolW) || 0;
  const hc = inp.interlock
    ? { watts: Math.max(heat.value, cool), basis: 'interlock installed per 8-106 3), the greater of heating ' + fmtW(heat.value) + ' W and cooling ' + fmtW(cool) + ' W' }
    : { watts: heat.value + cool, basis: 'no interlock, heating ' + fmtW(heat.value) + ' W' + (heat.note ? ' (' + heat.note + ')' : '') + ' plus cooling ' + fmtW(cool) + ' W' };
  if (hc.watts > 0) lines.push({ label: 'Space heating and air conditioning', rule: '8-210 b)', basis: hc.basis, watts: hc.watts });

  const perm = (inp.appliances || []).filter(a => Number(a.watts) > 0);
  if (perm.length) lines.push({
    label: 'Special loads, motors, show window and stage lighting, process equipment',
    rule: '8-210 b)',
    basis: 'rating of the equipment installed. ' + perm.map(a => a.name + ' ' + fmtW(a.watts) + ' W').join(', '),
    watts: perm.reduce((s, a) => s + Number(a.watts), 0)
  });

  const sw = Number(inp.showWindowM) || 0;
  if (sw > 0) lines.push({
    label: 'Show window lighting',
    rule: '8-212 2)',
    basis: sw.toFixed(1) + ' m measured along the base of the window at not less than 650 W/m',
    watts: sw * 650
  });

  const ev = evseLine(inp, '8-210 c)');
  if (ev) lines.push(ev);

  return { lines, total: lines.reduce((s, l) => s + l.watts, 0), occupancy: t.label };
}

/* ---------- Rule 8-400, block heater receptacles ----------
   Calculated separately with its own demand factor and then added, per
   Alberta STANDATA 24-ECB-008. The 75 percent factor of 8-202 3) e) is not
   applied to this load.                                                    */
function calc8400(inp) {
  const n = Math.max(0, Math.round(Number(inp.stallCount) || 0));
  if (!n) return null;
  const controlled = inp.stallControlled === 'yes';
  const amp20 = String(inp.stallCircuit) === '20';
  const table = controlled
    ? { first30: amp20 ? 975 : 650, next30: amp20 ? 825 : 550, rest: amp20 ? 675 : 450, sub: '8-400 4)' }
    : { first30: amp20 ? 1800 : 1200, next30: amp20 ? 1500 : 1000, rest: amp20 ? 1200 : 800, sub: '8-400 3)' };
  const a = Math.min(n, 30), b = Math.min(Math.max(n - 30, 0), 30), c = Math.max(n - 60, 0);
  const w = a * table.first30 + b * table.next30 + c * table.rest;
  return {
    label: 'Vehicle heater receptacles',
    rule: table.sub,
    basis: n + ' stalls on ' + (amp20 ? '20 A' : '15 A') + ' circuits, ' +
      (controlled ? 'restricted or controlled' : 'not restricted or controlled') + '. ' +
      a + ' at ' + table.first30 + ' W' + (b ? ', ' + b + ' at ' + table.next30 + ' W' : '') +
      (c ? ', ' + c + ' at ' + table.rest + ' W' : ''),
    watts: w
  };
}

/* ---------- Rule 8-106 8), the measured alternative ---------- */
function calc8106_8(inp, newLoadsW) {
  const peak = Number(inp.measuredPeakW) || 0;
  if (peak <= 0) return null;
  return {
    peak,
    newLoads: newLoadsW,
    total: peak + newLoadsW,
    basis: 'measured maximum demand over the most recent 12 month period, ' + fmtW(peak) +
      ' W, plus the additional loads with Code demand factors, ' + fmtW(newLoadsW) + ' W'
  };
}

/* ---------- the verdict ---------- */
function verdict(calcAmps, serviceA) {
  const svc = Number(serviceA) || 0;
  if (!svc) return { code: 'NONE', label: 'No service rating entered', pct: 0 };
  const pct = (calcAmps / svc) * 100;
  if (pct > 100) return { code: 'FAIL', label: 'Over capacity', pct };
  if (pct >= 90) return { code: 'TIGHT', label: 'Within capacity but tight', pct };
  return { code: 'PASS', label: 'Within capacity', pct };
}

/* ---------- top level ---------- */
function calculate(inp) {
  const sys = SYSTEMS[inp.system || '120/240-1p'];
  const divisor = sys.divisor;
  let core, extraLines = [], title = '', ruleRef = '';

  if (inp.occupancy === 'single') {
    core = calc8200(inp); title = 'Single dwelling'; ruleRef = 'Rule 8-200';
  } else if (inp.occupancy === 'apt-unit') {
    core = calc8202Unit(inp); title = 'Dwelling unit in an apartment or similar building'; ruleRef = 'Rule 8-202 1)';
  } else if (inp.occupancy === 'apt-building') {
    const unit = calc8202Unit(inp);
    const bld = calc8202Building(inp, unit);
    core = { lines: bld.lines, itemA: bld.total, itemB: 0, itemBnote: '', governing: bld.total, governingSource: 'Rule 8-202 3), the building service calculation', ignored: unit.ignored, unit, building: bld };
    title = 'Apartment or similar building, main service'; ruleRef = 'Rule 8-202 3)';
  } else if (inp.occupancy === 'school' || inp.occupancy === 'hospital' || inp.occupancy === 'hotel') {
    const r = calcAreaOccupancy(inp, inp.occupancy);
    core = { lines: r.lines, rawLines: r.rawLines, itemA: r.total, itemB: 0, itemBnote: '', governing: r.total, governingSource: 'the itemised calculation', ignored: [] };
    title = r.label; ruleRef = 'Rule ' + AREA_OCC[inp.occupancy].rule;
  } else {
    const r = calc8210(inp);
    core = { lines: r.lines, itemA: r.total, itemB: 0, itemBnote: '', governing: r.total, governingSource: 'the itemised calculation', ignored: [] };
    title = r.occupancy + ', other occupancy'; ruleRef = 'Rule 8-210 and Table 14';
  }

  const heaters = calc8400(inp);
  if (heaters) extraLines.push(heaters);

  const totalW = core.governing + extraLines.reduce((s, l) => s + l.watts, 0);
  const amps = totalW / divisor;

  const alt = calc8106_8(inp, Number(inp.newLoadsW) || 0);
  const altAmps = alt ? alt.total / divisor : null;

  const v = verdict(amps, inp.serviceA);
  const vAlt = alt ? verdict(altAmps, inp.serviceA) : null;

  // Rule 8-108, spare spaces
  let spares = null;
  const need = inp.occupancy === 'apt-unit' ? 2 : (inp.occupancy === 'single' ? 4 : 0);
  if (need && inp.panelSpacesFree !== '' && inp.panelSpacesFree !== undefined && inp.panelSpacesFree !== null) {
    const free = Number(inp.panelSpacesFree) || 0;
    spares = {
      need, free, ok: free >= need,
      rule: inp.occupancy === 'apt-unit' ? '8-108 2)' : '8-108 1)',
      note: 'at the time of the original installation the panelboard needs at least ' + need +
        ' additional spaces with provision for a two pole device'
    };
  }

  // runway, what the next loads do to the number
  const runway = [];
  let running = totalW;
  (inp.runway || []).filter(r => Number(r.watts) > 0).forEach(r => {
    running += Number(r.watts);
    runway.push({ name: r.name, watts: Number(r.watts), cumulativeW: running, amps: running / divisor });
  });

  return {
    title, ruleRef, sys, divisor,
    core, extraLines, totalW, amps, verdict: v,
    alt, altAmps, verdictAlt: vAlt,
    spares, runway,
    serviceA: Number(inp.serviceA) || 0,
    headroomA: (Number(inp.serviceA) || 0) - amps
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculate, SYSTEMS, TABLE_14, livingArea, calc8200, calc8202Unit, SQFT_PER_M2 };
}
