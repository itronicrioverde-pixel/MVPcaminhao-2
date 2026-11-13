import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const temp=await mkdtemp(join(tmpdir(),'rota-fuel-'));
try{
  const out=join(temp,'fuel.mjs');
  await writeFile(out,ts.transpileModule(await readFile(resolve('lib/fuel.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  const f=await import(pathToFileURL(out).href);

  // 1. referência da ANTT por número de eixos (mediana da pesquisa ESALQ-LOG de 2019), em centésimos de km/L
  assert.equal(f.ANTT_REFERENCE_YEAR,2019);
  for(const [axles,centi] of [[2,450],[3,350],[4,280],[5,240],[6,210],[7,190],[9,170]])assert.equal(f.anttKmPerLiterCenti(axles),centi,`${axles} eixos`);
  for(const bad of [8,1,0,10,9.5,Number.NaN,-3])assert.equal(f.anttKmPerLiterCenti(bad),null,`${bad} eixos não tem referência`);
  assert.deepEqual(f.ANTT_AXLE_CLASSES,[2,3,4,5,6,7,9]);

  // 2. média de uma viagem com trecho vazio e trecho carregado, cada um com o seu rendimento
  assert.equal(f.blendedKmPerLiterCenti(600,190,120,250),198,'720 km em 363,8 L');
  assert.equal(f.blendedKmPerLiterCenti(600,190,0,null),190,'sem km vazio não precisa do rendimento do vazio');
  assert.equal(f.blendedKmPerLiterCenti(0,null,120,250),250);
  assert.equal(f.blendedKmPerLiterCenti(600,null,120,250),null,'faltou o rendimento do carregado');
  assert.equal(f.blendedKmPerLiterCenti(600,190,120,null),null,'faltou o rendimento do vazio');
  assert.equal(f.blendedKmPerLiterCenti(0,null,0,null),null,'sem distância');
  assert.equal(f.blendedKmPerLiterCenti(600,0,0,null),null,'rendimento zero não vale');
  assert.throws(()=>f.blendedKmPerLiterCenti(-1,190,0,null),RangeError);

  // 3. medir pelo odômetro: de tanque cheio a tanque cheio, somando os parciais do meio
  const R=(odometerKm,liters,full,state)=>({odometerKm,litersMilli:liters*1000,full,state});
  const records=[
    R(100000,400,true,'loaded'),   // tanque cheio inicial: só marca o ponto de partida, os litros dele não contam
    R(100600,300,true,'loaded'),   // ciclo 1: 600 km carregado, 300 L
    R(101000,160,false,'empty'),   // parcial
    R(101200,80,true,'empty'),     // ciclo 2: 600 km vazio, 160 + 80 = 240 L
    R(101800,330,true,'loaded'),   // ciclo 3: 600 km carregado, 330 L
    R(102100,100,false,'loaded'),  // parcial carregado
    R(102400,120,true,'empty'),    // ciclo 4: 300 km carregado + 300 km vazio, 220 L (misto)
  ];
  const rep=f.measureConsumption(records);
  assert.deepEqual(rep.loaded,{km:1200,litersMilli:630000,kmPerLiterCenti:190,cycles:2},'carregado: 1.200 km / 630 L');
  assert.deepEqual(rep.empty,{km:600,litersMilli:240000,kmPerLiterCenti:250,cycles:1},'vazio: 600 km / 240 L');
  assert.deepEqual(rep.mixed,{km:600,litersMilli:220000,kmPerLiterCenti:273,cycles:1},'misto fica à parte, não suja o carregado nem o vazio');
  assert.deepEqual(rep.overall,{km:2400,litersMilli:1090000,kmPerLiterCenti:220,cycles:4},'geral: soma tudo');

  // a ordem de entrada não importa
  assert.deepEqual(f.measureConsumption([...records].reverse()),rep);
  assert.deepEqual(f.measureConsumption([records[3],records[0],records[6],records[1],records[5],records[2],records[4]]),rep);
  // os litros do primeiro tanque cheio não entram na conta
  assert.deepEqual(f.measureConsumption([R(100000,1,true,'loaded'),...records.slice(1)]),rep);
  // abastecimento parcial depois do último cheio e parcial antes do primeiro cheio ficam de fora
  assert.deepEqual(f.measureConsumption([R(99000,50,false,'loaded'),...records,R(102600,50,false,'loaded')]),rep);
  // sem dois tanques cheios não há ciclo: nada inventado
  for(const few of [[],[R(100000,400,true,'loaded')],[R(100000,400,true,'loaded'),R(100300,100,false,'loaded')],[R(100000,100,false,'loaded'),R(100300,100,false,'loaded')]]){
    const none=f.measureConsumption(few);
    assert.deepEqual([none.loaded,none.empty,none.mixed,none.overall],[null,null,null,null]);
  }
  // só carregado medido: o vazio continua desconhecido
  const onlyLoaded=f.measureConsumption(records.slice(0,2));
  assert.equal(onlyLoaded.loaded.kmPerLiterCenti,200);assert.equal(onlyLoaded.empty,null);

  // 4. números errados são recusados, com mensagem em português
  const errs=f.validateFuelRecords;
  assert.deepEqual(errs(records),[]);
  assert.ok(errs([R(100000,400,true,'loaded'),R(100000,300,true,'loaded')]).some(m=>m.includes('odômetro')),'mesmo odômetro duas vezes');
  assert.ok(errs([R(100000,0,true,'loaded')]).some(m=>m.includes('litros')),'litros zero');
  assert.ok(errs([R(-5,10,true,'loaded')]).some(m=>m.includes('odômetro')),'odômetro negativo');
  assert.ok(errs([{odometerKm:100.5,litersMilli:1000,full:true,state:'loaded'}]).length>0,'odômetro com vírgula');
  assert.ok(errs([{odometerKm:100,litersMilli:1000,full:true,state:'x'}]).some(m=>m.includes('trecho')),'estado inválido');
  assert.ok(errs(records).every(m=>typeof m==='string'));
  assert.throws(()=>f.measureConsumption([R(100000,400,true,'loaded'),R(100000,300,true,'loaded')]),RangeError);
  assert.throws(()=>f.measureConsumption([R(100000,0,true,'loaded')]),RangeError);

  // 5. rendimento fora do normal é avisado (provável erro de digitação)
  assert.equal(f.isPlausibleKmPerLiter(210),true);assert.equal(f.isPlausibleKmPerLiter(50),true);assert.equal(f.isPlausibleKmPerLiter(1500),true);
  assert.equal(f.isPlausibleKmPerLiter(49),false);assert.equal(f.isPlausibleKmPerLiter(1501),false);
  const typo=f.measureConsumption([R(100000,400,true,'loaded'),R(100600,1,true,'loaded')]);
  assert.equal(f.isPlausibleKmPerLiter(typo.loaded.kmPerLiterCenti),false,'600 km com 1 L não é verdade');

  // 6. texto em português para preencher o campo
  assert.equal(f.formatKmPerLiter(190),'1,90');assert.equal(f.formatKmPerLiter(170),'1,70');assert.equal(f.formatKmPerLiter(1000),'10,00');

  // 7. sincronizar o que está no aparelho com o que está no banco
  const S=(id,km,l=10,full=true,state='loaded')=>({id,odometerKm:km,litersMilli:l*1000,full,state});
  const plan=f.planFuelSync;
  let p=plan([S('a',100),S('b',200)],[]);
  assert.deepEqual(p.merged.map(x=>x.id),['a','b']);assert.deepEqual(p.toUpload.map(x=>x.id),['a','b'],'banco vazio: sobe tudo do aparelho');assert.deepEqual(p.conflicts,[]);
  p=plan([],[S('a',100),S('b',200)]);
  assert.deepEqual(p.merged.map(x=>x.id),['a','b']);assert.deepEqual(p.toUpload,[],'aparelho vazio: só baixa');
  p=plan([S('a',100),S('c',300)],[S('a',100),S('b',200)]);
  assert.deepEqual(p.merged.map(x=>x.id),['a','b','c'],'junta e ordena por odômetro');assert.deepEqual(p.toUpload.map(x=>x.id),['c'],'sobe só o que o banco não tem');
  p=plan([S('x',100,99)],[S('a',100,10)]);
  assert.deepEqual(p.merged.map(x=>x.id),['a'],'mesmo odômetro com id diferente: vale o do banco');assert.deepEqual(p.toUpload,[]);assert.deepEqual(p.conflicts.map(x=>x.id),['x'],'o do aparelho que ficou de fora é avisado');
  p=plan([S('a',100,5)],[S('a',100,10)]);
  assert.equal(p.merged[0].litersMilli,10000,'mesmo id: o banco manda');assert.deepEqual(p.toUpload,[]);assert.deepEqual(p.conflicts,[]);
  p=plan([S('b',200),S('a',100),S('b',200)],[]);
  assert.deepEqual(p.merged.map(x=>x.id),['a','b'],'repetido no aparelho aparece uma vez');assert.deepEqual(p.toUpload.map(x=>x.id),['a','b']);
  const input=[S('c',300),S('a',100)],copy=JSON.parse(JSON.stringify(input));plan(input,[S('b',200)]);assert.deepEqual(input,copy,'não altera o que recebe');

  console.log('PASS: referência da ANTT por eixos, média de viagem com vazio e carregado, medição por odômetro (ciclos de tanque cheio a tanque cheio, parciais, misto à parte, ordem livre, nada inventado sem dois cheios), validação, rendimento implausível, formatação e plano de sincronização com o banco.');
}finally{await rm(temp,{recursive:true,force:true});}
