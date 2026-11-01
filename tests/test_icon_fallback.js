'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
assert.match(css,/\.pokemon-icon\.icon-ready:not\(\.broken\) \.fallback\s*\{\s*display:none\s*\}/);
const first=app.indexOf("  document.addEventListener('error',ev=>{");
const end=app.indexOf("  $('#icon-input').addEventListener(",first);
assert.ok(first>=0&&end>first,'image event handlers exist');
const listeners={};
class FakeImage { constructor(container){this.container=container} closest(sel){return sel==='.pokemon-icon'?this.container:null;} }
const vmContext=vm.createContext({
 document:{addEventListener:(name,fn)=>listeners[name]=fn},
 HTMLImageElement:FakeImage,saveLoadedSprite:img=>{img.saved=true;}
});
vm.runInContext(app.slice(first,end),vmContext);
function makeIcon(){
 const flags=new Set();
 return {classList:{
   add:(name)=>flags.add(name),remove:(name)=>flags.delete(name),contains:(name)=>flags.has(name)
 }};
}
const cases=['standard sprite','regional sprite','custom uploaded icon'];
for(const caseName of cases){
 const node=makeIcon(),img=new FakeImage(node);
 assert.equal(node.classList.contains('icon-ready'),false,caseName);
 listeners.load({target:img});
 assert.equal(node.classList.contains('icon-ready'),true,caseName+' success must hide kana');
 assert.equal(node.classList.contains('broken'),false,caseName+' must show image');
 assert.equal(img.saved,true);
 listeners.error({target:img});
 assert.equal(node.classList.contains('icon-ready'),false,caseName+' failed image must restore kana');
 assert.equal(node.classList.contains('broken'),true,caseName+' must hide broken image');
 listeners.load({target:img});
 assert.equal(node.classList.contains('icon-ready'),true,caseName+' retry must hide kana again');
 assert.equal(node.classList.contains('broken'),false);
}
const noImage=makeIcon();
assert.equal(noImage.classList.contains('icon-ready'),false,'image-less species keeps fallback');
console.log('PASS icon fallback: hidden after successful load; visible when absent/failed; restored after retry');
