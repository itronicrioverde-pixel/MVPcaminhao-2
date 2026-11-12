// Motor de cálculo para analisar uma oferta de frete antes de aceitar.
//
// Tudo em números inteiros, sem ponto flutuante:
//   dinheiro            em centavos            (R$ 6,79 -> 679)
//   preço do litro      em milésimos de real   (R$ 6,790 -> 6790)
//   consumo             em centésimos de km/L  (2,50 km/L -> 250)
//   percentuais         em pontos-base         (13% -> 1300)
//   litros              em mililitros
// Arredondamento: meio para cima (afastando do zero), uma vez por rubrica.
// Dado que falta nunca vira zero: o item fica null e aparece em `pending`.

export type FreightInput =
  | { kind: "fixed"; cents: number }
  | { kind: "perTon"; rateCentsPerTon: number; weightKg: number };

export type Leg = { kind: "empty" | "loaded"; km: number; kmPerLiterCenti: number | null };

export type OfferInput = {
  freight: FreightInput;
  legs: Leg[];
  dieselPriceMilli: number | null;
  /** null = pedágio não conferido; 0 = conferido e sem pedágio. */
  tollCents: number | null;
  extraCostsCents: number;
  /** Pneus, manutenção e similares por km rodado (vazio e carregado). null = não informado. */
  vehicleCostCentsPerKm: number | null;
  /** Descontos ou retenções definitivas e documentadas, que reduzem o que se recebe. */
  deductionsCents: number;
  commissionBp: number;
  commissionBase: "gross" | "net";
  /** Outros percentuais que incidem sobre o preço do frete. */
  otherPercentBp: number;
  targetMarginBp: number;
  durationHours?: number | null;
};

export type PendingCode =
  | "DISTANCIA_AUSENTE"
  | "CONSUMO_AUSENTE"
  | "DIESEL_AUSENTE"
  | "PEDAGIO_NAO_CONFERIDO"
  | "CUSTO_KM_VEICULO_NAO_INFORMADO"
  | "CONFIG_INCOMPATIVEL";

export type Pending = { code: PendingCode; message: string };
export type Decision = "compensa" | "abaixo_da_meta" | "prejuizo" | "sem_frete";

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
  /** Soma só dos custos conhecidos (sem a comissão). */
  knownCostsCents: number;
  commissionCents: number;
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
  decision: Decision;
  complete: boolean;
  pending: Pending[];
};

const PENDING_MESSAGES: Record<PendingCode, string> = {
  DISTANCIA_AUSENTE: "Informe a distância da viagem.",
  CONSUMO_AUSENTE: "Falta o consumo (km/L) de um trecho. O diesel desse trecho não entrou na conta.",
  DIESEL_AUSENTE: "Falta o preço do diesel. O combustível não entrou na conta.",
  PEDAGIO_NAO_CONFERIDO: "O pedágio ainda não foi conferido. Isso é diferente de não ter pedágio.",
  CUSTO_KM_VEICULO_NAO_INFORMADO: "O custo por km do caminhão (pneus, manutenção) não foi informado.",
  CONFIG_INCOMPATIVEL: "Comissão, outros percentuais e margem alvo somam 100% ou mais. Não existe frete que cumpra a meta.",
};

