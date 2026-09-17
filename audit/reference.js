/* The standing reference test. This is the one that must never move.
 *
 * Carson Knittig, 30 Westwyck Link, Spruce Grove. The hand calculation is in
 * skills/user/raydn-200a-service-upgrade/references/load-calc.md under "Worked
 * example, Carson Knittig". The engine matched it exactly when it was built and
 * it has to keep matching it, because everything else in FieldCalc is a wrapper
 * around this number.
 *
 * Run: node audit/reference.js
 * Exit code 1 means the engine moved. Stop and find out why before shipping.
 */
var path = require('path');
var { FC, G, calculate } = require(path.join(__dirname, 'shim.js'));

var EXPECT = {
  areaM2: 299.6,
  totalW: 25250,
  amps: 105.2,
  runway: [129.2, 133.4, 173.4, 200.0]
};
var TOL = { areaM2: 0.15, totalW: 1, amps: 0.05, runway: 0.05 };

function carson() {
  var j = FC.blankJob('master');
  j.header.customer = 'Carson Knittig';
  j.header.address = '30 Westwyck Link, Spruce Grove';
  j.juris.authority = 'City of Spruce Grove';
  j.juris.utility = 'FortisAlberta';

  j.areas.unit = 'sqft';
  j.areas.above = '2400';
  j.areas.aboveSource = 'Municipal property record';
  j.areas.hasBasement = 'Yes';
  j.areas.below = '1100';
  j.areas.belowHeight = '2.4';
  j.areas.exclBasement = '2400';

  j.service.supplyVoltage = '120/240 V, 3 wire';
  j.service.serviceRating.value = '100';
  j.service.mainBreaker.value = '100';
  j.service.busRating.value = '100';

  // Range 13,000 W. Dryer 5,000 W. EV at its maximum setting, 40 A on 240 V.
  j.loads = [
    { kind: 'Range', state: 'Existing, staying', w: FC.ev('W'), va: FC.ev('VA'), amps: FC.ev('A'), mca: FC.ev('A'), mocp: FC.ev('A'), makeModel: FC.ev(''), voltage: '240' },
    { kind: 'Dryer', state: 'Existing, staying', w: FC.ev('W'), va: FC.ev('VA'), amps: FC.ev('A'), mca: FC.ev('A'), mocp: FC.ev('A'), makeModel: FC.ev(''), voltage: '240' },
    { kind: 'EVSE', state: 'Proposed', w: FC.ev('W'), va: FC.ev('VA'), amps: FC.ev('A'), mca: FC.ev('A'), mocp: FC.ev('A'), makeModel: FC.ev(''), voltage: '240' }
  ];
  j.loads[0].w.value = '13000'; j.loads[0].w.evidenceStatus = 'Nameplate photo';
  j.loads[1].w.value = '5000';  j.loads[1].w.evidenceStatus = 'Nameplate photo';
  j.loads[2].amps.value = '40'; j.loads[2].amps.evidenceStatus = 'Nameplate photo';

  return j;
}

function near(got, want, tol) { return Math.abs(got - want) <= tol; }

var fails = [];
function check(label, got, want, tol) {
  var ok = near(got, want, tol);
  if (!ok) fails.push(label + ': expected ' + want + ', got ' + got);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label.padEnd(34) + String(got).padStart(9) +
    '   expected ' + want);
}

var j = carson();
var inp = G.toEngine(j);
var r = calculate(inp);

console.log('Reference case, Carson Knittig, Rule 8-200 single dwelling');
console.log('---------------------------------------------------------');
check('Living area, Rule 8-110, m2', Number(r.areaM2 !== undefined ? r.areaM2.toFixed(1) : (inp.areaAbove + inp.areaBelow * 0.75) * 0.092903), EXPECT.areaM2, TOL.areaM2);
check('Calculated load, W', Math.round(r.totalW), EXPECT.totalW, TOL.totalW);
check('Calculated load, A', Number(r.amps.toFixed(1)), EXPECT.amps, TOL.amps);

// The measured demand path must stay switched off unless it was filled in,
// because a silently applied Rule 8-106 8) would quietly shrink every result.
check('Rule 8-106 8) peak, W, unfilled', inp.measuredPeakW, 0, 0);
check('Additional loads, W', inp.newLoadsW, 9600, 0);

var j2 = carson();
j2.service.measured = { value: '14', unit: 'kW', source: 'Fortis interval data', window: 'September 2025 to August 2026' };
var inp2 = G.toEngine(j2);
check('Rule 8-106 8) peak, W, filled', inp2.measuredPeakW, 14000, 0);

var j3 = carson();
j3.service.measured = { value: '14', unit: 'kW', source: '', window: '' };
check('Rule 8-106 8) with no source', G.toEngine(j3).measuredPeakW, 0, 0);

console.log('');
if (fails.length) {
  console.log('REFERENCE BROKEN, ' + fails.length + ' failure' + (fails.length === 1 ? '' : 's') + ':');
  fails.forEach(function (f) { console.log('  ' + f); });
  process.exit(1);
}
console.log('Reference holds. ' + EXPECT.totalW + ' W, ' + EXPECT.amps + ' A.');
