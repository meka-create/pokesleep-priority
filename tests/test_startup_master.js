'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const p0=app.indexOf('  const EXCLUDED_MASTER_KEYS='),p1=app.indexOf('  const masterSeed=',p0);
const start=app.indexOf('  const last=fromLocal(KEYS.master,null);');
const end=app.indexOf('  const prefs=',start);
assert.ok(p0>=0&&p1>p0&&start>=0&&end>start);
function boot(cached,bundled){
 const ctx=vm.createContext({masterSeed:bundled,KEYS:{master:'master'},
   fromLocal:()=>cached,Date,Set,Map,
   validMaster:o=>!!o&&Array.isArray(o.pokemon)&&o.pokemon.length>0
 });
 vm.runInContext(app.slice(p0,p1)+app.slice(start,end),ctx);
 return vm.runInContext('master',ctx);
}
const a={key:'25:Halloween',id:25,name:'ピカチュウ (ハロウィン)',islands:[0,7]};
const obsolete={key:'25:Halloween2',id:25,name:'ピカチュウ (ハロウィン・紫)',islands:[0,7]};
const size={key:'710:Medium',id:710,name:'バケッチャ (ちゅうだましゅ)',islands:[0,7]};
const obsoleteSize={key:'710:Jumbo',id:710,name:'バケッチャ (ギガだましゅ)',islands:[0,7]};
const base={schema:1,areasReady:true,updatedAt:'2026-11-01T09:50:00Z',
 pokemon:[a,obsolete,size,obsoleteSize]};
const bundle={schema:1,areasReady:true,updatedAt:'2026-11-01T11:59:00Z',pokemon:[a,size]};
let result=boot(base,bundle);
assert.equal(result.pokemon.length,2,'old entries must disappear even if cached');
assert.equal(result.pokemon.find(x=>x.key==='710:Medium').name,'バケッチャ');
const cachePlus={...base,updatedAt:'2026-11-01T11:59:00Z',
 pokemon:[...base.pokemon,{key:'999:default',id:999,name:'新ポケ',islands:[4]}]};
result=boot(cachePlus,bundle);
assert.equal(result.pokemon.length,3);
assert.deepEqual(Array.from(result.pokemon.find(x=>x.key==='999:default').islands),[4]);
const newerCached={...cachePlus,updatedAt:'2026-12-01T11:59:00Z'};
result=boot(newerCached,bundle);
assert.equal(result.pokemon.length,3,'newer cached data cannot resurrect retired forms');
const confirmed={...cachePlus,pokemon:cachePlus.pokemon.map(p=>
 p.key==='25:Halloween'?{...p,islands:[0,3,7]}:p)};
const missingBundle={...bundle,pokemon:bundle.pokemon.map(p=>
 p.key==='25:Halloween'?{...p,islands:[]}:p)};
result=boot(confirmed,missingBundle);
assert.deepEqual(Array.from(result.pokemon.find(x=>x.key==='25:Halloween').islands),[0,3,7]);
console.log('PASS: 245 species taxonomy survives old cached master, newer cache, offline seed, and known new species');
