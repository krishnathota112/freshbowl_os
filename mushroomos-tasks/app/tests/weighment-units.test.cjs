const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
function setup(){
 const d=new JSDOM('<main id="view"></main>',{url:'http://localhost',runScripts:'outside-only'}),w=d.window,calls=[];
 w.MOS={config:{url:'http://example.invalid',anon:'fixture'}};w.eval(source('wb-api.js'));
 const req={id:'r1',batch_id:'b1',batch_name:'183,184,185',batch_status:'active',material_code:'paddy_local',material_name:'Paddy (Local)',weight_unit:'t',required_kg:'51850',tolerance_kg:'500',received_kg:'1000',remaining_kg:'50850',slips:1,state:'receiving'};
 const mats=[{code:'bagasse',name:'Bagasse',weight_unit:'t'},{code:'paddy_local',name:'Paddy (Local)',weight_unit:'t'},{code:'ammonium_sulphate',name:'Ammonium sulphate',weight_unit:'kg'}];
 w.WB.api.select=async(table)=>table==='wb_v_requirement'?[req]:table==='wb_v_batch'?[{id:'b1',batch_no:'183,184,185',status:'active'}]:table==='wb_material'?mats:[];
 w.WB.api.rpc=async(fn,args)=>{calls.push({fn,args});if(fn==='wb_material_set_unit')return;throw new Error('Fixture: captured, not saved');};
 w.eval(source('slip-form.js'));w.eval(source('weighments-admin.js'));
 const root=w.document.getElementById('view');return {d,w,root,calls,req,change:(el,value)=>{el.value=value;el.dispatchEvent(new w.Event('change'));}};
}
test('new rows use each material default and convert requirements to kg once',async()=>{
 const {d,w,root,calls}=setup();try{await w.TKWB.pane(root,()=>{});const row=root.querySelector('#wbRows tr');assert.equal(row.querySelector('[data-f="unit"]').value,'t');
 row.querySelector('[data-f="req"]').value='51.85';row.querySelector('[data-f="tol"]').value='0.5';await root.querySelector('#wbNew').onsubmit({preventDefault(){}});
 assert.equal(calls[0].fn,'wb_batch_create_v2');assert.equal(calls[0].args.p_rows[0].required_kg,51850);assert.equal(calls[0].args.p_rows[0].tolerance_kg,500);assert.equal(calls[0].args.p_rows[0].weight_unit,'t');}finally{d.window.close();}
});
test('material choices and unit switches preserve filled weights independently per row',async()=>{
 const {d,w,root,change}=setup();try{await w.TKWB.pane(root,()=>{});root.querySelector('#wbAddRow').click();const rows=root.querySelectorAll('#wbRows tr');
 rows[0].querySelector('[data-f="req"]').value='20';rows[1].querySelector('[data-f="req"]').value='5';change(rows[0].querySelector('[data-f="mat"]'),'ammonium_sulphate');
 assert.equal(rows[0].querySelector('[data-f="unit"]').value,'kg');assert.equal(rows[0].querySelector('[data-f="req"]').value,'20000');assert.equal(rows[1].querySelector('[data-f="req"]').value,'5');
 change(rows[0].querySelector('[data-f="unit"]'),'t');assert.equal(rows[0].querySelector('[data-f="req"]').value,'20');}finally{d.window.close();}
});
test('Admin unit save changes the display without changing stored requirement kg',async()=>{
 const {d,w,root,calls,change}=setup();try{await w.TKWB.detail(root,'b-b1',()=>{},()=>{});const row=root.querySelector('[data-material-row="paddy_local"]');change(row.querySelector('[data-unit]'),'kg');await row.querySelector('[data-save-unit]').onclick();
 assert.equal(calls[0].fn,'wb_material_set_unit');assert.equal(calls[0].args.p_material,'paddy_local');assert.equal(calls[0].args.p_unit,'kg');assert.match(row.textContent,/51,850 kg/);assert.match(row.querySelector('[data-unit-msg]').textContent,/Saved/);}finally{d.window.close();}
});
test('Add and Edit use per-material units without reinterpreting entered values',async()=>{
 const {d,w,root,calls,change}=setup();try{await w.TKWB.detail(root,'b-b1',()=>{},()=>{});const add=root.querySelector('#addRows tr');add.querySelector('[data-f="req"]').value='20';change(add.querySelector('[data-f="mat"]'),'ammonium_sulphate');assert.equal(add.querySelector('[data-f="req"]').value,'20000');await root.querySelector('#addBtn').onclick();assert.equal(calls[0].fn,'wb_requirement_add_v2');assert.equal(calls[0].args.p_required_kg,20000);assert.equal(calls[0].args.p_unit,'kg');
 calls.length=0;await w.TKWB.detail(root,'r1',()=>{},()=>{});root.querySelector('#edReq').value='52';root.querySelector('#edTol').value='0.1255';change(root.querySelector('[data-unit="edit"]'),'kg');assert.equal(root.querySelector('#edReq').value,'52000');assert.equal(root.querySelector('#edTol').value,'125.5');await root.querySelector('#edSave').onclick();assert.equal(calls[0].fn,'wb_requirement_update_v2');assert.equal(calls[0].args.p_required_kg,52000);}finally{d.window.close();}
});
test('Admin slip form requires a photo and converts the selected slip unit once',async()=>{
 const {d,w,root,req,change}=setup();try{let sent;w.WB.api.addSlip=async(id,slip,file)=>{sent={id,slip,file};};await w.TKWB.detail(root,'r1',()=>{},()=>{});const form=root.querySelector('[data-slip-form]');assert(form);assert.equal(form.querySelector('[data-slip="unit"]').value,'t');form.querySelector('[data-slip="ticket"]').value='WB-123';form.querySelector('[data-slip="net"]').value='2.5';await form.onsubmit({preventDefault(){}});assert.match(form.querySelector('[data-slip-msg]').textContent,/photo/);
 const file={name:'ticket.jpg',size:100,type:'image/jpeg'};Object.defineProperty(form.querySelector('[data-slip="photo"]'),'files',{value:[file]});change(form.querySelector('[data-slip="unit"]'),'kg');assert.equal(form.querySelector('[data-slip="net"]').value,'2500');await form.onsubmit({preventDefault(){}});assert.equal(sent.id,req.id);assert.equal(sent.slip.net_kg,2500);assert.equal(sent.file,file);}finally{d.window.close();}
});
test('invalid allowed variation is refused before saving',async()=>{
 const {d,w,root,calls}=setup();try{await w.TKWB.detail(root,'b-b1',()=>{},()=>{});root.querySelector('[data-f="req"]').value='20';root.querySelector('[data-f="tol"]').value='bad';await root.querySelector('#addBtn').onclick();assert.equal(calls.length,0);assert.match(root.querySelector('#addMsg').textContent,/valid, non-negative/);}finally{d.window.close();}
});
