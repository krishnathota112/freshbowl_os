const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const src=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
const tick=(n=1)=>new Promise(resolve=>{let i=0;(function go(){setImmediate(()=>++i>=n?resolve():go());})();});
test('a slower earlier planner load cannot replace a newer snapshot',async()=>{
 const d=new JSDOM('<main></main>',{url:'http://localhost/',runScripts:'outside-only'}),w=d.window;
 try {
  w.TK={};w.scrollTo=()=>{};
  for(const file of ['plan-duration.js','plan-scheduler.js','day-plan.js','planning-views.js'])w.eval(src(file));
  const deferred=[];let count=0;
  const api={select:()=>{throw Error('selectAll should be used');},selectAll:async table=>{
   const value=table==='tk_v_batch'?[{id:'new',name:'NEW snapshot',h0:new Date().toISOString(),status:'active'}]:[];
   if(++count<=3)return new Promise(resolve=>deferred.push(()=>resolve(table==='tk_v_batch'?[{id:'old',name:'OLD snapshot',h0:new Date().toISOString(),status:'active'}]:[])));
   return value;
  }};
  const pane=w.document.querySelector('main'),ctx={api,isAdmin:false,current:()=>true,esc:s=>String(s??''),chip:()=>'',go:()=>{},taskSource:'tk_v_task_v3'};
  const old=w.TK.planning.mountMonthly(pane,ctx);await w.TK.planning.mountMonthly(pane,ctx);
  assert.match(pane.textContent,/NEW snapshot/);deferred.forEach(resolve=>resolve());await old;
  assert.match(pane.textContent,/NEW snapshot/);assert(!pane.textContent.includes('OLD snapshot'));
 }finally{d.window.close();}
});
const H0=new Date(2026,1,9,6,0,0).getTime();           // batch start: 9 Feb 2026 06:00 local
const at=(day,h,m=0)=>new Date(2026,1,day,h,m,0).toISOString();
function lib(){const d=new JSDOM('<main></main>',{url:'http://localhost/app.html',runScripts:'outside-only'}),w=d.window;w.TK={};['plan-duration.js','plan-scheduler.js','day-plan.js'].forEach(n=>w.eval(src(n)));return {d,P:w.TK.dayPlan,S:w.TK.scheduler};}
const planRow=(id,ord,start,mins,extra={})=>({id,ord,line:'Main',kind:'work',title:'Task '+ord,status:'todo',suggested_at:start,planned_duration_minutes:mins,schedule_mode:'fixed',schedule_gap_minutes:0,_locked:false,...extra});
const plan=(rows,status='active')=>({batch:{id:'b1',name:'339, 340, 341',note:null,h0:new Date(H0).toISOString(),status},rows,token:'tok'});

test('dates are local, month windows have the right length and day keys round-trip',()=>{const {d,P}=lib();try{
 assert.equal(P.key(new Date(2026,1,9,23,59)),'2026-02-09');assert.equal(P.addDays('2026-02-28',1),'2026-03-01');assert.equal(P.parse('2026-02-30'),null);
 assert.equal(P.monthDays('2026-02','2026-02-17').length,28);assert.equal(P.monthDays('2026-02','2026-02-17').filter(x=>x.today).length,1);
 assert.equal(P.addMonths('2026-12',1),'2027-01');assert.equal(P.parseMonth('2026-13'),null);
 }finally{d.window.close();}});

test('task state: done, running, waiting GM, past planned time, planned',()=>{const {d,P}=lib();try{
 const now=new Date(2026,1,13,12).getTime(),t=(status,when)=>({status,suggested_at:when});
 assert.equal(P.state(t('done',at(1,1)),now),'done');assert.equal(P.state(t('done_before',null),now),'done');assert.equal(P.state(t('running',at(13,8)),now),'running');
 assert.equal(P.state(t('submitted',at(13,8)),now),'waiting');assert.equal(P.state(t('todo',at(13,8)),now),'behind');assert.equal(P.state(t('todo',at(14,8)),now),'planned');assert.equal(P.state(t('todo',null),now),'planned');
 assert.equal(P.worst(['done','planned','behind']),'behind');assert.equal(P.worst(['done','done']),'done');assert.equal(P.worst([]),null);
 }finally{d.window.close();}});

test('the board places recorded work where it happened and the plan at planned hours; blocks snap to whole hours; parallel tasks get lanes',()=>{const {d,P}=lib();try{
 const now=new Date(2026,1,13,12,0).getTime();
 const t=(id,ord,start,mins,extra={})=>({id,ord,batch_id:'b1',batch_name:'B1',batch_status:'active',suggested_at:start,planned_duration_minutes:mins,status:'todo',...extra});
 const b=P.board([t('a',1,at(13,8,30),120),t('b',2,at(13,9),60),t('c',3,at(12,22),240),t('d',4,at(13,15),null),t('e',5,null,30),
  t('f',6,at(13,2),60,{status:'done',started_at:at(13,4,10),ended_at:at(13,6,40)}),t('g',7,at(10,8),60),t('h',8,at(13,10),60,{status:'running',started_at:at(13,11,20)})],'2026-02-13',1,now);
 assert.equal(b.batches.length,1);const g=b.batches[0],by=Object.fromEntries(g.items.map(i=>[i.task.id,i]));
 assert.equal(b.rows,24);assert.equal(b.hours.length,24);assert.equal(b.hours[0].dayStart,true);assert.equal(b.hours[0].label,'00 - 01');assert.equal(b.hours[23].label,'23 - 24');assert.equal(b.nowRow,12);
 assert(!by.e&&!by.g,'no planned time, or another day: not drawn');
 assert.deepEqual([by.a.rowStart,by.a.rowEnd,by.a.actual],[8,11,false],'08:30–10:30 snaps outward to rows 8–11');
 assert.equal(by.b.lane,1);assert.equal(g.lanes,2,'parallel tasks are separate lanes');
 assert.deepEqual([by.c.rowStart,by.c.rowEnd,by.c.cutBefore],[0,2,true],'a task from the previous evening is clipped at midnight');
 assert.deepEqual([by.d.rowStart,by.d.rowEnd,by.d.exact],[15,16,false],'no duration: one hour, flagged inexact');
 assert.deepEqual([by.f.rowStart,by.f.rowEnd,by.f.actual,by.f.state],[4,7,true,'done'],'recorded start/finish win over the plan');
 assert.deepEqual([by.h.rowStart,by.h.rowEnd,by.h.actual],[11,12,true],'a running task extends to now');
 const two=P.board([t('x',1,at(13,23),180)],'2026-02-13',2,now);assert.equal(two.rows,48);assert.deepEqual([two.batches[0].items[0].rowStart,two.batches[0].items[0].rowEnd],[23,26]);
 }finally{d.window.close();}});

