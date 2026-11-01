'use strict';
/* No third-party JS, no analytics, no external account. All personal ratings stay in this browser. */
(() => {
  const KEYS={ratings:'gense-note-ratings-v1',overrides:'gense-note-islands-v1',prefs:'gense-note-prefs-v1',master:'gense-note-master-v1'};
  const AREAS=['ワカクサ本島','シアンの砂浜','トープ洞窟','ウノハナ雪原','ラピスラズリ湖畔','ゴールド旧発電所','アンバー渓谷','ワカクサ本島 EX','シアンの砂浜 EX'];
  // Field header imagery is hosted in the app itself, not fetched on each visit.
  const LEVELS=[{id:'star',symbol:'☆',label:'最優先'},{id:'double',symbol:'◎',label:'高優先'},{id:'circle',symbol:'○',label:'優先'},{id:'triangle',symbol:'△',label:'低優先'},{id:'cross',symbol:'×',label:'不要'}];
  const GRADE_IDS=new Set(LEVELS.map(x=>x.id));
  const SLEEP_TYPES=[{id:'うとうと'},{id:'すやすや'},{id:'ぐっすり'}];
  const sleepDot=type=>`<span class="sleep-type-dot" data-sleep="${htmlEscape(type)}" aria-hidden="true"></span>`;
  const SEARCH_GRADE_IDS=[...LEVELS.map(x=>x.id),'none'];
  const DEFAULT_PREFS={tab:'dex',search:'',sleep:'all',grade:'all',area:0,onlyRated:true,searchGrades:null};
  const masterSeed=window.__SEED_MASTER__;
  const $=(s,root=document)=>root.querySelector(s);
  const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Match only from the beginning of a name; hiragana and katakana are equivalent.
  // NFKC also accepts half-width katakana, and NFC composes combining dakuten.
  const normalize=s=>String(s||'').normalize('NFKC').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)).normalize('NFC').replace(/[\s　]/g,'').toLocaleLowerCase('ja');
  function fromLocal(key,fallback){try{const data=JSON.parse(localStorage.getItem(key));return data===null?fallback:data}catch{return fallback}}
  function setLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{toast('保存容量が不足しています。バックアップを作成してください');return false}}
  function validMaster(x){return x&&x.schema===1&&Array.isArray(x.pokemon)&&x.pokemon.length>=200&&x.pokemon.every(p=>p&&typeof p.key==='string'&&/^\d+:[A-Za-z0-9 _-]+$/.test(p.key)&&Number.isInteger(p.id)&&typeof p.name==='string'&&Array.isArray(p.islands));}
  const last=fromLocal(KEYS.master,null);
  const savedMaster=validMaster(last)?last:masterSeed;
  // Bundled 9-island seed should immediately upgrade an older species-only
  // cache, including on an offline launch. Preserve any newly added species.
  const base=validMaster(savedMaster)?savedMaster:masterSeed;
  const bundled=validMaster(masterSeed)&&masterSeed.areasReady&&!base.areasReady;
  const master=bundled?{
    ...masterSeed,pokemon:[...masterSeed.pokemon,...base.pokemon.filter(p=>!masterSeed.pokemon.some(x=>x.key===p.key))]
  }:base;
  const prefs={...DEFAULT_PREFS,...fromLocal(KEYS.prefs,{})};
  if(!['dex','search'].includes(prefs.tab))prefs.tab='dex';
  if(!Number.isInteger(prefs.area)||prefs.area<0||prefs.area>8)prefs.area=0;
  // Migrate v0.1.2's onlyRated preference without changing any stored ratings.
  // An explicitly saved empty array means 'show no grades', not 'reset filter'.
  prefs.searchGrades=Array.isArray(prefs.searchGrades)
    ? [...new Set(prefs.searchGrades.filter(g=>SEARCH_GRADE_IDS.includes(g)))]
    : SEARCH_GRADE_IDS.filter(g=>g!=='none'||prefs.onlyRated===false);
  const state={master,ratings:fromLocal(KEYS.ratings,{}),overrides:fromLocal(KEYS.overrides,{}),prefs,icons:new Map(),selected:null,status:'',imageBusy:false};
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
    // Only manual icons load immediately. Remote sprites enter a visible-only,
    // rate-limited queue; their network requests are additionally governed by SW.
    const tag=custom?`<img src="${htmlEscape(custom)}" alt="" decoding="async">`
      :src?`<img data-sprite-src="${htmlEscape(src)}" alt="" decoding="async" referrerpolicy="no-referrer">`:'';
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
      if(img.dataset.spriteState)return;
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
    img.src=local;
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
  function chips(options,value,action,attr='value'){return `<div class="chips">${options.map(x=>`<button type="button" class="chip ${value===x.id?'active':''}" data-action="${action}" data-${attr}="${htmlEscape(x.id)}" ${x.grade?`data-grade="${x.grade}"`:''} aria-pressed="${value===x.id?'true':'false'}">${x.text}</button>`).join('')}</div>`}
  function filterPokemon(){const {search,sleep,grade:filterGrade}=state.prefs;const prefix=normalize(search);return getPokemon().filter(p=>{
    if(prefix&&!normalize(p.name).startsWith(prefix)&&!String(p.id).startsWith(prefix))return false;
    if(state.prefs.tab==='dex'&&sleep!=='all'&&p.sleep!==sleep)return false;
    if(state.prefs.tab==='dex'&&filterGrade!=='all'&&grade(p.key)!==filterGrade)return false;
    return true;
  });}
  function countRated(){return getPokemon().filter(p=>grade(p.key)!=='none').length}
  function updateRatedCounter(){const counter=$('#rated-count');if(counter)counter.textContent=countRated();const total=$('#total-count');if(total)total.textContent=getPokemon().length;}
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
    el.innerHTML=content;
  }
  function renderResults(){const el=$('#results');if(!el)return;const all=filterPokemon();if(state.prefs.tab==='dex'){
    el.innerHTML=`<div class="section-top"><h3>図鑑一覧</h3><span>${all.length}件</span></div>`+(all.length?`<div class="dex-grid">${all.map(card).join('')}</div>`:`<div class="empty-state"><span class="symbol">⌕</span><strong>該当するポケモンがありません</strong>検索や絞り込みを変更してください。</div>`);
  }else renderSearchResults(el,all);
    discoverSprites();
  }
  function render(){const main=$('#main');main.innerHTML=state.prefs.tab==='dex'?dexShell():searchShell();for(const el of document.querySelectorAll('.nav-button')){const active=el.dataset.tab===state.prefs.tab;el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false')}renderResults();updateRatedCounter()}
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
  function settings(){const stamp=state.master.updatedAt||'不明';const mapped=getPokemon().filter(p=>islandList(p).length).length;$('#settings-body').innerHTML=`<div class="sheet-grip"></div><div class="sheet-top"><h2>設定・データ管理</h2><button class="close-button" data-action="close-settings" aria-label="閉じる">×</button></div><div class="setting-block"><h3>ポケモンマスター</h3><p>${getPokemon().length}件 / 島が設定済み ${mapped}件<br>更新日時：${htmlEscape(stamp)}<br>島別マスター：${state.master.areasReady?'取得済み':'未取得（初期データ）'}<br>外部更新：${state.status?htmlEscape(state.status):'起動時に確認'}</p><div class="setting-actions"><button class="primary-button" data-action="sync">最新データを確認</button></div><p class="small-note">公開後はGitHub Actionsで毎日マスターを検証・更新します。新規ポケモンの図鑑登録はオンライン時に直接確認も行います。</p></div><div class="setting-block"><h3>バックアップ・復元</h3><p>厳選評価・島の手動修正・登録したアイコンをJSONに保存します。</p><div class="setting-actions"><button class="secondary-button" data-action="backup">バックアップ保存</button><button class="secondary-button" data-action="restore">バックアップ読込</button></div></div><div class="setting-block"><h3>情報・注意</h3><p>このツールは非公式の個人用ファンツールです。ポケモンアイコンはPokeAPI Spritesから取得し、表示できた画像はオフライン用にキャッシュします。リージョンのすがたは専用画像IDを使い、画像が未提供なら名前を表示します。画像は個別にアップロードできます。標準画像はゲーム内の専用アイコンと同一とは限りません。</p><button class="secondary-button danger-button" data-action="clear-ratings">すべての評価を消去</button></div>`}
  function updateGrade(k,g){if(g==='none')delete state.ratings[k];else state.ratings[k]=g;save();render();dialogClose('#details');toast(g==='none'?'未評価に戻しました':`厳選優先度を ${gradeInfo(g).symbol} に変更しました`)}
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
    const counter=$('#rated-count');if(counter)counter.textContent=countRated();
  }
  function switchTab(tab){if(!['dex','search'].includes(tab))return;state.prefs.tab=tab;state.prefs.search='';save();render();window.scrollTo({top:0,behavior:'instant'})}
  async function openDB(){if(!('indexedDB'in window))throw Error('IndexedDB is unavailable');if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('gense-note-icons',1);req.onupgradeneeded=()=>req.result.createObjectStore('icons');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise}
  async function dbAction(mode,action){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('icons',mode);const store=tx.objectStore('icons');let req;try{req=action(store)}catch(e){reject(e);return}if(req){req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)}else {tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)}})}
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
  function backup(){downloadJSON({app:'pokesleep-priority',version:1,date:new Date().toISOString(),ratings:state.ratings,overrides:state.overrides,icons:Object.fromEntries(state.icons)},`gense-note-backup-${nowJST()}.json`);toast('バックアップファイルを保存しました')}
  function sanitizedRatings(obj){const safe={};if(obj&&typeof obj==='object'&&!Array.isArray(obj)){for(const [k,v] of Object.entries(obj))if(/^\d+:[A-Za-z0-9 _-]+$/.test(k)&&GRADE_IDS.has(v))safe[k]=v}return safe}
  function sanitizedOverrides(obj){const safe={};if(obj&&typeof obj==='object'&&!Array.isArray(obj)){for(const [k,v] of Object.entries(obj))if(/^\d+:[A-Za-z0-9 _-]+$/.test(k)&&Array.isArray(v))safe[k]=[...new Set(v.filter(n=>Number.isInteger(n)&&n>=0&&n<9))].sort((a,b)=>a-b)}return safe}
  async function restore(file){if(!file||file.size>30*1024*1024){toast('30MB以下のJSONを指定してください');return}try{const input=JSON.parse(await file.text());if(input.app!=='pokesleep-priority'||input.version!==1)throw Error('このアプリのバックアップではありません');const ratings=sanitizedRatings(input.ratings),overrides=sanitizedOverrides(input.overrides);if(!confirm('現在の厳選優先度・手動設定をバックアップの内容に置き換えます。続けますか？'))return;
    // Validate icon values before modifying preferences.
    const candidates=Object.entries(input.icons||{}).filter(([k,v])=>/^\d+:[A-Za-z0-9 _-]+$/.test(k)&&typeof v==='string'&&v.length<=450000&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v));
    state.ratings=ratings;state.overrides=overrides;save();try{await dbAction('readwrite',s=>s.clear());state.icons.clear();for(const [k,v] of candidates){await dbAction('readwrite',s=>s.put(v,k));state.icons.set(k,v)}}catch(e){console.warn('Restore icons failed',e);toast('評価は復元しました。画像の復元は一部失敗しました')}
    dialogClose('#settings-dialog');render();toast('バックアップを復元しました');
  }catch(e){toast(`復元失敗：${e.message||'JSON形式を確認してください'}`)}}
  async function fetchJSON(url){const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(14000)});if(!res.ok)throw Error(`HTTP ${res.status}`);return res.json()}
  function mergeMaster(next){if(!validMaster(next))return 0;const old=state.master;let updated=0;
    const oldMap=new Map(old.pokemon.map(p=>[p.key,p]));const newer=next.pokemon.map(p=>{
      const prior=oldMap.get(p.key);
      if(!prior){updated++;return p}
      // A species-only seed must never erase previously validated island data.
      if(!next.areasReady&&old.areasReady)return {...p,islands:prior.islands};
      return p;
    });
    for(const p of old.pokemon)if(!newer.some(x=>x.key===p.key))newer.push(p); // temporary upstream omissions should not erase user entries
    state.master={...next,pokemon:newer,areasReady:Boolean(next.areasReady||old.areasReady)};
    if(old.areasReady&&!next.areasReady)state.master.updatedAt=old.updatedAt;
    const visibleDataChanged=Boolean(old.areasReady)!==Boolean(state.master.areasReady)
      ||JSON.stringify(old.pokemon)!==JSON.stringify(newer);
    setLocal(KEYS.master,state.master);
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
    return previous.slot!==slot||(!previous.ok&&Date.now()-previous.time>=30*60*1000);
  }
  async function refreshMaster(force=false){
    if(loadingMaster||!shouldCheckMaster(force))return;
    loadingMaster=true;
    const checkSlot=masterCheckSlot();
    const previousStatus=state.status;state.status='確認中';let errors=[];let newCount=0;let siteUpdate=false;
    try{const latest=await fetchJSON(`./data/master.json?v=${Date.now()}`);if(validMaster(latest)){newCount+=mergeMaster(latest);siteUpdate=true}else errors.push('公開マスターの検証に失敗')}catch(e){errors.push('公開マスターを取得できません')}
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
    if(force||lastCheck!==today){try{const base='https://raw.githubusercontent.com/nitoyon/pokesleep-tool/main/';const [sp,ja]=await Promise.all([fetchJSON(base+'src/data/pokemon.json'),fetchJSON(base+'src/i18n/ja/pokemons.json')]);if(!Array.isArray(sp)||!ja?.pokemons)throw Error('upstream schema');const known=new Set(getPokemon().map(p=>p.key));let inserts=0;
      for(const p of sp){if(!Number.isInteger(p.id)||!p.name||p.arrival&&p.arrival>today)continue;const key=`${p.id}:${p.form||'default'}`;if(known.has(key))continue;const sleep={dozing:'うとうと',snoozing:'すやすや',slumbering:'ぐっすり'}[p.sleepType]||'不明';const name=ja.pokemons[p.name]||p.name;state.master.pokemon.push({key,id:p.id,name,sleep,form:p.form||'',islands:[]});known.add(key);inserts++}
      if(inserts){state.master.pokemon.sort((a,b)=>a.id-b.id||a.key.localeCompare(b.key));setLocal(KEYS.master,state.master);render();resolveRegionalSprites()}newCount+=inserts;setLocal('gense-note-upstream-check',today);
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
    if(action==='settings'){settings();dialogOpen('#settings-dialog')}
    if(action==='close-details')dialogClose('#details');
    if(action==='close-settings')dialogClose('#settings-dialog');
    if(action==='rate'&&selected())updateGrade(state.selected,b.dataset.grade);
    if(action==='unrate'&&selected())updateGrade(state.selected,'none');
    if(action==='grade'){state.prefs.grade=b.dataset.value;save();render()}
    if(action==='search-grade-toggle'&&SEARCH_GRADE_IDS.includes(b.dataset.grade)){const chosen=new Set(state.prefs.searchGrades);if(chosen.has(b.dataset.grade))chosen.delete(b.dataset.grade);else chosen.add(b.dataset.grade);state.prefs.searchGrades=SEARCH_GRADE_IDS.filter(g=>chosen.has(g));save();render()}
    if(action==='search-grade-preset'){if(b.dataset.preset==='all')state.prefs.searchGrades=[...SEARCH_GRADE_IDS];else if(b.dataset.preset==='none')state.prefs.searchGrades=[];else return;save();render()}
    if(action==='sleep'){state.prefs.sleep=b.dataset.value;save();render()}
    if(action==='upload-icon')$('#icon-input').click();
    if(action==='reset-icon'&&state.selected)await setIcon(state.selected,null);
    if(action==='reset-islands'&&state.selected){delete state.overrides[state.selected];save();render();details();toast('自動マスターの島設定に戻しました')}
    if(action==='sync')await refreshMaster(true);
    if(action==='backup')backup();
    if(action==='restore')$('#restore-input').click();
    if(action==='clear-ratings'){if(confirm('厳選優先度をすべて消去します。バックアップがない場合、元に戻せません。実行しますか？')){state.ratings={};save();render();settings();toast('評価をすべて消去しました')}}
  });
  document.addEventListener('change',ev=>{
    const b=ev.target;
    if(b.dataset.action==='island-toggle'&&state.selected){const p=selected(),idx=Number(b.dataset.island);if(!p||!Number.isInteger(idx))return;let islands=Array.isArray(state.overrides[p.key])?[...state.overrides[p.key]]:[...p.islands];if(b.checked&&!islands.includes(idx))islands.push(idx);if(!b.checked)islands=islands.filter(i=>i!==idx);state.overrides[p.key]=islands.sort((a,b)=>a-b);save();render()}
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
  ['#details','#settings-dialog'].forEach(id=>$(id).addEventListener('click',ev=>{if(ev.target===$(id))dialogClose(id)}));
  window.addEventListener('storage',ev=>{if(ev.key===KEYS.ratings)state.ratings=fromLocal(KEYS.ratings,{});if(ev.key===KEYS.overrides)state.overrides=fromLocal(KEYS.overrides,{});render()});
  async function start(){
    await loadIcons();
    render();
    refreshMaster(false);
    resolveRegionalSprites();
  }
  start().catch(err=>console.warn('Initialization error',err));
  if('serviceWorker'in navigator&&location.protocol.startsWith('http')){
    navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{
      // Catch sprites which loaded before the first Service Worker activation.
      document.querySelectorAll('.pokemon-icon img').forEach(img=>{
        if(img.complete&&img.naturalWidth>0)saveLoadedSprite(img);
      });
    }).catch(err=>console.warn('SW unavailable',err));
  }
})();
