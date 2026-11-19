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

  // dado quebrado ou inválido é ignorado, sem erro
  const b=mem();
  for(const bad of ['{nao e json','"texto"','{"a":1}','[1,2]','[{"id":5}]',JSON.stringify([{...R('1',100),litersMilli:0}])]){b.setItem(st.fuelKey('aaaa'),bad);assert.deepEqual(st.loadFuel(b,'aaaa'),[],`ignora: ${bad.slice(0,20)}`);}

  // um registro ruim não leva os outros: só ele é descartado
  const mix=mem();
  mix.setItem(st.fuelKey('aaaa'),JSON.stringify([R('1',100),{id:'2',odometerKm:-5,litersMilli:1,full:true,state:'loaded'},R('3',300),R('4',300),{id:7},R('5',500)]));
  assert.deepEqual(st.loadFuel(mix,'aaaa').map(x=>x.id),['1','3','5'],'mantém os válidos; descarta o inválido e o odômetro repetido (fica o primeiro)');

  // armazenamento bloqueado: não lança erro
  const broken={getItem(){throw new Error('x');},setItem(){throw new Error('x');},removeItem(){throw new Error('x');}};
  assert.deepEqual(st.loadFuel(broken,'aaaa'),[]);st.saveFuel(broken,'aaaa',[R('1',1)]);
  assert.deepEqual(st.loadFuel(null,'aaaa'),[],'sem armazenamento');st.saveFuel(null,'aaaa',[]);

  // o dono é só letras e números: nada de chave estranha
  assert.throws(()=>st.fuelKey('a/b'),RangeError);assert.throws(()=>st.fuelKey(''),RangeError);assert.equal('lastOwner' in st,false,'não há mais conta adivinhada');assert.equal('claimPending' in st,false,'não há mais conta pendente');
  console.log('PASS: cópia das medições no aparelho separada por conta, dado inválido ignorado, armazenamento bloqueado sem erro.');
}finally{await rm(temp,{recursive:true,force:true});}
