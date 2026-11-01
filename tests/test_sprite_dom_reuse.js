'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('  const retainedCards=new Map()');
const end=app.indexOf('  function renderResults(){',start);
assert.ok(start>=0&&end>start,'keyed DOM reconciliation must be available');
const source=app.slice(start,end);
const context=vm.createContext({Map,WeakMap,document:{}});
vm.runInContext(source,context);
const key=vm.runInContext('retainedCardKey',context);
const signature=vm.runInContext('iconSignature',context);
const cache=vm.runInContext('retainedCards',context);
const retain=vm.runInContext('retainCard',context);
function card(kind,id,island,grade,src){
  const image=src?{dataset:src.startsWith('https:')?{spriteSrc:src}:{},
    getAttribute:()=>src}:null;
  return {dataset:{key:id,grade},
    classList:{contains:value=>value===kind},
    closest:selector=>selector==='.island-panel'&&island!==null?{dataset:{areaPanel:String(island)}}:null,
    querySelector:selector=>selector==='.pokemon-icon img'?image:null};
}
const p='37:Alola',url='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10103.png';
const dex=card('mon-card',p,null,'star',url);
const search0=card('mini-mon',p,0,'star',url);
const search7=card('mini-mon',p,7,'star',url);
assert.equal(key(dex),'dex:'+p);
assert.equal(key(search0),'search:0:'+p);
assert.equal(key(search7),'search:7:'+p);
assert.notEqual(key(search0),key(search7),'same species on two fields must not share one DOM node');
assert.equal(signature(dex),url);
const manual=card('mon-card',p,null,'star','data:image/png;base64,AAAA');
assert.notEqual(signature(manual),signature(dex),'custom artwork change invalidates reuse');
retain(key(dex),dex);
retain(key(search0),search0);
retain(key(search7),search7);
assert.equal(cache.size,3);
assert.equal(cache.get(key(search7)).card,search7);
assert.equal(cache.get(key(dex)).source,url);
assert.match(source,/fresh\.replaceWith\(previous\)/);
assert.match(source,/newIcon\.replaceWith\(icon\)/);
assert.match(source,/islandPanelMarkup\.get\(original\)===signature/);
assert.match(source,/el\.replaceChildren\(template\.content\)/);
assert.match(app,/await warmStartupSprites\(\);\s*render\(\);/);
assert.match(app,/if\(results&&freshResults\)freshResults\.replaceWith\(results\)/);
console.log('PASS: per-island keys, stable icon source and custom invalidation, bounded reusable DOM, warmed reload');
