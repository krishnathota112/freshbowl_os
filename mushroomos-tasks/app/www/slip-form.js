/* Admin slip entry. The database stores kg; the form converts the selected unit once. */
(function () {
  var W=window.WB.api;
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function preferred(r){return r.weight_unit==='kg'||r.weight_unit==='t'?r.weight_unit:/ammonium.*sulph/i.test(r.material_code||'')?'kg':'t';}
  function mount(root,r,opts){
    if(!root)return;
    if(r.batch_status!=='active'||r.finished_at){root.innerHTML='';return;}
    var u=preferred(r);
    root.innerHTML='<form class="card" data-slip-form><div class="caps">Add weighment slip</div>'+
      '<p class="muted small">Enter the ticket number and weight, then attach a photo of the weighbridge slip. The balance updates when you save.</p>'+
      '<div class="grid2"><div><label class="lbl">Ticket / slip number</label><input data-slip="ticket" required autocomplete="off"></div><div><label class="lbl">Weight on this slip</label><select data-slip="unit" aria-label="Slip weight unit"><option value="kg"'+(u==='kg'?' selected':'')+'>kg</option><option value="t"'+(u==='t'?' selected':'')+'>tons</option></select></div></div>'+
      '<div class="grid2"><div><label class="lbl">Vehicle number (optional)</label><input data-slip="vehicle"></div><div><label class="lbl">Supplier (optional)</label><input data-slip="supplier"></div></div>'+
      '<div class="grid2"><div><label class="lbl">Gross weight (optional)</label><input data-slip="gross" inputmode="decimal" placeholder="Gross"></div><div><label class="lbl">Tare weight (optional)</label><input data-slip="tare" inputmode="decimal" placeholder="Tare"></div></div>'+
      '<label class="lbl">Net weight</label><input data-slip="net" inputmode="decimal" placeholder="Enter net, or gross and tare"><div class="note" data-slip-preview role="status"></div>'+
      '<label class="shoot" style="margin-top:10px"><span class="ms" style="font-size:22px">photo_camera</span><span data-slip-photo-label>Take or choose a slip photo (required)</span><input data-slip="photo" type="file" accept="image/*" capture="environment" required></label>'+
      '<div data-slip-msg role="status"></div><button class="btn pri" type="submit" style="margin-top:10px">Save slip</button></form>';
    var form=root.querySelector('form'), get=function(n){return form.querySelector('[data-slip="'+n+'"]');},unit=get('unit'),old=u;
    function valueKg(n){return get(n).value.trim()?W.fmt.toKg(get(n).value,unit.value):null;}
    function preview(){
      var gross=valueKg('gross'),tare=valueKg('tare'),net=valueKg('net');
      if(gross!=null&&tare!=null)net=gross-tare;
      var message=net!=null&&net>0?'Net '+W.fmt.both(net)+' · balance after this slip '+W.fmt.both(Number(r.remaining_kg)-net):'Enter a positive net weight, or gross and tare.';
      form.querySelector('[data-slip-preview]').textContent=message;
    }
    unit.onchange=function(){var next=unit.value;['gross','tare','net'].forEach(function(n){var input=get(n);if(!input.value.trim())return;var kg=W.fmt.toKg(input.value,old);if(kg!=null)input.value=String(Number((kg/(next==='t'?1000:1)).toFixed(next==='t'?6:3)));});old=next;preview();};
    ['gross','tare','net'].forEach(function(n){get(n).oninput=preview;});
    get('photo').onchange=function(){form.querySelector('[data-slip-photo-label]').textContent=get('photo').files[0]?get('photo').files[0].name+' ✓':'Take or choose a slip photo (required)';};
    form.onsubmit=async function(e){
      e.preventDefault();var msg=form.querySelector('[data-slip-msg]'),button=form.querySelector('[type="submit"]');msg.textContent='';
      var ticket=get('ticket').value.trim(),photo=get('photo').files[0],gross=valueKg('gross'),tare=valueKg('tare'),net=valueKg('net');
      if(!ticket){msg.textContent='Enter the ticket / slip number.';return;}
      if(!photo){msg.textContent='Take or choose a photo of the slip.';return;}
      if(['gross','tare','net'].some(function(n){return get(n).value.trim()&&valueKg(n)==null;})){msg.textContent='Enter valid numeric weights.';return;}
      if((gross==null)!==(tare==null)){msg.textContent='Enter both gross and tare, or leave both blank and enter net.';return;}
      if(gross!=null){if(gross<=tare){msg.textContent='Gross must be greater than tare.';return;}net=gross-tare;}
      if(net==null||net<=0){msg.textContent='Enter a valid positive net weight.';return;}
      button.disabled=true;button.textContent='Saving slip…';
      try{await W.addSlip(r.id,{ticket:ticket,vehicle:get('vehicle').value.trim(),supplier:get('supplier').value.trim(),gross_kg:gross,tare_kg:tare,net_kg:net},photo);if(opts&&opts.onSaved)opts.onSaved();}
      catch(err){msg.innerHTML='<div class="error">'+esc(err.message||err)+'</div>';button.disabled=false;button.textContent='Save slip';}
    };
    preview();
  }
  window.WB.slipForm={mount:mount};
})();
