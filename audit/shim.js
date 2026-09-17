const fs=require('fs'); const P='/home/user/workspace/loadcalc/';
global.window=global;
global.navigator={userAgent:'node'};
global.document={createElement:()=>({style:{},appendChild(){},setAttribute(){}}),addEventListener(){},getElementById:()=>null,body:{appendChild(){}}};
const eng=require(P+'engine.js'); global.calculate=eng.calculate;
function load(f){ new Function('window','document','navigator',fs.readFileSync(P+f,'utf8'))(global,global.document,global.navigator); }
load('fc-store.js'); load('fc-gates.js');
module.exports={FC:global.FC,G:global.FCGates,calculate:global.calculate,eng};
