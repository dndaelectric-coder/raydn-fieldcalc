/* Live load check, logic tests.
 *
 * Builds houses the way the Live load check screen builds them, with the
 * same quick cards and the same writeQ, then checks the scenario numbers,
 * the customer text and the "at least" floor logic.
 *
 * Hand arithmetic for every expected number is in the comment above it.
 * Rule text was read from the 2024 book this session: 8-200 1) a) i) to vii),
 * 8-200 1) b), 8-110, 8-106 3) 8) 11), 8-104 2) 5) 6), 62-118 3) 4), 64-112 4).
 *
 * Run: node audit/check.js     Exit code 1 means a case moved.
 */
var path = require('path');
var { FC, G } = require(path.join(__dirname, 'shim.js'));

/* fc-check.js needs a UI object and a window listener at load time only. */
var fs = require('fs');
global.UI = { el: function () { return {}; } };
global.addEventListener = function () {};
global.App = { go: function () {} };
new Function('window', 'document', 'navigator', fs.readFileSync('/home/user/workspace/loadcalc/fc-check.js', 'utf8'))(global, global.document, global.navigator);
var CK = global.FCCheck;

var fails = [], passes = 0;
function ok(label, cond, got) {
  if (cond) { passes++; console.log('PASS  ' + label); }
  else { fails.push(label + (got !== undefined ? '  got ' + JSON.stringify(got) : '')); console.log('FAIL  ' + label + (got !== undefined ? '  got ' + JSON.stringify(got) : '')); }
}
function near(a, b, t) { return typeof a === 'number' && Math.abs(a - b) <= (t === undefined ? 0.05 : t); }
function r1(x) { return Math.round(x * 10) / 10; }

function item(id) {
  var hit = null;
  CK.QUICK.forEach(function (g) { g.items.forEach(function (it) { if (it.id === id) hit = it; }); });
  if (!hit) throw new Error('no quick item ' + id);
  return hit;
}
/* One card, typed the way a phone types it. */
function card(j, id, n, unit, extra) {
  var it = item(id);
  var L = CK.newLoad(it);
  CK.writeQ(L, n, unit || it.unit, 'plate');
  Object.keys(extra || {}).forEach(function (k) { L[k] = extra[k]; });
  j.loads.push(L);
  return L;
}
function house(o) {
  var j = FC.blankJob('master');
  j.mode = 'check'; j.types = ['service'];
  j.areas.unit = o.unit || 'sqft';
  j.areas.above = String(o.above);
  j.areas.aboveSource = o.src === undefined ? 'Municipal property record' : o.src;
  j.areas.hasBasement = o.bsmt === undefined ? 'No' : o.bsmt;
  if (o.below !== undefined) j.areas.below = String(o.below);
  if (o.height !== undefined) j.areas.belowHeight = String(o.height);
  if (o.belowClass) j.areas.belowClass = o.belowClass;
  if (o.main) j.service.mainBreaker.value = String(o.main);
  if (o.bus) j.service.busRating.value = String(o.bus);
  j.check.heat = o.heat === undefined ? 'fuel' : o.heat;
  if (o.il) j.hvac.interlock = o.il;
  return j;
}
var DASH = /[\u2012\u2013\u2014\u2015\u2212]| - /;
var NEG = /(^|[^0-9A-Za-z])-\s?\d/;
function cleanText(label, txt) {
  ok(label + ': no dash characters', !DASH.test(txt), (txt.match(DASH) || [])[0]);
  ok(label + ': no negative numbers', !NEG.test(txt.replace(/\d+-\d+/g, 'RULE')), (txt.replace(/\d+-\d+/g, 'RULE').match(NEG) || [])[0]);
  ok(label + ': never says code compliant', !/code compliant|will pass inspection|\bfail\b/i.test(txt));
}

