const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const src=name=>fs.readFileSync(path.join(__dirname,'../www',name),'utf8');
function setup(extra={}) {
  const d=new JSDOM('<main id="grid"></main>',{url:'http://localhost/',runScripts:'outside-only'}),w=d.window;
  w.TK={};w.confirm=()=>true;
  for(const name of ['plan-duration.js','plan-scheduler.js','turner-plan.js','spreadsheet-grid.js','schedule-grid.js'])w.eval(src(name));
  const root=w.document.querySelector('main');
  const rows=Array.from({length:3},(_,i)=>({title:'Task '+i,line:'Main',kind:'work',photos:'none',ask:'none',description:'',control:'',suggested_offset_minutes:i*60,planned_duration_minutes:60,schedule_mode:'fixed',schedule_gap_minutes:0}));
  if(extra.locked)rows[1]._locked=true;
  const grid=w.TK.scheduleGrid.mount(root,{rows,base:'2026-11-03T02:30:00Z',allowPileResize:false,...extra});
  const input=(row,field)=>root.querySelector(`tr[data-row="${row}"] [data-field="${field}"]`);
  const click=(row,field,shift=false)=>input(row,field).dispatchEvent(new w.MouseEvent('click',{bubbles:true,shiftKey:shift}));
  const paste=text=>{const e=new w.Event('paste',{bubbles:true,cancelable:true});e.clipboardData={getData:()=>text};input(0,'title').dispatchEvent(e);};
  return {d,w,root,grid,input,click,paste};
}
test('spreadsheet TSV round-trips quoted multiline cells and escaped quotes',()=>{
  const {d,w}=setup();try {const rows=[['One\ttwo','Line\nnext','a "quote"'],['last','','3']];assert.deepEqual(JSON.parse(JSON.stringify(w.TK.spreadsheetGrid.parse(w.TK.spreadsheetGrid.encode(rows)))),rows);assert.throws(()=>w.TK.spreadsheetGrid.parse('"unclosed'),/unclosed/);}finally{d.window.close();}
});
test('rectangular paste changes selected fields and one undo restores the full range',()=>{
  const {d,root,grid,click,paste}=setup();try {
    click(0,'title');paste('New 1\tPaddy\nNew 2\tCleaning');
    assert.deepEqual(Array.from(grid.read(),r=>[r.title,r.line]),[['New 1','Paddy'],['New 2','Cleaning'],['Task 2','Main']]);
    root.querySelector('[data-sheet-undo]').click();assert.equal(grid.read()[0].title,'Task 0');assert.equal(grid.read()[1].line,'Main');
    root.querySelector('[data-sheet-redo]').click();assert.equal(grid.read()[1].title,'New 2');
  }finally{d.window.close();}
});
test('fill down copies the first selected row; copy exports exactly the selected range',()=>{
  const {d,w,root,grid,input,click}=setup();try {
    click(0,'line');click(2,'line',true);root.querySelector('[data-sheet-fill]').click();
    assert.deepEqual(Array.from(grid.read(),r=>r.line),['Main','Main','Main']);
    click(0,'title');click(2,'title',true);
    let copied='';const e=new w.Event('copy',{bubbles:true,cancelable:true});e.clipboardData={setData:(type,text)=>copied=text};input(2,'title').dispatchEvent(e);
    assert.equal(copied,'Task 0\nTask 1\nTask 2');
    root.querySelector('[data-sheet-fill]').click();assert.deepEqual(Array.from(grid.read(),r=>r.title),['Task 0','Task 0','Task 0']);
    root.querySelector('[data-sheet-undo]').click();assert.equal(grid.read()[2].title,'Task 2');
  }finally{d.window.close();}
});
test('bulk edits refuse a protected row atomically and preserve all original values',()=>{
  const {d,root,grid,click,paste}=setup({locked:true});try {
    click(0,'title');paste('First\nSecond\nThird');
    assert.deepEqual(Array.from(grid.read(),r=>r.title),['Task 0','Task 1','Task 2']);
    assert.match(root.querySelector('[data-sheet-status]').textContent,/protected/);
  }finally{d.window.close();}
});
test('invalid numeric cells and off-page paste leave the plan unchanged',()=>{
  const {d,w,root,grid,input,click,paste}=setup();try {
    click(0,'duration_minutes');click(1,'duration_minutes',true);
    const e=new w.Event('paste',{bubbles:true,cancelable:true});e.clipboardData={getData:()=> '99\n20'};input(0,'duration_minutes').dispatchEvent(e);
    assert.deepEqual(Array.from(grid.read(),r=>r.planned_duration_minutes),[60,60,60]);assert.match(root.textContent,/valid whole number/);
    click(0,'title');paste('1\n2\n3\n4');assert.equal(grid.read().length,3);assert.equal(grid.read()[0].title,'Task 0');
  }finally{d.window.close();}
});
test('undo and redo include normal cell edits and structural row additions',()=>{
  const {d,w,root,grid,input}=setup();try {
    input(0,'title').value='Renamed';input(0,'title').dispatchEvent(new w.Event('input',{bubbles:true}));
    root.querySelector('[data-sheet-undo]').click();assert.equal(grid.read()[0].title,'Task 0');
    root.querySelector('[data-sheet-redo]').click();assert.equal(grid.read()[0].title,'Renamed');
    root.querySelector('[data-add="Main"]').click();assert.equal(grid.read().length,4);
    root.querySelector('[data-sheet-undo]').click();assert.equal(grid.read().length,3);
    root.querySelector('[data-sheet-redo]').click();assert.equal(grid.read().length,4);
  }finally{d.window.close();}
});
test('read-only plans do not render spreadsheet edit controls',()=>{
  const {d,root}=setup({readonly:true});try{assert.equal(root.querySelector('[data-sheet-fill]'),null);}finally{d.window.close();}
});
