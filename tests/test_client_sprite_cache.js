'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const js=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
const header=css.match(/\.app-header\s*\{[^}]+\}/);
assert.ok(header);assert.doesNotMatch(header[0],/position\s*:\s*(sticky|fixed)/);
const a=js.indexOf('  const IMAGE_MAX_ACTIVE=3,IMAGE_GAP_MS=150;'),b=js.indexOf('  // For future regional forms',a);
assert.ok(a>=0&&b>a);
let blobs=0,remote=0,hit=true;
const cached={match:async()=>hit?{ok:true,blob:async()=>new Blob(['bytes'],{type:'image/png'})}:undefined,delete:async()=>true};
const meta={match:async()=>({text:async()=>String(Date.now())}),delete:async()=>true};
const storage={open:async n=>n==='gense-note-sprites-v1'?cached:meta};
class U extends URL{}
U.createObjectURL=()=>`blob:image-${++blobs}`;U.revokeObjectURL=()=>{};
const ctx=vm.createContext({caches:storage,window:{caches:storage},navigator:{},URL:U,Date,Blob,document:{querySelectorAll:()=>[]},console,setTimeout,clearTimeout,Map,Promise});
vm.runInContext(js.slice(a,b),ctx);
const enqueue=vm.runInContext('enqueueSprite',ctx);
class Img {
  constructor(url){this.dataset={spriteSrc:url};this.isConnected=true;this.parentElement={classList:{add(){},remove(){}}};this.events={};this._src='';}
  addEventListener(n,fn){this.events[n]=fn;}
  set src(s){this._src=s;if(s.startsWith('https:'))remote++;}
  get src(){return this._src;}
}
(async()=>{
  const url='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10103.png';
  const first=new Img(url);await enqueue(first);assert.equal(first.src,'blob:image-1');
  const second=new Img(url);await enqueue(second);assert.equal(second.src,first.src);
  assert.equal(blobs,1);assert.equal(remote,0,'cached images should not trigger HTTP on re-render');
  hit=false;
  const missing=new Img(url.replace('10103','99999'));await enqueue(missing);
  await new Promise(resolve=>setTimeout(resolve,90));
  assert.equal(missing.src,missing.dataset.spriteSrc);assert.equal(remote,1);
  missing.events.load?.();
  console.log('PASS: cached image fast path and non-sticky header; offline cache retained');
})().catch(e=>{console.error(e);process.exitCode=1});
