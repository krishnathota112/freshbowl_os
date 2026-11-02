import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let count=0;
for(const folder of ['app/www','weighbridge-app/www']) {
  const directory=path.join(root,folder);
  for(const name of fs.readdirSync(directory)) {
    const file=path.join(directory,name);if(!fs.statSync(file).isFile())continue;
    const text=/\.(js|html)$/.test(name)?fs.readFileSync(file,'utf8'):'';
    if(name.endsWith('.js')){new vm.Script(text,{filename:file});count++;}
    if(name.endsWith('.html'))for(const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const ref=match[1].split(/[?#]/)[0];if(!ref||/^(?:https?:|data:|mailto:|\/)/.test(ref))continue;
      if(!fs.existsSync(path.resolve(directory,ref)))throw Error(`${folder}/${name} references missing ${ref}`);
    }
  }
}
const ctx={window:{TK:{}}};vm.runInNewContext(fs.readFileSync(path.join(root,'app/www/build-info.js'),'utf8'),ctx);
const build=ctx.window.TK.build,gradle=fs.readFileSync(path.join(root,'app/android/app/build.gradle'),'utf8');
if(!gradle.includes(`versionCode ${build.versionCode}`)||!gradle.includes(`versionName "${build.version}"`))throw Error('Android and website versions differ');
const capacitor=JSON.parse(fs.readFileSync(path.join(root,'app/capacitor.config.json'),'utf8'));
if(capacitor.appId!==build.packageId||!gradle.includes(`applicationId "${build.packageId}"`))throw Error('Android, Capacitor and website package IDs differ');
console.log(`PASS ${count} JavaScript files, all page asset references, and build ${build.version}/${build.versionCode}`);
