const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const machines=[
  {id:'11111111-1111-4111-8111-111111111111',name:'Turner M1',kind:'heavy_machine',has_odometer:true,active:true},
  {id:'22222222-2222-4222-8222-222222222222',name:'Hopper 5',kind:'machine',has_odometer:false,active:true},
];
function modulePage(){
 const d=new JSDOM('<main></main>',{url:'http://localhost/app.html',runScripts:'outside-only'}),w=d.window;
 w.TK={};w.eval(source('task-resources.js'));return {d,w,root:w.document.querySelector('main'),module:w.TK.taskResources};
}
test('blank labour stays unknown; zero and multiple machine types remain distinct',()=>{
 const {d,root,module}=modulePage();try{
  root.innerHTML=module.render(machines,null,true);
  assert.equal(module.read(root,machines).labour_count,null);
  root.querySelector('#crewCount').value='0';
  root.querySelector('#resourceMachines').innerHTML=module.machineRow(machines,{machine_id:machines[0].id})+module.machineRow(machines,{machine_id:machines[1].id});
  const result=module.read(root,machines);
  assert.equal(result.labour_count,0);assert.equal(result.machines.length,2);
  assert.equal(result.machines[0].machine_id,machines[0].id);
  assert.equal(result.machines[1].machine_id,machines[1].id);
  assert(!Object.hasOwn(result.machines[1],'odometer_start_km'));
 }finally{d.window.close();}
});
test('odometer readings require matching photos and calculate only from two readings',()=>{
 const {d,root,module}=modulePage();try{
  root.innerHTML=module.render(machines,{labour_count:3,machines:[{machine_id:machines[0].id,odometer_start_km:100,start_photo_id:'photo-start'}]},true);
  assert.equal(root.querySelector('#crewCount').value,'3');
  let data=module.read(root,machines);assert.equal(data.machines[0].odometer_end_km,null);
  root.querySelector('[data-meter="end"]').value='105.125';
  assert.throws(()=>module.read(root,machines),/end odometer photo/);
  root.querySelector('[data-meter-photo="end"]').dataset.photoId='photo-end';
  data=module.read(root,machines);assert.equal(data.machines[0].odometer_end_km,105.125);
  root.querySelector('[data-meter="end"]').value='99';assert.throws(()=>module.read(root,machines),/below start/);
  root.querySelector('#crewCount').value='2.5';assert.throws(()=>module.read(root,machines),/whole number/);
 }finally{d.window.close();}
});
test('machine photo upload is attached to this task and does not wipe draft fields',async()=>{
 const {d,root,module}=modulePage();try{
  root.innerHTML=module.render(machines,null,true);
  let uploaded=[];
  module.wire(root,machines,{addPhoto:async(...args)=>{uploaded=args;return 'photo-1';}},
    {id:'task-1',batch_id:'batch-1'},error=>{throw error;});
  root.querySelector('#crewCount').value='6';root.querySelector('#addResourceMachine').click();
  const select=root.querySelector('[data-machine-id]');select.value=machines[0].id;
  select.dispatchEvent(new d.window.Event('change',{bubbles:true}));
  root.querySelector('[data-meter="start"]').value='42';
  const input=root.querySelector('[data-meter-photo="start"]');
  const file={name:'odometer.jpg',size:100,type:'image/jpeg'};
  Object.defineProperty(input,'files',{value:[file]});
  input.dispatchEvent(new d.window.Event('change',{bubbles:true}));await tick();await tick();
  assert.deepEqual(uploaded,['batch-1','task-1','other',file]);
  assert.equal(input.dataset.photoId,'photo-1');assert.equal(root.querySelector('#crewCount').value,'6');
  assert.equal(module.read(root,machines).machines[0].odometer_start_km,42);
 }finally{d.window.close();}
});
test('Supervisor Finish records resources and task atomically through one RPC; later corrections append',async()=>{
 const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',
   {url:'http://localhost/app.html#/t/task-1',runScripts:'outside-only'}),w=d.window,calls=[];
 try{
  w.TK={};w.eval(source('task-resources.js'));w.scrollTo=()=>{};
  w.Auth={currentUser:()=>({id:'supervisor',name:'Supervisor',role:'supervisor'}),ROLE_LABEL:{},signOut:async()=>{}};
  const task={id:'task-1',batch_id:'batch-1',batch_name:'182',batch_status:'active',title:'Turner T0',line:'Main',ord:3,
    kind:'work',status:'running',photos:'none',ask:'machine',started_at:'2026-10-01T00:00:00Z'};
  w.TK.api={select:async(table,query)=>{
    if(table==='tk_sop_row')return [];
    if(table==='tk_v_task_v3')return [task];
    if(table==='tk_machine')return machines;
    if(table==='tk_v_task_resources')return [];
    return [];
  },rpc:async(fn,args)=>{calls.push({fn,args});},signedUrl:async()=>'',addPhoto:async()=>''};
  w.eval(source('app.js'));await tick();await tick();await tick();
  const root=w.document.getElementById('view');assert(root.querySelector('#resourceCard'));
  root.querySelector('#crewCount').value='4';root.querySelector('#addResourceMachine').click();
  root.querySelector('[data-machine-id]').value=machines[1].id;
  await root.querySelector('#finishB').onclick();await tick();
  assert.equal(calls[0].fn,'tk_finish_with_resources');
  assert.equal(calls[0].args.p_labour_count,4);
  assert.equal(calls[0].args.p_machines[0].machine_id,machines[1].id);
  assert.equal(calls[0].args.p_expected_revision,null);
  assert.equal(calls.filter(c=>c.fn==='tk_finish').length,0);
 }finally{d.window.close();}
});

