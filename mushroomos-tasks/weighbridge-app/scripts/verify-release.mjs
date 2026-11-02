import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const web='https://mushroomos-weighbridge.pages.dev/';
for(const file of ['app.html','app.js','build-info.js']){
 const res=await fetch(new URL(file,web),{signal:AbortSignal.timeout(30000),cache:'no-store'});
 assert.equal(res.status,200,file);assert.equal(sha(Buffer.from(await res.arrayBuffer())),sha(readFileSync(new URL('weighbridge-app/www/'+file,root))),file+' mismatch');
 console.log('PASS live Weighbridge '+file);
}
const base='https://freshbowl-tasks-downloads.pages.dev/weighbridge/';
const res=await fetch(base+'latest.json',{signal:AbortSignal.timeout(30000),cache:'no-store'});assert.equal(res.status,200);
const live=await res.json(),local=JSON.parse(readFileSync(new URL('release-site/weighbridge/latest.json',root)));assert.deepEqual(live,local);
const binary=await fetch(base+live.apk,{signal:AbortSignal.timeout(60000)});assert.equal(binary.status,200);
const bytes=Buffer.from(await binary.arrayBuffer());assert.equal(bytes.length,live.bytes);assert.equal(sha(bytes),live.sha256);
assert.equal(sha(bytes),sha(readFileSync(new URL('release-site/weighbridge/'+live.apk,root))));
console.log('PASS public Weighbridge APK, manifest and checksum: v'+live.version+' / code '+live.versionCode);
