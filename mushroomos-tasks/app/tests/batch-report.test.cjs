const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const fixture=require('./report-fixture.cjs');
const source=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
function setup(){const d=new JSDOM('<main></main>',{url:'http://localhost/app.html#/b/proof/report',runScripts:'outside-only'}),w=d.window;w.TK={};w.TextEncoder=TextEncoder;w.eval(source('plan-duration.js'));w.eval(source('plan-scheduler.js'));w.eval(source('batch-report.js'));return {d,w,r:w.TK.batchReport};}
function unzip(bytes){const b=Buffer.from(bytes),files={};let p=0;while(b.readUInt32LE(p)===0x04034b50){const size=b.readUInt32LE(p+18),len=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28);assert.equal(b.readUInt16LE(p+8),0);const name=b.subarray(p+30,p+30+len).toString();const start=p+30+len+extra;files[name]=b.subarray(start,start+size).toString();p=start+size;}assert.equal(b.readUInt32LE(p),0x02014b50);return files;}
test('report handles IST, midnight, >24h, running, Lab submission, before-app, zero and missing timings',()=>{
 const {d,r}=setup();try{const original=JSON.stringify(fixture),m=r.model(fixture),a=m.rows;
 assert.equal(a[0].elapsed,2190);assert.equal(a[1].end-a[1].start,210*60000);assert.equal(a[1].elapsed,null);
 assert.equal(a[2].end,null);assert.equal(a[2].elapsed,null);assert.equal(a[2].style,'partial');
 assert.equal(a[3].start,null);assert.equal(a[3].elapsed,null);assert.match(a[3].status,/waiting GM/);assert.match(a[3].remarks,/round 1.*72/);assert.match(a[3].remarks,/round 2.*73/);
 assert.equal(a[4].start,null);assert.equal(a[4].end,null);assert.equal(a[5].minutes,0);assert.equal(a[5].end,null);assert.equal(a[6].end,null);
 assert.equal(JSON.stringify(fixture),original);
 const invalid=r.model({...fixture,rows:[{...fixture.rows[0],started_at:'2026-09-28T18:00:00Z',ended_at:'2026-09-28T17:00:00Z'}]}).rows[0];assert.equal(invalid.elapsed,null);assert.match(invalid.remarks,/end is before/);
 }finally{d.window.close();}
});
test('Excel is a valid typed OOXML package, with safe literal cells and complete long remarks',()=>{
 const {d,w,r}=setup();try{
 const altered=JSON.parse(JSON.stringify(fixture));altered.rows[6].title='=HYPERLINK("https://example.com","test")';altered.rows[6].note='<script> & secret\n'+('Long remark '.repeat(300))+'LAST WORD';
 const bytes=r.xlsx(r.model(altered),JSON.parse(source('report-layout.json'))),parts=unzip(bytes);
 for(const [name,text] of Object.entries(parts))if(name.endsWith('.xml')||name.endsWith('.rels'))assert(!new w.DOMParser().parseFromString(text,'application/xml').querySelector('parsererror'),name);
 const sheet=new w.DOMParser().parseFromString(parts['xl/worksheets/sheet1.xml'],'application/xml');
 const cell=ref=>sheet.querySelector(`c[r="${ref}"]`);assert.equal(cell('G5').querySelector('v').textContent,String(2190/1440));
 assert.equal(cell('F7').querySelector('v').textContent, String((Date.parse('2026-09-28T21:00:00Z')+330*60000)/86400000+25569));
 assert.equal(cell('G7').textContent,'');assert.equal(sheet.querySelectorAll('f').length,0);assert.match(sheet.documentElement.textContent,/LAST WORD/);
 assert(sheet.querySelector('c[t="inlineStr"]'));assert(!sheet.querySelector('script'));
 assert([...sheet.querySelectorAll('row')].every(x=>+x.getAttribute('ht')<=409));
 assert.match(parts['xl/styles.xml'],/\[h\]:mm/);assert.match(parts['xl/styles.xml'],/hh:mm/);
 assert(!JSON.stringify(parts).includes('storage_path'));assert.match(sheet.documentElement.textContent,/P1/);
 const out=path.join(__dirname,'../../.work/batch-export');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'qa-export.xlsx'),Buffer.from(r.xlsx(r.model(fixture),JSON.parse(source('report-layout.json')))));
 }finally{d.window.close();}
});
test('website report includes all master rows, escaped text, headings and task links without writes',async()=>{
 const {d,w,r}=setup();try{const calls=[],root=w.document.querySelector('main');await r.mount(root,{rpc:async(fn,args)=>{calls.push({fn,args});return fixture;}},'proof',()=>true);
 assert.equal(calls.length,1);assert.equal(calls[0].fn,'tk_batch_progress');assert.equal(root.querySelectorAll('tbody a').length,7);assert.match(root.textContent,/IST/);assert.match(root.textContent,/36h 30m/);assert.match(root.textContent,/2h 30m|3h 30m/);
 assert(root.querySelector('[data-excel]'));assert.equal(root.querySelector('a[href="#/t/task4"]').textContent,'After T1 Lab');assert.match(root.textContent,/29 Sept 2026|29 Sep 2026/);
 }finally{d.window.close();}
});
test('failed or late report requests cannot show misleading or stale records',async()=>{
 const {d,w,r}=setup();try{const root=w.document.querySelector('main');await r.mount(root,{rpc:async()=>{throw Error('No connection');}},'proof',()=>true);assert.match(root.textContent,/No connection/);assert(!root.querySelector('[data-excel]'));
 await r.mount(root,{rpc:async()=>fixture},'proof',()=>false);assert(!root.querySelector('.progress-report'));assert(!root.querySelector('[data-excel]'));
 }finally{d.window.close();}
});
test('duration fields keep hours/minutes across tabs, validation, duplicate and base changes',()=>{
 const {d,w}=setup();try{w.eval(source('turner-plan.js'));w.eval(source('schedule-grid.js'));const grid=w.TK.scheduleGrid.mount(w.document.querySelector('main'),{rows:[{title:'Work',kind:'work',line:'Main',photos:'none',planned_duration_minutes:null},{title:'Lab',kind:'lab',line:'Main',photos:'none',planned_duration_minutes:0}],base:'2026-09-28T00:00:00Z',allowPileResize:false});
 w.document.querySelector('[data-field="duration_hours"]').value='3';w.document.querySelector('[data-field="duration_minutes"]').value='30';w.document.querySelector('[data-advanced]').click();w.document.querySelector('[data-field="report_section"]').value='Section';
 w.document.querySelector('[data-filter="lab"]').click();assert.equal(grid.read()[0].planned_duration_minutes,210);assert.equal(grid.read()[1].planned_duration_minutes,0);
 w.document.querySelector('[data-filter="process"]').click();w.document.querySelector('[data-action="copy"]').click();assert.equal(grid.read()[1].planned_duration_minutes,210);assert.equal(grid.read()[1].report_section,'Section');
 grid.setBase('2026-09-30T00:00:00Z');assert.equal(grid.read()[0].planned_duration_minutes,210);
 w.document.querySelector('[data-field="duration_minutes"]').value='60';assert.throws(()=>grid.validate(),/0–59/);
 assert.equal(w.TK.duration.read('',''),null);assert.equal(w.TK.duration.read('0',''),0);assert(Number.isNaN(w.TK.duration.read('1.5','0')));
 }finally{d.window.close();}
});
