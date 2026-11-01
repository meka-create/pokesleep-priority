'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
function section(first,last){
  const a=js.indexOf(first),b=js.indexOf(last,a+first.length);
  assert.ok(a>=0&&b>a,'source section missing: '+first);
  return js.slice(a,b);
}
const master={schema:1,areasReady:true,updatedAt:'2026-11-01',pokemon:[{id:37,key:'37:default',name:'ロコン',islands:[0]}]};
let renders=0,regionChecks=0,saves=0;
const state={master:JSON.parse(JSON.stringify(master))};
const ctx=vm.createContext({state,KEYS:{master:'master'},JSON,Boolean,Map,Date,Intl,
  validMaster:()=>true,setLocal:()=>{saves++;return true},render:()=>{renders++;},
  resolveRegionalSprites:()=>{regionChecks++;},$:()=>({open:false}),settings:()=>{},
  nowJST:()=>'2026-11-01',fromLocal:()=>({})
});
vm.runInContext(section('  const EXCLUDED_MASTER_KEYS=','  const masterSeed=')+
 section('  function mergeMaster(next){','  async function refreshMaster(force=false)'),ctx);
const merge=vm.runInContext('mergeMaster',ctx);
merge({...master,updatedAt:'2026-11-02',pokemon:master.pokemon.map(x=>({...x}))});
assert.equal(renders,0,'unchanged master must not redraw');
assert.equal(regionChecks,0);
assert.equal(saves,1);
merge({...master,updatedAt:'2026-11-03',pokemon:[{...master.pokemon[0],islands:[0,1]}]});
assert.equal(renders,1,'new island mapping must redraw');
assert.equal(regionChecks,1);
merge({...master,updatedAt:'2026-11-02',pokemon:[{...master.pokemon[0],islands:[0,2]}]});
assert.equal(renders,1,'older master must not roll back confirmed islands');
assert.deepEqual(Array.from(state.master.pokemon[0].islands),[0,1]);
merge({...master,updatedAt:'2026-11-04',pokemon:[{...master.pokemon[0],islands:[]}]});
assert.deepEqual(Array.from(state.master.pokemon[0].islands),[0,1],
  'missing island record must preserve previously confirmed assignment');

assert.match(vm.runInContext('masterCheckSlot()',ctx),/^2026-11-01-(pre|post)$/);
assert.equal(vm.runInContext('shouldCheckMaster(true)',ctx),true);
let savedCheck={slot:vm.runInContext('masterCheckSlot()',ctx),time:Date.now()-60*60*1000,ok:true};
ctx.fromLocal=()=>savedCheck;
assert.equal(vm.runInContext('shouldCheckMaster(false)',ctx),false,
  'recent successful master check should be reused');
savedCheck.time=Date.now()-7*60*60*1000;
assert.equal(vm.runInContext('shouldCheckMaster(false)',ctx),true,
  'scheduled update delayed beyond the first check must be retried after six hours');
savedCheck={slot:vm.runInContext('masterCheckSlot()',ctx),time:Date.now()-31*60*1000,ok:false};
assert.equal(vm.runInContext('shouldCheckMaster(false)',ctx),true,
  'failed master checks must retry after 30 minutes');
const iconLoader=section('  async function loadIcons(){','  async function setIcon(key,value)');
assert.ok(iconLoader.includes('openCursor()'));
assert.ok(!iconLoader.includes('getAllKeys()'));
assert.ok(!iconLoader.includes('render()'));
const start=section('  async function start(){',"  if('serviceWorker'in navigator");
assert.match(start,/await loadIcons\(\);\s*await warmStartupSprites\(\);\s*render\(\);/);
assert.ok(!js.includes('render();loadIcons();refreshMaster(false)'));
assert.ok(js.includes('const retainedCards=new Map()'));
assert.ok(js.includes('fresh.replaceWith(previous)'));
assert.ok(js.includes('newIcon.replaceWith(icon)'));
assert.ok(js.includes('if(resultMarkup.get(el)===markup)return'));
assert.ok(js.includes("if(results&&freshResults)freshResults.replaceWith(results)"));
assert.match(css,/content-visibility:auto/);
assert.match(js,/searchRenderTimer=setTimeout\(\(\)=>\{searchRenderTimer=null;renderResults\(\)\},120\)/);
console.log('PASS: one startup rendering, single IndexedDB transaction, no unchanged-master redraw, idle search debounce, offscreen panels');
