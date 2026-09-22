import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=resolve('.'),temp=await mkdtemp(join(tmpdir(),'rota-records-test-')),compiled=new Map();
async function compile(file){file=resolve(root,file);if(compiled.has(file))return compiled.get(file);const out=join(temp,compiled.size+'.mjs');compiled.set(file,out);let source=await readFile(file,'utf8');for(const match of [...source.matchAll(/from\s*["']([^"']+)["']/g)]){let target=match[1];if(target==='zod')target=import.meta.resolve('zod');else if(target.startsWith('@/'))target=pathToFileURL(await compile(target.slice(2)+'.ts')).href;else if(target.startsWith('.'))target=pathToFileURL(await compile(resolve(dirname(file),target+'.ts'))).href;source=source.replace(match[0],`from ${JSON.stringify(target)}`);}await writeFile(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return out;}
const names=[];
const company={name:'Empresa X',cnpj:'00.000.000/0000-00'};
const tripA={id:'A',tripDate:'2026-01-05',clientName:'Cliente X',origin:'São Paulo, SP',destination:'Rio de Janeiro, RJ',cargoType:'Grãos',freightPerTon:250,freight:200000,km:480,diesel:1200,toll:340,oil:120,extras:90,extraItems:[{category:'Ajudante',amount:80}],loadedWeight:20000,deliveredWeight:19900,driverPercent:12,axles:6,lossAlertPercent:5,notes:'ok'};
const expenseA={id:'E1',expenseDate:'2026-01-06',category:'Manutenção',description:'Pneus',amount:150};
const revenueA={id:'R1',revenueDate:'2026-01-07',category:'Reembolso',description:'Extra',amount:200};
try{
 const {parseRecordsPayload}=await import(pathToFileURL(await compile('lib/records-payload.ts')));
 const {saveThenRefresh,errorMessage,REFRESH_FAILED_MESSAGE,DELETE_REFRESH_FAILED_MESSAGE}=await import(pathToFileURL(await compile('lib/records-save.ts')));
 const {createMountState,createLatestRequest}=await import(pathToFileURL(await compile('lib/records-load.ts')));
 assert.ok(parseRecordsPayload({trips:[tripA],expenses:[expenseA],revenues:[revenueA],company}),'payload completo válido passa');
 names.push('payload completo válido é aceito');
 const d1={trips:[{...tripA,ownerId:'u-owner',createdAt:'2026-01-05 09:30:00'}],expenses:[{...expenseA,ownerId:'u-owner',createdAt:'2026-01-06 10:00:00'}],revenues:[{...revenueA,ownerId:'u-owner',createdAt:'2026-01-07 11:00:00'}],company:{...company,logoKey:'logo/rota.png',ownerId:'u-owner',createdAt:'2026-01-01 00:00:00'}};
 const real=parseRecordsPayload(d1);
 assert.ok(real,'payload realista do D1 com ownerId e createdAt é aceito');
 assert.equal(real.trips.length,1);assert.equal(real.expenses.length,1);assert.equal(real.revenues.length,1);
 assert.ok(!('ownerId' in real.trips[0])&&!('createdAt' in real.trips[0]),'ownerId e createdAt removidos das viagens');
 assert.ok(!('ownerId' in real.expenses[0])&&!('createdAt' in real.expenses[0]),'ownerId e createdAt removidos das despesas');
 assert.ok(!('ownerId' in real.revenues[0])&&!('createdAt' in real.revenues[0]),'ownerId e createdAt removidos das receitas');
 assert.ok(!('ownerId' in real.company)&&!('createdAt' in real.company),'ownerId e createdAt removidos da empresa');
 assert.equal(real.company.logoKey,'logo/rota.png','logoKey preservada como string');
 names.push('resposta real do D1 é aceita e os metadados são removidos');
 assert.equal(parseRecordsPayload({trips:[tripA],expenses:[expenseA],revenues:[revenueA],company:{...company,logoKey:null}}).company.logoKey,null,'logoKey null é preservada');
 assert.equal(parseRecordsPayload({trips:[tripA],expenses:[expenseA],revenues:[revenueA],company}).company.logoKey,undefined,'logoKey ausente permanece undefined e é aceita');
 names.push('logoKey string, null e ausente são aceitas e preservadas');
 const numerico=parseRecordsPayload({trips:[{...tripA,freight:'200000',km:'480',diesel:'1200',extras:'90'}],expenses:[{...expenseA,amount:'150.5'}],revenues:[{...revenueA,amount:'200'}],company});
 assert.ok(numerico,'strings numéricas coercíveis são aceitas');
 assert.equal(typeof numerico.trips[0].freight,'number');assert.equal(numerico.trips[0].freight,200000);
 assert.equal(typeof numerico.trips[0].km,'number');assert.equal(numerico.trips[0].km,480);
 assert.equal(typeof numerico.trips[0].extras,'number');assert.equal(numerico.trips[0].extras,90);
 assert.equal(typeof numerico.expenses[0].amount,'number');assert.equal(numerico.expenses[0].amount,150.5);
 assert.equal(typeof numerico.revenues[0].amount,'number');assert.equal(numerico.revenues[0].amount,200);
 names.push('strings numéricas nunca permanecem como string após o parse');
 const semId={...tripA};delete semId.id;
 const semExtras={...tripA};delete semExtras.extras;
 const casos=[
  [undefined,'corpo vazio'],
  ['<html>...</html>','HTML'],
  [{},'objeto sem arrays e sem empresa'],
  [{trips:[],expenses:[],revenues:[],company:null},'empresa nula'],
  [{trips:[],expenses:[],company},'array de receitas ausente'],
  [{trips:[],expenses:[],revenues:[],company:{name:'',cnpj:''}},'empresa sem nome'],
  [{trips:[],expenses:[],revenues:[],company:{name:'X'}},'empresa incompleta'],
  [{trips:[null],expenses:[],revenues:[],company},'viagem nula'],
  [{trips:[semId],expenses:[],revenues:[],company},'viagem sem id'],
  [{trips:[semExtras],expenses:[],revenues:[],company},'viagem sem extras'],
  [{trips:[{...tripA,id:''}],expenses:[],revenues:[],company},'viagem com id vazio'],
  [{trips:[{...tripA,tripDate:'ontem'}],expenses:[],revenues:[],company},'data inválida'],
  [{trips:[{...tripA,freight:NaN}],expenses:[],revenues:[],company},'frete NaN'],
  [{trips:[{...tripA,freight:Infinity}],expenses:[],revenues:[],company},'frete infinito'],
  [{trips:[{...tripA,freight:'ab'}],expenses:[],revenues:[],company},'frete não numérico'],
  [{trips:[{...tripA,extraItems:[{category:'',amount:50}]}],expenses:[],revenues:[],company},'extra com categoria vazia'],
  [{trips:[{...tripA,extraItems:[{category:'Ajudante',amount:Infinity}]}],expenses:[],revenues:[],company},'extra com valor infinito'],
  [{trips:[],expenses:[{expenseDate:'2026-01-06',category:'Manutenção',description:'Pneus'}],revenues:[],company},'despesa sem valor'],
  [{trips:[],expenses:[{expenseDate:'2026-01-06',category:'Manutenção',amount:150}],revenues:[],company},'despesa sem descrição'],
  [{trips:[],expenses:[{...expenseA,id:''}],revenues:[],company},'despesa com id vazio'],
  [{trips:[],expenses:[],revenues:[{revenueDate:'2026-01-07',category:'Reembolso',description:'Extra',amount:-5}],company},'receita com valor negativo'],
  [{trips:[],expenses:[],revenues:[{revenueDate:'2026-01-07',category:'Reembolso',amount:200}],company},'receita sem descrição'],
  [{trips:[],expenses:[],revenues:[{...revenueA,amount:Infinity}],company},'receita com valor infinito']
 ];
 for(const [payload,label] of casos)assert.equal(parseRecordsPayload(payload),null,'rejeitado: '+label);
 names.push('payload incompleto ou inválido é rejeitado ('+casos.length+' casos)');
 let saveCount=0,refreshCount=0,closeCalled=0,onSaveFailedCalled=0;
 const saveFail=await saveThenRefresh({save:async()=>{saveCount++;throw new Error('falha no POST');},refresh:async()=>{refreshCount++;return true;},close:()=>{closeCalled++;},onSaveFailed:()=>{onSaveFailedCalled++;}});
 assert.equal(saveFail.saved,false,'falha de salvamento não marca como salvo');
 assert.equal(refreshCount,0,'save falhou: não executa refresh');
 assert.equal(closeCalled,0,'save falhou: diálogo permanece aberto (rascunho preservado)');
 assert.equal(onSaveFailedCalled,1,'falha de salvamento é exibida');
 assert.equal(errorMessage(new Error('falha no POST')),'falha no POST');
 assert.equal(errorMessage(undefined),'Não foi possível concluir a operação. Tente novamente.');
 const refreshFn=async()=>{refreshCount++;if(refreshCount===1)throw new Error('rede caiu');return true;};
 const refreshFail=await saveThenRefresh({save:async()=>{saveCount++;},refresh:refreshFn,close:()=>{closeCalled++;},onSaveFailed:onSaveFailedCalled++});
 assert.deepEqual(refreshFail,{saved:true,refreshed:false},'atualização com falha é reportada sem fingir que salvou de novo');
 assert.equal(saveCount,2,'save funcionou e refresh falhou: o save não é repetido');
 assert.equal(closeCalled,1,'save ok + refresh falhou: diálogo é fechado na mesma');
 assert.equal(REFRESH_FAILED_MESSAGE,'Registro salvo, mas a tela não pôde ser atualizada');
 assert.equal(DELETE_REFRESH_FAILED_MESSAGE,'Registro excluído, mas a tela não pôde ser atualizada');
 const retry=await refreshFn();
 assert.equal(retry,true,'retry (somente refresh/get) consegue atualizar a tela');
 assert.equal(saveCount,2,'retry não repete o salvamento');
 assert.equal(refreshCount,2,'retry executa somente o refresh');
 names.push('falha de save mantém diálogo; save ok + refresh falho não repete o save e retry só atualiza');
 let deleteCount=0,refreshAfterDelete=0;
 const del=await saveThenRefresh({save:async()=>{deleteCount++;throw new Error('falha na exclusão');},refresh:async()=>{refreshAfterDelete++;return true;},close:()=>{},onSaveFailed:()=>{}});
 assert.equal(del.saved,false);assert.equal(refreshAfterDelete,0,'delete falhou: não executa refresh');
 assert.equal(deleteCount,1);
 names.push('delete falhou: não executa refresh');
 const latest=createLatestRequest();
 const primeiro=latest.begin(),segundo=latest.begin();
 assert.equal(latest.isCurrent(segundo),true,'requisição mais recente pode alterar o estado');
 assert.equal(latest.isCurrent(primeiro),false,'somente a requisição mais recente altera o estado');
 names.push('duas requisições concorrentes: somente a mais recente altera o estado');
 const strict=createMountState(false);
 strict.mount();strict.unmount();strict.mount();
 assert.equal(strict.current,true,'Strict Mode (montar, desmontar e montar de novo) continua funcionando');
 const stale=createMountState(false);const staleLatest=createLatestRequest();
 stale.mount();const seq=staleLatest.begin();stale.unmount();
 assert.equal(stale.current&&staleLatest.isCurrent(seq),false,'resposta concluída depois do unmount não altera o estado');
 assert.equal(stale.current,false);
 names.push('montagem/desmontagem do Strict Mode e resposta tardia após unmount são respeitadas');
 console.log('PASS: '+names.join('; ')+'.');
}finally{await rm(temp,{recursive:true,force:true});}