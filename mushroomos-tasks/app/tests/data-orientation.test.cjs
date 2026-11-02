const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../www/app.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function page(role){
 const d=new JSDOM('<button id="back"></button><h1 id="title"></h1><div id="who"></div><button id="refresh"></button><button id="out"></button><main id="view"></main>',{url:'http://localhost/app.html#/',runScripts:'outside-only'}),w=d.window,writes=[];
 w.scrollTo=()=>{};w.Auth={currentUser:()=>({id:'u',name:'Test',role}),ROLE_LABEL:{},signOut:async()=>{}};
 w.TK={api:{select:async()=>[],rpc:async(fn)=>{writes.push(fn);}}};
 w.eval(source);return {d,w,writes};
}
test('Admin Data Orientation links to the separate read-only operations view',async()=>{
 const {d,w,writes}=page('admin');try{
 await tick();const tab=w.document.querySelector('[data-tab="data-orientation"]');assert(tab);assert.match(tab.textContent,/Data Orientation/);
 tab.click();await tick();const pane=w.document.getElementById('pane');assert.match(pane.textContent,/Factory Operations/);
 assert.equal(pane.querySelector('a[href="operations.html"]').textContent,'Open Factory Operations');assert(!pane.querySelector('form,input,textarea'));assert.equal(writes.length,0);
 }finally{d.window.close();}
});
test('the Admin operations link is not offered to field, Lab, or GM roles',async()=>{
 for(const role of ['supervisor','operator','lab_tech','gm']){const {d,w}=page(role);try{await tick();assert(!w.document.querySelector('[data-tab="data-orientation"]'),role);}finally{d.window.close();}}
});
