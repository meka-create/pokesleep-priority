'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(base,f),'utf8');
const app=read('app.js'),css=read('styles.css'),html=read('index.html'),sw=read('sw.js'),flow=read('.github/workflows/pages.yml');
assert.ok(!app.includes('function hero()'));
assert.ok(!app.includes('const ICONS='));
assert.ok(!app.includes('data-preset="rated"'));
assert.ok(app.includes('data-preset="none"'));
assert.ok(app.includes('state.prefs.searchGrades=[]'));
assert.ok(app.includes('updateRatedCounter()'));
assert.equal((app.match(/placeholder="検索"/g)||[]).length,3);
for(const emoji of ['🌙','💤','💧'])assert.ok(!app.includes(emoji));
assert.ok(!app.includes('ICONS[i]'));
assert.ok(!app.includes('島ごと・優先度ごとに厳選対象を確認'));
assert.ok(!app.includes('評価をタップしてすぐに記録'));
assert.ok(html.includes('class="count-bubble header-count"'));
assert.ok(html.indexOf('header-count')<html.indexOf('data-action="settings"'));
for(const [name,color] of [['うとうと','#f5ca45'],['すやすや','#8fd8f5'],['ぐっすり','#3265b8']]){
 assert.ok(css.includes('data-sleep="'+name+'"]{background:'+color));
}
assert.ok(css.includes('height:54px;min-height:54px'));
for(const s of ['greengrass','cyan','taupe','snowdrop','lapis','gold']){
 assert.ok(css.includes('field-'+s+'.png'),s+' missing from CSS');
 assert.ok(sw.includes('field-'+s+'.png'),s+' missing from precache');
}
for(const landscape of ['amber-landscape','greengrass-ex','cyan-ex']){
 assert.ok(css.includes('field-'+landscape+'.jpg'),landscape+' missing from CSS');
 assert.ok(sw.includes('field-'+landscape+'.jpg'),landscape+' missing from precache');
}
assert.ok(css.includes('data-area-panel="7"]{--field-art:url(\'./assets/field-greengrass-ex.jpg\')'));
assert.ok(css.includes('data-area-panel="8"]{--field-art:url(\'./assets/field-cyan-ex.jpg\')'));
assert.ok(html.includes('href="./styles.css?v=0.2.5"'),"CSS must be versioned against stale PWA cache");
assert.ok(html.includes('src="./app.js?v=0.2.5"'),"new app script must bypass stale browser cache");
assert.ok(sw.includes("const isDocument=req.mode==='navigate'"),"navigation must bypass stale HTML cache");
assert.ok(sw.includes("const isCSS=url.pathname.endsWith('/styles.css')"),"CSS must refresh even with installed PWA");
assert.ok(sw.includes("const isAppScript=url.pathname.endsWith('/app.js')"),"app logic must update online");
assert.ok(sw.includes("const isSeedScript=url.pathname.endsWith('/data/seed-data.js')"),"bundled master must update online");
assert.ok(sw.includes("fetch(req,{cache:'no-store'})"),"network-first shell must bypass HTTP cache");
assert.ok(sw.includes("caches.match(cacheKey,{ignoreSearch:true})"),"shell remains available offline");
assert.ok(app.includes("register('./sw.js',{updateViaCache:'none'})"),"app should check updated worker");
assert.ok(css.includes('background-position:center,center 48%'),"all ordinary islands share their original crop");
assert.ok(!css.includes('.island-panel[data-area-panel="1"] .island-heading{background-position'),"Cyan Beach should use shared crop, not a one-off override");
assert.ok(!css.includes('.island-panel[data-area-panel="8"] .island-heading{background-position'),"EX must remain independent");
assert.ok(app.includes('const retainedCards=new Map()'));
assert.ok(app.includes('function patchResults(el,markup)'));
assert.ok(app.includes('patchResults(el,content)'));
assert.ok(app.includes('patchResults(el,markup)'));
assert.ok(app.includes('await warmStartupSprites()'));
assert.ok(app.includes('const tabPanels=new Map()'));
assert.ok(app.includes('render(true,keepLeavingPanel)'));
assert.ok(app.includes('if(newPanel)renderResults()'));
assert.ok(app.includes("spriteBlobs.get(src)"));
assert.ok(!app.includes("main.innerHTML=state.prefs.tab"));

assert.ok(app.includes('sleepDot(t.id)'));
assert.ok(app.includes('class="island-heading"><h4>'+ '$'+'{AREAS[i]}</h4>'));
assert.ok(flow.includes("cron: '17 19 * * *'"));
assert.ok(flow.includes('bootstrap_fields.py'));
console.log('PASS: compact header; rated counter; clear presets; search placeholders; sleep type colors; 6 normal images + 3 distinct field landscapes; original 54px band; offline precache');
