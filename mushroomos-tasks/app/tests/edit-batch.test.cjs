const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
test('individual removal uses the batch snapshot guard and preserves noted tasks',async()=>{
 for(const locked of [true,false]) {
  const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',{url:'http://localhost/app.html#/t/t2',runScripts:'outside-only'}),w=d.window,calls=[];
  try {
   w.scrollTo=()=>{};w.Auth={currentUser:()=>({role:'admin',name:'Admin'}),ROLE_LABEL:{}};
   const task={id:'t2',batch_id:'b1',batch_name:'Batch',batch_status:'active',status:'todo',kind:'work',line:'Main',title:'Unstarted',ord:2,photos:'none',ask:'none',note:locked?'Preserve this note':null};
   const plan={batch:{id:'b1',name:'Batch',note:'Batch note'},token:'latest-token',rows:[{id:'t1',status:'done',_locked:true},{...task,_locked:locked}]};
   w.TK={api:{select:async table=>table==='tk_v_task_v3'?[task]:[],rpc:async(fn,args)=>{calls.push({fn,args});if(fn==='tk_batch_plan_get')return plan;return 1;}}};
   w.eval(source('plan-duration.js'));w.eval(source('app.js'));await tick();await tick();
   const remove=w.document.querySelector('#removeT');assert(remove);remove.click();await tick();remove.click();await tick();await tick();
   assert(!calls.some(c=>c.fn==='tk_task_remove'));
   const save=calls.find(c=>c.fn==='tk_batch_plan_save');
   if(locked){assert(!save);assert.match(w.document.querySelector('#view').textContent,/recorded work or notes/);}
   else{assert.equal(save.args.p_expected,'latest-token');assert.equal(save.args.p_rows.length,1);assert.equal(save.args.p_rows[0].id,'t1');}
  }finally{d.window.close();}
 }
});
function fixture(){
 return {batch:{id:'b1',name:'Factory batch',note:'Original note',h0:'2026-09-28T09:00:37Z',status:'active'},token:'snapshot-token',rows:[
  {id:'t1',ord:1,title:'Recorded work',kind:'work',line:'Main',photos:'both',ask:'none',status:'done',suggested_at:'2026-09-28T10:00:37Z',_locked:true,note:'History'},
  {id:'t2',ord:2,title:'Next work',kind:'work',line:'Main',photos:'both',ask:'none',status:'todo',suggested_at:'2026-09-28T11:00:37Z',description:'Instructions',_locked:false},
  {id:'t3',ord:3,title:'Lab check',kind:'lab',line:'Main',photos:'none',ask:'none',status:'todo',suggested_at:null,_locked:false}
 ]};
}
function setup({role='admin',plan=fixture(),save=async()=>3,hash='/b/b1/edit',get}={}){
 const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',{url:'http://localhost/app.html#'+hash,runScripts:'outside-only'});
 const w=d.window,calls=[];w.scrollTo=()=>{};w.confirm=()=>true;
 w.Auth={currentUser:()=>({id:'user',name:'Admin',role}),ROLE_LABEL:{},signOut:async()=>{}};
 w.TK={api:{select:async(table)=>table==='tk_v_batch'?[plan.batch]:table==='tk_v_task_v3'?plan.rows:[],rpc:async(fn,args)=>{
  calls.push({fn,args});return fn==='tk_batch_plan_get'?(get?get():plan):save(args);
 }}};
 w.eval(source('turner-plan.js'));w.eval(source('plan-duration.js'));w.eval(source('plan-scheduler.js'));w.eval(source('schedule-grid.js'));w.eval(source('paddy-convergence.js'));w.eval(source('app.js'));
 return {d,w,calls};
}
test('existing editor protects recorded rows and duplicates without history/identity',async()=>{
 const {d,w}=setup();try{
  await tick();const row=w.document.querySelector('[data-row="0"]');
  assert(!row.querySelector('[data-field]'));assert(row.textContent.includes('protected'));
  for(const a of ['up','down','delete'])assert(row.querySelector(`[data-action="${a}"]`).disabled);
  assert(!w.document.querySelector('[data-piles]'));
  row.querySelector('[data-action="copy"]').click();
  assert(w.document.querySelector('[data-row="1"] [data-field="title"]'));
  let payload;w.TK.api.rpc=async(fn,args)=>{payload=args;throw new Error('hold');};
  await w.document.getElementById('ebForm').onsubmit({preventDefault(){}});
  assert.equal(payload.p_rows.length,4);const copied=payload.p_rows[1];
  for(const key of ['id','status','note','_locked','started_at'])assert.equal(copied[key],undefined);
  assert.equal(copied.title,'Recorded work');assert.equal(payload.p_rows[0].id,'t1');
 }finally{d.window.close();}
});
test('editor saves all Process/Lab rows, retained IDs, exact untouched timestamps and token',async()=>{
 let payload;const {d,w,calls}=setup({save:async a=>{payload=a;return 3;}});try{
  await tick();assert.equal(w.document.getElementById('title').textContent,'Edit batch · rows');
  assert.equal(calls[0].fn,'tk_batch_plan_get');
  w.document.querySelector('[data-row="1"] [data-field="title"]').value='Changed work';
  w.document.querySelector('[data-filter="lab"]').click();
  w.document.querySelector('[data-row="2"] [data-field="description"]').value='New lab context';
  w.document.getElementById('ebName').value='Renamed batch';
  await w.document.getElementById('ebForm').onsubmit({preventDefault(){}});
  assert.equal(payload.p_expected,'snapshot-token');assert.equal(payload.p_batch,'b1');
  assert.equal(payload.p_name,'Renamed batch');assert.equal(payload.p_rows.length,3);
  assert.equal(payload.p_rows[1].id,'t2');assert.equal(payload.p_rows[1].title,'Changed work');
  assert.equal(payload.p_rows[2].description,'New lab context');
  assert.equal(payload.p_rows[0].suggested_at,'2026-09-28T10:00:37Z');
  assert.equal(payload.p_rows[1].suggested_at,'2026-09-28T11:00:37Z');
  assert.equal(payload.p_rows[2].suggested_at,null);assert.equal(w.location.hash,'#/b/b1');
  assert.equal(w.onbeforeunload,null);await tick();
 }finally{d.window.close();}
});
test('save rejection keeps edits and re-enables form, never retries automatically',async()=>{
 let writes=0;const {d,w}=setup({save:async()=>{writes++;throw new Error('This batch changed while you were editing. Nothing was saved.');}});
 try{await tick();const input=w.document.querySelector('[data-row="1"] [data-field="title"]');input.value='Keep me';
  await w.document.getElementById('ebForm').onsubmit({preventDefault(){}});
  assert.equal(input.value,'Keep me');assert.equal(writes,1);assert(!w.document.getElementById('ebFields').disabled);
  assert(w.document.getElementById('ebMsg').textContent.includes('Nothing was saved'));assert.equal(w.location.hash,'#/b/b1/edit');
 }finally{d.window.close();}
});
test('changed and cleared calendar dates save exactly, even when batch start has seconds',async()=>{
 let payload;const {d,w}=setup({save:async a=>{payload=a;throw new Error('hold');}});
 try{await tick();w.document.querySelector('[data-row="1"] [data-field="date"]').value='2026-10-02T09:12';
  await w.document.getElementById('ebForm').onsubmit({preventDefault(){}});
  assert.equal(payload.p_rows[1].suggested_at,new Date('2026-10-02T09:12').toISOString());
  w.document.querySelector('[data-row="1"] [data-field="date"]').value='';
  await w.document.getElementById('ebForm').onsubmit({preventDefault(){}});assert.equal(payload.p_rows[1].suggested_at,null);
 }finally{d.window.close();}
});
test('double submit is disabled while saving and cancellation warns about unsaved edits',async()=>{
 let finish,writes=0;const {d,w}=setup({save:()=>{writes++;return new Promise(r=>{finish=r;});}});
 try{await tick();const input=w.document.querySelector('[data-row="1"] [data-field="title"]');input.value='Unsaved';input.dispatchEvent(new w.Event('input'));
  w.confirm=()=>false;w.document.getElementById('cancelBatch').click();await new Promise(r=>w.addEventListener('hashchange',r,{once:true}));await tick();
  assert.equal(w.location.hash,'#/b/b1/edit');assert.equal(input.isConnected,true);
  const submit=w.document.getElementById('ebForm').onsubmit;
  const pending=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(writes,1);assert(w.document.getElementById('ebFields').disabled);
  finish();await pending;await tick();
 }finally{d.window.close();}
});
test('removal requires confirmation before save',async()=>{
 const {d,w,calls}=setup();try{await tick();w.document.querySelector('[data-row="1"] [data-action="delete"]').click();w.confirm=()=>false;
  await w.document.getElementById('ebForm').onsubmit({preventDefault(){}});
  assert.equal(calls.filter(c=>c.fn==='tk_batch_plan_save').length,0);
 }finally{d.window.close();}
});
test('batch edit entry is only visible to Admin on open batches',async()=>{
 for(const [role,status,expected] of [['admin','active',true],['admin','closed',false],['supervisor','active',false]]){
  const plan=fixture();plan.batch.status=status;const {d,w}=setup({role,plan,hash:'/b/b1'});
  try{await tick();assert.equal(!!w.document.getElementById('editBatch'),expected);}finally{d.window.close();}
 }
});
test('non-Admin and closed-batch routes cannot load editable rows',async()=>{
 const plan=fixture();plan.batch.status='closed';
 for(const opts of [{role:'supervisor'},{plan}]){
  const {d,w,calls}=setup(opts);try{await tick();assert(!w.document.getElementById('ebForm'));if(opts.role)assert.equal(calls.length,0);}finally{d.window.close();}
 }
});
test('late plan response cannot replace a newer route',async()=>{
 let finish;const {d,w}=setup({get:()=>new Promise(r=>{finish=r;})});try{await tick();w.location.hash='#/';
  await new Promise(r=>w.addEventListener('hashchange',r,{once:true}));await tick();finish(fixture());await tick();
  assert(!w.document.getElementById('ebForm'));assert.equal(w.document.getElementById('title').textContent,'MushroomOS Tasks');
 }finally{d.window.close();}
});
test('Admin sees actionable Paddy shortfall and can change the convergence target without saving actuals',async()=>{
 const base=Date.parse('2030-10-01T00:00:00Z'),at=n=>new Date(base+n*60000).toISOString();
 const p=fixture();p.batch.h0=at(0);p.rows=[
  {id:'p0',ord:1,title:'Paddy preparation starts',line:'Paddy',kind:'work',status:'done',photos:'both',ask:'none',suggested_at:at(0),planned_duration_minutes:60,started_at:at(0),ended_at:at(60),_locked:true},
  {id:'p1',ord:2,title:'Paddy soak 1',line:'Paddy',kind:'work',status:'done',photos:'both',ask:'none',suggested_at:at(120),planned_duration_minutes:120,started_at:at(120),ended_at:at(420),_locked:true},
  {id:'p2',ord:3,title:'Paddy soak 2',line:'Paddy',kind:'work',status:'todo',photos:'both',ask:'none',suggested_at:at(360),planned_duration_minutes:120,_locked:false},
  {id:'c',ord:4,title:'Second convergence',line:'Main',kind:'work',status:'todo',photos:'both',ask:'none',suggested_at:at(600),planned_duration_minutes:60,_locked:false}
 ];
 const {d,w,calls}=setup({plan:p,hash:'/b/b1'});
 try {
  await tick();assert.match(w.document.querySelector('.convergence-alert').textContent,/Expected shortfall: 3h/);
  assert.match(w.document.querySelector('.convergence-alert').textContent,/Paddy soak 1 finished later/);
  w.location.hash='#/b/b1/edit';await new Promise(r=>w.addEventListener('hashchange',r,{once:true}));await tick();
  const target=w.document.querySelector('[data-paddy-target]');assert(target);
  const intended=new Date(base+780*60000);target.value=new Date(intended.getTime()-intended.getTimezoneOffset()*60000).toISOString().slice(0,16);
  target.dispatchEvent(new w.Event('change'));
  assert.match(w.document.getElementById('ebConvergence').textContent,/Paddy ready at the target/);
  assert.equal(calls.filter(c=>c.fn==='tk_batch_plan_save').length,0);
 } finally {d.window.close();}
});
