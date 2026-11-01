/* Offline shell + rate-limited PokeAPI sprite cache; no personal data is cached. */
const SHELL_CACHE='gense-note-shell-v0.1.12';
const SPRITE_CACHE='gense-note-sprites-v1';
const SPRITE_META='gense-note-sprite-meta-v1';
const SPRITE_ROOT='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const SPRITE_TTL_MS=30*24*60*60*1000;
const MAX_SPRITES=350;
const MAX_CONCURRENT=3;
const MIN_REQUEST_GAP_MS=150;
const MAX_RETRIES=2;
const CORE=['./','./index.html','./styles.css','./app.js','./data/seed-data.js','./data/master.json','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-header-96.png','./assets/icon-maskable-192.png','./assets/icon-maskable-512.png','./assets/favicon-32.png','./assets/favicon-48.png','./assets/apple-touch-icon.png','./assets/field-greengrass.png','./assets/field-cyan.png','./assets/field-taupe.png','./assets/field-snowdrop.png','./assets/field-lapis.png','./assets/field-gold.png','./assets/field-amber.png'];

function isSprite(url){return url.origin==='https://raw.githubusercontent.com' && url.href.startsWith(SPRITE_ROOT) && /^\d+\.png$/.test(url.pathname.split('/').pop());}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==SHELL_CACHE&&key!==SPRITE_CACHE&&key!==SPRITE_META && (key.startsWith('gense-note-')||key.startsWith('gense-')) && key!=='gense-note-pokeapi-json-v1').map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

// Network starts are serialized at >=150ms, while up to three requests may
// remain active. All misses, stale refreshes and CACHE_SPRITE messages share
// the same queue and global 429 cooldown.
let active=0,nextStartAt=0,cooldownUntil=0,pumpTimer=null;
const queue=[];
const inFlight=new Map();
function pump(){
  if(pumpTimer||active>=MAX_CONCURRENT||!queue.length)return;
  const wait=Math.max(0,nextStartAt-Date.now(),cooldownUntil-Date.now());
  pumpTimer=setTimeout(()=>{
    pumpTimer=null;
    if(active>=MAX_CONCURRENT||Math.max(nextStartAt,cooldownUntil)>Date.now()){pump();return;}
    const job=queue.shift();
    if(!job)return;
    active++;
    nextStartAt=Date.now()+MIN_REQUEST_GAP_MS;
    Promise.resolve().then(job.action).then(job.resolve,job.reject).finally(()=>{
      active--;pump();
    });
    pump();
  },wait);
}
function queuedFetch(req){return new Promise((resolve,reject)=>{queue.push({action:()=>fetch(req),resolve,reject});pump()})}
function retryDelay(res,attempt){
  const header=res?.headers?.get?.('Retry-After');
  let ms=NaN;
  if(header){const secs=Number(header);ms=Number.isFinite(secs)?secs*1000:Date.parse(header)-Date.now();}
  return Number.isFinite(ms)&&ms>=0?Math.min(60000,Math.max(1000,ms))
    :Math.min(12000,1000*2**attempt);
}
function waitFor(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function networkSprite(req){
  // CORS fetch allows status and Retry-After inspection. A no-cors image
  // response is opaque, so 429/404 could otherwise be cached as a bad sprite.
  const networkReq=new Request(req.url,{mode:'cors',credentials:'omit',cache:'no-store'});
  for(let attempt=0;attempt<=MAX_RETRIES;attempt++){
    try{
      const res=await queuedFetch(networkReq);
      if(res.ok)return res;
      if(res.status!==429&&res.status<500)return res; // no retry for 404s
      if(attempt===MAX_RETRIES)return res;
      const delay=retryDelay(res,attempt);
      if(res.status===429)cooldownUntil=Math.max(cooldownUntil,Date.now()+delay);
      await waitFor(delay);
    }catch(err){
      if(attempt===MAX_RETRIES)throw err;
      await waitFor(Math.min(12000,1000*2**attempt));
    }
  }
}
let pruneSerial=Promise.resolve();
async function storeSprite(req,response){
  // Only verified HTTP success responses are cached. Failed/opaque responses
  // cannot poison the sprite cache (older v0.1.6 opaque items may remain).
  if(!response.ok)return;
  const cache=await caches.open(SPRITE_CACHE);
  await cache.put(req,response.clone());
  const meta=await caches.open(SPRITE_META);
  await meta.put(req,new Response(String(Date.now())));
  pruneSerial=pruneSerial.catch(()=>{}).then(async()=>{
    const keys=await cache.keys();
    for(const old of keys.slice(0,Math.max(0,keys.length-MAX_SPRITES))){
      await Promise.all([cache.delete(old),meta.delete(old)]);
    }
  });
  await pruneSerial;
}
async function spriteAge(req){
  const meta=await caches.open(SPRITE_META);
  const item=await meta.match(req);
  if(!item)return Infinity;
  const t=Number(await item.text());
  return Number.isFinite(t)?Date.now()-t:Infinity;
}
function refreshSprite(req){
  if(inFlight.has(req.url))return inFlight.get(req.url);
  const work=(async()=>{
    const response=await networkSprite(req);
    if(response?.ok)await storeSprite(req,response);
    return response;
  })();
  inFlight.set(req.url,work);
  work.finally(()=>{if(inFlight.get(req.url)===work)inFlight.delete(req.url)}).catch(()=>{});
  return work;
}
async function serveSprite(req,event){
  const cache=await caches.open(SPRITE_CACHE);
  const hit=await cache.match(req);
  if(hit){
    if(await spriteAge(req)>=SPRITE_TTL_MS){
      event.waitUntil(refreshSprite(req).catch(()=>{}));
    }
    return hit;
  }
  try{
    const res=await refreshSprite(req);
    return res?.ok?res.clone():Response.error();
  }catch{return Response.error()}
}
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(isSprite(url)){
    event.respondWith(serveSprite(req,event));
    return;
  }
  if(url.origin!==self.location.origin)return;
  if(url.pathname.includes('/.netlify/functions/')){event.respondWith(fetch(req));return}
  if(url.pathname.endsWith('/master.json')){
    event.respondWith(fetch(req).then(res=>{
      if(res.ok){const copy=res.clone();event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.put('./data/master.json',copy)))}
      return res;
    }).catch(()=>caches.match('./data/master.json')));
    return;
  }
  event.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(res=>{
    if(res.ok){const copy=res.clone();event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.put(req,copy)))}
    return res;
  })));
});

// Older clients that loaded an image before SW control may request a later
// cache fill. This goes through exactly the same rate-limited, deduped path.
self.addEventListener('message',event=>{
  const type=event.data?.type;
  if(!['CACHE_SPRITE','REVALIDATE_SPRITE'].includes(type)||typeof event.data.url!=='string')return;
  let url;
  try{url=new URL(event.data.url)}catch{return}
  if(!isSprite(url))return;
  event.waitUntil((async()=>{
    const req=new Request(url.href,{mode:'no-cors',credentials:'omit'});
    const cache=await caches.open(SPRITE_CACHE);
    const hit=await cache.match(req);
    if(type==='CACHE_SPRITE'&&hit)return;
    if(type==='REVALIDATE_SPRITE'&&(!hit||await spriteAge(req)<SPRITE_TTL_MS))return;
    try{await refreshSprite(req)}catch{}
  })());
});