test('month matrix: a row per open batch, counts per day, closed batches only when they have tasks, empty days stay empty',()=>{const {d,P}=lib();try{
 const t=(id,batch,when,status='todo',ord=1,mins=null)=>({id,batch_id:batch,batch_name:'B'+batch,batch_status:batch==='3'?'closed':'active',h0:new Date(H0).toISOString(),ord,suggested_at:when,status,planned_duration_minutes:mins});
 const m=P.monthMatrix([t('1','1',at(13,8)),t('2','1',at(13,14),'done',2),t('3','1',at(14,8)),t('4','3',at(10,8),'done'),t('5','2',at(20,20),'todo',5,72*60),t('6','2',at(27,20),'todo',6,72*60)],[{id:'1',name:'B1',status:'active',h0:new Date(H0).toISOString()},{id:'2',name:'B2',status:'active',h0:new Date(H0+86400000).toISOString()}],'2026-02',new Date(2026,1,13,12));
 assert.deepEqual([...m.rows.map(r=>r.batchId)],['1','2','3']);
 const c=m.rows[0].cells['2026-02-13'];assert.equal(c.tasks.length,2);assert.equal(c.done,1);assert.equal(c.state,'behind');
 assert.equal(m.rows[0].cells['2026-02-14'].state,'planned');assert.equal(m.rows[1].total,2);assert.deepEqual([...Object.keys(m.rows[1].cells)].filter(k=>k<'2026-02-24').sort(),['2026-02-20','2026-02-21','2026-02-22','2026-02-23'],'a 72 h stage shows on each day it covers');assert.equal(m.rows[2].cells['2026-02-10'].state,'done');
 assert.equal(m.days.find(x=>x.key==='2026-02-13').today,true);
 assert.equal(m.rows[1].cells['2026-02-20'].cont['5'],false);assert.equal(m.rows[1].cells['2026-02-21'].cont['5'],true);assert.equal(m.rows[1].cells['2026-02-23'].tasks.length,1);
 assert.equal(Object.keys(m.rows[1].cells).filter(k=>k>'2026-02-26').length,2,'a stage running past month end is clipped at the 28th');
 const early=P.monthMatrix([t('7','2',at(26,20),'todo',7,200*60)],[],'2026-03',new Date(2026,2,2));assert.equal(early.rows[0].total,0,'started last month: not counted as starting this month');assert(early.rows[0].cells['2026-03-01'].cont['7'],'but it still shows on the days it covers');
 }finally{d.window.close();}});

test('assign: moves only the chosen task by default, keeps untouched timestamps and shifts the stream on request',()=>{const {d,P,S}=lib();try{
 const rows=()=>[planRow('a',1,at(9,6),60),planRow('b',2,at(9,10),60),planRow('c',3,at(10,6),60),planRow('p',4,at(9,12),60,{line:'Paddy'})];
 rows()[0].suggested_at='2026-02-09T00:30:30.000Z';
 const one=P.assign(plan(rows()),'b',new Date(2026,1,13,8).getTime(),false,S);
 assert.equal(one.alsoMoved,0);assert.equal(one.rows.length,4);
 const get=(r,id)=>r.rows.find(x=>x.id===id);
 assert.equal(get(one,'b').suggested_at,at(13,8));assert.equal(get(one,'c').suggested_at,at(10,6));assert.equal(get(one,'a').suggested_at,at(9,6));
 const both=P.assign(plan(rows()),'b',new Date(2026,1,13,8).getTime(),true,S);
 assert.equal(get(both,'b').suggested_at,at(13,8));assert.equal(get(both,'c').suggested_at,at(14,4),'later fixed task of the same stream moves by the same 3d22h');assert.equal(get(both,'p').suggested_at,at(9,12),'other streams stay');assert.equal(both.alsoMoved,1);
 const original=[planRow('a',1,'2026-02-09T00:30:30.000Z',60),planRow('b',2,at(9,10),60)];
 assert.equal(P.assign(plan(original),'b',new Date(2026,1,9,11).getTime(),false,S).rows[0].suggested_at,'2026-02-09T00:30:30.000Z','seconds on untouched rows are preserved');
 }finally{d.window.close();}});

test('assign refuses recorded work, closed batches, missing tasks and moves that would orphan linked tasks',()=>{const {d,P,S}=lib();try{
 const t=ms=>new Date(2026,1,13,8).getTime()+ms;
 assert.throws(()=>P.assign(plan([planRow('a',1,at(9,6),60,{_locked:true,status:'running'})]),'a',t(0),false,S),/recorded work/);
 assert.throws(()=>P.assign(plan([planRow('a',1,at(9,6),60)],'closed'),'a',t(0),false,S),/closed/);
 assert.throws(()=>P.assign(plan([planRow('a',1,at(9,6),60)]),'zzz',t(0),false,S),/no longer in this batch/);
 assert.throws(()=>P.assign(plan([planRow('a',1,at(9,6),60)]),'a',NaN,false,S),/date and time/);
 // b follows a (linked) but a has no duration: re-anchoring a would leave b without a start.
 const linked=[planRow('a',1,at(9,6),null),planRow('b',2,at(9,7),60,{schedule_mode:'stream'})];
 assert.throws(()=>P.assign(plan(linked),'a',t(0),false,S),/without a start time/);
 // with a duration, the linked task follows its predecessor to the new day.
 const ok=P.assign(plan([planRow('a',1,at(9,6),60),planRow('b',2,at(9,7),30,{schedule_mode:'stream'})]),'a',new Date(2026,1,13,8).getTime(),false,S);
 assert.equal(ok.rows[1].suggested_at,at(13,9));
 }finally{d.window.close();}});

// ── screens ──────────────────────────────────────────────────────────────────────────────────────────────────
function page(role,data){
 const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',{url:'http://localhost/app.html#/',runScripts:'outside-only'}),w=d.window,rpcs=[],reads=[];
 w.scrollTo=()=>{};w.confirm=()=>true;w.Auth={currentUser:()=>({id:'u',name:'Test',role}),ROLE_LABEL:{},signOut:async()=>{}};w.TK={};
 w.TK.api={
  select:async(from,params)=>{reads.push({from,params});
   if(from==='tk_v_batch')return data.batches||[];
   if(from==='tk_v_task_v3'||from==='tk_v_task_v2'){
    if(params.and||params.or)return data.inWindow||[];
    if(params.batch_status==='eq.active'&&!params.status&&!params.batch_id&&!params.suggested_at){const seen=new Map();[...(data.inWindow||[]),...(data.open||[])].forEach(t=>seen.set(t.id,t));return data.all||[...seen.values()];}
    if(params.suggested_at==='is.null')return (data.open||[]).filter(t=>!t.suggested_at);
    if(params.batch_id)return (data.open||[]).filter(t=>'eq.'+t.batch_id===params.batch_id&&t.status==='todo');
    return data.open||[];}
   return [];},
  rpc:async(fn,args)=>{rpcs.push({fn,args});if(data.rpc)return data.rpc(fn,args);return null;}};
 ['plan-duration.js','plan-scheduler.js','paddy-convergence.js','day-plan.js','planning-views.js','app.js'].forEach(n=>w.eval(src(n)));
 return {d,w,rpcs,reads};
}
const today=new Date(),tdy=(h,m=0)=>new Date(today.getFullYear(),today.getMonth(),today.getDate(),h,m).toISOString();
const task=(id,ord,when,over={})=>({id,batch_id:'b1',batch_name:'339, 340, 341',batch_status:'active',h0:new Date(H0).toISOString(),ord,line:'Main',title:'Task '+ord,kind:'work',status:'todo',suggested_at:when,planned_duration_minutes:60,can_start:true,...over});
const fixture=()=>{const a=task('t1',1,tdy(0,5),{status:'done'}),b=task('t2',2,tdy(23,0)),c=task('t3',3,null),old=task('t0',0,new Date(2026,0,5,8).toISOString(),{status:'running'});return {inWindow:[a,b],open:[b,c,old],batches:[{id:'b1',name:'339, 340, 341',status:'active',h0:new Date(H0).toISOString()}]};};
async function openTab(w,name){await tick(3);const tab=w.document.querySelector('[data-tab="'+name+'"]');assert(tab,name+' tab');tab.click();await tick(8);return w.document.getElementById('pane');}