function home(role, records=[]){
 const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',
   {url:'http://localhost/app.html#/',runScripts:'outside-only'}),w=d.window,calls=[];
 w.TK={api:{select:async(table)=>table==='tk_machine'?machines:table==='tk_v_machine_refuel'?records:[],
   rpc:async(fn,args)=>{calls.push({fn,args});return 'new-id';}}};
 w.Auth={currentUser:()=>({id:role,name:role,role}),ROLE_LABEL:{},signOut:async()=>{}};w.scrollTo=()=>{};
 w.eval(source('app.js'));return {d,w,calls,root:w.document.getElementById('view')};
}
test('Admin manages registered machine identities; Supervisor cannot access that tab',async()=>{
 const admin=home('admin');const supervisor=home('supervisor');
 try{
  await tick();await tick();
  assert(!supervisor.root.querySelector('[data-tab="machines"]'));
  admin.root.querySelector('[data-tab="machines"]').click();await tick();await tick();
  const form=admin.root.querySelector('#machineForm');assert(form);
  form.querySelector('#machineName').value='Loader H7';
  form.querySelector('#machineKind').value='heavy_machine';
  form.querySelector('#machineOdometer').checked=true;
  await form.onsubmit({preventDefault(){}});
  assert.equal(admin.calls[0].fn,'tk_machine_save');
  assert.equal(admin.calls[0].args.p_name,'Loader H7');
  assert.equal(admin.calls[0].args.p_has_odometer,true);
 }finally{admin.d.window.close();supervisor.d.window.close();}
});
test('Supervisor logs measured refuelling litres by machine, never as per-task fuel',async()=>{
 const {d,w,root,calls}=home('supervisor');
 try{
  await tick();await tick();
  root.querySelector('[data-tab="fuel"]').click();await tick();await tick();
  const form=root.querySelector('#fuelForm');assert(form);
  assert.match(root.textContent,/not a task allocation/);
  form.querySelector('#fuelMachine').value=machines[0].id;
  form.querySelector('#fuelLitres').value='42.75';
  form.querySelector('#fuelType').value='Diesel';
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls[0].fn,'tk_refuel_record');
  assert.equal(calls[0].args.p_machine,machines[0].id);
  assert.equal(calls[0].args.p_litres,42.75);
  assert.match(calls[0].args.p_entry,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert(!Object.hasOwn(calls[0].args,'p_task'));
  assert(w.document.querySelector('[data-tab="fuel"]'));
 }finally{d.window.close();}
});
