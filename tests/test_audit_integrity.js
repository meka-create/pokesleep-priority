'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const real=JSON.parse(fs.readFileSync(path.join(root,'data/master.json'),'utf8'));
const areas=real.areas;
const validation=app.slice(app.indexOf('  function validMaster(x){'),app.indexOf('  const last=fromLocal('));
assert.ok(validation.includes('const keys=new Set()'));
const source=vm.createContext({AREAS:areas,Number,Set,Array,Date});
vm.runInContext(validation,source);
const valid=vm.runInContext('validMaster',source);
assert.equal(valid(real),true,'deployed 9-island master must remain compatible');
const corrupt=(mutate)=>{const copy=structuredClone(real);mutate(copy);assert.equal(valid(copy),false,'corrupted master must be rejected');};
corrupt(x=>{x.pokemon.push(structuredClone(x.pokemon[0]));}); // Duplicate stable key
corrupt(x=>{x.pokemon[0].id=9999;}); // ID vs key disagreement
corrupt(x=>{x.pokemon[0].islands=[9];}); // Out-of-range field
corrupt(x=>{x.pokemon[0].islands=[1,1];}); // Duplicate island
corrupt(x=>{x.pokemon[0].sleep='不正';});
corrupt(x=>{x.areas[0]='別の島';});
corrupt(x=>{x.updatedAt='not-a-date';});
const fragment=app.slice(app.indexOf('  async function restore(file){'),app.indexOf('  async function fetchJSON(url)'));
assert.ok(fragment.includes('バックアップ項目が欠けているか不正です'));
let confirms=0,writes=0,iconWrites=0,closed=0,message='';
const state={ratings:{'25:default':'star'},overrides:{'25:default':[0]},icons:new Map()};
const restoreContext=vm.createContext({state,AREAS:areas,KEYS:{ratings:'ratings',overrides:'overrides'},
 GRADE_IDS:new Set(['star','double','circle','triangle','cross']),Map,Number,Object,Array,JSON,
 confirm:()=>{confirms++;return true},setLocal:()=>{writes++;return true},
 replaceIconsAtomically:async()=>{iconWrites++},toast:t=>message=t,
 sanitizedRatings:x=>x,sanitizedOverrides:x=>x,dialogClose:()=>closed++,render:()=>{}});
vm.runInContext(fragment,restoreContext);
const restore=vm.runInContext('restore',restoreContext);
const validFile={app:'pokesleep-priority',version:1,ratings:{'25:default':'double'},
 overrides:{'25:default':[0,1]},icons:{'25:default':'data:image/png;base64,AAAA'}};
const file=obj=>({size:1024,text:async()=>JSON.stringify(obj)});
(async()=>{
 for(const x of [
   {...validFile,ratings:undefined},
   {...validFile,icons:undefined},
   {...validFile,icons:['bad']},
   {...validFile,icons:{'25:default':'invalid-icon'}},
   {...validFile,ratings:{'25:default':'invalid-rating'}},
   {...validFile,overrides:{'25:default':[10]}}
 ]){
   await restore(file(x));
   assert.match(message,/復元失敗/);
   assert.equal(confirms,0,'malformed file must not show confirmation dialog');
   assert.equal(writes,0,'malformed backup must not touch existing settings');
   assert.equal(iconWrites,0);
   assert.equal(state.ratings['25:default'],'star');
 }
 await restore(file(validFile));
 assert.equal(confirms,1,'valid backup must preserve existing restore UX');
 assert.equal(iconWrites,1);
 assert.equal(state.ratings['25:default'],'double');
 assert.equal(state.icons.get('25:default'),validFile.icons['25:default']);
 assert.equal(closed,1);
 console.log('PASS: strict master integrity and lossless backup restore guard');
})().catch(e=>{console.error(e);process.exitCode=1});