test('Admin sees both new sidebar entries; field roles see read-only Daily tasks and the chart',async()=>{
 for(const [role,label] of [['admin','Assign daily tasks'],['supervisor','Daily tasks'],['lab_tech','Daily tasks'],['gm','Daily tasks']]){
  const {d,w}=page(role,fixture());try{await tick(3);
   const text=w.document.querySelector('[data-tab="daily"]').textContent;assert(text.endsWith(label),role+': '+text);assert.equal(/Assign/.test(text),role==='admin',role);
   assert.match(w.document.querySelector('[data-tab="monthly"]').textContent,/Monthly task chart/,role);
  }finally{d.window.close();}}
});

test('the daily sheet lists the day\'s planned tasks, carried-over work and undated tasks; Admin gets Move/Assign',async()=>{
 const {d,w,rpcs}=page('admin',fixture());try{
  const pane=await openTab(w,'daily');
  assert.match(pane.textContent,/2 tasks planned/);assert.match(pane.textContent,/Task 1/);assert.match(pane.textContent,/Task 2/);
  assert.match(pane.textContent,/Carried over/);assert.match(pane.textContent,/Task 0/);assert.match(pane.textContent,/Not on a day yet/);assert.match(pane.textContent,/Task 3/);
  assert(pane.querySelector('.dp-board .dp-block'),'board blocks');assert(pane.querySelector('.dp-board .dp-bh'),'a batch column header');
  assert(pane.querySelector('[data-dp-assign]'),'assign card');
  assert.equal(pane.querySelectorAll('[data-dp-move]').length,2,'only unstarted tasks (Task 2, Task 3) can be moved; the running and done ones cannot');
  assert.equal(rpcs.length,0,'viewing writes nothing');
 }finally{d.window.close();}
});

test('Supervisor, Lab and GM get the same sheet without any Move/Assign control',async()=>{
 for(const role of ['supervisor','lab_tech','gm']){const {d,w,rpcs}=page(role,fixture());try{
  const pane=await openTab(w,'daily');assert.match(pane.textContent,/Task 2/);assert(!pane.querySelector('[data-dp-move],[data-dp-assign]'),role);assert.equal(rpcs.length,0);
 }finally{d.window.close();}}
});

test('Admin moves a task: reads the plan, then saves the whole plan with only that task changed',async()=>{
 const f=fixture(),rows=[planRow('t2',2,tdy(23,0),60),planRow('t3',3,null,60),planRow('t1',1,tdy(0,5),60,{status:'done',_locked:true})];
 f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(rows):3;
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily');
  pane.querySelector('[data-dp-move="t3"]').click();
  const form=pane.querySelector('[data-dp-moveform="t3"]');assert(form);
  form.querySelector('[data-m-date]').value=w.TK.dayPlan.key(new Date(today.getFullYear(),today.getMonth(),today.getDate()+2));form.querySelector('[data-m-time]').value='09:30';
  form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
  const save=rpcs[1].args;assert.equal(save.p_batch,'b1');assert.equal(save.p_expected,'tok');assert.equal(save.p_name,'339, 340, 341');assert.equal(save.p_rows.length,3);
  const moved=save.p_rows.find(r=>r.id==='t3');assert.equal(new Date(moved.suggested_at).getHours(),9);assert.equal(new Date(moved.suggested_at).getMinutes(),30);
  assert.equal(save.p_rows.find(r=>r.id==='t2').suggested_at,tdy(23,0));assert.equal(save.p_rows.find(r=>r.id==='t1').suggested_at,tdy(0,5));
 }finally{d.window.close();}
});

test('a refused move shows the server\'s words and keeps the form; nothing else is called',async()=>{
 const f=fixture();f.rpc=async fn=>{if(fn==='tk_batch_plan_get')return plan([planRow('t2',2,tdy(23,0),60),planRow('t3',3,null,60)]);throw new Error('This batch changed while you were editing. Nothing was saved.');};
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily');pane.querySelector('[data-dp-move="t3"]').click();
  const form=pane.querySelector('[data-dp-moveform="t3"]');form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(8);
  assert.match(pane.querySelector('[data-dp-moveform="t3"] [data-m-msg]').textContent,/Nothing was saved/);assert.equal(rpcs.length,2);
 }finally{d.window.close();}
});

test('the Assign card moves a chosen task onto the viewed day',async()=>{
 const f=fixture(),rows=[planRow('t2',2,tdy(23,0),60),planRow('t3',3,null,60)];f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(rows):2;
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily');const form=pane.querySelector('[data-dp-assign]');
  const options=[...form.querySelectorAll('[data-a-task] option')].map(o=>o.textContent);assert(options.some(t=>/Task 3 \(Process\) — no date yet/.test(t)));assert(options.some(t=>/Task 2 \(Process\) — now/.test(t)));
  const sel=form.querySelector('[data-a-task]');sel.value=String([...sel.options].findIndex(o=>/Task 3/.test(o.textContent)));form.querySelector('[data-a-time]').value='07:15';
  form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
  const moved=rpcs[1].args.p_rows.find(r=>r.id==='t3');assert.equal(moved.suggested_at,tdy(7,15));
 }finally{d.window.close();}
});

test('the monthly chart shows a batch row with day cells, opens a day drawer, and Admin can assign from it',async()=>{
 const f=fixture();f.inWindow=[task('t1',1,tdy(0,5),{status:'done'}),task('t2',2,tdy(23,0))];
 const rows=[planRow('t2',2,tdy(23,0),60),planRow('t3',3,null,60)];f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(rows):2;
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'monthly');
  assert.match(pane.querySelector('.dp-monthname').textContent,/20\d\d/);assert.match(pane.querySelector('.dp-bcol b').textContent,/339, 340, 341/);
  const cell=pane.querySelector('.dp-cell:not(.empty)');assert(cell,'a day cell with tasks');assert.match(cell.textContent,/Task 1/);assert.match(cell.textContent,/Task 2/);
  cell.click();await tick(3);const drawer=pane.querySelector('.dp-drawer');assert(drawer);assert.match(drawer.textContent,/Task 1/);assert.match(drawer.textContent,/Task 2/);
  const form=drawer.querySelector('[data-dp-assign]');await tick(5);assert(form.querySelector('[data-a-task] option'));
  form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
 }finally{d.window.close();}
});

test('the monthly chart for a field role is read-only and writes nothing',async()=>{
 const f=fixture();f.inWindow=[task('t1',1,tdy(8),{status:'running'})];
 const {d,w,rpcs}=page('supervisor',f);try{
  const pane=await openTab(w,'monthly');assert(!pane.querySelector('.dp-cell.empty'),'no add buttons');
  pane.querySelector('.dp-cell').click();await tick(3);assert(pane.querySelector('.dp-drawer'));assert(!pane.querySelector('[data-dp-assign],[data-dp-move]'));assert.equal(rpcs.length,0);
 }finally{d.window.close();}
});

test('clicking a day header opens that day in the daily sheet',async()=>{
 const {d,w}=page('admin',fixture());try{
  const pane=await openTab(w,'monthly');pane.querySelector('[data-dp-pickday]').click();await tick(8);
  const next=w.document.getElementById('pane');assert(next.querySelector('[data-dp-date]'),'daily toolbar');assert.equal(next.querySelector('[data-dp-date]').value.slice(-2),'01');
 }finally{d.window.close();}
});

