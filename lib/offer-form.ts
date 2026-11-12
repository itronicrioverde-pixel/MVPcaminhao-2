import type { Leg, OfferInput } from "./offer";

// Leitura dos números como o motorista digita, em português: "6,79", "50.300", "R$ 10.060,00".
// Campo vazio é "desconhecido" (value null), nunca zero. Formato ambíguo é recusado, não adivinhado.

export type Parsed = { value: number | null; error: string | null };

const NOT_A_NUMBER = "Use só números, por exemplo 1.234,56.";
const BLANK: Parsed = { value: null, error: null };
const fail = (error: string): Parsed => ({ value: null, error });

function parseScaled(text: string, decimals: number, dotIsThousands: boolean): Parsed {
  const clean = text.replace(/R\$|%|\s| /g, "");
  if (clean === "") return BLANK;
  if (clean.startsWith("-")) return fail("Não use valor negativo.");
  if (!/^[0-9.,]+$/.test(clean)) return fail(NOT_A_NUMBER);

  let integer: string;
  let fraction = "";
  const commas = clean.split(",").length - 1;
  if (commas > 1) return fail(NOT_A_NUMBER);
  if (commas === 1) {
    const [left, right] = clean.split(",");
    if (right.includes(".")) return fail("Use vírgula para os centavos, por exemplo 1.234,56.");
    if (left.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(left)) return fail(NOT_A_NUMBER);
    integer = left.replace(/\./g, "");
    fraction = right;
  } else if (clean.includes(".")) {
    if (dotIsThousands && /^\d{1,3}(\.\d{3})+$/.test(clean)) {
      integer = clean.replace(/\./g, "");
    } else if (clean.split(".").length === 2) {
      [integer, fraction] = clean.split(".");
    } else {
      return fail(NOT_A_NUMBER);
    }
  } else {
    integer = clean;
  }
  if (integer === "" || !/^\d+$/.test(integer) || (fraction !== "" && !/^\d+$/.test(fraction))) return fail(NOT_A_NUMBER);
  if (fraction.length > decimals) {
    return fail(decimals === 0 ? "Use só números inteiros." : `Use no máximo ${decimals} casa${decimals > 1 ? "s" : ""} depois da vírgula.`);
  }
  const value = Number(integer) * 10 ** decimals + Number(fraction.padEnd(decimals, "0") || "0");
  if (!Number.isSafeInteger(value) || value > 1e13) return fail("Número muito grande.");
  return { value, error: null };
}

/** R$ -> centavos. */
export const parseMoney = (text: string) => parseScaled(text, 2, true);
/** R$/L -> milésimos de real. O ponto é sempre decimal: "6.790" é 6,79. */
export const parsePricePerLiter = (text: string) => parseScaled(text, 3, false);
/** km/L -> centésimos de km/L. */
export const parseConsumption = (text: string) => parseScaled(text, 2, false);
/** % -> pontos-base, até 100%. */
export function parsePercent(text: string): Parsed {
  const parsed = parseScaled(text, 2, false);
  if (parsed.value !== null && parsed.value > 10000) return fail("O percentual não pode passar de 100.");
  return parsed;
}
export const parseKm = (text: string) => parseScaled(text, 0, true);
export const parseWeightKg = (text: string) => parseScaled(text, 0, true);
/** Dias com até uma casa ("1,5") -> horas inteiras, que é como o motor guarda a duração. */
export function parseDays(text: string): Parsed {
  const parsed = parseScaled(text, 1, false);
  if (parsed.value === null) return parsed;
  const hours = Math.round((parsed.value * 24) / 10);
  if (hours < 1) return fail("Informe pelo menos 0,1 dia.");
  return { value: hours, error: null };
}
/** CCD do piso da ANTT, R$/km com até 4 casas -> décimos de milésimo de real. */
export const parseCcd = (text: string) => parseScaled(text, 4, false);
/** Prazo para receber o saldo, em dias. */
export function parseBalanceDays(text: string): Parsed {
  const parsed = parseScaled(text, 0, true);
  if (parsed.value !== null && parsed.value > 3650) return fail("Use até 3.650 dias.");
  return parsed;
}

export type OfferForm = {
  freightMode: "fixed" | "perTon";
  freight: string;
  rate: string;
  weightKg: string;
  kmEmptyTo: string;
  kmLoaded: string;
  kmEmptyBack: string;
  kplEmpty: string;
  kplLoaded: string;
  diesel: string;
  toll: string;
  noToll: boolean;
  tollPayer: "me" | "contractor";
  arlaUse: boolean;
  arlaPct: string;
  arlaPrice: string;
  vehicleKm: string;
  fixedDay: string;
  extras: string;
  commission: string;
  margin: string;
  commissionBase: "gross" | "net";
  discounts: string;
  otherPct: string;
  days: string;
  ccd: string;
  cc: string;
  advance: string;
  balanceDays: string;
  moneyCost: string;
};

