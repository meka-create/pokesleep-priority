'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
function block(selector){
 // Check a whole selector, allowing whitespace before '{' but not accidentally
 // matching '.bottom-sheet' inside the higher-specificity '#details' selector.
 const pattern=selector==='.bottom-sheet'
   ? /(?:^|\n)\.bottom-sheet\s*\{[^{}]*\}/
   : /(?:^|\n)#details\.bottom-sheet\s*\{[^{}]*\}/;
 const match=css.match(pattern);
 assert.ok(match,'missing CSS selector: '+selector);
 return match[0];
}
const original=block('.bottom-sheet');
assert.match(original,/position\s*:\s*fixed/);
assert.match(original,/bottom\s*:\s*0/,'settings must remain anchored at bottom');
assert.match(original,/overflow-y\s*:\s*auto/);
const modal=block('#details.bottom-sheet');
assert.match(modal,/inset\s*:\s*0/);
assert.match(modal,/margin\s*:\s*auto/);
assert.match(modal,/height\s*:\s*fit-content/);
assert.match(modal,/max-height\s*:\s*min\(\s*calc\(100dvh\s*-\s*32px\),\s*880px\s*\)/);
assert.match(modal,/border-radius\s*:\s*22px/);
assert.ok(html.includes('<dialog class="bottom-sheet" id="details">'));
assert.ok(html.includes('<dialog class="bottom-sheet" id="settings-dialog">'));
assert.match(app,/if\(action==='pokemon'\)\{state\.selected=b\.dataset\.key;details\(\);dialogOpen\('#details'\);activateDetailSprite\(\)\}/);
assert.match(sw,/gense-note-shell-v0\.1\.17/);
console.log('PASS: centered details, limited height/scroll, settings stays bottom, image loading unchanged');
