import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const temp=await mkdtemp(join(tmpdir(),'rota-summary-'));
async function load(file,rewrites={}){
  let source=await readFile(resolve(file),'utf8');
  for(const [from,to] of Object.entries(rewrites))source=source.replaceAll(from,to);
  const out=join(temp,file.replace(/\W+/g,'_')+'.mjs');
  await writeFile(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  return out;
}
try{
  const financeFile=await load('lib/finance.ts',{'from "zod"':`from ${JSON.stringify(import.meta.resolve('zod'))}`,'from "zod";':`from ${JSON.stringify(import.meta.resolve('zod'))};`});
  const summaryFile=await load('lib/summary.ts',{'"./finance"':JSON.stringify(pathToFileURL(financeFile).href)});
  const s=await import(pathToFileURL(summaryFile));

  const trip=(over={})=>({id:'t',tripDate:'2026-01-10',origin:'A',destination:'B',clientName:'Cliente 1',cargoType:'Carga geral',freight:13200,freightPerTon:null,lossAlertPercent:10,driverPercent:10,km:1800,diesel:4700,toll:750,oil:0,extras:200,extraItems:[{category:'Alimentação',amount:80},{category:'Ajudante',amount:120}],axles:6,loadedWeight:null,deliveredWeight:null,status:'Concluído',notes:'',...over});
  const expense=(over={})=>({id:'e',expenseDate:'2026-01-15',category:'Seguro',description:'Seguro',amount:100,...over});
  const revenue=(over={})=>({id:'r',revenueDate:'2026-03-05',category:'Reembolso',description:'Devolução',amount:300,...over});

  // custo e lucro de uma viagem: 4700 + 750 + 0 + 200 + comissão de 10% sobre 13200 (1320)
  assert.equal(s.tripCost(trip()),6970);
  assert.equal(s.tripProfit(trip()),6230);
  assert.equal(s.tripProfit(trip({driverPercent:0})),7550);
  assert.equal(s.tripProfit(trip({freight:5000})),-1150,'frete menor que o custo vira prejuízo (comissão de 10% de 5000 = 500)');

  // perda de carga
  assert.equal(s.loadLoss(trip()),null,'sem pesos não há perda');
  assert.equal(s.loadLoss(trip({loadedWeight:30000})),null,'sem peso entregue não há perda');
  assert.equal(s.loadLoss(trip({loadedWeight:0,deliveredWeight:0})),null,'peso carregado zero não divide por zero');
  assert.equal(s.loadLoss(trip({loadedWeight:30000,deliveredWeight:29700})),1);
  assert.equal(s.loadLoss(trip({loadedWeight:30000,deliveredWeight:30000})),0);
  assert.equal(s.loadLoss(trip({loadedWeight:30000,deliveredWeight:30500})),0,'entregar mais do que carregou não vira perda negativa');
  assert.equal(s.loadLoss(trip({loadedWeight:30000,deliveredWeight:0})),100,'entrega zero é perda total');

  assert.deepEqual(['Prejuízo','Lucro','Resultado'],[s.resultLabel(-0.01),s.resultLabel(0.01),s.resultLabel(0)]);

  // totais
  const empty=s.totals([],[],[]);
  assert.deepEqual(empty,{tripCosts:0,extraCosts:0,revenue:0,costs:0,profit:0,margin:0,totalKm:0},'ano sem dados: tudo zero, margem sem NaN');
  const t1=trip(),t2=trip({id:'t2',tripDate:'2026-03-20',freight:10000,driverPercent:0,diesel:3000,toll:500,extras:0,extraItems:[],km:1000});
  const all=s.totals([t1,t2],[expense()],[revenue()]);
  assert.equal(all.revenue,13200+10000+300,'receita = fretes + receitas avulsas');
  assert.equal(all.tripCosts,6970+3500);
  assert.equal(all.extraCosts,100);
  assert.equal(all.costs,6970+3500+100);
  assert.equal(all.profit,23500-10570);
  assert.equal(all.totalKm,2800);
  assert.ok(Math.abs(all.margin-(12930/23500*100))<1e-9);
  assert.ok(s.totals([trip({freight:0,driverPercent:0})],[],[]).margin===0,'receita zero não gera infinito');
  assert.ok(s.totals([trip({freight:1000,driverPercent:0})],[],[]).margin<0,'margem negativa quando há prejuízo');

  // série mensal
  const m=s.monthlySeries([t1,t2,trip({id:'t3',tripDate:'2026-01-31'}),trip({id:'t4',tripDate:'2026-12-01',freight:100,driverPercent:0,diesel:0,toll:0,extras:0,extraItems:[]})],[expense(),expense({expenseDate:'2026-02-01',amount:50})],[revenue()]);
  assert.equal(m.length,12);
  assert.deepEqual(m.map(x=>x.month),['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']);
  assert.equal(m[0].Faturamento,26400,'31/01 continua em janeiro');
  assert.equal(m[0].Despesas,6970*2+100);
  assert.equal(m[0].Resultado,26400-13940-100);
  assert.equal(m[1].Despesas,50,'despesa avulsa de 01/02 cai em fevereiro');
  assert.equal(m[2].Faturamento,10000+300,'receita avulsa entra no mês dela');
  assert.equal(m[11].Faturamento,100,'01/12 cai em dezembro');
  assert.equal(m[5].Faturamento+m[5].Despesas,0);

  // custos por categoria
  const b=s.expenseBreakdown([t1,t2],[expense(),expense({category:'Alimentação',amount:10}),expense({category:'Multa',amount:0})]);
  assert.deepEqual(b.map(x=>x.name),['Abastecimento','Comissão do motorista','Pedágio','Ajudante','Seguro','Alimentação']);
  assert.deepEqual(b.map(x=>x.value),[7700,1320,1250,120,100,90]);
  assert.ok(!b.some(x=>x.name==='Óleo'||x.name==='Extras'||x.name==='Multa'),'categorias com valor zero não aparecem');

  // clientes
  const c=s.clientSummary([t1,t2,trip({id:'t3',clientName:'Cliente 2',freight:50000,driverPercent:0,tripDate:'2026-02-02'}),trip({id:'t4',tripDate:'2026-05-01'})]);
  assert.deepEqual(c.map(x=>x.name),['Cliente 2','Cliente 1']);
  assert.equal(c[1].trips,3);
  assert.equal(c[1].revenue,13200+10000+13200);
  assert.equal(c[1].lastTrip,'2026-05-01','última viagem é a mais recente, não a última da lista');
  assert.equal(c[0].profit,50000-(4700+750+200));
  assert.deepEqual(s.clientSummary([]),[]);

  console.log('PASS: custo e lucro por viagem, perda de carga, totais do ano (incluindo ano vazio e margem), série mensal com virada de mês, custos por categoria e resumo por cliente.');
}finally{await rm(temp,{recursive:true,force:true});}
