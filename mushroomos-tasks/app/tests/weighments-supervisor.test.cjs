const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const req={id:'r1',batch_id:'b1',batch_name:'183,184,185',batch_status:'active',material_code:'paddy_local',material_name:'Paddy (Local)',weight_unit:'t',required_kg:'51850',tolerance_kg:'100',received_kg:'1000',remaining_kg:'50850',slips:1,state:'receiving'};
function modulePage(){
 const d=new JSDOM('<main id="view"></main>',{url:'http://localhost/app.html',runScripts:'outside-only'}),w=d.window,calls=[];
 w.MOS={config:{url:'https://example.invalid',anon:'fixture'}};w.eval(source('wb-api.js'));
 w.WB.api.select=async(name)=>name==='wb_v_requirement'?[req]:[];
 w.WB.api.addSlip=async(id,data,file)=>{calls.push({id,data,file});};
 w.WB.api.rpc=async(fn,args)=>{calls.push({fn,args});};
 w.eval(source('slip-form.js'));w.eval(source('weighments-supervisor.js'));
 return {d,w,root:w.document.getElementById('view'),calls};
}
test('supervisor weighments list shows Admin requirements, not Admin controls',async()=>{
 const {d,w,root}=modulePage();try{
 let route;await w.TKWB_SUP.pane(root,hash=>{route=hash;});
 assert.match(root.textContent,/183,184,185/);assert.match(root.textContent,/Paddy \(Local\)/);assert.match(root.textContent,/51\.85 tons/);
 assert(!root.querySelector('[data-save-unit]'));assert(!root.querySelector('#wbNew'));assert(!root.querySelector('[data-void]'));
 root.querySelector('[data-weighment-open]').click();assert.equal(route,'#/w/r1');
 }finally{d.window.close();}
});
test('supervisor detail records photo-backed slip, then may finish but cannot edit or void',async()=>{
 const {d,w,root,calls}=modulePage();try{
 await w.TKWB_SUP.detail(root,'r1',()=>{},()=>{});
 const form=root.querySelector('[data-slip-form]');assert(form);assert.equal(form.querySelector('[data-slip="unit"]').value,'t');
 assert(!root.querySelector('#edSave'));assert(!root.querySelector('[data-void]'));assert(!root.querySelector('[data-save-unit]'));
 form.querySelector('[data-slip="ticket"]').value='WB-314';form.querySelector('[data-slip="net"]').value='2.5';
 const file={name:'slip.jpg',size:100,type:'image/jpeg'};Object.defineProperty(form.querySelector('[data-slip="photo"]'),'files',{value:[file]});
 await form.onsubmit({preventDefault(){}});assert.equal(calls[0].id,'r1');assert.equal(calls[0].data.net_kg,2500);assert.equal(calls[0].file,file);
 await tick();const finish=root.querySelector('#supervisorFinish');finish.click();assert.equal(calls.filter(c=>c.fn==='wb_finish').length,0);
 await finish.onclick();assert.equal(calls.filter(c=>c.fn==='wb_finish').length,1);
 }finally{d.window.close();}
});
test('Tasks routes Weighments to supervisor-only UI; other roles do not get its tab',async()=>{
 for(const role of ['supervisor','operator','lab_tech']){
  const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',{url:'http://localhost/app.html#/',runScripts:'outside-only'}),w=d.window;
  try{
   let pane=0,detail=0;w.scrollTo=()=>{};w.Auth={currentUser:()=>({id:'u',name:'Test',role}),ROLE_LABEL:{},signOut:async()=>{}};
   w.TK={api:{select:async()=>[],rpc:async()=>{}}};w.TKWB_SUP={pane:async()=>{pane++;},detail:async()=>{detail++;}};w.TKWB={pane:async()=>{throw Error('Admin UI opened');},detail:async()=>{throw Error('Admin detail opened');}};
   w.eval(source('app.js'));await tick();const tab=w.document.querySelector('[data-tab="wb"]');assert.equal(Boolean(tab),role!=='lab_tech');
   if(tab){tab.click();await tick();assert.equal(pane,1);w.location.hash='#/w/r1';await new Promise(resolve=>w.addEventListener('hashchange',resolve,{once:true}));await tick();assert.equal(detail,1);}
  }finally{d.window.close();}
 }
});
