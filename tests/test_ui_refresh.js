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
assert.equal((app.match(/placeholder="検索"/g)||[]).length,2);
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
for(const s of ['greengrass','cyan','taupe','snowdrop','lapis','gold','amber']){
 assert.ok(css.includes('field-'+s+'.png'),s+' missing from CSS');
 assert.ok(sw.includes('field-'+s+'.png'),s+' missing from precache');
}
assert.ok(app.includes('sleepDot(t.id)'));
assert.ok(app.includes('class="island-heading"><h4>'+ '$'+'{AREAS[i]}</h4>'));
assert.ok(flow.includes("cron: '17 19 * * *'"));
assert.ok(flow.includes('bootstrap_fields.py'));
console.log('PASS: compact header; rated counter; clear presets; search placeholders; sleep type colors; 7 image assets; original 54px band; offline precache');
