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
  prefs:{candyTier:'all',candySpecial:'all',candyKind:'all',search:''},selectedCandy:null};
const levels=[{id:'use',symbol:'◎',label:'優先投入'},{id:'candidate',symbol:'○',label:'投入候補'},
  {id:'hold',symbol:'△',label:'保留'},{id:'save',symbol:'×',label:'温存'}];
const context=vm.createContext({
 state,KEYS:{candy:'candy'},CANDY_IDS:new Set(levels.map(x=>x.id)),CANDY_LEVELS:levels,
 CANDY_KINDS:{regional:'リージョン',mega:'メガシンカ',gmax:'キョダイマックス'},
 getPokemon:()=>state.master.pokemon,
 normalize:s=>String(s||'').normalize('NFKC').toLowerCase(),
 iconMarkup:p=>'<div class="pokemon-icon"><img alt="" src="/'+p.id+'.png"></div>',
 htmlEscape:s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),
 patchResults:(_,mark)=>{html=mark},chips:(items,value,action)=>'<div>'+items.map(x=>'<button data-action="'+action+'">'+x.text+'</button>').join('')+'</div>',
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
const mew=families.find(f=>f.id===151);
assert.ok(vm.runInContext('candyBadge',context)(mew).includes('伝説・幻'));
const mankey=families.find(f=>f.id===56);
assert.ok(vm.runInContext('candyBadge',context)(mankey).includes('追加進化待ち'));
for(const id of [52,83,122,215]){
 const regionalOnly=families.find(f=>f.members.includes(id));
 assert.ok(!regionalOnly.special.evolution.length,'regional evolution misclassified: '+id);
}
const pikachu=families.find(f=>f.id===172);
assert.ok(pikachu.label.includes('ピカチュウ'));
assert.ok(pikachu.memberNames.some(n=>n.includes('ピチュー')));
const render=vm.runInContext('renderCandyResults',context);
render({});
assert.ok(html.includes('フシギダネのアメ'));
assert.equal((html.match(/data-action="candy-detail"/g)||[]).length,108);
assert.equal((html.match(/data-action="candy-quick-rate"/g)||[]).length,108*4);
assert.ok(html.includes('<article class="candy-item"'),"Candy cards need independent profile and grading buttons");
assert.ok(!html.includes('class="candy-status"'),"Old grade badge should disappear");
assert.ok(html.includes('aria-label="フシギダネのアメ：◎（優先投入）に設定"'));
assert.ok(html.includes('title="投入候補"'));
const set=vm.runInContext('setCandyChoice',context);
set('172','use');assert.equal(state.candyRatings['172'],'use');
assert.equal(saved['172'],'use');assert.equal(updates,1);assert.equal(settingsCount,1);
const quick=vm.runInContext('quickCandyRate',context);
quick({dataset:{familyId:'172',tier:'use'}});
assert.equal(state.candyRatings['172'],undefined,"Tapping the same symbol must clear the grade");
assert.equal(updates,2);assert.equal(settingsCount,2);
quick({dataset:{familyId:'172',tier:'use'}});
assert.equal(state.candyRatings['172'],'use',"One tap should restore grade");
assert.equal(updates,3);
state.prefs.candyTier='use';render({});
assert.equal((html.match(/data-action="candy-detail"/g)||[]).length,1);
assert.ok(html.includes('ピカチュウのアメ'));
state.prefs.candyTier='all';state.prefs.candySpecial='any';state.prefs.candyKind='mega';render({});
assert.ok(html.includes('フシギダネのアメ'));
assert.ok(!html.includes('メタモンのアメ')||!candy.families.find(f=>f.members.includes(132))?.special.mega.length);
state.prefs.candyKind='all';render({});
assert.ok(html.includes('ロコンのアメ'),"Any-special mode must include regional forms too");
state.prefs.candySpecial='none';render({});
assert.ok(!html.includes('フシギダネのアメ'),"No-special mode must exclude Mega/Gmax Pokémon");
const currentShell=vm.runInContext('candyShell',context);
assert.ok(currentShell().includes('data-action="candy-special-filter"'));
assert.ok(!currentShell().includes('data-action="candy-kind-filter"'),"Special-kind filter must hide outside 'あり'");
state.prefs.candySpecial='any';
assert.ok(currentShell().includes('data-action="candy-kind-filter"'),"Special-kind filter must show only for 'あり'");
assert.ok(currentShell().includes('placeholder="検索"'));
assert.ok(currentShell().includes('class="candy-tier-name">優先投入</span>'));
assert.ok(currentShell().includes('class="candy-tier-symbol">◎</span>'));
assert.ok(!currentShell().includes('candy-tier-legend'),"No detached legend: grade meaning must be inside the button");
assert.ok(currentShell().includes('特殊要素'));
assert.ok(!currentShell().includes('特殊形態の種類'));
assert.ok(currentShell().includes('伝説・幻'));
assert.ok(currentShell().includes('追加進化待ち'));
state.prefs.candySpecial='all';state.prefs.search='ピチュー';render({});
assert.ok(html.includes('ピカチュウのアメ'),'match by any family member name');
state.prefs.search='';
state.selectedCandy='172';
vm.runInContext('candyDetails()',context);
assert.ok(dialog.includes('投入優先度')&&dialog.includes('ピチュー'));
state.master.pokemon.push({key:'1100:default',id:1100,name:'未登録ポケモン',form:'',sleep:'不明',islands:[]});
const pending=vm.runInContext('candyFamilies()',context).find(f=>f.key==='pending:1100');
assert.ok(pending?.unknown);
assert.equal(vm.runInContext('candyBadge',context)(pending),'特殊要素：未確認');
const prefsStart=app.indexOf('  const prefs={...DEFAULT_PREFS,...fromLocal(KEYS.prefs,{})};');
const prefsEnd=app.indexOf('  const state={master,',prefsStart);
assert.ok(prefsStart>0&&prefsEnd>prefsStart);
function migrated(saved){
 const isolated=vm.createContext({
   DEFAULT_PREFS:{tab:'candy',area:0,onlyRated:true,searchGrades:null,
     candySpecial:'all',candyKind:'all',candyTier:'all'},
   KEYS:{prefs:'prefs'},fromLocal:()=>saved,CANDY_LEVELS:levels,
   CANDY_KINDS:{regional:'リージョン',mega:'メガシンカ',gmax:'キョダイマックス',legendary:'伝説・幻',evolution:'追加進化待ち'},
   SEARCH_GRADE_IDS:['star','double','circle','triangle','cross','none'],Set,Object,Array,Number
 });
 vm.runInContext(app.slice(prefsStart,prefsEnd),isolated);
 return vm.runInContext('prefs',isolated);
}
assert.equal(migrated({candySpecial:'mega'}).candySpecial,'any');
assert.equal(migrated({candySpecial:'mega'}).candyKind,'mega');
assert.equal(migrated({candySpecial:'regional'}).candyKind,'regional');
assert.equal(migrated({candySpecial:'none'}).candySpecial,'none');
assert.equal(migrated({candySpecial:'any',candyKind:'gmax'}).candyKind,'gmax');
assert.equal(migrated({candySpecial:'invalid'}).candySpecial,'all');
console.log('PASS: 108 inline candy priorities, integrated symbol labels, 9 legendary/mythical and Mankey-only category, staged filters');
