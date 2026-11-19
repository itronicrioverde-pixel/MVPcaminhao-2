// Motor de cálculo para analisar uma oferta de frete antes de aceitar.
//
// Tudo em números inteiros, sem ponto flutuante:
//   dinheiro            em centavos            (R$ 6,79 -> 679)
//   preço do litro      em milésimos de real   (R$ 6,790 -> 6790)
//   consumo             em centésimos de km/L  (2,50 km/L -> 250)
//   percentuais         em pontos-base         (13% -> 1300)
//   CCD do piso ANTT    em décimos de milésimo de real por km (R$ 5,2177 -> 52177)
//   litros              em mililitros
// Arredondamento: meio para cima (afastando do zero), uma vez por rubrica.
// Dado que falta nunca vira zero: o item fica null e aparece em `pending`.

export type FreightInput =
  | { kind: "fixed"; cents: number }
  | { kind: "perTon"; rateCentsPerTon: number; weightKg: number };

export type Leg = { kind: "empty" | "loaded"; km: number; kmPerLiterCenti: number | null };

/** "me": o pedágio sai do seu bolso. "contractor": o contratante dá o vale-pedágio. */
export type TollPayer = "me" | "contractor";

/** ARLA 32: consumo como parte do diesel e preço próprio. null = o caminhão não usa. */
export type ArlaInput = { percentOfDieselBp: number | null; priceMilli: number | null };

/** Coeficientes do piso mínimo de frete, copiados da calculadora oficial da ANTT pelo usuário. */
export type FloorInput = { ccdE4: number; ccCents: number };

/** Perfil fiscal de quem recebe o frete. */
export type TaxProfile = "autonomo" | "mei" | "empresa";
/** Quem paga o frete: uma empresa (transportadora, por exemplo) ou uma pessoa física. */
export type FreightPayer = "empresa" | "pessoa_fisica";
/** `count`: conta a retenção estimada no resultado. Desligado, ela só aparece como estimativa. */
export type RetentionInput = { profile: TaxProfile; payer: FreightPayer; count: boolean };

/** Como a despesa é cobrada: valor da viagem, por dia, por km rodado ou percentual do frete. */
export type ExpenseBasis = "trip" | "day" | "km" | "percent";
/** "me": a despesa é sua e sai do seu lucro. "contractor": o contratante desconta do frete. */
export type ExpensePayer = "me" | "contractor";
/**
 * Despesa avulsa com nome. `amount`: centavos (viagem), centavos por dia, centavos por km ou pontos-base do frete (percentual).
 * Desconto do contratante não aceita percentual: o valor é fixo na viagem.
 */
export type ExpenseLine = { label: string; basis: ExpenseBasis; amount: number; payer: ExpensePayer };
/** `cents` é null quando falta dado para calcular (por dia sem a duração da viagem). */
export type ExpenseLineResult = { label: string; basis: ExpenseBasis; payer: ExpensePayer; cents: number | null };

const MAX_EXPENSE_LINES = 50;
const MAX_EXPENSE_LABEL = 60;

export type OfferInput = {
  freight: FreightInput;
  legs: Leg[];
  dieselPriceMilli: number | null;
  tollPayer: TollPayer;
  /** null = pedágio não conferido; 0 = conferido e sem pedágio. */
  tollCents: number | null;
  arla: ArlaInput | null;
  extraCostsCents: number;
  /** Despesas avulsas com nome, além do campo anônimo acima. */
  expenses?: ExpenseLine[];
  /** Pneus, manutenção e similares por km rodado (vazio e carregado). null = não informado. */
  vehicleCostCentsPerKm: number | null;
  /** Parcela, seguro, IPVA, depreciação, rastreador, salário. null = ainda não informado (só avisa); 0 = não tem. */
  fixedCostPerDayCents: number | null;
  /** Descontos ou retenções definitivas e documentadas, que reduzem o que se recebe. */
  deductionsCents: number;
  commissionBp: number;
  commissionBase: "gross" | "net";
  /** Outros percentuais que incidem sobre o preço do frete. */
  otherPercentBp: number;
  targetMarginBp: number;
  /** Duração total, com espera para carregar e descarregar. */
  durationHours?: number | null;
  floor: FloorInput | null;
  /** Parte do frete paga adiantada. */
  advanceBp: number;
  /** Prazo para receber o saldo. */
  balanceDays: number | null;
  /** Quanto custa o seu dinheiro parado, em % ao mês. 0 = não contar. */
  moneyCostMonthlyBp: number;
  /** Folga de segurança: quanto os custos conhecidos podem ficar maiores no pior caso. 0 = não calcular. */
  safetyBp: number;
  /** null = não estimar retenções. */
  retention: RetentionInput | null;
};

