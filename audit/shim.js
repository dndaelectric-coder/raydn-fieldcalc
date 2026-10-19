const fs=require('fs'); const path=require('path');
// The app is the folder above audit/, unless FC_APP points at another copy.
const P=(process.env.FC_APP ? path.resolve(process.env.FC_APP) : path.join(__dirname,'..'))+path.sep;
global.window=global;
global.navigator={userAgent:'node'};
global.document={createElement:()=>({style:{},appendChild(){},setAttribute(){}}),addEventListener(){},getElementById:()=>null,body:{appendChild(){}}};
const eng=require(P+'engine.js'); global.calculate=eng.calculate;
function load(f){ new Function('window','document','navigator',fs.readFileSync(P+f,'utf8'))(global,global.document,global.navigator); }
load('fc-store.js'); load('fc-gates.js');
module.exports={FC:global.FC,G:global.FCGates,calculate:global.calculate,eng,P};
