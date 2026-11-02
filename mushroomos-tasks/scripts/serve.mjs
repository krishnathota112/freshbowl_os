import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT || 5190);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.apk':'application/vnd.android.package-archive'};
http.createServer((req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');let name=decodeURIComponent(url.pathname),directory='app/www';
    if(name.startsWith('/weighbridge/')){directory='weighbridge-app/www';name=name.slice('/weighbridge'.length);}
    else if(name.startsWith('/downloads/')){directory='release-site';name=name.slice('/downloads'.length);}
    const root=path.resolve(project,directory);let file=path.resolve(root,'.'+name);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if(name.endsWith('/'))file=path.join(file,'index.html');
    if(!fs.existsSync(file)&&!path.extname(file)&&fs.existsSync(file+'.html'))file+='.html';
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(400);res.end('Invalid request');}
}).listen(port,'127.0.0.1',()=>console.log(`Tasks: http://127.0.0.1:${port}/ | Weighbridge: /weighbridge/ | APK downloads: /downloads/`));