export function emptyOfferForm(): OfferForm {
  return {
    freightMode: "fixed", freight: "", rate: "", weightKg: "",
    kmEmptyTo: "", kmLoaded: "", kmEmptyBack: "", kplEmpty: "", kplLoaded: "", diesel: "",
    toll: "", noToll: false, tollPayer: "me", arlaUse: false, arlaPct: "", arlaPrice: "", vehicleKm: "", fixedDay: "", extras: "",
    commission: "", margin: "", commissionBase: "gross", discounts: "", otherPct: "", days: "",
    ccd: "", cc: "", advance: "", balanceDays: "", moneyCost: "",
  };
}

export type BuiltOffer = {
  input: OfferInput | null;
  errors: Partial<Record<keyof OfferForm, string>>;
  /** Sem margem alvo informada o motor considera 0%: só avisa se há prejuízo. */
  marginMissing: boolean;
};

export function buildOfferInput(form: OfferForm): BuiltOffer {
  const errors: BuiltOffer["errors"] = {};
  const read = (field: keyof OfferForm, parser: (text: string) => Parsed) => {
    const parsed = parser(String(form[field]));
    if (parsed.error) errors[field] = parsed.error;
    return parsed.value;
  };

  const freightFixed = form.freightMode === "fixed" ? read("freight", parseMoney) : null;
  const rate = form.freightMode === "perTon" ? read("rate", parseMoney) : null;
  const weightKg = form.freightMode === "perTon" ? read("weightKg", parseWeightKg) : null;
  const kmEmptyTo = read("kmEmptyTo", parseKm);
  const kmLoaded = read("kmLoaded", parseKm);
  const kmEmptyBack = read("kmEmptyBack", parseKm);
  const kplEmpty = read("kplEmpty", parseConsumption);
  const kplLoaded = read("kplLoaded", parseConsumption);
  const diesel = read("diesel", parsePricePerLiter);
  const toll = form.noToll ? 0 : read("toll", parseMoney);
  const vehicleKm = read("vehicleKm", parseMoney);
  const fixedDay = read("fixedDay", parseMoney);
  const arlaPct = form.arlaUse ? read("arlaPct", parsePercent) : null;
  const arlaPrice = form.arlaUse ? read("arlaPrice", parsePricePerLiter) : null;
  const extras = read("extras", parseMoney);
  const commission = read("commission", parsePercent);
  const margin = read("margin", parsePercent);
  const discounts = read("discounts", parseMoney);
  const otherPct = read("otherPct", parsePercent);
  const hours = read("days", parseDays);
  const ccd = read("ccd", parseCcd);
  const cc = read("cc", parseMoney);
  if (ccd !== null && cc === null && !errors.cc) errors.cc = "Informe o CC junto com o CCD.";
  if (cc !== null && ccd === null && !errors.ccd) errors.ccd = "Informe o CCD junto com o CC.";
  const advance = read("advance", parsePercent);
  const balanceDays = read("balanceDays", parseBalanceDays);
  const moneyCost = read("moneyCost", parsePercent);

  if (Object.keys(errors).length > 0) return { input: null, errors, marginMissing: margin === null };

  const legs: Leg[] = [
    { kind: "empty", km: kmEmptyTo ?? 0, kmPerLiterCenti: kplEmpty },
    { kind: "loaded", km: kmLoaded ?? 0, kmPerLiterCenti: kplLoaded },
    { kind: "empty", km: kmEmptyBack ?? 0, kmPerLiterCenti: kplEmpty },
  ];
  const input: OfferInput = {
    freight: form.freightMode === "fixed"
      ? { kind: "fixed", cents: freightFixed ?? 0 }
      : { kind: "perTon", rateCentsPerTon: rate ?? 0, weightKg: weightKg ?? 0 },
    legs,
    dieselPriceMilli: diesel,
    tollPayer: form.tollPayer,
    tollCents: toll,
    arla: form.arlaUse ? { percentOfDieselBp: arlaPct, priceMilli: arlaPrice } : null,
    extraCostsCents: extras ?? 0,
    vehicleCostCentsPerKm: vehicleKm,
    fixedCostPerDayCents: fixedDay,
    deductionsCents: discounts ?? 0,
    commissionBp: commission ?? 0,
    commissionBase: form.commissionBase,
    otherPercentBp: otherPct ?? 0,
    targetMarginBp: margin ?? 0,
    durationHours: hours,
    floor: ccd !== null && cc !== null ? { ccdE4: ccd, ccCents: cc } : null,
    advanceBp: advance ?? 0,
    balanceDays,
    moneyCostMonthlyBp: moneyCost ?? 0,
  };
  return { input, errors, marginMissing: margin === null };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const liters = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatBRL(cents: number) {
  return brl.format(cents / 100);
}

export function formatBp(bp: number | null) {
  return bp === null ? "—" : `${decimal.format(bp / 100)}%`;
}

export function formatLiters(milli: number | null) {
  return milli === null ? "—" : `${liters.format(milli / 1000)} L`;
}