// ── colours, editing, drag, full screen (6 Oct, second round) ───────────────────────────────────────────────
test('tone: orange for a task, white for rest, red for a missed one; recorded work is never red',()=>{const {d,P}=lib();try{
 const now=new Date(2026,1,13,12).getTime(),t=(kind,status,when)=>({kind,status,suggested_at:when});
 assert.equal(P.tone(t('work','todo',at(14,8)),now),'task');assert.equal(P.tone(t('cleaning','todo',at(14,8)),now),'task');assert.equal(P.tone(t('lab','todo',at(14,8)),now),'task');
 assert.equal(P.tone(t('rest','todo',at(14,8)),now),'rest');
 assert.equal(P.tone(t('work','todo',at(13,8)),now),'missed','planned time passed, never started');assert.equal(P.tone(t('rest','todo',at(13,8)),now),'missed');
 assert.equal(P.tone(t('work','running',at(13,8)),now),'task');assert.equal(P.tone(t('work','done',at(13,8)),now),'task');assert.equal(P.tone(t('rest','done',at(13,8)),now),'rest');
 assert.equal(P.tone(t('work','todo',null),now),'task','no planned time cannot be missed');
 }finally{d.window.close();}});

test('edit: name, type and duration change without moving the start; rest drops the photo requirement; Lab type is refused',()=>{const {d,P,S}=lib();try{
 const rows=()=>[planRow('a',1,at(9,6),60,{photos:'both'}),planRow('b',2,at(9,10),60,{schedule_mode:'stream',photos:'both'}),planRow('lab',3,at(9,12),0,{kind:'lab',photos:'none'})];
 const r=P.edit(plan(rows()),'a',{title:'  Bagasse weighment ',kind:'rest',minutes:180},false,S);
 const a=r.rows.find(x=>x.id==='a'),b=r.rows.find(x=>x.id==='b');
 assert.equal(a.title,'Bagasse weighment');assert.equal(a.kind,'rest');assert.equal(a.photos,'none');assert.equal(a.planned_duration_minutes,180);assert.equal(a.suggested_at,at(9,6),'start untouched');assert.equal(a.schedule_mode,'fixed');
 assert.equal(b.suggested_at,at(9,9),'a linked follower follows the new end (06:00 + 3 h)');assert.equal(r.alsoMoved,1);
 const back=P.edit(plan([planRow('a',1,at(9,6),60,{kind:'rest',photos:'none'})]),'a',{kind:'work'},false,S).rows[0];assert.equal(back.photos,'both');
 assert.equal(P.edit(plan(rows()),'lab',{kind:'work'},false,S).rows.find(x=>x.id==='lab').kind,'work','Lab ↔ Process is allowed now');
 assert.throws(()=>P.edit(plan([planRow('g',1,at(9,6),0,{kind:'lab_gate',photos:'none'})]),'g',{kind:'work'},false,S),/Lab gate/);
 assert.throws(()=>P.edit(plan(rows()),'a',{title:'   '},false,S),/name/);
 assert.throws(()=>P.edit(plan(rows()),'a',{minutes:-5},false,S),/duration/);
 assert.throws(()=>P.edit(plan(rows()),'a',{title:'x'.repeat(201)},false,S),/200/);
 const same=P.edit(plan(rows()),'a',{title:'Task 1'},false,S);assert.equal(same.rows.find(x=>x.id==='a').suggested_offset_minutes,(Date.parse(at(9,6))-H0)/60000,'a rename alone does not re-anchor the time');
 assert.equal(same.rows.find(x=>x.id==='b').schedule_mode,'stream','and linked followers stay linked');
 }finally{d.window.close();}});

const nowKeys=()=>{const t=new Date(),k=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');return {t,k,other:t.getDate()===1?2:t.getDate()-1};};
const dayKey=(t,n)=>t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(n).padStart(2,'0');
function monthFixture(){const t0=new Date(),at2=(h,m)=>new Date(t0.getFullYear(),t0.getMonth(),t0.getDate(),h,m).toISOString();
 const f={batches:[{id:'b1',name:'339, 340, 341',status:'active',h0:new Date(H0).toISOString()}]};
 f.inWindow=[task('m1',1,at2(0,1),{title:'Missed one'}),task('k1',2,at2(23,58),{title:'Future task'}),task('r1',3,at2(23,57),{kind:'rest',title:'Resting',can_start:true}),task('s1',4,at2(9,0),{title:'Dragged one'}),task('d1',5,at2(0,2),{status:'done',title:'Done one',started_at:at2(0,3),ended_at:at2(0,50)})];
 f.open=f.inWindow.filter(x=>x.status==='todo');
 f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(f.inWindow.map((x,i)=>planRow(x.id,x.ord,x.suggested_at,60,{title:x.title,kind:x.kind,status:x.status,_locked:x.status!=='todo'}))):2;
 return f;}

test('month cells are orange for tasks, white for rest and red for missed, with marks for done',async()=>{
 const f=monthFixture();f.inWindow=f.inWindow.filter(x=>x.id!=='s1').map(x=>x.id==='d1'?{...x,batch_id:'b2',batch_name:'342, 343, 344'}:x);f.open=f.inWindow.filter(x=>x.status==='todo');f.batches.push({id:'b2',name:'342, 343, 344',status:'active',h0:new Date(H0).toISOString()});
 const {d,w}=page('admin',f);try{
  const pane=await openTab(w,'monthly'),{k}=nowKeys();
  const cell=pane.querySelector('[data-dp-cell="b1|'+k+'"]');assert(cell,'today cell');
  const line=t=>[...pane.querySelectorAll('[data-dp-cell$="|'+k+'"] .dp-line')].find(l=>l.textContent.includes(t));
  assert(line('Missed one').classList.contains('t-missed'));assert(line('Future task').classList.contains('t-task'));assert(line('Resting').classList.contains('t-rest'));
  assert(line('Done one').classList.contains('t-task'));assert.match(line('Done one').textContent,/^✓/);
  assert(cell.classList.contains('has-missed'));
  assert.match(pane.querySelector('.dp-legend').textContent,/Task.*Rest.*Missed/s);
  assert.equal(pane.querySelectorAll('.dp-month thead th').length,3,'one date column + two batches');assert.equal(pane.querySelectorAll('.dp-dayrow:first-child th').length,1,'one sticky date column, no second offset column');
 }finally{d.window.close();}
});

test('chart: drag a task line to another day of its batch saves the new date and keeps the time of day',async()=>{
 const f=monthFixture(),{d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'monthly'),{t,k,other}=nowKeys(),target=dayKey(t,other);
  const line=pane.querySelector('.dp-line[data-dp-drag="s1"]');assert(line,'draggable line');assert(!pane.querySelector('.dp-line[data-dp-drag="d1"]'),'recorded work is not draggable');
  line.dispatchEvent(new w.Event('dragstart',{bubbles:true,cancelable:true}));
  const cell=pane.querySelector('[data-dp-cell="b1|'+target+'"]');
  const over=new w.Event('dragover',{bubbles:true,cancelable:true});cell.dispatchEvent(over);assert.equal(over.defaultPrevented,true,'a cell of the same batch accepts the drop');
  cell.dispatchEvent(new w.Event('drop',{bubbles:true,cancelable:true}));await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
  const moved=rpcs[1].args.p_rows.find(r=>r.id==='s1'),at9=new Date(moved.suggested_at);
  assert.equal(P_key(w,at9),target);assert.equal(at9.getHours(),9);assert.equal(at9.getMinutes(),0);
  assert.equal(rpcs[1].args.p_rows.find(r=>r.id==='k1').suggested_at,f.inWindow.find(x=>x.id==='k1').suggested_at,'other tasks untouched');
 }finally{d.window.close();}
});
const P_key=(w,d)=>w.TK.dayPlan.key(d);

