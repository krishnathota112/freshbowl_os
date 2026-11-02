const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function page(hash='/') {
  const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',{url:'http://localhost/app.html#'+hash,runScripts:'outside-only'});
  d.window.TK={}; d.window.scrollTo=()=>{}; d.window.confirm=()=>true;
  return d;
}
function grid() {
  const d=page(),w=d.window;w.eval(source('turner-plan.js'));w.eval(source('plan-duration.js'));w.eval(source('plan-scheduler.js'));w.eval(source('schedule-grid.js'));
  const rows=Array.from({length:104},(_,i)=>({title:'Task '+(i+1),line:'Main',kind:i%3===2?'lab':'work',photos:i%3===2?'none':'both',ask:'none',description:'Context '+i,control:'',suggested_offset_minutes:i*60}));
  const root=w.document.getElementById('view');
  const api=w.TK.scheduleGrid.mount(root,{rows,base:'2026-09-27T09:00:00Z',checkpoints:[{code:'LAB-01',name:'Test'}]});
  return {d,w,root,api,rows};
}
test('editor caps DOM rows, defers settings and retains hidden rows across pages/tabs',()=>{
  const {d,root,api}=grid();
  try {
    assert.equal(root.querySelectorAll('tr[data-row]').length,20);
    assert.equal(root.querySelectorAll('.grid-wrap select').length,0);
    root.querySelector('[data-row="0"] [data-field="description"]').value='Keep this edit';
    root.querySelector('[data-page="1"]').click();
    assert.equal(root.querySelector('tr[data-row]').dataset.row,'30');
    root.querySelector('[data-filter="lab"]').click();
    assert.equal(root.querySelector('tr[data-row]').dataset.row,'2');
    assert.equal(api.read().length,104);
    assert.equal(api.read()[0].description,'Keep this edit');
    const advanced=root.querySelector('[data-advanced]');advanced.checked=true;advanced.dispatchEvent(new d.window.Event('change'));
    assert.equal(root.querySelectorAll('.grid-wrap select').length,100);
    root.querySelector('[data-filter="process"]').click();
    assert.equal(root.querySelector('[data-row="0"] [data-field="description"]').value,'Keep this edit');
  } finally {d.window.close();}
});
test('adding and duplicating across a page edge keeps master order and all fields',()=>{
  const {d,root,api}=grid();
  try {
    root.querySelector('[data-filter="all"]').click();
    root.querySelector('[data-row="19"] [data-action="copy"]').click();
    assert.equal(root.querySelector('tr[data-row]').dataset.row,'20');
    assert.equal(api.read()[20].title,'Task 20');
    root.querySelector('[data-add="Lab"]').click();
    const last=api.read().at(-1); assert.equal(last.kind,'lab'); assert.equal(last.photos,'none');
    assert.equal(d.window.document.activeElement.dataset.field,'title');
    assert.equal(api.read().length,106);
  } finally {d.window.close();}
});
test('Enter crosses page boundaries and shifting base does not change offsets',()=>{
  const {d,root,api}=grid();
  try {
    root.querySelector('[data-filter="all"]').click();
    const input=root.querySelector('[data-row="19"] [data-field="title"]'); input.value='Edited 20';
    input.dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    assert.equal(d.window.document.activeElement.closest('tr').dataset.row,'20');
    api.setBase('2026-10-01T09:00:00Z');
    assert.equal(api.read()[19].title,'Edited 20');assert.equal(api.read()[19].suggested_offset_minutes,19*60);
    assert.equal(api.read().length,104);
  } finally {d.window.close();}
});
test('backward planner can apply starts only to editable Paddy rows, keeping recorded work intact',()=>{
  const {d,api}=grid();
  try {
    const before=api.read();before[4]._locked=true;
    const root=d.window.document.getElementById('view');
    const mounted=d.window.TK.scheduleGrid.mount(root,{rows:before,base:'2026-09-27T09:00:00Z',checkpoints:[]});
    assert.equal(mounted.setPlannedStarts([{index:3,start:Date.parse('2026-09-27T15:00:00Z')},{index:4,start:Date.parse('2026-09-28T00:00:00Z')}]),1);
    const after=mounted.read();assert.equal(after[3].suggested_offset_minutes,360);
    assert.equal(after[4].suggested_offset_minutes,before[4].suggested_offset_minutes);
    assert.equal(after[3].schedule_mode,'fixed');
  } finally {d.window.close();}
});
function app(d,select,role='admin',extra={}) {
  const w=d.window; w.Auth={currentUser:()=>({id:'user',name:'Test',role}),ROLE_LABEL:{},signOut:async()=>{}};
  w.TK.api={select,rpc:async()=>{},...extra};
  w.eval(source('app.js'));return w;
}
test('APK shows Logout, cancelled confirmation keeps the session, acceptance signs out once',async()=>{
  const html=new JSDOM(source('app.html'));
  assert.equal(html.window.document.getElementById('out').hidden,true);html.window.close();
  const d=page();let signouts=0;
  try {
    d.window.Capacitor={isNativePlatform:()=>true};
    app(d,async()=>[]);
    d.window.Auth.signOut=()=>{signouts++;return {finally:()=>{}};};
    await tick();
    const button=d.window.document.getElementById('out');
    assert.equal(button.hidden,false);assert.equal(button.textContent,'Logout');
    assert.equal(signouts,0);assert.equal(d.window.Auth.currentUser().id,'user');
    let prompt;d.window.confirm=message=>{prompt=message;return false;};
    button.click();assert.equal(signouts,0);assert.equal(button.disabled,false);
    assert.match(prompt,/work is saved/);assert.match(prompt,/photo uploads/);
    d.window.confirm=()=>true;button.click();assert.equal(signouts,1);assert.equal(button.disabled,true);
    button.click();assert.equal(signouts,1);
    assert(d.window.document.getElementById('refresh'));
  } finally {d.window.close();}
});
test('website keeps its visible working logout with or without the Capacitor web shim',async()=>{
  for(const shim of [false,true]) {
    const d=page();let signouts=0;
    try {
      if(shim)d.window.Capacitor={isNativePlatform:()=>false};
      app(d,async()=>[]);
      d.window.Auth.signOut=()=>{signouts++;return {finally:()=>{}};};
      const button=d.window.document.getElementById('out');
      assert.equal(button.hidden,false);button.click();assert.equal(signouts,1);
      await tick();
    } finally {d.window.close();}
  }
});
test('late batch response cannot replace a newer route',async()=>{
  const d=page('/b/old');let finish;
  try {
    const w=app(d,(table,p)=>{
      if(table==='tk_v_batch' && p.id) return new Promise(r=>{finish=r;});
      return Promise.resolve([]);
    });
    await tick();
    const navigated=new Promise(resolve=>w.addEventListener('hashchange',resolve,{once:true}));
    w.location.hash='#/';await navigated;await tick();
    finish([{id:'old',name:'WRONG OLD SCREEN',lines:[]}]);await tick();
    assert(!w.document.getElementById('view').textContent.includes('WRONG OLD SCREEN'));
    assert.equal(w.document.getElementById('title').textContent,'MushroomOS Tasks');
  } finally {d.window.close();}
});
test('batch Process/Lab tabs reuse the fetched snapshot with no extra requests',async()=>{
  const d=page('/b/b1');let requests=0;
  try {
    app(d,async(table,p)=>{requests++;if(table==='tk_v_batch')return [{id:'b1',name:'Test batch',status:'active',done:0,tasks:2,lines:['Main']}];
      if(table==='tk_v_task_v3')return [{id:'t1',ord:1,title:'Work',line:'Main',kind:'work',status:'todo'},{id:'t2',ord:2,title:'Lab',line:'Main',kind:'lab',status:'todo'}];return [];});
    await tick();const before=requests;
    d.window.document.querySelector('[data-mode="lab"]').click();await tick();
    assert.equal(requests,before);assert.equal(d.window.document.querySelectorAll('[data-t]').length,1);
    assert.equal(d.window.document.querySelector('[data-t]').dataset.t,'t2');
  } finally {d.window.close();}
});
test('successful photo upload preserves machine and remarks without a task reload',async()=>{
  const d=page('/t/t1');let requests=0,uploads=0;
  try {
    const w=app(d,async(table)=>{requests++;return table==='tk_v_task_v3'?[{id:'t1',batch_id:'b1',batch_status:'active',title:'Turner',line:'Main',kind:'work',status:'running',photos:'both',ask:'machine',ord:1}]:[];},'supervisor',{addPhoto:async()=>{uploads++;}});
    await tick();w.document.getElementById('answerIn').value='M2';w.document.getElementById('finNote').value='Keep remark';
    const before=requests,inp=w.document.querySelector('[data-shoot="before"]');
    Object.defineProperty(inp,'files',{value:[{size:1024,type:'image/jpeg'}]});await inp.onchange();
    assert.equal(requests,before);assert.equal(uploads,1);assert.equal(w.document.getElementById('answerIn').value,'M2');assert.equal(w.document.getElementById('finNote').value,'Keep remark');
    assert(inp.closest('.shoot').textContent.includes('Uploaded'));assert.equal(inp.disabled,false);
  } finally {d.window.close();}
});
test('background changes flag Refresh without replacing an edited form',async()=>{
  const d=page('/b/b1');let changed=false,timer;
  try {
    d.window.setTimeout=fn=>{timer=fn;return 1;};d.window.clearTimeout=()=>{};
    Object.defineProperty(d.window.document,'hidden',{value:false});
    app(d,async table=>table==='tk_v_batch'?[{id:'b1',name:'Batch',status:'active',done:changed?1:0,tasks:2,lines:['Main']}]:[]);
    await tick();const input=d.window.document.createElement('input');input.value='Unsaved';d.window.document.getElementById('view').appendChild(input);
    changed=true;await timer();assert.equal(input.isConnected,true);assert.equal(input.value,'Unsaved');
    assert(d.window.document.getElementById('refresh').classList.contains('has-update'));
  } finally {d.window.close();}
});
test('photo resize keeps aspect ratio and never enlarges',()=>{
  const d=page();try {d.window.eval(source('photo-tools.js'));const fit=d.window.TK.photos.fit;
    assert.equal(fit(4000,3000,2000).width,2000);assert.equal(fit(4000,3000,2000).height,1500);assert.equal(fit(600,800,2000).height,800);
  } finally {d.window.close();}
});
