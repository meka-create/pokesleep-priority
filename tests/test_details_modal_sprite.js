'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
assert.ok(!app.includes('評価をタップしてすぐに記録'));
assert.ok(!app.includes('島ごと・優先度ごとに厳選対象を確認'));
assert.match(app,/if\(action==='pokemon'\)\{state.selected=b.dataset.key;details\(\);dialogOpen\('#details'\);activateDetailSprite\(\)\}/);
const a=app.indexOf('  function activateDetailSprite(){'),b=app.indexOf('  function selected(){',a);
const c=app.indexOf('  function details(){',b),d=app.indexOf('  function settings(){',c);
assert.ok(a>=0&&b>a&&c>b&&d>c);
const url='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10103.png';
const img={dataset:{spriteSrc:url},isConnected:true};
const body={innerHTML:'',querySelector(sel){assert.equal(sel,'img[data-sprite-src]');return this.innerHTML.includes('data-sprite-src=')?img:null;}};
const dialog={open:false,showModal(){this.open=true},close(){this.open=false}};
const $=sel=>sel==='#details-body'?body:sel==='#details'?dialog:sel==='#details-body img[data-sprite-src]'?body.querySelector('img[data-sprite-src]'):null;
let loads=0,unobserves=0,custom=false;
const pokemon={id:37,key:'37:Alola',name:'ロコン（アローラ）',sleep:'すやすや',islands:[1]};
const context=vm.createContext({
  $,spriteObserver:{unobserve(x){assert.equal(x,img);unobserves++}},
  enqueueSprite(x){assert.equal(dialog.open,true);assert.equal(x,img);loads++},
  selected:()=>pokemon,grade:()=> 'none',islandList:p=>p.islands,
  state:{icons:new Map(),overrides:{}},LEVELS:[],AREAS:['ワカクサ本島','シアンの砂浜'],ICONS:['🌱','🏝️'],
  htmlEscape:String,iconMarkup:()=>custom?'<img src="data:image/png;base64,iVBORw0KGgo=">':'<img data-sprite-src="'+url+'">',
  Object,String,Array,Boolean
});
vm.runInContext(app.slice(a,b)+app.slice(c,d),context);
const details=vm.runInContext('details',context),activate=vm.runInContext('activateDetailSprite',context);
details();assert.equal(loads,0,'closed dialog should not fetch images');
dialog.showModal();activate();assert.equal(loads,1);assert.equal(unobserves,1);
details();assert.equal(loads,2,'re-rendered open modal should reload from cache');
custom=true;details();assert.equal(loads,2,'manual image must avoid PokéAPI request');
console.log('PASS: cached standard icons load when modal opens/updates, manual override bypasses network, subtitles removed');
