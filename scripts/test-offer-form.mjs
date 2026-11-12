import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const temp=await mkdtemp(join(tmpdir(),'rota-offer-form-'));
async function load(file){
  const out=join(temp,file.replace(/\W+/g,'_')+'.mjs');
  const source=(await readFile(resolve(file),'utf8')).replace(/from\s*["']\.\/offer["']/g,`from ${JSON.stringify(pathToFileURL(join(temp,'lib_offer_ts.mjs')).href)}`);
  await writeFile(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  return pathToFileURL(out).href;
}
try{
  const offer=await import(await load('lib/offer.ts'));
  const f=await import(await load('lib/offer-form.ts'));
  const ok=(parser,text,expected)=>{const r=parser(text);assert.equal(r.error,null,`"${text}" não devia dar erro: ${r.error}`);assert.equal(r.value,expected,`"${text}"`);};
  const bad=(parser,text)=>{const r=parser(text);assert.equal(r.value,null,`"${text}" devia ser recusado`);assert.equal(typeof r.error,'string',`"${text}" precisa de mensagem`);assert.ok(r.error.length>8);};

  // vazio é desconhecido, não zero
  for(const p of [f.parseMoney,f.parsePricePerLiter,f.parseConsumption,f.parsePercent,f.parseKm,f.parseWeightKg,f.parseHours])for(const t of ['',' ','  ','R$',' R$ ']) ok(p,t,null);

  // dinheiro (centavos)
  ok(f.parseMoney,'10060',1006000);ok(f.parseMoney,'10.060',1006000);ok(f.parseMoney,'10.060,00',1006000);ok(f.parseMoney,'R$ 10.060,00',1006000);
  ok(f.parseMoney,'1234,5',123450);ok(f.parseMoney,'0,99',99);ok(f.parseMoney,'200.5',20050);ok(f.parseMoney,'10.06',1006);
  ok(f.parseMoney,'6,79',679);ok(f.parseMoney,'1.234.567,89',123456789);ok(f.parseMoney,'0',0);
  for(const t of ['-5','12,345','abc','1,234.56','1..2','1.2.3','1e3','1,2,3','10.060,0,0','١٢٣','99999999999999999999'])bad(f.parseMoney,t);

  // preço do litro (milésimos): ponto é sempre decimal, nunca milhar
  ok(f.parsePricePerLiter,'6,79',6790);ok(f.parsePricePerLiter,'6.79',6790);ok(f.parsePricePerLiter,'6,799',6799);ok(f.parsePricePerLiter,'6.790',6790);ok(f.parsePricePerLiter,'7',7000);
  bad(f.parsePricePerLiter,'6,7999');bad(f.parsePricePerLiter,'-6');

  // consumo (centésimos de km/L)
  ok(f.parseConsumption,'2,5',250);ok(f.parseConsumption,'3',300);ok(f.parseConsumption,'2.45',245);ok(f.parseConsumption,'0',0);bad(f.parseConsumption,'2,456');

  // percentual (pontos-base), até 100%
  ok(f.parsePercent,'13',1300);ok(f.parsePercent,'13,5',1350);ok(f.parsePercent,'100',10000);ok(f.parsePercent,'0',0);ok(f.parsePercent,'13%',1300);
  bad(f.parsePercent,'100,01');bad(f.parsePercent,'-1');bad(f.parsePercent,'13,555');

  // quilômetros e peso: inteiros, ponto é milhar
  ok(f.parseKm,'1.250',1250);ok(f.parseKm,'1250',1250);ok(f.parseKm,'720',720);bad(f.parseKm,'1,5');bad(f.parseKm,'12.5');
  ok(f.parseWeightKg,'50.300',50300);ok(f.parseWeightKg,'50300',50300);bad(f.parseWeightKg,'50,3');
  ok(f.parseHours,'36',36);bad(f.parseHours,'0');bad(f.parseHours,'1,5');

  // formulário vazio não calcula nada em silêncio
  const blank=f.emptyOfferForm();
  const empty=f.buildOfferInput(blank);
  assert.deepEqual(empty.errors,{});assert.ok(empty.input);assert.equal(empty.marginMissing,true);
  const emptyResult=offer.analyzeOffer(empty.input);
  assert.equal(emptyResult.decision,'sem_frete');assert.equal(emptyResult.complete,false);

  // caso do documento, digitado como o motorista digita
  const form={...blank,freightMode:'perTon',rate:'200',weightKg:'50.300',kmEmptyTo:'120',kmLoaded:'600',kplEmpty:'3',kplLoaded:'2',diesel:'6,79',toll:'450',vehicleKm:'1,50',commission:'13',margin:'20'};
  const built=f.buildOfferInput(form);
  assert.deepEqual(built.errors,{});assert.equal(built.marginMissing,false);
  assert.deepEqual(built.input.legs,[{kind:'empty',km:120,kmPerLiterCenti:300},{kind:'loaded',km:600,kmPerLiterCenti:200},{kind:'empty',km:0,kmPerLiterCenti:300}]);
  assert.deepEqual(built.input.freight,{kind:'perTon',rateCentsPerTon:20000,weightKg:50300});
  assert.equal(built.input.dieselPriceMilli,6790);assert.equal(built.input.tollCents,45000);assert.equal(built.input.vehicleCostCentsPerKm,150);
  assert.equal(built.input.commissionBp,1300);assert.equal(built.input.targetMarginBp,2000);assert.equal(built.input.commissionBase,'gross');
  const res=offer.analyzeOffer(built.input);
  assert.equal(res.grossFreightCents,1006000);assert.equal(res.fuelCostCents,230860);assert.equal(res.resultCents,491360);assert.equal(res.marginBp,4884);assert.equal(res.decision,'compensa');assert.equal(res.complete,true);

  // valor fechado
  const fixed=f.buildOfferInput({...form,freightMode:'fixed',freight:'10.060,00'});
  assert.deepEqual(fixed.input.freight,{kind:'fixed',cents:1006000});
  // trecho de volta entra com o consumo do vazio
  assert.equal(f.buildOfferInput({...form,kmEmptyBack:'90'}).input.legs[2].km,90);

  // pedágio: em branco = não conferido, "sem pedágio" = zero conhecido
  assert.equal(f.buildOfferInput({...form,toll:''}).input.tollCents,null);
  assert.equal(f.buildOfferInput({...form,toll:'',noToll:true}).input.tollCents,0);
  assert.equal(f.buildOfferInput({...form,toll:'999',noToll:true}).input.tollCents,0,'"sem pedágio" vale mais que o valor digitado');
  assert.equal(f.buildOfferInput({...form,vehicleKm:''}).input.vehicleCostCentsPerKm,null);
  assert.equal(f.buildOfferInput({...form,kplLoaded:''}).input.legs[1].kmPerLiterCenti,null);
  assert.equal(f.buildOfferInput({...form,diesel:''}).input.dieselPriceMilli,null);

  // opções avançadas
  const adv=f.buildOfferInput({...form,commissionBase:'net',discounts:'300',otherPct:'2,5',hours:'36'});
  assert.equal(adv.input.commissionBase,'net');assert.equal(adv.input.deductionsCents,30000);assert.equal(adv.input.otherPercentBp,250);assert.equal(adv.input.durationHours,36);

  // erro em qualquer campo: nada é calculado e cada campo aponta o seu erro
  const wrong=f.buildOfferInput({...form,toll:'abc',diesel:'6,7999',commission:'150'});
  assert.equal(wrong.input,null);assert.deepEqual(Object.keys(wrong.errors).sort(),['commission','diesel','toll']);
  assert.ok(Object.values(wrong.errors).every(m=>typeof m==='string'&&m.length>8));
  // peso por tonelada com ponto decimal digitado como toneladas é recusado, nunca lido como 50 mil toneladas
  assert.deepEqual(Object.keys(f.buildOfferInput({...form,weightKg:'50,3'}).errors),['weightKg']);

  // formatação em português
  const nb=s=>s.replace(/ /g,' ');
  assert.equal(nb(f.formatBRL(1006000)),'R$ 10.060,00');assert.equal(nb(f.formatBRL(-57600)),'-R$ 576,00');assert.equal(nb(f.formatBRL(5)),'R$ 0,05');
  assert.equal(f.formatBp(4884),'48,84%');assert.equal(f.formatBp(-1000),'-10,00%');assert.equal(f.formatBp(null),'—');
  assert.equal(nb(f.formatLiters(340000)),'340 L');assert.equal(nb(f.formatLiters(340500)),'340,5 L');assert.equal(f.formatLiters(null),'—');

  console.log('PASS: leitura de números em português (dinheiro, litro, consumo, percentual, km, kg, horas), vazio como desconhecido, recusa de formatos ambíguos, montagem da entrada do motor, "sem pedágio" x não conferido, erros por campo e formatação.');
}finally{await rm(temp,{recursive:true,force:true});}