test('chart: a drop onto a different batch is refused with a message and nothing is saved; field roles cannot drag',async()=>{
 const f=monthFixture();f.batches.push({id:'b2',name:'342, 343, 344',status:'active',h0:new Date(H0).toISOString()});
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'monthly'),{k}=nowKeys();
  pane.querySelector('.dp-line[data-dp-drag="s1"]').dispatchEvent(new w.Event('dragstart',{bubbles:true,cancelable:true}));
  const other=pane.querySelector('[data-dp-cell="b2|'+k+'"]');const over=new w.Event('dragover',{bubbles:true,cancelable:true});other.dispatchEvent(over);assert.equal(over.defaultPrevented,false);
  other.dispatchEvent(new w.Event('drop',{bubbles:true,cancelable:true}));await tick(3);
  assert.match(pane.querySelector('#dpNote').textContent,/own batch/);assert.equal(rpcs.length,0);
 }finally{d.window.close();}
 const sup=page('supervisor',monthFixture());try{const pane=await openTab(sup.w,'monthly');assert(!pane.querySelector('[draggable=true]'),'no draggable lines for a field role');}finally{sup.d.window.close();}
});

test('editor: Edit shows a table-like row; saving sends only what changed, with the new name and duration',async()=>{
 const f=fixture(),rows=[planRow('t2',2,tdy(23,0),60,{title:'Task 2'}),planRow('t3',3,null,60,{title:'Task 3'})];f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(rows):2;
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily');pane.querySelector('[data-dp-move="t2"]').click();
  const form=pane.querySelector('[data-dp-moveform="t2"]');assert(form.querySelector('[data-m-title]')&&form.querySelector('[data-m-kind]')&&form.querySelector('[data-m-h]'));
  assert.equal(form.querySelector('[data-m-title]').value,'Task 2');assert.equal(form.querySelector('[data-m-h]').value,'1');assert.equal(form.querySelector('[data-m-kind]').value,'work');
  form.querySelector('[data-m-submit]');form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(4);
  assert.match(form.querySelector('[data-m-msg]').textContent,/Nothing was changed/);assert.equal(rpcs.length,0,'no change, no write');
  form.querySelector('[data-m-title]').value='Bagasse wetting (renamed)';form.querySelector('[data-m-kind]').value='rest';form.querySelector('[data-m-h]').value='2';form.querySelector('[data-m-min]').value='30';
  form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
  const saved=rpcs[1].args.p_rows.find(r=>r.id==='t2');assert.equal(saved.title,'Bagasse wetting (renamed)');assert.equal(saved.kind,'rest');assert.equal(saved.planned_duration_minutes,150);assert.equal(saved.suggested_at,tdy(23,0),'start unchanged');
 }finally{d.window.close();}
});

test('editor: a bad duration is explained and nothing is saved; a Lab gate cannot be switched but a Lab task can',async()=>{
 const f=fixture();f.open.push(task('lab1',9,tdy(10),{kind:'lab',title:'Lab check'}));f.inWindow.push(f.open[f.open.length-1]);
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily');pane.querySelector('[data-dp-move="t2"]').click();
  const form=pane.querySelector('[data-dp-moveform="t2"]');form.querySelector('[data-m-min]').value='75';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(4);
  assert.match(form.querySelector('[data-m-msg]').textContent,/0–59 minutes/);assert.equal(rpcs.length,0);
  pane.querySelector('[data-dp-move="lab1"]').click();assert.equal(pane.querySelector('[data-dp-moveform="lab1"] [data-m-kind]').disabled,false,'a Lab task can become Process');
 }finally{d.window.close();}
});

test('board: dragging a planned block to another hour of its batch re-plans it (minutes kept); recorded blocks are not draggable',async()=>{
 const f=fixture(),rows=[planRow('t2',2,tdy(23,0),60,{title:'Task 2'}),planRow('t3',3,null,60,{title:'Task 3'})];f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(rows):2;
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily');
  assert(pane.querySelector('.dp-block[data-dp-drag="t2"]'),'planned block is draggable');assert(!pane.querySelector('.dp-block[data-dp-drag="t1"]'),'t1 is done');
  const grid=pane.querySelector('.dp-boardgrid');pane.querySelector('.dp-block[data-dp-drag="t2"]').dispatchEvent(new w.Event('dragstart',{bubbles:true,cancelable:true}));
  const bg=grid.querySelector('.dp-bbg');const over=new w.MouseEvent('dragover',{bubbles:true,cancelable:true,clientY:30+28*5+3});bg.dispatchEvent(over);assert.equal(over.defaultPrevented,true);
  bg.dispatchEvent(new w.MouseEvent('drop',{bubbles:true,cancelable:true,clientY:30+28*5+3}));await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
  assert.equal(rpcs[1].args.p_rows.find(r=>r.id==='t2').suggested_at,tdy(5,0),'row 5 = 05:00');
 }finally{d.window.close();}
});

test('full screen: the pane enters and leaves full screen (button and Esc); a save keeps it',async()=>{
 const f=monthFixture(),{d,w}=page('admin',f);try{
  const pane=await openTab(w,'monthly'),btn=()=>pane.querySelector('[data-dp-full]');
  assert.match(btn().textContent,/Full screen/);btn().click();assert(pane.classList.contains('dp-full'));assert(w.document.documentElement.classList.contains('dp-fs-open'));assert.match(btn().textContent,/Exit full screen/);assert.equal(btn().getAttribute('aria-pressed'),'true');
  pane.querySelector('[data-dp-next]').click();await tick(8);assert(pane.classList.contains('dp-full'),'navigating inside full screen keeps it');assert.match(btn().textContent,/Exit full screen/);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert(!pane.classList.contains('dp-full'));assert(!w.document.documentElement.classList.contains('dp-fs-open'));assert.match(btn().textContent,/Full screen/);
  btn().click();assert(pane.classList.contains('dp-full'));btn().click();assert(!pane.classList.contains('dp-full'));
 }finally{d.window.close();}
});

test('full screen is released when the tab changes, so the page is never left locked',async()=>{
 const {d,w}=page('admin',monthFixture());try{
  const pane=await openTab(w,'monthly');pane.querySelector('[data-dp-full]').click();assert(w.document.documentElement.classList.contains('dp-fs-open'));
  w.document.querySelector('[data-tab="daily"]').click();await tick(8);
  assert(!w.document.documentElement.classList.contains('dp-fs-open'));assert(!w.document.getElementById('pane').classList.contains('dp-full'));
 }finally{d.window.close();}
});

