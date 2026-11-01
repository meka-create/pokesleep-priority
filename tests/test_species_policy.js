'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
const master=JSON.parse(fs.readFileSync(path.join(ROOT,'data/master.json'),'utf8'));
const seeded=fs.readFileSync(path.join(ROOT,'data/seed-data.js'),'utf8');
const EXCLUDED=['25:Low Key','25:Halloween2','133:Halloween2',
 '710:Small','710:Large','710:Jumbo','711:Small','711:Large','711:Jumbo'];
assert.equal(master.pokemon.length,245);
assert.equal(new Set(master.pokemon.map(p=>p.key)).size,245);
assert.ok(EXCLUDED.every(k=>!master.pokemon.some(p=>p.key===k)));
assert.ok(seeded.startsWith('window.__SEED_MASTER__='));
assert.deepEqual(JSON.parse(seeded.slice('window.__SEED_MASTER__='.length).trim().replace(/;$/,'')),master);
for(const [key,name] of [['710:Medium','バケッチャ'],['711:Medium','パンプジン']]){
 assert.equal(master.pokemon.find(p=>p.key===key).name,name);
}
const a=app.indexOf('  const EXCLUDED_MASTER_KEYS=');
const b=app.indexOf('  const masterSeed=',a);
assert.ok(a>=0&&b>a);
const ctx=vm.createContext({Map,Set});
vm.runInContext(app.slice(a,b),ctx);
const normalize=vm.runInContext('canonicalizePokemon',ctx);
const originals=[...master.pokemon,...EXCLUDED.map(key=>({
 key,id:Number(key.split(':')[0]),name:'obsolete',form:key.split(':')[1],islands:[0]
}))];
const result=normalize(originals);
assert.equal(result.length,245,'older 254-item local master must shrink to 245');
assert.ok(EXCLUDED.every(k=>!result.find(p=>p.key===k)));
const mergeTest=app.slice(app.indexOf('  function mergeMaster(next){'),
 app.indexOf('  async function refreshMaster(force=false)'));
const state={master:structuredClone(master)};
const context=vm.createContext({Map,Set,Date,Intl,JSON,Boolean,state,
 KEYs:{},KEYS:{master:'master'},validMaster:()=>true,
 setLocal:()=>true,render:()=>{},resolveRegionalSprites:()=>{},
 $:()=>({open:false}),settings:()=>{},nowJST:()=>'2026-11-01',fromLocal:()=>({})});
vm.runInContext(app.slice(a,b)+mergeTest,context);
const merge=vm.runInContext('mergeMaster',context);
const stale={...master,updatedAt:'2026-12-01T00:00:00+00:00',pokemon:originals};
merge(stale);
assert.equal(state.master.pokemon.length,245,'upstream 254 records must not reappear');
const raw=app.slice(app.indexOf('  async function refreshMaster(force=false)'),app.indexOf("  document.addEventListener('click'"));
assert.match(raw,/EXCLUDED_MASTER_KEYS\.has\(key\)\|\|known\.has\(key\)/,'direct client species fetch must reject obsolete form keys');
console.log('PASS: canonical 245 species offline, cached, fetched and upstream; no 254 regression');
