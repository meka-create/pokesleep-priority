'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
const listeners={};
const cached=new Map([['./index.html','STALE HTML'],['./styles.css','STALE CSS']]);
const calls=[];
let online=true;
const caches={
  open:async()=>({put:async(key,response)=>cached.set(key,await response.text())}),
  match:async(key)=>cached.has(key)?new Response(cached.get(key)):undefined
};
const context=vm.createContext({
  self:{location:{origin:'https://example.org'},addEventListener:(type,fn)=>listeners[type]=fn},
  caches,Response,Request,URL,Promise,Date,setTimeout,clearTimeout,
  fetch:async(req,options)=>{
    calls.push({url:req.url,cache:options?.cache});
    if(!online)throw Error('Offline');
    const pathname=new URL(req.url).pathname;
    if(pathname.endsWith('styles.css'))return new Response('CURRENT CSS');
    if(pathname.endsWith('app.js'))return new Response('CURRENT JS');
    return new Response('CURRENT HTML');
  }
});
vm.runInContext(source,context);
async function dispatch(request){
  let result;const work=[];
  const event={request,respondWith:promise=>result=promise,waitUntil:promise=>work.push(promise)};
  listeners.fetch(event);
  assert.ok(result,'fetch must be intercepted');
  const response=await result;
  await Promise.all(work);
  return response.text();
}
(async()=>{
  const styles=new Request('https://example.org/pokesleep-priority/styles.css?v=0.1.25');
  assert.equal(await dispatch(styles),'CURRENT CSS','stale cached crop must not win');
  assert.equal(cached.get('./styles.css'),'CURRENT CSS','updated CSS saved for offline usage');
  assert.equal(calls[0].cache,'no-store');
  const navigate={url:'https://example.org/pokesleep-priority/',mode:'navigate',method:'GET'};
  assert.equal(await dispatch(navigate),'CURRENT HTML','navigation must check latest HTML');
  assert.equal(cached.get('./index.html'),'CURRENT HTML');
  const appScript=new Request('https://example.org/pokesleep-priority/app.js?v=0.2.2');
  assert.equal(await dispatch(appScript),'CURRENT JS','old app scripts must never stay pinned by CacheStorage');
  assert.equal(cached.get('./app.js'),'CURRENT JS','new script should be cached for offline use');
  online=false;
  assert.equal(await dispatch(styles),'CURRENT CSS','offline should still use updated CSS');
  assert.equal(await dispatch(appScript),'CURRENT JS','app script must remain available offline');
  assert.equal(await dispatch(navigate),'CURRENT HTML','offline should still open app');
  console.log('PASS: PWA shell prefers fresh CSS/HTML and remains functional offline');
})().catch(e=>{console.error(e);process.exitCode=1});