// ── round three: batch start, add/remove, types, Paddy convergence ───────────────────────────────────────────
test('shiftBatch: every unstarted task moves by the same amount so the first lands on the new start; recorded rows stay',()=>{const {d,P,S}=lib();try{
 const rows=()=>[planRow('a',1,at(9,6),60),planRow('b',2,at(9,7),60,{schedule_mode:'stream'}),planRow('c',3,at(9,8),60,{status:'done',_locked:true}),planRow('u',4,null,60),planRow('p',5,at(11,6),60,{line:'Paddy'})];
 const r=P.shiftBatch(plan(rows()),new Date(2026,1,10,6).getTime(),S),by=id=>r.rows.find(x=>x.id===id);
 assert.equal(r.delta,86400000);assert.equal(by('a').suggested_at,at(10,6));assert.equal(by('b').suggested_at,at(10,7),'a linked task moves with it');assert.equal(by('p').suggested_at,at(12,6),'other streams move too');
 assert.equal(by('c').suggested_at,at(9,8),'recorded work does not move');assert.equal(by('u').suggested_at,null,'an undated task stays undated');assert.equal(r.rows.length,5);
 const back=P.shiftBatch(plan(rows()),new Date(2026,1,8,18).getTime(),S);assert.equal(back.rows.find(x=>x.id==='a').suggested_at,at(8,18));assert.equal(back.delta,-12*3600000);
 assert.equal(P.shiftBatch(plan(rows()),new Date(2026,1,9,6).getTime(),S).delta,0,'no change');
 assert.throws(()=>P.shiftBatch(plan([planRow('c',1,at(9,8),60,{_locked:true,status:'done'})]),at(10,6),S),/No unstarted task/);
 assert.throws(()=>P.shiftBatch(plan(rows(),'closed'),at(10,6),S),/closed/);assert.throws(()=>P.shiftBatch(plan(rows()),NaN,S),/date and time/);
 const a=P.anchor(rows().map(r=>({...r,suggested_at:r.suggested_at})));assert.equal(a.ms,Date.parse(at(9,6)));assert.equal(a.started,true);assert.equal(a.movable,3);
 }finally{d.window.close();}});

test('addTask: appends a new row of the chosen type with that type\'s defaults and refuses incomplete input',()=>{const {d,P,S}=lib();try{
 const base=()=>plan([planRow('a',1,at(9,6),60),planRow('b',2,at(9,8),60)]);
 const r=P.addTask(base(),{title:' Bunker rain washing ',kind:'cleaning',startAt:new Date(2026,1,12,7,30).getTime(),minutes:90},S),n=r.rows[2];
 assert.equal(r.rows.length,3);assert.equal(n.id,null);assert.equal(n.ord,3);assert.equal(n.title,'Bunker rain washing');assert.equal(n.kind,'cleaning');assert.equal(n.line,'Cleaning');assert.equal(n.photos,'both');assert.equal(n.suggested_at,at(12,7,30));assert.equal(n.planned_duration_minutes,90);assert.equal(n.schedule_mode,'fixed');assert.equal(r.rows[0].id,'a');
 const lab=P.addTask(base(),{title:'Lab: moisture',kind:'lab',startAt:at(12,8),minutes:null},S).rows[2];assert.equal(lab.photos,'none');assert.equal(lab.line,'Main');assert.equal(lab.planned_duration_minutes,null);
 assert.equal(P.addTask(base(),{title:'x',kind:'work',line:' Paddy ',startAt:at(12,8)},S).rows[2].line,'Paddy');assert.equal(P.addTask(base(),{title:'r',kind:'rest',startAt:at(12,8)},S).rows[2].photos,'none');
 assert.throws(()=>P.addTask(base(),{title:'  ',kind:'work',startAt:at(12,8)},S),/name/);assert.throws(()=>P.addTask(base(),{title:'x',kind:'lab_gate',startAt:at(12,8)},S),/Process, Rest, Lab or Cleaning/);
 assert.throws(()=>P.addTask(base(),{title:'x',kind:'work',startAt:NaN},S),/date and time/);assert.throws(()=>P.addTask(base(),{title:'x',kind:'work',startAt:at(12,8),minutes:-1},S),/duration/);assert.throws(()=>P.addTask(plan([],'closed'),{title:'x',kind:'work',startAt:at(12,8)},S),/closed/);
 }finally{d.window.close();}});

test('edit: stream, description and timing mode change; Remove drops the row and re-links followers; recorded rows cannot be removed',()=>{const {d,P,S}=lib();try{
 const rows=()=>[planRow('a',1,at(9,6),60),planRow('b',2,at(9,7),60,{schedule_mode:'stream'}),planRow('c',3,at(9,8),60,{schedule_mode:'stream'}),planRow('x',4,at(9,6),60,{pile:'P1',line:'Turner · P1'}),planRow('z',5,at(9,10),60,{line:'Soak'})];
 const r=P.edit(plan(rows()),'z',{line:'Paddy',description:'  Soak the bales ',scheduleMode:'fixed'},false,S).rows.find(x=>x.id==='z');assert.equal(r.line,'Paddy');assert.equal(r.description,'Soak the bales');
 const linked=P.edit(plan(rows()),'c',{scheduleMode:'stream',gap:30},false,S).rows.find(x=>x.id==='c');assert.equal(linked.schedule_gap_minutes,30);assert.equal(linked.suggested_at,at(9,8,30),'recalculated: after b ends (08:00) + 30 min');
 const gone=P.edit(plan(rows()),'b',{remove:true},false,S);assert.deepEqual(gone.rows.map(x=>x.id),['a','c','x','z']);assert.equal(gone.rows.find(x=>x.id==='c').suggested_at,at(9,7),'c now follows a');
 assert.throws(()=>P.edit(plan(rows()),'a',{scheduleMode:'sideways'},false,S),/timed/);assert.throws(()=>P.edit(plan(rows()),'a',{gap:1.5},false,S),/whole minutes/);assert.throws(()=>P.edit(plan(rows()),'x',{line:'Main'},false,S),/pile/);
 assert.throws(()=>P.edit(plan([planRow('a',1,at(9,6),60,{_locked:true,status:'done'})]),'a',{remove:true},false,S),/recorded work/);
 }finally{d.window.close();}});

test('restart sets exact planned starts for chosen rows (Paddy suggestions), skips recorded rows and refuses when nothing can change',()=>{const {d,P,S}=lib();try{
 const rows=[planRow('a',1,at(9,6),60),planRow('b',2,at(9,9),60),planRow('c',3,at(9,12),60,{_locked:true,status:'done'})];
 const r=P.restart(plan(rows),[{index:1,start:new Date(2026,1,9,11).getTime()},{index:2,start:new Date(2026,1,9,15).getTime()}],S);
 assert.equal(r.applied,1);assert.equal(r.rows[1].suggested_at,at(9,11));assert.equal(r.rows[2].suggested_at,at(9,12));assert.equal(r.rows[1].schedule_mode,'fixed');
 assert.throws(()=>P.restart(plan(rows),[{index:2,start:at(9,15)}],S),/recorded work/);
 }finally{d.window.close();}});

function paddyRows(){const t=(id,ord,h,mins,title,line='Paddy',extra={})=>planRow(id,ord,new Date(H0+h*3600000).toISOString(),mins,{title,line,...extra});
 return [t('pp',1,0,60,'Paddy preparation'),t('s1',2,3,120,'Paddy soak 1'),t('s2',3,7,120,'Paddy soak 2'),t('cv',4,12,60,'Second convergence','Main')];}