export type PendingCode =
  | "DISTANCIA_AUSENTE"
  | "CONSUMO_AUSENTE"
  | "DIESEL_AUSENTE"
  | "PEDAGIO_NAO_CONFERIDO"
  | "ARLA_INCOMPLETO"
  | "CUSTO_KM_VEICULO_NAO_INFORMADO"
  | "DURACAO_AUSENTE"
  | "PRAZO_AUSENTE"
  | "CONFIG_INCOMPATIVEL";

export type NoticeCode =
  | "PISO_NAO_CALCULADO"
  | "ABAIXO_DO_PISO"
  | "VALE_PEDAGIO_CONFERIR"
  | "COMPENSA_SO_SEM_PRAZO"
  | "CUSTO_FIXO_NAO_INFORMADO"
  | "SALDO_NEGATIVO"
  | "RETENCAO_NAO_CONTADA"
  | "RETENCAO_PF"
  | "RETENCAO_MEI"
  | "RETENCAO_EMPRESA";

export type Pending = { code: PendingCode; message: string };
/** Avisos que não travam a análise completa. */
export type Notice = { code: NoticeCode; message: string };
export type Decision = "compensa" | "abaixo_da_meta" | "prejuizo" | "sem_frete";
/** Só para o frete que compensa: "folga" se ainda cumpre a meta com os custos maiores, "apertado" se não. */
export type Robustness = "folga" | "apertado";

export type LegResult = {
  kind: Leg["kind"];
  km: number;
  litersMilli: number | null;
  costCents: number | null;
};

export type OfferResult = {
  grossFreightCents: number;
  legs: LegResult[];
  totalKm: number;
  fuelLitersMilli: number | null;
  fuelCostCents: number | null;
  arlaLitersMilli: number | null;
  arlaCostCents: number | null;
  /** Pedágio que sai do seu bolso (0 quando o contratante dá o vale). */
  tollCostCents: number;
  vehicleCostCents: number | null;
  fixedCostCents: number | null;
  /** Cada despesa avulsa, na ordem em que foi informada. */
  expenseLines: ExpenseLineResult[];
  /** Total que reduz o frete recebido: descontos informados mais as despesas descontadas pelo contratante. */
  discountsCents: number;
  /** Soma só dos custos conhecidos (sem a comissão). */
  knownCostsCents: number;
  commissionCents: number;
  otherPercentCents: number;
  /** Provisório enquanto `complete` for false. */
  resultCents: number;
  marginBp: number | null;
  revenuePerKmCents: number | null;
  resultPerKmCents: number | null;
  resultPerDayCents: number | null;
  /** Menor frete que não dá prejuízo. */
  breakEvenCents: number | null;
  /** Menor frete que cumpre a margem alvo. */
  targetPriceCents: number | null;
  /** Piso mínimo calculado com os coeficientes informados. */
  floorCents: number | null;
  floorGapCents: number | null;
  /** Maior preço do diesel em que o frete ainda cumpre a meta / ainda não dá prejuízo. */
  dieselMaxForTargetMilli: number | null;
  dieselMaxForBreakEvenMilli: number | null;
  advanceCents: number;
  /** Dinheiro seu necessário até receber o saldo: custos pagos na estrada menos o adiantamento. */
  cashNeededCents: number;
  /** Saldo na descarga: frete menos descontos, retenção contada e adiantamento. Negativo = o dono devolve a diferença. */
  receivableCents: number;
  financingCostCents: number;
  resultAfterFinancingCents: number;
  marginAfterFinancingBp: number | null;
  /** Custos conhecidos com a folga de segurança aplicada. */
  stressCostCents: number;
  stressResultCents: number;
  stressMarginBp: number | null;
  robustness: Robustness | null;
  /** Retenção de INSS e SEST/SENAT estimada (autônomo contratado por empresa). Zero nos outros perfis. */
  retentionApplies: boolean;
  retentionCents: number;
  retentionInssCents: number;
  retentionSestSenatCents: number;
  retentionCounted: boolean;
  /** Resultado já com a retenção descontada (igual ao resultado quando ela já foi contada). */
  resultWithRetentionsCents: number;
  marginWithRetentionsBp: number | null;
  decision: Decision;
  complete: boolean;
  pending: Pending[];
  notices: Notice[];
};

