const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function analytics(){const dom=new JSDOM('<main></main>',{url:'http://localhost/operations.html',runScripts:'outside-only'});dom.window.eval(source('operations-analytics.js'));return {dom,model:dom.window.TK.operationsAnalytics};}
test('actual durations, crew-hours and missing observations are never inferred from planned times',()=>{
 const {dom,model}=analytics();try{
 const now=Date.parse('2026-10-01T06:00:00Z'),since=Date.parse('2026-09-30T00:00:00Z');
 const tasks=[
  {id:'a',title:'Paddy soak',kind:'work',line:'Paddy',status:'done',started_at:'2026-09-30T00:00:00Z',ended_at:'2026-09-30T02:00:00Z',planned_duration_minutes:60},
  {id:'b',title:'Paddy soak',kind:'work',line:'Paddy',status:'done',started_at:'2026-09-30T04:00:00Z',ended_at:'2026-09-30T05:00:00Z',planned_duration_minutes:90},
  {id:'c',title:'Paddy soak',kind:'work',line:'Paddy',status:'done_before',ended_at:'2026-09-30T07:00:00Z',planned_duration_minutes:600},
 ];
 const result=model.model({finishedTasks:tasks,resources:[{task_id:'a',labour_count:4,machines:[]},{task_id:'b',labour_count:null,machines:[]}],now,since});
 assert.equal(result.averages.length,1);assert.equal(result.averages[0].averageMinutes,90);assert.equal(result.averages[0].averagePlannedMinutes,75);
 assert.equal(result.quality.completedInPeriod,3);assert.equal(result.quality.validDurations,2);assert.equal(result.quality.missingTime,1);
 assert.equal(result.quality.labourHours,8);assert.equal(result.quality.labourHoursCoverage,1);
 assert.equal(result.manpower.length,1);assert.equal(result.manpower[0].finished,3);assert.equal(result.manpower[0].crewRecorded,1);
 assert.equal(result.manpower[0].averageCrew,4);assert.equal(result.manpower[0].labourHours,8);
 }finally{dom.window.close();}
});
test('machine km and fuel added are separate, voided fuel is excluded, current crew is not unique headcount',()=>{
 const {dom,model}=analytics();try{
 const now=Date.parse('2026-10-01T06:00:00Z'),since=now-86400000;
 const running=[{id:'t1',batch_id:'b1',title:'Turner T1',line:'Main',kind:'work',status:'running',started_at:'2026-10-01T04:00:00Z'},
  {id:'t2',batch_id:'b1',title:'Turner T1',line:'Main',kind:'work',status:'running',started_at:'2026-10-01T04:00:00Z'}];
 const result=model.model({batches:[{id:'b1',name:'Batch 182'}],activeTasks:running,resources:[
  {task_id:'t1',labour_count:3,machines:[{machine_id:'m',machine_name:'Turner 1',distance_km:4.5}]},
  {task_id:'t2',labour_count:3,machines:[{machine_id:'m',machine_name:'Turner 1',distance_km:null}]}
 ],machines:[{id:'m',name:'Turner 1',kind:'heavy_machine'}],refuels:[
  {machine_id:'m',litres:20,event_at:'2026-10-01T01:00:00Z'},
  {machine_id:'m',litres:99,event_at:'2026-10-01T02:00:00Z',voided_at:'2026-10-01T03:00:00Z'}
 ],now,since});
 assert.equal(result.quality.currentAssignments,6);assert.equal(result.quality.currentCrewRecorded,2);
 assert.deepEqual(Array.from(result.boards[0].stages),['Turner']);assert.equal(result.boards[0].current.length,2);
 assert.equal(result.machines[0].uses,2);assert.equal(result.machines[0].distanceCount,1);assert.equal(result.machines[0].distanceKm,4.5);assert.equal(result.machines[0].litresAdded,20);
 }finally{dom.window.close();}
});
test('Excel-friendly CSV neutralizes formula-looking text and retains numeric cells',()=>{
 const {dom,model}=analytics();try{
 const result=model.csv([['Batch','Crew'],['=HYPERLINK("bad")',3],['+command',0]]);
 assert.match(result,/"'=HYPERLINK\(""bad""\)",3/);assert.match(result,/"'\+command",0/);assert(result.startsWith('\ufeff'));
 }finally{dom.window.close();}
});
test('Manager lands on a separate view, and it only performs data reads on load',async()=>{
 const d=new JSDOM(source('operations.html'),{url:'http://localhost/operations.html',runScripts:'outside-only'}),w=d.window,queries=[],rpcs=[];
 try{
  w.MOS={config:{}};w.eval(source('auth.js'));assert.equal(w.Auth.landingFor('manager'),'operations.html');
  w.Auth={requireRole:(...roles)=>roles.includes('manager'),currentUser:()=>({role:'manager',name:'Vikas'}),signOut:async()=>{}};
  w.TK={api:{select:async(table,params)=>{queries.push({table,params});return [];},rpc:async(fn)=>{rpcs.push(fn);}}};
  w.eval(source('operations-analytics.js'));w.TK.batchReport={};w.eval(source('operations.js'));
  for(let i=0;i<6;i++)await tick();
  assert.equal(w.document.getElementById('operationsContent').hidden,false);
  assert.equal(w.document.getElementById('managerSetup').hidden,true);
  assert.deepEqual(new Set(queries.map(q=>q.table)),new Set(['tk_v_batch','tk_v_task_v3','tk_machine','tk_v_machine_refuel']));
  assert.equal(rpcs.length,0);assert.match(w.document.getElementById('fieldBoard').textContent,/No active batches/);
 }finally{d.window.close();}
});
