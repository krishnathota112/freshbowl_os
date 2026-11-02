const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={window:{TK:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../www/paddy-convergence.js'),'utf8'),context);
const planner=context.window.TK.paddyConvergence,base=Date.parse('2026-10-01T00:00:00Z');
const row=(title,line,minute,duration,status='todo')=>({title,line,kind:'work',suggested_offset_minutes:minute,planned_duration_minutes:duration,status});
function two(){return [row('Paddy preparation starts','Paddy',0,60),row('Paddy soak 1','Paddy',120,120),
  row('Paddy soak 2','Paddy',360,120),row('Second convergence','Main',600,60)];}
test('backward suggestions use two-soak route and preserve planned wait intervals',()=>{
 const rows=two(),result=planner.plan(rows,rows,base,base);
 assert.equal(result.state,'on_time');assert.equal(result.waitingMs,0);
 assert.deepEqual(Array.from(result.suggested,s=>s.start-base),[0,120,360].map(n=>n*60000));
 const moved=two();moved[3].suggested_offset_minutes=720;
 const shift=planner.plan(moved,rows,base,base);
 assert.equal(shift.targetIndex,3);
 assert.deepEqual(Array.from(shift.suggested,s=>s.start-base),[120,240,480].map(n=>n*60000));
});
test('late actual start produces a shortfall, cause, and next paddy-based convergence',()=>{
 const rows=two();rows[0].status='done';rows[0].started_at=new Date(base).toISOString();rows[0].ended_at=new Date(base+60*60000).toISOString();
 rows[1].status='done';rows[1].started_at=new Date(base+120*60000).toISOString();rows[1].ended_at=new Date(base+420*60000).toISOString();
 const result=planner.plan(rows,rows,base,base+430*60000);
 assert.equal(result.state,'miss');assert.equal(result.shortfallMs,180*60000);
 assert.equal(result.nextFeasible,base+780*60000);assert.match(result.cause,/Paddy soak 1 finished later/);
});
test('Paddy finished early is waiting, not late',()=>{
 const rows=two();rows.slice(0,3).forEach((r,i)=>{r.status='done';r.started_at=new Date(base+[-120,0,240][i]*60000).toISOString();r.ended_at=new Date(base+[-60,120,360][i]*60000).toISOString();});
 const result=planner.plan(rows,rows,base,base+500*60000);
 assert.equal(result.state,'waiting');assert.equal(result.waitingMs,120*60000);
});
test('unknown durations and incomplete or duplicate soak routes never emit a false miss',()=>{
 const missing=two();missing[2].planned_duration_minutes=null;
 assert.equal(planner.plan(missing,missing,base,base).state,'unknown');
 const duplicate=two();duplicate.splice(3,0,row('Paddy soak 2','Paddy',370,120));
 assert.equal(planner.plan(duplicate,duplicate,base,base).state,'unknown');
});
test('a three-soak route includes all three steps',()=>{
 const rows=two();rows[3].suggested_offset_minutes=840;rows.splice(3,0,row('Paddy soak 3','Paddy',600,120));
 const result=planner.plan(rows,rows,base,base);
 assert.equal(result.soakCount,3);assert.equal(result.suggested.length,4);
});
test('an overdue running soak cannot be called early-ready or on time',()=>{
 const reference=two(),rows=two();rows[3].suggested_offset_minutes=720;rows[0].status='running';rows[0].started_at=new Date(base).toISOString();
 const result=planner.plan(rows,reference,base,base+90*60000);
 assert.equal(result.state,'unknown');assert.match(result.problems[0],/Confirm its expected finish/);
});
