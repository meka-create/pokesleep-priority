'use strict';
/* No third-party JS, no analytics, no external account. All personal ratings stay in this browser. */
(() => {
  const KEYS={ratings:'gense-note-ratings-v1',overrides:'gense-note-islands-v1',prefs:'gense-note-prefs-v1',master:'gense-note-master-v1',candy:'gense-note-candy-priorities-v1',candyMaster:'gense-note-candy-master-v1'};
  const AREAS=['ワカクサ本島','シアンの砂浜','トープ洞窟','ウノハナ雪原','ラピスラズリ湖畔','ゴールド旧発電所','アンバー渓谷','ワカクサ本島 EX','シアンの砂浜 EX'];
  // Field header imagery is hosted in the app itself, not fetched on each visit.
  const LEVELS=[{id:'star',symbol:'☆',label:'最優先'},{id:'double',symbol:'◎',label:'高優先'},{id:'circle',symbol:'○',label:'優先'},{id:'triangle',symbol:'△',label:'低優先'},{id:'cross',symbol:'×',label:'不要'}];
  const GRADE_IDS=new Set(LEVELS.map(x=>x.id));
  const CANDY_LEVELS=[{id:'use',symbol:'◎',label:'優先投入'},{id:'candidate',symbol:'○',label:'投入候補'},{id:'hold',symbol:'△',label:'保留'},{id:'save',symbol:'×',label:'温存'}];
  const CANDY_IDS=new Set(CANDY_LEVELS.map(x=>x.id));
  const CANDY_KINDS={regional:'リージョン',mega:'メガシンカ',gmax:'キョダイマックス',legendary:'伝説・幻',evolution:'追加進化待ち'};
  const CANDY_TYPES={normal:'ノーマル',fire:'ほのお',water:'みず',electric:'でんき',grass:'くさ',ice:'こおり',
    fighting:'かくとう',poison:'どく',ground:'じめん',flying:'ひこう',psychic:'エスパー',bug:'むし',
    rock:'いわ',ghost:'ゴースト',dragon:'ドラゴン',dark:'あく',steel:'はがね',fairy:'フェアリー'};
  const SLEEP_TYPES=[{id:'うとうと'},{id:'すやすや'},{id:'ぐっすり'}];
  const sleepDot=type=>`<span class="sleep-type-dot" data-sleep="${htmlEscape(type)}" aria-hidden="true"></span>`;
  const SEARCH_GRADE_IDS=[...LEVELS.map(x=>x.id),'none'];
  const DEFAULT_PREFS={tab:'dex',search:'',sleep:'all',grade:'all',area:0,onlyRated:true,searchGrades:null,candyTier:'all',candySpecial:'all',candyKind:'all'};
  // Match tools/species_policy.py. Retired form ratings/icons are not migrated.
  const EXCLUDED_MASTER_KEYS=new Set(["25:Low Key","25:Halloween2","133:Halloween2","710:Small","710:Large","710:Jumbo","711:Small","711:Large","711:Jumbo"]);
  const CANONICAL_MASTER_NAMES={"710:Medium":"バケッチャ","711:Medium":"パンプジン"};
  function isIncludedPokemonKey(key){
    if(EXCLUDED_MASTER_KEYS.has(key))return false;
    const [num,form]=String(key).split(':');
    if(num==='710'||num==='711')return form==='Medium';
    if((num==='25'||num==='133')&&form?.startsWith('Halloween'))return form==='Halloween';
    return true;
  }
  function canonicalizePokemon(records){
    const seen=new Set(),result=[];
    for(const pokemon of records||[]){
      if(!pokemon||!isIncludedPokemonKey(pokemon.key)||seen.has(pokemon.key))continue;
      seen.add(pokemon.key);
      const name=CANONICAL_MASTER_NAMES[pokemon.key];
      result.push(name&&pokemon.name!==name?{...pokemon,name}:pokemon);
    }
    return result;
  }
  const masterSeed=window.__SEED_MASTER__;
  const candySeed=window.__CANDY_MASTER__;
  const $=(s,root=document)=>root.querySelector(s);
  const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Match only from the beginning of a name; hiragana and katakana are equivalent.
  // NFKC also accepts half-width katakana, and NFC composes combining dakuten.
  const normalize=s=>String(s||'').normalize('NFKC').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)).normalize('NFC').replace(/[\s　]/g,'').toLocaleLowerCase('ja');
  function fromLocal(key,fallback){try{const data=JSON.parse(localStorage.getItem(key));return data===null?fallback:data}catch{return fallback}}
  function setLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{toast('保存容量が不足しています。バックアップを作成してください');return false}}
  function validMaster(x){
    if(!x||x.schema!==1||!Array.isArray(x.pokemon)||x.pokemon.length<200)return false;
    if(typeof x.areasReady!=='boolean'||!Array.isArray(x.areas))return false;
    if(x.areasReady&&(x.areas.length!==AREAS.length||x.areas.some((area,i)=>area!==AREAS[i])))return false;
    if(typeof x.updatedAt!=='string'||!Number.isFinite(Date.parse(x.updatedAt)))return false;
    const keys=new Set();
    for(const p of x.pokemon){
      if(!p||typeof p.key!=='string'||!/^(\d+):[A-Za-z0-9 _-]+$/.test(p.key)
        ||!Number.isInteger(p.id)||p.id<1||p.id>9999
        ||Number(p.key.split(':',1)[0])!==p.id||keys.has(p.key)
        ||typeof p.name!=='string'||!p.name.trim()
        ||!Array.isArray(p.islands)||p.islands.some(n=>!Number.isInteger(n)||n<0||n>=AREAS.length)
        ||new Set(p.islands).size!==p.islands.length
        ||!['うとうと','すやすや','ぐっすり','不明'].includes(p.sleep))return false;
      keys.add(p.key);
    }
    return true;
  }
  const last=fromLocal(KEYS.master,null);
  const savedMaster=validMaster(last)?last:masterSeed;
  // Bundled 9-island seed should immediately upgrade an older species-only
  // cache, including on an offline launch. Preserve any newly added species.
  const base=validMaster(savedMaster)?savedMaster:masterSeed;
  const baseStamp=Date.parse(base?.updatedAt||''),bundleStamp=Date.parse(masterSeed?.updatedAt||'');
  const bundled=validMaster(masterSeed)&&masterSeed.areasReady
    &&(!base.areasReady||(Number.isFinite(bundleStamp)&&
      (!Number.isFinite(baseStamp)||bundleStamp>=baseStamp)));
  const combinedMaster= bundled?(()=>{
    const priorByKey=new Map(base.pokemon.map(p=>[p.key,p]));
    const freshKeys=new Set(masterSeed.pokemon.map(p=>p.key));
    return {
      ...masterSeed,
      pokemon:[
        ...masterSeed.pokemon.map(p=>{
          const prior=priorByKey.get(p.key);
          return prior?.islands?.length&&!p.islands?.length?{...p,islands:prior.islands}:p;
        }),
        ...base.pokemon.filter(p=>!freshKeys.has(p.key))
      ]
    };
  })():base;
  const master={...combinedMaster,pokemon:canonicalizePokemon(combinedMaster.pokemon)};
  function validCandyMaster(value){
    if(!value||value.schema!==3||!Array.isArray(value.families)||value.families.length<70)return false;
    const keys=new Set(),members=new Set();
    for(const f of value.families){
      if(!Number.isInteger(f.id)||f.id<1||keys.has(f.id)||!Number.isInteger(f.labelId)
        ||!Array.isArray(f.members)||!f.members.includes(f.labelId)
        ||!f.special||typeof f.special!=='object'||!Object.hasOwn(CANDY_TYPES,f.type))return false;
      keys.add(f.id);
      for(const id of f.members){
        if(!Number.isInteger(id)||id<1||members.has(id))return false;
        members.add(id);
      }
      if(Object.keys(CANDY_KINDS).some(k=>!Array.isArray(f.special[k])
        ||f.special[k].some(id=>!Number.isInteger(id)||id<1)))return false;
    }
    return members.size>=200;
  }
  const cachedCandy=fromLocal(KEYS.candyMaster,null);
  const candyMaster=validCandyMaster(cachedCandy)
    &&(!validCandyMaster(candySeed)||Date.parse(cachedCandy.updatedAt)>Date.parse(candySeed.updatedAt))
    ?cachedCandy:candySeed;
  const candyPrefs=fromLocal(KEYS.candy,{});
  const candyRatings={};
  if(candyPrefs&&typeof candyPrefs==='object'&&!Array.isArray(candyPrefs))
    for(const [id,value] of Object.entries(candyPrefs))
      if(/^(?:[1-9]\d*|pending:[1-9]\d*)$/.test(id)&&CANDY_IDS.has(value))
        candyRatings[id]=value;
  const prefs={...DEFAULT_PREFS,...fromLocal(KEYS.prefs,{})};
  if(!['dex','search','candy'].includes(prefs.tab))prefs.tab='dex';
  if(!['all',...CANDY_LEVELS.map(x=>x.id),'none'].includes(prefs.candyTier))prefs.candyTier='all';
  // Old v0.2.0 saved a special-form TYPE in candySpecial. Preserve that
  // selection when migrating to the separate "presence" / "kind" filters.
  if(Object.hasOwn(CANDY_KINDS,prefs.candySpecial)){
    prefs.candyKind=prefs.candySpecial;
    prefs.candySpecial='any';
  }
  if(!['all','any','none'].includes(prefs.candySpecial))prefs.candySpecial='all';
  if(!['all',...Object.keys(CANDY_KINDS)].includes(prefs.candyKind))prefs.candyKind='all';
  // Retired v0.2.3 type filters must never hide candies after the control is removed.
  delete prefs.candyType;
  if(!Number.isInteger(prefs.area)||prefs.area<0||prefs.area>8)prefs.area=0;
  // Migrate v0.1.2's onlyRated preference without changing any stored ratings.
  // An explicitly saved empty array means 'show no grades', not 'reset filter'.
  prefs.searchGrades=Array.isArray(prefs.searchGrades)
    ? [...new Set(prefs.searchGrades.filter(g=>SEARCH_GRADE_IDS.includes(g)))]
    : SEARCH_GRADE_IDS.filter(g=>g!=='none'||prefs.onlyRated===false);
  const state={master,candyMaster,candyRatings,ratings:fromLocal(KEYS.ratings,{}),overrides:fromLocal(KEYS.overrides,{}),prefs,icons:new Map(),selected:null,selectedCandy:null,status:'',imageBusy:false};
  let dbPromise=null,toastTimer=null,loadingMaster=false;
  const nowJST=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=k=>parts.find(x=>x.type===k)?.value;return `${get('year')}-${get('month')}-${get('day')}`;};
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
  function save(){setLocal(KEYS.ratings,state.ratings);setLocal(KEYS.overrides,state.overrides);setLocal(KEYS.prefs,state.prefs)}
  function getPokemon(){return state.master?.pokemon||[]}
  function grade(key){const g=state.ratings[key];return GRADE_IDS.has(g)?g:'none'}
  function gradeInfo(g){return LEVELS.find(x=>x.id===g)||{id:'none',symbol:'—',label:'未評価'}}
  function islandList(p){const o=state.overrides?.[p.key];return Array.isArray(o)?o:p.islands||[]}
  // The National Pokédex number is NOT the sprite ID of a regional form.
  // Verified PokeAPI Pokémon IDs. Do not replace an unknown regional form
  // with its normal form: show the name fallback until a regional ID resolves.
  const SPRITE_ROOT='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
  const REGION_SUFFIX={Alola:'alola',Galar:'galar',Hisui:'hisui',Paldea:'paldea'};
  const VERIFIED_REGIONAL_IDS={'37:Alola':10103,'38:Alola':10104,'194:Paldea':10253};
  const regionalSpriteIds=fromLocal('gense-note-regional-sprites-v1',{});
  function isRegional(p){return Boolean(REGION_SUFFIX[p.form])&&p.id!==980 /* Clodsire is a normal species, not Paldean Wooper */}
  function spriteId(p){
    if(!isRegional(p))return p.id;
    const id=VERIFIED_REGIONAL_IDS[p.key]||regionalSpriteIds[p.key]||p.spriteId;
    return Number.isInteger(id)&&id>0?id:null;
  }
  const pngIcon=id=>`${SPRITE_ROOT}${id}.png`;
  function iconMarkup(p){
    const custom=state.icons.get(p.key),id=spriteId(p),src=custom||(id?pngIcon(id):'');
    // Unit tests also isolate this renderer without initializing the cache module.
    const preloaded=!custom&&src&&typeof spriteBlobs!=='undefined'?spriteBlobs.get(src):null;
    // Only manual icons load immediately. Remote sprites enter a visible-only,
    // rate-limited queue; their network requests are additionally governed by SW.
    const tag=custom?`<img src="${htmlEscape(custom)}" alt="" decoding="async">`
      :src?`<img ${preloaded?`src="${htmlEscape(preloaded)}" `:''}data-sprite-src="${htmlEscape(src)}" alt="" decoding="async" referrerpolicy="no-referrer">`:'';
    // Keep a recovery label, but do not render any kana behind a working
    // (possibly transparent) image. Only show it if that image actually fails.
    const initial=htmlEscape(p.name.slice(0,1));
    return `<div class="pokemon-icon${src?'':' broken'}">${tag}<div class="fallback" data-fallback="${initial}" aria-hidden="true"${src?' style="display:none"':''}>${src?'':initial}</div></div>`;
  }
  // The app queue also protects a first visit before Service Worker control.
  // Requests start >=150ms apart, and at most three visible image elements load
  // at once. The SW independently deduplicates URLs and limits real fetches.
  const IMAGE_MAX_ACTIVE=3,IMAGE_GAP_MS=150;
  let imageActive=0,nextImageStart=0,imageStartTimer=null,iconsReady=false;
  const imageWaiting=[];
  const spriteObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){spriteObserver.unobserve(entry.target);enqueueSprite(entry.target)}
  },{rootMargin:'300px 0px'}):null;
  function discoverSprites(){
    if(!iconsReady)return; // Never fetch a standard sprite until manual overrides are read.
    // Remove queued elements from replaced sections; in-flight requests can end
    // naturally (or on timeout) without holding onto new DOM elements.
    for(const img of document.querySelectorAll('img[data-sprite-src]')){
      // Resume requests that were dropped while this tab was detached.
      if(!img.hasAttribute('src')&&['queued','checking'].includes(img.dataset.spriteState)
         &&!imageWaiting.includes(img))delete img.dataset.spriteState;
      if(img.dataset.spriteState)continue;
      if(spriteObserver)spriteObserver.observe(img);else enqueueSprite(img);
    }
  }
  // Display successfully cached sprites directly from local CacheStorage.
  // Only cache misses enter the rate-limited remote queue.
  const SPRITE_CACHE='gense-note-sprites-v1',SPRITE_META='gense-note-sprite-meta-v1';
  const SPRITE_TTL_MS=30*24*60*60*1000;
  const spriteBlobs=new Map(),spriteBlobPending=new Map(),spriteRevalidations=new Set();
  async function checkSpriteFreshness(url){
    if(spriteRevalidations.has(url)||!('serviceWorker'in navigator))return;
    try{
      const meta=await caches.open(SPRITE_META),record=await meta.match(url);
      const stored=record?Number(await record.text()):NaN;
      if(Number.isFinite(stored)&&Date.now()-stored<SPRITE_TTL_MS)return;
      spriteRevalidations.add(url);
      const reg=await navigator.serviceWorker.ready;
      (navigator.serviceWorker.controller||reg.active)?.postMessage({type:'REVALIDATE_SPRITE',url});
    }catch{}
  }
  async function cachedSpriteBlobURL(url){
    if(spriteBlobs.has(url))return spriteBlobs.get(url);
    if(spriteBlobPending.has(url))return spriteBlobPending.get(url);
    if(!('caches'in window)||typeof URL.createObjectURL!=='function')return null;
    const task=(async()=>{
      const cache=await caches.open(SPRITE_CACHE),hit=await cache.match(url);
      if(!hit||!hit.ok)return null;
      const blob=await hit.blob();
      if(!blob.size||!blob.type.startsWith('image/'))return null;
      const local=URL.createObjectURL(blob);
      spriteBlobs.set(url,local);
      checkSpriteFreshness(url);
      return local;
    })().catch(()=>null).finally(()=>spriteBlobPending.delete(url));
    spriteBlobPending.set(url,task);
    return task;
  }
  function queueRemoteSprite(img){
    if(!img.isConnected)return;
    img.dataset.spriteState='queued';imageWaiting.push(img);pumpImages();
  }
  async function enqueueSprite(img){
    if(img.dataset.spriteState||!img.isConnected)return;
    img.dataset.spriteState='checking';
    const url=img.dataset.spriteSrc,local=await cachedSpriteBlobURL(url);
    if(!img.isConnected)return;
    if(!local){queueRemoteSprite(img);return;}
    img.addEventListener('error',()=>{
      spriteBlobs.delete(url);
      URL.revokeObjectURL(local);
      (async()=>{
        try{
          await (await caches.open(SPRITE_CACHE)).delete(url);
          await (await caches.open(SPRITE_META)).delete(url);
        }catch{}
        queueRemoteSprite(img);
      })();
    },{once:true});
    img.addEventListener('load',()=>img.parentElement?.classList.remove('broken'),{once:true});
    img.dataset.spriteState='cached';
    if(img.src!==local)img.src=local; // Avoid decoding the same Blob URL again.
  }
  function pumpImages(){
    if(imageStartTimer||imageActive>=IMAGE_MAX_ACTIVE)return;
    while(imageWaiting.length&&!imageWaiting[0].isConnected)imageWaiting.shift();
    if(!imageWaiting.length)return;
    const delay=Math.max(0,nextImageStart-Date.now());
    imageStartTimer=setTimeout(()=>{
      imageStartTimer=null;
      if(imageActive>=IMAGE_MAX_ACTIVE){pumpImages();return;}
      const img=imageWaiting.shift();
      if(!img?.isConnected){pumpImages();return;}
      imageActive++;nextImageStart=Date.now()+IMAGE_GAP_MS;
      let ended=false;
      const finish=()=>{
        if(ended)return;ended=true;
        clearTimeout(watchdog);imageActive=Math.max(0,imageActive-1);pumpImages();
      };
      const watchdog=setTimeout(()=>{
        setIconDisplayState(img,false);finish();
      },20000);
      img.addEventListener('load',finish,{once:true});
      img.addEventListener('error',finish,{once:true});
      img.dataset.spriteState='loading';img.src=img.dataset.spriteSrc;
      pumpImages();
    },delay);
  }
  // For future regional forms, resolve their form ID using PokeAPI's species
  // variety URLs once and store only the public ID locally (never user data).
  let regionLookupRunning=false;
  let nextSpeciesRequest=0;
  const SPECIES_CACHE='gense-note-pokeapi-json-v1';
  const MAX_RETRIES=2;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function retryWait(response,attempt){
    const header=response?.headers?.get('Retry-After');
    let ms=NaN;
    if(header){const secs=Number(header);ms=Number.isFinite(secs)?secs*1000:Date.parse(header)-Date.now();}
    return Number.isFinite(ms)&&ms>=0?Math.min(60000,Math.max(1000,ms))
      :Math.min(12000,1000*2**attempt);
  }
  async function fetchSpecies(id){
    const url=`https://pokeapi.co/api/v2/pokemon-species/${id}/`;
    const cache='caches'in window?await caches.open(SPECIES_CACHE).catch(()=>null):null;
    const saved=cache?await cache.match(url).catch(()=>null):null;
    if(saved)return saved.json();
    for(let attempt=0;attempt<=MAX_RETRIES;attempt++){
      const wait=Math.max(0,nextSpeciesRequest-Date.now());
      if(wait)await pause(wait);
      nextSpeciesRequest=Date.now()+150;
      try{
        const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
        if(response.ok){if(cache)await cache.put(url,response.clone()).catch(()=>{});return response.json();}
        if(response.status!==429&&response.status<500)throw Error(`HTTP ${response.status}`);
        if(attempt===MAX_RETRIES)throw Error(`HTTP ${response.status}`);
        await pause(retryWait(response,attempt));
      }catch(e){
        if(attempt===MAX_RETRIES||/^HTTP (4\d\d|5\d\d)/.test(e.message||''))throw e;
        await pause(Math.min(12000,1000*2**attempt));
      }
    }
  }
  async function resolveRegionalSprites(){
    if(regionLookupRunning)return;
    regionLookupRunning=true;
    try{
      const today=nowJST();
      const checked=fromLocal('gense-note-regional-checks-v1',{});
      const pending=getPokemon().filter(p=>isRegional(p)&&!spriteId(p)&&checked[p.key]!==today);
      let changed=false;
      for(const p of pending){
        checked[p.key]=today;
        try{
          const data=await fetchSpecies(p.id);
          const suffix=`-${REGION_SUFFIX[p.form]}`;
          const variant=data.varieties?.find(x=>x.pokemon?.name?.endsWith(suffix));
          const match=variant?.pokemon?.url?.match(/\/(\d+)\/?$/);
          const id=match?Number(match[1]):null;
          if(!Number.isInteger(id)||id<=0)continue;
          regionalSpriteIds[p.key]=id;changed=true;
        }catch(e){console.info('Regional sprite ID not yet available',p.key)}
      }
      if(pending.length)setLocal('gense-note-regional-checks-v1',checked);
      if(changed){setLocal('gense-note-regional-sprites-v1',regionalSpriteIds);render()}
    }finally{regionLookupRunning=false;}
  }
  // CacheStorage belongs to the Service Worker. On the very first visit
  // images might load before this page is controlled, so send successful
  // image URLs back for post-install caching. The worker deduplicates them.
  const seenSprites=new Set();
  function saveLoadedSprite(img){
    const url=img.currentSrc||img.src;
    if(!url.startsWith(SPRITE_ROOT)||seenSprites.has(url))return;
    seenSprites.add(url);
    if(!('serviceWorker'in navigator))return;
    navigator.serviceWorker.ready.then(reg=>{
      (navigator.serviceWorker.controller||reg.active)?.postMessage({type:'CACHE_SPRITE',url});
    }).catch(()=>{});
  }
  // The five rating controls are independent buttons, not nested inside the details button.
  // This makes grading a single tap; only the profile button opens the optional details modal.
  function card(p){
    const g=grade(p.key),label=gradeInfo(g),name=htmlEscape(p.name),key=htmlEscape(p.key);
    const grades=LEVELS.map(x=>`<button type="button" class="quick-grade ${g===x.id?'active':''}" data-action="quick-rate" data-key="${key}" data-grade="${x.id}" aria-label="${name}：${x.symbol}（${x.label}）${g===x.id?'を解除':'に設定'}" aria-pressed="${g===x.id?'true':'false'}" title="${x.label}${g===x.id?'（もう一度押すと解除）':''}">${x.symbol}</button>`).join('');
    return `<article class="mon-card" data-grade="${g}" data-key="${key}"><button class="mon-profile" type="button" data-action="pokemon" data-key="${key}" aria-label="${name}の詳細・アイコン・出現島を編集">${iconMarkup(p)}<span class="mon-meta"><span class="mon-number">No.${String(p.id).padStart(4,'0')}</span><span class="mon-name">${name}</span><span class="grade-label" data-grade="${g}">${label.symbol} ${label.label}</span></span><span class="mon-chevron" aria-hidden="true">›</span></button><div class="quick-grades" role="group" aria-label="${name}の厳選優先度">${grades}</div></article>`;
  }
  function compactCard(p){const g=grade(p.key),label=gradeInfo(g);return `<button class="mini-mon" type="button" data-action="pokemon" data-key="${htmlEscape(p.key)}" data-grade="${g}" aria-label="${htmlEscape(p.name)}、${label.label}、評価を変更">${iconMarkup(p)}<span class="mini-mon-name">${htmlEscape(p.name)}</span></button>`}
  function candyChoice(id){return CANDY_IDS.has(state.candyRatings[id])?state.candyRatings[id]:'none'}
  function candyFamilies(){
    const all=getPokemon(),byId=new Map();
    for(const p of all){
      const current=byId.get(p.id);
      if(!current||((current.form||'')!==''&&!(p.form||'')))byId.set(p.id,p);
    }
    const groups=[],covered=new Set();
    for(const f of state.candyMaster?.families||[]){
      const members=f.members.filter(id=>byId.has(id));
      if(!members.length)continue;
      members.forEach(id=>covered.add(id));
      const label=byId.get(f.labelId)||byId.get(members[0]);
      groups.push({...f,key:String(f.id),label:label.name+'のアメ',representative:label,
        memberNames:members.map(id=>byId.get(id).name),unknown:false});
    }
    // A newly added Pokémon remains visible without guessing an evolution
    // relation or claiming that it has no special forms.
    for(const [id,p] of byId)if(!covered.has(id))
      groups.push({id,key:'pending:'+id,label:p.name+'のアメ（仮）',representative:p,
        memberNames:[p.name],type:null,special:{regional:[],mega:[],gmax:[],legendary:[],evolution:[]},unknown:true});
    return groups;
  }
  function candyBadge(f){
    if(f.unknown)return '特殊要素：未確認';
    const kinds=Object.entries(CANDY_KINDS).filter(([key])=>f.special[key]?.length).map(([,label])=>label);
    return kinds.length?kinds.join(' / '):'特殊要素なし';
  }
  function candyShell(){
    const tierOptions=[{id:'all',symbol:'すべて',label:'すべて'},
      ...CANDY_LEVELS,{id:'none',symbol:'未設定',label:'未設定'}];
    const modes=[{id:'all',label:'すべて'},{id:'any',label:'あり'},{id:'none',label:'なし'}];
    const selected=state.prefs.candySpecial;
    return '<section class="toolbar candy-toolbar" aria-label="ウッウロボ絞り込み">'
      +'<input class="search-input" id="search" type="search" placeholder="検索" value="'+htmlEscape(state.prefs.search)+'" autocomplete="off">'
      +'<div class="candy-filter-label">投入優先度</div>'
      +'<div class="candy-tier-filters" role="group" aria-label="投入優先度で絞り込み">'
      +tierOptions.map(t=>'<button type="button" class="candy-tier-choice'+(state.prefs.candyTier===t.id?' active':'')+'"'
        +' data-action="candy-tier-filter" data-value="'+t.id+'" title="'+htmlEscape(t.label)+'"'
        +' aria-label="'+htmlEscape(t.symbol+' '+t.label)+'" aria-pressed="'+(state.prefs.candyTier===t.id)+'">'
        +'<span class="candy-tier-symbol">'+htmlEscape(t.symbol)+'</span>'
        +(t.id==='all'||t.id==='none'?'':'<span class="candy-tier-name">'+htmlEscape(t.label)+'</span>')
        +'</button>').join('')+'</div>'
      +'<div class="candy-filter-label">特殊要素</div>'
      +'<div class="candy-special-modes" role="group" aria-label="特殊要素の有無">'
      +modes.map(m=>'<button type="button" class="candy-special-mode'+(selected===m.id?' active':'')+'"'
        +' data-action="candy-special-filter" data-value="'+m.id+'" aria-pressed="'+(selected===m.id)+'">'+m.label+'</button>').join('')+'</div>'
      +(selected==='any'?'<div class="candy-kind-filter"><div class="candy-filter-label">種類</div>'
        +chips([{id:'all',text:'全種類'},...Object.entries(CANDY_KINDS).map(([id,text])=>({id,text}))],
          state.prefs.candyKind,'candy-kind-filter')+'</div>':'')
      +'</section><div id="results"></div>';
  }
  function renderCandyResults(el){
    const search=normalize(state.prefs.search),tier=state.prefs.candyTier;
    const special=state.prefs.candySpecial,kind=state.prefs.candyKind;
    const order={use:0,candidate:1,hold:2,save:3,none:4};
    const groups=candyFamilies().filter(f=>{
      if(search&&!normalize(f.label).includes(search)
        &&!f.memberNames.some(n=>normalize(n).includes(search))
        &&!f.special?.regional?.some(id=>String(id).startsWith(search))
        &&!String(f.id).startsWith(search))return false;
      const value=candyChoice(f.key);
      if(tier!=='all'&&tier!==value)return false;
      const hasAny=Object.keys(CANDY_KINDS).some(k=>f.special[k]?.length);
      if(special==='any'&&(!hasAny||(kind!=='all'&&!f.special[kind]?.length)))return false;
      if(special==='none'&&(hasAny||f.unknown))return false;
      return true;
    }).sort((a,b)=>order[candyChoice(a.key)]-order[candyChoice(b.key)]
      ||a.representative.id-b.representative.id);
    const markup='<div class="section-top"><h3>アメ一覧</h3><span>'+groups.length+'件</span></div>'
      +(groups.length?'<div class="candy-list">'+groups.map(f=>{
        const tier=candyChoice(f.key),key=htmlEscape(f.key),name=htmlEscape(f.label);
        return '<article class="candy-item" data-family-id="'+key+'" data-grade="'+tier+'">'
          +'<button type="button" class="candy-profile" data-action="candy-detail" data-family-id="'+key+'"'
          +' aria-label="'+name+'の詳細とアメを共有するポケモン">'+iconMarkup(f.representative)
          +'<span class="candy-item-info"><strong class="candy-name">'+name+'</strong>'
          +'<small>'+htmlEscape(candyBadge(f))+'</small></span>'
          +'<span class="candy-type-tag" data-type="'+(Object.hasOwn(CANDY_TYPES,f.type)?f.type:'unknown')+'">'
          +htmlEscape(CANDY_TYPES[f.type]||'未確認')+'</span>'
          +'<span class="candy-chevron" aria-hidden="true">›</span></button>'
          +'<div class="candy-quick-grades" role="group" aria-label="'+name+'の投入優先度">'
          +CANDY_LEVELS.map(level=>{
            const active=tier===level.id;
            return '<button type="button" class="candy-quick-grade'+(active?' active':'')+'"'
              +' data-action="candy-quick-rate" data-family-id="'+key+'" data-tier="'+level.id+'"'
              +' aria-pressed="'+active+'"'
              +' aria-label="'+name+'：'+level.symbol+'（'+level.label+'）'+(active?'を解除':'に設定')+'"'
              +' title="'+level.label+(active?'（もう一度押すと解除）':'')+'">'+level.symbol+'</button>';
          }).join('')+'</div></article>';
      }).join('')+'</div>':'<div class="empty-state">該当するアメがありません</div>');
    patchResults(el,markup);
  }
  function selectedCandy(){return candyFamilies().find(f=>f.key===state.selectedCandy)}
  function candyDetails(){
    const f=selectedCandy();if(!f)return;
    const tier=candyChoice(f.key);
    const names=[...new Set(f.memberNames)].join('・');
    const special=candyBadge(f);
    $('#candy-details-body').innerHTML='<div class="sheet-top"><div class="subtle">ウッウロボ</div>'
      +'<button type="button" class="close-button" data-action="close-candy" aria-label="閉じる">×</button></div>'
      +'<div class="candy-modal-title"><h2>'+htmlEscape(f.label)+'</h2>'
      +'<small>'+htmlEscape(special)+'</small></div>'
      +'<p class="candy-family-members">'+htmlEscape(names)+'</p>'
      +'<p class="field-label">投入優先度</p>'
      +'<div class="candy-level-options">'+CANDY_LEVELS.map(level=>
        '<button type="button" class="candy-level-choice" data-action="candy-rate" data-tier="'+level.id+'" aria-pressed="'+(tier===level.id)+'"><span class="candy-level-symbol">'+level.symbol+'</span><span>'+level.label+'</span></button>'
      ).join('')+'</div>'
      +'<button type="button" class="secondary-button candy-unset" data-action="candy-rate" data-tier="none">未設定に戻す</button>';
  }
  function setCandyChoice(id,tier){
    if(tier!=='none'&&!CANDY_IDS.has(tier))return;
    const updated={...state.candyRatings};
    if(tier==='none')delete updated[id];else updated[id]=tier;
    if(!setLocal(KEYS.candy,updated))return;
    state.candyRatings=updated;
    renderResults();updateRatedCounter();dialogClose('#candy-details');
    toast(tier==='none'?'未設定に戻しました':'投入優先度を設定しました');
  }
  function quickCandyRate(button){
    const id=button.dataset.familyId,requested=button.dataset.tier;
    if(!CANDY_IDS.has(requested)||!candyFamilies().some(f=>f.key===id))return;
    setCandyChoice(id,candyChoice(id)===requested?'none':requested);
  }
  function chips(options,value,action,attr='value'){return `<div class="chips">${options.map(x=>`<button type="button" class="chip ${value===x.id?'active':''}" data-action="${action}" data-${attr}="${htmlEscape(x.id)}" ${x.grade?`data-grade="${x.grade}"`:''} aria-pressed="${value===x.id?'true':'false'}">${x.text}</button>`).join('')}</div>`}
  function filterPokemon(){const {search,sleep,grade:filterGrade}=state.prefs;const prefix=normalize(search);return getPokemon().filter(p=>{
    if(prefix&&!normalize(p.name).startsWith(prefix)&&!String(p.id).startsWith(prefix))return false;
    if(state.prefs.tab==='dex'&&sleep!=='all'&&p.sleep!==sleep)return false;
    if(state.prefs.tab==='dex'&&filterGrade!=='all'&&grade(p.key)!==filterGrade)return false;
    return true;
  });}
  function countRated(){return getPokemon().filter(p=>grade(p.key)!=='none').length}
  function updateRatedCounter(){
    const candy=state.prefs.tab==='candy',families=candy?candyFamilies():null;
    const counted=candy?families.filter(f=>candyChoice(f.key)!=='none').length:countRated();
    const counter=$('#rated-count'),total=$('#total-count'),label=$('.header-count > span');
    if(counter)counter.textContent=counted;
    if(total)total.textContent=candy?families.length:getPokemon().length;
    if(label)label.textContent=candy?'設定済み':'評価済み';
  }
  function warning(){if(state.master.areasReady)return '';const m=Object.keys(state.overrides).length;return `<div class="sync-notice">島別の出現マスターは未同期です。図鑑での評価は利用できます。${m?'手動登録した島のデータは表示できます。':''} GitHub Actionsの初回更新が成功すると自動で反映されます。 <button class="link-button" data-action="sync">更新を確認</button></div>`}
  function sleepFilter(){return `<div class="filter-line">${chips([{id:'all',text:'すべて'},...SLEEP_TYPES.map(t=>({id:t.id,text:sleepDot(t.id)+' '+t.id}))],state.prefs.sleep,'sleep')}</div>`}
  function dexShell(){const opts=[{id:'all',text:'すべて'},{id:'star',text:'☆',grade:'star'},{id:'double',text:'◎',grade:'double'},{id:'circle',text:'○',grade:'circle'},{id:'triangle',text:'△',grade:'triangle'},{id:'cross',text:'×',grade:'cross'},{id:'none',text:'未評価'}];return `<section class="toolbar" aria-label="図鑑絞り込み"><input class="search-input" id="search" type="search" placeholder="検索" value="${htmlEscape(state.prefs.search)}" autocomplete="off">${chips(opts,state.prefs.grade,'grade')}${sleepFilter()}</section><div id="results"></div>`}
  // Evaluation search intentionally shows all islands AND sleep types on the same page.
  // The former area/sleep selectors are retained only as legacy preference fields for
  // backwards-compatible local storage; they do not filter the evaluation overview.
  function searchGradeFilter(){
    const active=new Set(state.prefs.searchGrades);
    const none=active.size===0;
    const all=SEARCH_GRADE_IDS.every(g=>active.has(g));
    const grades=[...LEVELS,{id:'none',symbol:'—',label:'未評価'}];
    return `<div class="search-grade-panel"><div class="search-grade-top"><strong id="search-grade-label">表示する評価</strong><div class="search-grade-presets"><button type="button" class="grade-preset ${none?'active':''}" data-action="search-grade-preset" data-preset="none" aria-pressed="${none}">選択解除</button><button type="button" class="grade-preset ${all?'active':''}" data-action="search-grade-preset" data-preset="all" aria-pressed="${all}">すべて</button></div></div><div class="search-grade-options" role="group" aria-labelledby="search-grade-label">${grades.map(x=>`<button type="button" class="search-grade-choice ${active.has(x.id)?'active':''}" data-action="search-grade-toggle" data-grade="${x.id}" aria-label="${x.label}（${x.symbol}）を${active.has(x.id)?'非表示にする':'表示する'}" aria-pressed="${active.has(x.id)}"><span class="search-grade-symbol">${x.symbol}</span><span class="search-grade-name">${x.id==='none'?'未評価':x.label}</span></button>`).join('')}</div></div>`;
  }
  function searchShell(){return `${warning()}<section class="toolbar search-toolbar" aria-label="評価検索の絞り込み"><input class="search-input" id="search" type="search" placeholder="検索" value="${htmlEscape(state.prefs.search)}" autocomplete="off">${searchGradeFilter()}</section><div id="results"></div>`}
  function renderSearchResults(el,all){
    const shown=new Set(state.prefs.searchGrades);
    all=all.filter(p=>shown.has(grade(p.key)));
    // A Pokemon can appear on multiple islands; count and render each occurrence.
    const byArea=AREAS.map(()=>[]);
    for(const p of all){for(const island of islandList(p)){if(Number.isInteger(island)&&island>=0&&island<AREAS.length)byArea[island].push(p)}}
    const levels=[...LEVELS,{id:'none',symbol:'—',label:'未評価'}].filter(x=>shown.has(x.id));
    const total=byArea.reduce((sum,items)=>sum+items.length,0);
    let content=`<div class="section-top overview-heading"><h3>全${AREAS.length}島・全睡眠タイプ</h3><span>延べ${total}件</span></div>`;
    for(let i=0;i<AREAS.length;i++){
      const areaPokemon=byArea[i];
      const groups=[...SLEEP_TYPES];
      // Unexpected future sleep types must not disappear silently from the overview.
      if(areaPokemon.some(p=>!SLEEP_TYPES.some(t=>t.id===p.sleep)))groups.push({id:'不明'});
      const lanes=groups.map(t=>{
        const members=areaPokemon.filter(p=>p.sleep===t.id||(t.id==='不明'&&!SLEEP_TYPES.some(s=>s.id===p.sleep)));
        const priorityRows=levels.map(level=>{
          const group=members.filter(p=>grade(p.key)===level.id);
          if(!group.length)return '';
          return `<div class="priority-row" data-rank-group="${level.id}"><div class="priority-label" data-grade="${level.id}" aria-label="${level.label}"><span>${level.symbol}</span><small>${group.length}</small></div><div class="priority-mons">${group.map(compactCard).join('')}</div></div>`;
        }).join('');
        const empty=shown.size===0?'表示する評価を選択してください':state.master.areasReady?'該当するポケモンなし':'島の出現情報が未登録';
        return `<section class="sleep-column" data-sleep-section="${t.id}"><h5 class="sleep-heading"><span class="sleep-heading-label">${sleepDot(t.id)} ${t.id}</span><small>${members.length}匹</small></h5><div class="sleep-content">${priorityRows||`<div class="sleep-empty">${empty}</div>`}</div></section>`;
      }).join('');
      content+=`<section class="island-panel" data-area-panel="${i}" id="island-${i}"><header class="island-heading"><h4>${AREAS[i]}</h4><span>${areaPokemon.length}匹</span></header><div class="sleep-board">${lanes}</div></section>`;
    }
    patchResults(el,content);
  }

  // Reuse Pokémon cards, including already-decoded images, between updates.
  // Evaluation search requires an island-specific key because the same Pokémon
  // can legitimately appear once in each of several islands.
  const retainedCards=new Map(),MAX_RETAINED_CARDS=1100;
  const resultMarkup=new WeakMap(),islandPanelMarkup=new WeakMap();
  function retainedCardKey(card){
    const candy=card.dataset.familyId;
    if(card.classList.contains('candy-item'))return candy?'candy:'+candy:null;
    const species=card.dataset.key;
    if(!species)return null;
    if(card.classList.contains('mon-card'))return 'dex:'+species;
    if(!card.classList.contains('mini-mon'))return null;
    const island=card.closest('.island-panel')?.dataset.areaPanel;
    return island===undefined?null:'search:'+island+':'+species;
  }
  function iconSignature(card){
    const image=card.querySelector('.pokemon-icon img');
    if(!image)return 'none';
    return image.dataset.spriteSrc||image.getAttribute('src')||'';
  }
  function retainCard(key,card){
    // Retain filtered-out cards for their next appearance, with bounded memory.
    retainedCards.delete(key);
    retainedCards.set(key,{card,source:iconSignature(card)});
    if(retainedCards.size>MAX_RETAINED_CARDS)retainedCards.delete(retainedCards.keys().next().value);
  }
  function patchResults(el,markup){
    if(resultMarkup.get(el)===markup)return; // No DOM updates if data is unchanged.
    const template=document.createElement('template');
    template.innerHTML=markup;
    for(const card of el.querySelectorAll('.mon-card,.mini-mon,.candy-item')){
      const key=retainedCardKey(card);
      if(key)retainCard(key,card);
    }
    // Only rebuild island panels whose source data actually changed. Other
    // islands retain their existing heading, sleep lanes and decoded images.
    for(const incoming of template.content.querySelectorAll('.island-panel')){
      const area=incoming.dataset.areaPanel;
      const original=el.querySelector('.island-panel[data-area-panel="'+area+'"]');
      const signature=incoming.outerHTML;
      if(original&&islandPanelMarkup.get(original)===signature){
        incoming.replaceWith(original);
      }else{
        islandPanelMarkup.set(incoming,signature);
      }
    }
    for(const fresh of template.content.querySelectorAll('.mon-card,.mini-mon,.candy-item')){
      const key=retainedCardKey(fresh);
      if(!key)continue;
      const saved=retainedCards.get(key),source=iconSignature(fresh);
      if(!saved||saved.card===fresh||saved.source!==source)continue; // Same island or changed icon.
      const previous=saved.card;
      if(previous.dataset.grade===fresh.dataset.grade &&
         previous.querySelector('.mon-name,.mini-mon-name,.candy-name')?.textContent===
         fresh.querySelector('.mon-name,.mini-mon-name,.candy-name')?.textContent &&
         (!fresh.classList.contains('candy-item') ||
           previous.querySelector('.candy-item-info small')?.textContent===
           fresh.querySelector('.candy-item-info small')?.textContent &&
           previous.querySelector('.candy-type-tag')?.dataset.type===
           fresh.querySelector('.candy-type-tag')?.dataset.type)){
        fresh.replaceWith(previous); // Preserve the whole unchanged card.
        retainCard(key,previous);
      }else{
        const icon=previous.querySelector('.pokemon-icon');
        const newIcon=fresh.querySelector('.pokemon-icon');
        if(icon&&newIcon)newIcon.replaceWith(icon);
        retainCard(key,fresh); // Rating text may change; icon node never does.
      }
    }
    el.replaceChildren(template.content);
    resultMarkup.set(el,markup);
  }
  function renderResults(){const el=$('#results');if(!el)return;
    if(state.prefs.tab==='candy'){renderCandyResults(el);discoverSprites();return}
    const all=filterPokemon();if(state.prefs.tab==='dex'){
    const markup=`<div class="section-top"><h3>図鑑一覧</h3><span>${all.length}件</span></div>`+(all.length?`<div class="dex-grid">${all.map(card).join('')}</div>`:`<div class="empty-state"><span class="symbol">⌕</span><strong>該当するポケモンがありません</strong>検索や絞り込みを変更してください。</div>`);
    patchResults(el,markup);
  }else renderSearchResults(el,all);
    discoverSprites();
  }
  // Keep the actual decoded <img> elements when switching tabs. Rebuilding
  // innerHTML on every tab switch detached all images and flashed placeholders.
  // Invalidate cached panels whenever ratings, icons, or master data change.
  const shellForTab=()=>state.prefs.tab==='dex'?dexShell():state.prefs.tab==='candy'?candyShell():searchShell();
  const tabPanels=new Map();
  let currentPanelTab=null;
  function render(reusePanels=false,keepLeavingPanel=true){
    const main=$('#main');
    // Keep #results and its icon DOM alive on filters, ratings, manual icons,
    // and master updates. Only toolbar controls and changed cards are rebuilt.
    if(!reusePanels&&currentPanelTab===state.prefs.tab&&main.firstElementChild){
      const panel=main.firstElementChild,results=panel.querySelector('#results');
      const template=document.createElement('template');
      template.innerHTML=shellForTab();
      const freshResults=template.content.querySelector('#results');
      if(results&&freshResults)freshResults.replaceWith(results);
      panel.replaceChildren(template.content);
      // Other tab may display stale ratings/islands after an edit.
      for(const tab of tabPanels.keys())if(tab!==state.prefs.tab)tabPanels.delete(tab);
      renderResults();
      updateRatedCounter();
      return;
    }
    if(!reusePanels){
      tabPanels.clear();
      main.replaceChildren();
    }else if(currentPanelTab){
      if(!keepLeavingPanel)tabPanels.delete(currentPanelTab);
      else if(main.firstElementChild)tabPanels.set(currentPanelTab,main.firstElementChild);
      main.replaceChildren();
    }
    let panel=tabPanels.get(state.prefs.tab);
    const newPanel=!panel;
    if(!panel){
      panel=document.createElement('div');
      panel.dataset.tabPanel=state.prefs.tab;
      panel.innerHTML=shellForTab();
      tabPanels.set(state.prefs.tab,panel);
    }
    main.append(panel);
    currentPanelTab=state.prefs.tab;
    for(const el of document.querySelectorAll('.nav-button')){
      const active=el.dataset.tab===state.prefs.tab;
      el.classList.toggle('active',active);
      el.setAttribute('aria-current',active?'page':'false');
    }
    if(newPanel)renderResults();
    else discoverSprites(); // Resume incomplete icons when reattaching a cached tab.
    updateRatedCounter();
  }
  function dialogOpen(id){const d=$(id);if(!d.open)d.showModal()}
  function dialogClose(id){const d=$(id);if(d.open)d.close()}
  // Standard icons have no src until they enter the cache-first image queue.
  // A closed <dialog> is not visible to IntersectionObserver; start loading
  // explicitly after showModal(), including when the open modal is refreshed.
  function activateDetailSprite(){
    const img=$('#details-body img[data-sprite-src]');
    if(!img)return; // Custom uploaded images already have a local src.
    if(spriteObserver)spriteObserver.unobserve(img);
    enqueueSprite(img);
  }
  function selected(){return getPokemon().find(p=>p.key===state.selected)}
  function details(){const p=selected();if(!p)return;const g=grade(p.key),islands=islandList(p),custom=Object.hasOwn(state.overrides,p.key);$('#details-body').innerHTML=`<div class="sheet-grip"></div><div class="sheet-top"><div class="subtle">No. ${String(p.id).padStart(4,'0')}　${htmlEscape(p.sleep)}</div><button class="close-button" data-action="close-details" aria-label="閉じる">×</button></div><div class="sheet-pokemon">${iconMarkup(p)}<div><h2>${htmlEscape(p.name)}</h2><p>${islands.length?islands.map(x=>AREAS[x]).join(' / '):'出現島の情報は未設定'}</p></div></div><p class="field-label">厳選優先度を選択</p><div class="grade-options">${LEVELS.map(x=>`<button class="grade-choice ${g===x.id?'active':''}" data-action="rate" data-grade="${x.id}" aria-pressed="${g===x.id}"><span>${x.symbol}</span><span>${x.label}</span></button>`).join('')}</div><div class="sheet-actions"><button class="secondary-button" data-action="unrate">未評価に戻す</button><button class="secondary-button" data-action="upload-icon">アイコン変更</button>${state.icons.has(p.key)?'<button class="secondary-button" data-action="reset-icon">画像解除</button>':''}</div><details><summary>出現する島を手動で修正 ${custom?'（手動設定中）':''}</summary><div class="island-options">${AREAS.map((a,i)=>`<label class="island-option"><input type="checkbox" data-action="island-toggle" data-island="${i}" ${islands.includes(i)?'checked':''}> ${htmlEscape(a)}</label>`).join('')}</div><button class="secondary-button" data-action="reset-islands">マスターの島データに戻す</button><p class="small-note">手動で変更した島の設定は、マスターが更新されても維持されます。</p></details><p class="small-note">優先度やアップロード画像はこの端末に保存されます。端末移行には設定からバックアップしてください。</p>`;
    if($('#details').open)activateDetailSprite();
  }
  function settings(){const stamp=state.master.updatedAt||'不明';const mapped=getPokemon().filter(p=>islandList(p).length).length;$('#settings-body').innerHTML=`<div class="sheet-grip"></div><div class="sheet-top"><h2>設定・データ管理</h2><button class="close-button" data-action="close-settings" aria-label="閉じる">×</button></div><div class="setting-block"><h3>ポケモンマスター</h3><p>${getPokemon().length}件 / 島が設定済み ${mapped}件<br>更新日時：${htmlEscape(stamp)}<br>島別マスター：${state.master.areasReady?'取得済み':'未取得（初期データ）'}<br>外部更新：${state.status?htmlEscape(state.status):'起動時に確認'}</p><div class="setting-actions"><button class="primary-button" data-action="sync">最新データを確認</button></div><p class="small-note">公開後はGitHub Actionsで毎日マスターを検証・更新します。新規ポケモンの図鑑登録はオンライン時に直接確認も行います。</p></div><div class="setting-block"><h3>バックアップ・復元</h3><p>厳選評価・ウッウロボの投入優先度・島設定・登録画像をJSONに保存します。</p><div class="setting-actions"><button class="secondary-button" data-action="backup">バックアップ保存</button><button class="secondary-button" data-action="restore">バックアップ読込</button></div></div><div class="setting-block"><h3>情報・注意</h3><p>このツールは非公式の個人用ファンツールです。ポケモンアイコンはPokeAPI Spritesから取得し、表示できた画像はオフライン用にキャッシュします。リージョンのすがたは専用画像IDを使い、画像が未提供なら名前を表示します。画像は個別にアップロードできます。標準画像はゲーム内の専用アイコンと同一とは限りません。ウッウロボの特殊要素には原作の形態、伝説・幻、通常形態の追加進化待ちを含み、ポケモンスリープでの実装済みを意味するものではありません。</p><button class="secondary-button danger-button" data-action="clear-ratings">すべての評価を消去</button></div>`}
  function updateGrade(k,g){
    const previous=grade(k);
    if(g==='none')delete state.ratings[k];else state.ratings[k]=g;
    if(!setLocal(KEYS.ratings,state.ratings)){
      if(previous==='none')delete state.ratings[k];else state.ratings[k]=previous;
      return;
    }
    render();dialogClose('#details');
    toast(g==='none'?'未評価に戻しました':`厳選優先度を ${gradeInfo(g).symbol} に変更しました`);
  }
  function quickRate(button){
    const k=button.dataset.key,requested=button.dataset.grade;
    if(!GRADE_IDS.has(requested)||!getPokemon().some(p=>p.key===k))return;
    const previous=grade(k),next=previous===requested?'none':requested;
    if(next==='none')delete state.ratings[k];else state.ratings[k]=next;
    // Prevent the screen from claiming a saved grade if persistent storage failed.
    if(!setLocal(KEYS.ratings,state.ratings)){
      if(previous==='none')delete state.ratings[k];else state.ratings[k]=previous;
      return;
    }
    // A filtered card can leave the current results after changing its grade.
    if(state.prefs.tab!=='dex'||(state.prefs.grade!=='all'&&state.prefs.grade!==next)){
      renderResults();
    }else{
      const card=button.closest('.mon-card'),label=gradeInfo(next);
      if(card){
        card.dataset.grade=next;
        const badge=card.querySelector('.grade-label');
        badge.dataset.grade=next;
        badge.textContent=`${label.symbol} ${label.label}`;
        for(const b of card.querySelectorAll('.quick-grade')){
          const active=b.dataset.grade===next;
          b.classList.toggle('active',active);
          b.setAttribute('aria-pressed',String(active));
          const level=gradeInfo(b.dataset.grade);
          b.setAttribute('aria-label',`${card.querySelector('.mon-name').textContent}：${level.symbol}（${level.label}）${active?'を解除':'に設定'}`);
          b.title=`${level.label}${active?'（もう一度押すと解除）':''}`;
        }
      }
    }
    // Keep markup comparisons honest after direct in-place quick grade edits.
    const results=$('#results');if(results)resultMarkup.delete(results);
    // Ratings displayed by the detached search panel are now stale.
    tabPanels.delete('search');
    const counter=$('#rated-count');if(counter)counter.textContent=countRated();
  }
  function switchTab(tab){
    if(!['dex','search','candy'].includes(tab)||tab===state.prefs.tab)return;
    // The search is reset on tab switches; never reuse a filtered panel.
    const keepLeavingPanel=!state.prefs.search;
    state.prefs.tab=tab;state.prefs.search='';save();
    render(true,keepLeavingPanel);
    window.scrollTo({top:0,behavior:'instant'});
  }
  async function openDB(){if(!('indexedDB'in window))throw Error('IndexedDB is unavailable');if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('gense-note-icons',1);req.onupgradeneeded=()=>req.result.createObjectStore('icons');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise}
  async function dbAction(mode,action){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('icons',mode);
      let result;
      tx.oncomplete=()=>resolve(result); // A successful request is NOT a committed transaction.
      tx.onerror=()=>reject(tx.error||Error('Icon transaction failed'));
      tx.onabort=()=>reject(tx.error||Error('Icon transaction aborted'));
      try{
        const request=action(tx.objectStore('icons'));
        if(request)request.onsuccess=()=>{result=request.result};
      }catch(error){try{tx.abort()}catch{}reject(error)}
    });
  }
  async function replaceIconsAtomically(entries){
    const db=await openDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('icons','readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||Error('Icon restore failed'));
      tx.onabort=()=>reject(tx.error||Error('Icon restore aborted'));
      try{
        const store=tx.objectStore('icons');
        store.clear();
        for(const [key,value] of entries)store.put(value,key);
      }catch(error){try{tx.abort()}catch{}reject(error)}
    });
  }
  async function loadIcons(){
    try{
      const db=await openDB();
      // A single IndexedDB transaction replaces one transaction per image.
      const entries=await new Promise((resolve,reject)=>{
        const tx=db.transaction('icons','readonly'),items=[];
        const req=tx.objectStore('icons').openCursor();
        req.onsuccess=()=>{
          const cursor=req.result;
          if(cursor){items.push([cursor.key,cursor.value]);cursor.continue();}
        };
        tx.oncomplete=()=>resolve(items);
        tx.onerror=()=>reject(tx.error||Error('Icon read failed'));
        tx.onabort=()=>reject(tx.error||Error('Icon read aborted'));
      });
      for(const [key,value] of entries){
        if(typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(value))state.icons.set(key,value);
      }
    }catch(e){console.warn('Custom icon storage unavailable',e)}
    finally{iconsReady=true;}
  }
  async function setIcon(key,value){try{if(value){await dbAction('readwrite',s=>s.put(value,key));state.icons.set(key,value)}else{await dbAction('readwrite',s=>s.delete(key));state.icons.delete(key)}render();if(state.selected===key&&$('#details').open)details();toast(value?'アイコンを変更しました':'標準アイコンに戻しました')}catch(e){toast('アイコン保存に失敗しました')}}
  function imageAsDataURL(file){return new Promise((resolve,reject)=>{if(!file||file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))return reject(Error('PNG・JPEG・WebP、8MB以内の画像を指定してください'));const url=URL.createObjectURL(file);const img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');const scale=Math.min(128/img.width,128/img.height);const w=img.width*scale,h=img.height*scale;ctx.clearRect(0,0,128,128);ctx.drawImage(img,(128-w)/2,(128-h)/2,w,h);const data=canvas.toDataURL('image/png');URL.revokeObjectURL(url);resolve(data)}catch(e){URL.revokeObjectURL(url);reject(e)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('画像を読み込めませんでした'))};img.src=url})}
  async function handleIconInput(file){const p=selected();if(!p)return;try{const data=await imageAsDataURL(file);await setIcon(p.key,data)}catch(e){toast(e.message||'画像処理に失敗しました')}}
  function downloadJSON(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function backup(){downloadJSON({app:'pokesleep-priority',version:1,date:new Date().toISOString(),ratings:state.ratings,overrides:state.overrides,candyRatings:state.candyRatings,icons:Object.fromEntries(state.icons)},`gense-note-backup-${nowJST()}.json`);toast('バックアップファイルを保存しました')}
  function sanitizedRatings(obj){const safe={};if(obj&&typeof obj==='object'&&!Array.isArray(obj)){for(const [k,v] of Object.entries(obj))if(/^\d+:[A-Za-z0-9 _-]+$/.test(k)&&GRADE_IDS.has(v))safe[k]=v}return safe}
  function sanitizedOverrides(obj){const safe={};if(obj&&typeof obj==='object'&&!Array.isArray(obj)){for(const [k,v] of Object.entries(obj))if(/^\d+:[A-Za-z0-9 _-]+$/.test(k)&&Array.isArray(v))safe[k]=[...new Set(v.filter(n=>Number.isInteger(n)&&n>=0&&n<9))].sort((a,b)=>a-b)}return safe}
  async function restore(file){
    if(!file)return;
    if(file.size>30*1024*1024){toast('30MB以下のJSONを指定してください');return}
    try{
      const input=JSON.parse(await file.text());
      if(input.app!=='pokesleep-priority'||input.version!==1)throw Error('このアプリのバックアップではありません');
      // A truncated/altered file must never silently clear ratings or all
      // uploaded icons. Reject the entire restore before touching storage.
      const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
      if(!isRecord(input.ratings)||!isRecord(input.overrides)||!isRecord(input.icons))
        throw Error('バックアップ項目が欠けているか不正です');
      const candidates=Object.entries(input.icons);
      if(candidates.some(([key,value])=>
        !/^\d+:[A-Za-z0-9 _-]+$/.test(key)||typeof value!=='string'||value.length>450000
        ||!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value)))
        throw Error('バックアップ内のアイコン情報が不正です');
      if(Object.entries(input.ratings).some(([key,value])=>
        !/^\d+:[A-Za-z0-9 _-]+$/.test(key)||!GRADE_IDS.has(value)))
        throw Error('バックアップ内の評価情報が不正です');
      if(Object.entries(input.overrides).some(([key,islands])=>
        !/^\d+:[A-Za-z0-9 _-]+$/.test(key)||!Array.isArray(islands)
        ||islands.some(n=>!Number.isInteger(n)||n<0||n>=AREAS.length)))
        throw Error('バックアップ内の島設定が不正です');
      // v1 backups created before the candy feature intentionally omit
      // candyRatings. Preserve current candy choices when importing them.
      const hasCandy=Object.hasOwn(input,'candyRatings');
      if(hasCandy&&(!isRecord(input.candyRatings)||Object.entries(input.candyRatings).some(
        ([key,value])=>!/^(?:[1-9]\d*|pending:[1-9]\d*)$/.test(key)||!CANDY_IDS.has(value))))
        throw Error('バックアップ内のウッウロボ優先度が不正です');
      const restoredCandy=hasCandy?input.candyRatings:state.candyRatings;
      const ratings=sanitizedRatings(input.ratings),overrides=sanitizedOverrides(input.overrides);
      if(!confirm('現在の厳選優先度・手動設定をバックアップの内容に置き換えます。続けますか？'))return;
      const formerRatings=state.ratings,formerOverrides=state.overrides,formerCandy=state.candyRatings;
      if(!setLocal(KEYS.ratings,ratings))throw Error('評価を保存できませんでした');
      if(!setLocal(KEYS.overrides,overrides)){
        setLocal(KEYS.ratings,formerRatings);
        throw Error('島設定を保存できませんでした');
      }
      if(!setLocal(KEYS.candy,restoredCandy)){
        setLocal(KEYS.ratings,formerRatings);
        setLocal(KEYS.overrides,formerOverrides);
        throw Error('ウッウロボ優先度を保存できませんでした');
      }
      try{
        // One transaction: either ALL icons are replaced or NONE are.
        // On failure IndexedDB rolls back clear() and all put() calls.
        await replaceIconsAtomically(candidates);
      }catch(error){
        setLocal(KEYS.ratings,formerRatings);
        setLocal(KEYS.overrides,formerOverrides);
        setLocal(KEYS.candy,formerCandy);
        throw error;
      }
      state.ratings=ratings;state.overrides=overrides;state.candyRatings=restoredCandy;
      state.icons=new Map(candidates);
      dialogClose('#settings-dialog');render();toast('バックアップを復元しました');
    }catch(error){toast(`復元失敗：${error.message||'JSON形式を確認してください'}`)}
  }
  async function fetchJSON(url){const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(14000)});if(!res.ok)throw Error(`HTTP ${res.status}`);return res.json()}
  function mergeMaster(next){
    if(!validMaster(next))return 0;
    const old=state.master;
    // A stale Pages/Service Worker response must not downgrade local data.
    const oldTime=Date.parse(old.updatedAt||''),nextTime=Date.parse(next.updatedAt||'');
    if(old.areasReady&&next.areasReady&&Number.isFinite(oldTime)&&Number.isFinite(nextTime)&&nextTime<oldTime)return 0;
    let updated=0;
    const oldMap=new Map(old.pokemon.map(p=>[p.key,p]));const newer=canonicalizePokemon(next.pokemon).map(p=>{
      const prior=oldMap.get(p.key);
      if(!prior){updated++;return p}
      // A species-only seed must never erase previously validated island data.
      if(old.areasReady&&(!next.areasReady||
        (!p.islands?.length&&prior.islands?.length))){
        return {...p,islands:prior.islands};
      }
      return p;
    });
    for(const p of old.pokemon)if(!newer.some(x=>x.key===p.key))newer.push(p); // temporary upstream omissions should not erase user entries
    const candidate={...next,pokemon:canonicalizePokemon(newer),areasReady:Boolean(next.areasReady||old.areasReady)};
    if(old.areasReady&&!next.areasReady)candidate.updatedAt=old.updatedAt;
    // Do not claim new data is available if persistent storage failed.
    if(!setLocal(KEYS.master,candidate))return 0;
    state.master=candidate;
    const visibleDataChanged=Boolean(old.areasReady)!==Boolean(candidate.areasReady)
      ||JSON.stringify(old.pokemon)!==JSON.stringify(candidate.pokemon);
    if(visibleDataChanged){render();resolveRegionalSprites()}
    else if($('#settings-dialog').open)settings();
    return updated;
  }
  const MASTER_CHECK_KEY='gense-note-master-check-v1';
  function masterCheckSlot(){
    // Scheduled update is around 04:17 JST; refresh after 04:45 as well.
    const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
    return nowJST()+(time>='04:45'?'-post':'-pre');
  }
  function shouldCheckMaster(force=false){
    if(force)return true;
    const previous=fromLocal(MASTER_CHECK_KEY,{}),slot=masterCheckSlot();
    // A delayed GitHub schedule can finish after the first 04:45 check.
    // Recheck at most every 6h on success (30min after failure), never on
    // every app launch; this also avoids day-long stale island snapshots.
    const age=Date.now()-Number(previous.time||0);
    const interval=previous.ok?6*60*60*1000:30*60*1000;
    return previous.slot!==slot||!Number.isFinite(age)||age<0||age>=interval;
  }
  function mergeCandyMaster(incoming){
    if(!validCandyMaster(incoming))return false;
    const older=Date.parse(state.candyMaster?.updatedAt||'');
    const newer=Date.parse(incoming.updatedAt||'');
    if(Number.isFinite(older)&&Number.isFinite(newer)&&newer<older)return false;
    if(JSON.stringify(state.candyMaster?.families)===JSON.stringify(incoming.families))return true;
    // A new species may have been temporarily shown as "unconfirmed".
    // Complete its saved-priority migration BEFORE switching the mapping.
    const priorChoices=state.candyRatings,changed={...priorChoices},migration=new Map();
    for(const f of incoming.families)for(const id of f.members)migration.set(id,String(f.id));
    for(const [key,value] of Object.entries(changed)){
      const match=/^pending:(\d+)$/.exec(key);
      if(!match)continue;
      const target=migration.get(Number(match[1]));
      if(!target)continue;
      if(!CANDY_IDS.has(changed[target]))changed[target]=value;
      delete changed[key];
    }
    const choicesChanged=JSON.stringify(changed)!==JSON.stringify(priorChoices);
    if(choicesChanged&&!setLocal(KEYS.candy,changed))return false;
    if(!setLocal(KEYS.candyMaster,incoming)){
      if(choicesChanged)setLocal(KEYS.candy,priorChoices);
      return false;
    }
    state.candyMaster=incoming;
    if(choicesChanged)state.candyRatings=changed;
    if(state.prefs.tab==='candy')render();
    return true;
  }
  async function refreshMaster(force=false){
    if(loadingMaster||!shouldCheckMaster(force))return;
    loadingMaster=true;
    const checkSlot=masterCheckSlot();
    const previousStatus=state.status;state.status='確認中';let errors=[];let newCount=0;let siteUpdate=false;
    try{const latest=await fetchJSON(`./data/master.json?v=${Date.now()}`);if(validMaster(latest)){newCount+=mergeMaster(latest);siteUpdate=true}else errors.push('公開マスターの検証に失敗')}catch(e){errors.push('公開マスターを取得できません')}
    try{
      const candy=await fetchJSON(`./data/candy-master.json?v=${Date.now()}`);
      if(!mergeCandyMaster(candy))errors.push('アメマスターの検証に失敗');
    }catch(e){errors.push('アメマスターを取得できません')}
    // Netlify fallback only when no validated static master exists. Do not replace
    // an already verified offline 9-island snapshot with an older live result.
    const today=nowJST();
    const lastAreaCheck=fromLocal('gense-note-area-check','');
    if(!state.master.areasReady&&(force||lastAreaCheck!==today)&&location.protocol.startsWith('http')&&!location.host.endsWith('.github.io')){
      try{const live=await fetchJSON('/.netlify/functions/master');if(!live.areasReady||!validMaster(live))throw Error('Validation rejected');newCount+=mergeMaster(live);siteUpdate=true;setLocal('gense-note-area-check',today)}
      catch(e){errors.push('島マスターのサーバー確認に失敗')}
    }
    // Supplement only NEW species when the deployed static master has not yet rebuilt.
    // Island mapping is set only by a validated scheduled Wiki rebuild, not guessed.
    const lastCheck=fromLocal('gense-note-upstream-check','');
    if(force||lastCheck!==today){try{const base='https://raw.githubusercontent.com/nitoyon/pokesleep-tool/main/';const [sp,ja]=await Promise.all([fetchJSON(base+'src/data/pokemon.json'),fetchJSON(base+'src/i18n/ja/pokemons.json')]);if(!Array.isArray(sp)||!ja?.pokemons)throw Error('upstream schema');const originalPokemon=state.master.pokemon.slice(),known=new Set(getPokemon().map(p=>p.key));let inserts=0;
      for(const p of sp){if(!Number.isInteger(p.id)||!p.name||p.arrival&&p.arrival>today)continue;const key=`${p.id}:${p.form||'default'}`;if(!isIncludedPokemonKey(key)||known.has(key))continue;const sleep={dozing:'うとうと',snoozing:'すやすや',slumbering:'ぐっすり'}[p.sleepType]||'不明';const name=ja.pokemons[p.name]||p.name;state.master.pokemon.push({key,id:p.id,name,sleep,form:p.form||'',islands:[]});known.add(key);inserts++}
      if(inserts){
         state.master.pokemon.sort((a,b)=>a.id-b.id||a.key.localeCompare(b.key));
         if(setLocal(KEYS.master,state.master)){render();resolveRegionalSprites()}
         else{state.master.pokemon=originalPokemon;inserts=0}
       }newCount+=inserts;setLocal('gense-note-upstream-check',today);
    }catch(e){errors.push('新種の直接確認に失敗')}}
    setLocal(MASTER_CHECK_KEY,{slot:checkSlot,time:Date.now(),ok:siteUpdate});
    state.status=siteUpdate?(state.master.areasReady?'島別マスターの確認完了':'図鑑マスターの確認完了'):'オンライン取得できませんでした';if(newCount)state.status+=` / 新規${newCount}件`;
    loadingMaster=false;
    if($('#settings-dialog').open)settings();if(force)toast(errors.length?`確認完了（一部取得失敗：${errors.length}件）`:(newCount?`新規${newCount}件を追加しました`:'最新データを確認しました'));
  }
  document.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-action]');if(!b||b.type==='checkbox')return;const action=b.dataset.action;
    if(action==='tab')switchTab(b.dataset.tab);
    if(action==='pokemon'){state.selected=b.dataset.key;details();dialogOpen('#details');activateDetailSprite()}
    if(action==='quick-rate')quickRate(b)
    if(action==='candy-detail'){state.selectedCandy=b.dataset.familyId;candyDetails();dialogOpen('#candy-details')}
    if(action==='candy-quick-rate')quickCandyRate(b);
    if(action==='close-candy')dialogClose('#candy-details');
    if(action==='candy-rate')setCandyChoice(state.selectedCandy,b.dataset.tier);
    if(action==='settings'){settings();dialogOpen('#settings-dialog')}
    if(action==='close-details')dialogClose('#details');
    if(action==='close-settings')dialogClose('#settings-dialog');
    if(action==='rate'&&selected())updateGrade(state.selected,b.dataset.grade);
    if(action==='unrate'&&selected())updateGrade(state.selected,'none');
    if(action==='grade'){state.prefs.grade=b.dataset.value;save();render()}
    if(action==='search-grade-toggle'&&SEARCH_GRADE_IDS.includes(b.dataset.grade)){const chosen=new Set(state.prefs.searchGrades);if(chosen.has(b.dataset.grade))chosen.delete(b.dataset.grade);else chosen.add(b.dataset.grade);state.prefs.searchGrades=SEARCH_GRADE_IDS.filter(g=>chosen.has(g));save();render()}
    if(action==='search-grade-preset'){if(b.dataset.preset==='all')state.prefs.searchGrades=[...SEARCH_GRADE_IDS];else if(b.dataset.preset==='none')state.prefs.searchGrades=[];else return;save();render()}
    if(action==='sleep'){state.prefs.sleep=b.dataset.value;save();render()}
    if(action==='candy-tier-filter'){state.prefs.candyTier=b.dataset.value;save();render()}
    if(action==='candy-special-filter'&&['all','any','none'].includes(b.dataset.value)){state.prefs.candySpecial=b.dataset.value;save();render()}
    if(action==='candy-kind-filter'&&['all',...Object.keys(CANDY_KINDS)].includes(b.dataset.value)){state.prefs.candyKind=b.dataset.value;save();render()}
    if(action==='upload-icon')$('#icon-input').click();
    if(action==='reset-icon'&&state.selected)await setIcon(state.selected,null);
    if(action==='reset-islands'&&state.selected){
       const key=state.selected,previous=state.overrides[key],hadOverride=Object.hasOwn(state.overrides,key);
       delete state.overrides[key];
       if(!setLocal(KEYS.overrides,state.overrides)){
         if(hadOverride)state.overrides[key]=previous;
       }else{render();details();toast('自動マスターの島設定に戻しました')}
     }
    if(action==='sync')await refreshMaster(true);
    if(action==='backup')backup();
    if(action==='restore')$('#restore-input').click();
    if(action==='clear-ratings'){
      if(confirm('厳選優先度をすべて消去します。バックアップがない場合、元に戻せません。実行しますか？')){
        if(setLocal(KEYS.ratings,{})){
          state.ratings={};render();settings();toast('評価をすべて消去しました');
        }
      }
    }
  });
  document.addEventListener('change',ev=>{
    const b=ev.target;
    if(b.dataset.action==='island-toggle'&&state.selected){
      const p=selected(),idx=Number(b.dataset.island);
      if(!p||!Number.isInteger(idx))return;
      const previous=state.overrides[p.key],hadOverride=Object.hasOwn(state.overrides,p.key);
      let islands=Array.isArray(previous)?[...previous]:[...p.islands];
      if(b.checked&&!islands.includes(idx))islands.push(idx);
      if(!b.checked)islands=islands.filter(i=>i!==idx);
      state.overrides[p.key]=islands.sort((a,b)=>a-b);
      if(!setLocal(KEYS.overrides,state.overrides)){
        if(hadOverride)state.overrides[p.key]=previous;else delete state.overrides[p.key];
        b.checked=!b.checked;
        return;
      }
      render();
    }
  });
  let searchRenderTimer=null;
  document.addEventListener('input',ev=>{
    if(ev.target.id==='search'){
      state.prefs.search=ev.target.value;
      save();clearTimeout(searchRenderTimer);
      // Avoid rebuilding all 27 sections for each intermediate keystroke.
      searchRenderTimer=setTimeout(()=>{searchRenderTimer=null;renderResults()},120);
    }
  });
  function setIconDisplayState(img,loaded){
    const container=img.closest('.pokemon-icon');
    if(!container)return;
    container.classList.remove(loaded?'broken':'icon-ready');
    container.classList.add(loaded?'icon-ready':'broken');
    const fallback=container.querySelector?.('.fallback');
    if(fallback){
      // Clear the actual text, not just its CSS visibility. A loaded icon
      // can never overlap its own placeholder, even with transparent PNGs.
      fallback.textContent=loaded?'':fallback.dataset.fallback||'';
      fallback.style.display=loaded?'none':'flex';
    }
  }
  document.addEventListener('error',ev=>{
    if(ev.target instanceof HTMLImageElement)setIconDisplayState(ev.target,false);
  },true);
  document.addEventListener('load',ev=>{
    if(!(ev.target instanceof HTMLImageElement))return;
    setIconDisplayState(ev.target,true);
    if(ev.target.closest('.pokemon-icon'))saveLoadedSprite(ev.target);
  },true);
  $('#icon-input').addEventListener('change',async ev=>{await handleIconInput(ev.target.files?.[0]);ev.target.value=''});
  $('#restore-input').addEventListener('change',async ev=>{await restore(ev.target.files?.[0]);ev.target.value=''});
  ['#details','#settings-dialog','#candy-details'].forEach(id=>$(id).addEventListener('click',ev=>{if(ev.target===$(id))dialogClose(id)}));
  window.addEventListener('storage',ev=>{if(ev.key===KEYS.ratings)state.ratings=fromLocal(KEYS.ratings,{});if(ev.key===KEYS.overrides)state.overrides=fromLocal(KEYS.overrides,{});if(ev.key===KEYS.candy)state.candyRatings=fromLocal(KEYS.candy,{});render()});
  // A full browser reload necessarily creates new DOM. Prime above-the-fold
  // cached sprites before initial render to avoid visible placeholder flashes.
  // This only reads local CacheStorage, never introduces extra network loads.
  async function warmStartupSprites(){
    let candidates=filterPokemon();
    if(state.prefs.tab==='search'){
      const shown=new Set(state.prefs.searchGrades);
      candidates=candidates.filter(p=>shown.has(grade(p.key))&&islandList(p).length);
    }
    const urls=new Set();
    for(const p of candidates){
      if(state.icons.has(p.key))continue;
      const id=spriteId(p);
      if(id)urls.add(pngIcon(id));
      if(urls.size>=14)break;
    }
    const locallyCached=await Promise.all([...urls].map(url=>cachedSpriteBlobURL(url)));
    // Decode cached images off-DOM so the browser does not paint empty boxes
    // before their first on-screen decode. Keep this bounded for launch speed.
    if(typeof Image==='function'){
      const decode=Promise.all(locallyCached.filter(Boolean).map(async src=>{
        const image=new Image();
        image.src=src;
        if(typeof image.decode==='function')await image.decode().catch(()=>{});
      }));
      await Promise.race([decode,new Promise(resolve=>setTimeout(resolve,250))]);
    }
  }
  async function start(){
    await loadIcons();
    await warmStartupSprites();
    render();
    refreshMaster(false);
    resolveRegionalSprites();
  }
  start().catch(err=>console.warn('Initialization error',err));
  if('serviceWorker'in navigator&&location.protocol.startsWith('http')){
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
      // Do not defer CSS corrections behind an old cached SW script.
      // Ratings and uploaded icons are outside CacheStorage and untouched.
      reg.update().catch(()=>{});
      return navigator.serviceWorker.ready;
    }).then(()=>{
      // Catch sprites which loaded before the first Service Worker activation.
      document.querySelectorAll('.pokemon-icon img').forEach(img=>{
        if(img.complete&&img.naturalWidth>0)saveLoadedSprite(img);
      });
    }).catch(err=>console.warn('SW unavailable',err));
  }
})();
