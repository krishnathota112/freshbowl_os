const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const src=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
function env(hash='/'){const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',{url:'http://localhost/app.html#'+hash,runScripts:'outside-only'});const w=d.window;w.TK={};w.confirm=()=>true;w.scrollTo=()=>{};['plan-duration.js','process-time-sop.js','plan-scheduler.js','turner-plan.js','schedule-grid.js'].forEach(n=>w.eval(src(n)));return {d,w,s:w.TK.scheduler};}
const row=(n,line='Main',start=null,duration=60,mode='stream')=>({title:'Task '+n,line,kind:'work',photos:'none',ask:'none',suggested_offset_minutes:start,planned_duration_minutes:duration,schedule_mode:mode,schedule_gap_minutes:0});
test('known durations automatically fill streams, before-batch anchors and independent piles',()=>{const {d,s}=env();try{
 const rows=[row(1,'Main',-120,30,'fixed'),row(2,'Main',0,120,'fixed'),row(3),row(4,'Paddy',4440,120,'fixed'),row(5),row(6,'Paddy'),{...row(7,'Turner · P1',10440,90,'fixed'),pile:'P1'},{...row(8,'Turner · P1'),pile:'P1'},{...row(9,'Turner · P2',10440,90,'fixed'),pile:'P2'}];
 assert.equal(s.recalculate(rows).length,0);assert.deepEqual(rows.map(r=>r.suggested_offset_minutes),[-120,0,120,4440,180,4560,10440,10530,10440]);
 const before={...rows[1]};rows[1].planned_duration_minutes=180;s.edit(rows,1,before,'stream');assert.equal(rows[2].suggested_offset_minutes,180);assert.equal(rows[4].suggested_offset_minutes,240);assert.equal(rows[3].suggested_offset_minutes,4440);
 }finally{d.window.close();}});
test('manual start changes cascade within scope and do not cross recorded rows',()=>{const {d,s}=env();try{
 const rows=[row(1,'Main',0,120,'fixed'),row(2,'Main',120,60,'fixed'),row(3,'Paddy',300,60,'fixed'),{...row(4,'Main',500,60,'fixed'),_locked:true,started_at:'real'},row(5,'Main',700,60,'fixed')];
 const before={...rows[0]};rows[0].suggested_offset_minutes=60;s.edit(rows,0,before,'stream');assert.deepEqual(rows.map(r=>r.suggested_offset_minutes),[60,180,300,500,700]);assert.equal(rows[3].started_at,'real');
 const all=rows.map(r=>({...r,_locked:false})),old={...all[0]};all[0].suggested_offset_minutes=120;s.edit(all,0,old,'batch');assert.deepEqual(all.map(r=>r.suggested_offset_minutes),[120,240,360,560,760]);
 }finally{d.window.close();}});
test('missing duration blocks a linked schedule, zero is valid, and explicit date makes a new anchor',()=>{const {d,s}=env();try{
 const rows=[row(1,'Main',0,null,'fixed'),row(2),row(3)];assert.equal(s.recalculate(rows).length,2);assert.equal(rows[1].suggested_offset_minutes,null);
 rows[0].planned_duration_minutes=0;assert.equal(s.recalculate(rows).length,0);assert.equal(rows[1].suggested_offset_minutes,0);
 const before={...rows[1]};rows[1].suggested_offset_minutes=90;s.edit(rows,1,before,'stream');assert.equal(rows[1].schedule_mode,'fixed');assert.equal(rows[2].suggested_offset_minutes,150);
 }finally{d.window.close();}});
test('bulk linking keeps pre-H0 and wetting anchors and supports whole-batch ordering',()=>{const {d,s}=env();try{
 const rows=[row(1,'Main',-300,20,'fixed'),row(2,'Main',0,120,'fixed'),row(3,'Main',400,30,'fixed'),row(4,'Paddy',1000,60,'fixed')];s.link(rows,'stream');assert.deepEqual(rows.map(r=>r.suggested_offset_minutes),[-300,0,120,1000]);
 s.link(rows,'batch');assert.equal(rows[3].suggested_offset_minutes,150);
 }finally{d.window.close();}});

test('first duration entry never pushes a same-time Lab check before wetting',()=>{const {d,s}=env();try{
 const rows=[row(1,'Main',0,null,'fixed'),{...row(2,'Main',0,0,'fixed'),kind:'lab'},row(3,'Main',180,60,'fixed')];
 const before={...rows[0]};rows[0].planned_duration_minutes=120;s.edit(rows,0,before,'stream');
 assert.deepEqual(rows.map(r=>r.suggested_offset_minutes),[0,120,300]);
 }finally{d.window.close();}});

test('mixed manual and linked chains shift once, preserve exact seconds and stop at recorded anchors',()=>{const {d,s}=env();try{
 const rows=[row(1,'Main',0.5,60,'fixed'),row(2),row(3,'Main',240.5,60,'fixed'),row(4),{...row(5,'Main',900.5,60,'stream'),_locked:true},row(6)];
 s.recalculate(rows);const before={...rows[0]};rows[0].suggested_offset_minutes=30.5;rows[0].planned_duration_minutes=120;s.edit(rows,0,before,'stream');
 assert.deepEqual(rows.map(r=>r.suggested_offset_minutes),[30.5,150.5,330.5,390.5,900.5,960.5]);
 const saved=JSON.parse(JSON.stringify(rows));s.recalculate(saved);assert.deepEqual(saved,rows);
 }finally{d.window.close();}});

test('deleting and inserting a linked row reflows following tasks in master order',()=>{const {d,w}=env();try{
 const grid=w.TK.scheduleGrid.mount(w.document.getElementById('view'),{rows:[row(1,'Main',0,120,'fixed'),row(2),row(3)],base:'2026-09-30T00:00:00Z'});
 w.document.querySelector('[data-row="1"] [data-action="delete"]').click();assert.equal(grid.read()[1].suggested_offset_minutes,120);
 w.document.querySelector('[data-row="1"] [data-action="copy"]').click();assert.equal(grid.read()[2].suggested_offset_minutes,180);
 grid.validate();
 }finally{d.window.close();}});
test('grid recalculates hidden Lab rows/pages, keeps edits on repeat reads and shifts across midnight',()=>{const {d,w}=env();try{
 const rows=Array.from({length:30},(_,i)=>({...row(i,'Main',i===0?0:null,60,i===0?'fixed':'stream'),kind:i===1?'lab':'work'}));
 const grid=w.TK.scheduleGrid.mount(w.document.getElementById('view'),{rows,base:'2026-09-30T22:00:00Z',allowPileResize:false});
 const h=w.document.querySelector('[data-row="0"] [data-field="duration_hours"]');h.value='2';h.dispatchEvent(new w.Event('change'));
 assert.equal(grid.read()[1].suggested_offset_minutes,120);assert.equal(grid.read()[29].suggested_offset_minutes,1800);assert.equal(grid.read()[29].suggested_offset_minutes,1800);
 w.document.querySelector('[data-filter="lab"]').click();assert.match(w.document.querySelector('[data-field="date"]').value,/2026-10-01|2026-09-30/);
 const date=w.document.querySelector('[data-field="date"]').value;grid.setBase('2026-10-02T22:00:00Z');assert.notEqual(w.document.querySelector('[data-field="date"]').value,date);assert.equal(grid.read()[29].suggested_offset_minutes,1800);
 }finally{d.window.close();}});
test('incomplete timing can be saved as draft but cannot be used as a finished batch plan',()=>{const {d,w}=env();try{
 const grid=w.TK.scheduleGrid.mount(w.document.getElementById('view'),{rows:[row(1,'Main',0,null,'fixed'),row(2)],base:'2026-09-30T00:00:00Z'});
 grid.validate(false);assert.throws(()=>grid.validate(),/timing setup/);assert.match(w.document.querySelector('[data-timing-msg]').textContent,/need setup/);
 }finally{d.window.close();}});
test('Task SOP keeps scheduling rules while Process Time SOP sets new-batch durations',async()=>{for(const route of ['/sop/s1','/new?sop=s1']){
 const {d,w}=env(route);try{const rows=[row(1,'Main',0,120,'fixed'),{...row(2,'Main',null,30),report_section:'Section',schedule_gap_minutes:10}];let payload;
 const sop={id:'s1',name:'Timed SOP',status:'draft',reference_h0:'2026-09-30T09:00:00Z',version:1};
 w.Auth={currentUser:()=>({id:'u',name:'Admin',role:'admin'}),ROLE_LABEL:{}};
 w.TK.api={select:async(t,p)=>t==='tk_sop'?[sop]:t==='tk_v_sop'?[{...sop,status:'published'}]:t==='tk_sop_row'?(p.limit?[]:rows):t==='tk_process_time_standard'?[{process_key:'task:work:main:task 1',planned_duration_minutes:180}]:[],rpc:async(fn,args)=>{payload={fn,args};return 2;}};
 w.eval(src('app.js'));await new Promise(r=>setImmediate(r));
 if(route.includes('/sop/')){assert.equal(w.document.querySelector('[data-row="0"] [data-field="duration_hours"]'),null);await w.document.getElementById('saveSop').onclick({currentTarget:w.document.getElementById('saveSop')});assert.equal(payload.args.p_rows[0].planned_duration_minutes,180);assert.equal(payload.args.p_rows[1].report_section,'Section');assert.equal(payload.args.p_rows[1].schedule_mode,'stream');assert.equal(payload.args.p_rows[1].suggested_offset_minutes,190);}
 else {assert.equal(w.document.querySelector('[data-row="0"] [data-field="duration_hours"]').value,'3');const at=w.document.querySelector('[data-row="1"] [data-field="date"]').value,start=w.document.getElementById('nbH0').value;assert.equal(Date.parse(at)-Date.parse(start),190*60000);}
 }finally{d.window.close();}}
});
