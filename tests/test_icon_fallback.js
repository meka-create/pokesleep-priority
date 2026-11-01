'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
// Assert the initial markup, not only a fake load event: this was the regression.
assert.match(css,/\.pokemon-icon:not\(\.broken\) \.fallback\s*\{\s*display:none\s*\}/);
assert.match(css,/\.pokemon-icon\.broken \.fallback\s*\{\s*display:flex\s*\}/);
const a=app.indexOf('  function iconMarkup(p){');
const b=app.indexOf('  // The app queue also protects',a);
assert.ok(a>=0&&b>a);
const icons=new Map();
const vmIcon=vm.createContext({
 state:{icons},spriteId:p=>p.spriteId??null,
 pngIcon:id=>'https://example.invalid/'+id+'.png',
 htmlEscape:s=>String(s),console
});
vm.runInContext(app.slice(a,b),vmIcon);
const markup=vm.runInContext('iconMarkup',vmIcon);
const standard=markup({key:'37:default',name:'ロコン',spriteId:37});
assert.match(standard,/data-fallback="ロ"/);
assert.match(standard,/class="fallback"[^>]*style="display:none"><\/div>/,
 'an image-backed icon must render NO kana text, even before load events');
const missing=markup({key:'999:default',name:'ミュウ',spriteId:null});
assert.match(missing,/class="pokemon-icon broken"/);
assert.match(missing,/class="fallback"[^>]*>ミ<\/div>/);
icons.set('37:default','data:image/png;base64,AA==');
const custom=markup({key:'37:default',name:'ロコン',spriteId:37});
assert.match(custom,/class="fallback"[^>]*style="display:none"><\/div>/,
 'manual uploaded sprite must never have a text overlay');
const start=app.indexOf('  function setIconDisplayState(img,loaded){');
const end=app.indexOf("  $('#icon-input').addEventListener(",start);
assert.ok(start>=0&&end>start);
const listeners={};
class FakeImage{
 constructor(container){this.container=container;this.saved=false}
 closest(sel){return sel==='.pokemon-icon'?this.container:null}
}
const ctx=vm.createContext({
 document:{addEventListener:(name,callback)=>listeners[name]=callback},
 HTMLImageElement:FakeImage,
 saveLoadedSprite:img=>{img.saved=true;}
});
vm.runInContext(app.slice(start,end),ctx);
function fakeIcon(letter){
 const labels=new Set(),fallback={dataset:{fallback:letter},textContent:'',style:{display:'none'}};
 const container={
   classList:{add:v=>labels.add(v),remove:v=>labels.delete(v),contains:v=>labels.has(v)},
   querySelector:sel=>sel==='.fallback'?fallback:null
 };
 return {img:new FakeImage(container),container,fallback};
}
for(const kind of ['standard','regional','uploaded']){
 const {img,container,fallback}=fakeIcon('ロ');
 listeners.load({target:img});
 assert.equal(fallback.textContent,'',kind+' image should not overlap kana after load');
 assert.equal(fallback.style.display,'none');
 assert.equal(container.classList.contains('broken'),false);
 assert.equal(img.saved,true);
 listeners.error({target:img});
 assert.equal(fallback.textContent,'ロ',kind+' broken image restores fallback');
 assert.equal(fallback.style.display,'flex');
 assert.equal(container.classList.contains('broken'),true);
 listeners.load({target:img});
 assert.equal(fallback.textContent,'',kind+' retry success clears actual text');
 assert.equal(fallback.style.display,'none');
 assert.equal(container.classList.contains('broken'),false);
}
assert.match(app,/setIconDisplayState\(img,false\);finish\(\)/,'timeout must restore label too');
console.log('PASS: image-backed markup has no kana; fallback on failure/timeout; load clears text and styles; normal, regional and uploaded icons');
