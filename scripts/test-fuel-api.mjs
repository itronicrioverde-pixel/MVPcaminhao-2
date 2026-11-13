import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
const root=resolve('.'),temp=await mkdtemp(join(tmpdir(),'rota-fuel-api-')),compiled=new Map();
async function compile(file){file=resolve(root,file);if(compiled.has(file))return compiled.get(file);const out=join(temp,compiled.size+'.mjs');compiled.set(file,out);let source=await readFile(file,'utf8');source=source.replace(/import\s*\{\s*env\s*\}\s*from\s*["']cloudflare:workers["'];?/g,'const env=globalThis.__testEnv;');for(const match of [...source.matchAll(/from\s*["']([^"']+)["']/g)]){let target=match[1];if(target==='zod')target=import.meta.resolve('zod');else if(target.startsWith('@/'))target=pathToFileURL(await compile(target.slice(2)+'.ts')).href;else if(target.startsWith('.'))target=pathToFileURL(await compile(resolve(dirname(file),target+'.ts'))).href;source=source.replace(match[0],`from ${JSON.stringify(target)}`);}await writeFile(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return out;}
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-01',d1Databases:['DB'],r2Buckets:['BUCKET']});
try{
  const DB=await mf.getD1Database('DB');globalThis.__testEnv={DB,BUCKET:await mf.getR2Bucket('BUCKET')};
  for(const file of (await readdir(join(root,'drizzle'))).filter(f=>f.endsWith('.sql')).sort()){const sql=await readFile(join(root,'drizzle',file),'utf8');for(const part of sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await DB.exec(part.replace(/\s*\n\s*/g,' '));}
  const fuel=await import(pathToFileURL(await compile('app/api/fuel/route.ts')));
  const call=(method,path,body,user='owner-a',extra={})=>new Request('https://test.local'+path,{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const rec=(id,odometerKm,liters,full=true,state='loaded')=>({id,odometerKm,litersMilli:liters*1000,full,state});
  const list=async(user='owner-a')=>(await (await fuel.GET(call('GET','/api/fuel',undefined,user))).json()).records;

  // sem sessão e origem diferente são recusados
  let r=await fuel.GET(call('GET','/api/fuel',undefined,''));assert.equal(r.status,401);assert.equal((await r.json()).code,'SESSION_EXPIRED');
  r=await fuel.POST(call('POST','/api/fuel',rec('z1',100000,400),'owner-a',{origin:'https://evil.example'}));assert.equal(r.status,403);
  assert.deepEqual(await list(),[]);

  // criar e listar, em ordem de odômetro
  r=await fuel.POST(call('POST','/api/fuel',rec('a2',100600,300)));assert.equal(r.status,201);assert.equal((await r.json()).id,'a2');
  assert.equal((await fuel.POST(call('POST','/api/fuel',rec('z1',100000,400)))).status,201);
  assert.equal((await fuel.POST(call('POST','/api/fuel',rec('a3',101000,160,false,'empty')))).status,201);
  assert.deepEqual(await list(),[rec('z1',100000,400),rec('a2',100600,300),rec('a3',101000,160,false,'empty')]);

  // sem id vindo do cliente, o servidor cria um
  r=await fuel.POST(call('POST','/api/fuel',{odometerKm:101200,litersMilli:80000,full:true,state:'empty'}));assert.equal(r.status,201);const made=(await r.json()).id;assert.ok(typeof made==='string'&&made.length>=8);
  assert.equal((await list()).length,4);

  // mesmo odômetro duas vezes: 409; mesmo id duas vezes: também 409
  r=await fuel.POST(call('POST','/api/fuel',rec('zz',100600,10)));assert.equal(r.status,409);assert.equal((await r.json()).code,'CONFLICT');
  r=await fuel.POST(call('POST','/api/fuel',rec('a2',555555,10)));assert.equal(r.status,409);
  assert.equal((await list()).length,4);

  // validação
  for(const bad of [rec('b',-1,10),rec('b',100.5,10),rec('b',9999999,10),{...rec('b',200000,10),litersMilli:0},{...rec('b',200000,10),litersMilli:2000001},{...rec('b',200000,10),litersMilli:10.5},{...rec('b',200000,10),state:'x'},{...rec('b',200000,10),full:'sim'},{...rec('',200000,10)},{...rec('x'.repeat(65),200000,10)},{}]){
    r=await fuel.POST(call('POST','/api/fuel',bad));assert.equal(r.status,400,JSON.stringify(bad));assert.equal((await r.json()).code,'INVALID_DATA');
  }
  r=await fuel.POST(new Request('https://test.local/api/fuel',{method:'POST',headers:{'oai-authenticated-user-id':'owner-a'},body:'{nao e json'}));assert.equal(r.status,400);
  assert.equal((await list()).length,4);

  // cada dono vê só o seu; o mesmo odômetro e o mesmo id em outro dono não conflitam
  assert.deepEqual(await list('owner-b'),[]);
  assert.equal((await fuel.POST(call('POST','/api/fuel',rec('z1',100000,500),'owner-b'))).status,201);
  assert.equal((await list('owner-b')).length,1);assert.equal((await list('owner-b'))[0].litersMilli,500000);
  assert.equal((await list()).find(x=>x.id==='z1').litersMilli,400000);

  // importação em lote: idempotente, ignora o que já existe, conta o que entrou e o que ficou de fora
  const batch=[rec('c1',200000,400),rec('c2',200500,250),rec('z1',100000,999),rec('c3',100600,5)];
  r=await fuel.PUT(call('PUT','/api/fuel',{records:batch}));assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{imported:2,skipped:2});
  r=await fuel.PUT(call('PUT','/api/fuel',{records:batch}));assert.deepEqual(await r.json(),{imported:0,skipped:4},'segunda vez não duplica');
  assert.equal((await list()).length,6);assert.equal((await list()).find(x=>x.id==='z1').litersMilli,400000,'o que já estava não é sobrescrito');
  assert.equal((await fuel.PUT(call('PUT','/api/fuel',{records:[rec('d1',300000,10),{...rec('d2',300100,10),litersMilli:-5}]}))).status,400);
  assert.equal((await list()).some(x=>x.id==='d1'),false,'lote com item inválido não grava nada');
  assert.equal((await fuel.PUT(call('PUT','/api/fuel',{records:Array.from({length:501},(_,i)=>rec('m'+i,400000+i,10))}))).status,400,'limite de 500');
  assert.equal((await fuel.PUT(call('PUT','/api/fuel',{records:[]}))).status,200);
  assert.equal((await fuel.PUT(call('PUT','/api/fuel',{}))).status,400);
  assert.equal((await fuel.PUT(call('PUT','/api/fuel',{records:[rec('e1',1,1),rec('e2',1,2)]}))).status,400,'dois iguais no mesmo lote são recusados');

  // apagar um, de outro dono não apaga; apagar tudo só do dono
  r=await fuel.DELETE(call('DELETE','/api/fuel?id=c1',undefined,'owner-b'));assert.equal(r.status,404);assert.equal((await list()).length,6);
  r=await fuel.DELETE(call('DELETE','/api/fuel?id=c1'));assert.equal(r.status,200);assert.equal((await list()).length,5);
  r=await fuel.DELETE(call('DELETE','/api/fuel?id=c1'));assert.equal(r.status,404);
  r=await fuel.DELETE(call('DELETE','/api/fuel'));assert.equal(r.status,400);
  r=await fuel.DELETE(call('DELETE','/api/fuel?all=true'));assert.equal(r.status,200);assert.equal((await r.json()).deleted,5);
  assert.deepEqual(await list(),[]);assert.equal((await list('owner-b')).length,1,'o outro dono fica intacto');
  // depois de apagar, o odômetro pode ser usado de novo
  assert.equal((await fuel.POST(call('POST','/api/fuel',rec('f1',100000,400)))).status,201);
  console.log('PASS: /api/fuel — sessão e origem, criar/listar em ordem, id do servidor, odômetro e id duplicados (409), validação, isolamento por dono, importação em lote idempotente e atômica, limite, apagar um e todos.');
}finally{await mf.dispose();await rm(temp,{recursive:true,force:true});}
