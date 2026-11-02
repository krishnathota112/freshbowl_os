const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(readonly=false){
 const d=new JSDOM('<header><button>Home</button></header><main><form><input id="name" value="Batch name"><div id="grid"></div><button id="save">Save</button><aside inert>Already inert</aside></form></main>',{url:'http://localhost/app.html',runScripts:'outside-only'});
 const w=d.window,doc=w.document,root=doc.getElementById('grid');w.TK={};
 w.eval(fs.readFileSync(path.join(__dirname,'../www/plan-duration.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'../www/plan-scheduler.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'../www/schedule-grid.js'),'utf8'));
 let edits=0,submits=0;doc.querySelector('form').onsubmit=e=>{e.preventDefault();submits++;};
 const rows=Array.from({length:45},(_,i)=>({id:'task-'+i,title:'Task '+i,line:'Main',description:'Context '+i,kind:i%2?'lab':'work',photos:'none',ask:'none',suggested_offset_minutes:i*60,_locked:i===0}));
 const api=w.TK.scheduleGrid.mount(root,{rows,base:'2026-09-28T00:00:00Z',readonly,onChange:()=>edits++});
 return {d,w,doc,root,api,rows,counts:()=>({edits,submits})};
}
test('fallback fills the available window without rebuilding fields, changing data or submitting',async()=>{
 const {d,w,doc,root,api,counts}=setup();try{
  const field=root.querySelector('[data-row="2"] [data-field="description"]');field.value='Unsaved context';
  const toggle=root.querySelector('[data-fullscreen]'),wrap=root.querySelector('.grid-wrap');wrap.scrollLeft=150;
  toggle.click();await tick();
  assert(root.classList.contains('plan-expanded'));assert(doc.documentElement.classList.contains('plan-fullscreen-open'));
  assert.equal(root.getAttribute('aria-modal'),'true');assert(doc.querySelector('header').hasAttribute('inert'));
  assert.equal(field.isConnected,true);assert.equal(field.value,'Unsaved context');
  assert(root.querySelector('[data-fullscreen-hint]').textContent.includes('available window'));
  assert.equal(toggle.textContent,'Exit expanded view');assert.deepEqual(counts(),{edits:0,submits:0});
  doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await tick();
  assert(!root.classList.contains('plan-expanded'));assert(!doc.documentElement.classList.contains('plan-fullscreen-open'));
  assert(!doc.querySelector('header').hasAttribute('inert'));assert(doc.querySelector('aside').hasAttribute('inert'));
  assert.equal(root.getAttribute('role'),null);assert.equal(doc.activeElement,toggle);assert.equal(wrap.scrollLeft,150);
  assert.equal(api.read()[2].description,'Unsaved context');assert.equal(doc.getElementById('name').value,'Batch name');
 }finally{d.window.close();}
});
test('fullscreen survives Process/Lab/settings/page changes and keeps protected rows protected',async()=>{
 const {d,root,api,rows}=setup();try{
  root.querySelector('[data-fullscreen]').click();await tick();
  root.querySelector('[data-filter="lab"]').click();
  root.querySelector('[data-row="1"] [data-field="title"]').value='Lab edit';
  const advanced=root.querySelector('[data-advanced]');advanced.checked=true;advanced.dispatchEvent(new d.window.Event('change'));
  root.querySelector('[data-page="1"]').click();
  assert(root.classList.contains('plan-expanded'));assert.equal(root.querySelector('[data-fullscreen]').getAttribute('aria-pressed'),'true');
  root.querySelector('[data-filter="process"]').click();
  assert(!root.querySelector('[data-row="0"] [data-field]'));assert(root.querySelector('[data-row="0"] [data-action="delete"]').disabled);
  root.querySelector('[data-fullscreen-back]').click();await tick();
  assert.equal(api.read()[1].title,'Lab edit');assert.equal(api.read().length,rows.length);
  assert.equal(root.querySelector('[data-advanced]').checked,true);
 }finally{d.window.close();}
});
test('native fullscreen, browser Escape and re-entry keep the toggle synchronized',async()=>{
 const {d,w,doc,root}=setup();try{
  let element=null,exits=0;Object.defineProperty(doc,'fullscreenElement',{get:()=>element});
  root.requestFullscreen=async()=>{element=root;doc.dispatchEvent(new w.Event('fullscreenchange'));};
  doc.exitFullscreen=async()=>{exits++;element=null;doc.dispatchEvent(new w.Event('fullscreenchange'));};
  root.querySelector('[data-fullscreen]').click();await tick();assert.equal(root.querySelector('[data-fullscreen]').textContent,'Exit full screen');
  element=null;doc.dispatchEvent(new w.Event('fullscreenchange'));assert(!root.classList.contains('plan-expanded'));
  root.querySelector('[data-fullscreen]').click();await tick();root.querySelector('[data-fullscreen-back]').click();await tick();
  assert.equal(exits,1);assert.equal(root.querySelector('[data-fullscreen]').textContent,'Full screen');
 }finally{d.window.close();}
});
test('native rejection falls back cleanly and browser back/removal releases page locks',async()=>{
 const {d,doc,root}=setup();try{
  root.requestFullscreen=async()=>{throw new Error('Embedded browser policy');};
  root.querySelector('[data-fullscreen]').click();await tick();
  assert(root.classList.contains('plan-expanded'));assert(root.querySelector('[data-fullscreen-hint]').textContent.includes('unavailable'));
  root.remove();await tick();assert(!doc.documentElement.classList.contains('plan-fullscreen-open'));
  assert(!doc.querySelector('header').hasAttribute('inert'));assert(!doc.getElementById('save').hasAttribute('inert'));
 }finally{d.window.close();}
});
test('late fullscreen activation after exit is closed without reopening the editor',async()=>{
 const {d,w,doc,root}=setup();try{
  let complete,element=null;Object.defineProperty(doc,'fullscreenElement',{get:()=>element});
  root.requestFullscreen=()=>new Promise(r=>{complete=r;});doc.exitFullscreen=async()=>{element=null;doc.dispatchEvent(new w.Event('fullscreenchange'));};
  root.querySelector('[data-fullscreen]').click();root.querySelector('[data-fullscreen-back]').click();await tick();
  element=root;complete();await tick();assert.equal(element,null);assert(!root.classList.contains('plan-expanded'));
 }finally{d.window.close();}
});
test('keyboard focus stays within expanded rows and read-only SOPs also have fullscreen',async()=>{
 const {d,w,doc,root,counts}=setup(true);try{
  root.querySelector('[data-fullscreen]').click();await tick();
  const last=root.querySelector('[data-fullscreen-back]'),first=root.querySelector('[data-filter]');last.focus();
  doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(doc.activeElement,first);
  doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(doc.activeElement,last);
  assert(!root.querySelector('[data-field]'));assert(!root.querySelector('[data-fullscreen-hint]').textContent.includes('save'));
  assert.deepEqual(counts(),{edits:0,submits:0});
  last.click();await tick();
 }finally{d.window.close();}
});
