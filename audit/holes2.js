const {FC,G,calculate}=require('./shim');
const out={}; 
function mk(){ const j=FC.blankJob('master'); j.header.customer='T'; j.header.address='1 St'; j.juris.preset='epcor-edm'; j.juris.authority='A'; j.juris.utility='U';
  j.service.serviceRating.value=100; j.service.mainBreaker.value=100; j.service.busRating.value=100; j.service.overheadUnderground='Overhead';
  j.areas.unit='sqft'; j.areas.above='2400'; j.types=['service']; return j; }

// H1 basement blank vs filled  (Rule 8-110 c)
{ const a=mk(); const ra=calculate(G.toEngine(a));
  const b=mk(); b.areas.below='1100'; const rb=calculate(G.toEngine(b));
  const p=G.packet(a);
  out.H1={blankAmps:+ra.amps.toFixed(1), filledAmps:+rb.amps.toFixed(1),
    blankAreaM2:+ra.core.area.total.toFixed(1), filledAreaM2:+rb.core.area.total.toFixed(1),
    wattsHidden: rb.totalW-ra.totalW,
    isBasementInPacket: p.missing.concat(p.blockers).filter(m=>/below|basement|grade/i.test(m)),
    holdsWhenBlank:G.holds(a).length}; }

// H1b default ceiling height 2.4 is pre-filled, never measured
{ const j=FC.blankJob('master'); out.H1b={defaultBelowHeight:j.areas.belowHeight, isEvidenceObject:typeof j.areas.above==='object',
   aboveType:typeof j.areas.above, serviceRatingIsEvidence:typeof j.service.serviceRating==='object'};
  const a=mk(); a.areas.below='1100'; a.areas.belowHeight='1.7'; const lo=calculate(G.toEngine(a));
  const b=mk(); b.areas.below='1100'; const hi=calculate(G.toEngine(b));
  out.H1b.ceiling17_amps=+lo.amps.toFixed(1); out.H1b.ceilingDefault24_amps=+hi.amps.toFixed(1); }

// H2 AC condenser as a load card only
{ const base=calculate(G.toEngine(mk())).totalW;
  const a=mk(); a.loads=[{kind:'AC condenser',state:'Existing, staying',makeModel:FC.ev(),voltage:FC.ev(),w:FC.ev(),va:FC.ev(),amps:Object.assign(FC.ev('A'),{value:24}),mca:FC.ev(),mocp:FC.ev(),location:'',notes:''}];
  const e=G.toEngine(a);
  out.H2={baseTotalW:base, withAcCard:calculate(e).totalW, coolWpassed:e.coolW, applianceCount:e.appliances.length, holds:G.holds(a).length}; }

// H3 hot tub double count
{ const a=mk(); a.types=['service','tub']; a.tub.amps.value=40; a.tub.disconnect='x'; a.tub.state='Proposed';
  const one=calculate(G.toEngine(a)).totalW;
  const b=JSON.parse(JSON.stringify(a)); b.tub.amps={...b.tub.amps};
  b.loads=[{kind:'Hot tub or spa',state:'Proposed',makeModel:FC.ev(),voltage:FC.ev(),w:FC.ev(),va:FC.ev(),amps:Object.assign(FC.ev('A'),{value:40}),mca:FC.ev(),mocp:FC.ev(),location:'',notes:''}];
  const eb=G.toEngine(b);
  out.H3={tubScreenOnly:one, tubScreenPlusCard:calculate(eb).totalW, appliances:eb.appliances, warnings:G.holds(b).length}; }

// H5 blank voltage on a 120 V load
{ const c=(v)=>({kind:'Sump, well or pump',state:'Existing, staying',makeModel:FC.ev(),voltage:v===null?FC.ev():Object.assign(FC.ev('V'),{value:v}),w:FC.ev(),va:FC.ev(),amps:Object.assign(FC.ev('A'),{value:12}),mca:FC.ev(),mocp:FC.ev(),location:'',notes:''});
  out.H5={blankVoltage:G.loadWatts(c(null)), stated120:G.loadWatts(c(120))}; }

// H6 MOCP as a load
{ const a=mk(); a.types=['service','tub']; a.tub.mocp.value=50; a.tub.disconnect='x'; a.tub.state='Proposed';
  const b=mk(); b.types=['service','ev']; b.ev.mocp.value=50;
  const c=mk(); c.types=['service','ac']; c.hvac.mocp.value=50; c.hvac.interlock='Can run together';
  out.H6={tub:G.toEngine(a).appliances, ev:G.toEngine(b).evse, acCoolW:G.toEngine(c).coolW,
   realTub40A:40*240, chargedAs:50*240}; }

// H7 second range
{ const R=(w)=>({kind:'Range, cooktop or oven',state:'Existing, staying',makeModel:FC.ev(),voltage:FC.ev(),w:Object.assign(FC.ev('W'),{value:w}),va:FC.ev(),amps:FC.ev(),mca:FC.ev(),mocp:FC.ev(),location:'',notes:''});
  const a=mk(); a.loads=[R(13000),R(6400)]; const e=G.toEngine(a);
  out.H7={rangeWpassed:e.rangeW, appliances:e.appliances, secondRangeSilentlyDropped:e.rangeW===13000&&e.appliances.length===0}; }

// H8 8-106 8) path
{ const e=G.toEngine(mk()); out.H8={measuredPeakW:e.measuredPeakW,newLoadsW:e.newLoadsW,runway:e.runway}; }

// H9 express with no heat input
{ const r=G.express({serviceRating:100,area:2400,unit:'sqft'});
  out.H9={lines:r.lines.map(l=>l.label), amps:+r.amps.toFixed(1), verdict:r.verdict.label,
   realElectricHeat10kW_wouldAdd:10000}; }

// H11 gas furnace blower flips the whole heat calculation mode
{ const F=(amps,v)=>({kind:'Furnace or air handler',state:'Existing, staying',makeModel:FC.ev(),voltage:Object.assign(FC.ev('V'),{value:v}),w:FC.ev(),va:FC.ev(),amps:Object.assign(FC.ev('A'),{value:amps}),mca:FC.ev(),mocp:FC.ev(),location:'',notes:''});
  const a=mk(); a.loads=[F(8,120)]; const e=G.toEngine(a);
  out.H11={heatW:e.heatW, heatMode:e.heatMode, comment:'a gas furnace blower, 960 W, sets heatMode=furnace'}; }

// H12 status on a bare record
{ const s=G.status(mk()); out.H12={key:s.key, blockers:s.packet.blockers, pct:s.packet.pct}; }

// H13 what the full walkdown looks like when it IS complete: does it reach PASS
{ const a=mk(); a.service.panelMakeModel.value='Siemens'; a.service.spacesFree='4'; a.service.meterLocation='S wall'; a.service.panelLocation='Bsmt'; a.service.panelCondition='Good';
  a.header.phone='780'; a.header.leadSource='Flyer'; a.header.request='EV';
  G.photoPackFor(a).forEach(p=>{a.photos[p.k]={state:'Captured',data:'x'};});
  a.loads=[{kind:'Range, cooktop or oven',state:'Existing, staying',makeModel:FC.ev(),voltage:FC.ev(),w:Object.assign(FC.ev('W'),{value:13000}),va:FC.ev(),amps:FC.ev(),mca:FC.ev(),mocp:FC.ev(),location:'',notes:''}];
  const s=G.status(a);
  out.H13={key:s.key, amps:s.calc?+s.calc.amps.toFixed(1):null, missing:s.packet.missing, reasons:s.reasons}; }
console.log(JSON.stringify(out,null,1));
