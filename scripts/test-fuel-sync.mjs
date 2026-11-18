import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Sincronização das medições: só mostra e envia o que é da conta confirmada pelo servidor, e nunca perde o que ainda não foi enviado.
const temp=await mkdtemp(join(tmpdir(),'rota-fuel-sync-'));
try{
  const compiled=new Map();
  const load=async file=>{file=resolve(file);if(compiled.has(file))return compiled.get(file);const out=join(temp,file.replace(/\W+/g,'_')+'.mjs');compiled.set(file,out);let src=await readFile(file,'utf8');for(const m of [...src.matchAll(/from\s*["']\.\/([a-z-]+)["']/g)])src=src.replace(m[0],`from ${JSON.stringify(pathToFileURL(await load(`lib/${m[1]}.ts`)).href)}`);await writeFile(out,ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return out;};
  const sync=await import(pathToFileURL(await load('lib/fuel-sync.ts')));
  const store=await import(pathToFileURL(await load('lib/fuel-store.ts')));
  const R=(id,km)=>({id,odometerKm:km,litersMilli:100000,full:true,state:'loaded'});
  const mem=()=>{const m=new Map(),reads=[];return {getItem:k=>{reads.push(k);return m.has(k)?m.get(k):null;},setItem:(k,v)=>void m.set(k,String(v)),removeItem:k=>void m.delete(k),_m:m,_reads:reads};};
  const fail=(status)=>Object.assign(new Error('falhou'),status===undefined?{}:{status});
  const server=(owner,records=[],deleted=[],opts={})=>{const calls={uploads:[]};return {calls,api:{
    list:async()=>{if(opts.listError)throw opts.listError;return {ownerKey:owner,records:[...records],deleted:[...deleted]};},
    upload:async(batch)=>{if(opts.uploadError)throw opts.uploadError;calls.uploads.push(batch.map(x=>x.id));records.push(...batch);}}};};

  // 1. conta nova, nada no aparelho: mostra o que está no banco
  let st=mem(),sv=server('aaaa',[R('1',100)]);
  let out=await sync.syncFuel(sv.api,st);
  assert.equal(out.kind,'verified');assert.equal(out.owner,'aaaa');assert.deepEqual(out.records.map(x=>x.id),['1']);assert.deepEqual(out.pendingIds,[]);assert.equal(out.uploadFailure,null);assert.deepEqual(sv.calls.uploads,[],'nada para enviar');
  assert.deepEqual(store.loadFuel(st,'aaaa').map(x=>x.id),['1'],'a cópia fica guardada para a conta');

  // 2. A usou o navegador e B entra; B só vê o dele e nada de A é enviado
  st=mem();store.saveFuel(st,'aaaa',[R('a1',100),R('a2',200)]);
  sv=server('bbbb',[R('b1',300)]);
  out=await sync.syncFuel(sv.api,st);
  assert.deepEqual(out.records.map(x=>x.id),['b1'],'B não vê as de A');assert.deepEqual(sv.calls.uploads,[],'nada de A foi enviado para B');
  assert.ok(!st._reads.includes(store.fuelKey('aaaa')),'nem leu a cópia de A');
  assert.deepEqual(store.loadFuel(st,'aaaa').map(x=>x.id),['a1','a2'],'a cópia de A continua intacta');

  // 3. a consulta falha (500, tempo esgotado, sem rede, sessão): não dá para saber quem é, então não mostra nada de ninguém
  for(const [name,error] of [['erro 500',fail(500)],['sem status (rede ou tempo)',fail()],['sessão expirada',fail(401)]]){
    st=mem();store.saveFuel(st,'aaaa',[R('a1',100)]);sv=server('bbbb',[R('b1',300)],[],{listError:error});
    out=await sync.syncFuel(sv.api,st);
    assert.equal(out.kind,'unverified',name);assert.equal('records' in out,false,`${name}: sem lista`);assert.deepEqual(sv.calls.uploads,[],`${name}: nada enviado`);
    assert.equal(st._reads.length,0,`${name}: não leu nenhuma cópia local`);
    assert.deepEqual(store.loadFuel(st,'aaaa').map(x=>x.id),['a1'],`${name}: a cópia de A continua guardada`);
  }
  assert.equal((await sync.syncFuel(server('x',[],[],{listError:fail(401)}).api,mem())).reason,'session');
  assert.equal((await sync.syncFuel(server('x',[],[],{listError:fail(500)}).api,mem())).reason,'offline');

  // 4. a consulta funciona mas o envio falha: o que ainda não foi enviado continua guardado e visível
  st=mem();store.saveFuel(st,'aaaa',[R('n1',900),R('n2',950)]);
  sv=server('aaaa',[R('1',100)],[],{uploadError:fail()});
  out=await sync.syncFuel(sv.api,st);
  assert.equal(out.kind,'verified');assert.deepEqual(out.pendingIds,['n1','n2'],'avisa o que não foi enviado');
  assert.deepEqual(out.records.map(x=>x.id),['1','n1','n2'],'mostra também o que ainda não foi enviado');
  assert.deepEqual(store.loadFuel(st,'aaaa').map(x=>x.id),['1','n1','n2'],'a cópia guarda tudo, inclusive o não enviado');
  sv=server('aaaa',[R('1',100)]);out=await sync.syncFuel(sv.api,st);
  assert.deepEqual(sv.calls.uploads,[['n1','n2']]);assert.deepEqual(out.pendingIds,[]);assert.deepEqual(out.records.map(x=>x.id),['1','n1','n2']);

  // 5. o envio cai no meio: nada some, e a segunda tentativa não duplica
  st=mem();store.saveFuel(st,'aaaa',[R('n1',900)]);
  await sync.syncFuel(server('aaaa',[],[],{uploadError:fail(503)}).api,st);assert.deepEqual(store.loadFuel(st,'aaaa').map(x=>x.id),['n1']);
  const ok=server('aaaa',[R('n1',900)]);
  out=await sync.syncFuel(ok.api,st);assert.deepEqual(out.records.map(x=>x.id),['n1'],'sem duplicar');assert.deepEqual(ok.calls.uploads,[]);

  // 6. apagados não voltam, e o mesmo odômetro é avisado
  st=mem();store.saveFuel(st,'aaaa',[R('velho',100),R('x',200),R('novo',300)]);
  sv=server('aaaa',[R('y',200)],['velho']);out=await sync.syncFuel(sv.api,st);
  assert.deepEqual(out.records.map(x=>x.id),['y','novo']);assert.deepEqual(sv.calls.uploads,[['novo']]);assert.equal(out.removed,1);assert.equal(out.conflicts,1);
  assert.deepEqual(store.loadFuel(st,'aaaa').map(x=>x.id),['y','novo'],'o apagado sai da cópia');

  // 7. armazenamento bloqueado: continua funcionando com o que o banco tem
  const broken={getItem(){throw new Error('x');},setItem(){throw new Error('x');},removeItem(){throw new Error('x');}};
  out=await sync.syncFuel(server('aaaa',[R('1',100)]).api,broken);assert.equal(out.kind,'verified');assert.deepEqual(out.records.map(x=>x.id),['1']);
  out=await sync.syncFuel(server('aaaa',[R('1',100)]).api,null);assert.equal(out.kind,'verified');

  // 8. resposta fora do formato nunca derruba a tela: vira 'não confirmado'
  for(const bad of [{},null,{ownerKey:5,records:[],deleted:[]},{ownerKey:'a/b',records:[],deleted:[]},{ownerKey:'aaaa',records:'x',deleted:[]},{ownerKey:'aaaa',records:[{id:1}],deleted:[]},{ownerKey:'aaaa',records:[],deleted:'x'}]){
    const o=await sync.syncFuel({list:async()=>bad,upload:async()=>{}},mem());
    assert.equal(o.kind,'unverified',`resposta ruim: ${JSON.stringify(bad)}`);
  }
  await assert.doesNotReject(()=>sync.syncFuel({list:async()=>({ownerKey:'aaaa',records:[R('1',100),R('2',100)],deleted:[]}),upload:async()=>{}},mem()),'dois registros com o mesmo odômetro no banco não derrubam');

  // 9. o que ficou sem enviar é informado, e a falha definitiva é diferente da passageira
  st=mem();store.saveFuel(st,'aaaa',[R('n1',900),R('n2',950)]);
  out=await sync.syncFuel(server('aaaa',[],[],{uploadError:fail()}).api,st);
  assert.deepEqual(out.pendingIds,['n1','n2']);assert.equal(out.uploadFailure,'transient');
  out=await sync.syncFuel(server('aaaa',[],[],{uploadError:fail(400)}).api,st);
  assert.deepEqual(out.pendingIds,['n1','n2']);assert.equal(out.uploadFailure,'rejected','400 não adianta tentar de novo sem mudar nada');
  assert.equal((await sync.syncFuel(server('aaaa',[],[],{uploadError:fail(503)}).api,st)).uploadFailure,'transient','503 é passageiro');
  assert.equal((await sync.syncFuel(server('aaaa',[],[],{uploadError:fail(429)}).api,st)).uploadFailure,'transient');
  out=await sync.syncFuel(server('aaaa').api,st);assert.deepEqual(out.pendingIds,[]);assert.equal(out.uploadFailure,null);

  // 10. envio em partes de até 200, e só o que não foi aceito fica pendente
  st=mem();const many=Array.from({length:450},(_,i)=>R('m'+String(i).padStart(3,'0'),1000+i));store.saveFuel(st,'aaaa',many);
  sv=server('aaaa');out=await sync.syncFuel(sv.api,st);
  assert.deepEqual(sv.calls.uploads.map(x=>x.length),[200,200,50]);assert.equal(out.records.length,450);assert.deepEqual(out.pendingIds,[]);
  st=mem();store.saveFuel(st,'aaaa',many);
  let n=0;const half={api:{list:async()=>({ownerKey:'aaaa',records:[],deleted:[]}),upload:async()=>{n+=1;if(n===2)throw fail();}}};
  out=await sync.syncFuel(half.api,st);
  assert.equal(out.pendingIds.length,250,'a primeira parte entrou; as outras 250 ficam pendentes');assert.equal(out.pendingIds[0],'m200');assert.equal(out.uploadFailure,'transient');
  assert.equal(store.loadFuel(st,'aaaa').length,450,'nada sai da cópia local');
  console.log('PASS: sincronização das medições — conta nova, troca de conta, consulta que falha (500, rede, sessão) sem mostrar nem enviar nada de outra conta, resposta fora do formato, envio que falha sem perder o pendente, falha definitiva x passageira, envio em partes, segunda tentativa sem duplicar, apagados e armazenamento bloqueado.');
}finally{await rm(temp,{recursive:true,force:true});}
