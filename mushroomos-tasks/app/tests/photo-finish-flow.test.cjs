const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../www/app.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function page(photoRule,existing=[],upload=async()=> 'photo-id'){
 const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',
   {url:'http://localhost/app.html#/t/task-1',runScripts:'outside-only'}),w=d.window,calls=[];
 const task={id:'task-1',batch_id:'batch-1',batch_name:'182',batch_status:'active',title:'Turner P1',line:'Turner',ord:7,
   kind:'work',status:'running',photos:photoRule,ask:'none',started_at:'2026-10-01T00:00:00Z'};
 w.Auth={currentUser:()=>({id:'supervisor',name:'Supervisor',role:'supervisor'}),ROLE_LABEL:{},signOut:async()=>{}};
 w.TK={api:{select:async(table)=>table==='tk_v_task_v3'?[task]:table==='tk_photo'?existing:[],
   addPhoto:async(...args)=>{calls.push({upload:args});return upload(...args);},
   signedUrl:async()=> 'http://localhost/photo.jpg',rpc:async(fn,args)=>{calls.push({fn,args});}}};w.scrollTo=()=>{};
 w.eval(source);return {d,w,calls,root:w.document.getElementById('view')};
}
async function take(w,kind){
 const input=w.document.querySelector('[data-shoot="'+kind+'"]');
 Object.defineProperty(input,'files',{configurable:true,value:[{size:100,type:'image/jpeg',name:kind+'.jpg'}]});
 await input.onchange();return input;
}
test('before and after photos are steps; only confirmed after upload enables the final Finish action',async()=>{
 const {d,w,root,calls}=page('both');try{
  await tick();await tick();
  const finish=root.querySelector('#finishB');assert(finish.disabled);
  assert.match(root.textContent,/after photo does not finish the task/i);
  assert.match(root.querySelector('[data-shoot="before"]').closest('.shoot').textContent,/Step 1/);
  assert.match(root.querySelector('[data-shoot="after"]').closest('.shoot').textContent,/Step 2/);
  assert.match(finish.textContent,/Step 3.*Finish task/);
  root.querySelector('#finNote').value='Keep this remark';
  await take(w,'before');assert(finish.disabled);assert.match(root.querySelector('#finishPrompt').textContent,/after photo/i);
  const after=await take(w,'after');assert.equal(finish.disabled,false);
  assert.match(after.closest('.shoot').textContent,/now tap Finish task/i);
  assert.match(root.querySelector('#finishPrompt').textContent,/photo alone does not mark it done/i);
  assert.equal(root.querySelector('#finNote').value,'Keep this remark');
  assert.equal(calls.filter(x=>x.fn==='tk_finish').length,0);
  await finish.onclick();assert.equal(calls.filter(x=>x.fn==='tk_finish').length,1);
  await tick();await tick();
 }finally{d.window.close();}
});
test('failed after-photo upload never enables Finish or claims the photo was saved',async()=>{
 const {d,w,root,calls}=page('after',[],async()=>{throw Error('No signal');});try{
  await tick();await tick();
  const finish=root.querySelector('#finishB');assert(finish.disabled);
  const after=await take(w,'after');
  assert(finish.disabled);assert.match(after.closest('.shoot').textContent,/Upload not confirmed/);
  assert.match(root.querySelector('#finishPrompt').textContent,/Still needed: after photo/);
  assert.equal(calls.filter(x=>x.fn==='tk_finish').length,0);
 }finally{d.window.close();}
});
test('already registered after photo is acknowledged; tasks with no photo requirement can finish',async()=>{
 for(const [rule,existing] of [['after',[{kind:'after',storage_path:'batch-1/task-1/after.jpg'}]],['none',[]]]){
  const {d,root}=page(rule,existing);try{
    await tick();await tick();
    assert.equal(root.querySelector('#finishB').disabled,false);
    assert.match(root.querySelector('#finishPrompt').textContent,rule==='after'?/After photo saved/:/tap Finish task/i);
  }finally{d.window.close();}
 }
});
