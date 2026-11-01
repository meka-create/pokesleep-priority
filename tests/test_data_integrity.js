'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function between(a,b){
 const start=app.indexOf(a),end=app.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'missing code: '+a);
 return app.slice(start,end);
}
function fakeDatabase(initial,failAt=0){
 const persisted=new Map(initial);
 let staged;
 const db={
  transaction(_store,_mode){
   staged=new Map(persisted);
   let failed=false,queued=false,ops=0;
   const tx={error:null,
     abort(){failed=true;queueMicrotask(()=>tx.onabort?.());},
     objectStore(){return {
       clear(){staged.clear();endSoon();return{};},
       put(value,key){ops++;if(failAt===ops)throw Error('Injected put failure');
         staged.set(key,value);endSoon();return{};},
       delete(key){staged.delete(key);endSoon();return{};},
       get(key){const request={};queueMicrotask(()=>{
         request.result=staged.get(key);request.onsuccess?.();endSoon();
       });return request;}
     }}
   };
   function endSoon(){
     if(queued)return;queued=true;
     queueMicrotask(()=>{
       if(failed)return;
       persisted.clear();
       for(const [key,val] of staged)persisted.set(key,val);
       tx.oncomplete?.();
     });
   }
   return tx;
  }
 };
 return {db,persisted};
}
(async()=>{
  const first=fakeDatabase([['a','old-a'],['b','old-b']],2);
  const context=vm.createContext({openDB:async()=>first.db,Map,Promise,Error});
  vm.runInContext(between('  async function dbAction(mode,action){','  async function loadIcons(){'),context);
  const replace=vm.runInContext('replaceIconsAtomically',context);
  await assert.rejects(()=>replace([['a','new-a'],['c','new-c']]),/Injected put failure/);
  assert.deepEqual([...first.persisted],[['a','old-a'],['b','old-b']],
    'a failed restore must roll back the original icons, not delete them');
  const second=fakeDatabase([['a','old-a'],['b','old-b']]);
  context.openDB=async()=>second.db;
  await replace([['a','new-a'],['c','new-c']]);
  assert.deepEqual([...second.persisted],[['a','new-a'],['c','new-c']]);
  const get=vm.runInContext('dbAction',context);
  assert.equal(await get('readonly',store=>store.get('a')),'new-a');

  // Simulate a restore failure through the real restore() function. Both
  // in-memory ratings and saved ratings/islands must roll back, with no redraw.
  const local=new Map([['r',JSON.stringify({'37:default':'star'})],
    ['i',JSON.stringify({'37:default':[0]})]]);
  const state={ratings:{'37:default':'star'},overrides:{'37:default':[0]},
    icons:new Map([['37:default','old-image']])};
  let reRendered=0,closed=0,errorText='';
  const restoreContext=vm.createContext({
    state,KEYS:{ratings:'r',overrides:'i'},Map,Object,JSON,RegExp,Error,
    confirm:()=>true,toast:txt=>{errorText=txt},
    dialogClose:()=>closed++,render:()=>reRendered++,
    setLocal:(key,val)=>{local.set(key,JSON.stringify(val));return true},
    sanitizedRatings:o=>o,sanitizedOverrides:o=>o,
    replaceIconsAtomically:async()=>{throw Error('quota exhausted')}
  });
  vm.runInContext(between('  async function restore(file){','  async function fetchJSON(url)'),restoreContext);
  const restore=vm.runInContext('restore',restoreContext);
  const input={app:'pokesleep-priority',version:1,ratings:{'37:default':'double'},
    overrides:{'37:default':[3]},icons:{'37:default':'data:image/png;base64,AAAA'}};
  await restore({size:1000,text:async()=>JSON.stringify(input)});
  assert.deepEqual(state.ratings,{'37:default':'star'});
  assert.deepEqual(state.overrides,{'37:default':[0]});
  assert.deepEqual([...state.icons],[['37:default','old-image']]);
  assert.equal(local.get('r'),JSON.stringify({'37:default':'star'}));
  assert.equal(local.get('i'),JSON.stringify({'37:default':[0]}));
  assert.equal(reRendered,0);assert.equal(closed,0);
  assert.match(errorText,/復元失敗/);
  console.log('PASS: IndexedDB atomic rollback, committed read, restore failure preserves all user settings and images');
})().catch(e=>{console.error(e);process.exitCode=1});
