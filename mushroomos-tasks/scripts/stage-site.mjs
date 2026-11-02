// Stage public frontend assets only; source, credentials and database files stay local.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.work','pages');
fs.mkdirSync(output,{recursive:true});
if(fs.readdirSync(output).length)throw Error('Staging directory must be empty. Use a fresh directory before building a release.');
for(const [source,dest] of [['app/www',''],['weighbridge-app/www','weighbridge'],['release-site','downloads']]) {
  const directory=path.join(root,source),target=path.join(output,dest);fs.mkdirSync(target,{recursive:true});
  for(const name of fs.readdirSync(directory)) {
    const file=path.join(directory,name);
    if(!fs.statSync(file).isFile()||name.startsWith('_'))continue;
    if(source==='release-site'&&!['index.html','download.js','latest.json'].includes(name)&&name!==JSON.parse(fs.readFileSync(path.join(directory,'latest.json'),'utf8')).apk)continue;
    fs.copyFileSync(file,path.join(target,name));
  }
}
const headers=fs.readFileSync(path.join(root,'app/www/_headers'),'utf8')+'\n/downloads/latest.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-store\n/downloads/*.apk\n  Content-Type: application/vnd.android.package-archive\n  Content-Disposition: attachment\n  Cache-Control: public, max-age=31536000, immutable\n';
fs.writeFileSync(path.join(output,'_headers'),headers);
console.log(output);
