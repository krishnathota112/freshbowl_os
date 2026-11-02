import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.argv[2]||process.env.TASKS_SITE_URL;
if(!base)throw Error('Pass the deployed website URL as the first argument.');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const directory=path.join(root,'app/www'),files=fs.readdirSync(directory).filter(name=>fs.statSync(path.join(directory,name)).isFile()&&!name.startsWith('_'));
let cursor=0;
await Promise.all(Array.from({length:5},async()=>{while(cursor<files.length){const name=files[cursor++],response=await fetch(new URL(name,base),{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(sha(bytes)!==sha(fs.readFileSync(path.join(directory,name))))throw Error(`${name}: deployed bytes differ from source`);console.log('PASS '+name);}}));
const manifestResponse=await fetch(new URL('downloads/latest.json',base),{signal:AbortSignal.timeout(30000)});if(!manifestResponse.ok)throw Error('APK manifest unavailable');
const manifest=await manifestResponse.json();
if(!manifestResponse.headers.get('access-control-allow-origin')?.includes('*')||!manifestResponse.headers.get('cache-control')?.includes('no-store'))throw Error('Update manifest headers are incorrect');
if(JSON.stringify(manifest)!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'release-site/latest.json'),'utf8'))))throw Error('Live release manifest differs from prepared release');
let additional=0;
for(const [folder,prefix] of [['weighbridge-app/www','weighbridge/'],['release-site','downloads/']])for(const name of fs.readdirSync(path.join(root,folder))) {
  const file=path.join(root,folder,name);if(!fs.statSync(file).isFile()||name.startsWith('_')||name.endsWith('.apk'))continue;
  if(folder==='release-site'&&!['index.html','download.js','latest.json'].includes(name))continue;
  const response=await fetch(new URL(prefix+name,base),{signal:AbortSignal.timeout(30000)});
  if(!response.ok||sha(Buffer.from(await response.arrayBuffer()))!==sha(fs.readFileSync(file)))throw Error(prefix+name+': deployed bytes differ from source');
  additional++;
}
const apkResponse=await fetch(new URL('downloads/'+manifest.apk,base),{signal:AbortSignal.timeout(60000)});if(!apkResponse.ok)throw Error('APK unavailable');
const apk=Buffer.from(await apkResponse.arrayBuffer());if(apk.length!==manifest.bytes||sha(apk)!==manifest.sha256)throw Error('APK checksum or length mismatch');
console.log(`PASS ${files.length+additional} deployed frontend/download files and APK v${manifest.version}, SHA256 ${manifest.sha256}`);