// Retenção sobre o frete do autônomo contratado por empresa: 11% (INSS) e 2,5% (SEST/SENAT), ambos sobre 20% do frete bruto.
// Em pontos-base do frete bruto: 11% x 20% = 2,20% e 2,5% x 20% = 0,50%.
const RETENTION_INSS_BP = 220;
const RETENTION_SEST_SENAT_BP = 50;

const PENDING_MESSAGES: Record<PendingCode, string> = {
  DISTANCIA_AUSENTE: "Informe a distância da viagem.",
  CONSUMO_AUSENTE: "Falta o consumo (km/L) de um trecho. O diesel desse trecho não entrou na conta.",
  DIESEL_AUSENTE: "Falta o preço do diesel. O combustível não entrou na conta.",
  PEDAGIO_NAO_CONFERIDO: "O pedágio ainda não foi conferido. Isso é diferente de não ter pedágio.",
  ARLA_INCOMPLETO: "Falta o consumo ou o preço do ARLA 32. Ele não entrou na conta.",
  CUSTO_KM_VEICULO_NAO_INFORMADO: "O custo por km do caminhão (pneus, manutenção) não foi informado.",
  DURACAO_AUSENTE: "Falta a duração da viagem em dias. Sem ela o custo fixo e as despesas por dia não entraram na conta.",
  PRAZO_AUSENTE: "Falta o prazo para receber o saldo. O custo de esperar o pagamento não entrou na conta.",
  CONFIG_INCOMPATIVEL: "Comissão, outros percentuais e margem alvo somam 100% ou mais. Não existe frete que cumpra a meta.",
};

const NOTICE_MESSAGES: Record<NoticeCode, string> = {
  PISO_NAO_CALCULADO: "Piso mínimo da ANTT não calculado. Isso não quer dizer que não se aplica ao seu frete.",
  ABAIXO_DO_PISO: "O frete está abaixo do piso mínimo da ANTT calculado com os coeficientes que você informou. Confira o enquadramento na calculadora oficial.",
  VALE_PEDAGIO_CONFERIR: "O pedágio é por conta do contratante (vale-pedágio). Confira se o valor cobre a rota inteira, inclusive a volta se for o caso.",
  COMPENSA_SO_SEM_PRAZO: "O frete cumpre a sua meta, mas depois do custo de esperar o saldo a margem fica abaixo dela.",
  SALDO_NEGATIVO: "Os descontos e retenções são maiores que o saldo da descarga. O adiantamento já passou do que você tem a receber, então o contratante vai cobrar a diferença de volta.",
  RETENCAO_NAO_CONTADA: "Se a empresa reter INSS e SEST/SENAT do frete, você recebe menos do que o frete combinado. Isso ainda não está no resultado.",
  RETENCAO_PF: "Frete pago por pessoa física: não há retenção. Você mesmo recolhe o SEST/SENAT e o seu INSS.",
  RETENCAO_MEI: "MEI: não encontramos regra de retenção pelo contratante. Confira o recibo.",
  RETENCAO_EMPRESA: "Empresa: as retenções dependem do regime (Simples, lucro presumido ou real). Confira o recibo ou fale com o contador.",
  CUSTO_FIXO_NAO_INFORMADO: "Custo fixo por dia não informado: ele ainda não entrou na conta. Se o custo por km acima não inclui parcela, seguro e IPVA, o resultado está mais alto do que o real.",
};

