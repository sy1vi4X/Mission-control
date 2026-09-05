const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(process.env.MISSION_TEST_SOURCE || 'index.html', 'utf8').match(/<script>\s*(const STORAGE_KEY[\s\S]*?)<\/script>/)[1];
const KEY = 'mission-control.tasks.v1';
const fixture = (id = 'qa-1') => ({ id, title: 'QA task', level: 'must', deadline: '2026-09-05', completed: false, createdAt: '2026-09-01T00:00:00.000Z', completedAt: null });
// Executes the shipped application with deterministic storage, clock and timers.
// The DOM adapter is deliberately minimal; visual/interaction QA is separate.
function app(raw = JSON.stringify([fixture()]), options = {}) {
  const data = new Map([[KEY, raw], ['mission-control.initialized.v1', 'true']]);
  const timers = new Map(); let timerId = 0;
  const element = () => ({ value: '', hidden: true, dataset: {}, style: {}, textContent: '', classList: { toggle(){}, add(){} }, setAttribute(){}, addEventListener(){}, append(){}, replaceChildren(){}, focus(){}, querySelectorAll(){return []} });
  const elements = new Map();
  const get = selector => { if (selector.startsWith('[data-task-id=')) return null; if(!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); };
  const NativeDate = Date;
  const FakeDate = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [options.now || '2026-09-05T03:00:00Z'])); } };
  const context = vm.createContext({ Date: FakeDate, Intl, console, crypto: options.noUUID ? {getRandomValues: webcrypto.getRandomValues.bind(webcrypto)} : webcrypto, Uint8Array,
    localStorage: {getItem: k=>data.get(k) ?? null, setItem(k,v){if(options.failWrite) throw Error('Quota'); data.set(k,v)},removeItem:k=>data.delete(k)},
    document: { querySelector:get, querySelectorAll:()=>[], createElement:element, documentElement:element(), addEventListener(){} },
    window: {matchMedia:()=>({matches:!!options.reduced}), setTimeout(fn){timers.set(++timerId,fn);return timerId}, clearTimeout:id=>timers.delete(id), setInterval(){},addEventListener(){}},
    navigator:{}, CSS:{escape:s=>s}, requestAnimationFrame:fn=>fn(), confirm:()=>true });
  vm.runInContext(source,context);
  return { run:s=>vm.runInContext(s,context), data, options, timers, flush(){for(const fn of [...timers.values()]) fn()}, saved:()=>JSON.parse(data.get(KEY)) };
}
test('completion is durable before its animation finishes; repeated clicks do not flip it',()=>{
 const a=app(); a.run("toggleTask('qa-1'); toggleTask('qa-1')"); assert.equal(a.saved()[0].completed,true); assert.equal(a.saved().length,1);
 const refreshed=app(a.data.get(KEY)); assert.equal(refreshed.run('state.tasks[0].completed'),true);
});
test('undo cancels completion timer and preserves later title edits',()=>{
 const a=app(); a.run("toggleTask('qa-1'); undoLastAction()"); a.flush(); assert.equal(a.saved()[0].completed,false);
 a.run("toggleTask('qa-1')"); a.flush(); a.run("openPanel('qa-1'); els.titleInput.value='Edited'; saveTask({preventDefault(){}}); undoLastAction()"); assert.equal(a.saved()[0].title,'Edited'); assert.equal(a.saved()[0].completed,false);
});
test('multiple delete/complete actions undo in reverse without losing other tasks',()=>{
 const a=app(JSON.stringify([fixture(),fixture('qa-2')])); a.run("toggleTask('qa-1')"); a.flush(); a.run("deleteTask('qa-2'); undoLastAction(); undoLastAction()"); assert.equal(a.saved().length,2); assert.equal(a.saved()[0].completed,false);assert.equal(a.saved()[1].id,'qa-2');
});
test('add/edit guards duplicate submission and preserves level/deadline/state',()=>{
 const a=app(); a.run("openPanel(); els.titleInput.value='New task'; state.draft.level='side'; state.draft.deadlineMode='none'; saveTask({preventDefault(){}}); saveTask({preventDefault(){}})"); assert.equal(a.saved().length,2); assert.equal(a.saved()[1].deadline,null);
 a.run("openPanel('qa-1'); els.titleInput.value='Changed'; state.draft.deadlineMode='pick'; state.draft.pickedDate='2026-12-31'; saveTask({preventDefault(){}})");assert.equal(a.saved()[0].deadline,'2026-12-31'); assert.equal(a.saved()[0].completed,false);
});
test('malformed and mixed-invalid saved data is preserved and protected from overwrite',()=>{
 for(const raw of ['{broken',JSON.stringify([fixture(),{id:'legacy-broken'}])]) {const a=app(raw); a.run("openPanel(); els.titleInput.value='New'; saveTask({preventDefault(){}})"); assert.equal(a.data.get(KEY),raw); assert.equal(a.run('state.storageBlocked'),true);}
});
test('failed writes do not change visible state or discard form input',()=>{
 const a=app(undefined,{failWrite:true}); a.run("toggleTask('qa-1')"); assert.equal(a.run('state.tasks[0].completed'),false);
 a.run("openPanel(); els.titleInput.value='Keep my draft'; saveTask({preventDefault(){}})");assert.equal(a.run('els.modal.hidden'),false);assert.equal(a.run('els.titleInput.value'),'Keep my draft'); assert.equal(a.saved().length,1);
});
test('empty and valid v1 data survives load unchanged',()=>{
 for(const raw of ['[]',JSON.stringify([fixture()])]) {const a=app(raw);assert.equal(a.data.get(KEY),raw);assert.equal(a.run('state.storageBlocked'),false);}
});
test('search combines with view and level filters, including no matches',()=>{
 const other={...fixture('qa-2'),title:'Physics worksheet',level:'side'}; const a=app(JSON.stringify([fixture(),other]));a.run("state.search='physics'");assert.equal(a.run('getFilteredTasks().length'),1);a.run("state.levelFilter='must'");assert.equal(a.run('getFilteredTasks().length'),0);a.run("state.levelFilter='all';state.search='';state.view='done'");assert.equal(a.run('getFilteredTasks().length'),0);
});
test('local dates, year rollover and done labels respect device timezone',()=>{
 const previous=process.env.TZ;
 try { for(const zone of ['Pacific/Kiritimati','Pacific/Pago_Pago','Asia/Shanghai','America/Los_Angeles']) {process.env.TZ=zone;const a=app(undefined,{now:'2026-12-31T18:00:00Z'});const now=new Date('2026-12-31T18:00:00Z'); const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;assert.equal(a.run('isoToday()'),iso(now),zone);now.setDate(now.getDate()+1);assert.equal(a.run('isoToday(1)'),iso(now),zone);a.run("state.view='done'");assert.equal(a.run("sectionLabel({...state.tasks[0],completed:true,completedAt:new Date().toISOString()})"),'TODAY',zone);}}
 finally { if(previous===undefined) delete process.env.TZ;else process.env.TZ=previous; }
});
test('HTTP fallback IDs work and reduced motion saves immediately',()=>{
 const a=app(undefined,{noUUID:true,reduced:true});a.run("openPanel();els.titleInput.value='HTTP task';saveTask({preventDefault(){}})");assert.equal(a.saved().length,2);assert.notEqual(a.saved()[1].id,'qa-1');a.run("toggleTask('qa-1')");assert.equal(a.saved()[0].completed,true);assert.equal(a.timers.size,0);
});
test('deadline views include exact next-seven-day boundary and compose with search and priority',()=>{
 const a=app();a.run("state.tasks=[{...state.tasks[0],id:'past',deadline:isoToday(-1)},{...state.tasks[0],id:'today',deadline:isoToday()},{...state.tasks[0],id:'last',deadline:isoToday(6),level:'side'},{...state.tasks[0],id:'outside',deadline:isoToday(7)},{...state.tasks[0],id:'none',deadline:null}]");
 for(const [filter,ids] of [['overdue','past'],['today','today'],['week','today,last'],['none','none']]) {a.run(`state.deadlineFilter='${filter}'`); assert.equal(a.run("getFilteredTasks().map(t=>t.id).join(',')"),ids);}
 a.run("state.deadlineFilter='week';state.levelFilter='side'");assert.equal(a.run('getFilteredTasks().length'),1);a.run("state.search='missing'");assert.equal(a.run('getFilteredTasks().length'),0);
});
test('continuous add clears title but keeps chosen level/date and rejects repeat clicks',()=>{
 const a=app();a.run("openPanel();els.titleInput.value='First';state.draft.level='should';state.draft.deadlineMode='pick';state.draft.pickedDate='2026-12-31';saveTask({preventDefault(){},submitter:{id:'addAnother'}})");
 assert.equal(a.saved().length,2);assert.equal(a.run('els.modal.hidden'),false);assert.equal(a.run('els.titleInput.value'),'');assert.equal(a.run('state.draft.level'),'should');assert.equal(a.run('state.draft.pickedDate'),'2026-12-31');
 a.run("saveTask({preventDefault(){},submitter:{id:'addAnother'}})");assert.equal(a.saved().length,2);
 a.run("els.titleInput.value='Second';saveTask({preventDefault(){}})");assert.equal(a.saved().length,3);assert.equal(a.saved()[2].deadline,'2026-12-31');assert.equal(a.saved()[2].level,'should');assert.equal(a.run('els.modal.hidden'),true);
});
test('continuous add retains draft on storage failure and never activates when editing',()=>{
 const a=app();a.run("openPanel();els.titleInput.value='Unsaved'");a.options.failWrite=true;a.run("saveTask({preventDefault(){},submitter:{id:'addAnother'}})");assert.equal(a.saved().length,1);assert.equal(a.run('els.titleInput.value'),'Unsaved');a.options.failWrite=false;
 a.run("openPanel('qa-1');els.titleInput.value='Edited';saveTask({preventDefault(){},submitter:{id:'addAnother'}})");assert.equal(a.saved().length,1);assert.equal(a.saved()[0].title,'Edited');assert.equal(a.run('els.modal.hidden'),true);
});
