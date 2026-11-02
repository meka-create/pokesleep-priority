'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const style=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const master=JSON.parse(fs.readFileSync(path.join(root,'data/candy-master.json'),'utf8'));
const types=['normal','fire','water','electric','grass','ice','fighting','poison',
 'ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
assert.equal(master.families.length,108);
assert.equal(new Set(master.families.map(x=>x.type)).size,18);
assert.ok(html.includes('id="candy-type-listbox"'));
assert.ok(html.includes('role="listbox"')&&html.includes('hidden></div>'));
assert.ok(style.includes('.candy-type-listbox[hidden]{display:none!important}'));
assert.ok(style.includes('scrollbar-width:none'));
assert.ok(style.includes('.candy-type-listbox::-webkit-scrollbar{display:none}'));
assert.ok(style.includes('.candy-type-tag,.candy-type-pill{--candy-accent:'),
 'Cards and popup options share the exact same pill base rules');
assert.ok(style.includes('.candy-type-pill[data-type="all"]{background:#273b50;border-color:#8399a9;color:#eef4ff}'),
 'All must use the exact active priority All palette');
assert.ok(style.includes('.candy-tier-choice.active{background:#273b50;border-color:#8399a9;color:#eef4ff}'),
 'Priority All palette must remain unchanged');
assert.ok(style.includes('.candy-type-pill[data-type="normal"]{--candy-accent:#d0d7df}'),
 'Normal must remain light grey and visually distinct from navy All');
assert.ok(!style.includes('.candy-type-dot{'),'Do not keep redundant swatch styling');
assert.ok(!app.includes('data-action="candy-type-filter"'), 'No native type selection');
for(const type of types){
 assert.ok(style.includes('.candy-type-tag[data-type="'+type+'"],.candy-type-pill[data-type="'+type+'"]'),
   'Picker label must share its exact palette with the card badge: '+type);
}
const start=app.indexOf('  let candyTypePickerTrigger=null;');
const end=app.indexOf('  function candyShell(){',start);
assert.ok(start>0&&end>start);
let selectedFocused=0,returnedFocus=0,saved=0,rendered=0;
const docListeners=new Map(),windowListeners=new Map(),menuListeners=new Map();
const rect={left:155,right:335,top:285,bottom:327,width:180};
const trigger={
 isConnected:true,attributes:{},
 getBoundingClientRect:()=>rect,
 setAttribute(k,v){this.attributes[k]=v},
 focus(){returnedFocus++},
 contains:()=>false
};
const selectedEl={focus(){selectedFocused++},scrollIntoView(){}};
const menu={
 hidden:true,style:{},innerHTML:'',scrollTop:0,items:[],
 replaceChildren(){this.innerHTML='';this.items=[]},
 getBoundingClientRect(){return {height:890}},
 querySelector(){return selectedEl},
 querySelectorAll(){return this.items},
 contains:()=>false,
 addEventListener(name,fn){menuListeners.set(name,fn)}
};
const document={documentElement:{clientWidth:390},activeElement:null,
 addEventListener(name,fn){docListeners.set(name,fn)}};
const window={innerHeight:720,addEventListener(name,fn){windowListeners.set(name,fn)}};
const state={prefs:{candyType:'all'}};
const CANDY_TYPES={normal:'ノーマル',fire:'ほのお',water:'みず',electric:'でんき',
 grass:'くさ',ice:'こおり',fighting:'かくとう',poison:'どく',ground:'じめん',
 flying:'ひこう',psychic:'エスパー',bug:'むし',rock:'いわ',ghost:'ゴースト',
 dragon:'ドラゴン',dark:'あく',steel:'はがね',fairy:'フェアリー'};
const ctx=vm.createContext({state,CANDY_TYPES,Math,Object,document,window,trigger,
 $:(sel)=>sel==='#candy-type-listbox'?menu:trigger,
 save:()=>saved++,render:()=>rendered++});
vm.runInContext(app.slice(start,end),ctx);
vm.runInContext('openCandyTypePicker(trigger)',ctx);
assert.equal(menu.hidden,false);
assert.equal(trigger.attributes['aria-expanded'],'true');
assert.equal((menu.innerHTML.match(/role="option"/g)||[]).length,19);
assert.equal((menu.innerHTML.match(/class="candy-type-pill"/g)||[]).length,19,
 'Each choice uses the same rounded pill as the card');
assert.ok(!menu.innerHTML.includes('candy-type-dot'),'Old color swatches must be gone');
assert.ok(menu.innerHTML.includes('<span class="candy-type-pill" data-type="all">すべて</span>'));
assert.ok(menu.innerHTML.includes('<span class="candy-type-pill" data-type="normal">ノーマル</span>'));
assert.ok(menu.innerHTML.includes('<span class="candy-type-pill" data-type="fire">ほのお</span>'));
assert.ok(menu.innerHTML.includes('data-type="fire"'));
assert.ok(menu.innerHTML.includes('data-type="all" aria-selected="true"'));
assert.ok(Number.parseFloat(menu.style.height)>0);
assert.ok(Number.parseFloat(menu.style.height)<=window.innerHeight*.70);
assert.ok(selectedFocused>0);
vm.runInContext('selectCandyType("not-a-type")',ctx);
assert.equal(state.prefs.candyType,'all');
assert.equal(menu.hidden,false);
vm.runInContext('selectCandyType("fire")',ctx);
assert.equal(state.prefs.candyType,'fire');
assert.equal(menu.hidden,true);
assert.equal(saved,1);
assert.equal(rendered,1);
assert.equal(trigger.attributes['aria-expanded'],'false');
assert.equal(returnedFocus,1);
vm.runInContext('openCandyTypePicker(trigger)',ctx);
assert.ok(menu.innerHTML.includes('data-type="fire" aria-selected="true"'));
rect.top=615;rect.bottom=657;
vm.runInContext('positionCandyTypePicker()',ctx);
assert.ok(Number.parseFloat(menu.style.top)<rect.top, 'Menu should open upwards near screen bottom');
const handlerStart=app.indexOf("  const candyTypeMenu=$('#candy-type-listbox');",end);
const handlerEnd=app.indexOf("  document.addEventListener('click',async ev=>{",handlerStart);
assert.ok(handlerStart>end&&handlerEnd>handlerStart);
vm.runInContext(app.slice(handlerStart,handlerEnd),ctx);
assert.ok(menuListeners.has('keydown')&&docListeners.has('pointerdown')&&docListeners.has('keydown'));
const opts=Array.from({length:19},(_,i)=>({
 focus(){document.activeElement=opts[i]},scrollIntoView(){}
}));
menu.items=opts;document.activeElement=opts[0];
let prevented=0;
menuListeners.get('keydown')({key:'ArrowDown',preventDefault(){prevented++}});
assert.equal(document.activeElement,opts[1]);
menuListeners.get('keydown')({key:'End',preventDefault(){prevented++}});
assert.equal(document.activeElement,opts[18]);
menuListeners.get('keydown')({key:'Escape',preventDefault(){prevented++}});
assert.equal(menu.hidden,true);
assert.equal(trigger.attributes['aria-expanded'],'false');
assert.equal(returnedFocus,2);
vm.runInContext('openCandyTypePicker(trigger,false)',ctx);
docListeners.get('pointerdown')({target:{}});
assert.equal(menu.hidden,true,'Tap outside dismisses floating listbox');
assert.equal(prevented,3);
assert.ok(app.includes("if(candyType!=='all'&&f.type!==candyType)return false;"),
 'Actual candy type selection must filter the result list');
console.log('PASS: custom 18-color candy listbox, option choices, save/reload, viewport/keyboard/outside-tap and preserved card tags');
