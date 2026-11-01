'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('  const last=fromLocal(KEYS.master,null);');
const end=app.indexOf('  const prefs=',start);
assert.ok(start>=0&&end>start);
function boot(cached,bundled){
 const ctx=vm.createContext({masterSeed:bundled,KEYS:{master:'master'},
   fromLocal:()=>cached,Date,Set,Map,
   validMaster:o=>!!o&&Array.isArray(o.pokemon)&&o.pokemon.length>0
 });
 vm.runInContext(app.slice(start,end),ctx);
 return vm.runInContext('master',ctx);
}
const base={schema:1,areasReady:true,updatedAt:'2026-11-01T09:50:00Z',
 pokemon:[{key:'25:Halloween',id:25,name:'ピカチュウ (ハロウィン)',islands:[0,7]},
          {key:'133:Halloween2',id:133,name:'イーブイ (ハロウィン)',islands:[0,7]}]};
const bundle={schema:1,areasReady:true,updatedAt:'2026-11-01T11:59:00Z',
 pokemon:[{key:'25:Halloween',id:25,name:'ピカチュウ (ハロウィン)',islands:[0,7]},
          {key:'133:Halloween2',id:133,name:'イーブイ (ハロウィン・紫)',islands:[0,7]}]};
let result=boot(base,bundle);
assert.ok(result.pokemon.find(x=>x.key==='133:Halloween2').name.includes('紫'));
const cachePlus={...base,updatedAt:'2026-11-01T11:59:00Z',
 pokemon:[...base.pokemon,{key:'999:default',id:999,name:'新ポケ',islands:[4]}]};
result=boot(cachePlus,bundle);
assert.equal(result.pokemon.find(x=>x.key==='133:Halloween2').name,'イーブイ (ハロウィン・紫)',
 'same-date corrected bundle must replace ambiguous old label');
assert.deepEqual(Array.from(result.pokemon.find(x=>x.key==='999:default').islands),[4],
 'locally discovered Pokémon should not disappear');
const newerCached={...cachePlus,updatedAt:'2026-12-01T11:59:00Z',
 pokemon:cachePlus.pokemon.map(p=>({...p,name:p.key==='133:Halloween2'?'より新しい名前':p.name}))};
result=boot(newerCached,bundle);
assert.equal(result.pokemon.find(x=>x.key==='133:Halloween2').name,'より新しい名前',
 'an older bundled master must not downgrade newer cached master');
const confirmed={...cachePlus,pokemon:cachePlus.pokemon.map(p=>
 p.key==='25:Halloween'?{...p,islands:[0,3,7]}:p)};
result=boot(confirmed,bundle);
assert.deepEqual(Array.from(result.pokemon.find(x=>x.key==='25:Halloween').islands),[0,7],
 'authoritative updated nonempty field list should be accepted');
const missingBundle={...bundle,pokemon:bundle.pokemon.map(p=>
 p.key==='25:Halloween'?{...p,islands:[]}:p)};
result=boot(confirmed,missingBundle);
assert.deepEqual(Array.from(result.pokemon.find(x=>x.key==='25:Halloween').islands),[0,3,7],
 'partial bundled island data must not erase validated local islands');
console.log('PASS: old cached master upgrades on first launch, newer local survives, additional species and confirmed islands preserved');