/* ------------------------------------------------------------------ */
console.log('\nCase 1. Reference house, built on the live check screen');
/* 2400 sq ft above, 1100 sq ft basement over 1.8 m.
   Area 2400 + 0.75 x 1100 = 3225 sq ft = 299.6 m2.
   Basic 5000 + 3 x 1000 for the 209.6 m2 past 90 m2 = 8000 W. Range 13 kW:
   6000 + 0.4 x 1000 = 6400 W. Dryer 5000 at 25 percent = 1250 W.
   Itemised today 15,650 W, which is under
   the Rule 8-200 1) b) floor of 24,000 W for 80 m2 or more, so today is
   24,000 W = 100.0 A. Adding the 40 A charger at 100 percent under vi):
   25,250 W = 105.2 A. That is the standing reference. */
var c1 = house({ above: 2400, bsmt: 'Yes', below: 1100, height: 2.4, main: 100, bus: 100 });
card(c1, 'range', 13, 'kW');
card(c1, 'dryer', 5, 'kW');
var ev1 = card(c1, 'ev', 40, 'A', { evSet: 'max' });
var s1 = G.scenarios(c1);
ok('today 100.0 A on the 8-200 1) b) floor', near(s1.today.a, 100.0), s1.today.a);
ok('today band is tight, not over', s1.today.band.key === 'tight', s1.today.band.key);
ok('after the job 105.2 A', near(s1.after.a, 105.2), r1(s1.after.a));
ok('after band is over', s1.after.band.key === 'over', s1.after.band.key);
ok('load manager brings it back to 100.0 A', s1.managed && near(s1.managed.a, 100.0), s1.managed && r1(s1.managed.a));
ok('charger set lower: 34 A fits', s1.evMax && s1.evMax.a === 34, s1.evMax);
ok('charger now counted at 40 A', s1.evMax && near(s1.evMax.nowA, 40), s1.evMax && s1.evMax.nowA);
ok('200 A upgrade fits', s1.upgrade && s1.upgrade.svc === 200 && s1.upgrade.after.band.key === 'fits', s1.upgrade && s1.upgrade.after.band.key);
ok('no interlock option, there is no electric heat', !s1.interlock);
ok('nothing missing, so no at least', s1.least === false, s1.low);
var m1 = G.marginal(c1, ev1);
ok('charger adds 5.2 A here, because the floor was governing', m1 && near(m1.a, 5.2), m1 && r1(m1.a));
ok('today sits on the 8-200 1) b) floor, after does not', s1.today.floor === true && s1.after.floor === false);
ok('the charger card knows the floor soaked up part of it', m1 && m1.floorBefore === true && m1.floor === false);
var t1 = G.customerText(c1, s1);
cleanText('Reference house customer text', t1);
ok('customer text names the load manager rule', /8-106 11\)/.test(t1));
ok('customer text has the 34 A option', /Up to 34 A fits/.test(t1));
ok('customer text names 24-ECI-086 meaning, a switch inside the charger', /switch inside the charger/.test(t1));
ok('customer text has no barrier wording', !/barrier/i.test(t1));
ok('customer text carries the contact line', /Dmitry Naboka, Master Electrician, ME# 13824 \| \(780\) 904-3462 \| info@raydnrenewables\.com \| raydnrenewables\.com/.test(t1));

/* ------------------------------------------------------------------ */
console.log('\nCase 2. Electric baseboard house adding air conditioning');
/* 150 m2, no basement. Basic: 5000 for the first 90 m2 plus 1000 for the
   next 60 m2 = 6000 W. Range 12 kW: 6000 W. Ten 1500 W baseboards on one
   card = 15,000 W connected, Rule 62-118 3): 10,000 + 0.75 x 5,000 = 13,750 W.
   Dryer 5000 plus tank 3000 = 8000 W, both over 1500 W, at 25 percent = 2000 W.
   Today: 6000 + 6000 + 13,750 + 2000 = 27,750 W = 115.6 A.
   AC 24 A x 240 V = 5,760 W at 100 percent. With no interlock both count:
   27,750 + 5,760 = 33,510 W = 139.6 A. With an interlock, Rule 8-106 3)
   takes the larger, the heat, so 27,750 W = 115.6 A. */
var c2 = house({ unit: 'm2', above: 150, main: 100, heat: 'electric', il: 'Unknown, needs verification' });
card(c2, 'baseboard', 1500, 'W', { qty: 10 });
card(c2, 'range', 12, 'kW');
card(c2, 'wh', 3, 'kW');
card(c2, 'dryer', 5, 'kW');
card(c2, 'ac', 24, 'A');
var s2 = G.scenarios(c2);
ok('today 27,750 W = 115.6 A', near(s2.today.r.totalW, 27750, 1) && near(s2.today.a, 115.6), [s2.today.r.totalW, r1(s2.today.a)]);
ok('room heat demand 13,750 W', near(s2.after.r._inp._hc.roomD, 13750, 1), s2.after.r._inp._hc.roomD);
ok('after, no interlock, 33,510 W = 139.6 A', near(s2.after.r.totalW, 33510, 1) && near(s2.after.a, 139.6), [s2.after.r.totalW, r1(s2.after.a)]);
ok('interlock option reads 115.6 A', s2.interlock && near(s2.interlock.a, 115.6), s2.interlock && r1(s2.interlock.a));
ok('flags warn both count without an interlock', s2.flags.some(function (f) { return /8-106 3\)/.test(f.text) && f.tone === 'warn'; }));
/* Installed today: ten baseboards, range, tank, dryer = 13 double pole.
   The AC is not in yet. 14 in the panel leaves exactly one unmatched. */
