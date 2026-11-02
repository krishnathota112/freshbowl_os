/* Supervisor weighments: see Admin's requirements and record photographed slips. */
(function () {
  var W=window.WB.api;
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function error(e){return '<div class="error">'+esc(e&&e.message?e.message:e)+'</div>';}
  function unit(r){return r.weight_unit==='kg'||r.weight_unit==='t'?r.weight_unit:/ammonium.*sulph/i.test(r.material_code||'')?'kg':'t';}
  function amount(kg,u){return (Number(kg)/(u==='t'?1000:1)).toLocaleString('en-IN',{maximumFractionDigits:u==='t'?6:3})+' '+(u==='t'?'tons':'kg');}
  function state(r){return r.finished_at?'Finished':r.state==='over'?'Over requirement':r.state==='complete'?'Complete':'Receiving';}
  async function pane(root,go){
    try{
      var rows=await W.select('wb_v_requirement',{batch_status:'eq.active',order:'batch_created_at.desc,sort.asc,material_name.asc'});
      var batches={},order=[];
      rows.forEach(function(r){if(!batches[r.batch_id]){batches[r.batch_id]=[];order.push(r.batch_id);}batches[r.batch_id].push(r);});
      root.innerHTML='<p class="muted" style="margin:12px 0">Select a material to record a weighbridge slip. Admin sets the required weights and allowed variation.</p>'+
        (order.length?order.map(function(id){var rs=batches[id];return '<div class="card"><div class="caps">Batch '+esc(rs[0].batch_name)+'</div>'+
          rs.map(function(r){var u=unit(r),bal=Number(r.remaining_kg);return '<button type="button" class="task" data-weighment-open="'+esc(r.id)+'"><span class="grow"><b>'+esc(r.material_name)+'</b><br><span class="muted small">Required '+amount(r.required_kg,u)+' · received '+amount(r.received_kg,u)+' · '+Number(r.slips)+' slip'+(Number(r.slips)===1?'':'s')+'</span></span><span style="text-align:right"><b>'+amount(bal,u)+'</b><br><span class="muted small">'+state(r)+'</span></span></button>';}).join('')+'</div>';}).join(''):'<div class="card muted">No weighment requirements yet. Ask Admin to set the batch materials first.</div>');
      root.querySelectorAll('[data-weighment-open]').forEach(function(b){b.onclick=function(){go('#/w/'+b.dataset.weighmentOpen);};});
    }catch(e){root.innerHTML=error(e);}
  }
  async function detail(root,id,go,setTitle){
    try{
      var data=await Promise.all([W.select('wb_v_requirement',{id:'eq.'+id}),W.select('wb_v_slip',{requirement_id:'eq.'+id,order:'recorded_at.asc,entry_seq.asc'})]);
      var r=data[0][0],slips=data[1];
      if(!r){root.innerHTML='<div class="card">Weighment not found.</div>';return;}
      setTitle(r.material_name+' · Batch '+r.batch_name);
      var u=unit(r),active=r.batch_status==='active',open=active&&!r.finished_at,bal=Number(r.remaining_kg);
      root.innerHTML='<div class="card"><div class="caps">Batch '+esc(r.batch_name)+' · '+esc(r.material_name)+'</div>'+
        '<div class="muted small" style="margin-top:10px">Balance</div><div class="big">'+amount(bal,u)+'</div>'+
        '<div class="muted small">'+amount(bal,u==='t'?'kg':'t')+' · '+esc(state(r))+'</div>'+
        '<div class="row" style="margin-top:12px"><span>Required <b>'+amount(r.required_kg,u)+'</b></span><span>Received <b>'+amount(r.received_kg,u)+'</b></span></div>'+
        (r.note?'<p class="muted small">'+esc(r.note)+'</p>':'')+'</div>'+
        (open?'<div id="supervisorSlip"></div>':'<div class="card muted">'+(active?'This material is finished. Ask Admin to reopen it if another slip is needed.':'This batch is closed.')+'</div>')+
        '<div class="card"><div class="caps">Slips · '+slips.filter(function(s){return !s.voided_at;}).length+'</div>'+W.ledger(r,slips,{unit:u})+'<div id="supervisorPhotoMsg"></div></div>'+
        (open?'<div class="card"><div class="caps">Last lorry received?</div><p class="muted small">Finish this material only when no more slips are expected. A short balance alerts Admin; only Admin can reopen it.</p><button type="button" class="btn" id="supervisorFinish">Mark material finished</button><div id="supervisorFinishMsg"></div></div>':'');
      var reload=function(){detail(root,id,go,setTitle);};
      if(open)window.WB.slipForm.mount(root.querySelector('#supervisorSlip'),r,{onSaved:reload});
      root.querySelectorAll('[data-photo]').forEach(function(b){b.onclick=function(){W.signedUrl(b.dataset.photo).then(function(url){window.open(url,'_blank');}).catch(function(e){root.querySelector('#supervisorPhotoMsg').innerHTML=error(e);});};});
      var finish=root.querySelector('#supervisorFinish');
      if(finish)finish.onclick=async function(){
        if(finish.dataset.confirm!=='yes'){finish.dataset.confirm='yes';finish.textContent='Tap again to finish';return;}
        finish.disabled=true;
        try{await W.rpc('wb_finish',{p_req:id,p_note:null});reload();}
        catch(e){root.querySelector('#supervisorFinishMsg').innerHTML=error(e);finish.disabled=false;finish.dataset.confirm='';finish.textContent='Mark material finished';}
      };
    }catch(e){root.innerHTML=error(e);}
  }
  window.TKWB_SUP={pane:pane,detail:detail};
})();
