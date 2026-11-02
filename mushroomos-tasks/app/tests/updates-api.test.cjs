const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
test('updater accepts only the same HTTPS host and package; uses increasing integer version codes',()=>{
 const ctx={window:{TK:{},MOS:{config:{}}},document:{getElementById:()=>null},URL};vm.runInNewContext(source('build-info.js'),ctx);vm.runInNewContext(source('app-updates.js'),ctx);
 const validate=ctx.window.TK.updates.validate,base='https://downloads.example/latest.json';
 const current=ctx.window.TK.build.versionCode;
 const good={version:'next',versionCode:current+1,packageId:ctx.window.TK.build.packageId,apk:'tasks-next.apk',sha256:'a'.repeat(64),bytes:2000};
 assert.equal(validate(good,base).newer,true);assert.equal(validate({...good,versionCode:current},base).newer,false);assert.equal(validate({...good,versionCode:current-1},base).newer,false);
 for(const bad of [{packageId:'wrong'},{apk:'https://evil.example/x.apk'},{apk:'javascript:alert(1)'},{apk:'x.html'},{versionCode:6.1},{sha256:'bad'},{bytes:0}])assert.throws(()=>validate({...good,...bad},base));
 assert.throws(()=>validate(good,'http://downloads.example/latest.json'));
});
function api(fetch){
 const ctx={window:{MOS:{config:{url:'https://test.example',anon:'public'}},Auth:{currentUser:()=>({id:'test'}),freshSession:async()=>({access_token:'test'}),refresh:async()=>({access_token:'test'})}},fetch,URLSearchParams,AbortController,setTimeout,clearTimeout};
 vm.runInNewContext(source('tk-api.js'),ctx);return ctx.window.TK.api;
}
test('simultaneous identical reads share one request, later reads remain fresh',async()=>{
 let count=0;const a=api(async()=>{count++;return new Response('[]');});
 await Promise.all([a.select('table',{order:'id'}),a.select('table',{order:'id'})]);assert.equal(count,1);
 await a.select('table',{order:'id'});assert.equal(count,2);
});
test('uncertain photo registration never deletes potentially committed evidence',async()=>{
 let deletes=0;const a=api(async(url,opts)=>{if(opts.method==='DELETE')deletes++;if(url.includes('/rpc/'))throw new TypeError('network');return new Response('{}');});
 await assert.rejects(()=>a.addPhoto('b','t','before',{size:100,type:'image/jpeg'}),/not confirmed/);assert.equal(deletes,0);
});
test('explicit photo registration refusal cleans the orphan once',async()=>{
 let deletes=0;const a=api(async(url,opts)=>{if(opts.method==='DELETE')deletes++;return url.includes('/rpc/')?new Response('{"message":"not allowed"}',{status:400}):new Response('{}');});
 await assert.rejects(()=>a.addPhoto('b','t','before',{size:100,type:'image/jpeg'}),/not allowed/);assert.equal(deletes,1);
});
test('failed writes are not retried automatically',async()=>{
 let count=0;const a=api(async()=>{count++;throw new TypeError('offline');});
 await assert.rejects(()=>a.rpc('tk_start',{}),/not confirmed/);assert.equal(count,1);
});

test('complete reads advance by returned rows despite a smaller server cap',async()=>{
 const offsets=[],rows=Array.from({length:1203},(_,id)=>({id}));
 const a=api(async url=>{const q=new URL(url).searchParams,offset=Number(q.get('offset'));offsets.push(offset);return new Response(JSON.stringify(rows.slice(offset,offset+200)),{headers:{'content-range':`${offset}-${Math.min(offset+199,1202)}/1203`}});});
 const found=await a.selectAll('tasks',{order:'ord.asc'});assert.equal(found.length,1203);assert.equal(found[1202].id,1202);assert.deepEqual(offsets,[0,200,400,600,800,1000,1200]);
});
test('complete reads reject a later page failure without returning partial data',async()=>{
 let calls=0;const a=api(async()=>++calls===1?new Response('[{"id":1}]',{headers:{'content-range':'0-0/2'}}):new Response('{"message":"read failed"}',{status:500}));
 await assert.rejects(()=>a.selectAll('tasks',{}),/read failed/);assert.equal(calls,2);
});