ok('ten baseboards count as ten double pole breakers', (function () { c2.check.dp = '14'; var x = G.scenarios(c2).flags.filter(function (f) { return /double pole/.test(f.text); }); c2.check.dp = ''; return x.length === 1 && /^1 double pole breaker in the panel is not matched/.test(x[0].text); })());
ok('nothing missing, so no at least', s2.least === false, s2.low);
var t2 = G.customerText(c2, s2);
cleanText('Baseboard customer text', t2);
ok('customer text offers the interlock with 116 A', /Interlock the heat and the air conditioning/.test(t2) && /116 A of 100 A/.test(t2));
/* The 200 A option: 139.6 of 200 leaves about 60 A. */
ok('upgrade line leaves about 60 A of room', /leaves about 60 A of room/.test(t2), (t2.match(/leaves about \d+ A/) || [])[0]);

/* ------------------------------------------------------------------ */
console.log('\nCase 3. Upgrade target that is still too small');
/* Same house, target 125 A. 139.6 A is over 125 A, so the line must not
   print a negative room. */
c2.check.target = '125';
var s3 = G.scenarios(c2);
var t3 = G.customerText(c2, s3);
cleanText('Undersized target text', t3);
ok('says the 125 A upgrade is still over', /That is still over, so it would need one of the other options as well\./.test(t3));
c2.check.target = '200';

/* ------------------------------------------------------------------ */
console.log('\nCase 4. Hot tub, heat pump with strips');
/* 200 m2, no basement. Basic 5000 + 1000 + 1000 (two portions of 90 m2
   past the first 90, the second partial) = 7000 W. Range 12 kW: 6000 W.
   Heat pump MCA 30 A x 240 = 7,200 W, strips 10 kW at 100 percent under
   Rule 62-118 4). Heat = 17,200 W. Dryer 5000 at 25 percent = 1,250 W.
   Today 7000 + 6000 + 17,200 + 1,250 = 31,450 W = 131.0 A.
   Hot tub 40 A x 240 = 9,600 W at 100 percent under 8-200 1) a) v):
   41,050 W = 171.0 A on a 200 A main. */
