import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Cópia das medições no aparelho, separada por conta: uma conta nunca enxerga nem envia o que é de outra.
const temp=await mkdtemp(join(tmpdir(),'rota-fuel-store-'));
try{
  const load=async file=>{const out=join(temp,file.replace(/\W+/g,'_')+'.mjs');let src=await readFile(resolve(file),'utf8');src=src.replace(/from\s*["']\.\/fuel["']/g,`from ${JSON.stringify(pathToFileURL(join(temp,'lib_fuel_ts.mjs')).href)}`);await writeFile(out,ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return out;};
  await load('lib/fuel.ts');
  const st=await import(pathToFileURL(await load('lib/fuel-store.ts')));
  const mem=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>void m.set(k,String(v)),removeItem:k=>void m.delete(k),_m:m};};
  const R=(id,km)=>({id,odometerKm:km,litersMilli:100000,full:true,state:'loaded'});

  // cada conta tem a sua cópia
  const s=mem();
  st.saveFuel(s,'aaaa',[R('1',100),R('2',200)]);st.saveFuel(s,'bbbb',[R('3',300)]);
  assert.deepEqual(st.loadFuel(s,'aaaa').map(x=>x.id),['1','2']);assert.deepEqual(st.loadFuel(s,'bbbb').map(x=>x.id),['3']);
  assert.deepEqual(st.loadFuel(s,'cccc'),[],'conta sem cópia começa vazia');
  assert.notEqual(st.fuelKey('aaaa'),st.fuelKey('bbbb'));assert.ok(st.fuelKey('aaaa').includes('aaaa'));

  // última conta que sincronizou neste aparelho
  assert.equal(st.lastOwner(s),null);st.setLastOwner(s,'aaaa');assert.equal(st.lastOwner(s),'aaaa');

  // o que foi lançado sem conta conhecida (sem internet na primeira vez) fica à parte e a primeira conta que sincronizar o assume
  const p=mem();st.saveFuel(p,st.PENDING_OWNER,[R('9',900)]);st.saveFuel(p,'aaaa',[R('1',100)]);
  assert.deepEqual(st.claimPending(p,'aaaa').map(x=>x.id),['9'],'devolve o que estava pendente');
  assert.deepEqual(st.loadFuel(p,st.PENDING_OWNER),[],'e esvazia o pendente');
  assert.deepEqual(st.claimPending(p,'aaaa'),[],'nada para assumir da segunda vez');
  assert.deepEqual(st.loadFuel(p,'aaaa').map(x=>x.id),['1'],'o claim só devolve; quem junta é o chamador');

  // dado quebrado ou inválido é ignorado, sem erro
  const b=mem();
  for(const bad of ['{nao e json','"texto"','{"a":1}','[1,2]','[{"id":5}]',JSON.stringify([{...R('1',100),litersMilli:0}]),JSON.stringify([R('1',100),R('2',100)])]){b.setItem(st.fuelKey('aaaa'),bad);assert.deepEqual(st.loadFuel(b,'aaaa'),[],`ignora: ${bad.slice(0,20)}`);}

  // armazenamento bloqueado: não lança erro
  const broken={getItem(){throw new Error('x');},setItem(){throw new Error('x');},removeItem(){throw new Error('x');}};
  assert.deepEqual(st.loadFuel(broken,'aaaa'),[]);st.saveFuel(broken,'aaaa',[R('1',1)]);assert.equal(st.lastOwner(broken),null);st.setLastOwner(broken,'a');assert.deepEqual(st.claimPending(broken,'a'),[]);
  assert.deepEqual(st.loadFuel(null,'aaaa'),[],'sem armazenamento');st.saveFuel(null,'aaaa',[]);assert.equal(st.lastOwner(null),null);

  // o dono é só letras e números: nada de chave estranha
  assert.throws(()=>st.fuelKey('a/b'),RangeError);assert.throws(()=>st.fuelKey(''),RangeError);assert.doesNotThrow(()=>st.fuelKey(st.PENDING_OWNER));
  console.log('PASS: cópia das medições no aparelho separada por conta, conta pendente assumida uma vez, dado inválido ignorado, armazenamento bloqueado sem erro.');
}finally{await rm(temp,{recursive:true,force:true});}