const paddyTasks=rows=>rows.map(r=>({...r,batch_id:'b1',batch_name:'339, 340, 341',batch_status:'active',h0:new Date(H0).toISOString(),can_start:true}));
function paddyFixture(){const tasks=paddyTasks(paddyRows()),f={batches:[{id:'b1',name:'339, 340, 341',status:'active',h0:new Date(H0).toISOString(),note:null}],inWindow:[],open:tasks,all:tasks};
 f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(paddyRows()):4;return f;}

test('Paddy: the batch shows its convergence forecast; Admin can open it, set the target and put the suggested starts into the plan',async()=>{
 const f=paddyFixture(),{d,w,rpcs}=page('admin',f);try{
  await tick(3);w.document.querySelector('[data-tab="daily"]').click();await tick(10);
  const pane=w.document.getElementById('pane'),pill=pane.querySelector('.dp-pill');assert(pill,'a Paddy pill on the batch');assert.match(pill.textContent,/Paddy/);assert(pill.classList.contains('bad'),'planned dates long past: the forecast misses its target');
  pill.click();await tick(3);const card=pane.querySelector('#dpPanel .convergence-card');assert(card,'the forecast card');assert.match(card.textContent,/Second convergence|Target/);assert(card.querySelector('[data-dp-paddy-apply]'));assert(card.querySelector('[data-dp-target]'));
  assert.match(card.textContent,/Paddy soak 2/);
  card.querySelector('[data-dp-paddy-apply]').click();await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
  const saved=rpcs[1].args.p_rows,by=id=>saved.find(x=>x.id===id);
  assert.equal(by('cv').suggested_at,paddyRows()[3].suggested_at,'the target row is not moved by Apply');
  const sugg=['s2','s1','pp'].map(id=>by(id).suggested_at);assert.equal(by('s2').suggested_at,new Date(H0+(12*60-(120+180))*60000).toISOString(),'soak 2 starts so that duration + the saved 3 h wait ends at the target');
  assert.equal(by('s1').suggested_at,new Date(H0+(12*60-(120+180)-(120+120))*60000).toISOString());assert(sugg.every(Boolean));
 }finally{d.window.close();}
});

test('Paddy: a batch without a Paddy stream shows no pill; field roles see the forecast read-only',async()=>{
 const {d,w}=page('admin',fixture());try{await tick(3);w.document.querySelector('[data-tab="daily"]').click();await tick(10);assert(!w.document.querySelector('.dp-pill'));}finally{d.window.close();}
 const f=paddyFixture(),sup=page('supervisor',f);try{await tick(3);sup.w.document.querySelector('[data-tab="daily"]').click();await tick(10);
  const pane=sup.w.document.getElementById('pane');pane.querySelector('.dp-pill').click();await tick(3);
  assert(pane.querySelector('#dpPanel .convergence-card'));assert(!pane.querySelector('#dpPanel [data-dp-paddy-apply],#dpPanel [data-dp-target],#dpPanel [data-dp-batchform]'),'no editing controls');assert.equal(sup.rpcs.length,0);
 }finally{sup.d.window.close();}
});

test('batch panel: Admin changes the batch start and every unstarted task moves with it, name and note save too',async()=>{
 const rows=[planRow('t2',2,tdy(23,0),60,{title:'Task 2'}),planRow('t3',3,null,60,{title:'Task 3'}),planRow('t1',1,tdy(0,5),60,{status:'done',_locked:true,title:'Task 1'}),planRow('t4',4,tdy(12,0),60,{schedule_mode:'stream',title:'Task 4'})];
 const f={batches:[{id:'b1',name:'339, 340, 341',status:'active',h0:new Date(H0).toISOString(),note:null}],inWindow:paddyTasks(rows),open:paddyTasks(rows).filter(x=>x.status==='todo')};
 f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(rows):4;
 const {d,w,rpcs}=page('admin',f);try{
  await tick(3);w.document.querySelector('[data-tab="monthly"]').click();await tick(10);
  const pane=w.document.getElementById('pane'),btn=pane.querySelector('.dp-hedit[data-dp-panel-open="b1"]');assert(btn,'edit button in the batch header');assert.match(pane.querySelector('.dp-bcol').textContent,/first task/);
  btn.click();await tick(3);const form=pane.querySelector('#dpPanel [data-dp-batchform]');assert(form);
  const start=form.querySelector('[data-b-start]');assert.match(form.textContent,/Remaining tasks start/,'work has started on this batch');
  const was=new Date(start.value).getTime();start.value=w.TK.dayPlan.key(was+86400000)+'T'+start.value.slice(11);start.dispatchEvent(new w.Event('change'));assert.match(form.querySelector('[data-b-preview]').textContent,/1 d later/);
  form.querySelector('[data-b-name]').value='339, 340, 341 (June)';
  form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
  const a=rpcs[1].args,by=id=>a.p_rows.find(x=>x.id===id);assert.equal(a.p_name,'339, 340, 341 (June)');
  assert.equal(by('t1').suggested_at,tdy(0,5),'the recorded task stays');assert.equal(Date.parse(by('t2').suggested_at)-Date.parse(tdy(23,0)),86400000);assert.equal(Date.parse(by('t4').suggested_at)-Date.parse(tdy(12,0)),86400000);assert.equal(by('t3').suggested_at,null);
 }finally{d.window.close();}
});

test('batch panel: nothing changed → nothing saved; a refused save shows the server\'s words',async()=>{
 const f=fixture(),rows=[planRow('t2',2,tdy(23,0),60,{title:'Task 2'})];f.rpc=async fn=>{if(fn==='tk_batch_plan_get')return plan(rows);throw new Error('This batch changed while you were editing. Nothing was saved.');};
 const {d,w,rpcs}=page('admin',f);try{
  await tick(3);w.document.querySelector('[data-tab="monthly"]').click();await tick(10);const pane=w.document.getElementById('pane');pane.querySelector('.dp-hedit').click();await tick(3);
  const form=pane.querySelector('[data-dp-batchform]');form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(4);assert.match(form.querySelector('[data-b-msg]').textContent,/Nothing was changed/);assert.equal(rpcs.length,0);
  form.querySelector('[data-b-note]').value='Run 2';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(6);assert.match(form.querySelector('[data-b-msg]').textContent,/Nothing was saved/);
 }finally{d.window.close();}
});

test('Add a new task: pick its type, stream, name, day and time; it is appended as a new plan row of that type',async()=>{
 const f=fixture(),rows=[planRow('t2',2,tdy(23,0),60,{title:'Task 2'})];f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(rows):2;
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily'),form=pane.querySelector('[data-dp-assign="main"]');
  assert(form.querySelector('[data-a-existing]'),'move-existing is the default');assert(form.querySelector('[data-a-new]').hidden);
  form.querySelector('[data-a-mode="new"]').click();assert(!form.querySelector('[data-a-new]').hidden);assert(form.querySelector('[data-a-existing]').hidden);
  const kind=form.querySelector('[data-a-kind]');assert.deepEqual([...kind.options].map(o=>o.textContent),['Process','Rest','Lab','Cleaning']);
  kind.value='cleaning';kind.dispatchEvent(new w.Event('change'));assert.equal(form.querySelector('[data-a-line]').value,'Cleaning','stream follows the type');
  form.querySelector('[data-a-title]').value='Bunker rain washing';form.querySelector('[data-a-time]').value='14:15';form.querySelector('[data-a-h]').value='1';form.querySelector('[data-a-min]').value='30';
  form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(8);
  assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);
  const rowsOut=rpcs[1].args.p_rows,n=rowsOut[rowsOut.length-1];assert.equal(rowsOut.length,2);assert.equal(n.id,null);assert.equal(n.title,'Bunker rain washing');assert.equal(n.kind,'cleaning');assert.equal(n.line,'Cleaning');assert.equal(n.planned_duration_minutes,90);assert.equal(n.suggested_at,tdy(14,15));
 }finally{d.window.close();}
});