function assertInt(name: string, value: unknown, min = 0): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} inválido`);
  }
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
  return roundDiv(freight.rateCentsPerTon * freight.weightKg, 1000);
}

/** Média do ciclo: soma dos km sobre soma dos litros, nunca a média simples dos rendimentos. */
export function averageKmPerLiterCenti(cycles: { km: number; litersMilli: number }[]) {
  const km = cycles.reduce((sum, cycle) => sum + cycle.km, 0);
  const litersMilli = cycles.reduce((sum, cycle) => sum + cycle.litersMilli, 0);
  if (litersMilli <= 0) return null;
  return roundDiv(km * 100 * 1000, litersMilli);
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
    litersMilli: consumption === null ? null : roundDiv(leg.km * 100 * 1000, consumption),
    costCents: consumption === null || price === null ? null : roundDiv(leg.km * 10 * price, consumption),
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
  const commission = roundDiv(commissionBase * p.commissionBp, 10000);
  const other = roundDiv(price * p.otherPercentBp, 10000);
  return { commission, result: net - p.fixedCostsCents - commission - other };
}

/**
 * Menor preço de frete que cumpre a margem (sobre o preço, não sobre o custo).
 * Fórmula base: C / (1 - p - m), depois conferida e ajustada em centavos,
 * porque o arredondamento da comissão pode mudar o resultado em um centavo.
 */
export function minimumPriceCents(p: PriceParams, marginBp: number) {
  const divisor = 10000 - p.commissionBp - p.otherPercentBp - marginBp;
  if (divisor <= 0) return null;
  const commissionOnDeductions = p.commissionBase === "net" ? roundDiv(p.deductionsCents * p.commissionBp, 10000) : 0;
  const numerator = p.fixedCostsCents + p.deductionsCents - commissionOnDeductions;
  let price = Math.max(0, Math.floor((numerator * 10000) / divisor) - 3);
  for (let step = 0; step < 1000; step += 1, price += 1) {
    if (resultAt(price, p).result * 10000 >= marginBp * price) return price;
  }
  return null;
}

export function analyzeOffer(input: OfferInput): OfferResult {
  const gross = freightCents(input.freight);
  if (input.tollCents !== null) assertInt("pedágio", input.tollCents);
  assertInt("custos extras", input.extraCostsCents);
  if (input.vehicleCostCentsPerKm !== null) assertInt("custo por km do veículo", input.vehicleCostCentsPerKm);
  if (input.dieselPriceMilli !== null) assertInt("preço do diesel", input.dieselPriceMilli);
  assertInt("descontos", input.deductionsCents);
  assertInt("comissão", input.commissionBp);
  assertInt("outros percentuais", input.otherPercentBp);
  assertInt("margem alvo", input.targetMarginBp);
  if (input.durationHours != null) assertInt("duração em horas", input.durationHours, 1);

  const legs = input.legs.map((leg) => legFuel(leg, input.dieselPriceMilli));
  const totalKm = legs.reduce((sum, leg) => sum + leg.km, 0);
  const fuelKnown = legs.every((leg) => leg.costCents !== null);
  const fuelCostCents = fuelKnown ? legs.reduce((sum, leg) => sum + (leg.costCents ?? 0), 0) : null;
  const fuelLitersMilli = legs.every((leg) => leg.litersMilli !== null) ? legs.reduce((sum, leg) => sum + (leg.litersMilli ?? 0), 0) : null;
  const vehicleCostCents = input.vehicleCostCentsPerKm === null ? null : input.vehicleCostCentsPerKm * totalKm;

  const knownCostsCents =
    legs.reduce((sum, leg) => sum + (leg.costCents ?? 0), 0) +
    (input.tollCents ?? 0) +
    input.extraCostsCents +
    (vehicleCostCents ?? 0);

  const params: PriceParams = {
    fixedCostsCents: knownCostsCents,
    deductionsCents: input.deductionsCents,
    commissionBp: input.commissionBp,
    commissionBase: input.commissionBase,
    otherPercentBp: input.otherPercentBp,
  };
  const { commission, result } = resultAt(gross, params);

  const pending: Pending[] = [];
  const add = (code: PendingCode) => pending.push({ code, message: PENDING_MESSAGES[code] });
  if (totalKm === 0) add("DISTANCIA_AUSENTE");
  if (input.legs.some((leg) => leg.km > 0 && !(leg.kmPerLiterCenti !== null && leg.kmPerLiterCenti > 0))) add("CONSUMO_AUSENTE");
  if (legs.some((leg) => leg.km > 0) && !(input.dieselPriceMilli && input.dieselPriceMilli > 0)) add("DIESEL_AUSENTE");
  if (input.tollCents === null) add("PEDAGIO_NAO_CONFERIDO");
  if (input.vehicleCostCentsPerKm === null) add("CUSTO_KM_VEICULO_NAO_INFORMADO");

  const targetPriceCents = minimumPriceCents(params, input.targetMarginBp);
  if (targetPriceCents === null) add("CONFIG_INCOMPATIVEL");
  const breakEvenCents = minimumPriceCents(params, 0);

  let decision: Decision;
  if (gross <= 0) decision = result < 0 ? "prejuizo" : "sem_frete";
  else if (result < 0) decision = "prejuizo";
  else if (result * 10000 >= input.targetMarginBp * gross) decision = "compensa";
  else decision = "abaixo_da_meta";

  return {
    grossFreightCents: gross,
    legs,
    totalKm,
    fuelLitersMilli,
    fuelCostCents,
    knownCostsCents,
    commissionCents: commission,
    resultCents: result,
    marginBp: gross > 0 ? roundDiv(result * 10000, gross) : null,
    revenuePerKmCents: totalKm > 0 ? roundDiv(gross, totalKm) : null,
    resultPerKmCents: totalKm > 0 ? roundDiv(result, totalKm) : null,
    resultPerDayCents: input.durationHours ? roundDiv(result * 24, input.durationHours) : null,
    breakEvenCents,
    targetPriceCents,
    decision,
    complete: pending.length === 0,
    pending,
  };
}
