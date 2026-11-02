const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(path.join(__dirname,'../www',name),'utf8');

function setup() {
  const dom=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',
    {url:'http://localhost/app.html#/',runScripts:'outside-only'});
  const w=dom.window;w.TK={};w.confirm=()=>true;w.scrollTo=()=>{};
  ['plan-duration.js','process-time-sop.js','plan-scheduler.js','turner-plan.js','schedule-grid.js'].forEach(name=>w.eval(source(name)));
  return {dom,w};
}

test('factory standards collapse Turner piles but keep different passes and Lab tasks separate',()=>{
  const {dom,w}=setup();try{
    const rows=[
      {title:'T0 · P1',line:'Turner P1',kind:'work',pile:'P1',turner_pass:'T0',planned_duration_minutes:60},
      {title:'T0 · P2',line:'Turner P2',kind:'work',pile:'P2',turner_pass:'T0',planned_duration_minutes:60},
      {title:'T1 · P1',line:'Turner P1',kind:'work',pile:'P1',turner_pass:'T1',planned_duration_minutes:90},
      {title:'P1 · Lab after T1',line:'Turner · P1',kind:'lab',pile:'P1',turner_pass:'LAB_AFTER_T1',planned_duration_minutes:30},
      {title:'P2 · Lab after T1',line:'Turner · P2',kind:'lab',pile:'P2',turner_pass:'LAB_AFTER_T1',planned_duration_minutes:30},
      {title:'Hopper Pass 1',line:'Main',kind:'work',planned_duration_minutes:120}
    ];
    const list=w.TK.processTimeSop.catalog(rows);
    assert.equal(list.length,4);
    assert.equal(list.find(x=>x.process_key==='turner:t0').occurrences,2);
    assert.notEqual(list.find(x=>x.process_key==='turner:t1'),undefined);
    assert.notEqual(list.find(x=>x.kind==='lab'),undefined);
    const saved=[{process_key:'turner:t0',planned_duration_minutes:75},{process_key:'task:work:main:hopper pass 1',planned_duration_minutes:180}];
    const applied=w.TK.processTimeSop.apply(rows,saved);
    assert.equal(list.find(x=>x.process_key==='turner:lab after t1').occurrences,2);
    assert.deepEqual(applied.map(r=>r.planned_duration_minutes),[75,75,90,30,30,180]);
    assert.deepEqual(rows.map(r=>r.planned_duration_minutes),[60,60,90,30,30,120]);
  }finally{dom.window.close();}
});

test('Admin Process Time SOP saves standards independently of Task SOP and batches',async()=>{
  const {dom,w}=setup();try{
    const row={title:'Hopper Pass 1',line:'Main',kind:'work',planned_duration_minutes:120};
    const calls=[];
    w.Auth={currentUser:()=>({id:'admin',name:'Admin',role:'admin'}),ROLE_LABEL:{}};
    w.TK.api={select:async(table)=>table==='tk_v_sop'?[{id:'s1',is_latest_published:true}]:table==='tk_sop_row'?[row]:table==='tk_process_time_standard'?[]:[],
      rpc:async(fn,args)=>{calls.push({fn,args});return args.p_rows.length;}};
    w.eval(source('app.js'));await new Promise(resolve=>setImmediate(resolve));
    w.document.querySelector('[data-tab="timing"]').click();await new Promise(resolve=>setImmediate(resolve));
    assert.match(w.document.querySelector('#pane').textContent,/Process Time SOP/);
    assert.equal(w.document.querySelector('[data-process-hours]').value,'2');
    const input=w.document.querySelector('[data-process-hours]');input.value='3';input.dispatchEvent(new w.Event('input'));
    w.document.querySelector('#saveProcessTimes').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,1);assert.equal(calls[0].fn,'tk_process_time_save');
    assert.equal(calls[0].args.p_rows[0].planned_duration_minutes,180);
    assert.match(w.document.querySelector('#processTimeStatus').textContent,/Existing batches are unchanged/i);
  }finally{dom.window.close();}
});

test('Admin can rename a saved Process Time standard without renaming Task SOP rows',async()=>{
  const {dom,w}=setup();try{
    const sopRow={title:'Chicken manure + minerals weighment',line:'CM mix',kind:'work',planned_duration_minutes:90};
    const key=w.TK.processTimeSop.key(sopRow),saved=[{process_key:key,title:sopRow.title,line:'CM mix',kind:'work',planned_duration_minutes:90}];
    const calls=[];
    w.Auth={currentUser:()=>({id:'admin',name:'Admin',role:'admin'}),ROLE_LABEL:{}};
    w.TK.api={select:async(table)=>table==='tk_v_sop'?[{id:'s1',is_latest_published:true}]:table==='tk_sop_row'?[sopRow]:table==='tk_process_time_standard'?saved:[],
      rpc:async(fn,args)=>{calls.push({fn,args});saved[0]={...args.p_rows[0]};return 1;}};
    w.eval(source('app.js'));await new Promise(resolve=>setImmediate(resolve));
    w.document.querySelector('[data-tab="timing"]').click();await new Promise(resolve=>setImmediate(resolve));
    const name=w.document.querySelector('[data-process-title]');name.value='CM ingredients weighment';name.dispatchEvent(new w.Event('input'));
    w.document.querySelector('#saveProcessTimes').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,1);assert.equal(calls[0].fn,'tk_process_time_save');
    assert.equal(calls[0].args.p_rows[0].process_key,key);
    assert.equal(calls[0].args.p_rows[0].title,'CM ingredients weighment');
    assert.equal(sopRow.title,'Chicken manure + minerals weighment');
    w.document.querySelector('[data-tab="sops"]').click();await new Promise(resolve=>setImmediate(resolve));
    w.document.querySelector('[data-tab="timing"]').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(w.document.querySelector('[data-process-title]').value,'CM ingredients weighment');
    assert.match(w.document.querySelector('[data-process-row]').textContent,/Task SOP name: Chicken manure/);
  }finally{dom.window.close();}
});
