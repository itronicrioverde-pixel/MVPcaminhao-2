import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import ts from 'typescript';
const root=resolve('.'),temp=await mkdtemp(join(tmpdir(),'rota-api-errors-test-')),compiled=new Map();
async function compile(file){file=resolve(root,file);if(compiled.has(file))return compiled.get(file);const out=join(temp,compiled.size+'.mjs');compiled.set(file,out);let source=await readFile(file,'utf8');source=source.replace(/import\s*\{\s*env\s*\}\s*from\s*["']cloudflare:workers["'];?/g,'const env = globalThis.__testEnvServer;');for(const match of [...source.matchAll(/from\s*["']([^"']+)["']/g)]){let target=match[1];if(target==='zod')target=import.meta.resolve('zod');else if(target.startsWith('@/'))target=pathToFileURL(await compile(target.slice(2)+'.ts')).href;else if(target.startsWith('.'))target=pathToFileURL(await compile(resolve(dirname(file),target+'.ts'))).href;source=source.replace(match[0],`from ${JSON.stringify(target)}`);}await writeFile(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return out;}
globalThis.__testEnvServer={};
const SESSION='Sua sessão expirou ou esta conta não possui acesso. Entre novamente.';
const request=(path,body,user='owner-a',method='POST')=>new Request('https://test.local'+path,{method:body?method:'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
async function thrown(fn){try{await fn();}catch(e){return e;}assert.fail('esperava que a rota lançasse uma Response');}
async function body(resp){return resp.json();}
try{
 const records=await import(pathToFileURL(await compile('app/api/records/route.ts')));
 const admin=await import(pathToFileURL(await compile('app/api/admin/route.ts')));
 const logo=await import(pathToFileURL(await compile('app/api/logo/route.ts')));
 const route=await import(pathToFileURL(await compile('app/api/route-estimate/route.ts')));
 const server=await import(pathToFileURL(await compile('lib/records-server.ts')));
 const unauthorized=await thrown(()=>server.owner(request('/api/records',null,'')));assert.ok(unauthorized instanceof Response);assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get('content-type')?.includes('application/json'),true);const ua=await body(unauthorized);assert.equal(ua.error,SESSION);assert.equal(ua.code,'SESSION_EXPIRED');
 const forbidden=await thrown(()=>server.owner(new Request('https://test.local/api/records',{method:'POST',headers:{'oai-authenticated-user-id':'owner-a','origin':'https://evil.example','content-type':'application/json'},body:JSON.stringify({kind:'trip'})})));assert.equal(forbidden.status,403);assert.equal((await body(forbidden)).code,'INVALID_ORIGIN');
 const validation=server.failure(new z.ZodError([]));assert.equal(validation.status,400);assert.equal((await body(validation)).code,'INVALID_DATA');
 const syntax=server.failure(new SyntaxError('Unexpected token < in JSON'));assert.equal(syntax.status,400);assert.equal((await body(syntax)).code,'INVALID_DATA');
 const internal=server.failure(new Error('SENSITIVE-INTERNAL-DETAIL'));assert.equal(internal.status,500);const internalBody=await body(internal);assert.equal(internalBody.code,'INTERNAL_ERROR');assert.ok(!internalBody.error.includes('SENSITIVE-INTERNAL-DETAIL'));
 const typeBad=await records.POST(request('/api/records',{kind:'unknown'}));assert.equal(typeBad.status,400);assert.equal((await body(typeBad)).code,'INVALID_TYPE');
 const deleteBad=await records.DELETE(request('/api/records?kind=unknown&id=x',null,'owner-a','DELETE'));assert.equal(deleteBad.status,400);assert.equal((await body(deleteBad)).code,'INVALID_TYPE');
 const noAuthGet=await records.GET(request('/api/records',null,''));assert.equal(noAuthGet.status,401);assert.equal((await body(noAuthGet)).code,'SESSION_EXPIRED');
 const adminBad=await admin.POST(request('/api/admin',{action:'wat'}));assert.equal(adminBad.status,400);assert.equal((await body(adminBad)).code,'INVALID_TYPE');
 assert.equal((await admin.GET(request('/api/admin?action=backup',null,''))).status,401);
 assert.equal((await logo.GET(request('/api/logo',null,''))).status,401);
 const noCity=await route.POST(request('/api/route-estimate',{origin:'Rio Verde, GO',destination:'Cidade inexistente, XX'}));assert.equal(noCity.status,422);assert.equal((await body(noCity)).code,'INVALID_CITY');
 const sameCity=await route.POST(request('/api/route-estimate',{origin:'Rio Verde, GO',destination:'Rio Verde, GO'}));assert.equal(sameCity.status,422);assert.equal((await body(sameCity)).code,'SAME_CITY');
 const shortInput=await route.POST(request('/api/route-estimate',{origin:'X',destination:'Y'}));assert.equal(shortInput.status,400);assert.equal((await body(shortInput)).code,'INVALID_DATA');
 const brokenJson=await route.POST(new Request('https://test.local/api/route-estimate',{method:'POST',headers:{'oai-authenticated-user-id':'owner-a','content-type':'application/json'},body:'{not json'}));assert.equal(brokenJson.status,400);assert.equal((await body(brokenJson)).code,'INVALID_DATA');
 const snap=await admin.GET(request('/api/admin?action=snapshot&key=other',null,''));assert.equal(snap.status,401);
 console.log('PASS: 401/403 JSON com código estável; validação, sintaxe e erro interno sem vazamento; tipo inválido; rotas admin, logo e rota respondem { error, code }.');
}finally{await rm(temp,{recursive:true,force:true});}