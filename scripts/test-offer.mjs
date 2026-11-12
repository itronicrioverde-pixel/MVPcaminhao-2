import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Casos numéricos do documento "Base de pesquisa e cálculos", em centavos inteiros.
const temp=await mkdtemp(join(tmpdir(),'rota-offer-'));
try{
  const source=await readFile(resolve('lib/offer.ts'),'utf8');
  const out=join(temp,'offer.mjs');
  await writeFile(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  const o=await import(pathToFileURL(out));

  const base=(over={})=>({
    freight:{kind:'fixed',cents:1006000},
    legs:[{kind:'empty',km:120,kmPerLiterCenti:300},{kind:'loaded',km:600,kmPerLiterCenti:200}],
    dieselPriceMilli:6790,tollCents:45000,extraCostsCents:0,vehicleCostCentsPerKm:150,
    deductionsCents:0,commissionBp:1300,commissionBase:'gross',otherPercentBp:0,targetMarginBp:2000,durationHours:null,
    tollPayer:'me',arla:null,fixedCostPerDayCents:0,floor:null,advanceBp:0,balanceDays:null,moneyCostMonthlyBp:0,
    ...over});
  const codes=r=>r.pending.map(p=>p.code).sort();

  // 1. combustível por trecho (vazio e carregado têm rendimentos diferentes)
  const fuel=o.analyzeOffer(base());
  assert.deepEqual(fuel.legs.map(l=>l.litersMilli),[40000,300000],'120 km a 3,00 km/L = 40 L; 600 km a 2,00 km/L = 300 L');
  assert.deepEqual(fuel.legs.map(l=>l.costCents),[27160,203700],'R$ 271,60 e R$ 2.037,00');
  assert.equal(fuel.fuelCostCents,230860,'340 L a R$ 6,79 = R$ 2.308,60');
  assert.equal(fuel.fuelLitersMilli,340000);
  assert.equal(fuel.totalKm,720);

  // 2. média de consumo: soma dos km sobre soma dos litros, nunca média simples
  assert.equal(o.averageKmPerLiterCenti([{km:100,litersMilli:50000},{km:900,litersMilli:300000}]),286,'1.000 km / 350 L = 2,86 km/L');
  assert.equal(o.averageKmPerLiterCenti([]),null);
  assert.equal(o.averageKmPerLiterCenti([{km:100,litersMilli:0}]),null,'sem litros não há média');

  // 3. frete por tonelada
  assert.equal(o.freightCents({kind:'perTon',rateCentsPerTon:20000,weightKg:50300}),1006000,'R$ 200,00 x 50.300 kg / 1.000 = R$ 10.060,00');
  assert.equal(o.freightCents({kind:'fixed',cents:1000000}),1000000);

  // 4. comissão: base bruta ou líquida de descontos
  const gross=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0}));
  assert.equal(gross.commissionCents,130780,'13% de R$ 10.060,00 = R$ 1.307,80');
  const net=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,deductionsCents:30000,commissionBase:'net'}));
  assert.equal(net.commissionCents,126880,'13% de (10.060 - 300) = R$ 1.268,80');

  // 5. caso completo: custos somam uma vez cada rubrica
  // 230.860 diesel + 45.000 pedágio + 108.000 (720 km x R$ 1,50) + 130.780 comissão = 514.640
  const full=o.analyzeOffer(base());
  assert.equal(full.complete,true);assert.deepEqual(full.pending,[]);
  assert.equal(full.knownCostsCents,230860+45000+108000);
  assert.equal(full.resultCents,1006000-514640);
  assert.equal(full.marginBp,4884);
  assert.equal(full.resultPerKmCents,682);
  assert.equal(full.revenuePerKmCents,1397);
  assert.equal(full.decision,'compensa');

  // 5b. as linhas do cálculo ficam disponíveis para a tela mostrar
  assert.equal(full.vehicleCostCents,108000,'720 km x R$ 1,50');
  assert.equal(o.analyzeOffer(base({vehicleCostCentsPerKm:null})).vehicleCostCents,null);
  assert.equal(full.otherPercentCents,0);
  const oth=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,commissionBp:0,otherPercentBp:250,freight:{kind:'fixed',cents:1000000}}));
  assert.equal(oth.otherPercentCents,25000,'2,5% de R$ 10.000,00');
  assert.equal(oth.resultCents,1000000-25000);

  // 6. preço mínimo: margem sobre o preço, não acréscimo sobre o custo
  const price=(over={})=>({fixedCostsCents:800000,deductionsCents:0,commissionBp:0,commissionBase:'gross',otherPercentBp:0,...over});
  assert.equal(o.minimumPriceCents(price(),2000),1000000,'custo 8.000 e margem 20% = R$ 10.000,00');
  const markup=o.analyzeOffer({...base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,commissionBp:0,extraCostsCents:800000,freight:{kind:'fixed',cents:960000}})});
  assert.equal(markup.marginBp,1667,'acrescentar 20% ao custo dá só 16,67% de margem (R$ 9.600,00)');
  assert.equal(o.minimumPriceCents(price({commissionBp:1300}),0),919540,'empate com comissão de 13% = R$ 9.195,40');
  assert.equal(o.minimumPriceCents(price({commissionBp:1300}),2000),1194030,'meta de 20% com comissão de 13% = R$ 11.940,30');
  const atTarget=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,extraCostsCents:800000,freight:{kind:'fixed',cents:1194030}}));
  assert.equal(atTarget.commissionCents,155224);
  assert.equal(atTarget.resultCents,238806,'resultado R$ 2.388,06');
  assert.equal(atTarget.marginBp,2000);
  assert.equal(atTarget.decision,'compensa');
  const justBelow=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,extraCostsCents:800000,freight:{kind:'fixed',cents:1194029}}));
  assert.equal(justBelow.decision,'abaixo_da_meta','um centavo abaixo do preço mínimo já não cumpre a meta');
  // a sugestão devolvida sempre cumpre a meta depois de arredondada
  for(const [c,cm,m,d,b,oth] of [[800000,1300,2000,0,'gross',0],[1234567,1300,1500,30000,'net',250],[999999,900,333,12345,'gross',100],[50001,0,2500,0,'gross',0]]){
    const p=price({fixedCostsCents:c,commissionBp:cm,deductionsCents:d,commissionBase:b,otherPercentBp:oth});
    const v=o.minimumPriceCents(p,m);
    const res=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,extraCostsCents:c,freight:{kind:'fixed',cents:v},commissionBp:cm,commissionBase:b,deductionsCents:d,otherPercentBp:oth,targetMarginBp:m}));
    assert.ok(res.resultCents*10000>=m*v,`meta cumprida em ${v}`);
    const lower=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,extraCostsCents:c,freight:{kind:'fixed',cents:v-1},commissionBp:cm,commissionBase:b,deductionsCents:d,otherPercentBp:oth,targetMarginBp:m}));
    assert.ok(lower.resultCents*10000<m*(v-1),`${v} é o menor preço que cumpre a meta`);
  }
  assert.equal(o.minimumPriceCents(price({commissionBp:8000,otherPercentBp:1000}),2000),null,'percentuais somam 100% ou mais: não existe preço');
  const impossible=o.analyzeOffer(base({commissionBp:8000,otherPercentBp:1000}));
  assert.equal(impossible.targetPriceCents,null);assert.ok(codes(impossible).includes('CONFIG_INCOMPATIVEL'));
  assert.ok(full.breakEvenCents>0&&full.breakEvenCents<full.targetPriceCents,'empate fica abaixo do preço da meta');

  // 7. prejuízo: receita 5.760 e custo 6.336 = -10,00%
  const loss=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,commissionBp:0,extraCostsCents:633600,freight:{kind:'fixed',cents:576000}}));
  assert.equal(loss.resultCents,-57600);assert.equal(loss.marginBp,-1000);assert.equal(loss.decision,'prejuizo');
  // frete zero: a margem fica indefinida, mas o valor negativo continua visível
  const zero=o.analyzeOffer(base({freight:{kind:'fixed',cents:0}}));
  assert.equal(zero.marginBp,null);assert.ok(zero.resultCents<0);assert.equal(zero.decision,'prejuizo');
  const nothing=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,commissionBp:0,freight:{kind:'fixed',cents:0}}));
  assert.equal(nothing.decision,'sem_frete');assert.equal(nothing.marginBp,null);

  // 8. limites da decisão
  const mid=o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,commissionBp:0,extraCostsCents:800000,freight:{kind:'fixed',cents:1000000},targetMarginBp:2000}));
  assert.equal(mid.decision,'compensa','margem exatamente igual à meta conta como meta cumprida');
  assert.equal(o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,commissionBp:0,extraCostsCents:800000,freight:{kind:'fixed',cents:1000000},targetMarginBp:2001})).decision,'abaixo_da_meta');
  assert.equal(o.analyzeOffer(base({legs:[],tollCents:0,vehicleCostCentsPerKm:0,commissionBp:0,extraCostsCents:1000000,freight:{kind:'fixed',cents:1000000},targetMarginBp:0})).decision,'compensa','resultado zero com meta zero: empata');

  // 9. dado que falta nunca vira zero em silêncio
  const noKpl=o.analyzeOffer(base({legs:[{kind:'empty',km:120,kmPerLiterCenti:300},{kind:'loaded',km:600,kmPerLiterCenti:null}]}));
  assert.equal(noKpl.legs[1].costCents,null);assert.equal(noKpl.legs[1].litersMilli,null);
  assert.equal(noKpl.fuelCostCents,null,'combustível total fica desconhecido');
  assert.equal(noKpl.complete,false);assert.deepEqual(codes(noKpl),['CONSUMO_AUSENTE']);
  assert.equal(noKpl.knownCostsCents,27160+45000+108000,'o resultado provisório soma só o que se conhece');
  assert.equal(o.analyzeOffer(base({legs:[{kind:'loaded',km:600,kmPerLiterCenti:0}]})).legs[0].costCents,null,'consumo zero não gera diesel zero');
  assert.deepEqual(codes(o.analyzeOffer(base({dieselPriceMilli:null}))),['DIESEL_AUSENTE']);
  assert.deepEqual(codes(o.analyzeOffer(base({dieselPriceMilli:0}))),['DIESEL_AUSENTE']);
  assert.deepEqual(codes(o.analyzeOffer(base({tollCents:null}))),['PEDAGIO_NAO_CONFERIDO'],'pedágio não conferido');
  assert.deepEqual(codes(o.analyzeOffer(base({tollCents:0}))),[],'pedágio zero conhecido é diferente de não conferido');
  assert.deepEqual(codes(o.analyzeOffer(base({vehicleCostCentsPerKm:null}))),['CUSTO_KM_VEICULO_NAO_INFORMADO']);
  assert.deepEqual(codes(o.analyzeOffer(base({legs:[]}))),['DISTANCIA_AUSENTE']);
  assert.deepEqual(codes(o.analyzeOffer(base({legs:[{kind:'loaded',km:0,kmPerLiterCenti:null}]}))),['DISTANCIA_AUSENTE'],'distância total zero');
  assert.deepEqual(codes(o.analyzeOffer(base({legs:[{kind:'empty',km:100,kmPerLiterCenti:null},{kind:'loaded',km:100,kmPerLiterCenti:null}],dieselPriceMilli:null}))),['CONSUMO_AUSENTE','DIESEL_AUSENTE'],'cada pendência aparece uma só vez');
  assert.equal(noKpl.pending.every(p=>typeof p.message==='string'&&p.message.length>10),true);

  // 10. por dia e por km
  const timed=o.analyzeOffer(base({durationHours:36}));
  assert.equal(timed.resultPerDayCents,Math.round(timed.resultCents*24/36));
  assert.equal(full.resultPerDayCents,null,'sem duração informada não há resultado por dia');

  // 11. entradas inválidas são recusadas, não viram número
  for(const bad of [base({tollCents:-1}),base({tollCents:1.5}),base({tollCents:Number.NaN}),base({commissionBp:-1}),base({legs:[{kind:'empty',km:-5,kmPerLiterCenti:300}]}),base({freight:{kind:'fixed',cents:Infinity}}),base({extraCostsCents:2.5}),base({durationHours:0})])
    assert.throws(()=>o.analyzeOffer(bad),RangeError);

  // 11b. número gigante digitado por engano: erro claro, nunca resultado errado em silêncio
  for(const huge of [
    base({freight:{kind:'perTon',rateCentsPerTon:1e11,weightKg:1e11}}),
    base({legs:[{kind:'loaded',km:1e13,kmPerLiterCenti:200}],dieselPriceMilli:6790}),
    base({vehicleCostCentsPerKm:1e13,legs:[{kind:'loaded',km:1e13,kmPerLiterCenti:200}]}),
    base({freight:{kind:'fixed',cents:1e13}}),
    base({deductionsCents:1e13,commissionBase:'net',freight:{kind:'fixed',cents:2e13}}),
  ])assert.throws(()=>o.analyzeOffer(huge),RangeError);
  assert.throws(()=>o.averageKmPerLiterCenti([{km:1e13,litersMilli:1}]),RangeError);

  // 13. pedágio: quem paga. Vale-pedágio do contratante não é custo seu, e também não vira lucro a mais
  const vpo=o.analyzeOffer(base({tollPayer:'contractor'}));
  assert.equal(vpo.tollCostCents,0);assert.equal(vpo.resultCents,491360+45000,'sem o pedágio no custo, sobra R$ 450,00 a mais');
  assert.equal(vpo.knownCostsCents,230860+108000);assert.equal(vpo.complete,true);
  assert.deepEqual(codes(o.analyzeOffer(base({tollPayer:'contractor',tollCents:null}))),[],'com vale-pedágio não precisa saber o valor para fechar a conta');
  assert.ok(vpo.notices.some(n=>n.code==='VALE_PEDAGIO_CONFERIR'),'avisa para conferir se o vale cobre a rota');
  assert.equal(full.tollCostCents,45000);assert.ok(!full.notices.some(n=>n.code==='VALE_PEDAGIO_CONFERIR'));

  // 14. ARLA 32: litros como parte do diesel, preço próprio
  const arla=o.analyzeOffer(base({arla:{percentOfDieselBp:500,priceMilli:3500}}));
  assert.equal(arla.arlaLitersMilli,17000,'5% de 340 L = 17 L');
  assert.equal(arla.arlaCostCents,5950,'17 L a R$ 3,50 = R$ 59,50');
  assert.equal(arla.resultCents,491360-5950);assert.equal(arla.knownCostsCents,230860+5950+45000+108000);assert.equal(arla.complete,true);
  assert.equal(full.arlaCostCents,null,'quem não usa ARLA não tem linha de ARLA');
  assert.deepEqual(codes(o.analyzeOffer(base({arla:{percentOfDieselBp:null,priceMilli:3500}}))),['ARLA_INCOMPLETO']);
  assert.deepEqual(codes(o.analyzeOffer(base({arla:{percentOfDieselBp:500,priceMilli:null}}))),['ARLA_INCOMPLETO']);
  assert.deepEqual(codes(o.analyzeOffer(base({arla:{percentOfDieselBp:500,priceMilli:0}}))),['ARLA_INCOMPLETO'],'preço zero não vale como informado');
  const arlaZero=o.analyzeOffer(base({arla:{percentOfDieselBp:0,priceMilli:null}}));
  assert.equal(arlaZero.arlaCostCents,0);assert.deepEqual(codes(arlaZero),[],'consumo de ARLA conhecido e zero fecha a conta');
  const arlaNoFuel=o.analyzeOffer(base({legs:[{kind:'loaded',km:600,kmPerLiterCenti:null}],arla:{percentOfDieselBp:500,priceMilli:3500}}));
  assert.equal(arlaNoFuel.arlaCostCents,null,'sem os litros de diesel não dá para saber o ARLA');assert.deepEqual(codes(arlaNoFuel),['CONSUMO_AUSENTE']);

  // 15. custo fixo por dia: parcela, seguro, IPVA, depreciação, rastreador, salário
  const fixed=o.analyzeOffer(base({fixedCostPerDayCents:50000,durationHours:36}));
  assert.equal(fixed.fixedCostCents,75000,'R$ 500,00 por dia x 36 h = R$ 750,00');
  assert.equal(fixed.resultCents,491360-75000);assert.equal(fixed.resultPerDayCents,277573);
  assert.equal(o.analyzeOffer(base({fixedCostPerDayCents:33333,durationHours:36})).fixedCostCents,50000,'49.999,5 arredonda para cima');
  assert.equal(full.fixedCostCents,0,'custo fixo zero informado é zero conhecido');
  assert.deepEqual(codes(o.analyzeOffer(base({fixedCostPerDayCents:null}))),['CUSTO_FIXO_DIA_NAO_INFORMADO']);
  assert.deepEqual(codes(o.analyzeOffer(base({fixedCostPerDayCents:50000,durationHours:null}))),['DURACAO_AUSENTE']);
  assert.equal(o.analyzeOffer(base({fixedCostPerDayCents:50000,durationHours:null})).fixedCostCents,null);
  assert.deepEqual(codes(o.analyzeOffer(base({fixedCostPerDayCents:0,durationHours:null}))),[],'sem custo fixo não precisa de duração');
  // mais dias parado com o mesmo frete: o resultado cai e o preço mínimo sobe
  const slow=o.analyzeOffer(base({fixedCostPerDayCents:50000,durationHours:96}));
  assert.ok(slow.resultCents<fixed.resultCents);assert.ok(slow.breakEvenCents>fixed.breakEvenCents);

  // 16. piso mínimo da ANTT com os coeficientes que o próprio usuário informa (distância carregada x CCD + CC)
  const floorInput={ccdE4:52177,ccCents:54186};
  const withFloor=o.analyzeOffer(base({legs:[{kind:'empty',km:120,kmPerLiterCenti:300},{kind:'loaded',km:500,kmPerLiterCenti:200}],floor:floorInput}));
  assert.equal(withFloor.floorCents,315071,'500 km x R$ 5,2177 + R$ 541,86 = R$ 3.150,71');
  assert.equal(withFloor.floorGapCents,1006000-315071);assert.ok(!withFloor.notices.some(n=>n.code==='ABAIXO_DO_PISO'));
  assert.equal(o.analyzeOffer(base({legs:[{kind:'loaded',km:1,kmPerLiterCenti:200}],floor:{ccdE4:52177,ccCents:0}})).floorCents,522,'R$ 5,2177 em 1 km = R$ 5,22 (arredonda para cima)');
  const below=o.analyzeOffer(base({legs:[{kind:'loaded',km:500,kmPerLiterCenti:200}],floor:floorInput,freight:{kind:'fixed',cents:300000}}));
  assert.equal(below.floorGapCents,300000-315071);assert.ok(below.notices.some(n=>n.code==='ABAIXO_DO_PISO'));
  assert.equal(full.floorCents,null);assert.equal(full.floorGapCents,null);
  assert.ok(full.notices.some(n=>n.code==='PISO_NAO_CALCULADO'),'piso não calculado é diferente de não se aplica');
  assert.ok(!withFloor.notices.some(n=>n.code==='PISO_NAO_CALCULADO'));
  assert.equal(withFloor.complete,true,'o piso é uma comparação a mais: não trava a análise completa');

  // 17. folga: até quanto o diesel pode subir sem estragar o frete
  const slack=o.analyzeOffer(base());
  let firstFailBreakEven=null,firstFailTarget=null;
  for(let p=6790;p<=60000&&(firstFailBreakEven===null||firstFailTarget===null);p+=1){
    const r=o.analyzeOffer(base({dieselPriceMilli:p}));
    if(firstFailBreakEven===null&&r.resultCents<0)firstFailBreakEven=p;
    if(firstFailTarget===null&&r.resultCents*10000<2000*r.grossFreightCents)firstFailTarget=p;
  }
  assert.equal(slack.dieselMaxForBreakEvenMilli,firstFailBreakEven-1,'maior diesel sem dar prejuízo, conferido preço a preço');
  assert.equal(slack.dieselMaxForTargetMilli,firstFailTarget-1,'maior diesel que ainda cumpre a meta, conferido preço a preço');
  assert.ok(slack.dieselMaxForTargetMilli<slack.dieselMaxForBreakEvenMilli);assert.ok(slack.dieselMaxForTargetMilli>6790);
  const edge=o.analyzeOffer(base({dieselPriceMilli:slack.dieselMaxForTargetMilli}));assert.equal(edge.decision,'compensa');
  assert.notEqual(o.analyzeOffer(base({dieselPriceMilli:slack.dieselMaxForTargetMilli+1})).decision,'compensa');
  const nearLoss=o.analyzeOffer(base({freight:{kind:'fixed',cents:500000}}));
  assert.equal(nearLoss.decision,'abaixo_da_meta');assert.equal(nearLoss.dieselMaxForTargetMilli,null,'já não cumpre a meta: não há folga a mostrar');assert.ok(nearLoss.dieselMaxForBreakEvenMilli>6790);
  const underwater=o.analyzeOffer(base({freight:{kind:'fixed',cents:400000}}));
  assert.equal(underwater.dieselMaxForBreakEvenMilli,null);assert.equal(underwater.dieselMaxForTargetMilli,null);
  assert.equal(o.analyzeOffer(base({dieselPriceMilli:null})).dieselMaxForBreakEvenMilli,null,'sem o preço do diesel não há folga');
  assert.equal(o.analyzeOffer(base({legs:[{kind:'loaded',km:600,kmPerLiterCenti:null}]})).dieselMaxForTargetMilli,null,'sem o consumo também não');
  assert.equal(o.analyzeOffer(base({freight:{kind:'fixed',cents:0}})).dieselMaxForTargetMilli,null);
  assert.equal(o.analyzeOffer(base({arla:{percentOfDieselBp:500,priceMilli:3500}})).dieselMaxForBreakEvenMilli!==null,true);

  // 18. dinheiro parado: adiantamento, saldo a receber e custo de esperar
  const cash=o.analyzeOffer(base({freight:{kind:'fixed',cents:400000},advanceBp:2000,balanceDays:30,moneyCostMonthlyBp:300}));
  assert.equal(cash.advanceCents,80000,'20% de R$ 4.000,00');
  assert.equal(cash.cashNeededCents,275860-80000,'diesel e pedágio saem antes: o adiantamento cobre só parte');
  assert.equal(cash.receivableCents,320000);
  assert.equal(cash.financingCostCents,9600,'3% ao mês sobre R$ 3.200,00 por 30 dias');
  assert.equal(cash.resultAfterFinancingCents,cash.resultCents-9600);
  assert.equal(o.analyzeOffer(base({freight:{kind:'fixed',cents:400000},advanceBp:2000,balanceDays:15,moneyCostMonthlyBp:300})).financingCostCents,4800,'metade do prazo, metade do custo');
  assert.equal(full.advanceCents,0);assert.equal(full.cashNeededCents,275860,'sem adiantamento você banca diesel e pedágio');
  assert.equal(full.financingCostCents,0);assert.equal(full.resultAfterFinancingCents,full.resultCents);
  assert.equal(o.analyzeOffer(base({advanceBp:8000})).cashNeededCents,0,'80% de adiantamento cobre as despesas da estrada');
  assert.deepEqual(codes(o.analyzeOffer(base({moneyCostMonthlyBp:300,balanceDays:null}))),['PRAZO_AUSENTE']);
  assert.deepEqual(codes(o.analyzeOffer(base({moneyCostMonthlyBp:0,balanceDays:null}))),[],'sem custo do dinheiro o prazo não faz diferença na conta');
  const slowPay=o.analyzeOffer(base({freight:{kind:'fixed',cents:600000},moneyCostMonthlyBp:300,balanceDays:60}));
  assert.equal(slowPay.decision,'compensa');assert.equal(slowPay.marginBp,2302);assert.equal(slowPay.financingCostCents,36000);assert.equal(slowPay.marginAfterFinancingBp,1702);
  assert.ok(slowPay.notices.some(n=>n.code==='COMPENSA_SO_SEM_PRAZO'),'compensa, mas o prazo de pagamento tira a margem da meta');
  assert.ok(!o.analyzeOffer(base({freight:{kind:'fixed',cents:600000},moneyCostMonthlyBp:300,balanceDays:10})).notices.some(n=>n.code==='COMPENSA_SO_SEM_PRAZO'));

  // 19. entradas novas inválidas
  for(const bad of [base({advanceBp:10001}),base({advanceBp:-1}),base({moneyCostMonthlyBp:10001}),base({balanceDays:-1}),base({balanceDays:1.5}),base({fixedCostPerDayCents:-1}),base({tollPayer:'outro'}),base({arla:{percentOfDieselBp:-1,priceMilli:3500}}),base({arla:{percentOfDieselBp:10001,priceMilli:3500}}),base({floor:{ccdE4:-1,ccCents:0}}),base({floor:{ccdE4:52177,ccCents:1.5}})])
    assert.throws(()=>o.analyzeOffer(bad),RangeError);

  // 12. dinheiro sempre inteiro, sem sobra de ponto flutuante
  for(const r of [fuel,full,noKpl,loss]){for(const v of [r.knownCostsCents,r.resultCents,r.commissionCents])assert.ok(Number.isInteger(v));}

  console.log('PASS: combustível por trecho, média de consumo, frete por tonelada, comissão (bruta e líquida), custo completo sem duplicar, preço de empate e de meta (e que o preço devolvido é o menor que cumpre), prejuízo, frete zero, limites da decisão, pendências que nunca viram zero, por dia e por km, entradas inválidas.');
}finally{await rm(temp,{recursive:true,force:true});}