var c4 = house({ unit: 'm2', above: 200, main: 200, heat: 'hp' });
card(c4, 'hp', 30, 'A', { state: 'Existing, staying' });
card(c4, 'strips', 10, 'kW');
card(c4, 'range', 12, 'kW');
card(c4, 'dryer', 5, 'kW');
card(c4, 'tub', 40, 'A');
var s4 = G.scenarios(c4);
ok('heat pump plus strips today 31,450 W = 131.0 A', near(s4.today.r.totalW, 31450, 1) && near(s4.today.a, 131.0), [s4.today.r.totalW, r1(s4.today.a)]);
ok('hot tub at 100 percent, after 41,050 W = 171.0 A', near(s4.after.r.totalW, 41050, 1) && near(s4.after.a, 171.0), [s4.after.r.totalW, r1(s4.after.a)]);
ok('171 of 200 is 85.5 percent, fits', s4.after.band.key === 'fits', s4.after.band.key);
var m4 = G.marginal(c4, c4.loads[4]);
ok('hot tub marginal 40.0 A', m4 && near(m4.a, 40.0), m4 && r1(m4.a));
ok('no upgrade option at 200 A with the default target', !s4.upgrade);
cleanText('Heat pump customer text', G.customerText(c4, s4));

/* ------------------------------------------------------------------ */
console.log('\nCase 5. Recorded area in square feet');
/* 2,104 sq ft from the City record. 2104 / 10.7639 = 195.47 m2. */
var c5 = house({ above: 2104, main: 100 });
card(c5, 'range', 12, 'kW');
var s5 = G.scenarios(c5);
ok('2,104 sq ft reads 195.5 m2', near(s5.today.r.core.area.total, 195.5, 0.06), s5.today.r.core.area.total);
ok('13 dp, 13 known, no flag', (function () { c2.check.dp = '13'; var x = G.scenarios(c2).flags.some(function (f) { return /double pole/.test(f.text); }); c2.check.dp = ''; return !x; })());
ok('round trip back to 2,104 sq ft', Math.round(Math.round(2104 / 10.7639 * 10) / 10 * 10.7639) === 2104);
var c5b = house({ above: 2104, main: 100, src: 'Assumption' });
ok('an estimated area is flagged', G.scenarios(c5b).flags.some(function (f) { return /off by 500 sq ft on a past job/.test(f.text); }));
ok('that flag names no job, only the lesson', G.scenarios(c5b).flags.some(function (f) { return /A guessed area has been off by 500 sq ft on a past job\.$/.test(f.text); }));

/* ------------------------------------------------------------------ */
console.log('\nCase 6. Solar backfeed, Rule 64-112 4)');
/* 125 A bus, 100 A main, 40 A new solar breaker. Sum 140 A, limit
   1.25 x 125 = 156.25 A under f). 140 over 125, so b) puts it at the far end. */
var c6 = house({ above: 1500, main: 100, bus: 125 });
c6.check.solarOn = true; c6.check.solarNewA = '40';
var b6 = G.scenarios(c6).solar;
ok('140 of 156.25 A is inside 125 percent', b6 && b6.ok === true && near(b6.limit, 156.25) && b6.sum === 140, b6);
ok('far end required, sum over the bus', b6 && b6.farEnd === true);
/* 100 A bus, 100 A main, 40 A solar. 140 over 125: not ok. Largest that
   fits 125 - 100 = 25 A. A main derated to 80 A gives 80 + 40 = 120. */
var c6b = house({ above: 1500, main: 100, bus: 100 });
c6b.check.solarOn = true; c6b.check.solarNewA = '40';
var b6b = G.scenarios(c6b).solar;
ok('100 A bus with a 40 A source is over', b6b && b6b.ok === false);
ok('largest source breaker that fits is 25 A', b6b && near(b6b.maxNew, 25), b6b && b6b.maxNew);
ok('main derate to 80 A offered', b6b && b6b.derateTo === 80, b6b && b6b.derateTo);

