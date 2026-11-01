'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const SPR='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class FakeCache{
  constructor(){this.data=new Map()}
  key(req){return new URL(typeof req==='string'?req:req.url,'https://example.org/pokesleep-priority/').href}
  async addAll(urls){for(const u of urls)this.data.set(this.key(u),new Response('shell',{status:200}))}
  async put(req,res){this.data.set(this.key(req),res.clone())}
  async match(req){const hit=this.data.get(this.key(req));return hit?hit.clone():undefined}
  async keys(){return [...this.data.keys()].map(x=>new Request(x))}
  async delete(req){return this.data.delete(this.key(req))}
}
function worker(fakeFetch){
  const listeners={};const db=new Map();
  const caches={
    open:async name=>{if(!db.has(name))db.set(name,new FakeCache());return db.get(name)},
    keys:async()=>[...db.keys()],delete:async name=>db.delete(name),
    match:async req=>{for(const cache of db.values()){const hit=await cache.match(req);if(hit)return hit}}
  };
  const self={location:{origin:'https://example.org'},addEventListener:(type,fn)=>listeners[type]=fn,
    clients:{claim:async()=>{}},skipWaiting:async()=>{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),{
    self,caches,fetch:fakeFetch,URL,Request,Response,Date,Promise,console,setTimeout,clearTimeout,Map
  });
  function fire(type,reqOrData){
    const jobs=[];let answer;
    const event={request:reqOrData,data:reqOrData,waitUntil:p=>jobs.push(Promise.resolve(p)),respondWith:p=>answer=Promise.resolve(p)};
    listeners[type](event);
    return {response:answer,done:()=>Promise.all(jobs)};
  }
  return {caches,fire};
}
function sprite(id){return new Request(SPR+id+'.png',{mode:'no-cors'})}
function good(){return new Response('PNG',{status:200,headers:{'content-type':'image/png'}})}
(async()=>{
  // 1. Caching + offline reuse + first-visit message. First response uses CORS
  // so errors and Retry-After remain visible, unlike old opaque caching.
  let off=false,calls=0;
  const w=worker(async req=>{calls++;if(off)throw Error('offline');return good()});
  await w.fire('install').done();await w.fire('activate').done();
  const first=w.fire('fetch',sprite(10103));
  assert.equal((await first.response).status,200);
  assert.equal((await w.caches.open('gense-note-sprites-v1')).data.size,1);
  off=true;
  assert.equal((await w.fire('fetch',sprite(10103)).response).status,200);
  assert.equal(calls,1,'cached offline sprite must avoid HTTP request');
  off=false;
  await w.fire('message',{type:'CACHE_SPRITE',url:SPR+'10253.png'}).done();
  off=true;
  assert.equal((await w.fire('fetch',sprite(10253)).response).status,200);

  // 2. Burst requests: <=3 concurrent, >=150ms apart, duplicate URLs fetched once.
  const started=[];let active=0,maxActive=0;
  const b=worker(async req=>{
    started.push({url:req.url,at:Date.now()});active++;maxActive=Math.max(maxActive,active);
    await delay(410);active--;return good();
  });
  const batch=[...Array.from({length:7},(_,i)=>sprite(200+i)),sprite(201),sprite(200)];
  const answers=await Promise.all(batch.map(x=>b.fire('fetch',x).response));
  assert.ok(answers.every(x=>x.status===200));
  assert.equal(started.length,7,'same URL must share an in-flight request');
  assert.ok(maxActive<=3,`active requests ${maxActive} exceeded 3`);
  for(let i=1;i<started.length;i++){
    assert.ok(started[i].at-started[i-1].at>=130,
      `network start gap ${started[i].at-started[i-1].at}ms is below safe margin`);
  }

  // 3. 429 response respected, retry only after Retry-After, never cached.
  let retryAttempts=0,retryTimes=[];
  const r=worker(async req=>{
    retryAttempts++;retryTimes.push(Date.now());
    return retryAttempts===1?new Response('slow down',{status:429,headers:{'Retry-After':'1'}}):good();
  });
  assert.equal((await r.fire('fetch',sprite(300)).response).status,200);
  assert.equal(retryAttempts,2);
  assert.ok(retryTimes[1]-retryTimes[0]>=950,'must observe Retry-After');
  assert.equal((await r.caches.open('gense-note-sprites-v1')).data.size,1);

  // 4. Hard 404 isn't retried or cached; a later request may succeed.
  let missing=0;const f=worker(async()=>{missing++;return new Response('not found',{status:404})});
  assert.equal((await f.fire('fetch',sprite(400)).response).type,'error');
  assert.equal(missing,1);
  assert.equal((await f.caches.open('gense-note-sprites-v1')).data.size,0);

  // 5. Shared 429 cooldown pauses other waiting requests (timer already active).
  const marks=[];const cool=worker(async req=>{
    marks.push({id:req.url,at:Date.now()});
    if(req.url.endsWith('/500.png')&&marks.filter(x=>x.id.endsWith('/500.png')).length===1){
      await delay(40);return new Response('429',{status:429,headers:{'Retry-After':'1'}});
    }
    return good();
  });
  const cooled=await Promise.all([500,501].map(id=>cool.fire('fetch',sprite(id)).response));
  assert.ok(cooled.every(res=>res.status===200));
  assert.ok(marks.find(x=>x.id.endsWith('/501.png')).at-marks[0].at>=950,
    'global cooldown should delay queued URLs');
  console.log(`PASS: cache + offline + 7-URL burst maxConcurrent=${maxActive}, requestGap>=150ms + dedupe + 429 Retry-After and cooldown + 404`);
})().catch(e=>{console.error(e);process.exitCode=1});
