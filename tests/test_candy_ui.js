'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const master=JSON.parse(fs.readFileSync(path.join(root,'data/master.json'),'utf8'));
const candy=JSON.parse(fs.readFileSync(path.join(root,'data/candy-master.json'),'utf8'));
const start=app.indexOf('  function candyChoice(id){'),end=app.indexOf('  function chips(options,value,action',start);
assert.ok(start>0&&end>start);
let html='',saved=null,dialog='',toastMessage='',updates=0,settingsCount=0;
const state={master:structuredClone(master),candyMaster:candy,candyRatings:{},
  prefs:{candyTier:'all',candySpecial:'all',search:''},selectedCandy:null};
const levels=[{id:'use',label:'優先投入'},{id:'candidate',label:'投入候補'},
  {id:'hold',label:'保留'},{id:'save',label:'温存'}];
const context=vm.createContext({
 state,CANDY_IDS:new Set(levels.map(x=>x.id)),CANDY_LEVELS:levels,
 CANDY_KINDS:{regional:'リージョン',mega:'メガシンカ',gmax:'キョダイマックス'},
 getPokemon:()=>state.master.pokemon,
 normalize:s=>String(s||'').normalize('NFKC').toLowerCase(),
 iconMarkup:p=>'<div class="pokemon-icon"><img alt="" src="/'+p.id+'.png"></div>',
 htmlEscape:s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),
 patchResults:(_,mark)=>{html=mark},chips:()=>'<div></div>',
 $:()=>({set innerHTML(v){dialog=v}}),
 setLocal:(_,payload)=>{saved=payload;return true},
 tabPanels:new Map(),renderResults:()=>updates++,updateRatedCounter:()=>settingsCount++,
 dialogClose:()=>{},toast:m=>toastMessage=m,
 Map,Set,Object,Array,Number,JSON
});
vm.runInContext(app.slice(start,end),context);
const families=vm.runInContext('candyFamilies()',context);
assert.equal(families.length,108);
const bulba=families.find(f=>f.id===1);
assert.ok(bulba.label.includes('フシギダネ'));
assert.ok(vm.runInContext('candyBadge',context)(bulba).includes('メガシンカ'));
const pikachu=families.find(f=>f.id===172);
assert.ok(pikachu.label.includes('ピカチュウ'));
assert.ok(pikachu.memberNames.some(n=>n.includes('ピチュー')));
const render=vm.runInContext('renderCandyResults',context);
render({});
assert.ok(html.includes('フシギダネのアメ'));
assert.equal((html.match(/data-action="candy-detail"/g)||[]).length,108);
const set=vm.runInContext('setCandyChoice',context);
set('172','use');assert.equal(state.candyRatings['172'],'use');
assert.equal(saved['172'],'use');assert.equal(updates,1);assert.equal(settingsCount,1);
state.prefs.candyTier='use';render({});
assert.equal((html.match(/data-action="candy-detail"/g)||[]).length,1);
assert.ok(html.includes('ピカチュウのアメ'));
state.prefs.candyTier='all';state.prefs.candySpecial='mega';render({});
assert.ok(html.includes('フシギダネのアメ'));
assert.ok(!html.includes('メタモンのアメ')||!candy.families.find(f=>f.members.includes(132))?.special.mega.length);
state.prefs.candySpecial='all';state.prefs.search='ピチュー';render({});
assert.ok(html.includes('ピカチュウのアメ'),'match by any family member name');
state.prefs.search='';
state.selectedCandy='172';
vm.runInContext('candyDetails()',context);
assert.ok(dialog.includes('投入優先度')&&dialog.includes('ピチュー'));
state.master.pokemon.push({key:'1100:default',id:1100,name:'未登録ポケモン',form:'',sleep:'不明',islands:[]});
const pending=vm.runInContext('candyFamilies()',context).find(f=>f.key==='pending:1100');
assert.ok(pending?.unknown);
assert.equal(vm.runInContext('candyBadge',context)(pending),'特殊形態：未確認');
console.log('PASS: actual candy page HTML, family search/filters, independent selection, dialog and unknown-species safety');