function assertInt(name: string, value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} inválido`);
  }
}

/** Multiplica inteiros e recusa o resultado que passa do limite seguro, em vez de errar o centavo em silêncio. */
function mul(a: number, b: number) {
  const product = a * b;
  // folga de 4x: o arredondamento da divisão dobra o numerador
  if (!Number.isSafeInteger(product) || Math.abs(product) > Number.MAX_SAFE_INTEGER / 4) throw new RangeError("valor grande demais");
  return product;
}

/** Divisão inteira arredondando meio para cima (afastando do zero). */
function roundDiv(numerator: number, denominator: number) {
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((2 * Math.abs(numerator) + denominator) / (2 * denominator));
}

export function freightCents(freight: FreightInput) {
  if (freight.kind === "fixed") {
    assertInt("frete", freight.cents);
    return freight.cents;
  }
  assertInt("tarifa por tonelada", freight.rateCentsPerTon);
  assertInt("peso em kg", freight.weightKg);
  return roundDiv(mul(freight.rateCentsPerTon, freight.weightKg), 1000);
}

/** Média do ciclo: soma dos km sobre soma dos litros, nunca a média simples dos rendimentos. */
export function averageKmPerLiterCenti(cycles: { km: number; litersMilli: number }[]) {
  const km = cycles.reduce((sum, cycle) => sum + cycle.km, 0);
  const litersMilli = cycles.reduce((sum, cycle) => sum + cycle.litersMilli, 0);
  if (litersMilli <= 0) return null;
  return roundDiv(mul(km, 100000), litersMilli);
}

/** Custo por km a partir do que se gastou no ano (sem diesel e sem comissão) e dos km rodados no ano. */
export function costPerKmFromYear(spendCents: number, kmPerYear: number) {
  assertInt("gasto do ano", spendCents);
  assertInt("km do ano", kmPerYear);
  return kmPerYear === 0 ? null : roundDiv(spendCents, kmPerYear);
}

function legFuel(leg: Leg, dieselPriceMilli: number | null): LegResult {
  assertInt("km do trecho", leg.km);
  if (leg.kmPerLiterCenti !== null) assertInt("consumo", leg.kmPerLiterCenti);
  if (leg.km === 0) return { kind: leg.kind, km: 0, litersMilli: 0, costCents: 0 };
  const consumption = leg.kmPerLiterCenti && leg.kmPerLiterCenti > 0 ? leg.kmPerLiterCenti : null;
  const price = dieselPriceMilli && dieselPriceMilli > 0 ? dieselPriceMilli : null;
  return {
    kind: leg.kind,
    km: leg.km,
    litersMilli: consumption === null ? null : roundDiv(mul(leg.km, 100000), consumption),
    costCents: consumption === null || price === null ? null : roundDiv(mul(mul(leg.km, 10), price), consumption),
  };
}

type PriceParams = {
  fixedCostsCents: number;
  deductionsCents: number;
  commissionBp: number;
  commissionBase: "gross" | "net";
  otherPercentBp: number;
};

function resultAt(price: number, p: PriceParams) {
  const net = price - p.deductionsCents;
  const commissionBase = p.commissionBase === "net" ? Math.max(0, net) : price;
  const commission = roundDiv(mul(commissionBase, p.commissionBp), 10000);
  const other = roundDiv(mul(price, p.otherPercentBp), 10000);
  return { commission, other, result: net - p.fixedCostsCents - commission - other };
}

/**
 * Menor preço de frete que cumpre a margem (sobre o preço, não sobre o custo).
 * Fórmula base: C / (1 - p - m), depois conferida e ajustada em centavos,
 * porque o arredondamento da comissão pode mudar o resultado em um centavo.
 */
export function minimumPriceCents(p: PriceParams, marginBp: number) {
  const divisor = 10000 - p.commissionBp - p.otherPercentBp - marginBp;
  if (divisor <= 0) return null;
  const commissionOnDeductions = p.commissionBase === "net" ? roundDiv(mul(p.deductionsCents, p.commissionBp), 10000) : 0;
  const numerator = p.fixedCostsCents + p.deductionsCents - commissionOnDeductions;
  let price = Math.max(0, Math.floor(mul(numerator, 10000) / divisor) - 3);
  for (let step = 0; step < 1000; step += 1, price += 1) {
    if (mul(resultAt(price, p).result, 10000) >= mul(marginBp, price)) return price;
  }
  return null;
}

function validate(input: OfferInput) {
  if (input.tollPayer !== "me" && input.tollPayer !== "contractor") throw new RangeError("quem paga o pedágio inválido");
  if (input.tollCents !== null) assertInt("pedágio", input.tollCents);
  assertInt("custos extras", input.extraCostsCents);
  if (input.vehicleCostCentsPerKm !== null) assertInt("custo por km do veículo", input.vehicleCostCentsPerKm);
  if (input.fixedCostPerDayCents !== null) assertInt("custo fixo por dia", input.fixedCostPerDayCents);
  if (input.dieselPriceMilli !== null) assertInt("preço do diesel", input.dieselPriceMilli);
  assertInt("descontos", input.deductionsCents);
  if (input.expenses !== undefined) {
    if (!Array.isArray(input.expenses) || input.expenses.length > MAX_EXPENSE_LINES) throw new RangeError("lista de despesas inválida");
    for (const line of input.expenses) {
      if (typeof line?.label !== "string" || line.label.length > MAX_EXPENSE_LABEL) throw new RangeError("nome da despesa inválido");
      if (!["trip", "day", "km", "percent"].includes(line.basis)) throw new RangeError("forma de cobrança da despesa inválida");
      if (line.payer !== "me" && line.payer !== "contractor") throw new RangeError("quem arca com a despesa inválido");
      assertInt("valor da despesa", line.amount, 0, line.basis === "percent" ? 10000 : Number.MAX_SAFE_INTEGER);
      if (line.basis === "percent" && line.payer === "contractor") throw new RangeError("desconto do contratante não aceita percentual");
    }
  }
  assertInt("comissão", input.commissionBp);
  assertInt("outros percentuais", input.otherPercentBp);
  assertInt("margem alvo", input.targetMarginBp);
  if (input.durationHours != null) assertInt("duração em horas", input.durationHours, 1);
  if (input.arla) {
    if (input.arla.percentOfDieselBp !== null) assertInt("consumo de ARLA", input.arla.percentOfDieselBp, 0, 10000);
    if (input.arla.priceMilli !== null) assertInt("preço do ARLA", input.arla.priceMilli);
  }
  if (input.floor) {
    assertInt("CCD", input.floor.ccdE4);
    assertInt("CC", input.floor.ccCents);
  }
  assertInt("adiantamento", input.advanceBp, 0, 10000);
  if (input.balanceDays !== null) assertInt("prazo do saldo", input.balanceDays, 0, 3650);
  assertInt("custo do dinheiro", input.moneyCostMonthlyBp, 0, 10000);
  assertInt("folga de segurança", input.safetyBp, 0, 10000);
  if (input.retention) {
    const { profile, payer, count } = input.retention;
    if (profile !== "autonomo" && profile !== "mei" && profile !== "empresa") throw new RangeError("perfil fiscal inválido");
    if (payer !== "empresa" && payer !== "pessoa_fisica") throw new RangeError("quem paga o frete inválido");
    if (typeof count !== "boolean") throw new RangeError("contar retenção inválido");
  }
}

function evaluate(input: OfferInput): OfferResult {
  validate(input);
  const gross = freightCents(input.freight);

  const legs = input.legs.map((leg) => legFuel(leg, input.dieselPriceMilli));
  const totalKm = legs.reduce((sum, leg) => sum + leg.km, 0);
  const loadedKm = legs.reduce((sum, leg) => sum + (leg.kind === "loaded" ? leg.km : 0), 0);
  const fuelKnown = legs.every((leg) => leg.costCents !== null);
  const fuelCostCents = fuelKnown ? legs.reduce((sum, leg) => sum + (leg.costCents ?? 0), 0) : null;
  const fuelLitersMilli = legs.every((leg) => leg.litersMilli !== null) ? legs.reduce((sum, leg) => sum + (leg.litersMilli ?? 0), 0) : null;

  let arlaLitersMilli: number | null = null;
  let arlaCostCents: number | null = null;
  let arlaIncomplete = false;
  if (input.arla) {
    const { percentOfDieselBp: percent, priceMilli: price } = input.arla;
    if (percent === null) {
      arlaIncomplete = true;
    } else {
      if (fuelLitersMilli !== null) arlaLitersMilli = roundDiv(mul(fuelLitersMilli, percent), 10000);
      if (percent === 0) arlaCostCents = 0;
      else if (price === null || price <= 0) arlaIncomplete = true;
      else if (arlaLitersMilli !== null) arlaCostCents = roundDiv(mul(arlaLitersMilli, price), 10000);
    }
  }

  const tollCostCents = input.tollPayer === "me" ? (input.tollCents ?? 0) : 0;
  const vehicleCostCents = input.vehicleCostCentsPerKm === null ? null : mul(input.vehicleCostCentsPerKm, totalKm);
  let fixedCostCents: number | null = null;
  if (input.fixedCostPerDayCents !== null) {
    if (input.fixedCostPerDayCents === 0) fixedCostCents = 0;
    else if (input.durationHours) fixedCostCents = roundDiv(mul(input.fixedCostPerDayCents, input.durationHours), 24);
  }

  // despesas avulsas: valor, dia e km viram centavos; percentual acompanha o preço do frete (ver abaixo)
  const expenses = input.expenses ?? [];
  const expenseLines: ExpenseLineResult[] = [];
  let expenseCostCents = 0;
  let expenseDiscountCents = 0;
  let expensePercentBp = 0;
  let dayExpenseWithoutDuration = false;
  for (const line of expenses) {
    let cents: number | null = null;
    if (line.basis === "trip") cents = line.amount;
    else if (line.basis === "km") cents = mul(line.amount, totalKm);
    else if (line.basis === "day") {
      if (line.amount === 0) cents = 0;
      else if (input.durationHours) cents = roundDiv(mul(line.amount, input.durationHours), 24);
      else dayExpenseWithoutDuration = true;
    }
    if (line.basis === "percent") {
      // arredondamento acumulado: a soma das linhas é exatamente o arredondamento do conjunto
      const before = roundDiv(mul(gross, input.otherPercentBp + expensePercentBp), 10000);
      expensePercentBp += line.amount;
      cents = roundDiv(mul(gross, input.otherPercentBp + expensePercentBp), 10000) - before;
    } else if (cents !== null) {
      if (line.payer === "me") expenseCostCents += cents;
      else expenseDiscountCents += cents;
    }
    expenseLines.push({ label: line.label, basis: line.basis, payer: line.payer, cents });
  }
  const discountsCents = input.deductionsCents + expenseDiscountCents;

  const knownFuelCents = legs.reduce((sum, leg) => sum + (leg.costCents ?? 0), 0);
  const knownCostsCents = knownFuelCents + (arlaCostCents ?? 0) + tollCostCents + input.extraCostsCents + expenseCostCents + (vehicleCostCents ?? 0) + (fixedCostCents ?? 0);

  // retenção estimada: proporcional ao frete, então entra na conta como um percentual sobre o frete
  const retentionApplies = input.retention?.profile === "autonomo" && input.retention.payer === "empresa";
  const retentionCounted = retentionApplies && input.retention?.count === true;
  const retentionBp = retentionApplies ? RETENTION_INSS_BP + RETENTION_SEST_SENAT_BP : 0;
  // contada: arredondamento acumulado depois dos outros percentuais, para as linhas somarem exatamente; só estimada: sobre o frete
  const percentBeforeRetentionBp = input.otherPercentBp + expensePercentBp;
  const beforeRetentionCents = roundDiv(mul(gross, percentBeforeRetentionBp), 10000);
  const retentionCents = retentionCounted
    ? roundDiv(mul(gross, percentBeforeRetentionBp + retentionBp), 10000) - beforeRetentionCents
    : roundDiv(mul(gross, retentionBp), 10000);
  const retentionInssCents = !retentionApplies
    ? 0
    : retentionCounted
      ? roundDiv(mul(gross, percentBeforeRetentionBp + RETENTION_INSS_BP), 10000) - beforeRetentionCents
      : roundDiv(mul(gross, RETENTION_INSS_BP), 10000);
  const retentionSestSenatCents = retentionCents - retentionInssCents;

  const params: PriceParams = {
    fixedCostsCents: knownCostsCents,
    deductionsCents: discountsCents,
    commissionBp: input.commissionBp,
    commissionBase: input.commissionBase,
    otherPercentBp: input.otherPercentBp + expensePercentBp + (retentionCounted ? retentionBp : 0),
  };
  const { commission, result } = resultAt(gross, params);
  // as linhas somam exatamente: despesas em percentual e retenção contada saem do total dos percentuais
  const other = roundDiv(mul(gross, input.otherPercentBp), 10000);
  const resultWithRetentionsCents = retentionCounted ? result : result - retentionCents;

  const pending: Pending[] = [];
  const add = (code: PendingCode) => pending.push({ code, message: PENDING_MESSAGES[code] });
  if (totalKm === 0) add("DISTANCIA_AUSENTE");
  if (input.legs.some((leg) => leg.km > 0 && !(leg.kmPerLiterCenti !== null && leg.kmPerLiterCenti > 0))) add("CONSUMO_AUSENTE");
  if (legs.some((leg) => leg.km > 0) && !(input.dieselPriceMilli && input.dieselPriceMilli > 0)) add("DIESEL_AUSENTE");
  if (input.tollPayer === "me" && input.tollCents === null) add("PEDAGIO_NAO_CONFERIDO");
  if (arlaIncomplete) add("ARLA_INCOMPLETO");
  if (input.vehicleCostCentsPerKm === null) add("CUSTO_KM_VEICULO_NAO_INFORMADO");
  if ((input.fixedCostPerDayCents !== null && input.fixedCostPerDayCents > 0 && !input.durationHours) || dayExpenseWithoutDuration) add("DURACAO_AUSENTE");
  if (input.moneyCostMonthlyBp > 0 && input.balanceDays === null) add("PRAZO_AUSENTE");

  const targetPriceCents = minimumPriceCents(params, input.targetMarginBp);
  if (targetPriceCents === null) add("CONFIG_INCOMPATIVEL");
  const breakEvenCents = minimumPriceCents(params, 0);

  let decision: Decision;
  if (gross <= 0) decision = result < 0 ? "prejuizo" : "sem_frete";
  else if (result < 0) decision = "prejuizo";
  else if (mul(result, 10000) >= mul(input.targetMarginBp, gross)) decision = "compensa";
  else decision = "abaixo_da_meta";

  // dinheiro parado: o adiantamento cobre parte do que sai na estrada; o saldo demora
  const advanceCents = roundDiv(mul(gross, input.advanceBp), 10000);
  const upfrontCents = knownFuelCents + (arlaCostCents ?? 0) + tollCostCents + input.extraCostsCents + expenseCostCents;
  const cashNeededCents = Math.max(0, upfrontCents - advanceCents);
  // o que a empresa retém (INSS e SEST/SENAT) também sai do que você recebe, quando a retenção é contada
  const receivableCents = gross - discountsCents - (retentionCounted ? retentionCents : 0) - advanceCents;
  const financingCostCents =
    input.moneyCostMonthlyBp > 0 && input.balanceDays !== null
      ? roundDiv(mul(mul(Math.max(0, receivableCents), input.moneyCostMonthlyBp), input.balanceDays), 300000)
      : 0;
  const resultAfterFinancingCents = result - financingCostCents;

  // pior caso: só encarece o que já se conhece; a comissão não muda, porque é sobre o frete
  const stressCostCents = roundDiv(mul(knownCostsCents, 10000 + input.safetyBp), 10000);
  const stressResultCents = resultAt(gross, { ...params, fixedCostsCents: stressCostCents }).result;
  const robustness: Robustness | null =
    decision !== "compensa" || input.safetyBp === 0
      ? null
      : mul(stressResultCents, 10000) >= mul(input.targetMarginBp, gross) ? "folga" : "apertado";

  let floorCents: number | null = null;
  if (input.floor) floorCents = roundDiv(mul(loadedKm, input.floor.ccdE4), 100) + input.floor.ccCents;
  const floorGapCents = floorCents === null ? null : gross - floorCents;

  const notices: Notice[] = [];
  const notify = (code: NoticeCode) => notices.push({ code, message: NOTICE_MESSAGES[code] });
  if (floorCents === null) notify("PISO_NAO_CALCULADO");
  else if (gross > 0 && gross < floorCents) notify("ABAIXO_DO_PISO");
  if (input.tollPayer === "contractor") notify("VALE_PEDAGIO_CONFERIR");
  if (receivableCents < 0) notify("SALDO_NEGATIVO");
  // o dono só vai saber o custo fixo por dia depois de usar o app: avisa, mas não trava a análise
  if (input.fixedCostPerDayCents === null) notify("CUSTO_FIXO_NAO_INFORMADO");
  if (input.retention) {
    if (retentionApplies && !retentionCounted) notify("RETENCAO_NAO_CONTADA");
    else if (input.retention.profile === "autonomo" && input.retention.payer === "pessoa_fisica") notify("RETENCAO_PF");
    else if (input.retention.profile === "mei") notify("RETENCAO_MEI");
    else if (input.retention.profile === "empresa") notify("RETENCAO_EMPRESA");
  }
  if (decision === "compensa" && financingCostCents > 0 && mul(resultAfterFinancingCents, 10000) < mul(input.targetMarginBp, gross)) {
    notify("COMPENSA_SO_SEM_PRAZO");
  }

  return {
    grossFreightCents: gross,
    legs,
    totalKm,
    fuelLitersMilli,
    fuelCostCents,
    arlaLitersMilli,
    arlaCostCents,
    tollCostCents,
    vehicleCostCents,
    fixedCostCents,
    expenseLines,
    discountsCents,
    knownCostsCents,
    commissionCents: commission,
    otherPercentCents: other,
    resultCents: result,
    marginBp: gross > 0 ? roundDiv(mul(result, 10000), gross) : null,
    revenuePerKmCents: totalKm > 0 ? roundDiv(gross, totalKm) : null,
    resultPerKmCents: totalKm > 0 ? roundDiv(result, totalKm) : null,
    resultPerDayCents: input.durationHours ? roundDiv(mul(result, 24), input.durationHours) : null,
    breakEvenCents,
    targetPriceCents,
    floorCents,
    floorGapCents,
    dieselMaxForTargetMilli: null,
    dieselMaxForBreakEvenMilli: null,
    advanceCents,
    cashNeededCents,
    receivableCents,
    financingCostCents,
    resultAfterFinancingCents,
    marginAfterFinancingBp: gross > 0 ? roundDiv(mul(resultAfterFinancingCents, 10000), gross) : null,
    stressCostCents,
    stressResultCents,
    stressMarginBp: gross > 0 ? roundDiv(mul(stressResultCents, 10000), gross) : null,
    robustness,
    retentionApplies,
    retentionCents,
    retentionInssCents,
    retentionSestSenatCents,
    retentionCounted,
    resultWithRetentionsCents,
    marginWithRetentionsBp: gross > 0 ? roundDiv(mul(resultWithRetentionsCents, 10000), gross) : null,
    decision,
    complete: pending.length === 0,
    pending,
    notices,
  };
}

/** Maior preço do diesel (em milésimos) em que `holds` ainda é verdade; o custo só cresce com o preço. */
function largestDieselThatHolds(input: OfferInput, start: number, holds: (result: OfferResult) => boolean) {
  const at = (price: number) => holds(evaluate({ ...input, dieselPriceMilli: price }));
  if (!at(start)) return null;
  let low = start;
  let high = start * 2;
  while (at(high)) {
    low = high;
    high *= 2;
    if (high > 10_000_000) return null;
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (at(middle)) low = middle;
    else high = middle;
  }
  return low;
}

export function analyzeOffer(input: OfferInput): OfferResult {
  const result = evaluate(input);
  const price = input.dieselPriceMilli;
  if (result.fuelCostCents === null || !price || price <= 0 || result.grossFreightCents <= 0) return result;
  const gross = result.grossFreightCents;
  return {
    ...result,
    dieselMaxForBreakEvenMilli: largestDieselThatHolds(input, price, (r) => r.resultCents >= 0),
    dieselMaxForTargetMilli: largestDieselThatHolds(input, price, (r) => mul(r.resultCents, 10000) >= mul(input.targetMarginBp, gross)),
  };
}
