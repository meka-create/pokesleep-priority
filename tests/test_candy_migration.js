'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function extract(start,end){
  const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing expected migration code: '+start);
  return app.slice(a,b);
}
const helper=extract('  function resolvePendingCandyRatings(choices,families){','  const candyPrefs=');
const merge=extract('  function mergeCandyMaster(incoming){','  async function refreshMaster(');
const family={id:546,labelId:546,members:[546,547],type:'fairy',special:{
  regional:[],mega:[],gmax:[],legendary:[],evolution:[]}};
const levels=new Set(['use','candidate','hold','save']);
const current={schema:3,updatedAt:'2026-11-16',families:[family]};
function setup(saved,failWrite=false){
  const saves=[],state={candyMaster:structuredClone(current),
    candyRatings:{...saved},prefs:{tab:'candy'}};
  const context=vm.createContext({state,Map,Object,JSON,Number,RegExp,
    CANDY_IDS:levels,
    validCandyMaster:()=>true,
    setLocal:(key,value)=>{saves.push([key,structuredClone(value)]);return !failWrite},
    KEYS:{candy:'candy',candyMaster:'candyMaster'},
    render:()=>{state.redraws=(state.redraws||0)+1;}});
  vm.runInContext(helper+merge,context);
  return {state,saves,migrate:vm.runInContext('resolvePendingCandyRatings',context),
    merge:vm.runInContext('mergeCandyMaster',context)};
}
const first=setup({'pending:546':'use','pending:547':'candidate','172':'hold','pending:999':'save'});
const resolved=first.migrate(first.state.candyRatings,current.families);
assert.equal(resolved['546'],'use','Prefer initial family member rating if two provisional entries exist');
assert.equal(resolved['pending:546'],undefined);
assert.equal(resolved['pending:547'],undefined);
assert.equal(resolved['172'],'hold','Keep unrelated family priorities');
assert.equal(resolved['pending:999'],'save','Do not erase an unverified future species rating');
assert.equal(first.merge(current),true,'Same already-bundled candy snapshot still migrates');
assert.equal(first.state.candyRatings['546'],'use');
assert.equal(first.state.candyRatings['pending:546'],undefined);
assert.equal(first.saves.length,1);
assert.equal(first.saves[0][0],'candy','Only save the migrated rating, not unchanged master');
assert.equal(first.state.redraws,1);
const second=setup({'546':'save','pending:547':'use'});
assert.equal(second.merge(current),true);
assert.equal(second.state.candyRatings['546'],'save','Existing verified family grade wins');
assert.equal(second.state.candyRatings['pending:547'],undefined);
const failed=setup({'pending:547':'use'},true);
assert.equal(failed.merge(current),false);
assert.equal(failed.state.candyRatings['pending:547'],'use','Failed storage must preserve provisional grade');
assert.equal(failed.state.redraws,undefined);
assert.ok(app.includes('const initialCandyChoices=resolvePendingCandyRatings(state.candyRatings,state.candyMaster?.families);'),
  'Migrate offline at startup when the newly bundled snapshot is already current');
console.log('PASS: provisional ratings migrate to the verified Cottonee family on startup/refresh, with rollback safety');
