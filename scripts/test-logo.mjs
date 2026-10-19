import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
const root=resolve('.'),temp=await mkdtemp(join(tmpdir(),'rota-logo-')),compiled=new Map();
async function compile(file){file=resolve(root,file);if(compiled.has(file))return compiled.get(file);const out=join(temp,compiled.size+'.mjs');compiled.set(file,out);let source=await readFile(file,'utf8');source=source.replace(/import\s*\{\s*env\s*\}\s*from\s*["']cloudflare:workers["'];?/g,'const env=globalThis.__testEnv;');for(const match of [...source.matchAll(/from\s*["']([^"']+)["']/g)]){let target=match[1];if(target==='zod')target=import.meta.resolve('zod');else if(target.startsWith('@/'))target=pathToFileURL(await compile(target.slice(2)+'.ts')).href;else if(target.startsWith('.'))target=pathToFileURL(await compile(resolve(dirname(file),target+'.ts'))).href;source=source.replace(match[0],`from ${JSON.stringify(target)}`);}await writeFile(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return out;}
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['BUCKET']});
const b64=bytes=>Buffer.from(bytes).toString('base64');
const png=(extra=16)=>[137,80,78,71,13,10,26,10,...new Array(extra).fill(7)];
const jpeg=[255,216,255,224,0,16,74,70,73,70];
const webp=[...Buffer.from('RIFF'),1,2,3,4,...Buffer.from('WEBP'),0,0];
try{
 const DB=await mf.getD1Database('DB'),BUCKET=await mf.getR2Bucket('BUCKET');globalThis.__testEnv={DB,BUCKET};
 for(const file of (await readdir(join(root,'drizzle'))).filter(f=>f.endsWith('.sql')).sort()){const sql=await readFile(join(root,'drizzle',file),'utf8');for(const part of sql.split(';').map(x=>x.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean))await DB.prepare(part).run();}
 const logo=await import(pathToFileURL(await compile('app/api/logo/route.ts'))),admin=await import(pathToFileURL(await compile('app/api/admin/route.ts')));
 const req=(method,body,user='owner-a',headers={})=>new Request('https://test.local/api/logo',{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const send=(bytes,mime='image/png',user='owner-a')=>logo.POST(req('POST',{data:`data:${mime};base64,${b64(bytes)}`},user));

 // sem login e sem logo cadastrada
 assert.equal((await logo.GET(req('GET',undefined,''))).status,401);
 assert.equal((await logo.POST(req('POST',{data:'x'},''))).status,401);
 let res=await logo.GET(req('GET'));assert.equal(res.status,404);assert.equal((await res.json()).code,'NOT_FOUND');

 // envio válido nos três formatos aceitos
 for(const [bytes,mime] of [[png(),'image/png'],[jpeg,'image/jpeg'],[webp,'image/webp']]){
  res=await send(bytes,mime);assert.equal(res.status,200,mime);
  res=await logo.GET(req('GET'));assert.equal(res.status,200);
  assert.equal(res.headers.get('content-type'),mime);
  assert.equal(res.headers.get('cache-control'),'private,no-store','logo não pode ficar em cache compartilhado');
  assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())],bytes,'o arquivo devolvido é idêntico ao enviado');
 }

 // cada conta enxerga somente a própria logo
 assert.equal((await logo.GET(req('GET',undefined,'owner-b'))).status,404);
 assert.equal((await send(png(40),'image/png','owner-b')).status,200);
 assert.equal((await (await logo.GET(req('GET',undefined,'owner-b'))).arrayBuffer()).byteLength,48);
 assert.equal((await (await logo.GET(req('GET'))).arrayBuffer()).byteLength,webp.length,'a logo de A não foi trocada pela de B');

 // envio com a logo salva não apaga nome e CNPJ da empresa
 assert.equal((await admin.POST(req('POST',{action:'company',name:'Transportes Silva',cnpj:'12345678000190'}))).status,200);
 assert.equal((await send(png(),'image/png')).status,200);
 const company=(await (await admin.GET(new Request('https://test.local/api/admin',{headers:{'oai-authenticated-user-id':'owner-a'}}))).json()).company;
 assert.equal(company.name,'Transportes Silva');assert.equal(company.cnpj,'12345678000190');assert.ok(company.logoKey);

 // arquivos recusados: a logo anterior continua valendo
 const before=[...new Uint8Array(await (await logo.GET(req('GET'))).arrayBuffer())];
 const bad=[
  ['tipo não permitido (svg)',png(),'image/svg+xml'],
  ['gif',png(),'image/gif'],
  ['conteúdo não é PNG apesar do tipo',jpeg,'image/png'],
  ['conteúdo não é JPEG apesar do tipo',png(),'image/jpeg'],
  ['conteúdo não é WebP apesar do tipo',png(),'image/webp'],
  ['maior que 500 KB',png(500001),'image/png'],
 ];
 for(const [name,bytes,mime] of bad){res=await send(bytes,mime);assert.equal(res.status,400,name);}
 assert.equal((await logo.POST(req('POST',{data:'data:image/png;base64,@@@'}))).status,400,'base64 inválido');
 assert.equal((await logo.POST(req('POST',{data:'texto solto'}))).status,400,'sem prefixo data:');
 assert.equal((await send(png(499992),'image/png')).status,200,'exatamente 500000 bytes ainda é aceito');
 assert.notDeepEqual([...new Uint8Array(await (await logo.GET(req('GET'))).arrayBuffer())],before,'o envio válido de 500000 bytes substituiu a logo');

 // requisição vinda de outro site é recusada
 res=await logo.POST(req('POST',{data:`data:image/png;base64,${b64(png())}`},'owner-a',{origin:'https://outro-site.example'}));
 assert.equal(res.status,403);assert.equal((await res.json()).code,'INVALID_ORIGIN');

 console.log('PASS: logo sem login e sem cadastro; PNG, JPEG e WebP enviados e devolvidos idênticos; cabeçalhos de segurança; isolamento entre contas; nome e CNPJ preservados; tipos, conteúdo, base64 e tamanho (500 KB) recusados; origem externa bloqueada.');
}finally{await mf.dispose();await rm(temp,{recursive:true,force:true});}