/* ------------------------------------------------------------------ */
console.log('\nCase 7. At least, while readings are missing');
var c7 = house({ above: 1800, main: 100, bsmt: 'Yes' });
card(c7, 'range', 12, 'kW');
var s7 = G.scenarios(c7);
ok('blank basement area and height make it a floor', s7.least === true && s7.low.indexOf('the basement area is blank') >= 0 && s7.low.indexOf('the basement height is not answered') >= 0, s7.low);
c7.areas.below = '900'; c7.areas.belowClass = 'over';
ok('measured basement clears it', G.scenarios(c7).least === false, G.scenarios(c7).low);
var dry = card(c7, 'dryer', null, 'kW');
var s7b = G.scenarios(c7);
ok('a card with no number makes it a floor', s7b.least === true && s7b.low.indexOf('a load has no rating') >= 0, s7b.low);
CK.writeQ(dry, 5, 'kW', 'plate');
ok('filling it in clears it', G.scenarios(c7).least === false);
c7.check.heat = '';
ok('heating not answered makes it a floor', G.scenarios(c7).low.indexOf('the heating type is not answered') >= 0);
c7.check.heat = 'electric';
ok('electric picked with no heaters makes it a floor', G.scenarios(c7).low.indexOf('electric heat is picked with no heaters entered') >= 0);
c7.check.heat = 'fuel';
c7.check.dp = '3';
ok('unmatched double pole breakers make it a floor', G.scenarios(c7).low.indexOf('some double pole breakers are not matched to a load') >= 0, G.scenarios(c7).low);
c7.check.dp = '2';
ok('two double pole breakers, two cards, no floor', G.scenarios(c7).least === false, G.scenarios(c7).low);
c7.check.dp = '';
c7.loads[0].w.value = '';
var t7 = G.customerText(c7, G.scenarios(c7));
ok('customer text says at least and why the number can only rise', /at least \d+ A/.test(t7) && /can only raise these numbers/.test(t7));
cleanText('At least customer text', t7);
/* a walkdown job never answers the check heating question */
var w7 = house({ above: 1800, main: 100 });
w7.mode = ''; w7.check.heat = '';
card(w7, 'range', 12, 'kW');
ok('a walkdown job is not marked at least for the heating question', G.scenarios(w7).least === false, G.scenarios(w7).low);

/* ------------------------------------------------------------------ */
console.log('\nCase 8. Quick card arithmetic');
var q = CK.newLoad(item('dryer'));
CK.writeQ(q, 5.5, 'kW', 'plate');
ok('5.5 kW stores 5500 W', FC.evNum(q.w) === 5500, q.w.value);
var rq = CK.readQ(q);
ok('reads back as 5.5 kW', rq.n === 5.5 && rq.unit === 'kW', rq);
CK.writeQ(q, 22, 'A', 'plate');
ok('switching to amps clears the watts', FC.evNum(q.w) === null && FC.evNum(q.amps) === 22, [q.w.value, q.amps.value]);
CK.writeQ(q, 30, 'A', 'breaker');
ok('a breaker number goes to MOCP and clears amps', FC.evNum(q.mocp) === 30 && FC.evNum(q.amps) === null, [q.mocp.value, q.amps.value]);
CK.writeQ(q, null, 'A', 'breaker');
ok('blanking a quick card leaves nothing behind', ['w', 'va', 'amps', 'mca', 'mocp'].every(function (f) { return FC.evNum(q[f]) === null; }));

/* ------------------------------------------------------------------ */
console.log('\nCase 9. Bus under the main');
var c9 = house({ above: 1500, main: 125, bus: 100 });
ok('bus under main raises the only red flag', G.scenarios(c9).flags.some(function (f) { return f.tone === 'block'; }));
ok('no other case raises it', [s1, s2, s4].every(function (s) { return !s.flags.some(function (f) { return f.tone === 'block'; }); }));

console.log('\n' + passes + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
