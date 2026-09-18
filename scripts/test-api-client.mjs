import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=resolve('.'),temp=await mkdtemp(join(tmpdir(),'api-client-test-')),compiled=new Map();
async function compile(file){file=resolve(root,file);if(compiled.has(file))return compiled.get(file);const out=join(temp,compiled.size+'.mjs');compiled.set(file,out);let source=await readFile(file,'utf8');for(const match of [...source.matchAll(/from\s*["']([^"']+)["']/g)]){let target=match[1];if(target.startsWith('@/'))target=pathToFileURL(await compile(target.slice(2)+'.ts')).href;else if(target.startsWith('.'))target=pathToFileURL(await compile(resolve(dirname(file),target+'.ts'))).href;source=source.replace(match[0],`from ${JSON.stringify(target)}`);}await writeFile(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return out;}
const SESSION='Sua sessão expirou ou esta conta não possui acesso. Entre novamente.';
const originalFetch=globalThis.fetch;
const names=[];
async function throwing(fn){try{await fn();}catch(e){return e;}assert.fail('esperava que a requisição lançasse um erro');}
try{
 const {httpApi,ApiError,UNEXPECTED_RESPONSE_MESSAGE}=await import(pathToFileURL(await compile('lib/api-client.ts')));
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 globalThis.fetch=async()=>json({ok:true,id:'abc'});let out=await httpApi.get('/api/records');assert.deepEqual(out,{ok:true,id:'abc'});names.push('resposta JSON com sucesso');
 let sent;globalThis.fetch=async(_url,init)=>{sent=init;return json({ok:true,id:'x'},201);};out=await httpApi.post('/api/records',{kind:'trip'});assert.equal(sent.method,'POST');assert.equal(sent.headers['content-type'],'application/json');assert.equal(sent.body,JSON.stringify({kind:'trip'}));assert.deepEqual(out,{ok:true,id:'x'});
 globalThis.fetch=async()=>new Response('ok',{status:200,headers:{'content-type':'text/plain'}});let e=await throwing(()=>httpApi.get('/api'));assert.ok(e instanceof ApiError);assert.equal(e.status,0);assert.equal(e.code,'INVALID_RESPONSE');assert.equal(e.message,UNEXPECTED_RESPONSE_MESSAGE);names.push('texto 200 não é tratado como sucesso');
  globalThis.fetch=async()=>new Response('<html><body>página</body></html>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});e=await throwing(()=>httpApi.get('/api'));assert.ok(e instanceof ApiError);assert.equal(e.code,'INVALID_RESPONSE');names.push('HTML 200 não é tratado como sucesso');
 globalThis.fetch=async()=>json({error:'Confira os dados informados.',code:'INVALID_DATA'},422);e=await throwing(()=>httpApi.get('/api'));assert.ok(e instanceof ApiError);assert.equal(e.status,422);assert.equal(e.code,'INVALID_DATA');assert.equal(e.message,'Confira os dados informados.');names.push('resposta JSON com erro');
 globalThis.fetch=async()=>json({error:'Aguarde um instante e tente calcular novamente.',code:'RATE_LIMITED'},429);e=await throwing(()=>httpApi.get('/api'));assert.equal(e.status,429);assert.equal(e.code,'RATE_LIMITED');assert.equal(e.message,'Aguarde um instante e tente calcular novamente.');
 globalThis.fetch=async()=>new Response('Unauthorized',{status:401,headers:{'content-type':'text/plain; charset=utf-8'}});e=await throwing(()=>httpApi.get('/api'));assert.ok(e instanceof ApiError);assert.equal(e.status,401);assert.equal(e.code,'SESSION_EXPIRED');assert.equal(e.message,SESSION);assert.ok(!e.message.includes('Unexpected'));
 globalThis.fetch=async()=>json({error:'Entre novamente na sua conta.'},401);e=await throwing(()=>httpApi.get('/api'));assert.equal(e.message,SESSION);names.push('resposta 401 em texto e JSON mantém mensagem fixa');
 globalThis.fetch=async()=>new Response('<html><body><h1>500 Internal Server Error</h1></body></html>',{status:500,headers:{'content-type':'text/html; charset=utf-8'}});e=await throwing(()=>httpApi.get('/api'));assert.ok(e instanceof ApiError);assert.equal(e.status,500);assert.equal(e.message,'Erro interno no servidor. Tente novamente em instantes.');assert.ok(!/\bhtml\b/i.test(e.message));assert.ok(!e.message.includes('Internal Server'));names.push('resposta 500 em HTML');
 globalThis.fetch=async()=>json({error:'Não encontrado',code:'NOT_FOUND'},404);e=await throwing(()=>httpApi.get('/api'));assert.equal(e.status,404);assert.equal(e.code,'NOT_FOUND');
 globalThis.fetch=async()=>json({error:'Proibido',code:'FORBIDDEN'},403);e=await throwing(()=>httpApi.get('/api'));assert.equal(e.status,403);
 globalThis.fetch=async()=>json({error:'Conflito',code:'CONFLICT'},409);e=await throwing(()=>httpApi.get('/api'));assert.equal(e.status,409);
 globalThis.fetch=async()=>json({error:'Limite',code:'RATE_LIMITED'},429);e=await throwing(()=>httpApi.get('/api'));assert.equal(e.status,429);
 globalThis.fetch=async()=>json({error:'Erro interno',code:'INTERNAL_ERROR'},500);e=await throwing(()=>httpApi.get('/api'));assert.equal(e.status,500);names.push('403, 404, 409, 429 e 500 tratados de forma previsível');
globalThis.fetch=async()=>new Response(null,{status:200,headers:{'content-type':'text/plain'}});out=await httpApi.get('/api/empty');assert.equal(out,undefined);
  globalThis.fetch=async()=>new Response(null,{status:204});out=await httpApi.get('/api/empty');assert.equal(out,undefined);
  globalThis.fetch=async()=>new Response(null,{status:200,headers:{'content-type':'application/json'}});out=await httpApi.get('/api/empty');assert.equal(out,undefined);names.push('resposta vazia é sucesso sem dados, independentemente de httpApi');
 globalThis.fetch=async()=>{throw new TypeError('fetch failed');};e=await throwing(()=>httpApi.get('/api'));assert.ok(e instanceof ApiError);assert.equal(e.status,0);assert.equal(e.code,'NETWORK_ERROR');assert.equal(e.message,'Sem conexão com o servidor. Verifique sua internet e tente novamente.');names.push('interrupção de rede');
 globalThis.fetch=(_url,init)=>new Promise((_res,rej)=>{init.signal.addEventListener('abort',()=>rej(init.signal.reason??new DOMException('The operation was aborted','AbortError')),{once:true});});e=await throwing(()=>httpApi.get('/api',{timeoutMs:30}));assert.ok(e instanceof ApiError);assert.equal(e.status,0);assert.equal(e.code,'TIMEOUT');assert.ok(e.message.includes('demorou demais'));names.push('timeout');
 const controller=new AbortController();controller.abort();e=await throwing(()=>httpApi.get('/api',{signal:controller.signal}));assert.ok(e instanceof DOMException&&e.name==='AbortError','abort do chamador é propagado');names.push('abort do chamador propagado sem mensagem técnica');
 console.log('PASS: '+names.join('; ')+'.');
}finally{globalThis.fetch=originalFetch;await rm(temp,{recursive:true,force:true});}