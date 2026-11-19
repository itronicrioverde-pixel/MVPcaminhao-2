import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Outras despesas: linhas com nome, cobradas por viagem, dia, km ou % do frete, sendo suas ou descontadas pelo contratante.
const temp=await mkdtemp(join(tmpdir(),'rota-expenses-'));
try{
  const out=join(temp,'offer.mjs');
  await writeFile(out,ts.transpileModule(await readFile(resolve('lib/offer.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  const o=await import(pathToFileURL(out));
  const base=(over={})=>({
    freight:{kind:'fixed',cents:1006000},
    legs:[{kind:'empty',km:120,kmPerLiterCenti:300},{kind:'loaded',km:600,kmPerLiterCenti:200}],
    dieselPriceMilli:6790,tollCents:45000,extraCostsCents:0,vehicleCostCentsPerKm:150,
    deductionsCents:0,commissionBp:1300,commissionBase:'gross',otherPercentBp:0,targetMarginBp:2000,durationHours:null,
    tollPayer:'me',arla:null,fixedCostPerDayCents:0,floor:null,advanceBp:0,balanceDays:null,moneyCostMonthlyBp:0,safetyBp:0,retention:null,
    ...over});
  const L=(label,basis,amount,payer='me')=>({label,basis,amount,payer});
  const plain=o.analyzeOffer(base());
  assert.equal(plain.resultCents,491360,'sem despesas extras: R$ 4.913,60, o caso do documento');
  assert.deepEqual(plain.expenseLines,[],'sem linhas, sem nada a mostrar');
  assert.deepEqual(o.analyzeOffer(base({expenses:[]})),plain,'lista vazia é igual a não ter lista');

  // 1. valor da viagem, seu: entra nos custos e tira do resultado, com o nome na conta
  const chapa=o.analyzeOffer(base({expenses:[L('Chapa','trip',38000)]}));
  assert.equal(chapa.resultCents,491360-38000);assert.equal(chapa.knownCostsCents,plain.knownCostsCents+38000);
  assert.deepEqual(chapa.expenseLines,[{label:'Chapa',basis:'trip',payer:'me',cents:38000}]);
  assert.equal(chapa.resultCents,o.analyzeOffer(base({extraCostsCents:38000})).resultCents,'igual ao campo antigo de outros custos');
  assert.equal(chapa.commissionCents,plain.commissionCents,'a comissão é sobre o frete, não muda com despesa');

  // 2. por km: 720 km rodados (vazio e carregado)
  const km=o.analyzeOffer(base({expenses:[L('Lavagem','km',5)]}));
  assert.equal(km.expenseLines[0].cents,3600,'5 centavos por km x 720 km');assert.equal(km.resultCents,491360-3600);

  // 3. por dia: depende da duração; sem ela fica pendente e não vira zero escondido
  const day=o.analyzeOffer(base({durationHours:72,expenses:[L('Diária do ajudante','day',20000)]}));
  assert.equal(day.expenseLines[0].cents,60000,'R$ 200 por dia, 3 dias');assert.equal(day.resultCents,491360-60000);
  const noDur=o.analyzeOffer(base({expenses:[L('Diária do ajudante','day',20000)]}));
  assert.ok(noDur.pending.some(p=>p.code==='DURACAO_AUSENTE'),'sem a duração, avisa');assert.equal(noDur.complete,false);
  assert.equal(noDur.expenseLines[0].cents,null,'sem a duração o valor é desconhecido, não zero');assert.equal(noDur.resultCents,491360);
  assert.ok(!o.analyzeOffer(base({expenses:[L('Diária','day',0)]})).pending.some(p=>p.code==='DURACAO_AUSENTE'),'valor zero não pede duração');
  assert.equal(o.analyzeOffer(base({durationHours:36,expenses:[L('Diária','day',20000)]})).expenseLines[0].cents,30000,'um dia e meio');

  // 4. percentual do frete, seu: cresce com o frete e entra no preço de empate e de meta
  const seg=o.analyzeOffer(base({expenses:[L('Seguro da carga','percent',200)]}));
  assert.equal(seg.expenseLines[0].cents,20120,'2% de R$ 10.060,00');assert.equal(seg.resultCents,491360-20120);
  assert.equal(seg.knownCostsCents,plain.knownCostsCents,'percentual não é custo fixo: acompanha o preço');
  const ok=(freight,over)=>o.analyzeOffer(base({freight:{kind:'fixed',cents:freight},...over}));
  for(const over of [{expenses:[L('Seguro','percent',200)]},{expenses:[L('Seguro','percent',150),L('Chapa','trip',38000),L('Lavagem','km',5)],deductionsCents:12000},{expenses:[L('Seguro','percent',100),L('Desc','trip',15000,'contractor')],commissionBase:'net'}]){
    const r=o.analyzeOffer(base(over));
    for(const [price,margin] of [[r.breakEvenCents,0],[r.targetPriceCents,2000]]){
      const at=ok(price,over),below=ok(price-1,over);
      assert.ok(at.resultCents*10000>=margin*price,'no preço devolvido cumpre');assert.ok(below.resultCents*10000<margin*(price-1),'um centavo abaixo não cumpre');
    }
  }
  assert.equal(o.analyzeOffer(base({expenses:[L('Taxa','percent',8700)]})).targetPriceCents,null,'percentuais que somam demais não têm preço de meta');
  assert.ok(o.analyzeOffer(base({expenses:[L('Taxa','percent',8700)]})).pending.some(p=>p.code==='CONFIG_INCOMPATIVEL'));

  // 5. vários percentuais: as linhas somam exatamente, sem centavo sobrando ou faltando
  for(const cents of [10100,10300,1006000,999999,3]){
    const r=o.analyzeOffer(base({freight:{kind:'fixed',cents},legs:[],tollCents:0,vehicleCostCentsPerKm:0,commissionBp:0,otherPercentBp:30,expenses:[L('A','percent',50),L('B','percent',50),L('C','percent',50)]}));
    const sum=r.expenseLines.reduce((n,l)=>n+l.cents,0);
    assert.equal(cents-r.knownCostsCents-r.commissionCents-r.otherPercentCents-sum,r.resultCents,`as linhas fecham o resultado (frete ${cents})`);
    assert.ok(r.otherPercentCents>=0&&r.expenseLines.every(l=>l.cents>=0));
    assert.equal(r.otherPercentCents+sum,Math.floor((cents*180*2+10000)/20000),'o total dos percentuais é o arredondamento do conjunto');
  }

  // 6. desconto do contratante: reduz o frete que você recebe, não é custo seu
  const disc=o.analyzeOffer(base({expenses:[L('Desconto de avaria','trip',10000,'contractor')]}));
  const legacy=o.analyzeOffer(base({deductionsCents:10000}));
  assert.equal(disc.resultCents,legacy.resultCents,'igual ao campo antigo de descontos');assert.equal(disc.knownCostsCents,plain.knownCostsCents);
  assert.equal(disc.expenseLines[0].payer,'contractor');assert.equal(disc.discountsCents,10000);assert.equal(plain.discountsCents,0);
  assert.equal(o.analyzeOffer(base({deductionsCents:5000,expenses:[L('X','trip',10000,'contractor')]})).discountsCents,15000,'soma com o campo antigo');
  assert.equal(o.analyzeOffer(base({commissionBase:'net',expenses:[L('X','trip',10000,'contractor')]})).resultCents,o.analyzeOffer(base({commissionBase:'net',deductionsCents:10000})).resultCents,'com comissão sobre o líquido também');
  const dayDisc=o.analyzeOffer(base({durationHours:48,expenses:[L('Espera descontada','day',5000,'contractor')]}));assert.equal(dayDisc.discountsCents,10000);
  assert.equal(disc.receivableCents,plain.receivableCents-10000,'a receber diminui');

  // 7. caixa até descarregar: despesa sua na estrada entra, desconto e percentual não
  const cash=o.analyzeOffer(base({expenses:[L('Chapa','trip',38000),L('Seguro','percent',200),L('Desc','trip',10000,'contractor')]}));
  assert.equal(cash.cashNeededCents,230860+45000+38000,'diesel + pedágio + chapa, sem adiantamento');
  assert.equal(o.analyzeOffer(base({advanceBp:8000,expenses:[L('Chapa','trip',38000)]})).cashNeededCents,0,'o adiantamento cobre');

  // 8. pior caso: o que é custo conhecido encarece, comissão e percentual não
  const stress=o.analyzeOffer(base({safetyBp:1000,expenses:[L('Chapa','trip',38000)]}));
  assert.equal(stress.stressCostCents,Math.round((plain.knownCostsCents+38000)*1.1),'10% a mais sobre os custos, inclusive a chapa');

  // 9. com retenção contada, as linhas ainda fecham
  const AUT={profile:'autonomo',payer:'empresa',count:true};
  for(const cents of [1006000,10100,200000]){
    const r=o.analyzeOffer(base({freight:{kind:'fixed',cents},otherPercentBp:30,retention:AUT,expenses:[L('A','percent',50),L('B','percent',70),L('Chapa','trip',1000)]}));
    const sum=r.expenseLines.filter(l=>l.basis==='percent').reduce((n,l)=>n+l.cents,0);
    assert.equal(cents-r.knownCostsCents-r.commissionCents-r.otherPercentCents-sum-r.retentionCents,r.resultCents,`com retenção contada (frete ${cents})`);
    assert.equal(r.retentionInssCents+r.retentionSestSenatCents,r.retentionCents);assert.ok(r.otherPercentCents>=0);
  }

  // 10. dado errado é recusado
  for(const bad of [L('X','trip',-1),L('X','trip',1.5),L('X','trip',Number.NaN),L('X','weekly',1),L('X','trip',1,'outro'),L('X','percent',10001),L('X','percent',100,'contractor'),{label:5,basis:'trip',amount:1,payer:'me'},L('x'.repeat(61),'trip',1)])
    assert.throws(()=>o.analyzeOffer(base({expenses:[bad]})),RangeError,JSON.stringify(bad));
  assert.throws(()=>o.analyzeOffer(base({expenses:'x'})),RangeError);
  assert.throws(()=>o.analyzeOffer(base({expenses:Array.from({length:51},()=>L('X','trip',1))})),RangeError,'no máximo 50 linhas');

  // 11. dinheiro sempre inteiro
  const all=o.analyzeOffer(base({durationHours:50,expenses:[L('A','trip',333),L('B','day',777),L('C','km',3),L('D','percent',33),L('E','trip',11,'contractor')]}));
  for(const l of all.expenseLines)assert.ok(Number.isInteger(l.cents));
  for(const v of [all.resultCents,all.knownCostsCents,all.discountsCents,all.cashNeededCents])assert.ok(Number.isInteger(v));
  console.log('PASS: outras despesas — por viagem, dia, km e % do frete; suas ou descontadas pelo contratante; preço de empate e de meta exatos; linhas que fecham o resultado; caixa; pior caso; pendência sem duração; dados errados recusados.');
}finally{await rm(temp,{recursive:true,force:true});}
