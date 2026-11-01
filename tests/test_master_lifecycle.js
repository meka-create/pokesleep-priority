'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function part(a,b){let x=app.indexOf(a),y=app.indexOf(b,x+1);assert.ok(x>=0&&y>x);return app.slice(x,y)}
const js=part('  const EXCLUDED_MASTER_KEYS=','  const masterSeed=')
 +part('  function mergeMaster(next){','  const MASTER_CHECK_KEY=');
let renders=0;
const original={schema:1,updatedAt:'2026-11-01',areasReady:true,
 pokemon:[{id:710,key:'710:Medium',name:'バケッチャ',islands:[0]}]};
const state={master:structuredClone(original)};
const context=vm.createContext({state,Set,Map,JSON,Date,Boolean,
 KEYS:{master:'master'},validMaster:()=>true,setLocal:()=>false,
 render:()=>renders++,resolveRegionalSprites:()=>{},$:()=>({open:false}),settings:()=>{}});
vm.runInContext(js,context);
const merge=vm.runInContext('mergeMaster',context);
let newer={...original,updatedAt:'2026-11-02',pokemon:[
 {...original.pokemon[0],islands:[0,7]},
 {id:999,key:'999:default',name:'新ポケ',islands:[]}]};
assert.equal(merge(newer),0);
assert.equal(state.master.pokemon.length,1);
assert.deepEqual(state.master.pokemon[0].islands,[0]);
assert.equal(renders,0);
context.setLocal=()=>true;
assert.equal(merge(newer),1);
assert.equal(state.master.pokemon.length,2);
assert.equal(renders,1);
assert.match(app,/if\(!setLocal\(KEYS\.overrides,state\.overrides\)\)\{\s*if\(hadOverride\)state\.overrides\[key\]=previous;/);
assert.match(app,/if\(setLocal\(KEYS\.master,state\.master\)\)\{render\(\);resolveRegionalSprites\(\)\}/);
console.log('PASS: failed persistent master/island writes roll back; successful writes update display');