test('Add a new task with no name is refused with a message and nothing is saved',async()=>{
 const f=fixture();f.rpc=async fn=>fn==='tk_batch_plan_get'?plan([planRow('t2',2,tdy(23,0),60)]):2;const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily'),form=pane.querySelector('[data-dp-assign="main"]');form.querySelector('[data-a-mode="new"]').click();form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(6);
  assert.match(form.querySelector('[data-a-msg]').textContent,/name/);assert.deepEqual(rpcs.map(r=>r.fn),['tk_batch_plan_get'],'the plan was read but not saved');
 }finally{d.window.close();}
});

test('Existing-task list can be narrowed by type (Process / Rest / Lab / Cleaning)',async()=>{
 const f=fixture();f.open.push(task('lab1',9,null,{kind:'lab',title:'Lab check'}),task('cl1',10,null,{kind:'cleaning',title:'Wash'}));f.inWindow=f.inWindow.slice();
 const {d,w}=page('admin',f);try{
  const pane=await openTab(w,'daily'),form=pane.querySelector('[data-dp-assign="main"]'),sel=form.querySelector('[data-a-task]'),flt=form.querySelector('[data-a-filter]');
  assert.deepEqual([...flt.options].map(o=>o.textContent),['All types','Process','Rest','Lab','Cleaning']);
  const names=()=>[...sel.options].map(o=>o.textContent);assert(names().some(t=>/Lab check \(Lab\)/.test(t))&&names().some(t=>/Wash \(Cleaning\)/.test(t)));
  flt.value='lab';flt.dispatchEvent(new w.Event('change'));assert.equal(names().length,1);assert.match(names()[0],/Lab check/);
  flt.value='rest';flt.dispatchEvent(new w.Event('change'));assert.match(names()[0],/No unstarted tasks of this type/);assert.equal(form.querySelector('[type=submit]').disabled,true);
 }finally{d.window.close();}
});

test('type filter: Process / Rest / Lab / Cleaning can be hidden on the chart and the board, and the choice is kept',async()=>{
 const f=monthFixture();f.inWindow=f.inWindow.concat(task('lab9',9,new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate(),12,0).toISOString(),{kind:'lab',title:'Lab moisture'}));f.open=f.inWindow.filter(x=>x.status==='todo');
 const {d,w}=page('admin',f);try{
  const pane=await openTab(w,'monthly'),has=t=>[...pane.querySelectorAll('.dp-line')].some(l=>l.textContent.includes(t));
  assert.deepEqual([...pane.querySelectorAll('[data-dp-type]')].map(x=>x.dataset.dpType),['work','rest','lab','cleaning']);assert(has('Lab moisture')||pane.querySelector('.dp-more'),'lab shown by default (maybe folded)');
  const lab=pane.querySelector('[data-dp-type="lab"]');lab.checked=false;lab.dispatchEvent(new w.Event('change'));await tick(8);
  const pane2=w.document.getElementById('pane');assert(![...pane2.querySelectorAll('.dp-line')].some(l=>l.textContent.includes('Lab moisture')));assert.equal(pane2.querySelector('[data-dp-type="lab"]').checked,false,'the choice survives the redraw');
  const rest=pane2.querySelector('[data-dp-type="rest"]');rest.checked=false;rest.dispatchEvent(new w.Event('change'));await tick(8);
  assert(![...w.document.getElementById('pane').querySelectorAll('.dp-line.t-rest')].length,'rest hidden');
  w.document.querySelector('[data-tab="daily"]').click();await tick(10);const day=w.document.getElementById('pane');assert.equal(day.querySelector('[data-dp-type="lab"]').checked,false,'same filter on the daily screen');
 }finally{d.window.close();}
});

test('editor: choosing a linked timing disables the date and time, sends the new mode, and Remove needs a second tap',async()=>{
 const f=fixture(),rows=[planRow('t0',1,tdy(20,0),60,{title:'Before'}),planRow('t2',2,tdy(23,0),60,{title:'Task 2'}),planRow('t3',3,null,60,{title:'Task 3'})];f.rpc=async fn=>fn==='tk_batch_plan_get'?plan(rows):2;
 const {d,w,rpcs}=page('admin',f);try{
  const pane=await openTab(w,'daily');pane.querySelector('[data-dp-move="t2"]').click();const form=pane.querySelector('[data-dp-moveform="t2"]');
  assert(form.querySelector('[data-m-line]')&&form.querySelector('[data-m-desc]')&&form.querySelector('[data-m-mode]'));assert.equal(form.querySelector('[data-m-date]').disabled,false);assert(form.querySelector('[data-m-gapwrap]').hidden);
  const mode=form.querySelector('[data-m-mode]');mode.value='stream';mode.dispatchEvent(new w.Event('change'));assert.equal(form.querySelector('[data-m-date]').disabled,true);assert.equal(form.querySelector('[data-m-gapwrap]').hidden,false);
  form.querySelector('[data-m-gap]').value='20';form.querySelector('[data-m-desc]').value='Soak in lagoon water';
  form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick(8);
  const t2=rpcs[1].args.p_rows.find(r=>r.id==='t2');assert.equal(t2.schedule_mode,'stream');assert.equal(t2.schedule_gap_minutes,20);assert.equal(t2.description,'Soak in lagoon water');assert.equal(t2.suggested_at,tdy(21,20),'now timed after the task before it (21:00) + 20 min');
 }finally{d.window.close();}
 const g=fixture();g.rpc=async fn=>fn==='tk_batch_plan_get'?plan([planRow('t2',2,tdy(23,0),60),planRow('t3',3,null,60)]):2;const x=page('admin',g);try{
  const pane=await openTab(x.w,'daily');pane.querySelector('[data-dp-move="t3"]').click();const rm=pane.querySelector('[data-dp-moveform="t3"] [data-m-remove]');
  rm.click();assert.equal(x.rpcs.length,0,'first tap only arms it');assert.match(rm.textContent,/Tap again/);rm.click();await tick(8);
  assert.deepEqual(x.rpcs.map(r=>r.fn),['tk_batch_plan_get','tk_batch_plan_save']);assert.deepEqual(x.rpcs[1].args.p_rows.map(r=>r.id),['t2']);
 }finally{x.d.window.close();}
});

test('batch strip: Admin gets Edit batch, field roles get Details; the New batch link is Admin-only',async()=>{
 const a=page('admin',fixture());try{const pane=await openTab(a.w,'daily');assert.match(pane.querySelector('.dp-batchchip').textContent,/Edit batch/);assert(pane.querySelector('a[href="#/new"]'));}finally{a.d.window.close();}
 const s=page('supervisor',fixture());try{const pane=await openTab(s.w,'daily');assert.match(pane.querySelector('.dp-batchchip').textContent,/Details/);assert(!pane.querySelector('a[href="#/new"]'));
  pane.querySelector('[data-dp-panel-open]').click();await tick(3);assert(pane.querySelector('#dpPanel .dp-panel'));assert(!pane.querySelector('#dpPanel input'),'read-only panel');}finally{s.d.window.close();}
});
