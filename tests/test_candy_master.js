'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),style=read('styles.css'),sw=read('sw.js');
const pokemon=JSON.parse(read('data/master.json')).pokemon;
const candy=JSON.parse(read('data/candy-master.json'));
const seed=read('data/candy-seed.js');
assert.equal(candy.schema,3);
assert.ok(candy.families.length>=108,'candy families must include current full Sleep master, not old ZIP');
assert.equal(new Set(candy.families.map(f=>f.id)).size,candy.families.length);
const allTypes=new Set(['normal','fire','water','electric','grass','ice','fighting','poison','ground',
 'flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy']);
assert.equal(new Set(candy.families.map(f=>f.type)).size,18);
assert.ok(candy.families.every(f=>allTypes.has(f.type)), 'Every candy must have one valid type');
assert.deepEqual(JSON.parse(seed.slice('window.__CANDY_MASTER__='.length).trim().replace(/;$/,'')),candy);
const unique=new Set(),familyMap=new Map();
for(const f of candy.families){
 assert.ok(f.members.includes(f.labelId));
 assert.deepEqual(f.members,[...new Set(f.members)].sort((a,b)=>a-b));
 for(const id of f.members){assert.ok(!unique.has(id),'duplicate across candy families');unique.add(id);familyMap.set(id,f);}
 for(const field of ['regional','mega','gmax'])assert.ok(Array.isArray(f.special[field]));
}
assert.ok(unique.size>=235,'candy mapping must retain the validated baseline');
const sleepIds=[...new Set(pokemon.map(x=>x.id))];
assert.ok(sleepIds.filter(id=>!unique.has(id)).length<=15,'large gaps in candy mapping are not allowed');
const bulba=familyMap.get(1);assert.deepEqual(bulba.members,[1,2,3]);
assert.ok(bulba.special.mega.includes(3)&&bulba.special.gmax.includes(3));
const pika=familyMap.get(172);assert.equal(pika.labelId,25);
assert.ok([25,26,172].every(id=>pika.members.includes(id)));
assert.ok(!pika.special.regional.includes(25),'Alola cap is not an Alolan Pokémon');
assert.ok(pika.special.regional.includes(26));
assert.equal(familyMap.get(439).labelId,122,'Mime Jr uses Mr Mime Candy');
assert.equal(familyMap.get(980).id,familyMap.get(194).id,'Clodsire shares Wooper lineage');
assert.equal(familyMap.get(700).id,familyMap.get(133).id,'all Eeveelutions share Eevee candy');
assert.equal(familyMap.get(133).type,'normal','Eevee Candy must be Normal');
assert.equal(familyMap.get(37).type,'fire','Vulpix Candy must use normal form type, not Alolan Ice');
assert.equal(familyMap.get(194).type,'water','Wooper Candy must use normal form type, not Paldean Poison');
assert.equal(familyMap.get(710).type,'ghost','Pumpkaboo Candy must have stable Ghost type');
const legendFamilies=candy.families.filter(f=>f.special.legendary.length);
const pendingFamilies=candy.families.filter(f=>f.special.evolution.length);
assert.deepEqual(legendFamilies.map(f=>f.id).sort((a,b)=>a-b),[150,151,243,244,245,380,381,488,491]);
assert.deepEqual(pendingFamilies.map(f=>f.id),[56], 'Only ordinary Mankey -> Primeape -> Annihilape is pending');
assert.deepEqual(pendingFamilies[0].special.evolution,[979]);
for(const id of [52,83,122,215])assert.deepEqual(familyMap.get(id).special.evolution,[],
 'regional-only evolution must not be marked as pending: '+id);

assert.ok(html.includes('data-tab="candy"'));
assert.ok(html.includes('id="candy-details"'));
assert.ok(html.includes('src="./data/candy-seed.js"'));
assert.ok(style.includes('.candy-item'));
for(const type of allTypes)assert.ok(style.includes('.candy-type-tag[data-type="'+type+'"]'),
 'Missing colored badge style for '+type);
assert.ok(style.includes('color:var(--candy-accent)'));
assert.ok(app.includes("previous.querySelector('.candy-type-tag')?.dataset.type==="),
 'Retained candy cards must update when a type changes');
assert.ok(!app.includes("if(candyType!=='all'&&f.type!==candyType)"),
 'Removed type filtering must not apply silently');
assert.ok(app.includes("candy:'gense-note-candy-priorities-v1'"));
assert.ok(app.includes('function mergeCandyMaster(incoming)'));
assert.ok(app.includes("if(state.prefs.tab==='candy'){renderCandyResults(el);discoverSprites();return}"));
assert.ok(app.includes("const hasCandy=Object.hasOwn(input,'candyRatings')"));
assert.ok(app.includes("const restoredCandy=hasCandy?input.candyRatings:state.candyRatings"));
assert.ok(app.includes('candyRatings:state.candyRatings'));
assert.ok(sw.includes("'./data/candy-master.json'"));
assert.ok(sw.includes("'./data/candy-seed.js'"));
assert.ok(read('.github/workflows/pages.yml').includes('python tools/update_candy.py'));
assert.ok(read('.github/workflows/pages.yml').includes('data/candy-master.json data/candy-seed.js'));
console.log('PASS: 108 candy families, 9 legendary/mythical, Mankey-only ordinary pending evolution, safe backups and daily updates');
